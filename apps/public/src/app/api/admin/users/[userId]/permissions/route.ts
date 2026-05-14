import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { updateAdminSessionPermissionOverrides } from '@/lib/admin-auth/sessionStore';
import { recordAdminAudit } from '@/lib/adminAudit';
import { buildUserPermissionMatrix, isAdminPermissionKey } from '@/lib/adminPermissions';
import {
  applyAuthSettingsPermissionOverrides,
  listAuthSettingsPermissionOverrides,
} from '@/lib/adminPermissionOverrides';
import {
  getAdminUserById,
  listAdminUserPermissionOverrides,
  updateAdminUserPermissionOverrides,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
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

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const getUser = async (userId: string) => {
  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const user = repositories
    ? await repositories.users.getById(userId)
    : getAdminUserById(userId);

  return { repositories, user };
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { roles: ['owner', 'admin', 'editor', 'viewer'] });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;
    if (access.type === 'session' && access.session?.user.id !== userId) {
      const userManagementAccess = await requireAdminAccess(request, requestId, { permission: 'users.view' });
      if (userManagementAccess instanceof NextResponse) {
        return userManagementAccess;
      }
    }

    const { repositories, user } = await getUser(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    const overrides = repositories
      ? listAuthSettingsPermissionOverrides((await repositories.settings.get()).auth, user.id)
      : listAdminUserPermissionOverrides(user.id);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
        },
        permissions: buildUserPermissionMatrix(user, overrides),
      },
    });
  } catch (error) {
    console.error('Admin user permissions API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;
    const { repositories, user } = await getUser(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    const body = await parseJsonBody(request);
    const rawOverrides = body.overrides;

    if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
      return errorResponse(400, 'INVALID_OVERRIDES', 'Provide an overrides object keyed by permission.', requestId);
    }

    const overrides: Record<string, 'allow' | 'deny' | null> = {};
    for (const [permissionKey, value] of Object.entries(rawOverrides)) {
      if (!isAdminPermissionKey(permissionKey)) {
        return errorResponse(400, 'INVALID_PERMISSION_KEY', `Unknown permission key: ${permissionKey}`, requestId);
      }

      if (value !== 'allow' && value !== 'deny' && value !== null) {
        return errorResponse(400, 'INVALID_PERMISSION_VALUE', 'Permission overrides must be allow, deny, or null.', requestId);
      }

      overrides[permissionKey] = value;
    }

    const before = repositories
      ? listAuthSettingsPermissionOverrides((await repositories.settings.get()).auth, user.id)
      : listAdminUserPermissionOverrides(user.id);
    const savedOverrides = repositories
      ? await (async () => {
          const currentSettings = await repositories.settings.get();
          const next = applyAuthSettingsPermissionOverrides(currentSettings.auth, user.id, overrides);
          await repositories.settings.update({ auth: next.auth });
          updateAdminSessionPermissionOverrides(user.id, next.overrides);
          return next.overrides;
        })()
      : updateAdminUserPermissionOverrides(user.id, overrides);
    const permissions = buildUserPermissionMatrix(user, savedOverrides);

    await recordAdminAudit({
      repositories,
      actorId: access.session?.user.id || null,
      entity: 'user',
      entityId: user.id,
      action: 'user.permission_overrides.update',
      before: { overrides: before },
      after: { overrides: savedOverrides },
      metadata: {
        email: user.email,
        role: user.role,
        status: user.status,
        changedPermissionKeys: Object.keys(overrides),
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
        },
        permissions,
      },
    });
  } catch (error) {
    console.error('Admin user permission override API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
