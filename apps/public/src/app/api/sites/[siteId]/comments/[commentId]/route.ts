import { NextRequest, NextResponse } from 'next/server';
import {
  deleteCommentRecord,
  getCommentById,
  getSiteByIdOrSlug,
  listComments,
  updateCommentStatus,
  updateCommentThread,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  resolveRepositorySite,
  updateRepositoryCommentStatus,
  updateRepositoryCommentThread,
} from '@/lib/commentRepositorySupport';
import { notifyCommentDelivery } from '@/lib/commentDelivery';
import { publicContractJson } from '@/lib/publicContractResponse';
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
  status?: CommentStatus;
  statusProvided: boolean;
  parentId?: string | null;
  commentThreadId?: string | null;
  hasThreadUpdate: boolean;
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
  const statusProvided = Object.prototype.hasOwnProperty.call(raw, 'status');
  const hasParentId = Object.prototype.hasOwnProperty.call(raw, 'parentId');
  const hasCommentThreadId = Object.prototype.hasOwnProperty.call(raw, 'commentThreadId') || Object.prototype.hasOwnProperty.call(raw, 'threadId');
  const parentId = hasParentId
    ? (typeof (raw as { parentId?: unknown }).parentId === 'string'
      ? ((raw as { parentId: string }).parentId.trim() || null)
      : (raw as { parentId?: unknown }).parentId === null
        ? null
        : undefined)
    : undefined;
  const rawThreadId = (raw as { commentThreadId?: unknown }).commentThreadId ?? (raw as { threadId?: unknown }).threadId;
  const commentThreadId = hasCommentThreadId
    ? (typeof rawThreadId === 'string'
      ? (rawThreadId.trim() || null)
      : rawThreadId === null
        ? null
        : undefined)
    : undefined;

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

  if (!status && !hasParentId && !hasCommentThreadId) {
    return null;
  }

  return {
    status: status || undefined,
    statusProvided,
    parentId,
    commentThreadId,
    hasThreadUpdate: hasParentId || hasCommentThreadId,
    reviewedBy,
    actor,
    rejectionReason,
    blockReason,
    requestId: requestId || undefined,
  };
}

const invalidSiteCommentStatusResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_SITE_COMMENT_STATUS',
  'Invalid site comment status. Use pending, approved, rejected, spam, or blocked.',
  requestId,
);

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

    const comment = getCommentById(commentId);
    if (!comment || comment.siteId !== site.id) {
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
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or parentId is required.', baseRequestId);
      }
      if (payload.statusProvided && !payload.status) {
        return invalidSiteCommentStatusResponse(baseRequestId);
      }
      if (payload.status && payload.hasThreadUpdate) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Update status and reply parent in separate requests.', baseRequestId);
      }
      const requestId = payload.requestId || baseRequestId;

      let updated: Comment;
      if (payload.status) {
        updated = await updateRepositoryCommentStatus(repositories, site.id, comment, {
          status: payload.status,
          reviewedBy: payload.reviewedBy || null,
          actor: payload.actor,
          rejectionReason: payload.rejectionReason || null,
          blockReason: payload.blockReason || null,
          requestId: payload.requestId,
        });
      } else {
        if (!comment.parentId) {
          return errorResponse(422, 'TOP_LEVEL_COMMENT', 'Only replies can be moved to another parent.', requestId);
        }
        if (payload.parentId === undefined) {
          return errorResponse(400, 'PARENT_REQUIRED', 'parentId is required when moving a reply.', requestId);
        }

        let parent: Comment | null = null;
        if (payload.parentId) {
          parent = await repositories.comments.getById(site.id, payload.parentId);
          if (
            !parent ||
            parent.id === comment.id ||
            parent.parentId ||
            parent.targetType !== comment.targetType ||
            parent.targetId !== comment.targetId
          ) {
            return errorResponse(422, 'INVALID_PARENT', 'The selected parent comment cannot receive this reply.', requestId);
          }
        }

        updated = await updateRepositoryCommentThread(repositories, site.id, comment, {
          parentId: parent?.id || null,
          commentThreadId: parent ? (payload.commentThreadId || parent.commentThreadId || parent.id) : null,
          actor: payload.actor,
          requestId: payload.requestId,
          defaultReviewer: 'admin',
        });
      }
      await notifyCommentDelivery({
        repositories,
        siteId: site.id,
        comment: updated,
        kind: 'comment-status',
        requestId,
        reason: payload.status || 'thread-updated',
        actor: payload.actor || payload.reviewedBy,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'comment',
        entityId: updated.id,
        action: payload.status ? 'comment.moderate' : 'comment.thread.update',
        before: {
          status: comment.status,
          parentId: comment.parentId || null,
          commentThreadId: comment.commentThreadId || null,
          reportCount: comment.reportCount || 0,
        },
        after: {
          status: updated.status,
          parentId: updated.parentId || null,
          commentThreadId: updated.commentThreadId || null,
          reportCount: updated.reportCount || 0,
        },
        metadata: {
          permission: 'comments.manage',
          targetType: updated.targetType,
          targetId: updated.targetId,
          status: payload.status || null,
          reason: payload.status || 'thread-updated',
          parentId: updated.parentId || null,
        },
        requestId,
      });

      return privateResponse({
        success: true,
        requestId,
        data: {
          comment: updated as Comment,
        },
        comment: updated as Comment,
      }, requestId);
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
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or parentId is required.', baseRequestId);
    }
    if (payload.statusProvided && !payload.status) {
      return invalidSiteCommentStatusResponse(baseRequestId);
    }
    if (payload.status && payload.hasThreadUpdate) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Update status and reply parent in separate requests.', baseRequestId);
    }
    const requestId = payload.requestId || baseRequestId;

    let updated: Comment | undefined;
    if (payload.status) {
      updated = updateCommentStatus(comment.id, {
        status: payload.status,
        reviewedBy: payload.reviewedBy || null,
        actor: payload.actor,
        rejectionReason: payload.rejectionReason || null,
        blockReason: payload.blockReason || null,
        requestId: payload.requestId,
      });
    } else {
      if (!comment.parentId) {
        return errorResponse(422, 'TOP_LEVEL_COMMENT', 'Only replies can be moved to another parent.', requestId);
      }
      if (payload.parentId === undefined) {
        return errorResponse(400, 'PARENT_REQUIRED', 'parentId is required when moving a reply.', requestId);
      }

      let parent: Comment | undefined;
      if (payload.parentId) {
        parent = getCommentById(payload.parentId);
        if (
          !parent ||
          parent.siteId !== site.id ||
          parent.id === comment.id ||
          parent.parentId ||
          parent.targetType !== comment.targetType ||
          parent.targetId !== comment.targetId
        ) {
          return errorResponse(422, 'INVALID_PARENT', 'The selected parent comment cannot receive this reply.', requestId);
        }
      }

      updated = updateCommentThread(comment.id, {
        parentId: parent?.id || null,
        commentThreadId: parent ? (payload.commentThreadId || parent.commentThreadId || parent.id) : null,
        actor: payload.actor,
        requestId: payload.requestId,
      });
    }

    if (!updated) {
      return errorResponse(409, 'COMMENT_UPDATE_FAILED', 'Unable to update comment', requestId);
    }
    await notifyCommentDelivery({
      siteId: site.id,
      comment: updated,
      kind: 'comment-status',
      requestId,
      reason: payload.status || 'thread-updated',
      actor: payload.actor || payload.reviewedBy,
    });
    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'comment',
      entityId: updated.id,
      action: payload.status ? 'comment.moderate' : 'comment.thread.update',
      before: {
        status: comment.status,
        parentId: comment.parentId || null,
        commentThreadId: comment.commentThreadId || null,
        reportCount: comment.reportCount || 0,
      },
      after: {
        status: updated.status,
        parentId: updated.parentId || null,
        commentThreadId: updated.commentThreadId || null,
        reportCount: updated.reportCount || 0,
      },
      metadata: {
        permission: 'comments.manage',
        targetType: updated.targetType,
        targetId: updated.targetId,
        status: payload.status || null,
        reason: payload.status || 'thread-updated',
        parentId: updated.parentId || null,
      },
      requestId,
    });

    return privateResponse({
      success: true,
      requestId,
      data: {
        comment: updated as Comment,
      },
      comment: updated as Comment,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

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

      const replies = comment.parentId
        ? []
        : (await repositories.comments.list({
          siteId: site.id,
          status: 'all',
          parentOnly: true,
          parentId: comment.id,
          limit: 100,
        })).items;
      const deleted: Comment[] = [];

      for (const reply of replies) {
        if (await repositories.comments.delete(site.id, reply.id)) {
          deleted.push(reply);
        }
      }

      const rootDeleted = await repositories.comments.delete(site.id, comment.id);
      if (!rootDeleted) {
        return errorResponse(409, 'COMMENT_DELETE_FAILED', 'Unable to delete comment', requestId);
      }
      deleted.unshift(comment);

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'comment',
        entityId: comment.id,
        action: 'comment.delete',
        before: comment,
        after: null,
        metadata: {
          permission: 'comments.manage',
          targetType: comment.targetType,
          targetId: comment.targetId,
          deletedCount: deleted.length,
          deletedIds: deleted.map((item) => item.id),
        },
        requestId,
      });

      return privateResponse({
        success: true,
        requestId,
        data: {
          deleted,
          deletedCount: deleted.length,
        },
        deleted,
        deletedCount: deleted.length,
      }, requestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.siteId !== site.id) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
    }

    const replies = comment.parentId
      ? []
      : listComments(site.id, {
        status: 'all',
        parentOnly: true,
        parentId: comment.id,
        limit: 100,
      }).comments;
    const deleted: Comment[] = [];

    for (const reply of replies) {
      const deletedReply = deleteCommentRecord(reply.id);
      if (deletedReply) {
        deleted.push(deletedReply);
      }
    }

    const deletedComment = deleteCommentRecord(comment.id);
    if (!deletedComment) {
      return errorResponse(409, 'COMMENT_DELETE_FAILED', 'Unable to delete comment', requestId);
    }
    deleted.unshift(deletedComment);

    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'comment',
      entityId: comment.id,
      action: 'comment.delete',
      before: comment,
      after: null,
      metadata: {
        permission: 'comments.manage',
        targetType: comment.targetType,
        targetId: comment.targetId,
        deletedCount: deleted.length,
        deletedIds: deleted.map((item) => item.id),
      },
      requestId,
    });

    return privateResponse({
      success: true,
      requestId,
      data: {
        deleted,
        deletedCount: deleted.length,
      },
      deleted,
      deletedCount: deleted.length,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
