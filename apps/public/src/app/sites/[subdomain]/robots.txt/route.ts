import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildRobotsTxtFromDiscovery, buildSeoDiscovery } from '@/lib/seoDiscovery';

interface RouteParams {
  params: Promise<{
    subdomain: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { subdomain } = await params;
  const site = getSiteByIdOrSlug(subdomain);

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
      url: `${origin}/sites/${site.slug}/sitemap.xml`,
    },
  };

  return new NextResponse(buildRobotsTxtFromDiscovery(hostedDiscovery), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'x-backy-site-id': site.id,
    },
  });
}
