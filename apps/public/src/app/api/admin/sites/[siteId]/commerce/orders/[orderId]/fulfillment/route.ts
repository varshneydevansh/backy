/**
 * Admin commerce order fulfillment dispatch endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/fulfillment
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/fulfillment
 */

import { NextRequest, NextResponse } from "next/server";
import type {
  BackyCollection,
  BackyJsonObject,
  BackyJsonValue,
  Site,
} from "@backy-cms/core";
import {
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from "@/lib/backyStore";
import { requireAdminAccess } from "@/lib/adminAccess";
import { requireCommerceCollectionAccess } from "@/lib/adminCommerceCollectionAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  normalizeCollectionRecordMediaValues,
  validateRepositoryCollectionRecordValues,
} from "@/lib/collectionRecordValidation";
import { publicContractJson } from "@/lib/publicContractResponse";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    orderId: string;
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
  updatedAt?: string | null;
}

interface FulfillmentDispatchPayload {
  id: string;
  status: "requested" | "succeeded" | "failed" | "requires_action";
  provider: string;
  orderNumber: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload: Record<string, unknown>;
}

type FulfillmentDispatchUpdateResult =
  | { fulfillment: FulfillmentDispatchPayload; values: Record<string, unknown> }
  | {
      error: {
        status: number;
        code: string;
        message: string;
        details?: unknown;
      };
    };

const ORDERS_COLLECTION_SLUG = "orders";
const FULFILLMENT_DISPATCH_SCHEMA_VERSION = "backy.fulfillment-dispatch.v1";

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
) =>
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    {
      status,
      requestId,
      cache: "error",
      schemaVersion: FULFILLMENT_DISPATCH_SCHEMA_VERSION,
    },
  );

const privateFulfillmentResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: FULFILLMENT_DISPATCH_SCHEMA_VERSION,
    siteId,
  });

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

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJsonRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const parseItems = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.map(toRecord);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(toRecord) : [];
  } catch {
    return [];
  }
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

const fulfillmentAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  fulfillment: FulfillmentDispatchPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  fulfillmentId: fulfillment.id,
  fulfillmentStatus: fulfillment.status,
  provider: fulfillment.provider,
  requestedAt: fulfillment.requestedAt,
  completedAt: fulfillment.completedAt,
});

const orderRecordWebhookSnapshot = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
): BackyJsonObject => {
  const values = toRecord(record.values);

  return {
    ...collectionRecordAuditMetadata(collection, record),
    orderNumber: textValue(values.ordernumber) || record.slug,
    orderStatus: textValue(values.orderstatus),
    paymentStatus: textValue(values.paymentstatus),
    fulfillmentStatus: textValue(values.fulfillmentstatus),
    fulfillmentProvider: textValue(values.fulfillmentprovider),
    fulfillmentCarrier: textValue(values.fulfillmentcarrier),
    trackingNumber: textValue(values.trackingnumber),
    trackingUrl: textValue(values.trackingurl),
  };
};

const fulfillmentWebhookSnapshot = (
  fulfillment: FulfillmentDispatchPayload,
): BackyJsonObject => ({
  id: fulfillment.id,
  status: fulfillment.status,
  provider: fulfillment.provider,
  orderNumber: fulfillment.orderNumber,
  requestedAt: fulfillment.requestedAt,
  completedAt: fulfillment.completedAt,
});

const deliverOrderFulfillmentWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  before: CollectionRecordAuditSource;
  after: CollectionRecordAuditSource;
  fulfillment: FulfillmentDispatchPayload;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "commerce.order.fulfillment_dispatched",
    data: {
      resourceType: "collectionRecord",
      before: orderRecordWebhookSnapshot(params.collection, params.before),
      after: orderRecordWebhookSnapshot(params.collection, params.after),
      fulfillment: fulfillmentWebhookSnapshot(params.fulfillment),
    },
    metadata: {
      action: "commerce.order.fulfillment_dispatched",
      changedKeys: ["content", "collections", "commerce"],
      source: "admin-commerce-order-fulfillment-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      orderId: params.after.id,
      orderSlug: params.after.slug,
      fulfillmentId: params.fulfillment.id,
      fulfillmentStatus: params.fulfillment.status,
      provider: params.fulfillment.provider,
    },
  });

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const normalizeFulfillmentStatus = (
  value: string,
): FulfillmentDispatchPayload["status"] => {
  if (
    value === "succeeded" ||
    value === "failed" ||
    value === "requires_action" ||
    value === "requested"
  )
    return value;
  return "requires_action";
};

