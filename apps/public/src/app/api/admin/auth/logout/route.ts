import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionWithPersistence, revokeAdminSession } from '@/lib/admin-auth/sessionStore';
import { clearAdminSessionCookie, getAdminSessionTokenFromRequest } from '@/lib/admin-auth/sessionCookie';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const token = getAdminSessionTokenFromRequest(request);
  const repositories = !shouldUseDemoStoreFallback()
    ? await getRequiredDatabaseRepositories()
    : null;
  const session = await getAdminSessionWithPersistence(
    token,
    repositories ? { getUserById: (userId) => repositories.users.getById(userId) } : {},
  );
  const revoked = revokeAdminSession(token);
  if (session) {
    await recordAdminAudit({
      repositories,
      actorId: session.user.id,
      entity: 'settings',
      entityId: 'platform',
      action: 'auth.logout',
      metadata: {
        userId: session.user.id,
        email: session.user.email,
        role: session.user.role,
        authMode: session.authMode,
        revoked,
      },
      requestId,
    });
  }

  return clearAdminSessionCookie(NextResponse.json({
    success: true,
    requestId,
    data: {
      revoked,
    },
  }));
}
