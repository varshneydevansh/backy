import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildRobotsTxtFromDiscovery, buildSeoDiscovery, getSiteCanonicalBaseUrl } from '@/lib/seoDiscovery';
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
  const hostedDiscovery = {
    ...discovery,
    sitemap: {
      ...discovery.sitemap,
      url: `${getSiteCanonicalBaseUrl(origin, site)}/sitemap.xml`,
    },
  };
  const text = buildRobotsTxtFromDiscovery(hostedDiscovery);
  const cacheRevision = createPublicCacheRevision({ site, discovery: hostedDiscovery, feed: 'hosted-robots' });

  return publicContractResponse(text, {
    request,
    requestId,
    cache: 'discovery',
    siteId: site.id,
    cacheRevision,
    etagSeed: {
      format: 'hosted-robots',
      site,
      discovery: hostedDiscovery,
      revision: cacheRevision,
    },
  }, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
