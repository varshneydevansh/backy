import { NextRequest, NextResponse } from 'next/server';
import {
  getCommentById,
  getPageSummary,
  getSiteByIdOrSlug,
  updateCommentStatus,
} from '@/lib/backyStore';
import type { Comment } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
    commentId: string;
  }>;
}

function parseStatus(raw: unknown): Comment['status'] | null {
  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam' ||
    raw === 'blocked'
  ) {
    return raw;
  }
  return null;
}

function parseBody(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  return {
    status: parseStatus((raw as { status?: unknown }).status),
    reviewedBy: typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
      ? (raw as { reviewedBy: string }).reviewedBy
      : undefined,
    rejectionReason: typeof (raw as { rejectionReason?: unknown }).rejectionReason === 'string'
      ? (raw as { rejectionReason: string }).rejectionReason
      : undefined,
    blockReason: typeof (raw as { blockReason?: unknown }).blockReason === 'string'
      ? (raw as { blockReason: string }).blockReason
      : undefined,
    requestId: typeof (raw as { requestId?: unknown }).requestId === 'string'
      ? (raw as { requestId: string }).requestId.trim()
      : undefined,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, pageId, commentId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const pages = getPageSummary(site.id, { includeUnpublished: true });
    const pageExists = pages.some((page) => page.id === pageId);
    if (!pageExists) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.targetType !== 'page' || comment.targetId !== pageId) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, pageId, commentId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const pageExists = getPageSummary(site.id, { includeUnpublished: true }).some((page) => page.id === pageId);
    if (!pageExists) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const targetComment = getCommentById(commentId);
    if (!targetComment || targetComment.targetType !== 'page' || targetComment.targetId !== pageId) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const body = parseBody(await request.json().catch(() => null));
    if (!body || !body.status) {
      return NextResponse.json({ error: 'Invalid payload. status is required.' }, { status: 400 });
    }

    const nextComment = updateCommentStatus(commentId, {
      status: body.status,
      reviewedBy: body.reviewedBy,
      rejectionReason: body.rejectionReason,
      blockReason: body.blockReason,
      requestId: body.requestId,
    });

    if (!nextComment) {
      return NextResponse.json({ error: 'Unable to update comment' }, { status: 409 });
    }

    return NextResponse.json({ comment: nextComment });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
