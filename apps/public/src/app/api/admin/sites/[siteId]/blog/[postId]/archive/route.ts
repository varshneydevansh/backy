import { NextRequest, NextResponse } from 'next/server';
import type { BackyPost } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { archiveAdminBlogPost, getSiteByIdOrSlug } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { postRevisionSnapshot } from '@/lib/repositoryContentWorkflow';

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const adminPostFromRepositoryPost = (post: BackyPost) => {
  const canvasSize = isRecord(post.content.metadata?.canvasSize)
    ? post.content.metadata.canvasSize
    : { width: 1200, height: 900 };
  return {
    ...post,
    content: {
      elements: post.content.elements,
      canvasSize,
      customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
      contentDocument: post.content,
    },
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, postId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const currentPost = await repositories.posts.getById(site.id, postId);

      if (!currentPost) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'post',
        targetId: currentPost.id,
        snapshot: postRevisionSnapshot(currentPost),
        note: 'Before archive',
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const archived = await repositories.posts.archive(site.id, postId);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'post',
        entityId: archived.item.id,
        reason: 'post-archived',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          post: adminPostFromRepositoryPost(archived.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const post = archiveAdminBlogPost(site.id, postId, request.headers.get('x-backy-actor') || 'admin');

    if (!post) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { post } });
  } catch (error) {
    console.error('Admin blog archive API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
