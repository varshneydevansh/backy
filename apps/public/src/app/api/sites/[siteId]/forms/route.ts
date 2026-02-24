import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listFormsBySite } from '@/lib/backyStore';

interface RouteParams {
    params: Promise<{
        siteId: string;
    }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { siteId } = await params;
        const { searchParams } = new URL(request.url);
        const pageId = searchParams.get('pageId');
        const postId = searchParams.get('postId');

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const forms = listFormsBySite(site.id, {
            pageId: pageId || undefined,
            postId: postId || undefined,
        });

        return NextResponse.json({ forms, total: forms.length });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
