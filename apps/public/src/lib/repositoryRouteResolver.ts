import type {
  BackyCollection,
  BackyCollectionRecord,
  BackyPage,
  BackyRepositories,
  BackyPost,
  Site,
} from '@backy-cms/core';
import { matchCollectionItemRoute, matchCollectionListRoute } from './collectionRoutes';
import { PRODUCT_COLLECTION_SLUG, productDesignReadinessFromValues } from './commerceCatalog';
import { frontendDesignProvenanceFromMetadata } from './frontendDesignContract';
import { getRepositoryPageByPublicPath } from './repositoryPages';
import { type ResolvedSiteRoute, withLocalizedResolvedRoute } from './routeResolver';
import { resolveRedirectRoute } from './redirectRules';
import { resolveLocalizedRoutePath } from './siteLocalization';

type RepositoryRouteResolverRepositories = Pick<
  BackyRepositories,
  'posts' | 'collections' | 'contentWorkflows'
> & {
  pages: Pick<BackyRepositories['pages'], 'getById' | 'getBySlug' | 'list'>;
};

export const isRepositoryContentPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published'
  || (
    item.status === 'scheduled'
    && Boolean(item.scheduledAt)
    && Number.isFinite(Date.parse(item.scheduledAt || ''))
    && Date.parse(item.scheduledAt || '') <= Date.now()
  )
);

export const repositorySiteStatus = (site: Site) => (site.isPublished ? 'published' : 'draft');

export const canonicalPathForRepositoryPage = (page: Pick<BackyPage, 'isHomepage' | 'slug' | 'meta'>) => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
    ? page.meta.canonical
    : `/${page.slug}`;
};

export const repositoryCollectionRecordTitle = (record: { slug: string; values: Record<string, unknown> }): string => {
  const title = record.values.title;
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  const name = record.values.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }

  const label = record.values.label;
  if (typeof label === 'string' && label.length > 0) {
    return label;
  }

  return record.slug;
};

const canonicalPathForRepositoryPost = (post: Pick<BackyPost, 'slug' | 'meta'>) => (
  typeof post.meta?.canonical === 'string' && post.meta.canonical.length > 0
    ? post.meta.canonical
    : `/blog/${post.slug}`
);

const dynamicListResource = (
  siteId: string,
  collection: BackyCollection,
  canonical: string,
  recordCount: number,
) => ({
  id: collection.id,
  kind: 'dynamicList' as const,
  title: collection.name,
  slug: collection.slug,
  collectionId: collection.id,
  collectionSlug: collection.slug,
  collectionName: collection.name,
  recordsUrl: `/api/sites/${siteId}/collections/${collection.id}/records`,
  renderUrl: `/api/sites/${siteId}/render?path=${encodeURIComponent(canonical)}`,
  hostedPath: canonical,
  recordCount,
  frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
});

export async function resolveRepositorySiteRoute(
  repositories: RepositoryRouteResolverRepositories,
  site: Site,
  rawPath: string,
  options: { previewToken?: string | null; host?: string | null } = {},
): Promise<ResolvedSiteRoute | null> {
  const localized = resolveLocalizedRoutePath(site.settings, rawPath, { host: options.host });
  const path = localized.path;
  const redirectRoute = resolveRedirectRoute(site.settings, path);
  if (redirectRoute) {
    return withLocalizedResolvedRoute(redirectRoute, localized);
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = decodeURIComponent(blogMatch[1]);
    const post = await repositories.posts.getBySlug(site.id, slug);
    const canPreview = post && options.previewToken
      ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'post', post.id, options.previewToken)
      : false;

    if (!post || (!isRepositoryContentPubliclyReadable(post) && !canPreview)) {
      return null;
    }

    const canonical = canonicalPathForRepositoryPost(post);
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
  const page = await getRepositoryPageByPublicPath(repositories, site.id, pagePath);
  const canPreviewPage = page && options.previewToken
    ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'page', page.id, options.previewToken)
    : false;

  if (page && (isRepositoryContentPubliclyReadable(page) || canPreviewPage)) {
    const canonical = canonicalPathForRepositoryPage(page);
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

  const collections = await repositories.collections.list({
    siteId: site.id,
    status: 'published',
    includeUnpublished: false,
    limit: 100,
    offset: 0,
  });
  const publicCollections = collections.items.filter((collection) => (
    collection.status === 'published' && collection.permissions.publicRead
  ));

  const dynamicListMatch = matchCollectionListRoute(path, publicCollections);
  if (dynamicListMatch) {
    const { collection, params, canonical } = dynamicListMatch;
    const records = await repositories.collections.listRecords({
      siteId: site.id,
      collectionId: collection.id,
      status: 'published',
      includeUnpublished: false,
      limit: 1000,
      offset: 0,
    });
    const recordCount = records.items.filter(isRepositoryContentPubliclyReadable).length;

    return withLocalizedResolvedRoute({
      type: 'dynamicList',
      path,
      status: 'published',
      canonical,
      params,
      resource: dynamicListResource(site.id, collection, canonical, recordCount),
    }, localized);
  }

  const dynamicItemMatch = matchCollectionItemRoute(path, publicCollections);
  if (!dynamicItemMatch) {
    return null;
  }

  const { collection, recordSlug, params, canonical } = dynamicItemMatch;
  const record = await repositories.collections.getRecordBySlug(site.id, collection.id, recordSlug);
  if (
    !record
    || collection.status !== 'published'
    || !collection.permissions.publicRead
    || !isRepositoryContentPubliclyReadable(record)
  ) {
    return null;
  }
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
      title: repositoryCollectionRecordTitle(record),
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
