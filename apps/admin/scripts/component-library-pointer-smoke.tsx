import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const { ComponentLibrary, componentPreviewPosition } = createRequire(import.meta.url)('../src/components/editor/ComponentLibrary');

const rail = { left: 16, right: 304, top: 24 };
const desktop = componentPreviewPosition(rail, { width: 1200, height: 800 });
assert.equal(desktop?.left, 312); assert.equal(desktop?.top, 24); assert.equal(desktop?.position, 'fixed');
assert(Number(desktop?.left) >= rail.right, 'Hover preview stays beside every rail pointer target');
const flipped = componentPreviewPosition({ left: 850, right: 1138, top: 760 }, { width: 1200, height: 800 });
assert.equal(flipped?.left, 554); assert.equal(flipped?.top, 600);
assert.equal(componentPreviewPosition(rail, { width: 390, height: 700 }), null, 'Narrow screens keep inline tile previews and do not cover the Add controls');
const markup = renderToStaticMarkup(<ComponentLibrary onAddItem={() => {}} />);
assert(markup.includes('data-component-preview-reserved-space="none"'));
assert(markup.includes('data-component-add="heading"'));
assert(markup.includes('draggable="true"') && markup.includes('aria-label="Add Heading to canvas"'));
assert(!markup.includes('data-testid="editor-component-preview"'), 'Server rendering has no layout-consuming hover footer');
console.log('Component library pointer layout passed: stable list, beside-rail viewport positioning, narrow fallback, actual SSR buttons/drag targets. Browser pointer proof uses the separate actual-component fixture.');
