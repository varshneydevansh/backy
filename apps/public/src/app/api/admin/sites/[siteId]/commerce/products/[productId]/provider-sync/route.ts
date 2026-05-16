import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonValue } from '@backy-cms/core';
import { PRODUCT_COLLECTION_SLUG, productRecordToCommerceProduct, type CommerceProduct, type CommerceSourceRecord } from '@/lib/commerceCatalog';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminSettings, getCollectionByIdOrSlug, getCollectionRecordByIdOrSlug, getSiteByIdOrSlug, updateAdminCollectionRecord } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    productId: string;
  }>;
}

type ProviderSyncStatus = 'handoff' | 'synced' | 'failed';
type ProductSyncProvider = 'stripe' | 'http' | 'paddle' | 'square';

const PROVIDER_SYNC_FIELD = 'providersync';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => NextResponse.json(
  { success: false, requestId, error: { code, message, details } },
  { status },
);

const envValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const stripeSecretKey = () => envValue(['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY']);

const paddleApiKey = () => envValue(['BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY']);

const squareAccessToken = () => envValue(['BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN']);

const productSyncToken = () => envValue(['BACKY_COMMERCE_PRODUCT_SYNC_TOKEN', 'COMMERCE_PRODUCT_SYNC_TOKEN']);

const jsonRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const settingsCommerce = (settings: unknown): Record<string, unknown> => {
  const root = jsonRecord(settings);
  const integrations = jsonRecord(root.integrations);
  return jsonRecord(integrations.commerce);
};

const configuredHttpCatalogSyncUrl = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return envValue(['BACKY_COMMERCE_PRODUCT_SYNC_URL', 'COMMERCE_PRODUCT_SYNC_URL'])
    || textValue(commerce.catalogSyncProviderUrl)
    || textValue(commerce.productSyncProviderUrl)
    || textValue(commerce.providerCatalogSyncUrl);
};

const configuredProductSyncProvider = (settings: unknown): ProductSyncProvider | null => {
  const commerce = settingsCommerce(settings);
  const configured = (
    envValue(['BACKY_COMMERCE_PRODUCT_SYNC_PROVIDER', 'COMMERCE_PRODUCT_SYNC_PROVIDER'])
    || textValue(commerce.catalogSyncProvider)
    || textValue(commerce.productSyncProvider)
    || textValue(commerce.providerCatalogSyncProvider)
  ).toLowerCase();

  if (configured === 'stripe') return 'stripe';
  if (configured === 'paddle') return 'paddle';
  if (configured === 'square') return 'square';
  if (['http', 'generic-http', 'custom-http'].includes(configured)) return 'http';
  if (configuredHttpCatalogSyncUrl(settings)) return 'http';
  return null;
};

const resolveProductSyncProvider = (provider: string, settings: unknown): ProductSyncProvider | null => {
  if (!provider || provider === 'auto') {
    return configuredProductSyncProvider(settings) || 'stripe';
  }
  if (provider === 'stripe') return 'stripe';
  if (provider === 'paddle') return 'paddle';
  if (provider === 'square') return 'square';
  if (['http', 'generic-http', 'custom-http'].includes(provider)) return 'http';
  return null;
};

const stripeApiUrl = (path: string) => {
  const baseUrl = envValue(['BACKY_STRIPE_API_BASE_URL', 'STRIPE_API_BASE_URL']) || 'https://api.stripe.com';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), normalizedBase).toString();
};

const stripeHeaders = (accountId?: string | null) => ({
  authorization: `Bearer ${stripeSecretKey()}`,
  'content-type': 'application/x-www-form-urlencoded',
  ...(accountId ? { 'stripe-account': accountId } : {}),
  ...(envValue(['BACKY_STRIPE_API_VERSION', 'STRIPE_API_VERSION'])
    ? { 'stripe-version': envValue(['BACKY_STRIPE_API_VERSION', 'STRIPE_API_VERSION']) }
    : {}),
});

const paddleApiUrl = (path: string) => {
  const baseUrl = envValue(['BACKY_PADDLE_API_BASE_URL', 'PADDLE_API_BASE_URL']) || 'https://api.paddle.com';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), normalizedBase).toString();
};

