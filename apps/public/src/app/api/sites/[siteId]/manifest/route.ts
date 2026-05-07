/**
 * Public site manifest for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/manifest
 */

import { NextRequest } from 'next/server';
import type { BackyBlogAuthor, BackyBlogCategory, BackyBlogTag, BackyCollection, BackyPage, BackyPost, BackyReusableSection, FormDefinition, MediaItem, Site } from '@backy-cms/core';
import {
  getBlogPosts,
  getMediaList,
  getPageSummary,
  getSiteByIdOrSlug,
  getSiteNavigation,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
  listCollections,
  listFormsBySite,
  listReusableSections,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeCollectionRoutePattern } from '@/lib/collectionRoutes';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ManifestCollectionRoute = {
  id: string;
  slug: string;
  name: string;
  routePattern?: string | null;
};

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

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const pagePath = (page: Pick<BackyPage, 'isHomepage' | 'slug'>) => (
  page.isHomepage || page.slug === 'index' ? '/' : `/${page.slug}`
);

const collectionField = (field: BackyCollection['fields'][number], index: number) => ({
  key: field.key,
  label: field.label,
  type: field.type,
  required: field.required === true,
  unique: field.unique === true,
  sortOrder: index,
  options: field.options,
  referenceCollectionId: field.referenceCollectionId,
});

const collectionRoutePattern = (collection: Pick<ManifestCollectionRoute, 'slug' | 'routePattern'>) => (
  normalizeCollectionRoutePattern(collection.routePattern, collection.slug)
);

const dynamicCollectionRoutePatterns = (
  siteId: string,
  collections: ManifestCollectionRoute[],
) => collections.map((collection) => {
  const pattern = collectionRoutePattern(collection);
  return {
    type: 'dynamicCollectionItem',
    collectionId: collection.id,
    collectionSlug: collection.slug,
    collectionName: collection.name,
    pattern,
    resolveUrl: `/api/sites/${siteId}/resolve?path=${pattern}`,
    renderUrl: `/api/sites/${siteId}/render?path=${pattern}`,
  };
});

const repositoryNavigation = (pages: BackyPage[]) => ({
  primary: pages
    .filter(isPubliclyReadable)
    .map((page) => ({
      id: `nav_${page.id}`,
      type: 'page',
      pageId: page.id,
      label: page.title,
      title: page.title,
      slug: page.slug,
      path: pagePath(page),
      status: page.status,
      isHomepage: page.isHomepage,
      children: [],
    }))
    .sort((left, right) => {
      if (left.isHomepage !== right.isHomepage) {
        return left.isHomepage ? -1 : 1;
      }
      return left.label.localeCompare(right.label) || left.path.localeCompare(right.path);
    }),
});

