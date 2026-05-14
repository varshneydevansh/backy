/**
 * Public render payload endpoint for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/render?path=/about
 */

import { NextRequest } from 'next/server';
import type { BackyCollection, BackyCollectionRecord, BackyPage, BackyPost, Site } from '@backy-cms/core';
import {
  getBlogPosts,
  getCollectionRecordByIdOrSlug,
  getPageByPath,
  getSiteByIdOrSlug,
  listCollectionRecords,
  listCollections,
  validatePreviewToken,
  type StoreBlogPost,
  type StoreCollection,
  type StoreCollectionRecord,
  type StorePage,
  type StoreSite,
} from '@/lib/backyStore';
import {
  buildPublicBlogPostRenderPayload,
  buildPublicCollectionItemRenderPayload,
  buildPublicCollectionListRenderPayload,
  buildPublicRenderPayload,
  type RenderDataSource,
} from '@/lib/renderPayload';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeRoutePath } from '@/lib/routeResolver';
import { matchCollectionItemRoute, matchCollectionListRoute } from '@/lib/collectionRoutes';
import { buildSiteNavigation } from '@/lib/navigation';
import { getRepositoryPageByPublicPath } from '@/lib/repositoryPages';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status, requestId, cache: 'error' },
  )
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
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

const repositorySiteToStoreSite = (site: Site): StoreSite => ({
  id: site.id,
  name: site.name,
  slug: site.slug,
  description: site.description || '',
  customDomain: site.customDomain || null,
  status: site.isPublished ? 'published' : 'draft',
  isPublished: site.isPublished,
  settings: site.settings,
  theme: {
    colors: isRecord(site.theme?.colors) ? site.theme.colors as Record<string, string> : {},
    fonts: isRecord(site.theme?.fonts) ? site.theme.fonts as StoreSite['theme']['fonts'] : {},
    spacing: isRecord(site.theme?.spacing) ? site.theme.spacing as StoreSite['theme']['spacing'] : undefined,
    customCSS: typeof site.theme?.customCSS === 'string' ? site.theme.customCSS : '',
  },
});

const repositoryNavigation = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  site: Site,
) => {
  const pages = await repositories.pages.list({
    siteId: site.id,
    includeUnpublished: false,
    status: 'published',
    limit: 100,
    offset: 0,
  });

  return buildSiteNavigation(site.settings, pages.items.filter(isPubliclyReadable));
};

const withRepositoryNavigation = async <TPayload extends { data?: { navigation?: unknown } }>(
  payload: TPayload,
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  site: Site,
): Promise<TPayload> => ({
  ...payload,
  data: payload.data
    ? {
        ...payload.data,
        navigation: await repositoryNavigation(repositories, site),
      }
    : payload.data,
});

const repositoryPageToStorePage = (page: BackyPage): StorePage => {
  const canvasSize = isRecord(page.content.metadata?.canvasSize)
    ? page.content.metadata.canvasSize as StorePage['content']['canvasSize']
    : { width: 1200, height: 900 };

  return {
    id: page.id,
    siteId: page.siteId,
    title: page.title,
    slug: page.slug,
    description: page.description,
    status: page.status,
    isHomepage: page.isHomepage,
    content: {
      elements: page.content.elements as unknown as StorePage['content']['elements'],
      canvasSize,
      customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
      contentDocument: page.content,
    },
    meta: {
      title: typeof page.meta?.title === 'string' ? page.meta.title : page.title,
      description: typeof page.meta?.description === 'string' ? page.meta.description : page.description,
      keywords: Array.isArray(page.meta?.keywords) ? page.meta.keywords.filter((item): item is string => typeof item === 'string') : undefined,
      ogImage: typeof page.meta?.ogImage === 'string' ? page.meta.ogImage : null,
      canonical: typeof page.meta?.canonical === 'string' ? page.meta.canonical : null,
      noIndex: page.meta?.noIndex === true,
      noFollow: page.meta?.noFollow === true,
    },
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    publishedAt: page.publishedAt,
    scheduledAt: page.scheduledAt,
  };
};

