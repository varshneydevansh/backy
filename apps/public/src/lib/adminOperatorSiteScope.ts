import { ADMIN_SITE_SERVICE_PERMISSIONS } from '@/lib/adminServiceKeyScope';

export const ADMIN_OPERATOR_SITE_GRANTS_FIELD = 'userSiteGrants';
export interface AdminOperatorSiteScope {
  version: 1;
  revision: number;
  mode: 'workspace' | 'selected-sites';
  grants: Array<{ siteId: string; permissions: string[] }>;
  expiresAt: string | null;
  legacy?: boolean;
}
export const legacyOperatorWorkspaceScope = (): AdminOperatorSiteScope => ({
  version: 1, revision: 0, mode: 'workspace', grants: [], expiresAt: null, legacy: true,
});
const identifier = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 160;
export function parseAdminOperatorSiteScope(value: unknown): AdminOperatorSiteScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1 || Number(input.revision) >= Number.MAX_SAFE_INTEGER) return null;
  if (input.mode !== 'workspace' && input.mode !== 'selected-sites') return null;
  if (!Array.isArray(input.grants) || input.grants.length > 50) return null;
  const grants: AdminOperatorSiteScope['grants'] = [];
  for (const raw of input.grants) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const grant = raw as Record<string, unknown>;
    if (!identifier(grant.siteId) || grants.some(item => item.siteId === grant.siteId) || !Array.isArray(grant.permissions) || grant.permissions.length > ADMIN_SITE_SERVICE_PERMISSIONS.length) return null;
    if (!grant.permissions.every(key => typeof key === 'string' && ADMIN_SITE_SERVICE_PERMISSIONS.includes(key))) return null;
    grants.push({ siteId: grant.siteId, permissions: [...new Set(grant.permissions as string[])] });
  }
  if (input.mode === 'workspace' && grants.length) return null;
  const expiresAt = input.expiresAt === null ? null : typeof input.expiresAt === 'string' && Number.isFinite(Date.parse(input.expiresAt)) ? new Date(input.expiresAt).toISOString() : undefined;
  if (expiresAt === undefined) return null;
  return { version: 1, revision: Number(input.revision), mode: input.mode as AdminOperatorSiteScope['mode'], grants, expiresAt };
}

/** Missing policy preserves historical workspace access; invalid policy denies. */
export function operatorSiteScopeFromAuth(auth: unknown, userId: string): AdminOperatorSiteScope | null {
  const input = auth && typeof auth === 'object' && !Array.isArray(auth) ? auth as Record<string, unknown> : {};
  const records = input[ADMIN_OPERATOR_SITE_GRANTS_FIELD];
  if (records === undefined) return legacyOperatorWorkspaceScope();
  if (!Array.isArray(records) || records.length > 5000) return null;
  const own = records.filter(record => record && typeof record === 'object' && !Array.isArray(record) && record.userId === userId);
  if (!own.length) return legacyOperatorWorkspaceScope();
  if (own.length !== 1) return null;
  return parseAdminOperatorSiteScope(own[0].scope);
}

export function operatorScopeStatus(scope: AdminOperatorSiteScope | null) {
  return !scope ? 'invalid' : scope.expiresAt && Date.parse(scope.expiresAt) <= Date.now() ? 'expired'
    : scope.legacy ? 'legacy-workspace' : scope.mode === 'workspace' ? 'workspace'
    : scope.grants.some(grant => grant.permissions.length) ? 'selected-sites' : 'revoked';
}
