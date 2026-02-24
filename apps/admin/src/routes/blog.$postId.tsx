/**
 * BACKY CMS - EDIT BLOG POST (HYBRID LAYOUT)
 */

import { useState, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, FileText, Trash2 } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { cn } from '@/lib/utils';
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
    const { posts, updatePost, deletePost } = useStore();
    const post = posts.find((p) => p.id === postId);

    const [isLoading, setIsLoading] = useState(false);

    // Initialize State from Post
    const [title, setTitle] = useState(post?.title || '');
    const [slug, setSlug] = useState(post?.slug || '');
    const [excerpt, setExcerpt] = useState(post?.excerpt || '');
    const [status, setStatus] = useState<'draft' | 'published'>((post?.status as 'draft' | 'published') || 'draft');

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

    if (!post) {
        return (
            <PageShell title="Post Not Found" description="The article you requested doesn't exist.">
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
        await new Promise(resolve => setTimeout(resolve, 800));

        const content = serializeCanvasContent(canvasElements, canvasSize);

        updatePost(postId, {
            title,
            slug,
            excerpt,
            content,
            status,
        });

        navigate({ to: '/blog' });
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this post?')) {
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
                <form onSubmit={handleSubmit} className="space-y-8">

                    {/* Header Section */}
                    <div className="bg-card border border-border rounded-xl p-8 space-y-6 shadow-sm">

                        <div className="flex justify-between items-start">
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
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="text-destructive hover:bg-destructive/10 p-2 rounded-lg"
                                title="Delete Post"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
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
                    </div>

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
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
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
