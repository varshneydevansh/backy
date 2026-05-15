import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { getCollectionByIdOrSlug, getSiteByIdOrSlug, listCollectionRecords } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type FulfillmentStatus = 'unfulfilled' | 'processing' | 'fulfilled' | 'cancelled';

interface OrderAnalyticsRecord {
  id: string;
  slug: string;
  status: string;
  values: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface Bucket {
  count: number;
  total: number;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const ORDER_ANALYTICS_SCHEMA_VERSION = 'backy.order-analytics.v1';
const ORDER_ANALYTICS_LIMIT = 1000;
const TREND_DAYS = 14;

const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];
const FULFILLMENT_STATUSES: FulfillmentStatus[] = ['unfulfilled', 'processing', 'fulfilled', 'cancelled'];

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

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const bucket = (): Bucket => ({ count: 0, total: 0 });

const normalizePaymentStatus = (value: unknown): PaymentStatus => {
  const status = textValue(value).toLowerCase();
  return PAYMENT_STATUSES.includes(status as PaymentStatus) ? status as PaymentStatus : 'pending';
};

const normalizeFulfillmentStatus = (value: unknown): FulfillmentStatus => {
  const status = textValue(value).toLowerCase();
  return FULFILLMENT_STATUSES.includes(status as FulfillmentStatus) ? status as FulfillmentStatus : 'unfulfilled';
};

const normalizeCurrency = (value: unknown): string => {
  const currency = textValue(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
};

const timestampValue = (record: OrderAnalyticsRecord): number => {
  const timestamp = Date.parse(record.updatedAt || record.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const dayKey = (value: string | null | undefined): string | null => {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
};

const trendSeed = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (TREND_DAYS - index - 1));
    return {
      date: date.toISOString().slice(0, 10),
      orders: 0,
      paid: 0,
      grossTotal: 0,
      paidTotal: 0,
    };
  });
};

