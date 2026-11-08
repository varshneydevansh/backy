import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as core from '@backy-cms/core';
import { PageRenderer, ElementRenderer, applyResponsiveOverrides, type CanvasElement } from '../src/components/PageRenderer';

async function main() {
const imported = [{ id: 'flow-parent', type: 'container', x: 24, y: 24, width: 1100, height: 300,
  props: { display: 'flex', flexDirection: 'row', gap: 24 }, styles: { height: 'auto' },
  responsive: { tablet: { width: 720, props: { flexWrap: 'wrap', gap: 16 } }, mobile: { width: 327, props: { flexDirection: 'column', gap: 12 } } },
  children: [{ id: 'flow-title', type: 'heading', x: 999, y: 999, width: 400, height: 80,
    props: { content: 'Imported heading' }, styles: { width: '50%', height: 'auto', flex: '1 1 0%' },
    responsive: { mobile: { styles: { width: '100%', order: 1 } } },
  }, { id: 'flow-grid', type: 'container', x: 800, y: 800, width: 600, height: 220,
    props: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 },
    styles: { width: '50%', height: 'auto', flex: '1 1 0%' },
    responsive: { mobile: { props: { gridTemplateColumns: 'minmax(0, 1fr)' }, styles: { width: '100%', order: 0 } } },
    children: [{ id: 'grid-copy', type: 'text', x: 800, y: 800, width: 200, height: 80, props: { content: 'Intrinsic copy wraps with the grid track.' }, styles: { width: 'auto', height: 'auto' } },
      { id: 'grid-note', type: 'text', x: 800, y: 800, width: 200, height: 80, props: { content: 'Another editable child.' }, styles: { width: 'auto', height: 'auto' } }],
  }],
}] as CanvasElement[];
const html = renderToStaticMarkup(<PageRenderer content={{ elements: imported, canvasSize: { width: 1200, height: 800 } }} />);
function wrapper(markup: string, id: string) {
  const tag = [...markup.matchAll(/<div\b[^>]*>/g)].find(([tag]) => tag.includes(`data-backy-element-id="${id}"`));
  assert(tag, `Missing public wrapper ${id}`); return tag[0];
}
assert(wrapper(html, 'flow-title').includes('position:relative'), 'Imported flex child must participate in parent layout, not remain absolute');
assert(wrapper(html, 'flow-title').includes('width:50%'));
assert(wrapper(html, 'flow-title').includes('height:auto'));
assert(!wrapper(html, 'flow-title').includes('left:999px'), 'Flow ignores saved free-position offsets');
assert(wrapper(html, 'grid-copy').includes('position:relative'));
assert(html.includes('display:flex') && html.includes('gap:24px'));
assert(html.includes('grid-template-columns:repeat(2, minmax(0, 1fr))'));
assert.equal(core.resolveBackyChildLayout({ props: { layout: 'free', display: 'flex' } }), 'free', 'Explicit free mode wins over old imported display');
const absolute = { ...imported[0].children![0], styles: { position: 'absolute', right: '5%', top: '2rem', width: '25%', height: 'auto' } } as CanvasElement;
assert.deepEqual(core.buildBackyCanvasElementGeometry(absolute, 'flex'), { position: 'absolute', left: undefined, top: '2rem', width: '25%', height: 'auto', right: '5%', bottom: undefined });
assert.equal(core.buildBackyCanvasElementGeometry({ ...absolute, styles: { position: 'fixed' } }, 'grid').position, 'fixed');
assert.equal(core.buildBackyCanvasElementGeometry(imported[0].children![0], 'free').left, 999, 'Legacy mode retains exact geometry');
assert.equal(core.buildBackyCanvasContentStyles({ styles: { width: '50%', height: 'auto', color: 'red', margin: '1rem' } }, 'flex').width, undefined, 'Percentage width applies once, on the item wrapper');

