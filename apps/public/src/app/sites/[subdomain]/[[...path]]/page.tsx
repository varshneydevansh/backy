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
    getPageByPath,
    getSiteByIdOrSlug,
} from '@/lib/backyStore';
import { PageRenderer } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import type { Metadata } from 'next';

async function getSite(subdomain: string) {
    return getSiteByIdOrSlug(subdomain);
}

async function getPage(siteId: string, pageSlug: string) {
    return getPageByPath(siteId, pageSlug);
}

// ==========================================================================
// PAGE COMPONENT
// ==========================================================================

interface PageProps {
    params: Promise<{
        subdomain: string;
        path?: string[];
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { subdomain, path } = await params;
    const pageSlug = path?.join('/') || 'index';

    const site = await getSite(subdomain);
    if (!site) return { title: 'Page Not Found' };

    const page = await getPage(site.id, pageSlug);
    if (!page) return { title: 'Page Not Found' };
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
            index: page.meta?.noIndex === true ? false : true,
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

export default async function SitePage({ params }: PageProps) {
    const { subdomain, path } = await params;
    const pageSlug = path?.join('/') || 'index';

    // Fetch site and page data
    const site = await getSite(subdomain);
    if (!site) {
        notFound();
    }

    const page = await getPage(site.id, pageSlug);
    if (!page) {
        notFound();
    }

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
