/**
 * Admin product subscription lifecycle action endpoint.
 *
 * POST /api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/[orderId]/action
 */

import { NextRequest, NextResponse } from "next/server";
import type {
  BackyCollection,
  BackyJsonObject,
  BackyJsonValue,
  Site,
} from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import { requireCommerceCollectionAccess } from "@/lib/adminCommerceCollectionAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  PRODUCT_COLLECTION_SLUG,
  productRecordToCommerceProduct,
  type CommerceSourceRecord,
} from "@/lib/commerceCatalog";
import { resolveRepositorySite } from "@/lib/commentRepositorySupport";
import {
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from "@/lib/backyStore";
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
    productId: string;
    orderId: string;
  }>;
}

interface SourceRecord {
  id: string;
  slug: string;
  status: CommerceSourceRecord["status"] | string;
  values: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

interface CollectionAuditSource {
  id: string;
  name: string;
  slug: string;
}

interface SubscriptionLifecycleAction {
  id: string;
  schemaVersion: "backy.product-subscription-action.v1";
  action: "pause" | "resume" | "cancel";
  status: "requested" | "succeeded" | "failed" | "requires_action";
  provider: string;
  executionMode:
    | "stripe-api"
    | "paypal-api"
    | "paddle-api"
    | "square-api"
    | "adyen-api"
    | "mollie-api"
    | "razorpay-api"
    | "http-api"
    | "handoff";
  productId: string;
  productSlug: string;
  orderId: string;
  orderSlug: string;
  subscriptionReference: string;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload: Record<string, unknown>;
}

type SubscriptionActionUpdateResult =
  | { action: SubscriptionLifecycleAction; values: Record<string, unknown> }
  | {
      error: {
        status: number;
        code: string;
        message: string;
        details?: unknown;
      };
    };

const ORDERS_COLLECTION_SLUG = "orders";
const SUBSCRIPTION_ACTION_SCHEMA_VERSION =
  "backy.product-subscription-action.v1";

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
    {
      success: false,
      requestId,
      error: { code, message, details },
      errorMessage: message,
    },
    {
      status,
      requestId,
      cache: "error",
      schemaVersion: SUBSCRIPTION_ACTION_SCHEMA_VERSION,
    },
  );

const subscriptionActionResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: SUBSCRIPTION_ACTION_SCHEMA_VERSION,
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

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toJsonRecord = (
  value: Record<string, unknown>,
): Record<string, BackyJsonValue> => value as Record<string, BackyJsonValue>;

const sourceRecordFromRecord = (
  record: SourceRecord,
): CommerceSourceRecord => ({
  id: record.id,
  slug: record.slug,
  status: record.status as CommerceSourceRecord["status"],
  values: record.values,
  updatedAt: record.updatedAt || "",
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

const parseItems = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.map(toRecord);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(toRecord) : [];
  } catch {
    return [];
  }
};

const itemMatchesProduct = (
  item: Record<string, unknown>,
  product: { id: string; slug: string; sku: string; title: string },
) => {
  const candidates = [
    item.productId,
    item.productid,
    item.id,
    item.slug,
    item.productSlug,
    item.productslug,
    item.sku,
    item.title,
  ]
    .map((value) => textValue(value).toLowerCase())
    .filter(Boolean);
  const productKeys = [product.id, product.slug, product.sku, product.title]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  return candidates.some((candidate) => productKeys.includes(candidate));
};

const orderContainsProduct = (
  order: SourceRecord,
  productRecord: SourceRecord,
): boolean => {
  const product = productRecordToCommerceProduct(
    sourceRecordFromRecord(productRecord),
  );
  return parseItems(order.values?.items).some((item) =>
    itemMatchesProduct(item, {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      title: product.title,
    }),
  );
};

const normalizeAction = (
  value: unknown,
): SubscriptionLifecycleAction["action"] | null => {
  const action = textValue(value).toLowerCase();
  return action === "pause" || action === "resume" || action === "cancel"
    ? action
    : null;
};

const stripeSecretKey = () =>
  process.env.BACKY_STRIPE_SECRET_KEY?.trim() ||
  process.env.STRIPE_SECRET_KEY?.trim() ||
  "";

const stripeApiBaseUrl = () =>
  (
    process.env.BACKY_STRIPE_API_BASE_URL?.trim() ||
    process.env.STRIPE_API_BASE_URL?.trim() ||
    "https://api.stripe.com"
  ).replace(/\/$/, "");

const stripeSubscriptionEndpoint = (subscriptionReference: string) =>
  `${stripeApiBaseUrl()}/v1/subscriptions/${encodeURIComponent(subscriptionReference)}`;

const stripeResumeEndpoint = (subscriptionReference: string) =>
  `${stripeSubscriptionEndpoint(subscriptionReference)}/resume`;

const canExecuteStripeSubscriptionAction = (
  provider: string,
  subscriptionReference: string,
) =>
  provider.toLowerCase() === "stripe" &&
  Boolean(stripeSecretKey()) &&
  subscriptionReference.startsWith("sub_");

const paypalAccessToken = () =>
  process.env.BACKY_PAYPAL_ACCESS_TOKEN?.trim() ||
  process.env.PAYPAL_ACCESS_TOKEN?.trim() ||
  "";

const paypalApiBaseUrl = () =>
  (
    process.env.BACKY_PAYPAL_API_BASE_URL?.trim() ||
    process.env.PAYPAL_API_BASE_URL?.trim() ||
    "https://api-m.paypal.com"
  ).replace(/\/$/, "");

const paypalSubscriptionEndpoint = (
  subscriptionReference: string,
  action: SubscriptionLifecycleAction["action"],
) => {
  const paypalAction =
    action === "pause"
      ? "suspend"
      : action === "resume"
        ? "activate"
        : "cancel";
  return `${paypalApiBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionReference)}/${paypalAction}`;
};

const canExecutePayPalSubscriptionAction = (
  provider: string,
  subscriptionReference: string,
) =>
  provider.toLowerCase() === "paypal" &&
  Boolean(paypalAccessToken()) &&
  Boolean(subscriptionReference);

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

const paddleSubscriptionEndpoint = (
  subscriptionReference: string,
  action: SubscriptionLifecycleAction["action"],
) =>
  `${paddleApiBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionReference)}/${action}`;

