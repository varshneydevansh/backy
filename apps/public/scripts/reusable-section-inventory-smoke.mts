import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { fixture, load, networkCalls } from './admin-access-test-fixtures.mts';

const f = fixture();
let mode = 'valid', reads = 0, writes = 0;
const offsets: number[] = [];
const sections = Array.from({ length: 205 }, (_, index) => ({
  id: `section-${index}`, siteId: f.site.id, slug: `section-${index}`, name: `Section ${index}`,
  status: 'active', category: 'general', tags: [], updatedAt: '2026-01-01T00:00:00.000Z',
  content: { elements: [{ id: `root-${index}`, type: 'container', children: [{ id: 'nested', type: 'heading', props: { content: 'Preserve', extension: { exact: true } }, animation: { type: 'custom', from: { x: 0 }, to: { x: 20 } }, responsive: { mobile: { width: 320 } } }] }], metadata: { ownerExtension: true }, customCSS: '.keep{}' },
  metadata: { extension: { retained: true } },
}));
function page(input: any, all: any[]) {
  reads++; offsets.push(input.offset);
  assert.equal(input.siteId, f.site.id);
  if (mode === 'throw' && input.offset > 0) throw Error('private storage failure');
  const limit = Math.min(100, input.limit || 50), offset = input.offset || 0;
  let items = all.slice(offset, offset + limit);
  if (mode === 'duplicate' && offset === 100) items = [all[0], ...items.slice(1)];
  if (mode === 'foreign' && offset === 100) items = [{ ...items[0], siteId: 'other-site' }, ...items.slice(1)];
  return { items, pagination: { total: mode === 'drift' && offset > 0 ? all.length + 1 : all.length,
    limit, offset, hasMore: offset + items.length < all.length } };
}
Object.assign(f.repositories, { reusableSections: {
  list: async (input: any) => page(input, sections),
  getById: async (siteId: string, id: string) => sections.find(s => s.siteId === siteId && s.id === id) || null,
  getBySlug: async () => null,
} });
Object.assign(f.mocks, {
  '@/lib/collectionExportPagination': load('../src/lib/collectionExportPagination.ts'),
  '@/lib/frontendDesignContract': {}, '@/lib/reusableSectionVersions': {},
  '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { writes++; } },
  '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) },
});
f.mocks['@/lib/reusableSectionInventory'] = load('../src/lib/reusableSectionInventory.ts', { ...f.mocks, './collectionExportPagination': f.mocks['@/lib/collectionExportPagination'] });
const list = load('../src/app/api/admin/sites/[siteId]/reusable-sections/route.ts', f.mocks);
const exp = load('../src/app/api/admin/sites/[siteId]/reusable-sections/export/route.ts', f.mocks);
let checks = 0;
async function call(route: any, suffix = '', query = '', siteId = f.site.id) {
  const response = await route.GET(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/reusable-sections${suffix}${query}`), { params: Promise.resolve({ siteId }) });
  checks++; return { status: response.status, body: await response.json() };
}
const exported = await call(exp, '/export');
assert.equal(exported.status, 200);
assert.equal(exported.body.data.sections.length, 205, 'Export must include beyond DB page cap100');
assert.deepEqual(offsets, [0, 100, 200]);
assert.deepEqual(exported.body.data.sections[204].content, sections[204].content);
assert.deepEqual(exported.body.data.sections[204].metadata, sections[204].metadata);
offsets.length = 0;
const tail = await call(list, '', '?limit=5&offset=200');
assert.equal(tail.status, 200); assert.equal(tail.body.data.sections[0].id, 'section-200');
assert.equal(tail.body.data.pagination.limit, 5); assert.equal(tail.body.data.pagination.total, 205);
const selected = await call(exp, '/export', '?ids=section-204');
assert.equal(selected.body.data.sections.length, 1); assert.equal(selected.body.data.sections[0].sourceSectionId, 'section-204');
for (mode of ['drift', 'duplicate', 'foreign', 'throw']) {
  const result = await call(exp, '/export'); assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'REUSABLE_SECTION_INVENTORY_INCOMPLETE');
  assert.equal(JSON.stringify(result.body).includes('private storage failure'), false);
  assert.equal(result.body.data, undefined);
}
mode = 'valid';
f.settings().auth.userSiteGrants = [{ userId: f.actor.id, scope: { version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: f.site.id, permissions: ['pages.view', 'pages.edit'] }], expiresAt: null } }];
const before = reads;
for (const [route, suffix] of [[list, ''], [exp, '/export']] as const) {
  const denied = await call(route, suffix, '', 'other-site'); assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'FORBIDDEN_SITE_SCOPE');
}
assert.equal(reads, before, 'Tenant denial must precede inventory reads');
assert.equal(writes, 0);
const targets = (type: string) => Array.from({ length: 205 }, (_, index) => ({
  id: `${type}-${index}`, siteId: f.site.id, title: `${type} ${index}`, slug: `${type}-${index}`,
  status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z',
  content: { metadata: { ownerExtension: true }, elements: index === 204 ? [{ id: 'instance', type: 'container', x: 14, y: 28, width: 200, height: 300,
    props: { reusableSection: { sectionId: sections[204].id, mode: 'synced', sourceUpdatedAt: 'old' } } }] : [] },
}));
const pages = targets('page'), posts = targets('post');
let contentWrites = 0;
Object.assign(f.repositories, {
  pages: { list: async (input: any) => page(input, pages), update: async (_site: string, id: string, input: any) => { contentWrites++; const target = pages.find(p => p.id === id)!; Object.assign(target, input); return { item: target }; } },
  posts: { list: async (input: any) => page(input, posts), update: async (_site: string, id: string, input: any) => { contentWrites++; const target = posts.find(p => p.id === id)!; Object.assign(target, input); return { item: target }; } },
});
f.mocks['@/lib/reusableSectionPropagation'] = load('../src/lib/reusableSectionPropagation.ts');
f.repositories.reusableSections.applyPropagation = async (_site: string,input: any) => { for(const mutation of input.mutations) { const list=mutation.expected.type==='page'?pages:posts; const target=list.find(p=>p.id===mutation.expected.id)!; target.content=mutation.content; contentWrites++; } };
f.repositories.pages.getById = async (_site: string,id: string)=>pages.find(p=>p.id===id);
f.repositories.posts.getById = async (_site: string,id: string)=>posts.find(p=>p.id===id);
f.mocks['@/lib/repositoryMediaReferenceSync']={syncRepositoryPageMediaReferences:async()=>{},syncRepositoryPostMediaReferences:async()=>{}};
f.mocks['@/lib/reusableSectionInstances'] = load('../src/lib/reusableSectionInstances.ts');
const instances = load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts', f.mocks);
async function instance(method: string, status: number, body?: any, siteId = f.site.id) {
  if(method==='POST'&&status===200&&body?.dryRun!==true){const preview=await instances.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/reusable-sections/section-204/instances`,{method:'POST',body:JSON.stringify({...body,dryRun:true}),headers:{'content-type':'application/json'}}),{params:Promise.resolve({siteId,sectionId:'section-204'})});assert.equal(preview.status,200);body={...body,reviewedPreview:(await preview.json()).data.reviewedPreview};}
  const response = await instances[method](new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/reusable-sections/section-204/instances`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId, sectionId: 'section-204' }) });
  assert.equal(response.status, status, `${method} ${mode}`); checks++; return await response.json();
}
offsets.length = 0;
const found = await instance('GET', 200);
assert.equal(found.data.totals.instances, 2); assert.equal(found.data.targets[0].id, 'page-204');
assert.deepEqual(offsets, [0, 0, 100, 100, 200, 200]);
await instance('POST', 200, { dryRun: true }); assert.equal(contentWrites, 0);
for (mode of ['drift', 'duplicate', 'foreign', 'throw']) {
  const result = await instance('POST', 503, {}); assert.equal(result.error.code, 'REUSABLE_SECTION_INVENTORY_INCOMPLETE');
  assert.equal(contentWrites, 0); await instance('GET', 503);
}
mode = 'valid';
(posts[204].content.elements[0] as any).props.reusableSection.sourceElementId = 'missing-root';
await instance('POST', 409, {}); assert.equal(contentWrites, 0, 'Missing root late in scan must fail before earlier propagation writes');
delete (posts[204].content.elements[0] as any).props.reusableSection.sourceElementId;
await instance('POST', 200, {}); assert.equal(contentWrites, 2);
assert.equal(pages[204].content.elements[0].x, 14); assert.equal(pages[204].content.elements[0].y, 28);
assert.deepEqual(pages[204].content.metadata, { ownerExtension: true });
assert.deepEqual(JSON.parse(JSON.stringify((pages[204].content.elements[0] as any).children[0].props.extension)), { exact: true });
await instance('GET', 403, undefined, 'other-site'); await instance('POST', 403, {}, 'other-site');
assert.equal(networkCalls, 0);
const runtime = f.mocks['@/lib/reusableSectionInstances'];
const multi = { id: 'multi', slug: 'multi', name: 'Multi root', siteId: f.site.id, updatedAt: 'new', content: { elements: [{ id: 'first', type: 'heading', props: { content: 'First' } }, { id: 'second', type: 'button', props: { label: 'Second' }, animation: { type: 'custom', from: { x: 0 }, to: { x: 20 } } }] } };
const multiTarget = { metadata: { keep: true }, elements: [{ id: 'instance-second', type: 'button', x: 7, y: 14, zIndex: 2, props: { reusableSection: { mode: 'synced', sectionId: 'multi', rootIndex: 1, sourceElementId: 'second', unknownLink: 'keep' } } }] };
let refreshed = runtime.refreshReusableSectionInstancesInContent(multiTarget, multi).content;
assert.equal(refreshed.elements[0].props.label, 'Second'); assert.equal(refreshed.elements[0].x, 7); assert.equal(refreshed.elements[0].props.reusableSection.unknownLink, 'keep');
multi.content.elements.reverse(); refreshed = runtime.refreshReusableSectionInstancesInContent(multiTarget, multi).content;
assert.equal(refreshed.elements[0].props.label, 'Second', 'Stable source ID wins over reordered positional index');
assert.equal(refreshed.elements[0].id, 'instance-second');
const foreignLink = structuredClone(multiTarget); (foreignLink.elements[0].props.reusableSection as any).siteId = 'other-site';
assert.equal(runtime.refreshReusableSectionInstancesInContent(foreignLink, multi).refreshed, 0);
console.log(`Reusable-section inventory actual handlers passed ${checks} checks: 205 complete export, scoped selected export, pagination, exact composition preservation, drift/duplicate/foreign/read-failure refusal and shared-auth tenant denials. Repository adapters are fixtures.`);
