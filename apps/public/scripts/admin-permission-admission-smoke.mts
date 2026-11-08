import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import * as coreModule from '@backy-cms/core';
import { fixture, load, networkCalls } from './admin-access-test-fixtures.mts';

// Execute saved access and handler code; only persistence/content are fixtures.
// A settings write represents the lastUsedAt + settings.updatedAt side effect.
const core = coreModule.default || coreModule;
const key = 'admission-service-fixture';
let checks = 0;
function scopedFixture(demo: boolean, permissions: string[]) {
  const f = fixture({ demo });
  f.settings().auth.apiKeyServiceKeys = [{ id: 'service-admission', keyHash: createHash('sha256').update(key).digest('hex'), status: 'active', lastUsedAt: null,
    scope: { version: 1, revision: 1, mode: 'selected-sites', siteIds: [f.site.id], permissions, expiresAt: null } }];
  return f;
}
function request(path: string, body?: unknown, service = true) {
  return new NextRequest(`http://fixture.invalid/api/admin/sites/fixture/${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(service ? { 'x-backy-admin-key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function savedHandler(name: string, f: ReturnType<typeof fixture>, extra: Record<string, any> = {}) {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const mocks: Record<string, any> = { '@backy-cms/core': core, 'next/server': { NextResponse } };
  for (const match of source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) mocks[match[1]] = {};
  Object.assign(mocks, {
    './adminAccess': f.access, './repositoryRuntime': f.mocks['@/lib/repositoryRuntime'], './backyStore': f.mocks['@/lib/backyStore'],
    './adminCommerceCollectionAccess': load('../src/lib/adminCommerceCollectionAccess.ts', { '@/lib/adminAccess': f.access }),
    './formDefinitionVersion': load('../src/lib/formDefinitionVersion.ts', { '@backy-cms/core': core }),
    './collectionDefinitionVersion': load('../src/lib/collectionDefinitionVersion.ts', { '@backy-cms/core': core }),
    './collectionRecordVersion': load('../src/lib/collectionRecordVersion.ts', { '@backy-cms/core': core }),
    './templateInstanceProvenance': { isValidFormTemplateInstancePin: () => false, isValidProductTemplateInstancePin: () => false, isValidCollectionTemplateInstancePin: () => false, templateInstanceFingerprint: () => 'fixture-fingerprint' },
  }, extra);
  return load(`../src/lib/${name}.ts`, mocks);
}
const histories = [
  { kind: 'form', path: 'forms/form-fixture/design-versions', permissions: ['forms.view', 'forms.edit'], token: 'form-v1:' },
  { kind: 'product', path: 'commerce/products/product-fixture/design-versions', permissions: ['collections.view', 'commerce.view', 'collections.edit', 'commerce.edit'], token: 'record-v1:' },
  { kind: 'collection', path: 'collections/collection-fixture/design-versions', permissions: ['collections.view', 'collections.edit', 'commerce.view', 'commerce.configure'], token: 'collection-v1:' },
];
for (const demo of [false, true]) {
  for (const spec of histories) {
    for (const omitted of spec.permissions) {
      const f = scopedFixture(demo, spec.permissions.filter(permission => permission !== omitted));
      const collection = { id: 'collection-fixture', siteId: f.site.id, slug: 'products', fields: [], metadata: {} };
      (f.repositories as any).collections = { getById: async () => collection };
      f.mocks['@/lib/backyStore'].getCollectionByIdOrSlug = () => collection;
      const handler = savedHandler(`${spec.kind}TemplateVersions`, f)[`handle${spec.kind[0].toUpperCase() + spec.kind.slice(1)}DesignVersions`];
      const before = JSON.stringify(f.settings());
      const response = await handler(request(`${spec.path}/revision-fixture/restore`, { expectedVersion: spec.token + 'a'.repeat(64) }), { siteId: 'fixture', formId: 'form-fixture', collectionId: collection.id, productId: 'product-fixture', revisionId: 'revision-fixture' }, true);
      assert.equal(response.status, 403, `${spec.kind} missing ${omitted}`);
      assert.equal(f.effects.writes, 0); assert.equal(JSON.stringify(f.settings()), before); checks += 3;
    }
    const f = scopedFixture(demo, spec.permissions);
    const collection = { id: 'collection-fixture', siteId: f.site.id, slug: 'products', fields: [], metadata: {} };
    const record = { id: 'product-fixture', siteId: f.site.id, collectionId: collection.id, values: {}, status: 'draft' };
    Object.assign(f.repositories.forms, { listFormDesignRevisions: async () => [] });
    (f.repositories as any).collections = { getById: async () => collection, getBySlug: async () => collection, getRecordById: async () => record, listCollectionDesignRevisions: async () => [], listProductDesignRevisions: async () => [] };
    Object.assign(f.mocks['@/lib/backyStore'], { getCollectionByIdOrSlug: () => collection, getCollectionRecordByIdOrSlug: () => record, listFormDesignRevisions: () => [], listCollectionDesignRevisions: () => [], listProductDesignRevisions: () => [] });
    const response = await savedHandler(`${spec.kind}TemplateVersions`, f)[`handle${spec.kind[0].toUpperCase() + spec.kind.slice(1)}DesignVersions`](request(spec.path), { siteId: 'fixture', formId: 'form-fixture', collectionId: collection.id, productId: record.id });
    assert.equal(response.status, 200, JSON.stringify(await response.json())); assert.equal(f.effects.writes, 1); assert(f.settings().auth.apiKeyServiceKeys[0].lastUsedAt); checks += 3;
  }
  for (const kind of ['form', 'product', 'collection']) {
    const view = kind === 'form' ? ['forms.view'] : kind === 'product' ? ['collections.view', 'commerce.view'] : ['collections.view'];
    const f = scopedFixture(demo, view); const before = JSON.stringify(f.settings());
    const response = await savedHandler(`${kind}TemplateInstances`, f)[`handle${kind[0].toUpperCase() + kind.slice(1)}TemplateInstances`](request('templates/template-fixture/instances', { targetType: kind, action: 'apply', targetRevisionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', selection: [] }), { params: Promise.resolve({ siteId: 'fixture', templateId: 'template-fixture' }) });
    assert.equal(response.status, 403); assert.equal(f.effects.writes, 0); assert.equal(JSON.stringify(f.settings()), before); checks += 3;
  }
  // Commerce permission denial after the collection plan exists remains write-free.
  const f = scopedFixture(demo, ['collections.view', 'collections.edit', 'commerce.view']);
  const collection = { id: 'collection-fixture', siteId: f.site.id, slug: 'products', name: 'Fixture', fields: [], metadata: { frontendDesignTemplateId: 'template-fixture' } };
  (f.repositories as any).collections = { list: async () => ({ items: [collection], pagination: { total: 1 } }) };
  f.mocks['@/lib/backyStore'].listCollections = () => [collection];
  const handler = savedHandler('collectionTemplateInstances', f, {
    './templateHistory': { getRetainedTemplateRevision: async () => ({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', siteId: f.site.id, templateId: 'template-fixture', fingerprint: 'fixture-fingerprint', snapshot: { id: 'template-fixture', type: 'collection' } }) },
    './collectionExportPagination': { collectCompleteExportPages: async (read: any) => (await read({})).items, CollectionExportIncompleteError: class extends Error {} },
  });
  const before = JSON.stringify(f.settings());
  const response = await handler.handleCollectionTemplateInstances(request('templates/template-fixture/instances', { targetType: 'collection', action: 'apply', targetRevisionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', selection: [{ type: 'collection', id: collection.id }], reviewVersion: 'template-collection-instances-v1:' + 'a'.repeat(64) }), { params: Promise.resolve({ siteId: 'fixture', templateId: 'template-fixture' }) });
  assert.equal(response.status, 403, JSON.stringify(await response.json())); assert.equal(f.effects.writes, 0); assert.equal(JSON.stringify(f.settings()), before); checks += 3;

  // Aggregate policy: late permission denial, repeated permission, role and scope.
  for (const role of ['admin', 'owner'] as const) {
    const operator = fixture({ demo, actorRole: role });
    operator.settings().auth.userSiteGrants = [{ userId: operator.actor.id, scope: { version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: operator.site.id, permissions: ['forms.view'] }], expiresAt: null } }];
    const result = await operator.access.requireAdminAccess(request('forms/form-fixture/design-versions', undefined, false), 'aggregate', { permissions: ['forms.view', 'forms.edit'] });
    assert.equal(result instanceof NextResponse ? result.status : result.session.user.role, role === 'owner' ? 'owner' : 403); checks++;
  }
  const full = scopedFixture(demo, ['forms.view', 'forms.edit']);
  const admitted = await full.access.requireAdminAccess(request('forms/form-fixture/design-versions'), 'aggregate', { permission: 'forms.view', permissions: ['forms.view', 'forms.edit', 'forms.edit'] });
  assert.equal(admitted.type, 'api-key'); assert.equal(full.effects.writes, 1); checks += 2;
  const denied = await full.access.requireAdminAccess(request('forms/form-fixture/design-versions'), 'aggregate', { permissions: ['forms.view', 'settings.manageKeys'] });
  assert.equal(denied.status, 403); assert.equal(full.effects.writes, 1); checks += 2;
  const crossSite = await full.access.requireAdminAccess(new NextRequest('http://fixture.invalid/api/admin/sites/other-site/forms/form-fixture/design-versions', { headers: { 'x-backy-admin-key': key } }), 'aggregate', { permissions: ['forms.view', 'forms.edit'] });
  assert.equal(crossSite.status, 403); assert.equal(full.effects.writes, 1); checks += 2;
  for (const actorRole of ['viewer', 'admin', 'owner'] as const) {
    const team = fixture({ demo, actorRole });
    team.site.teamId = 'fixture-team';
    team.mocks['@/lib/backyStore'].listAdminTeamMembers = () => [{ userId: team.actor.id, role: 'viewer' }];
    (team.repositories as any).teams = { listMembers: async () => ({ items: [{ userId: team.actor.id, role: 'viewer' }] }) };
    const result = await team.access.requireAdminAccess(request('forms/form-fixture/design-versions', undefined, false), 'aggregate', { permissions: ['forms.view', 'forms.edit'] });
    assert.equal(result instanceof NextResponse ? result.status : result.session.user.role, actorRole === 'owner' ? 'owner' : 403); checks++;
  }
  const page = scopedFixture(demo, ['pages.view']);
  const route = load('../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts', page.mocks);
  const pageBefore = JSON.stringify(page.settings());
  const pageDenied = await route.POST(request('templates/template-fixture/instances', { action: 'apply', targetRevisionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', selection: [] }), { params: Promise.resolve({ siteId: 'fixture', templateId: 'template-fixture' }) });
  assert.equal(pageDenied.status, 403); assert.equal(page.effects.writes, 0); assert.equal(JSON.stringify(page.settings()), pageBefore); checks += 3;
}
assert.equal(networkCalls, 0);
console.log(`Admin permission admission PASS: ${checks} actual-source checks; denied requests preserve all settings, complete admission records one usage write, selected operators and Owner policy preserved. No live provider or database claim.`);
