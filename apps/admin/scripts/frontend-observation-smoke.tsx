import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(filename: string, mocks: Record<string, unknown>) {
  const module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module, exports: module.exports, Error, JSON, TextEncoder, require: (id: string) => { if (!(id in mocks)) throw new Error('Unexpected boundary: ' + id); return mocks[id]; } }, { filename });
  return module.exports;
}
const canvasLayout = load(new URL('../../../packages/core/src/canvas-layout.ts', import.meta.url).pathname, {});
const { normalizeFrontendObservation, buildFrontendCompatibilityReport } = load(new URL('../../../packages/core/src/frontend-compatibility.ts', import.meta.url).pathname, { './canvas-layout': canvasLayout });
const importer = load(new URL('../src/lib/frontendObservationImport.ts', import.meta.url).pathname, { '@backy-cms/core': { normalizeFrontendObservation } });
const { parseFrontendObservationFile } = importer;
const { FrontendCompatibilityPanel } = load(new URL('../src/components/sites/FrontendCompatibilityPanel.tsx', import.meta.url).pathname, {
  'react': React, 'react/jsx-runtime': await import('react/jsx-runtime'), '@/lib/frontendObservationImport': importer,
  '@/lib/adminContentApi': { adminFetch() { throw new Error('No network in local-file import proof'); } },
  '@/components/ui/Button': { Button: (props: any) => <button type="button" {...props} /> },
});
const portableSource = readFileSync(new URL('../../../examples/custom-frontend-next/src/lib/frontend-observation.js', import.meta.url), 'utf8');
assert(!/\b(fetch|eval|textContent|innerHTML|localStorage|sessionStorage|cookie|FormData)\s*(\(|=|\.)/.test(portableSource));
assert(!/\.value\b|\.href\b|\.src\b/.test(portableSource), 'Capture cannot read form values, URLs or asset locations');
const domCapture = { schemaVersion: 'backy.frontend-dom-evidence.v1', source: 'browser-dom', capturedAt: '2026-10-05T00:00:00Z', viewport: { width: 800, height: 600 }, expectedCount: 2, capturedCount: 2, limitations: [] };
const dom = { rect: { x: 200, y: 250, width: 200, height: 80 }, visibility: 'rendered', positioning: 'absolute', transformed: false };
const raw = { siteId: 'fixture-site', route: '/proof', frontendId: 'fixture-renderer', frontendVersion: '1', revision: 'r1', breakpoint: 'tablet', complete: true, domCapture, elements: [{ id: 'parent', type: 'container', parentId: null, fields: { width: 600 }, dom }, { id: 'child', type: 'text', parentId: null, fields: { x: 30 }, dom }] };
const normalized = normalizeFrontendObservation(raw)!;
assert.equal(normalized.complete, true);
assert.equal(normalized.domCapture?.source, 'browser-dom');
assert.equal(JSON.stringify(normalized.elements[0].dom?.rect), JSON.stringify(dom.rect));
const report = buildFrontendCompatibilityReport({ siteId: raw.siteId, route: raw.route, revision: 'r1', runtime: { schemaVersion: 'backy.frontend-runtime.v1', frontendId: raw.frontendId, version: '1', capabilities: { 'element.container': 'supported', 'element.text': 'supported', 'layout.free': 'supported' } }, observation: normalized, content: { elements: [{ id: 'parent', type: 'container', width: 600, children: [{ id: 'child', type: 'text', x: 30 }] }] } });
assert(report.issues.some(i => i.code === 'renderer.property.mismatch' && i.contentPath === '/elements/0/children/0/parentId'));
assert(!report.issues.some(i => i.contentPath.endsWith('/dom/rect')), 'Viewport rectangles never become raw authored geometry comparisons');
assert(report.issues.some(i => i.code === 'observations.dom.scope.unverified'));
assert.equal(report.certification, 'not-live-certified');
for (const limitations of [['visibility.hidden'], ['element-id.duplicate'], ['inventory.limit']]) assert.equal(normalizeFrontendObservation({ ...raw, domCapture: { ...domCapture, limitations } })!.complete, false);
assert.equal(normalizeFrontendObservation({ ...raw, revision: undefined })!.complete, false);
for (const change of [{ capturedCount: 1 }, { expectedCount: 10001 }, { limitations: ['cookie=private'] }, { viewport: { width: Infinity, height: 5 } }]) assert.throws(() => normalizeFrontendObservation({ ...raw, domCapture: { ...domCapture, ...change } }));
assert.throws(() => normalizeFrontendObservation({ ...raw, elements: [{ ...raw.elements[0], dom: { ...dom, rect: { ...dom.rect, x: NaN } } }, raw.elements[1]] }));
const parsed = parseFrontendObservationFile(JSON.stringify({ schemaVersion: 'backy.frontend-dom-capture.v1', observation: raw, arbitrarySecret: 'must-drop' }), 'fixture-site');
assert(!JSON.stringify(parsed).includes('must-drop'));
assert.throws(() => parseFrontendObservationFile(JSON.stringify(raw), 'foreign-site'), /different site/);
assert.throws(() => parseFrontendObservationFile(JSON.stringify({ schemaVersion: 'backy.frontend-dom-capture.v1', observation: null }), 'fixture-site'), /no frontend identity/);
assert.throws(() => parseFrontendObservationFile(' '.repeat(262145), 'fixture-site'), /256 KiB/);
assert.throws(() => parseFrontendObservationFile(JSON.stringify({ ...raw, elements: [raw.elements[0], raw.elements[0]] }), 'fixture-site'), /unique/);
const html = renderToStaticMarkup(<FrontendCompatibilityPanel siteId="fixture-site" design={{ templates: [] } as any} canConfigure={false} onUpdated={() => {}} />);
assert(html.includes('Import rendered observation JSON') && html.includes('type="file"') && html.includes('?backyInspect=1'));
if (process.env.BACKY_DOM_CAPTURE_PROOF_FILE) {
  const captured = parseFrontendObservationFile(readFileSync(process.env.BACKY_DOM_CAPTURE_PROOF_FILE, 'utf8'), 'fixture-site');
  assert.equal(captured.breakpoint, 'mobile');
  assert.equal(captured.complete, true);
  assert.equal(captured.elements.find((entry: any) => entry.id === 'child')?.fields?.x, 12);
  const content = { elements: [{ id: 'parent', type: 'container', x: 20, y: 20, width: 600, height: 300, children: [{ id: 'child', type: 'text', x: 30, y: 40, width: 220, height: 50, responsive: { mobile: { x: 12, width: 160 } } }] }] };
  const input = { siteId: 'fixture-site', route: '/proof', revision: 'fixture-r1', runtime: { schemaVersion: 'backy.frontend-runtime.v1', frontendId: 'backy-custom-frontend-next-starter', version: '0.1.0', capabilities: {} }, observation: captured, content };
  const matching = buildFrontendCompatibilityReport(input);
  assert(!matching.issues.some((entry: any) => entry.code === 'renderer.property.mismatch'));
  content.elements[0].children[0].responsive.mobile.width = 161;
  const mismatch = buildFrontendCompatibilityReport(input).issues.find((entry: any) => entry.code === 'renderer.property.mismatch' && entry.elementId === 'child' && entry.contentPath === '/elements/0/children/0/width');
  assert.equal(mismatch.expected, 161); assert.equal(mismatch.observed, 160); assert.equal(mismatch.breakpoint, 'mobile');
  console.log('Actual browser capture → production normalization/report PASS: mobile override equality and exact width mismatch.');
}
console.log('Rendered observation normalization/import/known DOM-parent mismatch and safe metadata checks PASS; actual browser capture uses frontend-observation-fixture.html.');
