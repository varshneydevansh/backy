import { NextRequest, NextResponse } from 'next/server';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminUserById } from '@/lib/backyStore';
import {
  createAdminPasswordResetToken,
  getAdminSession,
} from '@/lib/admin-auth/sessionStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get('x-backy-admin-session')?.trim() || '';
};

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
  const currentSession = getAdminSession(getBearerToken(request));

  if (!currentSession) {
    return errorResponse(401, 'UNAUTHORIZED', 'A valid admin session is required.', requestId);
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

    if (user.status === 'inactive' || user.status === 'suspended') {
      return errorResponse(409, 'USER_NOT_ACTIVE', 'Activate the account before issuing a password reset token.', requestId);
    }

    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const reset = createAdminPasswordResetToken({
      user,
      requestedById: currentSession.user.id,
      origin,
      expiresInMinutes: 60,
    });

    await recordAdminAudit({
      repositories,
      entity: 'user',
      entityId: user.id,
      action: 'user.password_reset_token.create',
      metadata: {
        email: user.email,
        role: user.role,
        status: user.status,
        resetTokenId: reset.id,
        expiresAt: reset.expiresAt,
        requestedById: currentSession.user.id,
        deliveryConfigured: false,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        reset,
      },
    });
  } catch (error) {
    console.error('Admin user password reset API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
