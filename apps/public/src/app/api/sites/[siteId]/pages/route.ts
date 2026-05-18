/**
 * ==========================================================================
 * REST API - Pages Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/pages - List pages for a site
 * GET /api/sites/[siteId]/pages?slug=xxx - Get page by slug
 */

import { NextRequest } from 'next/server';
import type { BackyPage } from '@backy-cms/core';
import { getPageByPath, getPageSummary, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { getHostedRouteUrl } from '@/lib/seoDiscovery';
import { getRepositoryPageByPublicPath } from '@/lib/repositoryPages';
import { recordPreviewTokenUse } from '@/lib/previewTokenAudit';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
    publicContractJson(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
            errorMessage: message,
        },
        { status, requestId, cache: 'error' },
    )
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseBoundedInteger = (value: string | null, fallback: number, min: number, max: number) => {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
};

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
    item.status === 'published'
    || (
        item.status === 'scheduled'
        && Boolean(item.scheduledAt)
        && Number.isFinite(Date.parse(item.scheduledAt || ''))
        && Date.parse(item.scheduledAt || '') <= Date.now()
    )
);

const frontendDesignFromMeta = (value: unknown) => {
    const meta = isRecord(value) ? value : {};
    if (typeof meta.frontendDesignTemplateId !== 'string') {
        return undefined;
    }

    return {
        templateId: meta.frontendDesignTemplateId,
        templateName: typeof meta.frontendDesignTemplateName === 'string' ? meta.frontendDesignTemplateName : undefined,
        routePattern: typeof meta.frontendDesignRoutePattern === 'string' ? meta.frontendDesignRoutePattern : undefined,
        source: meta.frontendDesignSource,
        chrome: meta.frontendDesignChrome,
        tokens: meta.frontendDesignTokens,
        customCss: typeof meta.frontendDesignCustomCss === 'string' ? meta.frontendDesignCustomCss : undefined,
        bindingHints: Array.isArray(meta.frontendDesignBindingHints) ? meta.frontendDesignBindingHints : [],
    };
};

const toStringArray = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : typeof value === 'string' && value.trim().length > 0
            ? value.split(',').map((item) => item.trim()).filter(Boolean)
            : []
);

const jsonLdObjects = (value: unknown): Array<Record<string, unknown>> => (
    Array.isArray(value)
        ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
        : []
);

