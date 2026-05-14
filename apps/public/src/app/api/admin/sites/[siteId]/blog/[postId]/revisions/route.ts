import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getAdminBlogPostById, getSiteByIdOrSlug, listContentRevisions } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const parseBoundedNumber = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, postId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseBoundedNumber(searchParams.get('limit'), 25, 1, 100);
    const offset = parseBoundedNumber(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const post = await repositories.posts.getById(site.id, postId);

      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      const result = await repositories.contentWorkflows.listRevisions({
        siteId: site.id,
        targetType: 'post',
        targetId: post.id,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          revisions: result.items,
          pagination: result.pagination,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    if (!getAdminBlogPostById(site.id, postId)) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    const payload = listContentRevisions(site.id, 'post', postId, { limit, offset });

    return NextResponse.json({
      success: true,
      requestId,
      data: payload,
    });
  } catch (error) {
    console.error('Admin blog revisions API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
