const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export type RegistryFetch = (url: string, init: RequestInit) => Promise<Response>;

/** A failed, stale or malformed later page rejects the entire catalog instead of leaving partial choices. */
export async function loadInteractiveRegistryPages(url: string, siteId: string, signal: AbortSignal, request: RegistryFetch = fetch,
  credentials: RequestCredentials = 'omit'): Promise<Record<string, unknown> & { components: Record<string, unknown>[] }> {
  const entries: Record<string, unknown>[] = [];
  const identities = new Set<string>();
  let total: number | undefined;
  let result: Record<string, unknown> = {};
  let expectedSite: string | undefined;
  while (true) {
    signal.throwIfAborted();
    const pageUrl = entries.length ? `${url}?limit=100&offset=${entries.length}` : url;
    const response = await request(pageUrl, { method: 'GET', credentials, signal, headers: { accept: 'application/json' } });
    signal.throwIfAborted();
    if (!response.ok) throw new Error('Site components could not load. Try again.');
    const payload: unknown = await response.json();
    signal.throwIfAborted();
    if (!object(payload) || payload.success !== true || !object(payload.data) || payload.data.siteId !== siteId || !Array.isArray(payload.data.components)) throw new Error('Site components returned an invalid response.');
    const page = payload.data;
    expectedSite ||= String(page.siteId);
    if (expectedSite !== page.siteId) throw new Error('Site components returned an invalid response.');
    if (!entries.length) result = page;
    const pagination = object(page.pagination) ? page.pagination : undefined;
    if (pagination) {
      if (!Number.isSafeInteger(pagination.total) || Number(pagination.total) < 0 || pagination.offset !== entries.length || typeof pagination.hasMore !== 'boolean'
        || (total !== undefined && total !== pagination.total)) throw new Error('Site components changed while loading. Try again.');
      total = Number(pagination.total);
    } else if (entries.length) throw new Error('Site components returned invalid pagination.');
    for (const entry of page.components as unknown[]) {
      if (!object(entry) || typeof entry.componentKey !== 'string' || typeof entry.version !== 'string') throw new Error('Site components returned an invalid response.');
      const identity = JSON.stringify([entry.componentKey, entry.version]);
      if (identities.has(identity)) throw new Error('Site components changed while loading. Try again.');
      identities.add(identity); entries.push(entry);
    }
    if (!pagination) break;
    if (entries.length > total! || pagination.hasMore !== (entries.length < total!) || (pagination.hasMore && (page.components as unknown[]).length === 0)) throw new Error('Site components returned invalid pagination.');
    if (!pagination.hasMore) break;
  }
  return { ...result, components: entries, pagination: { total: entries.length, limit: entries.length, offset: 0, hasMore: false } };
}
