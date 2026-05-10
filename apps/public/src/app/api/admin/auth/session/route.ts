import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth/sessionStore';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get('x-backy-admin-session')?.trim() || '';
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const session = getAdminSession(getBearerToken(request));

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        requestId,
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid admin session is required.',
        },
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      user: session.user,
      session: {
        token: session.token,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        authMode: session.authMode,
      },
    },
  });
}
