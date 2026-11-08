import type { BackyCollectionRepository } from '@backy-cms/core';
import type { RenderDataSource } from './renderPayload';

type JsonRecord = Record<string, unknown>;
const object = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const KEYS = new Set(['backy.chart.line', 'backy.chart.bar', 'backy.table.data']);
const SCALAR_FIELDS = new Set(['text', 'number', 'boolean', 'date', 'datetime', 'select', 'url', 'email', 'phone', 'slug']);
export const PUBLIC_DATA_FIGURE_MAX_ROWS = 5000;
const PAGE_SIZE = 100;
const MAX_DEPTH = 40;
const MAX_NODES = 10_000;

export interface PublicDataFigureDataset {
  collection?: JsonRecord;
  records: JsonRecord[];
  error?: string;
  reason?: string;
}
export type PublicDataFigureDatasetResolver = (collectionId: string) => PublicDataFigureDataset;
const failure = (reason: string, error: string): PublicDataFigureDataset => ({ records: [], reason, error });
const validCollection = (value: unknown, siteId: string): value is JsonRecord => object(value)
  && typeof value.id === 'string' && !!value.id && value.siteId === siteId
  && value.status === 'published' && object(value.permissions) && value.permissions.publicRead === true
  && Array.isArray(value.fields);

/** Validate every page; an incomplete, changing or private dataset is never presented as complete. */
export function inspectPublicDataFigurePage(siteId: string, collectionId: string, payload: unknown, offset: number, previousTotal?: number) {
  if (!object(payload) || !Array.isArray(payload.items) || !object(payload.pagination)) throw new Error('invalid-pagination');
  const { limit, total, hasMore, offset: returnedOffset } = payload.pagination;
  if (returnedOffset !== offset || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > PAGE_SIZE
    || !Number.isInteger(total) || Number(total) < 0 || typeof hasMore !== 'boolean' || payload.items.length > Number(limit)
    || (previousTotal !== undefined && previousTotal !== total)) throw new Error('invalid-pagination');
  if (Number(total) > PUBLIC_DATA_FIGURE_MAX_ROWS || offset + payload.items.length > PUBLIC_DATA_FIGURE_MAX_ROWS) throw new Error('row-budget');
  const records = payload.items.map((record) => {
    if (!object(record) || record.siteId !== siteId || record.collectionId !== collectionId || record.status !== 'published'
      || typeof record.id !== 'string' || !record.id || !object(record.values)) throw new Error('private-record');
    return record;
  });
  if (hasMore ? records.length !== Number(limit) || offset + records.length >= Number(total) : offset + records.length !== total) throw new Error('invalid-pagination');
  return { records, total: Number(total), hasMore, nextOffset: offset + Number(limit) };
}

const datasetError = (error: unknown): PublicDataFigureDataset => {
  const reason = error instanceof Error ? error.message : '';
  if (reason === 'row-budget') return failure(reason, 'This figure supports at most 5,000 published records. Choose a smaller collection.');
  if (reason === 'private-record') return failure(reason, 'The collection returned a record unavailable for public figures.');
  if (reason === 'invalid-pagination') return failure(reason, 'The collection changed or returned incomplete data. Reload to try again.');
  return failure('unavailable', 'Published collection data could not be loaded.');
};

/** Find collection-backed rich figures only; unrelated metadata is not a dataset source. */
export function collectPublicDataFigureCollectionIds(value: unknown): string[] {
  const ids = new Set<string>();
  const ancestors = new WeakSet<object>();
  let remaining = MAX_NODES;
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > MAX_DEPTH || --remaining < 0 || ancestors.has(value)) return;
    ancestors.add(value);
    if (Array.isArray(value)) value.forEach((child) => visit(child, depth + 1));
    else if (object(value)) {
      if (value.type === 'data_figure' && KEYS.has(String(value.componentKey)) && object(value.source)
        && value.source.type === 'collection' && typeof value.source.collectionId === 'string' && value.source.collectionId.trim()) ids.add(value.source.collectionId.trim());
      for (const key of ['elements', 'contentDocument', 'props', 'content', 'children']) visit(value[key], depth + 1);
    }
    ancestors.delete(value);
  };
  visit(value, 0);
  return [...ids];
}

/** Target-only repository prefetch; no arbitrary URL fetch and no authoring/store writes. */
export async function preparePublicDataFigureDatasets(siteId: string, content: unknown,
  repository: Pick<BackyCollectionRepository, 'getById' | 'getBySlug' | 'listRecords'>): Promise<Map<string, PublicDataFigureDataset>> {
  const datasets = new Map<string, PublicDataFigureDataset>();
  await Promise.all(collectPublicDataFigureCollectionIds(content).map(async (collectionId) => {
    try {
      const collection = await repository.getById(siteId, collectionId) || await repository.getBySlug(siteId, collectionId);
      if (!validCollection(collection, siteId)) {
        datasets.set(collectionId, failure('private-collection', 'This collection is unavailable for public figures.'));
        return;
      }
      const records: JsonRecord[] = [];
      const seen = new Set<string>();
      let offset = 0, total: number | undefined;
      for (;;) {
        const payload = await repository.listRecords({ siteId, collectionId: collection.id as string,
          status: 'published', includeUnpublished: false, limit: PAGE_SIZE, offset });
        const page = inspectPublicDataFigurePage(siteId, collection.id as string, payload, offset, total);
        total = page.total;
        for (const record of page.records) {
          if (seen.has(record.id as string)) throw new Error('invalid-pagination');
          seen.add(record.id as string);
          records.push(record);
        }
        if (!page.hasMore) break;
        offset = page.nextOffset;
      }
      datasets.set(collectionId, { collection, records });
    } catch (error) { datasets.set(collectionId, datasetError(error)); }
  }));
  return datasets;
}

