import { adminFetch, getAdminApiBase, type Collection } from './adminContentApi';

export interface CollectionDesignRevisionSummary {
  id: string;
  createdAt: string;
  operation: 'template-upgrade' | 'restore';
  templateId: string | null;
  targetRevisionId: string | null;
  hasPinnedBaseline: boolean;
}
export interface CollectionDesignVersions {
  siteId: string;
  collectionId: string;
  currentVersion: string;
  revisions: CollectionDesignRevisionSummary[];
  pagination: { offset: number; limit: number; hasMore: boolean; nextOffset: number | null };
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): value is string => typeof value === 'string' && /^collection-v1:[a-f0-9]{64}$/.test(value);
const base = (siteId: string, collectionId: string) => `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/collections/${encodeURIComponent(collectionId)}/design-versions`;
async function result(response: Response, signal: AbortSignal): Promise<Record<string, any>> {
  const payload: unknown = await response.json(); signal.throwIfAborted();
  if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) {
    throw Error(object(payload) && object(payload.error) && typeof payload.error.message === 'string'
      ? payload.error.message : 'Collection design history could not load. Reload before retrying.');
  }
  return payload.data;
}
export async function loadCollectionDesignVersions(siteId: string, collectionId: string, signal: AbortSignal, request: typeof fetch = adminFetch, options: { offset?: number; limit?: number } = {}): Promise<CollectionDesignVersions> {
  signal.throwIfAborted();
  const offset = options.offset ?? 0, limit = options.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('Choose a valid design history page.');
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const data = await result(await request(`${base(siteId, collectionId)}?${query}`, { method: 'GET', credentials: 'include', signal }), signal);
  if (data.siteId !== siteId || data.collectionId !== collectionId || !version(data.currentVersion) || !Array.isArray(data.revisions)) throw Error('Collection design history is incompatible. Reload the collection.');
  if (!object(data.pagination) || data.pagination.offset !== offset || data.pagination.limit !== limit || data.revisions.length > limit
    || typeof data.pagination.hasMore !== 'boolean' || (data.pagination.hasMore ? data.revisions.length !== limit || data.pagination.nextOffset !== offset + limit : data.pagination.nextOffset !== null)) throw Error('Collection design history pagination is incompatible. Reload the collection.');
  const ids = new Set<string>();
  for (const row of data.revisions) {
    if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
      || !['template-upgrade', 'restore'].includes(row.operation) || typeof row.hasPinnedBaseline !== 'boolean'
      || !(row.templateId === null || typeof row.templateId === 'string') || !(row.targetRevisionId === null || typeof row.targetRevisionId === 'string')) throw Error('Collection design history contains incompatible revisions. Reload the collection.');
    ids.add(row.id);
  }
  return data as unknown as CollectionDesignVersions;
}
export async function restoreCollectionDesignVersion(siteId: string, collectionId: string, revisionId: string, expectedVersion: string, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<{ collection: Collection; completionWarnings: string[] }> {
  signal.throwIfAborted();
  if (!version(expectedVersion)) throw Error('Reload the current collection before restoring its design.');
  const data = await result(await request(`${base(siteId, collectionId)}/${encodeURIComponent(revisionId)}/restore`, {
    method: 'POST', credentials: 'include', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion }),
  }), signal);
  if (data.siteId !== siteId || data.collectionId !== collectionId || data.restoredFromRevisionId !== revisionId
    || !object(data.collection) || data.collection.id !== collectionId || data.collection.siteId !== siteId
    || !version(data.collection.version) || !Array.isArray(data.collection.fields) || !Array.isArray(data.completionWarnings) || data.completionWarnings.some((warning: unknown) => typeof warning !== 'string')) throw Error('Collection design restore response is incompatible. Reload the collection before continuing.');
  return { collection: data.collection as Collection, completionWarnings: data.completionWarnings };
}
