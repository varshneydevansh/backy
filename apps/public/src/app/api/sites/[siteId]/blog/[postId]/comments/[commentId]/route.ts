import { NextRequest, NextResponse } from 'next/server';
import {
  getBlogPosts,
  getCommentById,
  getSiteByIdOrSlug,
  updateCommentStatus,
} from '@/lib/backyStore';
import type { Comment } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
    commentId: string;
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

  return {
    status: parseStatus((raw as { status?: unknown }).status),
    reviewedBy: typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
      ? (raw as { reviewedBy: string }).reviewedBy
      : undefined,
    rejectionReason: typeof (raw as { rejectionReason?: unknown }).rejectionReason === 'string'
      ? (raw as { rejectionReason: string }).rejectionReason
      : undefined,
    blockReason: typeof (raw as { blockReason?: unknown }).blockReason === 'string'
      ? (raw as { blockReason: string }).blockReason
      : undefined,
    requestId: typeof (raw as { requestId?: unknown }).requestId === 'string'
      ? (raw as { requestId: string }).requestId.trim()
      : undefined,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, postId, commentId } = await params;
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

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        comment,
      },
      comment,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const baseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, postId, commentId } = await params;
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
    if (!body || !body.status) {
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

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        comment: nextComment,
      },
      comment: nextComment,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}
