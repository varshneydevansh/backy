import { NextRequest, NextResponse } from 'next/server';
import { adminAccessError, isOwnerAdminSession, requireAdminAccess } from '@/lib/adminAccess';
import { ADMIN_OPERATOR_SITE_GRANTS_FIELD, operatorSiteScopeFromAuth, operatorScopeStatus, parseAdminOperatorSiteScope } from '@/lib/adminOperatorSiteScope';
import { recordAdminAudit } from '@/lib/adminAudit';
import { commitAdminOperatorSiteGrant, getAdminSettings, getAdminUserById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

import { runCommittedMutationFollowUp } from '@/lib/committedMutationFollowUp';

export const runtime = 'nodejs';
const requestIdFor = (request: NextRequest) => request.headers.get('x-request-id') || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
async function ownerAccess(request: NextRequest, requestId: string) {
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  return access instanceof NextResponse ? access : !isOwnerAdminSession(access)
    ? adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Managing operator site grants requires an active owner session.', requestId) : access;
}
async function targetState(userId: string) {
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const user = repositories ? await repositories.users.getById(userId) : getAdminUserById(userId);
  const settings = repositories ? await repositories.settings.get() : getAdminSettings();
  return { repositories, user, settings };
}
function responseFor(user: { id: string; role: string }, auth: unknown, requestId: string, completionWarnings?: string[]) {
  const scope = operatorSiteScopeFromAuth(auth, user.id);
  return NextResponse.json({ success: true, requestId, data: {
    userId: user.id, scope, status: user.role === 'owner' ? 'owner-workspace' : operatorScopeStatus(scope),
    revision: scope?.revision || 0, ownerManaged: true,
    ...(completionWarnings ? { completionWarnings } : {}),
  } });
}
export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const requestId = requestIdFor(request);
  const access = await ownerAccess(request, requestId);
  if (access instanceof NextResponse) return access;
  try {
    const { userId } = await context.params;
    const { user, settings } = await targetState(userId);
    if (!user) return adminAccessError(404, 'USER_NOT_FOUND', 'User not found', requestId);
    return responseFor(user, settings.auth, requestId);
  } catch {
    return adminAccessError(500, 'INTERNAL_SERVER_ERROR', 'Unable to read operator site grants.', requestId);
  }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const requestId = requestIdFor(request);
  const access = await ownerAccess(request, requestId);
  if (access instanceof NextResponse) return access;
  try {
    const { userId } = await context.params;
    const { repositories, user, settings } = await targetState(userId);
    if (!user) return adminAccessError(404, 'USER_NOT_FOUND', 'User not found', requestId);
    if (user.role === 'owner') return adminAccessError(403, 'OWNER_SCOPE_IMMUTABLE', 'Owners retain workspace access and cannot receive an operator site restriction.', requestId);
    const text = await request.text();
    if (text.length > 65536) return adminAccessError(400, 'INVALID_OPERATOR_SITE_SCOPE', 'Operator site policy exceeds the size limit.', requestId);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return adminAccessError(400, 'INVALID_OPERATOR_SITE_SCOPE', 'Provide a JSON operator site policy.', requestId); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return adminAccessError(400, 'INVALID_OPERATOR_SITE_SCOPE', 'Provide an operator site policy object.', requestId);
    const previous = operatorSiteScopeFromAuth(settings.auth, user.id);
    const previousRevision = previous?.revision || 0;
    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== previousRevision) return adminAccessError(409, 'OPERATOR_SITE_SCOPE_CONFLICT', 'The operator site policy changed. Reload before saving.', requestId);
    const scope = parseAdminOperatorSiteScope(body.scope);
    if (!scope || scope.revision !== previousRevision + 1 || (scope.expiresAt && Date.parse(scope.expiresAt) <= Date.now())) return adminAccessError(400, 'INVALID_OPERATOR_SITE_SCOPE', 'Provide the next revision, a supported scope, known site permissions and an optional future expiry.', requestId);
    if (scope.mode === 'workspace' && body.confirmWorkspace !== true) return adminAccessError(400, 'WORKSPACE_SCOPE_CONFIRMATION_REQUIRED', 'Confirm deliberate workspace access.', requestId);
    for (const grant of scope.grants) {
      const site = repositories ? await repositories.sites.getById(grant.siteId) : getSiteByIdOrSlug(grant.siteId);
      if (!site || site.id !== grant.siteId) return adminAccessError(400, 'INVALID_OPERATOR_SITE_ID', 'Use existing canonical site IDs.', requestId);
    }
    const auth = settings.auth && typeof settings.auth === 'object' && !Array.isArray(settings.auth) ? settings.auth : {};
    const records = auth[ADMIN_OPERATOR_SITE_GRANTS_FIELD];
    if (records !== undefined && (!Array.isArray(records) || records.length > 5000)) return adminAccessError(409, 'OPERATOR_SITE_SCOPE_STORAGE_INVALID', 'Repair the managed operator policy inventory before saving.', requestId);
    const expectedRecords = (Array.isArray(records) ? records : []).filter((record): record is import('@backy-cms/core').BackyJsonObject => Boolean(record && typeof record === 'object' && !Array.isArray(record) && record.userId === user.id));
    const record = { userId: user.id, scope: { ...scope }, updatedAt: new Date().toISOString(), updatedById: access.session!.user.id };
    const commit = { userId: user.id, expectedRecords, record };
    const saved = repositories ? (await repositories.settings.commitOperatorSiteGrant(commit)).item : commitAdminOperatorSiteGrant(commit);
    const completionWarnings: string[] = [];
    await runCommittedMutationFollowUp(completionWarnings, 'OPERATOR_SITE_GRANT_AUDIT_PENDING', () => recordAdminAudit({ repositories, actorId: access.session!.user.id, entity: 'user', entityId: user.id,
      action: 'user.site_grants.update', before: { scope: previous, status: operatorScopeStatus(previous) }, after: { scope, status: operatorScopeStatus(scope) },
      metadata: { role: user.role, revision: scope.revision, canonicalSiteIds: scope.grants.map(grant => grant.siteId) }, requestId }));
    return responseFor(user, saved.auth, requestId, completionWarnings);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'OPERATOR_SITE_SCOPE_CONFLICT' || code === 'OPERATOR_SITE_SCOPE_STORAGE_INVALID') return adminAccessError(409, code, code === 'OPERATOR_SITE_SCOPE_CONFLICT' ? 'The operator site policy changed. Reload before saving.' : 'Repair the managed operator policy inventory before saving.', requestId);
    return adminAccessError(500, 'INTERNAL_SERVER_ERROR', 'Unable to save operator site grants.', requestId);
  }
}
