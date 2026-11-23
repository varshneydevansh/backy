import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';

const require = createRequire(import.meta.url);
const nextConfig = require('../next.config.js');
const { ImageOptimizerCache } = require('next/dist/server/image-optimizer');
assert.deepEqual(nextConfig.images.localPatterns, []);
for (const url of ['/api/sites/cache-fixture/media/cache-asset/file', '/api/sites/cache-fixture/media/cache-asset/file?token=signed-fixture', '/uploads/sites/cache-fixture/images/one.png']) {
  const verdict = ImageOptimizerCache.validateParams({ headers: {} }, { url, w: '16', q: '75' }, nextConfig, false);
  assert.equal(verdict.errorMessage, '"url" parameter is not allowed', 'Installed Next optimizer must reject local mutable media delivery');
}

// Actual delivery handlers, ETag checks, signatures and quarantine policy.
// Mutable repository state and storage reads are isolated memory fixtures.
let checks = 0;
for (const demo of [true, false]) {
  const site: any = { id: 'cache-fixture', slug: 'cache-fixture-slug', isPublished: true };
  let media: any = {
    id: 'cache-asset', siteId: site.id, filename: 'one.png', originalName: 'one.png',
    type: 'image', mimeType: 'image/png', visibility: 'public', sizeBytes: 3,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: { storagePath: `sites/${site.id}/images/one.png`, storageProvider: 'local', binaryFingerprint: { value: 'first' },
      generatedTransforms: { variants: [{ width: 16, quality: 75, mimeType: 'image/webp', format: 'webp', storagePath: `sites/${site.id}/generated/media/cache-asset/one.webp` }] } },
  };
  let deleted = false, storageReads = 0, admissionCacheChecks = 0, deliveryMutations = 0;
  const bytes = new Map([
    [`sites/${site.id}/images/one.png`, Buffer.from('one')],
    [`sites/${site.id}/generated/media/cache-asset/one.webp`, Buffer.from('variant-one')],
  ]);
  const signing = loadMediaFixture('../src/lib/mediaSigning.ts', {}, { env: { NODE_ENV: 'production', BACKY_MEDIA_SIGNING_SECRET: 'disposable-signing-fixture' } });
  const cache = loadMediaFixture('../src/lib/mediaDeliveryCache.ts', {});
  const readSite = (id: string) => id === site.id || id === site.slug ? structuredClone(site) : null;
  const readMedia = (siteId: string, id: string) => !deleted && siteId === site.id && id === media.id ? structuredClone(media) : null;
  const updateMedia = (siteId: string, id: string, input: any) => {
    assert.equal(siteId, site.id); assert.equal(id, media.id); deliveryMutations++;
    media = { ...media, ...input, metadata: { ...media.metadata, ...input.metadata }, updatedAt: new Date(Date.now() + deliveryMutations).toISOString() };
    return { item: structuredClone(media) };
  };
  const repositories = { sites: { getPublicationByIdOrSlug: async (id: string) => {const found=readSite(id);return found?{id:found.id,slug:found.slug,isPublished:found.isPublished}:null;}, getById: async (id: string) => readSite(id), getBySlug: async (id: string) => readSite(id) }, media: { getById: async (siteId: string, id: string) => readMedia(siteId, id), update: async (siteId: string, id: string, input: any) => updateMedia(siteId, id, input) } };
  const mocks = {
    '@/lib/backyStore': { getSiteByIdOrSlug: readSite, getMediaById: readMedia, updateMediaItem: updateMedia },
    '@/lib/repositorySitePublication':loadMediaFixture('../src/lib/repositorySitePublication.ts',{}),
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
    '@/lib/mediaByteDelivery': loadMediaFixture('../src/lib/mediaByteDelivery.ts', {}, process, { ReadableStream }),
    '@/lib/mediaDeliveryCache': { ...cache, mediaDeliveryCacheMetadata: (...args: any[]) => { admissionCacheChecks++; return cache.mediaDeliveryCacheMetadata(...args); } },
    '@/lib/mediaSafety': loadMediaFixture('../src/lib/mediaSafety.ts', {}),
    '@/lib/mediaStorage': { ...loadMediaFixture('../src/lib/mediaStorage.ts', {}), getMediaStorageAdapter: async () => ({ read: async (path: string) => { storageReads++; assert.ok(bytes.has(path)); return bytes.get(path); } }) },
    '@/lib/mediaSigning': signing,
    '@/lib/mediaResponsive': loadMediaFixture('../src/lib/mediaResponsive.ts', {}),
    '@/lib/publicContractResponse': loadMediaFixture('../src/lib/publicContractResponse.ts', {}),
  };
  (mocks as any)['@/lib/mediaDeliveryAnalytics'] = loadMediaFixture('../src/lib/mediaDeliveryAnalytics.ts', mocks);
  const file = loadMediaFixture('../src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts', mocks);
  const transform = loadMediaFixture('../src/app/api/sites/[siteId]/media/[mediaId]/transform/route.ts', mocks);
  const get = (kind: 'file' | 'transform', { etag, query = '', width = 16, quality = 75 }: { etag?: string; query?: string; width?: number; quality?: number } = {}) => {
    const search = kind === 'transform' ? `?width=${width}&quality=${quality}` + (query ? '&' + query : '') : query ? '?' + query : '';
    return (kind === 'file' ? file : transform).GET(new NextRequest(`https://fixture.invalid/api/sites/${site.slug}/media/${media.id}/${kind}${search}`, { headers: etag ? { 'if-none-match': etag } : {} }), { params: Promise.resolve({ siteId: site.slug, mediaId: media.id }) });
  };
  const noStore = (response: Response, allLayers = false) => {
    for (const name of ['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control']) {
      const value = response.headers.get(name);
      if (name === 'cache-control' || allLayers || value !== null) {
        assert.ok(value?.split(',').map(part => part.trim().toLowerCase()).includes('no-store'), `${name}: ${value}`);
        assert.doesNotMatch(value || '', /max-age|stale-while-revalidate|immutable/);
      }
    }
    checks++;
  };
  // Anonymous, unconditional public file and transform 200s may be held by Vercel's CDN only
  // (purged by site/media tag on admin mutation); browser and downstream CDN
  // layers stay no-store. Every other delivery below remains no-store everywhere.
  const vercelCdnOnly = (response: Response) => {
    for (const name of ['cache-control', 'cdn-cache-control']) {
      assert.ok(response.headers.get(name)?.split(',').map(part => part.trim().toLowerCase()).includes('no-store'), `${name}: ${response.headers.get(name)}`);
    }
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'max-age=86400, stale-while-revalidate=3600');
    assert.deepEqual(response.headers.get('vercel-cache-tag')?.split(','), ['backy-public', `backy-site-${site.id}`, `backy-media-${site.id}-${media.id}`]);
    assert.match(response.headers.get('vary') || '', /Authorization/);
    checks++;
  };
  const initialEtags: Record<string, string> = {};
  for (const kind of ['file', 'transform'] as const) {
    const response = await get(kind); assert.equal(response.status, 200);
    vercelCdnOnly(response); // file and transform 200s are both Vercel-CDN-only
    initialEtags[kind] = response.headers.get('etag')!; assert.ok(initialEtags[kind]);
    assert.equal(await response.text(), kind === 'file' ? 'one' : 'variant-one');
    const conditional = await get(kind, { etag: initialEtags[kind] });
    assert.equal(conditional.status, 304); noStore(conditional, true);
  }
  // Prepared variants may be regenerated without changing the original bytes.
  const oldVariantPath = media.metadata.generatedTransforms.variants[0].storagePath;
  const regeneratedPath = `sites/${site.id}/generated/media/cache-asset/regenerated.webp`;
  media.metadata.generatedTransforms.variants[0].storagePath = regeneratedPath;
  bytes.set(regeneratedPath, Buffer.from('variant-regenerated'));
  const regenerated = await get('transform', { etag: initialEtags.transform });
  assert.equal(regenerated.status, 200); noStore(regenerated, true);
  assert.notEqual(regenerated.headers.get('etag'), initialEtags.transform);
  assert.equal(await regenerated.text(), 'variant-regenerated');
  const originalUnchanged = await get('file', { etag: initialEtags.file });
  assert.equal(originalUnchanged.status, 304); noStore(originalUnchanged, true);
  media.metadata.generatedTransforms.variants[0].storagePath = oldVariantPath;
  const denied = async (kind: 'file' | 'transform', expected: number, query = '') => {
    for (const etag of [initialEtags[kind], '*']) {
      const reads = storageReads, cacheChecks = admissionCacheChecks;
      const response = await get(kind, { etag, query });
      assert.equal(response.status, expected); noStore(response);
      assert.equal(storageReads, reads); assert.equal(admissionCacheChecks, cacheChecks, 'Current admission must reject before conditional cache evaluation');
    }
  };
  media.visibility = 'private';
  await denied('file', 403); await denied('transform', 404);
  const signed = signing.createSignedMediaAccess({ siteId: site.id, mediaId: media.id });
  const signedQuery = new URLSearchParams({ token: signed.token, expiresAt: String(signed.expiresAt), disposition: signed.disposition }).toString();
  const privateResponse = await get('file', { query: signedQuery });
  assert.equal(privateResponse.status, 200); noStore(privateResponse, true); assert.match(privateResponse.headers.get('cache-control')!, /private/);
  const privateEtag = privateResponse.headers.get('etag')!;
  const privateConditional = await get('file', { etag: privateEtag, query: signedQuery });
  assert.equal(privateConditional.status, 304); noStore(privateConditional, true);
  await denied('file', 403, signedQuery.replace(signed.token, 'invalid-signature'));
  await denied('file', 403, new URLSearchParams({ token: signed.token, expiresAt: '1', disposition: signed.disposition }).toString());
  media.metadata.mediaSecurity = { status: 'quarantined' };
  await denied('file', 423, signedQuery);
  media.visibility = 'public'; await denied('transform', 423);
  delete media.metadata.mediaSecurity;
  deleted = true; await denied('file', 404); await denied('transform', 404); deleted = false;
  site.isPublished = false; await denied('file', 404); await denied('transform', 404); site.isPublished = true;
  media.filename = 'two.png'; media.originalName = 'two.png';
  media.updatedAt = '2026-01-02T00:00:00.000Z';
  media.metadata.binaryFingerprint = { value: 'second' };
  media.metadata.storagePath = `sites/${site.id}/images/two.png`;
  media.metadata.generatedTransforms.variants[0].storagePath = `sites/${site.id}/generated/media/cache-asset/two.webp`;
  bytes.set(media.metadata.storagePath, Buffer.from('two'));
  bytes.set(media.metadata.generatedTransforms.variants[0].storagePath, Buffer.from('variant-two'));
  for (const kind of ['file', 'transform'] as const) {
    const replacement = await get(kind, { etag: initialEtags[kind] });
    assert.equal(replacement.status, 200); noStore(replacement, true);
    assert.notEqual(replacement.headers.get('etag'), initialEtags[kind]);
    assert.equal(await replacement.text(), kind === 'file' ? 'two' : 'variant-two');
  }
  // Unprepared images must stay in the guarded handler, with actual Sharp WebP
  // conversion and requested width/quality rather than an optimizer redirect.
  media.metadata.generatedTransforms = null;
  const original = await sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 83, g: 144, b: 193 } } }).png().toBuffer();
  bytes.set(media.metadata.storagePath, original);
  for (const [width, quality] of [[16, 40], [32, 90], [128, 75]]) {
    const fallback = await get('transform', { width, quality });
    assert.equal(fallback.status, 200); vercelCdnOnly(fallback);
    assert.equal(fallback.headers.get('location'), null);
    assert.equal(fallback.headers.get('content-type'), 'image/webp');
    const output = Buffer.from(await fallback.arrayBuffer()), metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, Math.min(width, 64));
    assert.equal(metadata.height, Math.min(width, 64) / 2);
    assert.equal(fallback.headers.get('content-length'), String(output.length));
    const expected = await sharp(original, { limitInputPixels: 32_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
    assert.deepEqual(output, expected, 'Handler must pass requested width and quality through to the real codec');
  }
  assert.ok(deliveryMutations > 0, 'Actual analytics must mutate repository/demo timestamps in this fixture');
  media.visibility = 'private'; await denied('transform', 404);
  media.visibility = 'public'; media.metadata.mediaSecurity = { status: 'quarantined' }; await denied('transform', 423);
}
console.log(`Media delivery cache/admission: ${checks} actual handler checks passed; actual analytics with timestamp-mutating memory repositories/storage, no backend/provider mutation.`);
