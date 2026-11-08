import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { load, networkCalls } from './admin-access-test-fixtures.mts';
import { assertMediaBody, assertMediaSchema } from './admin-media-contract.mjs';

// Actual config resolvers/helper/GET, with isolated synthetic env and repositories.
// No settings permission, uploads, storage adapters, provider probes or live DB.
const env: Record<string, string | undefined> = {};
const scanner = load('../src/lib/mediaSafety.ts', {}, [], env);
const storage = load('../src/lib/mediaStorage.ts', {}, [], env);
const readiness = load('../src/lib/mediaUploadReadiness.ts', {
  '@/lib/mediaSafety': scanner, '@/lib/mediaStorage': storage,
}, [], env);
let checks = 0;
const storageFixture = {
  NODE_ENV: 'production', BACKY_STORAGE_PROVIDER: 's3',
  BACKY_S3_BUCKET: 'private-readiness-bucket', BACKY_S3_REGION: 'private-readiness-region',
  BACKY_S3_ACCESS_KEY_ID: 'private-readiness-access', BACKY_S3_SECRET_ACCESS_KEY: 'private-readiness-secret',
  BACKY_S3_ENDPOINT: 'https://private-readiness-storage.invalid', BACKY_S3_PUBLIC_URL: 'https://private-readiness-delivery.invalid',
};
function reset(values: Record<string, string | undefined> = {}) {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, storageFixture, values);
}
function safe(value: any) {
  assert.deepEqual(Object.keys(value).sort(), ['blockingReasons', 'evidence', 'schemaVersion', 'state']);
  assert.equal(value.schemaVersion, 'backy.media-upload-readiness.v1');
  assert.equal(value.evidence, 'configuration-only');
  assert.equal(value.state, value.blockingReasons.length ? 'blocked' : 'admissible');
  for (const reason of value.blockingReasons) {
    assert.deepEqual(Object.keys(reason).sort(), ['code', 'message']);
    assert.match(reason.message, /Ask a site owner/);
    assert.match(reason.message, /still use existing media/);
  }
  assert.equal(JSON.stringify(value).includes('private-readiness'), false, 'Never leak fixture hosts, bucket, path, provider errors or credentials');
  assertMediaSchema('AdminMediaUploadReadiness', value);
  checks++;
}
const input = { buffer: Buffer.from('fixture-safe-image'), originalName: 'fixture.png', mimeType: 'image/png', mediaType: 'image' };
for (const provider of [undefined, 'none', 'off', 'disabled']) {
  reset({ BACKY_MEDIA_SCAN_PROVIDER: provider, BACKY_MEDIA_SCAN_FAIL_OPEN: 'true' });
  const value = readiness.getMediaUploadReadiness(); safe(value);
  assert.deepEqual(Array.from(value.blockingReasons, (r: any) => r.code), ['MEDIA_SCANNER_REQUIRED']); checks++;
  await assert.rejects(scanner.scanMediaUploadWithProviders(input), (error: any) => error.details.reason === 'production-media-scanner-required'); checks++;
}
for (const scenario of [
  { NODE_ENV: 'development' },
  { BACKY_ALLOW_PRODUCTION_MEDIA_SCAN_DISABLED: 'true' },
  { BACKY_MEDIA_SCAN_PROVIDER: 'http', BACKY_MEDIA_SCAN_FAIL_OPEN: 'true' },
  { BACKY_MEDIA_SCANNER_PROVIDER: 'http', BACKY_MEDIA_SCANNER_FAIL_OPEN: 'true' },
]) {
  reset(scenario);
  const value = readiness.getMediaUploadReadiness(); safe(value);
  assert.equal(value.state, 'admissible'); checks++;
  assert.equal((await scanner.scanMediaUploadWithProviders(input)).status, 'clean'); checks++;
}
for (const failOpen of [undefined, 'false']) {
  reset({ BACKY_MEDIA_SCAN_PROVIDER: 'http', BACKY_MEDIA_SCAN_FAIL_OPEN: failOpen });
  const value = readiness.getMediaUploadReadiness(); safe(value);
  assert.deepEqual(Array.from(value.blockingReasons, (r: any) => r.code), ['MEDIA_SCANNER_ENDPOINT_REQUIRED']); checks++;
  await assert.rejects(scanner.scanMediaUploadWithProviders(input), (error: any) => error.details.reason === 'missing-scanner-endpoint'); checks++;
}
for (const scenario of [
  { BACKY_MEDIA_SCAN_PROVIDER: 'http', BACKY_MEDIA_SCAN_ENDPOINT: 'https://private-readiness-scan.invalid', BACKY_MEDIA_SCAN_API_KEY: 'private-readiness-token' },
  { BACKY_MEDIA_SCANNER_PROVIDER: 'http', BACKY_MEDIA_SCANNER_ENDPOINT: 'https://private-readiness-scan.invalid', BACKY_MEDIA_SCANNER_API_KEY: 'private-readiness-token' },
  { BACKY_MEDIA_SCAN_PROVIDER: 'clamav', BACKY_MEDIA_SCAN_HOST: 'private-readiness-clamav.invalid', BACKY_MEDIA_SCAN_PORT: '3320' },
  { BACKY_MEDIA_SCAN_PROVIDER: 'clamd' },
]) {
  reset(scenario);
  const value = readiness.getMediaUploadReadiness(); safe(value);
  assert.equal(value.state, 'admissible'); checks++;
}
reset({ BACKY_MEDIA_SCAN_PROVIDER: 'private-readiness-invalid-provider', BACKY_MEDIA_SCAN_FAIL_OPEN: 'true' });
let value = readiness.getMediaUploadReadiness(); safe(value);
assert.deepEqual(Array.from(value.blockingReasons, (r: any) => r.code), ['MEDIA_SCANNER_UNSUPPORTED']); checks++;
for (const scenario of [
  { BACKY_STORAGE_PROVIDER: 's3', BACKY_S3_SECRET_ACCESS_KEY: undefined },
  { BACKY_STORAGE_PROVIDER: 'supabase' },
  { BACKY_STORAGE_PROVIDER: 'private-readiness-invalid-provider' },
  { BACKY_STORAGE_PROVIDER: 'local', VERCEL: '1', BACKY_LOCAL_UPLOADS_DIR: '/private-readiness-upload-path' },
]) {
  reset({ ...scenario, BACKY_MEDIA_SCAN_PROVIDER: 'http', BACKY_MEDIA_SCAN_FAIL_OPEN: 'true' });
  value = readiness.getMediaUploadReadiness(); safe(value);
  assert.deepEqual(Array.from(value.blockingReasons, (r: any) => r.code), ['MEDIA_STORAGE_NOT_CONFIGURED']); checks++;
}
reset({ BACKY_S3_SECRET_ACCESS_KEY: undefined });
value = readiness.getMediaUploadReadiness(); safe(value);
assert.deepEqual(Array.from(value.blockingReasons, (r: any) => r.code), ['MEDIA_STORAGE_NOT_CONFIGURED', 'MEDIA_SCANNER_REQUIRED']); checks++;
const faultReadiness = load('../src/lib/mediaUploadReadiness.ts', {
  '@/lib/mediaSafety': { ...scanner, resolveMediaScannerConfig() { throw new Error('private-readiness-scanner-host-and-token'); } },
  '@/lib/mediaStorage': { getMediaStorageConfigSummary() { throw new Error('private-readiness-storage-path-and-secret'); } },
});
value = faultReadiness.getMediaUploadReadiness(); safe(value);
assert.deepEqual(Array.from(value.blockingReasons, (r: any) => r.code), ['MEDIA_UPLOAD_CONFIGURATION_INVALID', 'MEDIA_UPLOAD_CONFIGURATION_INVALID']); checks++;

