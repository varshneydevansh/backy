/**
 * Public commerce order intake endpoint.
 *
 * GET /api/sites/[siteId]/commerce/orders
 * POST /api/sites/[siteId]/commerce/orders
 */

import { NextRequest } from "next/server";
import type {
  BackyCollectionField,
  BackyJsonObject,
  BackyJsonValue,
} from "@backy-cms/core";
import {
  PRODUCT_COLLECTION_SLUG,
  buildCommerceStorefrontContract,
  isCommerceSourceRecord,
  productRecordToCommerceProduct,
  type CommerceProduct,
  type CommerceSourceRecord,
  type CommerceStorefrontContract,
} from "@/lib/commerceCatalog";
import {
  createAdminCollection,
  createAdminCollectionRecord,
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
  updateAdminCollection,
  updateAdminCollectionRecord,
} from "@/lib/backyStore";
import { publicContractJson } from "@/lib/publicContractResponse";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import {
  notifyCommerceOrderCreated,
  notifyCommerceProductLowStock,
  type CommerceOrderNotificationOrder,
  type CommerceProductNotificationProduct,
} from "@/lib/commerceOrderDelivery";

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

interface CheckoutItemInput {
  productId?: string;
  slug?: string;
  variantId?: string;
  variantSku?: string;
  quantity?: number;
}

interface CheckoutCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
}

interface CheckoutOrderInput {
  items?: CheckoutItemInput[];
  customer?: CheckoutCustomerInput;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  discountCode?: string;
  paymentProvider?: string;
  paymentReference?: string;
  checkoutSessionId?: string;
}

interface CheckoutSessionHandoff {
  id: string;
  provider: "manual" | "stripe";
  providerMode: "test" | "live";
  accountId: string | null;
  status: "requires_action" | "provider_ready" | "provider_created";
  handoffMode: "manual" | "provider";
  url: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
  reference: string;
  amountTotal: number;
  currency: string;
  metadata: Record<string, string>;
  providerPayload: Record<string, unknown> | null;
}

type QuoteProviderKind = "tax" | "shipping" | "discount";

interface CheckoutQuoteProviderAdjustment {
  kind: QuoteProviderKind;
  provider: "http" | "taxjar" | "avalara" | "easypost" | "shippo" | "stripe";
  status: "succeeded" | "failed" | "skipped";
  url?: string;
  statusCode?: number;
  amount?: number;
  lines?: Array<Record<string, unknown>>;
  reference?: string;
  error?: string;
}

const ORDERS_COLLECTION_SLUG = "orders";
const CUSTOMERS_COLLECTION_SLUG = "customers";
const ORDER_CONTRACT_VERSION = "backy.commerce-orders.v1";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CHECKOUT_ITEM_QUANTITY = 999;
type OrderRiskLevel = "low" | "medium" | "high";

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

class CheckoutProviderError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(
    message: string,
    details?: unknown,
    status = 502,
    code = "CHECKOUT_PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "CheckoutProviderError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const hasPublicOrderCollectionAccess = (permissions: {
  publicRead?: boolean;
  publicCreate?: boolean;
  publicUpdate?: boolean;
  publicDelete?: boolean;
}) =>
  permissions.publicRead === true ||
  permissions.publicCreate === true ||
  permissions.publicUpdate === true ||
  permissions.publicDelete === true;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
) =>
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: "error" },
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

