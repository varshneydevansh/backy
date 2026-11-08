import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';

// Vercel-only CDN TTLs for anonymous public reads. The browser-facing
// Cache-Control contract that custom frontends verify must not change.
const contract = loadMediaFixture('../src/lib/publicContractResponse.ts', {});
let checks = 0;
const siteId = 'cdn-site';
const read = (cache: string, init: { headers?: Record<string, string>; query?: string; method?: string; status?: number; siteId?: string | null } = {}) => contract.publicContractJson(
  { success: true, data: { ok: true } },
  {
    requestId: 'req_fixture',
    cache,
    status: init.status,
    siteId: init.siteId === null ? undefined : (init.siteId || siteId),
    request: new Request(`https://backy.invalid/api/sites/${siteId}/render?path=/${init.query ? '&' + init.query : ''}`, { method: init.method || 'GET', headers: init.headers }),
  },
);

for (const [cache, browser, cdn] of [
  ['render', 'public, no-cache, must-revalidate', 'max-age=60, stale-while-revalidate=600'],
  ['discovery', 'public, max-age=60, stale-while-revalidate=300', 'max-age=300, stale-while-revalidate=3600'],
] as const) {
  const anonymous = read(cache);
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.headers.get('cache-control'), browser, `${cache} browser header must stay unchanged`);
  assert.equal(anonymous.headers.get('cdn-cache-control'), null, 'downstream CDNs keep the browser contract');
  assert.equal(anonymous.headers.get('vercel-cdn-cache-control'), cdn);
  assert.deepEqual(anonymous.headers.get('vercel-cache-tag')?.split(','), ['backy-public', `backy-site-${siteId}`]);
  assert.equal(anonymous.headers.get('vary'), 'Accept, Origin, Authorization, X-Backy-Admin-Key, X-Backy-Admin-Session, X-Api-Key');
  checks += 6;

  const ineligible: Array<[string, Parameters<typeof read>[1]]> = [
    ['bearer', { headers: { authorization: 'Bearer secret' } }],
    ['cookie', { headers: { cookie: 'backy_admin_session=1' } }],
    ['admin key', { headers: { 'x-backy-admin-key': 'k' } }],
    ['api key', { headers: { 'x-api-key': 'k' } }],
    ['admin session', { headers: { 'x-backy-admin-session': 's' } }],
    ['preview token', { query: 'previewToken=t' }],
    ['signed token', { query: 'token=t&expiresAt=1' }],
    ['post', { method: 'POST' }],
    ['not found', { status: 404 }],
    ['no site', { siteId: null }],
  ];
  for (const [label, init] of ineligible) {
    const response = read(cache, init);
    assert.equal(response.headers.get('cache-control'), browser, `${cache}/${label} browser header unchanged`);
    assert.notEqual(response.headers.get('vercel-cdn-cache-control')?.includes('max-age'), true, `${cache}/${label} must not get a CDN TTL`);
    assert.equal(response.headers.get('vercel-cache-tag'), null, `${cache}/${label} must not be tagged`);
    checks += 3;
  }

  const conditional = read(cache, { headers: { 'if-none-match': anonymous.headers.get('etag')! } });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get('vercel-cache-tag'), null);
  checks += 2;
}

for (const cache of ['private', 'error'] as const) {
  const response = read(cache);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cache-tag'), null);
  checks += 3;
}

// A route-level no-store override (e.g. withdrawn content) is never promoted.
const overridden = contract.publicContractJson({ success: true }, {
  requestId: 'req_fixture', cache: 'render', siteId,
  request: new Request(`https://backy.invalid/api/sites/${siteId}/render`),
  headers: { 'cache-control': 'no-store' },
});
assert.equal(overridden.headers.get('vercel-cache-tag'), null);
assert.notEqual(overridden.headers.get('vercel-cdn-cache-control')?.includes('max-age'), true);
checks += 2;

// Purge is a safe no-op outside Vercel and never throws.
await contract.purgePublicCdnCache({ siteId, reason: 'fixture' });
assert.equal(contract.publicCdnSiteTag('a,b c'), 'backy-site-a_b_c');
checks += 1;

// The proxy must not run for credential-free public reads without Origin,
// otherwise every CDN hit still costs a function invocation.
const proxySource = readFileSync(fileURLToPath(new URL('../src/proxy.ts', import.meta.url)), 'utf8');
const matcherBlock = proxySource.slice(proxySource.indexOf('export const config'));
assert.doesNotMatch(matcherBlock, /^\s*'\/api\/:path\*',?$/m, 'Unconditional /api/:path* matcher re-introduced');
assert.match(matcherBlock, /\{ source: '\/api\/:path\*', has: \[\{ type: 'header', key: 'origin' \}\] \}/);
for (const required of ["'/api/admin/:path*'", "'/uploads/:path*'", "'/sites/:path*'", 'delivery-attempts']) {
  assert.ok(matcherBlock.includes(required), `proxy matcher must still cover ${required}`);
}
checks += 6;

console.log(`Public CDN cache policy: ${checks} checks passed.`);
