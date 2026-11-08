import { collectionRecordValidationIssuesFromError } from "@/lib/collectionRecordValidation";
/**
 * Admin CMS collection backup import endpoint.
 *
 * POST /api/admin/sites/[siteId]/collections/import?upsert=true
 */

import { BackyCollectionImportConflictError } from "@backy-cms/core";
import { prepareCollectionImport, CollectionImportValidationError } from "@/lib/collectionImportPreparation";
import { NextRequest, NextResponse } from "next/server";
import type {
  BackyCollectionField,
  BackyCollectionPermissions,
  BackyJsonObject,
  BackyJsonValue,
  PublishStatus,
  Site,
} from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  applyAdminCollectionImport,
  listCollectionRecords,
  getMediaById,
  getCollectionByIdOrSlug,
  getPageSummary,
  getSiteByIdOrSlug,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import { parseAdminCollectionFields } from "@/lib/adminCollectionFields";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { editorMediaMutationErrorResponse } from "@/lib/editorMediaMutationError";
import {
  isValidCollectionListRoutePattern,
  isValidCollectionRoutePattern,
  normalizeCollectionListRoutePattern,
  normalizeCollectionRoutePattern,
} from "@/lib/collectionRoutes";
import { collectCollectionRoutePages, CollectionInventoryIncompleteError } from "@/lib/collectionInventory";
import { requireCommerceCollectionSlugAccess } from "@/lib/adminCommerceCollectionAccess";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

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

type CollectionSchemaStatus = Exclude<PublishStatus, "scheduled">;

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

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
) =>
  NextResponse.json(
    {
      success: false,
      requestId,
      error: { code, message, ...(details ? { details } : {}) },
    },
    { status },
  );

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeSlug = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";

const parseRecordStatus = (
  value: unknown,
  fallback: PublishStatus = "draft",
): PublishStatus =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived"
    ? value
    : fallback;

const parseCollectionStatus = (
  value: unknown,
  fallback: CollectionSchemaStatus = "draft",
): CollectionSchemaStatus | null => {
  if (value === undefined) return fallback;
  if (value === "draft" || value === "published" || value === "archived")
    return value;
  return null;
};

const parsePermissions = (
  value: unknown,
): Partial<BackyCollectionPermissions> | undefined =>
  isRecord(value) ? (value as Partial<BackyCollectionPermissions>) : undefined;

const parseMetadata = (value: unknown): BackyJsonObject | undefined =>
  isRecord(value) ? (value as BackyJsonObject) : undefined;

const parseValues = (value: unknown): Record<string, BackyJsonValue> =>
  isRecord(value) ? (value as Record<string, BackyJsonValue>) : {};

const parseRoutePattern = (
  value: unknown,
  slug: string,
): string | null | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isValidCollectionRoutePattern(value)) return null;
  return normalizeCollectionRoutePattern(value, slug);
};

const parseListRoutePattern = (
  value: unknown,
  slug: string,
): string | null | undefined => {
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
    scheduledAt:
      typeof value.scheduledAt === "string" && value.scheduledAt.trim()
        ? value.scheduledAt.trim()
        : null,
  };
};

const normalizeImportCollection = (
  value: unknown,
  index: number,
): ImportCollectionParseResult => {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: `Imported collection ${index + 1} must be an object.`,
      details: { index },
    };
  }
  const name = typeof value.name === "string" ? value.name.trim() : "";
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
  if (value.records !== undefined && !Array.isArray(value.records)) return { ok: false, message: `Imported collection ${index + 1} records must be an array.`, details: { index, slug } };
  const records: ImportRecord[] = [];
  for (const [recordIndex, rawRecord] of (Array.isArray(value.records) ? value.records : []).entries()) {
    const record = normalizeImportRecord(rawRecord);
    if (!record || !isRecord(rawRecord) || (rawRecord.values !== undefined && !isRecord(rawRecord.values))
      || (rawRecord.status !== undefined && !['draft', 'published', 'scheduled', 'archived'].includes(String(rawRecord.status)))) {
      return { ok: false, message: `Imported collection ${index + 1} record ${recordIndex + 1} requires a slug, object values and a valid status.`, details: { index, slug, recordIndex } };
    }
    records.push(record);
  }

  return {
    ok: true,
    collection: {
      name,
      slug,
      description:
        typeof value.description === "string"
          ? value.description.trim() || null
          : null,
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

const validateImportInput = (
  collections: ImportCollection[],
  requestId: string,
): NextResponse | null => {
  if (collections.length === 0) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Collection import requires at least one collection.",
      requestId,
    );
  }

  const duplicateCollection = collections.find(
    (collection, index) =>
      collections.findIndex(
        (candidate) => candidate.slug === collection.slug,
      ) !== index,
  );
  if (duplicateCollection) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Collection import contains duplicate collection slugs.",
      requestId,
      { slug: duplicateCollection.slug },
    );
  }

  const invalidRoute = collections.find(
    (collection) =>
      collection.routePattern === null || collection.listRoutePattern === null,
  );
  if (invalidRoute) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Collection route patterns are invalid.",
      requestId,
      { slug: invalidRoute.slug },
    );
  }

  for (const collection of collections) {
    const duplicateRecord = collection.records.find(
      (record, index) =>
        collection.records.findIndex(
          (candidate) => candidate.slug === record.slug,
        ) !== index,
    );
    if (duplicateRecord) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Collection import contains duplicate record slugs.",
        requestId,
        {
          collectionSlug: collection.slug,
          recordSlug: duplicateRecord.slug,
        },
      );
    }
  }

  return null;
};

