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
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import type { BackyJsonObject } from '@backy-cms/core';

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

const parseContent = (value: unknown): BackyJsonObject => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : {}
);

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((tag) => typeof tag === 'string' ? tag.trim() : '').filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
  }
  return [];
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const statusParam = searchParams.get('status');
      const status = statusParam === 'active' || statusParam === 'archived' || statusParam === 'all'
        ? statusParam
        : 'active';
      const result = await repositories.reusableSections.list({
        siteId: site.id,
        status,
        category: searchParams.get('category') || undefined,
        tag: searchParams.get('tag') || undefined,
        search: searchParams.get('search') || undefined,
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sections: result.items,
          pagination: result.pagination,
        },
      });
    }

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

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
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

      if (await repositories.reusableSections.getBySlug(site.id, slug)) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section with this slug already exists', requestId);
      }

      const section = (await repositories.reusableSections.create({
        siteId: site.id,
        name,
        slug,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'general',
        status: body.status === 'archived' ? 'archived' : 'active',
        tags: parseTags(body.tags),
        content: parseContent(body.content),
        sourceElementId: typeof body.sourceElementId === 'string' ? body.sourceElementId.trim() || null : null,
        createdBy: typeof body.createdBy === 'string' ? body.createdBy.trim() || 'admin' : 'admin',
        updatedBy: typeof body.updatedBy === 'string' ? body.updatedBy.trim() || 'admin' : 'admin',
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'reusableSection',
        entityId: section.id,
        reason: 'reusable-section-created',
        requestId,
      });

      return NextResponse.json(
        { success: true, requestId, data: { section, cacheInvalidation } },
        { status: 201 },
      );
    }

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
