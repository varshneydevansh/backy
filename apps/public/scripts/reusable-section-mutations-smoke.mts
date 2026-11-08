import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { fixture, load, networkCalls } from './admin-access-test-fixtures.mts';
import * as coreNamespace from '@backy-cms/core';
const core = (coreNamespace as any).default || coreNamespace;
const f = fixture();
let writes = 0;
const existing: any = { id: 'existing', siteId: f.site.id, name: 'Existing', slug: 'existing', category: 'general', status: 'active', tags: [], content: { elements: [{ id: 'root', type: 'container', children: [{ id: 'nested', type: 'heading', props: { content: 'Exact' } }] }], extension: { keep: true } }, metadata: { reusableSection: { version: 1 }, extension: { keep: true } }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const records = new Map<string, any>([[existing.slug, existing]]);
const create = (input: any) => { writes++; const item = { ...input, id: input.slug, createdAt: existing.createdAt, updatedAt: existing.updatedAt }; records.set(item.slug, item); return { item }; };
const update = (_site: string, id: string, input: any) => { const item = [...records.values()].find(v => v.id === id); core.assertBackyReusableSectionExpectation(input, item); const { expectedSection: _, ...patch } = input; writes++; Object.assign(item, patch); return { item: structuredClone(item) }; };
let batchFailure = false;
Object.assign(f.repositories, { reusableSections: {
  getBySlug: async (site: string, slug: string) => records.get(slug)?.siteId === site ? structuredClone(records.get(slug)) : null,
  getById: async (site: string, id: string) => structuredClone([...records.values()].find(v => v.siteId === site && v.id === id) || null),
  create: async (input: any) => create(input), update: async (...args: any[]) => update(args[0], args[1], args[2]),
  applyBatch: async (site: string, operations: any[]) => {
    for (const operation of operations) if (operation.type === 'update') core.assertBackyReusableSectionExpectation(operation.input, [...records.values()].find(v => v.siteId === site && v.id === operation.sectionId));
    if (batchFailure) throw Error('private batch provider failure');
    return operations.map(operation => operation.type === 'create' ? create(operation.input).item : update(site, operation.sectionId, operation.input).item);
  },
} });
Object.assign(f.mocks, {
  '@/lib/reusableSectionVersions': load('../src/lib/reusableSectionVersions.ts'),
  '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
  '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) },
  '@/lib/frontendDesignContract': { normalizeReusableSectionInputFromDirectFrontendDesignEnvelope: (body: unknown) => body },
  '@/lib/reusableSectionMetadata': load('../src/lib/reusableSectionMetadata.ts'),
});
const route = load('../src/app/api/admin/sites/[siteId]/reusable-sections/import/route.ts', f.mocks);
const entry = (slug: string) => ({ name: slug, slug, content: structuredClone(existing.content), metadata: { extension: { keep: true } } });
async function imported(sections: unknown[], status: number, query = '') {
  const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.id}/reusable-sections/import${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections }) }), { params: Promise.resolve({ siteId: f.site.id }) });
  assert.equal(response.status, status); return response.json();
}
await imported([entry('new-first'), entry('existing')], 409);
assert.equal(writes, 0, 'Late slug conflict must not commit earlier import entries');
assert.equal(records.has('new-first'), false);
await imported([entry('new-first'), { name: 'invalid' }], 400);
assert.equal(writes, 0, 'Invalid entry must reject complete import rather than be silently dropped');
await imported([entry('same slug'), entry('same-slug')], 400);
assert.equal(writes, 0, 'Duplicate normalized slugs must not write');
batchFailure = true; const failure = await imported([entry('new-first')], 500);
assert.equal(JSON.stringify(failure).includes('private batch provider failure'), false); assert.equal(writes, 0);
batchFailure = false; const success = await imported([entry('new-first'), entry('existing')], 200, '?upsert=true');
assert.equal(success.data.import.created, 1); assert.equal(success.data.import.updated, 1); assert.equal(writes, 2);
assert.equal(success.data.sections.some((section: any) => 'expectedSection' in section), false);
const detail = load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/route.ts', f.mocks);
const metadata = load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/metadata/route.ts', f.mocks);
const restore = load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/versions/[version]/restore/route.ts', f.mocks);
async function mutate(handler: any, suffix: string, body: unknown, version = '1') {
  return handler[suffix.includes('restore') ? 'POST' : 'PATCH'](new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.id}/reusable-sections/existing${suffix}`, { method: suffix.includes('restore') ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ siteId: f.site.id, sectionId: 'existing', version }) });
}
for (const [handler, suffix, body] of [[detail, '', { name: 'Concurrent name' }], [metadata, '/metadata', { displayName: 'Concurrent display' }], [restore, '/versions/1/restore', {}]] as const) {
  const before = writes;
  const responses = await Promise.all([mutate(handler, suffix, body), mutate(handler, suffix, body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409], 'Only one shared snapshot mutation commits');
  assert.equal(writes, before + 1);
  const rejected = await responses.find(response => response.status === 409)!.json(); assert.equal(rejected.error.code, 'REUSABLE_SECTION_VERSION_CONFLICT');
}
const current = records.get('existing');
current.metadata.reusableSection.history.unshift({ version: 99, name: 'Malformed historical record' });
const beforeInvalid = writes;
assert.equal((await mutate(restore, '/versions/99/restore', {}, '99')).status, 400);
assert.equal(writes, beforeInvalid); assert(current.content.elements.length > 0);
assert.equal(networkCalls, 0);
console.log('Reusable section mutation actual handler checks passed: import preflight/conflict/failure, composition preservation, detail/metadata/restore snapshot races one winner, and malformed history no-write. Atomic persistence boundary is a repository fixture here.');