const normalizeCanonicalPath = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed || trimmed === '/') {
        return '/';
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const canonicalPathForPage = (page: { slug: string; isHomepage?: boolean; meta?: unknown }) => {
    const meta = isRecord(page.meta) ? page.meta : {};
    const canonical = typeof meta.canonical === 'string' ? meta.canonical.trim() : '';
    if (canonical) {
        return normalizeCanonicalPath(canonical);
    }

    if (page.isHomepage || page.slug === 'index') {
        return '/';
    }

    return normalizeCanonicalPath(page.slug);
};

const seoFromPage = (
    page: { title: string; slug: string; description?: string | null; isHomepage?: boolean; meta?: unknown },
    site: { slug: string; customDomain?: string | null },
    origin: string,
) => {
    const meta = isRecord(page.meta) ? page.meta : {};
    const title = typeof meta.title === 'string' && meta.title.trim().length > 0 ? meta.title.trim() : page.title;
    const description = typeof meta.description === 'string' && meta.description.trim().length > 0
        ? meta.description.trim()
        : page.description || '';
    const canonical = canonicalPathForPage(page);
    const ogImage = typeof meta.ogImage === 'string' && meta.ogImage.trim().length > 0 ? meta.ogImage.trim() : undefined;

    return {
        title,
        description,
        path: canonical,
        canonical,
        canonicalUrl: getHostedRouteUrl(origin, site.slug, canonical, site.customDomain),
        robots: {
            index: meta.noIndex !== true,
            follow: meta.noFollow !== true,
        },
        openGraph: {
            title,
            description,
            image: ogImage,
        },
        keywords: toStringArray(meta.keywords),
        jsonLd: jsonLdObjects(meta.jsonLd),
    };
};

const publicPage = <
    TPage extends { title: string; slug: string; description?: string | null; isHomepage?: boolean; meta?: unknown },
>(
    page: TPage,
    site: { slug: string; customDomain?: string | null },
    origin: string,
) => ({
    ...page,
    frontendDesign: frontendDesignFromMeta(page.meta),
    seo: seoFromPage(page, site, origin),
});

const publicPageFromRepositoryPage = (
    page: BackyPage,
    site: { slug: string; customDomain?: string | null },
    origin: string,
) => {
    const canvasSize = isRecord(page.content.metadata?.canvasSize)
        ? page.content.metadata.canvasSize
        : { width: 1200, height: 900 };

    return publicPage({
        ...page,
        content: {
            elements: page.content.elements,
            canvasSize,
            customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
            contentDocument: page.content,
        },
    }, site, origin);
};

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug') || searchParams.get('path');
        const previewToken = searchParams.get('previewToken');
        const limit = parseBoundedInteger(searchParams.get('limit'), 50, 1, 100);
        const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
        const origin = new URL(request.url).origin;

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();
            const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

            if (!site) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            if (slug) {
                const path = slug.trim().replace(/^\/+|\/+$/g, '') || 'index';
                const page = await getRepositoryPageByPublicPath(repositories, site.id, path);
                const canPreview = page && previewToken
                    ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'page', page.id, previewToken)
                    : false;

                if (!page || (!isPubliclyReadable(page) && !canPreview)) {
                    return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
                }

                if (canPreview) {
                    await recordPreviewTokenUse({
                        repositories,
                        siteId: site.id,
                        targetType: 'page',
                        targetId: page.id,
                        requestId,
                        surface: 'page-api',
                        path,
                        slug: page.slug,
                    });
                }

                const responsePage = publicPageFromRepositoryPage(page, site, origin);
                const cacheRevision = previewToken
                    ? undefined
                    : await repositories.cacheInvalidations.latestRevision({
                        siteId: site.id,
                        scope: 'content',
                    }) || undefined;

                return publicContractJson({
                    success: true,
                    requestId,
                    data: {
                        page: responsePage,
                    },
                    page: responsePage,
                }, {
                    requestId,
                    request,
                    cache: previewToken ? 'private' : 'discovery',
                    siteId: site.id,
                    cacheRevision,
                });
            }

            const repositoryPages: BackyPage[] = [];
            let repositoryOffset = 0;
            let hasMoreRepositoryPages = true;
            while (hasMoreRepositoryPages) {
                const result = await repositories.pages.list({
                    siteId: site.id,
                    includeUnpublished: true,
                    status: 'all',
                    limit: 100,
                    offset: repositoryOffset,
                });
                repositoryPages.push(...result.items);
                hasMoreRepositoryPages = result.pagination.hasMore;
                repositoryOffset += result.pagination.limit;
            }
            const visiblePages = repositoryPages.filter(isPubliclyReadable);
            const pages = visiblePages.slice(offset, offset + limit).map((page) => publicPageFromRepositoryPage(page, site, origin));
            const cacheRevision = await repositories.cacheInvalidations.latestRevision({
                siteId: site.id,
                scope: 'content',
            }) || undefined;

            return publicContractJson({
                success: true,
                requestId,
                data: {
                    pages,
                    pagination: {
                        total: visiblePages.length,
                        limit,
                        offset,
                        hasMore: offset + limit < visiblePages.length,
                    },
                },
                pages,
                pagination: {
                    total: visiblePages.length,
                    limit,
                    offset,
                    hasMore: offset + limit < visiblePages.length,
                },
            }, {
                requestId,
                request,
                cache: 'discovery',
                siteId: site.id,
                cacheRevision,
            });
        }

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        }

        if (slug) {
            const path = slug.trim().replace(/^\/+|\/+$/g, '') || 'index';
            const previewPage = previewToken
                ? getPageByPath(site.id, path, { includeUnpublished: true })
                : undefined;
            const canPreview = previewPage
                ? validatePreviewToken(site.id, 'page', previewPage.id, previewToken)
                : false;
            const page = canPreview
                ? previewPage
                : getPageByPath(site.id, path);

            if (!page) {
                return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
            }

            if (canPreview) {
                await recordPreviewTokenUse({
                    siteId: site.id,
                    targetType: 'page',
                    targetId: page.id,
                    requestId,
                    surface: 'page-api',
                    path,
                    slug: page.slug,
                });
            }

            const responsePage = publicPage(page, site, origin);

            return publicContractJson({
                success: true,
                requestId,
                data: {
                    page: responsePage,
                },
                page: responsePage,
            }, {
                requestId,
                request,
                cache: previewToken ? 'private' : 'discovery',
                siteId: site.id,
            });
        }

        const pages = getPageSummary(site.id);
        const paginated = pages.slice(offset, offset + limit).map((page) => publicPage(page, site, origin));

        return publicContractJson({
            success: true,
            requestId,
            data: {
                pages: paginated,
                pagination: {
                    total: pages.length,
                    limit,
                    offset,
                    hasMore: offset + limit < pages.length,
                },
            },
            pages: paginated,
            pagination: {
                total: pages.length,
                limit,
                offset,
                hasMore: offset + limit < pages.length,
            },
        }, {
            requestId,
            request,
            cache: 'discovery',
            siteId: site.id,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
