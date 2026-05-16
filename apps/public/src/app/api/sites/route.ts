/**
 * ==========================================================================
 * REST API - Sites Endpoint
 * ==========================================================================
 *
 * GET /api/sites - List all sites
 * GET /api/sites?identifier=xxx - Get published site by id, slug, or custom domain
 */

import { NextRequest } from 'next/server';
import type { Site } from '@backy-cms/core';
import { getSites, type StoreSite } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

const parsePositiveInt = (value: string | null, fallback: number): number => {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseOffset = (value: string | null): number => {
    const parsed = value ? Number.parseInt(value, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parsePagination = (searchParams: URLSearchParams) => {
    const limit = Math.min(MAX_LIMIT, parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT));
    const offset = parseOffset(searchParams.get('offset'));

    return { limit, offset };
};

const paginateSites = <TSite>(sites: TSite[], limit: number, offset: number) => ({
    items: sites.slice(offset, offset + limit),
    pagination: {
        total: sites.length,
        limit,
        offset,
        hasMore: offset + limit < sites.length,
    },
});

const findPublicSite = (sites: StoreSite[], identifier: string): StoreSite | undefined => {
    const normalized = normalizeIdentifier(identifier);
    return sites.find(
        (site) =>
            normalizeIdentifier(site.id) === normalized ||
            normalizeIdentifier(site.slug) === normalized ||
            (site.customDomain ? normalizeIdentifier(site.customDomain) === normalized : false),
    );
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const publicSiteFromRepositorySite = (site: Site): StoreSite => ({
    id: site.id,
    name: site.name,
    slug: site.slug,
    description: site.description || '',
    customDomain: site.customDomain || null,
    status: site.isPublished ? 'published' : 'draft',
    isPublished: site.isPublished,
    theme: {
        colors: isRecord(site.theme?.colors) ? site.theme.colors as Record<string, string> : {},
        fonts: isRecord(site.theme?.fonts) ? site.theme.fonts as StoreSite['theme']['fonts'] : {},
        spacing: isRecord(site.theme?.spacing) ? site.theme.spacing as StoreSite['theme']['spacing'] : undefined,
        customCSS: typeof site.theme?.customCSS === 'string' ? site.theme.customCSS : '',
    },
});

const findPublicRepositorySite = async (
    repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
    identifier: string,
): Promise<Site | null> => {
    const siteById = await repositories.sites.getById(identifier);
    if (siteById?.isPublished) {
        return siteById;
    }

    const siteBySlug = await repositories.sites.getBySlug(identifier);
    if (siteBySlug?.isPublished) {
        return siteBySlug;
    }

    const normalized = normalizeIdentifier(identifier);
    const result = await repositories.sites.list({
        status: 'published',
        limit: 100,
        offset: 0,
    });

    return result.items.find((site) => (
        site.isPublished &&
        site.customDomain &&
        normalizeIdentifier(site.customDomain) === normalized
    )) || null;
};

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
    publicContractJson(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
        },
        { status, requestId, cache: 'error' },
    )
);

export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('slug') || searchParams.get('identifier');
        const { limit, offset } = parsePagination(searchParams);

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();

            if (identifier) {
                const site = await findPublicRepositorySite(repositories, identifier);
                if (!site) {
                    return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
                }

                const publicSite = publicSiteFromRepositorySite(site);
                return publicContractJson({
                    success: true,
                    requestId,
                    data: { site: publicSite },
                    site: publicSite,
                }, {
                    requestId,
                    request,
                    cache: 'discovery',
                    siteId: publicSite.id,
                });
            }

            const result = await repositories.sites.list({
                status: 'published',
                limit,
                offset,
            });
            const sites = result.items.filter((site) => site.isPublished).map(publicSiteFromRepositorySite);

            return publicContractJson({
                success: true,
                requestId,
                data: {
                    sites,
                    pagination: {
                        ...result.pagination,
                        total: result.pagination.total,
                    },
                },
                sites,
            }, {
                requestId,
                request,
                cache: 'discovery',
            });
        }

        const sites = getSites();

        if (identifier) {
            const site = findPublicSite(sites, identifier);
            if (!site) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            return publicContractJson({
                success: true,
                requestId,
                data: { site },
                site,
            }, {
                requestId,
                request,
                cache: 'discovery',
                siteId: site.id,
            });
        }

        const page = paginateSites(sites, limit, offset);

        return publicContractJson({
            success: true,
            requestId,
            data: {
                sites: page.items,
                pagination: page.pagination,
            },
            sites: page.items,
        }, {
            requestId,
            request,
            cache: 'discovery',
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
