import { NextRequest, NextResponse } from 'next/server';
import {
  getBlogPosts,
  getCommentById,
  getSiteByIdOrSlug,
  updateCommentStatus,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  resolveRepositorySite,
  updateRepositoryCommentStatus,
} from '@/lib/commentRepositorySupport';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { Comment } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
    commentId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

function parseStatus(raw: unknown): Comment['status'] | null {
  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam' ||
    raw === 'blocked'
  ) {
    return raw;
  }
  return null;
}

function parseBody(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const body = raw as {
    status?: unknown;
    reviewedBy?: unknown;
    rejectionReason?: unknown;
    blockReason?: unknown;
    requestId?: unknown;
  };

  return {
    status: parseStatus(body.status),
    statusProvided: Object.prototype.hasOwnProperty.call(body, 'status'),
    reviewedBy: typeof body.reviewedBy === 'string'
      ? body.reviewedBy
      : undefined,
    rejectionReason: typeof body.rejectionReason === 'string'
      ? body.rejectionReason
      : undefined,
    blockReason: typeof body.blockReason === 'string'
      ? body.blockReason
      : undefined,
    requestId: typeof body.requestId === 'string'
      ? body.requestId.trim()
      : undefined,
  };
}

const invalidStatusResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_BLOG_COMMENT_STATUS',
  'Invalid blog comment status. Use pending, approved, rejected, spam, or blocked.',
  requestId,
);

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, postId, commentId } = await params;

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

      const comment = await repositories.comments.getById(site.id, commentId);
      if (!comment || comment.targetType !== 'post' || comment.targetId !== postId) {
        return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
      }

      if (comment.status !== 'approved') {
        const access = await requireAdminAccess(_request, requestId, { permission: 'comments.view' });
        if (access instanceof NextResponse) {
          return access;
        }
      }

      return privateResponse({
        success: true,
        requestId,
        data: {
          comment,
        },
        comment,
      }, requestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = posts.posts.some((post) => post.id === postId);
    if (!postExists) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.targetType !== 'post' || comment.targetId !== postId) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
    }

    if (comment.status !== 'approved') {
      const access = await requireAdminAccess(_request, requestId, { permission: 'comments.view' });
      if (access instanceof NextResponse) {
        return access;
      }
    }

    return privateResponse({
      success: true,
      requestId,
      data: {
        comment,
      },
      comment,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const baseRequestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, baseRequestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, postId, commentId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', baseRequestId);
      }

      const post = await repositories.posts.getById(site.id, postId);
      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', baseRequestId);
      }

      const targetComment = await repositories.comments.getById(site.id, commentId);
      if (!targetComment || targetComment.targetType !== 'post' || targetComment.targetId !== postId) {
        return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', baseRequestId);
      }

      const body = parseBody(await request.json().catch(() => null));
      if (!body) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', baseRequestId);
      }
      if (body.statusProvided && !body.status) {
        return invalidStatusResponse(baseRequestId);
      }
      if (!body.status) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', baseRequestId);
      }
      const requestId = body.requestId || baseRequestId;

      const nextComment = await updateRepositoryCommentStatus(repositories, site.id, targetComment, {
        status: body.status,
        reviewedBy: body.reviewedBy,
        rejectionReason: body.rejectionReason,
        blockReason: body.blockReason,
        requestId: body.requestId,
      });

      return privateResponse({
        success: true,
        requestId,
        data: {
          comment: nextComment,
        },
        comment: nextComment,
      }, requestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', baseRequestId);
    }

    const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = posts.posts.some((post) => post.id === postId);
    if (!postExists) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', baseRequestId);
    }

    const targetComment = getCommentById(commentId);
    if (!targetComment || targetComment.targetType !== 'post' || targetComment.targetId !== postId) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', baseRequestId);
    }

    const body = parseBody(await request.json().catch(() => null));
    if (!body) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', baseRequestId);
    }
    if (body.statusProvided && !body.status) {
      return invalidStatusResponse(baseRequestId);
    }
    if (!body.status) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', baseRequestId);
    }
    const requestId = body.requestId || baseRequestId;

    const nextComment = updateCommentStatus(commentId, {
      status: body.status,
      reviewedBy: body.reviewedBy,
      rejectionReason: body.rejectionReason,
      blockReason: body.blockReason,
      requestId: body.requestId,
    });

    if (!nextComment) {
      return errorResponse(409, 'COMMENT_UPDATE_FAILED', 'Unable to update comment', requestId);
    }

    return privateResponse({
      success: true,
      requestId,
      data: {
        comment: nextComment,
      },
      comment: nextComment,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}
