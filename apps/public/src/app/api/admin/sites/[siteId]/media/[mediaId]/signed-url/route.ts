import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { isMediaQuarantined } from '@/lib/mediaSafety';
import { buildSignedMediaPath, createSignedMediaAccess } from '@/lib/mediaSigning';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

const MIN_SIGNED_URL_EXPIRES_IN_SECONDS = 30;
const MAX_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

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

const parseSignedUrlDisposition = (value: unknown): { value?: 'inline' | 'attachment'; invalid?: boolean } => {
  if (value === undefined || value === null || value === '') {
    return {};
  }

  if (value === 'inline' || value === 'attachment') {
    return { value };
  }

  return { invalid: true };
};

const parseSignedUrlExpiresIn = (value: unknown): { value?: number; invalid?: boolean } => {
  if (value === undefined || value === null || value === '') {
    return {};
  }

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_SIGNED_URL_EXPIRES_IN_SECONDS ||
    parsed > MAX_SIGNED_URL_EXPIRES_IN_SECONDS
  ) {
    return { invalid: true };
  }

  return { value: parsed };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'media.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId } = await params;
    const body = await parseJsonBody(request);
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    if (isMediaQuarantined(media)) {
      return errorResponse(423, 'MEDIA_QUARANTINED', 'Quarantined media cannot generate signed delivery URLs.', requestId);
    }

    const disposition = parseSignedUrlDisposition(body.disposition);
    if (disposition.invalid) {
      return errorResponse(400, 'INVALID_MEDIA_DISPOSITION', 'Invalid media disposition. Use inline or attachment.', requestId);
    }
    const expiresIn = parseSignedUrlExpiresIn(body.expiresInSeconds);
    if (expiresIn.invalid) {
      return errorResponse(400, 'INVALID_MEDIA_EXPIRY', 'expiresInSeconds must be an integer from 30 to 3600.', requestId);
    }

    const signedAccess = createSignedMediaAccess({
      siteId: site.id,
      mediaId: media.id,
      expiresInSeconds: expiresIn.value,
      disposition: disposition.value,
    });
    const path = buildSignedMediaPath({
      siteId: site.id,
      mediaId: media.id,
      ...signedAccess,
    });
    const url = new URL(path, request.url).toString();

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media: {
          id: media.id,
          siteId: media.siteId,
          filename: media.filename,
          originalName: media.originalName,
          mimeType: media.mimeType,
          visibility: media.visibility || 'public',
        },
        signedUrl: url,
        path,
        expiresAt: signedAccess.expiresAt,
        disposition: signedAccess.disposition,
      },
    });
  } catch (error) {
    console.error('Admin media signed URL API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
