/**
 * Public SEO discovery endpoint.
 *
 * GET /api/sites/[siteId]/seo
 * GET /api/sites/[siteId]/seo?format=sitemap
 * GET /api/sites/[siteId]/seo?format=robots
 * GET /api/sites/[siteId]/seo?format=search
 */

import { NextRequest } from 'next/server';
import { admitPublicDiscoveryRoutes, withPublicDiscoveryRead, PublicDiscoveryIncompleteError, PublicDiscoveryWithdrawnError, type PublicDiscoverySite } from '@/lib/publicDiscoveryRead';
import { BackyCollectionSearchSettingsError, backyCollectionSearchFields, backyCollectionSearchValueKeys, projectBackyCollectionSearchValues } from '@backy-cms/core';
import type { BackyCollection, BackyCollectionRecord, BackyPage, BackyPost, Site } from '@backy-cms/core';
import { getSiteByIdOrSlug, getPageSummary, getBlogPosts, listCollections, listCollectionRecords } from '@/lib/backyStore';
import {
  applySeoDefaults,
  applySeoRouteOverrides,
  applySeoSitemapAndRobotsSettings,
  buildRobotsTxtFromDiscovery,
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
  publicContractResponse,
  publicContractJson,
} from '@/lib/publicContractResponse';
import { pageHierarchyPaths, type PageHierarchyNode } from '@/lib/pageHierarchy';
import { collectRepositorySearchContent, collectRepositoryDiscoveryContent, readRepositorySearchSite, createSearchMetadataCollector, projectSearchMetadataRoutes, collectionRecordSearchMetadata, SearchMetadataIncompleteError } from '@/lib/searchMetadata';

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
  item.status === 'published'
  || (
    item.status === 'scheduled'
    && Boolean(item.scheduledAt)
    && Number.isFinite(Date.parse(item.scheduledAt || ''))
    && Date.parse(item.scheduledAt || '') <= Date.now()
  )
);

type SeoMeta = Partial<Record<'canonical' | 'title' | 'description' | 'noIndex' | 'noFollow' | 'ogImage' | 'keywords' | 'jsonLd', unknown>>;
type SeoPage = Pick<BackyPage, 'id' | 'siteId' | 'title' | 'slug' | 'description' | 'status' | 'isHomepage' | 'updatedAt'> & { parentId?: string | null; meta?: SeoMeta };
type SeoPost = Pick<BackyPost, 'id' | 'title' | 'slug' | 'excerpt' | 'status' | 'updatedAt'> & { meta?: SeoMeta };
type SeoCollection = Pick<BackyCollection, 'id' | 'name' | 'slug' | 'description' | 'status' | 'updatedAt' | 'routePattern' | 'listRoutePattern'> & { metadata?: unknown };
type SeoRecord = Pick<BackyCollectionRecord, 'id' | 'slug' | 'status' | 'updatedAt'> & { values: Record<string, unknown> };

const pageCanonical = (page: SeoPage, routePath: string) => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
    ? page.meta.canonical
    : routePath;
};

