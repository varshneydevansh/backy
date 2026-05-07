import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

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

const applyCorsHeaders = (headers: Headers, origin: string | null) => {
  if (!isAllowedOrigin(origin)) {
    return;
  }

  headers.set('Access-Control-Allow-Origin', origin as string);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response.headers, origin);
    return response;
  }

  const response = NextResponse.next();
  applyCorsHeaders(response.headers, origin);
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
