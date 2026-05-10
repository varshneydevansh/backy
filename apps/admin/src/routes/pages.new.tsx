/**
 * BACKY CMS - NEW PAGE
 */

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Code2, Copy, Download, FileText, Globe, Home, Image as ImageIcon, Layout, Menu, RefreshCw, Save, Search, Sparkles } from 'lucide-react';
import { createPage, getAdminApiBase, getSiteNavigation, listPages, updateSiteNavigation } from '@/lib/adminContentApi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type Page } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn } from '@/lib/utils';
import { getCanvasHeightForElements, withPageChrome } from '@/lib/editorTemplateChrome';
import {
    DEFAULT_CANVAS_SIZE,
    createCanvasElement,
    serializeCanvasContent,
} from '@/components/editor/editorCatalog';
import type { CanvasElement } from '@/types/editor';
import type { SiteNavigationConfig, SiteNavigationConfigItem } from '@backy-cms/core';

interface NewPageSearch {
    siteId?: string;
    template?: PageTemplate;
    title?: string;
    slug?: string;
    description?: string;
    status?: PageCreationStatus;
    scheduledAt?: string;
    isHomepage?: boolean;
    nav?: PageNavigationPlacement;
    navLabel?: string;
    parentPageId?: string;
    seoTitle?: string;
    canonical?: string;
    keywords?: string;
    jsonLd?: string;
    ogImage?: string;
    noIndex?: boolean;
    noFollow?: boolean;
}

type PageTemplate = 'blank' | 'landing' | 'storefront' | 'blog-index' | 'about' | 'contact' | 'registration';
type PageCreationStatus = 'draft' | 'published' | 'scheduled';
type PageNavigationPlacement = 'none' | 'primary' | 'footer';

interface TemplatePreviewBlock {
    label?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    className: string;
}

interface PageCreateDraftState {
    title: string;
    slug: string;
    siteId: string;
    template: PageTemplate;
    status: PageCreationStatus;
    scheduledAt: string | null;
    isHomepage: boolean;
    description: string;
    parentPageId: string;
    navigationPlacement: PageNavigationPlacement;
    navigationLabel: string;
    seoTitle: string;
    canonicalPath: string;
    keywords: string;
    jsonLdText: string;
    ogImage: string;
    noIndex: boolean;
    noFollow: boolean;
}

interface PageCreateAutosaveDraft {
    version: 1;
    savedAt: string;
    formData: PageCreateDraftState;
}

const PAGE_CREATE_AUTOSAVE_KEY = 'backy:page-new:draft:v1';

const TEMPLATE_OPTIONS: Array<{
    id: PageTemplate;
    name: string;
    desc: string;
    detail: string;
    sections: string[];
}> = [
    {
        id: 'blank',
        name: 'Blank page',
        desc: 'A clean canvas with a title and starter text.',
        detail: 'Best for custom layouts, landing pages, and one-off experiments.',
        sections: ['Heading', 'Intro copy'],
    },
    {
        id: 'landing',
        name: 'Landing page',
        desc: 'Hero, value cards, and a call to action.',
        detail: 'Good for offers, products, launches, and lead capture pages.',
        sections: ['Hero', 'Feature grid', 'CTA'],
    },
    {
        id: 'storefront',
        name: 'Storefront page',
        desc: 'Product hero, catalog rail, and checkout-ready cards.',
        detail: 'Starts a public selling page that can bind to Backy products and orders.',
        sections: ['Product hero', 'Catalog grid', 'Checkout CTA'],
    },
    {
        id: 'blog-index',
        name: 'Blog index',
        desc: 'Editorial intro, featured story, and article list blocks.',
        detail: 'Creates a public publication route ready to bind to Backy blog posts.',
        sections: ['Editorial hero', 'Featured post', 'Article list'],
    },
    {
        id: 'about',
        name: 'About page',
        desc: 'Story, values, and team-ready content blocks.',
        detail: 'Useful for company, portfolio, studio, or brand background pages.',
        sections: ['Story', 'Values', 'Team'],
    },
    {
        id: 'contact',
        name: 'Contact page',
        desc: 'Contact copy, form fields, and response expectations.',
        detail: 'Starts with an editable Backy form that appears in the Forms inbox.',
        sections: ['Intro', 'Form', 'Response note'],
    },
    {
        id: 'registration',
        name: 'Registration page',
        desc: 'Signup copy, member fields, consent, and submission routing.',
        detail: 'Creates a public registration form API without needing a separate frontend first.',
        sections: ['Hero', 'Registration form', 'Consent'],
    },
];

const TEMPLATE_DEFAULTS: Record<PageTemplate, { title: string; slug: string; description: string }> = {
    blank: { title: '', slug: '', description: '' },
    landing: {
        title: 'Landing page',
        slug: 'landing',
        description: 'A focused landing page with an editable hero, feature grid, and call to action.',
    },
    storefront: {
        title: 'Storefront',
        slug: 'store',
        description: 'A public storefront page ready to connect products, catalog sections, and checkout actions.',
    },
    'blog-index': {
        title: 'Blog',
        slug: 'blog',
        description: 'A public blog index with featured posts and editable editorial sections.',
    },
    about: {
        title: 'About',
        slug: 'about',
        description: 'A public about page for story, values, team, and trust-building content.',
    },
    contact: {
        title: 'Contact',
        slug: 'contact',
        description: 'A public contact page with editable copy and a Backy form connected to submissions.',
    },
    registration: {
        title: 'Member registration',
        slug: 'register',
        description: 'A public registration page with member fields, consent, and Backy form submission routing.',
    },
};

const DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE: Record<PageTemplate, PageNavigationPlacement> = {
    blank: 'none',
    landing: 'primary',
    storefront: 'primary',
    'blog-index': 'primary',
    about: 'primary',
    contact: 'footer',
    registration: 'primary',
};

const PAGE_CREATION_AREAS = [
    {
        title: 'Page basics',
        detail: 'Target site, title, route, homepage behavior, and SEO description.',
        href: '#page-basics',
    },
    {
        title: 'Starter design',
        detail: 'Seed a real editable canvas instead of sending the editor an empty page.',
        href: '#page-design',
    },
    {
        title: 'Route preview',
        detail: 'Confirm the public path and selected site before creating the page.',
        href: '#page-preview',
    },
    {
        title: 'SEO and social',
        detail: 'Search title, canonical path, Open Graph image, and robots flags.',
        href: '#page-seo',
    },
    {
        title: 'Create payload',
        detail: 'Review the metadata and canvas handoff that will be sent to the backend.',
        href: '#page-payload',
    },
] as const;

const slugify = (value: string) => (
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
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

const normalizeKeywords = (value: string): string[] => (
    Array.from(new Set(value
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean)))
        .slice(0, 20)
);

const parseJsonLd = (
    value: string,
): { ok: true; value: Array<Record<string, unknown>> } | { ok: false; message: string } => {
    if (!value.trim()) {
        return { ok: true, value: [] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return { ok: false, message: 'JSON-LD must be valid JSON.' };
    }

    if (!Array.isArray(parsed)) {
        return { ok: false, message: 'JSON-LD must be a JSON array.' };
    }

    for (const [index, entry] of parsed.entries()) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            return { ok: false, message: `JSON-LD entry ${index + 1} must be an object.` };
        }
    }

    return { ok: true, value: parsed as Array<Record<string, unknown>> };
};

const getPagePublicPath = (page: Pick<Page, 'slug' | 'isHomepage'>) => (
    page.isHomepage || page.slug === 'home' || page.slug === ''
        ? '/'
        : `/${slugify(page.slug)}`
);

const templateNavigationItems: Record<PageTemplate, string[]> = {
    blank: ['Home', 'About', 'Contact'],
    landing: ['Home', 'Features', 'Contact'],
    storefront: ['Home', 'Shop', 'About', 'Contact'],
    'blog-index': ['Home', 'Blog', 'About', 'Contact'],
    about: ['Home', 'About', 'Contact'],
    contact: ['Home', 'About', 'Contact'],
    registration: ['Home', 'Register', 'Contact'],
};

const templatePreviewBlocks: Record<PageTemplate, TemplatePreviewBlock[]> = {
    blank: [
        { x: 12, y: 18, w: 42, h: 6, className: 'bg-slate-900' },
        { x: 12, y: 30, w: 64, h: 4, className: 'bg-slate-300' },
        { x: 12, y: 39, w: 52, h: 4, className: 'bg-slate-200' },
        { label: 'Text', x: 12, y: 55, w: 28, h: 16, className: 'border-slate-300 bg-white' },
    ],
    landing: [
        { label: 'Hero', x: 8, y: 16, w: 84, h: 34, className: 'border-teal-200 bg-teal-50' },
        { x: 14, y: 25, w: 36, h: 5, className: 'bg-teal-800' },
        { x: 14, y: 36, w: 24, h: 6, className: 'bg-emerald-500' },
        { label: 'Cards', x: 8, y: 58, w: 24, h: 20, className: 'border-slate-200 bg-white' },
        { x: 38, y: 58, w: 24, h: 20, className: 'border-slate-200 bg-white' },
        { x: 68, y: 58, w: 24, h: 20, className: 'border-slate-200 bg-white' },
    ],
    storefront: [
        { label: 'Product', x: 8, y: 16, w: 38, h: 34, className: 'border-amber-200 bg-amber-50' },
        { x: 54, y: 20, w: 30, h: 5, className: 'bg-slate-900' },
        { x: 54, y: 32, w: 24, h: 5, className: 'bg-emerald-500' },
        { label: 'Grid', x: 8, y: 58, w: 24, h: 20, className: 'border-amber-200 bg-white' },
        { x: 38, y: 58, w: 24, h: 20, className: 'border-amber-200 bg-white' },
        { x: 68, y: 58, w: 24, h: 20, className: 'border-amber-200 bg-white' },
    ],
    'blog-index': [
        { label: 'Feature', x: 8, y: 16, w: 84, h: 28, className: 'border-indigo-200 bg-indigo-50' },
        { x: 14, y: 25, w: 32, h: 5, className: 'bg-indigo-800' },
        { label: 'Posts', x: 8, y: 54, w: 84, h: 7, className: 'border-slate-200 bg-white' },
        { x: 8, y: 65, w: 84, h: 7, className: 'border-slate-200 bg-white' },
        { x: 8, y: 76, w: 84, h: 7, className: 'border-slate-200 bg-white' },
    ],
    about: [
        { label: 'Story', x: 8, y: 16, w: 42, h: 30, className: 'border-cyan-200 bg-cyan-50' },
        { x: 58, y: 20, w: 28, h: 5, className: 'bg-slate-900' },
        { x: 58, y: 32, w: 28, h: 4, className: 'bg-slate-300' },
        { label: 'Values', x: 8, y: 56, w: 26, h: 19, className: 'border-cyan-200 bg-white' },
        { x: 38, y: 56, w: 26, h: 19, className: 'border-cyan-200 bg-white' },
        { x: 68, y: 56, w: 24, h: 19, className: 'border-cyan-200 bg-white' },
    ],
    contact: [
        { x: 8, y: 18, w: 30, h: 5, className: 'bg-slate-900' },
        { x: 8, y: 30, w: 28, h: 4, className: 'bg-slate-300' },
        { label: 'Form', x: 48, y: 16, w: 44, h: 62, className: 'border-emerald-200 bg-emerald-50' },
        { x: 54, y: 28, w: 32, h: 6, className: 'bg-white' },
        { x: 54, y: 40, w: 32, h: 6, className: 'bg-white' },
        { x: 54, y: 58, w: 20, h: 7, className: 'bg-emerald-600' },
    ],
    registration: [
        { label: 'Signup', x: 8, y: 16, w: 40, h: 34, className: 'border-violet-200 bg-violet-50' },
        { x: 14, y: 27, w: 26, h: 5, className: 'bg-violet-800' },
        { label: 'Fields', x: 56, y: 16, w: 36, h: 60, className: 'border-slate-200 bg-white' },
        { x: 62, y: 28, w: 24, h: 6, className: 'bg-slate-100' },
        { x: 62, y: 40, w: 24, h: 6, className: 'bg-slate-100' },
        { x: 62, y: 58, w: 18, h: 7, className: 'bg-violet-600' },
    ],
};

