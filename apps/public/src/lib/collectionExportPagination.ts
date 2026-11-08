export class CollectionExportIncompleteError extends Error {
  constructor() { super('The collection export could not read a complete, consistent snapshot. Retry after content changes finish.'); }
}

/** Read a caller-selected window without silently truncating it to one repository page. */
export async function collectBoundedExportPages<T extends { id: string }>(
  read: Parameters<typeof collectCompleteExportPages<T>>[0],
  limit: number,
  accepts: (item: T) => boolean = () => true,
): Promise<T[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new CollectionExportIncompleteError();
  const items: T[] = [], ids = new Set<string>();
  let total: number | undefined;
  while (items.length < limit) {
    const offset = items.length, requested = Math.min(100, limit - offset);
    let page: Awaited<ReturnType<typeof read>>;
    try { page = await read({ limit: requested, offset }); }
    catch { throw new CollectionExportIncompleteError(); }
    const p = page?.pagination;
    if (!Array.isArray(page?.items) || !p || !Number.isSafeInteger(p.total) || p.total < 0
      || !Number.isSafeInteger(p.limit) || p.limit < 1 || p.limit > requested
      || p.offset !== offset || typeof p.hasMore !== 'boolean'
      || total !== undefined && p.total !== total) throw new CollectionExportIncompleteError();
    total = p.total;
    if (page.items.length !== Math.min(p.limit, total - offset)
      || p.hasMore !== (offset + page.items.length < total)) throw new CollectionExportIncompleteError();
    for (const item of page.items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !accepts(item)) throw new CollectionExportIncompleteError();
      ids.add(item.id); items.push(item);
    }
    if (!p.hasMore) break;
  }
  return items;
}

/** Export every page using the repository's effective page size, or reject the download. */
export async function collectCompleteExportPages<T extends { id: string }>(
  read: (input: { limit: number; offset: number }) => Promise<{
    items: T[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }>,
  accepts: (item: T) => boolean = () => true,
): Promise<T[]> {
  const items: T[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  let offset = 0;
  for (;;) {
    const page = await read({ limit: 100, offset }).catch(() => { throw new CollectionExportIncompleteError(); });
    const pagination = page?.pagination;
    if (!Array.isArray(page?.items) || !pagination
      || !Number.isSafeInteger(pagination.total) || pagination.total < 0
      || !Number.isSafeInteger(pagination.limit) || pagination.limit < 1 || pagination.limit > 100
      || pagination.offset !== offset || typeof pagination.hasMore !== 'boolean'
      || total !== undefined && total !== pagination.total) throw new CollectionExportIncompleteError();
    total = pagination.total;
    const expected = Math.min(pagination.limit, total - offset);
    if (expected < 0 || page.items.length !== expected
      || pagination.hasMore !== (offset + page.items.length < total)) throw new CollectionExportIncompleteError();
    for (const item of page.items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !accepts(item)) throw new CollectionExportIncompleteError();
      ids.add(item.id);
      items.push(item);
    }
    if (!pagination.hasMore) return items;
    offset += page.items.length;
  }
}
