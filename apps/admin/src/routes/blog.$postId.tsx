/**
 * BACKY CMS - EDIT BLOG POST (HYBRID LAYOUT)
 */

import { useEffect, useState, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Archive, ArrowLeft, CheckCircle2, ExternalLink, Eye, FileText, History, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
    archiveBlogPost,
    createBlogPostPreview,
    deleteBlogPost,
    getBlogPost,
    listBlogPostRevisions,
    publishBlogPost,
    rollbackBlogPost,
    updateBlogPost,
    type ContentRevision,
} from '@/lib/adminContentApi';
import { useStore, type BlogPost, type ContentStatus } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
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

    // Initialize State from Post
    const [title, setTitle] = useState(post?.title || '');
    const [slug, setSlug] = useState(post?.slug || '');
    const [excerpt, setExcerpt] = useState(post?.excerpt || '');
    const [status, setStatus] = useState<ContentStatus>(post?.status || 'draft');

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
                }
            } catch (error) {
                if (!cancelled) {
                    if (localFallbackPost) {
                        setPost(localFallbackPost);
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

    useEffect(() => {
      setCanvasElements(initialElements);
      setCanvasSize(savedCanvasSize);
    }, [initialElements, savedCanvasSize]);

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
        meta: { title, description: excerpt },
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setSaveWarning(null);

        const content = serializeCanvasContent(canvasElements, canvasSize);
        const localUpdate = {
            title,
            slug,
            excerpt,
            content,
            status,
        };

        try {
            const savedPost = await updateBlogPost(activeSiteId, postId, {
                title,
                slug,
                excerpt,
                status,
                content: JSON.parse(content),
                meta: {
                    title,
                    description: excerpt,
                },
                revisionNote: 'Before blog editor save',
                updatedBy: 'admin',
            });
            setPost(savedPost);
            updatePost(postId, savedPost);
            setWorkflowNotice('Post saved and revision snapshot recorded.');
        } catch (error) {
            updatePost(postId, localUpdate);
            setPost((current) => current ? { ...current, ...localUpdate } : current);
            setSaveWarning(error instanceof Error
                ? `${error.message}. Changes were kept locally in this browser.`
                : 'Backend save failed. Changes were kept locally in this browser.');
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
    };

    const applyWorkflow = async (action: 'publish' | 'archive') => {
        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            const nextPost = action === 'publish'
                ? await publishBlogPost(activeSiteId, postId)
                : await archiveBlogPost(activeSiteId, postId);
            syncPostState(nextPost);
            setWorkflowNotice(action === 'publish' ? 'Post published.' : 'Post archived.');
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

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate({ to: '/blog' })} className="p-2 rounded-lg hover:bg-accent border border-border bg-background">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span>Edit Blog Post</span>
                </div>
            }
            description="Update your article."
        >
            <div className="max-w-[1400px] mx-auto pb-20">
                {(loadError || saveWarning) && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {saveWarning || `${loadError} Using the local post copy.`}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">

                    {/* Header Section */}
                    <div className="bg-card border border-border rounded-xl p-8 space-y-6 shadow-sm">

                        <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                                {/* Title Input */}
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Post Title"
                                    className="w-full text-4xl font-bold bg-transparent border-none placeholder:text-muted-foreground/50 focus:ring-0 px-0"
                                />
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <StatusBadge status={status} />
                                <button
                                    type="button"
                                    disabled={isPreviewBusy}
                                    onClick={() => void generatePreview()}
                                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Eye className="w-4 h-4" />
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    disabled={isWorkflowBusy || status === 'published'}
                                    onClick={() => void applyWorkflow('publish')}
                                    className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Publish
                                </button>
                                <button
                                    type="button"
                                    disabled={isWorkflowBusy || status === 'archived'}
                                    onClick={() => void applyWorkflow('archive')}
                                    className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Archive className="w-4 h-4" />
                                    Archive
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleDelete()}
                                    className="text-destructive hover:bg-destructive/10 p-2 rounded-lg"
                                    title="Delete Post"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Slug Input */}
                        <div className="flex items-center text-sm text-muted-foreground gap-2">
                            <span className="font-mono">/blog/</span>
                            <input
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 p-0 text-foreground font-mono w-full"
                                placeholder="post-slug"
                            />
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
                    </div>

                    {(workflowNotice || revisions.length > 0) && (
                        <div className="bg-card border border-border rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4 font-semibold">
                                <History className="w-4 h-4" />
                                <span>Revision History</span>
                            </div>
                            {workflowNotice && (
                                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                    {workflowNotice}
                                </div>
                            )}
                            {revisions.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                                    No saved revisions yet.
                                </div>
                            ) : (
                                <div className="grid gap-3 md:grid-cols-2">
                                    {revisions.slice(0, 6).map((revision) => (
                                        <div key={revision.id} className="rounded-lg border border-border px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium">{revision.note || 'Revision snapshot'}</div>
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
                        </div>
                    )}

                    {/* Canvas Area (The "Content Place") */}
                    <div className="h-[800px] border border-border rounded-xl overflow-hidden bg-background shadow-sm relative">
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
                    </div>

                    {/* Settings Panel */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-4 font-semibold">
                            <FileText className="w-4 h-4" />
                            <span>Post Settings</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium mb-2">Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as ContentStatus)}
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="scheduled">Scheduled</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Excerpt</label>
                                <textarea
                                    value={excerpt}
                                    onChange={(e) => setExcerpt(e.target.value)}
                                    rows={2}
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background resize-none"
                                    placeholder="Short summary..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 sticky bottom-4 z-50">
                        <button
                            type="button"
                            onClick={() => navigate({ to: '/blog' })}
                            className="px-6 py-2.5 rounded-lg border bg-background hover:bg-accent shadow-sm"
                        >
                            Discard
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !title}
                            className={cn(
                                'flex items-center gap-2 px-6 py-2.5 rounded-lg',
                                'bg-primary text-primary-foreground font-medium',
                                'hover:bg-primary/90 disabled:opacity-50 shadow-md'
                            )}
                        >
                            <Save className="w-4 h-4" />
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>

                </form>
            </div>
        </PageShell>
    );
}
