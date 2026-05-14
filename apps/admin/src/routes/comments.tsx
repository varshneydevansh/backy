import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  CheckCircle2,
  CircleSlash,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Flag,
  GitBranch,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  createComment,
  deleteComment,
  getAdminSite,
  getCommentAnalytics,
  getUserPermissions,
  deleteCommentBlocklistEntries,
  listCommentDeliveryEvents,
  listAdminAuditLogs,
  listBlogPosts,
  listCommentBlocklist,
  listComments,
  listPages,
  retryCommentDelivery,
  updateSite,
  updateCommentThread,
  updateComments,
  type AdminComment,
  type AdminCommentBlocklistEntry,
  type AdminAuditLog,
  type CommentDeliveryEvent,
  type CommentAnalytics,
  type CommentModerationStatus,
  type CommentModerationTarget,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import type { SiteCommentPolicy } from '@backy-cms/core';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';

type CommentStatusFilter = CommentModerationStatus | 'all';
type CommentTriageFilter =
  | 'all'
  | 'reported'
  | 'replies'
  | 'top-level'
  | 'anonymous'
  | 'authenticated'
  | 'missing-email'
  | 'reviewed'
  | 'unreviewed';
type CommentSortFilter = 'newest' | 'oldest';
type CommentPermissionKey = 'comments.view' | 'comments.manage' | 'comments.configure' | 'activity.export';

interface CommentsSearch {
  siteId?: string;
  status?: CommentStatusFilter;
  targetType?: CommentModerationTarget;
  targetId?: string;
  triage?: CommentTriageFilter;
  thread?: string;
  sort?: CommentSortFilter;
  q?: string;
}

const COMMENT_STATUS_FILTERS: CommentStatusFilter[] = ['all', 'pending', 'approved', 'rejected', 'spam', 'blocked'];
const COMMENT_TARGET_TYPE_FILTERS: CommentModerationTarget[] = ['all', 'page', 'post'];
const COMMENT_TRIAGE_FILTERS: CommentTriageFilter[] = ['all', 'reported', 'replies', 'top-level', 'anonymous', 'authenticated', 'missing-email', 'reviewed', 'unreviewed'];
const COMMENT_SORT_FILTERS: CommentSortFilter[] = ['newest', 'oldest'];

const isCommentStatusFilter = (value: unknown): value is CommentStatusFilter => (
  typeof value === 'string' && COMMENT_STATUS_FILTERS.includes(value as CommentStatusFilter)
);

const isCommentTargetTypeFilter = (value: unknown): value is CommentModerationTarget => (
  typeof value === 'string' && COMMENT_TARGET_TYPE_FILTERS.includes(value as CommentModerationTarget)
);

const isCommentTriageFilter = (value: unknown): value is CommentTriageFilter => (
  typeof value === 'string' && COMMENT_TRIAGE_FILTERS.includes(value as CommentTriageFilter)
);

const isCommentSortFilter = (value: unknown): value is CommentSortFilter => (
  typeof value === 'string' && COMMENT_SORT_FILTERS.includes(value as CommentSortFilter)
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/comments')({
  validateSearch: (search: Record<string, unknown>): CommentsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    status: isCommentStatusFilter(search.status) ? search.status : undefined,
    targetType: isCommentTargetTypeFilter(search.targetType) ? search.targetType : undefined,
    targetId: normalizedSearchString(search.targetId),
    triage: isCommentTriageFilter(search.triage) ? search.triage : undefined,
    thread: normalizedSearchString(search.thread),
    sort: isCommentSortFilter(search.sort) ? search.sort : undefined,
    q: normalizedSearchString(search.q),
  }),
  component: CommentsRoute,
});

const COMMENT_PERMISSION_ROLE_DEFAULTS: Record<CommentPermissionKey, Array<AuthUser['role']>> = {
  'comments.view': ['owner', 'admin', 'editor', 'viewer'],
  'comments.manage': ['owner', 'admin', 'editor'],
  'comments.configure': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
};

const COMMENT_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose the website whose page and blog discussions are being moderated.',
    href: '#comments-site',
  },
  {
    title: 'Moderation health',
    detail: 'Track pending, approved, flagged, and total discussion volume.',
    href: '#comments-metrics',
  },
  {
    title: 'Thread map',
    detail: 'Review parent comments, replies, report load, and thread-specific queues.',
    href: '#comments-threads',
  },
  {
    title: 'Moderation API',
    detail: 'List comments, bulk update records, and sync public discussion state.',
    href: '#comments-api',
  },
  {
    title: 'Queue review',
    detail: 'Search, filter, select, export, and process the visible moderation queue.',
    href: '#comments-queue',
  },
  {
    title: 'Bulk decisions',
    detail: 'Approve, reject, mark spam, block authors, and store review reasons.',
    href: '#comments-actions',
  },
  {
    title: 'Author blocklist',
    detail: 'Review blocked email/IP identities and remove entries after appeal.',
    href: '#comments-blocklist',
  },
] as const;

const COMMENT_WORKFLOW_SURFACES = [
  {
    key: 'pages',
    title: 'Pages',
    detail: 'Review public page targets, edit comment-enabled sections, and verify route-level discussion settings.',
    route: '/pages',
  },
  {
    key: 'blog',
    title: 'Blog',
    detail: 'Moderate article threads, public post comments, reported replies, and editorial discussion handoff.',
    route: '/blog',
  },
  {
    key: 'users',
    title: 'Users',
    detail: 'Connect authenticated commenters, member identity, block state, and reviewer authority.',
    route: '/users',
  },
  {
    key: 'settings',
    title: 'Settings',
    detail: 'Confirm auth, API keys, storage, and runtime policy before exposing public discussion at scale.',
    route: '/settings',
  },
] as const;

const COMMENT_EXPORT_COLUMNS = [
  'site_id',
  'comment_id',
  'comment_thread_id',
  'parent_id',
  'target_type',
  'target_id',
  'target_title',
  'target_path',
  'status',
  'author_name',
  'author_email',
  'author_website',
  'user_id',
  'content',
  'report_count',
  'report_reasons',
  'rejection_reason',
  'block_reason',
  'reviewed_by',
  'reviewed_at',
  'blocked_by',
  'blocked_at',
  'ip_hash',
  'created_at',
  'updated_at',
  'request_id',
] as const;

interface CommentTargetSummary {
  id: string;
  type: 'page' | 'post';
  label: string;
  path: string;
}

interface CommentThreadSummary {
  id: string;
  targetKey: string;
  target?: CommentTargetSummary;
  rootComment?: AdminComment;
  latestComment?: AdminComment;
  total: number;
  replies: number;
  pending: number;
  reported: number;
  flagged: number;
  statuses: CommentModerationStatus[];
  authorNames: string[];
  createdAt?: string;
  latestAt?: string;
}

interface CommentReplyDraft {
  authorName: string;
  authorEmail: string;
  content: string;
  moderationMode: 'manual' | 'auto-approve';
}

type CommentPolicyDraft = Required<Omit<SiteCommentPolicy, 'blockedTerms'>> & {
  blockedTerms: string[];
};

const DEFAULT_COMMENT_POLICY: CommentPolicyDraft = {
  enabled: true,
  moderationMode: 'manual',
  allowGuests: true,
  requireName: true,
  requireEmail: false,
  allowReplies: true,
  enableReports: true,
  enableCaptcha: false,
  captchaProvider: 'mock',
  captchaSiteKey: '',
  blockedTerms: [],
  closedMessage: 'Comments are closed for this site.',
  sort: 'newest',
};

const normalizeCommentPolicyDraft = (policy?: SiteCommentPolicy | null): CommentPolicyDraft => ({
  ...DEFAULT_COMMENT_POLICY,
  ...(policy || {}),
  blockedTerms: Array.isArray(policy?.blockedTerms) ? policy.blockedTerms.filter(Boolean) : [],
  moderationMode: policy?.moderationMode === 'auto-approve' ? 'auto-approve' : 'manual',
  sort: policy?.sort === 'oldest' ? 'oldest' : 'newest',
  captchaProvider: policy?.captchaProvider && ['turnstile', 'hcaptcha', 'recaptcha', 'mock'].includes(policy.captchaProvider)
    ? policy.captchaProvider
    : DEFAULT_COMMENT_POLICY.captchaProvider,
  captchaSiteKey: policy?.captchaSiteKey?.trim() || '',
  closedMessage: policy?.closedMessage?.trim() || DEFAULT_COMMENT_POLICY.closedMessage,
});

const getCommentThreadKey = (comment: AdminComment) => comment.commentThreadId || comment.parentId || comment.id;

const DEFAULT_REPLY_DRAFT: CommentReplyDraft = {
  authorName: 'Backy Admin',
  authorEmail: 'admin@backy.local',
  content: '',
  moderationMode: 'auto-approve',
};

