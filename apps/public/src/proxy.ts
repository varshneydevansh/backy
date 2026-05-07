import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getAllowedOrigins = () => {
  const configured = process.env.BACKY_CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
};

const isAllowedOrigin = (origin: string | null) => {
  if (!origin) {
    return false;
  }

  return getAllowedOrigins().has(origin);
};

const isAdminApiRequest = (request: NextRequest) => request.nextUrl.pathname.startsWith('/api/admin/');

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

const adminAuthError = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  origin: string | null,
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
  response.headers.set('x-backy-request-id', requestId);
  return response;
};

const applyCorsHeaders = (headers: Headers, origin: string | null) => {
  if (!isAllowedOrigin(origin)) {
    return;
  }

  headers.set('Access-Control-Allow-Origin', origin as string);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Backy-Admin-Key, X-API-Key');
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response.headers, origin);
    response.headers.set('x-backy-request-id', requestId);
    return response;
  }

  if (isAdminApiRequest(request) && shouldRequireAdminApiKey()) {
    const expectedKey = getExpectedAdminApiKey();
    if (!expectedKey) {
      return adminAuthError(
        503,
        'ADMIN_API_KEY_NOT_CONFIGURED',
        'Admin API key enforcement is enabled but BACKY_ADMIN_API_KEY is not configured.',
        requestId,
        origin,
      );
    }

    if (getProvidedAdminApiKey(request) !== expectedKey) {
      return adminAuthError(401, 'UNAUTHORIZED', 'A valid admin API key is required.', requestId, origin);
    }
  }

  const response = NextResponse.next();
  applyCorsHeaders(response.headers, origin);
  response.headers.set('x-backy-request-id', requestId);
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
