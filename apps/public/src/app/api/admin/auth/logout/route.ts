import { NextRequest, NextResponse } from 'next/server';
import { revokeAdminSession } from '@/lib/admin-auth/sessionStore';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get('x-backy-admin-session')?.trim() || '';
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const revoked = revokeAdminSession(getBearerToken(request));

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      revoked,
    },
  });
}
