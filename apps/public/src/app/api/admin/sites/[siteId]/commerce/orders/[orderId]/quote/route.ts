/**
 * Admin commerce order quote refresh endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/quote
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/quote
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
import {
  buildCommerceStorefrontContract,
  type CommerceStorefrontContract,
} from "@/lib/commerceCatalog";
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

interface QuoteLineItem {
  productId: string;
  slug: string;
  title: string;
  quantity: number;
  price: number;
  lineTotal: number;
  currency: string;
  taxable: boolean;
  taxClass: string;
  shippingRequired: boolean;
  shippingProfile: string;
  weight: number;
  discountCode: string;
}

interface OrderQuotePayload {
  schemaVersion: "backy.order-quote.v1";
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  currency: string;
  discountCode: string;
  discountRate: number;
  taxLines: Array<Record<string, unknown>>;
  shippingLines: Array<Record<string, unknown>>;
  discountLines: Array<Record<string, unknown>>;
  providerAdjustments: QuoteProviderAdjustment[];
  pricing: CommerceStorefrontContract["pricing"];
  calculatedAt: string;
}

interface QuoteProviderAdjustment {
  kind: "tax" | "shipping" | "discount";
  provider: "http" | "stripe" | "taxjar" | "avalara" | "easypost" | "shippo";
  status: "succeeded" | "failed" | "skipped";
  url?: string;
  amount?: number;
  lines?: Array<Record<string, unknown>>;
  error?: string;
  statusCode?: number;
  reference?: string;
}

const ORDERS_COLLECTION_SLUG = "orders";
const ORDER_QUOTE_SCHEMA_VERSION = "backy.order-quote.v1";

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
      schemaVersion: ORDER_QUOTE_SCHEMA_VERSION,
    },
  );

const privateQuoteResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: ORDER_QUOTE_SCHEMA_VERSION,
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

const optionalNumberValue = (value: unknown): number | null => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const moneyValue = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const stripeSecretKey = () =>
  process.env.BACKY_STRIPE_SECRET_KEY?.trim() ||
  process.env.STRIPE_SECRET_KEY?.trim() ||
  "";

const stripeApiBaseUrl = () =>
  (
    process.env.BACKY_STRIPE_TAX_API_BASE_URL?.trim() ||
    process.env.BACKY_STRIPE_API_BASE_URL?.trim() ||
    process.env.STRIPE_API_BASE_URL?.trim() ||
    "https://api.stripe.com"
  ).replace(/\/$/, "");

const stripeDiscountApiBaseUrl = () =>
  (
    process.env.BACKY_STRIPE_DISCOUNT_API_BASE_URL?.trim() ||
    process.env.BACKY_STRIPE_API_BASE_URL?.trim() ||
    process.env.STRIPE_API_BASE_URL?.trim() ||
    "https://api.stripe.com"
  ).replace(/\/$/, "");

const taxJarApiKey = () =>
  process.env.BACKY_TAXJAR_API_KEY?.trim() ||
  process.env.TAXJAR_API_KEY?.trim() ||
  "";

const taxJarApiBaseUrl = () =>
  (
    process.env.BACKY_TAXJAR_API_BASE_URL?.trim() ||
    process.env.TAXJAR_API_BASE_URL?.trim() ||
    "https://api.taxjar.com/v2"
  ).replace(/\/$/, "");

const avalaraAccountId = () =>
  process.env.BACKY_AVALARA_ACCOUNT_ID?.trim() ||
  process.env.AVALARA_ACCOUNT_ID?.trim() ||
  "";

const avalaraLicenseKey = () =>
  process.env.BACKY_AVALARA_LICENSE_KEY?.trim() ||
  process.env.AVALARA_LICENSE_KEY?.trim() ||
  "";

const avalaraCompanyCode = () =>
  process.env.BACKY_AVALARA_COMPANY_CODE?.trim() ||
  process.env.AVALARA_COMPANY_CODE?.trim() ||
  "";

const avalaraApiBaseUrl = () =>
  (
    process.env.BACKY_AVALARA_API_BASE_URL?.trim() ||
    process.env.AVALARA_API_BASE_URL?.trim() ||
    "https://sandbox-rest.avatax.com"
  ).replace(/\/$/, "");

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

const toProviderAmount = (amount: number, currency: string): number => {
  const normalizedCurrency = currency.trim().toUpperCase();
  return zeroDecimalCurrencies.has(normalizedCurrency)
    ? Math.max(0, Math.round(moneyValue(amount)))
    : Math.max(0, Math.round(moneyValue(amount) * 100));
};

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

const boolValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
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

const normalizeLineItems = (
  record: CollectionRecordAuditSource,
): QuoteLineItem[] => {
  const values = toRecord(record.values);
  const currency = textValue(values.currency) || "USD";
  return parseItems(values.items)
    .map((item, index) => {
      const quantity = Math.max(0, Math.round(numberValue(item.quantity, 1)));
      const price = moneyValue(
        Math.max(0, numberValue(item.price, numberValue(item.unitPrice))),
      );
      const lineTotal = moneyValue(
        numberValue(item.lineTotal, price * quantity),
      );
      const productType = textValue(item.productType).toLowerCase();
      const shippingRequired = boolValue(
        item.shippingRequired,
        productType !== "digital" && productType !== "service",
      );
      const taxable = boolValue(item.taxable, true);
      return {
        productId:
          textValue(item.productId) ||
          textValue(item.id) ||
          `line-${index + 1}`,
        slug:
          textValue(item.slug) || textValue(item.sku) || `line-${index + 1}`,
        title: textValue(item.title),
        quantity,
        price,
        lineTotal,
        currency: textValue(item.currency) || currency,
        taxable,
        taxClass: textValue(item.taxClass) || "standard",
        shippingRequired,
        shippingProfile: textValue(item.shippingProfile) || "standard",
        weight: Math.max(0, numberValue(item.weight)),
        discountCode: textValue(item.discountCode).toUpperCase(),
      };
    })
    .filter((item) => item.quantity > 0 && item.lineTotal > 0);
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
  if (rules.discountPercent > 0) return rules.discountPercent / 100;
  const match = code.match(/(\d{1,2})$/);
  if (!match) return code ? 0.1 : 0;
  return Math.max(0, Math.min(90, Number(match[1]))) / 100;
};

const providerModeForKind = (
  settings: Record<string, unknown>,
  kind: QuoteProviderAdjustment["kind"],
):
  | "manual"
  | "http"
  | "stripe"
  | "taxjar"
  | "avalara"
  | "easypost"
  | "shippo" => {
  const mode = textValue(settings[`${kind}Provider`]).toLowerCase();
  if (mode === "http") return "http";
  if ((kind === "tax" || kind === "discount") && mode === "stripe")
    return "stripe";
  if (kind === "tax" && mode === "taxjar") return "taxjar";
  if (kind === "tax" && mode === "avalara") return "avalara";
  if (kind === "shipping" && mode === "easypost") return "easypost";
  if (kind === "shipping" && mode === "shippo") return "shippo";
  return "manual";
};

const providerUrlForKind = (
  settings: Record<string, unknown>,
  kind: QuoteProviderAdjustment["kind"],
): string => {
  const mode = providerModeForKind(settings, kind);
  const url = textValue(settings[`${kind}ProviderUrl`]);
  if (mode !== "http" || !url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
};

const parseAddressForStripeTax = (
  values: Record<string, unknown>,
  body: Record<string, unknown>,
) => {
  const addressText =
    textValue(body.shippingAddress) ||
    textValue(values.shippingaddress) ||
    textValue(body.billingAddress) ||
    textValue(values.billingaddress);
  const stateMatch = addressText.match(
    /(?:^|,\s*)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,|$)/,
  );
  const postalMatch = addressText.match(/\b\d{5}(?:-\d{4})?\b/);
  const country = (
    textValue(body.taxCountry) ||
    textValue(body.country) ||
    textValue(values.taxcountry) ||
    "US"
  ).toUpperCase();
  return {
    country,
    state:
      textValue(body.taxState) ||
      textValue(values.taxstate) ||
      stateMatch?.[1] ||
      "",
    postalCode:
      textValue(body.taxPostalCode) ||
      textValue(values.taxpostalcode) ||
      postalMatch?.[0] ||
      "",
    line1: addressText.split(",")[0]?.trim() || "",
  };
};

const parseAddressObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value))
    return toRecord(value);
  if (typeof value !== "string" || !value.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(value);
    return toRecord(parsed);
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
    Object.entries(toRecord(value))
      .map(([key, entry]) => [key, safeProviderField(entry)] as const)
      .filter(([, entry]) => entry !== null && entry !== ""),
  );

const hasProviderRecordFields = (value: unknown): boolean =>
  Object.keys(safeProviderRecord(value)).length > 0;

const nestedProviderRecord = (
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> => parseAddressObject(source[key]);

const normalizeProviderKey = (value: string): string =>
  value.toLowerCase().replace(/[\s_-]+/g, "");

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

const taxJarAddress = (
  values: Record<string, unknown>,
  body: Record<string, unknown>,
  prefix: "to" | "from",
  fallbackSource: unknown,
) => {
  const explicit = {
    country: textValue(body[`${prefix}Country`]),
    state: textValue(body[`${prefix}State`]),
    zip:
      textValue(body[`${prefix}Zip`]) || textValue(body[`${prefix}PostalCode`]),
    city: textValue(body[`${prefix}City`]),
    street:
      textValue(body[`${prefix}Street`]) || textValue(body[`${prefix}Street1`]),
  };
  const objectAddress = parseAddressObject(
    body[`${prefix}Address`] || fallbackSource,
  );
  const addressText =
    textValue(body[`${prefix}Address`]) || textValue(fallbackSource);
  const parsedText = parseAddressTextParts(addressText);
  const country = (
    explicit.country ||
    addressField(objectAddress, ["country", "countryCode"]) ||
    "US"
  ).toUpperCase();
  return {
    country,
    state:
      explicit.state ||
      addressField(objectAddress, ["state", "province", "region"]) ||
      parsedText.state,
    zip:
      explicit.zip ||
      addressField(objectAddress, ["zip", "postalCode", "postal_code"]) ||
      parsedText.zip,
    city:
      explicit.city ||
      addressField(objectAddress, ["city", "locality"]) ||
      parsedText.city,
    street:
      explicit.street ||
      addressField(objectAddress, ["street", "street1", "line1", "address1"]) ||
      parsedText.street,
    customerId: textValue(body.customerId) || textValue(values.customerid),
    exemptionType:
      textValue(body.exemptionType) || textValue(values.exemptiontype),
  };
};

const resolveShippingRateInput = (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  settings: Record<string, unknown>,
  fallbackProvider: "easypost" | "shippo",
) => {
  const values = toRecord(record.values);
  const shippingAddress = parseAddressObject(values.shippingaddress);
  const directToAddress =
    hasProviderRecordFields(shippingAddress) &&
    !shippingAddress.toAddress &&
    !shippingAddress.fromAddress &&
    !shippingAddress.parcel
      ? shippingAddress
      : {};
  return {
    provider:
      textValue(body.executionProvider) ||
      textValue(body.shippingProvider) ||
      textValue(body.provider) ||
      fallbackProvider,
    carrier:
      textValue(body.carrier) ||
      textValue(shippingAddress.carrier) ||
      textValue(settings.shippingDefaultCarrier) ||
      fallbackProvider,
    serviceLevel:
      textValue(body.serviceLevel) ||
      textValue(shippingAddress.serviceLevel) ||
      textValue(settings.shippingDefaultServiceLevel),
    rateId:
      textValue(body.rateId) ||
      textValue(body.easypostRateId) ||
      textValue(body.shippoRateId) ||
      textValue(shippingAddress.rateId) ||
      textValue(settings.shippingDefaultRateId),
    fromAddress: hasProviderRecordFields(body.fromAddress)
      ? toRecord(body.fromAddress)
      : hasProviderRecordFields(
            nestedProviderRecord(shippingAddress, "fromAddress"),
          )
        ? nestedProviderRecord(shippingAddress, "fromAddress")
        : parseAddressObject(settings.shippingOriginAddress),
    toAddress: hasProviderRecordFields(body.toAddress)
      ? toRecord(body.toAddress)
      : hasProviderRecordFields(
            nestedProviderRecord(shippingAddress, "toAddress"),
          )
        ? nestedProviderRecord(shippingAddress, "toAddress")
        : directToAddress,
    parcel: hasProviderRecordFields(body.parcel)
      ? toRecord(body.parcel)
      : hasProviderRecordFields(nestedProviderRecord(shippingAddress, "parcel"))
        ? nestedProviderRecord(shippingAddress, "parcel")
        : parseAddressObject(settings.shippingDefaultParcel),
  };
};

const stripeTaxLines = (
  lineItems: QuoteLineItem[],
  quote: OrderQuotePayload,
): Array<QuoteLineItem & { taxableAmount: number }> => {
  const discountByProduct = new Map(
    quote.discountLines.map((line) => [
      String(line.productId),
      numberValue(line.amount),
    ]),
  );
  return lineItems
    .filter((item) => item.taxable && item.lineTotal > 0)
    .map((item) => ({
      ...item,
      taxableAmount: moneyValue(
        Math.max(
          0,
          item.lineTotal - (discountByProduct.get(item.productId) || 0),
        ),
      ),
    }))
    .filter((item) => item.taxableAmount > 0);
};

const safeStripeTaxLines = (
  payload: Record<string, unknown>,
  currency: string,
): Array<Record<string, unknown>> => {
  const lineItems = toRecord(payload.line_items);
  const data = Array.isArray(lineItems.data)
    ? lineItems.data.map(toRecord)
    : [];
  if (data.length > 0) {
    return data.map((item) => ({
      provider: "stripe",
      id: textValue(item.id),
      reference: textValue(item.reference),
      amount: fromProviderAmount(item.amount, currency) ?? null,
      taxAmount: fromProviderAmount(item.amount_tax, currency) ?? null,
    }));
  }
  const breakdown = Array.isArray(payload.tax_breakdown)
    ? payload.tax_breakdown.map(toRecord)
    : [];
  return breakdown.map((item) => ({
    provider: "stripe",
    taxabilityReason: textValue(item.taxability_reason),
    amount: fromProviderAmount(item.taxable_amount, currency) ?? null,
    taxAmount: fromProviderAmount(item.amount, currency) ?? null,
  }));
};

const callStripeTaxProvider = async ({
  record,
  body,
  lineItems,
  quote,
  requestId,
}: {
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
  lineItems: QuoteLineItem[];
  quote: OrderQuotePayload;
  requestId: string;
}): Promise<QuoteProviderAdjustment> => {
  const secretKey = stripeSecretKey();
  if (!secretKey) {
    return {
      kind: "tax",
      provider: "stripe",
      status: "skipped",
      error:
        "Stripe Tax is selected, but BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY is not configured.",
    };
  }

  const taxableLines = stripeTaxLines(lineItems, quote);
  if (taxableLines.length === 0 && quote.shippingAmount <= 0) {
    return {
      kind: "tax",
      provider: "stripe",
      status: "skipped",
      error:
        "No taxable line items or shipping amount were available for Stripe Tax.",
    };
  }

  const values = toRecord(record.values);
  const currency = quote.currency.toUpperCase();
  const form = new URLSearchParams();
  const address = parseAddressForStripeTax(values, body);
  form.set("currency", currency.toLowerCase());
  form.set("customer_details[address][country]", address.country || "US");
  if (address.state)
    form.set("customer_details[address][state]", address.state);
  if (address.postalCode)
    form.set("customer_details[address][postal_code]", address.postalCode);
  if (address.line1)
    form.set("customer_details[address][line1]", address.line1);
  form.set("customer_details[address_source]", "shipping");
  form.set("expand[0]", "line_items");

  taxableLines.forEach((item, index) => {
    const prefix = `line_items[${index}]`;
    form.set(
      `${prefix}[amount]`,
      String(toProviderAmount(item.taxableAmount, currency)),
    );
    form.set(
      `${prefix}[reference]`,
      item.productId || item.slug || `line-${index + 1}`,
    );
    if (item.taxClass.startsWith("txcd_")) {
      form.set(`${prefix}[tax_code]`, item.taxClass);
    }
  });
  if (quote.shippingAmount > 0) {
    form.set(
      "shipping_cost[amount]",
      String(toProviderAmount(quote.shippingAmount, currency)),
    );
  }

  try {
    const response = await fetch(`${stripeApiBaseUrl()}/v1/tax/calculations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `${requestId}-tax-${record.id}`,
        ...(process.env.BACKY_STRIPE_API_VERSION?.trim() ||
        process.env.STRIPE_API_VERSION?.trim()
          ? {
              "stripe-version":
                process.env.BACKY_STRIPE_API_VERSION?.trim() ||
                process.env.STRIPE_API_VERSION?.trim() ||
                "",
            }
          : {}),
      },
      body: form.toString(),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => ({}));
    const payloadRecord = toRecord(payload);
    if (!response.ok) {
      const error = toRecord(payloadRecord.error);
      return {
        kind: "tax",
        provider: "stripe",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(error.message) ||
          textValue(payloadRecord.message) ||
          `Stripe Tax returned HTTP ${response.status}.`,
        reference: textValue(payloadRecord.id),
      };
    }

    const amount = fromProviderAmount(
      payloadRecord.tax_amount_exclusive ??
        payloadRecord.tax_amount_inclusive ??
        payloadRecord.tax_amount,
      currency,
    );
    if (amount === null) {
      return {
        kind: "tax",
        provider: "stripe",
        status: "failed",
        statusCode: response.status,
        error: "Stripe Tax response did not include a tax amount.",
        reference: textValue(payloadRecord.id),
      };
    }

    return {
      kind: "tax",
      provider: "stripe",
      status: "succeeded",
      statusCode: response.status,
      amount,
      lines: safeStripeTaxLines(payloadRecord, currency),
      reference: textValue(payloadRecord.id),
    };
  } catch (error) {
    return {
      kind: "tax",
      provider: "stripe",
      status: "failed",
      error:
        error instanceof Error ? error.message : "Stripe Tax request failed.",
    };
  }
};

const taxJarLineItems = (
  lineItems: QuoteLineItem[],
  quote: OrderQuotePayload,
) => {
  const discountByProduct = new Map(
    quote.discountLines.map((line) => [
      String(line.productId),
      numberValue(line.amount),
    ]),
  );
  return lineItems
    .filter((item) => item.taxable && item.lineTotal > 0)
    .map((item) => ({
      id: item.productId || item.slug,
      quantity: item.quantity,
      unit_price: moneyValue(
        item.quantity > 0 ? item.lineTotal / item.quantity : item.price,
      ),
      discount: moneyValue(
        Math.max(0, discountByProduct.get(item.productId) || 0),
      ),
      ...(item.taxClass &&
      item.taxClass !== "standard" &&
      /^[0-9A-Za-z_-]+$/.test(item.taxClass)
        ? { product_tax_code: item.taxClass }
        : {}),
    }));
};

const avalaraLineItems = (
  lineItems: QuoteLineItem[],
  quote: OrderQuotePayload,
) => {
  const discountByProduct = new Map(
    quote.discountLines.map((line) => [
      String(line.productId),
      numberValue(line.amount),
    ]),
  );
  return lineItems
    .filter((item) => item.taxable && item.lineTotal > 0)
    .map((item, index) => ({
      number: item.productId || item.slug || `line-${index + 1}`,
      quantity: item.quantity,
      amount: moneyValue(
        Math.max(
          0,
          item.lineTotal - (discountByProduct.get(item.productId) || 0),
        ),
      ),
      itemCode: item.slug || item.productId || `line-${index + 1}`,
      description: item.title || item.slug || item.productId,
      ...(item.taxClass && item.taxClass !== "standard"
        ? { taxCode: item.taxClass }
        : {}),
    }))
    .filter((item) => item.amount > 0);
};

const safeTaxJarLines = (
  payload: Record<string, unknown>,
): Array<Record<string, unknown>> => {
  const breakdown = toRecord(payload.breakdown);
  const lines = Array.isArray(breakdown.line_items)
    ? breakdown.line_items.map(toRecord)
    : [];
  if (lines.length > 0) {
    return lines.map((line) => ({
      provider: "taxjar",
      id: textValue(line.id),
      taxableAmount: optionalNumberValue(line.taxable_amount),
      taxAmount: optionalNumberValue(line.tax_collectable ?? line.tax_amount),
      rate: optionalNumberValue(line.combined_tax_rate ?? line.rate),
    }));
  }
  return [
    {
      provider: "taxjar",
      taxableAmount: optionalNumberValue(payload.taxable_amount),
      taxAmount: optionalNumberValue(payload.amount_to_collect),
      rate: optionalNumberValue(payload.rate),
      hasNexus: payload.has_nexus,
      taxSource: textValue(payload.tax_source),
    },
  ];
};

const callTaxJarProvider = async ({
  record,
  body,
  lineItems,
  quote,
  settings,
}: {
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
  lineItems: QuoteLineItem[];
  quote: OrderQuotePayload;
  settings: Record<string, unknown>;
}): Promise<QuoteProviderAdjustment> => {
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

  const values = toRecord(record.values);
  const toAddress = taxJarAddress(
    values,
    body,
    "to",
    values.shippingaddress || values.billingaddress,
  );
  const fromAddress = taxJarAddress(
    values,
    body,
    "from",
    body.fromAddress ||
      values.shippingoriginaddress ||
      settings.shippingOriginAddress ||
      values.originaddress,
  );
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
  if (taxLines.length === 0) {
    return {
      kind: "tax",
      provider: "taxjar",
      status: "skipped",
      error: "No taxable line items were available for TaxJar.",
    };
  }

  const payload = {
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
    amount: moneyValue(
      taxLines.reduce(
        (sum, item) =>
          sum +
          numberValue(item.unit_price) * numberValue(item.quantity) -
          numberValue(item.discount),
        0,
      ),
    ),
    shipping: moneyValue(quote.shippingAmount),
    line_items: taxLines,
    ...(toAddress.customerId ? { customer_id: toAddress.customerId } : {}),
    ...(toAddress.exemptionType
      ? { exemption_type: toAddress.exemptionType }
      : {}),
  };

  try {
    const response = await fetch(`${taxJarApiBaseUrl()}/taxes`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-api-version": "2022-01-24",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const raw = await response.json().catch(() => ({}));
    const bodyRecord = toRecord(raw);
    const tax = toRecord(bodyRecord.tax || bodyRecord);
    if (!response.ok) {
      return {
        kind: "tax",
        provider: "taxjar",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(bodyRecord.error) ||
          textValue(bodyRecord.detail) ||
          textValue(bodyRecord.message) ||
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
      lines: safeTaxJarLines(tax),
      reference: textValue(
        tax.transaction_reference_id || bodyRecord.transaction_reference_id,
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

const safeAvalaraLines = (
  payload: Record<string, unknown>,
): Array<Record<string, unknown>> => {
  const lines = Array.isArray(payload.lines) ? payload.lines.map(toRecord) : [];
  if (lines.length === 0) {
    return [
      {
        provider: "avalara",
        taxAmount: optionalNumberValue(
          payload.totalTaxCalculated ?? payload.totalTax,
        ),
        taxableAmount: optionalNumberValue(payload.totalAmount),
      },
    ];
  }
  return lines.map((line) => ({
    provider: "avalara",
    id: textValue(line.lineNumber || line.number),
    itemCode: textValue(line.itemCode),
    taxCode: textValue(line.taxCode),
    taxableAmount: optionalNumberValue(line.taxableAmount ?? line.lineAmount),
    taxAmount: optionalNumberValue(line.taxCalculated ?? line.tax),
    rate: optionalNumberValue(line.rate),
  }));
};

const callAvalaraProvider = async ({
  record,
  body,
  lineItems,
  quote,
  settings,
}: {
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
  lineItems: QuoteLineItem[];
  quote: OrderQuotePayload;
  settings: Record<string, unknown>;
}): Promise<QuoteProviderAdjustment> => {
  const accountId = avalaraAccountId();
  const licenseKey = avalaraLicenseKey();
  const companyCode =
    textValue(body.avalaraCompanyCode) ||
    textValue(settings.avalaraCompanyCode) ||
    avalaraCompanyCode();
  if (!accountId || !licenseKey || !companyCode) {
    return {
      kind: "tax",
      provider: "avalara",
      status: "skipped",
      error:
        "Avalara is selected, but BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID, BACKY_AVALARA_LICENSE_KEY/AVALARA_LICENSE_KEY, or BACKY_AVALARA_COMPANY_CODE/AVALARA_COMPANY_CODE is not configured.",
    };
  }

  const values = toRecord(record.values);
  const shipTo = taxJarAddress(
    values,
    body,
    "to",
    values.shippingaddress || values.billingaddress,
  );
  const shipFrom = taxJarAddress(
    values,
    body,
    "from",
    body.fromAddress ||
      values.shippingoriginaddress ||
      settings.shippingOriginAddress ||
      values.originaddress,
  );
  if (shipTo.country === "US" && (!shipTo.state || !shipTo.zip)) {
    return {
      kind: "tax",
      provider: "avalara",
      status: "skipped",
      error:
        "Avalara requires destination region and postal code for US tax calculations.",
    };
  }

  const lines = avalaraLineItems(lineItems, quote);
  if (quote.shippingAmount > 0) {
    lines.push({
      number: "shipping",
      quantity: 1,
      amount: moneyValue(quote.shippingAmount),
      itemCode: "shipping",
      description: "Shipping",
      taxCode:
        textValue(body.shippingTaxCode) ||
        textValue(settings.shippingTaxCode) ||
        "FR",
    });
  }
  if (lines.length === 0) {
    return {
      kind: "tax",
      provider: "avalara",
      status: "skipped",
      error:
        "No taxable line items or shipping amount were available for Avalara.",
    };
  }

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
            textValue(body.customerCode) ||
            textValue(values.customerid) ||
            textValue(values.customeremail) ||
            "backy-customer",
          code: textValue(body.transactionCode) || `backy-${record.id}`,
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
    const payload = await response.json().catch(() => ({}));
    const payloadRecord = toRecord(payload);
    if (!response.ok) {
      const error = Array.isArray(payloadRecord.error)
        ? toRecord(payloadRecord.error[0])
        : toRecord(payloadRecord.error);
      return {
        kind: "tax",
        provider: "avalara",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(error.message) ||
          textValue(payloadRecord.message) ||
          `Avalara returned HTTP ${response.status}.`,
        reference: textValue(payloadRecord.code),
      };
    }

    const amount = optionalNumberValue(
      payloadRecord.totalTaxCalculated ?? payloadRecord.totalTax,
    );
    if (amount === null || amount < 0) {
      return {
        kind: "tax",
        provider: "avalara",
        status: "failed",
        statusCode: response.status,
        error: "Avalara response did not include totalTaxCalculated.",
        reference: textValue(payloadRecord.code),
      };
    }

    return {
      kind: "tax",
      provider: "avalara",
      status: "succeeded",
      statusCode: response.status,
      amount: moneyValue(amount),
      lines: safeAvalaraLines(payloadRecord),
      reference: textValue(payloadRecord.code) || textValue(payloadRecord.id),
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
  input: ReturnType<typeof resolveShippingRateInput>,
): boolean => {
  const rateId = input.rateId.toLowerCase();
  const carrier = input.carrier.toLowerCase();
  const serviceLevel = input.serviceLevel.toLowerCase();
  return (
    Boolean(rateId && rate.id.toLowerCase() === rateId) ||
    ((!carrier || rate.carrier.toLowerCase() === carrier) &&
      (!serviceLevel || rate.serviceLevel.toLowerCase() === serviceLevel))
  );
};

const callEasyPostShippingProvider = async ({
  record,
  body,
  settings,
}: {
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
  settings: Record<string, unknown>;
}): Promise<QuoteProviderAdjustment> => {
  if (!easyPostApiKey()) {
    return {
      kind: "shipping",
      provider: "easypost",
      status: "skipped",
      error:
        "EasyPost shipping quotes are selected, but BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY is not configured.",
    };
  }
  const input = resolveShippingRateInput(record, body, settings, "easypost");
  if (
    normalizeProviderKey(input.provider) !== "easypost" ||
    !hasProviderRecordFields(input.fromAddress) ||
    !hasProviderRecordFields(input.toAddress) ||
    !hasProviderRecordFields(input.parcel)
  ) {
    return {
      kind: "shipping",
      provider: "easypost",
      status: "skipped",
      error:
        "EasyPost shipping quotes require fromAddress, toAddress, and parcel payloads from the request, order shipping address, or Settings commerce defaults.",
    };
  }

  try {
    const response = await fetch(`${easyPostApiBaseUrl()}/shipments`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${easyPostApiKey()}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        shipment: {
          from_address: safeProviderRecord(input.fromAddress),
          to_address: safeProviderRecord(input.toAddress),
          parcel: safeProviderRecord(input.parcel),
          reference: record.slug || record.id,
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      const error = toRecord(payload.error);
      return {
        kind: "shipping",
        provider: "easypost",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(error.message) ||
          textValue(payload.message) ||
          `EasyPost returned HTTP ${response.status}.`,
        reference: textValue(payload.id),
      };
    }

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
      rates.find((rate) => rateSelectionMatches(rate, input)) ||
      [...rates].sort((a, b) => a.amount - b.amount)[0];
    if (!selected) {
      return {
        kind: "shipping",
        provider: "easypost",
        status: "failed",
        statusCode: response.status,
        error: "EasyPost did not return a selectable shipping rate.",
        reference: textValue(payload.id),
      };
    }

    return {
      kind: "shipping",
      provider: "easypost",
      status: "succeeded",
      statusCode: response.status,
      amount: selected.amount,
      lines: rates.map((rate) => ({
        provider: "easypost",
        id: rate.id,
        carrier: rate.carrier,
        serviceLevel: rate.serviceLevel,
        amount: rate.amount,
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

const callShippoShippingProvider = async ({
  record,
  body,
  settings,
}: {
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
  settings: Record<string, unknown>;
}): Promise<QuoteProviderAdjustment> => {
  if (!shippoApiKey()) {
    return {
      kind: "shipping",
      provider: "shippo",
      status: "skipped",
      error:
        "Shippo shipping quotes are selected, but BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY is not configured.",
    };
  }
  const input = resolveShippingRateInput(record, body, settings, "shippo");
  if (
    normalizeProviderKey(input.provider) !== "shippo" ||
    !hasProviderRecordFields(input.fromAddress) ||
    !hasProviderRecordFields(input.toAddress) ||
    !hasProviderRecordFields(input.parcel)
  ) {
    return {
      kind: "shipping",
      provider: "shippo",
      status: "skipped",
      error:
        "Shippo shipping quotes require fromAddress, toAddress, and parcel payloads from the request, order shipping address, or Settings commerce defaults.",
    };
  }

  try {
    const response = await fetch(`${shippoApiBaseUrl()}/shipments/`, {
      method: "POST",
      headers: {
        authorization: `ShippoToken ${shippoApiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        address_from: safeProviderRecord(input.fromAddress),
        address_to: safeProviderRecord(input.toAddress),
        parcels: [safeProviderRecord(input.parcel)],
        async: false,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
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
    }

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
                  rate.service ||
                  rate.serviceLevel,
              ),
              amount: moneyValue(
                numberValue(rate.amount || rate.amount_local, Number.NaN),
              ),
            };
          })
          .filter((rate) => rate.id && Number.isFinite(rate.amount))
      : [];
    const selected =
      rates.find((rate) => rateSelectionMatches(rate, input)) ||
      [...rates].sort((a, b) => a.amount - b.amount)[0];
    if (!selected) {
      return {
        kind: "shipping",
        provider: "shippo",
        status: "failed",
        statusCode: response.status,
        error: "Shippo did not return a selectable shipping rate.",
        reference: textValue(payload.object_id || payload.id),
      };
    }

    return {
      kind: "shipping",
      provider: "shippo",
      status: "succeeded",
      statusCode: response.status,
      amount: selected.amount,
      lines: rates.map((rate) => ({
        provider: "shippo",
        id: rate.id,
        carrier: rate.carrier,
        serviceLevel: rate.serviceLevel,
        amount: rate.amount,
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

const callStripeDiscountProvider = async ({
  quote,
  requestId,
}: {
  quote: OrderQuotePayload;
  requestId: string;
}): Promise<QuoteProviderAdjustment> => {
  const code = quote.discountCode.trim();
  if (!code) {
    return {
      kind: "discount",
      provider: "stripe",
      status: "skipped",
      error: "Stripe promotion-code discounts require an order discount code.",
    };
  }
  const secretKey = stripeSecretKey();
  if (!secretKey) {
    return {
      kind: "discount",
      provider: "stripe",
      status: "skipped",
      error:
        "Stripe promotion-code discounts are selected, but BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY is not configured.",
    };
  }

  const params = new URLSearchParams();
  params.set("code", code);
  params.set("active", "true");
  params.set("limit", "1");

  try {
    const response = await fetch(
      `${stripeDiscountApiBaseUrl()}/v1/promotion_codes?${params.toString()}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${secretKey}`,
          "x-backy-request-id": requestId,
          ...(process.env.BACKY_STRIPE_API_VERSION?.trim() ||
          process.env.STRIPE_API_VERSION?.trim()
            ? {
                "stripe-version":
                  process.env.BACKY_STRIPE_API_VERSION?.trim() ||
                  process.env.STRIPE_API_VERSION?.trim() ||
                  "",
              }
            : {}),
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    const payload = toRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      const error = toRecord(payload.error);
      return {
        kind: "discount",
        provider: "stripe",
        status: "failed",
        statusCode: response.status,
        error:
          textValue(error.message) ||
          textValue(payload.message) ||
          `Stripe promotion codes returned HTTP ${response.status}.`,
      };
    }

    const promotionCodes = Array.isArray(payload.data)
      ? payload.data.map(toRecord)
      : [];
    const promotionCode = promotionCodes[0];
    if (!promotionCode) {
      return {
        kind: "discount",
        provider: "stripe",
        status: "skipped",
        statusCode: response.status,
        error: `Stripe promotion code ${code} was not found or is inactive.`,
      };
    }

    const coupon = toRecord(promotionCode.coupon);
    if (coupon.valid === false) {
      return {
        kind: "discount",
        provider: "stripe",
        status: "skipped",
        statusCode: response.status,
        error: `Stripe coupon for promotion code ${code} is not valid.`,
        reference: textValue(promotionCode.id),
      };
    }

    const currency = quote.currency.toUpperCase();
    const restrictions = toRecord(promotionCode.restrictions);
    const minimumAmount = fromProviderAmount(
      restrictions.minimum_amount,
      currency,
    );
    const minimumCurrency = textValue(
      restrictions.minimum_amount_currency,
    ).toUpperCase();
    if (
      minimumAmount !== null &&
      (!minimumCurrency || minimumCurrency === currency) &&
      quote.subtotal < minimumAmount
    ) {
      return {
        kind: "discount",
        provider: "stripe",
        status: "skipped",
        statusCode: response.status,
        error: `Stripe promotion code ${code} requires a minimum subtotal of ${minimumAmount.toFixed(2)} ${currency}.`,
        reference: textValue(promotionCode.id),
      };
    }

    const percentOff = optionalNumberValue(coupon.percent_off);
    const amountOff = fromProviderAmount(coupon.amount_off, currency);
    const amountCurrency = textValue(coupon.currency).toUpperCase();
    const amount =
      percentOff !== null && percentOff > 0
        ? moneyValue((quote.subtotal * Math.min(100, percentOff)) / 100)
        : amountOff !== null && (!amountCurrency || amountCurrency === currency)
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
          currency: amountCurrency || currency,
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

const quoteProviderAmount = (
  payload: Record<string, unknown>,
  kind: QuoteProviderAdjustment["kind"],
): number | null => {
  const keyed = payload[`${kind}Amount`];
  const generic = payload.amount;
  const parsed = numberValue(keyed ?? generic, Number.NaN);
  return Number.isFinite(parsed) && parsed >= 0 ? moneyValue(parsed) : null;
};

const quoteProviderLines = (
  payload: Record<string, unknown>,
): Array<Record<string, unknown>> =>
  Array.isArray(payload.lines) ? payload.lines.map(toRecord) : [];

const callQuoteProvider = async ({
  kind,
  url,
  record,
  lineItems,
  quote,
  requestId,
}: {
  kind: QuoteProviderAdjustment["kind"];
  url: string;
  record: CollectionRecordAuditSource;
  lineItems: QuoteLineItem[];
  quote: OrderQuotePayload;
  requestId: string;
}): Promise<QuoteProviderAdjustment> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-backy-request-id": requestId,
        "x-backy-provider-kind": kind,
      },
      body: JSON.stringify({
        schemaVersion: "backy.quote-provider-request.v1",
        kind,
        order: {
          id: record.id,
          slug: record.slug,
          values: record.values || {},
        },
        lineItems,
        quote,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => ({}));
    const body = toRecord(payload);
    if (!response.ok) {
      return {
        kind,
        provider: "http",
        status: "failed",
        url,
        statusCode: response.status,
        error:
          textValue(body.error) ||
          textValue(toRecord(body.error).message) ||
          `Provider returned HTTP ${response.status}.`,
      };
    }
    const amount = quoteProviderAmount(body, kind);
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
      lines: quoteProviderLines(body),
      reference: textValue(body.reference || body.providerReference),
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

const quoteAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  quote: OrderQuotePayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  subtotal: quote.subtotal,
  discountAmount: quote.discountAmount,
  taxAmount: quote.taxAmount,
  shippingAmount: quote.shippingAmount,
  total: quote.total,
  currency: quote.currency,
  providerAdjustments: quote.providerAdjustments.map((item) => ({
    kind: item.kind,
    provider: item.provider,
    status: item.status,
    amount: item.amount ?? null,
    statusCode: item.statusCode ?? null,
    reference: item.reference || null,
    error: item.error || null,
  })),
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
    subtotal: numberValue(values.subtotal),
    discountAmount: numberValue(values.discountamount),
    taxAmount: numberValue(values.taxamount),
    shippingAmount: numberValue(values.shippingamount),
    total: numberValue(values.total),
    currency: textValue(values.currency),
  };
};

const quoteWebhookSnapshot = (quote: OrderQuotePayload): BackyJsonObject => ({
  subtotal: quote.subtotal,
  discountAmount: quote.discountAmount,
  taxAmount: quote.taxAmount,
  shippingAmount: quote.shippingAmount,
  total: quote.total,
  currency: quote.currency,
  discountCode: quote.discountCode,
  calculatedAt: quote.calculatedAt,
  providerAdjustments: quote.providerAdjustments.map((item) => ({
    kind: item.kind,
    provider: item.provider,
    status: item.status,
    amount: item.amount ?? null,
    statusCode: item.statusCode ?? null,
    reference: item.reference || null,
    error: item.error || null,
  })),
});

const deliverOrderQuoteWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  collection: CollectionAuditSource;
  before: CollectionRecordAuditSource;
  after: CollectionRecordAuditSource;
  quote: OrderQuotePayload;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "commerce.order.quote_refreshed",
    data: {
      resourceType: "collectionRecord",
      before: orderRecordWebhookSnapshot(params.collection, params.before),
      after: orderRecordWebhookSnapshot(params.collection, params.after),
      quote: quoteWebhookSnapshot(params.quote),
    },
    metadata: {
      action: "commerce.order.quote_refreshed",
      changedKeys: ["content", "collections", "commerce"],
      source: "admin-commerce-order-quote-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      orderId: params.after.id,
      orderSlug: params.after.slug,
      total: params.quote.total,
      currency: params.quote.currency,
      providerStatuses: params.quote.providerAdjustments.map(
        (item) => `${item.kind}:${item.provider}:${item.status}`,
      ),
    },
  });

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const commerceSettingsFromSettings = (
  settings: unknown,
): Record<string, unknown> =>
  toRecord(toRecord(toRecord(settings).integrations).commerce);

const commerceContractForSite = (siteId: string, settings: unknown) => {
  const commerce = commerceSettingsFromSettings(settings);
  return buildCommerceStorefrontContract({
    siteId,
    settings: commerce,
    hasCatalog: true,
    hasOrderIntake: true,
  });
};

const calculateQuote = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  commerce: CommerceStorefrontContract,
  commerceSettings: Record<string, unknown>,
  requestId: string,
): Promise<OrderQuotePayload> => {
  const calculatedAt = new Date().toISOString();
  const values = toRecord(record.values);
  const lineItems = normalizeLineItems(record);
  const fallbackCurrency =
    textValue(values.currency) || commerce.currency || "USD";
  const subtotal = moneyValue(
    lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
  );
  const discountCode = (
    textValue(body.discountCode) ||
    lineItems.find((item) => item.discountCode)?.discountCode ||
    ""
  ).toUpperCase();
  const discountRate =
    commerce.pricing.discounts && discountCode
      ? discountPercentFromCode(discountCode, commerce.pricing.rules)
      : 0;
  const discountLines = lineItems
    .map((item) => {
      const eligible = Boolean(
        discountRate &&
        discountCode &&
        (!item.discountCode || item.discountCode === discountCode),
      );
      const amount = eligible ? moneyValue(item.lineTotal * discountRate) : 0;
      return {
        productId: item.productId,
        slug: item.slug,
        code: eligible ? discountCode : "",
        rate: eligible ? discountRate : 0,
        amount,
      };
    })
    .filter((line) => numberValue(line.amount) > 0);
  const discountAmount = moneyValue(
    discountLines.reduce((sum, line) => sum + numberValue(line.amount), 0),
  );
  const lineDiscountByProduct = new Map(
    discountLines.map((line) => [
      String(line.productId),
      numberValue(line.amount),
    ]),
  );

  const taxLines = lineItems
    .map((item) => {
      if (!commerce.pricing.taxes || !item.taxable) {
        return {
          productId: item.productId,
          slug: item.slug,
          taxClass: item.taxClass,
          rate: 0,
          amount: 0,
        };
      }
      const taxableAmount = Math.max(
        0,
        item.lineTotal - (lineDiscountByProduct.get(item.productId) || 0),
      );
      const rate = taxRateForClass(item.taxClass, commerce.pricing.rules);
      return {
        productId: item.productId,
        slug: item.slug,
        taxClass: item.taxClass,
        rate,
        amount: moneyValue(taxableAmount * rate),
      };
    })
    .filter((line) => numberValue(line.amount) > 0 || commerce.pricing.taxes);
  const taxAmount = moneyValue(
    taxLines.reduce((sum, line) => sum + numberValue(line.amount), 0),
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
        base: shippingBaseForProfile(profile, commerce.pricing.rules),
        weightTotal: 0,
        slugs: [],
      };
      group.weightTotal += Math.max(0, item.weight) * item.quantity;
      group.slugs.push(item.slug);
      shippingGroups.set(profile, group);
    }
  }
  const shippingLines = Array.from(shippingGroups.values()).map((group) => ({
    profile: group.profile,
    slugs: group.slugs,
    base: moneyValue(group.base),
    weightAmount: moneyValue(
      group.weightTotal * commerce.pricing.rules.shippingWeightRate,
    ),
    amount: moneyValue(
      group.base +
        group.weightTotal * commerce.pricing.rules.shippingWeightRate,
    ),
  }));
  const shippingAmount = moneyValue(
    shippingLines.reduce((sum, line) => sum + numberValue(line.amount), 0),
  );

  const localQuote: OrderQuotePayload = {
    schemaVersion: "backy.order-quote.v1",
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    total: moneyValue(
      Math.max(0, subtotal - discountAmount + taxAmount + shippingAmount),
    ),
    currency: lineItems[0]?.currency || fallbackCurrency,
    discountCode,
    discountRate,
    taxLines,
    shippingLines,
    discountLines,
    providerAdjustments: [],
    pricing: commerce.pricing,
    calculatedAt,
  };

  const providerAdjustments = (
    await Promise.all(
      (
        [
          ["tax", commerce.pricing.taxes],
          ["shipping", commerce.pricing.shipping],
          ["discount", commerce.pricing.discounts],
        ] as Array<[QuoteProviderAdjustment["kind"], boolean]>
      ).map(async ([kind, enabled]) => {
        const mode = providerModeForKind(commerceSettings, kind);
        if (!enabled || mode === "manual") return null;
        if (kind === "tax" && mode === "stripe") {
          return callStripeTaxProvider({
            record,
            body,
            lineItems,
            quote: localQuote,
            requestId,
          });
        }
        if (kind === "tax" && mode === "taxjar") {
          return callTaxJarProvider({
            record,
            body,
            lineItems,
            quote: localQuote,
            settings: commerceSettings,
          });
        }
        if (kind === "tax" && mode === "avalara") {
          return callAvalaraProvider({
            record,
            body,
            lineItems,
            quote: localQuote,
            settings: commerceSettings,
          });
        }
        if (kind === "shipping" && mode === "easypost") {
          return callEasyPostShippingProvider({
            record,
            body,
            settings: commerceSettings,
          });
        }
        if (kind === "shipping" && mode === "shippo") {
          return callShippoShippingProvider({
            record,
            body,
            settings: commerceSettings,
          });
        }
        if (kind === "discount" && mode === "stripe") {
          return callStripeDiscountProvider({
            quote: localQuote,
            requestId,
          });
        }
        const url = providerUrlForKind(commerceSettings, kind);
        if (!url) {
          return null;
        }
        return callQuoteProvider({
          kind,
          url,
          record,
          lineItems,
          quote: localQuote,
          requestId,
        });
      }),
    )
  ).filter(Boolean) as QuoteProviderAdjustment[];

  const providerAmount = (
    kind: QuoteProviderAdjustment["kind"],
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
        Math.min(subtotal, Math.max(0, adjustment.amount || 0)),
      );
    return moneyValue(Math.max(0, adjustment.amount || 0));
  };

  const providerLines = (
    kind: QuoteProviderAdjustment["kind"],
    fallback: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> => {
    const adjustment = providerAdjustments.find(
      (item) =>
        item.kind === kind &&
        item.status === "succeeded" &&
        item.lines &&
        item.lines.length > 0,
    );
    return adjustment?.lines || fallback;
  };

  const finalTaxAmount = providerAmount("tax", taxAmount);
  const finalShippingAmount = providerAmount("shipping", shippingAmount);
  const finalDiscountAmount = providerAmount("discount", discountAmount);

  return {
    ...localQuote,
    discountAmount: finalDiscountAmount,
    taxAmount: finalTaxAmount,
    shippingAmount: finalShippingAmount,
    total: moneyValue(
      Math.max(
        0,
        subtotal - finalDiscountAmount + finalTaxAmount + finalShippingAmount,
      ),
    ),
    discountLines: providerLines("discount", discountLines),
    taxLines: providerLines("tax", taxLines),
    shippingLines: providerLines("shipping", shippingLines),
    providerAdjustments,
  };
};

const buildQuoteUpdate = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  commerce: CommerceStorefrontContract,
  commerceSettings: Record<string, unknown>,
  requestId: string,
) => {
  const values = toRecord(record.values);
  const quote = await calculateQuote(
    record,
    body,
    commerce,
    commerceSettings,
    requestId,
  );
  return {
    quote,
    values: {
      ...values,
      subtotal: quote.subtotal,
      discountamount: quote.discountAmount,
      taxamount: quote.taxAmount,
      shippingamount: quote.shippingAmount,
      total: quote.total,
      currency: quote.currency,
      notes: appendNote(
        values.notes,
        `Order quote refreshed ${quote.calculatedAt}: subtotal ${quote.subtotal.toFixed(2)}, tax ${quote.taxAmount.toFixed(2)}, shipping ${quote.shippingAmount.toFixed(2)}, discount ${quote.discountAmount.toFixed(2)}, total ${quote.total.toFixed(2)}.${quote.providerAdjustments.length > 0 ? ` Provider adjustments: ${quote.providerAdjustments.map((item) => `${item.kind}:${item.status}`).join(", ")}.` : ""}`,
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

      const settings = await repositories.settings.get();
      const commerce = commerceContractForSite(site.id, settings);
      const commerceSettings = commerceSettingsFromSettings(settings);
      return privateQuoteResponse(
        {
          success: true,
          requestId,
          data: {
            record,
            quote: await calculateQuote(
              record,
              {},
              commerce,
              commerceSettings,
              requestId,
            ),
          },
        },
        requestId,
        site.id,
      );
    }

    const settings = getAdminSettings();
    const commerce = commerceContractForSite(siteId, settings);
    const commerceSettings = commerceSettingsFromSettings(settings);

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

    return privateQuoteResponse(
      {
        success: true,
        requestId,
        data: {
          record,
          quote: await calculateQuote(
            record,
            {},
            commerce,
            commerceSettings,
            requestId,
          ),
        },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order quote read API error:", error);
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
      const commerce = commerceContractForSite(site.id, settings);
      const commerceSettings = commerceSettingsFromSettings(settings);
      const { quote, values: rawValues } = await buildQuoteUpdate(
        record,
        body,
        commerce,
        commerceSettings,
        requestId,
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
          "Quote values are invalid",
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
          reason: "order-quote-refreshed",
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
        metadata: quoteAuditMetadata(collection, updated, quote),
        requestId,
      });
      await deliverOrderQuoteWebhook({
        repositories,
        site,
        collection,
        before: record,
        after: updated,
        quote,
        requestId,
        actor: access.session?.user.id,
      });

      return privateQuoteResponse(
        {
          success: true,
          requestId,
          data: { record: updated, order: updated, quote, cacheInvalidation },
        },
        requestId,
        site.id,
      );
    }

    const settings = getAdminSettings();
    const commerce = commerceContractForSite(siteId, settings);
    const commerceSettings = commerceSettingsFromSettings(settings);

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

    const { quote, values: rawValues } = await buildQuoteUpdate(
      record,
      body,
      commerce,
      commerceSettings,
      requestId,
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
        "Quote values are invalid",
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
      metadata: quoteAuditMetadata(collection, updated, quote),
      requestId,
    });
    await deliverOrderQuoteWebhook({
      site: site as unknown as Site,
      collection,
      before: record,
      after: updated,
      quote,
      requestId,
      actor: access.session?.user.id,
    });

    return privateQuoteResponse(
      {
        success: true,
        requestId,
        data: { record: updated, order: updated, quote },
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin order quote refresh API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
