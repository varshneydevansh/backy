/**
 * Admin site navigation endpoint.
 *
 * GET   /api/admin/sites/[siteId]/navigation
 * PATCH /api/admin/sites/[siteId]/navigation
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SiteSettings } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getPageSummary,
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import { buildSiteNavigation, normalizeNavigationConfig } from '@/lib/navigation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type NavigationConfig = SiteSettings['navigation'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const collectPageIds = (items: NavigationConfig['primary'], pageIds = new Set<string>()) => {
  for (const item of items) {
    if (item.type === 'page' && item.pageId) {
      pageIds.add(item.pageId);
    }

    if (Array.isArray(item.children)) {
      collectPageIds(item.children, pageIds);
    }
  }

  return pageIds;
};

const collectIncompletePageItems = (
  items: NavigationConfig['primary'],
  ids = new Set<string>(),
) => {
  for (const item of items) {
    if (item.type === 'page' && !item.pageId) {
      ids.add(item.id || item.label || 'page');
    }

    if (Array.isArray(item.children)) {
      collectIncompletePageItems(item.children, ids);
    }
  }

  return ids;
};

const missingPageIds = (navigation: NavigationConfig, availablePageIds: Set<string>) => (
  Array.from(new Set([
    ...collectPageIds(navigation.primary),
    ...collectPageIds(navigation.footer || []),
  ])).filter((pageId) => !availablePageIds.has(pageId))
);

const incompletePageItems = (navigation: NavigationConfig) => Array.from(new Set([
  ...collectIncompletePageItems(navigation.primary),
  ...collectIncompletePageItems(navigation.footer || []),
]));

const requestNavigationInput = (body: Record<string, unknown>) => (
  body.navigation && typeof body.navigation === 'object' && !Array.isArray(body.navigation)
    ? body.navigation
    : body
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'sites.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const pages = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: {
            id: site.id,
            slug: site.slug,
            name: site.name,
          },
          navigation: {
            settings: site.settings.navigation,
            resolved: buildSiteNavigation(site.settings, pages.items),
          },
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const pages = getPageSummary(site.id, { includeUnpublished: true });
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
        },
        navigation: {
          settings: site.settings?.navigation || { primary: [], footer: [] },
          resolved: buildSiteNavigation(site.settings, pages),
        },
      },
    });
  } catch (error) {
    console.error('Admin site navigation API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'sites.configure' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const navigationInput = requestNavigationInput(body);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const navigation = normalizeNavigationConfig(navigationInput, site.settings.navigation);
      const pages = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        limit: 100,
        offset: 0,
      });
      const incomplete = incompletePageItems(navigation);
      if (incomplete.length > 0) {
        return errorResponse(400, 'NAVIGATION_VALIDATION', 'Page navigation items require pageId values', requestId, { items: incomplete });
      }

      const missing = missingPageIds(navigation, new Set(pages.items.map((page) => page.id)));
      if (missing.length > 0) {
        return errorResponse(400, 'NAVIGATION_VALIDATION', 'Navigation references pages that do not exist on this site', requestId, { pageIds: missing });
      }

      const updated = await repositories.sites.update(site.id, {
        settings: {
          ...site.settings,
          navigation,
        },
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'navigation',
        entity: 'site',
        entityId: site.id,
        reason: 'site-navigation-updated',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: {
            id: updated.item.id,
            slug: updated.item.slug,
            name: updated.item.name,
          },
          navigation: {
            settings: updated.item.settings.navigation,
            resolved: buildSiteNavigation(updated.item.settings, pages.items),
          },
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const navigation = normalizeNavigationConfig(navigationInput, site.settings?.navigation);
    const pages = getPageSummary(site.id, { includeUnpublished: true });
    const incomplete = incompletePageItems(navigation);
    if (incomplete.length > 0) {
      return errorResponse(400, 'NAVIGATION_VALIDATION', 'Page navigation items require pageId values', requestId, { items: incomplete });
    }

    const missing = missingPageIds(navigation, new Set(pages.map((page) => page.id)));
    if (missing.length > 0) {
      return errorResponse(400, 'NAVIGATION_VALIDATION', 'Navigation references pages that do not exist on this site', requestId, { pageIds: missing });
    }

    const updated = updateAdminSite(site.id, {
      settings: {
        ...(site.settings || {}),
        navigation,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: {
          id: updated.id,
          slug: updated.slug,
          name: updated.name,
        },
        navigation: {
          settings: updated.settings?.navigation || navigation,
          resolved: buildSiteNavigation(updated.settings, pages),
        },
      },
    });
  } catch (error) {
    console.error('Admin site navigation update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