const buildRepositoryManifest = (
  input: {
    requestId: string;
    site: Site;
    pages: BackyPage[];
    posts: BackyPost[];
    categories: BackyBlogCategory[];
    tags: BackyBlogTag[];
    authors: BackyBlogAuthor[];
    collections: BackyCollection[];
    reusableSections: BackyReusableSection[];
    forms: FormDefinition[];
    media: MediaItem[];
  },
) => {
  const fonts = input.media.filter((item) => item.type === 'font');
  const publicCollections = input.collections.filter((collection) => collection.permissions.publicRead);

  return {
    success: true,
    requestId: input.requestId,
    data: {
      schemaVersion: 'backy.frontend-manifest.v1',
      generatedAt: new Date().toISOString(),
      site: {
        id: input.site.id,
        slug: input.site.slug,
        name: input.site.name,
        description: input.site.description || '',
        customDomain: input.site.customDomain,
        status: input.site.isPublished ? 'published' : 'draft',
        themeTokens: input.site.theme,
      },
      contract: {
        version: 'backy.ai-frontend.v1',
        docs: '/specs/ai-frontend-contract/README.md',
        schemas: {
          manifest: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json',
          renderPayload: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json',
          themeTokens: 'https://backy.dev/schemas/ai-frontend-contract/theme-tokens.schema.json',
          elementActions: 'https://backy.dev/schemas/ai-frontend-contract/element-actions.schema.json',
          dataBindings: 'https://backy.dev/schemas/ai-frontend-contract/data-bindings.schema.json',
          editableMap: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
        },
      },
      capabilities: {
        routeResolve: true,
        renderPayload: true,
        openApi: true,
        seoDiscovery: true,
        hostedRendering: true,
        navigation: true,
        mediaLibrary: true,
        uploadedFonts: fonts.length > 0,
        blog: true,
        comments: true,
        forms: input.forms.length > 0,
        collectionSchemas: true,
        collectionRecords: true,
        publicCollectionCreate: publicCollections.some((collection) => collection.permissions.publicCreate),
        collectionWriteForms: input.forms.some((form) => form.collectionTarget?.enabled),
        dynamicItemRoutes: publicCollections.length > 0,
        reusableSections: input.reusableSections.length > 0,
        previewTokens: true,
      },
      endpoints: {
        site: `/api/sites?identifier=${encodeURIComponent(input.site.slug)}`,
        manifest: `/api/sites/${input.site.id}/manifest`,
        openapi: `/api/sites/${input.site.id}/openapi`,
        resolve: `/api/sites/${input.site.id}/resolve?path=/`,
        render: `/api/sites/${input.site.id}/render?path=/`,
        seo: `/api/sites/${input.site.id}/seo`,
        sitemap: `/api/sites/${input.site.id}/seo?format=sitemap`,
        robots: `/api/sites/${input.site.id}/seo?format=robots`,
        navigation: `/api/sites/${input.site.id}/navigation`,
        media: `/api/sites/${input.site.id}/media`,
        mediaDetail: `/api/sites/${input.site.id}/media/{mediaId}`,
        pages: `/api/sites/${input.site.id}/pages`,
        blog: `/api/sites/${input.site.id}/blog`,
        blogCategories: `/api/sites/${input.site.id}/blog/categories`,
        blogTags: `/api/sites/${input.site.id}/blog/tags`,
        blogAuthors: `/api/sites/${input.site.id}/blog/authors`,
        collections: `/api/sites/${input.site.id}/collections`,
        reusableSections: `/api/sites/${input.site.id}/reusable-sections`,
        reusableSectionDetail: `/api/sites/${input.site.id}/reusable-sections/{sectionId}`,
        forms: `/api/sites/${input.site.id}/forms`,
        formDetail: `/api/sites/${input.site.id}/forms/{formId}`,
        formSubmissions: `/api/sites/${input.site.id}/forms/{formId}/submissions`,
        formSubmission: `/api/sites/${input.site.id}/forms/{formId}/submissions/{submissionId}`,
        formContacts: `/api/sites/${input.site.id}/forms/{formId}/contacts`,
        formContact: `/api/sites/${input.site.id}/forms/{formId}/contacts/{contactId}`,
        comments: `/api/sites/${input.site.id}/comments`,
        pageComments: `/api/sites/${input.site.id}/pages/{pageId}/comments`,
        pageComment: `/api/sites/${input.site.id}/pages/{pageId}/comments/{commentId}`,
        blogComments: `/api/sites/${input.site.id}/blog/{postId}/comments`,
        blogComment: `/api/sites/${input.site.id}/blog/{postId}/comments/{commentId}`,
        commentReportReasons: `/api/sites/${input.site.id}/comments/report-reasons`,
        commentReport: `/api/sites/${input.site.id}/comments/{commentId}/report`,
        events: `/api/sites/${input.site.id}/events`,
      },
      routePatterns: [
        {
          type: 'page',
          pattern: '/:pageSlug',
          resolveUrl: `/api/sites/${input.site.id}/resolve?path=/:pageSlug`,
          renderUrl: `/api/sites/${input.site.id}/render?path=/:pageSlug`,
        },
        {
          type: 'blogPost',
          pattern: '/blog/:postSlug',
          resolveUrl: `/api/sites/${input.site.id}/resolve?path=/blog/:postSlug`,
          renderUrl: `/api/sites/${input.site.id}/render?path=/blog/:postSlug`,
        },
        ...dynamicCollectionRoutePatterns(input.site.id, publicCollections),
      ],
      modules: {
        pages: {
          count: input.pages.length,
          items: input.pages.map((page) => ({
            id: page.id,
            title: page.title,
            slug: page.slug,
            path: pagePath(page),
            status: page.status,
            renderUrl: `/api/sites/${input.site.id}/render?path=${encodeURIComponent(pagePath(page))}`,
          })),
        },
        blog: {
          count: input.posts.length,
          categories: input.categories.map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            postCount: category.postCount || 0,
          })),
          tags: input.tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            postCount: tag.postCount || 0,
          })),
          authors: input.authors.map((author) => ({
            id: author.id,
            name: author.name,
            slug: author.slug,
            role: author.role,
            status: author.status,
            postCount: author.postCount || 0,
          })),
        },
        collections: publicCollections.map((collection) => ({
          id: collection.id,
          slug: collection.slug,
          name: collection.name,
          status: collection.status,
          permissions: collection.permissions,
          fields: collection.fields.map(collectionField),
          recordsUrl: `/api/sites/${input.site.id}/collections/${collection.id}/records`,
          routePattern: collectionRoutePattern(collection),
          dynamicRoutePattern: collectionRoutePattern(collection),
          dynamicRouteResolveUrl: `/api/sites/${input.site.id}/resolve?path=${collectionRoutePattern(collection)}`,
          dynamicRouteRenderUrl: `/api/sites/${input.site.id}/render?path=${collectionRoutePattern(collection)}`,
        })),
        reusableSections: {
          count: input.reusableSections.length,
          listUrl: `/api/sites/${input.site.id}/reusable-sections`,
          categories: Array.from(new Set(input.reusableSections.map((section) => section.category))).sort(),
          tags: Array.from(new Set(input.reusableSections.flatMap((section) => section.tags))).sort(),
          items: input.reusableSections.map((section) => ({
            id: section.id,
            slug: section.slug,
            name: section.name,
            description: section.description,
            category: section.category,
            tags: section.tags,
            detailUrl: `/api/sites/${input.site.id}/reusable-sections/${section.id}`,
            canvasSize: section.content.canvasSize,
            elementCount: Array.isArray(section.content.elements) ? section.content.elements.length : 0,
          })),
        },
        forms: input.forms.map((form) => ({
          id: form.id,
          title: form.title,
          active: form.isActive,
          moderationMode: form.moderationMode,
          pageId: form.pageId || null,
          postId: form.postId || null,
          fields: form.fields,
          submitUrl: `/api/sites/${input.site.id}/forms/${form.id}/submissions`,
          detailUrl: `/api/sites/${input.site.id}/forms/${form.id}`,
          submissionsUrl: `/api/sites/${input.site.id}/forms/${form.id}/submissions`,
          contactsUrl: `/api/sites/${input.site.id}/forms/${form.id}/contacts`,
          collectionTarget: form.collectionTarget || null,
        })),
        media: {
          count: input.media.length,
          publicCount: input.media.length,
          fontCount: fonts.length,
          types: Array.from(new Set(input.media.map((item) => item.type))).sort(),
          listUrl: `/api/sites/${input.site.id}/media`,
        },
      },
      navigation: repositoryNavigation(input.pages),
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

      const [pages, posts, categories, tags, authors, collections, reusableSections, forms, media] = await Promise.all([
        repositories.pages.list({ siteId: site.id, status: 'published', includeUnpublished: false, limit: 100, offset: 0 }),
        repositories.posts.list({ siteId: site.id, status: 'published', includeUnpublished: false, limit: 100, offset: 0 }),
        repositories.blogTaxonomy.listCategories(site.id),
        repositories.blogTaxonomy.listTags(site.id),
        repositories.blogTaxonomy.listAuthors(site.id),
        repositories.collections.list({ siteId: site.id, status: 'published', includeUnpublished: false, limit: 100, offset: 0 }),
        repositories.reusableSections.list({ siteId: site.id, status: 'active', limit: 100, offset: 0 }),
        repositories.forms.list({ siteId: site.id, isActive: true, limit: 100, offset: 0 }),
        repositories.media.list({ siteId: site.id, visibility: 'public', limit: 1000, offset: 0 }),
      ]);
      const manifest = buildRepositoryManifest({
        requestId,
        site,
        pages: pages.items.filter(isPubliclyReadable),
        posts: posts.items.filter(isPubliclyReadable),
        categories,
        tags,
        authors,
        collections: collections.items.filter((collection) => collection.status === 'published'),
        reusableSections: reusableSections.items,
        forms: forms.items,
        media: media.items,
      });

      return publicContractJson(manifest, {
        requestId,
        request,
        cache: 'discovery',
        schemaVersion: 'backy.frontend-manifest.v1',
        siteId: site.id,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const pages = getPageSummary(site.id);
    const posts = getBlogPosts(site.id, { limit: 100 }).posts;
    const collections = listCollections(site.id);
    const forms = listFormsBySite(site.id);
    const reusableSections = listReusableSections(site.id, { status: 'active' });
    const media = getMediaList(site.id, { visibility: 'public', limit: 1000 });
    const categories = listBlogCategories(site.id);
    const tags = listBlogTags(site.id);
    const authors = listBlogAuthors(site.id);
    const fonts = media.media.filter((item) => item.type === 'font');

    const manifest = {
      success: true,
      requestId,
      data: {
        schemaVersion: 'backy.frontend-manifest.v1',
        generatedAt: new Date().toISOString(),
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
          description: site.description,
          customDomain: site.customDomain,
          status: site.status,
          themeTokens: site.theme,
        },
        contract: {
          version: 'backy.ai-frontend.v1',
          docs: '/specs/ai-frontend-contract/README.md',
          schemas: {
            manifest: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json',
            renderPayload: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json',
            themeTokens: 'https://backy.dev/schemas/ai-frontend-contract/theme-tokens.schema.json',
            elementActions: 'https://backy.dev/schemas/ai-frontend-contract/element-actions.schema.json',
            dataBindings: 'https://backy.dev/schemas/ai-frontend-contract/data-bindings.schema.json',
            editableMap: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
          },
        },
        capabilities: {
          routeResolve: true,
          renderPayload: true,
          openApi: true,
          seoDiscovery: true,
          hostedRendering: true,
          navigation: true,
          mediaLibrary: true,
          uploadedFonts: fonts.length > 0,
          blog: true,
          comments: true,
          forms: true,
          collectionSchemas: true,
          collectionRecords: true,
          publicCollectionCreate: collections.some((collection) => collection.permissions.publicCreate),
          collectionWriteForms: forms.some((form) => form.collectionTarget?.enabled),
          dynamicItemRoutes: collections.length > 0,
          reusableSections: reusableSections.length > 0,
          previewTokens: true,
        },
        endpoints: {
          site: `/api/sites?identifier=${encodeURIComponent(site.slug)}`,
          manifest: `/api/sites/${site.id}/manifest`,
          openapi: `/api/sites/${site.id}/openapi`,
          resolve: `/api/sites/${site.id}/resolve?path=/`,
          render: `/api/sites/${site.id}/render?path=/`,
          seo: `/api/sites/${site.id}/seo`,
          sitemap: `/api/sites/${site.id}/seo?format=sitemap`,
          robots: `/api/sites/${site.id}/seo?format=robots`,
          navigation: `/api/sites/${site.id}/navigation`,
          media: `/api/sites/${site.id}/media`,
          mediaDetail: `/api/sites/${site.id}/media/{mediaId}`,
          pages: `/api/sites/${site.id}/pages`,
          blog: `/api/sites/${site.id}/blog`,
          blogCategories: `/api/sites/${site.id}/blog/categories`,
          blogTags: `/api/sites/${site.id}/blog/tags`,
          blogAuthors: `/api/sites/${site.id}/blog/authors`,
          collections: `/api/sites/${site.id}/collections`,
          reusableSections: `/api/sites/${site.id}/reusable-sections`,
          reusableSectionDetail: `/api/sites/${site.id}/reusable-sections/{sectionId}`,
          forms: `/api/sites/${site.id}/forms`,
          formDetail: `/api/sites/${site.id}/forms/{formId}`,
          formSubmissions: `/api/sites/${site.id}/forms/{formId}/submissions`,
          formSubmission: `/api/sites/${site.id}/forms/{formId}/submissions/{submissionId}`,
          formContacts: `/api/sites/${site.id}/forms/{formId}/contacts`,
          formContact: `/api/sites/${site.id}/forms/{formId}/contacts/{contactId}`,
          comments: `/api/sites/${site.id}/comments`,
          pageComments: `/api/sites/${site.id}/pages/{pageId}/comments`,
          pageComment: `/api/sites/${site.id}/pages/{pageId}/comments/{commentId}`,
          blogComments: `/api/sites/${site.id}/blog/{postId}/comments`,
          blogComment: `/api/sites/${site.id}/blog/{postId}/comments/{commentId}`,
          commentReportReasons: `/api/sites/${site.id}/comments/report-reasons`,
          commentReport: `/api/sites/${site.id}/comments/{commentId}/report`,
          events: `/api/sites/${site.id}/events`,
        },
        routePatterns: [
          {
            type: 'page',
            pattern: '/:pageSlug',
            resolveUrl: `/api/sites/${site.id}/resolve?path=/:pageSlug`,
            renderUrl: `/api/sites/${site.id}/render?path=/:pageSlug`,
          },
          {
            type: 'blogPost',
            pattern: '/blog/:postSlug',
            resolveUrl: `/api/sites/${site.id}/resolve?path=/blog/:postSlug`,
            renderUrl: `/api/sites/${site.id}/render?path=/blog/:postSlug`,
          },
          ...dynamicCollectionRoutePatterns(site.id, collections),
        ],
        modules: {
          pages: {
            count: pages.length,
            items: pages.map((page) => ({
              id: page.id,
              title: page.title,
              slug: page.slug,
              path: page.isHomepage || page.slug === 'index' ? '/' : `/${page.slug}`,
              status: page.status,
              renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(page.isHomepage || page.slug === 'index' ? '/' : `/${page.slug}`)}`,
            })),
          },
          blog: {
            count: posts.length,
            categories: categories.map((category) => ({
              id: category.id,
              slug: category.slug,
              name: category.name,
              postCount: category.postCount,
            })),
            tags: tags.map((tag) => ({
              id: tag.id,
              slug: tag.slug,
              name: tag.name,
              postCount: tag.postCount,
            })),
            authors: authors.map((author) => ({
              id: author.id,
              slug: author.slug,
              name: author.name,
              postCount: author.postCount,
            })),
          },
          collections: collections.map((collection) => ({
            id: collection.id,
            slug: collection.slug,
            name: collection.name,
            status: collection.status,
            permissions: collection.permissions,
            fields: collection.fields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              unique: field.unique,
              options: field.options,
              referenceCollectionId: field.referenceCollectionId,
            })),
            recordsUrl: `/api/sites/${site.id}/collections/${collection.id}/records`,
            routePattern: collectionRoutePattern(collection),
            dynamicRoutePattern: collectionRoutePattern(collection),
            dynamicRouteResolveUrl: `/api/sites/${site.id}/resolve?path=${collectionRoutePattern(collection)}`,
            dynamicRouteRenderUrl: `/api/sites/${site.id}/render?path=${collectionRoutePattern(collection)}`,
          })),
          reusableSections: {
            count: reusableSections.length,
            listUrl: `/api/sites/${site.id}/reusable-sections`,
            categories: Array.from(new Set(reusableSections.map((section) => section.category))).sort(),
            tags: Array.from(new Set(reusableSections.flatMap((section) => section.tags))).sort(),
            items: reusableSections.map((section) => ({
              id: section.id,
              slug: section.slug,
              name: section.name,
              description: section.description,
              category: section.category,
              tags: section.tags,
              detailUrl: `/api/sites/${site.id}/reusable-sections/${section.id}`,
              canvasSize: section.content.canvasSize,
              elementCount: section.content.elements.length,
            })),
          },
          forms: forms.map((form) => ({
            id: form.id,
            title: form.title,
            active: form.isActive,
            moderationMode: form.moderationMode,
            pageId: form.pageId || null,
            postId: form.postId || null,
            fields: form.fields,
            submitUrl: `/api/sites/${site.id}/forms/${form.id}/submissions`,
            detailUrl: `/api/sites/${site.id}/forms/${form.id}`,
            submissionsUrl: `/api/sites/${site.id}/forms/${form.id}/submissions`,
            contactsUrl: `/api/sites/${site.id}/forms/${form.id}/contacts`,
            collectionTarget: form.collectionTarget || null,
          })),
          media: {
            count: media.pagination.total,
            publicCount: media.pagination.total,
            fontCount: fonts.length,
            types: Array.from(new Set(media.media.map((item) => item.type))).sort(),
            listUrl: `/api/sites/${site.id}/media`,
          },
        },
        navigation: getSiteNavigation(site.id),
      },
    };

    return publicContractJson(manifest, {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: 'backy.frontend-manifest.v1',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Frontend manifest API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