const repositoryPostToStorePost = (post: BackyPost): StoreBlogPost => ({
  id: post.id,
  siteId: post.siteId,
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  content: {
    elements: post.content.elements,
    canvasSize: isRecord(post.content.metadata?.canvasSize)
      ? post.content.metadata.canvasSize
      : { width: 1200, height: 900 },
    customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
    contentDocument: post.content,
  },
  status: post.status,
  featuredImageId: post.featuredImageId,
  authorId: post.authorId,
  meta: {
    title: typeof post.meta?.title === 'string' ? post.meta.title : post.title,
    description: typeof post.meta?.description === 'string' ? post.meta.description : post.excerpt || undefined,
    keywords: Array.isArray(post.meta?.keywords) ? post.meta.keywords.filter((item): item is string => typeof item === 'string') : undefined,
    ogImage: typeof post.meta?.ogImage === 'string' ? post.meta.ogImage : null,
    canonical: typeof post.meta?.canonical === 'string' ? post.meta.canonical : null,
    noIndex: post.meta?.noIndex === true,
    noFollow: post.meta?.noFollow === true,
  },
  categoryIds: post.categoryIds,
  tagIds: post.tagIds,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
  publishedAt: post.publishedAt,
  scheduledAt: post.scheduledAt,
});

const repositoryCollectionToStoreCollection = (collection: BackyCollection): StoreCollection => ({
  id: collection.id,
  siteId: collection.siteId,
  name: collection.name,
  slug: collection.slug,
  routePattern: collection.routePattern || null,
  listRoutePattern: collection.listRoutePattern || null,
  description: collection.description || null,
  status: collection.status === 'published' || collection.status === 'archived' ? collection.status : 'draft',
  fields: collection.fields.map((field, index) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required === true,
    unique: field.unique === true,
    sortOrder: index,
    helpText: null,
    options: field.options,
    referenceCollectionId: field.referenceCollectionId || null,
    defaultValue: field.defaultValue,
  })),
  permissions: {
    publicRead: collection.permissions.publicRead,
    publicCreate: collection.permissions.publicCreate,
    publicUpdate: collection.permissions.publicUpdate === true,
    publicDelete: collection.permissions.publicDelete === true,
  },
  metadata: isRecord(collection.metadata) ? collection.metadata : undefined,
  createdAt: collection.createdAt,
  updatedAt: collection.updatedAt,
});

