/**
 * BACKY CMS - BLOG PAGE
 * 
 * Layout route that shows list at /blog, renders child routes otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Archive, CheckCircle2, Copy, Download, ExternalLink, Eye, Filter, Plus, FileText, Edit, Trash2, Save, Tag, X, MessageSquare } from 'lucide-react';
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
  getUserPermissions,
  listBlogAuthors,
  listBlogCategories,
  listBlogPosts,
  listBlogTags,
  listComments,
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
  const [categoryDraft, setCategoryDraft] = useState<TaxonomyDraft>(() => emptyTaxonomyDraft('#2563eb'));
  const [tagDraft, setTagDraft] = useState<TaxonomyDraft>(() => emptyTaxonomyDraft());
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
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canEditBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canPublishBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canDeleteBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canViewComments = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.view', BLOG_PERMISSION_ROLE_DEFAULTS);
  const canExportBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', BLOG_PERMISSION_ROLE_DEFAULTS);
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
  const isPostMutationBusy = mutatingPostId !== null;
  const isPostPreviewBusy = previewingPostId !== null;
  const isTaxonomyBusy = Boolean(mutatingTaxonomyKey);
  const isSeoBusy = Boolean(updatingSeoPostId);
  const isBlogWorkflowBusy = isLoading || isBulkBusy || isPostMutationBusy || isPostPreviewBusy || isTaxonomyBusy || isSeoBusy || isPermissionMatrixPending;
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

  useEffect(() => {
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

  const refreshPosts = useMemo(
    () => async (siteId: string) => {
      if (isPermissionMatrixPending) return;

      if (!canViewBlog) {
        setIsLoading(false);
        setError(viewBlogDeniedMessage);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [backendPosts, backendCategories, backendTags, backendAuthors] = await Promise.all([
          listBlogPosts(siteId),
          listBlogCategories(siteId),
          listBlogTags(siteId),
          listBlogAuthors(siteId),
        ]);
        const commentResult = canViewComments
          ? await listComments(siteId, { targetType: 'post', status: 'all', limit: 500 }).catch(() => ({ comments: [] }))
          : { comments: [] };
        setPosts(backendPosts);
        setSelectedPostIds((current) => new Set(backendPosts.filter((post) => current.has(post.id)).map((post) => post.id)));
        setCategories(backendCategories);
        setTags(backendTags);
        setAuthors(backendAuthors);
        setCommentSummaries(buildPostCommentSummaries(commentResult.comments));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load posts');
      } finally {
        setIsLoading(false);
      }
    },
    [canViewBlog, canViewComments, isPermissionMatrixPending, setPosts, viewBlogDeniedMessage],
  );

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    let cancelled = false;

    const loadPosts = async () => {
      if (isPermissionMatrixPending) return;

      if (!canViewBlog) {
        setIsLoading(false);
        setError(viewBlogDeniedMessage);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [backendPosts, backendCategories, backendTags, backendAuthors] = await Promise.all([
          listBlogPosts(activeSiteId),
          listBlogCategories(activeSiteId),
          listBlogTags(activeSiteId),
          listBlogAuthors(activeSiteId),
        ]);
        const commentResult = canViewComments
          ? await listComments(activeSiteId, { targetType: 'post', status: 'all', limit: 500 }).catch(() => ({ comments: [] }))
          : { comments: [] };
        if (!cancelled) {
          setPosts(backendPosts);
          setSelectedPostIds((current) => new Set(backendPosts.filter((post) => current.has(post.id)).map((post) => post.id)));
          setCategories(backendCategories);
          setTags(backendTags);
          setAuthors(backendAuthors);
          setCommentSummaries(buildPostCommentSummaries(commentResult.comments));
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
  }, [activeSiteId, canViewBlog, canViewComments, isPermissionMatrixPending, setPosts, viewBlogDeniedMessage]);

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
    setTagDraft({
      name: tag.name,
      slug: tag.slug,
      description: tag.description || '',
      color: '',
    });
  };

  const resetCategoryDraft = () => {
    setEditingCategoryId('');
    setCategoryDraft(emptyTaxonomyDraft('#2563eb'));
  };

  const resetTagDraft = () => {
    setEditingTagId('');
    setTagDraft(emptyTaxonomyDraft());
  };

  const saveCategoryDraft = async () => {
    if (isBlogWorkflowBusy || !categoryDraft.name.trim()) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
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
    if (isBlogWorkflowBusy || !tagDraft.name.trim()) return;
    if (!canEditBlog) {
      setError(editBlogDeniedMessage);
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
    if (isBlogWorkflowBusy) return;
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

  const handleBulkAction = async () => {
    if (isBlogWorkflowBusy) return;

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
      key: 'meta',
      label: 'SEO / Comments',
      render: (post) => {
        const seo = getPostSeoSummary(post);
        const summary = commentSummaries[post.id] || emptyCommentSummary();
        const commentsHref = `/comments?siteId=${encodeURIComponent(activeSiteId)}`;
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
              aria-disabled={isBlogWorkflowBusy}
              onClick={(event) => {
                if (isBlogWorkflowBusy) {
                  event.preventDefault();
                }
              }}
              className={cn(
                'p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors',
                isBlogWorkflowBusy && 'pointer-events-none opacity-50',
              )}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => {
              void handlePreviewPost(post);
            }}
            disabled={isBlogWorkflowBusy || !canPublishBlog}
            title={publishBlogPermissionTitle || 'Preview post'}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (!isBlogWorkflowBusy) {
                void navigate({ to: '/blog/$postId', params: { postId: post.id }, search: { siteId: activeSiteId } });
              }
            }}
            disabled={isBlogWorkflowBusy || !canViewBlog}
            title={viewBlogPermissionTitle || 'Edit post'}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (!isBlogWorkflowBusy) {
                setPendingDeletePost(post);
              }
            }}
            disabled={isBlogWorkflowBusy || !canDeleteBlog}
            title={deleteBlogPermissionTitle || 'Delete post'}
            className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
  const visiblePostIdSet = useMemo(() => new Set(data.map((post) => post.id)), [data]);
  const hiddenSelectedCount = Math.max(0, selectedPosts.length - selectedCurrentRows.length);
  const bulkActionLabel = getBulkActionLabel(bulkAction, selectedPosts.length, pendingBulkDelete);
  const bulkBusyLabel = getBulkBusyLabel(bulkAction);
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
          aria-disabled={isBlogWorkflowBusy || !canEditBlog}
          title={editBlogPermissionTitle}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors',
            (isBlogWorkflowBusy || !canEditBlog) && 'pointer-events-none opacity-60',
          )}
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

      {permissionError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {permissionError}
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
              disabled={isBlogWorkflowBusy || !canViewBlog}
              title={viewBlogPermissionTitle}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="size-4" />
              Copy handoff
            </button>
            <button
              type="button"
              onClick={downloadBlogHandoff}
              disabled={isBlogWorkflowBusy || !canViewBlog}
              title={viewBlogPermissionTitle}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={downloadBlogCsv}
              disabled={data.length === 0 || isBlogWorkflowBusy || !canExportBlog}
              title={exportBlogPermissionTitle}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              Export CSV
            </button>
            <Link
              to="/blog/new"
              search={createPostSearch}
              aria-disabled={isBlogWorkflowBusy || !canEditBlog}
              title={editBlogPermissionTitle}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90',
                (isBlogWorkflowBusy || !canEditBlog) && 'pointer-events-none opacity-60',
              )}
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
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
      </section>

      <section id="blog-taxonomy" className="mb-6 scroll-mt-24 rounded-lg border border-border bg-card p-4" data-testid="blog-taxonomy-manager">
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
              editingName={selectedCategory?.name || ''}
              busy={isBlogWorkflowBusy || !canEditBlog}
              colorEnabled
              onDraftChange={patchCategoryDraft}
              onSave={() => void saveCategoryDraft()}
              onCancel={resetCategoryDraft}
            />

            <div className="mt-4 space-y-2">
              {categories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No categories yet.
                </div>
              ) : categories.map((category) => (
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
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditCategory(category)}
                        disabled={isBlogWorkflowBusy || !canEditBlog}
                        title={editBlogPermissionTitle}
                        aria-label={`Edit category ${category.name}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingTaxonomyDelete({ type: 'category', id: category.id, name: category.name, postCount: category.postCount })}
                        disabled={isBlogWorkflowBusy || !canDeleteBlog}
                        title={deleteBlogPermissionTitle}
                        aria-label={`Delete category ${category.name}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <TaxonomyDraftForm
              kind="tag"
              draft={tagDraft}
              editingName={selectedTag?.name || ''}
              busy={isBlogWorkflowBusy || !canEditBlog}
              onDraftChange={patchTagDraft}
              onSave={() => void saveTagDraft()}
              onCancel={resetTagDraft}
            />

            <div className="mt-4 space-y-2">
              {tags.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No tags yet.
                </div>
              ) : tags.map((tag) => (
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
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditTag(tag)}
                        disabled={isBlogWorkflowBusy || !canEditBlog}
                        title={editBlogPermissionTitle}
                        aria-label={`Edit tag ${tag.name}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingTaxonomyDelete({ type: 'tag', id: tag.id, name: tag.name, postCount: tag.postCount })}
                        disabled={isBlogWorkflowBusy || !canDeleteBlog}
                        title={deleteBlogPermissionTitle}
                        aria-label={`Delete tag ${tag.name}`}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {hasPosts && (
        <div id="blog-bulk" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
          <span className="text-sm font-medium">
            {selectedPosts.length} selected{hiddenSelectedCount > 0 ? `, ${hiddenSelectedCount} not visible` : ''}
          </span>
          <button
            type="button"
            onClick={() => setPostSelection(data, selectedCurrentRows.length !== data.length)}
            disabled={data.length === 0 || isBlogWorkflowBusy || !canSelectBlogRows}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selectedCurrentRows.length === data.length && data.length > 0 ? 'Clear visible' : 'Select visible'}
          </button>
          <select
            value={bulkAction}
            disabled={isBlogWorkflowBusy || !canSelectBlogRows}
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
            disabled={!bulkAction || selectedPosts.length === 0 || isBlogWorkflowBusy || !canRunBulkAction}
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
          {selectedPosts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!isBlogWorkflowBusy) {
                  setSelectedPostIds(new Set());
                }
              }}
              disabled={isBlogWorkflowBusy}
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
          loading={isLoading}
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
                    aria-disabled={isBlogWorkflowBusy || !canEditBlog}
                    title={editBlogPermissionTitle}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90',
                      (isBlogWorkflowBusy || !canEditBlog) && 'pointer-events-none opacity-60',
                    )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingTaxonomyDelete.name}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the {pendingTaxonomyDelete.type} from the blog taxonomy API and detaches it from matching posts.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Assigned posts: <span className="font-medium text-foreground">{pendingTaxonomyDelete.postCount}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingTaxonomyDelete(null)}
                disabled={isTaxonomyBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteTaxonomyTarget()}
                disabled={isTaxonomyBusy || !canDeleteBlog}
                title={deleteBlogPermissionTitle}
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
                disabled={mutatingPostId === pendingDeletePost.id}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePost(pendingDeletePost)}
                disabled={mutatingPostId === pendingDeletePost.id || !canDeleteBlog}
                title={deleteBlogPermissionTitle}
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
  editingName,
  busy,
  colorEnabled = false,
  onDraftChange,
  onSave,
  onCancel,
}: {
  kind: 'category' | 'tag';
  draft: TaxonomyDraft;
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
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
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
        disabled={busy || !draft.name.trim()}
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
