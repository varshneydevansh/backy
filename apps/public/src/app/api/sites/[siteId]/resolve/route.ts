/**
 * Public route resolver for custom frontends.
 *
 * GET /api/sites/[siteId]/resolve?path=/about
 */

import { NextRequest } from 'next/server';
import type { Site } from '@backy-cms/core';
import { getSiteByIdOrSlug, getSiteNavigation } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeRoutePath, resolveSiteRoute } from '@/lib/routeResolver';
import { buildSiteNavigation } from '@/lib/navigation';
import type { ResolvedRedirectRoute } from '@/lib/redirectRules';
import {
  canonicalPathForRepositoryPage,
  isRepositoryContentPubliclyReadable,
  repositorySiteStatus,
  resolveRepositorySiteRoute,
} from '@/lib/repositoryRouteResolver';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, path?: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      data: path
        ? {
            route: {
              type: 'notFound',
              path,
              status: 'archived',
              canonical: path,
              params: {},
            },
          }
        : undefined,
    },
    { status, requestId, cache: 'error' },
  )
);

const redirectRouteResponse = (
  request: Request,
  route: ResolvedRedirectRoute,
  site: { id: string; slug: string; name: string; status: string },
  requestId: string,
  options: { previewToken?: string | null; cacheRevision?: string } = {},
) => {
  const isGone = route.type === 'gone';

  return publicContractJson(
    {
      success: !isGone,
      requestId,
      ...(isGone
        ? {
            error: {
              code: 'ROUTE_GONE',
              message: 'Route is gone',
            },
          }
        : {}),
      data: {
        site,
        route,
        navigation: {
          primary: [],
        },
      },
    },
    {
      status: isGone ? 410 : 200,
      requestId,
      request,
      cache: options.previewToken ? 'private' : 'discovery',
      siteId: site.id,
      cacheRevision: options.cacheRevision,
    },
  );
};

const repositoryNavigation = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  site: Site,
) => {
  const result = await repositories.pages.list({
    siteId: site.id,
    includeUnpublished: false,
    status: 'published',
    limit: 100,
    offset: 0,
  });

  return buildSiteNavigation(site.settings, result.items.filter(isRepositoryContentPubliclyReadable).map((page) => ({
    ...page,
    meta: {
      ...page.meta,
      canonical: canonicalPathForRepositoryPage(page),
    },
  })));
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const path = normalizeRoutePath(searchParams.get('path') || searchParams.get('slug') || '/');
    const previewToken = searchParams.get('previewToken');

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId, path);
      }
      const cacheRevision = previewToken
        ? undefined
        : await repositories.cacheInvalidations.latestRevision({ siteId: site.id }) || undefined;

      const route = await resolveRepositorySiteRoute(repositories, site, path, { previewToken });
      if (!route) {
        return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
      }

      if (route.type === 'redirect' || route.type === 'gone') {
        return redirectRouteResponse(request, route, {
          id: site.id,
          slug: site.slug,
          name: site.name,
          status: repositorySiteStatus(site),
        }, requestId, { previewToken, cacheRevision });
      }

      return publicContractJson({
        success: true,
        requestId,
        data: {
          site: {
            id: site.id,
            slug: site.slug,
            name: site.name,
            status: repositorySiteStatus(site),
          },
          route,
          navigation: await repositoryNavigation(repositories, site),
        },
      }, {
        requestId,
        request,
        cache: previewToken ? 'private' : 'discovery',
        siteId: site.id,
        cacheRevision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId, path);
    }

    const route = resolveSiteRoute(site, path, { previewToken });
    if (!route) {
      return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
    }

    if (route.type === 'redirect' || route.type === 'gone') {
      return redirectRouteResponse(request, route, {
        id: site.id,
        slug: site.slug,
        name: site.name,
        status: site.status,
      }, requestId, { previewToken });
    }

    return publicContractJson({
      success: true,
      requestId,
      data: {
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
          status: site.status,
        },
        route,
        navigation: getSiteNavigation(site.id),
      },
    }, {
      requestId,
      request,
      cache: previewToken ? 'private' : 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Route resolve API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
