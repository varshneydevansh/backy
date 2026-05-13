import { NextRequest, NextResponse } from 'next/server';
import {
  getBlogPosts,
  getSiteByIdOrSlug,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
} from '@/lib/backyStore';
import { buildBlogRssXml } from '@/lib/blogRss';

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
  const posts = getBlogPosts(site.id, { limit: 25 }).posts;
  const xml = buildBlogRssXml({
    site,
    posts,
    categories: listBlogCategories(site.id),
    tags: listBlogTags(site.id),
    authors: listBlogAuthors(site.id),
    origin,
    feedPath: '/blog/rss.xml',
  });

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'x-backy-site-id': site.id,
    },
  });
}
