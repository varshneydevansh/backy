import assert from 'node:assert/strict';
import * as coreModule from '@backy-cms/core';
const core = (coreModule as any).default || coreModule;
import { NextRequest } from 'next/server';
import { fixture, load } from './admin-access-test-fixtures.mts';
const f = fixture();
const source = { id: 'section-source', siteId: f.site.id, slug: 'source', name: 'Source', status: 'active', updatedAt: '2026-01-01T00:00:00.000Z', content: { elements: [{ id: 'source-root', type: 'heading', props: { content: 'New shared heading' } }] } };
const document = (id: string) => ({ id, siteId: f.site.id, title: id, slug: id, status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z', content: { elements: [{ id: `${id}-instance`, type: 'heading', props: { content: 'Old heading', reusableSection: { mode: 'synced', sectionId: source.id } } }] } });
let docs = [document('page-first'), document('page-last')], mode = 'valid', writes = 0;
Object.assign(f.repositories, {
  reusableSections: { getById: async () => structuredClone(source), getBySlug: async () => null,
    applyPropagation: async (_site: string, input: any) => {
      if (['MEDIA_STORAGE_MUTATION_BUSY', 'MEDIA_STORAGE_LOCK_UNAVAILABLE', 'INVALID_EDITOR_MEDIA_REFERENCE'].includes(mode)) throw Object.assign(new Error('private media diagnostic'), { code: mode, mediaId: 'submitted-id', path: '/content/elements/0/props/assetId', providerKey: 'private media diagnostic' });
      if (mode === 'concurrent-author') docs[0].content.elements[0].props.content = 'Concurrent author winner';
      if (mode === 'source-race') source.content.elements[0].props.content = 'Source author winner';
      if (mode === 'inventory-race') docs.push(document('late-added'));
      try { core.assertBackyReusableSectionExpectation({expectedSection: input.source}, source); } catch { throw new core.BackyReusableSectionPropagationConflictError(); }
      const current = docs.map(d=>({type:'page',id:d.id,updatedAt:d.updatedAt,content:d.content}));
      core.assertBackyReusableSectionPropagationInventory(input.inventory,current);
      const pending = structuredClone(docs);
      for (const mutation of input.mutations) {
        if(mode === 'late-failure' && mutation.expected.id === 'page-last') throw Error('fixture late write failure');
        pending.find(d=>d.id===mutation.expected.id)!.content=mutation.content;
      }
      docs=pending; writes+=input.mutations.length;
    },
  },
  pages: { getById: async (_s: string,id: string)=>docs.find(d=>d.id===id), list: async (input: any) => ({ items: structuredClone(docs.slice(input.offset, input.offset + input.limit)), pagination: { total: docs.length, limit: input.limit, offset: input.offset, hasMore: false } }), update: async (_site: string, id: string, input: any) => {
    if (mode === 'late-failure' && id === 'page-last') throw Error('fixture late write failure');
    const target = docs.find(d => d.id === id)!;
    if (mode === 'concurrent-author' && id === 'page-first') target.content.elements[0].props.content = 'Concurrent author winner';
    writes++; target.content = input.content; return { item: structuredClone(target) };
  } },
  posts: { list: async (input: any) => ({ items: [], pagination: { total: 0, limit: input.limit, offset: input.offset, hasMore: false } }) },
});
Object.assign(f.mocks, {
  '@/lib/editorMediaMutationError': load('../src/lib/editorMediaMutationError.ts'),
  '@/lib/reusableSectionPropagation': load('../src/lib/reusableSectionPropagation.ts'),
  '@/lib/reusableSectionInstances': load('../src/lib/reusableSectionInstances.ts'),
  '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
  '@/lib/repositoryMediaReferenceSync': {syncRepositoryPageMediaReferences:async()=>{},syncRepositoryPostMediaReferences:async()=>{}}, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) },
});
f.mocks['@/lib/reusableSectionInventory'] = load('../src/lib/reusableSectionInventory.ts', { './collectionExportPagination': load('../src/lib/collectionExportPagination.ts') });
const route = load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts', f.mocks);
async function call(body: any = {dryRun:true}) {
  return route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.id}/reusable-sections/${source.id}/instances`, { method: 'POST', body: JSON.stringify({ targetType: 'page', ...body }), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ siteId: f.site.id, sectionId: source.id }) });
}
let checks = 0;
async function preview() { const response = await call(); assert.equal(response.status,200); const result=await response.json(); checks++; return result.data.reviewedPreview; }
let response = await call({}); assert.equal(response.status,400); checks++;
for (mode of ['concurrent-author','source-race','inventory-race']) {
  docs=[document('page-first'),document('page-last')]; source.content.elements[0].props.content='New shared heading';writes=0;
  const reviewedPreview=await preview(); response=await call({reviewedPreview}); assert.equal(response.status,409);assert.equal(writes,0);checks++;
  if(mode==='concurrent-author') assert.equal(docs[0].content.elements[0].props.content,'Concurrent author winner');
}
mode='valid';docs=[document('page-first'),document('page-last')];source.content.elements[0].props.content='New shared heading';writes=0;
let reviewedPreview=await preview();docs.push(document('added-before-apply'));response=await call({reviewedPreview});assert.equal(response.status,409);assert.equal((await response.json()).error.code,'REUSABLE_SECTION_PREVIEW_CONFLICT');assert.equal(writes,0);checks++;
mode='late-failure';docs=[document('page-first'),document('page-last')];reviewedPreview=await preview();response=await call({reviewedPreview});assert.equal(response.status,500);assert.equal(writes,0);assert.equal(docs[0].content.elements[0].props.content,'Old heading');checks++;
mode='valid';reviewedPreview=await preview();response=await call({reviewedPreview});assert.equal(response.status,200);let result=await response.json();assert.equal(result.data.outcome,'complete');assert.equal(writes,2);assert.equal(docs[1].content.elements[0].props.content,'New shared heading');checks++;
// Actual admission errors preserve status/private envelopes without committing refreshed content.
for (const code of ['MEDIA_STORAGE_MUTATION_BUSY', 'MEDIA_STORAGE_LOCK_UNAVAILABLE', 'INVALID_EDITOR_MEDIA_REFERENCE']) {
  mode = 'valid'; docs = [document('page-first'), document('page-last')]; writes = 0; reviewedPreview = await preview(); mode = code;
  response = await call({ reviewedPreview });
  assert.equal(response.status, code === 'INVALID_EDITOR_MEDIA_REFERENCE' ? 400 : 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('retry-after'), code === 'MEDIA_STORAGE_MUTATION_BUSY' ? '1' : null);
  result = await response.json(); assert.equal(result.error.code, code); assert.equal(JSON.stringify(result).includes('private media diagnostic'), false);
  assert.equal(writes, 0); assert.equal(docs[0].content.elements[0].props.content, 'Old heading'); checks += 7;
}
mode = 'valid';
// Postcommit effects cannot turn committed content into an ambiguous transaction failure.
f.mocks['@/lib/cacheInvalidation']={recordSiteCacheInvalidation:async()=>{throw Error('private cache fixture failure');}};
f.mocks['@/lib/adminAudit']={recordAdminAudit:async()=>{throw Error('private audit fixture failure');}};
f.mocks['@/lib/siteWebhookDelivery']={deliverSiteWebhooks:async()=>{throw Error('private webhook fixture failure');}};
const warned=load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts',f.mocks);
docs=[document('page-first'),document('page-last')];reviewedPreview=await preview();
response=await warned.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.id}/reusable-sections/${source.id}/instances`,{method:'POST',body:JSON.stringify({targetType:'page',reviewedPreview}),headers:{'content-type':'application/json'}}),{params:Promise.resolve({siteId:f.site.id,sectionId:source.id})});
assert.equal(response.status,200);result=await response.json();assert.equal(result.data.outcome,'partial');assert.equal(result.data.completionWarnings.length,3);assert.equal(JSON.stringify(result).includes('private cache fixture'),false);checks++;
console.log(`Reusable section propagation actual-handler ${checks} checks passed: reviewed apply, source/inventory/same-timestamp author conflicts, late write full fixture rollback, successful full apply, postcommit warnings retain success. Real transaction proof is separate PostgreSQL gate.`);