const toJsonRecord = (
  value: Record<string, unknown>,
): Record<string, BackyJsonValue> => value as Record<string, BackyJsonValue>;

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const moneyValue = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const centsValue = (value: number): number =>
  Math.max(0, Math.round(moneyValue(value) * 100));

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const numberValue = (value: unknown, fallback = 0): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const envValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const optionalNumberValue = (value: unknown): number | null => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const zeroDecimalCurrencies = new Set([
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

const fromProviderAmount = (
  amount: unknown,
  currency: string,
): number | null => {
  const parsed = numberValue(amount, Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const normalizedCurrency = currency.trim().toUpperCase();
  return moneyValue(
    zeroDecimalCurrencies.has(normalizedCurrency) ? parsed : parsed / 100,
  );
};

const taxJarApiKey = () => envValue(["BACKY_TAXJAR_API_KEY", "TAXJAR_API_KEY"]);

const taxJarApiBaseUrl = () =>
  (
    envValue(["BACKY_TAXJAR_API_BASE_URL", "TAXJAR_API_BASE_URL"]) ||
    "https://api.taxjar.com/v2"
  ).replace(/\/$/, "");

const avalaraAccountId = () =>
  envValue(["BACKY_AVALARA_ACCOUNT_ID", "AVALARA_ACCOUNT_ID"]);

const avalaraLicenseKey = () =>
  envValue(["BACKY_AVALARA_LICENSE_KEY", "AVALARA_LICENSE_KEY"]);

const avalaraCompanyCode = () =>
  envValue(["BACKY_AVALARA_COMPANY_CODE", "AVALARA_COMPANY_CODE"]);

const avalaraApiBaseUrl = () =>
  (
    envValue(["BACKY_AVALARA_API_BASE_URL", "AVALARA_API_BASE_URL"]) ||
    "https://sandbox-rest.avatax.com"
  ).replace(/\/$/, "");

const easyPostApiKey = () =>
  envValue(["BACKY_EASYPOST_API_KEY", "EASYPOST_API_KEY"]);

const easyPostApiBaseUrl = () =>
  (
    envValue(["BACKY_EASYPOST_API_BASE_URL", "EASYPOST_API_BASE_URL"]) ||
    "https://api.easypost.com/v2"
  ).replace(/\/$/, "");

const shippoApiKey = () => envValue(["BACKY_SHIPPO_API_KEY", "SHIPPO_API_KEY"]);

const shippoApiBaseUrl = () =>
  (
    envValue(["BACKY_SHIPPO_API_BASE_URL", "SHIPPO_API_BASE_URL"]) ||
    "https://api.goshippo.com"
  ).replace(/\/$/, "");

const stripeDiscountApiBaseUrl = () =>
  (
    envValue([
      "BACKY_STRIPE_DISCOUNT_API_BASE_URL",
      "BACKY_STRIPE_API_BASE_URL",
      "STRIPE_API_BASE_URL",
    ]) || "https://api.stripe.com"
  ).replace(/\/$/, "");

const normalizeCheckoutInput = (
  body: Record<string, unknown>,
): CheckoutOrderInput => {
  const customer =
    body.customer &&
    typeof body.customer === "object" &&
    !Array.isArray(body.customer)
      ? (body.customer as Record<string, unknown>)
      : {};

  return {
    items: Array.isArray(body.items)
      ? body.items.map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as CheckoutItemInput)
            : {},
        )
      : [],
    customer: {
      name: textValue(customer.name),
      email: textValue(customer.email).toLowerCase(),
      phone: textValue(customer.phone),
    },
    shippingAddress: textValue(body.shippingAddress),
    billingAddress: textValue(body.billingAddress),
    notes: textValue(body.notes),
    discountCode: textValue(
      body.discountCode || body.couponCode || body.promoCode,
    ).toUpperCase(),
    paymentProvider: textValue(body.paymentProvider),
    paymentReference: textValue(body.paymentReference),
    checkoutSessionId: textValue(
      body.checkoutSessionId || body.checkoutSession,
    ),
  };
};

const buildOrderNumber = () =>
  `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const notifyOrderCreated = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  siteId: string;
  order: CommerceOrderNotificationOrder;
  requestId: string;
}) => {
  try {
    return await notifyCommerceOrderCreated(params);
  } catch (error) {
    console.error("Commerce order notification delivery failed:", error);
    return [
      {
        attempted: false as const,
        channel: "system" as const,
        status: "failed" as const,
        error:
          error instanceof Error
            ? error.message
            : "Commerce order notification delivery failed.",
      },
    ];
  }
};

const buildAbsoluteUrl = (
  request: NextRequest,
  path: string,
  params: Record<string, string> = {},
): string => {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, request.url);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

const normalizeSlug = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";

const normalizeEmail = (value: unknown): string =>
  textValue(value).toLowerCase();

const customerSlug = (email: string): string =>
  normalizeSlug(email.replace("@", "-at-")) ||
  `customer-${Date.now().toString(36)}`;

const customerFields = (): BackyCollectionField[] => [
  {
    id: "field-customer-name",
    key: "name",
    label: "Name",
    type: "text",
    required: true,
  },
  {
    id: "field-customer-email",
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    unique: true,
  },
  { id: "field-customer-phone", key: "phone", label: "Phone", type: "text" },
  {
    id: "field-customer-status",
    key: "status",
    label: "Status",
    type: "select",
    options: ["lead", "customer", "vip", "inactive"],
  },
  { id: "field-customer-source", key: "source", label: "Source", type: "text" },
  {
    id: "field-customer-last-order-id",
    key: "lastorderid",
    label: "Last Order ID",
    type: "text",
  },
  {
    id: "field-customer-last-order-number",
    key: "lastordernumber",
    label: "Last Order Number",
    type: "text",
  },
  {
    id: "field-customer-last-order-at",
    key: "lastorderat",
    label: "Last Order At",
    type: "date",
  },
  {
    id: "field-customer-order-count",
    key: "ordercount",
    label: "Order Count",
    type: "number",
  },
  {
    id: "field-customer-total-spent",
    key: "totalspent",
    label: "Total Spent",
    type: "number",
  },
  {
    id: "field-customer-notes",
    key: "notes",
    label: "Notes",
    type: "richText",
  },
  {
    id: "field-customer-source-values",
    key: "sourcevalues",
    label: "Source Values",
    type: "json",
  },
];

const customerCollectionInput = () => ({
  name: "Customers",
  slug: CUSTOMERS_COLLECTION_SLUG,
  description:
    "Private customer profiles promoted from Backy contacts and commerce workflows.",
  status: "draft",
  listRoutePattern: "/customers",
  routePattern: "/customers/:recordSlug",
  fields: customerFields(),
  permissions: {
    publicRead: false,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
  },
  metadata: {
    schemaVersion: "backy.customers.v1",
    source: "commerce-order-intake",
  },
});

const ensureCustomerFields = <T extends { key: string }>(collection: {
  fields: T[];
}): Array<T | BackyCollectionField> => {
  const existingKeys = new Set(
    (collection.fields || []).map((field) => field.key),
  );
  const missingFields = customerFields().filter(
    (field) => !existingKeys.has(field.key),
  );
  return missingFields.length > 0
    ? [...(collection.fields || []), ...missingFields]
    : collection.fields || [];
};

const checkoutCustomerValues = ({
  input,
  existingValues,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  input: CheckoutOrderInput;
  existingValues?: Record<string, unknown>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}): Record<string, BackyJsonValue> => {
  const existingOrderCount = Math.max(
    0,
    Number(existingValues?.ordercount || 0),
  );
  const existingTotalSpent = Math.max(
    0,
    Number(existingValues?.totalspent || 0),
  );
  const existingSourceValues =
    existingValues?.sourcevalues &&
    typeof existingValues.sourcevalues === "object" &&
    !Array.isArray(existingValues.sourcevalues)
      ? (existingValues.sourcevalues as Record<string, unknown>)
      : {};

  return {
    name: (input.customer?.name ||
      existingValues?.name ||
      input.customer?.email ||
      "Customer") as BackyJsonValue,
    email: normalizeEmail(input.customer?.email) as BackyJsonValue,
    phone: (input.customer?.phone ||
      existingValues?.phone ||
      "") as BackyJsonValue,
    status: (existingValues?.status || "customer") as BackyJsonValue,
    source: "checkout",
    lastorderid: orderId,
    lastordernumber: orderNumber,
    lastorderat: orderCreatedAt,
    ordercount: existingOrderCount + 1,
    totalspent: moneyValue(existingTotalSpent + total),
    notes: (existingValues?.notes || "") as BackyJsonValue,
    sourcevalues: {
      ...existingSourceValues,
      lastCheckoutOrder: {
        orderId,
        orderNumber,
        total,
        requestId,
        updatedAt: orderCreatedAt,
      },
    } as BackyJsonValue,
  };
};

const checkoutCustomerOrderLinkValues = ({
  existingValues,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  existingValues?: Record<string, unknown>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}): Record<string, BackyJsonValue> => {
  const existingSourceValues =
    existingValues?.sourcevalues &&
    typeof existingValues.sourcevalues === "object" &&
    !Array.isArray(existingValues.sourcevalues)
      ? (existingValues.sourcevalues as Record<string, unknown>)
      : {};
  const existingLastCheckoutOrder =
    existingSourceValues.lastCheckoutOrder &&
    typeof existingSourceValues.lastCheckoutOrder === "object" &&
    !Array.isArray(existingSourceValues.lastCheckoutOrder)
      ? (existingSourceValues.lastCheckoutOrder as Record<string, unknown>)
      : {};

  return {
    lastorderid: orderId,
    lastordernumber: orderNumber,
    lastorderat: orderCreatedAt,
    sourcevalues: {
      ...existingSourceValues,
      lastCheckoutOrder: {
        ...existingLastCheckoutOrder,
        orderId,
        orderNumber,
        total,
        requestId,
        updatedAt: orderCreatedAt,
      },
    } as BackyJsonValue,
  };
};

const orderContract = (siteId: string) => ({
  schemaVersion: ORDER_CONTRACT_VERSION,
  accepts: {
    method: "POST",
    contentType: "application/json",
    body: {
      customer: {
        name: "Jane Customer",
        email: "jane@example.com",
        phone: "+1 555 0100",
      },
      items: [
        { slug: "product-slug", variantId: "optional-variant-id", quantity: 1 },
      ],
      shippingAddress: "Optional shipping address text",
      billingAddress: "Optional billing address text",
      discountCode: "Optional product discount code",
      paymentProvider: "manual",
      paymentReference: "optional-provider-reference",
    },
  },
  creates: {
    collectionSlug: ORDERS_COLLECTION_SLUG,
    recordStatus: "published",
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    reservesInventory: true,
  },
  inventoryReservation: {
    appliesTo: "physical products and variants with finite stock",
    policy:
      "deny rejects carts that request more than available inventory; continue and preorder keep accepting orders while stock floors at zero",
    variants:
      "variantId or variantSku reserves the matched variant inventory when that variant has an inventory value",
    errors: [
      "PRODUCT_OUT_OF_STOCK",
      "VARIANT_OUT_OF_STOCK",
      "PRODUCT_INSUFFICIENT_STOCK",
      "VARIANT_INSUFFICIENT_STOCK",
    ],
  },
  pricing: {
    taxes:
      "When enabled in Commerce settings, taxable lines receive a deterministic tax estimate from the product tax class.",
    shipping:
      "When enabled in Commerce settings, physical shippable lines receive a shipping estimate from their shipping profile and weight.",
    discounts:
      "When enabled in Commerce settings, product discount codes apply a percentage inferred from the code suffix, for example SMOKE10 = 10%.",
  },
  relatedEndpoints: {
    catalog: `/api/sites/${siteId}/commerce/catalog`,
    checkoutSession: `/api/sites/${siteId}/commerce/orders`,
    providerWebhook: `/api/sites/${siteId}/commerce/webhook`,
    rawOrdersBlocked: `/api/sites/${siteId}/collections/${ORDERS_COLLECTION_SLUG}/records`,
  },
});

const validateCheckoutInput = (input: CheckoutOrderInput): string[] => {
  const errors: string[] = [];

  if (!input.customer?.name) errors.push("customer.name is required");
  if (!input.customer?.email || !EMAIL_PATTERN.test(input.customer.email))
    errors.push("customer.email must be a valid email");
  if (!input.items || input.items.length === 0)
    errors.push("At least one item is required");
  input.items?.forEach((item, index) => {
    if (!textValue(item.productId) && !textValue(item.slug)) {
      errors.push(`items[${index}] requires productId or slug`);
    }
    if (item.quantity !== undefined) {
      const quantity = Number(item.quantity);
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_CHECKOUT_ITEM_QUANTITY
      ) {
        errors.push(
          `items[${index}].quantity must be a whole number between 1 and ${MAX_CHECKOUT_ITEM_QUANTITY}`,
        );
      }
    }
  });

  return errors;
};

const quantityForCheckoutItem = (item: CheckoutItemInput): number =>
  Number.isInteger(Number(item.quantity))
    ? Math.max(1, Math.min(MAX_CHECKOUT_ITEM_QUANTITY, Number(item.quantity)))
    : 1;

const requireGuestCheckoutAllowed = (
  commerce: CommerceStorefrontContract,
  requestId: string,
) => {
  if (!commerce.checkout.guestCheckout) {
    return errorResponse(
      403,
      "GUEST_CHECKOUT_DISABLED",
      "Guest checkout is disabled for this site.",
      requestId,
      { checkout: { guestCheckout: false } },
    );
  }

  return null;
};

const currentMonthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

const readMonthlyOrderBillingPolicy = (settings: unknown) => {
  const root =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const commerce =
    root.commerce &&
    typeof root.commerce === "object" &&
    !Array.isArray(root.commerce)
      ? (root.commerce as Record<string, unknown>)
      : root;
  const limit = Number(commerce.monthlyOrderLimit);

  return {
    overageMode:
      typeof commerce.overageMode === "string" ? commerce.overageMode : "warn",
    monthlyOrderLimit:
      Number.isFinite(limit) && limit >= 0 ? Math.round(limit) : 100,
    billingPlan:
      typeof commerce.billingPlan === "string" ? commerce.billingPlan : "free",
  };
};

const isRecordInCurrentMonth = (
  record: { createdAt?: string; values?: Record<string, unknown> },
  monthStart: Date,
) => {
  const createdAt = textValue(
    record.createdAt || record.values?.createdat || record.values?.createdAt,
  );
  const timestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp >= monthStart.getTime();
};

const countRepositoryMonthlyOrders = async ({
  siteId,
  collectionId,
  repositories,
}: {
  siteId: string;
  collectionId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
}) => {
  const monthStart = currentMonthStart();
  let offset = 0;
  let count = 0;

  for (;;) {
    const page = await repositories.collections.listRecords({
      siteId,
      collectionId,
      includeUnpublished: true,
      status: "all",
      limit: 100,
      offset,
    });
    count += page.items.filter((record) =>
      isRecordInCurrentMonth(record, monthStart),
    ).length;
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.pagination.total) {
      return count;
    }
  }
};

const countDemoMonthlyOrders = (siteId: string, collectionId: string) => {
  const monthStart = currentMonthStart();
  let offset = 0;
  let count = 0;

  for (;;) {
    const page = listCollectionRecords(siteId, collectionId, {
      includeUnpublished: true,
      limit: 100,
      offset,
    });
    count += page.records.filter((record) =>
      isRecordInCurrentMonth(record, monthStart),
    ).length;
    offset += page.records.length;
    if (page.records.length === 0 || offset >= page.pagination.total) {
      return count;
    }
  }
};

const enforceMonthlyOrderBillingLimit = (
  settings: unknown,
  currentOrderCount: number,
  requestId: string,
) => {
  const policy = readMonthlyOrderBillingPolicy(settings);
  if (
    policy.overageMode === "block" &&
    currentOrderCount >= policy.monthlyOrderLimit
  ) {
    return errorResponse(
      402,
      "BILLING_ORDER_LIMIT",
      `The ${policy.billingPlan} billing policy allows ${policy.monthlyOrderLimit} order${policy.monthlyOrderLimit === 1 ? "" : "s"} this month. Update Settings billing limits before accepting another checkout order.`,
      requestId,
    );
  }

  return null;
};

const selectProductVariant = (
  product: CommerceProduct,
  item: CheckoutItemInput,
) => {
  const variantId = textValue(item.variantId);
  const variantSku = textValue(item.variantSku);
  if (!variantId && !variantSku) return null;

  return (
    product.variants.find(
      (variant) =>
        (variantId && variant.id === variantId) ||
        (variantSku && variant.sku === variantSku),
    ) || null
  );
};

const lineItemFromProduct = (
  product: CommerceProduct,
  quantity: number,
  item: CheckoutItemInput,
) => {
  const variant = selectProductVariant(product, item);
  const unitPrice = variant?.price ?? product.price;

  return {
    productId: product.id,
    slug: product.slug,
    title: product.title,
    sku: variant?.sku || product.sku,
    variant: variant
      ? {
          id: variant.id,
          title: variant.title,
          option: variant.option,
          sku: variant.sku,
        }
      : null,
    quantity,
    price: unitPrice,
    currency: product.currency,
    lineTotal: moneyValue(unitPrice * quantity),
    productType: product.productType,
    imageUrl: product.imageUrl,
    galleryImages: product.galleryImages,
    checkoutUrl: product.checkout.url,
    taxable: product.delivery.taxable,
    taxClass: product.delivery.taxClass,
    shippingRequired: product.delivery.shippingRequired,
    shippingProfile: product.delivery.shippingProfile,
    weight: product.delivery.weight,
    discountCode: product.checkout.discountCode,
    subscription: product.subscription,
  };
};

type CheckoutLineItem = ReturnType<typeof lineItemFromProduct>;

const assessCheckoutRisk = ({
  input,
  quote,
  lineItems,
  checkoutSession,
}: {
  input: CheckoutOrderInput;
  quote: ReturnType<typeof calculateCheckoutQuote>;
  lineItems: CheckoutLineItem[];
  checkoutSession: CheckoutSessionHandoff;
}) => {
  let score = 0;
  const reasons: string[] = [];
  const totalQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const emailDomain = input.customer?.email?.split("@")[1] || "";

  if (quote.total >= 500) {
    score += 40;
    reasons.push("High order value over 500.");
  } else if (quote.total >= 200) {
    score += 20;
    reasons.push("Elevated order value over 200.");
  }

  if (totalQuantity >= 10) {
    score += 25;
    reasons.push("High unit quantity in checkout cart.");
  } else if (lineItems.some((item) => item.quantity >= 4)) {
    score += 10;
    reasons.push("Multiple units of the same product.");
  }

  if (checkoutSession.provider === "manual" && quote.total >= 100) {
    score += 25;
    reasons.push("Manual payment capture on a larger order.");
  }

  if (
    input.shippingAddress &&
    input.billingAddress &&
    input.shippingAddress.toLowerCase() !== input.billingAddress.toLowerCase()
  ) {
    score += 15;
    reasons.push("Shipping and billing addresses differ.");
  }

  if (!input.customer?.phone) {
    score += 10;
    reasons.push("Customer phone is missing.");
  }

  if (
    ["mailinator.com", "tempmail.com", "10minutemail.com"].includes(emailDomain)
  ) {
    score += 25;
    reasons.push("Disposable email domain detected.");
  }

  if (quote.subtotal > 0 && quote.discountAmount / quote.subtotal >= 0.3) {
    score += 10;
    reasons.push("Large discount used at checkout.");
  }

  const boundedScore = Math.min(100, score);
  const level: OrderRiskLevel =
    boundedScore >= 60 ? "high" : boundedScore >= 25 ? "medium" : "low";
  return {
    score: boundedScore,
    level,
    reasons,
    reviewStatus: level === "low" ? "cleared" : "pending_review",
  };
};
type InventoryReservation = {
  record: CommerceSourceRecord;
  originalValues: Record<string, unknown>;
  values: Record<string, unknown>;
};

const taxRateForClass = (
  taxClass: string,
  rules: CommerceStorefrontContract["pricing"]["rules"],
): number => {
  const normalized = taxClass.trim().toLowerCase();
  const standardRate = rules.taxRatePercent / 100;
  if (!normalized || normalized === "standard") return standardRate;
  if (normalized.includes("exempt") || normalized.includes("zero")) return 0;
  if (normalized.includes("reduced")) return standardRate / 2;
  if (normalized.includes("digital")) return rules.digitalTaxRatePercent / 100;
  if (normalized.includes("service")) return Math.max(0, standardRate - 0.025);
  return standardRate;
};

const shippingBaseForProfile = (
  profile: string,
  rules: CommerceStorefrontContract["pricing"]["rules"],
): number => {
  const normalized = profile.trim().toLowerCase();
  if (!normalized || normalized === "standard") return rules.shippingBaseAmount;
  if (
    normalized.includes("digital") ||
    normalized.includes("pickup") ||
    normalized.includes("free")
  )
    return 0;
  if (normalized.includes("express"))
    return moneyValue(rules.shippingBaseAmount * 1.875);
  if (normalized.includes("freight") || normalized.includes("oversize"))
    return moneyValue(rules.shippingBaseAmount * 4.375);
  if (normalized.includes("box") || normalized.includes("standard"))
    return rules.shippingBaseAmount;
  return moneyValue(rules.shippingBaseAmount * 1.25);
};

const discountPercentFromCode = (
  code: string,
  rules: CommerceStorefrontContract["pricing"]["rules"],
): number => {
  if (rules.discountPercent > 0) {
    return rules.discountPercent / 100;
  }
  const match = code.match(/(\d{1,2})$/);
  if (!match) return code ? 0.1 : 0;
  return Math.max(0, Math.min(90, Number(match[1]))) / 100;
};

const calculateCheckoutQuote = (
  lineItems: CheckoutLineItem[],
  discountCode: string,
  commerce: CommerceStorefrontContract,
) => {
  const subtotal = moneyValue(
    lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
  );
  const normalizedDiscountCode = discountCode.trim().toUpperCase();
  const pricingRules = commerce.pricing.rules;
  const discountRate = commerce.pricing.discounts
    ? discountPercentFromCode(normalizedDiscountCode, pricingRules)
    : 0;
  const discountLines = lineItems
    .map((item) => {
      const itemDiscountCode = textValue(item.discountCode).toUpperCase();
      const eligible = Boolean(
        discountRate &&
        normalizedDiscountCode &&
        itemDiscountCode === normalizedDiscountCode,
      );
      const amount = eligible ? moneyValue(item.lineTotal * discountRate) : 0;
      return {
        productId: item.productId,
        slug: item.slug,
        code: eligible ? normalizedDiscountCode : "",
        rate: eligible ? discountRate : 0,
        amount,
      };
    })
    .filter((line) => line.amount > 0);
  const discountAmount = moneyValue(
    discountLines.reduce((sum, line) => sum + line.amount, 0),
  );

  const lineDiscountByProduct = new Map(
    discountLines.map((line) => [line.productId, line.amount]),
  );
  const taxLines = lineItems
    .map((item) => {
      if (!commerce.pricing.taxes || !item.taxable) {
        return {
          productId: item.productId,
          slug: item.slug,
          taxClass: item.taxClass || "standard",
          rate: 0,
          amount: 0,
        };
      }
      const taxableAmount = Math.max(
        0,
        item.lineTotal - (lineDiscountByProduct.get(item.productId) || 0),
      );
      const rate = taxRateForClass(item.taxClass, pricingRules);
      return {
        productId: item.productId,
        slug: item.slug,
        taxClass: item.taxClass || "standard",
        rate,
        amount: moneyValue(taxableAmount * rate),
      };
    })
    .filter((line) => line.amount > 0 || commerce.pricing.taxes);
  const taxAmount = moneyValue(
    taxLines.reduce((sum, line) => sum + line.amount, 0),
  );

  const shippingGroups = new Map<
    string,
    { profile: string; base: number; weightTotal: number; slugs: string[] }
  >();
  if (commerce.pricing.shipping) {
    for (const item of lineItems) {
      if (!item.shippingRequired) continue;
      const profile = item.shippingProfile || "standard";
      const group = shippingGroups.get(profile) || {
        profile,
        base: shippingBaseForProfile(profile, pricingRules),
        weightTotal: 0,
        slugs: [],
      };
      group.weightTotal +=
        Math.max(0, Number(item.weight || 0)) * item.quantity;
      group.slugs.push(item.slug);
      shippingGroups.set(profile, group);
    }
  }
  const shippingLines = Array.from(shippingGroups.values()).map((group) => ({
    profile: group.profile,
    slugs: group.slugs,
    base: moneyValue(group.base),
    weightAmount: moneyValue(
      group.weightTotal * pricingRules.shippingWeightRate,
    ),
    amount: moneyValue(
      group.base + group.weightTotal * pricingRules.shippingWeightRate,
    ),
  }));
  const shippingAmount = moneyValue(
    shippingLines.reduce((sum, line) => sum + line.amount, 0),
  );
  const total = moneyValue(
    Math.max(0, subtotal - discountAmount + taxAmount + shippingAmount),
  );

  return {
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    total,
    currency: lineItems[0]?.currency || commerce.currency || "USD",
    discountCode: normalizedDiscountCode,
    discountRate,
    discountLines,
    taxLines,
    shippingLines,
    providerAdjustments: [] as CheckoutQuoteProviderAdjustment[],
    pricing: commerce.pricing,
  };
};

type CheckoutQuote = ReturnType<typeof calculateCheckoutQuote>;

const quoteProviderMode = (
  settings: Record<string, unknown>,
  kind: QuoteProviderKind,
):
  | "manual"
  | "http"
  | "taxjar"
  | "avalara"
  | "easypost"
  | "shippo"
  | "stripe" => {
  const mode = textValue(settings[`${kind}Provider`]).toLowerCase();
  if (mode === "http") return "http";
  if (kind === "tax" && mode === "taxjar") return "taxjar";
  if (kind === "tax" && mode === "avalara") return "avalara";
  if (kind === "shipping" && mode === "easypost") return "easypost";
  if (kind === "shipping" && mode === "shippo") return "shippo";
  if (kind === "discount" && mode === "stripe") return "stripe";
  return "manual";
};

const quoteProviderUrl = (
  settings: Record<string, unknown>,
  kind: QuoteProviderKind,
): string => {
  if (quoteProviderMode(settings, kind) !== "http") return "";
  const url = textValue(settings[`${kind}ProviderUrl`]);
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

const quoteProviderAmount = (
  payload: Record<string, unknown>,
  kind: QuoteProviderKind,
): number | null => {
  const parsed = numberValue(
    payload[`${kind}Amount`] ?? payload.amount,
    Number.NaN,
  );
  return Number.isFinite(parsed) && parsed >= 0 ? moneyValue(parsed) : null;
};

const quoteProviderLines = (
  payload: Record<string, unknown>,
): Array<Record<string, unknown>> =>
  Array.isArray(payload.lines) ? payload.lines.map(toRecord) : [];

const parseProviderRecord = (value: unknown): Record<string, unknown> => {
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

const safeProviderField = (
  value: unknown,
): string | number | boolean | null => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  return null;
};

const safeProviderRecord = (
  value: unknown,
): Record<string, string | number | boolean | null> =>
  Object.fromEntries(
    Object.entries(parseProviderRecord(value))
      .map(([key, entry]) => [key, safeProviderField(entry)] as const)
      .filter(([, entry]) => entry !== null && entry !== ""),
  );

const hasProviderRecordFields = (value: unknown): boolean =>
  Object.keys(safeProviderRecord(value)).length > 0;

const parseAddressTextParts = (value: string) => {
  const stateMatch = value.match(
    /(?:^|,\s*)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,|$)/,
  );
  const postalMatch = value.match(/\b\d{5}(?:-\d{4})?\b/);
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    street: parts[0] || "",
    city: parts.length > 2 ? parts[parts.length - 3] || "" : "",
    state: stateMatch?.[1] || "",
    zip: postalMatch?.[0] || "",
  };
};

const addressField = (
  address: Record<string, unknown>,
  keys: string[],
): string => {
  for (const key of keys) {
    const value = textValue(address[key]);
    if (value) return value;
  }
  return "";
};

const checkoutAddress = (
  input: CheckoutOrderInput,
  settings: Record<string, unknown>,
  prefix: "to" | "from",
) => {
  const source =
    prefix === "to"
      ? input.shippingAddress ||
        input.billingAddress ||
        settings.shippingDestinationAddress
      : settings.shippingOriginAddress;
  const objectAddress = parseProviderRecord(source);
  const parsedText = parseAddressTextParts(textValue(source));
  const country = (
    addressField(objectAddress, ["country", "countryCode"]) || "US"
  ).toUpperCase();
  return {
    country,
    state:
      addressField(objectAddress, ["state", "province", "region"]) ||
      parsedText.state,
    zip:
      addressField(objectAddress, ["zip", "postalCode", "postal_code"]) ||
      parsedText.zip,
    city: addressField(objectAddress, ["city", "locality"]) || parsedText.city,
    street:
      addressField(objectAddress, ["street", "street1", "line1", "address1"]) ||
      parsedText.street,
  };
};

const taxJarLineItems = (
  lineItems: CheckoutLineItem[],
  quote: CheckoutQuote,
): Array<Record<string, unknown>> => {
  const discountByProduct = new Map(
    quote.discountLines.map((line) => [
      String(line.productId),
      numberValue(line.amount),
    ]),
  );
  return lineItems
    .filter((item) => item.taxable && item.lineTotal > 0)
    .map((item, index) => ({
      id: item.productId || item.slug || `line-${index + 1}`,
      quantity: item.quantity,
      unit_price: moneyValue(item.price),
      discount: moneyValue(discountByProduct.get(item.productId) || 0),
      product_identifier: item.sku || item.slug || item.productId,
      description: item.title,
      ...(item.taxClass && item.taxClass !== "standard"
        ? { product_tax_code: item.taxClass }
        : {}),
    }));
};

const callTaxJarCheckoutProvider = async ({
  input,
  lineItems,
  quote,
  settings,
}: {
  input: CheckoutOrderInput;
  lineItems: CheckoutLineItem[];
  quote: CheckoutQuote;
  settings: Record<string, unknown>;
}): Promise<CheckoutQuoteProviderAdjustment> => {
  const apiKey = taxJarApiKey();
  if (!apiKey) {
    return {
      kind: "tax",
      provider: "taxjar",
      status: "skipped",
      error:
        "TaxJar is selected, but BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY is not configured.",
    };
  }
  const toAddress = checkoutAddress(input, settings, "to");
  const fromAddress = checkoutAddress(input, settings, "from");
  if (toAddress.country === "US" && (!toAddress.state || !toAddress.zip)) {
    return {
      kind: "tax",
      provider: "taxjar",
      status: "skipped",
      error:
        "TaxJar requires destination state and ZIP for US tax calculations.",
    };
  }
  const taxLines = taxJarLineItems(lineItems, quote);
  if (taxLines.length === 0)
    return {
      kind: "tax",
      provider: "taxjar",
      status: "skipped",
      error: "No taxable line items were available for TaxJar.",
    };

  try {
    const response = await fetch(`${taxJarApiBaseUrl()}/taxes`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-api-version": "2022-01-24",
      },
      body: JSON.stringify({
        from_country: fromAddress.country || undefined,
        from_zip: fromAddress.zip || undefined,
        from_state: fromAddress.state || undefined,
        from_city: fromAddress.city || undefined,
        from_street: fromAddress.street || undefined,
        to_country: toAddress.country || "US",
        to_zip: toAddress.zip || undefined,
        to_state: toAddress.state || undefined,
        to_city: toAddress.city || undefined,
        to_street: toAddress.street || undefined,
        amount: moneyValue(quote.subtotal - quote.discountAmount),
        shipping: moneyValue(quote.shippingAmount),
        line_items: taxLines,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = toRecord(await response.json().catch(() => ({})));
    const tax = toRecord(payload.tax || payload);
    if (!response.ok) {
      return {
        kind: "tax",
        provider: "taxjar",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(payload.error) ||
          textValue(payload.detail) ||
          textValue(payload.message) ||
          `TaxJar returned HTTP ${response.status}.`,
      };
    }
    const amount = numberValue(
      tax.amount_to_collect ?? tax.amountToCollect ?? tax.tax_amount,
      Number.NaN,
    );
    if (!Number.isFinite(amount) || amount < 0) {
      return {
        kind: "tax",
        provider: "taxjar",
        status: "failed",
        statusCode: response.status,
        error: "TaxJar response did not include amount_to_collect.",
      };
    }
    return {
      kind: "tax",
      provider: "taxjar",
      status: "succeeded",
      statusCode: response.status,
      amount: moneyValue(amount),
      lines: [
        {
          provider: "taxjar",
          taxableAmount: optionalNumberValue(tax.taxable_amount),
          taxAmount: optionalNumberValue(tax.amount_to_collect),
          rate: optionalNumberValue(tax.rate),
        },
      ],
      reference: textValue(
        tax.transaction_reference_id || payload.transaction_reference_id,
      ),
    };
  } catch (error) {
    return {
      kind: "tax",
      provider: "taxjar",
      status: "failed",
      error: error instanceof Error ? error.message : "TaxJar request failed.",
    };
  }
};

const callAvalaraCheckoutProvider = async ({
  input,
  lineItems,
  quote,
  settings,
}: {
  input: CheckoutOrderInput;
  lineItems: CheckoutLineItem[];
  quote: CheckoutQuote;
  settings: Record<string, unknown>;
}): Promise<CheckoutQuoteProviderAdjustment> => {
  const accountId = avalaraAccountId();
  const licenseKey = avalaraLicenseKey();
  const companyCode =
    textValue(settings.avalaraCompanyCode) || avalaraCompanyCode();
  if (!accountId || !licenseKey || !companyCode) {
    return {
      kind: "tax",
      provider: "avalara",
      status: "skipped",
      error:
        "Avalara is selected, but account id, license key, or company code is not configured.",
    };
  }
  const shipTo = checkoutAddress(input, settings, "to");
  const shipFrom = checkoutAddress(input, settings, "from");
  const lines = lineItems
    .filter((item) => item.taxable && item.lineTotal > 0)
    .map((item, index) => ({
      number: item.productId || item.slug || `line-${index + 1}`,
      quantity: item.quantity,
      amount: moneyValue(item.lineTotal),
      itemCode: item.sku || item.slug || item.productId,
      description: item.title,
      ...(item.taxClass && item.taxClass !== "standard"
        ? { taxCode: item.taxClass }
        : {}),
    }));
  if (quote.shippingAmount > 0) {
    lines.push({
      number: "shipping",
      quantity: 1,
      amount: moneyValue(quote.shippingAmount),
      itemCode: "shipping",
      description: "Shipping",
      taxCode: textValue(settings.shippingTaxCode) || "FR",
    });
  }
  if (lines.length === 0)
    return {
      kind: "tax",
      provider: "avalara",
      status: "skipped",
      error:
        "No taxable line items or shipping amount were available for Avalara.",
    };

  try {
    const response = await fetch(
      `${avalaraApiBaseUrl()}/api/v2/transactions/create`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${accountId}:${licenseKey}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "SalesOrder",
          companyCode,
          date: new Date().toISOString().slice(0, 10),
          customerCode:
            normalizeEmail(input.customer?.email) || "backy-customer",
          commit: false,
          currencyCode: quote.currency.toUpperCase(),
          addresses: {
            shipFrom: {
              line1: shipFrom.street || undefined,
              city: shipFrom.city || undefined,
              region: shipFrom.state || undefined,
              country: shipFrom.country || "US",
              postalCode: shipFrom.zip || undefined,
            },
            shipTo: {
              line1: shipTo.street || undefined,
              city: shipTo.city || undefined,
              region: shipTo.state || undefined,
              country: shipTo.country || "US",
              postalCode: shipTo.zip || undefined,
            },
          },
          lines,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      const error = toRecord(payload.error);
      return {
        kind: "tax",
        provider: "avalara",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(error.message) ||
          textValue(payload.message) ||
          `Avalara returned HTTP ${response.status}.`,
        reference: textValue(payload.code),
      };
    }
    const amount = optionalNumberValue(
      payload.totalTaxCalculated ?? payload.totalTax,
    );
    if (amount === null || amount < 0) {
      return {
        kind: "tax",
        provider: "avalara",
        status: "failed",
        statusCode: response.status,
        error: "Avalara response did not include totalTaxCalculated.",
        reference: textValue(payload.code),
      };
    }
    return {
      kind: "tax",
      provider: "avalara",
      status: "succeeded",
      statusCode: response.status,
      amount: moneyValue(amount),
      lines: Array.isArray(payload.lines) ? payload.lines.map(toRecord) : [],
      reference: textValue(payload.code || payload.id),
    };
  } catch (error) {
    return {
      kind: "tax",
      provider: "avalara",
      status: "failed",
      error: error instanceof Error ? error.message : "Avalara request failed.",
    };
  }
};

const rateSelectionMatches = (
  rate: { id: string; carrier: string; serviceLevel: string; amount: number },
  settings: Record<string, unknown>,
): boolean => {
  const rateId = textValue(settings.shippingDefaultRateId).toLowerCase();
  const carrier = textValue(settings.shippingDefaultCarrier).toLowerCase();
  const serviceLevel = textValue(
    settings.shippingDefaultServiceLevel,
  ).toLowerCase();
  return (
    Boolean(rateId && rate.id.toLowerCase() === rateId) ||
    ((!carrier || rate.carrier.toLowerCase() === carrier) &&
      (!serviceLevel || rate.serviceLevel.toLowerCase() === serviceLevel))
  );
};

const callEasyPostCheckoutShippingProvider = async ({
  input,
  settings,
}: {
  input: CheckoutOrderInput;
  settings: Record<string, unknown>;
}): Promise<CheckoutQuoteProviderAdjustment> => {
  const apiKey = easyPostApiKey();
  if (!apiKey)
    return {
      kind: "shipping",
      provider: "easypost",
      status: "skipped",
      error:
        "EasyPost shipping quotes are selected, but BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY is not configured.",
    };
  const fromAddress = parseProviderRecord(settings.shippingOriginAddress);
  const toAddress = hasProviderRecordFields(input.shippingAddress)
    ? parseProviderRecord(input.shippingAddress)
    : parseProviderRecord(settings.shippingDestinationAddress);
  const parcel = parseProviderRecord(settings.shippingDefaultParcel);
  if (
    !hasProviderRecordFields(fromAddress) ||
    !hasProviderRecordFields(toAddress) ||
    !hasProviderRecordFields(parcel)
  ) {
    return {
      kind: "shipping",
      provider: "easypost",
      status: "skipped",
      error:
        "EasyPost shipping quotes require shippingOriginAddress, checkout shippingAddress, and shippingDefaultParcel provider records.",
    };
  }
  try {
    const response = await fetch(`${easyPostApiBaseUrl()}/shipments`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        shipment: {
          from_address: safeProviderRecord(fromAddress),
          to_address: safeProviderRecord(toAddress),
          parcel: safeProviderRecord(parcel),
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok)
      return {
        kind: "shipping",
        provider: "easypost",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(toRecord(payload.error).message) ||
          textValue(payload.message) ||
          `EasyPost returned HTTP ${response.status}.`,
        reference: textValue(payload.id),
      };
    const rates = Array.isArray(payload.rates)
      ? payload.rates
          .map(toRecord)
          .map((rate) => ({
            id: textValue(rate.id),
            carrier: textValue(rate.carrier),
            serviceLevel: textValue(rate.service),
            amount: moneyValue(numberValue(rate.rate, Number.NaN)),
          }))
          .filter((rate) => rate.id && Number.isFinite(rate.amount))
      : [];
    const selected =
      rates.find((rate) => rateSelectionMatches(rate, settings)) ||
      [...rates].sort((a, b) => a.amount - b.amount)[0];
    if (!selected)
      return {
        kind: "shipping",
        provider: "easypost",
        status: "failed",
        statusCode: response.status,
        error: "EasyPost did not return a selectable shipping rate.",
        reference: textValue(payload.id),
      };
    return {
      kind: "shipping",
      provider: "easypost",
      status: "succeeded",
      statusCode: response.status,
      amount: selected.amount,
      lines: rates.map((rate) => ({
        ...rate,
        provider: "easypost",
        selected: rate.id === selected.id,
      })),
      reference: textValue(payload.id) || selected.id,
    };
  } catch (error) {
    return {
      kind: "shipping",
      provider: "easypost",
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "EasyPost shipping quote request failed.",
    };
  }
};

const callShippoCheckoutShippingProvider = async ({
  input,
  settings,
}: {
  input: CheckoutOrderInput;
  settings: Record<string, unknown>;
}): Promise<CheckoutQuoteProviderAdjustment> => {
  const apiKey = shippoApiKey();
  if (!apiKey)
    return {
      kind: "shipping",
      provider: "shippo",
      status: "skipped",
      error:
        "Shippo shipping quotes are selected, but BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY is not configured.",
    };
  const fromAddress = parseProviderRecord(settings.shippingOriginAddress);
  const toAddress = hasProviderRecordFields(input.shippingAddress)
    ? parseProviderRecord(input.shippingAddress)
    : parseProviderRecord(settings.shippingDestinationAddress);
  const parcel = parseProviderRecord(settings.shippingDefaultParcel);
  if (
    !hasProviderRecordFields(fromAddress) ||
    !hasProviderRecordFields(toAddress) ||
    !hasProviderRecordFields(parcel)
  ) {
    return {
      kind: "shipping",
      provider: "shippo",
      status: "skipped",
      error:
        "Shippo shipping quotes require shippingOriginAddress, checkout shippingAddress, and shippingDefaultParcel provider records.",
    };
  }
  try {
    const response = await fetch(`${shippoApiBaseUrl()}/shipments/`, {
      method: "POST",
      headers: {
        authorization: `ShippoToken ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        address_from: safeProviderRecord(fromAddress),
        address_to: safeProviderRecord(toAddress),
        parcels: [safeProviderRecord(parcel)],
        async: false,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok)
      return {
        kind: "shipping",
        provider: "shippo",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(payload.message || payload.detail || payload.error) ||
          `Shippo returned HTTP ${response.status}.`,
        reference: textValue(payload.object_id || payload.id),
      };
    const rates = Array.isArray(payload.rates)
      ? payload.rates
          .map(toRecord)
          .map((rate) => {
            const serviceLevel = toRecord(rate.servicelevel);
            return {
              id: textValue(rate.object_id || rate.id),
              carrier: textValue(
                rate.provider || rate.carrier || serviceLevel.provider,
              ),
              serviceLevel: textValue(
                serviceLevel.token ||
                  serviceLevel.name ||
                  rate.servicelevel_token ||
                  rate.service,
              ),
              amount: moneyValue(
                numberValue(rate.amount || rate.amount_local, Number.NaN),
              ),
            };
          })
          .filter((rate) => rate.id && Number.isFinite(rate.amount))
      : [];
    const selected =
      rates.find((rate) => rateSelectionMatches(rate, settings)) ||
      [...rates].sort((a, b) => a.amount - b.amount)[0];
    if (!selected)
      return {
        kind: "shipping",
        provider: "shippo",
        status: "failed",
        statusCode: response.status,
        error: "Shippo did not return a selectable shipping rate.",
        reference: textValue(payload.object_id || payload.id),
      };
    return {
      kind: "shipping",
      provider: "shippo",
      status: "succeeded",
      statusCode: response.status,
      amount: selected.amount,
      lines: rates.map((rate) => ({
        ...rate,
        provider: "shippo",
        selected: rate.id === selected.id,
      })),
      reference: textValue(payload.object_id || payload.id) || selected.id,
    };
  } catch (error) {
    return {
      kind: "shipping",
      provider: "shippo",
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "Shippo shipping quote request failed.",
    };
  }
};

