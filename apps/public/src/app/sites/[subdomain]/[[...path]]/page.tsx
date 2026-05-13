/**
 * ==========================================================================
 * Dynamic Site Page Renderer
 * ==========================================================================
 *
 * Renders pages for a specific site based on subdomain/slug.
 * Uses SSR for SEO and initial load, with GSAP hydration for animations.
 */

import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { BackyCollection, BackyCollectionRecord, BackyPage, Site } from '@backy-cms/core';
import {
    getCanonicalPathForPage,
    getCollectionRecordByIdOrSlug,
    getMediaList,
    getPageByPath,
    getSiteByIdOrSlug,
    listCollectionRecords,
    listCollections,
    validatePreviewToken,
    type StoreCollection,
    type StoreCollectionRecord,
    type StoreSite,
} from '@/lib/backyStore';
import { PageRenderer, type PageContent } from '@/components/PageRenderer';
import AnimationHydrator from '@/components/AnimationHydrator';
import {
    buildCollectionItemContent,
    buildCollectionListContent,
    buildCollectionTemplateContent,
    resolveElementDataBindings,
    type RenderDataSource,
} from '@/lib/renderPayload';
import { publicMediaFilePath } from '@/lib/mediaResponsive';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
    buildCollectionItemPath,
    buildCollectionListPath,
    matchCollectionItemRoute,
    matchCollectionListRoute,
} from '@/lib/collectionRoutes';
import { resolveRedirectRoute } from '@/lib/redirectRules';
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

type HostedDynamicCollectionRoute =
    | {
        type: 'list';
        collection: StoreCollection;
        records: StoreCollectionRecord[];
        canonical: string;
    }
    | {
        type: 'item';
        collection: StoreCollection;
        record: StoreCollectionRecord;
        canonical: string;
    };

