/**
 * BACKY CMS - BLOG PAGE
 * 
 * Layout route that shows list at /blog, renders child routes otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Archive, CheckCircle2, Copy, Download, ExternalLink, Eye, Filter, Plus, FileText, Edit, Trash2 } from 'lucide-react';
import {
  archiveBlogPost,
  createBlogPostPreview,
  deleteBlogPost,
  getAdminApiBase,
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
import { getSiteSearchParam, getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

const BLOG_CONTROL_AREAS = [
  {
    title: 'Status overview',
    detail: 'All, published, draft, scheduled, archived, and active site scope.',
    href: '#blog-overview',
  },
  {
    title: 'Bulk actions',
    detail: 'Select visible posts, publish, archive, delete, and clear selections.',
    href: '#blog-bulk',
  },
  {
    title: 'Filters',
    detail: 'Search by title and filter by status, category, tag, or author.',
    href: '#blog-filters',
  },
  {
    title: 'Post table',
    detail: 'Edit, preview, open published posts, and manage taxonomy columns.',
    href: '#blog-posts',
  },
] as const;

const BLOG_FRONTEND_SYSTEMS = [
  {
    key: 'feed',
    title: 'Post feeds',
    detail: 'Public list pages, pagination, status filtering, excerpts, thumbnails, and scheduled visibility.',
  },
  {
    key: 'article',
    title: 'Article detail',
    detail: 'Slug routes, rendered canvas content, SEO metadata, preview URLs, and revision-aware publishing.',
  },
  {
    key: 'taxonomy',
    title: 'Taxonomy filters',
    detail: 'Categories, tags, archive pages, related posts, frontend filter chips, and feed grouping.',
  },
  {
    key: 'authors',
    title: 'Authors and bylines',
    detail: 'Author IDs, display names, post counts, profile pages, and public byline contracts.',
  },
  {
    key: 'editorial',
    title: 'Editorial workflow',
    detail: 'Drafts, scheduled posts, publish/archive actions, bulk actions, previews, and readiness checks.',
  },
  {
    key: 'handoff',
    title: 'Frontend API handoff',
    detail: 'Public blog list, post-by-slug, render, resolve, and private admin management endpoints.',
  },
] as const;

const BLOG_WORKFLOW_SURFACES = [
  {
    key: 'blogIndex',
    title: 'Blog index page',
    detail: 'Seed a public listing page that binds to Backy posts, taxonomy, excerpts, pagination, and article routes.',
    route: '/pages/new',
    template: 'blog-index',
  },
  {
    key: 'media',
    title: 'Media',
    detail: 'Manage covers, inline assets, author images, downloads, and responsive images used by posts.',
    route: '/media',
  },
  {
    key: 'comments',
    title: 'Comments',
    detail: 'Moderate public article discussions, reported replies, blocked authors, and approved comment feeds.',
    route: '/comments',
  },
  {
    key: 'users',
    title: 'Authors and users',
    detail: 'Coordinate author identity, collaborator permissions, membership handoff, and publishing authority.',
    route: '/users',
  },
  {
    key: 'settings',
    title: 'Settings',
    detail: 'Confirm API keys, delivery mode, auth policy, and storage/database runtime before public publishing.',
    route: '/settings',
  },
] as const;

const BLOG_EXPORT_COLUMNS = [
  'post_id',
  'active_site_id',
  'title',
  'slug',
  'path',
  'status',
  'scheduled_at',
  'published_at',
  'author_id',
  'author_name',
  'category_ids',
  'category_names',
  'tag_ids',
  'tag_names',
  'excerpt',
  'public_url',
  'public_post_by_slug_url',
  'public_render_url',
  'public_resolve_url',
  'admin_post_url',
  'admin_readiness_url',
  'admin_preview_url',
  'frontend_systems',
] as const;

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
  const routerState = useRouterState();
  const { sites, posts, setPosts, deletePost, updatePost } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(() => getSiteSelectionFromSearch(sites));
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
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = useMemo(
    () => activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo',
    [activeSite, selectedSiteId],
  );
  const siteSlug = activeSite?.slug || activeSiteId;
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminBaseUrl = useMemo(() => getAdminApiBase(), []);
  const createPostSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const siteScopedPosts = useMemo(() => {
    const siteIdentifiers = new Set(
      [activeSiteId, activeSite?.id, activeSite?.publicSiteId].filter(Boolean),
    );

    return posts.filter((post) => !post.siteId || siteIdentifiers.has(post.siteId));
  }, [activeSite?.id, activeSite?.publicSiteId, activeSiteId, posts]);
  const visiblePosts = useMemo(
    () => siteScopedPosts.filter((post) => (
      (statusFilter === 'all' || post.status === statusFilter) &&
      (!selectedCategoryId || post.categoryIds?.includes(selectedCategoryId)) &&
      (!selectedTagId || post.tagIds?.includes(selectedTagId)) &&
      (!selectedAuthorId || post.author === selectedAuthorId)
    )),
    [selectedAuthorId, selectedCategoryId, selectedTagId, siteScopedPosts, statusFilter],
  );
  const postMetrics = useMemo(
    () => ({
      total: siteScopedPosts.length,
      published: siteScopedPosts.filter((post) => post.status === 'published').length,
      draft: siteScopedPosts.filter((post) => post.status === 'draft').length,
      scheduled: siteScopedPosts.filter((post) => post.status === 'scheduled').length,
      archived: siteScopedPosts.filter((post) => post.status === 'archived').length,
    }),
    [siteScopedPosts],
  );
  const selectedPosts = useMemo(
    () => siteScopedPosts.filter((post) => selectedPostIds.has(post.id)),
    [selectedPostIds, siteScopedPosts],
  );
  const handoffPost = selectedPosts[0] || siteScopedPosts.find((post) => post.status === 'published') || siteScopedPosts[0] || null;
  const handoffPostSegment = handoffPost?.id ? encodeURIComponent(handoffPost.id) : '{postId}';
  const handoffPostSlug = handoffPost?.slug ? encodeURIComponent(handoffPost.slug) : '{postSlug}';
  const publicBlogUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/blog`;
  const publicPostBySlugUrl = `${publicBlogUrl}?slug=${handoffPostSlug}`;
  const publicPostRenderUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(handoffPost ? `/blog/${handoffPost.slug}` : '/blog/{postSlug}')}`;
  const publicPostResolveUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(handoffPost ? `/blog/${handoffPost.slug}` : '/blog/{postSlug}')}`;
  const adminBlogUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/blog`;
  const adminBlogPostUrl = `${adminBlogUrl}/${handoffPostSegment}`;
  const adminBlogReadinessUrl = `${adminBlogPostUrl}/readiness`;
  const adminBlogPreviewUrl = `${adminBlogPostUrl}/preview`;

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
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
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
    setNotice(null);

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
    setNotice(null);

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
    setNotice(null);

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
            onClick={() => navigate({ to: '/blog/$postId', params: { postId: post.id }, search: { siteId: activeSiteId } })}
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
  const getBlogSurfaceSearch = (surface: (typeof BLOG_WORKFLOW_SURFACES)[number]) => {
    if (surface.route === '/pages/new') {
      return { siteId: activeSiteId, template: surface.template };
    }

    if (surface.route === '/media' || surface.route === '/comments' || surface.route === '/users') {
      return { siteId: activeSiteId };
    }

    return undefined;
  };
  useEffect(() => {
    const requestedSiteId = getSiteSearchParam();
    if (!requestedSiteId) return;

    const nextSiteId = getSiteSelectionFromSearch(sites);
    if (nextSiteId === selectedSiteId) return;

    setSelectedSiteId(nextSiteId);
    setStatusFilter('all');
    setSelectedCategoryId('');
    setSelectedTagId('');
    setSelectedAuthorId('');
    setSearchQuery('');
    setCurrentPage(1);
    setSelectedPostIds(new Set());
  }, [routerState.location.search, selectedSiteId, sites, setCurrentPage, setSearchQuery]);
  const selectedCurrentRows = data.filter((post) => selectedPostIds.has(post.id));
  const hasPosts = siteScopedPosts.length > 0;
  const editorialReadiness = useMemo(() => {
    const hasSite = Boolean(activeSite || activeSiteId);
    const hasPublished = postMetrics.published > 0;
    const hasDraftPipeline = postMetrics.draft > 0 || postMetrics.scheduled > 0;
    const hasTaxonomy = categories.length > 0 || tags.length > 0 || siteScopedPosts.some((post) => (post.categoryIds?.length || 0) > 0 || (post.tagIds?.length || 0) > 0);
    const hasAuthors = authors.length > 0 || siteScopedPosts.some((post) => Boolean(post.author));
    const hasBulkSelection = selectedPostIds.size > 0;
    const checks = [
      {
        label: 'Site scope',
        detail: hasSite ? `Editing ${activeSite?.name || activeSiteId}.` : 'Choose a site before managing posts.',
        ready: hasSite,
      },
      {
        label: 'Post inventory',
        detail: hasPosts ? `${postMetrics.total} post${postMetrics.total === 1 ? '' : 's'} available.` : 'Create the first post for this site.',
        ready: hasPosts,
      },
      {
        label: 'Public delivery',
        detail: hasPublished ? `${postMetrics.published} published post${postMetrics.published === 1 ? '' : 's'} ready for frontend routes.` : 'Publish posts to expose public article routes.',
        ready: hasPublished,
      },
      {
        label: 'Draft pipeline',
        detail: hasDraftPipeline ? `${postMetrics.draft} draft, ${postMetrics.scheduled} scheduled.` : 'Create drafts or scheduled posts for upcoming publishing work.',
        ready: hasDraftPipeline || hasPublished,
      },
      {
        label: 'Taxonomy',
        detail: hasTaxonomy ? `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}, ${tags.length} tag${tags.length === 1 ? '' : 's'}.` : 'Add categories or tags to support lists and filters.',
        ready: hasTaxonomy,
      },
      {
        label: 'Authors',
        detail: hasAuthors ? `${authors.length || 'Existing'} author profile${authors.length === 1 ? '' : 's'} available.` : 'Connect authors before publishing editorial content.',
        ready: hasAuthors,
      },
      {
        label: 'Bulk controls',
        detail: hasBulkSelection ? `${selectedPostIds.size} selected for bulk action.` : 'Select rows to publish, archive, or delete in batches.',
        ready: hasPosts,
      },
      {
        label: 'Preview paths',
        detail: hasPosts ? `Preview and public URLs use ${siteSlug}.` : 'Preview routes appear after the first post exists.',
        ready: hasPosts,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Draft', detail: 'Create posts, assign title, slug, author, taxonomy, excerpt, and canvas design.' },
        { label: 'Review', detail: 'Preview the article, verify readiness, SEO, media references, and public route.' },
        { label: 'Publish', detail: 'Publish one post or bulk publish selected editorial work for the active site.' },
        { label: 'Maintain', detail: 'Archive stale posts, delete only when permanent removal from API delivery is intended.' },
      ],
    };
  }, [
    activeSite,
    activeSiteId,
    authors.length,
    categories.length,
    hasPosts,
    postMetrics.draft,
    postMetrics.published,
    postMetrics.scheduled,
    postMetrics.total,
    selectedPostIds.size,
    siteScopedPosts,
    siteSlug,
    tags.length,
  ]);
  const blogHandoff = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: siteSlug,
    },
    endpoints: {
      publicPosts: publicBlogUrl,
      publicPostBySlug: publicPostBySlugUrl,
      publicRender: publicPostRenderUrl,
      publicResolve: publicPostResolveUrl,
      adminPosts: adminBlogUrl,
      adminPostDetail: adminBlogPostUrl,
      adminPostReadiness: adminBlogReadinessUrl,
      adminPostPreview: adminBlogPreviewUrl,
    },
    controlRoutes: {
      blogIndexPageTemplate: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=blog-index`,
      media: `/media?siteId=${encodeURIComponent(activeSiteId)}`,
      comments: `/comments?siteId=${encodeURIComponent(activeSiteId)}`,
      users: `/users?siteId=${encodeURIComponent(activeSiteId)}`,
      settings: '/settings',
    },
    export: {
      format: 'csv',
      columns: BLOG_EXPORT_COLUMNS,
      filteredRows: data.length,
    },
    frontendSystems: BLOG_FRONTEND_SYSTEMS,
    readiness: {
      score: editorialReadiness.score,
      checks: editorialReadiness.checks,
    },
    metrics: postMetrics,
    filters: {
      search: searchQuery,
      status: statusFilter,
      categoryId: selectedCategoryId || null,
      tagId: selectedTagId || null,
      authorId: selectedAuthorId || null,
      selected: selectedPostIds.size,
      visible: data.length,
      currentPage,
      totalPages,
      totalItems,
    },
    taxonomy: {
      categories: categories.map((category) => ({ id: category.id, name: category.name, slug: category.slug })),
      tags: tags.map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug })),
      authors: authors.map((author) => ({ id: author.id, name: author.name, postCount: author.postCount })),
    },
    posts: data.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      path: `/blog/${post.slug}`,
      status: post.status,
      scheduledAt: post.scheduledAt || null,
      author: post.author,
      categoryIds: post.categoryIds || [],
      tagIds: post.tagIds || [],
      publicUrl: post.status === 'published' ? publicPostUrl(post) : null,
    })),
    selectedPost: handoffPost
      ? {
          id: handoffPost.id,
          title: handoffPost.title,
          slug: handoffPost.slug,
          path: `/blog/${handoffPost.slug}`,
          status: handoffPost.status,
        }
      : null,
    workflows: editorialReadiness.workflow,
    guardrails: [
      'New post links carry the active siteId into the creation workspace.',
      'Preview before publishing because public route shape depends on site slug and post slug.',
      'Archive posts when hiding from public delivery without permanent removal.',
      'Use taxonomy and author data for frontend blog lists, filters, feeds, and detail pages.',
    ],
  }), [
    activeSite?.name,
    activeSiteId,
    adminBlogPostUrl,
    adminBlogPreviewUrl,
    adminBlogReadinessUrl,
    adminBlogUrl,
    authors,
    categories,
    currentPage,
    data,
    editorialReadiness.checks,
    editorialReadiness.score,
    editorialReadiness.workflow,
    handoffPost,
    postMetrics,
    publicBlogUrl,
    publicPostBySlugUrl,
    publicPostResolveUrl,
    publicPostRenderUrl,
    searchQuery,
    selectedAuthorId,
    selectedCategoryId,
    selectedPostIds.size,
    selectedTagId,
    siteSlug,
    statusFilter,
    tags,
    totalItems,
    totalPages,
  ]);
  const blogHandoffText = useMemo(() => JSON.stringify(blogHandoff, null, 2), [blogHandoff]);

  const copyBlogText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(null);
      setError(value);
    }
  };

  const downloadBlogHandoff = () => {
    const blob = new Blob([blogHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteSlug || activeSiteId}-backy-blog-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Blog handoff manifest downloaded.');
  };

  const downloadBlogCsv = () => {
    if (data.length === 0) {
      setError('No blog posts are available to export with the current controls.');
      setNotice(null);
      return;
    }

    const rows = data.map((post) => {
      const postPath = `/blog/${post.slug}`;
      const postBySlugUrl = `${publicBlogUrl}?slug=${encodeURIComponent(post.slug)}`;
      const renderUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(postPath)}`;
      const resolveUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(postPath)}`;
      const adminPostUrl = `${adminBlogUrl}/${encodeURIComponent(post.id)}`;
      const postCategoryNames = (post.categoryIds || [])
        .map((id) => categoryById.get(id)?.name)
        .filter(Boolean)
        .join('; ');
      const postTagNames = (post.tagIds || [])
        .map((id) => tagById.get(id)?.name)
        .filter(Boolean)
        .join('; ');

      return [
        post.id,
        activeSiteId,
        post.title,
        post.slug,
        postPath,
        post.status,
        post.scheduledAt || '',
        post.publishedAt || '',
        post.author,
        authorById.get(post.author)?.name || post.author,
        (post.categoryIds || []).join('; '),
        postCategoryNames,
        (post.tagIds || []).join('; '),
        postTagNames,
        post.excerpt || '',
        post.status === 'published' ? publicPostUrl(post) : '',
        postBySlugUrl,
        renderUrl,
        resolveUrl,
        adminPostUrl,
        `${adminPostUrl}/readiness`,
        `${adminPostUrl}/preview`,
        BLOG_FRONTEND_SYSTEMS.map((system) => `${system.key}:${system.title}`).join('; '),
      ];
    });
    const csv = [BLOG_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteSlug || activeSiteId}-backy-blog-posts.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice('Blog CSV exported.');
  };

  return (
    <PageShell
      title="Blog Posts"
      description="Manage your blog articles and news."
      action={
        <Link
          to="/blog/new"
          search={createPostSearch}
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

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading blog posts from backend...
        </div>
      )}

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="blog-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Editorial command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                editorialReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {editorialReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control the full blog surface for the active site: drafts, taxonomy, authors, previews, bulk publishing, archive state, and frontend article delivery.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyBlogText(blogHandoffText, 'Blog handoff manifest')}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Copy className="size-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadBlogHandoff}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Download className="size-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={downloadBlogCsv}
              disabled={data.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              Export CSV
            </button>
            <Link
              to="/blog/new"
              search={createPostSearch}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              data-testid="blog-command-create"
            >
              <Plus className="h-4 w-4" />
              New post
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Editorial readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">Checks whether this site can draft, organize, preview, publish, and maintain articles.</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', editorialReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${editorialReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {editorialReadiness.checks.map((check) => (
                <BlogReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Editorial workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {editorialReadiness.workflow.map((step, index) => (
                <BlogWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Blog control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to post status, bulk actions, filters, and the editorial table.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {BLOG_CONTROL_AREAS.map((area) => (
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
                <FileText className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Connected editorial workflows</h3>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Blog publishing works best when the public index page, media library, comments, author identity, and runtime settings are wired together.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {BLOG_WORKFLOW_SURFACES.length} surfaces
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {BLOG_WORKFLOW_SURFACES.map((surface) => (
              surface.route === '/pages/new' ? (
                <Link
                  key={surface.key}
                  to="/pages/new"
                  search={{ siteId: activeSiteId, template: surface.template }}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
                </Link>
              ) : (
                <Link
                  key={surface.key}
                  to={surface.route}
                  search={getBlogSurfaceSearch(surface)}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
                </Link>
              )
            ))}
          </div>
        </div>
      </section>

      <div id="blog-overview" className="mb-6 grid gap-3 scroll-mt-24 lg:grid-cols-[minmax(0,1fr)_auto]">
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
              const nextSiteId = event.target.value;
              setSelectedSiteId(nextSiteId);
              setStatusFilter('all');
              setSelectedCategoryId('');
              setSelectedTagId('');
              setSelectedAuthorId('');
              setSelectedPostIds(new Set());
              navigate({ to: '/blog', search: { siteId: nextSiteId }, replace: true });
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

      <section className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Blog API contract</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Public post list/detail delivery plus private admin endpoints for drafts, previews, readiness, publish, archive, and delete flows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyBlogText(publicBlogUrl, 'Blog posts API URL')}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              Copy API
            </button>
            <button
              type="button"
              onClick={() => void copyBlogText(blogHandoffText, 'Blog handoff manifest')}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadBlogCsv}
              disabled={data.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <BlogApiSnippet label="Public posts" value={publicBlogUrl} />
          <BlogApiSnippet label="Post by slug" value={publicPostBySlugUrl} />
          <BlogApiSnippet label="Render post" value={publicPostRenderUrl} />
          <BlogApiSnippet label="Resolve post" value={publicPostResolveUrl} />
          <BlogApiSnippet label="Admin posts" value={adminBlogUrl} />
          <BlogApiSnippet label="Preview" value={adminBlogPreviewUrl} />
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Blog frontend control contract</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Public frontends need these editorial systems to render blog lists, article pages, taxonomy views, bylines, and preview states from Backy.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {BLOG_FRONTEND_SYSTEMS.length} systems
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {BLOG_FRONTEND_SYSTEMS.map((system) => (
              <div key={system.key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{system.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {system.key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {hasPosts && (
        <div id="blog-bulk" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
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

      <div id="blog-filters" className="flex flex-wrap items-center gap-3 mb-6 scroll-mt-24">
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

      <div id="blog-posts" className="scroll-mt-24">
        <DataGrid
          columns={columns}
          data={data}
          sortConfig={sortConfig}
          onSort={handleSort}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={10}
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
                  <Link
                    to="/blog/new"
                    search={createPostSearch}
                    data-testid="blog-empty-create"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Plus className="w-4 h-4" />
                    Create Post
                  </Link>
                </div>
              }
            />
          }
        />
      </div>

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

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

function BlogApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

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

function BlogReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        {ready ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function BlogWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
