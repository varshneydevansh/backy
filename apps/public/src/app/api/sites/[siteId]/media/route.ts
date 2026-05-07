/**
 * ==========================================================================
 * REST API - Media Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/media - List public media files
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMediaList, getSiteByIdOrSlug } from '@/lib/backyStore';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type'); // image, video, audio, document, font
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50));
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
        const scope = searchParams.get('scope');
        const pageId = searchParams.get('pageId');
        const postId = searchParams.get('postId');
        const search = searchParams.get('search') || searchParams.get('q');
        const tag = searchParams.get('tag');
        const folderId = searchParams.has('folderId') ? searchParams.get('folderId') : undefined;

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const mediaPayload = getMediaList(site.id, {
            type: type || undefined,
            scope: scope || undefined,
            visibility: 'public',
            search: search || undefined,
            tag: tag || undefined,
            folderId,
            pageId: pageId || undefined,
            postId: postId || undefined,
            limit,
            offset,
        });

        return NextResponse.json(mediaPayload);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
