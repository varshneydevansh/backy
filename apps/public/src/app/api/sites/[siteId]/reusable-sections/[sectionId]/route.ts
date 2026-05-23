/**
 * Public reusable section detail endpoint.
 *
 * GET /api/sites/[siteId]/reusable-sections/[sectionId]
 */

import { NextRequest } from 'next/server';
import { getReusableSectionByIdOrSlug, getSiteByIdOrSlug } from '@/lib/backyStore';
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

const reusableSectionFrontendDesign = (section: { metadata?: unknown }) => (
  frontendDesignProvenanceFromMetadata(section.metadata)
);

const publicReusableSection = <TSection extends { metadata?: Record<string, unknown> }>(section: TSection) => ({
  ...section,
  frontendDesign: reusableSectionFrontendDesign(section),
});

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
      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'content',
      }) || undefined;

      return publicContractJson({
        success: true,
        requestId,
        data: {
          section: publicReusableSection(section),
        },
        section: publicReusableSection(section),
      }, {
        requestId,
        request,
        cache: 'discovery',
        siteId: site.id,
        cacheRevision,
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

    return publicContractJson({
      success: true,
      requestId,
      data: {
        section: publicReusableSection(section),
      },
      section: publicReusableSection(section),
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public reusable section detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
