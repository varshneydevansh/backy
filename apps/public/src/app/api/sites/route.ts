/**
 * ==========================================================================
 * REST API - Sites Endpoint
 * ==========================================================================
 *
 * GET /api/sites - List all sites
 * GET /api/sites?slug=xxx - Get site by slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, getSites } from '@/lib/backyStore';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('slug') || searchParams.get('identifier');

        if (identifier) {
            const site = getSiteByIdOrSlug(identifier);
            if (!site) {
                return NextResponse.json({ error: 'Site not found' }, { status: 404 });
            }

            return NextResponse.json({ site });
        }

        const sites = getSites();
        return NextResponse.json({ sites });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
