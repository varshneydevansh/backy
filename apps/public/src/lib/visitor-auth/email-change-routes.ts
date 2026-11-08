import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { BackyVisitorAccountRepository } from '@backy-cms/core';
import { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';
import { VisitorAccessError, visitorAuthPolicy } from './routes';
import { authenticateVisitorProviderSession, requestVisitorProviderEmailChange } from './provider';
import { clearVisitorCookie, getVisitorSessionToken, resolveVisitorSession, visitorTokenHash } from './session';

type Operation = 'email-change' | 'confirm-email-change';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'private, no-store', pragma: 'no-cache', vary: 'Origin, Cookie, Authorization', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
const denied = () => new VisitorAccessError(401, 'VISITOR_AUTHENTICATION_REQUIRED', 'A current account for this website is required.');
const invalid = () => new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', 'Provide only the required email-change fields.');
const emailOf = (value: unknown): string => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || /\p{Cc}/u.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid();
  return email;
};
const passwordOf = (value: unknown): string => { if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > 1024) throw invalid(); return value; };
async function readBody(request: NextRequest, fields: string[]): Promise<Record<string, string>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new VisitorAccessError(415, 'VISITOR_JSON_REQUIRED', 'Use application/json.');
  const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
  if (!reader) throw invalid();
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); throw new VisitorAccessError(413, 'VISITOR_REQUEST_TOO_LARGE', 'Account request exceeds 16 KiB.'); } chunks.push(value); }
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    // These bodies contain only string pairs. Parse each key separately so escaped
    // duplicate keys cannot be silently replaced by JSON.parse's last value.
    const pair = '("(?:[^"\\\\]|\\\\.)*")\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"';
    if (!new RegExp(`^\\s*\\{\\s*${pair}(?:\\s*,\\s*${pair})*\\s*\\}\\s*$`, 'u').test(raw)) throw new Error();
    const keys = [...raw.matchAll(new RegExp(pair, 'gu'))].map(match => JSON.parse(match[1]) as string);
    if (keys.length !== fields.length || new Set(keys).size !== keys.length || keys.some(key => !fields.includes(key))) throw new Error();
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || fields.some(field => typeof (body as Record<string, unknown>)[field] !== 'string')) throw new Error();
    return body as Record<string, string>;
  } catch { throw invalid(); }
}
async function rate(request: NextRequest, siteId: string, operation: Operation, repository: BackyVisitorAccountRepository, email?: string) {
  const hash = (value: string) => createHash('sha256').update(`${operation}:${value}`).digest('hex');
  if (email) {
    if (!await repository.consumeRateLimit(siteId, hash(`email:${email}`), 5, 300)) throw new VisitorAccessError(429, 'VISITOR_RATE_LIMITED', 'Too many account requests. Wait before retrying.');
    return;
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const siteAllowed = await repository.consumeRateLimit(siteId, hash('site-total'), 100, 300);
  const ipAllowed = await repository.consumeRateLimit(siteId, hash(`ip:${ip}`), 20, 300);
  if (!siteAllowed || !ipAllowed) throw new VisitorAccessError(429, 'VISITOR_RATE_LIMITED', 'Too many account requests. Wait before retrying.');
}
export async function handleVisitorEmailChange(request: NextRequest, siteKey: string, operation: Operation): Promise<NextResponse> {
  let revokedSiteId = '';
  try {
    if (request.method !== 'POST') throw new VisitorAccessError(405, 'VISITOR_METHOD_DENIED', 'Use POST for email changes.');
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(siteKey) || await repositories.sites.getBySlug(siteKey);
    if (!site) throw new VisitorAccessError(404, 'SITE_NOT_FOUND', 'Website unavailable.');
    const policy = visitorAuthPolicy(site);
    if (!policy.allowedOrigins.includes(request.headers.get('origin') || '')) throw new VisitorAccessError(403, 'VISITOR_ORIGIN_DENIED', 'This website origin is not authorized for visitor accounts.');
    const repository = repositories.visitorAccounts;
    if (!repository?.emailChange) throw new VisitorAccessError(503, 'VISITOR_EMAIL_CHANGE_UNAVAILABLE', 'Email changes require the persisted visitor account adapter.');
    await rate(request, site.id, operation, repository);
    if (operation === 'email-change') {
      const token = getVisitorSessionToken(request, site.id), member = await resolveVisitorSession(request, site.id, repository);
      if (!token || !member || member.status !== 'active' || member.siteId !== site.id) throw denied();
      const body = await readBody(request, ['newEmail', 'currentPassword', 'returnUrl']);
      const target = emailOf(body.newEmail), password = passwordOf(body.currentPassword);
      if (target === member.email.trim().toLowerCase()) throw invalid();
      if (!policy.returnUrls.includes(body.returnUrl)) throw new VisitorAccessError(400, 'VISITOR_RETURN_URL_DENIED', 'Use a configured account return URL for this website.');
      await rate(request, site.id, operation, repository, member.email);
      if (await repository.isOperatorIdentity({ issuer: '', subject: '', email: member.email }) || await repository.isOperatorIdentity({ issuer: '', subject: '', email: target })) throw denied();
      const authenticated = await authenticateVisitorProviderSession(member.email, password);
      if (!authenticated || authenticated.identity.email !== member.email.trim().toLowerCase() || await repository.isOperatorIdentity(authenticated.identity)) throw denied();
      // The adapter checks the private stored issuer/subject/current email and
      // exact session, then commits all-subject revocation before any mail request.
      const admitted = await repository.emailChange.admit(site.id, member.id, visitorTokenHash(token), authenticated.identity, target);
      if (!admitted) throw denied();
      revokedSiteId = site.id;
      if (admitted.member.id !== member.id || admitted.member.siteId !== site.id || admitted.member.status !== 'active' || admitted.member.email !== authenticated.identity.email) throw new Error();
      if (!await requestVisitorProviderEmailChange(authenticated.accessToken, target, body.returnUrl)) throw new Error();
      return clearVisitorCookie(json({ success: true, data: { confirmationRequired: true, signInRequired: true, message: 'Follow the identity provider’s email confirmations, then complete the email change using the confirmed address and password. This credential is shared across websites you joined.' } }, 202), site.id);
    }
    const body = await readBody(request, ['email', 'password']);
    const email = emailOf(body.email), password = passwordOf(body.password);
    await rate(request, site.id, operation, repository, email);
    if (await repository.isOperatorIdentity({ issuer: '', subject: '', email })) throw denied();
    const authenticated = await authenticateVisitorProviderSession(email, password);
    if (!authenticated || authenticated.identity.email !== email || await repository.isOperatorIdentity(authenticated.identity)) throw denied();
    const reconciled = await repository.emailChange.reconcile(site.id, authenticated.identity);
    if (!reconciled) throw denied();
    revokedSiteId = site.id;
    if (reconciled.member.siteId !== site.id || reconciled.member.status !== 'active' || reconciled.member.email !== email) throw new Error();
    return clearVisitorCookie(json({ success: true, data: { emailChanged: true, signInRequired: true, message: 'Confirmed email synchronized across your existing website memberships. Sign in again. Historical content and retained access-removal records remain unchanged.' } }), site.id);
  } catch (error) {
    const conflict = error && typeof error === 'object' && 'code' in error && error.code === 'VISITOR_EMAIL_CHANGE_CONFLICT';
    const response = error instanceof VisitorAccessError ? json({ success: false, error: { code: error.code, message: error.message } }, error.status)
      : conflict ? json({ success: false, error: { code: 'VISITOR_EMAIL_CHANGE_CONFLICT', message: 'Email change cannot be reconciled with existing website memberships. Contact the website owner.' } }, 409)
      : json({ success: false, error: { code: 'VISITOR_AUTH_UNAVAILABLE', message: revokedSiteId ? 'Website sessions were revoked. Provider delivery or confirmation may still be pending. Follow any received confirmations, then complete using the confirmed email and password; otherwise sign in again and retry.' : 'Email change could not be completed. Retry or contact the website owner.' } }, 503);
    return revokedSiteId ? clearVisitorCookie(response, revokedSiteId) : response;
  }
}
