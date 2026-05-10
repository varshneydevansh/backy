/**
 * Public frontend design contract for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/frontend-design
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { emptyFrontendDesignContract } from '@/lib/frontendDesignContract';
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

const frontendDesignResponse = (
  request: NextRequest,
  requestId: string,
  site: {
    id: string;
    slug: string;
    name: string;
    customDomain?: string | null;
    status?: string;
    isPublished?: boolean;
    settings?: {
      frontendDesign?: ReturnType<typeof emptyFrontendDesignContract> | null;
    };
  },
  cacheRevision?: string,
) => {
  const frontendDesign = site.settings?.frontendDesign || emptyFrontendDesignContract();
  const hasContract = frontendDesign.status !== 'unconfigured';
  const body = {
    success: true,
    requestId,
    data: {
      schemaVersion: 'backy.frontend-design-response.v1',
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        customDomain: site.customDomain || null,
        status: site.status || (site.isPublished ? 'published' : 'draft'),
      },
      frontendDesign,
      capabilities: {
        hasContract,
        templateCount: frontendDesign.templates.length,
        editableBindingCount: frontendDesign.editableMap.length,
        chrome: Boolean(frontendDesign.chrome?.header || frontendDesign.chrome?.navigation || frontendDesign.chrome?.footer),
        tokens: Boolean(
          frontendDesign.tokens?.colors ||
          frontendDesign.tokens?.fonts ||
          frontendDesign.tokens?.spacing ||
          frontendDesign.tokens?.customCss,
        ),
      },
      endpoints: {
        manifest: `/api/sites/${site.id}/manifest`,
        frontendDesign: `/api/sites/${site.id}/frontend-design`,
        render: `/api/sites/${site.id}/render?path=/`,
        navigation: `/api/sites/${site.id}/navigation`,
      },
    },
    siteId: site.id,
    frontendDesign,
  };

  return publicContractJson(body, {
    requestId,
    request,
    cache: 'discovery',
    schemaVersion: 'backy.frontend-design-response.v1',
    siteId: site.id,
    cacheRevision,
  });
};

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

      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
      }) || undefined;

      return frontendDesignResponse(request, requestId, site, cacheRevision);
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return frontendDesignResponse(request, requestId, site);
  } catch (error) {
    console.error('Frontend design API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
