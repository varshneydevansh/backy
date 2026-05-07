import { NextRequest, NextResponse } from 'next/server';
import { getFormById, getSiteByIdOrSlug, listFormSubmissions } from '@/lib/backyStore';

interface RouteParams {
    params: Promise<{
        siteId: string;
        formId: string;
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

export async function GET(_request: NextRequest, { params }: RouteParams) {
    const requestId = _request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId, formId } = await params;

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        }

        const form = getFormById(site.id, formId);
        if (!form) {
            return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
        }

        const { searchParams } = new URL(_request.url);
        const statusParam = searchParams.get('status');
        const filterRequestId = searchParams.get('requestId')?.trim() || undefined;
        const status = statusParam === 'pending' || statusParam === 'approved' || statusParam === 'rejected' || statusParam === 'spam'
          ? statusParam
          : undefined;
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const submissions = listFormSubmissions(form.id, {
          status,
          requestId: filterRequestId,
          limit: Number.isFinite(limit) ? limit : 20,
          offset: Number.isFinite(offset) ? offset : 0,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            form,
            submissions,
          },
          form,
          submissions,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}
