import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { dangerouslyDeleteByTag } from '@vercel/functions';

export const BACKY_PUBLIC_CONTRACT_VERSION = 'backy.ai-frontend.v1';

/**
 * Vercel CDN caching for anonymous public reads.
 *
 * Only `Vercel-CDN-Cache-Control` is used. Vercel consumes it and does not
 * forward it, so the browser/downstream `Cache-Control` contract is unchanged
 * (render scope keeps `public, no-cache, must-revalidate`, media keeps
 * `no-store`). Every cached response carries `Vercel-Cache-Tag` with a site tag,
 * and admin mutations delete those tags (see `purgePublicCdnCache`) before any
 * site webhook is sent, so withdrawn pages and media that turned private stop
 * being served from the CDN immediately rather than after the TTL.
 *
 * The TTLs bound the exposure if a purge is ever missed.
 */
export const PUBLIC_CDN_CACHE_CONTROL = {
  discovery: 'max-age=300, stale-while-revalidate=3600',
  render: 'max-age=60, stale-while-revalidate=600',
  media: 'max-age=86400, stale-while-revalidate=3600',
} as const;

export type PublicCdnCacheKind = keyof typeof PUBLIC_CDN_CACHE_CONTROL;

/** Vercel's CDN does not store function responses above 10 MB. */
export const PUBLIC_CDN_MAX_CACHEABLE_BYTES = 10 * 1024 * 1024;

const CREDENTIAL_HEADERS = [
  'authorization',
  'cookie',
  'x-backy-admin-key',
  'x-backy-admin-session',
  'x-api-key',
] as const;

/** Credential headers that public routes read; anonymous cache entries are keyed on their absence. */
export const PUBLIC_CDN_VARY_HEADERS = ['Authorization', 'X-Backy-Admin-Key', 'X-Backy-Admin-Session', 'X-Api-Key'];

const TOKEN_QUERY_PARAMS = [
  'previewToken',
  'preview',
  'token',
  'expiresAt',
  'signature',
  'accessToken',
  'access_token',
] as const;

const tagSafe = (value: string) => value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 200);

export const publicCdnSiteTag = (siteId: string) => `backy-site-${tagSafe(siteId)}`;
export const publicCdnMediaTag = (siteId: string, mediaId: string) => `backy-media-${tagSafe(siteId)}-${tagSafe(mediaId)}`;
export const PUBLIC_CDN_GLOBAL_TAG = 'backy-public';

/**
 * True only for credential-free, token-free GET/HEAD requests. Anything that
 * could select owner, preview, signed or otherwise non-anonymous output is
 * excluded and keeps the origin-only cache contract.
 */
