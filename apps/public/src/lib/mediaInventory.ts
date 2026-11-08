import { collectCompleteExportPages } from './collectionExportPagination';
export class MediaInventoryIncompleteError extends Error {
  readonly code = 'MEDIA_INVENTORY_INCOMPLETE';
  constructor() { super('A complete media inventory is unavailable. Retry after resolving pagination or concurrent media changes.'); }
}
/** Finish using effective pagination, or refuse partial totals/quota decisions before writes. */
export async function readCompleteMediaInventory<T extends { id: string; siteId: string }>(
  siteId: string,
  read: (pagination: { limit: number; offset: number }) => Promise<{ items: T[]; pagination?: { total: number; limit: number; offset: number; hasMore: boolean } }>,
): Promise<T[]> {
  let pages = 0;
  try {
    return await collectCompleteExportPages(async pagination => {
      if (++pages > 1000) throw new MediaInventoryIncompleteError();
      const result = await read(pagination);
      if (!result.pagination || result.pagination.total > 100_000) throw new MediaInventoryIncompleteError();
      return { items: result.items, pagination: result.pagination };
    }, item => item.siteId === siteId);
  } catch { throw new MediaInventoryIncompleteError(); }
}