const canExecutePaddleSubscriptionAction = (
  provider: string,
  subscriptionReference: string,
) =>
  provider.toLowerCase() === "paddle" &&
  Boolean(paddleApiKey()) &&
  Boolean(subscriptionReference);

const squareAccessToken = () =>
  process.env.BACKY_SQUARE_ACCESS_TOKEN?.trim() ||
  process.env.SQUARE_ACCESS_TOKEN?.trim() ||
  "";

const squareApiBaseUrl = () =>
  (
    process.env.BACKY_SQUARE_API_BASE_URL?.trim() ||
    process.env.SQUARE_API_BASE_URL?.trim() ||
    "https://connect.squareup.com"
  ).replace(/\/$/, "");

const squareVersion = () =>
  process.env.BACKY_SQUARE_VERSION?.trim() ||
  process.env.SQUARE_VERSION?.trim() ||
  "2026-01-22";

const squareSubscriptionEndpoint = (
  subscriptionReference: string,
  action: SubscriptionLifecycleAction["action"],
) =>
  `${squareApiBaseUrl()}/v2/subscriptions/${encodeURIComponent(subscriptionReference)}/${action}`;

const canExecuteSquareSubscriptionAction = (
  provider: string,
  subscriptionReference: string,
) =>
  provider.toLowerCase() === "square" &&
  Boolean(squareAccessToken()) &&
  Boolean(subscriptionReference);

const adyenApiKey = () =>
  process.env.BACKY_ADYEN_API_KEY?.trim() ||
  process.env.ADYEN_API_KEY?.trim() ||
  "";

const adyenMerchantAccount = () =>
  process.env.BACKY_ADYEN_MERCHANT_ACCOUNT?.trim() ||
  process.env.ADYEN_MERCHANT_ACCOUNT?.trim() ||
  "";

const adyenRecurringApiBaseUrl = () =>
  (
    process.env.BACKY_ADYEN_RECURRING_API_BASE_URL?.trim() ||
    process.env.ADYEN_RECURRING_API_BASE_URL?.trim() ||
    "https://pal-test.adyen.com/pal/servlet/Recurring/v68"
  ).replace(/\/$/, "");

const adyenDisableEndpoint = () => `${adyenRecurringApiBaseUrl()}/disable`;

const mollieApiKey = () =>
  process.env.BACKY_MOLLIE_API_KEY?.trim() ||
  process.env.MOLLIE_API_KEY?.trim() ||
  "";

const mollieApiBaseUrl = () =>
  (
    process.env.BACKY_MOLLIE_API_BASE_URL?.trim() ||
    process.env.MOLLIE_API_BASE_URL?.trim() ||
    "https://api.mollie.com/v2"
  ).replace(/\/$/, "");

const mollieSubscriptionEndpoint = (
  customerId: string,
  subscriptionId: string,
) =>
  `${mollieApiBaseUrl()}/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`;

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

const razorpaySubscriptionEndpoint = (
  subscriptionReference: string,
  action: SubscriptionLifecycleAction["action"],
) =>
  `${razorpayApiBaseUrl()}/v1/subscriptions/${encodeURIComponent(subscriptionReference)}/${action}`;

const razorpayBasicAuth = () =>
  `Basic ${Buffer.from(`${razorpayKeyId()}:${razorpayKeySecret()}`).toString("base64")}`;

const envValue = (keys: string[]): string =>
  keys.map((key) => process.env[key]?.trim() || "").find(Boolean) || "";

const splitProviderReference = (value: string): [string, string] | null => {
  const separators = ["::", ":", "/", "|"];
  for (const separator of separators) {
    const parts = value
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts.slice(1).join(separator)];
  }
  return null;
};

const providerCustomerReference = (
  values: Record<string, unknown>,
  body: Record<string, unknown>,
): string =>
  textValue(body.providerCustomerId) ||
  textValue(body.customerId) ||
  textValue(body.shopperReference) ||
  textValue(values.providercustomerid) ||
  textValue(values.providerCustomerId) ||
  textValue(values.paymentcustomerid) ||
  textValue(values.paymentCustomerId) ||
  textValue(values.molliecustomerid) ||
  textValue(values.mollieCustomerId) ||
  textValue(values.adyenshopperreference) ||
  textValue(values.adyenShopperReference);

const adyenSubscriptionTarget = (
  subscriptionReference: string,
  values: Record<string, unknown>,
  body: Record<string, unknown>,
) => {
  const split = splitProviderReference(subscriptionReference);
  const shopperReference =
    providerCustomerReference(values, body) ||
    split?.[0] ||
    subscriptionReference;
  const recurringDetailReference =
    textValue(body.recurringDetailReference) ||
    textValue(values.recurringdetailreference) ||
    textValue(values.recurringDetailReference) ||
    split?.[1] ||
    "";
  return { shopperReference, recurringDetailReference };
};

const mollieSubscriptionTarget = (
  subscriptionReference: string,
  values: Record<string, unknown>,
  body: Record<string, unknown>,
) => {
  const split = splitProviderReference(subscriptionReference);
  const splitCustomer = split?.[0]?.startsWith("cst_") ? split[0] : "";
  const splitSubscription = splitCustomer
    ? split?.[1] || ""
    : subscriptionReference;
  return {
    customerId: providerCustomerReference(values, body) || splitCustomer,
    subscriptionId:
      textValue(body.providerSubscriptionId) ||
      textValue(body.mollieSubscriptionId) ||
      textValue(values.providersubscriptionid) ||
      textValue(values.providerSubscriptionId) ||
      textValue(values.molliesubscriptionid) ||
      textValue(values.mollieSubscriptionId) ||
      splitSubscription,
  };
};

