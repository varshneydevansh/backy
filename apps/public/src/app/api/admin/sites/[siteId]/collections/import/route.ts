/**
 * Admin CMS collection backup import endpoint.
 *
 * POST /api/admin/sites/[siteId]/collections/import?upsert=true
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollectionField, BackyCollectionPermissions, BackyJsonObject, BackyJsonValue, PublishStatus } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  createAdminCollection,
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getPageSummary,
  getSiteByIdOrSlug,
  updateAdminCollection,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { parseAdminCollectionFields } from '@/lib/adminCollectionFields';
import { validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  isValidCollectionListRoutePattern,
  isValidCollectionRoutePattern,
  normalizeCollectionListRoutePattern,
  normalizeCollectionRoutePattern,
} from '@/lib/collectionRoutes';
import { findCollectionRouteConflict } from '@/lib/routeConflicts';
import { requireCommerceCollectionSlugAccess } from '@/lib/adminCommerceCollectionAccess';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ImportRecord = {
  slug: string;
  status: PublishStatus;
  values: Record<string, BackyJsonValue>;
  scheduledAt?: string | null;
};

type CollectionSchemaStatus = Exclude<PublishStatus, 'scheduled'>;

type ImportCollection = {
  name: string;
  slug: string;
  description?: string | null;
  status: CollectionSchemaStatus;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  fields: BackyCollectionField[];
  permissions?: Partial<BackyCollectionPermissions>;
  metadata?: BackyJsonObject;
  records: ImportRecord[];
};

type ImportCollectionParseResult =
  | { ok: true; collection: ImportCollection }
  | { ok: false; message: string; details?: Record<string, unknown> };

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: Record<string, unknown>) => (
  NextResponse.json({ success: false, requestId, error: { code, message, ...(details ? { details } : {}) } }, { status })
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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const parseRecordStatus = (value: unknown, fallback: PublishStatus = 'draft'): PublishStatus => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : fallback
);

const parseCollectionStatus = (value: unknown, fallback: CollectionSchemaStatus = 'draft'): CollectionSchemaStatus | null => {
  if (value === undefined) return fallback;
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  return null;
};

const parsePermissions = (value: unknown): Partial<BackyCollectionPermissions> | undefined => (
  isRecord(value) ? value as Partial<BackyCollectionPermissions> : undefined
);

const parseMetadata = (value: unknown): BackyJsonObject | undefined => (
  isRecord(value) ? value as BackyJsonObject : undefined
);

const parseValues = (value: unknown): Record<string, BackyJsonValue> => (
  isRecord(value) ? value as Record<string, BackyJsonValue> : {}
);

const parseRoutePattern = (value: unknown, slug: string): string | null | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isValidCollectionRoutePattern(value)) return null;
  return normalizeCollectionRoutePattern(value, slug);
};

const parseListRoutePattern = (value: unknown, slug: string): string | null | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isValidCollectionListRoutePattern(value)) return null;
  return normalizeCollectionListRoutePattern(value, slug);
};

const collectionsFromBody = (body: Record<string, unknown>): unknown[] => {
  if (Array.isArray(body.collections)) return body.collections;
  const data = isRecord(body.data) ? body.data : {};
  if (Array.isArray(data.collections)) return data.collections;
  if (isRecord(body.collection)) return [body.collection];
  return [];
};

const normalizeImportRecord = (value: unknown): ImportRecord | null => {
  if (!isRecord(value)) return null;
  const slug = normalizeSlug(value.slug);
  if (!slug) return null;

  return {
    slug,
    status: parseRecordStatus(value.status),
    values: parseValues(value.values),
    scheduledAt: typeof value.scheduledAt === 'string' && value.scheduledAt.trim() ? value.scheduledAt.trim() : null,
  };
};

const normalizeImportCollection = (value: unknown, index: number): ImportCollectionParseResult => {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: `Imported collection ${index + 1} must be an object.`,
      details: { index },
    };
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const slug = normalizeSlug(value.slug || name);
  if (!name || !slug) {
    return {
      ok: false,
      message: `Imported collection ${index + 1} requires a name or slug.`,
      details: { index },
    };
  }

  const parsedFields = parseAdminCollectionFields(value.fields);
  if (!parsedFields.ok) {
    return {
      ok: false,
      message: parsedFields.message,
      details: { index, slug },
    };
  }

  const routePattern = parseRoutePattern(value.routePattern, slug);
  const listRoutePattern = parseListRoutePattern(value.listRoutePattern, slug);
  const status = parseCollectionStatus(value.status);
  if (!status) {
    return {
      ok: false,
      message: `Imported collection ${index + 1} status must be draft, published, or archived.`,
      details: { index, slug },
    };
  }
  const records = Array.isArray(value.records)
    ? value.records.map(normalizeImportRecord).filter(Boolean) as ImportRecord[]
    : [];

  return {
    ok: true,
    collection: {
      name,
      slug,
      description: typeof value.description === 'string' ? value.description.trim() || null : null,
      status,
      routePattern,
      listRoutePattern,
      fields: parsedFields.fields || [],
      permissions: parsePermissions(value.permissions),
      metadata: parseMetadata(value.metadata),
      records,
    },
  };
};

const validateImportInput = (collections: ImportCollection[], requestId: string): NextResponse | null => {
  if (collections.length === 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Collection import requires at least one collection.', requestId);
  }

  const duplicateCollection = collections.find((collection, index) => (
    collections.findIndex((candidate) => candidate.slug === collection.slug) !== index
  ));
  if (duplicateCollection) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Collection import contains duplicate collection slugs.', requestId, { slug: duplicateCollection.slug });
  }

  const invalidRoute = collections.find((collection) => collection.routePattern === null || collection.listRoutePattern === null);
  if (invalidRoute) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Collection route patterns are invalid.', requestId, { slug: invalidRoute.slug });
  }

  for (const collection of collections) {
    const duplicateRecord = collection.records.find((record, index) => (
      collection.records.findIndex((candidate) => candidate.slug === record.slug) !== index
    ));
    if (duplicateRecord) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection import contains duplicate record slugs.', requestId, {
        collectionSlug: collection.slug,
        recordSlug: duplicateRecord.slug,
      });
    }
  }

  return null;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'collections.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const upsert = searchParams.get('upsert') === 'true';
    const body = await parseJsonBody(request);
    const collections: ImportCollection[] = [];
    for (const [index, rawCollection] of collectionsFromBody(body).entries()) {
      const parsed = normalizeImportCollection(rawCollection, index);
      if (!parsed.ok) {
        return errorResponse(400, 'VALIDATION_ERROR', parsed.message, requestId, parsed.details);
      }
      collections.push(parsed.collection);
    }
    const invalid = validateImportInput(collections, requestId);
    if (invalid) return invalid;
    const commerceAccess = await requireCommerceCollectionSlugAccess(
      request,
      requestId,
      collections.map((collection) => collection.slug),
      'edit',
    );
    if (commerceAccess) return commerceAccess;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const pages = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        limit: 1000,
        offset: 0,
      });
      const importedCollections = [];
      const importedRecords = [];
      let createdCollections = 0;
      let updatedCollections = 0;
      let createdRecords = 0;
      let updatedRecords = 0;

      for (const collectionInput of collections) {
        const existingCollection = await repositories.collections.getBySlug(site.id, collectionInput.slug);
        if (existingCollection && !upsert) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists.', requestId, { slug: collectionInput.slug });
        }

        const routeConflict = findCollectionRouteConflict({
          id: existingCollection?.id,
          slug: collectionInput.slug,
          name: collectionInput.name,
          routePattern: collectionInput.routePattern,
          listRoutePattern: collectionInput.listRoutePattern,
        }, pages.items);
        if (routeConflict) {
          return errorResponse(409, 'ROUTE_CONFLICT', routeConflict.message, requestId, { slug: collectionInput.slug });
        }

        const collection = existingCollection
          ? (await repositories.collections.update(site.id, existingCollection.id, {
              name: collectionInput.name,
              slug: collectionInput.slug,
              description: collectionInput.description ?? null,
              status: collectionInput.status,
              fields: collectionInput.fields,
              permissions: collectionInput.permissions,
              metadata: collectionInput.metadata,
              routePattern: collectionInput.routePattern,
              listRoutePattern: collectionInput.listRoutePattern,
            })).item
          : (await repositories.collections.create({
              siteId: site.id,
              name: collectionInput.name,
              slug: collectionInput.slug,
              description: collectionInput.description ?? null,
              status: collectionInput.status,
              fields: collectionInput.fields,
              permissions: collectionInput.permissions,
              metadata: collectionInput.metadata,
              routePattern: collectionInput.routePattern,
              listRoutePattern: collectionInput.listRoutePattern,
            })).item;
        importedCollections.push(collection);
        if (existingCollection) updatedCollections += 1;
        else createdCollections += 1;

        for (const recordInput of collectionInput.records) {
          const existingRecord = await repositories.collections.getRecordBySlug(site.id, collection.id, recordInput.slug);
          if (existingRecord && !upsert) {
            return errorResponse(409, 'RECORD_SLUG_CONFLICT', 'A collection record with this slug already exists.', requestId, {
              collectionSlug: collection.slug,
              recordSlug: recordInput.slug,
            });
          }
          const validationErrors = await validateRepositoryCollectionRecordValues({
            repository: repositories.collections,
            siteId: site.id,
            collection,
            values: recordInput.values,
            existingValues: existingRecord?.values,
            excludeRecordId: existingRecord?.id,
          });
          if (validationErrors.length > 0) {
            return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid.', requestId, {
              collectionSlug: collection.slug,
              recordSlug: recordInput.slug,
              issues: validationErrors,
            });
          }

          const record = existingRecord
            ? (await repositories.collections.updateRecord(site.id, collection.id, existingRecord.id, {
                slug: recordInput.slug,
                status: recordInput.status,
                scheduledAt: recordInput.scheduledAt,
                values: recordInput.values,
              })).item
            : (await repositories.collections.createRecord({
                siteId: site.id,
                collectionId: collection.id,
                slug: recordInput.slug,
                status: recordInput.status,
                scheduledAt: recordInput.scheduledAt,
                values: recordInput.values,
              })).item;
          importedRecords.push(record);
          if (existingRecord) updatedRecords += 1;
          else createdRecords += 1;
        }
      }

      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collection',
        reason: 'collections-imported',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collection',
        entityId: importedCollections.length === 1 ? importedCollections[0].id : 'bulk',
        action: 'collection.import',
        after: {
          collections: importedCollections,
          records: importedRecords,
        },
        metadata: {
          upsert,
          createdCollections,
          updatedCollections,
          createdRecords,
          updatedRecords,
          collectionIds: importedCollections.map((collection) => collection.id),
          collectionSlugs: importedCollections.map((collection) => collection.slug),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          import: { createdCollections, updatedCollections, createdRecords, updatedRecords, totalCollections: importedCollections.length, totalRecords: importedRecords.length },
          collections: importedCollections,
          records: importedRecords,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const importedCollections = [];
    const importedRecords = [];
    let createdCollections = 0;
    let updatedCollections = 0;
    let createdRecords = 0;
    let updatedRecords = 0;

    for (const collectionInput of collections) {
      const existingCollection = getCollectionByIdOrSlug(site.id, collectionInput.slug, { includeUnpublished: true });
      if (existingCollection && !upsert) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection with this slug already exists.', requestId, { slug: collectionInput.slug });
      }

      const routeConflict = findCollectionRouteConflict({
        id: existingCollection?.id,
        slug: collectionInput.slug,
        name: collectionInput.name,
        routePattern: collectionInput.routePattern,
        listRoutePattern: collectionInput.listRoutePattern,
      }, getPageSummary(site.id, { includeUnpublished: true }));
      if (routeConflict) {
        return errorResponse(409, 'ROUTE_CONFLICT', routeConflict.message, requestId, { slug: collectionInput.slug });
      }

      const collection = existingCollection
        ? updateAdminCollection(site.id, existingCollection.id, collectionInput as unknown as Record<string, unknown>)
        : createAdminCollection(site.id, collectionInput as unknown as Record<string, unknown>);
      if (!collection) {
        return errorResponse(500, 'IMPORT_FAILED', 'Unable to save imported collection.', requestId, { slug: collectionInput.slug });
      }
      importedCollections.push(collection);
      if (existingCollection) updatedCollections += 1;
      else createdCollections += 1;

      for (const recordInput of collectionInput.records) {
        const existingRecord = getCollectionRecordByIdOrSlug(site.id, collection.id, recordInput.slug, { includeUnpublished: true });
        if (existingRecord && !upsert) {
          return errorResponse(409, 'RECORD_SLUG_CONFLICT', 'A collection record with this slug already exists.', requestId, {
            collectionSlug: collection.slug,
            recordSlug: recordInput.slug,
          });
        }
        const validationErrors = validateCollectionRecordValues(collection, recordInput.values, {
          existingValues: existingRecord?.values,
          excludeRecordId: existingRecord?.id,
        });
        if (validationErrors.length > 0) {
          return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid.', requestId, {
            collectionSlug: collection.slug,
            recordSlug: recordInput.slug,
            issues: validationErrors,
          });
        }

        const record = existingRecord
          ? updateAdminCollectionRecord(site.id, collection.id, existingRecord.id, recordInput as unknown as Record<string, unknown>)
          : createAdminCollectionRecord(site.id, collection.id, recordInput as unknown as Record<string, unknown>);
        if (!record) {
          return errorResponse(500, 'IMPORT_FAILED', 'Unable to save imported collection record.', requestId, {
            collectionSlug: collection.slug,
            recordSlug: recordInput.slug,
          });
        }
        importedRecords.push(record);
        if (existingRecord) updatedRecords += 1;
        else createdRecords += 1;
      }
    }

    await recordAdminAudit({
      siteId: site.id,
      entity: 'collection',
      entityId: importedCollections.length === 1 ? importedCollections[0].id : 'bulk',
      action: 'collection.import',
      after: {
        collections: importedCollections,
        records: importedRecords,
      },
      metadata: {
        upsert,
        createdCollections,
        updatedCollections,
        createdRecords,
        updatedRecords,
        collectionIds: importedCollections.map((collection) => collection.id),
        collectionSlugs: importedCollections.map((collection) => collection.slug),
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        import: { createdCollections, updatedCollections, createdRecords, updatedRecords, totalCollections: importedCollections.length, totalRecords: importedRecords.length },
        collections: importedCollections,
        records: importedRecords,
      },
    });
  } catch (error) {
    console.error('Admin collections backup import API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
