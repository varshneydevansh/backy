/**
 * ==========================================================================
 * Dynamic Site Page Renderer
 * ==========================================================================
 *
 * Renders pages for a specific site based on subdomain/slug.
 * Uses SSR for SEO and initial load, with GSAP hydration for animations.
 */

import { notFound } from 'next/navigation';
import type { BackyPage, Site } from '@backy-cms/core';
import {
    getCanonicalPathForPage,
    getCollectionRecordByIdOrSlug,
    getMediaList,
    getPageByPath,
    getSiteByIdOrSlug,
    listCollections,
    validatePreviewToken,
} from '@/lib/backyStore';
import { PageRenderer, type PageContent } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import { buildCollectionItemContent, resolveElementDataBindings } from '@/lib/renderPayload';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { buildCollectionItemPath, matchCollectionItemRoute } from '@/lib/collectionRoutes';
import type { Metadata } from 'next';

type HostedSite =
    | {
        mode: 'database';
        site: Site;
        repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
    }
    | {
        mode: 'demo';
        site: NonNullable<ReturnType<typeof getSiteByIdOrSlug>>;
        repositories: null;
    };

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
    item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

async function getSite(subdomain: string) {
    if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const site = await repositories.sites.getById(subdomain) || await repositories.sites.getBySlug(subdomain);
        return site ? { mode: 'database', site, repositories } as HostedSite : null;
    }

    const site = getSiteByIdOrSlug(subdomain);
    return site ? { mode: 'demo', site, repositories: null } as HostedSite : null;
}

async function getPage(siteId: string, pageSlug: string, previewToken?: string) {
    const previewPage = previewToken
        ? getPageByPath(siteId, pageSlug, { includeUnpublished: true })
        : undefined;
    const canPreview = previewPage
        ? validatePreviewToken(siteId, 'page', previewPage.id, previewToken)
        : false;

    return canPreview ? previewPage : getPageByPath(siteId, pageSlug);
}

function getDynamicCollectionItem(siteId: string, pathParts: string[] | undefined) {
    const path = pathParts && pathParts.length > 0 ? `/${pathParts.join('/')}` : '/';
    const dynamicItemMatch = matchCollectionItemRoute(path, listCollections(siteId));
    if (!dynamicItemMatch) {
        return null;
    }

    const { collection, recordSlug, canonical } = dynamicItemMatch;
    const record = getCollectionRecordByIdOrSlug(siteId, collection.id, recordSlug);

    return collection && record ? { collection, record, canonical } : null;
}

function getCollectionRecordTitle(record: { slug: string; values: Record<string, unknown> }) {
    const title = record.values.title || record.values.name || record.values.label;
    return typeof title === 'string' && title.length > 0 ? title : record.slug;
}

function getStringMetadata(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function getHostedFontAssets(siteId: string) {
    const fonts = getMediaList(siteId, {
        type: 'font',
        visibility: 'public',
        limit: 100,
    }).media;

    return fonts.map((font) => ({
        id: font.id,
        family: getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, ''),
        source: 'uploaded' as const,
        url: font.url,
        weights: [getStringMetadata(font.metadata, 'fontWeight') || '400'],
        styles: [getStringMetadata(font.metadata, 'fontStyle') === 'italic' || getStringMetadata(font.metadata, 'fontStyle') === 'oblique'
            ? getStringMetadata(font.metadata, 'fontStyle') as 'italic' | 'oblique'
            : 'normal' as const],
    }));
}

async function getRepositoryFontAssets(hostedSite: Extract<HostedSite, { mode: 'database' }>) {
    const fonts = await hostedSite.repositories.media.list({
        siteId: hostedSite.site.id,
        type: 'font',
        visibility: 'public',
        limit: 100,
    });

    return fonts.items.map((font) => ({
        id: font.id,
        family: getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, ''),
        source: 'uploaded' as const,
        url: font.url,
        weights: [getStringMetadata(font.metadata, 'fontWeight') || '400'],
        styles: [getStringMetadata(font.metadata, 'fontStyle') === 'italic' || getStringMetadata(font.metadata, 'fontStyle') === 'oblique'
            ? getStringMetadata(font.metadata, 'fontStyle') as 'italic' | 'oblique'
            : 'normal' as const],
    }));
}

