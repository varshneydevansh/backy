/**
 * Site-scoped public OpenAPI document for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/openapi
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, listCollections, listFormsBySite, listReusableSections } from '@/lib/backyStore';
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
            summary: 'Fetch a form detail payload with submission data',
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
            summary: 'List public form submissions for moderation/integration views',
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
                description: 'Form submissions',
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
                  schema: {
                    type: 'object',
                    properties: {
                      values: { type: 'object', additionalProperties: true },
                      requestId: { type: 'string' },
                      pageId: { type: 'string' },
                      postId: { type: 'string' },
                      honeypot: { type: 'string' },
                      startedAt: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                    },
                    required: ['values'],
                  },
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
                description: 'Validation error',
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/submissions/{submissionId}`]: {
          get: {
            tags: ['Interactions'],
            summary: 'Fetch a form submission by id',
            operationId: 'getBackyFormSubmission',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              pathParameter('submissionId', 'Submission id'),
            ],
            responses: {
              '200': {
                description: 'Form submission',
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
            summary: 'Review or update a form submission status',
            operationId: 'updateBackyFormSubmission',
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
                      reviewNote: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated form submission',
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
            summary: 'List contacts captured from form submissions',
            operationId: 'listBackyFormContacts',
            parameters: [
              pathParameter('formId', 'Form id', formIds),
              queryParameter('status', { type: 'string', enum: ['new', 'qualified', 'archived', 'blocked'] }),
              queryParameter('requestId'),
              queryParameter('limit', { type: 'integer', minimum: 1 }),
              queryParameter('offset', { type: 'integer', minimum: 0 }),
            ],
            responses: {
              '200': {
                description: 'Form contacts',
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
          patch: {
            tags: ['Interactions'],
            summary: 'Update a captured contact status',
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
                      status: { type: 'string', enum: ['new', 'qualified', 'archived', 'blocked'] },
                      notes: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated contact',
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
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] }),
              queryParameter('requestId'),
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
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] }),
              queryParameter('requestId'),
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
              queryParameter('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] }),
              queryParameter('requestId'),
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
                  schema: {
                    type: 'object',
                    properties: {
                      ids: { type: 'array', items: { type: 'string' } },
                      status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] },
                    },
                    required: ['ids', 'status'],
                  },
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
              routes: { type: 'array', items: { type: 'object', additionalProperties: true } },
              sitemap: { type: 'object', additionalProperties: true },
              robots: { type: 'object', additionalProperties: true },
            },
          }),
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
              sections: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          ReusableSectionEnvelope: envelopeSchema({
            type: 'object',
            required: ['section'],
            properties: {
              section: { type: 'object', additionalProperties: true },
            },
          }),
          FormListEnvelope: envelopeSchema({
            type: 'object',
            required: ['forms', 'total', 'pagination'],
            properties: {
              forms: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer', minimum: 0 },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          FormEnvelope: envelopeSchema({
            type: 'object',
            required: ['form'],
            properties: {
              form: { type: 'object', additionalProperties: true },
            },
          }),
          FormDefinitionEnvelope: envelopeSchema({
            type: 'object',
            required: ['schemaVersion', 'form', 'submitUrl'],
            properties: {
              schemaVersion: { type: 'string', const: 'backy.form-definition.v1' },
              form: { type: 'object', additionalProperties: true },
              submitUrl: { type: 'string' },
            },
          }),
          FormSubmissionsEnvelope: envelopeSchema({
            type: 'object',
            required: ['form', 'submissions', 'pagination'],
            properties: {
              form: { type: 'object', additionalProperties: true },
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
          FormContactsEnvelope: envelopeSchema({
            type: 'object',
            required: ['form', 'contacts', 'pagination'],
            properties: {
              form: { type: 'object', additionalProperties: true },
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
              status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'spam'] },
              moderationNote: { type: 'string' },
              requestId: { type: 'string' },
            },
            required: ['status'],
          },
          CommentsEnvelope: envelopeSchema({
            type: 'object',
            required: ['comments', 'count', 'pagination'],
            properties: {
              comments: { type: 'array', items: { type: 'object', additionalProperties: true } },
              count: { type: 'integer', minimum: 0 },
              pagination: { type: 'object', additionalProperties: true },
            },
          }),
          CommentEnvelope: envelopeSchema({
            type: 'object',
            required: ['comment'],
            properties: {
              comment: { type: 'object', additionalProperties: true },
            },
          }),
          CommentBulkUpdateEnvelope: envelopeSchema({
            type: 'object',
            required: ['updated'],
            properties: {
              updated: { type: 'array', items: { type: 'object', additionalProperties: true } },
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
              comment: { type: 'object', additionalProperties: true },
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
