import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, getAdminSessionWithPersistence, rotateAdminSession } from '@/lib/admin-auth/sessionStore';
import { attachAdminSessionCookie, getAdminSessionTokenFromRequest } from '@/lib/admin-auth/sessionCookie';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminSettings } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const asAuthSettings = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

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

  const authSettings = repositories
    ? asAuthSettings((await repositories.settings.get()).auth)
    : asAuthSettings(getAdminSettings().auth);
  const rotated = rotateAdminSession(token, authSettings);

  if (!rotated) {
    return NextResponse.json(
      {
        success: false,
        requestId,
        error: {
          code: 'SESSION_ROTATION_FAILED',
          message: 'The current admin session could not be rotated.',
        },
      },
      { status: 409 },
    );
  }

  await recordAdminAudit({
    repositories,
    actorId: session.user.id,
    entity: 'settings',
    entityId: 'platform',
    action: 'auth.session.rotate',
    metadata: {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      authMode: session.authMode,
      previousSessionId: rotated.previousSessionId,
      newSessionId: rotated.newSessionId,
    },
    requestId,
  });

  return attachAdminSessionCookie(NextResponse.json({
    success: true,
    requestId,
    data: {
      user: rotated.session.user,
      session: {
        token: rotated.session.token,
        issuedAt: rotated.session.issuedAt,
        expiresAt: rotated.session.expiresAt,
        authMode: rotated.session.authMode,
      },
    },
  }), rotated.session);
}
