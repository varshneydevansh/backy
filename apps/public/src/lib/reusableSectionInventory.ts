import { collectCompleteExportPages } from './collectionExportPagination';

export class ReusableSectionInventoryError extends Error {
  readonly code = 'REUSABLE_SECTION_INVENTORY_INCOMPLETE';
  constructor() { super('Reusable section inventory could not be completed. Retry after resolving pagination or concurrent content changes. No propagation writes were started.'); }
}

/** Read every scoped page or refuse export/propagation; never silently cap the library. */
export async function readReusableSectionInventory<T extends { id: string; siteId: string }>(
  siteId: string,
  read: (input: { limit: number; offset: number }) => Promise<{
    items: T[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }>,
  accepts: (item: T) => boolean = () => true,
): Promise<T[]> {
  let pages = 0;
  try {
    return await collectCompleteExportPages(async input => {
      if (++pages > 1_000) throw new ReusableSectionInventoryError();
      const page = await read(input);
      if (page.pagination?.total > 100_000) throw new ReusableSectionInventoryError();
      return page;
    }, item => item.siteId === siteId && accepts(item));
  } catch { throw new ReusableSectionInventoryError(); }
}