function getDynamicCollectionRoute(siteId: string, pathParts: string[] | undefined): HostedDynamicCollectionRoute | null {
    const path = pathParts && pathParts.length > 0 ? `/${pathParts.join('/')}` : '/';
    const collections = listCollections(siteId);
    const dynamicListMatch = matchCollectionListRoute(path, collections);
    if (dynamicListMatch) {
        const { collection, canonical } = dynamicListMatch;
        const records = listCollectionRecords(siteId, collection.id, { limit: 100 }).records;
        return { type: 'list', collection, records, canonical };
    }

    const dynamicItemMatch = matchCollectionItemRoute(path, collections);
    if (!dynamicItemMatch) {
        return null;
    }

    const { collection, recordSlug, canonical } = dynamicItemMatch;
    const record = getCollectionRecordByIdOrSlug(siteId, collection.id, recordSlug);

    return collection && record ? { type: 'item', collection, record, canonical } : null;
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
        url: publicMediaFilePath(siteId, font.id),
        weights: [getStringMetadata(font.metadata, 'fontWeight') || '400'],
        styles: [getStringMetadata(font.metadata, 'fontStyle') === 'italic' || getStringMetadata(font.metadata, 'fontStyle') === 'oblique'
            ? getStringMetadata(font.metadata, 'fontStyle') as 'italic' | 'oblique'
            : 'normal' as const],
        fallbackStack: getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif',
        display: getStringMetadata(font.metadata, 'fontDisplay') || 'swap',
        cssFamily: `"${(getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, '')).replace(/["\\]/g, '')}", ${getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif'}`,
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
        url: publicMediaFilePath(hostedSite.site.id, font.id),
        weights: [getStringMetadata(font.metadata, 'fontWeight') || '400'],
        styles: [getStringMetadata(font.metadata, 'fontStyle') === 'italic' || getStringMetadata(font.metadata, 'fontStyle') === 'oblique'
            ? getStringMetadata(font.metadata, 'fontStyle') as 'italic' | 'oblique'
            : 'normal' as const],
        fallbackStack: getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif',
        display: getStringMetadata(font.metadata, 'fontDisplay') || 'swap',
        cssFamily: `"${(getStringMetadata(font.metadata, 'fontFamily') || font.originalName.replace(/\.[a-z0-9]+$/i, '')).replace(/["\\]/g, '')}", ${getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif'}`,
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

function repositorySiteToStoreSite(site: Site): StoreSite {
    return {
        id: site.id,
        name: site.name,
        slug: site.slug,
        description: site.description || '',
        customDomain: site.customDomain || null,
        status: site.isPublished ? 'published' : 'draft',
        isPublished: site.isPublished,
        theme: repositoryTheme(site) as StoreSite['theme'],
        settings: site.settings as StoreSite['settings'],
    };
}

function repositoryPageContentWithContext(page: BackyPage, dataSource?: RenderDataSource): PageContent {
    return {
        elements: resolveElementDataBindings(page.siteId, page.content.elements, { dataSource }) as unknown as PageContent['elements'],
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

const repositoryCollectionToStoreCollection = (collection: BackyCollection): StoreCollection => ({
    id: collection.id,
    siteId: collection.siteId,
    name: collection.name,
    slug: collection.slug,
    listRoutePattern: collection.listRoutePattern || null,
    routePattern: collection.routePattern || null,
    description: collection.description || null,
    status: collection.status === 'published' || collection.status === 'archived' ? collection.status : 'draft',
    fields: collection.fields.map((field, index) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required === true,
        unique: field.unique === true,
        sortOrder: index,
        helpText: null,
        options: field.options,
        referenceCollectionId: field.referenceCollectionId || null,
        defaultValue: field.defaultValue,
    })),
    permissions: {
        publicRead: collection.permissions.publicRead,
        publicCreate: collection.permissions.publicCreate,
        publicUpdate: collection.permissions.publicUpdate === true,
        publicDelete: collection.permissions.publicDelete === true,
    },
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    metadata: collection.metadata,
});

const repositoryRecordToStoreRecord = (record: BackyCollectionRecord): StoreCollectionRecord => ({
    id: record.id,
    siteId: record.siteId,
    collectionId: record.collectionId,
    slug: record.slug,
    status: record.status,
    values: record.values,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt || null,
    scheduledAt: record.scheduledAt || null,
});

async function buildRepositoryRenderDataSource(
    hostedSite: Extract<HostedSite, { mode: 'database' }>,
): Promise<RenderDataSource> {
    const collections = await hostedSite.repositories.collections.list({
        siteId: hostedSite.site.id,
        status: 'published',
        includeUnpublished: false,
        limit: 100,
        offset: 0,
    });
    const storeCollections = collections.items
        .filter((collection) => collection.status === 'published' && collection.permissions.publicRead)
        .map(repositoryCollectionToStoreCollection);
    const recordsByCollection = new Map<string, StoreCollectionRecord[]>();

    await Promise.all(storeCollections.map(async (collection) => {
        const records = await hostedSite.repositories.collections.listRecords({
            siteId: hostedSite.site.id,
            collectionId: collection.id,
            status: 'published',
            includeUnpublished: false,
            limit: 1000,
            offset: 0,
        });
        recordsByCollection.set(collection.id, records.items.filter(isPubliclyReadable).map(repositoryRecordToStoreRecord));
    }));

    const media = await hostedSite.repositories.media.list({
        siteId: hostedSite.site.id,
        visibility: 'public',
        limit: 1000,
    });

    return {
        getCollectionByIdOrSlug: (_siteId, collectionIdOrSlug) => (
            storeCollections.find((collection) => collection.id === collectionIdOrSlug || collection.slug === collectionIdOrSlug)
        ),
        getCollectionRecordByIdOrSlug: (_siteId, collectionId, recordIdOrSlug) => (
            (recordsByCollection.get(collectionId) || []).find((record) => record.id === recordIdOrSlug || record.slug === recordIdOrSlug)
        ),
        listCollectionRecords: (_siteId, collectionId, options = {}) => {
            const records = (recordsByCollection.get(collectionId) || [])
                .filter((record) => !options.slug || record.slug === options.slug)
                .filter((record) => !options.status || record.status === options.status)
                .filter((record) => !options.fieldKey || record.values[options.fieldKey] === options.fieldValue)
                .filter((record) => {
                    const search = options.search?.trim().toLowerCase();
                    return !search || JSON.stringify(record.values).toLowerCase().includes(search) || record.slug.toLowerCase().includes(search);
                });
            const sortBy = options.sortBy;
            const sortedRecords = sortBy
                ? [...records].sort((left, right) => {
                    const leftValue = sortBy in left ? left[sortBy as keyof StoreCollectionRecord] : left.values[sortBy];
                    const rightValue = sortBy in right ? right[sortBy as keyof StoreCollectionRecord] : right.values[sortBy];
                    const direction = options.sortDirection === 'desc' ? -1 : 1;
                    return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * direction;
                })
                : records;
            const requestedOffset = options.offset;
            const requestedLimit = options.limit;
            const offset = typeof requestedOffset === 'number' && Number.isInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
            const limit = typeof requestedLimit === 'number' && Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : sortedRecords.length;
            return { records: sortedRecords.slice(offset, offset + limit) };
        },
        getMediaById: (_siteId, mediaId) => media.items.find((item) => item.id === mediaId),
        getMediaList: () => ({
            media: media.items,
            pagination: {
                total: media.items.length,
                limit: media.items.length,
                offset: 0,
                hasMore: false,
            },
        }),
    };
}

async function getRepositoryDynamicCollectionRoute(
    hostedSite: Extract<HostedSite, { mode: 'database' }>,
    pathParts: string[] | undefined,
): Promise<HostedDynamicCollectionRoute | null> {
    const path = pathParts && pathParts.length > 0 ? `/${pathParts.join('/')}` : '/';
    const collections = await hostedSite.repositories.collections.list({
        siteId: hostedSite.site.id,
        status: 'published',
        includeUnpublished: false,
        limit: 100,
        offset: 0,
    });
    const publicCollections = collections.items.filter((collection) => (
        collection.status === 'published' && collection.permissions.publicRead
    ));
    const dynamicListMatch = matchCollectionListRoute(path, publicCollections);
    if (dynamicListMatch) {
        const { collection, canonical } = dynamicListMatch;
        const records = await hostedSite.repositories.collections.listRecords({
            siteId: hostedSite.site.id,
            collectionId: collection.id,
            status: 'published',
            includeUnpublished: false,
            limit: 100,
            offset: 0,
        });

        return {
            type: 'list',
            collection: repositoryCollectionToStoreCollection(collection),
            records: records.items.filter(isPubliclyReadable).map(repositoryRecordToStoreRecord),
            canonical,
        };
    }

    const dynamicItemMatch = matchCollectionItemRoute(path, publicCollections);
    if (!dynamicItemMatch) {
        return null;
    }

    const { collection, recordSlug, canonical } = dynamicItemMatch;
    const record = await hostedSite.repositories.collections.getRecordBySlug(
        hostedSite.site.id,
        collection.id,
        recordSlug,
    );

    if (!record || !isPubliclyReadable(record)) {
        return null;
    }

    return {
        type: 'item',
        collection: repositoryCollectionToStoreCollection(collection),
        record: repositoryRecordToStoreRecord(record),
        canonical,
    };
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

const routePathFromParts = (path: string[] | undefined): string => (
    path && path.length > 0 ? `/${path.join('/')}` : '/'
);

function applyHostedRedirects(site: Pick<Site, 'settings'> | StoreSite, path: string) {
    const redirectRoute = resolveRedirectRoute(site.settings, path);
    if (!redirectRoute) {
        return;
    }

    if (redirectRoute.type === 'gone') {
        notFound();
    }

    if (redirectRoute.resource.statusCode === 301 || redirectRoute.resource.statusCode === 308) {
        permanentRedirect(redirectRoute.resource.to);
    }

    redirect(redirectRoute.resource.to);
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
    const { subdomain, path } = await params;
    const previewToken = firstParam((await searchParams)?.previewToken);
    const pageSlug = path?.join('/') || 'index';
    const routePath = routePathFromParts(path);

    const hostedSite = await getSite(subdomain);
    if (!hostedSite) return { title: 'Page Not Found' };

    if (hostedSite.mode === 'database') {
        const { site } = hostedSite;
        applyHostedRedirects(site, routePath);
        const page = await getRepositoryPage(hostedSite, pageSlug, previewToken);
        if (!page) {
            const dynamicRoute = await getRepositoryDynamicCollectionRoute(hostedSite, path);
            if (!dynamicRoute) return { title: 'Page Not Found' };

            if (dynamicRoute.type === 'list') {
                const description = dynamicRoute.collection.description || '';
                return {
                    title: dynamicRoute.collection.name,
                    description,
                    alternates: {
                        canonical: dynamicRoute.canonical,
                    },
                    robots: {
                        index: dynamicRoute.collection.status === 'published',
                        follow: true,
                    },
                    openGraph: {
                        title: dynamicRoute.collection.name,
                        description,
                        url: dynamicRoute.canonical,
                        siteName: site.name,
                    },
                };
            }

            const title = getCollectionRecordTitle(dynamicRoute.record);
            const descriptionValue = dynamicRoute.record.values.summary
                || dynamicRoute.record.values.description
                || dynamicRoute.collection.description
                || '';
            const description = typeof descriptionValue === 'string' ? descriptionValue : '';
            return {
                title,
                description,
                alternates: {
                    canonical: dynamicRoute.canonical,
                },
                robots: {
                    index: dynamicRoute.record.status === 'published',
                    follow: true,
                },
                openGraph: {
                    title,
                    description,
                    url: dynamicRoute.canonical,
                    siteName: site.name,
                },
            };
        }

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
    applyHostedRedirects(site, routePath);
    const page = await getPage(site.id, pageSlug, previewToken);
    if (!page) {
        const dynamicRoute = getDynamicCollectionRoute(site.id, path);
        if (!dynamicRoute) return { title: 'Page Not Found' };

        if (dynamicRoute.type === 'list') {
            const description = dynamicRoute.collection.description || '';
            return {
                title: dynamicRoute.collection.name,
                description,
                alternates: {
                    canonical: dynamicRoute.canonical,
                },
                robots: {
                    index: dynamicRoute.collection.status === 'published',
                    follow: true,
                },
                openGraph: {
                    title: dynamicRoute.collection.name,
                    description,
                    url: dynamicRoute.canonical,
                    siteName: site.name,
                },
            };
        }

        const title = getCollectionRecordTitle(dynamicRoute.record);
        const descriptionValue = dynamicRoute.record.values.summary
            || dynamicRoute.record.values.description
            || dynamicRoute.record.values.bio
            || dynamicRoute.collection.description
            || '';
        const description = typeof descriptionValue === 'string' ? descriptionValue : '';
        const canonicalPath = dynamicRoute.canonical;

        return {
            title,
            description,
            alternates: {
                canonical: canonicalPath,
            },
            robots: {
                index: dynamicRoute.record.status === 'published',
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
        const dataSource = await buildRepositoryRenderDataSource(hostedSite);
        const page = await getRepositoryPage(hostedSite, pageSlug, previewToken);
        if (!page) {
            const dynamicRoute = await getRepositoryDynamicCollectionRoute(hostedSite, path);
            if (!dynamicRoute) {
                notFound();
            }

            const storeSite = repositorySiteToStoreSite(site);
            const dynamicContent = dynamicRoute.type === 'list'
                ? (buildCollectionTemplateContent(storeSite, dynamicRoute.collection, 'list', undefined, { dataSource })
                    || buildCollectionListContent(storeSite, dynamicRoute.collection, dynamicRoute.records, { dataSource })) as unknown as PageContent
                : (buildCollectionTemplateContent(storeSite, dynamicRoute.collection, 'item', dynamicRoute.record, { dataSource })
                    || buildCollectionItemContent(storeSite, dynamicRoute.collection, dynamicRoute.record, { dataSource })) as unknown as PageContent;

            return (
                <>
                    <PageRenderer
                        content={dynamicContent}
                        theme={repositoryTheme(site)}
                        fontAssets={await getRepositoryFontAssets(hostedSite)}
                        siteId={site.id}
                        pageSlug={(dynamicRoute.type === 'list'
                            ? buildCollectionListPath(dynamicRoute.collection)
                            : buildCollectionItemPath(dynamicRoute.collection, dynamicRoute.record.slug)).replace(/^\//, '')}
                    />
                    <AnimationHydrator />
                </>
            );
        }

        return (
            <>
                <PageRenderer
                    content={repositoryPageContentWithContext(page, dataSource)}
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

    const dynamicRoute = getDynamicCollectionRoute(site.id, path);
    if (!dynamicRoute) {
        notFound();
    }

    const dynamicContent = dynamicRoute.type === 'list'
        ? (buildCollectionTemplateContent(site, dynamicRoute.collection, 'list')
            || buildCollectionListContent(site, dynamicRoute.collection, dynamicRoute.records)) as unknown as PageContent
        : (buildCollectionTemplateContent(site, dynamicRoute.collection, 'item', dynamicRoute.record)
            || buildCollectionItemContent(site, dynamicRoute.collection, dynamicRoute.record)) as unknown as PageContent;

    return (
        <>
            {/* SEO head handled by generateMetadata */}

            {/* Page content */}
            <PageRenderer
                content={dynamicContent}
                theme={site.theme}
                fontAssets={fontAssets}
                siteId={site.id}
                pageSlug={(dynamicRoute.type === 'list'
                    ? buildCollectionListPath(dynamicRoute.collection)
                    : buildCollectionItemPath(dynamicRoute.collection, dynamicRoute.record.slug)).replace(/^\//, '')}
            />

            {/* Client-side animation hydration */}
            <AnimationHydrator />
        </>
    );
}
