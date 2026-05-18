/**
 * Admin commerce order provider-refund handoff endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund
 * PATCH /api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund
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

interface ProviderRefundPayload {
  id: string;
  status: "requested" | "succeeded" | "failed" | "requires_action";
  provider: string;
  reference: string;
  amount: number;
  currency: string;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload: Record<string, unknown>;
}

const ORDERS_COLLECTION_SLUG = "orders";
const PROVIDER_REFUND_SCHEMA_VERSION = "backy.provider-refund.v1";
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

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
      schemaVersion: PROVIDER_REFUND_SCHEMA_VERSION,
    },
  );

const privateProviderRefundResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: PROVIDER_REFUND_SCHEMA_VERSION,
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
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed * 100) / 100)
    : fallback;
};

const commerceSettingsFromSettings = (
  settings: unknown,
): Record<string, unknown> =>
  toRecord(toRecord(toRecord(settings).integrations).commerce);

const resolvedRefundProvider = (
  body: Record<string, unknown>,
  values: Record<string, unknown>,
  settings: unknown,
): string => {
  const commerce = commerceSettingsFromSettings(settings);
  return (
    textValue(body.provider) ||
    textValue(values.paymentprovider) ||
    textValue(commerce.paymentProvider) ||
    "manual"
  ).toLowerCase();
};

const stripeSecretKey = () =>
  process.env.BACKY_STRIPE_SECRET_KEY?.trim() ||
  process.env.STRIPE_SECRET_KEY?.trim() ||
  "";

const stripeRefundEndpoint = () => {
  const baseUrl = (
    process.env.BACKY_STRIPE_REFUND_API_BASE_URL?.trim() ||
    process.env.BACKY_STRIPE_API_BASE_URL?.trim() ||
    process.env.STRIPE_API_BASE_URL?.trim() ||
    "https://api.stripe.com"
  ).replace(/\/$/, "");
  return `${baseUrl}/v1/refunds`;
};

const isStripePaymentIntent = (value: string) => value.startsWith("pi_");
const isStripeCharge = (value: string) => value.startsWith("ch_");
const canExecuteStripeRefund = (provider: string, paymentReference: string) =>
  provider.toLowerCase() === "stripe" &&
  Boolean(stripeSecretKey()) &&
  (isStripePaymentIntent(paymentReference) || isStripeCharge(paymentReference));

const paypalAccessToken = () =>
  process.env.BACKY_PAYPAL_ACCESS_TOKEN?.trim() ||
  process.env.PAYPAL_ACCESS_TOKEN?.trim() ||
  "";

const paypalRefundEndpoint = (captureId: string) => {
  const baseUrl = (
    process.env.BACKY_PAYPAL_API_BASE_URL?.trim() ||
    process.env.PAYPAL_API_BASE_URL?.trim() ||
    "https://api-m.paypal.com"
  ).replace(/\/$/, "");
  return `${baseUrl}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`;
};

const paypalRefundStatusEndpoint = (refundId: string) => {
  const baseUrl = (
    process.env.BACKY_PAYPAL_API_BASE_URL?.trim() ||
    process.env.PAYPAL_API_BASE_URL?.trim() ||
    "https://api-m.paypal.com"
  ).replace(/\/$/, "");
  return `${baseUrl}/v2/payments/refunds/${encodeURIComponent(refundId)}`;
};

const canExecutePayPalRefund = (provider: string, paymentReference: string) =>
  provider.toLowerCase() === "paypal" &&
  Boolean(paypalAccessToken()) &&
  Boolean(paymentReference);

const paddleApiKey = () =>
  process.env.BACKY_PADDLE_API_KEY?.trim() ||
  process.env.PADDLE_API_KEY?.trim() ||
  "";

const paddleApiBaseUrl = () =>
  (
    process.env.BACKY_PADDLE_API_BASE_URL?.trim() ||
    process.env.PADDLE_API_BASE_URL?.trim() ||
    "https://api.paddle.com"
  ).replace(/\/$/, "");

const paddleAdjustmentsEndpoint = () => `${paddleApiBaseUrl()}/adjustments`;

const paddleAdjustmentStatusEndpoint = (adjustmentId: string) => {
  const params = new URLSearchParams({
    id: adjustmentId,
    per_page: "1",
  });
  return `${paddleAdjustmentsEndpoint()}?${params.toString()}`;
};

const canExecutePaddleRefund = (provider: string, paymentReference: string) =>
  provider.toLowerCase() === "paddle" &&
  Boolean(paddleApiKey()) &&
  Boolean(paymentReference);

const squareAccessToken = () =>
  process.env.BACKY_SQUARE_ACCESS_TOKEN?.trim() ||
  process.env.SQUARE_ACCESS_TOKEN?.trim() ||
  "";

const squareVersion = () =>
  process.env.BACKY_SQUARE_VERSION?.trim() ||
  process.env.SQUARE_VERSION?.trim() ||
  "2026-01-22";

const squareRefundEndpoint = () => {
  const baseUrl = (
    process.env.BACKY_SQUARE_API_BASE_URL?.trim() ||
    process.env.SQUARE_API_BASE_URL?.trim() ||
    "https://connect.squareup.com"
  ).replace(/\/$/, "");
  return `${baseUrl}/v2/refunds`;
};

const squareRefundStatusEndpoint = (refundId: string) =>
  `${squareRefundEndpoint()}/${encodeURIComponent(refundId)}`;

const canExecuteSquareRefund = (provider: string, paymentReference: string) =>
  provider.toLowerCase() === "square" &&
  Boolean(squareAccessToken()) &&
  Boolean(paymentReference);

const adyenApiKey = () =>
  process.env.BACKY_ADYEN_API_KEY?.trim() ||
  process.env.ADYEN_API_KEY?.trim() ||
  "";

const adyenMerchantAccount = () =>
  process.env.BACKY_ADYEN_MERCHANT_ACCOUNT?.trim() ||
  process.env.ADYEN_MERCHANT_ACCOUNT?.trim() ||
  "";

const adyenRefundEndpoint = (paymentPspReference: string) => {
  const baseUrl = (
    process.env.BACKY_ADYEN_API_BASE_URL?.trim() ||
    process.env.ADYEN_API_BASE_URL?.trim() ||
    "https://checkout-test.adyen.com/v71"
  ).replace(/\/$/, "");
  return `${baseUrl}/payments/${encodeURIComponent(paymentPspReference)}/refunds`;
};

const canExecuteAdyenRefund = (provider: string, paymentReference: string) =>
  provider.toLowerCase() === "adyen" &&
  Boolean(adyenApiKey()) &&
  Boolean(adyenMerchantAccount()) &&
  Boolean(paymentReference);

const mollieApiKey = () =>
  process.env.BACKY_MOLLIE_API_KEY?.trim() ||
  process.env.MOLLIE_API_KEY?.trim() ||
  "";

const mollieRefundEndpoint = (paymentId: string) => {
  const baseUrl = (
    process.env.BACKY_MOLLIE_API_BASE_URL?.trim() ||
    process.env.MOLLIE_API_BASE_URL?.trim() ||
    "https://api.mollie.com/v2"
  ).replace(/\/$/, "");
  return `${baseUrl}/payments/${encodeURIComponent(paymentId)}/refunds`;
};

const mollieRefundStatusEndpoint = (paymentId: string, refundId: string) =>
  `${mollieRefundEndpoint(paymentId)}/${encodeURIComponent(refundId)}`;

const canExecuteMollieRefund = (provider: string, paymentReference: string) =>
  provider.toLowerCase() === "mollie" &&
  Boolean(mollieApiKey()) &&
  Boolean(paymentReference);

const razorpayKeyId = () =>
  process.env.BACKY_RAZORPAY_KEY_ID?.trim() ||
  process.env.RAZORPAY_KEY_ID?.trim() ||
  "";

const razorpayKeySecret = () =>
  process.env.BACKY_RAZORPAY_KEY_SECRET?.trim() ||
  process.env.RAZORPAY_KEY_SECRET?.trim() ||
  "";

const razorpayApiBaseUrl = () =>
  (
    process.env.BACKY_RAZORPAY_API_BASE_URL?.trim() ||
    process.env.RAZORPAY_API_BASE_URL?.trim() ||
    "https://api.razorpay.com"
  ).replace(/\/$/, "");

const razorpayAuthHeader = () =>
  `Basic ${Buffer.from(`${razorpayKeyId()}:${razorpayKeySecret()}`).toString(
    "base64",
  )}`;

const razorpayRefundEndpoint = (paymentId: string) =>
  `${razorpayApiBaseUrl()}/v1/payments/${encodeURIComponent(paymentId)}/refund`;

const razorpayRefundStatusEndpoint = (refundId: string) =>
  `${razorpayApiBaseUrl()}/v1/refunds/${encodeURIComponent(refundId)}`;

const canExecuteRazorpayRefund = (
  provider: string,
  paymentReference: string,
) =>
  provider.toLowerCase() === "razorpay" &&
  Boolean(razorpayKeyId()) &&
  Boolean(razorpayKeySecret()) &&
  Boolean(paymentReference);

const toStripeAmount = (amount: number, currency: string): number => {
  const normalizedCurrency = currency.toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)
    ? Math.max(0, Math.round(amount))
    : Math.max(0, Math.round(amount * 100));
};

const toMinorAmount = (amount: number, currency: string): number => {
  const normalizedCurrency = currency.toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)
    ? Math.max(0, Math.round(amount))
    : Math.max(0, Math.round(amount * 100));
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

const providerRefundAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  refund: ProviderRefundPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  refundId: refund.id,
  refundStatus: refund.status,
  provider: refund.provider,
  amount: refund.amount,
  currency: refund.currency,
  reference: refund.reference,
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
    paymentProvider: textValue(values.paymentprovider),
    paymentReference: textValue(values.paymentreference),
    refundStatus: textValue(values.providerrefundstatus),
    refundAmount: numberValue(
      values.providerrefundamount,
      numberValue(values.refundamount),
    ),
    total: numberValue(values.total),
    currency: textValue(values.currency),
  };
};

const providerRefundWebhookSnapshot = (
  refund: ProviderRefundPayload,
): BackyJsonObject => ({
  id: refund.id,
  status: refund.status,
  provider: refund.provider,
  reference: refund.reference,
  amount: refund.amount,
  currency: refund.currency,
  reason: refund.reason,
  requestedAt: refund.requestedAt,
  completedAt: refund.completedAt,
});

const deliverOrderProviderRefundWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  before: CollectionRecordAuditSource;
  after: CollectionRecordAuditSource;
  refund: ProviderRefundPayload;
  action:
    | "commerce.order.provider_refund_requested"
    | "commerce.order.provider_refund_refreshed";
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
      resourceType: "collectionRecord",
      before: orderRecordWebhookSnapshot(params.collection, params.before),
      after: orderRecordWebhookSnapshot(params.collection, params.after),
      refund: providerRefundWebhookSnapshot(params.refund),
    },
    metadata: {
      action: params.action,
      changedKeys: ["content", "collections", "commerce"],
      source: "admin-commerce-order-provider-refund-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      orderId: params.after.id,
      orderSlug: params.after.slug,
      refundId: params.refund.id,
      refundStatus: params.refund.status,
      provider: params.refund.provider,
      amount: params.refund.amount,
      currency: params.refund.currency,
    },
  });

const parseProviderPayload = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const existingRefundPayload = (
  record: CollectionRecordAuditSource,
): ProviderRefundPayload | null => {
  const values = toRecord(record.values);
  const id = textValue(values.providerrefundid);
  const status = textValue(values.providerrefundstatus);
  if (!id || !status || status === "none") return null;

  return {
    id,
    status:
      status === "succeeded" ||
      status === "failed" ||
      status === "requires_action"
        ? status
        : "requested",
    provider:
      textValue(values.providerrefundprovider) ||
      textValue(values.paymentprovider) ||
      "manual",
    reference: textValue(values.providerrefundreference),
    amount: numberValue(
      values.providerrefundamount,
      numberValue(values.refundamount, numberValue(values.total)),
    ),
    currency: textValue(values.currency) || "USD",
    reason:
      textValue(values.providerrefundreason) || textValue(values.refundreason),
    requestedAt:
      textValue(values.providerrefundrequestedat) ||
      record.updatedAt ||
      new Date().toISOString(),
    completedAt: textValue(values.providerrefundcompletedat) || null,
    providerPayload: parseProviderPayload(values.providerrefundpayload),
  };
};

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const safeStripeRefundPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  status: textValue(value.status),
  amount: Number(value.amount || 0),
  currency: textValue(value.currency),
  charge: textValue(value.charge),
  payment_intent: textValue(value.payment_intent),
  reason: textValue(value.reason),
  failure_reason: textValue(value.failure_reason),
  created: Number(value.created || 0),
});

const safeStripeErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    type: textValue(error.type),
    message: textValue(error.message) || "Stripe refund request failed.",
    decline_code: textValue(error.decline_code),
    payment_intent: textValue(error.payment_intent),
    charge: textValue(error.charge),
  };
};

const safePayPalRefundPayload = (value: Record<string, unknown>) => {
  const amount = toRecord(value.amount);
  const links = Array.isArray(value.links)
    ? value.links
        .map((link) => toRecord(link))
        .map((link) => ({
          href: textValue(link.href),
          rel: textValue(link.rel),
          method: textValue(link.method),
        }))
    : [];

  return {
    id: textValue(value.id),
    status: textValue(value.status),
    amount: {
      value: textValue(amount.value),
      currency_code: textValue(amount.currency_code),
    },
    invoice_id: textValue(value.invoice_id),
    custom_id: textValue(value.custom_id),
    update_time: textValue(value.update_time),
    links,
  };
};

const safePayPalErrorPayload = (value: Record<string, unknown>) => {
  const details = Array.isArray(value.details)
    ? value.details.map((detail) => {
        const detailRecord = toRecord(detail);
        return {
          issue: textValue(detailRecord.issue),
          description: textValue(detailRecord.description),
          field: textValue(detailRecord.field),
        };
      })
    : [];

  return {
    name: textValue(value.name),
    message: textValue(value.message) || "PayPal refund request failed.",
    debug_id: textValue(value.debug_id),
    details,
  };
};

const safePaddleRefundPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  action: textValue(value.action),
  type: textValue(value.type),
  status: textValue(value.status),
  transaction_id: textValue(value.transaction_id),
  reason: textValue(value.reason),
  created_at: textValue(value.created_at),
  updated_at: textValue(value.updated_at),
});

const safePaddleErrorPayload = (value: Record<string, unknown>) => ({
  status: Number(value.status || value.status_code || 0),
  code: textValue(value.code) || textValue(value.error_code),
  type: textValue(value.type),
  message:
    textValue(value.detail) ||
    textValue(value.message) ||
    "Paddle refund adjustment request failed.",
});

const safeSquareMoneyPayload = (value: unknown) => {
  const money = toRecord(value);
  return {
    amount: Number(money.amount || 0),
    currency: textValue(money.currency),
  };
};

const safeSquareRefundPayload = (value: Record<string, unknown>) => {
  const refund = toRecord(value.refund);
  return {
    id: textValue(refund.id),
    status: textValue(refund.status),
    amount_money: safeSquareMoneyPayload(refund.amount_money),
    payment_id: textValue(refund.payment_id),
    order_id: textValue(refund.order_id),
    reason: textValue(refund.reason),
    created_at: textValue(refund.created_at),
    updated_at: textValue(refund.updated_at),
  };
};

const safeSquareErrorPayload = (value: Record<string, unknown>) => {
  const errors = Array.isArray(value.errors)
    ? value.errors.map((error) => {
        const errorRecord = toRecord(error);
        return {
          category: textValue(errorRecord.category),
          code: textValue(errorRecord.code),
          detail: textValue(errorRecord.detail),
          field: textValue(errorRecord.field),
        };
      })
    : [];

  return {
    errors,
    message: errors[0]?.detail || "Square refund request failed.",
  };
};

const safeAdyenRefundPayload = (value: Record<string, unknown>) => ({
  pspReference: textValue(value.pspReference),
  paymentPspReference: textValue(value.paymentPspReference),
  merchantAccount: textValue(value.merchantAccount),
  reference: textValue(value.reference),
  status: textValue(value.status),
});

const safeAdyenErrorPayload = (value: Record<string, unknown>) => ({
  status: Number(value.status || 0),
  errorCode: textValue(value.errorCode),
  message: textValue(value.message) || "Adyen refund request failed.",
  errorType: textValue(value.errorType),
  pspReference: textValue(value.pspReference),
});

const safeMollieRefundPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  status: textValue(value.status),
  amount: safeSquareMoneyPayload(value.amount),
  paymentId: textValue(value.paymentId),
  description: textValue(value.description),
  createdAt: textValue(value.createdAt),
});

const safeMollieErrorPayload = (value: Record<string, unknown>) => ({
  status: Number(value.status || 0),
  title: textValue(value.title),
  detail:
    textValue(value.detail) ||
    textValue(value.message) ||
    "Mollie refund request failed.",
  field: textValue(value.field),
  type: textValue(value.type),
});

const safeRazorpayRefundPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  entity: textValue(value.entity),
  payment_id: textValue(value.payment_id),
  amount: Number(value.amount || 0),
  currency: textValue(value.currency),
  status: textValue(value.status),
  speed_processed: textValue(value.speed_processed),
  speed_requested: textValue(value.speed_requested),
  receipt: textValue(value.receipt),
  notes: toRecord(value.notes),
  created_at: Number(value.created_at || 0),
});

const safeRazorpayErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    description:
      textValue(error.description) ||
      textValue(error.reason) ||
      "Razorpay refund request failed.",
    source: textValue(error.source),
    step: textValue(error.step),
    reason: textValue(error.reason),
    field: textValue(error.field),
  };
};

const executeStripeRefund = async (input: {
  refundId: string;
  orderId: string;
  orderNumber: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const params = new URLSearchParams();
  params.set("amount", String(toStripeAmount(input.amount, input.currency)));
  params.set("reason", "requested_by_customer");
  params.set("metadata[backy_order_id]", input.orderId);
  params.set("metadata[backy_order_number]", input.orderNumber);
  params.set("metadata[backy_refund_id]", input.refundId);
  params.set("metadata[backy_refund_reason]", input.reason.slice(0, 500));
  if (isStripePaymentIntent(input.paymentReference)) {
    params.set("payment_intent", input.paymentReference);
  } else {
    params.set("charge", input.paymentReference);
  }

  const response = await fetch(stripeRefundEndpoint(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey()}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": input.refundId,
    },
    body: params,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeStripeErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeStripeRefundPayload(payloadRecord),
  };
};

const refreshStripeRefund = async (refundId: string) => {
  const response = await fetch(
    `${stripeRefundEndpoint()}/${encodeURIComponent(refundId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${stripeSecretKey()}`,
      },
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeStripeErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeStripeRefundPayload(payloadRecord),
  };
};

const executePayPalRefund = async (input: {
  refundId: string;
  orderId: string;
  orderNumber: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const response = await fetch(paypalRefundEndpoint(input.paymentReference), {
    method: "POST",
    headers: {
      authorization: `Bearer ${paypalAccessToken()}`,
      "content-type": "application/json",
      "paypal-request-id": input.refundId,
    },
    body: JSON.stringify({
      amount: {
        value: input.amount.toFixed(2),
        currency_code: input.currency.toUpperCase(),
      },
      invoice_id: input.orderNumber || input.orderId,
      custom_id: input.refundId,
      note_to_payer: input.reason.slice(0, 255),
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safePayPalErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safePayPalRefundPayload(payloadRecord),
  };
};

const refreshPayPalRefund = async (refundId: string) => {
  const response = await fetch(paypalRefundStatusEndpoint(refundId), {
    method: "GET",
    headers: {
      authorization: `Bearer ${paypalAccessToken()}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safePayPalErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safePayPalRefundPayload(payloadRecord),
  };
};

const executePaddleRefund = async (input: {
  refundId: string;
  orderId: string;
  orderNumber: string;
  paymentReference: string;
  reason: string;
}) => {
  const response = await fetch(paddleAdjustmentsEndpoint(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${paddleApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "refund",
      type: "full",
      transaction_id: input.paymentReference,
      reason: input.reason.slice(0, 255),
      custom_data: {
        backyRefundId: input.refundId,
        backyOrderId: input.orderId,
        backyOrderNumber: input.orderNumber,
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);
  const dataRecord = Array.isArray(payloadRecord.data)
    ? toRecord(payloadRecord.data[0])
    : toRecord(payloadRecord.data);
  const sourceRecord = Object.keys(dataRecord).length ? dataRecord : payloadRecord;

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safePaddleErrorPayload(
        payloadRecord.error ? toRecord(payloadRecord.error) : payloadRecord,
      ),
    };
  }

  return {
    ok: true as const,
    payload: safePaddleRefundPayload(sourceRecord),
  };
};

const refreshPaddleRefund = async (adjustmentId: string) => {
  const response = await fetch(paddleAdjustmentStatusEndpoint(adjustmentId), {
    method: "GET",
    headers: {
      authorization: `Bearer ${paddleApiKey()}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);
  const dataRecord = Array.isArray(payloadRecord.data)
    ? toRecord(payloadRecord.data[0])
    : toRecord(payloadRecord.data);
  const sourceRecord = Object.keys(dataRecord).length ? dataRecord : payloadRecord;

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safePaddleErrorPayload(
        payloadRecord.error ? toRecord(payloadRecord.error) : payloadRecord,
      ),
    };
  }

  return {
    ok: true as const,
    payload: safePaddleRefundPayload(sourceRecord),
  };
};

const executeSquareRefund = async (input: {
  refundId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const response = await fetch(squareRefundEndpoint(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${squareAccessToken()}`,
      "content-type": "application/json",
      "square-version": squareVersion(),
    },
    body: JSON.stringify({
      idempotency_key: input.refundId,
      amount_money: {
        amount: toMinorAmount(input.amount, input.currency),
        currency: input.currency.toUpperCase(),
      },
      payment_id: input.paymentReference,
      reason: input.reason.slice(0, 192),
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeSquareErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeSquareRefundPayload(payloadRecord),
  };
};

const refreshSquareRefund = async (refundId: string) => {
  const response = await fetch(squareRefundStatusEndpoint(refundId), {
    method: "GET",
    headers: {
      authorization: `Bearer ${squareAccessToken()}`,
      "square-version": squareVersion(),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeSquareErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeSquareRefundPayload(payloadRecord),
  };
};

const executeAdyenRefund = async (input: {
  refundId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const response = await fetch(adyenRefundEndpoint(input.paymentReference), {
    method: "POST",
    headers: {
      "x-api-key": adyenApiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      merchantAccount: adyenMerchantAccount(),
      amount: {
        value: toMinorAmount(input.amount, input.currency),
        currency: input.currency.toUpperCase(),
      },
      reference: input.refundId,
      metadata: {
        backyRefundId: input.refundId,
        backyRefundReason: input.reason.slice(0, 500),
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeAdyenErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeAdyenRefundPayload(payloadRecord),
  };
};

const executeMollieRefund = async (input: {
  refundId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const response = await fetch(mollieRefundEndpoint(input.paymentReference), {
    method: "POST",
    headers: {
      authorization: `Bearer ${mollieApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: {
        currency: input.currency.toUpperCase(),
        value: input.amount.toFixed(2),
      },
      description: input.reason.slice(0, 255),
      metadata: {
        backyRefundId: input.refundId,
        backyRefundReason: input.reason.slice(0, 500),
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeMollieErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeMollieRefundPayload(payloadRecord),
  };
};

const refreshMollieRefund = async (
  paymentReference: string,
  refundId: string,
) => {
  const response = await fetch(
    mollieRefundStatusEndpoint(paymentReference, refundId),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${mollieApiKey()}`,
      },
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeMollieErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeMollieRefundPayload(payloadRecord),
  };
};

const executeRazorpayRefund = async (input: {
  refundId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const response = await fetch(razorpayRefundEndpoint(input.paymentReference), {
    method: "POST",
    headers: {
      authorization: razorpayAuthHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: toMinorAmount(input.amount, input.currency),
      speed: "normal",
      receipt: input.refundId,
      notes: {
        backyRefundId: input.refundId,
        backyRefundReason: input.reason.slice(0, 500),
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeRazorpayErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeRazorpayRefundPayload(payloadRecord),
  };
};

const refreshRazorpayRefund = async (refundId: string) => {
  const response = await fetch(razorpayRefundStatusEndpoint(refundId), {
    method: "GET",
    headers: {
      authorization: razorpayAuthHeader(),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeRazorpayErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeRazorpayRefundPayload(payloadRecord),
  };
};

const buildProviderRefundUpdate = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  settings: unknown,
) => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const existing = existingRefundPayload(record);
  const provider = resolvedRefundProvider(body, values, settings);
  const amount = numberValue(
    body.amount,
    numberValue(values.refundamount, numberValue(values.total)),
  );
  const currency = textValue(values.currency) || "USD";
  const reason =
    textValue(body.reason) ||
    textValue(values.refundreason) ||
    "Provider refund requested from Backy order workflow.";
  const refundId =
    existing?.id ||
    `rf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const paymentReference = textValue(values.paymentreference);
  const shouldExecuteStripeRefund = canExecuteStripeRefund(
    provider,
    paymentReference,
  );
  const shouldExecutePayPalRefund = canExecutePayPalRefund(
    provider,
    paymentReference,
  );
  const shouldExecutePaddleRefund = canExecutePaddleRefund(
    provider,
    paymentReference,
  );
  const shouldExecuteSquareRefund = canExecuteSquareRefund(
    provider,
    paymentReference,
  );
  const shouldExecuteAdyenRefund = canExecuteAdyenRefund(
    provider,
    paymentReference,
  );
  const shouldExecuteMollieRefund = canExecuteMollieRefund(
    provider,
    paymentReference,
  );
  const shouldExecuteRazorpayRefund = canExecuteRazorpayRefund(
    provider,
    paymentReference,
  );
  const orderNumber = textValue(values.ordernumber);
  const executionMode = shouldExecuteStripeRefund
    ? "stripe-api"
    : shouldExecutePayPalRefund
      ? "paypal-api"
      : shouldExecutePaddleRefund
        ? "paddle-api"
        : shouldExecuteSquareRefund
          ? "square-api"
          : shouldExecuteAdyenRefund
            ? "adyen-api"
            : shouldExecuteMollieRefund
              ? "mollie-api"
              : shouldExecuteRazorpayRefund
                ? "razorpay-api"
                : "handoff";
  const providerPayload: Record<string, unknown> = {
    schemaVersion: "backy.provider-refund.v1",
    action:
      provider === "stripe"
        ? "refunds.create"
        : provider === "paypal"
          ? "payments.captures.refund"
          : provider === "paddle"
            ? "adjustments.create"
            : provider === "square"
              ? "refunds.create"
              : provider === "adyen"
                ? "payments.refunds.create"
                : provider === "mollie"
                  ? "payments.refunds.create"
                  : provider === "razorpay"
                    ? "payments.refund"
                    : "provider.refund.create",
    provider,
    executionMode,
    orderId: record.id,
    orderNumber,
    paymentReference,
    amount,
    currency,
    reason,
    idempotencyKey: refundId,
  };
  let status: ProviderRefundPayload["status"] =
    provider === "manual" ? "requires_action" : "requested";
  let completedAt: string | null = null;
  let providerRefundId = refundId;
  let providerReference = paymentReference
    ? `${provider}:${paymentReference}:${refundId}`
    : `${provider}:${refundId}`;
  let statusNote = "handoff";

  if (shouldExecuteStripeRefund) {
    const result = await executeStripeRefund({
      refundId,
      orderId: record.id,
      orderNumber,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      if (result.payload.status === "succeeded") {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (
        result.payload.status === "failed" ||
        result.payload.status === "canceled"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  } else if (shouldExecutePayPalRefund) {
    const result = await executePayPalRefund({
      refundId,
      orderId: record.id,
      orderNumber,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const paypalStatus = result.payload.status.toUpperCase();
      if (paypalStatus === "COMPLETED") {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (
        paypalStatus === "FAILED" ||
        paypalStatus === "CANCELLED" ||
        paypalStatus === "DENIED"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  } else if (shouldExecutePaddleRefund) {
    const result = await executePaddleRefund({
      refundId,
      orderId: record.id,
      orderNumber,
      paymentReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const paddleStatus = result.payload.status.toLowerCase();
      if (paddleStatus === "approved" || paddleStatus === "refunded") {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (
        paddleStatus === "rejected" ||
        paddleStatus === "failed" ||
        paddleStatus === "reversed"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  } else if (shouldExecuteSquareRefund) {
    const result = await executeSquareRefund({
      refundId,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const squareStatus = result.payload.status.toUpperCase();
      if (squareStatus === "COMPLETED") {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (squareStatus === "FAILED" || squareStatus === "REJECTED") {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  } else if (shouldExecuteAdyenRefund) {
    const result = await executeAdyenRefund({
      refundId,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const adyenStatus = result.payload.status.toLowerCase();
      if (
        adyenStatus === "received" ||
        adyenStatus === "completed" ||
        adyenStatus === "succeeded"
      ) {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (
        adyenStatus === "failed" ||
        adyenStatus === "error" ||
        adyenStatus === "refused"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.pspReference || refundId;
      providerReference = `${provider}:${result.payload.pspReference || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  } else if (shouldExecuteMollieRefund) {
    const result = await executeMollieRefund({
      refundId,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const mollieStatus = result.payload.status.toLowerCase();
      if (mollieStatus === "refunded") {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (mollieStatus === "failed" || mollieStatus === "canceled") {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  } else if (shouldExecuteRazorpayRefund) {
    const result = await executeRazorpayRefund({
      refundId,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const razorpayStatus = result.payload.status.toLowerCase();
      if (razorpayStatus === "processed") {
        status = "succeeded";
        completedAt = new Date().toISOString();
      } else if (razorpayStatus === "failed") {
        status = "failed";
      } else {
        status = "requested";
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = "executed";
    } else {
      status = "failed";
      statusNote = "failed";
    }
  }

  const refund: ProviderRefundPayload = {
    id: providerRefundId,
    status,
    provider,
    reference: providerReference,
    amount,
    currency,
    reason,
    requestedAt: existing?.requestedAt || now,
    completedAt,
    providerPayload,
  };
  const shouldMarkRefunded =
    !(
      shouldExecuteStripeRefund ||
      shouldExecutePayPalRefund ||
      shouldExecutePaddleRefund ||
      shouldExecuteSquareRefund ||
      shouldExecuteAdyenRefund ||
      shouldExecuteMollieRefund ||
      shouldExecuteRazorpayRefund
    ) || status === "succeeded";

  return {
    refund,
    values: {
      ...values,
      ...(shouldMarkRefunded
        ? {
            orderstatus: "refunded",
            paymentstatus: "refunded",
            fulfillmentstatus: "cancelled",
          }
        : {}),
      refundamount: amount,
      refundreason: reason,
      providerrefundstatus: refund.status,
      providerrefundprovider: refund.provider,
      providerrefundid: refund.id,
      providerrefundreference: refund.reference,
      providerrefundamount: refund.amount,
      providerrefundreason: refund.reason,
      providerrefundrequestedat: refund.requestedAt,
      providerrefundcompletedat: refund.completedAt,
      providerrefundpayload: JSON.stringify(refund.providerPayload, null, 2),
      notes: appendNote(
        values.notes,
        `Provider refund ${statusNote} ${refund.status} ${now} for ${currency} ${amount.toFixed(2)} via ${provider}.`,
      ),
    },
  };
};

const buildProviderRefundRefreshUpdate = async (
  record: CollectionRecordAuditSource,
  existing: ProviderRefundPayload,
) => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const provider = existing.provider.toLowerCase() || "manual";
  const paymentReference = textValue(values.paymentreference);
  const providerPayload: Record<string, unknown> = {
    ...existing.providerPayload,
    schemaVersion: "backy.provider-refund.v1",
    action:
      provider === "stripe"
        ? "refunds.retrieve"
        : provider === "paypal"
          ? "payments.refunds.get"
          : provider === "paddle"
            ? "adjustments.get"
            : provider === "square"
              ? "refunds.get"
              : provider === "adyen"
                ? "payments.refunds.webhook_reconcile"
                : provider === "mollie"
                  ? "payments.refunds.get"
                  : provider === "razorpay"
                    ? "refunds.get"
                    : "provider.refund.refresh",
    provider,
    orderId: record.id,
    orderNumber: textValue(values.ordernumber),
    paymentReference,
    amount: existing.amount,
    currency: existing.currency,
    reason: existing.reason,
    idempotencyKey: existing.id,
  };
  let status = existing.status;
  let completedAt = existing.completedAt;
  let providerReference =
    existing.reference ||
    (paymentReference
      ? `${provider}:${paymentReference}:${existing.id}`
      : `${provider}:${existing.id}`);
  let statusNote = "handoff";

  if (provider === "stripe" && stripeSecretKey() && existing.id) {
    const result = await refreshStripeRefund(existing.id);
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "stripe-api",
      ...result,
    };
    if (result.ok) {
      if (result.payload.status === "succeeded") {
        status = "succeeded";
        completedAt = completedAt || now;
      } else if (
        result.payload.status === "failed" ||
        result.payload.status === "canceled"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerReference = `${provider}:${result.payload.id || existing.id}`;
      statusNote = "reconciled";
    } else {
      statusNote = "refresh_failed";
    }
  } else if (provider === "paypal" && paypalAccessToken() && existing.id) {
    const result = await refreshPayPalRefund(existing.id);
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "paypal-api",
      ...result,
    };
    if (result.ok) {
      const paypalStatus = result.payload.status.toUpperCase();
      if (paypalStatus === "COMPLETED") {
        status = "succeeded";
        completedAt = completedAt || now;
      } else if (
        paypalStatus === "FAILED" ||
        paypalStatus === "CANCELLED" ||
        paypalStatus === "DENIED"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerReference = `${provider}:${result.payload.id || existing.id}`;
      statusNote = "reconciled";
    } else {
      statusNote = "refresh_failed";
    }
  } else if (provider === "paddle" && paddleApiKey() && existing.id) {
    const result = await refreshPaddleRefund(existing.id);
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "paddle-api",
      ...result,
    };
    if (result.ok) {
      const paddleStatus = result.payload.status.toLowerCase();
      if (paddleStatus === "approved" || paddleStatus === "refunded") {
        status = "succeeded";
        completedAt = completedAt || now;
      } else if (
        paddleStatus === "rejected" ||
        paddleStatus === "failed" ||
        paddleStatus === "reversed"
      ) {
        status = "failed";
      } else {
        status = "requested";
      }
      providerReference = `${provider}:${result.payload.id || existing.id}`;
      statusNote = "reconciled";
    } else {
      statusNote = "refresh_failed";
    }
  } else if (provider === "square" && squareAccessToken() && existing.id) {
    const result = await refreshSquareRefund(existing.id);
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "square-api",
      ...result,
    };
    if (result.ok) {
      const squareStatus = result.payload.status.toUpperCase();
      if (squareStatus === "COMPLETED") {
        status = "succeeded";
        completedAt = completedAt || now;
      } else if (squareStatus === "FAILED" || squareStatus === "REJECTED") {
        status = "failed";
      } else {
        status = "requested";
      }
      providerReference = `${provider}:${result.payload.id || existing.id}`;
      statusNote = "reconciled";
    } else {
      statusNote = "refresh_failed";
    }
  } else if (provider === "adyen" && existing.id) {
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: adyenApiKey() ? "adyen-webhook" : "handoff",
      ok: false,
      payload: {
        message: adyenApiKey()
          ? "Adyen refund outcomes are delivered asynchronously through REFUND, REFUND_FAILED, and REFUNDED_REVERSED webhooks; wait for webhook settlement or settlement reports to update this refund."
          : "Adyen API credentials are not configured; refund status must be confirmed in Adyen or by webhook settlement.",
        refundPspReference: existing.id,
        paymentPspReference: paymentReference,
        merchantAccount: adyenMerchantAccount() || null,
        webhookEvents: ["REFUND", "REFUND_FAILED", "REFUNDED_REVERSED"],
      },
    };
    statusNote = "webhook_pending";
  } else if (
    provider === "mollie" &&
    mollieApiKey() &&
    paymentReference &&
    existing.id
  ) {
    const result = await refreshMollieRefund(paymentReference, existing.id);
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "mollie-api",
      ...result,
    };
    if (result.ok) {
      const mollieStatus = result.payload.status.toLowerCase();
      if (mollieStatus === "refunded") {
        status = "succeeded";
        completedAt = completedAt || now;
      } else if (mollieStatus === "failed" || mollieStatus === "canceled") {
        status = "failed";
      } else {
        status = "requested";
      }
      providerReference = `${provider}:${result.payload.id || existing.id}`;
      statusNote = "reconciled";
    } else {
      statusNote = "refresh_failed";
    }
  } else if (provider === "razorpay" && razorpayKeyId() && razorpayKeySecret() && existing.id) {
    const result = await refreshRazorpayRefund(existing.id);
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "razorpay-api",
      ...result,
    };
    if (result.ok) {
      const razorpayStatus = result.payload.status.toLowerCase();
      if (razorpayStatus === "processed") {
        status = "succeeded";
        completedAt = completedAt || now;
      } else if (razorpayStatus === "failed") {
        status = "failed";
      } else {
        status = "requested";
      }
      providerReference = `${provider}:${result.payload.id || existing.id}`;
      statusNote = "reconciled";
    } else {
      statusNote = "refresh_failed";
    }
  } else {
    providerPayload.refresh = {
      requestedAt: now,
      executionMode: "handoff",
      ok: false,
      payload: {
        message:
          "Provider refund refresh is not configured for this provider or refund.",
      },
    };
  }

  const refund: ProviderRefundPayload = {
    ...existing,
    status,
    reference: providerReference,
    completedAt,
    providerPayload,
  };

  return {
    refund,
    values: {
      ...values,
      ...(status === "succeeded"
        ? {
            orderstatus: "refunded",
            paymentstatus: "refunded",
            fulfillmentstatus: "cancelled",
          }
        : {}),
      refundamount: refund.amount,
      refundreason: refund.reason,
      providerrefundstatus: refund.status,
      providerrefundprovider: refund.provider,
      providerrefundid: refund.id,
      providerrefundreference: refund.reference,
      providerrefundamount: refund.amount,
      providerrefundreason: refund.reason,
      providerrefundrequestedat: refund.requestedAt,
      providerrefundcompletedat: refund.completedAt,
      providerrefundpayload: JSON.stringify(refund.providerPayload, null, 2),
      notes: appendNote(
        values.notes,
        `Provider refund refresh ${statusNote} ${refund.status} ${now} via ${provider}.`,
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

      return privateProviderRefundResponse(
        {
          success: true,
          requestId,
          data: { record, refund: existingRefundPayload(record) },
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

    return privateProviderRefundResponse(
      {
        success: true,
        requestId,
        data: { record, refund: existingRefundPayload(record) },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order provider refund read API error:", error);
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
      const { refund, values: rawValues } = await buildProviderRefundUpdate(
        record,
        body,
        settings,
      );
      const values = normalizeCollectionRecordMediaValues(
        collection,
        rawValues,
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
          "Provider refund values are invalid",
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
          reason: "order-provider-refund-requested",
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
        metadata: providerRefundAuditMetadata(collection, updated, refund),
        requestId,
      });
      await deliverOrderProviderRefundWebhook({
        repositories,
        site,
        collection,
        before: record,
        after: updated,
        refund,
        action: "commerce.order.provider_refund_requested",
        requestId,
        actor: access.session?.user.id,
      });

      return privateProviderRefundResponse(
        {
          success: true,
          requestId,
          data: { record: updated, order: updated, refund, cacheInvalidation },
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

    const { refund, values: rawValues } = await buildProviderRefundUpdate(
      record,
      body,
      getAdminSettings(),
    );
    const values = normalizeCollectionRecordMediaValues(
      collection as unknown as BackyCollection,
      rawValues,
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
        "Provider refund values are invalid",
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
      metadata: providerRefundAuditMetadata(collection, updated, refund),
      requestId,
    });
    await deliverOrderProviderRefundWebhook({
      site: site as unknown as Site,
      collection,
      before: record,
      after: updated,
      refund,
      action: "commerce.order.provider_refund_requested",
      requestId,
      actor: access.session?.user.id,
    });

    return privateProviderRefundResponse(
      {
        success: true,
        requestId,
        data: { record: updated, order: updated, refund },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order provider refund create API error:", error);
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
    permission: "commerce.edit",
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

      const existing = existingRefundPayload(record);
      if (!existing)
        return errorResponse(
          400,
          "PROVIDER_REFUND_NOT_FOUND",
          "This order does not have a provider refund to refresh",
          requestId,
        );

      const { refund, values: rawValues } =
        await buildProviderRefundRefreshUpdate(record, existing);
      const values = normalizeCollectionRecordMediaValues(
        collection,
        rawValues,
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
          "Provider refund values are invalid",
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
          reason: "order-provider-refund-refreshed",
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
        metadata: providerRefundAuditMetadata(collection, updated, refund),
        requestId,
      });
      await deliverOrderProviderRefundWebhook({
        repositories,
        site,
        collection,
        before: record,
        after: updated,
        refund,
        action: "commerce.order.provider_refund_refreshed",
        requestId,
        actor: access.session?.user.id,
      });

      return privateProviderRefundResponse(
        {
          success: true,
          requestId,
          data: { record: updated, order: updated, refund, cacheInvalidation },
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

    const existing = existingRefundPayload(record);
    if (!existing)
      return errorResponse(
        400,
        "PROVIDER_REFUND_NOT_FOUND",
        "This order does not have a provider refund to refresh",
        requestId,
      );

    const { refund, values: rawValues } =
      await buildProviderRefundRefreshUpdate(record, existing);
    const values = normalizeCollectionRecordMediaValues(
      collection as unknown as BackyCollection,
      rawValues,
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
        "Provider refund values are invalid",
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
      metadata: providerRefundAuditMetadata(collection, updated, refund),
      requestId,
    });
    await deliverOrderProviderRefundWebhook({
      site: site as unknown as Site,
      collection,
      before: record,
      after: updated,
      refund,
      action: "commerce.order.provider_refund_refreshed",
      requestId,
      actor: access.session?.user.id,
    });

    return privateProviderRefundResponse(
      {
        success: true,
        requestId,
        data: { record: updated, order: updated, refund },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order provider refund refresh API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
