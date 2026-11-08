import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const starter = join(root, 'examples/custom-frontend-next');
const generated = join(starter, 'src/lib/portable-animation.js');
const check = spawnSync(process.execPath, [join(root, 'scripts/generate-portable-animation-controller.mjs'), '--check'], { cwd: root, encoding: 'utf8', timeout: 30000 });
assert.equal(check.status, 0, check.stdout + check.stderr);
// Reuse the hosted controller's behavioral fixtures against the generated module,
// including real GSAP, rather than mirroring its implementation in a new test.
const hosted = readFileSync(join(root, 'apps/public/scripts/animation-hydration-smoke.ts'), 'utf8');
const marker = "from '../src/lib/animationHydration'";
assert.equal(hosted.split(marker).length, 2);
const behavior = hosted.replace(marker, `from ${JSON.stringify(generated)}`);
const renderFile = join(starter, 'src/lib/render.tsx');
const renderer = `
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackyElementView } from ${JSON.stringify(renderFile)};
import { BackyAnimationHydrator } from ${JSON.stringify(join(starter, 'src/lib/animation.tsx'))};
const animation = { type: 'custom', duration: 0.25, delay: 0, trigger: 'hover', from: { x: 0, opacity: 0.7 }, to: { x: 123, opacity: 0.4 }, sequence: { version: 1, steps: [{ id: 'enter', label: 'Entrance', at: 0, duration: 0.5, from: { opacity: 0 }, to: { opacity: 1 } }, { id: 'settle', label: 'Settle', at: 0.5, duration: 0.5, to: { x: 20 } }] }, scrollTrigger: { start: 'top 90%', end: 'bottom 10%', scrub: false }, extension: 'quoted " <tag> & value' };
const element = { id: 'parent', type: 'container', animation, props: {}, children: [{ id: 'nested', parentId: 'parent', type: 'paragraph', props: { content: 'Nested authored animation' }, animation: { type: 'slideIn', trigger: 'scroll', from: { y: 0 }, to: { y: 24 } } }] };
const payload = { site: { id: 'site-fixture' }, route: { path: '/' }, content: { elements: [element], canvas: {} }, assets: { media: [] }, navigation: { primary: [] }, editableMap: [] };
const html = renderToStaticMarkup(React.createElement(BackyElementView, { element, payload }));
const attributes = [...html.matchAll(/data-animation="([^"]*)"/g)].map(match => JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")));
assert.equal(attributes.length, 2, 'Every authored wrapper, including nested children, preserves animation data');
assert.deepEqual(attributes[0], animation);
assert.equal(attributes[1].to.y, 24);
assert(html.includes('data-backy-animation-type="custom"') && html.includes('data-backy-element-id="nested"'));
assert(!html.includes('<tag>'), 'SSR must HTML-escape authored JSON attribute values');
const plain = renderToStaticMarkup(React.createElement(BackyElementView, { element: { id: 'plain', type: 'paragraph', props: { content: 'Visible resting content' } }, payload }));
assert(!plain.includes('data-animation='));
assert.equal(renderToStaticMarkup(React.createElement(BackyAnimationHydrator)), '', 'Client hydrator does not run browser APIs or emit server markup during SSR');
console.log('Portable animation SSR: exact custom/nested config, zero endpoints, escaped attributes, visible plain content and inert client SSR.');
`;
const scratch = mkdtempSync(join(root, '.portable-animation-smoke-'));
try {
 for (const [name, contents] of [['behavior', behavior], ['renderer', renderer]] as const) {
  const bundled = await build({ absWorkingDir: root, stdin: { contents, sourcefile: name + '.tsx', resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'node', target: 'node22', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom/server', 'gsap', 'gsap/ScrollTrigger'] });
  const entry = join(scratch, name + '.mjs'); writeFileSync(entry, bundled.outputFiles[0].text);
  const result = spawnSync(process.execPath, [entry], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`); process.stdout.write(result.stdout);
 }
} finally { rmSync(scratch, { recursive: true, force: true }); }
const layout = ts.createSourceFile('layout.tsx', readFileSync(join(starter, 'src/app/layout.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(layout.statements.some(statement => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === 'use client'), false, 'Root layout stays server-rendered');
let mounted = 0;
function visit(node: ts.Node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(layout) === 'BackyAnimationHydrator') mounted++; ts.forEachChild(node, visit); }
visit(layout); assert.equal(mounted, 1, 'One document owner is mounted in the server root layout');
const controller = ts.createSourceFile('portable-animation.js', readFileSync(generated, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(controller.statements.some(statement => ts.isImportDeclaration(statement)), false, 'Generated controller has no runtime imports');
const packageJson = JSON.parse(readFileSync(join(starter, 'package.json'), 'utf8'));
const publicPackage = JSON.parse(readFileSync(join(root, 'apps/public/package.json'), 'utf8'));
assert.equal(packageJson.dependencies.gsap, publicPackage.dependencies.gsap);
assert.equal(Object.keys(packageJson.dependencies).some(name => name.startsWith('@backy')), false);
console.log('Portable animation passed: source/declaration drift check, shared real-GSAP/controller behavior, SSR attrs/client boundary, one root owner, published GSAP dependency only. Browser route/scroll timing proof remains separate.');
