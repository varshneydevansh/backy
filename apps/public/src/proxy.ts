import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const BACKY_ADMIN_CONTRACT_VERSION = 'backy.admin.v1';
const BACKY_ADMIN_SETTINGS_SCHEMA_VERSION = 'backy.admin-settings.v1';
const BACKY_CORS_EXPOSED_HEADERS = [
  'ETag',
  'x-backy-admin-contract-version',
  'x-backy-cache-revision',
  'x-backy-cache-scope',
  'x-backy-contract-version',
  'x-backy-hosted-cache-policy',
  'x-backy-media-id',
  'x-backy-render-surface',
  'x-backy-request-id',
  'x-backy-schema-version',
  'x-backy-site-id',
  'x-backy-supported-schema-versions',
].join(', ');

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeCorsOrigin = (origin: string | null | undefined) => {
  const trimmed = origin?.trim();
  if (!trimmed || trimmed === '*') {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const getAllowedOrigins = () => {
  const configured = process.env.BACKY_CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map(normalizeCorsOrigin)
    .filter((origin): origin is string => Boolean(origin)) ?? [];

  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS.map(normalizeCorsOrigin).filter((origin): origin is string => Boolean(origin)),
    ...configured,
  ]);
};

const isAllowedOrigin = (origin: string | null) => {
  const normalizedOrigin = normalizeCorsOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  return getAllowedOrigins().has(normalizedOrigin);
};

const isAdminApiRequest = (request: NextRequest) => request.nextUrl.pathname.startsWith('/api/admin/');
const isAdminAuthRequest = (request: NextRequest) => request.nextUrl.pathname.startsWith('/api/admin/auth/');
const isAdminSettingsRequest = (request: NextRequest) => request.nextUrl.pathname === '/api/admin/settings';
const isUploadRequest = (request: NextRequest) => request.nextUrl.pathname.startsWith('/uploads/');
const hostedSeoMatch = (pathname: string) => pathname.match(/^\/sites\/([^/]+)\/(sitemap\.xml|robots\.txt)$/);
const isHostedBlogRssRequest = (pathname: string) => /^\/sites\/[^/]+\/blog\/rss\.xml$/.test(pathname);
const isHostedHtmlRequest = (request: NextRequest) => (
  (request.method === 'GET' || request.method === 'HEAD')
  && request.nextUrl.pathname.startsWith('/sites/')
  && !hostedSeoMatch(request.nextUrl.pathname)
  && !isHostedBlogRssRequest(request.nextUrl.pathname)
);

const shouldRequireAdminApiKey = () => (
  process.env.BACKY_REQUIRE_ADMIN_API_KEY === 'true'
);

const getExpectedAdminApiKey = () => (
  process.env.BACKY_ADMIN_API_KEY?.trim() ||
  process.env.BACKY_ADMIN_SECRET_KEY?.trim() ||
  ''
);

const getProvidedAdminApiKey = (request: NextRequest) => {
  const explicitHeader = request.headers.get('x-backy-admin-key') || request.headers.get('x-api-key');
  if (explicitHeader?.trim()) {
    return explicitHeader.trim();
  }

  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const requestHeadersWithRequestId = (request: NextRequest, requestId: string) => {
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  return headers;
};

const adminAuthError = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  origin: string | null,
  schemaVersion?: string,
) => {
  const response = NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  );
  applyCorsHeaders(response.headers, origin);
  applyAdminHeaders(response.headers);
  if (schemaVersion) {
    response.headers.set('x-backy-schema-version', schemaVersion);
  }
  response.headers.set('x-backy-request-id', requestId);
  return response;
};

const applyCorsHeaders = (headers: Headers, origin: string | null) => {
  if (!isAllowedOrigin(origin)) {
    return;
  }

  headers.set('Access-Control-Allow-Origin', origin as string);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Backy-Admin-Key, X-API-Key, X-Backy-Admin-Session');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Expose-Headers', BACKY_CORS_EXPOSED_HEADERS);
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
};

const applyAdminHeaders = (headers: Headers) => {
  headers.set('Cache-Control', 'no-store');
  headers.set('x-backy-cache-scope', 'admin');
  headers.set('x-backy-admin-contract-version', BACKY_ADMIN_CONTRACT_VERSION);
};

const applyHostedHtmlHeaders = (headers: Headers, request: NextRequest) => {
  const isPreview = request.nextUrl.searchParams.has('previewToken');
  headers.set('Cache-Control', 'no-store');
  headers.set('x-backy-cache-scope', isPreview ? 'private' : 'hosted-html');
  headers.set('x-backy-hosted-cache-policy', isPreview ? 'preview-no-store' : 'html-no-store');
  headers.set('x-backy-render-surface', 'hosted-html');
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  if (isUploadRequest(request)) {
    const url = request.nextUrl.clone();
    url.pathname = `/api${url.pathname}`;
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeadersWithRequestId(request, requestId),
      },
    });
  }

  const seoMatch = hostedSeoMatch(request.nextUrl.pathname);
  if (seoMatch) {
    const [, siteId, file] = seoMatch;
    const headers = requestHeadersWithRequestId(request, requestId);
    headers.set('x-backy-seo-format', file === 'sitemap.xml' ? 'sitemap' : 'robots');
    const url = request.nextUrl.clone();
    url.pathname = `/api/sites/${siteId}/seo`;
    url.searchParams.set('format', file === 'sitemap.xml' ? 'sitemap' : 'robots');
    return NextResponse.rewrite(url, {
      request: {
        headers,
      },
    });
  }

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response.headers, origin);
    response.headers.set('x-backy-request-id', requestId);
    return response;
  }

  if (isAdminApiRequest(request) && !isAdminAuthRequest(request) && shouldRequireAdminApiKey()) {
    const expectedKey = getExpectedAdminApiKey();
    if (!expectedKey) {
      return adminAuthError(
        503,
        'ADMIN_API_KEY_NOT_CONFIGURED',
        'Admin API key enforcement is enabled but BACKY_ADMIN_API_KEY is not configured.',
        requestId,
        origin,
        isAdminSettingsRequest(request) ? BACKY_ADMIN_SETTINGS_SCHEMA_VERSION : undefined,
      );
    }

    if (getProvidedAdminApiKey(request) !== expectedKey) {
      return adminAuthError(
        401,
        'UNAUTHORIZED',
        'A valid admin API key is required.',
        requestId,
        origin,
        isAdminSettingsRequest(request) ? BACKY_ADMIN_SETTINGS_SCHEMA_VERSION : undefined,
      );
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeadersWithRequestId(request, requestId),
    },
  });
  applyCorsHeaders(response.headers, origin);
  if (isAdminApiRequest(request)) {
    applyAdminHeaders(response.headers);
    if (isAdminSettingsRequest(request)) {
      response.headers.set('x-backy-schema-version', BACKY_ADMIN_SETTINGS_SCHEMA_VERSION);
    }
  }
  if (isHostedHtmlRequest(request)) {
    applyHostedHtmlHeaders(response.headers, request);
  }
  response.headers.set('x-backy-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/api/:path*', '/uploads/:path*', '/sites/:path*'],
};
