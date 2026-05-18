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
import { recordPreviewTokenUse } from '@/lib/previewTokenAudit';

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

const parseArchiveYear = (value: string | null): number | undefined => {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isInteger(parsed) && parsed >= 1970 && parsed <= 3000 ? parsed : undefined;
};

const parseArchiveMonth = (value: string | null): number | undefined => {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
};

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
    item.status === 'published'
    || (
        item.status === 'scheduled'
        && Boolean(item.scheduledAt)
        && Number.isFinite(Date.parse(item.scheduledAt || ''))
        && Date.parse(item.scheduledAt || '') <= Date.now()
    )
);

const frontendDesignFromMeta = (value: unknown) => {
    const meta = isRecord(value) ? value : {};
    if (typeof meta.frontendDesignTemplateId !== 'string') {
        return undefined;
    }

    return {
        templateId: meta.frontendDesignTemplateId,
        templateName: typeof meta.frontendDesignTemplateName === 'string' ? meta.frontendDesignTemplateName : undefined,
        routePattern: typeof meta.frontendDesignRoutePattern === 'string' ? meta.frontendDesignRoutePattern : undefined,
        source: meta.frontendDesignSource,
        chrome: meta.frontendDesignChrome,
        tokens: meta.frontendDesignTokens,
        customCss: typeof meta.frontendDesignCustomCss === 'string' ? meta.frontendDesignCustomCss : undefined,
        bindingHints: Array.isArray(meta.frontendDesignBindingHints) ? meta.frontendDesignBindingHints : [],
    };
};

const publicPost = <TPost extends { meta?: unknown }>(post: TPost) => ({
    ...post,
    frontendDesign: frontendDesignFromMeta(post.meta),
});

const publicPostFromRepositoryPost = (post: BackyPost) => {
    const canvasSize = isRecord(post.content.metadata?.canvasSize)
        ? post.content.metadata.canvasSize
        : { width: 1200, height: 900 };

    return publicPost({
        ...post,
        content: {
            elements: post.content.elements,
            canvasSize,
            customCSS: typeof post.content.metadata?.customCSS === 'string' ? post.content.metadata.customCSS : undefined,
            contentDocument: post.content,
        },
    });
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
        const search = (searchParams.get('q') || searchParams.get('search') || '').trim();
        const year = parseArchiveYear(searchParams.get('year'));
        const month = parseArchiveMonth(searchParams.get('month'));

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

                if (canPreview) {
                    await recordPreviewTokenUse({
                        repositories,
                        siteId: site.id,
                        targetType: 'post',
                        targetId: post.id,
                        requestId,
                        surface: 'blog-api',
                        path: `/blog/${post.slug}`,
                        slug: post.slug,
                    });
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

            const repositoryPosts: BackyPost[] = [];
            let repositoryOffset = 0;
            let hasMoreRepositoryPosts = true;
            while (hasMoreRepositoryPosts) {
                const result = await repositories.posts.list({
                    siteId: site.id,
                    includeUnpublished: true,
                    status: status || 'all',
                    categoryId: searchParams.get('categoryId') || category?.id || undefined,
                    tagId: searchParams.get('tagId') || tag?.id || undefined,
                    authorId: searchParams.get('authorId') || author?.id || undefined,
                    search: search || undefined,
                    year,
                    month,
                    limit: 100,
                    offset: repositoryOffset,
                });
                repositoryPosts.push(...result.items);
                hasMoreRepositoryPosts = result.pagination.hasMore;
                repositoryOffset += result.pagination.limit;
            }
            const visiblePosts = repositoryPosts.filter(isPubliclyReadable);
            const posts = visiblePosts.slice(offset, offset + limit).map(publicPostFromRepositoryPost);
            const data = {
                posts,
                pagination: {
                    total: visiblePosts.length,
                    limit,
                    offset,
                    hasMore: offset + limit < visiblePosts.length,
                },
                filters: {
                    q: search || null,
                    year: year || null,
                    month: month || null,
                    categoryId: searchParams.get('categoryId') || category?.id || null,
                    tagId: searchParams.get('tagId') || tag?.id || null,
                    authorId: searchParams.get('authorId') || author?.id || null,
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

            if (canPreview) {
                await recordPreviewTokenUse({
                    siteId: site.id,
                    targetType: 'post',
                    targetId: post.id,
                    requestId,
                    surface: 'blog-api',
                    path: `/blog/${post.slug}`,
                    slug: post.slug,
                });
            }

            const responsePost = publicPost(post);

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
            search: search || undefined,
            year,
            month,
        });
        const posts = data.posts.map(publicPost);
        return publicContractJson({
            success: true,
            requestId,
            data: {
                ...data,
                posts,
                filters: {
                    q: search || null,
                    year: year || null,
                    month: month || null,
                    categoryId: searchParams.get('categoryId') || null,
                    tagId: searchParams.get('tagId') || null,
                    authorId: searchParams.get('authorId') || null,
                },
            },
            ...data,
            posts,
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
