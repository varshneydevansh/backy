import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

export const BACKY_PUBLIC_CONTRACT_VERSION = 'backy.ai-frontend.v1';

export type PublicContractCacheScope = 'discovery' | 'render' | 'private' | 'error';

const cacheControlByScope: Record<PublicContractCacheScope, string> = {
  discovery: 'public, max-age=60, stale-while-revalidate=300',
  render: 'public, max-age=30, stale-while-revalidate=120',
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

  return response;
};

export const publicContractJson = <TBody>(
  body: TBody,
  options: PublicContractResponseOptions,
) => {
  const status = options.status || 200;
  const etag = shouldAttachEtag(status, options.cache)
    ? createEtag(options.etagSeed ?? body)
    : null;
  const response = etag && requestHasMatchingEtag(options.request, etag)
    ? new NextResponse(null, { status: 304 })
    : NextResponse.json(body, { status: options.status });

  if (etag) {
    response.headers.set('etag', etag);
  }

  return withPublicContractHeaders(response, options);
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
