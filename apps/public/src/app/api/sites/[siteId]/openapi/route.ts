/**
 * Site-scoped public OpenAPI document for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/openapi
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listCollections, listFormsBySite } from '@/lib/backyStore';

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
    },
    { status },
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const origin = new URL(request.url).origin;
    const collections = listCollections(site.id);
    const forms = listFormsBySite(site.id);
    const collectionIds = collections.map((collection) => collection.id);
    const formIds = forms.map((form) => form.id);

    return NextResponse.json({
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
        [`/api/sites/${site.id}/forms`]: {
          get: {
            tags: ['Interactions'],
            summary: 'List site forms',
            operationId: 'listBackyForms',
            responses: {
              '200': {
                description: 'Form definitions',
              },
            },
          },
        },
        [`/api/sites/${site.id}/forms/{formId}/submissions`]: {
          post: {
            tags: ['Interactions'],
            summary: 'Submit a Backy form',
            operationId: 'submitBackyForm',
            parameters: [
              {
                name: 'formId',
                in: 'path',
                required: true,
                schema: { type: 'string', enum: formIds.length > 0 ? formIds : undefined },
              },
            ],
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
              },
              '400': {
                description: 'Validation error',
              },
            },
          },
        },
        [`/api/sites/${site.id}/pages/{pageId}/comments`]: {
          post: {
            tags: ['Interactions'],
            summary: 'Submit a page comment',
            operationId: 'submitBackyPageComment',
            parameters: [
              {
                name: 'pageId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '201': {
                description: 'Comment accepted',
              },
            },
          },
        },
        [`/api/sites/${site.id}/blog/{postId}/comments`]: {
          post: {
            tags: ['Interactions'],
            summary: 'Submit a blog post comment',
            operationId: 'submitBackyBlogComment',
            parameters: [
              {
                name: 'postId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '201': {
                description: 'Comment accepted',
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
              route: { type: 'object', additionalProperties: true },
              navigation: { type: 'object', additionalProperties: true },
            },
          }),
          NavigationEnvelope: envelopeSchema({
            type: 'object',
            required: ['site', 'navigation'],
            properties: {
              site: { type: 'object', additionalProperties: true },
              navigation: { type: 'object', additionalProperties: true },
            },
          }),
          MediaList: {
            type: 'object',
            required: ['media', 'pagination'],
            properties: {
              media: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
      'x-backy': {
        requestId,
        siteId: site.id,
        siteSlug: site.slug,
        contractVersion: 'backy.ai-frontend.v1',
        collectionIds,
        formIds,
      },
    });
  } catch (error) {
    console.error('OpenAPI API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
