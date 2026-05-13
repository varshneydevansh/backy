/**
 * Public blog RSS feed endpoint.
 *
 * GET /api/sites/[siteId]/blog/rss
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyPost } from '@backy-cms/core';
import {
  getBlogPosts,
  getSiteByIdOrSlug,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
} from '@/lib/backyStore';
import { buildBlogRssXml, normalizeRepositoryPostForRss } from '@/lib/blogRss';
import { createPublicCacheRevision, withPublicContractHeaders } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '25', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 25;
};

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published'
  || (
    item.status === 'scheduled'
    && Boolean(item.scheduledAt)
    && Number.isFinite(Date.parse(item.scheduledAt || ''))
    && Date.parse(item.scheduledAt || '') <= Date.now()
  )
);

const textResponse = (
  body: string,
  status: number,
  requestId: string,
  siteId?: string,
) => withPublicContractHeaders(new NextResponse(body, {
  status,
  headers: {
    'content-type': 'text/plain; charset=utf-8',
  },
}), {
  status,
  requestId,
  cache: 'error',
  siteId,
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const limit = parseLimit(new URL(request.url).searchParams.get('limit'));
    const origin = new URL(request.url).origin;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return textResponse('Not found', 404, requestId, site?.id);
      }

      const [categories, tags, authors, cacheRevision] = await Promise.all([
        repositories.blogTaxonomy.listCategories(site.id),
        repositories.blogTaxonomy.listTags(site.id),
        repositories.blogTaxonomy.listAuthors(site.id),
        repositories.cacheInvalidations.latestRevision({
          siteId: site.id,
          scope: 'content',
        }),
      ]);
      const repositoryPosts: BackyPost[] = [];
      let repositoryOffset = 0;
      let hasMoreRepositoryPosts = true;
      while (hasMoreRepositoryPosts) {
        const result = await repositories.posts.list({
          siteId: site.id,
          includeUnpublished: true,
          status: 'all',
          limit: 100,
          offset: repositoryOffset,
        });
        repositoryPosts.push(...result.items);
        hasMoreRepositoryPosts = result.pagination.hasMore;
        repositoryOffset += result.pagination.limit;
      }
      const posts = repositoryPosts
        .filter(isPubliclyReadable)
        .slice(0, limit)
        .map(normalizeRepositoryPostForRss);
      const xml = buildBlogRssXml({ site, posts, categories, tags, authors, origin, feedPath: '/blog/rss.xml' });
      const revision = cacheRevision || createPublicCacheRevision({ site, posts, categories, tags, authors });

      return withPublicContractHeaders(new NextResponse(xml, {
        headers: {
          'content-type': 'application/rss+xml; charset=utf-8',
        },
      }), {
        requestId,
        request,
        cache: 'discovery',
        schemaVersion: 'rss.2.0',
        siteId: site.id,
        cacheRevision: revision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) {
      return textResponse('Not found', 404, requestId, site?.id);
    }

    const posts = getBlogPosts(site.id, { limit }).posts;
    const categories = listBlogCategories(site.id);
    const tags = listBlogTags(site.id);
    const authors = listBlogAuthors(site.id);
    const xml = buildBlogRssXml({ site, posts, categories, tags, authors, origin, feedPath: '/blog/rss.xml' });

    return withPublicContractHeaders(new NextResponse(xml, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
      },
    }), {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: 'rss.2.0',
      siteId: site.id,
      cacheRevision: createPublicCacheRevision({ site, posts, categories, tags, authors }),
    });
  } catch (error) {
    console.error('Blog RSS API error:', error);
    return textResponse('Internal server error', 500, requestId);
  }
}
