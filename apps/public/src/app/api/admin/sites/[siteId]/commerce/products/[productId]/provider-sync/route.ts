import { NextRequest, NextResponse } from "next/server";
import type { BackyJsonObject, BackyJsonValue, Site } from "@backy-cms/core";
import {
  PRODUCT_COLLECTION_SLUG,
  productRecordToCommerceProduct,
  type CommerceProduct,
  type CommerceSourceRecord,
} from "@/lib/commerceCatalog";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
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
  }>;
}

type ProviderSyncStatus = "handoff" | "synced" | "failed";
type ProductSyncProvider =
  | "stripe"
  | "http"
  | "paddle"
  | "square"
  | "paypal"
  | "shopify"
  | "bigcommerce"
  | "woocommerce"
  | "etsy"
  | "magento";

const PROVIDER_SYNC_FIELD = "providersync";
const PROVIDER_SYNC_SCHEMA_VERSION = "backy.commerce-product-sync.v1";

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
      schemaVersion: PROVIDER_SYNC_SCHEMA_VERSION,
    },
  );

const productSyncResponse = (
  body: Record<string, unknown>,
  requestId: string,
  siteId: string,
) =>
  publicContractJson(body, {
    requestId,
    cache: "private",
    schemaVersion: PROVIDER_SYNC_SCHEMA_VERSION,
    siteId,
  });

const envValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toJsonRecord = (
  value: Record<string, unknown>,
): Record<string, BackyJsonValue> => value as Record<string, BackyJsonValue>;

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

const stripeSecretKey = () =>
  envValue(["BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"]);

const paddleApiKey = () => envValue(["BACKY_PADDLE_API_KEY", "PADDLE_API_KEY"]);

const squareAccessToken = () =>
  envValue(["BACKY_SQUARE_ACCESS_TOKEN", "SQUARE_ACCESS_TOKEN"]);

const paypalAccessToken = () =>
  envValue(["BACKY_PAYPAL_ACCESS_TOKEN", "PAYPAL_ACCESS_TOKEN"]);

const paypalClientId = () =>
  envValue(["BACKY_PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_ID"]);

const paypalClientSecret = () =>
  envValue(["BACKY_PAYPAL_CLIENT_SECRET", "PAYPAL_CLIENT_SECRET"]);

const shopifyAccessToken = () =>
  envValue(["BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN", "SHOPIFY_ADMIN_ACCESS_TOKEN"]);

const shopifyStoreDomain = () =>
  envValue(["BACKY_SHOPIFY_STORE_DOMAIN", "SHOPIFY_STORE_DOMAIN"]);

const bigCommerceAccessToken = () =>
  envValue(["BACKY_BIGCOMMERCE_ACCESS_TOKEN", "BIGCOMMERCE_ACCESS_TOKEN"]);

const bigCommerceStoreHash = () =>
  envValue(["BACKY_BIGCOMMERCE_STORE_HASH", "BIGCOMMERCE_STORE_HASH"]);

const wooCommerceConsumerKey = () =>
  envValue(["BACKY_WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_KEY"]);

const wooCommerceConsumerSecret = () =>
  envValue([
    "BACKY_WOOCOMMERCE_CONSUMER_SECRET",
    "WOOCOMMERCE_CONSUMER_SECRET",
  ]);

const wooCommerceStoreUrl = () =>
  envValue(["BACKY_WOOCOMMERCE_STORE_URL", "WOOCOMMERCE_STORE_URL"]);

const etsyAccessToken = () =>
  envValue(["BACKY_ETSY_ACCESS_TOKEN", "ETSY_ACCESS_TOKEN"]);

const etsyApiKey = () => envValue(["BACKY_ETSY_API_KEY", "ETSY_API_KEY"]);

const etsyShopId = () => envValue(["BACKY_ETSY_SHOP_ID", "ETSY_SHOP_ID"]);

const productSyncToken = () =>
  envValue([
    "BACKY_COMMERCE_PRODUCT_SYNC_TOKEN",
    "COMMERCE_PRODUCT_SYNC_TOKEN",
  ]);

const magentoAccessToken = () =>
  envValue(["BACKY_MAGENTO_ACCESS_TOKEN", "MAGENTO_ACCESS_TOKEN"]);

const magentoStoreUrl = () =>
  envValue(["BACKY_MAGENTO_STORE_URL", "MAGENTO_STORE_URL"]);

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const settingsCommerce = (settings: unknown): Record<string, unknown> => {
  const root = jsonRecord(settings);
  const integrations = jsonRecord(root.integrations);
  return jsonRecord(integrations.commerce);
};

const configuredHttpCatalogSyncUrl = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return (
    envValue([
      "BACKY_COMMERCE_PRODUCT_SYNC_URL",
      "COMMERCE_PRODUCT_SYNC_URL",
    ]) ||
    textValue(commerce.catalogSyncProviderUrl) ||
    textValue(commerce.productSyncProviderUrl) ||
    textValue(commerce.providerCatalogSyncUrl)
  );
};

const configuredProductSyncProvider = (
  settings: unknown,
): ProductSyncProvider | null => {
  const commerce = settingsCommerce(settings);
  const configured = (
    envValue([
      "BACKY_COMMERCE_PRODUCT_SYNC_PROVIDER",
      "COMMERCE_PRODUCT_SYNC_PROVIDER",
    ]) ||
    textValue(commerce.catalogSyncProvider) ||
    textValue(commerce.productSyncProvider) ||
    textValue(commerce.providerCatalogSyncProvider)
  ).toLowerCase();

  if (configured === "stripe") return "stripe";
  if (configured === "paddle") return "paddle";
  if (configured === "square") return "square";
  if (configured === "paypal") return "paypal";
  if (configured === "shopify") return "shopify";
  if (configured === "bigcommerce") return "bigcommerce";
  if (["woocommerce", "woo-commerce", "woo"].includes(configured))
    return "woocommerce";
  if (configured === "etsy") return "etsy";
  if (["magento", "adobe-commerce", "adobecommerce"].includes(configured))
    return "magento";
  if (["http", "generic-http", "custom-http"].includes(configured))
    return "http";
  if (configuredHttpCatalogSyncUrl(settings)) return "http";
  return null;
};

const resolveProductSyncProvider = (
  provider: string,
  settings: unknown,
): ProductSyncProvider | null => {
  if (!provider || provider === "auto") {
    return configuredProductSyncProvider(settings) || "stripe";
  }
  if (provider === "stripe") return "stripe";
  if (provider === "paddle") return "paddle";
  if (provider === "square") return "square";
  if (provider === "paypal") return "paypal";
  if (provider === "shopify") return "shopify";
  if (provider === "bigcommerce") return "bigcommerce";
  if (["woocommerce", "woo-commerce", "woo"].includes(provider))
    return "woocommerce";
  if (provider === "etsy") return "etsy";
  if (["magento", "adobe-commerce", "adobecommerce"].includes(provider))
    return "magento";
  if (["http", "generic-http", "custom-http"].includes(provider)) return "http";
  return null;
};

