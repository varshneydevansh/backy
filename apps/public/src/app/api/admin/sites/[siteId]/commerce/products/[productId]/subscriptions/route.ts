import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { PRODUCT_COLLECTION_SLUG, productRecordToCommerceProduct, type CommerceSourceRecord } from '@/lib/commerceCatalog';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { getAdminSettings, getCollectionByIdOrSlug, getCollectionRecordByIdOrSlug, getSiteByIdOrSlug, listCollectionRecords } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
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
type SubscriptionLifecycleOperatorAction = 'pause' | 'resume' | 'cancel';
type SubscriptionActionExecutionMode = 'stripe-api' | 'paypal-api' | 'paddle-api' | 'square-api' | 'adyen-api' | 'mollie-api' | 'razorpay-api' | 'http-api' | 'handoff';

const SUBSCRIPTION_OPERATOR_ACTIONS: SubscriptionLifecycleOperatorAction[] = ['pause', 'resume', 'cancel'];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    { success: false, requestId, error: { code, message }, errorMessage: message },
    {
      status,
      requestId,
      cache: 'error',
      schemaVersion: SCHEMA_VERSION,
    },
  )
);

const lifecycleResponse = (body: Record<string, unknown>, requestId: string, siteId: string) => (
  publicContractJson(body, {
    requestId,
    cache: 'private',
    schemaVersion: SCHEMA_VERSION,
    siteId,
  })
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
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

const parseSubscriptionActionHistory = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => (
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    ));
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return parseSubscriptionActionHistory(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return [];
};

const subscriptionActionHistory = (value: unknown, subscriptionReference: string) => (
  parseSubscriptionActionHistory(value)
    .map((entry) => ({
      id: textValue(entry.id),
      schemaVersion: textValue(entry.schemaVersion) || 'backy.product-subscription-action.v1',
      action: textValue(entry.action),
      status: textValue(entry.status),
      provider: textValue(entry.provider),
      executionMode: textValue(entry.executionMode),
      subscriptionReference: textValue(entry.subscriptionReference),
      reason: textValue(entry.reason),
      requestedAt: textValue(entry.requestedAt),
      completedAt: textValue(entry.completedAt) || null,
    }))
    .filter((entry) => entry.id && (!subscriptionReference || entry.subscriptionReference === subscriptionReference))
    .slice(0, 10)
);

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

const envValue = (keys: string[]): string => (
  keys.map((key) => process.env[key]?.trim() || '').find(Boolean) || ''
);

const stripeSecretConfigured = () => Boolean(envValue(['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY']));

const paypalAccessTokenConfigured = () => Boolean(envValue(['BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN']));

const paddleApiKeyConfigured = () => Boolean(envValue(['BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY']));

const squareAccessTokenConfigured = () => Boolean(envValue(['BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN']));

const adyenSubscriptionConfigured = () => (
  Boolean(envValue(['BACKY_ADYEN_API_KEY', 'ADYEN_API_KEY'])) &&
  Boolean(envValue(['BACKY_ADYEN_MERCHANT_ACCOUNT', 'ADYEN_MERCHANT_ACCOUNT']))
);

const mollieApiKeyConfigured = () => Boolean(envValue(['BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY']));

const razorpayCredentialsConfigured = () => (
  Boolean(envValue(['BACKY_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID'])) &&
  Boolean(envValue(['BACKY_RAZORPAY_KEY_SECRET', 'RAZORPAY_KEY_SECRET']))
);

