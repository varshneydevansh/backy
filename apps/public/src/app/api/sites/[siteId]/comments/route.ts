import { NextRequest, NextResponse } from 'next/server';
import {
  bulkClearCommentReports,
  bulkUpdateCommentStatus,
  getSiteByIdOrSlug,
  listComments,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  clearRepositoryCommentReports,
  resolveRepositorySite,
  updateRepositoryCommentStatus,
} from '@/lib/commentRepositorySupport';
import { notifyCommentDelivery } from '@/lib/commentDelivery';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { CommentStatus, CommentTargetType } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type CommentStatusFilter = CommentStatus | 'all';
type CommentModerationStatus = CommentStatus;
type CommentTargetTypeFilter = CommentTargetType | 'all';
type CommentSort = 'newest' | 'oldest';

function parseStatus(raw: string | null): { value: CommentStatusFilter; invalid?: string } {
  if (raw === null || raw.trim() === '') {
    return { value: 'all' };
  }

  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam' ||
    raw === 'blocked' ||
    raw === 'all'
  ) {
    return { value: raw };
  }

  return { value: 'all', invalid: raw };
}

function parseModerationStatus(raw: string | null): CommentModerationStatus | null {
  const status = parseStatus(raw).value;
  return status === 'all' ? null : status;
}

function parseTargetType(raw: string | null): { value: CommentTargetTypeFilter; invalid?: string } {
  if (raw === null || raw.trim() === '') {
    return { value: 'all' };
  }

  if (raw === 'page' || raw === 'post' || raw === 'all') {
    return { value: raw };
  }

  return { value: 'all', invalid: raw };
}

function parseSort(raw: string | null): { value: CommentSort; invalid?: string } {
  if (raw === null || raw.trim() === '') {
    return { value: 'newest' };
  }

  if (raw === 'oldest' || raw === 'newest') {
    return { value: raw };
  }

  return { value: 'newest', invalid: raw };
}

function parseBoolean(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

function parseRequestId(raw: string | null): string | undefined {
  const value = raw ? raw.trim() : '';
  return value.length ? value : undefined;
}

function parseSearchQuery(raw: string | null): string | undefined {
  const value = raw ? raw.trim() : '';
  return value.length ? value : undefined;
}

function parseBoundedInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number = Number.MAX_SAFE_INTEGER,
): { value: number; invalid?: string } {
  if (raw === null || raw.trim() === '') {
    return { value: fallback };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { value: fallback, invalid: raw };
  }

  return { value: parsed };
}

function parseCommentIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parsePatchPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const statusRaw = typeof (raw as { status?: unknown }).status === 'string'
    ? ((raw as { status: string }).status)
    : null;
  const status = parseModerationStatus(statusRaw);
  const statusProvided = Object.prototype.hasOwnProperty.call(raw, 'status');

  const commentIds = parseCommentIds(
    (raw as { commentIds?: unknown }).commentIds ?? (raw as { ids?: unknown }).ids,
  );
  const reviewedBy = typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
    ? (raw as { reviewedBy: string }).reviewedBy.trim()
    : undefined;
  const actor = typeof (raw as { actor?: unknown }).actor === 'string'
    ? (raw as { actor: string }).actor.trim()
    : undefined;
  const rejectionReason = typeof (raw as { rejectionReason?: unknown }).rejectionReason === 'string'
    ? (raw as { rejectionReason: string }).rejectionReason.trim()
    : undefined;
  const blockReason = typeof (raw as { blockReason?: unknown }).blockReason === 'string'
    ? (raw as { blockReason: string }).blockReason.trim()
    : undefined;
  const requestId = parseRequestId(typeof (raw as { requestId?: unknown }).requestId === 'string'
    ? (raw as { requestId: string }).requestId
    : null);
  const action = typeof (raw as { action?: unknown }).action === 'string'
    ? (raw as { action: string }).action.trim()
    : undefined;
  const clearReports = (raw as { clearReports?: unknown }).clearReports === true || action === 'clearReports';

  return {
    status,
    statusProvided,
    commentIds,
    reviewedBy: reviewedBy || undefined,
    actor: actor || undefined,
    rejectionReason: rejectionReason || undefined,
    blockReason: blockReason || undefined,
    requestId,
    clearReports,
  };
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

