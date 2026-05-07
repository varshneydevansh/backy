/**
 * Public reusable sections endpoint.
 *
 * GET /api/sites/[siteId]/reusable-sections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listReusableSections } from '@/lib/backyStore';
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
    const { searchParams } = new URL(request.url);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const result = await repositories.reusableSections.list({
        siteId: site.id,
        status: 'active',
        category: searchParams.get('category') || undefined,
        tag: searchParams.get('tag') || undefined,
        search: searchParams.get('search') || undefined,
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sections: result.items,
          pagination: result.pagination,
        },
        sections: result.items,
        pagination: result.pagination,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const sections = listReusableSections(site.id, {
      status: 'active',
      category: searchParams.get('category') || undefined,
      tag: searchParams.get('tag') || undefined,
      search: searchParams.get('search') || undefined,
    });
    const pagination = {
      total: sections.length,
      limit: sections.length,
      offset: 0,
      hasMore: false,
    };

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sections,
        pagination,
      },
      sections,
      pagination,
    });
  } catch (error) {
    console.error('Public reusable sections list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
