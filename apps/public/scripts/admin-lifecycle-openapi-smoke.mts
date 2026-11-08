import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
import { assertLifecycleBody, operation } from './admin-lifecycle-contract.mjs';
const require = createRequire(import.meta.url);
const cwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-lifecycle-contract-'));
process.chdir(directory);
let checks = 0;
const reopen: Array<{ siteId: string; id: string; kind: string }> = [];
try {
  // Real demo persistence is confined to this newly created, removed fixture directory.
  const imported = await import('../src/lib/backyStore'); const store: any = imported.default || imported;
  const admissionModule = await import('../src/lib/editorMediaAdmission.ts'); const admission: any = admissionModule.default || admissionModule;
  const frontend = await import('../src/lib/frontendDesignContract'); const design: any = frontend.default || frontend;
  function load(relative: string, mocks: Record<string, any>) {
    const filename = fileURLToPath(new URL(relative, import.meta.url));
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} as any };
    vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, process, console: { error() {} }, fetch: () => { throw Error('Fixture network forbidden'); }, require: (id: string) => id === '@/lib/committedMutationFollowUp' ? committedFollowUp : id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename });
    return module.exports;
  }
  const committedFollowUp = load('../src/lib/committedMutationFollowUp.ts', {});
  const workflow = load('../src/lib/repositoryContentWorkflow.ts', {});
  const policy = load('../src/lib/adminContentStatusPolicy.ts', {});
  const repositoryPages = load('../src/lib/repositoryPages.ts', {});
  const core = require('@backy-cms/core');
  const authored: any = { elements: [{ id: 'rich', type: 'paragraph', x: 10, y: 20, width: 600, height: 300, responsive: { mobile: { width: 320 } }, props: { content: [{ type: 'interactive_component', componentKey: 'fixture.chart', version: '2.1.0', props: { nested: { value: 3 } }, dataBindings: { source: 'collection-proof' }, unknownWidgetMetadata: 'retained', children: [{ text: '' }] }] }, metadata: { unknownElementMetadata: { source: 'proof' } } }], canvasSize: { width: 1200, height: 800, layout: 'fluid', geometryExtra: 'kept' }, customCSS: '.proof {}', customJS: '', themeTokenRefs: { body: 'body-font' }, assets: { fonts: [{ id: 'font-proof', type: 'font' }] }, animations: { intro: 'fade' }, interactions: { next: { action: 'navigate' } }, dataBindings: { points: { collectionId: 'collection-proof' } }, editableMap: { rich: { elementId: 'rich', field: 'props.content', editable: true, valueType: 'json', control: 'text' } }, seo: { title: 'Proof' }, metadata: { customExtension: 'kept' } };
  const conversionBound = core.canvasContentPayloadToBackyContentDocument({ id: 'conversion-proof', kind: 'page', title: 'Conversion proof', rawContent: { ...authored, elements: [{ ...authored.elements[0], unknownRootExtension: { retained: 'both-store-modes' } }] } });
  assert.deepEqual(conversionBound.elements[0].unknownRootExtension, { retained: 'both-store-modes' }, 'Safe unknown root extensions retain their canonical path through conversion.');
  assert.equal(conversionBound.elements[0].metadata.unknownElementMetadata.source, 'proof');
  for (const demo of [true, false]) {
    const site = store.createAdminSite({ id: 'lifecycle-' + demo, slug: 'lifecycle-' + demo, name: 'Fixture site' });
    const seededFont = store.createMediaItem(site.id, { filename: 'proof.woff2', originalName: 'proof.woff2', type: 'font', mimeType: 'font/woff2', sizeBytes: 32, url: '/fixture-proof.woff2' }); const font = demo ? seededFont : { ...seededFont, id: '11111111-1111-4000-8000-111111111111' }; authored.assets.fonts[0].id = font.id;
    const rows: Record<string, Map<string, any>> = { page: new Map(), post: new Map() };
    let blocked = false, deny = '', fail = false, changes = 0, sequence = 0; const permissionCalls: string[] = [];
    function readiness(row: any) { return { id: row.id, title: row.title, slug: row.slug, path: '/' + row.slug, status: row.status, score: blocked ? 0 : 100, statusLabel: blocked ? 'blocked' : 'ready', checks: blocked ? [{ id: 'required', category: 'content', label: 'Content', status: 'fail', severity: 'error', message: 'Fixture required content' }] : [] }; }
    const siteReadiness = () => ({ pages: (demo ? store.getPageSummary(site.id, { includeUnpublished: true }) : [...rows.page.values()]).map(readiness), posts: (demo ? store.getBlogPosts(site.id, { includeUnpublished: true, limit: 1000, offset: 0 }).posts : [...rows.post.values()]).map(readiness) });
    const repo = (kind: string) => ({
      getById: async (s: string, id: string) => { if (fail) throw Error('fixture unavailable'); return s === site.id ? rows[kind].get(id) || null : null; },
      checkSlug: async (p: any) => ({ available: ![...rows[kind].values()].some(r => r.siteId === p.siteId && r.slug === p.slug && r.id !== p.excludePostId) }),
      list: async (p: any) => { let all = [...rows[kind].values()].filter(r => r.siteId === p.siteId && (p.status === 'all' || !p.status || r.status === p.status)); return { items: all.slice(p.offset, p.offset + p.limit), pagination: { total: all.length, limit: p.limit, offset: p.offset, hasMore: p.offset + p.limit < all.length } }; },
      create: async (input: any) => { const row = { ...input, id: kind + '-' + ++sequence, createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z' }; rows[kind].set(row.id, row); changes++; return { item: row }; },
      update: async (_s: string, id: string, input: any) => { const row = { ...rows[kind].get(id), ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedAt: '2026-10-04T01:00:00Z' }; rows[kind].set(id, row); changes++; return { item: row }; },
      publish: async (_s: string, id: string) => { const row = { ...rows[kind].get(id), status: 'published' }; rows[kind].set(id, row); changes++; return { item: row }; },
      archive: async (_s: string, id: string) => { const row = { ...rows[kind].get(id), status: 'archived' }; rows[kind].set(id, row); changes++; return { item: row }; },
      delete: async (_s: string, id: string) => { changes++; return rows[kind].delete(id); },
    });
    const repositories: any = { sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async () => null }, pages: repo('page'), posts: repo('post'), collections: { list: async () => ({ items: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } }) }, media: { getById: async (siteId: string, mediaId: string) => (siteId === site.id && mediaId === font.id ? font : null) }, settings: { get: async () => store.getAdminSettings() }, contentWorkflows: { createRevision: async () => ({}), deletePreviewTokensForTarget: async () => {}, createPreviewToken: async (p: any) => ({ token: 'fixture-private-preview', targetType: p.targetType, targetId: p.targetId, expiresAt: '2026-10-04T02:00:00Z' }) } };
    const mocks: any = { '@/lib/backyStore': store, '@/lib/editorMediaAdmission': admission, '@/lib/frontendDesignContract': design, '@/lib/adminContentStatusPolicy': policy, '@/lib/repositoryContentWorkflow': workflow, '@/lib/routeConflicts': { findPageRouteConflict: () => null }, '@/lib/repositoryPages': { ...repositoryPages, getRepositoryPageByPublicPath: async (_r: any, s: string, slug: string) => [...rows.page.values()].find(r => r.siteId === s && r.slug === slug) }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({ fixture: true }) }, '@/lib/adminAudit': { recordAdminAudit: async () => ({}) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/siteReadiness': { buildSiteReadiness: siteReadiness, buildRepositorySiteReadiness: async () => siteReadiness(), buildPageReadiness: readiness, buildRepositoryPageReadiness: readiness, readinessBlockingChecks: (r: any) => r.checks.filter((c: any) => c.severity === 'error' && c.status !== 'pass') }, '@/lib/adminAccess': { requireAdminAccess: async (_r: any, requestId: string, p: any) => { permissionCalls.push(p.permission); return deny === 'unauthenticated' ? NextResponse.json({ success: false, requestId, error: { code: 'UNAUTHORIZED', message: 'Fixture authentication required' } }, { status: 401 }) : deny === p.permission ? NextResponse.json({ success: false, requestId, error: { code: 'FORBIDDEN', message: 'Fixture permission denied' } }, { status: 403 }) : { session: { user: { id: 'fixture-actor' } } }; } } };
    async function call(path: string, method: string, body?: any, expected = 200, options: { id?: string; siteId?: string; query?: string; invalid?: boolean } = {}) {
      const normalized = path.replace('{pageId}', '[pageId]').replace('{postId}', '[postId]');
      const route = load('../src/app/api/admin/sites/[siteId]/' + normalized + '/route.ts', mocks);
      const targetSite = options.siteId || site.id;
      if (body && !options.invalid) assertLifecycleBody(path, method, 'request', body);
      const response = await route[method](new Request('http://fixture.invalid/api/admin/sites/' + targetSite + '/' + path.replace('{pageId}', options.id || 'missing').replace('{postId}', options.id || 'missing') + (options.query || ''), { method, headers: { 'content-type': 'application/json', 'x-request-id': 'lifecycle-proof' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId: targetSite, pageId: options.id, postId: options.id }) });
      assert.equal(response.status, expected, `${demo} ${method} ${path}`); const payload = await response.json();
      assertLifecycleBody(path, method, expected, payload);
      if (path.endsWith('/preview')) assert.equal(response.headers.get('cache-control'), 'private, no-store');
      checks++; return payload;
    }
    for (const [path, kind, field] of [['pages', 'page', 'page'], ['blog', 'post', 'post']] as const) {
      const param = kind === 'page' ? '{pageId}' : '{postId}', detail = path + '/' + param;
      const input = { title: 'Editable proof', slug: 'proof-' + kind, content: authored, meta: { frontendDesignTokens: { color: 'teal' }, unknown: { kept: true } } };
      const created = await call(path, 'POST', input, 201); const id = created.data[field].id;
      let current = (await call(detail, 'GET', undefined, 200, { id })).data[field];
      assert.deepEqual(current.content.elements[0].props.content, authored.elements[0].props.content);
      assert.equal(current.content.elements[0].metadata.unknownElementMetadata.source, 'proof'); assert.equal(current.content.canvasSize.geometryExtra, 'kept');
      assert.equal(current.meta.frontendDesignTokens.color, 'teal'); assert.equal(current.meta.unknown.kept, true);
      const companionMeta = demo ? JSON.parse('{"unknown":{"kept":true,"nested":{"value":4,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}},"title":"  Canonical metadata  ","noIndex":"false","frontendDesignTokens":{"color":"teal"},"__proto__":{"polluted":true}}') : input.meta;
      const companion = (await call(path, 'POST', { ...input, slug: 'companion-' + kind, meta: companionMeta }, 201)).data[field];
      if (demo) {
        assert.equal(companion.meta.title, 'Canonical metadata'); assert.equal(companion.meta.noIndex, false);
        assert.equal(Object.hasOwn(companion.meta, '__proto__'), false); assert.equal(Object.hasOwn(companion.meta.unknown.nested, 'constructor'), false);
        assert.equal(Object.hasOwn(companion.meta.unknown.nested, '__proto__'), false); assert.equal(({} as any).polluted, undefined);
        await call(detail, 'PATCH', { meta: { ...companion.meta, unknown: { kept: true, revised: ['persisted'], nested: { value: 4 } } } }, 200, { id: companion.id });
        reopen.push({ siteId: site.id, id: companion.id, kind });
      }
      const list = await call(path, 'GET', undefined, 200, { query: '?limit=1&offset=0' }); assert.equal(list.data.pagination.limit, 1); assert.equal(list.data.pagination.hasMore, true);
      const next = await call(path, 'GET', undefined, 200, { query: '?limit=1&offset=1' }); assert.equal(next.data.pagination.hasMore, false);
      const plural = kind === 'page' ? 'pages' : 'posts'; assert.equal(new Set([list.data[plural][0].id, next.data[plural][0].id]).size, 2);
      await call(path, 'POST', input, 409);
      await call(path, 'POST', { ...input, slug: 'bad-schedule-' + kind, status: 'scheduled' }, 400);
      await call(path, 'POST', { ...input, slug: 'past-schedule-' + kind, status: 'scheduled', scheduledAt: '2000-01-01T00:00:00Z' }, 400);
      await call(path, 'POST', { ...input, slug: 'missing-template-' + kind, frontendDesignTemplateId: 'does-not-exist' }, 400);
      await call(path, 'GET', undefined, 400, { query: '?limit=10000' });
      await call(detail, 'PATCH', { title: 'Retitled', expectedUpdatedAt: current.updatedAt, meta: { ...current.meta, unknown: { kept: true, revised: ['persisted'] } } }, 200, { id });
      current = (await call(detail, 'GET', undefined, 200, { id })).data[field]; assert.deepEqual(current.meta.unknown.revised, ['persisted']); assert.deepEqual(current.content.elements[0].props.content, authored.elements[0].props.content);
      await call(detail, 'PATCH', { title: 'Stale', expectedUpdatedAt: 'stale' }, 409, { id });
      await call(detail + '/readiness', 'GET', undefined, 200, { id });
      await call(detail + '/preview', 'POST', { ttlSeconds: 300 }, 200, { id });
      await call(detail + '/preview', 'POST', {}, 404, { id: 'foreign-target' });
      await call(detail + '/preview', 'POST', {}, 404, { id, siteId: 'foreign-site' });
      deny = 'unauthenticated'; await call(detail + '/preview', 'POST', {}, 401, { id });
      deny = 'pages.publish'; await call(detail + '/preview', 'POST', {}, 403, { id });
      await call(path, 'POST', { ...input, slug: 'not-permitted', status: 'published' }, 403);
      deny = ''; blocked = true; const before = changes; const rejection = await call(detail + '/publish', 'POST', { expectedUpdatedAt: current.updatedAt }, 400, { id }); assert.equal(rejection.error.code, 'READINESS_BLOCKED'); assert.equal(changes, before);
      blocked = false; await call(detail + '/publish', 'POST', { expectedUpdatedAt: 'stale' }, 409, { id });
      await call(detail + '/publish', 'POST', { expectedUpdatedAt: current.updatedAt }, 200, { id });
      await call(detail + '/archive', 'POST', { expectedUpdatedAt: 'stale' }, 409, { id });
      await call(detail + '/archive', 'POST', {}, 200, { id });
      if (!demo) { fail = true; await call(detail + '/preview', 'POST', {}, 500, { id }); fail = false; }
      deny = 'pages.delete'; await call(detail, 'DELETE', undefined, 403, { id }); deny = '';
      await call(detail, 'DELETE', undefined, 200, { id }); await call(detail, 'GET', undefined, 404, { id });
      await call(path, 'POST', { title: 'Bad', content: { elements: 'malformed' } }, 400, { invalid: true });
      if (kind === 'page') await call(path, 'POST', { title: 'Legacy', content: 'invalid-page-string' }, 400, { invalid: true });
    }
    assert.ok(permissionCalls.includes('pages.view') && permissionCalls.includes('pages.edit') && permissionCalls.includes('pages.publish') && permissionCalls.includes('pages.delete'));
  }
  // A fresh process must reopen the safe nested extensions from the actual demo file.
  const childSource = `import assert from 'node:assert/strict'; const imported = await import(${JSON.stringify(fileURLToPath(new URL('../src/lib/backyStore.ts', import.meta.url)))}); const store = imported.default || imported; for (const fixture of ${JSON.stringify(reopen)}) { const row = fixture.kind === 'page' ? store.getAdminPageById(fixture.siteId, fixture.id) : store.getAdminBlogPostById(fixture.siteId, fixture.id); assert.deepEqual(row.meta.unknown.revised, ['persisted']); assert.equal(row.meta.frontendDesignTokens.color, 'teal'); assert.equal(row.meta.title, 'Canonical metadata'); assert.equal(row.meta.noIndex, false); assert.equal(row.content.canvasSize.geometryExtra, 'kept'); assert.equal(row.content.elements[0].props.content[0].unknownWidgetMetadata, 'retained'); }`;
  execFileSync(process.execPath, ['--import', require.resolve('tsx'), '--input-type=module', '-e', childSource], { cwd: directory, stdio: 'pipe', env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) } }); checks += reopen.length;
  console.log(`Admin lifecycle actual-handler/OpenAPI response checks passed: ${checks} (demo and repository adapters).`);
} finally { process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); }
