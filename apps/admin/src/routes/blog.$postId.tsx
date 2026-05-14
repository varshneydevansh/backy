/**
 * BACKY CMS - EDIT BLOG POST (HYBRID LAYOUT)
 */

import { useCallback, useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Archive, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, ExternalLink, Eye, Flag, Globe, History, Image as ImageIcon, Maximize2, MessageSquare, Minimize2, PenLine, RefreshCw, RotateCcw, Save, SearchCheck, Tags, Trash2, UserRound, X, XCircle } from 'lucide-react';
import {
    AdminContentApiError,
    archiveBlogPost,
    createBlogPostPreview,
    deleteBlogPost,
    getAdminApiBase,
    getBlogPost,
    getBlogPostReadiness,
    getUserPermissions,
    listComments,
    listBlogAuthors,
    listBlogCategories,
    listBlogPosts,
    listBlogPostRevisions,
    listBlogTags,
    publishBlogPost,
    rollbackBlogPost,
    updateBlogPost,
    updateComments,
    type AdminComment,
    type AdminUserPermissionMatrix,
    type BlogAuthor,
    type BlogCategory,
    type BlogPostReadiness,
    type BlogTag,
    type CommentModerationStatus,
    type ContentRevision,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type BlogPost, type ContentStatus } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { useAuthStore, type User } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import {
  createCanvasElement,
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

interface BlogEditorSearch {
    siteId?: string;
    focus?: 'canvas';
}

const normalizedSearchString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/blog/$postId')({
    validateSearch: (search: Record<string, unknown>): BlogEditorSearch => ({
        siteId: normalizedSearchString(search.siteId),
        focus: search.focus === 'canvas' ? 'canvas' : undefined,
    }),
    component: EditBlogPostPage,
});

const BLOG_EDITOR_CONTROL_AREAS = [
    {
        title: 'Editorial draft',
        detail: 'Control title, slug, excerpt, list copy, and SEO summary.',
        href: '#blog-editor-draft',
    },
    {
        title: 'Design canvas',
        detail: 'Drag, group, layer, bind, focus, and compose the public article page.',
        href: '#blog-editor-canvas',
    },
    {
        title: 'Publish controls',
        detail: 'Preview, save, publish, schedule, archive, discard, and delete.',
        href: '#blog-editor-publish',
    },
    {
        title: 'SEO',
        detail: 'Canonical path, search title, description, Open Graph image, and robots flags.',
        href: '#blog-editor-seo',
    },
    {
        title: 'Featured media',
        detail: 'Choose the post image used by listings, social previews, feeds, and custom frontend cards.',
        href: '#blog-editor-media',
    },
    {
        title: 'Taxonomy',
        detail: 'Assign author, categories, and tags for lists, feeds, and frontend filters.',
        href: '#blog-editor-taxonomy',
    },
    {
        title: 'Comments',
        detail: 'Review pending, approved, reported, spam, and blocked public discussion state.',
        href: '#blog-editor-comments',
    },
    {
        title: 'Revisions',
        detail: 'Restore saved post snapshots when the article design needs rollback.',
        href: '#blog-editor-revisions',
    },
    {
        title: 'Frontend handoff',
        detail: 'Copy admin/public endpoints, canvas contract, taxonomy, and readiness data.',
        href: '#blog-editor-handoff',
    },
] as const;

type BlogEditorPermissionKey =
    | 'pages.view'
    | 'pages.edit'
    | 'pages.publish'
    | 'pages.delete'
    | 'media.view'
    | 'media.create'
    | 'collections.view'
    | 'comments.view'
    | 'comments.manage';

const BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS: Record<BlogEditorPermissionKey, Array<User['role']>> = {
    'pages.view': ['owner', 'admin', 'editor', 'viewer'],
    'pages.edit': ['owner', 'admin', 'editor'],
    'pages.publish': ['owner', 'admin', 'editor'],
    'pages.delete': ['owner', 'admin'],
    'media.view': ['owner', 'admin', 'editor', 'viewer'],
    'media.create': ['owner', 'admin', 'editor'],
    'collections.view': ['owner', 'admin', 'editor', 'viewer'],
    'comments.view': ['owner', 'admin', 'editor', 'viewer'],
    'comments.manage': ['owner', 'admin', 'editor'],
};

const getMetaString = (meta: Record<string, any> | undefined, key: string): string => {
    const value = meta?.[key];
    return typeof value === 'string' ? value : '';
};

