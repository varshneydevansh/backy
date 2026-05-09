import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CheckCircle2,
  CircleSlash,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Flag,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  listBlogPosts,
  listComments,
  listPages,
  updateComments,
  type AdminComment,
  type CommentModerationStatus,
  type CommentModerationTarget,
} from '@/lib/adminContentApi';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/comments')({
  component: CommentsRoute,
});

type CommentStatusFilter = CommentModerationStatus | 'all';

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

function CommentsRoute() {
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [targets, setTargets] = useState<CommentTargetSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<CommentStatusFilter>('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState<CommentModerationTarget>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [moderationReason, setModerationReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const targetByKey = useMemo(() => {
    const map = new Map<string, CommentTargetSummary>();
    targets.forEach((target) => map.set(`${target.type}:${target.id}`, target));
    return map;
  }, [targets]);
  const moderationListUrl = useMemo(() => {
    const query = new URLSearchParams();
    query.set('limit', '100');
    query.set('sort', 'newest');
    if (statusFilter !== 'all') query.set('status', statusFilter);
    if (targetTypeFilter !== 'all') query.set('targetType', targetTypeFilter);
    if (searchQuery.trim()) query.set('q', searchQuery.trim());

    return `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments?${query.toString()}`;
  }, [activeSiteId, publicBaseUrl, searchQuery, statusFilter, targetTypeFilter]);
  const moderationBulkUpdateUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments`;
  const moderationSingleUpdateUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/{commentId}`;
  const filteredComments = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return comments.filter((comment) => {
      const matchesStatus = statusFilter === 'all' || comment.status === statusFilter;
      const matchesTarget = targetTypeFilter === 'all' || comment.targetType === targetTypeFilter;
      const target = targetByKey.get(`${comment.targetType}:${comment.targetId}`);
      const matchesSearch = !normalizedSearch || [
        comment.authorName,
        comment.authorEmail,
        comment.content,
        comment.requestId,
        target?.label,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesTarget && matchesSearch;
    });
  }, [comments, searchQuery, statusFilter, targetByKey, targetTypeFilter]);
  const metrics = useMemo(() => ({
    total: comments.length,
    pending: comments.filter((comment) => comment.status === 'pending').length,
    approved: comments.filter((comment) => comment.status === 'approved').length,
    reported: comments.filter((comment) => (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length)).length,
    spam: comments.filter((comment) => comment.status === 'spam').length,
    blocked: comments.filter((comment) => comment.status === 'blocked').length,
    flagged: comments.filter((comment) => (comment.reportCount || 0) > 0 || comment.status === 'spam' || comment.status === 'blocked').length,
  }), [comments]);
  const hasSelection = selectedIds.length > 0;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = filteredComments.length > 0 && filteredComments.every((comment) => selectedSet.has(comment.id));
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
        label: 'Safety flags',
        detail: safetyClean
          ? 'No spam, blocked, or reported comments in this view.'
          : `${metrics.flagged} flagged comment${metrics.flagged === 1 ? '' : 's'} need cleanup (${metrics.reported} reported, ${metrics.spam} spam, ${metrics.blocked} blocked)`,
        ready: safetyClean,
      },
      {
        label: 'Bulk controls',
        detail: hasSelection ? `${selectedIds.length} selected for moderation.` : 'Approve, reject, spam, block, and export actions are available.',
        ready: true,
      },
      {
        label: 'API contract',
        detail: 'List, bulk update, and single-comment endpoints are visible for custom admin/frontends.',
        ready: true,
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
  }, [activeSite, hasSelection, metrics.flagged, metrics.pending, selectedIds.length, targets.length]);
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
      publicPageThread: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/pages/{pageId}/comments`,
      publicBlogThread: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/blog/{postId}/comments`,
      reportReasons: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/report-reasons`,
      reportComment: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/comments/{commentId}/report`,
    },
    controlRoutes: {
      pages: '/pages',
      blog: '/blog',
      users: '/users',
      settings: '/settings',
    },
    readiness: {
      score: moderationReadiness.score,
      checks: moderationReadiness.checks,
    },
    metrics,
    filters: {
      status: statusFilter,
      targetType: targetTypeFilter,
      query: searchQuery.trim(),
    },
    moderationStates: ['pending', 'approved', 'rejected', 'spam', 'blocked'],
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
    comments,
    filteredComments,
    metrics,
    moderationBulkUpdateUrl,
    moderationListUrl,
    moderationReadiness.checks,
    moderationReadiness.score,
    moderationSingleUpdateUrl,
    publicBaseUrl,
    searchQuery,
    selectedIds,
    statusFilter,
    targetByKey,
    targetTypeFilter,
    targets,
  ]);
  const moderationHandoffText = useMemo(() => JSON.stringify(moderationHandoff, null, 2), [moderationHandoff]);
  const moderationReasonText = moderationReason.trim();
  const rejectReason = moderationReasonText || 'Rejected from moderation queue.';
  const spamReason = moderationReasonText || 'Marked as spam.';
  const blockReason = moderationReasonText || 'Blocked from moderation queue.';

  const loadComments = async () => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [commentResult, pages, posts] = await Promise.all([
        listComments(activeSiteId, { status: 'all', limit: 100, sort: 'newest' }),
        listPages(activeSiteId).catch(() => []),
        listBlogPosts(activeSiteId).catch(() => []),
      ]);

      setComments(commentResult.comments);
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
      setError(loadError instanceof Error ? loadError.message : 'Unable to load comments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => (site.publicSiteId || site.id) === selectedSiteId)) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    void loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  const toggleVisibleSelection = () => {
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
    if (commentIds.length === 0) return;
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
      setSelectedIds((current) => current.filter((id) => !commentIds.includes(id)));
      setNotice(`${result.updatedCount} comment${result.updatedCount === 1 ? '' : 's'} marked ${status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update comments');
    } finally {
      setUpdatingIds([]);
    }
  };

  const copyCommentApiText = async (value: string, label: string) => {
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

  const handleExportComments = () => {
    if (filteredComments.length === 0) return;

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
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadComments()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
              iconStart={<Copy className="size-4" />}
            >
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadModerationHandoff} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button
              variant="outline"
              disabled={filteredComments.length === 0}
              onClick={handleExportComments}
              iconStart={<Download className="size-4" />}
            >
              Export CSV
            </Button>
            <Button onClick={() => void loadComments()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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
              <Link
                key={surface.key}
                to={surface.route}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </Link>
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
          onChange={(event) => setSelectedSiteId(event.target.value)}
          className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
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

      <div id="comments-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-4">
        <Metric label="Comments" value={metrics.total} icon={<MessageSquare className="size-4" />} />
        <Metric label="Pending" value={metrics.pending} icon={<ShieldAlert className="size-4" />} />
        <Metric label="Approved" value={metrics.approved} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="Flagged" value={metrics.flagged} icon={<Flag className="size-4" />} />
      </div>

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
                disabled={filteredComments.length === 0}
                onClick={handleExportComments}
                iconStart={<Download className="size-4" />}
              >
                Export CSV
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || updatingIds.length > 0} onClick={() => void handleModerate(selectedIds, 'approved')} iconStart={<CheckCircle2 className="size-4" />}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || updatingIds.length > 0} onClick={() => void handleModerate(selectedIds, 'rejected', { rejectionReason: rejectReason })} iconStart={<XCircle className="size-4" />}>
                Reject
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || updatingIds.length > 0} onClick={() => void handleModerate(selectedIds, 'spam', { rejectionReason: spamReason })} iconStart={<Trash2 className="size-4" />}>
                Spam
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
                <Button onClick={() => void copyCommentApiText(moderationListUrl, 'Comments URL')} iconStart={<Copy className="size-4" />}>
                  Copy list
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void copyCommentApiText(moderationHandoffText, 'Comment moderation handoff manifest')}
                  iconStart={<Copy className="size-4" />}
                >
                  Copy manifest
                </Button>
                <a
                  href={moderationListUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
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
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search author, content, request, or target..."
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              aria-label="Target type filter"
              value={targetTypeFilter}
              onChange={(event) => setTargetTypeFilter(event.target.value as CommentModerationTarget)}
              className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All targets</option>
              <option value="page">Pages</option>
              <option value="post">Posts</option>
            </select>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
              <Filter className="ml-2 size-4 text-muted-foreground" />
              {(['all', 'pending', 'approved', 'rejected', 'spam', 'blocked'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
                    statusFilter === status && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-border bg-card p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block text-sm font-medium text-foreground">
                Moderation reason
                <textarea
                  value={moderationReason}
                  onChange={(event) => setModerationReason(event.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Explain why selected comments are rejected, marked spam, or blocked."
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
                    onClick={() => setModerationReason(reason)}
                  >
                    {reason.replace(/\.$/, '')}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!moderationReason}
                  onClick={() => setModerationReason('')}
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
            <EmptyState
              icon={MessageSquare}
              title="No comments match this view"
              description="Try another status, target type, or search query."
            />
          ) : (
            <div className="space-y-3">
              <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisibleSelection}
                  className="size-4 rounded border-border text-primary"
                  aria-label="Select visible comments"
                />
                Select visible comments
              </label>
              {filteredComments.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  target={targetByKey.get(`${comment.targetType}:${comment.targetId}`)}
                  selected={selectedSet.has(comment.id)}
                  disabled={updatingIds.includes(comment.id)}
                  onSelect={(checked) => setSelectedIds((current) => (
                    checked
                      ? Array.from(new Set([...current, comment.id]))
                      : current.filter((id) => id !== comment.id)
                  ))}
                  onApprove={() => void handleModerate([comment.id], 'approved')}
                  onReject={() => void handleModerate([comment.id], 'rejected', { rejectionReason: rejectReason })}
                  onSpam={() => void handleModerate([comment.id], 'spam', { rejectionReason: spamReason })}
                  onBlock={() => void handleModerate([comment.id], 'blocked', { blockReason })}
                />
              ))}
            </div>
          )}
        </PanelContent>
      </Panel>
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
  selected,
  disabled,
  onSelect,
  onApprove,
  onReject,
  onSpam,
  onBlock,
}: {
  comment: AdminComment;
  target?: CommentTargetSummary;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  onSpam: () => void;
  onBlock: () => void;
}) {
  const reports = comment.reportReasons?.length ? comment.reportReasons.join(', ') : null;

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-border text-primary"
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
              {target ? (
                <Link to={target.type === 'page' ? '/pages/$pageId/edit' : '/blog/$postId'} params={target.type === 'page' ? { pageId: target.id } : { postId: target.id }} className="inline-flex items-center gap-1 text-primary hover:underline">
                  {target.label}
                  <ExternalLink className="size-3" />
                </Link>
              ) : (
                <span>{comment.targetId}</span>
              )}
              <span>{formatDate(comment.createdAt)}</span>
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
          iconStart={<CircleSlash className="size-4" />}
          aria-label={`Block comment from ${comment.authorName || comment.authorEmail || 'Anonymous'}`}
        >
          Block
        </Button>
      </div>
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
