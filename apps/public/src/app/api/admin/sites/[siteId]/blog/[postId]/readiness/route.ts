/**
 * Admin blog post readiness endpoint.
 *
 * GET /api/admin/sites/[siteId]/blog/[postId]/readiness
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getAdminBlogPostById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { buildRepositorySiteReadiness, buildSiteReadiness } from '@/lib/siteReadiness';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
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
      errorMessage: message,
    },
    { status },
  )
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, postId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const post = await repositories.posts.getById(site.id, postId);

      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      const readiness = (await buildRepositorySiteReadiness(repositories, site)).posts.find((item) => item.id === post.id);

      if (!readiness) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          readiness,
        },
        readiness,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const post = getAdminBlogPostById(site.id, postId);

    if (!post) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    const readiness = buildSiteReadiness(site).posts.find((item) => item.id === post.id);

    if (!readiness) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        readiness,
      },
      readiness,
    });
  } catch (error) {
    console.error('Admin blog readiness API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
