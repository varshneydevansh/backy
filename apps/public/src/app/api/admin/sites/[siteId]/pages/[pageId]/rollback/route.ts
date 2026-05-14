import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, rollbackAdminPage } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  adminPageFromRepositoryPage,
  pageRevisionSnapshot,
  pageUpdateFromRevisionSnapshot,
  resolveRepositorySite,
} from '@/lib/repositoryContentWorkflow';

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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId } = await params;
    const body = await parseJsonBody(request);
    const revisionId = typeof body.revisionId === 'string' ? body.revisionId.trim() : '';

    if (!revisionId) {
      return errorResponse(400, 'VALIDATION_ERROR', 'revisionId is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const currentPage = await repositories.pages.getById(site.id, pageId);
      const revision = await repositories.contentWorkflows.getRevisionById(site.id, 'page', pageId, revisionId);

      if (!currentPage || !revision) {
        return errorResponse(404, 'REVISION_NOT_FOUND', 'Page or revision not found', requestId);
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'page',
        targetId: currentPage.id,
        snapshot: pageRevisionSnapshot(currentPage),
        note: `Before rollback to ${revisionId}`,
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });

      const rolledBack = await repositories.pages.update(
        site.id,
        currentPage.id,
        pageUpdateFromRevisionSnapshot(revision.snapshot, currentPage),
      );

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(rolledBack.item),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = rollbackAdminPage(site.id, pageId, revisionId, request.headers.get('x-backy-actor') || 'admin');

    if (!page) {
      return errorResponse(404, 'REVISION_NOT_FOUND', 'Page or revision not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { page } });
  } catch (error) {
    console.error('Admin page rollback API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