const stripeApiUrl = (path: string) => {
  const baseUrl =
    envValue(["BACKY_STRIPE_API_BASE_URL", "STRIPE_API_BASE_URL"]) ||
    "https://api.stripe.com";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const stripeHeaders = (accountId?: string | null) => ({
  authorization: `Bearer ${stripeSecretKey()}`,
  "content-type": "application/x-www-form-urlencoded",
  ...(accountId ? { "stripe-account": accountId } : {}),
  ...(envValue(["BACKY_STRIPE_API_VERSION", "STRIPE_API_VERSION"])
    ? {
        "stripe-version": envValue([
          "BACKY_STRIPE_API_VERSION",
          "STRIPE_API_VERSION",
        ]),
      }
    : {}),
});

const paddleApiUrl = (path: string) => {
  const baseUrl =
    envValue(["BACKY_PADDLE_API_BASE_URL", "PADDLE_API_BASE_URL"]) ||
    "https://api.paddle.com";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const paddleHeaders = () => ({
  authorization: `Bearer ${paddleApiKey()}`,
  "content-type": "application/json",
});

const squareApiUrl = (path: string) => {
  const baseUrl =
    envValue(["BACKY_SQUARE_API_BASE_URL", "SQUARE_API_BASE_URL"]) ||
    "https://connect.squareup.com";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const squareVersion = () =>
  envValue(["BACKY_SQUARE_VERSION", "SQUARE_VERSION"]) || "2026-01-22";

const squareHeaders = () => ({
  authorization: `Bearer ${squareAccessToken()}`,
  "content-type": "application/json",
  "square-version": squareVersion(),
});

const paypalApiUrl = (path: string) => {
  const baseUrl =
    envValue(["BACKY_PAYPAL_API_BASE_URL", "PAYPAL_API_BASE_URL"]) ||
    "https://api-m.paypal.com";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const shopifyApiUrl = (path: string) => {
  const explicitBase = envValue([
    "BACKY_SHOPIFY_ADMIN_API_BASE_URL",
    "SHOPIFY_ADMIN_API_BASE_URL",
  ]);
  const storeDomain = shopifyStoreDomain()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const apiVersion =
    envValue(["BACKY_SHOPIFY_API_VERSION", "SHOPIFY_API_VERSION"]) || "2026-01";
  const baseUrl =
    explicitBase ||
    (storeDomain ? `https://${storeDomain}/admin/api/${apiVersion}` : "");
  if (!baseUrl) return "";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const bigCommerceApiUrl = (path: string) => {
  const explicitBase = envValue([
    "BACKY_BIGCOMMERCE_API_BASE_URL",
    "BIGCOMMERCE_API_BASE_URL",
  ]);
  const storeHash = bigCommerceStoreHash();
  const baseUrl =
    explicitBase ||
    (storeHash ? `https://api.bigcommerce.com/stores/${storeHash}/v3` : "");
  if (!baseUrl) return "";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const wooCommerceApiUrl = (path: string) => {
  const explicitBase = envValue([
    "BACKY_WOOCOMMERCE_API_BASE_URL",
    "WOOCOMMERCE_API_BASE_URL",
  ]);
  const storeUrl = wooCommerceStoreUrl().replace(/\/+$/, "");
  const baseUrl = explicitBase || (storeUrl ? `${storeUrl}/wp-json/wc/v3` : "");
  if (!baseUrl) return "";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const etsyApiUrl = (path: string) => {
  const baseUrl =
    envValue(["BACKY_ETSY_API_BASE_URL", "ETSY_API_BASE_URL"]) ||
    "https://api.etsy.com/v3/application";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const magentoApiUrl = (path: string) => {
  const explicitBase = envValue([
    "BACKY_MAGENTO_API_BASE_URL",
    "MAGENTO_API_BASE_URL",
  ]);
  const storeUrl = magentoStoreUrl().replace(/\/+$/, "");
  const baseUrl = explicitBase || (storeUrl ? `${storeUrl}/rest/default/V1` : "");
  if (!baseUrl) return "";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
};

const centsValue = (value: number) =>
  Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100));

const providerAccountId = (settings: unknown): string | null => {
  const root =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const integrations =
    root.integrations &&
    typeof root.integrations === "object" &&
    !Array.isArray(root.integrations)
      ? (root.integrations as Record<string, unknown>)
      : {};
  const commerce =
    integrations.commerce &&
    typeof integrations.commerce === "object" &&
    !Array.isArray(integrations.commerce)
      ? (integrations.commerce as Record<string, unknown>)
      : {};
  return textValue(commerce.providerAccountId) || null;
};

const buildHandoffSync = ({
  product,
  requestId,
  reason,
  provider = "stripe",
}: {
  product: CommerceProduct;
  requestId: string;
  reason: string;
  provider?: ProductSyncProvider;
}) => ({
  provider,
  status: "handoff" as ProviderSyncStatus,
  executionMode: "handoff",
  syncedAt: new Date().toISOString(),
  requestId,
  reason,
  product: {
    id: null,
    name: product.title,
    active: product.status === "published",
  },
  price: {
    id: null,
    currency: product.currency.toLowerCase(),
    unitAmount: centsValue(product.price),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  },
});

const safeHttpPayload = (value: Record<string, unknown>) => ({
  id:
    textValue(value.id) ||
    textValue(value.productId) ||
    textValue(value.externalId) ||
    textValue(value.reference),
  object: textValue(value.object) || textValue(value.type),
  active: typeof value.active === "boolean" ? value.active : null,
  url: textValue(value.url) || textValue(value.productUrl),
});

const safeHttpErrorPayload = (value: Record<string, unknown>) => {
  const error = jsonRecord(value.error);
  const source = Object.keys(error).length ? error : value;
  return {
    type: textValue(source.type) || "http-provider",
    code: textValue(source.code) || textValue(source.status),
    message:
      textValue(source.message) ||
      textValue(source.error) ||
      "HTTP product catalog sync failed.",
  };
};

const safeHttpProviderResponse = (value: Record<string, unknown>) => ({
  id:
    textValue(value.id) ||
    textValue(value.productId) ||
    textValue(value.externalId) ||
    textValue(value.reference),
  reference: textValue(value.reference),
  status: textValue(value.status),
  url: textValue(value.url) || textValue(value.productUrl),
  requestId: textValue(value.requestId),
});

const buildHttpCatalogPayload = ({
  siteId,
  product,
  requestId,
}: {
  siteId: string;
  product: CommerceProduct;
  requestId: string;
}) => ({
  schemaVersion: PROVIDER_SYNC_SCHEMA_VERSION,
  requestId,
  siteId,
  product: {
    id: product.id,
    slug: product.slug,
    status: product.status,
    title: product.title,
    sku: product.sku,
    description: product.description,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    currency: product.currency,
    imageUrl: product.imageUrl,
    galleryImages: product.galleryImages,
    variants: product.variants,
    category: product.category,
    tags: product.tags,
    vendor: product.vendor,
    featured: product.featured,
    productType: product.productType,
    inventory: product.inventory,
    delivery: product.delivery,
    checkout: product.checkout,
    subscription: product.subscription,
    links: product.links,
    updatedAt: product.updatedAt,
    publishedAt: product.publishedAt,
  },
});

const executeHttpProductSync = async ({
  siteId,
  product,
  requestId,
  settings,
}: {
  siteId: string;
  product: CommerceProduct;
  requestId: string;
  settings: unknown;
}) => {
  const endpointUrl = configuredHttpCatalogSyncUrl(settings);
  if (!endpointUrl) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "http",
      reason:
        "BACKY_COMMERCE_PRODUCT_SYNC_URL or Settings commerce catalog sync provider URL is not configured.",
    });
  }

  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "http",
        reason: "Configured HTTP product sync URL is invalid.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "http-api",
      error: {
        type: "configuration",
        code: "INVALID_URL",
        message: "Configured HTTP product sync URL is invalid.",
      },
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "http",
        reason: "Configured HTTP product sync URL must use http or https.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "http-api",
      error: {
        type: "configuration",
        code: "UNSUPPORTED_PROTOCOL",
        message: "Configured HTTP product sync URL must use http or https.",
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-backy-request-id": requestId,
        "x-backy-provider-kind": "product-catalog",
        ...(productSyncToken()
          ? { authorization: `Bearer ${productSyncToken()}` }
          : {}),
      },
      body: JSON.stringify(
        buildHttpCatalogPayload({ siteId, product, requestId }),
      ),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      return {
        ...buildHandoffSync({
          product,
          requestId,
          provider: "http",
          reason: "HTTP product catalog sync failed.",
        }),
        status: "failed" as ProviderSyncStatus,
        executionMode: "http-api",
        error: safeHttpErrorPayload(payload),
      };
    }

    const productPayload = jsonRecord(payload.product);
    const pricePayload = jsonRecord(payload.price);
    const providerProduct = Object.keys(productPayload).length
      ? productPayload
      : payload;
    return {
      provider: "http",
      status: "synced" as ProviderSyncStatus,
      executionMode: "http-api",
      syncedAt: new Date().toISOString(),
      requestId,
      product: {
        ...safeHttpPayload(providerProduct),
        name: textValue(providerProduct.name) || product.title,
      },
      price: {
        ...safeHttpPayload(pricePayload),
        id: textValue(pricePayload.id) || textValue(payload.priceId),
        currency:
          textValue(pricePayload.currency) || product.currency.toLowerCase(),
        unitAmount:
          typeof pricePayload.unitAmount === "number"
            ? pricePayload.unitAmount
            : centsValue(product.price),
        recurring: product.subscription.enabled
          ? {
              interval: product.subscription.interval,
              trialDays: product.subscription.trialDays,
            }
          : null,
      },
      providerResponse: safeHttpProviderResponse(payload),
    };
  } catch (error) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "http",
        reason: "HTTP product catalog sync request failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "http-api",
      error: {
        type:
          error instanceof Error && error.name === "AbortError"
            ? "timeout"
            : "network",
        code:
          error instanceof Error && error.name === "AbortError"
            ? "TIMEOUT"
            : "REQUEST_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "HTTP product catalog sync request failed.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const safeStripePayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  active: typeof value.active === "boolean" ? value.active : null,
  livemode: typeof value.livemode === "boolean" ? value.livemode : null,
  url: textValue(value.url),
});

const safeStripeErrorPayload = (value: Record<string, unknown>) => {
  const error =
    value.error &&
    typeof value.error === "object" &&
    !Array.isArray(value.error)
      ? (value.error as Record<string, unknown>)
      : value;

  return {
    type: textValue(error.type),
    code: textValue(error.code),
    message: textValue(error.message) || "Stripe product sync failed.",
  };
};

const stripeRecurringForInterval = (
  interval: CommerceProduct["subscription"]["interval"],
) => {
  if (interval === "weekly") return { interval: "week" };
  if (interval === "quarterly") return { interval: "month", intervalCount: 3 };
  if (interval === "yearly") return { interval: "year" };
  return { interval: "month" };
};

const buildStripeProductForm = (
  product: CommerceProduct,
  requestId: string,
) => {
  const form = new URLSearchParams();
  form.set("name", product.title);
  form.set("active", product.status === "archived" ? "false" : "true");
  if (product.description)
    form.set("description", product.description.slice(0, 500));
  if (product.imageUrl) form.append("images[]", product.imageUrl);
  form.set("metadata[backyProductId]", product.id);
  form.set("metadata[backyProductSlug]", product.slug);
  form.set("metadata[backySku]", product.sku);
  form.set("metadata[requestId]", requestId);
  return form;
};

const buildStripePriceForm = (
  product: CommerceProduct,
  stripeProductId: string,
  requestId: string,
) => {
  const form = new URLSearchParams();
  form.set("product", stripeProductId);
  form.set("currency", product.currency.toLowerCase());
  form.set("unit_amount", String(centsValue(product.price)));
  form.set("metadata[backyProductId]", product.id);
  form.set("metadata[backyProductSlug]", product.slug);
  form.set("metadata[backySku]", product.sku);
  form.set("metadata[requestId]", requestId);
  if (product.subscription.enabled) {
    const recurring = stripeRecurringForInterval(product.subscription.interval);
    form.set("recurring[interval]", recurring.interval);
    if ("intervalCount" in recurring) {
      form.set("recurring[interval_count]", String(recurring.intervalCount));
    }
  }
  return form;
};

const callStripe = async (
  path: string,
  form: URLSearchParams,
  accountId: string | null,
) => {
  const response = await fetch(stripeApiUrl(path), {
    method: "POST",
    headers: stripeHeaders(accountId),
    body: form.toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, payload };
};

const executeStripeProductSync = async ({
  product,
  requestId,
  accountId,
}: {
  product: CommerceProduct;
  requestId: string;
  accountId: string | null;
}) => {
  if (!stripeSecretKey()) {
    return buildHandoffSync({
      product,
      requestId,
      reason: "BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY is not configured.",
    });
  }

  const createdProduct = await callStripe(
    "v1/products",
    buildStripeProductForm(product, requestId),
    accountId,
  );
  if (!createdProduct.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        reason: "Stripe product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "stripe-api",
      error: safeStripeErrorPayload(createdProduct.payload),
    };
  }

  const productId = textValue(createdProduct.payload.id);
  const createdPrice = productId
    ? await callStripe(
        "v1/prices",
        buildStripePriceForm(product, productId, requestId),
        accountId,
      )
    : null;
  if (!createdPrice || !createdPrice.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        reason: "Stripe price creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "stripe-api",
      product: safeStripePayload(createdProduct.payload),
      error: safeStripeErrorPayload(
        createdPrice?.payload || { message: "Stripe product id was missing." },
      ),
    };
  }

  return {
    provider: "stripe",
    status: "synced" as ProviderSyncStatus,
    executionMode: "stripe-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeStripePayload(createdProduct.payload),
    price: {
      ...safeStripePayload(createdPrice.payload),
      currency: product.currency.toLowerCase(),
      unitAmount: centsValue(product.price),
      recurring: product.subscription.enabled
        ? {
            interval: product.subscription.interval,
            trialDays: product.subscription.trialDays,
          }
        : null,
    },
  };
};

