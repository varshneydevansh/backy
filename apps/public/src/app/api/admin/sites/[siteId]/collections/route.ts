/**
 * Admin CMS collections endpoint.
 *
 * GET  /api/admin/sites/[siteId]/collections
 * POST /api/admin/sites/[siteId]/collections
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollectionPermissions, BackyJsonObject, PublishStatus } from '@backy-cms/core';
import {
  createAdminCollection,
  getCollectionByIdOrSlug,
  getPageSummary,
  getSiteByIdOrSlug,
  listCollections,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionSlugAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  isValidCollectionListRoutePattern,
  isValidCollectionRoutePattern,
  normalizeCollectionListRoutePattern,
  normalizeCollectionRoutePattern,
} from '@/lib/collectionRoutes';
import { seedCollectionInputFromFrontendDesignTemplate } from '@/lib/frontendDesignContract';
import { findCollectionRouteConflict } from '@/lib/routeConflicts';
import { parseAdminCollectionFields } from '@/lib/adminCollectionFields';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

interface CollectionAuditSource {
  id: string;
  name: string;
  slug: string;
  status: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  fields?: unknown[];
  permissions?: Partial<BackyCollectionPermissions> | null;
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

const toCollectionPermissions = (value: unknown): Partial<BackyCollectionPermissions> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<BackyCollectionPermissions>
    : undefined
);

const toCollectionMetadata = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as BackyJsonObject
    : undefined
);

const parseStatus = (value: unknown): PublishStatus | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
);

const parseBoundedInteger = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

const parseRoutePattern = (value: unknown, slug: string): string | undefined | null => {
  if (value === undefined) {
    return undefined;
  }

  if (!isValidCollectionRoutePattern(value)) {
    return null;
  }

  return normalizeCollectionRoutePattern(value, slug);
};

const parseListRoutePattern = (value: unknown, slug: string): string | undefined | null => {
  if (value === undefined) {
    return undefined;
  }

  if (!isValidCollectionListRoutePattern(value)) {
    return null;
  }

  return normalizeCollectionListRoutePattern(value, slug);
};

const collectionAuditMetadata = (collection: CollectionAuditSource): BackyJsonObject => ({
  collectionId: collection.id,
  name: collection.name,
  slug: collection.slug,
  status: collection.status,
  routePattern: collection.routePattern || null,
  listRoutePattern: collection.listRoutePattern || null,
  fieldCount: Array.isArray(collection.fields) ? collection.fields.length : 0,
  publicRead: collection.permissions?.publicRead === true,
  publicCreate: collection.permissions?.publicCreate === true,
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'collections.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const limit = parseBoundedInteger(request.nextUrl.searchParams.get('limit'), 100, 1, 200);
    const offset = parseBoundedInteger(request.nextUrl.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

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
        limit,
        offset,
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

    const collections = listCollections(site.id, { includeUnpublished: true });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collections: collections.slice(offset, offset + limit),
        pagination: {
          total: collections.length,
          limit,
          offset,
          hasMore: offset + limit < collections.length,
        },
      },
    });
  } catch (error) {
    console.error('Admin collections list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'collections.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const rawBody = await parseJsonBody(request);
      const seeded = seedCollectionInputFromFrontendDesignTemplate({ siteSettings: site.settings, body: rawBody });
      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }
      const body = seeded.body;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const slug = normalizeSlug(body.slug || name);

      if (!name) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection name is required', requestId);
      }

      if (!slug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection slug is required', requestId);
      }

      const commerceAccess = requireCommerceCollectionSlugAccess(request, requestId, [slug], 'configure');
      if (commerceAccess) {
        return commerceAccess;
      }

      if (await repositories.collections.getBySlug(site.id, slug)) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists', requestId);
      }

      const routePattern = parseRoutePattern(body.routePattern, slug);
      if (body.routePattern !== undefined && routePattern === null) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection route pattern must include :recordSlug', requestId);
      }
      const listRoutePattern = parseListRoutePattern(body.listRoutePattern, slug);
      if (body.listRoutePattern !== undefined && listRoutePattern === null) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection list route pattern cannot include :recordSlug', requestId);
      }
      const parsedFields = parseAdminCollectionFields(body.fields);
      if (!parsedFields.ok) {
        return errorResponse(400, 'VALIDATION_ERROR', parsedFields.message, requestId);
      }

      const pages = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        limit: 100,
        offset: 0,
      });
      const routeConflict = findCollectionRouteConflict({
        slug,
        name,
        routePattern,
        listRoutePattern,
      }, pages.items);
      if (routeConflict) {
        return errorResponse(409, 'ROUTE_CONFLICT', routeConflict.message, requestId);
      }

      const collection = (await repositories.collections.create({
        siteId: site.id,
        name,
        slug,
        routePattern,
        listRoutePattern,
        description: typeof body.description === 'string' ? body.description : null,
        status: parseStatus(body.status) || 'draft',
        fields: parsedFields.fields || [],
        permissions: toCollectionPermissions(body.permissions),
        metadata: toCollectionMetadata(body.metadata),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collection',
        entityId: collection.id,
        reason: 'collection-created',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collection',
        entityId: collection.id,
        action: 'create',
        after: collectionAuditMetadata(collection),
        metadata: collectionAuditMetadata(collection),
        requestId,
      });

      return NextResponse.json(
        { success: true, requestId, data: { collection, cacheInvalidation } },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const rawBody = await parseJsonBody(request);
    const seeded = seedCollectionInputFromFrontendDesignTemplate({ siteSettings: site.settings, body: rawBody });
    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }
    const body = seeded.body;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = normalizeSlug(body.slug || name);

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection name is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection slug is required', requestId);
    }

    const commerceAccess = requireCommerceCollectionSlugAccess(request, requestId, [slug], 'configure');
    if (commerceAccess) {
      return commerceAccess;
    }

    if (getCollectionByIdOrSlug(site.id, slug, { includeUnpublished: true })) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists', requestId);
    }

    const routePattern = parseRoutePattern(body.routePattern, slug);
    if (body.routePattern !== undefined && routePattern === null) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection route pattern must include :recordSlug', requestId);
    }
    const listRoutePattern = parseListRoutePattern(body.listRoutePattern, slug);
    if (body.listRoutePattern !== undefined && listRoutePattern === null) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection list route pattern cannot include :recordSlug', requestId);
    }
    const parsedFields = parseAdminCollectionFields(body.fields);
    if (!parsedFields.ok) {
      return errorResponse(400, 'VALIDATION_ERROR', parsedFields.message, requestId);
    }

    const routeConflict = findCollectionRouteConflict({
      slug,
      name,
      routePattern,
      listRoutePattern,
    }, getPageSummary(site.id, { includeUnpublished: true }));
    if (routeConflict) {
      return errorResponse(409, 'ROUTE_CONFLICT', routeConflict.message, requestId);
    }

    const collection = createAdminCollection(site.id, {
      ...body,
      name,
      slug,
      fields: parsedFields.fields || [],
      ...(routePattern === undefined ? {} : { routePattern }),
      ...(listRoutePattern === undefined ? {} : { listRoutePattern }),
    });
    await recordAdminAudit({
      siteId: site.id,
      entity: 'collection',
      entityId: collection.id,
      action: 'create',
      after: collectionAuditMetadata(collection),
      metadata: collectionAuditMetadata(collection),
      requestId,
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