const isPageTemplate = (value: unknown): value is PageTemplate => (
    typeof value === 'string' && TEMPLATE_OPTIONS.some((template) => template.id === value)
);

const isPageCreationStatus = (value: unknown): value is PageCreationStatus => (
    value === 'draft' || value === 'published' || value === 'scheduled'
);

const isPageNavigationPlacement = (value: unknown): value is PageNavigationPlacement => (
    value === 'none' || value === 'primary' || value === 'footer'
);

const normalizedSearchString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const normalizedSearchBoolean = (value: unknown): boolean | undefined => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
};

const normalizedSearchJsonLd = (value: unknown): string | undefined => {
    const stringValue = normalizedSearchString(value);
    if (stringValue) return stringValue;

    if ((Array.isArray(value) || (typeof value === 'object' && value !== null))) {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return undefined;
        }
    }

    return undefined;
};

const normalizeNewPageSearch = (input: NewPageSearch): NewPageSearch => ({
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.template && input.template !== 'blank' ? { template: input.template } : {}),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.slug?.trim() ? { slug: input.slug.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.status && input.status !== 'draft' ? { status: input.status } : {}),
    ...(input.scheduledAt && input.status === 'scheduled' ? { scheduledAt: input.scheduledAt } : {}),
    ...(input.isHomepage ? { isHomepage: true } : {}),
    ...(input.nav && input.nav !== DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[input.template || 'blank'] ? { nav: input.nav } : {}),
    ...(input.navLabel?.trim() ? { navLabel: input.navLabel.trim() } : {}),
    ...(input.parentPageId?.trim() ? { parentPageId: input.parentPageId.trim() } : {}),
    ...(input.seoTitle?.trim() ? { seoTitle: input.seoTitle.trim() } : {}),
    ...(input.canonical?.trim() ? { canonical: input.canonical.trim() } : {}),
    ...(input.keywords?.trim() ? { keywords: input.keywords.trim() } : {}),
    ...(input.jsonLd?.trim() ? { jsonLd: input.jsonLd.trim() } : {}),
    ...(input.ogImage?.trim() ? { ogImage: input.ogImage.trim() } : {}),
    ...(input.noIndex ? { noIndex: true } : {}),
    ...(input.noFollow ? { noFollow: true } : {}),
});

export const Route = createFileRoute('/pages/new')({
    validateSearch: (search: Record<string, unknown>): NewPageSearch => ({
        siteId: normalizedSearchString(search.siteId),
        template: isPageTemplate(search.template) ? search.template : undefined,
        title: normalizedSearchString(search.title),
        slug: normalizedSearchString(search.slug),
        description: normalizedSearchString(search.description),
        status: isPageCreationStatus(search.status) ? search.status : undefined,
        scheduledAt: normalizedSearchString(search.scheduledAt),
        isHomepage: normalizedSearchBoolean(search.isHomepage),
        nav: isPageNavigationPlacement(search.nav) ? search.nav : undefined,
        navLabel: normalizedSearchString(search.navLabel),
        parentPageId: normalizedSearchString(search.parentPageId),
        seoTitle: normalizedSearchString(search.seoTitle),
        canonical: normalizedSearchString(search.canonical),
        keywords: normalizedSearchString(search.keywords),
        jsonLd: normalizedSearchJsonLd(search.jsonLd),
        ogImage: normalizedSearchString(search.ogImage),
        noIndex: normalizedSearchBoolean(search.noIndex),
        noFollow: normalizedSearchBoolean(search.noFollow),
    }),
    component: NewPageRoute,
});