export const isAnonymousPublicRead = (request: Request | undefined | null): boolean => {
  if (!request) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  for (const name of CREDENTIAL_HEADERS) {
    if (request.headers.get(name)?.trim()) return false;
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  for (const name of TOKEN_QUERY_PARAMS) {
    if (url.searchParams.has(name)) return false;
  }
  return true;
};

const appendVary = (headers: Headers, names: string[]) => {
  const current = (headers.get('vary') || '').split(',').map((part) => part.trim()).filter(Boolean);
  const lower = new Set(current.map((part) => part.toLowerCase()));
  for (const name of names) {
    if (!lower.has(name.toLowerCase())) {
      current.push(name);
      lower.add(name.toLowerCase());
    }
  }
  headers.set('vary', current.join(', '));
};

export interface PublicCdnCacheOptions {
  kind: PublicCdnCacheKind;
  request: Request | undefined | null;
  status: number;
  siteId?: string;
  mediaId?: string;
}

/**
 * Adds a Vercel-only CDN TTL and cache tags when the request and response are
 * both eligible. Otherwise pins the Vercel layer to `no-store`, so authorized,
 * preview, signed or non-200 responses are never stored by Vercel's CDN.
 * Returns whether CDN caching was enabled.
 */
export const applyPublicCdnCache = (headers: Headers, options: PublicCdnCacheOptions): boolean => {
  // Media deliberately keeps browser `no-store` (asset bytes and visibility are
  // mutable behind one URL), so only `private` disqualifies it; the route
  // decides media eligibility before calling this.
  const browserDirectives = headers.get('cache-control') || '';
  const browserForbids = options.kind === 'media'
    ? /\bprivate\b/i.test(browserDirectives)
    : /\b(private|no-store)\b/i.test(browserDirectives);
  const eligible = options.status === 200
    && Boolean(options.siteId)
    && isAnonymousPublicRead(options.request)
    && !browserForbids
    && !headers.has('set-cookie');

  if (!eligible) {
    headers.delete('vercel-cache-tag');
    headers.set('vercel-cdn-cache-control', 'no-store');
    return false;
  }

  const tags = [PUBLIC_CDN_GLOBAL_TAG, publicCdnSiteTag(options.siteId as string)];
  if (options.mediaId) tags.push(publicCdnMediaTag(options.siteId as string, options.mediaId));
  headers.set('vercel-cdn-cache-control', PUBLIC_CDN_CACHE_CONTROL[options.kind]);
  headers.set('vercel-cache-tag', tags.join(','));
  appendVary(headers, PUBLIC_CDN_VARY_HEADERS);
  return true;
};

/**
 * Deletes CDN entries for a site (and optionally one media asset). Delete, not
 * invalidate: invalidation would serve one stale copy, which is exactly the
 * withdrawn/private content this must stop. Outside Vercel this is a no-op.
 * Never throws; a failed purge is logged and bounded by the TTLs above.
 */
export async function purgePublicCdnCache(target: { siteId: string; mediaId?: string; reason?: string }) {
  if (!target.siteId) return;
  const tags = [publicCdnSiteTag(target.siteId)];
  if (target.mediaId) tags.push(publicCdnMediaTag(target.siteId, target.mediaId));
  try {
    await dangerouslyDeleteByTag(tags);
  } catch (error) {
    console.error('Public CDN cache purge failed:', { tags, reason: target.reason, error });
  }
}

export type PublicContractCacheScope = 'discovery' | 'render' | 'private' | 'error';

const cacheControlByScope: Record<PublicContractCacheScope, string> = {
  discovery: 'public, max-age=60, stale-while-revalidate=300',
  // Publication may be withdrawn between reads. Revalidate at the origin even
  // with an unchanged URL; ETag still avoids resending an unchanged payload.
  render: 'public, no-cache, must-revalidate',
  private: 'no-store',
  error: 'no-store',
};

export interface PublicContractResponseOptions {
  status?: number;
  requestId: string;
  cache: PublicContractCacheScope;
  request?: Request;
  etagSeed?: unknown;
  contractVersion?: string;
  schemaVersion?: string;
  siteId?: string;
  cacheRevision?: string;
  headers?: HeadersInit;
}

export const withPublicContractHeaders = (
  response: NextResponse,
  options: PublicContractResponseOptions,
) => {
  response.headers.set('cache-control', cacheControlByScope[options.cache]);
  response.headers.set('vary', 'Accept, Origin');
  response.headers.set('x-backy-cache-scope', options.cache);
  response.headers.set('x-backy-contract-version', options.contractVersion || BACKY_PUBLIC_CONTRACT_VERSION);
  response.headers.set('x-backy-request-id', options.requestId);

  if (options.schemaVersion) {
    response.headers.set('x-backy-schema-version', options.schemaVersion);
  }

  if (options.siteId) {
    response.headers.set('x-backy-site-id', options.siteId);
  }

  if (options.cacheRevision) {
    response.headers.set('x-backy-cache-revision', options.cacheRevision);
  }

  if (options.headers) {
    for (const [key, value] of new Headers(options.headers).entries()) {
      response.headers.set(key, value);
    }
  }

  // Browser-facing Cache-Control above is unchanged. Anonymous public reads
  // additionally get a Vercel-only CDN TTL plus purgeable site tags.
  if (options.cache === 'discovery' || options.cache === 'render') {
    applyPublicCdnCache(response.headers, {
      kind: options.cache,
      request: options.request,
      status: response.status,
      siteId: options.siteId,
    });
  } else {
    response.headers.delete('vercel-cache-tag');
    response.headers.set('vercel-cdn-cache-control', 'no-store');
  }

  return response;
};

export const publicContractJson = <TBody>(
  body: TBody,
  options: PublicContractResponseOptions,
) => {
  const status = options.status || 200;
  const shouldAttachCacheMetadata = shouldAttachEtag(status, options.cache);
  const etagSeed = options.etagSeed ?? body;
  const etag = shouldAttachCacheMetadata
    ? createEtag(etagSeed)
    : null;
  const response = etag && requestHasMatchingEtag(options.request, etag)
    ? new NextResponse(null, { status: 304 })
    : NextResponse.json(body, { status: options.status });

  if (etag) {
    response.headers.set('etag', etag);
  }

  return withPublicContractHeaders(response, {
    ...options,
    cacheRevision: options.cacheRevision || (shouldAttachCacheMetadata ? createPublicCacheRevision(etagSeed) : undefined),
  });
};

export const publicContractResponse = (
  body: BodyInit | null,
  options: PublicContractResponseOptions,
  init: ResponseInit = {},
) => {
  const status = options.status || 200;
  const shouldAttachCacheMetadata = shouldAttachEtag(status, options.cache);
  const etagSeed = options.etagSeed ?? body ?? '';
  const etag = shouldAttachCacheMetadata
    ? createEtag(etagSeed)
    : null;
  const response = etag && requestHasMatchingEtag(options.request, etag)
    ? new NextResponse(null, { ...init, status: 304 })
    : new NextResponse(body, { ...init, status });

  if (etag) {
    response.headers.set('etag', etag);
  }

  return withPublicContractHeaders(response, {
    ...options,
    cacheRevision: options.cacheRevision || (shouldAttachCacheMetadata ? createPublicCacheRevision(etagSeed) : undefined),
  });
};

const shouldAttachEtag = (status: number, cache: PublicContractCacheScope) => (
  status >= 200 && status < 300 && (cache === 'discovery' || cache === 'render')
);

const createEtag = (value: unknown) => {
  const hash = createHash('sha256')
    .update(JSON.stringify(normalizeEtagValue(value)))
    .digest('base64url')
    .slice(0, 24);

  return `"backy-${hash}"`;
};

export const createPublicCacheRevision = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(normalizeEtagValue(value)))
  .digest('base64url')
  .slice(0, 20);

const normalizeEtagValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeEtagValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'requestId' && key !== 'generatedAt')
      .map(([key, entry]) => [key, normalizeEtagValue(entry)]),
  );
};

const requestHasMatchingEtag = (request: Request | undefined, etag: string) => {
  const raw = request?.headers.get('if-none-match');
  if (!raw) {
    return false;
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => entry === etag || entry === '*');
};