const subscriptionActionProviderUrl = (): string => {
  const commerce = toRecord(toRecord(getAdminSettings().integrations).commerce);
  const configuredUrl =
    envValue([
      "BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL",
      "COMMERCE_SUBSCRIPTION_ACTION_URL",
    ]) ||
    textValue(commerce.subscriptionActionProviderUrl) ||
    textValue(commerce.subscriptionLifecycleProviderUrl);
  if (!configuredUrl) return "";
  try {
    const url = new URL(configuredUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
};

const canExecuteHttpSubscriptionAction = (provider: string) => {
  const normalizedProvider = provider.toLowerCase();
  return (
    Boolean(subscriptionActionProviderUrl()) &&
    (["http", "generic-http", "custom-http"].includes(normalizedProvider) ||
      ["adyen", "mollie"].includes(normalizedProvider))
  );
};

const canExecuteAdyenSubscriptionAction = (
  provider: string,
  action: SubscriptionLifecycleAction["action"],
  subscriptionReference: string,
  values: Record<string, unknown>,
  body: Record<string, unknown>,
) => {
  const target = adyenSubscriptionTarget(subscriptionReference, values, body);
  return (
    provider.toLowerCase() === "adyen" &&
    action === "cancel" &&
    Boolean(adyenApiKey()) &&
    Boolean(adyenMerchantAccount()) &&
    Boolean(target.shopperReference)
  );
};

const canExecuteMollieSubscriptionAction = (
  provider: string,
  action: SubscriptionLifecycleAction["action"],
  subscriptionReference: string,
  values: Record<string, unknown>,
  body: Record<string, unknown>,
) => {
  const target = mollieSubscriptionTarget(subscriptionReference, values, body);
  return (
    provider.toLowerCase() === "mollie" &&
    action === "cancel" &&
    Boolean(mollieApiKey()) &&
    Boolean(target.customerId) &&
    Boolean(target.subscriptionId)
  );
};

const canExecuteRazorpaySubscriptionAction = (
  provider: string,
  subscriptionReference: string,
) =>
  provider.toLowerCase() === "razorpay" &&
  Boolean(razorpayKeyId()) &&
  Boolean(razorpayKeySecret()) &&
  Boolean(subscriptionReference);

const safeStripeSubscriptionPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  status: textValue(value.status),
  cancelAtPeriodEnd: Boolean(
    value.cancel_at_period_end ?? value.cancelAtPeriodEnd,
  ),
  canceledAt: value.canceled_at ?? value.canceledAt ?? null,
  currentPeriodEnd: value.current_period_end ?? value.currentPeriodEnd ?? null,
  pauseCollection: toRecord(value.pause_collection || value.pauseCollection),
});

const safeStripeErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    type: textValue(error.type),
    message: textValue(error.message) || "Stripe subscription action failed.",
    declineCode: textValue(error.decline_code || error.declineCode),
    requestLogUrl: textValue(error.request_log_url || error.requestLogUrl),
  };
};

const safePayPalErrorPayload = (value: Record<string, unknown>) => ({
  name: textValue(value.name),
  message: textValue(value.message) || "PayPal subscription action failed.",
  debugId: textValue(value.debug_id || value.debugId),
  issue: textValue(
    toRecord(Array.isArray(value.details) ? value.details[0] : {}).issue,
  ),
  description: textValue(
    toRecord(Array.isArray(value.details) ? value.details[0] : {}).description,
  ),
});

const safePaddleSubscriptionPayload = (value: Record<string, unknown>) => {
  const data = toRecord(value.data || value);
  const scheduledChange = toRecord(
    data.scheduled_change || data.scheduledChange,
  );
  return {
    id: textValue(data.id),
    status: textValue(data.status),
    currencyCode: textValue(data.currency_code || data.currencyCode),
    nextBilledAt: textValue(data.next_billed_at || data.nextBilledAt),
    pausedAt: textValue(data.paused_at || data.pausedAt),
    canceledAt: textValue(data.canceled_at || data.canceledAt),
    scheduledChange: {
      action: textValue(scheduledChange.action),
      effectiveAt: textValue(
        scheduledChange.effective_at || scheduledChange.effectiveAt,
      ),
      resumeAt: textValue(
        scheduledChange.resume_at || scheduledChange.resumeAt,
      ),
    },
  };
};

const safePaddleErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    type: textValue(error.type || value.type),
    code: textValue(error.code || value.code),
    detail:
      textValue(error.detail || value.detail) ||
      "Paddle subscription action failed.",
    documentationUrl: textValue(
      error.documentation_url ||
        error.documentationUrl ||
        value.documentation_url ||
        value.documentationUrl,
    ),
  };
};

const safeSquareSubscriptionPayload = (value: Record<string, unknown>) => {
  const subscription = toRecord(value.subscription || value);
  const actions = Array.isArray(value.actions)
    ? value.actions
        .map((action) => {
          const entry = toRecord(action);
          return {
            id: textValue(entry.id),
            type: textValue(entry.type),
            effectiveDate: textValue(
              entry.effective_date || entry.effectiveDate,
            ),
          };
        })
        .filter((action) => action.id || action.type)
    : [];
  return {
    id: textValue(subscription.id),
    status: textValue(subscription.status),
    startDate: textValue(subscription.start_date || subscription.startDate),
    canceledDate: textValue(
      subscription.canceled_date || subscription.canceledDate,
    ),
    paidUntilDate: textValue(
      subscription.paid_until_date || subscription.paidUntilDate,
    ),
    timezone: textValue(subscription.timezone),
    version: subscription.version ?? null,
    actions,
  };
};

const safeSquareErrorPayload = (value: Record<string, unknown>) => {
  const errors = Array.isArray(value.errors) ? value.errors.map(toRecord) : [];
  const firstError = errors[0] || toRecord(value.error) || value;
  return {
    category: textValue(firstError.category),
    code: textValue(firstError.code),
    detail:
      textValue(firstError.detail || firstError.message) ||
      "Square subscription action failed.",
  };
};

const safeAdyenSubscriptionPayload = (value: Record<string, unknown>) => ({
  response: textValue(value.response),
  resultCode: textValue(value.resultCode),
  merchantAccount: textValue(value.merchantAccount),
  shopperReference: textValue(value.shopperReference),
  recurringDetailReference: textValue(value.recurringDetailReference),
  pspReference: textValue(value.pspReference),
});

const safeAdyenErrorPayload = (value: Record<string, unknown>) => ({
  status: Number(value.status || 0),
  errorCode: textValue(value.errorCode),
  message:
    textValue(value.message) ||
    textValue(value.response) ||
    "Adyen subscription action failed.",
  errorType: textValue(value.errorType),
  pspReference: textValue(value.pspReference),
});

const safeMollieSubscriptionPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  status: textValue(value.status) || "canceled",
  customerId: textValue(value.customerId),
  mode: textValue(value.mode),
  description: textValue(value.description),
  canceledAt: textValue(value.canceledAt),
  nextPaymentDate: textValue(value.nextPaymentDate),
});

const safeMollieErrorPayload = (value: Record<string, unknown>) => ({
  status: Number(value.status || 0),
  title: textValue(value.title),
  detail:
    textValue(value.detail) ||
    textValue(value.message) ||
    "Mollie subscription action failed.",
  field: textValue(value.field),
  type: textValue(value.type),
});

const safeRazorpaySubscriptionPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  entity: textValue(value.entity),
  status: textValue(value.status),
  planId: textValue(value.plan_id || value.planId),
  currentStart: value.current_start ?? value.currentStart ?? null,
  currentEnd: value.current_end ?? value.currentEnd ?? null,
  endedAt: value.ended_at ?? value.endedAt ?? null,
  paidCount: value.paid_count ?? value.paidCount ?? null,
  remainingCount: value.remaining_count ?? value.remainingCount ?? null,
});

const safeRazorpayErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code || value.code),
    description:
      textValue(error.description || error.message || value.description) ||
      "Razorpay subscription action failed.",
    source: textValue(error.source),
    step: textValue(error.step),
    reason: textValue(error.reason),
    field: textValue(error.field),
  };
};

const safeHttpProviderPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id || value.actionId || value.subscriptionActionId),
  status: textValue(value.status),
  provider: textValue(value.provider),
  reference: textValue(value.reference || value.subscriptionReference),
  message: textValue(value.message),
  nextStatus: textValue(value.nextStatus || value.lifecycleStatus),
});

const executeStripeSubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction["action"];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const params = new URLSearchParams();
  params.set("metadata[backy_subscription_action_id]", input.actionId);
  params.set("metadata[backy_subscription_action]", input.action);
  params.set(
    "metadata[backy_subscription_action_reason]",
    input.reason.slice(0, 500),
  );

  let method = "POST";
  let url = stripeSubscriptionEndpoint(input.subscriptionReference);

  if (input.action === "pause") {
    params.set("pause_collection[behavior]", "void");
  } else if (input.action === "resume") {
    url = stripeResumeEndpoint(input.subscriptionReference);
  } else {
    method = "DELETE";
    params.set("cancellation_details[comment]", input.reason.slice(0, 500));
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${stripeSecretKey()}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": input.actionId,
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
    payload: safeStripeSubscriptionPayload(payloadRecord),
  };
};

const executePayPalSubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction["action"];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const response = await fetch(
    paypalSubscriptionEndpoint(input.subscriptionReference, input.action),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${paypalAccessToken()}`,
        "content-type": "application/json",
        "paypal-request-id": input.actionId,
      },
      body: JSON.stringify({
        reason: input.reason.slice(0, 128),
      }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok && response.status !== 204) {
    return {
      ok: false as const,
      payload: safePayPalErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: {
      id: input.subscriptionReference,
      status:
        input.action === "pause"
          ? "SUSPENDED"
          : input.action === "resume"
            ? "ACTIVE"
            : "CANCELLED",
      httpStatus: response.status,
    },
  };
};

const executePaddleSubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction["action"];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const requestBody: Record<string, unknown> = {};
  if (input.action === "pause") {
    requestBody.effective_from = "next_billing_period";
  } else if (input.action === "resume") {
    requestBody.effective_from = "immediately";
  } else {
    requestBody.effective_from = "immediately";
  }

  const response = await fetch(
    paddleSubscriptionEndpoint(input.subscriptionReference, input.action),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${paddleApiKey()}`,
        "content-type": "application/json",
        "x-backy-idempotency-key": input.actionId,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safePaddleErrorPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safePaddleSubscriptionPayload(payloadRecord),
  };
};

const executeSquareSubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction["action"];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const requestBody =
    input.action === "pause"
      ? { pause_reason: input.reason.slice(0, 255) }
      : {};
  const response = await fetch(
    squareSubscriptionEndpoint(input.subscriptionReference, input.action),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${squareAccessToken()}`,
        "content-type": "application/json",
        "square-version": squareVersion(),
        "x-backy-idempotency-key": input.actionId,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    },
  );
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
    payload: safeSquareSubscriptionPayload(payloadRecord),
  };
};

const executeAdyenSubscriptionAction = async (input: {
  actionId: string;
  subscriptionReference: string;
  reason: string;
  values: Record<string, unknown>;
  body: Record<string, unknown>;
}) => {
  const target = adyenSubscriptionTarget(
    input.subscriptionReference,
    input.values,
    input.body,
  );
  const requestBody: Record<string, unknown> = {
    merchantAccount: adyenMerchantAccount(),
    shopperReference: target.shopperReference,
    contract: "RECURRING",
    reference: input.actionId,
    selectedRecurringDetailReference: target.recurringDetailReference || "ALL",
    metadata: {
      backy_subscription_action_id: input.actionId,
      backy_subscription_action: "cancel",
      backy_subscription_action_reason: input.reason.slice(0, 500),
    },
  };

  const response = await fetch(adyenDisableEndpoint(), {
    method: "POST",
    headers: {
      "x-api-key": adyenApiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
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
    payload: {
      ...safeAdyenSubscriptionPayload(payloadRecord),
      shopperReference:
        textValue(payloadRecord.shopperReference) || target.shopperReference,
      recurringDetailReference:
        textValue(payloadRecord.recurringDetailReference) ||
        target.recurringDetailReference ||
        "ALL",
    },
  };
};

const executeMollieSubscriptionAction = async (input: {
  subscriptionReference: string;
  values: Record<string, unknown>;
  body: Record<string, unknown>;
}) => {
  const target = mollieSubscriptionTarget(
    input.subscriptionReference,
    input.values,
    input.body,
  );
  const response = await fetch(
    mollieSubscriptionEndpoint(target.customerId, target.subscriptionId),
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${mollieApiKey()}`,
        "content-type": "application/json",
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
    payload: {
      ...safeMollieSubscriptionPayload(payloadRecord),
      id: textValue(payloadRecord.id) || target.subscriptionId,
      customerId: textValue(payloadRecord.customerId) || target.customerId,
    },
  };
};

const executeRazorpaySubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction["action"];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const requestBody: Record<string, unknown> = {
    notes: {
      backy_subscription_action_id: input.actionId,
      backy_subscription_action: input.action,
      backy_subscription_action_reason: input.reason.slice(0, 500),
    },
  };
  if (input.action === "cancel") {
    requestBody.cancel_at_cycle_end = false;
  }
  if (input.action === "resume") {
    requestBody.resume_at = "now";
  }

  const response = await fetch(
    razorpaySubscriptionEndpoint(input.subscriptionReference, input.action),
    {
      method: "POST",
      headers: {
        authorization: razorpayBasicAuth(),
        "content-type": "application/json",
        "x-backy-idempotency-key": input.actionId,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    },
  );
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
    payload: safeRazorpaySubscriptionPayload(payloadRecord),
  };
};

const executeHttpSubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction["action"];
  actionId: string;
  subscriptionReference: string;
  reason: string;
  provider: string;
  providerTarget?: Record<string, unknown>;
  product: ReturnType<typeof productRecordToCommerceProduct>;
  order: SourceRecord;
}) => {
  const values = toRecord(input.order.values);
  const response = await fetch(subscriptionActionProviderUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-backy-provider-kind": "subscription-action",
      "x-backy-subscription-action": input.action,
    },
    body: JSON.stringify({
      schemaVersion: "backy.product-subscription-action-request.v1",
      action: input.action,
      provider: input.provider,
      idempotencyKey: input.actionId,
      reason: input.reason,
      providerTarget: input.providerTarget || null,
      product: {
        id: input.product.id,
        slug: input.product.slug,
        title: input.product.title,
        sku: input.product.sku,
        subscription: input.product.subscription,
      },
      order: {
        id: input.order.id,
        slug: input.order.slug,
        orderNumber: textValue(values.ordernumber) || input.order.slug,
        paymentProvider: textValue(values.paymentprovider),
        paymentReference: textValue(values.paymentreference),
        paymentStatus: textValue(values.paymentstatus),
        fulfillmentStatus: textValue(values.fulfillmentstatus),
        currency: textValue(values.currency),
        total: Number(values.total || 0),
      },
      subscription: {
        reference: input.subscriptionReference,
      },
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const payloadRecord = toRecord(payload);

  if (!response.ok) {
    return {
      ok: false as const,
      payload: safeHttpProviderPayload(payloadRecord),
    };
  }

  return {
    ok: true as const,
    payload: safeHttpProviderPayload(payloadRecord),
  };
};

const appendNote = (current: unknown, note: string): string => {
  const existing = textValue(current);
  return existing ? `${existing}\n${note}` : note;
};

const parseSubscriptionActionHistory = (
  value: unknown,
): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return parseSubscriptionActionHistory(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return [];
};

const compactSubscriptionAction = (
  action: SubscriptionLifecycleAction,
): Record<string, BackyJsonValue> => ({
  id: action.id,
  schemaVersion: action.schemaVersion,
  action: action.action,
  status: action.status,
  provider: action.provider,
  executionMode: action.executionMode,
  subscriptionReference: action.subscriptionReference,
  reason: action.reason,
  requestedAt: action.requestedAt,
  completedAt: action.completedAt,
});

const appendSubscriptionActionHistory = (
  current: unknown,
  action: SubscriptionLifecycleAction,
): Array<Record<string, BackyJsonValue>> =>
  [
    compactSubscriptionAction(action),
    ...parseSubscriptionActionHistory(current).map((entry) => ({
      id: textValue(entry.id),
      schemaVersion:
        textValue(entry.schemaVersion) ||
        "backy.product-subscription-action.v1",
      action: textValue(entry.action),
      status: textValue(entry.status),
      provider: textValue(entry.provider),
      executionMode: textValue(entry.executionMode),
      subscriptionReference: textValue(entry.subscriptionReference),
      reason: textValue(entry.reason),
      requestedAt: textValue(entry.requestedAt),
      completedAt: textValue(entry.completedAt) || null,
    })),
  ]
    .filter((entry) => entry.id)
    .slice(0, 20);

const lifecycleEventName = (action: SubscriptionLifecycleAction["action"]) => {
  if (action === "pause") return "customer.subscription.paused";
  if (action === "resume") return "customer.subscription.resumed";
  return "customer.subscription.deleted";
};

const collectionRecordAuditMetadata = (
  collection: CollectionAuditSource,
  record: SourceRecord,
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

const subscriptionActionAuditMetadata = (
  collection: CollectionAuditSource,
  record: SourceRecord,
  action: SubscriptionLifecycleAction,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  subscriptionActionId: action.id,
  subscriptionAction: action.action,
  subscriptionActionStatus: action.status,
  provider: action.provider,
  executionMode: action.executionMode,
  subscriptionReference: action.subscriptionReference,
  requestedAt: action.requestedAt,
  completedAt: action.completedAt,
});

const subscriptionOrderWebhookSnapshot = (
  collection: CollectionAuditSource,
  record: SourceRecord,
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
    total: Number(values.total || 0),
    currency: textValue(values.currency),
  };
};

const subscriptionProductWebhookSnapshot = (
  record: SourceRecord,
): BackyJsonObject => {
  const product = productRecordToCommerceProduct(
    sourceRecordFromRecord(record),
  );

  return {
    productId: product.id,
    recordId: record.id,
    slug: product.slug,
    title: product.title,
    sku: product.sku,
    status: product.status,
    subscriptionEnabled: product.subscription.enabled,
    subscriptionInterval: product.subscription.interval,
  };
};

const subscriptionActionWebhookSnapshot = (
  action: SubscriptionLifecycleAction,
): BackyJsonObject => ({
  id: action.id,
  action: action.action,
  status: action.status,
  provider: action.provider,
  executionMode: action.executionMode,
  productId: action.productId,
  orderId: action.orderId,
  subscriptionReference: action.subscriptionReference,
  requestedAt: action.requestedAt,
  completedAt: action.completedAt,
});

const deliverProductSubscriptionActionWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  product: SourceRecord;
  before: SourceRecord;
  after: SourceRecord;
  action: SubscriptionLifecycleAction;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "commerce.product.subscription_action",
    data: {
      resourceType: "collectionRecord",
      product: subscriptionProductWebhookSnapshot(params.product),
      before: subscriptionOrderWebhookSnapshot(
        params.collection,
        params.before,
      ),
      after: subscriptionOrderWebhookSnapshot(params.collection, params.after),
      subscriptionAction: subscriptionActionWebhookSnapshot(params.action),
    },
    metadata: {
      action: "commerce.product.subscription_action",
      changedKeys: ["content", "collections", "commerce"],
      source: "admin-commerce-product-subscription-action-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      productId: params.product.id,
      productSlug: params.action.productSlug,
      orderId: params.after.id,
      orderSlug: params.after.slug,
      subscriptionActionId: params.action.id,
      subscriptionAction: params.action.action,
      subscriptionActionStatus: params.action.status,
      provider: params.action.provider,
      executionMode: params.action.executionMode,
    },
  });

