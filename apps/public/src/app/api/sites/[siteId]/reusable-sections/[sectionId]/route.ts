/**
 * Public reusable section detail endpoint.
 *
 * GET /api/sites/[siteId]/reusable-sections/[sectionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReusableSectionByIdOrSlug, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
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
    const { siteId, sectionId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const section = await repositories.reusableSections.getById(site.id, sectionId) ||
        await repositories.reusableSections.getBySlug(site.id, sectionId);
      if (!section || section.status !== 'active') {
        return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          section,
        },
        section,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section || section.status !== 'active') {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        section,
      },
      section,
    });
  } catch (error) {
    console.error('Public reusable section detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
