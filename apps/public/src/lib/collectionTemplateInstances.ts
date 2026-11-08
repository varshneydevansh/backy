import { NextRequest, NextResponse } from 'next/server';
import { canonicalCollectionTemplateDesign, collectionTemplateDesignFields, collectionTemplateSchemaConflicts, collectionTemplatePolicyConflicts, collectionTemplateBindingConflicts, mergeBackyTemplateInstance, withCollectionTemplateDesign, type BackyTemplateInstanceOutcome, type BackyCollection, type Site, type BackyTemplateRevision, type BackyCollectionTemplateDesign } from '@backy-cms/core';
import { requireCommerceCollectionAccess, commerceCollectionPermissions } from './adminCommerceCollectionAccess';
import { requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug, listCollections, updateAdminCollection } from './backyStore';
import { shouldUseDemoStoreFallback, getRequiredDatabaseRepositories } from './repositoryRuntime';
import { collectCompleteExportPages, CollectionExportIncompleteError } from './collectionExportPagination';
import { getRetainedTemplateRevision } from './templateHistory';
import { buildFrontendCollectionTemplateBaseline } from './frontendDesignContract';
import { pinTemplateInstance, isValidCollectionTemplateInstancePin, templateInstanceFingerprint, assertTemplateInstanceContentSafe } from './templateInstanceProvenance';
import { collectionDefinitionVersion } from './collectionDefinitionVersion';
import { recordAdminAudit } from './adminAudit';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
import { syncCollectionTemplateMediaReferences } from './collectionTemplateMediaReferences';

