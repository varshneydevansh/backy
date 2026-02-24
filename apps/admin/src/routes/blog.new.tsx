/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useState, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, FileText } from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

export const Route = createFileRoute('/blog/new')({
    component: NewBlogPostPage,
});

function NewBlogPostPage() {
    const navigate = useNavigate();
    const { addPost } = useStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [status, setStatus] = useState<'draft' | 'published'>('draft');

    // Canvas State
    const initialElements: CanvasElement[] = useMemo(() => [
        createCanvasElement('text', 50, 50, {
            width: 800,
            height: 200,
            props: {
                content: 'Start writing your story...',
                fontSize: 18,
                lineHeight: 1.6,
                color: '#334155',
            },
        }),
    ], []);

    const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(initialElements);
    const [canvasSize, setCanvasSize] = useState<CanvasSize>(DEFAULT_CANVAS_SIZE);

    // Dummy settings for CanvasEditor (since we manage settings externally)
    const dummySettings: PageSettings = {
        title,
        slug,
        status: 'draft',
        meta: { title, description: excerpt }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 800));

    // Serialize canvas elements for storage
        const content = serializeCanvasContent(canvasElements, canvasSize);

        addPost({
            title,
            slug,
            excerpt,
            content,
            status,
            author: user?.fullName || 'Anonymous',
        });

        navigate({ to: '/blog' });
    };

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate({ to: '/blog' })} className="p-2 rounded-lg hover:bg-accent border border-border bg-background">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span>New Blog Post</span>
                </div>
            }
            description="Write something amazing."
        >
            <div className="max-w-[1400px] mx-auto pb-20">
                <form onSubmit={handleSubmit} className="space-y-8">

                    {/* Header Section */}
                    <div className="bg-card border border-border rounded-xl p-8 space-y-6 shadow-sm">
                        {/* Title Input */}
                        <div>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value);
                                    if (!slug) {
                                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                                    }
                                }}
                                placeholder="Post Title"
                                className="w-full text-4xl font-bold bg-transparent border-none placeholder:text-muted-foreground/50 focus:ring-0 px-0"
                                autoFocus
                            />
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
                            onSave={() => { }} // Disabled internal save
                            onChange={(elements, _settings, size) => {
                                setCanvasElements(elements);
                                if (size) setCanvasSize(size);
                            }}
                            className="h-full w-full"
                            hideNavigation={true}
                            hideSettings={true}
                            hideSave={true}
                        />
                    </div>

                    {/* Settings & Actions */}
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
                            {isLoading ? 'Publishing...' : 'Publish Post'}
                        </button>
                    </div>

                </form>
            </div>
        </PageShell>
    );
}
