import { NextRequest, NextResponse } from 'next/server';
import { MEDIA_BUFFERED_DELIVERY_MAX_BYTES, selectMediaBytes, streamMediaBytes } from '@/lib/mediaByteDelivery';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { recordMediaDelivery } from '@/lib/mediaDeliveryAnalytics';
import { mediaDeliveryCacheMetadata } from '@/lib/mediaDeliveryCache';
import { isMediaQuarantined, requiresAttachmentDelivery } from '@/lib/mediaSafety';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia } from '@/lib/mediaStorage';
import { verifySignedMediaAccess } from '@/lib/mediaSigning';
import {
  applyPublicCdnCache,
  BACKY_PUBLIC_CONTRACT_VERSION,
  PUBLIC_CDN_MAX_CACHEABLE_BYTES,
  publicContractJson,
} from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { getRepositorySitePublication } from '@/lib/repositorySitePublication';

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
      headers: { 'cdn-cache-control': 'no-store', 'vercel-cdn-cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
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

async function deliverMediaFile(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const { searchParams } = new URL(request.url);
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const site = repositories
      ? await getRepositorySitePublication(repositories.sites, siteId)
      : getSiteByIdOrSlug(siteId);

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
      // The asset ID is mutable: visibility, bytes and quarantine can change.
      'cache-control': isPrivateMedia ? 'private, no-store' : 'no-store',
      'cdn-cache-control': 'no-store',
      'vercel-cdn-cache-control': 'no-store',
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

    if (media.sizeBytes > MEDIA_BUFFERED_DELIVERY_MAX_BYTES) {
      return jsonError(413, 'MEDIA_BUFFERED_DELIVERY_TOO_LARGE', 'Buffered media delivery currently supports files up to 50 MiB.', requestId);
    }
    const storage = await getMediaStorageAdapter();
    const deliveryHeaders = {
      ...commonHeaders,
      'accept-ranges': 'bytes',
      'content-type': media.mimeType || 'application/octet-stream',
      'content-disposition': contentDispositionHeader(disposition, media.originalName || media.filename),
    };
    if (request.method === 'HEAD') {
      // Check storage existence and actual size without downloading the original.
      // Admission above remains identical to GET; Range only applies to GET.
      const item = await storage.stat(storagePath);
      if (!item) {
        return jsonError(404, 'MEDIA_FILE_NOT_FOUND', 'Media file could not be resolved from storage.', requestId);
      }
      if (!Number.isSafeInteger(item.size) || item.size < 0) {
        return jsonError(502, 'MEDIA_FILE_METADATA_INVALID', 'Media file size could not be verified from storage.', requestId);
      }
      if (item.size > MEDIA_BUFFERED_DELIVERY_MAX_BYTES) {
        return jsonError(413, 'MEDIA_BUFFERED_DELIVERY_TOO_LARGE', 'Buffered media delivery currently supports files up to 50 MiB.', requestId);
      }
      return new NextResponse(null, {
        status: 200,
        headers: { ...deliveryHeaders, 'content-length': String(item.size) },
      });
    }
    const buffer = await storage.read(storagePath);
    if (buffer.byteLength > MEDIA_BUFFERED_DELIVERY_MAX_BYTES) {
      return jsonError(413, 'MEDIA_BUFFERED_DELIVERY_TOO_LARGE', 'Buffered media delivery currently supports files up to 50 MiB.', requestId);
    }
    const selection = selectMediaBytes(request, buffer.byteLength, cacheMetadata.etag);
    if (selection.status === 416) return new NextResponse(null, {
      status: 416, headers: { ...deliveryHeaders, 'content-range': `bytes */${buffer.byteLength}`, 'content-length': '0' },
    });
    const bytesServed = selection.endExclusive - selection.start;
    if (request.method !== 'HEAD') await recordMediaDelivery({
      repositories,
      siteId: site.id,
      media,
      deliveryType: 'file',
      bytesServed,
      requestId,
    }).catch((error) => {
      console.error('Media delivery analytics update failed:', error);
    });
    const response = new NextResponse(request.method === 'HEAD' ? null : streamMediaBytes(buffer, selection.start, selection.endExclusive, request.signal), {
      status: selection.status,
      headers: {
        ...deliveryHeaders,
        'content-length': String(bytesServed),
        ...(selection.status === 206 ? { 'content-range': `bytes ${selection.start}-${selection.endExclusive - 1}/${buffer.byteLength}` } : {}),
      },
    });

    // Browser and downstream CDNs keep `no-store`. Vercel's CDN may hold a full,
    // anonymous, unconditional public 200 under purgeable site/media tags; admin
    // media mutations delete those tags, so visibility/bytes/quarantine changes
    // take effect immediately. Private, signed, ranged and conditional
    // deliveries never reach this branch with CDN caching enabled.
    if (
      !isPrivateMedia
      && !requiresAttachment
      && selection.status === 200
      && !request.headers.has('range')
      && !request.headers.has('if-none-match')
      && buffer.byteLength <= PUBLIC_CDN_MAX_CACHEABLE_BYTES
    ) {
      applyPublicCdnCache(response.headers, {
        kind: 'media',
        request,
        status: 200,
        siteId: site.id,
        mediaId: media.id,
      });
    }

    return response;
  } catch (error) {
    console.error('Public media file API error:', error);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function GET(request: NextRequest, context: RouteParams) {
  return deliverMediaFile(request, context);
}

export async function HEAD(request: NextRequest, context: RouteParams) {
  const response = await deliverMediaFile(request, context);
  // Suppress JSON error bodies too; HEAD always follows the same admission path.
  return new NextResponse(null, { status: response.status, headers: response.headers });
}
