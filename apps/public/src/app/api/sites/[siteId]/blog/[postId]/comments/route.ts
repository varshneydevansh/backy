import { NextRequest, NextResponse } from 'next/server';
import {
  createComment,
  getCommentById,
  getBlogPosts,
  getCommentsByTarget,
  getSiteByIdOrSlug,
  validateAndClassifyComment,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

function parseStatus(raw: string | null) {
  if (!raw) return 'approved';
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
  return 'approved';
}

function parseSort(raw: string | null) {
  return raw === 'oldest' ? 'oldest' : 'newest';
}

function parseModerationMode(raw: unknown): 'manual' | 'auto-approve' {
  return raw === 'auto-approve' ? 'auto-approve' : 'manual';
}

function parseTextInput(raw: unknown) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') {
    return raw;
  }

  if (raw === 'true' || raw === '1') {
    return true;
  }

  if (raw === 'false' || raw === '0') {
    return false;
  }

  return undefined;
}

function parseStartedAt(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function generateRequestId(raw?: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractIpHash(request: NextRequest): string | null {
  const forwardHeader =
    request.headers.get('x-forwarded-for') || request.headers.get('x-vercel-forwarded-for');

  if (!forwardHeader) {
    return null;
  }

  return forwardHeader
    .split(',')
    .map((value) => value.trim())
    .find(Boolean) || null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, postId } = await params;
    const { searchParams } = new URL(request.url);

    const status = parseStatus(searchParams.get('status'));
    const parentOnly = searchParams.get('parentOnly') === 'true';
    const parentId = searchParams.get('parentId');
    const sort = parseSort(searchParams.get('sort'));
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const postResult = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = postResult.posts.some((post) => post.id === postId);
    if (!postExists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const comments = getCommentsByTarget(site.id, {
      targetType: 'post',
      targetId: postId,
      status,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    const filtered = parentOnly
      ? comments.comments.filter((comment) => (parentId ? comment.parentId === parentId : comment.parentId == null))
      : comments.comments;

    const sorted = [...filtered].sort((a, b) =>
      sort === 'oldest'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json({
      comments: sorted,
      count: comments.count,
      pagination: comments.pagination,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, postId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const postResult = getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 });
    const postExists = postResult.posts.some((post) => post.id === postId);
    if (!postExists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const content = parseTextInput(body.content);
    const moderation = parseModerationMode(
      (body as { commentModerationMode?: unknown }).commentModerationMode ??
      (body as { moderationMode?: unknown }).moderationMode ??
      body.mode,
    );
    const allowGuests = parseBoolean((body as { commentAllowGuests?: unknown }).commentAllowGuests);
    const allowReplies = parseBoolean((body as { commentAllowReplies?: unknown }).commentAllowReplies);
    const requireName = parseBoolean((body as { commentRequireName?: unknown }).commentRequireName);
    const requireEmail = parseBoolean((body as { commentRequireEmail?: unknown }).commentRequireEmail);
    const finalAllowGuests = allowGuests !== false;
    const finalAllowReplies = allowReplies !== false;
    const finalRequireName = requireName !== false;
    const finalRequireEmail = requireEmail === true;

    const authorName = parseTextInput(body.authorName);
    const authorEmail = parseTextInput(body.authorEmail);
    const authorWebsite = parseTextInput(body.authorWebsite);
    const parentId = typeof body.parentId === 'string' ? body.parentId : null;
    const requestId = generateRequestId(parseTextInput(body.requestId) || undefined);
    const startedAt = parseStartedAt(body.startedAt);
    const honeypot = parseTextInput(body.honeypot);
    const rateLimitBypass = parseBoolean(body.rateLimitBypass) === true;
    const ipHash = extractIpHash(request);

    if (finalAllowGuests === false && !authorName && !authorEmail) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: {
            authorName: 'A valid identity is required for this comment block',
          },
        },
        { status: 403 },
      );
    }

    if (finalRequireName && authorName.length === 0) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: { authorName: 'Name is required' },
        },
        { status: 422 },
      );
    }

    if (finalRequireEmail && authorEmail.length === 0) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: { authorEmail: 'Email is required' },
        },
        { status: 422 },
      );
    }

    if (parentId && !finalAllowReplies) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: { parentId: 'Replies are not enabled for this comment block' },
        },
        { status: 422 },
      );
    }

    if (parentId) {
      const parent = getCommentById(parentId);
      if (!parent || parent.siteId !== site.id || parent.targetType !== 'post' || parent.targetId !== postId) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            details: { parentId: 'The selected parent comment does not belong to this target.' },
          },
          { status: 422 },
        );
      }
    }

    const classification = validateAndClassifyComment({
      siteId: site.id,
      targetType: 'post',
      targetId: postId,
      content,
      authorEmail,
      moderationMode: moderation,
      honeypot,
      ipHash,
      requestId,
      startedAt,
      rateLimitBypass,
    });

    if (!classification.ok) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: { content: classification.spamMessage || 'Comment rejected.' },
          status: classification.status,
          spamFlags: classification.spamFlags,
        },
        { status: 422 },
      );
    }

    const comment = createComment({
      siteId: site.id,
      targetType: 'post',
      targetId: postId,
      content,
      authorName,
      authorEmail,
      authorWebsite,
      parentId,
      requestId,
      ipHash,
      status: classification.status,
    });

    return NextResponse.json(
      {
        success: true,
        comment,
        message:
          comment.status === 'approved'
            ? 'Comment submitted and published.'
            : 'Comment submitted for moderation.',
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
