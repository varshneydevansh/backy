/**
 * BACKY CMS - NEW BLOG POST (HYBRID LAYOUT)
 */

import { useEffect, useState, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, Eye, FileText, Globe, Image as ImageIcon, LayoutTemplate, Maximize2, Minimize2, PenLine, RefreshCw, Save, SearchCheck, Tags, UserRound, X } from 'lucide-react';
import {
    createBlogPost,
    createBlogPostPreview,
    getAdminApiBase,
    getSiteFrontendDesign,
    getUserPermissions,
    listBlogPosts,
    listBlogAuthors,
    listBlogCategories,
    listBlogTags,
    type AdminUserPermissionMatrix,
    type BlogPostInput,
    type BlogAuthor,
    type BlogCategory,
    type BlogTag,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type BlogPost } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor, collectInteractiveReadinessIssues } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { useAuthStore, type User } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import { getCanvasHeightForElements, withPageChrome } from '@/lib/editorTemplateChrome';
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import type { SiteSettings } from '@backy-cms/core';
import {
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';

interface BlogNewSearch {
    siteId?: string;
    focus?: 'canvas';
    designTemplate?: string;
}

type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];

interface BlogCreateAutosaveDraft {
    version: 1;
    savedAt: string;
    activeSiteId: string;
    title: string;
    slug: string;
    excerpt: string;
    status: 'draft' | 'published' | 'scheduled';
    scheduledAt: string | null;
    seoTitle: string;
    seoDescription: string;
    canonicalPath: string;
    featuredImageId: string | null;
    ogImage: string;
    noIndex: boolean;
    noFollow: boolean;
    selectedCategoryIds: string[];
    selectedTagIds: string[];
    selectedAuthorId: string;
    canvasElements: CanvasElement[];
    canvasSize: CanvasSize;
    designTemplateId?: string;
    frontendDesignSource?: SiteFrontendDesignContract['source'] | null;
    frontendDesignTokens?: SiteFrontendDesignContract['tokens'] | null;
    frontendDesignChrome?: SiteFrontendDesignContract['chrome'] | null;
}

type BlogCreationStatus = BlogCreateAutosaveDraft['status'];

const normalizedSearchString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const normalizedFrontendDesignTemplateSearch = (search: Record<string, unknown>): string | undefined => (
    normalizedSearchString(search.designTemplate)
    || normalizedSearchString(search.frontendDesignTemplateId)
    || normalizedSearchString(search.frontendTemplate)
);

export const Route = createFileRoute('/blog/new')({
    validateSearch: (search: Record<string, unknown>): BlogNewSearch => ({
        siteId: normalizedSearchString(search.siteId),
        focus: search.focus === 'canvas' ? 'canvas' : undefined,
        designTemplate: normalizedFrontendDesignTemplateSearch(search),
    }),
    component: NewBlogPostPage,
});

const BLOG_CREATE_AUTOSAVE_KEY = 'backy:blog-new:draft:v1';

type BlogCreatePermissionKey =
  | 'pages.view'
  | 'pages.edit'
  | 'pages.publish'
  | 'media.view'
  | 'media.create'
  | 'collections.view'
  | 'sites.configure';

