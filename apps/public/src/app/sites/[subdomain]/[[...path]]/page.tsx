/**
 * ==========================================================================
 * Dynamic Site Page Renderer
 * ==========================================================================
 *
 * Renders pages for a specific site based on subdomain/slug.
 * Uses SSR for SEO and initial load, with GSAP hydration for animations.
 */

import { notFound } from 'next/navigation';
import {
    getCanonicalPathForPage,
    getCollectionByIdOrSlug,
    getCollectionRecordByIdOrSlug,
    getPageByPath,
    getSiteByIdOrSlug,
    validatePreviewToken,
} from '@/lib/backyStore';
import { PageRenderer, type PageContent } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import { buildCollectionItemContent } from '@/lib/renderPayload';
import type { Metadata } from 'next';

async function getSite(subdomain: string) {
    return getSiteByIdOrSlug(subdomain);
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
    if (!pathParts || pathParts.length !== 2) {
        return null;
    }

    const [collectionSlug, recordSlug] = pathParts;
    const collection = getCollectionByIdOrSlug(siteId, collectionSlug);
    const record = collection
        ? getCollectionRecordByIdOrSlug(siteId, collection.id, recordSlug)
        : undefined;

    return collection && record ? { collection, record } : null;
}

function getCollectionRecordTitle(record: { slug: string; values: Record<string, unknown> }) {
    const title = record.values.title || record.values.name || record.values.label;
    return typeof title === 'string' && title.length > 0 ? title : record.slug;
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

    const site = await getSite(subdomain);
    if (!site) return { title: 'Page Not Found' };

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
        const canonicalPath = `/${dynamicItem.collection.slug}/${dynamicItem.record.slug}`;

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
    const site = await getSite(subdomain);
    if (!site) {
        notFound();
    }

    const page = await getPage(site.id, pageSlug, previewToken);
    if (page) {
        return (
            <>
                {/* SEO head handled by generateMetadata */}

                {/* Page content */}
                <PageRenderer
                    content={page.content}
                    theme={site.theme}
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
                siteId={site.id}
                pageSlug={`${dynamicItem.collection.slug}/${dynamicItem.record.slug}`}
            />

            {/* Client-side animation hydration */}
            <AnimationHydrator />
        </>
    );
}
