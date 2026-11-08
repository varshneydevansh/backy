import { collectCompleteExportPages, CollectionExportIncompleteError } from './collectionExportPagination';

export class CollectionInventoryIncompleteError extends Error {
  constructor() { super('The complete site content inventory could not be verified. Retry after content changes finish.'); }
}

/** Route admission must inspect the full canonical site inventory before any write. */
export async function collectCompleteCollectionInventory<T extends { id: string }>(
  read: (input: { limit: number; offset: number }) => Promise<{ items: T[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>,
  accepts: (item: T) => boolean,
): Promise<T[]> {
  try { return await collectCompleteExportPages(read, accepts); }
  catch (error) { if (error instanceof CollectionExportIncompleteError) throw new CollectionInventoryIncompleteError(); throw error; }
}

export async function collectCollectionRoutePages<T extends { id: string; siteId: string }>(
  siteId: string,
  read: (input: { limit: number; offset: number }) => Promise<{ items: T[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>,
): Promise<T[]> {
  return collectCompleteCollectionInventory(read, item => item.siteId === siteId);
}
