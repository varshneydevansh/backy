/**
 * Public SEO discovery endpoint.
 *
 * GET /api/sites/[siteId]/seo
 * GET /api/sites/[siteId]/seo?format=sitemap
 * GET /api/sites/[siteId]/seo?format=robots
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollection, BackyCollectionRecord, BackyPage, BackyPost, Site } from '@backy-cms/core';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildRobotsTxt, buildSeoDiscovery, buildSitemapXml, type SeoDiscovery, type SeoRoute } from '@/lib/seoDiscovery';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string' && value.trim().length > 0
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : []
);

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const pageCanonical = (page: BackyPage) => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
    ? page.meta.canonical
    : `/${page.slug}`;
};

const pageSeoRoute = (page: BackyPage): SeoRoute => {
  const canonical = pageCanonical(page);
  const title = typeof page.meta?.title === 'string' && page.meta.title.length > 0 ? page.meta.title : page.title;
  const description = typeof page.meta?.description === 'string' ? page.meta.description : page.description || '';

  return {
    type: 'page',
    id: page.id,
    title,
    description,
    path: canonical,
    canonical,
    status: page.status,
    updatedAt: page.updatedAt,
    priority: page.isHomepage ? 1 : 0.8,
    changeFrequency: page.isHomepage ? 'daily' : 'weekly',
    robots: {
      index: page.meta?.noIndex !== true,
      follow: page.meta?.noFollow !== true,
    },
    openGraph: {
      title,
      description,
      image: typeof page.meta?.ogImage === 'string' ? page.meta.ogImage : undefined,
    },
    keywords: toStringArray(page.meta?.keywords),
  };
};

const postSeoRoute = (post: BackyPost): SeoRoute => {
  const canonical = typeof post.meta?.canonical === 'string' && post.meta.canonical.length > 0
    ? post.meta.canonical
    : `/blog/${post.slug}`;
  const title = typeof post.meta?.title === 'string' && post.meta.title.length > 0 ? post.meta.title : post.title;
  const description = typeof post.meta?.description === 'string' ? post.meta.description : post.excerpt || '';

  return {
    type: 'post',
    id: post.id,
    title,
    description,
    path: canonical,
    canonical,
    status: post.status,
    updatedAt: post.updatedAt,
    priority: 0.7,
    changeFrequency: 'weekly',
    robots: {
      index: post.meta?.noIndex !== true,
      follow: post.meta?.noFollow !== true,
    },
    openGraph: {
      title,
      description,
      image: typeof post.meta?.ogImage === 'string' ? post.meta.ogImage : undefined,
    },
    keywords: toStringArray(post.meta?.keywords),
  };
};

const recordTitle = (record: BackyCollectionRecord): string => {
  const title = record.values.title || record.values.name || record.values.heading || record.values.slug;
  return typeof title === 'string' && title.trim().length > 0 ? title : record.slug;
};

const recordDescription = (record: BackyCollectionRecord): string => {
  const description = record.values.description || record.values.summary || record.values.excerpt;
  return typeof description === 'string' ? description : '';
};

const recordImage = (record: BackyCollectionRecord): string | undefined => {
  const image = record.values.image || record.values.featuredImage || record.values.thumbnail;
  return typeof image === 'string' && image.length > 0 ? image : undefined;
};

const dynamicItemSeoRoute = (collection: BackyCollection, record: BackyCollectionRecord): SeoRoute => {
  const canonical = `/${collection.slug}/${record.slug}`;
  const title = recordTitle(record);
  const description = recordDescription(record);

  return {
    type: 'dynamicItem',
    id: record.id,
    title,
    description,
    path: canonical,
    canonical,
    status: record.status,
    updatedAt: record.updatedAt,
    priority: 0.6,
    changeFrequency: 'weekly',
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      image: recordImage(record),
    },
    keywords: [collection.slug, record.slug],
  };
};

const buildRepositorySeoDiscovery = async (
  site: Site,
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
): Promise<SeoDiscovery> => {
  const [pages, posts] = await Promise.all([
    repositories.pages.list({
      siteId: site.id,
      includeUnpublished: false,
      status: 'published',
      limit: 100,
      offset: 0,
    }),
    repositories.posts.list({
      siteId: site.id,
      includeUnpublished: false,
      status: 'published',
      limit: 100,
      offset: 0,
    }),
  ]);
  const collections = await repositories.collections.list({
    siteId: site.id,
    includeUnpublished: false,
    status: 'published',
    limit: 100,
    offset: 0,
  });
  const dynamicItems = await Promise.all(
    collections.items
      .filter((collection) => collection.status === 'published' && collection.permissions.publicRead)
      .map(async (collection) => {
        const records = await repositories.collections.listRecords({
          siteId: site.id,
          collectionId: collection.id,
          includeUnpublished: false,
          status: 'published',
          limit: 1000,
          offset: 0,
        });

        return records.items
          .filter(isPubliclyReadable)
          .map((record) => dynamicItemSeoRoute(collection, record));
      }),
  );
  const routes = [
    ...pages.items.filter(isPubliclyReadable).map(pageSeoRoute),
    ...posts.items.filter(isPubliclyReadable).map(postSeoRoute),
    ...dynamicItems.flat(),
  ].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.canonical.localeCompare(right.canonical);
  });

  return {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
    },
    defaults: {
      title: site.name,
      description: site.description || '',
      robots: {
        index: true,
        follow: true,
      },
    },
    routes,
    sitemap: {
      url: `/api/sites/${site.id}/seo?format=sitemap`,
      count: routes.filter((route) => route.robots.index).length,
    },
    robots: {
      url: `/api/sites/${site.id}/seo?format=robots`,
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const discovery = await buildRepositorySeoDiscovery(site, repositories);
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
    }

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
