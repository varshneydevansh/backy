import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
import { assertComponentBody, operation } from './admin-component-contract.mjs';
const require = createRequire(import.meta.url), cwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-component-contract-'));
const oldSigning = process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY;
process.chdir(directory); let checks = 0;
function load(relative: string, mocks: Record<string, any>) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, process, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename });
  return module.exports;
}
try {
  const imported = await import('../src/lib/backyStore'); const store: any = imported.default || imported;
  const discoveryImport = await import('../src/lib/interactiveRegistryDiscovery'); const discovery: any = discoveryImport.default || discoveryImport;
  const inventory = load('../src/lib/interactiveComponentInventory.ts', {});
  const propsAdmission = load('../src/lib/componentMigrationProps.ts', {});
  const validation = load('../src/lib/interactiveComponentValidation.ts', {}), exportsHelper = load('../src/lib/interactiveComponentExport.ts', {});
  for (const demo of [true, false]) {
    const site = store.createAdminSite({ id: 'component-' + demo, slug: 'component-slug-' + demo, name: 'Draft registry fixture' });
    const canonicalCalls: string[] = [], permissionCalls: string[] = [], storageCalls: any[] = [];
    let deny = '', fail = false, mutations = 0;
    function canonical(s: string) { assert.equal(s, site.id, 'Repository/storage lookup uses canonical site id, never request slug'); canonicalCalls.push(s); if (fail) throw Error('fixture repository unavailable'); }
    const repositories: any = {
      sites: { getById: async (id: string) => { if (fail) throw Error('fixture unavailable'); return id === site.id ? site : null; }, getBySlug: async (slug: string) => slug === site.slug ? site : null },
      interactiveComponents: {
        getByKeyVersion: async (s: string, key: string, version: string) => { canonical(s); return store.getInteractiveComponent(s, key, version); },
        list: async (p: any) => { canonical(p.siteId); const all = store.listInteractiveComponents(p.siteId, p); return { items: all.slice(p.offset, p.offset + p.limit), pagination: { total: all.length, limit: p.limit, offset: p.offset, hasMore: p.offset + p.limit < all.length } }; },
        create: async (p: any) => { canonical(p.siteId); mutations++; return { item: store.createInteractiveComponent(p.siteId, p) }; },
        update: async (s: string, key: string, version: string, p: any) => { canonical(s); mutations++; return { item: store.updateInteractiveComponent(s, key, version, p) }; },
        delete: async (s: string, key: string, version: string) => { canonical(s); mutations++; return store.deleteInteractiveComponent(s, key, version); },
        rollbackVersion: async (s: string, key: string, version: string, p: any) => { canonical(s); mutations++; return store.rollbackInteractiveComponentVersion(s, key, version, p); },
      },
      pages: { list: async (p: any) => { canonical(p.siteId); const all = store.listAdminPages(p.siteId, { includeUnpublished: true }); return { items: all.slice(p.offset, p.offset + p.limit), pagination: { total: all.length, offset: p.offset, limit: p.limit, hasMore: p.offset + p.limit < all.length } }; }, update: async (s: string, id: string, p: any) => { canonical(s); mutations++; return { item: store.updateAdminPage(s, id, p) }; } },
      posts: { list: async (p: any) => { canonical(p.siteId); const all = store.getBlogPosts(p.siteId, { includeUnpublished: true, limit: p.limit, offset: p.offset }); return { items: all.posts, pagination: all.pagination }; }, update: async (s: string, id: string, p: any) => { canonical(s); mutations++; return { item: store.updateAdminBlogPost(s, id, p) }; } },
      auditLogs: { record: async (p: any) => { assert.equal(p.siteId, site.id); return {}; } }, cacheInvalidations: { record: async () => ({}) }, settings: { get: async () => store.getAdminSettings() },
    };
    const mocks: any = { '@/lib/backyStore': store, '@/lib/componentMigrationProps': propsAdmission, '@/lib/interactiveComponentInventory': inventory, '@/lib/interactiveComponentExport': exportsHelper, '@/lib/interactiveComponentValidation': validation, '@/lib/interactiveRegistryDiscovery': discovery, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/mediaStorage': { getMediaStorageAdapter: async () => ({ provider: 'fixture-memory', upload: async (bytes: Buffer, p: any) => { storageCalls.push({ size: bytes.length, ...p }); return { path: p.path, url: '/fixture-storage/' + p.path }; }, getPublicUrl: (path: string) => '/fixture-storage/' + path }) }, '@/lib/adminAccess': { requireAdminAccess: async (r: Request, requestId: string, p: any) => { permissionCalls.push(p.permission); return deny ? NextResponse.json({ success: false, requestId, error: { code: deny === '401' ? 'UNAUTHORIZED' : 'FORBIDDEN', message: 'Fixture access denied' } }, { status: Number(deny) }) : { session: { user: { id: 'fixture-actor' } } }; } } };
    const detail = '/{componentKey}/{version}';
    async function call(path: string, method: string, body?: any, expected = 200, options: { key?: string; version?: string; siteId?: string; query?: string; invalid?: boolean } = {}) {
      const relative = path.replace('{componentKey}', '[componentKey]').replace('{version}', '[version]');
      const route = load('../src/app/api/admin/sites/[siteId]/interactive-components' + relative + '/route.ts', mocks);
      if (body !== undefined && !options.invalid) assertComponentBody(path, method, 'request', body);
      const targetSite = options.siteId || site.slug, key = options.key || 'FIXTURE.WIDGET', version = options.version || '1.0.0';
      const response = await route[method](new Request('http://fixture.invalid/api/admin/sites/' + targetSite + '/interactive-components' + path.replace('{componentKey}', key).replace('{version}', version) + (options.query || ''), { method, headers: { 'content-type': 'application/json', 'x-request-id': 'registry-contract-proof' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId: targetSite, componentKey: key, version }) });
      assert.equal(response.status, expected, `${demo} ${method} ${path} (${key}@${version})`); const payload = await response.json(); assertComponentBody(path, method, expected, payload); checks++; return payload;
    }
    const metadata = { defaultProps: { series: { values: [1, 2], style: { color: 'teal' } } }, propsSchema: { type: 'object', properties: { series: { type: 'object', properties: { values: { type: 'array', items: { type: 'number' } } } } } }, dataBindings: { series: { collectionId: 'fixture-collection', field: 'value' } }, unknown: { nesting: { survives: true } } };
    const instanceFallback = { required: true, supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'], title: 'Accessible figure', text: 'Static explanation', html: '<p>Static explanation</p>', imageUrl: '/fixture.png', alt: 'Static diagram', ariaLabel: 'Diagram', unknown: { preserved: true } };
    const fallback = { required: instanceFallback.required, supported: instanceFallback.supported };
    metadata.defaultProps = { ...metadata.defaultProps, fallback: instanceFallback };
    const input = { componentKey: 'fixture.widget', version: '1.0.0', displayName: 'Signed fixture', type: 'codeComponent', source: 'custom', renderMode: 'sandbox-iframe', status: 'disabled', reviewStatus: 'draft', allowedDataScopes: ['collections'], requiredFields: ['value'], controls: [{ key: 'speed', label: 'Speed', type: 'range', min: 0, max: 10, step: 0.5, defaultValue: 1, unknown: { nested: true } }], fallback, dependencyMetadata: metadata, dataBindingPresets: [{ id: 'series', label: 'Series', scope: 'collections', targetPath: 'props.series', mode: 'list', fields: ['value'] }] };
    const created = await call('', 'POST', input, 201); assert.equal(created.data.component.siteId, site.id);
    assert.deepEqual(created.data.component.dependencyMetadata.defaultProps, metadata.defaultProps); assert.deepEqual(created.data.component.fallback, fallback); assert.deepEqual(created.data.component.controls, input.controls); assert.deepEqual(created.data.component.dependencyMetadata.dataBindings, metadata.dataBindings); assert.deepEqual(created.data.component.dependencyMetadata.dataBindingPresets, input.dataBindingPresets);
    await call('', 'POST', input, 409); await call('', 'POST', { componentKey: '', displayName: 'Bad' }, 400);
    const read = await call(detail, 'GET'); assert.equal(read.data.component.version, '1.0.0'); assert.deepEqual(read.data.component.dependencyMetadata.propsSchema, metadata.propsSchema);
    await call(detail, 'GET', undefined, 404, { version: 'does-not-exist' }); await call(detail, 'GET', undefined, 404, { siteId: 'foreign-site' });
    await call(detail, 'PATCH', { version: '2.0.0' }, 400, { invalid: true });
    await call(detail, 'PATCH', { dependencyMetadata: { ...created.data.component.dependencyMetadata, unknown: { nesting: { survives: true, edited: 3 } } }, description: 'Edited' });
    const exported = (await call(detail + '/export', 'GET')).data.exportPackage; assert.equal(exported.source.siteId, site.id); assert.equal(exported.component.status, 'disabled'); assert.equal(exported.component.reviewStatus, 'draft'); assert.equal(exported.import.preservesReviewState, false); assert.deepEqual(exported.component.fallback, fallback);
    const imported = await call('', 'POST', { exportPackage: exported, componentKey: 'fixture.imported', version: '7.0.0' }, 201); assert.equal(imported.data.component.runtime.sandboxUrl, `/api/sites/${site.id}/interactive-components/fixture.imported/7.0.0/sandbox`); assert.equal(imported.data.component.dependencyMetadata.unknown.nesting.edited, 3);
    await call(detail + '/review', 'POST', { action: 'submit' }); const beforeApproval = mutations;
    await call(detail + '/review', 'POST', { action: 'approve' }, 400); assert.equal(mutations, beforeApproval, 'Invalid unsigned approval performs no repository write');
    await call(detail + '/review', 'POST', { action: 'reject', notes: 'Fixture review' });
    const bundle = { contentBase64: Buffer.from('/* Agent-created test bundle. Never executed. */').toString('base64'), filename: 'fixture.js', contentType: 'application/javascript' };
    delete process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY;
    await call(detail + '/bundle', 'POST', bundle, 400);
    process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY = 'local-fixture-only-signing-key';
    await call(detail + '/bundle', 'POST', { ...bundle, signature: 'invalid' }, 400); assert.equal(storageCalls.length, 0);
    const stored = await call(detail + '/bundle', 'POST', bundle); assert.equal(stored.data.component.status, 'disabled'); assert.equal(stored.data.component.reviewStatus, 'draft'); assert.equal(stored.data.bundle.signed, true); assert.equal(storageCalls[0].metadata.siteId, site.id); assert.deepEqual(stored.data.component.dependencyMetadata.defaultProps, metadata.defaultProps); assert.deepEqual(stored.data.component.fallback, fallback);
    await call(detail + '/bundle', 'POST', { ...bundle, filename: 'bad.exe' }, 400);
    await call(detail + '/bundle', 'POST', { ...bundle, contentBase64: Buffer.alloc(5242881).toString('base64') }, 413);
    const approved = await call(detail + '/review', 'POST', { action: 'approve', checklist: { tested: true } }); assert.equal(approved.data.component.status, 'active'); assert.equal(approved.data.component.reviewStatus, 'approved');
    const next = await call('', 'POST', { ...input, version: '2.0.0', runtime: {}, integrity: {} }, 201);
    await call(detail + '/bundle', 'POST', bundle, 200, {version:'2.0.0'});
    await call(detail + '/review', 'POST', {action:'approve',checklist:{tested:true}}, 200, {version:'2.0.0'});
    const widget = { type: 'interactive_component', componentKey: 'fixture.widget', version: '1.0.0', props: metadata.defaultProps, dataBindings: metadata.dataBindings, fallback: { ...instanceFallback, componentKey: 'fixture.widget', version: '1.0.0' }, unknown: { nested: true }, children: [{ text: '' }] };
    const page = store.createAdminPage(site.id, { title: 'Nested widget', slug: 'nested', content: { elements: [{ id: 'rich', type: 'paragraph', props: { content: [widget] } }] } });
    const post = store.createAdminBlogPost(site.id, { title: 'Nested article widget', slug: 'article-nested', content: { elements: [{ id: 'rich', type: 'paragraph', props: { content: [widget] } }] } });
    const usage = await call(detail + '/usage', 'GET'); assert.equal(usage.data.summary.total, 2); assert.equal(usage.data.usage[0].version, '1.0.0');
    await call(detail + '/usage', 'GET', undefined, 200, { version: 'missing' });
    await call(detail + '/migrate', 'POST', { targetVersion: 'missing' }, 404); await call(detail + '/migrate', 'POST', { targetVersion: '1.0.0' }, 400);
    const plan = await call(detail + '/migrate', 'POST', { targetVersion: '2.0.0' }); assert.equal(plan.data.dryRun, true); assert.equal(plan.data.summary.elements, 4, "Legacy elements and canonical contentDocument mirrors are both migrated"); assert.equal(store.getAdminPageById(site.id, page.id).content.elements[0].props.content[0].version, '1.0.0');
    await call(detail + '/migrate', 'POST', { targetVersion: '2.0.0', dryRun: false });
    for (const row of [store.getAdminPageById(site.id, page.id), store.getAdminBlogPostById(site.id, post.id)]) { const migrated = row.content.elements[0].props.content[0]; assert.equal(migrated.version, '2.0.0'); assert.deepEqual(migrated.props, metadata.defaultProps); assert.deepEqual(migrated.dataBindings, metadata.dataBindings); assert.equal(migrated.fallback.version, '1.0.0'); assert.equal(migrated.unknown.nested, true); }
    const rollback = await call(detail + '/rollback', 'POST', {}); assert.equal(rollback.data.component.version, '1.0.0'); assert.deepEqual(rollback.data.component.dependencyMetadata.propsSchema, metadata.propsSchema);
    // 205 versions are distinct and recovered through actual handler pagination.
    for (let i = 0; i < 205; i++) store.createInteractiveComponent(site.id, { ...input, componentKey: 'fixture.catalog', version: `1.${i}.0` });
    const seen = new Set<string>();
    for (let offset = 0; offset < 205; offset += 100) { const result = await call('', 'GET', undefined, 200, { query: `?search=fixture.catalog&limit=100&offset=${offset}` }); assert.equal(result.data.pagination.total, 205); for (const c of result.data.components) seen.add(c.version); assert.equal(result.data.pagination.hasMore, offset < 200); } assert.equal(seen.size, 205);
    for (const query of ['?limit=101', '?limit=0', '?offset=-1', '?offset=NaN']) await call('', 'GET', undefined, 400, { query });
    // Each documented route executes its real denial branch before any repository/storage mutation.
    for (const [path, method, body] of [['', 'GET'], ['', 'POST', input], [detail, 'GET'], [detail, 'PATCH', {}], [detail, 'DELETE'], [detail + '/export', 'GET'], [detail + '/usage', 'GET'], [detail + '/review', 'POST', { action: 'submit' }], [detail + '/bundle', 'POST', bundle], [detail + '/migrate', 'POST', { targetVersion: '2.0.0' }], [detail + '/rollback', 'POST', {}]] as const) {
      for (const status of [401, 403]) { deny = String(status); const before = mutations, storageBefore = storageCalls.length; await call(path, method, body, status); assert.equal(mutations, before); assert.equal(storageCalls.length, storageBefore); }
    }
    deny = ''; await call(detail, 'DELETE'); await call(detail, 'GET', undefined, 404);
    if (!demo) { fail = true; await call('', 'GET', undefined, 500); fail = false; assert.ok(canonicalCalls.length > 0); }
    assert.ok(permissionCalls.includes('pages.view') && permissionCalls.includes('pages.edit') && permissionCalls.includes('pages.delete'));
  }
  console.log(`Registered component actual-handler/OpenAPI checks passed: ${checks} (demo and repository adapters; isolated memory storage).`);
} finally { if (oldSigning === undefined) delete process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY; else process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY = oldSigning; process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); }