const fulfillmentProviderUrl = (settings: unknown): string => {
  const commerce = toRecord(toRecord(settings).integrations);
  const commerceSettings = toRecord(commerce.commerce);
  if (textValue(commerceSettings.fulfillmentProvider).toLowerCase() !== "http")
    return "";
  const url = textValue(commerceSettings.fulfillmentProviderUrl);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
};

const safeProviderResponsePayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id || value.fulfillmentId || value.dispatchId),
  status: textValue(value.status),
  provider: textValue(value.provider),
  reference: textValue(value.reference || value.providerReference),
  trackingNumber: textValue(value.trackingNumber || value.tracking_number),
  trackingUrl: textValue(value.trackingUrl || value.tracking_url),
  cost: numberValue(value.cost ?? value.amount, Number.NaN),
  message: textValue(value.message),
});

const buildDispatchPayload = (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  fulfillment: Omit<FulfillmentDispatchPayload, "providerPayload">,
) => {
  const values = toRecord(record.values);
  const shippingLabel = {
    id: textValue(values.shippinglabelid),
    status: textValue(values.shippinglabelstatus),
    provider: textValue(values.shippinglabelprovider),
    serviceLevel: textValue(values.shippingservicelevel),
    url: textValue(values.shippinglabelurl),
  };
  const tracking = {
    provider: textValue(values.fulfillmentcarrier) || fulfillment.provider,
    number: textValue(values.trackingnumber),
    url: textValue(values.trackingurl),
    status: textValue(values.trackingstatus),
  };

  return {
    schemaVersion: "backy.fulfillment-dispatch.v1",
    executionMode: "manual-handoff",
    action: "fulfillment.dispatch",
    provider: fulfillment.provider,
    fulfillmentId: fulfillment.id,
    orderId: record.id,
    orderSlug: record.slug,
    orderNumber: fulfillment.orderNumber,
    requestedAt: fulfillment.requestedAt,
    completedAt: fulfillment.completedAt,
    status: fulfillment.status,
    customer: {
      name: textValue(values.customername),
      email: textValue(values.email),
      phone: textValue(values.phone),
      customerId: textValue(values.customerid),
    },
    shippingAddress: textValue(values.shippingaddress),
    billingAddress: textValue(values.billingaddress),
    lineItems: parseItems(values.items),
    shippingLabel,
    tracking,
    requestedBy: textValue(body.requestedBy) || "backy-admin",
    providerInstructions: textValue(body.instructions),
  };
};

const existingFulfillmentPayload = (
  record: CollectionRecordAuditSource,
): FulfillmentDispatchPayload | null => {
  const values = toRecord(record.values);
  const id = textValue(values.fulfillmentid);
  const status = textValue(values.fulfillmentdispatchstatus);
  if (!id && !status) return null;

  return {
    id,
    status: normalizeFulfillmentStatus(status),
    provider:
      textValue(values.fulfillmentprovider) ||
      textValue(values.fulfillmentcarrier) ||
      "manual",
    orderNumber: textValue(values.ordernumber) || record.slug,
    requestedAt:
      textValue(values.fulfillmentrequestedat) ||
      record.updatedAt ||
      new Date().toISOString(),
    completedAt: textValue(values.fulfillmentcompletedat) || null,
    providerPayload: parseJsonRecord(values.fulfillmentpayload),
  };
};

