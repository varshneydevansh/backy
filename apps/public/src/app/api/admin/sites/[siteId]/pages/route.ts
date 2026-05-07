/**
 * Admin pages endpoint.
 *
 * GET  /api/admin/sites/[siteId]/pages
 * POST /api/admin/sites/[siteId]/pages
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminPage,
  getPageBySlug,
  getPageSummary,
  getSiteByIdOrSlug,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const includeUnpublished = searchParams.get('includeUnpublished') !== 'false';
    const pages = getPageSummary(site.id, { includeUnpublished });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        pages,
        pagination: {
          total: pages.length,
          limit: pages.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin pages list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await parseJsonBody(request);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const slug = normalizeSlug(body.slug || title);

    if (!title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Page title is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Page slug is required', requestId);
    }

    if (getPageBySlug(site.id, slug, { includeUnpublished: true })) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A page with this slug already exists', requestId);
    }

    const page = createAdminPage(site.id, {
      ...body,
      title,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          page,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin page create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