const safePaddleData = (payload: Record<string, unknown>) => {
  const data = jsonRecord(payload.data);
  return Object.keys(data).length ? data : payload;
};

const safePaddleProductPayload = (payload: Record<string, unknown>) => {
  const value = safePaddleData(payload);
  return {
    id: textValue(value.id),
    object: textValue(value.object) || textValue(value.type) || "product",
    active: textValue(value.status)
      ? textValue(value.status) !== "archived"
      : null,
    status: textValue(value.status),
    name: textValue(value.name),
    url: textValue(value.url),
  };
};

const safePaddlePricePayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const value = safePaddleData(payload);
  const unitPrice = jsonRecord(value.unit_price);
  const billingCycle = jsonRecord(value.billing_cycle);
  const trialPeriod = jsonRecord(value.trial_period);
  return {
    id: textValue(value.id),
    object: textValue(value.object) || textValue(value.type) || "price",
    active: textValue(value.status)
      ? textValue(value.status) !== "archived"
      : null,
    status: textValue(value.status),
    currency:
      textValue(unitPrice.currency_code).toLowerCase() ||
      product.currency.toLowerCase(),
    unitAmount: Number(
      textValue(unitPrice.amount) || centsValue(product.price),
    ),
    recurring:
      Object.keys(billingCycle).length || product.subscription.enabled
        ? {
            interval:
              textValue(billingCycle.interval) || product.subscription.interval,
            trialDays: Number(
              textValue(trialPeriod.frequency) ||
                product.subscription.trialDays ||
                0,
            ),
          }
        : null,
  };
};

const safePaddleErrorPayload = (value: Record<string, unknown>) => {
  const error = jsonRecord(value.error);
  const source = Object.keys(error).length ? error : value;
  return {
    type: textValue(source.type) || "paddle-api",
    code: textValue(source.code) || textValue(source.status),
    message:
      textValue(source.detail) ||
      textValue(source.message) ||
      textValue(source.error) ||
      "Paddle product sync failed.",
  };
};

const paddleTaxCategory = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return (
    textValue(commerce.paddleTaxCategory) ||
    textValue(commerce.productPaddleTaxCategory) ||
    textValue(commerce.catalogSyncPaddleTaxCategory) ||
    "standard"
  );
};

const paddleBillingCycleForInterval = (
  interval: CommerceProduct["subscription"]["interval"],
) => {
  if (interval === "weekly") return { interval: "week", frequency: 1 };
  if (interval === "quarterly") return { interval: "month", frequency: 3 };
  if (interval === "yearly") return { interval: "year", frequency: 1 };
  return { interval: "month", frequency: 1 };
};

const buildPaddleProductPayload = (
  product: CommerceProduct,
  requestId: string,
  settings: unknown,
) => ({
  name: product.title,
  description: product.description
    ? product.description.slice(0, 1000)
    : undefined,
  tax_category: paddleTaxCategory(settings),
  image_url: product.imageUrl || undefined,
  custom_data: {
    backyProductId: product.id,
    backyProductSlug: product.slug,
    backySku: product.sku,
    requestId,
  },
});

const buildPaddlePricePayload = (
  product: CommerceProduct,
  paddleProductId: string,
  requestId: string,
) => ({
  product_id: paddleProductId,
  description: product.title,
  unit_price: {
    amount: String(centsValue(product.price)),
    currency_code: product.currency.toUpperCase(),
  },
  ...(product.subscription.enabled
    ? {
        billing_cycle: paddleBillingCycleForInterval(
          product.subscription.interval,
        ),
        ...(product.subscription.trialDays > 0
          ? {
              trial_period: {
                interval: "day",
                frequency: product.subscription.trialDays,
              },
            }
          : {}),
      }
    : {}),
  custom_data: {
    backyProductId: product.id,
    backyProductSlug: product.slug,
    backySku: product.sku,
    requestId,
  },
});

const callPaddle = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(paddleApiUrl(path), {
    method: "POST",
    headers: paddleHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, payload };
};

const executePaddleProductSync = async ({
  product,
  requestId,
  settings,
}: {
  product: CommerceProduct;
  requestId: string;
  settings: unknown;
}) => {
  if (!paddleApiKey()) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "paddle",
      reason: "BACKY_PADDLE_API_KEY or PADDLE_API_KEY is not configured.",
    });
  }

  const createdProduct = await callPaddle(
    "products",
    buildPaddleProductPayload(product, requestId, settings),
  );
  if (!createdProduct.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "paddle",
        reason: "Paddle product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "paddle-api",
      error: safePaddleErrorPayload(createdProduct.payload),
    };
  }

  const productId = textValue(safePaddleData(createdProduct.payload).id);
  const createdPrice = productId
    ? await callPaddle(
        "prices",
        buildPaddlePricePayload(product, productId, requestId),
      )
    : null;
  if (!createdPrice || !createdPrice.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "paddle",
        reason: "Paddle price creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "paddle-api",
      product: safePaddleProductPayload(createdProduct.payload),
      error: safePaddleErrorPayload(
        createdPrice?.payload || { message: "Paddle product id was missing." },
      ),
    };
  }

  return {
    provider: "paddle",
    status: "synced" as ProviderSyncStatus,
    executionMode: "paddle-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safePaddleProductPayload(createdProduct.payload),
    price: safePaddlePricePayload(createdPrice.payload, product),
  };
};

const safeSquareCatalogObject = (value: unknown): Record<string, unknown> => {
  const object = jsonRecord(value);
  const catalogObject = jsonRecord(object.catalog_object);
  return Object.keys(catalogObject).length ? catalogObject : object;
};

const safeSquareVariationObject = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const itemData = jsonRecord(value.item_data);
  const variations = Array.isArray(itemData.variations)
    ? itemData.variations
    : [];
  const firstVariation =
    variations.find(
      (variation) => jsonRecord(variation).type === "ITEM_VARIATION",
    ) || variations[0];
  return jsonRecord(firstVariation);
};

const safeSquareProductPayload = (payload: Record<string, unknown>) => {
  const value = safeSquareCatalogObject(payload);
  const itemData = jsonRecord(value.item_data);
  return {
    id: textValue(value.id),
    object: textValue(value.type) || "ITEM",
    active: typeof value.is_deleted === "boolean" ? !value.is_deleted : null,
    name: textValue(itemData.name),
  };
};

const safeSquarePricePayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const value = safeSquareCatalogObject(payload);
  const variation = safeSquareVariationObject(value);
  const variationData = jsonRecord(variation.item_variation_data);
  const priceMoney = jsonRecord(variationData.price_money);
  return {
    id: textValue(variation.id),
    object: textValue(variation.type) || "ITEM_VARIATION",
    active:
      typeof variation.is_deleted === "boolean" ? !variation.is_deleted : null,
    currency:
      textValue(priceMoney.currency).toLowerCase() ||
      product.currency.toLowerCase(),
    unitAmount:
      typeof priceMoney.amount === "number"
        ? priceMoney.amount
        : centsValue(product.price),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  };
};

const safeSquareErrorPayload = (value: Record<string, unknown>) => {
  const errors = Array.isArray(value.errors)
    ? value.errors.map((error) => jsonRecord(error))
    : [];
  const firstError = errors[0] || jsonRecord(value.error) || value;
  return {
    type:
      textValue(firstError.category) ||
      textValue(firstError.type) ||
      "square-api",
    code: textValue(firstError.code) || textValue(firstError.status),
    message:
      textValue(firstError.detail) ||
      textValue(firstError.message) ||
      "Square catalog sync failed.",
  };
};

const squareTemporaryId = (
  prefix: string,
  product: CommerceProduct,
  requestId: string,
) =>
  `#${prefix}_${product.id.replace(/[^a-zA-Z0-9_-]/g, "_")}_${requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

const buildSquareCatalogPayload = (
  product: CommerceProduct,
  requestId: string,
) => {
  const itemId = squareTemporaryId("backy_item", product, requestId);
  const variationId = squareTemporaryId("backy_variation", product, requestId);
  return {
    idempotency_key: requestId,
    object: {
      type: "ITEM",
      id: itemId,
      present_at_all_locations: true,
      item_data: {
        name: product.title,
        description: product.description
          ? product.description.slice(0, 1000)
          : undefined,
        abbreviation: product.sku
          ? product.sku.slice(0, 5).toUpperCase()
          : undefined,
        variations: [
          {
            type: "ITEM_VARIATION",
            id: variationId,
            present_at_all_locations: true,
            item_variation_data: {
              item_id: itemId,
              name: product.sku || "Default",
              sku: product.sku,
              pricing_type: "FIXED_PRICING",
              price_money: {
                amount: centsValue(product.price),
                currency: product.currency.toUpperCase(),
              },
              track_inventory: product.inventory.policy !== "continue",
            },
          },
        ],
      },
    },
  };
};

const callSquare = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(squareApiUrl(path), {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, payload };
};

const executeSquareProductSync = async ({
  product,
  requestId,
}: {
  product: CommerceProduct;
  requestId: string;
}) => {
  if (!squareAccessToken()) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "square",
      reason:
        "BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN is not configured.",
    });
  }

  const createdCatalogObject = await callSquare(
    "v2/catalog/object",
    buildSquareCatalogPayload(product, requestId),
  );
  if (!createdCatalogObject.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "square",
        reason: "Square catalog object upsert failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "square-api",
      error: safeSquareErrorPayload(createdCatalogObject.payload),
    };
  }

  return {
    provider: "square",
    status: "synced" as ProviderSyncStatus,
    executionMode: "square-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeSquareProductPayload(createdCatalogObject.payload),
    price: safeSquarePricePayload(createdCatalogObject.payload, product),
  };
};

const paypalProductType = (product: CommerceProduct) => {
  if (product.productType === "digital") return "DIGITAL";
  if (product.productType === "service") return "SERVICE";
  return "PHYSICAL";
};

const paypalIntervalForProduct = (
  interval: CommerceProduct["subscription"]["interval"],
) => {
  if (interval === "weekly")
    return { interval_unit: "WEEK", interval_count: 1 };
  if (interval === "quarterly")
    return { interval_unit: "MONTH", interval_count: 3 };
  if (interval === "yearly")
    return { interval_unit: "YEAR", interval_count: 1 };
  return { interval_unit: "MONTH", interval_count: 1 };
};

const safePaypalPayload = (payload: Record<string, unknown>) => ({
  id: textValue(payload.id),
  object: textValue(payload.type) || "paypal",
  active: textValue(payload.status)
    ? textValue(payload.status) === "ACTIVE"
    : null,
  status: textValue(payload.status),
  name: textValue(payload.name),
  url: textValue(payload.url) || textValue(payload.self),
});

const safePaypalPlanPayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const billingCycles = Array.isArray(payload.billing_cycles)
    ? payload.billing_cycles
    : [];
  const regularCycle =
    billingCycles
      .map((cycle) => jsonRecord(cycle))
      .find((cycle) => textValue(cycle.tenure_type) === "REGULAR") || {};
  const pricingScheme = jsonRecord(regularCycle.pricing_scheme);
  const fixedPrice = jsonRecord(pricingScheme.fixed_price);
  return {
    id: textValue(payload.id),
    object: "billing_plan",
    active: textValue(payload.status)
      ? textValue(payload.status) === "ACTIVE"
      : null,
    status: textValue(payload.status),
    currency:
      textValue(fixedPrice.currency_code).toLowerCase() ||
      product.currency.toLowerCase(),
    unitAmount: centsValue(
      Number(textValue(fixedPrice.value)) || product.price,
    ),
    recurring: {
      interval: product.subscription.interval,
      trialDays: product.subscription.trialDays,
    },
  };
};

const safePaypalErrorPayload = (value: Record<string, unknown>) => {
  const details = Array.isArray(value.details)
    ? jsonRecord(value.details[0])
    : {};
  return {
    type: textValue(value.name) || "paypal-api",
    code:
      textValue(value.issue) ||
      textValue(details.issue) ||
      textValue(value.status),
    message:
      textValue(value.message) ||
      textValue(details.description) ||
      "PayPal product sync failed.",
  };
};

const buildPaypalProductPayload = (
  product: CommerceProduct,
  requestId: string,
) => ({
  name: product.title,
  description: product.description
    ? product.description.slice(0, 256)
    : undefined,
  type: paypalProductType(product),
  category: product.category
    ? product.category
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_")
        .slice(0, 50)
    : undefined,
  image_url: product.imageUrl || undefined,
  home_url: product.links.storefrontPath || undefined,
  metadata: {
    backyProductId: product.id,
    backyProductSlug: product.slug,
    backySku: product.sku,
    requestId,
  },
});

const buildPaypalPlanPayload = (
  product: CommerceProduct,
  paypalProductId: string,
  requestId: string,
) => ({
  product_id: paypalProductId,
  name: product.title,
  description: product.description
    ? product.description.slice(0, 127)
    : undefined,
  status: "ACTIVE",
  billing_cycles: [
    ...(product.subscription.trialDays > 0
      ? [
          {
            frequency: {
              interval_unit: "DAY",
              interval_count: product.subscription.trialDays,
            },
            tenure_type: "TRIAL",
            sequence: 1,
            total_cycles: 1,
            pricing_scheme: {
              fixed_price: {
                value: "0",
                currency_code: product.currency.toUpperCase(),
              },
            },
          },
        ]
      : []),
    {
      frequency: paypalIntervalForProduct(product.subscription.interval),
      tenure_type: "REGULAR",
      sequence: product.subscription.trialDays > 0 ? 2 : 1,
      total_cycles: 0,
      pricing_scheme: {
        fixed_price: {
          value: Math.max(
            0,
            Number.isFinite(product.price) ? product.price : 0,
          ).toFixed(2),
          currency_code: product.currency.toUpperCase(),
        },
      },
    },
  ],
  payment_preferences: {
    auto_bill_outstanding: true,
    setup_fee_failure_action: "CONTINUE",
    payment_failure_threshold: 3,
  },
  custom_id: `${product.id}:${requestId}`.slice(0, 127),
});

const getPaypalBearerToken = async () => {
  const existingToken = paypalAccessToken();
  if (existingToken) {
    return {
      token: existingToken,
      error: null as Record<string, unknown> | null,
    };
  }

  const clientId = paypalClientId();
  const clientSecret = paypalClientSecret();
  if (!clientId || !clientSecret) {
    return {
      token: "",
      error: {
        message:
          "BACKY_PAYPAL_ACCESS_TOKEN/PAYPAL_ACCESS_TOKEN or BACKY_PAYPAL_CLIENT_ID/PAYPAL_CLIENT_ID plus BACKY_PAYPAL_CLIENT_SECRET/PAYPAL_CLIENT_SECRET is not configured.",
      },
    };
  }

  const response = await fetch(paypalApiUrl("v1/oauth2/token"), {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    return { token: "", error: payload };
  }
  return { token: textValue(payload.access_token), error: null };
};

const callPaypal = async (
  path: string,
  body: Record<string, unknown>,
  token: string,
  requestId: string,
) => {
  const response = await fetch(paypalApiUrl(path), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "paypal-request-id": `${requestId}-${path.replace(/[^a-z0-9]/gi, "-").slice(0, 24)}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, payload };
};

