import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
const cwd = process.cwd(), scratch = mkdtempSync(join(tmpdir(), 'backy-reusable-demo-'));
process.chdir(scratch); process.env.BACKY_DATA_MODE = 'demo'; process.env.NODE_ENV = 'test'; process.env.BACKY_ADMIN_API_KEY = 'disposable-reusable-fixture';
try {
  const storeModule = await import('../src/lib/backyStore.ts'), store = (storeModule as any).default || storeModule;
  const detailModule = await import('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/route.ts'), detail = (detailModule as any).default || detailModule;
  const importModule = await import('../src/app/api/admin/sites/[siteId]/reusable-sections/import/route.ts'), importing = (importModule as any).default || importModule;
  const content = { elements: [{ id: 'root-a', type: 'container', props: { extension: { exact: true } }, children: [{ id: 'nested', type: 'button', props: { label: 'Nested' }, responsive: { mobile: { width: 320 } }, animation: { type: 'custom', from: { x: 0 }, to: { x: 10 } } }] }, { id: 'root-b', type: 'heading', props: { content: 'Second root' } }], extension: { preserve: true }, canvasSize: { width: 900, height: 700, extension: true } };
  const section = store.createReusableSection('site-demo', { name: 'Original', slug: 'original', content, metadata: { extension: { preserve: true }, reusableSection: { version: 1 } } });
  assert.deepEqual(section.content.extension, content.extension);
  const request = (path: string, method: string, body: unknown) => new NextRequest(`http://localhost/api/admin/sites/site-demo/reusable-sections${path}`, { method, headers: { authorization: 'Bearer disposable-reusable-fixture', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const params = { params: Promise.resolve({ siteId: 'site-demo', sectionId: section.id }) };
  const race = await Promise.all([detail.PATCH(request(`/${section.id}`, 'PATCH', { name: 'Writer A' }), params), detail.PATCH(request(`/${section.id}`, 'PATCH', { name: 'Writer B' }), params)]);
  assert.deepEqual(race.map(response => response.status).sort(), [200, 409]);
  let current = store.getReusableSectionByIdOrSlug('site-demo', section.id);
  assert.deepEqual(current.content.extension, content.extension); assert.deepEqual(current.content.elements, content.elements);
  const entry = (slug: string) => ({ name: slug, slug, content, metadata: { extension: { preserve: true } } });
  let response = await importing.POST(request('/import', 'POST', { sections: [entry('new-first'), entry('original')] }), { params: Promise.resolve({ siteId: 'site-demo' }) });
  assert.equal(response.status, 409); assert.equal(store.getReusableSectionByIdOrSlug('site-demo', 'new-first'), undefined);
  response = await importing.POST(request('/import?upsert=true', 'POST', { sections: [entry('new-first'), entry('original')] }), { params: Promise.resolve({ siteId: 'site-demo' }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.import.total, 2);
  current = store.getReusableSectionByIdOrSlug('site-demo', section.id);
  const diskBefore = readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8');
  const parent = join(scratch, 'data/backy'), held = parent + '.held';
  renameSync(parent, held); writeFileSync(parent, 'force-owned-fixture-storage-failure');
  try {
    assert.throws(() => store.applyReusableSectionBatch('site-demo', [{ type: 'create', input: { siteId: 'site-demo', ...entry('no-phantom-create') } }, { type: 'update', sectionId: section.id, input: { name: 'No phantom update', expectedSection: current } }]));
    assert.equal(store.getReusableSectionByIdOrSlug('site-demo', 'no-phantom-create'), undefined);
    assert.deepEqual(store.getReusableSectionByIdOrSlug('site-demo', section.id), current);
  } finally { unlinkSync(parent); renameSync(held, parent); }
  assert.equal(readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8'), diskBefore);
  const reopened = JSON.parse(diskBefore).reusableSections.find((item: any) => item.id === section.id);
  assert.deepEqual(reopened.content.extension, content.extension); assert.deepEqual(reopened.content.elements, content.elements);
  const instancesModule = await import('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts'), instances = (instancesModule as any).default || instancesModule;
  const linked = { elements: [{ id: 'demo-linked', type: 'container', x: 40, y: 60, props: { reusableSection: { sectionId: current.id, mode: 'synced', sourceElementId: 'root-a' } } }], canvasSize: { width: 900, height: 700 } };
  const page = store.createAdminPage('site-demo', { title: 'Propagation page', slug: 'prop-page', content: linked });
  const post = store.createAdminBlogPost('site-demo', { title: 'Propagation post', slug: 'prop-post', content: linked });
  const previewResponse = await instances.POST(request(`/${current.id}/instances`, 'POST', { dryRun: true }), params);
  assert.equal(previewResponse.status, 200); const preview = (await previewResponse.json()).data;
  const beforePropagation = readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8');
  renameSync(parent, held); writeFileSync(parent, 'force-owned-propagation-storage-failure');
  try {
    const failed = await instances.POST(request(`/${current.id}/instances`, 'POST', { reviewedPreview: preview.reviewedPreview }), params);
    assert.equal(failed.status, 500);
    assert.deepEqual(store.getAdminPageById('site-demo', page.id).content, page.content);
    assert.deepEqual(store.getAdminBlogPostById('site-demo', post.id).content, post.content);
  } finally { unlinkSync(parent); renameSync(held, parent); }
  assert.equal(readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8'), beforePropagation);
  const applied = await instances.POST(request(`/${current.id}/instances`, 'POST', { reviewedPreview: preview.reviewedPreview }), params);
  assert.equal(applied.status, 200); assert.equal((await applied.json()).data.totals.targets, 2);
  const propagationDisk = JSON.parse(readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8'));
  assert.equal(propagationDisk.pages.find((item: any) => item.id === page.id).content.elements[0].children[0].props.label, 'Nested');
  assert.equal(propagationDisk.blogPosts.find((item: any) => item.id === post.id).content.elements[0].children[0].props.label, 'Nested');
  assert.equal(propagationDisk.revisions.filter((item: any) => [page.id,post.id].includes(item.targetId)).length, 2);
  console.log('Reusable section actual demo handlers/persistence passed: snapshot race one winner, late import no partial create, atomic upsert, unknown/multi-root composition save/reopen and strict file failure memory+disk rollback. Single-process demo only; no provider touched.');
} finally { process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }
