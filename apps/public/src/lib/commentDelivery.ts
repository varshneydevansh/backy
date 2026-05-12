import type { Comment } from '@backy-cms/core';
import { getAdminSettings, trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import {
  buildCommentNotificationEmail,
  EmailDeliveryError,
  getEmailDeliveryConfig,
  sendEmailMessage,
} from '@/lib/formEmailDelivery';
import { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';

type CommentRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type CommentDeliveryKind = 'comment-submitted' | 'comment-reported' | 'comment-status';
type CommentDeliveryStatus = 'queued' | 'succeeded' | 'failed';

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const readBoolean = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const readNotificationSettings = async (repositories?: CommentRepositories | null): Promise<Record<string, unknown>> => {
  if (repositories) {
    const settings = await repositories.settings.get();
    return readRecord(readRecord(settings.integrations).notifications);
  }

  return readRecord(readRecord(getAdminSettings().integrations).notifications);
};

const resolveNotificationEmailRecipient = (email: Record<string, unknown>): string => (
  readString(email.recipient) ||
  readString(email.to) ||
  readString(email.adminEmail) ||
  readString(process.env.BACKY_COMMENT_NOTIFICATION_EMAIL) ||
  readString(process.env.BACKY_NOTIFICATION_EMAIL_TO) ||
  readString(process.env.BACKY_ADMIN_NOTIFICATION_EMAIL)
);

async function recordCommentDeliveryEvent(params: {
  repositories?: CommentRepositories | null;
  kind: CommentDeliveryKind;
  siteId: string;
  comment: Comment;
  target: string;
  status: CommentDeliveryStatus;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const event = {
    kind: params.kind,
    siteId: params.siteId,
    commentId: params.comment.id,
    target: params.target,
    status: params.status,
    statusCode: params.statusCode,
    requestId: params.requestId || params.comment.requestId || undefined,
    reason: params.reason || params.comment.status,
    actor: params.actor || params.comment.reviewedBy || undefined,
    error: params.error,
    metadata: {
      targetType: params.comment.targetType,
      targetId: params.comment.targetId,
      status: params.comment.status,
      parentId: params.comment.parentId,
      commentThreadId: params.comment.commentThreadId || null,
      ...(params.metadata || {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

async function deliverCommentWebhook(params: {
  repositories?: CommentRepositories | null;
  siteId: string;
  comment: Comment;
  kind: CommentDeliveryKind;
  target: string;
  requestId: string;
  reason?: string | null;
  actor?: string | null;
}) {
  await recordCommentDeliveryEvent({
    ...params,
    status: 'queued',
    metadata: { channel: 'webhook' },
  });

  try {
    const response = await fetch(params.target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backy-site-id': params.siteId,
        'x-backy-comment-id': params.comment.id,
        'x-backy-comment-event': params.kind,
      },
      body: JSON.stringify({
        kind: params.kind,
        siteId: params.siteId,
        commentId: params.comment.id,
        targetType: params.comment.targetType,
        targetId: params.comment.targetId,
        parentId: params.comment.parentId,
        commentThreadId: params.comment.commentThreadId || null,
        status: params.comment.status,
        reason: params.reason || params.comment.status,
        actor: params.actor || params.comment.reviewedBy || null,
        requestId: params.requestId,
        authorName: params.comment.authorName,
        authorEmail: params.comment.authorEmail,
        content: params.comment.content,
        createdAt: params.comment.createdAt,
        updatedAt: params.comment.updatedAt,
      }),
    });

    await recordCommentDeliveryEvent({
      ...params,
      status: response.ok ? 'succeeded' : 'failed',
      statusCode: response.status,
      error: response.ok ? undefined : `Webhook returned ${response.status}`,
      metadata: { channel: 'webhook' },
    });
  } catch (error) {
    await recordCommentDeliveryEvent({
      ...params,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown webhook error',
      metadata: { channel: 'webhook' },
    });
  }
}

async function deliverCommentEmail(params: {
  repositories?: CommentRepositories | null;
  siteId: string;
  comment: Comment;
  kind: CommentDeliveryKind;
  target: string;
  requestId: string;
  reason?: string | null;
  actor?: string | null;
}) {
  const config = getEmailDeliveryConfig();
  const message = buildCommentNotificationEmail({
    config,
    siteId: params.siteId,
    comment: params.comment,
    eventType: params.kind,
    requestId: params.requestId,
    to: params.target,
    reason: params.reason || undefined,
    actor: params.actor || undefined,
  });

  await recordCommentDeliveryEvent({
    ...params,
    target: `mailto:${params.target}`,
    status: 'queued',
    metadata: {
      channel: 'email',
      provider: config.provider,
      from: config.from,
      subject: message.subject,
    },
  });

  try {
    const result = await sendEmailMessage(config, message);
    await recordCommentDeliveryEvent({
      ...params,
      target: `mailto:${params.target}`,
      status: 'succeeded',
      statusCode: result.statusCode,
      metadata: {
        channel: 'email',
        provider: config.provider,
        from: config.from,
        subject: message.subject,
        ...(result.metadata || {}),
      },
    });
  } catch (error) {
    await recordCommentDeliveryEvent({
      ...params,
      target: `mailto:${params.target}`,
      status: 'failed',
      statusCode: error instanceof EmailDeliveryError ? error.statusCode : undefined,
      error: error instanceof Error ? error.message : 'Unknown email delivery error',
      metadata: {
        channel: 'email',
        provider: config.provider,
        from: config.from,
        subject: message.subject,
        ...(error instanceof EmailDeliveryError ? error.metadata || {} : {}),
      },
    });
  }
}

export async function notifyCommentDelivery(params: {
  repositories?: CommentRepositories | null;
  siteId: string;
  comment: Comment;
  kind: CommentDeliveryKind;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
}) {
  const notifications = await readNotificationSettings(params.repositories);
  const digestFrequency = readString(notifications.digestFrequency);
  if (digestFrequency === 'off') {
    return;
  }

  const requestId = params.requestId || params.comment.requestId || `comment-${params.comment.id}`;
  const webhookUrl = readString(notifications.webhookUrl);
  const email = readRecord(notifications.email);
  const commentEmailEnabled = readBoolean(email.comments, true) || readBoolean(email.commentModeration, false);
  const recipient = resolveNotificationEmailRecipient(email);

  if (webhookUrl) {
    await deliverCommentWebhook({
      ...params,
      target: webhookUrl,
      requestId,
    });
  }

  if (commentEmailEnabled && recipient) {
    await deliverCommentEmail({
      ...params,
      target: recipient,
      requestId,
    });
  }
}
