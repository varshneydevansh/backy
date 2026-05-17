/**
 * Admin CMS collection records endpoint.
 *
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records?q=term&fieldKey=title&fieldValue=example&sortBy=title
 * GET  /api/admin/sites/[siteId]/collections/[collectionId]/records?format=csv
 * POST /api/admin/sites/[siteId]/collections/[collectionId]/records
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SITE_SETTINGS,
  type BackyCollection,
  type BackyCollectionRecord,
  type BackyJsonObject,
  type BackyJsonValue,
  type PublishStatus,
  type Site,
} from "@backy-cms/core";
import {
  createAdminCollectionRecord,
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
  validateCollectionRecordValues,
  type StoreCollection,
} from "@/lib/backyStore";
import { requireAdminAccess } from "@/lib/adminAccess";
import { requireCommerceCollectionAccess } from "@/lib/adminCommerceCollectionAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import { seedCollectionRecordInputFromFrontendDesignTemplate } from "@/lib/frontendDesignContract";
import {
  normalizeCollectionRecordMediaValues,
  validateRepositoryCollectionRecordValues,
} from "@/lib/collectionRecordValidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
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

const parseStatusFilter = (value: string | null) =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived"
    ? value
    : undefined;

const parseStatus = (value: unknown): PublishStatus | undefined =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived"
    ? value
    : undefined;

const readProductBillingPolicy = (
  siteSettings: unknown,
  workspaceSettings: unknown,
) => {
  const siteRoot = toRecord(siteSettings);
  const workspaceRoot = toRecord(workspaceSettings);
  const integrations = toRecord(workspaceRoot.integrations);
  const commerce = toRecord(integrations.commerce);
  const billingQuota = toRecord(siteRoot.billingQuota);
  const limits = toRecord(billingQuota.limits);
  const limit = Number(limits.products);

  return {
    overageMode:
      typeof commerce.overageMode === "string" ? commerce.overageMode : "warn",
    productLimit:
      Number.isFinite(limit) && limit >= 0
        ? Math.round(limit)
        : DEFAULT_SITE_SETTINGS.billingQuota.limits.products,
    billingPlan:
      typeof billingQuota.plan === "string"
        ? billingQuota.plan
        : DEFAULT_SITE_SETTINGS.billingQuota.plan,
  };
};

const enforceProductBillingLimit = (
  collection: CollectionAuditSource,
  siteSettings: unknown,
  workspaceSettings: unknown,
  currentProductCount: number,
  requestId: string,
) => {
  if (collection.slug !== "products") {
    return null;
  }

  const policy = readProductBillingPolicy(siteSettings, workspaceSettings);
  if (
    policy.overageMode === "block" &&
    currentProductCount >= policy.productLimit
  ) {
    return errorResponse(
      402,
      "BILLING_PRODUCT_LIMIT",
      `The ${policy.billingPlan} site plan allows ${policy.productLimit} product${policy.productLimit === 1 ? "" : "s"}. Update the site billing quota before creating another product.`,
      requestId,
    );
  }

  return null;
};

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

const deliverCollectionRecordWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  action: "collectionRecord.created";
  after: CollectionRecordAuditSource;
  requestId: string;
  actor?: string | null;
}) => {
  const after = collectionRecordAuditMetadata(params.collection, params.after);
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
      after,
    },
    metadata: {
      action: params.action,
      changedKeys: ["content", "collections"],
      source: "admin-collection-records-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      collectionId: params.collection.id,
      collectionName: params.collection.name,
      collectionSlug: params.collection.slug,
      recordId: params.after.id,
      slug: params.after.slug,
      status: params.after.status,
      valueKeys: after.valueKeys,
      valueCount: after.valueCount,
    },
  });
};

const toCsvCell = (value: unknown): string => {
  let text = "";

  if (value === null || value === undefined) {
    text = "";
  } else if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "";
    }
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildRecordsCsv = (
  collection:
    | BackyCollection
    | NonNullable<ReturnType<typeof getCollectionByIdOrSlug>>,
  records:
    | BackyCollectionRecord[]
    | ReturnType<typeof listCollectionRecords>["records"],
) => {
  const fields = [...collection.fields].sort(
    (left, right) =>
      ((left as { sortOrder?: number }).sortOrder || 0) -
      ((right as { sortOrder?: number }).sortOrder || 0),
  );
  const headers = [
    "id",
    "slug",
    "status",
    "createdAt",
    "updatedAt",
    "publishedAt",
    "scheduledAt",
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
    headers.map(toCsvCell).join(","),
    ...rows.map((row) => row.map(toCsvCell).join(",")),
  ].join("\n");
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const { searchParams } = new URL(request.url);
  const csvRequested =
    searchParams.get("format") === "csv" ||
    searchParams.get("export") === "csv";
  const access = await requireAdminAccess(request, requestId, {
    permission: csvRequested ? "collections.export" : "collections.view",
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
        "view",
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const csvRequested =
        searchParams.get("format") === "csv" ||
        searchParams.get("export") === "csv";
      const defaultLimit = csvRequested ? 1000 : 50;
      const maxLimit = csvRequested ? 1000 : 100;
      const limit = Math.max(
        1,
        Math.min(maxLimit, Number(searchParams.get("limit") || defaultLimit)),
      );
      const offset = Math.max(0, Number(searchParams.get("offset") || 0));
      const sortDirection =
        searchParams.get("sortDirection") === "desc" ? "desc" : "asc";
      const slug = searchParams.get("slug");
      const payload = slug
        ? {
            items: [
              await repositories.collections.getRecordBySlug(
                site.id,
                collection.id,
                slug,
              ),
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
            status: parseStatusFilter(searchParams.get("status")),
            search:
              searchParams.get("q") || searchParams.get("search") || undefined,
            fieldKey: searchParams.get("fieldKey") || undefined,
            fieldValue: searchParams.get("fieldValue") || undefined,
            sortBy: searchParams.get("sortBy") || undefined,
            sortDirection,
            limit,
            offset,
          });

      if (slug && payload.items.length === 0) {
        return errorResponse(
          404,
          "COLLECTION_RECORD_NOT_FOUND",
          "Collection record not found",
          requestId,
        );
      }

      if (csvRequested) {
        const csv = buildRecordsCsv(collection, payload.items);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${collection.slug}-records.csv"`,
            "x-request-id": requestId,
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

    const csvRequested =
      searchParams.get("format") === "csv" ||
      searchParams.get("export") === "csv";
    const defaultLimit = csvRequested ? 1000 : 50;
    const maxLimit = csvRequested ? 1000 : 100;
    const limit = Math.max(
      1,
      Math.min(maxLimit, Number(searchParams.get("limit") || defaultLimit)),
    );
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));
    const sortDirection =
      searchParams.get("sortDirection") === "desc" ? "desc" : "asc";
    const payload = listCollectionRecords(site.id, collection.id, {
      includeUnpublished: true,
      status: parseStatusFilter(searchParams.get("status")),
      slug: searchParams.get("slug") || undefined,
      search: searchParams.get("q") || searchParams.get("search") || undefined,
      fieldKey: searchParams.get("fieldKey") || undefined,
      fieldValue: searchParams.get("fieldValue") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      sortDirection,
      limit,
      offset,
    });

    if (csvRequested) {
      const csv = buildRecordsCsv(collection, payload.records);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${collection.slug}-records.csv"`,
          "x-request-id": requestId,
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
    console.error("Admin collection records list API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "collections.edit",
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
        "edit",
      );
      if (commerceAccess) {
        return commerceAccess;
      }

      const rawBody = await parseJsonBody(request);
      const seeded = seedCollectionRecordInputFromFrontendDesignTemplate({
        siteSettings: site.settings,
        body: rawBody,
        templateType: collection.slug === "products" ? "product" : "collection",
      });
      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }
      const body = seeded.body;
      const values = normalizeCollectionRecordMediaValues(
        collection,
        toRecord(body.values),
      );
      const slug = normalizeSlug(
        body.slug || values.slug || values.title || values.name || "record",
      );

      if (!slug) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Record slug is required",
          requestId,
        );
      }

      if (
        await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          slug,
        )
      ) {
        return errorResponse(
          409,
          "SLUG_CONFLICT",
          "A collection record with this slug already exists",
          requestId,
        );
      }

      const validationErrors = await validateRepositoryCollectionRecordValues({
        repository: repositories.collections,
        mediaRepository: repositories.media,
        siteId: site.id,
        collection,
        values,
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

      const [settings, existingProducts] = await Promise.all([
        repositories.settings.get(),
        collection.slug === "products"
          ? repositories.collections.listRecords({
              siteId: site.id,
              collectionId: collection.id,
              includeUnpublished: true,
              status: "all",
              limit: 1,
              offset: 0,
            })
          : Promise.resolve(null),
      ]);
      const billingLimitError = enforceProductBillingLimit(
        collection,
        site.settings,
        settings,
        existingProducts?.pagination.total || 0,
        requestId,
      );
      if (billingLimitError) {
        return billingLimitError;
      }

      const record = (
        await repositories.collections.createRecord({
          siteId: site.id,
          collectionId: collection.id,
          slug,
          status: parseStatus(body.status) || "draft",
          ...(typeof body.scheduledAt === "string"
            ? { scheduledAt: body.scheduledAt }
            : {}),
          values: toJsonRecord(values),
        })
      ).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "collectionRecord",
          entityId: record.id,
          reason: "collection-record-created",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "collectionRecord",
        entityId: record.id,
        action: "create",
        after: collectionRecordAuditMetadata(collection, record),
        metadata: collectionRecordAuditMetadata(collection, record),
        requestId,
      });
      await deliverCollectionRecordWebhook({
        repositories,
        site,
        collection,
        action: "collectionRecord.created",
        after: record,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json(
        { success: true, requestId, data: { record, cacheInvalidation } },
        { status: 201 },
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
      "edit",
    );
    if (commerceAccess) {
      return commerceAccess;
    }

    const rawBody = await parseJsonBody(request);
    const seeded = seedCollectionRecordInputFromFrontendDesignTemplate({
      siteSettings: site.settings,
      body: rawBody,
      templateType: collection.slug === "products" ? "product" : "collection",
    });
    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }
    const body = seeded.body;
    const values = normalizeCollectionRecordMediaValues(
      collection as unknown as BackyCollection,
      toRecord(body.values),
    );
    const slug = normalizeSlug(
      body.slug || values.slug || values.title || values.name || "record",
    );

    if (!slug) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Record slug is required",
        requestId,
      );
    }

    if (
      getCollectionRecordByIdOrSlug(site.id, collection.id, slug, {
        includeUnpublished: true,
      })
    ) {
      return errorResponse(
        409,
        "SLUG_CONFLICT",
        "A collection record with this slug already exists",
        requestId,
      );
    }

    const validationErrors = validateCollectionRecordValues(collection, values);
    if (validationErrors.length > 0) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Collection record values are invalid",
        requestId,
        validationErrors,
      );
    }

    const existingProducts =
      collection.slug === "products"
        ? listCollectionRecords(site.id, collection.id, {
            includeUnpublished: true,
            limit: 1,
            offset: 0,
          })
        : null;
    const billingLimitError = enforceProductBillingLimit(
      collection,
      site.settings,
      getAdminSettings(),
      existingProducts?.pagination.total || 0,
      requestId,
    );
    if (billingLimitError) {
      return billingLimitError;
    }

    const record = createAdminCollectionRecord(site.id, collection.id, {
      ...body,
      slug,
      values,
    });

    if (!record) {
      return errorResponse(
        404,
        "COLLECTION_NOT_FOUND",
        "Collection not found",
        requestId,
      );
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: "collectionRecord",
      entityId: record.id,
      action: "create",
      after: collectionRecordAuditMetadata(collection, record),
      metadata: collectionRecordAuditMetadata(collection, record),
      requestId,
    });
    await deliverCollectionRecordWebhook({
      site: site as unknown as Site,
      collection,
      action: "collectionRecord.created",
      after: record,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json(
      { success: true, requestId, data: { record } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin collection record create API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
