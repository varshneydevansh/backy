/**
 * Public render payload endpoint for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/render?path=/about
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPageByPath, getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildPublicRenderPayload } from '@/lib/renderPayload';

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || searchParams.get('slug') || '/';
    const includeUnpublished = searchParams.get('includeUnpublished') === 'true';

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = getPageByPath(site.id, path, { includeUnpublished });
    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json(buildPublicRenderPayload(site, page, { requestId, path }));
  } catch (error) {
    console.error('Render payload API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
