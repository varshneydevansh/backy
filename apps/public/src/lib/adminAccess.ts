import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminSessionWithPersistence, listAdminSessionPermissionOverrides, type AdminSession } from '@/lib/admin-auth/sessionStore';
import { getAdminSessionTokenFromRequest } from '@/lib/admin-auth/sessionCookie';
import { adminCookieWriteOriginError } from '@/lib/admin-auth/cookieWriteOrigin';
import { buildUserPermissionMatrix, isAdminPermissionKey, isOwnerOnlyAdminPermission } from '@/lib/adminPermissions';
import { getAdminSettings, getSiteByIdOrSlug, listAdminTeamMembers, listAdminUserPermissionOverrides, updateAdminSettings } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { operatorSiteScopeFromAuth, type AdminOperatorSiteScope } from '@/lib/adminOperatorSiteScope';
import { ADMIN_SITE_SERVICE_PERMISSIONS, legacyWorkspaceServiceKeyScope, parseAdminServiceKeyScope, serviceKeySiteRouteIsClassified, type AdminServiceKeyScope } from '@/lib/adminServiceKeyScope';

type AdminRole = AdminSession['user']['role'];
type AdminTeamScopeAction = 'view' | 'content' | 'manage';
type DatabaseRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;

export type AdminAccessContext = {
  type: 'session' | 'api-key';
  session: AdminSession | null;
  serviceKeyScope?: AdminServiceKeyScope;
  operatorSiteScope?: AdminOperatorSiteScope;
};

export type AdminTeamScopedResource = {
  id?: string;
  teamId?: string | null;
};

const scopedTeamRoles: Record<AdminTeamScopeAction, AdminRole[]> = {
  view: ['owner', 'admin', 'editor', 'viewer'],
  content: ['owner', 'admin', 'editor'],
  manage: ['owner', 'admin'],
};

const getProvidedAdminKey = (request: NextRequest) => {
  const explicitKey = request.headers.get('x-backy-admin-key') || request.headers.get('x-api-key');
  if (explicitKey?.trim()) {
    return explicitKey.trim();
  }

  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const uniqueKeys = (keys: string[]) => (
  keys.filter((value, index, values) => value && values.indexOf(value) === index)
);

const getEnvironmentAdminKeys = () => uniqueKeys([
  process.env.BACKY_ADMIN_API_KEY?.trim() || '',
  process.env.BACKY_ADMIN_SECRET_KEY?.trim() || '',
]);

const keyHash = (value: string) => createHash('sha256').update(value).digest('hex');

type ConfiguredAdminKeyMatch = {
  kind: 'primary' | 'service';
  scope?: AdminServiceKeyScope | null;
  touchLastUsed?: () => Promise<void>;
};

type ServiceAdminKeyGrant = {
  id?: unknown;
  keyHash?: unknown;
  revokedAt?: unknown;
  status?: unknown;
  scope?: unknown;
};

const serviceKeyGrants = (auth: unknown) => {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
    return [];
  }

  const grants = (auth as { apiKeyServiceKeys?: unknown }).apiKeyServiceKeys;
  if (!Array.isArray(grants)) {
    return [];
  }

  return grants;
};

const findActiveServiceAdminKey = (auth: unknown, providedKey: string) => {
  const grants = serviceKeyGrants(auth);
  const providedHash = keyHash(providedKey);
  for (const grant of grants) {
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
      continue;
    }

    const candidate = grant as ServiceAdminKeyGrant;
    if (
      typeof candidate.id === 'string' &&
      candidate.keyHash === providedHash &&
      !candidate.revokedAt &&
      candidate.status !== 'revoked'
    ) {
      return { id: candidate.id, scope: candidate.scope === undefined ? legacyWorkspaceServiceKeyScope() : parseAdminServiceKeyScope(candidate.scope) };
    }
  }

  return null;
};

