import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NextRequest, NextResponse } from 'next/server';
import { createLocalAdapter } from '@backy/storage';
import { loadMediaFixture, memoryMediaJobs } from './media-storage-recovery-fixture.mts';
import * as inventoryImport from '../src/lib/mediaInventory';
const inventory: any = (inventoryImport as any).default || inventoryImport;

/** Real helper + local bytes. An optional actual database bundle supplies journal/media persistence. */
export async function runMediaStorageRecoveryProof(database?: any, databaseSites?: any[]) {
  const scratch = mkdtempSync('/tmp/backy-media-recovery-');
  const site = databaseSites?.[0] || { id: 'recovery-proof', slug: 'recovery-proof', settings: {} };
  const other = databaseSites?.[1] || { id: 'other-recovery-proof', slug: 'other-recovery-proof', settings: {} };
  const adapter = createLocalAdapter({ provider: 'local', basePath: join(scratch, 'uploads'), publicUrl: '/uploads' });
  const storageHelpers = loadMediaFixture('../src/lib/mediaStorage.ts', {});
  let failStat = false, failDelete = false, changedDestination = false, deny = false, queries = 0;
  const adapterFixture = { ...adapter, stat: async (path: string) => { if (failStat) throw Error('secret provider access failure'); return adapter.stat(path); }, delete: async (path: string) => { if (failDelete) throw Error('secret provider delete failure'); return adapter.delete(path); } };
  const storage = { ...storageHelpers, resolveMediaStorageConfig: () => ({ config: { provider: 'local', basePath: join(scratch, changedDestination ? 'wrong-storage' : 'uploads'), publicUrl: '/uploads' } }), getMediaStorageAdapter: async () => adapterFixture };
  const rows: any[] = [], versions: any[] = [];
  const page = (all: any[], input: any) => ({ items: all.slice(input.offset, input.offset + Math.min(input.limit, 100)), pagination: { total: all.length, limit: Math.min(input.limit, 100), offset: input.offset, hasMore: input.offset + Math.min(input.limit, 100) < all.length } });
  const repositories = database || { sites: { getById: async (id: string) => [site, other].find(s => s.id === id) || null, getBySlug: async (slug: string) => [site, other].find(s => s.slug === slug) || null }, media: { storageJobs: memoryMediaJobs(), withStorageMutationLock: async (_s: string, run: any) => run(), list: async (input: any) => { queries++; return page(rows.filter(row => row.siteId === input.siteId), input); }, listVersions: async (input: any) => page(versions.filter(row => row.siteId === input.siteId && row.mediaId === input.mediaId), input), create: async (input: any) => { const item = { ...input, id: randomUUID(), sizeBytes: input.size, metadata: input.metadata || {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; rows.push(item); return { item }; }, delete: async (s: string, id: string) => { const index = rows.findIndex(row => row.siteId === s && row.id === id); if (index >= 0) rows.splice(index, 1); return true; } } };
  const store = { getMediaList: (s: string, input: any) => { const result = page(rows.filter(row => row.siteId === s), input); return { media: result.items, pagination: result.pagination }; }, getSiteByIdOrSlug: () => site };
  const mocks: any = { '@/lib/demoSiteBackupPersistence': { pendingDemoSiteBackupBytes: () => 0 }, '@/lib/mediaStorage': storage, '@/lib/mediaInventory': inventory, '@/lib/backyStore': store, '@/lib/mediaStorageMutation': loadMediaFixture('../src/lib/mediaStorageMutation.ts', {}), '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async () => deny ? NextResponse.json({ success: false, error: { code: 'FORBIDDEN_SITE_SCOPE' } }, { status: 403 }) : { session: { user: { id: 'synthetic-operator' } } } } };
  const source = () => loadMediaFixture('../src/lib/mediaStorageRecovery.ts', mocks, { ...process, cwd: () => scratch });
  let recovery = source(); mocks['@/lib/mediaStorageRecovery'] = recovery;
  const jobs = repositories.media.storageJobs;
  const path = (name: string) => `sites/${site.id}/journal-proof/${name}`;
  const makeJob = async (files: any[], overrides: any = {}) => jobs.create({ siteId: site.id, mediaId: null, operation: 'upload', requestId: 'synthetic-proof', files, provider: 'local', storageIdentity: recovery.currentMediaStorageIdentity().identity, ...overrides });
  const bytes = Buffer.from('Recovery fixture real local bytes');
  let checks = 0;
  const test = async (name: string, run: () => Promise<void>) => { await run(); checks++; };
  try {
    await test('journal rejection precedes bytes', async () => {
      const broken = { ...repositories, media: { ...repositories.media, storageJobs: { ...jobs, create: async () => { throw Object.assign(Error('private journal insert failed'), { code: 'MEDIA_STORAGE_JOURNAL_UNAVAILABLE' }); } } } };
      let writes = 0;
      await assert.rejects(recovery.withJournaledMediaStorageMutation({ siteId: site.id, mediaId: null, operation: 'upload', requestId: 'proof', files: [{ path: path('denied'), bytes: bytes.length, purpose: 'write' }] }, broken, async () => { writes++; return NextResponse.json({ success: true, data: {} }); }));
      assert.equal(writes, 0);
    });
    let crashJob: any;
    await test('unconfirmed writes remain pending with bytes', async () => {
      await assert.rejects(recovery.withJournaledMediaStorageMutation({ siteId: site.id, mediaId: null, operation: 'upload', requestId: 'proof', files: [{ path: path('crashed'), bytes: bytes.length, purpose: 'write' }] }, repositories, async () => { await adapter.upload(bytes, { path: path('crashed') }); throw Error('private network outcome'); }), (error: any) => { assert.equal(error.code, 'MEDIA_STORAGE_WRITE_OUTCOME_UNCONFIRMED'); assert.ok(error.jobId); crashJob = error.jobId; const body = recovery.mediaStorageRecoveryErrorResponse(error, 'safe').body; return Boolean(body); });
      assert.ok(await adapter.stat(path('crashed'))); assert.equal(await recovery.mediaStorageUsageWithPending(site.id, repositories), bytes.length);
      assert.equal((await jobs.get(site.id, crashJob)).lastErrorCode, 'MEDIA_STORAGE_WRITE_OUTCOME_UNCONFIRMED');
    });
    recovery = source(); mocks['@/lib/mediaStorageRecovery'] = recovery;
    await test('provider stat error never proves absence', async () => {
      failStat = true; const result = await recovery.reconcileMediaStorageJob(site.id, crashJob, repositories); assert.equal(result.status, 'pending'); assert.equal(result.remainingFiles, 1); assert.ok(await adapter.stat(path('crashed'))); assert.equal(await recovery.mediaStorageUsageWithPending(site.id, repositories), bytes.length); failStat = false;
    });
    await test('restart explicit retry removes proven orphan', async () => {
      const result = await recovery.reconcileMediaStorageJob(site.id, crashJob, repositories); assert.equal(result.status, 'settled'); assert.equal(result.deletedFiles, 1); assert.equal(await adapter.stat(path('crashed')), null); assert.equal(await recovery.mediaStorageUsageWithPending(site.id, repositories), 0);
    });
    let live: any, protectedJob: any;
    await test('uncertain committed path is protected', async () => {
      const input = { siteId: site.id, filename: 'live.txt', originalName: 'live.txt', mimeType: 'text/plain', type: 'document', size: bytes.length, url: '/uploads/' + path('live'), visibility: 'public', metadata: { storagePath: path('live'), storageProvider: 'local' } };
      await adapter.upload(bytes, { path: path('live') }); live = (await repositories.media.create(input)).item;
      protectedJob = await makeJob([{ path: path('live'), bytes: bytes.length, purpose: 'write' }]);
      const result = await recovery.reconcileMediaStorageJob(site.id, protectedJob.id, repositories); assert.equal(result.protectedFiles, 1); assert.equal(result.deletedFiles, 0); assert.ok(await adapter.stat(path('live'))); assert.equal(await recovery.mediaStorageUsageWithPending(site.id, repositories), bytes.length);
    });
    await test('cross-site job lookup and retry denied', async () => {
      assert.equal(await jobs.get(other.id, protectedJob.id), null); await assert.rejects(recovery.reconcileMediaStorageJob(other.id, protectedJob.id, repositories), (error: any) => error.code === 'MEDIA_STORAGE_JOB_NOT_FOUND'); assert.ok(await adapter.stat(path('live')));
    });
    await test('changed destination cannot clean original bucket', async () => {
      const job = await makeJob([{ path: path('destination'), bytes: 1, purpose: 'write' }]); await adapter.upload(Buffer.from('x'), { path: path('destination') }); changedDestination = true;
      await assert.rejects(recovery.reconcileMediaStorageJob(site.id, job.id, repositories), (error: any) => error.code === 'MEDIA_STORAGE_DESTINATION_CHANGED'); assert.ok(await adapter.stat(path('destination'))); changedDestination = false; await recovery.reconcileMediaStorageJob(site.id, job.id, repositories);
    });
    await test('failed delete remains pending then retry succeeds', async () => {
      const job = await makeJob([{ path: path('retry'), bytes: 2, purpose: 'retire' }]); await adapter.upload(Buffer.from('xx'), { path: path('retry') }); failDelete = true;
      const pending = await recovery.reconcileMediaStorageJob(site.id, job.id, repositories); assert.equal(pending.status, 'pending'); failDelete = false; assert.equal((await recovery.reconcileMediaStorageJob(site.id, job.id, repositories)).status, 'settled');
    });
    await test('mutation response reflects actual cleanup and quota', async () => {
      failDelete = true;
      const result = await recovery.withJournaledMediaStorageMutation({ siteId: site.id, mediaId: live.id, operation: 'transforms', requestId: 'proof', files: [{ path: path('pending-response'), bytes: 2, purpose: 'write' }] }, repositories, async () => { await adapter.upload(Buffer.from('xx'), { path: path('pending-response') }); return NextResponse.json({ success: true, data: { storageCleanup: { status: 'complete', deletedFiles: 0, remainingFiles: 0 }, quota: { limitBytes: 1000, usedBytes: 0, remainingBytes: 1000 }, completionWarnings: ['MEDIA_AUDIT_PENDING'] } }); });
      const body = await result.json(); assert.equal(body.data.storageCleanup.status, 'pending'); assert.equal(body.data.storageCleanup.remainingFiles, 1); assert.equal(body.data.quota.usedBytes, bytes.length + 2); assert.ok(body.data.completionWarnings.includes('MEDIA_STORAGE_RECOVERY_PENDING')); assert.ok(!JSON.stringify(body).includes(path('pending-response'))); assert.ok(!JSON.stringify(body).includes('secret provider')); failDelete = false; await recovery.reconcileMediaStorageJob(site.id, body.data.storageRecovery.jobId, repositories);
    });
    await test('site delete guard retains live storage refs', async () => {
      await assert.rejects(recovery.assertSiteMediaStorageJobsSettled(site.id, repositories), (error: any) => error.code === 'SITE_MEDIA_STORAGE_REFERENCES_REMAIN');
      let cascadeCalls = 0;
      const guardedRepositories = { ...repositories, sites: { ...repositories.sites, delete: async () => { cascadeCalls++; return true; } } };
      const siteRoute = loadMediaFixture('../src/app/api/admin/sites/[siteId]/route.ts', { ...mocks,
        '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => guardedRepositories },
        '@/lib/adminAccess': { ...mocks['@/lib/adminAccess'], requireAdminTeamScopeAccess: async () => null },
        // This fixture has no forms. Private form lifecycle has its separate actual-handler suite.
        '@/lib/siteBackup': { SiteBackupError: class extends Error {}, assertSiteBackupJobsSettled: async () => {} },
        '@/lib/formAttachmentLifecycle': { FormAttachmentLifecycleError: class extends Error {}, assertSiteFormAttachmentsDeleted: async () => {} },
        '@/lib/adminAudit': {}, '@/lib/cacheInvalidation': {}, '@/lib/navigation': {}, '@/lib/redirectRules': {}, '@/lib/frontendDesignContract': {}, '@/lib/siteWebhookDelivery': {},
      });
      const siteDelete = () => siteRoute.DELETE(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.slug}`, { method: 'DELETE' }), { params: Promise.resolve({ siteId: site.slug }) });
      const liveDenied = await siteDelete(); assert.equal(liveDenied.status, 409); assert.equal((await liveDenied.json()).error.code, 'SITE_MEDIA_STORAGE_REFERENCES_REMAIN'); assert.equal(cascadeCalls, 0);
      const job = await makeJob([{ path: path('guard-pending'), bytes: 4, purpose: 'write' }]); await assert.rejects(recovery.assertSiteMediaStorageJobsSettled(site.id, repositories), (error: any) => error.code === 'SITE_MEDIA_STORAGE_RECOVERY_PENDING');
      const pendingDenied = await siteDelete(); assert.equal(pendingDenied.status, 409); assert.equal((await pendingDenied.json()).error.code, 'SITE_MEDIA_STORAGE_RECOVERY_PENDING'); assert.equal(cascadeCalls, 0);
      deny = true; assert.equal((await siteDelete()).status, 403); deny = false; assert.equal(cascadeCalls, 0);
      await recovery.reconcileMediaStorageJob(site.id, job.id, repositories);
    });
    await test('operator actual helper sanitizes, validates and scopes', async () => {
      const admin = loadMediaFixture('../src/lib/mediaStorageRecoveryAdmin.ts', mocks);
      const job = await makeJob([{ path: path('admin'), bytes: 5, purpose: 'retire' }]);
      const url = `http://fixture.invalid/api/admin/sites/${site.slug}/media/storage-recovery`;
      const list = await admin.handleMediaStorageRecovery(new NextRequest(url), site.slug); const payload = await list.json(); assert.equal(list.status, 200); assert.equal(list.headers.get('cache-control'), 'no-store'); assert.ok(payload.data.jobs.some((item: any) => item.jobId === job.id)); assert.equal(JSON.stringify(payload).includes('/journal-proof/'), false); assert.equal(JSON.stringify(payload).includes('storageIdentity'), false);
      assert.equal((await admin.handleMediaStorageRecovery(new NextRequest(url + '?limit=101'), site.slug)).status, 400);
      assert.equal((await admin.handleMediaStorageRecovery(new NextRequest(url, { method: 'POST' }), other.slug, job.id)).status, 404);
      const before = queries; deny = true; assert.equal((await admin.handleMediaStorageRecovery(new NextRequest(url), site.slug)).status, 403); assert.equal(queries, before); deny = false;
      assert.equal((await admin.handleMediaStorageRecovery(new NextRequest(url, { method: 'POST', body: JSON.stringify({ paths: ['sites/foreign/private'] }) }), site.slug, job.id)).status, 200); assert.equal((await jobs.get(site.id, job.id)).state, 'settled');
    });
    await test('logical delete does not remove a path still referenced elsewhere', async () => {
      const second = (await repositories.media.create({ siteId: site.id, filename: 'shared.txt', originalName: 'shared.txt', mimeType: 'text/plain', type: 'document', size: bytes.length, url: live.url, metadata: { storagePath: path('live') } })).item;
      const job = await makeJob([{ path: path('live'), bytes: bytes.length, purpose: 'retire' }], { operation: 'delete', mediaId: live.id }); await repositories.media.delete(site.id, live.id); const result = await recovery.reconcileMediaStorageJob(site.id, job.id, repositories); assert.equal(result.protectedFiles, 1); assert.ok(await adapter.stat(path('live'))); await repositories.media.delete(site.id, second.id);
      const final = await makeJob([{ path: path('live'), bytes: bytes.length, purpose: 'retire' }], { operation: 'delete', mediaId: second.id }); assert.equal((await recovery.reconcileMediaStorageJob(site.id, final.id, repositories)).deletedFiles, 1);
    });
    if (!database) {
      await test('tail asset/version protects paths after 100', async () => {
        const tail = { id: 'tail', siteId: site.id, sizeBytes: 1, url: 'https://fixture.invalid/external', metadata: { generatedTransforms: { variants: [{ storagePath: path('tail-generated'), bytes: 3 }] } } };
        for (let index = 0; index < 205; index++) rows.push({ id: 'tail-asset-' + index, siteId: site.id, sizeBytes: 0, url: 'https://fixture.invalid/external', metadata: {} }); rows.push(tail);
        for (let index = 0; index < 205; index++) versions.push({ id: 'tail-version-' + index, siteId: site.id, mediaId: tail.id, sizeBytes: 0, url: 'https://fixture.invalid/external' }); versions.push({ id: 'protected-version', siteId: site.id, mediaId: tail.id, storagePath: path('tail-version'), sizeBytes: 4 });
        await adapter.upload(Buffer.from('aaa'), { path: path('tail-generated') }); await adapter.upload(Buffer.from('bbbb'), { path: path('tail-version') }); const job = await makeJob([{ path: path('tail-generated'), bytes: 3, purpose: 'retire' }, { path: path('tail-version'), bytes: 4, purpose: 'retire' }]); assert.equal((await recovery.reconcileMediaStorageJob(site.id, job.id, repositories)).protectedFiles, 2);
        const malformed = await makeJob([{ path: path('malformed-inventory'), bytes: 1, purpose: 'write' }]); tail.metadata.generatedTransforms.variants[0].storagePath = 'sites/other/private'; await assert.rejects(recovery.reconcileMediaStorageJob(site.id, malformed.id, repositories)); assert.equal((await jobs.get(site.id, malformed.id)).state, 'pending'); rows.length = 0; versions.length = 0; await recovery.reconcileMediaStorageJob(site.id, malformed.id, repositories);
      });
      await test('private demo journal survives new helper instance', async () => {
        const demo = source(), privateJobs = demo.mediaStorageJobRepository(null); const job = await privateJobs.create({ siteId: site.id, mediaId: null, operation: 'upload', requestId: 'proof', provider: 'local', storageIdentity: demo.currentMediaStorageIdentity().identity, files: [{ path: path('demo'), bytes: 1, purpose: 'write' }] });
        assert.equal((await source().mediaStorageJobRepository(null).get(site.id, job.id)).state, 'pending'); assert.ok(existsSync(join(scratch, 'data/backy/private-media-jobs'))); assert.equal(existsSync(join(scratch, 'uploads/data/backy/private-media-jobs')), false);
        assert.equal((await demo.reconcileMediaStorageJob(site.id, job.id, null)).status, 'settled');
        const blocked = join(scratch, 'blocked'); writeFileSync(blocked, 'file'); const brokenDemo = loadMediaFixture('../src/lib/mediaStorageRecovery.ts', mocks, { ...process, cwd: () => blocked }); let writes = 0; await assert.rejects(brokenDemo.withJournaledMediaStorageMutation({ siteId: site.id, mediaId: null, operation: 'upload', requestId: 'proof', files: [{ path: path('denied-demo'), bytes: 1, purpose: 'write' }] }, null, async () => { writes++; return NextResponse.json({ success: true, data: {} }); })); assert.equal(writes, 0);
      });
    }
    await recovery.assertSiteMediaStorageJobsSettled(site.id, repositories);
    return checks;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`Media storage recovery actual helper/operator/local-byte checks PASS: ${await runMediaStorageRecoveryProof()}; adapter journal fixture, not deployed provider/database proof.`);
}
