import { NextRequest, NextResponse } from 'next/server';
import {
  getCommentById,
  getPageSummary,
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
    pageId: string;
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
    const { siteId, pageId, commentId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const page = await repositories.pages.getById(site.id, pageId);
      if (!page) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      const comment = await repositories.comments.getById(site.id, commentId);
      if (!comment || comment.targetType !== 'page' || comment.targetId !== pageId) {
        return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
      }

      if (comment.status !== 'approved') {
        const access = requireAdminAccess(_request, requestId, { permission: 'comments.view' });
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

    const pages = getPageSummary(site.id, { includeUnpublished: true });
    const pageExists = pages.some((page) => page.id === pageId);
    if (!pageExists) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.targetType !== 'page' || comment.targetId !== pageId) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', requestId);
    }

    if (comment.status !== 'approved') {
      const access = requireAdminAccess(_request, requestId, { permission: 'comments.view' });
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
  const access = requireAdminAccess(request, baseRequestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId, commentId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', baseRequestId);
      }

      const page = await repositories.pages.getById(site.id, pageId);
      if (!page) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', baseRequestId);
      }

      const targetComment = await repositories.comments.getById(site.id, commentId);
      if (!targetComment || targetComment.targetType !== 'page' || targetComment.targetId !== pageId) {
        return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', baseRequestId);
      }

      const body = parseBody(await request.json().catch(() => null));
      if (!body || !body.status) {
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

    const pageExists = getPageSummary(site.id, { includeUnpublished: true }).some((page) => page.id === pageId);
    if (!pageExists) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', baseRequestId);
    }

    const targetComment = getCommentById(commentId);
    if (!targetComment || targetComment.targetType !== 'page' || targetComment.targetId !== pageId) {
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
