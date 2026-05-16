import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { PRODUCT_COLLECTION_SLUG, productRecordToCommerceProduct, type CommerceSourceRecord } from '@/lib/commerceCatalog';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { getCollectionByIdOrSlug, getCollectionRecordByIdOrSlug, getSiteByIdOrSlug, listCollectionRecords } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    productId: string;
  }>;
}

interface SourceRecord {
  id: string;
  slug: string;
  status: CommerceSourceRecord['status'];
  values: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const SCHEMA_VERSION = 'backy.product-subscription-lifecycle.v1';
const ORDER_LIMIT = 1000;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const numberValue = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeCurrency = (value: unknown): string => {
  const currency = textValue(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
};

const parseItems = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => (
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    ));
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseItems(parsed);
    } catch {
      return [];
    }
  }
  return [];
};

const sourceRecordFromRecord = (record: SourceRecord): CommerceSourceRecord => ({
  id: record.id,
  slug: record.slug,
  status: record.status,
  values: record.values,
  updatedAt: record.updatedAt || '',
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

const itemMatchesProduct = (item: Record<string, unknown>, product: { id: string; slug: string; sku: string; title: string }) => {
  const candidates = [
    item.productId,
    item.productid,
    item.id,
    item.slug,
    item.productSlug,
    item.productslug,
    item.sku,
    item.title,
  ].map((value) => textValue(value).toLowerCase()).filter(Boolean);
  const productKeys = [product.id, product.slug, product.sku, product.title]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  return candidates.some((candidate) => productKeys.includes(candidate));
};

const isSubscriptionOrder = (items: Array<Record<string, unknown>>, values: Record<string, unknown>) => {
  const notes = textValue(values.notes).toLowerCase();
  const reference = textValue(values.paymentreference);
  return (
    reference.startsWith('sub_') ||
    notes.includes('customer.subscription.') ||
    notes.includes('invoice.payment_') ||
    items.some((item) => {
      const subscription = item.subscription;
      return Boolean(
        subscription &&
        typeof subscription === 'object' &&
        !Array.isArray(subscription) &&
        (subscription as Record<string, unknown>).enabled === true
      );
    })
  );
};

const lifecycleStatus = (values: Record<string, unknown>): 'active' | 'renewal' | 'dunning' | 'paused' | 'trial_will_end' | 'cancelled' | 'pending' => {
  const notes = textValue(values.notes).toLowerCase();
  const paymentStatus = textValue(values.paymentstatus).toLowerCase();
  const fulfillmentStatus = textValue(values.fulfillmentstatus).toLowerCase();
  const orderStatus = textValue(values.orderstatus).toLowerCase();

  if (notes.includes('customer.subscription.deleted') || fulfillmentStatus === 'cancelled' || orderStatus === 'cancelled') return 'cancelled';
  if (notes.includes('customer.subscription.paused')) return 'paused';
  if (notes.includes('customer.subscription.trial_will_end')) return 'trial_will_end';
  if (notes.includes('customer.subscription.updated') || notes.includes('invoice.payment_failed') || paymentStatus === 'failed') return 'dunning';
  if (notes.includes('invoice.payment_succeeded') || notes.includes('invoice.paid')) return 'renewal';
  if (paymentStatus === 'paid') return 'active';
  return 'pending';
};

const timestampValue = (record: SourceRecord): number => {
  const timestamp = Date.parse(record.updatedAt || record.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildLifecycle = (productRecord: SourceRecord, orders: SourceRecord[]) => {
  const product = productRecordToCommerceProduct(sourceRecordFromRecord(productRecord));
  const matchingOrders = orders
    .map((order) => {
      const values = order.values || {};
      const items = parseItems(values.items);
      const matchedItems = items.filter((item) => itemMatchesProduct(item, {
        id: product.id,
        slug: product.slug,
        sku: product.sku,
        title: product.title,
      }));
      return { order, values, items, matchedItems };
    })
    .filter(({ matchedItems, items, values }) => matchedItems.length > 0 && isSubscriptionOrder(items, values));

  const summary = {
    total: matchingOrders.length,
    active: 0,
    renewals: 0,
    dunning: 0,
    paused: 0,
    trialEnding: 0,
    cancelled: 0,
    pending: 0,
    revenue: 0,
    units: 0,
  };

  const subscriptions = matchingOrders
    .sort((left, right) => timestampValue(right.order) - timestampValue(left.order))
    .map(({ order, values, matchedItems }) => {
      const status = lifecycleStatus(values);
      if (status === 'active') summary.active += 1;
      if (status === 'renewal') summary.renewals += 1;
      if (status === 'dunning') summary.dunning += 1;
      if (status === 'paused') summary.paused += 1;
      if (status === 'trial_will_end') summary.trialEnding += 1;
      if (status === 'cancelled') summary.cancelled += 1;
      if (status === 'pending') summary.pending += 1;

      const units = matchedItems.reduce((sum, item) => sum + Math.max(0, Math.round(numberValue(item.quantity))), 0);
      const revenue = matchedItems.reduce((sum, item) => sum + numberValue(item.lineTotal || item.total), 0);
      summary.units += units;
      summary.revenue = Math.round((summary.revenue + revenue) * 100) / 100;

      return {
        id: order.id,
        slug: order.slug,
        orderNumber: textValue(values.ordernumber) || order.slug,
        customerName: textValue(values.customername),
        customerEmail: textValue(values.email),
        paymentStatus: textValue(values.paymentstatus).toLowerCase() || 'pending',
        fulfillmentStatus: textValue(values.fulfillmentstatus).toLowerCase() || 'unfulfilled',
        lifecycleStatus: status,
        subscriptionReference: textValue(values.paymentreference),
        checkoutSessionId: textValue(values.checkoutsessionid),
        total: numberValue(values.total),
        currency: normalizeCurrency(values.currency),
        productUnits: units,
        productRevenue: Math.round(revenue * 100) / 100,
        updatedAt: order.updatedAt || null,
        matchedItems: matchedItems.map((item) => ({
          productId: textValue(item.productId || item.productid),
          slug: textValue(item.slug),
          title: textValue(item.title),
          sku: textValue(item.sku),
          quantity: numberValue(item.quantity),
          lineTotal: numberValue(item.lineTotal || item.total),
        })),
      };
    });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    product: {
      id: product.id,
      slug: product.slug,
      title: product.title,
      sku: product.sku,
      subscription: product.subscription,
    },
    summary,
    subscriptions: subscriptions.slice(0, 25),
    contract: {
      ordersApi: `/api/admin/sites/:siteId/commerce/orders`,
      webhookApi: `/api/sites/:siteId/commerce/webhook`,
      reconciliationApi: `/api/admin/sites/:siteId/commerce/reconcile`,
      supportedLifecycleEvents: [
        'checkout.session.completed',
        'invoice.payment_succeeded',
        'invoice.payment_failed',
        'customer.subscription.updated',
        'customer.subscription.paused',
        'customer.subscription.resumed',
        'customer.subscription.trial_will_end',
        'customer.subscription.deleted',
      ],
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, productId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const [productsCollection, ordersCollection] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
      ]);
      if (!productsCollection) return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
      if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);

      const product = await repositories.collections.getRecordById(site.id, productsCollection.id, productId)
        || await repositories.collections.getRecordBySlug(site.id, productsCollection.id, productId);
      if (!product) return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);

      const orders = await repositories.collections.listRecords({
        siteId: site.id,
        collectionId: ordersCollection.id,
        includeUnpublished: true,
        limit: ORDER_LIMIT,
        offset: 0,
      });
      const lifecycle = buildLifecycle(product, orders.items);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          lifecycle,
          collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
        },
        lifecycle,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const productsCollection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG, { includeUnpublished: true });
    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!productsCollection) return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
    if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const product = getCollectionRecordByIdOrSlug(site.id, productsCollection.id, productId, { includeUnpublished: true });
    if (!product) return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);

    const orders = listCollectionRecords(site.id, ordersCollection.id, {
      includeUnpublished: true,
      limit: ORDER_LIMIT,
      offset: 0,
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    const lifecycle = buildLifecycle(product, orders.records);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        lifecycle,
        collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
      },
      lifecycle,
    });
  } catch (error) {
    console.error('Admin product subscription lifecycle API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
