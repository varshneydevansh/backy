import type {
  BackyRepositoryEntity,
  BackyCommentModerationInput,
  BackyCommentModerationResult,
  Comment,
  CommentReportReason,
  CommentStatus,
} from "@backy-cms/core";
import type { getRequiredDatabaseRepositories } from "@/lib/repositoryRuntime";
import { getCommentReportReasons } from "@/lib/backyStore";
import { BackyCommentLifecycleError } from "@backy-cms/core";

export type PublicCommentRepositories = Awaited<
  ReturnType<typeof getRequiredDatabaseRepositories>
>;

export async function resolveRepositorySite(
  repositories: PublicCommentRepositories,
  siteIdOrSlug: string,
) {
  return (
    (await repositories.sites.getById(siteIdOrSlug)) ||
    (await repositories.sites.getBySlug(siteIdOrSlug))
  );
}

export function normalizeRepositoryReportReason(
  raw: string | null | undefined,
): CommentReportReason | null {
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
    kind:
      | "site-created"
      | "site-updated"
      | "site-deleted"
      | "form-submission"
      | "contact-shared"
      | "contact-sync"
      | "contact-status"
      | "commerce-order"
      | "commerce-product"
      | "commerce-webhook"
      | "comment-submitted"
      | "comment-status"
      | "comment-reported"
      | "interactive-runtime";
    siteId: string;
    formId?: string | null;
    commentId?: string | null;
    contactId?: string | null;
    submissionId?: string | null;
    target: string;
    status: "queued" | "succeeded" | "failed" | "received";
    statusCode?: number;
    requestId?: string | null;
    reason?: string | null;
    actor?: string | null;
    metadata?: Record<string, unknown>;
    error?: string;
  },
) {
  const entity: BackyRepositoryEntity = event.commentId
    ? "comment"
    : event.contactId
      ? "contact"
      : event.submissionId
        ? "formSubmission"
        : event.formId
          ? "form"
          : "auditLog";
  const entityId =
    event.commentId ||
    event.contactId ||
    event.submissionId ||
    event.formId ||
    event.target;

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

export async function moderateRepositoryComments(
  repositories: PublicCommentRepositories, siteId: string,
  input: BackyCommentModerationInput & { completionWarnings?: string[] },
): Promise<BackyCommentModerationResult> {
  if (typeof repositories.comments.moderateBatch !== "function") throw new BackyCommentLifecycleError("COMMENT_MODERATION_UNAVAILABLE", "Atomic comment moderation is unavailable.");
  const { completionWarnings, ...mutation } = input;
  const result = await repositories.comments.moderateBatch(siteId, mutation);
  for (const comment of result.updated) {
    try {
      await recordRepositoryInteractionEvent(repositories, {
        kind: "comment-status", siteId, commentId: comment.id, target: `comment:${comment.id}`, status: "succeeded",
        requestId: input.requestId || comment.requestId || undefined,
        reason: input.status || "reports-cleared", actor: input.actor || input.reviewedBy || input.defaultReviewer || null,
        metadata: { targetType: comment.targetType, targetId: comment.targetId, status: comment.status, blockReason: comment.blockReason, reportsCleared: input.clearReports === true },
      });
    } catch (error) {
      if (!completionWarnings) throw error;
      if (!completionWarnings.includes("COMMENT_ACTIVITY_PENDING")) completionWarnings.push("COMMENT_ACTIVITY_PENDING");
    }
  }
  return result;
}

export async function updateRepositoryCommentStatus(
  repositories: PublicCommentRepositories, siteId: string, comment: Comment,
  input: Omit<BackyCommentModerationInput, "commentIds"> & { status: CommentStatus; completionWarnings?: string[] },
): Promise<Comment> {
  const result = await moderateRepositoryComments(repositories, siteId, { ...input, commentIds: [comment.id] });
  if (!result.updated.length) throw new BackyCommentLifecycleError("COMMENT_MODERATION_CONFLICT", "The comment no longer exists. Reload the thread.");
  return result.updated[0];
}

export async function clearRepositoryCommentReports(
  repositories: PublicCommentRepositories, siteId: string, comment: Comment,
  input: Omit<BackyCommentModerationInput, "commentIds" | "status" | "clearReports"> & { completionWarnings?: string[] },
): Promise<Comment> {
  const result = await moderateRepositoryComments(repositories, siteId, { ...input, commentIds: [comment.id], clearReports: true });
  if (!result.updated.length) throw new BackyCommentLifecycleError("COMMENT_MODERATION_CONFLICT", "The comment no longer exists. Reload the thread.");
  return result.updated[0];
}

export async function updateRepositoryCommentThread(
  repositories: PublicCommentRepositories,
  siteId: string,
  comment: Comment,
  input: {
    parentId: string | null;
    commentThreadId?: string | null;
    actor?: string | null;
    requestId?: string | null;
    defaultReviewer?: string | null;
    completionWarnings?: string[];
  },
): Promise<Comment> {
  const reviewedBy = input.actor || input.defaultReviewer || null;
  const reviewedAt = new Date().toISOString();
  const resolvedRequestId = input.requestId || comment.requestId || undefined;
  const nextComment = (
    await repositories.comments.update(siteId, comment.id, {
      parentId: input.parentId,
      commentThreadId: input.commentThreadId || null,
      reviewedBy,
      reviewedAt,
      requestId: resolvedRequestId || null,
    })
  ).item;

  try {
  await recordRepositoryInteractionEvent(repositories, {
    kind: "comment-status",
    siteId,
    commentId: nextComment.id,
    target: `comment:${nextComment.id}`,
    status: "succeeded",
    requestId: resolvedRequestId,
    reason: "thread-updated",
    actor: reviewedBy,
    metadata: {
      targetType: nextComment.targetType,
      targetId: nextComment.targetId,
      previousParentId: comment.parentId,
      parentId: nextComment.parentId,
      previousThreadId: comment.commentThreadId || null,
      commentThreadId: nextComment.commentThreadId || null,
    },
  });
  } catch (error) {
    if (!input.completionWarnings) throw error;
    if (!input.completionWarnings.includes("COMMENT_ACTIVITY_PENDING")) input.completionWarnings.push("COMMENT_ACTIVITY_PENDING");
  }
  return nextComment;
}

export async function reportRepositoryComment(
  repositories: PublicCommentRepositories,
  siteId: string,
  comment: Comment,
  input: {
    reason?: string | null;
    actor?: string;
    details?: string;
    requestId?: string;
    completionWarnings?: string[];
  },
): Promise<Comment> {
  const normalizedReason = normalizeRepositoryReportReason(
    input.reason || null,
  );
  if (typeof repositories.comments.report !== "function") {
    throw new BackyCommentLifecycleError("COMMENT_REPORT_UNAVAILABLE", "Atomic comment reporting is unavailable.");
  }
  const nextComment = (await repositories.comments.report(siteId, comment.id, {
    reason: normalizedReason || "other",
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  })).item;
  try { await recordRepositoryInteractionEvent(repositories, {
    kind: "comment-reported",
    siteId,
    commentId: nextComment.id,
    target: `comment:${nextComment.id}`,
    status: "succeeded",
    requestId: input.requestId,
    reason: normalizedReason || "other",
    actor: input.actor,
    metadata: {
      authorName: nextComment.authorName,
      targetType: nextComment.targetType,
      targetId: nextComment.targetId,
      reportCount: nextComment.reportCount,
      reportReasons: nextComment.reportReasons,
      ...(input.details ? { details: input.details } : {}),
    },
  }); } catch (error) {
    if (!input.completionWarnings) throw error;
    if (!input.completionWarnings.includes("COMMENT_ACTIVITY_PENDING")) input.completionWarnings.push("COMMENT_ACTIVITY_PENDING");
  }
  return nextComment;
}
