import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { backyConfig } from './backy';

const operations = ['register', 'login', 'session', 'logout', 'recovery', 'reset-password', 'profile', 'email-change', 'confirm-email-change', 'callback'] as const;
type Operation = typeof operations[number];
const tokenPattern = /^bkv_[A-Za-z0-9_-]{43}$/;
const safeHeaders = { 'cache-control': 'private, no-store', pragma: 'no-cache', vary: 'Origin, Cookie', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
class AccountBoundaryError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const failure = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status, headers: safeHeaders });
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

function websiteOrigin(): string {
  const value = process.env.BACKY_VISITOR_FRONTEND_ORIGIN || '';
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || !(url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error();
    return value;
  } catch { throw new AccountBoundaryError(503, 'VISITOR_FRONTEND_CONFIGURATION_REQUIRED', 'Configure the exact website origin and account return URL before enabling accounts.'); }
}
function requireWebsiteRequest(request: NextRequest, origin: string): void {
  const incoming = request.headers.get('origin');
  let refererOrigin = ''; try { refererOrigin = new URL(request.headers.get('referer') || '').origin; } catch { /* deny */ }
  if (incoming ? incoming !== origin : request.headers.get('sec-fetch-site') !== 'same-origin' || (refererOrigin ? refererOrigin !== origin : new URL(request.url).origin !== origin)) throw new AccountBoundaryError(403, 'VISITOR_ORIGIN_DENIED', 'Account requests must come from this website.');
}
async function backendJson(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${backyConfig.apiBaseUrl}/sites/${encodeURIComponent(backyConfig.siteId)}${path}`, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
}
export async function visitorWebsiteContext() {
  const origin = websiteOrigin();
  const response = await backendJson('/agent-handoff');
  const payload = record(await response.json()); const data = record(payload.data), site = record(data.site), visitor = record(record(data.handoff).visitorAccounts), policy = record(visitor.policy);
  const returnUrl = process.env.BACKY_VISITOR_RETURN_URL || `${origin}/account`;
  if (!response.ok || payload.success !== true || typeof site.id !== 'string' || visitor.schemaVersion !== 'backy.site-visitor-accounts.v1') throw new AccountBoundaryError(503, 'VISITOR_AUTH_UNAVAILABLE', 'The website account contract is unavailable.');
  if (policy.enabled !== true) throw new AccountBoundaryError(403, 'VISITOR_ACCOUNTS_DISABLED', 'Accounts are disabled for this website.');
  if (policy.configurationValid !== true || !Array.isArray(policy.allowedOrigins) || !policy.allowedOrigins.includes(origin) || !Array.isArray(policy.returnUrls) || !policy.returnUrls.includes(returnUrl)) throw new AccountBoundaryError(503, 'VISITOR_FRONTEND_CONFIGURATION_REQUIRED', 'Approve this exact website origin and account return URL in Backy before enabling accounts.');
  const parsed = new URL(returnUrl);
  if (parsed.origin !== origin || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.pathname !== '/account') throw new AccountBoundaryError(503, 'VISITOR_FRONTEND_CONFIGURATION_REQUIRED', 'Use this website’s /account return URL.');
  const endpoints = record(visitor.endpoints), methods = record(visitor.methods);
  const emailChangeAvailable = endpoints.emailChange === `/api/sites/${encodeURIComponent(site.id)}/visitor-auth/email-change` && endpoints.confirmEmailChange === `/api/sites/${encodeURIComponent(site.id)}/visitor-auth/confirm-email-change` && methods.emailChange === 'POST' && methods.confirmEmailChange === 'POST';
  return { origin, returnUrl, siteId: site.id, cookieName: `backy_visitor_${createHash('sha256').update(site.id).digest('hex').slice(0,16)}`, registrationEnabled: policy.registrationEnabled === true, profileAvailable: endpoints.profile === `/api/sites/${encodeURIComponent(site.id)}/visitor-auth/profile` && methods.profile === 'PATCH', emailChangeAvailable };
}
async function boundedBody(request: NextRequest, strict = false): Promise<Record<string, any>> {
  const mediaType = request.headers.get('content-type') || '';
  if (strict ? mediaType.split(';')[0].trim().toLowerCase() !== 'application/json' : !mediaType.startsWith('application/json')) throw new AccountBoundaryError(415, 'VISITOR_JSON_REQUIRED', 'Use application/json.');
  let size = 0; const chunks: Uint8Array[] = [], reader = request.body?.getReader();
  if (!reader) throw new AccountBoundaryError(400, 'VISITOR_INVALID_REQUEST', 'Invalid account request.');
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); throw new AccountBoundaryError(413, 'VISITOR_REQUEST_TOO_LARGE', 'Account request exceeds 16 KiB.'); } chunks.push(value); }
  try {
    const bytes = Buffer.concat(chunks), source = strict ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : bytes.toString('utf8');
    const value = JSON.parse(source); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    if (strict) {
      // New email-change payloads are flat strings. Decode every key separately
      // so duplicate and escaped duplicate keys cannot be hidden by JSON.parse.
      let rest = source.trim().slice(1, -1).trim(); const keys = new Set<string>();
      while (rest) {
        const keyToken = rest.match(/^"(?:\\.|[^"\\])*"/u)?.[0]; if (!keyToken) throw new Error();
        const key = JSON.parse(keyToken); if (keys.has(key)) throw new Error(); keys.add(key);
        rest = rest.slice(keyToken.length).trimStart(); if (!rest.startsWith(':')) throw new Error(); rest = rest.slice(1).trimStart();
        const valueToken = rest.match(/^"(?:\\.|[^"\\])*"/u)?.[0]; if (!valueToken) throw new Error();
        rest = rest.slice(valueToken.length).trim(); if (rest) { if (!rest.startsWith(',')) throw new Error(); rest = rest.slice(1).trimStart(); }
      }
    }
    return value;
  } catch { throw new AccountBoundaryError(400, 'VISITOR_INVALID_REQUEST', 'Invalid account request.'); }
}
const requestFields: Record<Operation, string[]> = { register: ['email','password','displayName','accessToken'], login: ['email','password'], session: [], logout: [], recovery: ['email'], 'reset-password': ['password','accessToken','recoveryToken','code','state'], profile: ['displayName'], 'email-change': ['newEmail','currentPassword'], 'confirm-email-change': ['email','password'], callback: ['code','state'] };
function publicData(operation: Operation, raw: unknown, siteId: string): Record<string, unknown> {
  const data = record(raw);
  if (operation === 'email-change' || operation === 'confirm-email-change') {
    const flag = operation === 'email-change' ? 'confirmationRequired' : 'emailChanged';
    if (data[flag] !== true || data.signInRequired !== true || typeof data.message !== 'string') throw new Error('Invalid email-change response');
    return { [flag]: true, signInRequired: true, message: operation === 'email-change' ? 'Follow all confirmation emails, then complete the change with your new email and password. Sign in again afterward.' : 'Email change completed. Sign in with your confirmed email.' };
  }
  if (operation === 'session' || operation === 'profile' || operation === 'login' || operation === 'callback' || operation === 'register' && data.member) {
    const member = record(data.member);
    if (member.siteId !== siteId || member.status !== 'active' || typeof member.id !== 'string' || typeof member.email !== 'string') throw new Error('Invalid member response');
    if (operation === 'profile' && (typeof member.displayName !== 'string' || member.displayName.length > 120 || /\p{Cc}/u.test(member.displayName) || typeof member.createdAt !== 'string' || !Number.isFinite(Date.parse(member.createdAt)) || typeof member.updatedAt !== 'string' || !Number.isFinite(Date.parse(member.updatedAt)))) throw new Error('Invalid profile response');
    return { member: { id: member.id, siteId, email: member.email, displayName: typeof member.displayName === 'string' ? member.displayName : '', status: 'active', createdAt: member.createdAt, updatedAt: member.updatedAt }, ...(operation !== 'profile' && typeof data.expiresAt === 'string' ? { expiresAt: data.expiresAt } : {}) };
  }
  if (operation === 'register') return { confirmationRequired: true, message: 'If registration is available, follow the email instructions to enroll in this website.' };
  if (operation === 'logout') return { loggedOut: true };
  if (operation === 'recovery') return { message: 'If this website account is eligible, recovery instructions will be sent through the configured provider.' };
  return { passwordReset: true, message: 'Password updated. Sign in again.' };
}
export async function handleWebsiteAccount(request: NextRequest, operationName: string): Promise<NextResponse> {
  let clearCookieName = '';
  const finish = (response: NextResponse) => {
    if (clearCookieName) response.cookies.set(clearCookieName, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
    return response;
  };
  try {
    if (!operations.includes(operationName as Operation)) return failure(404, 'VISITOR_OPERATION_NOT_FOUND', 'Unknown account operation.');
    const operation = operationName as Operation;
    if (request.method !== (operation === 'session' ? 'GET' : operation === 'profile' ? 'PATCH' : 'POST')) return failure(405, 'VISITOR_METHOD_DENIED', 'Unsupported account method.');
    const emailChange = operation === 'email-change' || operation === 'confirm-email-change';
    const origin = websiteOrigin(); requireWebsiteRequest(request, origin);
    if (emailChange && request.headers.get('origin') !== origin) throw new AccountBoundaryError(403, 'VISITOR_ORIGIN_DENIED', 'Email-change requests require this exact website Origin.');
    const context = await visitorWebsiteContext();
    if (emailChange && !context.emailChangeAvailable) throw new AccountBoundaryError(503, 'VISITOR_EMAIL_CHANGE_UNAVAILABLE', 'This website does not advertise verified email changes.');
    if (operation === 'register' && !context.registrationEnabled) throw new AccountBoundaryError(403, 'VISITOR_REGISTRATION_DISABLED', 'New accounts are disabled for this website.');
    if (operation === 'profile' && !context.profileAvailable) throw new AccountBoundaryError(503, 'VISITOR_PROFILE_UNAVAILABLE', 'The selected website does not advertise profile editing.');
    if (operation === 'profile' && request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AccountBoundaryError(415, 'VISITOR_JSON_REQUIRED', 'Use application/json.');
    const pkceCallback = operation === 'callback';
    const input = operation === 'session' || operation === 'logout' ? {} : await boundedBody(request, emailChange || pkceCallback || operation === 'reset-password');
    if ((pkceCallback || operation === 'reset-password' && ('code' in input || 'state' in input)) && (Object.keys(input).length !== (pkceCallback ? 2 : 3) || !/^[A-Za-z0-9_-]{1,2048}$/.test(input.code || '') || !/^bkv_[A-Za-z0-9_-]{43}$/.test(input.state || '') || (pkceCallback ? Object.keys(input).some(key => !['code','state'].includes(key)) : Object.keys(input).some(key => !['code','state','password'].includes(key))))) throw new AccountBoundaryError(400, 'VISITOR_INVALID_CALLBACK', 'Use only the supported callback fields.');
    if (emailChange && (Object.keys(input).length !== requestFields[operation].length || requestFields[operation].some(key => typeof input[key] !== 'string' || !input[key]) || Object.keys(input).some(key => !requestFields[operation].includes(key)))) throw new AccountBoundaryError(400, 'VISITOR_INVALID_REQUEST', 'Use only the required email and current password fields.');
    if (emailChange) {
      const email = input[operation === 'email-change' ? 'newEmail' : 'email'], password = input[operation === 'email-change' ? 'currentPassword' : 'password'];
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Buffer.byteLength(password, 'utf8') > 1024) throw new AccountBoundaryError(400, 'VISITOR_INVALID_REQUEST', 'Use a valid email and a current password within the supported limit.');
    }
    if (operation === 'profile' && (Object.keys(input).length !== 1 || typeof input.displayName !== 'string' || /\p{Cc}/u.test(input.displayName) || input.displayName.trim().length > 120)) throw new AccountBoundaryError(400, 'VISITOR_PROFILE_INVALID', 'Use only a display name of up to 120 characters without control characters.');
    const body = Object.fromEntries(requestFields[operation].filter(key => typeof input[key] === 'string').map(key => [key, input[key]]));
    if (operation === 'profile') body.displayName = body.displayName.trim();
    if ((operation === 'register' && !body.accessToken) || operation === 'recovery' || operation === 'email-change' || operation === 'callback' || operation === 'reset-password' && body.code) body.returnUrl = context.returnUrl;
    if (operation === 'register' && !body.accessToken || operation === 'recovery') body.authFlow = 'pkce';
    const token = request.cookies.get(context.cookieName)?.value || '';
    if ((operation === 'profile' || operation === 'email-change') && !tokenPattern.test(token)) throw new AccountBoundaryError(401, 'VISITOR_SESSION_REQUIRED', 'A current account for this website is required.');
    const headers = new Headers({ origin, 'content-type': 'application/json' });
    if (tokenPattern.test(token)) headers.set('x-backy-visitor-session', token);
    const upstream = await backendJson(`/visitor-auth/${operation}`, { method: request.method, headers, ...(operation === 'session' ? {} : { body: JSON.stringify(body) }) });
    const cookies = upstream.headers.getSetCookie?.() || [upstream.headers.get('set-cookie') || ''];
    const issued = cookies.find(cookie => cookie.startsWith(`${context.cookieName}=`));
    const value = issued?.slice(context.cookieName.length + 1).split(';')[0] || '';
    if (emailChange && issued && !value && /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(issued)) clearCookieName = context.cookieName;
    const payload = record(await upstream.json());
    if (!upstream.ok || payload.success !== true) {
      const code = record(payload.error).code;
      const message = operation === 'email-change' && clearCookieName ? 'Website sessions were revoked. Provider confirmation may still be pending. Follow any received confirmations, then complete with the confirmed email and password; otherwise sign in again before retrying.' : upstream.status === 401 ? 'A current account for this website is required.' : upstream.status === 429 ? 'Too many account requests. Wait before retrying.' : 'Account request could not be completed. Check account availability and retry.';
      return finish(failure(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 503, typeof code === 'string' && /^VISITOR_[A-Z_]+$/.test(code) ? code : 'VISITOR_AUTH_UNAVAILABLE', message));
    }
    if (emailChange && (upstream.status !== (operation === 'email-change' ? 202 : 200) || value)) throw new Error('Invalid email-change outcome');
    const response = NextResponse.json({ success: true, data: publicData(operation, payload.data, context.siteId) }, { status: upstream.status, headers: safeHeaders });
    // Lift only this canonical site's opaque visitor session; never relay provider/operator cookies.
    if (emailChange) { clearCookieName = context.cookieName; return finish(response); }
    if (issued && tokenPattern.test(value)) {
      const expires = Date.parse(record(payload.data).expiresAt);
      if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Invalid session expiry');
      response.cookies.set(context.cookieName, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: Math.min(3600, Math.ceil((expires - Date.now()) / 1000)) });
    }
    else if (operation === 'logout' || operation === 'reset-password') response.cookies.set(context.cookieName, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
    else if ((operation === 'login' || operation === 'callback' || operation === 'register' && record(payload.data).member) && !tokenPattern.test(value)) throw new Error('Missing session cookie');
    return response;
  } catch (error) {
    if (error instanceof AccountBoundaryError) return finish(failure(error.status, error.code, error.message));
    return finish(failure(503, 'VISITOR_AUTH_UNAVAILABLE', 'Website accounts require the persisted Backy database and identity provider. Retry or contact the website owner.'));
  }
}
