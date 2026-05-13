import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuthRateLimit, resetAdminPasswordToken } from '@/lib/admin-auth/sessionStore';
import { recordAdminAudit } from '@/lib/adminAudit';

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

const getClientAddress = (request: NextRequest) => (
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || request.headers.get('x-real-ip')?.trim()
  || 'unknown'
);

const rateLimitResponse = (requestId: string, retryAfterSeconds: number) => {
  const response = NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many password reset attempts. Please wait before trying again.',
      },
    },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!token) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Password reset token is required.', requestId);
  }

  if (password.length < 8) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.', requestId);
  }

  const clientAddress = getClientAddress(request);
  const clientLimit = checkAdminAuthRateLimit({
    scope: 'password-reset',
    identifier: `client:${clientAddress}`,
    bucket: 'client',
  });
  if (!clientLimit.allowed) {
    return rateLimitResponse(requestId, clientLimit.retryAfterSeconds);
  }

  const principalLimit = checkAdminAuthRateLimit({
    scope: 'password-reset',
    identifier: `token:${token}`,
    bucket: 'principal',
  });
  if (!principalLimit.allowed) {
    return rateLimitResponse(requestId, principalLimit.retryAfterSeconds);
  }

  const result = resetAdminPasswordToken(token, password);
  if (!result.reset) {
    const status = result.reason === 'expired'
      ? 410
      : result.reason === 'missing'
        ? 404
        : 409;
    const message = result.reason === 'expired'
      ? 'Password reset link has expired.'
      : result.reason === 'missing'
        ? 'Password reset token was not found.'
        : result.reason === 'inactive'
          ? 'This account must be active or invited before password reset.'
          : 'Password reset token could not be accepted.';

    return errorResponse(status, `RESET_${result.reason.replace(/-/g, '_').toUpperCase()}`, message, requestId);
  }

  await recordAdminAudit({
    actorId: result.user.id,
    entity: 'user',
    entityId: result.user.id,
    action: 'user.password_reset.accept',
    before: {
      status: result.previousStatus,
    },
    after: {
      status: result.user.status,
    },
    metadata: {
      email: result.user.email,
      role: result.user.role,
      resetTokenId: result.resetToken.id,
      requestedById: result.resetToken.requestedById || null,
      localCredentialUpdated: true,
    },
    requestId,
  });

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      reset: true,
      user: result.user,
      session: result.session,
      resetToken: {
        id: result.resetToken.id,
        email: result.resetToken.email,
        createdAt: result.resetToken.createdAt,
        expiresAt: result.resetToken.expiresAt,
        requestedById: result.resetToken.requestedById || null,
        deliveryConfigured: result.resetToken.deliveryConfigured,
      },
    },
  });
}
