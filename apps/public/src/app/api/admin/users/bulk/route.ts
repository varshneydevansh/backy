import { operatorLifecycleErrorResponse, readCompleteOperatorInventory } from '@/lib/adminUserLifecycle';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess, requireAdminOwnerManagementAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminAuthPolicySettings,
  validateAdminInviteOnlyActivationPolicy,
} from '@/lib/admin-auth/emailPolicy';
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

const validateBulkInviteOnlyStatusPolicy = async (
  users: AdminUserForSafeguard[],
  nextStatus: AdminUserStatus,
) => {
  const authPolicySettings = await getAdminAuthPolicySettings();

  for (const user of users) {
    const inviteOnlyPolicy = await validateAdminInviteOnlyActivationPolicy(user.status, nextStatus, authPolicySettings);
    if (!inviteOnlyPolicy.ok) {
      return inviteOnlyPolicy;
    }
  }

  return {
    ok: true as const,
    inviteOnly: authPolicySettings.inviteOnly === true,
  };
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const action = body.action === 'delete' || body.action === 'updateStatus' ? body.action : null;

  if (!action) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Bulk action must be updateStatus or delete.', requestId);
  }

  const access = await requireAdminAccess(request, requestId, {
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

  const committedUserIds: string[] = [];
  const committedUsers: unknown[] = [];
  let phase: 'writes' | 'audit' = 'writes';
  let currentTargetId: string | null = null;
  try {
    const selectedIds = new Set(userIds);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const allUsers = await readCompleteOperatorInventory(repositories.users);
      const existingUsers = allUsers.filter((user) => selectedIds.has(user.id));

      if (existingUsers.length !== userIds.length) {
        return errorResponse(404, 'USER_NOT_FOUND', 'One or more selected users were not found.', requestId);
      }

      for (const user of existingUsers) {
        const ownerError = requireAdminOwnerManagementAccess(access, requestId, { currentRole: user.role });
        if (ownerError) return ownerError;
      }

      if (wouldRemoveLastAdminAuthority(allUsers, selectedIds, nextStatus)) {
        return errorResponse(409, 'LAST_ADMIN_AUTHORITY', 'At least one active owner or admin must remain.', requestId);
      }

      if (action === 'delete') {
        const deletedUserIds: string[] = [];
        for (const user of existingUsers) {
          currentTargetId = user.id;
          if (await repositories.users.delete(user.id)) {
            deletedUserIds.push(user.id);
            committedUserIds.push(user.id);
          }
        }

        phase = 'audit';
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
            outcome: 'complete', completionWarnings: [], failedTargets: [], reloadRequired: false,
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

      const inviteOnlyPolicy = await validateBulkInviteOnlyStatusPolicy(existingUsers, status);
      if (!inviteOnlyPolicy.ok) {
        return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
      }

      const updatedUsers = [];
      for (const user of existingUsers) {
        currentTargetId = user.id;
        const saved = (await repositories.users.update(user.id, { status })).item;
        updatedUsers.push(saved);
        committedUserIds.push(user.id);
        committedUsers.push(saved);
      }

      phase = 'audit';
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
          outcome: 'complete', completionWarnings: [], failedTargets: [], reloadRequired: false,
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

    for (const user of existingUsers) {
      const ownerError = requireAdminOwnerManagementAccess(access, requestId, { currentRole: user.role });
      if (ownerError) return ownerError;
    }

    if (wouldRemoveLastAdminAuthority(allUsers, selectedIds, nextStatus)) {
      return errorResponse(409, 'LAST_ADMIN_AUTHORITY', 'At least one active owner or admin must remain.', requestId);
    }

    if (action === 'delete') {
      const deletedUserIds: string[] = [];
      for (const user of existingUsers) {
        currentTargetId = user.id;
        if (deleteAdminUser(user.id)) { deletedUserIds.push(user.id); committedUserIds.push(user.id); }
      }

      phase = 'audit';
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
          outcome: 'complete', completionWarnings: [], failedTargets: [], reloadRequired: false,
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

    const inviteOnlyPolicy = await validateBulkInviteOnlyStatusPolicy(existingUsers, status);
    if (!inviteOnlyPolicy.ok) {
      return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
    }

    const updatedUsers: NonNullable<ReturnType<typeof updateAdminUser>>[] = [];
    for (const user of existingUsers) {
      currentTargetId = user.id;
      const saved = updateAdminUser(user.id, { status });
      if (saved) { updatedUsers.push(saved); committedUserIds.push(user.id); committedUsers.push(saved); }
    }

    phase = 'audit';
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
        outcome: 'complete', completionWarnings: [], failedTargets: [], reloadRequired: false,
        updated: updatedUsers.length,
        deleted: 0,
        userIds,
        users: updatedUsers,
      },
    });
  } catch (error) {
    if (committedUserIds.length) {
      const rawCode = error && typeof error === 'object' && 'code' in error ? error.code : '';
      const code = rawCode === 'LAST_ADMIN_AUTHORITY' || rawCode === 'OPERATOR_AUTHORITY_BUSY' || rawCode === 'OPERATOR_AUTHORITY_UNAVAILABLE' ? rawCode : 'OPERATOR_WRITE_FAILED';
      return NextResponse.json({ success: true, requestId, data: {
        action, outcome: 'partial', updated: action === 'updateStatus' ? committedUsers.length : 0,
        deleted: action === 'delete' ? committedUserIds.length : 0,
        userIds: committedUserIds, users: committedUsers,
        failedTargets: phase === 'writes' ? userIds.filter(id => !committedUserIds.includes(id)).map(userId => ({ userId, code: userId === currentTargetId ? code : 'OPERATOR_NOT_ATTEMPTED' })) : [],
        completionWarnings: [phase === 'audit' ? 'OPERATOR_BULK_AUDIT_PENDING' : 'OPERATOR_BULK_APPLY_INCOMPLETE'],
        reloadRequired: true,
      } }, { headers: { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' } });
    }
    const lifecycleError = operatorLifecycleErrorResponse(error, requestId);
    if (lifecycleError) return lifecycleError;
    console.error('Admin users bulk API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
