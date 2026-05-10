/**
 * Admin frontend design contract endpoint.
 *
 * GET   /api/admin/sites/[siteId]/frontend-design
 * PATCH /api/admin/sites/[siteId]/frontend-design
 * POST  /api/admin/sites/[siteId]/frontend-design with { action: "capture-site-defaults" }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Site, SiteSettings } from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getPageSummary,
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation, type PublicCacheInvalidation } from '@/lib/cacheInvalidation';
import {
  buildSiteDefaultFrontendDesignContract,
  emptyFrontendDesignContract,
  normalizeFrontendDesignContract,
} from '@/lib/frontendDesignContract';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({
    success: false,
    requestId,
    error: { code, message },
  }, { status })
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

const toPageTemplates = (pages: Array<{ id: string; title: string; slug: string }>) => (
  pages.slice(0, 12).map((page) => ({
    id: page.id,
    title: page.title,
    slug: page.slug,
    type: 'page' as const,
  }))
);

const responseForSite = (
  requestId: string,
  site: Pick<Site, 'id' | 'slug' | 'name' | 'customDomain' | 'theme' | 'settings'>,
  options: {
    cacheInvalidation?: PublicCacheInvalidation | null;
  } = {},
) => {
  const frontendDesign = site.settings?.frontendDesign || emptyFrontendDesignContract();

  return NextResponse.json({
    success: true,
    requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        customDomain: site.customDomain,
      },
      frontendDesign,
      endpoints: {
        admin: `/api/admin/sites/${site.id}/frontend-design`,
        publicManifest: `/api/sites/${site.id}/manifest`,
      },
      nextSteps: [
        'PATCH a custom frontend design contract after scanning your frontend components.',
        'Use capture-site-defaults to snapshot current Backy navigation, theme tokens, and page templates.',
        'New page, blog, form, product, and section generation can use this contract as its site design source.',
      ],
      ...(options.cacheInvalidation ? { cacheInvalidation: options.cacheInvalidation } : {}),
    },
  });
};

const persistRepositoryFrontendDesign = async (
  site: Site,
  settings: SiteSettings,
  frontendDesign: NonNullable<SiteSettings['frontendDesign']>,
) => {
  const repositories = await getRequiredDatabaseRepositories();
  const updated = await repositories.sites.update(site.id, {
    settings: {
      ...settings,
      frontendDesign,
    },
  });
  return updated.item;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      return responseForSite(requestId, site);
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return responseForSite(requestId, site as unknown as Site);
  } catch (error) {
    console.error('Admin frontend design API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const input = body.frontendDesign || body;
    const updatedAt = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const frontendDesign = normalizeFrontendDesignContract(input, {
        fallback: site.settings.frontendDesign,
        updatedAt,
      });
      const updated = await persistRepositoryFrontendDesign(site, site.settings, frontendDesign);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'settings',
        entity: 'site',
        entityId: site.id,
        reason: 'site-frontend-design-updated',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'site',
        entityId: site.id,
        action: 'frontendDesign.update',
        before: site.settings.frontendDesign || emptyFrontendDesignContract(),
        after: frontendDesign,
        metadata: {
          status: frontendDesign.status,
          sourceType: frontendDesign.source.type,
          sourceLabel: frontendDesign.source.label || null,
          templateCount: frontendDesign.templates.length,
          editableBindingCount: frontendDesign.editableMap.length,
        },
        requestId,
      });
      return responseForSite(requestId, updated, { cacheInvalidation });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const frontendDesign = normalizeFrontendDesignContract(input, {
      fallback: site.settings?.frontendDesign,
      updatedAt,
    });
    const updated = updateAdminSite(site.id, {
      settings: {
        ...(site.settings || {}),
        frontendDesign,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'site',
      entityId: site.id,
      action: 'frontendDesign.update',
      before: site.settings?.frontendDesign || emptyFrontendDesignContract(),
      after: frontendDesign,
      metadata: {
        status: frontendDesign.status,
        sourceType: frontendDesign.source.type,
        sourceLabel: frontendDesign.source.label || null,
        templateCount: frontendDesign.templates.length,
        editableBindingCount: frontendDesign.editableMap.length,
      },
      requestId,
    });

    return responseForSite(requestId, updated as unknown as Site);
  } catch (error) {
    console.error('Admin frontend design update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const action = body.action === 'capture-site-defaults' ? 'capture-site-defaults' : null;

    if (!action) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported frontend design action', requestId);
    }

    const updatedAt = new Date().toISOString();

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const pages = await repositories.pages.list({ siteId: site.id, includeUnpublished: true });
      const frontendDesign = buildSiteDefaultFrontendDesignContract({
        site,
        pageTemplates: toPageTemplates(pages.items),
        updatedAt,
      });
      const updated = await persistRepositoryFrontendDesign(site, site.settings, frontendDesign);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'settings',
        entity: 'site',
        entityId: site.id,
        reason: 'site-frontend-design-captured',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'site',
        entityId: site.id,
        action: 'frontendDesign.capture',
        before: site.settings.frontendDesign || emptyFrontendDesignContract(),
        after: frontendDesign,
        metadata: {
          action,
          status: frontendDesign.status,
          sourceType: frontendDesign.source.type,
          templateCount: frontendDesign.templates.length,
          editableBindingCount: frontendDesign.editableMap.length,
        },
        requestId,
      });
      return responseForSite(requestId, updated, { cacheInvalidation });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const frontendDesign = buildSiteDefaultFrontendDesignContract({
      site: site as unknown as Site,
      pageTemplates: toPageTemplates(getPageSummary(site.id, { includeUnpublished: true })),
      updatedAt,
    });
    const updated = updateAdminSite(site.id, {
      settings: {
        ...(site.settings || {}),
        frontendDesign,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'site',
      entityId: site.id,
      action: 'frontendDesign.capture',
      before: site.settings?.frontendDesign || emptyFrontendDesignContract(),
      after: frontendDesign,
      metadata: {
        action,
        status: frontendDesign.status,
        sourceType: frontendDesign.source.type,
        templateCount: frontendDesign.templates.length,
        editableBindingCount: frontendDesign.editableMap.length,
      },
      requestId,
    });

    return responseForSite(requestId, updated as unknown as Site);
  } catch (error) {
    console.error('Admin frontend design action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
