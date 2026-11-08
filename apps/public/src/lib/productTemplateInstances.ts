import { NextRequest, NextResponse } from 'next/server';
import { canonicalProductTemplateDesign, mergeBackyTemplateInstance, withProductTemplateDesign, type BackyTemplateInstanceOutcome, type Site } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug, getCollectionByIdOrSlug, listCollectionRecords, getCollectionRecordByIdOrSlug, updateAdminCollectionRecord } from './backyStore';
import { shouldUseDemoStoreFallback, getRequiredDatabaseRepositories } from './repositoryRuntime';
import { collectCompleteExportPages, CollectionExportIncompleteError } from './collectionExportPagination';
import { getRetainedTemplateRevision } from './templateHistory';
import { buildFrontendTemplateInstanceBaseline } from './frontendDesignContract';
import { pinTemplateInstance, isValidProductTemplateInstancePin, templateInstanceFingerprint, assertTemplateInstanceContentSafe } from './templateInstanceProvenance';
import { deliverSiteWebhooks } from './siteWebhookDelivery';
import { recordAdminAudit } from './adminAudit';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
import { syncRepositoryCollectionRecordMediaReferences } from './repositoryMediaReferenceSync';
import { collectionRecordVersion } from './collectionRecordVersion';
const headers = { 'cache-control': 'private, no-store' };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (status: number, code: string, requestId: string) => NextResponse.json({ success: false, requestId, error: { code, message: code === 'TEMPLATE_INSTANCE_REVIEW_STALE' ? 'The product or template changed. Review again; no upgrade was applied.' : 'The guarded product template operation could not complete.' } }, { status, headers });
const key = (item: any) => `${item.collectionId}:${item.id}`;
export async function handleProductTemplateInstances(request: NextRequest, context: { params: Promise<{siteId: string; templateId: string}> }) {
 const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
 const permissions = ['collections.view', 'commerce.view'];
 const access = await requireAdminAccess(request, requestId, { permissions, recordUsage: false });
 if (access instanceof NextResponse) return access;
 try {
  const raw = await request.text(); if (Buffer.byteLength(raw) > 65536) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  const body = JSON.parse(raw);
  if (!object(body) || Object.keys(body).some(k => !['targetType','action','targetRevisionId','selection','reviewVersion'].includes(k)) || body.targetType !== 'product'
   || !['review','apply'].includes(body.action) || typeof body.targetRevisionId !== 'string' || !/^(?:template_revision_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.targetRevisionId)
   || !Array.isArray(body.selection) || body.selection.length > 200 || body.selection.some((item: any) => !object(item) || Object.keys(item).some(k => !['type','id','collectionId'].includes(k)) || item.type !== 'product' || typeof item.id !== 'string' || !item.id || item.id.length > 128 || typeof item.collectionId !== 'string' || !item.collectionId || item.collectionId.length > 128)
   || new Set(body.selection.map(key)).size !== body.selection.length) return error(400, 'INVALID_TEMPLATE_INSTANCE_REQUEST', requestId);
  let actorId: string | undefined;
  if (body.action === 'apply') {
   permissions.push('collections.edit', 'commerce.edit');
   const edit = await requireAdminAccess(request, requestId, { permissions }); if (edit instanceof NextResponse) return edit; actorId = edit.session?.user.id;
   if (typeof body.reviewVersion !== 'string' || !/^template-instances-v1:[a-f0-9]{64}$/.test(body.reviewVersion)) return error(400, 'TEMPLATE_INSTANCE_REVIEW_REQUIRED', requestId);
  }
  const { siteId, templateId } = await context.params;
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = (repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId)) as Site | null;
  if (!site) return error(404, 'SITE_NOT_FOUND', requestId);
  const revision = await getRetainedTemplateRevision(site.id, templateId, repositories ? body.targetRevisionId.replace(/^template_revision_/, "") : body.targetRevisionId);
  if (!revision || revision.siteId !== site.id || revision.templateId !== templateId || revision.snapshot.id !== templateId || revision.fingerprint !== templateInstanceFingerprint(revision.snapshot)) return error(404, 'TEMPLATE_REVISION_NOT_FOUND', requestId);
  if (revision.snapshot.type !== 'product') return error(422, 'TEMPLATE_INSTANCE_TYPE_UNSUPPORTED', requestId);
  const collection = repositories ? await repositories.collections.getBySlug(site.id, 'products') : getCollectionByIdOrSlug(site.id, 'products', { includeUnpublished: true });
  const records = collection ? await collectCompleteExportPages(async options => {
   const result = repositories ? await repositories.collections.listRecords({ siteId: site.id, collectionId: collection.id, includeUnpublished: true, ...options }) : (() => { const result = listCollectionRecords(site.id, collection.id, { includeUnpublished: true, ...options }); return { items: result.records, pagination: result.pagination }; })();
   if (!result.pagination || result.pagination.total > 100000) throw new CollectionExportIncompleteError(); return result;
  }, (item: any) => item.siteId === site.id && item.collectionId === collection.id) : [];
  let bytes = 0;
  const plans = records.filter(record => record.values.frontendTemplateInstance && (record.values.frontendTemplateInstance as any).templateId === templateId || record.values.frontendDesignTemplateId === templateId || canonicalProductTemplateDesign(record.values).templateId === templateId).map(record => {
   bytes += Buffer.byteLength(JSON.stringify({ design: canonicalProductTemplateDesign(record.values), pin: record.values.frontendTemplateInstance }));
   if (bytes > 64 * 1024 * 1024) throw Error('TEMPLATE_INSTANCE_LIMIT');
   const pin = record.values.frontendTemplateInstance;
   const summary = { type: 'product' as const, id: record.id, collectionId: record.collectionId, title: String(record.values.name || record.values.title || record.slug), status: record.status, pinnedFingerprint: object(pin) && typeof pin.templateFingerprint === 'string' && /^[a-f0-9]{64}$/.test(pin.templateFingerprint) ? pin.templateFingerprint : null,
    contentFingerprint: templateInstanceFingerprint(record), changedPaths: [] as string[], conflicts: [] as any[], state: 'blocked' as 'blocked'|'ready'|'current' };
   if (!isValidProductTemplateInstancePin(pin) || pin.templateId !== templateId) { summary.conflicts = [{ path: '/values/frontendTemplateInstance', code: pin ? 'INVALID_PROVENANCE' : 'UNPINNED_INSTANCE' }]; return { record, summary }; }
   const target = pinTemplateInstance(revision.snapshot, buildFrontendTemplateInstanceBaseline(site.settings.frontendDesign!, revision.snapshot, 'product'), 'product');
   const authored = canonicalProductTemplateDesign(record.values); assertTemplateInstanceContentSafe(authored);
   const merged = mergeBackyTemplateInstance(pin.baseContent, authored, target.baseContent);
   summary.changedPaths = merged.changedPaths; summary.conflicts = merged.conflicts;
   summary.state = merged.conflicts.length ? 'blocked' : pin.templateFingerprint === revision.fingerprint && !merged.changedPaths.length ? 'current' : 'ready';
   return { record, summary, values: withProductTemplateDesign(record.values, merged.content, target) };
  });
  if (plans.length > 2000) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  const selected = plans.filter(plan => body.selection.some((item: any) => key(item) === key(plan.summary)));
  if (selected.length !== body.selection.length) return error(400, 'INVALID_TEMPLATE_INSTANCE_SELECTION', requestId);
  const reviewVersion = 'template-instances-v1:' + templateInstanceFingerprint({ siteId: site.id, templateId, revision, collection, design: site.settings.frontendDesign, selection: body.selection, targets: plans.map(plan => plan.summary) });
  const data: BackyTemplateInstanceOutcome = { action: body.action, siteId: site.id, templateId, targetRevisionId: revision.id, targetFingerprint: revision.fingerprint, reviewVersion, targets: plans.map(plan => plan.summary), canApply: selected.length > 0 && selected.every(plan => plan.summary.state !== 'blocked'), scanned: { pages: 0, posts: 0, products: records.length }, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: repositories ? 'database-per-document-row-lock' : 'demo-single-process' };
  if (body.action === 'review') { const admitted = await requireAdminAccess(request, requestId, { permissions }); if (admitted instanceof NextResponse) return admitted; }
  if (body.action === 'review') return NextResponse.json({ success: true, requestId, data }, { headers });
  if (body.reviewVersion !== reviewVersion) return error(409, 'TEMPLATE_INSTANCE_REVIEW_STALE', requestId);
  if (!data.canApply) return error(422, 'TEMPLATE_INSTANCE_CONFLICT', requestId);
  if (repositories && (!repositories.collections.withRecordWriteLock || !repositories.collections.getProductDesignRevision)) return error(503, 'TEMPLATE_INSTANCE_WRITE_UNAVAILABLE', requestId);
  for (const plan of selected) {
   if (plan.summary.state === 'current') continue;
   try {
    const input: any = { values: plan.values, expectedRecord: plan.record, beforeUpdateProductDesignRevision: { operation: 'template-upgrade', templateId, targetRevisionId: revision.id, actorId, requestId } };
    if (repositories) await repositories.collections.withRecordWriteLock(site.id, plan.record.collectionId, async (repository, lockedCollection, admission) => {
     if (lockedCollection.slug !== 'products') throw Object.assign(Error('Reload'), { code: 'COLLECTION_RECORD_CONFLICT' });
     const saved = await repository.updateRecord(site.id, plan.record.collectionId, plan.record.id, input);
     if (!saved.item) throw Error('PRODUCT_DESIGN_WRITE_UNAVAILABLE');
     await syncRepositoryCollectionRecordMediaReferences({ mediaRepository: admission.media as import("@backy-cms/core").BackyMediaRepository, siteId: site.id, collectionId: plan.record.collectionId, recordId: plan.record.id, values: saved.item.values });
    });
    else if (!updateAdminCollectionRecord(site.id, plan.record.collectionId, plan.record.id, input)) throw Error('PRODUCT_DESIGN_WRITE_UNAVAILABLE');
    data.appliedTargets.push({ type: 'product', id: plan.record.id, collectionId: plan.record.collectionId });
    try { await recordAdminAudit({ repositories, siteId: site.id, actorId, entity: 'collectionRecord', entityId: plan.record.id, action: 'frontendDesign.templateInstanceUpgrade', metadata: { templateId, targetRevisionId: revision.id, collectionId: plan.record.collectionId }, requestId }); } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_AUDIT_PENDING'); }
   } catch (cause: any) { data.failedTargets.push({ type: 'product', id: plan.record.id, collectionId: plan.record.collectionId, code: /CONFLICT/.test(cause?.code || '') ? 'CONTENT_CONFLICT' : 'WRITE_FAILED' }); }
  }
  if (!data.appliedTargets.length && data.failedTargets.some(item => item.code === 'CONTENT_CONFLICT')) return error(409, 'TEMPLATE_INSTANCE_REVIEW_STALE', requestId);
  if (repositories && data.appliedTargets.length) try { await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'content', entity: 'site', entityId: site.id, reason: 'template-instance-upgrade', requestId }); } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_CACHE_PENDING'); }
  if (data.appliedTargets.length) try {
   const deliveries = await deliverSiteWebhooks({repositories,site,kind:'site-updated',requestId,actor:actorId,reason:'frontendDesign.templateInstanceUpgrade',data:{resourceType:'productTemplateInstanceUpgrade',templateId,targetRevisionId:revision.id,appliedTargets:data.appliedTargets},metadata:{action:'frontendDesign.templateInstanceUpgrade',source:'admin-template-instance-upgrade-api',changedKeys:['values.design','values.frontendTemplateInstance'],resourceType:'template',resourceId:templateId}});
   if(deliveries.some(delivery=>delivery.status==='failed')) data.completionWarnings.push('TEMPLATE_INSTANCE_WEBHOOK_PENDING');
  } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_WEBHOOK_PENDING'); }
  data.completionWarnings = [...new Set(data.completionWarnings)]; data.outcome = data.failedTargets.length || data.completionWarnings.length ? 'partial' : 'complete'; data.canApply = false;
  return NextResponse.json({ success: true, requestId, data }, { headers });
 } catch (cause) {
  if (cause instanceof SyntaxError) return error(400, 'INVALID_TEMPLATE_INSTANCE_REQUEST', requestId);
  if (cause instanceof CollectionExportIncompleteError) return error(503, 'TEMPLATE_INSTANCE_INVENTORY_INCOMPLETE', requestId);
  if (cause instanceof Error && /LIMIT/.test(cause.message)) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  if (cause instanceof Error && /UNSAFE|INVALID/.test(cause.message)) return error(422, 'TEMPLATE_INSTANCE_CONTENT_UNSUPPORTED', requestId);
  return error(500, 'INTERNAL_SERVER_ERROR', requestId);
 }
}