// Real saved content migration + JSON persistence preserves nested identities,
// relative/intrinsic sizes, imported extensions, and every breakpoint override.
const snapshot = JSON.stringify(imported);
const document = core.canvasContentPayloadToBackyContentDocument({ id: 'flow-fixture', kind: 'page', rawContent: { elements: imported, canvasSize: { width: 1200, height: 800 }, metadata: { importedComposition: { retain: true } } } });
const reopened = JSON.parse(JSON.stringify(document));
assert.deepEqual(reopened.elements[0].props, imported[0].props);
assert.deepEqual(reopened.elements[0].styles, imported[0].styles);
assert.deepEqual(reopened.elements[0].responsive, imported[0].responsive);
assert.deepEqual(reopened.elements[0].children[1].children.map((item: any) => item.id), ['grid-copy', 'grid-note']);
assert.equal(reopened.metadata.importedComposition.retain, true);
for (const breakpoint of ['mobile', 'tablet', 'desktop'] as const) {
  const resolved = applyResponsiveOverrides(reopened.elements, breakpoint);
  const rendered = renderToStaticMarkup(<PageRenderer content={{ elements: resolved, canvasSize: { width: breakpoint === 'mobile' ? 375 : breakpoint === 'tablet' ? 768 : 1200, height: 800 } }} />);
  assert(wrapper(rendered, 'flow-title').includes('position:relative'));
  assert(wrapper(rendered, 'grid-copy').includes('height:auto'));
  if (breakpoint === 'mobile') {
    assert(rendered.includes('flex-direction:column')); assert(wrapper(rendered, 'flow-title').includes('width:100%')); assert(wrapper(rendered, 'flow-title').includes('order:1'));
    assert(rendered.includes('grid-template-columns:minmax(0, 1fr)'));
  } else if (breakpoint === 'tablet') assert(rendered.includes('flex-wrap:wrap') && rendered.includes('gap:16px'));
  else assert(rendered.includes('flex-direction:row'));
}
const stretched = core.adaptBackyFluidCanvasElements([{ ...imported[0], x: 0, width: 1200 }], 1200, 1600);
assert.equal(stretched[0].children![0].x, 999, 'Fluid background expansion does not shift flow children');
assert.equal(JSON.stringify(imported), snapshot, 'Rendering/migration never rewrite caller-owned compositions');

