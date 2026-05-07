/**
 * Admin CMS collection record CSV import endpoint.
 *
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records/import
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records/import?upsert=true
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
  }>;
}

interface ImportError {
  row: number;
  slug?: string;
  message: string;
  details?: unknown;
}

const RESERVED_COLUMNS = new Set([
  'id',
  'slug',
  'status',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'scheduledAt',
]);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
);

const normalizeSlug = (value: unknown, fallback: string): string => {
  const raw = typeof value === 'string' ? value : String(value || '');
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const parseCsvRows = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => item.trim().length > 0));
};

const parseImportedValue = (
  field: NonNullable<ReturnType<typeof getCollectionByIdOrSlug>>['fields'][number] | undefined,
  value: string,
): unknown => {
  if (!field || field.type !== 'json') {
    return value;
  }

  if (!value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const upsert = searchParams.get('upsert') === 'true';
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }

    const csv = await request.text();
    const rows = parseCsvRows(csv);

    if (rows.length < 2) {
      return errorResponse(400, 'VALIDATION_ERROR', 'CSV import requires a header row and at least one record row', requestId);
    }

    const headers = rows[0].map((header) => header.trim()).filter(Boolean);
    if (headers.length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'CSV import requires at least one column header', requestId);
    }

    const fieldsByKey = new Map(collection.fields.map((field) => [field.key, field]));
    const records = [];
    const errors: ImportError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [rowIndex, cells] of rows.slice(1).entries()) {
      const rowNumber = rowIndex + 2;
      const rowData = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
      const values = Object.fromEntries(
        headers
          .filter((header) => !RESERVED_COLUMNS.has(header))
          .map((header) => [header, parseImportedValue(fieldsByKey.get(header), rowData[header] ?? '')]),
      );
      const slug = normalizeSlug(rowData.slug || values.title || values.name || `record-${rowNumber}`, `record-${rowNumber}`);
      const existing = getCollectionRecordByIdOrSlug(site.id, collection.id, slug, { includeUnpublished: true });

      if (existing && !upsert) {
        skipped += 1;
        errors.push({ row: rowNumber, slug, message: 'A record with this slug already exists.' });
        continue;
      }

      const validationErrors = validateCollectionRecordValues(collection, values, {
        existingValues: existing?.values,
        excludeRecordId: existing?.id,
      });

      if (validationErrors.length > 0) {
        skipped += 1;
        errors.push({
          row: rowNumber,
          slug,
          message: 'Collection record values are invalid.',
          details: validationErrors,
        });
        continue;
      }

      const input = {
        slug,
        status: rowData.status || 'draft',
        scheduledAt: rowData.scheduledAt || null,
        values,
      };
      const saved = existing
        ? updateAdminCollectionRecord(site.id, collection.id, existing.id, input)
        : createAdminCollectionRecord(site.id, collection.id, input);

      if (!saved) {
        skipped += 1;
        errors.push({ row: rowNumber, slug, message: 'Unable to save imported record.' });
        continue;
      }

      records.push(saved);
      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        collection,
        records,
        import: {
          created,
          updated,
          skipped,
          errors,
        },
      },
    });
  } catch (error) {
    console.error('Admin collection record import API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
