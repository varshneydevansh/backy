import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBackyDataFigureSample } from '@backy-cms/core';
import { RichTextContent } from '../src/components/RichTextContent';
import { BackyPortableRichText } from '../../../examples/custom-frontend-next/src/lib/portable-rich-text.js';
import { BackyElementView } from '../../../examples/custom-frontend-next/src/lib/render';
import { loadRichInteractiveRegistryEntry, richInteractiveRuntimeElement } from '../src/components/RegisteredRichInteractiveComponent';

async function main() {
const value = [
  { type: 'h2', children: [{ text: 'A saved article' }] },
  { type: 'p', children: [{ text: 'Formatting', bold: true, italic: true }, { type: 'a', url: 'javascript:alert(1)', children: [{ text: 'Unsafe link becomes text' }] }] },
  { type: 'code_block', lang: 'javascript', children: [{ type: 'code_line', children: [{ text: 'const answer = 42;' }] }] },
  { type: 'table', children: [{ type: 'tr', children: [{ type: 'td', children: [{ text: 'Table cell' }] }] }] },
  { type: 'collapsible', title: 'Read details', defaultOpen: true, children: [{ type: 'p', children: [{ text: 'Preserved detail' }] }] },
  { type: 'image', src: 'https://example.test/image.png', alt: 'Uploaded image', children: [{ text: '' }] },
  { type: 'video', src: 'https://example.test/clip.mp4', children: [{ text: '' }] },
  { type: 'audio', src: 'https://example.test/clip.mp3', children: [{ text: '' }] },
  { type: 'data_figure', ...createBackyDataFigureSample('backy.chart.line'), children: [{ text: '' }] },
  { type: 'interactive_component', componentKey: 'fixture.widget', version: '1.0.0', elementType: 'codeComponent', fallback: { title: 'Registered fallback', text: 'Waiting for approved registry' }, children: [{ text: '' }] },
];
const before = JSON.stringify(value);
const hosted = renderToStaticMarkup(<RichTextContent value={value} siteId="site-fixture" />);
const portable = renderToStaticMarkup(<BackyPortableRichText value={value} siteId="site-fixture" apiBaseUrl="https://backy.example/api" />);
assert.equal(portable, hosted, 'Portable and hosted output share the complete safe rich-node renderer, including initial chart/widget state');
for (const marker of ['<h2>', '<strong>', '<em>', '<table', '<details open=', 'data-backy-code-token="keyword"', '<img', '<video', '<audio', '<svg', 'Registered fallback']) assert(portable.includes(marker), marker);
assert(!portable.includes('javascript:') && !portable.includes('<script'));
assert.equal(JSON.stringify(value), before, 'Rendering cannot rewrite saved authoring state');
const framed = renderToStaticMarkup(<BackyElementView element={{ id: 'article-body', type: 'paragraph', props: { content: value } }} payload={{ site: { id: 'site-fixture' }, content: {}, assets: { media: [] } } as any} publicApiBaseUrl="https://backy.example/api" />);
assert(framed.includes('data-backy-element-id="article-body"') && framed.includes('<svg') && framed.includes('<table'));
const node = value[value.length - 1];
const entry = { componentKey: node.componentKey, version: node.version, type: 'codeComponent', status: 'active', renderMode: 'sandbox-iframe', integrity: { signed: true, signatureRequiredForCustomCode: true } };
let requested = '';
await loadRichInteractiveRegistryEntry('site-fixture', node, new AbortController().signal, async (url, init) => {
  requested = String(url); assert.equal(init?.credentials, 'omit');
  return new Response(JSON.stringify({ success: true, data: { siteId: 'site-fixture', components: [entry], contract: { sandbox: { enabled: true } } } }));
}, 'https://backy.example/api');
assert.equal(requested, 'https://backy.example/api/sites/site-fixture/interactive-components/fixture.widget/1.0.0');
assert.equal(richInteractiveRuntimeElement('site-fixture', node, entry, 'https://backy.example/api').props.sandboxUrl, requested + '/sandbox');
const invalid = renderToStaticMarkup(<BackyPortableRichText value={value} siteId="site-fixture" apiBaseUrl="https://user:password@backy.example/api" />);
assert(invalid.includes('Data figure renderer is unavailable') && !invalid.includes('password'));
console.log('Portable rich renderer: shared semantic/figure output, starter integration, safe URLs, exact-version remote registry and immutable input passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