const executeHttpFulfillmentProvider = async ({
  url,
  record,
  payload,
  requestId,
}: {
  url: string;
  record: CollectionRecordAuditSource;
  payload: Record<string, unknown>;
  requestId: string;
}): Promise<{
  status: FulfillmentDispatchPayload["status"];
  id?: string;
  provider?: string;
  completedAt?: string | null;
  trackingNumber?: string;
  trackingUrl?: string;
  payload: Record<string, unknown>;
}> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-backy-request-id": requestId,
        "x-backy-provider-kind": "fulfillment",
      },
      body: JSON.stringify({
        schemaVersion: "backy.fulfillment-provider-request.v1",
        orderId: record.id,
        orderSlug: record.slug,
        fulfillment: payload,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const body = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      return {
        status: "failed",
        payload: {
          schemaVersion: "backy.fulfillment-provider-response.v1",
          provider: "http",
          executionMode: "http-provider",
          statusCode: response.status,
          error:
            textValue(body.error) ||
            textValue(toRecord(body.error).message) ||
            `Provider returned HTTP ${response.status}.`,
          response: safeProviderResponsePayload(body),
        },
      };
    }
    const status = normalizeFulfillmentStatus(
      textValue(body.status) || "requested",
    );
    return {
      status,
      id: textValue(body.id || body.fulfillmentId || body.dispatchId),
      provider: textValue(body.provider),
      completedAt:
        textValue(body.completedAt) ||
        (status === "succeeded" ? new Date().toISOString() : null),
      trackingNumber: textValue(body.trackingNumber || body.tracking_number),
      trackingUrl: textValue(body.trackingUrl || body.tracking_url),
      payload: {
        schemaVersion: "backy.fulfillment-provider-response.v1",
        provider: "http",
        executionMode: "http-provider",
        statusCode: response.status,
        response: safeProviderResponsePayload(body),
      },
    };
  } catch (error) {
    return {
      status: "failed",
      payload: {
        schemaVersion: "backy.fulfillment-provider-response.v1",
        provider: "http",
        executionMode: "http-provider",
        error:
          error instanceof Error
            ? error.message
            : "Fulfillment provider request failed.",
      },
    };
  }
};

