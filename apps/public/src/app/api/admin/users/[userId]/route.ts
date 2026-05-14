/**
 * Admin user detail endpoint.
 *
 * GET    /api/admin/users/:userId
 * PATCH  /api/admin/users/:userId
 * DELETE /api/admin/users/:userId
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminAuthPolicySettings,
  validateAdminEmailDomainPolicy,
  validateAdminInviteOnlyActivationPolicy,
} from '@/lib/admin-auth/emailPolicy';
import { deleteAdminUser, getAdminUserByEmail, getAdminUserById, listAdminUsers, updateAdminUser } from '@/lib/backyStore';
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

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeRole = (value: unknown): AdminUserRole | null => (
  value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer' ? value : null
);

const normalizeStatus = (value: unknown): AdminUserStatus | null => (
  value === 'active' || value === 'inactive' || value === 'invited' || value === 'suspended' ? value : null
);

const isActiveAdminAuthority = (user: AdminUserForSafeguard) => (
  (user.role === 'owner' || user.role === 'admin') && user.status === 'active'
);

const wouldRemoveLastAdminAuthority = (
  users: AdminUserForSafeguard[],
  current: AdminUserForSafeguard,
  next: Pick<AdminUserForSafeguard, 'role' | 'status'> | null,
) => {
  if (!isActiveAdminAuthority(current)) {
    return false;
  }

  const currentStillHasAuthority = next
    ? isActiveAdminAuthority({ ...current, role: next.role, status: next.status })
    : false;

  if (currentStillHasAuthority) {
    return false;
  }

  return users.filter((user) => user.id !== current.id).every((user) => !isActiveAdminAuthority(user));
};

const lastAdminError = (requestId: string) => (
  errorResponse(
    409,
    'LAST_ADMIN_AUTHORITY',
    'At least one active owner or admin must remain.',
    requestId,
  )
);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const user = await repositories.users.getById(userId);

      if (!user) {
        return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          user,
        },
      });
    }

    const user = getAdminUserById(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error('Admin user detail API error:', error);
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

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const current = await repositories.users.getById(userId);

      if (!current) {
        return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
      }

      const body = await parseJsonBody(request);
      const nextEmail = body.email === undefined ? current.email : normalizeEmail(body.email);
      const nextRole = body.role === undefined ? current.role : normalizeRole(body.role);
      const nextStatus = body.status === undefined ? current.status : normalizeStatus(body.status);
      const authPolicySettings = await getAdminAuthPolicySettings();

      if (body.fullName !== undefined && (typeof body.fullName !== 'string' || !body.fullName.trim())) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Full name cannot be blank', requestId);
      }

      if (!nextEmail || !nextEmail.includes('@')) {
        return errorResponse(400, 'VALIDATION_ERROR', 'A valid email address is required', requestId);
      }

      if (nextEmail !== current.email) {
        const emailPolicy = await validateAdminEmailDomainPolicy(nextEmail, authPolicySettings);
        if (!emailPolicy.ok) {
          return errorResponse(400, 'EMAIL_DOMAIN_NOT_ALLOWED', emailPolicy.message, requestId);
        }
      }

      if (!nextRole) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Role must be owner, admin, editor, or viewer', requestId);
      }

      if (!nextStatus) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Status must be active, inactive, invited, or suspended', requestId);
      }

      const inviteOnlyPolicy = await validateAdminInviteOnlyActivationPolicy(current.status, nextStatus, authPolicySettings);
      if (!inviteOnlyPolicy.ok) {
        return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
      }

      const emailOwner = await repositories.users.getByEmail(nextEmail);
      if (emailOwner && emailOwner.id !== userId) {
        return errorResponse(409, 'EMAIL_CONFLICT', 'A user with this email already exists', requestId);
      }

      const allUsers = (await repositories.users.list({ limit: 100, offset: 0 })).items;
      if (wouldRemoveLastAdminAuthority(allUsers, current, { role: nextRole, status: nextStatus })) {
        return lastAdminError(requestId);
      }

      const user = (await repositories.users.update(userId, {
        ...(body.fullName !== undefined ? { fullName: String(body.fullName).trim() } : {}),
        email: nextEmail,
        role: nextRole,
        status: nextStatus,
        ...(typeof body.avatarUrl === 'string' ? { avatarUrl: body.avatarUrl.trim() || null } : {}),
      })).item;
      await recordAdminAudit({
        repositories,
        entity: 'user',
        entityId: user.id,
        action: 'update',
        before: current,
        after: user,
        metadata: {
          changedFields: Object.keys(body).filter((key) => ['fullName', 'email', 'role', 'status', 'avatarUrl'].includes(key)),
          email: user.email,
          role: user.role,
          status: user.status,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          user,
        },
      });
    }

    const current = getAdminUserById(userId);

    if (!current) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    const body = await parseJsonBody(request);
    const nextEmail = body.email === undefined ? current.email : normalizeEmail(body.email);
    const nextRole = body.role === undefined ? current.role : normalizeRole(body.role);
    const nextStatus = body.status === undefined ? current.status : normalizeStatus(body.status);
    const authPolicySettings = await getAdminAuthPolicySettings();

    if (body.fullName !== undefined && (typeof body.fullName !== 'string' || !body.fullName.trim())) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Full name cannot be blank', requestId);
    }

    if (!nextEmail || !nextEmail.includes('@')) {
      return errorResponse(400, 'VALIDATION_ERROR', 'A valid email address is required', requestId);
    }

    if (nextEmail !== current.email) {
      const emailPolicy = await validateAdminEmailDomainPolicy(nextEmail, authPolicySettings);
      if (!emailPolicy.ok) {
        return errorResponse(400, 'EMAIL_DOMAIN_NOT_ALLOWED', emailPolicy.message, requestId);
      }
    }

    if (!nextRole) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Role must be owner, admin, editor, or viewer', requestId);
    }

    if (!nextStatus) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Status must be active, inactive, invited, or suspended', requestId);
    }

    const inviteOnlyPolicy = await validateAdminInviteOnlyActivationPolicy(current.status, nextStatus, authPolicySettings);
    if (!inviteOnlyPolicy.ok) {
      return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
    }

    const emailOwner = getAdminUserByEmail(nextEmail);
    if (emailOwner && emailOwner.id !== userId) {
      return errorResponse(409, 'EMAIL_CONFLICT', 'A user with this email already exists', requestId);
    }

    const allUsers = listAdminUsers();
    if (wouldRemoveLastAdminAuthority(allUsers, current, { role: nextRole, status: nextStatus })) {
      return lastAdminError(requestId);
    }

    const user = updateAdminUser(userId, {
      ...body,
      email: nextEmail,
      role: nextRole,
      status: nextStatus,
    });

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }
    await recordAdminAudit({
      entity: 'user',
      entityId: user.id,
      action: 'update',
      before: current,
      after: user,
      metadata: {
        changedFields: Object.keys(body).filter((key) => ['fullName', 'email', 'role', 'status', 'avatarUrl'].includes(key)),
        email: user.email,
        role: user.role,
        status: user.status,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error('Admin user update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.delete' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const current = await repositories.users.getById(userId);

      if (!current) {
        return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
      }

      const allUsers = (await repositories.users.list({ limit: 100, offset: 0 })).items;
      if (wouldRemoveLastAdminAuthority(allUsers, current, null)) {
        return lastAdminError(requestId);
      }

      const deleted = await repositories.users.delete(userId);

      if (!deleted) {
        return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
      }
      await recordAdminAudit({
        repositories,
        entity: 'user',
        entityId: current.id,
        action: 'delete',
        before: current,
        metadata: {
          email: current.email,
          role: current.role,
          status: current.status,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          userId,
        },
      });
    }

    const current = getAdminUserById(userId);
    if (!current) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    if (wouldRemoveLastAdminAuthority(listAdminUsers(), current, null)) {
      return lastAdminError(requestId);
    }

    const deleted = deleteAdminUser(userId);

    if (!deleted) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }
    await recordAdminAudit({
      entity: 'user',
      entityId: current.id,
      action: 'delete',
      before: current,
      metadata: {
        email: current.email,
        role: current.role,
        status: current.status,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        userId,
      },
    });
  } catch (error) {
    console.error('Admin user delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
