import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createSlateEditor } from '@udecode/plate';
import { blogEditorSnapshotFingerprint, blogRichTextFingerprint, cloneBlogRichTextValue, preserveBlogRichTextIdentities } from './blogAuthoringSync';

const source = [{ id: 'authored-node', _id: 'authored-alias', type: 'p', owner: { id: 'owner-stays', role: 'article' }, children: [{ text: 'Original', bold: true }] }];
const before = JSON.stringify(source);
const editor = createSlateEditor({ value: cloneBlogRichTextValue(source) });
editor.tf.setValue(cloneBlogRichTextValue(source));
assert.equal(JSON.stringify(source), before, 'Plate insertion cannot mutate canonical author state with _id');
assert.equal(blogRichTextFingerprint(editor.children), blogRichTextFingerprint(source), 'internal node identity normalization is not an author edit');

const current = blogRichTextFingerprint(editor.children);
editor.tf.insertText('Changed ', { at: { path: [0, 0], offset: 0 } });
assert.notEqual(blogRichTextFingerprint(editor.children), current, 'real text changes pass the normalization baseline');
const stored = preserveBlogRichTextIdentities(source, editor.children);
assert.equal(stored[0].id, 'authored-node');
assert.equal(stored[0]._id, 'authored-alias');
assert.deepEqual(stored[0].owner, source[0].owner);
assert.equal(stored[0].children[0].bold, true);
assert.equal(stored[0].children[0].text, 'Changed Original');
assert.equal(blogRichTextFingerprint(stored), blogRichTextFingerprint(editor.children), 'acknowledged write survives author identity restoration');