const invalidSiteCommentStatusResponse = (requestId: string) => errorResponse(
  400,
  'INVALID_SITE_COMMENT_STATUS',
  'Invalid site comment status. Use pending, approved, rejected, spam, or blocked.',
  requestId,
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const statusFilter = parseStatus(searchParams.get('status'));
    if (statusFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_SITE_COMMENT_STATUS',
        'Invalid site comment status filter. Use pending, approved, rejected, spam, blocked, or all.',
        responseRequestId,
      );
    }
    const status = statusFilter.value;
    const targetTypeFilter = parseTargetType(searchParams.get('targetType'));
    if (targetTypeFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_SITE_COMMENT_TARGET_TYPE',
        'Invalid site comment targetType filter. Use page, post, or all.',
        responseRequestId,
      );
    }
    const targetType = targetTypeFilter.value;
    const targetId = searchParams.get('targetId') || undefined;
    const requestId = parseRequestId(searchParams.get('requestId'));
    const q = parseSearchQuery(searchParams.get('q'));
    const parentId = searchParams.get('parentId');
    const parentOnly = parseBoolean(searchParams.get('parentOnly')) || Boolean(parentId);
    const commentThreadId = parseSearchQuery(searchParams.get('commentThreadId'));
    const sortFilter = parseSort(searchParams.get('sort'));
    if (sortFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_SITE_COMMENT_SORT',
        'Invalid site comment sort. Use newest or oldest.',
        responseRequestId,
      );
    }
    const sort = sortFilter.value;
    const limitFilter = parseBoundedInteger(searchParams.get('limit'), 20, 1, 100);
    if (limitFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_SITE_COMMENT_LIMIT',
        'Invalid site comment limit. Use an integer from 1 to 100.',
        responseRequestId,
      );
    }
    const offsetFilter = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    if (offsetFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_SITE_COMMENT_OFFSET',
        'Invalid site comment offset. Use an integer greater than or equal to 0.',
        responseRequestId,
      );
    }
    const limit = limitFilter.value;
    const offset = offsetFilter.value;

    if (status !== 'approved') {
      const access = await requireAdminAccess(request, responseRequestId, { permission: 'comments.view' });
      if (access instanceof NextResponse) {
        return access;
      }
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const result = await repositories.comments.list({
        siteId: site.id,
        targetType: targetType === 'all' ? undefined : targetType,
        targetId,
        status,
        requestId,
        q,
        parentOnly,
        parentId: parentId || null,
        commentThreadId,
        sort,
        limit,
        offset,
      });

      return privateResponse({
        success: true,
        requestId: responseRequestId,
        data: {
          siteId: site.id,
          comments: result.items,
          count: result.pagination.total,
          pagination: result.pagination,
        },
        siteId: site.id,
        comments: result.items,
        count: result.pagination.total,
        pagination: result.pagination,
      }, responseRequestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const result = listComments(site.id, {
      targetType,
      targetId,
      status,
      requestId,
      q,
      parentOnly,
      parentId: parentId || null,
      commentThreadId,
      sort,
      limit,
      offset,
    });

    return privateResponse({
      success: true,
      requestId: responseRequestId,
      data: {
        siteId: site.id,
        comments: result.comments,
        count: result.count,
        pagination: result.pagination,
      },
      siteId: site.id,
      comments: result.comments,
      count: result.count,
      pagination: result.pagination,
    }, responseRequestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, responseRequestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const payload = parsePatchPayload(await request.json().catch(() => null));
      if (!payload) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or clearReports plus commentIds are required.', responseRequestId);
      }
      if (payload.statusProvided && !payload.status) {
        return invalidSiteCommentStatusResponse(responseRequestId);
      }
      if ((!payload.status && !payload.clearReports) || payload.commentIds.length === 0) {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or clearReports plus commentIds are required.', responseRequestId);
      }

      const updated = [];
      const missingIds: string[] = [];
      for (const commentId of Array.from(new Set(payload.commentIds))) {
        const comment = await repositories.comments.getById(site.id, commentId);
        if (!comment) {
          missingIds.push(commentId);
          continue;
        }

        if (payload.status) {
          updated.push(await updateRepositoryCommentStatus(repositories, site.id, comment, {
            status: payload.status,
            reviewedBy: payload.reviewedBy,
            actor: payload.actor,
            rejectionReason: payload.rejectionReason,
            blockReason: payload.blockReason,
            requestId: payload.requestId,
            defaultReviewer: 'admin',
            clearReports: payload.clearReports,
          }));
        } else {
          updated.push(await clearRepositoryCommentReports(repositories, site.id, comment, {
            reviewedBy: payload.reviewedBy,
            actor: payload.actor,
            requestId: payload.requestId,
            defaultReviewer: 'admin',
          }));
        }
      }

      if (!updated.length) {
        return errorResponse(404, 'COMMENTS_NOT_UPDATED', 'No comments were updated.', responseRequestId);
      }
      await Promise.all(updated.map((comment) => notifyCommentDelivery({
        repositories,
        siteId: site.id,
        comment,
        kind: 'comment-status',
        requestId: payload.requestId || comment.requestId,
        reason: payload.status || 'reports-cleared',
        actor: payload.actor || payload.reviewedBy,
      })));
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'comment',
        entityId: updated.length === 1 ? updated[0].id : 'bulk',
        action: payload.status ? 'comment.moderate' : 'comment.reports.clear',
        metadata: {
          permission: 'comments.manage',
          status: payload.status || null,
          clearReports: payload.clearReports,
          updatedCount: updated.length,
          missingCount: missingIds.length,
          commentIds: updated.map((comment) => comment.id),
          targetTypes: Array.from(new Set(updated.map((comment) => comment.targetType))),
        },
        requestId: responseRequestId,
      });

      return privateResponse({
        success: true,
        requestId: responseRequestId,
        data: {
          siteId: site.id,
          updated,
          updatedCount: updated.length,
          missingIds,
        },
        siteId: site.id,
        updated,
        updatedCount: updated.length,
        missingIds,
      }, responseRequestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const payload = parsePatchPayload(await request.json().catch(() => null));
    if (!payload) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or clearReports plus commentIds are required.', responseRequestId);
    }
    if (payload.statusProvided && !payload.status) {
      return invalidSiteCommentStatusResponse(responseRequestId);
    }
    if ((!payload.status && !payload.clearReports) || payload.commentIds.length === 0) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. status or clearReports plus commentIds are required.', responseRequestId);
    }

    const result = payload.status
      ? bulkUpdateCommentStatus({
        siteId: site.id,
        commentIds: payload.commentIds,
        status: payload.status,
        reviewedBy: payload.reviewedBy,
        actor: payload.actor,
        rejectionReason: payload.rejectionReason,
        blockReason: payload.blockReason,
        requestId: payload.requestId,
        clearReports: payload.clearReports,
      })
      : bulkClearCommentReports({
        siteId: site.id,
        commentIds: payload.commentIds,
        reviewedBy: payload.reviewedBy,
        actor: payload.actor,
        requestId: payload.requestId,
      });

    if (!result.updated.length) {
      return errorResponse(404, 'COMMENTS_NOT_UPDATED', 'No comments were updated.', responseRequestId);
    }
    await Promise.all(result.updated.map((comment) => notifyCommentDelivery({
      siteId: site.id,
      comment,
      kind: 'comment-status',
      requestId: payload.requestId || comment.requestId,
      reason: payload.status || 'reports-cleared',
      actor: payload.actor || payload.reviewedBy,
    })));
    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'comment',
      entityId: result.updated.length === 1 ? result.updated[0].id : 'bulk',
      action: payload.status ? 'comment.moderate' : 'comment.reports.clear',
      metadata: {
        permission: 'comments.manage',
        status: payload.status || null,
        clearReports: payload.clearReports,
        updatedCount: result.updated.length,
        missingCount: result.missingIds.length,
        commentIds: result.updated.map((comment) => comment.id),
        targetTypes: Array.from(new Set(result.updated.map((comment) => comment.targetType))),
      },
      requestId: responseRequestId,
    });

    return privateResponse({
      success: true,
      requestId: responseRequestId,
      data: {
        siteId: site.id,
        updated: result.updated,
        updatedCount: result.updated.length,
        missingIds: result.missingIds,
      },
      siteId: site.id,
      updated: result.updated,
      updatedCount: result.updated.length,
      missingIds: result.missingIds,
    }, responseRequestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}