const callStripeCheckoutDiscountProvider = async ({
  quote,
  requestId,
}: {
  quote: CheckoutQuote;
  requestId: string;
}): Promise<CheckoutQuoteProviderAdjustment> => {
  const code = quote.discountCode.trim();
  const secretKey = envValue(["BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"]);
  if (!code)
    return {
      kind: "discount",
      provider: "stripe",
      status: "skipped",
      error:
        "Stripe promotion-code discounts require a checkout discount code.",
    };
  if (!secretKey)
    return {
      kind: "discount",
      provider: "stripe",
      status: "skipped",
      error:
        "Stripe promotion-code discounts are selected, but BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY is not configured.",
    };
  const params = new URLSearchParams({ code, active: "true", limit: "1" });
  try {
    const response = await fetch(
      `${stripeDiscountApiBaseUrl()}/v1/promotion_codes?${params.toString()}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${secretKey}`,
          "x-backy-request-id": requestId,
          ...(envValue(["BACKY_STRIPE_API_VERSION", "STRIPE_API_VERSION"])
            ? {
                "stripe-version": envValue([
                  "BACKY_STRIPE_API_VERSION",
                  "STRIPE_API_VERSION",
                ]),
              }
            : {}),
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      return {
        kind: "discount",
        provider: "stripe",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(toRecord(payload.error).message) ||
          textValue(payload.message) ||
          `Stripe promotion codes returned HTTP ${response.status}.`,
      };
    }
    const promotionCode = Array.isArray(payload.data)
      ? toRecord(payload.data[0])
      : {};
    if (!promotionCode.id)
      return {
        kind: "discount",
        provider: "stripe",
        status: "skipped",
        statusCode: response.status,
        error: `Stripe promotion code ${code} was not found or is inactive.`,
      };
    const coupon = toRecord(promotionCode.coupon);
    const percentOff = optionalNumberValue(coupon.percent_off);
    const amountOff = fromProviderAmount(coupon.amount_off, quote.currency);
    const amountCurrency = textValue(coupon.currency).toUpperCase();
    const amount =
      percentOff !== null && percentOff > 0
        ? moneyValue((quote.subtotal * Math.min(100, percentOff)) / 100)
        : amountOff !== null &&
            (!amountCurrency || amountCurrency === quote.currency.toUpperCase())
          ? amountOff
          : null;
    if (amount === null || amount <= 0) {
      return {
        kind: "discount",
        provider: "stripe",
        status: "failed",
        statusCode: response.status,
        error:
          "Stripe coupon did not include a supported percent_off or matching-currency amount_off discount.",
        reference: textValue(promotionCode.id),
      };
    }
    return {
      kind: "discount",
      provider: "stripe",
      status: "succeeded",
      statusCode: response.status,
      amount: moneyValue(Math.min(quote.subtotal, amount)),
      lines: [
        {
          provider: "stripe",
          promotionCodeId: textValue(promotionCode.id),
          couponId: textValue(coupon.id),
          code,
          percentOff: percentOff ?? null,
          amountOff,
          currency: amountCurrency || quote.currency.toUpperCase(),
        },
      ],
      reference: textValue(promotionCode.id),
    };
  } catch (error) {
    return {
      kind: "discount",
      provider: "stripe",
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "Stripe promotion-code discount request failed.",
    };
  }
};

