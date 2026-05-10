import { NextRequest } from 'next/server';
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
import { normalizeSiteCommentPolicy } from '@/lib/commentPolicy';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
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
      return publicContractJson({
        success: true,
        requestId,
        data: {
          reasons,
        },
        reasons,
      }, {
        requestId,
        request: _request,
        cache: 'discovery',
        siteId: site.id,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const reasons = getCommentReportReasons();
    return publicContractJson({
      success: true,
      requestId,
      data: {
        reasons,
      },
      reasons,
    }, {
      requestId,
      request: _request,
      cache: 'discovery',
      siteId: site.id,
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

      if (!normalizeSiteCommentPolicy(site.settings?.commentPolicy).enableReports) {
        return errorResponse(403, 'COMMENT_REPORTS_DISABLED', 'Comment reporting is disabled for this site.', baseRequestId);
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

      return privateResponse({
        success: true,
        requestId,
        data: {
          comment: updated,
        },
        comment: updated,
      }, requestId, 201);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', baseRequestId);
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.siteId !== site.id) {
      return errorResponse(404, 'COMMENT_NOT_FOUND', 'Comment not found', baseRequestId);
    }

    if (!normalizeSiteCommentPolicy(site.settings?.commentPolicy).enableReports) {
      return errorResponse(403, 'COMMENT_REPORTS_DISABLED', 'Comment reporting is disabled for this site.', baseRequestId);
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

    return privateResponse({
      success: true,
      requestId,
      data: {
        comment: updated,
      },
      comment: updated,
    }, requestId, 201);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}
