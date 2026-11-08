import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { backyConfig } from './backy';
import { visitorWebsiteContext } from './visitor-bff';
export class WebsiteContentError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
export const contentRecord = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
export const contentJson = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { 'cache-control': 'private, no-store', vary: 'Origin, Cookie', 'x-content-type-options': 'nosniff' } });
export function contentFailure(error: unknown) { return error instanceof WebsiteContentError ? contentJson({ success: false, error: { code: error.code, message: error.message } }, error.status) : contentJson({ success: false, error: { code: 'WEBSITE_CONTENT_UNAVAILABLE', message: 'The website request could not be completed. Retry or contact the website owner.' } }, 503); }
export const contentId = (value: unknown): string => { if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new WebsiteContentError(400, 'INVALID_CONTENT_ID', 'Provide a valid content identity.'); return value.trim(); };
export async function boundedContentBytes(request: Request, maximum: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new WebsiteContentError(413, 'WEBSITE_REQUEST_TOO_LARGE', 'The website request exceeds its limit.');
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maximum) { await reader.cancel(); throw new WebsiteContentError(413, 'WEBSITE_REQUEST_TOO_LARGE', 'The website request exceeds its limit.'); } chunks.push(value); }
  return new Uint8Array(Buffer.concat(chunks));
}
export function parseContentJson(bytes: Uint8Array): Record<string, any> {
  try { const value = JSON.parse(Buffer.from(bytes).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw new WebsiteContentError(400, 'INVALID_WEBSITE_PAYLOAD', 'Use a JSON object for this request.'); }
}
export type WebsiteContentContext = { siteId: string; origin: string; visitorToken: string };
export async function websiteContentContext(request: NextRequest): Promise<WebsiteContentContext> {
  // Public guest content continues without account configuration. Visitor forwarding always requires the exact operator-approved account policy.
  const configured = process.env.BACKY_VISITOR_FRONTEND_ORIGIN, origin = configured || new URL(request.url).origin;
  let candidate = ''; try { candidate = new URL(origin).origin; } catch { /* fail below */ }
  if (candidate !== origin || !/^https?:\/\//.test(origin)) throw new WebsiteContentError(503, 'WEBSITE_ORIGIN_CONFIGURATION_REQUIRED', 'Configure this website origin.');
  const incoming = request.headers.get('origin'); let referer = ''; try { referer = new URL(request.headers.get('referer') || '').origin; } catch { /* deny cross-site */ }
  if (incoming ? incoming !== origin : request.headers.get('sec-fetch-site') !== 'same-origin' || (referer ? referer !== origin : new URL(request.url).origin !== origin)) throw new WebsiteContentError(403, 'WEBSITE_ORIGIN_DENIED', 'Submit through this website origin.');
  const handoff = await fetch(`${backyConfig.apiBaseUrl}/sites/${encodeURIComponent(backyConfig.siteId)}/agent-handoff`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
  const data = contentRecord(contentRecord(await handoff.json()).data), siteId = contentRecord(data.site).id;
  if (!handoff.ok || typeof siteId !== 'string' || !siteId) throw new WebsiteContentError(503, 'WEBSITE_CONTRACT_UNAVAILABLE', 'The website contract is unavailable.');
  const cookieName = `backy_visitor_${createHash('sha256').update(siteId).digest('hex').slice(0,16)}`, token = request.cookies.get(cookieName)?.value || '';
  const policy = contentRecord(contentRecord(contentRecord(data.handoff).visitorAccounts).policy);
  if (token && policy.enabled === true) {
    if (!/^bkv_[A-Za-z0-9_-]{43}$/.test(token)) throw new WebsiteContentError(401, 'VISITOR_AUTHENTICATION_REQUIRED', 'Sign in again to this website.');
    let visitor;
    try { visitor = await visitorWebsiteContext(); } catch { throw new WebsiteContentError(503, 'VISITOR_FRONTEND_CONFIGURATION_REQUIRED', 'Approve this website origin and account return URL before forwarding visitor sessions.'); }
    if (visitor.siteId !== siteId || visitor.origin !== origin) throw new WebsiteContentError(403, 'WEBSITE_SITE_SCOPE_DENIED', 'The website identity changed. Reload before submitting.');
    return { siteId, origin, visitorToken: token };
  }
  return { siteId, origin, visitorToken: '' };
}
export async function fetchWebsiteContent(context: WebsiteContentContext, path: string, init: RequestInit = {}) {
  if (!/^\/(?:manifest|forms\/[^/]+\/(?:definition|submissions)|(?:pages|blog)\/[^/]+\/comments(?:\?.*)?)$/.test(path)) throw new WebsiteContentError(400, 'WEBSITE_CONTENT_ROUTE_DENIED', 'Unsupported public website route.');
  const headers = new Headers({ origin: context.origin });
  if (context.visitorToken) headers.set('x-backy-visitor-session', context.visitorToken);
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('content-type', 'application/json');
  // No caller headers, operator cookies or administration endpoints can be forwarded.
  return fetch(`${backyConfig.apiBaseUrl}/sites/${encodeURIComponent(context.siteId)}${path}`, { ...init, headers, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
}
export async function requireContentPayload(response: Response) {
  const payload = contentRecord(await response.json());
  if (!response.ok || payload.success !== true) {
    const code = contentRecord(payload.error).code;
    throw new WebsiteContentError(response.status >= 400 ? response.status : 503, typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code) ? code : 'WEBSITE_CONTENT_REJECTED', response.status === 401 || response.status === 403 ? 'This content requires an eligible website account or is not accepting submissions.' : response.status === 422 || response.status === 400 ? 'Check the required fields, consent and captcha, then retry.' : response.status === 429 ? 'Too many submissions. Wait before retrying.' : 'The website request is unavailable. Retry or contact the website owner.');
  }
  return payload;
}
