/** Complete, bounded registry usage/migration reads. Never return a truncated scan. */
export class InteractiveComponentInventoryError extends Error {
  readonly code = 'INTERACTIVE_COMPONENT_INVENTORY_INCOMPLETE';
  constructor() { super('Component inventory could not be completed. Retry after resolving pagination or concurrent content changes. No migration writes were started.'); }
}
const PAGE_SIZE = 200;
const MAX_ITEMS = 100_000;
const MAX_PAGES = 1_000;
export async function readInteractiveComponentInventory<T extends { id: string; siteId?: string }>(
  siteId: string,
  load: (offset: number, limit: number) => Promise<{ items: T[]; pagination?: { total?: number; limit?: number; offset?: number; hasMore?: boolean } }>,
): Promise<T[]> {
  const items: T[] = [], ids = new Set<string>();
  let offset = 0, total: number | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await load(offset, PAGE_SIZE), p = result.pagination;
      if (!Array.isArray(result.items) || !p || !Number.isSafeInteger(p.total) || p.total! < 0 || p.total! > MAX_ITEMS
        || !Number.isSafeInteger(p.limit) || p.limit! < 1 || p.limit! > PAGE_SIZE || p.offset !== offset || typeof p.hasMore !== 'boolean') throw new InteractiveComponentInventoryError();
      if (total !== undefined && total !== p.total) throw new InteractiveComponentInventoryError();
      total = p.total!;
      const expectedCount = Math.min(p.limit!, Math.max(0, total - offset));
      if (result.items.length !== expectedCount || p.hasMore !== (offset + expectedCount < total)) throw new InteractiveComponentInventoryError();
      for (const item of result.items) {
        if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || (item.siteId !== undefined && item.siteId !== siteId)) throw new InteractiveComponentInventoryError();
        ids.add(item.id); items.push(item);
      }
      if (!p.hasMore) {
        if (items.length !== total) throw new InteractiveComponentInventoryError();
        return items;
      }
      if (expectedCount === 0) throw new InteractiveComponentInventoryError();
      offset += expectedCount;
    }
  } catch {
    // Includes unavailable repositories. Do not leak provider errors or return partial data.
    throw new InteractiveComponentInventoryError();
  }
  throw new InteractiveComponentInventoryError();
}
