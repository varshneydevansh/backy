/**
 * Public SEO discovery endpoint.
 *
 * GET /api/sites/[siteId]/seo
 * GET /api/sites/[siteId]/seo?format=sitemap
 * GET /api/sites/[siteId]/seo?format=robots
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildRobotsTxt, buildSeoDiscovery, buildSitemapXml } from '@/lib/seoDiscovery';

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
      errorMessage: message,
    },
    { status },
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const discovery = buildSeoDiscovery(site);
    const format = new URL(request.url).searchParams.get('format');

    if (format === 'sitemap') {
      return new NextResponse(buildSitemapXml(discovery.routes), {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=60, stale-while-revalidate=300',
          'x-backy-request-id': requestId,
          'x-backy-site-id': site.id,
        },
      });
    }

    if (format === 'robots') {
      return new NextResponse(buildRobotsTxt(discovery.sitemap.url), {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=60, stale-while-revalidate=300',
          'x-backy-request-id': requestId,
          'x-backy-site-id': site.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: discovery,
      routes: discovery.routes,
    });
  } catch (error) {
    console.error('Public SEO API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
