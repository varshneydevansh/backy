/**
 * Site-scoped public OpenAPI document for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/openapi
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, listCollections, listFormsBySite, listReusableSections } from '@/lib/backyStore';
import { PRODUCT_COLLECTION_SLUG } from '@/lib/commerceCatalog';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeRedirectRules } from '@/lib/redirectRules';

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

const envelopeSchema = (dataSchema: Record<string, unknown>) => ({
  type: 'object',
  required: ['success', 'requestId', 'data'],
  properties: {
    success: { type: 'boolean' },
    requestId: { type: 'string' },
    data: dataSchema,
    error: { $ref: '#/components/schemas/ErrorEnvelope/properties/error' },
  },
});

const formSubmissionValidationCodes = [
  'required',
  'min_length',
  'max_length',
  'pattern',
  'invalid_pattern',
  'min',
  'max',
  'invalid_email',
  'invalid_url',
  'invalid_option',
  'invalid_options',
  'missing_options',
  'unique',
  'collection_unavailable',
  'public_create_disabled',
  'record_create_failed',
];

const pathParameter = (name: string, description?: string, enumValues?: string[]) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', enum: enumValues && enumValues.length > 0 ? enumValues : undefined },
});

const queryParameter = (
  name: string,
  schema: Record<string, unknown> = { type: 'string' },
  description?: string,
) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const repositoryMode = !shouldUseDemoStoreFallback();
    const repositories = repositoryMode ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories
      ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId)
      : null;
    const storeSite = repositoryMode ? null : getSiteByIdOrSlug(siteId);
    const site = repositorySite
      ? {
          id: repositorySite.id,
          slug: repositorySite.slug,
          name: repositorySite.name,
          isPublished: repositorySite.isPublished,
          settings: repositorySite.settings,
        }
      : storeSite;

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const origin = new URL(request.url).origin;
    const collections = repositories
      ? (await repositories.collections.list({
          siteId: site.id,
          includeUnpublished: false,
          status: 'published',
          limit: 100,
          offset: 0,
        })).items.filter((collection) => collection.permissions.publicRead)
      : listCollections(site.id);
    const forms = repositories
      ? (await repositories.forms.list({ siteId: site.id, isActive: true, limit: 100, offset: 0 })).items
      : listFormsBySite(site.id);
    const reusableSections = repositories
      ? (await repositories.reusableSections.list({ siteId: site.id, status: 'active', limit: 100, offset: 0 })).items
      : listReusableSections(site.id, { status: 'active' });
    const collectionIds = collections.map((collection) => collection.id);
    const hasCommerceCatalog = collections.some((collection) => collection.slug === PRODUCT_COLLECTION_SLUG);
    const hasPrivateOrders = collections.some((collection) => (
      collection.slug === 'orders' &&
      collection.status === 'published' &&
      !collection.permissions.publicRead &&
      !collection.permissions.publicCreate
    ));
    const formIds = forms.map((form) => form.id);
    const reusableSectionIds = reusableSections.map((section) => section.id);
    const redirectRules = normalizeRedirectRules(site.settings?.redirectRules).filter((rule) => rule.enabled);

    return publicContractJson({
      openapi: '3.1.0',
      info: {
        title: `${site.name} Backy Public API`,
        version: 'backy-public.v1',
        description: 'Site-scoped public read and interaction API for custom Backy frontends.',
      },
      servers: [
        {
          url: origin,
          description: 'Current Backy public app origin',
        },
      ],
      tags: [
        { name: 'Discovery' },
        { name: 'Routing' },
        { name: 'Rendering' },
        { name: 'Content' },
        { name: 'Interactions' },
        { name: 'Media' },
      ],
      paths: {
        [`/api/sites/${site.id}/manifest`]: {
          get: {
            tags: ['Discovery'],
            summary: 'Fetch the site frontend discovery manifest',
            operationId: 'getBackyFrontendManifest',
            responses: {
              '200': {
                description: 'Frontend manifest',
                content: {
                  'application/json': {
                    schema: { $ref: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/frontend-design`]: {
          get: {
            tags: ['Discovery'],
            summary: 'Fetch the site frontend design contract',
            operationId: 'getBackyFrontendDesignContract',
            responses: {
              '200': {
                description: 'Frontend design contract and template inventory',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FrontendDesignEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/openapi`]: {
          get: {
            tags: ['Discovery'],
            summary: 'Fetch this OpenAPI document',
            operationId: 'getBackyOpenApiDocument',
            responses: {
              '200': {
                description: 'OpenAPI document',
              },
            },
          },
        },
        [`/api/sites/${site.id}/resolve`]: {
          get: {
            tags: ['Routing'],
            summary: 'Resolve a public path to a Backy route resource',
            operationId: 'resolveBackyRoute',
            parameters: [
              {
                name: 'path',
                in: 'query',
                required: true,
                schema: { type: 'string', example: '/about' },
              },
              {
                name: 'previewToken',
                in: 'query',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'Resolved route',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/RouteResolveEnvelope' },
                  },
                },
              },
              '410': {
                description: 'Resolved route is intentionally gone',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/GoneRouteResolveEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/render`]: {
          get: {
            tags: ['Rendering'],
            summary: 'Fetch the canonical render payload for a page, blog post, or dynamic item',
            operationId: 'getBackyRenderPayload',
            parameters: [
              {
                name: 'path',
                in: 'query',
                required: true,
                schema: { type: 'string', example: '/about' },
              },
              {
                name: 'previewToken',
                in: 'query',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'Render payload',
                content: {
                  'application/json': {
                    schema: { $ref: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/seo`]: {
          get: {
            tags: ['Discovery'],
            summary: 'Fetch site SEO route metadata, sitemap XML, or robots text',
            operationId: 'getBackySeoDiscovery',
            parameters: [
              queryParameter('format', { type: 'string', enum: ['json', 'sitemap', 'robots'] }, 'Optional response format. Omit for JSON.'),
            ],
            responses: {
              '200': {
                description: 'SEO discovery payload or text response',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SeoDiscoveryEnvelope' },
                  },
                  'application/xml': {
                    schema: { type: 'string' },
                  },
                  'text/plain': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/navigation`]: {
          get: {
            tags: ['Content'],
            summary: 'Fetch public site navigation',
            operationId: 'getBackyNavigation',
            responses: {
              '200': {
                description: 'Navigation envelope',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/NavigationEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/pages`]: {
          get: {
            tags: ['Content'],
            summary: 'List public pages or fetch one page by slug/path',
            operationId: 'listBackyPages',
            parameters: [
              queryParameter('slug', { type: 'string' }, 'Return one public page by slug'),
              queryParameter('path', { type: 'string' }, 'Return one public page by path'),
              queryParameter('previewToken', { type: 'string' }, 'Preview an unpublished page when the token is valid'),
              queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Page size'),
              queryParameter('offset', { type: 'integer', minimum: 0 }, 'Page offset'),
            ],
            responses: {
              '200': {
                description: 'Public page list or page detail',
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [
                        { $ref: '#/components/schemas/PageListEnvelope' },
                        { $ref: '#/components/schemas/PageEnvelope' },
                      ],
                    },
                  },
                },
              },
              '404': {
                description: 'Page not found',
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog`]: {
          get: {
            tags: ['Content'],
            summary: 'List public blog posts or fetch one post by slug',
            operationId: 'listBackyBlogPosts',
            parameters: [
              queryParameter('slug', { type: 'string' }, 'Return one public blog post by slug'),
              queryParameter('previewToken', { type: 'string' }, 'Preview an unpublished post when the token is valid'),
              queryParameter('categoryId', { type: 'string' }, 'Filter posts by category id'),
              queryParameter('categorySlug', { type: 'string' }, 'Filter posts by category slug'),
              queryParameter('tagId', { type: 'string' }, 'Filter posts by tag id'),
              queryParameter('tagSlug', { type: 'string' }, 'Filter posts by tag slug'),
              queryParameter('authorId', { type: 'string' }, 'Filter posts by author id'),
              queryParameter('authorSlug', { type: 'string' }, 'Filter posts by author slug'),
              queryParameter('q', { type: 'string' }, 'Search public post title, slug, excerpt, and searchable content'),
              queryParameter('search', { type: 'string' }, 'Alias for q'),
              queryParameter('year', { type: 'integer', minimum: 1970, maximum: 3000 }, 'Filter posts by archive year'),
              queryParameter('month', { type: 'integer', minimum: 1, maximum: 12 }, 'Filter posts by archive month'),
              queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Page size'),
              queryParameter('offset', { type: 'integer', minimum: 0 }, 'Page offset'),
            ],
            responses: {
              '200': {
                description: 'Public blog list or post detail',
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [
                        { $ref: '#/components/schemas/BlogPostListEnvelope' },
                        { $ref: '#/components/schemas/BlogPostEnvelope' },
                      ],
                    },
                  },
                },
              },
              '404': {
                description: 'Post not found',
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/rss`]: {
          get: {
            tags: ['Content'],
            summary: 'Fetch the public blog RSS 2.0 feed',
            operationId: 'getBackyBlogRssFeed',
            parameters: [
              queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Maximum feed item count'),
            ],
            responses: {
              '200': {
                description: 'RSS 2.0 feed for visible published blog posts',
                content: {
                  'application/rss+xml': {
                    schema: { type: 'string' },
                  },
                },
              },
              '404': {
                description: 'Site not found or hidden',
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/categories`]: {
          get: {
            tags: ['Content'],
            summary: 'List public blog categories',
            operationId: 'listBackyBlogCategories',
            responses: {
              '200': {
                description: 'Public blog categories',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/BlogCategoryListEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/tags`]: {
          get: {
            tags: ['Content'],
            summary: 'List public blog tags',
            operationId: 'listBackyBlogTags',
            responses: {
              '200': {
                description: 'Public blog tags',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/BlogTagListEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/authors`]: {
          get: {
            tags: ['Content'],
            summary: 'List public blog authors',
            operationId: 'listBackyBlogAuthors',
            responses: {
              '200': {
                description: 'Public blog authors',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/BlogAuthorListEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/media`]: {
          get: {
            tags: ['Media'],
            summary: 'List public media assets',
            operationId: 'listBackyMedia',
            parameters: [
              { name: 'type', in: 'query', schema: { type: 'string', enum: ['image', 'video', 'audio', 'document', 'font'] } },
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'tag', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
              { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
            ],
            responses: {
              '200': {
                description: 'Media list',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/MediaList' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/media/fonts`]: {
          get: {
            tags: ['Media'],
            summary: 'Fetch public uploaded font families, variants, and @font-face CSS',
            operationId: 'getBackyFontManifest',
            responses: {
              '200': {
                description: 'Font manifest',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FontManifestEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/media/{mediaId}`]: {
          get: {
            tags: ['Media'],
            summary: 'Fetch a public media asset',
            operationId: 'getBackyMedia',
            parameters: [
              { name: 'mediaId', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: {
              '200': {
                description: 'Media asset',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/MediaDetailEnvelope' },
                  },
                },
              },
              '404': {
                description: 'Media not found or private',
              },
            },
          },
        },
        [`/api/sites/${site.id}/media/{mediaId}/file`]: {
          get: {
            tags: ['Media'],
            summary: 'Fetch a media file; private assets require a signed token generated by an admin integration',
            operationId: 'getBackyMediaFile',
            parameters: [
              { name: 'mediaId', in: 'path', required: true, schema: { type: 'string' } },
              queryParameter('token', { type: 'string' }, 'Signed media token for private assets'),
              queryParameter('expiresAt', { type: 'integer' }, 'Signed token expiry timestamp in seconds'),
              queryParameter('disposition', { type: 'string', enum: ['inline', 'attachment'] }, 'Content disposition for the served file'),
            ],
            responses: {
              '200': {
                description: 'Media file bytes',
                content: {
                  '*/*': {
                    schema: { type: 'string', format: 'binary' },
                  },
                },
              },
              '403': {
                description: 'Private media requires a valid signed URL',
              },
              '404': {
                description: 'Media file not found',
              },
            },
          },
        },
        [`/api/sites/${site.id}/media/{mediaId}/transform`]: {
          get: {
            tags: ['Media'],
            summary: 'Validate and redirect a public image asset to Backy image optimization',
            operationId: 'transformBackyMediaImage',
            parameters: [
              { name: 'mediaId', in: 'path', required: true, schema: { type: 'string' } },
              queryParameter('width', { type: 'integer', minimum: 16, maximum: 3840 }, 'Target image width'),
              queryParameter('quality', { type: 'integer', minimum: 1, maximum: 100 }, 'Output quality, default 75'),
            ],
            responses: {
              '307': {
                description: 'Redirect to optimized image URL',
              },
              '400': {
                description: 'Invalid transform request or unsupported media type',
              },
              '404': {
                description: 'Media not found or private',
              },
            },
          },
        },
        [`/api/sites/${site.id}/collections`]: {
          get: {
            tags: ['Content'],
            summary: 'List public CMS collections',
            operationId: 'listBackyCollections',
            responses: {
              '200': {
                description: 'Collection list',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CollectionListEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/collections/{collectionId}`]: {
          get: {
            tags: ['Content'],
            summary: 'Fetch a public CMS collection schema',
            operationId: 'getBackyCollection',
            parameters: [
              {
                name: 'collectionId',
                in: 'path',
                required: true,
                schema: { type: 'string', enum: collectionIds.length > 0 ? collectionIds : undefined },
              },
            ],
            responses: {
              '200': {
                description: 'Collection schema',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CollectionEnvelope' },
                  },
                },
              },
              '404': {
                description: 'Collection not found or not public',
              },
            },
          },
        },
        [`/api/sites/${site.id}/commerce/catalog`]: {
          get: {
            tags: ['Content'],
            summary: 'Fetch normalized storefront product catalog data',
            operationId: 'getBackyCommerceCatalog',
            parameters: [
              queryParameter('slug', { type: 'string' }, 'Return one product by slug'),
              queryParameter('q', { type: 'string' }, 'Search title, SKU, description, category, vendor, and tags'),
              queryParameter('category', { type: 'string' }, 'Filter by category'),
              queryParameter('tag', { type: 'string' }, 'Filter by tag'),
              queryParameter('vendor', { type: 'string' }, 'Filter by vendor'),
              queryParameter('productType', { type: 'string', enum: ['physical', 'digital', 'service'] }, 'Filter by product type'),
              queryParameter('featured', { type: 'boolean' }, 'Filter featured products'),
              queryParameter('sortBy', { type: 'string', default: 'title' }, 'Sort field'),
              queryParameter('sortDirection', { type: 'string', enum: ['asc', 'desc'] }, 'Sort direction'),
              queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Page size'),
              queryParameter('offset', { type: 'integer', minimum: 0 }, 'Page offset'),
            ],
            responses: {
              '200': {
                description: 'Normalized commerce catalog',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommerceCatalogEnvelope' },
                  },
                },
              },
              '404': {
                description: hasCommerceCatalog ? 'Product not found' : 'Product catalog not found or not public',
              },
            },
          },
        },
        [`/api/sites/${site.id}/commerce/orders`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch the public checkout order intake contract',
            operationId: 'getBackyCommerceOrderContract',
            responses: {
              '200': {
                description: 'Commerce order intake contract',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommerceOrderContractEnvelope' },
                  },
                },
              },
            },
          },
          post: {
            tags: ['Interactions'],
            summary: 'Create a private Backy order from a public checkout cart',
            operationId: 'createBackyCommerceOrder',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommerceOrderCreateRequest' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Private order captured',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommerceOrderEnvelope' },
                  },
                },
              },
              '404': {
                description: hasCommerceCatalog && hasPrivateOrders ? 'Product not found' : 'Product catalog or private order queue not found',
              },
              '409': {
                description: 'Product is out of stock or orders collection is not private',
              },
            },
          },
        },
        [`/api/sites/${site.id}/commerce/webhook`]: {
          post: {
            tags: ['Interactions'],
            summary: 'Receive a commerce provider webhook and settle a private order',
            operationId: 'receiveBackyCommerceWebhook',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommerceWebhookRequest' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Commerce webhook processed',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommerceWebhookEnvelope' },
                  },
                },
              },
              '404': {
                description: 'Site, private order queue, or matching order not found',
              },
              '409': {
                description: 'Commerce webhooks disabled or event type not allowed',
              },
            },
          },
        },
        [`/api/sites/${site.id}/collections/{collectionId}/records`]: {
          get: {
            tags: ['Content'],
            summary: 'List or filter public records from a CMS collection',
            operationId: 'listBackyCollectionRecords',
            parameters: [
              {
                name: 'collectionId',
                in: 'path',
                required: true,
                schema: { type: 'string', enum: collectionIds.length > 0 ? collectionIds : undefined },
              },
              { name: 'slug', in: 'query', schema: { type: 'string' } },
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'fieldKey', in: 'query', schema: { type: 'string' } },
              { name: 'fieldValue', in: 'query', schema: { type: 'string' } },
              { name: 'sortBy', in: 'query', schema: { type: 'string' } },
              { name: 'sortDirection', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
              { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
            ],
            responses: {
              '200': {
                description: 'Collection records',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CollectionRecordListEnvelope' },
                  },
                },
              },
            },
          },
          post: {
            tags: ['Interactions'],
            summary: 'Create a draft collection record when public creation is enabled',
            operationId: 'createBackyCollectionRecord',
            parameters: [
              {
                name: 'collectionId',
                in: 'path',
                required: true,
                schema: { type: 'string', enum: collectionIds.length > 0 ? collectionIds : undefined },
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      slug: { type: 'string' },
                      values: { type: 'object', additionalProperties: true },
                    },
                    required: ['values'],
                  },
                },
              },
            },
            responses: {
              '201': {
                description: 'Draft record created',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CollectionRecordEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/reusable-sections`]: {
          get: {
            tags: ['Content'],
            summary: 'List active reusable section templates',
            operationId: 'listBackyReusableSections',
            parameters: [
              queryParameter('category', { type: 'string' }, 'Filter by saved section category'),
              queryParameter('tag', { type: 'string' }, 'Filter by saved section tag'),
              queryParameter('search', { type: 'string' }, 'Search saved section name, slug, description, category, or tags'),
            ],
            responses: {
              '200': {
                description: 'Reusable section list',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ReusableSectionListEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/reusable-sections/{sectionId}`]: {
          get: {
            tags: ['Content'],
            summary: 'Fetch an active reusable section template',
            operationId: 'getBackyReusableSection',
            parameters: [
              pathParameter('sectionId', 'Reusable section ID or slug', reusableSectionIds),
            ],
            responses: {
              '200': {
                description: 'Reusable section detail',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ReusableSectionEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List site forms',
            operationId: 'listBackyForms',
            parameters: [
              queryParameter('pageId'),
              queryParameter('postId'),
              queryParameter('active', { type: 'boolean' }),
            ],
            responses: {
              '200': {
                description: 'Form definitions',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormListEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch a public-safe form detail payload with endpoint handoff links',
            operationId: 'getBackyForm',
            parameters: [pathParameter('formId', 'Form id', formIds)],
            responses: {
              '200': {
                description: 'Form definition',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/definition`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch a cacheable public form definition without submissions or contacts',
            operationId: 'getBackyFormDefinition',
            parameters: [pathParameter('formId', 'Form id', formIds)],
            responses: {
              '200': {
                description: 'Cacheable form definition',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormDefinitionEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/submissions`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List private form submissions for review workflows',
            operationId: 'listBackyFormSubmissions',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] }),
              queryParameter('requestId'),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Form submission list',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormSubmissionsEnvelope' },
                  },
                },
              },
            },
          },
          post: {
            tags: ['Interactions'],
            summary: 'Submit a Backy form',
            operationId: 'submitBackyForm',
            parameters: [pathParameter('formId', 'Form id', formIds)],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FormSubmissionRequest' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Submission accepted',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormSubmissionEnvelope' },
                  },
                },
              },
              '400': {
                description: 'Invalid submission payload',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ErrorEnvelope' },
                  },
                },
              },
              '422': {
                description: 'Machine-readable field validation or spam rejection',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormSubmissionValidationErrorEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/submissions/{submissionId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch one private form submission',
            operationId: 'getBackyFormSubmission',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              pathParameter('submissionId', 'Submission id'),
            ],
            responses: {
              '200': {
                description: 'Form submission detail',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormSubmissionEnvelope' },
                  },
                },
              },
            },
          },
          patch: {
            tags: ['Interactions'],
            summary: 'Review or moderate a private form submission',
            operationId: 'reviewBackyFormSubmission',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              pathParameter('submissionId', 'Submission id'),
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] },
                      reviewedBy: { type: 'string' },
                      adminNotes: { type: 'string' },
                    },
                    required: ['status'],
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Reviewed submission',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormSubmissionEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/contacts`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List private contacts captured from form submissions',
            operationId: 'listBackyFormContacts',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              queryParameter('status', { type: 'string', enum: ['new', 'contacted', 'qualified', 'archived'] }),
              queryParameter('requestId'),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Form contact list',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormContactsEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/contacts/{contactId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch one private form contact',
            operationId: 'getBackyFormContact',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              pathParameter('contactId', 'Contact id'),
            ],
            responses: {
              '200': {
                description: 'Form contact detail',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormContactEnvelope' },
                  },
                },
              },
            },
          },
          patch: {
            tags: ['Interactions'],
            summary: 'Update a private form contact status or notes',
            operationId: 'updateBackyFormContact',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              pathParameter('contactId', 'Contact id'),
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'archived'] },
                      notes: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated form contact',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/FormContactEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/pages/{pageId}/comments`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List comments for a page',
            operationId: 'listBackyPageComments',
            parameters: [
              pathParameter('pageId', 'Page id'),
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam', 'blocked', 'all'] }),
              queryParameter('requestId'),
              queryParameter('parentId', { type: 'string' }, 'Return replies for a specific parent comment.'),
              queryParameter('parentOnly', { type: 'boolean' }, 'Return only top-level comments when true.'),
              queryParameter('commentThreadId', { type: 'string' }, 'Filter comments to a specific frontend comment thread widget.'),
              queryParameter('sort', { type: 'string', enum: ['newest', 'oldest'] }),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Page comments',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentsEnvelope' },
                  },
                },
              },
            },
          },
          post: {
            tags: ['Interactions'],
            summary: 'Submit a page comment',
            operationId: 'submitBackyPageComment',
            parameters: [pathParameter('pageId', 'Page id')],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentSubmitRequest' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Comment accepted',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/pages/{pageId}/comments/{commentId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch a page comment by id',
            operationId: 'getBackyPageComment',
            parameters: [
              pathParameter('pageId', 'Page id'),
              pathParameter('commentId', 'Comment id'),
            ],
            responses: {
              '200': {
                description: 'Page comment',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
          patch: {
            tags: ['Interactions'],
            summary: 'Update page comment moderation state',
            operationId: 'updateBackyPageComment',
            parameters: [
              pathParameter('pageId', 'Page id'),
              pathParameter('commentId', 'Comment id'),
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentUpdateRequest' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated page comment',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/{postId}/comments`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List comments for a blog post',
            operationId: 'listBackyBlogComments',
            parameters: [
              pathParameter('postId', 'Blog post id'),
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam', 'blocked', 'all'] }),
              queryParameter('requestId'),
              queryParameter('parentId', { type: 'string' }, 'Return replies for a specific parent comment.'),
              queryParameter('parentOnly', { type: 'boolean' }, 'Return only top-level comments when true.'),
              queryParameter('commentThreadId', { type: 'string' }, 'Filter comments to a specific frontend comment thread widget.'),
              queryParameter('sort', { type: 'string', enum: ['newest', 'oldest'] }),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Blog comments',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentsEnvelope' },
                  },
                },
              },
            },
          },
          post: {
            tags: ['Interactions'],
            summary: 'Submit a blog post comment',
            operationId: 'submitBackyBlogComment',
            parameters: [pathParameter('postId', 'Blog post id')],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentSubmitRequest' },
                },
              },
            },
            responses: {
              '201': {
                description: 'Comment accepted',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/{postId}/comments/{commentId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch a blog comment by id',
            operationId: 'getBackyBlogComment',
            parameters: [
              pathParameter('postId', 'Blog post id'),
              pathParameter('commentId', 'Comment id'),
            ],
            responses: {
              '200': {
                description: 'Blog comment',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
          patch: {
            tags: ['Interactions'],
            summary: 'Update blog comment moderation state',
            operationId: 'updateBackyBlogComment',
            parameters: [
              pathParameter('postId', 'Blog post id'),
              pathParameter('commentId', 'Comment id'),
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentUpdateRequest' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated blog comment',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/comments`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List site-wide comments across pages and posts',
            operationId: 'listBackySiteComments',
            parameters: [
              queryParameter('targetType', { type: 'string', enum: ['page', 'post'] }),
              queryParameter('targetId'),
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam', 'blocked', 'all'] }),
              queryParameter('requestId'),
              queryParameter('parentId', { type: 'string' }, 'Return replies for a specific parent comment.'),
              queryParameter('parentOnly', { type: 'boolean' }, 'Return only top-level comments when true.'),
              queryParameter('commentThreadId', { type: 'string' }, 'Filter comments to a specific frontend comment thread widget.'),
              queryParameter('q', { type: 'string' }, 'Search comment content and author fields.'),
              queryParameter('sort', { type: 'string', enum: ['newest', 'oldest'] }),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Site comments',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentsEnvelope' },
                  },
                },
              },
            },
          },
          patch: {
            tags: ['Interactions'],
            summary: 'Bulk update site-wide comments',
            operationId: 'bulkUpdateBackySiteComments',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentBulkUpdateRequest' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Bulk comment update result',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentBulkUpdateEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/comments/blocklist`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List blocked comment authors for moderation',
            operationId: 'listBackyCommentBlocklist',
            parameters: [
              queryParameter('type', { type: 'string', enum: ['email', 'ip', 'all'] }),
              queryParameter('q', { type: 'string' }, 'Search blocked value, reason, or actor.'),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Comment author blocklist',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentBlocklistEnvelope' },
                  },
                },
              },
            },
          },
          delete: {
            tags: ['Interactions'],
            summary: 'Remove blocked comment authors',
            operationId: 'deleteBackyCommentBlocklistEntries',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentBlocklistDeleteRequest' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Removed comment author blocklist entries',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentBlocklistDeleteEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/comments/{commentId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch a site-wide comment by id',
            operationId: 'getBackySiteComment',
            parameters: [pathParameter('commentId', 'Comment id')],
            responses: {
              '200': {
                description: 'Site comment',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
          patch: {
            tags: ['Interactions'],
            summary: 'Update a site-wide comment moderation state',
            operationId: 'updateBackySiteComment',
            parameters: [pathParameter('commentId', 'Comment id')],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CommentUpdateRequest' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated site comment',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/comments/report-reasons`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List supported comment report reasons',
            operationId: 'listBackyCommentReportReasons',
            responses: {
              '200': {
                description: 'Comment report reasons',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentReportReasonsEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/comments/{commentId}/report`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List supported report reasons for a comment',
            operationId: 'getBackyCommentReportReasons',
            parameters: [pathParameter('commentId', 'Comment id')],
            responses: {
              '200': {
                description: 'Comment report reasons',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentReportReasonsEnvelope' },
                  },
                },
              },
            },
          },
          post: {
            tags: ['Interactions'],
            summary: 'Report a comment',
            operationId: 'reportBackyComment',
            parameters: [pathParameter('commentId', 'Comment id')],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      reason: { type: 'string' },
                      details: { type: 'string' },
                      reporterEmail: { type: 'string' },
                      requestId: { type: 'string' },
                    },
                    required: ['reason'],
                  },
                },
              },
            },
            responses: {
              '201': {
                description: 'Comment report accepted',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CommentReportEnvelope' },
                  },
                },
              },
            },
          },
        },
        [`/api/sites/${site.id}/events`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List public interaction audit events',
            operationId: 'listBackyInteractionEvents',
            parameters: [
              queryParameter('kind'),
              queryParameter('requestId'),
              queryParameter('formId'),
              queryParameter('commentId'),
              queryParameter('contactId'),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Interaction events',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/EventsEnvelope' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ErrorEnvelope: {
            type: 'object',
            required: ['success', 'requestId', 'error'],
            properties: {
              success: { const: false },
              requestId: { type: 'string' },
              error: {
                type: 'object',
                required: ['code', 'message'],
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          RouteResolveEnvelope: envelopeSchema({
            type: 'object',
            required: ['site', 'route'],
            properties: {
              site: { type: 'object', additionalProperties: true },
              route: { $ref: '#/components/schemas/ResolvedRoute' },
              navigation: { type: 'object', additionalProperties: true },
            },
          }),
          GoneRouteResolveEnvelope: {
            type: 'object',
            required: ['success', 'requestId', 'error', 'data'],
            properties: {
              success: { const: false },
              requestId: { type: 'string' },
              error: {
                type: 'object',
                required: ['code', 'message'],
                properties: {
                  code: { const: 'ROUTE_GONE' },
                  message: { type: 'string' },
                },
              },
              data: {
                type: 'object',
                required: ['site', 'route'],
                properties: {
                  site: { type: 'object', additionalProperties: true },
                  route: { $ref: '#/components/schemas/GoneRoute' },
                  navigation: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
          ResolvedRoute: {
            oneOf: [
              { $ref: '#/components/schemas/PageRoute' },
              { $ref: '#/components/schemas/PostRoute' },
              { $ref: '#/components/schemas/DynamicListRoute' },
              { $ref: '#/components/schemas/DynamicItemRoute' },
              { $ref: '#/components/schemas/RedirectRoute' },
              { $ref: '#/components/schemas/GoneRoute' },
            ],
          },
          PageRoute: {
            type: 'object',
            required: ['type', 'path', 'status', 'canonical', 'params', 'resource'],
            properties: {
              type: { const: 'page' },
              path: { type: 'string' },
              status: { type: 'string' },
              canonical: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
              resource: { type: 'object', additionalProperties: true },
            },
            additionalProperties: true,
          },
          PostRoute: {
            type: 'object',
            required: ['type', 'path', 'status', 'canonical', 'params', 'resource'],
            properties: {
              type: { const: 'post' },
              path: { type: 'string' },
              status: { type: 'string' },
              canonical: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
              resource: { type: 'object', additionalProperties: true },
            },
            additionalProperties: true,
          },
          DynamicListRoute: {
            type: 'object',
            required: ['type', 'path', 'status', 'canonical', 'params', 'resource'],
            properties: {
              type: { const: 'dynamicList' },
              path: { type: 'string' },
              status: { type: 'string' },
              canonical: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
              resource: { type: 'object', additionalProperties: true },
            },
            additionalProperties: true,
          },
          DynamicItemRoute: {
            type: 'object',
            required: ['type', 'path', 'status', 'canonical', 'params', 'resource'],
            properties: {
              type: { const: 'dynamicItem' },
              path: { type: 'string' },
              status: { type: 'string' },
              canonical: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
              resource: { type: 'object', additionalProperties: true },
            },
            additionalProperties: true,
          },
          RedirectRoute: {
            type: 'object',
            required: ['type', 'path', 'status', 'canonical', 'params', 'resource'],
            properties: {
              type: { const: 'redirect' },
              path: { type: 'string' },
              status: { const: 'published' },
              canonical: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
              resource: {
                type: 'object',
                required: ['id', 'kind', 'from', 'to', 'statusCode'],
                properties: {
                  id: { type: 'string' },
                  kind: { const: 'redirect' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  statusCode: { enum: [301, 302, 307, 308] },
                },
                additionalProperties: true,
              },
            },
            additionalProperties: true,
          },
          GoneRoute: {
            type: 'object',
            required: ['type', 'path', 'status', 'canonical', 'params', 'resource'],
            properties: {
              type: { const: 'gone' },
              path: { type: 'string' },
              status: { const: 'archived' },
              canonical: { type: 'string' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
              resource: {
                type: 'object',
                required: ['id', 'kind', 'from', 'statusCode'],
                properties: {
                  id: { type: 'string' },
                  kind: { const: 'gone' },
                  from: { type: 'string' },
                  statusCode: { const: 410 },
                },
                additionalProperties: true,
              },
            },
            additionalProperties: true,
          },
          NavigationEnvelope: envelopeSchema({
            type: 'object',
            required: ['site', 'navigation'],
            properties: {
              site: { type: 'object', additionalProperties: true },
              navigation: { type: 'object', additionalProperties: true },
            },
          }),
          FrontendDesignEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'site', 'frontendDesign', 'capabilities', 'endpoints'],
            properties: {
              schemaVersion: { const: 'backy.frontend-design-response.v1' },
              site: { type: 'object', additionalProperties: true },
              frontendDesign: { $ref: '#/components/schemas/FrontendDesignContract' },
              capabilities: {
                type: 'object',
                required: ['hasContract', 'templateCount', 'editableBindingCount'],
                properties: {
                  hasContract: { type: 'boolean' },
                  templateCount: { type: 'integer', minimum: 0 },
                  editableBindingCount: { type: 'integer', minimum: 0 },
                  chrome: { type: 'boolean' },
                  tokens: { type: 'boolean' },
                },
              },
              endpoints: { type: 'object', additionalProperties: { type: 'string' } },
            },
          }),
          FrontendDesignContract: {
            type: 'object',
            required: ['schemaVersion', 'status', 'source', 'templates', 'editableMap'],
            additionalProperties: true,
            properties: {
              schemaVersion: { type: 'string' },
              status: { type: 'string', enum: ['unconfigured', 'captured', 'synced', 'stale'] },
              source: { type: 'object', additionalProperties: true },
              tokens: { type: 'object', additionalProperties: true },
              chrome: { type: 'object', additionalProperties: true },
              templates: {
                type: 'array',
                items: { $ref: '#/components/schemas/FrontendDesignTemplate' },
              },
              editableMap: {
                type: 'array',
                items: { $ref: '#/components/schemas/FrontendEditableMapEntry' },
              },
              notes: { type: 'string' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          FrontendDesignTemplate: {
            type: 'object',
            required: ['id', 'type', 'name'],
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['page', 'blogPost', 'form', 'product', 'collection', 'section'] },
              name: { type: 'string' },
              routePattern: { type: 'string' },
              description: { type: 'string' },
              canvasSize: { type: 'object', additionalProperties: true },
              content: { type: 'object', additionalProperties: true },
              bindingHints: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
          },
          FrontendEditableMapEntry: {
            type: 'object',
            additionalProperties: true,
            properties: {
              selector: { type: 'string' },
              elementId: { type: 'string' },
              role: { type: 'string' },
              binding: { type: 'string' },
              fields: { type: 'array', items: { type: 'string' } },
            },
          },
          SeoDiscoveryEnvelope: envelopeSchema({
            type: 'object',
            required: ['site', 'defaults', 'routes', 'sitemap', 'robots'],
            properties: {
              site: { type: 'object', additionalProperties: true },
              defaults: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  jsonLd: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                  },
                  robots: { type: 'object', additionalProperties: true },
                },
              },
              routes: { type: 'array', items: { $ref: '#/components/schemas/SeoRoute' } },
              sitemap: { type: 'object', additionalProperties: true },
              robots: { type: 'object', additionalProperties: true },
            },
          }),
          SeoRoute: {
            type: 'object',
            additionalProperties: true,
            required: ['type', 'id', 'title', 'path', 'canonical', 'status', 'priority', 'changeFrequency', 'robots', 'openGraph', 'keywords', 'jsonLd'],
            properties: {
              type: { type: 'string', enum: ['page', 'post', 'dynamicList', 'dynamicItem'] },
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              path: { type: 'string' },
              canonical: { type: 'string' },
              canonicalUrl: { type: 'string' },
              status: { type: 'string' },
              updatedAt: { type: 'string', format: 'date-time' },
              priority: { type: 'number', minimum: 0, maximum: 1 },
              changeFrequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
              robots: {
                type: 'object',
                required: ['index', 'follow'],
                properties: {
                  index: { type: 'boolean' },
                  follow: { type: 'boolean' },
                },
                additionalProperties: true,
              },
              openGraph: {
                type: 'object',
                required: ['title', 'description'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  image: { type: 'string' },
                },
                additionalProperties: true,
              },
              keywords: { type: 'array', items: { type: 'string' } },
              jsonLd: { type: 'array', items: { type: 'object', additionalProperties: true } },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
              collectionFrontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
            },
          },
          MediaList: {
            ...envelopeSchema({
              type: 'object',
              required: ['media', 'pagination'],
              properties: {
                media: { type: 'array', items: { $ref: '#/components/schemas/MediaAsset' } },
                pagination: { type: 'object', additionalProperties: true },
              },
            }),
          },
          FontManifestEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'siteId', 'families', 'fonts', 'css', 'counts'],
            properties: {
              schemaVersion: { const: 'backy.font-manifest.v1' },
              siteId: { type: 'string' },
              families: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['family', 'fallbackStack', 'display', 'cssFamily', 'variants', 'assetIds'],
                  properties: {
                    family: { type: 'string' },
                    fallbackStack: { type: 'string' },
                    display: { type: 'string' },
                    cssFamily: { type: 'string' },
                    variants: { type: 'array', items: { $ref: '#/components/schemas/FontVariant' } },
                    assetIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
              fonts: { type: 'array', items: { $ref: '#/components/schemas/FontVariant' } },
              css: { type: 'string' },
              counts: {
                type: 'object',
                required: ['families', 'variants'],
                properties: {
                  families: { type: 'integer', minimum: 0 },
                  variants: { type: 'integer', minimum: 0 },
                },
              },
            },
          }),
          FontVariant: {
            type: 'object',
            required: ['id', 'mediaId', 'family', 'weight', 'style', 'display', 'fallbackStack', 'cssFamily', 'url'],
            properties: {
              id: { type: 'string' },
              mediaId: { type: 'string' },
              family: { type: 'string' },
              weight: { type: 'string' },
              style: { type: 'string' },
              display: { type: 'string' },
              fallbackStack: { type: 'string' },
              cssFamily: { type: 'string' },
              url: { type: 'string' },
              mimeType: { type: 'string' },
              sizeBytes: { type: 'integer', minimum: 0 },
              originalName: { type: 'string' },
              folderId: { type: ['string', 'null'] },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          MediaDetailEnvelope: envelopeSchema({
            type: 'object',
            required: ['media'],
            properties: {
              media: { $ref: '#/components/schemas/MediaAsset' },
            },
          }),
          MediaAsset: {
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              url: { type: 'string' },
              visibility: { type: 'string' },
              responsive: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  src: { type: 'string' },
                  srcSet: { type: 'string' },
                  sizes: { type: 'string' },
                  variants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['width', 'quality', 'url'],
                      properties: {
                        width: { type: 'integer' },
                        quality: { type: 'integer' },
                        url: { type: 'string' },
                        bytes: { type: 'integer' },
                        format: { type: 'string' },
                        mimeType: { type: 'string' },
                        generatedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                  format: { type: 'string' },
                  generatedBytes: { type: 'integer' },
                  storageProvider: { type: 'string' },
                  preparedAt: { type: 'string', format: 'date-time' },
                  preparedBy: { type: 'string' },
                },
              },
            },
          },
          ReusableSectionListEnvelope: envelopeSchema({
            type: 'object',
            required: ['sections', 'pagination'],
            properties: {
              sections: { type: 'array', items: { $ref: '#/components/schemas/ReusableSection' } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          ReusableSectionEnvelope: envelopeSchema({
            type: 'object',
            required: ['section'],
            properties: {
              section: { $ref: '#/components/schemas/ReusableSection' },
            },
          }),
          PageListEnvelope: envelopeSchema({
            type: 'object',
            required: ['pages', 'pagination'],
            properties: {
              pages: { type: 'array', items: { $ref: '#/components/schemas/PageResource' } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          PageEnvelope: envelopeSchema({
            type: 'object',
            required: ['page'],
            properties: {
              page: { $ref: '#/components/schemas/PageResource' },
            },
          }),
          PageResource: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'title', 'slug'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              title: { type: 'string' },
              slug: { type: 'string' },
              description: { type: ['string', 'null'] },
              status: { type: 'string' },
              path: { type: 'string' },
              isHomepage: { type: 'boolean' },
              parentId: { type: ['string', 'null'] },
              meta: { type: 'object', additionalProperties: true },
              seo: { $ref: '#/components/schemas/PageSeoMetadata' },
              content: { type: 'object', additionalProperties: true },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          PageSeoMetadata: {
            type: 'object',
            additionalProperties: true,
            required: ['title', 'description', 'path', 'canonical', 'robots', 'openGraph', 'keywords', 'jsonLd'],
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              path: { type: 'string' },
              canonical: { type: 'string' },
              canonicalUrl: { type: 'string' },
              robots: {
                type: 'object',
                required: ['index', 'follow'],
                properties: {
                  index: { type: 'boolean' },
                  follow: { type: 'boolean' },
                },
              },
              openGraph: {
                type: 'object',
                required: ['title', 'description'],
                additionalProperties: true,
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  image: { type: 'string' },
                },
              },
              keywords: { type: 'array', items: { type: 'string' } },
              jsonLd: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          BlogPostListEnvelope: envelopeSchema({
            type: 'object',
            required: ['posts', 'pagination'],
            properties: {
              posts: { type: 'array', items: { $ref: '#/components/schemas/BlogPostResource' } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          BlogPostEnvelope: envelopeSchema({
            type: 'object',
            required: ['post'],
            properties: {
              post: { $ref: '#/components/schemas/BlogPostResource' },
            },
          }),
          BlogPostResource: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'title', 'slug'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              title: { type: 'string' },
              slug: { type: 'string' },
              excerpt: { type: ['string', 'null'] },
              status: { type: 'string' },
              authorId: { type: ['string', 'null'] },
              categoryIds: { type: 'array', items: { type: 'string' } },
              tagIds: { type: 'array', items: { type: 'string' } },
              meta: { type: 'object', additionalProperties: true },
              content: { type: 'object', additionalProperties: true },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
              publishedAt: { type: ['string', 'null'], format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          BlogCategoryListEnvelope: envelopeSchema({
            type: 'object',
            required: ['categories'],
            properties: {
              categories: { type: 'array', items: { $ref: '#/components/schemas/BlogCategoryResource' } },
            },
          }),
          BlogCategoryResource: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'name', 'slug'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              description: { type: ['string', 'null'] },
              color: { type: ['string', 'null'] },
              sortOrder: { type: 'integer' },
              postCount: { type: 'integer' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          BlogTagListEnvelope: envelopeSchema({
            type: 'object',
            required: ['tags'],
            properties: {
              tags: { type: 'array', items: { $ref: '#/components/schemas/BlogTagResource' } },
            },
          }),
          BlogTagResource: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'name', 'slug'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              description: { type: ['string', 'null'] },
              postCount: { type: 'integer' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          BlogAuthorListEnvelope: envelopeSchema({
            type: 'object',
            required: ['authors'],
            properties: {
              authors: { type: 'array', items: { $ref: '#/components/schemas/BlogAuthorResource' } },
            },
          }),
          BlogAuthorResource: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'name', 'slug'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              avatarUrl: { type: ['string', 'null'] },
              postCount: { type: 'integer' },
            },
          },
          ReusableSectionFrontendDesign: {
            type: 'object',
            additionalProperties: true,
            properties: {
              templateId: { type: 'string' },
              templateName: { type: 'string' },
              routePattern: { type: 'string' },
              source: { type: 'object', additionalProperties: true },
              chrome: { type: 'object', additionalProperties: true },
              tokens: { type: 'object', additionalProperties: true },
              customCss: { type: 'string' },
              bindingHints: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
          },
          CollectionListEnvelope: envelopeSchema({
            type: 'object',
            required: ['collections', 'pagination'],
            properties: {
              collections: { type: 'array', items: { $ref: '#/components/schemas/CollectionSchema' } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CollectionEnvelope: envelopeSchema({
            type: 'object',
            required: ['collection'],
            properties: {
              collection: { $ref: '#/components/schemas/CollectionSchema' },
            },
          }),
          CollectionRecordListEnvelope: envelopeSchema({
            type: 'object',
            required: ['collection', 'records', 'pagination'],
            properties: {
              collection: { $ref: '#/components/schemas/CollectionSchema' },
              records: { type: 'array', items: { $ref: '#/components/schemas/CollectionRecord' } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CollectionRecordEnvelope: envelopeSchema({
            type: 'object',
            required: ['record'],
            properties: {
              record: { $ref: '#/components/schemas/CollectionRecord' },
            },
          }),
          CollectionSchema: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'slug', 'name', 'fields', 'permissions'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              description: { type: ['string', 'null'] },
              status: { type: 'string', enum: ['draft', 'published', 'scheduled', 'archived'] },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
              permissions: { type: 'object', additionalProperties: { type: 'boolean' } },
              metadata: { type: 'object', additionalProperties: true },
              recordsUrl: { type: 'string' },
              listRoutePattern: { type: ['string', 'null'] },
              routePattern: { type: ['string', 'null'] },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          CollectionRecord: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'slug', 'values'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              collectionId: { type: 'string' },
              slug: { type: 'string' },
              status: { type: 'string', enum: ['draft', 'published', 'scheduled', 'archived'] },
              values: { type: 'object', additionalProperties: true },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
              publishedAt: { type: ['string', 'null'], format: 'date-time' },
              scheduledAt: { type: ['string', 'null'], format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          ReusableSection: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'name', 'slug', 'content'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              description: { type: ['string', 'null'] },
              category: { type: 'string' },
              status: { type: 'string', enum: ['active', 'archived'] },
              tags: { type: 'array', items: { type: 'string' } },
              content: {
                type: 'object',
                additionalProperties: true,
                required: ['elements'],
                properties: {
                  elements: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  canvasSize: { type: 'object', additionalProperties: true },
                  customCSS: { type: 'string' },
                  customJS: { type: 'string' },
                },
              },
              metadata: { type: 'object', additionalProperties: true },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
              sourceElementId: { type: ['string', 'null'] },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          FormListEnvelope: envelopeSchema({
            type: 'object',
            required: ['forms', 'total', 'pagination'],
            properties: {
              forms: { type: 'array', items: { $ref: '#/components/schemas/FormDefinition' } },
              total: { type: 'integer', minimum: 0 },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          FormEnvelope: envelopeSchema({
            type: 'object',
            required: ['form', 'endpoints'],
            properties: {
              form: { $ref: '#/components/schemas/FormDefinition' },
              endpoints: {
                type: 'object',
                required: ['definition', 'submissions'],
                properties: {
                  definition: { type: 'string' },
                  submissions: { type: 'string' },
                  contacts: { type: 'string' },
                },
              },
            },
          }),
          FormDefinitionEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'form', 'submitUrl'],
            properties: {
              schemaVersion: { type: 'string', const: 'backy.form-definition.v1' },
              form: { $ref: '#/components/schemas/FormDefinition' },
              submitUrl: { type: 'string' },
            },
          }),
          FormDefinition: {
            type: 'object',
            additionalProperties: true,
            required: ['id'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              isActive: { type: 'boolean' },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
              settings: { type: 'object', additionalProperties: true },
              collectionTarget: { type: ['object', 'null'], additionalProperties: true },
              frontendDesign: { $ref: '#/components/schemas/ReusableSectionFrontendDesign' },
            },
          },
          FormSubmissionsEnvelope: envelopeSchema({
            type: 'object',
            required: ['form', 'submissions', 'pagination'],
            properties: {
              form: { $ref: '#/components/schemas/FormDefinition' },
              submissions: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          FormSubmissionEnvelope: envelopeSchema({
            type: 'object',
            required: ['submission'],
            properties: {
              submission: { type: 'object', additionalProperties: true },
              collectionRecord: { type: ['object', 'null'], additionalProperties: true },
              collectionRecordErrors: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          }),
          FormSubmissionRequest: {
            type: 'object',
            additionalProperties: true,
            description: 'Submit form field values under values, fields, data, or submission. Simple frontends may also send field keys at the top level; requestId, pageId, postId, honeypot, startedAt, contactShareOverride, and captcha token fields are reserved transport metadata keys.',
            properties: {
              values: { type: 'object', additionalProperties: true, description: 'Preferred field value map.' },
              fields: { type: 'object', additionalProperties: true, description: 'Alias accepted for generated form integrations.' },
              data: { type: 'object', additionalProperties: true, description: 'Alias accepted for custom frontend integrations.' },
              submission: { type: 'object', additionalProperties: true, description: 'Alias accepted for legacy submitters.' },
              requestId: { type: 'string' },
              pageId: { type: 'string' },
              postId: { type: 'string' },
              honeypot: { type: 'string' },
              startedAt: { oneOf: [{ type: 'string' }, { type: 'number' }] },
              captchaToken: { type: 'string', description: 'Captcha provider token for forms with captcha enabled.' },
              captchaResponse: { type: 'string', description: 'Alias for captchaToken.' },
              turnstileToken: { type: 'string', description: 'Cloudflare Turnstile token alias.' },
              hcaptchaToken: { type: 'string', description: 'hCaptcha token alias.' },
              recaptchaToken: { type: 'string', description: 'reCAPTCHA token alias.' },
              'g-recaptcha-response': { type: 'string', description: 'Browser form token name emitted by reCAPTCHA widgets.' },
              'cf-turnstile-response': { type: 'string', description: 'Browser form token name emitted by Turnstile widgets.' },
              captcha: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  token: { type: 'string' },
                  response: { type: 'string' },
                },
              },
              contactShareOverride: { type: 'object', additionalProperties: true },
            },
          },
          FormSubmissionValidationDetail: {
            type: 'object',
            required: ['field', 'code', 'message'],
            properties: {
              field: { type: 'string' },
              code: { type: 'string', enum: formSubmissionValidationCodes },
              message: { type: 'string' },
              label: { type: 'string' },
            },
          },
          FormSubmissionValidationErrorEnvelope: {
            type: 'object',
            required: ['success', 'requestId', 'error', 'validation'],
            properties: {
              success: { const: false },
              requestId: { type: 'string' },
              error: {
                type: 'object',
                required: ['code', 'message'],
                properties: {
                  code: { const: 'VALIDATION_ERROR' },
                  message: { type: 'string' },
                },
              },
              errorMessage: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] },
              validation: {
                type: 'array',
                items: { $ref: '#/components/schemas/FormSubmissionValidationDetail' },
              },
              spamFlags: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
          },
          FormContactsEnvelope: envelopeSchema({
            type: 'object',
            required: ['form', 'contacts', 'pagination'],
            properties: {
              form: { $ref: '#/components/schemas/FormDefinition' },
              contacts: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          FormContactEnvelope: envelopeSchema({
            type: 'object',
            required: ['contact'],
            properties: {
              contact: { type: 'object', additionalProperties: true },
            },
          }),
          CommentUpdateRequest: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam', 'blocked'] },
              moderationNote: { type: 'string' },
              requestId: { type: 'string' },
            },
            required: ['status'],
          },
          CommentSubmitRequest: {
            type: 'object',
            additionalProperties: true,
            properties: {
              content: { type: 'string', description: 'Preferred comment body field.' },
              body: { type: 'string', description: 'Alias accepted for SDK and simple form integrations.' },
              authorName: { type: 'string' },
              authorEmail: { type: 'string', format: 'email' },
              authorWebsite: { type: 'string' },
              userId: { type: 'string' },
              parentId: { type: 'string', description: 'Parent comment id when submitting a reply.' },
              commentThreadId: { type: 'string', description: 'Optional thread id for grouped comment widgets.' },
              threadId: { type: 'string', description: 'Alias for commentThreadId.' },
              requestId: { type: 'string' },
              moderationMode: { type: 'string', enum: ['manual', 'auto-approve'] },
              startedAt: { type: ['string', 'number'] },
              honeypot: { type: 'string' },
            },
          },
          CommentBulkUpdateRequest: {
            type: 'object',
            additionalProperties: false,
            description: 'Bulk comment moderation request. Provide commentIds or ids plus either status, clearReports: true, or action: "clearReports".',
            properties: {
              commentIds: { type: 'array', items: { type: 'string' } },
              ids: { type: 'array', items: { type: 'string' }, description: 'Alias for commentIds.' },
              status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam', 'blocked'] },
              action: { type: 'string', enum: ['clearReports'] },
              clearReports: { type: 'boolean' },
              reviewedBy: { type: 'string' },
              actor: { type: 'string' },
              rejectionReason: { type: 'string' },
              blockReason: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
          Comment: {
            type: 'object',
            additionalProperties: true,
            required: ['id', 'siteId', 'targetType', 'targetId', 'content', 'status', 'createdAt', 'updatedAt'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              targetType: { type: 'string', enum: ['page', 'post'] },
              targetId: { type: 'string' },
              commentThreadId: { type: 'string' },
              authorName: { type: ['string', 'null'] },
              authorEmail: { type: ['string', 'null'] },
              authorWebsite: { type: ['string', 'null'] },
              userId: { type: ['string', 'null'] },
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam', 'blocked'] },
              parentId: { type: ['string', 'null'], description: 'Parent comment id for replies; null for top-level comments.' },
              reviewedBy: { type: ['string', 'null'] },
              reviewedAt: { type: ['string', 'null'], format: 'date-time' },
              rejectionReason: { type: ['string', 'null'] },
              blockReason: { type: ['string', 'null'] },
              blockedBy: { type: ['string', 'null'] },
              blockedAt: { type: ['string', 'null'], format: 'date-time' },
              reportCount: { type: 'integer', minimum: 0 },
              reportReasons: { type: 'array', items: { type: 'string' } },
              requestId: { type: ['string', 'null'] },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          CommentBlocklistEntry: {
            type: 'object',
            required: ['id', 'siteId', 'type', 'value', 'reason', 'createdAt'],
            properties: {
              id: { type: 'string' },
              siteId: { type: 'string' },
              type: { type: 'string', enum: ['email', 'ip'] },
              value: { type: 'string' },
              reason: { type: 'string' },
              actor: { type: 'string' },
              requestId: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          CommentBlocklistEnvelope: envelopeSchema({
            type: 'object',
            required: ['siteId', 'blocklist', 'count', 'pagination'],
            properties: {
              siteId: { type: 'string' },
              blocklist: { type: 'array', items: { $ref: '#/components/schemas/CommentBlocklistEntry' } },
              count: { type: 'integer', minimum: 0 },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CommentBlocklistDeleteRequest: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ids: { type: 'array', items: { type: 'string' } },
              blocklistIds: { type: 'array', items: { type: 'string' }, description: 'Alias for ids.' },
            },
          },
          CommentBlocklistDeleteEnvelope: envelopeSchema({
            type: 'object',
            required: ['siteId', 'deleted', 'deletedCount', 'missingIds'],
            properties: {
              siteId: { type: 'string' },
              deleted: { type: 'array', items: { $ref: '#/components/schemas/CommentBlocklistEntry' } },
              deletedCount: { type: 'integer', minimum: 0 },
              missingIds: { type: 'array', items: { type: 'string' } },
            },
          }),
          CommentsEnvelope: envelopeSchema({
            type: 'object',
            required: ['comments', 'count', 'pagination'],
            properties: {
              comments: { type: 'array', items: { $ref: '#/components/schemas/Comment' } },
              count: { type: 'integer', minimum: 0 },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CommentEnvelope: envelopeSchema({
            type: 'object',
            required: ['comment'],
            properties: {
              comment: { $ref: '#/components/schemas/Comment' },
            },
          }),
          CommentBulkUpdateEnvelope: envelopeSchema({
            type: 'object',
            required: ['updated'],
            properties: {
              updated: { type: 'array', items: { $ref: '#/components/schemas/Comment' } },
            },
          }),
          CommentReportReasonsEnvelope: envelopeSchema({
            type: 'object',
            required: ['reasons'],
            properties: {
              reasons: { type: 'array', items: { type: 'string' } },
            },
          }),
          CommentReportEnvelope: envelopeSchema({
            type: 'object',
            required: ['comment', 'report'],
            properties: {
              comment: { $ref: '#/components/schemas/Comment' },
              report: { type: 'object', additionalProperties: true },
            },
          }),
          EventsEnvelope: envelopeSchema({
            type: 'object',
            required: ['siteId', 'events', 'count', 'pagination'],
            properties: {
              siteId: { type: 'string' },
              events: { type: 'array', items: { type: 'object', additionalProperties: true } },
              count: { type: 'integer', minimum: 0 },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CommerceProduct: {
            type: 'object',
            required: ['id', 'slug', 'title', 'price', 'currency', 'inventory', 'delivery', 'checkout', 'links'],
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              status: { type: 'string', enum: ['draft', 'published', 'scheduled', 'archived'] },
              title: { type: 'string' },
              sku: { type: 'string' },
              description: { type: 'string' },
              seoTitle: { type: 'string' },
              price: { type: 'number' },
              compareAtPrice: { type: ['number', 'null'] },
              currency: { type: 'string' },
              imageUrl: { type: 'string' },
              galleryImages: { type: 'array', items: { type: 'string' } },
              variants: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'title', 'sku', 'option', 'price', 'inventory', 'inStock'],
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    sku: { type: 'string' },
                    option: { type: 'string' },
                    price: { type: ['number', 'null'] },
                    inventory: { type: ['number', 'null'] },
                    inStock: { type: 'boolean' },
                  },
                },
              },
              category: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              vendor: { type: 'string' },
              featured: { type: 'boolean' },
              productType: { type: 'string', enum: ['physical', 'digital', 'service'] },
              inventory: { type: 'object', additionalProperties: true },
              delivery: { type: 'object', additionalProperties: true },
              checkout: { type: 'object', additionalProperties: true },
              links: { type: 'object', additionalProperties: true },
              design: { $ref: '#/components/schemas/CommerceProductDesign' },
              updatedAt: { type: 'string', format: 'date-time' },
              publishedAt: { type: ['string', 'null'], format: 'date-time' },
            },
          },
          CommerceProductDesign: {
            type: 'object',
            additionalProperties: true,
            properties: {
              templateId: { type: 'string' },
              templateName: { type: 'string' },
              routePattern: { type: 'string' },
              source: { type: 'object', additionalProperties: true },
              chrome: { type: 'object', additionalProperties: true },
              tokens: { type: 'object', additionalProperties: true },
              customCss: { type: 'string' },
              bindingHints: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
              frontendDesignTemplateId: { type: 'string' },
              frontendDesignTemplateName: { type: 'string' },
              frontendDesignRoutePattern: { type: 'string' },
              frontendDesignSource: { type: 'object', additionalProperties: true },
              frontendDesignChrome: { type: 'object', additionalProperties: true },
              frontendDesignTokens: { type: 'object', additionalProperties: true },
              frontendDesignCustomCss: { type: 'string' },
              frontendDesignBindingHints: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
          },
          CommerceCatalogEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'collection', 'products', 'facets', 'pagination'],
            properties: {
              schemaVersion: { type: 'string', const: 'backy.commerce-catalog.v1' },
              collection: { type: 'object', additionalProperties: true },
              products: { type: 'array', items: { $ref: '#/components/schemas/CommerceProduct' } },
              facets: { type: 'object', additionalProperties: true },
              filters: { type: 'object', additionalProperties: true },
              readiness: { type: 'object', additionalProperties: true },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CommerceOrderCreateRequest: {
            type: 'object',
            required: ['customer', 'items'],
            properties: {
              customer: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                },
              },
              items: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    productId: { type: 'string' },
                    slug: { type: 'string' },
                    variantId: { type: 'string' },
                    variantSku: { type: 'string' },
                    quantity: { type: 'integer', minimum: 1 },
                  },
                },
              },
              shippingAddress: { type: 'string' },
              billingAddress: { type: 'string' },
              notes: { type: 'string' },
              discountCode: { type: 'string' },
              paymentProvider: { type: 'string' },
              paymentReference: { type: 'string' },
              checkoutSessionId: { type: 'string' },
            },
          },
          CommerceOrderContractEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'accepts', 'creates', 'inventoryReservation', 'pricing', 'relatedEndpoints'],
            properties: {
              schemaVersion: { type: 'string', const: 'backy.commerce-orders.v1' },
              accepts: { type: 'object', additionalProperties: true },
              creates: { type: 'object', additionalProperties: true },
              inventoryReservation: { type: 'object', additionalProperties: true },
              pricing: { type: 'object', additionalProperties: true },
              relatedEndpoints: { type: 'object', additionalProperties: true },
            },
          }),
          CommerceOrderEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'order', 'checkoutSession', 'quote', 'lineItems'],
            properties: {
              schemaVersion: { type: 'string', const: 'backy.commerce-orders.v1' },
              order: { type: 'object', additionalProperties: true },
              checkoutSession: {
                type: 'object',
                required: ['id', 'provider', 'status', 'handoffMode', 'successUrl', 'cancelUrl', 'expiresAt', 'reference', 'amountTotal', 'currency'],
                properties: {
                  id: { type: 'string' },
                  provider: { type: 'string', enum: ['manual', 'stripe'] },
                  providerMode: { type: 'string', enum: ['test', 'live'] },
                  accountId: { type: ['string', 'null'] },
                  status: { type: 'string', enum: ['requires_action', 'provider_ready'] },
                  handoffMode: { type: 'string', enum: ['manual', 'provider'] },
                  url: { type: ['string', 'null'] },
                  successUrl: { type: 'string', format: 'uri' },
                  cancelUrl: { type: 'string', format: 'uri' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  reference: { type: 'string' },
                  amountTotal: { type: 'number' },
                  currency: { type: 'string' },
                  metadata: { type: 'object', additionalProperties: { type: 'string' } },
                  providerPayload: { type: ['object', 'null'], additionalProperties: true },
                },
                additionalProperties: true,
              },
              quote: { type: 'object', additionalProperties: true },
              lineItems: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          }),
          CommerceWebhookRequest: {
            type: 'object',
            required: ['type'],
            properties: {
              id: { type: 'string' },
              type: { type: 'string', examples: ['checkout.session.completed', 'charge.refunded', 'payment_intent.payment_failed'] },
              data: {
                type: 'object',
                properties: {
                  object: { type: 'object', additionalProperties: true },
                },
                additionalProperties: true,
              },
              metadata: { type: 'object', additionalProperties: true },
            },
            additionalProperties: true,
          },
          CommerceWebhookEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'event', 'order'],
            properties: {
              schemaVersion: { type: 'string', const: 'backy.commerce-webhook.v1' },
              event: { type: 'object', additionalProperties: true },
              order: { type: 'object', additionalProperties: true },
            },
          }),
        },
      },
      'x-backy': {
        requestId,
        siteId: site.id,
        siteSlug: site.slug,
        contractVersion: 'backy.ai-frontend.v1',
        collectionIds,
        formIds,
        reusableSectionIds,
        redirectRules: redirectRules.map((rule) => ({
          id: rule.id,
          from: rule.from,
          to: rule.to,
          statusCode: rule.statusCode,
        })),
      },
    }, {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: 'openapi.3.1',
      siteId: site.id,
    });
  } catch (error) {
    console.error('OpenAPI API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
