import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminUserById } from '@/lib/backyStore';
import {
  createAdminInviteToken,
} from '@/lib/admin-auth/sessionStore';
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'users.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { userId } = await context.params;
    const repositories = !shouldUseDemoStoreFallback()
      ? await getRequiredDatabaseRepositories()
      : null;
    const user = repositories
      ? await repositories.users.getById(userId)
      : getAdminUserById(userId);

    if (!user) {
      return errorResponse(404, 'USER_NOT_FOUND', 'User not found', requestId);
    }

    if (user.status !== 'invited') {
      return errorResponse(409, 'USER_NOT_INVITED', 'Set the account to invited before issuing an invite link.', requestId);
    }

    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const invite = createAdminInviteToken({
      user,
      requestedById: access.session?.user.id || null,
      origin,
      expiresInMinutes: 10080,
    });

    await recordAdminAudit({
      repositories,
      entity: 'user',
      entityId: user.id,
      action: 'user.invite_token.create',
      metadata: {
        email: user.email,
        role: user.role,
        status: user.status,
        inviteTokenId: invite.id,
        expiresAt: invite.expiresAt,
        requestedById: access.session?.user.id || null,
        deliveryConfigured: false,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        invite,
      },
    });
  } catch (error) {
    console.error('Admin user invite link API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