const buildOrderAnalytics = (records: OrderAnalyticsRecord[]) => {
  const payment = Object.fromEntries(PAYMENT_STATUSES.map((status) => [status, bucket()])) as Record<PaymentStatus, Bucket>;
  const fulfillment = Object.fromEntries(FULFILLMENT_STATUSES.map((status) => [status, bucket()])) as Record<FulfillmentStatus, Bucket>;
  const sourceBuckets = new Map<string, Bucket>();
  const currencyBuckets = new Map<string, Bucket>();
  const trend = trendSeed();
  const trendByDate = new Map(trend.map((point) => [point.date, point]));
  let grossTotal = 0;
  let paidTotal = 0;
  let refundAmountTotal = 0;
  let taxTotal = 0;
  let shippingTotal = 0;
  let discountTotal = 0;
  let fulfillmentBacklogCount = 0;
  let paymentAttentionCount = 0;
  let subscriptionOrderCount = 0;
  let subscriptionRenewalCount = 0;
  let subscriptionDunningCount = 0;
  let subscriptionCancelledCount = 0;
  let subscriptionActivePaidCount = 0;
  let subscriptionPausedCount = 0;
  let subscriptionResumedCount = 0;
  let subscriptionTrialEndingCount = 0;

  records.forEach((record) => {
    const values = record.values || {};
    const total = numberValue(values.total);
    const paymentStatus = normalizePaymentStatus(values.paymentstatus);
    const fulfillmentStatus = normalizeFulfillmentStatus(values.fulfillmentstatus);
    const source = textValue(values.ordersource).toLowerCase() || 'unknown';
    const currency = normalizeCurrency(values.currency);
    const paymentReference = textValue(values.paymentreference);
    const notes = textValue(values.notes).toLowerCase();
    const isSubscriptionOrder = paymentReference.startsWith('sub_') || notes.includes('customer.subscription.') || notes.includes('invoice.payment_');

    grossTotal += total;
    taxTotal += numberValue(values.taxamount);
    shippingTotal += numberValue(values.shippingamount);
    discountTotal += numberValue(values.discountamount);
    refundAmountTotal += numberValue(values.refundamount);
    if (paymentStatus === 'paid') paidTotal += total;
    if (paymentStatus === 'paid' && fulfillmentStatus !== 'fulfilled' && fulfillmentStatus !== 'cancelled') {
      fulfillmentBacklogCount += 1;
    }
    if (paymentStatus === 'pending' || paymentStatus === 'failed') {
      paymentAttentionCount += 1;
    }
    if (isSubscriptionOrder) {
      subscriptionOrderCount += 1;
      if (paymentStatus === 'paid' && fulfillmentStatus !== 'cancelled') subscriptionActivePaidCount += 1;
      if (notes.includes('invoice.payment_succeeded') || notes.includes('invoice.paid')) subscriptionRenewalCount += 1;
      if (notes.includes('customer.subscription.updated') || notes.includes('invoice.payment_failed')) subscriptionDunningCount += 1;
      if (notes.includes('customer.subscription.deleted') || fulfillmentStatus === 'cancelled') subscriptionCancelledCount += 1;
      if (notes.includes('customer.subscription.paused')) subscriptionPausedCount += 1;
      if (notes.includes('customer.subscription.resumed')) subscriptionResumedCount += 1;
      if (notes.includes('customer.subscription.trial_will_end')) subscriptionTrialEndingCount += 1;
    }

    payment[paymentStatus].count += 1;
    payment[paymentStatus].total = roundMoney(payment[paymentStatus].total + total);
    fulfillment[fulfillmentStatus].count += 1;
    fulfillment[fulfillmentStatus].total = roundMoney(fulfillment[fulfillmentStatus].total + total);

    const sourceBucket = sourceBuckets.get(source) || bucket();
    sourceBucket.count += 1;
    sourceBucket.total = roundMoney(sourceBucket.total + total);
    sourceBuckets.set(source, sourceBucket);

    const currencyBucket = currencyBuckets.get(currency) || bucket();
    currencyBucket.count += 1;
    currencyBucket.total = roundMoney(currencyBucket.total + total);
    currencyBuckets.set(currency, currencyBucket);

    const date = dayKey(record.createdAt || record.updatedAt);
    const point = date ? trendByDate.get(date) : undefined;
    if (point) {
      point.orders += 1;
      point.grossTotal = roundMoney(point.grossTotal + total);
      if (paymentStatus === 'paid') {
        point.paid += 1;
        point.paidTotal = roundMoney(point.paidTotal + total);
      }
    }
  });

  const sortedRecords = [...records].sort((left, right) => timestampValue(right) - timestampValue(left));
  const sources = Array.from(sourceBuckets.entries())
    .map(([source, stats]) => ({ source, ...stats }))
    .sort((left, right) => right.count - left.count || right.total - left.total || left.source.localeCompare(right.source));
  const currencies = Array.from(currencyBuckets.entries())
    .map(([currency, stats]) => ({ currency, ...stats }))
    .sort((left, right) => right.count - left.count || left.currency.localeCompare(right.currency));

  return {
    schemaVersion: ORDER_ANALYTICS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    recordLimit: ORDER_ANALYTICS_LIMIT,
    orderCount: records.length,
    revenue: {
      grossTotal: roundMoney(grossTotal),
      paidTotal: roundMoney(paidTotal),
      pendingTotal: payment.pending.total,
      failedTotal: payment.failed.total,
      refundedTotal: payment.refunded.total,
      refundAmountTotal: roundMoney(refundAmountTotal),
      taxTotal: roundMoney(taxTotal),
      shippingTotal: roundMoney(shippingTotal),
      discountTotal: roundMoney(discountTotal),
      averageOrderValue: records.length > 0 ? roundMoney(grossTotal / records.length) : 0,
      paidAverageOrderValue: payment.paid.count > 0 ? roundMoney(paidTotal / payment.paid.count) : 0,
    },
    payment,
    fulfillment,
    operations: {
      fulfillmentBacklogCount,
      paymentAttentionCount,
      refundCount: payment.refunded.count,
      manualOrderCount: sourceBuckets.get('manual')?.count || 0,
      checkoutOrderCount: sourceBuckets.get('web')?.count || 0,
      subscriptionOrderCount,
      subscriptionActivePaidCount,
      subscriptionRenewalCount,
      subscriptionDunningCount,
      subscriptionCancelledCount,
      subscriptionPausedCount,
      subscriptionResumedCount,
      subscriptionTrialEndingCount,
    },
    sources,
    currencies,
    trend,
    recentOrders: sortedRecords.slice(0, 8).map((record) => {
      const values = record.values || {};
      return {
        id: record.id,
        slug: record.slug,
        status: record.status,
        orderNumber: textValue(values.ordernumber) || record.slug,
        customerName: textValue(values.customername),
        total: numberValue(values.total),
        currency: normalizeCurrency(values.currency),
        paymentStatus: normalizePaymentStatus(values.paymentstatus),
        fulfillmentStatus: normalizeFulfillmentStatus(values.fulfillmentstatus),
        orderSource: textValue(values.ordersource).toLowerCase() || 'unknown',
        subscriptionReference: textValue(values.paymentreference).startsWith('sub_') ? textValue(values.paymentreference) : '',
        updatedAt: record.updatedAt || null,
      };
    }),
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const ordersCollection = await repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG);
      if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);

      const result = await repositories.collections.listRecords({
        siteId: site.id,
        collectionId: ordersCollection.id,
        includeUnpublished: true,
        limit: ORDER_ANALYTICS_LIMIT,
        offset: 0,
      });
      const analytics = buildOrderAnalytics(result.items);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
          analytics,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);

    const records = listCollectionRecords(site.id, ordersCollection.id, {
      includeUnpublished: true,
      limit: ORDER_ANALYTICS_LIMIT,
      offset: 0,
    }).records;
    const analytics = buildOrderAnalytics(records);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: { id: site.id, slug: site.slug, name: site.name },
        collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
        analytics,
      },
    });
  } catch (error) {
    console.error('Admin order analytics API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
