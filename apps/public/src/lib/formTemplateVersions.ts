import { NextRequest, NextResponse } from 'next/server';
import { formTemplateDesignFields, formTemplateSchemaConflicts, withFormTemplateDesign, type FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { shouldUseDemoStoreFallback, getRequiredDatabaseRepositories } from './repositoryRuntime';
import { getSiteByIdOrSlug, getFormById, listFormDesignRevisions, getFormDesignRevision, updateAdminForm } from './backyStore';
import { formDefinitionVersion, formDefinitionWithVersion } from './formDefinitionVersion';
import { isValidFormTemplateInstancePin, assertTemplateInstanceContentSafe } from './templateInstanceProvenance';
import { recordAdminAudit } from './adminAudit';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
import { syncFormTemplateMediaReferences } from './formTemplateMediaReferences';
const headers = { 'cache-control': 'private, no-store' };
const json = (requestId: string, data: unknown) => NextResponse.json({ success: true, requestId, data }, { headers });
const fail = (requestId: string, status: number, code: string) => NextResponse.json({ success: false, requestId, error: { code, message: code === 'FORM_DEFINITION_CONFLICT' ? 'The form changed. Reload before restoring its design.' : 'The form design recovery could not complete.' } }, { status, headers });
export async function handleFormDesignVersions(request: NextRequest, params: { siteId: string; formId: string; revisionId?: string }, restore = false) {
 const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
 const permissions = ['forms.view', ...(restore ? ['forms.edit'] : [])];
 const access = await requireAdminAccess(request, requestId, { permissions });
 if (access instanceof NextResponse) return access;
 const actorId = access.session?.user.id;
 try {
  let expectedVersion: string | undefined;
  if (restore) {
   const raw = await request.text(); if (Buffer.byteLength(raw) > 4096) return fail(requestId, 413, 'FORM_DESIGN_REVISION_LIMIT');
   const body = JSON.parse(raw);
   if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.expectedVersion !== 'string' || !/^form-v1:[a-f0-9]{64}$/.test(body.expectedVersion) || !params.revisionId) return fail(requestId, 400, 'INVALID_FORM_DESIGN_RESTORE_REQUEST');
   expectedVersion = body.expectedVersion;
  }
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = repositories ? await repositories.sites.getById(params.siteId) || await repositories.sites.getBySlug(params.siteId) : getSiteByIdOrSlug(params.siteId);
  if (!site) return fail(requestId, 404, 'SITE_NOT_FOUND');
  const form = repositories ? await repositories.forms.getById(site.id, params.formId) : getFormById(site.id, params.formId);
  if (!form || form.id !== params.formId || form.siteId !== site.id) return fail(requestId, 404, 'FORM_NOT_FOUND');
  if (!restore) {
   const query = new URL(request.url).searchParams, offsetValue = query.get('offset') ?? '0', limitValue = query.get('limit') ?? '100';
   if (!/^(0|[1-9][0-9]*)$/.test(offsetValue) || !/^[1-9][0-9]*$/.test(limitValue) || !Number.isSafeInteger(Number(offsetValue)) || Number(offsetValue) > 1000000 || Number(limitValue) > 100) return fail(requestId, 400, 'INVALID_FORM_DESIGN_HISTORY_REQUEST');
   const offset = Number(offsetValue), limit = Number(limitValue);
   if (repositories && !repositories.forms.listFormDesignRevisions) return fail(requestId, 503, 'FORM_DESIGN_HISTORY_UNAVAILABLE');
   const revisions = repositories ? await repositories.forms.listFormDesignRevisions!(site.id, form.id, { offset, limit }) : listFormDesignRevisions(site.id, form.id, { offset, limit });
   return json(requestId, { siteId: site.id, formId: form.id, currentVersion: formDefinitionVersion(form), pagination: { offset, limit, hasMore: revisions.length > limit, nextOffset: revisions.length > limit ? offset + limit : null }, revisions: revisions.slice(0, limit).map(item => ({ id: item.id, createdAt: item.createdAt, operation: item.operation, templateId: item.templateId ?? null, targetRevisionId: item.targetRevisionId ?? null, hasPinnedBaseline: isValidFormTemplateInstancePin(item.snapshot.pin) })) });
  }
  if (formDefinitionVersion(form) !== expectedVersion) return fail(requestId, 409, 'FORM_DEFINITION_CONFLICT');
  if (repositories && (!repositories.forms.getFormDesignRevision || !repositories.forms.withDefinitionWriteLock)) return fail(requestId, 503, 'FORM_DESIGN_HISTORY_UNAVAILABLE');
  const revision = repositories ? await repositories.forms.getFormDesignRevision!(site.id, form.id, params.revisionId!) : getFormDesignRevision(site.id, form.id, params.revisionId!);
  if (!revision || revision.siteId !== site.id || revision.formId !== form.id) return fail(requestId, 404, 'FORM_DESIGN_REVISION_NOT_FOUND');
  if (revision.snapshot.schemaVersion !== 'backy.form-design-version.v1') return fail(requestId, 422, 'FORM_DESIGN_REVISION_INVALID');
  assertTemplateInstanceContentSafe(revision.snapshot.design);
  if (formTemplateSchemaConflicts(form.fields, formTemplateDesignFields(revision.snapshot.design)).length) return fail(requestId, 422, 'FORM_TEMPLATE_SCHEMA_INCOMPATIBLE');
  const pin = isValidFormTemplateInstancePin(revision.snapshot.pin) ? revision.snapshot.pin : null;
  const input = { ...withFormTemplateDesign(form, revision.snapshot.design, pin), expectedForm: form, beforeUpdateFormDesignRevision: { operation: 'restore' as const, templateId: revision.templateId, targetRevisionId: revision.id, actorId, requestId } };
  const saved = repositories ? await repositories.forms.withDefinitionWriteLock!(site.id, form.id, async (writer, _locked, scoped) => {
   const saved = (await writer.update(site.id, form.id, input)).item;
   await syncFormTemplateMediaReferences(scoped.media, saved);
   return saved;
  }) : updateAdminForm(site.id, form.id, input);
  if (!saved) return fail(requestId, 503, 'FORM_DESIGN_HISTORY_UNAVAILABLE');
  const completionWarnings: string[] = [];
  try { await recordAdminAudit({ repositories, siteId: site.id, actorId, entity: 'form', entityId: form.id, action: 'frontendDesign.formDesignRestore', metadata: { revisionId: revision.id }, requestId }); } catch { completionWarnings.push('FORM_DESIGN_RESTORE_AUDIT_PENDING'); }
  if (repositories) try { await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'content', entity: 'site', entityId: site.id, reason: 'form-design-restore', requestId }); } catch { completionWarnings.push('FORM_DESIGN_RESTORE_CACHE_PENDING'); }
  return json(requestId, { siteId: site.id, formId: form.id, restoredFromRevisionId: revision.id, form: formDefinitionWithVersion(saved as FormDefinition), completionWarnings });
 } catch (cause: any) {
  if (cause instanceof SyntaxError) return fail(requestId, 400, 'INVALID_FORM_DESIGN_RESTORE_REQUEST');
  if (cause?.code === 'FORM_DEFINITION_CONFLICT') return fail(requestId, 409, cause.code);
  if (/LIMIT/.test(cause?.message || '')) return fail(requestId, 413, 'FORM_DESIGN_REVISION_LIMIT');
  if (/INCOMPATIBLE/.test(cause?.message || '')) return fail(requestId, 422, 'FORM_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (/INVALID|UNSAFE/.test(cause?.message || '')) return fail(requestId, 422, 'FORM_DESIGN_REVISION_INVALID');
  return fail(requestId, 503, 'FORM_DESIGN_HISTORY_UNAVAILABLE');
 }
}
