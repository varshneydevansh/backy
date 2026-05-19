import { NextRequest } from 'next/server';
import type { BackyPost } from '@backy-cms/core';
import {
  getBlogPosts,
  getSiteByIdOrSlug,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
} from '@/lib/backyStore';
import { buildBlogRssXml, normalizeRepositoryPostForRss } from '@/lib/blogRss';
import { createPublicCacheRevision, publicContractResponse } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    subdomain: string;
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { subdomain } = await params;
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const origin = new URL(request.url).origin;
  const limit = parseLimit(new URL(request.url).searchParams.get('limit'));

  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(subdomain) || await repositories.sites.getBySlug(subdomain);

    if (!site || !site.isPublished) {
      return publicContractResponse('Not found', {
        request,
        requestId,
        status: 404,
        cache: 'error',
        siteId: site?.id,
      }, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
      });
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
    const xml = buildBlogRssXml({
      site,
      posts,
      categories,
      tags,
      authors,
      origin,
      feedPath: '/blog/rss.xml',
    });
    const revision = cacheRevision || createPublicCacheRevision({ site, posts, categories, tags, authors });

    return publicContractResponse(xml, {
      request,
      requestId,
      cache: 'discovery',
      schemaVersion: 'rss.2.0',
      siteId: site.id,
      cacheRevision: revision,
      etagSeed: {
        format: 'hosted-rss',
        site,
        posts,
        categories,
        tags,
        authors,
        revision,
      },
    }, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
      },
    });
  }

  const site = getSiteByIdOrSlug(subdomain);

  if (!site || !site.isPublished) {
    return publicContractResponse('Not found', {
      request,
      requestId,
      status: 404,
      cache: 'error',
      siteId: site?.id,
    }, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  const posts = getBlogPosts(site.id, { limit }).posts;
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
