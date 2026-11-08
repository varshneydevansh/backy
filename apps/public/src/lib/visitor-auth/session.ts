import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { BackyVisitorAccountRepository, BackySiteVisitor } from '@backy-cms/core';
export const visitorTokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const visitorCookieName = (siteId: string) => `backy_visitor_${visitorTokenHash(siteId).slice(0, 16)}`;
export const newVisitorToken = () => `bkv_${randomBytes(32).toString('base64url')}`;
export const getVisitorSessionToken = (request: NextRequest, siteId: string): string => {
  const bearer = request.headers.get('authorization')?.match(/^Bearer (bkv_[A-Za-z0-9_-]{43})$/)?.[1];
  const token = bearer || request.headers.get('x-backy-visitor-session') || request.cookies.get(visitorCookieName(siteId))?.value || '';
  return /^bkv_[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
};
export async function resolveVisitorSession(request: NextRequest, siteId: string, repository: BackyVisitorAccountRepository): Promise<BackySiteVisitor | null> {
  const token = getVisitorSessionToken(request, siteId);
  return token ? repository.resolveSession(siteId, visitorTokenHash(token), new Date().toISOString()) : null;
}
export const setVisitorCookie = (response: NextResponse, siteId: string, token: string, expiresAt: string): NextResponse => {
  response.cookies.set(visitorCookieName(siteId), token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: new Date(expiresAt) }); return response;
};
export const clearVisitorCookie = (response: NextResponse, siteId: string): NextResponse => {
  response.cookies.set(visitorCookieName(siteId), '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 }); return response;
};
