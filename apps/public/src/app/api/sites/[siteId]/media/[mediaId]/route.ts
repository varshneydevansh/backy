/**
 * Public media detail endpoint.
 *
 * GET /api/sites/[siteId]/media/[mediaId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';

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
      errorMessage: message,
    },
    { status },
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = getMediaById(site.id, mediaId);

    if (!media || media.visibility !== 'public') {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media,
      },
      media,
    });
  } catch (error) {
    console.error('Public media detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
