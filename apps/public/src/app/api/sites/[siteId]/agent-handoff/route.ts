/**
 * Public AI/custom frontend builder handoff.
 *
 * GET /api/sites/[siteId]/agent-handoff
 */

import { NextRequest } from 'next/server';
import { buildCustomFrontendAgentHandoff } from '@/lib/customFrontendAgentHandoff';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type HandoffSite = {
  id: string;
  slug: string;
  name: string;
  customDomain?: string | null;
  settings?: {
    domainVerification?: {
      domain?: string | null;
    } | null;
    domainAliases?: Array<{ host?: string | null; status?: string | null }> | null;
  } | null;
  status?: string;
  isPublished?: boolean;
};

const RESPONSE_SCHEMA = 'backy.custom-frontend-agent-handoff-response.v1';

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

const agentHandoffResponse = (
  request: NextRequest,
  requestId: string,
  site: HandoffSite,
  cacheRevision?: string,
) => {
  const handoff = buildCustomFrontendAgentHandoff(site.id, {
    slug: site.slug,
    customDomain: site.customDomain,
    domainVerificationDomain: site.settings?.domainVerification?.domain,
    domainAliases: site.settings?.domainAliases || [],
  });
  const body = {
    success: true,
    requestId,
    data: {
      schemaVersion: RESPONSE_SCHEMA,
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        customDomain: site.customDomain || null,
        status: site.status || (site.isPublished ? 'published' : 'draft'),
      },
      readStart: {
        endpoint: handoff.endpoints.agentHandoff,
        manifestPointer: 'data.contract.customFrontendAgentHandoff',
        openApiPointer: 'x-backy-custom-frontend-agent-handoff',
        agentBriefPointer: 'data.agentBrief',
        docs: handoff.docs.map((doc) => doc.path),
      },
      agentBrief: handoff.agentBrief,
      handoff,
      apiAlignment: handoff.apiAlignment,
      componentApiContract: handoff.componentApiContract,
      routing: handoff.routing,
      deploymentTopology: handoff.deploymentTopology,
      canvasFirst: handoff.contentCreation.canvasFirst,
      designState: handoff.designState,
      contentCreation: handoff.contentCreation,
    },
    siteId: site.id,
    customFrontendAgentHandoff: handoff,
  };

  return publicContractJson(body, {
    requestId,
    request,
    cache: 'discovery',
    schemaVersion: RESPONSE_SCHEMA,
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

      return agentHandoffResponse(request, requestId, site, cacheRevision);
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return agentHandoffResponse(request, requestId, site);
  } catch (error) {
    console.error('Custom frontend agent handoff API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
