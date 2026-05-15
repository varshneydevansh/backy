import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminSessionWithPersistence, listAdminSessionPermissionOverrides, type AdminSession } from '@/lib/admin-auth/sessionStore';
import { buildUserPermissionMatrix, isAdminPermissionKey, isOwnerOnlyAdminPermission } from '@/lib/adminPermissions';
import { getAdminSettings, listAdminUserPermissionOverrides } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

type AdminRole = AdminSession['user']['role'];

export type AdminAccessContext = {
  type: 'session' | 'api-key';
  session: AdminSession | null;
};

const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get('x-backy-admin-session')?.trim() || '';
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

const isActiveServiceAdminKey = (auth: unknown, providedKey: string) => {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
    return false;
  }

  const grants = (auth as { apiKeyServiceKeys?: unknown }).apiKeyServiceKeys;
  if (!Array.isArray(grants)) {
    return false;
  }

  const providedHash = keyHash(providedKey);
  return grants.some((grant) => {
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
      return false;
    }

    const candidate = grant as {
      keyHash?: unknown;
      revokedAt?: unknown;
      status?: unknown;
    };
    return candidate.keyHash === providedHash && !candidate.revokedAt && candidate.status !== 'revoked';
  });
};

const isConfiguredAdminKey = async (providedKey: string) => {
  if (!providedKey) {
    return false;
  }

  if (shouldUseDemoStoreFallback()) {
    const settings = getAdminSettings();
    return settings.apiKeys?.adminApiKey?.trim() === providedKey || isActiveServiceAdminKey(settings.auth, providedKey);
  }

  const repositories = await getRequiredDatabaseRepositories();
  const settings = await repositories.settings.get();
  return settings.apiKeys?.secretKeyId?.trim() === providedKey || isActiveServiceAdminKey(settings.auth, providedKey);
};

const hasRequiredRole = (role: AdminRole, allowedRoles: AdminRole[]) => allowedRoles.includes(role);

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
  const configuredKeyMatches = providedKey && !environmentKeys.includes(providedKey)
    ? await isConfiguredAdminKey(providedKey)
    : false;

  if (providedKey && (environmentKeys.includes(providedKey) || configuredKeyMatches)) {
    if (options.permission && isOwnerOnlyAdminPermission(options.permission)) {
      return adminAccessError(403, 'FORBIDDEN_PERMISSION', 'Owner-only permissions require an owner admin session.', requestId);
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
    getBearerToken(request),
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
