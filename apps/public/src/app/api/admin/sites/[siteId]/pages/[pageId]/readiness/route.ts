/**
 * Admin page readiness endpoint.
 *
 * GET /api/admin/sites/[siteId]/pages/[pageId]/readiness
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminPageById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildSiteReadiness } from '@/lib/siteReadiness';

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
      errorMessage: message,
    },
    { status },
  )
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

    const readiness = buildSiteReadiness(site).pages.find((item) => item.id === page.id);

    if (!readiness) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        readiness,
      },
      readiness,
    });
  } catch (error) {
    console.error('Admin page readiness API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
