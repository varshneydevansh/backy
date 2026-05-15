import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, getAdminSessionWithPersistence } from '@/lib/admin-auth/sessionStore';
import { attachAdminSessionCookie, getAdminSessionTokenFromRequest } from '@/lib/admin-auth/sessionCookie';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const token = getAdminSessionTokenFromRequest(request);
  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const session = repositories
    ? await getAdminSessionWithPersistence(token, {
      getUserById: (userId) => repositories.users.getById(userId),
    })
    : getAdminSession(token);

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

  return attachAdminSessionCookie(NextResponse.json({
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
  }), session);
}
