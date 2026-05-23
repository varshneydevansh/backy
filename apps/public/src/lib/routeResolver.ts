import {
  getCanonicalPathForPage,
  getBlogPosts,
  getCollectionRecordByIdOrSlug,
  getPageByPath,
  listCollectionRecords,
  listCollections,
  validatePreviewToken,
  type StoreBlogPost,
  type StoreCollection,
  type StoreCollectionRecord,
  type StorePage,
  type StoreSite,
} from './backyStore';
import { matchCollectionItemRoute, matchCollectionListRoute } from './collectionRoutes';
import { PRODUCT_COLLECTION_SLUG, productDesignReadinessFromValues } from './commerceCatalog';
import { frontendDesignProvenanceFromMetadata } from './frontendDesignContract';
import { resolveRedirectRoute, type ResolvedRedirectRoute } from './redirectRules';
import {
  applyLocalePrefixToPath,
  resolveLocalizedRoutePath,
  type ResolvedLocalizedRoutePath,
} from './siteLocalization';

type ResolvedRouteLocalization = {
  locale?: {
    code: string;
    default: boolean;
    direction: 'ltr' | 'rtl';
    pathPrefix: string;
    domain?: string | null;
    strategy: ResolvedLocalizedRoutePath['localeStrategy'];
    matchedBy: ResolvedLocalizedRoutePath['matchedBy'];
    path: string;
    basePath: string;
  };
};

type ResolvedPageRoute = {
  type: 'page';
  path: string;
  status: StorePage['status'];
  canonical: string;
  params: Record<string, string>;
  resource: {
    id: string;
    kind: 'page';
    title: string;
    slug: string;
    apiUrl: string;
    renderUrl: string;
  };
};

type ResolvedPostRoute = {
  type: 'post';
  path: string;
  status: StoreBlogPost['status'];
  canonical: string;
  params: Record<string, string>;
  resource: {
    id: string;
    kind: 'post';
    title: string;
    slug: string;
    apiUrl: string;
    hostedPath: string;
  };
};

type ResolvedDynamicItemRoute = {
  type: 'dynamicItem';
  path: string;
  status: StoreCollectionRecord['status'];
  canonical: string;
  params: Record<string, string>;
  resource: {
    id: string;
    kind: 'dynamicItem';
    title: string;
    slug: string;
    collectionId: string;
    collectionSlug: string;
    collectionName: string;
    apiUrl: string;
    renderUrl: string;
    hostedPath: string;
    frontendDesign?: ReturnType<typeof frontendDesignProvenanceFromMetadata>;
    collectionFrontendDesign?: ReturnType<typeof frontendDesignProvenanceFromMetadata>;
    designReadiness?: ReturnType<typeof productDesignReadinessFromValues>;
  };
};

type ResolvedDynamicListRoute = {
  type: 'dynamicList';
  path: string;
  status: StoreCollection['status'];
  canonical: string;
  params: Record<string, string>;
  resource: {
    id: string;
    kind: 'dynamicList';
    title: string;
    slug: string;
    collectionId: string;
    collectionSlug: string;
    collectionName: string;
    recordsUrl: string;
    renderUrl: string;
    hostedPath: string;
    recordCount: number;
    frontendDesign?: ReturnType<typeof frontendDesignProvenanceFromMetadata>;
  };
};

export type ResolvedSiteRoute =
  (
    | ResolvedPageRoute
    | ResolvedPostRoute
    | ResolvedDynamicListRoute
    | ResolvedDynamicItemRoute
    | ResolvedRedirectRoute
  ) & ResolvedRouteLocalization;

export function normalizeRoutePath(rawPath: string | null | undefined): string {
  const pathOnly = (rawPath || '/').split('?')[0].split('#')[0].trim();
  const normalized = pathOnly.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
}

const getPreviewPage = (siteId: string, pagePath: string, previewToken?: string | null) => {
  const previewPage = previewToken
    ? getPageByPath(siteId, pagePath, { includeUnpublished: true })
    : undefined;
  const canPreview = previewPage
    ? validatePreviewToken(siteId, 'page', previewPage.id, previewToken)
    : false;

  return canPreview ? previewPage : undefined;
};

const getPreviewPost = (siteId: string, slug: string, previewToken?: string | null) => {
  const previewPost = previewToken
    ? getBlogPosts(siteId, { slug, includeUnpublished: true }).posts[0]
    : undefined;
  const canPreview = previewPost
    ? validatePreviewToken(siteId, 'post', previewPost.id, previewToken)
    : false;

  return canPreview ? previewPost : undefined;
};

const routeLocaleMetadata = (localized: ResolvedLocalizedRoutePath): NonNullable<ResolvedRouteLocalization['locale']> => ({
  code: localized.locale.code,
  default: localized.locale.default,
  direction: localized.locale.direction,
  pathPrefix: localized.locale.pathPrefix,
  domain: localized.locale.domain || null,
  strategy: localized.localeStrategy,
  matchedBy: localized.matchedBy,
  path: localized.originalPath,
  basePath: localized.path,
});

