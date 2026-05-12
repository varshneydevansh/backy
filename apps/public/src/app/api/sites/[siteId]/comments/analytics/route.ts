import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listComments } from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { Comment, CommentStatus, CommentTargetType } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const COMMENT_STATUSES: CommentStatus[] = ['pending', 'approved', 'rejected', 'spam', 'blocked'];

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

function parseDays(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 365);
}

function parseTargetType(raw: string | null): CommentTargetType | 'all' {
  if (raw === 'page' || raw === 'post' || raw === 'all') {
    return raw;
  }

  return 'all';
}

function parseTextInput(raw: string | null): string | undefined {
  const value = raw ? raw.trim() : '';
  return value.length ? value : undefined;
}

function emptyStatusCounts(): Record<CommentStatus, number> {
  return {
    pending: 0,
    approved: 0,
    rejected: 0,
    spam: 0,
    blocked: 0,
  };
}

function dateBucket(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function listRepositoryComments(siteId: string, targetType: CommentTargetType | 'all', targetId?: string): Promise<Comment[]> {
  const repositories = await getRequiredDatabaseRepositories();
  const site = await resolveRepositorySite(repositories, siteId);
  if (!site) {
    throw new Error('SITE_NOT_FOUND');
  }

  const items: Comment[] = [];
  const limit = 500;
  let offset = 0;

  for (let page = 0; page < 20; page += 1) {
    const result = await repositories.comments.list({
      siteId: site.id,
      targetType: targetType === 'all' ? undefined : targetType,
      targetId,
      status: 'all',
      sort: 'newest',
      limit,
      offset,
    });
    items.push(...result.items);
    if (!result.pagination.hasMore) break;
    offset += limit;
  }

  return items;
}

function buildCommentAnalytics(siteId: string, comments: Comment[], days: number) {
  const generatedAt = new Date().toISOString();
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const windowed = comments.filter((comment) => new Date(comment.createdAt).getTime() >= sinceMs);
  const byStatus = emptyStatusCounts();
  const reportReasons: Record<string, number> = {};
  const targets = new Map<string, {
    targetType: CommentTargetType;
    targetId: string;
    total: number;
    pending: number;
    reported: number;
    replies: number;
  }>();
  const threads = new Map<string, {
    id: string;
    targetType: CommentTargetType;
    targetId: string;
    total: number;
    replies: number;
    pending: number;
    reported: number;
    latestAt: string;
  }>();
  const daily = new Map<string, { date: string; submitted: number; reviewed: number; reported: number }>();

  const ensureDaily = (date: string) => {
    const current = daily.get(date) || { date, submitted: 0, reviewed: 0, reported: 0 };
    daily.set(date, current);
    return current;
  };

  let reported = 0;
  let reviewed = 0;
  let replies = 0;

  windowed.forEach((comment) => {
    byStatus[comment.status] += 1;
    const reportCount = comment.reportCount || 0;
    const isReported = reportCount > 0 || Boolean(comment.reportReasons?.length);
    if (isReported) reported += 1;
    if (comment.reviewedAt || comment.reviewedBy || comment.rejectionReason || comment.blockReason) reviewed += 1;
    if (comment.parentId) replies += 1;

    comment.reportReasons?.forEach((reason) => {
      reportReasons[reason] = (reportReasons[reason] || 0) + 1;
    });

    const targetKey = `${comment.targetType}:${comment.targetId}`;
    const target = targets.get(targetKey) || {
      targetType: comment.targetType,
      targetId: comment.targetId,
      total: 0,
      pending: 0,
      reported: 0,
      replies: 0,
    };
    target.total += 1;
    target.pending += comment.status === 'pending' ? 1 : 0;
    target.reported += isReported ? 1 : 0;
    target.replies += comment.parentId ? 1 : 0;
    targets.set(targetKey, target);

    const threadKey = comment.commentThreadId || comment.parentId || comment.id;
    const thread = threads.get(threadKey) || {
      id: threadKey,
      targetType: comment.targetType,
      targetId: comment.targetId,
      total: 0,
      replies: 0,
      pending: 0,
      reported: 0,
      latestAt: comment.createdAt,
    };
    thread.total += 1;
    thread.replies += comment.parentId ? 1 : 0;
    thread.pending += comment.status === 'pending' ? 1 : 0;
    thread.reported += isReported ? 1 : 0;
    if (new Date(comment.createdAt).getTime() > new Date(thread.latestAt).getTime()) {
      thread.latestAt = comment.createdAt;
    }
    threads.set(threadKey, thread);

    const createdBucket = dateBucket(comment.createdAt);
    if (createdBucket) ensureDaily(createdBucket).submitted += 1;
    const reviewedBucket = dateBucket(comment.reviewedAt);
    if (reviewedBucket) ensureDaily(reviewedBucket).reviewed += 1;
    if (isReported && createdBucket) ensureDaily(createdBucket).reported += 1;
  });

  const targetRows = Array.from(targets.values()).sort((left, right) => right.total - left.total);
  const threadRows = Array.from(threads.values()).sort((left, right) => {
    if (right.reported !== left.reported) return right.reported - left.reported;
    if (right.pending !== left.pending) return right.pending - left.pending;
    return new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime();
  });

  return {
    siteId,
    generatedAt,
    windowDays: days,
    totals: {
      comments: windowed.length,
      allTimeComments: comments.length,
      pending: byStatus.pending,
      approved: byStatus.approved,
      rejected: byStatus.rejected,
      spam: byStatus.spam,
      blocked: byStatus.blocked,
      reported,
      reviewed,
      unreviewed: windowed.length - reviewed,
      replies,
    },
    byStatus,
    reports: {
      comments: reported,
      reasons: Object.entries(reportReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count),
    },
    threads: {
      total: threadRows.length,
      withReplies: threadRows.filter((thread) => thread.replies > 0).length,
      reported: threadRows.filter((thread) => thread.reported > 0).length,
      pendingReplies: threadRows.reduce((sum, thread) => sum + Math.min(thread.pending, thread.replies), 0),
      top: threadRows.slice(0, 10),
    },
    targets: targetRows.slice(0, 20),
    daily: Array.from(daily.values()).sort((left, right) => left.date.localeCompare(right.date)),
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const access = requireAdminAccess(request, responseRequestId, { permission: 'comments.view' });
    if (access instanceof NextResponse) {
      return access;
    }

    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseDays(searchParams.get('days'));
    const targetType = parseTargetType(searchParams.get('targetType'));
    const targetId = parseTextInput(searchParams.get('targetId'));

    if (!shouldUseDemoStoreFallback()) {
      const comments = await listRepositoryComments(siteId, targetType, targetId);
      const analytics = buildCommentAnalytics(siteId, comments, days);
      return privateResponse({
        success: true,
        requestId: responseRequestId,
        data: { analytics },
        analytics,
      }, responseRequestId);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const result = listComments(site.id, {
      targetType,
      targetId,
      status: 'all',
      sort: 'newest',
      limit: 10000,
      offset: 0,
    });
    const analytics = buildCommentAnalytics(site.id, result.comments, days);

    return privateResponse({
      success: true,
      requestId: responseRequestId,
      data: { analytics },
      analytics,
    }, responseRequestId);
  } catch (error) {
    if (error instanceof Error && error.message === 'SITE_NOT_FOUND') {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }
    console.error('Comment analytics API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}
