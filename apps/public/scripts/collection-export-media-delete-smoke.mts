import { installActualMediaRecovery, loadMediaFixture } from './media-storage-recovery-fixture.mts';
import { mkdtempSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
const require = createRequire(import.meta.url);
async function route(relative: string, mocks: Record<string, unknown>) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  for (const helper of ['collectionExportPagination', 'mediaDeletionSafety', 'mediaInventory']) {
    const url = new URL(`../src/lib/${helper}.ts`, import.meta.url);
    if (existsSync(url)) { const value = await import(url.href); mocks[`@/lib/${helper}`] = value.default || value; }
  }
  if (relative.includes('/media/')) {
    const repositories: any = await (mocks['@/lib/repositoryRuntime'] as any).getRequiredDatabaseRepositories();
    installActualMediaRecovery(mocks, repositories, recoveryDirectory);
    mocks['@/lib/repositoryRuntime'] = { ...(mocks['@/lib/repositoryRuntime'] as any), getRequiredDatabaseRepositories: async () => repositories };
    mocks['@/lib/mediaStorageMutation'] = loadMediaFixture('../src/lib/mediaStorageMutation.ts', {});
  }
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Buffer, URL, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : require(id) }, { filename });
  return module.exports;
}
const recoveryDirectory = mkdtempSync('/tmp/backy-media-delete-recovery-');
const site = { id: 'site-export-delete', slug: 'scope-test', settings: {} };
const collection = (index: number) => ({ id: `collection-${index}`, siteId: site.id, slug: `collection-${index}`, name: `Collection ${index}`, fields: [{ key: 'title', type: 'text' }], metadata: { authored: { preserve: true } }, status: 'draft' });
const record = (index: number, collectionId = 'collection-0') => ({ id: `record-${index}`, siteId: site.id, collectionId, slug: `record-${index}`, status: 'draft', values: { title: `Record ${index}`, extension: { retain: [index] } } });
const page = (rows: any[], input: any) => { const limit = Math.min(input.limit, 100); return { items: rows.slice(input.offset, input.offset + limit), pagination: { total: rows.length, offset: input.offset, limit, hasMore: input.offset + limit < rows.length } }; };
const access = { requireAdminAccess: async () => ({ session: { user: { id: 'reviewing-owner' } } }) };
async function exportRoute({ schemas = [collection(0)], rows = Array.from({ length: 205 }, (_, index) => record(index)), fault, schemaFault, demo = false }: any = {}) {
  let recordCalls = 0;
  const exports = await route('../src/app/api/admin/sites/[siteId]/collections/export/route.ts', {
    'next/server': { NextResponse }, '@/lib/adminAccess': access,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => ({ sites: { getById: async () => site }, collections: { list: async (input: any) => schemaFault ? schemaFault(page(schemas, input), input) : page(schemas, input), listRecords: async (input: any) => { recordCalls++; return fault ? fault(page(rows, input), input) : page(rows, input); } } }) },
    '@/lib/backyStore': { getSiteByIdOrSlug: () => site, listCollections: () => schemas, listCollectionRecords: (_site: string, _collection: string, input: any) => { const result = page(rows, input); return { records: result.items, pagination: result.pagination }; } },
  });
  return { call: async (query = '') => { const response = await exports.GET(new Request(`http://fixture.invalid/api/admin/sites/${site.id}/collections/export${query}`), { params: Promise.resolve({ siteId: site.id }) }); return { status: response.status, body: await response.json(), headers: response.headers }; }, calls: () => recordCalls };
}
const asset = { id: 'media-used', siteId: site.id, filename: 'used.png', originalName: 'used.png', mimeType: 'image/png', type: 'image', visibility: 'public', url: '/safe-used.png', pageIds: ['page-used'], postIds: [], sizeBytes: 10, metadata: { bindings: [{ id: 'product-reference', scope: 'collectionRecord', targetId: 'product-used', collectionId: 'products', usageType: 'download' }] } };
async function deleteRoute({ demo = false, media = structuredClone(asset), auditFailure = false, denied = false, afterVersionRead, afterAudit, pages = [], posts = [], schemas = [], rows = [], contentFault }: any = {}) {
  const effects = { deleted: 0, storage: 0, audit: [] as any[] };
  const exports = await route('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts', {
    'next/server': { NextResponse }, '@/lib/adminAccess': denied ? { requireAdminAccess: async () => NextResponse.json({ success: false }, { status: 403 }) } : access,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => ({ sites: { getById: async () => site }, pages: { list: async (input: any) => contentFault ? contentFault(page(pages, input), input) : page(pages, input) }, posts: { list: async (input: any) => page(posts, input) }, collections: { list: async (input: any) => page(schemas, input), listRecords: async (input: any) => page(rows.filter((row: any) => row.collectionId === input.collectionId), input) }, media: { withStorageMutationLock: async (_s: any, run: any) => run(), list: async (input: any) => page(effects.deleted ? [] : [media], input), getById: async () => media, listVersions: async (input: any) => { afterVersionRead?.(media); return page([], input); }, delete: async () => { effects.deleted++; return true; } } }) },
    '@/lib/backyStore': { getSiteByIdOrSlug: () => site, getMediaById: () => media, getMediaList: (_s: any, input: any) => { const result = page(effects.deleted ? [] : [media], input); return { media: result.items, pagination: result.pagination }; }, listAdminPages: () => pages, getBlogPosts: (_site: string, input: any) => { const result = page(posts, input); return { posts: result.items, pagination: result.pagination }; }, listCollections: () => schemas, listCollectionRecords: (_site: string, collectionId: string, input: any) => { const result = page(rows.filter((row: any) => row.collectionId === collectionId), input); return { records: result.items, pagination: result.pagination }; }, deleteMediaItem: () => { effects.deleted++; return media; } },
    '@/lib/adminAudit': { recordAdminAudit: async (input: any) => { if (auditFailure) throw new Error('Audit unavailable'); effects.audit.push(input); afterAudit?.(media); return {}; } },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
    '@/lib/mediaStorage': { getMediaStoragePathFromMedia: () => `sites/${site.id}/used.png`, getMediaStorageAdapter: async () => ({ provider: 'local', stat: async () => effects.storage ? null : { size: 10 }, delete: async () => { effects.storage++; } }) },
    '@/lib/mediaTransformGeneration': { generatedTransformStoragePaths: () => [] },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) },
    '@/lib/publicMediaResource': { buildPublicMediaOrganization: () => ({}) },
  });
  return { effects, media, call: async (body?: unknown) => { const response = await exports.DELETE(new Request(`http://fixture.invalid/api/admin/sites/${site.id}/media/${asset.id}`, { method: 'DELETE', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }), { params: Promise.resolve({ siteId: site.id, mediaId: asset.id }) }); return { status: response.status, body: await response.json() }; } };
}
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) { try { await run(); passed++; } catch (error) { failures.push(`${name}: ${String(error)}`); } }
await check('complete capped repository records', async () => { const fixture = await exportRoute(); const result = await fixture.call(); assert.equal(result.status, 200); assert.equal(result.body.data.backup.recordCount, 205); assert.deepEqual(result.body.data.collections[0].records[204].values.extension, { retain: [204] }); });
await check('complete capped repository schemas with records=false', async () => { const fixture = await exportRoute({ schemas: Array.from({ length: 205 }, (_, index) => collection(index)) }); const result = await fixture.call('?records=false'); assert.equal(result.body.data.backup.collectionCount, 205); assert.equal(fixture.calls(), 0); });
await check('demo record export also paginates', async () => { const fixture = await exportRoute({ demo: true, rows: Array.from({ length: 1205 }, (_, index) => record(index)) }); const result = await fixture.call(); assert.equal(result.body.data.backup.recordCount, 1205); });
await check('filtered export selects a schema after the first page', async () => { const fixture = await exportRoute({ schemas: Array.from({ length: 205 }, (_, index) => collection(index)) }); const result = await fixture.call('?ids=collection-204&records=false'); assert.equal(result.body.data.backup.collectionCount, 1); assert.equal(result.body.data.collections[0].sourceCollectionId, 'collection-204'); assert.deepEqual(result.body.data.collections[0].metadata, { authored: { preserve: true } }); });
await check('empty export completes', async () => { const fixture = await exportRoute({ schemas: [] }); const result = await fixture.call(); assert.equal(result.status, 200); assert.equal(result.body.data.backup.recordCount, 0); assert.equal(result.body.data.backup.collectionCount, 0); });
const faults = {
  'changing totals': (result: any, input: any) => input.offset ? { ...result, pagination: { ...result.pagination, total: 206 } } : result,
  'partial page': (result: any) => ({ ...result, items: result.items.slice(1) }),
  'premature completion': (result: any) => ({ ...result, pagination: { ...result.pagination, hasMore: false } }),
  'nonadvancing offset': (result: any, input: any) => input.offset ? { ...result, pagination: { ...result.pagination, offset: 0 } } : result,
  'duplicate IDs across pages': (result: any, input: any) => input.offset ? { ...result, items: [record(0), ...result.items.slice(1)] } : result,
  'foreign record': (result: any) => ({ ...result, items: [{ ...result.items[0], siteId: 'private-other-site' }, ...result.items.slice(1)] }),
  'wrong collection': (result: any) => ({ ...result, items: [{ ...result.items[0], collectionId: 'private-other-collection' }, ...result.items.slice(1)] }),
  'repository read failure': () => { throw new Error('private provider failure'); },
};
for (const [name, fault] of Object.entries(faults)) await check(`export rejects ${name}`, async () => { const fixture = await exportRoute({ fault }); const result = await fixture.call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'COLLECTION_EXPORT_INCOMPLETE'); assert.equal(result.headers.get('content-disposition'), null); assert(!JSON.stringify(result.body).includes('private provider')); });
await check('schema pagination is also validated', async () => { const fixture = await exportRoute({ schemas: Array.from({ length: 205 }, (_, index) => collection(index)), schemaFault: faults['nonadvancing offset'] }); assert.equal((await fixture.call('?records=false')).status, 409); });
await check('in-use repository delete is blocked without side effects', async () => { const fixture = await deleteRoute(); const result = await fixture.call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'MEDIA_IN_USE'); assert.equal(result.body.error.details.referenceCount, 2); assert.deepEqual(fixture.effects, { deleted: 0, storage: 0, audit: [] }); });
await check('in-use demo delete is blocked without side effects', async () => { const fixture = await deleteRoute({ demo: true }); assert.equal((await fixture.call()).status, 409); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0); });
for (const demo of [false, true]) {
  await check(`unused ${demo ? 'demo' : 'repository'} delete stays available`, async () => { const fixture = await deleteRoute({ demo, media: { ...asset, pageIds: [], metadata: {} } }); const result = await fixture.call(); assert.equal(result.status, 200); assert.equal(fixture.effects.deleted, 1); assert.equal(fixture.effects.storage, 1); assert.equal(fixture.effects.audit.length, 1); assert.equal(fixture.effects.audit[0].actorId, 'reviewing-owner'); });
  await check(`reviewed ${demo ? 'demo' : 'repository'} override is audited`, async () => { const fixture = await deleteRoute({ demo }); const conflict = await fixture.call(); const details = conflict.body.error.details; assert.deepEqual(details.references, [{ scope: 'collectionRecord', targetId: 'product-used', collectionId: 'products' }, { scope: 'page', targetId: 'page-used' }]); const result = await fixture.call({ allowReferencedDelete: true, reason: 'Confirmed retired content', referenceFingerprint: details.referenceFingerprint }); assert.equal(result.status, 200); assert.equal(fixture.effects.deleted, 1); assert.equal(fixture.effects.audit.length, 2); assert.equal(fixture.effects.audit[0].action, 'delete.override.authorized'); assert.equal(fixture.effects.audit[0].actorId, 'reviewing-owner'); assert.equal(fixture.effects.audit[0].metadata.reason, 'Confirmed retired content'); assert.equal(fixture.effects.audit[1].metadata.referencedDeleteOverride, true); assert.deepEqual(fixture.effects.audit[1].metadata.affectedReferences, details.references); });
}
await check('reference changes invalidate an earlier acknowledgement', async () => { const fixture = await deleteRoute(); const first = await fixture.call(); fixture.media.postIds.push('post-new'); const result = await fixture.call({ allowReferencedDelete: true, reason: 'Confirmed retired content', referenceFingerprint: first.body.error.details.referenceFingerprint }); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'MEDIA_REFERENCES_CHANGED'); assert.equal(result.body.error.details.referenceCount, 3); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0); });
for (const override of [{ allowReferencedDelete: 'true', reason: 'Valid deletion reason' }, { allowReferencedDelete: true, reason: 'short' }, { allowReferencedDelete: true, reason: 'x'.repeat(501) }]) await check('invalid override cannot delete', async () => { const fixture = await deleteRoute(); const result = await fixture.call(override); assert.equal(result.status, 400); assert.equal(fixture.effects.deleted, 0); });
await check('unauthorized requests cannot inspect or delete references', async () => { const fixture = await deleteRoute({ denied: true }); assert.equal((await fixture.call()).status, 403); assert.equal(fixture.effects.deleted, 0); });
await check('override audit failure prevents deletion', async () => { const fixture = await deleteRoute({ auditFailure: true }); const blocked = await fixture.call(); const result = await fixture.call({ allowReferencedDelete: true, reason: 'Confirmed retired content', referenceFingerprint: blocked.body.error.details.referenceFingerprint }); assert.equal(result.status, 500); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0); });
await check('new reference during version lookup prevents unreviewed deletion', async () => {
  const fixture = await deleteRoute({ media: { ...asset, pageIds: [], metadata: {} }, afterVersionRead: (media: any) => { media.postIds = ['post-added-during-read']; } });
  const result = await fixture.call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'MEDIA_IN_USE'); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0);
});
for (const demo of [false, true]) await check(`reference recheck follows ${demo ? 'demo' : 'repository'} override audit`, async () => {
  const fixture = await deleteRoute({ demo, afterAudit: (media: any) => { media.postIds.push('post-added-during-audit'); } });
  const blocked = await fixture.call();
  const result = await fixture.call({ allowReferencedDelete: true, reason: 'Confirmed retired content', referenceFingerprint: blocked.body.error.details.referenceFingerprint });
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'MEDIA_REFERENCES_CHANGED'); assert.equal(fixture.effects.audit.length, 1); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0);
});
await check('all persisted reference sources are de-duplicated and identified', async () => {
  const fixture = await deleteRoute({ media: { ...asset, scope: 'post', scopeTargetId: 'post-scope', postIds: ['post-attached'], metadata: { pageIds: ['page-used', 'page-metadata'], postIds: ['post-attached'], bindings: [{ scope: 'page', targetId: 'page-used', collectionId: 'irrelevant' }, { scope: 'collectionRecord', targetId: 'record-used', collectionId: 'products' }, { scope: 'collectionRecord', targetId: 'record-used', collectionId: 'downloads' }] } } });
  const result = await fixture.call(); assert.equal(result.status, 409); const references = result.body.error.details.references;
  assert.equal(references.length, 6); assert(references.some((reference: any) => reference.targetId === 'post-scope')); assert(references.some((reference: any) => reference.collectionId === 'downloads')); assert.equal(references.filter((reference: any) => reference.targetId === 'page-used').length, 1);
});
const contentPage = (index: number, content: unknown = {}, meta: unknown = {}) => ({ id: `page-${index}`, siteId: site.id, content, meta });
for (const demo of [false, true]) await check(`authoritative ${demo ? 'demo' : 'repository'} content scan finds an unindexed media reference beyond page 100`, async () => {
  const pages = Array.from({ length: 205 }, (_, index) => contentPage(index, index === 204 ? { contentDocument: { children: [{ type: 'image', mediaId: asset.id }] } } : {}));
  const fixture = await deleteRoute({ demo, media: { ...asset, pageIds: [], metadata: {} }, pages });
  const result = await fixture.call(); assert.equal(result.status, 409); assert.deepEqual(result.body.error.details.references, [{ scope: 'page', targetId: 'page-204' }]); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0);
});
for (const demo of [false, true]) await check(`authoritative ${demo ? 'demo' : 'repository'} scan covers metadata, post featured images and later collection records`, async () => {
  const schemas = Array.from({ length: 105 }, (_, index) => collection(index));
  const rows = Array.from({ length: 205 }, (_, index) => ({ ...record(index, 'collection-104'), values: index === 204 ? { contentDocument: { assets: { files: [{ id: asset.id }] } } } : {} }));
  const fixture = await deleteRoute({ demo, media: { ...asset, pageIds: [], metadata: {} }, pages: [contentPage(1, {}, { fontMediaId: asset.id })], posts: [{ id: 'post-featured', siteId: site.id, content: {}, featuredImageId: asset.id }], schemas, rows });
  const blocked = await fixture.call(); assert.equal(blocked.status, 409); assert.deepEqual(blocked.body.error.details.references, [{ scope: 'collectionRecord', targetId: 'record-204', collectionId: 'collection-104' }, { scope: 'page', targetId: 'page-1' }, { scope: 'post', targetId: 'post-featured' }]);
  const result = await fixture.call({ allowReferencedDelete: true, reason: 'Confirmed retired content', referenceFingerprint: blocked.body.error.details.referenceFingerprint }); assert.equal(result.status, 200); assert.deepEqual(fixture.effects.audit[1].metadata.affectedReferences, blocked.body.error.details.references);
});
for (const contentFault of [(result: any) => ({ ...result, items: result.items.slice(1) }), (result: any) => ({ ...result, items: [{ ...result.items[0], siteId: 'other-private-site' }] }), () => { throw new Error('private database detail'); }]) await check('incomplete or wrong-site reference inventory blocks deletion without disclosure', async () => {
  const fixture = await deleteRoute({ media: { ...asset, pageIds: [], metadata: {} }, pages: [contentPage(1)], contentFault });
  const result = await fixture.call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'MEDIA_REFERENCE_CHECK_INCOMPLETE'); assert(!JSON.stringify(result.body).includes('private')); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0);
});
await check('late content reference invalidates override even if media bindings were never updated', async () => {
  const pages = [contentPage(1, { mediaId: asset.id })];
  const fixture = await deleteRoute({ media: { ...asset, pageIds: [], metadata: {} }, pages, afterAudit: () => { pages.push(contentPage(2, { mediaId: asset.id })); } });
  const blocked = await fixture.call(); const result = await fixture.call({ allowReferencedDelete: true, reason: 'Confirmed retired content', referenceFingerprint: blocked.body.error.details.referenceFingerprint }); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'MEDIA_REFERENCES_CHANGED'); assert.equal(result.body.error.details.referenceCount, 2); assert.equal(fixture.effects.deleted, 0); assert.equal(fixture.effects.storage, 0);
});
if (failures.length) { console.error(failures.join('\n')); throw new Error(`${failures.length} of ${passed + failures.length} regressions failed`); }
console.log(`Collection export/media delete route regressions passed: ${passed}.`);

rmSync(recoveryDirectory, { recursive: true, force: true });
