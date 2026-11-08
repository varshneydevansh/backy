import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from './adminAccess';
import { recordAdminAudit } from './adminAudit';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { listRetainedTemplateRevisions, getRetainedTemplateRevision, persistFrontendDesignWithHistory, restoredTemplateDesign, templateRevisionFingerprint, templateHistoryError } from './templateHistory';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
import { deliverSiteWebhooks } from './siteWebhookDelivery';
import type { Site } from '@backy-cms/core';

const errorResponse = (cause: unknown, requestId: string) => {
  const error = cause && typeof cause === 'object' ? cause as { status?: number; code?: string; message?: string } : {};
  const status = error.status || (error.code === 'TEMPLATE_HISTORY_CONFLICT' ? 409 : error.code === 'SITE_NOT_FOUND' ? 404 : 500);
  return NextResponse.json({ success: false, requestId, error: { code: error.code || 'INTERNAL_SERVER_ERROR', message: status < 500 ? error.message : 'Template history could not complete. Try again.' } }, { status, headers: { 'cache-control': 'private, no-store' } });
};
const resolveSite = async (siteId: string) => {
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId) as unknown as Site;
  if (!site) throw templateHistoryError(404, 'SITE_NOT_FOUND', 'Site not found');
  return { site, repositories };
};
export async function templateRevisionList(request: NextRequest, siteId: string, templateId?: string) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.view' });
  if (access instanceof NextResponse) return access;
  try {
    const { site } = await resolveSite(siteId);
    const query = new URL(request.url).searchParams;
    const number = (name: string, fallback: number) => { const value = query.get(name); if (value === null) return fallback; if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw templateHistoryError(400, 'INVALID_PAGINATION', 'Template history pagination must use nonnegative integers.'); return Number(value); };
    const limit = number('limit', 25), offset = number('offset', 0);
    if (limit < 1 || limit > 100) throw templateHistoryError(400, 'INVALID_PAGINATION', 'Template history page limit must be between 1 and 100.');
    const result = await listRetainedTemplateRevisions(site.id, templateId, { limit, offset });
    const current = site.settings.frontendDesign?.templates.find(template => template.id === templateId);
    const revisions = templateId ? result.items : result.items.map(({ snapshot, ...revision }) => ({ ...revision, name: snapshot.name, type: snapshot.type, version: snapshot.version, status: snapshot.status }));
    return NextResponse.json({ success: true, requestId, data: { siteId: site.id, templateId: templateId || null, revisions, pagination: result.pagination,
      currentDesignFingerprint: templateRevisionFingerprint(site.settings.frontendDesign ?? null), currentTemplateFingerprint: templateRevisionFingerprint(current ?? null),
      current: current ? { id: current.id, name: current.name, type: current.type, version: current.version } : null,
      retention: 'Immutable snapshots are stored independently of ordinary audit cleanup. Site deletion removes its history.' } }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (cause) { return errorResponse(cause, requestId); }
}
export async function templateRevisionRestore(request: NextRequest, siteId: string, templateId: string, revisionId: string) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.configure' });
  if (access instanceof NextResponse) return access;
  try {
    const body: unknown = await request.json().catch(() => null);
    const expected = body && typeof body === 'object' && 'expectedDesignFingerprint' in body ? body.expectedDesignFingerprint : undefined;
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw templateHistoryError(400, 'EXPECTED_REVISION_REQUIRED', 'Reload template history and provide its current design fingerprint before restoring.');
    const { site, repositories } = await resolveSite(siteId);
    if (!/^(?:template_revision_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(revisionId)) throw templateHistoryError(404, 'TEMPLATE_REVISION_NOT_FOUND', 'Template revision not found for this site and template.');
    const revision = await getRetainedTemplateRevision(site.id, templateId, revisionId);
    if (!revision) throw templateHistoryError(404, 'TEMPLATE_REVISION_NOT_FOUND', 'Template revision not found for this site and template.');
    const frontendDesign = restoredTemplateDesign(site, revision, expected, new Date().toISOString());
    const updated = await persistFrontendDesignWithHistory(site, frontendDesign, { source: 'frontendDesign.restoreTemplate', actorId: access.session?.user.id, requestId, restoredFromRevisionId: revision.id });
    const cacheInvalidation = repositories ? await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'settings', entity: 'site', entityId: site.id, reason: 'site-frontend-design-template-restored', requestId }) : null;
    await recordAdminAudit({ repositories, siteId: site.id, actorId: access.session?.user.id, entity: 'site', entityId: templateId, action: 'frontendDesign.templateRestore', before: site.settings.frontendDesign?.templates.find(template => template.id === templateId), after: updated.settings.frontendDesign?.templates.find(template => template.id === templateId), metadata: { templateId, restoredFromRevisionId: revision.id, restoredFromFingerprint: revision.fingerprint }, requestId });
    await deliverSiteWebhooks({ repositories, site: updated, kind: 'site-updated', requestId, actor: access.session?.user.id, reason: 'frontendDesign.templateRestore',
      data: { before: site.settings.frontendDesign, after: updated.settings.frontendDesign }, metadata: { action: 'frontendDesign.templateRestore', changedKeys: ['frontendDesign'], source: 'admin-site-template-history-api', templateId, restoredFromRevisionId: revision.id } });
    return NextResponse.json({ success: true, requestId, data: { siteId: site.id, frontendDesign: updated.settings.frontendDesign, restoredTemplateId: templateId, restoredFromRevisionId: revision.id, cacheInvalidation } }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (cause) { return errorResponse(cause, requestId); }
}
