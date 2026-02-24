import { NextRequest, NextResponse } from 'next/server';
import {
  getBlogPosts,
  getCommentById,
  getSiteByIdOrSlug,
  updateCommentStatus,
} from '@/lib/backyStore';
import type { Comment } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
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
    const { siteId, postId, commentId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = posts.posts.some((post) => post.id === postId);
    if (!postExists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const comment = getCommentById(commentId);
    if (!comment || comment.targetType !== 'post' || comment.targetId !== postId) {
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
    const { siteId, postId, commentId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const posts = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = posts.posts.some((post) => post.id === postId);
    if (!postExists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const targetComment = getCommentById(commentId);
    if (!targetComment || targetComment.targetType !== 'post' || targetComment.targetId !== postId) {
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
