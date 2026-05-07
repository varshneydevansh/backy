/**
 * Admin CMS collection detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/collections/[collectionId]
 * PATCH  /api/admin/sites/[siteId]/collections/[collectionId]
 * DELETE /api/admin/sites/[siteId]/collections/[collectionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollectionField, BackyCollectionPermissions, PublishStatus } from '@backy-cms/core';
import {
  deleteAdminCollection,
  getCollectionByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollection,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
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

const toCollectionFields = (value: unknown): BackyCollectionField[] | undefined => (
  Array.isArray(value) ? value as BackyCollectionField[] : undefined
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      return NextResponse.json({ success: true, requestId, data: { collection } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { collection } });
  } catch (error) {
    console.error('Admin collection detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      const body = await parseJsonBody(request);
      const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection slug is required', requestId);
      }

      if (nextSlug && nextSlug !== collection.slug) {
        const conflict = await repositories.collections.getBySlug(site.id, nextSlug);
        if (conflict && conflict.id !== collection.id) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists', requestId);
        }
      }

      const fields = body.fields === undefined ? undefined : toCollectionFields(body.fields);
      const updated = (await repositories.collections.update(site.id, collection.id, {
        ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}),
        ...(body.description === undefined ? {} : { description: typeof body.description === 'string' ? body.description : null }),
        ...(parseStatus(body.status) ? { status: parseStatus(body.status) } : {}),
        ...(fields === undefined ? {} : { fields }),
        ...(body.permissions === undefined ? {} : { permissions: toCollectionPermissions(body.permissions) }),
        ...(nextSlug ? { slug: nextSlug } : {}),
      })).item;

      return NextResponse.json({ success: true, requestId, data: { collection: updated } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection slug is required', requestId);
    }

    if (nextSlug && nextSlug !== collection.slug) {
      const conflict = getCollectionByIdOrSlug(site.id, nextSlug, { includeUnpublished: true });
      if (conflict && conflict.id !== collection.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists', requestId);
      }
    }

    const updated = updateAdminCollection(site.id, collection.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { collection: updated } });
  } catch (error) {
    console.error('Admin collection update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      const deleted = await repositories.collections.delete(site.id, collection.id);
      if (!deleted) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          collectionId: collection.id,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const deleted = deleteAdminCollection(site.id, collection.id);
    if (!deleted) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        collectionId: collection.id,
      },
    });
  } catch (error) {
    console.error('Admin collection delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
