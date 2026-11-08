import { adminFetch, getAdminApiBase, type CollectionRecord } from './adminContentApi';

export interface ProductDesignRevisionSummary {
  id: string;
  createdAt: string;
  operation: 'template-upgrade' | 'restore';
  templateId: string | null;
  targetRevisionId: string | null;
  hasPinnedBaseline: boolean;
}
export interface ProductDesignVersions {
  siteId: string;
  collectionId: string;
  productId: string;
  currentVersion: string;
  revisions: ProductDesignRevisionSummary[];
  pagination: { offset: number; limit: number; hasMore: boolean; nextOffset: number | null };
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): value is string => typeof value === 'string' && /^record-v1:[a-f0-9]{64}$/.test(value);
const base = (siteId: string, productId: string) => `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/commerce/products/${encodeURIComponent(productId)}/design-versions`;
async function result(response: Response, signal: AbortSignal): Promise<Record<string, any>> {
  const payload: unknown = await response.json(); signal.throwIfAborted();
  if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) {
    throw Error(object(payload) && object(payload.error) && typeof payload.error.message === 'string'
      ? payload.error.message : 'Product design history could not load. Reload before retrying.');
  }
  return payload.data;
}
export async function loadProductDesignVersions(siteId: string, productId: string, collectionId: string, signal: AbortSignal, request: typeof fetch = adminFetch, options: { offset?: number; limit?: number } = {}): Promise<ProductDesignVersions> {
  signal.throwIfAborted();
  const offset = options.offset ?? 0, limit = options.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('Choose a valid design history page.');
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const data = await result(await request(`${base(siteId, productId)}?${query}`, { method: 'GET', credentials: 'include', signal }), signal);
  if (data.siteId !== siteId || data.productId !== productId || data.collectionId !== collectionId || !version(data.currentVersion) || !Array.isArray(data.revisions)) throw Error('Product design history is incompatible. Reload the product.');
  if (!object(data.pagination) || data.pagination.offset !== offset || data.pagination.limit !== limit || data.revisions.length > limit
    || typeof data.pagination.hasMore !== 'boolean' || (data.pagination.hasMore ? data.revisions.length !== limit || data.pagination.nextOffset !== offset + limit : data.pagination.nextOffset !== null)) throw Error('Product design history pagination is incompatible. Reload the product.');
  const ids = new Set<string>();
  for (const row of data.revisions) {
    if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
      || !['template-upgrade', 'restore'].includes(row.operation) || typeof row.hasPinnedBaseline !== 'boolean'
      || !(row.templateId === null || typeof row.templateId === 'string') || !(row.targetRevisionId === null || typeof row.targetRevisionId === 'string')) throw Error('Product design history contains incompatible revisions. Reload the product.');
    ids.add(row.id);
  }
  return data as unknown as ProductDesignVersions;
}
export async function restoreProductDesignVersion(siteId: string, productId: string, collectionId: string, revisionId: string, expectedVersion: string, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<{ record: CollectionRecord; completionWarnings: string[] }> {
  signal.throwIfAborted();
  if (!version(expectedVersion)) throw Error('Reload the current product before restoring its design.');
  const data = await result(await request(`${base(siteId, productId)}/${encodeURIComponent(revisionId)}/restore`, {
    method: 'POST', credentials: 'include', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion }),
  }), signal);
  if (data.siteId !== siteId || data.productId !== productId || data.collectionId !== collectionId || data.restoredFromRevisionId !== revisionId
    || !object(data.record) || data.record.id !== productId || data.record.siteId !== siteId || data.record.collectionId !== collectionId
    || !version(data.record.version) || !object(data.record.values) || !Array.isArray(data.completionWarnings) || data.completionWarnings.some((warning: unknown) => typeof warning !== 'string')) throw Error('Product design restore response is incompatible. Reload the product before continuing.');
  return { record: data.record as CollectionRecord, completionWarnings: data.completionWarnings };
}
