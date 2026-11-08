import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';

// Execute the saved route and its real compatibility/normalization code. Only
// access, storage and delivery boundaries are fixtures; no provider is contacted.
const require = createRequire(import.meta.url);
let networkCalls = 0;
function load(relative: string, mocks: Record<string, unknown> = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL, Buffer, Error, TypeError, crypto: webcrypto,
    console: { error() {} },
    fetch: () => { networkCalls++; throw new Error('Network access is forbidden in this route fixture'); },
    require: (id: string) => id in mocks ? mocks[id] : id.startsWith('./') || id.startsWith('../')
      ? load(new URL(id.endsWith('.ts') ? id : `${id}.ts`, pathToFileURL(filename)).href, mocks)
      : id.startsWith('@/') ? {} : require(id),
  }, { filename });
  return module.exports;
}
const canvasLayout = load('../../../packages/core/src/canvas-layout.ts');
const core = load('../../../packages/core/src/frontend-compatibility.ts', { './canvas-layout': canvasLayout });
const designContract = load('../src/lib/frontendDesignContract.ts', { '@backy-cms/core': core });
const revision = '2026-10-04T00:00:00.000Z';
const runtime = {
  schemaVersion: 'backy.frontend-runtime.v1', frontendId: 'fixture.frontend', version: '1.2.3',
  capabilities: { 'element.text': 'supported', 'element.codeComponent': 'supported', 'layout.breakpoints': 'supported', 'design.tokens': 'supported' },
  componentVersions: { 'fixture.widget': ['2.0.0'] },
};
const element = { id: 'heading', type: 'text', props: { content: 'Original heading' }, children: [] };
const content = { schemaVersion: 'backy.content.v1', id: 'document', kind: 'page', version: '1', elements: [element], editableMap: {} };
const initialSite = {
  id: 'compatibility-site', slug: 'compatibility-slug', name: 'Compatibility fixture', isPublished: false,
  settings: { preservedSetting: { retain: true }, frontendDesign: {
    schemaVersion: 'backy.frontend-design.v1', status: 'captured', source: { type: 'manual', label: 'Fixture source' },
    tokens: {}, chrome: {}, runtime, updatedAt: revision,
    templates: [{ id: 'template-local', name: 'Local template', type: 'page', routePattern: '/fixture/:slug', updatedAt: revision, content }],
    editableMap: [{ role: 'heading', elementId: 'heading', field: 'props.content', editable: true, valueType: 'string' }], notes: 'Preserve notes',
  } },
};
interface FixtureOptions { denied?: boolean; demo?: boolean; siteMissing?: boolean; bySlug?: boolean; page?: any; post?: any }
function fixture(options: FixtureOptions = {}) {
  let site = structuredClone(initialSite);
  const page = options.page || { id: 'page-local', siteId: site.id, slug: 'about', updatedAt: revision, content: structuredClone(content) };
  const post = options.post || { id: 'post-local', siteId: site.id, slug: 'story', updatedAt: revision, content: structuredClone(content) };
  const effects = { permissions: [] as string[], reads: [] as string[], updates: 0, audits: 0, invalidations: 0, webhooks: 0 };
  const scoped = (kind: 'page' | 'post', scope: string, id: string) => {
    effects.reads.push(`${kind}:${scope}:${id}`);
    assert.equal(scope, site.id, 'Repository and demo reads use resolved canonical site ID');
    const item = kind === 'page' ? page : post;
    return id === item.id ? item : null;
  };
  const sites = {
    getById: async (id: string) => { effects.reads.push('site:' + id); return !options.siteMissing && !options.bySlug && id === site.id ? site : null; },
    getBySlug: async (slug: string) => { effects.reads.push('slug:' + slug); return !options.siteMissing && slug === site.slug ? site : null; },
    update: async (id: string, value: any) => { assert.equal(id, site.id); effects.updates++; site = { ...site, ...value }; return { item: site }; },
  };
  const repositories = { sites, pages: { getById: async (scope: string, id: string) => scoped('page', scope, id) }, posts: { getById: async (scope: string, id: string) => scoped('post', scope, id) } };
  const mocks = {
    'next/server': { NextResponse }, '@backy-cms/core': core, '@/lib/frontendDesignContract': designContract,
    '@/lib/adminAccess': { requireAdminAccess: async (_request: Request, _id: string, policy: { permission: string }) => {
      effects.permissions.push(policy.permission);
      return options.denied ? NextResponse.json({ success: false, error: { code: 'FORBIDDEN_PERMISSION' } }, { status: 403 }) : { session: { user: { id: 'fixture-author' } } };
    } },
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => Boolean(options.demo), getRequiredDatabaseRepositories: async () => repositories },
    '@/lib/backyStore': {
      getSiteByIdOrSlug: (id: string) => { effects.reads.push('demo-site:' + id); return !options.siteMissing && [site.id, site.slug].includes(id) ? site : null; },
      getAdminPageById: (scope: string, id: string) => scoped('page', scope, id), getAdminBlogPostById: (scope: string, id: string) => scoped('post', scope, id),
      updateAdminSite: (id: string, value: any) => { assert.equal(id, site.id); effects.updates++; site = { ...site, ...value }; return site; },
    },
    '@/lib/adminAudit': { recordAdminAudit: async () => { effects.audits++; } },
    '@/lib/templateHistory': { persistFrontendDesignWithHistory: async (current: any, frontendDesign: any) => {
      assert.equal(current.id, site.id); effects.updates++; site = { ...site, settings: { ...site.settings, frontendDesign } }; return site;
    } },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { effects.invalidations++; return {}; } },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { effects.webhooks++; } },
    '@/lib/templateRegistry': { buildTemplateRegistry: () => ({ schemaVersion: 'fixture', totalTemplateCount: 1 }) },
  };
  const compatibility = load('../src/app/api/admin/sites/[siteId]/custom-frontend/compatibility/route.ts', mocks);
  const declaration = load('../src/app/api/admin/sites/[siteId]/frontend-design/route.ts', mocks);
  async function call(method: 'GET' | 'POST' | 'PATCH', query = '', body?: unknown, raw?: string) {
    const identifier = options.bySlug ? site.slug : site.id;
    const path = method === 'PATCH' ? 'frontend-design' : 'custom-frontend/compatibility';
    const request = new Request(`http://fixture.invalid/api/admin/sites/${identifier}/${path}${query}`, {
      method, headers: { 'x-request-id': 'fixture-request', 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(body) }),
    });
    const response = await (method === 'PATCH' ? declaration : compatibility)[method](request, { params: Promise.resolve({ siteId: identifier }) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { call, effects, site: () => site };
}
const observation = (changes: any = {}) => ({
  siteId: initialSite.id, route: '/about', frontendId: runtime.frontendId, frontendVersion: runtime.version, revision,
  breakpoint: 'desktop', complete: true,
  elements: [{ id: element.id, type: element.type, parentId: null, fields: { 'props.content': element.props.content } }], ...changes,
});
let passed = 0;
const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; } catch (error) { failures.push(`${name}: ${String(error)}`); }
}
await check('GET denial uses sites.view before inspecting target', async () => {
  const f = fixture({ denied: true }); const r = await f.call('GET', '?templateId=template-local');
  assert.equal(r.status, 403); assert.deepEqual(f.effects.permissions, ['sites.view']); assert.deepEqual(f.effects.reads, []); assert.equal(r.body.data, undefined);
});
await check('POST denial precedes body parsing', async () => {
  const f = fixture({ denied: true }); const r = await f.call('POST', '', undefined, '{not JSON');
  assert.equal(r.status, 403); assert.deepEqual(f.effects.permissions, ['sites.view']); assert.deepEqual(f.effects.reads, []);
});
for (const demo of [false, true]) for (const [query, route, scope] of [
  ['?pageId=page-local', '/about', 'page'], ['?postId=post-local', '/blog/story', 'post'], ['?templateId=template-local', '/fixture/:slug', null],
] as const) await check(`${demo ? 'demo' : 'repository'} ${scope || 'template'} is scoped and private`, async () => {
  const f = fixture({ demo }); const r = await f.call('GET', query); assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store'); assert.equal(r.headers.get('vary'), 'Cookie, Authorization');
  assert.equal(r.body.data.report.siteId, initialSite.id); assert.equal(r.body.data.report.route, route); assert.equal(r.body.data.report.revision, revision);
  assert.equal(r.body.data.report.certification, 'not-live-certified');
  if (scope) assert(f.effects.reads.includes(`${scope}:${initialSite.id}:${scope}-local`));
  else assert(!f.effects.reads.some(read => /^(page|post):/.test(read)));
  assert.equal(f.effects.updates, 0); assert.equal(f.effects.webhooks, 0);
});
await check('slug lookup resolves canonical site ID for content', async () => {
  const f = fixture({ bySlug: true }); const r = await f.call('GET', '?pageId=page-local'); assert.equal(r.status, 200);
  assert(f.effects.reads.includes('slug:' + initialSite.slug)); assert(f.effects.reads.includes(`page:${initialSite.id}:page-local`));
});
for (const page of [{ isHomepage: true, slug: 'landing' }, { isHomepage: false, slug: 'index' }]) await check('homepage identity is canonical /', async () => {
  const f = fixture({ page: { id: 'page-local', content, updatedAt: revision, ...page } }); assert.equal((await f.call('GET', '?pageId=page-local')).body.data.report.route, '/');
});
for (const query of ['', '?pageId=page-local&postId=post-local', '?templateId=template-local&pageId=page-local']) await check('ambiguous or absent target is rejected before lookup', async () => {
  const f = fixture(); const r = await f.call('GET', query); assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_TARGET'); assert.deepEqual(f.effects.reads, []);
});
await check('missing site has closed response', async () => { assert.equal((await fixture({ siteMissing: true }).call('GET', '?pageId=page-local')).body.error.code, 'SITE_NOT_FOUND'); });
for (const query of ['?pageId=foreign-page', '?postId=foreign-post', '?templateId=foreign-template']) await check('foreign resource cannot be selected', async () => {
  const r = await fixture().call('GET', query); assert.equal(r.status, 404); assert.equal(r.body.error.code, 'TARGET_NOT_FOUND'); assert.equal(r.body.data, undefined);
});
for (const raw of ['{not JSON', '[]', 'null']) await check('POST invalid JSON/object is rejected', async () => {
  const f = fixture(); const r = await f.call('POST', '', undefined, raw); assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_JSON'); assert.deepEqual(f.effects.reads, []);
});
await check('oversized POST is rejected before repository lookup', async () => {
  const f = fixture(); const r = await f.call('POST', '', undefined, JSON.stringify({ padding: 'x'.repeat(262145) }));
  assert.equal(r.status, 413); assert.equal(r.body.error.code, 'OBSERVATION_TOO_LARGE'); assert.deepEqual(f.effects.reads, []);
});
for (const value of [
  observation({ breakpoint: 'mobil' }), observation({ siteId: '' }), observation({ elements: [{ id: 'duplicate' }, { id: 'duplicate' }] }),
  observation({ elements: Array.from({ length: 10001 }, (_, i) => ({ id: 'e' + i })) }),
]) await check('invalid bounded observation is rejected', async () => {
  const f = fixture(); const r = await f.call('POST', '', { pageId: 'page-local', observation: value });
  assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_OBSERVATION'); assert.deepEqual(f.effects.reads, []);
});
await check('same identity/revision fields compare without granting certification', async () => {
  const r = await fixture().call('POST', '', { pageId: 'page-local', observation: observation() }); assert.equal(r.status, 200);
  assert.equal(r.body.data.report.issues.length, 0); assert.equal(r.body.data.report.certification, 'not-live-certified');
});
await check('matching revision produces exact field mismatch location', async () => {
  const r = await fixture().call('POST', '', { pageId: 'page-local', observation: observation({ elements: [{ id: element.id, type: element.type, parentId: null, fields: { 'props.content': 'Changed' } }] }) });
  const issue = r.body.data.report.issues.find((item: any) => item.code === 'renderer.property.mismatch');
  assert.equal(issue.contentPath, '/elements/0/props/content'); assert.equal(issue.elementId, element.id); assert.equal(issue.breakpoint, 'desktop'); assert.equal(issue.expected, element.props.content); assert.equal(issue.observed, 'Changed'); assert.equal(issue.evidence, 'supplied-observation');
});
for (const changes of [{ siteId: 'foreign-site' }, { route: '/foreign' }, { frontendId: 'foreign.frontend' }, { frontendVersion: '9.9.9' }, { revision: 'stale' }]) await check('foreign identity or stale revision cannot compare fields', async () => {
  const r = await fixture().call('POST', '', { pageId: 'page-local', observation: observation({ ...changes, elements: [] }) });
  assert(r.body.data.report.issues.some((item: any) => item.code.startsWith('observations.') && item.status === 'unverified'));
  assert(!r.body.data.report.issues.some((item: any) => item.code.startsWith('renderer.')));
});
await check('canonical component metadata requires exact declared version', async () => {
  const f = fixture({ page: { id: 'page-local', slug: 'about', updatedAt: revision, content: { ...content, elements: [{ id: 'widget', type: 'codeComponent', componentKey: 'fixture.widget', version: '3.0.0', props: {}, children: [], fallback: { text: 'Safe fallback' } }] } } });
  const r = await f.call('GET', '?pageId=page-local'); const issue = r.body.data.report.issues.find((item: any) => item.code === 'component.version.unsupported');
  assert.equal(issue.elementId, 'widget'); assert.equal(issue.contentPath, '/elements/0'); assert.deepEqual(issue.expected, { componentKey: 'fixture.widget', version: '3.0.0' });
});
await check('large authored trees return limit error without partial report', async () => {
  const f = fixture({ page: { id: 'page-local', slug: 'about', updatedAt: revision, content: { elements: Array.from({ length: 10001 }, (_, i) => ({ ...element, id: 'e' + i })) } } });
  const r = await f.call('GET', '?pageId=page-local'); assert.equal(r.status, 422); assert.equal(r.body.error.code, 'CONTENT_LIMIT'); assert.equal(r.body.data, undefined);
});
await check('supplied URL is never fetched or promoted to live evidence', async () => {
  const r = await fixture().call('POST', '', { pageId: 'page-local', url: 'http://127.0.0.1/private', observation: { ...observation(), url: 'http://127.0.0.1/private' } });
  assert.equal(r.status, 200); assert.equal(r.body.data.report.certification, 'not-live-certified'); assert.equal(networkCalls, 0);
});
for (const demo of [false, true]) {
  await check(`${demo ? 'demo' : 'repository'} declaration PATCH rejects invalid enums without writes`, async () => {
    const f = fixture({ demo }); const r = await f.call('PATCH', '', { runtime: { ...runtime, capabilities: { 'element.text': ['supported'] } } });
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_FRONTEND_RUNTIME'); assert.deepEqual(f.effects.permissions, ['sites.configure']); assert.equal(f.effects.updates, 0); assert.equal(f.effects.audits, 0); assert.equal(f.effects.webhooks, 0);
  });
  await check(`${demo ? 'demo' : 'repository'} declaration PATCH preserves existing design and settings`, async () => {
    const f = fixture({ demo }); const before = structuredClone(f.site().settings); const r = await f.call('PATCH', '', { runtime: { ...runtime, version: '1.2.4' } });
    assert.equal(r.status, 200); assert.equal(f.effects.updates, 1); assert.equal(f.effects.audits, 1); assert.equal(f.effects.webhooks, 1);
    assert.deepEqual(f.site().settings.preservedSetting, before.preservedSetting); assert.deepEqual(JSON.parse(JSON.stringify(f.site().settings.frontendDesign.templates)), before.frontendDesign.templates);
    assert.deepEqual(JSON.parse(JSON.stringify(f.site().settings.frontendDesign.editableMap)), before.frontendDesign.editableMap); assert.equal(f.site().settings.frontendDesign.notes, before.frontendDesign.notes);
    assert.equal(f.site().settings.frontendDesign.runtime.version, '1.2.4'); assert.equal(networkCalls, 0);
  });
}
const domEvidence = { schemaVersion: 'backy.frontend-dom-evidence.v1', source: 'browser-dom', capturedAt: '2026-10-05T00:00:00Z', viewport: { width: 1200, height: 800 }, expectedCount: 1, capturedCount: 1, limitations: [] };
const elementDom = { rect: { x: 300, y: 500, width: 220, height: 80 }, visibility: 'rendered', positioning: 'absolute', transformed: false };
await check('DOM evidence retains exact mismatch without comparing viewport rectangle to authored geometry', async () => {
  const r = await fixture().call('POST', '', { pageId: 'page-local', observation: observation({ domCapture: domEvidence, elements: [{ id: element.id, type: 'wrong-type', parentId: null, dom: elementDom }] }) });
  assert.equal(r.status, 200);
  const issues = r.body.data.report.issues;
  assert(issues.some((item: any) => item.code === 'renderer.property.mismatch' && item.contentPath === '/elements/0/type'));
  assert(issues.some((item: any) => item.code === 'observations.dom.scope.unverified'));
  assert(!issues.some((item: any) => item.contentPath.includes('/dom/rect')));
  assert.equal(r.body.data.report.certification, 'not-live-certified');
});
await check('DOM inventory denial occurs before parsing provenance or inspecting content', async () => {
  const f = fixture({ denied: true }); const r = await f.call('POST', '', { pageId: 'page-local', observation: observation({ domCapture: domEvidence }) });
  assert.equal(r.status, 403); assert.deepEqual(f.effects.reads, []); assert.equal(f.effects.updates, 0);
});
await check('malformed DOM geometry/capture counts reject before content reads', async () => {
  for (const change of [{ ...domEvidence, capturedCount: 0 }, { ...domEvidence, limitations: ['authorization.private-value'] }]) {
    const f = fixture(); const r = await f.call('POST', '', { pageId: 'page-local', observation: observation({ domCapture: change }) });
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_OBSERVATION'); assert.deepEqual(f.effects.reads, []);
  }
});
await check('incomplete DOM evidence cannot claim absent registered children are missing', async () => {
  const r = await fixture().call('POST', '', { pageId: 'page-local', observation: observation({ elements: [], domCapture: { ...domEvidence, capturedCount: 0, limitations: ['expected-element.absent'] } }) });
  assert.equal(r.status, 200);
  assert(r.body.data.report.issues.some((item: any) => item.code === 'renderer.element.unverified'));
  assert(!r.body.data.report.issues.some((item: any) => item.code === 'renderer.element.missing'));
});
if (failures.length) { console.error(failures.join('\n')); throw new Error(`${failures.length} of ${passed + failures.length} compatibility route checks failed`); }
console.log(`Frontend compatibility actual-route checks passed: ${passed}. Access/storage/delivery boundaries are mocked; live browser rendering remains separate.`);
