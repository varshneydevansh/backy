import { NextRequest, NextResponse } from 'next/server';
import type { Comment, CommentStatus } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { resolveCommentSubmissionPolicy } from '@/lib/commentPolicy';
import {
  createComment,
  getCommentById,
  getCommentsByTarget,
  getPageSummary,
  getSiteByIdOrSlug,
  validateAndClassifyComment,
} from '@/lib/backyStore';
import {
  recordRepositoryInteractionEvent,
  resolveRepositorySite,
} from '@/lib/commentRepositorySupport';
import { commentCaptchaFailurePayload, verifyCommentCaptcha } from '@/lib/commentCaptcha';
import { notifyCommentDelivery } from '@/lib/commentDelivery';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

type CommentStatusFilter = CommentStatus | 'all';
type CommentSort = 'newest' | 'oldest';

function parseStatus(raw: string | null): { value: CommentStatusFilter; invalid?: string } {
  if (raw === null || raw.trim() === '') {
    return { value: 'approved' };
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

  return { value: 'approved', invalid: raw };
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

function parseTextInput(raw: unknown) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseStartedAt(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function generateRequestId(raw?: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractIpHash(request: NextRequest): string | null {
  const forwardHeader =
    request.headers.get('x-forwarded-for') || request.headers.get('x-vercel-forwarded-for');

  if (!forwardHeader) {
    return null;
  }

  return forwardHeader
    .split(',')
    .map((value) => value.trim())
    .find(Boolean) || null;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const privateResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: 'private',
  })
);

const contractResponse = <TBody>(body: TBody, requestId: string, status = 200) => (
  publicContractJson(body, {
    status,
    requestId,
    cache: status >= 400 ? 'error' : 'private',
  })
);

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        details,
      },
      errorMessage: message,
    },
    { status, requestId, cache: 'error' },
  )
);

