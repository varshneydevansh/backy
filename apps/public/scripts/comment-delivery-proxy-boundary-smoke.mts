// Actual proxy and both Origin helpers; synthetic configuration, no network/handler/provider calls.
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';
const env = { BACKY_ADMIN_TRUSTED_ORIGINS: 'https://admin.fixture.invalid', BACKY_CORS_ALLOWED_ORIGINS: 'https://website.fixture.invalid,https://public.example.invalid', BACKY_REQUIRE_ADMIN_API_KEY: 'true', BACKY_ADMIN_API_KEY: 'synthetic-fixture-key' };
const fixtureProcess = { env };
const cookie = loadMediaFixture('../src/lib/admin-auth/cookieWriteOrigin.ts', {}, fixtureProcess);
const policy = loadMediaFixture('../src/lib/publicOriginPolicy.ts', {}, fixtureProcess);
let credentialChecks = 0;
const { proxy } = loadMediaFixture('../src/proxy.ts', {
  '@/lib/admin-auth/cookieWriteOrigin': cookie, '@/lib/publicOriginPolicy': policy,
  '@/lib/adminAccess': { requireAdminCredential: async () => { credentialChecks++; return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 }); } },
}, fixtureProcess);
const privatePaths = [
  '/api/sites/site-fixture/comments/delivery-attempts',
  '/api/sites/site-fixture/comments/delivery-attempts/',
  '/api/sites/site-fixture/comments/comment-fixture/delivery-attempts',
  '/api/sites/site-fixture/comments/comment-fixture/delivery-attempts/attempt-fixture',
  '/api/sites/site-fixture/comments/comment-fixture/delivery-attempts/attempt-fixture/reconciliation',
  '/api/sites/site-fixture/comments/comment%2Ffixture/delivery-attempts/attempt%2Ffixture/reconciliation/',
];
let checks = 0;
const request = (path: string, method: string, origin?: string, headers: Record<string, string> = {}) => new NextRequest(`https://backend.example.invalid${path}`, { method, headers: { ...headers, ...(origin ? { origin } : {}), 'x-request-id': 'delivery-boundary-fixture' } });
for (const path of privatePaths) for (const method of ['GET', 'OPTIONS', 'POST']) {
  // public.example.invalid is a same-site sibling of the requested backend.
  for (const origin of ['https://website.fixture.invalid', 'https://public.example.invalid', 'null', undefined]) {
    const response = await proxy(request(path, method, origin, { cookie: 'backy_admin_session=synthetic-cookie' }));
    assert.equal(response.headers.get('access-control-allow-origin'), null, `${method} ${path} public-only/null/absent Origin`);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-backy-cache-scope'), 'admin');
    assert.equal(response.status, method === 'OPTIONS' ? 204 : 200);
    checks += 5;
  }
  for (const origin of ['https://admin.fixture.invalid', 'https://backend.example.invalid']) {
    const response = await proxy(request(path, method, origin));
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-backy-request-id'), 'delivery-boundary-fixture');
    checks += 4;
  }
}
for (const path of [
  '/api/sites/site-fixture/manifest',
  '/api/sites/site-fixture/blog/post-fixture/comments',
  '/api/sites/site-fixture/pages/page-fixture/comments',
  '/api/sites/site-fixture/comments/report-reasons',
  '/api/sites/site-fixture/comments/delivery-attempts-public',
  '/api/sites/site-fixture/comments/comment-fixture/delivery-attempts/attempt-fixture/reconciliation/extra',
]) for (const method of ['GET', 'OPTIONS']) {
  const response = await proxy(request(path, method, 'https://public.example.invalid'));
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://public.example.invalid');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(response.headers.has('cache-control'), false);
  checks += 3;
}
// Header classification must not widen the proxy's existing credential-enforcement scope.
assert.equal(credentialChecks, 0); checks++;
const adminDenied = await proxy(request('/api/admin/settings', 'GET', 'https://admin.fixture.invalid'));
assert.equal(credentialChecks, 1); assert.equal(adminDenied.status, 401);
assert.equal(adminDenied.headers.get('cache-control'), 'private, no-store');
assert.equal(adminDenied.headers.get('access-control-allow-origin'), 'https://admin.fixture.invalid'); checks += 4;
const explicit = await proxy(request(privatePaths[0], 'GET', undefined, { authorization: 'Bearer synthetic-session' }));
assert.equal(explicit.headers.get('x-middleware-next'), '1'); assert.equal(credentialChecks, 1); assert.equal(explicit.headers.get('cache-control'), 'private, no-store'); checks += 3;
console.log(`Comment delivery proxy boundary PASS ${checks}: actual proxy/Origin helpers, exact list/individual/review paths, OPTIONS, private cache, approved admin/self origin, public-only same-site sibling/null/absent Origin denial, public preservation and unchanged auth scope. Browser/deployment proof separate.`);
