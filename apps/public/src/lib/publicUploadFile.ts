import { NextRequest, NextResponse } from 'next/server';
import type { MediaItem } from '@backy-cms/core';
import { getMediaList, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia } from '@/lib/mediaStorage';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export interface PublicUploadRouteParams {
  path?: string[];
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => {
  const response = NextResponse.json({
    success: false,
    requestId,
    error: { code, message },
  }, { status });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-backy-cache-scope', 'error');
  response.headers.set('x-backy-request-id', requestId);
  return response;
};

const toStoragePath = (parts: string[] | undefined) => {
  if (!parts || parts.length < 3 || parts[0] !== 'sites') {
    return null;
  }

  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('/'))) {
    return null;
  }

  return parts.join('/');
};

const mediaMatchesStoragePath = (siteId: string, media: MediaItem, storagePath: string) => (
  getMediaStoragePathFromMedia(siteId, media) === storagePath
);

const findPublicMediaForStoragePath = async (siteId: string, storagePath: string) => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

    if (!site || !site.isPublished) {
      return { site: null, media: null };
    }

    const result = await repositories.media.list({
      siteId: site.id,
      visibility: 'public',
      type: 'all',
      limit: 1000,
      offset: 0,
    });
    const media = result.items.find((item) => mediaMatchesStoragePath(site.id, item, storagePath)) || null;
    return { site, media };
  }

  const site = getSiteByIdOrSlug(siteId);
  if (!site || !site.isPublished) {
    return { site: null, media: null };
  }

  const result = getMediaList(site.id, {
    visibility: 'public',
    limit: 1000,
    offset: 0,
  });
  const media = result.media.find((item) => mediaMatchesStoragePath(site.id, item, storagePath)) || null;
  return { site, media };
};

export async function handlePublicUploadFile(request: NextRequest, params: PublicUploadRouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const storagePath = toStoragePath(params.path);
    const siteId = params.path?.[1] || '';

    if (!storagePath || !siteId) {
      return errorResponse(404, 'MEDIA_FILE_NOT_FOUND', 'Media file not found', requestId);
    }

    const { site, media } = await findPublicMediaForStoragePath(siteId, storagePath);
    if (!site || !media) {
      return errorResponse(404, 'MEDIA_FILE_NOT_FOUND', 'Media file not found', requestId);
    }

    const storage = await getMediaStorageAdapter();
    const buffer = await storage.read(storagePath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': media.mimeType || 'application/octet-stream',
        'content-length': String(buffer.byteLength),
        'cache-control': 'public, max-age=31536000, immutable',
        'x-backy-cache-scope': 'discovery',
        'x-backy-request-id': requestId,
        'x-backy-site-id': site.id,
        'x-backy-media-id': media.id,
      },
    });
  } catch (error) {
    console.error('Public upload file API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
