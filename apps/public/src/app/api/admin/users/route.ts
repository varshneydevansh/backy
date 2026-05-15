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
import { createAdminUser, getAdminSettings, getAdminUserByEmail, listAdminUsers } from '@/lib/backyStore';
import { createAdminInviteToken } from '@/lib/admin-auth/sessionStore';
import { addPersistedInviteToken } from '@/lib/adminAuthTokenPersistence';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { deliverAdminInviteEmail } from '@/lib/adminUserEmailDelivery';
import type { BackySortDirection, BackyUserSortBy } from '@backy-cms/core';

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

const normalizeSortBy = (value: unknown): BackyUserSortBy | undefined => (
  value === 'fullName' ||
  value === 'email' ||
  value === 'role' ||
  value === 'status' ||
  value === 'createdAt' ||
  value === 'updatedAt'
    ? value
    : undefined
);

const normalizeSortDirection = (value: unknown): BackySortDirection | undefined => (
  value === 'asc' || value === 'desc' ? value : undefined
);

const parseBoundedInteger = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
};

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readBillingSeatPolicy = (settings: unknown) => {
  const root = toRecord(settings);
  const integrations = toRecord(root.integrations);
  const commerce = toRecord(integrations.commerce);
  const limit = Number(commerce.seatLimit);
  const overageMode = typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn';

  return {
    seatLimit: Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : 3,
    overageMode,
    billingPlan: typeof commerce.billingPlan === 'string' ? commerce.billingPlan : 'free',
    billingContactEmail: typeof commerce.billingContactEmail === 'string' ? commerce.billingContactEmail : '',
  };
};

const enforceSeatBillingLimit = (
  settings: unknown,
  currentUserCount: number,
  requestId: string,
) => {
  const policy = readBillingSeatPolicy(settings);
  if (policy.overageMode === 'block' && currentUserCount >= policy.seatLimit) {
    return errorResponse(
      402,
      'BILLING_SEAT_LIMIT',
      `The ${policy.billingPlan} billing policy allows ${policy.seatLimit} user seat${policy.seatLimit === 1 ? '' : 's'}. Update Settings billing limits before inviting another user.`,
      requestId,
    );
  }

  return null;
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'users.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseBoundedInteger(searchParams.get('limit'), 100, 1, 200);
    const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const sortBy = normalizeSortBy(searchParams.get('sortBy') || searchParams.get('sort') || undefined);
    const sortDirection = normalizeSortDirection(searchParams.get('sortDirection') || searchParams.get('direction') || undefined);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const result = await repositories.users.list({
        search: searchParams.get('search') || undefined,
        role: normalizeRole(searchParams.get('role') || undefined) || undefined,
        status: normalizeStatus(searchParams.get('status') || undefined) || undefined,
        sortBy,
        sortDirection,
        limit,
        offset,
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
      sortBy,
      sortDirection,
    });
    const pagedUsers = users.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        users: pagedUsers,
        pagination: {
          total: users.length,
          limit,
          offset,
          hasMore: offset + limit < users.length,
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
  const access = await requireAdminAccess(request, requestId, { permission: 'users.create' });
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

      const [settings, existingUsers] = await Promise.all([
        repositories.settings.get(),
        repositories.users.list({ limit: 1, offset: 0 }),
      ]);
      const billingLimitError = enforceSeatBillingLimit(settings, existingUsers.pagination.total, requestId);
      if (billingLimitError) {
        return billingLimitError;
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
          persistInMemory: false,
        })
        : null;
      const inviteDelivery = invite
        ? await deliverAdminInviteEmail({ user, invite, requestId })
        : null;
      const deliveredInvite = invite
        ? { ...invite, deliveryConfigured: inviteDelivery?.deliveryConfigured === true }
        : null;
      if (invite) {
        const currentSettings = await repositories.settings.get();
        await repositories.settings.update({
          auth: addPersistedInviteToken(currentSettings.auth, deliveredInvite || invite),
        });
      }
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
          inviteTokenId: deliveredInvite?.id || null,
          inviteExpiresAt: deliveredInvite?.expiresAt || null,
          deliveryConfigured: deliveredInvite?.deliveryConfigured === true,
          deliveryProvider: inviteDelivery?.provider || null,
          deliveryStatus: inviteDelivery?.status || null,
          deliveryStatusCode: inviteDelivery?.statusCode || null,
          deliveryError: inviteDelivery?.error || null,
        },
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            user,
            invite: deliveredInvite,
            inviteDelivery,
          },
        },
        { status: 201 },
      );
    }

    if (getAdminUserByEmail(email)) {
      return errorResponse(409, 'EMAIL_CONFLICT', 'A user with this email already exists', requestId);
    }

    const billingLimitError = enforceSeatBillingLimit(getAdminSettings(), listAdminUsers().length, requestId);
    if (billingLimitError) {
      return billingLimitError;
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
    const inviteDelivery = invite
      ? await deliverAdminInviteEmail({ user, invite, requestId })
      : null;
    const deliveredInvite = invite
      ? { ...invite, deliveryConfigured: inviteDelivery?.deliveryConfigured === true }
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
        inviteTokenId: deliveredInvite?.id || null,
        inviteExpiresAt: deliveredInvite?.expiresAt || null,
        deliveryConfigured: deliveredInvite?.deliveryConfigured === true,
        deliveryProvider: inviteDelivery?.provider || null,
        deliveryStatus: inviteDelivery?.status || null,
        deliveryStatusCode: inviteDelivery?.statusCode || null,
        deliveryError: inviteDelivery?.error || null,
      },
      requestId,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          user,
          invite: deliveredInvite,
          inviteDelivery,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin user create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