const getMetaBoolean = (meta: Record<string, any> | undefined, key: string): boolean => {
    const value = meta?.[key];
    return typeof value === 'boolean' ? value : false;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const getMetaRecord = (meta: Record<string, any> | undefined, key: string): Record<string, unknown> | null => {
    const value = meta?.[key];
    return isRecord(value) ? value : null;
};

const getMetaArray = (meta: Record<string, any> | undefined, key: string): unknown[] => {
    const value = meta?.[key];
    return Array.isArray(value) ? value : [];
};

function EditBlogPostPage() {
    const navigate = useNavigate();
    const { postId } = Route.useParams();
    const routeSearch = Route.useSearch();
    const { sites, posts, media, updatePost, deletePost } = useStore();
    const currentAdmin = useAuthStore((state) => state.user);
    const storePost = posts.find((p) => p.id === postId);
    const storePostId = storePost?.id;
    const storePostSiteId = storePost?.siteId;
    const requestedSite = routeSearch.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, routeSearch.siteId || ''))
        : undefined;
    const fallbackSiteId = requestedSite?.publicSiteId || requestedSite?.id || routeSearch.siteId || getSiteSelectionFromSearch(sites);
    const activeSite = useMemo(
        () => (
            storePostSiteId
                ? sites.find((site) => siteMatchesIdentifier(site, storePostSiteId))
                : sites.find((site) => siteMatchesIdentifier(site, fallbackSiteId))
        ) || sites[0],
        [fallbackSiteId, sites, storePostSiteId],
    );
    const activeSiteId = activeSite?.publicSiteId || activeSite?.id || storePostSiteId || fallbackSiteId || 'site-demo';
    const [post, setPost] = useState<BlogPost | null>(storePost || null);

    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingPost, setIsLoadingPost] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveWarning, setSaveWarning] = useState<string | null>(null);
    const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
    const [saveConflict, setSaveConflict] = useState<{ expectedUpdatedAt?: string; currentUpdatedAt?: string } | null>(null);
    const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
    const [isPreviewBusy, setIsPreviewBusy] = useState(false);
    const [isCheckingRoutes, setIsCheckingRoutes] = useState(false);
    const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
    const [routeCheckRetry, setRouteCheckRetry] = useState(0);
    const [existingBlogPosts, setExistingBlogPosts] = useState<BlogPost[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
    const [revisions, setRevisions] = useState<ContentRevision[]>([]);
    const [authors, setAuthors] = useState<BlogAuthor[]>([]);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [postComments, setPostComments] = useState<AdminComment[]>([]);
    const [postCommentCount, setPostCommentCount] = useState(0);
    const [isCommentsLoading, setIsCommentsLoading] = useState(false);
    const [commentError, setCommentError] = useState<string | null>(null);
    const [updatingCommentIds, setUpdatingCommentIds] = useState<string[]>([]);
    const [postReadiness, setPostReadiness] = useState<BlogPostReadiness | null>(null);
    const [readinessLoading, setReadinessLoading] = useState(false);
    const [readinessError, setReadinessError] = useState<string | null>(null);
    const [pendingRestoreRevision, setPendingRestoreRevision] = useState<ContentRevision | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isFeaturedMediaOpen, setIsFeaturedMediaOpen] = useState(false);
    const [isWorkspaceFocus, setIsWorkspaceFocus] = useState(routeSearch.focus === 'canvas');
    const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
    const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
    const canViewBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canEditBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canPublishBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canDeleteBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canViewMedia = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canCreateMedia = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.create', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canViewCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canViewComments = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canManageComments = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.manage', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewBlogPermissionTitle = canViewBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const editBlogPermissionTitle = canEditBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const publishBlogPermissionTitle = canPublishBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.publish', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const deleteBlogPermissionTitle = canDeleteBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.delete', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewMediaPermissionTitle = canViewMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const createMediaPermissionTitle = canCreateMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.create', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewCollectionsPermissionTitle = canViewCollections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'collections.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const commentsViewPermissionTitle = canViewComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const commentsManagePermissionTitle = canManageComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.manage', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewBlogDeniedMessage = `Your account needs pages.view to load this blog post. ${viewBlogPermissionTitle}`;
    const editBlogDeniedMessage = `Your account needs pages.edit to change this blog post. ${editBlogPermissionTitle}`;
    const publishBlogDeniedMessage = `Your account needs pages.publish to preview or publish this blog post. ${publishBlogPermissionTitle}`;
    const deleteBlogDeniedMessage = `Your account needs pages.delete to delete this blog post. ${deleteBlogPermissionTitle}`;
    const viewMediaDeniedMessage = `Your account needs media.view to select featured media. ${viewMediaPermissionTitle}`;
    const createMediaDeniedMessage = `Your account needs media.create to upload featured media. ${createMediaPermissionTitle}`;
    const viewCollectionsDeniedMessage = `Your account needs collections.view to bind blog canvas elements to collection data. ${viewCollectionsPermissionTitle}`;
    const manageCommentsDeniedMessage = `Your account needs comments.manage to moderate comments. ${commentsManagePermissionTitle}`;

    // Initialize State from Post
    const [title, setTitle] = useState(post?.title || '');
    const [slug, setSlug] = useState(post?.slug || '');
    const [excerpt, setExcerpt] = useState(post?.excerpt || '');
    const [status, setStatus] = useState<ContentStatus>(post?.status || 'draft');
    const [scheduledAt, setScheduledAt] = useState<string | null>(post?.scheduledAt || null);
    const [seoTitle, setSeoTitle] = useState(getMetaString(post?.meta, 'title') || post?.title || '');
    const [seoDescription, setSeoDescription] = useState(getMetaString(post?.meta, 'description') || post?.excerpt || '');
    const [canonicalPath, setCanonicalPath] = useState(getMetaString(post?.meta, 'canonical') || (post?.slug ? `/blog/${post.slug}` : ''));
    const [ogImage, setOgImage] = useState(getMetaString(post?.meta, 'ogImage'));
    const [noIndex, setNoIndex] = useState(getMetaBoolean(post?.meta, 'noIndex'));
    const [noFollow, setNoFollow] = useState(getMetaBoolean(post?.meta, 'noFollow'));
    const [featuredImageId, setFeaturedImageId] = useState<string | null>(post?.featuredImageId || null);
    const [selectedAuthorId, setSelectedAuthorId] = useState(post?.author || 'admin');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(post?.categoryIds || []);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(post?.tagIds || []);

    const clearEditorFeedback = () => {
        setSaveWarning((current) => current ? null : current);
        setWorkflowNotice((current) => current ? null : current);
        setPreviewUrl((current) => current ? null : current);
        setPreviewExpiresAt((current) => current ? null : current);
        setPostReadiness((current) => current ? null : current);
        setReadinessError((current) => current ? null : current);
    };

    useEffect(() => {
        let cancelled = false;
        setPermissionError(null);

        if (!currentAdmin?.id) {
            setPermissionMatrix(null);
            setPermissionError('Sign in with an admin account to load blog editor permissions.');
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
                    setPermissionError(error instanceof Error ? error.message : 'Unable to load blog editor permissions.');
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

    useEffect(() => {
        let cancelled = false;
        const localFallbackPost = storePost;

        const loadPost = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setIsLoadingPost(false);
                setLoadError(viewBlogDeniedMessage);
                return;
            }

            setIsLoadingPost(true);
            setLoadError(null);

            try {
                const backendPost = await getBlogPost(activeSiteId, postId);
                if (!cancelled) {
                    setPost(backendPost);
                    updatePost(postId, backendPost);
                    setTitle(backendPost.title);
                    setSlug(backendPost.slug);
                    setExcerpt(backendPost.excerpt);
                    setStatus(backendPost.status);
                    setScheduledAt(backendPost.scheduledAt || null);
                    setSeoTitle(getMetaString(backendPost.meta, 'title') || backendPost.title);
                    setSeoDescription(getMetaString(backendPost.meta, 'description') || backendPost.excerpt);
                    setCanonicalPath(getMetaString(backendPost.meta, 'canonical') || `/blog/${backendPost.slug}`);
                    setOgImage(getMetaString(backendPost.meta, 'ogImage'));
                    setNoIndex(getMetaBoolean(backendPost.meta, 'noIndex'));
                    setNoFollow(getMetaBoolean(backendPost.meta, 'noFollow'));
                    setFeaturedImageId(backendPost.featuredImageId || null);
                    setSelectedAuthorId(backendPost.author || 'admin');
                    setSelectedCategoryIds(backendPost.categoryIds || []);
                    setSelectedTagIds(backendPost.tagIds || []);
                }
            } catch (error) {
                if (!cancelled) {
                    if (localFallbackPost) {
                        setPost(localFallbackPost);
                        setScheduledAt(localFallbackPost.scheduledAt || null);
                        setSeoTitle(getMetaString(localFallbackPost.meta, 'title') || localFallbackPost.title);
                        setSeoDescription(getMetaString(localFallbackPost.meta, 'description') || localFallbackPost.excerpt);
                        setCanonicalPath(getMetaString(localFallbackPost.meta, 'canonical') || `/blog/${localFallbackPost.slug}`);
                        setOgImage(getMetaString(localFallbackPost.meta, 'ogImage'));
                        setNoIndex(getMetaBoolean(localFallbackPost.meta, 'noIndex'));
                        setNoFollow(getMetaBoolean(localFallbackPost.meta, 'noFollow'));
                        setFeaturedImageId(localFallbackPost.featuredImageId || null);
                        setSelectedAuthorId(localFallbackPost.author || 'admin');
                        setSelectedCategoryIds(localFallbackPost.categoryIds || []);
                        setSelectedTagIds(localFallbackPost.tagIds || []);
                        setLoadError(error instanceof Error ? error.message : 'Unable to load backend post.');
                    } else {
                        setPost(null);
                        setLoadError(error instanceof Error ? error.message : 'Unable to load post.');
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingPost(false);
                }
            }
        };

        void loadPost();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, postId, storePost, storePostId, updatePost, viewBlogDeniedMessage]);

    useEffect(() => {
        let cancelled = false;

        const loadTaxonomy = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setAuthors([]);
                setCategories([]);
                setTags([]);
                return;
            }

            try {
                const [backendAuthors, backendCategories, backendTags] = await Promise.all([
                    listBlogAuthors(activeSiteId),
                    listBlogCategories(activeSiteId),
                    listBlogTags(activeSiteId),
                ]);
                if (!cancelled) {
                    setAuthors(backendAuthors);
                    setCategories(backendCategories);
                    setTags(backendTags);
                }
            } catch {
                if (!cancelled) {
                    setCategories([]);
                    setTags([]);
                }
            }
        };

        void loadTaxonomy();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending]);

    useEffect(() => {
        if (!post) {
            setExistingBlogPosts([]);
            setRouteCheckError(null);
            return;
        }

        let cancelled = false;

        const loadExistingPosts = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setExistingBlogPosts([]);
                setRouteCheckError(viewBlogDeniedMessage);
                setIsCheckingRoutes(false);
                return;
            }

            setIsCheckingRoutes(true);
            setRouteCheckError(null);

            try {
                const backendPosts = await listBlogPosts(activeSiteId);
                if (!cancelled) {
                    setExistingBlogPosts(backendPosts);
                    setRouteCheckError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : 'Unable to verify existing blog routes for this site.';
                    setExistingBlogPosts([]);
                    setRouteCheckError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsCheckingRoutes(false);
                }
            }
        };

        void loadExistingPosts();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, post, routeCheckRetry, viewBlogDeniedMessage]);

    // Canvas State (Content Body)
    const { elements: savedElements, canvasSize: savedCanvasSize } = useMemo(
      () => normalizeSavedCanvasContent(post?.content),
      [post?.content]
    );

    const initialElements: CanvasElement[] = useMemo(() => {
      if (!post) return [];
      if (savedElements.length) return savedElements;

      // Fallback: Wrap legacy plain-text content in a Text element
      const content = post.content?.trim() || 'Start writing...';
      return [
        createCanvasElement('text', 50, 50, {
          width: 800,
          height: 600,
          props: {
            content,
            fontSize: 18,
            lineHeight: 1.6,
            color: '#334155',
          },
        }),
      ];
    }, [post, savedElements]);

    const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(initialElements);
    const [canvasSize, setCanvasSize] = useState<CanvasSize>(savedCanvasSize);

    const loadPostReadiness = useCallback(async () => {
      if (!canViewBlog) {
        setReadinessError(viewBlogDeniedMessage);
        return null;
      }

      setReadinessLoading(true);
      setReadinessError(null);

      try {
        const readiness = await getBlogPostReadiness(activeSiteId, postId);
        setPostReadiness(readiness);
        return readiness;
      } catch (error) {
        setReadinessError(error instanceof Error ? error.message : 'Unable to load post readiness.');
        return null;
      } finally {
        setReadinessLoading(false);
      }
    }, [activeSiteId, canViewBlog, postId, viewBlogDeniedMessage]);

    const loadPostComments = useCallback(async () => {
      if (!canViewComments) {
        setPostComments([]);
        setPostCommentCount(0);
        setCommentError(`Your account needs comments.view to load post comments. ${commentsViewPermissionTitle}`);
        return;
      }

      setIsCommentsLoading(true);
      setCommentError(null);

      try {
        const result = await listComments(activeSiteId, {
          targetType: 'post',
          targetId: postId,
          status: 'all',
          limit: 100,
          sort: 'newest',
        });
        setPostComments(result.comments);
        setPostCommentCount(result.count);
      } catch (error) {
        setPostComments([]);
        setPostCommentCount(0);
        setCommentError(error instanceof Error ? error.message : 'Unable to load post comments.');
      } finally {
        setIsCommentsLoading(false);
      }
    }, [activeSiteId, canViewComments, commentsViewPermissionTitle, postId]);

    useEffect(() => {
      setCanvasElements(initialElements);
      setCanvasSize(savedCanvasSize);
    }, [initialElements, savedCanvasSize]);

    useEffect(() => {
      if (!post) {
        setPostReadiness(null);
        return;
      }
      if (isPermissionMatrixPending) return;

      void loadPostReadiness();
    }, [isPermissionMatrixPending, loadPostReadiness, post]);

    useEffect(() => {
      if (!post) {
        setPostComments([]);
        setPostCommentCount(0);
        return;
      }
      if (isPermissionMatrixPending) return;

      void loadPostComments();
    }, [isPermissionMatrixPending, loadPostComments, post]);

    useEffect(() => {
        setIsWorkspaceFocus(routeSearch.focus === 'canvas');
    }, [routeSearch.focus]);

    useEffect(() => {
        if (!post) {
            return;
        }
        if (isPermissionMatrixPending) return;
        if (!canViewBlog) {
            setRevisions([]);
            return;
        }

        let cancelled = false;

        const loadRevisions = async () => {
            try {
                const nextRevisions = await listBlogPostRevisions(activeSiteId, postId);
                if (!cancelled) {
                    setRevisions(nextRevisions);
                }
            } catch {
                if (!cancelled) {
                    setRevisions([]);
                }
            }
        };

        void loadRevisions();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, post, postId]);

    if (isLoadingPost && !post) {
        return (
            <PageShell title="Loading post" description="Fetching editor content from the backend.">
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Loading blog editor...
                </div>
            </PageShell>
        );
    }

    if (!post) {
        return (
            <PageShell title="Post Not Found" description={loadError || "The article you requested doesn't exist."}>
                <button onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })} className="text-primary hover:underline">
                    &larr; Back to Blog
                </button>
            </PageShell>
        );
    }

    const dummySettings: PageSettings = {
        title,
        slug,
        status,
        scheduledAt,
        meta: { title: seoTitle || title, description: seoDescription || excerpt },
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEditBlog || (status === 'published' || status === 'scheduled') && !canPublishBlog) {
            setSaveWarning(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (!canSave) {
            setSaveWarning(
                isCheckingRoutes
                    ? 'Checking existing blog routes before saving.'
                    : routeCheckError
                        ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
                        : routeConflict
                            ? `The ${publicPath} route is already used by "${routeConflict.title}". Choose another slug or edit that post first.`
                            : !canonicalValid
                                ? 'Canonical path must start with / before saving.'
                                : status === 'scheduled' && !scheduledAt
                                    ? 'Choose a publish date before scheduling changes.'
                                    : 'Add a title and URL slug before saving.',
            );
            setWorkflowNotice(null);
            return;
        }

        if (editorActionBusy) return;

        setIsLoading(true);
        setSaveWarning(null);

        const content = serializeCanvasContent(canvasElements, canvasSize, undefined, {
            documentId: post.id,
            kind: 'post',
            title,
            slug,
            status,
            locale: 'en',
        });
        try {
            const savedPost = await updateBlogPost(activeSiteId, postId, {
                title,
                slug: normalizedSlug,
                excerpt,
                status,
                scheduledAt: status === 'scheduled' ? scheduledAt : null,
                featuredImageId,
                content: JSON.parse(content),
                meta: {
                    title: seoTitle.trim() || title,
                    description: seoDescription.trim() || excerpt,
                    canonical: normalizedCanonicalPath,
                    ogImage: ogImage.trim() || null,
                    noIndex,
                    noFollow,
                },
                authorId: selectedAuthorId || 'admin',
                categoryIds: selectedCategoryIds,
                tagIds: selectedTagIds,
                revisionNote: 'Before blog editor save',
                updatedBy: 'admin',
                expectedUpdatedAt: post.updatedAt,
            });
            syncPostState(savedPost);
            setSaveConflict(null);
            setWorkflowNotice('Post saved and revision snapshot recorded.');
            void loadPostReadiness();
        } catch (error) {
            if (error instanceof AdminContentApiError && error.code === 'BLOG_VERSION_CONFLICT') {
                const details = isRecord(error.details) ? error.details : {};
                const expectedUpdatedAt = typeof details.expectedUpdatedAt === 'string' ? details.expectedUpdatedAt : post.updatedAt;
                const currentUpdatedAt = typeof details.currentUpdatedAt === 'string' ? details.currentUpdatedAt : undefined;
                setSaveConflict({ expectedUpdatedAt, currentUpdatedAt });
                setSaveWarning('This post changed after the editor loaded it. Reload the latest backend copy before saving again.');
            } else {
                setSaveConflict(null);
                setSaveWarning(error instanceof Error
                    ? `${error.message}. Changes were not persisted.`
                    : 'Backend save failed. Changes were not persisted.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const syncPostState = (nextPost: BlogPost) => {
        setPost(nextPost);
        updatePost(postId, nextPost);
        setTitle(nextPost.title);
        setSlug(nextPost.slug);
        setExcerpt(nextPost.excerpt);
        setStatus(nextPost.status);
        setScheduledAt(nextPost.scheduledAt || null);
        setSeoTitle(getMetaString(nextPost.meta, 'title') || nextPost.title);
        setSeoDescription(getMetaString(nextPost.meta, 'description') || nextPost.excerpt);
        setCanonicalPath(getMetaString(nextPost.meta, 'canonical') || `/blog/${nextPost.slug}`);
        setOgImage(getMetaString(nextPost.meta, 'ogImage'));
        setNoIndex(getMetaBoolean(nextPost.meta, 'noIndex'));
        setNoFollow(getMetaBoolean(nextPost.meta, 'noFollow'));
        setFeaturedImageId(nextPost.featuredImageId || null);
        setSelectedAuthorId(nextPost.author || 'admin');
        setSelectedCategoryIds(nextPost.categoryIds || []);
        setSelectedTagIds(nextPost.tagIds || []);
        setSaveConflict(null);
    };

    const reloadLatestPost = async () => {
        if (editorActionBusy) return;
        if (!canViewBlog) {
            setSaveWarning(viewBlogDeniedMessage);
            return;
        }

        setIsLoadingPost(true);
        setSaveWarning(null);
        setWorkflowNotice(null);
        try {
            const latestPost = await getBlogPost(activeSiteId, postId);
            syncPostState(latestPost);
            setWorkflowNotice('Latest backend post loaded into the editor.');
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to reload the latest post.');
        } finally {
            setIsLoadingPost(false);
        }
    };

    const toggleSelection = (
        id: string,
        selectedIds: string[],
        setSelectedIds: Dispatch<SetStateAction<string[]>>,
    ) => {
        if (!canEditBlog) {
            setSaveWarning(editBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        clearEditorFeedback();
        setSelectedIds(
            selectedIds.includes(id)
                ? selectedIds.filter((selectedId) => selectedId !== id)
                : [...selectedIds, id],
        );
    };

    const applyWorkflow = async (action: 'publish' | 'archive') => {
        if (editorActionBusy || (action === 'publish' && (readinessBlocked || routeBlocked || status === 'published')) || (action === 'archive' && status === 'archived')) {
            return;
        }
        if (action === 'publish' && !canPublishBlog) {
            setSaveWarning(publishBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (action === 'archive' && !canEditBlog) {
            setSaveWarning(editBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            if (action === 'publish') {
                if (editorHasUnsavedChanges) {
                    setSaveWarning('Save the post before publishing so the backend publishes the latest title, SEO, taxonomy, media, and canvas changes.');
                    return;
                }

                if (isCheckingRoutes || routeCheckError || routeConflict) {
                    setSaveWarning(routeCheckError
                        ? 'Backy could not verify existing blog routes for this site. Retry the route check before publishing.'
                        : routeConflict
                            ? `The ${publicPath} route is already used by "${routeConflict.title}". Choose another slug before publishing.`
                            : 'Backy is still checking route availability. Wait for the route check before publishing.');
                    return;
                }

                const readiness = await loadPostReadiness();
                if (!readiness) {
                    setSaveWarning('Backy could not verify post readiness. Retry the readiness check before publishing.');
                    return;
                }

                if (readiness.statusLabel === 'blocked') {
                    setSaveWarning('Resolve post readiness errors before publishing.');
                    return;
                }
            }

            if (action === 'archive' && editorHasUnsavedChanges) {
                setSaveWarning('Save or discard local post changes before archiving.');
                return;
            }

            const nextPost = action === 'publish'
                ? await publishBlogPost(activeSiteId, postId, { expectedUpdatedAt: post.updatedAt })
                : await archiveBlogPost(activeSiteId, postId, { expectedUpdatedAt: post.updatedAt });
            syncPostState(nextPost);
            setWorkflowNotice(action === 'publish' ? 'Post published.' : 'Post archived.');
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : `Unable to ${action} post.`);
        } finally {
            setIsWorkflowBusy(false);
        }
    };

    const generatePreview = async () => {
        if (editorActionBusy) return;
        if (!canPublishBlog) {
            setSaveWarning(publishBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        setIsPreviewBusy(true);
        setSaveWarning(null);

        try {
            if (editorHasUnsavedChanges) {
                setSaveWarning('Save the post before generating a preview so the preview uses the latest editor changes.');
                return;
            }

            const preview = await createBlogPostPreview(activeSiteId, postId);
            setPreviewUrl(preview.url);
            setPreviewExpiresAt(preview.expiresAt);
            setWorkflowNotice('Preview link created.');
            window.open(preview.url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to create post preview.');
        } finally {
            setIsPreviewBusy(false);
        }
    };

    const refreshPostReadiness = async () => {
        if (editorActionBusy) return;
        if (!canViewBlog) {
            setReadinessError(viewBlogDeniedMessage);
            return;
        }

        await loadPostReadiness();
    };

    const retryRouteCheck = () => {
        if (editorActionBusy) return;

        setRouteCheckRetry((value) => value + 1);
    };

    const restoreRevision = async (revision: ContentRevision) => {
        if (editorActionBusy) return;
        if (!canEditBlog) {
            setSaveWarning(editBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            if (editorHasUnsavedChanges) {
                setSaveWarning('Save or discard local post changes before restoring a revision.');
                return;
            }

            const restoredPost = await rollbackBlogPost(activeSiteId, postId, revision.id);
            syncPostState(restoredPost);
            setWorkflowNotice('Post revision restored.');
            setPendingRestoreRevision(null);
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to restore post revision.');
        } finally {
            setIsWorkflowBusy(false);
        }
    };

    const moderatePostComments = async (
        commentIds: string[],
        nextStatus: CommentModerationStatus,
        reason?: string,
    ) => {
        if (commentIds.length === 0 || updatingCommentIds.length > 0) return;
        if (!canManageComments) {
            setCommentError(manageCommentsDeniedMessage);
            return;
        }

        setUpdatingCommentIds(commentIds);
        setCommentError(null);
        setWorkflowNotice(null);

        try {
            const result = await updateComments(activeSiteId, {
                commentIds,
                status: nextStatus,
                actor: 'admin',
                reviewedBy: 'admin',
                ...(nextStatus === 'rejected' ? { rejectionReason: reason || 'Rejected from blog post editor.' } : {}),
                ...(nextStatus === 'spam' ? { rejectionReason: reason || 'Marked as spam from blog post editor.' } : {}),
                ...(nextStatus === 'blocked' ? { blockReason: reason || 'Blocked from blog post editor.' } : {}),
            });
            setPostComments((current) => current.map((comment) => (
                result.updated.find((updated) => updated.id === comment.id) || comment
            )));
            setWorkflowNotice(`${result.updatedCount} comment${result.updatedCount === 1 ? '' : 's'} updated.`);
            void loadPostComments();
        } catch (error) {
            setCommentError(error instanceof Error ? error.message : 'Unable to update post comments.');
        } finally {
            setUpdatingCommentIds([]);
        }
    };

    const handleDelete = async () => {
        if (editorActionBusy) return;
        if (!canDeleteBlog) {
            setSaveWarning(deleteBlogDeniedMessage);
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);

        try {
            await deleteBlogPost(activeSiteId, postId);
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to delete post');
            setIsWorkflowBusy(false);
            return;
        }

        setShowDeleteConfirm(false);
        deletePost(postId);
        setIsWorkflowBusy(false);
        navigate({ to: '/blog', search: { siteId: activeSiteId } });
    };

    const setWorkspaceFocusRoute = (focused: boolean) => {
        setIsWorkspaceFocus(focused);
        navigate({
            to: '/blog/$postId',
            params: { postId },
            search: {
                siteId: activeSiteId,
                ...(focused ? { focus: 'canvas' as const } : {}),
            },
            replace: true,
        });
    };

    const normalizedSlug = slugify(slug || post.slug || postId);
    const publicPath = `/blog/${normalizedSlug || 'post-slug'}`;
    const normalizedCanonicalPath = normalizeCanonicalPath(canonicalPath || publicPath);
    const canonicalValid = normalizedCanonicalPath.startsWith('/');
    const routeConflict = normalizedSlug
        ? existingBlogPosts.find((existingPost) => existingPost.id !== postId && slugify(existingPost.slug) === normalizedSlug) || null
        : null;
    const routeBlocked = isCheckingRoutes || Boolean(routeCheckError) || Boolean(routeConflict);
    const routeAvailability = routeCheckError
        ? { status: 'unverified' as const, message: routeCheckError }
        : routeConflict
            ? { status: 'conflict' as const, postId: routeConflict.id, title: routeConflict.title, path: `/blog/${slugify(routeConflict.slug)}` }
            : { status: 'available' as const, checkedPosts: existingBlogPosts.length };
    const readinessFindings = postReadiness?.checks.filter((check) => check.status !== 'pass') || [];
    const readinessBlocked = postReadiness?.statusLabel === 'blocked';
    const readinessTone = postReadiness?.statusLabel === 'ready'
        ? 'border-green-200 bg-green-50 text-green-900'
        : readinessBlocked
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-amber-200 bg-amber-50 text-amber-900';
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = activeSite;
    const selectedFeaturedImage = featuredImageId
        ? media.find((asset) => asset.id === featuredImageId) || null
        : null;
    const selectedFeaturedImageUrl = selectedFeaturedImage
        ? selectedFeaturedImage.url || getPublicMediaFileUrl(selectedFeaturedImage.id, activeSiteId)
        : null;
    const frontendDesignTemplate = {
        id: getMetaString(post.meta, 'frontendDesignTemplateId'),
        name: getMetaString(post.meta, 'frontendDesignTemplateName'),
        routePattern: getMetaString(post.meta, 'frontendDesignRoutePattern'),
        source: getMetaRecord(post.meta, 'frontendDesignSource'),
        chrome: getMetaRecord(post.meta, 'frontendDesignChrome'),
        tokens: getMetaRecord(post.meta, 'frontendDesignTokens'),
        customCss: getMetaString(post.meta, 'frontendDesignCustomCss'),
        bindingHints: getMetaArray(post.meta, 'frontendDesignBindingHints'),
    };
    const hasFrontendDesignTemplate = frontendDesignTemplate.id.length > 0;
    const isCommentMutationBusy = updatingCommentIds.length > 0;
    const commentsBusy = isCommentsLoading || isCommentMutationBusy;
    const commentMetrics = {
        total: postCommentCount || postComments.length,
        loaded: postComments.length,
        pending: postComments.filter((comment) => comment.status === 'pending').length,
        approved: postComments.filter((comment) => comment.status === 'approved').length,
        rejected: postComments.filter((comment) => comment.status === 'rejected').length,
        spam: postComments.filter((comment) => comment.status === 'spam').length,
        blocked: postComments.filter((comment) => comment.status === 'blocked').length,
        reported: postComments.filter((comment) => (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length)).length,
    };
    const flaggedCommentCount = commentMetrics.reported + commentMetrics.spam + commentMetrics.blocked;
    const pendingPostCommentIds = postComments
        .filter((comment) => comment.status === 'pending')
        .map((comment) => comment.id);
    const commentsModerated = !commentError && commentMetrics.pending === 0 && flaggedCommentCount === 0;
    const savedEditorSnapshot = {
        title: post.title || '',
        slug: slugify(post.slug || ''),
        excerpt: post.excerpt || '',
        status: post.status,
        scheduledAt: post.status === 'scheduled' ? post.scheduledAt || null : null,
        seoTitle: getMetaString(post.meta, 'title') || post.title || '',
        seoDescription: getMetaString(post.meta, 'description') || post.excerpt || '',
        canonicalPath: normalizeCanonicalPath(getMetaString(post.meta, 'canonical') || `/blog/${post.slug}`),
        ogImage: getMetaString(post.meta, 'ogImage'),
        noIndex: getMetaBoolean(post.meta, 'noIndex'),
        noFollow: getMetaBoolean(post.meta, 'noFollow'),
        featuredImageId: post.featuredImageId || null,
        authorId: post.author || 'admin',
        categoryIds: post.categoryIds || [],
        tagIds: post.tagIds || [],
        content: {
            elements: initialElements,
            canvasSize: savedCanvasSize,
        },
    };
    const currentEditorSnapshot = {
        title,
        slug: normalizedSlug,
        excerpt,
        status,
        scheduledAt: status === 'scheduled' ? scheduledAt || null : null,
        seoTitle: seoTitle.trim() || title,
        seoDescription: seoDescription.trim() || excerpt,
        canonicalPath: normalizedCanonicalPath,
        ogImage: ogImage.trim(),
        noIndex,
        noFollow,
        featuredImageId,
        authorId: selectedAuthorId || 'admin',
        categoryIds: selectedCategoryIds,
        tagIds: selectedTagIds,
        content: {
            elements: canvasElements,
            canvasSize,
        },
    };
    const editorHasUnsavedChanges = JSON.stringify(savedEditorSnapshot) !== JSON.stringify(currentEditorSnapshot);
    const localReadinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slug.trim().length > 0 },
        { label: 'Route', complete: !routeBlocked },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'SEO', complete: seoTitle.trim().length > 0 && seoDescription.trim().length >= 50 && canonicalValid },
        { label: 'Featured image', complete: Boolean(featuredImageId) },
        { label: 'Comments', complete: commentsModerated },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: status !== 'scheduled' || Boolean(scheduledAt) },
    ];
    const localReadyCount = localReadinessChecks.filter((check) => check.complete).length;
    const canSave = title.trim().length > 0 && normalizedSlug.length > 0 && !routeBlocked && canonicalValid && (status !== 'scheduled' || Boolean(scheduledAt));
    const editorBusy = isLoadingPost || isLoading || isWorkflowBusy || isPermissionMatrixPending;
    const editorActionBusy = editorBusy || isPreviewBusy || readinessLoading || isCheckingRoutes;
    const editorFormDisabled = editorBusy || !canEditBlog;
    const submitLabel = status === 'published' ? 'Save published post' : status === 'scheduled' ? 'Schedule changes' : status === 'archived' ? 'Save archived post' : 'Save draft';
    const backendReadinessDetail = postReadiness
        ? `${postReadiness.score}% ${postReadiness.statusLabel.replace('-', ' ')}.`
        : readinessError || 'Run readiness before publishing.';
    const blogEditorChecks = [
        {
            label: 'Title',
            detail: title.trim() ? 'Article title is ready for frontend handoff.' : 'Add a title before saving.',
            ready: title.trim().length > 0,
        },
        {
            label: 'Route',
            detail: routeCheckError
                ? 'Route check failed. Retry before saving or publishing.'
                : routeConflict
                    ? `${publicPath} is already used by "${routeConflict.title}".`
                    : isCheckingRoutes
                        ? 'Checking route availability.'
                        : normalizedSlug
                            ? `${publicPath} is available in the current site.`
                            : 'Add a slug so public frontends can resolve the post.',
            ready: normalizedSlug.length > 0 && !routeBlocked,
        },
        {
            label: 'Excerpt',
            detail: excerpt.trim().length >= 24 ? `${excerpt.length} characters for feeds and SEO.` : 'Add a stronger summary for blog lists and previews.',
            ready: excerpt.trim().length >= 24,
        },
        {
            label: 'SEO controls',
            detail: `${seoTitle.trim().length || title.length} title chars, ${seoDescription.trim().length || excerpt.length} description chars, canonical ${normalizedCanonicalPath}.`,
            ready: seoTitle.trim().length > 0 && seoDescription.trim().length >= 50 && canonicalValid,
        },
        {
            label: 'Featured media',
            detail: featuredImageId
                ? selectedFeaturedImage
                    ? `${selectedFeaturedImage.name} selected for cards, feeds, and social previews.`
                    : `${featuredImageId} selected. Save keeps the backend reference even if the library preview is not loaded.`
                : 'Choose a featured image for blog lists, Open Graph previews, and generated frontends.',
            ready: Boolean(featuredImageId),
        },
        {
            label: 'Comments',
            detail: commentError
                ? 'Comment moderation state could not be loaded.'
                : commentMetrics.total === 0
                    ? 'No public comments exist for this post yet.'
                    : `${commentMetrics.pending} pending, ${commentMetrics.approved} approved, ${flaggedCommentCount} flagged/spam/blocked.`,
            ready: commentsModerated,
        },
        {
            label: 'Canvas content',
            detail: canvasElements.length > 0 ? `${canvasElements.length} root layer${canvasElements.length === 1 ? '' : 's'} ready.` : 'Add article layout elements.',
            ready: canvasElements.length > 0,
        },
        {
            label: 'Schedule',
            detail: status === 'scheduled' ? scheduledAt ? 'Scheduled publish time is set.' : 'Choose a publish time.' : `${status} workflow selected.`,
            ready: status !== 'scheduled' || Boolean(scheduledAt),
        },
        {
            label: 'Backend readiness',
            detail: backendReadinessDetail,
            ready: Boolean(postReadiness) && !readinessBlocked,
        },
        {
            label: 'Revision safety',
            detail: revisions.length > 0 ? `${revisions.length} saved revision${revisions.length === 1 ? '' : 's'}.` : 'Save once to create a restore point.',
            ready: revisions.length > 0,
        },
    ];
    const blogEditorReadyCount = blogEditorChecks.filter((check) => check.ready).length;
    const blogEditorReadiness = {
        score: Math.round((blogEditorReadyCount / blogEditorChecks.length) * 100),
        checks: blogEditorChecks,
        workflow: [
            { label: 'Write', detail: 'Set title, slug, excerpt, author, categories, and tags.' },
            { label: 'Design', detail: 'Compose the public article page with the shared visual editor.' },
            { label: 'Validate', detail: 'Refresh readiness for route, SEO, canvas, and publishing blockers.' },
            { label: 'Ship', detail: 'Preview, save, publish, schedule, or archive without leaving the editor.' },
        ],
    };
    const adminBlogPostUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/blog/${encodeURIComponent(postId)}`;
    const publicApiBase = getAdminApiBase().replace(/\/api\/admin$/, '/api');
    const publicBlogUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/blog`;
    const publicPostBySlugUrl = `${publicBlogUrl}?slug=${encodeURIComponent(normalizedSlug || post.slug || postId)}`;
    const publicRenderUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(publicPath)}`;
    const publicResolveUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(publicPath)}`;
    const publicPostCommentsUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/blog/${encodeURIComponent(postId)}/comments`;
    const moderationCommentsUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/comments?targetType=post&targetId=${encodeURIComponent(postId)}&limit=100&sort=newest`;
    const editorHandoff = {
        generatedAt: new Date().toISOString(),
        post: {
            id: post.id,
            title: title || post.title,
            slug: normalizedSlug || post.slug,
            path: publicPath,
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            excerpt,
            featuredImageId,
        },
        route: {
            path: publicPath,
            slug: normalizedSlug || post.slug,
            canonical: normalizedCanonicalPath,
            availability: routeAvailability,
        },
        seo: {
            title: seoTitle.trim() || title,
            description: seoDescription.trim() || excerpt,
            canonical: normalizedCanonicalPath,
            ogImage: ogImage.trim() || null,
            featuredImage: selectedFeaturedImage
                ? {
                    id: selectedFeaturedImage.id,
                    name: selectedFeaturedImage.name,
                    url: selectedFeaturedImageUrl,
                    altText: selectedFeaturedImage.altText || null,
                    responsive: selectedFeaturedImage.responsive || null,
                }
                : featuredImageId
                    ? { id: featuredImageId, name: null, url: null, altText: null, responsive: null }
                    : null,
            robots: {
                index: !noIndex,
                follow: !noFollow,
            },
        },
        site: {
            id: activeSiteId,
            name: selectedSite?.name || activeSiteId,
            slug: selectedSite?.slug || activeSiteId,
        },
        endpoints: {
            readUpdateDelete: adminBlogPostUrl,
            revisions: `${adminBlogPostUrl}/revisions`,
            readiness: `${adminBlogPostUrl}/readiness`,
            preview: `${adminBlogPostUrl}/preview`,
            publish: `${adminBlogPostUrl}/publish`,
            archive: `${adminBlogPostUrl}/archive`,
            rollback: `${adminBlogPostUrl}/rollback`,
            rollbackMethod: 'POST',
            rollbackBody: { revisionId: '{revisionId}' },
            publicBlog: publicBlogUrl,
            publicPostBySlug: publicPostBySlugUrl,
            publicRender: publicRenderUrl,
            publicResolve: publicResolveUrl,
            publicComments: publicPostCommentsUrl,
            moderationComments: moderationCommentsUrl,
        },
        editorial: {
            author: selectedAuthor
                ? { id: selectedAuthor.id, name: selectedAuthor.name }
                : { id: selectedAuthorId, name: selectedAuthorId },
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            categories: categories
                .filter((category) => selectedCategoryIds.includes(category.id))
                .map((category) => ({ id: category.id, name: category.name, slug: category.slug })),
            tags: tags
                .filter((tag) => selectedTagIds.includes(tag.id))
                .map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug })),
        },
        comments: {
            total: commentMetrics.total,
            loaded: commentMetrics.loaded,
            pending: commentMetrics.pending,
            approved: commentMetrics.approved,
            rejected: commentMetrics.rejected,
            spam: commentMetrics.spam,
            blocked: commentMetrics.blocked,
            reported: commentMetrics.reported,
            latest: postComments.slice(0, 5).map((comment) => ({
                id: comment.id,
                status: comment.status,
                authorName: comment.authorName || null,
                reportCount: comment.reportCount || 0,
                createdAt: comment.createdAt,
                reviewedAt: comment.reviewedAt || null,
            })),
        },
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            rootLayerCount: canvasElements.length,
            mediaContext: {
                siteId: activeSiteId,
                scope: 'post',
                targetId: postId,
            },
        },
        template: hasFrontendDesignTemplate
            ? {
                id: frontendDesignTemplate.id,
                name: frontendDesignTemplate.name || frontendDesignTemplate.id,
                routePattern: frontendDesignTemplate.routePattern || publicPath,
                source: frontendDesignTemplate.source,
                chrome: frontendDesignTemplate.chrome,
                tokens: frontendDesignTemplate.tokens,
                customCss: frontendDesignTemplate.customCss || null,
                bindingHints: frontendDesignTemplate.bindingHints,
            }
            : {
                id: 'backy-blog-editor',
                name: 'Backy blog editor canvas',
                routePattern: '/blog/{slug}',
                source: 'backy-managed',
                bindingHints: [],
            },
        editorCapabilities: [
            'Edit blog metadata, route, status, taxonomy, and SEO summary beside the public canvas.',
            'Drag, resize, select unlocked siblings with Cmd/Ctrl+A, group with Cmd/Ctrl+G, ungroup, layer, save reusable selections, and bind media-ready components.',
            'Use blog workspace focus to hide editorial and publish panels while designing large article canvases.',
            'Persist serialized canvas content, settings, taxonomy, and revision metadata through the blog update endpoint.',
            'Generate preview links before publishing route changes.',
            'Restore backend revisions when a public article design needs rollback.',
        ],
        readiness: {
            score: blogEditorReadiness.score,
            checks: blogEditorReadiness.checks,
            backend: postReadiness
                ? {
                    score: postReadiness.score,
                    statusLabel: postReadiness.statusLabel,
                    elementCount: postReadiness.elementCount,
                    canvasSize: postReadiness.canvasSize,
                }
                : null,
        },
        revisions: revisions.map((revision) => ({
            id: revision.id,
            note: revision.note,
            createdAt: revision.createdAt,
            status: revision.snapshotStatus,
        })),
        preview: previewUrl
            ? {
                url: previewUrl,
                expiresAt: previewExpiresAt,
            }
            : null,
        guardrails: [
            'Publish is blocked when backend readiness reports blocking errors.',
            'Canonical paths are stored on post meta and drive hosted route SEO, sitemap discovery, resolve payloads, and custom frontend render contracts.',
            'Saving records a revision snapshot before editor changes are persisted.',
            'Frontend renderers should use public blog, resolve, or render endpoints and keep admin endpoints private.',
            'Taxonomy IDs are site-scoped and should be refreshed before rendering filters, feeds, or bylines.',
            'Public frontends should serve approved comments only; moderation state is private and available through the site comments endpoint.',
        ],
    };
    const editorHandoffText = JSON.stringify(editorHandoff, null, 2);

    const copyEditorHandoffText = async (value: string, label: string) => {
        if (editorActionBusy) return;
        if (!canViewBlog) {
            setSaveWarning(viewBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            setSaveWarning(null);
            setWorkflowNotice(`${label} copied.`);
        } catch {
            setWorkflowNotice(null);
            setSaveWarning(value);
        }
    };

    const downloadEditorHandoff = () => {
        if (editorActionBusy) return;
        if (!canViewBlog) {
            setSaveWarning(viewBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        const blob = new Blob([editorHandoffText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${slug || post.slug || post.id}-backy-blog-editor-handoff.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setSaveWarning(null);
        setWorkflowNotice('Blog editor handoff manifest downloaded.');
    };

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })}
                        disabled={editorBusy}
                        className="rounded-lg border border-border bg-background p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span>Edit Blog Post</span>
                </div>
            }
            description="Edit the article, its publishing state, and its public design in one workspace."
            className={cn(
                isWorkspaceFocus
                    ? 'h-[calc(100vh-1rem)] overflow-hidden lg:h-[calc(100vh-1.5rem)]'
                    : undefined,
            )}
            contentClassName={isWorkspaceFocus ? 'h-full min-h-0' : undefined}
            hideHeader={isWorkspaceFocus}
            action={
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWorkspaceFocusRoute(!isWorkspaceFocus)}
                    disabled={editorBusy}
                    iconStart={isWorkspaceFocus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                >
                    {isWorkspaceFocus ? 'Show blog panels' : 'Focus canvas'}
                </Button>
            }
        >
            <div className={cn('w-full', isWorkspaceFocus ? 'h-full min-h-0 overflow-hidden pb-0' : 'pb-24')}>
                {(loadError || saveWarning || routeCheckError) && (
                    <Notice tone="warning" className="mb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{saveWarning || routeCheckError || `${loadError} Using the local post copy.`}</span>
                            {routeCheckError && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={editorActionBusy}
                                    onClick={retryRouteCheck}
                                    iconStart={<RefreshCw className={cn('size-3.5', isCheckingRoutes && 'animate-spin')} />}
                                >
                                    Retry route check
                                </Button>
                            )}
                            {saveConflict && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={editorActionBusy}
                                    onClick={() => void reloadLatestPost()}
                                    iconStart={<RefreshCw className="size-3.5" />}
                                >
                                    Reload latest
                                </Button>
                            )}
                        </div>
                        {saveConflict && (
                            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <div>
                                    <dt className="font-medium">Editor loaded</dt>
                                    <dd className="font-mono">{saveConflict.expectedUpdatedAt || 'unknown'}</dd>
                                </div>
                                <div>
                                    <dt className="font-medium">Backend latest</dt>
                                    <dd className="font-mono">{saveConflict.currentUpdatedAt || 'unknown'}</dd>
                                </div>
                            </dl>
                        )}
                    </Notice>
                )}
                {permissionError && (
                    <Notice tone="warning" className="mb-4">
                        {permissionError}
                    </Notice>
                )}
                {workflowNotice && (
                    <Notice tone="success" className="mb-4">
                        {workflowNotice}
                    </Notice>
                )}

                {!isWorkspaceFocus && (
                <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="blog-editor-command-center">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-foreground">Blog editor command center</h2>
                                <span className={cn(
                                    'rounded-full px-2.5 py-1 text-xs font-semibold',
                                    blogEditorReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                                )}
                                >
                                    {blogEditorReadiness.score}% ready
                                </span>
                                <StatusBadge status={status} />
                            </div>
                            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                Control the article draft, canvas design, taxonomy, publishing workflow, readiness blockers, preview links, and revision rollback from one workspace.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
                                disabled={editorActionBusy || !canViewBlog}
                                title={viewBlogPermissionTitle}
                                iconStart={<Copy className="size-4" />}
                            >
                                Copy handoff
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={downloadEditorHandoff}
                                disabled={editorActionBusy || !canViewBlog}
                                title={viewBlogPermissionTitle}
                                iconStart={<Download className="size-4" />}
                            >
                                Download JSON
                            </Button>
                            <Button
                                type="submit"
                                form="blog-editor-form"
                                disabled={editorActionBusy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)}
                                title={!canEditBlog ? editBlogPermissionTitle : (status === 'published' || status === 'scheduled') ? publishBlogPermissionTitle : undefined}
                                variant="primary"
                                iconStart={<Save className="size-4" />}
                            >
                                {isLoading ? 'Saving...' : submitLabel}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void generatePreview()}
                                disabled={editorActionBusy || !canPublishBlog}
                                title={publishBlogPermissionTitle}
                                iconStart={<Eye className="size-4" />}
                            >
                                Preview
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void refreshPostReadiness()}
                                disabled={editorActionBusy || !canViewBlog}
                                title={viewBlogPermissionTitle}
                                iconStart={<RefreshCw className={cn('size-4', readinessLoading && 'animate-spin')} />}
                            >
                                Refresh readiness
                            </Button>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                        <div className="rounded-lg border border-border bg-background p-4">
                            <h3 className="text-sm font-semibold">Post readiness</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Checks title, route, excerpt, canvas content, schedule state, backend readiness, and restore safety.
                            </p>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn('h-full rounded-full', blogEditorReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                                    style={{ width: `${blogEditorReadiness.score}%` }}
                                />
                            </div>
                            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {blogEditorReadiness.checks.map((check) => (
                                    <BlogEditorReadinessCheck key={check.label} {...check} />
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background p-4">
                            <div className="flex items-center gap-2">
                                <PenLine className="size-4 text-primary" />
                                <h3 className="text-sm font-semibold">Article workflow</h3>
                            </div>
                            <div className="mt-3 grid gap-2">
                                {blogEditorReadiness.workflow.map((step, index) => (
                                    <BlogEditorWorkflowStep key={step.label} index={index + 1} {...step} />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-border bg-background p-4">
                        <h3 className="text-sm font-semibold">Blog editor control map</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Jump to draft fields, the canvas, publish controls, taxonomy, revisions, and frontend handoff.</p>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                            {BLOG_EDITOR_CONTROL_AREAS.map((area) => (
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
                        <div className="mt-4 grid gap-3 md:grid-cols-5">
                            <BlogEditorMetaTile label="Route" value={normalizedSlug ? publicPath : 'No slug'} />
                            <BlogEditorMetaTile label="Canonical" value={normalizedCanonicalPath} />
                            <BlogEditorMetaTile label="Image" value={selectedFeaturedImage?.name || (featuredImageId ? 'Selected' : 'None')} />
                            <BlogEditorMetaTile label="Canvas" value={`${canvasSize.width} x ${canvasSize.height}px`} />
                            <BlogEditorMetaTile label="Status" value={status} />
                        </div>
                        <div
                            className="mt-4 rounded-lg border border-teal-200 bg-teal-50/60 p-4"
                            data-testid="blog-editor-template-provenance"
                            data-template-id={hasFrontendDesignTemplate ? frontendDesignTemplate.id : ''}
                        >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-teal-950">Template-backed article page</h3>
                                    <p className="mt-1 text-sm leading-6 text-teal-900/80">
                                        {hasFrontendDesignTemplate
                                            ? 'This post keeps the frontend design template, route pattern, chrome, tokens, and editable binding hints in the editor handoff.'
                                            : 'This post uses the Backy-managed article canvas and can still be captured into a frontend design template later.'}
                                    </p>
                                </div>
                                <StatusBadge status={hasFrontendDesignTemplate ? 'template linked' : 'backy canvas'} />
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-4">
                                <BlogEditorMetaTile label="Template" value={frontendDesignTemplate.name || frontendDesignTemplate.id || 'Backy blog editor'} />
                                <BlogEditorMetaTile label="Template ID" value={frontendDesignTemplate.id || 'none'} />
                                <BlogEditorMetaTile label="Route pattern" value={frontendDesignTemplate.routePattern || '/blog/{slug}'} />
                                <BlogEditorMetaTile label="Bindings" value={`${frontendDesignTemplate.bindingHints.length} hint${frontendDesignTemplate.bindingHints.length === 1 ? '' : 's'}`} />
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copyEditorHandoffText(adminBlogPostUrl, 'Blog editor API URL')}
                                disabled={editorActionBusy || !canViewBlog}
                                title={viewBlogPermissionTitle}
                                iconStart={<Copy className="size-4" />}
                            >
                                Copy API URL
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
                                disabled={editorActionBusy || !canViewBlog}
                                title={viewBlogPermissionTitle}
                                iconStart={<Copy className="size-4" />}
                            >
                                Copy handoff
                            </Button>
                        </div>
                    </div>
                </section>
                )}

                <form
                    id="blog-editor-form"
                    onSubmit={handleSubmit}
                    className={cn(
                        'grid gap-5',
                        isWorkspaceFocus && 'h-full min-h-0',
                        !isWorkspaceFocus && '[@media(min-width:2200px)]:grid-cols-[minmax(0,1fr)_360px] [@media(min-width:2200px)]:items-start',
                    )}
                    data-testid="blog-editor-workspace-grid"
                >
                    <div className={cn('min-w-0 space-y-6', isWorkspaceFocus && 'h-full min-h-0 space-y-0')}>
                        {!isWorkspaceFocus && (
                        <Panel id="blog-editor-draft" className="overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="Editorial draft"
                                description="Title, canonical URL, and list/SEO summary."
                                icon={<PenLine className="size-4" />}
                                action={<StatusBadge status={status} />}
                            />
                            <PanelContent className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Post title</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setTitle(e.target.value);
                                        }}
                                        placeholder="Untitled post"
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    <span className="font-mono text-muted-foreground">/blog/</span>
                                    <input
                                        type="text"
                                        value={slug}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setSlug(slugify(e.target.value));
                                        }}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="post-slug"
                                    />
                                </div>
                                {(routeConflict || routeCheckError) && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <span>
                                                {routeCheckError
                                                    ? 'Backy could not verify existing blog routes for this site. Retry before saving or publishing.'
                                                    : `${publicPath} is already used by "${routeConflict?.title}". Choose another slug or edit that post first.`}
                                            </span>
                                            {routeCheckError && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={editorActionBusy}
                                                    onClick={retryRouteCheck}
                                                    iconStart={<RefreshCw className={cn('size-3.5', isCheckingRoutes && 'animate-spin')} />}
                                                >
                                                    Retry
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Excerpt</label>
                                    <textarea
                                        value={excerpt}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setExcerpt(e.target.value);
                                        }}
                                        rows={3}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="Short summary for blog lists, feeds, and SEO previews."
                                    />
                                    <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                                </div>
                            </PanelContent>
                        </Panel>
                        )}

                        {!isWorkspaceFocus && (
                        <Panel id="blog-editor-seo" className="overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="SEO and discovery"
                                description="Search metadata, canonical path, Open Graph image, and robots controls for hosted pages and external frontends."
                                icon={<SearchCheck className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Search title</label>
                                        <input
                                            type="text"
                                            value={seoTitle}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setSeoTitle(e.target.value);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={title || 'Search result title'}
                                        />
                                        <div className="text-xs text-muted-foreground">{seoTitle.trim().length || title.length} characters</div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Canonical path</label>
                                        <input
                                            type="text"
                                            value={canonicalPath}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setCanonicalPath(e.target.value);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={publicPath}
                                        />
                                        <div className="text-xs text-muted-foreground">{normalizedCanonicalPath}</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Search description</label>
                                    <textarea
                                        value={seoDescription}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setSeoDescription(e.target.value);
                                        }}
                                        rows={3}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={excerpt || 'Describe the article for search, social previews, feeds, and generated frontends.'}
                                    />
                                    <div className={cn('text-xs', seoDescription.trim().length >= 50 ? 'text-muted-foreground' : 'text-amber-700')}>
                                        {seoDescription.trim().length || excerpt.length} characters. Aim for at least 50.
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Open Graph image URL</label>
                                    <input
                                        type="url"
                                        value={ogImage}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setOgImage(e.target.value);
                                        }}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="https://..."
                                    />
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noIndex}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setNoIndex(e.target.checked);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">No index</span>
                                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask crawlers to keep this post out of search indexes.</span>
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noFollow}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setNoFollow(e.target.checked);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">No follow</span>
                                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask crawlers not to follow links from this post.</span>
                                        </span>
                                    </label>
                                </div>
                            </PanelContent>
                        </Panel>
                        )}

                        <div id="blog-editor-canvas" className={cn('min-w-0 scroll-mt-24', isWorkspaceFocus && 'h-full min-h-0')} data-testid="blog-editor-canvas-shell">
                            <EditorWorkspaceFrame
                                title="Post design canvas"
                                description={isWorkspaceFocus
                                    ? 'Focused article design workspace with the same component, layer, media, grouping, and data-binding controls used by pages.'
                                    : 'Design the public post page with the same component, layer, media, grouping, and data-binding controls used by pages.'}
                                meta={
                                    <>
                                        <span className="rounded bg-muted px-2 py-1 tabular-nums">
                                            {canvasSize.width} x {canvasSize.height}px
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            {canvasElements.length} root layer{canvasElements.length === 1 ? '' : 's'}
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            Cmd/Ctrl+G grouping
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            Cmd/Ctrl+A siblings
                                        </span>
                                        {hasFrontendDesignTemplate && (
                                            <span className="rounded bg-teal-50 px-2 py-1 font-medium text-teal-700">
                                                Template: {frontendDesignTemplate.name || frontendDesignTemplate.id}
                                            </span>
                                        )}
                                        {isWorkspaceFocus && (
                                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                                                Focused
                                            </span>
                                        )}
                                    </>
                                }
                                actions={isWorkspaceFocus ? (
                                    <>
                                        <Button
                                            type="submit"
                                            form="blog-editor-form"
                                            disabled={editorActionBusy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)}
                                            size="sm"
                                            iconStart={<Save className="size-4" />}
                                        >
                                            {isLoading ? 'Saving...' : submitLabel}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkspaceFocusRoute(false)}
                                            disabled={editorBusy}
                                            iconStart={<Minimize2 className="size-4" />}
                                        >
                                            Show panels
                                        </Button>
                                    </>
                                ) : undefined}
                                data-testid={isWorkspaceFocus ? 'blog-editor-focus-banner' : undefined}
                                className={cn(
                                    'relative',
                                    isWorkspaceFocus
                                        ? 'h-full min-h-0'
                                        : 'min-h-[820px] xl:h-[calc(100vh-72px)] xl:min-h-[920px]',
                                )}
                            >
                                <CanvasEditor
                                    mode="blog"
                                    initialElements={initialElements}
                                    initialSettings={dummySettings}
                                    initialSize={canvasSize}
                                    onSave={() => { }}
                                    onChange={(elements, _settings, size) => {
                                        if (editorBusy || !canEditBlog) return;
                                        clearEditorFeedback();
                                        setCanvasElements(elements);
                                        if (size) setCanvasSize(size);
                                    }}
                                    className="h-full w-full"
                                    hideNavigation={true}
                                    hideSettings={true}
                                    hideSave={true}
                                    savePersistence="parent"
                                    saveOwnerLabel="post form"
                                    saveOwnerVersion={post.updatedAt}
                                    canView={canViewBlog}
                                    canEdit={canEditBlog}
                                    canPublish={canPublishBlog}
                                    canViewMedia={canViewMedia}
                                    canCreateMedia={canCreateMedia}
                                    canViewCollections={canViewCollections}
                                    editDisabledReason={editBlogPermissionTitle}
                                    publishDisabledReason={publishBlogPermissionTitle}
                                    mediaViewDisabledReason={viewMediaDeniedMessage}
                                    mediaCreateDisabledReason={createMediaDeniedMessage}
                                    collectionsViewDisabledReason={viewCollectionsDeniedMessage}
                                    mediaContext={{
                                      siteId: activeSiteId,
                                      scope: 'post',
                                      targetId: postId,
                                      targetLabel: post.title,
                                    }}
                                />
                                {(editorBusy || !canEditBlog) && (
                                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-sm">
                                        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm">
                                            {!canEditBlog ? 'Blog editing is disabled for this account.' : isLoading ? 'Saving post design...' : 'Updating post workflow...'}
                                        </div>
                                    </div>
                                )}
                            </EditorWorkspaceFrame>
                        </div>
                    </div>

                    {!isWorkspaceFocus && (
                    <aside className="grid gap-4 xl:grid-cols-2 [@media(min-width:2200px)]:sticky [@media(min-width:2200px)]:top-4 [@media(min-width:2200px)]:block [@media(min-width:2200px)]:space-y-4">
                        <Panel id="blog-editor-publish" className="scroll-mt-24">
                            <PanelHeader
                                title="Publish"
                                description={selectedSite ? selectedSite.name : activeSiteId}
                                icon={<CalendarClock className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-muted p-1">
                                    {(['draft', 'published', 'scheduled', 'archived'] as const).map((nextStatus) => (
                                        <button
                                            key={nextStatus}
                                            type="button"
                                            onClick={() => {
                                                if (!canEditBlog || (nextStatus === 'published' || nextStatus === 'scheduled') && !canPublishBlog) {
                                                    setSaveWarning(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
                                                    setWorkflowNotice(null);
                                                    return;
                                                }

                                                clearEditorFeedback();
                                                setStatus(nextStatus);
                                                if (nextStatus !== 'scheduled') {
                                                    setScheduledAt(null);
                                                }
                                            }}
                                            disabled={editorFormDisabled || ((nextStatus === 'published' || nextStatus === 'scheduled') && !canPublishBlog)}
                                            title={(nextStatus === 'published' || nextStatus === 'scheduled') ? publishBlogPermissionTitle : editBlogPermissionTitle}
                                            className={cn(
                                                'rounded-md px-2 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                                status === nextStatus
                                                    ? 'bg-background text-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                                            )}
                                        >
                                            {nextStatus}
                                        </button>
                                    ))}
                                </div>

                                {status === 'scheduled' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Publish date</label>
                                        <input
                                            type="datetime-local"
                                            value={toDateTimeLocalValue(scheduledAt)}
                                            onChange={(e) => {
                                                if (!canEditBlog || !canPublishBlog) return;
                                                clearEditorFeedback();
                                                setScheduledAt(fromDateTimeLocalValue(e.target.value));
                                            }}
                                            disabled={editorFormDisabled || !canPublishBlog}
                                            title={publishBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            required
                                        />
                                    </div>
                                )}

                                {(postReadiness || readinessLoading || readinessError) && (
                                    <div className={cn('rounded-lg border px-4 py-3 text-sm', readinessTone)}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-2">
                                                {readinessBlocked ? (
                                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                                ) : (
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="font-medium">
                                                        Readiness {postReadiness ? `${postReadiness.score}%` : `${localReadyCount}/${localReadinessChecks.length}`}
                                                    </div>
                                                    <div className="text-xs opacity-80">
                                                        {postReadiness
                                                            ? `${postReadiness.elementCount} elements${postReadiness.canvasSize ? ` · ${postReadiness.canvasSize.width}x${postReadiness.canvasSize.height}` : ''}`
                                                            : readinessError || 'Loading checks...'}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void refreshPostReadiness()}
                                                disabled={editorActionBusy || !canViewBlog}
                                                title={viewBlogPermissionTitle || 'Refresh readiness'}
                                                className="rounded-lg border border-current/20 p-1.5 hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <RefreshCw className={cn('h-3.5 w-3.5', readinessLoading && 'animate-spin')} />
                                            </button>
                                        </div>
                                        {readinessError && <div className="mt-2 text-xs">{readinessError}</div>}
                                        {readinessFindings.length > 0 && (
                                            <div className="mt-3 grid gap-1 text-xs">
                                                {readinessFindings.slice(0, 4).map((check) => (
                                                    <div key={check.id} className="flex items-start gap-2">
                                                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                                                        <span>{check.message}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {editorHasUnsavedChanges && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="blog-editor-unsaved-workflow-guard">
                                        Save this post before preview, publish, archive, or revision restore. Workflow actions use the latest saved backend copy.
                                    </div>
                                )}

                                <div className="grid gap-2">
                                    <Button type="submit" disabled={editorActionBusy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)} variant="primary" iconStart={<Save className="size-4" />} className="w-full">
                                        {isLoading ? 'Saving...' : submitLabel}
                                    </Button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void generatePreview()}
                                            disabled={editorActionBusy || editorHasUnsavedChanges || !canPublishBlog}
                                            variant="outline"
                                            iconStart={<Eye className="size-4" />}
                                            title={editorHasUnsavedChanges ? 'Save this post before generating a preview.' : undefined}
                                        >
                                            Preview
                                        </Button>
                                        <Button
                                            onClick={() => void applyWorkflow('publish')}
                                            disabled={editorActionBusy || editorHasUnsavedChanges || readinessBlocked || routeBlocked || status === 'published' || !canPublishBlog}
                                            variant="secondary"
                                            iconStart={<CheckCircle2 className="size-4" />}
                                            title={editorHasUnsavedChanges ? 'Save this post before publishing.' : routeBlocked ? 'Verify route availability before publishing' : readinessBlocked ? 'Resolve post readiness errors before publishing' : 'Publish post'}
                                        >
                                            Publish
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void applyWorkflow('archive')}
                                            disabled={editorActionBusy || editorHasUnsavedChanges || status === 'archived' || !canEditBlog}
                                            variant="outline"
                                            iconStart={<Archive className="size-4" />}
                                            title={editorHasUnsavedChanges ? 'Save or discard local changes before archiving.' : undefined}
                                        >
                                            Archive
                                        </Button>
                                        <Button onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })} disabled={editorBusy} variant="outline">
                                            Discard
                                        </Button>
                                    </div>
                                    <Button onClick={() => setShowDeleteConfirm(true)} disabled={editorActionBusy || !canDeleteBlog} variant="danger" iconStart={<Trash2 className="size-4" />} className="w-full">
                                        Delete post
                                    </Button>
                                </div>

                                {previewUrl && (
                                    <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <span className="truncate">
                                            Preview expires {previewExpiresAt ? new Date(previewExpiresAt).toLocaleTimeString() : 'soon'}
                                        </span>
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    </a>
                                )}
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-media" className="scroll-mt-24">
                            <PanelHeader
                                title="Featured media"
                                description="Image used by blog cards, feeds, Open Graph previews, and custom frontend lists."
                                icon={<ImageIcon className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="overflow-hidden rounded-lg border border-border bg-background">
                                    {selectedFeaturedImageUrl ? (
                                        <img
                                            src={selectedFeaturedImageUrl}
                                            alt={selectedFeaturedImage?.altText || selectedFeaturedImage?.name || 'Featured post image'}
                                            className="aspect-video w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
                                            <ImageIcon className="size-8" />
                                        </div>
                                    )}
                                    <div className="space-y-1 px-3 py-3">
                                        <div className="truncate text-sm font-semibold text-foreground">
                                            {selectedFeaturedImage?.name || (featuredImageId ? featuredImageId : 'No featured image selected')}
                                        </div>
                                        <div className="text-xs leading-5 text-muted-foreground">
                                            {selectedFeaturedImage
                                                ? `${selectedFeaturedImage.type} · ${selectedFeaturedImage.visibility || 'public'} · ${selectedFeaturedImage.size}`
                                                : 'Select or upload an image scoped to this post.'}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (!canEditBlog) {
                                                setSaveWarning(editBlogDeniedMessage);
                                                return;
                                            }
                                            if (!canViewMedia) {
                                                setSaveWarning(viewMediaDeniedMessage);
                                                return;
                                            }
                                            setIsFeaturedMediaOpen(true);
                                        }}
                                        disabled={editorBusy || !canEditBlog || !canViewMedia}
                                        title={viewMediaPermissionTitle || editBlogPermissionTitle}
                                        iconStart={<ImageIcon className="size-4" />}
                                    >
                                        {featuredImageId ? 'Replace image' : 'Select image'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (!canEditBlog) return;
                                            clearEditorFeedback();
                                            setFeaturedImageId(null);
                                        }}
                                        disabled={editorFormDisabled || !featuredImageId}
                                        title={editBlogPermissionTitle}
                                        iconStart={<X className="size-4" />}
                                    >
                                        Clear image
                                    </Button>
                                </div>
                                {featuredImageId && (
                                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                                        featuredImageId: {featuredImageId}
                                    </div>
                                )}
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-comments" className="scroll-mt-24">
                            <PanelHeader
                                title="Comments"
                                description="Post-specific moderation state and quick review actions."
                                icon={<MessageSquare className="size-4" />}
                                action={
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void loadPostComments()}
                                        disabled={commentsBusy || !canViewComments}
                                        title={commentsViewPermissionTitle}
                                        iconStart={<RefreshCw className={cn('size-3.5', isCommentsLoading && 'animate-spin')} />}
                                    >
                                        Refresh
                                    </Button>
                                }
                            />
                            <PanelContent className="space-y-4">
                                {commentError && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        {commentError}
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <BlogEditorContractTile label="Total" value={`${commentMetrics.total}`} />
                                    <BlogEditorContractTile label="Pending" value={`${commentMetrics.pending}`} />
                                    <BlogEditorContractTile label="Approved" value={`${commentMetrics.approved}`} />
                                    <BlogEditorContractTile label="Flagged" value={`${flaggedCommentCount}`} />
                                </div>
                                {pendingPostCommentIds.length > 0 && (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => void moderatePostComments(pendingPostCommentIds, 'approved')}
                                            disabled={commentsBusy || !canManageComments}
                                            title={commentsManagePermissionTitle}
                                            iconStart={<CheckCircle2 className="size-4" />}
                                        >
                                            Approve pending
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void moderatePostComments(pendingPostCommentIds, 'rejected', 'Rejected from blog post editor.')}
                                            disabled={commentsBusy || !canManageComments}
                                            title={commentsManagePermissionTitle}
                                            iconStart={<XCircle className="size-4" />}
                                        >
                                            Reject pending
                                        </Button>
                                    </div>
                                )}
                                <div className="grid gap-2">
                                    {isCommentsLoading && postComments.length === 0 ? (
                                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                                            Loading post comments...
                                        </div>
                                    ) : postComments.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                                            No comments have been submitted for this post yet.
                                        </div>
                                    ) : postComments.slice(0, 4).map((comment) => (
                                        <BlogCommentModerationItem
                                            key={comment.id}
                                            comment={comment}
                                            busy={commentsBusy || updatingCommentIds.includes(comment.id) || !canManageComments}
                                            onApprove={() => void moderatePostComments([comment.id], 'approved')}
                                            onReject={() => void moderatePostComments([comment.id], 'rejected', 'Rejected from blog post editor.')}
                                        />
                                    ))}
                                </div>
                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => navigate({ to: '/comments', search: { siteId: activeSiteId, targetType: 'post', targetId: post.id } })}
                                        disabled={editorBusy || !canViewComments}
                                        title={commentsViewPermissionTitle}
                                        iconStart={<ExternalLink className="size-4" />}
                                        className="w-full"
                                    >
                                        Open full queue
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void copyEditorHandoffText(moderationCommentsUrl, 'Post comments moderation URL')}
                                        disabled={editorActionBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy comments API
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-handoff" className="scroll-mt-24">
                            <PanelHeader
                                title="Frontend handoff"
                                description="Admin, public, canvas, and taxonomy contract."
                                icon={<Code2 className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Admin endpoint</div>
                                    <div className="mt-2 break-all font-mono text-xs text-foreground">{adminBlogPostUrl}</div>
                                </div>
                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Public render</div>
                                    <div className="mt-2 break-all font-mono text-xs text-foreground">{publicRenderUrl}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <BlogEditorContractTile label="Route" value={publicPath} />
                                    <BlogEditorContractTile label="Canonical" value={normalizedCanonicalPath} />
                                    <BlogEditorContractTile label="Route check" value={routeAvailability.status} />
                                    <BlogEditorContractTile label="Canvas" value={`${canvasSize.width} x ${canvasSize.height}`} />
                                </div>
                                <pre
                                    className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"
                                    data-testid="blog-editor-handoff-json"
                                >
{JSON.stringify({
    postId: post.id,
    route: publicPath,
    status,
    template: hasFrontendDesignTemplate
        ? {
            id: frontendDesignTemplate.id,
            name: frontendDesignTemplate.name || frontendDesignTemplate.id,
            routePattern: frontendDesignTemplate.routePattern || publicPath,
            bindingHints: frontendDesignTemplate.bindingHints,
        }
        : {
            id: 'backy-blog-editor',
            name: 'Backy blog editor canvas',
            routePattern: '/blog/{slug}',
            bindingHints: [],
        },
    authorId: selectedAuthorId,
    categoryIds: selectedCategoryIds,
    tagIds: selectedTagIds,
    featuredImageId,
    comments: {
        total: commentMetrics.total,
        pending: commentMetrics.pending,
        approved: commentMetrics.approved,
        flagged: flaggedCommentCount,
        moderationUrl: moderationCommentsUrl,
        publicThreadUrl: publicPostCommentsUrl,
    },
    seo: {
        title: seoTitle.trim() || title,
        description: seoDescription.trim() || excerpt,
        canonical: normalizedCanonicalPath,
        ogImage: ogImage.trim() || null,
        featuredImage: selectedFeaturedImage
            ? {
                id: selectedFeaturedImage.id,
                name: selectedFeaturedImage.name,
                url: selectedFeaturedImageUrl,
                altText: selectedFeaturedImage.altText || null,
            }
            : featuredImageId
                ? { id: featuredImageId, name: null, url: null, altText: null }
                : null,
        robots: {
            index: !noIndex,
            follow: !noFollow,
        },
    },
    endpoints: {
        publicPostBySlug: publicPostBySlugUrl,
        publicRender: publicRenderUrl,
        publicComments: publicPostCommentsUrl,
        moderationComments: moderationCommentsUrl,
        readiness: `${adminBlogPostUrl}/readiness`,
    },
}, null, 2)}
                                </pre>
                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        onClick={() => void copyEditorHandoffText(publicRenderUrl, 'Blog public render URL')}
                                        disabled={editorActionBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy public URL
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
                                        disabled={editorActionBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy handoff
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-taxonomy" className="scroll-mt-24">
                            <PanelHeader title="Author" icon={<UserRound className="size-4" />} />
                            <PanelContent className="space-y-2">
                                <select
                                    value={selectedAuthorId}
                                    onChange={(event) => {
                                        clearEditorFeedback();
                                        setSelectedAuthorId(event.target.value);
                                    }}
                                    disabled={editorFormDisabled}
                                    title={editBlogPermissionTitle}
                                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {authors.length === 0 ? (
                                        <option value={selectedAuthorId}>{selectedAuthorId}</option>
                                    ) : authors.map((author) => (
                                        <option key={author.id} value={author.id}>
                                            {author.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Globe className="size-3.5" />
                                    <span>{selectedAuthor?.postCount ?? 0} existing post{(selectedAuthor?.postCount ?? 0) === 1 ? '' : 's'}</span>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel className="scroll-mt-24">
                            <PanelHeader title="Taxonomy" icon={<Tags className="size-4" />} />
                            <PanelContent className="space-y-5">
                                <TaxonomyPicker
                                    title="Categories"
                                    emptyLabel="No categories yet."
                                    items={categories}
                                    selectedIds={selectedCategoryIds}
                                    onToggle={(id) => toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)}
                                    disabled={editorFormDisabled}
                                />
                                <TaxonomyPicker
                                    title="Tags"
                                    emptyLabel="No tags yet."
                                    items={tags}
                                    selectedIds={selectedTagIds}
                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
                                    disabled={editorFormDisabled}
                                />
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-revisions" className="scroll-mt-24">
                            <PanelHeader title="Revisions" icon={<History className="size-4" />} />
                            <PanelContent>
                                {revisions.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                                        No saved revisions yet.
                                    </div>
                                ) : (
                                    <div className="grid gap-2">
                                        {revisions.slice(0, 6).map((revision) => (
                                            <div key={revision.id} className="rounded-lg border border-border px-3 py-2">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium">{revision.note || 'Revision snapshot'}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {new Date(revision.createdAt).toLocaleString()} · {revision.snapshotStatus}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={editorActionBusy || editorHasUnsavedChanges || !canEditBlog}
                                                        onClick={() => setPendingRestoreRevision(revision)}
                                                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                        title={editorHasUnsavedChanges ? 'Save or discard local changes before restoring a revision.' : 'Restore revision'}
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </PanelContent>
                        </Panel>
                    </aside>
                    )}
                </form>

                <MediaLibraryModal
                    isOpen={isFeaturedMediaOpen}
                    onClose={() => {
                        if (!editorBusy) {
                            setIsFeaturedMediaOpen(false);
                        }
                    }}
                    onSelect={(asset) => {
                        if (editorBusy || !canEditBlog || !canViewMedia) return;

                        const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
                        clearEditorFeedback();
                        setFeaturedImageId(asset.id);
                        if (!ogImage.trim()) {
                            setOgImage(deliveryUrl);
                        }
                        setWorkflowNotice(`Selected ${asset.name} as the featured image. Save to persist the post reference.`);
                        setIsFeaturedMediaOpen(false);
                    }}
                    allowedTypes="image"
                    initialUploadFilter="image"
                    mediaContext={{
                        siteId: activeSiteId,
                        scope: 'post',
                        targetId: postId,
                        targetLabel: title || post.title,
                    }}
                    allowScopeSwitcher={true}
                    canView={canViewMedia}
                    canCreate={canCreateMedia}
                    viewDisabledReason={viewMediaDeniedMessage}
                    createDisabledReason={createMediaDeniedMessage}
                />

                {pendingRestoreRevision && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
                            <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                                    <RotateCcw className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Restore this revision?</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        The editor will replace the current post draft with this saved snapshot. Save a new revision first if you need to keep the current state.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground">
                                    {pendingRestoreRevision.note || pendingRestoreRevision.snapshotTitle || 'Revision snapshot'}
                                </div>
                                <div>
                                    {new Date(pendingRestoreRevision.createdAt).toLocaleString()} · {pendingRestoreRevision.snapshotStatus}
                                </div>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPendingRestoreRevision(null)}
                                    disabled={editorActionBusy}
                                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void restoreRevision(pendingRestoreRevision)}
                                    disabled={editorActionBusy || editorHasUnsavedChanges || !canEditBlog}
                                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    title={editorHasUnsavedChanges ? 'Save or discard local changes before restoring a revision.' : undefined}
                                >
                                    {isWorkflowBusy ? 'Restoring...' : 'Restore revision'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showDeleteConfirm && post && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
                            <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-red-50 p-2 text-red-600">
                                    <Trash2 className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Delete {title || post.title}?</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        This removes the post from the backend and public delivery. Archive it instead if you only want to hide it.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                                Route: <span className="font-medium text-foreground">/blog/{slug || post.slug}</span>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={editorActionBusy}
                                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleDelete()}
                                    disabled={editorActionBusy || !canDeleteBlog}
                                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isWorkflowBusy ? 'Deleting...' : 'Delete post'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}

const slugify = (value: string) => (
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
);

const normalizeCanonicalPath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '/';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\/+/, '')}`;
};

function BlogEditorMetaTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-3">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 truncate text-sm font-semibold">{value}</div>
        </div>
    );
}

function BlogEditorContractTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-mono text-xs text-foreground">{value}</div>
        </div>
    );
}

function BlogEditorReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
    const Icon = ready ? CheckCircle2 : AlertTriangle;

    return (
        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function BlogEditorWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {index}
            </span>
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function BlogCommentModerationItem({
    comment,
    busy,
    onApprove,
    onReject,
}: {
    comment: AdminComment;
    busy: boolean;
    onApprove: () => void;
    onReject: () => void;
}) {
    const reported = (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length);

    return (
        <article className="rounded-lg border border-border bg-background px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                            {comment.authorName || comment.authorEmail || 'Anonymous'}
                        </span>
                        <StatusBadge status={comment.status} type={commentStatusType(comment.status)} />
                        {reported && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                <Flag className="size-3" />
                                {comment.reportCount || comment.reportReasons?.length || 1}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                    </div>
                </div>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {comment.content}
            </p>
            {(comment.rejectionReason || comment.blockReason || comment.reportReasons?.length) && (
                <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {comment.reportReasons?.length ? <div>Reports: {comment.reportReasons.join(', ')}</div> : null}
                    {comment.rejectionReason ? <div>Rejection: {comment.rejectionReason}</div> : null}
                    {comment.blockReason ? <div>Block: {comment.blockReason}</div> : null}
                </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    onClick={onApprove}
                    disabled={busy || comment.status === 'approved'}
                    iconStart={<CheckCircle2 className="size-4" />}
                >
                    Approve
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onReject}
                    disabled={busy || comment.status === 'rejected'}
                    iconStart={<XCircle className="size-4" />}
                >
                    Reject
                </Button>
            </div>
        </article>
    );
}

function commentStatusType(status: CommentModerationStatus) {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'rejected' || status === 'spam' || status === 'blocked') return 'error';
    return 'neutral';
}

interface TaxonomyPickerProps {
    title: string;
    emptyLabel: string;
    items: Array<BlogCategory | BlogTag>;
    selectedIds: string[];
    onToggle: (id: string) => void;
    disabled?: boolean;
}

function TaxonomyPicker({ title, emptyLabel, items, selectedIds, onToggle, disabled = false }: TaxonomyPickerProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">{title}</label>
                <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            </div>
            <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-border bg-background p-3">
                {items.length === 0 ? (
                    <span className="text-sm text-muted-foreground">{emptyLabel}</span>
                ) : items.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggle(item.id)}
                            disabled={disabled}
                            className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {item.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