async function getRepositoryPage(hostedSite: Extract<HostedSite, { mode: 'database' }>, pageSlug: string, previewToken?: string) {
    const page = await hostedSite.repositories.pages.getBySlug(hostedSite.site.id, pageSlug);
    if (!page) {
        return null;
    }

    const canPreview = previewToken
        ? await hostedSite.repositories.contentWorkflows.validatePreviewToken(hostedSite.site.id, 'page', page.id, previewToken)
        : false;

    return isPubliclyReadable(page) || canPreview ? page : null;
}

function repositoryTheme(site: Site) {
    return {
        colors: isRecord(site.theme?.colors) ? site.theme.colors as Record<string, string> : {},
        fonts: isRecord(site.theme?.fonts) ? site.theme.fonts as { heading?: string; body?: string } : {},
        spacing: isRecord(site.theme?.spacing) ? site.theme.spacing as Record<string, string | number> : undefined,
        customCSS: typeof site.theme?.customCSS === 'string' ? site.theme.customCSS : '',
    };
}

function repositoryPageContent(page: BackyPage): PageContent {
    return {
        elements: page.content.elements as unknown as PageContent['elements'],
        canvasSize: isRecord(page.content.metadata?.canvasSize)
            ? {
                width: Number(page.content.metadata.canvasSize.width) || 1200,
                height: Number(page.content.metadata.canvasSize.height) || 900,
            }
            : { width: 1200, height: 900 },
        customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
        contentDocument: page.content,
    };
}

function canonicalPathForRepositoryPage(page: Pick<BackyPage, 'isHomepage' | 'slug' | 'meta'>) {
    if (page.isHomepage || page.slug === 'index') {
        return '/';
    }

    return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
        ? page.meta.canonical
        : `/${page.slug}`;
}

// ==========================================================================
// PAGE COMPONENT
// ==========================================================================

interface PageProps {
    params: Promise<{
        subdomain: string;
        path?: string[];
    }>;
    searchParams?: Promise<{
        previewToken?: string | string[];
    }>;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (
    Array.isArray(value) ? value[0] : value
);

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
    const { subdomain, path } = await params;
    const previewToken = firstParam((await searchParams)?.previewToken);
    const pageSlug = path?.join('/') || 'index';

    const hostedSite = await getSite(subdomain);
    if (!hostedSite) return { title: 'Page Not Found' };

    if (hostedSite.mode === 'database') {
        const { site } = hostedSite;
        const page = await getRepositoryPage(hostedSite, pageSlug, previewToken);
        if (!page) return { title: 'Page Not Found' };

        const canonicalPath = canonicalPathForRepositoryPage(page);
        return {
            title: typeof page.meta?.title === 'string' ? page.meta.title : page.title,
            description: typeof page.meta?.description === 'string' ? page.meta.description : page.description || '',
            keywords: Array.isArray(page.meta?.keywords) ? page.meta.keywords.filter((item): item is string => typeof item === 'string') : [],
            alternates: {
                canonical: canonicalPath,
            },
            robots: {
                index: page.status === 'published' && page.meta?.noIndex !== true,
                follow: page.meta?.noFollow === true ? false : true,
            },
            openGraph: {
                title: typeof page.meta?.title === 'string' ? page.meta.title : page.title,
                description: typeof page.meta?.description === 'string' ? page.meta.description : page.description || '',
                images: typeof page.meta?.ogImage === 'string' ? [page.meta.ogImage] : undefined,
                url: canonicalPath,
                siteName: site.name,
            },
        };
    }

