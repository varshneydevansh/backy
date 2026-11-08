import assert from 'node:assert/strict';
import type { BackyCollectionRepository } from '@backy-cms/core';
import hydrationModule from '../src/lib/publicDataFigureHydration';
import renderModule from '../src/lib/renderPayload';
import storeModule from '../src/lib/backyStore';
import core from '@backy-cms/core';
const { collectPublicDataFigureCollectionIds, hydratePublicRichDataFigures, preparePublicDataFigureDatasets,
  loadPublicDataFigureDataset, withPublicDataFigureDatasets } = hydrationModule;
const { resolveElementDataBindings, buildPublicRenderPayload, buildPublicBlogPostRenderPayload } = renderModule;

const siteId = 'figure-site';
const collection: any = { id: 'metrics', siteId, status: 'published', permissions: { publicRead: true }, fields: [
  { key: 'label', type: 'text' }, { key: 'value', type: 'number' }, { key: 'internalJson', type: 'json' }, { key: 'related', type: 'reference' },
] };
let records: any[] = Array.from({ length: 205 }, (_, index) => ({ id: `metric-${index}`, siteId, collectionId: 'metrics', status: 'published',
  values: { label: `Day ${index}`, value: index, undeclaredSecret: 'never output', internalJson: { password: 'never output' } } }));
const figure = { type: 'data_figure', id: 'authored-figure-id', componentKey: 'backy.chart.line', title: 'Live metrics',
  source: { type: 'collection', collectionId: 'metrics' }, xField: 'label', yFields: ['value'], records: [{ label: 'STALE', value: -1 }],
  custom: { keep: true }, children: [{ text: '' }] };
const inline = { ...figure, id: 'inline-figure', source: { type: 'inline' }, records: [{ label: 'Author-owned', value: 8 }] };
const content = { elements: [{ id: 'article-body', type: 'paragraph', props: { content: [
  { type: 'p', id: 'paragraph-id', custom: 42, children: [{ text: 'Unrelated marked prose', bold: true }] },
  { type: 'collapsible', title: 'Nested chart', children: [figure] }, inline,
] } }] };
const before = JSON.stringify(content);
const requests: any[] = [];
const repository = {
  getById: async (_site: string, id: string) => id === 'metrics' ? collection : null,
  getBySlug: async () => null,
  listRecords: async (options: any) => {
    requests.push(options);
    return { items: records.slice(options.offset, options.offset + options.limit),
      pagination: { total: records.length, limit: options.limit, offset: options.offset, hasMore: options.offset + options.limit < records.length } };
  },
} as unknown as Pick<BackyCollectionRepository, 'getById' | 'getBySlug' | 'listRecords'>;
const prepared = await preparePublicDataFigureDatasets(siteId, content, repository);
assert.deepEqual(collectPublicDataFigureCollectionIds(content), ['metrics']);
assert.deepEqual(requests.map((request) => request.offset), [0, 100, 200], 'Collections larger than one public page must be complete');
assert(requests.every((request) => request.siteId === siteId && request.status === 'published' && request.includeUnpublished === false && request.limit === 100));
const hydrated: any = hydratePublicRichDataFigures(content.elements[0].props.content, (id: string) => prepared.get(id)!);
const live = hydrated[1].children[0];
assert.equal(live.dataStatus, 'ready');
assert.equal(live.records.length, 205);
assert.deepEqual(live.records[204], { label: 'Day 204', value: 204 });
assert.equal(live.id, figure.id);
assert.deepEqual(live.custom, figure.custom);
assert.deepEqual(live.source, figure.source);
assert.deepEqual(hydrated[0], content.elements[0].props.content[0]);
assert.deepEqual(hydrated[2], inline, 'Inline figure rows remain author-owned');
assert(!JSON.stringify(live.records).includes('never output'), 'Undeclared/internal collection values cannot leak into chart rows');
assert.equal(JSON.stringify(content), before, 'Rendering never persists a dataset snapshot into author content');
records = records.map((record, index) => index ? record : { ...record, values: { ...record.values, value: 999 } });
const nextPrepared = await preparePublicDataFigureDatasets(siteId, content, repository);
const fresh: any = hydratePublicRichDataFigures([figure], (id: string) => nextPrepared.get(id)!);
assert.equal(fresh[0].records[0].value, 999, 'A later render re-fetches collection changes');
const source = await withPublicDataFigureDatasets(siteId, content, repository, {});
const resolved = resolveElementDataBindings(siteId, content.elements, { dataSource: source });
assert.equal((resolved[0].props.content as any)[1].children[0].records.length, 205, 'Actual public element resolution hydrates nested rich nodes');
const baseSite = storeModule.getSiteByIdOrSlug('site-demo');
assert(baseSite);
const site = { ...baseSite, id: siteId };
const canonical = core.canvasElementsToBackyContentDocument({ id: 'figure-page', kind: 'page', title: 'Figure page', elements: content.elements });
const authored: any = { id: 'figure-page', siteId, title: 'Figure page', slug: 'figure-page', path: '/figure-page',
  status: 'published', isHomepage: false, meta: {}, updatedAt: '2026-01-01T00:00:00Z',
  content: { ...content, contentDocument: canonical } };
