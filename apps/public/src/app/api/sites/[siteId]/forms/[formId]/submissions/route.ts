import { NextRequest, NextResponse } from 'next/server';
import { createFormSubmission, getFormById, getSiteByIdOrSlug } from '@/lib/backyStore';

interface RouteParams {
    params: Promise<{
        siteId: string;
        formId: string;
    }>;
}

function parseRequestBody(body: unknown) {
    if (!body || typeof body !== 'object' || body === null) {
        return null;
    }

    const values =
        'values' in body && typeof (body as { values?: unknown }).values === 'object' && (body as { values?: unknown }).values !== null
            ? ((body as { values?: Record<string, unknown> }).values as Record<string, unknown>)
            : {};

    return {
        values,
        honeypot: typeof (body as { honeypot?: unknown }).honeypot === 'string'
            ? (body as { honeypot?: string }).honeypot
            : '',
        pageId: typeof (body as { pageId?: unknown }).pageId === 'string' ? (body as { pageId?: string }).pageId : null,
        postId: typeof (body as { postId?: unknown }).postId === 'string' ? (body as { postId?: string }).postId : null,
    };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { siteId, formId } = await params;
        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return NextResponse.json({ error: 'Site not found' }, { status: 404 });
        }

        const form = getFormById(site.id, formId);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        if (!form.isActive) {
            return NextResponse.json({ error: 'Form is not active' }, { status: 400 });
        }

        const body = parseRequestBody(await request.json().catch(() => null));
        if (!body) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const missingRequired = form.fields
            .filter((field) => field.required)
            .map((field) => field.key)
            .filter((key) => {
                const value = body.values[key];
                if (typeof value === 'string') {
                    return value.trim().length === 0;
                }

                return value === undefined || value === null;
            });

        if (missingRequired.length > 0) {
            return NextResponse.json(
                {
                    error: 'Validation failed',
                    details: missingRequired,
                },
                { status: 422 },
            );
        }

        const isSpam = Boolean(form.enableHoneypot && body.honeypot && body.honeypot.trim().length > 0);
        const status = isSpam ? 'spam' : 'pending';

        const submission = createFormSubmission({
            siteId: site.id,
            formId: form.id,
            values: body.values,
            pageId: body.pageId,
            postId: body.postId,
            userAgent: request.headers.get('user-agent') || undefined,
            ipHash: request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || undefined,
            requestId: request.headers.get('x-request-id') || undefined,
        });

        return NextResponse.json(
            {
                success: true,
                status,
                submission,
            },
            { status: 201 },
        );
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