const pageCommentValidationResponse = (
  requestId: string,
  details: Record<string, string>,
  status = 422,
  extra: { status?: Comment['status']; spamFlags?: string[] } = {},
) => {
  const message = 'Validation failed';

  return contractResponse(
    {
      success: false,
      requestId,
      error: {
        code: 'VALIDATION_ERROR',
        message,
      },
      errorMessage: message,
      details,
      validation: Object.entries(details).map(([field, fieldMessage]) => ({
        field,
        code: 'invalid',
        message: fieldMessage,
      })),
      status: extra.status,
      spamFlags: extra.spamFlags,
      message,
    },
    requestId,
    status,
  );
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    const { searchParams } = new URL(request.url);

    const statusFilter = parseStatus(searchParams.get('status'));
    if (statusFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_PAGE_COMMENT_STATUS',
        'Invalid page comment status filter. Use pending, approved, rejected, spam, blocked, or all.',
        requestId,
      );
    }
    const status = statusFilter.value;
    const parentId = searchParams.get('parentId');
    const parentOnly = searchParams.get('parentOnly') === 'true' || Boolean(parentId);
    const sortFilter = parseSort(searchParams.get('sort'));
    if (sortFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_PAGE_COMMENT_SORT',
        'Invalid page comment sort. Use newest or oldest.',
        requestId,
      );
    }
    const sort = sortFilter.value;
    const commentThreadId = parseTextInput(searchParams.get('commentThreadId'));
    const limitFilter = parseBoundedInteger(searchParams.get('limit'), 20, 1, 100);
    if (limitFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_PAGE_COMMENT_LIMIT',
        'Invalid page comment limit. Use an integer from 1 to 100.',
        requestId,
      );
    }
    const offsetFilter = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    if (offsetFilter.invalid) {
      return errorResponse(
        400,
        'INVALID_PAGE_COMMENT_OFFSET',
        'Invalid page comment offset. Use an integer greater than or equal to 0.',
        requestId,
      );
    }
    const limit = limitFilter.value;
    const offset = offsetFilter.value;

    if (status !== 'approved') {
      const access = await requireAdminAccess(request, requestId, { permission: 'comments.view' });
      if (access instanceof NextResponse) {
        return access;
      }
    }

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

      const result = await repositories.comments.list({
        siteId: site.id,
        targetType: 'page',
        targetId: pageId,
        commentThreadId: commentThreadId || undefined,
        status,
        parentOnly,
        parentId: parentId || null,
        sort,
        limit,
        offset,
      });

      return privateResponse({
        success: true,
        requestId,
        data: {
          comments: result.items,
          count: result.pagination.total,
          pagination: result.pagination,
        },
        comments: result.items,
        count: result.pagination.total,
        pagination: result.pagination,
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

    const comments = getCommentsByTarget(site.id, {
      targetType: 'page',
      targetId: pageId,
      commentThreadId: commentThreadId || undefined,
      status,
      limit,
      offset,
    });

    const filtered = parentOnly
      ? comments.comments.filter((comment) => (parentId ? comment.parentId === parentId : comment.parentId == null))
      : comments.comments;

    const sorted = [...filtered].sort((a, b) =>
      sort === 'oldest'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return privateResponse({
      success: true,
      requestId,
      data: {
        comments: sorted,
        count: comments.count,
        pagination: comments.pagination,
      },
      comments: sorted,
      count: comments.count,
      pagination: comments.pagination,
    }, requestId);
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const page = await repositories.pages.getById(site.id, pageId);
      if (!page) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', responseRequestId);
      }

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
      }

      const content = parseTextInput(body.content || (body as { body?: unknown }).body);

      if (content.length === 0) {
        return pageCommentValidationResponse(responseRequestId, { content: 'Comment content is required' });
      }

      const policy = resolveCommentSubmissionPolicy(site.settings?.commentPolicy, body);
      const userId = parseTextInput(
        (body as { userId?: unknown }).userId || (body as { commentUserId?: unknown }).commentUserId,
      );

      const authorName = parseTextInput(body.authorName);
      const authorEmail = parseTextInput(body.authorEmail);
      const authorWebsite = parseTextInput(body.authorWebsite);
      const parentId = typeof body.parentId === 'string' ? body.parentId : null;
      const commentThreadId = parseTextInput(
        (body as { commentThreadId?: unknown }).commentThreadId || (body as { threadId?: unknown }).threadId,
      );
      const requestId = generateRequestId(parseTextInput(body.requestId) || undefined);
      const startedAt = parseStartedAt(body.startedAt);
      const honeypot = parseTextInput(body.honeypot);
      const ipHash = extractIpHash(request);

      if (!policy.enabled) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Comments closed',
            details: { content: policy.closedMessage },
          },
          responseRequestId,
          403,
        );
      }

      if (!policy.allowGuests && !userId) {
        return pageCommentValidationResponse(responseRequestId, {
          authorName: 'Guests are disabled for this comment block.',
        }, 403);
      }

      if (policy.requireName && authorName.length === 0) {
        return pageCommentValidationResponse(responseRequestId, { authorName: 'Name is required' });
      }

      if (policy.requireEmail && authorEmail.length === 0) {
        return pageCommentValidationResponse(responseRequestId, { authorEmail: 'Email is required' });
      }

      if (parentId && !policy.allowReplies) {
        return pageCommentValidationResponse(responseRequestId, {
          parentId: 'Replies are not enabled for this comment block',
        });
      }

      const captchaFailure = await verifyCommentCaptcha({
        policy,
        body,
        requestId,
        siteId: site.id,
        targetType: 'page',
        targetId: pageId,
      });
      if (captchaFailure) {
        const failure = commentCaptchaFailurePayload(captchaFailure, requestId);
        return contractResponse(failure.body, requestId, failure.status);
      }

      let parent: Comment | null = null;
      if (parentId) {
        parent = await repositories.comments.getById(site.id, parentId);
        if (!parent || parent.targetType !== 'page' || parent.targetId !== pageId) {
          return pageCommentValidationResponse(responseRequestId, {
            parentId: 'The selected parent comment does not belong to this target.',
          });
        }

        if (parent.commentThreadId && parent.commentThreadId !== commentThreadId) {
          return pageCommentValidationResponse(responseRequestId, {
            parentId: 'The selected parent comment belongs to a different thread.',
          });
        }
      }

      const resolvedCommentThreadId = commentThreadId || parent?.commentThreadId || undefined;

      const classification = validateAndClassifyComment({
        siteId: site.id,
        targetType: 'page',
        targetId: pageId,
        content,
        authorEmail,
        moderationMode: policy.moderationMode,
        honeypot,
        ipHash,
        requestId,
        startedAt,
        blockedTerms: policy.blockedTerms,
      });

      if (!classification.ok) {
        return pageCommentValidationResponse(
          responseRequestId,
          { content: classification.spamMessage || 'Comment rejected.' },
          422,
          {
            status: classification.status,
            spamFlags: classification.spamFlags,
          },
        );
      }

      const comment = (await repositories.comments.create({
        siteId: site.id,
        targetType: 'page',
        targetId: pageId,
        content,
        authorName,
        authorEmail,
        authorWebsite,
        commentThreadId: resolvedCommentThreadId,
        userId,
        parentId,
        requestId,
        ipHash,
        status: classification.status,
      })).item;
      await recordRepositoryInteractionEvent(repositories, {
        kind: 'comment-submitted',
        siteId: comment.siteId,
        commentId: comment.id,
        target: `comment:${comment.id}`,
        status: 'succeeded',
        requestId: comment.requestId,
        reason: comment.status,
        metadata: {
          targetType: comment.targetType,
          targetId: comment.targetId,
          status: comment.status,
          parentId: comment.parentId,
          hasAuthorEmail: Boolean(comment.authorEmail),
          hasAuthorWebsite: Boolean(comment.authorWebsite),
        },
      });
      await notifyCommentDelivery({
        repositories,
        siteId: site.id,
        comment,
        kind: 'comment-submitted',
        requestId: comment.requestId,
        reason: comment.status,
      });

      return privateResponse(
        {
          success: true,
          requestId: responseRequestId,
          data: {
            comment,
            message:
              comment.status === 'approved'
                ? 'Comment submitted and published.'
                : 'Comment submitted for moderation.',
          },
          comment,
          message:
            comment.status === 'approved'
              ? 'Comment submitted and published.'
              : 'Comment submitted for moderation.',
        },
        responseRequestId,
        201,
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const pages = getPageSummary(site.id, { includeUnpublished: true });
    const pageExists = pages.some((page) => page.id === pageId);
    if (!pageExists) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', responseRequestId);
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
    }

    const content = parseTextInput(body.content || (body as { body?: unknown }).body);

    if (content.length === 0) {
      return pageCommentValidationResponse(responseRequestId, { content: 'Comment content is required' });
    }

    const policy = resolveCommentSubmissionPolicy(site.settings?.commentPolicy, body);
    const userId = parseTextInput(
      (body as { userId?: unknown }).userId || (body as { commentUserId?: unknown }).commentUserId,
    );

    const authorName = parseTextInput(body.authorName);
    const authorEmail = parseTextInput(body.authorEmail);
    const authorWebsite = parseTextInput(body.authorWebsite);
    const parentId = typeof body.parentId === 'string' ? body.parentId : null;
    const commentThreadId = parseTextInput(
      (body as { commentThreadId?: unknown }).commentThreadId || (body as { threadId?: unknown }).threadId,
    );
    const requestId = generateRequestId(parseTextInput(body.requestId) || undefined);
    const startedAt = parseStartedAt(body.startedAt);
    const honeypot = parseTextInput(body.honeypot);
    const ipHash = extractIpHash(request);

    if (!policy.enabled) {
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Comments closed',
          details: { content: policy.closedMessage },
        },
        responseRequestId,
        403,
      );
    }

    if (!policy.allowGuests && !userId) {
      return pageCommentValidationResponse(responseRequestId, {
        authorName: 'Guests are disabled for this comment block.',
      }, 403);
    }

    if (policy.requireName && authorName.length === 0) {
      return pageCommentValidationResponse(responseRequestId, { authorName: 'Name is required' });
    }

    if (policy.requireEmail && authorEmail.length === 0) {
      return pageCommentValidationResponse(responseRequestId, { authorEmail: 'Email is required' });
    }

    if (parentId && !policy.allowReplies) {
      return pageCommentValidationResponse(responseRequestId, {
        parentId: 'Replies are not enabled for this comment block',
      });
    }

    const captchaFailure = await verifyCommentCaptcha({
      policy,
      body,
      requestId,
      siteId: site.id,
      targetType: 'page',
      targetId: pageId,
    });
    if (captchaFailure) {
      const failure = commentCaptchaFailurePayload(captchaFailure, requestId);
      return contractResponse(failure.body, requestId, failure.status);
    }

    let parent: ReturnType<typeof getCommentById> | undefined;
    if (parentId) {
      parent = getCommentById(parentId);
      if (!parent || parent.siteId !== site.id || parent.targetType !== 'page' || parent.targetId !== pageId) {
        return pageCommentValidationResponse(responseRequestId, {
          parentId: 'The selected parent comment does not belong to this target.',
        });
      }

      if (parent.commentThreadId && parent.commentThreadId !== commentThreadId) {
        return pageCommentValidationResponse(responseRequestId, {
          parentId: 'The selected parent comment belongs to a different thread.',
        });
      }
    }

    const resolvedCommentThreadId = commentThreadId || parent?.commentThreadId || undefined;

    const classification = validateAndClassifyComment({
      siteId: site.id,
      targetType: 'page',
      targetId: pageId,
      content,
      authorEmail,
      moderationMode: policy.moderationMode,
      honeypot,
      ipHash,
      requestId,
      startedAt,
      blockedTerms: policy.blockedTerms,
    });

    if (!classification.ok) {
      return pageCommentValidationResponse(
        responseRequestId,
        { content: classification.spamMessage || 'Comment rejected.' },
        422,
        {
          status: classification.status,
          spamFlags: classification.spamFlags,
        },
      );
    }

    const comment = createComment({
      siteId: site.id,
      targetType: 'page',
      targetId: pageId,
      content,
      authorName,
      authorEmail,
      authorWebsite,
      commentThreadId: resolvedCommentThreadId,
      userId,
      parentId,
      requestId,
      ipHash,
      status: classification.status,
    });
    await notifyCommentDelivery({
      siteId: site.id,
      comment,
      kind: 'comment-submitted',
      requestId: comment.requestId,
      reason: comment.status,
    });

    return privateResponse(
      {
        success: true,
        requestId: responseRequestId,
        data: {
          comment,
          message:
            comment.status === 'approved'
              ? 'Comment submitted and published.'
              : 'Comment submitted for moderation.',
        },
        comment,
        message:
          comment.status === 'approved'
            ? 'Comment submitted and published.'
            : 'Comment submitted for moderation.',
      },
      responseRequestId,
      201,
    );
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}
