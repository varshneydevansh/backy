import type { NextRequest } from 'next/server';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

// Origins are identities, not URL prefixes. Reject paths, credentials, wildcards
// and empty query/fragment delimiters rather than silently broadening config.
function strictOrigin(value: string): string | null {
  if (!/^https?:\/\/[^/?#\s]+$/i.test(value) || value.includes('*') || value.includes('\\')) return null;
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.origin !== 'null' ? url.origin : null;
  } catch { return null; }
}

function refererOrigin(value: string | null): string | null {
  if (!value || !/^https?:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? strictOrigin(url.origin) : null;
  } catch { return null; }
}

/** Admin response CORS and cookie writes share this separate trust boundary. */
export function isTrustedAdminOrigin(request: NextRequest, value: string | null): boolean {
  const candidate = value ? strictOrigin(value) : null;
  if (!candidate) return false;
  // nextUrl is the server's request URL. Never derive trust from forwarded headers
  // or the public/customer CORS policy. A rewritten admin origin is explicit config.
  const trusted = new Set<string>();
  const ownOrigin = strictOrigin(request.nextUrl.origin);
  if (ownOrigin) trusted.add(ownOrigin);
  for (const entry of (process.env.BACKY_ADMIN_TRUSTED_ORIGINS || '').split(',')) {
    const origin = strictOrigin(entry.trim());
    if (origin) trusted.add(origin);
  }
  return trusted.has(candidate);
}

/** Protect ambient cookie writes; explicit session credentials retain precedence. */
export function adminCookieWriteOriginError(request: NextRequest): { code: string; message: string } | null {
  if (safeMethods.has(request.method.toUpperCase())) return null;
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer || request.headers.get('x-backy-admin-session')?.trim()) return null;
  if (!request.cookies.get('backy_admin_session')?.value?.trim()) return null;

  // A present but invalid Origin must not be rescued by a different Referer.
  const origin = request.headers.has('origin')
    ? strictOrigin(request.headers.get('origin') || '')
    : refererOrigin(request.headers.get('referer'));
  if (isTrustedAdminOrigin(request, origin)) return null;
  return {
    code: 'ADMIN_COOKIE_ORIGIN_DENIED',
    message: 'Cookie-authenticated admin writes require a trusted admin Origin or Referer.',
  };
}
