import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [];
const scope = { version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: 'site-example', permissions: ['sites.view', 'pages.edit'] }], expiresAt: null };
let status = 200;
const client = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site-example', fetch: async (input, init) => {
  calls.push({ url: new URL(input), init });
  return Response.json(status === 200 ? { success: true, requestId: 'grant-fixture', data: { userId: 'operator/a', scope, status: 'selected-sites', revision: 1, ownerManaged: true, completionWarnings: ['OPERATOR_SITE_GRANT_AUDIT_PENDING'] } } : { success: false, requestId: 'conflict-fixture', error: { code: 'OPERATOR_SITE_SCOPE_CONFLICT', message: 'Reload before saving' } }, { status });
} });
const options = { adminSession: 'synthetic-owner-session', credentials: 'include', requestId: 'grant-fixture' };
const loaded = await client.adminUserSiteGrants('operator/a', options);
assert.equal(loaded.data.scope.revision, 1);
const saved = await client.updateAdminUserSiteGrants('operator/a', { expectedRevision: 0, scope, requestId: 'input-request' }, options);
assert.deepEqual(saved.data.completionWarnings, ['OPERATOR_SITE_GRANT_AUDIT_PENDING']);
assert.equal(calls.length, 2);
for (const { url, init } of calls) {
  assert.equal(url.pathname, '/api/admin/users/operator%2Fa/site-grants');
  assert.equal(init.headers.get('x-backy-admin-session'), options.adminSession);
  assert.equal(init.headers.get('x-backy-admin-key'), null);
  assert.equal(init.headers.get('x-request-id'), 'grant-fixture');
  assert.equal(init.credentials, 'include');
}
assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.body, undefined);
assert.equal(calls[1].init.method, 'PATCH'); assert.deepEqual(JSON.parse(calls[1].init.body), { expectedRevision: 0, scope });
await client.updateAdminUserSiteGrants('operator/a', { expectedRevision: 1, scope: { ...scope, revision: 2, grants: [] }, requestId: 'input-request' }, { adminSession: options.adminSession });
assert.equal(calls.at(-1).init.headers.get('x-request-id'), 'input-request');
status = 409;
await assert.rejects(client.updateAdminUserSiteGrants('operator/a', { expectedRevision: 0, scope }, options), error => error instanceof BackyApiError && error.status === 409 && error.code === 'OPERATOR_SITE_SCOPE_CONFLICT');
assert.equal(calls.length, 4, 'Conflict must not automatically retry or overwrite');
console.log('SDK operator-site-grants transport passed: encoded global user route, owner session/cookie transport, exact revision body/request ID, revocation, typed409 with no automatic retry. Mock fetch; no live credentials.');