const paddleHeaders = () => ({
  authorization: `Bearer ${paddleApiKey()}`,
  'content-type': 'application/json',
});

const squareApiUrl = (path: string) => {
  const baseUrl = envValue(['BACKY_SQUARE_API_BASE_URL', 'SQUARE_API_BASE_URL']) || 'https://connect.squareup.com';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), normalizedBase).toString();
};

const squareVersion = () => envValue(['BACKY_SQUARE_VERSION', 'SQUARE_VERSION']) || '2026-01-22';

const squareHeaders = () => ({
  authorization: `Bearer ${squareAccessToken()}`,
  'content-type': 'application/json',
  'square-version': squareVersion(),
});

const centsValue = (value: number) => (
  Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100))
);

const providerAccountId = (settings: unknown): string | null => {
  const root = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
  const integrations = root.integrations && typeof root.integrations === 'object' && !Array.isArray(root.integrations)
    ? root.integrations as Record<string, unknown>
    : {};
  const commerce = integrations.commerce && typeof integrations.commerce === 'object' && !Array.isArray(integrations.commerce)
    ? integrations.commerce as Record<string, unknown>
    : {};
  return textValue(commerce.providerAccountId) || null;
};

const buildHandoffSync = ({
  product,
  requestId,
  reason,
  provider = 'stripe',
}: {
  product: CommerceProduct;
  requestId: string;
  reason: string;
  provider?: ProductSyncProvider;
}) => ({
  provider,
  status: 'handoff' as ProviderSyncStatus,
  executionMode: 'handoff',
  syncedAt: new Date().toISOString(),
  requestId,
  reason,
  product: {
    id: null,
    name: product.title,
    active: product.status === 'published',
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
  id: textValue(value.id) || textValue(value.productId) || textValue(value.externalId) || textValue(value.reference),
  object: textValue(value.object) || textValue(value.type),
  active: typeof value.active === 'boolean' ? value.active : null,
  url: textValue(value.url) || textValue(value.productUrl),
});

const safeHttpErrorPayload = (value: Record<string, unknown>) => {
  const error = jsonRecord(value.error);
  const source = Object.keys(error).length ? error : value;
  return {
    type: textValue(source.type) || 'http-provider',
    code: textValue(source.code) || textValue(source.status),
    message: textValue(source.message) || textValue(source.error) || 'HTTP product catalog sync failed.',
  };
};

const safeHttpProviderResponse = (value: Record<string, unknown>) => ({
  id: textValue(value.id) || textValue(value.productId) || textValue(value.externalId) || textValue(value.reference),
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
  schemaVersion: 'backy.commerce-product-sync.v1',
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
      provider: 'http',
      reason: 'BACKY_COMMERCE_PRODUCT_SYNC_URL or Settings commerce catalog sync provider URL is not configured.',
    });
  }

  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    return {
      ...buildHandoffSync({ product, requestId, provider: 'http', reason: 'Configured HTTP product sync URL is invalid.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'http-api',
      error: {
        type: 'configuration',
        code: 'INVALID_URL',
        message: 'Configured HTTP product sync URL is invalid.',
      },
    };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return {
      ...buildHandoffSync({ product, requestId, provider: 'http', reason: 'Configured HTTP product sync URL must use http or https.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'http-api',
      error: {
        type: 'configuration',
        code: 'UNSUPPORTED_PROTOCOL',
        message: 'Configured HTTP product sync URL must use http or https.',
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-backy-request-id': requestId,
        'x-backy-provider-kind': 'product-catalog',
        ...(productSyncToken() ? { authorization: `Bearer ${productSyncToken()}` } : {}),
      },
      body: JSON.stringify(buildHttpCatalogPayload({ siteId, product, requestId })),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ...buildHandoffSync({ product, requestId, provider: 'http', reason: 'HTTP product catalog sync failed.' }),
        status: 'failed' as ProviderSyncStatus,
        executionMode: 'http-api',
        error: safeHttpErrorPayload(payload),
      };
    }

    const productPayload = jsonRecord(payload.product);
    const pricePayload = jsonRecord(payload.price);
    const providerProduct = Object.keys(productPayload).length ? productPayload : payload;
    return {
      provider: 'http',
      status: 'synced' as ProviderSyncStatus,
      executionMode: 'http-api',
      syncedAt: new Date().toISOString(),
      requestId,
      product: {
        ...safeHttpPayload(providerProduct),
        name: textValue(providerProduct.name) || product.title,
      },
      price: {
        ...safeHttpPayload(pricePayload),
        id: textValue(pricePayload.id) || textValue(payload.priceId),
        currency: textValue(pricePayload.currency) || product.currency.toLowerCase(),
        unitAmount: typeof pricePayload.unitAmount === 'number'
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
      ...buildHandoffSync({ product, requestId, provider: 'http', reason: 'HTTP product catalog sync request failed.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'http-api',
      error: {
        type: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
        code: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'HTTP product catalog sync request failed.',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const safeStripePayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  active: typeof value.active === 'boolean' ? value.active : null,
  livemode: typeof value.livemode === 'boolean' ? value.livemode : null,
  url: textValue(value.url),
});

const safeStripeErrorPayload = (value: Record<string, unknown>) => {
  const error = value.error && typeof value.error === 'object' && !Array.isArray(value.error)
    ? value.error as Record<string, unknown>
    : value;

  return {
    type: textValue(error.type),
    code: textValue(error.code),
    message: textValue(error.message) || 'Stripe product sync failed.',
  };
};

const stripeRecurringForInterval = (interval: CommerceProduct['subscription']['interval']) => {
  if (interval === 'weekly') return { interval: 'week' };
  if (interval === 'quarterly') return { interval: 'month', intervalCount: 3 };
  if (interval === 'yearly') return { interval: 'year' };
  return { interval: 'month' };
};

const buildStripeProductForm = (product: CommerceProduct, requestId: string) => {
  const form = new URLSearchParams();
  form.set('name', product.title);
  form.set('active', product.status === 'archived' ? 'false' : 'true');
  if (product.description) form.set('description', product.description.slice(0, 500));
  if (product.imageUrl) form.append('images[]', product.imageUrl);
  form.set('metadata[backyProductId]', product.id);
  form.set('metadata[backyProductSlug]', product.slug);
  form.set('metadata[backySku]', product.sku);
  form.set('metadata[requestId]', requestId);
  return form;
};

const buildStripePriceForm = (product: CommerceProduct, stripeProductId: string, requestId: string) => {
  const form = new URLSearchParams();
  form.set('product', stripeProductId);
  form.set('currency', product.currency.toLowerCase());
  form.set('unit_amount', String(centsValue(product.price)));
  form.set('metadata[backyProductId]', product.id);
  form.set('metadata[backyProductSlug]', product.slug);
  form.set('metadata[backySku]', product.sku);
  form.set('metadata[requestId]', requestId);
  if (product.subscription.enabled) {
    const recurring = stripeRecurringForInterval(product.subscription.interval);
    form.set('recurring[interval]', recurring.interval);
    if ('intervalCount' in recurring) {
      form.set('recurring[interval_count]', String(recurring.intervalCount));
    }
  }
  return form;
};

const callStripe = async (path: string, form: URLSearchParams, accountId: string | null) => {
  const response = await fetch(stripeApiUrl(path), {
    method: 'POST',
    headers: stripeHeaders(accountId),
    body: form.toString(),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
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
      reason: 'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY is not configured.',
    });
  }

  const createdProduct = await callStripe('v1/products', buildStripeProductForm(product, requestId), accountId);
  if (!createdProduct.response.ok) {
    return {
      ...buildHandoffSync({ product, requestId, reason: 'Stripe product creation failed.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'stripe-api',
      error: safeStripeErrorPayload(createdProduct.payload),
    };
  }

  const productId = textValue(createdProduct.payload.id);
  const createdPrice = productId
    ? await callStripe('v1/prices', buildStripePriceForm(product, productId, requestId), accountId)
    : null;
  if (!createdPrice || !createdPrice.response.ok) {
    return {
      ...buildHandoffSync({ product, requestId, reason: 'Stripe price creation failed.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'stripe-api',
      product: safeStripePayload(createdProduct.payload),
      error: safeStripeErrorPayload(createdPrice?.payload || { message: 'Stripe product id was missing.' }),
    };
  }

  return {
    provider: 'stripe',
    status: 'synced' as ProviderSyncStatus,
    executionMode: 'stripe-api',
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
    object: textValue(value.object) || textValue(value.type) || 'product',
    active: textValue(value.status) ? textValue(value.status) !== 'archived' : null,
    status: textValue(value.status),
    name: textValue(value.name),
    url: textValue(value.url),
  };
};

const safePaddlePricePayload = (payload: Record<string, unknown>, product: CommerceProduct) => {
  const value = safePaddleData(payload);
  const unitPrice = jsonRecord(value.unit_price);
  const billingCycle = jsonRecord(value.billing_cycle);
  const trialPeriod = jsonRecord(value.trial_period);
  return {
    id: textValue(value.id),
    object: textValue(value.object) || textValue(value.type) || 'price',
    active: textValue(value.status) ? textValue(value.status) !== 'archived' : null,
    status: textValue(value.status),
    currency: textValue(unitPrice.currency_code).toLowerCase() || product.currency.toLowerCase(),
    unitAmount: Number(textValue(unitPrice.amount) || centsValue(product.price)),
    recurring: Object.keys(billingCycle).length || product.subscription.enabled
      ? {
        interval: textValue(billingCycle.interval) || product.subscription.interval,
        trialDays: Number(textValue(trialPeriod.frequency) || product.subscription.trialDays || 0),
      }
      : null,
  };
};

const safePaddleErrorPayload = (value: Record<string, unknown>) => {
  const error = jsonRecord(value.error);
  const source = Object.keys(error).length ? error : value;
  return {
    type: textValue(source.type) || 'paddle-api',
    code: textValue(source.code) || textValue(source.status),
    message: textValue(source.detail) || textValue(source.message) || textValue(source.error) || 'Paddle product sync failed.',
  };
};

const paddleTaxCategory = (settings: unknown): string => {
  const commerce = settingsCommerce(settings);
  return textValue(commerce.paddleTaxCategory)
    || textValue(commerce.productPaddleTaxCategory)
    || textValue(commerce.catalogSyncPaddleTaxCategory)
    || 'standard';
};

const paddleBillingCycleForInterval = (interval: CommerceProduct['subscription']['interval']) => {
  if (interval === 'weekly') return { interval: 'week', frequency: 1 };
  if (interval === 'quarterly') return { interval: 'month', frequency: 3 };
  if (interval === 'yearly') return { interval: 'year', frequency: 1 };
  return { interval: 'month', frequency: 1 };
};

const buildPaddleProductPayload = (product: CommerceProduct, requestId: string, settings: unknown) => ({
  name: product.title,
  description: product.description ? product.description.slice(0, 1000) : undefined,
  tax_category: paddleTaxCategory(settings),
  image_url: product.imageUrl || undefined,
  custom_data: {
    backyProductId: product.id,
    backyProductSlug: product.slug,
    backySku: product.sku,
    requestId,
  },
});

const buildPaddlePricePayload = (product: CommerceProduct, paddleProductId: string, requestId: string) => ({
  product_id: paddleProductId,
  description: product.title,
  unit_price: {
    amount: String(centsValue(product.price)),
    currency_code: product.currency.toUpperCase(),
  },
  ...(product.subscription.enabled
    ? {
      billing_cycle: paddleBillingCycleForInterval(product.subscription.interval),
      ...(product.subscription.trialDays > 0
        ? { trial_period: { interval: 'day', frequency: product.subscription.trialDays } }
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
    method: 'POST',
    headers: paddleHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
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
      provider: 'paddle',
      reason: 'BACKY_PADDLE_API_KEY or PADDLE_API_KEY is not configured.',
    });
  }

  const createdProduct = await callPaddle('products', buildPaddleProductPayload(product, requestId, settings));
  if (!createdProduct.response.ok) {
    return {
      ...buildHandoffSync({ product, requestId, provider: 'paddle', reason: 'Paddle product creation failed.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'paddle-api',
      error: safePaddleErrorPayload(createdProduct.payload),
    };
  }

  const productId = textValue(safePaddleData(createdProduct.payload).id);
  const createdPrice = productId
    ? await callPaddle('prices', buildPaddlePricePayload(product, productId, requestId))
    : null;
  if (!createdPrice || !createdPrice.response.ok) {
    return {
      ...buildHandoffSync({ product, requestId, provider: 'paddle', reason: 'Paddle price creation failed.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'paddle-api',
      product: safePaddleProductPayload(createdProduct.payload),
      error: safePaddleErrorPayload(createdPrice?.payload || { message: 'Paddle product id was missing.' }),
    };
  }

  return {
    provider: 'paddle',
    status: 'synced' as ProviderSyncStatus,
    executionMode: 'paddle-api',
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

const safeSquareVariationObject = (value: Record<string, unknown>): Record<string, unknown> => {
  const itemData = jsonRecord(value.item_data);
  const variations = Array.isArray(itemData.variations) ? itemData.variations : [];
  const firstVariation = variations.find((variation) => jsonRecord(variation).type === 'ITEM_VARIATION') || variations[0];
  return jsonRecord(firstVariation);
};

const safeSquareProductPayload = (payload: Record<string, unknown>) => {
  const value = safeSquareCatalogObject(payload);
  const itemData = jsonRecord(value.item_data);
  return {
    id: textValue(value.id),
    object: textValue(value.type) || 'ITEM',
    active: typeof value.is_deleted === 'boolean' ? !value.is_deleted : null,
    name: textValue(itemData.name),
  };
};

const safeSquarePricePayload = (payload: Record<string, unknown>, product: CommerceProduct) => {
  const value = safeSquareCatalogObject(payload);
  const variation = safeSquareVariationObject(value);
  const variationData = jsonRecord(variation.item_variation_data);
  const priceMoney = jsonRecord(variationData.price_money);
  return {
    id: textValue(variation.id),
    object: textValue(variation.type) || 'ITEM_VARIATION',
    active: typeof variation.is_deleted === 'boolean' ? !variation.is_deleted : null,
    currency: textValue(priceMoney.currency).toLowerCase() || product.currency.toLowerCase(),
    unitAmount: typeof priceMoney.amount === 'number' ? priceMoney.amount : centsValue(product.price),
    recurring: product.subscription.enabled
      ? {
        interval: product.subscription.interval,
        trialDays: product.subscription.trialDays,
      }
      : null,
  };
};

const safeSquareErrorPayload = (value: Record<string, unknown>) => {
  const errors = Array.isArray(value.errors) ? value.errors.map((error) => jsonRecord(error)) : [];
  const firstError = errors[0] || jsonRecord(value.error) || value;
  return {
    type: textValue(firstError.category) || textValue(firstError.type) || 'square-api',
    code: textValue(firstError.code) || textValue(firstError.status),
    message: textValue(firstError.detail) || textValue(firstError.message) || 'Square catalog sync failed.',
  };
};

const squareTemporaryId = (prefix: string, product: CommerceProduct, requestId: string) => (
  `#${prefix}_${product.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${requestId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
);

const buildSquareCatalogPayload = (product: CommerceProduct, requestId: string) => {
  const itemId = squareTemporaryId('backy_item', product, requestId);
  const variationId = squareTemporaryId('backy_variation', product, requestId);
  return {
    idempotency_key: requestId,
    object: {
      type: 'ITEM',
      id: itemId,
      present_at_all_locations: true,
      item_data: {
        name: product.title,
        description: product.description ? product.description.slice(0, 1000) : undefined,
        abbreviation: product.sku ? product.sku.slice(0, 5).toUpperCase() : undefined,
        variations: [
          {
            type: 'ITEM_VARIATION',
            id: variationId,
            present_at_all_locations: true,
            item_variation_data: {
              item_id: itemId,
              name: product.sku || 'Default',
              sku: product.sku,
              pricing_type: 'FIXED_PRICING',
              price_money: {
                amount: centsValue(product.price),
                currency: product.currency.toUpperCase(),
              },
              track_inventory: product.inventory.policy !== 'continue',
            },
          },
        ],
      },
    },
  };
};

const callSquare = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(squareApiUrl(path), {
    method: 'POST',
    headers: squareHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
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
      provider: 'square',
      reason: 'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN is not configured.',
    });
  }

  const createdCatalogObject = await callSquare('v2/catalog/object', buildSquareCatalogPayload(product, requestId));
  if (!createdCatalogObject.response.ok) {
    return {
      ...buildHandoffSync({ product, requestId, provider: 'square', reason: 'Square catalog object upsert failed.' }),
      status: 'failed' as ProviderSyncStatus,
      executionMode: 'square-api',
      error: safeSquareErrorPayload(createdCatalogObject.payload),
    };
  }

  return {
    provider: 'square',
    status: 'synced' as ProviderSyncStatus,
    executionMode: 'square-api',
    syncedAt: new Date().toISOString(),
    requestId,
    product: safeSquareProductPayload(createdCatalogObject.payload),
    price: safeSquarePricePayload(createdCatalogObject.payload, product),
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
  if (provider === 'http') {
    return executeHttpProductSync({ siteId, product, requestId, settings });
  }
  if (provider === 'paddle') {
    return executePaddleProductSync({ product, requestId, settings });
  }
  if (provider === 'square') {
    return executeSquareProductSync({ product, requestId });
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
  status: CommerceSourceRecord['status'];
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, productId } = await params;
    const body = await parseJsonBody(request);
    const requestedProvider = textValue(body.provider).toLowerCase() || 'auto';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG);
      if (!collection) {
        return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
      }

      const record = await repositories.collections.getRecordById(site.id, collection.id, productId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, productId);
      if (!record) {
        return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);
      }

      const settings = await repositories.settings.get();
      const provider = resolveProductSyncProvider(requestedProvider, settings);
      if (!provider) {
        return errorResponse(400, 'UNSUPPORTED_PROVIDER', 'Supported product sync providers are stripe, paddle, square, http, generic-http, custom-http, or auto.', requestId, { provider: requestedProvider });
      }
      const product = productRecordToCommerceProduct(sourceRecordFromRecord(record));
      const sync = await executeProductProviderSync({
        siteId: site.id,
        product,
        requestId,
        settings,
        provider,
      });
      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord({
          ...record.values,
          [PROVIDER_SYNC_FIELD]: sync,
        }),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'commerce-product-provider-sync',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collectionRecord',
        entityId: updated.id,
        action: 'commerce.product.provider_sync',
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

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sync,
          product: updated,
          cacheInvalidation,
        },
        sync,
        product: updated,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }
    const collection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
    }
    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, productId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);
    }

    const product = productRecordToCommerceProduct(sourceRecordFromRecord(record));
    const settings = getAdminSettings();
    const provider = resolveProductSyncProvider(requestedProvider, settings);
    if (!provider) {
      return errorResponse(400, 'UNSUPPORTED_PROVIDER', 'Supported product sync providers are stripe, paddle, square, http, generic-http, custom-http, or auto.', requestId, { provider: requestedProvider });
    }
    const sync = await executeProductProviderSync({
      siteId: site.id,
      product,
      requestId,
      settings,
      provider,
    });
    const updated = updateAdminCollectionRecord(site.id, collection.id, record.id, {
      values: {
        ...record.values,
        [PROVIDER_SYNC_FIELD]: sync,
      },
    });
    if (!updated) {
      return errorResponse(500, 'PRODUCT_SYNC_NOT_PERSISTED', 'Product provider sync could not be persisted.', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: updated.id,
      action: 'commerce.product.provider_sync',
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

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sync,
        product: updated,
      },
      sync,
      product: updated,
    });
  } catch (error) {
    console.error('Admin commerce product provider sync API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
