/**
 * Public CMS collection detail endpoint.
 *
 * GET /api/sites/[siteId]/collections/[collectionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollectionByIdOrSlug, getSiteByIdOrSlug } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
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
    const { siteId, collectionId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId);
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collection,
      },
      collection,
    });
  } catch (error) {
    console.error('Public collection detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
