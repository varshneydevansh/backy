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

export async function GET(request: NextRequest, { params }: RouteParams) {
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
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
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
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }

            return NextResponse.json({ post });
        }

        const data = getBlogPosts(site.id, {
            limit,
            offset,
            status: status === 'published' ? status : undefined,
            categoryId: searchParams.get('categoryId') || undefined,
            categorySlug: searchParams.get('categorySlug') || undefined,
            tagId: searchParams.get('tagId') || undefined,
            tagSlug: searchParams.get('tagSlug') || undefined,
        });
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
