import { NextRequest, NextResponse } from 'next/server';
import {
  bulkUpdateCommentStatus,
  getSiteByIdOrSlug,
  listComments,
} from '@/lib/backyStore';
import type { CommentTargetType } from '@backy-cms/core';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type CommentStatusFilter = 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked' | 'all';

function parseStatus(raw: string | null): CommentStatusFilter {
  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'spam' ||
    raw === 'blocked' ||
    raw === 'all'
  ) {
    return raw;
  }

  return 'all';
}

function parseTargetType(raw: string | null): CommentTargetType | 'all' {
  if (raw === 'page' || raw === 'post' || raw === 'all') {
    return raw;
  }

  return 'all';
}

function parseSort(raw: string | null) {
  return raw === 'oldest' ? 'oldest' : 'newest';
}

function parseBoolean(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

function parseRequestId(raw: string | null): string | undefined {
  const value = raw ? raw.trim() : '';
  return value.length ? value : undefined;
}

function parseSearchQuery(raw: string | null): string | undefined {
  const value = raw ? raw.trim() : '';
  return value.length ? value : undefined;
}

function parseCommentIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parsePatchPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const status = parseStatus(typeof (raw as { status?: unknown }).status === 'string'
    ? ((raw as { status?: string }).status)
    : null);

  const commentIds = parseCommentIds((raw as { commentIds?: unknown }).commentIds);
  const reviewedBy = typeof (raw as { reviewedBy?: unknown }).reviewedBy === 'string'
    ? (raw as { reviewedBy: string }).reviewedBy.trim()
    : undefined;
  const actor = typeof (raw as { actor?: unknown }).actor === 'string'
    ? (raw as { actor: string }).actor.trim()
    : undefined;
  const rejectionReason = typeof (raw as { rejectionReason?: unknown }).rejectionReason === 'string'
    ? (raw as { rejectionReason: string }).rejectionReason.trim()
    : undefined;
  const blockReason = typeof (raw as { blockReason?: unknown }).blockReason === 'string'
    ? (raw as { blockReason: string }).blockReason.trim()
    : undefined;
  const requestId = parseRequestId(typeof (raw as { requestId?: unknown }).requestId === 'string'
    ? (raw as { requestId: string }).requestId
    : null);

  return {
    status,
    commentIds,
    reviewedBy: reviewedBy || undefined,
    actor: actor || undefined,
    rejectionReason: rejectionReason || undefined,
    blockReason: blockReason || undefined,
    requestId,
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId } = await params;

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const targetType = parseTargetType(searchParams.get('targetType'));
    const targetId = searchParams.get('targetId') || undefined;
    const requestId = parseRequestId(searchParams.get('requestId'));
    const q = parseSearchQuery(searchParams.get('q'));
    const parentId = searchParams.get('parentId');
    const parentOnly = parseBoolean(searchParams.get('parentOnly'));
    const sort = parseSort(searchParams.get('sort'));
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = listComments(site.id, {
      targetType,
      targetId,
      status,
      requestId,
      q,
      parentOnly,
      parentId: parentId || null,
      sort,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return NextResponse.json({
      siteId: site.id,
      comments: result.comments,
      count: result.count,
      pagination: result.pagination,
    });
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
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const payload = parsePatchPayload(await request.json().catch(() => null));
    if (!payload || !payload.status || payload.commentIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload. status and commentIds are required.' },
        { status: 400 },
      );
    }

    const result = bulkUpdateCommentStatus({
      siteId: site.id,
      commentIds: payload.commentIds,
      status: payload.status,
      reviewedBy: payload.reviewedBy,
      actor: payload.actor,
      rejectionReason: payload.rejectionReason,
      blockReason: payload.blockReason,
      requestId: payload.requestId,
    });

    if (!result.updated.length) {
      return NextResponse.json({ error: 'No comments were updated.' }, { status: 404 });
    }

    return NextResponse.json({
      siteId: site.id,
      updated: result.updated,
      updatedCount: result.updated.length,
      missingIds: result.missingIds,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