const external = cloneBlogRichTextValue(source);
external[0].children[0].text = 'Layout update';
assert.notEqual(blogRichTextFingerprint(external), blogRichTextFingerprint(editor.children), 'true external Layout edits remain detectable');
editor.tf.setValue(cloneBlogRichTextValue(external));
assert.equal(blogRichTextFingerprint(external), blogRichTextFingerprint(editor.children));
assert.equal(external[0]._id, 'authored-alias');
const metadataChange = cloneBlogRichTextValue(source);
metadataChange[0].owner.id = 'different-owner';
assert.notEqual(blogRichTextFingerprint(metadataChange), blogRichTextFingerprint(source), 'unknown metadata identities remain meaningful');
const relabeled = cloneBlogRichTextValue(source);
relabeled[0].id = 'intentional-new-identity';
const relabeledStored = preserveBlogRichTextIdentities(relabeled, [{ ...editor.children[0], id: 'prior-engine-identity' }]);
assert.equal(relabeledStored[0].id, 'intentional-new-identity', 'identity-only Layout changes survive the next writer edit without resetting selection');
// Execute the production effect callbacks with an explicit React effect order.
// This reproduces an uncached async load without mounting the large canvas UI.
const routeSource = readFileSync(new URL('../routes/blog.$postId.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../components/editor/CanvasEditor.tsx', import.meta.url), 'utf8');
function findSourceExpression(sourceText: string, match: (node: ts.Node, file: ts.SourceFile) => boolean): string {
  const file = ts.createSourceFile('sync.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = '';
  const visit = (node: ts.Node) => {
    if (!expression && match(node, file)) expression = node.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(expression, 'production synchronization expression is available');
  return expression;
}
function effectCallback(sourceText: string, marker: string): string {
  return findSourceExpression(sourceText, (node, file) => ts.isArrowFunction(node)
    && ts.isCallExpression(node.parent) && node.parent.expression.getText(file) === 'useEffect'
    && node.body.getText(file).includes(marker));
}
function runExpression(expression: string, bindings: Record<string, any>): any {
  const javascript = ts.transpileModule(`const result = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${javascript}\nreturn result;`)(...Object.values(bindings));
}
// Run the actual route callback: a canonical key-order echo must retain the
// committed warning, while genuine layout/content changes still clear it.
const canvasParentCallback = findSourceExpression(routeSource, (node, file) => ts.isArrowFunction(node)
  && ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)
  && node.parent.parent.name.getText(file) === 'onChange'
  && node.body.getText(file).includes('if (editorBusy || !canEditBlog'));
const canonicalBody = [{ id: 'saved', type: 'paragraph', children: [], props: { content: 'Saved', owner: { zero: 0, enabled: false } }, x: 40, responsive: { mobile: { width: 280 } } }];
const reorderedBody = [{ responsive: { mobile: { width: 280 } }, x: 40, props: { owner: { enabled: false, zero: 0 }, content: 'Saved' }, children: [], type: 'paragraph', id: 'saved' }];
const parentState = { elements: canonicalBody as any[], size: { width: 720, height: 900 }, warning: 'Saved. Follow-up work needs attention.', changes: 0 };
const parentChange = () => runExpression(canvasParentCallback, {
  editorBusy: false, canEditBlog: true, isUsingLocalPostCopy: false,
  canvasElements: parentState.elements, canvasSize: parentState.size, blogEditorSnapshotFingerprint,
  clearEditorFeedback: () => { parentState.warning = ''; parentState.changes += 1; },
  setCanvasElements: (value: any[]) => { parentState.elements = value; },
  setCanvasSize: (value: typeof parentState.size) => { parentState.size = value; },
});
parentChange()(reorderedBody, {}, { height: 900, width: 720 });
assert.equal(parentState.changes, 0, 'same canonical canvas echo is not a new author edit');
assert.ok(parentState.warning, 'committed save warning survives parent hydration and render');
assert.equal(parentState.elements, canonicalBody, 'no-op echo retains parent state ownership');
assert.equal(blogEditorSnapshotFingerprint(canonicalBody), blogEditorSnapshotFingerprint(reorderedBody), 'dirty state ignores record key order');
const changedBody = cloneBlogRichTextValue(reorderedBody);
changedBody[0].props.owner.enabled = true;
parentChange()(changedBody, {}, { width: 720, height: 900 });
assert.equal(parentState.changes, 1, 'unknown-field edits still propagate');
assert.equal(parentState.warning, '', 'real author edits clear the prior save feedback');
parentChange()(changedBody, {}, { width: 720, height: 980 });
assert.equal(parentState.changes, 2, 'canvas geometry edits still propagate');
assert.equal(parentState.size.height, 980);
assert.notEqual(blogEditorSnapshotFingerprint([{ ...changedBody[0], id: 'new' }]), blogEditorSnapshotFingerprint(changedBody), 'canonical canvas identities remain meaningful');
assert.notEqual(blogEditorSnapshotFingerprint([{ ...changedBody[0], _id: 'changed' }]), blogEditorSnapshotFingerprint(changedBody), 'stored identity aliases remain meaningful');
for (const [left, right] of [[false, 0], [0, null], [null, undefined], [[0, false], [false, 0]], [{ unknown: null }, {}]]) {
  assert.notEqual(blogEditorSnapshotFingerprint({ value: left }), blogEditorSnapshotFingerprint({ value: right }), 'false/zero/null, field presence and array order remain meaningful');
}
const hydrateCallback = effectCallback(routeSource, 'setCanvasElements(initialElements)');
const syncCallback = effectCallback(canvasSource, 'onChange(elements, pageSettings, canvasSourceSize)');
const applyCallback = effectCallback(canvasSource, 'lastExternalElementsRevisionRef.current = externalElementsRevision');
const loadingIf = findSourceExpression(routeSource, (node, file) => ts.isIfStatement(node)
  && node.expression.getText(file).includes('isLoadingPost && !post'));
const loadingExpression = ts.createSourceFile('loading.tsx', loadingIf, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  .statements[0] as ts.IfStatement;
const loadingCondition = loadingExpression.expression.getText();
const hydrationInitializer = findSourceExpression(routeSource, (node, file) => ts.isCallExpression(node)
  && ts.isVariableDeclaration(node.parent) && node.parent.name.getText(file).includes('isCanvasHydrated'));
const initialHydration = (post: unknown) => runExpression(hydrationInitializer, { post, useState: (value: boolean) => value });
assert.equal(initialHydration(null), false, 'an uncached route waits for its first saved canvas baseline');
assert.equal(initialHydration({ id: 'cached' }), true, 'cached posts retain their existing initial canvas mount');
const backendTree = [
  { id: 'header', type: 'section', children: [] },
  { id: 'hero', type: 'section', children: [{ id: 'metadata-title', type: 'text', props: { binding: 'post.title' } }] },
  { id: 'body', type: 'section', children: [{ id: 'article', type: 'text', props: { content: 'Saved article body' } }] },
  { id: 'footer', type: 'section', children: [] },
];
const backendSnapshot = JSON.stringify(backendTree);
const savedSize = { width: 1200, height: 2370 };
const state = { post: null as any, elements: [] as any[], size: { width: 1200, height: 800 }, revision: 0, hydrated: initialHydration(null) };
const loading = () => runExpression(loadingCondition, {
  isLoadingPost: !state.post, post: state.post, isCanvasHydrated: state.hydrated,
});
const hydrate = (nextElements: any[]) => runExpression(hydrateCallback, {
  post: state.post, initialElements: nextElements, savedCanvasSize: savedSize,
  setCanvasElements: (value: any[]) => { state.elements = value; },
  setCanvasSize: (value: typeof savedSize) => { state.size = value; },
  setCanvasExternalRevision: (update: (value: number) => number) => { state.revision = update(state.revision); },
  setIsCanvasHydrated: (value: boolean) => { state.hydrated = value; },
})();
assert.equal(loading(), true);
state.post = { id: 'backend-only', content: backendSnapshot };
assert.equal(loading(), true, 'backend arrival must not mount a hidden canvas on the prior empty snapshot');
hydrate(backendTree);
assert.equal(loading(), false, 'hydrated post opens the writer and layout workspace');
assert.deepEqual(state.elements, backendTree);
assert.deepEqual(state.size, savedSize);

// The first canvas mount owns the loaded baseline; later replacements must
// suppress its stale onChange before applying the parent revision.
let childElements = state.elements;
let childSize = state.size;
let dirtyCount = 0;
const childRef = { current: childElements };
const revisionRef = { current: state.revision };
const pendingTransform = { current: null };
const sync = () => runExpression(syncCallback, {
  elements: childElements, elementsRef: childRef, canvasSourceSize: childSize, pageSettings: {},
  externalElementsRevision: state.revision, lastExternalElementsRevisionRef: revisionRef,
  onChange: (value: any[], _settings: any, size: typeof savedSize) => { state.elements = value; state.size = size; },
})();
sync();
assert.equal(dirtyCount, 0, 'fresh mount does not mark backend hydration as an author edit');
assert.equal(JSON.stringify(state.elements), backendSnapshot, 'fresh mount retains all roots and nested body');
const replacement = cloneBlogRichTextValue(backendTree);
replacement[2].children[0].props.content = 'Updated article from backend';
hydrate(replacement);
sync();
assert.deepEqual(state.elements, replacement, 'stale canvas echo cannot overwrite a route replacement');
runExpression(applyCallback, {
  externalElementsRevision: state.revision, lastExternalElementsRevisionRef: revisionRef,
  initialElements: state.elements, initialSize: state.size, elementsRef: childRef,
  pendingTransformRef: pendingTransform, selectedIdRef: { current: 'article' }, selectedIdsRef: { current: ['article'] },
  cloneElements: cloneBlogRichTextValue,
  historyElementsEqual: (left: any[], right: any[]) => JSON.stringify(left) === JSON.stringify(right),
  resolveSelectionSnapshot: (_tree: any[], selectedId: string, selectedIds: string[]) => ({ selectedId, selectedIds }),
  setElements: (value: any[]) => { childElements = value; },
  setSize: (value: typeof savedSize) => { childSize = value; },
  setSelectedId: () => {}, setSelectedIds: () => {}, addToHistory: () => {},
  markChanges: () => { dirtyCount += 1; },
})();
sync();
assert.deepEqual(state.elements, replacement, 'applied layout and writer trees converge after external replacement');
assert.equal(dirtyCount, 1, 'only the subsequent external edit enters canvas history');
assert.equal(JSON.stringify(backendTree), backendSnapshot, 'hydration never mutates the saved backend payload');

// Pages also mount CanvasEditor from a cache. Their first mount must wait for
// the initial backend read, while later reloads keep unsaved canvas state alive.
const pageRouteSource = readFileSync(new URL('../routes/pages.$pageId.edit.tsx', import.meta.url), 'utf8');
const pageLoadingIf = findSourceExpression(pageRouteSource, (node, file) => ts.isIfStatement(node)
  && node.expression.getText(file).startsWith('isLoadingPage &&'));
const pageLoadingCondition = (ts.createSourceFile('page-loading.tsx', pageLoadingIf, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  .statements[0] as ts.IfStatement).expression.getText();
const loadPageCallback = findSourceExpression(pageRouteSource, (node) => ts.isArrowFunction(node)
  && ts.isVariableDeclaration(node.parent) && node.parent.name.getText() === 'loadPage');
const cachedPage = {
  id: 'cached-page', content: { elements: [{ id: 'intro', type: 'section', height: 110,
    responsive: { tablet: { height: 110 }, mobile: { height: 154 } },
    children: [{ id: 'paragraph', type: 'text', props: { binding: 'collection.article', content: 'Saved text' } }],
  }], metadata: { layoutMode: 'fluid' }, customCSS: '.authored { color: red; }' },
};
const backendPage = cloneBlogRichTextValue([cachedPage])[0];
backendPage.content.elements[0].height = 358;
const backendPageSnapshot = JSON.stringify(backendPage);
const pageLoadInitializer = findSourceExpression(pageRouteSource, (node, file) => ts.isCallExpression(node)
  && ts.isVariableDeclaration(node.parent) && node.parent.name.getText(file).includes('loadedPageId'));
const initialLoadedId = runExpression(pageLoadInitializer, { useState: (value: string | null) => value });
assert.equal(initialLoadedId, null, 'even a cached page must await its initial backend read');
const pageState = { page: cachedPage, loading: true, loadedId: initialLoadedId as string | null };
const pageLoading = () => runExpression(pageLoadingCondition, {
  isLoadingPage: pageState.loading, page: pageState.page, pageId: cachedPage.id, loadedPageId: pageState.loadedId,
});
assert.equal(pageLoading(), true, 'a stale cached page must not become the initial canvas baseline');
let finishPageRead!: (value: typeof backendPage) => void;
const pageRead = new Promise<typeof backendPage>((resolve) => { finishPageRead = resolve; });
let readPage = () => pageRead;
let pageLoadError: string | null = null;
const loadPage = runExpression(loadPageCallback, {
  canViewPage: true, cancelled: false, nextSiteId: 'site-demo', pageId: cachedPage.id,
  localFallbackPage: cachedPage, viewPagePermissionTitle: '', sleep: async () => {},
  getPage: () => readPage(),
  setIsLoadingPage: (value: boolean) => { pageState.loading = value; },
  setPage: (value: typeof cachedPage) => { pageState.page = value; },
  setLoadedPageId: (value: string) => { pageState.loadedId = value; },
  setLoadError: (value: string | null) => { pageLoadError = value; }, setSaveConflict: () => {}, updatePage: () => {},
});
const loadingTask = loadPage();
assert.equal(pageLoading(), true, 'cached page remains gated during the pending backend request');
finishPageRead(backendPage);
await loadingTask;
assert.equal(pageLoading(), false);
assert.equal(pageState.loadedId, cachedPage.id, 'only a completed initial read releases this page baseline');
assert.equal(pageState.page.content.elements[0].height, 358, 'first canvas mount receives backend desktop geometry');
assert.deepEqual(pageState.page.content.elements[0].responsive, cachedPage.content.elements[0].responsive);
assert.equal(JSON.stringify(pageState.page), backendPageSnapshot, 'bindings, nested text and design fields survive hydration');
pageState.loading = true;
assert.equal(pageLoading(), false, 'later reload attempts keep the existing unsaved canvas mounted');
assert.equal(cachedPage.content.elements[0].height, 110, 'hydration does not mutate the earlier cache payload');
pageState.loadedId = null;
pageState.page = cachedPage;
readPage = async () => { throw new Error('Backend unavailable'); };
await loadPage();
assert.equal(pageLoading(), false, 'failed initial reads release the existing read-only cache fallback');
assert.equal(pageLoadError, 'Backend unavailable');
assert.equal(pageState.page, cachedPage);
console.log('Blog writer and cached page synchronization checks passed.');
