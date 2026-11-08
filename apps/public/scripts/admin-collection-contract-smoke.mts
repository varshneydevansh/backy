import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { NextRequest, NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
let checks = 0, networkCalls = 0;
function load(relative: string, mocks: Record<string, any> = {}) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 const module = { exports: {} as any };
 vm.runInNewContext(compiled, { module, exports: module.exports, URL, URLSearchParams, Request, Response, Headers, Error, Buffer, process, console: { error(...args: any[]) { if (process.env.BACKY_CONTRACT_TEST_DEBUG === "1") console.error(...args); } }, fetch: () => { networkCalls++; throw Error('Unexpected network call'); }, require: (id: string) => {
  if (id in mocks) return mocks[id];
  const alias = id.startsWith('./') && filename.includes('/src/lib/') ? '@/lib/' + id.slice(2) : id;
  if (alias in mocks) return mocks[alias];
  if (alias.startsWith('@/lib/')) return load('../src/lib/' + alias.slice('@/lib/'.length) + '.ts', mocks);
  if (id.startsWith('@/')) throw Error('Missing mock ' + id);
  return require(id);
 } }, { filename });
 return module.exports;
}
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas = new Map<string, ts.Expression>(), operations = new Map<string, any>();
function visit(node: ts.Node) {
 if (ts.isPropertyAssignment(node)) {
  if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) schemas.set(p.name.text, p.initializer);
  if (ts.isComputedPropertyName(node.name) && ts.isObjectLiteralExpression(node.initializer)) {
   const path = node.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
   if (path.startsWith('/api/admin/sites/{siteId}/collections') || path.endsWith('/editor/collection-binding-presets')) operations.set(path.replace('/api/admin/sites/{siteId}/collections', '').replace('/api/admin/sites/{siteId}/editor/collection-binding-presets', 'presets'), vm.runInNewContext('(' + node.initializer.getText(source) + ')'));
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
const expectedOperations = [
 'get ', 'post ', 'get /{collectionId}', 'patch /{collectionId}', 'delete /{collectionId}',
 'get /export', 'post /import', 'get /{collectionId}/records', 'post /{collectionId}/records',
 'get /{collectionId}/records/{recordId}', 'patch /{collectionId}/records/{recordId}', 'delete /{collectionId}/records/{recordId}',
 'post /{collectionId}/records/bulk', 'post /{collectionId}/records/import', 'get presets', 'patch presets',
 'get /{collectionId}/design-versions', 'post /{collectionId}/design-versions/{revisionId}/restore',
];
assert.deepEqual([...operations].flatMap(([path, operation]) => Object.keys(operation).map(method => method + ' ' + path)).sort(), expectedOperations.sort(), 'Exact current collection operations, including definition history and guarded restore');
const originalCwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-collection-contract-'));
process.chdir(directory);
try {
 const storeModule = await import('../src/lib/backyStore.ts'), store: any = storeModule.default || storeModule;
 const designModule = await import('../src/lib/frontendDesignContract.ts'), design: any = designModule.default || designModule;
 const helper = (name: string, mocks: any = {}) => load('../src/lib/' + name + '.ts', mocks);
 const pagination = helper('collectionExportPagination'), inventory = helper('collectionInventory', { './collectionExportPagination': pagination }), routes = helper('collectionRoutes'), conflicts = helper('routeConflicts', { './collectionRoutes': routes });
 const values = { title: 'Editable', frontendDesignElements: [{ id: 'outer', type: 'container', layoutMode: 'flex', width: '100%', responsive: { mobile: { layoutDirection: 'column' } }, children: [{ id: 'figure', type: 'codeComponent', registeredComponent: { componentKey: 'fixture.figure', version: '2.1.0' }, props: { count: 4 }, controls: [{ key: 'count', type: 'number' }], animation: { type: 'custom', from: { x: 0 }, to: { x: 55 } }, extension: { retain: [0, false] } }] }], frontendDesignDocument: { customJS: '/* inert saved code */', assets: { fonts: [{ id: 'fixture-font' }] }, canvasSize: { width: 1200, height: 800 }, extension: { keep: true } }, frontendDesignTokens: { colors: { paper: '#fafafa' } }, dataBindings: [{ collectionId: 'declared', fieldKey: 'title' }], extension: { nested: [null, false, 0, { keep: true }] } };
 function fixture(demo: boolean) {
  const site = store.createAdminSite({ id: 'contract-' + demo, slug: 'contract-slug-' + demo, name: 'Collections' });
  const foreign = store.createAdminSite({ id: 'foreign-' + demo, slug: 'foreign-' + demo, name: 'Foreign' });
  let reads = 0, writes = 0, denied = 0, incomplete = false, importConflict = false, resolvedSiteId = site.id;
  const permissions: string[] = [], audits: any[] = [];
  const canonical = (sid: string) => { assert.equal(sid, resolvedSiteId); reads++; };
  const lookup = (sid: string) => { reads++; const found = sid === site.id || sid === site.slug ? store.getSiteByIdOrSlug(site.id) : sid === foreign.id ? foreign : null; if (found) resolvedSiteId = found.id; return found; };
  const wrapped = { ...store, getSiteByIdOrSlug: lookup };
  for (const name of ['listCollections','getCollectionByIdOrSlug','getCollectionRecordByIdOrSlug','listCollectionRecords','getPageSummary']) wrapped[name] = (sid: string, ...args: any[]) => { canonical(sid); return store[name](sid, ...args); };
  for (const name of ['createAdminCollection','updateAdminCollection','deleteAdminCollection','createAdminCollectionRecord','updateAdminCollectionRecord','deleteAdminCollectionRecord','applyAdminCollectionImport']) wrapped[name] = (sid: string, ...args: any[]) => { canonical(sid); writes++; return store[name](sid, ...args); };
  wrapped.updateAdminSite = (sid: string, body: any) => { canonical(sid); writes++; return store.updateAdminSite(sid, body); };
  const recordPage = (input: any) => { canonical(input.siteId); if (incomplete) return { items: [], pagination: { total: 205, limit: 100, offset: input.offset || 0, hasMore: true } }; const r = store.listCollectionRecords(input.siteId, input.collectionId, { ...input, status: input.status === "all" ? undefined : input.status }); return { items: r.records, pagination: r.pagination }; };
  const repositories: any = {
   sites: { getById: async (sid: string) => lookup(sid), getBySlug: async (sid: string) => lookup(sid), update: async (sid: string, input: any) => ({ item: wrapped.updateAdminSite(sid, input) }) },
   settings: { get: async () => store.getAdminSettings() },
   media: { getById: async () => null },
   pages: { list: async (input: any) => { canonical(input.siteId); return incomplete ? { items: [], pagination: { total: 205, limit: 100, offset: input.offset || 0, hasMore: true } } : { items: [], pagination: { total: 0, limit: input.limit || 100, offset: input.offset || 0, hasMore: false } }; } },
   collections: {
    list: async (input: any) => { canonical(input.siteId); const all = store.listCollections(input.siteId, { includeUnpublished: true }), limit = Math.min(input.limit || 100, 100), offset = input.offset || 0; return { items: all.slice(offset, offset + limit), pagination: { total: all.length, limit, offset, hasMore: offset + limit < all.length } }; },
    getById: async (sid: string, cid: string) => wrapped.getCollectionByIdOrSlug(sid, cid, { includeUnpublished: true }) || null,
    getBySlug: async (sid: string, cid: string) => wrapped.getCollectionByIdOrSlug(sid, cid, { includeUnpublished: true }) || null,
    create: async (input: any) => ({ item: wrapped.createAdminCollection(input.siteId, input) }),
    update: async (sid: string, cid: string, input: any) => ({ item: wrapped.updateAdminCollection(sid, cid, input) }),
    delete: async (sid: string, cid: string) => wrapped.deleteAdminCollection(sid, cid),
    listRecords: async (input: any) => recordPage(input),
    getRecordById: async (sid: string, cid: string, rid: string) => wrapped.getCollectionRecordByIdOrSlug(sid, cid, rid, { includeUnpublished: true }) || null,
    getRecordBySlug: async (sid: string, cid: string, rid: string) => wrapped.getCollectionRecordByIdOrSlug(sid, cid, rid, { includeUnpublished: true }) || null,
    createRecord: async (input: any) => ({ item: wrapped.createAdminCollectionRecord(input.siteId, input.collectionId, input) }),
    updateRecord: async (sid: string, cid: string, rid: string, input: any) => ({ item: wrapped.updateAdminCollectionRecord(sid, cid, rid, input) }),
    deleteRecord: async (sid: string, cid: string, rid: string) => wrapped.deleteAdminCollectionRecord(sid, cid, rid),
    applyImport: async (sid: string, operations: any[]) => { if (importConflict) { const core = require('@backy-cms/core'); throw new core.BackyCollectionImportConflictError(); } return wrapped.applyAdminCollectionImport(sid, operations); },
   },
  };
  repositories.collections.withRecordWriteLock = async (sid: string, cid: string, operation: any) => operation(repositories.collections, await repositories.collections.getById(sid, cid), { media: repositories.media, settings: repositories.settings, sites: repositories.sites });
  const validation = helper('collectionRecordValidation', { '@/lib/backyStore': wrapped, '@/lib/collectionInventory': inventory });
  const mocks: any = { 'next/server': { NextResponse }, '@/lib/backyStore': wrapped, '@/lib/frontendDesignContract': design, '@/lib/adminCollectionFields': helper('adminCollectionFields'), '@/lib/collectionRoutes': routes, '@/lib/routeConflicts': conflicts, '@/lib/collectionExportPagination': pagination, '@/lib/collectionInventory': inventory, '@/lib/collectionRecordValidation': validation, '@/lib/collectionRecordVersion': helper('collectionRecordVersion'), '@/lib/collectionRecordAdmission': helper('collectionRecordAdmission'), '@/lib/collectionImportPreparation': helper('collectionImportPreparation', { '@/lib/backyStore': wrapped, '@/lib/collectionRecordValidation': validation, '@/lib/collectionInventory': inventory, '@/lib/routeConflicts': conflicts }), '@/lib/orderInventoryRestore': helper('orderInventoryRestore', { '@/lib/backyStore': wrapped, '@/lib/commerceCatalog': { PRODUCT_COLLECTION_SLUG: 'products' } }), '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionAccess: async () => null, requireCommerceCollectionSlugAccess: async () => null }, '@/lib/adminAccess': { requireAdminAccess: async (_r: any, id: string, input: any) => { permissions.push(input.permission || input.permissions?.at(-1)); return denied ? NextResponse.json({ success: false, requestId: id, error: { code: 'DENIED', message: 'Denied' } }, { status: denied }) : { session: { user: { id: 'fixture-owner' } } }; } }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAudit': { recordAdminAudit: async (input: any) => { audits.push(input); } }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({ status: 'recorded' }) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({ status: 'skipped' }) }, '@/lib/repositoryMediaReferenceSync': { syncRepositoryCollectionRecordMediaReferences: async () => undefined, removeRepositoryCollectionRecordMediaReferences: async () => undefined } };
  const handlers = new Map([...operations.keys()].map(path => [path, load(path === 'presets' ? '../src/app/api/admin/sites/[siteId]/editor/collection-binding-presets/route.ts' : '../src/app/api/admin/sites/[siteId]/collections' + path.replace('{collectionId}', '[collectionId]').replace('{recordId}', '[recordId]').replace('{revisionId}', '[revisionId]') + '/route.ts', mocks)]));
  async function call(path: string, method: string, status: number, body?: any, cid = 'missing', rid = 'missing', query = '', sid = site.slug) {
   const operation = operations.get(path)[method.toLowerCase()]; assert(operation);
   const expected = path === 'presets' ? method === 'GET' ? 'pages.view' : 'pages.edit' : path === '/export' || query.includes('format=csv') ? 'collections.export' : method === 'DELETE' || body?.action === 'delete' ? 'collections.delete' : method === 'GET' ? 'collections.view' : 'collections.edit';
   if (expected === operation['x-backy-permission']) checks++; else assert.equal(operation['x-backy-permission-by-query']?.['format=csv'] || operation['x-backy-permission-by-action']?.delete, expected);
   assert.deepEqual(JSON.parse(JSON.stringify(operation.security)), [{ BackyAdminSession: [] }, { BackyAdminKey: [] }]);
   if (body !== undefined && status < 400 && typeof body !== 'string') validate(operation.requestBody.content['application/json'].schema.$ref, body);
   const before = permissions.length;
   const response = await handlers.get(path)[method](new NextRequest('http://fixture.invalid/api/admin/sites/' + sid + '/collections' + path.replace('{collectionId}', cid).replace('{recordId}', rid) + query, { method, ...(body === undefined ? {} : { headers: { 'content-type': typeof body === 'string' ? 'text/csv' : 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) }), { params: Promise.resolve({ siteId: sid, collectionId: cid, recordId: rid }) });
   assert.equal(response.status, status, demo + ' ' + path + ' ' + method + ' ' + await response.clone().text()); assert.equal(permissions[before], expected);
   const csv = response.headers.get('content-type')?.startsWith('text/csv'), result = csv ? await response.text() : await response.json();
   if (csv) { assert(operation.responses[String(status)].content['text/csv']); checks++; } else validate(operation.responses[String(status)].content['application/json'].schema.$ref, result);
   return { result, response };
  }
  return { call, site, foreign, audits, denied: (n: number) => { denied = n; }, incomplete: (value: boolean) => { incomplete = value; }, conflict: (value: boolean) => { importConflict = value; }, get reads() { return reads; }, get writes() { return writes; } };
 }
 for (const demo of [true, false]) {
  const f = fixture(demo);
  for (const denial of [401, 403]) { f.denied(denial); const reads = f.reads, writes = f.writes; for (const [path, op] of operations) for (const method of Object.keys(op)) await f.call(path, method.toUpperCase(), denial, method === 'get' || method === 'delete' ? undefined : {}); assert.equal(f.reads, reads); assert.equal(f.writes, writes); }
  f.denied(0); await f.call('', 'GET', 404, undefined, undefined, undefined, '', 'missing-site');
  await f.call('', 'POST', 400, {}); await f.call('', 'POST', 400, { name: 'Bad field', fields: [{ key: 'broken', type: 'unsupported' }] });
  const input = { name: 'Editable Entries', slug: 'editable-entries', fields: [{ key: 'title', type: 'text', required: true }, { key: 'json', type: 'json' }], routePattern: '/entries/:recordSlug', listRoutePattern: '/entries', metadata: { unknown: { nested: [false, 0] } } };
  const schema = (await f.call('', 'POST', 201, input)).result.data.collection, cid = schema.id;
  assert.equal(schema.siteId, f.site.id); assert.equal(schema.routePattern, input.routePattern);
  await f.call('', 'POST', 409, input); await f.call('/{collectionId}', 'GET', 200, undefined, schema.slug); await f.call('/{collectionId}', 'GET', 404, undefined, 'foreign-id');
  await f.call('/{collectionId}', 'PATCH', 400, { status: 'scheduled' }, cid);
  const patch = (await f.call('/{collectionId}', 'PATCH', 200, { name: 'Retitled schema' }, cid)).result.data.collection; assert.deepEqual(patch.metadata, input.metadata); assert.equal(patch.routePattern, input.routePattern);
  await f.call('', 'GET', 200, undefined, undefined, undefined, '?limit=1&offset=0');
  const recPath = '/{collectionId}/records', detail = recPath + '/{recordId}';
  const record = (await f.call(recPath, 'POST', 201, { slug: 'editable', values }, cid)).result.data.record, rid = record.id;
  assert.equal(record.siteId, f.site.id); assert.equal(record.collectionId, cid); assert.deepEqual(record.values.extension, values.extension);
  await f.call(recPath, 'POST', 409, { slug: 'editable', values }, cid);
  await f.call(detail, 'GET', 200, undefined, cid, record.slug); await f.call(detail, 'GET', 404, undefined, cid, rid, '', f.foreign.id); await f.call(detail, 'GET', 404, undefined, cid, 'foreign-record');
  const changed = (await f.call(detail, 'PATCH', 200, { values: { title: 'Retitled record' } }, cid, rid)).result.data.record; assert.deepEqual(changed.values.frontendDesignElements, values.frontendDesignElements); assert.deepEqual(changed.values.frontendDesignDocument, values.frontendDesignDocument); assert.deepEqual(changed.values.extension, values.extension); assert.match(record.version, /^record-v1:[a-f0-9]{64}$/); assert.notEqual(record.version, changed.version); const beforeVersionConflict = f.writes; const staleVersion = (await f.call(detail, 'PATCH', 409, { expectedVersion: record.version, values: { title: 'Old opened version' } }, cid, rid)).result; assert.equal(staleVersion.error.code, 'COLLECTION_RECORD_CONFLICT'); await f.call(detail, 'PATCH', 400, { expectedVersion: 'invalid-token' }, cid, rid); assert.equal(f.writes, beforeVersionConflict);
  const savedWrites = f.writes; const stale = (await f.call(detail, 'PATCH', 409, { expectedUpdatedAt: '2000-01-01T00:00:00Z', values: { title: 'Stale overwrite' } }, cid, rid)).result; assert.equal(stale.error.code, 'COLLECTION_RECORD_CONFLICT'); assert.equal(stale.error.details.reloadRequired, true); await f.call(detail, 'PATCH', 400, { expectedUpdatedAt: 'invalid-date' }, cid, rid); assert.equal(f.writes, savedWrites); await f.call(detail, 'PATCH', 200, { expectedUpdatedAt: changed.updatedAt, expectedVersion: changed.version, values: { title: 'Retitled record' } }, cid, rid);
  const page = (await f.call(recPath, 'GET', 200, undefined, cid, rid, '?limit=1&offset=0')).result.data; assert.equal(page.pagination.limit, 1); assert.equal(page.records.length, 1);
  const csv = (await f.call(recPath, 'GET', 200, undefined, cid, rid, '?format=csv&limit=1&offset=99')).result; assert(csv.includes('Retitled record')); assert.equal(csv.split('\n').length, 2);
  const partial = (await f.call(recPath + '/import', 'POST', 200, 'slug,title\ncsv-good,Good\ncsv-missing,', cid)).result.data; assert.equal(partial.import.created, 1); assert.equal(partial.import.skipped, 1); assert.equal(partial.import.errors[0].row, 3);
  await f.call(recPath + '/bulk', 'POST', 200, { action: 'updateStatus', recordIds: [rid, 'missing'], status: 'published' }, cid);
  await f.call(recPath + '/bulk', 'POST', 400, { action: 'unsupported', recordIds: [rid] }, cid);
  const exported = await f.call('/export', 'GET', 200, undefined, undefined, undefined, '?collectionIds=' + cid); assert.match(exported.response.headers.get('content-disposition')!, /attachment/); assert.equal(exported.result.data.backup.schemaVersion, 'backy.collections.backup.v1'); assert.equal(exported.result.data.collections[0].records.length, 2);
  const saved = exported.result.data.collections[0].records.find((r: any) => r.slug === 'editable'); assert.deepEqual(saved.values.frontendDesignElements, values.frontendDesignElements);
  await f.call('/import', 'POST', 409, exported.result);
  const upsert = (await f.call('/import', 'POST', 200, exported.result, undefined, undefined, '?upsert=true')).result.data; assert.equal(upsert.import.updatedCollections, 1); assert.equal(upsert.import.updatedRecords, 2);
  await f.call('/import', 'POST', 200, { collection: { ...input, slug: 'clone', routePattern: '/clone/:recordSlug', listRoutePattern: '/clone', records: [{ slug: 'clone-record', values }] } });
  const noWrites = f.writes; await f.call('/import', 'POST', 400, { collections: [{ name: 'Valid first', slug: 'valid-first' }, { name: 'Invalid last', records: [null] }] }); assert.equal(f.writes, noWrites);
  if (!demo) { f.conflict(true); await f.call('/import', 'POST', 409, { collections: [{ name: 'Conflict', slug: 'conflict' }] }); assert.equal(f.writes, noWrites); f.conflict(false); }
  await f.call('presets', 'GET', 200);
  const preset = (await f.call('presets', 'PATCH', 200, { presets: [{ id: 'fixture-preset', collectionId: cid, fieldKey: 'title', targetPath: 'props.content', limit: '20' }] })).result.data.presets[0]; assert.equal(preset.updatedBy, 'fixture-owner'); assert.equal(preset.targetPath, 'props.content'); const reread = (await f.call('presets', 'GET', 200)).result.data.presets[0]; assert.equal(reread.updatedBy, 'fixture-owner'); assert.equal(reread.createdBy, 'fixture-owner');
  for (const presets of [[{ collectionId: cid, fieldKey: 'undeclared' }], [{ collectionId: schema.slug, fieldKey: 'title' }], [{ collectionId: cid, fieldKey: 'title', targetPath: 'props.__proto__.polluted' }], [null], Array.from({ length: 49 }, (_, i) => ({ id: 'p' + i, collectionId: cid, fieldKey: 'title' })), [{ id: 'dup', collectionId: cid, fieldKey: 'title' }, { id: 'dup', collectionId: cid, fieldKey: 'title' }]]) { const before = f.writes; await f.call('presets', 'PATCH', 400, { presets }); assert.equal(f.writes, before); }
  if (!demo) { f.incomplete(true); const before = f.writes; await f.call(recPath, 'GET', 409, undefined, cid, rid, '?format=csv'); await f.call('', 'POST', 503, { name: 'Incomplete', slug: 'incomplete' }); assert.equal(f.writes, before); f.incomplete(false); }
  await f.call(recPath + '/bulk', 'POST', 200, { action: 'delete', recordIds: [rid] }, cid); await f.call(detail, 'GET', 404, undefined, cid, rid);
  const next = (await f.call(recPath, 'POST', 201, { slug: 'delete-me', values: { title: 'Delete me' } }, cid)).result.data.record;
  await f.call(detail, 'DELETE', 200, undefined, cid, next.id); await f.call('/{collectionId}', 'DELETE', 200, undefined, cid);
 }
 validate('#/components/schemas/AdminCollectionRecordPatchRequest', { expectedVersion: 'invalid-token' }, false); validate('#/components/schemas/AdminCollectionsImportRequest', {}, false); validate('#/components/schemas/AdminCollectionsImportRequest', { collections: [] }, false); validate('#/components/schemas/AdminCollectionBindingPresetsPatchRequest', { presets: [null] }, false);
 assert.equal(networkCalls, 0);
 console.log(`Collection actual-handler/schema checks passed: ${checks}; all18 operations, actual isolated demo persistence plus repository adapters, early auth denial, canonical IDs, dynamic route metadata, nested editable JSON, CSV partial outcomes and complete export, backup/upsert/conflict, bulk and preset bounds. Repository adapters do not certify PostgreSQL transaction behavior; no browser/provider/deployed proof.`);
} finally { process.chdir(originalCwd); rmSync(directory, { recursive: true, force: true }); }
