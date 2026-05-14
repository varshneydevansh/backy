/**
 * Admin blog post detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/blog/[postId]
 * PATCH  /api/admin/sites/[siteId]/blog/[postId]
 * DELETE /api/admin/sites/[siteId]/blog/[postId]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyJsonObject,
  type BackyContentDocument,
  type BackyPost,
} from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  normalizeScheduledAtInput,
  statusRequiresPublishPermission,
  validateScheduledContentStatus,
} from '@/lib/adminContentStatusPolicy';
import {
  deleteAdminBlogPost,
  getAdminBlogPostById,
  getBlogPosts,
  getSiteByIdOrSlug,
  updateAdminBlogPost,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { postRevisionSnapshot } from '@/lib/repositoryContentWorkflow';
import { recordAdminAudit } from '@/lib/adminAudit';

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
  details?: Record<string, unknown>,
) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const statusFromInput = (value: unknown): 'draft' | 'published' | 'scheduled' | 'archived' | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived' ? value : undefined
);

const stringArrayFromInput = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined
);

const contentDocumentFromInput = (
  rawContent: unknown,
  fallback: BackyPost,
  input: {
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled' | 'archived';
  },
): BackyContentDocument | undefined => {
  if (rawContent === undefined) {
    return undefined;
  }
  if (isBackyContentDocument(rawContent)) {
    return rawContent;
  }
  if (isRecord(rawContent) && isBackyContentDocument(rawContent.contentDocument)) {
    return rawContent.contentDocument;
  }

  return canvasElementsToBackyContentDocument({
    id: fallback.id,
    kind: 'post',
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements: isRecord(rawContent) && Array.isArray(rawContent.elements)
      ? rawContent.elements
      : Array.isArray(rawContent)
        ? rawContent
        : [],
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS: isRecord(rawContent) && typeof rawContent.customCSS === 'string' ? rawContent.customCSS : undefined,
  });
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

const postAuditMetadata = (post: {
  id: string;
  title: string;
  slug: string;
  status: string;
  scheduledAt?: string | null;
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
}): BackyJsonObject => ({
  postId: post.id,
  title: post.title,
  slug: post.slug,
  status: post.status,
  scheduledAt: post.scheduledAt || null,
  authorId: post.authorId || null,
  categoryIds: Array.isArray(post.categoryIds) ? post.categoryIds : [],
  tagIds: Array.isArray(post.tagIds) ? post.tagIds : [],
});

const updateAuditMetadata = (post: Parameters<typeof postAuditMetadata>[0], body: Record<string, unknown>): BackyJsonObject => ({
  ...postAuditMetadata(post),
  changedFields: Object.keys(body).filter((key) => key !== 'expectedUpdatedAt'),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
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

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          post: adminPostFromRepositoryPost(post),
        },
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

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        post,
      },
    });
  } catch (error) {
    console.error('Admin blog detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
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

      const body = await parseJsonBody(request);
      const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : '';
      if (expectedUpdatedAt && expectedUpdatedAt !== post.updatedAt) {
        return errorResponse(409, 'BLOG_VERSION_CONFLICT', 'Post has changed since the editor loaded it', requestId, {
          postId: post.id,
          expectedUpdatedAt,
          currentUpdatedAt: post.updatedAt,
          currentPost: adminPostFromRepositoryPost(post),
        });
      }

      const nextSlug = body.slug === undefined ? post.slug : normalizeSlug(body.slug);

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Post slug is required', requestId);
      }

      if (nextSlug && nextSlug !== post.slug) {
        const conflict = await repositories.posts.checkSlug({ siteId: site.id, slug: nextSlug, excludePostId: post.id });
        if (!conflict.available) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A post with this slug already exists', requestId);
        }
      }

      const status = statusFromInput(body.status) || post.status;
      const scheduledAt = normalizeScheduledAtInput(body.scheduledAt);
      const nextScheduledAt = scheduledAt === undefined ? post.scheduledAt || null : scheduledAt;
      if (body.status !== undefined && statusRequiresPublishPermission(status)) {
        const publishAccess = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
        if (publishAccess instanceof NextResponse) return publishAccess;
      }
      const scheduleValidation = validateScheduledContentStatus(status, nextScheduledAt);
      if (!scheduleValidation.ok) {
        return errorResponse(400, scheduleValidation.code, scheduleValidation.message, requestId);
      }
      const title = typeof body.title === 'string' ? body.title : post.title;
      const content = contentDocumentFromInput(body.content, post, { title, slug: nextSlug, status });
      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'post',
        targetId: post.id,
        snapshot: postRevisionSnapshot(post),
        note: typeof body.revisionNote === 'string' && body.revisionNote.trim().length > 0
          ? body.revisionNote
          : 'Before update',
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const updated = await repositories.posts.update(site.id, post.id, {
        title: body.title === undefined ? undefined : title,
        slug: body.slug === undefined ? undefined : nextSlug,
        excerpt: typeof body.excerpt === 'string' || body.excerpt === null ? body.excerpt : undefined,
        status: statusFromInput(body.status),
        scheduledAt: scheduledAt === undefined ? undefined : scheduledAt,
        featuredImageId: typeof body.featuredImageId === 'string' || body.featuredImageId === null
          ? body.featuredImageId
          : undefined,
        authorId: typeof body.authorId === 'string' || body.authorId === null ? body.authorId : undefined,
        categoryIds: stringArrayFromInput(body.categoryIds),
        tagIds: stringArrayFromInput(body.tagIds),
        content,
        meta: isRecord(body.meta) ? body.meta : undefined,
        revisionNote: typeof body.revisionNote === 'string' ? body.revisionNote : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'post',
        entityId: updated.item.id,
        reason: 'post-updated',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'post',
        entityId: post.id,
        action: 'update',
        before: postAuditMetadata(post),
        after: postAuditMetadata(updated.item),
        metadata: updateAuditMetadata(updated.item, body),
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          post: adminPostFromRepositoryPost(updated.item),
          cacheInvalidation,
        },
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

    const body = await parseJsonBody(request);
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : '';
    if (expectedUpdatedAt && expectedUpdatedAt !== post.updatedAt) {
      return errorResponse(409, 'BLOG_VERSION_CONFLICT', 'Post has changed since the editor loaded it', requestId, {
        postId: post.id,
        expectedUpdatedAt,
        currentUpdatedAt: post.updatedAt,
        currentPost: post,
      });
    }

    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Post slug is required', requestId);
    }

    if (nextSlug && nextSlug !== post.slug) {
      const conflict = getBlogPosts(site.id, {
        includeUnpublished: true,
        slug: nextSlug,
      }).posts[0];

      if (conflict && conflict.id !== post.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A post with this slug already exists', requestId);
      }
    }

    const status = statusFromInput(body.status) || post.status;
    const scheduledAt = normalizeScheduledAtInput(body.scheduledAt);
    const nextScheduledAt = scheduledAt === undefined ? post.scheduledAt || null : scheduledAt;
    if (body.status !== undefined && statusRequiresPublishPermission(status)) {
      const publishAccess = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
      if (publishAccess instanceof NextResponse) return publishAccess;
    }
    const scheduleValidation = validateScheduledContentStatus(status, nextScheduledAt);
    if (!scheduleValidation.ok) {
      return errorResponse(400, scheduleValidation.code, scheduleValidation.message, requestId);
    }

    const updated = updateAdminBlogPost(site.id, post.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'post',
      entityId: post.id,
      action: 'update',
      before: postAuditMetadata(post),
      after: postAuditMetadata(updated),
      metadata: updateAuditMetadata(updated, body),
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        post: updated,
      },
    });
  } catch (error) {
    console.error('Admin blog update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.delete' });
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

      await repositories.contentWorkflows.deletePreviewTokensForTarget(site.id, 'post', postId);
      const deleted = await repositories.posts.delete(site.id, postId);

      if (!deleted) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'post',
        entityId: postId,
        reason: 'post-deleted',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'post',
        entityId: postId,
        action: 'delete',
        before: postAuditMetadata(post),
        metadata: postAuditMetadata(post),
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          postId,
          cacheInvalidation,
        },
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

    const deleted = deleteAdminBlogPost(site.id, postId);

    if (!deleted) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'post',
      entityId: postId,
      action: 'delete',
      before: postAuditMetadata(post),
      metadata: postAuditMetadata(post),
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        postId,
      },
    });
  } catch (error) {
    console.error('Admin blog delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
