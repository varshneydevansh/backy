/**
 * Admin site detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]
 * PATCH  /api/admin/sites/[siteId]
 * DELETE /api/admin/sites/[siteId]
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Site, SiteSettings } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  deleteAdminSite,
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeNavigationConfig } from '@/lib/navigation';
import { normalizeRedirectRules } from '@/lib/redirectRules';
import { emptyFrontendDesignContract, normalizeFrontendDesignContract } from '@/lib/frontendDesignContract';

export const runtime = 'nodejs';

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

const adminSiteFromRepositorySite = (site: Site | null) => {
  if (!site) return null;
  return {
    ...site,
    status: site.isPublished ? 'published' : 'draft',
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toStringRecord = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (typeof entry === 'string') {
      acc[key] = entry;
    }
    return acc;
  }, {});
};

const mergeSiteSettings = (current: SiteSettings, input: unknown): SiteSettings | undefined => {
  if (!isRecord(input)) {
    return undefined;
  }

  return {
    ...current,
    ...input,
    seo: {
      ...current.seo,
      ...(isRecord(input.seo) ? input.seo : {}),
    },
    analytics: {
      ...current.analytics,
      ...(isRecord(input.analytics) ? input.analytics : {}),
    },
    social: {
      ...current.social,
      ...toStringRecord(input.social),
    },
    commentPolicy: input.commentPolicy === undefined
      ? current.commentPolicy
      : {
          ...(current.commentPolicy || {}),
          ...(isRecord(input.commentPolicy) ? input.commentPolicy : {}),
          blockedTerms: Array.isArray((input.commentPolicy as { blockedTerms?: unknown } | undefined)?.blockedTerms)
            ? (input.commentPolicy as { blockedTerms: unknown[] }).blockedTerms.filter((term): term is string => typeof term === 'string')
            : current.commentPolicy?.blockedTerms || [],
        },
    redirectRules: input.redirectRules === undefined
      ? current.redirectRules
      : normalizeRedirectRules(input.redirectRules),
    navigation: input.navigation === undefined
      ? current.navigation
      : normalizeNavigationConfig(input.navigation, current.navigation),
    frontendDesign: input.frontendDesign === undefined
      ? (current.frontendDesign || emptyFrontendDesignContract())
      : normalizeFrontendDesignContract(input.frontendDesign, {
          fallback: current.frontendDesign,
          updatedAt: new Date().toISOString(),
        }),
  };
};

const isCommentPolicyOnlyPatch = (body: Record<string, unknown>): boolean => {
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 1 || !bodyKeys.includes('settings')) {
    return false;
  }

  const settings = body.settings;
  if (!isRecord(settings)) {
    return false;
  }

  const settingsKeys = Object.keys(settings);
  return settingsKeys.length === 1 && settingsKeys[0] === 'commentPolicy';
};

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

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: adminSiteFromRepositorySite(site),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site,
      },
    });
  } catch (error) {
    console.error('Admin site detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const commentPolicyOnlyPatch = isCommentPolicyOnlyPatch(body);
  const access = requireAdminAccess(request, requestId, {
    permission: commentPolicyOnlyPatch ? 'comments.configure' : 'sites.configure',
  });
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

      const settings = mergeSiteSettings(site.settings, body.settings);
      const updated = await repositories.sites.update(site.id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
        customDomain: typeof body.customDomain === 'string' || body.customDomain === null ? body.customDomain : undefined,
        status: body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : undefined,
        isPublished: typeof body.isPublished === 'boolean' ? body.isPublished : undefined,
        settings,
      });
      if (commentPolicyOnlyPatch) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: access.session?.user.id,
          entity: 'site',
          entityId: site.id,
          action: 'commentPolicy.update',
          before: site.settings?.commentPolicy || {},
          after: updated.item.settings?.commentPolicy || {},
          metadata: {
            permission: 'comments.configure',
          },
          requestId,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: adminSiteFromRepositorySite(updated.item),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const updated = updateAdminSite(site.id, body);

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    if (commentPolicyOnlyPatch) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'site',
        entityId: site.id,
        action: 'commentPolicy.update',
        before: site.settings?.commentPolicy || {},
        after: updated.settings?.commentPolicy || {},
        metadata: {
          permission: 'comments.configure',
        },
        requestId,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: updated,
      },
    });
  } catch (error) {
    console.error('Admin site update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'sites.configure' });
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

      await repositories.sites.delete(site.id);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          siteId: site.id,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    deleteAdminSite(site.id);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        siteId: site.id,
      },
    });
  } catch (error) {
    console.error('Admin site delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
