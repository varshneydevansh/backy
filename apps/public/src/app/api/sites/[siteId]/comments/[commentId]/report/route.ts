import { NextRequest, NextResponse } from 'next/server';
import {
  getCommentById,
  getSiteByIdOrSlug,
  getCommentReportReasons,
  reportComment,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    commentId: string;
  }>;
}

function parseTextInput(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseReason(raw: unknown): string {
  const value = parseTextInput(raw);
  if (!value) {
    return '';
  }

  const reasons = getCommentReportReasons();
  const matched = reasons.find((reason) => reason === value);
  return matched || '';
}

function parseBody(raw: unknown): {
  reason: string;
  actor?: string;
  requestId?: string;
} | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const reason = parseReason((raw as { reason?: unknown }).reason);
  const actor = parseTextInput((raw as { actor?: unknown }).actor);
  const requestId = parseTextInput((raw as { requestId?: unknown }).requestId);

  if (!reason) {
    return null;
  }

  return {
    reason,
    actor: actor || undefined,
    requestId: requestId || undefined,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const reasons = getCommentReportReasons();
    return NextResponse.json({ reasons });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, commentId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.siteId !== site.id) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const payload = parseBody(await request.json().catch(() => null));
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid payload. reason is required.' },
        { status: 400 },
      );
    }

    const updated = reportComment({
      commentId: comment.id,
      siteId: site.id,
      reason: payload.reason,
      actor: payload.actor,
      requestId: payload.requestId,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Unable to process report' },
        { status: 409 },
      );
    }

    return NextResponse.json({ comment: updated }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
