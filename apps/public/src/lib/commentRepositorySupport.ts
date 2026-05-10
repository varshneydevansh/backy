import type { BackyRepositoryEntity, Comment, CommentReportReason, CommentStatus } from '@backy-cms/core';
import type { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';
import { blockCommentIdentity, getCommentReportReasons } from '@/lib/backyStore';

export type PublicCommentRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;

export async function resolveRepositorySite(
  repositories: PublicCommentRepositories,
  siteIdOrSlug: string,
) {
  return await repositories.sites.getById(siteIdOrSlug) || await repositories.sites.getBySlug(siteIdOrSlug);
}

export function normalizeRepositoryReportReason(raw: string | null | undefined): CommentReportReason | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }

  const reasons = getCommentReportReasons();
  return reasons.find((reason) => reason === value) || null;
}

export async function recordRepositoryInteractionEvent(
  repositories: PublicCommentRepositories,
  event: {
    kind: 'form-submission' | 'contact-shared' | 'contact-status' | 'comment-submitted' | 'comment-status' | 'comment-reported';
    siteId: string;
    formId?: string | null;
    commentId?: string | null;
    contactId?: string | null;
    submissionId?: string | null;
    target: string;
    status: 'queued' | 'succeeded' | 'failed' | 'received';
    statusCode?: number;
    requestId?: string | null;
    reason?: string | null;
    actor?: string | null;
    metadata?: Record<string, unknown>;
    error?: string;
  },
) {
  const entity: BackyRepositoryEntity = event.commentId
    ? 'comment'
    : event.contactId
      ? 'contact'
      : event.submissionId
        ? 'formSubmission'
        : event.formId
          ? 'form'
          : 'auditLog';
  const entityId = event.commentId || event.contactId || event.submissionId || event.formId || event.target;

  const metadata = {
    ...(event.metadata || {}),
    formId: event.formId || null,
    commentId: event.commentId || null,
    contactId: event.contactId || null,
    submissionId: event.submissionId || null,
    target: event.target,
    status: event.status,
    ...(event.statusCode !== undefined ? { statusCode: event.statusCode } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    ...(event.error ? { error: event.error } : {}),
  };

  await repositories.auditLogs.record({
    siteId: event.siteId,
    actorId: event.actor || null,
    entity,
    entityId,
    action: event.kind,
    metadata,
    requestId: event.requestId || undefined,
  });
}

export async function updateRepositoryCommentStatus(
  repositories: PublicCommentRepositories,
  siteId: string,
  comment: Comment,
  input: {
    status: CommentStatus;
    reviewedBy?: string | null;
    actor?: string | null;
    rejectionReason?: string | null;
    blockReason?: string | null;
    requestId?: string | null;
    defaultReviewer?: string | null;
    clearReports?: boolean;
  },
): Promise<Comment> {
  const reviewedBy = input.actor || input.reviewedBy || input.defaultReviewer || null;
  const reviewedAt = new Date().toISOString();
  const resolvedRequestId = input.requestId || comment.requestId || undefined;
  const update = {
    status: input.status,
    reviewedBy,
    reviewedAt,
    rejectionReason: input.rejectionReason ?? null,
    blockReason: comment.blockReason ?? null,
    blockedBy: comment.blockedBy ?? null,
    blockedAt: comment.blockedAt ?? null,
    requestId: resolvedRequestId || null,
    ...(input.clearReports ? { reportCount: 0, reportReasons: [] } : {}),
  };

  if (input.status === 'blocked') {
    const normalizedBlockReason = normalizeRepositoryReportReason(input.blockReason || null);
    update.blockReason = normalizedBlockReason || input.blockReason || 'manual-block';
    update.blockedBy = reviewedBy;
    update.blockedAt = reviewedAt;

    blockCommentIdentity({
      siteId,
      reason: update.blockReason,
      actor: reviewedBy || undefined,
      requestId: resolvedRequestId,
      email: comment.authorEmail,
      ipHash: comment.ipHash,
    });
  } else if (input.status !== 'rejected' && input.status !== 'spam') {
    update.blockReason = null;
    update.blockedBy = null;
    update.blockedAt = null;
    update.rejectionReason = null;
  }

  const nextComment = (await repositories.comments.update(siteId, comment.id, update)).item;
  await recordRepositoryInteractionEvent(repositories, {
    kind: 'comment-status',
    siteId,
    commentId: nextComment.id,
    target: `comment:${nextComment.id}`,
    status: 'succeeded',
    requestId: resolvedRequestId,
    reason: input.status,
    actor: reviewedBy,
    metadata: {
      targetType: nextComment.targetType,
      targetId: nextComment.targetId,
      status: input.status,
      blockReason: nextComment.blockReason,
      reportsCleared: input.clearReports === true,
    },
  });
  return nextComment;
}

export async function clearRepositoryCommentReports(
  repositories: PublicCommentRepositories,
  siteId: string,
  comment: Comment,
  input: {
    reviewedBy?: string | null;
    actor?: string | null;
    requestId?: string | null;
    defaultReviewer?: string | null;
  },
): Promise<Comment> {
  const reviewedBy = input.actor || input.reviewedBy || input.defaultReviewer || null;
  const reviewedAt = new Date().toISOString();
  const resolvedRequestId = input.requestId || comment.requestId || undefined;
  const nextComment = (await repositories.comments.update(siteId, comment.id, {
    reviewedBy,
    reviewedAt,
    reportCount: 0,
    reportReasons: [],
    requestId: resolvedRequestId || null,
  })).item;

  await recordRepositoryInteractionEvent(repositories, {
    kind: 'comment-status',
    siteId,
    commentId: nextComment.id,
    target: `comment:${nextComment.id}`,
    status: 'succeeded',
    requestId: resolvedRequestId,
    reason: 'reports-cleared',
    actor: reviewedBy,
    metadata: {
      targetType: nextComment.targetType,
      targetId: nextComment.targetId,
      reportCount: 0,
      reportReasons: [],
    },
  });

  return nextComment;
}

export async function reportRepositoryComment(
  repositories: PublicCommentRepositories,
  siteId: string,
  comment: Comment,
  input: {
    reason?: string | null;
    actor?: string;
    requestId?: string;
  },
): Promise<Comment> {
  const normalizedReason = normalizeRepositoryReportReason(input.reason || null);
  const reportReasons = new Set<CommentReportReason>(comment.reportReasons || []);
  if (normalizedReason) {
    reportReasons.add(normalizedReason);
  }

  const reportCount = (comment.reportCount || 0) + 1;
  const reviewedAt = new Date().toISOString();
  const nextStatus = reportCount >= 3 && comment.status === 'approved' ? 'spam' : comment.status;

  const nextComment = (await repositories.comments.update(siteId, comment.id, {
    status: nextStatus,
    reviewedBy: input.actor || null,
    reviewedAt,
    reportCount,
    reportReasons: Array.from(reportReasons),
    requestId: input.requestId || comment.requestId || null,
  })).item;
  await recordRepositoryInteractionEvent(repositories, {
    kind: 'comment-reported',
    siteId,
    commentId: nextComment.id,
    target: `comment:${nextComment.id}`,
    status: 'succeeded',
    requestId: input.requestId,
    reason: normalizedReason || 'other',
    actor: input.actor,
    metadata: {
      authorName: nextComment.authorName,
      targetType: nextComment.targetType,
      targetId: nextComment.targetId,
      reportCount: nextComment.reportCount,
      reportReasons: nextComment.reportReasons,
    },
  });
  return nextComment;
}
