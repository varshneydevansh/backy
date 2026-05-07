/**
 * Admin media detail endpoint.
 *
 * PATCH  /api/admin/sites/[siteId]/media/[mediaId]
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteMediaItem, getMediaById, getSiteByIdOrSlug, updateMediaItem } from '@/lib/backyStore';
import { getMediaStorageAdapter, getMediaStoragePathFromUrl } from '@/lib/mediaStorage';

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

const deleteUploadedFile = async (siteId: string, url: string | null | undefined) => {
  const storagePath = getMediaStoragePathFromUrl(siteId, url);

  if (!storagePath) {
    return;
  }

  try {
    await getMediaStorageAdapter().delete(storagePath);
  } catch {
    // Missing storage objects should not make catalog deletion fail.
  }
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
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
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = deleteMediaItem(site.id, mediaId);

    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    await deleteUploadedFile(site.id, media.url);

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
