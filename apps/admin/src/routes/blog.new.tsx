/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, FileText } from 'lucide-react';
import {
    createBlogPost,
    listBlogAuthors,
    listBlogCategories,
    listBlogTags,
    type BlogAuthor,
    type BlogCategory,
    type BlogTag,
} from '@/lib/adminContentApi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
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
    const { sites, posts, addPost, setPosts } = useStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const activeSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';

    // Form State
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft');
    const [scheduledAt, setScheduledAt] = useState<string | null>(null);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [authors, setAuthors] = useState<BlogAuthor[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [selectedAuthorId, setSelectedAuthorId] = useState(user?.id || 'admin');

    useEffect(() => {
        let cancelled = false;

        const loadTaxonomy = async () => {
            try {
                const [backendCategories, backendTags, backendAuthors] = await Promise.all([
                    listBlogCategories(activeSiteId),
                    listBlogTags(activeSiteId),
                    listBlogAuthors(activeSiteId),
                ]);
                if (!cancelled) {
                    setCategories(backendCategories);
                    setTags(backendTags);
                    setAuthors(backendAuthors);
                    if (!selectedAuthorId || selectedAuthorId === 'admin') {
                        setSelectedAuthorId(backendAuthors[0]?.id || user?.id || 'admin');
                    }
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
    }, [activeSiteId, selectedAuthorId, user?.id]);

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
        scheduledAt: null,
        meta: { title, description: excerpt }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

    // Serialize canvas elements for storage
        const content = serializeCanvasContent(canvasElements, canvasSize);
        const input = {
            title,
            slug,
            excerpt,
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            author: user?.fullName || 'Anonymous',
            authorId: selectedAuthorId || user?.id || 'admin',
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            content: JSON.parse(content),
            meta: {
                title,
                description: excerpt,
            },
        };

        try {
            const created = await createBlogPost(activeSiteId, input);
            setPosts([created, ...posts.filter((post) => post.id !== created.id)]);
            navigate({ to: '/blog' });
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : 'Unable to create post');
            addPost({
                title,
                slug,
                excerpt,
                content,
                status,
                scheduledAt: status === 'scheduled' ? scheduledAt : null,
                author: authors.find((author) => author.id === selectedAuthorId)?.name || user?.fullName || 'Anonymous',
                categoryIds: selectedCategoryIds,
                tagIds: selectedTagIds,
            });
        } finally {
            setIsLoading(false);
        }
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
                {error && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {error}. A local draft copy was kept in this browser.
                    </div>
                )}

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
                                    onChange={(e) => {
                                        const nextStatus = e.target.value as typeof status;
                                        setStatus(nextStatus);
                                        if (nextStatus !== 'scheduled') {
                                            setScheduledAt(null);
                                        }
                                    }}
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="scheduled">Scheduled</option>
                                </select>
                            </div>
                            {status === 'scheduled' && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Publish Date</label>
                                    <input
                                        type="datetime-local"
                                        value={toDateTimeLocalValue(scheduledAt)}
                                        onChange={(e) => setScheduledAt(fromDateTimeLocalValue(e.target.value))}
                                        className="w-full px-4 py-2.5 rounded-lg border bg-background"
                                        required
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium mb-2">Author</label>
                                <select
                                    value={selectedAuthorId}
                                    onChange={(event) => setSelectedAuthorId(event.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg border bg-background"
                                >
                                    {authors.length === 0 ? (
                                        <option value={selectedAuthorId}>{user?.fullName || 'Admin'}</option>
                                    ) : authors.map((author) => (
                                        <option key={author.id} value={author.id}>
                                            {author.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Categories</label>
                                <div className="grid gap-2 rounded-lg border bg-background p-3">
                                    {categories.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No categories yet.</div>
                                    ) : categories.map((category) => (
                                        <label key={category.id} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={selectedCategoryIds.includes(category.id)}
                                                onChange={() => toggleSelection(category.id, selectedCategoryIds, setSelectedCategoryIds)}
                                            />
                                            <span>{category.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Tags</label>
                                <div className="grid gap-2 rounded-lg border bg-background p-3">
                                    {tags.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No tags yet.</div>
                                    ) : tags.map((tag) => (
                                        <label key={tag.id} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={selectedTagIds.includes(tag.id)}
                                                onChange={() => toggleSelection(tag.id, selectedTagIds, setSelectedTagIds)}
                                            />
                                            <span>{tag.name}</span>
                                        </label>
                                    ))}
                                </div>
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
