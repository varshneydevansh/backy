/**
 * Admin blog posts endpoint.
 *
 * GET  /api/admin/sites/[siteId]/blog
 * POST /api/admin/sites/[siteId]/blog
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminBlogPost,
  getBlogPosts,
  getSiteByIdOrSlug,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
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
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const parseStatusFilter = (value: string | null) => {
  if (value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived') {
    return value;
  }

  return undefined;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const status = parseStatusFilter(searchParams.get('status'));
    const payload = getBlogPosts(site.id, {
      includeUnpublished: true,
      status,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        posts: payload.posts,
        pagination: payload.pagination,
      },
    });
  } catch (error) {
    console.error('Admin blog list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const body = await parseJsonBody(request);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const slug = normalizeSlug(body.slug || title);

    if (!title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Post title is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Post slug is required', requestId);
    }

    const conflict = getBlogPosts(site.id, {
      includeUnpublished: true,
      slug,
    }).posts[0];

    if (conflict) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A post with this slug already exists', requestId);
    }

    const post = createAdminBlogPost(site.id, {
      ...body,
      title,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          post,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin blog create API error:', error);
    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Internal server error',
      requestId,
    );
  }
}
