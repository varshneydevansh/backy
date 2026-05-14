/**
 * Admin CMS collection records endpoint.
 *
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records?q=term&fieldKey=title&fieldValue=example&sortBy=title
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records?format=csv
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollection, BackyCollectionRecord, BackyJsonObject, BackyJsonValue, PublishStatus } from '@backy-cms/core';
import {
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { seedCollectionRecordInputFromFrontendDesignTemplate } from '@/lib/frontendDesignContract';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
  }>;
}

interface CollectionAuditSource {
  id: string;
  name: string;
  slug: string;
}

interface CollectionRecordAuditSource {
  id: string;
  collectionId: string;
  slug: string;
  status: string;
  values?: Record<string, unknown> | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
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

const parseStatusFilter = (value: string | null) => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
);

const parseStatus = (value: unknown): PublishStatus | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
);

const collectionRecordAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
): BackyJsonObject => {
  const valueKeys = Object.keys(toRecord(record.values)).sort();
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    collectionSlug: collection.slug,
    recordId: record.id,
    slug: record.slug,
    status: record.status,
    valueKeys,
    valueCount: valueKeys.length,
    scheduledAt: record.scheduledAt || null,
    publishedAt: record.publishedAt || null,
  };
};

const toCsvCell = (value: unknown): string => {
  let text = '';

  if (value === null || value === undefined) {
    text = '';
  } else if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = '';
    }
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildRecordsCsv = (
  collection: BackyCollection | NonNullable<ReturnType<typeof getCollectionByIdOrSlug>>,
  records: BackyCollectionRecord[] | ReturnType<typeof listCollectionRecords>['records'],
) => {
  const fields = [...collection.fields].sort((left, right) => (
    ((left as { sortOrder?: number }).sortOrder || 0) - ((right as { sortOrder?: number }).sortOrder || 0)
  ));
  const headers = [
    'id',
    'slug',
    'status',
    'createdAt',
    'updatedAt',
    'publishedAt',
    'scheduledAt',
    ...fields.map((field) => field.key),
  ];
  const rows = records.map((record) => [
    record.id,
    record.slug,
    record.status,
    record.createdAt,
    record.updatedAt,
    record.publishedAt,
    record.scheduledAt,
    ...fields.map((field) => record.values[field.key]),
  ]);

  return [
    headers.map(toCsvCell).join(','),
    ...rows.map((row) => row.map(toCsvCell).join(',')),
  ].join('\n');
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { searchParams } = new URL(request.url);
  const csvRequested = searchParams.get('format') === 'csv' || searchParams.get('export') === 'csv';
  const access = requireAdminAccess(request, requestId, { permission: csvRequested ? 'collections.export' : 'collections.view' });
  if (access instanceof NextResponse) {
    return access;
  }

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
      const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
      if (commerceAccess) {
        return commerceAccess;
      }

      const csvRequested = searchParams.get('format') === 'csv' || searchParams.get('export') === 'csv';
      const defaultLimit = csvRequested ? 1000 : 50;
      const maxLimit = csvRequested ? 1000 : 100;
      const limit = Math.max(1, Math.min(maxLimit, Number(searchParams.get('limit') || defaultLimit)));
      const offset = Math.max(0, Number(searchParams.get('offset') || 0));
      const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc';
      const slug = searchParams.get('slug');
      const payload = slug
        ? {
            items: [
              await repositories.collections.getRecordBySlug(site.id, collection.id, slug),
            ].filter(Boolean) as BackyCollectionRecord[],
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
            includeUnpublished: true,
            status: parseStatusFilter(searchParams.get('status')),
            search: searchParams.get('q') || searchParams.get('search') || undefined,
            fieldKey: searchParams.get('fieldKey') || undefined,
            fieldValue: searchParams.get('fieldValue') || undefined,
            sortBy: searchParams.get('sortBy') || undefined,
            sortDirection,
            limit,
            offset,
          });

      if (slug && payload.items.length === 0) {
        return errorResponse(404, 'COLLECTION_RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      if (csvRequested) {
        const csv = buildRecordsCsv(collection, payload.items);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="${collection.slug}-records.csv"`,
            'x-request-id': requestId,
          },
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          collection,
          records: payload.items,
          pagination: payload.pagination,
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
    const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) {
      return commerceAccess;
    }

    const csvRequested = searchParams.get('format') === 'csv' || searchParams.get('export') === 'csv';
    const defaultLimit = csvRequested ? 1000 : 50;
    const maxLimit = csvRequested ? 1000 : 100;
    const limit = Math.max(1, Math.min(maxLimit, Number(searchParams.get('limit') || defaultLimit)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc';
    const payload = listCollectionRecords(site.id, collection.id, {
      includeUnpublished: true,
      status: parseStatusFilter(searchParams.get('status')),
      slug: searchParams.get('slug') || undefined,
      search: searchParams.get('q') || searchParams.get('search') || undefined,
      fieldKey: searchParams.get('fieldKey') || undefined,
      fieldValue: searchParams.get('fieldValue') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection,
      limit,
      offset,
    });

    if (csvRequested) {
      const csv = buildRecordsCsv(collection, payload.records);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${collection.slug}-records.csv"`,
          'x-request-id': requestId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collection,
        records: payload.records,
        pagination: payload.pagination,
      },
    });
  } catch (error) {
    console.error('Admin collection records list API error:', error);
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
      const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
      if (commerceAccess) {
        return commerceAccess;
      }

      const rawBody = await parseJsonBody(request);
      const seeded = seedCollectionRecordInputFromFrontendDesignTemplate({
        siteSettings: site.settings,
        body: rawBody,
        templateType: collection.slug === 'products' ? 'product' : 'collection',
      });
      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }
      const body = seeded.body;
      const values = toRecord(body.values);
      const slug = normalizeSlug(body.slug || values.slug || values.title || values.name || 'record');

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
        status: parseStatus(body.status) || 'draft',
        ...(typeof body.scheduledAt === 'string' ? { scheduledAt: body.scheduledAt } : {}),
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: record.id,
        reason: 'collection-record-created',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collectionRecord',
        entityId: record.id,
        action: 'create',
        after: collectionRecordAuditMetadata(collection, record),
        metadata: collectionRecordAuditMetadata(collection, record),
        requestId,
      });

      return NextResponse.json(
        { success: true, requestId, data: { record, cacheInvalidation } },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }
    const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) {
      return commerceAccess;
    }

    const rawBody = await parseJsonBody(request);
    const seeded = seedCollectionRecordInputFromFrontendDesignTemplate({
      siteSettings: site.settings,
      body: rawBody,
      templateType: collection.slug === 'products' ? 'product' : 'collection',
    });
    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }
    const body = seeded.body;
    const values = toRecord(body.values);
    const slug = normalizeSlug(body.slug || values.slug || values.title || values.name || 'record');

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
      ...body,
      slug,
      values,
    });

    if (!record) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: record.id,
      action: 'create',
      after: collectionRecordAuditMetadata(collection, record),
      metadata: collectionRecordAuditMetadata(collection, record),
      requestId,
    });

    return NextResponse.json(
      { success: true, requestId, data: { record } },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin collection record create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
