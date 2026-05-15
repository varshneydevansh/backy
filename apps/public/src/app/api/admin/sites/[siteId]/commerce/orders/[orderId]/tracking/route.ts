/**
 * Admin commerce order tracking refresh endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/tracking
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/tracking
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

interface TrackingPayload {
  status: string;
  provider: string;
  trackingNumber: string;
  trackingUrl: string;
  checkedAt: string;
  providerPayload?: Record<string, unknown>;
}

type TrackingUpdateResult =
  | { tracking: TrackingPayload; values: Record<string, unknown> }
  | { error: { status: number; code: string; message: string; details?: unknown } };

const ORDERS_COLLECTION_SLUG = 'orders';
const EASYPOST_API_BASE = 'https://api.easypost.com/v2';

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

const trackingAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  tracking: TrackingPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  trackingStatus: tracking.status,
  provider: tracking.provider,
  trackingNumber: tracking.trackingNumber,
  trackingUrl: tracking.trackingUrl,
  checkedAt: tracking.checkedAt,
});

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const easyPostApiKey = () => (
  process.env.BACKY_EASYPOST_API_KEY?.trim()
  || process.env.EASYPOST_API_KEY?.trim()
  || ''
);

const normalizeProviderKey = (value: string): string => value.toLowerCase().replace(/[\s_-]+/g, '');

const shouldExecuteEasyPostTracking = (body: Record<string, unknown>): boolean => {
  const executionProvider = textValue(body.executionProvider) || textValue(body.trackingProvider) || textValue(body.provider);
  return Boolean(easyPostApiKey()) && normalizeProviderKey(executionProvider || 'easypost') === 'easypost';
};

const safeEasyPostTrackerPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.id),
  object: textValue(value.object),
  mode: textValue(value.mode),
  status: textValue(value.status),
  carrier: textValue(value.carrier),
  trackingCode: textValue(value.tracking_code),
  publicUrl: textValue(value.public_url),
  signedBy: textValue(value.signed_by),
  estDeliveryDate: textValue(value.est_delivery_date),
  createdAt: textValue(value.created_at),
  updatedAt: textValue(value.updated_at),
});

const safeEasyPostErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    message: textValue(error.message) || textValue(value.message) || 'EasyPost tracking refresh failed.',
    errors: Array.isArray(error.errors) ? error.errors.slice(0, 5) : [],
  };
};

const easyPostHeaders = () => ({
  authorization: `Basic ${Buffer.from(`${easyPostApiKey()}:`).toString('base64')}`,
  'content-type': 'application/json',
});

const executeEasyPostTracking = async (input: {
  trackingNumber: string;
  carrier: string;
}): Promise<{ ok: boolean; payload: Record<string, unknown>; tracking?: Partial<TrackingPayload> }> => {
  const response = await fetch(`${EASYPOST_API_BASE}/trackers`, {
    method: 'POST',
    headers: easyPostHeaders(),
    body: JSON.stringify({
      tracker: {
        tracking_code: input.trackingNumber,
        ...(input.carrier ? { carrier: input.carrier } : {}),
      },
    }),
    cache: 'no-store',
  });
  const payload = toRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.tracking.v1',
        provider: 'easypost',
        action: 'trackers.create',
        executionMode: 'easypost-api',
        error: safeEasyPostErrorPayload(payload),
      },
    };
  }

  const tracker = safeEasyPostTrackerPayload(payload);
  return {
    ok: true,
    payload: {
      schemaVersion: 'backy.tracking.v1',
      provider: 'easypost',
      action: 'trackers.create',
      executionMode: 'easypost-api',
      tracker,
    },
    tracking: {
      status: tracker.status || 'unknown',
      provider: tracker.carrier || input.carrier || 'easypost',
      trackingUrl: tracker.publicUrl,
    },
  };
};

const existingTrackingPayload = (record: CollectionRecordAuditSource): TrackingPayload | null => {
  const values = toRecord(record.values);
  const trackingNumber = textValue(values.trackingnumber);
  if (!trackingNumber) return null;
  return {
    status: textValue(values.trackingstatus) || textValue(values.fulfillmentstatus) || 'unknown',
    provider: textValue(values.fulfillmentcarrier) || 'manual',
    trackingNumber,
    trackingUrl: textValue(values.trackingurl),
    checkedAt: textValue(values.trackinglastcheckedat) || record.updatedAt || new Date().toISOString(),
  };
};

const buildTrackingUpdate = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
): Promise<TrackingUpdateResult> => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const trackingNumber = textValue(body.trackingNumber) || textValue(values.trackingnumber);
  if (!trackingNumber) {
    return {
      error: {
        status: 400,
        code: 'TRACKING_NUMBER_REQUIRED',
        message: 'A tracking number is required before tracking can be refreshed.',
      },
    };
  }

  const provider = textValue(body.provider) || textValue(values.fulfillmentcarrier) || 'manual';
  const trackingUrl = textValue(body.trackingUrl) || textValue(values.trackingurl);
  let status = textValue(values.trackingstatus) || textValue(values.fulfillmentstatus) || 'processing';
  let providerPayload: Record<string, unknown> = {
    schemaVersion: 'backy.tracking.v1',
    provider,
    action: 'provider.tracking.refresh',
    executionMode: 'handoff',
    trackingNumber,
  };

  if (shouldExecuteEasyPostTracking(body)) {
    const result = await executeEasyPostTracking({ trackingNumber, carrier: provider });
    providerPayload = result.payload;
    if (result.ok && result.tracking) {
      status = result.tracking.status || status;
    } else {
      status = 'refresh_failed';
    }
  } else {
    status = status === 'unfulfilled' ? 'processing' : status;
  }

  const normalizedStatus = status.toLowerCase();
  const isDelivered = normalizedStatus === 'delivered';
  const nextFulfillmentStatus = isDelivered
    ? 'fulfilled'
    : textValue(values.fulfillmentstatus) === 'unfulfilled'
      ? 'processing'
      : textValue(values.fulfillmentstatus) || 'processing';
  const nextOrderStatus = isDelivered && textValue(values.paymentstatus) === 'paid'
    ? 'fulfilled'
    : textValue(values.orderstatus) || 'open';
  const nextFulfilledAt = isDelivered
    ? textValue(values.fulfilledat) || now
    : textValue(values.fulfilledat) || null;
  const tracking: TrackingPayload = {
    status,
    provider,
    trackingNumber,
    trackingUrl: (providerPayload.tracker && typeof providerPayload.tracker === 'object'
      ? textValue((providerPayload.tracker as Record<string, unknown>).publicUrl)
      : '') || trackingUrl,
    checkedAt: now,
    providerPayload,
  };

  return {
    tracking,
    values: {
      ...values,
      orderstatus: nextOrderStatus,
      fulfillmentstatus: nextFulfillmentStatus,
      fulfillmentcarrier: provider,
      trackingnumber: tracking.trackingNumber,
      trackingurl: tracking.trackingUrl,
      trackingstatus: tracking.status,
      trackinglastcheckedat: tracking.checkedAt,
      fulfilledat: nextFulfilledAt,
      notes: appendNote(values.notes, `Tracking refreshed ${now} for ${tracking.provider} ${tracking.trackingNumber}: ${tracking.status}.`),
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

      return NextResponse.json({ success: true, requestId, data: { record, tracking: existingTrackingPayload(record) } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    return NextResponse.json({ success: true, requestId, data: { record, tracking: existingTrackingPayload(record) } });
  } catch (error) {
    console.error('Admin order tracking read API error:', error);
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

      const result = await buildTrackingUpdate(record, body);
      if ('error' in result) return errorResponse(result.error.status, result.error.code, result.error.message, requestId);

      const values = normalizeCollectionRecordMediaValues(collection, result.values);
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Tracking values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'order-tracking-refreshed',
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
        metadata: trackingAuditMetadata(collection, updated, result.tracking),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, tracking: result.tracking, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    const result = await buildTrackingUpdate(record, body);
    if ('error' in result) return errorResponse(result.error.status, result.error.code, result.error.message, requestId);

    const values = normalizeCollectionRecordMediaValues(collection as unknown as BackyCollection, result.values);
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Tracking values are invalid', requestId, validationErrors);
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
      metadata: trackingAuditMetadata(collection, updated, result.tracking),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, tracking: result.tracking } });
  } catch (error) {
    console.error('Admin order tracking refresh API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
