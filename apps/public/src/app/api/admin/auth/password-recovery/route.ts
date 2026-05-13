import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuthRateLimit } from '@/lib/admin-auth/sessionStore';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
        message: 'Too many recovery requests. Please wait before trying again.',
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
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !email.includes('@')) {
    return NextResponse.json(
      {
        success: false,
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid workspace email is required.',
        },
      },
      { status: 400 },
    );
  }

  const clientAddress = getClientAddress(request);
  const clientLimit = checkAdminAuthRateLimit({
    scope: 'password-recovery',
    identifier: `client:${clientAddress}`,
    bucket: 'client',
  });
  if (!clientLimit.allowed) {
    return rateLimitResponse(requestId, clientLimit.retryAfterSeconds);
  }

  const principalLimit = checkAdminAuthRateLimit({
    scope: 'password-recovery',
    identifier: `email:${email}`,
    bucket: 'principal',
  });
  if (!principalLimit.allowed) {
    return rateLimitResponse(requestId, principalLimit.retryAfterSeconds);
  }

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      accepted: true,
      deliveryConfigured: false,
      message: 'If recovery is available for this account, the next steps will be sent through the configured recovery channel.',
    },
  });
}
