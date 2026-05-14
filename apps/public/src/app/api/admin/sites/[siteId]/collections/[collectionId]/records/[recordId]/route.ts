/**
 * Admin CMS collection record detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * PATCH  /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 * DELETE /api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollectionRecord, BackyJsonObject, BackyJsonValue, PublishStatus } from '@backy-cms/core';
import {
  PRODUCT_COLLECTION_SLUG,
} from '@/lib/commerceCatalog';
import {
  deleteAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
  type StoreCollection,
} from '@/lib/backyStore';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    collectionId: string;
    recordId: string;
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
}

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

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const parseStatus = (value: unknown): PublishStatus | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : undefined
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

const updateAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  changedFields: Object.keys(body),
});

type CommerceRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type DemoCollectionRecord = NonNullable<ReturnType<typeof getCollectionRecordByIdOrSlug>>;

const ORDER_COLLECTION_SLUG = 'orders';

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const numericValue = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toLineItemRecords = (value: unknown): Array<Record<string, unknown>> => {
  const source = typeof value === 'string'
    ? (() => {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })()
    : Array.isArray(value)
      ? value
      : [];

  return source.filter((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  ));
};

const isRestorableProductRecord = (record: unknown): record is { id: string; status: PublishStatus; values: Record<string, unknown> } => (
  Boolean(record)
  && typeof record === 'object'
  && !Array.isArray(record)
  && typeof (record as { id?: unknown }).id === 'string'
  && Boolean((record as { values?: unknown }).values)
  && typeof (record as { values?: unknown }).values === 'object'
  && !Array.isArray((record as { values?: unknown }).values)
);

const parseVariantSource = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const hasVariantIdentifier = (lineItem: Record<string, unknown>): boolean => {
  const variant = lineItem.variant && typeof lineItem.variant === 'object' && !Array.isArray(lineItem.variant)
    ? lineItem.variant as Record<string, unknown>
    : {};
  return Boolean(textValue(variant.id || lineItem.variantId) || textValue(variant.sku || lineItem.variantSku));
};

const isOrderInventoryTerminal = (values: Record<string, unknown>): boolean => {
  const orderStatus = textValue(values.orderstatus).toLowerCase();
  const paymentStatus = textValue(values.paymentstatus).toLowerCase();
  const fulfillmentStatus = textValue(values.fulfillmentstatus).toLowerCase();
  return orderStatus === 'cancelled'
    || orderStatus === 'refunded'
    || paymentStatus === 'refunded'
    || fulfillmentStatus === 'cancelled';
};

const shouldRestoreOrderInventory = (
  collectionSlug: string,
  beforeValues: Record<string, unknown>,
  afterValues: Record<string, unknown>,
): boolean => (
  collectionSlug === ORDER_COLLECTION_SLUG
  && !textValue(beforeValues.inventoryrestoredat)
  && !isOrderInventoryTerminal(beforeValues)
  && isOrderInventoryTerminal(afterValues)
);

const restoreVariantInventory = (
  values: Record<string, unknown>,
  lineItem: Record<string, unknown>,
  quantity: number,
): { values: Record<string, unknown> | null; restored: boolean } => {
  const variant = lineItem.variant && typeof lineItem.variant === 'object' && !Array.isArray(lineItem.variant)
    ? lineItem.variant as Record<string, unknown>
    : {};
  const variantId = textValue(variant.id || lineItem.variantId);
  const variantSku = textValue(variant.sku || lineItem.variantSku);
  if (!variantId && !variantSku) {
    return { values: null, restored: false };
  }

  let restored = false;
  const nextVariants = parseVariantSource(values.variants).map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return source;
    }

    const candidate = source as Record<string, unknown>;
    const candidateId = textValue(candidate.id) || `variant-${index + 1}`;
    const candidateSku = textValue(candidate.sku);
    const matches = (variantId && candidateId === variantId) || (variantSku && candidateSku === variantSku);
    const inventory = numericValue(candidate.inventory);
    if (!matches || inventory === null) {
      return source;
    }

    restored = true;
    return {
      ...candidate,
      inventory: inventory + quantity,
    };
  });

  return restored
    ? { values: { ...values, variants: nextVariants }, restored }
    : { values: null, restored: false };
};

const orderInventoryRestoreMetadata = (summary: {
  restoredQuantity: number;
  restoredLineItems: number;
  skippedLineItems: number;
  errors: string[];
}) => ({
  inventoryrestoredat: new Date().toISOString(),
  inventoryrestorestatus: summary.errors.length > 0
    ? summary.restoredLineItems > 0 ? 'partial' : 'failed'
    : summary.restoredLineItems > 0 ? 'restored' : 'skipped',
  inventoryrestoredquantity: summary.restoredQuantity,
  inventoryrestoredlineitems: summary.restoredLineItems,
  inventoryrestoreskippedlineitems: summary.skippedLineItems,
  inventoryrestoreerrors: summary.errors,
});

const applyRepositoryOrderInventoryRestore = async (input: {
  repositories: CommerceRepositories;
  siteId: string;
  collection: CollectionAuditSource;
  before: BackyCollectionRecord;
  after: BackyCollectionRecord;
}): Promise<BackyCollectionRecord> => {
  if (!shouldRestoreOrderInventory(input.collection.slug, input.before.values, input.after.values)) {
    return input.after;
  }

  const summary = {
    restoredQuantity: 0,
    restoredLineItems: 0,
    skippedLineItems: 0,
    errors: [] as string[],
  };
  const productsCollection = await input.repositories.collections.getBySlug(input.siteId, PRODUCT_COLLECTION_SLUG);
  if (!productsCollection) {
    summary.errors.push('Products collection not found for inventory restore.');
  }

  for (const lineItem of toLineItemRecords(input.after.values.items)) {
    const quantity = Math.max(0, Math.floor(Number(lineItem.quantity || 0)));
    if (!productsCollection || quantity <= 0 || textValue(lineItem.productType).toLowerCase() !== 'physical') {
      summary.skippedLineItems += 1;
      continue;
    }

    const productRecord = textValue(lineItem.productId)
      ? await input.repositories.collections.getRecordById(input.siteId, productsCollection.id, textValue(lineItem.productId))
      : await input.repositories.collections.getRecordBySlug(input.siteId, productsCollection.id, textValue(lineItem.slug));
    if (!isRestorableProductRecord(productRecord)) {
      summary.errors.push(`Product not found for order line ${textValue(lineItem.productId || lineItem.slug) || 'unknown'}.`);
      continue;
    }

    const variantRestore = restoreVariantInventory(productRecord.values, lineItem, quantity);
    if (hasVariantIdentifier(lineItem) && !variantRestore.restored) {
      summary.skippedLineItems += 1;
      continue;
    }
    const nextValues = variantRestore.values || {
      ...productRecord.values,
      inventory: Math.max(0, numericValue(productRecord.values.inventory) || 0) + quantity,
    };

    await input.repositories.collections.updateRecord(input.siteId, productsCollection.id, productRecord.id, {
      status: productRecord.status,
      values: toJsonRecord(nextValues),
    });
    summary.restoredQuantity += quantity;
    summary.restoredLineItems += 1;
  }

  return (await input.repositories.collections.updateRecord(input.siteId, input.collection.id, input.after.id, {
    status: input.after.status,
    values: toJsonRecord({
      ...input.after.values,
      ...orderInventoryRestoreMetadata(summary),
    }),
  })).item;
};

const applyDemoOrderInventoryRestore = (input: {
  siteId: string;
  collection: CollectionAuditSource;
  before: DemoCollectionRecord;
  after: DemoCollectionRecord;
}): DemoCollectionRecord => {
  if (!shouldRestoreOrderInventory(input.collection.slug, input.before.values, input.after.values)) {
    return input.after;
  }

  const summary = {
    restoredQuantity: 0,
    restoredLineItems: 0,
    skippedLineItems: 0,
    errors: [] as string[],
  };
  const productsCollection = getCollectionByIdOrSlug(input.siteId, PRODUCT_COLLECTION_SLUG, { includeUnpublished: true });
  if (!productsCollection) {
    summary.errors.push('Products collection not found for inventory restore.');
  }

  for (const lineItem of toLineItemRecords(input.after.values.items)) {
    const quantity = Math.max(0, Math.floor(Number(lineItem.quantity || 0)));
    if (!productsCollection || quantity <= 0 || textValue(lineItem.productType).toLowerCase() !== 'physical') {
      summary.skippedLineItems += 1;
      continue;
    }

    const productRecord = getCollectionRecordByIdOrSlug(
      input.siteId,
      productsCollection.id,
      textValue(lineItem.productId) || textValue(lineItem.slug),
      { includeUnpublished: true },
    );
    if (!isRestorableProductRecord(productRecord)) {
      summary.errors.push(`Product not found for order line ${textValue(lineItem.productId || lineItem.slug) || 'unknown'}.`);
      continue;
    }

    const variantRestore = restoreVariantInventory(productRecord.values, lineItem, quantity);
    if (hasVariantIdentifier(lineItem) && !variantRestore.restored) {
      summary.skippedLineItems += 1;
      continue;
    }
    const nextValues = variantRestore.values || {
      ...productRecord.values,
      inventory: Math.max(0, numericValue(productRecord.values.inventory) || 0) + quantity,
    };

    updateAdminCollectionRecord(input.siteId, productsCollection.id, productRecord.id, {
      status: productRecord.status,
      values: nextValues,
    });
    summary.restoredQuantity += quantity;
    summary.restoredLineItems += 1;
  }

  return updateAdminCollectionRecord(input.siteId, input.collection.id, input.after.id, {
    status: input.after.status,
    values: {
      ...input.after.values,
      ...orderInventoryRestoreMetadata(summary),
    },
  }) || input.after;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'collections.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId, recordId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }
      const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
      if (commerceAccess) {
        return commerceAccess;
      }

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      return NextResponse.json({ success: true, requestId, data: { collection, record } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }
    const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) {
      return commerceAccess;
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    return NextResponse.json({ success: true, requestId, data: { collection, record } });
  } catch (error) {
    console.error('Admin collection record detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'collections.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId, recordId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }
      const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
      if (commerceAccess) {
        return commerceAccess;
      }

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      const body = await parseJsonBody(request);
      const values = body.values === undefined ? record.values : toRecord(body.values);
      const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);
      const nextScheduledAt = typeof body.scheduledAt === 'string' || body.scheduledAt === null
        ? body.scheduledAt
        : undefined;

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Record slug is required', requestId);
      }

      if (nextSlug && nextSlug !== record.slug) {
        const conflict = await repositories.collections.getRecordBySlug(site.id, collection.id, nextSlug);
        if (conflict && conflict.id !== record.id) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A collection record with this slug already exists', requestId);
        }
      }

      const validationErrors = validateCollectionRecordValues(collection as unknown as StoreCollection, values, {
        existingValues: record.values,
        excludeRecordId: record.id,
      });
      if (validationErrors.length > 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
      }

      let updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        ...(body.values === undefined ? {} : { values: toJsonRecord(values) }),
        ...(parseStatus(body.status) ? { status: parseStatus(body.status) } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(nextScheduledAt !== undefined ? { scheduledAt: nextScheduledAt } : {}),
      })).item;
      updated = await applyRepositoryOrderInventoryRestore({
        repositories,
        siteId: site.id,
        collection,
        before: record,
        after: updated,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'collection-record-updated',
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
        metadata: updateAuditMetadata(collection, updated, body),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }
    const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) {
      return commerceAccess;
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    const body = await parseJsonBody(request);
    const values = body.values === undefined ? {} : toRecord(body.values);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Record slug is required', requestId);
    }

    if (nextSlug && nextSlug !== record.slug) {
      const conflict = getCollectionRecordByIdOrSlug(site.id, collection.id, nextSlug, { includeUnpublished: true });
      if (conflict && conflict.id !== record.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A collection record with this slug already exists', requestId);
      }
    }

    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Collection record values are invalid', requestId, validationErrors);
    }

    let updated = updateAdminCollectionRecord(site.id, collection.id, record.id, {
      ...body,
      ...(body.values === undefined ? {} : { values }),
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }
    updated = applyDemoOrderInventoryRestore({
      siteId: site.id,
      collection,
      before: record,
      after: updated,
    });
    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: updated.id,
      action: 'update',
      before: collectionRecordAuditMetadata(collection, record),
      after: collectionRecordAuditMetadata(collection, updated),
      metadata: updateAuditMetadata(collection, updated, body),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated } });
  } catch (error) {
    console.error('Admin collection record update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'collections.delete' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, collectionId, recordId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const collection = await repositories.collections.getById(site.id, collectionId)
        || await repositories.collections.getBySlug(site.id, collectionId);
      if (!collection) {
        return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
      }
      const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'delete');
      if (commerceAccess) {
        return commerceAccess;
      }

      const record = await repositories.collections.getRecordById(site.id, collection.id, recordId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, recordId);
      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }

      const deleted = await repositories.collections.deleteRecord(site.id, collection.id, record.id);
      if (!deleted) {
        return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: record.id,
        reason: 'collection-record-deleted',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collectionRecord',
        entityId: record.id,
        action: 'delete',
        before: collectionRecordAuditMetadata(collection, record),
        metadata: collectionRecordAuditMetadata(collection, record),
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          recordId: record.id,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, collectionId, { includeUnpublished: true });
    if (!collection) {
      return errorResponse(404, 'COLLECTION_NOT_FOUND', 'Collection not found', requestId);
    }
    const commerceAccess = requireCommerceCollectionAccess(request, requestId, collection.slug, 'delete');
    if (commerceAccess) {
      return commerceAccess;
    }

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, recordId, { includeUnpublished: true });
    if (!record) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }

    const deleted = deleteAdminCollectionRecord(site.id, collection.id, record.id);
    if (!deleted) {
      return errorResponse(404, 'RECORD_NOT_FOUND', 'Collection record not found', requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: record.id,
      action: 'delete',
      before: collectionRecordAuditMetadata(collection, record),
      metadata: collectionRecordAuditMetadata(collection, record),
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        recordId: record.id,
      },
    });
  } catch (error) {
    console.error('Admin collection record delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