function CommentsRoute() {
  const { sites } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [commentAnalytics, setCommentAnalytics] = useState<CommentAnalytics | null>(null);
  const [commentDeliveryEvents, setCommentDeliveryEvents] = useState<CommentDeliveryEvent[]>([]);
  const [commentDeliveryError, setCommentDeliveryError] = useState<string | null>(null);
  const [commentAuditLogs, setCommentAuditLogs] = useState<AdminAuditLog[]>([]);
  const [commentAuditError, setCommentAuditError] = useState<string | null>(null);
  const [blocklist, setBlocklist] = useState<AdminCommentBlocklistEntry[]>([]);
  const [blocklistCount, setBlocklistCount] = useState(0);
  const [blocklistTypeFilter, setBlocklistTypeFilter] = useState<'all' | 'email' | 'ip'>('all');
  const [blocklistSearch, setBlocklistSearch] = useState('');
  const [targets, setTargets] = useState<CommentTargetSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<CommentStatusFilter>(routeSearch.status || 'all');
  const [targetTypeFilter, setTargetTypeFilter] = useState<CommentModerationTarget>(routeSearch.targetType || 'all');
  const [targetIdFilter, setTargetIdFilter] = useState(routeSearch.targetId || 'all');
  const [triageFilter, setTriageFilter] = useState<CommentTriageFilter>(routeSearch.triage || 'all');
  const [threadFilter, setThreadFilter] = useState(routeSearch.thread || 'all');
  const [sortFilter, setSortFilter] = useState<CommentSortFilter>(routeSearch.sort || 'newest');
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [moderationReason, setModerationReason] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<CommentReplyDraft>(DEFAULT_REPLY_DRAFT);
  const [movingCommentId, setMovingCommentId] = useState<string | null>(null);
  const [moveParentDraft, setMoveParentDraft] = useState('');
  const [pendingDeleteComment, setPendingDeleteComment] = useState<AdminComment | null>(null);
  const [commentPolicyDraft, setCommentPolicyDraft] = useState<CommentPolicyDraft>(DEFAULT_COMMENT_POLICY);
  const [savedCommentPolicy, setSavedCommentPolicy] = useState<CommentPolicyDraft>(DEFAULT_COMMENT_POLICY);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [isReplyingId, setIsReplyingId] = useState<string | null>(null);
  const [isMovingId, setIsMovingId] = useState<string | null>(null);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [retryingDeliveryIds, setRetryingDeliveryIds] = useState<string[]>([]);
  const [deletingBlocklistIds, setDeletingBlocklistIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isCommentMutationBusy = updatingIds.length > 0
    || deletingBlocklistIds.length > 0
    || retryingDeliveryIds.length > 0
    || Boolean(isReplyingId)
    || Boolean(isMovingId);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewComments = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.view', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const canManageComments = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.manage', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const canConfigureComments = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.configure', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const canExportActivity = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.view', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.manage', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const configurePermissionTitle = canConfigureComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.configure', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const activityPermissionTitle = canExportActivity ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'activity.export', COMMENT_PERMISSION_ROLE_DEFAULTS);
  const isCommentsBusy = isLoading || isCommentMutationBusy || isSavingPolicy || isPermissionMatrixPending;

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const targetByKey = useMemo(() => {
    const map = new Map<string, CommentTargetSummary>();
    targets.forEach((target) => map.set(`${target.type}:${target.id}`, target));
    return map;
  }, [targets]);
  const targetFilterOptions = useMemo(() => (
    targets
      .filter((target) => targetTypeFilter === 'all' || target.type === targetTypeFilter)
      .sort((left, right) => left.label.localeCompare(right.label) || left.type.localeCompare(right.type))
  ), [targetTypeFilter, targets]);
  const commentById = useMemo(() => {
    const map = new Map<string, AdminComment>();
    comments.forEach((comment) => map.set(comment.id, comment));
    return map;
  }, [comments]);
  const topLevelParentsByTarget = useMemo(() => {
    const map = new Map<string, AdminComment[]>();
    comments.forEach((comment) => {
      if (comment.parentId) return;
      const key = `${comment.targetType}:${comment.targetId}`;
      map.set(key, [...(map.get(key) || []), comment]);
    });
    return map;
  }, [comments]);
  const replyCountByParent = useMemo(() => {
    const map = new Map<string, number>();
    comments.forEach((comment) => {
      if (!comment.parentId) return;
      map.set(comment.parentId, (map.get(comment.parentId) || 0) + 1);
    });
    return map;
  }, [comments]);
  const threadSummaries = useMemo(() => {
    const map = new Map<string, CommentThreadSummary>();

    comments.forEach((comment) => {
      const threadId = getCommentThreadKey(comment);
      const targetKey = `${comment.targetType}:${comment.targetId}`;
      const target = targetByKey.get(targetKey);
      const createdTime = new Date(comment.createdAt).getTime();
      const isReported = (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length);
      const isFlagged = isReported || comment.status === 'spam' || comment.status === 'blocked';
      const existing = map.get(threadId);

      if (!existing) {
        map.set(threadId, {
          id: threadId,
          targetKey,
          target,
          rootComment: comment.parentId ? undefined : comment,
          latestComment: comment,
          total: 1,
          replies: comment.parentId ? 1 : 0,
          pending: comment.status === 'pending' ? 1 : 0,
          reported: isReported ? 1 : 0,
          flagged: isFlagged ? 1 : 0,
          statuses: [comment.status],
          authorNames: comment.authorName ? [comment.authorName] : [],
          createdAt: comment.createdAt,
          latestAt: comment.createdAt,
        });
        return;
      }

      existing.total += 1;
      existing.replies += comment.parentId ? 1 : 0;
      existing.pending += comment.status === 'pending' ? 1 : 0;
      existing.reported += isReported ? 1 : 0;
      existing.flagged += isFlagged ? 1 : 0;
      if (!existing.statuses.includes(comment.status)) existing.statuses.push(comment.status);
      if (comment.authorName && !existing.authorNames.includes(comment.authorName)) existing.authorNames.push(comment.authorName);
      if (!existing.rootComment && !comment.parentId) existing.rootComment = comment;
      if (!existing.createdAt || createdTime < new Date(existing.createdAt).getTime()) existing.createdAt = comment.createdAt;
      if (!existing.latestAt || createdTime > new Date(existing.latestAt).getTime()) {
        existing.latestAt = comment.createdAt;
        existing.latestComment = comment;
      }
    });

    return Array.from(map.values()).sort((left, right) => {
      const leftTime = new Date(left.latestAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.latestAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
  }, [comments, targetByKey]);
  const moderationListUrl = useMemo(() => {
    const query = new URLSearchParams();
    query.set('limit', '100');
    query.set('sort', 'newest');
    if (statusFilter !== 'all') query.set('status', statusFilter);
    if (targetTypeFilter !== 'all') query.set('targetType', targetTypeFilter);
    if (targetIdFilter !== 'all') query.set('targetId', targetIdFilter);
    if (searchQuery.trim()) query.set('q', searchQuery.trim());
    if (threadFilter !== 'all') query.set('commentThreadId', threadFilter);
    if (sortFilter) query.set('sort', sortFilter);

    return `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments?${query.toString()}`;
  }, [activeSiteId, publicBaseUrl, searchQuery, sortFilter, statusFilter, targetIdFilter, targetTypeFilter, threadFilter]);
  const moderationBulkUpdateUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments`;
  const moderationSingleUpdateUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/{commentId}`;
  const moderationAnalyticsUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/analytics?days=30`;
  const blocklistUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/blocklist`;
  const filteredComments = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return comments.filter((comment) => {
      const matchesStatus = statusFilter === 'all' || comment.status === statusFilter;
      const matchesTarget = targetTypeFilter === 'all' || comment.targetType === targetTypeFilter;
      const matchesTargetId = targetIdFilter === 'all' || comment.targetId === targetIdFilter;
      const matchesThread = threadFilter === 'all' || getCommentThreadKey(comment) === threadFilter;
      const isReported = (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length);
      const isReply = Boolean(comment.parentId);
      const isAuthenticated = Boolean(comment.userId);
      const hasAuthorEmail = Boolean(comment.authorEmail?.trim());
      const isReviewed = Boolean(comment.reviewedAt || comment.reviewedBy || comment.rejectionReason || comment.blockReason);
      const matchesTriage = (
        triageFilter === 'all' ||
        (triageFilter === 'reported' && isReported) ||
        (triageFilter === 'replies' && isReply) ||
        (triageFilter === 'top-level' && !isReply) ||
        (triageFilter === 'anonymous' && !isAuthenticated) ||
        (triageFilter === 'authenticated' && isAuthenticated) ||
        (triageFilter === 'missing-email' && !hasAuthorEmail) ||
        (triageFilter === 'reviewed' && isReviewed) ||
        (triageFilter === 'unreviewed' && !isReviewed)
      );
      const target = targetByKey.get(`${comment.targetType}:${comment.targetId}`);
      const matchesSearch = !normalizedSearch || [
        comment.authorName,
        comment.authorEmail,
        comment.authorWebsite,
        comment.content,
        comment.requestId,
        comment.reportReasons?.join(' '),
        comment.rejectionReason,
        comment.blockReason,
        target?.label,
        target?.path,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesTarget && matchesTargetId && matchesThread && matchesTriage && matchesSearch;
    }).sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return sortFilter === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [comments, searchQuery, sortFilter, statusFilter, targetByKey, targetIdFilter, targetTypeFilter, threadFilter, triageFilter]);
  const filteredBlocklist = useMemo(() => {
    const normalizedSearch = blocklistSearch.trim().toLowerCase();

    return blocklist.filter((entry) => {
      const matchesType = blocklistTypeFilter === 'all' || entry.type === blocklistTypeFilter;
      const matchesSearch = !normalizedSearch || [
        entry.value,
        entry.reason,
        entry.actor,
        entry.requestId,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      return matchesType && matchesSearch;
    });
  }, [blocklist, blocklistSearch, blocklistTypeFilter]);
  const hasActiveCommentFilters = Boolean(
    searchQuery.trim() ||
    statusFilter !== 'all' ||
    targetTypeFilter !== 'all' ||
    targetIdFilter !== 'all' ||
    triageFilter !== 'all' ||
    threadFilter !== 'all' ||
    sortFilter !== 'newest',
  );
  const metrics = useMemo(() => ({
    total: comments.length,
    pending: comments.filter((comment) => comment.status === 'pending').length,
    approved: comments.filter((comment) => comment.status === 'approved').length,
    reported: comments.filter((comment) => (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length)).length,
    spam: comments.filter((comment) => comment.status === 'spam').length,
    blocked: comments.filter((comment) => comment.status === 'blocked').length,
    flagged: comments.filter((comment) => (comment.reportCount || 0) > 0 || comment.status === 'spam' || comment.status === 'blocked').length,
  }), [comments]);
  const deliveryMetrics = useMemo(() => ({
    total: commentDeliveryEvents.length,
    submitted: commentDeliveryEvents.filter((event) => event.kind === 'comment-submitted').length,
    moderated: commentDeliveryEvents.filter((event) => event.kind === 'comment-status').length,
    reported: commentDeliveryEvents.filter((event) => event.kind === 'comment-reported').length,
    failed: commentDeliveryEvents.filter((event) => event.status === 'failed').length,
  }), [commentDeliveryEvents]);
  const auditMetrics = useMemo(() => ({
    total: commentAuditLogs.length,
    policy: commentAuditLogs.filter((log) => log.action === 'commentPolicy.update').length,
    moderation: commentAuditLogs.filter((log) => log.action === 'comment.moderate' || log.action === 'comment.reports.clear').length,
    operations: commentAuditLogs.filter((log) => log.action === 'comment.thread.update' || log.action === 'commentDelivery.retry' || log.action === 'commentBlocklist.delete').length,
  }), [commentAuditLogs]);
  const hasSelection = selectedIds.length > 0;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedReportedIds = useMemo(() => comments
    .filter((comment) => selectedSet.has(comment.id) && ((comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length)))
    .map((comment) => comment.id), [comments, selectedSet]);
  const allVisibleSelected = filteredComments.length > 0 && filteredComments.every((comment) => selectedSet.has(comment.id));
  const commentPolicyDirty = JSON.stringify(commentPolicyDraft) !== JSON.stringify(savedCommentPolicy);
  const commentPolicyBlockedTermsText = commentPolicyDraft.blockedTerms.join('\n');
  const moderationReadiness = useMemo(() => {
    const reviewComplete = metrics.pending === 0;
    const safetyClean = metrics.flagged === 0;
    const checks = [
      {
        label: 'Active site',
        detail: activeSite ? `${activeSite.name} is selected for moderation.` : 'Select a site before reviewing comments.',
        ready: Boolean(activeSite),
      },
      {
        label: 'Target index',
        detail: targets.length > 0
          ? `${targets.length} page/post target${targets.length === 1 ? '' : 's'} available`
          : 'Create pages or blog posts before enabling public comments.',
        ready: targets.length > 0,
      },
      {
        label: 'Review queue',
        detail: reviewComplete ? 'No pending comments need approval.' : `${metrics.pending} pending comment${metrics.pending === 1 ? '' : 's'} need review`,
        ready: reviewComplete,
      },
      {
        label: 'Thread context',
        detail: comments.length > 0
          ? `${threadSummaries.length} discussion thread${threadSummaries.length === 1 ? '' : 's'} with ${threadSummaries.reduce((total, thread) => total + thread.replies, 0)} repl${threadSummaries.reduce((total, thread) => total + thread.replies, 0) === 1 ? 'y' : 'ies'} mapped.`
          : 'Thread context appears when comments are submitted.',
        ready: comments.length === 0 || threadSummaries.length > 0,
      },
      {
        label: 'Safety flags',
        detail: safetyClean
          ? 'No spam, blocked, or reported comments in this view.'
          : `${metrics.flagged} flagged comment${metrics.flagged === 1 ? '' : 's'} need cleanup (${metrics.reported} reported, ${metrics.spam} spam, ${metrics.blocked} blocked)`,
        ready: safetyClean,
      },
      {
        label: 'Site policy',
        detail: commentPolicyDraft.enabled
          ? `${commentPolicyDraft.moderationMode === 'auto-approve' ? 'Auto-approve' : 'Manual review'} with ${commentPolicyDraft.blockedTerms.length} blocked term${commentPolicyDraft.blockedTerms.length === 1 ? '' : 's'}.`
          : 'Public comment submission is closed at the site level.',
        ready: commentPolicyDraft.enabled && !commentPolicyDirty,
      },
      {
        label: 'Author blocklist',
        detail: blocklistCount > 0
          ? `${blocklistCount} blocked author identit${blocklistCount === 1 ? 'y' : 'ies'} available for review.`
          : 'No blocked author identities currently stored.',
        ready: true,
      },
      {
        label: 'Bulk controls',
        detail: hasSelection ? `${selectedIds.length} selected for moderation.` : 'Approve, reject, spam, block, and export actions are available.',
        ready: true,
      },
      {
        label: 'API contract',
        detail: 'List, analytics, bulk update, and single-comment endpoints are visible for custom admin/frontends.',
        ready: true,
      },
      {
        label: 'Delivery activity',
        detail: deliveryMetrics.total > 0
          ? `${deliveryMetrics.total} comment event${deliveryMetrics.total === 1 ? '' : 's'} recorded across submission, report, and moderation handoffs.`
          : 'Comment delivery events appear after public submissions, reports, or moderation actions.',
        ready: comments.length === 0 || deliveryMetrics.total > 0,
      },
      {
        label: 'Audit trail',
        detail: auditMetrics.total > 0
          ? `${auditMetrics.total} admin audit event${auditMetrics.total === 1 ? '' : 's'} cover policy, moderation, retry, or blocklist actions.`
          : 'Admin audit events appear after policy saves or moderation actions.',
        ready: auditMetrics.total > 0 || comments.length === 0,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Capture', detail: 'Frontend pages and posts submit public comments into the site queue.' },
        { label: 'Classify', detail: 'Filter by status, target type, author, content, reports, or request id.' },
        { label: 'Moderate', detail: 'Approve, reject, mark spam, block, and record the reason in bulk or per comment.' },
        { label: 'Serve', detail: 'Only approved comments should reach public frontend comment feeds.' },
      ],
    };
  }, [activeSite, auditMetrics.total, blocklistCount, commentPolicyDirty, commentPolicyDraft.blockedTerms.length, commentPolicyDraft.enabled, commentPolicyDraft.moderationMode, comments.length, deliveryMetrics.total, hasSelection, metrics.flagged, metrics.pending, selectedIds.length, targets.length, threadSummaries]);
  const moderationHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    generatedAt: new Date().toISOString(),
    endpoints: {
      list: moderationListUrl,
      bulkUpdate: moderationBulkUpdateUrl,
      singleUpdate: moderationSingleUpdateUrl,
      analytics: moderationAnalyticsUrl,
      blocklist: blocklistUrl,
      events: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=all&limit=100`,
      publicPageThread: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/pages/{pageId}/comments`,
      publicBlogThread: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/blog/{postId}/comments`,
      reportReasons: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/report-reasons`,
      reportComment: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/{commentId}/report`,
    },
    controlRoutes: {
      pages: `/pages?siteId=${encodeURIComponent(activeSiteId)}`,
      blog: `/blog?siteId=${encodeURIComponent(activeSiteId)}`,
      users: '/users',
      settings: '/settings',
    },
    readiness: {
      score: moderationReadiness.score,
      checks: moderationReadiness.checks,
    },
    metrics,
    analytics: commentAnalytics ? {
      generatedAt: commentAnalytics.generatedAt,
      windowDays: commentAnalytics.windowDays,
      totals: commentAnalytics.totals,
      topReportReasons: commentAnalytics.reports.reasons,
      threadSummary: {
        total: commentAnalytics.threads.total,
        withReplies: commentAnalytics.threads.withReplies,
        reported: commentAnalytics.threads.reported,
        pendingReplies: commentAnalytics.threads.pendingReplies,
      },
      topTargets: commentAnalytics.targets.slice(0, 10),
      daily: commentAnalytics.daily,
    } : null,
    delivery: {
      metrics: deliveryMetrics,
      recent: commentDeliveryEvents.slice(0, 20).map((event) => ({
        id: event.id,
        kind: event.kind,
        commentId: event.commentId,
        status: event.status,
        reason: event.reason,
        requestId: event.requestId,
        createdAt: event.createdAt,
      })),
    },
    audit: {
      metrics: auditMetrics,
      recent: commentAuditLogs.slice(0, 20).map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        actorId: log.actorId || null,
        requestId: log.requestId || null,
        createdAt: log.createdAt,
      })),
    },
    filters: {
      status: statusFilter,
      targetType: targetTypeFilter,
      targetId: targetIdFilter,
      triage: triageFilter,
      thread: threadFilter,
      sort: sortFilter,
      query: searchQuery.trim(),
      visible: filteredComments.length,
      total: comments.length,
      blocklist: filteredBlocklist.length,
      blocklistTotal: blocklistCount,
    },
    moderationStates: ['pending', 'approved', 'rejected', 'spam', 'blocked'],
    threads: threadSummaries.map((thread) => ({
      id: thread.id,
      targetType: thread.target?.type || thread.rootComment?.targetType || thread.latestComment?.targetType,
      targetId: thread.target?.id || thread.rootComment?.targetId || thread.latestComment?.targetId,
      targetLabel: thread.target?.label,
      rootCommentId: thread.rootComment?.id || null,
      latestCommentId: thread.latestComment?.id || null,
      total: thread.total,
      replies: thread.replies,
      pending: thread.pending,
      reported: thread.reported,
      flagged: thread.flagged,
      statuses: thread.statuses,
      createdAt: thread.createdAt,
      latestAt: thread.latestAt,
    })),
    sitePolicy: {
      ...commentPolicyDraft,
      dirty: commentPolicyDirty,
    },
    blocklist: {
      count: blocklistCount,
      visible: filteredBlocklist.length,
      type: blocklistTypeFilter,
      query: blocklistSearch.trim(),
      entries: blocklist.map((entry) => ({
        id: entry.id,
        type: entry.type,
        value: entry.value,
        reason: entry.reason,
        actor: entry.actor || null,
        requestId: entry.requestId || null,
        createdAt: entry.createdAt,
      })),
    },
    selectedCommentIds: selectedIds,
    targets: targets.map((target) => ({
      id: target.id,
      type: target.type,
      label: target.label,
      path: target.path,
      commentCount: comments.filter((comment) => comment.targetType === target.type && comment.targetId === target.id).length,
    })),
    comments: comments.map((comment) => ({
      id: comment.id,
      targetType: comment.targetType,
      targetId: comment.targetId,
      targetLabel: targetByKey.get(`${comment.targetType}:${comment.targetId}`)?.label,
      targetPath: targetByKey.get(`${comment.targetType}:${comment.targetId}`)?.path,
      threadId: comment.commentThreadId,
      parentId: comment.parentId,
      status: comment.status,
      reportCount: comment.reportCount || 0,
      isReply: Boolean(comment.parentId),
      hasAuthorName: Boolean(comment.authorName),
      hasAuthorEmail: Boolean(comment.authorEmail),
      hasAuthorWebsite: Boolean(comment.authorWebsite),
      hasUserId: Boolean(comment.userId),
      hasContent: Boolean(comment.content),
      hasReports: Boolean(comment.reportReasons?.length),
      hasRejectionReason: Boolean(comment.rejectionReason),
      hasBlockReason: Boolean(comment.blockReason),
      reviewed: Boolean(comment.reviewedAt || comment.reviewedBy),
      blocked: Boolean(comment.blockedAt || comment.blockedBy),
      requestId: comment.requestId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
    visibleQueue: {
      count: filteredComments.length,
      ids: filteredComments.map((comment) => comment.id),
      allVisibleSelected,
    },
    privacy: {
      includesCommentContent: false,
      includesAuthorIdentity: false,
      note: 'Use CSV export or the private moderation API for author identity and comment content. This manifest exposes queue shape, endpoint contracts, counts, state, and non-content flags only.',
    },
    export: {
      csvIncludesCommentContent: true,
      csvIncludesAuthorIdentity: true,
      csvIncludesTargetRouting: true,
      csvIncludesThreading: true,
      csvIncludesModerationAudit: true,
      csvColumns: COMMENT_EXPORT_COLUMNS,
    },
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    allVisibleSelected,
    blocklist,
    blocklistCount,
    blocklistSearch,
    blocklistTypeFilter,
    blocklistUrl,
    commentAnalytics,
    commentPolicyDirty,
    commentPolicyDraft,
    comments,
    filteredComments,
    filteredBlocklist.length,
    metrics,
    moderationAnalyticsUrl,
    moderationBulkUpdateUrl,
    moderationListUrl,
    moderationReadiness.checks,
    moderationReadiness.score,
    moderationSingleUpdateUrl,
    publicBaseUrl,
    searchQuery,
    selectedIds,
    sortFilter,
    statusFilter,
    targetByKey,
    targetIdFilter,
    targetTypeFilter,
    targets,
    threadFilter,
    threadSummaries,
    triageFilter,
    auditMetrics,
    commentAuditLogs,
    deliveryMetrics,
    commentDeliveryEvents,
  ]);
  const moderationHandoffText = useMemo(() => JSON.stringify(moderationHandoff, null, 2), [moderationHandoff]);
  const moderationReasonText = moderationReason.trim();
  const rejectReason = moderationReasonText || 'Rejected from moderation queue.';
  const spamReason = moderationReasonText || 'Marked as spam.';
  const blockReason = moderationReasonText || 'Blocked from moderation queue.';
  const commentsRouteSearch = useMemo<CommentsSearch>(() => ({
    siteId: activeSiteId,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(targetTypeFilter !== 'all' ? { targetType: targetTypeFilter } : {}),
    ...(targetIdFilter !== 'all' ? { targetId: targetIdFilter } : {}),
    ...(triageFilter !== 'all' ? { triage: triageFilter } : {}),
    ...(threadFilter !== 'all' ? { thread: threadFilter } : {}),
    ...(sortFilter !== 'newest' ? { sort: sortFilter } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
  }), [activeSiteId, searchQuery, sortFilter, statusFilter, targetIdFilter, targetTypeFilter, threadFilter, triageFilter]);

  const updateCommentsRouteSearch = (next: CommentsSearch) => {
    if (isCommentsBusy) return;

    const merged: CommentsSearch = {
      ...commentsRouteSearch,
      ...next,
    };
    const normalized: CommentsSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.status && merged.status !== 'all' ? { status: merged.status } : {}),
      ...(merged.targetType && merged.targetType !== 'all' ? { targetType: merged.targetType } : {}),
      ...(merged.targetId?.trim() && merged.targetId !== 'all' ? { targetId: merged.targetId.trim() } : {}),
      ...(merged.triage && merged.triage !== 'all' ? { triage: merged.triage } : {}),
      ...(merged.thread?.trim() && merged.thread !== 'all' ? { thread: merged.thread.trim() } : {}),
      ...(merged.sort && merged.sort !== 'newest' ? { sort: merged.sort } : {}),
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
    };

    navigate({ to: '/comments', search: normalized, replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(loadError instanceof Error ? loadError.message : 'Unable to load comment permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  const refreshBlocklist = async () => {
    if (!canManageComments) {
      setBlocklist([]);
      setBlocklistCount(0);
      return { blocklist: [], count: 0 };
    }

    const result = await listCommentBlocklist(activeSiteId, { limit: 100 });
    setBlocklist(result.blocklist);
    setBlocklistCount(result.count);
    return result;
  };

  const refreshCommentAnalytics = async () => {
    if (!canViewComments) {
      setCommentAnalytics(null);
      return null;
    }

    const analyticsResult = await getCommentAnalytics(activeSiteId, { days: 30 });
    setCommentAnalytics(analyticsResult);
    return analyticsResult;
  };

  const refreshCommentDeliveryEvents = async () => {
    if (!canManageComments) {
      setCommentDeliveryEvents([]);
      setCommentDeliveryError(null);
      return null;
    }

    setCommentDeliveryError(null);
    try {
      const result = await listCommentDeliveryEvents(activeSiteId, { limit: 100 });
      setCommentDeliveryEvents(result.events);
      return result;
    } catch (deliveryError) {
      setCommentDeliveryError(deliveryError instanceof Error ? deliveryError.message : 'Unable to load comment delivery events');
      setCommentDeliveryEvents([]);
      return null;
    }
  };

  const refreshCommentAuditLogs = async () => {
    if (!canExportActivity) {
      setCommentAuditLogs([]);
      setCommentAuditError(null);
      return null;
    }

    setCommentAuditError(null);
    try {
      const result = await listAdminAuditLogs({ siteId: activeSiteId, limit: 80 });
      setCommentAuditLogs(result.logs.filter(isCommentAuditLog));
      return result;
    } catch (auditError) {
      setCommentAuditError(auditError instanceof Error ? auditError.message : 'Unable to load comment audit logs');
      setCommentAuditLogs([]);
      return null;
    }
  };

  const handleRetryCommentDelivery = async (event: CommentDeliveryEvent) => {
    if (isCommentsBusy || !event.commentId) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot retry comment delivery.');
      setNotice(null);
      return;
    }

    setRetryingDeliveryIds((current) => [...current, event.id]);
    setError(null);
    setNotice(null);

    try {
      const result = await retryCommentDelivery(activeSiteId, event.commentId, event.id);
      setComments((current) => current.map((comment) => (
        comment.id === result.comment.id ? result.comment : comment
      )));
      await refreshCommentDeliveryEvents().catch(() => null);
      await refreshCommentAuditLogs().catch(() => null);
      const channel = typeof event.metadata?.channel === 'string' ? event.metadata.channel : 'delivery';
      setNotice(`Comment ${channel} retry ${result.delivery.status}.`);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry comment delivery');
    } finally {
      setRetryingDeliveryIds((current) => current.filter((id) => id !== event.id));
    }
  };

  const loadComments = async () => {
    if (isCommentsBusy) return;
    if (!canViewComments) {
      setComments([]);
      setTargets([]);
      setCommentAnalytics(null);
      setCommentDeliveryEvents([]);
      setCommentAuditLogs([]);
      setBlocklist([]);
      setBlocklistCount(0);
      setError(viewPermissionTitle || 'Your account cannot view comments.');
      setNotice(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [commentResult, pages, posts, siteDetail, blocklistResult, deliveryResult, auditResult] = await Promise.all([
        listComments(activeSiteId, {
          status: routeSearch.status || 'all',
          targetType: routeSearch.targetType || 'all',
          targetId: routeSearch.targetId,
          q: routeSearch.q,
          commentThreadId: routeSearch.thread,
          limit: 100,
          sort: routeSearch.sort || 'newest',
        }),
        listPages(activeSiteId).catch(() => []),
        listBlogPosts(activeSiteId).catch(() => []),
        getAdminSite(activeSiteId).catch(() => null),
        canManageComments ? refreshBlocklist().catch(() => ({ blocklist: [], count: 0 })) : Promise.resolve({ blocklist: [], count: 0 }),
        canManageComments ? listCommentDeliveryEvents(activeSiteId, { limit: 100 }).catch((deliveryError) => {
          setCommentDeliveryError(deliveryError instanceof Error ? deliveryError.message : 'Unable to load comment delivery events');
          return null;
        }) : Promise.resolve(null),
        canExportActivity ? listAdminAuditLogs({ siteId: activeSiteId, limit: 80 }).catch((auditError) => {
          setCommentAuditError(auditError instanceof Error ? auditError.message : 'Unable to load comment audit logs');
          return null;
        }) : Promise.resolve(null),
      ]);
      const analyticsResult = await getCommentAnalytics(activeSiteId, { days: 30 }).catch(() => null);
      const nextPolicy = normalizeCommentPolicyDraft(siteDetail?.settings?.commentPolicy);

      setComments(commentResult.comments);
      setCommentAnalytics(analyticsResult);
      setCommentDeliveryEvents(deliveryResult?.events || []);
      if (deliveryResult) setCommentDeliveryError(null);
      setCommentAuditLogs(auditResult?.logs.filter(isCommentAuditLog) || []);
      if (auditResult) setCommentAuditError(null);
      setBlocklist(blocklistResult.blocklist || []);
      setBlocklistCount(blocklistResult.count || 0);
      setCommentPolicyDraft(nextPolicy);
      setSavedCommentPolicy(nextPolicy);
      setTargets([
        ...pages.map((page) => ({
          id: page.id,
          type: 'page' as const,
          label: page.title || page.slug || page.id,
          path: page.slug ? `/${page.slug}` : '/',
        })),
        ...posts.map((post) => ({
          id: post.id,
          type: 'post' as const,
          label: post.title || post.slug || post.id,
          path: post.slug ? `/blog/${post.slug}` : '/blog',
        })),
      ]);
      setSelectedIds((current) => current.filter((id) => commentResult.comments.some((comment) => comment.id === id)));
    } catch (loadError) {
      if (isAdminPermissionDeniedError(loadError)) {
        setComments([]);
        setTargets([]);
        setCommentAnalytics(null);
        setCommentDeliveryEvents([]);
        setCommentAuditLogs([]);
        setBlocklist([]);
        setBlocklistCount(0);
      }
      setError(loadError instanceof Error ? loadError.message : 'Unable to load comments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const siteChanged = nextSiteId !== selectedSiteId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
    }
    setSearchQuery(routeSearch.q || '');
    setStatusFilter(routeSearch.status || 'all');
    setTargetTypeFilter(routeSearch.targetType || 'all');
    setTargetIdFilter(routeSearch.targetId || 'all');
    setTriageFilter(routeSearch.triage || 'all');
    setThreadFilter(routeSearch.thread || 'all');
    setSortFilter(routeSearch.sort || 'newest');
    setSelectedIds([]);
    setModerationReason('');
    setReplyingToId(null);
    setReplyDraft(DEFAULT_REPLY_DRAFT);
    setMovingCommentId(null);
    setMoveParentDraft('');
  }, [
    routeSearch.q,
    routeSearch.siteId,
    routeSearch.sort,
    routeSearch.status,
    routeSearch.targetId,
    routeSearch.targetType,
    routeSearch.thread,
    routeSearch.triage,
    selectedSiteId,
    sites,
  ]);

  useEffect(() => {
    if (!isPermissionMatrixPending) {
      void loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSiteId,
    canViewComments,
    canManageComments,
    canExportActivity,
    isPermissionMatrixPending,
    routeSearch.q,
    routeSearch.sort,
    routeSearch.status,
    routeSearch.targetId,
    routeSearch.targetType,
    routeSearch.thread,
  ]);

  const toggleVisibleSelection = () => {
    if (isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot select comments for moderation.');
      setNotice(null);
      return;
    }

    setSelectedIds((current) => {
      const currentSet = new Set(current);
      if (allVisibleSelected) {
        filteredComments.forEach((comment) => currentSet.delete(comment.id));
      } else {
        filteredComments.forEach((comment) => currentSet.add(comment.id));
      }
      return Array.from(currentSet);
    });
  };

  const handleModerate = async (
    commentIds: string[],
    status: CommentModerationStatus,
    options: { rejectionReason?: string; blockReason?: string } = {},
  ) => {
    if (commentIds.length === 0 || isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot moderate comments.');
      setNotice(null);
      return;
    }

    setUpdatingIds(commentIds);
    setError(null);
    setNotice(null);

    try {
      const result = await updateComments(activeSiteId, {
        commentIds,
        status,
        reviewedBy: 'admin',
        actor: 'admin',
        ...options,
      });
      setComments((current) => current.map((comment) => (
        result.updated.find((updated) => updated.id === comment.id) || comment
      )));
      if (status === 'blocked') {
        await refreshBlocklist();
      }
      await refreshCommentDeliveryEvents().catch(() => null);
      await refreshCommentAuditLogs().catch(() => null);
      setSelectedIds((current) => current.filter((id) => !commentIds.includes(id)));
      setNotice(`${result.updatedCount} comment${result.updatedCount === 1 ? '' : 's'} marked ${status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update comments');
    } finally {
      setUpdatingIds([]);
    }
  };

  const handleDeleteComment = async (comment: AdminComment) => {
    if (isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot delete comments.');
      setNotice(null);
      return;
    }

    setUpdatingIds([comment.id]);
    setError(null);
    setNotice(null);

    try {
      const result = await deleteComment(activeSiteId, comment.id);
      const deletedIds = new Set(result.deleted.map((item) => item.id));
      setComments((current) => current.filter((item) => !deletedIds.has(item.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.has(id)));
      if (replyingToId && deletedIds.has(replyingToId)) {
        setReplyingToId(null);
        setReplyDraft(DEFAULT_REPLY_DRAFT);
      }
      if (movingCommentId && deletedIds.has(movingCommentId)) {
        setMovingCommentId(null);
        setMoveParentDraft('');
      }
      setPendingDeleteComment(null);
      await refreshCommentAnalytics().catch(() => null);
      await refreshCommentAuditLogs().catch(() => null);
      setNotice(`${result.deletedCount} comment${result.deletedCount === 1 ? '' : 's'} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete comment');
    } finally {
      setUpdatingIds([]);
    }
  };

  const handleDeleteBlocklistEntries = async (ids: string[]) => {
    if (ids.length === 0 || isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot remove author blocklist entries.');
      setNotice(null);
      return;
    }

    setDeletingBlocklistIds(ids);
    setError(null);
    setNotice(null);

    try {
      const result = await deleteCommentBlocklistEntries(activeSiteId, ids);
      setBlocklist((current) => current.filter((entry) => !result.deleted.some((deleted) => deleted.id === entry.id)));
      setBlocklistCount((current) => Math.max(0, current - result.deletedCount));
      await refreshCommentAuditLogs().catch(() => null);
      setNotice(`${result.deletedCount} author blocklist entr${result.deletedCount === 1 ? 'y' : 'ies'} removed.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove author blocklist entries');
    } finally {
      setDeletingBlocklistIds([]);
    }
  };

  const patchCommentPolicyDraft = (patch: Partial<CommentPolicyDraft>) => {
    if (!canConfigureComments) return;
    setCommentPolicyDraft((current) => ({
      ...current,
      ...patch,
      blockedTerms: patch.blockedTerms || current.blockedTerms,
    }));
  };

  const handleBlockedTermsChange = (value: string) => {
    if (!canConfigureComments) return;
    patchCommentPolicyDraft({
      blockedTerms: value
        .split(/\r?\n|,/)
        .map((term) => term.trim())
        .filter(Boolean),
    });
  };

  const saveCommentPolicy = async () => {
    if (isCommentsBusy || !activeSiteId) return;
    if (!canConfigureComments) {
      setError(configurePermissionTitle || 'Your account cannot configure comment policy.');
      setNotice(null);
      return;
    }

    setIsSavingPolicy(true);
    setError(null);
    setNotice(null);

    try {
      await updateSite(activeSiteId, {
        settings: {
          commentPolicy: commentPolicyDraft,
        },
      });
      const site = await getAdminSite(activeSiteId).catch(() => null);
      const nextPolicy = normalizeCommentPolicyDraft(site?.settings?.commentPolicy || commentPolicyDraft);
      setCommentPolicyDraft(nextPolicy);
      setSavedCommentPolicy(nextPolicy);
      await refreshCommentAuditLogs().catch(() => null);
      setNotice('Comment policy saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save comment policy');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleClearReports = async (commentIds: string[]) => {
    if (commentIds.length === 0 || isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot resolve comment reports.');
      setNotice(null);
      return;
    }

    setUpdatingIds(commentIds);
    setError(null);
    setNotice(null);

    try {
      const result = await updateComments(activeSiteId, {
        commentIds,
        action: 'clearReports',
        clearReports: true,
        reviewedBy: 'admin',
        actor: 'admin',
      });
      setComments((current) => current.map((comment) => (
        result.updated.find((updated) => updated.id === comment.id) || comment
      )));
      await refreshCommentDeliveryEvents().catch(() => null);
      await refreshCommentAuditLogs().catch(() => null);
      setSelectedIds((current) => current.filter((id) => !commentIds.includes(id)));
      setNotice(`${result.updatedCount} report flag${result.updatedCount === 1 ? '' : 's'} resolved.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to resolve comment reports');
    } finally {
      setUpdatingIds([]);
    }
  };

  const openReplyComposer = (comment: AdminComment) => {
    if (isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot reply to comments.');
      setNotice(null);
      return;
    }

    const defaultAuthorName = activeSite?.name ? `${activeSite.name} Team` : DEFAULT_REPLY_DRAFT.authorName;
    setReplyingToId(comment.id);
    setReplyDraft({
      ...DEFAULT_REPLY_DRAFT,
      authorName: replyDraft.authorName || defaultAuthorName,
      authorEmail: replyDraft.authorEmail || DEFAULT_REPLY_DRAFT.authorEmail,
      moderationMode: DEFAULT_REPLY_DRAFT.moderationMode,
    });
  };

  const patchReplyDraft = (patch: Partial<CommentReplyDraft>) => {
    if (!canManageComments) return;
    setReplyDraft((current) => ({ ...current, ...patch }));
  };

  const handleCreateReply = async (parentComment: AdminComment) => {
    if (isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot reply to comments.');
      setNotice(null);
      return;
    }

    const content = replyDraft.content.trim();
    if (!content) {
      setError('Enter a reply before publishing.');
      setNotice(null);
      return;
    }
    if (!commentPolicyDraft.allowReplies) {
      setError('Replies are disabled by the site comment policy.');
      setNotice(null);
      return;
    }

    setIsReplyingId(parentComment.id);
    setError(null);
    setNotice(null);

    try {
      const created = await createComment(activeSiteId, {
        targetType: parentComment.targetType,
        targetId: parentComment.targetId,
        content,
        authorName: replyDraft.authorName.trim() || DEFAULT_REPLY_DRAFT.authorName,
        authorEmail: replyDraft.authorEmail.trim() || DEFAULT_REPLY_DRAFT.authorEmail,
        parentId: parentComment.id,
        commentThreadId: getCommentThreadKey(parentComment),
        moderationMode: replyDraft.moderationMode,
        requestId: `comments-admin-reply-${Date.now().toString(36)}`,
      });
      setComments((current) => [created, ...current.filter((comment) => comment.id !== created.id)]);
      setReplyingToId(null);
      setReplyDraft((current) => ({ ...current, content: '' }));
      setThreadFilter(getCommentThreadKey(parentComment));
      await refreshCommentAnalytics().catch(() => null);
      await refreshCommentDeliveryEvents().catch(() => null);
      setNotice(`Reply added to ${parentComment.authorName || parentComment.authorEmail || 'the selected comment'}.`);
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to create reply');
    } finally {
      setIsReplyingId(null);
    }
  };

  const openMoveComposer = (comment: AdminComment, parentOptions: AdminComment[]) => {
    if (isCommentsBusy || !comment.parentId) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot move comment replies.');
      setNotice(null);
      return;
    }

    setMovingCommentId(comment.id);
    setMoveParentDraft(parentOptions.some((parent) => parent.id === comment.parentId)
      ? comment.parentId
      : parentOptions[0]?.id || '');
  };

  const handleMoveReply = async (comment: AdminComment) => {
    if (isCommentsBusy) return;
    if (!canManageComments) {
      setError(managePermissionTitle || 'Your account cannot move comment replies.');
      setNotice(null);
      return;
    }

    if (!comment.parentId) {
      setError('Only replies can be moved to another parent.');
      setNotice(null);
      return;
    }

    const parentOptions = topLevelParentsByTarget.get(`${comment.targetType}:${comment.targetId}`) || [];
    const nextParent = parentOptions.find((parent) => parent.id === moveParentDraft);
    if (!nextParent) {
      setError('Select a top-level parent comment before moving this reply.');
      setNotice(null);
      return;
    }
    if (nextParent.id === comment.parentId) {
      setMovingCommentId(null);
      setMoveParentDraft('');
      setNotice('Reply already belongs to the selected parent.');
      return;
    }

    setIsMovingId(comment.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateCommentThread(activeSiteId, comment.id, {
        parentId: nextParent.id,
        commentThreadId: getCommentThreadKey(nextParent),
        actor: 'admin',
        requestId: `comments-reparent-${Date.now().toString(36)}`,
      });
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMovingCommentId(null);
      setMoveParentDraft('');
      setThreadFilter(getCommentThreadKey(updated));
      await refreshCommentAnalytics().catch(() => null);
      await refreshCommentDeliveryEvents().catch(() => null);
      await refreshCommentAuditLogs().catch(() => null);
      setNotice(`Reply moved under ${nextParent.authorName || nextParent.authorEmail || 'the selected parent'}.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Unable to move reply');
    } finally {
      setIsMovingId(null);
    }
  };

  const copyCommentApiText = async (value: string, label: string) => {
    if (isCommentsBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };
  const downloadModerationHandoff = () => {
    if (isCommentsBusy) return;
    if (!canExportActivity) {
      setError(activityPermissionTitle || 'Your account cannot export comment handoff data.');
      setNotice(null);
      return;
    }

    const blob = new Blob([moderationHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-comments-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Comment moderation handoff manifest downloaded.');
  };
  const clearCommentFilters = () => {
    if (isCommentsBusy) return;

    setSearchQuery('');
    setStatusFilter('all');
    setTargetTypeFilter('all');
    setTargetIdFilter('all');
    setTriageFilter('all');
    setThreadFilter('all');
    setSortFilter('newest');
    updateCommentsRouteSearch({
      q: undefined,
      status: 'all',
      targetType: 'all',
      targetId: 'all',
      triage: 'all',
      thread: 'all',
      sort: 'newest',
    });
  };
  const selectCommentsSite = (nextSiteId: string) => {
    if (isCommentsBusy) return;

    setSelectedSiteId(nextSiteId);
    setSelectedIds([]);
    setModerationReason('');
    setReplyingToId(null);
    setReplyDraft(DEFAULT_REPLY_DRAFT);
    setMovingCommentId(null);
    setMoveParentDraft('');
    navigate({ to: '/comments', search: { siteId: nextSiteId }, replace: true });
  };
  const openCommentWorkflowSurface = (surface: typeof COMMENT_WORKFLOW_SURFACES[number]) => {
    if (isCommentsBusy) return;

    if (surface.route === '/pages') {
      navigate({ to: '/pages', search: activeSiteSearch });
      return;
    }

    if (surface.route === '/blog') {
      navigate({ to: '/blog', search: activeSiteSearch });
      return;
    }

    if (surface.route === '/users') {
      navigate({ to: '/users' });
      return;
    }

    navigate({ to: '/settings', search: { tab: 'notifications' } });
  };

  const handleExportComments = () => {
    if (filteredComments.length === 0 || isCommentsBusy) return;
    if (!canExportActivity) {
      setError(activityPermissionTitle || 'Your account cannot export comment data.');
      setNotice(null);
      return;
    }

    const rows = filteredComments.map((comment) => {
      const target = targetByKey.get(`${comment.targetType}:${comment.targetId}`);
      return [
        comment.siteId,
        comment.id,
        comment.commentThreadId || '',
        comment.parentId || '',
        comment.targetType,
        comment.targetId,
        target?.label || '',
        target?.path || '',
        comment.status,
        comment.authorName || '',
        comment.authorEmail || '',
        comment.authorWebsite || '',
        comment.userId || '',
        comment.content || '',
        comment.reportCount || 0,
        comment.reportReasons?.join('; ') || '',
        comment.rejectionReason || '',
        comment.blockReason || '',
        comment.reviewedBy || '',
        comment.reviewedAt || '',
        comment.blockedBy || '',
        comment.blockedAt || '',
        comment.ipHash || '',
        comment.createdAt || '',
        comment.updatedAt || '',
        comment.requestId || '',
      ];
    });
    const csv = [COMMENT_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSiteId}-comments.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!isPermissionMatrixPending && !canViewComments) {
    return (
      <PageShell
        title="Comments unavailable"
        description={viewPermissionTitle || 'Your account cannot view comments.'}
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {permissionError || viewPermissionTitle || 'Ask an owner or admin to grant comments.view access.'}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Comments"
      description="Moderate page and blog discussions, reported content, spam, and blocked authors."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="comments-active-site"
            aria-label="Active Site"
            value={activeSiteId}
            disabled={isCommentsBusy}
            onChange={(event) => selectCommentsSite(event.target.value)}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadComments()} disabled={isCommentsBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {permissionError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {permissionError}
        </div>
      )}

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="comments-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Comments command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                moderationReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {moderationReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control public discussion safety, approval queues, reported content, blocked authors, frontend comment feeds, and private moderation APIs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void copyCommentApiText(moderationHandoffText, 'Comment moderation handoff manifest')}
              disabled={isCommentsBusy || !canExportActivity}
              title={activityPermissionTitle}
              iconStart={<Copy className="size-4" />}
            >
              Copy manifest
            </Button>
            <Button
              variant="outline"
              onClick={downloadModerationHandoff}
              disabled={isCommentsBusy || !canExportActivity}
              title={activityPermissionTitle}
              iconStart={<Download className="size-4" />}
            >
              Download JSON
            </Button>
            <Button
              variant="outline"
              disabled={filteredComments.length === 0 || isCommentsBusy || !canExportActivity}
              title={activityPermissionTitle}
              onClick={handleExportComments}
              iconStart={<Download className="size-4" />}
            >
              Export CSV
            </Button>
            <Button onClick={() => void loadComments()} disabled={isCommentsBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
              Refresh comments
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Discussion readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks whether public comments are mapped, moderated, safe, and ready for frontend delivery.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', moderationReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${moderationReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {moderationReadiness.checks.map((check) => (
                <ModerationCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Comment workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {moderationReadiness.workflow.map((step, index) => (
                <ModerationWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Comments control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, moderation health, API handoff, queue review, and bulk decisions.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            {COMMENT_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Connected discussion workflows</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Public comments need page/blog targets, identity rules, moderation authority, and runtime policy to work as a controlled frontend feature.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {COMMENT_WORKFLOW_SURFACES.length} surfaces
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {COMMENT_WORKFLOW_SURFACES.map((surface) => (
              <button
                key={surface.key}
                type="button"
                onClick={() => openCommentWorkflowSurface(surface)}
                disabled={isCommentsBusy}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div id="comments-site" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="comments-active-site-inline">
          Active site
        </label>
        <select
          id="comments-active-site-inline"
          aria-label="Active comments site"
          value={activeSiteId}
          disabled={isCommentsBusy}
          onChange={(event) => selectCommentsSite(event.target.value)}
          className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sites.length === 0 ? (
            <option value="site-demo">Demo site</option>
          ) : sites.map((site) => (
            <option key={site.id} value={site.publicSiteId || site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {activeSite?.name || activeSiteId} moderation queue
        </span>
      </div>

      <section id="comments-policy" className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24" data-testid="comments-policy-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Site comment policy</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                commentPolicyDraft.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
              )}
              >
                {commentPolicyDraft.enabled ? 'open' : 'closed'}
              </span>
              {commentPolicyDirty && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">unsaved</span>}
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Set the default discussion rules custom frontends must respect before public page or blog comments enter the moderation queue.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={isCommentsBusy || !commentPolicyDirty || !canConfigureComments}
              title={configurePermissionTitle}
              onClick={() => setCommentPolicyDraft(savedCommentPolicy)}
            >
              Reset policy
            </Button>
            <Button
              disabled={isCommentsBusy || !commentPolicyDirty || !canConfigureComments}
              title={configurePermissionTitle}
              onClick={() => void saveCommentPolicy()}
              iconStart={<ShieldAlert className="size-4" />}
            >
              Save policy
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.enabled}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ enabled: event.target.checked })}
              />
              Accept public comments
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.allowGuests}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ allowGuests: event.target.checked })}
              />
              Allow guests
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.requireName}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ requireName: event.target.checked })}
              />
              Require name
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.requireEmail}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ requireEmail: event.target.checked })}
              />
              Require email
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.allowReplies}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ allowReplies: event.target.checked })}
              />
              Allow replies
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.enableReports}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ enableReports: event.target.checked })}
              />
              Enable reports
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={commentPolicyDraft.enableCaptcha}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ enableCaptcha: event.target.checked })}
              />
              Require captcha
            </label>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Default moderation
              <select
                value={commentPolicyDraft.moderationMode}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ moderationMode: event.target.value as CommentPolicyDraft['moderationMode'] })}
                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                aria-label="Default comment moderation"
              >
                <option value="manual">Manual review</option>
                <option value="auto-approve">Auto approve</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Public sort
              <select
                value={commentPolicyDraft.sort}
                disabled={isCommentsBusy || !canConfigureComments}
                title={configurePermissionTitle}
                onChange={(event) => patchCommentPolicyDraft({ sort: event.target.value as CommentPolicyDraft['sort'] })}
                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                aria-label="Default comment sort"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Captcha provider
                <select
                  value={commentPolicyDraft.captchaProvider}
                  onChange={(event) => patchCommentPolicyDraft({ captchaProvider: event.target.value as CommentPolicyDraft['captchaProvider'] })}
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
                  aria-label="Comment captcha provider"
                  disabled={isCommentsBusy || !canConfigureComments || !commentPolicyDraft.enableCaptcha}
                  title={configurePermissionTitle}
                >
                  <option value="mock">Mock</option>
                  <option value="turnstile">Turnstile</option>
                  <option value="hcaptcha">hCaptcha</option>
                  <option value="recaptcha">reCAPTCHA</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Captcha site key
                <input
                  value={commentPolicyDraft.captchaSiteKey}
                  onChange={(event) => patchCommentPolicyDraft({ captchaSiteKey: event.target.value })}
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:opacity-60"
                  aria-label="Comment captcha site key"
                  disabled={isCommentsBusy || !canConfigureComments || !commentPolicyDraft.enableCaptcha}
                  title={configurePermissionTitle}
                  placeholder="Public site key"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Closed message
            <input
              value={commentPolicyDraft.closedMessage}
              disabled={isCommentsBusy || !canConfigureComments}
              title={configurePermissionTitle}
              onChange={(event) => patchCommentPolicyDraft({ closedMessage: event.target.value })}
              className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
              aria-label="Comment closed message"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Blocked terms
            <textarea
              value={commentPolicyBlockedTermsText}
              disabled={isCommentsBusy || !canConfigureComments}
              title={configurePermissionTitle}
              onChange={(event) => handleBlockedTermsChange(event.target.value)}
              rows={3}
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
              aria-label="Comment blocked terms"
              placeholder="One term per line"
            />
          </label>
        </div>
      </section>

      <div id="comments-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-4">
        <Metric label="Comments" value={metrics.total} icon={<MessageSquare className="size-4" />} />
        <Metric label="Pending" value={metrics.pending} icon={<ShieldAlert className="size-4" />} />
        <Metric label="Approved" value={metrics.approved} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="Flagged" value={metrics.flagged} icon={<Flag className="size-4" />} />
      </div>

      <Panel id="comments-analytics" className="mb-6 scroll-mt-24" data-testid="comments-analytics-panel">
        <PanelHeader
          title="Comment analytics"
          description={commentAnalytics ? `${commentAnalytics.totals.comments} comments in the last ${commentAnalytics.windowDays} days` : 'Private analytics endpoint for comment moderation signals'}
          icon={<Flag className="size-4" />}
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={isCommentsBusy}
              onClick={() => void copyCommentApiText(moderationAnalyticsUrl, 'Comment analytics URL')}
              iconStart={<Copy className="size-4" />}
            >
              Copy analytics
            </Button>
          }
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="size-4" />
                Analytics API
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Custom admin dashboards can use this private endpoint for queue totals, report reasons, thread load, and target-level moderation trends.
              </p>
              <div className="mt-4">
                <ApiSnippet label="Comment analytics" value={moderationAnalyticsUrl} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetaTile label="30-day comments" value={`${commentAnalytics?.totals.comments ?? metrics.total}`} />
              <MetaTile label="Reported" value={`${commentAnalytics?.totals.reported ?? metrics.reported}`} />
              <MetaTile label="Threaded" value={`${commentAnalytics?.threads.withReplies ?? threadSummaries.filter((thread) => thread.replies > 0).length}`} />
              <MetaTile label="Pending replies" value={`${commentAnalytics?.threads.pendingReplies ?? threadSummaries.reduce((total, thread) => total + Math.min(thread.pending, thread.replies), 0)}`} />
              <div className="rounded-lg border border-border bg-background px-3 py-3 sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">Top report reasons</div>
                <div className="mt-1 text-sm font-semibold">{formatReportReasons(commentAnalytics)}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-3 sm:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">Busiest target</div>
                <div className="mt-1 truncate text-sm font-semibold">
                  {formatAnalyticsTarget(commentAnalytics, targetByKey)}
                </div>
              </div>
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel id="comments-delivery" className="mb-6 scroll-mt-24" data-testid="comments-delivery-panel">
        <PanelHeader
          title="Comment delivery activity"
          description="Submission, report, moderation, reply, and thread-change events for custom admin handoffs."
          icon={<RefreshCw className="size-4" />}
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={isCommentsBusy || !canManageComments}
              title={managePermissionTitle}
              onClick={() => void refreshCommentDeliveryEvents()}
              iconStart={<RefreshCw className="size-4" />}
              data-testid="comments-delivery-refresh"
            >
              Refresh activity
            </Button>
          }
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="size-4" />
                Events API
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Custom admin dashboards can poll comment events to show submission intake, reports, moderation decisions, and thread updates.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetaTile label="Activity events" value={`${deliveryMetrics.total}`} />
                <MetaTile label="Submissions" value={`${deliveryMetrics.submitted}`} />
                <MetaTile label="Moderation" value={`${deliveryMetrics.moderated}`} />
                <MetaTile label="Reports" value={`${deliveryMetrics.reported}`} />
              </div>
              {commentDeliveryError ? (
                <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {commentDeliveryError}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Recent comment handoffs</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Newest events from the site events API filtered to comment activity.
                  </div>
                </div>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  deliveryMetrics.failed > 0 ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-700',
                )}
                >
                  {deliveryMetrics.failed} failed
                </span>
              </div>
              {commentDeliveryEvents.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                  No comment delivery activity has been recorded yet.
                </div>
              ) : (
                <div className="mt-4 grid gap-3" data-testid="comments-delivery-list">
                  {commentDeliveryEvents.slice(0, 8).map((event) => (
                    <CommentDeliveryEventCard
                      key={event.id}
                      event={event}
                      isRetrying={retryingDeliveryIds.includes(event.id)}
                      canManageComments={canManageComments}
                      disabledReason={managePermissionTitle}
                      onRetry={handleRetryCommentDelivery}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel id="comments-audit" className="mb-6 scroll-mt-24" data-testid="comments-audit-panel">
        <PanelHeader
          title="Comment audit trail"
          description="Admin policy, moderation, retry, thread, and blocklist actions with request-id correlation."
          icon={<ShieldAlert className="size-4" />}
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={isCommentsBusy || !canExportActivity}
              title={activityPermissionTitle}
              onClick={() => void refreshCommentAuditLogs()}
              iconStart={<RefreshCw className="size-4" />}
              data-testid="comments-audit-refresh"
            >
              Refresh audit
            </Button>
          }
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="size-4" />
                Admin audit API
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Custom admin dashboards can read the same private audit log to prove who changed comment policy, moderation state, delivery retries, or author blocks.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetaTile label="Audit events" value={`${auditMetrics.total}`} />
                <MetaTile label="Policy" value={`${auditMetrics.policy}`} />
                <MetaTile label="Moderation" value={`${auditMetrics.moderation}`} />
                <MetaTile label="Operations" value={`${auditMetrics.operations}`} />
              </div>
              {commentAuditError ? (
                <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {commentAuditError}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Recent moderation audit</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Newest admin audit entries scoped to comment policy and moderation workflows.
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {auditMetrics.total} total
                </span>
              </div>
              {commentAuditLogs.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                  No comment audit entries have been recorded yet.
                </div>
              ) : (
                <div className="mt-4 grid gap-3" data-testid="comments-audit-list">
                  {commentAuditLogs.slice(0, 8).map((log) => (
                    <CommentAuditLogCard key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel id="comments-threads" className="mb-6 scroll-mt-24" data-testid="comments-thread-panel">
        <PanelHeader
          title="Thread map"
          description={`${threadSummaries.length} discussion thread${threadSummaries.length === 1 ? '' : 's'} mapped across visible page and blog targets`}
          icon={<MessageSquare className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Comment thread filter"
                value={threadFilter}
                disabled={isCommentsBusy}
                onChange={(event) => {
                  if (isCommentsBusy) return;
                  const thread = event.target.value;
                  setThreadFilter(thread);
                  updateCommentsRouteSearch({ thread });
                }}
                data-testid="comments-thread-filter"
                className="min-h-10 max-w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="all">All threads</option>
                {threadSummaries.slice(0, 50).map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {formatThreadOption(thread)}
                  </option>
                ))}
              </select>
              {threadFilter !== 'all' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isCommentsBusy}
                  onClick={() => {
                    if (isCommentsBusy) return;
                    setThreadFilter('all');
                    updateCommentsRouteSearch({ thread: 'all' });
                  }}
                >
                  Clear thread
                </Button>
              ) : null}
            </div>
          }
        />
        <PanelContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="text-sm font-semibold">Thread triage</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Replies stay tied to the parent discussion so reviewers can avoid approving, rejecting, or blocking a reply without seeing the thread context.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetaTile label="Threads" value={`${threadSummaries.length}`} />
                <MetaTile label="Replies" value={`${threadSummaries.reduce((total, thread) => total + thread.replies, 0)}`} />
                <MetaTile label="Pending replies" value={`${threadSummaries.reduce((total, thread) => total + Math.min(thread.pending, thread.replies), 0)}`} />
                <MetaTile label="Reported threads" value={`${threadSummaries.filter((thread) => thread.reported > 0).length}`} />
              </div>
            </div>

            <div className="grid gap-2">
              {threadSummaries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <MessageSquare className="mx-auto size-8 text-muted-foreground" />
                  <div className="mt-3 text-sm font-medium text-foreground">No comment threads yet</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Page and blog comments will appear here with parent and reply counts once submitted.
                  </div>
                </div>
              ) : threadSummaries.slice(0, 6).map((thread) => (
                <ThreadSummaryRow
                  key={thread.id}
                  thread={thread}
                  active={threadFilter === thread.id}
                  disabled={isCommentsBusy}
                  onReview={() => setThreadFilter(thread.id)}
                />
              ))}
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel id="comments-blocklist" className="mb-6 scroll-mt-24" data-testid="comments-blocklist-panel">
        <PanelHeader
          title="Author blocklist"
          description={`${filteredBlocklist.length}/${blocklistCount} blocked identities visible`}
          icon={<CircleSlash className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isCommentsBusy || !canManageComments}
                title={managePermissionTitle}
                onClick={() => void copyCommentApiText(blocklistUrl, 'Comment blocklist URL')}
                iconStart={<Copy className="size-4" />}
              >
                Copy URL
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isCommentsBusy || !canManageComments}
                title={managePermissionTitle}
                onClick={() => void refreshBlocklist()}
                iconStart={<RefreshCw className="size-4" />}
              >
                Refresh blocklist
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="size-4" />
                Comment blocklist API
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Blocking a comment stores the author email and source IP hash where available so future moderation UIs can review or remove the identity lock.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetaTile label="Visibility" value="private" />
                <MetaTile label="Entries" value={`${blocklistCount}`} />
                <MetaTile label="Visible" value={`${filteredBlocklist.length}`} />
              </div>
              <div className="mt-4">
                <ApiSnippet label="List/delete blocklist" value={blocklistUrl} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Comment blocklist type filter"
                  value={blocklistTypeFilter}
                  disabled={isCommentsBusy || !canManageComments}
                  title={managePermissionTitle}
                  onChange={(event) => setBlocklistTypeFilter(event.target.value as typeof blocklistTypeFilter)}
                  className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="all">All identities</option>
                  <option value="email">Email</option>
                  <option value="ip">IP hash</option>
                </select>
                <div className="relative min-w-56 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    aria-label="Search comment blocklist"
                    value={blocklistSearch}
                    disabled={isCommentsBusy || !canManageComments}
                    title={managePermissionTitle}
                    onChange={(event) => setBlocklistSearch(event.target.value)}
                    placeholder="Search identity, reason, actor, request..."
                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {filteredBlocklist.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                    <CircleSlash className="mx-auto size-8 text-muted-foreground" />
                    <div className="mt-3 text-sm font-medium text-foreground">No blocked authors match this view</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Block a comment to create an appealable author identity entry.
                    </div>
                  </div>
                ) : filteredBlocklist.map((entry) => {
                  const isDeleting = deletingBlocklistIds.includes(entry.id);
                  return (
                    <div key={entry.id} className="rounded-lg border border-border bg-card px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
                              {entry.type}
                            </span>
                            <span className="break-all font-mono text-sm font-semibold text-foreground">{entry.value}</span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {entry.reason || 'manual-block'}
                            {entry.actor ? ` by ${entry.actor}` : ''}
                            {entry.createdAt ? ` at ${formatDate(entry.createdAt)}` : ''}
                          </div>
                          {entry.requestId ? (
                            <div className="mt-1 max-w-full truncate font-mono text-xs text-muted-foreground">
                              {entry.requestId}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isCommentsBusy || isDeleting || !canManageComments}
                          title={managePermissionTitle}
                          onClick={() => void handleDeleteBlocklistEntries([entry.id])}
                          iconStart={<Trash2 className="size-4" />}
                          aria-label={`Remove blocklist entry ${entry.value}`}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel id="comments-queue" className="scroll-mt-24">
        <PanelHeader
          title="Moderation Queue"
          description={`${filteredComments.length}/${comments.length} visible comments`}
          icon={<MessageSquare className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={filteredComments.length === 0 || isCommentsBusy || !canExportActivity}
                title={activityPermissionTitle}
                onClick={handleExportComments}
                iconStart={<Download className="size-4" />}
              >
                Export CSV
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || isCommentsBusy || !canManageComments} title={managePermissionTitle} onClick={() => void handleModerate(selectedIds, 'approved')} iconStart={<CheckCircle2 className="size-4" />}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || isCommentsBusy || !canManageComments} title={managePermissionTitle} onClick={() => void handleModerate(selectedIds, 'rejected', { rejectionReason: rejectReason })} iconStart={<XCircle className="size-4" />}>
                Reject
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || isCommentsBusy || !canManageComments} title={managePermissionTitle} onClick={() => void handleModerate(selectedIds, 'spam', { rejectionReason: spamReason })} iconStart={<Trash2 className="size-4" />}>
                Spam
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedReportedIds.length === 0 || isCommentsBusy || !canManageComments}
                title={managePermissionTitle}
                onClick={() => void handleClearReports(selectedReportedIds)}
                iconStart={<Flag className="size-4" />}
              >
                Resolve reports
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div id="comments-api" className="mb-5 rounded-lg border border-border bg-muted/30 p-4 scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Code2 className="size-4" />
                  Comment moderation API
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Use this private moderation contract to list, filter, and update comments from a custom admin frontend.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void copyCommentApiText(moderationListUrl, 'Comments URL')} disabled={isCommentsBusy} iconStart={<Copy className="size-4" />}>
                  Copy list
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void copyCommentApiText(moderationHandoffText, 'Comment moderation handoff manifest')}
                  disabled={isCommentsBusy || !canExportActivity}
                  title={activityPermissionTitle}
                  iconStart={<Copy className="size-4" />}
                >
                  Copy manifest
                </Button>
                <a
                  href={moderationListUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={isCommentsBusy}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                    isCommentsBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  <ExternalLink className="size-4" />
                  Open endpoint
                </a>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MetaTile label="Visibility" value="private" />
              <MetaTile label="Bulk action" value={hasSelection ? `${selectedIds.length} selected` : 'none selected'} />
              <MetaTile label="Queue" value={`${filteredComments.length} visible`} />
              <MetaTile label="Public threads" value="page + blog" />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ApiSnippet label="List comments" value={moderationListUrl} />
              <ApiSnippet label="Bulk update" value={moderationBulkUpdateUrl} />
              <ApiSnippet label="Single update" value={moderationSingleUpdateUrl} />
            </div>
          </div>

          <div id="comments-actions" className="mb-4 flex flex-wrap items-center gap-3 scroll-mt-24">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search comments"
                value={searchQuery}
                disabled={isCommentsBusy}
                onChange={(event) => {
                  if (isCommentsBusy) return;
                  const q = event.target.value;
                  setSearchQuery(q);
                  updateCommentsRouteSearch({ q: q || undefined });
                }}
                placeholder="Search author, content, request, or target..."
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <select
              aria-label="Target type filter"
              value={targetTypeFilter}
              disabled={isCommentsBusy}
              onChange={(event) => {
                if (isCommentsBusy) return;
                const targetType = event.target.value as CommentModerationTarget;
                setTargetTypeFilter(targetType);
                setTargetIdFilter('all');
                updateCommentsRouteSearch({ targetType, targetId: 'all' });
              }}
              className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All targets</option>
              <option value="page">Pages</option>
              <option value="post">Posts</option>
            </select>
            <select
              aria-label="Specific target filter"
              value={targetIdFilter}
              disabled={isCommentsBusy}
              onChange={(event) => {
                if (isCommentsBusy) return;
                const targetId = event.target.value;
                setTargetIdFilter(targetId);
                updateCommentsRouteSearch({ targetId });
              }}
              className="min-h-10 max-w-72 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All pages/posts</option>
              {targetFilterOptions.map((target) => (
                <option key={`${target.type}:${target.id}`} value={target.id}>
                  {target.type === 'post' ? 'Post' : 'Page'} · {target.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Comment triage filter"
              value={triageFilter}
              disabled={isCommentsBusy}
              onChange={(event) => {
                if (isCommentsBusy) return;
                const triage = event.target.value as CommentTriageFilter;
                setTriageFilter(triage);
                updateCommentsRouteSearch({ triage });
              }}
              className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All triage</option>
              <option value="reported">Reported only</option>
              <option value="replies">Replies only</option>
              <option value="top-level">Top-level only</option>
              <option value="anonymous">Anonymous authors</option>
              <option value="authenticated">Authenticated authors</option>
              <option value="missing-email">Missing email</option>
              <option value="reviewed">Reviewed</option>
              <option value="unreviewed">Unreviewed</option>
            </select>
            <select
              aria-label="Comment queue thread filter"
              value={threadFilter}
              disabled={isCommentsBusy}
              onChange={(event) => {
                if (isCommentsBusy) return;
                const thread = event.target.value;
                setThreadFilter(thread);
                updateCommentsRouteSearch({ thread });
              }}
              className="min-h-10 max-w-72 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All threads</option>
              {threadSummaries.slice(0, 50).map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {formatThreadOption(thread)}
                </option>
              ))}
            </select>
            <select
              aria-label="Comment sort order"
              value={sortFilter}
              disabled={isCommentsBusy}
              onChange={(event) => {
                if (isCommentsBusy) return;
                const sort = event.target.value as CommentSortFilter;
                setSortFilter(sort);
                updateCommentsRouteSearch({ sort });
              }}
              className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
              <Filter className="ml-2 size-4 text-muted-foreground" />
              {(['all', 'pending', 'approved', 'rejected', 'spam', 'blocked'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    if (isCommentsBusy) return;
                    setStatusFilter(status);
                    updateCommentsRouteSearch({ status });
                  }}
                  disabled={isCommentsBusy}
                  aria-pressed={statusFilter === status}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
                    statusFilter === status && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
            {hasActiveCommentFilters && (
              <Button variant="outline" onClick={clearCommentFilters} disabled={isCommentsBusy}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="mb-4 rounded-lg border border-border bg-card p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block text-sm font-medium text-foreground">
                Moderation reason
                <textarea
                  value={moderationReason}
                  disabled={isCommentsBusy || !canManageComments}
                  title={managePermissionTitle}
                  onChange={(event) => {
                    if (isCommentsBusy || !canManageComments) return;
                    setModerationReason(event.target.value);
                  }}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Explain why selected comments are rejected, marked spam, or blocked."
                  aria-label="Comment moderation reason"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                {[
                  'Off-topic or low quality.',
                  'Promotional spam.',
                  'Harassment or abuse.',
                ].map((reason) => (
                  <Button
                    key={reason}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isCommentsBusy || !canManageComments}
                    title={managePermissionTitle}
                    onClick={() => {
                      if (isCommentsBusy || !canManageComments) return;
                      setModerationReason(reason);
                    }}
                  >
                    {reason.replace(/\.$/, '')}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!moderationReason || isCommentsBusy || !canManageComments}
                  title={managePermissionTitle}
                  onClick={() => {
                    if (isCommentsBusy || !canManageComments) return;
                    setModerationReason('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          {isLoading && comments.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <div className="size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            </div>
          ) : filteredComments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
              <MessageSquare className="mx-auto size-10 text-muted-foreground" />
              <div className="mt-3 text-sm font-medium text-foreground">No comments match this view</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Try another status, target type, triage state, sort order, or search query.
              </div>
              {hasActiveCommentFilters && (
                <Button variant="outline" onClick={clearCommentFilters} disabled={isCommentsBusy} className="mt-4">
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={isCommentsBusy || !canManageComments}
                  title={managePermissionTitle}
                  onChange={toggleVisibleSelection}
                  className="size-4 rounded border-border text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Select visible comments"
                />
                Select visible comments
              </label>
              {filteredComments.map((comment) => {
                const parentOptions = (topLevelParentsByTarget.get(`${comment.targetType}:${comment.targetId}`) || [])
                  .filter((parent) => parent.id !== comment.id);
                return (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    target={targetByKey.get(`${comment.targetType}:${comment.targetId}`)}
                    parentComment={comment.parentId ? commentById.get(comment.parentId) : undefined}
                    replyCount={replyCountByParent.get(comment.id) || 0}
                    threadKey={getCommentThreadKey(comment)}
                    canReply={commentPolicyDraft.allowReplies}
                    isReplying={replyingToId === comment.id}
                    isSubmittingReply={isReplyingId === comment.id}
                    replyDraft={replyDraft}
                    parentOptions={parentOptions}
                    isMoving={movingCommentId === comment.id}
                    isSubmittingMove={isMovingId === comment.id}
                    moveParentId={moveParentDraft}
                    selected={selectedSet.has(comment.id)}
                    disabled={isCommentsBusy || !canManageComments}
                    disabledReason={managePermissionTitle}
                    onSelect={(checked) => {
                      if (isCommentsBusy || !canManageComments) return;
                      setSelectedIds((current) => (
                        checked
                          ? Array.from(new Set([...current, comment.id]))
                          : current.filter((id) => id !== comment.id)
                      ));
                    }}
                    onApprove={() => void handleModerate([comment.id], 'approved')}
                    onReject={() => void handleModerate([comment.id], 'rejected', { rejectionReason: rejectReason })}
                    onSpam={() => void handleModerate([comment.id], 'spam', { rejectionReason: spamReason })}
                    onBlock={() => void handleModerate([comment.id], 'blocked', { blockReason })}
                    onDelete={() => setPendingDeleteComment(comment)}
                    onClearReports={() => void handleClearReports([comment.id])}
                    onOpenReply={() => openReplyComposer(comment)}
                    onCancelReply={() => {
                      setReplyingToId(null);
                      setReplyDraft((current) => ({ ...current, content: '' }));
                    }}
                    onReplyDraftChange={patchReplyDraft}
                    onSubmitReply={() => void handleCreateReply(comment)}
                    onOpenMove={() => openMoveComposer(comment, parentOptions)}
                    onCancelMove={() => {
                      setMovingCommentId(null);
                      setMoveParentDraft('');
                    }}
                    onMoveParentChange={setMoveParentDraft}
                    onSubmitMove={() => void handleMoveReply(comment)}
                  />
                );
              })}
            </div>
          )}
        </PanelContent>
      </Panel>
      {pendingDeleteComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" data-testid="comments-delete-confirm-dialog">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete comment?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This permanently removes the comment from Backy. Mark it spam or rejected if you need to keep moderation history.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Author: <span className="font-medium text-foreground">{pendingDeleteComment.authorName || pendingDeleteComment.authorEmail || 'Anonymous'}</span>
              <div className="mt-1">
                Comment ID: <span className="font-mono font-medium text-foreground">{pendingDeleteComment.id}</span>
              </div>
              {!pendingDeleteComment.parentId && (replyCountByParent.get(pendingDeleteComment.id) || 0) > 0 ? (
                <div className="mt-1 text-amber-700">
                  This also deletes {replyCountByParent.get(pendingDeleteComment.id)} repl{replyCountByParent.get(pendingDeleteComment.id) === 1 ? 'y' : 'ies'} attached to this thread.
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingDeleteComment(null)}
                disabled={isCommentsBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDeleteComment(pendingDeleteComment)}
                disabled={isCommentsBusy || !canManageComments}
                title={!canManageComments ? managePermissionTitle : undefined}
                data-testid="comments-delete-confirm-button"
              >
                {updatingIds.includes(pendingDeleteComment.id) ? 'Deleting...' : 'Delete comment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}

function ApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function formatThreadOption(thread: CommentThreadSummary) {
  const target = thread.target?.label || thread.targetKey;
  const rootAuthor = thread.rootComment?.authorName || thread.latestComment?.authorName || 'Anonymous';
  const flags = [
    `${thread.total} comment${thread.total === 1 ? '' : 's'}`,
    `${thread.replies} repl${thread.replies === 1 ? 'y' : 'ies'}`,
    thread.pending > 0 ? `${thread.pending} pending` : null,
    thread.reported > 0 ? `${thread.reported} reported` : null,
  ].filter(Boolean).join(', ');

  return `${target} - ${rootAuthor} (${flags})`;
}

function formatReportReasons(analytics: CommentAnalytics | null) {
  if (!analytics || analytics.reports.reasons.length === 0) {
    return 'No report reasons in this window';
  }

  return analytics.reports.reasons
    .slice(0, 3)
    .map((reason) => `${reason.reason} (${reason.count})`)
    .join(', ');
}

function formatAnalyticsTarget(
  analytics: CommentAnalytics | null,
  targetByKey: Map<string, CommentTargetSummary>,
) {
  const target = analytics?.targets[0];
  if (!target) {
    return 'No target activity in this window';
  }

  const targetSummary = targetByKey.get(`${target.targetType}:${target.targetId}`);
  const label = targetSummary?.label || `${target.targetType}:${target.targetId}`;
  return `${label} - ${target.total} comment${target.total === 1 ? '' : 's'}`;
}

function commentDeliveryTitle(event: CommentDeliveryEvent) {
  if (event.kind === 'comment-submitted') return 'Comment submitted';
  if (event.kind === 'comment-reported') return 'Comment reported';
  if (event.kind === 'comment-status' && event.reason === 'thread-updated') return 'Thread updated';
  if (event.kind === 'comment-status') return 'Moderation status';
  return event.kind;
}

function commentDeliveryDetail(event: CommentDeliveryEvent) {
  const parts = [
    typeof event.metadata?.channel === 'string' ? `channel:${event.metadata.channel}` : null,
    event.commentId ? `comment:${event.commentId}` : null,
    event.reason ? `reason:${event.reason}` : null,
    event.actor ? `actor:${event.actor}` : null,
  ].filter(Boolean);
  return parts.join(' | ') || event.target;
}

function commentDeliveryChannel(event: CommentDeliveryEvent) {
  return typeof event.metadata?.channel === 'string' ? event.metadata.channel : 'activity';
}

function isRetryableCommentDeliveryEvent(event: CommentDeliveryEvent) {
  const channel = commentDeliveryChannel(event);
  return event.status === 'failed'
    && Boolean(event.commentId)
    && (channel === 'webhook' || channel === 'email');
}

function isCommentAuditLog(log: AdminAuditLog): boolean {
  if (log.entity === 'comment') {
    return String(log.action).startsWith('comment');
  }

  return log.entity === 'site' && log.action === 'commentPolicy.update';
}

function auditMetadataText(log: AdminAuditLog, key: string): string {
  const value = log.metadata?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function commentAuditTitle(log: AdminAuditLog): string {
  if (log.action === 'commentPolicy.update') return 'Policy updated';
  if (log.action === 'comment.moderate') return 'Comments moderated';
  if (log.action === 'comment.reports.clear') return 'Reports resolved';
  if (log.action === 'comment.thread.update') return 'Reply moved';
  if (log.action === 'commentDelivery.retry') return 'Delivery retried';
  if (log.action === 'commentBlocklist.delete') return 'Blocklist entries removed';

  return log.action.replace(/[._-]+/g, ' ');
}

function commentAuditDescription(log: AdminAuditLog): string {
  const status = auditMetadataText(log, 'status');
  const updatedCount = auditMetadataText(log, 'updatedCount');
  const deletedCount = auditMetadataText(log, 'deletedCount');
  const deliveryStatus = auditMetadataText(log, 'deliveryStatus');
  const channel = auditMetadataText(log, 'channel');
  const targetType = auditMetadataText(log, 'targetType');
  const targetId = auditMetadataText(log, 'targetId');

  if (log.action === 'commentPolicy.update') {
    return 'Site-level comment moderation policy changed.';
  }
  if (log.action === 'comment.moderate') {
    return `${updatedCount || '1'} comment${updatedCount === '1' ? '' : 's'} marked ${status || 'updated'}.`;
  }
  if (log.action === 'comment.reports.clear') {
    return `${updatedCount || '1'} report flag${updatedCount === '1' ? '' : 's'} cleared.`;
  }
  if (log.action === 'comment.thread.update') {
    return `Reply ${log.entityId} moved${targetType && targetId ? ` on ${targetType}:${targetId}` : ''}.`;
  }
  if (log.action === 'commentDelivery.retry') {
    return `${channel || 'delivery'} retry ${deliveryStatus || 'queued'} for ${log.entityId}.`;
  }
  if (log.action === 'commentBlocklist.delete') {
    return `${deletedCount || '0'} author blocklist entr${deletedCount === '1' ? 'y' : 'ies'} removed.`;
  }

  return `${log.entity}:${log.entityId}`;
}

function CommentAuditLogCard({ log }: { log: AdminAuditLog }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3" data-testid="comments-audit-event">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {log.action}
            </span>
            <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {log.entity}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">{commentAuditTitle(log)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{commentAuditDescription(log)}</div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {log.requestId || 'no-request-id'}
          </div>
        </div>
        <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
          {log.actorId || 'admin'}
        </span>
      </div>
    </div>
  );
}

function CommentDeliveryEventCard({
  event,
  isRetrying,
  canManageComments,
  disabledReason,
  onRetry,
}: {
  event: CommentDeliveryEvent;
  isRetrying: boolean;
  canManageComments: boolean;
  disabledReason?: string;
  onRetry: (event: CommentDeliveryEvent) => void;
}) {
  const statusClass = event.status === 'succeeded'
    ? 'bg-success/10 text-success'
    : event.status === 'failed'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-warning/10 text-warning';
  const canRetry = isRetryableCommentDeliveryEvent(event);
  const channel = commentDeliveryChannel(event);

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3" data-testid="comments-delivery-event">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-md px-2 py-1 text-[11px] font-semibold', statusClass)}>
              {event.status}
            </span>
            <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {event.kind}
            </span>
            <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {channel}
            </span>
            {event.metadata?.retry === true ? (
              <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                retry
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">{commentDeliveryTitle(event)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{commentDeliveryDetail(event)}</div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {event.requestId || 'no-request-id'}
          </div>
          {event.error ? (
            <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {event.error}
            </div>
          ) : null}
        </div>
        {typeof event.statusCode === 'number' ? (
          <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            HTTP {event.statusCode}
          </span>
        ) : null}
        {canRetry ? (
          <Button
            size="sm"
            variant="outline"
            disabled={isRetrying || !canManageComments}
            title={disabledReason}
            onClick={() => onRetry(event)}
            iconStart={<RotateCcw className={cn('size-4', isRetrying ? 'animate-spin' : '')} />}
            aria-label={`Retry ${channel} delivery ${event.id}`}
            data-testid="comments-delivery-retry"
          >
            {isRetrying ? 'Retrying' : 'Retry'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ThreadSummaryRow({
  thread,
  active,
  disabled,
  onReview,
}: {
  thread: CommentThreadSummary;
  active: boolean;
  disabled: boolean;
  onReview: () => void;
}) {
  const rootAuthor = thread.rootComment?.authorName || thread.latestComment?.authorName || 'Anonymous';
  const latestAuthor = thread.latestComment?.authorName || 'Anonymous';

  return (
    <div className={cn('rounded-lg border bg-background px-4 py-3', active ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{thread.target?.label || thread.targetKey}</span>
            {thread.reported > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <Flag className="size-3" />
                {thread.reported} reported
              </span>
            ) : null}
            {thread.pending > 0 ? <StatusBadge status={`${thread.pending} pending`} type="warning" /> : null}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            Root: {rootAuthor} · Latest: {latestAuthor}{thread.latestAt ? ` at ${formatDate(thread.latestAt)}` : ''}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {thread.id}
          </div>
        </div>
        <Button
          size="sm"
          variant={active ? 'primary' : 'outline'}
          disabled={disabled}
          onClick={onReview}
          aria-label={`Review thread ${thread.id}`}
        >
          Review thread
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <MetaTile label="Total" value={`${thread.total}`} />
        <MetaTile label="Replies" value={`${thread.replies}`} />
        <MetaTile label="Flagged" value={`${thread.flagged}`} />
        <MetaTile label="States" value={thread.statuses.join(', ')} />
      </div>
    </div>
  );
}

function ModerationCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : ShieldAlert;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function ModerationWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  target,
  parentComment,
  replyCount,
  threadKey,
  canReply,
  isReplying,
  isSubmittingReply,
  replyDraft,
  parentOptions,
  isMoving,
  isSubmittingMove,
  moveParentId,
  selected,
  disabled,
  disabledReason,
  onSelect,
  onApprove,
  onReject,
  onSpam,
  onBlock,
  onDelete,
  onClearReports,
  onOpenReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
  onOpenMove,
  onCancelMove,
  onMoveParentChange,
  onSubmitMove,
}: {
  comment: AdminComment;
  target?: CommentTargetSummary;
  parentComment?: AdminComment;
  replyCount: number;
  threadKey: string;
  canReply: boolean;
  isReplying: boolean;
  isSubmittingReply: boolean;
  replyDraft: CommentReplyDraft;
  parentOptions: AdminComment[];
  isMoving: boolean;
  isSubmittingMove: boolean;
  moveParentId: string;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSelect: (checked: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  onSpam: () => void;
  onBlock: () => void;
  onDelete: () => void;
  onClearReports: () => void;
  onOpenReply: () => void;
  onCancelReply: () => void;
  onReplyDraftChange: (patch: Partial<CommentReplyDraft>) => void;
  onSubmitReply: () => void;
  onOpenMove: () => void;
  onCancelMove: () => void;
  onMoveParentChange: (parentId: string) => void;
  onSubmitMove: () => void;
}) {
  const reports = comment.reportReasons?.length ? comment.reportReasons.join(', ') : null;
  const hasReports = (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length);
  const isReply = Boolean(comment.parentId);

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')} data-testid="comment-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            title={disabledReason}
            onChange={(event) => onSelect(event.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-border text-primary disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Select comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{comment.authorName || 'Anonymous'}</h3>
              <StatusBadge status={comment.status} type={statusType(comment.status)} />
              {comment.reportCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <Flag className="size-3" />
                  {comment.reportCount}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {comment.authorEmail ? <span>{comment.authorEmail}</span> : null}
              <span>{comment.targetType}</span>
              <span>{isReply ? 'reply' : 'top-level'}</span>
              {target ? (
                <Link
                  to={target.type === 'page' ? '/pages/$pageId/edit' : '/blog/$postId'}
                  params={target.type === 'page' ? { pageId: target.id } : { postId: target.id }}
                  aria-disabled={disabled}
                  className={cn(
                    'inline-flex items-center gap-1 text-primary hover:underline',
                    disabled && 'pointer-events-none opacity-60',
                  )}
                >
                  {target.label}
                  <ExternalLink className="size-3" />
                </Link>
              ) : (
                <span>{comment.targetId}</span>
              )}
              <span>{formatDate(comment.createdAt)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono">Thread {threadKey}</span>
              {isReply ? (
                <span>
                  Reply to {parentComment?.authorName || parentComment?.authorEmail || comment.parentId}
                </span>
              ) : (
                <span>{replyCount} repl{replyCount === 1 ? 'y' : 'ies'}</span>
              )}
            </div>
          </div>
        </div>
        {comment.requestId ? (
          <div className="max-w-52 truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {comment.requestId}
          </div>
        ) : null}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
        {comment.content}
      </p>
      {reports || comment.rejectionReason || comment.blockReason ? (
        <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {reports ? <div>Reports: {reports}</div> : null}
          {comment.rejectionReason ? <div>Rejection: {comment.rejectionReason}</div> : null}
          {comment.blockReason ? <div>Block: {comment.blockReason}</div> : null}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          disabled={disabled || comment.status === 'approved'}
          title={disabledReason}
          iconStart={<CheckCircle2 className="size-4" />}
          aria-label={`Approve comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={disabled || comment.status === 'rejected'}
          title={disabledReason}
          iconStart={<XCircle className="size-4" />}
          aria-label={`Reject comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
        >
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onSpam}
          disabled={disabled || comment.status === 'spam'}
          title={disabledReason}
          iconStart={<Trash2 className="size-4" />}
          aria-label={`Mark comment from ${comment.authorName || comment.authorEmail || 'Anonymous'} as spam`}
        >
          Spam
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onBlock}
          disabled={disabled || comment.status === 'blocked'}
          title={disabledReason}
          iconStart={<CircleSlash className="size-4" />}
          aria-label={`Block comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
        >
          Block
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onDelete}
          disabled={disabled}
          title={disabledReason}
          iconStart={<Trash2 className="size-4" />}
          aria-label={`Delete comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
          data-testid="comments-delete-comment"
        >
          Delete
        </Button>
        {hasReports ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onClearReports}
            disabled={disabled}
            title={disabledReason}
            iconStart={<Flag className="size-4" />}
            aria-label={`Resolve reports for comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
          >
            Resolve reports
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenReply}
          disabled={disabled || !canReply}
          title={disabledReason}
          iconStart={<MessageSquare className="size-4" />}
          aria-label={`Reply to comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
          data-testid="comments-reply-open"
        >
          Reply
        </Button>
        {isReply ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenMove}
            disabled={disabled || parentOptions.length === 0}
            title={disabledReason}
            iconStart={<GitBranch className="size-4" />}
            aria-label={`Move reply from ${comment.authorName || comment.authorEmail || 'Anonymous'} to another parent`}
            data-testid="comments-move-open"
          >
            Move reply
          </Button>
        ) : null}
      </div>
      {isReplying ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4" data-testid="comments-reply-composer">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Official reply</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Attached to thread {threadKey} and parent comment {comment.id}.
              </div>
            </div>
            <StatusBadge status={replyDraft.moderationMode === 'auto-approve' ? 'approved' : 'pending'} type={replyDraft.moderationMode === 'auto-approve' ? 'success' : 'warning'} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(180px,0.4fr)]">
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Reply author
              <input
                value={replyDraft.authorName}
                disabled={disabled || isSubmittingReply}
                title={disabledReason}
                onChange={(event) => onReplyDraftChange({ authorName: event.target.value })}
                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Comment reply author name"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Reply email
              <input
                value={replyDraft.authorEmail}
                disabled={disabled || isSubmittingReply}
                title={disabledReason}
                onChange={(event) => onReplyDraftChange({ authorEmail: event.target.value })}
                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Comment reply author email"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Publish state
              <select
                value={replyDraft.moderationMode}
                disabled={disabled || isSubmittingReply}
                title={disabledReason}
                onChange={(event) => onReplyDraftChange({ moderationMode: event.target.value as CommentReplyDraft['moderationMode'] })}
                className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Comment reply moderation mode"
              >
                <option value="auto-approve">Publish now</option>
                <option value="manual">Send to queue</option>
              </select>
            </label>
          </div>
          <label className="mt-3 grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Reply
            <textarea
              value={replyDraft.content}
              disabled={disabled || isSubmittingReply}
              title={disabledReason}
              onChange={(event) => onReplyDraftChange({ content: event.target.value })}
              rows={3}
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Write an official response..."
              aria-label="Comment reply content"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onSubmitReply}
              disabled={disabled || isSubmittingReply || !replyDraft.content.trim()}
              title={disabledReason}
              iconStart={<MessageSquare className="size-4" />}
              data-testid="comments-reply-submit"
            >
              {isSubmittingReply ? 'Adding reply' : 'Add reply'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelReply}
              disabled={disabled || isSubmittingReply}
              title={disabledReason}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {isMoving ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4" data-testid="comments-move-composer">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Move reply</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Reassign this reply to another top-level parent on the same {comment.targetType}.
              </div>
            </div>
            <StatusBadge status="thread update" type="neutral" />
          </div>
          <label className="mt-3 grid gap-1.5 text-xs font-semibold text-muted-foreground">
            New parent
            <select
              value={moveParentId}
              disabled={disabled || isSubmittingMove}
              title={disabledReason}
              onChange={(event) => onMoveParentChange(event.target.value)}
              className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Comment reply parent"
            >
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {(parent.authorName || parent.authorEmail || 'Anonymous')} - {parent.content.slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onSubmitMove}
              disabled={disabled || isSubmittingMove || !moveParentId || moveParentId === comment.parentId}
              title={disabledReason}
              iconStart={<GitBranch className="size-4" />}
              data-testid="comments-move-submit"
            >
              {isSubmittingMove ? 'Moving reply' : 'Move reply'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelMove}
              disabled={disabled || isSubmittingMove}
              title={disabledReason}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function statusType(status: CommentModerationStatus) {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected' || status === 'spam' || status === 'blocked') return 'error';
  return 'neutral';
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