const authoredBefore = JSON.stringify(authored);
for (const payload of [
  buildPublicRenderPayload(site, authored, { requestId: 'figure-smoke', path: '/figure-page', dataSource: source }),
  buildPublicBlogPostRenderPayload(site, authored, { requestId: 'figure-smoke', path: '/blog/figure-page', dataSource: source }),
]) {
  for (const elements of [payload.data.content.elements, payload.data.content.contentDocument!.elements]) {
    const output: any = elements[0].props.content;
    assert.equal(output[1].children[0].records.length, 205, 'Canonical render and contentDocument mirror both hydrate complete rows');
    assert.equal(output[1].children[0].records[0].value, 999);
    assert.deepEqual(output[1].children[0].source, figure.source);
    assert.deepEqual(output[1].children[0].custom, figure.custom);
  }
}
assert.equal(JSON.stringify(authored), authoredBefore, 'Full page/blog renders do not persist hydrated data');
assert.equal(source.getDataFigureDataset!('other-site', 'metrics')!.records.length, 0);
assert.equal(source.getDataFigureDataset!('other-site', 'metrics')!.reason, 'private-collection');

const failed = async (changedCollection: any, changedRecords = records) => {
  const prepared = await preparePublicDataFigureDatasets(siteId, content, {
    ...repository, getById: async () => changedCollection,
    listRecords: async (options: any) => ({ items: changedRecords.slice(options.offset, options.offset + options.limit),
      pagination: { total: changedRecords.length, limit: options.limit, offset: options.offset, hasMore: options.offset + options.limit < changedRecords.length } }),
  });
  return (hydratePublicRichDataFigures([figure], (id: string) => prepared.get(id)!) as any[])[0];
};
for (const unavailable of [{ ...collection, siteId: 'other-site' }, { ...collection, status: 'draft' }, { ...collection, permissions: { publicRead: false } }]) {
  const denied = await failed(unavailable);
  assert.equal(denied.dataStatus, 'error'); assert.deepEqual(denied.records, []); assert(denied.dataError);
}
for (const unavailableRecord of [{ ...records[0], status: 'draft' }, { ...records[0], siteId: 'other-site' }, { ...records[0], collectionId: 'other-collection' }]) {
  const denied = await failed(collection, [unavailableRecord]);
  assert.equal(denied.dataResolution.reason, 'private-record'); assert.deepEqual(denied.records, []);
}
for (const invalidField of ['undeclaredSecret', 'internalJson', 'related', '__proto__']) {
  const invalid: any = hydratePublicRichDataFigures([{ ...figure, yFields: [invalidField] }], (id: string) => prepared.get(id)!);
  assert.equal(invalid[0].dataStatus, 'error'); assert.deepEqual(invalid[0].records, []);
}
const table: any = hydratePublicRichDataFigures([{ ...figure, componentKey: 'backy.table.data', columns: [{ key: 'label', label: 'Day' }, { key: 'value', label: 'Metric' }] }], (id: string) => prepared.get(id)!);
assert.equal(table[0].dataStatus, 'ready'); assert.deepEqual(table[0].records[0], { label: 'Day 0', value: 0 });
const overBudget = await failed(collection, Array.from({ length: 5001 }, (_, index) => ({ ...records[0], id: `big-${index}` })));
assert.equal(overBudget.dataResolution.reason, 'row-budget'); assert.deepEqual(overBudget.records, []);
const atBudget = await failed(collection, Array.from({ length: 5000 }, (_, index) => ({ ...records[0], id: `limit-${index}` })));
assert.equal(atBudget.dataStatus, 'ready'); assert.equal(atBudget.records.length, 5000);
const empty = await failed(collection, []);
assert.equal(empty.dataStatus, 'ready'); assert.deepEqual(empty.records, []);
for (const badSource of [null, 'metrics', {}, { type: 'url', url: 'https://example.invalid' }, { type: 'collection', collectionId: '' }]) {
  const denied: any = hydratePublicRichDataFigures([{ ...figure, source: badSource }], (id: string) => prepared.get(id)!);
  assert.equal(denied[0].dataResolution.reason, 'invalid-source'); assert.deepEqual(denied[0].records, []);
  assert.deepEqual(denied[0].source, badSource); assert.deepEqual(denied[0].custom, figure.custom);
}
for (const resolver of [() => undefined as any, () => { throw new Error('private transport details'); }]) {
  const denied: any = hydratePublicRichDataFigures([figure], resolver);
  assert.equal(denied[0].dataResolution.reason, 'unavailable'); assert.deepEqual(denied[0].records, []);
  assert(!denied[0].dataError.includes('private transport'));
}
const nonScalar = await failed(collection, [{ ...records[0], values: { label: { secret: 'never output' }, value: Infinity } }]);
assert.deepEqual(nonScalar.records, [{ label: null, value: null }], 'Nested and nonfinite values never escape declared scalar fields');
const duplicateField = await failed({ ...collection, fields: [...collection.fields, { key: 'value', type: 'number' }] });
assert.equal(duplicateField.dataResolution.reason, 'unavailable-field'); assert.deepEqual(duplicateField.records, []);
const malformed = await preparePublicDataFigureDatasets(siteId, content, { ...repository, listRecords: async () => ({ items: records.slice(0, 100), pagination: { offset: 0, limit: 100, total: 205, hasMore: false } }) });
assert.equal(malformed.get('metrics')!.reason, 'invalid-pagination');
for (const listRecords of [
  async () => ({ items: records.slice(0, 99), pagination: { offset: 0, limit: 100, total: 205, hasMore: true } }),
  async (options: any) => ({ items: records.slice(options.offset, options.offset + options.limit), pagination: { offset: options.offset, limit: options.limit, total: options.offset ? 206 : 205, hasMore: options.offset + options.limit < 205 } }),
]) {
  const incomplete = await preparePublicDataFigureDatasets(siteId, content, { ...repository, listRecords });
  assert.equal(incomplete.get('metrics')!.reason, 'invalid-pagination'); assert.deepEqual(incomplete.get('metrics')!.records, []);
}
const duplicate = await preparePublicDataFigureDatasets(siteId, content, { ...repository, listRecords: async (options: any) => ({ items: records.slice(0, Math.min(options.limit, records.length - options.offset)),
  pagination: { offset: options.offset, limit: options.limit, total: records.length, hasMore: options.offset + options.limit < records.length } }) });
assert.equal(duplicate.get('metrics')!.reason, 'invalid-pagination');
const demo = loadPublicDataFigureDataset(siteId, 'metrics', () => collection, (_site: string, _id: string, options: any) => ({ records: records.slice(options.offset, options.offset + options.limit),
  pagination: { offset: options.offset, limit: options.limit, total: records.length, hasMore: options.offset + options.limit < records.length } }));
assert.equal(demo.records.length, 205);
const cycle: any = { type: 'collapsible', children: [] }; cycle.children.push(cycle);
assert.doesNotThrow(() => hydratePublicRichDataFigures([cycle], () => ({ records: [] })));
assert.equal((hydratePublicRichDataFigures([cycle], () => ({ records: [] })) as any)[0].children[0], null);
let deep: any = figure; for (let depth = 0; depth < 100; depth++) deep = { type: 'collapsible', children: [deep] };
assert.doesNotThrow(() => hydratePublicRichDataFigures([deep], () => ({ records: [] })));
console.log('Public data figures: complete >100 pagination, live re-fetch, read-only rich resolution, explicit scalar projection, private/site/record/field denial, malformed/duplicate/5000-budget errors and bounded recursion passed.');