const executePaypalProductSync = async ({
  product,
  requestId,
}: {
  product: CommerceProduct;
  requestId: string;
}) => {
  const token = await getPaypalBearerToken();
  if (!token.token) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "paypal",
      reason: safePaypalErrorPayload(token.error || {}).message,
    });
  }

  const createdProduct = await callPaypal(
    "v1/catalogs/products",
    buildPaypalProductPayload(product, requestId),
    token.token,
    requestId,
  );
  if (!createdProduct.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "paypal",
        reason: "PayPal catalog product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "paypal-api",
      error: safePaypalErrorPayload(createdProduct.payload),
    };
  }

  if (!product.subscription.enabled) {
    return {
      provider: "paypal",
      status: "synced" as ProviderSyncStatus,
      executionMode: "paypal-api",
      syncedAt: new Date().toISOString(),
      requestId,
      product: safePaypalPayload(createdProduct.payload),
      price: null,
    };
  }

  const productId = textValue(createdProduct.payload.id);
  const createdPlan = productId
    ? await callPaypal(
        "v1/billing/plans",
        buildPaypalPlanPayload(product, productId, requestId),
        token.token,
        requestId,
      )
    : null;
  if (!createdPlan || !createdPlan.response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "paypal",
        reason: "PayPal subscription plan creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "paypal-api",
      product: safePaypalPayload(createdProduct.payload),
      error: safePaypalErrorPayload(
        createdPlan?.payload || { message: "PayPal product id was missing." },
      ),
    };
  }

  return {
    provider: "paypal",
    status: "synced" as ProviderSyncStatus,
    executionMode: "paypal-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safePaypalPayload(createdProduct.payload),
    price: safePaypalPlanPayload(createdPlan.payload, product),
  };
};

const shopifyStatus = (product: CommerceProduct) =>
  product.status === "published" ? "active" : "draft";

const shopifyVariantPayload = (product: CommerceProduct) => {
  const variants =
    product.variants.length > 0
      ? product.variants
      : [
          {
            id: product.id,
            title: "Default Title",
            sku: product.sku,
            option: "Default Title",
            price: product.price,
            inventory: product.inventory.quantity,
            inStock: product.inventory.inStock,
          },
        ];

  return variants.map((variant) => ({
    option1: variant.option || variant.title || "Default Title",
    sku: variant.sku || product.sku || undefined,
    price: String(Math.max(0, variant.price ?? product.price).toFixed(2)),
    compare_at_price: product.compareAtPrice
      ? String(product.compareAtPrice.toFixed(2))
      : undefined,
    inventory_quantity: Math.max(
      0,
      Math.round(variant.inventory ?? product.inventory.quantity),
    ),
    inventory_policy:
      product.inventory.policy === "continue" ||
      product.inventory.policy === "preorder"
        ? "continue"
        : "deny",
    taxable: product.delivery.taxable,
    requires_shipping: product.delivery.shippingRequired,
    weight: product.delivery.weight ?? undefined,
    weight_unit: product.delivery.weight ? "lb" : undefined,
  }));
};

const buildShopifyProductPayload = (
  product: CommerceProduct,
  requestId: string,
) => ({
  product: {
    title: product.title,
    body_html: product.description || undefined,
    vendor: product.vendor || undefined,
    product_type: product.category || product.productType,
    tags: [
      ...product.tags,
      ...(product.subscription.enabled ? ["subscription"] : []),
    ]
      .filter(Boolean)
      .join(", "),
    status: shopifyStatus(product),
    images: [product.imageUrl, ...product.galleryImages]
      .filter(Boolean)
      .map((src) => ({ src })),
    variants: shopifyVariantPayload(product),
    metafields: [
      {
        namespace: "backy",
        key: "product_id",
        type: "single_line_text_field",
        value: product.id,
      },
      {
        namespace: "backy",
        key: "product_slug",
        type: "single_line_text_field",
        value: product.slug,
      },
      {
        namespace: "backy",
        key: "request_id",
        type: "single_line_text_field",
        value: requestId,
      },
      {
        namespace: "backy",
        key: "subscription",
        type: "json",
        value: JSON.stringify(product.subscription),
      },
    ],
  },
});

const safeShopifyProductPayload = (payload: Record<string, unknown>) => {
  const product = jsonRecord(payload.product);
  return {
    id: textValue(product.admin_graphql_api_id) || textValue(product.id),
    object: "product",
    active: textValue(product.status)
      ? textValue(product.status) === "active"
      : null,
    status: textValue(product.status),
    name: textValue(product.title),
    url: textValue(product.handle),
  };
};

const safeShopifyPricePayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const shopifyProduct = jsonRecord(payload.product);
  const variants = Array.isArray(shopifyProduct.variants)
    ? shopifyProduct.variants
    : [];
  const firstVariant = variants.length > 0 ? jsonRecord(variants[0]) : {};
  return {
    id:
      textValue(firstVariant.admin_graphql_api_id) ||
      textValue(firstVariant.id),
    object: "variant",
    active: textValue(shopifyProduct.status)
      ? textValue(shopifyProduct.status) === "active"
      : null,
    currency: product.currency.toLowerCase(),
    unitAmount: centsValue(
      Number(textValue(firstVariant.price)) || product.price,
    ),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  };
};

const safeShopifyErrorPayload = (value: Record<string, unknown>) => {
  const errors = Array.isArray(value.errors) ? value.errors : [];
  const firstError = errors.length > 0 ? jsonRecord(errors[0]) : {};
  return {
    type: "shopify-api",
    code: textValue(firstError.code) || textValue(value.error),
    message:
      textValue(firstError.message) ||
      textValue(value.error_description) ||
      textValue(value.message) ||
      "Shopify product sync failed.",
  };
};

const executeShopifyProductSync = async ({
  product,
  requestId,
}: {
  product: CommerceProduct;
  requestId: string;
}) => {
  const url = shopifyApiUrl("products.json");
  if (!shopifyAccessToken() || !url) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "shopify",
      reason:
        "BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_ADMIN_ACCESS_TOKEN plus BACKY_SHOPIFY_STORE_DOMAIN/SHOPIFY_STORE_DOMAIN or BACKY_SHOPIFY_ADMIN_API_BASE_URL is not configured.",
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": shopifyAccessToken(),
    },
    body: JSON.stringify(buildShopifyProductPayload(product, requestId)),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "shopify",
        reason: "Shopify product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "shopify-api",
      error: safeShopifyErrorPayload(payload),
    };
  }

  return {
    provider: "shopify",
    status: "synced" as ProviderSyncStatus,
    executionMode: "shopify-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeShopifyProductPayload(payload),
    price: safeShopifyPricePayload(payload, product),
  };
};

const bigCommerceProductType = (product: CommerceProduct) =>
  product.productType === "physical" ? "physical" : "digital";

const bigCommerceVariantPayload = (product: CommerceProduct) =>
  product.variants.map((variant) => ({
    sku: variant.sku || product.sku || undefined,
    price: Math.max(0, variant.price ?? product.price),
    inventory_level: Math.max(
      0,
      Math.round(variant.inventory ?? product.inventory.quantity),
    ),
    option_values: [
      {
        option_display_name: "Variant",
        label: variant.option || variant.title || "Default",
      },
    ],
  }));

const buildBigCommerceProductPayload = (
  product: CommerceProduct,
  requestId: string,
) => ({
  name: product.title,
  type: bigCommerceProductType(product),
  sku: product.sku || undefined,
  description: product.description || undefined,
  price: Math.max(0, product.price),
  retail_price: product.compareAtPrice ?? undefined,
  inventory_level: Math.max(0, Math.round(product.inventory.quantity)),
  inventory_tracking: product.variants.length > 0 ? "variant" : "product",
  is_visible: product.status === "published",
  weight: product.delivery.weight ?? undefined,
  custom_fields: [
    { name: "backyProductId", value: product.id },
    { name: "backyProductSlug", value: product.slug },
    { name: "backyRequestId", value: requestId },
    { name: "backySubscription", value: JSON.stringify(product.subscription) },
  ],
  variants:
    product.variants.length > 0
      ? bigCommerceVariantPayload(product)
      : undefined,
});

const safeBigCommerceProductPayload = (payload: Record<string, unknown>) => {
  const product = jsonRecord(payload.data);
  return {
    id:
      textValue(product.id) ||
      (typeof product.id === "number" ? String(product.id) : null),
    object: "product",
    active: typeof product.is_visible === "boolean" ? product.is_visible : null,
    status:
      typeof product.is_visible === "boolean"
        ? product.is_visible
          ? "visible"
          : "hidden"
        : "",
    name: textValue(product.name),
    url: textValue(product.custom_url),
  };
};

const safeBigCommercePricePayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const productPayload = jsonRecord(payload.data);
  const variants = Array.isArray(productPayload.variants)
    ? productPayload.variants
    : [];
  const firstVariant = variants.length > 0 ? jsonRecord(variants[0]) : {};
  const variantId =
    textValue(firstVariant.id) ||
    (typeof firstVariant.id === "number" ? String(firstVariant.id) : "");
  return {
    id:
      variantId ||
      textValue(productPayload.id) ||
      (typeof productPayload.id === "number"
        ? String(productPayload.id)
        : null),
    object: variantId ? "variant" : "product",
    active:
      typeof productPayload.is_visible === "boolean"
        ? productPayload.is_visible
        : null,
    currency: product.currency.toLowerCase(),
    unitAmount: centsValue(
      Number(firstVariant.price ?? productPayload.price ?? product.price),
    ),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  };
};

