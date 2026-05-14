/**
 * Admin users endpoint.
 *
 * GET  /api/admin/users
 * POST /api/admin/users
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getAdminAuthPolicySettings,
  validateAdminEmailDomainPolicy,
  validateAdminInviteOnlyCreatePolicy,
} from '@/lib/admin-auth/emailPolicy';
import { createAdminUser, getAdminUserByEmail, listAdminUsers } from '@/lib/backyStore';
import { createAdminInviteToken } from '@/lib/admin-auth/sessionStore';
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

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeRole = (value: unknown): 'owner' | 'admin' | 'editor' | 'viewer' | null => (
  value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer' ? value : null
);

const normalizeStatus = (value: unknown): 'active' | 'inactive' | 'invited' | 'suspended' | null => (
  value === 'active' || value === 'inactive' || value === 'invited' || value === 'suspended' ? value : null
);

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { searchParams } = new URL(request.url);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const result = await repositories.users.list({
        search: searchParams.get('search') || undefined,
        role: normalizeRole(searchParams.get('role') || undefined) || undefined,
        status: normalizeStatus(searchParams.get('status') || undefined) || undefined,
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          users: result.items,
          pagination: result.pagination,
        },
      });
    }

    const users = listAdminUsers({
      search: searchParams.get('search') || undefined,
      role: searchParams.get('role') || undefined,
      status: searchParams.get('status') || undefined,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        users,
        pagination: {
          total: users.length,
          limit: users.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin users list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'users.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const body = await parseJsonBody(request);
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);
    const status = normalizeStatus(body.status) || 'invited';
    const shouldCreateInvite = status === 'invited' && body.createInvite !== false;

    if (!fullName) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Full name is required', requestId);
    }

    if (!email || !email.includes('@')) {
      return errorResponse(400, 'VALIDATION_ERROR', 'A valid email address is required', requestId);
    }

    const authPolicySettings = await getAdminAuthPolicySettings();
    const emailPolicy = await validateAdminEmailDomainPolicy(email, authPolicySettings);
    if (!emailPolicy.ok) {
      return errorResponse(400, 'EMAIL_DOMAIN_NOT_ALLOWED', emailPolicy.message, requestId);
    }

    const inviteOnlyPolicy = await validateAdminInviteOnlyCreatePolicy(status, authPolicySettings);
    if (!inviteOnlyPolicy.ok) {
      return errorResponse(400, 'INVITE_ONLY_REQUIRED', inviteOnlyPolicy.message, requestId);
    }

    if (!role) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Role must be owner, admin, editor, or viewer', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      if (await repositories.users.getByEmail(email)) {
        return errorResponse(409, 'EMAIL_CONFLICT', 'A user with this email already exists', requestId);
      }

      const user = (await repositories.users.create({
        fullName,
        email,
        role,
        status,
      })).item;
      const invite = shouldCreateInvite
        ? createAdminInviteToken({
          user,
          requestedById: access.session?.user.id || null,
          origin: request.headers.get('origin') || request.nextUrl.origin,
        })
        : null;
      await recordAdminAudit({
        repositories,
        entity: 'user',
        entityId: user.id,
        action: 'create',
        after: user,
        metadata: {
          email: user.email,
          role: user.role,
          status: user.status,
          inviteTokenId: invite?.id || null,
          inviteExpiresAt: invite?.expiresAt || null,
          deliveryConfigured: false,
        },
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            user,
            invite,
          },
        },
        { status: 201 },
      );
    }

    if (getAdminUserByEmail(email)) {
      return errorResponse(409, 'EMAIL_CONFLICT', 'A user with this email already exists', requestId);
    }

    const user = createAdminUser({
      ...body,
      fullName,
      email,
      role,
      status,
    });
    const invite = shouldCreateInvite
      ? createAdminInviteToken({
        user,
        requestedById: access.session?.user.id || null,
        origin: request.headers.get('origin') || request.nextUrl.origin,
      })
      : null;
    await recordAdminAudit({
      entity: 'user',
      entityId: user.id,
      action: 'create',
      after: user,
      metadata: {
        email: user.email,
        role: user.role,
        status: user.status,
        inviteTokenId: invite?.id || null,
        inviteExpiresAt: invite?.expiresAt || null,
        deliveryConfigured: false,
      },
      requestId,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          user,
          invite,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin user create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
