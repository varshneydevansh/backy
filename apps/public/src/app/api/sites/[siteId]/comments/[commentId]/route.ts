import { NextRequest, NextResponse } from 'next/server';
import {
  getCommentById,
  getSiteByIdOrSlug,
  updateCommentStatus,
} from '@/lib/backyStore';
import type { Comment } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    commentId: string;
  }>;
}

type CommentStatus = 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';

function parseStatus(raw: unknown): CommentStatus | null {
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

function parseBody(raw: unknown): {
  status: CommentStatus;
  reviewedBy?: string;
  actor?: string;
  rejectionReason?: string;
  blockReason?: string;
  requestId?: string;
} | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const status = parseStatus((raw as { status?: unknown }).status);
  if (!status) {
    return null;
  }

  const reviewedBy = typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
    ? (raw as { reviewedBy: string }).reviewedBy.trim()
    : undefined;

  const actor = typeof (raw as { actor?: unknown }).actor === 'string'
    ? (raw as { actor: string }).actor.trim()
    : undefined;

  const rejectionReason = typeof (raw as { rejectionReason?: unknown }).rejectionReason === 'string'
    ? ((raw as { rejectionReason: string }).rejectionReason.trim() || undefined)
    : undefined;

  const blockReason = typeof (raw as { blockReason?: unknown }).blockReason === 'string'
    ? ((raw as { blockReason: string }).blockReason.trim() || undefined)
    : undefined;

  const requestId = typeof (raw as { requestId?: unknown }).requestId === 'string'
    ? (raw as { requestId: string }).requestId.trim()
    : undefined;

  return {
    status,
    reviewedBy,
    actor,
    rejectionReason,
    blockReason,
    requestId: requestId || undefined,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
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

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
        { error: 'Invalid payload. status is required.' },
        { status: 400 },
      );
    }

    const updated = updateCommentStatus(comment.id, {
      status: payload.status,
      reviewedBy: payload.reviewedBy || null,
      actor: payload.actor,
      rejectionReason: payload.rejectionReason || null,
      blockReason: payload.blockReason || null,
      requestId: payload.requestId,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Unable to update comment' },
        { status: 409 },
      );
    }

    return NextResponse.json({ comment: updated as Comment });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
