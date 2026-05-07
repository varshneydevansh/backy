/**
 * Admin CMS collection record detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * PATCH  /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * DELETE /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonValue, PublishStatus } from '@backy-cms/core';
import {
  deleteAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
    recordId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
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

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const parseStatus = (value: unknown): PublishStatus | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId, recordId } = await params;
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

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      return NextResponse.json({ success: true, requestId, data: { collection, record } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { collection, record } });
  } catch (error) {
    console.error('Admin collection record detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId, recordId } = await params;
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

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      const body = await parseJsonBody(request);
      const values = body.values === undefined ? record.values : toRecord(body.values);
      const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Record slug is required', requestId);
      }

      if (nextSlug && nextSlug !== record.slug) {
        const conflict = await repositories.collections.getRecordBySlug(site.id, collection.id, nextSlug);
        if (conflict && conflict.id !== record.id) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A collection record with this slug already exists', requestId);
        }
      }

      const validationErrors = validateCollectionRecordValues(collection as unknown as StoreCollection, values, {
        existingValues: record.values,
        excludeRecordId: record.id,
      });
      if (validationErrors.length > 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        ...(body.values === undefined ? {} : { values: toJsonRecord(values) }),
        ...(parseStatus(body.status) ? { status: parseStatus(body.status) } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
      })).item;

      return NextResponse.json({ success: true, requestId, data: { record: updated } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    const body = await parseJsonBody(request);
    const values = body.values === undefined ? {} : toRecord(body.values);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Record slug is required', requestId);
    }

    if (nextSlug && nextSlug !== record.slug) {
      const conflict = getCollectionRecordByIdOrSlug(site.id, collection.id, nextSlug, { includeUnpublished: true });
      if (conflict && conflict.id !== record.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection record with this slug already exists', requestId);
      }
    }

    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
    }

    const updated = updateAdminCollectionRecord(site.id, collection.id, record.id, {
      ...body,
      ...(body.values === undefined ? {} : { values }),
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { record: updated } });
  } catch (error) {
    console.error('Admin collection record update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId, recordId } = await params;
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

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      const deleted = await repositories.collections.deleteRecord(site.id, collection.id, record.id);
      if (!deleted) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          recordId: record.id,
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

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    const deleted = deleteAdminCollectionRecord(site.id, collection.id, record.id);
    if (!deleted) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        recordId: record.id,
      },
    });
  } catch (error) {
    console.error('Admin collection record delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
