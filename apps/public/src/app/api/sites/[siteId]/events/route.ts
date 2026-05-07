import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listAuditEvents } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type AuditKind = 'form-submission' | 'contact-shared' | 'contact-status' | 'comment-submitted' | 'comment-status' | 'comment-reported' | 'all';

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

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 20;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function parseOffset(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseKind(raw: string | null): AuditKind {
  if (
    raw === 'form-submission' ||
    raw === 'contact-shared' ||
    raw === 'contact-status' ||
    raw === 'comment-submitted' ||
    raw === 'comment-status' ||
    raw === 'comment-reported'
  ) {
    return raw;
  }

  return 'all';
}

function parseTextInput(raw: string | null): string {
  return raw ? raw.trim() : '';
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const responseRequestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', responseRequestId);
    }

    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get('kind'));
    const requestId = parseTextInput(searchParams.get('requestId'));
    const formId = parseTextInput(searchParams.get('formId'));
    const commentId = parseTextInput(searchParams.get('commentId'));
    const contactId = parseTextInput(searchParams.get('contactId'));
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));

    const result = listAuditEvents(site.id, {
      kind,
      requestId: requestId || undefined,
      formId: formId || undefined,
      commentId: commentId || undefined,
      contactId: contactId || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId: responseRequestId,
      data: {
        siteId: site.id,
        events: result.events,
        count: result.count,
        pagination: result.pagination,
      },
      siteId: site.id,
      events: result.events,
      count: result.count,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('API Error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', responseRequestId);
  }
}