const withTouchedServiceKey = (auth: unknown, serviceKeyId: string, lastUsedAt: string) => {
  const grants = serviceKeyGrants(auth);
  if (grants.length === 0) {
    return null;
  }

  return {
    ...(auth && typeof auth === 'object' && !Array.isArray(auth) ? auth : {}),
    apiKeyServiceKeys: grants.map((grant) => (
      grant && typeof grant === 'object' && !Array.isArray(grant) && (grant as ServiceAdminKeyGrant).id === serviceKeyId
        ? { ...grant, lastUsedAt }
        : grant
    )),
  };
};

const resolveConfiguredAdminKey = async (providedKey: string): Promise<ConfiguredAdminKeyMatch | null> => {
  if (!providedKey) {
    return null;
  }

  if (shouldUseDemoStoreFallback()) {
    const settings = getAdminSettings();
    if (settings.apiKeys?.adminApiKey?.trim() === providedKey) {
      return { kind: 'primary' };
    }

    const serviceKey = findActiveServiceAdminKey(settings.auth, providedKey);
    return serviceKey
      ? {
          kind: 'service',
          scope: serviceKey.scope,
          touchLastUsed: async () => {
            const currentSettings = getAdminSettings();
            const auth = withTouchedServiceKey(currentSettings.auth, serviceKey.id, new Date().toISOString());
            if (auth) {
              updateAdminSettings({ auth });
            }
          },
        }
      : null;
  }

  const repositories = await getRequiredDatabaseRepositories();
  const settings = await repositories.settings.get();
  if (settings.apiKeys?.secretKeyId?.trim() === providedKey) {
    return { kind: 'primary' };
  }

  const serviceKey = findActiveServiceAdminKey(settings.auth, providedKey);
  return serviceKey
    ? {
        kind: 'service',
        scope: serviceKey.scope,
        touchLastUsed: async () => {
          const currentSettings = await repositories.settings.get();
          const auth = withTouchedServiceKey(currentSettings.auth, serviceKey.id, new Date().toISOString());
          if (auth) {
            await repositories.settings.update({ auth });
          }
        },
      }
    : null;
};

const hasRequiredRole = (role: AdminRole, allowedRoles: AdminRole[]) => allowedRoles.includes(role);

const normalizeTeamId = (teamId: string | null | undefined) => (
  typeof teamId === 'string' ? teamId.trim() : ''
);

const nestedAdminSiteIdentifierFromRequest = (request: NextRequest) => {
  let pathname = '';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const sitesIndex = apiIndex + (segments[apiIndex + 1] === 'admin' ? 2 : 1);
  if (apiIndex < 0 || segments[sitesIndex] !== 'sites') {
    return null;
  }

  const siteIdentifier = segments[sitesIndex + 1];
  if (!siteIdentifier) {
    return null;
  }

  try {
    return decodeURIComponent(siteIdentifier).trim() || null;
  } catch {
    return siteIdentifier.trim() || null;
  }
};

const teamScopeActionForPermission = (permission?: string): AdminTeamScopeAction => {
  if (!permission) {
    return 'manage';
  }

  const [group, action] = permission.split('.');
  if (action === 'view' || action === 'export') {
    return 'view';
  }

  if (group === 'sites' || group === 'settings' || group === 'users') {
    return 'manage';
  }

  if (action === 'configure') {
    return group === 'commerce' ? 'manage' : 'content';
  }

  if (action === 'manage' || action === 'create' || action === 'edit' || action === 'publish' || action === 'delete') {
    return 'content';
  }

  return 'manage';
};

const resolveAdminSiteScopeResource = async (
  siteIdentifier: string,
  repositories: DatabaseRepositories | null,
): Promise<AdminTeamScopedResource | null> => {
  if (repositories) {
    return await repositories.sites.getById(siteIdentifier) || await repositories.sites.getBySlug(siteIdentifier);
  }

  return getSiteByIdOrSlug(siteIdentifier) || null;
};

