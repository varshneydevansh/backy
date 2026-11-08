import assert from 'node:assert/strict';
import { loadReusableSectionLibrary } from '../src/lib/reusableSectionLibraryLoading';
import { createCanvasElementsFromReusableContent } from '../src/components/editor/editorCatalog';
import type { ReusableSectionContent } from '../src/types/editor';
const records = Array.from({ length: 205 }, (_, i) => ({ id: `section-${i}`, siteId: 'site-proof', content: { elements: [{ id: 'nested', extension: { exact: true } }] } }));
const offsets: number[] = [];
let mode = 'valid';
const fetcher = async (url: string) => {
  const query = new URL(url).searchParams, offset = Number(query.get('offset'));
  assert.equal(query.get('status'), 'all'); assert.equal(query.get('search'), 'Exact'); offsets.push(offset);
  let sections = records.slice(offset, offset + 100);
  if (mode === 'foreign' && offset > 0) sections = [{ ...sections[0], siteId: 'other-site' }, ...sections.slice(1)];
  if (mode === 'duplicate' && offset > 0) sections = [records[0], ...sections.slice(1)];
  if (mode === 'missing' && offset > 0) sections = sections.slice(1);
  const pagination = { total: mode === 'drift' && offset > 0 ? 206 : 205, limit: 100, offset, hasMore: offset + sections.length < 205 };
  return Response.json({ success: true, data: { sections, ...(mode === 'no-pagination' ? {} : { pagination }) } });
};
const filters = new URLSearchParams({ status: 'all', search: 'Exact' });
const loaded = await loadReusableSectionLibrary('http://fixture.invalid/api/admin/sites/site-proof/reusable-sections', 'site-proof', filters, fetcher);
assert.deepEqual(loaded, records); assert.deepEqual(offsets, [0, 100, 200]);
for (mode of ['foreign', 'duplicate', 'missing', 'drift', 'no-pagination']) await assert.rejects(() => loadReusableSectionLibrary('http://fixture.invalid/library', 'site-proof', filters, fetcher));
assert.equal(filters.has('offset'), false);
const composition = { siteId: 'site-proof', sectionId: 'section-tail', name: 'Multi root', elements: [
  { id: 'first', type: 'heading', x: 10, y: 20, width: 100, height: 40, props: { content: 'First' } },
  { id: 'second', type: 'button', x: 10, y: 90, width: 100, height: 40, props: { label: 'Second', extension: { keep: true } }, responsive: { mobile: { width: 90 } }, animation: { type: 'fade-in', trigger: 'load', duration: .4 }, children: [{ id: 'child', parentId: 'second', type: 'text', x: 0, y: 0, width: 80, height: 20, props: { content: 'Nested retained' } }] },
] } as ReusableSectionContent;
const inserted = createCanvasElementsFromReusableContent(composition, 40, 50);
assert.equal(inserted.length, 2);
assert.equal((inserted[1].props.reusableSection as any).siteId, 'site-proof');
assert.equal((inserted[1].props.reusableSection as any).sourceElementId, 'second');
assert.equal((inserted[1].props.reusableSection as any).rootIndex, 1);
assert.equal(inserted[1].children![0].parentId, inserted[1].id);
assert.notEqual(inserted[1].children![0].id, 'child');
assert.deepEqual(inserted[1].animation, composition.elements[1].animation);
assert.deepEqual(inserted[1].responsive, composition.elements[1].responsive);
assert.deepEqual(inserted[1].props.extension, { keep: true });
assert.equal(inserted[1].y - inserted[0].y, 70);
console.log('Reusable section management/editor library complete loader passed: 205 preserved records, filters, capped-page offsets, no partial state on foreign/duplicate/drift/missing metadata.');
