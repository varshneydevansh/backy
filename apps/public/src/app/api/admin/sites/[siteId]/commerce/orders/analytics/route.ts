import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { getAdminSettings, getCollectionByIdOrSlug, getSiteByIdOrSlug, listCollectionRecords } from '@/lib/backyStore';
import { buildCommerceStorefrontContract, PRODUCT_COLLECTION_SLUG } from '@/lib/commerceCatalog';
import { publicContractJson } from '@/lib/publicContractResponse';
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

interface ProviderStatusBucket extends Bucket {
  statuses: Record<string, number>;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const ORDER_ANALYTICS_SCHEMA_VERSION = 'backy.order-analytics.v1';
const ORDER_PROVIDER_CERTIFICATION_OPERATOR_GATE = 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification';
const ORDER_ANALYTICS_LIMIT = 1000;
const TREND_DAYS = 14;

const ORDER_PROVIDER_CERTIFICATION_SCENARIOS = [
  {
    key: 'checkout-settlement',
    label: 'Checkout settlement',
    expectedEvidence: ['paid checkout order', 'payment provider reference', 'signed provider webhook'],
    nextAction: 'Run a live checkout and verify the private order reaches paid state with provider reference evidence.',
  },
  {
    key: 'quote-recalculation',
    label: 'Quote recalculation',
    expectedEvidence: ['tax quote', 'shipping quote', 'discount adjustment'],
    nextAction: 'Refresh a live order quote through selected tax, shipping, and discount providers.',
  },
  {
    key: 'carrier-label-tracking',
    label: 'Carrier labels and tracking',
    expectedEvidence: ['purchased label', 'void/refund result', 'tracking status'],
    nextAction: 'Purchase or import a live carrier label, void/refund when needed, and refresh tracking.',
  },
  {
    key: 'fulfillment-dispatch',
    label: 'Fulfillment dispatch',
    expectedEvidence: ['warehouse dispatch request', 'provider dispatch id', 'processing/fulfilled state'],
    nextAction: 'Dispatch a paid order through the configured warehouse or 3PL adapter.',
  },
  {
    key: 'provider-refund',
    label: 'Provider refund',
    expectedEvidence: ['provider refund id', 'refund status refresh', 'refund webhook outcome'],
    nextAction: 'Execute and refresh a live provider refund for a settled payment.',
  },
  {
    key: 'webhook-reconciliation',
    label: 'Webhook and reconciliation',
    expectedEvidence: ['commerce-webhook event', 'reconciliation run', 'idempotent repair result'],
    nextAction: 'Replay signed provider webhooks and run reconciliation against the live target.',
  },
  {
    key: 'subscription-lifecycle',
    label: 'Subscription lifecycle',
    expectedEvidence: ['renewal', 'dunning', 'pause/resume/cancel action'],
    nextAction: 'Run subscription lifecycle scenarios through the product subscription certification gate.',
  },
] as const;

const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];
const FULFILLMENT_STATUSES: FulfillmentStatus[] = ['unfulfilled', 'processing', 'fulfilled', 'cancelled'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    { success: false, requestId, error: { code, message }, errorMessage: message },
    {
      status,
      requestId,
      cache: 'error',
      schemaVersion: ORDER_ANALYTICS_SCHEMA_VERSION,
    },
  )
);