export const adminAccessError = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    // Legacy protected /api/sites routes return this response directly, without
    // the /api/admin proxy's private cache policy.
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  )
);

export const isOwnerAdminSession = (access: AdminAccessContext): boolean => (
  access.type === 'session' && access.session?.user.role === 'owner'
  && access.session.user.status === 'active'
);

/** Ordinary user management must never create, take over, or mutate an owner. */
export function requireAdminOwnerManagementAccess(
  access: AdminAccessContext,
  requestId: string,
  resource: { currentRole?: unknown; nextRole?: unknown },
): NextResponse | null {
  if (resource.currentRole !== 'owner' && resource.nextRole !== 'owner') return null;
  if (isOwnerAdminSession(access)) return null;
  return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Managing owner accounts requires an active owner admin session.', requestId);
}

const getScopedTeamMemberRole = async (
  access: AdminAccessContext,
  teamId: string,
): Promise<AdminRole | null> => {
  if (access.type !== 'session' || !access.session) {
    return null;
  }

  if (shouldUseDemoStoreFallback()) {
    const member = listAdminTeamMembers(teamId).find((candidate) => candidate.userId === access.session?.user.id);
    return member?.role || null;
  }

  const repositories = await getRequiredDatabaseRepositories();
  const members = await repositories.teams.listMembers({ teamId });
  const member = members.items.find((candidate) => candidate.userId === access.session?.user.id);
  return member?.role || null;
};

/** Canonical IDs for a credential restricted to selected sites. */
export function selectedAdminSiteIds(access: AdminAccessContext): string[] | null {
  if (access.serviceKeyScope?.mode === 'selected-sites') return access.serviceKeyScope.siteIds;
  if (access.operatorSiteScope?.mode === 'selected-sites') return access.operatorSiteScope.grants.filter(grant => grant.permissions.includes('sites.view')).map(grant => grant.siteId);
  return null;
}

export async function canAdminAccessTeamScope(
  access: AdminAccessContext,
  teamId: string | null | undefined,
  options: {
    action?: AdminTeamScopeAction;
    allowUnowned?: boolean;
  } = {},
): Promise<boolean> {
  // A bare team identifier cannot prove a selected-site credential's scope.
  if (access.serviceKeyScope?.mode === 'selected-sites' || access.operatorSiteScope?.mode === 'selected-sites') return false;
  const normalizedTeamId = normalizeTeamId(teamId);
  if (!normalizedTeamId) {
    return options.allowUnowned !== false;
  }

  if (access.type === 'api-key') {
    return true;
  }

  if (!access.session) {
    return false;
  }

  if (access.session.user.role === 'owner') {
    return true;
  }

  const action = options.action || 'view';
  const memberRole = await getScopedTeamMemberRole(access, normalizedTeamId);
  return memberRole ? scopedTeamRoles[action].includes(memberRole) : false;
}

export async function filterAdminTeamScopedResources<T extends AdminTeamScopedResource>(
  access: AdminAccessContext,
  resources: T[],
  options: {
    action?: AdminTeamScopeAction;
    allowUnowned?: boolean;
  } = {},
): Promise<T[]> {
  if (access.serviceKeyScope?.mode === 'selected-sites') {
    return resources.filter(resource => Boolean(resource.id && access.serviceKeyScope?.siteIds.includes(resource.id)));
  }
  if (access.operatorSiteScope?.mode === 'selected-sites') {
    const ids = selectedAdminSiteIds(access)!;
    return filterAdminTeamScopedResources({ ...access, operatorSiteScope: undefined }, resources.filter(resource => Boolean(resource.id && ids.includes(resource.id))), options);
  }
  if (access.type === 'api-key' || access.session?.user.role === 'owner') {
    return resources;
  }

  const decisionCache = new Map<string, boolean>();
  const filtered: T[] = [];
  for (const resource of resources) {
    const teamId = normalizeTeamId(resource.teamId);
    const cacheKey = teamId || '__unowned__';
    const allowed = decisionCache.has(cacheKey)
      ? decisionCache.get(cacheKey) === true
      : await canAdminAccessTeamScope(access, teamId || null, options);
    decisionCache.set(cacheKey, allowed);

    if (allowed) {
      filtered.push(resource);
    }
  }

  return filtered;
}

