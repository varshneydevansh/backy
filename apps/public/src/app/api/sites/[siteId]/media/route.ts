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
import { booleanQueryFlag, mediaMatchesScopeFilters } from '@/lib/mediaScope';
import { publicContractJson } from '@/lib/publicContractResponse';
import { toPublicMediaAsset } from '@/lib/publicMediaResource';
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

const mediaTypeValues = ['image', 'video', 'audio', 'document', 'font', 'other'] as const satisfies readonly MediaItem['type'][];
const mediaScopeValues = ['global', 'page', 'post'] as const;
const DEFAULT_MEDIA_LIMIT = 50;
const MAX_MEDIA_LIMIT = 100;

type PublicMediaScopeFilter = typeof mediaScopeValues[number];

const mediaTypeFromInput = (value: string | null): { type?: MediaItem['type']; invalid?: string } => {
    if (!value) {
        return {};
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return {};
    }

    if (normalized === 'file') {
        return { type: 'document' };
    }

    if (mediaTypeValues.includes(normalized as MediaItem['type'])) {
        return { type: normalized as MediaItem['type'] };
    }

    return { invalid: value };
};

const mediaScopeFromInput = (value: string | null): { scope?: PublicMediaScopeFilter; invalid?: string } => {
    if (!value) {
        return {};
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return {};
    }

    if (mediaScopeValues.includes(normalized as PublicMediaScopeFilter)) {
        return { scope: normalized as PublicMediaScopeFilter };
    }

    return { invalid: value };
};

const booleanFilterFromInput = (value: string | null): { value?: boolean; invalid?: string } => {
    if (value === null) {
        return {};
    }

    const parsed = booleanQueryFlag(value);
    if (parsed === undefined && value.trim().length > 0) {
        return { invalid: value };
    }

    return { value: parsed };
};

const mediaFolderIdFromInput = (searchParams: URLSearchParams): string | null | undefined => {
    const rawValue = searchParams.has('folderId')
        ? searchParams.get('folderId')
        : searchParams.has('folder')
            ? searchParams.get('folder')
            : undefined;

    if (rawValue === undefined) {
        return undefined;
    }

    const normalized = (rawValue || '').trim();
    if (!normalized || normalized.toLowerCase() === 'root') {
        return null;
    }

    return normalized;
};

const integerQueryFromInput = (
    value: string | null,
    fallback: number,
    min: number,
    max?: number,
): { value: number; invalid?: string } => {
    if (value === null || value.trim() === '') {
        return { value: fallback };
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
        return { value: fallback, invalid: value };
    }

    return { value: parsed };
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
    media: items.slice(offset, offset + limit).map((item) => toPublicMediaAsset(siteId, item)),
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
        const mediaType = mediaTypeFromInput(searchParams.get('type')); // image, video, audio, document/file, font, other
        if (mediaType.invalid) {
            return errorResponse(
                400,
                'INVALID_MEDIA_TYPE',
                'Invalid media type. Use one of: image, video, audio, document, file, font, other.',
                requestId,
            );
        }
        const type = mediaType.type;
        const mediaLimit = integerQueryFromInput(searchParams.get('limit'), DEFAULT_MEDIA_LIMIT, 1, MAX_MEDIA_LIMIT);
        if (mediaLimit.invalid) {
            return errorResponse(
                400,
                'INVALID_MEDIA_LIMIT',
                'Invalid media limit. Use an integer from 1 to 100.',
                requestId,
            );
        }
        const limit = mediaLimit.value;
        const mediaOffset = integerQueryFromInput(searchParams.get('offset'), 0, 0);
        if (mediaOffset.invalid) {
            return errorResponse(
                400,
                'INVALID_MEDIA_OFFSET',
                'Invalid media offset. Use an integer greater than or equal to 0.',
                requestId,
            );
        }
        const offset = mediaOffset.value;
        const mediaScope = mediaScopeFromInput(searchParams.get('scope'));
        if (mediaScope.invalid) {
            return errorResponse(
                400,
                'INVALID_MEDIA_SCOPE',
                'Invalid media scope. Use one of: global, page, post.',
                requestId,
            );
        }
        const scope = mediaScope.scope;
        const pageId = searchParams.get('pageId');
        const postId = searchParams.get('postId') || searchParams.get('blogId');
        const globalFilter = booleanFilterFromInput(searchParams.get('global'));
        if (globalFilter.invalid) {
            return errorResponse(
                400,
                'INVALID_MEDIA_GLOBAL_FILTER',
                'Invalid global media filter. Use true or false.',
                requestId,
            );
        }
        const globalOnly = globalFilter.value;
        const search = searchParams.get('search') || searchParams.get('q');
        const tag = searchParams.get('tag');
        const folderId = mediaFolderIdFromInput(searchParams);

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
            limit: 10000,
            offset: 0,
        });
        const visibleMedia = mediaPayload.media.filter((item) => !isMediaQuarantined(item));
        const mediaWithVariants = paginateMedia(site.id, visibleMedia, limit, offset);

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
