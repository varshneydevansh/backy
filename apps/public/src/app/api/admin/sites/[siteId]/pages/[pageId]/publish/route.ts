import { NextRequest, NextResponse } from 'next/server';
import type { BackyPage } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getAdminPageById, getSiteByIdOrSlug, publishAdminPage } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { buildRepositorySiteReadiness, buildSiteReadiness } from '@/lib/siteReadiness';
import { pageRevisionSnapshot } from '@/lib/repositoryContentWorkflow';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
) => (
  NextResponse.json({
    success: false,
    requestId,
    error: { code, message, details },
  }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const adminPageFromRepositoryPage = (page: BackyPage) => {
  const canvasSize = isRecord(page.content.metadata?.canvasSize)
    ? page.content.metadata.canvasSize
    : { width: 1200, height: 900 };
  return {
    ...page,
    content: {
      elements: page.content.elements,
      canvasSize,
      customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
      contentDocument: page.content,
    },
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const currentPage = await repositories.pages.getById(site.id, pageId);

      if (!currentPage) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      const readiness = (await buildRepositorySiteReadiness(repositories, site)).pages.find((item) => item.id === currentPage.id);
      const readinessErrors = readiness?.checks.filter((check) => (
        check.status !== 'pass' && check.severity === 'error'
      )) || [];

      if (readinessErrors.length > 0) {
        return errorResponse(
          400,
          'READINESS_BLOCKED',
          'Resolve page readiness errors before publishing',
          requestId,
          {
            readiness,
            checks: readinessErrors,
          },
        );
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'page',
        targetId: currentPage.id,
        snapshot: pageRevisionSnapshot(currentPage),
        note: 'Before publish',
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const published = await repositories.pages.publish(site.id, pageId);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'page',
        entityId: pageId,
        reason: 'page-published',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(published.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const currentPage = getAdminPageById(site.id, pageId);

    if (!currentPage) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const readiness = buildSiteReadiness(site).pages.find((item) => item.id === currentPage.id);
    const readinessErrors = readiness?.checks.filter((check) => (
      check.status !== 'pass' && check.severity === 'error'
    )) || [];

    if (readinessErrors.length > 0) {
      return errorResponse(
        400,
        'READINESS_BLOCKED',
        'Resolve page readiness errors before publishing',
        requestId,
        {
          readiness,
          checks: readinessErrors,
        },
      );
    }

    const page = publishAdminPage(site.id, pageId, request.headers.get('x-backy-actor') || 'admin');

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { page } });
  } catch (error) {
    console.error('Admin page publish API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
