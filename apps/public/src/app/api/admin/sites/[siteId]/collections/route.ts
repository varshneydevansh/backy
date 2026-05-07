/**
 * Admin CMS collections endpoint.
 *
 * GET  /api/admin/sites/[siteId]/collections
 * POST /api/admin/sites/[siteId]/collections
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollectionField, BackyCollectionPermissions, PublishStatus } from '@backy-cms/core';
import {
  createAdminCollection,
  getCollectionByIdOrSlug,
  getSiteByIdOrSlug,
  listCollections,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { isValidCollectionRoutePattern, normalizeCollectionRoutePattern } from '@/lib/collectionRoutes';

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

const toCollectionFields = (value: unknown): BackyCollectionField[] => (
  Array.isArray(value) ? value as BackyCollectionField[] : []
);

const toCollectionPermissions = (value: unknown): Partial<BackyCollectionPermissions> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<BackyCollectionPermissions>
    : undefined
);

const parseStatus = (value: unknown): PublishStatus | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
);

const parseRoutePattern = (value: unknown, slug: string): string | undefined | null => {
  if (value === undefined) {
    return undefined;
  }

  if (!isValidCollectionRoutePattern(value)) {
    return null;
  }

  return normalizeCollectionRoutePattern(value, slug);
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const payload = await repositories.collections.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          collections: payload.items,
          pagination: payload.pagination,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collections: listCollections(site.id, { includeUnpublished: true }),
      },
    });
  } catch (error) {
    console.error('Admin collections list API error:', error);
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection name is required', requestId);
      }

      if (!slug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection slug is required', requestId);
      }

      if (await repositories.collections.getBySlug(site.id, slug)) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists', requestId);
      }

      const routePattern = parseRoutePattern(body.routePattern, slug);
      if (body.routePattern !== undefined && routePattern === null) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection route pattern must include :recordSlug', requestId);
      }

      const collection = (await repositories.collections.create({
        siteId: site.id,
        name,
        slug,
        routePattern,
        description: typeof body.description === 'string' ? body.description : null,
        status: parseStatus(body.status) || 'draft',
        fields: toCollectionFields(body.fields),
        permissions: toCollectionPermissions(body.permissions),
      })).item;

      return NextResponse.json(
        { success: true, requestId, data: { collection } },
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
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection name is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection slug is required', requestId);
    }

    if (getCollectionByIdOrSlug(site.id, slug, { includeUnpublished: true })) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists', requestId);
    }

    const routePattern = parseRoutePattern(body.routePattern, slug);
    if (body.routePattern !== undefined && routePattern === null) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection route pattern must include :recordSlug', requestId);
    }

    const collection = createAdminCollection(site.id, {
      ...body,
      name,
      slug,
      ...(routePattern === undefined ? {} : { routePattern }),
    });

    return NextResponse.json(
      { success: true, requestId, data: { collection } },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin collection create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