const safeBigCommerceErrorPayload = (value: Record<string, unknown>) => {
  const errors = jsonRecord(value.errors);
  const errorMessages = Object.values(errors)
    .flatMap((entry) =>
      Array.isArray(entry) ? entry.map(String) : [String(entry)],
    )
    .filter(Boolean);
  return {
    type: "bigcommerce-api",
    code: textValue(value.title) || textValue(value.type),
    message:
      errorMessages[0] ||
      textValue(value.detail) ||
      textValue(value.message) ||
      "BigCommerce product sync failed.",
  };
};

const executeBigCommerceProductSync = async ({
  product,
  requestId,
}: {
  product: CommerceProduct;
  requestId: string;
}) => {
  const url = bigCommerceApiUrl("catalog/products");
  if (!bigCommerceAccessToken() || !url) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "bigcommerce",
      reason:
        "BACKY_BIGCOMMERCE_ACCESS_TOKEN/BIGCOMMERCE_ACCESS_TOKEN plus BACKY_BIGCOMMERCE_STORE_HASH/BIGCOMMERCE_STORE_HASH or BACKY_BIGCOMMERCE_API_BASE_URL is not configured.",
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-auth-token": bigCommerceAccessToken(),
    },
    body: JSON.stringify(buildBigCommerceProductPayload(product, requestId)),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "bigcommerce",
        reason: "BigCommerce product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "bigcommerce-api",
      error: safeBigCommerceErrorPayload(payload),
    };
  }

  return {
    provider: "bigcommerce",
    status: "synced" as ProviderSyncStatus,
    executionMode: "bigcommerce-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeBigCommerceProductPayload(payload),
    price: safeBigCommercePricePayload(payload, product),
  };
};

const wooCommerceHeaders = () => ({
  authorization: `Basic ${Buffer.from(`${wooCommerceConsumerKey()}:${wooCommerceConsumerSecret()}`).toString("base64")}`,
  "content-type": "application/json",
});

const wooCommerceVariantLabel = (
  variant: CommerceProduct["variants"][number],
) => variant.option || variant.title || "Default";

const buildWooCommerceProductPayload = (
  product: CommerceProduct,
  requestId: string,
) => ({
  name: product.title,
  type: product.variants.length > 0 ? "variable" : "simple",
  status: product.status === "published" ? "publish" : "draft",
  sku: product.sku || undefined,
  regular_price:
    product.variants.length > 0
      ? undefined
      : String(Math.max(0, product.compareAtPrice ?? product.price).toFixed(2)),
  sale_price: product.compareAtPrice
    ? String(Math.max(0, product.price).toFixed(2))
    : undefined,
  description: product.description || undefined,
  short_description: product.seoTitle || undefined,
  virtual:
    product.productType !== "physical" || !product.delivery.shippingRequired,
  downloadable: product.delivery.hasDigitalDelivery,
  manage_stock: true,
  stock_quantity: Math.max(0, Math.round(product.inventory.quantity)),
  stock_status: product.inventory.inStock ? "instock" : "outofstock",
  catalog_visibility: product.status === "published" ? "visible" : "hidden",
  images: [product.imageUrl, ...product.galleryImages]
    .filter(Boolean)
    .map((src) => ({ src })),
  attributes:
    product.variants.length > 0
      ? [
          {
            name: "Variant",
            visible: true,
            variation: true,
            options: Array.from(
              new Set(product.variants.map(wooCommerceVariantLabel)),
            ),
          },
        ]
      : undefined,
  meta_data: [
    { key: "backy_product_id", value: product.id },
    { key: "backy_product_slug", value: product.slug },
    { key: "backy_request_id", value: requestId },
    { key: "backy_subscription", value: product.subscription },
  ],
});

const buildWooCommerceVariationPayload = (
  product: CommerceProduct,
  variant: CommerceProduct["variants"][number],
) => ({
  regular_price: String(Math.max(0, variant.price ?? product.price).toFixed(2)),
  sku: variant.sku || undefined,
  manage_stock: true,
  stock_quantity: Math.max(
    0,
    Math.round(variant.inventory ?? product.inventory.quantity),
  ),
  stock_status: variant.inStock ? "instock" : "outofstock",
  virtual:
    product.productType !== "physical" || !product.delivery.shippingRequired,
  downloadable: product.delivery.hasDigitalDelivery,
  attributes: [
    {
      name: "Variant",
      option: wooCommerceVariantLabel(variant),
    },
  ],
  meta_data: [
    { key: "backy_variant_id", value: variant.id },
    { key: "backy_product_id", value: product.id },
  ],
});

const safeWooCommerceProductPayload = (
  product: Record<string, unknown>,
  variations: Array<Record<string, unknown>>,
) => ({
  id:
    textValue(product.id) ||
    (typeof product.id === "number" ? String(product.id) : null),
  object: "product",
  active: textValue(product.status)
    ? textValue(product.status) === "publish"
    : null,
  status: textValue(product.status),
  name: textValue(product.name),
  url: textValue(product.permalink),
  variations: variations.map((variation) => ({
    id:
      textValue(variation.id) ||
      (typeof variation.id === "number" ? String(variation.id) : null),
    sku: textValue(variation.sku),
  })),
});

const safeWooCommercePricePayload = (
  wooProduct: Record<string, unknown>,
  variations: Array<Record<string, unknown>>,
  product: CommerceProduct,
) => {
  const firstVariation = variations[0] || {};
  const unitPrice = Number(
    firstVariation.price ?? wooProduct.price ?? product.price,
  );
  return {
    id:
      textValue(firstVariation.id) ||
      (typeof firstVariation.id === "number"
        ? String(firstVariation.id)
        : textValue(wooProduct.id) || null),
    object: variations.length > 0 ? "variation" : "product",
    active: textValue(wooProduct.status)
      ? textValue(wooProduct.status) === "publish"
      : null,
    currency: product.currency.toLowerCase(),
    unitAmount: centsValue(unitPrice),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  };
};

const safeWooCommerceErrorPayload = (value: Record<string, unknown>) => ({
  type: "woocommerce-api",
  code: textValue(value.code) || textValue(value.status),
  message: textValue(value.message) || "WooCommerce product sync failed.",
});

const executeWooCommerceProductSync = async ({
  product,
  requestId,
}: {
  product: CommerceProduct;
  requestId: string;
}) => {
  const productsUrl = wooCommerceApiUrl("products");
  if (
    !wooCommerceConsumerKey() ||
    !wooCommerceConsumerSecret() ||
    !productsUrl
  ) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "woocommerce",
      reason:
        "BACKY_WOOCOMMERCE_CONSUMER_KEY/WOOCOMMERCE_CONSUMER_KEY, BACKY_WOOCOMMERCE_CONSUMER_SECRET/WOOCOMMERCE_CONSUMER_SECRET, and BACKY_WOOCOMMERCE_STORE_URL/WOOCOMMERCE_STORE_URL or BACKY_WOOCOMMERCE_API_BASE_URL are not configured.",
    });
  }

  const productResponse = await fetch(productsUrl, {
    method: "POST",
    headers: wooCommerceHeaders(),
    body: JSON.stringify(buildWooCommerceProductPayload(product, requestId)),
  });
  const wooProduct = (await productResponse.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!productResponse.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "woocommerce",
        reason: "WooCommerce product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "woocommerce-api",
      error: safeWooCommerceErrorPayload(wooProduct),
    };
  }

  const productId =
    textValue(wooProduct.id) ||
    (typeof wooProduct.id === "number" ? String(wooProduct.id) : "");
  const variations: Array<Record<string, unknown>> = [];
  if (productId && product.variants.length > 0) {
    for (const variant of product.variants) {
      const variationResponse = await fetch(
        wooCommerceApiUrl(`products/${productId}/variations`),
        {
          method: "POST",
          headers: wooCommerceHeaders(),
          body: JSON.stringify(
            buildWooCommerceVariationPayload(product, variant),
          ),
        },
      );
      const variationPayload = (await variationResponse
        .json()
        .catch(() => ({}))) as Record<string, unknown>;
      if (!variationResponse.ok) {
        return {
          ...buildHandoffSync({
            product,
            requestId,
            provider: "woocommerce",
            reason: "WooCommerce variation creation failed.",
          }),
          status: "failed" as ProviderSyncStatus,
          executionMode: "woocommerce-api",
          product: safeWooCommerceProductPayload(wooProduct, variations),
          error: safeWooCommerceErrorPayload(variationPayload),
        };
      }
      variations.push(variationPayload);
    }
  }

  return {
    provider: "woocommerce",
    status: "synced" as ProviderSyncStatus,
    executionMode: "woocommerce-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeWooCommerceProductPayload(wooProduct, variations),
    price: safeWooCommercePricePayload(wooProduct, variations, product),
  };
};

const etsyHeaders = () => ({
  authorization: `Bearer ${etsyAccessToken()}`,
  "x-api-key": etsyApiKey(),
  "content-type": "application/x-www-form-urlencoded",
});

const etsyTaxonomyId = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return (
    textValue(commerce.etsyTaxonomyId) ||
    textValue(commerce.catalogSyncEtsyTaxonomyId) ||
    envValue(["BACKY_ETSY_TAXONOMY_ID", "ETSY_TAXONOMY_ID"]) ||
    "1"
  );
};

const etsyShippingProfileId = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return (
    textValue(commerce.etsyShippingProfileId) ||
    textValue(commerce.catalogSyncEtsyShippingProfileId) ||
    envValue(["BACKY_ETSY_SHIPPING_PROFILE_ID", "ETSY_SHIPPING_PROFILE_ID"])
  );
};

