/**
 * ==========================================================================
 * REST API - Sites Endpoint
 * ==========================================================================
 *
 * GET /api/sites - List all sites
 * GET /api/sites?identifier=xxx - Get published site by id, slug, or custom domain
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSites, type StoreSite } from '@/lib/backyStore';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const findPublicSite = (sites: StoreSite[], identifier: string): StoreSite | undefined => {
    const normalized = normalizeIdentifier(identifier);
    return sites.find(
        (site) =>
            normalizeIdentifier(site.id) === normalized ||
            normalizeIdentifier(site.slug) === normalized ||
            (site.customDomain ? normalizeIdentifier(site.customDomain) === normalized : false),
    );
};

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
    NextResponse.json(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
        },
        { status },
    )
);

export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('slug') || searchParams.get('identifier');
        const sites = getSites();

        if (identifier) {
            const site = findPublicSite(sites, identifier);
            if (!site) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            return NextResponse.json({
                success: true,
                requestId,
                data: { site },
                site,
            });
        }

        return NextResponse.json({
            success: true,
            requestId,
            data: {
                sites,
                pagination: {
                    total: sites.length,
                    limit: sites.length,
                    offset: 0,
                    hasMore: false,
                },
            },
            sites,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
