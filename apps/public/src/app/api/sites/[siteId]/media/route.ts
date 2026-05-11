/**
 * ==========================================================================
 * REST API - Media Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/media - List public media files
 */

import { NextRequest } from 'next/server';
import type { MediaItem } from '@backy-cms/core';
import { getMediaList, getSiteByIdOrSlug } from '@/lib/backyStore';
import { isMediaQuarantined } from '@/lib/mediaSafety';
import { withResponsiveMediaManifest } from '@/lib/mediaResponsive';
import { booleanQueryFlag, mediaMatchesScopeFilters } from '@/lib/mediaScope';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
    publicContractJson(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
            errorMessage: message,
        },
        { status, requestId, cache: 'error' },
    )
);

const mediaTypeFromInput = (value: string | null): MediaItem['type'] | undefined => {
    if (value === 'file') {
        return 'document';
    }

    return value === 'image' ||
        value === 'video' ||
        value === 'audio' ||
        value === 'document' ||
        value === 'font' ||
        value === 'other'
        ? value
        : undefined;
};

const mediaTagMatches = (tags: string[], tag: string | null) => {
    if (!tag) {
        return true;
    }

    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) {
        return true;
    }

    return tags.some((item) => item.trim().toLowerCase() === normalizedTag);
};

const paginateMedia = (siteId: string, items: MediaItem[], limit: number, offset: number) => ({
    media: items.slice(offset, offset + limit).map((item) => withResponsiveMediaManifest(siteId, item)),
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
        const type = mediaTypeFromInput(searchParams.get('type')); // image, video, audio, document/file, font
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50));
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
        const scope = searchParams.get('scope');
        const pageId = searchParams.get('pageId');
        const postId = searchParams.get('postId') || searchParams.get('blogId');
        const globalOnly = booleanQueryFlag(searchParams.get('global'));
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
                type: type || 'all',
                folderId,
                visibility: 'public',
                search: search || undefined,
                limit: 10000,
                offset: 0,
            });
            const filtered = result.items
                .filter((item) => mediaMatchesScopeFilters(item, { scope, pageId, postId, globalOnly }))
                .filter((item) => mediaTagMatches(item.tags, tag))
                .filter((item) => !isMediaQuarantined(item));
            const mediaPayload = paginateMedia(site.id, filtered, limit, offset);
            const cacheRevision = await repositories.cacheInvalidations.latestRevision({
                siteId: site.id,
                scope: 'media',
            }) || undefined;

            return publicContractJson({
                success: true,
                requestId,
                data: mediaPayload,
                ...mediaPayload,
            }, {
                requestId,
                request,
                cache: 'discovery',
                siteId: site.id,
                cacheRevision,
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
            global: globalOnly,
            limit,
            offset,
        });
        const mediaWithVariants = {
            ...mediaPayload,
            media: mediaPayload.media
                .filter((item) => !isMediaQuarantined(item))
                .map((item) => withResponsiveMediaManifest(site.id, item)),
        };

        return publicContractJson({
            success: true,
            requestId,
            data: mediaWithVariants,
            ...mediaWithVariants,
        }, {
            requestId,
            request,
            cache: 'discovery',
            siteId: site.id,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
