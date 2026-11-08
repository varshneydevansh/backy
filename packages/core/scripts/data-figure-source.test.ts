import assert from 'node:assert/strict';
import { loadBackyPublicDataFigureRecords } from '../src/data-figure-source';
import type { BackyPublicDataFigureFetch } from '../src/data-figure-source';

const collection = {
  id: 'metrics', siteId: 'site-demo', name: 'Metrics', status: 'published', permissions: { publicRead: true },
  fields: [{ key: 'label', type: 'text' }, { key: 'score', type: 'number' }, { key: 'active', type: 'boolean' }, { key: 'nested', type: 'json' }],
};
const record = (index: number) => ({ id: `row-${index}`, siteId: 'site-demo', collectionId: 'metrics', status: 'published',
  values: { label: `Day ${index}`, score: index, active: index % 2 === 0, nested: { keep: true }, undeclared: 'excluded' } });
const response = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status }));
const signal = () => new AbortController().signal;
const page = (overrides: Record<string, unknown> = {}) => ({ collection, records: [record(0)], pagination: { offset: 0, limit: 100, total: 1, hasMore: false }, ...overrides });
const load = (request: BackyPublicDataFigureFetch, options: Partial<Parameters<typeof loadBackyPublicDataFigureRecords>[0]> = {}) =>
  loadBackyPublicDataFigureRecords({ apiBaseUrl: 'https://public.example/api', siteId: 'site-demo', collectionId: 'metrics', signal: signal(), ...options, fetch: request });
const dataset = (count: number) => Array.from({ length: count }, (_, index) => record(index));
const paged = (records: ReturnType<typeof record>[], offsets?: number[]): BackyPublicDataFigureFetch => (url, init) => {
  const parsed = new URL(url);
  const offset = Number(parsed.searchParams.get('offset'));
  offsets?.push(offset);
  assert.equal(parsed.pathname, '/api/sites/site-demo/collections/metrics/records');
  assert.equal(parsed.searchParams.get('limit'), '100');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.method, 'GET');
  assert.deepEqual(init.headers, { accept: 'application/json' });
  assert(init.signal instanceof AbortSignal);
  return response({ collection, records: records.slice(offset, offset + 100), pagination: { offset, limit: 100, total: records.length, hasMore: offset + 100 < records.length } });
};

