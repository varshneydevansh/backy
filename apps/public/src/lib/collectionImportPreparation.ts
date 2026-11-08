import type { BackyCollection, BackyCollectionImportOperation, BackyCollectionRecord, BackyCollectionCreateInput, BackyCollectionRecordCreateInput } from '@backy-cms/core';
import { validateCollectionRecordValueTypes, normalizeCollectionRecordValues, type StoreCollection } from '@/lib/backyStore';
import { validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { collectCompleteCollectionInventory } from '@/lib/collectionInventory';
import { findCollectionRouteConflict, type RouteConflictPage } from '@/lib/routeConflicts';

export class CollectionImportValidationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) { super(message); }
}
type ImportedCollection = Omit<BackyCollectionCreateInput, 'siteId'> & { records: Array<Omit<BackyCollectionRecordCreateInput, 'siteId' | 'collectionId'> & { slug: string }> };

/** Validate the complete final inventory without mutating existing schemas or records. */
export async function prepareCollectionImport(input: {
  siteId: string;
  collections: ImportedCollection[];
  upsert: boolean;
  pages: RouteConflictPage[];
  getCollection: (slug: string) => Promise<BackyCollection | null>;
  readRecords: (collectionId: string, pagination: { limit: number; offset: number }) => Promise<{ items: BackyCollectionRecord[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>;
  mediaRepository: { getById: (siteId: string, mediaId: string) => Promise<any> };
}): Promise<BackyCollectionImportOperation[]> {
  const operations: BackyCollectionImportOperation[] = [];
  for (const collectionInput of input.collections) {
    const existing = await input.getCollection(collectionInput.slug);
    if (existing && !input.upsert) throw new CollectionImportValidationError(409, 'SLUG_CONFLICT', 'A collection with this slug already exists.', { slug: collectionInput.slug });
    const conflict = findCollectionRouteConflict({ ...collectionInput, id: existing?.id }, input.pages);
    if (conflict) throw new CollectionImportValidationError(409, 'ROUTE_CONFLICT', conflict.message, { slug: collectionInput.slug });
    const { records: incoming, ...schemaInput } = collectionInput;
    const collection = { ...existing, ...schemaInput, id: existing?.id || `pending:${collectionInput.slug}`, siteId: input.siteId, createdAt: existing?.createdAt || '', updatedAt: existing?.updatedAt || '' } as BackyCollection;
    const expectedRecords = existing ? await collectCompleteCollectionInventory(pagination => input.readRecords(existing.id, pagination), record => record.siteId === input.siteId && record.collectionId === existing.id) : [];
    const records = incoming.map((record, index) => {
      const previous = expectedRecords.find(item => item.slug === record.slug) || null;
      if (previous && !input.upsert) throw new CollectionImportValidationError(409, 'RECORD_SLUG_CONFLICT', 'A collection record with this slug already exists.', { collectionSlug: collection.slug, recordSlug: record.slug });
      const inputIssues = validateCollectionRecordValueTypes(collection as unknown as StoreCollection, record.values, previous?.values || {});
      if (inputIssues.length) throw new CollectionImportValidationError(400, 'VALIDATION_ERROR', 'Collection record values are invalid.', { collectionSlug: collection.slug, recordSlug: record.slug, issues: inputIssues });
      const values = normalizeCollectionRecordValues(collection as unknown as StoreCollection, record.values, previous?.values || {}) as BackyCollectionRecord['values'];
      return { input: { ...record, values }, expectedRecord: previous, preparedId: previous?.id || `pending:${index}` };
    });
    const replaced = new Set(records.map(record => record.expectedRecord?.id).filter(Boolean));
    const finalRecords = [...expectedRecords.filter(record => !replaced.has(record.id)), ...records.map(record => ({ ...record.input, id: record.preparedId, siteId: input.siteId, collectionId: collection.id, createdAt: '', updatedAt: '' } as BackyCollectionRecord))];
    const repository = { listRecords: async ({ limit = 100, offset = 0 }: { limit?: number; offset?: number }) => ({ items: finalRecords.slice(offset, offset + limit), pagination: { total: finalRecords.length, limit, offset, hasMore: offset + limit < finalRecords.length } }) };
    for (const record of records) {
      const issues = await validateRepositoryCollectionRecordValues({ repository, mediaRepository: input.mediaRepository, siteId: input.siteId, collection, values: record.input.values, existingValues: record.expectedRecord?.values, excludeRecordId: record.preparedId, skipLocalUnique: true });
      if (issues.length) throw new CollectionImportValidationError(400, 'VALIDATION_ERROR', 'Collection record values are invalid.', { collectionSlug: collection.slug, recordSlug: record.input.slug, issues });
    }
    operations.push({ input: schemaInput, expectedCollection: existing, expectedRecords, records: records.map(({ input: recordInput, expectedRecord }) => ({ input: recordInput, expectedRecord })) });
  }
  return operations;
}
