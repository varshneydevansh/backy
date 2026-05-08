/**
 * ==========================================================================
 * REST API - Blog Posts Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/blog - List blog posts
 * GET /api/sites/[siteId]/blog?slug=xxx - Get post by slug
 */

import { NextRequest } from 'next/server';
import type { BackyPost } from '@backy-cms/core';
import { getBlogPosts, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';
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

const parseStatusFilter = (value: string | null): 'published' | 'draft' | 'scheduled' | 'archived' | undefined => (
    value === 'published' || value === 'draft' || value === 'scheduled' || value === 'archived' ? value : undefined
);

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
    item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const publicPostFromRepositoryPost = (post: BackyPost) => {
    const canvasSize = isRecord(post.content.metadata?.canvasSize)
        ? post.content.metadata.canvasSize
        : { width: 1200, height: 900 };

    return {
        ...post,
        content: {
            elements: post.content.elements,
            canvasSize,
            customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
            contentDocument: post.content,
        },
    };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        const previewToken = searchParams.get('previewToken');
        const limit = parseBoundedInteger(searchParams.get('limit'), 10, 1, 100);
        const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
        const status = parseStatusFilter(searchParams.get('status'));

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();
            const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

            if (!site) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            if (slug) {
                const post = await repositories.posts.getBySlug(site.id, slug);
                const canPreview = post && previewToken
                    ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'post', post.id, previewToken)
                    : false;

                if (!post || (!isPubliclyReadable(post) && !canPreview)) {
                    return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
                }

                const responsePost = publicPostFromRepositoryPost(post);
                const cacheRevision = previewToken
                    ? undefined
                    : await repositories.cacheInvalidations.latestRevision({
                        siteId: site.id,
                        scope: 'content',
                    }) || undefined;

                return publicContractJson({
                    success: true,
                    requestId,
                    data: {
                        post: responsePost,
                    },
                    post: responsePost,
                }, {
                    requestId,
                    request,
                    cache: previewToken ? 'private' : 'discovery',
                    siteId: site.id,
                    cacheRevision,
                });
            }

            const categorySlug = searchParams.get('categorySlug');
            const tagSlug = searchParams.get('tagSlug');
            const authorSlug = searchParams.get('authorSlug');
            const category = categorySlug
                ? await repositories.blogTaxonomy.getCategoryByIdOrSlug(site.id, categorySlug)
                : null;
            const tag = tagSlug
                ? await repositories.blogTaxonomy.getTagByIdOrSlug(site.id, tagSlug)
                : null;
            const author = authorSlug
                ? (await repositories.blogTaxonomy.listAuthors(site.id)).find((item) => item.slug === authorSlug || item.id === authorSlug)
                : null;

            const result = await repositories.posts.list({
                siteId: site.id,
                includeUnpublished: false,
                status: status === 'published' ? 'published' : 'published',
                categoryId: searchParams.get('categoryId') || category?.id || undefined,
                tagId: searchParams.get('tagId') || tag?.id || undefined,
                authorId: searchParams.get('authorId') || author?.id || undefined,
                limit,
                offset,
            });
            const posts = result.items.filter(isPubliclyReadable).map(publicPostFromRepositoryPost);
            const data = {
                posts,
                pagination: {
                    ...result.pagination,
                    total: posts.length,
                },
            };
            const cacheRevision = await repositories.cacheInvalidations.latestRevision({
                siteId: site.id,
                scope: 'content',
            }) || undefined;

            return publicContractJson({
                success: true,
                requestId,
                data,
                ...data,
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

        if (slug) {
            const previewPosts = previewToken
                ? getBlogPosts(site.id, { slug, includeUnpublished: true }).posts
                : [];
            const previewPost = previewPosts[0];
            const canPreview = previewPost
                ? validatePreviewToken(site.id, 'post', previewPost.id, previewToken)
                : false;
            const { posts } = canPreview
                ? { posts: previewPosts }
                : getBlogPosts(site.id, { slug, status: status === 'published' ? status : undefined });
            const post = posts[0];

            if (!post) {
                return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
            }

            return publicContractJson({
                success: true,
                requestId,
                data: {
                    post,
                },
                post,
            }, {
                requestId,
                request,
                cache: previewToken ? 'private' : 'discovery',
                siteId: site.id,
            });
        }

        const data = getBlogPosts(site.id, {
            limit,
            offset,
            status: status === 'published' ? status : undefined,
            categoryId: searchParams.get('categoryId') || undefined,
            categorySlug: searchParams.get('categorySlug') || undefined,
            tagId: searchParams.get('tagId') || undefined,
            tagSlug: searchParams.get('tagSlug') || undefined,
            authorId: searchParams.get('authorId') || undefined,
            authorSlug: searchParams.get('authorSlug') || undefined,
        });
        return publicContractJson({
            success: true,
            requestId,
            data,
            ...data,
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
