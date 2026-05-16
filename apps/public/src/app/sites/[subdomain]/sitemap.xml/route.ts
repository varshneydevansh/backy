import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildSeoDiscovery, buildSitemapXml, getHostedRouteUrl, sitemapRoutes } from '@/lib/seoDiscovery';
import { createPublicCacheRevision, publicContractResponse } from '@/lib/publicContractResponse';

interface RouteParams {
  params: Promise<{
    subdomain: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { subdomain } = await params;
  const site = getSiteByIdOrSlug(subdomain);
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  if (!site || !site.isPublished) {
    return new NextResponse('Not found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const origin = new URL(request.url).origin;
  const discovery = buildSeoDiscovery(site);
  const xml = buildSitemapXml(sitemapRoutes(discovery), (route) => getHostedRouteUrl(origin, site.slug, route.canonical, site.customDomain));
  const cacheRevision = createPublicCacheRevision({ site, discovery, feed: 'hosted-sitemap' });

  return publicContractResponse(xml, {
    request,
    requestId,
    cache: 'discovery',
    siteId: site.id,
    cacheRevision,
    etagSeed: {
      format: 'hosted-sitemap',
      site,
      discovery,
      revision: cacheRevision,
    },
  }, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
    },
  });
}
