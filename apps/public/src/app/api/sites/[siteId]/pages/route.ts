/**
 * ==========================================================================
 * REST API - Pages Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/pages - List pages for a site
 * GET /api/sites/[siteId]/pages?slug=xxx - Get page by slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPageByPath, getPageSummary, getSiteByIdOrSlug } from '@/lib/backyStore';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        const includeUnpublished = searchParams.get('includeUnpublished') === 'true' || false;
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        if (slug) {
            const path = slug.trim().replace(/^\/+|\/+$/g, '') || 'index';
            const page = getPageByPath(site.id, path, { includeUnpublished });

            if (!page) {
                return NextResponse.json({ error: 'Page not found' }, { status: 404 });
            }

            return NextResponse.json({ page });
        }

        const pages = getPageSummary(site.id, { includeUnpublished });
        const paginated = pages.slice(offset, offset + limit);

        return NextResponse.json({
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
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
