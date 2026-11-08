import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { fixture, load, serviceScopes, managedAuthFields, networkCalls } from './admin-access-test-fixtures.mts';

let checks = 0;
const selectedScope = (permissions = ['sites.view', 'pages.view', 'pages.edit']) => ({ version: 1, revision: 1, mode: 'selected-sites', siteIds: ['site-fixture'], permissions, expiresAt: null });
const workspaceScope = () => ({ version: 1, revision: 1, mode: 'workspace', siteIds: [], permissions: [], expiresAt: null });
const headers = (key: string) => ({ 'x-backy-admin-key': key, 'content-type': 'application/json' });
const request = (path: string, key: string, method = 'GET', body?: unknown) => new NextRequest(`http://fixture.invalid${path}`, { method, headers: headers(key), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function assertDenied(access: any, code?: string) {
  assert(access instanceof NextResponse); assert.equal(access.status, 403);
  if (code) assert.equal((await access.json()).error.code, code);
  checks++;
}
for (const demo of [false, true]) {
  const f = fixture({ demo, actorRole: 'owner' });
  for (const body of [
    { label: 'No scope' },
    { label: 'Unconfirmed workspace', scope: workspaceScope() },
    { label: 'Empty sites', scope: { ...selectedScope(), siteIds: [] } },
    { label: 'Slug instead of ID', scope: { ...selectedScope(), siteIds: ['fixture'] } },
    { label: 'Unknown site', scope: { ...selectedScope(), siteIds: ['absent'] } },
    { label: 'Owner permission', scope: selectedScope(['settings.manageKeys']) },
    { label: 'Global permission', scope: selectedScope(['users.manage']) },
    { label: 'Unknown permission', scope: selectedScope(['pages.new-permission']) },
    { label: 'No permissions', scope: selectedScope([]) },
    { label: 'Invalid expiry', scope: { ...selectedScope(), expiresAt: 'invalid' } },
    { label: 'Past expiry', scope: { ...selectedScope(), expiresAt: '2000-01-01T00:00:00.000Z' } },
  ]) {
    const before = f.effects.writes;
    const result = await f.call('settings', 'POST', { action: 'issue-admin-api-key', ...body });
    assert.equal(result.status, 400, JSON.stringify(result.body)); assert.equal(f.effects.writes, before); checks++;
  }
  for (const service of [false, true]) {
    const ordinary = fixture({ demo, service });
    assert.equal((await ordinary.call('settings', 'POST', { action: 'issue-admin-api-key', label: 'Denied', scope: selectedScope() })).status, 403); checks++;
  }
  const issued = await f.call('settings', 'POST', { action: 'issue-admin-api-key', label: 'Selected site integration', scope: selectedScope() });
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const key = issued.body.data.issuedKey.adminApiKey;
  assert.equal(typeof key, 'string');
  const grant = f.settings().auth.apiKeyServiceKeys[0];
  assert.equal(grant.keyHash, createHash('sha256').update(key).digest('hex'));
  assert.deepEqual(JSON.parse(JSON.stringify(grant.scope)), selectedScope());
  assert.equal(JSON.stringify(f.settings()).includes(key), false);
  assert.equal(Object.hasOwn(issued.body.data.settings.auth.apiKeyServiceKeys[0], 'keyHash'), false);
  checks += 5;
  const authorize = (path: string, permission?: string, method = 'GET') => f.access.requireAdminAccess(request(path, key, method), 'fixture-scope', { ...(permission ? { permission } : {}) });
  const selected = await authorize('/api/admin/sites/site-fixture/pages', 'pages.view');
  assert.equal(selected.type, 'api-key'); assert.equal(selected.serviceKeyScope.mode, 'selected-sites'); checks++;
  assert.equal((await authorize('/api/admin/sites/fixture/pages', 'pages.view')).type, 'api-key'); checks++;
  assert.equal((await authorize('/api/sites/fixture/manage/pages/page-fixture', 'pages.edit', 'PATCH')).type, 'api-key'); checks++;
  await assertDenied(await authorize('/api/admin/sites/other-site/pages', 'pages.view'), 'FORBIDDEN_SITE_SCOPE');
  await assertDenied(await authorize('/api/admin/sites/other/pages', 'pages.view'), 'FORBIDDEN_SITE_SCOPE');
  await assertDenied(await authorize('/api/admin/sites/site-fixture/pages', 'pages.delete', 'DELETE'), 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  await assertDenied(await authorize('/api/admin/sites/site-fixture/pages', undefined, 'POST'), 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  for (const path of ['/api/admin/settings', '/api/admin/users', '/api/admin/teams', '/api/admin/audit-logs', '/api/admin/commerce/reconcile', '/api/admin/sites/site-fixture/new-module']) {
    await assertDenied(await authorize(path, 'pages.edit', 'POST'), 'FORBIDDEN_SERVICE_KEY_ROUTE');
  }
  // Supplying an unrelated permission cannot make a global route site-scoped.
  await assertDenied(await authorize('/api/admin/sites', 'pages.edit', 'POST'), 'FORBIDDEN_SERVICE_KEY_ROUTE');
  assert.equal(await f.access.canAdminAccessTeamScope(selected, null), false); checks++;
  assert.equal(await f.access.canAdminAccessTeamScope(selected, 'shared-team'), false); checks++;
  assert.equal(await f.access.requireAdminTeamScopeAccess(selected, 'scope', f.site), null); checks++;
  await assertDenied(await f.access.requireAdminTeamScopeAccess(selected, 'scope', f.otherSite), 'FORBIDDEN_SITE_SCOPE');
  await assertDenied(await f.access.requireAdminTeamScopeAccess(selected, 'scope', { teamId: 'shared-team' }), 'FORBIDDEN_SITE_SCOPE');
  assert.deepEqual((await f.access.filterAdminTeamScopedResources(selected, [f.site, f.otherSite, { teamId: null }])).map((site: any) => site.id), [f.site.id]); checks++;

  // Real list handler; unauthorized items must not leak in output or pagination.
  const sitesRoute = load('../src/app/api/admin/sites/route.ts', f.mocks);
  const listResponse = await sitesRoute.GET(request('/api/admin/sites?includeUnpublished=true', key));
  assert.equal(listResponse.status, 200); const list = await listResponse.json();
  assert.deepEqual(list.data.sites.map((site: any) => site.id), [f.site.id]);
  assert.equal(list.data.pagination.total, 1); assert.equal(JSON.stringify(list).includes('other-site'), false); checks += 3;
  // A selected site beyond the workspace list's first page must remain discoverable.
  f.repositories.sites.list = async () => ({ items: [f.otherSite], pagination: { total: 99 } });
  const unpaged = await (await sitesRoute.GET(request('/api/admin/sites?includeUnpublished=true', key))).json();
  assert.deepEqual(unpaged.data.sites.map((site: any) => site.id), [f.site.id]); checks++;

  // Real content handler denies before reading/writing a cross-site resource.
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
  const deniedPage = await pageRoute.PATCH(request('/api/admin/sites/other-site/pages/page-fixture', key, 'PATCH', { title: 'Denied' }), { params: Promise.resolve({ siteId: 'other-site', pageId: 'page-fixture' }) });
  assert.equal(deniedPage.status, 403); assert.equal(pageWrites, 0); checks++;
  const editedPage = await pageRoute.PATCH(request('/api/admin/sites/site-fixture/pages/page-fixture', key, 'PATCH', { title: 'Scoped edit' }), { params: Promise.resolve({ siteId: 'site-fixture', pageId: 'page-fixture' }) });
  assert.equal(editedPage.status, 200, JSON.stringify(await editedPage.clone().json())); assert.equal(page.title, 'Scoped edit'); assert.equal(pageWrites, 1); checks++;
  const publishDenied = await pageRoute.PATCH(request('/api/admin/sites/site-fixture/pages/page-fixture', key, 'PATCH', { status: 'published' }), { params: Promise.resolve({ siteId: 'site-fixture', pageId: 'page-fixture' }) });
  assert.equal(publishDenied.status, 403); assert.equal(pageWrites, 1); checks++;

  // Fresh policy on every request: narrowing, expiry, invalid declaration and revocation.
  const updateGrant = (patch: Record<string, unknown>) => Object.assign(f.settings().auth.apiKeyServiceKeys[0], patch);
  updateGrant({ scope: { ...selectedScope(['sites.view']), revision: 2 } });
  await assertDenied(await authorize('/api/admin/sites/site-fixture/pages', 'pages.view'), 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  updateGrant({ scope: { ...selectedScope(), expiresAt: '2000-01-01T00:00:00.000Z' } });
  await assertDenied(await authorize('/api/admin/sites/site-fixture/pages', 'pages.view'), 'SERVICE_KEY_SCOPE_INVALID');
  for (const badScope of [{ mode: 'selected-sites' }, null, { ...selectedScope(), permissions: ['users.manage'] }, { ...selectedScope(), expiresAt: 'invalid' }]) {
    updateGrant({ scope: badScope });
    await assertDenied(await authorize('/api/admin/sites/site-fixture/pages', 'pages.view'), 'SERVICE_KEY_SCOPE_INVALID');
  }
  updateGrant({ scope: selectedScope(), revokedAt: new Date().toISOString() });
  // A revoked key is no longer a credential; remove fixture session fallback.
  f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence = async () => null;
  const revoked = await authorize('/api/admin/sites/site-fixture/pages', 'pages.view');
  assert(revoked instanceof NextResponse); assert.equal(revoked.status, 401); checks++;

  // Missing policy only on existing legacy records preserves explicit workspace compatibility.
  delete f.settings().auth.apiKeyServiceKeys[0].scope; updateGrant({ revokedAt: null });
  const legacy = await authorize('/api/admin/settings', 'settings.configure', 'PATCH');
  assert.equal(legacy.serviceKeyScope.mode, 'workspace'); assert.equal(legacy.serviceKeyScope.legacy, true); checks++;
  await assertDenied(await authorize('/api/admin/settings', 'settings.manageKeys', 'POST'), 'FORBIDDEN_PERMISSION');
  const globalFixture = fixture({ demo, actorRole: 'owner' });
  const globalIssued = await globalFixture.call('settings', 'POST', { action: 'issue-admin-api-key', label: 'Deliberate workspace integration', scope: workspaceScope(), confirmWorkspace: true });
  assert.equal(globalIssued.status, 200); assert.equal(globalIssued.body.data.issuedKey.scope.mode, 'workspace'); assert.equal(globalIssued.body.data.issuedKey.scope.legacy, undefined); checks++;
  // The browser's ordinary Save serializes policy, not GET's managed key summaries.
  const policySerializer = load('../../admin/src/lib/adminAuthPolicyPatch.ts');
  const outgoingAuth = policySerializer.adminAuthPolicyPatch({ ...globalIssued.body.data.settings.auth, requireTwoFactor: true, sessionTimeoutMinutes: 90, ...Object.fromEntries(managedAuthFields.map(field => [field, ['managed']])) });
  for (const field of managedAuthFields) assert.equal(Object.hasOwn(outgoingAuth, field), false);
  const beforeGrant = JSON.stringify(globalFixture.settings().auth.apiKeyServiceKeys);
  assert.equal((await globalFixture.call('settings', 'PATCH', { auth: outgoingAuth })).status, 200);
  assert.equal(JSON.stringify(globalFixture.settings().auth.apiKeyServiceKeys), beforeGrant); checks += 2;
}

// Keep authoring choices identical to the backend's validated site permission catalog.
const frontend = readFileSync(new URL('../../admin/src/lib/adminContentApi.ts', import.meta.url), 'utf8');
const catalog = frontend.match(/export const ADMIN_SITE_SERVICE_PERMISSIONS = \[([\s\S]*?)\];/)?.[1];
assert(catalog);
assert(frontend.includes('auth: adminAuthPolicyPatch(input.auth)')); checks++;
assert.deepEqual([...catalog.matchAll(/'([^']+)'/g)].map(match => match[1]), Array.from(serviceScopes.ADMIN_SITE_SERVICE_PERMISSIONS)); checks++;
assert.equal(networkCalls, 0);
console.log(`Admin service-key scope checks passed: ${checks}. Actual access/issuance/list/content handlers; session/repository/provider boundaries are fixtures.`);
