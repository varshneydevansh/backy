import { installActualMediaRecovery } from './media-storage-recovery-fixture.mts';
import { mkdtempSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { assertMediaBody } from './admin-media-contract.mjs';
const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, any>, fixtureProcess: any = process) {
  const filename = fileURLToPath(new URL(relative, import.meta.url)), compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, process: fixtureProcess, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename }); return module.exports;
}
const inventoryImport = await import('../src/lib/mediaInventory'); const inventory: any = inventoryImport.default || inventoryImport;
const scope = load('../src/lib/mediaScope.ts', {}), responsive = load('../src/lib/mediaResponsive.ts', {}), organization = load('../src/lib/publicMediaResource.ts', { '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive });
const policy = load('../src/lib/mediaUploadPolicy.ts', {}, { ...process, env: {} });
const storageMutation = load('../src/lib/mediaStorageMutation.ts', {});
const site = { id: 'inventory-media-site', slug: 'inventory-media-slug', settings: {}, isPublished: true }, settings = { integrations: { storage: { workspaceStorageLimitMb: 1, maxFileSizeMb: 2 } } };
const rows = Array.from({ length: 10005 }, (_, i) => ({ id: `asset-${i}`, siteId: site.id, filename: `asset-${i}.woff2`, originalName: `asset-${i}.woff2`, mimeType: 'font/woff2', sizeBytes: i === 10004 ? 50000 : 100, type: i === 0 ? 'image' : 'font', url: `/fixture/${i}`, visibility: 'public', scope: 'global', scopeTargetId: null, folderId: null, tags: [], pageIds: [], postIds: [], metadata: { fontFamily: 'Inventory Sans', fontWeight: '400', fontStyle: 'normal' }, createdAt: '2026-10-04T00:00:00Z' })); rows[0].mimeType = 'image/png'; rows[0].filename = 'fixture.png';
let checks = 0;
const recoveryDirectory = mkdtempSync('/tmp/backy-media-inventory-recovery-');
try {
for (const demo of [true, false]) {
  let failure = '', storageWrites = 0, entityWrites = 0, transformWrites = 0;
  const offsets: number[] = [];
  function list(p: any) {
    assert.equal(p.siteId, site.id); offsets.push(p.offset);
    if (failure === 'unavailable') throw Error('Private provider failure detail');
    const all = rows.filter(r => !p.type || p.type === 'all' || r.type === p.type).filter(r => !p.visibility || p.visibility === 'all' || r.visibility === p.visibility), limit = Math.min(p.limit, 10000), items = all.slice(p.offset, p.offset + limit), pagination = { total: all.length, limit, offset: p.offset, hasMore: p.offset + limit < all.length };
    if (failure === 'premature') pagination.hasMore = false;
    if (failure === 'stalled' && p.offset) return { items: [], pagination };
    if (failure === 'duplicate' && p.offset) items[0] = all[0];
    if (failure === 'changed-total' && p.offset) pagination.total++;
    if (failure === 'offset' && p.offset) pagination.offset = 0;
    if (failure === 'foreign') items[0] = { ...items[0], siteId: 'private-foreign-site' };
    return { items, pagination: failure === 'missing-pagination' ? undefined : pagination };
  }
  const repositories: any = { sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async (slug: string) => slug === site.slug ? site : null }, settings: { get: async () => settings }, media: { withStorageMutationLock:async(_site:any,run:any)=>run(), list: async (p: any) => list(p), listFolders: async () => [], getById: async (id: string, mediaId: string) => { assert.equal(id, site.id); return rows.find(r => r.id === mediaId) || null; }, create: async () => { entityWrites++; return { item: rows[0] }; }, update: async (id: string, mediaId: string) => { assert.equal(id, site.id); entityWrites++; return { item: rows.find(r => r.id === mediaId) }; } }, cacheInvalidations: { latestRevision: async () => 'fixture' } };
  const store = { getSiteByIdOrSlug: (id: string) => id === site.id || id === site.slug ? site : null, getAdminSettings: () => settings, getMediaList: (id: string, p: any) => { const result = list({ siteId: id, ...p }); return { media: result.items, pagination: result.pagination }; }, getMediaById: (id: string, mediaId: string) => { assert.equal(id, site.id); return rows.find(r => r.id === mediaId) || null; }, listMediaFolders: () => [], createMediaItem: () => { entityWrites++; return rows[0]; }, updateMediaItem: (_id: string, mediaId: string) => { entityWrites++; return rows.find(r => r.id === mediaId); } };
  const mocks: any = { '@/lib/mediaStorageMutation': storageMutation, '@/lib/backyStore': store, '@/lib/mediaInventory': inventory, '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive, '@/lib/publicMediaResource': organization, '@/lib/mediaUploadPolicy': policy, '@/lib/mediaSafety': {}, '@/lib/mediaDeletionSafety': {}, '@/lib/collectionExportPagination': {}, '@/lib/mediaStorage': { getMediaStorageAdapter: async () => ({ upload: async () => { storageWrites++; return { path: 'fixture', url: '/fixture', size: 1 }; } }) }, '@/lib/mediaTransformGeneration': { generatedTransformBytes: () => 0, generateImageTransformManifest: async () => { transformWrites++; return { generatedBytes: 0, variants: [] }; }, deleteGeneratedTransformFiles: async () => {} }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'fixture-actor' } } }) }, '@/lib/adminAudit': { recordAdminAudit: async () => ({}) }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] } };
  installActualMediaRecovery(mocks, repositories, recoveryDirectory);
  async function call(path: string, method: string, expected: number, body?: any, query = '') {
    const route = load('../src/app/api/admin/sites/[siteId]/media' + path.replace('{mediaId}', '[mediaId]') + '/route.ts', mocks);
    const response = await route[method](new NextRequest(`http://fixture.invalid/api/admin/sites/${site.slug}/media${path.replace('{mediaId}', rows[0].id)}${query}`, { method, ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) }), { params: Promise.resolve({ siteId: site.slug, mediaId: rows[0].id }) });
    const payload = await response.json(); assert.equal(response.status, expected, `${demo} ${method} ${path} ${failure}`); assertMediaBody(path, method, expected, payload); checks++; return payload;
  }
  const data = new FormData(); data.set('file', new File([Buffer.from('fixture')], 'fixture.png', { type: 'image/png' }));
  const catalog = await call('', 'GET', 200, undefined, '?limit=5&offset=10000'); assert.equal(catalog.data.pagination.total, 10005); assert.equal(catalog.data.media.length, 5); assert.equal(catalog.data.media[4].id, 'asset-10004'); assert.equal(catalog.data.quota.usedBytes, 1050400); assert.ok(offsets.includes(10000));
  const uploaded = await call('', 'POST', 413, data); assert.equal(uploaded.error.code, 'SITE_MEDIA_QUOTA_EXCEEDED'); await call('/{mediaId}', 'POST', 413, data); assert.equal(storageWrites, 0); assert.equal(entityWrites, 0);
  const matched = await call('/provider-analytics', 'POST', 200, { entries: [{ mediaId: 'asset-10004', requests: 3 }] }); assert.equal(matched.data.matchedCount, 1); assert.equal(matched.data.matched[0].mediaId, 'asset-10004');
  const publicContract = load('../src/lib/publicContractResponse.ts', {}), fontManifest = load('../src/lib/fontManifest.ts', {});
  const fontRoute = load('../src/app/api/sites/[siteId]/media/fonts/route.ts', { ...mocks, '@/lib/fontManifest': fontManifest, '@/lib/publicContractResponse': publicContract, '@/lib/mediaSafety': { isMediaQuarantined: () => false } });
  const fontParams = { params: Promise.resolve({ siteId: site.slug }) };
  const fonts = await fontRoute.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.slug}/media/fonts`), fontParams); assert.equal(fonts.status, 200); const manifest = await fonts.json(); assert.equal(manifest.data.fonts.length, 10004); assert.ok(manifest.data.fonts.some((font: any) => font.mediaId === 'asset-10004')); checks++;
  for (const broken of ['premature', 'stalled', 'duplicate', 'changed-total', 'offset', 'foreign', 'missing-pagination', 'unavailable']) {
    failure = broken; const before = entityWrites;
    for (const [path, method, body] of [['', 'GET'], ['', 'POST', data], ['/{mediaId}', 'POST', data], ['/{mediaId}/transforms', 'POST', { widths: [16] }], ['/provider-analytics', 'POST', { entries: [{ mediaId: 'asset-10004', requests: 3 }] }]] as const) {
      const error = await call(path, method, 503, body); assert.equal(error.error.code, 'MEDIA_INVENTORY_INCOMPLETE'); assert.equal(JSON.stringify(error).includes('Private provider failure detail'), false); assert.equal(entityWrites, before); assert.equal(storageWrites, 0); assert.equal(transformWrites, 0, 'Incomplete inventory refuses transform generation before any storage write');
    }
    const refusal = await fontRoute.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.slug}/media/fonts`), fontParams); assert.equal(refusal.status, 503); assert.equal((await refusal.json()).error.code, 'MEDIA_INVENTORY_INCOMPLETE'); checks++;
  }
}
await assert.rejects(inventory.readCompleteMediaInventory(site.id, async () => ({ items: [], pagination: { total: 100001, limit: 100, offset: 0, hasMore: true } })), inventory.MediaInventoryIncompleteError); checks++;
console.log(`Complete media inventory checks passed: ${checks}; 10005 assets/10004 fonts, exact totals/quota/last-asset analytics, eight faults fail closed before binary or metadata writes.`);

} finally { rmSync(recoveryDirectory, { recursive: true, force: true }); }
