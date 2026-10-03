import assert from 'node:assert/strict';
import {
  DEFAULT_CANVAS_SIZE,
  extractFrontendTemplateDesignSerialization,
  getFrontendTemplateCanvasSize,
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from '../src/components/editor/editorCatalog';
import type { CanvasElement } from '../src/types/editor';

const element: CanvasElement = {
  id: 'registered-heading', type: 'heading', x: 40, y: 64, width: 900, height: 100,
  props: { content: 'Registered heading', fontFamily: 'Georgia', fontSize: 40 },
  responsive: { mobile: { x: 20, width: 320, props: { fontSize: 28 } } },
};
const size = { width: 1440, height: 1800 };
const envelopes = [
  { elements: [element], canvasSize: size },
  { elements: [element], metadata: { canvasSize: size } },
  { contentDocument: { elements: [element], metadata: { canvasSize: size } } },
  { contentDocument: { elements: [element], canvasSize: size } },
  { metadata: { source: 'frontend-builder' }, contentDocument: { elements: [element], metadata: { canvasSize: size } } },
];

for (const content of envelopes) {
  const template = { canvasSize: { width: 1200, height: 800 }, content };
  const original = JSON.stringify(template);
  const resolved = getFrontendTemplateCanvasSize(template);
  assert.equal(resolved.width, size.width, 'Stored template width must win over a stale summary alias');
  assert.equal(resolved.height, size.height, 'Stored long canvas must not collapse to editor defaults');
  const design = extractFrontendTemplateDesignSerialization(content);
  for (const kind of ['page', 'post'] as const) {
    const saved = serializeCanvasContent([element], resolved, undefined, { kind, ...design.options });
    const reopened = normalizeSavedCanvasContent(saved);
    assert.equal(reopened.canvasSize.width, size.width);
    assert.equal(reopened.canvasSize.height, size.height);
    assert.deepEqual(reopened.elements[0].responsive, element.responsive);
    assert.equal(reopened.elements[0].props.fontFamily, 'Georgia');
  }
  assert.equal(JSON.stringify(template), original, 'Size resolution and serialization must not mutate the reusable template');
}

assert.deepEqual(getFrontendTemplateCanvasSize({}), DEFAULT_CANVAS_SIZE, 'Templates without dimensions retain the existing editor default');
assert.equal(getFrontendTemplateCanvasSize({ canvasSize: size }).height, 1800, 'Legacy top-level dimensions remain supported');
assert.deepEqual(
  getFrontendTemplateCanvasSize({ content: { canvasSize: { height: 1800 } } }),
  { ...DEFAULT_CANVAS_SIZE, height: 1800 },
  'Partial content dimensions preserve the provided axis',
);
assert.equal(getFrontendTemplateCanvasSize({ content: { canvasSize: { height: '1800' } } }).height, 1800);
for (const invalid of [0, -1, Number.POSITIVE_INFINITY, 'NaN', null, true]) {
  assert.equal(getFrontendTemplateCanvasSize({ canvasSize: size, content: { canvasSize: { height: invalid } } }).height, 1800);
}
console.log('Frontend template canvas preservation passed: nested envelopes, page/post reopen, fonts, responsive geometry, aliases, partial dimensions and immutability');
