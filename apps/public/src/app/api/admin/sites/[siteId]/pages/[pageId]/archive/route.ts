import { NextRequest, NextResponse } from 'next/server';
import type { BackyPage } from '@backy-cms/core';
import { archiveAdminPage, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
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

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
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

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'page',
        targetId: currentPage.id,
        snapshot: pageRevisionSnapshot(currentPage),
        note: 'Before archive',
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const archived = await repositories.pages.archive(site.id, pageId);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'page',
        entityId: pageId,
        reason: 'page-archived',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(archived.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = archiveAdminPage(site.id, pageId, request.headers.get('x-backy-actor') || 'admin');

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { page } });
  } catch (error) {
    console.error('Admin page archive API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
