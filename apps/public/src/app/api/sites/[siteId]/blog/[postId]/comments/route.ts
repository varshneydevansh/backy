import { NextRequest } from 'next/server';
import type { Comment } from '@backy-cms/core';
import { resolveCommentSubmissionPolicy } from '@/lib/commentPolicy';
import {
  createComment,
  getCommentById,
  getBlogPosts,
  getCommentsByTarget,
  getSiteByIdOrSlug,
  validateAndClassifyComment,
} from '@/lib/backyStore';
import {
  recordRepositoryInteractionEvent,
  resolveRepositorySite,
} from '@/lib/commentRepositorySupport';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

function parseStatus(raw: string | null) {
  if (!raw) return 'approved';
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
  return 'approved';
}

function parseSort(raw: string | null) {
  return raw === 'oldest' ? 'oldest' : 'newest';
}

function parseTextInput(raw: unknown) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') {
    return raw;
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw !== 0;
  }

  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true;
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false;
    }
  }

  return undefined;
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, postId } = await params;
    const { searchParams } = new URL(request.url);

    const status = parseStatus(searchParams.get('status'));
    const parentId = searchParams.get('parentId');
    const parentOnly = searchParams.get('parentOnly') === 'true' || Boolean(parentId);
    const sort = parseSort(searchParams.get('sort'));
    const commentThreadId = parseTextInput(searchParams.get('commentThreadId'));
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const post = await repositories.posts.getById(site.id, postId);
      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      }

      const result = await repositories.comments.list({
        siteId: site.id,
        targetType: 'post',
        targetId: postId,
        commentThreadId: commentThreadId || undefined,
        status,
        parentOnly,
        parentId: parentId || null,
        sort,
        limit: Number.isFinite(limit) ? limit : 20,
        offset: Number.isFinite(offset) ? offset : 0,
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

    const postResult = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = postResult.posts.some((post) => post.id === postId);
    if (!postExists) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    }

    const comments = getCommentsByTarget(site.id, {
      targetType: 'post',
      targetId: postId,
      commentThreadId: commentThreadId || undefined,
      status,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
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
    const { siteId, postId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
      }

      const post = await repositories.posts.getById(site.id, postId);
      if (!post) {
        return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', responseRequestId);
      }

      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') {
        return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
      }

      const content = parseTextInput(body.content || (body as { body?: unknown }).body);
      if (content.length === 0) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { content: 'Comment content is required' },
          },
          responseRequestId,
          422,
        );
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
      const rateLimitBypass = parseBoolean(body.rateLimitBypass) === true;
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
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { authorName: 'Guests are disabled for this comment block.' },
          },
          responseRequestId,
          403,
        );
      }

      if (policy.requireName && authorName.length === 0) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { authorName: 'Name is required' },
          },
          responseRequestId,
          422,
        );
      }

      if (policy.requireEmail && authorEmail.length === 0) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { authorEmail: 'Email is required' },
          },
          responseRequestId,
          422,
        );
      }

      if (parentId && !policy.allowReplies) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { parentId: 'Replies are not enabled for this comment block' },
          },
          responseRequestId,
          422,
        );
      }

      let parent: Comment | null = null;
      if (parentId) {
        parent = await repositories.comments.getById(site.id, parentId);
        if (!parent || parent.targetType !== 'post' || parent.targetId !== postId) {
          return contractResponse(
            {
              success: false,
              requestId: responseRequestId,
              error: 'Validation failed',
              details: { parentId: 'The selected parent comment does not belong to this target.' },
            },
            responseRequestId,
            422,
          );
        }

        if (parent.commentThreadId && commentThreadId && parent.commentThreadId !== commentThreadId) {
          return contractResponse(
            {
              success: false,
              requestId: responseRequestId,
              error: 'Validation failed',
              details: { parentId: 'The selected parent comment belongs to a different thread.' },
            },
            responseRequestId,
            422,
          );
        }
      }

      const resolvedCommentThreadId = commentThreadId || parent?.commentThreadId || undefined;

      const classification = validateAndClassifyComment({
        siteId: site.id,
        targetType: 'post',
        targetId: postId,
        content,
        authorEmail,
        moderationMode: policy.moderationMode,
        honeypot,
        ipHash,
        requestId,
        startedAt,
        rateLimitBypass,
        blockedTerms: policy.blockedTerms,
      });

      if (!classification.ok) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { content: classification.spamMessage || 'Comment rejected.' },
            status: classification.status,
            spamFlags: classification.spamFlags,
          },
          responseRequestId,
          422,
        );
      }

      const comment = (await repositories.comments.create({
        siteId: site.id,
        targetType: 'post',
        targetId: postId,
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

    const postResult = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = postResult.posts.some((post) => post.id === postId);
    if (!postExists) {
      return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', responseRequestId);
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return errorResponse(400, 'INVALID_PAYLOAD', 'Invalid payload', responseRequestId);
    }

    const content = parseTextInput(body.content || (body as { body?: unknown }).body);
    if (content.length === 0) {
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Validation failed',
          details: { content: 'Comment content is required' },
        },
        responseRequestId,
        422,
      );
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
    const rateLimitBypass = parseBoolean(body.rateLimitBypass) === true;
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
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Validation failed',
          details: { authorName: 'Guests are disabled for this comment block.' },
        },
        responseRequestId,
        403,
      );
    }

    if (policy.requireName && authorName.length === 0) {
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Validation failed',
          details: { authorName: 'Name is required' },
        },
        responseRequestId,
        422,
      );
    }

    if (policy.requireEmail && authorEmail.length === 0) {
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Validation failed',
          details: { authorEmail: 'Email is required' },
        },
        responseRequestId,
        422,
      );
    }

    if (parentId && !policy.allowReplies) {
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Validation failed',
          details: { parentId: 'Replies are not enabled for this comment block' },
        },
        responseRequestId,
        422,
      );
    }

    let parent: ReturnType<typeof getCommentById> | undefined;
    if (parentId) {
      parent = getCommentById(parentId);
      if (!parent || parent.siteId !== site.id || parent.targetType !== 'post' || parent.targetId !== postId) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { parentId: 'The selected parent comment does not belong to this target.' },
          },
          responseRequestId,
          422,
        );
      }

      if (parent.commentThreadId && commentThreadId && parent.commentThreadId !== commentThreadId) {
        return contractResponse(
          {
            success: false,
            requestId: responseRequestId,
            error: 'Validation failed',
            details: { parentId: 'The selected parent comment belongs to a different thread.' },
          },
          responseRequestId,
          422,
        );
      }
    }

    const resolvedCommentThreadId = commentThreadId || parent?.commentThreadId || undefined;

    const classification = validateAndClassifyComment({
      siteId: site.id,
      targetType: 'post',
      targetId: postId,
      content,
      authorEmail,
      moderationMode: policy.moderationMode,
      honeypot,
      ipHash,
      requestId,
      startedAt,
      rateLimitBypass,
      blockedTerms: policy.blockedTerms,
    });

    if (!classification.ok) {
      return contractResponse(
        {
          success: false,
          requestId: responseRequestId,
          error: 'Validation failed',
          details: { content: classification.spamMessage || 'Comment rejected.' },
          status: classification.status,
          spamFlags: classification.spamFlags,
        },
        responseRequestId,
        422,
      );
    }

    const comment = createComment({
      siteId: site.id,
      targetType: 'post',
      targetId: postId,
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
