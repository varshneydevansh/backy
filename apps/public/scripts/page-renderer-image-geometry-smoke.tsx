import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyResponsiveOverrides, ElementRenderer, type CanvasElement } from '../src/components/PageRenderer';

const image: CanvasElement = { id: 'image-fit-proof', type: 'image', x: 16, y: 16, width: 372, height: 210,
  props: { src: '/local-proof.svg', alt: 'Local proof', objectFit: 'contain', objectPosition: '70% 20%' },
  responsive: { mobile: { width: 303, height: 132 } },
};
function imgStyle(element: CanvasElement, parentLayout: 'free' | 'flow' = 'free') {
  const html = renderToStaticMarkup(<ElementRenderer element={element} parentLayout={parentLayout}/>);
  return { html, style: html.match(/<img\b[^>]*style="([^"]*)"/)?.[1] || '' };
}
for (const element of [image, applyResponsiveOverrides([image], 'mobile')[0]]) {
  const rendered = imgStyle(element);
  assert(rendered.style.includes('width:100%;height:100%'), 'Fixed authored axes fill their frame despite global height:auto');
  assert(rendered.style.includes('object-fit:contain;object-position:70% 20%'), 'Fit and focal position survive sizing');
  assert(rendered.html.includes(`height:${element.height}px`), 'Responsive frame retains its resolved authored height');
}
const intrinsic = imgStyle({ ...image, styles: { width: '100%', height: 'auto' } }, 'flow');
assert(intrinsic.html.includes('height:auto'), 'Flow frame retains explicit intrinsic height');
assert(intrinsic.style.includes('width:100%;height:auto'), 'Auto-height image retains natural aspect ratio');
const contentSized = imgStyle({ ...image, styles: { width: 'max-content', height: 'fit-content' } }, 'flow');
assert(!contentSized.style.includes('width:100%'), 'Intrinsic width is not forced to fill a frame');
assert(contentSized.style.includes('height:auto'));
const authoredAuto = imgStyle({ ...image, styles: { height: 'auto' } });
assert(authoredAuto.style.includes('height:auto'), 'Explicit image styling remains authoritative');
console.log('Image geometry: fixed desktop/mobile frames, fit/focal preservation and intrinsic axes passed');