const subscriptionActionProviderUrl = (): string => {
  const commerce = toRecord(toRecord(getAdminSettings().integrations).commerce);
  const configuredUrl = envValue(['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL', 'COMMERCE_SUBSCRIPTION_ACTION_URL'])
    || textValue(commerce.subscriptionActionProviderUrl)
    || textValue(commerce.subscriptionLifecycleProviderUrl);
  if (!configuredUrl) return '';
  try {
    const url = new URL(configuredUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};

const inferSubscriptionProvider = (values: Record<string, unknown>, subscriptionReference: string): string => {
  const configuredProvider = textValue(values.paymentprovider).toLowerCase();
  if (configuredProvider) return configuredProvider;
  if (subscriptionReference.startsWith('sub_')) return 'stripe';
  if (subscriptionReference.startsWith('I-')) return 'paypal';
  if (subscriptionReference.startsWith('cst_')) return 'mollie';
  return 'manual';
};

const splitProviderReference = (value: string): [string, string] | null => {
  const separators = ['::', ':', '/', '|'];
  for (const separator of separators) {
    const parts = value.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts.slice(1).join(separator)];
  }
  return null;
};

const providerCustomerReference = (values: Record<string, unknown>): string => (
  textValue(values.providercustomerid)
  || textValue(values.providerCustomerId)
  || textValue(values.paymentcustomerid)
  || textValue(values.paymentCustomerId)
  || textValue(values.molliecustomerid)
  || textValue(values.mollieCustomerId)
  || textValue(values.adyenshopperreference)
  || textValue(values.adyenShopperReference)
);

const adyenTargetReady = (values: Record<string, unknown>, subscriptionReference: string): boolean => {
  const split = splitProviderReference(subscriptionReference);
  return Boolean(providerCustomerReference(values) || split?.[0] || subscriptionReference);
};

const mollieTargetReady = (values: Record<string, unknown>, subscriptionReference: string): boolean => {
  const split = splitProviderReference(subscriptionReference);
  const splitCustomer = split?.[0]?.startsWith('cst_') ? split[0] : '';
  const customerId = providerCustomerReference(values) || splitCustomer;
  const subscriptionId = splitCustomer ? split?.[1] || '' : subscriptionReference;
  return Boolean(customerId && subscriptionId);
};

const httpSubscriptionActionFallbackEnabled = (provider: string): boolean => {
  const normalizedProvider = provider.toLowerCase();
  return (
    Boolean(subscriptionActionProviderUrl()) &&
    (['http', 'generic-http', 'custom-http'].includes(normalizedProvider) ||
      ['adyen', 'mollie'].includes(normalizedProvider))
  );
};

const subscriptionActionExecutionModeForAction = (
  provider: string,
  subscriptionReference: string,
  values: Record<string, unknown>,
  action: SubscriptionLifecycleOperatorAction,
): SubscriptionActionExecutionMode => {
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === 'stripe' && stripeSecretConfigured() && subscriptionReference.startsWith('sub_')) {
    return 'stripe-api';
  }
  if (normalizedProvider === 'paypal' && paypalAccessTokenConfigured() && subscriptionReference) {
    return 'paypal-api';
  }
  if (normalizedProvider === 'paddle' && paddleApiKeyConfigured() && subscriptionReference) {
    return 'paddle-api';
  }
  if (normalizedProvider === 'square' && squareAccessTokenConfigured() && subscriptionReference) {
    return 'square-api';
  }
  if (normalizedProvider === 'adyen' && action === 'cancel' && adyenSubscriptionConfigured() && adyenTargetReady(values, subscriptionReference)) {
    return 'adyen-api';
  }
  if (normalizedProvider === 'mollie' && action === 'cancel' && mollieApiKeyConfigured() && mollieTargetReady(values, subscriptionReference)) {
    return 'mollie-api';
  }
  if (normalizedProvider === 'razorpay' && razorpayCredentialsConfigured() && subscriptionReference) {
    return 'razorpay-api';
  }
  if (httpSubscriptionActionFallbackEnabled(normalizedProvider)) {
    return 'http-api';
  }
  return 'handoff';
};

const subscriptionActionExecutionModes = (
  provider: string,
  subscriptionReference: string,
  values: Record<string, unknown>,
): Record<SubscriptionLifecycleOperatorAction, SubscriptionActionExecutionMode> => ({
  pause: subscriptionActionExecutionModeForAction(provider, subscriptionReference, values, 'pause'),
  resume: subscriptionActionExecutionModeForAction(provider, subscriptionReference, values, 'resume'),
  cancel: subscriptionActionExecutionModeForAction(provider, subscriptionReference, values, 'cancel'),
});

const preferredSubscriptionActionExecutionMode = (
  modes: Record<SubscriptionLifecycleOperatorAction, SubscriptionActionExecutionMode>,
): SubscriptionActionExecutionMode => (
  modes.cancel !== 'handoff'
    ? modes.cancel
    : modes.pause !== 'handoff'
      ? modes.pause
      : modes.resume
);

const subscriptionHasExecutionMode = (
  subscription: { actionExecutionModes: Record<SubscriptionLifecycleOperatorAction, SubscriptionActionExecutionMode> },
  mode: SubscriptionActionExecutionMode,
): boolean => SUBSCRIPTION_OPERATOR_ACTIONS.some((action) => subscription.actionExecutionModes[action] === mode);