async function main() {
  const offsets: number[] = [];
  const sourceRecords = dataset(205);
  const before = JSON.stringify(sourceRecords);
  const all = await load(paged(sourceRecords, offsets), { apiBaseUrl: 'https://public.example/api/' });
  assert.deepEqual(offsets, [0, 100, 200]);
  assert.equal(all.length, 205);
  assert.deepEqual(all[204], { label: 'Day 204', score: 204, active: true });
  assert.deepEqual(Object.keys(all[0] as object), ['label', 'score', 'active'], 'Default authoring reads only declared unambiguous scalar fields.');
  (all[0] as any).label = 'Changed in figure';
  assert.equal(JSON.stringify(sourceRecords), before, 'Returned rows never mutate the source records.');
  const subset = await load(paged(sourceRecords), { requestedFields: ['score', 'label'] });
  assert.equal(subset.length, 205);
  assert.deepEqual(subset[204], { score: 204, label: 'Day 204' });
  assert.deepEqual(Object.keys(subset[0] as object), ['score', 'label'], 'Public refresh projects exactly selected fields in their configured order.');
  assert.deepEqual(await load(() => response(page({ records: [], pagination: { offset: 0, limit: 100, total: 0, hasMore: false } }))), []);

  // The supported maximum is complete; larger collections fail instead of returning a prefix.
  const maximumOffsets: number[] = [];
  const maximum = await load(paged(dataset(5000), maximumOffsets), { requestedFields: ['score'] });
  assert.equal(maximum.length, 5000); assert.deepEqual(maximum[4999], { score: 4999 });
  assert.equal(maximumOffsets.length, 50); assert.equal(maximumOffsets[49], 4900);
  let overBudgetCalls = 0;
  await assert.rejects(load(() => { overBudgetCalls += 1; return response(page({ pagination: { offset: 0, limit: 100, total: 5001, hasMore: true } })); }), /at most 5,000.*Choose a smaller collection/);
  assert.equal(overBudgetCalls, 1, 'An oversized collection never streams or silently truncates its first rows.');

  // Selection rejects unsafe, undeclared, JSON and ambiguous schema keys.
  for (const requestedFields of [['undeclared'], ['nested'], ['__proto__'], ['constructor'], ['prototype'], [''], []]) {
    await assert.rejects(load(() => response(page()), { requestedFields }), /selected field is undeclared or unavailable/);
  }
  const duplicateSchema = { ...collection, fields: [...collection.fields, { key: 'score', type: 'number' }] };
  await assert.rejects(load(() => response(page({ collection: duplicateSchema })), { requestedFields: ['score'] }), /selected field is undeclared or unavailable/);
  const ambiguousDefault = await load(() => response(page({ collection: duplicateSchema })));
  assert.deepEqual(ambiguousDefault, [{ label: 'Day 0', active: true }], 'An ambiguous declaration is never included by default.');
  const unsafeSchema = { ...collection, fields: [...collection.fields, { key: '__proto__', type: 'text' }, { key: 'constructor', type: 'text' }, { key: 'prototype', type: 'text' }] };
  const unsafeValues = JSON.parse('{"label":"Safe","score":4,"active":true,"__proto__":"hidden","constructor":"hidden","prototype":"hidden"}');
  assert.deepEqual(await load(() => response(page({ collection: unsafeSchema, records: [{ ...record(0), values: unsafeValues }] }))), [{ label: 'Safe', score: 4, active: true }]);
  await assert.rejects(load(() => response(page({ collection: { ...collection, fields: undefined } })), { requestedFields: ['label'] }), /selected field is undeclared or unavailable/);

  // Malformed scalar values are gaps, exactly as in server hydration, never serialized object dumps.
  const malformed = await load(() => response(page({ records: [{ ...record(0), values: { label: { nested: 'excluded' }, score: 'Infinity' } }] })), { requestedFields: ['label', 'score', 'active'] });
  assert.deepEqual(malformed, [{ label: null, score: 'Infinity', active: null }]);
  const nonFiniteFetch: BackyPublicDataFigureFetch = async () => ({ ok: true, json: async () => ({ success: true, data: page({ records: [{ ...record(0), values: { label: 'Gap', score: Number.NaN, active: undefined } }] }) }) }) as Response;
  assert.deepEqual(await load(nonFiniteFetch), [{ label: 'Gap', score: null, active: null }]);

  const invalidCases: Array<[string, unknown]> = [
    ['different site', page({ collection: { ...collection, siteId: 'other' } })],
    ['different collection', page({ collection: { ...collection, id: 'other' } })],
    ['private collection', page({ collection: { ...collection, permissions: { publicRead: false } } })],
    ['draft collection', page({ collection: { ...collection, status: 'draft' } })],
    ['draft record', page({ records: [{ ...record(0), status: 'draft' }] })],
    ['cross-site record', page({ records: [{ ...record(0), siteId: 'other' }] })],
    ['wrong record collection', page({ records: [{ ...record(0), collectionId: 'different' }] })],
    ['invalid values', page({ records: [{ ...record(0), values: [] }] })],
    ['missing id', page({ records: [{ ...record(0), id: '' }] })],
    ['wrong offset', page({ pagination: { offset: 100, limit: 100, total: 1, hasMore: false } })],
    ['zero limit', page({ pagination: { offset: 0, limit: 0, total: 1, hasMore: false } })],
    ['oversized limit', page({ pagination: { offset: 0, limit: 101, total: 1, hasMore: false } })],
    ['fractional total', page({ pagination: { offset: 0, limit: 100, total: 1.5, hasMore: false } })],
    ['negative total', page({ pagination: { offset: 0, limit: 100, total: -1, hasMore: false } })],
    ['nonboolean hasMore', page({ pagination: { offset: 0, limit: 100, total: 1, hasMore: 'false' } })],
    ['empty continuing page', page({ records: [], pagination: { offset: 0, limit: 100, total: 2, hasMore: true } })],
    ['short continuing page', page({ pagination: { offset: 0, limit: 100, total: 205, hasMore: true } })],
    ['incomplete last page', page({ pagination: { offset: 0, limit: 100, total: 2, hasMore: false } })],
    ['extra rows', page({ records: [record(0), record(1)], pagination: { offset: 0, limit: 1, total: 2, hasMore: false } })],
  ];
  for (const [name, invalid] of invalidCases) await assert.rejects(load(() => response(invalid)), undefined, name);

  // Fail after a valid first page as well: never resolve a partial stale dataset.
  for (const reason of ['changed-total', 'duplicate-id', 'schema-drift', 'early-end', 'transport-failure']) {
    let calls = 0;
    await assert.rejects(load((url) => {
      calls += 1;
      const offset = Number(new URL(url).searchParams.get('offset'));
      if (offset === 0) return response({ collection, records: sourceRecords.slice(0, 100), pagination: { offset: 0, limit: 100, total: 205, hasMore: true } });
      if (reason === 'transport-failure') return response({}, 503);
      const records = sourceRecords.slice(100, 200);
      if (reason === 'duplicate-id') records[0] = sourceRecords[0];
      return response({ collection: reason === 'schema-drift' ? { ...collection, fields: collection.fields.filter((field) => field.key !== 'score') } : collection,
        records, pagination: { offset, limit: 100, total: reason === 'changed-total' ? 206 : 205, hasMore: reason !== 'early-end' } });
    }, { requestedFields: ['score'] }), reason === 'duplicate-id' ? /changed while loading/ : reason === 'schema-drift' ? /selected field/ : reason === 'transport-failure' ? /could not be loaded/ : /pagination is invalid/, reason);
    assert.equal(calls, 2, `${reason} stops at the first invalid page.`);
  }
  await assert.rejects(load(() => response({}, 401)), /could not be loaded/);
  await assert.rejects(load(async () => new Response(JSON.stringify({ success: false, data: {} }))), /invalid response/);
  await assert.rejects(load(async () => new Response('invalid json')), SyntaxError);
  const preCanceled = new AbortController(); preCanceled.abort();
  let preCanceledCalls = 0;
  await assert.rejects(load(() => { preCanceledCalls += 1; return response(page()); }, { signal: preCanceled.signal }), { name: 'AbortError' });
  assert.equal(preCanceledCalls, 0);
  const canceled = new AbortController();
  await assert.rejects(load(async () => { canceled.abort(); return await response(page()); }, { signal: canceled.signal }), { name: 'AbortError' });
  const afterJson = new AbortController();
  await assert.rejects(load(async () => ({ ok: true, json: async () => { afterJson.abort(); return { success: true, data: page() }; } }) as Response, { signal: afterJson.signal }), { name: 'AbortError' });
  console.log('Public data figure source: complete 205/5,000-row reads, scalar/default/subset projection, unsafe/ambiguous fields, pagination/stale failures and cancellation passed.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
