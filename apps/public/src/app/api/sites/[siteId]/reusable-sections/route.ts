/**
 * Public reusable sections endpoint.
 *
 * GET /api/sites/[siteId]/reusable-sections
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, listReusableSections } from '@/lib/backyStore';
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
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
      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'content',
      }) || undefined;
      const sections = result.items.map(publicReusableSection);

      return publicContractJson({
        success: true,
        requestId,
        data: {
          sections,
          pagination: result.pagination,
        },
        sections,
        pagination: result.pagination,
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
    const publicSections = sections.map(publicReusableSection);

    return publicContractJson({
      success: true,
      requestId,
      data: {
        sections: publicSections,
        pagination,
      },
      sections: publicSections,
      pagination,
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public reusable sections list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
