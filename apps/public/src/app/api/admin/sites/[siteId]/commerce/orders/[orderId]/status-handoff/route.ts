/**
 * Admin commerce order customer-status handoff endpoint.
 *
 * GET /api/admin/sites/[siteId]/commerce/orders/[orderId]/status-handoff
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
} from "@/lib/backyStore";
import { requireAdminAccess } from "@/lib/adminAccess";
import { requireCommerceCollectionAccess } from "@/lib/adminCommerceCollectionAccess";
import { publicContractJson } from "@/lib/publicContractResponse";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    orderId: string;
  }>;
}

type OrderStatusHandoffStatus = "ready" | "attention" | "blocked";
type OrderWorkflowStatus = "open" | "paid" | "fulfilled" | "cancelled" | "refunded";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type FulfillmentStatus = "unfulfilled" | "processing" | "fulfilled" | "cancelled";
type ShippingLabelStatus = "none" | "draft" | "purchased" | "voided";
type ProviderRefundStatus =
  | "none"
  | "requested"
  | "succeeded"
  | "failed"
  | "requires_action";
type OrderOperationActionKey =
  | "refresh-quote"
  | "prepare-label"
  | "refresh-tracking"
  | "dispatch-fulfillment"
  | "provider-refund"
  | "refresh-provider-refund";

interface HandoffRecord {
  id: string;
  slug: string;
  status: string;
  values?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface HandoffCollection {
  id: string;
  slug: string;
  name?: string;
  status?: string;
  permissions?: {
    publicRead?: boolean;
    publicCreate?: boolean;
    publicUpdate?: boolean;
    publicDelete?: boolean;
  } | null;
}

const ORDERS_COLLECTION_SLUG = "orders";
const CUSTOMERS_COLLECTION_SLUG = "customers";
const ORDER_STATUS_HANDOFF_SCHEMA_VERSION = "backy.order-status-handoff.v1";

const ORDER_STATUSES: OrderWorkflowStatus[] = [
  "open",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
  "pending",
  "paid",
  "failed",
  "refunded",
];
const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "unfulfilled",
  "processing",
  "fulfilled",
  "cancelled",
];
const SHIPPING_LABEL_STATUSES: ShippingLabelStatus[] = [
  "none",
  "draft",
  "purchased",
  "voided",
];
const PROVIDER_REFUND_STATUSES: ProviderRefundStatus[] = [
  "none",
  "requested",
  "succeeded",
  "failed",
  "requires_action",
];

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  publicContractJson(
    { success: false, requestId, error: { code, message }, errorMessage: message },
    {
      status,
      requestId,
      cache: "error",
      schemaVersion: ORDER_STATUS_HANDOFF_SCHEMA_VERSION,
    },
  );

const privateStatusHandoffResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: ORDER_STATUS_HANDOFF_SCHEMA_VERSION,
    siteId,
  });

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed * 100) / 100)
    : fallback;
};

const normalizeCurrency = (value: unknown): string => {
  const currency = textValue(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
};

const statusValue = <T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T,
): T => {
  const normalized = textValue(value).toLowerCase();
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
};

const camelizeOrderKey = (key: string): string =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const readOrderValue = (
  values: Record<string, unknown>,
  normalizedKey: string,
  fallback: unknown = "",
): unknown => values[normalizedKey] ?? values[camelizeOrderKey(normalizedKey)] ?? fallback;

const maskCustomerEmail = (email: string): string => {
  const trimmed = email.trim();
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return "";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

const maskCustomerPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `${digits.length > 4 ? "***-" : ""}${digits.slice(-4)}`;
};

const parseLineItemCount = (value: unknown): number => {
  const raw = typeof value === "string" ? value.trim() : value;
  if (!raw) return 0;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.length;
    if (toRecord(parsed).items && Array.isArray(toRecord(parsed).items)) {
      return (toRecord(parsed).items as unknown[]).length;
    }
  } catch {
    if (typeof raw === "string") {
      return raw.split(/\n+/).filter((line) => line.trim()).length;
    }
  }
  return 0;
};

const ordersApiReady = (collection: HandoffCollection): boolean => {
  const permissions = collection.permissions || {};
  return Boolean(
    collection.status === "published" &&
      !permissions.publicRead &&
      !permissions.publicCreate &&
      !permissions.publicUpdate &&
      !permissions.publicDelete,
  );
};

const summarizeStatus = (
  checks: Array<{ status: OrderStatusHandoffStatus }>,
): OrderStatusHandoffStatus => {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "attention")) return "attention";
  return "ready";
};

const endpointFor = (origin: string, path: string): string =>
  `${origin.replace(/\/$/, "")}${path}`;

const buildActionPlan = (
  values: Record<string, unknown>,
): Record<string, unknown> => {
  const paymentStatus = statusValue(
    readOrderValue(values, "paymentstatus"),
    PAYMENT_STATUSES,
    "pending",
  );
  const fulfillmentStatus = statusValue(
    readOrderValue(values, "fulfillmentstatus"),
    FULFILLMENT_STATUSES,
    "unfulfilled",
  );
  const shippingLabelStatus = statusValue(
    readOrderValue(values, "shippinglabelstatus"),
    SHIPPING_LABEL_STATUSES,
    "none",
  );
  const providerRefundStatus = statusValue(
    readOrderValue(values, "providerrefundstatus"),
    PROVIDER_REFUND_STATUSES,
    "none",
  );
  const trackingNumber = textValue(readOrderValue(values, "trackingnumber"));
  const shippingLabelReferencePresent = Boolean(
    textValue(readOrderValue(values, "shippinglabelid")) ||
      textValue(readOrderValue(values, "shippinglabelurl")),
  );
  const providerRefundReferencePresent = Boolean(
    textValue(readOrderValue(values, "providerrefundid")) ||
      textValue(readOrderValue(values, "providerrefundreference")),
  );

  const actions = [
    {
      key: "refresh-quote",
      label: "Refresh Quote",
      enabled: paymentStatus !== "refunded",
      executionMode: "provider-ready",
      reason: "Recalculate subtotal, tax, shipping, discount, and total from private order values.",
    },
    {
      key: "prepare-label",
      label: "Prepare Label",
      enabled:
        paymentStatus === "paid" &&
        fulfillmentStatus !== "fulfilled" &&
        fulfillmentStatus !== "cancelled" &&
        !(shippingLabelReferencePresent && shippingLabelStatus !== "voided"),
      executionMode: "provider-ready",
      reason: shippingLabelReferencePresent
        ? "A shipping label reference is already present."
        : "Create or hand off a shipping label for the paid order.",
    },
    {
      key: "refresh-tracking",
      label: "Refresh Tracking",
      enabled:
        fulfillmentStatus !== "cancelled" &&
        Boolean(trackingNumber || shippingLabelReferencePresent),
      executionMode: "provider-ready",
      reason:
        trackingNumber || shippingLabelReferencePresent
          ? "Refresh carrier/customer-visible tracking state."
          : "Add tracking or a shipping label reference before refreshing tracking.",
    },
    {
      key: "dispatch-fulfillment",
      label: "Dispatch Fulfillment",
      enabled:
        paymentStatus === "paid" &&
        fulfillmentStatus !== "fulfilled" &&
        fulfillmentStatus !== "cancelled",
      executionMode: "manual-handoff",
      reason: "Send the paid order to warehouse, 3PL, or manual fulfillment.",
    },
    {
      key: "provider-refund",
      label: "Provider Refund",
      enabled:
        paymentStatus !== "pending" &&
        paymentStatus !== "failed" &&
        (!providerRefundReferencePresent ||
          providerRefundStatus === "failed" ||
          providerRefundStatus === "requires_action"),
      executionMode: "provider-ready",
      reason: providerRefundReferencePresent
        ? "Retry or complete the existing provider refund."
        : "Create a provider refund handoff for a paid/refunded order.",
    },
    {
      key: "refresh-provider-refund",
      label: "Refresh Provider Refund",
      enabled:
        providerRefundReferencePresent && providerRefundStatus !== "succeeded",
      executionMode: "provider-ready",
      reason: providerRefundReferencePresent
        ? "Refresh the existing provider refund status."
        : "Request a provider refund before refreshing provider status.",
    },
  ];
  const recommendedAction: OrderOperationActionKey | "none" =
    paymentStatus === "paid" &&
    fulfillmentStatus === "unfulfilled" &&
    !shippingLabelReferencePresent
      ? "prepare-label"
      : Boolean(trackingNumber || shippingLabelReferencePresent) &&
          fulfillmentStatus !== "fulfilled" &&
          fulfillmentStatus !== "cancelled"
        ? "refresh-tracking"
        : providerRefundStatus === "failed" ||
            providerRefundStatus === "requires_action"
          ? "provider-refund"
          : "none";
  const enabledActions = actions.filter((action) => action.enabled);

  return {
    schemaVersion: "backy.order-operation-action-plan.v1",
    attention:
      recommendedAction !== "none" ||
      providerRefundStatus === "requested" ||
      providerRefundStatus === "failed" ||
      providerRefundStatus === "requires_action",
    recommendedAction,
    recommendation:
      recommendedAction === "prepare-label"
        ? "Prepare a shipping label or fulfillment handoff before promising tracking."
        : recommendedAction === "refresh-tracking"
          ? "Refresh tracking before sending a customer status update."
          : recommendedAction === "provider-refund"
            ? "Resolve the provider refund before finalizing the customer status."
            : "No immediate order operation is required for this customer-safe status handoff.",
    handoffRequired: actions.some(
      (action) => action.enabled && action.executionMode === "manual-handoff",
    ),
    executableNow: enabledActions.length > 0,
    availableActions: actions,
  };
};

const buildStatusHandoff = (params: {
  origin: string;
  siteId: string;
  collection: HandoffCollection;
  order: HandoffRecord;
  customerProfile: HandoffRecord | null;
}) => {
  const { origin, siteId, collection, order, customerProfile } = params;
  const values = toRecord(order.values);
  const ready = ordersApiReady(collection);
  const currency = normalizeCurrency(readOrderValue(values, "currency", "USD"));
  const orderNumber = textValue(readOrderValue(values, "ordernumber")) || order.slug;
  const customerName = textValue(readOrderValue(values, "customername"));
  const email = textValue(readOrderValue(values, "email"));
  const phone = textValue(readOrderValue(values, "phone"));
  const orderStatus = statusValue(
    readOrderValue(values, "orderstatus"),
    ORDER_STATUSES,
    "open",
  );
  const paymentStatus = statusValue(
    readOrderValue(values, "paymentstatus"),
    PAYMENT_STATUSES,
    "pending",
  );
  const fulfillmentStatus = statusValue(
    readOrderValue(values, "fulfillmentstatus"),
    FULFILLMENT_STATUSES,
    "unfulfilled",
  );
  const trackingNumber = textValue(readOrderValue(values, "trackingnumber"));
  const trackingUrl = textValue(readOrderValue(values, "trackingurl"));
  const fulfillmentCarrier = textValue(readOrderValue(values, "fulfillmentcarrier"));
  const providerRefundStatus = statusValue(
    readOrderValue(values, "providerrefundstatus"),
    PROVIDER_REFUND_STATUSES,
    "none",
  );
  const refundAmountValue = readOrderValue(values, "refundamount", null);
  const refundAmount =
    refundAmountValue === null || refundAmountValue === undefined
      ? null
      : numberValue(refundAmountValue);
  const shippingLabelReferencePresent = Boolean(
    textValue(readOrderValue(values, "shippinglabelid")) ||
      textValue(readOrderValue(values, "shippinglabelurl")),
  );
  const providerRefundReferencePresent = Boolean(
    textValue(readOrderValue(values, "providerrefundid")) ||
      textValue(readOrderValue(values, "providerrefundreference")),
  );
  const isClosed =
    orderStatus === "cancelled" ||
    orderStatus === "refunded" ||
    paymentStatus === "refunded";
  const itemCount = parseLineItemCount(readOrderValue(values, "items"));
  const actionPlan = buildActionPlan(values);
  const checks = [
    {
      key: "selected-order",
      label: "Selected order",
      status: "ready" as const,
      detail: `${orderNumber} is selected with ${itemCount} line item${itemCount === 1 ? "" : "s"} and ${numberValue(readOrderValue(values, "total"))} ${currency} total.`,
    },
    {
      key: "customer-contact",
      label: "Customer contact",
      status: email && customerName ? ("ready" as const) : ("blocked" as const),
      detail:
        email && customerName
          ? `${maskCustomerEmail(email)} can receive customer-safe status updates.`
          : "Customer name and email are required before customer status can be projected.",
    },
    {
      key: "payment-status",
      label: "Payment status",
      status:
        paymentStatus === "failed"
          ? ("blocked" as const)
          : paymentStatus === "pending"
            ? ("attention" as const)
            : ("ready" as const),
      detail:
        paymentStatus === "paid"
          ? "Payment is paid and the customer status view can proceed to fulfillment state."
          : paymentStatus === "refunded"
            ? "Payment is refunded and the customer status view can show the order as closed."
            : paymentStatus === "failed"
              ? "Payment failed; customer status should direct the buyer to support or retry flow."
              : "Payment is still pending; keep the customer status view in a checkout-confirmation state.",
    },
    {
      key: "fulfillment-tracking",
      label: "Fulfillment and tracking",
      status:
        isClosed ||
        fulfillmentStatus === "fulfilled" ||
        trackingNumber ||
        trackingUrl
          ? ("ready" as const)
          : paymentStatus === "paid" || fulfillmentStatus === "processing"
            ? ("attention" as const)
            : ("ready" as const),
      detail: isClosed
        ? "Order is closed; customer status can show cancellation or refund state."
        : fulfillmentStatus === "fulfilled"
          ? "Fulfillment is complete; tracking is optional for digital or pickup orders."
          : trackingNumber || trackingUrl
            ? "Tracking details are present while fulfillment continues."
            : paymentStatus === "paid"
              ? "Paid order still needs fulfillment or tracking metadata."
              : "Tracking will become available after payment and fulfillment progress.",
    },
    {
      key: "refund-status",
      label: "Refund and return",
      status:
        providerRefundStatus === "failed" ||
        providerRefundStatus === "requires_action"
          ? ("blocked" as const)
          : providerRefundStatus === "requested"
            ? ("attention" as const)
            : ("ready" as const),
      detail:
        providerRefundStatus === "succeeded" ||
        paymentStatus === "refunded" ||
        (refundAmount || 0) > 0
          ? "Refund or return metadata is present for customer support."
          : providerRefundStatus === "requested"
            ? "Provider refund is requested and should be refreshed before promising a final customer state."
            : providerRefundStatus === "failed" ||
                providerRefundStatus === "requires_action"
              ? "Provider refund needs operator action before customer-facing status is final."
              : "No refund or return is active for this order.",
    },
    {
      key: "private-order-queue",
      label: "Customer portal safety",
      status: ready ? ("ready" as const) : ("blocked" as const),
      detail: ready
        ? "Raw order collection access is blocked; this handoff only exposes a bounded customer-safe projection."
        : "Orders collection privacy or schema readiness needs repair before customer status projection.",
    },
  ];
  const status = summarizeStatus(checks);
  const readyCount = checks.filter((check) => check.status === "ready").length;
  const nextSteps = checks
    .filter((check) => check.status !== "ready")
    .map((check) => check.detail)
    .slice(0, 4);
  const adminOrderBase = `/api/admin/sites/${encodeURIComponent(siteId)}/commerce/orders/${encodeURIComponent(order.id)}`;

  return {
    schemaVersion: ORDER_STATUS_HANDOFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: "admin-order-status-handoff-api",
    status,
    score: Math.round((readyCount / checks.length) * 100),
    selectedSiteId: siteId,
    order: {
      id: order.id,
      slug: order.slug,
      orderNumber,
      recordStatus: order.status,
      total: numberValue(readOrderValue(values, "total")),
      currency,
      itemCount,
      orderStatus,
      paymentStatus,
      fulfillmentStatus,
      createdAt: order.createdAt || "",
      updatedAt: order.updatedAt || "",
    },
    customer: {
      displayName: customerName,
      maskedEmail: maskCustomerEmail(email),
      maskedPhone: maskCustomerPhone(phone),
      customerProfileLinked: Boolean(
        customerProfile || textValue(readOrderValue(values, "customerid")),
      ),
      customerProfileSlug: customerProfile?.slug || "",
      customerProfileStatus: textValue(customerProfile?.values?.status),
    },
    tracking: {
      carrier: fulfillmentCarrier,
      trackingNumber,
      trackingUrl,
      trackingStatus: textValue(readOrderValue(values, "trackingstatus")),
      trackingLastCheckedAt: textValue(
        readOrderValue(values, "trackinglastcheckedat"),
      ),
      fulfilledAt: textValue(readOrderValue(values, "fulfilledat")),
      shippingLabelStatus: statusValue(
        readOrderValue(values, "shippinglabelstatus"),
        SHIPPING_LABEL_STATUSES,
        "none",
      ),
      shippingLabelProvider: textValue(
        readOrderValue(values, "shippinglabelprovider"),
      ),
      shippingLabelReferencePresent,
    },
    refund: {
      refundAmount,
      refundReasonPresent: Boolean(textValue(readOrderValue(values, "refundreason"))),
      providerRefundStatus,
      providerRefundProvider: textValue(
        readOrderValue(values, "providerrefundprovider"),
      ),
      providerRefundReferencePresent,
      providerRefundRequestedAt: textValue(
        readOrderValue(values, "providerrefundrequestedat"),
      ),
      providerRefundCompletedAt: textValue(
        readOrderValue(values, "providerrefundcompletedat"),
      ),
    },
    endpoints: {
      checkoutIntake: endpointFor(origin, `/api/sites/${encodeURIComponent(siteId)}/commerce/orders`),
      adminStatusHandoff: endpointFor(origin, `${adminOrderBase}/status-handoff`),
      adminTracking: endpointFor(origin, `${adminOrderBase}/tracking`),
      adminProviderRefund: endpointFor(origin, `${adminOrderBase}/provider-refund`),
    },
    privacy: {
      publicCollectionReadBlocked: ready,
      customerSafeFieldsOnly: true,
      includesRawCustomerContact: false,
      includesProviderExecutionIds: false,
      includesPaymentReferences: false,
      includesAddresses: false,
      includesInternalNotes: false,
      excludedFields: [
        "email",
        "phone",
        "customerid",
        "checkoutsessionid",
        "shippingaddress",
        "billingaddress",
        "notes",
        "paymentreference",
        "shippinglabelid",
        "shippinglabelurl",
        "fulfillmentid",
        "fulfillmentpayload",
        "providerrefundid",
        "providerrefundreference",
        "providerrefundpayload",
      ],
    },
    actionPlan,
    checks,
    nextSteps: nextSteps.length
      ? nextSteps
      : [
          "Customer status handoff is ready for order confirmation, tracking, refund, and support views.",
        ],
  };
};

const findRepositoryCustomerProfile = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  values: Record<string, unknown>,
): Promise<HandoffRecord | null> => {
  const customerId = textValue(readOrderValue(values, "customerid"));
  if (!customerId) return null;
  const collection = await repositories.collections.getBySlug(
    siteId,
    CUSTOMERS_COLLECTION_SLUG,
  );
  if (!collection) return null;
  const record =
    (await repositories.collections.getRecordById(siteId, collection.id, customerId)) ||
    (await repositories.collections.getRecordBySlug(siteId, collection.id, customerId));
  return record ? (record as HandoffRecord) : null;
};

const findDemoCustomerProfile = (
  siteId: string,
  values: Record<string, unknown>,
): HandoffRecord | null => {
  const customerId = textValue(readOrderValue(values, "customerid"));
  if (!customerId) return null;
  const collection = getCollectionByIdOrSlug(siteId, CUSTOMERS_COLLECTION_SLUG, {
    includeUnpublished: true,
  });
  if (!collection) return null;
  const record = getCollectionRecordByIdOrSlug(siteId, collection.id, customerId, {
    includeUnpublished: true,
  });
  return record ? (record as HandoffRecord) : null;
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
        return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);

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

      const order =
        (await repositories.collections.getRecordById(site.id, collection.id, orderId)) ||
        (await repositories.collections.getRecordBySlug(site.id, collection.id, orderId));
      if (!order)
        return errorResponse(404, "ORDER_NOT_FOUND", "Order not found", requestId);

      const customerProfile = await findRepositoryCustomerProfile(
        repositories,
        site.id,
        toRecord(order.values),
      );
      const statusHandoff = buildStatusHandoff({
        origin: request.nextUrl.origin,
        siteId: site.id,
        collection: collection as HandoffCollection,
        order: order as HandoffRecord,
        customerProfile,
      });

      return privateStatusHandoffResponse(
        {
          success: true,
          requestId,
          data: {
            site: { id: site.id, slug: site.slug, name: site.name },
            collection: {
              id: collection.id,
              slug: collection.slug,
              name: collection.name,
            },
            statusHandoff,
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
      "view",
    );
    if (commerceAccess) return commerceAccess;

    const order = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      orderId,
      { includeUnpublished: true },
    );
    if (!order)
      return errorResponse(404, "ORDER_NOT_FOUND", "Order not found", requestId);

    const statusHandoff = buildStatusHandoff({
      origin: request.nextUrl.origin,
      siteId: site.id,
      collection: collection as HandoffCollection,
      order: order as HandoffRecord,
      customerProfile: findDemoCustomerProfile(site.id, toRecord(order.values)),
    });

    return privateStatusHandoffResponse(
      {
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          collection: {
            id: collection.id,
            slug: collection.slug,
            name: collection.name,
          },
          statusHandoff,
        },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order status handoff API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