const callCheckoutQuoteProvider = async ({
  kind,
  url,
  input,
  lineItems,
  quote,
  requestId,
}: {
  kind: QuoteProviderKind;
  url: string;
  input: CheckoutOrderInput;
  lineItems: CheckoutLineItem[];
  quote: CheckoutQuote;
  requestId: string;
}): Promise<CheckoutQuoteProviderAdjustment> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-backy-request-id": requestId,
        "x-backy-provider-kind": kind,
      },
      body: JSON.stringify({
        schemaVersion: "backy.checkout-quote-provider-request.v1",
        kind,
        checkout: {
          customer: input.customer || {},
          shippingAddress: input.shippingAddress || "",
          billingAddress: input.billingAddress || "",
          discountCode: input.discountCode || "",
        },
        lineItems,
        quote,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      return {
        kind,
        provider: "http",
        status: "failed",
        url,
        statusCode: response.status,
        error:
          textValue(payload.error) ||
          textValue(toRecord(payload.error).message) ||
          `Provider returned HTTP ${response.status}.`,
      };
    }
    const amount = quoteProviderAmount(payload, kind);
    if (amount === null) {
      return {
        kind,
        provider: "http",
        status: "failed",
        url,
        statusCode: response.status,
        error: "Provider response did not include a non-negative amount.",
      };
    }
    return {
      kind,
      provider: "http",
      status: "succeeded",
      url,
      statusCode: response.status,
      amount,
      lines: quoteProviderLines(payload),
      reference: textValue(payload.reference || payload.providerReference),
    };
  } catch (error) {
    return {
      kind,
      provider: "http",
      status: "failed",
      url,
      error:
        error instanceof Error
          ? error.message
          : "Provider quote request failed.",
    };
  }
};

