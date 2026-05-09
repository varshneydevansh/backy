/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, FileText, Globe, PenLine, Save, Tags, UserRound } from 'lucide-react';
import {
    createBlogPost,
    getAdminApiBase,
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
import { getCanvasHeightForElements, withPageChrome } from '@/lib/editorTemplateChrome';
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

interface BlogNewSearch {
    siteId?: string;
}

export const Route = createFileRoute('/blog/new')({
    validateSearch: (search: Record<string, unknown>): BlogNewSearch => ({
        siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
    }),
    component: NewBlogPostPage,
});

const BLOG_CREATE_CONTROL_AREAS = [
    {
        title: 'Editorial draft',
        detail: 'Title, slug, excerpt, status, and SEO summary for lists and feeds.',
        href: '#blog-create-draft',
    },
    {
        title: 'Design canvas',
        detail: 'Reusable component editor for the public article page.',
        href: '#blog-create-canvas',
    },
    {
        title: 'Publishing',
        detail: 'Draft, publish, schedule, readiness, and save controls.',
        href: '#blog-create-publish',
    },
    {
        title: 'Site and author',
        detail: 'Target website and author profile for the new article.',
        href: '#blog-create-owner',
    },
    {
        title: 'Taxonomy',
        detail: 'Categories and tags used by blog lists, filters, and feeds.',
        href: '#blog-create-taxonomy',
    },
    {
        title: 'API handoff',
        detail: 'Create endpoint, payload preview, frontend route, and canvas contract.',
        href: '#blog-create-api',
    },
] as const;

const BLOG_CREATE_WORKFLOW = [
    { label: 'Draft', detail: 'Write title, slug, excerpt, author, and taxonomy for the article record.' },
    { label: 'Design', detail: 'Use the canvas to build the public post layout with reusable components and bindings.' },
    { label: 'Check', detail: 'Confirm summary, route, schedule state, and canvas content before saving.' },
    { label: 'Ship', detail: 'Save draft, publish immediately, or schedule the post for the selected site.' },
] as const;

const createInitialBlogElements = (): CanvasElement[] => withPageChrome([
    createCanvasElement('section', 0, 0, {
        id: 'blog-article-hero',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 360,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'author', 'publishedAt', 'coverImage'] }],
        props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('text', 74, 64, {
                id: 'blog-article-kicker',
                width: 220,
                height: 28,
                props: { content: 'Article', fontSize: 13, fontWeight: '800', color: '#0f766e', textTransform: 'uppercase' },
            }),
            createCanvasElement('heading', 72, 104, {
                id: 'blog-article-heading',
                width: 660,
                height: 106,
                props: { content: 'Article title', level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
            }),
            createCanvasElement('paragraph', 76, 226, {
                id: 'blog-article-excerpt',
                width: 560,
                height: 72,
                props: { content: 'Use the excerpt for feed previews, SEO summaries, and the public article opening.', fontSize: 17, lineHeight: 1.55, color: '#475569' },
            }),
            createCanvasElement('box', 790, 70, {
                id: 'blog-article-cover',
                width: 300,
                height: 220,
                dataBindings: [{ source: 'blog', mode: 'current', fields: ['coverImage'] }],
                props: { backgroundColor: '#e2e8f0', borderRadius: 8, borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid' },
            }),
        ],
    }),
    createCanvasElement('section', 0, 360, {
        id: 'blog-article-body',
        width: DEFAULT_CANVAS_SIZE.width,
        height: 480,
        dataBindings: [{ source: 'blog', mode: 'current', fields: ['content'] }],
        props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
        children: [
            createCanvasElement('paragraph', 220, 72, {
                id: 'blog-article-lede',
                width: 760,
                height: 112,
                props: {
                    content: 'Start writing your story here. Replace this with rich text, media, quotes, product embeds, forms, or collection-backed sections.',
                    fontSize: 20,
                    lineHeight: 1.7,
                    color: '#334155',
                },
            }),
            createCanvasElement('quote', 260, 226, {
                id: 'blog-article-quote',
                width: 680,
                height: 120,
                props: {
                    content: 'Save reusable article sections and reuse them across posts when the publication has a repeated style.',
                    fontSize: 22,
                    lineHeight: 1.5,
                    color: '#0f172a',
                },
            }),
        ],
    }),
], {
    title: 'Blog article',
    variant: 'blog-article',
    navItems: ['Home', 'Blog', 'About', 'Contact'],
    headerActionLabel: 'Subscribe',
    footerCopy: 'Edit this article footer, save it as a reusable section, or bind it to publication navigation.',
});

