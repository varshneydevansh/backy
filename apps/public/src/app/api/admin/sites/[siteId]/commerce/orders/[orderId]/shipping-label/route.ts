/**
 * Admin commerce order shipping-label handoff endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/shipping-label
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/shipping-label
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

const ORDERS_COLLECTION_SLUG = 'orders';

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

const shippingLabelAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  label: ShippingLabelPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  labelId: label.id,
  labelStatus: label.status,
  provider: label.provider,
  serviceLevel: label.serviceLevel,
  cost: label.cost,
});

interface ShippingLabelPayload {
  id: string;
  status: 'draft' | 'purchased' | 'voided';
  provider: string;
  serviceLevel: string;
  url: string;
  cost: number;
  createdAt: string;
}

const buildLabelUrl = (origin: string, siteId: string, orderId: string): string => (
  `${origin.replace(/\/$/, '')}/api/admin/sites/${encodeURIComponent(siteId)}/commerce/orders/${encodeURIComponent(orderId)}/shipping-label`
);

const existingLabelPayload = (
  origin: string,
  siteId: string,
  record: CollectionRecordAuditSource,
): ShippingLabelPayload | null => {
  const values = toRecord(record.values);
  const id = textValue(values.shippinglabelid);
  const status = textValue(values.shippinglabelstatus);
  if (!id || !status || status === 'none') return null;

  return {
    id,
    status: status === 'purchased' || status === 'voided' ? status : 'draft',
    provider: textValue(values.shippinglabelprovider) || 'manual',
    serviceLevel: textValue(values.shippingservicelevel) || 'standard',
    url: textValue(values.shippinglabelurl) || buildLabelUrl(origin, siteId, record.id),
    cost: numberValue(values.shippinglabelcost),
    createdAt: textValue(values.shippinglabelcreatedat) || record.updatedAt || new Date().toISOString(),
  };
};

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const buildShippingLabelUpdate = ({
  siteId,
  origin,
  record,
  body,
}: {
  siteId: string;
  origin: string;
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
}) => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const existing = existingLabelPayload(origin, siteId, record);
  const provider = textValue(body.provider) || textValue(values.fulfillmentcarrier) || 'manual';
  const serviceLevel = textValue(body.serviceLevel) || textValue(values.shippingservicelevel) || 'standard';
  const labelId = existing?.id || `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const labelUrl = buildLabelUrl(origin, siteId, record.id);
  const cost = numberValue(body.cost, numberValue(values.shippinglabelcost, numberValue(values.shippingamount)));
  const currentFulfillmentStatus = textValue(values.fulfillmentstatus) || 'unfulfilled';
  const nextFulfillmentStatus = currentFulfillmentStatus === 'fulfilled' || currentFulfillmentStatus === 'cancelled'
    ? currentFulfillmentStatus
    : 'processing';
  const createdAt = existing?.createdAt || now;
  const label: ShippingLabelPayload = {
    id: labelId,
    status: 'draft',
    provider,
    serviceLevel,
    url: labelUrl,
    cost,
    createdAt,
  };

  return {
    label,
    values: {
      ...values,
      fulfillmentstatus: nextFulfillmentStatus,
      fulfillmentcarrier: textValue(values.fulfillmentcarrier) || provider,
      shippinglabelstatus: label.status,
      shippinglabelprovider: label.provider,
      shippinglabelid: label.id,
      shippinglabelurl: label.url,
      shippingservicelevel: label.serviceLevel,
      shippinglabelcost: label.cost,
      shippinglabelcreatedat: label.createdAt,
      notes: appendNote(values.notes, `Shipping label handoff prepared ${now} with ${provider} ${serviceLevel}.`),
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
    const { siteId, orderId } = await params;
    const origin = new URL(request.url).origin;
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

      return NextResponse.json({ success: true, requestId, data: { record, label: existingLabelPayload(origin, site.id, record) } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    return NextResponse.json({ success: true, requestId, data: { record, label: existingLabelPayload(origin, site.id, record) } });
  } catch (error) {
    console.error('Admin order shipping label read API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, orderId } = await params;
    const origin = new URL(request.url).origin;
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

      const { label, values: rawValues } = buildShippingLabelUpdate({ siteId: site.id, origin, record, body });
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Shipping label values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'order-shipping-label-prepared',
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
        metadata: shippingLabelAuditMetadata(collection, updated, label),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, label, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    const { label, values: rawValues } = buildShippingLabelUpdate({ siteId: site.id, origin, record, body });
    const values = normalizeCollectionRecordMediaValues(collection as unknown as BackyCollection, rawValues);
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Shipping label values are invalid', requestId, validationErrors);
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
      metadata: shippingLabelAuditMetadata(collection, updated, label),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, label } });
  } catch (error) {
    console.error('Admin order shipping label create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
