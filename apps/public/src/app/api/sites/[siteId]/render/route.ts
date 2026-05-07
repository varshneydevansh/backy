/**
 * Public render payload endpoint for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/render?path=/about
 */

import { NextRequest } from 'next/server';
import {
  getBlogPosts,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getPageByPath,
  getSiteByIdOrSlug,
  validatePreviewToken,
} from '@/lib/backyStore';
import {
  buildPublicBlogPostRenderPayload,
  buildPublicCollectionItemRenderPayload,
  buildPublicRenderPayload,
} from '@/lib/renderPayload';
import { publicContractJson } from '@/lib/publicContractResponse';
import { normalizeRoutePath } from '@/lib/routeResolver';

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const path = normalizeRoutePath(searchParams.get('path') || searchParams.get('slug') || '/');
    const previewToken = searchParams.get('previewToken');

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
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

    const dynamicItemMatch = path.match(/^\/([^/]+)\/([^/]+)$/);
    if (dynamicItemMatch) {
      const collectionSlug = decodeURIComponent(dynamicItemMatch[1]);
      const recordSlug = decodeURIComponent(dynamicItemMatch[2]);
      const collection = getCollectionByIdOrSlug(site.id, collectionSlug);
      const record = collection
        ? getCollectionRecordByIdOrSlug(site.id, collection.id, recordSlug)
        : undefined;

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
