import {
  getCanonicalPathForPage,
  getBlogPosts,
  getCollectionRecordByIdOrSlug,
  getPageByPath,
  listCollections,
  validatePreviewToken,
  type StoreBlogPost,
  type StoreCollectionRecord,
  type StorePage,
  type StoreSite,
} from './backyStore';
import { matchCollectionItemRoute } from './collectionRoutes';

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
  };
};

export type ResolvedSiteRoute = ResolvedPageRoute | ResolvedPostRoute | ResolvedDynamicItemRoute;

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

export function resolveSiteRoute(
  site: StoreSite,
  rawPath: string,
  options: { previewToken?: string | null } = {},
): ResolvedSiteRoute | null {
  const path = normalizeRoutePath(rawPath);
  const blogMatch = path.match(/^\/blog\/([^/]+)$/);

  if (blogMatch) {
    const slug = decodeURIComponent(blogMatch[1]);
    const post = getPreviewPost(site.id, slug, options.previewToken)
      || getBlogPosts(site.id, { slug }).posts[0];

    if (!post) {
      return null;
    }

    const canonical = post.meta?.canonical || `/blog/${post.slug}`;
    return {
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
    };
  }

  const pagePath = path === '/' ? 'index' : path.slice(1);
  const page = getPreviewPage(site.id, pagePath, options.previewToken)
    || getPageByPath(site.id, pagePath);

  if (!page) {
    const dynamicItemMatch = matchCollectionItemRoute(path, listCollections(site.id));
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
    return {
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
      },
    };
  }

  const canonical = page.meta.canonical || getCanonicalPathForPage(page);
  return {
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
  };
}
