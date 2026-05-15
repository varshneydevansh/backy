/**
 * Admin commerce order provider-refund handoff endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollection, BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import {
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { normalizeCollectionRecordMediaValues, validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

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

interface ProviderRefundPayload {
  id: string;
  status: 'requested' | 'succeeded' | 'failed' | 'requires_action';
  provider: string;
  reference: string;
  amount: number;
  currency: string;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload: Record<string, unknown>;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
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

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : fallback;
};

const stripeSecretKey = () => (
  process.env.BACKY_STRIPE_SECRET_KEY?.trim()
  || process.env.STRIPE_SECRET_KEY?.trim()
  || ''
);

const stripeRefundEndpoint = () => {
  const baseUrl = (
    process.env.BACKY_STRIPE_REFUND_API_BASE_URL?.trim()
    || process.env.BACKY_STRIPE_API_BASE_URL?.trim()
    || process.env.STRIPE_API_BASE_URL?.trim()
    || 'https://api.stripe.com'
  ).replace(/\/$/, '');
  return `${baseUrl}/v1/refunds`;
};

const isStripePaymentIntent = (value: string) => value.startsWith('pi_');
const isStripeCharge = (value: string) => value.startsWith('ch_');
const canExecuteStripeRefund = (provider: string, paymentReference: string) => (
  provider.toLowerCase() === 'stripe' &&
  Boolean(stripeSecretKey()) &&
  (isStripePaymentIntent(paymentReference) || isStripeCharge(paymentReference))
);

const toStripeAmount = (amount: number, currency: string): number => {
  const normalizedCurrency = currency.toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)
    ? Math.max(0, Math.round(amount))
    : Math.max(0, Math.round(amount * 100));
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

const providerRefundAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  refund: ProviderRefundPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  refundId: refund.id,
  refundStatus: refund.status,
  provider: refund.provider,
  amount: refund.amount,
  currency: refund.currency,
  reference: refund.reference,
});

const parseProviderPayload = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const existingRefundPayload = (record: CollectionRecordAuditSource): ProviderRefundPayload | null => {
  const values = toRecord(record.values);
  const id = textValue(values.providerrefundid);
  const status = textValue(values.providerrefundstatus);
  if (!id || !status || status === 'none') return null;

  return {
    id,
    status: status === 'succeeded' || status === 'failed' || status === 'requires_action' ? status : 'requested',
    provider: textValue(values.providerrefundprovider) || textValue(values.paymentprovider) || 'manual',
    reference: textValue(values.providerrefundreference),
    amount: numberValue(values.providerrefundamount, numberValue(values.refundamount, numberValue(values.total))),
    currency: textValue(values.currency) || 'USD',
    reason: textValue(values.providerrefundreason) || textValue(values.refundreason),
    requestedAt: textValue(values.providerrefundrequestedat) || record.updatedAt || new Date().toISOString(),
    completedAt: textValue(values.providerrefundcompletedat) || null,
    providerPayload: parseProviderPayload(values.providerrefundpayload),
  };
};

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const safeStripeRefundPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  status: textValue(value.status),
  amount: Number(value.amount || 0),
  currency: textValue(value.currency),
  charge: textValue(value.charge),
  payment_intent: textValue(value.payment_intent),
  reason: textValue(value.reason),
  failure_reason: textValue(value.failure_reason),
  created: Number(value.created || 0),
});

const safeStripeErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    type: textValue(error.type),
    message: textValue(error.message) || 'Stripe refund request failed.',
    decline_code: textValue(error.decline_code),
    payment_intent: textValue(error.payment_intent),
    charge: textValue(error.charge),
  };
};

const executeStripeRefund = async (input: {
  refundId: string;
  orderId: string;
  orderNumber: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason: string;
}) => {
  const params = new URLSearchParams();
  params.set('amount', String(toStripeAmount(input.amount, input.currency)));
  params.set('reason', 'requested_by_customer');
  params.set('metadata[backy_order_id]', input.orderId);
  params.set('metadata[backy_order_number]', input.orderNumber);
  params.set('metadata[backy_refund_id]', input.refundId);
  params.set('metadata[backy_refund_reason]', input.reason.slice(0, 500));
  if (isStripePaymentIntent(input.paymentReference)) {
    params.set('payment_intent', input.paymentReference);
  } else {
    params.set('charge', input.paymentReference);
  }

  const response = await fetch(stripeRefundEndpoint(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeSecretKey()}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': input.refundId,
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
    payload: safeStripeRefundPayload(payloadRecord),
  };
};

const buildProviderRefundUpdate = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
) => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const existing = existingRefundPayload(record);
  const provider = (textValue(body.provider) || textValue(values.paymentprovider) || 'manual').toLowerCase();
  const amount = numberValue(body.amount, numberValue(values.refundamount, numberValue(values.total)));
  const currency = textValue(values.currency) || 'USD';
  const reason = textValue(body.reason) || textValue(values.refundreason) || 'Provider refund requested from Backy order workflow.';
  const refundId = existing?.id || `rf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const paymentReference = textValue(values.paymentreference);
  const shouldExecuteStripeRefund = canExecuteStripeRefund(provider, paymentReference);
  const orderNumber = textValue(values.ordernumber);
  const providerPayload: Record<string, unknown> = {
    schemaVersion: 'backy.provider-refund.v1',
    action: provider === 'stripe' ? 'refunds.create' : 'provider.refund.create',
    provider,
    executionMode: shouldExecuteStripeRefund ? 'stripe-api' : 'handoff',
    orderId: record.id,
    orderNumber,
    paymentReference,
    amount,
    currency,
    reason,
    idempotencyKey: refundId,
  };
  let status: ProviderRefundPayload['status'] = provider === 'manual' ? 'requires_action' : 'requested';
  let completedAt: string | null = null;
  let providerRefundId = refundId;
  let providerReference = paymentReference ? `${provider}:${paymentReference}:${refundId}` : `${provider}:${refundId}`;
  let statusNote = 'handoff';

  if (shouldExecuteStripeRefund) {
    const result = await executeStripeRefund({
      refundId,
      orderId: record.id,
      orderNumber,
      paymentReference,
      amount,
      currency,
      reason,
    });
    providerPayload.execution = result;
    if (result.ok) {
      if (result.payload.status === 'succeeded') {
        status = 'succeeded';
        completedAt = new Date().toISOString();
      } else if (result.payload.status === 'failed' || result.payload.status === 'canceled') {
        status = 'failed';
      } else {
        status = 'requested';
      }
      providerRefundId = result.payload.id || refundId;
      providerReference = `${provider}:${result.payload.id || refundId}`;
      statusNote = 'executed';
    } else {
      status = 'failed';
      statusNote = 'failed';
    }
  }

  const refund: ProviderRefundPayload = {
    id: providerRefundId,
    status,
    provider,
    reference: providerReference,
    amount,
    currency,
    reason,
    requestedAt: existing?.requestedAt || now,
    completedAt,
    providerPayload,
  };
  const shouldMarkRefunded = !shouldExecuteStripeRefund || status === 'succeeded';

  return {
    refund,
    values: {
      ...values,
      ...(shouldMarkRefunded ? {
        orderstatus: 'refunded',
        paymentstatus: 'refunded',
        fulfillmentstatus: 'cancelled',
      } : {}),
      refundamount: amount,
      refundreason: reason,
      providerrefundstatus: refund.status,
      providerrefundprovider: refund.provider,
      providerrefundid: refund.id,
      providerrefundreference: refund.reference,
      providerrefundamount: refund.amount,
      providerrefundreason: refund.reason,
      providerrefundrequestedat: refund.requestedAt,
      providerrefundcompletedat: refund.completedAt,
      providerrefundpayload: JSON.stringify(refund.providerPayload, null, 2),
      notes: appendNote(values.notes, `Provider refund ${statusNote} ${refund.status} ${now} for ${currency} ${amount.toFixed(2)} via ${provider}.`),
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, orderId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const collection = await repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG);
      if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
      if (commerceAccess) return commerceAccess;

      const record = await repositories.collections.getRecordById(site.id, collection.id, orderId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, orderId);
      if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

      return NextResponse.json({ success: true, requestId, data: { record, refund: existingRefundPayload(record) } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    return NextResponse.json({ success: true, requestId, data: { record, refund: existingRefundPayload(record) } });
  } catch (error) {
    console.error('Admin order provider refund read API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, orderId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const collection = await repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG);
      if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
      if (commerceAccess) return commerceAccess;

      const record = await repositories.collections.getRecordById(site.id, collection.id, orderId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, orderId);
      if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

      const { refund, values: rawValues } = await buildProviderRefundUpdate(record, body);
      const values = normalizeCollectionRecordMediaValues(collection, rawValues);
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Provider refund values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'order-provider-refund-requested',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collectionRecord',
        entityId: updated.id,
        action: 'update',
        before: collectionRecordAuditMetadata(collection, record),
        after: collectionRecordAuditMetadata(collection, updated),
        metadata: providerRefundAuditMetadata(collection, updated, refund),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, refund, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    const { refund, values: rawValues } = await buildProviderRefundUpdate(record, body);
    const values = normalizeCollectionRecordMediaValues(collection as unknown as BackyCollection, rawValues);
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Provider refund values are invalid', requestId, validationErrors);
    }

    const updated = updateAdminCollectionRecord(site.id, collection.id, record.id, { values });
    if (!updated) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: updated.id,
      action: 'update',
      before: collectionRecordAuditMetadata(collection, record),
      after: collectionRecordAuditMetadata(collection, updated),
      metadata: providerRefundAuditMetadata(collection, updated, refund),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, refund } });
  } catch (error) {
    console.error('Admin order provider refund create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
