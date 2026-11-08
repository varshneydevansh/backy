import assert from 'node:assert/strict';
import React from 'react';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSlateEditor } from '@udecode/plate';
import { Editor, Node, Transforms } from 'slate';
import { InteractiveComponentBlock, InteractiveComponentChooser } from '../src/InteractiveComponentBlock';
import { createRichInteractiveComponent, interactiveComponentFields, interactiveComponentValue, patchInteractiveComponentValue } from '../src/interactiveComponent';
import type { BackyInteractiveRegistryEntry, BackyInteractiveComponentNode } from '../src/interactiveComponent';
import { insertRichInteractiveComponent, insertRichArticleBlock, insertRichCodeBlock } from '../src/ui/richBlockTransforms';
import { captureToolbarSelection, restoreToolbarSelection, createToolbarFocusScheduler } from '../src/ui/toolbarEditing';
import { handleBackyFigureControlKeyDown } from '../src/inputEvents';

async function main() {
const entry: BackyInteractiveRegistryEntry = { componentKey: 'registered.diagram', version: '2.3.0', type: 'codeComponent', status: 'active', renderMode: 'sandbox-iframe', displayName: 'Round sequence', description: 'A registered animated diagram.', defaultProps: { rounds: 3, retained: { nested: true } }, controls: [{ key: 'rounds', type: 'range', min: 1, max: 12, defaultValue: 4, controlExtension: 'retain' }, { key: 'speed', type: 'select', options: ['slow', 'normal', 'fast'], defaultValue: 'normal' }], propsSchema: { type: 'object', required: ['rounds'], properties: { rounds: { type: 'integer', minimum: 1 }, visible: { type: 'boolean' }, series: { type: 'array' } } }, dataBindings: { source: { collectionId: 'public-series' }, extension: 'retain' } };
const registrySource = JSON.stringify(entry);
const node = createRichInteractiveComponent(entry);
assert.equal(JSON.stringify(entry), registrySource, 'Insertion never mutates the shared registry.');
assert.deepEqual(node.dataBindings, entry.dataBindings); assert.equal(node.version, '2.3.0');
node.props.rounds = 5; assert.equal(entry.defaultProps!.rounds, 3, 'Registry defaults are deep cloned.');
const fields = interactiveComponentFields(node);
assert.deepEqual(fields.map((field) => field.key), ['rounds', 'speed', 'visible', 'series']);
assert.equal(fields[0].required, true); assert.equal(fields[0].minimum, 1);
assert.equal(interactiveComponentValue(node, fields[1]), 'normal');
const patch = patchInteractiveComponentValue(node, 'rounds', 7);
assert.deepEqual(patch.props.retained, { nested: true }); assert.equal(patch.controls[0].controlExtension, 'retain'); assert.equal(patch.controls[0].value, 7);
assert.throws(() => patchInteractiveComponentValue(node, '__proto__', {}));
assert.throws(() => createRichInteractiveComponent({ ...entry, status: 'revoked' }));
assert.doesNotThrow(() => interactiveComponentFields({ ...node, controls: [null, []] as any }));

const require = createRequire(import.meta.url);
const cssLoader = require.extensions['.css']; require.extensions['.css'] = () => {};
const { BackyEditor, BackyInteractiveComponentPlugin } = await import('../src/index');
if (cssLoader) require.extensions['.css'] = cssLoader; else delete require.extensions['.css'];
const editor = createSlateEditor({ plugins: [BackyInteractiveComponentPlugin], value: [
 { type: 'code_block', id: 'keep-code', children: [{ type: 'code_line', children: [{ text: 'const article = true;', customLeaf: 'retain' }] }] },
 { type: 'p', id: 'following', children: [{ text: 'Continue the article' }] },
] });
Transforms.select(editor as any, { path: [0, 0, 0], offset: 6 });
const originalCaret = captureToolbarSelection(editor as any);
const position = Editor.rangeRef(editor as any, originalCaret!, { affinity: 'forward' });
// A chooser stays open while another content operation moves its retained position.
Transforms.insertNodes(editor as any, { type: 'p', children: [{ text: 'New introduction' }] } as any, { at: [0] });
assert.equal(position.current!.anchor.path[0], 1);
assert(restoreToolbarSelection(editor as any, position.current));
insertRichInteractiveComponent(editor as any, entry); position.unref();
const inserted = editor.children[2] as unknown as BackyInteractiveComponentNode;
assert.equal(inserted.type, 'interactive_component'); assert.equal(inserted.componentKey, entry.componentKey); assert.equal(inserted.version, entry.version);
assert(editor.isVoid(inserted as any), 'Production plugin makes the registered component a Slate void.');
assert.equal((editor.children[1] as any).id, 'keep-code'); assert.equal((editor.children[1] as any).children[0].children[0].customLeaf, 'retain');
assert.equal((editor.children[3] as any).id, 'following');
assert(editor.selection && Node.has(editor as any, editor.selection.anchor.path), 'Insertion has a valid text-leaf selection.');
Transforms.setNodes(editor as any, { id: 'diagram-id', customExtension: { opaque: true }, runtime: { sandboxUrl: 'https://untrusted.test/saved' } } as any, { at: [2], voids: true });
Transforms.select(editor as any, { path: [3, 0], offset: 8 });
const caret = JSON.stringify(editor.selection);
Transforms.setNodes(editor as any, patchInteractiveComponentValue(editor.children[2] as unknown as BackyInteractiveComponentNode, 'rounds', 9) as any, { at: [2], voids: true });
assert.equal(JSON.stringify(editor.selection), caret, 'Configuration controls preserve the article caret.');
const saved = JSON.parse(JSON.stringify(editor.children));
const reopened = createSlateEditor({ plugins: [BackyInteractiveComponentPlugin], value: saved });
const reopenedNode = reopened.children[2] as unknown as BackyInteractiveComponentNode;
assert.equal(reopenedNode.version, '2.3.0'); assert.deepEqual(reopenedNode.props.retained, { nested: true }); assert.equal(reopenedNode.props.rounds, 9);
assert.deepEqual(reopenedNode.customExtension, { opaque: true }); assert.deepEqual(reopenedNode.dataBindings, entry.dataBindings); assert.equal(reopenedNode.id, 'diagram-id');

let captured: BackyInteractiveComponentNode | undefined;
let readOnlyContext: boolean | undefined;
const markup = renderToStaticMarkup(<BackyEditor readOnly value={saved} renderInteractiveComponent={(value, context) => { captured = value; readOnlyContext = context.readOnly; return <div data-live-host="true">Host preview</div>; }} />);
assert(markup.includes('data-backy-rich-interactive-node="true"') && markup.includes('data-live-host="true"'));
assert.deepEqual(captured!.dataBindings, entry.dataBindings); assert.equal(readOnlyContext, true);
assert(!markup.includes('Component settings') && !markup.includes('untrusted.test'), 'Readonly rendering keeps configuration hidden and never executes saved URLs.');
const editable = renderToStaticMarkup(<InteractiveComponentBlock node={reopenedNode} onChange={() => {}} />);
for (const expected of ['Component settings', 'Component caption', 'Data bindings', 'type="number"', 'min="1"', 'max="12"', '<select', 'type="checkbox"', 'Apply series']) assert(editable.includes(expected), `Schema control missing ${expected}`);
assert(!editable.includes('<form'), 'Configuration controls do not nest or submit the article form.');
const choices = renderToStaticMarkup(<InteractiveComponentChooser entries={[entry, { ...entry, status: 'revoked', componentKey: 'hidden' }]} onSelect={() => {}} onCancel={() => {}} />);
assert(choices.includes('Round sequence') && !choices.includes('hidden'));
const disabledRuntime = renderToStaticMarkup(<InteractiveComponentChooser entries={[{ ...entry, runtimeAvailable: false }]} onSelect={() => {}} onCancel={() => {}} />);
assert(disabledRuntime.includes('Runtime disabled') && disabledRuntime.includes('saved fallback') && !disabledRuntime.includes('>Sandbox<'));
const unsupported = renderToStaticMarkup(<InteractiveComponentChooser entries={[{ ...entry, type: 'interactiveFigure', renderMode: 'trusted-component', componentKey: 'frontend.owned.mapping' }]} onSelect={() => {}} onCancel={() => {}} />);
assert(unsupported.includes('Static fallback') && !unsupported.includes('>Native<'), 'A frontend-owned trusted mapping is labeled as a fallback in this host.');
assert(!choices.includes('<form')); assert(choices.includes('type="search"'));
assert(renderToStaticMarkup(<InteractiveComponentChooser entries={[]} loading onSelect={() => {}} onCancel={() => {}} />).includes('Loading site components'));
assert(renderToStaticMarkup(<InteractiveComponentChooser entries={[]} error="Unavailable" onReload={() => {}} onSelect={() => {}} onCancel={() => {}} />).includes('Retry components'));
assert(renderToStaticMarkup(<InteractiveComponentChooser entries={[]} onSelect={() => {}} onCancel={() => {}} />).includes('No active components'));
for (const [tagName, isComposing, prevented] of [['INPUT', false, true], ['INPUT', true, false], ['TEXTAREA', false, false], ['BUTTON', false, false]] as const) {
 let prevent = false, stop = false; const target = { tagName, closest: () => ({ tagName }) } as unknown as EventTarget;
 handleBackyFigureControlKeyDown({ key: 'Enter', target, nativeEvent: { isComposing }, preventDefault: () => { prevent = true; }, stopPropagation: () => { stop = true; } }); assert.equal(prevent, prevented); assert(stop);
}

// Focus waits for React's mounted host, cancels superseded requests and validates Slate's caret.
const queue = new Map<number, () => void>(); let sequence = 0, focused = 0;
const scheduler = createToolbarFocusScheduler({ request: (callback) => { queue.set(++sequence, callback); return sequence; }, cancel: (id) => { queue.delete(id); } });
scheduler.schedule(editor as any, () => { focused++; }); assert.equal(focused, 0);
scheduler.schedule(editor as any, () => { focused++; }); assert.equal(queue.size, 1);
queue.get(sequence)!(); queue.clear(); assert.equal(focused, 1); assert.equal(JSON.stringify(editor.selection), caret);
scheduler.schedule(editor as any, () => { focused++; }); scheduler.cancel(); assert.equal(queue.size, 0);
scheduler.schedule(editor as any, () => { focused++; }); Transforms.deselect(editor as any); queue.get(sequence)!(); assert.equal(focused, 1, 'A vanished selection never triggers DOM focus.');
// The writer rail uses the same structural insertion and mounted-host focus scheduler.
const writer = createSlateEditor({ value: [{ type: 'p', children: [{ text: 'Retained body' }] }] });
Transforms.select(writer as any, Editor.end(writer as any, [0]));
insertRichCodeBlock(writer as any);
Transforms.insertText(writer as any, 'const retained = 0;');
insertRichArticleBlock(writer as any, { type: 'p', children: [{ text: '' }] });
let writerMounted = false, writerFocused = 0;
const writerFrames = new Map<number, () => void>();
const writerScheduler = createToolbarFocusScheduler({ request: callback => { writerFrames.set(1, callback); return 1; }, cancel: id => { writerFrames.delete(id); } });
writerScheduler.schedule(writer as any, () => { assert(writerMounted, 'Focus must wait for the inserted paragraph DOM commit.'); writerFocused++; });
assert.equal(writerFocused, 0);
assert.deepEqual(writer.selection?.anchor.path, [2, 0]);
writerMounted = true; writerFrames.get(1)!();
Transforms.insertText(writer as any, 'Immediate paragraph typing');
assert.equal(Node.string(writer.children[1]), 'const retained = 0;');
assert.equal(Node.string(writer.children[2]), 'Immediate paragraph typing');
assert.equal(writerFocused, 1);
writerScheduler.schedule(writer as any, () => { writerFocused++; });
writerScheduler.cancel(); assert.equal(writerFrames.size, 0, 'Mode changes/unmount cancel pending writer focus.');
console.log('Article interactive component smoke passed: production Slate insertion/reopen, metadata, controls, host callback, keyboard and deferred focus.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
