import { NextRequest, NextResponse } from 'next/server';
import { canonicalFormTemplateDesign, formTemplateDesignFields, formTemplateSchemaConflicts, formTemplateBindingConflicts, mergeBackyTemplateInstance, withFormTemplateDesign, type BackyTemplateInstanceOutcome, type FormDefinition, type Site, type BackyTemplateRevision, type BackyFormTemplateDesign } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug, listFormsBySite, updateAdminForm } from './backyStore';
import { shouldUseDemoStoreFallback, getRequiredDatabaseRepositories } from './repositoryRuntime';
import { collectCompleteExportPages, CollectionExportIncompleteError } from './collectionExportPagination';
import { getRetainedTemplateRevision } from './templateHistory';
import { buildFrontendFormTemplateBaseline } from './frontendDesignContract';
import { pinTemplateInstance, isValidFormTemplateInstancePin, templateInstanceFingerprint, assertTemplateInstanceContentSafe } from './templateInstanceProvenance';
import { formDefinitionVersion } from './formDefinitionVersion';
import { recordAdminAudit } from './adminAudit';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
import { syncFormTemplateMediaReferences } from './formTemplateMediaReferences';

const headers = { 'cache-control': 'private, no-store' };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (status: number, code: string, requestId: string) => NextResponse.json({ success: false, requestId, error: { code, message: code === 'TEMPLATE_INSTANCE_REVIEW_STALE' ? 'The form or template changed. Review again; no upgrade was applied.' : 'The guarded form template operation could not complete.' } }, { status, headers });
export function planFormTemplateInstance(form: FormDefinition, site: Site, revision: BackyTemplateRevision) {
 const pin = form.settings?.frontendTemplateInstance;
 const validPin = isValidFormTemplateInstancePin(pin) && pin.templateId === revision.templateId;
 const summary = { type: 'form' as const, id: form.id, title: form.title || form.name, status: form.isActive ? 'active' : 'inactive', pinnedFingerprint: validPin ? pin.templateFingerprint : null,
  contentFingerprint: templateInstanceFingerprint(form), changedPaths: [] as string[], conflicts: [] as any[], state: 'blocked' as 'blocked'|'ready'|'current' };
 if (!validPin) { summary.conflicts = [{ path: '/settings/frontendTemplateInstance', code: pin ? 'INVALID_PROVENANCE' : 'UNPINNED_INSTANCE' }]; return { form, summary }; }
 if (!site.settings.frontendDesign) throw Error('TEMPLATE_INSTANCE_UNAVAILABLE');
 const baseline = buildFrontendFormTemplateBaseline(site.settings.frontendDesign, revision.snapshot);
 const target = pinTemplateInstance(revision.snapshot, baseline, 'form');
 const schemaConflicts = formTemplateSchemaConflicts(formTemplateDesignFields(pin.baseContent as unknown as BackyFormTemplateDesign), formTemplateDesignFields(baseline));
 if (schemaConflicts.length) { summary.conflicts = schemaConflicts.map(path => ({ path, code: 'SCHEMA_INCOMPATIBLE' })); return { form, summary }; }
 const authored = canonicalFormTemplateDesign(form);
 assertTemplateInstanceContentSafe(authored);
 const merged = mergeBackyTemplateInstance(pin.baseContent, authored as unknown as Record<string, unknown>, target.baseContent);
 const design = merged.content as unknown as BackyFormTemplateDesign;
 summary.changedPaths = merged.changedPaths;
 summary.conflicts = [...merged.conflicts, ...formTemplateSchemaConflicts(form.fields, formTemplateDesignFields(design)).map(path => ({ path, code: 'SCHEMA_INCOMPATIBLE' })), ...formTemplateBindingConflicts(authored, design).map(path => ({ path, code: 'SCHEMA_INCOMPATIBLE' }))].slice(0, 64);
 summary.state = summary.conflicts.length ? 'blocked' : pin.templateFingerprint === revision.fingerprint && !merged.changedPaths.length ? 'current' : 'ready';
 return { form, summary, input: summary.conflicts.length ? undefined : withFormTemplateDesign(form, design, target) };
}
export async function handleFormTemplateInstances(request: NextRequest, context: { params: Promise<{ siteId: string; templateId: string }> }) {
 const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.view', recordUsage: false }); if (access instanceof NextResponse) return access;
 try {
  const raw = await request.text(); if (Buffer.byteLength(raw) > 65536) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  const body = JSON.parse(raw);
  if (!object(body) || Object.keys(body).some(key => !['targetType', 'action', 'targetRevisionId', 'selection', 'reviewVersion'].includes(key)) || body.targetType !== 'form'
   || !['review', 'apply'].includes(body.action) || typeof body.targetRevisionId !== 'string' || !/^(?:template_revision_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.targetRevisionId)
   || !Array.isArray(body.selection) || body.selection.length > 200 || body.selection.some((item: any) => !object(item) || Object.keys(item).some(key => !['type', 'id'].includes(key)) || item.type !== 'form' || typeof item.id !== 'string' || !item.id || item.id.length > 128)
   || new Set(body.selection.map((item: any) => item.id)).size !== body.selection.length) return error(400, 'INVALID_TEMPLATE_INSTANCE_REQUEST', requestId);
  const permissions = ['forms.view', ...(body.action === 'apply' ? ['forms.edit'] : [])];
  const admitted = await requireAdminAccess(request, requestId, { permissions }); if (admitted instanceof NextResponse) return admitted;
  const actorId = admitted.session?.user.id;
  if (body.action === 'apply') {
   if (typeof body.reviewVersion !== 'string' || !/^template-form-instances-v1:[a-f0-9]{64}$/.test(body.reviewVersion)) return error(400, 'TEMPLATE_INSTANCE_REVIEW_REQUIRED', requestId);
  }
  const { siteId, templateId } = await context.params;
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = (repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId)) as Site | null;
  if (!site) return error(404, 'SITE_NOT_FOUND', requestId);
  const revision = await getRetainedTemplateRevision(site.id, templateId, repositories ? body.targetRevisionId.replace(/^template_revision_/, '') : body.targetRevisionId);
  if (!revision || revision.siteId !== site.id || revision.templateId !== templateId || revision.snapshot.id !== templateId || revision.fingerprint !== templateInstanceFingerprint(revision.snapshot)) return error(404, 'TEMPLATE_REVISION_NOT_FOUND', requestId);
  if (revision.snapshot.type !== 'form') return error(422, 'TEMPLATE_INSTANCE_TYPE_UNSUPPORTED', requestId);
  const forms = repositories ? await collectCompleteExportPages(options => repositories.forms.list({ siteId: site.id, ...options }), (form: FormDefinition) => form.siteId === site.id) : listFormsBySite(site.id);
  if (forms.length > 100000 || forms.some(form => form.siteId !== site.id) || new Set(forms.map(form => form.id)).size !== forms.length) throw new CollectionExportIncompleteError();
  let bytes = 0;
  const plans = forms.filter(form => (form.settings?.frontendTemplateInstance as any)?.templateId === templateId || form.settings?.frontendDesignTemplateId === templateId).map(form => {
   bytes += Buffer.byteLength(JSON.stringify({ design: canonicalFormTemplateDesign(form), pin: form.settings?.frontendTemplateInstance }));
   if (bytes > 64 * 1024 * 1024) throw Error('TEMPLATE_INSTANCE_LIMIT');
   return planFormTemplateInstance(form, site, revision);
  });
  if (plans.length > 2000) return error(413, 'TEMPLATE_INSTANCE_LIMIT', requestId);
  const selected = plans.filter(plan => body.selection.some((item: any) => item.id === plan.form.id));
  if (selected.length !== body.selection.length) return error(400, 'INVALID_TEMPLATE_INSTANCE_SELECTION', requestId);
  const reviewVersion = 'template-form-instances-v1:' + templateInstanceFingerprint({ siteId: site.id, templateId, revision, design: site.settings.frontendDesign, selection: body.selection, targets: plans.map(plan => plan.summary) });
  const data: BackyTemplateInstanceOutcome = { action: body.action, siteId: site.id, templateId, targetRevisionId: revision.id, targetFingerprint: revision.fingerprint, reviewVersion, targets: plans.map(plan => plan.summary), canApply: selected.length > 0 && selected.every(plan => plan.summary.state !== 'blocked'), scanned: { pages: 0, posts: 0, forms: forms.length }, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: repositories ? 'database-per-document-row-lock' : 'demo-single-process' };
  if (body.action === 'review') return NextResponse.json({ success: true, requestId, data }, { headers });
  if (body.reviewVersion !== reviewVersion) return error(409, 'TEMPLATE_INSTANCE_REVIEW_STALE', requestId);
  if (!data.canApply) return error(422, 'TEMPLATE_INSTANCE_CONFLICT', requestId);
  if (repositories && (!repositories.forms.withDefinitionWriteLock || !repositories.forms.getFormDesignRevision)) return error(503, 'TEMPLATE_INSTANCE_WRITE_UNAVAILABLE', requestId);
  for (const plan of selected) {
   if (plan.summary.state === 'current') continue;
   try {
    const input = { ...plan.input, expectedForm: plan.form, beforeUpdateFormDesignRevision: { operation: 'template-upgrade' as const, templateId, targetRevisionId: revision.id, actorId, requestId } };
    if (repositories) await repositories.forms.withDefinitionWriteLock!(site.id, plan.form.id, async (writer, locked, scoped) => {
     const lockedSite = await scoped.sites.getById(site.id);
     if (!lockedSite || formDefinitionVersion(locked) !== formDefinitionVersion(plan.form) || templateInstanceFingerprint(lockedSite.settings.frontendDesign) !== templateInstanceFingerprint(site.settings.frontendDesign)) throw Object.assign(Error('The form changed.'), { code: 'FORM_DEFINITION_CONFLICT' });
     const saved = await writer.update(site.id, plan.form.id, input);
     await syncFormTemplateMediaReferences(scoped.media, saved.item);
    });
    else if (!updateAdminForm(site.id, plan.form.id, input)) throw Error('FORM_DEFINITION_WRITE_UNAVAILABLE');
    data.appliedTargets.push({ type: 'form', id: plan.form.id });
    try { await recordAdminAudit({ repositories, siteId: site.id, actorId, entity: 'form', entityId: plan.form.id, action: 'frontendDesign.templateInstanceUpgrade', metadata: { templateId, targetRevisionId: revision.id }, requestId }); } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_AUDIT_PENDING'); }
   } catch (cause: any) { data.failedTargets.push({ type: 'form', id: plan.form.id, code: cause?.code === 'FORM_DEFINITION_CONFLICT' ? 'CONTENT_CONFLICT' : 'WRITE_FAILED' }); }
  }
  if (!data.appliedTargets.length && data.failedTargets.some(item => item.code === 'CONTENT_CONFLICT')) return error(409, 'TEMPLATE_INSTANCE_REVIEW_STALE', requestId);
  if (repositories && data.appliedTargets.length) try { await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'content', entity: 'site', entityId: site.id, reason: 'form-template-instance-upgrade', requestId }); } catch { data.completionWarnings.push('TEMPLATE_INSTANCE_CACHE_PENDING'); }
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
