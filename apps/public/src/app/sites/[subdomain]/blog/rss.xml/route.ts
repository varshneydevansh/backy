import { NextRequest, NextResponse } from 'next/server';
import {
  getBlogPosts,
  getSiteByIdOrSlug,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
} from '@/lib/backyStore';
import { buildBlogRssXml } from '@/lib/blogRss';
import { createPublicCacheRevision, publicContractResponse } from '@/lib/publicContractResponse';

interface RouteParams {
  params: Promise<{
    subdomain: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { subdomain } = await params;
  const requestId = request.headers.get('x-request-id') || makeRequestId();
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
  const posts = getBlogPosts(site.id, { limit: 25 }).posts;
  const categories = listBlogCategories(site.id);
  const tags = listBlogTags(site.id);
  const authors = listBlogAuthors(site.id);
  const xml = buildBlogRssXml({
    site,
    posts,
    categories,
    tags,
    authors,
    origin,
    feedPath: '/blog/rss.xml',
  });
  const cacheRevision = createPublicCacheRevision({ site, posts, categories, tags, authors });

  return publicContractResponse(xml, {
    request,
    requestId,
    cache: 'discovery',
    schemaVersion: 'rss.2.0',
    siteId: site.id,
    cacheRevision,
    etagSeed: {
      format: 'rss.2.0',
      site,
      posts,
      categories,
      tags,
      authors,
      revision: cacheRevision,
    },
  }, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
    },
  });
}
