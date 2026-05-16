import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminSessionWithPersistence, listAdminSessionPermissionOverrides, type AdminSession } from '@/lib/admin-auth/sessionStore';
import { getAdminSessionTokenFromRequest } from '@/lib/admin-auth/sessionCookie';
import { buildUserPermissionMatrix, isAdminPermissionKey, isOwnerOnlyAdminPermission } from '@/lib/adminPermissions';
import { getAdminSettings, listAdminTeamMembers, listAdminUserPermissionOverrides, updateAdminSettings } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

type AdminRole = AdminSession['user']['role'];
type AdminTeamScopeAction = 'view' | 'manage';

export type AdminAccessContext = {
  type: 'session' | 'api-key';
  session: AdminSession | null;
};

export type AdminTeamScopedResource = {
  teamId?: string | null;
};

const scopedTeamRoles: Record<AdminTeamScopeAction, AdminRole[]> = {
  view: ['owner', 'admin', 'editor', 'viewer'],
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
  touchLastUsed?: () => Promise<void>;
};

type ServiceAdminKeyGrant = {
  id?: unknown;
  keyHash?: unknown;
  revokedAt?: unknown;
  status?: unknown;
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
      return candidate.id;
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

    const serviceKeyId = findActiveServiceAdminKey(settings.auth, providedKey);
    return serviceKeyId
      ? {
          kind: 'service',
          touchLastUsed: async () => {
            const currentSettings = getAdminSettings();
            const auth = withTouchedServiceKey(currentSettings.auth, serviceKeyId, new Date().toISOString());
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

  const serviceKeyId = findActiveServiceAdminKey(settings.auth, providedKey);
  return serviceKeyId
    ? {
        kind: 'service',
        touchLastUsed: async () => {
          const currentSettings = await repositories.settings.get();
          const auth = withTouchedServiceKey(currentSettings.auth, serviceKeyId, new Date().toISOString());
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
    { status },
  )
);

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

export async function canAdminAccessTeamScope(
  access: AdminAccessContext,
  teamId: string | null | undefined,
  options: {
    action?: AdminTeamScopeAction;
    allowUnowned?: boolean;
  } = {},
): Promise<boolean> {
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

export async function requireAdminAccess(
  request: NextRequest,
  requestId: string,
  options: {
    roles?: AdminRole[];
    permission?: string;
  } = {},
): Promise<AdminAccessContext | NextResponse> {
  const allowedRoles = options.roles || ['owner', 'admin'];
  if (options.permission && !isAdminPermissionKey(options.permission)) {
    return adminAccessError(500, 'UNKNOWN_PERMISSION', `Unknown admin permission: ${options.permission}`, requestId);
  }
  const providedKey = getProvidedAdminKey(request);
  const environmentKeys = getEnvironmentAdminKeys();
  const configuredKeyMatch = providedKey && !environmentKeys.includes(providedKey)
    ? await resolveConfiguredAdminKey(providedKey)
    : null;

  if (providedKey && (environmentKeys.includes(providedKey) || configuredKeyMatch)) {
    if (options.permission && isOwnerOnlyAdminPermission(options.permission)) {
      return adminAccessError(403, 'FORBIDDEN_PERMISSION', 'Owner-only permissions require an owner admin session.', requestId);
    }
    if (configuredKeyMatch?.touchLastUsed) {
      try {
        await configuredKeyMatch.touchLastUsed();
      } catch (error) {
        console.error('Unable to update admin service key usage timestamp:', error);
      }
    }
    return {
      type: 'api-key',
      session: null,
    };
  }

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const session = await getAdminSessionWithPersistence(
    getAdminSessionTokenFromRequest(request),
    repositories ? { getUserById: repositories.users.getById } : {},
  );
  if (!session) {
    return adminAccessError(401, 'UNAUTHORIZED', 'A valid admin session or admin API key is required.', requestId);
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

    return {
      type: 'session',
      session,
    };
  }

  if (!hasRequiredRole(session.user.role, allowedRoles)) {
    return adminAccessError(403, 'FORBIDDEN', 'This admin account cannot manage users.', requestId);
  }

  return {
    type: 'session',
    session,
  };
}
