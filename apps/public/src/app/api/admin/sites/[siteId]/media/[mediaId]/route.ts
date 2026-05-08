/**
 * Admin media detail endpoint.
 *
 * PATCH  /api/admin/sites/[siteId]/media/[mediaId]
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteMediaItem, getMediaById, getSiteByIdOrSlug, updateMediaItem } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia } from '@/lib/mediaStorage';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
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

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const deleteUploadedFile = async (
  siteId: string,
  media: { url?: string | null; metadata?: unknown },
) => {
  const storagePath = getMediaStoragePathFromMedia(siteId, media);

  if (!storagePath) {
    return;
  }

  try {
    const storage = await getMediaStorageAdapter();
    await storage.delete(storagePath);
  } catch {
    // Missing storage objects should not make catalog deletion fail.
  }
};

const stringArrayFromInput = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined
);

const metadataFromInput = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

const visibilityFromInput = (value: unknown): 'public' | 'private' | undefined => (
  value === 'public' || value === 'private' ? value : undefined
);

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      if (!await repositories.media.getById(site.id, mediaId)) {
        return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
      }

      const body = await parseJsonBody(request);
      const updated = await repositories.media.update(site.id, mediaId, {
        filename: typeof body.filename === 'string' ? body.filename : undefined,
        folderId: typeof body.folderId === 'string' || body.folderId === null ? body.folderId : undefined,
        altText: typeof body.altText === 'string' || body.altText === null ? body.altText : undefined,
        caption: typeof body.caption === 'string' || body.caption === null ? body.caption : undefined,
        visibility: visibilityFromInput(body.visibility),
        metadata: metadataFromInput(body.metadata),
        tags: stringArrayFromInput(body.tags),
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'media',
        entity: 'media',
        entityId: updated.item.id,
        reason: 'media-updated',
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { media: updated.item, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    if (!getMediaById(site.id, mediaId)) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    const body = await parseJsonBody(request);
    const media = updateMediaItem(site.id, mediaId, body);

    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { media } });
  } catch (error) {
    console.error('Admin media update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const media = await repositories.media.getById(site.id, mediaId);

      if (!media) {
        return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
      }

      await repositories.media.delete(site.id, mediaId);
      await deleteUploadedFile(site.id, media);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'media',
        entity: 'media',
        entityId: media.id,
        reason: 'media-deleted',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          mediaId,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = deleteMediaItem(site.id, mediaId);

    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    await deleteUploadedFile(site.id, media);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        mediaId,
      },
    });
  } catch (error) {
    console.error('Admin media delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
