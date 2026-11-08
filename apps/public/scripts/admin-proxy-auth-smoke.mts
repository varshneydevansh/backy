import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fixture, load, networkCalls } from './admin-access-test-fixtures.mts';

// Execute the actual proxy, shared credential/access code, session persistence
// and handlers. Only repository/provider boundaries are fixtures. This does not
// stand in for a served Next deployment with its own environment configuration.
let checks = 0;
const scope = () => ({ version: 1, revision: 1, mode: 'selected-sites', siteIds: ['site-fixture'], permissions: ['sites.view'], expiresAt: null });
const request = (path: string, headers: Record<string, string> = {}, method = 'GET', body?: unknown) => new NextRequest(`http://fixture.invalid${path}`, {
  method, headers: { 'x-request-id': 'proxy-auth-fixture', origin: 'http://admin.fixture.invalid', 'content-type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const keyHeaders = (key: string) => ({ 'x-backy-admin-key': key });
async function denied(response: NextResponse, status: number, code: string) {
  assert.equal(response.status, status); assert.equal((await response.clone().json()).error.code, code);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://admin.fixture.invalid');
  assert.equal(response.headers.get('x-backy-request-id'), 'proxy-auth-fixture'); checks += 5;
}
for (const demo of [false, true]) {
  const env: Record<string, string | undefined> = { BACKY_ADMIN_TRUSTED_ORIGINS: 'http://admin.fixture.invalid', BACKY_REQUIRE_ADMIN_API_KEY: 'true', BACKY_ADMIN_API_KEY: 'synthetic-environment-primary', BACKY_ADMIN_SECRET_KEY: 'synthetic-environment-secondary' };
  const f = fixture({ demo, actorRole: 'owner', env });
  const sessions = load('../src/lib/admin-auth/sessionStore.ts', f.mocks, [], env);
  f.mocks['@/lib/admin-auth/sessionStore'] = sessions;
  f.mocks['@/lib/admin-auth/sessionCookie'] = load('../src/lib/admin-auth/sessionCookie.ts');
  const access = load('../src/lib/adminAccess.ts', f.mocks, [], env);
  f.mocks['@/lib/adminAccess'] = access;
  const { proxy } = load('../src/proxy.ts', {
    ...f.mocks, '@/lib/publicOriginPolicy': { isAllowedPublicOrigin: (origin: string) => ['http://admin.fixture.invalid', 'http://public.fixture.invalid'].includes(origin) },
  }, [], env);
  const sites = load('../src/app/api/admin/sites/route.ts', f.mocks);
  const settings = load('../src/app/api/admin/settings/route.ts', f.mocks);
  const owner = sessions.createAdminSessionForExternalUser(f.actor, 'supabase', f.settings().auth, { persist: false });
  f.settings().auth = sessions.upsertAdminSessionAuthRecord(f.settings().auth, owner);
  const ownerHeaders = { cookie: `backy_admin_session=${owner.token}` };
  async function through(path: string, headers: Record<string, string>, handler: any, method = 'GET', body?: unknown) {
    const req = request(path, headers, method, body);
    const gateway = await proxy(req);
    if (!gateway.headers.has('x-middleware-next')) return gateway;
    const result = await handler(req);
    // Next applies the proxy's private/CORS headers to the final response.
    for (const [name, value] of gateway.headers) if (!name.startsWith('x-middleware-')) result.headers.set(name, value);
    return result;
  }
  // Actual matched keys retain access; invalid key headers fall back to the
  // cookie and cannot exempt it. Both resolver entry points enforce the policy.
  const foreign = { ...ownerHeaders, origin: 'http://foreign.fixture.invalid' };
  for (const resolve of [access.requireAdminCredential, access.requireAdminAccess]) {
    const valid = await resolve(request('/api/admin/settings', { ...foreign, ...keyHeaders('synthetic-environment-primary') }, 'PATCH'), 'origin-fixture');
    assert.equal(valid.type, 'api-key'); checks++;
    const invalid = await resolve(request('/api/admin/settings', { ...foreign, ...keyHeaders('synthetic-invalid') }, 'PATCH'), 'origin-fixture');
    assert.equal(invalid.status, 403); assert.equal((await invalid.json()).error.code, 'ADMIN_COOKIE_ORIGIN_DENIED'); checks += 2;
    const explicit = await resolve(request('/api/admin/settings', { ...foreign, authorization: `Bearer ${owner.token}` }, 'PATCH'), 'origin-fixture');
    assert.equal(explicit.type, 'session'); checks++;
    const badExplicit = await resolve(request('/api/admin/settings', { ...foreign, authorization: 'Bearer synthetic-invalid' }, 'PATCH'), 'origin-fixture');
    assert.equal(badExplicit.status, 401); checks++;
  }
  const writesBeforeOriginDenial = f.effects.writes;
  const deniedWrite = await through('/api/admin/settings', foreign, settings.PATCH, 'PATCH', { auth: { inviteOnly: true } });
  assert.equal(deniedWrite.status, 403); assert.equal(f.effects.writes, writesBeforeOriginDenial); checks += 2;
  for (const path of ['/api/admin/auth/logout', '/api/admin/auth/session', '/api/admin/auth/login']) {
    const deniedAuth = await proxy(request(path, { ...foreign, ...keyHeaders('synthetic-environment-primary') }, 'POST'));
    assert.equal(deniedAuth.status, 403); assert.equal((await deniedAuth.json()).error.code, 'ADMIN_COOKIE_ORIGIN_DENIED');
    assert.equal(deniedAuth.headers.get('cache-control'), 'private, no-store');
    assert.equal(deniedAuth.headers.get('access-control-allow-origin'), null); checks += 4;
    for (const explicit of [{}, { ...foreign, 'x-backy-admin-session': owner.token }, { ...foreign, authorization: `Bearer ${owner.token}` }, ownerHeaders]) {
      assert.equal((await proxy(request(path, explicit, 'POST'))).headers.get('x-middleware-next'), '1'); checks++;
    }
  }
  // Public/customer CORS does not permit reading private session responses.
  for (const path of ['/api/admin/auth/session', '/api/admin/sites', '/api/admin/settings']) {
    for (const method of ['GET', 'OPTIONS']) {
      const publicOnly = await proxy(request(path, { ...ownerHeaders, origin: 'http://public.fixture.invalid' }, method));
      assert.equal(publicOnly.headers.get('access-control-allow-origin'), null);
      assert.equal(publicOnly.headers.get('access-control-allow-credentials'), null); checks += 2;
      const trustedAdmin = await proxy(request(path, ownerHeaders, method));
      assert.equal(trustedAdmin.headers.get('access-control-allow-origin'), 'http://admin.fixture.invalid'); checks++;
    }
  }
  const publicCors = await proxy(request('/api/sites/site-fixture/manifest', { origin: 'http://public.fixture.invalid' }));
  assert.equal(publicCors.headers.get('access-control-allow-origin'), 'http://public.fixture.invalid'); checks++;
  const issueReq = request('/api/admin/settings', ownerHeaders, 'POST', { action: 'issue-admin-api-key', label: 'Synthetic proxy fixture', scope: scope() });
  assert.equal((await proxy(issueReq)).headers.get('x-middleware-next'), '1'); checks++;
  const issue = await settings.POST(issueReq); assert.equal(issue.status, 200); checks++;
  const key = (await issue.json()).data.issuedKey.adminApiKey;
  assert.equal(f.settings().auth.apiKeyServiceKeys[0].keyHash, createHash('sha256').update(key).digest('hex')); checks++;
  const grant = () => f.settings().auth.apiKeyServiceKeys[0];
  const beforeTouch = grant().lastUsedAt;
  const admitted = await proxy(request('/api/admin/sites', keyHeaders(key)));
  assert.equal(admitted.headers.get('x-middleware-next'), '1');
  assert.equal(grant().lastUsedAt, beforeTouch); checks += 2;
  const listed = await through('/api/admin/sites', keyHeaders(key), sites.GET);
  assert.equal(listed.status, 200); const payload = await listed.json();
  assert.deepEqual(payload.data.sites.map((site: any) => site.id), ['site-fixture']);
  assert.equal(payload.data.pagination.total, 1); assert(grant().lastUsedAt); checks += 4;
  // Credential-only admission does not authorize global writes or owner rights.
  await denied(await through('/api/admin/settings', keyHeaders(key), settings.PATCH, 'PATCH', { auth: { inviteOnly: true } }), 403, 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  await denied(await through('/api/admin/settings', keyHeaders(key), settings.POST, 'POST', { action: 'issue-admin-api-key', label: 'Escalation', scope: scope() }), 403, 'FORBIDDEN_PERMISSION');
  const siteReq = request('/api/admin/sites/other-site/pages', keyHeaders(key));
  assert.equal((await proxy(siteReq)).headers.get('x-middleware-next'), '1'); checks++;
  const crossSite = await access.requireAdminAccess(siteReq, 'proxy-auth-fixture', { permission: 'sites.view' });
  assert(crossSite instanceof NextResponse); assert.equal(crossSite.status, 403); assert.equal((await crossSite.json()).error.code, 'FORBIDDEN_SITE_SCOPE'); checks += 2;
  // Fresh credentials and policies are resolved again in the actual handler.
  const raceRequest = request('/api/admin/sites', keyHeaders(key));
  assert.equal((await proxy(raceRequest)).headers.get('x-middleware-next'), '1');
  grant().revokedAt = new Date().toISOString();
  assert.equal((await sites.GET(raceRequest)).status, 401); checks += 2;
  await denied(await proxy(request('/api/admin/sites', keyHeaders(key))), 401, 'UNAUTHORIZED');
  grant().revokedAt = null;
  for (const bad of [{ ...scope(), expiresAt: '2000-01-01T00:00:00.000Z' }, { mode: 'selected-sites' }, null]) {
    grant().scope = bad;
    await denied(await proxy(request('/api/admin/sites', keyHeaders(key))), 403, 'SERVICE_KEY_SCOPE_INVALID');
  }
  grant().scope = scope();
  await denied(await proxy(request('/api/admin/sites', keyHeaders('synthetic-invalid'))), 401, 'UNAUTHORIZED');
  await denied(await proxy(request('/api/admin/sites')), 401, 'UNAUTHORIZED');
  for (const credential of [keyHeaders('synthetic-environment-primary'), { 'x-api-key': 'synthetic-environment-secondary' }, { authorization: 'Bearer fixture-service' }, { authorization: `Bearer ${key}` }]) {
    assert.equal((await proxy(request('/api/admin/sites', credential))).headers.get('x-middleware-next'), '1'); checks++;
  }
  // Legacy workspace records remain explicit; owner-only rights still denied.
  delete grant().scope;
  assert.equal((await proxy(request('/api/admin/settings', keyHeaders(key)))).headers.get('x-middleware-next'), '1'); checks++;
  await denied(await through('/api/admin/settings', keyHeaders(key), settings.POST, 'POST', { action: 'issue-admin-api-key' }), 403, 'FORBIDDEN_PERMISSION');
  const ownerGet = await through('/api/admin/settings', ownerHeaders, settings.GET);
  assert.equal(ownerGet.status, 200); checks++;
  for (const header of [{ 'x-backy-admin-session': owner.token }, { authorization: `Bearer ${owner.token}` }]) {
    assert.equal((await proxy(request('/api/admin/settings', header))).headers.get('x-middleware-next'), '1'); checks++;
  }
  // Resolve the current persisted user on every request, not the session's role.
  f.actor.status = 'suspended';
  await denied(await proxy(request('/api/admin/settings', ownerHeaders)), 401, 'UNAUTHORIZED');
  f.actor.status = 'active';
  assert.equal((await proxy(request('/api/admin/settings', ownerHeaders))).headers.get('x-middleware-next'), '1'); checks++;
  f.settings().auth = sessions.removeAdminSessionAuthRecord(f.settings().auth, owner.token).auth;
  sessions.revokeAdminSession(owner.token, { persist: false });
  await denied(await proxy(request('/api/admin/settings', ownerHeaders)), 401, 'UNAUTHORIZED');
  const viewer = sessions.createAdminSessionForExternalUser({ ...f.actor, id: 'target', role: 'viewer' }, 'supabase', f.settings().auth, { persist: false });
  f.settings().auth = sessions.upsertAdminSessionAuthRecord(f.settings().auth, viewer);
  const viewerReq = request('/api/admin/sites', { cookie: `backy_admin_session=${viewer.token}` });
  assert.equal((await proxy(viewerReq)).headers.get('x-middleware-next'), '1');
  assert.equal((await sites.GET(viewerReq)).status, 200); checks += 2;
  env.BACKY_ADMIN_API_KEY = ''; env.BACKY_ADMIN_SECRET_KEY = '';
  for (const headers of [keyHeaders(key), { cookie: `backy_admin_session=${viewer.token}` }]) {
    await denied(await proxy(request('/api/admin/settings', headers)), 503, 'ADMIN_API_KEY_NOT_CONFIGURED');
  }
  // Login/recovery remains available when protected API config is incomplete.
  assert.equal((await proxy(request('/api/admin/auth/session'))).headers.get('x-middleware-next'), '1'); checks++;
  assert.equal((await proxy(request('/api/admin/settings', {}, 'OPTIONS'))).status, 204); checks++;
  env.BACKY_REQUIRE_ADMIN_API_KEY = 'false';
  assert.equal((await proxy(request('/api/admin/auth/logout', { cookie: `backy_admin_session=${viewer.token}`, origin: 'null' }, 'POST'))).status, 403); checks++;
  assert.equal((await proxy(request('/api/admin/sites'))).headers.get('x-middleware-next'), '1');
  assert.equal((await through('/api/admin/sites', {}, sites.GET)).status, 401); checks += 2;
}
assert.equal(networkCalls, 0);
console.log(`Enforced admin proxy authentication: ${checks} checks passed. Actual proxy/auth/session/handlers; repository/provider fixtures; no live credentials.`);
