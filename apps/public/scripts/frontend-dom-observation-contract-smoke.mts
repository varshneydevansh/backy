import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, any> = {}) {
 const filename = fileURLToPath(new URL(relative, import.meta.url)), module = { exports: {} as any };
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
 vm.runInNewContext(compiled, { module, exports: module.exports, require: (id: string) => id in mocks ? mocks[id] : require(id) }, { filename }); return module.exports;
}
const core = load('../../../packages/core/src/frontend-compatibility.ts', { './canvas-layout': load('../../../packages/core/src/canvas-layout.ts') });
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true), declarations = new Map<string, ts.Expression>();
function visit(node: ts.Node) { if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) declarations.set(p.name.text, p.initializer); ts.forEachChild(node, visit); }
visit(source);
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }), loaded = new Set<string>();
function register(name: string) { if (loaded.has(name)) return; loaded.add(name); const expression = declarations.get(name); assert(expression); const value = vm.runInNewContext('(' + expression.getText(source) + ')'); for (const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g)) register(ref[1]); ajv.addSchema(value, '#/components/schemas/' + name); }
register('FrontendObservation'); const check = ajv.getSchema('#/components/schemas/FrontendObservation')!;
const legacy = { siteId: 'site-fixture', route: '/fixture', frontendId: 'fixture.frontend', frontendVersion: '1.0', breakpoint: 'mobile', revision: 'revision1', complete: true, elements: [{ id: 'heading' }] };
const observation = { ...legacy, domCapture: { schemaVersion: 'backy.frontend-dom-evidence.v1', source: 'browser-dom', capturedAt: '2026-10-05T00:00:00Z', viewport: { width: 375, height: 812 }, expectedCount: 1, capturedCount: 1, limitations: [] as string[] }, elements: [{ id: 'heading', dom: { rect: { x: -12, y: 0, width: 327, height: 44 }, visibility: 'rendered', positioning: 'relative', transformed: false } }] };
let checks = 0;
for (const value of [legacy, observation]) { assert(check(value), ajv.errorsText(check.errors)); assert.equal(core.normalizeFrontendObservation(value).complete, true); checks++; }
const invalid = [
 (v: any) => { v.domCapture.viewport.width = 100001; }, (v: any) => { v.domCapture.expectedCount = 10001; },
 (v: any) => { v.domCapture.limitations = ['live-certified']; }, (v: any) => { v.domCapture.limitations = Array(33).fill('revision.missing'); },
 (v: any) => { v.domCapture.source = 'live-certification'; }, (v: any) => { v.elements[0].dom.rect.width = -1; },
 (v: any) => { v.elements[0].dom.rect.x = 10000001; }, (v: any) => { v.elements[0].dom.visibility = 'verified'; },
 (v: any) => { v.elements[0].dom.positioning = 'free'; }, (v: any) => { v.elements[0].dom.transformed = 'false'; },
];
for (const mutate of invalid) { const value = structuredClone(observation); mutate(value); assert.equal(Boolean(check(value)), false); assert.throws(() => core.normalizeFrontendObservation(value)); checks++; }
for (const limitations of [['revision.missing'], ['iframe.unobserved'], ['mapping.unknown']]) { const value = structuredClone(observation); value.domCapture.limitations = limitations; assert(check(value)); assert.equal(core.normalizeFrontendObservation(value).complete, false); checks++; }
const mismatch = structuredClone(observation); mismatch.domCapture.capturedCount = 0; assert(check(mismatch), 'Cross-field count equality is an actual runtime validation'); assert.throws(() => core.normalizeFrontendObservation(mismatch)); checks++;
const missingRevision: any = structuredClone(observation); delete missingRevision.revision; assert(check(missingRevision)); assert.equal(core.normalizeFrontendObservation(missingRevision).complete, false); checks++;
const invalidDate = structuredClone(observation); invalidDate.domCapture.capturedAt = 'invalid'; assert.throws(() => core.normalizeFrontendObservation(invalidDate)); checks++;
const report = core.buildFrontendCompatibilityReport({ siteId: legacy.siteId, route: legacy.route, revision: legacy.revision, content: { elements: [{ id: 'heading', type: 'text' }] }, observation: core.normalizeFrontendObservation(observation) });
assert(report.issues.some((issue: any) => issue.code === 'observations.dom.scope.unverified' && issue.status === 'unverified')); checks++;
assert.equal(Boolean(check({ schemaVersion: 'backy.frontend-dom-capture.v1', observation })), false, 'API accepts observation, not the downloadable browser capture envelope'); checks++;
console.log(`Frontend DOM standard contract/core checks passed: ${checks}; optional legacy compatibility, geometry/count/catalog bounds, runtime cross-field counts, conservative completeness and permanently unverified interaction scope.`);
