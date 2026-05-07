/**
 * Public CMS collections endpoint.
 *
 * GET /api/sites/[siteId]/collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listCollections } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const payload = await repositories.collections.list({
        siteId: site.id,
        includeUnpublished: false,
        status: 'published',
        limit: 100,
        offset: 0,
      });
      const collections = payload.items.filter((collection) => collection.permissions.publicRead);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          collections,
          pagination: {
            ...payload.pagination,
            total: collections.length,
            hasMore: false,
          },
        },
        collections,
        pagination: {
          ...payload.pagination,
          total: collections.length,
          hasMore: false,
        },
      });
    }

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