const privateAnalyticsResponse = (body: Record<string, unknown>, requestId: string, siteId: string) => (
  publicContractJson(body, {
    requestId,
    cache: 'private',
    schemaVersion: ORDER_ANALYTICS_SCHEMA_VERSION,
    siteId,
  })
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

const providerStatusBucket = (): ProviderStatusBucket => ({ count: 0, total: 0, statuses: {} });

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

const normalizeProviderKey = (value: unknown, fallback = 'manual'): string => {
  const provider = textValue(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return provider || fallback;
};

const normalizeStatusKey = (value: unknown, fallback = 'none'): string => {
  const status = textValue(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return status || fallback;
};

const addProviderBucket = (
  buckets: Map<string, ProviderStatusBucket>,
  providerValue: unknown,
  statusValue: unknown,
  total: number,
  fallbackProvider = 'manual',
) => {
  const provider = normalizeProviderKey(providerValue, fallbackProvider);
  const status = normalizeStatusKey(statusValue);
  const current = buckets.get(provider) || providerStatusBucket();
  current.count += 1;
  current.total = roundMoney(current.total + total);
  current.statuses[status] = (current.statuses[status] || 0) + 1;
  buckets.set(provider, current);
};

const providerBucketsToArray = (buckets: Map<string, ProviderStatusBucket>) => (
  Array.from(buckets.entries())
    .map(([provider, stats]) => ({ provider, ...stats }))
    .sort((left, right) => right.count - left.count || right.total - left.total || left.provider.localeCompare(right.provider))
);

const orderTextValue = (record: OrderAnalyticsRecord, key: string): string => textValue(record.values?.[key]);

const orderNumberValue = (record: OrderAnalyticsRecord, key: string): number => numberValue(record.values?.[key]);

const hasOrderValue = (record: OrderAnalyticsRecord, key: string): boolean => Boolean(orderTextValue(record, key));

const providerStatusCount = (items?: Array<{ statuses: Record<string, number> }>) => (
  items || []
).reduce((sum, item) => (
  sum + Object.values(item.statuses || {}).reduce((innerSum, value) => innerSum + value, 0)
), 0);

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
  const paymentProviderBuckets = new Map<string, ProviderStatusBucket>();
  const providerRefundBuckets = new Map<string, ProviderStatusBucket>();
  const fulfillmentProviderBuckets = new Map<string, ProviderStatusBucket>();
  const shippingLabelProviderBuckets = new Map<string, ProviderStatusBucket>();
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
  let providerRefundPendingCount = 0;
  let providerRefundFailureCount = 0;
  let providerRefundRequiresActionCount = 0;
  let fulfillmentDispatchPendingCount = 0;
  let fulfillmentDispatchFailureCount = 0;
  let shippingLabelIssueCount = 0;

  records.forEach((record) => {
    const values = record.values || {};
    const total = numberValue(values.total);
    const paymentStatus = normalizePaymentStatus(values.paymentstatus);
    const fulfillmentStatus = normalizeFulfillmentStatus(values.fulfillmentstatus);
    const source = textValue(values.ordersource).toLowerCase() || 'unknown';
    const currency = normalizeCurrency(values.currency);
    const providerRefundStatus = normalizeStatusKey(values.providerrefundstatus);
    const fulfillmentDispatchStatus = normalizeStatusKey(values.fulfillmentdispatchstatus);
    const shippingLabelStatus = normalizeStatusKey(values.shippinglabelstatus);
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
    if (providerRefundStatus === 'requested') providerRefundPendingCount += 1;
    if (providerRefundStatus === 'failed') providerRefundFailureCount += 1;
    if (providerRefundStatus === 'requires_action') providerRefundRequiresActionCount += 1;
    if (fulfillmentDispatchStatus === 'requested') fulfillmentDispatchPendingCount += 1;
    if (fulfillmentDispatchStatus === 'failed') fulfillmentDispatchFailureCount += 1;
    if (shippingLabelStatus === 'failed' || shippingLabelStatus === 'requires_action') shippingLabelIssueCount += 1;

    payment[paymentStatus].count += 1;
    payment[paymentStatus].total = roundMoney(payment[paymentStatus].total + total);
    fulfillment[fulfillmentStatus].count += 1;
    fulfillment[fulfillmentStatus].total = roundMoney(fulfillment[fulfillmentStatus].total + total);
    addProviderBucket(paymentProviderBuckets, values.paymentprovider, paymentStatus, total, 'manual');
    addProviderBucket(providerRefundBuckets, values.providerrefundprovider, providerRefundStatus, numberValue(values.providerrefundamount), 'manual');
    addProviderBucket(fulfillmentProviderBuckets, values.fulfillmentprovider, fulfillmentDispatchStatus, total, 'manual');
    addProviderBucket(shippingLabelProviderBuckets, values.shippinglabelprovider, shippingLabelStatus, numberValue(values.shippinglabelcost), 'manual');

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
      providerRefundPendingCount,
      providerRefundFailureCount,
      providerRefundRequiresActionCount,
      fulfillmentDispatchPendingCount,
      fulfillmentDispatchFailureCount,
      shippingLabelIssueCount,
    },
    providerOperations: {
      paymentProviders: providerBucketsToArray(paymentProviderBuckets),
      refundProviders: providerBucketsToArray(providerRefundBuckets),
      fulfillmentProviders: providerBucketsToArray(fulfillmentProviderBuckets),
      shippingLabelProviders: providerBucketsToArray(shippingLabelProviderBuckets),
      attention: {
        providerRefundPendingCount,
        providerRefundFailureCount,
        providerRefundRequiresActionCount,
        fulfillmentDispatchPendingCount,
        fulfillmentDispatchFailureCount,
        shippingLabelIssueCount,
      },
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

const buildOrderProviderCertificationEvidence = (
  records: OrderAnalyticsRecord[],
  analytics: ReturnType<typeof buildOrderAnalytics>,
) => {
  const checkoutSettlementCount = Math.max(
    analytics.operations.checkoutOrderCount,
    analytics.payment.paid.count,
    records.filter((record) => (
      normalizePaymentStatus(record.values.paymentstatus) === 'paid' &&
      (orderTextValue(record, 'ordersource').toLowerCase() === 'web' || hasOrderValue(record, 'checkoutsessionid'))
    )).length,
  );
  const quoteRecalculationCount = records.filter((record) => (
    orderNumberValue(record, 'taxamount') > 0 ||
    orderNumberValue(record, 'shippingamount') > 0 ||
    orderNumberValue(record, 'discountamount') > 0
  )).length;
  const carrierEvidenceCount = records.filter((record) => {
    const labelStatus = normalizeStatusKey(record.values.shippinglabelstatus);
    return labelStatus !== 'none' || hasOrderValue(record, 'trackingnumber') || hasOrderValue(record, 'trackingstatus');
  }).length + analytics.operations.shippingLabelIssueCount;
  const fulfillmentEvidenceCount = records.filter((record) => {
    const fulfillmentStatus = normalizeFulfillmentStatus(record.values.fulfillmentstatus);
    const dispatchStatus = normalizeStatusKey(record.values.fulfillmentdispatchstatus);
    return ['processing', 'fulfilled'].includes(fulfillmentStatus) || dispatchStatus !== 'none';
  }).length + analytics.operations.fulfillmentDispatchPendingCount + analytics.operations.fulfillmentDispatchFailureCount;
  const providerRefundEvidenceCount = records.filter((record) => (
    normalizeStatusKey(record.values.providerrefundstatus) !== 'none' ||
    normalizePaymentStatus(record.values.paymentstatus) === 'refunded' ||
    orderNumberValue(record, 'refundamount') > 0
  )).length + providerStatusCount(analytics.providerOperations.refundProviders);
  const webhookReconciliationEvidenceCount = records.filter((record) => (
    orderTextValue(record, 'providerrefundpayload').toLowerCase().includes('webhook') ||
    orderTextValue(record, 'notes').toLowerCase().includes('webhook')
  )).length;
  const subscriptionEvidenceCount = (
    analytics.operations.subscriptionRenewalCount +
    analytics.operations.subscriptionDunningCount +
    analytics.operations.subscriptionPausedCount +
    analytics.operations.subscriptionResumedCount +
    analytics.operations.subscriptionTrialEndingCount +
    analytics.operations.subscriptionCancelledCount
  );
  const evidenceCounts: Record<string, number> = {
    'checkout-settlement': checkoutSettlementCount,
    'quote-recalculation': quoteRecalculationCount,
    'carrier-label-tracking': carrierEvidenceCount,
    'fulfillment-dispatch': fulfillmentEvidenceCount,
    'provider-refund': providerRefundEvidenceCount,
    'webhook-reconciliation': webhookReconciliationEvidenceCount,
    'subscription-lifecycle': subscriptionEvidenceCount,
  };
  const scenarios = ORDER_PROVIDER_CERTIFICATION_SCENARIOS.map((scenario) => {
    const evidenceCount = evidenceCounts[scenario.key] || 0;
    return {
      ...scenario,
      evidenceCount,
      status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
    };
  });
  const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

  return {
    schemaVersion: 'backy.order-provider-certification-evidence.v1',
    status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
    requiredGate: ORDER_PROVIDER_CERTIFICATION_OPERATOR_GATE,
    coverage: {
      covered,
      total: scenarios.length,
      missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
    },
    scenarios,
    secretHandling: 'Order certification evidence reports scenario names, counts, gates, and non-secret provider families only; provider secrets, customer payloads, and raw order values stay private.',
  };
};

const commerceCertificationGroup = (
  certification: ReturnType<typeof buildCommerceStorefrontContract>['providerCertification'],
  family: string,
) => certification.groups.find((group) => group.family === family);

const orderCertificationExpectedEvidence = (
  certificationEvidence: ReturnType<typeof buildOrderProviderCertificationEvidence>,
  scenarioKey: string,
) => {
  const scenario = certificationEvidence.scenarios.find((item) => item.key === scenarioKey);
  return scenario ? [...scenario.expectedEvidence] : [];
};

const orderCertificationScenarioCovered = (
  certificationEvidence: ReturnType<typeof buildOrderProviderCertificationEvidence>,
  scenarioKey: string,
) => certificationEvidence.scenarios.some((scenario) => scenario.key === scenarioKey && scenario.status === 'covered');

const buildOrderProviderCertificationEvidencePacket = ({
  site,
  certification,
  certificationEvidence,
  analytics,
}: {
  site: { id: string };
  certification: ReturnType<typeof buildCommerceStorefrontContract>['providerCertification'];
  certificationEvidence: ReturnType<typeof buildOrderProviderCertificationEvidence>;
  analytics: ReturnType<typeof buildOrderAnalytics>;
}) => {
  const checkoutGroup = commerceCertificationGroup(certification, 'Checkout and payment settlement');
  const taxGroup = commerceCertificationGroup(certification, 'Tax quote providers');
  const shippingGroup = commerceCertificationGroup(certification, 'Shipping rate, label, and tracking providers');
  const discountGroup = commerceCertificationGroup(certification, 'Discount quote providers');
  const subscriptionGroup = commerceCertificationGroup(certification, 'Subscription lifecycle providers');
  const runtime = certification.runtime;
  const familyArtifacts = [
    {
      key: 'payment-refunds',
      family: 'Payment settlement and refunds',
      providerAlias: 'Auto payment/refund provider',
      ready: runtime.paymentConfigured || analytics.payment.paid.count > 0 || analytics.operations.refundCount > 0,
      requiredInputs: checkoutGroup?.requiredInputs || ['BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'],
      expectedArtifacts: [
        ...orderCertificationExpectedEvidence(certificationEvidence, 'checkout-settlement'),
        ...orderCertificationExpectedEvidence(certificationEvidence, 'provider-refund'),
      ],
      captureSource: 'public checkout intake, private order record, provider-refund endpoint, and signed refund webhook readback',
    },
    {
      key: 'tax-quotes',
      family: 'Tax quotes',
      providerAlias: 'Auto tax provider',
      ready: runtime.taxConfigured || analytics.revenue.taxTotal > 0,
      requiredInputs: taxGroup?.requiredInputs || ['BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY'],
      expectedArtifacts: orderCertificationExpectedEvidence(certificationEvidence, 'quote-recalculation'),
      captureSource: 'order quote POST/GET response and private order tax totals',
    },
    {
      key: 'shipping-labels',
      family: 'Shipping quotes, labels, and tracking',
      providerAlias: 'Auto shipping provider',
      ready: runtime.shippingConfigured || orderCertificationScenarioCovered(certificationEvidence, 'carrier-label-tracking'),
      requiredInputs: shippingGroup?.requiredInputs || ['BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY'],
      expectedArtifacts: orderCertificationExpectedEvidence(certificationEvidence, 'carrier-label-tracking'),
      captureSource: 'shipping-label endpoint, tracking endpoint, and order shipping-label fields',
    },
    {
      key: 'discount-quotes',
      family: 'Discount quotes',
      providerAlias: 'Auto discount provider',
      ready: runtime.discountConfigured || analytics.revenue.discountTotal > 0,
      requiredInputs: discountGroup?.requiredInputs || ['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL'],
      expectedArtifacts: orderCertificationExpectedEvidence(certificationEvidence, 'quote-recalculation'),
      captureSource: 'order quote response and private order discount fields',
    },
    {
      key: 'fulfillment-dispatch',
      family: 'Fulfillment dispatch',
      providerAlias: 'Settings fulfillment provider',
      ready: orderCertificationScenarioCovered(certificationEvidence, 'fulfillment-dispatch') || analytics.fulfillment.fulfilled.count > 0,
      requiredInputs: ['Settings commerce fulfillmentProvider=http plus fulfillmentProviderUrl'],
      expectedArtifacts: orderCertificationExpectedEvidence(certificationEvidence, 'fulfillment-dispatch'),
      captureSource: 'fulfillment endpoint response and private order fulfillment fields',
    },
    {
      key: 'subscription-lifecycle',
      family: 'Subscription lifecycle',
      providerAlias: 'Auto subscription provider',
      ready: runtime.subscriptionConfigured || orderCertificationScenarioCovered(certificationEvidence, 'subscription-lifecycle'),
      requiredInputs: subscriptionGroup?.requiredInputs || ['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL'],
      expectedArtifacts: orderCertificationExpectedEvidence(certificationEvidence, 'subscription-lifecycle'),
      captureSource: 'product subscription lifecycle endpoint, order analytics, and signed subscription webhook readback',
    },
    {
      key: 'webhook-reconciliation',
      family: 'Webhooks and reconciliation',
      providerAlias: 'Auto webhook provider',
      ready: runtime.webhookSecretConfigured || orderCertificationScenarioCovered(certificationEvidence, 'webhook-reconciliation'),
      requiredInputs: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET'],
      expectedArtifacts: orderCertificationExpectedEvidence(certificationEvidence, 'webhook-reconciliation'),
      captureSource: 'commerce webhook response, commerce-order events, and reconciliation endpoints',
    },
  ];
  const missingSelectedFamilies = familyArtifacts
    .filter((artifact) => !artifact.ready)
    .map((artifact) => artifact.key);
  const status = missingSelectedFamilies.length > 0
    ? 'needs-credentials'
    : certificationEvidence.status === 'ready'
      ? 'evidence-complete'
      : 'needs-scenario-evidence';
  const missingScenarios = certificationEvidence.coverage.missing;
  const operatorNextAction = status === 'needs-credentials'
    ? {
        label: 'Configure order provider credentials',
        detail: missingSelectedFamilies.length > 0
          ? `Populate runtime aliases for selected order families: ${missingSelectedFamilies.join(', ')}.`
          : 'Load runtime Settings/CI environment aliases so Backy can prove order-operation provider readiness.',
        command: 'npm run doctor:release-certification && npm run ci:commerce-provider-certification',
      }
    : status === 'needs-scenario-evidence'
      ? {
          label: 'Attach live order evidence',
          detail: missingScenarios.length > 0
            ? `Capture redacted evidence for: ${missingScenarios.join(', ')}.`
            : 'Run the selected live order-provider scenarios and attach the redacted packet.',
          command: 'npm run ci:commerce-provider-certification',
        }
      : {
          label: 'Attach certification artifact',
          detail: 'Store the redacted artifact at artifacts/backy-commerce-provider-certification.json and expose it through BACKY_COMMERCE_CERTIFICATION_OUTPUT.',
          command: 'npm run doctor:release-certification',
        };

  return {
    schemaVersion: 'backy.order-provider-certification-evidence-packet.v1',
    generatedAt: analytics.generatedAt,
    selectedSiteId: site.id,
    status,
    operatorNextAction: {
      status,
      ...operatorNextAction,
      missingFamilies: missingSelectedFamilies,
      missingScenarios,
      artifactEnv: 'BACKY_COMMERCE_CERTIFICATION_OUTPUT',
      artifactPath: 'artifacts/backy-commerce-provider-certification.json',
    },
    selectedFamilies: familyArtifacts.map((artifact) => artifact.key),
    selectedProviderAliases: Object.fromEntries(familyArtifacts.map((artifact) => [
      artifact.key,
      artifact.providerAlias,
    ])),
    runtimeReadiness: {
      loaded: true,
      configuredFamilies: runtime.configuredFamilies,
      missingSelectedFamilies,
    },
    operatorArtifacts: familyArtifacts.map((artifact) => ({
      key: artifact.key,
      family: artifact.family,
      providerAlias: artifact.providerAlias,
      status: artifact.ready ? 'ready-to-run' : 'needs-credentials',
      requiredInputs: artifact.requiredInputs,
      expectedArtifacts: artifact.expectedArtifacts,
      captureSource: artifact.captureSource,
      redaction: 'Attach ids, timestamps, event names, totals, and status codes only; remove provider secrets, customer payloads, raw order payloads, addresses, payment references, and webhook bodies.',
    })),
    scenarioAttachments: certificationEvidence.scenarios.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      status: scenario.status,
      evidenceCount: scenario.evidenceCount,
      expectedEvidence: [...scenario.expectedEvidence],
      nextAction: scenario.nextAction,
    })),
    commandPreview: {
      command: certification.operatorCommandTemplate.command,
      requiredInputs: certification.operatorCommandTemplate.requiredInputs,
      targetInputs: certification.operatorCommandTemplate.targetInputs,
    },
    target: {
      siteId: site.id,
      siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      orderAnalyticsApi: `/api/admin/sites/${site.id}/commerce/orders/analytics`,
      publicOrderContractApi: `/api/sites/${site.id}/commerce/orders`,
      productProviderSyncApi: `/api/admin/sites/${site.id}/commerce/products/{productId}/provider-sync`,
    },
    redactionPolicy: {
      includesProviderSecrets: false,
      includesCustomerPayloads: false,
      includesRawOrderPayloads: false,
      includesPaymentReferences: false,
      includesAddresses: false,
      includesWebhookBodies: false,
      allowedEvidence: [
        'provider ids and aliases',
        'timestamped CI/preflight logs',
        'quote totals and adjustment names',
        'label, tracking, fulfillment, and refund statuses',
        'webhook event names and accepted status codes',
        'reconciliation event counts and run modes',
        'scenario counts and coverage state',
      ],
    },
    secretHandling: 'Redacted operator attachment manifest only; provider credentials, customer payloads, raw order payloads, payment references, addresses, and webhook bodies stay out of API JSON.',
  };
};

const buildOrderProviderCertification = ({
  site,
  settings,
  hasCatalog,
  hasOrderIntake,
  analytics,
  records,
}: {
  site: { id: string; slug?: string; name?: string; status?: string };
  settings: unknown;
  hasCatalog: boolean;
  hasOrderIntake: boolean;
  analytics: ReturnType<typeof buildOrderAnalytics>;
  records: OrderAnalyticsRecord[];
}) => {
  const commerce = buildCommerceStorefrontContract({
    siteId: site.id,
    settings,
    hasCatalog,
    hasOrderIntake,
  });

  const certificationEvidence = buildOrderProviderCertificationEvidence(records, analytics);

  return {
    ...commerce.providerCertification,
    generatedAt: analytics.generatedAt,
    selectedSiteId: site.id,
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
      status: site.status,
    },
    source: 'admin-order-analytics-api',
    operatorGate: ORDER_PROVIDER_CERTIFICATION_OPERATOR_GATE,
    analyticsSchemaVersion: ORDER_ANALYTICS_SCHEMA_VERSION,
    endpointEvidence: {
      analytics: `/api/admin/sites/${site.id}/commerce/orders/analytics`,
      quote: `/api/admin/sites/${site.id}/commerce/orders/{orderId}/quote`,
      shippingLabel: `/api/admin/sites/${site.id}/commerce/orders/{orderId}/shipping-label`,
      fulfillment: `/api/admin/sites/${site.id}/commerce/orders/{orderId}/fulfillment`,
      tracking: `/api/admin/sites/${site.id}/commerce/orders/{orderId}/tracking`,
      providerRefund: `/api/admin/sites/${site.id}/commerce/orders/{orderId}/provider-refund`,
      commerceWebhook: `/api/sites/${site.id}/commerce/webhook`,
      siteReconciliation: `/api/admin/sites/${site.id}/commerce/reconcile`,
      platformReconciliation: '/api/admin/commerce/reconcile',
      reconciliationReadiness: '/api/admin/commerce/reconcile/readiness',
      checkoutIntake: `/api/sites/${site.id}/commerce/orders`,
    },
    providerAnalytics: analytics.providerOperations,
    certificationEvidence,
    operatorEvidencePacket: buildOrderProviderCertificationEvidencePacket({
      site,
      certification: commerce.providerCertification,
      certificationEvidence,
      analytics,
    }),
    secretHandling: 'Provider credentials stay in server environment/configuration; order analytics exposes only non-secret readiness, scenario counts, endpoint names, and provider-family metadata.',
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

      const [ordersCollection, productsCollection, settings] = await Promise.all([
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.settings.get(),
      ]);
      if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);

      const result = await repositories.collections.listRecords({
        siteId: site.id,
        collectionId: ordersCollection.id,
        includeUnpublished: true,
        limit: ORDER_ANALYTICS_LIMIT,
        offset: 0,
      });
      const analytics = buildOrderAnalytics(result.items);
      const providerCertification = buildOrderProviderCertification({
        site,
        settings: settings.integrations?.commerce,
        hasCatalog: productsCollection?.status === 'published',
        hasOrderIntake: ordersCollection.status === 'published',
        analytics,
        records: result.items,
      });

      return privateAnalyticsResponse({
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
          analytics,
          providerCertification,
        },
      }, requestId, site.id);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const productsCollection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG, { includeUnpublished: true });

    const records = listCollectionRecords(site.id, ordersCollection.id, {
      includeUnpublished: true,
      limit: ORDER_ANALYTICS_LIMIT,
      offset: 0,
    }).records;
    const analytics = buildOrderAnalytics(records);
    const providerCertification = buildOrderProviderCertification({
      site,
      settings: getAdminSettings().integrations?.commerce,
      hasCatalog: productsCollection?.status === 'published',
      hasOrderIntake: ordersCollection.status === 'published',
      analytics,
      records,
    });

    return privateAnalyticsResponse({
      success: true,
      requestId,
      data: {
        site: { id: site.id, slug: site.slug, name: site.name },
        collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
        analytics,
        providerCertification,
      },
    }, requestId, site.id);
  } catch (error) {
    console.error('Admin order analytics API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
