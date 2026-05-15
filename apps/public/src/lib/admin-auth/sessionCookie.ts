import type { NextRequest, NextResponse } from 'next/server';
import type { AdminSession } from '@/lib/admin-auth/sessionStore';

export const ADMIN_SESSION_COOKIE_NAME = 'backy_admin_session';

export const getAdminSessionCookieToken = (request: NextRequest): string => (
  request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim() || ''
);

export const getAdminSessionTokenFromRequest = (request: NextRequest): string => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim()
    || request.headers.get('x-backy-admin-session')?.trim()
    || getAdminSessionCookieToken(request);
};

export const attachAdminSessionCookie = (response: NextResponse, session: AdminSession): NextResponse => {
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  return response;
};

export const clearAdminSessionCookie = (response: NextResponse): NextResponse => {
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
};
