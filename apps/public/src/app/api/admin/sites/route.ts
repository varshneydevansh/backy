/**
 * Admin sites endpoint.
 *
 * GET  /api/admin/sites
 * POST /api/admin/sites
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Site } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createAdminSite, getSiteByIdOrSlug, getSites } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

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

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const statusForRepositorySite = (site: { isPublished: boolean }) => (
  site.isPublished ? 'published' : 'draft'
);

const configuredDefaultTeamId = () => (
  process.env.BACKY_DEFAULT_TEAM_ID?.trim()
  || process.env.BACKY_TEAM_ID?.trim()
  || process.env.NEXT_PUBLIC_BACKY_DEFAULT_TEAM_ID?.trim()
  || ''
);

const resolveSiteCreateTeamId = async (
  body: Record<string, unknown>,
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
): Promise<string> => {
  const explicitTeamId = typeof body.teamId === 'string' && body.teamId.trim().length > 0
    ? body.teamId.trim()
    : '';
  if (explicitTeamId) {
    return explicitTeamId;
  }

  const envTeamId = configuredDefaultTeamId();
  if (envTeamId) {
    return envTeamId;
  }

  const existingSites = await repositories.sites.list({
    status: 'all',
    limit: 100,
    offset: 0,
  });
  const existingTeamIds = Array.from(new Set(
    existingSites.items
      .map((site) => typeof site.teamId === 'string' ? site.teamId.trim() : '')
      .filter(Boolean),
  ));

  return !existingSites.pagination.hasMore && existingTeamIds.length === 1
    ? existingTeamIds[0]
    : '';
};

const adminSiteFromRepositorySite = (site: Site | null) => {
  if (!site) return null;
  return {
    ...site,
    status: statusForRepositorySite(site),
  };
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'sites.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeUnpublished = searchParams.get('includeUnpublished') === 'true';
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const result = await repositories.sites.list({
        status: includeUnpublished ? 'all' : 'published',
      });
      const sites = result.items.map((site) => adminSiteFromRepositorySite(site));

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sites,
          pagination: result.pagination,
        },
      });
    }

    const sites = getSites({ includeUnpublished });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sites,
        pagination: {
          total: sites.length,
          limit: sites.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin sites list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'sites.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = normalizeSlug(body.slug || name);

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Site name is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Site slug is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const teamId = await resolveSiteCreateTeamId(body, repositories);

      if (!teamId) {
        return errorResponse(
          400,
          'TEAM_REQUIRED',
          'Database mode site creation requires a teamId, BACKY_DEFAULT_TEAM_ID, or exactly one existing site team to infer from.',
          requestId,
        );
      }

      const slugCheck = await repositories.sites.checkSlug({ slug, teamId });
      if (!slugCheck.available) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A site with this slug already exists', requestId);
      }

      const created = await repositories.sites.create({
        teamId,
        name,
        slug,
        description: typeof body.description === 'string' ? body.description : null,
        customDomain: typeof body.customDomain === 'string' ? body.customDomain : null,
        status: body.status === 'published' ? 'published' : 'draft',
      });
      await recordAdminAudit({
        repositories,
        siteId: created.item.id,
        teamId,
        actorId: access.session?.user.id,
        entity: 'site',
        entityId: created.item.id,
        action: 'site.created',
        after: adminSiteFromRepositorySite(created.item) || {},
        metadata: {
          slug,
          status: body.status === 'published' ? 'published' : 'draft',
          source: 'admin-sites-create',
        },
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            site: adminSiteFromRepositorySite(created.item),
          },
        },
        { status: 201 },
      );
    }

    if (getSiteByIdOrSlug(slug)) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A site with this slug already exists', requestId);
    }

    const site = createAdminSite({
      ...body,
      name,
      slug,
    });
    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'site',
      entityId: site.id,
      action: 'site.created',
      after: site,
      metadata: {
        slug: site.slug,
        status: site.status,
        source: 'admin-sites-create',
      },
      requestId,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          site,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin site create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
