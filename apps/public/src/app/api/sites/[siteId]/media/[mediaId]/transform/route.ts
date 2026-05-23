import { NextRequest, NextResponse } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { recordMediaDelivery } from '@/lib/mediaDeliveryAnalytics';
import { mediaDeliveryCacheMetadata } from '@/lib/mediaDeliveryCache';
import { isMediaQuarantined } from '@/lib/mediaSafety';
import { publicMediaFilePath } from '@/lib/mediaResponsive';
import { BACKY_PUBLIC_CONTRACT_VERSION, publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

export const runtime = 'nodejs';

const MIN_WIDTH = 16;
const MAX_WIDTH = 3840;
const DEFAULT_QUALITY = 75;
const MEDIA_TRANSFORM_SCHEMA_VERSION = 'backy.media-transform.v1';

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
    {
      status,
      requestId,
      cache: 'error',
      schemaVersion: MEDIA_TRANSFORM_SCHEMA_VERSION,
    },
  )
);

const boundedInteger = (
  value: string | null,
  fallback: number | null,
  min: number,
  max: number,
): { value: number; invalid?: string } => {
  if (value === null || value.trim().length === 0) {
    return fallback === null ? { value: 0, invalid: value ?? '' } : { value: fallback };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { value: 0, invalid: value };
  }

  return { value: parsed };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const { searchParams } = new URL(request.url);
    const widthParam = searchParams.get('width') || searchParams.get('w');
    const widthResult = boundedInteger(widthParam, null, MIN_WIDTH, MAX_WIDTH);
    const qualityResult = boundedInteger(searchParams.get('quality') || searchParams.get('q'), DEFAULT_QUALITY, 1, 100);

    if (widthResult.invalid !== undefined) {
      return errorResponse(400, 'INVALID_TRANSFORM_WIDTH', `width must be between ${MIN_WIDTH} and ${MAX_WIDTH}.`, requestId);
    }
    if (qualityResult.invalid !== undefined) {
      return errorResponse(400, 'INVALID_TRANSFORM_QUALITY', 'quality must be between 1 and 100.', requestId);
    }
    const width = widthResult.value;
    const quality = qualityResult.value;

    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    const publishState = site as { isPublished?: boolean; status?: string } | null;
    if (!site || (publishState?.isPublished === false || (publishState?.isPublished === undefined && publishState?.status !== 'published'))) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

    if (!media || media.visibility !== 'public') {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    if (isMediaQuarantined(media)) {
      return errorResponse(423, 'MEDIA_QUARANTINED', 'This media asset is quarantined and cannot be transformed.', requestId);
    }

    if (media.type !== 'image' || !media.mimeType.startsWith('image/')) {
      return errorResponse(400, 'MEDIA_TRANSFORM_UNSUPPORTED', 'Only public image media can be transformed.', requestId);
    }

    const cacheMetadata = mediaDeliveryCacheMetadata(request, site.id, media, {
      delivery: 'optimizer-transform',
      width,
      quality,
    });
    const commonHeaders = {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      vary: 'Accept, Origin',
      'x-backy-cache-scope': 'discovery',
      'x-backy-cache-revision': cacheMetadata.cacheRevision,
      'x-backy-contract-version': BACKY_PUBLIC_CONTRACT_VERSION,
      'x-backy-schema-version': MEDIA_TRANSFORM_SCHEMA_VERSION,
      'x-backy-request-id': requestId,
      'x-backy-site-id': site.id,
      'x-backy-media-id': media.id,
      'x-backy-transform-width': String(width),
      'x-backy-transform-quality': String(quality),
      etag: cacheMetadata.etag,
    };

    if (cacheMetadata.notModified) {
      return new NextResponse(null, {
        status: 304,
        headers: commonHeaders,
      });
    }

    await recordMediaDelivery({
      repositories,
      siteId: site.id,
      media,
      deliveryType: 'optimizer-transform',
      width,
      quality,
      requestId,
    }).catch((error) => {
      console.error('Media transform analytics update failed:', error);
    });

    const transformUrl = new URL('/_next/image', request.url);
    transformUrl.searchParams.set('url', publicMediaFilePath(site.id, media.id));
    transformUrl.searchParams.set('w', String(width));
    transformUrl.searchParams.set('q', String(quality));

    const response = NextResponse.redirect(transformUrl, 307);
    Object.entries(commonHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  } catch (error) {
    console.error('Public media transform API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
