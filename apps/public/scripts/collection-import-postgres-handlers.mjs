// Invoked by the owned disposable PostgreSQL runner only; never reads a database URL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), { NextRequest, NextResponse } = require('next/server');
export function load(relative, mocks, cache = new Map()) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 if (cache.has(filename)) return cache.get(filename);
 const module = { exports: {} }; cache.set(filename, module.exports);
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(compiled, { module, exports: module.exports, Headers, URL, Buffer, process, console: { error() {} }, require: id => id in mocks ? mocks[id] : id.startsWith('@/lib/') ? load('../src/lib/' + id.slice('@/lib/'.length) + '.ts', mocks, cache) : id.startsWith('./') ? load(new URL(id + '.ts', 'file://' + filename).href, mocks, cache) : require(id) }, { filename });
 return module.exports;
}
export async function verifyCollectionImportHandlers({ repositories, competing, site, sql }) {
 let deny = 0, interleave = false, checks = 0;
 const actual = repositories.collections;
 const mocks = {
  'next/server': { NextResponse },
  '@/lib/adminAccess': { requireAdminAccess: async (_request, _id, options) => { assert.equal(options.permission, 'collections.edit'); return deny ? NextResponse.json({ success: false }, { status: deny }) : { session: { user: { id: 'synthetic-owner' } } }; } },
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => ({ ...repositories, collections: { ...actual, applyImport: async (siteId, operations) => { if (interleave) { interleave = false; const expected = operations[0].expectedRecords[0]; await competing.collections.updateRecord(siteId, expected.collectionId, expected.id, { values: { ...expected.values, extension: { authorWinner: true } } }); } return actual.applyImport(siteId, operations); } } }) },
  // Field normalization and local validation are covered with the actual demo store in
  // collection-authoring-smoke; SQL and the complete-inventory/media validation are real here.
  '@/lib/backyStore': { validateCollectionRecordValueTypes: () => [], normalizeCollectionRecordValues: (_collection, values, previous) => ({ ...previous, ...values }), validateCollectionRecordValues: () => [] },
  '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionSlugAccess: async () => null },
  '@/lib/adminAudit': { recordAdminAudit: async () => ({}) }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) }, '@/lib/repositoryMediaReferenceSync': { syncRepositoryCollectionRecordMediaReferences: async () => ({}) },
 };
 const route = load('../src/app/api/admin/sites/[siteId]/collections/import/route.ts', mocks);
 const payload = { collections: [{ name: 'HTTP import', slug: 'http-import', fields: [{ id: 'title', key: 'title', label: 'Title', type: 'text' }], metadata: { extension: { nested: [false, 0] } }, records: [{ slug: 'entry', values: { title: 'Original', design: { elements: [{ id: 'root', type: 'section', responsive: { mobile: { width: 375 } } }] } } }] }] };
 async function call(body = payload, query = '') { const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.slug}/collections/import${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ siteId: site.slug }) }); return { status: response.status, body: await response.json() }; }
 const created = await call(); assert.equal(created.status, 200); assert.equal(created.body.data.import.createdRecords, 1); assert.equal(created.body.data.records[0].siteId, site.id); checks += 3;
 const collection = await actual.getBySlug(site.id, 'http-import'), record = await actual.getRecordBySlug(site.id, collection.id, 'entry');
 assert.deepEqual(record.values.design, payload.collections[0].records[0].values.design); checks++;
 interleave = true; const stale = await call(payload, '?upsert=true'); assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'COLLECTION_IMPORT_CONFLICT'); assert.deepEqual((await actual.getRecordById(site.id, collection.id, record.id)).values.extension, { authorWinner: true }); checks += 3;
 const missingMedia = { collections: [{ ...payload.collections[0], slug: 'http-media-denied', fields: [{ id: 'asset', key: 'asset', label: 'Asset', type: 'file' }], records: [{ slug: 'entry', values: { asset: '00000000-0000-4000-8000-000000000001' } }] }] };
 assert.equal((await call(missingMedia)).status, 400); assert.equal(await actual.getBySlug(site.id, 'http-media-denied'), null); checks += 2;
 await sql.unsafe(`CREATE FUNCTION fixture_reject_collection_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.slug = 'http-storage-denied' THEN RAISE EXCEPTION 'Private synthetic storage error'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_collection_import BEFORE INSERT ON content_collections FOR EACH ROW EXECUTE FUNCTION fixture_reject_collection_import()`);
 const lateFailure = await call({ collections: [{ ...payload.collections[0], slug: 'http-rollback-first' }, { ...payload.collections[0], slug: 'http-storage-denied' }] });
 assert.equal(lateFailure.status, 500); assert(!JSON.stringify(lateFailure.body).includes('Private synthetic')); assert.equal(await actual.getBySlug(site.id, 'http-rollback-first'), null); checks += 3;
 await sql.unsafe('DROP TRIGGER fixture_reject_collection_import ON content_collections; DROP FUNCTION fixture_reject_collection_import()');
 for (const status of [401, 403]) { deny = status; assert.equal((await call()).status, status); checks++; }
 console.log(`Collection import actual PostgreSQL HTTP handlers passed ${checks} checks: canonical slug/site, JSON preservation, cross-module typed 409 author race, media denial, late-storage rollback and denied sessions. Session/side-effect boundaries are fixtures.`);
 return checks;
}