type ImportedCollectionSnapshotSource = {
  id: string;
  name: string;
  slug: string;
  status: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  fields?: unknown[];
  permissions?: {
    publicRead?: boolean;
    publicCreate?: boolean;
  };
};

type ImportedRecordSnapshotSource = {
  id: string;
  collectionId: string;
  slug: string;
  status: string;
  values?: Record<string, unknown>;
  scheduledAt?: string | null;
};

const importedCollectionSnapshot = (
  collection: ImportedCollectionSnapshotSource,
): BackyJsonObject => ({
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

const importedRecordSnapshot = (
  record: ImportedRecordSnapshotSource,
): BackyJsonObject => ({
  recordId: record.id,
  collectionId: record.collectionId,
  slug: record.slug,
  status: record.status,
  scheduledAt: record.scheduledAt || null,
  valueKeys: Object.keys(record.values || {}),
});

const deliverCollectionImportWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collections: ImportedCollectionSnapshotSource[];
  records: ImportedRecordSnapshotSource[];
  upsert: boolean;
  summary: {
    createdCollections: number;
    updatedCollections: number;
    createdRecords: number;
    updatedRecords: number;
  };
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "collection.imported",
    data: {
      resourceType: "collection",
      import: {
        ...params.summary,
        totalCollections: params.collections.length,
        totalRecords: params.records.length,
        upsert: params.upsert,
      },
      collections: params.collections.map(importedCollectionSnapshot),
      records: params.records.slice(0, 50).map(importedRecordSnapshot),
      recordPreviewLimit: 50,
    },
    metadata: {
      action: "collection.imported",
      changedKeys: ["content", "collections"],
      source: "admin-collections-import-api",
      resourceType: "collection",
      resourceId:
        params.collections.length === 1 ? params.collections[0].id : "bulk",
      collectionIds: params.collections.map((collection) => collection.id),
      collectionSlugs: params.collections.map((collection) => collection.slug),
      createdCollections: params.summary.createdCollections,
      updatedCollections: params.summary.updatedCollections,
      createdRecords: params.summary.createdRecords,
      updatedRecords: params.summary.updatedRecords,
      totalRecords: params.records.length,
      upsert: params.upsert,
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "collections.edit",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const upsert = searchParams.get("upsert") === "true";
    const body = await parseJsonBody(request);
    const collections: ImportCollection[] = [];
    for (const [index, rawCollection] of collectionsFromBody(body).entries()) {
      const parsed = normalizeImportCollection(rawCollection, index);
      if (!parsed.ok) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          parsed.message,
          requestId,
          parsed.details,
        );
      }
      collections.push(parsed.collection);
    }
    const invalid = validateImportInput(collections, requestId);
    if (invalid) return invalid;
    const commerceAccess = await requireCommerceCollectionSlugAccess(
      request,
      requestId,
      collections.map((collection) => collection.slug),
      "edit",
    );
    if (commerceAccess) return commerceAccess;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const pages = await collectCollectionRoutePages(site.id, pagination => repositories.pages.list({
        siteId: site.id,
        includeUnpublished: true,
        status: "all",
        ...pagination,
      }));
      const operations = await prepareCollectionImport({ siteId: site.id, collections, upsert, pages,
        getCollection: slug => repositories.collections.getBySlug(site.id, slug),
        readRecords: (collectionId, pagination) => repositories.collections.listRecords({ siteId: site.id, collectionId, includeUnpublished: true, status: 'all', ...pagination }),
        mediaRepository: repositories.media,
      });
      const { collections: importedCollections, records: importedRecords, createdCollections, updatedCollections, createdRecords, updatedRecords } = await repositories.collections.applyImport(site.id, operations);
      // The import and essential reference index have committed together. These
      // independent tasks must not invite a replay of that completed import.
      const completionWarnings: string[] = [];
      const followUp = async <T>(code: string, operation: () => Promise<T>): Promise<T | undefined> => {
        try { return await operation(); }
        catch { completionWarnings.push(code); return undefined; }
      };
      const cacheInvalidation = await followUp("COLLECTION_IMPORT_CACHE_INVALIDATION_PENDING", () => recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "collection",
          reason: "collections-imported",
          requestId,
        },
      ));
      await followUp("COLLECTION_IMPORT_AUDIT_PENDING", () => recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "collection",
        entityId:
          importedCollections.length === 1 ? importedCollections[0].id : "bulk",
        action: "collection.import",
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
          collectionSlugs: importedCollections.map(
            (collection) => collection.slug,
          ),
        },
        requestId,
      }));
      await followUp("COLLECTION_IMPORT_WEBHOOK_DELIVERY_PENDING", async () => {
        const outcomes = await deliverCollectionImportWebhook({
        repositories,
        site,
        collections: importedCollections,
        records: importedRecords,
        upsert,
        summary: {
          createdCollections,
          updatedCollections,
          createdRecords,
          updatedRecords,
        },
        requestId,
        actor: access.session?.user.id,
        });
        if (Array.isArray(outcomes) && outcomes.some(outcome => outcome.status === "failed")) throw new Error("Collection import notification needs attention.");
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          import: {
            createdCollections,
            updatedCollections,
            createdRecords,
            updatedRecords,
            totalCollections: importedCollections.length,
            totalRecords: importedRecords.length,
          },
          collections: importedCollections,
          records: importedRecords,
          cacheInvalidation,
          ...(completionWarnings.length ? { completionWarnings } : {}),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const operations = await prepareCollectionImport({ siteId: site.id, collections, upsert,
      pages: getPageSummary(site.id, { includeUnpublished: true }),
      getCollection: async slug => getCollectionByIdOrSlug(site.id, slug, { includeUnpublished: true }) as never || null,
      readRecords: async (collectionId, pagination) => {
        const result = listCollectionRecords(site.id, collectionId, { includeUnpublished: true, ...pagination });
        return { items: result.records as never, pagination: result.pagination };
      },
      mediaRepository: { getById: async (siteId, mediaId) => getMediaById(siteId, mediaId) || null },
    });
    const { collections: importedCollections, records: importedRecords, createdCollections, updatedCollections, createdRecords, updatedRecords } = applyAdminCollectionImport(site.id, operations);

    await recordAdminAudit({
      siteId: site.id,
      entity: "collection",
      entityId:
        importedCollections.length === 1 ? importedCollections[0].id : "bulk",
      action: "collection.import",
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
        collectionSlugs: importedCollections.map(
          (collection) => collection.slug,
        ),
      },
      requestId,
    });
    await deliverCollectionImportWebhook({
      site: site as unknown as Site,
      collections: importedCollections,
      records: importedRecords,
      upsert,
      summary: {
        createdCollections,
        updatedCollections,
        createdRecords,
        updatedRecords,
      },
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        import: {
          createdCollections,
          updatedCollections,
          createdRecords,
          updatedRecords,
          totalCollections: importedCollections.length,
          totalRecords: importedRecords.length,
        },
        collections: importedCollections,
        records: importedRecords,
      },
    });
  } catch (error) {
    const mediaAdmissionError = editorMediaMutationErrorResponse(error, requestId);
    if (mediaAdmissionError) return mediaAdmissionError;
    const recordIssues = collectionRecordValidationIssuesFromError(error);
    if (recordIssues) return errorResponse(400, "VALIDATION_ERROR", "Collection record values are invalid.", requestId, { issues: recordIssues });
    if (error instanceof CollectionImportValidationError) return errorResponse(error.status, error.code, error.message, requestId, error.details);
    if (error instanceof BackyCollectionImportConflictError || (isRecord(error) && error.code === 'COLLECTION_IMPORT_CONFLICT')) return errorResponse(409, 'COLLECTION_IMPORT_CONFLICT', 'Collection content changed while the import was prepared. Reload the collections and retry; no import changes were committed.', requestId);
    if (error instanceof CollectionInventoryIncompleteError) return errorResponse(503, "COLLECTION_INVENTORY_INCOMPLETE", error.message, requestId);
    console.error("Admin collections backup import API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
