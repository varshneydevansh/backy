/**
 * Admin product subscription lifecycle action endpoint.
 *
 * POST /api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/[orderId]/action
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollection, BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { PRODUCT_COLLECTION_SLUG, productRecordToCommerceProduct, type CommerceSourceRecord } from '@/lib/commerceCatalog';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import {
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from '@/lib/backyStore';
import { normalizeCollectionRecordMediaValues, validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

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
  status: CommerceSourceRecord['status'] | string;
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
  schemaVersion: 'backy.product-subscription-action.v1';
  action: 'pause' | 'resume' | 'cancel';
  status: 'requested' | 'succeeded' | 'failed' | 'requires_action';
  provider: string;
  executionMode: 'stripe-api' | 'paypal-api' | 'handoff';
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
  | { error: { status: number; code: string; message: string; details?: unknown } };

const ORDERS_COLLECTION_SLUG = 'orders';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details }, errorMessage: message }, { status })
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

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const sourceRecordFromRecord = (record: SourceRecord): CommerceSourceRecord => ({
  id: record.id,
  slug: record.slug,
  status: record.status as CommerceSourceRecord['status'],
  values: record.values,
  updatedAt: record.updatedAt || '',
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

const parseItems = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.map(toRecord);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(toRecord) : [];
  } catch {
    return [];
  }
};

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

const orderContainsProduct = (order: SourceRecord, productRecord: SourceRecord): boolean => {
  const product = productRecordToCommerceProduct(sourceRecordFromRecord(productRecord));
  return parseItems(order.values?.items).some((item) => itemMatchesProduct(item, {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    title: product.title,
  }));
};

const normalizeAction = (value: unknown): SubscriptionLifecycleAction['action'] | null => {
  const action = textValue(value).toLowerCase();
  return action === 'pause' || action === 'resume' || action === 'cancel' ? action : null;
};

const stripeSecretKey = () => (
  process.env.BACKY_STRIPE_SECRET_KEY?.trim()
  || process.env.STRIPE_SECRET_KEY?.trim()
  || ''
);

const stripeApiBaseUrl = () => (
  process.env.BACKY_STRIPE_API_BASE_URL?.trim()
  || process.env.STRIPE_API_BASE_URL?.trim()
  || 'https://api.stripe.com'
).replace(/\/$/, '');

const stripeSubscriptionEndpoint = (subscriptionReference: string) => (
  `${stripeApiBaseUrl()}/v1/subscriptions/${encodeURIComponent(subscriptionReference)}`
);

const stripeResumeEndpoint = (subscriptionReference: string) => (
  `${stripeSubscriptionEndpoint(subscriptionReference)}/resume`
);

const canExecuteStripeSubscriptionAction = (provider: string, subscriptionReference: string) => (
  provider.toLowerCase() === 'stripe' &&
  Boolean(stripeSecretKey()) &&
  subscriptionReference.startsWith('sub_')
);

const paypalAccessToken = () => (
  process.env.BACKY_PAYPAL_ACCESS_TOKEN?.trim()
  || process.env.PAYPAL_ACCESS_TOKEN?.trim()
  || ''
);

const paypalApiBaseUrl = () => (
  process.env.BACKY_PAYPAL_API_BASE_URL?.trim()
  || process.env.PAYPAL_API_BASE_URL?.trim()
  || 'https://api-m.paypal.com'
).replace(/\/$/, '');

const paypalSubscriptionEndpoint = (subscriptionReference: string, action: SubscriptionLifecycleAction['action']) => {
  const paypalAction = action === 'pause' ? 'suspend' : action === 'resume' ? 'activate' : 'cancel';
  return `${paypalApiBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionReference)}/${paypalAction}`;
};

const canExecutePayPalSubscriptionAction = (provider: string, subscriptionReference: string) => (
  provider.toLowerCase() === 'paypal' &&
  Boolean(paypalAccessToken()) &&
  Boolean(subscriptionReference)
);

const safeStripeSubscriptionPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  status: textValue(value.status),
  cancelAtPeriodEnd: Boolean(value.cancel_at_period_end ?? value.cancelAtPeriodEnd),
  canceledAt: value.canceled_at ?? value.canceledAt ?? null,
  currentPeriodEnd: value.current_period_end ?? value.currentPeriodEnd ?? null,
  pauseCollection: toRecord(value.pause_collection || value.pauseCollection),
});

const safeStripeErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    type: textValue(error.type),
    message: textValue(error.message) || 'Stripe subscription action failed.',
    declineCode: textValue(error.decline_code || error.declineCode),
    requestLogUrl: textValue(error.request_log_url || error.requestLogUrl),
  };
};

const safePayPalErrorPayload = (value: Record<string, unknown>) => ({
  name: textValue(value.name),
  message: textValue(value.message) || 'PayPal subscription action failed.',
  debugId: textValue(value.debug_id || value.debugId),
  issue: textValue(toRecord(Array.isArray(value.details) ? value.details[0] : {}).issue),
  description: textValue(toRecord(Array.isArray(value.details) ? value.details[0] : {}).description),
});

const executeStripeSubscriptionAction = async (input: {
  action: SubscriptionLifecycleAction['action'];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const params = new URLSearchParams();
  params.set('metadata[backy_subscription_action_id]', input.actionId);
  params.set('metadata[backy_subscription_action]', input.action);
  params.set('metadata[backy_subscription_action_reason]', input.reason.slice(0, 500));

  let method = 'POST';
  let url = stripeSubscriptionEndpoint(input.subscriptionReference);

  if (input.action === 'pause') {
    params.set('pause_collection[behavior]', 'void');
  } else if (input.action === 'resume') {
    url = stripeResumeEndpoint(input.subscriptionReference);
  } else {
    method = 'DELETE';
    params.set('cancellation_details[comment]', input.reason.slice(0, 500));
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${stripeSecretKey()}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': input.actionId,
    },
    body: params,
    cache: 'no-store',
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
  action: SubscriptionLifecycleAction['action'];
  actionId: string;
  subscriptionReference: string;
  reason: string;
}) => {
  const response = await fetch(paypalSubscriptionEndpoint(input.subscriptionReference, input.action), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${paypalAccessToken()}`,
      'content-type': 'application/json',
      'paypal-request-id': input.actionId,
    },
    body: JSON.stringify({
      reason: input.reason.slice(0, 128),
    }),
    cache: 'no-store',
  });
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
      status: input.action === 'pause' ? 'SUSPENDED' : input.action === 'resume' ? 'ACTIVE' : 'CANCELLED',
      httpStatus: response.status,
    },
  };
};

const appendNote = (current: unknown, note: string): string => {
  const existing = textValue(current);
  return existing ? `${existing}\n${note}` : note;
};

const lifecycleEventName = (action: SubscriptionLifecycleAction['action']) => {
  if (action === 'pause') return 'customer.subscription.paused';
  if (action === 'resume') return 'customer.subscription.resumed';
  return 'customer.subscription.deleted';
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

const buildSubscriptionActionUpdate = async (
  productRecord: SourceRecord,
  orderRecord: SourceRecord,
  body: Record<string, unknown>,
): Promise<SubscriptionActionUpdateResult> => {
  const actionName = normalizeAction(body.action);
  if (!actionName) {
    return { error: { status: 400, code: 'INVALID_SUBSCRIPTION_ACTION', message: 'Subscription action must be pause, resume, or cancel.' } };
  }

  if (!orderContainsProduct(orderRecord, productRecord)) {
    return { error: { status: 404, code: 'SUBSCRIPTION_ORDER_NOT_FOUND', message: 'Subscription order is not attached to this product.' } };
  }

  const now = new Date().toISOString();
  const values = toRecord(orderRecord.values);
  const product = productRecordToCommerceProduct(sourceRecordFromRecord(productRecord));
  const provider = (textValue(body.provider) || textValue(values.paymentprovider) || 'manual').toLowerCase();
  const subscriptionReference = textValue(body.subscriptionReference) || textValue(values.paymentreference);
  if (!subscriptionReference) {
    return { error: { status: 400, code: 'SUBSCRIPTION_REFERENCE_REQUIRED', message: 'A provider subscription reference is required before running lifecycle actions.' } };
  }

  const reason = textValue(body.reason) || `Backy operator requested subscription ${actionName}.`;
  const actionId = `subact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const shouldExecuteStripe = canExecuteStripeSubscriptionAction(provider, subscriptionReference);
  const shouldExecutePayPal = canExecutePayPalSubscriptionAction(provider, subscriptionReference);
  const executionMode: SubscriptionLifecycleAction['executionMode'] = shouldExecuteStripe ? 'stripe-api' : shouldExecutePayPal ? 'paypal-api' : 'handoff';
  const providerPayload: Record<string, unknown> = {
    schemaVersion: 'backy.product-subscription-action.v1',
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
  let status: SubscriptionLifecycleAction['status'] = shouldExecuteStripe || shouldExecutePayPal ? 'requested' : 'requires_action';
  let completedAt: string | null = null;
  let statusNote = shouldExecuteStripe || shouldExecutePayPal ? 'requested' : 'handoff';

  if (shouldExecuteStripe) {
    const result = await executeStripeSubscriptionAction({
      action: actionName,
      actionId,
      subscriptionReference,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      status = 'succeeded';
      completedAt = new Date().toISOString();
      statusNote = 'executed';
    } else {
      status = 'failed';
      completedAt = new Date().toISOString();
      statusNote = 'failed';
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
      status = 'succeeded';
      completedAt = new Date().toISOString();
      statusNote = 'executed';
    } else {
      status = 'failed';
      completedAt = new Date().toISOString();
      statusNote = 'failed';
    }
  }

  const action: SubscriptionLifecycleAction = {
    id: actionId,
    schemaVersion: 'backy.product-subscription-action.v1',
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
  const shouldApplyLocalState = status === 'succeeded' || status === 'requires_action';
  const lifecycleNote = `[${now}] Subscription action ${statusNote} ${status}: ${lifecycleEventName(actionName)} for ${subscriptionReference} via ${provider}. Reason: ${reason}`;

  return {
    action,
    values: {
      ...values,
      ...(shouldApplyLocalState && actionName === 'cancel' ? {
        orderstatus: 'cancelled',
        ...(textValue(values.fulfillmentstatus) === 'fulfilled' ? {} : { fulfillmentstatus: 'cancelled' }),
      } : {}),
      ...(shouldApplyLocalState && actionName === 'resume' ? {
        orderstatus: 'paid',
        paymentstatus: 'paid',
        paidat: textValue(values.paidat) || now,
      } : {}),
      paymentreference: subscriptionReference,
      notes: appendNote(values.notes, lifecycleNote),
    },
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, productId, orderId } = await params;
    const body = await parseJsonBody(request);

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
      const commerceAccess = await requireCommerceCollectionAccess(request, requestId, ordersCollection.slug, 'edit');
      if (commerceAccess) return commerceAccess;

      const [product, order] = await Promise.all([
        repositories.collections.getRecordById(site.id, productsCollection.id, productId)
          || repositories.collections.getRecordBySlug(site.id, productsCollection.id, productId),
        repositories.collections.getRecordById(site.id, ordersCollection.id, orderId)
          || repositories.collections.getRecordBySlug(site.id, ordersCollection.id, orderId),
      ]);
      if (!product) return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);
      if (!order) return errorResponse(404, 'ORDER_NOT_FOUND', 'Subscription order not found', requestId);

      const result = await buildSubscriptionActionUpdate(product, order, body);
      if ('error' in result) return errorResponse(result.error.status, result.error.code, result.error.message, requestId, result.error.details);

      const values = normalizeCollectionRecordMediaValues(ordersCollection, result.values);
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Subscription action values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, ordersCollection.id, order.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'product-subscription-action',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collectionRecord',
        entityId: updated.id,
        action: 'update',
        before: collectionRecordAuditMetadata(ordersCollection, order),
        after: collectionRecordAuditMetadata(ordersCollection, updated),
        metadata: subscriptionActionAuditMetadata(ordersCollection, updated, result.action),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { action: result.action, record: updated, order: updated, cacheInvalidation }, action: result.action });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const productsCollection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG, { includeUnpublished: true });
    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!productsCollection) return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
    if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, ordersCollection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const product = getCollectionRecordByIdOrSlug(site.id, productsCollection.id, productId, { includeUnpublished: true });
    const order = getCollectionRecordByIdOrSlug(site.id, ordersCollection.id, orderId, { includeUnpublished: true });
    if (!product) return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);
    if (!order) return errorResponse(404, 'ORDER_NOT_FOUND', 'Subscription order not found', requestId);

    const result = await buildSubscriptionActionUpdate(product, order, body);
    if ('error' in result) return errorResponse(result.error.status, result.error.code, result.error.message, requestId, result.error.details);

    const values = normalizeCollectionRecordMediaValues(ordersCollection as unknown as BackyCollection, result.values);
    const validationErrors = validateCollectionRecordValues(ordersCollection, values, {
      existingValues: order.values,
      excludeRecordId: order.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Subscription action values are invalid', requestId, validationErrors);
    }

    const updated = updateAdminCollectionRecord(site.id, ordersCollection.id, order.id, { values });
    if (!updated) return errorResponse(404, 'ORDER_NOT_FOUND', 'Subscription order not found', requestId);

    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: updated.id,
      action: 'update',
      before: collectionRecordAuditMetadata(ordersCollection, order),
      after: collectionRecordAuditMetadata(ordersCollection, updated),
      metadata: subscriptionActionAuditMetadata(ordersCollection, updated, result.action),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { action: result.action, record: updated, order: updated }, action: result.action });
  } catch (error) {
    console.error('Admin product subscription action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