export async function withPublicDataFigureDatasets(siteId: string, content: unknown,
  repository: Pick<BackyCollectionRepository, 'getById' | 'getBySlug' | 'listRecords'>, dataSource: RenderDataSource): Promise<RenderDataSource> {
  const datasets = await preparePublicDataFigureDatasets(siteId, content, repository);
  return { ...dataSource, getDataFigureDataset: (requestedSiteId, collectionId) => requestedSiteId === siteId
    ? datasets.get(collectionId) : failure('private-collection', 'This collection is unavailable for public figures.') };
}

/** Demo/in-process equivalent of the same published paginated query. */
export function loadPublicDataFigureDataset(siteId: string, collectionId: string, getCollection: (siteId: string, id: string) => unknown,
  listRecords: (siteId: string, id: string, options: { includeUnpublished: false; status: 'published'; limit: number; offset: number }) => unknown): PublicDataFigureDataset {
  try {
    const collection = getCollection(siteId, collectionId);
    if (!validCollection(collection, siteId)) return failure('private-collection', 'This collection is unavailable for public figures.');
    const records: JsonRecord[] = [];
    const seen = new Set<string>();
    let offset = 0, total: number | undefined;
    for (;;) {
      const payload = listRecords(siteId, collection.id as string, { includeUnpublished: false, status: 'published', limit: PAGE_SIZE, offset });
      const page = inspectPublicDataFigurePage(siteId, collection.id as string,
        object(payload) ? { items: payload.records, pagination: payload.pagination } : null, offset, total);
      total = page.total;
      for (const record of page.records) {
        if (seen.has(record.id as string)) throw new Error('invalid-pagination');
        seen.add(record.id as string); records.push(record);
      }
      if (!page.hasMore) return { collection, records };
      offset = page.nextOffset;
    }
  } catch (error) { return datasetError(error); }
}

/** Resolve only configured declared scalar fields. Collection values are never dumped into a figure. */
function hydrateFigure(node: JsonRecord, resolveDataset: PublicDataFigureDatasetResolver): JsonRecord {
  const source = object(node.source) ? node.source : null;
  if (node.source === undefined || source?.type === 'inline') return node;
  const reject = (reason: string, error: string) => ({ ...node, records: [], dataStatus: 'error', dataError: error,
    dataResolution: { status: 'error', reason } });
  if (!source || !KEYS.has(String(node.componentKey)) || source.type !== 'collection' || typeof source.collectionId !== 'string' || !source.collectionId.trim())
    return reject('invalid-source', 'Choose a published collection for this figure.');
  let dataset: PublicDataFigureDataset;
  try { dataset = resolveDataset(source.collectionId.trim()); }
  catch { return reject('unavailable', 'Published collection data is unavailable.'); }
  if (!dataset) return reject('unavailable', 'Published collection data is unavailable.');
  if (dataset.error || !dataset.collection) return reject(dataset.reason || 'unavailable', dataset.error || 'Published collection data is unavailable.');
  const fields = Array.isArray(dataset.collection.fields) ? dataset.collection.fields.filter(object) : [];
  const columns = Array.isArray(node.columns) ? node.columns : [];
  const keys = node.componentKey === 'backy.table.data'
    ? columns.map((column) => object(column) ? column.key : undefined)
    : [node.xField, ...(Array.isArray(node.yFields) ? node.yFields : [])];
  if (!keys.length || keys.some((key) => typeof key !== 'string' || !key || ['__proto__', 'constructor', 'prototype'].includes(key))
    || (node.componentKey !== 'backy.table.data' && (!Array.isArray(node.yFields) || !node.yFields.length)))
    return reject('invalid-fields', 'Choose explicit fields for this collection figure.');
  const selected = [...new Set(keys as string[])];
  if (selected.some((key) => {
    const matches = fields.filter((field) => field.key === key);
    return matches.length !== 1 || !SCALAR_FIELDS.has(String(matches[0].type));
  })) return reject('unavailable-field', 'A selected field is undeclared or unavailable for public figures.');
  const records = dataset.records.map((record) => {
    const values = object(record.values) ? record.values : {};
    return Object.fromEntries(selected.map((key) => {
      const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      return [key, typeof value === 'string' || typeof value === 'boolean' || value === null
        || typeof value === 'number' && Number.isFinite(value) ? value : null];
    }));
  });
  return { ...node, records, dataStatus: 'ready', dataError: '', dataResolution: { status: 'ready', collectionId: dataset.collection.id, rowCount: records.length } };
}

/** Pure bounded Slate traversal; it never persists the hydrated rows. */
export function hydratePublicRichDataFigures(value: unknown, resolveDataset: PublicDataFigureDatasetResolver): unknown {
  const ancestors = new WeakSet<object>();
  let remaining = MAX_NODES;
  const visit = (value: unknown, depth: number): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (depth > MAX_DEPTH || --remaining < 0 || ancestors.has(value)) return null;
    ancestors.add(value);
    let next: unknown;
    if (Array.isArray(value)) next = value.map((child) => visit(child, depth + 1));
    else if (object(value)) {
      const node = value.type === 'data_figure' ? hydrateFigure(value, resolveDataset) : value;
      next = Array.isArray(node.children) ? { ...node, children: visit(node.children, depth + 1) } : node;
    } else next = value;
    ancestors.delete(value);
    return next;
  };
  return visit(value, 0);
}
