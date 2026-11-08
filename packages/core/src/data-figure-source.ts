/** Complete published dataset reads for authoring and public figures. Never uses admin credentials. */
export type BackyPublicDataFigureFetch = (input: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const MAX_ROWS = 5000;
const PAGE_SIZE = 100;
const SCALAR_FIELDS = new Set(['text', 'number', 'boolean', 'date', 'datetime', 'select', 'url', 'email', 'phone', 'slug']);

const publicCollection = (value: unknown, siteId: string): value is Record<string, unknown> => object(value)
  && typeof value.id === 'string' && !!value.id && value.siteId === siteId
  && value.status === 'published' && object(value.permissions) && value.permissions.publicRead === true;

async function readPublicData(url: string, signal: AbortSignal, request: BackyPublicDataFigureFetch): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const response = await request(url, { method: 'GET', credentials: 'omit', signal, headers: { accept: 'application/json' } });
  signal.throwIfAborted();
  if (!response.ok) throw new Error('Published collection data could not be loaded. Try again.');
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (!object(payload) || payload.success !== true || !object(payload.data)) throw new Error('Published collection data returned an invalid response.');
  return payload.data;
}

export async function loadBackyPublicDataFigureRecords({ apiBaseUrl, siteId, collectionId, signal, requestedFields, fetch: request = globalThis.fetch }: {
  apiBaseUrl: string;
  siteId: string;
  collectionId: string;
  signal: AbortSignal;
  /** Public figures resolve only explicitly selected fields; authoring may inspect declared scalar fields. */
  requestedFields?: string[];
  fetch?: BackyPublicDataFigureFetch;
}): Promise<unknown[]> {
  const apiBase = apiBaseUrl.replace(/\/$/, '');
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let previousTotal: number | undefined;
  let selectedFields: string[] | undefined;
  for (;;) {
    const data = await readPublicData(`${apiBase}/sites/${encodeURIComponent(siteId)}/collections/${encodeURIComponent(collectionId)}/records?limit=${PAGE_SIZE}&offset=${offset}`, signal, request);
    if (!publicCollection(data.collection, siteId) || data.collection.id !== collectionId || !Array.isArray(data.records) || !object(data.pagination)) throw new Error('This collection is unavailable for public article figures.');
    const { limit, offset: returnedOffset, total, hasMore } = data.pagination;
    if (returnedOffset !== offset || !Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > PAGE_SIZE || !Number.isInteger(total) || (total as number) < 0 || typeof hasMore !== 'boolean' || data.records.length > (limit as number) || previousTotal !== undefined && previousTotal !== total) throw new Error('Published collection pagination is invalid. Try again.');
    if ((total as number) > MAX_ROWS || rows.length + data.records.length > MAX_ROWS) throw new Error(`This figure supports collections with at most ${MAX_ROWS.toLocaleString()} published records. Choose a smaller collection.`);
    if (hasMore ? data.records.length !== limit || offset + data.records.length >= (total as number) : offset + data.records.length !== total) throw new Error('Published collection pagination is invalid. Try again.');
    const fields = Array.isArray(data.collection.fields) ? data.collection.fields.filter(object) : [];
    const validKey = (key: unknown): key is string => typeof key === 'string' && !!key && !['__proto__', 'constructor', 'prototype'].includes(key);
    const scalarKey = (key: string) => {
      const matches = fields.filter((field) => field.key === key);
      return matches.length === 1 && SCALAR_FIELDS.has(String(matches[0].type));
    };
    const selected = selectedFields ?? (requestedFields === undefined
      ? fields.map((field) => field.key).filter(validKey).filter(scalarKey)
      : [...new Set(requestedFields)]);
    if (selected.some((key) => !validKey(key) || !scalarKey(key)) || requestedFields !== undefined && !selected.length) throw new Error('A selected field is undeclared or unavailable for public figures.');
    selectedFields = selected;
    previousTotal = total as number;
    for (const record of data.records) {
      if (!object(record) || record.siteId !== siteId || record.collectionId !== collectionId || record.status !== 'published' || typeof record.id !== 'string' || !record.id || !object(record.values)) throw new Error('The collection returned a record unavailable for public article figures.');
      if (seen.has(record.id)) throw new Error('The collection changed while loading. Try again.');
      seen.add(record.id);
      const values = record.values;
      rows.push(Object.fromEntries(selected.map((key) => {
        const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        return [key, typeof value === 'string' || typeof value === 'boolean' || value === null || typeof value === 'number' && Number.isFinite(value) ? value : null];
      })));
    }
    if (!hasMore) {
      if (rows.length !== total) throw new Error('The collection changed while loading. Try again.');
      return rows;
    }
    if (!data.records.length || rows.length >= (total as number)) throw new Error('Published collection pagination did not advance. Try again.');
    offset += limit as number;
  }
}
