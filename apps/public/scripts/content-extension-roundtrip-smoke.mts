import assert from 'node:assert/strict';
import * as coreModule from '../../../packages/core/src/index.ts';
import * as workflowModule from '../src/lib/repositoryContentWorkflow.ts';

const core = (coreModule.default || coreModule) as typeof coreModule;
const workflow = (workflowModule.default || workflowModule) as typeof workflowModule;
const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
let checks = 0;
for (const kind of ['page', 'post'] as const) {
  const rawElement = {
    id: `${kind}-composition`, type: 'section', props: { layoutMode: 'flow' }, children: [{
      id: `${kind}-component`, type: 'codeComponent', componentKey: 'fixture.nested', version: '2.4.1', props: { title: 'Editable' }, children: [],
      frontendContract: { schemaVersion: 'frontend.component.v3', revision: 7, controls: { title: { editable: true } } },
      chartSchema: { version: 2, xKey: 'year', nested: [{ path: 'series', values: [null, 0, false] }] },
    }],
    frontendSlots: { schemaVersion: 'frontend.slots.v2', title: `${kind}-component` },
    themeTokenRefs: { surface: 'colors.paper' }, metadata: { legacy: { storedLegacyExtension: 'retain' } },
  };
  const content = core.canvasContentPayloadToBackyContentDocument({ id: `${kind}-fixture`, kind, rawContent: {
    elements: [rawElement], frontendRevision: { schemaVersion: 'frontend.document.v4', revision: 9 }, canvasSize: { width: 1200, height: 800 },
  } });
  const entity = { id: `${kind}-fixture`, siteId: 'fixture-site', title: 'Fixture', slug: 'fixture', status: 'draft', content: clone(content), meta: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  const toAdmin = kind === 'page' ? workflow.adminPageFromRepositoryPage : workflow.adminPostFromRepositoryPost;
  const snapshot = kind === 'page' ? workflow.pageRevisionSnapshot : workflow.postRevisionSnapshot;
  const restore = kind === 'page' ? workflow.pageUpdateFromRevisionSnapshot : workflow.postUpdateFromRevisionSnapshot;
  const legacy = toAdmin(entity);
  assert.deepEqual(legacy.content.elements[0].frontendSlots, rawElement.frontendSlots);
  assert.deepEqual(legacy.content.elements[0].children[0].frontendContract, rawElement.children[0].frontendContract);
  assert.equal(legacy.content.elements[0].children[0].version, '2.4.1'); checks += 3;
  const databaseReopen = clone(core.canvasContentPayloadToBackyContentDocument({ id: entity.id, kind, rawContent: clone(legacy.content), fallbackDocument: entity.content }));
  assert.deepEqual(databaseReopen.elements[0].children[0].chartSchema, rawElement.children[0].chartSchema);
  assert.deepEqual(databaseReopen.frontendRevision, content.frontendRevision);
  assert.equal(databaseReopen.elements[0].children[0].parentId, rawElement.id); checks += 3;
  const canonicalRestore = clone(restore(snapshot(entity), entity));
  assert.deepEqual(canonicalRestore.content.elements[0].frontendSlots, rawElement.frontendSlots);
  assert.deepEqual(canonicalRestore.content.frontendRevision, content.frontendRevision); checks += 2;
  // Older revision snapshots carry elements without an embedded contentDocument.
  const legacySnapshot = snapshot(entity); delete legacySnapshot.content.contentDocument;
  legacySnapshot.content.elements[0].children[0].frontendContract.revision = 8;
  const legacyRestore = clone(restore(legacySnapshot, entity));
  assert.equal(legacyRestore.content.elements[0].children[0].frontendContract.revision, 8);
  assert.deepEqual(legacyRestore.content.elements[0].children[0].chartSchema, rawElement.children[0].chartSchema);
  assert.deepEqual(legacyRestore.content.frontendRevision, content.frontendRevision); checks += 3;
  // Demo JSON storage preserves the same extension locations; it does not relocate them.
  const demoReopen = clone({ elements: [rawElement] });
  assert.deepEqual(databaseReopen.elements[0].frontendSlots, demoReopen.elements[0].frontendSlots);
  assert.deepEqual(databaseReopen.elements[0].children[0].frontendContract, demoReopen.elements[0].children[0].frontendContract);
  assert.equal(databaseReopen.elements[0].metadata.legacy.storedLegacyExtension, 'retain');
  assert.equal(Object.hasOwn(databaseReopen.elements[0].metadata.legacy, 'frontendSlots'), false); checks += 4;
}
console.log(`Content extension round-trip checks passed: ${checks}. Actual core conversion and page/post repository adapters; JSON storage round-trips are fixtures.`);
