/** Fetch the complete site library for management, insert and refresh controls. */
export async function loadReusableSectionLibrary<T extends { id: string; siteId: string }>(
  endpoint: string, siteId: string, filters: URLSearchParams,
  fetcher: (url: string) => Promise<Response>,
): Promise<T[]> {
  const sections: T[] = [], ids = new Set<string>();
  let total: number | undefined, offset = 0;
  for (let page = 0; page < 1_000; page++) {
    const query = new URLSearchParams(filters); query.set('limit', '100'); query.set('offset', String(offset));
    const response = await fetcher(`${endpoint}?${query}`);
    const payload = await response.json();
    if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error?.message || 'Unable to load reusable sections');
    const next = payload.data.sections as T[], p = payload.data.pagination;
    if (!Array.isArray(next) || !p || !Number.isSafeInteger(p.total) || p.total < 0 || p.total > 100_000
      || !Number.isSafeInteger(p.limit) || p.limit < 1 || p.limit > 100 || p.offset !== offset
      || typeof p.hasMore !== 'boolean' || total !== undefined && total !== p.total
      || next.length !== Math.min(p.limit, Math.max(0, p.total - offset))
      || p.hasMore !== (offset + next.length < p.total)) throw new Error('Reusable section library could not be loaded completely. Refresh and retry.');
    total = p.total;
    for (const section of next) {
      if (!section || typeof section.id !== 'string' || !section.id || section.siteId !== siteId || ids.has(section.id)) throw new Error('Reusable section library contains inconsistent site or pagination data. Refresh and retry.');
      ids.add(section.id); sections.push(section);
    }
    if (!p.hasMore) return sections;
    offset += next.length;
  }
  throw new Error('Reusable section library exceeds the supported inventory size. Narrow the library and retry.');
}