const require = createRequire(import.meta.url);
function compile(source: string, dependencies: Record<string, unknown> = {}, bindings: Record<string, unknown> = {}, fileName = 'fixture.tsx') {
  const code = ts.transpileModule(source, { fileName, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', ...Object.keys(bindings), code)(
    (name: string) => name in dependencies ? dependencies[name] : name.startsWith('@/') || name.startsWith('./') ? {} : require(name),
    module, module.exports, ...Object.values(bindings));
  return module.exports;
}
const canvasPath = new URL('../../admin/src/components/editor/Canvas.tsx', import.meta.url);
const admin = compile(readFileSync(canvasPath, 'utf8'), {
  '@backy-cms/core': core, '@/lib/utils': { cn: (...items: unknown[]) => items.filter(item => typeof item === 'string').join(' ') },
  // Canvas imports the shared implementation relative to its source directory.
  // This VM executes from scripts/, so resolve that real dependency explicitly.
  '../../../../public/src/lib/animationHydration': require(fileURLToPath(new URL('../src/lib/animationHydration.ts', import.meta.url))),
  '@backy-cms/editor/data-figure': { DataFigure: () => null },
  './blocks/RichTextBlock': { RichTextBlock: ({ content }: any) => <div>{typeof content === 'string' ? content : 'Rich text'}</div> },
  './ActiveEditorContext': { useActiveEditor: () => null },
});
const noop = () => {};
const adminMarkup = (elements: CanvasElement[]) => renderToStaticMarkup(<admin.CanvasElementComponent
  element={elements[0]} parentId={null} isSelected={false} selectedId={null} selectedIds={[]} draggingId={null}
  isPreview={true} isEditing={false} editingId={null} onDragStart={noop} onResizeStart={noop} onClick={noop}
  onSelectElement={noop} onUpdate={noop} onUpdateElement={noop} onDoubleClick={noop}
/>);
function adminWrapper(markup: string, id: string) {
  const tag = [...markup.matchAll(/<div\b[^>]*>/g)].find(([tag]) => tag.includes(`data-element-id="${id}"`)); assert(tag); return tag[0];
}
for (const breakpoint of ['mobile', 'tablet', 'desktop'] as const) {
  const resolved = applyResponsiveOverrides(reopened.elements, breakpoint);
  const markup = adminMarkup(resolved);
  assert(adminWrapper(markup, 'flow-title').includes('position:relative'), `Actual editor ${breakpoint} wrapper participates in flow`);
  assert(adminWrapper(markup, 'grid-copy').includes('height:auto'));
  assert(adminWrapper(markup, 'flow-parent').includes('data-backy-intrinsic-height="true"'));
  assert(!adminWrapper(markup, 'flow-title').includes('left:999px'));
  assert(markup.includes(breakpoint === 'mobile' ? 'flex-direction:column' : 'flex-direction:row'));
}
const blockElements = applyResponsiveOverrides(reopened.elements, 'mobile');
blockElements[0].props = { ...blockElements[0].props, layout: 'flow', display: 'block' };
const blockPublic = renderToStaticMarkup(<ElementRenderer element={blockElements[0]} />);
const blockAdmin = adminMarkup(blockElements);
assert(blockPublic.indexOf('data-backy-element-id="flow-grid"') < blockPublic.indexOf('data-backy-element-id="flow-title"'), 'Block flow renders saved order even though CSS block does not support order');
assert(blockAdmin.indexOf('data-element-id="flow-grid"') < blockAdmin.indexOf('data-element-id="flow-title"'));
assert.deepEqual(blockElements[0].children!.map((child: any) => child.id), ['flow-title', 'flow-grid'], 'Visual block order leaves the canonical tree unchanged');

// Actual editor viewport switch, explicit size edit, and persistence callback:
// breakpoint previews cannot silently overwrite canonical desktop dimensions.
const desktopCanvas = { width: 1200, height: 800, layout: 'fixed' as const, importedExtension: { keep: true } };
let activeBreakpoint = 'desktop';
let sizeDirtyCount = 0;
let persistedSize: any;
const switcher = extract('../../admin/src/components/editor/CanvasEditor.tsx', ['handleBreakpointChange'], {
  useCallback: (fn: unknown) => fn, isCanvasMutationDisabled: false, editDisabledReason: '', setEditorNotice: noop,
  setBreakpoint: (value: string) => { activeBreakpoint = value; },
  applyCanvasSize: () => { throw new Error('Breakpoint preview must not author canvas size'); },
});
switcher.handleBreakpointChange('mobile');
assert.equal(activeBreakpoint, 'mobile'); assert.equal(sizeDirtyCount, 0);
assert.deepEqual(core.resolveBackyCanvasBreakpointSize(desktopCanvas, 'mobile'), { ...desktopCanvas, width: 375, height: 812 });
assert.deepEqual(core.resolveBackyCanvasBreakpointSize(desktopCanvas, 'tablet'), { ...desktopCanvas, width: 768, height: 1024 });
const dimensionEditor = extract('../../admin/src/components/editor/CanvasEditor.tsx', ['applyCanvasSize'], {
  ...core, useCallback: (fn: unknown) => fn, breakpoint: 'mobile', canvasSourceSize: desktopCanvas,
  size: core.resolveBackyCanvasBreakpointSize(desktopCanvas, 'mobile'), elements: imported, pageSettings: { title: 'Flow' },
  isCanvasMutationDisabled: false, editDisabledReason: '', setEditorNotice: noop, clampCanvasDimension: (value: number) => value,
  setBreakpoint: (value: string) => { activeBreakpoint = value; }, setSize: (value: unknown) => { persistedSize = value; },
  markChanges: () => { sizeDirtyCount++; }, onChange: (_elements: unknown, _settings: unknown, value: unknown) => { persistedSize = value; },
});
dimensionEditor.applyCanvasSize({ width: 390, height: 900, layout: 'fixed' });
assert.equal(sizeDirtyCount, 1); assert.equal(persistedSize.width, 1200); assert.equal(persistedSize.height, 800);
assert.deepEqual(persistedSize.responsive.mobile, { width: 390, height: 900, layout: 'fixed' });
switcher.handleBreakpointChange('desktop');
assert.equal(activeBreakpoint, 'desktop'); assert.equal(core.resolveBackyCanvasBreakpointSize(persistedSize, 'desktop').width, 1200);
const saveBindings = (canvasSourceSize: any) => ({
  useCallback: (fn: unknown) => fn, canvasSourceSize, size: { width: 375, height: 812 },
  manualSaveRequestedRef: { current: false }, saveInFlightRef: { current: false }, activeSaveModeRef: { current: null }, queuedManualSaveRef: { current: false },
  isParentPersistence: false, canEdit: true, editDisabledReason: '', hasUnsavedChanges: true, normalizedSaveOwnerLabel: 'Page',
  changeSequenceRef: { current: 1 }, pageSettings: { title: 'Flow' }, validateSettings: undefined, autosaveTimeoutRef: { current: null }, elementsRef: { current: imported },
  setSaveStatus: noop, setAutosaveDueAt: noop, setEditorNotice: noop, setLastSaveError: noop, setHasUnsavedChanges: noop,
  setIsSaving: noop, setLastSavedAt: noop, setLastSaveMode: noop, setPendingChangeCount: noop,
  onSave: (_elements: unknown, _settings: unknown, value: unknown) => { persistedSize = value; },
});
const pristineSave = extract('../../admin/src/components/editor/CanvasEditor.tsx', ['handleSaveWrapper'], saveBindings(desktopCanvas));
await pristineSave.handleSaveWrapper(undefined, true);
assert.equal(persistedSize.width, 1200, 'Actual autosave persists source desktop width even when preview width is 375');
assert.equal(persistedSize.responsive, undefined, 'Previewing mobile alone creates no responsive sizing override');
dimensionEditor.applyCanvasSize({ width: 390, height: 900, layout: 'fixed' });
const explicitSave = extract('../../admin/src/components/editor/CanvasEditor.tsx', ['handleSaveWrapper'], saveBindings(persistedSize));
await explicitSave.handleSaveWrapper();
const sizeDocument = core.canvasContentPayloadToBackyContentDocument({ id: 'responsive-size-fixture', kind: 'page', rawContent: { elements: imported, canvasSize: persistedSize } });
const reopenedCanvas = JSON.parse(JSON.stringify(sizeDocument)).metadata.canvasSize;
assert.equal(core.resolveBackyCanvasBreakpointSize(reopenedCanvas, 'desktop').width, 1200);
assert.equal(core.resolveBackyCanvasBreakpointSize(reopenedCanvas, 'desktop').height, 800);
assert.equal(core.resolveBackyCanvasBreakpointSize(reopenedCanvas, 'mobile').width, 390);
assert.equal(core.resolveBackyCanvasBreakpointSize(reopenedCanvas, 'mobile').height, 900);
assert.deepEqual(reopenedCanvas.importedExtension, { keep: true });
const catalog = compile(readFileSync(new URL('../../admin/src/components/editor/editorCatalog.ts', import.meta.url), 'utf8'), {
  '@backy-cms/core': core, '@/lib/utils': { generateId: () => 'generated-fixture-id' },
}, {}, 'editorCatalog.ts');
const routeSerialized = catalog.serializeCanvasContent(imported, persistedSize, undefined, { documentId: 'responsive-size-fixture', kind: 'page' });
const routeReopened = catalog.normalizeSavedCanvasContent(routeSerialized);
assert.equal(routeReopened.canvasSize.width, 1200, 'The actual page-route serializer/reopen normalizer retains canonical desktop dimensions');
assert.equal(routeReopened.canvasSize.height, 800);
assert.equal(core.resolveBackyCanvasBreakpointSize(routeReopened.canvasSize, 'mobile').width, 390);
assert.equal(core.resolveBackyCanvasBreakpointSize(routeReopened.canvasSize, 'mobile').height, 900);
assert.equal(routeReopened.contentDocument.metadata.canvasSize.responsive.mobile.width, 390);

// Run the editor's actual private responsive merge and keyboard operations,
// extracted with the TypeScript parser rather than reimplementing their behavior.
function extract(relative: string, names: string[], bindings: Record<string, unknown>) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, ts.Node>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)) declarations.set(declaration.name.text, node);
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) declarations.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const name of names) assert(declarations.has(name), `Missing actual editor declaration ${name}`);
  return compile([...new Set(names.map(name => declarations.get(name)))].map(node => node!.getFullText(source)).join('\n') + `\nexport { ${names.join(',')} };`, {}, bindings);
}
const editorDeclarations = ['RESPONSIVE_GEOMETRY_FIELDS', 'RESPONSIVE_LAYER_STATE_FIELDS', 'RESPONSIVE_LAYOUT_FIELDS', 'parseEditorBoolean', 'isLayerHidden', 'isLayerLocked', 'normalizeResponsiveFieldValue', 'isResponsiveLayoutField', 'isPlainRecord', 'mapElementsById', 'pruneResponsiveOverrides', 'setResponsiveOverride', 'applyResponsiveOverrideToElement', 'applyResponsiveOverridesToElements', 'mergeDisplayedElementsIntoBreakpoint', 'applyUpdatesForBreakpoint', 'findElementEntry', 'updateElementById', 'nudgeSelectedElement'];
let keyboardResult: any;
const editor = extract('../../admin/src/components/editor/CanvasEditor.tsx', editorDeclarations, {
  ...core, useCallback: (fn: unknown) => fn, selectedId: 'flow-title', selectedIds: ['flow-title'], breakpoint: 'mobile', size: { width: 375, height: 800 },
  updateElementsWithHistory: (operation: any) => { keyboardResult = operation(reopened.elements); },
});
const displayed = editor.applyResponsiveOverridesToElements(reopened.elements, 'mobile');
const selection = extract('../../admin/src/components/editor/Canvas.tsx', ['findElementEntry', 'findElementById', 'collectSelectionInfoMetrics', 'SelectionInfo'], core);
const selectionMarkup = renderToStaticMarkup(<selection.SelectionInfo elements={displayed} selectedId="flow-title" selectedIds={['flow-title']} />);
assert(selectionMarkup.includes('data-selection-geometry="layout-sizing"') && selectionMarkup.includes('Flow sizing'));
assert(selectionMarkup.includes('100%') && selectionMarkup.includes('auto'), 'Flow HUD labels authored layout units instead of pretending fallback pixels are live');
assert(!selectionMarkup.includes('999') && !selectionMarkup.includes('400') && !selectionMarkup.includes('>80<'), 'Flow HUD does not present saved fallback geometry as live');
const selectedFlowHandle = renderToStaticMarkup(<admin.CanvasElementComponent element={displayed[0].children![0]} parentId="flow-parent" parentLayout="flex" isSelected selectedId="flow-title" selectedIds={['flow-title']} draggingId={null} isPreview={false} isEditing={false} editingId={null} onDragStart={noop} onResizeStart={noop} onClick={noop} onSelectElement={noop} onUpdate={noop} onUpdateElement={noop} onDoubleClick={noop} />);
assert(selectedFlowHandle.includes('Flow order') && selectedFlowHandle.includes('Drag to reorder within the parent layout'));
assert(!selectedFlowHandle.includes('>999, 999<'), 'Flow drag label does not expose fallback coordinates as live');
const freeSelectionMarkup = renderToStaticMarkup(<selection.SelectionInfo elements={[{ ...displayed[0].children![0], styles: {} }]} selectedId="flow-title" selectedIds={['flow-title']} />);
assert(freeSelectionMarkup.includes('data-selection-geometry="authored"') && freeSelectionMarkup.includes('999'), 'Legacy free selection retains authored geometry display');
const reordered = core.reorderBackyFlowChildren(displayed[0].children, 'flow-title', 'flow-grid');
assert.equal(reordered[0].x, 999); assert.equal(reordered[0].y, 999);
const saved = editor.mergeDisplayedElementsIntoBreakpoint(reopened.elements, [{ ...displayed[0], children: reordered }], 'mobile');
assert.equal(saved[0].children[0].styles.order, undefined, 'Mobile ordering does not rewrite desktop order');
assert.equal(saved[0].children[0].responsive.mobile.styles.order, 0);
assert.equal(saved[0].children[0].responsive.mobile.styles.flex, undefined, 'Untouched flex sizing keeps inheriting');
const desktopEdit = JSON.parse(JSON.stringify(saved)); desktopEdit[0].children[0].styles.flex = '2 1 0%';
assert.equal(editor.applyResponsiveOverridesToElements(desktopEdit, 'mobile')[0].children[0].styles.flex, '2 1 0%');
editor.nudgeSelectedElement(0, -1);
assert.equal(keyboardResult[0].children[0].responsive.mobile.styles.order, 0, 'Keyboard arrows reorder flow children at the selected breakpoint');
assert.equal(keyboardResult[0].children[0].x, 999, 'Flow keyboard edits never overwrite free coordinates');
const resized = editor.applyUpdatesForBreakpoint(reopened.elements[0].children[0], { styles: { ...reopened.elements[0].children[0].styles, width: '100%' } }, 'tablet');
assert.deepEqual(resized.responsive.tablet.styles, { width: '100%' }, 'Property changes store only their responsive difference');
assert.deepEqual(core.diffBackyCanvasOverrideMap({ color: 'red', padding: 8 }, { color: 'red', padding: 8, order: 2 }), { order: 2 });
const boxes = [{ id: 'a', left: 0, top: 0, width: 100, height: 50 }, { id: 'b', left: 120, top: 0, width: 100, height: 50 }, { id: 'c', left: 0, top: 70, width: 100, height: 50 }];
assert.equal(core.backyFlowInsertionTarget(boxes, { x: 30, y: 95 }, 'x'), 'c', 'Measured wrapped grid target uses actual row');
assert.equal(core.backyFlowInsertionTarget(boxes, { x: 210, y: 20 }, 'x'), 'c');
assert.equal(core.backyFlowInsertionTarget(boxes.slice(0, 2), { x: 210, y: 20 }, 'x', true), 'b', 'Reverse flex respects visual direction');
let dragWrites = 0;
const dragElements = { current: displayed };
const drag = extract('../../admin/src/components/editor/Canvas.tsx', ['applyGlobalElementMove', 'updateElementById', 'matchesInteractionInput'], {
  ...core, useCallback: (fn: unknown) => fn, disabled: false, isPreview: false,
  resizeStateRef: { current: null }, marqueeSelectionRef: { current: null }, elementsRef: dragElements,
  dragStateRef: { current: { elementId: 'flow-title', elementIds: ['flow-title'], inputType: 'mouse', startX: 100, startY: 100,
    flow: { parentId: 'flow-parent', boxes: [{ id: 'flow-grid', left: 0, top: 0, width: 100, height: 100 }], axis: 'y', reverse: false } } },
  getCanvasPoint: noop, maybeAutoExtendCanvas: noop, setAlignmentGuides: noop, safeGridSize: 8, size: { width: 375, height: 800 }, snapEnabled: false, toCanvasDelta: (value: number) => value,
  onElementsChange: (_elements: unknown, options: any) => { assert.equal(options.transient, true); dragWrites++; },
});
drag.applyGlobalElementMove({ clientX: 100, clientY: 100, isPointerEvent: false }); assert.equal(dragWrites, 0, 'Click alone never reorders');
drag.applyGlobalElementMove({ clientX: 25, clientY: 25, isPointerEvent: false });
assert.equal(dragWrites, 1); assert.equal(dragElements.current[0].children[0].styles.order, 0); assert.equal(dragElements.current[0].children[0].x, 999);
drag.applyGlobalElementMove({ clientX: 25, clientY: 25, isPointerEvent: false }); assert.equal(dragWrites, 1, 'Stationary pointer does not churn order/history');
const resizeElements = { current: displayed };
let resizeWrites = 0;
const resize = extract('../../admin/src/components/editor/Canvas.tsx', ['applyGlobalElementMove', 'updateElementById', 'matchesInteractionInput'], {
  ...core, useCallback: (fn: unknown) => fn, disabled: false, isPreview: false,
  resizeStateRef: { current: { elementId: 'flow-title', inputType: 'mouse', startX: 100, startY: 100, handle: 'e', flow: { width: 327, height: 45 } } },
  marqueeSelectionRef: { current: null }, dragStateRef: { current: null }, elementsRef: resizeElements,
  getCanvasPoint: noop, maybeAutoExtendCanvas: noop, setAlignmentGuides: noop, safeGridSize: 8, size: { width: 375, height: 800 }, snapEnabled: false, toCanvasDelta: (value: number) => value / 2,
  onElementsChange: () => { resizeWrites++; },
});
resize.applyGlobalElementMove({ clientX: 100, clientY: 100, isPointerEvent: false }); assert.equal(resizeWrites, 0);
resize.applyGlobalElementMove({ clientX: 140, clientY: 100, isPointerEvent: false });
assert.equal(resizeWrites, 1); assert.equal(resizeElements.current[0].children[0].styles.width, 347, 'Flow resize uses measured pixels and actual canvas scale');
assert.equal(resizeElements.current[0].children[0].styles.height, 'auto', 'Untouched intrinsic height remains auto');
assert.equal(resizeElements.current[0].children[0].x, 999); assert.equal(resizeElements.current[0].children[0].width, 400, 'CSS resize preserves numeric free fallback');
const responsiveResize = editor.mergeDisplayedElementsIntoBreakpoint(reopened.elements, resizeElements.current, 'mobile');
assert.equal(responsiveResize[0].children[0].responsive.mobile.styles.width, 347); assert.equal(responsiveResize[0].children[0].styles.width, '50%');

