/**
 * Public route resolver for custom frontends.
 *
 * GET /api/sites/[siteId]/resolve?path=/about
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, getSiteNavigation } from '@/lib/backyStore';
import { normalizeRoutePath, resolveSiteRoute } from '@/lib/routeResolver';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, path?: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      data: path
        ? {
            route: {
              type: 'notFound',
              path,
              status: 'archived',
              canonical: path,
              params: {},
            },
          }
        : undefined,
    },
    { status },
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const path = normalizeRoutePath(searchParams.get('path') || searchParams.get('slug') || '/');
    const previewToken = searchParams.get('previewToken');
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId, path);
    }

    const route = resolveSiteRoute(site, path, { previewToken });
    if (!route) {
      return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
          status: site.status,
        },
        route,
        navigation: getSiteNavigation(site.id),
      },
    });
  } catch (error) {
    console.error('Route resolve API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
