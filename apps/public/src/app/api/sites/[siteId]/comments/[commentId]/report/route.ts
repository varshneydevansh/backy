import { NextRequest, NextResponse } from 'next/server';
import {
  getCommentById,
  getSiteByIdOrSlug,
  getCommentReportReasons,
  reportComment,
} from '@/lib/backyStore';
import {
  reportRepositoryComment,
  resolveRepositorySite,
} from '@/lib/commentRepositorySupport';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
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

function parseTextInput(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseReason(raw: unknown): string {
  const value = parseTextInput(raw);
  if (!value) {
    return '';
  }

  const reasons = getCommentReportReasons();
  const matched = reasons.find((reason) => reason === value);
  return matched || '';
}

function parseBody(raw: unknown): {
  reason: string;
  actor?: string;
  requestId?: string;
} | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const reason = parseReason((raw as { reason?: unknown }).reason);
  const actor = parseTextInput((raw as { actor?: unknown }).actor);
  const requestId = parseTextInput((raw as { requestId?: unknown }).requestId);

  if (!reason) {
    return null;
  }

  return {
    reason,
    actor: actor || undefined,
    requestId: requestId || undefined,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const requestId = _request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const reasons = getCommentReportReasons();
      return NextResponse.json({
        success: true,
        requestId,
        data: {
          reasons,
        },
        reasons,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const reasons = getCommentReportReasons();
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        reasons,
      },
      reasons,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. reason is required.', baseRequestId);
      }
      const requestId = payload.requestId || baseRequestId;

      const updated = await reportRepositoryComment(repositories, site.id, comment, {
        reason: payload.reason,
        actor: payload.actor,
        requestId: payload.requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          comment: updated,
        },
        comment: updated,
      }, { status: 201 });
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
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload. reason is required.', baseRequestId);
    }
    const requestId = payload.requestId || baseRequestId;

    const updated = reportComment({
      commentId: comment.id,
      siteId: site.id,
      reason: payload.reason,
      actor: payload.actor,
      requestId: payload.requestId,
    });

    if (!updated) {
      return errorResponse(409, 'COMMENT_REPORT_FAILED', 'Unable to process report', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        comment: updated,
      },
      comment: updated,
    }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}
