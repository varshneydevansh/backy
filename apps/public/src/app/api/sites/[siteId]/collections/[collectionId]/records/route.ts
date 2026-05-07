/**
 * Public CMS collection records endpoint.
 *
 * GET /api/sites/[siteId]/collections/[collectionId]/records
 * GET /api/sites/[siteId]/collections/[collectionId]/records?slug=example
 * GET /api/sites/[siteId]/collections/[collectionId]/records?q=term&fieldKey=title&fieldValue=example&sortBy=title
 * POST /api/sites/[siteId]/collections/[collectionId]/records
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonValue } from '@backy-cms/core';
import {
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId } = await params;
    const { searchParams } = new URL(request.url);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection || collection.status !== 'published' || !collection.permissions.publicRead) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
      const offset = Math.max(0, Number(searchParams.get('offset') || 0));
      const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc';
      const slug = searchParams.get('slug');
      const payload = slug
        ? {
            items: [
              await repositories.collections.getRecordBySlug(site.id, collection.id, slug),
            ].filter(Boolean),
            pagination: {
              total: 1,
              limit: 1,
              offset: 0,
              hasMore: false,
            },
          }
        : await repositories.collections.listRecords({
            siteId: site.id,
            collectionId: collection.id,
            includeUnpublished: false,
            status: 'published',
            search: searchParams.get('q') || searchParams.get('search') || undefined,
            fieldKey: searchParams.get('fieldKey') || undefined,
            fieldValue: searchParams.get('fieldValue') || undefined,
            sortBy: searchParams.get('sortBy') || undefined,
            sortDirection,
            limit,
            offset,
          });
      const records = payload.items.filter((record) => record?.status === 'published');

      if (slug && records.length === 0) {
        return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          collection,
          records,
          pagination: {
            ...payload.pagination,
            total: records.length,
            hasMore: false,
          },
        },
        collection,
        records,
        pagination: {
          ...payload.pagination,
          total: records.length,
          hasMore: false,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId);
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc';
    const payload = listCollectionRecords(site.id, collection.id, {
      slug: searchParams.get('slug') || undefined,
      search: searchParams.get('q') || searchParams.get('search') || undefined,
      fieldKey: searchParams.get('fieldKey') || undefined,
      fieldValue: searchParams.get('fieldValue') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection,
      limit,
      offset,
    });

    if (searchParams.get('slug') && payload.records.length === 0) {
      return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collection,
        records: payload.records,
        pagination: payload.pagination,
      },
      collection,
      records: payload.records,
      pagination: payload.pagination,
    });
  } catch (error) {
    console.error('Public collection records API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection || collection.status !== 'published') {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }

      if (!collection.permissions.publicCreate) {
        return errorResponse(403, 'PUBLIC_CREATE_DISABLED', 'This collection does not allow public record creation', requestId);
      }

      const body = await parseJsonBody(request);
      const values = toRecord(body.values || body.fields);
      const slug = normalizeSlug(body.slug || values.slug || values.title || values.name || `submission-${Date.now()}`);

      if (!slug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Record slug is required', requestId);
      }

      if (await repositories.collections.getRecordBySlug(site.id, collection.id, slug)) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection record with this slug already exists', requestId);
      }

      const validationErrors = validateCollectionRecordValues(collection as unknown as StoreCollection, values);
      if (validationErrors.length > 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
      }

      const record = (await repositories.collections.createRecord({
        siteId: site.id,
        collectionId: collection.id,
        slug,
        status: 'draft',
        values: toJsonRecord(values),
      })).item;

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: { record },
          record,
        },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection || collection.status !== 'published') {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    if (!collection.permissions.publicCreate) {
      return errorResponse(403, 'PUBLIC_CREATE_DISABLED', 'This collection does not allow public record creation', requestId);
    }

    const body = await parseJsonBody(request);
    const values = toRecord(body.values || body.fields);
    const slug = normalizeSlug(body.slug || values.slug || values.title || values.name || `submission-${Date.now()}`);

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Record slug is required', requestId);
    }

    if (getCollectionRecordByIdOrSlug(site.id, collection.id, slug, { includeUnpublished: true })) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A collection record with this slug already exists', requestId);
    }

    const validationErrors = validateCollectionRecordValues(collection, values);
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
    }

    const record = createAdminCollectionRecord(site.id, collection.id, {
      slug,
      status: 'draft',
      values,
    });

    if (!record) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: { record },
        record,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Public collection record create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
