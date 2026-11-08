import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import type { BackyVisitorAccountRepository, BackySiteVisitor, Site } from '@backy-cms/core';
import { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';
import { authenticateVisitorProvider, signupVisitorProvider, verifyVisitorProviderToken, recoverVisitorProvider, resetVisitorProviderPassword, visitorProviderConfig, exchangeVisitorProviderCode } from './provider';
import { newVisitorToken, visitorTokenHash, resolveVisitorSession, getVisitorSessionToken, setVisitorCookie, clearVisitorCookie } from './session';
export type VisitorAuthOperation = 'register' | 'login' | 'session' | 'logout' | 'recovery' | 'reset-password' | 'profile' | 'callback';
export class VisitorAccessError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'private, no-store', pragma: 'no-cache', vary: 'Origin, Cookie, Authorization', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
const registrationPending = () => json({ success: true, data: { confirmationRequired: true, message: 'If registration is available, follow the provider email instructions, then explicitly enroll in this website.' } }, 202);
const denied = () => new VisitorAccessError(401, 'VISITOR_AUTHENTICATION_REQUIRED', 'A current account for this website is required.');
const originOf = (value: string): string => { const url = new URL(value); if (url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'))) throw new Error('Invalid visitor origin'); return url.origin; };
export function visitorAuthPolicy(site: Site): { allowedOrigins: string[]; returnUrls: string[]; registrationEnabled: boolean } {
  const settings = site.settings.visitorAccounts as unknown as Record<string, unknown> | undefined;
  if (!site.isPublished || settings?.enabled !== true) throw new VisitorAccessError(403, 'VISITOR_ACCOUNTS_DISABLED', 'Visitor accounts are disabled for this website.');
  const origins = Array.isArray(settings.allowedOrigins) ? settings.allowedOrigins.filter((value): value is string => typeof value === 'string') : [];
  const returns = Array.isArray(settings.returnUrls) ? settings.returnUrls.filter((value): value is string => typeof value === 'string') : [];
  try {
    const allowedOrigins = origins.map(value => { const origin = originOf(value); if (value !== origin) throw new Error(); return origin; });
    const returnUrls = returns.map(value => { const url = new URL(value); if (!allowedOrigins.includes(originOf(value)) || url.hash || url.search) throw new Error(); return url.toString(); });
    if (!allowedOrigins.length || !returnUrls.length) throw new Error();
    return { allowedOrigins, returnUrls, registrationEnabled: settings.registrationEnabled === true };
  } catch { throw new VisitorAccessError(503, 'VISITOR_AUTH_POLICY_REQUIRED', 'Configure exact visitor website origins and account return URLs before enabling accounts.'); }
}
export function requireVisitorOrigin(request: NextRequest, policy: ReturnType<typeof visitorAuthPolicy>): void {
  const origin = request.headers.get('origin');
  const referer = !origin && request.headers.get('sec-fetch-site') === 'same-origin' ? request.headers.get('referer') : '';
  let candidate = ''; try { candidate = origin ? originOf(origin) : referer ? originOf(referer) : ''; if (origin && candidate !== origin) candidate = ''; } catch { /* deny */ }
  if (!policy.allowedOrigins.includes(candidate)) throw new VisitorAccessError(403, 'VISITOR_ORIGIN_DENIED', 'This website origin is not authorized for visitor accounts.');
}
const returnUrl = (value: unknown, policy: ReturnType<typeof visitorAuthPolicy>): string => {
  if (typeof value !== 'string' || !policy.returnUrls.includes(value)) throw new VisitorAccessError(400, 'VISITOR_RETURN_URL_DENIED', 'Use a configured account return URL for this website.');
  return value;
};
async function readBody(request: NextRequest, singleStringValue = false, flatStrings = false): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new VisitorAccessError(415, 'VISITOR_JSON_REQUIRED', 'Use application/json.');
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (!reader) throw new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', 'Invalid account request.');
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); throw new VisitorAccessError(413, 'VISITOR_REQUEST_TOO_LARGE', 'Account request exceeds 16 KiB.'); } chunks.push(value); }
  try { const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); const value = JSON.parse(raw);
    if (flatStrings) {
      let remaining = raw.trim().slice(1,-1).trim(); const keys = new Set<string>();
      while (remaining) {
        const match = remaining.match(/^"(?:\\.|[^"\\])*"\s*:\s*"(?:\\.|[^"\\])*"/u); if (!match) throw new Error();
        const key = JSON.parse(match[0].match(/^"(?:\\.|[^"\\])*"/u)![0]); if (keys.has(key)) throw new Error(); keys.add(key);
        remaining = remaining.slice(match[0].length).trim(); if (remaining) { if (!remaining.startsWith(',')) throw new Error(); remaining = remaining.slice(1).trimStart(); if (!remaining) throw new Error(); }
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || (singleStringValue && !/^\s*\{\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}\s*$/u.test(raw))) throw new Error(); return value; }
  catch { throw new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', 'Invalid account request.'); }
}
const emailOf = (value: unknown): string => { const valueString = typeof value === 'string' ? value.trim().toLowerCase() : ''; if (valueString.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueString)) throw new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', 'Provide a valid email address.'); return valueString; };
const passwordOf = (value: unknown, isNew: boolean): string => { if (typeof value !== 'string' || value.length < (isNew ? 12 : 1) || Buffer.byteLength(value) > 1024) throw new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', isNew ? 'Use a password of at least 12 characters.' : 'Provide a password.'); return value; };
async function enforceRate(request: NextRequest, siteId: string, operation: string, repository: BackyVisitorAccountRepository, email?: string): Promise<void> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = (value: string) => createHash('sha256').update(`${operation}:${value}`).digest('hex');
  // Site-wide budget also bounds abuse when deployment IP attribution is unavailable or spoofed.
  const siteAllowed = await repository.consumeRateLimit(siteId, key('site-total'), 100, 300);
  const allowed = await repository.consumeRateLimit(siteId, key(`ip:${ip}`), 20, 300);
  const accountAllowed = !email || await repository.consumeRateLimit(siteId, key(`email:${email}`), 5, 300);
  if (!siteAllowed || !allowed || !accountAllowed) throw new VisitorAccessError(429, 'VISITOR_RATE_LIMITED', 'Too many account requests. Wait before retrying.');
}
const publicMember = (member: BackySiteVisitor): BackySiteVisitor => ({ id: member.id, siteId: member.siteId, email: member.email, displayName: member.displayName, status: member.status, createdAt: member.createdAt, updatedAt: member.updatedAt });
async function issueSession(member: BackySiteVisitor, repository: BackyVisitorAccountRepository): Promise<NextResponse> {
  if (member.status !== 'active') throw denied();
  const token = newVisitorToken(), now = new Date(), expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  if (!await repository.createSession({ tokenHash: visitorTokenHash(token), siteId: member.siteId, memberId: member.id, expectedEmail: member.email, expiresAt, createdAt: now.toISOString() })) throw denied();
  return setVisitorCookie(json({ success: true, data: { member: publicMember(member), expiresAt } }), member.siteId, token, expiresAt);
}
function callbackOrigin(request: NextRequest): string {
  return originOf(request.headers.get('origin') || request.headers.get('referer') || '');
}
function callbackReturn(value: unknown, request: NextRequest, policy: ReturnType<typeof visitorAuthPolicy>): string {
  const redirect = returnUrl(value, policy);
  if (new URL(redirect).origin !== callbackOrigin(request)) throw new VisitorAccessError(400, 'VISITOR_RETURN_URL_DENIED', 'Use this website origin’s configured return URL.');
  return redirect;
}
async function beginPkce(request: NextRequest, siteId: string, repository: BackyVisitorAccountRepository, policy: ReturnType<typeof visitorAuthPolicy>, input: { returnUrl: unknown; purpose: 'signup' | 'recovery'; expectedEmail: string; displayName?: string; memberId?: string }) {
  if (!repository.pkce) throw new VisitorAccessError(503, 'VISITOR_PKCE_UNAVAILABLE', 'PKCE requires the persisted visitor flow adapter.');
  visitorProviderConfig();
  const redirect = callbackReturn(input.returnUrl, request, policy), state = newVisitorToken(), verifier = randomBytes(32).toString('base64url');
  await repository.pkce.create({ stateHash: visitorTokenHash(state), siteId, purpose: input.purpose, origin: callbackOrigin(request), returnUrl: redirect, verifier, expectedEmail: input.expectedEmail, displayName: input.displayName || '', memberId: input.memberId || null, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  const url = new URL(redirect); url.searchParams.set('backyVisitorState', state); url.searchParams.set('backyVisitorFlow', input.purpose); url.searchParams.set('backySiteId', siteId);
  return { redirect: url.toString(), challenge: createHash('sha256').update(verifier).digest('base64url') };
}
async function consumePkce(request: NextRequest, siteId: string, repository: BackyVisitorAccountRepository, policy: ReturnType<typeof visitorAuthPolicy>, body: Record<string, unknown>, purpose: 'signup' | 'recovery') {
  const fields = purpose === 'signup' ? ['code','state','returnUrl'] : ['code','state','returnUrl','password'];
  if (Object.keys(body).length !== fields.length || fields.some(key => typeof body[key] !== 'string') || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(body.code) || typeof body.state !== 'string' || !/^bkv_[A-Za-z0-9_-]{43}$/.test(body.state)) throw new VisitorAccessError(400, 'VISITOR_INVALID_CALLBACK', 'Use only the supported callback fields.');
  const redirect = callbackReturn(body.returnUrl, request, policy);
  if (!repository.pkce) throw new VisitorAccessError(503, 'VISITOR_PKCE_UNAVAILABLE', 'PKCE requires the persisted visitor flow adapter.');
  const flow = await repository.pkce.consume(siteId, visitorTokenHash(body.state), callbackOrigin(request), redirect, purpose);
  if (!flow) throw denied();
  // A failed or uncertain exchange burns this flow. Never retry an arbitrary browser verifier.
  const session = await exchangeVisitorProviderCode(body.code, flow.verifier);
  if (!session || session.identity.email !== flow.expectedEmail || await repository.isOperatorIdentity(session.identity)) throw denied();
  return { flow, ...session };
}
export async function requireSiteVisitor(request: NextRequest, siteId: string): Promise<BackySiteVisitor> {
  const repositories = await getRequiredDatabaseRepositories();
  const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
  if (!site) throw denied();
  const policy = visitorAuthPolicy(site); requireVisitorOrigin(request, policy);
  if (!repositories.visitorAccounts) throw new VisitorAccessError(503, 'VISITOR_DATABASE_REQUIRED', 'Visitor accounts require the persisted database runtime.');
  const member = await resolveVisitorSession(request, site.id, repositories.visitorAccounts);
  if (!member || member.status !== 'active') throw denied(); return member;
}
export async function handleVisitorAuth(request: NextRequest, siteKey: string, operation: VisitorAuthOperation): Promise<NextResponse> {
  try {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(siteKey) || await repositories.sites.getBySlug(siteKey);
    if (!site) return json({ success: false, error: { code: 'SITE_NOT_FOUND', message: 'Website unavailable.' } }, 404);
    const policy = visitorAuthPolicy(site); requireVisitorOrigin(request, policy);
    const repository = repositories.visitorAccounts; if (!repository) throw new Error('No visitor repository');
    if (operation === 'session') {
      const member = await resolveVisitorSession(request, site.id, repository); if (!member) throw denied();
      return json({ success: true, data: { member: publicMember(member) } });
    }
    await enforceRate(request, site.id, operation, repository);
    if (operation === 'logout') {
      const token = getVisitorSessionToken(request, site.id); if (token) await repository.revokeSession(site.id, visitorTokenHash(token));
      return clearVisitorCookie(json({ success: true, data: { loggedOut: true } }), site.id);
    }
    if (operation === 'profile') {
      if (request.method !== 'PATCH') throw new VisitorAccessError(405, 'VISITOR_METHOD_DENIED', 'Use PATCH for website profile updates.');
      const token = getVisitorSessionToken(request, site.id);
      const member = await resolveVisitorSession(request, site.id, repository);
      if (!token || !member || member.status !== 'active' || member.siteId !== site.id) throw denied();
      if (!repository.updateProfile) throw new VisitorAccessError(503, 'VISITOR_PROFILE_UNAVAILABLE', 'Website profile updates require the persisted visitor account adapter.');
      const body = await readBody(request, true);
      if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'displayName') || typeof body.displayName !== 'string'
        || /\p{Cc}/u.test(body.displayName) || body.displayName.trim().length > 120) {
        throw new VisitorAccessError(400, 'VISITOR_INVALID_PROFILE', 'Provide only a displayName of at most 120 characters without control characters.');
      }
      // Route admission is provisional: the adapter locks/rechecks membership and
      // this exact session against revocation, expiry and CMS identity admission.
      const updated = await repository.updateProfile(site.id, member.id, visitorTokenHash(token), { displayName: body.displayName.trim() });
      if (!updated || updated.siteId !== site.id || updated.id !== member.id || updated.status !== 'active') throw denied();
      return json({ success: true, data: { member: publicMember(updated) } });
    }
    const body = await readBody(request, false, operation === 'callback' || operation === 'reset-password');
    if (operation === 'callback') {
      if (!policy.registrationEnabled) throw new VisitorAccessError(403, 'VISITOR_REGISTRATION_DISABLED', 'New visitor enrollment is disabled for this website.');
      const { flow, identity } = await consumePkce(request, site.id, repository, policy, body, 'signup');
      return await issueSession(await repository.enroll(site.id, identity, flow.displayName), repository);
    }
    if ((operation === 'register' || operation === 'recovery') && body.authFlow !== undefined && body.authFlow !== 'pkce') throw new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', 'Use the supported auth flow.');
    if (operation === 'register') {
      if (!policy.registrationEnabled) throw new VisitorAccessError(403, 'VISITOR_REGISTRATION_DISABLED', 'New visitor enrollment is disabled for this website.');
      if (body.authFlow === 'pkce' && body.accessToken !== undefined) throw new VisitorAccessError(400, 'VISITOR_INVALID_REQUEST', 'Do not mix provider tokens and PKCE.');
      let identity;
      if (typeof body.accessToken === 'string') identity = await verifyVisitorProviderToken(body.accessToken);
      else {
        const email = emailOf(body.email), password = passwordOf(body.password, true), redirect = returnUrl(body.returnUrl, policy);
        await enforceRate(request, site.id, 'register-account', repository, email);
        if (await repository.isOperatorIdentity({ issuer: '', subject: '', email })) return registrationPending();
        const flow = body.authFlow === 'pkce' ? await beginPkce(request, site.id, repository, policy, { returnUrl: redirect, purpose: 'signup', expectedEmail: email, displayName: typeof body.displayName === 'string' ? body.displayName.trim().slice(0,120) : '' }) : null;
        identity = await signupVisitorProvider(email, password, flow?.redirect || redirect, flow?.challenge);
        if (!identity) return registrationPending();
      }
      if (!identity || await repository.isOperatorIdentity(identity)) throw denied();
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 120) : '';
      return await issueSession(await repository.enroll(site.id, identity, displayName), repository);
    }
    if (operation === 'login') {
      const email = emailOf(body.email); await enforceRate(request, site.id, 'login-account', repository, email);
      const identity = await authenticateVisitorProvider(email, passwordOf(body.password, false));
      const member = identity && !await repository.isOperatorIdentity(identity) ? await repository.getByIdentity(site.id, identity) : null;
      if (!member || member.status !== 'active') throw denied(); return await issueSession(member, repository);
    }
    if (operation === 'recovery') {
      const email = emailOf(body.email), redirect = returnUrl(body.returnUrl, policy); visitorProviderConfig();
      await enforceRate(request, site.id, 'recovery-account', repository, email);
      if (body.authFlow === 'pkce') {
        if (!repository.pkce) throw new VisitorAccessError(503, 'VISITOR_PKCE_UNAVAILABLE', 'PKCE requires the persisted visitor flow adapter.');
        callbackReturn(redirect, request, policy);
      }
      const member = await repository.getByEmail(site.id, email);
      if (member?.status === 'active' && !await repository.isOperatorIdentity({ issuer: '', subject: '', email })) {
        if (body.authFlow === 'pkce') {
          const flow = await beginPkce(request, site.id, repository, policy, { returnUrl: redirect, purpose: 'recovery', expectedEmail: email, memberId: member.id });
          try { await recoverVisitorProvider(email, flow.redirect, flow.challenge); } catch { console.warn('Visitor recovery provider delivery unavailable'); }
        } else {
          const challenge = newVisitorToken(), url = new URL(redirect); url.searchParams.set('backyVisitorRecovery', challenge); url.searchParams.set('backySiteId', site.id);
          await repository.createRecoveryChallenge({ siteId: site.id, memberId: member.id, expectedEmail: member.email, tokenHash: visitorTokenHash(challenge), expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
          // Uniform response even when mail cannot be queued: this endpoint never reveals account existence or provider error payloads.
          try { await recoverVisitorProvider(email, url.toString()); } catch { console.warn('Visitor recovery provider delivery unavailable'); }
        }
      }
      return json({ success: true, data: { message: 'If this website account is eligible, recovery instructions will be sent through the configured provider.' } }, 202);
    }
    if (operation === 'reset-password') {
      const password = passwordOf(body.password, true);
      if (body.code !== undefined || body.state !== undefined) {
        const { flow, identity, accessToken } = await consumePkce(request, site.id, repository, policy, body, 'recovery');
        const member = await repository.getByIdentity(site.id, identity);
        if (!member || member.status !== 'active' || member.id !== flow.memberId) throw denied();
        await repository.revokeIdentitySessions(identity);
        if (!await resetVisitorProviderPassword(accessToken, password)) throw new Error('Password update unavailable');
        return clearVisitorCookie(json({ success: true, data: { passwordReset: true, message: 'Password updated. Sign in again.' } }), site.id);
      }
      const identity = typeof body.accessToken === 'string' ? await verifyVisitorProviderToken(body.accessToken) : null;
      const member = identity && !await repository.isOperatorIdentity(identity) ? await repository.getByIdentity(site.id, identity) : null;
      if (!identity || !member || member.status !== 'active' || typeof body.recoveryToken !== 'string' || !/^bkv_[A-Za-z0-9_-]{43}$/.test(body.recoveryToken) || !await repository.consumeRecoveryChallenge(site.id, member.id, visitorTokenHash(body.recoveryToken), new Date().toISOString())) throw denied();
      // Revoke all visitor sessions for this provider subject before the shared provider password changes; no CMS session or profile is modified.
      await repository.revokeIdentitySessions(identity);
      if (!await resetVisitorProviderPassword(String(body.accessToken), password)) throw new Error('Password update unavailable');
      return clearVisitorCookie(json({ success: true, data: { passwordReset: true, message: 'Password updated. Sign in again.' } }), site.id);
    }
    throw denied();
  } catch (error) {
    if (error instanceof VisitorAccessError) return json({ success: false, error: { code: error.code, message: error.message } }, error.status);
    return json({ success: false, error: { code: 'VISITOR_AUTH_UNAVAILABLE', message: 'Visitor accounts require the database and identity provider. Retry or contact the website owner.' } }, 503);
  }
}