let extendedBottom = 0;
const measuredCanvas = extract('../../admin/src/components/editor/Canvas.tsx', ['measureIntrinsicCanvasHeight'], {
  useCallback: (fn: unknown) => fn, canvasRef: { current: {
    getBoundingClientRect: () => ({ top: 100, width: 600 }),
    querySelectorAll: (selector: string) => { assert.equal(selector, '[data-backy-intrinsic-height="true"]'); return [{ getBoundingClientRect: () => ({ bottom: 750 }) }]; },
  } }, disabled: false, isPreview: false, onSizeChange: noop, size: { width: 1200, height: 800 },
  maybeAutoExtendCanvas: (bottom: number) => { extendedBottom = bottom; },
});
measuredCanvas.measureIntrinsicCanvasHeight();
assert.equal(extendedBottom, 1300, 'Actual editor measurement expands to intrinsic content using rendered scale, not saved fallback offsets');

const controls = extract('../../admin/src/components/editor/PropertyPanel.tsx', ['LayoutProperties'], { resolveBackyChildLayout: core.resolveBackyChildLayout, NumberInput: () => null });
let controlUpdate: any;
const tree = controls.LayoutProperties({ element: reopened.elements[0], onChange: (value: any) => { controlUpdate = value; } });
function findControl(node: any, id: string): any {
  if (!node) return;
  if (Array.isArray(node)) { for (const child of node) { const found = findControl(child, id); if (found) return found; } return; }
  if (node.props?.['data-testid'] === id) return node;
  return findControl(node.props?.children, id);
}
findControl(tree, 'editor-child-layout').props.onChange({ target: { value: 'free' } });
assert.equal(controlUpdate.props.layout, 'free'); assert.equal(controlUpdate.x, undefined); assert.equal(controlUpdate.children, undefined, 'Mode conversion preserves the editable tree');
findControl(tree, 'editor-flow-height').props.onChange({ target: { value: 'auto' } }); assert.equal(controlUpdate.styles.height, 'auto');
findControl(tree, 'editor-flow-gap').props.onChange({ target: { value: '16' } }); assert.equal(controlUpdate.styles.gap, 16);
const savedAgain = core.canvasContentPayloadToBackyContentDocument({ id: document.id, kind: 'page', rawContent: { contentDocument: document, elements: saved } });
assert.equal(JSON.parse(JSON.stringify(savedAgain)).elements[0].children[0].responsive.mobile.styles.order, 0);
if (process.env.BACKY_FLOW_FIXTURE_OUTPUT) writeFileSync(process.env.BACKY_FLOW_FIXTURE_OUTPUT, JSON.stringify({ title: 'Flow layout fixture', slug: 'flow-layout-fixture', content: { elements: imported, canvasSize: { width: 1200, height: 800 }, metadata: { fixture: 'BK-17' } } }, null, 2));
console.log('Canvas flow layout passed: actual public/editor SSR, nested save/reopen at mobile/tablet/desktop, intrinsic units, absolute/fixed escapes, measured wrapped reorder, keyboard order, explicit controls and responsive inheritance. Browser layout/drag measurements remain separate.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