const withLocalizedPathQuery = (url: string, path: string): string => {
  if (!url.includes('path=')) {
    return url;
  }

  const [base = '', query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('path', path);
  return `${base}?${params.toString()}`;
};

const localizedRouteResource = <TResource extends Record<string, unknown>>(
  resource: TResource,
  canonical: string,
): TResource => ({
  ...resource,
  ...(typeof resource.renderUrl === 'string'
    ? { renderUrl: withLocalizedPathQuery(resource.renderUrl, canonical) }
    : {}),
  ...(typeof resource.hostedPath === 'string'
    ? { hostedPath: canonical }
    : {}),
  ...(typeof resource.to === 'string'
    ? { to: canonical }
    : {}),
});

export const withLocalizedResolvedRoute = <TRoute extends ResolvedSiteRoute>(
  route: Omit<TRoute, 'locale'>,
  localized: ResolvedLocalizedRoutePath,
): TRoute => {
  const canonical = applyLocalePrefixToPath(route.canonical, localized);
  return {
    ...route,
    path: localized.originalPath,
    canonical,
    params: {
      ...route.params,
      locale: localized.locale.code,
    },
    resource: localizedRouteResource(route.resource, canonical),
    locale: routeLocaleMetadata(localized),
  } as unknown as TRoute;
};

export function resolveSiteRoute(
  site: StoreSite,
  rawPath: string,
  options: { previewToken?: string | null; host?: string | null } = {},
): ResolvedSiteRoute | null {
  const localized = resolveLocalizedRoutePath(site.settings, rawPath, { host: options.host });
  const path = localized.path;
  const redirectRoute = resolveRedirectRoute(site.settings, path);
  if (redirectRoute) {
    return withLocalizedResolvedRoute(redirectRoute, localized);
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/);

  if (blogMatch) {
    const slug = decodeURIComponent(blogMatch[1]);
    const post = getPreviewPost(site.id, slug, options.previewToken)
      || getBlogPosts(site.id, { slug }).posts[0];

    if (!post) {
      return null;
    }

    const canonical = post.meta?.canonical || `/blog/${post.slug}`;
    return withLocalizedResolvedRoute({
      type: 'post',
      path,
      status: post.status,
      canonical,
      params: { slug: post.slug },
      resource: {
        id: post.id,
        kind: 'post',
        title: post.title,
        slug: post.slug,
        apiUrl: `/api/sites/${site.id}/blog?slug=${encodeURIComponent(post.slug)}`,
        hostedPath: canonical,
      },
    }, localized);
  }

  const pagePath = path === '/' ? 'index' : path.slice(1);
  const page = getPreviewPage(site.id, pagePath, options.previewToken)
    || getPageByPath(site.id, pagePath);

  if (!page) {
    const collections = listCollections(site.id);
    const dynamicListMatch = matchCollectionListRoute(path, collections);
    if (dynamicListMatch) {
      const { collection, canonical, params } = dynamicListMatch;
      const records = listCollectionRecords(site.id, collection.id, { limit: 1000 }).records;

      return withLocalizedResolvedRoute({
        type: 'dynamicList',
        path,
        status: collection.status,
        canonical,
        params,
        resource: {
          id: collection.id,
          kind: 'dynamicList',
          title: collection.name,
          slug: collection.slug,
          collectionId: collection.id,
          collectionSlug: collection.slug,
          collectionName: collection.name,
          recordsUrl: `/api/sites/${site.id}/collections/${collection.id}/records`,
          renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(canonical)}`,
          hostedPath: canonical,
          recordCount: records.length,
          frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
        },
      }, localized);
    }

    const dynamicItemMatch = matchCollectionItemRoute(path, collections);
    if (!dynamicItemMatch) {
      return null;
    }

    const { collection, recordSlug, canonical, params } = dynamicItemMatch;
    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordSlug);

    if (!record) {
      return null;
    }

    const title = typeof record.values.title === 'string' && record.values.title.length > 0
      ? record.values.title
      : typeof record.values.name === 'string' && record.values.name.length > 0
        ? record.values.name
        : record.slug;
    const designReadiness = collection.slug === PRODUCT_COLLECTION_SLUG
      ? productDesignReadinessFromValues(record.values)
      : undefined;

    return withLocalizedResolvedRoute({
      type: 'dynamicItem',
      path,
      status: record.status,
      canonical,
      params: {
        ...params,
        recordSlug: record.slug,
      },
      resource: {
        id: record.id,
        kind: 'dynamicItem',
        title,
        slug: record.slug,
        collectionId: collection.id,
        collectionSlug: collection.slug,
        collectionName: collection.name,
        apiUrl: `/api/sites/${site.id}/collections/${collection.id}/records?slug=${encodeURIComponent(record.slug)}`,
        renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(canonical)}`,
        hostedPath: canonical,
        frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
        collectionFrontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
        ...(designReadiness ? { designReadiness } : {}),
      },
    }, localized);
  }

  const canonical = page.meta.canonical || getCanonicalPathForPage(page);
  return withLocalizedResolvedRoute({
    type: 'page',
    path,
    status: page.status,
    canonical,
    params: {},
    resource: {
      id: page.id,
      kind: 'page',
      title: page.title,
      slug: page.slug,
      apiUrl: `/api/sites/${site.id}/pages?path=${encodeURIComponent(path)}`,
      renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(path)}`,
    },
  }, localized);
}
