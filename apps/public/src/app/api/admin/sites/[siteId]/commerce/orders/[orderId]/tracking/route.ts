/**
 * Admin commerce order tracking refresh endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/tracking
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/tracking
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

interface TrackingPayload {
  status: string;
  provider: string;
  trackingNumber: string;
  trackingUrl: string;
  checkedAt: string;
  providerPayload?: Record<string, unknown>;
}

type TrackingUpdateResult =
  | { tracking: TrackingPayload; values: Record<string, unknown> }
  | {
      error: {
        status: number;
        code: string;
        message: string;
        details?: unknown;
      };
    };

const ORDERS_COLLECTION_SLUG = "orders";
const TRACKING_SCHEMA_VERSION = "backy.tracking.v1";

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
      schemaVersion: TRACKING_SCHEMA_VERSION,
    },
  );

const privateTrackingResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: TRACKING_SCHEMA_VERSION,
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

const trackingAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  tracking: TrackingPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  trackingStatus: tracking.status,
  provider: tracking.provider,
  trackingNumber: tracking.trackingNumber,
  trackingUrl: tracking.trackingUrl,
  checkedAt: tracking.checkedAt,
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
    trackingStatus: textValue(values.trackingstatus),
    trackingNumber: textValue(values.trackingnumber),
    trackingUrl: textValue(values.trackingurl),
    fulfillmentCarrier: textValue(values.fulfillmentcarrier),
  };
};

const trackingWebhookSnapshot = (
  tracking: TrackingPayload,
): BackyJsonObject => ({
  status: tracking.status,
  provider: tracking.provider,
  trackingNumber: tracking.trackingNumber,
  trackingUrl: tracking.trackingUrl,
  checkedAt: tracking.checkedAt,
});

const deliverOrderTrackingWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  before: CollectionRecordAuditSource;
  after: CollectionRecordAuditSource;
  tracking: TrackingPayload;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "commerce.order.tracking_refreshed",
    data: {
      resourceType: "collectionRecord",
      before: orderRecordWebhookSnapshot(params.collection, params.before),
      after: orderRecordWebhookSnapshot(params.collection, params.after),
      tracking: trackingWebhookSnapshot(params.tracking),
    },
    metadata: {
      action: "commerce.order.tracking_refreshed",
      changedKeys: ["content", "collections", "commerce"],
      source: "admin-commerce-order-tracking-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      orderId: params.after.id,
      orderSlug: params.after.slug,
      provider: params.tracking.provider,
      trackingStatus: params.tracking.status,
      trackingNumber: params.tracking.trackingNumber,
    },
  });

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const easyPostApiKey = () =>
  process.env.BACKY_EASYPOST_API_KEY?.trim() ||
  process.env.EASYPOST_API_KEY?.trim() ||
  "";

const easyPostApiBaseUrl = () =>
  (
    process.env.BACKY_EASYPOST_API_BASE_URL?.trim() ||
    process.env.EASYPOST_API_BASE_URL?.trim() ||
    "https://api.easypost.com/v2"
  ).replace(/\/$/, "");

const shippoApiKey = () =>
  process.env.BACKY_SHIPPO_API_KEY?.trim() ||
  process.env.SHIPPO_API_KEY?.trim() ||
  "";

const shippoApiBaseUrl = () =>
  (
    process.env.BACKY_SHIPPO_API_BASE_URL?.trim() ||
    process.env.SHIPPO_API_BASE_URL?.trim() ||
    "https://api.goshippo.com"
  ).replace(/\/$/, "");

const normalizeProviderKey = (value: string): string =>
  value.toLowerCase().replace(/[\s_-]+/g, "");

const commerceSettingsFromSettings = (
  settings: unknown,
): Record<string, unknown> =>
  toRecord(toRecord(toRecord(settings).integrations).commerce);

const resolvedTrackingProvider = (
  body: Record<string, unknown>,
  values: Record<string, unknown>,
  settings: unknown,
): string => {
  const commerce = commerceSettingsFromSettings(settings);
  return (
    textValue(body.executionProvider) ||
    textValue(body.trackingProvider) ||
    textValue(body.provider) ||
    textValue(values.shippinglabelprovider) ||
    textValue(commerce.shippingLabelProvider) ||
    textValue(values.fulfillmentcarrier) ||
    "manual"
  );
};

const shouldExecuteEasyPostTracking = (provider: string): boolean =>
  Boolean(easyPostApiKey()) && normalizeProviderKey(provider) === "easypost";

const shouldExecuteShippoTracking = (provider: string): boolean =>
  Boolean(shippoApiKey()) && normalizeProviderKey(provider) === "shippo";

const safeEasyPostTrackerPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  mode: textValue(value.mode),
  status: textValue(value.status),
  carrier: textValue(value.carrier),
  trackingCode: textValue(value.tracking_code),
  publicUrl: textValue(value.public_url),
  signedBy: textValue(value.signed_by),
  estDeliveryDate: textValue(value.est_delivery_date),
  createdAt: textValue(value.created_at),
  updatedAt: textValue(value.updated_at),
});

const safeEasyPostErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    message:
      textValue(error.message) ||
      textValue(value.message) ||
      "EasyPost tracking refresh failed.",
    errors: Array.isArray(error.errors) ? error.errors.slice(0, 5) : [],
  };
};

const easyPostHeaders = () => ({
  authorization: `Basic ${Buffer.from(`${easyPostApiKey()}:`).toString("base64")}`,
  "content-type": "application/json",
});

const shippoHeaders = () => ({
  authorization: `ShippoToken ${shippoApiKey()}`,
  "content-type": "application/json",
});

const executeEasyPostTracking = async (input: {
  trackingNumber: string;
  carrier: string;
}): Promise<{
  ok: boolean;
  payload: Record<string, unknown>;
  tracking?: Partial<TrackingPayload>;
}> => {
  const response = await fetch(`${easyPostApiBaseUrl()}/trackers`, {
    method: "POST",
    headers: easyPostHeaders(),
    body: JSON.stringify({
      tracker: {
        tracking_code: input.trackingNumber,
        ...(input.carrier ? { carrier: input.carrier } : {}),
      },
    }),
    cache: "no-store",
  });
  const payload = toRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: "backy.tracking.v1",
        provider: "easypost",
        action: "trackers.create",
        executionMode: "easypost-api",
        error: safeEasyPostErrorPayload(payload),
      },
    };
  }

  const tracker = safeEasyPostTrackerPayload(payload);
  return {
    ok: true,
    payload: {
      schemaVersion: "backy.tracking.v1",
      provider: "easypost",
      action: "trackers.create",
      executionMode: "easypost-api",
      tracker,
    },
    tracking: {
      status: tracker.status || "unknown",
      provider: tracker.carrier || input.carrier || "easypost",
      trackingUrl: tracker.publicUrl,
    },
  };
};

const safeShippoTrackingStatusPayload = (value: unknown) => {
  const status = toRecord(value);
  return {
    objectCreated: textValue(status.object_created),
    objectUpdated: textValue(status.object_updated),
    objectId: textValue(status.object_id),
    status: textValue(status.status),
    statusDetails: textValue(status.status_details),
    statusDate: textValue(status.status_date),
    location: toRecord(status.location),
  };
};

const safeShippoTrackingPayload = (value: Record<string, unknown>) => ({
  carrier: textValue(value.carrier),
  trackingNumber: textValue(value.tracking_number),
  addressFrom: toRecord(value.address_from),
  addressTo: toRecord(value.address_to),
  eta: textValue(value.eta),
  originalEta: textValue(value.original_eta),
  servicelevel: toRecord(value.servicelevel),
  trackingStatus: safeShippoTrackingStatusPayload(value.tracking_status),
  trackingHistory: Array.isArray(value.tracking_history)
    ? value.tracking_history.slice(0, 12).map(safeShippoTrackingStatusPayload)
    : [],
});

const safeShippoErrorPayload = (value: Record<string, unknown>) => ({
  code: textValue(value.code),
  message:
    textValue(value.message || value.detail || value.error) ||
    "Shippo tracking refresh failed.",
});

const executeShippoTracking = async (input: {
  trackingNumber: string;
  carrier: string;
}): Promise<{
  ok: boolean;
  payload: Record<string, unknown>;
  tracking?: Partial<TrackingPayload>;
}> => {
  const carrier = input.carrier || "shippo";
  const pathCarrier = encodeURIComponent(carrier);
  const pathTrackingNumber = encodeURIComponent(input.trackingNumber);
  const response = await fetch(
    `${shippoApiBaseUrl()}/tracks/${pathCarrier}/${pathTrackingNumber}`,
    {
      method: "GET",
      headers: shippoHeaders(),
      cache: "no-store",
    },
  );
  const payload = toRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: "backy.tracking.v1",
        provider: "shippo",
        action: "tracks.get",
        executionMode: "shippo-api",
        error: safeShippoErrorPayload(payload),
      },
    };
  }

  const tracker = safeShippoTrackingPayload(payload);
  const status = textValue(tracker.trackingStatus.status).toLowerCase();
  return {
    ok: true,
    payload: {
      schemaVersion: "backy.tracking.v1",
      provider: "shippo",
      action: "tracks.get",
      executionMode: "shippo-api",
      tracker,
    },
    tracking: {
      status: status || "unknown",
      provider: tracker.carrier || carrier,
    },
  };
};

const existingTrackingPayload = (
  record: CollectionRecordAuditSource,
): TrackingPayload | null => {
  const values = toRecord(record.values);
  const trackingNumber = textValue(values.trackingnumber);
  if (!trackingNumber) return null;
  return {
    status:
      textValue(values.trackingstatus) ||
      textValue(values.fulfillmentstatus) ||
      "unknown",
    provider: textValue(values.fulfillmentcarrier) || "manual",
    trackingNumber,
    trackingUrl: textValue(values.trackingurl),
    checkedAt:
      textValue(values.trackinglastcheckedat) ||
      record.updatedAt ||
      new Date().toISOString(),
  };
};

const buildTrackingUpdate = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  settings: unknown,
): Promise<TrackingUpdateResult> => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const commerce = commerceSettingsFromSettings(settings);
  const trackingNumber =
    textValue(body.trackingNumber) || textValue(values.trackingnumber);
  if (!trackingNumber) {
    return {
      error: {
        status: 400,
        code: "TRACKING_NUMBER_REQUIRED",
        message:
          "A tracking number is required before tracking can be refreshed.",
      },
    };
  }

  let provider = resolvedTrackingProvider(body, values, settings);
  const carrier =
    textValue(body.carrier) ||
    textValue(body.shippingCarrier) ||
    textValue(values.fulfillmentcarrier) ||
    textValue(values.shippinglabelprovider) ||
    textValue(commerce.shippingDefaultCarrier) ||
    provider;
  const trackingUrl =
    textValue(body.trackingUrl) || textValue(values.trackingurl);
  let status =
    textValue(values.trackingstatus) ||
    textValue(values.fulfillmentstatus) ||
    "processing";
  let providerPayload: Record<string, unknown> = {
    schemaVersion: "backy.tracking.v1",
    provider,
    action: "provider.tracking.refresh",
    executionMode: "handoff",
    trackingNumber,
  };

  if (shouldExecuteEasyPostTracking(provider)) {
    const result = await executeEasyPostTracking({ trackingNumber, carrier });
    providerPayload = result.payload;
    if (result.ok && result.tracking) {
      status = result.tracking.status || status;
      provider = result.tracking.provider || provider;
    } else {
      status = "refresh_failed";
    }
  } else if (shouldExecuteShippoTracking(provider)) {
    const result = await executeShippoTracking({ trackingNumber, carrier });
    providerPayload = result.payload;
    if (result.ok && result.tracking) {
      status = result.tracking.status || status;
      provider = result.tracking.provider || provider;
    } else {
      status = "refresh_failed";
    }
  } else {
    status = status === "unfulfilled" ? "processing" : status;
  }

  const normalizedStatus = status.toLowerCase();
  const isDelivered = normalizedStatus === "delivered";
  const nextFulfillmentStatus = isDelivered
    ? "fulfilled"
    : textValue(values.fulfillmentstatus) === "unfulfilled"
      ? "processing"
      : textValue(values.fulfillmentstatus) || "processing";
  const nextOrderStatus =
    isDelivered && textValue(values.paymentstatus) === "paid"
      ? "fulfilled"
      : textValue(values.orderstatus) || "open";
  const nextFulfilledAt = isDelivered
    ? textValue(values.fulfilledat) || now
    : textValue(values.fulfilledat) || null;
  const tracking: TrackingPayload = {
    status,
    provider,
    trackingNumber,
    trackingUrl:
      (providerPayload.tracker && typeof providerPayload.tracker === "object"
        ? textValue(
            (providerPayload.tracker as Record<string, unknown>).publicUrl,
          )
        : "") || trackingUrl,
    checkedAt: now,
    providerPayload,
  };

  return {
    tracking,
    values: {
      ...values,
      orderstatus: nextOrderStatus,
      fulfillmentstatus: nextFulfillmentStatus,
      fulfillmentcarrier: provider,
      trackingnumber: tracking.trackingNumber,
      trackingurl: tracking.trackingUrl,
      trackingstatus: tracking.status,
      trackinglastcheckedat: tracking.checkedAt,
      fulfilledat: nextFulfilledAt,
      notes: appendNote(
        values.notes,
        `Tracking refreshed ${now} for ${tracking.provider} ${tracking.trackingNumber}: ${tracking.status}.`,
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

      return privateTrackingResponse(
        {
          success: true,
          requestId,
          data: { record, tracking: existingTrackingPayload(record) },
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

    return privateTrackingResponse(
      {
        success: true,
        requestId,
        data: { record, tracking: existingTrackingPayload(record) },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order tracking read API error:", error);
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
      const result = await buildTrackingUpdate(record, body, settings);
      if ("error" in result)
        return errorResponse(
          result.error.status,
          result.error.code,
          result.error.message,
          requestId,
        );

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
          "Tracking values are invalid",
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
          reason: "order-tracking-refreshed",
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
        metadata: trackingAuditMetadata(collection, updated, result.tracking),
        requestId,
      });
      await deliverOrderTrackingWebhook({
        repositories,
        site,
        collection,
        before: record,
        after: updated,
        tracking: result.tracking,
        requestId,
        actor: access.session?.user.id,
      });

      return privateTrackingResponse(
        {
          success: true,
          requestId,
          data: {
            record: updated,
            order: updated,
            tracking: result.tracking,
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

    const result = await buildTrackingUpdate(record, body, getAdminSettings());
    if ("error" in result)
      return errorResponse(
        result.error.status,
        result.error.code,
        result.error.message,
        requestId,
      );

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
        "Tracking values are invalid",
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
      metadata: trackingAuditMetadata(collection, updated, result.tracking),
      requestId,
    });
    await deliverOrderTrackingWebhook({
      site: site as unknown as Site,
      collection,
      before: record,
      after: updated,
      tracking: result.tracking,
      requestId,
      actor: access.session?.user.id,
    });

    return privateTrackingResponse(
      {
        success: true,
        requestId,
        data: { record: updated, order: updated, tracking: result.tracking },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order tracking refresh API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
