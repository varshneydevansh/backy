/**
 * Public CMS collections endpoint.
 *
 * GET /api/sites/[siteId]/collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listCollections } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
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
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collections = listCollections(site.id);
    const pagination = {
      total: collections.length,
      limit: collections.length,
      offset: 0,
      hasMore: false,
    };

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collections,
        pagination,
      },
      collections,
      pagination,
    });
  } catch (error) {
    console.error('Public collections list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
