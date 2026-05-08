/**
 * Public media detail endpoint.
 *
 * GET /api/sites/[siteId]/media/[mediaId]
 */

import { NextRequest } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { withResponsiveMediaManifest } from '@/lib/mediaResponsive';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
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
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const media = await repositories.media.getById(site.id, mediaId);

      if (!media || media.visibility !== 'public') {
        return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
      }
      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'media',
      }) || undefined;

      const mediaWithVariants = withResponsiveMediaManifest(site.id, media);

      return publicContractJson({
        success: true,
        requestId,
        data: {
          media: mediaWithVariants,
        },
        media: mediaWithVariants,
      }, {
        requestId,
        request,
        cache: 'discovery',
        siteId: site.id,
        cacheRevision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = getMediaById(site.id, mediaId);

    if (!media || media.visibility !== 'public') {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    const mediaWithVariants = withResponsiveMediaManifest(site.id, media);

    return publicContractJson({
      success: true,
      requestId,
      data: {
        media: mediaWithVariants,
      },
      media: mediaWithVariants,
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public media detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
