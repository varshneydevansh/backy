/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CalendarClock, CheckCircle2, Globe, PenLine, Save, Tags, UserRound } from 'lucide-react';
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
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { cn } from '@/lib/utils';
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
    const { sites, posts, setPosts } = useStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSiteId, setActiveSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');

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
                    if (!selectedAuthorId || selectedAuthorId === 'admin' || !backendAuthors.some((author) => author.id === selectedAuthorId)) {
                        setSelectedAuthorId(backendAuthors[0]?.id || user?.id || 'admin');
                    }
                }
            } catch {
                if (!cancelled) {
                    setCategories([]);
                    setTags([]);
                    setAuthors([]);
                }
            }
        };

        void loadTaxonomy();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, selectedAuthorId, user?.id]);

    useEffect(() => {
        if (sites.length > 0 && !sites.some((site) => (site.publicSiteId || site.id) === activeSiteId)) {
            setActiveSiteId(sites[0].publicSiteId || sites[0].id);
        }
    }, [activeSiteId, sites]);

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
    const slugValue = slug || slugify(title);
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = sites.find((site) => (site.publicSiteId || site.id) === activeSiteId);
    const readinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slugValue.trim().length > 0 },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: status !== 'scheduled' || Boolean(scheduledAt) },
    ];
    const readyCount = readinessChecks.filter((check) => check.complete).length;
    const canSubmit = title.trim().length > 0 && slugValue.trim().length > 0 && (status !== 'scheduled' || Boolean(scheduledAt));
    const submitLabel = status === 'published' ? 'Publish post' : status === 'scheduled' ? 'Schedule post' : 'Save draft';

    // Dummy settings for CanvasEditor (since we manage settings externally)
    const dummySettings: PageSettings = {
        title,
        slug: slugValue,
        status: 'draft',
        scheduledAt: null,
        meta: { title, description: excerpt }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) {
            setError(status === 'scheduled' && !scheduledAt ? 'Choose a publish date before scheduling' : 'Add a title and URL slug before saving');
            return;
        }

        setIsLoading(true);
        setError(null);

    // Serialize canvas elements for storage
        const content = serializeCanvasContent(canvasElements, canvasSize, undefined, {
            documentId: `new-post-${slugValue || title || 'draft'}`,
            kind: 'post',
            title,
            slug: slugValue,
            status,
            locale: 'en',
        });
        const input = {
            title,
            slug: slugValue,
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
            description="Create a post and design its public page from the same workspace."
        >
            <div className="mx-auto w-full max-w-[1760px] pb-24">
                {error && (
                    <Notice tone="warning" className="mb-4">
                        {error}. The post was not created because the backend did not persist it.
                    </Notice>
                )}

                <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">

                    <div className="min-w-0 space-y-6">
                        <Panel className="overflow-hidden">
                            <PanelHeader
                                title="Editorial draft"
                                description="Title, canonical URL, and public summary."
                                icon={<PenLine className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Post title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value);
                                    if (!slug) {
                                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                                    }
                                }}
                                placeholder="Untitled post"
                                className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0"
                                autoFocus
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
                                placeholder="Write the summary that appears in blog lists, feeds, and SEO previews."
                            />
                            <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                        </div>
                            </PanelContent>
                        </Panel>

                        <EditorWorkspaceFrame
                            title="Post design canvas"
                            description="Use components, layers, grouping, resizing, reusable sections, and data bindings to design the public post page."
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
                                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted p-1">
                                    {(['draft', 'published', 'scheduled'] as const).map((nextStatus) => (
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
                                                'rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors',
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

                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                                        <CheckCircle2 className="size-4 text-primary" />
                                        Readiness {readyCount}/{readinessChecks.length}
                                    </div>
                                    <div className="grid gap-2">
                                        {readinessChecks.map((check) => (
                                            <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
                                                <span className="text-muted-foreground">{check.label}</span>
                                                <span className={cn('font-medium', check.complete ? 'text-success' : 'text-warning')}>
                                                    {check.complete ? 'Ready' : 'Needs work'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Button type="submit" disabled={isLoading || !canSubmit} variant="primary" iconStart={<Save className="size-4" />} className="w-full">
                                        {isLoading ? 'Saving...' : submitLabel}
                                    </Button>
                                    <Button onClick={() => navigate({ to: '/blog' })} variant="outline" className="w-full">
                                        Discard
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel>
                            <PanelHeader title="Site and author" icon={<Globe className="size-4" />} />
                            <PanelContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Target site</label>
                                    <select
                                        value={activeSiteId}
                                        onChange={(event) => {
                                            setActiveSiteId(event.target.value);
                                            setSelectedCategoryIds([]);
                                            setSelectedTagIds([]);
                                        }}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
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
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Author</label>
                                    <div className="relative">
                                        <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <select
                                            value={selectedAuthorId}
                                            onChange={(event) => setSelectedAuthorId(event.target.value)}
                                            className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm"
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
                                    <div className="text-xs text-muted-foreground">
                                        {selectedAuthor?.postCount ?? 0} existing post{(selectedAuthor?.postCount ?? 0) === 1 ? '' : 's'}
                                    </div>
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
                    </aside>

                </form>
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
