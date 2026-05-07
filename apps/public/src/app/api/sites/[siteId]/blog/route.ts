/**
 * ==========================================================================
 * REST API - Blog Posts Endpoint
 * ==========================================================================
 *
 * GET /api/sites/[siteId]/blog - List blog posts
 * GET /api/sites/[siteId]/blog?slug=xxx - Get post by slug
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBlogPosts, getSiteByIdOrSlug, validatePreviewToken } from '@/lib/backyStore';

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
        const slug = searchParams.get('slug');
        const previewToken = searchParams.get('previewToken');
        const limit = parseInt(searchParams.get('limit') || '10');
        const offset = parseInt(searchParams.get('offset') || '0');
        const status = searchParams.get('status') as
            | 'published'
            | 'draft'
            | 'scheduled'
            | 'archived'
            | null;

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

            return NextResponse.json({
                success: true,
                requestId,
                data: {
                    post,
                },
                post,
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
        return NextResponse.json({
            success: true,
            requestId,
            data,
            ...data,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