export async function requireAdminTeamScopeAccess(
  access: AdminAccessContext,
  requestId: string,
  resource: AdminTeamScopedResource,
  options: {
    action?: AdminTeamScopeAction;
    allowUnowned?: boolean;
    code?: string;
    message?: string;
  } = {},
): Promise<NextResponse | null> {
  if (access.serviceKeyScope?.mode === 'selected-sites') {
    return resource.id && access.serviceKeyScope.siteIds.includes(resource.id)
      ? null : adminAccessError(403, 'FORBIDDEN_SITE_SCOPE', 'This service key does not grant access to this site.', requestId);
  }
  if (access.operatorSiteScope?.mode === 'selected-sites') {
    if (!resource.id || !access.operatorSiteScope.grants.some(grant => grant.siteId === resource.id)) return adminAccessError(403, 'FORBIDDEN_SITE_SCOPE', 'This operator policy does not grant access to this site.', requestId);
    return requireAdminTeamScopeAccess({ ...access, operatorSiteScope: undefined }, requestId, resource, options);
  }
  const allowed = await canAdminAccessTeamScope(access, resource.teamId, options);
  if (allowed) {
    return null;
  }

  return adminAccessError(
    403,
    options.code || 'FORBIDDEN_SITE_SCOPE',
    options.message || 'This admin account is not a member of the team that owns this site.',
    requestId,
  );
}

type ResolvedAdminCredential = {
  access: AdminAccessContext;
  repositories: DatabaseRepositories | null;
  touchLastUsed?: () => Promise<void>;
};

// Authentication only: route permission, site membership and scoped capability
// checks remain in requireAdminAccess. Never cache this result across requests.
const resolveAdminCredential = async (
  request: NextRequest,
  requestId: string,
): Promise<ResolvedAdminCredential | NextResponse> => {
  const providedKey = getProvidedAdminKey(request);
  const environmentKeys = getEnvironmentAdminKeys();
  const configuredKeyMatch = providedKey && !environmentKeys.includes(providedKey)
    ? await resolveConfiguredAdminKey(providedKey)
    : null;

  if (providedKey && (environmentKeys.includes(providedKey) || configuredKeyMatch)) {
    const scope = configuredKeyMatch?.kind === 'service' ? configuredKeyMatch.scope : legacyWorkspaceServiceKeyScope();
    if (!scope || (scope.expiresAt && Date.parse(scope.expiresAt) <= Date.now())) {
      return adminAccessError(403, 'SERVICE_KEY_SCOPE_INVALID', 'This service key policy is invalid or expired.', requestId);
    }
    return {
      access: { type: 'api-key', session: null, serviceKeyScope: scope },
      repositories: null,
      touchLastUsed: configuredKeyMatch?.touchLastUsed,
    };
  }

  // Only an actually matched API key bypasses ambient-cookie origin checks.
  const cookieOriginError = adminCookieWriteOriginError(request);
  if (cookieOriginError) return adminAccessError(403, cookieOriginError.code, cookieOriginError.message, requestId);

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const authSettings = repositories
    ? (await repositories.settings.get()).auth
    : getAdminSettings().auth;
  const session = await getAdminSessionWithPersistence(
    getAdminSessionTokenFromRequest(request),
    repositories ? {
      getUserById: repositories.users.getById,
      authSettings,
      updateAuthSettings: (auth) => repositories.settings.update({ auth }).then(() => undefined),
    } : {},
  );
  if (!session) {
    return adminAccessError(401, 'UNAUTHORIZED', 'A valid admin session or admin API key is required.', requestId);
  }

  // Owner authority remains workspace-wide. Other operators read current policy,
  // rather than caching a grant in a long-lived session token.
  const operatorSiteScope = session.user.role === 'owner' ? undefined : operatorSiteScopeFromAuth(authSettings, session.user.id);
  if (operatorSiteScope === null || (operatorSiteScope?.expiresAt && Date.parse(operatorSiteScope.expiresAt) <= Date.now())) {
    return adminAccessError(403, 'OPERATOR_SITE_SCOPE_INVALID', 'This operator site policy is invalid or expired.', requestId);
  }
  return { access: { type: 'session', session, ...(operatorSiteScope ? { operatorSiteScope } : {}) }, repositories };
};

