import type { BackyCollectionRecord, BackyJsonValue, PublishStatus } from '@backy-cms/core';
import { PRODUCT_COLLECTION_SLUG } from '@/lib/commerceCatalog';
import {
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  updateAdminCollectionRecord,
} from '@/lib/backyStore';
import type { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';

type CommerceRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type DemoCollectionRecord = NonNullable<ReturnType<typeof getCollectionRecordByIdOrSlug>>;

export interface OrderInventoryCollection {
  id: string;
  name?: string;
  slug: string;
}

const ORDER_COLLECTION_SLUG = 'orders';

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const numericValue = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

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

export const shouldRestoreOrderInventory = (
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

export const applyRepositoryOrderInventoryRestore = async (input: {
  repositories: CommerceRepositories;
  siteId: string;
  collection: OrderInventoryCollection;
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

export const applyDemoOrderInventoryRestore = (input: {
  siteId: string;
  collection: OrderInventoryCollection;
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