function NewPageRoute() {
    const navigate = useNavigate();
    const search = Route.useSearch();
    const { sites, pages, setPages } = useStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingPages, setIsCheckingPages] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
    const [routeCheckRetry, setRouteCheckRetry] = useState(0);
    const [hasHydratedAutosave, setHasHydratedAutosave] = useState(false);
    const [draftRecovery, setDraftRecovery] = useState<PageCreateAutosaveDraft | null>(null);
    const [autosavePausedForRecovery, setAutosavePausedForRecovery] = useState(false);
    const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState('Autosave ready');
    const isPageCreateBusy = isLoading || isCheckingPages;
    const defaultSiteId = sites[0]?.publicSiteId || sites[0]?.id || 'site-demo';
    const requestedSite = search.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
        : undefined;
    const requestedSiteId = requestedSite?.publicSiteId || requestedSite?.id || search.siteId || defaultSiteId;
    const initialTemplate = search.template || 'blank';
    const templateDefaults = TEMPLATE_DEFAULTS[initialTemplate];

    // Default to first site if available
    const [formData, setFormData] = useState<PageCreateDraftState>({
        title: search.title ?? templateDefaults.title,
        slug: search.isHomepage ? 'home' : search.slug ?? templateDefaults.slug,
        siteId: requestedSiteId,
        template: initialTemplate,
        status: search.status || ('draft' as PageCreationStatus),
        scheduledAt: search.status === 'scheduled' ? search.scheduledAt ?? null : null,
        isHomepage: search.isHomepage ?? false,
        description: search.description ?? templateDefaults.description,
        parentPageId: search.parentPageId ?? '',
        navigationPlacement: search.nav || DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[initialTemplate],
        navigationLabel: search.navLabel ?? search.title ?? templateDefaults.title,
        seoTitle: search.seoTitle ?? search.title ?? templateDefaults.title,
        canonicalPath: search.canonical ?? '',
        keywords: search.keywords ?? '',
        jsonLdText: search.jsonLd ?? '',
        ogImage: search.ogImage ?? '',
        noIndex: search.noIndex ?? false,
        noFollow: search.noFollow ?? false,
    });
    const selectedSite = sites.find((site) => siteMatchesIdentifier(site, formData.siteId));
    const buildRouteSearchFromForm = (nextFormData: typeof formData): NewPageSearch => normalizeNewPageSearch({
        siteId: nextFormData.siteId,
        template: nextFormData.template,
        title: nextFormData.title,
        slug: nextFormData.slug,
        description: nextFormData.description,
        status: nextFormData.status,
        scheduledAt: nextFormData.scheduledAt || undefined,
        isHomepage: nextFormData.isHomepage,
        parentPageId: nextFormData.parentPageId,
        nav: nextFormData.navigationPlacement,
        navLabel: nextFormData.navigationLabel,
        seoTitle: nextFormData.seoTitle,
        canonical: nextFormData.canonicalPath,
        keywords: nextFormData.keywords,
        jsonLd: nextFormData.jsonLdText,
        ogImage: nextFormData.ogImage,
        noIndex: nextFormData.noIndex,
        noFollow: nextFormData.noFollow,
    });
    const updatePageDraft = (next: Partial<typeof formData>) => {
        if (isPageCreateBusy) return;

        const nextFormData = {
            ...formData,
            ...next,
        };

        setFormData(nextFormData);
        setError(null);
        setNotice(null);
        navigate({ to: '/pages/new', search: buildRouteSearchFromForm(nextFormData), replace: true });
    };

    useEffect(() => {
        try {
            const storedDraft = window.localStorage.getItem(PAGE_CREATE_AUTOSAVE_KEY);
            if (storedDraft) {
                const parsedDraft = JSON.parse(storedDraft) as Partial<PageCreateAutosaveDraft>;
                if (isRecoverablePageCreateDraft(parsedDraft)) {
                    setDraftRecovery(parsedDraft);
                    setAutosavePausedForRecovery(true);
                    setAutosaveStatus('Recovered draft available');
                    setLastAutosavedAt(parsedDraft.savedAt);
                } else {
                    window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
                }
            }
        } catch {
            window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
        } finally {
            setHasHydratedAutosave(true);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const siteId = formData.siteId;

        if (!siteId) return;

        const loadSelectedSitePages = async () => {
            setIsCheckingPages(true);
            setRouteCheckError(null);

            try {
                const backendPages = await listPages(siteId);
                if (!cancelled) {
                    const siteIdentifiers = new Set(
                        [siteId, selectedSite?.id, selectedSite?.publicSiteId].filter((value): value is string => Boolean(value)),
                    );
                    const otherPages = pages.filter((page) => !siteIdentifiers.has(page.siteId));
                    setPages([...backendPages, ...otherPages]);
                    setError(null);
                    setRouteCheckError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : 'Unable to check existing pages for this site';
                    setRouteCheckError(message);
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsCheckingPages(false);
                }
            }
        };

        void loadSelectedSitePages();

        return () => {
            cancelled = true;
        };
    }, [formData.siteId, routeCheckRetry, selectedSite?.id, selectedSite?.publicSiteId, setPages]);

    useEffect(() => {
        if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, formData.siteId))) {
            const fallbackSiteId = sites[0].publicSiteId || sites[0].id;
            const nextFormData = { ...formData, siteId: fallbackSiteId };
            setFormData(nextFormData);
            navigate({ to: '/pages/new', search: buildRouteSearchFromForm(nextFormData), replace: true });
        }
    }, [formData, navigate, sites]);

    useEffect(() => {
        const nextRequestedSite = search.siteId
            ? sites.find((site) => siteMatchesIdentifier(site, search.siteId || ''))
            : undefined;
        const nextSiteId = nextRequestedSite?.publicSiteId || nextRequestedSite?.id || search.siteId || defaultSiteId;
        const nextTemplate = search.template || 'blank';
        const nextDefaults = TEMPLATE_DEFAULTS[nextTemplate];
        const nextFormData = {
            siteId: nextSiteId,
            template: nextTemplate,
            title: search.title ?? nextDefaults.title,
            slug: search.isHomepage ? 'home' : search.slug ?? nextDefaults.slug,
            description: search.description ?? nextDefaults.description,
            status: search.status || ('draft' as PageCreationStatus),
            scheduledAt: search.status === 'scheduled' ? search.scheduledAt ?? null : null,
            isHomepage: search.isHomepage ?? false,
            parentPageId: search.parentPageId ?? '',
            navigationPlacement: search.nav || DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[nextTemplate],
            navigationLabel: search.navLabel ?? search.title ?? nextDefaults.title,
            seoTitle: search.seoTitle ?? search.title ?? nextDefaults.title,
            canonicalPath: search.canonical ?? '',
            keywords: search.keywords ?? '',
            jsonLdText: search.jsonLd ?? '',
            ogImage: search.ogImage ?? '',
            noIndex: search.noIndex ?? false,
            noFollow: search.noFollow ?? false,
        };
        setFormData((current) => {
            const hasChanged = (
                nextFormData.siteId !== current.siteId
                || nextFormData.template !== current.template
                || nextFormData.title !== current.title
                || nextFormData.slug !== current.slug
                || nextFormData.description !== current.description
                || nextFormData.status !== current.status
                || nextFormData.scheduledAt !== current.scheduledAt
                || nextFormData.isHomepage !== current.isHomepage
                || nextFormData.parentPageId !== current.parentPageId
                || nextFormData.navigationPlacement !== current.navigationPlacement
                || nextFormData.navigationLabel !== current.navigationLabel
                || nextFormData.seoTitle !== current.seoTitle
                || nextFormData.canonicalPath !== current.canonicalPath
                || nextFormData.keywords !== current.keywords
                || nextFormData.jsonLdText !== current.jsonLdText
                || nextFormData.ogImage !== current.ogImage
                || nextFormData.noIndex !== current.noIndex
                || nextFormData.noFollow !== current.noFollow
            );

            return hasChanged ? nextFormData : current;
        });
        setError(null);
        setNotice(null);
    }, [
        defaultSiteId,
        search.description,
        search.isHomepage,
        search.scheduledAt,
        search.siteId,
        search.slug,
        search.status,
        search.template,
        search.title,
        search.nav,
        search.navLabel,
        search.parentPageId,
        search.seoTitle,
        search.canonical,
        search.keywords,
        search.jsonLd,
        search.ogImage,
        search.noIndex,
        search.noFollow,
        sites,
    ]);

    const selectPageSite = (nextSiteId: string) => {
        if (isPageCreateBusy) return;
        updatePageDraft({ siteId: nextSiteId });
    };
    const selectedTemplate = useMemo(
        () => TEMPLATE_OPTIONS.find((template) => template.id === formData.template) || TEMPLATE_OPTIONS[0],
        [formData.template],
    );
    const handleTemplateChange = (nextTemplate: PageTemplate) => {
        if (isPageCreateBusy) return;

        const currentDefaults = TEMPLATE_DEFAULTS[formData.template];
        const nextDefaults = TEMPLATE_DEFAULTS[nextTemplate];
        const shouldApplyTitle = !formData.title.trim() || formData.title === currentDefaults.title;
        const shouldApplySlug = !formData.slug.trim() || formData.slug === currentDefaults.slug;
        const shouldApplyDescription = !formData.description.trim() || formData.description === currentDefaults.description;

        updatePageDraft({
            template: nextTemplate,
            title: shouldApplyTitle ? nextDefaults.title : formData.title,
            slug: formData.isHomepage ? 'home' : shouldApplySlug ? nextDefaults.slug : formData.slug,
            description: shouldApplyDescription ? nextDefaults.description : formData.description,
            navigationPlacement: DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[nextTemplate],
            navigationLabel: shouldApplyTitle ? nextDefaults.title : formData.navigationLabel || formData.title,
            seoTitle: shouldApplyTitle ? nextDefaults.title : formData.seoTitle || formData.title,
        });
    };
    const selectedSiteIdentifiers = useMemo(
        () => [formData.siteId, selectedSite?.id, selectedSite?.publicSiteId, selectedSite?.slug].filter((value): value is string => Boolean(value)),
        [formData.siteId, selectedSite?.id, selectedSite?.publicSiteId, selectedSite?.slug],
    );
    const selectedSitePages = useMemo(() => {
        const identifiers = new Set(selectedSiteIdentifiers);

        return pages.filter((page) => identifiers.has(page.siteId));
    }, [pages, selectedSiteIdentifiers]);
    const selectedParentPage = useMemo(
        () => selectedSitePages.find((page) => page.id === formData.parentPageId) || null,
        [formData.parentPageId, selectedSitePages],
    );
    const selectableParentPages = useMemo(
        () => selectedSitePages
            .filter((page) => page.status !== 'archived')
            .sort((left, right) => (
                Number(Boolean(right.isHomepage)) - Number(Boolean(left.isHomepage))
                || left.title.localeCompare(right.title)
                || left.slug.localeCompare(right.slug)
            )),
        [selectedSitePages],
    );
    const routePreview = formData.isHomepage
        ? '/'
        : `/${slugify(formData.slug || formData.title || 'new-page')}`;
    const resolvedSlug = formData.isHomepage ? 'home' : slugify(formData.slug || formData.title || 'new-page');
    const titleDerivedSlug = slugify(formData.title || 'new-page');
    const canSyncSlugFromTitle = !isPageCreateBusy && !formData.isHomepage && Boolean(formData.title.trim()) && formData.slug !== titleDerivedSlug;
    const normalizedCanonicalPath = normalizeCanonicalPath(formData.canonicalPath || routePreview);
    const canonicalValid = normalizedCanonicalPath.startsWith('/');
    const effectiveSeoTitle = formData.seoTitle.trim() || formData.title.trim();
    const effectiveSeoDescription = formData.description.trim();
    const defaultKeywordText = [
        formData.title.trim(),
        selectedTemplate.name,
        selectedSite?.name || '',
        formData.template.replace('-', ' '),
    ].filter(Boolean).join(', ');
    const effectiveKeywords = normalizeKeywords(formData.keywords.trim() || defaultKeywordText);
    const jsonLdResult = parseJsonLd(formData.jsonLdText);
    const defaultJsonLd = useMemo(() => ([
        {
            '@context': 'https://schema.org',
            '@type': formData.template === 'contact' ? 'ContactPage' : formData.template === 'about' ? 'AboutPage' : 'WebPage',
            name: effectiveSeoTitle || formData.title.trim() || 'Untitled page',
            description: effectiveSeoDescription || undefined,
            url: normalizedCanonicalPath,
            isPartOf: selectedSite?.name ? {
                '@type': 'WebSite',
                name: selectedSite.name,
            } : undefined,
            image: formData.ogImage.trim() || undefined,
        },
    ]), [effectiveSeoDescription, effectiveSeoTitle, formData.ogImage, formData.template, formData.title, normalizedCanonicalPath, selectedSite?.name]);
    const effectiveJsonLd = jsonLdResult.ok && jsonLdResult.value.length > 0
        ? jsonLdResult.value
        : defaultJsonLd;
    const jsonLdValid = jsonLdResult.ok;
    const routeConflict = useMemo(
        () => selectedSitePages.find((page) => getPagePublicPath(page) === routePreview) || null,
        [routePreview, selectedSitePages],
    );
    const hasSchedule = formData.status !== 'scheduled' || Boolean(formData.scheduledAt);
    const hasNavigationLabel = formData.navigationPlacement === 'none' || Boolean((formData.navigationLabel || formData.title).trim());
    const hasValidParentPage = !formData.parentPageId || Boolean(selectedParentPage);
    const adminPagesUrl = useMemo(
        () => `${getAdminApiBase()}/sites/${encodeURIComponent(formData.siteId || requestedSiteId)}/pages`,
        [formData.siteId, requestedSiteId],
    );
    const canSubmit = Boolean(
        formData.title.trim()
        && formData.siteId
        && !isCheckingPages
        && hasSchedule
        && !routeConflict
        && !routeCheckError
        && hasNavigationLabel
        && hasValidParentPage
        && canonicalValid
        && jsonLdValid
        && (!formData.isHomepage || formData.slug.trim() || formData.title.trim()),
    );
    const submitBlockerMessage = useMemo(() => {
        if (isLoading || canSubmit) return null;
        if (isCheckingPages) return 'Checking existing routes for this site before creating the page.';
        if (routeCheckError) return 'Backy could not verify existing routes for this site. Refresh or choose the site again before creating the page.';
        if (!selectedSite) return 'Select a target site before creating this page.';
        if (!formData.title.trim()) return 'Add a page title so Backy can create a named page and editor document.';
        if (routeConflict) return `The ${routePreview} route is already used by "${routeConflict.title}".`;
        if (!canonicalValid) return 'Use a canonical path that starts with / or paste a valid site URL.';
        if (!jsonLdValid) return jsonLdResult.message;
        if (!hasValidParentPage) return 'Choose an existing parent page or keep this page at the top level.';
        if (!hasSchedule) return 'Choose a publish date before creating a scheduled page.';
        if (!hasNavigationLabel) return 'Add a navigation label or choose not to add this page to navigation.';
        return 'Review the required page basics before creating this page.';
    }, [canSubmit, canonicalValid, formData.title, hasNavigationLabel, hasSchedule, hasValidParentPage, isCheckingPages, isLoading, jsonLdResult, jsonLdValid, routeCheckError, routeConflict, routePreview, selectedSite]);
    const pageCreationReadiness = useMemo(() => {
        const resolvedSlug = formData.isHomepage ? 'home' : slugify(formData.slug || formData.title || 'new-page');
        const hasStarterCanvas = selectedTemplate.sections.length > 0;
        const seedsSiteChrome = formData.template !== 'blank';
        const checks = [
            {
                label: 'Target site',
                detail: selectedSite ? `${selectedSite.name} will own this page.` : 'Select a site before creating a page.',
                ready: Boolean(selectedSite),
            },
            {
                label: 'Page identity',
                detail: formData.title.trim() ? `${formData.title.trim()} -> /${formData.isHomepage ? '' : resolvedSlug}` : 'Add a page title.',
                ready: formData.title.trim().length > 0,
            },
            {
                label: 'Route shape',
                detail: formData.isHomepage ? 'This page will resolve as the homepage.' : `Public path will be /${resolvedSlug}.`,
                ready: Boolean(resolvedSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resolvedSlug)),
            },
            {
                label: 'Route availability',
                detail: routeCheckError
                    ? 'Backy could not verify existing routes for this site.'
                    : routeConflict
                    ? `${routePreview} is already used by "${routeConflict.title}". Choose another slug or edit that page.`
                    : `${routePreview} is available in the current ${selectedSite?.name || 'site'} page library.`,
                ready: !routeConflict && !routeCheckError,
            },
            {
                label: 'SEO summary',
                detail: effectiveSeoDescription
                    ? `${formData.description.trim().length} characters, ${effectiveKeywords.length} keyword${effectiveKeywords.length === 1 ? '' : 's'}, and canonical metadata ready`
                    : 'Add a short SEO description for frontend previews.',
                ready: effectiveSeoTitle.length > 0 && effectiveSeoDescription.length > 0 && canonicalValid && effectiveKeywords.length > 0,
            },
            {
                label: 'Structured data',
                detail: jsonLdValid
                    ? `${effectiveJsonLd.length} JSON-LD object${effectiveJsonLd.length === 1 ? '' : 's'} will be stored in page meta.`
                    : jsonLdResult.message,
                ready: jsonLdValid,
            },
            {
                label: 'Social metadata',
                detail: formData.ogImage.trim()
                    ? 'Open Graph image URL is set for social cards.'
                    : 'Optional Open Graph image can be added before create.',
                ready: true,
            },
            {
                label: 'Canvas seed',
                detail: hasStarterCanvas
                    ? `${selectedTemplate.sections.length} starter section${selectedTemplate.sections.length === 1 ? '' : 's'}${seedsSiteChrome ? ' plus editable header, navigation, and footer' : ''} will be created`
                    : 'Blank still creates a heading and intro copy.',
                ready: true,
            },
            {
                label: 'Publish timing',
                detail: formData.status === 'scheduled'
                    ? hasSchedule ? 'Scheduled publish time is set.' : 'Choose a publish date for scheduled pages.'
                    : `${formData.status} pages can be saved immediately.`,
                ready: hasSchedule,
            },
            {
                label: 'Navigation',
                detail: formData.navigationPlacement === 'none'
                    ? 'The page will stay out of menus until you add it from site settings.'
                    : selectedParentPage
                        ? `The page will be nested under "${selectedParentPage.title}" in the ${formData.navigationPlacement} menu.`
                        : `The page will be added to the ${formData.navigationPlacement} menu as "${formData.navigationLabel.trim() || formData.title.trim() || 'Untitled page'}".`,
                ready: formData.navigationPlacement === 'none' || Boolean((formData.navigationLabel || formData.title).trim()),
            },
            {
                label: 'Hierarchy',
                detail: selectedParentPage
                    ? `Parent page: ${selectedParentPage.title}.`
                    : 'Top-level page unless nested later.',
                ready: !formData.parentPageId || Boolean(selectedParentPage),
            },
        ];
        const readyCount = checks.filter((check) => check.ready).length;

        return {
            score: Math.round((readyCount / checks.length) * 100),
            checks,
            workflow: [
                { label: 'Define route', detail: 'Pick the site, title, slug, homepage flag, status, and SEO summary.' },
                { label: 'Seed canvas', detail: 'Choose a starter template with editable sections, page chrome, and form blocks when needed.' },
                { label: 'Create record', detail: 'Persist page metadata and serialized editor content through the pages API.' },
                { label: 'Open editor', detail: 'Land in the visual editor to move, group, restyle, bind, and publish.' },
            ],
        };
    }, [
        formData.description,
        formData.keywords,
        formData.jsonLdText,
        formData.ogImage,
        formData.isHomepage,
        formData.canonicalPath,
        formData.noIndex,
        formData.noFollow,
        formData.scheduledAt,
        formData.siteId,
        formData.slug,
        formData.status,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.parentPageId,
        formData.seoTitle,
        formData.template,
        formData.title,
        canonicalValid,
        effectiveSeoDescription,
        effectiveSeoTitle.length,
        effectiveKeywords.length,
        effectiveJsonLd.length,
        hasSchedule,
        jsonLdResult,
        jsonLdValid,
        routeCheckError,
        routeConflict,
        routePreview,
        selectedSite,
        selectedParentPage,
        selectedTemplate.sections.length,
    ]);
    const createPayloadPreview = useMemo(() => ({
        title: formData.title.trim() || 'Untitled page',
        slug: resolvedSlug,
        siteId: formData.siteId,
        status: formData.status,
        scheduledAt: formData.status === 'scheduled' ? formData.scheduledAt : null,
        template: formData.template,
        description: formData.description,
        isHomepage: formData.isHomepage,
        routeAvailability: routeConflict
            ? { status: 'conflict', pageId: routeConflict.id, title: routeConflict.title, path: getPagePublicPath(routeConflict) }
            : { status: 'available', checkedPages: selectedSitePages.length },
        content: `${selectedTemplate.sections.length + (formData.template === 'blank' ? 0 : 2)} starter block${selectedTemplate.sections.length === 1 ? '' : 's'}`,
        siteChrome: formData.template === 'blank' ? 'available from component library' : 'editable header, navigation, and footer seeded',
        forms: ['contact', 'registration'].includes(formData.template) ? 'Backy form API seeded' : 'none',
        dynamicData: formData.template === 'storefront'
            ? 'Backy products catalog placeholders'
            : formData.template === 'blog-index'
                ? 'Backy blog feed placeholders'
                : 'none',
        navigation: formData.navigationPlacement === 'none'
            ? { placement: 'none', parentPageId: selectedParentPage?.id || null }
            : {
                placement: formData.navigationPlacement,
                label: formData.navigationLabel.trim() || formData.title.trim() || 'Untitled page',
                parentPageId: selectedParentPage?.id || null,
                parentTitle: selectedParentPage?.title || null,
            },
        hierarchy: selectedParentPage
            ? { parentPageId: selectedParentPage.id, parentTitle: selectedParentPage.title, parentPath: getPagePublicPath(selectedParentPage) }
            : { parentPageId: null },
        seo: {
            title: effectiveSeoTitle || 'Untitled page',
            description: effectiveSeoDescription,
            canonical: normalizedCanonicalPath,
            keywords: effectiveKeywords,
            jsonLd: effectiveJsonLd,
            ogImage: formData.ogImage.trim() || null,
            robots: {
                index: !formData.noIndex,
                follow: !formData.noFollow,
            },
        },
    }), [
        formData.description,
        formData.isHomepage,
        formData.keywords,
        formData.jsonLdText,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.noFollow,
        formData.noIndex,
        formData.ogImage,
        formData.scheduledAt,
        formData.siteId,
        formData.status,
        formData.template,
        formData.title,
        effectiveSeoDescription,
        effectiveSeoTitle,
        effectiveKeywords,
        effectiveJsonLd,
        normalizedCanonicalPath,
        routeConflict,
        resolvedSlug,
        selectedSitePages.length,
        selectedParentPage,
        selectedTemplate.sections.length,
    ]);
    const creationHandoff = useMemo(() => ({
        generatedAt: new Date().toISOString(),
        endpoint: {
            method: 'POST',
            url: adminPagesUrl,
        },
        site: {
            id: formData.siteId,
            name: selectedSite?.name || formData.siteId,
            slug: selectedSite?.slug || formData.siteId,
        },
        route: {
            slug: resolvedSlug,
            path: routePreview,
            isHomepage: formData.isHomepage,
            availability: routeConflict
                ? {
                    status: 'conflict',
                    pageId: routeConflict.id,
                    title: routeConflict.title,
                    path: getPagePublicPath(routeConflict),
                }
                : {
                    status: 'available',
                    checkedPages: selectedSitePages.length,
                },
        },
        readiness: {
            score: pageCreationReadiness.score,
            checks: pageCreationReadiness.checks,
        },
        template: {
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            sections: selectedTemplate.sections,
            seedsFormApi: ['contact', 'registration'].includes(formData.template),
            seedsDynamicData: ['storefront', 'blog-index'].includes(formData.template),
            navigationPlacement: formData.navigationPlacement,
            navigationLabel: formData.navigationLabel.trim() || formData.title.trim() || 'Untitled page',
            parentPageId: selectedParentPage?.id || null,
            parentTitle: selectedParentPage?.title || null,
        },
        hierarchy: selectedParentPage
            ? {
                parentPageId: selectedParentPage.id,
                parentTitle: selectedParentPage.title,
                parentPath: getPagePublicPath(selectedParentPage),
                navigationBehavior: formData.navigationPlacement === 'none'
                    ? 'Stored in page meta only'
                    : `Nested under parent in ${formData.navigationPlacement} navigation`,
            }
            : {
                parentPageId: null,
                navigationBehavior: formData.navigationPlacement === 'none' ? 'No navigation change' : 'Top-level navigation item',
            },
        seo: {
            title: effectiveSeoTitle || formData.title.trim() || 'Untitled page',
            description: effectiveSeoDescription,
            canonical: normalizedCanonicalPath,
            keywords: effectiveKeywords,
            jsonLd: effectiveJsonLd,
            ogImage: formData.ogImage.trim() || null,
            robots: {
                index: !formData.noIndex,
                follow: !formData.noFollow,
            },
            renderPayloadKeys: ['seo.title', 'seo.description', 'seo.canonical', 'seo.keywords', 'seo.jsonLd', 'seo.openGraph.image', 'seo.robots'],
        },
        canvas: {
            width: DEFAULT_CANVAS_SIZE.width,
            height: getCanvasHeightForElements(buildTemplateElements({
                template: formData.template,
                title: formData.title.trim() || 'Untitled page',
                slug: resolvedSlug,
                description: formData.description,
            })),
            seededBlocks: selectedTemplate.sections.length,
            siteChrome: formData.template === 'blank' ? 'component library' : ['header', 'navigation', 'footer'],
        },
        payloadPreview: createPayloadPreview,
        nextStep: 'Created pages open directly in the visual editor for layout, grouping, media, binding, SEO, and publishing work.',
        guardrails: [
            'The creator blocks route and homepage collisions visible in the current page library; the backend remains final validation.',
            'Scheduled pages require a publish date before they can be created.',
            'Contact and registration templates seed editable form blocks that connect to Backy Forms and Contacts.',
            'Storefront and blog index templates seed dynamic data placeholders for products and posts.',
            'Non-blank templates seed editable header, navigation, and footer blocks so public frontend chrome is controlled from Backy.',
            'Navigation placement updates the site navigation settings after the page record is created.',
            'Parent placement stores page hierarchy in meta and nests navigation under the selected parent when navigation placement is enabled.',
            'SEO metadata is saved into page meta so render payloads, manifests, and custom frontends can use it immediately.',
            'Keywords and JSON-LD are generated by default and can be overridden before create.',
            'The canvas seed is serialized before persistence so the editor never starts from a blank record unless the user intentionally keeps the starter sparse.',
        ],
    }), [
        adminPagesUrl,
        createPayloadPreview,
        formData.description,
        formData.isHomepage,
        formData.keywords,
        formData.jsonLdText,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.noFollow,
        formData.noIndex,
        formData.ogImage,
        formData.scheduledAt,
        formData.siteId,
        formData.status,
        formData.template,
        formData.title,
        effectiveSeoDescription,
        effectiveSeoTitle,
        effectiveKeywords,
        effectiveJsonLd,
        normalizedCanonicalPath,
        pageCreationReadiness.checks,
        pageCreationReadiness.score,
        resolvedSlug,
        routeConflict,
        routePreview,
        selectedSitePages.length,
        selectedSite?.name,
        selectedSite?.slug,
        selectedParentPage,
        selectedTemplate.id,
        selectedTemplate.name,
        selectedTemplate.sections,
    ]);
    const creationHandoffText = useMemo(() => JSON.stringify(creationHandoff, null, 2), [creationHandoff]);
    const hasAutosaveContent = useMemo(() => (
        formData.title.trim().length > 0
        || formData.slug.trim().length > 0
        || formData.description.trim().length > 0
        || formData.template !== 'blank'
        || formData.status !== 'draft'
        || Boolean(formData.scheduledAt)
        || formData.isHomepage
        || formData.parentPageId.trim().length > 0
        || formData.navigationPlacement !== DEFAULT_NAVIGATION_PLACEMENT_BY_TEMPLATE[formData.template]
        || formData.navigationLabel.trim().length > 0
        || formData.seoTitle.trim().length > 0
        || formData.canonicalPath.trim().length > 0
        || formData.keywords.trim().length > 0
        || formData.jsonLdText.trim().length > 0
        || formData.ogImage.trim().length > 0
        || formData.noIndex
        || formData.noFollow
    ), [
        formData.canonicalPath,
        formData.description,
        formData.isHomepage,
        formData.keywords,
        formData.jsonLdText,
        formData.navigationLabel,
        formData.navigationPlacement,
        formData.parentPageId,
        formData.noFollow,
        formData.noIndex,
        formData.ogImage,
        formData.scheduledAt,
        formData.seoTitle,
        formData.slug,
        formData.status,
        formData.template,
        formData.title,
    ]);

    useEffect(() => {
        if (!hasHydratedAutosave || autosavePausedForRecovery || isLoading) {
            return;
        }

        if (!hasAutosaveContent) {
            window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
            setLastAutosavedAt(null);
            setAutosaveStatus('Autosave ready');
            return;
        }

        setAutosaveStatus('Saving draft...');
        const autosaveTimer = window.setTimeout(() => {
            try {
                const savedAt = new Date().toISOString();
                const draft: PageCreateAutosaveDraft = {
                    version: 1,
                    savedAt,
                    formData,
                };
                window.localStorage.setItem(PAGE_CREATE_AUTOSAVE_KEY, JSON.stringify(draft));
                setLastAutosavedAt(savedAt);
                setAutosaveStatus(`Autosaved ${new Date(savedAt).toLocaleTimeString()}`);
            } catch {
                setAutosaveStatus('Autosave failed');
            }
        }, 800);

        return () => window.clearTimeout(autosaveTimer);
    }, [
        autosavePausedForRecovery,
        formData,
        hasAutosaveContent,
        hasHydratedAutosave,
        isLoading,
    ]);

    const clearAutosavedDraft = () => {
        window.localStorage.removeItem(PAGE_CREATE_AUTOSAVE_KEY);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(null);
        setAutosaveStatus('Autosave ready');
    };

    const restoreRecoveredDraft = () => {
        if (!draftRecovery || isPageCreateBusy) return;

        setFormData(draftRecovery.formData);
        setDraftRecovery(null);
        setAutosavePausedForRecovery(false);
        setLastAutosavedAt(draftRecovery.savedAt);
        setAutosaveStatus('Recovered draft restored');
        setError(null);
        setNotice('Recovered local page draft.');
        navigate({ to: '/pages/new', search: buildRouteSearchFromForm(draftRecovery.formData), replace: true });
    };

    const discardRecoveredDraft = () => {
        if (isPageCreateBusy) return;

        clearAutosavedDraft();
        setError(null);
        setNotice('Recovered draft discarded.');
    };

    const autosaveLabel = draftRecovery
        ? `Recovery from ${new Date(draftRecovery.savedAt).toLocaleTimeString()}`
        : lastAutosavedAt
            ? `Autosaved ${new Date(lastAutosavedAt).toLocaleTimeString()}`
            : autosaveStatus;

    const copyCreationText = async (value: string, label: string) => {
        if (isPageCreateBusy) return;

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
        if (isPageCreateBusy) return;

        const blob = new Blob([creationHandoffText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${resolvedSlug || 'new-page'}-backy-page-create-handoff.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setError(null);
        setNotice('Page creation handoff manifest downloaded.');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isPageCreateBusy) return;

        if (!canSubmit) {
            if (routeConflict) {
                setError(`Route ${routePreview} is already used by "${routeConflict.title}". Choose another slug or edit that page first`);
            } else if (!hasSchedule) {
                setError('Choose a publish date before creating a scheduled page');
            } else if (!hasNavigationLabel) {
                setError('Add a navigation label or choose not to add this page to navigation.');
            } else if (!jsonLdValid) {
                setError(jsonLdResult.message);
            } else {
                setError('Add a page title and select a site before creating the page.');
            }
            setNotice(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setNotice(null);
        setRouteCheckError(null);

        const title = formData.title.trim();
        const slug = resolvedSlug;
        const content = createInitialPageContent({
            template: formData.template,
            title,
            slug,
            status: formData.status,
            description: formData.description,
        });

        const input = {
            title,
            slug,
            siteId: formData.siteId,
            status: formData.status,
            scheduledAt: formData.status === 'scheduled' ? formData.scheduledAt : null,
            template: formData.template,
            description: formData.description,
            isHomepage: formData.isHomepage,
            parentId: selectedParentPage?.id || null,
            meta: {
                title: effectiveSeoTitle || title,
                description: formData.description,
                canonical: normalizedCanonicalPath,
                keywords: effectiveKeywords,
                jsonLd: effectiveJsonLd,
                ogImage: formData.ogImage.trim() || undefined,
                noIndex: formData.noIndex,
                noFollow: formData.noFollow,
                template: formData.template,
                navigationPlacement: formData.navigationPlacement,
                navigationLabel: formData.navigationLabel.trim() || title,
                parentPageId: selectedParentPage?.id || undefined,
                parentPageTitle: selectedParentPage?.title || undefined,
            },
            content,
        };

        try {
            const created = await createPage(formData.siteId, input);
            try {
                await applyPageNavigationPlacement({
                    siteId: formData.siteId,
                    page: created,
                    placement: formData.navigationPlacement,
                    label: formData.navigationLabel.trim() || title,
                    parentPage: selectedParentPage,
                });
            } catch (navigationError) {
                console.warn('Page was created, but navigation placement failed.', navigationError);
            }
            clearAutosavedDraft();
            setPages([created, ...pages.filter((page) => page.id !== created.id)]);
            navigate({ to: '/pages/$pageId/edit', params: { pageId: created.id }, search: { siteId: formData.siteId } });
        } catch (createError) {
            setError(createError instanceof Error
                ? `${createError.message}. The page was not created because the backend did not persist it.`
                : 'Unable to create page. The page was not persisted.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageShell
            title="Create page"
            description={selectedSite ? `Add a routable, editable page to ${selectedSite.name}.` : 'Add a new page to your site.'}
            action={
                <button
                    type="button"
                    onClick={() => {
                        if (isPageCreateBusy) return;
                        navigate({ to: '/pages', search: { siteId: formData.siteId } });
                    }}
                    disabled={isPageCreateBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Pages
                </button>
            }
            className="w-full min-w-0"
        >
            <section className="mb-6 min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="page-creation-command-center">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">Page creation command center</h2>
                            <span className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-semibold',
                                pageCreationReadiness.score >= 80
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700',
                            )}
                            >
                                {pageCreationReadiness.score}% ready
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
                            Prepare the public route, metadata, template seed, publish state, and editor handoff before creating the page.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void copyCreationText(creationHandoffText, 'Page creation handoff manifest')}
                            disabled={isPageCreateBusy}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Copy className="h-4 w-4" />
                            Copy handoff
                        </button>
                        <button
                            type="button"
                            onClick={downloadCreationHandoff}
                            disabled={isPageCreateBusy}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Download className="h-4 w-4" />
                            Download JSON
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (isPageCreateBusy) return;
                                navigate({ to: '/sites/new' });
                            }}
                            disabled={isPageCreateBusy}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Globe className="h-4 w-4" />
                            Create site
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                    <div className="rounded-lg border border-border bg-background p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold">Creation readiness</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Checks whether this page will open in the editor with a usable route, metadata, canvas, and publish plan.
                                </p>
                            </div>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                                {formData.template}
                            </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className={cn(
                                    'h-full rounded-full',
                                    pageCreationReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                                )}
                                style={{ width: `${pageCreationReadiness.score}%` }}
                            />
                        </div>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {pageCreationReadiness.checks.map((check) => (
                                <PageCreationCheck key={check.label} {...check} />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">Create-to-editor workflow</h3>
                        </div>
                        <div className="mt-3 grid gap-2">
                            {pageCreationReadiness.workflow.map((step, index) => (
                                <PageCreationWorkflowStep key={step.label} index={index + 1} {...step} />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-background p-4">
                    <div>
                        <h3 className="text-sm font-semibold">Creation control map</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Jump through the decisions that make a page routable, editable, and ready for custom frontend APIs.
                        </p>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {PAGE_CREATION_AREAS.map((area) => (
                            <a
                                key={area.title}
                                href={area.href}
                                aria-disabled={isPageCreateBusy}
                                onClick={(event) => {
                                    if (isPageCreateBusy) event.preventDefault();
                                }}
                                className={cn(
                                    'rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                                    isPageCreateBusy && 'pointer-events-none opacity-60',
                                )}
                            >
                                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                {error && (
                    <div className="xl:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{error}</span>
                            {routeCheckError && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isPageCreateBusy) return;
                                        setRouteCheckRetry((value) => value + 1);
                                    }}
                                    disabled={isPageCreateBusy}
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <RefreshCw className={cn('h-3.5 w-3.5', isCheckingPages && 'animate-spin')} />
                                    Retry route check
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {notice && (
                    <div className="xl:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        {notice}
                    </div>
                )}

                {draftRecovery && (
                    <div className="xl:col-span-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-testid="page-create-recovery">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                Local autosave found a page draft from {new Date(draftRecovery.savedAt).toLocaleString()} for {draftRecovery.formData.siteId}.
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={discardRecoveredDraft}
                                    disabled={isPageCreateBusy}
                                    className="inline-flex items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Discard recovery
                                </button>
                                <button
                                    type="button"
                                    onClick={restoreRecoveredDraft}
                                    disabled={isPageCreateBusy}
                                    className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Restore draft
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="min-w-0 space-y-6">
                    <div id="page-basics" className="space-y-6 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                                <FileText className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Page basics</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    The title, route, status, and template are saved through the pages API.
                                </p>
                            </div>
                        </div>
                        {/* Site Selection */}
                        <div>
                            <label htmlFor="page-target-site" className="mb-2 block text-sm font-medium">Target site</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                <select
                                    id="page-target-site"
                                    value={formData.siteId}
                                    onChange={(e) => selectPageSite(e.target.value)}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    required
                                >
                                    <option value="" disabled>Select a site...</option>
                                    {sites.map(site => (
                                        <option key={site.id} value={site.publicSiteId || site.id}>{site.name}</option>
                                    ))}
                                </select>
                            </div>
                            {sites.length === 0 && (
                                <p className="text-sm text-yellow-600 mt-1">
                                    You need to create a site first!
                                </p>
                            )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-title" className="mb-2 block text-sm font-medium">Page title</label>
                                <input
                                    id="page-title"
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => updatePageDraft({
                                        title: e.target.value,
                                        slug: formData.slug ? formData.slug : slugify(e.target.value),
                                        navigationLabel: formData.navigationLabel ? formData.navigationLabel : e.target.value,
                                        seoTitle: formData.seoTitle ? formData.seoTitle : e.target.value,
                                    })}
                                    placeholder="About us"
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    required
                                />
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <label htmlFor="page-slug" className="block text-sm font-medium">URL slug</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!canSyncSlugFromTitle) return;
                                            updatePageDraft({ slug: titleDerivedSlug });
                                        }}
                                        disabled={!canSyncSlugFromTitle}
                                        data-testid="page-slug-use-title"
                                        className="text-xs font-semibold text-primary transition hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
                                    >
                                        Use title
                                    </button>
                                </div>
                                <div className="flex items-center">
                                    <span className="rounded-l-lg border border-r-0 bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                                        /
                                    </span>
                                    <input
                                        id="page-slug"
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => updatePageDraft({ slug: slugify(e.target.value) })}
                                        placeholder="about"
                                        disabled={isPageCreateBusy || formData.isHomepage}
                                        className="min-w-0 flex-1 rounded-r-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-description" className="mb-2 block text-sm font-medium">SEO description</label>
                            <textarea
                                id="page-description"
                                value={formData.description}
                                onChange={(e) => updatePageDraft({ description: e.target.value })}
                                placeholder="Short summary for search previews and frontend route metadata."
                                rows={3}
                                disabled={isPageCreateBusy}
                                className="w-full resize-none rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>

                        <label className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 transition hover:bg-accent',
                            isPageCreateBusy && 'cursor-not-allowed opacity-70'
                        )}>
                            <input
                                type="checkbox"
                                checked={formData.isHomepage}
                                disabled={isPageCreateBusy}
                                onChange={(e) => {
                                    const isHomepage = e.target.checked;
                                    updatePageDraft({
                                        isHomepage,
                                        slug: isHomepage ? 'home' : formData.slug,
                                        parentPageId: isHomepage ? '' : formData.parentPageId,
                                    });
                                }}
                                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                            />
                            <span>
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <Home className="h-4 w-4" />
                                    Set as homepage route
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                    Creates the page as `/` for the selected site. Backy checks the current page library before create.
                                </span>
                            </span>
                        </label>

                        {routeConflict && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="page-route-conflict">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="font-semibold">Route already exists</div>
                                        <p className="mt-1">
                                            {routePreview} is already used by {routeConflict.title}. Choose a different slug, unset homepage, or edit the existing page.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isPageCreateBusy) return;
                                            navigate({
                                                to: '/pages/$pageId/edit',
                                                params: { pageId: routeConflict.id },
                                                search: { siteId: formData.siteId },
                                            });
                                        }}
                                        disabled={isPageCreateBusy}
                                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Open existing page
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-border bg-background p-4" data-testid="page-navigation-placement">
                            <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <Menu className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-foreground">Navigation placement</h3>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                        Add the new page to site navigation so hosted pages, manifests, render payloads, and custom frontends can expose it immediately after publish.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
                                <div>
                                    <label htmlFor="page-navigation-placement-select" className="mb-2 block text-sm font-medium">Placement</label>
                                    <select
                                        id="page-navigation-placement-select"
                                        value={formData.navigationPlacement}
                                        onChange={(event) => updatePageDraft({
                                            navigationPlacement: event.target.value as PageNavigationPlacement,
                                            navigationLabel: formData.navigationLabel || formData.title,
                                        })}
                                        disabled={isPageCreateBusy}
                                        className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <option value="none">Do not add</option>
                                        <option value="primary">Primary menu</option>
                                        <option value="footer">Footer menu</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="page-navigation-label" className="mb-2 block text-sm font-medium">Menu label</label>
                                    <input
                                        id="page-navigation-label"
                                        type="text"
                                        value={formData.navigationLabel}
                                        onChange={(event) => updatePageDraft({ navigationLabel: event.target.value })}
                                        placeholder={formData.title || 'Navigation label'}
                                        disabled={isPageCreateBusy || formData.navigationPlacement === 'none'}
                                        className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="page-parent-page" className="mb-2 block text-sm font-medium">Parent page</label>
                                <select
                                    id="page-parent-page"
                                    value={formData.parentPageId}
                                    onChange={(event) => updatePageDraft({ parentPageId: event.target.value })}
                                    disabled={isPageCreateBusy || formData.isHomepage || selectableParentPages.length === 0}
                                    className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">Top-level page</option>
                                    {selectableParentPages.map((page) => (
                                        <option key={page.id} value={page.id}>
                                            {page.isHomepage ? 'Home' : page.title} ({getPagePublicPath(page)})
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                    {selectedParentPage
                                        ? `Backy will save ${selectedParentPage.title} as the parent and nest this page beneath it when menu placement is enabled.`
                                        : formData.isHomepage
                                            ? 'Homepage routes stay at the top level.'
                                        : 'Top-level pages can still be moved into navigation groups from site settings later.'}
                                </p>
                            </div>
                            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                                {formData.navigationPlacement === 'none'
                                    ? selectedParentPage
                                        ? 'The page record will keep its parent metadata without changing site navigation.'
                                        : 'The page record will be created without changing site navigation.'
                                    : selectedParentPage
                                        ? `Backy will nest this page under ${selectedParentPage.title} in the ${formData.navigationPlacement} menu after create.`
                                        : `Backy will append this page to the ${formData.navigationPlacement} menu after create.`}
                            </div>
                        </div>
                    </div>

                    <div id="page-seo" className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
                                <Search className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">SEO and social metadata</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    These values are saved into page meta and exposed through the public render payload for custom frontends.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="text-blue-700 text-lg hover:underline">
                                {effectiveSeoTitle || 'Page Title'}
                            </div>
                            <div className="mt-1 text-sm text-green-700">
                                {selectedSite?.slug || selectedSite?.name || 'site'}{normalizedCanonicalPath}
                            </div>
                            <div className="mt-1 text-sm leading-5 text-muted-foreground">
                                {effectiveSeoDescription || 'Page description will appear here...'}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-seo-title" className="mb-2 block text-sm font-medium">Search title</label>
                                <input
                                    id="page-seo-title"
                                    type="text"
                                    value={formData.seoTitle}
                                    onChange={(event) => updatePageDraft({ seoTitle: event.target.value })}
                                    placeholder={formData.title || 'Search result title'}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <div className="mt-1 text-xs text-muted-foreground">{effectiveSeoTitle.length} characters</div>
                            </div>

                            <div>
                                <label htmlFor="page-canonical-path" className="mb-2 block text-sm font-medium">Canonical path</label>
                                <input
                                    id="page-canonical-path"
                                    type="text"
                                    value={formData.canonicalPath}
                                    onChange={(event) => updatePageDraft({ canonicalPath: event.target.value })}
                                    placeholder={routePreview}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-card px-4 py-2.5 font-mono text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <div className={cn('mt-1 text-xs', canonicalValid ? 'text-muted-foreground' : 'text-amber-700')}>
                                    {normalizedCanonicalPath}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-seo-keywords" className="mb-2 block text-sm font-medium">Keywords</label>
                            <input
                                id="page-seo-keywords"
                                type="text"
                                value={formData.keywords}
                                onChange={(event) => updatePageDraft({ keywords: event.target.value })}
                                placeholder={defaultKeywordText || 'brand, service, page topic'}
                                disabled={isPageCreateBusy}
                                className="w-full rounded-lg border bg-card px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <div className="mt-1 text-xs text-muted-foreground">
                                {effectiveKeywords.length} keyword{effectiveKeywords.length === 1 ? '' : 's'} will be saved into page meta.
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-json-ld" className="mb-2 block text-sm font-medium">JSON-LD structured data</label>
                            <textarea
                                id="page-json-ld"
                                value={formData.jsonLdText}
                                onChange={(event) => updatePageDraft({ jsonLdText: event.target.value })}
                                placeholder={JSON.stringify(defaultJsonLd, null, 2)}
                                rows={7}
                                disabled={isPageCreateBusy}
                                className={cn(
                                    'w-full resize-y rounded-lg border bg-card px-4 py-2.5 font-mono text-xs leading-5 outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                                    !jsonLdValid && 'border-amber-300 focus:ring-amber-300',
                                )}
                            />
                            <div className={cn('mt-1 text-xs', jsonLdValid ? 'text-muted-foreground' : 'text-amber-700')}>
                                {jsonLdValid
                                    ? `${effectiveJsonLd.length} JSON-LD object${effectiveJsonLd.length === 1 ? '' : 's'} will be saved. Leave empty to use the generated default.`
                                    : jsonLdResult.message}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="page-og-image" className="mb-2 block text-sm font-medium">Open Graph image URL</label>
                            <div className="relative">
                                <ImageIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    id="page-og-image"
                                    type="url"
                                    value={formData.ogImage}
                                    onChange={(event) => updatePageDraft({ ogImage: event.target.value })}
                                    placeholder="https://..."
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <label className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:bg-accent',
                                isPageCreateBusy && 'cursor-not-allowed opacity-70',
                            )}>
                                <input
                                    type="checkbox"
                                    checked={formData.noIndex}
                                    onChange={(event) => updatePageDraft({ noIndex: event.target.checked })}
                                    disabled={isPageCreateBusy}
                                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                                />
                                <span>
                                    <span className="block text-sm font-semibold">No index</span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask search engines not to index this page.</span>
                                </span>
                            </label>

                            <label className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:bg-accent',
                                isPageCreateBusy && 'cursor-not-allowed opacity-70',
                            )}>
                                <input
                                    type="checkbox"
                                    checked={formData.noFollow}
                                    onChange={(event) => updatePageDraft({ noFollow: event.target.checked })}
                                    disabled={isPageCreateBusy}
                                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                                />
                                <span>
                                    <span className="block text-sm font-semibold">No follow</span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask search engines not to follow links from this page.</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div id="page-design" className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Starter design</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Templates seed real editable canvas elements instead of leaving the editor empty.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {TEMPLATE_OPTIONS.map((tmpl) => (
                                    <label
                                        key={tmpl.id}
                                        className={cn(
                                            'flex cursor-pointer flex-col rounded-lg border p-3 transition-all hover:shadow-sm',
                                            formData.template === tmpl.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50',
                                            isPageCreateBusy && 'cursor-not-allowed opacity-70'
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="template"
                                            value={tmpl.id}
                                            checked={formData.template === tmpl.id}
                                            onChange={(e) => handleTemplateChange(e.target.value as PageTemplate)}
                                            disabled={isPageCreateBusy}
                                            className="sr-only"
                                        />
                                        <div className="mb-1 flex items-center gap-2">
                                            <Layout className={cn(
                                                'h-4 w-4',
                                                formData.template === tmpl.id ? 'text-primary' : 'text-muted-foreground'
                                            )} />
                                            <span className="font-semibold">{tmpl.name}</span>
                                        </div>
                                        <TemplateVisualPreview template={tmpl.id} active={formData.template === tmpl.id} />
                                        <span className="text-xs leading-5 text-muted-foreground">{tmpl.desc}</span>
                                        <span className="mt-3 flex flex-wrap gap-1">
                                            {tmpl.sections.map((section) => (
                                                <span key={section} className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                                    {section}
                                                </span>
                                            ))}
                                        </span>
                                    </label>
                            ))}
                        </div>

                        <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.9fr)]">
                            <TemplateVisualPreview template={formData.template} active={true} size="large" testId="page-selected-template-preview" />
                            <div className="space-y-3">
                                <div>
                                    <div className="text-sm font-semibold text-foreground">{selectedTemplate.name} canvas seed</div>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedTemplate.detail}</p>
                                </div>
                                <dl className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-1">
                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                        <dt className="font-medium text-muted-foreground">Canvas</dt>
                                        <dd className="mt-1 font-semibold text-foreground">{DEFAULT_CANVAS_SIZE.width} x {DEFAULT_CANVAS_SIZE.height}</dd>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                        <dt className="font-medium text-muted-foreground">Chrome</dt>
                                        <dd className="mt-1 font-semibold text-foreground">{formData.template === 'blank' ? 'Library only' : 'Header, nav, footer'}</dd>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                                        <dt className="font-medium text-muted-foreground">Blocks</dt>
                                        <dd className="mt-1 font-semibold text-foreground">{selectedTemplate.sections.length} starter sections</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="page-status" className="mb-2 block text-sm font-medium">Status</label>
                                <select
                                    id="page-status"
                                    value={formData.status}
                                    onChange={(e) => {
                                        const status = e.target.value as typeof formData.status;
                                        updatePageDraft({
                                            status,
                                            scheduledAt: status === 'scheduled' ? formData.scheduledAt : null,
                                        });
                                    }}
                                    disabled={isPageCreateBusy}
                                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="scheduled">Scheduled</option>
                                </select>
                            </div>

                            {formData.status === 'scheduled' && (
                                <div>
                                    <label htmlFor="page-scheduled-at" className="mb-2 block text-sm font-medium">Publish date</label>
                                    <input
                                        id="page-scheduled-at"
                                        type="datetime-local"
                                        value={toDateTimeLocalValue(formData.scheduledAt)}
                                        onChange={(e) => updatePageDraft({
                                            scheduledAt: fromDateTimeLocalValue(e.target.value),
                                        })}
                                        disabled={isPageCreateBusy}
                                        className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        required
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        {submitBlockerMessage && (
                            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div>
                                    <div className="font-semibold">Create is blocked</div>
                                    <div className="mt-0.5">{submitBlockerMessage}</div>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isPageCreateBusy) return;
                                    navigate({ to: '/pages', search: { siteId: formData.siteId } });
                                }}
                                disabled={isPageCreateBusy}
                                className="rounded-lg border px-6 py-2.5 font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isPageCreateBusy || !canSubmit}
                                title={submitBlockerMessage || 'Create page and open the visual editor'}
                                aria-disabled={isPageCreateBusy || !canSubmit}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-lg px-6 py-2.5',
                                    'bg-primary text-primary-foreground font-medium',
                                    'shadow-md hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
                                )}
                            >
                                <Save className="w-4 h-4" />
                                {isLoading ? 'Creating...' : isCheckingPages ? 'Checking routes...' : 'Create Page'}
                            </button>
                        </div>
                    </div>
                </form>

                <aside className="min-w-0 space-y-4">
                    <section id="page-preview" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                                <Globe className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Route preview</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    This is the frontend path created for the selected site.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-lg border border-border bg-background px-3 py-3 font-mono text-sm">
                            {selectedSite?.slug || selectedSite?.name || 'site'}{routePreview}
                        </div>
                        {routeConflict && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                Conflicts with {routeConflict.title}. This create action is blocked until the route is available.
                            </div>
                        )}
                        <dl className="mt-4 space-y-3 text-sm">
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Template</dt>
                                <dd className="mt-1 font-semibold text-foreground">{selectedTemplate.name}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Canvas</dt>
                                <dd className="mt-1 text-foreground">{DEFAULT_CANVAS_SIZE.width} x {DEFAULT_CANVAS_SIZE.height}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                                <dd className="mt-1 capitalize text-foreground">{formData.status}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-muted-foreground">Availability</dt>
                                <dd className={cn('mt-1 font-medium', routeConflict ? 'text-amber-700' : 'text-emerald-700')}>
                                    {routeConflict ? 'Route conflict' : `${selectedSitePages.length} existing page${selectedSitePages.length === 1 ? '' : 's'} checked`}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Layout className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">{selectedTemplate.name}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">{selectedTemplate.detail}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            {selectedTemplate.sections.map((section) => (
                                <div key={section} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    {section}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section id="page-payload" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
                        <div className="flex items-start gap-3">
                            <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                                <Code2 className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Create payload</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    The submit action sends page metadata plus seeded canvas content.
                                </p>
                            </div>
                        </div>
                        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify(createPayloadPreview, null, 2)}
                        </pre>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void copyCreationText(adminPagesUrl, 'Page create API URL')}
                                disabled={isPageCreateBusy}
                                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Copy className="h-4 w-4" />
                                Copy URL
                            </button>
                            <button
                                type="button"
                                onClick={() => void copyCreationText(creationHandoffText, 'Page creation handoff manifest')}
                                disabled={isPageCreateBusy}
                                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Copy className="h-4 w-4" />
                                Copy handoff
                            </button>
                        </div>
                    </section>
                </aside>
            </div>
        </PageShell>
    );
}

function PageCreationCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
    const Icon = ready ? CheckCircle2 : AlertTriangle;

    return (
        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function PageCreationWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {index}
            </span>
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function TemplateVisualPreview({
    template,
    active,
    size = 'card',
    testId,
}: {
    template: PageTemplate;
    active: boolean;
    size?: 'card' | 'large';
    testId?: string;
}) {
    const hasChrome = template !== 'blank';
    const blocks = templatePreviewBlocks[template];

    return (
        <div
            data-testid={testId || `page-template-preview-${template}`}
            data-active={active ? 'true' : 'false'}
            data-template={template}
            data-block-count={blocks.length}
            className={cn(
                'my-3 overflow-hidden rounded-lg border bg-background shadow-sm',
                active ? 'border-primary/50' : 'border-border',
            )}
        >
            <div className={cn('relative overflow-hidden bg-slate-50', size === 'large' ? 'h-44' : 'h-28')}>
                <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] [background-size:12px_12px]" />
                {hasChrome && (
                    <>
                        <div className="absolute left-2 right-2 top-2 flex h-5 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <span className="h-1.5 w-8 rounded-full bg-slate-300" />
                            <span className="ml-auto h-1.5 w-5 rounded-full bg-slate-200" />
                            <span className="h-1.5 w-5 rounded-full bg-slate-200" />
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 h-4 rounded-md border border-slate-200 bg-white/90" />
                    </>
                )}
                {blocks.map((block, index) => (
                    <div
                        key={`${template}-preview-${index}`}
                        className={cn(
                            'absolute rounded-md border text-[9px] font-semibold leading-none text-slate-700 shadow-sm',
                            block.className,
                        )}
                        style={{
                            left: `${block.x}%`,
                            top: `${block.y}%`,
                            width: `${block.w}%`,
                            height: `${block.h}%`,
                        }}
                    >
                        {block.label && (
                            <span className="absolute left-1 top-1 rounded bg-white/85 px-1 py-0.5">{block.label}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

const isRecoverablePageCreateDraft = (value: Partial<PageCreateAutosaveDraft>): value is PageCreateAutosaveDraft => {
    const formData = value.formData;

    return (
        value.version === 1
        && typeof value.savedAt === 'string'
        && Boolean(formData)
        && typeof formData?.title === 'string'
        && typeof formData.slug === 'string'
        && typeof formData.siteId === 'string'
        && isPageTemplate(formData.template)
        && isPageCreationStatus(formData.status)
        && (typeof formData.scheduledAt === 'string' || formData.scheduledAt === null)
        && typeof formData.isHomepage === 'boolean'
        && typeof formData.description === 'string'
        && typeof formData.parentPageId === 'string'
        && isPageNavigationPlacement(formData.navigationPlacement)
        && typeof formData.navigationLabel === 'string'
        && typeof formData.seoTitle === 'string'
        && typeof formData.canonicalPath === 'string'
        && typeof formData.keywords === 'string'
        && typeof formData.jsonLdText === 'string'
        && typeof formData.ogImage === 'string'
        && typeof formData.noIndex === 'boolean'
        && typeof formData.noFollow === 'boolean'
    );
};

async function applyPageNavigationPlacement(input: {
    siteId: string;
    page: Page;
    placement: PageNavigationPlacement;
    label: string;
    parentPage: Page | null;
}) {
    if (input.placement === 'none') {
        return;
    }

    const currentNavigation = await getSiteNavigation(input.siteId);
    const nextNavigation = appendPageToNavigation(
        currentNavigation.settings,
        input.placement,
        input.page,
        input.label,
        input.parentPage,
    );

    await updateSiteNavigation(input.siteId, nextNavigation);
}

function appendPageToNavigation(
    navigation: SiteNavigationConfig,
    placement: Exclude<PageNavigationPlacement, 'none'>,
    page: Page,
    label: string,
    parentPage: Page | null,
): SiteNavigationConfig {
    const stripPageItem = (items: SiteNavigationConfigItem[] | undefined): SiteNavigationConfigItem[] => (
        (items || [])
            .filter((item) => item.pageId !== page.id)
            .map((item) => ({
                ...item,
                children: stripPageItem(item.children),
            }))
    );
    const nextItem: SiteNavigationConfigItem = {
        id: `nav_page_${page.id}`,
        type: 'page',
        label: label.trim() || page.title,
        pageId: page.id,
        target: '_self',
        visible: true,
        children: [],
    };
    const nextPrimary = stripPageItem(navigation.primary);
    const nextFooter = stripPageItem(navigation.footer);
    const parentItem = parentPage
        ? {
            id: `nav_page_${parentPage.id}`,
            type: 'page' as const,
            label: parentPage.title,
            pageId: parentPage.id,
            target: '_self' as const,
            visible: true,
            children: [],
        }
        : null;
    const insertAsChild = (items: SiteNavigationConfigItem[]): { items: SiteNavigationConfigItem[]; inserted: boolean } => {
        if (!parentItem) {
            return { items, inserted: false };
        }

        let inserted = false;
        const nextItems = items.map((item) => {
            const childResult = insertAsChild(item.children || []);

            if (item.pageId === parentItem.pageId) {
                inserted = true;
                return {
                    ...item,
                    children: [...stripPageItem(item.children), nextItem],
                };
            }

            if (childResult.inserted) {
                inserted = true;
                return {
                    ...item,
                    children: childResult.items,
                };
            }

            return item;
        });

        return { items: nextItems, inserted };
    };
    const ensureParentWithChild = (items: SiteNavigationConfigItem[]) => {
        if (!parentItem) return [...items, nextItem];
        const result = insertAsChild(items);
        if (result.inserted) return result.items;
        return [...items, { ...parentItem, children: [nextItem] }];
    };

    if (placement === 'primary') {
        const primary = page.isHomepage ? [nextItem, ...nextPrimary] : ensureParentWithChild(nextPrimary);
        return {
            ...navigation,
            primary,
            footer: nextFooter,
        };
    }

    return {
        ...navigation,
        primary: nextPrimary,
        footer: ensureParentWithChild(nextFooter),
    };
}

function createInitialPageContent(input: {
    template: PageTemplate;
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled';
    description: string;
}) {
    const elements = buildTemplateElements(input);
    return JSON.parse(serializeCanvasContent(elements, {
        ...DEFAULT_CANVAS_SIZE,
        height: getCanvasHeightForElements(elements),
    }, undefined, {
        documentId: `page_${input.slug || 'new-page'}`,
        kind: 'page',
        title: input.title,
        slug: input.slug,
        status: input.status,
        locale: 'en',
    }));
}

function buildTemplateElements(input: {
    template: PageTemplate;
    title: string;
    slug?: string;
    description: string;
}): CanvasElement[] {
    const title = input.title || 'New page';
    const description = input.description || 'Use this space to explain the promise of this page and guide visitors to the next action.';
    const formSlug = slugify(input.slug || title || 'new-page');
    const withChrome = (elements: CanvasElement[]) => withPageChrome(elements, {
        title,
        variant: input.template,
        navItems: templateNavigationItems[input.template],
        headerActionLabel: input.template === 'storefront' ? 'Shop now' : 'Contact',
    });

    if (input.template === 'landing') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'landing-hero-section',
                width: 1200,
                height: 430,
                props: { backgroundColor: '#0f172a', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 72, 72, {
                        id: 'landing-hero-heading',
                        width: 560,
                        height: 120,
                        props: { content: title, level: 'h1', fontSize: 54, fontWeight: '800', lineHeight: 1.05, color: '#ffffff' },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'landing-hero-copy',
                        width: 520,
                        height: 90,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#cbd5e1' },
                    }),
                    createCanvasElement('button', 76, 326, {
                        id: 'landing-hero-button',
                        width: 180,
                        height: 52,
                        props: { label: 'Get started', backgroundColor: '#14b8a6', color: '#042f2e', borderRadius: 8, fontSize: 16, fontWeight: '700' },
                    }),
                    createCanvasElement('box', 720, 76, {
                        id: 'landing-hero-media',
                        width: 360,
                        height: 260,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#334155', borderWidth: 1, borderStyle: 'solid' },
                    }),
                ],
            }),
            createCanvasElement('section', 0, 430, {
                id: 'landing-feature-section',
                width: 1200,
                height: 330,
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: ['Design freely', 'Bind content', 'Publish faster'].map((item, index) => createCanvasElement('box', 72 + index * 360, 76, {
                    id: `landing-feature-${index}`,
                    width: 320,
                    height: 160,
                    props: { backgroundColor: '#f8fafc', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                    children: [
                        createCanvasElement('heading', 22, 24, {
                            id: `landing-feature-heading-${index}`,
                            width: 260,
                            height: 40,
                            props: { content: item, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
                        }),
                        createCanvasElement('paragraph', 22, 80, {
                            id: `landing-feature-copy-${index}`,
                            width: 250,
                            height: 60,
                            props: { content: 'Edit this block, save it as a section, or connect it to Backy data.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                        }),
                    ],
                })),
            }),
        ]);
    }

    if (input.template === 'storefront') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'storefront-hero-section',
                width: 1200,
                height: 380,
                dataBindings: [{ source: 'products', mode: 'featured', limit: 1 }],
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 72, 70, {
                        id: 'storefront-heading',
                        width: 520,
                        height: 112,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                    }),
                    createCanvasElement('paragraph', 76, 204, {
                        id: 'storefront-copy',
                        width: 500,
                        height: 78,
                        props: { content: description, fontSize: 18, lineHeight: 1.55, color: '#4b5563' },
                    }),
                    createCanvasElement('button', 76, 306, {
                        id: 'storefront-shop-button',
                        width: 178,
                        height: 50,
                        props: { label: 'Shop products', href: '#products', backgroundColor: '#0f766e', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: '700' },
                    }),
                    createCanvasElement('box', 720, 54, {
                        id: 'storefront-featured-product',
                        width: 350,
                        height: 280,
                        dataBindings: [{ source: 'products', mode: 'featured', fields: ['title', 'price', 'image', 'slug'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#dbe3ea', borderWidth: 1, borderStyle: 'solid', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.10)' },
                        children: [
                            createCanvasElement('box', 24, 24, {
                                id: 'storefront-featured-media',
                                width: 302,
                                height: 150,
                                props: { backgroundColor: '#e6f3f1', borderRadius: 8 },
                            }),
                            createCanvasElement('heading', 24, 196, {
                                id: 'storefront-featured-title',
                                width: 220,
                                height: 30,
                                props: { content: 'Featured product', level: 'h3', fontSize: 20, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('text', 24, 234, {
                                id: 'storefront-featured-price',
                                width: 120,
                                height: 26,
                                props: { content: '$49', fontSize: 17, fontWeight: '700', color: '#0f766e' },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 380, {
                id: 'storefront-products-section',
                width: 1200,
                height: 380,
                dataBindings: [{ source: 'products', mode: 'list', limit: 6, sort: 'manual' }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 72, 50, {
                        id: 'storefront-products-heading',
                        width: 420,
                        height: 46,
                        props: { content: 'Product catalog', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                    }),
                    ...['Digital kit', 'Service package', 'Featured item'].map((item, index) => createCanvasElement('box', 72 + index * 360, 132, {
                        id: `storefront-product-card-${index}`,
                        width: 318,
                        height: 198,
                        dataBindings: [{ source: 'products', mode: 'item', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 22, {
                                id: `storefront-product-title-${index}`,
                                width: 230,
                                height: 34,
                                props: { content: item, level: 'h3', fontSize: 21, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 20, 70, {
                                id: `storefront-product-copy-${index}`,
                                width: 240,
                                height: 54,
                                props: { content: 'Bind this card to product title, media, price, and detail URL.', fontSize: 14, lineHeight: 1.45, color: '#4b5563' },
                            }),
                            createCanvasElement('button', 20, 142, {
                                id: `storefront-product-button-${index}`,
                                width: 128,
                                height: 38,
                                props: { label: 'View item', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontSize: 14, fontWeight: '700' },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'blog-index') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'blog-index-hero-section',
                width: 1200,
                height: 330,
                dataBindings: [{ source: 'blog', mode: 'latest', limit: 1 }],
                props: { backgroundColor: '#111827', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('text', 74, 62, {
                        id: 'blog-index-kicker',
                        width: 220,
                        height: 28,
                        props: { content: 'Publication', fontSize: 13, fontWeight: '800', color: '#7dd3fc', textTransform: 'uppercase' },
                    }),
                    createCanvasElement('heading', 72, 98, {
                        id: 'blog-index-heading',
                        width: 640,
                        height: 96,
                        props: { content: title, level: 'h1', fontSize: 50, fontWeight: '800', lineHeight: 1.08, color: '#ffffff' },
                    }),
                    createCanvasElement('paragraph', 76, 210, {
                        id: 'blog-index-copy',
                        width: 560,
                        height: 72,
                        props: { content: description, fontSize: 17, lineHeight: 1.55, color: '#d1d5db' },
                    }),
                    createCanvasElement('box', 790, 70, {
                        id: 'blog-index-featured-card',
                        width: 300,
                        height: 190,
                        dataBindings: [{ source: 'blog', mode: 'featured', fields: ['title', 'excerpt', 'slug', 'publishedAt'] }],
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#374151', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('text', 22, 24, {
                                id: 'blog-index-featured-label',
                                width: 160,
                                height: 22,
                                props: { content: 'Featured story', fontSize: 12, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
                            }),
                            createCanvasElement('heading', 22, 58, {
                                id: 'blog-index-featured-title',
                                width: 240,
                                height: 54,
                                props: { content: 'Latest article title', level: 'h3', fontSize: 21, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 22, 122, {
                                id: 'blog-index-featured-copy',
                                width: 230,
                                height: 44,
                                props: { content: 'Bind this to the latest or selected Backy blog post.', fontSize: 13, lineHeight: 1.45, color: '#4b5563' },
                            }),
                        ],
                    }),
                ],
            }),
            createCanvasElement('section', 0, 330, {
                id: 'blog-index-list-section',
                width: 1200,
                height: 420,
                dataBindings: [{ source: 'blog', mode: 'list', limit: 8, sort: 'publishedAt:desc' }],
                props: { backgroundColor: '#ffffff', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 74, 52, {
                        id: 'blog-index-list-heading',
                        width: 420,
                        height: 46,
                        props: { content: 'Latest articles', level: 'h2', fontSize: 34, fontWeight: '800', color: '#111827' },
                    }),
                    ...['Design notes', 'Product update', 'Field guide'].map((item, index) => createCanvasElement('box', 74, 130 + index * 86, {
                        id: `blog-index-post-row-${index}`,
                        width: 860,
                        height: 68,
                        dataBindings: [{ source: 'blog', mode: 'item', index }],
                        props: { backgroundColor: '#f9fafb', borderRadius: 8, borderColor: '#e5e7eb', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 14, {
                                id: `blog-index-post-title-${index}`,
                                width: 320,
                                height: 30,
                                props: { content: item, level: 'h3', fontSize: 20, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('text', 650, 20, {
                                id: `blog-index-post-meta-${index}`,
                                width: 150,
                                height: 24,
                                props: { content: '5 min read', fontSize: 13, color: '#6b7280' },
                            }),
                        ],
                    })),
                ],
            }),
        ]);
    }

    if (input.template === 'about') {
        return withChrome([
            createCanvasElement('heading', 80, 72, {
                id: 'about-heading',
                width: 640,
                height: 84,
                props: { content: title, level: 'h1', fontSize: 48, fontWeight: '800', color: '#111827' },
            }),
            createCanvasElement('paragraph', 82, 178, {
                id: 'about-story-copy',
                width: 720,
                height: 130,
                props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#374151' },
            }),
            createCanvasElement('section', 0, 360, {
                id: 'about-values-section',
                width: 1200,
                height: 330,
                props: { backgroundColor: '#f8fafc', borderRadius: 0, padding: 0 },
                children: ['Craft', 'Clarity', 'Ownership'].map((item, index) => createCanvasElement('box', 80 + index * 330, 74, {
                    id: `about-value-${index}`,
                    width: 280,
                    height: 160,
                    props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', borderWidth: 1, borderStyle: 'solid' },
                    children: [
                        createCanvasElement('heading', 22, 24, {
                            id: `about-value-heading-${index}`,
                            width: 220,
                            height: 38,
                            props: { content: item, level: 'h3', fontSize: 22, fontWeight: '750', color: '#0f172a' },
                        }),
                        createCanvasElement('paragraph', 22, 76, {
                            id: `about-value-copy-${index}`,
                            width: 220,
                            height: 60,
                            props: { content: 'Write a specific value statement that explains how the team makes decisions.', fontSize: 14, lineHeight: 1.5, color: '#475569' },
                        }),
                    ],
                })),
            }),
        ]);
    }

    if (input.template === 'contact') {
        return withChrome([
            createCanvasElement('heading', 72, 72, {
                id: 'contact-heading',
                width: 520,
                height: 70,
                props: { content: title, level: 'h1', fontSize: 46, fontWeight: '800', color: '#111827' },
            }),
            createCanvasElement('paragraph', 74, 158, {
                id: 'contact-copy',
                width: 500,
                height: 100,
                props: { content: description, fontSize: 18, lineHeight: 1.6, color: '#475569' },
            }),
            createCanvasElement('form', 680, 72, {
                id: 'contact-form-card',
                width: 420,
                height: 430,
                props: {
                    formId: `form-${formSlug}-contact`,
                    formName: `${formSlug}-contact`,
                    formTitle: 'Contact form',
                    formDescription: 'Public contact form generated from the page canvas.',
                    formActive: true,
                    formAudience: 'public',
                    successMessage: 'Thanks. We will reply soon.',
                    enableHoneypot: true,
                    enableCaptcha: false,
                    contactShareEnabled: true,
                    contactShareNameField: 'name',
                    contactShareEmailField: 'email',
                    contactShareNotesField: 'message',
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    borderStyle: 'solid',
                },
                children: [
                    createCanvasElement('input', 24, 30, { id: 'contact-name', width: 360, height: 54, props: { label: 'Name', name: 'name', placeholder: 'Your name', required: true } }),
                    createCanvasElement('input', 24, 104, { id: 'contact-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                    createCanvasElement('textarea', 24, 180, { id: 'contact-message', width: 360, height: 110, props: { label: 'Message', name: 'message', placeholder: 'Tell us what you need', required: true } }),
                    createCanvasElement('button', 24, 326, { id: 'contact-submit', width: 170, height: 48, props: { label: 'Send message', backgroundColor: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: '700' } }),
                ],
            }),
        ]);
    }

    if (input.template === 'registration') {
        return withChrome([
            createCanvasElement('section', 0, 0, {
                id: 'registration-hero-section',
                width: 1200,
                height: 680,
                props: { backgroundColor: '#f7f8f4', borderRadius: 0, padding: 0 },
                children: [
                    createCanvasElement('heading', 74, 96, {
                        id: 'registration-heading',
                        width: 540,
                        height: 120,
                        props: { content: title, level: 'h1', fontSize: 52, fontWeight: '800', lineHeight: 1.08, color: '#111827' },
                    }),
                    createCanvasElement('paragraph', 78, 238, {
                        id: 'registration-copy',
                        width: 500,
                        height: 110,
                        props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#4b5563' },
                    }),
                    createCanvasElement('box', 78, 392, {
                        id: 'registration-note',
                        width: 470,
                        height: 112,
                        props: { backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#d8ded2', borderWidth: 1, borderStyle: 'solid' },
                        children: [
                            createCanvasElement('heading', 20, 18, {
                                id: 'registration-note-heading',
                                width: 380,
                                height: 32,
                                props: { content: 'What happens next', level: 'h3', fontSize: 18, fontWeight: '750', color: '#111827' },
                            }),
                            createCanvasElement('paragraph', 20, 56, {
                                id: 'registration-note-copy',
                                width: 390,
                                height: 42,
                                props: { content: 'Submissions land in Backy Forms and Contacts, ready for approval, export, or collection routing.', fontSize: 14, lineHeight: 1.45, color: '#556052' },
                            }),
                        ],
                    }),
                    createCanvasElement('form', 700, 70, {
                        id: 'registration-form-card',
                        width: 430,
                        height: 560,
                        props: {
                            formId: `form-${formSlug}-registration`,
                            formName: `${formSlug}-registration`,
                            formTitle: 'Registration form',
                            formDescription: 'Public registration form generated from the page canvas.',
                            formActive: true,
                            formAudience: 'public',
                            successMessage: 'Registration received. Check your inbox for the next step.',
                            enableHoneypot: true,
                            enableCaptcha: false,
                            moderationMode: 'manual',
                            contactShareEnabled: true,
                            contactShareNameField: 'full_name',
                            contactShareEmailField: 'email',
                            contactSharePhoneField: 'phone',
                            contactShareNotesField: 'member_type',
                            backgroundColor: '#ffffff',
                            borderRadius: 8,
                            borderColor: '#d8ded2',
                            borderWidth: 1,
                            borderStyle: 'solid',
                        },
                        children: [
                            createCanvasElement('input', 24, 34, { id: 'registration-name', width: 360, height: 54, props: { label: 'Full name', name: 'full_name', placeholder: 'Ada Lovelace', required: true } }),
                            createCanvasElement('input', 24, 106, { id: 'registration-email', width: 360, height: 54, props: { label: 'Email', name: 'email', inputType: 'email', placeholder: 'you@example.com', required: true } }),
                            createCanvasElement('input', 24, 178, { id: 'registration-phone', width: 360, height: 54, props: { label: 'Phone', name: 'phone', inputType: 'tel', placeholder: '+1 555 0100', required: false } }),
                            createCanvasElement('select', 24, 250, { id: 'registration-member-type', width: 360, height: 54, props: { label: 'Member type', name: 'member_type', options: ['Customer', 'Creator', 'Partner'], placeholder: 'Choose a type', required: true } }),
                            createCanvasElement('checkbox', 24, 330, { id: 'registration-consent', width: 360, height: 42, props: { label: 'I agree to be contacted about this registration.', name: 'consent', required: true } }),
                            createCanvasElement('button', 24, 414, { id: 'registration-submit', width: 190, height: 50, props: { label: 'Create account', backgroundColor: '#14532d', color: '#ffffff', borderRadius: 8, fontWeight: '700' } }),
                        ],
                    }),
                ],
            }),
        ]);
    }

    return [
        createCanvasElement('heading', 100, 96, {
            id: 'blank-heading',
            width: 560,
            height: 72,
            props: { content: title, level: 'h1', fontSize: 48, fontWeight: '800', color: '#111827' },
        }),
        createCanvasElement('paragraph', 102, 188, {
            id: 'blank-intro',
            width: 620,
            height: 110,
            props: { content: description, fontSize: 18, lineHeight: 1.65, color: '#475569' },
        }),
    ];
}
