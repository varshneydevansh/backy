import { installActualMediaRecovery } from './media-storage-recovery-fixture.mts';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { assertMediaBody, assertMediaSchema } from './admin-media-contract.mjs';
const require = createRequire(import.meta.url), cwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-media-contract-'));
process.chdir(directory); let checks = 0;
function load(relative: string, mocks: Record<string, any>, fixtureProcess: any = process) {
  const filename = fileURLToPath(new URL(relative, import.meta.url)), compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, ReadableStream, process: fixtureProcess, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename }); return module.exports;
}
try {
  const imported = await import('../src/lib/backyStore'); const store: any = imported.default || imported;
  const scope = load('../src/lib/mediaScope.ts', {}), responsive = load('../src/lib/mediaResponsive.ts', {}), uploadPolicy = load('../src/lib/mediaUploadPolicy.ts', {}), safety = load('../src/lib/mediaSafety.ts', {});
  const publicMedia = load('../src/lib/publicMediaResource.ts', { '@/lib/mediaResponsive': responsive, '@/lib/mediaScope': scope });
  const storageHelpers = load('../src/lib/mediaStorage.ts', {}), signingEnv: any = { NODE_ENV: 'production', BACKY_MEDIA_SIGNING_SECRET: 'agent-local-fixture-signing-secret' };
  const signing = load('../src/lib/mediaSigning.ts', {}, { ...process, env: signingEnv });
  const deletionImport = await import('../src/lib/mediaDeletionSafety'); const deletion: any = deletionImport.default || deletionImport;
  const paginationImport = await import('../src/lib/collectionExportPagination'); const pagination: any = paginationImport.default || paginationImport;
  const inventoryImport = await import('../src/lib/mediaInventory'); const inventory: any = inventoryImport.default || inventoryImport;
  for (const demo of [true, false]) {
    const site = store.createAdminSite({ id: 'media-fixture-' + demo, slug: 'media-slug-' + demo, name: 'Media fixture', isPublished: true });
    const target = store.createAdminPage(site.id, { title: 'Binding target', slug: 'target' });
    const files = new Map<string, Buffer>(), versions = new Map<string, any>(); let sequence = 0, deny = '', mutations = 0, incomplete = false, ordinaryMetadataPatch = false;
    function assertEditablePatch(input:any) { if (ordinaryMetadataPatch) for (const key of ['url','size','sizeBytes','mimeType','type']) assert.equal(Object.hasOwn(input,key), false, 'Ordinary PATCH must not replay binary fields: ' + key); if (ordinaryMetadataPatch) for (const key of ['storagePath','storageProvider','binaryFingerprint','safetyScan','generatedTransforms','replacementVersions']) assert.equal(Object.hasOwn(input.metadata || {}, key), false, 'Ordinary PATCH must not replay stale storage metadata: ' + key); }
    const uploads: Array<{ path: string; bytes: Buffer }> = [], removed: string[] = [];
    const mediaListCalls:any[]=[];
    const adapter = { provider: 'local', stat: async (path: string) => files.has(path) ? { path, size: files.get(path)!.length } : null, upload: async (bytes: Buffer, p: any) => { assert.ok(p.path.startsWith(`sites/${site.id}/`)); const content = Buffer.from(bytes); files.set(p.path, content); uploads.push({ path: p.path, bytes: content }); return { path: p.path, size: content.length, url: '/fixture-storage/' + p.path }; }, read: async (path: string) => { const bytes = files.get(path); if (!bytes) throw Error('Fixture binary not found'); return Buffer.from(bytes); }, delete: async (path: string) => { removed.push(path); files.delete(path); }, getPublicUrl: (path: string) => '/fixture-storage/' + path };
    const storage = { ...storageHelpers, getMediaStorageAdapter: async () => adapter };
    const transforms = load('../src/lib/mediaTransformGeneration.ts', { '@/lib/mediaStorage': storage, '@/lib/mediaResponsive': responsive });
    function canonical(id: string) { assert.equal(id, site.id, 'Every repository lookup uses canonical site identity'); }
    function page(items: any[], p: any) { return { items: items.slice(p.offset, p.offset + p.limit), pagination: { total: items.length, offset: p.offset, limit: p.limit, hasMore: p.offset + p.limit < items.length } }; }
    const repositories: any = { sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async (slug: string) => slug === site.slug ? site : null }, settings: { get: async () => store.getAdminSettings() }, pages: { getById: async (id: string, pageId: string) => { canonical(id); return store.getAdminPageById(id, pageId); }, list: async (p: any) => { canonical(p.siteId); const result = page(store.listAdminPages(p.siteId, { includeUnpublished: true }), p); if (incomplete) result.pagination.hasMore = true; return result; } }, posts: { getById: async (id: string, postId: string) => { canonical(id); return store.getAdminBlogPostById(id, postId); }, list: async (p: any) => { canonical(p.siteId); const result = store.getBlogPosts(p.siteId, { includeUnpublished: true, ...p }); return { items: result.posts, pagination: result.pagination }; } }, collections: { list: async (p: any) => page([], p), listRecords: async (p: any) => page([], p) }, media: {
      withStorageMutationLock: async (_site: string, operation: () => Promise<unknown>) => operation(),
      list: async (p: any) => { canonical(p.siteId); mediaListCalls.push(structuredClone(p)); const result = store.getMediaList(p.siteId, { ...p, type: p.type === 'all' ? undefined : p.type, visibility: p.visibility === 'all' ? undefined : p.visibility }); return { items: result.media, pagination: result.pagination }; }, getById: async (id: string, mediaId: string) => { canonical(id); return store.getMediaById(id, mediaId); },
      create: async (p: any) => { canonical(p.siteId); mutations++; return { item: store.createMediaItem(p.siteId, { ...p, sizeBytes: p.size, pageIds: p.metadata?.pageIds, postIds: p.metadata?.postIds, tags: p.metadata?.tags, scope: p.metadata?.scope, scopeTargetId: p.metadata?.scopeTargetId }) }; },
      update: async (id: string, mediaId: string, p: any) => { assertEditablePatch(p); canonical(id); mutations++; return { item: store.updateMediaItem(id, mediaId, p) }; }, delete: async (id: string, mediaId: string) => { canonical(id); mutations++; return store.deleteMediaItem(id, mediaId); },
      listFolders: async (id: string) => { canonical(id); return store.listMediaFolders(id); }, getFolderById: async (id: string, folderId: string) => { canonical(id); return store.listMediaFolders(id).find((f: any) => f.id === folderId) || null; }, createFolder: async (p: any) => { canonical(p.siteId); mutations++; return { item: store.createMediaFolder(p.siteId, p) }; }, updateFolder: async (id: string, folderId: string, p: any) => { canonical(id); mutations++; return { item: store.updateMediaFolder(id, folderId, p) }; }, deleteFolder: async (id: string, folderId: string) => { canonical(id); mutations++; return store.deleteMediaFolder(id, folderId); },
      listVersions: async (p: any) => { canonical(p.siteId); return page([...versions.values()].filter(v => v.mediaId === p.mediaId), p); }, createVersion: async (p: any) => { canonical(p.siteId); const item = { ...p, id: 'version-' + ++sequence, createdAt: '2026-10-04T00:00:00Z' }; versions.set(item.id, item); return { item }; }, deleteVersion: async (p: any) => { canonical(p.siteId); assert.equal(versions.get(p.versionId)?.mediaId, p.mediaId); return versions.delete(p.versionId); },
    } };
    const mocks: any = { '@/lib/mediaByteDelivery': load('../src/lib/mediaByteDelivery.ts', {}), '@/lib/repositorySitePublication': load('../src/lib/repositorySitePublication.ts', {}), '@/lib/mediaStorageMutation': load('../src/lib/mediaStorageMutation.ts', {}), '@/lib/backyStore': { ...store, updateMediaItem:(siteId:any,id:any,input:any)=>{assertEditablePatch(input);return store.updateMediaItem(siteId,id,input);} }, '@/lib/mediaInventory': inventory, '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive, '@/lib/publicMediaResource': publicMedia, '@/lib/mediaUploadPolicy': uploadPolicy, '@/lib/mediaSafety': { ...safety, scanMediaUploadWithProviders: async (p: any) => safety.scanMediaUpload(p) }, '@/lib/mediaStorage': storage, '@/lib/mediaTransformGeneration': transforms, '@/lib/mediaSigning': signing, '@/lib/mediaDeletionSafety': deletion, '@/lib/collectionExportPagination': pagination, '@/lib/adminAudit': { recordAdminAudit: async () => ({}) }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({ fixture: true }) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async (_r: any, requestId: string, p: any) => deny ? NextResponse.json({ success: false, requestId, error: { code: deny === '401' ? 'UNAUTHORIZED' : 'FORBIDDEN', message: 'Fixture access denied' } }, { status: Number(deny) }) : { session: { user: { id: 'fixture-actor' } } } } };
    const detail = '/{mediaId}', versionDetail = detail + '/versions/{versionId}'; let mediaId = '', folderId = '', versionId = '';
    installActualMediaRecovery(mocks, repositories, directory);
    async function call(path: string, method: string, body?: any, expected = 200, options: { siteId?: string; query?: string; invalid?: boolean; mediaId?: string; folderId?: string; versionId?: string } = {}) {
      const relative = path.replace('{mediaId}', '[mediaId]').replace('{folderId}', '[folderId]').replace('{versionId}', '[versionId]'), route = load('../src/app/api/admin/sites/[siteId]/media' + relative + '/route.ts', mocks);
      if (body !== undefined && !options.invalid) { const projected = body instanceof FormData ? Object.fromEntries([...body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '<binary multipart part>'])) : body; assertMediaBody(path, method, 'request', projected); }
      const targetSite = options.siteId || site.slug;
      ordinaryMetadataPatch = path === '/{mediaId}' && method === 'PATCH';
      const response = await route[method](new NextRequest('http://fixture.invalid/api/admin/sites/' + targetSite + '/media' + path.replace('{mediaId}', options.mediaId || mediaId).replace('{folderId}', options.folderId || folderId).replace('{versionId}', options.versionId || versionId) + (options.query || ''), { method, ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) }), { params: Promise.resolve({ siteId: targetSite, mediaId: options.mediaId || mediaId, folderId: options.folderId || folderId, versionId: options.versionId || versionId }) });
      ordinaryMetadataPatch = false;
      assert.equal(response.status, expected, `${demo} ${method} ${path}`); const payload = await response.json(); assertMediaBody(path, method, expected, payload); checks++; return payload;
    }
    function multipart(bytes: Buffer, name: string, type: string, fields: Record<string, string> = {}) { const data = new FormData(); data.set('file', new File([bytes], name, { type })); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; }
    const folder = await call('/folders', 'POST', { name: 'Fixture assets', sortOrder: 3 }, 201); folderId = folder.data.folder.id;
    await call('/folders', 'GET'); await call('/folders', 'POST', { name: 'Fixture assets' }, 409); await call('/folders/{folderId}', 'PATCH', { name: 'Renamed assets', sortOrder: 2 });
    const bytes = Buffer.from('Agent-authored byte fixture\n');
    const upload = await call('', 'POST', multipart(bytes, 'fixture.txt', 'text/plain', { scope: 'page', scopeTargetId: target.id, folderId, visibility: 'private', tags: 'alpha,beta', metadata: JSON.stringify({ unknown: { nested: ['preserved'] } }), altText: 'Fixture attachment' }), 201);
    mediaId = upload.data.media.id; assert.equal(upload.data.media.siteId, site.id); assert.equal(upload.data.media.visibility, 'private'); assert.deepEqual(upload.data.media.tags, ['alpha', 'beta']); assert.deepEqual(upload.data.media.metadata.unknown, { nested: ['preserved'] }); assert.deepEqual(uploads.at(-1)!.bytes, bytes);
    // Both SQL-paginated and exact-refinement lists retain the same folder context.
    const nested=await call('/folders','POST',{name:'Nested photographs',parentId:folderId},201);
    const nestedId=nested.data.folder.id;
    const moved=await call(detail,'PATCH',{folderId:nestedId});
    const rootRow=store.createMediaItem(site.id,{filename:'unfiled-fixture.txt',originalName:'unfiled-fixture.txt',type:'document',mimeType:'text/plain',sizeBytes:0,url:'/fixture-unfiled',visibility:'private'});
    const assertFolders=(items:any[])=>{const grouped=items.find(item=>item.id===mediaId),root=items.find(item=>item.id===rootRow.id);if(grouped){assert.equal(grouped.organization.schemaVersion,'backy.media.organization.v1');assert.equal(grouped.organization.folderId,nestedId);assert.equal(grouped.organization.folderPath,'Renamed assets/Nested photographs');assert.deepEqual(grouped.organization.folderAncestors.map((folder:any)=>folder.id),[folderId,nestedId]);assert.equal(grouped.organization.missingFolder,false);}if(root){assert.equal(root.organization.folderId,null);assert.equal(root.organization.folderPath,'Root');assert.equal(root.organization.root,true);assert.deepEqual(root.organization.folderAncestors,[]);}assert(grouped||root);};
    const direct=await call('','GET',undefined,200,{query:'?includeQuota=false&limit=100'});assert.equal(Object.hasOwn(direct.data,'quota'),false);assert.equal(direct.data.pagination.total,2);assertFolders(direct.data.media);assert.equal(direct.data.media.length,2);
    const pages:any[]=[];
    for(const offset of [0,1]){const start=mediaListCalls.length;const listed=await call('','GET',undefined,200,{query:'?includeQuota=false&limit=1&offset='+offset});assert.equal(listed.data.media.length,1);assert.equal(listed.data.pagination.offset,offset);assertFolders(listed.data.media);pages.push(...listed.data.media);if(!demo){assert.equal(mediaListCalls.length-start,1);assert.equal(mediaListCalls.at(-1).limit,1);assert.equal(mediaListCalls.at(-1).offset,offset);}}
    assert.deepEqual(new Set(pages.map(row=>row.id)),new Set([mediaId,rootRow.id]));
    const refined=await call('','GET',undefined,200,{query:'?includeQuota=false&scope=page&pageId='+target.id+'&tag=alpha&limit=100'});assert.equal(refined.data.media.length,1);assertFolders(refined.data.media);
    assertFolders([moved.data.media]);
    await call(detail,'PATCH',{folderId});store.deleteMediaItem(site.id,rootRow.id);
    await call('/folders/{folderId}','DELETE',undefined,200,{folderId:nestedId});
    await call('', 'GET', undefined, 200, { query: '?scope=page&pageId=' + target.id + '&tag=alpha&limit=1&offset=0' });
    await call(detail, 'PATCH', { tags: ['revised'], caption: 'Typed metadata', metadata: { ...upload.data.media.metadata, unknown: { nested: ['preserved'], revised: true } } });
    await call(detail, 'PATCH', {sizeBytes:upload.data.media.sizeBytes,url:upload.data.media.url,mimeType:upload.data.media.mimeType,type:upload.data.media.type}, 200, {invalid:true});
    const storedBeforeForgery = store.getMediaById(site.id, mediaId);
    await call(detail, 'PATCH', { metadata: { storagePath: 'sites/foreign-site/private-file.txt' } }, 400);
    assert.equal(store.getMediaById(site.id, mediaId).metadata.storagePath, storedBeforeForgery.metadata.storagePath);
    for (const key of ['storageProvider', 'binaryFingerprint', 'safetyScan', 'generatedTransforms', 'replacementVersions']) {
      await call(detail, 'PATCH', { metadata: { [key]: { forged: true } } }, 400);
    }
    for (const body of [{sizeBytes:1}, {size:1}, {url:'/uploads/sites/foreign-site/file.png'}, {mimeType:'image/png'}, {type:'image'}]) {
      await call(detail, 'PATCH', body, 400, {invalid:true});
    }
    assert.equal(store.getMediaById(site.id, mediaId).sizeBytes, storedBeforeForgery.sizeBytes);
    await call('', 'POST', multipart(bytes, 'forged.txt', 'text/plain', { metadata: JSON.stringify({generatedTransforms:{generatedBytes:0,variants:[{storagePath:'sites/foreign-site/file.png'}]}}) }), 400);

    await call(detail + '/bind', 'POST', { targetType: 'page', targetId: target.id }); await call(detail + '/bind', 'POST', { targetType: 'page', targetId: 'foreign-target' }, 404);
    const signed = await call(detail + '/signed-url', 'POST', { disposition: 'attachment', expiresInSeconds: 120 }); assert.equal(typeof signed.data.expiresAt, 'number'); assert.ok(signed.data.path.includes(site.id));
    await call(detail + '/signed-url', 'POST', { expiresInSeconds: 1 }, 400, { invalid: true });
    signingEnv.BACKY_MEDIA_SIGNING_SECRET = ''; await call(detail + '/signed-url', 'POST', {}, 503); signingEnv.BACKY_MEDIA_SIGNING_SECRET = 'agent-local-fixture-signing-secret';
    const prior = store.getMediaById(site.id, mediaId); store.updateMediaItem(site.id, mediaId, { metadata: { ...prior.metadata, mediaSecurity: { status: 'quarantined' } } }); await call(detail + '/signed-url', 'POST', {}, 423); store.updateMediaItem(site.id, mediaId, { metadata: { ...prior.metadata, mediaSecurity: { status: 'clear' } } });
    // Actual public delivery verifies the exact private signature, then reads the memory adapter bytes.
    const publicContract = load('../src/lib/publicContractResponse.ts', {});
    const delivery = load('../src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts', { ...mocks, '@/lib/publicContractResponse': publicContract, '@/lib/mediaDeliveryAnalytics': { recordMediaDelivery: async () => ({}) }, '@/lib/mediaDeliveryCache': { mediaDeliveryCacheMetadata: () => ({ cacheRevision: 'fixture', etag: 'fixture', notModified: false }) } });
    const deliveryParams = { params: Promise.resolve({ siteId: site.id, mediaId }) };
    const unsigned = await delivery.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.id}/media/${mediaId}/file`), deliveryParams); assert.equal(unsigned.status, 403);
    const delivered = await delivery.GET(new NextRequest(signed.data.signedUrl), deliveryParams); assert.equal(delivered.status, 200); assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), bytes); assert.equal(delivered.headers.get('content-disposition')?.startsWith('attachment'), true); assert.equal(delivered.headers.get('cache-control'), 'private, no-store'); checks += 2;
    const replacementBytes = Buffer.from('Agent-authored replacement bytes\n');
    const replaced = await call(detail, 'POST', multipart(replacementBytes, 'revised.txt', 'text/plain', { reason: 'Fixture replacement' })); assert.equal(replaced.data.media.id, mediaId); assert.deepEqual(uploads.at(-1)!.bytes, replacementBytes); assert.equal(replaced.data.media.metadata.unknown.revised, true); assert.equal(replaced.data.media.folderId, folderId);
    const listed = await call(detail + '/versions', 'GET'); assert.ok(listed.data.versions.length); versionId = listed.data.versions[0].id;
    const restored = await call(versionDetail, 'POST', { reason: 'Fixture restore' }); assert.equal(restored.data.media.filename, upload.data.media.filename); assert.equal(restored.data.source, demo ? 'metadata' : 'database');
    const versionList = await call(detail + '/versions', 'GET'); versionId = versionList.data.versions.find((v: any) => v.id !== restored.data.restoredVersion.id).id; await call(versionDetail, 'DELETE');
    await call('/provider-analytics', 'POST', { source: 'fixture-provider-export', mergeMode: 'increment', entries: [{ mediaId, requests: 3, bytes: 30, conversions: 1 }, { mediaId: 'foreign-media', requests: 2 }] });
    const inUse = await call(detail, 'DELETE', undefined, 409); assert.ok(inUse.error.details.referenceFingerprint); const storageBefore = removed.length;
    await call(detail, 'DELETE', { allowReferencedDelete: true, reason: 'Reviewed fixture override', referenceFingerprint: 'stale' }, 409); assert.equal(removed.length, storageBefore);
    if (!demo) { incomplete = true; await call(detail, 'DELETE', undefined, 409); incomplete = false; assert.equal(removed.length, storageBefore); }
    await call(detail, 'DELETE', { allowReferencedDelete: true, reason: 'Reviewed fixture override', referenceFingerprint: inUse.error.details.referenceFingerprint });
    await call('/folders/{folderId}', 'DELETE');
    // Public image generation uses real Sharp decoding/resampling and an isolated provider adapter.
    const sharp = require('sharp'), png = await sharp({ create: { width: 64, height: 32, channels: 4, background: '#0e7777' } }).png().toBuffer();
    const image = await call('', 'POST', multipart(png, 'fixture.png', 'image/png', { visibility: 'public' }), 201); mediaId = image.data.media.id;
    const transformed = await call(detail + '/transforms', 'POST', { widths: [16, 32], quality: 70 }); assert.equal(transformed.data.responsive.variants.length, 2); assert.equal(transformed.data.responsive.format, 'webp'); for (const variant of transformed.data.responsive.variants) assert.equal((await sharp(files.get(variant.storagePath)).metadata()).format, 'webp');
    await call(detail, 'PATCH', { visibility: 'private' }); await call(detail + '/transforms', 'POST', {}, 400);
    const font = await call('', 'POST', multipart(Buffer.from('Agent-owned font metadata fixture'), 'fixture.woff2', 'font/woff2', { fontFamily: 'Fixture Sans', fontWeight: '600', fontStyle: 'italic', fontDisplay: 'swap' }), 201); assert.equal(font.data.media.type, 'font'); assert.equal(font.data.media.metadata.fontFamily, 'Fixture Sans'); assert.equal(font.data.media.metadata.fontWeight, '600');
    const fontManifest = load('../src/lib/fontManifest.ts', {});
    repositories.cacheInvalidations = { latestRevision: async () => 'fixture' };
    const fontRoute = load('../src/app/api/sites/[siteId]/media/fonts/route.ts', { ...mocks, '@/lib/fontManifest': fontManifest, '@/lib/publicContractResponse': publicContract });
    const publicFonts = await fontRoute.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.slug}/media/fonts`), { params: Promise.resolve({ siteId: site.slug }) }); assert.equal(publicFonts.status, 200); const manifestBody = await publicFonts.json(); assertMediaSchema('FontManifestEnvelope', manifestBody); assert.equal(manifestBody.data.fonts[0].family, 'Fixture Sans'); assert.equal(manifestBody.data.fonts[0].weight, '600'); assert.ok(manifestBody.data.fonts[0].url.includes('/file')); checks++;
    store.updateMediaItem(site.id, font.data.media.id, { visibility: 'private' }); const privateFontManifest = await fontRoute.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.slug}/media/fonts`), { params: Promise.resolve({ siteId: site.slug }) }); assert.equal((await privateFontManifest.json()).data.fonts.length, 0); checks++;
    // Every documented route's authentication and authorization branch executes before writes.
    for (const [path, method, body] of [['', 'GET'], ['', 'POST', multipart(bytes, 'fixture.txt', 'text/plain')], [detail, 'PATCH', {}], [detail, 'POST', multipart(png, 'fixture.png', 'image/png')], [detail, 'DELETE'], [detail + '/signed-url', 'POST', {}], [detail + '/bind', 'POST', { targetType: 'page', targetId: target.id }], [detail + '/transforms', 'POST', {}], [detail + '/versions', 'GET'], [versionDetail, 'POST', {}], [versionDetail, 'DELETE'], ['/folders', 'GET'], ['/folders', 'POST', { name: 'Denied' }], ['/folders/{folderId}', 'PATCH', {}], ['/folders/{folderId}', 'DELETE'], ['/provider-analytics', 'POST', { entries: [{ mediaId }] }]] as const) {
      for (const status of [401, 403]) { deny = String(status); const before = mutations, storedBefore = uploads.length; await call(path, method, body, status); assert.equal(mutations, before); assert.equal(uploads.length, storedBefore); }
    }
    deny = ''; await call(detail + '/signed-url', 'POST', {}, 404, { mediaId: 'foreign-media' }); await call('', 'GET', undefined, 404, { siteId: 'foreign-site' });
    await call('', 'GET', undefined, 400, { query: '?limit=101' }); await call('', 'GET', undefined, 400, { query: '?scope=collection' });
    await call('', 'POST', new FormData(), 400, { invalid: true }); await call('', 'POST', multipart(bytes, 'fixture.txt', 'text/plain', { metadata: '[]' }), 400); await call('', 'POST', multipart(Buffer.from('<svg><script>bad()</script></svg>'), 'unsafe.svg', 'image/svg+xml'), 415);
  }
  console.log(`Admin media actual-handler/OpenAPI checks passed: ${checks}; multipart exact bytes, private signed delivery and real Sharp variants with isolated memory storage.`);
} finally { process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); }
