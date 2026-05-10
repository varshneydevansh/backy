import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { deleteAdminUser, getAdminUserById, listAdminUsers, updateAdminUser } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

type AdminUserRole = 'owner' | 'admin' | 'editor' | 'viewer';
type AdminUserStatus = 'active' | 'inactive' | 'invited' | 'suspended';
type AdminUserForSafeguard = {
  id: string;
  role: AdminUserRole;
  status: AdminUserStatus;
};

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

const normalizeStatus = (value: unknown): AdminUserStatus | null => (
  value === 'active' || value === 'inactive' || value === 'invited' || value === 'suspended' ? value : null
);

const normalizeUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item, index, values) => item && values.indexOf(item) === index);
};

const isActiveAdminAuthority = (user: AdminUserForSafeguard) => (
  (user.role === 'owner' || user.role === 'admin') && user.status === 'active'
);

const wouldRemoveLastAdminAuthority = (
  users: AdminUserForSafeguard[],
  selectedIds: Set<string>,
  nextStatus: AdminUserStatus | null,
) => {
  const remainingActiveAdmins = users.filter((user) => {
    if (!selectedIds.has(user.id)) {
      return isActiveAdminAuthority(user);
    }

    if (!nextStatus) {
      return false;
    }

    return isActiveAdminAuthority({ ...user, status: nextStatus });
  });

  return remainingActiveAdmins.length === 0;
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const action = body.action === 'delete' || body.action === 'updateStatus' ? body.action : null;

  if (!action) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Bulk action must be updateStatus or delete.', requestId);
  }

  const access = requireAdminAccess(request, requestId, {
    permission: action === 'delete' ? 'users.delete' : 'users.manage',
  });
  if (access instanceof NextResponse) {
    return access;
  }

  const userIds = normalizeUserIds(body.userIds);
  if (userIds.length === 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Select at least one user.', requestId);
  }

  if (access.session && userIds.includes(access.session.user.id)) {
    return errorResponse(409, 'CURRENT_USER_LOCKED', 'Use another owner/admin account to change your own access.', requestId);
  }

  const nextStatus = action === 'updateStatus' ? normalizeStatus(body.status) : null;
  if (action === 'updateStatus' && !nextStatus) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Status must be active, inactive, invited, or suspended.', requestId);
  }

  try {
    const selectedIds = new Set(userIds);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const allUsers = (await repositories.users.list({ limit: 1000, offset: 0 })).items;
      const existingUsers = allUsers.filter((user) => selectedIds.has(user.id));

      if (existingUsers.length !== userIds.length) {
        return errorResponse(404, 'USER_NOT_FOUND', 'One or more selected users were not found.', requestId);
      }

      if (wouldRemoveLastAdminAuthority(allUsers, selectedIds, nextStatus)) {
        return errorResponse(409, 'LAST_ADMIN_AUTHORITY', 'At least one active owner or admin must remain.', requestId);
      }

      if (action === 'delete') {
        const deletedUserIds: string[] = [];
        for (const user of existingUsers) {
          if (await repositories.users.delete(user.id)) {
            deletedUserIds.push(user.id);
          }
        }

        await recordAdminAudit({
          repositories,
          actorId: access.session?.user.id || null,
          entity: 'user',
          entityId: 'bulk',
          action: 'user.bulk.delete',
          before: { users: existingUsers },
          metadata: {
            count: deletedUserIds.length,
            userIds: deletedUserIds,
          },
          requestId,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            action,
            updated: 0,
            deleted: deletedUserIds.length,
            userIds: deletedUserIds,
            users: [],
          },
        });
      }

      const status = nextStatus;
      if (!status) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Status must be active, inactive, invited, or suspended.', requestId);
      }

      const updatedUsers = [];
      for (const user of existingUsers) {
        updatedUsers.push((await repositories.users.update(user.id, { status })).item);
      }

      await recordAdminAudit({
        repositories,
        actorId: access.session?.user.id || null,
        entity: 'user',
        entityId: 'bulk',
        action: 'user.bulk.status.update',
        before: { users: existingUsers },
        after: { users: updatedUsers },
        metadata: {
          count: updatedUsers.length,
          status,
          userIds,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          action,
          updated: updatedUsers.length,
          deleted: 0,
          userIds,
          users: updatedUsers,
        },
      });
    }

    const allUsers = listAdminUsers();
    const existingUsers = userIds
      .map((userId) => getAdminUserById(userId))
      .filter((user): user is NonNullable<ReturnType<typeof getAdminUserById>> => Boolean(user));

    if (existingUsers.length !== userIds.length) {
      return errorResponse(404, 'USER_NOT_FOUND', 'One or more selected users were not found.', requestId);
    }

    if (wouldRemoveLastAdminAuthority(allUsers, selectedIds, nextStatus)) {
      return errorResponse(409, 'LAST_ADMIN_AUTHORITY', 'At least one active owner or admin must remain.', requestId);
    }

    if (action === 'delete') {
      const deletedUserIds = existingUsers
        .filter((user) => deleteAdminUser(user.id))
        .map((user) => user.id);

      await recordAdminAudit({
        actorId: access.session?.user.id || null,
        entity: 'user',
        entityId: 'bulk',
        action: 'user.bulk.delete',
        before: { users: existingUsers },
        metadata: {
          count: deletedUserIds.length,
          userIds: deletedUserIds,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          action,
          updated: 0,
          deleted: deletedUserIds.length,
          userIds: deletedUserIds,
          users: [],
        },
      });
    }

    const status = nextStatus;
    if (!status) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Status must be active, inactive, invited, or suspended.', requestId);
    }

    const updatedUsers = existingUsers
      .map((user) => updateAdminUser(user.id, { status }))
      .filter((user): user is NonNullable<ReturnType<typeof updateAdminUser>> => Boolean(user));

    await recordAdminAudit({
      actorId: access.session?.user.id || null,
      entity: 'user',
      entityId: 'bulk',
      action: 'user.bulk.status.update',
      before: { users: existingUsers },
      after: { users: updatedUsers },
      metadata: {
        count: updatedUsers.length,
        status,
        userIds,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        action,
        updated: updatedUsers.length,
        deleted: 0,
        userIds,
        users: updatedUsers,
      },
    });
  } catch (error) {
    console.error('Admin users bulk API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
