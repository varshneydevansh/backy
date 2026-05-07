/**
 * Public CMS collection records endpoint.
 *
 * GET /api/sites/[siteId]/collections/[collectionId]/records
 * GET /api/sites/[siteId]/collections/[collectionId]/records?slug=example
 * GET /api/sites/[siteId]/collections/[collectionId]/records?q=term&fieldKey=title&fieldValue=example&sortBy=title
 * POST /api/sites/[siteId]/collections/[collectionId]/records
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
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
      return NextResponse.json({ error: 'Collection record not found' }, { status: 404 });
    }

    return NextResponse.json({
      collection,
      records: payload.records,
      pagination: payload.pagination,
    });
  } catch (error) {
    console.error('Public collection records API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
