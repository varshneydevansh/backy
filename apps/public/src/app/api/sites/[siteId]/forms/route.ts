import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listFormsBySite } from '@/lib/backyStore';

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
        const pageId = searchParams.get('pageId');
        const postId = searchParams.get('postId');

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        }

        const forms = listFormsBySite(site.id, {
            pageId: pageId || undefined,
            postId: postId || undefined,
        });

        return NextResponse.json({
            success: true,
            requestId,
            data: {
                forms,
                total: forms.length,
                pagination: {
                    total: forms.length,
                    limit: forms.length,
                    offset: 0,
                    hasMore: false,
                },
            },
            forms,
            total: forms.length,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
