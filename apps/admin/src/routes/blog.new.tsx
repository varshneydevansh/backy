/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, Eye, FileText, Globe, Image as ImageIcon, PenLine, RefreshCw, Save, SearchCheck, Tags, UserRound, X } from 'lucide-react';
import {
    createBlogPost,
    createBlogPostPreview,
    getAdminApiBase,
    listBlogPosts,
    listBlogAuthors,
    listBlogCategories,
    listBlogTags,
    type BlogPostInput,
    type BlogAuthor,
    type BlogCategory,
    type BlogTag,
} from '@/lib/adminContentApi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
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
        title: 'SEO',
        detail: 'Search title, canonical path, description, Open Graph image, and robots controls.',
        href: '#blog-create-seo',
    },
    {
        title: 'Site and author',
        detail: 'Target website and author profile for the new article.',
        href: '#blog-create-owner',
    },
    {
        title: 'Featured media',
        detail: 'Select the image used by blog lists, social previews, feeds, and custom frontend cards.',
        href: '#blog-create-media',
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
    const { sites, posts, media, setPosts } = useStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingPosts, setIsCheckingPosts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isPreviewAfterCreateBusy, setIsPreviewAfterCreateBusy] = useState(false);
    const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
    const [routeCheckRetry, setRouteCheckRetry] = useState(0);
    const [existingBlogPosts, setExistingBlogPosts] = useState<BlogPost[]>([]);
    const [isFeaturedMediaOpen, setIsFeaturedMediaOpen] = useState(false);
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSite = search.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
        : undefined;
    const requestedSiteId = requestedSite?.publicSiteId || requestedSite?.id || defaultSiteId;
    const [activeSiteId, setActiveSiteId] = useState(requestedSiteId);

    // Form State
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft');
    const [scheduledAt, setScheduledAt] = useState<string | null>(null);
    const [seoTitle, setSeoTitle] = useState('');
    const [seoDescription, setSeoDescription] = useState('');
    const [canonicalPath, setCanonicalPath] = useState('');
    const [featuredImageId, setFeaturedImageId] = useState<string | null>(null);
    const [ogImage, setOgImage] = useState('');
    const [noIndex, setNoIndex] = useState(false);
    const [noFollow, setNoFollow] = useState(false);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [authors, setAuthors] = useState<BlogAuthor[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [selectedAuthorId, setSelectedAuthorId] = useState(user?.id || 'admin');
    const isCreateBusy = isLoading || isPreviewAfterCreateBusy || isCheckingPosts;

    const clearCreationFeedback = () => {
        setError((current) => current ? null : current);
        setNotice((current) => current ? null : current);
    };

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
        let cancelled = false;

        const loadExistingPosts = async () => {
            setIsCheckingPosts(true);
            setRouteCheckError(null);

            try {
                const backendPosts = await listBlogPosts(activeSiteId);
                if (!cancelled) {
                    setExistingBlogPosts(backendPosts);
                    setRouteCheckError(null);
                    setError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : 'Unable to check existing blog routes for this site';
                    setExistingBlogPosts([]);
                    setRouteCheckError(message);
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsCheckingPosts(false);
                }
            }
        };

        void loadExistingPosts();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, routeCheckRetry]);

    useEffect(() => {
        if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, activeSiteId))) {
            const fallbackSiteId = sites[0].publicSiteId || sites[0].id;
            setActiveSiteId(fallbackSiteId);
            navigate({ to: '/blog/new', search: { siteId: fallbackSiteId }, replace: true });
        }
    }, [activeSiteId, navigate, sites]);

    useEffect(() => {
        const nextRequestedSite = search.siteId
            ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
            : undefined;
        const nextSiteId = nextRequestedSite?.publicSiteId || nextRequestedSite?.id || search.siteId || defaultSiteId;
        if (nextSiteId === activeSiteId) return;

        setActiveSiteId(nextSiteId);
        setSelectedCategoryIds([]);
        setSelectedTagIds([]);
        setError(null);
        setNotice(null);
    }, [activeSiteId, defaultSiteId, search.siteId, sites]);

    const selectBlogSite = (nextSiteId: string) => {
        if (isCreateBusy) return;

        setActiveSiteId(nextSiteId);
        setSelectedCategoryIds([]);
        setSelectedTagIds([]);
        setFeaturedImageId(null);
        setOgImage('');
        clearCreationFeedback();
        navigate({ to: '/blog/new', search: { siteId: nextSiteId }, replace: true });
    };

    const toggleSelection = (
        id: string,
        selectedIds: string[],
        setSelectedIds: Dispatch<SetStateAction<string[]>>,
    ) => {
        if (isCreateBusy) return;

        clearCreationFeedback();
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
    const selectedSite = sites.find((site) => siteMatchesIdentifier(site, activeSiteId));
    const adminBlogUrl = useMemo(
        () => `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/blog`,
        [activeSiteId],
    );
    const routePath = `/blog/${slugValue || 'post-slug'}`;
    const routeConflict = useMemo(
        () => slugValue.trim()
            ? existingBlogPosts.find((post) => slugify(post.slug) === slugValue) || null
            : null,
        [existingBlogPosts, slugValue],
    );
    const selectedFeaturedImage = featuredImageId
        ? media.find((asset) => asset.id === featuredImageId) || null
        : null;
    const selectedFeaturedImageUrl = selectedFeaturedImage
        ? selectedFeaturedImage.url || getPublicMediaFileUrl(selectedFeaturedImage.id, activeSiteId)
        : null;
    const normalizedCanonicalPath = normalizeCanonicalPath(canonicalPath || routePath);
    const canonicalValid = normalizedCanonicalPath.startsWith('/');
    const effectiveSeoTitle = seoTitle.trim() || title.trim();
    const effectiveSeoDescription = seoDescription.trim() || excerpt.trim();
    const readinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slugValue.trim().length > 0 },
        { label: 'Route', complete: !isCheckingPosts && !routeCheckError && !routeConflict },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'SEO', complete: effectiveSeoTitle.length > 0 && effectiveSeoDescription.length >= 50 && canonicalValid },
        { label: 'Featured image', complete: Boolean(featuredImageId) },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: status !== 'scheduled' || Boolean(scheduledAt) },
    ];
    const readyCount = readinessChecks.filter((check) => check.complete).length;
    const readinessScore = Math.round((readyCount / readinessChecks.length) * 100);
    const canCreateDraft = title.trim().length > 0
        && slugValue.trim().length > 0
        && !isCheckingPosts
        && !routeCheckError
        && !routeConflict
        && canonicalValid;
    const canSubmit = canCreateDraft
        && (status !== 'scheduled' || Boolean(scheduledAt));
    const submitLabel = status === 'published' ? 'Publish post' : status === 'scheduled' ? 'Schedule post' : 'Save draft';
    const createPayloadPreview = useMemo(() => ({
        title: title.trim() || 'Untitled post',
        slug: slugValue || 'post-slug',
        routeAvailability: routeCheckError
            ? { status: 'unverified', message: routeCheckError }
            : routeConflict
                ? { status: 'conflict', postId: routeConflict.id, title: routeConflict.title, path: `/blog/${routeConflict.slug}` }
                : { status: 'available', checkedPosts: existingBlogPosts.length },
        excerpt: excerpt.trim(),
        status,
        scheduledAt: status === 'scheduled' ? scheduledAt : null,
        seo: {
            title: effectiveSeoTitle || 'Untitled post',
            description: effectiveSeoDescription,
            canonical: normalizedCanonicalPath,
            ogImage: ogImage.trim() || selectedFeaturedImageUrl || null,
            robots: {
                index: !noIndex,
                follow: !noFollow,
            },
        },
        featuredImageId,
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
        existingBlogPosts.length,
        excerpt,
        effectiveSeoDescription,
        effectiveSeoTitle,
        featuredImageId,
        normalizedCanonicalPath,
        noFollow,
        noIndex,
        ogImage,
        selectedFeaturedImage,
        selectedFeaturedImageUrl,
        routeCheckError,
        routeConflict,
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
            availability: routeCheckError
                ? {
                    status: 'unverified',
                    message: routeCheckError,
                }
                : routeConflict
                    ? {
                        status: 'conflict',
                        postId: routeConflict.id,
                        title: routeConflict.title,
                        path: `/blog/${routeConflict.slug}`,
                    }
                    : {
                        status: 'available',
                        checkedPosts: existingBlogPosts.length,
                    },
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
            seo: {
                title: effectiveSeoTitle || 'Untitled post',
                description: effectiveSeoDescription,
                canonical: normalizedCanonicalPath,
                ogImage: ogImage.trim() || selectedFeaturedImageUrl || null,
                robots: {
                    index: !noIndex,
                    follow: !noFollow,
                },
            },
            featuredImageId,
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
        effectiveSeoDescription,
        effectiveSeoTitle,
        existingBlogPosts.length,
        excerpt,
        featuredImageId,
        normalizedCanonicalPath,
        noFollow,
        noIndex,
        ogImage,
        readinessChecks,
        readinessScore,
        routeCheckError,
        routeConflict,
        routePath,
        scheduledAt,
        selectedAuthor,
        selectedFeaturedImage,
        selectedFeaturedImageUrl,
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
        meta: {
            title: effectiveSeoTitle || title,
            description: effectiveSeoDescription || excerpt,
        }
    };

    const copyCreationText = async (value: string, label: string) => {
        if (isCreateBusy) return;

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
        if (isCreateBusy) return;

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

    const buildPostInput = (nextStatus: BlogPostInput['status'] = status): BlogPostInput => {
        const resolvedStatus = nextStatus || status;
        const content = serializeCanvasContent(canvasElements, canvasSize, undefined, {
            documentId: `new-post-${slugValue || title || 'draft'}`,
            kind: 'post',
            title,
            slug: slugValue,
            status: resolvedStatus,
            locale: 'en',
        });

        return {
            title,
            slug: slugValue,
            excerpt,
            status: resolvedStatus,
            scheduledAt: resolvedStatus === 'scheduled' ? scheduledAt : null,
            featuredImageId,
            authorId: selectedAuthorId || user?.id || 'admin',
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            content: JSON.parse(content),
            meta: {
                title: effectiveSeoTitle || title,
                description: effectiveSeoDescription || excerpt,
                canonical: normalizedCanonicalPath,
                ogImage: ogImage.trim() || selectedFeaturedImageUrl || null,
                noIndex,
                noFollow,
            },
        };
    };

    const getCreateBlockedMessage = (mode: 'save' | 'preview') => (
        isCheckingPosts
            ? 'Checking existing blog routes before saving'
            : routeCheckError
                ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
                : routeConflict
                    ? `The ${routePath} route is already used by "${routeConflict.title}". Choose another slug or edit that post first.`
                    : !canonicalValid
                        ? 'Canonical path must start with / before saving'
                        : mode === 'save' && status === 'scheduled' && !scheduledAt
                            ? 'Choose a publish date before scheduling'
                            : 'Add a title and URL slug before saving'
    );

    const handleCreatePreview = async () => {
        if (isCreateBusy) return;

        if (!canCreateDraft) {
            setError(getCreateBlockedMessage('preview'));
            setNotice(null);
            return;
        }

        setIsPreviewAfterCreateBusy(true);
        setError(null);
        setNotice(null);
        setRouteCheckError(null);

        let created: BlogPost | null = null;

        try {
            created = await createBlogPost(activeSiteId, buildPostInput('draft'));
            setPosts([created, ...posts.filter((post) => post.id !== created?.id)]);

            const preview = await createBlogPostPreview(activeSiteId, created.id);
            window.open(preview.url, '_blank', 'noopener,noreferrer');
            navigate({ to: '/blog/$postId', params: { postId: created.id }, search: { siteId: activeSiteId } });
        } catch (createError) {
            if (created) {
                navigate({ to: '/blog/$postId', params: { postId: created.id }, search: { siteId: activeSiteId } });
                return;
            }

            setError(createError instanceof Error
                ? `${createError.message}. The preview draft was not created.`
                : 'Unable to create preview draft. The post was not persisted.');
        } finally {
            setIsPreviewAfterCreateBusy(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isCreateBusy) return;

        if (!canSubmit) {
            setError(getCreateBlockedMessage('save'));
            setNotice(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setNotice(null);
        setRouteCheckError(null);

        try {
            const created = await createBlogPost(activeSiteId, buildPostInput(status));
            setPosts([created, ...posts.filter((post) => post.id !== created.id)]);
            navigate({ to: '/blog', search: { siteId: activeSiteId } });
        } catch (createError) {
            setError(createError instanceof Error
                ? `${createError.message}. The post was not created because the backend did not persist it.`
                : 'Unable to create post. The post was not persisted.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            if (!isCreateBusy) {
                                void navigate({ to: '/blog', search: { siteId: activeSiteId } });
                            }
                        }}
                        disabled={isCreateBusy}
                        className="rounded-lg border border-border bg-background p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
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
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{error}</span>
                            {routeCheckError && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isCreateBusy}
                                    onClick={() => {
                                        if (isCreateBusy) return;
                                        setRouteCheckRetry((value) => value + 1);
                                    }}
                                    iconStart={<RefreshCw className={cn('size-3.5', isCheckingPosts && 'animate-spin')} />}
                                >
                                    Retry route check
                                </Button>
                            )}
                        </div>
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
                                    disabled={isCreateBusy}
                                    onClick={() => void copyCreationText(creationHandoffText, 'Blog creation handoff manifest')}
                                    variant="outline"
                                    iconStart={<Copy className="size-4" />}
                                >
                                    Copy handoff
                                </Button>
                                <Button
                                    type="button"
                                    disabled={isCreateBusy}
                                    onClick={downloadCreationHandoff}
                                    variant="outline"
                                    iconStart={<Download className="size-4" />}
                                >
                                    Download JSON
                                </Button>
                                <Button
                                    type="button"
                                    disabled={isCreateBusy || !canCreateDraft}
                                    onClick={() => void handleCreatePreview()}
                                    variant="outline"
                                    iconStart={<Eye className="size-4" />}
                                >
                                    {isPreviewAfterCreateBusy ? 'Creating preview...' : 'Save draft and preview'}
                                </Button>
                                <Button type="submit" disabled={isCreateBusy || !canSubmit} variant="primary" iconStart={<Save className="size-4" />}>
                                    {isLoading ? 'Saving...' : isCheckingPosts ? 'Checking routes...' : submitLabel}
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
                                    clearCreationFeedback();
                                    setTitle(e.target.value);
                                    if (!slug) {
                                        setSlug(slugify(e.target.value));
                                    }
                                }}
                                placeholder="Untitled post"
                                disabled={isCreateBusy}
                                className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                autoFocus
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                            <label htmlFor="blog-create-slug" className="font-mono text-muted-foreground">/blog/</label>
                            <input
                                id="blog-create-slug"
                                type="text"
                                value={slug}
                                onChange={(e) => {
                                    clearCreationFeedback();
                                    setSlug(e.target.value);
                                }}
                                disabled={isCreateBusy}
                                className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="post-slug"
                            />
                        </div>
                        {(routeConflict || routeCheckError) && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                {routeCheckError
                                    ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
                                    : `${routePath} is already used by "${routeConflict?.title}". Choose another slug or edit that post first.`}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="blog-create-excerpt" className="text-xs font-medium text-muted-foreground">Excerpt</label>
                            <textarea
                                id="blog-create-excerpt"
                                value={excerpt}
                                onChange={(e) => {
                                    clearCreationFeedback();
                                    setExcerpt(e.target.value);
                                }}
                                rows={3}
                                disabled={isCreateBusy}
                                className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="Write the summary that appears in blog lists, feeds, and SEO previews."
                            />
                            <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                        </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-seo" className="overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="SEO and discovery"
                                description="Search metadata, canonical path, Open Graph image, and robots controls for hosted pages and external frontends."
                                icon={<SearchCheck className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <div className="space-y-2">
                                        <label htmlFor="blog-create-seo-title" className="text-xs font-medium text-muted-foreground">Search title</label>
                                        <input
                                            id="blog-create-seo-title"
                                            type="text"
                                            value={seoTitle}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setSeoTitle(e.target.value);
                                            }}
                                            disabled={isCreateBusy}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={title || 'Search result title'}
                                        />
                                        <div className="text-xs text-muted-foreground">{effectiveSeoTitle.length} characters</div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="blog-create-canonical" className="text-xs font-medium text-muted-foreground">Canonical path</label>
                                        <input
                                            id="blog-create-canonical"
                                            type="text"
                                            value={canonicalPath}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setCanonicalPath(e.target.value);
                                            }}
                                            disabled={isCreateBusy}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={routePath}
                                        />
                                        <div className={cn('text-xs', canonicalValid ? 'text-muted-foreground' : 'text-amber-700')}>
                                            {normalizedCanonicalPath}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="blog-create-seo-description" className="text-xs font-medium text-muted-foreground">Search description</label>
                                    <textarea
                                        id="blog-create-seo-description"
                                        value={seoDescription}
                                        onChange={(e) => {
                                            clearCreationFeedback();
                                            setSeoDescription(e.target.value);
                                        }}
                                        rows={3}
                                        disabled={isCreateBusy}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={excerpt || 'Describe the article for search, social previews, feeds, and generated frontends.'}
                                    />
                                    <div className={cn('text-xs', effectiveSeoDescription.length >= 50 ? 'text-muted-foreground' : 'text-amber-700')}>
                                        {effectiveSeoDescription.length} characters. Aim for at least 50.
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="blog-create-og-image" className="text-xs font-medium text-muted-foreground">Open Graph image URL</label>
                                    <input
                                        id="blog-create-og-image"
                                        type="url"
                                        value={ogImage}
                                        onChange={(e) => {
                                            clearCreationFeedback();
                                            setOgImage(e.target.value);
                                        }}
                                        disabled={isCreateBusy}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={selectedFeaturedImageUrl || 'https://...'}
                                    />
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noIndex}
                                            onChange={(e) => {
                                                clearCreationFeedback();
                                                setNoIndex(e.target.checked);
                                            }}
                                            disabled={isCreateBusy}
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
                                                clearCreationFeedback();
                                                setNoFollow(e.target.checked);
                                            }}
                                            disabled={isCreateBusy}
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
                                className="relative min-h-[780px] xl:h-[calc(100vh-120px)] xl:min-h-[900px]"
                            >
                                <CanvasEditor
                                    mode="blog"
                                    initialElements={initialElements}
                                    initialSettings={dummySettings}
                                    initialSize={canvasSize}
                                    onSave={() => { }}
                                    onChange={(elements, _settings, size) => {
                                        if (isCreateBusy) return;
                                        clearCreationFeedback();
                                        setCanvasElements(elements);
                                        if (size) setCanvasSize(size);
                                    }}
                                    className="h-full w-full"
                                    hideNavigation={true}
                                    hideSettings={true}
                                    hideSave={true}
                                />
                                {isCreateBusy && (
                                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-sm">
                                        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm">
                                            Saving post design...
                                        </div>
                                    </div>
                                )}
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
                                                if (isCreateBusy) return;

                                                clearCreationFeedback();
                                                setStatus(nextStatus);
                                                if (nextStatus !== 'scheduled') {
                                                    setScheduledAt(null);
                                                }
                                            }}
                                            disabled={isCreateBusy}
                                            className={cn(
                                                'rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
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
                                                if (isCreateBusy) return;

                                                clearCreationFeedback();
                                                setScheduledAt(fromDateTimeLocalValue(e.target.value));
                                            }}
                                            disabled={isCreateBusy}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
                                    <Button type="submit" disabled={isCreateBusy || !canSubmit} variant="primary" iconStart={<Save className="size-4" />} className="w-full">
                                        {isLoading ? 'Saving...' : isCheckingPosts ? 'Checking routes...' : submitLabel}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => void handleCreatePreview()}
                                        disabled={isCreateBusy || !canCreateDraft}
                                        variant="outline"
                                        iconStart={<Eye className="size-4" />}
                                        className="w-full"
                                    >
                                        {isPreviewAfterCreateBusy ? 'Creating preview...' : 'Save draft and preview'}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            if (!isCreateBusy) {
                                                void navigate({ to: '/blog', search: { siteId: activeSiteId } });
                                            }
                                        }}
                                        disabled={isCreateBusy}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        Discard
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-owner" className="scroll-mt-24">
                            <PanelHeader title="Site and author" icon={<Globe className="size-4" />} />
                            <PanelContent className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="blog-create-active-site" className="text-xs font-medium text-muted-foreground">Target site</label>
                                    <select
                                        id="blog-create-active-site"
                                        value={activeSiteId}
                                        onChange={(event) => selectBlogSite(event.target.value)}
                                        disabled={isCreateBusy}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
                                            onChange={(event) => {
                                                if (isCreateBusy) return;

                                                clearCreationFeedback();
                                                setSelectedAuthorId(event.target.value);
                                            }}
                                            disabled={isCreateBusy}
                                            className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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

                        <Panel id="blog-create-media" className="scroll-mt-24">
                            <PanelHeader
                                title="Featured media"
                                description="Image used by cards, feeds, Open Graph previews, and generated frontend lists."
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
                                                : 'Select or upload an image scoped to this new post workflow.'}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsFeaturedMediaOpen(true)}
                                        disabled={isCreateBusy}
                                        iconStart={<ImageIcon className="size-4" />}
                                    >
                                        {featuredImageId ? 'Replace image' : 'Select image'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (isCreateBusy) return;

                                            clearCreationFeedback();
                                            setFeaturedImageId(null);
                                            setOgImage('');
                                        }}
                                        disabled={isCreateBusy || !featuredImageId}
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

                        <Panel id="blog-create-taxonomy" className="scroll-mt-24">
                            <PanelHeader title="Taxonomy" icon={<Tags className="size-4" />} />
                            <PanelContent className="space-y-5">
                                <TaxonomyPicker
                                    title="Categories"
                                    emptyLabel="No categories yet."
                                    items={categories}
                                    selectedIds={selectedCategoryIds}
                                    onToggle={(id) => toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)}
                                    disabled={isCreateBusy}
                                />
                                <TaxonomyPicker
                                    title="Tags"
                                    emptyLabel="No tags yet."
                                    items={tags}
                                    selectedIds={selectedTagIds}
                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
                                    disabled={isCreateBusy}
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
                                            <div className={cn('mt-1 text-xs font-medium', routeCheckError || routeConflict ? 'text-amber-700' : 'text-emerald-700')}>
                                                {routeCheckError
                                                    ? 'Route not verified'
                                                    : routeConflict
                                                        ? `Conflicts with ${routeConflict.title}`
                                                        : `${existingBlogPosts.length} existing post${existingBlogPosts.length === 1 ? '' : 's'} checked`}
                                            </div>
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
                                        disabled={isCreateBusy}
                                        onClick={() => void copyCreationText(adminBlogUrl, 'Blog create API URL')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy URL
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={isCreateBusy}
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

                <MediaLibraryModal
                    isOpen={isFeaturedMediaOpen}
                    onClose={() => {
                        if (!isCreateBusy) {
                            setIsFeaturedMediaOpen(false);
                        }
                    }}
                    onSelect={(asset) => {
                        if (isCreateBusy) return;

                        const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
                        clearCreationFeedback();
                        setFeaturedImageId(asset.id);
                        setOgImage(deliveryUrl);
                        setNotice(`Selected ${asset.name} as the featured image.`);
                        setIsFeaturedMediaOpen(false);
                    }}
                    allowedTypes="image"
                    initialUploadFilter="image"
                    mediaContext={{
                        siteId: activeSiteId,
                        scope: 'post',
                        targetId: slugValue || title || 'new-post',
                        targetLabel: title || 'New blog post',
                    }}
                    allowScopeSwitcher={true}
                />
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

    if (/^https?:\/\//i.test(trimmed)) {
        try {
            return new URL(trimmed).pathname || '/';
        } catch {
            return trimmed;
        }
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

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
