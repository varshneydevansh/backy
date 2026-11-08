import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { File } from 'node:buffer';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { NextRequest, NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
let checks = 0, networkCalls = 0;
function load(relative: string, mocks: Record<string, any> = {}, fixtureProcess: any = process) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 const module = { exports: {} as any };
 vm.runInNewContext(compiled, { module, exports: module.exports, URL, URLSearchParams, Request, Response, Headers, Error, Buffer, File, FormData, process: fixtureProcess, console: { error(...args: any[]) { if (process.env.BACKY_CONTRACT_TEST_DEBUG === "1") console.error(...args); } }, fetch: () => { networkCalls++; throw Error('Unexpected network call'); }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing mock ' + id); })() : require(id) }, { filename });
 return module.exports;
}
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas = new Map<string, ts.Expression>(), operations = new Map<string, any>();
function visit(node: ts.Node) {
 if (ts.isPropertyAssignment(node)) {
  if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) schemas.set(p.name.text, p.initializer);
  if (ts.isComputedPropertyName(node.name) && ts.isObjectLiteralExpression(node.initializer)) {
   const path = node.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
   if (['/api/admin/sites/{siteId}/media', '/api/admin/sites/{siteId}/media/{mediaId}', '/api/admin/sites/{siteId}/media/{mediaId}/transforms'].includes(path)) operations.set(path, vm.runInNewContext('(' + node.initializer.getText(source) + ')'));
  }
 }
 ts.forEachChild(node, visit);
}
visit(source);
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }), loaded = new Set<string>();
function register(name: string) {
 if (loaded.has(name)) return; loaded.add(name); const expression = schemas.get(name); assert(expression, name);
 const value = vm.runInNewContext('(' + expression.getText(source) + ')');
 for (const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g)) register(ref[1]);
 ajv.addSchema(value, '#/components/schemas/' + name);
}
function validate(ref: string, payload: any, valid = true) {
 register(ref.split('/').at(-1)!); const test = ajv.getSchema(ref)!; assert.equal(Boolean(test(payload)), valid, ajv.errorsText(test.errors)); checks++;
}
const guard = load('../src/lib/mediaStorageMutation.ts');
for (const [code, media] of [
 ['MEDIA_STORAGE_MUTATION_BUSY', { withStorageMutationLock: async () => { throw Object.assign(Error('private provider detail'), { code: 'MEDIA_STORAGE_MUTATION_BUSY' }); } }],
 ['MEDIA_STORAGE_LOCK_UNAVAILABLE', {}],
] as const) {
 let writes = 0;
 const response = await guard.withMediaStorageMutation(media, 'fixture-site', 'fixture-request', async () => { writes++; });
 assert.equal(response.status, 503); assert.equal(writes, 0); const body = await response.json(); assert.equal(body.error.code, code); assert.equal(JSON.stringify(body).includes('private provider detail'), false);
 let methods = 0;
 for (const operation of operations.values()) {
  const write = operation.post; assert(write && ['uploadMedia', 'replaceMedia', 'prepareMediaTransforms'].includes(write.operationId));
  const declared = write.responses['503']; validate(declared.content['application/json'].schema.$ref, body);
  assert.equal(declared.headers['Cache-Control'].schema.const, response.headers.get('cache-control'));
  if (code === 'MEDIA_STORAGE_MUTATION_BUSY') assert.equal(declared.headers['Retry-After'].schema.const, response.headers.get('retry-after'));
  else assert.equal(response.headers.get('retry-after'), null);
  assert(declared.description.includes(code)); methods++;
 }
 assert.equal(methods, 3);
}
// Actual transform handler: committed metadata and post-commit cleanup/effect outcomes are schema checked.
const inventoryImport = await import('../src/lib/mediaInventory.ts'), inventory: any = inventoryImport.default || inventoryImport;
const scope = load('../src/lib/mediaScope.ts'), responsive = load('../src/lib/mediaResponsive.ts');
const policy = load('../src/lib/mediaUploadPolicy.ts', {}, { ...process, env: {} });
const site: any = { id: 'transform-contract', slug: 'transform-contract', settings: {}, isPublished: true };
const before: any = { id: 'image-contract', siteId: site.id, filename: 'image.png', url: 'https://fixture.invalid/image.png', type: 'image', mimeType: 'image/png', sizeBytes: 100, visibility: 'public', metadata: { generatedTransforms: { generatedBytes: 100, variants: [{ path: 'old-variant' }] } } };
let cleanupStatus = 'complete', failure = false, writes = 0, failSave = false;
const repositories: any = { sites: { getById: async () => site }, settings: { get: async () => ({}) }, media: { withStorageMutationLock: async (_site: any, run: any) => run(), getById: async () => before, list: async (p: any) => ({ items: [before], pagination: { total: 1, limit: p.limit, offset: p.offset, hasMore: false } }), update: async (_sid: string, _id: string, input: any) => { if (failSave) throw Error('private save detail'); writes++; return { item: { ...before, metadata: input.metadata } }; } } };
const mocks: any = { '@/lib/mediaStorageMutation': guard, '@/lib/backyStore': {}, '@/lib/mediaInventory': inventory, '@/lib/mediaUploadPolicy': policy, '@/lib/mediaResponsive': responsive, '@/lib/mediaTransformGeneration': { MediaTransformGenerationError: class extends Error {}, generatedTransformBytes: (m: any) => m.generatedTransforms?.generatedBytes || 0, generateImageTransformManifest: async () => ({ generatedBytes: 120, storageProvider: 'fixture', format: 'webp', variants: [{ path: 'new-variant' }] }), deleteGeneratedTransformFiles: async (_m: any, _provider: any, input: any) => { assert.equal(input.siteId, site.id); assert.equal(input.mediaId, before.id); return { status: cleanupStatus, deletedPaths: cleanupStatus === 'complete' ? ['old-variant'] : [], failedPaths: cleanupStatus !== 'complete' ? ['old-variant'] : [], blockedPaths: cleanupStatus === 'blocked' ? ['old-variant'] : [] }; } }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'synthetic-owner' } } }) }, '@/lib/adminAudit': { recordAdminAudit: async () => { if (failure) throw Error('private audit detail'); return {}; } }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { if (failure) throw Error('private cache detail'); return {}; } }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { if (failure) throw Error('private webhook detail'); return []; } } };
const transforms = load('../src/app/api/admin/sites/[siteId]/media/[mediaId]/transforms/route.ts', mocks);
async function transform() { return transforms.POST(new NextRequest('http://fixture.invalid/api/admin/sites/' + site.id + '/media/' + before.id + '/transforms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ widths: [320] }) }), { params: Promise.resolve({ siteId: site.id, mediaId: before.id }) }); }
for (const status of ['complete', 'pending', 'blocked']) {
 cleanupStatus = status; failure = status !== 'complete'; const prior = writes, response = await transform(); assert.equal(response.status, 200); assert.equal(writes, prior + 1); const body = await response.json();
 const operation = operations.get('/api/admin/sites/{siteId}/media/{mediaId}/transforms').post; validate(operation.responses['200'].content['application/json'].schema.$ref, body);
 assert.equal(body.data.storageCleanup.status, status); assert.equal(body.data.storageCleanup.deletedFiles, status === 'complete' ? 1 : 0); assert.equal(body.data.storageCleanup.remainingFiles, status === 'complete' ? 0 : 1); assert.equal(JSON.stringify(body).includes('private audit detail'), false);
 if (failure) { assert.deepEqual(body.data.completionWarnings, ['MEDIA_STORAGE_CLEANUP_' + status.toUpperCase(), 'MEDIA_AUDIT_PENDING', 'MEDIA_CACHE_INVALIDATION_PENDING', 'MEDIA_WEBHOOK_DELIVERY_PENDING']); assert.equal(body.data.cacheInvalidation, undefined); }
 else assert.deepEqual(body.data.completionWarnings, []);
 const legacy = structuredClone(body); delete legacy.data.storageCleanup; delete legacy.data.completionWarnings; validate(operation.responses['200'].content['application/json'].schema.$ref, legacy);
}
failSave = true; const prior = writes, failed = await transform(); assert.equal(failed.status, 500); assert.equal(writes, prior); validate('#/components/schemas/ErrorEnvelope', await failed.json());
validate('#/components/schemas/AdminMediaStorageCleanup', { status: 'unknown', deletedFiles: 0, remainingFiles: 0 }, false);
validate('#/components/schemas/AdminMediaStorageCleanup', { status: 'pending', deletedFiles: -1, remainingFiles: 1 }, false);
assert.equal(networkCalls, 0);
console.log(`Media storage standard503/helper and transform outcome checks passed: ${checks}; three writes, actual shared admission helper, busy Retry-After1/no-store, unsupported-lock refusal, admission no-write, actual transform complete/pending/blocked sanitized200, omitted failed cache, legacy optional fields and failed metadata save. PostgreSQL/actual media handler proof separate.`);
