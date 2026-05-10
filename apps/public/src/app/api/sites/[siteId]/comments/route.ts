import { NextRequest } from 'next/server';
import {
  bulkClearCommentReports,
  bulkUpdateCommentStatus,
  getSiteByIdOrSlug,
  listComments,
} from '@/lib/backyStore';
import {
  clearRepositoryCommentReports,
  resolveRepositorySite,
  updateRepositoryCommentStatus,
} from '@/lib/commentRepositorySupport';
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

function parseStatus(raw: string | null): CommentStatusFilter {
  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam' ||
    raw === 'blocked' ||
    raw === 'all'
  ) {
    return raw;
  }

  return 'all';
}

function parseModerationStatus(raw: string | null): CommentModerationStatus | null {
  const status = parseStatus(raw);
  return status === 'all' ? null : status;
}

function parseTargetType(raw: string | null): CommentTargetType | 'all' {
  if (raw === 'page' || raw === 'post' || raw === 'all') {
    return raw;
  }

  return 'all';
}

function parseSort(raw: string | null) {
  return raw === 'oldest' ? 'oldest' : 'newest';
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

  const status = parseModerationStatus(typeof (raw as { status?: unknown }).status === 'string'
    ? ((raw as { status: string }).status)
    : null);

  const commentIds = parseCommentIds((raw as { commentIds?: unknown }).commentIds);
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const { searchParams } = new URL(request.url);
      const status = parseStatus(searchParams.get('status'));
      const targetType = parseTargetType(searchParams.get('targetType'));
      const targetId = searchParams.get('targetId') || undefined;
      const requestId = parseRequestId(searchParams.get('requestId'));
      const q = parseSearchQuery(searchParams.get('q'));
      const parentId = searchParams.get('parentId');
      const parentOnly = parseBoolean(searchParams.get('parentOnly'));
      const sort = parseSort(searchParams.get('sort'));
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const result = await repositories.comments.list({
        siteId: site.id,
        targetType: targetType === 'all' ? undefined : targetType,
        targetId,
        status,
        requestId,
        q,
        parentOnly,
        parentId: parentId || null,
        sort,
        limit: Number.isFinite(limit) ? limit : 20,
        offset: Number.isFinite(offset) ? offset : 0,
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

    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const targetType = parseTargetType(searchParams.get('targetType'));
    const targetId = searchParams.get('targetId') || undefined;
    const requestId = parseRequestId(searchParams.get('requestId'));
    const q = parseSearchQuery(searchParams.get('q'));
    const parentId = searchParams.get('parentId');
    const parentOnly = parseBoolean(searchParams.get('parentOnly'));
    const sort = parseSort(searchParams.get('sort'));
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = listComments(site.id, {
      targetType,
      targetId,
      status,
      requestId,
      q,
      parentOnly,
      parentId: parentId || null,
      sort,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
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

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const payload = parsePatchPayload(await request.json().catch(() => null));
      if (!payload || (!payload.status && !payload.clearReports) || payload.commentIds.length === 0) {
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
    if (!payload || (!payload.status && !payload.clearReports) || payload.commentIds.length === 0) {
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
