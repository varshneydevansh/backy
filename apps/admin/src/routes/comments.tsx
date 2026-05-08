import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CheckCircle2,
  CircleSlash,
  ExternalLink,
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
  const [isLoading, setIsLoading] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const targetByKey = useMemo(() => {
    const map = new Map<string, CommentTargetSummary>();
    targets.forEach((target) => map.set(`${target.type}:${target.id}`, target));
    return map;
  }, [targets]);
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
    flagged: comments.filter((comment) => (comment.reportCount || 0) > 0 || comment.status === 'spam' || comment.status === 'blocked').length,
  }), [comments]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = filteredComments.length > 0 && filteredComments.every((comment) => selectedSet.has(comment.id));
  const hasSelection = selectedIds.length > 0;

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

  return (
    <PageShell
      title="Comments"
      description="Moderate page and blog discussions, reported content, spam, and blocked authors."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
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

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <Metric label="Comments" value={metrics.total} icon={<MessageSquare className="size-4" />} />
        <Metric label="Pending" value={metrics.pending} icon={<ShieldAlert className="size-4" />} />
        <Metric label="Approved" value={metrics.approved} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="Flagged" value={metrics.flagged} icon={<Flag className="size-4" />} />
      </div>

      <Panel>
        <PanelHeader
          title="Moderation Queue"
          description={`${filteredComments.length}/${comments.length} visible comments`}
          icon={<MessageSquare className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={!hasSelection || updatingIds.length > 0} onClick={() => void handleModerate(selectedIds, 'approved')} iconStart={<CheckCircle2 className="size-4" />}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || updatingIds.length > 0} onClick={() => void handleModerate(selectedIds, 'rejected', { rejectionReason: 'Rejected from moderation queue.' })} iconStart={<XCircle className="size-4" />}>
                Reject
              </Button>
              <Button size="sm" variant="outline" disabled={!hasSelection || updatingIds.length > 0} onClick={() => void handleModerate(selectedIds, 'spam', { rejectionReason: 'Marked as spam.' })} iconStart={<Trash2 className="size-4" />}>
                Spam
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search author, content, request, or target..."
                className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={targetTypeFilter}
              onChange={(event) => setTargetTypeFilter(event.target.value as CommentModerationTarget)}
              className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All targets</option>
              <option value="page">Pages</option>
              <option value="post">Posts</option>
            </select>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
              {(['all', 'pending', 'approved', 'rejected', 'spam', 'blocked'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:bg-background hover:text-foreground',
                    statusFilter === status && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {status}
                </button>
              ))}
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
                  onReject={() => void handleModerate([comment.id], 'rejected', { rejectionReason: 'Rejected from moderation queue.' })}
                  onSpam={() => void handleModerate([comment.id], 'spam', { rejectionReason: 'Marked as spam.' })}
                  onBlock={() => void handleModerate([comment.id], 'blocked', { blockReason: 'Blocked from moderation queue.' })}
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
        <Button size="sm" onClick={onApprove} disabled={disabled || comment.status === 'approved'} iconStart={<CheckCircle2 className="size-4" />}>Approve</Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={disabled || comment.status === 'rejected'} iconStart={<XCircle className="size-4" />}>Reject</Button>
        <Button size="sm" variant="outline" onClick={onSpam} disabled={disabled || comment.status === 'spam'} iconStart={<Trash2 className="size-4" />}>Spam</Button>
        <Button size="sm" variant="danger" onClick={onBlock} disabled={disabled || comment.status === 'blocked'} iconStart={<CircleSlash className="size-4" />}>Block</Button>
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
