/**
 * Admin CMS collection record bulk actions endpoint.
 *
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records/bulk
 */

import { NextRequest, NextResponse } from "next/server";
import type { BackyJsonObject, PublishStatus, Site } from "@backy-cms/core";
import {
  deleteAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
} from "@/lib/backyStore";
import { requireAdminAccess } from "@/lib/adminAccess";
import { requireCommerceCollectionAccess } from "@/lib/adminCommerceCollectionAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { editorMediaMutationErrorResponse } from "@/lib/editorMediaMutationError";
import { collectionRecordWithVersion } from "@/lib/collectionRecordVersion";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

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

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
) =>
  NextResponse.json(
    { success: false, requestId, error: { code, message, details } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

const parseRecordIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
    : [];

const parseRecordStatus = (value: unknown): PublishStatus | null =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived"
    ? value
    : null;

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

const bulkRecordAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  input: {
    action: string;
    requestedRecordIds: string[];
    matchedCount: number;
    changedFields?: string[];
  },
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  bulk: true,
  bulkAction: input.action,
  requestedRecordIds: input.requestedRecordIds,
  requestedCount: input.requestedRecordIds.length,
  matchedCount: input.matchedCount,
  changedFields: input.changedFields || [],
});

const deliverCollectionRecordBulkWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  action:
    | "collectionRecord.bulk.deleted"
    | "collectionRecord.bulk.statusUpdated";
  before?: CollectionRecordAuditSource[];
  after?: CollectionRecordAuditSource[];
  requestedRecordIds: string[];
  deleted: number;
  updated: number;
  skipped: number;
  changedFields?: string[];
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: params.action,
    data: {
      resourceType: "collectionRecordBulk",
      collection: {
        id: params.collection.id,
        name: params.collection.name,
        slug: params.collection.slug,
      },
      before: (params.before || []).map((record) =>
        collectionRecordAuditMetadata(params.collection, record),
      ),
      after: (params.after || []).map((record) =>
        collectionRecordAuditMetadata(params.collection, record),
      ),
      summary: {
        requestedCount: params.requestedRecordIds.length,
        deleted: params.deleted,
        updated: params.updated,
        skipped: params.skipped,
      },
    },
    metadata: {
      action: params.action,
      changedKeys: ["content", "collections"],
      source: "admin-collection-record-bulk-api",
      resourceType: "collectionRecordBulk",
      collectionId: params.collection.id,
      collectionName: params.collection.name,
      collectionSlug: params.collection.slug,
      requestedRecordIds: params.requestedRecordIds,
      requestedCount: params.requestedRecordIds.length,
      deleted: params.deleted,
      updated: params.updated,
      skipped: params.skipped,
      changedFields: params.changedFields || [],
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const body = await parseJsonBody(request);
  const action = typeof body.action === "string" ? body.action : "";
  const access = await requireAdminAccess(request, requestId, {
    permission: action === "delete" ? "collections.delete" : "collections.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId } = await params;
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

      const collection =
        (await repositories.collections.getById(site.id, collectionId)) ||
        (await repositories.collections.getBySlug(site.id, collectionId));
      if (!collection) {
        return errorResponse(
          404,
          "COLLECTION_NOT_FOUND",
          "Collection not found",
          requestId,
        );
      }
      const commerceAccess = await requireCommerceCollectionAccess(
        request,
        requestId,
        collection.slug,
        action === "delete" ? "delete" : "edit",
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const recordIds = parseRecordIds(body.recordIds);

      if (recordIds.length === 0) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "At least one collection record must be selected",
          requestId,
        );
      }

      if (action === "delete" || action === "updateStatus") {
        const status = action === "updateStatus" ? parseRecordStatus(body.status) : null;
        if (action === "updateStatus" && !status) return errorResponse(400, "VALIDATION_ERROR", "A valid status is required for bulk status updates", requestId);
        const appliedRecordIds: string[] = [], skippedRecordIds: string[] = [], notAttemptedRecordIds: string[] = [];
        const failedTargets: Array<{ recordId: string; code: string }> = [];
        const committed: Array<{ before: CollectionRecordAuditSource; after?: CollectionRecordAuditSource }> = [];
        const records = [];
        const completionWarnings: string[] = [];
        const warn = (code: string) => { if (!completionWarnings.includes(code)) completionWarnings.push(code); };
        for (let index = 0; index < recordIds.length; index++) {
          const recordId = recordIds[index];
          try {
            const record = (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId) ? await repositories.collections.getRecordById(site.id, collection.id, recordId) : null) || (await repositories.collections.getRecordBySlug(site.id, collection.id, recordId));
            if (!record) { skippedRecordIds.push(recordId); continue; }
            if (action === "delete") {
              // The runtime decorator commits row deletion and reference removal together.
              if (!await repositories.collections.deleteRecord(site.id, collection.id, record.id)) { skippedRecordIds.push(recordId); continue; }
              committed.push({ before: record });
            } else {
              // Admit the exact row read above; preserve concurrent author changes and values.
              const saved = (await repositories.collections.updateRecord(site.id, collection.id, record.id, { status: status!, expectedRecord: record })).item;
              records.push(collectionRecordWithVersion(saved));
              committed.push({ before: record, after: saved });
            }
            appliedRecordIds.push(record.id);
          } catch (cause) {
            if (!appliedRecordIds.length) throw cause;
            const rawCode = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
            const code = typeof rawCode === "string" && ["MEDIA_STORAGE_MUTATION_BUSY", "MEDIA_STORAGE_LOCK_UNAVAILABLE", "INVALID_EDITOR_MEDIA_REFERENCE", "COLLECTION_RECORD_CONFLICT", "COLLECTION_RECORD_VALIDATION"].includes(rawCode) ? rawCode : "COLLECTION_RECORD_WRITE_FAILED";
            failedTargets.push({ recordId, code });
            notAttemptedRecordIds.push(...recordIds.slice(index + 1));
            warn("COLLECTION_BULK_APPLY_INCOMPLETE");
            break;
          }
        }
        // Only committed records produce follow-ups. Failures here do not erase
        // committed outcomes or request an automatic replay of successful writes.
        for (const { before, after } of committed) {
          try {
            await recordAdminAudit({ repositories, siteId: site.id, entity: "collectionRecord", entityId: before.id, action: action === "delete" ? "delete" : "update",
              before: collectionRecordAuditMetadata(collection, before), ...(after ? { after: collectionRecordAuditMetadata(collection, after) } : {}),
              metadata: bulkRecordAuditMetadata(collection, after || before, { action, requestedRecordIds: recordIds, matchedCount: appliedRecordIds.length, changedFields: action === "updateStatus" ? ["status"] : [] }), requestId });
          } catch { warn("COLLECTION_BULK_AUDIT_PENDING"); }
        }
        let cacheInvalidation;
        if (appliedRecordIds.length) {
          try { cacheInvalidation = await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: "content", entity: "collection", entityId: collection.id, reason: action === "delete" ? "collection-records-deleted" : "collection-records-status-updated", requestId }); }
          catch { warn("COLLECTION_BULK_CACHE_INVALIDATION_PENDING"); }
          try {
            const deliveries = await deliverCollectionRecordBulkWebhook({ repositories, site, collection, action: action === "delete" ? "collectionRecord.bulk.deleted" : "collectionRecord.bulk.statusUpdated", before: committed.map(item => item.before), after: committed.flatMap(item => item.after ? [item.after] : []),
              requestedRecordIds: appliedRecordIds, deleted: action === "delete" ? appliedRecordIds.length : 0, updated: action === "updateStatus" ? appliedRecordIds.length : 0, skipped: skippedRecordIds.length,
              changedFields: action === "updateStatus" ? ["status"] : [], requestId, actor: access.session?.user.id });
            if (deliveries.some(delivery => delivery.status === "failed")) warn("COLLECTION_BULK_WEBHOOK_DELIVERY_PENDING");
          } catch { warn("COLLECTION_BULK_WEBHOOK_DELIVERY_PENDING"); }
        }
        return NextResponse.json({ success: true, requestId, data: {
          action, deleted: action === "delete" ? appliedRecordIds.length : 0, updated: action === "updateStatus" ? appliedRecordIds.length : 0, skipped: skippedRecordIds.length, records, cacheInvalidation,
          outcome: completionWarnings.length ? "partial" : "complete", appliedRecordIds, skippedRecordIds, failedTargets, notAttemptedRecordIds, completionWarnings,
          reloadRequired: !!completionWarnings.length, concurrencyBoundary: "database-per-record-transaction",
        } }, { headers: { "Cache-Control": "private, no-store" } });
      }

      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Unsupported bulk collection record action",
        requestId,
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, {
      includeUnpublished: true,
    });
    if (!collection) {
      return errorResponse(
        404,
        "COLLECTION_NOT_FOUND",
        "Collection not found",
        requestId,
      );
    }
    const commerceAccess = await requireCommerceCollectionAccess(
      request,
      requestId,
      collection.slug,
      action === "delete" ? "delete" : "edit",
    );
    if (commerceAccess) {
      return commerceAccess;
    }

    const recordIds = parseRecordIds(body.recordIds);

    if (recordIds.length === 0) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "At least one collection record must be selected",
        requestId,
      );
    }

    if (action === "delete") {
      let deleted = 0;
      let skipped = 0;
      const deletedRecords: CollectionRecordAuditSource[] = [];

      for (const recordId of recordIds) {
        const record = getCollectionRecordByIdOrSlug(
          site.id,
          collection.id,
          recordId,
          { includeUnpublished: true },
        );
        if (!record) {
          skipped += 1;
          continue;
        }

        if (deleteAdminCollectionRecord(site.id, collection.id, record.id)) {
          deletedRecords.push(record);
          deleted += 1;
        } else {
          skipped += 1;
        }
      }

      for (const record of deletedRecords) {
        await recordAdminAudit({
          siteId: site.id,
          entity: "collectionRecord",
          entityId: record.id,
          action: "delete",
          before: collectionRecordAuditMetadata(collection, record),
          metadata: bulkRecordAuditMetadata(collection, record, {
            action,
            requestedRecordIds: recordIds,
            matchedCount: deleted,
          }),
          requestId,
        });
      }
      if (deleted > 0) {
        await deliverCollectionRecordBulkWebhook({
          site: site as unknown as Site,
          collection,
          action: "collectionRecord.bulk.deleted",
          before: deletedRecords,
          requestedRecordIds: recordIds,
          deleted,
          updated: 0,
          skipped,
          requestId,
          actor: access.session?.user.id,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          action,
          deleted,
          updated: 0,
          skipped,
          records: [],
        },
      });
    }

    if (action === "updateStatus") {
      const status = parseRecordStatus(body.status);
      if (!status) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "A valid status is required for bulk status updates",
          requestId,
        );
      }

      const records = [];
      const updatedRecords: Array<{
        before: CollectionRecordAuditSource;
        after: CollectionRecordAuditSource;
      }> = [];
      let updated = 0;
      let skipped = 0;

      for (const recordId of recordIds) {
        const record = getCollectionRecordByIdOrSlug(
          site.id,
          collection.id,
          recordId,
          { includeUnpublished: true },
        );
        if (!record) {
          skipped += 1;
          continue;
        }

        const saved = updateAdminCollectionRecord(
          site.id,
          collection.id,
          record.id,
          { status },
        );
        if (saved) {
          records.push(saved);
          updatedRecords.push({ before: record, after: saved });
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      for (const { before, after } of updatedRecords) {
        await recordAdminAudit({
          siteId: site.id,
          entity: "collectionRecord",
          entityId: after.id,
          action: "update",
          before: collectionRecordAuditMetadata(collection, before),
          after: collectionRecordAuditMetadata(collection, after),
          metadata: bulkRecordAuditMetadata(collection, after, {
            action,
            requestedRecordIds: recordIds,
            matchedCount: updated,
            changedFields: ["status"],
          }),
          requestId,
        });
      }
      if (updated > 0) {
        await deliverCollectionRecordBulkWebhook({
          site: site as unknown as Site,
          collection,
          action: "collectionRecord.bulk.statusUpdated",
          before: updatedRecords.map(({ before }) => before),
          after: updatedRecords.map(({ after }) => after),
          requestedRecordIds: recordIds,
          deleted: 0,
          updated,
          skipped,
          changedFields: ["status"],
          requestId,
          actor: access.session?.user.id,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          action,
          deleted: 0,
          updated,
          skipped,
          records,
        },
      });
    }

    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Unsupported bulk collection record action",
      requestId,
    );
  } catch (error) {
    const admissionError = editorMediaMutationErrorResponse(error, requestId);
    if (admissionError) return admissionError;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "COLLECTION_RECORD_CONFLICT") return errorResponse(409, "COLLECTION_RECORD_CONFLICT", "The record changed. Reload before retrying.", requestId, { reloadRequired: true });
    if (code === "COLLECTION_RECORD_VALIDATION") return errorResponse(400, "VALIDATION_ERROR", "Collection record values are invalid.", requestId);
    console.error("Admin collection record bulk API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
