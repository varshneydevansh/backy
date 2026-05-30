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
import { publicRouteHostMatchesSite } from '@/lib/publicRouteHost';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISCOVERY_RATE_LIMIT_WINDOW_MS = 60_000;
const DISCOVERY_RATE_LIMIT_MAX = 600;
const RATE_LIMIT_STATE = new Map<string, { count: number; resetAt: number }>();

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

const stripTrailingDot = (value: string) => value.endsWith('.') ? value.slice(0, -1) : value;

const normalizeIdentifier = (value: string) => stripTrailingDot(value.trim().toLowerCase());

const normalizeDomain = (value: string | null | undefined): string | null => {
    const raw = (value || '').trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
        return stripTrailingDot(parsed.hostname.toLowerCase().replace(/^www\./, ''));
    } catch {
        const host = raw
            .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
            .split(/[/?#]/)[0]
            .split('@')
            .pop()
            ?.split(':')[0]
            .toLowerCase()
            .replace(/^www\./, '');
        return host ? stripTrailingDot(host) : null;
    }
};

const envNumber = (key: string, fallback: number): number => {
    const parsed = Number.parseInt(process.env[key] || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clientAddress = (request: NextRequest): string => (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
);

const rateLimitKey = (request: NextRequest): string => {
    const address = clientAddress(request);
    const origin = request.headers.get('origin') || request.headers.get('referer') || 'anonymous';

    return `${address}:${origin}`;
};

const isRateLimitDisabled = () => TRUE_VALUES.has((process.env.BACKY_PUBLIC_DISCOVERY_RATE_LIMIT_DISABLED || '').toLowerCase());

const checkDiscoveryRateLimit = (request: NextRequest) => {
    const limit = envNumber('BACKY_PUBLIC_DISCOVERY_RATE_LIMIT_MAX', DISCOVERY_RATE_LIMIT_MAX);
    const windowMs = envNumber('BACKY_PUBLIC_DISCOVERY_RATE_LIMIT_WINDOW_MS', DISCOVERY_RATE_LIMIT_WINDOW_MS);
    const now = Date.now();
    const key = rateLimitKey(request);
    const current = RATE_LIMIT_STATE.get(key);
    const state = current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + windowMs };

    state.count += 1;
    RATE_LIMIT_STATE.set(key, state);

    for (const [candidateKey, candidate] of RATE_LIMIT_STATE.entries()) {
        if (candidate.resetAt <= now) {
            RATE_LIMIT_STATE.delete(candidateKey);
        }
    }

    const remaining = Math.max(0, limit - state.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));

    return {
        limited: state.count > limit,
        limit,
        remaining,
        resetAt: state.resetAt,
        retryAfterSeconds,
    };
};

const findPublicSite = (sites: StoreSite[], identifier: string): StoreSite | undefined => {
    const normalized = normalizeIdentifier(identifier);
    return sites.find(
        (site) =>
            normalizeIdentifier(site.id) === normalized ||
            normalizeIdentifier(site.slug) === normalized ||
            publicRouteHostMatchesSite(site, identifier),
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

    const normalizedDomain = normalizeDomain(identifier);
    const result = await repositories.sites.list({
        status: 'published',
        limit: 100,
        offset: 0,
    });

    return result.items.find((site) => (
        site.isPublished &&
        normalizedDomain &&
        publicRouteHostMatchesSite(site, normalizedDomain)
    )) || null;
};

const errorResponse = (status: number, code: string, message: string, requestId: string, headers?: HeadersInit) => (
    publicContractJson(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
        },
        { status, requestId, cache: 'error', headers },
    )
);

const rateLimitHeaders = (limit: ReturnType<typeof checkDiscoveryRateLimit>) => ({
    'x-ratelimit-limit': String(limit.limit),
    'x-ratelimit-remaining': String(limit.remaining),
    'x-ratelimit-reset': String(Math.ceil(limit.resetAt / 1000)),
    ...(limit.limited ? { 'retry-after': String(limit.retryAfterSeconds) } : {}),
});

const latestDiscoveryCacheRevision = async (
    repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
    siteId?: string,
) => {
    const revision = await repositories.cacheInvalidations.latestRevision({
        ...(siteId ? { siteId } : {}),
        scope: 'discovery',
    });
    return revision || undefined;
};

export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const rateLimit = isRateLimitDisabled() ? null : checkDiscoveryRateLimit(request);
        if (rateLimit?.limited) {
            return errorResponse(429, 'RATE_LIMITED', 'Too many site discovery requests.', requestId, rateLimitHeaders(rateLimit));
        }

        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('slug') || searchParams.get('identifier');
        const { limit, offset } = parsePagination(searchParams);
        const headers = rateLimit ? rateLimitHeaders(rateLimit) : undefined;

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();

            if (identifier) {
                const site = await findPublicRepositorySite(repositories, identifier);
                if (!site) {
                    return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
                }

                const publicSite = publicSiteFromRepositorySite(site);
                const cacheRevision = await latestDiscoveryCacheRevision(repositories, publicSite.id);
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
                    cacheRevision,
                    headers,
                });
            }

            const result = await repositories.sites.list({
                status: 'published',
                limit,
                offset,
            });
            const sites = result.items.filter((site) => site.isPublished).map(publicSiteFromRepositorySite);
            const cacheRevision = await latestDiscoveryCacheRevision(repositories);

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
                cacheRevision,
                headers,
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
                headers,
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
            headers,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