const buildFulfillmentDispatch = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  requestId: string,
  settings: unknown,
): Promise<FulfillmentDispatchUpdateResult> => {
  const values = toRecord(record.values);
  const paymentStatus = textValue(values.paymentstatus) || "pending";
  if (paymentStatus !== "paid") {
    return {
      error: {
        status: 409,
        code: "ORDER_NOT_PAID",
        message: "Only paid orders can be dispatched to fulfillment.",
      },
    };
  }

  const orderFulfillmentStatus =
    textValue(values.fulfillmentstatus) || "unfulfilled";
  if (
    orderFulfillmentStatus === "fulfilled" ||
    orderFulfillmentStatus === "cancelled"
  ) {
    return {
      error: {
        status: 409,
        code: "ORDER_FULFILLMENT_CLOSED",
        message: "Fulfilled or cancelled orders cannot be dispatched again.",
      },
    };
  }

  const now = new Date().toISOString();
  const provider =
    textValue(body.provider) ||
    textValue(values.fulfillmentprovider) ||
    textValue(values.fulfillmentcarrier) ||
    "manual";
  const status = normalizeFulfillmentStatus(
    textValue(body.status) || "requires_action",
  );
  const existingId = textValue(values.fulfillmentid);
  const id = existingId || `ful_${record.id}_${Date.now().toString(36)}`;
  const completedAt =
    status === "succeeded"
      ? now
      : textValue(values.fulfillmentcompletedat) || null;
  const fulfillmentBase = {
    id,
    status,
    provider,
    orderNumber: textValue(values.ordernumber) || record.slug,
    requestedAt: now,
    completedAt,
  };
  const providerPayload: Record<string, unknown> = buildDispatchPayload(
    record,
    body,
    fulfillmentBase,
  );
  const executionUrl = fulfillmentProviderUrl(settings);
  let fulfillmentStatus = status;
  let fulfillmentId = id;
  let fulfillmentProvider = provider;
  let fulfillmentCompletedAt = completedAt;
  if (executionUrl) {
    const execution = await executeHttpFulfillmentProvider({
      url: executionUrl,
      record,
      payload: providerPayload,
      requestId,
    });
    providerPayload.executionMode = "http-provider";
    providerPayload.execution = execution.payload;
    fulfillmentStatus = execution.status;
    fulfillmentId = execution.id || fulfillmentId;
    fulfillmentProvider = execution.provider || fulfillmentProvider;
    fulfillmentCompletedAt = execution.completedAt ?? fulfillmentCompletedAt;
    const tracking = toRecord(providerPayload.tracking);
    if (execution.trackingNumber) tracking.number = execution.trackingNumber;
    if (execution.trackingUrl) tracking.url = execution.trackingUrl;
    providerPayload.tracking = tracking;
  }
  const fulfillment: FulfillmentDispatchPayload = {
    ...fulfillmentBase,
    id: fulfillmentId,
    status: fulfillmentStatus,
    provider: fulfillmentProvider,
    completedAt: fulfillmentCompletedAt,
    providerPayload,
  };
  const nextOrderStatus =
    fulfillment.status === "succeeded"
      ? "fulfilled"
      : textValue(values.orderstatus) || "paid";
  const nextFulfillmentStatus =
    fulfillment.status === "succeeded" ? "fulfilled" : "processing";

  return {
    fulfillment,
    values: {
      ...values,
      orderstatus: nextOrderStatus,
      fulfillmentstatus: nextFulfillmentStatus,
      fulfillmentcarrier: textValue(values.fulfillmentcarrier) || provider,
      fulfillmentdispatchstatus: fulfillment.status,
      fulfillmentprovider: fulfillment.provider,
      fulfillmentid: fulfillment.id,
      fulfillmentrequestedat: fulfillment.requestedAt,
      fulfillmentcompletedat: fulfillment.completedAt,
      ...(textValue(toRecord(providerPayload.tracking).number)
        ? {
            trackingnumber: textValue(
              toRecord(providerPayload.tracking).number,
            ),
          }
        : {}),
      ...(textValue(toRecord(providerPayload.tracking).url)
        ? { trackingurl: textValue(toRecord(providerPayload.tracking).url) }
        : {}),
      fulfillmentpayload: JSON.stringify(fulfillment.providerPayload, null, 2),
      ...(fulfillment.status === "succeeded"
        ? { fulfilledat: fulfillment.completedAt }
        : {}),
      notes: appendNote(
        values.notes,
        `Fulfillment dispatch ${executionUrl ? "executed" : "handoff prepared"} ${now} for ${fulfillment.provider} with id ${fulfillment.id}.`,
      ),
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "commerce.view",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, orderId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site)
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );

      const collection = await repositories.collections.getBySlug(
        site.id,
        ORDERS_COLLECTION_SLUG,
      );
      if (!collection)
        return errorResponse(
          404,
          "ORDER_QUEUE_NOT_FOUND",
          "Private order queue not found",
          requestId,
        );
      const commerceAccess = await requireCommerceCollectionAccess(
        request,
        requestId,
        collection.slug,
        "view",
      );
      if (commerceAccess) return commerceAccess;

      const record =
        (await repositories.collections.getRecordById(
          site.id,
          collection.id,
          orderId,
        )) ||
        (await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          orderId,
        ));
      if (!record)
        return errorResponse(
          404,
          "ORDER_NOT_FOUND",
          "Order not found",
          requestId,
        );

      return privateFulfillmentResponse(
        {
          success: true,
          requestId,
          data: { record, fulfillment: existingFulfillmentPayload(record) },
        },
        requestId,
        site.id,
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site)
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);

    const collection = getCollectionByIdOrSlug(
      site.id,
      ORDERS_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    if (!collection)
      return errorResponse(
        404,
        "ORDER_QUEUE_NOT_FOUND",
        "Private order queue not found",
        requestId,
      );
    const commerceAccess = await requireCommerceCollectionAccess(
      request,
      requestId,
      collection.slug,
      "view",
    );
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      orderId,
      { includeUnpublished: true },
    );
    if (!record)
      return errorResponse(
        404,
        "ORDER_NOT_FOUND",
        "Order not found",
        requestId,
      );

    return privateFulfillmentResponse(
      {
        success: true,
        requestId,
        data: { record, fulfillment: existingFulfillmentPayload(record) },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order fulfillment read API error:", error);
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
    permission: "commerce.edit",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, orderId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site)
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );

      const collection = await repositories.collections.getBySlug(
        site.id,
        ORDERS_COLLECTION_SLUG,
      );
      if (!collection)
        return errorResponse(
          404,
          "ORDER_QUEUE_NOT_FOUND",
          "Private order queue not found",
          requestId,
        );
      const commerceAccess = await requireCommerceCollectionAccess(
        request,
        requestId,
        collection.slug,
        "edit",
      );
      if (commerceAccess) return commerceAccess;

      const record =
        (await repositories.collections.getRecordById(
          site.id,
          collection.id,
          orderId,
        )) ||
        (await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          orderId,
        ));
      if (!record)
        return errorResponse(
          404,
          "ORDER_NOT_FOUND",
          "Order not found",
          requestId,
        );

      const settings = await repositories.settings.get();
      const result = await buildFulfillmentDispatch(
        record,
        body,
        requestId,
        settings,
      );
      if ("error" in result) {
        return errorResponse(
          result.error.status,
          result.error.code,
          result.error.message,
          requestId,
          result.error.details,
        );
      }

      const values = normalizeCollectionRecordMediaValues(
        collection,
        result.values,
      );
      const validationErrors = await validateRepositoryCollectionRecordValues({
        repository: repositories.collections,
        mediaRepository: repositories.media,
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
          "Fulfillment values are invalid",
          requestId,
          validationErrors,
        );
      }

      const updated = (
        await repositories.collections.updateRecord(
          site.id,
          collection.id,
          record.id,
          {
            values: toJsonRecord(values),
          },
        )
      ).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "collectionRecord",
          entityId: updated.id,
          reason: "order-fulfillment-dispatched",
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
        metadata: fulfillmentAuditMetadata(
          collection,
          updated,
          result.fulfillment,
        ),
        requestId,
      });
      await deliverOrderFulfillmentWebhook({
        repositories,
        site,
        collection,
        before: record,
        after: updated,
        fulfillment: result.fulfillment,
        requestId,
        actor: access.session?.user.id,
      });

      return privateFulfillmentResponse(
        {
          success: true,
          requestId,
          data: {
            record: updated,
            order: updated,
            fulfillment: result.fulfillment,
            cacheInvalidation,
          },
        },
        requestId,
        site.id,
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site)
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);

    const collection = getCollectionByIdOrSlug(
      site.id,
      ORDERS_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    if (!collection)
      return errorResponse(
        404,
        "ORDER_QUEUE_NOT_FOUND",
        "Private order queue not found",
        requestId,
      );
    const commerceAccess = await requireCommerceCollectionAccess(
      request,
      requestId,
      collection.slug,
      "edit",
    );
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      orderId,
      { includeUnpublished: true },
    );
    if (!record)
      return errorResponse(
        404,
        "ORDER_NOT_FOUND",
        "Order not found",
        requestId,
      );

    const result = await buildFulfillmentDispatch(
      record,
      body,
      requestId,
      getAdminSettings(),
    );
    if ("error" in result) {
      return errorResponse(
        result.error.status,
        result.error.code,
        result.error.message,
        requestId,
        result.error.details,
      );
    }

    const values = normalizeCollectionRecordMediaValues(
      collection as unknown as BackyCollection,
      result.values,
    );
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
        "Fulfillment values are invalid",
        requestId,
        validationErrors,
      );
    }

    const updated = updateAdminCollectionRecord(
      site.id,
      collection.id,
      record.id,
      { values },
    );
    if (!updated)
      return errorResponse(
        404,
        "ORDER_NOT_FOUND",
        "Order not found",
        requestId,
      );

    await recordAdminAudit({
      siteId: site.id,
      entity: "collectionRecord",
      entityId: updated.id,
      action: "update",
      before: collectionRecordAuditMetadata(collection, record),
      after: collectionRecordAuditMetadata(collection, updated),
      metadata: fulfillmentAuditMetadata(
        collection,
        updated,
        result.fulfillment,
      ),
      requestId,
    });
    await deliverOrderFulfillmentWebhook({
      site: site as unknown as Site,
      collection,
      before: record,
      after: updated,
      fulfillment: result.fulfillment,
      requestId,
      actor: access.session?.user.id,
    });

    return privateFulfillmentResponse(
      {
        success: true,
        requestId,
        data: {
          record: updated,
          order: updated,
          fulfillment: result.fulfillment,
        },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order fulfillment dispatch API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
