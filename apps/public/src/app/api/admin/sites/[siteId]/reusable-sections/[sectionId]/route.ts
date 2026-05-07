/**
 * Admin reusable section detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/reusable-sections/[sectionId]
 * PATCH  /api/admin/sites/[siteId]/reusable-sections/[sectionId]
 * DELETE /api/admin/sites/[siteId]/reusable-sections/[sectionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteReusableSection,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  updateReusableSection,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
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
    const { siteId, sectionId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { section } });
  } catch (error) {
    console.error('Admin reusable section detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, sectionId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section slug is required', requestId);
    }

    if (body.content !== undefined && !hasElements(body.content)) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Reusable section content must include at least one element', requestId);
    }

    if (nextSlug && nextSlug !== section.slug) {
      const conflict = getReusableSectionByIdOrSlug(site.id, nextSlug);
      if (conflict && conflict.id !== section.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId);
      }
    }

    const updated = updateReusableSection(site.id, section.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { section: updated } });
  } catch (error) {
    console.error('Admin reusable section update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, sectionId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    const deleted = deleteReusableSection(site.id, section.id);
    if (!deleted) {
      return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        sectionId: section.id,
      },
    });
  } catch (error) {
    console.error('Admin reusable section delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
