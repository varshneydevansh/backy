/**
 * BACKY CMS - EDIT BLOG POST (HYBRID LAYOUT)
 */

import { useCallback, useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Archive, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, ExternalLink, Eye, Globe, History, Maximize2, Minimize2, PenLine, RefreshCw, RotateCcw, Save, Tags, Trash2, UserRound } from 'lucide-react';
import {
    archiveBlogPost,
    createBlogPostPreview,
    deleteBlogPost,
    getAdminApiBase,
    getBlogPost,
    getBlogPostReadiness,
    listBlogAuthors,
    listBlogCategories,
    listBlogPostRevisions,
    listBlogTags,
    publishBlogPost,
    rollbackBlogPost,
    updateBlogPost,
    type BlogAuthor,
    type BlogCategory,
    type BlogPostReadiness,
    type BlogTag,
    type ContentRevision,
} from '@/lib/adminContentApi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type BlogPost, type ContentStatus } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
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
        title: 'Taxonomy',
        detail: 'Assign author, categories, and tags for lists, feeds, and frontend filters.',
        href: '#blog-editor-taxonomy',
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

function EditBlogPostPage() {
    const navigate = useNavigate();
    const { postId } = Route.useParams();
    const routeSearch = Route.useSearch();
    const { sites, posts, updatePost, deletePost } = useStore();
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
    const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
    const [isPreviewBusy, setIsPreviewBusy] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
    const [revisions, setRevisions] = useState<ContentRevision[]>([]);
    const [authors, setAuthors] = useState<BlogAuthor[]>([]);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [postReadiness, setPostReadiness] = useState<BlogPostReadiness | null>(null);
    const [readinessLoading, setReadinessLoading] = useState(false);
    const [readinessError, setReadinessError] = useState<string | null>(null);
    const [pendingRestoreRevision, setPendingRestoreRevision] = useState<ContentRevision | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isWorkspaceFocus, setIsWorkspaceFocus] = useState(routeSearch.focus === 'canvas');

    // Initialize State from Post
    const [title, setTitle] = useState(post?.title || '');
    const [slug, setSlug] = useState(post?.slug || '');
    const [excerpt, setExcerpt] = useState(post?.excerpt || '');
    const [status, setStatus] = useState<ContentStatus>(post?.status || 'draft');
    const [scheduledAt, setScheduledAt] = useState<string | null>(post?.scheduledAt || null);
    const [selectedAuthorId, setSelectedAuthorId] = useState(post?.author || 'admin');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(post?.categoryIds || []);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(post?.tagIds || []);

    useEffect(() => {
        let cancelled = false;
        const localFallbackPost = storePost;

        const loadPost = async () => {
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
                    setSelectedAuthorId(backendPost.author || 'admin');
                    setSelectedCategoryIds(backendPost.categoryIds || []);
                    setSelectedTagIds(backendPost.tagIds || []);
                }
            } catch (error) {
                if (!cancelled) {
                    if (localFallbackPost) {
                        setPost(localFallbackPost);
                        setScheduledAt(localFallbackPost.scheduledAt || null);
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
    }, [activeSiteId, postId, storePostId, updatePost]);

    useEffect(() => {
        let cancelled = false;

        const loadTaxonomy = async () => {
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
    }, [activeSiteId]);

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
    }, [activeSiteId, postId]);

    useEffect(() => {
      setCanvasElements(initialElements);
      setCanvasSize(savedCanvasSize);
    }, [initialElements, savedCanvasSize]);

    useEffect(() => {
      if (!post) {
        setPostReadiness(null);
        return;
      }

      void loadPostReadiness();
    }, [loadPostReadiness, post]);

    useEffect(() => {
        setIsWorkspaceFocus(routeSearch.focus === 'canvas');
    }, [routeSearch.focus]);

    useEffect(() => {
        if (!post) {
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
    }, [activeSiteId, post, postId]);

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
        meta: { title, description: excerpt },
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                slug,
                excerpt,
                status,
                scheduledAt: status === 'scheduled' ? scheduledAt : null,
                content: JSON.parse(content),
                meta: {
                    title,
                    description: excerpt,
                },
                authorId: selectedAuthorId || 'admin',
                categoryIds: selectedCategoryIds,
                tagIds: selectedTagIds,
                revisionNote: 'Before blog editor save',
                updatedBy: 'admin',
            });
            setPost(savedPost);
            updatePost(postId, savedPost);
            setWorkflowNotice('Post saved and revision snapshot recorded.');
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error
                ? `${error.message}. Changes were not persisted.`
                : 'Backend save failed. Changes were not persisted.');
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
        setSelectedAuthorId(nextPost.author || 'admin');
        setSelectedCategoryIds(nextPost.categoryIds || []);
        setSelectedTagIds(nextPost.tagIds || []);
    };

    const toggleSelection = (
        id: string,
        selectedIds: string[],
        setSelectedIds: Dispatch<SetStateAction<string[]>>,
    ) => {
        setSelectedIds(
            selectedIds.includes(id)
                ? selectedIds.filter((selectedId) => selectedId !== id)
                : [...selectedIds, id],
        );
    };

    const applyWorkflow = async (action: 'publish' | 'archive') => {
        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            if (action === 'publish') {
                const readiness = await loadPostReadiness();
                if (readiness?.statusLabel === 'blocked') {
                    setSaveWarning('Resolve post readiness errors before publishing.');
                    return;
                }
            }

            const nextPost = action === 'publish'
                ? await publishBlogPost(activeSiteId, postId)
                : await archiveBlogPost(activeSiteId, postId);
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
        setIsPreviewBusy(true);
        setSaveWarning(null);

        try {
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

    const restoreRevision = async (revision: ContentRevision) => {
        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
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

    const handleDelete = async () => {
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

    const readinessFindings = postReadiness?.checks.filter((check) => check.status !== 'pass') || [];
    const readinessBlocked = postReadiness?.statusLabel === 'blocked';
    const readinessTone = postReadiness?.statusLabel === 'ready'
        ? 'border-green-200 bg-green-50 text-green-900'
        : readinessBlocked
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-amber-200 bg-amber-50 text-amber-900';
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = activeSite;
    const localReadinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slug.trim().length > 0 },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: status !== 'scheduled' || Boolean(scheduledAt) },
    ];
    const localReadyCount = localReadinessChecks.filter((check) => check.complete).length;
    const canSave = title.trim().length > 0 && slug.trim().length > 0 && (status !== 'scheduled' || Boolean(scheduledAt));
    const editorBusy = isLoading || isWorkflowBusy;
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
            detail: slug.trim() ? `/blog/${slug}` : 'Add a slug so public frontends can resolve the post.',
            ready: slug.trim().length > 0,
        },
        {
            label: 'Excerpt',
            detail: excerpt.trim().length >= 24 ? `${excerpt.length} characters for feeds and SEO.` : 'Add a stronger summary for blog lists and previews.',
            ready: excerpt.trim().length >= 24,
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
    const publicPath = `/blog/${slug || post.slug || postId}`;
    const publicBlogUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/blog`;
    const publicPostBySlugUrl = `${publicBlogUrl}?slug=${encodeURIComponent(slug || post.slug || postId)}`;
    const publicRenderUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(publicPath)}`;
    const publicResolveUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(publicPath)}`;
    const editorHandoff = {
        generatedAt: new Date().toISOString(),
        post: {
            id: post.id,
            title: title || post.title,
            slug: slug || post.slug,
            path: publicPath,
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            excerpt,
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
            rollback: `${adminBlogPostUrl}/rollback/{revisionId}`,
            publicBlog: publicBlogUrl,
            publicPostBySlug: publicPostBySlugUrl,
            publicRender: publicRenderUrl,
            publicResolve: publicResolveUrl,
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
            'Saving records a revision snapshot before editor changes are persisted.',
            'Frontend renderers should use public blog, resolve, or render endpoints and keep admin endpoints private.',
            'Taxonomy IDs are site-scoped and should be refreshed before rendering filters, feeds, or bylines.',
        ],
    };
    const editorHandoffText = JSON.stringify(editorHandoff, null, 2);

    const copyEditorHandoffText = async (value: string, label: string) => {
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
            <div className="w-full pb-24">
                {(loadError || saveWarning) && (
                    <Notice tone="warning" className="mb-4">
                        {saveWarning || `${loadError} Using the local post copy.`}
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
                                iconStart={<Copy className="size-4" />}
                            >
                                Copy handoff
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={downloadEditorHandoff}
                                iconStart={<Download className="size-4" />}
                            >
                                Download JSON
                            </Button>
                            <Button
                                type="submit"
                                form="blog-editor-form"
                                disabled={editorBusy || !canSave}
                                variant="primary"
                                iconStart={<Save className="size-4" />}
                            >
                                {isLoading ? 'Saving...' : submitLabel}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void generatePreview()}
                                disabled={editorBusy || isPreviewBusy}
                                iconStart={<Eye className="size-4" />}
                            >
                                Preview
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void loadPostReadiness()}
                                disabled={editorBusy || readinessLoading}
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
                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                            <BlogEditorMetaTile label="Route" value={slug ? `/blog/${slug}` : 'No slug'} />
                            <BlogEditorMetaTile label="Canvas" value={`${canvasSize.width} x ${canvasSize.height}px`} />
                            <BlogEditorMetaTile label="Elements" value={`${canvasElements.length}`} />
                            <BlogEditorMetaTile label="Status" value={status} />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copyEditorHandoffText(adminBlogPostUrl, 'Blog editor API URL')}
                                iconStart={<Copy className="size-4" />}
                            >
                                Copy API URL
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
                                iconStart={<Copy className="size-4" />}
                            >
                                Copy handoff
                            </Button>
                        </div>
                    </div>
                </section>
                )}

                {isWorkspaceFocus && (
                    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm" data-testid="blog-editor-focus-banner">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-foreground">Canvas focus mode</div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                                    Editorial, taxonomy, and publish panels are hidden so the article design canvas can use the full workspace. Save remains available from this bar.
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="submit"
                                    form="blog-editor-form"
                                    disabled={editorBusy || !canSave}
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
                            </div>
                        </div>
                    </div>
                )}

                <form
                    id="blog-editor-form"
                    onSubmit={handleSubmit}
                    className={cn(
                        'grid gap-5',
                        !isWorkspaceFocus && '[@media(min-width:2200px)]:grid-cols-[minmax(0,1fr)_360px] [@media(min-width:2200px)]:items-start',
                    )}
                >
                    <div className="min-w-0 space-y-6">
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
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Untitled post"
                                        disabled={editorBusy}
                                        className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    <span className="font-mono text-muted-foreground">/blog/</span>
                                    <input
                                        type="text"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        disabled={editorBusy}
                                        className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="post-slug"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Excerpt</label>
                                    <textarea
                                        value={excerpt}
                                        onChange={(e) => setExcerpt(e.target.value)}
                                        rows={3}
                                        disabled={editorBusy}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="Short summary for blog lists, feeds, and SEO previews."
                                    />
                                    <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                                </div>
                            </PanelContent>
                        </Panel>
                        )}

                        <div id="blog-editor-canvas" className="min-w-0 scroll-mt-24">
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
                                        {isWorkspaceFocus && (
                                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                                                Focused
                                            </span>
                                        )}
                                    </>
                                }
                                className={cn(
                                    'relative',
                                    isWorkspaceFocus
                                        ? 'min-h-[calc(100vh-180px)] xl:h-[calc(100vh-180px)] xl:min-h-[calc(100vh-180px)]'
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
                                        if (editorBusy) return;
                                        setCanvasElements(elements);
                                        if (size) setCanvasSize(size);
                                    }}
                                    className="h-full w-full"
                                    hideNavigation={true}
                                    hideSettings={true}
                                    hideSave={true}
                                    mediaContext={{
                                      siteId: activeSiteId,
                                      scope: 'post',
                                      targetId: postId,
                                      targetLabel: post.title,
                                    }}
                                />
                                {editorBusy && (
                                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-sm">
                                        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm">
                                            {isLoading ? 'Saving post design...' : 'Updating post workflow...'}
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
                                                setStatus(nextStatus);
                                                if (nextStatus !== 'scheduled') {
                                                    setScheduledAt(null);
                                                }
                                            }}
                                            disabled={editorBusy}
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
                                            onChange={(e) => setScheduledAt(fromDateTimeLocalValue(e.target.value))}
                                            disabled={editorBusy}
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
                                                onClick={() => void loadPostReadiness()}
                                                disabled={editorBusy || readinessLoading}
                                                className="rounded-lg border border-current/20 p-1.5 hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Refresh readiness"
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

                                <div className="grid gap-2">
                                    <Button type="submit" disabled={editorBusy || !canSave} variant="primary" iconStart={<Save className="size-4" />} className="w-full">
                                        {isLoading ? 'Saving...' : submitLabel}
                                    </Button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void generatePreview()}
                                            disabled={editorBusy || isPreviewBusy}
                                            variant="outline"
                                            iconStart={<Eye className="size-4" />}
                                        >
                                            Preview
                                        </Button>
                                        <Button
                                            onClick={() => void applyWorkflow('publish')}
                                            disabled={editorBusy || readinessLoading || readinessBlocked || status === 'published'}
                                            variant="secondary"
                                            iconStart={<CheckCircle2 className="size-4" />}
                                            title={readinessBlocked ? 'Resolve post readiness errors before publishing' : 'Publish post'}
                                        >
                                            Publish
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void applyWorkflow('archive')}
                                            disabled={editorBusy || status === 'archived'}
                                            variant="outline"
                                            iconStart={<Archive className="size-4" />}
                                        >
                                            Archive
                                        </Button>
                                        <Button onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })} disabled={editorBusy} variant="outline">
                                            Discard
                                        </Button>
                                    </div>
                                    <Button onClick={() => setShowDeleteConfirm(true)} disabled={editorBusy} variant="danger" iconStart={<Trash2 className="size-4" />} className="w-full">
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
                                    <BlogEditorContractTile label="Canvas" value={`${canvasSize.width} x ${canvasSize.height}`} />
                                    <BlogEditorContractTile label="Elements" value={`${canvasElements.length}`} />
                                    <BlogEditorContractTile label="Revisions" value={`${revisions.length}`} />
                                </div>
                                <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify({
    postId: post.id,
    route: publicPath,
    status,
    authorId: selectedAuthorId,
    categoryIds: selectedCategoryIds,
    tagIds: selectedTagIds,
    endpoints: {
        publicPostBySlug: publicPostBySlugUrl,
        publicRender: publicRenderUrl,
        readiness: `${adminBlogPostUrl}/readiness`,
    },
}, null, 2)}
                                </pre>
                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        onClick={() => void copyEditorHandoffText(publicRenderUrl, 'Blog public render URL')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy public URL
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
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
                                    onChange={(event) => setSelectedAuthorId(event.target.value)}
                                    disabled={editorBusy}
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
                                    disabled={editorBusy}
                                />
                                <TaxonomyPicker
                                    title="Tags"
                                    emptyLabel="No tags yet."
                                    items={tags}
                                    selectedIds={selectedTagIds}
                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
                                    disabled={editorBusy}
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
                                                        disabled={editorBusy}
                                                        onClick={() => setPendingRestoreRevision(revision)}
                                                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                        title="Restore revision"
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
                                    disabled={isWorkflowBusy}
                                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void restoreRevision(pendingRestoreRevision)}
                                    disabled={isWorkflowBusy}
                                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                                    disabled={isWorkflowBusy}
                                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleDelete()}
                                    disabled={isWorkflowBusy}
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