const BLOG_CREATE_PERMISSION_ROLE_DEFAULTS: Record<BlogCreatePermissionKey, Array<User['role']>> = {
  'pages.view': ['owner', 'admin', 'editor', 'viewer'],
  'pages.edit': ['owner', 'admin', 'editor'],
  'pages.publish': ['owner', 'admin', 'editor'],
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'media.create': ['owner', 'admin', 'editor'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'sites.configure': ['owner', 'admin'],
};

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
        title: 'Writing structure',
        detail: 'Article sections, pull quotes, word count, and reading-time planning.',
        href: '#blog-create-writing',
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildFrontendBlogTemplateElements(
    template: SiteFrontendDesignTemplate,
    input: { title: string; slug: string; excerpt: string },
): CanvasElement[] {
    const content = isRecord(template.content) ? template.content : {};
    const contentDocument = isRecord(content.contentDocument) ? content.contentDocument : {};

    if (Array.isArray(content.elements)) {
        return content.elements as CanvasElement[];
    }

    if (Array.isArray(contentDocument.elements)) {
        return contentDocument.elements as CanvasElement[];
    }

    const canvasWidth = template.canvasSize?.width || DEFAULT_CANVAS_SIZE.width;
    const canvasHeight = template.canvasSize?.height || 900;

    return [
        createCanvasElement('section', 0, 0, {
            id: `frontend-blog-template-${template.id}`,
            width: canvasWidth,
            height: Math.max(620, canvasHeight - 160),
            dataBindings: [{ source: 'blog', mode: 'current', fields: ['title', 'excerpt', 'author', 'publishedAt', 'coverImage', 'content'] }],
            props: {
                backgroundColor: '#ffffff',
                borderRadius: 0,
                padding: 0,
                frontendTemplateId: template.id,
                frontendTemplateName: template.name,
                routePattern: template.routePattern,
            },
            children: [
                createCanvasElement('text', 72, 64, {
                    id: `frontend-blog-template-${template.id}-kicker`,
                    width: Math.min(280, canvasWidth - 144),
                    height: 32,
                    props: {
                        content: 'Article',
                        fontSize: 13,
                        fontWeight: '800',
                        color: '#0f766e',
                        textTransform: 'uppercase',
                    },
                }),
                createCanvasElement('heading', 72, 112, {
                    id: `frontend-blog-template-${template.id}-heading`,
                    width: Math.min(760, canvasWidth - 144),
                    height: 112,
                    props: {
                        content: input.title || template.name,
                        level: 'h1',
                        fontSize: 52,
                        fontWeight: '800',
                        lineHeight: 1.08,
                        color: '#111827',
                        binding: 'post.title',
                    },
                }),
                createCanvasElement('paragraph', 76, 246, {
                    id: `frontend-blog-template-${template.id}-excerpt`,
                    width: Math.min(680, canvasWidth - 152),
                    height: 92,
                    props: {
                        content: input.excerpt || template.description || 'This article page was seeded from the connected frontend design contract.',
                        fontSize: 18,
                        lineHeight: 1.6,
                        color: '#4b5563',
                        binding: 'post.excerpt',
                    },
                }),
                createCanvasElement('box', 76, 390, {
                    id: `frontend-blog-template-${template.id}-body-region`,
                    width: Math.min(860, canvasWidth - 152),
                    height: 220,
                    props: {
                        backgroundColor: '#f8fafc',
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderRadius: 8,
                        binding: 'post.content',
                        bindingHints: template.bindingHints || [],
                    },
                    children: [
                        createCanvasElement('paragraph', 28, 30, {
                            id: `frontend-blog-template-${template.id}-body-copy`,
                            width: Math.min(760, canvasWidth - 220),
                            height: 96,
                            props: {
                                content: 'Replace this placeholder with captured article components, rich text blocks, embeds, or reusable frontend sections.',
                                fontSize: 16,
                                lineHeight: 1.5,
                                color: '#334155',
                            },
                        }),
                    ],
                }),
            ],
        }),
    ];
}

function updateFrontendBlogTemplateText(
    elements: CanvasElement[],
    template: SiteFrontendDesignTemplate,
    input: { title: string; excerpt: string },
): CanvasElement[] {
    const headingId = `frontend-blog-template-${template.id}-heading`;
    const excerptId = `frontend-blog-template-${template.id}-excerpt`;
    const nextTitle = input.title.trim();
    const nextExcerpt = input.excerpt.trim();

    const updateElement = (element: CanvasElement): CanvasElement => {
        const nextChildren = Array.isArray(element.children)
            ? element.children.map(updateElement)
            : element.children;

        if (element.id === headingId && nextTitle) {
            return {
                ...element,
                props: {
                    ...element.props,
                    content: nextTitle,
                },
                children: nextChildren,
            };
        }

        if (element.id === excerptId && nextExcerpt) {
            return {
                ...element,
                props: {
                    ...element.props,
                    content: nextExcerpt,
                },
                children: nextChildren,
            };
        }

        return nextChildren === element.children ? element : { ...element, children: nextChildren };
    };

    return elements.map(updateElement);
}

function hasFrontendBlogTemplateRoot(elements: CanvasElement[], template: SiteFrontendDesignTemplate): boolean {
    const templateRootId = `frontend-blog-template-${template.id}`;
    const visit = (element: CanvasElement): boolean => {
        if (element.id === templateRootId || element.props?.frontendTemplateId === template.id) {
            return true;
        }

        return Array.isArray(element.children) && element.children.some(visit);
    };

    return elements.some(visit);
}

function findFrontendBlogTemplateRoot(elements: CanvasElement[], templateId: string): CanvasElement | null {
    const templateRootId = `frontend-blog-template-${templateId}`;
    const visit = (element: CanvasElement): CanvasElement | null => {
        if (element.id === templateRootId || element.props?.frontendTemplateId === templateId) {
            return element;
        }

        if (!Array.isArray(element.children)) {
            return null;
        }

        for (const child of element.children) {
            const match = visit(child);
            if (match) {
                return match;
            }
        }

        return null;
    };

    for (const element of elements) {
        const match = visit(element);
        if (match) {
            return match;
        }
    }

    return null;
}

function collectFrontendTemplateBindingHints(elements: CanvasElement[], templateId: string): Array<Record<string, unknown>> {
    const hints: Array<Record<string, unknown>> = [];
    const visit = (element: CanvasElement) => {
        if (
            (element.id.startsWith(`frontend-blog-template-${templateId}`) || element.props?.frontendTemplateId === templateId)
            && Array.isArray(element.props?.bindingHints)
        ) {
            element.props.bindingHints.forEach((hint: unknown) => {
                if (isRecord(hint)) {
                    hints.push(hint);
                }
            });
        }

        if (Array.isArray(element.children)) {
            element.children.forEach(visit);
        }
    };

    elements.forEach(visit);
    return hints;
}

function collectCanvasText(elements: CanvasElement[]): string {
    const chunks: string[] = [];
    const visit = (element: CanvasElement) => {
        const content = element.props?.content;
        if (typeof content === 'string') {
            chunks.push(content);
        }

        if (Array.isArray(element.children)) {
            element.children.forEach(visit);
        }
    };

    elements.forEach(visit);
    return chunks.join(' ');
}

function countWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

function getWritingStats(title: string, excerpt: string, elements: CanvasElement[]) {
    const titleWords = countWords(title);
    const excerptWords = countWords(excerpt);
    const canvasWords = countWords(collectCanvasText(elements));
    const totalWords = titleWords + excerptWords + canvasWords;

    return {
        titleWords,
        excerptWords,
        canvasWords,
        totalWords,
        readingMinutes: Math.max(1, Math.ceil(totalWords / 225)),
    };
}

function appendLongFormBlockToElements(
    elements: CanvasElement[],
    options: {
        kind: 'section' | 'quote';
        selectedFrontendTemplateId?: string;
        sequence: number;
    },
): CanvasElement[] {
    const targetId = options.selectedFrontendTemplateId
        ? `frontend-blog-template-${options.selectedFrontendTemplateId}-body-region`
        : 'blog-article-body';
    let appended = false;

    const appendToTarget = (element: CanvasElement): CanvasElement => {
        if (element.id === targetId) {
            const children = Array.isArray(element.children) ? element.children : [];
            const nextY = children.reduce((max, child) => Math.max(max, (child.y || 0) + (child.height || 0)), 0) + 36;
            const idPrefix = `blog-longform-${options.kind}-${options.sequence}`;
            const nextChild = options.kind === 'section'
                ? createCanvasElement('section', 28, nextY, {
                    id: idPrefix,
                    width: Math.min(820, Math.max(320, (element.width || DEFAULT_CANVAS_SIZE.width) - 96)),
                    height: 240,
                    props: {
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderRadius: 10,
                        padding: 0,
                    },
                    children: [
                        createCanvasElement('heading', 28, 28, {
                            id: `${idPrefix}-heading`,
                            width: 620,
                            height: 54,
                            props: {
                                content: 'New article section',
                                level: 'h2',
                                fontSize: 32,
                                fontWeight: '800',
                                lineHeight: 1.15,
                                color: '#0f172a',
                                binding: 'post.content.section',
                            },
                        }),
                        createCanvasElement('paragraph', 28, 98, {
                            id: `${idPrefix}-body`,
                            width: 700,
                            height: 106,
                            props: {
                                content: 'Develop this section with supporting details, examples, media references, or product/context links before publishing.',
                                fontSize: 17,
                                lineHeight: 1.7,
                                color: '#334155',
                                binding: 'post.content.body',
                            },
                        }),
                    ],
                })
                : createCanvasElement('quote', 44, nextY, {
                    id: idPrefix,
                    width: Math.min(760, Math.max(300, (element.width || DEFAULT_CANVAS_SIZE.width) - 120)),
                    height: 130,
                    props: {
                        content: 'Add a memorable pull quote or editorial takeaway for readers scanning the article.',
                        fontSize: 24,
                        fontWeight: '700',
                        lineHeight: 1.45,
                        color: '#0f172a',
                        borderColor: '#0f766e',
                        borderWidth: 0,
                        binding: 'post.content.quote',
                    },
                });
            const nextHeight = Math.max(element.height || 0, nextY + nextChild.height + 48);
            appended = true;
            return {
                ...element,
                height: nextHeight,
                children: [...children, nextChild],
            };
        }

        if (!Array.isArray(element.children)) {
            return element;
        }

        const nextChildren = element.children.map(appendToTarget);
        const childrenChanged = nextChildren.some((child, index) => child !== element.children?.[index]);
        if (!childrenChanged) {
            return element;
        }

        return {
            ...element,
            height: Math.max(element.height || 0, ...nextChildren.map((child) => (child.y || 0) + (child.height || 0) + 48)),
            children: nextChildren,
        };
    };

    const nextElements = elements.map(appendToTarget);
    if (appended) {
        return nextElements;
    }

    const sequence = options.sequence;
    const y = getCanvasHeightForElements(elements) + 40;
    const fallback = options.kind === 'section'
        ? createCanvasElement('section', 0, y, {
            id: `blog-longform-section-${sequence}`,
            width: DEFAULT_CANVAS_SIZE.width,
            height: 260,
            dataBindings: [{ source: 'blog', mode: 'current', fields: ['content'] }],
            props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
            children: [
                createCanvasElement('heading', 220, 48, {
                    id: `blog-longform-section-${sequence}-heading`,
                    width: 720,
                    height: 58,
                    props: { content: 'New article section', level: 'h2', fontSize: 32, fontWeight: '800', lineHeight: 1.15, color: '#0f172a' },
                }),
                createCanvasElement('paragraph', 220, 122, {
                    id: `blog-longform-section-${sequence}-body`,
                    width: 760,
                    height: 106,
                    props: { content: 'Develop this section with supporting details, examples, media references, or product/context links before publishing.', fontSize: 17, lineHeight: 1.7, color: '#334155' },
                }),
            ],
        })
        : createCanvasElement('quote', 260, y, {
            id: `blog-longform-quote-${sequence}`,
            width: 680,
            height: 130,
            props: { content: 'Add a memorable pull quote or editorial takeaway for readers scanning the article.', fontSize: 24, fontWeight: '700', lineHeight: 1.45, color: '#0f172a' },
        });

    return [...elements, fallback];
}

function getFrontendBlogTemplateCanvasSize(template: SiteFrontendDesignTemplate, elements: CanvasElement[]): CanvasSize {
    return {
        ...DEFAULT_CANVAS_SIZE,
        width: template.canvasSize?.width || DEFAULT_CANVAS_SIZE.width,
        height: Math.max(template.canvasSize?.height || DEFAULT_CANVAS_SIZE.height, getCanvasHeightForElements(elements)),
    };
}

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
    const [hasHydratedAutosave, setHasHydratedAutosave] = useState(false);
    const [draftRecovery, setDraftRecovery] = useState<BlogCreateAutosaveDraft | null>(null);
    const [autosavePausedForRecovery, setAutosavePausedForRecovery] = useState(false);
    const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState('Autosave ready');
    const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
    const [recoveredFrontendDesignSnapshot, setRecoveredFrontendDesignSnapshot] = useState<Pick<SiteFrontendDesignContract, 'source' | 'tokens' | 'chrome'> | null>(null);
    const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
    const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSite = search.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
        : undefined;
    const requestedSiteId = requestedSite?.publicSiteId || requestedSite?.id || defaultSiteId;
    const [activeSiteId, setActiveSiteId] = useState(requestedSiteId);
    const isWorkspaceFocus = search.focus === 'canvas';

    // Form State
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [status, setStatus] = useState<BlogCreationStatus>('draft');
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
    const [designTemplateId, setDesignTemplateId] = useState(search.designTemplate || '');
    const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
    const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(user?.id));
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
    const canViewBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'pages.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canEditBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'pages.edit', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canPublishBlog = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'pages.publish', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canViewMedia = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'media.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canCreateMedia = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'media.create', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canViewCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'collections.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const canConfigureSite = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, user, 'sites.configure', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewBlogPermissionTitle = canViewBlog ? undefined : adminPermissionReason(permissionMatrix, user, 'pages.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const editBlogPermissionTitle = canEditBlog ? undefined : adminPermissionReason(permissionMatrix, user, 'pages.edit', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const publishBlogPermissionTitle = canPublishBlog ? undefined : adminPermissionReason(permissionMatrix, user, 'pages.publish', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewMediaPermissionTitle = canViewMedia ? undefined : adminPermissionReason(permissionMatrix, user, 'media.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const createMediaPermissionTitle = canCreateMedia ? undefined : adminPermissionReason(permissionMatrix, user, 'media.create', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewCollectionsPermissionTitle = canViewCollections ? undefined : adminPermissionReason(permissionMatrix, user, 'collections.view', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const configureSitePermissionTitle = canConfigureSite ? undefined : adminPermissionReason(permissionMatrix, user, 'sites.configure', BLOG_CREATE_PERMISSION_ROLE_DEFAULTS);
    const viewBlogDeniedMessage = `Your account needs pages.view to load blog creation data. ${viewBlogPermissionTitle}`;
    const editBlogDeniedMessage = `Your account needs pages.edit to create or change blog drafts. ${editBlogPermissionTitle}`;
    const publishBlogDeniedMessage = `Your account needs pages.publish to create previews, publish posts, or schedule posts. ${publishBlogPermissionTitle}`;
    const viewMediaDeniedMessage = `Your account needs media.view to select featured media. ${viewMediaPermissionTitle}`;
    const createMediaDeniedMessage = `Your account needs media.create to upload featured media. ${createMediaPermissionTitle}`;
    const viewCollectionsDeniedMessage = `Your account needs collections.view to bind blog canvas elements to collection data. ${viewCollectionsPermissionTitle}`;
    const isCreateBusy = isLoading || isPreviewAfterCreateBusy || isCheckingPosts || isPermissionMatrixPending;
    const createFormDisabled = isCreateBusy || !canEditBlog;

    const clearCreationFeedback = () => {
        setError((current) => current ? null : current);
        setNotice((current) => current ? null : current);
    };

    useEffect(() => {
        let cancelled = false;
        setPermissionError(null);

        if (!user?.id) {
            setPermissionMatrix(null);
            setPermissionError('Sign in with an admin account to load blog creation permissions.');
            setIsPermissionsLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setIsPermissionsLoading(true);
        getUserPermissions(user.id)
            .then((matrix) => {
                if (!cancelled) {
                    setPermissionMatrix(matrix);
                    setPermissionError(null);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setPermissionMatrix(null);
                    setPermissionError(error instanceof Error ? error.message : 'Unable to load blog creation permissions.');
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
    }, [user?.id]);

    useEffect(() => {
        let cancelled = false;

        const loadTaxonomy = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setCategories([]);
                setTags([]);
                setAuthors([]);
                setError(viewBlogDeniedMessage);
                return;
            }

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
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, selectedAuthorId, user?.id, viewBlogDeniedMessage]);

    useEffect(() => {
        let cancelled = false;

        const loadExistingPosts = async () => {
            if (isPermissionMatrixPending) return;

            if (!canViewBlog) {
                setExistingBlogPosts([]);
                setRouteCheckError(viewBlogDeniedMessage);
                setError(viewBlogDeniedMessage);
                setIsCheckingPosts(false);
                return;
            }

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
    }, [activeSiteId, canViewBlog, isPermissionMatrixPending, routeCheckRetry, viewBlogDeniedMessage]);

    useEffect(() => {
        let cancelled = false;

        const loadFrontendDesignTemplates = async () => {
            if (!activeSiteId) return;
            if (isPermissionMatrixPending) return;

            if (!canConfigureSite) {
                setFrontendDesign(null);
                setFrontendDesignError(`Your account needs sites.configure to load frontend design templates. ${configureSitePermissionTitle}`);
                return;
            }

            setFrontendDesignLoading(true);
            setFrontendDesignError(null);

            try {
                let response = await getSiteFrontendDesign(activeSiteId);
                if (
                    search.designTemplate &&
                    search.siteId &&
                    search.siteId !== activeSiteId &&
                    !(response.frontendDesign?.templates || []).some((template) => template.id === search.designTemplate)
                ) {
                    response = await getSiteFrontendDesign(search.siteId);
                }
                if (!cancelled) {
                    setFrontendDesign(response.frontendDesign);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setFrontendDesign(null);
                    setFrontendDesignError(loadError instanceof Error ? loadError.message : 'Unable to load frontend design templates.');
                }
            } finally {
                if (!cancelled) {
                    setFrontendDesignLoading(false);
                }
            }
        };

        void loadFrontendDesignTemplates();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canConfigureSite, configureSitePermissionTitle, isPermissionMatrixPending, search.designTemplate, search.siteId]);

    useEffect(() => {
        if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, activeSiteId))) {
            const fallbackSiteId = sites[0].publicSiteId || sites[0].id;
            setActiveSiteId(fallbackSiteId);
            navigate({
                to: '/blog/new',
                search: { siteId: fallbackSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), ...(designTemplateId ? { designTemplate: designTemplateId } : {}) },
                replace: true,
            });
        }
    }, [activeSiteId, designTemplateId, isWorkspaceFocus, navigate, sites]);

    useEffect(() => {
        const nextRequestedSite = search.siteId
            ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
            : undefined;
        const nextSiteId = nextRequestedSite?.publicSiteId || nextRequestedSite?.id || search.siteId || defaultSiteId;
        if (nextSiteId === activeSiteId) return;

        setActiveSiteId(nextSiteId);
        setSelectedCategoryIds([]);
        setSelectedTagIds([]);
        setDesignTemplateId(search.designTemplate || '');
        setError(null);
        setNotice(null);
    }, [activeSiteId, defaultSiteId, search.designTemplate, search.siteId, sites]);

    const selectBlogSite = (nextSiteId: string) => {
        if (isCreateBusy) return;
        if (!canViewBlog) {
            setError(viewBlogDeniedMessage);
            setNotice(null);
            return;
        }

        setActiveSiteId(nextSiteId);
        setSelectedCategoryIds([]);
        setSelectedTagIds([]);
        setFeaturedImageId(null);
        setOgImage('');
        clearCreationFeedback();
        navigate({
            to: '/blog/new',
            search: { siteId: nextSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}) },
            replace: true,
        });
    };

    const toggleSelection = (
        id: string,
        selectedIds: string[],
        setSelectedIds: Dispatch<SetStateAction<string[]>>,
    ) => {
        if (isCreateBusy) return;
        if (!canEditBlog) {
            setError(editBlogDeniedMessage);
            setNotice(null);
            return;
        }

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
    const [canvasSeedKey, setCanvasSeedKey] = useState('default-blog-template');
    const interactiveReadinessIssues = useMemo(
        () => collectInteractiveReadinessIssues(canvasElements),
        [canvasElements],
    );
    const interactivePublishDisabledReason = interactiveReadinessIssues.length
        ? `Resolve interactive block readiness before publishing: ${interactiveReadinessIssues[0]}`
        : null;
    const interactivePublishReady = interactiveReadinessIssues.length === 0;
    const appliedSearchTemplateRef = useRef<string | null>(null);
    const frontendBlogTemplates = useMemo(
        () => (frontendDesign?.templates || []).filter((template) => template.type === 'blogPost'),
        [frontendDesign?.templates],
    );
    const selectedFrontendTemplate = useMemo(
        () => frontendBlogTemplates.find((template) => template.id === designTemplateId) || null,
        [designTemplateId, frontendBlogTemplates],
    );
    const recoveredFrontendTemplate = useMemo<SiteFrontendDesignTemplate | null>(() => {
        if (selectedFrontendTemplate || !designTemplateId) {
            return null;
        }

        const templateRoot = findFrontendBlogTemplateRoot(canvasElements, designTemplateId);
        if (!templateRoot) {
            return null;
        }

        const templateName = typeof templateRoot.props?.frontendTemplateName === 'string'
            ? templateRoot.props.frontendTemplateName
            : 'Recovered frontend template';
        const routePattern = typeof templateRoot.props?.routePattern === 'string'
            ? templateRoot.props.routePattern
            : '/blog/{slug}';
        const recoveredCanvasSize = {
            ...canvasSize,
            width: Math.max(templateRoot.width || 0, canvasSize.width || 0, DEFAULT_CANVAS_SIZE.width),
            height: Math.max(templateRoot.height || 0, canvasSize.height || 0, getCanvasHeightForElements(canvasElements)),
        };

        return {
            id: designTemplateId,
            type: 'blogPost',
            name: templateName,
            routePattern,
            description: 'Recovered from the local blog draft canvas.',
            canvasSize: recoveredCanvasSize,
            content: { elements: canvasElements },
            bindingHints: collectFrontendTemplateBindingHints(canvasElements, designTemplateId),
        };
    }, [canvasElements, canvasSize, designTemplateId, selectedFrontendTemplate]);
    const effectiveFrontendTemplate = selectedFrontendTemplate || recoveredFrontendTemplate;
    const visibleFrontendBlogTemplates = useMemo(
        () => effectiveFrontendTemplate && !frontendBlogTemplates.some((template) => template.id === effectiveFrontendTemplate.id)
            ? [...frontendBlogTemplates, effectiveFrontendTemplate]
            : frontendBlogTemplates,
        [effectiveFrontendTemplate, frontendBlogTemplates],
    );
    const effectiveCanvasSource = effectiveFrontendTemplate ? 'frontend-design' : 'backy-starter';
    const effectiveFrontendDesignSource = effectiveFrontendTemplate
        ? frontendDesign?.source || recoveredFrontendDesignSnapshot?.source || { type: 'custom-frontend' as const, label: 'Recovered frontend design contract' }
        : undefined;
    const effectiveFrontendDesignTokens = effectiveFrontendTemplate
        ? frontendDesign?.tokens || recoveredFrontendDesignSnapshot?.tokens
        : undefined;
    const effectiveFrontendDesignChrome = effectiveFrontendTemplate
        ? frontendDesign?.chrome || recoveredFrontendDesignSnapshot?.chrome
        : undefined;
    const writingStats = useMemo(
        () => getWritingStats(title, excerpt, canvasElements),
        [canvasElements, excerpt, title],
    );
    const addLongFormBlock = (kind: 'section' | 'quote') => {
        if (isCreateBusy) return;
        if (!canEditBlog) {
            setError(editBlogDeniedMessage);
            setNotice(null);
            return;
        }

        clearCreationFeedback();
        const nextElements = appendLongFormBlockToElements(canvasElements, {
            kind,
            selectedFrontendTemplateId: effectiveFrontendTemplate?.id,
            sequence: Date.now(),
        });
        setCanvasElements(nextElements);
        setCanvasSize((current) => ({
            ...current,
            height: Math.max(current.height, getCanvasHeightForElements(nextElements)),
        }));
        setCanvasSeedKey(`longform-${kind}-${Date.now()}`);
        setNotice(kind === 'section' ? 'Added an editable article section to the canvas.' : 'Added an editable pull quote to the canvas.');
    };
    const applyFrontendTemplate = (template: SiteFrontendDesignTemplate, options: { syncRoute?: boolean } = {}) => {
        if (isCreateBusy) return;
        if (!canEditBlog) {
            setError(editBlogDeniedMessage);
            setNotice(null);
            return;
        }

        const currentSlugValue = slug || slugify(title);
        const nextElements = buildFrontendBlogTemplateElements(template, {
            title: title.trim() || template.name,
            slug: currentSlugValue || routeSlugFromPattern(template.routePattern) || 'post-slug',
            excerpt,
        });
        const nextCanvasSize = {
            ...DEFAULT_CANVAS_SIZE,
            width: template.canvasSize?.width || DEFAULT_CANVAS_SIZE.width,
            height: Math.max(template.canvasSize?.height || DEFAULT_CANVAS_SIZE.height, getCanvasHeightForElements(nextElements)),
        };
        const routeSlug = routeSlugFromPattern(template.routePattern);

        clearCreationFeedback();
        setDesignTemplateId(template.id);
        setCanvasElements(nextElements);
        setCanvasSize(nextCanvasSize);
        setCanvasSeedKey(`frontend-${template.id}-${Date.now()}`);

        if (!title.trim()) {
            setTitle(template.name);
        }
        if (routeSlug && !slug.trim()) {
            setSlug(routeSlug);
        }
        if (!excerpt.trim() && template.description) {
            setExcerpt(template.description);
        }

        if (options.syncRoute) {
            navigate({
                to: '/blog/new',
                search: { siteId: activeSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), designTemplate: template.id },
                replace: true,
            });
        }
    };

    useEffect(() => {
        try {
            const storedDraft = window.localStorage.getItem(BLOG_CREATE_AUTOSAVE_KEY);
            if (storedDraft) {
                const parsedDraft = JSON.parse(storedDraft) as Partial<BlogCreateAutosaveDraft>;
                if (isRecoverableBlogCreateDraft(parsedDraft)) {
                    setDraftRecovery(parsedDraft);
                    setAutosavePausedForRecovery(true);
                    setAutosaveStatus('Recovered draft available');
                    setLastAutosavedAt(parsedDraft.savedAt);
                } else {
                    window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
                }
            }
        } catch {
            window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
        } finally {
            setHasHydratedAutosave(true);
        }
    }, []);

    const slugValue = slug || slugify(title);
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = sites.find((site) => siteMatchesIdentifier(site, activeSiteId));
    useEffect(() => {
        const nextTemplateId = search.designTemplate || '';
        if (nextTemplateId && nextTemplateId !== designTemplateId) {
            setDesignTemplateId(nextTemplateId);
        }
    }, [designTemplateId, search.designTemplate]);

    useEffect(() => {
        if (
            designTemplateId
            && frontendDesign
            && !frontendDesignLoading
            && !frontendBlogTemplates.some((template) => template.id === designTemplateId)
            && !findFrontendBlogTemplateRoot(canvasElements, designTemplateId)
        ) {
            setDesignTemplateId('');
            appliedSearchTemplateRef.current = null;
        }
    }, [canvasElements, designTemplateId, frontendBlogTemplates, frontendDesign, frontendDesignLoading]);

    useEffect(() => {
        if (!selectedFrontendTemplate) {
            return;
        }

        if (isCreateBusy || !canEditBlog) {
            return;
        }

        const templateCanvasApplied = hasFrontendBlogTemplateRoot(canvasElements, selectedFrontendTemplate);
        if (templateCanvasApplied) {
            appliedSearchTemplateRef.current = selectedFrontendTemplate.id;
            return;
        }

        appliedSearchTemplateRef.current = selectedFrontendTemplate.id;
        applyFrontendTemplate(selectedFrontendTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canEditBlog, canvasElements, isCreateBusy, selectedFrontendTemplate]);

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
    const scheduleValidationMessage = getScheduledBlogPostDateError(status, scheduledAt);
    const hasFutureSchedule = scheduleValidationMessage === null;
    const minimumScheduledAt = toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());
    const readinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slugValue.trim().length > 0 },
        { label: 'Route', complete: !isCheckingPosts && !routeCheckError && !routeConflict },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'SEO', complete: effectiveSeoTitle.length > 0 && effectiveSeoDescription.length >= 50 && canonicalValid },
        { label: 'Featured image', complete: Boolean(featuredImageId) },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Schedule', complete: hasFutureSchedule },
    ];
    const readyCount = readinessChecks.filter((check) => check.complete).length;
    const readinessScore = Math.round((readyCount / readinessChecks.length) * 100);
    const canCreateDraft = title.trim().length > 0
        && canEditBlog
        && slugValue.trim().length > 0
        && !isCheckingPosts
        && !routeCheckError
        && !routeConflict
        && canonicalValid;
    const canCreatePreviewDraft = title.trim().length > 0
        && canEditBlog
        && canPublishBlog
        && slugValue.trim().length > 0
        && !isCheckingPosts
        && !routeCheckError
        && !routeConflict
        && canonicalValid
        && interactivePublishReady;
    const canSubmit = canCreateDraft
        && (status === 'draft' || canPublishBlog)
        && (status === 'draft' || interactivePublishReady)
        && hasFutureSchedule;
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
        template: effectiveFrontendTemplate
            ? { id: effectiveFrontendTemplate.id, source: 'frontend-design', name: effectiveFrontendTemplate.name }
            : { id: 'blog-article', source: 'backy-starter', name: 'Blog article' },
        content: effectiveFrontendTemplate
            ? `${effectiveFrontendTemplate.name} frontend contract seed`
            : `${canvasElements.length} root layer${canvasElements.length === 1 ? '' : 's'}`,
        siteChrome: effectiveFrontendTemplate
            ? 'captured from frontend design contract'
            : 'editable header, navigation, article body, and footer seeded',
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
        },
    }), [
        canvasElements.length,
        canvasSize.height,
        canvasSize.width,
        effectiveFrontendTemplate,
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
        template: {
            id: effectiveFrontendTemplate?.id || 'blog-article',
            name: effectiveFrontendTemplate?.name || 'Blog article',
            source: effectiveCanvasSource,
            sections: effectiveFrontendTemplate ? effectiveFrontendTemplate.bindingHints || [] : ['article hero', 'article body'],
            routePattern: effectiveFrontendTemplate?.routePattern || '/blog/{slug}',
        },
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            rootLayerCount: canvasElements.length,
            siteChrome: effectiveFrontendTemplate ? 'frontend design contract' : ['header', 'navigation', 'article hero', 'article body', 'footer'],
            supportsGrouping: true,
            supportsResponsivePreview: true,
            source: effectiveFrontendTemplate ? 'Frontend design contract template' : 'Backy CanvasEditor serialized content',
        },
        payloadPreview: createPayloadPreview,
        nextStep: 'Created posts open in the blog editor where publishing, revisions, taxonomy, SEO, and the public canvas can be refined.',
        guardrails: [
            'Backend owns duplicate slug validation per site.',
            'Scheduled posts require a future publish date before they can be created.',
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
        effectiveCanvasSource,
        effectiveFrontendTemplate,
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
    const hasAutosaveContent = useMemo(() => (
        title.trim().length > 0
        || slug.trim().length > 0
        || excerpt.trim().length > 0
        || status !== 'draft'
        || Boolean(scheduledAt)
        || seoTitle.trim().length > 0
        || seoDescription.trim().length > 0
        || canonicalPath.trim().length > 0
        || Boolean(featuredImageId)
        || ogImage.trim().length > 0
        || noIndex
        || noFollow
        || selectedCategoryIds.length > 0
        || selectedTagIds.length > 0
        || selectedAuthorId !== (user?.id || 'admin')
        || designTemplateId.trim().length > 0
        || canvasSize.width !== initialCanvasSize.width
        || canvasSize.height !== initialCanvasSize.height
        || JSON.stringify(canvasElements) !== JSON.stringify(initialElements)
    ), [
        canonicalPath,
        canvasElements,
        canvasSize.height,
        canvasSize.width,
        designTemplateId,
        excerpt,
        featuredImageId,
        initialCanvasSize.height,
        initialCanvasSize.width,
        initialElements,
        noFollow,
        noIndex,
        ogImage,
        scheduledAt,
        selectedAuthorId,
        selectedCategoryIds.length,
        selectedTagIds.length,
        seoDescription,
        seoTitle,
        slug,
        status,
        title,
        user?.id,
    ]);

    useEffect(() => {
        if (!hasHydratedAutosave || autosavePausedForRecovery || isLoading || isPreviewAfterCreateBusy) {
            return;
        }

        if (!hasAutosaveContent) {
            window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
            setLastAutosavedAt(null);
            setAutosaveStatus('Autosave ready');
            return;
        }

        setAutosaveStatus('Saving draft...');
        const autosaveTimer = window.setTimeout(() => {
            try {
                const savedAt = new Date().toISOString();
                const draft: BlogCreateAutosaveDraft = {
                    version: 1,
                    savedAt,
                    activeSiteId,
                    title,
                    slug,
                    excerpt,
                    status,
                    scheduledAt,
                    seoTitle,
                    seoDescription,
                    canonicalPath,
                    featuredImageId,
                    ogImage,
                    noIndex,
                    noFollow,
                    selectedCategoryIds,
                    selectedTagIds,
                    selectedAuthorId,
                    canvasElements,
                    canvasSize,
                    designTemplateId,
                    frontendDesignSource: effectiveFrontendTemplate ? effectiveFrontendDesignSource || null : null,
                    frontendDesignTokens: effectiveFrontendTemplate ? effectiveFrontendDesignTokens || null : null,
                    frontendDesignChrome: effectiveFrontendTemplate ? effectiveFrontendDesignChrome || null : null,
                };
                window.localStorage.setItem(BLOG_CREATE_AUTOSAVE_KEY, JSON.stringify(draft));
                setLastAutosavedAt(savedAt);
                setAutosaveStatus(`Autosaved ${new Date(savedAt).toLocaleTimeString()}`);
            } catch {
                setAutosaveStatus('Autosave failed');
            }
        }, 800);

        return () => window.clearTimeout(autosaveTimer);
    }, [
        activeSiteId,
        autosavePausedForRecovery,
        canonicalPath,
        canvasElements,
        canvasSize,
        designTemplateId,
        effectiveFrontendDesignChrome,
        effectiveFrontendDesignSource,
        effectiveFrontendDesignTokens,
        effectiveFrontendTemplate,
        excerpt,
        featuredImageId,
        hasAutosaveContent,
        hasHydratedAutosave,
        isLoading,
        isPreviewAfterCreateBusy,
        noFollow,
        noIndex,
        ogImage,
        scheduledAt,
        selectedAuthorId,
        selectedCategoryIds,
        selectedTagIds,
        seoDescription,
        seoTitle,
        slug,
        status,
        title,
    ]);

    const clearAutosavedDraft = () => {
        window.localStorage.removeItem(BLOG_CREATE_AUTOSAVE_KEY);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(null);
        setAutosaveStatus('Autosave ready');
    };

    const restoreRecoveredDraft = () => {
        if (!draftRecovery || isLoading || isPreviewAfterCreateBusy) return;

        const recoveredSiteId = draftRecovery.activeSiteId || activeSiteId;
        setActiveSiteId(recoveredSiteId);
        setTitle(draftRecovery.title);
        setSlug(draftRecovery.slug);
        setExcerpt(draftRecovery.excerpt);
        setStatus(draftRecovery.status);
        setScheduledAt(draftRecovery.scheduledAt);
        setSeoTitle(draftRecovery.seoTitle);
        setSeoDescription(draftRecovery.seoDescription);
        setCanonicalPath(draftRecovery.canonicalPath);
        setFeaturedImageId(draftRecovery.featuredImageId);
        setOgImage(draftRecovery.ogImage);
        setNoIndex(draftRecovery.noIndex);
        setNoFollow(draftRecovery.noFollow);
        setSelectedCategoryIds(draftRecovery.selectedCategoryIds);
        setSelectedTagIds(draftRecovery.selectedTagIds);
        setSelectedAuthorId(draftRecovery.selectedAuthorId);
        setDesignTemplateId(draftRecovery.designTemplateId || '');
        setRecoveredFrontendDesignSnapshot(
            draftRecovery.frontendDesignSource || draftRecovery.frontendDesignTokens || draftRecovery.frontendDesignChrome
                ? {
                    source: draftRecovery.frontendDesignSource || { type: 'custom-frontend', label: 'Recovered frontend design contract' },
                    tokens: draftRecovery.frontendDesignTokens || {},
                    chrome: draftRecovery.frontendDesignChrome || {},
                }
                : null,
        );
        setCanvasElements(draftRecovery.canvasElements.length > 0 ? draftRecovery.canvasElements : initialElements);
        setCanvasSize(draftRecovery.canvasSize || initialCanvasSize);
        setCanvasSeedKey(`recovered-${Date.now()}`);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(draftRecovery.savedAt);
        setAutosaveStatus('Recovered draft restored');
        setRouteCheckError(null);
        setRouteCheckRetry((value) => value + 1);
        setError(null);
        setNotice('Recovered local blog draft.');
        navigate({
            to: '/blog/new',
            search: { siteId: recoveredSiteId, ...(isWorkspaceFocus ? { focus: 'canvas' as const } : {}), ...(draftRecovery.designTemplateId ? { designTemplate: draftRecovery.designTemplateId } : {}) },
            replace: true,
        });
    };

    const discardRecoveredDraft = () => {
        if (isLoading || isPreviewAfterCreateBusy) return;

        clearAutosavedDraft();
        setError(null);
        setNotice('Recovered draft discarded.');
    };

    const setWorkspaceFocusRoute = (focused: boolean) => {
        navigate({
            to: '/blog/new',
            search: {
                siteId: activeSiteId,
                ...(focused ? { focus: 'canvas' as const } : {}),
                ...(designTemplateId ? { designTemplate: designTemplateId } : {}),
            },
            replace: true,
        });
    };

    const autosaveLabel = draftRecovery
        ? `Recovery from ${new Date(draftRecovery.savedAt).toLocaleTimeString()}`
        : lastAutosavedAt
            ? `Autosaved ${new Date(lastAutosavedAt).toLocaleTimeString()}`
            : autosaveStatus;

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
        if (!canViewBlog) {
            setError(viewBlogDeniedMessage);
            setNotice(null);
            return;
        }

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
        if (!canViewBlog) {
            setError(viewBlogDeniedMessage);
            setNotice(null);
            return;
        }

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
        const frontendTemplateElements = effectiveFrontendTemplate && hasFrontendBlogTemplateRoot(canvasElements, effectiveFrontendTemplate)
            ? canvasElements
            : effectiveFrontendTemplate
                ? buildFrontendBlogTemplateElements(effectiveFrontendTemplate, {
                    title,
                    slug: slugValue,
                    excerpt,
                })
                : canvasElements;
        const contentElements = effectiveFrontendTemplate
            ? updateFrontendBlogTemplateText(frontendTemplateElements, effectiveFrontendTemplate, {
                title,
                excerpt,
            })
            : canvasElements;
        const contentCanvasSize = effectiveFrontendTemplate
            ? getFrontendBlogTemplateCanvasSize(effectiveFrontendTemplate, contentElements)
            : canvasSize;
        const content = serializeCanvasContent(contentElements, contentCanvasSize, effectiveFrontendTemplate ? effectiveFrontendDesignTokens?.customCss : undefined, {
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
                frontendDesignTemplateId: effectiveFrontendTemplate?.id,
                frontendDesignTemplateName: effectiveFrontendTemplate?.name,
                frontendDesignSource: effectiveFrontendDesignSource,
                frontendDesignRoutePattern: effectiveFrontendTemplate?.routePattern,
                frontendDesignTokens: effectiveFrontendDesignTokens,
                frontendDesignChrome: effectiveFrontendDesignChrome,
                frontendDesignCustomCss: effectiveFrontendDesignTokens?.customCss,
                frontendDesignBindingHints: effectiveFrontendTemplate?.bindingHints,
            },
        };
    };

    const getCreateBlockedMessage = (mode: 'save' | 'preview') => {
        if (!canEditBlog) return editBlogDeniedMessage;
        if (mode === 'preview' && !canPublishBlog) return publishBlogDeniedMessage;
        if (mode === 'save' && status !== 'draft' && !canPublishBlog) return publishBlogDeniedMessage;
        if ((mode === 'preview' || (mode === 'save' && status !== 'draft')) && interactivePublishDisabledReason) {
            return interactivePublishDisabledReason;
        }
        if (isCheckingPosts) return 'Checking existing blog routes before saving';
        if (routeCheckError) return 'Backy could not verify existing blog routes for this site. Retry the route check before saving.';
        if (routeConflict) return `The ${routePath} route is already used by "${routeConflict.title}". Choose another slug or edit that post first.`;
        if (!canonicalValid) return 'Canonical path must start with / before saving';
        if (mode === 'save' && scheduleValidationMessage) return scheduleValidationMessage;
        return 'Add a title and URL slug before saving';
    };

    const handleCreatePreview = async () => {
        if (isLoading || isPreviewAfterCreateBusy) return;
        if (!canEditBlog || !canPublishBlog) {
            setError(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
            setNotice(null);
            return;
        }

        if (!canCreatePreviewDraft) {
            setError(getCreateBlockedMessage('preview'));
            setNotice(null);
            return;
        }

        setIsPreviewAfterCreateBusy(true);
        setError(null);
        setNotice(null);

        let created: BlogPost | null = null;

        try {
            created = await createBlogPost(activeSiteId, buildPostInput('draft'));
            setPosts([created, ...posts.filter((post) => post.id !== created?.id)]);
            clearAutosavedDraft();

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
        if (!canEditBlog || (status !== 'draft' && !canPublishBlog)) {
            setError(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
            setNotice(null);
            return;
        }

        const currentScheduleValidationMessage = getScheduledBlogPostDateError(status, scheduledAt);
        if (currentScheduleValidationMessage) {
            setError(currentScheduleValidationMessage);
            setNotice(null);
            return;
        }

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
            clearAutosavedDraft();
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
                    disabled={isCreateBusy}
                    iconStart={isWorkspaceFocus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                >
                    {isWorkspaceFocus ? 'Show blog panels' : 'Focus canvas'}
                </Button>
            }
        >
            <div className={cn('w-full', isWorkspaceFocus ? 'h-full min-h-0 overflow-hidden pb-0' : 'pb-24')}>
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
                {permissionError && (
                    <Notice tone="warning" className="mb-4">
                        {permissionError}
                    </Notice>
                )}
                {draftRecovery && (
                    <Notice tone="info" title="Recovered unsaved blog draft" className="mb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                Local autosave found a draft from {new Date(draftRecovery.savedAt).toLocaleString()} for {draftRecovery.activeSiteId}.
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isLoading || isPreviewAfterCreateBusy}
                                    onClick={discardRecoveredDraft}
                                >
                                    Discard recovery
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isLoading || isPreviewAfterCreateBusy}
                                    onClick={restoreRecoveredDraft}
                                >
                                    Restore draft
                                </Button>
                            </div>
                        </div>
                    </Notice>
                )}

                <form id="blog-create-form" onSubmit={handleSubmit} className={cn('grid gap-5', isWorkspaceFocus && 'h-full min-h-0')}>
                    {!isWorkspaceFocus && (
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
                                    <span className={cn(
                                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                                        draftRecovery
                                            ? 'bg-sky-50 text-sky-700'
                                            : autosaveStatus === 'Autosave failed'
                                                ? 'bg-red-50 text-red-700'
                                                : 'bg-slate-100 text-slate-700',
                                    )}
                                    >
                                        {autosaveLabel}
                                    </span>
                                </div>
                                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                    Create the article record and its public design in one workspace: editorial metadata, canvas layout, publishing state, author, taxonomy, and frontend route.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    disabled={isCreateBusy || !canViewBlog}
                                    title={viewBlogPermissionTitle}
                                    onClick={() => void copyCreationText(creationHandoffText, 'Blog creation handoff manifest')}
                                    variant="outline"
                                    iconStart={<Copy className="size-4" />}
                                >
                                    Copy handoff
                                </Button>
                                <Button
                                    type="button"
                                    disabled={isCreateBusy || !canViewBlog}
                                    title={viewBlogPermissionTitle}
                                    onClick={downloadCreationHandoff}
                                    variant="outline"
                                    iconStart={<Download className="size-4" />}
                                >
                                    Download JSON
                                </Button>
                                <Button
                                    type="button"
                                    disabled={isLoading || isPreviewAfterCreateBusy || !canCreatePreviewDraft}
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
                    )}

                    <div
                        className={cn('grid gap-5', isWorkspaceFocus && 'h-full min-h-0', !isWorkspaceFocus && '2xl:grid-cols-[minmax(0,1fr)_380px]')}
                        data-testid="blog-create-workspace-grid"
                    >
                    <div className={cn('min-w-0 space-y-6', isWorkspaceFocus && 'h-full min-h-0 space-y-0')}>
                        {!isWorkspaceFocus && (
                        <>
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
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
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
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
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
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
                                className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="Write the summary that appears in blog lists, feeds, and SEO previews."
                            />
                            <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                        </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-create-writing" className="overflow-hidden scroll-mt-24" data-testid="blog-create-writing-panel">
                            <PanelHeader
                                title="Writing structure"
                                description="Plan long-form article flow before publishing: sections, pull quotes, word count, and reading time."
                                icon={<FileText className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-3" data-testid="blog-create-writing-metrics">
                                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                                        <div className="text-xs font-medium text-muted-foreground">Total words</div>
                                        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{writingStats.totalWords}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                                        <div className="text-xs font-medium text-muted-foreground">Canvas words</div>
                                        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{writingStats.canvasWords}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                                        <div className="text-xs font-medium text-muted-foreground">Reading time</div>
                                        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{writingStats.readingMinutes} min</div>
                                    </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                disabled={createFormDisabled}
                                title={editBlogPermissionTitle}
                                        onClick={() => addLongFormBlock('section')}
                                        data-testid="blog-create-add-section"
                                    >
                                        Add section
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={createFormDisabled}
                                        title={editBlogPermissionTitle}
                                        onClick={() => addLongFormBlock('quote')}
                                        data-testid="blog-create-add-quote"
                                    >
                                        Add pull quote
                                    </Button>
                                </div>
                                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
                                    Inserted blocks become normal editable canvas layers and are saved with the post content for hosted and custom frontends.
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
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
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
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
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
                                        disabled={createFormDisabled}
                                        title={editBlogPermissionTitle}
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
                                        disabled={createFormDisabled}
                                        title={editBlogPermissionTitle}
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
                                            disabled={createFormDisabled}
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
                                                clearCreationFeedback();
                                                setNoFollow(e.target.checked);
                                            }}
                                            disabled={createFormDisabled}
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
                        </>
                        )}

                        {!isWorkspaceFocus && (
                            <Panel id="blog-create-design-template" className="overflow-hidden scroll-mt-24" data-testid="blog-frontend-template-panel">
                                <PanelHeader
                                    title="Frontend design template"
                                    description="Seed this post from blog templates captured from the selected site's custom frontend contract."
                                    icon={<LayoutTemplate className="size-4" />}
                                />
                                <PanelContent className="space-y-3">
                                    {frontendDesignLoading && (
                                        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                                            Loading frontend design templates...
                                        </div>
                                    )}
                                    {frontendDesignError && (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            {frontendDesignError}
                                        </div>
                                    )}
                                    {visibleFrontendBlogTemplates.length > 0 ? (
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="blog-frontend-template-options">
                                            {visibleFrontendBlogTemplates.map((template) => (
                                                <button
                                                    key={template.id}
                                                    type="button"
                                                    onClick={() => applyFrontendTemplate(template, { syncRoute: true })}
                                                    disabled={createFormDisabled || !canConfigureSite}
                                                    title={editBlogPermissionTitle || configureSitePermissionTitle}
                                                    data-testid={`blog-frontend-template-${template.id}`}
                                                    data-active={designTemplateId === template.id}
                                                    className={cn(
                                                        'rounded-lg border bg-background p-3 text-left transition hover:border-teal-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70',
                                                        designTemplateId === template.id ? 'border-teal-600 ring-1 ring-teal-600' : 'border-border',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="truncate text-sm font-semibold text-foreground">{template.name}</span>
                                                        <span className="shrink-0 rounded-md bg-teal-100 px-2 py-1 text-[11px] font-semibold text-teal-800">
                                                            {template.canvasSize ? `${template.canvasSize.width} x ${template.canvasSize.height}` : 'Contract'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                                        {template.description || template.routePattern || 'Captured blog template with frontend bindings.'}
                                                    </p>
                                                    <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                                                        <span className="rounded-md bg-muted px-2 py-1">{template.bindingHints?.length || 0} bindings</span>
                                                        {template.routePattern && <span className="rounded-md bg-muted px-2 py-1">{template.routePattern}</span>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : !frontendDesignLoading && (
                                        <EmptyState
                                            icon={LayoutTemplate}
                                            title="No blog templates captured yet"
                                            description="Save a frontend design contract with blog post templates to seed this article from the connected custom frontend."
                                        />
                                    )}
                                </PanelContent>
                            </Panel>
                        )}

                        <div id="blog-create-canvas" className={cn('scroll-mt-24', isWorkspaceFocus && 'h-full min-h-0')} data-testid="blog-create-canvas-shell">
                            <EditorWorkspaceFrame
                                title="Post design canvas"
                                description={isWorkspaceFocus
                                    ? 'Focused article design workspace with the same component, layer, media, grouping, and data-binding controls used by pages.'
                                    : 'Use components, layers, grouping, resizing, reusable sections, and data bindings to design the public post page.'}
                                meta={
                                    <>
                                        <span className="rounded bg-muted px-2 py-1 tabular-nums">
                                            {canvasSize.width} x {canvasSize.height}px
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            {canvasElements.length} root layer{canvasElements.length === 1 ? '' : 's'}
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            {effectiveFrontendTemplate ? 'Frontend contract seed' : 'Header/nav/footer seeded'}
                                        </span>
                                        {effectiveFrontendTemplate && (
                                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                                                {effectiveFrontendTemplate.name}
                                            </span>
                                        )}
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
                                actions={isWorkspaceFocus ? (
                                    <>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isLoading || isPreviewAfterCreateBusy || !canCreatePreviewDraft}
                                            onClick={() => void handleCreatePreview()}
                                            iconStart={<Eye className="size-4" />}
                                        >
                                            {isPreviewAfterCreateBusy ? 'Creating preview...' : 'Save draft and preview'}
                                        </Button>
                                        <Button
                                            type="submit"
                                            form="blog-create-form"
                                            size="sm"
                                            disabled={isCreateBusy || !canSubmit}
                                            iconStart={<Save className="size-4" />}
                                        >
                                            {isLoading ? 'Saving...' : submitLabel}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkspaceFocusRoute(false)}
                                            disabled={isCreateBusy}
                                            iconStart={<Minimize2 className="size-4" />}
                                        >
                                            Show panels
                                        </Button>
                                    </>
                                ) : undefined}
                                data-testid={isWorkspaceFocus ? 'blog-create-focus-banner' : undefined}
                                className={cn(
                                    'relative',
                                    isWorkspaceFocus
                                        ? 'h-full min-h-0'
                                        : 'min-h-[780px] xl:h-[calc(100vh-120px)] xl:min-h-[900px]',
                                )}
                            >
                                <CanvasEditor
                                    key={canvasSeedKey}
                                    mode="blog"
                                    initialElements={canvasElements}
                                    initialSettings={dummySettings}
                                    initialSize={canvasSize}
                                    onSave={() => { }}
                                    onChange={(elements, _settings, size) => {
                                        if (isCreateBusy || !canEditBlog) return;
                                        clearCreationFeedback();
                                        setCanvasElements(elements);
                                        if (size) setCanvasSize(size);
                                    }}
                                    className="h-full w-full"
                                    hideNavigation={true}
                                    hideSettings={true}
                                    hideSave={true}
                                    savePersistence="parent"
                                    saveOwnerLabel="post form"
                                    canView={canViewBlog}
                                    canEdit={canEditBlog}
                                    canPublish={canPublishBlog}
                                    canViewMedia={canViewMedia}
                                    canCreateMedia={canCreateMedia}
                                    canViewCollections={canViewCollections}
                                    mediaContext={{
                                      siteId: activeSiteId,
                                      scope: 'post',
                                      targetId: 'new-post',
                                      targetLabel: title.trim() || 'New blog post',
                                    }}
                                    editDisabledReason={editBlogPermissionTitle}
                                    publishDisabledReason={publishBlogPermissionTitle}
                                    mediaViewDisabledReason={viewMediaDeniedMessage}
                                    mediaCreateDisabledReason={createMediaDeniedMessage}
                                    collectionsViewDisabledReason={viewCollectionsDeniedMessage}
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

                    {!isWorkspaceFocus && (
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
                                                if (isCreateBusy || !canEditBlog) return;

                                                clearCreationFeedback();
                                                setStatus(nextStatus);
                                                if (nextStatus !== 'scheduled') {
                                                    setScheduledAt(null);
                                                }
                                            }}
                                            disabled={createFormDisabled || (nextStatus !== 'draft' && !canPublishBlog)}
                                            title={nextStatus !== 'draft' ? publishBlogPermissionTitle : editBlogPermissionTitle}
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
                                            min={minimumScheduledAt}
                                            onChange={(e) => {
                                                if (isCreateBusy || !canEditBlog || !canPublishBlog) return;

                                                clearCreationFeedback();
                                                setScheduledAt(fromDateTimeLocalValue(e.target.value));
                                            }}
                                            disabled={createFormDisabled || !canPublishBlog}
                                            title={publishBlogPermissionTitle}
                                            aria-invalid={Boolean(scheduleValidationMessage)}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            required
                                        />
                                        {scheduleValidationMessage && (
                                            <p className="text-xs text-destructive">{scheduleValidationMessage}</p>
                                        )}
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
                                        disabled={isLoading || isPreviewAfterCreateBusy || !canCreatePreviewDraft}
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
                                        disabled={isCreateBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
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
                                                if (isCreateBusy || !canEditBlog) return;

                                                clearCreationFeedback();
                                                setSelectedAuthorId(event.target.value);
                                            }}
                                            disabled={createFormDisabled}
                                            title={editBlogPermissionTitle}
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
                                        onClick={() => {
                                            if (!canEditBlog) {
                                                setError(editBlogDeniedMessage);
                                                setNotice(null);
                                                return;
                                            }
                                            if (!canViewMedia) {
                                                setError(viewMediaDeniedMessage);
                                                setNotice(null);
                                                return;
                                            }
                                            setIsFeaturedMediaOpen(true);
                                        }}
                                        disabled={isCreateBusy || !canEditBlog || !canViewMedia}
                                        title={viewMediaPermissionTitle || editBlogPermissionTitle}
                                        iconStart={<ImageIcon className="size-4" />}
                                    >
                                        {featuredImageId ? 'Replace image' : 'Select image'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (isCreateBusy || !canEditBlog) return;

                                            clearCreationFeedback();
                                            setFeaturedImageId(null);
                                            setOgImage('');
                                        }}
                                        disabled={createFormDisabled || !featuredImageId}
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

                        <Panel id="blog-create-taxonomy" className="scroll-mt-24">
                            <PanelHeader title="Taxonomy" icon={<Tags className="size-4" />} />
                            <PanelContent className="space-y-5">
                                <TaxonomyPicker
                                    title="Categories"
                                    emptyLabel="No categories yet."
                                    items={categories}
                                    selectedIds={selectedCategoryIds}
                                    onToggle={(id) => toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)}
                                    disabled={createFormDisabled}
                                />
                                <TaxonomyPicker
                                    title="Tags"
                                    emptyLabel="No tags yet."
                                    items={tags}
                                    selectedIds={selectedTagIds}
                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
                                    disabled={createFormDisabled}
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

                                <pre data-testid="blog-create-payload" className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
{JSON.stringify(createPayloadPreview, null, 2)}
                                </pre>

                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        disabled={isCreateBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
                                        onClick={() => void copyCreationText(adminBlogUrl, 'Blog create API URL')}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                    >
                                        Copy URL
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={isCreateBusy || !canViewBlog}
                                        title={viewBlogPermissionTitle}
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
                    )}
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
                        if (isCreateBusy || !canEditBlog || !canViewMedia) return;

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
                    canView={canViewMedia}
                    canCreate={canCreateMedia}
                    viewDisabledReason={viewMediaDeniedMessage}
                    createDisabledReason={createMediaDeniedMessage}
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

const routeSlugFromPattern = (value?: string) => {
    if (!value || value.includes('{')) return '';
    return slugify(value.replace(/^\/+|\/+$/g, '').replace(/^blog\//, ''));
};

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

const getScheduledBlogPostDateError = (status: BlogCreationStatus, scheduledAt: string | null): string | null => {
    if (status !== 'scheduled') return null;
    if (!scheduledAt) return 'Choose a publish date before scheduling.';

    const scheduledAtMs = Date.parse(scheduledAt);
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
        return 'Choose a future publish date before scheduling.';
    }

    return null;
};

const isRecoverableBlogCreateDraft = (value: Partial<BlogCreateAutosaveDraft>): value is BlogCreateAutosaveDraft => (
    value.version === 1
    && typeof value.savedAt === 'string'
    && typeof value.activeSiteId === 'string'
    && typeof value.title === 'string'
    && typeof value.slug === 'string'
    && typeof value.excerpt === 'string'
    && (value.status === 'draft' || value.status === 'published' || value.status === 'scheduled')
    && (typeof value.scheduledAt === 'string' || value.scheduledAt === null)
    && typeof value.seoTitle === 'string'
    && typeof value.seoDescription === 'string'
    && typeof value.canonicalPath === 'string'
    && (typeof value.featuredImageId === 'string' || value.featuredImageId === null)
    && typeof value.ogImage === 'string'
    && typeof value.noIndex === 'boolean'
    && typeof value.noFollow === 'boolean'
    && Array.isArray(value.selectedCategoryIds)
    && Array.isArray(value.selectedTagIds)
    && typeof value.selectedAuthorId === 'string'
    && Array.isArray(value.canvasElements)
    && typeof value.canvasSize?.width === 'number'
    && typeof value.canvasSize?.height === 'number'
    && (value.designTemplateId === undefined || typeof value.designTemplateId === 'string')
    && (
        value.frontendDesignSource === undefined
        || value.frontendDesignSource === null
        || isRecord(value.frontendDesignSource)
    )
    && (
        value.frontendDesignTokens === undefined
        || value.frontendDesignTokens === null
        || isRecord(value.frontendDesignTokens)
    )
    && (
        value.frontendDesignChrome === undefined
        || value.frontendDesignChrome === null
        || isRecord(value.frontendDesignChrome)
    )
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