const subscriptionHasExecutableAction = (
  subscription: { actionExecutionModes: Record<SubscriptionLifecycleOperatorAction, SubscriptionActionExecutionMode> },
): boolean => SUBSCRIPTION_OPERATOR_ACTIONS.some((action) => subscription.actionExecutionModes[action] !== 'handoff');

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

      const subscriptionReference = textValue(values.paymentreference);
      const paymentProvider = inferSubscriptionProvider(values, subscriptionReference);
      const actionExecutionModes = subscriptionActionExecutionModes(paymentProvider, subscriptionReference, values);
      const actionExecutionMode = preferredSubscriptionActionExecutionMode(actionExecutionModes);
      const actionHistory = subscriptionActionHistory(values.subscriptionactionhistory, subscriptionReference);

      return {
        id: order.id,
        slug: order.slug,
        orderNumber: textValue(values.ordernumber) || order.slug,
        customerName: textValue(values.customername),
        customerEmail: textValue(values.email),
        paymentProvider,
        paymentStatus: textValue(values.paymentstatus).toLowerCase() || 'pending',
        fulfillmentStatus: textValue(values.fulfillmentstatus).toLowerCase() || 'unfulfilled',
        lifecycleStatus: status,
        subscriptionReference,
        actionExecutionMode,
        actionExecutionModes,
        actionHistory,
        lastAction: actionHistory[0] || null,
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

  const httpActionAdapterConfigured = Boolean(subscriptionActionProviderUrl());
  const adyenSupportedActions = httpActionAdapterConfigured ? SUBSCRIPTION_OPERATOR_ACTIONS : ['cancel'];
  const mollieSupportedActions = httpActionAdapterConfigured ? SUBSCRIPTION_OPERATOR_ACTIONS : ['cancel'];

  const execution = {
    schemaVersion: 'backy.product-subscription-execution-readiness.v1',
    actionEndpoint: '/api/admin/sites/:siteId/commerce/products/:productId/subscriptions/:orderId/action',
    supportedActions: SUBSCRIPTION_OPERATOR_ACTIONS,
    providers: [
      {
        provider: 'stripe',
        executionMode: 'stripe-api',
        configured: stripeSecretConfigured(),
        referencePattern: 'sub_*',
        executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutionMode(subscription, 'stripe-api')).length,
        blocker: stripeSecretConfigured() ? '' : 'Configure BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY for direct Stripe subscription actions.',
      },
      {
        provider: 'paypal',
        executionMode: 'paypal-api',
        configured: paypalAccessTokenConfigured(),
        referencePattern: 'I-*',
        executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutionMode(subscription, 'paypal-api')).length,
        blocker: paypalAccessTokenConfigured() ? '' : 'Configure BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN for direct PayPal subscription actions.',
      },
      {
        provider: 'paddle',
        executionMode: 'paddle-api',
        configured: paddleApiKeyConfigured(),
        referencePattern: 'sub_*',
        executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutionMode(subscription, 'paddle-api')).length,
        blocker: paddleApiKeyConfigured() ? '' : 'Configure BACKY_PADDLE_API_KEY or PADDLE_API_KEY for direct Paddle subscription actions.',
      },
      {
        provider: 'square',
        executionMode: 'square-api',
        configured: squareAccessTokenConfigured(),
        referencePattern: 'Square subscription id',
        executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutionMode(subscription, 'square-api')).length,
        blocker: squareAccessTokenConfigured() ? '' : 'Configure BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN for direct Square subscription actions.',
      },
      {
        provider: 'adyen',
        executionMode: 'adyen-api',
        configured: adyenSubscriptionConfigured() || httpActionAdapterConfigured,
        nativeConfigured: adyenSubscriptionConfigured(),
        httpFallbackConfigured: httpActionAdapterConfigured,
        nativeDirectActions: ['cancel'],
        httpFallbackActions: httpActionAdapterConfigured ? SUBSCRIPTION_OPERATOR_ACTIONS : [],
        supportedActions: adyenSupportedActions,
        referencePattern: 'shopperReference or shopperReference:recurringDetailReference',
        executableSubscriptions: subscriptions.filter((subscription) => subscription.paymentProvider === 'adyen' && (subscriptionHasExecutionMode(subscription, 'adyen-api') || subscriptionHasExecutionMode(subscription, 'http-api'))).length,
        blocker: adyenSubscriptionConfigured()
          ? httpActionAdapterConfigured
            ? 'Adyen cancellation uses Recurring disable; pause/resume use the configured HTTP subscription action adapter.'
            : 'Adyen direct subscription execution supports cancellation through Recurring disable; configure an HTTP subscription action adapter for pause/resume.'
          : httpActionAdapterConfigured
            ? 'Adyen lifecycle actions use the configured HTTP subscription action adapter until native Adyen cancellation credentials are configured.'
            : 'Configure BACKY_ADYEN_API_KEY/ADYEN_API_KEY and BACKY_ADYEN_MERCHANT_ACCOUNT/ADYEN_MERCHANT_ACCOUNT for Adyen cancellation actions, or configure BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL for custom lifecycle actions.',
      },
      {
        provider: 'mollie',
        executionMode: 'mollie-api',
        configured: mollieApiKeyConfigured() || httpActionAdapterConfigured,
        nativeConfigured: mollieApiKeyConfigured(),
        httpFallbackConfigured: httpActionAdapterConfigured,
        nativeDirectActions: ['cancel'],
        httpFallbackActions: httpActionAdapterConfigured ? SUBSCRIPTION_OPERATOR_ACTIONS : [],
        supportedActions: mollieSupportedActions,
        referencePattern: 'customerId:subscriptionId or customerId/subscriptionId',
        executableSubscriptions: subscriptions.filter((subscription) => subscription.paymentProvider === 'mollie' && (subscriptionHasExecutionMode(subscription, 'mollie-api') || subscriptionHasExecutionMode(subscription, 'http-api'))).length,
        blocker: mollieApiKeyConfigured()
          ? httpActionAdapterConfigured
            ? 'Mollie cancellation uses the Mollie API; pause/resume use the configured HTTP subscription action adapter.'
            : 'Mollie direct subscription execution supports cancellation; configure an HTTP subscription action adapter for pause/resume.'
          : httpActionAdapterConfigured
            ? 'Mollie lifecycle actions use the configured HTTP subscription action adapter until native Mollie cancellation credentials are configured.'
            : 'Configure BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY for Mollie cancellation actions, or configure BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL for custom lifecycle actions.',
      },
      {
        provider: 'razorpay',
        executionMode: 'razorpay-api',
        configured: razorpayCredentialsConfigured(),
        referencePattern: 'Razorpay subscription id',
        executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutionMode(subscription, 'razorpay-api')).length,
        blocker: razorpayCredentialsConfigured() ? '' : 'Configure BACKY_RAZORPAY_KEY_ID/RAZORPAY_KEY_ID and BACKY_RAZORPAY_KEY_SECRET/RAZORPAY_KEY_SECRET for direct Razorpay subscription actions.',
      },
      {
        provider: 'http',
        executionMode: 'http-api',
        configured: httpActionAdapterConfigured,
        referencePattern: 'provider supplied',
        executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutionMode(subscription, 'http-api')).length,
        blocker: httpActionAdapterConfigured ? '' : 'Configure BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL, COMMERCE_SUBSCRIPTION_ACTION_URL, or Settings commerce subscriptionActionProviderUrl.',
      },
      {
        provider: 'manual',
        executionMode: 'handoff',
        configured: true,
        referencePattern: 'any',
        executableSubscriptions: subscriptions.filter((subscription) => !subscriptionHasExecutableAction(subscription)).length,
        blocker: '',
      },
    ],
    summary: {
      executableSubscriptions: subscriptions.filter((subscription) => subscriptionHasExecutableAction(subscription)).length,
      handoffSubscriptions: subscriptions.filter((subscription) => !subscriptionHasExecutableAction(subscription)).length,
    },
  };

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
    execution,
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

      return lifecycleResponse({
        success: true,
        requestId,
        schemaVersion: SCHEMA_VERSION,
        data: {
          lifecycle,
          collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
        },
        lifecycle,
      }, requestId, site.id);
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

    return lifecycleResponse({
      success: true,
      requestId,
      schemaVersion: SCHEMA_VERSION,
      data: {
        lifecycle,
        collection: { id: ordersCollection.id, slug: ordersCollection.slug, name: ordersCollection.name },
      },
      lifecycle,
    }, requestId, site.id);
  } catch (error) {
    console.error('Admin product subscription lifecycle API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