const etsyReturnPolicyId = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return (
    textValue(commerce.etsyReturnPolicyId) ||
    textValue(commerce.catalogSyncEtsyReturnPolicyId) ||
    envValue(["BACKY_ETSY_RETURN_POLICY_ID", "ETSY_RETURN_POLICY_ID"])
  );
};

const buildEtsyListingForm = (
  product: CommerceProduct,
  settings: unknown,
) => {
  const form = new URLSearchParams();
  form.set("title", product.title.slice(0, 140));
  form.set("description", product.description || product.seoTitle || product.title);
  form.set("quantity", String(Math.max(1, Math.round(product.inventory.quantity || 1))));
  form.set("price", Math.max(0, product.price).toFixed(2));
  form.set("who_made", "i_did");
  form.set("when_made", "made_to_order");
  form.set("taxonomy_id", etsyTaxonomyId(settings));
  form.set("type", product.productType === "digital" ? "download" : "physical");
  form.set("should_auto_renew", "true");
  if (product.sku) form.append("sku[]", product.sku);
  for (const tag of product.tags.slice(0, 13)) {
    form.append("tags[]", tag.slice(0, 20));
  }
  const shippingProfileId = etsyShippingProfileId(settings);
  if (shippingProfileId && product.productType !== "digital") {
    form.set("shipping_profile_id", shippingProfileId);
  }
  const returnPolicyId = etsyReturnPolicyId(settings);
  if (returnPolicyId) {
    form.set("return_policy_id", returnPolicyId);
  }
  return form;
};

const safeEtsyListingPayload = (payload: Record<string, unknown>) => {
  const listing = Object.keys(jsonRecord(payload.results)).length
    ? jsonRecord(payload.results)
    : payload;
  return {
    id:
      textValue(listing.listing_id) ||
      (typeof listing.listing_id === "number"
        ? String(listing.listing_id)
        : textValue(listing.id)),
    object: "listing",
    active: textValue(listing.state) ? textValue(listing.state) === "active" : null,
    status: textValue(listing.state) || "draft",
    name: textValue(listing.title),
    url: textValue(listing.url),
  };
};

const safeEtsyPricePayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const listing = Object.keys(jsonRecord(payload.results)).length
    ? jsonRecord(payload.results)
    : payload;
  const price = jsonRecord(listing.price);
  return {
    id:
      textValue(listing.listing_id) ||
      (typeof listing.listing_id === "number"
        ? String(listing.listing_id)
        : textValue(listing.id)),
    object: "listing_price",
    active: textValue(listing.state) ? textValue(listing.state) === "active" : null,
    currency:
      textValue(price.currency_code).toLowerCase() || product.currency.toLowerCase(),
    unitAmount:
      typeof price.amount === "number"
        ? price.amount
        : centsValue(Number(textValue(listing.price)) || product.price),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  };
};

const safeEtsyErrorPayload = (value: Record<string, unknown>) => ({
  type: "etsy-api",
  code: textValue(value.error) || textValue(value.status),
  message:
    textValue(value.error_description) ||
    textValue(value.message) ||
    "Etsy listing sync failed.",
});

const executeEtsyProductSync = async ({
  product,
  requestId,
  settings,
}: {
  product: CommerceProduct;
  requestId: string;
  settings: unknown;
}) => {
  const shopId = etsyShopId();
  if (!etsyAccessToken() || !etsyApiKey() || !shopId) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "etsy",
      reason:
        "BACKY_ETSY_ACCESS_TOKEN/ETSY_ACCESS_TOKEN, BACKY_ETSY_API_KEY/ETSY_API_KEY, and BACKY_ETSY_SHOP_ID/ETSY_SHOP_ID are not configured.",
    });
  }

  const response = await fetch(etsyApiUrl(`shops/${shopId}/listings`), {
    method: "POST",
    headers: etsyHeaders(),
    body: buildEtsyListingForm(product, settings).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "etsy",
        reason: "Etsy draft listing creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "etsy-api",
      error: safeEtsyErrorPayload(payload),
    };
  }

  return {
    provider: "etsy",
    status: "synced" as ProviderSyncStatus,
    executionMode: "etsy-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeEtsyListingPayload(payload),
    price: safeEtsyPricePayload(payload, product),
  };
};

const magentoAttributeSetId = (settings: unknown): number => {
  const commerce = settingsCommerce(settings);
  const configured =
    textValue(commerce.magentoAttributeSetId) ||
    textValue(commerce.catalogSyncMagentoAttributeSetId) ||
    envValue(["BACKY_MAGENTO_ATTRIBUTE_SET_ID", "MAGENTO_ATTRIBUTE_SET_ID"]);
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
};

const magentoProductType = (product: CommerceProduct) =>
  product.productType === "digital" || !product.delivery.shippingRequired
    ? "virtual"
    : "simple";

const buildMagentoProductPayload = (
  product: CommerceProduct,
  requestId: string,
  settings: unknown,
) => ({
  product: {
    sku: product.sku || product.slug,
    name: product.title,
    attribute_set_id: magentoAttributeSetId(settings),
    price: Math.max(0, product.price),
    status: product.status === "published" ? 1 : 2,
    visibility: product.status === "published" ? 4 : 1,
    type_id: magentoProductType(product),
    weight: product.delivery.weight ?? undefined,
    extension_attributes: {
      stock_item: {
        qty: Math.max(0, Math.round(product.inventory.quantity)),
        is_in_stock: product.inventory.inStock,
        manage_stock: product.inventory.policy !== "continue",
      },
    },
    custom_attributes: [
      { attribute_code: "description", value: product.description || product.seoTitle || product.title },
      { attribute_code: "short_description", value: product.seoTitle || product.title },
      { attribute_code: "url_key", value: product.slug },
      { attribute_code: "meta_title", value: product.seoTitle || product.title },
      { attribute_code: "backy_product_id", value: product.id },
      { attribute_code: "backy_product_slug", value: product.slug },
      { attribute_code: "backy_request_id", value: requestId },
      { attribute_code: "backy_subscription", value: JSON.stringify(product.subscription) },
    ],
  },
  saveOptions: true,
});

const safeMagentoProductPayload = (payload: Record<string, unknown>) => {
  const product = Object.keys(jsonRecord(payload.product)).length
    ? jsonRecord(payload.product)
    : payload;
  return {
    id: textValue(product.id) || textValue(product.sku),
    object: textValue(product.type_id) || "magento-product",
    active: typeof product.status === "number" ? product.status === 1 : null,
    status: typeof product.status === "number" ? String(product.status) : textValue(product.status),
    name: textValue(product.name),
    url: textValue(product.url_key) || textValue(product.sku),
  };
};

const safeMagentoPricePayload = (
  payload: Record<string, unknown>,
  product: CommerceProduct,
) => {
  const magentoProduct = Object.keys(jsonRecord(payload.product)).length
    ? jsonRecord(payload.product)
    : payload;
  return {
    id: textValue(magentoProduct.sku) || textValue(magentoProduct.id) || null,
    object: "magento-price",
    active:
      typeof magentoProduct.status === "number"
        ? magentoProduct.status === 1
        : null,
    currency: product.currency.toLowerCase(),
    unitAmount: centsValue(Number(magentoProduct.price ?? product.price)),
    recurring: product.subscription.enabled
      ? {
          interval: product.subscription.interval,
          trialDays: product.subscription.trialDays,
        }
      : null,
  };
};

const safeMagentoErrorPayload = (value: Record<string, unknown>) => ({
  type: "magento-api",
  code: textValue(value.code) || textValue(value.status),
  message:
    textValue(value.message) ||
    textValue(value.error) ||
    "Magento product sync failed.",
});

