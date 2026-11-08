import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEditor, Editor, Node, Transforms } from 'slate';
import { shouldHandleBackyDocumentInput } from '../src/inputEvents';
import { applyInlineMarkdownShortcutOnInput } from '../src/inlineMarkdown';
import { getToolbarPopoverGeometry, getToolbarMenuFocusIndex } from '../src/ui/toolbarPopover';
import { captureToolbarSelection, restoreToolbarSelection, normalizeToolbarUrl, insertToolbarLink, insertToolbarImage, insertToolbarTable } from '../src/ui/toolbarEditing';
import { createRequire } from 'node:module';
import { insertRichCodeBlock, insertRichCollapsible, insertRichMediaEmbed } from '../src/ui/richBlockTransforms';

async function main() {
// Node does not load the existing math plugin's CSS; the application bundler does.
const require = createRequire(import.meta.url);
const originalCssLoader = require.extensions['.css'];
require.extensions['.css'] = () => {};
const { BackyEditor, decorateBackyCodeLine } = await import('../src/index');
if (originalCssLoader) require.extensions['.css'] = originalCssLoader;
else delete require.extensions['.css'];

const value = [
  { type: 'code_block', lang: 'javascript', children: [{ type: 'code_line', children: [{ text: 'con' }, { text: 'st answer = 42;' }] }, { type: 'code_line', children: [{ text: '<script>literal</script>' }] }] },
  { type: 'img', url: 'https://example.test/photo.jpg', alt: 'Article photo', caption: 'Photo source', children: [{ text: '' }] },
  { type: 'media_embed', url: 'https://youtu.be/abcdefghijk', caption: 'Video source', children: [{ text: '' }] },
  { type: 'collapsible', title: 'Supporting evidence', defaultOpen: false, children: [{ type: 'p', children: [{ text: 'Editable details', bold: true }] }] },
];
const source = JSON.stringify(value);
const markup = renderToStaticMarkup(<BackyEditor value={value} readOnly />);
for (const expected of ['data-backy-rich-code-block="true"', '<pre', '<code data-language="javascript"', 'data-backy-rich-code-line="true"', 'data-backy-code-token="keyword"', 'data-slate-leaf', 'photo.jpg', '<figcaption>Photo source</figcaption>', 'youtube-nocookie.com/embed/abcdefghijk', '<figcaption>Video source</figcaption>']) assert(markup.includes(expected), `Actual editor SSR is missing ${expected}`);
assert(!markup.includes('<script>'));
assert.equal(JSON.stringify(value), source, 'Rendering decorations must not mutate saved Slate content.');
const editable = renderToStaticMarkup(<BackyEditor value={value} />);
assert(editable.includes('data-testid="backy-rich-image-caption"'));
assert(editable.includes('data-testid="backy-rich-media-url"'));
assert(editable.includes('data-testid="backy-rich-code-language"'));
assert(editable.includes('data-testid="backy-rich-collapsible-title"'));
assert(markup.includes('<summary contenteditable="false">Supporting evidence</summary>'));
assert(markup.includes('Editable details'));
assert(!/<details[^>]*\sopen[\s=>]/.test(markup), 'Read-only collapsed sections honor defaultOpen=false.');
assert(/<details[^>]*\sopen[\s=>]/.test(editable), 'Editing keeps the collapsible body available to Slate selection.');
assert(!markup.includes('backy-rich-image-caption'), 'Read-only rendering must omit caption inputs.');

const editor = createEditor();
editor.children = value as any;
const ranges = decorateBackyCodeLine(editor, [value[0].children[0], [0, 0]]);
const keyword = ranges.filter((range) => range.backyCodeToken === 'keyword');
assert.deepEqual(keyword.map((range) => [range.anchor.path, range.anchor.offset, range.focus.offset]), [[[0, 0, 0], 0, 3], [[0, 0, 1], 0, 2]], 'A keyword crossing two leaves must decorate both existing leaves at valid offsets.');
for (const range of ranges) {
  const leaf = Node.get(editor, range.anchor.path) as { text: string };
  assert(range.anchor.offset >= 0 && range.focus.offset <= leaf.text.length);
  assert.deepEqual(range.anchor.path, range.focus.path);
}
assert.equal(JSON.stringify(editor.children), source);

const unsafe = renderToStaticMarkup(<BackyEditor readOnly value={[
  { type: 'img', url: 'javascript:run()', children: [{ text: '' }] },
  { type: 'media_embed', url: 'javascript:run()', children: [{ text: '' }] },
  { type: 'media_embed', url: 'https://youtube.com.evil.test/watch?v=abcdefghijk', children: [{ text: '' }] },
]} />);
assert(!unsafe.includes('javascript:'));
assert(!unsafe.includes('<iframe'), 'Look-alike video hosts must never become an iframe.');
assert(unsafe.includes('Missing or blocked image source'));

const insertion = createEditor();
insertion.children = [{ type: 'p', children: [{ text: '' }] }] as any;
insertRichCodeBlock(insertion);
assert(insertion.children.some((node: any) => node.type === 'code_block' && node.children[0].type === 'code_line'));
assert.equal(insertRichMediaEmbed(insertion, 'javascript:run()'), false);
assert.equal(insertRichMediaEmbed(insertion, 'https://vimeo.com/12345678'), true);
assert(insertion.children.some((node: any) => node.type === 'media_embed'));
insertRichCollapsible(insertion);
assert(insertion.children.some((node: any) => node.type === 'collapsible' && node.children[0].type === 'p'));
assert(insertion.selection && Node.get(insertion, insertion.selection.anchor.path), 'Inserted block leaves have a valid selected Slate path.');
const leftMobileMenu = getToolbarPopoverGeometry({ left: 24, right: 134.453125, top: 252, bottom: 296 }, { width: 320, height: 700 }, 240, 410, 448);
assert.equal(leftMobileMenu.left, 12, 'The proven 320px leftmost Insert anchor clamps to the viewport, instead of x=-105.55.');
const popovers = [leftMobileMenu,
  getToolbarPopoverGeometry({ left: 266, right: 310, top: 250, bottom: 294 }, { width: 320, height: 700 }, 240, 370, 448),
  getToolbarPopoverGeometry({ left: 274, right: 318, top: 250, bottom: 294 }, { width: 390, height: 700 }, 240, 370, 448),
  getToolbarPopoverGeometry({ left: 240, right: 300, top: 600, bottom: 644 }, { width: 320, height: 700 }, 224, 1000, 320, 'left'),
  getToolbarPopoverGeometry({ left: 24, right: 130, top: 270, bottom: 314 }, { width: 320, height: 350 }, 240, 410, 448),
];
popovers.forEach((popup, index) => {
  const viewportWidth = index === 2 ? 390 : 320;
  const viewportHeight = index === 4 ? 350 : 700;
  assert(popup.left >= 12 && popup.left + popup.width <= viewportWidth - 12, `Popover ${index} stays within its own viewport width.`);
  assert(popup.top >= 12 && popup.maxHeight > 0 && popup.top + popup.maxHeight <= viewportHeight - 12, `Popover ${index} stays within its own viewport height.`);
});
assert(popovers[3].top + popovers[3].maxHeight < 600, 'Long font menus near the bottom open above the trigger.');
assert(popovers[4].top + popovers[4].maxHeight <= 338, 'The popup remains visible when the keyboard reduces viewport height.');
const tinyViewport = getToolbarPopoverGeometry({ left: 20, right: 120, top: 60, bottom: 104 }, { width: 180, height: 220 }, 240, 500, 448);
assert.equal(tinyViewport.width, 156);
assert(tinyViewport.left + tinyViewport.width <= 168 && tinyViewport.top + tinyViewport.maxHeight <= 208);
assert.equal(getToolbarMenuFocusIndex('ArrowDown', -1, 8), 0);
assert.equal(getToolbarMenuFocusIndex('ArrowUp', -1, 8), 7);
assert.equal(getToolbarMenuFocusIndex('ArrowDown', 7, 8), 0);
assert.equal(getToolbarMenuFocusIndex('ArrowUp', 0, 8), 7);
assert.equal(getToolbarMenuFocusIndex('Home', 5, 8), 0);
assert.equal(getToolbarMenuFocusIndex('End', 0, 8), 7);
assert.equal(getToolbarMenuFocusIndex('Escape', 0, 8), null);
assert.equal(getToolbarMenuFocusIndex('ArrowDown', 0, 0), null);

// DOM target contract stubs isolate dispatch; the resulting Slate transformation is real.
const nativeInputTarget = { nodeType: 1, closest: (_selector: string) => ({ tagName: 'INPUT' }) } as unknown as EventTarget;
const slateTextTarget = { nodeType: 3, parentElement: { closest: (_selector: string) => null } } as unknown as EventTarget;
const metadataEditor = createEditor();
metadataEditor.children = [{ type: 'p', id: 'retain-input-block', custom: 'retain', children: [{ text: '**bold**', _id: 'retain-input-leaf' }] }] as any;
Transforms.select(metadataEditor, { path: [0, 0], offset: 8 });
const beforeMetadataInput = JSON.stringify(metadataEditor.children);
const dispatchInput = (target: EventTarget, isComposing = false) => {
  if (shouldHandleBackyDocumentInput({ target, nativeEvent: { isComposing } })) applyInlineMarkdownShortcutOnInput(metadataEditor, '*');
};
dispatchInput(nativeInputTarget);
assert.equal(JSON.stringify(metadataEditor.children), beforeMetadataInput, 'Metadata input must not transform the retained article Markdown selection.');
dispatchInput(slateTextTarget, true);
assert.equal(JSON.stringify(metadataEditor.children), beforeMetadataInput, 'Composing input must not prematurely transform article Markdown.');
dispatchInput(slateTextTarget);
assert.equal(Node.string(metadataEditor), 'bold', 'Normal Slate input still applies the real Markdown shortcut.');
assert((metadataEditor.children[0] as any).children.some((leaf: any) => leaf.bold === true));
assert.equal((metadataEditor.children[0] as any).id, 'retain-input-block');
assert.equal((metadataEditor.children[0] as any).custom, 'retain');

const toolbarMarkup = renderToStaticMarkup(<BackyEditor showToolbar value={[{ type: 'p', children: [{ text: 'Article' }] }]} />);
assert(toolbarMarkup.includes('role="toolbar"') && toolbarMarkup.includes('aria-label="Article formatting"'));
for (const label of ['History', 'Text', 'Format', 'Blocks', 'Text style', 'Font family', 'Font size in pixels', 'Insert menu']) assert(toolbarMarkup.includes(label));
assert(toolbarMarkup.includes('Site font') && !toolbarMarkup.includes('<form'));

const selectionEditor = createEditor();
const baseInline = selectionEditor.isInline;
selectionEditor.isInline = (node: any) => ['link', 'a'].includes(node.type) || baseInline(node);
selectionEditor.children = [{ type: 'p', id: 'retain-block', custom: { source: 'registered' }, children: [{ text: 'Selected words', _id: 'retain-leaf' }] }] as any;
Transforms.select(selectionEditor, { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 8 } });
const captured = captureToolbarSelection(selectionEditor)!;
assert.notEqual(captured.anchor.path, selectionEditor.selection!.anchor.path, 'Toolbar selection paths must be deep cloned.');
Transforms.deselect(selectionEditor);
const beforeRestore = JSON.stringify(selectionEditor.children);
assert(restoreToolbarSelection(selectionEditor, captured));
assert.equal(JSON.stringify(selectionEditor.children), beforeRestore, 'Restoring selection must not change article value/metadata.');
assert(!restoreToolbarSelection(selectionEditor, { anchor: { path: [0, 0], offset: 999 }, focus: { path: [0, 0], offset: 999 } }));
assert(!restoreToolbarSelection(selectionEditor, { anchor: { path: [99, 0], offset: 0 }, focus: { path: [99, 0], offset: 0 } }));
Editor.addMark(selectionEditor, 'fontFamily', 'Georgia');
Editor.addMark(selectionEditor, 'fontSize', '27px');
assert((Node.get(selectionEditor, [0]) as any).id === 'retain-block');
assert((Node.get(selectionEditor, [0]) as any).custom.source === 'registered');
assert(insertToolbarLink(selectionEditor, '/article'));
assert(Node.string(selectionEditor.children[0]) === 'Selected words');
assert(Array.from(Node.elements(selectionEditor)).some(([node]: any) => node.type === 'link' && node.url === '/article'));
assert.equal(normalizeToolbarUrl('javascript:alert(1)', 'link'), '');
assert.equal(normalizeToolbarUrl('//evil.test/image', 'image'), '');
assert.equal(normalizeToolbarUrl('example.com', 'link'), 'https://example.com');
assert.equal(insertToolbarImage(selectionEditor, 'data:image/svg+xml,evil'), false);
assert(insertToolbarImage(selectionEditor, 'https://example.test/image.jpg'));
insertToolbarTable(selectionEditor);
assert(selectionEditor.children.some((node: any) => node.type === 'table' && node.children.length === 2 && node.children[0].children.length === 2));
const libraryInsert = createEditor();
libraryInsert.children = [{ type: 'p', id: 'async-body', children: [{ text: 'Cursor survives media choice' }] }] as any;
Transforms.select(libraryInsert, { path: [0, 0], offset: 6 });
const asynchronousSelection = Editor.rangeRef(libraryInsert, captureToolbarSelection(libraryInsert)!, { affinity: 'forward' });
Transforms.insertNodes(libraryInsert, { type: 'p', children: [{ text: 'Inserted while chooser was open' }] } as any, { at: [0] });
assert.equal(asynchronousSelection.current!.anchor.path[0], 1, 'A media chooser selection tracks structural edits while awaiting choice.');
assert(restoreToolbarSelection(libraryInsert, asynchronousSelection.current));
assert(insertToolbarImage(libraryInsert, '/media/photo.jpg', { mediaId: 'asset-photo', alt: 'Selected photo', caption: 'Photo caption', injected: 'drop-me' } as any));
const chosenImage = libraryInsert.children[2] as any;
assert.equal(chosenImage.type, 'img');
assert.deepEqual([chosenImage.mediaId, chosenImage.alt, chosenImage.caption], ['asset-photo', 'Selected photo', 'Photo caption']);
assert(!('injected' in chosenImage), 'Media selections only copy supported metadata.');
asynchronousSelection.unref();
assert.equal(Editor.rangeRefs(libraryInsert).size, 0, 'Media chooser selection references are released after completion.');
assert(insertRichMediaEmbed(libraryInsert, 'https://vimeo.com/12345678', { mediaId: 'asset-video', caption: 'Video caption' }));
assert(libraryInsert.children.some((node: any) => node.type === 'media_embed' && node.mediaId === 'asset-video' && node.caption === 'Video caption'));
const unsafeLink = renderToStaticMarkup(<BackyEditor readOnly value={[{ type: 'p', children: [{ type: 'link', url: 'javascript:run()', children: [{ text: 'Unsafe link' }] }] }]} />);
assert(unsafeLink.includes('Unsafe link') && !unsafeLink.includes('javascript:'));
console.log('Rich editor blocks: actual SSR code decorations/Slate leaves, image captions, safe media, collapsible bodies, read-only controls and insertion passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