const buildSubscriptionActionUpdate = async (
  productRecord: SourceRecord,
  orderRecord: SourceRecord,
  body: Record<string, unknown>,
): Promise<SubscriptionActionUpdateResult> => {
  const actionName = normalizeAction(body.action);
  if (!actionName) {
    return {
      error: {
        status: 400,
        code: "INVALID_SUBSCRIPTION_ACTION",
        message: "Subscription action must be pause, resume, or cancel.",
      },
    };
  }

  if (!orderContainsProduct(orderRecord, productRecord)) {
    return {
      error: {
        status: 404,
        code: "SUBSCRIPTION_ORDER_NOT_FOUND",
        message: "Subscription order is not attached to this product.",
      },
    };
  }

  const now = new Date().toISOString();
  const values = toRecord(orderRecord.values);
  const product = productRecordToCommerceProduct(
    sourceRecordFromRecord(productRecord),
  );
  const provider = (
    textValue(body.provider) ||
    textValue(values.paymentprovider) ||
    "manual"
  ).toLowerCase();
  const subscriptionReference =
    textValue(body.subscriptionReference) || textValue(values.paymentreference);
  if (!subscriptionReference) {
    return {
      error: {
        status: 400,
        code: "SUBSCRIPTION_REFERENCE_REQUIRED",
        message:
          "A provider subscription reference is required before running lifecycle actions.",
      },
    };
  }

  const reason =
    textValue(body.reason) ||
    `Backy operator requested subscription ${actionName}.`;
  const actionId = `subact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const shouldExecuteStripe = canExecuteStripeSubscriptionAction(
    provider,
    subscriptionReference,
  );
  const shouldExecutePayPal = canExecutePayPalSubscriptionAction(
    provider,
    subscriptionReference,
  );
  const shouldExecutePaddle = canExecutePaddleSubscriptionAction(
    provider,
    subscriptionReference,
  );
  const shouldExecuteSquare = canExecuteSquareSubscriptionAction(
    provider,
    subscriptionReference,
  );
  const shouldExecuteAdyen = canExecuteAdyenSubscriptionAction(
    provider,
    actionName,
    subscriptionReference,
    values,
    body,
  );
  const shouldExecuteMollie = canExecuteMollieSubscriptionAction(
    provider,
    actionName,
    subscriptionReference,
    values,
    body,
  );
  const shouldExecuteRazorpay = canExecuteRazorpaySubscriptionAction(
    provider,
    subscriptionReference,
  );
  const shouldExecuteHttp = canExecuteHttpSubscriptionAction(provider);
  const httpSubscriptionActionFallbackConfigured = Boolean(
    subscriptionActionProviderUrl(),
  );
  const executionMode: SubscriptionLifecycleAction["executionMode"] =
    shouldExecuteStripe
      ? "stripe-api"
      : shouldExecutePayPal
        ? "paypal-api"
        : shouldExecutePaddle
          ? "paddle-api"
          : shouldExecuteSquare
            ? "square-api"
            : shouldExecuteAdyen
              ? "adyen-api"
              : shouldExecuteMollie
                ? "mollie-api"
                : shouldExecuteRazorpay
                  ? "razorpay-api"
                  : shouldExecuteHttp
                    ? "http-api"
                    : "handoff";
  const providerPayload: Record<string, unknown> = {
    schemaVersion: "backy.product-subscription-action.v1",
    action: `subscription.${actionName}`,
    provider,
    executionMode,
    productId: product.id,
    productSlug: product.slug,
    orderId: orderRecord.id,
    orderSlug: orderRecord.slug,
    subscriptionReference,
    reason,
    idempotencyKey: actionId,
  };
  if (provider === "adyen") {
    const supportedDirectActions = httpSubscriptionActionFallbackConfigured
      ? ["pause", "resume", "cancel"]
      : ["cancel"];
    providerPayload.adapter = {
      nativeDirectActions: ["cancel"],
      httpFallbackActions: httpSubscriptionActionFallbackConfigured
        ? ["pause", "resume", "cancel"]
        : [],
      supportedDirectActions,
      unsupportedAction: supportedDirectActions.includes(actionName)
        ? ""
        : actionName,
      shopperReference: adyenSubscriptionTarget(
        subscriptionReference,
        values,
        body,
      ).shopperReference,
      recurringDetailReference:
        adyenSubscriptionTarget(subscriptionReference, values, body)
          .recurringDetailReference || "ALL",
    };
  }
  if (provider === "mollie") {
    const target = mollieSubscriptionTarget(
      subscriptionReference,
      values,
      body,
    );
    const supportedDirectActions = httpSubscriptionActionFallbackConfigured
      ? ["pause", "resume", "cancel"]
      : ["cancel"];
    providerPayload.adapter = {
      nativeDirectActions: ["cancel"],
      httpFallbackActions: httpSubscriptionActionFallbackConfigured
        ? ["pause", "resume", "cancel"]
        : [],
      supportedDirectActions,
      unsupportedAction: supportedDirectActions.includes(actionName)
        ? ""
        : actionName,
      customerId: target.customerId,
      subscriptionId: target.subscriptionId,
    };
  }
  if (provider === "razorpay") {
    providerPayload.adapter = {
      supportedDirectActions: ["pause", "resume", "cancel"],
      subscriptionId: subscriptionReference,
    };
  }
  let status: SubscriptionLifecycleAction["status"] =
    shouldExecuteStripe ||
    shouldExecutePayPal ||
    shouldExecutePaddle ||
    shouldExecuteSquare ||
    shouldExecuteAdyen ||
    shouldExecuteMollie ||
    shouldExecuteRazorpay ||
    shouldExecuteHttp
      ? "requested"
      : "requires_action";
  let completedAt: string | null = null;
  let statusNote =
    shouldExecuteStripe ||
    shouldExecutePayPal ||
    shouldExecutePaddle ||
    shouldExecuteSquare ||
    shouldExecuteAdyen ||
    shouldExecuteMollie ||
    shouldExecuteRazorpay ||
    shouldExecuteHttp
      ? "requested"
      : "handoff";

  if (shouldExecuteStripe) {
    const result = await executeStripeSubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      status = "succeeded";
      completedAt = new Date().toISOString();
      statusNote = "executed";
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecutePayPal) {
    const result = await executePayPalSubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      status = "succeeded";
      completedAt = new Date().toISOString();
      statusNote = "executed";
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecutePaddle) {
    const result = await executePaddleSubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      status = "succeeded";
      completedAt = new Date().toISOString();
      statusNote = "executed";
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecuteSquare) {
    const result = await executeSquareSubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      status = "succeeded";
      completedAt = new Date().toISOString();
      statusNote = "executed";
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecuteAdyen) {
    const result = await executeAdyenSubscriptionAction({
      actionId,
      subscriptionReference,
      reason,
      values,
      body,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const adyenStatus = textValue(
        result.payload.response || result.payload.resultCode,
      ).toLowerCase();
      if (
        adyenStatus === "[detail-successfully-disabled]" ||
        adyenStatus === "success" ||
        adyenStatus === "received" ||
        !adyenStatus
      ) {
        status = "succeeded";
      } else if (
        adyenStatus.includes("fail") ||
        adyenStatus.includes("error")
      ) {
        status = "failed";
      } else {
        status = "requires_action";
      }
      completedAt =
        status === "requires_action" ? null : new Date().toISOString();
      statusNote = status === "succeeded" ? "executed" : status;
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecuteMollie) {
    const result = await executeMollieSubscriptionAction({
      subscriptionReference,
      values,
      body,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const mollieStatus = textValue(result.payload.status).toLowerCase();
      if (
        !mollieStatus ||
        mollieStatus === "canceled" ||
        mollieStatus === "cancelled"
      ) {
        status = "succeeded";
      } else if (mollieStatus === "failed" || mollieStatus === "error") {
        status = "failed";
      } else {
        status = "requires_action";
      }
      completedAt =
        status === "requires_action" ? null : new Date().toISOString();
      statusNote = status === "succeeded" ? "executed" : status;
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecuteRazorpay) {
    const result = await executeRazorpaySubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const razorpayStatus = textValue(result.payload.status).toLowerCase();
      if (
        razorpayStatus === "cancelled" ||
        razorpayStatus === "canceled" ||
        razorpayStatus === "paused" ||
        razorpayStatus === "active" ||
        razorpayStatus === "authenticated"
      ) {
        status = "succeeded";
      } else if (razorpayStatus === "failed" || razorpayStatus === "error") {
        status = "failed";
      } else {
        status = "requires_action";
      }
      completedAt =
        status === "requires_action" ? null : new Date().toISOString();
      statusNote = status === "succeeded" ? "executed" : status;
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  } else if (shouldExecuteHttp) {
    const result = await executeHttpSubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
      provider,
      providerTarget:
        provider === "adyen"
          ? adyenSubscriptionTarget(subscriptionReference, values, body)
          : provider === "mollie"
            ? mollieSubscriptionTarget(subscriptionReference, values, body)
            : undefined,
      product,
      order: orderRecord,
    });
    providerPayload.execution = result;
    if (result.ok) {
      const providerStatus = result.payload.status.toLowerCase();
      if (providerStatus === "failed" || providerStatus === "error") {
        status = "failed";
      } else if (
        providerStatus === "requires_action" ||
        providerStatus === "requires-action"
      ) {
        status = "requires_action";
      } else {
        status = "succeeded";
      }
      completedAt =
        status === "requires_action" ? null : new Date().toISOString();
      statusNote = status === "succeeded" ? "executed" : status;
    } else {
      status = "failed";
      completedAt = new Date().toISOString();
      statusNote = "failed";
    }
  }

  const action: SubscriptionLifecycleAction = {
    id: actionId,
    schemaVersion: "backy.product-subscription-action.v1",
    action: actionName,
    status,
    provider,
    executionMode,
    productId: product.id,
    productSlug: product.slug,
    orderId: orderRecord.id,
    orderSlug: orderRecord.slug,
    subscriptionReference,
    reason,
    requestedAt: now,
    completedAt,
    providerPayload,
  };
  const shouldApplyLocalState =
    status === "succeeded" || status === "requires_action";
  const lifecycleNote = `[${now}] Subscription action ${statusNote} ${status}: ${lifecycleEventName(actionName)} for ${subscriptionReference} via ${provider}. Reason: ${reason}`;

  return {
    action,
    values: {
      ...values,
      ...(shouldApplyLocalState && actionName === "cancel"
        ? {
            orderstatus: "cancelled",
            ...(textValue(values.fulfillmentstatus) === "fulfilled"
              ? {}
              : { fulfillmentstatus: "cancelled" }),
          }
        : {}),
      ...(shouldApplyLocalState && actionName === "resume"
        ? {
            orderstatus: "paid",
            paymentstatus: "paid",
            paidat: textValue(values.paidat) || now,
          }
        : {}),
      paymentreference: subscriptionReference,
      subscriptionactionhistory: appendSubscriptionActionHistory(
        values.subscriptionactionhistory,
        action,
      ),
      notes: appendNote(values.notes, lifecycleNote),
    },
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "commerce.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, productId, orderId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site)
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );

      const [productsCollection, ordersCollection] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
      ]);
      if (!productsCollection)
        return errorResponse(
          404,
          "PRODUCT_CATALOG_NOT_FOUND",
          "Product catalog not found",
          requestId,
        );
      if (!ordersCollection)
        return errorResponse(
          404,
          "ORDER_QUEUE_NOT_FOUND",
          "Private order queue not found",
          requestId,
        );
      const commerceAccess = await requireCommerceCollectionAccess(
        request,
        requestId,
        ordersCollection.slug,
        "edit",
      );
      if (commerceAccess) return commerceAccess;

      const [product, order] = await Promise.all([
        repositories.collections.getRecordById(
          site.id,
          productsCollection.id,
          productId,
        ) ||
          repositories.collections.getRecordBySlug(
            site.id,
            productsCollection.id,
            productId,
          ),
        repositories.collections.getRecordById(
          site.id,
          ordersCollection.id,
          orderId,
        ) ||
          repositories.collections.getRecordBySlug(
            site.id,
            ordersCollection.id,
            orderId,
          ),
      ]);
      if (!product)
        return errorResponse(
          404,
          "PRODUCT_NOT_FOUND",
          "Product not found",
          requestId,
        );
      if (!order)
        return errorResponse(
          404,
          "ORDER_NOT_FOUND",
          "Subscription order not found",
          requestId,
        );

      const result = await buildSubscriptionActionUpdate(product, order, body);
      if ("error" in result)
        return errorResponse(
          result.error.status,
          result.error.code,
          result.error.message,
          requestId,
          result.error.details,
        );

      const values = normalizeCollectionRecordMediaValues(
        ordersCollection,
        result.values,
      );
      const validationErrors = await validateRepositoryCollectionRecordValues({
        repository: repositories.collections,
        mediaRepository: repositories.media,
        siteId: site.id,
        collection: ordersCollection,
        values,
        existingValues: order.values,
        excludeRecordId: order.id,
      });
      if (validationErrors.length > 0) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Subscription action values are invalid",
          requestId,
          validationErrors,
        );
      }

      const updated = (
        await repositories.collections.updateRecord(
          site.id,
          ordersCollection.id,
          order.id,
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
          reason: "product-subscription-action",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "collectionRecord",
        entityId: updated.id,
        action: "update",
        before: collectionRecordAuditMetadata(ordersCollection, order),
        after: collectionRecordAuditMetadata(ordersCollection, updated),
        metadata: subscriptionActionAuditMetadata(
          ordersCollection,
          updated,
          result.action,
        ),
        requestId,
      });
      await deliverProductSubscriptionActionWebhook({
        repositories,
        site,
        collection: ordersCollection,
        product,
        before: order,
        after: updated,
        action: result.action,
        requestId,
        actor: access.session?.user.id,
      });

      return subscriptionActionResponse(
        {
          success: true,
          requestId,
          schemaVersion: SUBSCRIPTION_ACTION_SCHEMA_VERSION,
          data: {
            action: result.action,
            record: updated,
            order: updated,
            cacheInvalidation,
          },
          action: result.action,
        },
        requestId,
        site.id,
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site)
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    const productsCollection = getCollectionByIdOrSlug(
      site.id,
      PRODUCT_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    const ordersCollection = getCollectionByIdOrSlug(
      site.id,
      ORDERS_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    if (!productsCollection)
      return errorResponse(
        404,
        "PRODUCT_CATALOG_NOT_FOUND",
        "Product catalog not found",
        requestId,
      );
    if (!ordersCollection)
      return errorResponse(
        404,
        "ORDER_QUEUE_NOT_FOUND",
        "Private order queue not found",
        requestId,
      );
    const commerceAccess = await requireCommerceCollectionAccess(
      request,
      requestId,
      ordersCollection.slug,
      "edit",
    );
    if (commerceAccess) return commerceAccess;

    const product = getCollectionRecordByIdOrSlug(
      site.id,
      productsCollection.id,
      productId,
      { includeUnpublished: true },
    );
    const order = getCollectionRecordByIdOrSlug(
      site.id,
      ordersCollection.id,
      orderId,
      { includeUnpublished: true },
    );
    if (!product)
      return errorResponse(
        404,
        "PRODUCT_NOT_FOUND",
        "Product not found",
        requestId,
      );
    if (!order)
      return errorResponse(
        404,
        "ORDER_NOT_FOUND",
        "Subscription order not found",
        requestId,
      );

    const result = await buildSubscriptionActionUpdate(product, order, body);
    if ("error" in result)
      return errorResponse(
        result.error.status,
        result.error.code,
        result.error.message,
        requestId,
        result.error.details,
      );

    const values = normalizeCollectionRecordMediaValues(
      ordersCollection as unknown as BackyCollection,
      result.values,
    );
    const validationErrors = validateCollectionRecordValues(
      ordersCollection,
      values,
      {
        existingValues: order.values,
        excludeRecordId: order.id,
      },
    );
    if (validationErrors.length > 0) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Subscription action values are invalid",
        requestId,
        validationErrors,
      );
    }

    const updated = updateAdminCollectionRecord(
      site.id,
      ordersCollection.id,
      order.id,
      { values },
    );
    if (!updated)
      return errorResponse(
        404,
        "ORDER_NOT_FOUND",
        "Subscription order not found",
        requestId,
      );

    await recordAdminAudit({
      siteId: site.id,
      entity: "collectionRecord",
      entityId: updated.id,
      action: "update",
      before: collectionRecordAuditMetadata(ordersCollection, order),
      after: collectionRecordAuditMetadata(ordersCollection, updated),
      metadata: subscriptionActionAuditMetadata(
        ordersCollection,
        updated,
        result.action,
      ),
      requestId,
    });
    await deliverProductSubscriptionActionWebhook({
      site: site as unknown as Site,
      collection: ordersCollection,
      product,
      before: order,
      after: updated,
      action: result.action,
      requestId,
      actor: access.session?.user.id,
    });

    return subscriptionActionResponse(
      {
        success: true,
        requestId,
        schemaVersion: SUBSCRIPTION_ACTION_SCHEMA_VERSION,
        data: { action: result.action, record: updated, order: updated },
        action: result.action,
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin product subscription action API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
