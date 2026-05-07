import { NextRequest, NextResponse } from 'next/server';
import {
  getCommentById,
  getSiteByIdOrSlug,
  updateCommentStatus,
} from '@/lib/backyStore';
import {
  resolveRepositorySite,
  updateRepositoryCommentStatus,
} from '@/lib/commentRepositorySupport';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { Comment } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    commentId: string;
  }>;
}

type CommentStatus = 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';

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

function parseStatus(raw: unknown): CommentStatus | null {
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

function parseBody(raw: unknown): {
  status: CommentStatus;
  reviewedBy?: string;
  actor?: string;
  rejectionReason?: string;
  blockReason?: string;
  requestId?: string;
} | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const status = parseStatus((raw as { status?: unknown }).status);
  if (!status) {
    return null;
  }

  const reviewedBy = typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
    ? (raw as { reviewedBy: string }).reviewedBy.trim()
    : undefined;

  const actor = typeof (raw as { actor?: unknown }).actor === 'string'
    ? (raw as { actor: string }).actor.trim()
    : undefined;

  const rejectionReason = typeof (raw as { rejectionReason?: unknown }).rejectionReason === 'string'
    ? ((raw as { rejectionReason: string }).rejectionReason.trim() || undefined)
    : undefined;

  const blockReason = typeof (raw as { blockReason?: unknown }).blockReason === 'string'
    ? ((raw as { blockReason: string }).blockReason.trim() || undefined)
    : undefined;

  const requestId = typeof (raw as { requestId?: unknown }).requestId === 'string'
    ? (raw as { requestId: string }).requestId.trim()
    : undefined;

  return {
    status,
    reviewedBy,
    actor,
    rejectionReason,
    blockReason,
    requestId: requestId || undefined,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, commentId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const comment = await repositories.comments.getById(site.id, commentId);
      if (!comment) {
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
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.siteId !== site.id) {
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
    const { siteId, commentId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', baseRequestId);
      }

      const comment = await repositories.comments.getById(site.id, commentId);
      if (!comment) {
        return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', baseRequestId);
      }

      const payload = parseBody(await request.json().catch(() => null));
      if (!payload) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', baseRequestId);
      }
      const requestId = payload.requestId || baseRequestId;

      const updated = await updateRepositoryCommentStatus(repositories, site.id, comment, {
        status: payload.status,
        reviewedBy: payload.reviewedBy || null,
        actor: payload.actor,
        rejectionReason: payload.rejectionReason || null,
        blockReason: payload.blockReason || null,
        requestId: payload.requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          comment: updated as Comment,
        },
        comment: updated as Comment,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', baseRequestId);
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.siteId !== site.id) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', baseRequestId);
    }

    const payload = parseBody(await request.json().catch(() => null));
    if (!payload) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status is required.', baseRequestId);
    }
    const requestId = payload.requestId || baseRequestId;

    const updated = updateCommentStatus(comment.id, {
      status: payload.status,
      reviewedBy: payload.reviewedBy || null,
      actor: payload.actor,
      rejectionReason: payload.rejectionReason || null,
      blockReason: payload.blockReason || null,
      requestId: payload.requestId,
    });

    if (!updated) {
      return errorResponse(409, 'COMMENT_UPDATE_FAILED', 'Unable to update comment', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        comment: updated as Comment,
      },
      comment: updated as Comment,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}
