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
            return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
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

        return NextResponse.json({
            success: true,
            requestId,
            data: mediaPayload,
            ...mediaPayload,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
