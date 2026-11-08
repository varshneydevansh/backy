import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { File } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { createLocalAdapter } from '@backy/storage';
import { NextRequest } from 'next/server';
import { fixture, networkCalls } from './admin-access-test-fixtures.mts';
import { loadMediaFixture, installActualMediaRecovery } from './media-storage-recovery-fixture.mts';

// Actual access, scanner, readiness and saved handlers. Sessions/repositories are
// synthetic; bytes and recovery journals live only in a disposable temp directory.
let checks = 0;
for (const demo of [false, true]) {
  const scratch = mkdtempSync('/tmp/backy-owner-media-handler-');
  const env: Record<string, string | undefined> = {
    NODE_ENV: 'production', BACKY_OWNER_STATIC_MEDIA_SITE_IDS: 'site-fixture',
    BACKY_STORAGE_PROVIDER: 's3', BACKY_S3_BUCKET: 'fixture', BACKY_S3_REGION: 'fixture',
    BACKY_S3_ACCESS_KEY_ID: 'fixture', BACKY_S3_SECRET_ACCESS_KEY: 'fixture',
  };
  const f = fixture({ demo, actorRole: 'owner', env });
  const rows: any[] = [], versions: any[] = [];
  const page = (items: any[], input: any) => ({
    items: structuredClone(items.slice(input.offset, input.offset + input.limit)),
    pagination: { total: items.length, offset: input.offset, limit: input.limit, hasMore: input.offset + input.limit < items.length },
  });
  const list = (siteId: string, input: any) => page(rows.filter(row => row.siteId === siteId), input);
  const create = (input: any) => {
    const item = { ...input, id: randomUUID(), sizeBytes: input.sizeBytes ?? input.size, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    rows.push(item); return structuredClone(item);
  };
  const update = (siteId: string, id: string, input: any) => {
    const index = rows.findIndex(row => row.siteId === siteId && row.id === id);
    if (index < 0) return null;
    rows[index] = { ...rows[index], ...input, sizeBytes: input.sizeBytes ?? input.size ?? rows[index].sizeBytes };
    return structuredClone(rows[index]);
  };
  const read = (siteId: string, id: string) => structuredClone(rows.find(row => row.siteId === siteId && row.id === id) || null);
  const repositories: any = f.repositories;
  repositories.media = {
    withStorageMutationLock: async (_siteId: string, run: any) => run(),
    list: async (input: any) => list(input.siteId, input), listFolders: async () => [],
    getById: async (siteId: string, id: string) => read(siteId, id),
    create: async (input: any) => ({ item: create(input) }),
    update: async (siteId: string, id: string, input: any) => ({ item: update(siteId, id, input) }),
    listVersions: async (input: any) => page(versions.filter(row => row.siteId === input.siteId && row.mediaId === input.mediaId), input),
    createVersion: async (input: any) => { const item = { ...input, id: randomUUID() }; versions.push(item); return { item }; },
  };
  const adapter = createLocalAdapter({ provider: 'local', basePath: scratch + '/uploads', publicUrl: '/uploads' });
  let storageWrites = 0;
  const storageHelpers = loadMediaFixture('../src/lib/mediaStorage.ts', {});
  const fixtureProcess = { env, cwd: () => scratch };
  const storageAdmission = loadMediaFixture('../src/lib/mediaStorage.ts', {}, fixtureProcess);
  let syntheticProviderCalls = 0;
  const scanner = loadMediaFixture('../src/lib/mediaSafety.ts', {}, fixtureProcess, {
    fetch: async () => { syntheticProviderCalls++; return Response.json({ status: 'infected', scanner: 'fixture' }); },
    setTimeout, clearTimeout, AbortController,
  });
  const mocks: any = { ...f.mocks };
  mocks['@/lib/backyStore'] = {
    ...f.mocks['@/lib/backyStore'],
    listMediaFolders: () => [],
    getMediaList: (siteId: string, input: any) => { const result = list(siteId, input); return { media: result.items, pagination: result.pagination }; },
    getMediaById: read,
    createMediaItem: (siteId: string, input: any) => create({ ...input, siteId }),
    updateMediaItem: update,
  };
  mocks['@/lib/mediaSafety'] = scanner;
  mocks['@/lib/mediaStorage'] = { ...storageHelpers, getMediaStorageAdapter: async () => {
    // Preserve the actual missing-config admission before substituting local bytes.
    if (!storageAdmission.getMediaStorageConfigSummary().configured) return storageAdmission.getMediaStorageAdapter();
    return { ...adapter, upload: async (...args: any[]) => { storageWrites++; return (adapter.upload as any)(...args); } };
  } };
  mocks['@/lib/mediaUploadReadiness'] = loadMediaFixture('../src/lib/mediaUploadReadiness.ts', {
    '@/lib/mediaSafety': scanner,
    '@/lib/mediaStorage': loadMediaFixture('../src/lib/mediaStorage.ts', {}, fixtureProcess),
  }, fixtureProcess);
  mocks['@/lib/collectionExportPagination'] = loadMediaFixture('../src/lib/collectionExportPagination.ts', {});
  mocks['@/lib/mediaInventory'] = loadMediaFixture('../src/lib/mediaInventory.ts', mocks);
  mocks['@/lib/mediaScope'] = loadMediaFixture('../src/lib/mediaScope.ts', {});
  mocks['@/lib/mediaResponsive'] = loadMediaFixture('../src/lib/mediaResponsive.ts', {});
  mocks['@/lib/publicMediaResource'] = loadMediaFixture('../src/lib/publicMediaResource.ts', mocks);
  mocks['@/lib/mediaUploadPolicy'] = loadMediaFixture('../src/lib/mediaUploadPolicy.ts', {}, fixtureProcess);
  mocks['@/lib/mediaStorageMutation'] = loadMediaFixture('../src/lib/mediaStorageMutation.ts', {});
  mocks['@/lib/mediaDeletionSafety'] = {}; // DELETE is outside this fixture's handler scope.
  mocks['@/lib/cacheInvalidation'] = { recordSiteCacheInvalidation: async () => ({}) };
  mocks['@/lib/siteWebhookDelivery'] = { deliverSiteWebhooks: async () => [] };
  installActualMediaRecovery(mocks, demo ? null : repositories, scratch, fixtureProcess);
  mocks['@/lib/mediaTransformGeneration'] = loadMediaFixture('../src/lib/mediaTransformGeneration.ts', mocks);
  const collection = loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/route.ts', mocks, fixtureProcess);
  const detail = loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts', mocks, fixtureProcess);
  const bytes = Buffer.from('Disposable owner media document');
  const headers = (apiKey = false) => ({ origin: 'http://fixture.invalid', cookie: 'backy_admin_session=fixture-session', ...(apiKey ? { 'x-backy-admin-key': 'fixture-service' } : {}) });
  const get = async (siteId = f.site.slug, apiKey = false) => {
    const response = await collection.GET(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/media`, { headers: headers(apiKey) }), { params: Promise.resolve({ siteId }) });
    return { status: response.status, body: await response.json() };
  };
  const upload = async ({ siteId = f.site.slug, apiKey = false, mediaId, data = bytes, name = 'fixture.txt', mime = 'text/plain', metadata }: any = {}) => {
    const body = new FormData(); body.set('file', new File([data], name, { type: mime }));
    body.set('uploadedBy', 'forged-owner'); body.set('replacedBy', 'forged-owner'); body.set('role', 'owner');
    body.set('siteId', f.site.id);
    if (metadata) body.set('metadata', JSON.stringify(metadata));
    const response = await (mediaId ? detail : collection).POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/media${mediaId ? '/' + mediaId : ''}`, { method: 'POST', headers: headers(apiKey), body }), { params: Promise.resolve({ siteId, mediaId }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const ready = await get(); assert.equal(ready.status, 200); assert.equal(ready.body.data.uploadReadiness.state, 'admissible'); checks++;
    const accepted = await upload(); assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const asset = accepted.body.data.media;
    assert.deepEqual(asset.metadata.safetyScan.ownerUploadPolicy, { mode: 'owner-static', siteId: f.site.id, actorId: f.actor.id, malwareScanned: false });
    assert.equal(asset.metadata.safetyScan.providerScans, undefined);
    assert.match(asset.metadata.safetyScan.warnings.join(' '), /Antivirus scanning was not performed/);
    assert.deepEqual(await adapter.read(asset.metadata.storagePath), bytes); checks++;
    const savedAsset = read(f.site.id, asset.id), privateSnapshot = JSON.stringify(savedAsset);
    const publicAsset = mocks['@/lib/publicMediaResource'].toPublicMediaAsset(f.site.id, savedAsset);
    for (const metadata of [publicAsset.metadata, publicAsset.editableMetadata.metadata]) {
      const publicPolicy = metadata.safetyScan.ownerUploadPolicy;
      assert.equal(Object.hasOwn(publicPolicy, 'actorId'), false);
      assert.equal(publicPolicy.mode, 'owner-static');
      assert.equal(publicPolicy.malwareScanned, false);
      assert.equal(publicPolicy.siteId, f.site.id);
    }
    assert.equal(JSON.stringify(savedAsset), privateSnapshot, 'Public projection must not mutate its private input');
    assert.equal(read(f.site.id, asset.id).metadata.safetyScan.ownerUploadPolicy.actorId, f.actor.id);
    assert.equal(asset.metadata.safetyScan.ownerUploadPolicy.actorId, f.actor.id, 'Admin response retains authenticated actor evidence'); checks++;
    const deny = async (options: any = {}) => {
      const beforeRows = JSON.stringify(rows), beforeVersions = JSON.stringify(versions), writes = storageWrites;
      const r = await get(options.siteId || f.site.slug, options.apiKey);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.data.uploadReadiness.state, 'blocked');
      assert.equal((await upload(options)).body.error.code, 'MEDIA_SAFETY_SCAN_FAILED');
      const replacement = await upload({ ...options, mediaId: asset.id, data: Buffer.from('Rejected replacement') });
      // Excluded site has no matching asset; its create admission still proves the site boundary.
      assert.equal(replacement.body.error.code, options.siteId === f.otherSite.slug ? 'MEDIA_NOT_FOUND' : 'MEDIA_SAFETY_SCAN_FAILED');
      assert.equal(storageWrites, writes); assert.equal(JSON.stringify(rows), beforeRows); assert.equal(JSON.stringify(versions), beforeVersions);
      assert.deepEqual(await adapter.read(asset.metadata.storagePath), bytes); checks++;
    };
    await deny({ apiKey: true }); // Actual API key takes precedence over simultaneous owner cookie.
    f.settings().apiKeys.adminApiKey = ''; f.settings().apiKeys.secretKeyId = '';
    f.settings().auth.apiKeyServiceKeys = [{ id: 'scoped-fixture', keyHash: createHash('sha256').update('fixture-service').digest('hex'), scope: {
      version: 1, revision: 1, mode: 'selected-sites', siteIds: [f.site.id], permissions: ['media.view', 'media.create', 'media.edit'], expiresAt: null,
    } }];
    await deny({ apiKey: true }); // Selected-site upload permissions still confer no owner authority.
    f.settings().apiKeys.adminApiKey = 'fixture-service'; f.settings().apiKeys.secretKeyId = 'fixture-service';
    f.actor.role = 'editor';
    await deny({ metadata: { ownerUploadPolicy: { mode: 'owner-static', actorId: 'forged-owner' } } });
    f.actor.role = 'admin'; await deny();
    f.actor.role = 'owner';
    f.actor.status = 'suspended';
    const suspendedRows = JSON.stringify(rows), suspendedWrites = storageWrites;
    assert.equal((await get()).status, 403);
    assert.equal((await upload()).status, 403);
    assert.equal((await upload({ mediaId: asset.id })).status, 403);
    assert.equal(JSON.stringify(rows), suspendedRows); assert.equal(storageWrites, suspendedWrites); checks++;
    f.actor.status = 'active';
    const sessionStore = f.mocks['@/lib/admin-auth/sessionStore'];
    const resolveSession = sessionStore.getAdminSessionWithPersistence;
    sessionStore.getAdminSessionWithPersistence = async () => null;
    const missingSessionRows = JSON.stringify(rows), missingSessionWrites = storageWrites;
    assert.equal((await get()).status, 401);
    assert.equal((await upload()).status, 401);
    assert.equal((await upload({ mediaId: asset.id })).status, 401);
    assert.equal(JSON.stringify(rows), missingSessionRows); assert.equal(storageWrites, missingSessionWrites); checks++;
    sessionStore.getAdminSessionWithPersistence = resolveSession;
    await deny({ siteId: f.otherSite.slug });
    env.BACKY_OWNER_STATIC_MEDIA_SITE_IDS = f.site.slug; await deny(); // IDs, never URL slugs.
    env.BACKY_OWNER_STATIC_MEDIA_SITE_IDS = ''; await deny();
    env.BACKY_OWNER_STATIC_MEDIA_SITE_IDS = f.site.id;
    delete env.BACKY_S3_SECRET_ACCESS_KEY;
    const unavailableStorage = await get();
    assert.equal(unavailableStorage.body.data.uploadReadiness.state, 'blocked');
    assert.deepEqual(unavailableStorage.body.data.uploadReadiness.blockingReasons.map((reason: any) => reason.code), ['MEDIA_STORAGE_NOT_CONFIGURED']);
    const unavailableRows = JSON.stringify(rows), unavailableWrites = storageWrites;
    assert.equal((await upload()).status, 500);
    assert.equal((await upload({ mediaId: asset.id })).status, 500);
    assert.equal(JSON.stringify(rows), unavailableRows); assert.equal(storageWrites, unavailableWrites); checks++;
    env.BACKY_S3_SECRET_ACCESS_KEY = 'fixture';
    env.BACKY_MEDIA_SCAN_PROVIDER = 'http'; await deny(); // Configured missing endpoint cannot fall back.
    assert.equal(syntheticProviderCalls, 0);
    env.BACKY_MEDIA_SCAN_ENDPOINT = 'https://scanner.fixture.invalid';
    const providerBefore = JSON.stringify(rows), providerWrites = storageWrites;
    assert.equal((await upload()).body.error.code, 'MEDIA_SAFETY_SCAN_FAILED');
    assert.equal((await upload({ mediaId: asset.id })).body.error.code, 'MEDIA_SAFETY_SCAN_FAILED');
    assert.equal(syntheticProviderCalls, 2); assert.equal(JSON.stringify(rows), providerBefore); assert.equal(storageWrites, providerWrites); checks++;
    delete env.BACKY_MEDIA_SCAN_ENDPOINT;
    delete env.BACKY_MEDIA_SCAN_PROVIDER;
    const before = JSON.stringify(rows), writes = storageWrites;
    const dangerous = { name: 'active.svg', mime: 'image/svg+xml', data: Buffer.from('<svg><script>alert(1)</script></svg>') };
    assert.equal((await upload(dangerous)).body.error.code, 'MEDIA_SAFETY_SCAN_FAILED');
    assert.equal((await upload({ ...dangerous, mediaId: asset.id })).body.error.code, 'MEDIA_TYPE_MISMATCH');
    assert.equal(JSON.stringify(rows), before); assert.equal(storageWrites, writes); checks++;
    const safeSvg = await upload({ name: 'safe.svg', mime: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
    assert.equal(safeSvg.status, 201, JSON.stringify(safeSvg.body));
    const svgBefore = JSON.stringify(rows), svgWrites = storageWrites;
    assert.equal((await upload({ ...dangerous, mediaId: safeSvg.body.data.media.id })).body.error.code, 'MEDIA_SAFETY_SCAN_FAILED');
    assert.equal(JSON.stringify(rows), svgBefore); assert.equal(storageWrites, svgWrites); checks++;
    const replacedBytes = Buffer.from('Accepted replacement document');
    const replaced = await upload({ mediaId: asset.id, data: replacedBytes });
    assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
    assert.equal(replaced.body.data.media.metadata.safetyScan.ownerUploadPolicy.actorId, f.actor.id);
    assert.deepEqual(await adapter.read(replaced.body.data.media.metadata.storagePath), replacedBytes);
    assert.deepEqual(await adapter.read(asset.metadata.storagePath), bytes); checks++;
    await assert.rejects(scanner.scanMediaUploadWithProviders({ buffer: bytes, originalName: 'visitor.txt', mimeType: 'text/plain', mediaType: 'document' }), (error: any) => error.details.reason === 'production-media-scanner-required'); checks++;
    let privateStorageCalls = 0;
    const formAttachments = loadMediaFixture('../src/lib/formAttachments.ts', {
      '@/lib/mediaSafety': scanner, '@/lib/mediaUploadPolicy': mocks['@/lib/mediaUploadPolicy'],
      '@/lib/formSubmissionTransport': loadMediaFixture('../src/lib/formSubmissionTransport.ts', {}),
      '@/lib/formAttachmentStorage': { getFormAttachmentStorage: async () => { privateStorageCalls++; return {}; } },
    }, fixtureProcess);
    const attachmentId = randomUUID();
    await assert.rejects(formAttachments.storeFormAttachments({
      siteId: f.site.id, formId: 'visitor-form', settings: f.settings(), currentUsageBytes: 0,
      pending: [{ fieldKey: 'attachment', file: new File([bytes], 'visitor.txt', { type: 'text/plain' }), reference: {
        kind: formAttachments.FORM_ATTACHMENT_KIND, id: attachmentId, attachmentId, filename: 'visitor.txt', mimeType: 'text/plain', sizeBytes: bytes.length,
      } }],
    }), (error: any) => error.details.reason === 'production-media-scanner-required');
    assert.equal(privateStorageCalls, 0); checks++;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
assert.equal(networkCalls, 0);
console.log(`Owner media actual GET/upload/replacement handlers: ${checks} checks passed (database/demo repository fixtures, disposable bytes, no backend/provider writes).`);
