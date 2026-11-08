import { editorMediaMutationErrorResponse } from "@/lib/editorMediaMutationError";
import { CollectionRecordAdmissionUnavailableError, withRepositoryCollectionRecordAdmission } from "@/lib/collectionRecordAdmission";
import { BackyCollectionRecordValidationError } from "@backy-cms/core";
import { collectionRecordVersion, collectionRecordWithVersion } from "@/lib/collectionRecordVersion";
import { CollectionInventoryIncompleteError } from "@/lib/collectionInventory";
/**
 * Admin CMS collection record detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * PATCH  /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * DELETE /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 */

import { NextRequest, NextResponse } from "next/server";
import { assertBackyCollectionRecordUpdateExpectation, BackyCollectionRecordConflictError } from "@backy-cms/core";
import type {
  BackyCollection,
  BackyCollectionRecord,
  BackyJsonObject,
  BackyJsonValue,
  PublishStatus,
  Site,
} from "@backy-cms/core";
import {
  deleteAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  normalizeCollectionRecordValues,
  validateCollectionRecordValues,
  type StoreCollection,
} from "@/lib/backyStore";
import { requireAdminAccess } from "@/lib/adminAccess";
import { requireCommerceCollectionAccess } from "@/lib/adminCommerceCollectionAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  normalizeCollectionRecordMediaValues,
  validateRepositoryCollectionRecordValues,
} from "@/lib/collectionRecordValidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import {
  applyDemoOrderInventoryRestore,
  applyRepositoryOrderInventoryRestore,
} from "@/lib/orderInventoryRestore";
import { normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope } from "@/lib/frontendDesignContract";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
    recordId: string;
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

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toJsonRecord = (
  value: Record<string, unknown>,
): Record<string, BackyJsonValue> => value as Record<string, BackyJsonValue>;

const normalizeSlug = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";

const parseStatus = (value: unknown): PublishStatus | undefined =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived"
    ? value
    : undefined;

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

const updateAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  changedFields: Object.keys(body).filter(key => key !== "expectedUpdatedAt" && key !== "expectedVersion"),
});

const deliverCollectionRecordWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  action: "collectionRecord.updated" | "collectionRecord.deleted";
  before?: CollectionRecordAuditSource;
  after?: CollectionRecordAuditSource;
  changedFields?: string[];
  requestId: string;
  actor?: string | null;
}) => {
  const before = params.before
    ? collectionRecordAuditMetadata(params.collection, params.before)
    : undefined;
  const after = params.after
    ? collectionRecordAuditMetadata(params.collection, params.after)
    : undefined;
  const current = params.after || params.before;
  const currentMetadata = after || before;

  return deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: params.action,
    data: {
      resourceType: "collectionRecord",
      collection: {
        id: params.collection.id,
        name: params.collection.name,
        slug: params.collection.slug,
      },
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },
    metadata: {
      action: params.action,
      changedKeys: ["content", "collections"],
      source: "admin-collection-record-detail-api",
      resourceType: "collectionRecord",
      resourceId: current?.id || null,
      collectionId: params.collection.id,
      collectionName: params.collection.name,
      collectionSlug: params.collection.slug,
      recordId: current?.id || null,
      slug: current?.slug || null,
      status: current?.status || null,
      valueKeys: currentMetadata?.valueKeys || [],
      valueCount: currentMetadata?.valueCount || 0,
      changedFields: params.changedFields || [],
    },
  });
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "collections.view",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId, recordId } = await params;
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
        "view",
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const record =
        (await repositories.collections.getRecordById(
          site.id,
          collection.id,
          recordId,
        )) ||
        (await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          recordId,
        ));
      if (!record) {
        return errorResponse(
          404,
          "RECORD_NOT_FOUND",
          "Collection record not found",
          requestId,
        );
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: { collection, record: collectionRecordWithVersion(record) },
      });
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
      "view",
    );
    if (commerceAccess) {
      return commerceAccess;
    }

    const record = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      recordId,
      { includeUnpublished: true },
    );
    if (!record) {
      return errorResponse(
        404,
        "RECORD_NOT_FOUND",
        "Collection record not found",
        requestId,
      );
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: { collection, record: collectionRecordWithVersion(record) },
    });
  } catch (error) {
    if (error instanceof CollectionInventoryIncompleteError) return errorResponse(503, "COLLECTION_INVENTORY_INCOMPLETE", error.message, requestId);
    console.error("Admin collection record detail API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "collections.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId, recordId } = await params;
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

      let collection =
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
        "edit",
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const record =
        (await repositories.collections.getRecordById(
          site.id,
          collection.id,
          recordId,
        )) ||
        (await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          recordId,
        ));
      if (!record) {
        return errorResponse(
          404,
          "RECORD_NOT_FOUND",
          "Collection record not found",
          requestId,
        );
      }

      const admissionSlug = collection.slug;
      const admitted = await withRepositoryCollectionRecordAdmission(repositories.collections, site.id, collection.id, async (repository, collection, context) => {
        if (collection.slug !== admissionSlug) return errorResponse(409, 'COLLECTION_RECORD_CONFLICT', 'This collection changed while the record was being saved. Reload it before retrying.', requestId, { reloadRequired: true });
      const body = normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope(
        await parseJsonBody(request),
      );
      if (body.values !== undefined && (!body.values || typeof body.values !== 'object' || Array.isArray(body.values))) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Record values must be a JSON object.', requestId);
      }
      if (body.expectedVersion !== undefined && (typeof body.expectedVersion !== 'string' || !/^record-v1:[a-f0-9]{64}$/.test(body.expectedVersion))) return errorResponse(400, 'VALIDATION_ERROR', 'expectedVersion must be a record version token returned by Backy.', requestId);
      if (body.expectedUpdatedAt !== undefined && (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))) {
        return errorResponse(400, 'VALIDATION_ERROR', 'expectedUpdatedAt must be an ISO timestamp.', requestId);
      }
      assertBackyCollectionRecordUpdateExpectation(site.id, collection.id, record.id, { expectedUpdatedAt: body.expectedUpdatedAt, expectedVersion: body.expectedVersion }, record, collectionRecordVersion(record));
      const submittedValues = toRecord(body.values);
      const values =
        body.values === undefined
          ? record.values
          : normalizeCollectionRecordMediaValues(
              collection,
              {
                ...toRecord(record.values),
                ...submittedValues,
              },
            );
      const nextSlug = body.slug === undefined ? "" : normalizeSlug(body.slug);
      const nextScheduledAt =
        typeof body.scheduledAt === "string" || body.scheduledAt === null
          ? body.scheduledAt
          : undefined;

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Record slug is required",
          requestId,
        );
      }

      if (nextSlug && nextSlug !== record.slug) {
        const conflict = await repository.getRecordBySlug(
          site.id,
          collection.id,
          nextSlug,
        );
        if (conflict && conflict.id !== record.id) {
          return errorResponse(
            409,
            "SLUG_CONFLICT",
            "A collection record with this slug already exists",
            requestId,
          );
        }
      }

      const validationErrors = await validateRepositoryCollectionRecordValues({
        repository,
        mediaRepository: context.media,
        siteId: site.id,
        collection,
        values,
        existingValues: record.values,
        excludeRecordId: record.id,
      });
      if (validationErrors.length > 0) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Collection record values are invalid",
          requestId,
          validationErrors,
        );
      }

      let updated = (
        await repository.updateRecord(
          site.id,
          collection.id,
          record.id,
          {
            expectedRecord: record,
            ...(typeof body.expectedVersion === "string" ? { expectedVersion: body.expectedVersion } : {}),
            ...(typeof body.expectedUpdatedAt === "string" ? { expectedUpdatedAt: body.expectedUpdatedAt } : {}),
            values: toJsonRecord(normalizeCollectionRecordValues(collection as unknown as StoreCollection, submittedValues, record.values)),
            ...(parseStatus(body.status)
              ? { status: parseStatus(body.status) }
              : {}),
            ...(nextSlug ? { slug: nextSlug } : {}),
            ...(nextScheduledAt !== undefined
              ? { scheduledAt: nextScheduledAt }
              : {}),
          },
        )
      ).item;
        return { updated, collection, body };
      });
      if (admitted instanceof NextResponse) return admitted;
      collection = admitted.collection;
      let updated = admitted.updated;
      const body = admitted.body;
      updated = await applyRepositoryOrderInventoryRestore({
        repositories,
        siteId: site.id,
        collection,
        before: record,
        after: updated,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "collectionRecord",
          entityId: updated.id,
          reason: "collection-record-updated",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "collectionRecord",
        entityId: updated.id,
        action: "update",
        before: collectionRecordAuditMetadata(collection, record),
        after: collectionRecordAuditMetadata(collection, updated),
        metadata: updateAuditMetadata(collection, updated, body),
        requestId,
      });
      await deliverCollectionRecordWebhook({
        repositories,
        site,
        collection,
        action: "collectionRecord.updated",
        before: record,
        after: updated,
        changedFields: Object.keys(body).filter(key => key !== "expectedUpdatedAt" && key !== "expectedVersion"),
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { record: collectionRecordWithVersion(updated), cacheInvalidation },
      });
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
      "edit",
    );
    if (commerceAccess) {
      return commerceAccess;
    }

    const record = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      recordId,
      { includeUnpublished: true },
    );
    if (!record) {
      return errorResponse(
        404,
        "RECORD_NOT_FOUND",
        "Collection record not found",
        requestId,
      );
    }

    const body = normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope(
      await parseJsonBody(request),
    );
    if (body.values !== undefined && (!body.values || typeof body.values !== 'object' || Array.isArray(body.values))) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Record values must be a JSON object.', requestId);
    }
    if (body.expectedVersion !== undefined && (typeof body.expectedVersion !== 'string' || !/^record-v1:[a-f0-9]{64}$/.test(body.expectedVersion))) return errorResponse(400, 'VALIDATION_ERROR', 'expectedVersion must be a record version token returned by Backy.', requestId);
    if (body.expectedUpdatedAt !== undefined && (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))) {
      return errorResponse(400, 'VALIDATION_ERROR', 'expectedUpdatedAt must be an ISO timestamp.', requestId);
    }
    assertBackyCollectionRecordUpdateExpectation(site.id, collection.id, record.id, { expectedUpdatedAt: body.expectedUpdatedAt, expectedVersion: body.expectedVersion }, record as unknown as BackyCollectionRecord, collectionRecordVersion(record as unknown as BackyCollectionRecord));
    const values =
      body.values === undefined
        ? {}
        : normalizeCollectionRecordMediaValues(
            collection as unknown as BackyCollection,
            toRecord(body.values),
          );
    const nextSlug = body.slug === undefined ? "" : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Record slug is required",
        requestId,
      );
    }

    if (nextSlug && nextSlug !== record.slug) {
      const conflict = getCollectionRecordByIdOrSlug(
        site.id,
        collection.id,
        nextSlug,
        { includeUnpublished: true },
      );
      if (conflict && conflict.id !== record.id) {
        return errorResponse(
          409,
          "SLUG_CONFLICT",
          "A collection record with this slug already exists",
          requestId,
        );
      }
    }

    const validationErrors = validateCollectionRecordValues(
      collection,
      values,
      {
        existingValues: record.values,
        excludeRecordId: record.id,
      },
    );
    if (validationErrors.length > 0) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Collection record values are invalid",
        requestId,
        validationErrors,
      );
    }

    let updated = updateAdminCollectionRecord(
      site.id,
      collection.id,
      record.id,
      {
        ...body,
        expectedRecord: record,
        ...(body.values === undefined ? {} : { values }),
        ...(nextSlug ? { slug: nextSlug } : {}),
      },
    );

    if (!updated) {
      return errorResponse(
        404,
        "RECORD_NOT_FOUND",
        "Collection record not found",
        requestId,
      );
    }
    updated = applyDemoOrderInventoryRestore({
      siteId: site.id,
      collection,
      before: record,
      after: updated,
    });
    await recordAdminAudit({
      siteId: site.id,
      entity: "collectionRecord",
      entityId: updated.id,
      action: "update",
      before: collectionRecordAuditMetadata(collection, record),
      after: collectionRecordAuditMetadata(collection, updated),
      metadata: updateAuditMetadata(collection, updated, body),
      requestId,
    });
    await deliverCollectionRecordWebhook({
      site: site as unknown as Site,
      collection,
      action: "collectionRecord.updated",
      before: record,
      after: updated,
      changedFields: Object.keys(body).filter(key => key !== "expectedUpdatedAt" && key !== "expectedVersion"),
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { record: collectionRecordWithVersion(updated) },
    });
  } catch (error) {
    if (error instanceof CollectionRecordAdmissionUnavailableError) return errorResponse(503, 'COLLECTION_WRITE_UNAVAILABLE', error.message, requestId);
    if (error instanceof BackyCollectionRecordValidationError || (error && typeof error === 'object' && 'code' in error && error.code === 'COLLECTION_RECORD_VALIDATION')) return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid.', requestId, 'details' in error ? error.details : undefined);
    if (error instanceof BackyCollectionRecordConflictError || (error && typeof error === 'object' && 'code' in error && error.code === 'COLLECTION_RECORD_CONFLICT')) {
      return errorResponse(409, 'COLLECTION_RECORD_CONFLICT', 'This collection record changed while you were editing. Reload the latest record before saving again.', requestId, { reloadRequired: true });
    }
    if (error instanceof CollectionInventoryIncompleteError) return errorResponse(503, "COLLECTION_INVENTORY_INCOMPLETE", error.message, requestId);
    const mediaFailure = editorMediaMutationErrorResponse(error, requestId);
    if (mediaFailure) return mediaFailure;
    console.error("Admin collection record update API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "collections.delete",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId, recordId } = await params;
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
        "delete",
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const record =
        (await repositories.collections.getRecordById(
          site.id,
          collection.id,
          recordId,
        )) ||
        (await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          recordId,
        ));
      if (!record) {
        return errorResponse(
          404,
          "RECORD_NOT_FOUND",
          "Collection record not found",
          requestId,
        );
      }

      const deleted = await repositories.collections.deleteRecord(
        site.id,
        collection.id,
        record.id,
      );
      if (!deleted) {
        return errorResponse(
          404,
          "RECORD_NOT_FOUND",
          "Collection record not found",
          requestId,
        );
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "collectionRecord",
          entityId: record.id,
          reason: "collection-record-deleted",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "collectionRecord",
        entityId: record.id,
        action: "delete",
        before: collectionRecordAuditMetadata(collection, record),
        metadata: collectionRecordAuditMetadata(collection, record),
        requestId,
      });
      await deliverCollectionRecordWebhook({
        repositories,
        site,
        collection,
        action: "collectionRecord.deleted",
        before: record,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          recordId: record.id,
          cacheInvalidation,
        },
      });
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
      "delete",
    );
    if (commerceAccess) {
      return commerceAccess;
    }

    const record = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      recordId,
      { includeUnpublished: true },
    );
    if (!record) {
      return errorResponse(
        404,
        "RECORD_NOT_FOUND",
        "Collection record not found",
        requestId,
      );
    }

    const deleted = deleteAdminCollectionRecord(
      site.id,
      collection.id,
      record.id,
    );
    if (!deleted) {
      return errorResponse(
        404,
        "RECORD_NOT_FOUND",
        "Collection record not found",
        requestId,
      );
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: "collectionRecord",
      entityId: record.id,
      action: "delete",
      before: collectionRecordAuditMetadata(collection, record),
      metadata: collectionRecordAuditMetadata(collection, record),
      requestId,
    });
    await deliverCollectionRecordWebhook({
      site: site as unknown as Site,
      collection,
      action: "collectionRecord.deleted",
      before: record,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        recordId: record.id,
      },
    });
  } catch (error) {
    if (error instanceof CollectionInventoryIncompleteError) return errorResponse(503, "COLLECTION_INVENTORY_INCOMPLETE", error.message, requestId);
    const mediaFailure = editorMediaMutationErrorResponse(error, requestId);
    if (mediaFailure) return mediaFailure;
    console.error("Admin collection record delete API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
