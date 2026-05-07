/**
 * ==========================================================================
 * REST API - Media Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/media - List public media files
 */

import { NextRequest, NextResponse } from 'next/server';
import type { MediaItem } from '@backy-cms/core';
import { getMediaList, getSiteByIdOrSlug } from '@/lib/backyStore';
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

const mediaTypeFromInput = (value: string | null): MediaItem['type'] | undefined => (
    value === 'image' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'document' ||
    value === 'font' ||
    value === 'other'
        ? value
        : undefined
);

const paginateMedia = (items: MediaItem[], limit: number, offset: number) => ({
    media: items.slice(offset, offset + limit),
    pagination: {
        total: items.length,
        limit,
        offset,
        hasMore: offset + limit < items.length,
    },
});

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

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();
            const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
            if (!site || !site.isPublished) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            const result = await repositories.media.list({
                siteId: site.id,
                type: mediaTypeFromInput(type) || 'all',
                folderId,
                visibility: 'public',
                search: search || undefined,
                limit: 100,
                offset: 0,
            });
            const filtered = result.items
                .filter((item) => scope ? item.scope === scope : true)
                .filter((item) => pageId ? item.pageIds.includes(pageId) || (item.scope === 'page' && item.scopeTargetId === pageId) : true)
                .filter((item) => postId ? item.postIds.includes(postId) || (item.scope === 'post' && item.scopeTargetId === postId) : true)
                .filter((item) => tag ? item.tags.includes(tag) : true);
            const mediaPayload = paginateMedia(filtered, limit, offset);

            return NextResponse.json({
                success: true,
                requestId,
                data: mediaPayload,
                ...mediaPayload,
            });
        }

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
