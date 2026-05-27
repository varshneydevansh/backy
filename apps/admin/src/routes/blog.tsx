/**
 * BACKY CMS - BLOG PAGE
 * 
 * Layout route that shows list at /blog, renders child routes otherwise.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Archive, CheckCircle2, Copy, Download, ExternalLink, Eye, Filter, Plus, FileText, Edit, Trash2, Save, Tag, X, MessageSquare, History, MoreHorizontal, RefreshCw } from 'lucide-react';
import {
  AdminContentApiError,
  archiveBlogPost,
  createBlogCategory,
  createBlogTag,
  createBlogPostPreview,
  deleteBlogCategory,
  deleteBlogPost,
  deleteBlogTag,
  getAdminApiBase,
  getBlogPostReadiness,
  getBlogPostRevisionSummary,
  getUserPermissions,
  listBlogAuthors,
  listBlogCategories,
  listBlogPosts,
  listBlogTags,
  listAllComments,
  publishBlogPost,
  updateBlogCategory,
  updateBlogPost,
  updateBlogTag,
  type AdminComment,
  type AdminUserPermissionMatrix,
  type BlogAuthor,
  type BlogCategory,
  type BlogPostReadiness,
  type BlogTag,
  type ContentRevisionSummary,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { useAuthStore, type User } from '@/stores/authStore';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { useDataTable, type Column } from '@/hooks/useDataTable';
import { PageShell } from '@/components/layout/PageShell';
import { DataGrid } from '@/components/ui/DataGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSiteSearchParam, getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
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
    detail: 'Select visible or filtered posts, publish, archive, delete, and clear selections.',
    href: '#blog-bulk',
  },
  {
    title: 'Filters',
    detail: 'Search by title and filter by status, category, tag, or author.',
    href: '#blog-filters',
  },
  {
    title: 'Taxonomy manager',
    detail: 'Create, edit, color, describe, and delete categories and tags.',
    href: '#blog-taxonomy',
  },
  {
    title: 'Post table',
    detail: 'Edit, preview, open published posts, and manage taxonomy columns.',
    href: '#blog-posts',
  },
] as const;

type BlogPermissionKey =
  | 'pages.view'
  | 'pages.edit'
  | 'pages.publish'
  | 'pages.delete'
  | 'comments.view'
  | 'activity.export';

const BLOG_PERMISSION_ROLE_DEFAULTS: Record<BlogPermissionKey, Array<User['role']>> = {
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.publish': ['owner', 'admin', 'editor'],
  'pages.delete': ['owner', 'admin'],
  'comments.view': ['owner', 'admin', 'editor', 'viewer'],
  'activity.export': ['owner', 'admin'],
};

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
    key: 'search',
    title: 'Search feeds',
    detail: 'Query-based public feeds for custom search pages and frontend post discovery.',
  },
  {
    key: 'archives',
    title: 'Archive feeds',
    detail: 'Year/month public feeds for archive pages, editorial timelines, and date navigation.',
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
  'scheduled_state',
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
  'revision_count',
  'latest_revision_note',
  'latest_revision_at',
  'latest_revision_status',
  'frontend_systems',
] as const;

const getBlogPostReadinessBlockMessage = (readiness: BlogPostReadiness): string | null => {
  const blockingCheck = readiness.checks.find((check) => check.status === 'fail' && check.severity === 'error');

  if (readiness.statusLabel === 'blocked' || blockingCheck) {
    return blockingCheck?.message || 'Resolve post readiness errors before publishing.';
  }

  return null;
};

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
  const currentAdmin = useAuthStore((state) => state.user);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [commentSummaries, setCommentSummaries] = useState<Record<string, BlogPostCommentSummary>>({});
  const [revisionSummaryMap, setRevisionSummaryMap] = useState<Record<string, ContentRevisionSummary>>({});
  const [isRevisionSummaryLoading, setIsRevisionSummaryLoading] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<TaxonomyDraft>(() => emptyTaxonomyDraft('#2563eb'));
  const [tagDraft, setTagDraft] = useState<TaxonomyDraft>(() => emptyTaxonomyDraft());
  const [categoryDraftSubmitted, setCategoryDraftSubmitted] = useState(false);
  const [tagDraftSubmitted, setTagDraftSubmitted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [editingTagId, setEditingTagId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState(() => getSiteSelectionFromSearch(sites));
  const [statusFilter, setStatusFilter] = useState<'all' | BlogPost['status']>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedAuthorId, setSelectedAuthorId] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<'publish' | 'archive' | 'delete' | ''>('');
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [mutatingPostId, setMutatingPostId] = useState<string | null>(null);
  const [previewingPostId, setPreviewingPostId] = useState<string | null>(null);
  const [mutatingTaxonomyKey, setMutatingTaxonomyKey] = useState('');
  const [updatingSeoPostId, setUpdatingSeoPostId] = useState('');
  const [pendingDeletePost, setPendingDeletePost] = useState<BlogPost | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingTaxonomyDelete, setPendingTaxonomyDelete] = useState<TaxonomyDeleteTarget | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const canViewBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canEditBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canPublishBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canDeleteBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canViewComments = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.view', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canExportBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', BLOG_PERMISSION_ROLE_DEFAULTS);
  const viewBlogPermissionTitle = canViewBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.view', BLOG_PERMISSION_ROLE_DEFAULTS);
  const editBlogPermissionTitle = canEditBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', BLOG_PERMISSION_ROLE_DEFAULTS);
  const publishBlogPermissionTitle = canPublishBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.publish', BLOG_PERMISSION_ROLE_DEFAULTS);
  const deleteBlogPermissionTitle = canDeleteBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.delete', BLOG_PERMISSION_ROLE_DEFAULTS);
  const exportBlogPermissionTitle = canExportBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'activity.export', BLOG_PERMISSION_ROLE_DEFAULTS);
  const viewBlogDeniedMessage = `Your account needs pages.view to load blog posts. ${viewBlogPermissionTitle}`;
  const editBlogDeniedMessage = `Your account needs pages.edit to change blog posts or taxonomy. ${editBlogPermissionTitle}`;
  const publishBlogDeniedMessage = `Your account needs pages.publish to preview or publish blog posts. ${publishBlogPermissionTitle}`;
  const deleteBlogDeniedMessage = `Your account needs pages.delete to delete blog posts or taxonomy. ${deleteBlogPermissionTitle}`;
  const exportBlogDeniedMessage = `Your account needs activity.export to export blog data. ${exportBlogPermissionTitle}`;
  const canRunBulkAction = bulkAction === 'publish'
    ? canPublishBlog
    : bulkAction === 'archive'
      ? canEditBlog
      : bulkAction === 'delete'
        ? canDeleteBlog
        : false;
  const canSelectBlogRows = canPublishBlog || canEditBlog || canDeleteBlog;
  const bulkSelectionPermissionTitle = canSelectBlogRows
    ? undefined
    : 'Your account needs pages.edit, pages.publish, or pages.delete to select blog posts for bulk actions.';
  const isPostMutationBusy = mutatingPostId !== null;
  const isPostPreviewBusy = previewingPostId !== null;
  const isTaxonomyBusy = Boolean(mutatingTaxonomyKey);
  const isSeoBusy = Boolean(updatingSeoPostId);
  const isBlogMutationBusy = isBulkBusy || isPostMutationBusy || isTaxonomyBusy || isSeoBusy;
  const isBlogPreviewBusy = isPostPreviewBusy;
  const isBlogWorkflowBusy = isBlogMutationBusy;
  const isBlogBulkActionBusy = isBlogMutationBusy || isBlogPreviewBusy;
  const taxonomyEditDisabledReason = isBlogWorkflowBusy
    ? 'Taxonomy actions are temporarily unavailable while Backy updates blog content.'
    : !canEditBlog
      ? editBlogPermissionTitle || 'Your account needs pages.edit to change blog taxonomy.'
      : '';
  const taxonomyDeleteDisabledReason = isBlogWorkflowBusy
    ? 'Taxonomy actions are temporarily unavailable while Backy updates blog content.'
    : !canDeleteBlog
      ? deleteBlogPermissionTitle || 'Your account needs pages.delete to remove blog taxonomy.'
      : '';
  const getTaxonomyActionStatus = (kind: 'category' | 'tag', name: string) => [
    `Edit ${kind} ${name} ${taxonomyEditDisabledReason ? `unavailable: ${taxonomyEditDisabledReason}` : 'available'}.`,
    `Delete ${kind} ${name} ${taxonomyDeleteDisabledReason ? `unavailable: ${taxonomyDeleteDisabledReason}` : 'available'}.`,
  ].join(' ');
  const createPostLinkDisabled = !canEditBlog;
  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = useMemo(
    () => activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo',
    [activeSite, selectedSiteId],
  );
  const createPostActionStatusId = 'blog-create-action-status';
  const createPostActionDisabledReason = createPostLinkDisabled
    ? editBlogPermissionTitle || 'Your account needs pages.edit to create blog posts.'
    : '';
  const createPostActionStatus = createPostActionDisabledReason
    ? `New post unavailable: ${createPostActionDisabledReason}`
    : `New post available for ${activeSiteId}.`;
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
  const handoffArchive = getPostArchiveParts(handoffPost);
  const publicBlogUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/blog`;
  const publicPostBySlugUrl = `${publicBlogUrl}?slug=${handoffPostSlug}`;
  const publicBlogSearchUrl = `${publicBlogUrl}?q=${encodeURIComponent(handoffPost?.title || '{query}')}`;
  const publicBlogArchiveUrl = `${publicBlogUrl}?year=${handoffArchive.year}&month=${handoffArchive.month}`;
  const publicPostRenderUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(handoffPost ? `/blog/${handoffPost.slug}` : '/blog/{postSlug}')}`;
  const publicPostResolveUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(handoffPost ? `/blog/${handoffPost.slug}` : '/blog/{postSlug}')}`;
  const adminBlogUrl = `${adminBaseUrl}/sites/${encodeURIComponent(activeSiteId)}/blog`;
  const adminBlogPostUrl = `${adminBlogUrl}/${handoffPostSegment}`;
  const adminBlogReadinessUrl = `${adminBlogPostUrl}/readiness`;
  const adminBlogPreviewUrl = `${adminBlogPostUrl}/preview`;

  const loadBlogPermissions = useCallback(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setPermissionError('Sign in with an admin account to load blog permissions.');
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
      .catch((error) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(error instanceof Error ? error.message : 'Unable to load blog permissions.');
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

  useEffect(() => loadBlogPermissions(), [loadBlogPermissions]);

  const refreshPosts = useMemo(
    () => async (siteId: string) => {
      if (!canViewBlog) {
        setIsLoading(false);
        setIsRevisionSummaryLoading(false);
        setRevisionSummaryMap({});
        setError(viewBlogDeniedMessage);
        return;
      }

      setIsLoading(true);
      setIsRevisionSummaryLoading(true);
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
        setIsLoading(false);

        try {
          const [commentResult, revisionSummaries] = await Promise.all([
            canViewComments
              ? loadBlogCommentsWithTimeout(siteId)
              : Promise.resolve({ comments: [] }),
            loadBlogRevisionSummaries(siteId, backendPosts),
          ]);
          setCommentSummaries(buildPostCommentSummaries(commentResult.comments));
          setRevisionSummaryMap(revisionSummaries);
        } catch {
          setCommentSummaries({});
          setRevisionSummaryMap({});
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load posts');
      } finally {
        setIsLoading(false);
        setIsRevisionSummaryLoading(false);
      }
    },
    [canViewBlog, canViewComments, setPosts, viewBlogDeniedMessage],
  );

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    let cancelled = false;

    const loadPosts = async () => {
      if (!canViewBlog) {
        setIsLoading(false);
        setIsRevisionSummaryLoading(false);
        setRevisionSummaryMap({});
        setError(viewBlogDeniedMessage);
        return;
      }

      setIsLoading(true);
      setIsRevisionSummaryLoading(true);
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
          setIsLoading(false);
        }

        try {
          const [commentResult, revisionSummaries] = await Promise.all([
            canViewComments
              ? loadBlogCommentsWithTimeout(activeSiteId)
              : Promise.resolve({ comments: [] }),
            loadBlogRevisionSummaries(activeSiteId, backendPosts),
          ]);
          if (!cancelled) {
            setCommentSummaries(buildPostCommentSummaries(commentResult.comments));
            setRevisionSummaryMap(revisionSummaries);
          }
        } catch {
          if (!cancelled) {
            setCommentSummaries({});
            setRevisionSummaryMap({});
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load posts');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRevisionSummaryLoading(false);
        }
      }
    };

    void loadPosts();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, canViewBlog, canViewComments, setPosts, viewBlogDeniedMessage]);

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
  const selectedCategory = editingCategoryId ? categoryById.get(editingCategoryId) : null;
  const selectedTag = editingTagId ? tagById.get(editingTagId) : null;

  const patchCategoryDraft = (patch: Partial<TaxonomyDraft>) => {
    setCategoryDraft((current) => ({
      ...current,
      ...patch,
      slug: patch.name && (!current.slug || current.slug === slugifyTaxonomyName(current.name)) ? slugifyTaxonomyName(patch.name) : patch.slug ?? current.slug,
    }));
  };

  const patchTagDraft = (patch: Partial<TaxonomyDraft>) => {
    setTagDraft((current) => ({
      ...current,
      ...patch,
      slug: patch.name && (!current.slug || current.slug === slugifyTaxonomyName(current.name)) ? slugifyTaxonomyName(patch.name) : patch.slug ?? current.slug,
    }));
  };

  const startEditCategory = (category: BlogCategory) => {
    if (isBlogWorkflowBusy) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
      return;
    }

    setEditingCategoryId(category.id);
    setCategoryDraftSubmitted(false);
    setCategoryDraft({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      color: category.color || '#2563eb',
    });
  };

  const startEditTag = (tag: BlogTag) => {
    if (isBlogWorkflowBusy) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
      return;
    }

    setEditingTagId(tag.id);
    setTagDraftSubmitted(false);
    setTagDraft({
      name: tag.name,
      slug: tag.slug,
      description: tag.description || '',
      color: '',
    });
  };

  const resetCategoryDraft = () => {
    setEditingCategoryId('');
    setCategoryDraftSubmitted(false);
    setCategoryDraft(emptyTaxonomyDraft('#2563eb'));
  };

  const resetTagDraft = () => {
    setEditingTagId('');
    setTagDraftSubmitted(false);
    setTagDraft(emptyTaxonomyDraft());
  };

  const saveCategoryDraft = async () => {
    if (isBlogWorkflowBusy) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
      setNotice(null);
      return;
    }
    setCategoryDraftSubmitted(true);
    if (!categoryDraft.name.trim()) {
      setError('Enter a category name before saving.');
      setNotice(null);
      return;
    }

    const payload = {
      name: categoryDraft.name.trim(),
      slug: slugifyTaxonomyName(categoryDraft.slug || categoryDraft.name),
      description: categoryDraft.description.trim() || null,
      color: categoryDraft.color.trim() || null,
    };
    const mutationKey = editingCategoryId ? `category:${editingCategoryId}` : 'category:new';
    setMutatingTaxonomyKey(mutationKey);
    setError(null);
    setNotice(null);

    try {
      if (editingCategoryId) {
        const updated = await updateBlogCategory(activeSiteId, editingCategoryId, payload);
        setCategories((current) => current.map((category) => (category.id === updated.id ? updated : category)));
        setNotice(`${updated.name} category updated.`);
      } else {
        const created = await createBlogCategory(activeSiteId, payload);
        setCategories((current) => [created, ...current.filter((category) => category.id !== created.id)]);
        setNotice(`${created.name} category created.`);
      }
      resetCategoryDraft();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save blog category');
    } finally {
      setMutatingTaxonomyKey('');
    }
  };

  const saveTagDraft = async () => {
    if (isBlogWorkflowBusy) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
      setNotice(null);
      return;
    }
    setTagDraftSubmitted(true);
    if (!tagDraft.name.trim()) {
      setError('Enter a tag name before saving.');
      setNotice(null);
      return;
    }

    const payload = {
      name: tagDraft.name.trim(),
      slug: slugifyTaxonomyName(tagDraft.slug || tagDraft.name),
      description: tagDraft.description.trim() || null,
    };
    const mutationKey = editingTagId ? `tag:${editingTagId}` : 'tag:new';
    setMutatingTaxonomyKey(mutationKey);
    setError(null);
    setNotice(null);

    try {
      if (editingTagId) {
        const updated = await updateBlogTag(activeSiteId, editingTagId, payload);
        setTags((current) => current.map((tag) => (tag.id === updated.id ? updated : tag)));
        setNotice(`${updated.name} tag updated.`);
      } else {
        const created = await createBlogTag(activeSiteId, payload);
        setTags((current) => [created, ...current.filter((tag) => tag.id !== created.id)]);
        setNotice(`${created.name} tag created.`);
      }
      resetTagDraft();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save blog tag');
    } finally {
      setMutatingTaxonomyKey('');
    }
  };

  const deleteTaxonomyTarget = async () => {
    if (!pendingTaxonomyDelete || isBlogWorkflowBusy) return;
    if (!canDeleteBlog) {
      setError(deleteBlogDeniedMessage);
      setNotice(null);
      return;
    }

    const target = pendingTaxonomyDelete;
    setMutatingTaxonomyKey(`${target.type}:${target.id}:delete`);
    setError(null);
    setNotice(null);

    try {
      if (target.type === 'category') {
        await deleteBlogCategory(activeSiteId, target.id);
        setCategories((current) => current.filter((category) => category.id !== target.id));
        if (selectedCategoryId === target.id) setSelectedCategoryId('');
        if (editingCategoryId === target.id) resetCategoryDraft();
      } else {
        await deleteBlogTag(activeSiteId, target.id);
        setTags((current) => current.filter((tag) => tag.id !== target.id));
        if (selectedTagId === target.id) setSelectedTagId('');
        if (editingTagId === target.id) resetTagDraft();
      }
      setPendingTaxonomyDelete(null);
      setNotice(`${target.name} ${target.type} deleted.`);
      await refreshPosts(activeSiteId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `Unable to delete blog ${target.type}`);
    } finally {
      setMutatingTaxonomyKey('');
    }
  };

  useEffect(() => {
    if (!pendingTaxonomyDelete) return;

    const handleTaxonomyDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTaxonomyBusy) return;
      event.preventDefault();
      setPendingTaxonomyDelete(null);
    };

    document.addEventListener('keydown', handleTaxonomyDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleTaxonomyDeleteDialogKeyDown, true);
  }, [isTaxonomyBusy, pendingTaxonomyDelete]);

  const togglePostSeoFlag = async (post: BlogPost, key: 'noIndex' | 'noFollow') => {
    if (isBlogWorkflowBusy) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
      setNotice(null);
      return;
    }

    const currentPost = posts.find((candidate) => candidate.id === post.id) || post;
    setUpdatingSeoPostId(post.id);
    setError(null);
    setNotice(null);

    try {
      const nextMeta = {
        ...(currentPost.meta || {}),
        [key]: currentPost.meta?.[key] !== true,
      };
      const updated = await updateBlogPost(activeSiteId, currentPost.id, {
        meta: nextMeta,
        revisionNote: `Updated ${key} from blog list row.`,
        expectedUpdatedAt: currentPost.updatedAt,
      });
      updatePost(currentPost.id, updated);
      void refreshBlogRevisionSummary(activeSiteId, currentPost.id, setRevisionSummaryMap);
      setNotice(`${updated.title} SEO ${key === 'noIndex' ? 'indexing' : 'link following'} updated.`);
    } catch (saveError) {
      if (saveError instanceof AdminContentApiError && saveError.code === 'BLOG_VERSION_CONFLICT') {
        setError('This post changed before the SEO control saved. Reloaded the latest blog list; try the toggle again.');
        await refreshPosts(activeSiteId);
      } else {
        setError(saveError instanceof Error ? saveError.message : 'Unable to update post SEO controls');
      }
    } finally {
      setUpdatingSeoPostId('');
    }
  };

  const setPostStatusFilter = (nextStatus: 'all' | BlogPost['status']) => {
    if (isBlogWorkflowBusy) return;

    setStatusFilter(nextStatus);
    setCurrentPage(1);
    setSelectedPostIds(new Set());
  };

  const setPostSelection = (targetPosts: BlogPost[], selected: boolean) => {
    if (isBlogWorkflowBusy) return;

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
    if (isBlogWorkflowBusy) return;

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
    if (isBlogWorkflowBusy || isBlogPreviewBusy) return;
    if (!canPublishBlog) {
      setError(publishBlogDeniedMessage);
      setNotice(null);
      return;
    }

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
    if (isBlogWorkflowBusy) return;
    if (!canDeleteBlog) {
      setError(deleteBlogDeniedMessage);
      setNotice(null);
      return;
    }

    setMutatingPostId(post.id);
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
      setNotice(`${post.title} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete post');
    } finally {
      setMutatingPostId(null);
    }
  };

  useEffect(() => {
    if (!pendingDeletePost) return;

    const handlePostDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || mutatingPostId === pendingDeletePost.id) return;
      event.preventDefault();
      setPendingDeletePost(null);
    };

    document.addEventListener('keydown', handlePostDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handlePostDeleteDialogKeyDown, true);
  }, [mutatingPostId, pendingDeletePost]);

  const handleBulkAction = async () => {
    if (isBlogBulkActionBusy) return;

    if (!bulkAction || selectedPosts.length === 0) {
      return;
    }

    if (!canRunBulkAction) {
      const deniedMessage = bulkAction === 'publish'
        ? publishBlogDeniedMessage
        : bulkAction === 'delete'
          ? deleteBlogDeniedMessage
          : editBlogDeniedMessage;
      setError(deniedMessage);
      setNotice(null);
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
        const readinessResults = await Promise.all(selectedPosts.map(async (post) => ({
          post,
          readiness: await getBlogPostReadiness(activeSiteId, post.id),
        })));
        const blockedPost = readinessResults.find(({ readiness }) => getBlogPostReadinessBlockMessage(readiness));

        if (blockedPost) {
          const blockMessage = getBlogPostReadinessBlockMessage(blockedPost.readiness);
          const title = blockedPost.readiness.title || blockedPost.post.title;
          setError(`Bulk publish blocked: "${title}" is not ready. ${blockMessage}`);
          return;
        }

        const updatedPosts = await Promise.all(selectedPosts.map((post) => publishBlogPost(activeSiteId, post.id, {
          expectedUpdatedAt: post.updatedAt,
        })));
        updatedPosts.forEach((post) => updatePost(post.id, post));
        setNotice(`${updatedPosts.length} post${updatedPosts.length === 1 ? '' : 's'} published.`);
      }

      if (bulkAction === 'archive') {
        const updatedPosts = await Promise.all(selectedPosts.map((post) => archiveBlogPost(activeSiteId, post.id, {
          expectedUpdatedAt: post.updatedAt,
        })));
        updatedPosts.forEach((post) => updatePost(post.id, post));
        setNotice(`${updatedPosts.length} post${updatedPosts.length === 1 ? '' : 's'} archived.`);
      }

      if (bulkAction === 'delete') {
        await Promise.all(selectedPosts.map((post) => deleteBlogPost(activeSiteId, post.id)));
        const deletedCount = selectedPosts.length;
        selectedPosts.forEach((post) => deletePost(post.id));
        setPendingBulkDelete(false);
        setNotice(`${deletedCount} post${deletedCount === 1 ? '' : 's'} deleted.`);
      }

      setSelectedPostIds(new Set());
      setBulkAction('');
      await refreshPosts(activeSiteId);
    } catch (bulkError) {
      if (bulkError instanceof AdminContentApiError && bulkError.code === 'BLOG_VERSION_CONFLICT') {
        setError('One selected post changed before the status action completed. Reloaded the latest blog list; review the selection and try again.');
        setSelectedPostIds(new Set());
        await refreshPosts(activeSiteId);
      } else {
        setError(bulkError instanceof Error ? bulkError.message : 'Unable to apply bulk action');
      }
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
          disabled={isBlogWorkflowBusy || !canSelectBlogRows}
          onChange={() => togglePostSelection(post.id)}
          className="size-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
      render: (post) => {
        const schedule = getPostScheduleSummary(post);

        return (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            {post.scheduledAt && (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                {formatDate(post.scheduledAt)}
              </span>
            )}
            {post.status === 'scheduled' && (
              <span
                data-testid={`blog-post-schedule-state-${post.id}`}
                title={schedule.detail}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', getPostScheduleToneClass(schedule.state))}
              >
                {schedule.label}
              </span>
            )}
          </div>
        );
      }
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
      key: 'meta',
      label: 'SEO / Comments',
      render: (post) => {
        const seo = getPostSeoSummary(post);
        const summary = commentSummaries[post.id] || emptyCommentSummary();
        const commentsHref = `/comments?siteId=${encodeURIComponent(activeSiteId)}&targetType=post&targetId=${encodeURIComponent(post.id)}`;
        const seoBusy = updatingSeoPostId === post.id;

        return (
          <div className="min-w-56 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void togglePostSeoFlag(post, 'noIndex')}
                disabled={isBlogWorkflowBusy || seoBusy || !canEditBlog}
                title={editBlogPermissionTitle}
                data-testid={`blog-post-seo-noindex-${post.id}`}
                className={cn(
                  'rounded-full border px-2 py-0.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                  seo.noIndex ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                )}
              >
                {seo.noIndex ? 'Noindex' : 'Index'}
              </button>
              <button
                type="button"
                onClick={() => void togglePostSeoFlag(post, 'noFollow')}
                disabled={isBlogWorkflowBusy || seoBusy || !canEditBlog}
                title={editBlogPermissionTitle}
                data-testid={`blog-post-seo-nofollow-${post.id}`}
                className={cn(
                  'rounded-full border px-2 py-0.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                  seo.noFollow ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                )}
              >
                {seo.noFollow ? 'Nofollow' : 'Follow'}
              </button>
            </div>
            <div className="leading-5 text-muted-foreground">
              <span className={seo.hasTitle ? 'text-foreground' : 'text-amber-700'}>
                {seo.hasTitle ? 'SEO title' : 'Missing SEO title'}
              </span>
              {' · '}
              <span className={seo.hasDescription ? 'text-foreground' : 'text-amber-700'}>
                {seo.hasDescription ? 'Description' : 'Missing description'}
              </span>
            </div>
            <a
              href={commentsHref}
              data-testid={`blog-post-comments-${post.id}`}
              aria-disabled={!canViewComments}
              title={canViewComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.view', BLOG_PERMISSION_ROLE_DEFAULTS)}
              onClick={(event) => {
                if (!canViewComments) {
                  event.preventDefault();
                  setError(`Your account needs comments.view to open post comments. ${adminPermissionReason(permissionMatrix, currentAdmin, 'comments.view', BLOG_PERMISSION_ROLE_DEFAULTS)}`);
                  setNotice(null);
                }
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground transition hover:bg-muted hover:text-foreground',
                !canViewComments && 'opacity-60',
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {summary.total} comments · {summary.pending} pending · {summary.flagged} flagged
            </a>
          </div>
        );
      }
    },
    {
      key: 'updatedAt',
      label: 'Revisions',
      render: (post) => (
        <BlogRevisionCell
          post={post}
          summary={revisionSummaryMap[post.id]}
          isLoading={isRevisionSummaryLoading}
          activeSiteId={activeSiteId}
        />
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
      render: (post) => {
        const postActionStatusId = `blog-post-actions-status-${post.id}`;
        const workflowReason = isBlogWorkflowBusy
          ? 'Blog actions are temporarily unavailable while Backy updates posts or taxonomy.'
          : null;
        const openDisabledReason = post.status === 'published' ? workflowReason : null;
        const previewDisabledReason = !canPublishBlog
          ? publishBlogPermissionTitle || 'Your account cannot preview blog posts.'
          : isBlogPreviewBusy || isBlogWorkflowBusy
            ? 'Blog preview is temporarily unavailable while Backy updates posts.'
            : null;
        const editDisabledReason = !canViewBlog
          ? viewBlogPermissionTitle || 'Your account cannot open blog posts.'
          : workflowReason;
        const deleteDisabledReason = !canDeleteBlog
          ? deleteBlogPermissionTitle || 'Your account cannot delete blog posts.'
          : workflowReason;
        const postActionStatus = [
          post.status === 'published'
            ? openDisabledReason
              ? `Open published post unavailable: ${openDisabledReason}`
              : 'Open published post available.'
            : null,
          previewDisabledReason ? `Preview unavailable: ${previewDisabledReason}` : 'Preview available.',
          editDisabledReason ? `Edit unavailable: ${editDisabledReason}` : 'Edit available.',
          deleteDisabledReason ? `Delete unavailable: ${deleteDisabledReason}` : 'Delete available.',
        ].filter(Boolean).join(' ');

        return (
          <div
            className="flex items-center justify-end gap-2"
            role="group"
            aria-label={`Actions for ${post.title}`}
            aria-describedby={postActionStatusId}
            data-testid={`blog-post-actions-${post.id}`}
            data-action-status={postActionStatus}
          >
            <span
              id={postActionStatusId}
              className="sr-only"
              data-testid={`blog-post-actions-status-${post.id}`}
            >
              {postActionStatus}
            </span>
            {post.status === 'published' && (
              <a
                href={publicPostUrl(post)}
                target="_blank"
                rel="noreferrer"
                title={openDisabledReason || 'Open published post'}
                aria-label={`Open published post ${post.title}`}
                aria-describedby={postActionStatusId}
                aria-disabled={Boolean(openDisabledReason)}
                data-action-state={openDisabledReason ? 'blocked' : 'ready'}
                data-disabled-reason={openDisabledReason || undefined}
                data-testid={`blog-post-open-${post.id}`}
                onClick={(event) => {
                  if (openDisabledReason) {
                    event.preventDefault();
                  }
                }}
                className={cn(
                  'p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors',
                  openDisabledReason && 'pointer-events-none opacity-50',
                )}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => {
                if (previewDisabledReason) return;
                void handlePreviewPost(post);
              }}
              disabled={Boolean(previewDisabledReason)}
              aria-disabled={Boolean(previewDisabledReason)}
              aria-describedby={postActionStatusId}
              aria-label={`Preview ${post.title}`}
              data-action-state={previewDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={previewDisabledReason || undefined}
              data-testid={`blog-post-preview-${post.id}`}
              title={previewDisabledReason || 'Preview post'}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (editDisabledReason) return;
                void navigate({ to: '/blog/$postId', params: { postId: post.id }, search: { siteId: activeSiteId, focus: 'canvas' } });
              }}
              disabled={Boolean(editDisabledReason)}
              aria-disabled={Boolean(editDisabledReason)}
              aria-describedby={postActionStatusId}
              aria-label={`Edit ${post.title}`}
              data-action-state={editDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={editDisabledReason || undefined}
              title={editDisabledReason || 'Edit post'}
              data-testid={`blog-post-edit-${post.id}`}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (deleteDisabledReason) return;
                setPendingDeletePost(post);
              }}
              disabled={Boolean(deleteDisabledReason)}
              aria-disabled={Boolean(deleteDisabledReason)}
              aria-describedby={postActionStatusId}
              aria-label={`Delete ${post.title}`}
              data-action-state={deleteDisabledReason ? 'blocked' : 'ready'}
              data-disabled-reason={deleteDisabledReason || undefined}
              title={deleteDisabledReason || 'Delete post'}
              data-testid={`blog-post-delete-${post.id}`}
              className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
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
    totalItems,
    filteredData: filteredPosts,
  } = useDataTable({
    data: visiblePosts,
    columns,
    pageSize: 10
  });
  const hasBlogFilters = searchQuery.trim().length > 0
    || statusFilter !== 'all'
    || Boolean(selectedCategoryId)
    || Boolean(selectedTagId)
    || Boolean(selectedAuthorId);
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
  const selectedFilteredPosts = filteredPosts.filter((post) => selectedPostIds.has(post.id));
  const visiblePostIdSet = useMemo(() => new Set(data.map((post) => post.id)), [data]);
  const hiddenSelectedCount = Math.max(0, selectedPosts.length - selectedCurrentRows.length);
  const visibleSelectedCount = selectedCurrentRows.length;
  const filteredSelectionMode = filteredPosts.length > data.length ? 'all-filtered' : 'visible-page';
  const allFilteredPostsSelected = filteredPosts.length > 0 && selectedFilteredPosts.length === filteredPosts.length;
  const bulkActionLabel = getBulkActionLabel(bulkAction, selectedPosts.length, pendingBulkDelete);
  const bulkBusyLabel = getBulkBusyLabel(bulkAction);
  const bulkSelectionStatusId = 'blog-bulk-selection-status';
  const bulkActionStatusId = 'blog-bulk-action-status';
  const bulkSelectionStatus = selectedPosts.length === 0
    ? `No blog posts selected. ${data.length} visible post${data.length === 1 ? '' : 's'} on this table page.`
    : `${selectedPosts.length} blog post${selectedPosts.length === 1 ? '' : 's'} selected. ${visibleSelectedCount} visible, ${hiddenSelectedCount} not visible, ${selectedFilteredPosts.length} of ${filteredPosts.length} filtered post${filteredPosts.length === 1 ? '' : 's'} selected.`;
  const bulkActionPermissionTitle = bulkAction === 'publish'
    ? publishBlogPermissionTitle
    : bulkAction === 'archive'
      ? editBlogPermissionTitle
      : bulkAction === 'delete'
        ? deleteBlogPermissionTitle
        : !canSelectBlogRows
          ? bulkSelectionPermissionTitle
          : undefined;
  const bulkActionReady = Boolean(
    bulkAction &&
    selectedPosts.length > 0 &&
    !isBlogBulkActionBusy &&
    canRunBulkAction,
  );
  const bulkActionStatus = selectedPosts.length === 0
    ? 'Select one or more blog posts to enable bulk actions.'
    : !bulkAction
      ? `Choose a bulk action for ${selectedPosts.length} selected blog post${selectedPosts.length === 1 ? '' : 's'}.`
      : isBlogBulkActionBusy
        ? 'Bulk blog actions are temporarily unavailable while Backy updates or previews posts.'
        : !canRunBulkAction
          ? bulkActionPermissionTitle || 'Your account cannot run this blog bulk action.'
          : `Ready to ${bulkActionLabel.toLowerCase()}.`;
  const blogCommandSecondaryActionStatusId = 'blog-command-secondary-action-status';
  const blogCommandBusyDisabledReason = isBlogWorkflowBusy
    ? 'Blog command actions are temporarily unavailable while Backy updates content.'
    : '';
  const blogCommandViewDisabledReason = !canViewBlog
    ? viewBlogPermissionTitle || 'Your account needs pages.view to use blog handoff actions.'
    : '';
  const blogCommandCopyDisabledReason = blogCommandBusyDisabledReason || blogCommandViewDisabledReason;
  const blogCommandDownloadDisabledReason = blogCommandBusyDisabledReason || blogCommandViewDisabledReason;
  const blogCommandExportDisabledReason = blogCommandBusyDisabledReason
    || (!canExportBlog ? exportBlogPermissionTitle || 'Your account needs activity.export to export blog data.' : '')
    || (data.length === 0 ? 'No visible blog posts are available to export.' : '');
  const blogCommandCopyActionStatus = blogCommandCopyDisabledReason
    ? `Copy handoff unavailable: ${blogCommandCopyDisabledReason}`
    : 'Copy handoff available.';
  const blogCommandDownloadActionStatus = blogCommandDownloadDisabledReason
    ? `Download JSON unavailable: ${blogCommandDownloadDisabledReason}`
    : 'Download JSON available.';
  const blogCommandExportActionStatus = blogCommandExportDisabledReason
    ? `Export CSV unavailable: ${blogCommandExportDisabledReason}`
    : `Export CSV available for ${data.length} visible blog post${data.length === 1 ? '' : 's'}.`;
  const blogCommandSecondaryActionStatus = [
    blogCommandCopyActionStatus,
    blogCommandDownloadActionStatus,
    blogCommandExportActionStatus,
  ].join(' ');
  const blogCommandSecondaryActionState = blogCommandCopyDisabledReason && blogCommandDownloadDisabledReason && blogCommandExportDisabledReason
    ? 'blocked'
    : 'ready';
  const hasPosts = siteScopedPosts.length > 0;
  const scheduleMetrics = useMemo(() => {
    const summaries = siteScopedPosts.map((post) => getPostScheduleSummary(post));

    return {
      future: summaries.filter((summary) => summary.state === 'future').length,
      due: summaries.filter((summary) => summary.state === 'due').length,
      missingDate: summaries.filter((summary) => summary.state === 'missing-date').length,
      invalidDate: summaries.filter((summary) => summary.state === 'invalid-date').length,
    };
  }, [siteScopedPosts]);
  const editorialReadiness = useMemo(() => {
    const hasSite = Boolean(activeSite || activeSiteId);
    const hasPublished = postMetrics.published > 0;
    const hasDraftPipeline = postMetrics.draft > 0 || postMetrics.scheduled > 0;
    const hasTaxonomy = categories.length > 0 || tags.length > 0 || siteScopedPosts.some((post) => (post.categoryIds?.length || 0) > 0 || (post.tagIds?.length || 0) > 0);
    const hasAuthors = authors.length > 0 || siteScopedPosts.some((post) => Boolean(post.author));
    const hasBulkSelection = selectedPostIds.size > 0;
    const scheduleIssueCount = scheduleMetrics.missingDate + scheduleMetrics.invalidDate;
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
        label: 'Schedule integrity',
        detail: scheduleIssueCount > 0
          ? `${scheduleIssueCount} scheduled post${scheduleIssueCount === 1 ? '' : 's'} need valid future publish dates.`
          : postMetrics.scheduled > 0
            ? `${scheduleMetrics.future} upcoming, ${scheduleMetrics.due} due now.`
            : 'No scheduled posts need attention.',
        ready: scheduleIssueCount === 0,
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
      readyCount,
      total: checks.length,
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
    scheduleMetrics.due,
    scheduleMetrics.future,
    scheduleMetrics.invalidDate,
    scheduleMetrics.missingDate,
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
      publicSearchFeed: publicBlogSearchUrl,
      publicArchiveFeed: publicBlogArchiveUrl,
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
    schedule: scheduleMetrics,
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
      revisions: {
        count: revisionSummaryMap[post.id]?.count ?? 0,
        latest: revisionSummaryMap[post.id]?.latest
          ? {
              note: revisionSummaryMap[post.id]?.latest?.note || null,
              createdAt: revisionSummaryMap[post.id]?.latest?.createdAt || null,
              status: revisionSummaryMap[post.id]?.latest?.snapshotStatus || null,
            }
          : null,
      },
      id: post.id,
      title: post.title,
      slug: post.slug,
      path: `/blog/${post.slug}`,
      status: post.status,
      scheduledAt: post.scheduledAt || null,
      schedule: getPostScheduleSummary(post),
      author: post.author,
      categoryIds: post.categoryIds || [],
      tagIds: post.tagIds || [],
      seo: getPostSeoSummary(post),
      comments: commentSummaries[post.id] || emptyCommentSummary(),
      publicUrl: post.status === 'published' ? publicPostUrl(post) : null,
    })),
    selectedPost: handoffPost
      ? {
          id: handoffPost.id,
          title: handoffPost.title,
          slug: handoffPost.slug,
          path: `/blog/${handoffPost.slug}`,
          status: handoffPost.status,
          schedule: getPostScheduleSummary(handoffPost),
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
    commentSummaries,
    currentPage,
    data,
    editorialReadiness.checks,
    editorialReadiness.score,
    editorialReadiness.workflow,
    handoffPost,
    postMetrics,
    publicBlogUrl,
    publicBlogArchiveUrl,
    publicBlogSearchUrl,
    publicPostBySlugUrl,
    publicPostResolveUrl,
    publicPostRenderUrl,
    revisionSummaryMap,
    scheduleMetrics,
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
    if (isBlogWorkflowBusy) return;
    if (!canViewBlog) {
      setError(viewBlogDeniedMessage);
      setNotice(null);
      return;
    }

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
    if (isBlogWorkflowBusy) return;
    if (!canViewBlog) {
      setError(viewBlogDeniedMessage);
      setNotice(null);
      return;
    }

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
    if (isBlogWorkflowBusy) return;
    if (!canExportBlog) {
      setError(exportBlogDeniedMessage);
      setNotice(null);
      return;
    }

    if (data.length === 0) {
      setError('No blog posts are available to export with the current controls.');
      setNotice(null);
      return;
    }

    const rows = data.map((post) => {
      const postPath = `/blog/${post.slug}`;
      const schedule = getPostScheduleSummary(post);
      const postBySlugUrl = `${publicBlogUrl}?slug=${encodeURIComponent(post.slug)}`;
      const renderUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(postPath)}`;
      const resolveUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(postPath)}`;
      const adminPostUrl = `${adminBlogUrl}/${encodeURIComponent(post.id)}`;
      const revisionSummary = revisionSummaryMap[post.id];
      const latestRevision = revisionSummary?.latest || null;
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
        schedule.state,
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
        revisionSummary?.count ?? 0,
        latestRevision?.note || '',
        latestRevision?.createdAt || '',
        latestRevision?.snapshotStatus || '',
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

  const clearBlogFilters = () => {
    if (isBlogWorkflowBusy) return;

    setSearchQuery('');
    setStatusFilter('all');
    setSelectedCategoryId('');
    setSelectedTagId('');
    setSelectedAuthorId('');
    setCurrentPage(1);
    setSelectedPostIds(new Set());
  };

  return (
    <PageShell
      title="Blog Posts"
      description="Manage your blog articles and news."
      action={
        <Link
          to="/blog/new"
          search={createPostSearch}
          aria-disabled={createPostLinkDisabled}
          aria-describedby={createPostActionStatusId}
          title={createPostActionDisabledReason || undefined}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors',
            createPostLinkDisabled && 'pointer-events-none opacity-60',
          )}
          data-action-state={createPostActionDisabledReason ? 'blocked' : 'ready'}
          data-action-status={createPostActionStatus}
          data-disabled-reason={createPostActionDisabledReason || undefined}
          data-target-site-id={activeSiteId}
          data-testid="blog-header-create"
        >
          <Plus className="w-4 h-4" />
          New Post
        </Link>
      }
    >
      {error && (
        <div
          role="alert"
          data-testid="blog-error-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Blog workspace needs attention</p>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasBlogFilters && (
                <button
                  type="button"
                  onClick={clearBlogFilters}
                  disabled={isBlogWorkflowBusy}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => void refreshPosts(activeSiteId)}
                disabled={isBlogWorkflowBusy || !canViewBlog}
                title={!canViewBlog ? viewBlogPermissionTitle : undefined}
                aria-label="Retry loading blog posts"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry load
              </button>
            </div>
          </div>
        </div>
      )}

      {permissionError && (
        <div
          role="alert"
          data-testid="blog-permission-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Blog permissions could not be verified</p>
                <p className="mt-1 leading-6">{permissionError}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadBlogPermissions}
                disabled={isPermissionsLoading}
                aria-label="Retry loading blog permissions"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry permissions
              </button>
              <Link
                to="/users"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
              >
                Review users
              </Link>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {isLoading && data.length === 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin text-sky-700" />
          <span>Loading blog posts from backend.</span>
        </div>
      )}
      <span id={createPostActionStatusId} className="sr-only" data-testid="blog-create-action-status" aria-live="polite">
        {createPostActionStatus}
      </span>
      <span id={blogCommandSecondaryActionStatusId} className="sr-only" data-testid="blog-command-secondary-action-status" aria-live="polite">
        {blogCommandSecondaryActionStatus}
      </span>

      <section className="mb-5 rounded-lg border border-border bg-card shadow-sm" data-testid="blog-command-center">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-5">
          <div className="min-w-0">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            <Link
              to="/blog/new"
              search={createPostSearch}
              aria-disabled={createPostLinkDisabled}
              aria-describedby={createPostActionStatusId}
              title={createPostActionDisabledReason || undefined}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90',
                createPostLinkDisabled && 'pointer-events-none opacity-60',
              )}
              data-action-state={createPostActionDisabledReason ? 'blocked' : 'ready'}
              data-action-status={createPostActionStatus}
              data-disabled-reason={createPostActionDisabledReason || undefined}
              data-target-site-id={activeSiteId}
              data-testid="blog-command-create"
            >
              <Plus className="h-4 w-4" />
              New post
            </Link>
            <details
              className="group relative"
              data-testid="blog-command-secondary-actions"
              aria-describedby={blogCommandSecondaryActionStatusId}
              data-action-state={blogCommandSecondaryActionState}
              data-action-status={blogCommandSecondaryActionStatus}
            >
              <summary
                className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
                aria-label="Show blog export and handoff actions"
              >
                <MoreHorizontal className="size-4" />
                More actions
              </summary>
              <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-48">
                <button
                  type="button"
                  onClick={() => void copyBlogText(blogHandoffText, 'Blog handoff manifest')}
                  disabled={Boolean(blogCommandCopyDisabledReason)}
                  title={blogCommandCopyDisabledReason || 'Copy blog handoff manifest'}
                  aria-label="Copy blog handoff manifest"
                  aria-describedby={blogCommandSecondaryActionStatusId}
                  data-testid="blog-command-copy-handoff"
                  data-action-state={blogCommandCopyDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={blogCommandCopyActionStatus}
                  data-disabled-reason={blogCommandCopyDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Copy className="size-4" />
                  Copy handoff
                </button>
                <button
                  type="button"
                  onClick={downloadBlogHandoff}
                  disabled={Boolean(blogCommandDownloadDisabledReason)}
                  title={blogCommandDownloadDisabledReason || 'Download blog handoff JSON'}
                  aria-label="Download blog handoff JSON"
                  aria-describedby={blogCommandSecondaryActionStatusId}
                  data-testid="blog-command-download-handoff"
                  data-action-state={blogCommandDownloadDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={blogCommandDownloadActionStatus}
                  data-disabled-reason={blogCommandDownloadDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="size-4" />
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={downloadBlogCsv}
                  disabled={Boolean(blogCommandExportDisabledReason)}
                  title={blogCommandExportDisabledReason || 'Export visible blog posts CSV'}
                  aria-label="Export visible blog posts CSV"
                  aria-describedby={blogCommandSecondaryActionStatusId}
                  data-testid="blog-command-export-csv"
                  data-action-state={blogCommandExportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={blogCommandExportActionStatus}
                  data-disabled-reason={blogCommandExportDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="size-4" />
                  Export CSV
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border bg-background/55 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Posts', value: postMetrics.total, detail: `${postMetrics.draft} drafts` },
            { label: 'Published', value: postMetrics.published, detail: 'Article routes' },
            { label: 'Scheduled', value: postMetrics.scheduled, detail: scheduleMetrics.future > 0 ? `${scheduleMetrics.future} upcoming` : 'No future queue' },
            { label: 'Readiness', value: `${editorialReadiness.score}%`, detail: `${editorialReadiness.readyCount}/${editorialReadiness.total} checks` },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <span className="font-mono text-xl font-semibold text-foreground">{metric.value}</span>
                <span className="truncate text-xs text-muted-foreground">{metric.detail}</span>
              </div>
            </div>
          ))}
        </div>

        <details className="group border-t border-border" data-testid="blog-readiness-details">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
            <span>Editorial readiness and workflow</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
          </summary>
          <div className="grid gap-3 border-t border-border p-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:p-5">
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
        </details>

        <details
          className="group border-t border-border"
          data-testid="blog-advanced-workflows-details"
          data-disclosure="advanced-editorial-workflows"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-5 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Workflow map and connected surfaces
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {BLOG_CONTROL_AREAS.length + BLOG_WORKFLOW_SURFACES.length} links
            </span>
          </summary>
          <div className="grid gap-4 border-t border-border bg-background/55 p-4 lg:p-5">
            <div>
              <h3 className="text-sm font-semibold">Blog control map</h3>
              <p className="mt-1 text-sm text-muted-foreground">Jump to post status, bulk actions, filters, and the editorial table.</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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

            <details className="group overflow-hidden rounded-lg border border-border bg-background" data-testid="blog-connected-workflows-details">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  Connected editorial workflows
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {BLOG_WORKFLOW_SURFACES.length} surfaces
                </span>
              </summary>
              <div className="border-t border-border p-4">
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Blog publishing works best when the public index page, media library, comments, author identity, and runtime settings are wired together.
                </p>
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
            </details>
          </div>
        </details>
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
              disabled={isBlogWorkflowBusy}
              className={cn(
                'rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
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
            disabled={isBlogWorkflowBusy}
            onChange={(event) => {
              if (isBlogWorkflowBusy) return;

              const nextSiteId = event.target.value;
              setSelectedSiteId(nextSiteId);
              setStatusFilter('all');
              setSelectedCategoryId('');
              setSelectedTagId('');
              setSelectedAuthorId('');
              setSelectedPostIds(new Set());
              navigate({ to: '/blog', search: { siteId: nextSiteId }, replace: true });
            }}
            className="mt-2 w-full min-w-52 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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

      <details
        id="blog-api"
        className="group mb-6 overflow-hidden rounded-lg border border-border bg-card"
        data-testid="blog-api-contract"
        data-disclosure="blog-api-contract"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Blog API contract
          </span>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show handoff</span>
          <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide handoff</span>
        </summary>
        <div className="border-t border-border p-4">
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
              disabled={isBlogWorkflowBusy || !canViewBlog}
              title={viewBlogPermissionTitle}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Copy API
            </button>
            <button
              type="button"
              onClick={() => void copyBlogText(blogHandoffText, 'Blog handoff manifest')}
              disabled={isBlogWorkflowBusy || !canViewBlog}
              title={viewBlogPermissionTitle}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadBlogCsv}
              disabled={data.length === 0 || isBlogWorkflowBusy || !canExportBlog}
              title={exportBlogPermissionTitle}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background" data-testid="blog-api-details">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>API endpoints and frontend systems</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
          </summary>
          <div className="border-t border-border p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <BlogApiSnippet label="Public posts" value={publicBlogUrl} />
              <BlogApiSnippet label="Post by slug" value={publicPostBySlugUrl} />
              <BlogApiSnippet label="Search feed" value={publicBlogSearchUrl} />
              <BlogApiSnippet label="Archive feed" value={publicBlogArchiveUrl} />
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
          </div>
        </details>
        </div>
      </details>

      <details
        id="blog-taxonomy"
        className="group mb-6 scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card"
        data-testid="blog-taxonomy-manager"
        data-disclosure="blog-taxonomy-manager"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            Taxonomy manager
          </span>
          <span className="flex shrink-0 flex-wrap justify-end gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">{categories.length} categories</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{tags.length} tags</span>
          </span>
        </summary>
        <div className="border-t border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Taxonomy manager</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage the category and tag vocabulary that custom frontends use for blog indexes, archive filters, related posts, and feed chips.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">{categories.length} categories</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{tags.length} tags</span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-4">
            <TaxonomyDraftForm
              kind="category"
              draft={categoryDraft}
              submitted={categoryDraftSubmitted}
              editingName={selectedCategory?.name || ''}
              busy={isBlogWorkflowBusy || !canEditBlog}
              colorEnabled
              onDraftChange={patchCategoryDraft}
              onSave={() => void saveCategoryDraft()}
              onCancel={resetCategoryDraft}
            />

            <div className="mt-4 space-y-2">
              {categories.length === 0 ? (
                <EmptyState
                  icon={Filter}
                  title="No categories yet"
                  description="Create category terms to power blog archive navigation, related-post groups, and frontend feed filters."
                />
              ) : categories.map((category) => {
                const actionStatusId = `blog-category-actions-status-${category.id}`;
                const actionStatus = getTaxonomyActionStatus('category', category.name);

                return (
                <div key={category.id} className="rounded-lg border border-border bg-card px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-border"
                          style={{ backgroundColor: category.color || '#2563eb' }}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">{category.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">/{category.slug}</span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {category.description || 'No description'} · {category.postCount} post{category.postCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1"
                      role="group"
                      aria-label={`Actions for category ${category.name}`}
                      aria-describedby={actionStatusId}
                      data-testid={`blog-category-actions-${category.id}`}
                      data-action-status={actionStatus}
                    >
                      <span id={actionStatusId} className="sr-only" data-testid={`blog-category-actions-status-${category.id}`}>
                        {actionStatus}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditCategory(category)}
                        disabled={isBlogWorkflowBusy || !canEditBlog}
                        title={taxonomyEditDisabledReason || `Edit category ${category.name}`}
                        aria-label={`Edit category ${category.name}`}
                        aria-describedby={actionStatusId}
                        data-action-state={taxonomyEditDisabledReason ? 'blocked' : 'ready'}
                        data-disabled-reason={taxonomyEditDisabledReason || undefined}
                        data-testid={`blog-category-edit-${category.id}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingTaxonomyDelete({ type: 'category', id: category.id, name: category.name, postCount: category.postCount })}
                        disabled={isBlogWorkflowBusy || !canDeleteBlog}
                        title={taxonomyDeleteDisabledReason || `Delete category ${category.name}`}
                        aria-label={`Delete category ${category.name}`}
                        aria-describedby={actionStatusId}
                        data-action-state={taxonomyDeleteDisabledReason ? 'blocked' : 'ready'}
                        data-disabled-reason={taxonomyDeleteDisabledReason || undefined}
                        data-testid={`blog-category-delete-${category.id}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <TaxonomyDraftForm
              kind="tag"
              draft={tagDraft}
              submitted={tagDraftSubmitted}
              editingName={selectedTag?.name || ''}
              busy={isBlogWorkflowBusy || !canEditBlog}
              onDraftChange={patchTagDraft}
              onSave={() => void saveTagDraft()}
              onCancel={resetTagDraft}
            />

            <div className="mt-4 space-y-2">
              {tags.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="No tags yet"
                  description="Create tags to expose lightweight topic filters for blog cards, public feeds, and custom frontend chips."
                />
              ) : tags.map((tag) => {
                const actionStatusId = `blog-tag-actions-status-${tag.id}`;
                const actionStatus = getTaxonomyActionStatus('tag', tag.name);

                return (
                <div key={tag.id} className="rounded-lg border border-border bg-card px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{tag.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">/{tag.slug}</span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {tag.description || 'No description'} · {tag.postCount} post{tag.postCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1"
                      role="group"
                      aria-label={`Actions for tag ${tag.name}`}
                      aria-describedby={actionStatusId}
                      data-testid={`blog-tag-actions-${tag.id}`}
                      data-action-status={actionStatus}
                    >
                      <span id={actionStatusId} className="sr-only" data-testid={`blog-tag-actions-status-${tag.id}`}>
                        {actionStatus}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditTag(tag)}
                        disabled={isBlogWorkflowBusy || !canEditBlog}
                        title={taxonomyEditDisabledReason || `Edit tag ${tag.name}`}
                        aria-label={`Edit tag ${tag.name}`}
                        aria-describedby={actionStatusId}
                        data-action-state={taxonomyEditDisabledReason ? 'blocked' : 'ready'}
                        data-disabled-reason={taxonomyEditDisabledReason || undefined}
                        data-testid={`blog-tag-edit-${tag.id}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingTaxonomyDelete({ type: 'tag', id: tag.id, name: tag.name, postCount: tag.postCount })}
                        disabled={isBlogWorkflowBusy || !canDeleteBlog}
                        title={taxonomyDeleteDisabledReason || `Delete tag ${tag.name}`}
                        aria-label={`Delete tag ${tag.name}`}
                        aria-describedby={actionStatusId}
                        data-action-state={taxonomyDeleteDisabledReason ? 'blocked' : 'ready'}
                        data-disabled-reason={taxonomyDeleteDisabledReason || undefined}
                        data-testid={`blog-tag-delete-${tag.id}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      </details>

      {hasPosts && (
        <div
          id="blog-bulk"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24"
          role="group"
          aria-label="Bulk blog post actions"
          aria-describedby={`${bulkSelectionStatusId} ${bulkActionStatusId}`}
          data-testid="blog-bulk-toolbar"
          data-selected-count={selectedPosts.length}
          data-visible-selected-count={visibleSelectedCount}
          data-hidden-selected-count={hiddenSelectedCount}
          data-filtered-selected-count={selectedFilteredPosts.length}
          data-filtered-total-count={filteredPosts.length}
          data-bulk-action={bulkAction || 'none'}
          data-bulk-action-ready={bulkActionReady ? 'true' : 'false'}
        >
          <span
            id={bulkSelectionStatusId}
            className="text-sm font-medium"
            aria-live="polite"
            data-testid="blog-bulk-selection-status"
          >
            {bulkSelectionStatus}
          </span>
          <button
            type="button"
            onClick={() => setPostSelection(data, selectedCurrentRows.length !== data.length)}
            disabled={data.length === 0 || isBlogWorkflowBusy || !canSelectBlogRows}
            title={bulkSelectionPermissionTitle}
            aria-label={selectedCurrentRows.length === data.length && data.length > 0 ? 'Clear visible blog post selection' : 'Select visible blog posts'}
            data-testid="blog-bulk-select-visible"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selectedCurrentRows.length === data.length && data.length > 0 ? 'Clear visible' : 'Select visible'}
          </button>
          {filteredPosts.length > data.length && (
            <button
              type="button"
              onClick={() => setPostSelection(filteredPosts, !allFilteredPostsSelected)}
              disabled={filteredPosts.length === 0 || isBlogWorkflowBusy || !canSelectBlogRows}
              title={bulkSelectionPermissionTitle || 'Select every post matching the current search, status, taxonomy, and author filters'}
              aria-label={allFilteredPostsSelected ? `Clear all ${filteredPosts.length} filtered blog post selections` : `Select all ${filteredPosts.length} filtered blog posts`}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="blog-bulk-select-filtered"
              data-selection-mode={filteredSelectionMode}
            >
              {allFilteredPostsSelected ? 'Clear filtered' : `Select all filtered (${filteredPosts.length})`}
            </button>
          )}
          <select
            value={bulkAction}
            disabled={isBlogWorkflowBusy || !canSelectBlogRows}
            title={!canSelectBlogRows ? bulkSelectionPermissionTitle : undefined}
            aria-label="Choose bulk blog post action"
            aria-describedby={bulkActionStatusId}
            data-testid="blog-bulk-action-select"
            onChange={(event) => {
              if (isBlogWorkflowBusy || !canSelectBlogRows) return;

              setBulkAction(event.target.value as typeof bulkAction);
              setPendingBulkDelete(false);
            }}
            className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Bulk action...</option>
            <option value="publish" disabled={!canPublishBlog}>Publish selected</option>
            <option value="archive" disabled={!canEditBlog}>Archive selected</option>
            <option value="delete" disabled={!canDeleteBlog}>Delete selected</option>
          </select>
          <button
            type="button"
            onClick={() => void handleBulkAction()}
            disabled={!bulkAction || selectedPosts.length === 0 || isBlogBulkActionBusy || !canRunBulkAction}
            aria-disabled={!bulkAction || selectedPosts.length === 0 || isBlogBulkActionBusy || !canRunBulkAction}
            aria-label={bulkAction ? `Apply blog bulk action: ${bulkActionLabel}` : 'Apply selected blog bulk action'}
            aria-describedby={bulkActionStatusId}
            data-testid="blog-bulk-action-apply"
            data-action-state={bulkActionReady ? 'ready' : 'blocked'}
            data-disabled-reason={bulkActionReady ? undefined : bulkActionStatus}
            data-bulk-action-ready={bulkActionReady ? 'true' : 'false'}
            data-bulk-action-status={bulkActionStatus}
            title={!canRunBulkAction ? bulkActionPermissionTitle : 'Apply selected blog bulk action'}
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
            {isBulkBusy ? bulkBusyLabel : bulkActionLabel}
          </button>
          <span
            id={bulkActionStatusId}
            className="min-w-48 text-xs font-medium leading-5 text-muted-foreground"
            aria-live="polite"
            data-testid="blog-bulk-action-status"
          >
            {bulkActionStatus}
          </span>
          {selectedPosts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!isBlogWorkflowBusy) {
                  setSelectedPostIds(new Set());
                }
              }}
              disabled={isBlogWorkflowBusy}
              aria-label={`Clear selection for ${selectedPosts.length} selected blog post${selectedPosts.length === 1 ? '' : 's'}`}
              data-testid="blog-bulk-clear-selection"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear selection
            </button>
          )}
          {hiddenSelectedCount > 0 && (
            <div className="flex min-w-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                Bulk actions will include {hiddenSelectedCount} selected post{hiddenSelectedCount === 1 ? '' : 's'} outside the current table view.
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!isBlogWorkflowBusy) {
                    setSelectedPostIds((current) => new Set([...current].filter((postId) => visiblePostIdSet.has(postId))));
                  }
                }}
                disabled={isBlogWorkflowBusy}
                aria-label={`Clear ${hiddenSelectedCount} non-visible selected blog post${hiddenSelectedCount === 1 ? '' : 's'}`}
                data-testid="blog-bulk-clear-non-visible"
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear non-visible
              </button>
            </div>
          )}
        </div>
      )}

      <div id="blog-filters" className="flex flex-wrap items-center gap-3 mb-6 scroll-mt-24">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search posts..."
            value={searchQuery}
            disabled={isBlogWorkflowBusy}
            onChange={(e) => {
              if (isBlogWorkflowBusy) return;

              setSearchQuery(e.target.value);
              setSelectedPostIds(new Set());
            }}
            className="w-full pl-4 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Filter className="ml-2 size-4 text-muted-foreground" />
          {(['all', 'published', 'draft', 'scheduled', 'archived'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setPostStatusFilter(status)}
              disabled={isBlogWorkflowBusy}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
                statusFilter === status && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
              )}
            >
              {status}
            </button>
          ))}
        </div>
        <select
          value={selectedCategoryId}
          disabled={isBlogWorkflowBusy}
          onChange={(event) => {
            if (isBlogWorkflowBusy) return;

            setSelectedCategoryId(event.target.value);
            setCurrentPage(1);
            setSelectedPostIds(new Set());
          }}
          className="w-48 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={isBlogWorkflowBusy}
          onChange={(event) => {
            if (isBlogWorkflowBusy) return;

            setSelectedTagId(event.target.value);
            setCurrentPage(1);
            setSelectedPostIds(new Set());
          }}
          className="w-44 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={isBlogWorkflowBusy}
          onChange={(event) => {
            if (isBlogWorkflowBusy) return;

            setSelectedAuthorId(event.target.value);
            setCurrentPage(1);
            setSelectedPostIds(new Set());
          }}
          className="w-44 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
          onClick={clearBlogFilters}
          disabled={isBlogWorkflowBusy}
          data-testid="blog-clear-filters"
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Clear Filters
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isBlogWorkflowBusy) {
              void refreshPosts(activeSiteId);
            }
          }}
          disabled={isBlogWorkflowBusy}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <div id="blog-posts" className="scroll-mt-24">
        <DataGrid
          columns={columns}
          data={data}
          loading={isLoading && data.length === 0}
          interactionDisabled={isBlogWorkflowBusy}
          sortConfig={sortConfig}
          onSort={(key) => {
            if (!isBlogWorkflowBusy) {
              handleSort(key);
            }
          }}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={10}
          onPageChange={(page) => {
            if (!isBlogWorkflowBusy) {
              setCurrentPage(page);
            }
          }}
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
                      onClick={clearBlogFilters}
                      disabled={isBlogWorkflowBusy}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear Filters
                    </button>
                  )}
                  <Link
                    to="/blog/new"
                    search={createPostSearch}
                    data-testid="blog-empty-create"
                    aria-disabled={createPostLinkDisabled}
                    aria-describedby={createPostActionStatusId}
                    title={createPostActionDisabledReason || undefined}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90',
                      createPostLinkDisabled && 'pointer-events-none opacity-60',
                    )}
                    data-action-state={createPostActionDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={createPostActionStatus}
                    data-disabled-reason={createPostActionDisabledReason || undefined}
                    data-target-site-id={activeSiteId}
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

      {pendingTaxonomyDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-taxonomy-delete-confirm-title"
          aria-describedby="blog-taxonomy-delete-confirm-description blog-taxonomy-delete-confirm-impact"
          data-testid="blog-taxonomy-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="blog-taxonomy-delete-confirm-title" className="text-lg font-semibold text-foreground">Delete {pendingTaxonomyDelete.name}?</h2>
                <p id="blog-taxonomy-delete-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  This removes the {pendingTaxonomyDelete.type} from the blog taxonomy API and detaches it from matching posts.
                </p>
              </div>
            </div>
            <div id="blog-taxonomy-delete-confirm-impact" className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Assigned posts: <span className="font-medium text-foreground">{pendingTaxonomyDelete.postCount}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingTaxonomyDelete(null)}
                disabled={isTaxonomyBusy}
                aria-label={`Cancel deleting ${pendingTaxonomyDelete.name} ${pendingTaxonomyDelete.type}`}
                data-testid="blog-taxonomy-delete-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteTaxonomyTarget()}
                disabled={isTaxonomyBusy || !canDeleteBlog}
                title={deleteBlogPermissionTitle}
                aria-label={`Confirm deleting ${pendingTaxonomyDelete.name} ${pendingTaxonomyDelete.type}`}
                data-testid="blog-taxonomy-confirm-delete"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTaxonomyBusy ? 'Deleting...' : `Delete ${pendingTaxonomyDelete.type}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-post-delete-confirm-title"
          aria-describedby="blog-post-delete-confirm-description blog-post-delete-confirm-impact"
          data-testid="blog-post-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="blog-post-delete-confirm-title" className="text-lg font-semibold text-foreground">Delete {pendingDeletePost.title}?</h2>
                <p id="blog-post-delete-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  This removes the post from the backend and from public API delivery. Archive it instead if you only want it hidden.
                </p>
              </div>
            </div>
            <div id="blog-post-delete-confirm-impact" className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Route: <span className="font-medium text-foreground">/blog/{pendingDeletePost.slug}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeletePost(null)}
                disabled={mutatingPostId === pendingDeletePost.id}
                aria-label={`Cancel deleting ${pendingDeletePost.title}`}
                data-testid="blog-post-delete-cancel-button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePost(pendingDeletePost)}
                disabled={mutatingPostId === pendingDeletePost.id || !canDeleteBlog}
                title={deleteBlogPermissionTitle}
                aria-label={`Confirm deleting ${pendingDeletePost.title}`}
                data-testid="blog-post-delete-confirm-button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutatingPostId === pendingDeletePost.id ? 'Deleting...' : 'Delete post'}
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
                disabled={isBulkBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAction()}
                disabled={isBulkBusy || !canDeleteBlog}
                title={deleteBlogPermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkBusy ? 'Deleting...' : 'Delete posts'}
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

const getBulkActionLabel = (action: 'publish' | 'archive' | 'delete' | '', count: number, isConfirmingDelete: boolean): string => {
  const postLabel = `${count} post${count === 1 ? '' : 's'}`;

  if (action === 'publish') {
    return count > 0 ? `Publish ${postLabel}` : 'Publish selected';
  }

  if (action === 'archive') {
    return count > 0 ? `Archive ${postLabel}` : 'Archive selected';
  }

  if (action === 'delete') {
    if (isConfirmingDelete) {
      return count > 0 ? `Delete ${postLabel}` : 'Delete selected';
    }

    return count > 0 ? `Review delete for ${postLabel}` : 'Delete selected';
  }

  return 'Choose action';
};

const getBulkBusyLabel = (action: 'publish' | 'archive' | 'delete' | ''): string => {
  if (action === 'publish') return 'Publishing...';
  if (action === 'archive') return 'Archiving...';
  if (action === 'delete') return 'Deleting...';
  return 'Applying...';
};

interface BlogPostCommentSummary {
  total: number;
  pending: number;
  approved: number;
  flagged: number;
}

const emptyCommentSummary = (): BlogPostCommentSummary => ({
  total: 0,
  pending: 0,
  approved: 0,
  flagged: 0,
});

const buildPostCommentSummaries = (comments: AdminComment[]): Record<string, BlogPostCommentSummary> => (
  comments.reduce<Record<string, BlogPostCommentSummary>>((summaries, comment) => {
    if (comment.targetType !== 'post' || !comment.targetId) {
      return summaries;
    }

    const summary = summaries[comment.targetId] || emptyCommentSummary();
    summary.total += 1;
    if (comment.status === 'pending') summary.pending += 1;
    if (comment.status === 'approved') summary.approved += 1;
    if ((comment.reportCount || 0) > 0 || (comment.reportReasons || []).length > 0) summary.flagged += 1;
    summaries[comment.targetId] = summary;
    return summaries;
  }, {})
);

const BLOG_SUPPORT_METADATA_TIMEOUT_MS = 8_000;

const withBlogSupportTimeout = <T,>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = BLOG_SUPPORT_METADATA_TIMEOUT_MS,
): Promise<T> => new Promise((resolve) => {
  const timeout = window.setTimeout(() => resolve(fallback), timeoutMs);
  promise
    .then((value) => {
      window.clearTimeout(timeout);
      resolve(value);
    })
    .catch(() => {
      window.clearTimeout(timeout);
      resolve(fallback);
    });
});

const loadBlogCommentsWithTimeout = (siteId: string): Promise<{ comments: AdminComment[] }> => (
  withBlogSupportTimeout(
    listAllComments(siteId, { targetType: 'post', status: 'all', limit: 100 })
      .then((result) => ({ comments: result.comments })),
    { comments: [] },
  )
);

const loadBlogRevisionSummaries = async (siteId: string, targetPosts: BlogPost[]): Promise<Record<string, ContentRevisionSummary>> => {
  const results = await Promise.all(
    targetPosts.map(async (post) => {
      const summary = await withBlogSupportTimeout<ContentRevisionSummary | null>(
        getBlogPostRevisionSummary(post.siteId || siteId, post.id),
        null,
      );
      if (!summary) {
        return null;
      }

      return [post.id, summary] as const;
    }),
  );

  return Object.fromEntries(
    results
      .filter((result): result is readonly [string, ContentRevisionSummary] => result !== null),
  );
};

const refreshBlogRevisionSummary = async (
  siteId: string,
  postId: string,
  setRevisionSummaryMap: (updater: (current: Record<string, ContentRevisionSummary>) => Record<string, ContentRevisionSummary>) => void,
) => {
  try {
    const summary = await getBlogPostRevisionSummary(siteId, postId);
    setRevisionSummaryMap((current) => ({ ...current, [postId]: summary }));
  } catch {
    // Revision summaries are supportive context; row mutations already report their own failures.
  }
};

const getPostSeoSummary = (post: BlogPost) => {
  const meta = post.meta || {};
  const title = typeof meta.title === 'string' ? meta.title.trim() : '';
  const description = typeof meta.description === 'string' ? meta.description.trim() : '';
  const canonical = typeof meta.canonical === 'string' ? meta.canonical.trim() : '';

  return {
    hasTitle: title.length > 0,
    hasDescription: description.length > 0 || post.excerpt.trim().length > 0,
    canonical: canonical || `/blog/${post.slug}`,
    noIndex: meta.noIndex === true,
    noFollow: meta.noFollow === true,
  };
};

type BlogPostScheduleState = 'not-scheduled' | 'future' | 'due' | 'missing-date' | 'invalid-date';

const getPostScheduleSummary = (post: BlogPost, now = Date.now()): { state: BlogPostScheduleState; label: string; detail: string } => {
  if (post.status !== 'scheduled') {
    return {
      state: 'not-scheduled',
      label: 'Not scheduled',
      detail: `${post.status} posts do not require a scheduled publish date.`,
    };
  }

  if (!post.scheduledAt) {
    return {
      state: 'missing-date',
      label: 'Missing date',
      detail: 'Scheduled posts need a publish date before public delivery is predictable.',
    };
  }

  const scheduledAtMs = Date.parse(post.scheduledAt);
  if (!Number.isFinite(scheduledAtMs)) {
    return {
      state: 'invalid-date',
      label: 'Invalid date',
      detail: 'Scheduled publish date is not a valid date-time string.',
    };
  }

  if (scheduledAtMs <= now) {
    return {
      state: 'due',
      label: 'Due now',
      detail: 'The scheduled time has passed; public feeds can expose this post.',
    };
  }

  return {
    state: 'future',
    label: 'Scheduled',
    detail: `Public delivery starts ${formatDate(post.scheduledAt)}.`,
  };
};

const getPostScheduleToneClass = (state: BlogPostScheduleState) => {
  if (state === 'missing-date' || state === 'invalid-date') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (state === 'due') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (state === 'future') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }

  return 'border-border bg-muted text-muted-foreground';
};

const getPostArchiveParts = (post: BlogPost | null): { year: string; month: string } => {
  const source = post?.publishedAt || post?.scheduledAt || new Date().toISOString();
  const date = new Date(source);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return {
    year: String(safeDate.getUTCFullYear()),
    month: String(safeDate.getUTCMonth() + 1).padStart(2, '0'),
  };
};

interface TaxonomyDraft {
  name: string;
  slug: string;
  description: string;
  color: string;
}

interface TaxonomyDeleteTarget {
  type: 'category' | 'tag';
  id: string;
  name: string;
  postCount: number;
}

const emptyTaxonomyDraft = (color = ''): TaxonomyDraft => ({
  name: '',
  slug: '',
  description: '',
  color,
});

const slugifyTaxonomyName = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'taxonomy';
};

function BlogRevisionCell({
  post,
  summary,
  isLoading,
  activeSiteId,
}: {
  post: BlogPost;
  summary: ContentRevisionSummary | undefined;
  isLoading: boolean;
  activeSiteId: string;
}) {
  if (isLoading && !summary) {
    return <span className="text-xs text-muted-foreground">Checking revisions...</span>;
  }

  const count = summary?.count ?? 0;
  const latest = summary?.latest ?? null;

  return (
    <div className="min-w-48 space-y-1" data-testid={`blog-post-revisions-${post.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-semibold',
          count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
        >
          {count} revision{count === 1 ? '' : 's'}
        </span>
        <Link
          to="/blog/$postId"
          params={{ postId: post.id }}
          search={{ siteId: activeSiteId }}
          hash="blog-editor-revisions"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open history
        </Link>
      </div>
      {latest ? (
        <div className="text-xs leading-5 text-muted-foreground">
          <span className="block max-w-56 truncate" title={latest.note || 'Revision snapshot'}>
            {latest.note || 'Revision snapshot'}
          </span>
          <span>{formatDate(latest.createdAt)} · {latest.snapshotStatus}</span>
        </div>
      ) : (
        <div className="flex max-w-64 items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
          <History className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="font-medium text-foreground">No saved snapshots yet</div>
            <div className="mt-0.5 leading-4">
              Save this post in the editor to capture a rollback-ready revision.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function TaxonomyDraftForm({
  kind,
  draft,
  submitted,
  editingName,
  busy,
  colorEnabled = false,
  onDraftChange,
  onSave,
  onCancel,
}: {
  kind: 'category' | 'tag';
  draft: TaxonomyDraft;
  submitted: boolean;
  editingName: string;
  busy: boolean;
  colorEnabled?: boolean;
  onDraftChange: (patch: Partial<TaxonomyDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(editingName);
  const title = isEditing ? `Edit ${editingName}` : `Create ${kind}`;
  const nameId = `blog-${kind}-name`;
  const slugId = `blog-${kind}-slug`;
  const descriptionId = `blog-${kind}-description`;
  const nameErrorId = `blog-${kind}-name-error`;
  const nameInlineError = submitted && draft.name.trim().length === 0
    ? `Enter a ${kind} name before saving.`
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {kind === 'category'
              ? 'Categories can carry color and archive grouping for frontend feeds.'
              : 'Tags support cross-category filters, chips, and related-post rules.'}
          </p>
        </div>
        {isEditing && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" />
            Cancel edit
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={nameId}>
          Name
          <input
            id={nameId}
            data-testid={`blog-${kind}-name`}
            value={draft.name}
            disabled={busy}
            onChange={(event) => onDraftChange({ name: event.target.value })}
            placeholder={kind === 'category' ? 'Engineering' : 'Launch notes'}
            aria-invalid={Boolean(nameInlineError)}
            aria-describedby={nameInlineError ? nameErrorId : undefined}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
          {nameInlineError && (
            <span id={nameErrorId} className="mt-1 block text-xs font-medium text-destructive" role="alert" data-testid={`blog-${kind}-name-error`}>
              {nameInlineError}
            </span>
          )}
        </label>
        <label className="text-xs font-medium text-muted-foreground" htmlFor={slugId}>
          Slug
          <input
            id={slugId}
            data-testid={`blog-${kind}-slug`}
            value={draft.slug}
            disabled={busy}
            onChange={(event) => onDraftChange({ slug: slugifyTaxonomyName(event.target.value) })}
            placeholder={kind === 'category' ? 'engineering' : 'launch-notes'}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={descriptionId}>
          Description
          <input
            id={descriptionId}
            data-testid={`blog-${kind}-description`}
            value={draft.description}
            disabled={busy}
            onChange={(event) => onDraftChange({ description: event.target.value })}
            placeholder="Frontend archive description"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        {colorEnabled && (
          <label className="text-xs font-medium text-muted-foreground">
            Color
            <input
              type="color"
              data-testid="blog-category-color"
              value={draft.color || '#2563eb'}
              disabled={busy}
              onChange={(event) => onDraftChange({ color: event.target.value })}
              className="mt-1 h-10 w-14 rounded-lg border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        data-testid={`blog-${kind}-save`}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        {isEditing ? `Save ${kind}` : `Create ${kind}`}
      </button>
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
    return getLocalBackendOrigin();
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
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
