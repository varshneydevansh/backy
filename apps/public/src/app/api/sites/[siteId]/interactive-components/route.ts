/**
 * Public interactive component registry discovery.
 *
 * GET /api/sites/[siteId]/interactive-components
 */

import { NextRequest } from 'next/server';
import { getSiteByIdOrSlug, listInteractiveComponents } from '@/lib/backyStore';
import { loadCompleteRegistryEntries, paginateRegistry, registryPageOptions, toPublicRegistryEntry } from '@/lib/interactiveRegistryDiscovery';
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    let options;
    try { options = registryPageOptions(request.url); } catch (error) { return errorResponse(400, 'INVALID_PAGINATION', (error as Error).message, requestId); }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const registryEntries = (await loadCompleteRegistryEntries((offset) => repositories.interactiveComponents.list({
        siteId: site.id,
        publicOnly: true,
        limit: 100,
        offset,
      }))).map(toPublicRegistryEntry);
      const registry = paginateRegistry(site.id, registryEntries, options);
      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'settings',
      }) || undefined;

      return publicContractJson({
        success: true,
        requestId,
        data: registry,
        registry,
        components: registry.components,
        pagination: registry.pagination,
      }, {
        requestId,
        request,
        cache: 'discovery',
        schemaVersion: registry.schemaVersion,
        siteId: site.id,
        cacheRevision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const registryEntries = listInteractiveComponents(site.id, { publicOnly: true }).map(toPublicRegistryEntry);
    const registry = paginateRegistry(site.id, registryEntries, options);

    return publicContractJson({
      success: true,
      requestId,
      data: registry,
      registry,
      components: registry.components,
      pagination: registry.pagination,
    }, {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: registry.schemaVersion,
      siteId: site.id,
    });
  } catch (error) {
    console.error('Interactive component registry API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
