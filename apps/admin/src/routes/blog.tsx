/**
 * BACKY CMS - BLOG PAGE
 * 
 * Layout route that shows list at /blog, renders child routes otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { Archive, CheckCircle2, ExternalLink, Eye, Filter, Plus, FileText, Edit, Trash2 } from 'lucide-react';
import {
  archiveBlogPost,
  createBlogPostPreview,
  deleteBlogPost,
  listBlogAuthors,
  listBlogCategories,
  listBlogPosts,
  listBlogTags,
  publishBlogPost,
  type BlogAuthor,
  type BlogCategory,
  type BlogTag,
} from '@/lib/adminContentApi';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  const routerState = useRouterState();
  const isExactBlogRoute = routerState.location.pathname === '/blog';

  if (isExactBlogRoute) {
    return <BlogListView />;
  }

  return <Outlet />;
}

function BlogListView() {
  const navigate = useNavigate();
  const { sites, posts, setPosts, deletePost, updatePost } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [statusFilter, setStatusFilter] = useState<'all' | BlogPost['status']>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedAuthorId, setSelectedAuthorId] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<'publish' | 'archive' | 'delete' | ''>('');
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [previewingPostId, setPreviewingPostId] = useState<string | null>(null);
  const [pendingDeletePost, setPendingDeletePost] = useState<BlogPost | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = useMemo(
    () => activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo',
    [activeSite, selectedSiteId],
  );
  const siteSlug = activeSite?.slug || activeSiteId;
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const visiblePosts = useMemo(
    () => posts.filter((post) => (
      (statusFilter === 'all' || post.status === statusFilter) &&
      (!selectedCategoryId || post.categoryIds?.includes(selectedCategoryId)) &&
      (!selectedTagId || post.tagIds?.includes(selectedTagId)) &&
      (!selectedAuthorId || post.author === selectedAuthorId)
    )),
    [posts, selectedAuthorId, selectedCategoryId, selectedTagId, statusFilter],
  );
  const postMetrics = useMemo(
    () => ({
      total: posts.length,
      published: posts.filter((post) => post.status === 'published').length,
      draft: posts.filter((post) => post.status === 'draft').length,
      scheduled: posts.filter((post) => post.status === 'scheduled').length,
      archived: posts.filter((post) => post.status === 'archived').length,
    }),
    [posts],
  );
  const selectedPosts = useMemo(
    () => posts.filter((post) => selectedPostIds.has(post.id)),
    [posts, selectedPostIds],
  );

  const refreshPosts = useMemo(
    () => async (siteId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const [backendPosts, backendCategories, backendTags, backendAuthors] = await Promise.all([
          listBlogPosts(siteId),
          listBlogCategories(siteId),
          listBlogTags(siteId),
          listBlogAuthors(siteId),
        ]);
        setPosts(backendPosts);
        setSelectedPostIds((current) => new Set(backendPosts.filter((post) => current.has(post.id)).map((post) => post.id)));
        setCategories(backendCategories);
        setTags(backendTags);
        setAuthors(backendAuthors);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load posts');
      } finally {
        setIsLoading(false);
      }
    },
    [setPosts],
  );

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => (site.publicSiteId || site.id) === selectedSiteId)) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    let cancelled = false;

    const loadPosts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [backendPosts, backendCategories, backendTags, backendAuthors] = await Promise.all([
          listBlogPosts(activeSiteId),
          listBlogCategories(activeSiteId),
          listBlogTags(activeSiteId),
          listBlogAuthors(activeSiteId),
        ]);
        if (!cancelled) {
          setPosts(backendPosts);
          setSelectedPostIds((current) => new Set(backendPosts.filter((post) => current.has(post.id)).map((post) => post.id)));
          setCategories(backendCategories);
          setTags(backendTags);
          setAuthors(backendAuthors);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load posts');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPosts();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, setPosts]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );
  const authorById = useMemo(
    () => new Map(authors.map((author) => [author.id, author])),
    [authors],
  );

  const setPostStatusFilter = (nextStatus: 'all' | BlogPost['status']) => {
    setStatusFilter(nextStatus);
    setCurrentPage(1);
  };

  const setPostSelection = (targetPosts: BlogPost[], selected: boolean) => {
    setSelectedPostIds((current) => {
      const next = new Set(current);
      targetPosts.forEach((post) => {
        if (selected) {
          next.add(post.id);
        } else {
          next.delete(post.id);
        }
      });
      return next;
    });
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds((current) => {
      const next = new Set(current);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const publicPostUrl = (post: BlogPost) => (
    `${publicBaseUrl}/sites/${encodeURIComponent(siteSlug)}/blog/${encodeURIComponent(post.slug)}`
  );

  const handlePreviewPost = async (post: BlogPost) => {
    setPreviewingPostId(post.id);
    setError(null);

    try {
      const preview = await createBlogPostPreview(activeSiteId, post.id);
      window.open(preview.url, '_blank', 'noopener,noreferrer');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to create post preview');
    } finally {
      setPreviewingPostId(null);
    }
  };

  const handleDeletePost = async (post: BlogPost) => {
    setError(null);

    try {
      await deleteBlogPost(activeSiteId, post.id);
      deletePost(post.id);
      setSelectedPostIds((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
      setPendingDeletePost(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete post');
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedPosts.length === 0) {
      return;
    }

    if (bulkAction === 'delete' && !pendingBulkDelete) {
      setPendingBulkDelete(true);
      return;
    }

    setIsBulkBusy(true);
    setError(null);

    try {
      if (bulkAction === 'publish') {
        const updatedPosts = await Promise.all(selectedPosts.map((post) => publishBlogPost(activeSiteId, post.id)));
        updatedPosts.forEach((post) => updatePost(post.id, post));
      }

      if (bulkAction === 'archive') {
        const updatedPosts = await Promise.all(selectedPosts.map((post) => archiveBlogPost(activeSiteId, post.id)));
        updatedPosts.forEach((post) => updatePost(post.id, post));
      }

      if (bulkAction === 'delete') {
        await Promise.all(selectedPosts.map((post) => deleteBlogPost(activeSiteId, post.id)));
        selectedPosts.forEach((post) => deletePost(post.id));
        setPendingBulkDelete(false);
      }

      setSelectedPostIds(new Set());
      setBulkAction('');
      await refreshPosts(activeSiteId);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Unable to apply bulk action');
    } finally {
      setIsBulkBusy(false);
    }
  };

  const columns: Column<BlogPost>[] = [
    {
      key: 'id',
      label: 'Select',
      render: (post) => (
        <input
          type="checkbox"
          aria-label={`Select ${post.title}`}
          checked={selectedPostIds.has(post.id)}
          onChange={() => togglePostSelection(post.id)}
          className="size-4 rounded border-border text-primary focus:ring-ring"
        />
      )
    },
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (post) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">{post.title}</div>
            <div className="text-xs text-muted-foreground">/blog/{post.slug}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (post) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={post.status} />
          {post.scheduledAt && (
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {formatDate(post.scheduledAt)}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'author',
      label: 'Author',
      sortable: true,
      render: (post) => authorById.get(post.author)?.name || post.author,
    },
    {
      key: 'categoryIds',
      label: 'Taxonomy',
      render: (post) => (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            {(post.categoryIds || []).map((id) => categoryById.get(id)?.name).filter(Boolean).join(', ') || 'Uncategorized'}
          </div>
          <div>
            {(post.tagIds || []).map((id) => tagById.get(id)?.name).filter(Boolean).join(', ') || 'No tags'}
          </div>
        </div>
      )
    },
    {
      key: 'publishedAt',
      label: 'Date',
      sortable: true,
      render: (post) => <span className="text-muted-foreground">{formatDate(post.publishedAt)}</span>
    },
    {
      key: 'actions',
      label: '',
      render: (post) => (
        <div className="flex items-center justify-end gap-2">
          {post.status === 'published' && (
            <a
              href={publicPostUrl(post)}
              target="_blank"
              rel="noreferrer"
              title="Open published post"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => {
              void handlePreviewPost(post);
            }}
            disabled={previewingPostId === post.id}
            title="Preview post"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate({ to: '/blog/$postId', params: { postId: post.id } })}
            title="Edit post"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPendingDeletePost(post)}
            title="Delete post"
            className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  const {
    data,
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems
  } = useDataTable({
    data: visiblePosts,
    columns,
    pageSize: 10
  });
  const selectedCurrentRows = data.filter((post) => selectedPostIds.has(post.id));
  const hasPosts = posts.length > 0;

  return (
    <PageShell
      title="Blog Posts"
      description="Manage your blog articles and news."
      action={
        <Link
          to="/blog/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Post
        </Link>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading blog posts from backend...
        </div>
      )}

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            { label: 'All', value: postMetrics.total, status: 'all' as const },
            { label: 'Published', value: postMetrics.published, status: 'published' as const },
            { label: 'Draft', value: postMetrics.draft, status: 'draft' as const },
            { label: 'Scheduled', value: postMetrics.scheduled, status: 'scheduled' as const },
            { label: 'Archived', value: postMetrics.archived, status: 'archived' as const },
          ].map((metric) => (
            <button
              key={metric.label}
              type="button"
              onClick={() => setPostStatusFilter(metric.status)}
              className={cn(
                'rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted',
                statusFilter === metric.status && 'border-primary bg-primary/5',
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
              <div className="mt-1 font-mono text-2xl font-semibold">{metric.value}</div>
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground">Active Site</div>
          <select
            value={activeSiteId}
            onChange={(event) => {
              setSelectedSiteId(event.target.value);
              setStatusFilter('all');
              setSelectedCategoryId('');
              setSelectedTagId('');
              setSelectedAuthorId('');
              setSelectedPostIds(new Set());
            }}
            className="mt-2 w-full min-w-52 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasPosts && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">{selectedPostIds.size} selected</span>
          <button
            type="button"
            onClick={() => setPostSelection(data, selectedCurrentRows.length !== data.length)}
            disabled={data.length === 0}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selectedCurrentRows.length === data.length && data.length > 0 ? 'Clear visible' : 'Select visible'}
          </button>
          <select
            value={bulkAction}
            onChange={(event) => {
              setBulkAction(event.target.value as typeof bulkAction);
              setPendingBulkDelete(false);
            }}
            className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Bulk action...</option>
            <option value="publish">Publish selected</option>
            <option value="archive">Archive selected</option>
            <option value="delete">Delete selected</option>
          </select>
          <button
            type="button"
            onClick={() => void handleBulkAction()}
            disabled={!bulkAction || selectedPosts.length === 0 || isBulkBusy}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              bulkAction === 'delete'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:bg-primary/90',
            )}
          >
            {bulkAction === 'publish' && <CheckCircle2 className="size-4" />}
            {bulkAction === 'archive' && <Archive className="size-4" />}
            {bulkAction === 'delete' && <Trash2 className="size-4" />}
            {isBulkBusy ? 'Applying...' : 'Apply'}
          </button>
          {selectedPosts.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPostIds(new Set())}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Filter className="ml-2 size-4 text-muted-foreground" />
          {(['all', 'published', 'draft', 'scheduled', 'archived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setPostStatusFilter(status)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                statusFilter === status && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
              )}
            >
              {status}
            </button>
          ))}
        </div>
        <select
          value={selectedCategoryId}
          onChange={(event) => {
            setSelectedCategoryId(event.target.value);
            setCurrentPage(1);
          }}
          className="w-48 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={selectedTagId}
          onChange={(event) => {
            setSelectedTagId(event.target.value);
            setCurrentPage(1);
          }}
          className="w-44 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <select
          value={selectedAuthorId}
          onChange={(event) => {
            setSelectedAuthorId(event.target.value);
            setCurrentPage(1);
          }}
          className="w-44 rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All authors</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setSelectedCategoryId('');
            setSelectedTagId('');
            setSelectedAuthorId('');
            setCurrentPage(1);
          }}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Clear Filters
        </button>
        <button
          type="button"
          onClick={() => void refreshPosts(activeSiteId)}
          disabled={isLoading}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={data}
        sortConfig={sortConfig}
        onSort={handleSort}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalItems}
        emptyState={
          <EmptyState
            icon={FileText}
            title={hasPosts ? 'No matching posts' : 'No posts yet'}
            description={
              hasPosts
                ? 'No posts match the current search, status, taxonomy, or author filters.'
                : 'Write the first post for this site, then design its public page.'
            }
            action={
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {hasPosts && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setSelectedCategoryId('');
                      setSelectedTagId('');
                      setSelectedAuthorId('');
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-colors hover:bg-accent"
                  >
                    Clear Filters
                  </button>
                )}
                <button
                  type="button"
                  data-testid="blog-empty-create"
                  onClick={() => navigate({ to: '/blog/new' })}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                  {hasPosts ? 'New Post' : 'Create First Post'}
                </button>
              </div>
            }
          />
        }
      />

      {pendingDeletePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingDeletePost.title}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the post from the backend and from public API delivery. Archive it instead if you only want it hidden.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Route: <span className="font-medium text-foreground">/blog/{pendingDeletePost.slug}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeletePost(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePost(pendingDeletePost)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Delete post
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Delete {selectedPosts.length} selected post{selectedPosts.length === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selected posts will be removed from the site and from frontend API delivery.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isBulkBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                Delete posts
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
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
