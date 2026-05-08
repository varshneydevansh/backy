/**
 * BACKY CMS - EDIT BLOG POST (HYBRID LAYOUT)
 */

import { useCallback, useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Archive, ArrowLeft, CalendarClock, CheckCircle2, ExternalLink, Eye, Globe, History, PenLine, RefreshCw, RotateCcw, Save, Tags, Trash2, UserRound } from 'lucide-react';
import {
    archiveBlogPost,
    createBlogPostPreview,
    deleteBlogPost,
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
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import {
  createCanvasElement,
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

export const Route = createFileRoute('/blog/$postId')({
    component: EditBlogPostPage,
});

function EditBlogPostPage() {
    const navigate = useNavigate();
    const { postId } = Route.useParams();
    const { sites, posts, updatePost, deletePost } = useStore();
    const storePost = posts.find((p) => p.id === postId);
    const storePostId = storePost?.id;
    const activeSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
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
                <button onClick={() => navigate({ to: '/blog' })} className="text-primary hover:underline">
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
        if (!confirm(`Restore "${revision.snapshotTitle}" from this revision?`)) {
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            const restoredPost = await rollbackBlogPost(activeSiteId, postId, revision.id);
            syncPostState(restoredPost);
            setWorkflowNotice('Post revision restored.');
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to restore post revision.');
        } finally {
            setIsWorkflowBusy(false);
        }
    };

    const handleDelete = async () => {
        if (confirm('Are you sure you want to delete this post?')) {
            setSaveWarning(null);

            try {
                await deleteBlogPost(activeSiteId, postId);
            } catch (error) {
                setSaveWarning(error instanceof Error ? error.message : 'Unable to delete post');
                return;
            }

            deletePost(postId);
            navigate({ to: '/blog' });
        }
    };

    const readinessFindings = postReadiness?.checks.filter((check) => check.status !== 'pass') || [];
    const readinessBlocked = postReadiness?.statusLabel === 'blocked';
    const readinessTone = postReadiness?.statusLabel === 'ready'
        ? 'border-green-200 bg-green-50 text-green-900'
        : readinessBlocked
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-amber-200 bg-amber-50 text-amber-900';
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = sites.find((site) => (site.publicSiteId || site.id) === activeSiteId);
    const localReadinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slug.trim().length > 0 },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: status !== 'scheduled' || Boolean(scheduledAt) },
    ];
    const localReadyCount = localReadinessChecks.filter((check) => check.complete).length;
    const canSave = title.trim().length > 0 && slug.trim().length > 0 && (status !== 'scheduled' || Boolean(scheduledAt));
    const submitLabel = status === 'published' ? 'Save published post' : status === 'scheduled' ? 'Schedule changes' : status === 'archived' ? 'Save archived post' : 'Save draft';

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate({ to: '/blog' })} className="rounded-lg border border-border bg-background p-2 hover:bg-accent">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span>Edit Blog Post</span>
                </div>
            }
            description="Edit the article, its publishing state, and its public design in one workspace."
        >
            <div className="mx-auto w-full max-w-[1760px] pb-24">
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

                <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
                    <div className="min-w-0 space-y-6">
                        <Panel className="overflow-hidden">
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
                                        className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    <span className="font-mono text-muted-foreground">/blog/</span>
                                    <input
                                        type="text"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0"
                                        placeholder="post-slug"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Excerpt</label>
                                    <textarea
                                        value={excerpt}
                                        onChange={(e) => setExcerpt(e.target.value)}
                                        rows={3}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring"
                                        placeholder="Short summary for blog lists, feeds, and SEO previews."
                                    />
                                    <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                                </div>
                            </PanelContent>
                        </Panel>

                        <EditorWorkspaceFrame
                            title="Post design canvas"
                            description="Design the public post page with the same component, layer, media, grouping, and data-binding controls used by pages."
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
                                </>
                            }
                            className="relative min-h-[760px] xl:h-[calc(100vh-180px)] xl:min-h-[860px]"
                        >
                            <CanvasEditor
                                mode="blog"
                                initialElements={initialElements}
                                initialSettings={dummySettings}
                                initialSize={canvasSize}
                                onSave={() => { }}
                                onChange={(elements, _settings, size) => {
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
                        </EditorWorkspaceFrame>
                    </div>

                    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                        <Panel>
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
                                            className={cn(
                                                'rounded-md px-2 py-2 text-xs font-medium capitalize transition-colors',
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
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
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
                                                disabled={readinessLoading}
                                                className="rounded-lg border border-current/20 p-1.5 hover:bg-white/40 disabled:opacity-50"
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
                                    <Button type="submit" disabled={isLoading || !canSave} variant="primary" iconStart={<Save className="size-4" />} className="w-full">
                                        {isLoading ? 'Saving...' : submitLabel}
                                    </Button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void generatePreview()}
                                            disabled={isPreviewBusy}
                                            variant="outline"
                                            iconStart={<Eye className="size-4" />}
                                        >
                                            Preview
                                        </Button>
                                        <Button
                                            onClick={() => void applyWorkflow('publish')}
                                            disabled={isWorkflowBusy || readinessLoading || readinessBlocked || status === 'published'}
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
                                            disabled={isWorkflowBusy || status === 'archived'}
                                            variant="outline"
                                            iconStart={<Archive className="size-4" />}
                                        >
                                            Archive
                                        </Button>
                                        <Button onClick={() => navigate({ to: '/blog' })} variant="outline">
                                            Discard
                                        </Button>
                                    </div>
                                    <Button onClick={() => void handleDelete()} variant="danger" iconStart={<Trash2 className="size-4" />} className="w-full">
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

                        <Panel>
                            <PanelHeader title="Author" icon={<UserRound className="size-4" />} />
                            <PanelContent className="space-y-2">
                                <select
                                    value={selectedAuthorId}
                                    onChange={(event) => setSelectedAuthorId(event.target.value)}
                                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
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

                        <Panel>
                            <PanelHeader title="Taxonomy" icon={<Tags className="size-4" />} />
                            <PanelContent className="space-y-5">
                                <TaxonomyPicker
                                    title="Categories"
                                    emptyLabel="No categories yet."
                                    items={categories}
                                    selectedIds={selectedCategoryIds}
                                    onToggle={(id) => toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)}
                                />
                                <TaxonomyPicker
                                    title="Tags"
                                    emptyLabel="No tags yet."
                                    items={tags}
                                    selectedIds={selectedTagIds}
                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
                                />
                            </PanelContent>
                        </Panel>

                        <Panel>
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
                                                        disabled={isWorkflowBusy}
                                                        onClick={() => void restoreRevision(revision)}
                                                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
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
                </form>
            </div>
        </PageShell>
    );
}

interface TaxonomyPickerProps {
    title: string;
    emptyLabel: string;
    items: Array<BlogCategory | BlogTag>;
    selectedIds: string[];
    onToggle: (id: string) => void;
}

function TaxonomyPicker({ title, emptyLabel, items, selectedIds, onToggle }: TaxonomyPickerProps) {
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
                            className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
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
