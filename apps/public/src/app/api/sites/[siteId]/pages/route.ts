/**
 * ==========================================================================
 * REST API - Pages Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/pages - List pages for a site
 * GET /api/sites/[siteId]/pages?slug=xxx - Get page by slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPageByPath, getPageSummary, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';

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

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug') || searchParams.get('path');
        const previewToken = searchParams.get('previewToken');
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

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
