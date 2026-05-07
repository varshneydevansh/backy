/**
 * Admin sites endpoint.
 *
 * GET  /api/admin/sites
 * POST /api/admin/sites
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSite, getSiteByIdOrSlug, getSites } from '@/lib/backyStore';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { searchParams } = new URL(request.url);
    const includeUnpublished = searchParams.get('includeUnpublished') === 'true';
    const sites = getSites({ includeUnpublished });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sites,
        pagination: {
          total: sites.length,
          limit: sites.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin sites list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = normalizeSlug(body.slug || name);

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Site name is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Site slug is required', requestId);
    }

    if (getSiteByIdOrSlug(slug)) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A site with this slug already exists', requestId);
    }

    const site = createAdminSite({
      ...body,
      name,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          site,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin site create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