const applyCheckoutQuoteProviders = async ({
  settings,
  input,
  lineItems,
  quote,
  requestId,
}: {
  settings: unknown;
  input: CheckoutOrderInput;
  lineItems: CheckoutLineItem[];
  quote: CheckoutQuote;
  requestId: string;
}): Promise<CheckoutQuote> => {
  const commerceSettings = toRecord(settings);
  const providerAdjustments = (
    await Promise.all(
      (
        [
          ["tax", quote.pricing.taxes],
          ["shipping", quote.pricing.shipping],
          ["discount", quote.pricing.discounts],
        ] as Array<[QuoteProviderKind, boolean]>
      ).map(async ([kind, enabled]) => {
        if (!enabled) return null;
        const mode = quoteProviderMode(commerceSettings, kind);
        if (kind === "tax" && mode === "taxjar") {
          return callTaxJarCheckoutProvider({
            input,
            lineItems,
            quote,
            settings: commerceSettings,
          });
        }
        if (kind === "tax" && mode === "avalara") {
          return callAvalaraCheckoutProvider({
            input,
            lineItems,
            quote,
            settings: commerceSettings,
          });
        }
        if (kind === "shipping" && mode === "easypost") {
          return callEasyPostCheckoutShippingProvider({
            input,
            settings: commerceSettings,
          });
        }
        if (kind === "shipping" && mode === "shippo") {
          return callShippoCheckoutShippingProvider({
            input,
            settings: commerceSettings,
          });
        }
        if (kind === "discount" && mode === "stripe") {
          return callStripeCheckoutDiscountProvider({ quote, requestId });
        }
        const url = quoteProviderUrl(commerceSettings, kind);
        if (!url) return null;
        return callCheckoutQuoteProvider({
          kind,
          url,
          input,
          lineItems,
          quote,
          requestId,
        });
      }),
    )
  ).filter(Boolean) as CheckoutQuoteProviderAdjustment[];

  if (providerAdjustments.length === 0) return quote;

  const providerAmount = (
    kind: QuoteProviderKind,
    fallback: number,
  ): number => {
    const adjustment = providerAdjustments.find(
      (item) =>
        item.kind === kind &&
        item.status === "succeeded" &&
        typeof item.amount === "number",
    );
    if (!adjustment) return fallback;
    if (kind === "discount")
      return moneyValue(
        Math.min(quote.subtotal, Math.max(0, adjustment.amount || 0)),
      );
    return moneyValue(Math.max(0, adjustment.amount || 0));
  };
  const providerLines = <T extends Array<Record<string, unknown>>>(
    kind: QuoteProviderKind,
    fallback: T,
  ): T => {
    const adjustment = providerAdjustments.find(
      (item) =>
        item.kind === kind &&
        item.status === "succeeded" &&
        item.lines &&
        item.lines.length > 0,
    );
    return (adjustment?.lines || fallback) as T;
  };
  const discountAmount = providerAmount("discount", quote.discountAmount);
  const shippingAmount = providerAmount("shipping", quote.shippingAmount);
  const taxAmount = providerAmount("tax", quote.taxAmount);

  return {
    ...quote,
    discountAmount,
    shippingAmount,
    taxAmount,
    total: moneyValue(
      Math.max(0, quote.subtotal - discountAmount + taxAmount + shippingAmount),
    ),
    discountLines: providerLines("discount", quote.discountLines),
    shippingLines: providerLines("shipping", quote.shippingLines),
    taxLines: providerLines("tax", quote.taxLines),
    providerAdjustments,
  };
};

