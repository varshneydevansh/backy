import { NextRequest, NextResponse } from 'next/server';
import {
  deleteCommentSubtree,
  getCommentById,
  getSiteByIdOrSlug,
  updateCommentStatus,
  updateCommentThread,
} from '@/lib/backyStore';
import { BackyCommentLifecycleError } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { isCommentPubliclyVisible, hasCommentCredentials, serializeComment } from '@/lib/commentPrivacy';
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

      const includePrivateFields = comment.status !== 'approved' || hasCommentCredentials(_request);
      if (includePrivateFields) {
        const access = await requireAdminAccess(_request, requestId, { permission: 'comments.view' });
        if (access instanceof NextResponse) {
          return access;
        }
      }

      if (!includePrivateFields && !await isCommentPubliclyVisible(site, comment, repositories)) {
        return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
      }

      return privateResponse({
        success: true,
        requestId,
        data: {
          comment: serializeComment(comment, includePrivateFields),
        },
        comment: serializeComment(comment, includePrivateFields),
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

    const includePrivateFields = comment.status !== 'approved' || hasCommentCredentials(_request);
    if (includePrivateFields) {
      const access = await requireAdminAccess(_request, requestId, { permission: 'comments.view' });
      if (access instanceof NextResponse) {
        return access;
      }
    }

    if (!includePrivateFields && !await isCommentPubliclyVisible(site, comment)) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
    }

    return privateResponse({
      success: true,
      requestId,
      data: {
        comment: serializeComment(comment, includePrivateFields),
      },
      comment: serializeComment(comment, includePrivateFields),
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

      const completionWarnings: string[] = [];
      let updated: Comment;
      if (payload.status) {
        updated = await updateRepositoryCommentStatus(repositories, site.id, comment, {
          completionWarnings,
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
          completionWarnings,
        });
      }
      try { const delivery = await notifyCommentDelivery({
        repositories,
        siteId: site.id,
        comment: updated,
        kind: 'comment-status',
        requestId,
        reason: payload.status || 'thread-updated',
        actor: payload.actor || payload.reviewedBy,
      }); if (delivery.failedChannels > 0 && !completionWarnings.includes("COMMENT_DELIVERY_PENDING")) completionWarnings.push("COMMENT_DELIVERY_PENDING"); } catch { if (!completionWarnings.includes("COMMENT_DELIVERY_PENDING")) completionWarnings.push("COMMENT_DELIVERY_PENDING"); }
      try { await recordAdminAudit({
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
      }); } catch { if (!completionWarnings.includes("COMMENT_AUDIT_PENDING")) completionWarnings.push("COMMENT_AUDIT_PENDING"); }

      return privateResponse({
        success: true,
        requestId,
        data: {
          comment: updated as Comment,
          completionWarnings,
        },
        comment: updated as Comment,
        completionWarnings,
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

    const completionWarnings: string[] = [];
    let updated: Comment | undefined;
    if (payload.status) {
      updated = updateCommentStatus(comment.id, {
        status: payload.status,
        reviewedBy: payload.reviewedBy || null,
        actor: payload.actor,
        rejectionReason: payload.rejectionReason || null,
        blockReason: payload.blockReason || null,
        requestId: payload.requestId,
      }, site.id);
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
    try { const delivery = await notifyCommentDelivery({
      siteId: site.id,
      comment: updated,
      kind: 'comment-status',
      requestId,
      reason: payload.status || 'thread-updated',
      actor: payload.actor || payload.reviewedBy,
    }); if (delivery.failedChannels > 0 && !completionWarnings.includes("COMMENT_DELIVERY_PENDING")) completionWarnings.push("COMMENT_DELIVERY_PENDING"); } catch { if (!completionWarnings.includes("COMMENT_DELIVERY_PENDING")) completionWarnings.push("COMMENT_DELIVERY_PENDING"); }
    try { await recordAdminAudit({
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
    }); } catch { if (!completionWarnings.includes("COMMENT_AUDIT_PENDING")) completionWarnings.push("COMMENT_AUDIT_PENDING"); }

    return privateResponse({
      success: true,
      requestId,
      data: {
        comment: updated as Comment,
        completionWarnings,
      },
      comment: updated as Comment,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    if (['COMMENT_MODERATION_UNAVAILABLE', 'COMMENT_INVENTORY_INCOMPLETE'].includes((error as { code?: string })?.code || '')) return errorResponse(503, (error as { code: string }).code, 'The comment could not be moderated atomically. No moderation was committed.', baseRequestId);
    if (['COMMENT_MODERATION_CONFLICT', 'COMMENT_PARENT_CONFLICT', 'COMMENT_TREE_INVALID'].includes((error as { code?: string })?.code || '')) return errorResponse(409, (error as { code: string }).code, 'The comment parent changed or is invalid. Reload the thread before retrying.', baseRequestId);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) return access;
  try {
    const { siteId, commentId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await resolveRepositorySite(repositories, siteId) : getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    if (repositories && typeof repositories.comments.deleteSubtree !== 'function') return errorResponse(503, 'COMMENT_LIFECYCLE_UNAVAILABLE', 'Atomic comment deletion is unavailable. Configure a supported repository before retrying.', requestId);
    const deleted = repositories ? await repositories.comments.deleteSubtree(site.id, commentId) : await deleteCommentSubtree(site.id, commentId);
    if (!deleted.length) return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
    const comment = deleted[0], completionWarnings: string[] = [];
    // The content transaction has committed. Follow-up audit failure cannot undo deletion.
    try {
      await recordAdminAudit({ repositories, siteId: site.id, actorId: access.session?.user.id,
        entity: 'comment', entityId: comment.id, action: 'comment.delete', before: comment, after: null,
        metadata: { permission: 'comments.manage', targetType: comment.targetType, targetId: comment.targetId,
          deletedCount: deleted.length, deletedIds: deleted.map(item => item.id) }, requestId });
    } catch { completionWarnings.push('COMMENT_AUDIT_PENDING'); }
    return privateResponse({ success: true, requestId,
      data: { deleted, deletedCount: deleted.length, completionWarnings,
        concurrencyBoundary: repositories ? 'database-site-row-lock' : 'demo-single-process' },
      deleted, deletedCount: deleted.length }, requestId);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (error instanceof BackyCommentLifecycleError || ['COMMENT_INVENTORY_INCOMPLETE', 'COMMENT_TREE_INVALID', 'COMMENT_PARENT_CONFLICT', 'COMMENT_LIFECYCLE_UNAVAILABLE'].includes(code || '')) {
      const status = code === 'COMMENT_INVENTORY_INCOMPLETE' || code === 'COMMENT_LIFECYCLE_UNAVAILABLE' ? 503 : 409;
      const message = code === 'COMMENT_TREE_INVALID' ? 'The selected comment subtree has invalid parent or target relationships. Repair the thread before deleting it.' : code === 'COMMENT_PARENT_CONFLICT' ? 'The comment site or parent changed. Reload the thread before retrying.' : 'The complete comment subtree could not be deleted safely. Retry after storage access is restored.';
      return errorResponse(status, code!, message, requestId);
    }
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
