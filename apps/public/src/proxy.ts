import { NextRequest, NextResponse } from 'next/server';
import { requireAdminCredential } from '@/lib/adminAccess';
import { adminCookieWriteOriginError, isTrustedAdminOrigin } from '@/lib/admin-auth/cookieWriteOrigin';
import { isAllowedPublicOrigin } from '@/lib/publicOriginPolicy';

const BACKY_ADMIN_CONTRACT_VERSION = 'backy.admin.v1';
const BACKY_ADMIN_SETTINGS_SCHEMA_VERSION = 'backy.admin-settings.v1';
const BACKY_CORS_EXPOSED_HEADERS = [
  'ETag',
  'Accept-Ranges',
  'Content-Range',
  'Content-Length',
  'x-backy-admin-contract-version',
  'x-backy-cache-revision',
  'x-backy-blog-profile',
  'x-backy-page-admission-profile',
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

const isAdminApiRequest = (request: NextRequest) => request.nextUrl.pathname.startsWith('/api/admin/');
// Legacy comment delivery management shares the admin trust/cache boundary,
// while ordinary public comment reads and submissions retain public CORS.
const isPrivateCommentDeliveryRequest = (request: NextRequest) => (
  /^\/api\/sites\/[^/]+\/comments\/delivery-attempts\/?$/.test(request.nextUrl.pathname)
  || /^\/api\/sites\/[^/]+\/comments\/[^/]+\/delivery-attempts(?:\/[^/]+(?:\/reconciliation)?)?\/?$/.test(request.nextUrl.pathname)
);
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
  request: NextRequest,
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
  applyCorsHeaders(response.headers, request);
  applyAdminHeaders(response.headers);
  if (schemaVersion) {
    response.headers.set('x-backy-schema-version', schemaVersion);
  }
  response.headers.set('x-backy-request-id', requestId);
  return response;
};

const applyCorsHeaders = (headers: Headers, request: NextRequest) => {
  const origin = request.headers.get('origin');
  const allowed = isAdminApiRequest(request) || isPrivateCommentDeliveryRequest(request)
    ? isTrustedAdminOrigin(request, origin) : isAllowedPublicOrigin(origin);
  if (!allowed) {
    return;
  }

  headers.set('Access-Control-Allow-Origin', origin as string);
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Backy-Admin-Key, X-API-Key, X-Backy-Admin-Session, Upload-Offset, X-Backy-File-Name, Range, If-Range');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Expose-Headers', BACKY_CORS_EXPOSED_HEADERS);
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
};

const applyAdminHeaders = (headers: Headers) => {
  // This proxy header wins over route headers in the served response. Keep
  // authenticated previews and private downloads consistent with their contracts.
  headers.set('Cache-Control', 'private, no-store');
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

export async function proxy(request: NextRequest) {
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
    applyCorsHeaders(response.headers, request);
    if (isPrivateCommentDeliveryRequest(request)) applyAdminHeaders(response.headers);
    response.headers.set('x-backy-request-id', requestId);
    return response;
  }

  // Auth handlers (including logout/rotation) consume sessions directly. A raw
  // API-key header cannot override the cookie selected by those handlers.
  if (isAdminAuthRequest(request)) {
    const cookieOriginError = adminCookieWriteOriginError(request);
    if (cookieOriginError) return adminAuthError(403, cookieOriginError.code, cookieOriginError.message, requestId, request);
  }

  if (isAdminApiRequest(request) && !isAdminAuthRequest(request) && shouldRequireAdminApiKey()) {
    const expectedKey = getExpectedAdminApiKey();
    if (!expectedKey) {
      return adminAuthError(
        503,
        'ADMIN_API_KEY_NOT_CONFIGURED',
        'Admin API key enforcement is enabled but BACKY_ADMIN_API_KEY is not configured.',
        requestId,
        request,
        isAdminSettingsRequest(request) ? BACKY_ADMIN_SETTINGS_SCHEMA_VERSION : undefined,
      );
    }

    const credential = await requireAdminCredential(request, requestId);
    if (credential instanceof NextResponse) {
      // Authentication errors must keep the proxy's private cache/CORS contract.
      // No route authorization decision is made here or forwarded as a bypass.
      applyCorsHeaders(credential.headers, request);
      applyAdminHeaders(credential.headers);
      credential.headers.set('x-backy-request-id', requestId);
      if (isAdminSettingsRequest(request)) credential.headers.set('x-backy-schema-version', BACKY_ADMIN_SETTINGS_SCHEMA_VERSION);
      return credential;
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeadersWithRequestId(request, requestId),
    },
  });
  applyCorsHeaders(response.headers, request);
  if (isAdminApiRequest(request) || isPrivateCommentDeliveryRequest(request)) {
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
