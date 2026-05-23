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
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
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

const parseBoundedInteger = (
    value: string | null,
    fallback: number,
    min: number,
    max?: number,
): { value: number; invalid?: string } => {
    if (value === null || value.trim() === '') {
        return { value: fallback };
    }

    const parsed = Number(value);
    if (
        !Number.isInteger(parsed) ||
        parsed < min ||
        (max !== undefined && parsed > max)
    ) {
        return { value: fallback, invalid: value };
    }

    return { value: parsed };
};

const parseStatusFilter = (
    value: string | null,
): { status?: 'published' | 'draft' | 'scheduled' | 'archived'; invalid?: string } => {
    if (value === null || value.trim() === '') {
        return {};
    }

    return value === 'published' || value === 'draft' || value === 'scheduled' || value === 'archived'
        ? { status: value }
        : { invalid: value };
};

const parseArchiveYear = (value: string | null): { value?: number; invalid?: string } => {
    if (value === null || value.trim() === '') {
        return {};
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1970 && parsed <= 3000
        ? { value: parsed }
        : { invalid: value };
};

const parseArchiveMonth = (value: string | null): { value?: number; invalid?: string } => {
    if (value === null || value.trim() === '') {
        return {};
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
        ? { value: parsed }
        : { invalid: value };
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

const publicPost = <TPost extends { meta?: unknown }>(post: TPost) => ({
    ...post,
    frontendDesign: frontendDesignProvenanceFromMetadata(post.meta),
});

const publicPostContentFromRepositoryDocument = (content: BackyPost['content']) => {
    const metadata = isRecord(content.metadata) ? content.metadata : {};
    const canvasSize = isRecord(metadata.canvasSize)
        ? metadata.canvasSize
        : { width: 1200, height: 900 };

    return {
        elements: content.elements,
        canvasSize,
        customCSS: typeof metadata.customCSS === 'string' ? metadata.customCSS : undefined,
        customJS: typeof metadata.customJS === 'string' ? metadata.customJS : undefined,
        themeTokenRefs: content.themeTokenRefs,
        assets: content.assets,
        animations: Array.isArray(metadata.animations) || isRecord(metadata.animations)
            ? metadata.animations
            : undefined,
        interactions: content.interactions,
        seo: content.seo,
        dataBindings: content.dataBindings,
        editableMap: content.editableMap,
        metadata,
        contentDocument: content,
    };
};

const publicPostFromRepositoryPost = (post: BackyPost) => {
    return publicPost({
        ...post,
        content: publicPostContentFromRepositoryDocument(post.content),
    });
};

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        const previewToken = searchParams.get('previewToken');
        const limitFilter = parseBoundedInteger(searchParams.get('limit'), 10, 1, 100);
        if (limitFilter.invalid) {
            return errorResponse(400, 'INVALID_BLOG_LIMIT', 'Invalid blog limit. Use an integer from 1 to 100.', requestId);
        }
        const offsetFilter = parseBoundedInteger(searchParams.get('offset'), 0, 0);
        if (offsetFilter.invalid) {
            return errorResponse(400, 'INVALID_BLOG_OFFSET', 'Invalid blog offset. Use an integer greater than or equal to 0.', requestId);
        }
        const statusFilter = parseStatusFilter(searchParams.get('status'));
        if (statusFilter.invalid) {
            return errorResponse(400, 'INVALID_BLOG_STATUS', 'Invalid blog status filter. Use published, draft, scheduled, or archived.', requestId);
        }
        const yearFilter = parseArchiveYear(searchParams.get('year'));
        if (yearFilter.invalid) {
            return errorResponse(400, 'INVALID_BLOG_ARCHIVE_YEAR', 'Invalid blog archive year. Use an integer from 1970 to 3000.', requestId);
        }
        const monthFilter = parseArchiveMonth(searchParams.get('month'));
        if (monthFilter.invalid) {
            return errorResponse(400, 'INVALID_BLOG_ARCHIVE_MONTH', 'Invalid blog archive month. Use an integer from 1 to 12.', requestId);
        }
        const limit = limitFilter.value;
        const offset = offsetFilter.value;
        const status = statusFilter.status;
        const search = (searchParams.get('q') || searchParams.get('search') || '').trim();
        const year = yearFilter.value;
        const month = monthFilter.value;

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
