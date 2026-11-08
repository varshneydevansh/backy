import assert from 'node:assert/strict';
import { assertOperatorGrantBody } from './admin-operator-site-grants-contract.mts';
import { NextRequest, NextResponse } from 'next/server';
import { fixture, load, networkCalls, operatorScopes } from './admin-access-test-fixtures.mts';

let checks = 0;
const policy = (revision = 1, grants = [{ siteId: 'site-fixture', permissions: ['sites.view', 'pages.view', 'pages.edit'] }]) => ({ version: 1, revision, mode: 'selected-sites', grants, expiresAt: null });
const request = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`http://fixture.invalid/api/admin/${path}`, { method, headers: { 'content-type': 'application/json', 'x-request-id': 'operator-scope-fixture', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function denial(value: any, status: number, code?: string) {
  assert(value instanceof NextResponse); assert.equal(value.status, status);
  assertOperatorGrantBody('patch', status, await value.clone().json());
  if (code) assert.equal((await value.clone().json()).error.code, code);
  checks++;
}
for (const demo of [false, true]) {
  const f = fixture({ demo, actorRole: 'owner', targetRole: 'admin' });
  const route = load('../src/app/api/admin/users/[userId]/site-grants/route.ts', f.mocks);
  const targetContext = { params: Promise.resolve({ userId: 'target' }) };
  const ownerSession = { token: 'fixture-session', user: f.actor };
  const operatorSession = { token: 'same-operator-session', user: f.target };
  const setActor = (session: any) => { f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence = async () => session; };
  async function save(scope: any, expectedRevision: number, confirmWorkspace = false) {
    setActor(ownerSession);
    return route.PATCH(request('users/target/site-grants', 'PATCH', { scope, expectedRevision, confirmWorkspace }), targetContext);
  }
  // Two owner handlers read revision zero before the commit boundary. Only one
  // may commit; the stale handler must report409 and emit no second audit event.
  const raceFixture = fixture({ demo, actorRole: 'owner', targetRole: 'admin' });
  const raceRoute = load('../src/app/api/admin/users/[userId]/site-grants/route.ts', raceFixture.mocks);
  const raced = await Promise.all([
    raceRoute.PATCH(request('users/target/site-grants', 'PATCH', { scope: policy(), expectedRevision: 0 }), targetContext),
    raceRoute.PATCH(request('users/target/site-grants', 'PATCH', { scope: policy(1, []), expectedRevision: 0 }), targetContext),
  ]);
  assert.deepEqual(raced.map(response => response.status).sort(), [200, 409]);
  for (const response of raced) assertOperatorGrantBody('patch', response.status, await response.clone().json());
  const rejected = raced.find(response => response.status === 409)!;
  assert.equal((await rejected.json()).error.code, 'OPERATOR_SITE_SCOPE_CONFLICT');
  assert.equal(raceFixture.effects.audits, 1); assert.equal(raceFixture.effects.writes, 1); checks += 4;
  const originalGet = await route.GET(request('users/target/site-grants'), targetContext);
  assertOperatorGrantBody('get', originalGet.status, await originalGet.clone().json());
  assert.equal(originalGet.status, 200); assert.equal((await originalGet.json()).data.status, 'legacy-workspace'); checks++;
  for (const bad of [null, {}, { ...policy(), revision: 0 }, { ...policy(), revision: 1e20 }, { ...policy(), mode: { toString: null } }, { ...policy(), grants: [{ siteId: 'site-fixture', permissions: ['users.manage'] }] }, { ...policy(), grants: [{ siteId: 'site-fixture', permissions: ['settings.manageKeys'] }] }, { ...policy(), grants: Array.from({ length: 51 }, (_, i) => ({ siteId: `site-${i}`, permissions: [] })) }, { ...policy(), grants: [policy().grants[0], policy().grants[0]] }, { ...policy(), expiresAt: '2000-01-01T00:00:00.000Z' }]) {
    const writes = f.effects.writes;
    await denial(await save(bad, 0), 400, 'INVALID_OPERATOR_SITE_SCOPE'); assert.equal(f.effects.writes, writes);
  }
  for (const siteId of ['fixture', 'absent']) await denial(await save(policy(1, [{ siteId, permissions: ['sites.view'] }]), 0), 400, 'INVALID_OPERATOR_SITE_ID');
  const workspace = { ...policy(), mode: 'workspace', grants: [] };
  await denial(await save(workspace, 0), 400, 'WORKSPACE_SCOPE_CONFIRMATION_REQUIRED');
  await denial(await save(policy(), 99), 409, 'OPERATOR_SITE_SCOPE_CONFLICT');
  setActor(operatorSession);
  await denial(await route.PATCH(request('users/target/site-grants', 'PATCH', { scope: policy(), expectedRevision: 0 }), targetContext), 403, 'OWNER_SESSION_REQUIRED');
  await denial(await route.GET(request('users/target/site-grants'), targetContext), 403, 'OWNER_SESSION_REQUIRED');
  setActor(ownerSession);
  await denial(await route.PATCH(request('users/target/site-grants', 'PATCH', { scope: policy(), expectedRevision: 0 }, { 'x-backy-admin-key': 'fixture-service' }), targetContext), 403, 'OWNER_SESSION_REQUIRED');
  await denial(await route.PATCH(request('users/actor/site-grants', 'PATCH', { scope: policy(), expectedRevision: 0 }), { params: Promise.resolve({ userId: 'actor' }) }), 403, 'OWNER_SCOPE_IMMUTABLE');
  const storedCredential = { id: 'untouched-service', keyHash: 'synthetic-hash', scope: { mode: 'workspace' } };
  f.settings().auth.apiKeyServiceKeys = [storedCredential];
  const saved = await save(policy(), 0); assert.equal(saved.status, 200); assertOperatorGrantBody('patch', saved.status, await saved.clone().json()); const result = (await saved.json()).data;
  assert.equal(result.status, 'selected-sites'); assert.equal(result.revision, 1);
  assert.equal(f.settings().auth.userSiteGrants[0].updatedById, 'actor'); assert.equal(f.effects.audits, 1);
  assert.deepEqual(f.settings().auth.apiKeyServiceKeys, [storedCredential]); checks += 5;
  await denial(await save(policy(), 0), 409, 'OPERATOR_SITE_SCOPE_CONFLICT');
  // JSON storage/reopen uses the exact same root policy contract.
  f.settings().auth = JSON.parse(JSON.stringify(f.settings().auth));
  setActor(operatorSession);
  const authorize = (path: string, permission?: string, method = 'GET') => f.access.requireAdminAccess(request(path, method), 'operator-scope-fixture', permission ? { permission } : { roles: ['owner', 'admin', 'editor', 'viewer'] });
  for (const path of ['sites/site-fixture/pages', 'sites/fixture/pages']) {
    const allowed = await authorize(path, 'pages.edit'); assert.equal(allowed.type, 'session'); assert.equal(allowed.operatorSiteScope.revision, 1); checks++;
  }
  await denial(await authorize('sites/other-site/pages', 'pages.view'), 403, 'FORBIDDEN_SITE_SCOPE');
  await denial(await authorize('sites/site-fixture/pages', 'pages.publish'), 403, 'FORBIDDEN_OPERATOR_SITE_PERMISSION');
  await denial(await authorize('sites/site-fixture/new-module', 'pages.edit'), 403, 'FORBIDDEN_OPERATOR_SITE_ROUTE');
  await denial(await authorize('sites/site-fixture/pages'), 403, 'FORBIDDEN_OPERATOR_SITE_ROUTE');
  for (const [path, permission] of [['settings', 'settings.configure'], ['users', 'users.manage'], ['teams', 'users.manage'], ['audit-logs', 'activity.export'], ['sites', 'sites.create']]) await denial(await authorize(path, permission, 'POST'), 403, 'FORBIDDEN_OPERATOR_SITE_ROUTE');
  let page = { id: 'page-fixture', siteId: f.site.id, title: 'Original', slug: 'original', status: 'draft', isHomepage: false, content: { version: 1, elements: [], metadata: {}, canvasSize: { width: 1200, height: 800 } }, meta: {}, updatedAt: '2026-01-01T00:00:00.000Z' };
  let pageWrites = 0;
  const editPage = (_siteId: string, _id: string, patch: Record<string, unknown>) => { pageWrites++; page = { ...page, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) }; return page; };
  Object.assign(f.repositories, {
    pages: { getById: async (siteId: string) => siteId === page.siteId ? page : null, update: async (siteId: string, id: string, patch: any) => ({ item: editPage(siteId, id, patch) }) },
    collections: { list: async () => ({ items: [] }) },
    contentWorkflows: { createRevision: async () => ({}) },
  });
  Object.assign(f.mocks['@/lib/backyStore'], { getAdminPageById: (siteId: string) => siteId === page.siteId ? page : null, getPageByPath: () => null, listCollections: () => [], updateAdminPage: editPage });
  Object.assign(f.mocks, {
    '@/lib/adminContentStatusPolicy': load('../src/lib/adminContentStatusPolicy.ts'),
    '@/lib/frontendDesignContract': { normalizeInputFromDirectFrontendDesignEnvelope: (input: unknown) => input },
    '@/lib/routeConflicts': { findPageRouteConflict: () => null },
    '@/lib/repositoryContentWorkflow': { pageRevisionSnapshot: (input: unknown) => input },
    '@/lib/siteReadiness': { buildRepositoryPageReadiness: () => ({}), buildPageReadiness: () => ({}), readinessBlockingChecks: () => [] },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
  });
  const pageRoute = load('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts', f.mocks);
  for (const [siteId, body, expected] of [['other-site', { title: 'Denied' }, 403], ['site-fixture', { title: 'Scoped operator edit' }, 200], ['site-fixture', { status: 'published' }, 403]] as const) {
    const before = pageWrites;
    const result = await pageRoute.PATCH(request(`sites/${siteId}/pages/page-fixture`, 'PATCH', body), { params: Promise.resolve({ siteId, pageId: 'page-fixture' }) });
    assert.equal(result.status, expected);
    assert.equal(pageWrites, before + (expected === 200 ? 1 : 0)); checks++;
  }
  const permissions = load('../src/app/api/admin/users/[userId]/permissions/route.ts', f.mocks);
  const self = await permissions.GET(request('users/target/permissions'), targetContext);
  assert.equal(self.status, 200); assert.equal((await self.json()).data.siteAccess.status, 'selected-sites'); checks++;
  await denial(await permissions.GET(request('users/actor/permissions'), { params: Promise.resolve({ userId: 'actor' }) }), 403, 'FORBIDDEN_OPERATOR_SITE_ROUTE');
  const sites = load('../src/app/api/admin/sites/route.ts', f.mocks);
  // Allowed IDs are loaded directly, independent of unrelated workspace pagination.
  f.repositories.sites.list = async () => ({ items: [f.otherSite], pagination: { total: 999 } });
  const listed = await sites.GET(request('sites?includeUnpublished=true'));
  assert.equal(listed.status, 200); const listing = await listed.json();
  assert.deepEqual(listing.data.sites.map((site: any) => site.id), ['site-fixture']); assert.equal(listing.data.pagination.total, 1); checks += 2;
  const allowed = await authorize('sites/site-fixture/pages', 'pages.view');
  assert.equal(await f.access.canAdminAccessTeamScope(allowed, null), false); checks++;
  await denial(await f.access.requireAdminTeamScopeAccess(allowed, 'operator-scope-fixture', f.otherSite), 403, 'FORBIDDEN_SITE_SCOPE');
  await denial(await f.access.requireAdminTeamScopeAccess(allowed, 'operator-scope-fixture', { teamId: null }), 403, 'FORBIDDEN_SITE_SCOPE');
  // A site grant never expands role permissions or existing owned-team access.
  f.target.role = 'viewer';
  await denial(await authorize('sites/site-fixture/pages', 'pages.edit'), 403, 'FORBIDDEN_PERMISSION');
  f.target.role = 'admin'; f.site.teamId = 'owned-team';
  f.mocks['@/lib/backyStore'].listAdminTeamMembers = () => [];
  (f.repositories as any).teams = { listMembers: async () => ({ items: [] }) };
  await denial(await authorize('sites/site-fixture/pages', 'pages.view'), 403, 'FORBIDDEN_SITE_SCOPE');
  f.site.teamId = null;
  // Narrow/revoke on the same active session: no relogin or cached grant reuse.
  assert.equal((await save(policy(2, [{ siteId: 'site-fixture', permissions: ['sites.view'] }]), 1)).status, 200);
  setActor(operatorSession); await denial(await authorize('sites/site-fixture/pages', 'pages.view'), 403, 'FORBIDDEN_OPERATOR_SITE_PERMISSION');
  assert.equal((await save(policy(3, []), 2)).status, 200); setActor(operatorSession);
  assert.deepEqual((await (await sites.GET(request('sites'))).json()).data.sites, []); checks++;
  await denial(await authorize('sites/site-fixture/pages', 'pages.view'), 403, 'FORBIDDEN_SITE_SCOPE');
  for (const bad of [null, { ...policy(3), expiresAt: '2000-01-01T00:00:00.000Z' }]) {
    f.settings().auth.userSiteGrants[0].scope = bad;
    await denial(await authorize('sites', 'sites.view'), 403, 'OPERATOR_SITE_SCOPE_INVALID');
  }
  f.settings().auth.userSiteGrants[0].scope = policy(3);
  const ordinarySettings = load('../src/app/api/admin/settings/route.ts', f.mocks);
  setActor(ownerSession);
  const before = JSON.stringify(f.settings().auth.userSiteGrants);
  await denial(await ordinarySettings.PATCH(request('settings', 'PATCH', { auth: { userSiteGrants: [] } })), 400, 'AUTH_ACCESS_POLICY_FIELD_FORBIDDEN');
  assert.equal((await ordinarySettings.PATCH(request('settings', 'PATCH', { auth: { inviteOnly: true } }))).status, 200);
  assert.equal(JSON.stringify(f.settings().auth.userSiteGrants), before); checks++;
  f.settings().auth.userSiteGrants.push({ userId: 'actor', scope: null });
  assert.equal((await f.access.requireAdminAccess(request('settings'), 'owner-scope', { permission: 'settings.manageKeys' })).type, 'session'); checks++;
  // Explicit restoration requires confirmation, preserves a recorded revision.
  assert.equal((await save({ ...workspace, revision: 4 }, 3, true)).status, 200);
  setActor(operatorSession); assert.equal((await authorize('settings', 'settings.configure', 'PATCH')).type, 'session'); checks++;
  // Real session persistence independently proves policy is not token-cached.
  const sessions = load('../src/lib/admin-auth/sessionStore.ts', f.mocks);
  f.mocks['@/lib/admin-auth/sessionStore'] = sessions;
  f.mocks['@/lib/admin-auth/sessionCookie'] = load('../src/lib/admin-auth/sessionCookie.ts');
  const freshAccess = load('../src/lib/adminAccess.ts', f.mocks);
  const session = sessions.createAdminSessionForExternalUser(f.target, 'supabase', f.settings().auth, { persist: false });
  f.settings().auth = sessions.upsertAdminSessionAuthRecord(f.settings().auth, session);
  const storedPolicy = f.settings().auth.userSiteGrants.find((record: any) => record.userId === 'target');
  storedPolicy.scope = policy(5);
  const tokenRequest = request('sites/site-fixture/pages', 'GET', undefined, { cookie: `backy_admin_session=${session.token}` });
  assert.equal((await freshAccess.requireAdminAccess(tokenRequest, 'operator-scope', { permission: 'pages.edit' })).operatorSiteScope.revision, 5); checks++;
  storedPolicy.scope = policy(6, [{ siteId: 'site-fixture', permissions: ['sites.view'] }]);
  await denial(await freshAccess.requireAdminAccess(tokenRequest, 'operator-scope', { permission: 'pages.edit' }), 403, 'FORBIDDEN_OPERATOR_SITE_PERMISSION');
  f.target.status = 'suspended';
  await denial(await freshAccess.requireAdminAccess(tokenRequest, 'operator-scope', { permission: 'pages.view' }), 401, 'UNAUTHORIZED');
  f.target.status = 'active';
  sessions.revokeAdminSession(session.token, { persist: false });
  f.settings().auth = sessions.removeAdminSessionAuthRecord(f.settings().auth, session.token).auth;
  await denial(await freshAccess.requireAdminAccess(tokenRequest, 'operator-scope', { permission: 'pages.view' }), 401, 'UNAUTHORIZED');
  // Complete owner inventory follows real repository pagination, never a false
  // hasMore:false on the first default page.
  const inventoryFixture = fixture({ demo: false, actorRole: 'owner' });
  let pagesRead = 0;
  inventoryFixture.repositories.sites.list = async (query: any) => {
    pagesRead++;
    return query.offset === 0 ? { items: [inventoryFixture.otherSite], pagination: { hasMore: true, total: 2 } }
      : { items: [inventoryFixture.site], pagination: { hasMore: false, total: 2 } };
  };
  const fullList = load('../src/app/api/admin/sites/route.ts', inventoryFixture.mocks);
  const full = await fullList.GET(request('sites'));
  assert.equal(full.status, 200); const fullPayload = await full.json();
  assert.equal(fullPayload.data.pagination.total, 2); assert.equal(fullPayload.data.pagination.hasMore, false); assert.equal(pagesRead, 2); checks += 3;

}
assert.equal(operatorScopes.operatorSiteScopeFromAuth({ userSiteGrants: {} }, 'x'), null);
assert.equal(operatorScopes.operatorSiteScopeFromAuth({ userSiteGrants: [{ userId: 'x', scope: policy() }, { userId: 'x', scope: policy() }] }, 'x'), null);
const permissionUi = load('../../admin/src/lib/adminPermissionUi.ts');
const uiMatrix = { role: 'admin', groups: [{ permissions: [{ key: 'pages.edit', allowed: true }, { key: 'settings.configure', allowed: true }] }], siteAccess: { scope: policy(), status: 'selected-sites' } };
assert.equal(permissionUi.adminPermissionRule(uiMatrix, 'pages.edit').allowed, true);
assert.equal(permissionUi.adminPermissionRule(uiMatrix, 'settings.configure').allowed, false);
assert.equal(permissionUi.adminPermissionRule({ ...uiMatrix, siteAccess: { scope: policy(1, []), status: 'revoked' } }, 'pages.edit').allowed, false);
assert.equal(permissionUi.adminPermissionRule({ ...uiMatrix, role: 'owner' }, 'settings.configure').allowed, true);
checks += 4;
assert.equal(networkCalls, 0);
console.log(`Operator per-site scope actual-handler checks passed: ${checks}. Repository/session/provider boundaries are fixtures; no live operators modified.`);
