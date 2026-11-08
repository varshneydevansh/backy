import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { NextRequest, NextResponse } from 'next/server';

// Actual saved handlers/normalizer/registry; storage, access and delivery alone
// are fixtures. No supplied import URL may cause network access.
const require = createRequire(import.meta.url);
let networkCalls = 0, checks = 0;
function load(relative: string, mocks: Record<string, any> = {}) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 const module = { exports: {} as any };
 vm.runInNewContext(compiled, { module, exports: module.exports, URL, URLSearchParams, Request, Response, Headers, Error, TypeError, Buffer, process, console: { error() {} },
  fetch: () => { networkCalls++; throw Error('Unexpected network call'); },
  require: (id: string) => id in mocks ? mocks[id] : id.startsWith('./') || id.startsWith('../')
    ? load(new URL(id.endsWith('.ts') ? id : `${id}.ts`, pathToFileURL(filename)).href, mocks)
    : id.startsWith('@/') ? (() => { throw Error('Missing mock: ' + id); })() : require(id),
 }, { filename });
 return module.exports;
}
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas = new Map<string, ts.Expression>(), paths = new Map<string, any>();
function visit(node: ts.Node) {
 if (ts.isPropertyAssignment(node)) {
  if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const property of node.initializer.properties) if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))) schemas.set(property.name.text, property.initializer);
  if (ts.isComputedPropertyName(node.name) && ts.isObjectLiteralExpression(node.initializer)) {
   const text = node.name.expression.getText(source);
   if (['`/api/admin/sites/${site.id}/templates`', '`/api/admin/sites/${site.id}/frontend-design`'].includes(text)) paths.set(text.includes('/templates') ? 'templates' : 'frontend-design', vm.runInNewContext('(' + node.initializer.getText(source) + ')'));
  }
 }
 ts.forEachChild(node, visit);
}
visit(source);
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }), loaded = new Set<string>();
function register(name: string) {
 if (loaded.has(name)) return; loaded.add(name);
 const expression = schemas.get(name); assert(expression, name);
 const value = vm.runInNewContext('(' + expression.getText(source) + ')', { envelopeSchema: (data: any) => ({ type: 'object', required: ['success', 'requestId', 'data'], properties: { success: { type: 'boolean' }, requestId: { type: 'string' }, data } }) });
 for (const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g)) register(ref[1]);
 ajv.addSchema(value, '#/components/schemas/' + name);
}
function validate(ref: string, payload: any, valid = true) {
 register(ref.split('/').at(-1)!); const check = ajv.getSchema(ref)!;
 assert.equal(Boolean(check(payload)), valid, ajv.errorsText(check.errors)); checks++;
}
const normalizer = load('../src/lib/frontendDesignContract.ts'), registry = load('../src/lib/templateRegistry.ts');
const nested = { elements: [{ id: 'parent', type: 'container', layoutMode: 'flex', children: [{ id: 'child', type: 'codeComponent', registeredComponent: { componentKey: 'fixture.widget', version: '2.0.0' }, extension: { retain: [0, false] }, animation: { type: 'custom', from: { x: 0 }, to: { x: 55 } }, responsive: { mobile: { width: '100%' } }, props: { source: '<Static />' } }] }], dataBindings: [{ id: 'binding' }], editableMap: [{ role: 'title' }], customJS: '/* inert source */' };
const initial = normalizer.normalizeFrontendDesignContract({ status: 'captured', source: { type: 'custom-frontend', label: 'Fixture', repositoryUrl: 'https://frontend.fixture.invalid/repository', frontendUrl: 'https://frontend.fixture.invalid' }, templates: [
 { id: 'page-template', type: 'page', name: 'Research page', version: 3, status: 'active', updatedAt: '2026-01-01T00:00:00Z', content: nested },
 { id: 'post-template', type: 'blogPost', name: 'Blog template', version: '4.0', content: { elements: [] } },
] });
function fixture(demo: boolean) {
 let site: any = { id: 'design-site', slug: 'design-slug', name: 'Design fixture', customDomain: null, isPublished: false, theme: { colors: {}, fonts: {} }, settings: { frontendDesign: structuredClone(initial), preservedSetting: { keep: true } } };
 let denial = 0, conflict = false, writes = 0, reads = 0;
 const permissions: string[] = [], captured: any[] = [], audits: any[] = [];
 const resource = (scope: string, id: string) => {
  assert.equal(scope, site.id, 'Captured lookups use canonical site identity'); reads++;
  return id === 'resource-local' ? { id, siteId: scope, title: 'Captured title', name: 'Captured name', slug: 'resource-local', status: 'draft', content: structuredClone(nested), fields: [{ key: 'title', type: 'text', label: 'Title' }], settings: {}, metadata: {}, values: { title: 'Product' } } : null;
 };
 const collection = (scope: string, id: string) => { assert.equal(scope, site.id); reads++; return ['products', 'collection-local'].includes(id) ? { id: 'collection-local', siteId: scope, slug: 'products', name: 'Products', fields: [{ key: 'title', label: 'Title', type: 'text' }], metadata: {} } : null; };
 const findSite = (id: string) => { reads++; return [site.id, site.slug].includes(id) ? structuredClone(site) : null; };
 const pages = Array.from({ length: 14 }, (_, index) => ({ id: 'page-' + index, title: 'Page ' + index, slug: 'page-' + index }));
 const repositories: any = { sites: { getById: async (id: string) => id === site.id ? findSite(id) : null, getBySlug: async (id: string) => findSite(id) }, pages: { getById: async (scope: string, id: string) => resource(scope, id), list: async ({ siteId }: any) => { assert.equal(siteId, site.id); return { items: pages }; } }, posts: { getById: async (scope: string, id: string) => resource(scope, id) }, forms: { getById: async (scope: string, id: string) => resource(scope, id) }, collections: { getById: async (scope: string, id: string) => collection(scope, id), getBySlug: async (scope: string, id: string) => collection(scope, id), getRecordById: async (scope: string, collectionId: string, id: string) => { assert.equal(collectionId, 'collection-local'); return resource(scope, id); }, getRecordBySlug: async () => null }, reusableSections: { getById: async (scope: string, id: string) => resource(scope, id), getBySlug: async () => null } };
 const persist = async (_site: any, frontendDesign: any, context: any) => { if (conflict) throw Object.assign(Error('Reload'), { code: 'TEMPLATE_HISTORY_CONFLICT' }); writes++; captured.push(context); site = { ...site, settings: { ...site.settings, frontendDesign: structuredClone(frontendDesign) } }; return structuredClone(site); };
 const mocks = {
  '@/lib/adminAccess': { requireAdminAccess: async (_request: any, requestId: string, options: any) => { permissions.push(options.permission); return denial ? NextResponse.json({ success: false, requestId, error: { code: 'FIXTURE_DENIAL', message: 'Denied' } }, { status: denial }) : { session: { user: { id: 'fixture-operator' } } }; } },
  '@/lib/backyStore': { getSiteByIdOrSlug: findSite, getAdminPageById: resource, getAdminBlogPostById: resource, getFormById: resource, getCollectionByIdOrSlug: collection, getCollectionRecordByIdOrSlug: (scope: string, _collection: string, id: string) => resource(scope, id), getReusableSectionByIdOrSlug: resource, getPageSummary: (scope: string) => { assert.equal(scope, site.id); return pages; } },
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
  '@/lib/frontendDesignContract': normalizer, '@/lib/templateRegistry': registry,
  '@/lib/templateHistory': { persistFrontendDesignWithHistory: persist },
  '@/lib/adminAudit': { recordAdminAudit: async (input: any) => { audits.push(input); } },
  '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({ scope: 'settings', status: 'recorded' }) },
  '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({ status: 'skipped' }) },
 };
 const design = load('../src/app/api/admin/sites/[siteId]/frontend-design/route.ts', mocks), templates = load('../src/app/api/admin/sites/[siteId]/templates/route.ts', mocks);
 async function call(path: string, method: string, status: number, body?: unknown, scope = site.slug, raw?: string) {
  const resourcePath = path.split('?')[0], op = paths.get(resourcePath)?.[method.toLowerCase()]; assert(op);
  if (method === 'POST' && status < 400) validate(op.requestBody.content['application/json'].schema.$ref, body);
  const response = await (resourcePath === 'templates' ? templates : design)[method](new NextRequest('http://fixture.invalid/api/admin/sites/' + scope + '/' + path, { method, ...(body !== undefined || raw !== undefined ? { headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId: scope }) });
  assert.equal(response.status, status, `${demo} ${method} ${path}`); const payload = await response.json(); validate(op.responses[String(status)].content['application/json'].schema.$ref, payload); return payload;
 }
 return { call, permissions, captured, audits, get site() { return site; }, get writes() { return writes; }, get reads() { return reads; }, deny: (status: number) => { denial = status; }, conflict: () => { conflict = true; } };
}
const actionRef = '#/components/schemas/AdminFrontendDesignActionRequest';
for (const invalid of [{}, { action: 'unknown' }, { action: 'import' }, { action: 'import', manifest: {} }, { action: 'capture-content-template', resourceType: 'unknown', resourceId: 'local' }, { action: 'capture-content-template', resourceType: 'page', resourceId: '  ' }]) validate(actionRef, invalid, false);
for (const demo of [true, false]) {
 const f = fixture(demo);
 assert.equal(paths.get('templates').get['x-backy-permission'], 'pages.view');
 assert.equal(paths.get('frontend-design').post['x-backy-permission'], 'sites.configure');
 for (const denial of [401, 403]) { f.deny(denial); const reads = f.reads; await f.call('templates', 'GET', denial); await f.call('frontend-design', 'POST', denial, { action: 'capture-site-defaults' }); assert.equal(f.reads, reads); assert.equal(f.writes, 0); }
 f.deny(0);
 const filtered = (await f.call('templates?type=page&search=RESEARCH', 'GET', 200)).data; assert.equal(filtered.templates.length, 1); assert.equal(filtered.registry.totalTemplateCount, 2); assert.equal(filtered.site.id, 'design-site'); assert.equal(filtered.templates[0].clone.endpoint, '/api/admin/sites/design-site/pages');
 const unknown = (await f.call('templates?type=unsupported', 'GET', 200)).data; assert.equal(unknown.templates.length, 2); assert.equal(unknown.templates[0].contentSummary.elementCount, 1); assert.equal(unknown.registry.versionSummary.missingUpdatedAtCount, 1);
 await f.call('frontend-design', 'GET', 200);
 await f.call('templates', 'GET', 404, undefined, 'missing-site');
 for (const input of [{ action: 'unsupported' }, { action: 'import' }, { action: 'capture-content-template', resourceType: 'page' }]) { const writes = f.writes; await f.call('frontend-design', 'POST', 400, input); assert.equal(f.writes, writes); }
 await f.call('frontend-design', 'POST', 400, undefined, 'design-site', '{');
 await f.call('frontend-design', 'POST', 400, { action: 'import', frontendDesign: { runtime: { capabilities: [] } } });
 for (const input of [
  { action: 'import-frontend-contract', frontendDesign: initial }, { action: 'import', contract: initial }, { action: 'connect-frontend', design: initial },
  { action: 'connect-custom-frontend', manifest: { site: { frontendDesign: initial } } }, { action: 'import', manifest: { data: { site: { frontendDesign: initial } } } },
  { action: 'import', site: { frontendDesign: initial } }, { action: 'import', data: { site: { frontendDesign: initial } } },
 ]) {
  await f.call('frontend-design', 'POST', 200, input);
  assert.deepEqual(f.site.settings.frontendDesign.templates[0].content.elements[0].children[0], nested.elements[0].children[0]);
  assert.deepEqual(f.site.settings.frontendDesign.templates[0].content.dataBindings, nested.dataBindings);
  assert.equal(f.site.settings.frontendDesign.templates[0].content.customJS, nested.customJS, 'Authored code remains inert stored template data');
  assert.deepEqual(f.site.settings.preservedSetting, { keep: true });
 }
 for (const type of ['page', 'blogPost', 'form', 'product', 'section']) {
  await f.call('frontend-design', 'POST', 200, { action: 'capture-content-template', resourceType: type, resourceId: 'resource-local', templateId: 'capture-' + type });
  assert(f.site.settings.frontendDesign.templates.some((t: any) => t.id === 'capture-' + type));
 }
 await f.call('frontend-design', 'POST', 200, { action: 'capture-content-template', type: 'collections', resourceId: 'collection-local', templateId: 'capture-collection' });
 await f.call('frontend-design', 'POST', 404, { action: 'capture-content-template', resourceType: 'page', resourceId: 'foreign-resource' });
 await f.call('frontend-design', 'POST', 200, { action: 'capture-site-defaults' }); assert.equal(f.site.settings.frontendDesign.templates.filter((t: any) => t.type === 'page').length, 12, 'Defaults capture advertises its existing twelve-page bound');
 assert(f.permissions.includes('sites.view') && f.permissions.includes('pages.view') && f.permissions.includes('sites.configure'));
 assert(f.captured.every(entry => entry.actorId === 'fixture-operator')); assert(f.audits.some(entry => entry.action === 'frontendDesign.import'));
 const writes = f.writes; f.conflict(); await f.call('frontend-design', 'POST', 409, { action: 'capture-site-defaults' }); assert.equal(f.writes, writes);
}
assert.equal(networkCalls, 0);
console.log(`Admin design/template actual-handler/schema checks passed: ${checks}; demo/repository adapters, imported nested data, aliases, filters, canonical scope, early auth denial, validation and history conflicts. Real PostgreSQL/auth/browser proof remains separate.`);