const buildCheckoutSessionHandoff = ({
  request,
  siteId,
  commerce,
  input,
  orderNumber,
  orderSlug,
  quote,
  lineItems,
  requestId,
  createdAt,
}: {
  request: NextRequest;
  siteId: string;
  commerce: CommerceStorefrontContract;
  input: CheckoutOrderInput;
  orderNumber: string;
  orderSlug: string;
  quote: ReturnType<typeof calculateCheckoutQuote>;
  lineItems: CheckoutLineItem[];
  requestId: string;
  createdAt: string;
}): CheckoutSessionHandoff => {
  const requestedProvider = textValue(input.paymentProvider).toLowerCase();
  const provider: CheckoutSessionHandoff["provider"] =
    requestedProvider === "stripe" && commerce.paymentProvider === "stripe"
      ? "stripe"
      : commerce.paymentProvider === "stripe"
        ? "stripe"
        : "manual";
  const id =
    input.checkoutSessionId ||
    `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const metadata = {
    siteId,
    orderNumber,
    orderSlug,
    requestId,
  };
  const successSessionId = provider === "stripe" ? "{CHECKOUT_SESSION_ID}" : id;
  const successUrl = buildAbsoluteUrl(request, commerce.checkout.successPath, {
    order: orderNumber,
    session: successSessionId,
    request: requestId,
  }).replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
  const cancelUrl = buildAbsoluteUrl(request, commerce.checkout.cancelPath, {
    order: orderNumber,
    session: id,
    request: requestId,
  });
  const expiresAt = new Date(
    Date.parse(createdAt) + commerce.inventory.reservationMinutes * 60_000,
  ).toISOString();
  const stripeMode = stripeCheckoutModeForLineItems(lineItems);
  const providerPayload =
    provider === "stripe"
      ? {
          action: "checkout.sessions.create",
          mode: stripeMode,
          accountId: commerce.provider.accountId,
          providerMode: commerce.provider.mode,
          successUrl,
          cancelUrl,
          currency: quote.currency.toLowerCase(),
          lineItems: lineItems.map((item) => ({
            quantity: item.quantity,
            priceData: {
              currency: item.currency.toLowerCase(),
              unitAmount: Math.round(item.price * 100),
              productData: {
                name: item.title,
                metadata: {
                  productId: item.productId,
                  slug: item.slug,
                  variantId: item.variant?.id || "",
                  variantSku: item.variant?.sku || "",
                },
              },
              ...(item.subscription.enabled
                ? {
                    recurring: stripeRecurringForInterval(
                      item.subscription.interval,
                    ),
                    trialDays: item.subscription.trialDays,
                  }
                : {}),
            },
          })),
          metadata,
          quote: {
            subtotal: quote.subtotal,
            discountAmount: quote.discountAmount,
            taxAmount: quote.taxAmount,
            shippingAmount: quote.shippingAmount,
            total: quote.total,
          },
        }
      : null;

  return {
    id,
    provider,
    providerMode: commerce.provider.mode,
    accountId: commerce.provider.accountId,
    status: provider === "stripe" ? "provider_ready" : "requires_action",
    handoffMode: provider === "stripe" ? "provider" : "manual",
    url: provider === "manual" ? successUrl : null,
    successUrl,
    cancelUrl,
    expiresAt,
    reference: input.paymentReference || `${provider}:${id}`,
    amountTotal: quote.total,
    currency: quote.currency,
    metadata,
    providerPayload,
  };
};

const stripeCheckoutApiUrl = () => {
  const baseUrl =
    envValue(["BACKY_STRIPE_API_BASE_URL", "STRIPE_API_BASE_URL"]) ||
    "https://api.stripe.com";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("v1/checkout/sessions", normalizedBase).toString();
};

const replaceCheckoutSessionInUrl = (
  url: string,
  checkoutSessionId: string,
): string => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("session", checkoutSessionId);
    return parsed.toString();
  } catch {
    return url.replace("{CHECKOUT_SESSION_ID}", checkoutSessionId);
  }
};

const appendStripeMetadata = (
  form: URLSearchParams,
  prefix: string,
  metadata: Record<string, string>,
) => {
  Object.entries(metadata).forEach(([key, value]) => {
    form.append(`${prefix}[metadata][${key}]`, value);
  });
};

const stripeCheckoutModeForLineItems = (
  lineItems: CheckoutLineItem[],
): "payment" | "subscription" =>
  lineItems.length > 0 && lineItems.every((item) => item.subscription.enabled)
    ? "subscription"
    : "payment";

const stripeRecurringForInterval = (
  interval: CheckoutLineItem["subscription"]["interval"],
) => {
  if (interval === "weekly") return { interval: "week" };
  if (interval === "quarterly") return { interval: "month", intervalCount: 3 };
  if (interval === "yearly") return { interval: "year" };
  return { interval: "month" };
};

const appendStripeCheckoutMetadata = (
  form: URLSearchParams,
  handoff: CheckoutSessionHandoff,
  quote: ReturnType<typeof calculateCheckoutQuote>,
  itemCount: number,
) => {
  form.append("metadata[siteId]", handoff.metadata.siteId);
  form.append("metadata[orderNumber]", handoff.metadata.orderNumber);
  form.append("metadata[orderSlug]", handoff.metadata.orderSlug);
  form.append("metadata[requestId]", handoff.metadata.requestId);
  form.append("metadata[itemCount]", String(itemCount));
  form.append("metadata[subtotal]", String(quote.subtotal));
  form.append("metadata[discountAmount]", String(quote.discountAmount));
  form.append("metadata[taxAmount]", String(quote.taxAmount));
  form.append("metadata[shippingAmount]", String(quote.shippingAmount));
  form.append("metadata[amountTotal]", String(quote.total));
};

const appendStripeProductMetadata = (
  form: URLSearchParams,
  prefix: string,
  item: CheckoutLineItem,
) => {
  form.append(`${prefix}[product_data][metadata][productId]`, item.productId);
  form.append(`${prefix}[product_data][metadata][slug]`, item.slug);
  form.append(
    `${prefix}[product_data][metadata][variantId]`,
    item.variant?.id || "",
  );
  form.append(
    `${prefix}[product_data][metadata][variantSku]`,
    item.variant?.sku || "",
  );
  if (item.subscription.enabled) {
    form.append(
      `${prefix}[product_data][metadata][subscriptionInterval]`,
      item.subscription.interval,
    );
    form.append(
      `${prefix}[product_data][metadata][subscriptionTrialDays]`,
      String(item.subscription.trialDays),
    );
  }
};

const validateStripeCheckoutMode = (
  lineItems: CheckoutLineItem[],
  quote: ReturnType<typeof calculateCheckoutQuote>,
) => {
  const subscriptionItems = lineItems.filter(
    (item) => item.subscription.enabled,
  );
  if (subscriptionItems.length === 0) return "payment";

  if (subscriptionItems.length !== lineItems.length) {
    throw new CheckoutProviderError(
      "Stripe checkout cannot mix subscription and one-time products yet",
      {
        provider: "stripe",
        subscriptionItems: subscriptionItems.length,
        itemCount: lineItems.length,
      },
      409,
      "MIXED_SUBSCRIPTION_CART",
    );
  }

  const intervals = Array.from(
    new Set(subscriptionItems.map((item) => item.subscription.interval)),
  );
  if (intervals.length > 1) {
    throw new CheckoutProviderError(
      "Stripe subscription checkout requires one recurring interval per checkout",
      { provider: "stripe", intervals },
      409,
      "MIXED_SUBSCRIPTION_INTERVALS",
    );
  }

  if (
    quote.discountAmount > 0 ||
    quote.taxAmount > 0 ||
    quote.shippingAmount > 0
  ) {
    throw new CheckoutProviderError(
      "Stripe subscription checkout requires provider-priced subscriptions without local quote adjustments",
      {
        provider: "stripe",
        discountAmount: quote.discountAmount,
        taxAmount: quote.taxAmount,
        shippingAmount: quote.shippingAmount,
      },
      409,
      "SUBSCRIPTION_PROVIDER_PRICING_UNSUPPORTED",
    );
  }

  return "subscription";
};

const buildStripeCheckoutSessionForm = ({
  handoff,
  orderNumber,
  quote,
  lineItems,
}: {
  handoff: CheckoutSessionHandoff;
  orderNumber: string;
  quote: ReturnType<typeof calculateCheckoutQuote>;
  lineItems: CheckoutLineItem[];
}) => {
  const form = new URLSearchParams();
  const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const productSummary = lineItems
    .slice(0, 8)
    .map((item) => `${item.quantity}x ${item.title}`)
    .join(", ");
  const mode = validateStripeCheckoutMode(lineItems, quote);

  form.append("mode", mode);
  form.append("success_url", handoff.successUrl);
  form.append("cancel_url", handoff.cancelUrl);
  form.append("client_reference_id", orderNumber);
  appendStripeCheckoutMetadata(form, handoff, quote, itemCount);

  if (mode === "subscription") {
    const trialDays = Math.max(
      ...lineItems.map((item) => item.subscription.trialDays),
    );
    lineItems.forEach((item, index) => {
      const priceDataPrefix = `line_items[${index}][price_data]`;
      const recurring = stripeRecurringForInterval(item.subscription.interval);
      form.append(`line_items[${index}][quantity]`, String(item.quantity));
      form.append(`${priceDataPrefix}[currency]`, item.currency.toLowerCase());
      form.append(
        `${priceDataPrefix}[unit_amount]`,
        String(centsValue(item.price)),
      );
      form.append(
        `${priceDataPrefix}[recurring][interval]`,
        recurring.interval,
      );
      if ("intervalCount" in recurring) {
        form.append(
          `${priceDataPrefix}[recurring][interval_count]`,
          String(recurring.intervalCount),
        );
      }
      form.append(`${priceDataPrefix}[product_data][name]`, item.title);
      appendStripeProductMetadata(form, priceDataPrefix, item);
    });
    appendStripeMetadata(form, "subscription_data", handoff.metadata);
    if (trialDays > 0) {
      form.append("subscription_data[trial_period_days]", String(trialDays));
    }
  } else {
    form.append("line_items[0][quantity]", "1");
    form.append(
      "line_items[0][price_data][currency]",
      quote.currency.toLowerCase(),
    );
    form.append(
      "line_items[0][price_data][unit_amount]",
      String(centsValue(quote.total)),
    );
    form.append(
      "line_items[0][price_data][product_data][name]",
      `Backy order ${orderNumber}`,
    );
    form.append(
      "line_items[0][price_data][product_data][description]",
      productSummary ||
        `${itemCount} checkout item${itemCount === 1 ? "" : "s"}`,
    );
    appendStripeMetadata(form, "payment_intent_data", handoff.metadata);
  }

  return form;
};

const executeStripeCheckoutSession = async ({
  handoff,
  orderNumber,
  quote,
  lineItems,
}: {
  handoff: CheckoutSessionHandoff;
  orderNumber: string;
  quote: ReturnType<typeof calculateCheckoutQuote>;
  lineItems: CheckoutLineItem[];
}): Promise<CheckoutSessionHandoff> => {
  if (handoff.provider !== "stripe") return handoff;

  const secretKey = envValue(["BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"]);
  if (!secretKey) return handoff;

  const response = await fetch(stripeCheckoutApiUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(handoff.accountId ? { "stripe-account": handoff.accountId } : {}),
      ...(envValue(["BACKY_STRIPE_API_VERSION", "STRIPE_API_VERSION"])
        ? {
            "stripe-version": envValue([
              "BACKY_STRIPE_API_VERSION",
              "STRIPE_API_VERSION",
            ]),
          }
        : {}),
    },
    body: buildStripeCheckoutSessionForm({
      handoff,
      orderNumber,
      quote,
      lineItems,
    }).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const providerError =
      payload.error &&
      typeof payload.error === "object" &&
      !Array.isArray(payload.error)
        ? (payload.error as Record<string, unknown>)
        : {};
    throw new CheckoutProviderError(
      "Checkout provider session creation failed",
      {
        provider: "stripe",
        status: response.status,
        type: textValue(providerError.type),
        code: textValue(providerError.code),
        message: textValue(providerError.message) || response.statusText,
      },
    );
  }

  const providerSessionId = textValue(payload.id) || handoff.id;
  const providerUrl = textValue(payload.url) || handoff.url;
  const reference =
    handoff.reference === `stripe:${handoff.id}`
      ? `stripe:${providerSessionId}`
      : handoff.reference;

  return {
    ...handoff,
    id: providerSessionId,
    status: "provider_created",
    url: providerUrl,
    successUrl: replaceCheckoutSessionInUrl(
      handoff.successUrl,
      providerSessionId,
    ),
    reference,
    providerPayload: {
      ...(handoff.providerPayload || {}),
      providerResponse: {
        id: providerSessionId,
        url: providerUrl,
        status: textValue(payload.status),
        paymentStatus: textValue(payload.payment_status),
        livemode:
          typeof payload.livemode === "boolean" ? payload.livemode : null,
      },
    },
  };
};

const upsertRepositoryCheckoutCustomer = async ({
  siteId,
  repositories,
  input,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
  input: CheckoutOrderInput;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  const email = normalizeEmail(input.customer?.email);
  if (!email) return null;

  const collectionInput = customerCollectionInput();
  const existingCollection = await repositories.collections.getBySlug(
    siteId,
    CUSTOMERS_COLLECTION_SLUG,
  );
  const collection =
    existingCollection ||
    (
      await repositories.collections.create({
        siteId,
        name: collectionInput.name,
        slug: collectionInput.slug,
        description: collectionInput.description,
        status: "draft",
        routePattern: collectionInput.routePattern,
        listRoutePattern: collectionInput.listRoutePattern,
        fields: collectionInput.fields,
        permissions: collectionInput.permissions,
        metadata: collectionInput.metadata as BackyJsonObject,
      })
    ).item;
  const ensuredFields = ensureCustomerFields(collection);
  const customerCollection =
    ensuredFields.length === collection.fields.length
      ? collection
      : (
          await repositories.collections.update(siteId, collection.id, {
            fields: ensuredFields,
            metadata: {
              ...(collection.metadata &&
              typeof collection.metadata === "object" &&
              !Array.isArray(collection.metadata)
                ? collection.metadata
                : {}),
              schemaVersion: "backy.customers.v1",
              source: "commerce-order-intake",
            } as BackyJsonObject,
          })
        ).item;
  const existingRecords = await repositories.collections.listRecords({
    siteId,
    collectionId: customerCollection.id,
    includeUnpublished: true,
    fieldKey: "email",
    fieldValue: email,
    limit: 100,
    offset: 0,
  });
  const existingRecord = existingRecords.items.find(
    (record) => normalizeEmail(record.values.email) === email,
  );
  const values = checkoutCustomerValues({
    input,
    existingValues: existingRecord?.values,
    orderId: orderNumber,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = existingRecord
    ? (
        await repositories.collections.updateRecord(
          siteId,
          customerCollection.id,
          existingRecord.id,
          {
            status: existingRecord.status,
            values: {
              ...existingRecord.values,
              ...values,
            },
          },
        )
      ).item
    : (
        await repositories.collections.createRecord({
          siteId,
          collectionId: customerCollection.id,
          slug: customerSlug(email),
          status: "draft",
          values,
        })
      ).item;

  return {
    collection: customerCollection,
    record,
    existingRecord: Boolean(existingRecord),
  };
};

const updateRepositoryCheckoutCustomerOrderLink = async ({
  siteId,
  repositories,
  customerProfile,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
  customerProfile: Awaited<ReturnType<typeof upsertRepositoryCheckoutCustomer>>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  if (!customerProfile) return null;
  const orderLinkValues = checkoutCustomerOrderLinkValues({
    existingValues: customerProfile.record.values,
    orderId,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = (
    await repositories.collections.updateRecord(
      siteId,
      customerProfile.collection.id,
      customerProfile.record.id,
      {
        status: customerProfile.record.status,
        values: {
          ...customerProfile.record.values,
          ...orderLinkValues,
        },
      },
    )
  ).item;

  return {
    ...customerProfile,
    record,
  };
};

const upsertDemoCheckoutCustomer = ({
  siteId,
  input,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  input: CheckoutOrderInput;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  const email = normalizeEmail(input.customer?.email);
  if (!email) return null;

  const collectionInput = customerCollectionInput();
  const existingCollection = getCollectionByIdOrSlug(
    siteId,
    CUSTOMERS_COLLECTION_SLUG,
    { includeUnpublished: true },
  );
  const collection =
    existingCollection || createAdminCollection(siteId, collectionInput);
  const ensuredFields = ensureCustomerFields(collection);
  const customerCollection =
    ensuredFields.length === collection.fields.length
      ? collection
      : updateAdminCollection(siteId, collection.id, {
          fields: ensuredFields,
          metadata: {
            ...(collection.metadata &&
            typeof collection.metadata === "object" &&
            !Array.isArray(collection.metadata)
              ? collection.metadata
              : {}),
            schemaVersion: "backy.customers.v1",
            source: "commerce-order-intake",
          },
        }) || collection;
  const existingRecord = listCollectionRecords(siteId, customerCollection.id, {
    includeUnpublished: true,
    fieldKey: "email",
    fieldValue: email,
    limit: 100,
    offset: 0,
  }).records.find((record) => normalizeEmail(record.values.email) === email);
  const values = checkoutCustomerValues({
    input,
    existingValues: existingRecord?.values,
    orderId: orderNumber,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = existingRecord
    ? updateAdminCollectionRecord(
        siteId,
        customerCollection.id,
        existingRecord.id,
        {
          status: existingRecord.status,
          values: {
            ...existingRecord.values,
            ...values,
          },
        },
      )
    : createAdminCollectionRecord(siteId, customerCollection.id, {
        slug: customerSlug(email),
        status: "draft",
        values,
      });

  return record
    ? {
        collection: customerCollection,
        record,
        existingRecord: Boolean(existingRecord),
      }
    : null;
};

const updateDemoCheckoutCustomerOrderLink = ({
  siteId,
  customerProfile,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  customerProfile: ReturnType<typeof upsertDemoCheckoutCustomer>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  if (!customerProfile) return null;
  const orderLinkValues = checkoutCustomerOrderLinkValues({
    existingValues: customerProfile.record.values,
    orderId,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = updateAdminCollectionRecord(
    siteId,
    customerProfile.collection.id,
    customerProfile.record.id,
    {
      status: customerProfile.record.status,
      values: {
        ...customerProfile.record.values,
        ...orderLinkValues,
      },
    },
  );

  return record
    ? {
        ...customerProfile,
        record,
      }
    : customerProfile;
};

const parseVariantSource = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const reserveInventoryForCheckoutItem = (
  record: CommerceSourceRecord,
  product: CommerceProduct,
  item: CheckoutItemInput,
  quantity: number,
): {
  values: Record<string, unknown> | null;
  error?: { code: string; message: string; details: Record<string, unknown> };
} => {
  if (product.productType !== "physical") {
    return { values: null };
  }

  const variant = selectProductVariant(product, item);
  if (variant) {
    if (variant.inventory === null) {
      return { values: null };
    }

    const variantInventory = variant.inventory;

    if (product.inventory.policy === "deny" && quantity > variantInventory) {
      return {
        values: null,
        error: {
          code: "VARIANT_INSUFFICIENT_STOCK",
          message: `${variant.title} has only ${variantInventory} available`,
          details: {
            productId: product.id,
            slug: product.slug,
            variantId: variant.id,
            requested: quantity,
            available: variantInventory,
          },
        },
      };
    }

    const variantSource = parseVariantSource(record.values.variants);
    const nextVariants = variantSource.map((source, index) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        return source;
      }

      const candidate = source as Record<string, unknown>;
      const candidateId = textValue(candidate.id) || `variant-${index + 1}`;
      const candidateSku = textValue(candidate.sku);
      const isMatch =
        candidateId === variant.id ||
        (candidateSku && candidateSku === variant.sku);

      return isMatch
        ? {
            ...candidate,
            inventory: Math.max(0, variantInventory - quantity),
          }
        : candidate;
    });

    return {
      values: {
        ...record.values,
        variants: nextVariants,
      },
    };
  }

  if (
    product.inventory.policy === "deny" &&
    quantity > product.inventory.quantity
  ) {
    return {
      values: null,
      error: {
        code: "PRODUCT_INSUFFICIENT_STOCK",
        message: `${product.title} has only ${product.inventory.quantity} available`,
        details: {
          productId: product.id,
          slug: product.slug,
          requested: quantity,
          available: product.inventory.quantity,
        },
      },
    };
  }

  return {
    values: {
      ...record.values,
      inventory: Math.max(0, product.inventory.quantity - quantity),
    },
  };
};

const applyRepositoryInventoryReservations = async ({
  siteId,
  productsCollectionId,
  repositories,
  reservations,
}: {
  siteId: string;
  productsCollectionId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
  reservations: Iterable<InventoryReservation>;
}) => {
  const applied: InventoryReservation[] = [];

  try {
    for (const reservation of reservations) {
      await repositories.collections.updateRecord(
        siteId,
        productsCollectionId,
        reservation.record.id,
        {
          status: reservation.record.status,
          values: toJsonRecord(reservation.values),
        },
      );
      applied.push(reservation);
    }
  } catch (error) {
    await Promise.allSettled(
      applied.map((reservation) =>
        repositories.collections.updateRecord(
          siteId,
          productsCollectionId,
          reservation.record.id,
          {
            status: reservation.record.status,
            values: toJsonRecord(reservation.originalValues),
          },
        ),
      ),
    );
    throw error;
  }

  return async () => {
    await Promise.allSettled(
      applied.map((reservation) =>
        repositories.collections.updateRecord(
          siteId,
          productsCollectionId,
          reservation.record.id,
          {
            status: reservation.record.status,
            values: toJsonRecord(reservation.originalValues),
          },
        ),
      ),
    );
  };
};

const applyDemoInventoryReservations = ({
  siteId,
  productsCollectionId,
  reservations,
}: {
  siteId: string;
  productsCollectionId: string;
  reservations: Iterable<InventoryReservation>;
}) => {
  const applied: InventoryReservation[] = [];

  try {
    for (const reservation of reservations) {
      const updated = updateAdminCollectionRecord(
        siteId,
        productsCollectionId,
        reservation.record.id,
        {
          status: reservation.record.status,
          values: reservation.values,
        },
      );
      if (!updated) {
        throw new Error(
          `Unable to reserve inventory for product ${reservation.record.id}`,
        );
      }
      applied.push(reservation);
    }
  } catch (error) {
    applied.forEach((reservation) => {
      updateAdminCollectionRecord(
        siteId,
        productsCollectionId,
        reservation.record.id,
        {
          status: reservation.record.status,
          values: reservation.originalValues,
        },
      );
    });
    throw error;
  }

  return () => {
    applied.forEach((reservation) => {
      updateAdminCollectionRecord(
        siteId,
        productsCollectionId,
        reservation.record.id,
        {
          status: reservation.record.status,
          values: reservation.originalValues,
        },
      );
    });
  };
};

const lowStockProductFromReservation = (
  reservation: InventoryReservation,
  context: {
    orderNumber: string;
    checkoutSessionId: string;
  },
): CommerceProductNotificationProduct | null => {
  const before = productRecordToCommerceProduct({
    ...reservation.record,
    values: reservation.originalValues,
  });
  const after = productRecordToCommerceProduct({
    ...reservation.record,
    values: reservation.values,
  });

  if (after.productType !== "physical") return null;
  if (after.inventory.lowStockThreshold <= 0) return null;
  if (!after.inventory.lowStock || before.inventory.lowStock) return null;

  return {
    id: after.id,
    slug: after.slug,
    title: after.title,
    sku: after.sku,
    inventory: after.inventory.quantity,
    previousInventory: before.inventory.quantity,
    lowStockThreshold: after.inventory.lowStockThreshold,
    orderNumber: context.orderNumber,
    checkoutSessionId: context.checkoutSessionId,
  };
};

const notifyLowStockProductsFromReservations = async ({
  repositories,
  siteId,
  reservations,
  orderNumber,
  checkoutSessionId,
  requestId,
}: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  siteId: string;
  reservations: InventoryReservation[];
  orderNumber: string;
  checkoutSessionId: string;
  requestId: string;
}) => {
  const products = reservations
    .map((reservation) =>
      lowStockProductFromReservation(reservation, {
        orderNumber,
        checkoutSessionId,
      }),
    )
    .filter((product): product is CommerceProductNotificationProduct =>
      Boolean(product),
    );
  const deliveries = [];

  for (const product of products) {
    deliveries.push(
      ...(await notifyCommerceProductLowStock({
        repositories,
        siteId,
        product,
        requestId,
      })),
    );
  }

  return deliveries;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));

      if (!site || !site.isPublished) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const [productsCollection, ordersCollection, settings] =
        await Promise.all([
          repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
          repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
          repositories.settings.get(),
        ]);

      if (
        !productsCollection ||
        productsCollection.status !== "published" ||
        !productsCollection.permissions.publicRead
      ) {
        return errorResponse(
          404,
          "PRODUCT_CATALOG_NOT_FOUND",
          "Product catalog not found",
          requestId,
        );
      }

      if (!ordersCollection || ordersCollection.status !== "published") {
        return errorResponse(
          404,
          "ORDER_QUEUE_NOT_FOUND",
          "Private order queue not found",
          requestId,
        );
      }

      if (hasPublicOrderCollectionAccess(ordersCollection.permissions)) {
        return errorResponse(
          409,
          "ORDER_QUEUE_NOT_PRIVATE",
          "Orders collection must remain private before public checkout intake is enabled",
          requestId,
        );
      }

      const commerce = buildCommerceStorefrontContract({
        siteId: site.id,
        settings: settings.integrations?.commerce,
        hasCatalog: true,
        hasOrderIntake: true,
      });

      return publicContractJson(
        {
          success: true,
          requestId,
          data: {
            ...orderContract(site.id),
            commerce,
            readiness: {
              site: true,
              catalog: true,
              privateOrderQueue: true,
              orderIntake: true,
            },
          },
        },
        {
          requestId,
          request,
          cache: "discovery",
          siteId: site.id,
        },
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const productsCollection = getCollectionByIdOrSlug(
      site.id,
      PRODUCT_COLLECTION_SLUG,
    );
    const ordersCollection = getCollectionByIdOrSlug(
      site.id,
      ORDERS_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    if (
      !productsCollection ||
      productsCollection.status !== "published" ||
      !productsCollection.permissions.publicRead
    ) {
      return errorResponse(
        404,
        "PRODUCT_CATALOG_NOT_FOUND",
        "Product catalog not found",
        requestId,
      );
    }
    if (!ordersCollection || ordersCollection.status !== "published") {
      return errorResponse(
        404,
        "ORDER_QUEUE_NOT_FOUND",
        "Private order queue not found",
        requestId,
      );
    }
    if (hasPublicOrderCollectionAccess(ordersCollection.permissions)) {
      return errorResponse(
        409,
        "ORDER_QUEUE_NOT_PRIVATE",
        "Orders collection must remain private before public checkout intake is enabled",
        requestId,
      );
    }
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: getAdminSettings().integrations?.commerce,
      hasCatalog: true,
      hasOrderIntake: true,
    });

    return publicContractJson(
      {
        success: true,
        requestId,
        data: {
          ...orderContract(site.id),
          commerce,
          readiness: {
            site: true,
            catalog: true,
            privateOrderQueue: true,
            orderIntake: true,
          },
        },
      },
      {
        requestId,
        request,
        cache: "discovery",
        siteId: site.id,
      },
    );
  } catch (error) {
    console.error("Public commerce order contract API error:", error);
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

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const input = normalizeCheckoutInput(body);
    const validationErrors = validateCheckoutInput(input);

    if (validationErrors.length > 0) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Checkout order is invalid",
        requestId,
        validationErrors,
      );
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));

      if (!site || !site.isPublished) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const [productsCollection, ordersCollection, settings] =
        await Promise.all([
          repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
          repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
          repositories.settings.get(),
        ]);

      if (
        !productsCollection ||
        productsCollection.status !== "published" ||
        !productsCollection.permissions.publicRead
      ) {
        return errorResponse(
          404,
          "PRODUCT_CATALOG_NOT_FOUND",
          "Product catalog not found",
          requestId,
        );
      }

      if (!ordersCollection || ordersCollection.status !== "published") {
        return errorResponse(
          404,
          "ORDER_QUEUE_NOT_FOUND",
          "Private order queue not found",
          requestId,
        );
      }

      if (hasPublicOrderCollectionAccess(ordersCollection.permissions)) {
        return errorResponse(
          409,
          "ORDER_QUEUE_NOT_PRIVATE",
          "Orders collection must remain private before public checkout intake is enabled",
          requestId,
        );
      }
      const monthlyOrderCount = await countRepositoryMonthlyOrders({
        siteId: site.id,
        collectionId: ordersCollection.id,
        repositories,
      });
      const orderLimitResponse = enforceMonthlyOrderBillingLimit(
        settings.integrations?.commerce,
        monthlyOrderCount,
        requestId,
      );
      if (orderLimitResponse) return orderLimitResponse;
      const commerce = buildCommerceStorefrontContract({
        siteId: site.id,
        settings: settings.integrations?.commerce,
        hasCatalog: true,
        hasOrderIntake: true,
      });
      const guestCheckoutResponse = requireGuestCheckoutAllowed(
        commerce,
        requestId,
      );
      if (guestCheckoutResponse) return guestCheckoutResponse;

      const lineItems = [];
      const reservationsEnabled = commerce.inventory.reservations;
      const inventoryReservations = new Map<string, InventoryReservation>();
      for (const item of input.items || []) {
        const quantity = quantityForCheckoutItem(item);
        const record = textValue(item.productId)
          ? await repositories.collections.getRecordById(
              site.id,
              productsCollection.id,
              textValue(item.productId),
            )
          : await repositories.collections.getRecordBySlug(
              site.id,
              productsCollection.id,
              textValue(item.slug),
            );

        if (!isCommerceSourceRecord(record)) {
          return errorResponse(
            404,
            "PRODUCT_NOT_FOUND",
            "Product not found",
            requestId,
            { item },
          );
        }

        const reservedRecord = inventoryReservations.get(record.id);
        const workingRecord: CommerceSourceRecord = reservedRecord
          ? { ...record, values: reservedRecord.values }
          : record;
        const product = productRecordToCommerceProduct(workingRecord);
        const variant = selectProductVariant(product, item);
        if ((item.variantId || item.variantSku) && !variant) {
          return errorResponse(
            404,
            "VARIANT_NOT_FOUND",
            "Product variant not found",
            requestId,
            { item, productId: product.id, slug: product.slug },
          );
        }
        if (reservationsEnabled && !variant && !product.inventory.inStock) {
          return errorResponse(
            409,
            "PRODUCT_OUT_OF_STOCK",
            `${product.title} is out of stock`,
            requestId,
            { productId: product.id, slug: product.slug },
          );
        }
        if (reservationsEnabled && variant && !variant.inStock) {
          return errorResponse(
            409,
            "VARIANT_OUT_OF_STOCK",
            `${variant.title} is out of stock`,
            requestId,
            {
              productId: product.id,
              slug: product.slug,
              variantId: variant.id,
            },
          );
        }

        if (reservationsEnabled) {
          const reservation = reserveInventoryForCheckoutItem(
            workingRecord,
            product,
            item,
            quantity,
          );
          if (reservation.error) {
            return errorResponse(
              409,
              reservation.error.code,
              reservation.error.message,
              requestId,
              reservation.error.details,
            );
          }
          if (reservation.values) {
            inventoryReservations.set(record.id, {
              record: workingRecord,
              originalValues: reservedRecord?.originalValues || record.values,
              values: reservation.values,
            });
          }
        }

        lineItems.push(lineItemFromProduct(product, quantity, item));
      }

      const currency = lineItems[0]?.currency || "USD";
      const quote = await applyCheckoutQuoteProviders({
        settings: settings.integrations?.commerce,
        input,
        lineItems,
        quote: calculateCheckoutQuote(
          lineItems,
          input.discountCode || "",
          commerce,
        ),
        requestId,
      });
      if (lineItems.some((item) => item.currency !== currency)) {
        return errorResponse(
          409,
          "MIXED_CURRENCY_CART",
          "All checkout items must use the same currency",
          requestId,
          {
            currencies: Array.from(
              new Set(lineItems.map((item) => item.currency)),
            ),
          },
        );
      }
      const orderNumber = buildOrderNumber();
      let slug = orderNumber.toLowerCase();
      let suffix = 2;
      while (
        await repositories.collections.getRecordBySlug(
          site.id,
          ordersCollection.id,
          slug,
        )
      ) {
        slug = `${orderNumber.toLowerCase()}-${suffix}`;
        suffix += 1;
      }
      const orderCreatedAt = new Date().toISOString();
      const checkoutSession = await executeStripeCheckoutSession({
        handoff: buildCheckoutSessionHandoff({
          request,
          siteId: site.id,
          commerce,
          input,
          orderNumber,
          orderSlug: slug,
          quote,
          lineItems,
          requestId,
          createdAt: orderCreatedAt,
        }),
        orderNumber,
        quote,
        lineItems,
      });
      const risk = assessCheckoutRisk({
        input,
        quote,
        lineItems,
        checkoutSession,
      });
      let customerProfile = await upsertRepositoryCheckoutCustomer({
        siteId: site.id,
        repositories,
        input,
        orderNumber,
        orderCreatedAt,
        total: quote.total,
        requestId,
      });
      const values = {
        ordernumber: orderNumber,
        customername: input.customer?.name || "",
        email: input.customer?.email || "",
        phone: input.customer?.phone || "",
        total: quote.total,
        subtotal: quote.subtotal,
        taxamount: quote.taxAmount,
        shippingamount: quote.shippingAmount,
        discountamount: quote.discountAmount,
        currency,
        items: JSON.stringify(lineItems, null, 2),
        ordersource: "web",
        checkoutsessionid: checkoutSession.id,
        customerid: customerProfile?.record.id || "",
        orderstatus: "open",
        paymentstatus: "pending",
        paymentprovider: checkoutSession.provider,
        paymentreference: checkoutSession.reference,
        fulfillmentstatus: "unfulfilled",
        shippinglabelstatus: "none",
        shippinglabelprovider: "",
        shippinglabelid: "",
        shippinglabelurl: "",
        shippingservicelevel: "",
        shippinglabelcost: null,
        shippinglabelcreatedat: null,
        providerrefundstatus: "none",
        providerrefundprovider: "",
        providerrefundid: "",
        providerrefundreference: "",
        providerrefundamount: null,
        providerrefundreason: "",
        providerrefundrequestedat: null,
        providerrefundcompletedat: null,
        providerrefundpayload: "",
        riskscore: risk.score,
        risklevel: risk.level,
        riskreasons: risk.reasons.join("\n"),
        riskreviewstatus: risk.reviewStatus,
        shippingaddress: input.shippingAddress || "",
        billingaddress: input.billingAddress || "",
        notes: input.notes || "",
      };
      const reservationList = Array.from(inventoryReservations.values());
      const rollbackInventoryReservations =
        await applyRepositoryInventoryReservations({
          siteId: site.id,
          productsCollectionId: productsCollection.id,
          repositories,
          reservations: reservationList,
        });

      let order: Awaited<
        ReturnType<typeof repositories.collections.createRecord>
      >["item"];
      try {
        order = (
          await repositories.collections.createRecord({
            siteId: site.id,
            collectionId: ordersCollection.id,
            slug,
            status: "published",
            values: toJsonRecord(values),
          })
        ).item;
      } catch (error) {
        await rollbackInventoryReservations();
        throw error;
      }
      customerProfile = await updateRepositoryCheckoutCustomerOrderLink({
        siteId: site.id,
        repositories,
        customerProfile,
        orderId: order.id,
        orderNumber,
        orderCreatedAt,
        total: quote.total,
        requestId,
      });
      const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
      const orderDeliveries = await notifyOrderCreated({
        repositories,
        siteId: site.id,
        requestId,
        order: {
          id: order.id,
          slug: order.slug,
          orderNumber,
          total: quote.total,
          currency,
          customerName: input.customer?.name || "",
          email: input.customer?.email || "",
          itemCount,
          paymentStatus: values.paymentstatus,
          fulfillmentStatus: values.fulfillmentstatus,
          checkoutSessionId: checkoutSession.id,
        },
      });
      const productDeliveries = await notifyLowStockProductsFromReservations({
        repositories,
        siteId: site.id,
        reservations: reservationList,
        orderNumber,
        checkoutSessionId: checkoutSession.id,
        requestId,
      });
      const deliveries = [...orderDeliveries, ...productDeliveries];

      return publicContractJson(
        {
          success: true,
          requestId,
          data: {
            schemaVersion: ORDER_CONTRACT_VERSION,
            order: {
              id: order.id,
              slug: order.slug,
              orderNumber,
              status: values.orderstatus,
              paymentStatus: values.paymentstatus,
              fulfillmentStatus: values.fulfillmentstatus,
              total: quote.total,
              subtotal: quote.subtotal,
              taxAmount: quote.taxAmount,
              shippingAmount: quote.shippingAmount,
              discountAmount: quote.discountAmount,
              currency,
              itemCount,
              createdAt: order.createdAt,
            },
            customer: customerProfile
              ? {
                  id: customerProfile.record.id,
                  slug: customerProfile.record.slug,
                  existing: customerProfile.existingRecord,
                }
              : null,
            checkoutSession,
            quote,
            lineItems,
            risk,
            deliveries,
          },
        },
        {
          status: 201,
          requestId,
          request,
          cache: "private",
          siteId: site.id,
        },
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const productsCollection = getCollectionByIdOrSlug(
      site.id,
      PRODUCT_COLLECTION_SLUG,
    );
    const ordersCollection = getCollectionByIdOrSlug(
      site.id,
      ORDERS_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    if (
      !productsCollection ||
      productsCollection.status !== "published" ||
      !productsCollection.permissions.publicRead
    ) {
      return errorResponse(
        404,
        "PRODUCT_CATALOG_NOT_FOUND",
        "Product catalog not found",
        requestId,
      );
    }
    if (!ordersCollection || ordersCollection.status !== "published") {
      return errorResponse(
        404,
        "ORDER_QUEUE_NOT_FOUND",
        "Private order queue not found",
        requestId,
      );
    }
    if (hasPublicOrderCollectionAccess(ordersCollection.permissions)) {
      return errorResponse(
        409,
        "ORDER_QUEUE_NOT_PRIVATE",
        "Orders collection must remain private before public checkout intake is enabled",
        requestId,
      );
    }
    const adminSettings = getAdminSettings();
    const orderLimitResponse = enforceMonthlyOrderBillingLimit(
      adminSettings.integrations?.commerce,
      countDemoMonthlyOrders(site.id, ordersCollection.id),
      requestId,
    );
    if (orderLimitResponse) return orderLimitResponse;
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: adminSettings.integrations?.commerce,
      hasCatalog: true,
      hasOrderIntake: true,
    });
    const guestCheckoutResponse = requireGuestCheckoutAllowed(
      commerce,
      requestId,
    );
    if (guestCheckoutResponse) return guestCheckoutResponse;

    const lineItems = [];
    const reservationsEnabled = commerce.inventory.reservations;
    const inventoryReservations = new Map<string, InventoryReservation>();
    for (const item of input.items || []) {
      const quantity = quantityForCheckoutItem(item);
      const record = getCollectionRecordByIdOrSlug(
        site.id,
        productsCollection.id,
        textValue(item.productId || item.slug),
      );

      if (!isCommerceSourceRecord(record)) {
        return errorResponse(
          404,
          "PRODUCT_NOT_FOUND",
          "Product not found",
          requestId,
          { item },
        );
      }

      const reservedRecord = inventoryReservations.get(record.id);
      const workingRecord: CommerceSourceRecord = reservedRecord
        ? { ...record, values: reservedRecord.values }
        : record;
      const product = productRecordToCommerceProduct(workingRecord);
      const variant = selectProductVariant(product, item);
      if ((item.variantId || item.variantSku) && !variant) {
        return errorResponse(
          404,
          "VARIANT_NOT_FOUND",
          "Product variant not found",
          requestId,
          { item, productId: product.id, slug: product.slug },
        );
      }
      if (reservationsEnabled && !variant && !product.inventory.inStock) {
        return errorResponse(
          409,
          "PRODUCT_OUT_OF_STOCK",
          `${product.title} is out of stock`,
          requestId,
          { productId: product.id, slug: product.slug },
        );
      }
      if (reservationsEnabled && variant && !variant.inStock) {
        return errorResponse(
          409,
          "VARIANT_OUT_OF_STOCK",
          `${variant.title} is out of stock`,
          requestId,
          { productId: product.id, slug: product.slug, variantId: variant.id },
        );
      }

      if (reservationsEnabled) {
        const reservation = reserveInventoryForCheckoutItem(
          workingRecord,
          product,
          item,
          quantity,
        );
        if (reservation.error) {
          return errorResponse(
            409,
            reservation.error.code,
            reservation.error.message,
            requestId,
            reservation.error.details,
          );
        }
        if (reservation.values) {
          inventoryReservations.set(record.id, {
            record: workingRecord,
            originalValues: reservedRecord?.originalValues || record.values,
            values: reservation.values,
          });
        }
      }

      lineItems.push(lineItemFromProduct(product, quantity, item));
    }

    const currency = lineItems[0]?.currency || "USD";
    const quote = await applyCheckoutQuoteProviders({
      settings: adminSettings.integrations?.commerce,
      input,
      lineItems,
      quote: calculateCheckoutQuote(
        lineItems,
        input.discountCode || "",
        commerce,
      ),
      requestId,
    });
    if (lineItems.some((item) => item.currency !== currency)) {
      return errorResponse(
        409,
        "MIXED_CURRENCY_CART",
        "All checkout items must use the same currency",
        requestId,
        {
          currencies: Array.from(
            new Set(lineItems.map((item) => item.currency)),
          ),
        },
      );
    }
    const orderNumber = buildOrderNumber();
    let slug = orderNumber.toLowerCase();
    let suffix = 2;
    while (
      getCollectionRecordByIdOrSlug(site.id, ordersCollection.id, slug, {
        includeUnpublished: true,
      })
    ) {
      slug = `${orderNumber.toLowerCase()}-${suffix}`;
      suffix += 1;
    }
    const orderCreatedAt = new Date().toISOString();
    const checkoutSession = await executeStripeCheckoutSession({
      handoff: buildCheckoutSessionHandoff({
        request,
        siteId: site.id,
        commerce,
        input,
        orderNumber,
        orderSlug: slug,
        quote,
        lineItems,
        requestId,
        createdAt: orderCreatedAt,
      }),
      orderNumber,
      quote,
      lineItems,
    });
    const risk = assessCheckoutRisk({
      input,
      quote,
      lineItems,
      checkoutSession,
    });
    let customerProfile = upsertDemoCheckoutCustomer({
      siteId: site.id,
      input,
      orderNumber,
      orderCreatedAt,
      total: quote.total,
      requestId,
    });
    const reservationList = Array.from(inventoryReservations.values());
    const rollbackInventoryReservations = applyDemoInventoryReservations({
      siteId: site.id,
      productsCollectionId: productsCollection.id,
      reservations: reservationList,
    });

    let order: NonNullable<ReturnType<typeof createAdminCollectionRecord>>;
    try {
      const createdOrder = createAdminCollectionRecord(
        site.id,
        ordersCollection.id,
        {
          slug,
          status: "published",
          values: {
            ordernumber: orderNumber,
            customername: input.customer?.name || "",
            email: input.customer?.email || "",
            phone: input.customer?.phone || "",
            total: quote.total,
            subtotal: quote.subtotal,
            taxamount: quote.taxAmount,
            shippingamount: quote.shippingAmount,
            discountamount: quote.discountAmount,
            currency,
            items: JSON.stringify(lineItems, null, 2),
            ordersource: "web",
            checkoutsessionid: checkoutSession.id,
            customerid: customerProfile?.record.id || "",
            orderstatus: "open",
            paymentstatus: "pending",
            paymentprovider: checkoutSession.provider,
            paymentreference: checkoutSession.reference,
            fulfillmentstatus: "unfulfilled",
            shippinglabelstatus: "none",
            shippinglabelprovider: "",
            shippinglabelid: "",
            shippinglabelurl: "",
            shippingservicelevel: "",
            shippinglabelcost: null,
            shippinglabelcreatedat: null,
            providerrefundstatus: "none",
            providerrefundprovider: "",
            providerrefundid: "",
            providerrefundreference: "",
            providerrefundamount: null,
            providerrefundreason: "",
            providerrefundrequestedat: null,
            providerrefundcompletedat: null,
            providerrefundpayload: "",
            riskscore: risk.score,
            risklevel: risk.level,
            riskreasons: risk.reasons.join("\n"),
            riskreviewstatus: risk.reviewStatus,
            shippingaddress: input.shippingAddress || "",
            billingaddress: input.billingAddress || "",
            notes: input.notes || "",
          },
        },
      );

      if (!createdOrder) {
        rollbackInventoryReservations();
        return errorResponse(
          404,
          "ORDER_QUEUE_NOT_FOUND",
          "Private order queue not found",
          requestId,
        );
      }
      order = createdOrder;
    } catch (error) {
      rollbackInventoryReservations();
      throw error;
    }
    customerProfile = updateDemoCheckoutCustomerOrderLink({
      siteId: site.id,
      customerProfile,
      orderId: order.id,
      orderNumber,
      orderCreatedAt,
      total: quote.total,
      requestId,
    });
    const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
    const orderDeliveries = await notifyOrderCreated({
      siteId: site.id,
      requestId,
      order: {
        id: order.id,
        slug: order.slug,
        orderNumber,
        total: quote.total,
        currency,
        customerName: input.customer?.name || "",
        email: input.customer?.email || "",
        itemCount,
        paymentStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        checkoutSessionId: checkoutSession.id,
      },
    });
    const productDeliveries = await notifyLowStockProductsFromReservations({
      siteId: site.id,
      reservations: reservationList,
      orderNumber,
      checkoutSessionId: checkoutSession.id,
      requestId,
    });
    const deliveries = [...orderDeliveries, ...productDeliveries];

    return publicContractJson(
      {
        success: true,
        requestId,
        data: {
          schemaVersion: ORDER_CONTRACT_VERSION,
          order: {
            id: order.id,
            slug: order.slug,
            orderNumber,
            status: "open",
            paymentStatus: "pending",
            fulfillmentStatus: "unfulfilled",
            total: quote.total,
            subtotal: quote.subtotal,
            taxAmount: quote.taxAmount,
            shippingAmount: quote.shippingAmount,
            discountAmount: quote.discountAmount,
            currency,
            itemCount,
            createdAt: order.createdAt,
          },
          customer: customerProfile
            ? {
                id: customerProfile.record.id,
                slug: customerProfile.record.slug,
                existing: customerProfile.existingRecord,
              }
            : null,
          checkoutSession,
          quote,
          lineItems,
          risk,
          deliveries,
        },
      },
      {
        status: 201,
        requestId,
        request,
        cache: "private",
        siteId: site.id,
      },
    );
  } catch (error) {
    if (error instanceof CheckoutProviderError) {
      return errorResponse(
        error.status,
        error.code,
        error.message,
        requestId,
        error.details,
      );
    }
    console.error("Public commerce order intake API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
