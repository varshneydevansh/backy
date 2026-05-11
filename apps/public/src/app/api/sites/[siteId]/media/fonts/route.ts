/**
 * Public font manifest for custom frontends.
 *
 * GET /api/sites/[siteId]/media/fonts
 */

import { NextRequest } from 'next/server';
import { getMediaList, getSiteByIdOrSlug } from '@/lib/backyStore';
import { buildPublicFontManifest } from '@/lib/fontManifest';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const result = await repositories.media.list({
        siteId: site.id,
        type: 'font',
        visibility: 'public',
        limit: 10000,
        offset: 0,
      });
      const manifest = buildPublicFontManifest(site.id, result.items);
      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'media',
      }) || undefined;

      return publicContractJson({
        success: true,
        requestId,
        data: manifest,
        ...manifest,
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

    const fonts = getMediaList(site.id, {
      type: 'font',
      visibility: 'public',
      limit: 10000,
    }).media;
    const manifest = buildPublicFontManifest(site.id, fonts);

    return publicContractJson({
      success: true,
      requestId,
      data: manifest,
      ...manifest,
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public font manifest API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
