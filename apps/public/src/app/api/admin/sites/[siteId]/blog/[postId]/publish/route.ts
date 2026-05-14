import { NextRequest, NextResponse } from 'next/server';
import type { BackyPost } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getAdminBlogPostById, getSiteByIdOrSlug, publishAdminBlogPost } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { buildRepositorySiteReadiness, buildSiteReadiness } from '@/lib/siteReadiness';
import { postRevisionSnapshot } from '@/lib/repositoryContentWorkflow';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
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
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  const text = await request.text().catch(() => '');
  if (!text.trim()) return {};

  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

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
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, postId } = await params;
    const body = await parseJsonBody(request);
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

      const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : '';
      if (expectedUpdatedAt && expectedUpdatedAt !== currentPost.updatedAt) {
        return errorResponse(409, 'BLOG_VERSION_CONFLICT', 'Post has changed since the list loaded it', requestId, {
          postId: currentPost.id,
          expectedUpdatedAt,
          currentUpdatedAt: currentPost.updatedAt,
          currentPost: adminPostFromRepositoryPost(currentPost),
        });
      }

      const readiness = (await buildRepositorySiteReadiness(repositories, site)).posts.find((item) => item.id === currentPost.id);
      const readinessErrors = readiness?.checks.filter((check) => (
        check.status !== 'pass' && check.severity === 'error'
      )) || [];

      if (readinessErrors.length > 0) {
        return errorResponse(
          400,
          'READINESS_BLOCKED',
          'Resolve post readiness errors before publishing',
          requestId,
          {
            readiness,
            checks: readinessErrors,
          },
        );
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'post',
        targetId: currentPost.id,
        snapshot: postRevisionSnapshot(currentPost),
        note: 'Before publish',
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const published = await repositories.posts.publish(site.id, postId);
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'post',
        entityId: published.item.id,
        reason: 'post-published',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          post: adminPostFromRepositoryPost(published.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const currentPost = getAdminBlogPostById(site.id, postId);

    if (!currentPost) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : '';
    if (expectedUpdatedAt && expectedUpdatedAt !== currentPost.updatedAt) {
      return errorResponse(409, 'BLOG_VERSION_CONFLICT', 'Post has changed since the list loaded it', requestId, {
        postId: currentPost.id,
        expectedUpdatedAt,
        currentUpdatedAt: currentPost.updatedAt,
        currentPost,
      });
    }

    const readiness = buildSiteReadiness(site).posts.find((item) => item.id === currentPost.id);
    const readinessErrors = readiness?.checks.filter((check) => (
      check.status !== 'pass' && check.severity === 'error'
    )) || [];

    if (readinessErrors.length > 0) {
      return errorResponse(
        400,
        'READINESS_BLOCKED',
        'Resolve post readiness errors before publishing',
        requestId,
        {
          readiness,
          checks: readinessErrors,
        },
      );
    }

    const post = publishAdminBlogPost(site.id, postId, request.headers.get('x-backy-actor') || 'admin');

    if (!post) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { post } });
  } catch (error) {
    console.error('Admin blog publish API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
