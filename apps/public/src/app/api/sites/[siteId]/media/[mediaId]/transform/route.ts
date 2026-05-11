import { NextRequest, NextResponse } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { recordMediaDelivery } from '@/lib/mediaDeliveryAnalytics';
import { isMediaQuarantined } from '@/lib/mediaSafety';
import { publicMediaFilePath } from '@/lib/mediaResponsive';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

const MIN_WIDTH = 16;
const MAX_WIDTH = 3840;
const DEFAULT_QUALITY = 75;

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

const boundedInteger = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const { searchParams } = new URL(request.url);
    const widthParam = searchParams.get('width') || searchParams.get('w');
    const width = boundedInteger(widthParam, 0, MIN_WIDTH, MAX_WIDTH);
    const quality = boundedInteger(searchParams.get('quality') || searchParams.get('q'), DEFAULT_QUALITY, 1, 100);

    if (!widthParam || width <= 0) {
      return errorResponse(400, 'INVALID_TRANSFORM_WIDTH', `width must be between ${MIN_WIDTH} and ${MAX_WIDTH}.`, requestId);
    }

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

    if (!media || media.visibility !== 'public' || isMediaQuarantined(media)) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    if (media.type !== 'image' || !media.mimeType.startsWith('image/')) {
      return errorResponse(400, 'MEDIA_TRANSFORM_UNSUPPORTED', 'Only public image media can be transformed.', requestId);
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
    response.headers.set('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    response.headers.set('x-backy-cache-scope', 'discovery');
    response.headers.set('x-backy-request-id', requestId);
    response.headers.set('x-backy-site-id', site.id);
    response.headers.set('x-backy-media-id', media.id);
    response.headers.set('x-backy-transform-width', String(width));
    response.headers.set('x-backy-transform-quality', String(quality));
    return response;
  } catch (error) {
    console.error('Public media transform API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
