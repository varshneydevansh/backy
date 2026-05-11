import { NextRequest, NextResponse } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { recordMediaDelivery } from '@/lib/mediaDeliveryAnalytics';
import { isMediaQuarantined, requiresAttachmentDelivery } from '@/lib/mediaSafety';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia } from '@/lib/mediaStorage';
import { verifySignedMediaAccess } from '@/lib/mediaSigning';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const jsonError = (status: number, code: string, message: string, requestId: string) => {
  const response = NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  );
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-backy-cache-scope', 'private');
  response.headers.set('x-backy-request-id', requestId);
  return response;
};

const contentDispositionHeader = (disposition: string, filename: string) => {
  const safeFilename = filename.replace(/["\r\n]/g, '_') || 'download';
  return `${disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${safeFilename}"`;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const { searchParams } = new URL(request.url);
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return jsonError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const publishState = site as { isPublished?: boolean; status?: string };
    if (publishState.isPublished === false || (publishState.isPublished === undefined && publishState.status !== 'published')) {
      return jsonError(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

    if (!media) {
      return jsonError(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    if (isMediaQuarantined(media)) {
      return jsonError(423, 'MEDIA_QUARANTINED', 'This media asset is quarantined and cannot be delivered.', requestId);
    }

    const requestedDisposition = searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';
    const requiresAttachment = requiresAttachmentDelivery(media);
    const disposition = requiresAttachment ? 'attachment' : requestedDisposition;
    const isPrivateMedia = (media.visibility || 'public') === 'private';
    if (isPrivateMedia && !verifySignedMediaAccess({
      siteId: site.id,
      mediaId: media.id,
      expiresAt: searchParams.get('expiresAt'),
      disposition: requestedDisposition,
      token: searchParams.get('token'),
    })) {
      return jsonError(403, 'MEDIA_SIGNATURE_INVALID', 'A valid signed media URL is required.', requestId);
    }

    const storagePath = getMediaStoragePathFromMedia(site.id, media);
    if (!storagePath) {
      return jsonError(404, 'MEDIA_FILE_NOT_FOUND', 'Media file could not be resolved from storage.', requestId);
    }

    const storage = await getMediaStorageAdapter();
    const buffer = await storage.read(storagePath);
    await recordMediaDelivery({
      repositories,
      siteId: site.id,
      media,
      deliveryType: 'file',
      bytesServed: buffer.byteLength,
      requestId,
    }).catch((error) => {
      console.error('Media delivery analytics update failed:', error);
    });
    const response = new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': media.mimeType || 'application/octet-stream',
        'content-length': String(buffer.byteLength),
        'content-disposition': contentDispositionHeader(disposition, media.originalName || media.filename),
        'cache-control': isPrivateMedia ? 'private, max-age=60' : 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'x-backy-cache-scope': isPrivateMedia ? 'private' : 'discovery',
        'x-backy-request-id': requestId,
        'x-backy-site-id': site.id,
        'x-backy-media-id': media.id,
        ...(requiresAttachment ? { 'x-backy-media-delivery-policy': 'attachment-only' } : {}),
      },
    });

    return response;
  } catch (error) {
    console.error('Public media file API error:', error);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
