import { NextRequest, NextResponse } from 'next/server';
import { getSiteByIdOrSlug, listAuditEvents } from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type AuditKind = 'form-submission' | 'contact-shared' | 'contact-status' | 'comment-submitted' | 'comment-status' | 'comment-reported' | 'all';

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
  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
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
      siteId: site.id,
      events: result.events,
      count: result.count,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
