import { NextRequest, NextResponse } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getMediaStorageAdapter, getMediaStoragePathFromUrl } from '@/lib/mediaStorage';
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

    const media = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

    if (!media) {
      return jsonError(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    const disposition = searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';
    const isPrivateMedia = (media.visibility || 'public') === 'private';
    if (isPrivateMedia && !verifySignedMediaAccess({
      siteId: site.id,
      mediaId: media.id,
      expiresAt: searchParams.get('expiresAt'),
      disposition,
      token: searchParams.get('token'),
    })) {
      return jsonError(403, 'MEDIA_SIGNATURE_INVALID', 'A valid signed media URL is required.', requestId);
    }

    const storagePath = getMediaStoragePathFromUrl(site.id, media.url);
    if (!storagePath) {
      return jsonError(404, 'MEDIA_FILE_NOT_FOUND', 'Media file could not be resolved from storage.', requestId);
    }

    const buffer = await getMediaStorageAdapter().read(storagePath);
    const response = new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': media.mimeType || 'application/octet-stream',
        'content-length': String(buffer.byteLength),
        'content-disposition': contentDispositionHeader(disposition, media.originalName || media.filename),
        'cache-control': isPrivateMedia ? 'private, max-age=60' : 'public, max-age=31536000, immutable',
        'x-backy-cache-scope': isPrivateMedia ? 'private' : 'discovery',
        'x-backy-request-id': requestId,
        'x-backy-site-id': site.id,
        'x-backy-media-id': media.id,
      },
    });

    return response;
  } catch (error) {
    console.error('Public media file API error:', error);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
