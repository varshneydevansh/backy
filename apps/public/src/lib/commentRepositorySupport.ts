import type { Comment, CommentReportReason, CommentStatus } from '@backy-cms/core';
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

  return (await repositories.comments.update(siteId, comment.id, update)).item;
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

  return (await repositories.comments.update(siteId, comment.id, {
    status: nextStatus,
    reviewedBy: input.actor || null,
    reviewedAt,
    reportCount,
    reportReasons: Array.from(reportReasons),
    requestId: input.requestId || comment.requestId || null,
  })).item;
}
