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
import {
  applySeoDefaults,
  applySeoSitemapAndRobotsSettings,
  buildRobotsTxtFromDiscovery,
  buildSeoDiscovery,
  buildSitemapXml,
  getHostedRouteUrl,
  getSiteCanonicalBaseUrl,
  jsonLdObjects,
  sitemapRoutes,
  siteJsonLd,
  type SeoDiscovery,
  type SeoRoute,
} from '@/lib/seoDiscovery';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { buildCollectionItemPath, buildCollectionListPath } from '@/lib/collectionRoutes';
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
import {
  createPublicCacheRevision,
  publicContractJson,
  withPublicContractHeaders,
} from '@/lib/publicContractResponse';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getRequestedFormat = (request: NextRequest) => {
  const headerFormat = request.headers.get('x-backy-seo-format');
  if (headerFormat === 'sitemap' || headerFormat === 'robots') {
    return headerFormat;
  }

  return new URL(request.url).searchParams.get('format');
};

const seoCacheRevision = (
  site: {
    id: string;
    slug: string;
    customDomain?: string | null;
    settings?: Site['settings'];
    isPublished: boolean;
    updatedAt?: string;
  },
  discovery: SeoDiscovery,
) => createPublicCacheRevision({
  site: {
    id: site.id,
    slug: site.slug,
    customDomain: site.customDomain || null,
    isPublished: site.isPublished,
    updatedAt: site.updatedAt,
    settings: site.settings?.seo,
  },
  routes: discovery.routes.map((route) => ({
    type: route.type,
    id: route.id,
    canonical: route.canonical,
    canonicalUrl: route.canonicalUrl,
    title: route.title,
    description: route.description,
    updatedAt: route.updatedAt,
    priority: route.priority,
    changeFrequency: route.changeFrequency,
    robots: route.robots,
    openGraph: route.openGraph,
    keywords: route.keywords,
    jsonLd: route.jsonLd,
    frontendDesign: route.frontendDesign,
    collectionFrontendDesign: route.collectionFrontendDesign,
  })),
  sitemap: discovery.sitemap,
  robots: discovery.robots,
});

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
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
    jsonLd: jsonLdObjects(page.meta?.jsonLd),
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
    jsonLd: jsonLdObjects(post.meta?.jsonLd),
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
  const canonical = buildCollectionItemPath(collection, record.slug);
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
    jsonLd: [],
    frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
    collectionFrontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
  };
};

const dynamicListSeoRoute = (collection: BackyCollection): SeoRoute => {
  const canonical = buildCollectionListPath(collection);
  const description = collection.description || '';

  return {
    type: 'dynamicList',
    id: collection.id,
    title: collection.name,
    description,
    path: canonical,
    canonical,
    status: collection.status,
    updatedAt: collection.updatedAt,
    priority: 0.65,
    changeFrequency: 'weekly',
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: collection.name,
      description,
    },
    keywords: [collection.slug],
    jsonLd: [],
    frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
  };
};

