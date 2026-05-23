import { NextRequest, NextResponse } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { recordMediaDelivery } from '@/lib/mediaDeliveryAnalytics';
import { mediaDeliveryCacheMetadata } from '@/lib/mediaDeliveryCache';
import { isMediaQuarantined, requiresAttachmentDelivery } from '@/lib/mediaSafety';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia } from '@/lib/mediaStorage';
import { verifySignedMediaAccess } from '@/lib/mediaSigning';
import { BACKY_PUBLIC_CONTRACT_VERSION, publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const MEDIA_FILE_SCHEMA_VERSION = 'backy.media-file.v1';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const jsonError = (status: number, code: string, message: string, requestId: string) => (
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
      schemaVersion: MEDIA_FILE_SCHEMA_VERSION,
    },
  )
);

const contentDispositionHeader = (disposition: string, filename: string) => {
  const safeFilename = filename.replace(/["\r\n]/g, '_') || 'download';
  return `${disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${safeFilename}"`;
};

const parseContentDisposition = (value: string | null): { value: 'inline' | 'attachment'; invalid?: string } => {
  if (value === null || value.trim().length === 0) {
    return { value: 'inline' };
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'inline' || normalized === 'attachment') {
    return { value: normalized };
  }

  return { value: 'inline', invalid: value };
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

    const dispositionParam = parseContentDisposition(searchParams.get('disposition'));
    if (dispositionParam.invalid) {
      return jsonError(400, 'INVALID_MEDIA_DISPOSITION', 'Invalid media disposition. Use inline or attachment.', requestId);
    }
    const requestedDisposition = dispositionParam.value;
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

    const cacheMetadata = mediaDeliveryCacheMetadata(request, site.id, media, {
      delivery: 'file',
      disposition,
    });
    const commonHeaders = {
      'cache-control': isPrivateMedia ? 'private, max-age=60' : 'public, max-age=31536000, immutable',
      vary: 'Accept, Origin',
      'x-content-type-options': 'nosniff',
      'x-backy-cache-scope': isPrivateMedia ? 'private' : 'discovery',
      'x-backy-cache-revision': cacheMetadata.cacheRevision,
      'x-backy-contract-version': BACKY_PUBLIC_CONTRACT_VERSION,
      'x-backy-schema-version': MEDIA_FILE_SCHEMA_VERSION,
      'x-backy-request-id': requestId,
      'x-backy-site-id': site.id,
      'x-backy-media-id': media.id,
      etag: cacheMetadata.etag,
      ...(requiresAttachment ? { 'x-backy-media-delivery-policy': 'attachment-only' } : {}),
    };

    if (cacheMetadata.notModified) {
      return new NextResponse(null, {
        status: 304,
        headers: commonHeaders,
      });
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
        ...commonHeaders,
        'content-type': media.mimeType || 'application/octet-stream',
        'content-length': String(buffer.byteLength),
        'content-disposition': contentDispositionHeader(disposition, media.originalName || media.filename),
      },
    });

    return response;
  } catch (error) {
    console.error('Public media file API error:', error);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
