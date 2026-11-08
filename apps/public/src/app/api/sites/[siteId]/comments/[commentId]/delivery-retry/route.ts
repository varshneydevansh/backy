import { NextRequest, NextResponse } from 'next/server';
import { commentDeliveryErrorDetails, type Comment } from '@backy-cms/core';
import { getCommentDeliveryEvent } from '@/lib/commentDeliveryHistory';
import { getCommentById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import {
  retryCommentDelivery,
  type CommentDeliveryChannel,
  type CommentDeliveryKind,
} from '@/lib/commentDelivery';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    commentId: string;
  }>;
}

type CommentRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;

interface RetryableCommentDeliveryEvent {
  id: string;
  kind: CommentDeliveryKind | string;
  commentId?: string | null;
  target: string;
  status: string;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
  metadata?: Record<string, unknown>;
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

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const isCommentDeliveryKind = (value: string): value is CommentDeliveryKind => (
  value === 'comment-submitted' || value === 'comment-status' || value === 'comment-reported'
);

const resolveDeliveryChannel = (event: RetryableCommentDeliveryEvent): CommentDeliveryChannel | null => {
  const channel = readString(event.metadata?.channel);
  if (channel === 'webhook' || channel === 'email') {
    return channel;
  }

  if (event.target.startsWith('mailto:')) {
    return 'email';
  }

  try {
    const url = new URL(event.target);
    return url.protocol === 'http:' || url.protocol === 'https:' ? 'webhook' : null;
  } catch {
    return null;
  }
};

const isValidRetryTarget = (channel: CommentDeliveryChannel, target: string): boolean => {
  if (channel === 'email') {
    const email = target.startsWith('mailto:') ? target.slice('mailto:'.length).trim() : target.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  try {
    const url = new URL(target);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const parseBody = (raw: unknown): { eventId: string; requestId?: string } | null => {
  const body = readRecord(raw);
  const eventId = readString(body.eventId);
  const requestId = readString(body.requestId);

  if (!eventId || eventId.length > 200 || requestId.length > 200) {
    return null;
  }

  return {
    eventId,
    requestId: requestId || undefined,
  };
};

async function retryDeliveryForComment(params: {
  repositories?: CommentRepositories | null;
  siteId: string;
  comment: Comment;
  eventId: string;
  requestId: string;
}) {
  const event = await getCommentDeliveryEvent(params.siteId,params.comment.id,params.eventId,params.repositories);
  if (!event) {
    return { error: { status: 404, code: 'DELIVERY_EVENT_NOT_FOUND', message: 'Failed delivery event not found.' } };
  }

  if (event.status !== 'failed') {
    return { error: { status: 409, code: 'DELIVERY_EVENT_NOT_FAILED', message: 'Only failed comment deliveries can be retried.' } };
  }

  if (!event.commentId || event.commentId !== params.comment.id) {
    return { error: { status: 409, code: 'DELIVERY_EVENT_COMMENT_MISMATCH', message: 'Delivery event does not belong to this comment.' } };
  }

  if (!isCommentDeliveryKind(event.kind)) {
    return { error: { status: 409, code: 'DELIVERY_EVENT_NOT_RETRYABLE', message: 'Delivery event kind is not retryable.' } };
  }

  const channel = resolveDeliveryChannel(event);
  if (!channel) {
    return { error: { status: 409, code: 'DELIVERY_EVENT_NOT_RETRYABLE', message: 'Only webhook and email comment deliveries can be retried.' } };
  }

  if (!isValidRetryTarget(channel, event.target)) {
    return { error: { status: 409, code: 'DELIVERY_TARGET_INVALID', message: 'The failed delivery target is no longer retryable.' } };
  }

  const delivery = await retryCommentDelivery({
    repositories: params.repositories,
    siteId: params.siteId,
    comment: params.comment,
    kind: event.kind,
    channel,
    target: event.target,
    requestId: params.requestId,
    retryOf: event.id,
    reason: event.reason,
    actor: event.actor,
  });

  if (!delivery.attempted) {
    return { error: { status: 409, code: 'DELIVERY_RETRY_NOT_ATTEMPTED', message: delivery.error } };
  }

  return {
    delivery,
    retryOf: event.id,
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const baseRequestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, baseRequestId, { permission: 'comments.manage' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, commentId } = await params;
    const payload = parseBody(await request.json().catch(() => null));
    if (!payload) {
      return errorResponse(400, 'INVALID_PAYLOAD', 'eventId is required to retry a comment delivery.', baseRequestId);
    }

    const requestId = payload.requestId || baseRequestId;

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

      const result = await retryDeliveryForComment({
        repositories,
        siteId: site.id,
        comment,
        eventId: payload.eventId,
        requestId,
      });

      if ('error' in result && result.error) {
        const retryError = result.error;
        return errorResponse(retryError.status, retryError.code, retryError.message, requestId);
      }
      const completionWarnings: string[] = [];
      try { await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'comment',
        entityId: comment.id,
        action: 'commentDelivery.retry',
        metadata: {
          permission: 'comments.manage',
          retryOf: result.retryOf,
          deliveryStatus: result.delivery.status,
          channel: result.delivery.channel,
          target: result.delivery.target,
        },
        requestId,
      });

      } catch { completionWarnings.push('COMMENT_AUDIT_PENDING'); }
      return privateResponse({
        success: true,
        requestId,
        data: {
          delivery: result.delivery,
          retryOf: result.retryOf,
          comment,
          completionWarnings,
        },
        delivery: result.delivery,
        retryOf: result.retryOf,
        comment,
        completionWarnings,
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

    const result = await retryDeliveryForComment({
      siteId: site.id,
      comment,
      eventId: payload.eventId,
      requestId,
    });

    if ('error' in result && result.error) {
      const retryError = result.error;
      return errorResponse(retryError.status, retryError.code, retryError.message, requestId);
    }
    const completionWarnings: string[] = [];
    try { await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'comment',
      entityId: comment.id,
      action: 'commentDelivery.retry',
      metadata: {
        permission: 'comments.manage',
        retryOf: result.retryOf,
        deliveryStatus: result.delivery.status,
        channel: result.delivery.channel,
        target: result.delivery.target,
      },
      requestId,
    });

    } catch { completionWarnings.push('COMMENT_AUDIT_PENDING'); }
    return privateResponse({
      success: true,
      requestId,
      data: {
        delivery: result.delivery,
        retryOf: result.retryOf,
        comment,
        completionWarnings,
      },
      delivery: result.delivery,
      retryOf: result.retryOf,
      comment,
    }, requestId);
  } catch (error) {
    const known=commentDeliveryErrorDetails(error);
    if(known) return errorResponse(known.status,known.code,known.message,baseRequestId);
    console.error('Comment delivery retry API failed.');
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', baseRequestId);
  }
}
