/**
 * Admin reusable sections endpoint.
 *
 * GET  /api/admin/sites/[siteId]/reusable-sections
 * POST /api/admin/sites/[siteId]/reusable-sections
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createReusableSection,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  listReusableSections,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
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

const hasElements = (value: unknown): boolean => (
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Array.isArray((value as { elements?: unknown }).elements) &&
  ((value as { elements: unknown[] }).elements.length > 0)
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const statusParam = searchParams.get('status');
    const status = statusParam === 'active' || statusParam === 'archived' || statusParam === 'all'
      ? statusParam
      : 'active';

    const sections = listReusableSections(site.id, {
      status,
      category: searchParams.get('category') || undefined,
      tag: searchParams.get('tag') || undefined,
      search: searchParams.get('search') || undefined,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sections,
      },
    });
  } catch (error) {
    console.error('Admin reusable sections list API error:', error);
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
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = normalizeSlug(body.slug || name);

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section name is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section slug is required', requestId);
    }

    if (!hasElements(body.content)) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section content must include at least one element', requestId);
    }

    if (getReusableSectionByIdOrSlug(site.id, slug)) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId);
    }

    const section = createReusableSection(site.id, {
      ...body,
      name,
      slug,
    });

    return NextResponse.json(
      { success: true, requestId, data: { section } },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin reusable section create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