    const { site } = hostedSite;
    const page = await getPage(site.id, pageSlug, previewToken);
    if (!page) {
        const dynamicItem = getDynamicCollectionItem(site.id, path);
        if (!dynamicItem) return { title: 'Page Not Found' };

        const title = getCollectionRecordTitle(dynamicItem.record);
        const descriptionValue = dynamicItem.record.values.summary
            || dynamicItem.record.values.description
            || dynamicItem.record.values.bio
            || dynamicItem.collection.description
            || '';
        const description = typeof descriptionValue === 'string' ? descriptionValue : '';
        const canonicalPath = dynamicItem.canonical;

        return {
            title,
            description,
            alternates: {
                canonical: canonicalPath,
            },
            robots: {
                index: dynamicItem.record.status === 'published',
                follow: true,
            },
            openGraph: {
                title,
                description,
                url: canonicalPath,
                siteName: site.name,
            },
        };
    }
    const canonicalPath = getCanonicalPathForPage(page);
    const pageKeywords = page.meta?.keywords || [];

    return {
        title: page.meta?.title || page.title,
        description: page.meta?.description || page.description || '',
        keywords: pageKeywords,
        alternates: {
            canonical: canonicalPath,
        },
        robots: {
            index: page.status === 'published' && page.meta?.noIndex !== true,
            follow: page.meta?.noFollow === true ? false : true,
        },
        openGraph: {
            title: page.meta?.title || page.title,
            description: page.meta?.description || page.description || '',
            images: page.meta?.ogImage ? [page.meta?.ogImage] : undefined,
            url: canonicalPath,
            siteName: site.name,
        },
    };
}

export default async function SitePage({ params, searchParams }: PageProps) {
    const { subdomain, path } = await params;
    const previewToken = firstParam((await searchParams)?.previewToken);
    const pageSlug = path?.join('/') || 'index';

    // Fetch site and page data
    const hostedSite = await getSite(subdomain);
    if (!hostedSite) {
        notFound();
    }

    if (hostedSite.mode === 'database') {
        const { site } = hostedSite;
        const page = await getRepositoryPage(hostedSite, pageSlug, previewToken);
        if (!page) {
            notFound();
        }

        return (
            <>
                <PageRenderer
                    content={repositoryPageContent(page)}
                    theme={repositoryTheme(site)}
                    fontAssets={await getRepositoryFontAssets(hostedSite)}
                    siteId={site.id}
                    pageId={page.id}
                    pageSlug={page.slug}
                />
                <AnimationHydrator />
            </>
        );
    }

    const { site } = hostedSite;
    const page = await getPage(site.id, pageSlug, previewToken);
    const fontAssets = getHostedFontAssets(site.id);
    if (page) {
        const pageContent = {
            ...page.content,
            elements: resolveElementDataBindings(site.id, page.content.elements),
        } as unknown as PageContent;

        return (
            <>
                {/* SEO head handled by generateMetadata */}

                {/* Page content */}
                <PageRenderer
                    content={pageContent}
                    theme={site.theme}
                    fontAssets={fontAssets}
                    siteId={site.id}
                    pageId={page.id}
                    pageSlug={page.slug}
                />

                {/* Client-side animation hydration */}
                <AnimationHydrator />
            </>
        );
    }

    const dynamicItem = getDynamicCollectionItem(site.id, path);
    if (!dynamicItem) {
        notFound();
    }

    const dynamicContent = buildCollectionItemContent(site, dynamicItem.collection, dynamicItem.record) as unknown as PageContent;

    return (
        <>
            {/* SEO head handled by generateMetadata */}

            {/* Page content */}
            <PageRenderer
                content={dynamicContent}
                theme={site.theme}
                fontAssets={fontAssets}
                siteId={site.id}
                pageSlug={buildCollectionItemPath(dynamicItem.collection, dynamicItem.record.slug).replace(/^\//, '')}
            />

            {/* Client-side animation hydration */}
            <AnimationHydrator />
        </>
    );
}