const repositoryRecordToStoreRecord = (record: BackyCollectionRecord): StoreCollectionRecord => ({
  id: record.id,
  siteId: record.siteId,
  collectionId: record.collectionId,
  slug: record.slug,
  status: record.status,
  values: record.values,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

async function buildRepositoryRenderDataSource(
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  site: Site,
): Promise<RenderDataSource> {
  const collections = await repositories.collections.list({
    siteId: site.id,
    status: 'published',
    includeUnpublished: false,
    limit: 100,
    offset: 0,
  });
  const storeCollections = collections.items
    .filter((collection) => collection.status === 'published' && collection.permissions.publicRead)
    .map(repositoryCollectionToStoreCollection);
  const recordsByCollection = new Map<string, StoreCollectionRecord[]>();

  await Promise.all(storeCollections.map(async (collection) => {
    const records = await repositories.collections.listRecords({
      siteId: site.id,
      collectionId: collection.id,
      status: 'published',
      includeUnpublished: false,
      limit: 1000,
      offset: 0,
    });
    recordsByCollection.set(collection.id, records.items.filter(isPubliclyReadable).map(repositoryRecordToStoreRecord));
  }));

  const media = await repositories.media.list({
    siteId: site.id,
    visibility: 'public',
    limit: 1000,
  });

  return {
    getCollectionByIdOrSlug: (_siteId, collectionIdOrSlug) => (
      storeCollections.find((collection) => (
        collection.id === collectionIdOrSlug || collection.slug === collectionIdOrSlug
      ))
    ),
    getCollectionRecordByIdOrSlug: (_siteId, collectionId, recordIdOrSlug) => (
      (recordsByCollection.get(collectionId) || []).find((record) => (
        record.id === recordIdOrSlug || record.slug === recordIdOrSlug
      ))
    ),
    listCollectionRecords: (_siteId, collectionId, options = {}) => {
      const records = (recordsByCollection.get(collectionId) || [])
        .filter((record) => !options.slug || record.slug === options.slug)
        .filter((record) => !options.status || record.status === options.status)
        .filter((record) => !options.fieldKey || record.values[options.fieldKey] === options.fieldValue)
        .filter((record) => {
          const search = options.search?.trim().toLowerCase();
          return !search || JSON.stringify(record.values).toLowerCase().includes(search) || record.slug.toLowerCase().includes(search);
        });
      const sortBy = options.sortBy;
      const sortedRecords = sortBy
        ? [...records].sort((left, right) => {
            const leftValue = sortBy in left ? left[sortBy as keyof StoreCollectionRecord] : left.values[sortBy];
            const rightValue = sortBy in right ? right[sortBy as keyof StoreCollectionRecord] : right.values[sortBy];
            const direction = options.sortDirection === 'desc' ? -1 : 1;
            return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * direction;
          })
        : records;
      const requestedOffset = options.offset;
      const requestedLimit = options.limit;
      const offset = typeof requestedOffset === 'number' && Number.isInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
      const limit = typeof requestedLimit === 'number' && Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : sortedRecords.length;
      return { records: sortedRecords.slice(offset, offset + limit) };
    },
    getMediaById: (_siteId, mediaId) => media.items.find((item) => item.id === mediaId),
    getMediaList: () => ({
      media: media.items,
      pagination: {
        total: media.items.length,
        limit: media.items.length,
        offset: 0,
        hasMore: false,
      },
    }),
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const path = normalizeRoutePath(searchParams.get('path') || searchParams.get('slug') || '/');
    const previewToken = searchParams.get('previewToken');

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const storeSite = repositorySiteToStoreSite(site);
      const dataSource = await buildRepositoryRenderDataSource(repositories, site);
      const blogMatch = path.match(/^\/blog\/([^/]+)$/);
      if (blogMatch) {
        const slug = decodeURIComponent(blogMatch[1]);
        const post = await repositories.posts.getBySlug(site.id, slug);
        const canPreview = post && previewToken
          ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'post', post.id, previewToken)
          : false;

        if (!post || (!isPubliclyReadable(post) && !canPreview)) {
          return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
        }

        return publicContractJson(
          await withRepositoryNavigation(
            buildPublicBlogPostRenderPayload(storeSite, repositoryPostToStorePost(post), { requestId, path, dataSource }),
            repositories,
            site,
          ),
          {
            requestId,
            request,
            cache: previewToken ? 'private' : 'render',
            schemaVersion: 'backy.content-payload.v1',
            siteId: site.id,
          },
        );
      }

      const pagePath = path === '/' ? 'index' : path.slice(1);
      const page = await getRepositoryPageByPublicPath(repositories, site.id, pagePath);
      const canPreviewPage = page && previewToken
        ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'page', page.id, previewToken)
        : false;
      if (page && (isPubliclyReadable(page) || canPreviewPage)) {
        return publicContractJson(
          await withRepositoryNavigation(
            buildPublicRenderPayload(storeSite, repositoryPageToStorePage(page), { requestId, path, dataSource }),
            repositories,
            site,
          ),
          {
            requestId,
            request,
            cache: previewToken ? 'private' : 'render',
            schemaVersion: 'backy.content-payload.v1',
            siteId: site.id,
          },
        );
      }

      const collections = await repositories.collections.list({
        siteId: site.id,
        status: 'published',
        includeUnpublished: false,
        limit: 100,
        offset: 0,
      });
      const publicCollections = collections.items.filter((collection) => collection.status === 'published' && collection.permissions.publicRead);
      const dynamicListMatch = matchCollectionListRoute(path, publicCollections);
      if (dynamicListMatch) {
        const { collection } = dynamicListMatch;
        const records = await repositories.collections.listRecords({
          siteId: site.id,
          collectionId: collection.id,
          status: 'published',
          includeUnpublished: false,
          limit: 100,
          offset: 0,
        });
        return publicContractJson(
          await withRepositoryNavigation(
            buildPublicCollectionListRenderPayload(
              storeSite,
              repositoryCollectionToStoreCollection(collection),
              records.items.filter(isPubliclyReadable).map(repositoryRecordToStoreRecord),
              { requestId, path, dataSource },
            ),
            repositories,
            site,
          ),
          {
            requestId,
            request,
            cache: 'render',
            schemaVersion: 'backy.content-payload.v1',
            siteId: site.id,
          },
        );
      }

      const dynamicItemMatch = matchCollectionItemRoute(path, publicCollections);
      if (dynamicItemMatch) {
        const { collection, recordSlug } = dynamicItemMatch;
        const record = await repositories.collections.getRecordBySlug(site.id, collection.id, recordSlug);

        if (
          collection
          && record
          && collection.status === 'published'
          && collection.permissions.publicRead
          && isPubliclyReadable(record)
        ) {
          return publicContractJson(
            await withRepositoryNavigation(
              buildPublicCollectionItemRenderPayload(
                storeSite,
                repositoryCollectionToStoreCollection(collection),
                repositoryRecordToStoreRecord(record),
                { requestId, path, dataSource },
              ),
              repositories,
              site,
            ),
            {
              requestId,
              request,
              cache: 'render',
              schemaVersion: 'backy.content-payload.v1',
              siteId: site.id,
            },
          );
        }
      }

      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const blogMatch = path.match(/^\/blog\/([^/]+)$/);
    if (blogMatch) {
      const slug = decodeURIComponent(blogMatch[1]);
      const previewPost = previewToken
        ? getBlogPosts(site.id, { slug, includeUnpublished: true }).posts[0]
        : undefined;
      const canPreview = previewPost
        ? validatePreviewToken(site.id, 'post', previewPost.id, previewToken)
        : false;
      const post = canPreview
        ? previewPost
        : getBlogPosts(site.id, { slug }).posts[0];

      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      return publicContractJson(
        buildPublicBlogPostRenderPayload(site, post, { requestId, path }),
        {
          requestId,
          request,
          cache: previewToken ? 'private' : 'render',
          schemaVersion: 'backy.content-payload.v1',
          siteId: site.id,
        },
      );
    }

    const previewPage = previewToken
      ? getPageByPath(site.id, path, { includeUnpublished: true })
      : undefined;
    const canPreview = previewPage
      ? validatePreviewToken(site.id, 'page', previewPage.id, previewToken)
      : false;
    const page = canPreview
      ? previewPage
      : getPageByPath(site.id, path);
    if (page) {
      return publicContractJson(
        buildPublicRenderPayload(site, page, { requestId, path }),
        {
          requestId,
          request,
          cache: previewToken ? 'private' : 'render',
          schemaVersion: 'backy.content-payload.v1',
          siteId: site.id,
        },
      );
    }

    const collections = listCollections(site.id);
    const dynamicListMatch = matchCollectionListRoute(path, collections);
    if (dynamicListMatch) {
      const { collection } = dynamicListMatch;
      const records = listCollectionRecords(site.id, collection.id, { limit: 100 }).records;

      return publicContractJson(
        buildPublicCollectionListRenderPayload(site, collection, records, { requestId, path }),
        {
          requestId,
          request,
          cache: 'render',
          schemaVersion: 'backy.content-payload.v1',
          siteId: site.id,
        },
      );
    }

    const dynamicItemMatch = matchCollectionItemRoute(path, collections);
    if (dynamicItemMatch) {
      const { collection, recordSlug } = dynamicItemMatch;
      const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordSlug);

      if (collection && record) {
        return publicContractJson(
          buildPublicCollectionItemRenderPayload(site, collection, record, { requestId, path }),
          {
            requestId,
            request,
            cache: 'render',
            schemaVersion: 'backy.content-payload.v1',
            siteId: site.id,
          },
        );
      }
    }

    return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
  } catch (error) {
    console.error('Render payload API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
