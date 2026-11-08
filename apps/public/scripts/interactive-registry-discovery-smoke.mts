import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import * as sessionStore from '../src/lib/admin-auth/sessionStore.ts';
import * as repositoryRuntime from '../src/lib/repositoryRuntime.ts';
import * as publicCatalogModule from '../src/app/api/sites/[siteId]/interactive-components/route.ts';
import * as authoringCatalogModule from '../src/app/api/admin/sites/[siteId]/interactive-components/discovery/route.ts';
import * as publicExactModule from '../src/app/api/sites/[siteId]/interactive-components/[componentKey]/[version]/route.ts';
import * as discoveryModule from '../src/lib/interactiveRegistryDiscovery.ts';

const publicCatalog = (publicCatalogModule.default || publicCatalogModule).GET;
const authoringCatalog = (authoringCatalogModule.default || authoringCatalogModule).GET;
const publicExact = (publicExactModule.default || publicExactModule).GET;
const { loadCompleteRegistryEntries } = discoveryModule.default || discoveryModule;
const sessions = (sessionStore.default || sessionStore) as typeof sessionStore;
const repositoriesRuntime = (repositoryRuntime.default || repositoryRuntime) as typeof repositoryRuntime;
process.env.BACKY_DATA_MODE = 'database';
const site = { id: 'draft-registry-site', slug: 'draft-registry-site', teamId: 'registry-team', isPublished: false };
const otherSite = { ...site, id: 'other-registry-site', slug: 'other-registry-site', teamId: 'other-team' };
const user = { id: 'registry-member', email: 'registry-member@example.com', fullName: 'Registry member', role: 'admin' as const, status: 'active' as const };
let auth: Record<string, unknown> = {};
const records = Array.from({ length: 205 }, (_, index) => ({ siteId: site.id, componentKey: 'fixture.versioned', version: `1.0.${index}`, displayName: 'Versioned diagram', type: 'interactiveFigure' as const,
  status: 'active', reviewStatus: 'approved', renderMode: 'static-fallback' as const, source: 'custom' as const,
  dependencyMetadata: { defaultProps: { config: { palette: ['teal'], tokenCount: 7 }, apiKey: 'hidden' }, propsSchema: { type: 'object', properties: { config: { type: 'object' } } }, dataBindings: [{ targetPath: 'props.rows', source: { collectionId: 'public-series' } }] },
  fallback: { required: true, supported: ['title', 'text', 'html', 'imageUrl', 'alt'], title: 'Stored fallback', html: '<strong>Diagram description</strong>', imageUrl: '/diagram.png', alt: 'Diagram', extension: { keep: true } },
}));
const privateRecord = { ...records[0], componentKey: 'private-version', reviewStatus: 'draft' };
const calls: number[] = [];
repositoriesRuntime.setPublicRepositoryRuntimeForTests({ mode: 'database', repositories: {
  users: { getById: async (id: string) => id === user.id ? user : null },
  sites: { getById: async (id: string) => id === site.id ? site : id === otherSite.id ? otherSite : null, getBySlug: async () => null },
  teams: { listMembers: async ({ teamId }: { teamId: string }) => ({ items: teamId === site.teamId ? [{ userId: user.id, role: 'editor', status: 'active' }] : [], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } }) },
  settings: { get: async () => ({ apiKeys: {}, auth }), update: async (next: { auth: Record<string, unknown> }) => { auth = next.auth; } },
  cacheInvalidations: { latestRevision: async () => null },
  interactiveComponents: {
    list: async ({ siteId, publicOnly, offset = 0, limit = 100 }: { siteId: string; publicOnly: boolean; offset?: number; limit?: number }) => {
      calls.push(offset); assert.equal(publicOnly, true);
      const source = siteId === site.id ? [...records, privateRecord].filter(record => record.status === 'active' && record.reviewStatus === 'approved') : [];
      return { items: source.slice(offset, offset + limit), pagination: { total: source.length, limit, offset, hasMore: offset + limit < source.length } };
    },
    getByKeyVersion: async (siteId: string, key: string, version: string) => siteId !== site.id ? null : [...records, privateRecord].find(record => record.componentKey === key && record.version === version) || null,
  },
} as never });
const session = sessions.createAdminSessionForExternalUser(user, 'supabase', { sessionTimeoutMinutes: 120 }, { persist: false });
auth = sessions.upsertAdminSessionAuthRecord(auth, session);
const request = (path: string, token?: string) => new NextRequest(`http://localhost:3001${path}`, { headers: token ? { authorization: `Bearer ${token}`, origin: 'http://localhost:5173' } : {} });
const params = { params: Promise.resolve({ siteId: site.id }) };
try {
  assert.equal((await publicCatalog(request(`/api/sites/${site.id}/interactive-components`), params)).status, 404, 'Public catalog hides an unpublished site');
  const exactParams = { params: Promise.resolve({ siteId: site.id, componentKey: records[204].componentKey, version: records[204].version }) };
  assert.equal((await publicExact(request(`/api/sites/${site.id}/interactive-components/fixture.versioned/1.0.204`), exactParams)).status, 404, 'Public exact lookup hides an unpublished site');
  assert.equal((await authoringCatalog(request(`/api/admin/sites/${site.id}/interactive-components/discovery`), params)).status, 401, 'Draft discovery requires authentication');
  assert.equal((await authoringCatalog(request(`/api/admin/sites/${otherSite.id}/interactive-components/discovery`, session.token), { params: Promise.resolve({ siteId: otherSite.id }) })).status, 403, 'Authenticated discovery still requires membership in the exact site');
  const response = await authoringCatalog(request(`/api/admin/sites/${site.id}/interactive-components/discovery`, session.token), params);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const first = (await response.json()).data;
  assert.equal(first.components.length, 100); assert.equal(first.pagination.hasMore, true); assert(first.pagination.total > 205);
  assert.deepEqual(calls.slice(-3), [0, 100, 200], 'All repository pages are merged before publishing accurate catalog pagination');
  const catalog: any[] = [...first.components];
  while (catalog.length < first.pagination.total) {
    const response = await authoringCatalog(request(`/api/admin/sites/${site.id}/interactive-components/discovery?limit=100&offset=${catalog.length}`, session.token), params);
    assert.equal(response.status, 200); const page = (await response.json()).data; assert.equal(page.pagination.offset, catalog.length); catalog.push(...page.components);
  }
  assert.equal(catalog.filter(record => record.componentKey === 'fixture.versioned').length, 205);
  assert.equal(catalog.some(record => record.componentKey === 'private-version'), false);
  const entry = catalog.find(record => record.version === '1.0.204');
  assert.deepEqual(entry.defaultProps.config, { palette: ['teal'], tokenCount: 7 }); assert.equal(entry.defaultProps.apiKey, undefined);
  assert.equal(entry.fallback.html, records[204].fallback.html); assert.deepEqual(entry.fallback.extension, { keep: true }); assert.deepEqual(entry.dataBindings, records[204].dependencyMetadata.dataBindings);
  site.isPublished = true;
  const exact = await publicExact(request(`/api/sites/${site.id}/interactive-components/fixture.versioned/1.0.204`), exactParams);
  assert.equal(exact.status, 200); assert.equal((await exact.json()).data.components[0].version, '1.0.204', 'The last version resolves without catalog traversal');
  assert.equal((await publicExact(request(`/api/sites/${site.id}/interactive-components/private-version/1.0.0`), { params: Promise.resolve({ siteId: site.id, componentKey: 'private-version', version: '1.0.0' }) })).status, 404);
  assert.equal((await publicExact(request(`/api/sites/${site.id}/interactive-components/fixture.versioned/missing`), { params: Promise.resolve({ siteId: site.id, componentKey: 'fixture.versioned', version: 'missing' }) })).status, 404, 'No latest-version substitution');
  const publicResponse = await publicCatalog(request(`/api/sites/${site.id}/interactive-components?limit=5&offset=205`), params);
  assert.equal(publicResponse.status, 200); const publicPage = (await publicResponse.json()).data; assert.equal(publicPage.pagination.offset, 205); assert.equal(publicPage.components.length, 5);
  assert.equal((await publicCatalog(request(`/api/sites/${site.id}/interactive-components?limit=0`), params)).status, 400);
  assert.equal((await publicCatalog(request(`/api/sites/${site.id}/interactive-components?offset=-1`), params)).status, 400);
  await assert.rejects(loadCompleteRegistryEntries(async offset => ({ items: offset ? [] : [1], pagination: { total: 2, offset, hasMore: true } })), /changed/);
  await assert.rejects(loadCompleteRegistryEntries(async offset => ({ items: [1], pagination: { total: offset ? 3 : 2, offset, hasMore: true } })), /changed/);
  console.log('Registry discovery routes passed: fresh draft site, authenticated site membership, full205versions, exact lookup, metadata sanitization and closed public boundaries.');
} finally { repositoriesRuntime.resetPublicRepositoryRuntimeForTests(); }
