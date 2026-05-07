/**
 * Admin page detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/pages/[pageId]
 * PATCH  /api/admin/sites/[siteId]/pages/[pageId]
 * DELETE /api/admin/sites/[siteId]/pages/[pageId]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAdminPage,
  getAdminPageById,
  getPageBySlug,
  getSiteByIdOrSlug,
  updateAdminPage,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
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
    const { siteId, pageId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = getAdminPageById(site.id, pageId);

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        page,
      },
    });
  } catch (error) {
    console.error('Admin page detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = getAdminPageById(site.id, pageId);

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Page slug is required', requestId);
    }

    if (nextSlug && nextSlug !== page.slug) {
      const conflict = getPageBySlug(site.id, nextSlug, { includeUnpublished: true });
      if (conflict && conflict.id !== page.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A page with this slug already exists', requestId);
      }
    }

    const updated = updateAdminPage(site.id, page.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        page: updated,
      },
    });
  } catch (error) {
    console.error('Admin page update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const deleted = deleteAdminPage(site.id, pageId);

    if (!deleted) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        pageId,
      },
    });
  } catch (error) {
    console.error('Admin page delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
