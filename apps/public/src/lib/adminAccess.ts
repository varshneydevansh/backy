import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, type AdminSession } from '@/lib/admin-auth/sessionStore';
import { buildUserPermissionMatrix, isAdminPermissionKey } from '@/lib/adminPermissions';
import { getAdminSettings, listAdminUserPermissionOverrides } from '@/lib/backyStore';

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

const getExpectedAdminKeys = () => [
  process.env.BACKY_ADMIN_API_KEY?.trim() || '',
  process.env.BACKY_ADMIN_SECRET_KEY?.trim() || '',
  getAdminSettings().apiKeys?.adminApiKey?.trim() || '',
].filter((value, index, values) => value && values.indexOf(value) === index);

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

export function requireAdminAccess(
  request: NextRequest,
  requestId: string,
  options: {
    roles?: AdminRole[];
    permission?: string;
  } = {},
): AdminAccessContext | NextResponse {
  const allowedRoles = options.roles || ['owner', 'admin'];
  const providedKey = getProvidedAdminKey(request);
  const expectedKeys = getExpectedAdminKeys();

  if (providedKey && expectedKeys.includes(providedKey)) {
    return {
      type: 'api-key',
      session: null,
    };
  }

  const session = getAdminSession(getBearerToken(request));
  if (!session) {
    return adminAccessError(401, 'UNAUTHORIZED', 'A valid admin session or admin API key is required.', requestId);
  }

  if (options.permission) {
    if (!isAdminPermissionKey(options.permission)) {
      return adminAccessError(500, 'UNKNOWN_PERMISSION', `Unknown admin permission: ${options.permission}`, requestId);
    }

    const overrides = listAdminUserPermissionOverrides(session.user.id);
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