const pageSeoRoute = (page: SeoPage, routePath: string): SeoRoute => {
  const canonical = pageCanonical(page, routePath);
  const title = typeof page.meta?.title === 'string' && page.meta.title.length > 0 ? page.meta.title : page.title;
  const description = typeof page.meta?.description === 'string' ? page.meta.description : page.description || '';

  return {
    type: 'page',
    id: page.id,
    title,
    description,
    path: routePath,
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

const pageSeoRoutes = (pages: SeoPage[], siteId: string, inventory: readonly PageHierarchyNode[] = pages): SeoRoute[] => {
  const paths = pageHierarchyPaths(inventory, siteId);
  return pages.filter(isPubliclyReadable).flatMap(page => {
    const path = paths.get(page.id);
    return path ? [pageSeoRoute(page, path)] : [];
  });
};

const postSeoRoute = (post: SeoPost): SeoRoute => {
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
    path: `/blog/${post.slug}`,
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

const recordTitle = (record: SeoRecord): string => {
  const title = record.values.title || record.values.name || record.values.heading || record.values.slug;
  return typeof title === 'string' && title.trim().length > 0 ? title : record.slug;
};

const recordDescription = (record: SeoRecord): string => {
  const description = record.values.description || record.values.summary || record.values.excerpt;
  return typeof description === 'string' ? description : '';
};

const recordImage = (record: SeoRecord): string | undefined => {
  const image = record.values.image || record.values.featuredImage || record.values.thumbnail;
  return typeof image === 'string' && image.length > 0 ? image : undefined;
};

const dynamicItemSeoRoute = (collection: SeoCollection, record: SeoRecord): SeoRoute => {
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

const dynamicListSeoRoute = (collection: SeoCollection): SeoRoute => {
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

const dynamicItemSearchRoute = (collection: SeoCollection, record: SeoRecord): SeoRoute => {
  const route = dynamicItemSeoRoute(collection, record);
  const metadata = (collection.metadata as { publicSearch?: unknown } | undefined)?.publicSearch === undefined
    ? collectionRecordSearchMetadata(record.values) : backyCollectionSearchFields(record.values, collection.metadata);
  return { ...route, description: metadata.description || route.description, keywords: metadata.keywords };
};

const searchRoutes = (site: { name: string; settings?: Pick<Site['settings'], 'seo'> }, routes: SeoRoute[]) => {
  // Sitemap's includeDynamicRoutes controls sitemap inclusion, not site search.
  // Route overrides and global robots settings still govern public admission.
  const metadataRoutes = routes.map(route => route.type === 'dynamicList' ? { ...route, keywords: [] } : route);
  const overridden = applySeoRouteOverrides(metadataRoutes, site).map(route => applySeoDefaults(route, site));
  return projectSearchMetadataRoutes(overridden.map(route => ({
    ...route,
    robots: {
      index: route.robots.index && site.settings?.seo?.robots?.index !== false,
      follow: route.robots.follow && site.settings?.seo?.robots?.follow !== false,
    },
  })));
};


const searchResponse = (request: NextRequest, requestId: string, site: Pick<Site, 'id' | 'slug' | 'name'>, routes: ReturnType<typeof projectSearchMetadataRoutes>, revision?: string | null) => {
  const data = { site: { id: site.id, slug: site.slug, name: site.name }, routes };
  const cacheRevision = createPublicCacheRevision({ data, revision });
  return publicContractJson({ success: true, requestId, data }, {
    request, requestId, siteId: site.id, cache: 'render', cacheRevision, etagSeed: { data, cacheRevision },
  });
};

const buildDemoDiscoveryRoutes = async (site: NonNullable<ReturnType<typeof getSiteByIdOrSlug>>) => {
  const collect = createSearchMetadataCollector();
  const pages = getPageSummary(site.id, { includeUnpublished: true });
  const collections = listCollections(site.id);
  const arrayPage = <T,>(items: T[], input: { limit: number; offset: number }) => ({ items: items.slice(input.offset, input.offset + input.limit), pagination: { ...input, total: items.length, hasMore: input.offset + input.limit < items.length } });
  const pageItems = await collect(async input => arrayPage(pages, input), item => item.siteId === site.id);
  const postItems = await collect(async input => {
    const result = getBlogPosts(site.id, { ...input, includeUnpublished: true });
    if (!result.pagination) throw new SearchMetadataIncompleteError();
    return { items: result.posts, pagination: result.pagination };
  }, item => item.siteId === site.id);
  const collectionItems = await collect(async input => arrayPage(collections, input), item => item.siteId === site.id && item.status === 'published' && item.permissions.publicRead);
  const routes = [
    ...pageSeoRoutes(pageItems, site.id),
    ...postItems.filter(isPubliclyReadable).map(postSeoRoute),
    ...collectionItems.map(dynamicListSeoRoute),
  ];
  for (const collection of collectionItems) {
    const records = await collect(async input => {
      const result = listCollectionRecords(site.id, collection.id, { ...input, includeUnpublished: true });
      return { items: result.records, pagination: result.pagination };
    }, item => item.siteId === site.id && item.collectionId === collection.id);
    routes.push(...records.filter(isPubliclyReadable).map(record => dynamicItemSearchRoute(collection, record)));
  }
  return routes;
};

const buildDemoSearchRoutes = async (site: NonNullable<ReturnType<typeof getSiteByIdOrSlug>>) => {
  const collect = createSearchMetadataCollector();
  const pages = getPageSummary(site.id, { includeUnpublished: true });
  const collections = listCollections(site.id);
  const arrayPage = <T,>(items: T[], input: { limit: number; offset: number }) => ({ items: items.slice(input.offset, input.offset + input.limit), pagination: { ...input, total: items.length, hasMore: input.offset + input.limit < items.length } });
  const pageItems = await collect(async input => arrayPage(pages, input), item => item.siteId === site.id);
  const postItems = await collect(async input => {
    const result = getBlogPosts(site.id, input);
    if (!result.pagination) throw new SearchMetadataIncompleteError();
    return { items: result.posts, pagination: result.pagination };
  }, item => item.siteId === site.id);
  const collectionItems = await collect(async input => arrayPage(collections, input), item => item.siteId === site.id && item.status === 'published' && item.permissions.publicRead);
  const routes = [
    ...pageSeoRoutes(pageItems, site.id),
    ...postItems.filter(isPubliclyReadable).map(postSeoRoute),
    ...collectionItems.map(dynamicListSeoRoute),
  ];
  for (const collection of collectionItems) {
    const records = await collect(async input => {
      const result = listCollectionRecords(site.id, collection.id, input);
      return { items: result.records, pagination: result.pagination };
    }, item => item.siteId === site.id && item.collectionId === collection.id);
    const valueKeys = backyCollectionSearchValueKeys(collection.metadata);
    routes.push(...records.filter(isPubliclyReadable).map(record => dynamicItemSearchRoute(collection, {
      ...record, values: projectBackyCollectionSearchValues(record.values, valueKeys),
    })));
  }
  return searchRoutes(site, routes);
};


const buildRepositorySeoDiscovery = async (
  site: Site,
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  origin: string,
  forSearch = false,
): Promise<SeoDiscovery> => {
  const content = await collectRepositoryDiscoveryContent(repositories, site.id);
  const rawRoutes = [
    ...pageSeoRoutes(content.pages, site.id, content.pageInventory),
    ...content.posts.filter(isPubliclyReadable).map(postSeoRoute),
    ...content.collections.map(dynamicListSeoRoute),
    ...content.dynamicItems.filter(({ record }) => isPubliclyReadable(record))
      .map(({ collection, record }) => forSearch ? dynamicItemSearchRoute(collection, record) : dynamicItemSeoRoute(collection, record)),
  ];
  return assembleSeoDiscovery(site, rawRoutes, origin, forSearch);
};

const assembleSeoDiscovery = (
  site: PublicDiscoverySite & { id: string; isPublished: boolean; updatedAt?: string },
  rawRoutes: SeoRoute[], origin: string, forSearch = false,
): SeoDiscovery => {
  // Search does not inherit the sitemap's optional dynamic-route exclusion.
  const sitemapPolicy = forSearch ? { settings: { seo: { ...site.settings?.seo, sitemap: { ...site.settings?.seo?.sitemap, includeDynamicRoutes: true } } } } : site;
  const routes = applySeoSitemapAndRobotsSettings(
    admitPublicDiscoveryRoutes(rawRoutes, site, origin),
    sitemapPolicy,
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
      if (new URL(request.url).searchParams.get('format') === 'search') {
        const site = await readRepositorySearchSite(repositories.sites, siteId);
        if (!site?.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        const revisionBefore = await repositories.cacheInvalidations?.latestRevision({ siteId: site.id });
        const currentSite = await readRepositorySearchSite(repositories.sites, site.id);
        if (!currentSite?.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        const siteBefore = createPublicCacheRevision(currentSite);
        const content = await collectRepositorySearchContent(repositories, site.id);
        const routes = searchRoutes(currentSite, [
          ...pageSeoRoutes(content.pages, site.id, content.pageInventory),
          ...content.posts.filter(isPubliclyReadable).map(postSeoRoute),
          ...content.collections.map(dynamicListSeoRoute),
          ...content.dynamicItems.filter(({ record }) => isPubliclyReadable(record)).map(({ collection, record }) => dynamicItemSearchRoute(collection, record)),
        ]);
        const finalSite = await readRepositorySearchSite(repositories.sites, site.id);
        const revisionAfter = await repositories.cacheInvalidations?.latestRevision({ siteId: site.id });
        if (!finalSite?.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        if (revisionBefore !== revisionAfter || siteBefore !== createPublicCacheRevision(finalSite)) throw new SearchMetadataIncompleteError();
        return searchResponse(request, requestId, finalSite, routes, revisionAfter);
      }


      let site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const forSearch = new URL(request.url).searchParams.get('format') === 'search';
      const snapshot = await withPublicDiscoveryRead(repositories, site, currentSite =>
        getRequestedFormat(request) === 'robots' && !forSearch
          ? Promise.resolve(assembleSeoDiscovery(currentSite, [], origin))
          : buildRepositorySeoDiscovery(currentSite, repositories, origin, forSearch));
      site = snapshot.site;
      const discovery = snapshot.value;
      if (forSearch) return searchResponse(request, requestId, site,
        projectSearchMetadataRoutes(discovery.routes.map(route => route.type === 'dynamicList' ? { ...route, keywords: [] } : route)), snapshot.revision);
      const cacheRevision = createPublicCacheRevision({ revision: snapshot.revision, discovery: seoCacheRevision(site, discovery) });
      const format = getRequestedFormat(request);

      if (format === 'sitemap') {
        const xml = buildSitemapXml(sitemapRoutes(discovery));
        return publicContractResponse(
          xml,
          {
            requestId,
            request,
            cache: 'render',
            siteId: site.id,
            cacheRevision,
            etagSeed: {
              format: 'sitemap',
              discovery,
              cacheRevision,
            },
          },
          {
            headers: {
              'content-type': 'application/xml; charset=utf-8',
            },
          },
        );
      }

      if (format === 'robots') {
        const text = buildRobotsTxtFromDiscovery(discovery);
        return publicContractResponse(
          text,
          {
            requestId,
            request,
            cache: 'render',
            siteId: site.id,
            cacheRevision,
            etagSeed: {
              format: 'robots',
              discovery,
              cacheRevision,
            },
          },
          {
            headers: {
              'content-type': 'text/plain; charset=utf-8',
            },
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
        cache: 'render',
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

    if (new URL(request.url).searchParams.get('format') === 'search') {
      const before = createPublicCacheRevision(site);
      const routes = await buildDemoSearchRoutes(site);
      const finalSite = getSiteByIdOrSlug(site.id);
      if (!finalSite?.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      if (before !== createPublicCacheRevision(finalSite)) throw new SearchMetadataIncompleteError();
      return searchResponse(request, requestId, finalSite, routes);
    }


    const before = createPublicCacheRevision(site);
    const robotsOnly = getRequestedFormat(request) === 'robots' && new URL(request.url).searchParams.get('format') !== 'search';
    const rawRoutes = robotsOnly ? [] : await buildDemoDiscoveryRoutes(site);
    const forSearch = new URL(request.url).searchParams.get('format') === 'search';
    const discovery = assembleSeoDiscovery(site, rawRoutes, origin, forSearch);
    const recheckedRoutes = robotsOnly ? [] : await buildDemoDiscoveryRoutes(site);
    const finalSite = getSiteByIdOrSlug(site.id);
    if (!finalSite?.isPublished) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    if (before !== createPublicCacheRevision(finalSite) || createPublicCacheRevision(rawRoutes) !== createPublicCacheRevision(recheckedRoutes)) throw new PublicDiscoveryIncompleteError();
    if (forSearch) return searchResponse(request, requestId, finalSite,
      projectSearchMetadataRoutes(discovery.routes.map(route => route.type === 'dynamicList' ? { ...route, keywords: [] } : route)));
    const cacheRevision = seoCacheRevision(site, discovery);
    const format = getRequestedFormat(request);

    if (format === 'sitemap') {
      const xml = buildSitemapXml(sitemapRoutes(discovery));
      return publicContractResponse(
        xml,
        {
          requestId,
          request,
          cache: 'render',
          siteId: site.id,
          cacheRevision,
          etagSeed: {
            format: 'sitemap',
            discovery,
            cacheRevision,
          },
        },
        {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
          },
        },
      );
    }

    if (format === 'robots') {
      const text = buildRobotsTxtFromDiscovery(discovery);
      return publicContractResponse(
        text,
        {
          requestId,
          request,
          cache: 'render',
          siteId: site.id,
          cacheRevision,
          etagSeed: {
            format: 'robots',
            discovery,
            cacheRevision,
          },
        },
        {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
          },
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
      cache: 'render',
      siteId: site.id,
      cacheRevision,
      etagSeed: {
        discovery,
        cacheRevision,
      },
    });
  } catch (error) {
    if (error instanceof PublicDiscoveryWithdrawnError) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    if (error instanceof PublicDiscoveryIncompleteError) return errorResponse(503, 'PUBLIC_DISCOVERY_INCOMPLETE', error.message, requestId);
    if (error instanceof BackyCollectionSearchSettingsError || error instanceof SearchMetadataIncompleteError) return errorResponse(503, 'SEARCH_METADATA_INCOMPLETE', error.message, requestId);
    console.error('Public SEO API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