const buildRepositorySeoDiscovery = async (
  site: Site,
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  origin?: string,
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
  const routes = applySeoSitemapAndRobotsSettings(
    [
      ...pages.items.filter(isPubliclyReadable).map(pageSeoRoute),
      ...posts.items.filter(isPubliclyReadable).map(postSeoRoute),
      ...collections.items
        .filter((collection) => collection.status === 'published' && collection.permissions.publicRead)
        .map(dynamicListSeoRoute),
      ...dynamicItems.flat(),
    ].map((route) => applySeoDefaults(route, site)),
    site,
  ).sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.canonical.localeCompare(right.canonical);
  });
  const seo = site.settings?.seo;
  const sitemapEnabled = seo?.sitemap?.enabled !== false;

  const discovery: SeoDiscovery = {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
      customDomain: site.customDomain || null,
      canonicalBaseUrl: origin ? getSiteCanonicalBaseUrl(origin, site) : undefined,
    },
    defaults: {
      title: applySeoDefaults({
        type: 'page',
        id: site.id,
        title: site.name,
        description: seo?.defaultDescription || site.description || '',
        path: '/',
        canonical: '/',
        status: site.isPublished ? 'published' : 'draft',
        updatedAt: site.updatedAt,
        priority: 1,
        changeFrequency: 'daily',
        robots: {
          index: true,
          follow: true,
        },
        openGraph: {
          title: site.name,
          description: seo?.defaultDescription || site.description || '',
          image: seo?.defaultOgImage || undefined,
        },
        keywords: [],
        jsonLd: [],
      }, site).title,
      description: seo?.defaultDescription || site.description || '',
      jsonLd: siteJsonLd(seo),
      robots: {
        index: seo?.robots?.index !== false,
        follow: seo?.robots?.follow !== false,
      },
    },
    routes,
    sitemap: {
      url: `/api/sites/${site.id}/seo?format=sitemap`,
      count: sitemapEnabled ? routes.filter((route) => route.robots.index).length : 0,
      enabled: sitemapEnabled,
      includeDynamicRoutes: seo?.sitemap?.includeDynamicRoutes !== false,
    },
    robots: {
      url: `/api/sites/${site.id}/seo?format=robots`,
      index: seo?.robots?.index !== false,
      follow: seo?.robots?.follow !== false,
      extraRules: seo?.robots?.extraRules || undefined,
    },
  };

  if (!origin) {
    return discovery;
  }

  const customDomainBaseUrl = site.customDomain ? getSiteCanonicalBaseUrl(origin, site) : undefined;

  return {
    ...discovery,
    routes: discovery.routes.map((route) => ({
      ...route,
      canonicalUrl: getHostedRouteUrl(origin, site.slug, route.canonical, site.customDomain),
    })),
    sitemap: {
      ...discovery.sitemap,
      publicUrl: customDomainBaseUrl ? `${customDomainBaseUrl}/sitemap.xml` : undefined,
    },
    robots: {
      ...discovery.robots,
      publicUrl: customDomainBaseUrl ? `${customDomainBaseUrl}/robots.txt` : undefined,
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const origin = new URL(request.url).origin;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const discovery = await buildRepositorySeoDiscovery(site, repositories, origin);
      const cacheRevision = seoCacheRevision(site, discovery);
      const format = getRequestedFormat(request);

      if (format === 'sitemap') {
        return withPublicContractHeaders(
          new NextResponse(buildSitemapXml(sitemapRoutes(discovery)), {
            headers: {
              'content-type': 'application/xml; charset=utf-8',
            },
          }),
          {
            requestId,
            cache: 'discovery',
            siteId: site.id,
            cacheRevision,
          },
        );
      }

      if (format === 'robots') {
        return withPublicContractHeaders(
          new NextResponse(buildRobotsTxtFromDiscovery(discovery), {
            headers: {
              'content-type': 'text/plain; charset=utf-8',
            },
          }),
          {
            requestId,
            cache: 'discovery',
            siteId: site.id,
            cacheRevision,
          },
        );
      }

      return publicContractJson({
        success: true,
        requestId,
        data: discovery,
        routes: discovery.routes,
      }, {
        requestId,
        request,
        cache: 'discovery',
        siteId: site.id,
        cacheRevision,
        etagSeed: {
          discovery,
          cacheRevision,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const discovery = buildSeoDiscovery(site, { origin });
    const cacheRevision = seoCacheRevision(site, discovery);
    const format = getRequestedFormat(request);

    if (format === 'sitemap') {
      return withPublicContractHeaders(
        new NextResponse(buildSitemapXml(sitemapRoutes(discovery)), {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
          },
        }),
        {
          requestId,
          cache: 'discovery',
          siteId: site.id,
          cacheRevision,
        },
      );
    }

    if (format === 'robots') {
      return withPublicContractHeaders(
        new NextResponse(buildRobotsTxtFromDiscovery(discovery), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
          },
        }),
        {
          requestId,
          cache: 'discovery',
          siteId: site.id,
          cacheRevision,
        },
      );
    }

    return publicContractJson({
      success: true,
      requestId,
      data: discovery,
      routes: discovery.routes,
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
      cacheRevision,
      etagSeed: {
        discovery,
        cacheRevision,
      },
    });
  } catch (error) {
    console.error('Public SEO API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
