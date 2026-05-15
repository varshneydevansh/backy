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
}: {
  product: CommerceProduct;
  requestId: string;
  reason: string;
}) => ({
  provider: 'stripe',
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
    const requestedProvider = textValue(body.provider).toLowerCase() || 'stripe';
    if (requestedProvider !== 'stripe') {
      return errorResponse(400, 'UNSUPPORTED_PROVIDER', 'Only Stripe product sync is supported right now.', requestId, { provider: requestedProvider });
    }

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
      const product = productRecordToCommerceProduct(sourceRecordFromRecord(record));
      const sync = await executeStripeProductSync({
        product,
        requestId,
        accountId: providerAccountId(settings),
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
    const sync = await executeStripeProductSync({
      product,
      requestId,
      accountId: providerAccountId(getAdminSettings()),
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