/** Credential gate for the deployment proxy; this grants no route permissions. */
export async function requireAdminCredential(
  request: NextRequest,
  requestId: string,
): Promise<AdminAccessContext | NextResponse> {
  const resolved = await resolveAdminCredential(request, requestId);
  return resolved instanceof NextResponse ? resolved : resolved.access;
}

const checkResolvedAdminAccess = async (
  request: NextRequest,
  requestId: string,
  resolved: ResolvedAdminCredential,
  options: { roles?: AdminRole[]; permission?: string },
): Promise<AdminAccessContext | NextResponse> => {
  const allowedRoles = options.roles || ['owner', 'admin'];
  const { access, repositories } = resolved;
  if (access.type === 'api-key') {
    if (options.permission && isOwnerOnlyAdminPermission(options.permission)) {
      return adminAccessError(403, 'FORBIDDEN_PERMISSION', 'Owner-only permissions require an owner admin session.', requestId);
    }
    const scope = access.serviceKeyScope!;
    if (scope.mode === 'selected-sites') {
      if (!options.permission || !scope.permissions.includes(options.permission)) {
        return adminAccessError(403, 'FORBIDDEN_SERVICE_KEY_PERMISSION', 'This service key does not grant the required permission.', requestId);
      }
      const siteIdentifier = nestedAdminSiteIdentifierFromRequest(request);
      const siteList = request.method === 'GET' && new URL(request.url).pathname === '/api/admin/sites' && options.permission === 'sites.view';
      if (!siteList && (!siteIdentifier || !serviceKeySiteRouteIsClassified(request.url))) {
        return adminAccessError(403, 'FORBIDDEN_SERVICE_KEY_ROUTE', 'Selected-site keys cannot access workspace or unclassified routes.', requestId);
      }
      if (siteIdentifier) {
        const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
        const site = await resolveAdminSiteScopeResource(siteIdentifier, repositories);
        if (!site) return adminAccessError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        if (!site.id || !scope.siteIds.includes(site.id)) return adminAccessError(403, 'FORBIDDEN_SITE_SCOPE', 'This service key does not grant access to this site.', requestId);
      }
    }
    return {
      type: 'api-key',
      session: null,
      serviceKeyScope: scope,
    };
  }

  const session = access.session!;

  if (access.operatorSiteScope?.mode === 'selected-sites') {
    const siteIdentifier = nestedAdminSiteIdentifierFromRequest(request);
    const pathname = new URL(request.url).pathname;
    const selfPermissions = request.method === 'GET' && pathname === `/api/admin/users/${encodeURIComponent(session.user.id)}/permissions` && !options.permission;
    const siteList = request.method === 'GET' && pathname === '/api/admin/sites' && options.permission === 'sites.view';
    if (!selfPermissions && !siteList) {
      if (!siteIdentifier || !serviceKeySiteRouteIsClassified(request.url) || !options.permission || !ADMIN_SITE_SERVICE_PERMISSIONS.includes(options.permission)) {
        return adminAccessError(403, 'FORBIDDEN_OPERATOR_SITE_ROUTE', 'Selected-site operators cannot access workspace or unclassified routes.', requestId);
      }
      const site = await resolveAdminSiteScopeResource(siteIdentifier, repositories);
      if (!site) return adminAccessError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      const grant = access.operatorSiteScope.grants.find(grant => grant.siteId === site.id);
      if (!grant) return adminAccessError(403, 'FORBIDDEN_SITE_SCOPE', 'This operator policy does not grant access to this site.', requestId);
      if (!grant.permissions.includes(options.permission)) return adminAccessError(403, 'FORBIDDEN_OPERATOR_SITE_PERMISSION', 'This operator policy does not grant the required site permission.', requestId);
    }
  }

  if (options.permission && isOwnerOnlyAdminPermission(options.permission) && session.user.role !== 'owner') {
    return adminAccessError(403, 'FORBIDDEN_PERMISSION', 'Owner-only permissions require an owner admin session.', requestId);
  }

  if (options.permission) {
    const sessionOverrides = listAdminSessionPermissionOverrides(session.token, session.user.id);
    const overrides = sessionOverrides !== null
      ? sessionOverrides
      : listAdminUserPermissionOverrides(session.user.id);
    const matrix = buildUserPermissionMatrix(session.user, overrides);
    const permission = matrix.groups
      .flatMap((group) => group.permissions)
      .find((candidate) => candidate.key === options.permission);

    if (!permission?.allowed) {
      return adminAccessError(403, 'FORBIDDEN_PERMISSION', 'This admin account does not have the required permission.', requestId);
    }

    const siteIdentifier = nestedAdminSiteIdentifierFromRequest(request);
    if (siteIdentifier) {
      const site = await resolveAdminSiteScopeResource(siteIdentifier, repositories);
      if (!site) {
        return adminAccessError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const scopedAccess = await requireAdminTeamScopeAccess(
        access,
        requestId,
        site,
        { action: teamScopeActionForPermission(options.permission) },
      );
      if (scopedAccess) {
        return scopedAccess;
      }
    }

    return access;
  }

  if (!hasRequiredRole(session.user.role, allowedRoles)) {
    return adminAccessError(403, 'FORBIDDEN', 'This admin account cannot manage users.', requestId);
  }

  const siteIdentifier = nestedAdminSiteIdentifierFromRequest(request);
  if (siteIdentifier) {
    const site = await resolveAdminSiteScopeResource(siteIdentifier, repositories);
    if (!site) {
      return adminAccessError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const scopedAccess = await requireAdminTeamScopeAccess(
      access,
      requestId,
      site,
      { action: teamScopeActionForPermission(options.permission) },
    );
    if (scopedAccess) {
      return scopedAccess;
    }
  }

  return access;
};

/** All required permissions must pass before recording service-key usage. */
export async function requireAdminAccess(
  request: NextRequest,
  requestId: string,
  options: {
    roles?: AdminRole[];
    permission?: string;
    permissions?: readonly string[];
    /** Preliminary admission for routes with resource-dependent capabilities. */
    recordUsage?: boolean;
  } = {},
): Promise<AdminAccessContext | NextResponse> {
  const permissions = [...new Set([...(options.permission ? [options.permission] : []), ...(options.permissions || [])])];
  // Bound aggregate checks independently of caller-provided input.
  if (permissions.length > 32) return adminAccessError(500, 'PERMISSION_LIMIT', 'Too many required admin permissions.', requestId);
  for (const permission of permissions) {
    if (!isAdminPermissionKey(permission)) return adminAccessError(500, 'UNKNOWN_PERMISSION', `Unknown admin permission: ${permission}`, requestId);
  }
  const resolved = await resolveAdminCredential(request, requestId);
  if (resolved instanceof NextResponse) return resolved;
  for (const permission of permissions.length ? permissions : [undefined]) {
    const checked = await checkResolvedAdminAccess(request, requestId, resolved, { roles: options.roles, permission });
    if (checked instanceof NextResponse) return checked;
  }
  if (options.recordUsage !== false && resolved.touchLastUsed) {
    try { await resolved.touchLastUsed(); }
    catch (error) { console.error('Unable to update admin service key usage timestamp:', error); }
  }
  return resolved.access;
}