function NewBlogPostPage() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const { sites, posts, setPosts } = useStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSiteId = search.siteId && sites.some((site) => (site.publicSiteId || site.id) === search.siteId)
        ? search.siteId
        : defaultSiteId;
    const [activeSiteId, setActiveSiteId] = useState(requestedSiteId);

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
    const initialElements: CanvasElement[] = useMemo(() => createInitialBlogElements(), []);
    const initialCanvasSize = useMemo<CanvasSize>(() => ({
        ...DEFAULT_CANVAS_SIZE,
        height: getCanvasHeightForElements(initialElements),
    }), [initialElements]);

    const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(initialElements);
    const [canvasSize, setCanvasSize] = useState<CanvasSize>(initialCanvasSize);
    const slugValue = slug || slugify(title);
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = sites.find((site) => (site.publicSiteId || site.id) === activeSiteId);
    const adminBlogUrl = useMemo(
        () => `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/blog`,
        [activeSiteId],
    );
    const routePath = `/blog/${slugValue || 'post-slug'}`;
    const readinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slugValue.trim().length > 0 },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: status !== 'scheduled' || Boolean(scheduledAt) },
    ];
    const readyCount = readinessChecks.filter((check) => check.complete).length;
    const readinessScore = Math.round((readyCount / readinessChecks.length) * 100);
    const canSubmit = title.trim().length > 0 && slugValue.trim().length > 0 && (status !== 'scheduled' || Boolean(scheduledAt));
    const submitLabel = status === 'published' ? 'Publish post' : status === 'scheduled' ? 'Schedule post' : 'Save draft';
    const createPayloadPreview = useMemo(() => ({
        title: title.trim() || 'Untitled post',
        slug: slugValue || 'post-slug',
        excerpt: excerpt.trim(),
        status,
        scheduledAt: status === 'scheduled' ? scheduledAt : null,
        authorId: selectedAuthorId || user?.id || 'admin',
        categoryIds: selectedCategoryIds,
        tagIds: selectedTagIds,
        content: `${canvasElements.length} root layer${canvasElements.length === 1 ? '' : 's'}`,
        siteChrome: 'editable header, navigation, article body, and footer seeded',
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
        },
    }), [
        canvasElements.length,
        canvasSize.height,
        canvasSize.width,
        excerpt,
        scheduledAt,
        selectedAuthorId,
        selectedCategoryIds,
        selectedTagIds,
        slugValue,
        status,
        title,
        user?.id,
    ]);
    const creationHandoff = useMemo(() => ({
        generatedAt: new Date().toISOString(),
        endpoint: {
            method: 'POST',
            url: adminBlogUrl,
        },
        site: {
            id: activeSiteId,
            name: selectedSite?.name || activeSiteId,
            slug: selectedSite?.slug || activeSiteId,
        },
        route: {
            path: routePath,
            slug: slugValue || 'post-slug',
            publicCollectionPath: '/blog',
        },
        readiness: {
            score: readinessScore,
            checks: readinessChecks,
        },
        editorial: {
            title: title.trim() || 'Untitled post',
            excerpt: excerpt.trim(),
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            author: selectedAuthor
                ? { id: selectedAuthor.id, name: selectedAuthor.name }
                : { id: selectedAuthorId || user?.id || 'admin', name: user?.fullName || 'Admin' },
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
        },
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            rootLayerCount: canvasElements.length,
            siteChrome: ['header', 'navigation', 'article hero', 'article body', 'footer'],
            supportsGrouping: true,
            supportsResponsivePreview: true,
            source: 'Backy CanvasEditor serialized content',
        },
        payloadPreview: createPayloadPreview,
        nextStep: 'Created posts open in the blog editor where publishing, revisions, taxonomy, SEO, and the public canvas can be refined.',
        guardrails: [
            'Backend owns duplicate slug validation per site.',
            'Scheduled posts require a publish date before they can be created.',
            'The public frontend should render the saved canvas content for this route instead of hardcoding blog templates.',
            'New posts start with editable site chrome and article layout blocks so headers, nav, body, and footer remain controlled by Backy.',
            'Categories, tags, and author IDs are site-scoped and should be read from Backy before rendering filters or bylines.',
        ],
    }), [
        activeSiteId,
        adminBlogUrl,
        canvasElements.length,
        canvasSize.height,
        canvasSize.width,
        createPayloadPreview,
        excerpt,
        readinessChecks,
        readinessScore,
        routePath,
        scheduledAt,
        selectedAuthor,
        selectedAuthorId,
        selectedCategoryIds,
        selectedSite?.name,
        selectedSite?.slug,
        selectedTagIds,
        slugValue,
        status,
        title,
        user?.fullName,
        user?.id,
    ]);
    const creationHandoffText = useMemo(() => JSON.stringify(creationHandoff, null, 2), [creationHandoff]);

    // Dummy settings for CanvasEditor (since we manage settings externally)
    const dummySettings: PageSettings = {
        title,
        slug: slugValue,
        status: 'draft',
        scheduledAt: null,
        meta: { title, description: excerpt }
    };

    const copyCreationText = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setError(null);
            setNotice(`${label} copied.`);
        } catch {
            setNotice(null);
            setError(value);
        }
    };

    const downloadCreationHandoff = () => {
        const blob = new Blob([creationHandoffText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${slugValue || 'new-post'}-backy-blog-create-handoff.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setError(null);
        setNotice('Blog creation handoff manifest downloaded.');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) {
            setError(status === 'scheduled' && !scheduledAt ? 'Choose a publish date before scheduling' : 'Add a title and URL slug before saving');
            setNotice(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setNotice(null);

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
            <div className="w-full pb-24">
                {error && (
                    <Notice tone="warning" className="mb-4">
                        {error}. The post was not created because the backend did not persist it.
                    </Notice>
                )}
                {notice && (
                    <Notice tone="success" className="mb-4">
                        {notice}
                    </Notice>
                )}

                <form onSubmit={handleSubmit} className="grid gap-5">
                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="blog-create-command-center">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold text-foreground">Post creation command center</h2>
                                    <span className={cn(
                                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                                        readinessScore >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                                    )}
                                    >
                                        {readinessScore}% ready
                                    </span>
                                </div>
                                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                    Create the article record and its public design in one workspace: editorial metadata, canvas layout, publishing state, author, taxonomy, and frontend route.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    onClick={() => void copyCreationText(creationHandoffText, 'Blog creation handoff manifest')}
                                    variant="outline"
                                    iconStart={<Copy className="size-4" />}
                                >
                                    Copy handoff
                                </Button>
                                <Button
                                    type="button"
                                    onClick={downloadCreationHandoff}
                                    variant="outline"
                                    iconStart={<Download className="size-4" />}
                                >
                                    Download JSON
                                </Button>
                                <Button type="submit" disabled={isLoading || !canSubmit} variant="primary" iconStart={<Save className="size-4" />}>
                                    {isLoading ? 'Saving...' : submitLabel}
                                </Button>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                            <div className="rounded-lg border border-border bg-background p-4">
                                <h3 className="text-sm font-semibold">Creation readiness</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Checks the minimum article data needed before Backy can save, publish, or schedule this post.
                                </p>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn('h-full rounded-full', readinessScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                                        style={{ width: `${readinessScore}%` }}
                                    />
                                </div>
                                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                                    {readinessChecks.map((check) => (
                                        <BlogCreateReadinessCheck key={check.label} label={check.label} ready={check.complete} />
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-lg border border-border bg-background p-4">
                                <div className="flex items-center gap-2">
                                    <FileText className="size-4 text-primary" />
                                    <h3 className="text-sm font-semibold">Create-to-publish workflow</h3>
                                </div>
                                <div className="mt-3 grid gap-2">
                                    {BLOG_CREATE_WORKFLOW.map((step, index) => (
                                        <BlogCreateWorkflowStep key={step.label} index={index + 1} {...step} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-lg border border-border bg-background p-4">
                            <h3 className="text-sm font-semibold">Post creation control map</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Jump to draft fields, canvas design, publishing, ownership, and taxonomy.</p>
                            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                                {BLOG_CREATE_CONTROL_AREAS.map((area) => (
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
                    </section>

                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="min-w-0 space-y-6">
                        <Panel id="blog-create-draft" className="overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="Editorial draft"
                                description="Title, canonical URL, and public summary."
                                icon={<PenLine className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="blog-create-title" className="text-xs font-medium text-muted-foreground">Post title</label>
                            <input
                                id="blog-create-title"
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
                            <label htmlFor="blog-create-slug" className="font-mono text-muted-foreground">/blog/</label>
                            <input
                                id="blog-create-slug"
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0"
                                placeholder="post-slug"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="blog-create-excerpt" className="text-xs font-medium text-muted-foreground">Excerpt</label>
                            <textarea
                                id="blog-create-excerpt"
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

                        <div id="blog-create-canvas" className="scroll-mt-24">
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
                                            Header/nav/footer seeded
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            Cmd/Ctrl+G grouping
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            Cmd/Ctrl+A siblings
                                        </span>
                                    </>
                                }
                                className="relative min-h-[760px] xl:h-[calc(100vh-168px)] xl:min-h-[860px]"
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
                    </div>

                    <aside className="grid gap-4 xl:grid-cols-3 2xl:sticky 2xl:top-5 2xl:block 2xl:self-start 2xl:space-y-4">
                        <Panel id="blog-create-publish" className="scroll-mt-24">
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

                        <Panel id="blog-create-owner" className="scroll-mt-24">
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

                        <Panel id="blog-create-taxonomy" className="scroll-mt-24">
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

                        <Panel id="blog-create-api" className="scroll-mt-24">
                            <PanelHeader
                                title="API handoff"
                                description="Create endpoint and frontend payload shape."
                                icon={<Code2 className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Create endpoint</div>
                                    <div className="mt-2 break-all font-mono text-xs text-foreground">{adminBlogUrl}</div>
                                </div>

                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-xs font-medium text-muted-foreground">Public route</div>
                                            <div className="mt-1 font-mono text-xs text-foreground">{routePath}</div>
                                        </div>
                                        <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">POST</span>
                                    </div>
                                </div>

                                <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify(createPayloadPreview, null, 2)}
                                </pre>

                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        onClick={() => void copyCreationText(adminBlogUrl, 'Blog create API URL')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy URL
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => void copyCreationText(creationHandoffText, 'Blog creation handoff manifest')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy handoff
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>
                    </aside>
                    </div>

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

function BlogCreateReadinessCheck({ label, ready }: { label: string; ready: boolean }) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2">
                {ready ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                )}
                <div>
                    <div className="text-sm font-semibold text-foreground">{label}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {ready ? 'Ready' : 'Needs work'}
                    </div>
                </div>
            </div>
        </div>
    );
}

function BlogCreateWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
    return (
        <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index}
            </span>
            <div>
                <div className="text-sm font-semibold text-foreground">{label}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
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