const headers = { 'cache-control': 'private, no-store' };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (status: number, code: string, requestId: string) => NextResponse.json({ success: false, requestId, error: { code, message: code === 'TEMPLATE_INSTANCE_REVIEW_STALE' ? 'The collection or template changed. Review again; no upgrade was applied.' : 'The guarded collection template operation could not complete.' } }, { status, headers });
export function planCollectionTemplateInstance(collection: BackyCollection, site: Site, revision: BackyTemplateRevision) {
 const pin = collection.metadata?.frontendTemplateInstance;
 const validPin = isValidCollectionTemplateInstancePin(pin) && pin.templateId === revision.templateId;
 const summary = { type: 'collection' as const, id: collection.id, title: collection.name, status: collection.status, pinnedFingerprint: validPin ? pin.templateFingerprint : null,
  contentFingerprint: templateInstanceFingerprint(collection), changedPaths: [] as string[], conflicts: [] as any[], state: 'blocked' as 'blocked'|'ready'|'current' };
 if (!validPin) { summary.conflicts = [{ path: '/metadata/frontendTemplateInstance', code: pin ? 'INVALID_PROVENANCE' : 'UNPINNED_INSTANCE' }]; return { collection, summary }; }
 if (!site.settings.frontendDesign) throw Error('TEMPLATE_INSTANCE_UNAVAILABLE');
 const baseline = buildFrontendCollectionTemplateBaseline(site.settings.frontendDesign, revision.snapshot);
 const target = pinTemplateInstance(revision.snapshot, baseline, 'collection');
 const policyPaths=collectionTemplatePolicyConflicts((pin.baseContent as unknown as BackyCollectionTemplateDesign).templatePolicy,baseline.templatePolicy);
 if(policyPaths.length){summary.conflicts=policyPaths.map(path=>({path,code:'SCHEMA_INCOMPATIBLE'}));return {collection,summary};}
 const schemaConflicts = collectionTemplateSchemaConflicts(collectionTemplateDesignFields(pin.baseContent as unknown as BackyCollectionTemplateDesign), collectionTemplateDesignFields(baseline));
 if (schemaConflicts.length) { summary.conflicts = schemaConflicts.map(path => ({ path, code: 'SCHEMA_INCOMPATIBLE' })); return { collection, summary }; }
 const authored = canonicalCollectionTemplateDesign(collection);
 assertTemplateInstanceContentSafe(authored);
 const merged = mergeBackyTemplateInstance(pin.baseContent, authored as unknown as Record<string, unknown>, target.baseContent);
 const design = merged.content as unknown as BackyCollectionTemplateDesign;
 summary.changedPaths = merged.changedPaths;
 summary.conflicts = [...merged.conflicts, ...collectionTemplateSchemaConflicts(collection.fields, collectionTemplateDesignFields(design)).map(path => ({ path, code: 'SCHEMA_INCOMPATIBLE' })), ...collectionTemplateBindingConflicts(authored, design).map(path => ({ path, code: 'SCHEMA_INCOMPATIBLE' }))].slice(0, 64);
 summary.state = summary.conflicts.length ? 'blocked' : pin.templateFingerprint === revision.fingerprint && !merged.changedPaths.length ? 'current' : 'ready';
 return { collection, summary, input: summary.conflicts.length ? undefined : withCollectionTemplateDesign(collection, design, target) };
}
export async function handleCollectionTemplateInstances(request: NextRequest, context: { params: Promise<{ siteId: string; templateId: string }> }) {
 const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
 const access = await requireAdminAccess(request, requestId, { permission: 'collections.view', recordUsage: false }); if (access instanceof NextResponse) return access;
 try {
  const raw = await request.text(); if (Buffer.byteLength(raw) > 65536) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  const body = JSON.parse(raw);
  if (!object(body) || Object.keys(body).some(key => !['targetType', 'action', 'targetRevisionId', 'selection', 'reviewVersion'].includes(key)) || body.targetType !== 'collection'
   || !['review', 'apply'].includes(body.action) || typeof body.targetRevisionId !== 'string' || !/^(?:template_revision_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.targetRevisionId)
   || !Array.isArray(body.selection) || body.selection.length > 200 || body.selection.some((item: any) => !object(item) || Object.keys(item).some(key => !['type', 'id'].includes(key)) || item.type !== 'collection' || typeof item.id !== 'string' || !item.id || item.id.length > 128)
   || new Set(body.selection.map((item: any) => item.id)).size !== body.selection.length) return error(400, 'INVALID_TEMPLATE_INSTANCE_REQUEST', requestId);
  const permissions = ['collections.view', ...(body.action === 'apply' ? ['collections.edit'] : [])];
  let actorId = access.session?.user.id;
  if (body.action === 'apply') {
   const edit = await requireAdminAccess(request, requestId, { permissions, recordUsage: false }); if (edit instanceof NextResponse) return edit; actorId = edit.session?.user.id;
   if (typeof body.reviewVersion !== 'string' || !/^template-collection-instances-v1:[a-f0-9]{64}$/.test(body.reviewVersion)) return error(400, 'TEMPLATE_INSTANCE_REVIEW_REQUIRED', requestId);
  }
  const { siteId, templateId } = await context.params;
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = (repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId)) as Site | null;
  if (!site) return error(404, 'SITE_NOT_FOUND', requestId);
  const revision = await getRetainedTemplateRevision(site.id, templateId, repositories ? body.targetRevisionId.replace(/^template_revision_/, '') : body.targetRevisionId);
  if (!revision || revision.siteId !== site.id || revision.templateId !== templateId || revision.snapshot.id !== templateId || revision.fingerprint !== templateInstanceFingerprint(revision.snapshot)) return error(404, 'TEMPLATE_REVISION_NOT_FOUND', requestId);
  if (revision.snapshot.type !== 'collection') return error(422, 'TEMPLATE_INSTANCE_TYPE_UNSUPPORTED', requestId);
  const collections = repositories ? await collectCompleteExportPages(options => repositories.collections.list({ siteId: site.id, ...options,includeUnpublished:true,status:'all' }), (collection: BackyCollection) => collection.siteId === site.id) : listCollections(site.id,{includeUnpublished:true}) as unknown as BackyCollection[];
  if (collections.length > 100000 || collections.some(collection => collection.siteId !== site.id) || new Set(collections.map(collection => collection.id)).size !== collections.length) throw new CollectionExportIncompleteError();
  let bytes = 0;
  const plans = collections.filter(collection => (collection.metadata?.frontendTemplateInstance as any)?.templateId === templateId || collection.metadata?.frontendDesignTemplateId === templateId).map(collection => {
   bytes += Buffer.byteLength(JSON.stringify({ design: canonicalCollectionTemplateDesign(collection), pin: collection.metadata?.frontendTemplateInstance }));
   if (bytes > 64 * 1024 * 1024) throw Error('TEMPLATE_INSTANCE_LIMIT');
   return planCollectionTemplateInstance(collection, site, revision);
  });
  if (plans.length > 2000) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  for(const plan of plans){const denied=await requireCommerceCollectionAccess(request,requestId,plan.collection.slug,'view',{recordUsage:false});if(denied)return denied;}
  const selected = plans.filter(plan => body.selection.some((item: any) => item.id === plan.collection.id));
  if (selected.length !== body.selection.length) return error(400, 'INVALID_TEMPLATE_INSTANCE_SELECTION', requestId);
  const reviewVersion = 'template-collection-instances-v1:' + templateInstanceFingerprint({ siteId: site.id, templateId, revision, design: site.settings.frontendDesign, selection: body.selection, targets: plans.map(plan => plan.summary) });
  const data: BackyTemplateInstanceOutcome = { action: body.action, siteId: site.id, templateId, targetRevisionId: revision.id, targetFingerprint: revision.fingerprint, reviewVersion, targets: plans.map(plan => plan.summary), canApply: selected.length > 0 && selected.every(plan => plan.summary.state !== 'blocked'), scanned: { pages: 0, posts: 0, collections: collections.length }, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: repositories ? 'database-per-document-row-lock' : 'demo-single-process' };
  if(body.action==='apply')for(const plan of selected){const denied=await requireCommerceCollectionAccess(request,requestId,plan.collection.slug,'configure',{recordUsage:false});if(denied)return denied;}
  const requiredCommercePermissions = [
   ...plans.flatMap(plan => commerceCollectionPermissions(plan.collection.slug, ['view'])),
   ...(body.action === 'apply' ? selected.flatMap(plan => commerceCollectionPermissions(plan.collection.slug, ['configure'])) : []),
  ];
  const admitted = await requireAdminAccess(request, requestId, { permissions: [...permissions, ...requiredCommercePermissions] });
  if (admitted instanceof NextResponse) return admitted;
  actorId = admitted.session?.user.id;
  if (body.action === 'review') return NextResponse.json({ success: true, requestId, data }, { headers });
  if (body.reviewVersion !== reviewVersion) return error(409, 'TEMPLATE_INSTANCE_REVIEW_STALE', requestId);
  if (!data.canApply) return error(422, 'TEMPLATE_INSTANCE_CONFLICT', requestId);
  if (repositories && (!repositories.collections.withDefinitionWriteLock || !repositories.collections.getCollectionDesignRevision)) return error(503, 'TEMPLATE_INSTANCE_WRITE_UNAVAILABLE', requestId);
  for (const plan of selected) {
   if (plan.summary.state === 'current') continue;
   try {
    const input = { ...plan.input, expectedCollection: plan.collection, beforeUpdateCollectionDesignRevision: { operation: 'template-upgrade' as const, templateId, targetRevisionId: revision.id, actorId, requestId } };
    if (repositories) await repositories.collections.withDefinitionWriteLock!(site.id, plan.collection.id, async (writer, locked, scoped) => {
     const lockedSite = await scoped.sites.getById(site.id);
     if (!lockedSite || collectionDefinitionVersion(locked) !== collectionDefinitionVersion(plan.collection) || templateInstanceFingerprint(lockedSite.settings.frontendDesign) !== templateInstanceFingerprint(site.settings.frontendDesign)) throw Object.assign(Error('The collection changed.'), { code: 'COLLECTION_DEFINITION_CONFLICT' });
     const saved = await writer.update(site.id, plan.collection.id, input);
     await syncCollectionTemplateMediaReferences(scoped.media, saved.item);
    });
    else if (!updateAdminCollection(site.id, plan.collection.id, input)) throw Error('COLLECTION_DEFINITION_WRITE_UNAVAILABLE');
    data.appliedTargets.push({ type: 'collection', id: plan.collection.id });
    try { await recordAdminAudit({ repositories, siteId: site.id, actorId, entity: 'collection', entityId: plan.collection.id, action: 'frontendDesign.templateInstanceUpgrade', metadata: { templateId, targetRevisionId: revision.id }, requestId }); } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_AUDIT_PENDING'); }
   } catch (cause: any) { data.failedTargets.push({ type: 'collection', id: plan.collection.id, code: cause?.code === 'COLLECTION_DEFINITION_CONFLICT' ? 'CONTENT_CONFLICT' : 'WRITE_FAILED' }); }
  }
  if (!data.appliedTargets.length && data.failedTargets.some(item => item.code === 'CONTENT_CONFLICT')) return error(409, 'TEMPLATE_INSTANCE_REVIEW_STALE', requestId);
  if (repositories && data.appliedTargets.length) try { await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'content', entity: 'site', entityId: site.id, reason: 'collection-template-instance-upgrade', requestId }); } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_CACHE_PENDING'); }
  data.completionWarnings = [...new Set(data.completionWarnings)]; data.outcome = data.failedTargets.length || data.completionWarnings.length ? 'partial' : 'complete'; data.canApply = false;
  return NextResponse.json({ success: true, requestId, data }, { headers });
 } catch (cause: any) {
  if (cause instanceof SyntaxError) return error(400, 'INVALID_TEMPLATE_INSTANCE_REQUEST', requestId);
  if (cause instanceof CollectionExportIncompleteError) return error(503, 'TEMPLATE_INSTANCE_INVENTORY_INCOMPLETE', requestId);
  if (/LIMIT/.test(cause?.message || '')) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  if (/UNSAFE|INVALID|INCOMPATIBLE/.test(cause?.message || '')) return error(422, 'TEMPLATE_INSTANCE_CONTENT_UNSUPPORTED', requestId);
  return error(503, 'TEMPLATE_INSTANCE_WRITE_UNAVAILABLE', requestId);
 }
}