const executeMagentoProductSync = async ({
  product,
  requestId,
  settings,
}: {
  product: CommerceProduct;
  requestId: string;
  settings: unknown;
}) => {
  const url = magentoApiUrl("products");
  if (!magentoAccessToken() || !url) {
    return buildHandoffSync({
      product,
      requestId,
      provider: "magento",
      reason:
        "BACKY_MAGENTO_ACCESS_TOKEN/MAGENTO_ACCESS_TOKEN plus BACKY_MAGENTO_STORE_URL/MAGENTO_STORE_URL or BACKY_MAGENTO_API_BASE_URL is not configured.",
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${magentoAccessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildMagentoProductPayload(product, requestId, settings)),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    return {
      ...buildHandoffSync({
        product,
        requestId,
        provider: "magento",
        reason: "Magento product creation failed.",
      }),
      status: "failed" as ProviderSyncStatus,
      executionMode: "magento-api",
      error: safeMagentoErrorPayload(payload),
    };
  }

  return {
    provider: "magento",
    status: "synced" as ProviderSyncStatus,
    executionMode: "magento-api",
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeMagentoProductPayload(payload),
    price: safeMagentoPricePayload(payload, product),
  };
};

const executeProductProviderSync = async ({
  siteId,
  product,
  requestId,
  settings,
  provider,
}: {
  siteId: string;
  product: CommerceProduct;
  requestId: string;
  settings: unknown;
  provider: ProductSyncProvider;
}) => {
  if (provider === "http") {
    return executeHttpProductSync({ siteId, product, requestId, settings });
  }
  if (provider === "paddle") {
    return executePaddleProductSync({ product, requestId, settings });
  }
  if (provider === "square") {
    return executeSquareProductSync({ product, requestId });
  }
  if (provider === "paypal") {
    return executePaypalProductSync({ product, requestId });
  }
  if (provider === "shopify") {
    return executeShopifyProductSync({ product, requestId });
  }
  if (provider === "bigcommerce") {
    return executeBigCommerceProductSync({ product, requestId });
  }
  if (provider === "woocommerce") {
    return executeWooCommerceProductSync({ product, requestId });
  }
  if (provider === "etsy") {
    return executeEtsyProductSync({ product, requestId, settings });
  }
  if (provider === "magento") {
    return executeMagentoProductSync({ product, requestId, settings });
  }
  return executeStripeProductSync({
    product,
    requestId,
    accountId: providerAccountId(settings),
  });
};

const sourceRecordFromRecord = (record: {
  id: string;
  slug: string;
  status: CommerceSourceRecord["status"];
  values: Record<string, unknown>;
  updatedAt: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}): CommerceSourceRecord => ({
  id: record.id,
  slug: record.slug,
  status: record.status,
  values: record.values,
  updatedAt: record.updatedAt,
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

const commerceProductWebhookSnapshot = (
  product: CommerceProduct,
): BackyJsonObject => ({
  productId: product.id,
  slug: product.slug,
  title: product.title,
  sku: product.sku,
  status: product.status,
  price: product.price,
  currency: product.currency,
  inventoryQuantity: product.inventory.quantity,
  subscriptionEnabled: product.subscription.enabled,
  subscriptionInterval: product.subscription.interval,
  updatedAt: product.updatedAt,
});

const commerceProductRecordWebhookSnapshot = (record: {
  id: string;
  slug: string;
  status: string;
  values: Record<string, unknown>;
  updatedAt?: string | null;
}): BackyJsonObject => {
  const product = productRecordToCommerceProduct(
    sourceRecordFromRecord(
      record as Parameters<typeof sourceRecordFromRecord>[0],
    ),
  );

  return {
    recordId: record.id,
    slug: record.slug,
    status: record.status,
    valueKeys: Object.keys(record.values || {}).sort(),
    updatedAt: record.updatedAt || null,
    product: commerceProductWebhookSnapshot(product),
  };
};

const providerSyncWebhookSnapshot = (sync: unknown): BackyJsonObject => {
  const source = jsonRecord(sync);
  const product = jsonRecord(source.product);
  const price = jsonRecord(source.price);
  const error = jsonRecord(source.error);

  return {
    provider: textValue(source.provider),
    status: textValue(source.status),
    executionMode: textValue(source.executionMode),
    syncedAt: textValue(source.syncedAt),
    requestId: textValue(source.requestId),
    providerProductId: textValue(product.id),
    providerPriceId: textValue(price.id),
    errorCode: textValue(error.code),
    errorMessage: textValue(error.message),
  };
};

const deliverCommerceProductProviderSyncWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: Parameters<typeof commerceProductRecordWebhookSnapshot>[0];
  after: Parameters<typeof commerceProductRecordWebhookSnapshot>[0];
  sync: unknown;
  requestedProvider: string;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "commerce.product.provider_sync",
    data: {
      resourceType: "collectionRecord",
      before: commerceProductRecordWebhookSnapshot(params.before),
      after: commerceProductRecordWebhookSnapshot(params.after),
      sync: providerSyncWebhookSnapshot(params.sync),
    },
    metadata: {
      action: "commerce.product.provider_sync",
      changedKeys: ["content", "collections", "commerce"],
      source: "admin-commerce-product-provider-sync-api",
      resourceType: "collectionRecord",
      resourceId: params.after.id,
      productId: params.after.id,
      slug: params.after.slug,
      status: params.after.status,
      requestedProvider: params.requestedProvider,
      provider: textValue(jsonRecord(params.sync).provider),
      syncStatus: textValue(jsonRecord(params.sync).status),
      executionMode: textValue(jsonRecord(params.sync).executionMode),
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "commerce.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, productId } = await params;
    const body = await parseJsonBody(request);
    const requestedProvider = textValue(body.provider).toLowerCase() || "auto";

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

      const collection = await repositories.collections.getBySlug(
        site.id,
        PRODUCT_COLLECTION_SLUG,
      );
      if (!collection) {
        return errorResponse(
          404,
          "PRODUCT_CATALOG_NOT_FOUND",
          "Product catalog not found",
          requestId,
        );
      }

      const record =
        (await repositories.collections.getRecordById(
          site.id,
          collection.id,
          productId,
        )) ||
        (await repositories.collections.getRecordBySlug(
          site.id,
          collection.id,
          productId,
        ));
      if (!record) {
        return errorResponse(
          404,
          "PRODUCT_NOT_FOUND",
          "Product not found",
          requestId,
        );
      }

      const settings = await repositories.settings.get();
      const provider = resolveProductSyncProvider(requestedProvider, settings);
      if (!provider) {
        return errorResponse(
          400,
          "UNSUPPORTED_PROVIDER",
          "Supported product sync providers are stripe, paypal, paddle, square, shopify, bigcommerce, woocommerce, etsy, magento, http, generic-http, custom-http, or auto.",
          requestId,
          { provider: requestedProvider },
        );
      }
      const product = productRecordToCommerceProduct(
        sourceRecordFromRecord(record),
      );
      const sync = await executeProductProviderSync({
        siteId: site.id,
        product,
        requestId,
        settings,
        provider,
      });
      const updated = (
        await repositories.collections.updateRecord(
          site.id,
          collection.id,
          record.id,
          {
            values: toJsonRecord({
              ...record.values,
              [PROVIDER_SYNC_FIELD]: sync,
            }),
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
          reason: "commerce-product-provider-sync",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "collectionRecord",
        entityId: updated.id,
        action: "commerce.product.provider_sync",
        before: record,
        after: updated,
        metadata: {
          provider: sync.provider,
          status: sync.status,
          executionMode: sync.executionMode,
          productId: sync.product?.id || null,
          priceId: sync.price?.id || null,
        },
        requestId,
      });
      await deliverCommerceProductProviderSyncWebhook({
        repositories,
        site,
        before: record,
        after: updated,
        sync,
        requestedProvider,
        requestId,
        actor: access.session?.user.id,
      });

      return productSyncResponse(
        {
          success: true,
          requestId,
          schemaVersion: PROVIDER_SYNC_SCHEMA_VERSION,
          data: {
            sync,
            product: updated,
            cacheInvalidation,
          },
          sync,
          product: updated,
        },
        requestId,
        site.id,
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }
    const collection = getCollectionByIdOrSlug(
      site.id,
      PRODUCT_COLLECTION_SLUG,
      { includeUnpublished: true },
    );
    if (!collection) {
      return errorResponse(
        404,
        "PRODUCT_CATALOG_NOT_FOUND",
        "Product catalog not found",
        requestId,
      );
    }
    const record = getCollectionRecordByIdOrSlug(
      site.id,
      collection.id,
      productId,
      { includeUnpublished: true },
    );
    if (!record) {
      return errorResponse(
        404,
        "PRODUCT_NOT_FOUND",
        "Product not found",
        requestId,
      );
    }

    const product = productRecordToCommerceProduct(
      sourceRecordFromRecord(record),
    );
    const settings = getAdminSettings();
    const provider = resolveProductSyncProvider(requestedProvider, settings);
    if (!provider) {
      return errorResponse(
        400,
        "UNSUPPORTED_PROVIDER",
        "Supported product sync providers are stripe, paypal, paddle, square, shopify, bigcommerce, woocommerce, etsy, magento, http, generic-http, custom-http, or auto.",
        requestId,
        { provider: requestedProvider },
      );
    }
    const sync = await executeProductProviderSync({
      siteId: site.id,
      product,
      requestId,
      settings,
      provider,
    });
    const updated = updateAdminCollectionRecord(
      site.id,
      collection.id,
      record.id,
      {
        values: {
          ...record.values,
          [PROVIDER_SYNC_FIELD]: sync,
        },
      },
    );
    if (!updated) {
      return errorResponse(
        500,
        "PRODUCT_SYNC_NOT_PERSISTED",
        "Product provider sync could not be persisted.",
        requestId,
      );
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: "collectionRecord",
      entityId: updated.id,
      action: "commerce.product.provider_sync",
      before: record,
      after: updated,
      metadata: {
        provider: sync.provider,
        status: sync.status,
        executionMode: sync.executionMode,
        productId: sync.product?.id || null,
        priceId: sync.price?.id || null,
      },
      requestId,
    });
    await deliverCommerceProductProviderSyncWebhook({
      site: site as unknown as Site,
      before: record,
      after: updated,
      sync,
      requestedProvider,
      requestId,
      actor: access.session?.user.id,
    });

    return productSyncResponse(
      {
        success: true,
        requestId,
        schemaVersion: PROVIDER_SYNC_SCHEMA_VERSION,
        data: {
          sync,
          product: updated,
        },
        sync,
        product: updated,
      },
      requestId,
      site.id,
    );
  } catch (error) {
    console.error("Admin commerce product provider sync API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
