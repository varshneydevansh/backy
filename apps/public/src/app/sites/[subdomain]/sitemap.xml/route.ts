import { NextRequest } from 'next/server';
import { GET as readPublicDiscovery } from '@/app/api/sites/[siteId]/seo/route';
export async function GET(request: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const url = new URL(request.url);
  url.pathname = `/api/sites/${encodeURIComponent(subdomain)}/seo`;
  url.searchParams.set('format', 'sitemap');
  const headers = new Headers(request.headers);
  headers.set('x-backy-seo-format', 'sitemap');
  return readPublicDiscovery(new NextRequest(url, { headers }), { params: Promise.resolve({ siteId: subdomain }) });
}
