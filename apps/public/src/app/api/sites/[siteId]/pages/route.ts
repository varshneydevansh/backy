/**
 * ==========================================================================
 * REST API - Pages Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/pages - List pages for a site
 * GET /api/sites/[siteId]/pages?slug=xxx - Get page by slug
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyPage } from '@backy-cms/core';
import { getPageByPath, getPageSummary, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
    NextResponse.json(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
            errorMessage: message,
        },
        { status },
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
    item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const publicPageFromRepositoryPage = (page: BackyPage) => {
    const canvasSize = isRecord(page.content.metadata?.canvasSize)
        ? page.content.metadata.canvasSize
        : { width: 1200, height: 900 };

    return {
        ...page,
        content: {
            elements: page.content.elements,
            canvasSize,
            customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
            contentDocument: page.content,
        },
    };
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

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();
            const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

            if (!site) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            if (slug) {
                const path = slug.trim().replace(/^\/+|\/+$/g, '') || 'index';
                const page = await repositories.pages.getBySlug(site.id, path);

                if (!page || !isPubliclyReadable(page)) {
                    return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
                }

                const responsePage = publicPageFromRepositoryPage(page);
                return NextResponse.json({
                    success: true,
                    requestId,
                    data: {
                        page: responsePage,
                    },
                    page: responsePage,
                });
            }

            const result = await repositories.pages.list({
                siteId: site.id,
                includeUnpublished: false,
                status: 'published',
                limit,
                offset,
            });
            const pages = result.items.filter(isPubliclyReadable).map(publicPageFromRepositoryPage);

            return NextResponse.json({
                success: true,
                requestId,
                data: {
                    pages,
                    pagination: {
                        ...result.pagination,
                        total: pages.length,
                    },
                },
                pages,
                pagination: {
                    ...result.pagination,
                    total: pages.length,
                },
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

            return NextResponse.json({
                success: true,
                requestId,
                data: {
                    page,
                },
                page,
            });
        }

        const pages = getPageSummary(site.id);
        const paginated = pages.slice(offset, offset + limit);

        return NextResponse.json({
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
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
