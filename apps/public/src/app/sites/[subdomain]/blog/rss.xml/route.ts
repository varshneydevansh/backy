import { NextRequest } from 'next/server';
import { GET as readPublicDiscovery } from '@/app/api/sites/[siteId]/blog/rss/route';
export async function GET(request: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const url = new URL(request.url);
  url.pathname = `/api/sites/${encodeURIComponent(subdomain)}/blog/rss`;
  const headers = new Headers(request.headers);
  return readPublicDiscovery(new NextRequest(url, { headers }), { params: Promise.resolve({ siteId: subdomain }) });
}
