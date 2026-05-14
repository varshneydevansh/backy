import { NextRequest, NextResponse } from 'next/server';
import { acceptAdminInviteToken } from '@/lib/admin-auth/sessionStore';
import {
  getPersistedInviteToken,
  removePersistedInviteToken,
} from '@/lib/adminAuthTokenPersistence';
import { recordAdminAudit } from '@/lib/adminAudit';
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

const asAuthSettings = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Invite token is required.', requestId);
  }

  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const authSettings = repositories ? asAuthSettings((await repositories.settings.get()).auth) : undefined;
  const result = await acceptAdminInviteToken(token, repositories
    ? {
      getUserById: (userId) => repositories.users.getById(userId),
      updateUser: async (userId, input) => (await repositories.users.update(userId, input)).item,
      getInviteToken: async (candidateToken) => getPersistedInviteToken((await repositories.settings.get()).auth, candidateToken),
      consumeInviteToken: async (candidateToken) => {
        const current = await repositories.settings.get();
        await repositories.settings.update({
          auth: removePersistedInviteToken(current.auth, candidateToken),
        });
      },
    }
    : undefined, authSettings);
  if (!result.accepted) {
    const status = result.reason === 'expired'
      ? 410
      : result.reason === 'missing'
        ? 404
        : 409;
    const message = result.reason === 'expired'
      ? 'Invite link has expired.'
      : result.reason === 'missing'
        ? 'Invite token was not found.'
        : result.reason === 'not-invited'
          ? 'This account is no longer waiting for an invite.'
          : 'Invite token could not be accepted.';

    return errorResponse(status, `INVITE_${result.reason.replace(/-/g, '_').toUpperCase()}`, message, requestId);
  }

  await recordAdminAudit({
    repositories,
    actorId: result.user.id,
    entity: 'user',
    entityId: result.user.id,
    action: 'user.invite.accept',
    before: {
      status: result.previousStatus,
    },
    after: {
      status: result.user.status,
    },
    metadata: {
      email: result.user.email,
      role: result.user.role,
      inviteTokenId: result.invite.id,
      requestedById: result.invite.requestedById || null,
    },
    requestId,
  });

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      accepted: true,
      user: result.user,
      session: result.session,
      invite: {
        id: result.invite.id,
        email: result.invite.email,
        createdAt: result.invite.createdAt,
        expiresAt: result.invite.expiresAt,
        requestedById: result.invite.requestedById || null,
        deliveryConfigured: result.invite.deliveryConfigured,
      },
    },
  });
}
