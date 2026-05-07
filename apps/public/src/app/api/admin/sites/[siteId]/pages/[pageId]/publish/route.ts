import { NextRequest, NextResponse } from 'next/server';
import { getAdminPageById, getSiteByIdOrSlug, publishAdminPage } from '@/lib/backyStore';
import { buildSiteReadiness } from '@/lib/siteReadiness';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
) => (
  NextResponse.json({
    success: false,
    requestId,
    error: { code, message, details },
  }, { status })
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const currentPage = getAdminPageById(site.id, pageId);

    if (!currentPage) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const readiness = buildSiteReadiness(site).pages.find((item) => item.id === currentPage.id);
    const readinessErrors = readiness?.checks.filter((check) => (
      check.status !== 'pass' && check.severity === 'error'
    )) || [];

    if (readinessErrors.length > 0) {
      return errorResponse(
        400,
        'READINESS_BLOCKED',
        'Resolve page readiness errors before publishing',
        requestId,
        {
          readiness,
          checks: readinessErrors,
        },
      );
    }

    const page = publishAdminPage(site.id, pageId, request.headers.get('x-backy-actor') || 'admin');

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { page } });
  } catch (error) {
    console.error('Admin page publish API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