const site = { id: 'site-readiness-fixture', slug: 'readiness-fixture', settings: {} };
const scope = load('../src/lib/mediaScope.ts');
const pagination = load('../src/lib/collectionExportPagination.ts');
const inventory = load('../src/lib/mediaInventory.ts', { './collectionExportPagination': pagination });
const responsive = load('../src/lib/mediaResponsive.ts');
const organization = load('../src/lib/publicMediaResource.ts', { '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive });
const emptyMediaPage = (input: any) => ({ items: [], pagination: { total: 0, limit: input.limit, offset: input.offset, hasMore: false } });
for (const demo of [true, false]) {
  let denied = false, siteMissing = false, projections = 0, settingsPermissionCalls = 0;
  const readSite = (id: string) => !siteMissing && (id === site.id || id === site.slug) ? site : null;
  const mocks = {
    '@/lib/adminAccess': { requireAdminAccess: async (_request: unknown, _requestId: string, options: any) => {
      if (options.permission === 'settings.view') settingsPermissionCalls++;
      assert.equal(options.permission, 'media.view');
      return denied ? NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 }) : { session: { user: { id: 'scoped-media-author' } } };
    } },
    '@/lib/mediaUploadReadiness': { getMediaUploadReadiness: (context: any) => { projections++; return readiness.getMediaUploadReadiness(context); } },
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => ({ sites: { getById: async (id: string) => readSite(id), getBySlug: async (id: string) => readSite(id) }, media: { list: async (input: any) => emptyMediaPage(input), listFolders: async () => [] }, settings: { get: async () => ({}) } }) },
    '@/lib/backyStore': { getSiteByIdOrSlug: readSite, getAdminSettings: () => ({}), listMediaFolders: () => [], getMediaList: (_id: string, input: any) => ({ media: [], pagination: emptyMediaPage(input).pagination }) },
    '@/lib/mediaScope': scope,
    '@/lib/mediaResponsive': responsive,
    '@/lib/publicMediaResource': organization,
    '@/lib/mediaInventory': inventory,
    '@/lib/mediaUploadPolicy': { resolveMediaUploadPolicy: () => ({ quotaBytes: 1024 }), mediaQuotaPayload: (limitBytes: number, usedBytes: number) => ({ limitBytes, usedBytes, remainingBytes: limitBytes - usedBytes }) },
    '@/lib/mediaStorageRecovery': { mediaStorageUsageWithPending: async () => 0, mediaStorageRecoveryErrorResponse: () => null },
  };
  const route = load('../src/app/api/admin/sites/[siteId]/media/route.ts', mocks);
  const get = () => route.GET(new NextRequest(`https://backend.fixture.invalid/api/admin/sites/${site.slug}/media`), { params: Promise.resolve({ siteId: site.slug }) });
  for (const configured of [false, true]) {
    reset(configured ? { BACKY_MEDIA_SCAN_PROVIDER: 'clamav' } : {});
    const response = await get(); assert.equal(response.status, 200);
    const payload = await response.json(); safe(payload.data.uploadReadiness);
    assertMediaBody('', 'GET', 200, payload);
    assert.equal(payload.data.uploadReadiness.state, configured ? 'admissible' : 'blocked');
    assert.deepEqual(payload.data.media, []);
    assert.equal(payload.data.quota.limitBytes, 1024);
    assert.equal(payload.data.pagination.total, 0);
    assert.equal(settingsPermissionCalls, 0); checks++;
  }
  const before = projections;
  denied = true; assert.equal((await get()).status, 403); assert.equal(projections, before); checks++;
  denied = false; siteMissing = true; assert.equal((await get()).status, 404); assert.equal(projections, before); checks++;
}
assert.throws(() => assertMediaSchema('AdminMediaUploadReadiness', { ...value, endpoint: 'https://private-readiness-scanner.invalid' })); checks++;
assert.throws(() => assertMediaSchema('AdminMediaUploadReadiness', { ...value, blockingReasons: [{ code: 'MEDIA_SCANNER_REQUIRED', message: 'Fixed action', host: 'private-readiness-host' }] })); checks++;
assert.throws(() => assertMediaSchema('AdminMediaUploadReadiness', { ...value, state: 'provider-verified' })); checks++;
assert.equal(networkCalls, 0); checks++;
console.log(`Media upload readiness: ${checks} actual resolver/helper/GET checks passed; synthetic config/adapters, zero provider calls.`);
