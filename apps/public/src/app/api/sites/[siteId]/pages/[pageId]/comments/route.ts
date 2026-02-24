import { NextRequest, NextResponse } from 'next/server';
import {
    createComment,
    getCommentsByTarget,
    getPageSummary,
    getSiteByIdOrSlug,
} from '@/lib/backyStore';

interface RouteParams {
    params: Promise<{
        siteId: string;
        pageId: string;
    }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { siteId, pageId } = await params;
        const { searchParams } = new URL(request.url);
        const status =
            (searchParams.get('status') as 'pending' | 'approved' | 'rejected' | 'spam') || 'approved';
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const pages = getPageSummary(site.id, { includeUnpublished: true });
        const pageExists = pages.some((page) => page.id === pageId);
        if (!pageExists) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 });
        }

        const comments = getCommentsByTarget(site.id, {
            targetType: 'page',
            targetId: pageId,
            status,
            limit,
            offset,
        });

        return NextResponse.json({
            comments: comments.comments,
            count: comments.count,
            pagination: comments.pagination,
        });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { siteId, pageId } = await params;
        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const pages = getPageSummary(site.id, { includeUnpublished: true });
        const pageExists = pages.some((page) => page.id === pageId);
        if (!pageExists) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 });
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) {
            return NextResponse.json(
                {
                    error: 'Validation failed',
                    details: { content: 'Comment content is required' },
                },
                { status: 422 },
            );
        }

        const comment = createComment({
            siteId: site.id,
            targetType: 'page',
            targetId: pageId,
            content,
            authorName: typeof body.authorName === 'string' ? body.authorName : undefined,
            authorEmail: typeof body.authorEmail === 'string' ? body.authorEmail : undefined,
            authorWebsite: typeof body.authorWebsite === 'string' ? body.authorWebsite : undefined,
            status: 'pending',
        });

        return NextResponse.json({ success: true, comment }, { status: 201 });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
