/**
 * Admin CMS collection records endpoint.
 *
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records?q=term&fieldKey=title&fieldValue=example&sortBy=title
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records?format=csv
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
  validateCollectionRecordValues,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

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
  collection: NonNullable<ReturnType<typeof getCollectionByIdOrSlug>>,
  records: ReturnType<typeof listCollectionRecords>['records'],
) => {
  const fields = [...collection.fields].sort((left, right) => left.sortOrder - right.sortOrder);
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

  try {
    const { siteId, collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
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

  try {
    const { siteId, collectionId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const body = await parseJsonBody(request);
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

    return NextResponse.json(
      { success: true, requestId, data: { record } },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin collection record create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
