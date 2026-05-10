import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  listAdminSessions,
  revokeAdminSessionById,
} from '@/lib/admin-auth/sessionStore';

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

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const currentToken = getBearerToken(request);
  const access = requireAdminAccess(request, requestId, { permission: 'users.manage' });

  if (access instanceof NextResponse) {
    return access;
  }

  if (!access.session) {
    return errorResponse(401, 'UNAUTHORIZED', 'A valid admin session is required.', requestId);
  }

  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId')?.trim() || '';
  const email = searchParams.get('email')?.trim() || '';

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      sessions: listAdminSessions({
        currentToken,
        userId,
        email,
      }),
    },
  });
}

export async function DELETE(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const currentToken = getBearerToken(request);
  const access = requireAdminAccess(request, requestId, { permission: 'users.manage' });

  if (access instanceof NextResponse) {
    return access;
  }

  if (!access.session) {
    return errorResponse(401, 'UNAUTHORIZED', 'A valid admin session is required.', requestId);
  }

  const body = await parseJsonBody(request);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return errorResponse(400, 'VALIDATION_ERROR', 'A session id is required.', requestId);
  }

  const result = revokeAdminSessionById(sessionId, currentToken);
  if (result.current) {
    return errorResponse(409, 'CURRENT_SESSION_LOCKED', 'Use Log out to revoke your current session.', requestId);
  }

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      revoked: result.revoked,
    },
  });
}
