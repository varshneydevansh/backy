import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { NextRequest, NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
let checks = 0, networkCalls = 0;
function load(relative: string, mocks: Record<string, any> = {}) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 const module = { exports: {} as any };
 vm.runInNewContext(compiled, { module, exports: module.exports, URL, URLSearchParams, Request, Response, Headers, Error, Buffer, process, console: { error() {} }, fetch: () => { networkCalls++; throw Error('Unexpected network call'); }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing mock ' + id); })() : require(id) }, { filename });
 return module.exports;
}
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas = new Map<string, ts.Expression>(), operations = new Map<string, any>(), publicOperations = new Map<string, any>();
function visit(node: ts.Node) {
 if (ts.isPropertyAssignment(node)) {
  if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) schemas.set(p.name.text, p.initializer);
  if (ts.isComputedPropertyName(node.name) && ts.isObjectLiteralExpression(node.initializer)) {
   const path = node.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
   for (const name of ['navigation', 'render']) if (path === '/api/sites/{siteId}/' + name) publicOperations.set(name, vm.runInNewContext('(' + node.initializer.getText(source) + ')'));
   for (const name of ['navigation', 'seo', 'redirects']) if (path === '/api/admin/sites/{siteId}/' + name) operations.set(name, vm.runInNewContext('(' + node.initializer.getText(source) + ')'));
  }
 }
 ts.forEachChild(node, visit);
}
visit(source);
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }), loaded = new Set<string>();
function register(name: string) {
 if (loaded.has(name)) return; loaded.add(name); const expression = schemas.get(name); assert(expression, name);
 const value = vm.runInNewContext('(' + expression.getText(source) + ')');
 for (const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g)) register(ref[1]);
 ajv.addSchema(value, '#/components/schemas/' + name);
}
function validate(ref: string, payload: any, valid = true) {
 register(ref.split('/').at(-1)!); const test = ajv.getSchema(ref)!; assert.equal(Boolean(test(payload)), valid, ajv.errorsText(test.errors)); checks++;
}
assert.equal([...operations.values()].reduce((total, op) => total + Object.keys(op).length, 0), 7);
const core = require('@backy-cms/core'), navigation = load('../src/lib/navigation.ts'), pagination = load('../src/lib/collectionExportPagination.ts'), routes = load('../src/lib/collectionRoutes.ts'), redirectRules = load('../src/lib/redirectRules.ts');
function fixture(demo: boolean) {
 let site: any = { id: 'config-site', slug: 'config-slug', name: 'Config fixture', teamId: 'fixture-team', settings: { ...structuredClone(core.DEFAULT_SITE_SETTINGS), frontendDesign: { templates: [{ id: 'owned-template' }] }, unrelated: { preserve: true } } };
 let reads = 0, writes = 0, deny = 0, incomplete = false;
 const audits: any[] = [], permissions: string[] = [];
 const pages = Array.from({ length: 205 }, (_, index) => ({ id: 'page-' + index, siteId: site.id, title: 'Page ' + index, slug: 'page-' + index, status: index === 1 ? 'draft' : 'published', isHomepage: index === 0 }));
 const posts = [{ id: 'post-local', siteId: site.id, title: 'Post', slug: 'story', status: 'published' }];
 const collections = Array.from({ length: 8 }, (_, index) => ({ id: 'collection-' + index, siteId: site.id, name: 'Collection ' + index, slug: 'collection-' + index, listRoutePattern: '/collection-' + index, routePattern: '/collection-' + index + '/:recordSlug' }));
 const records = [{ id: 'record-local', siteId: site.id, slug: 'record', values: { title: 'Record title' } }];
 const canonical = (scope: string) => { assert.equal(scope, site.id, 'Every content/config lookup uses canonical site identity'); reads++; };
 const page = (items: any[], input: any) => { canonical(input.siteId); const limit = Math.min(input.limit ?? 100, 100), offset = input.offset ?? 0; return { items: items.slice(offset, offset + limit), pagination: { total: incomplete && offset > 0 ? items.length + 1 : items.length, limit, offset, hasMore: offset + limit < items.length } }; };
 const find = (id: string) => { reads++; return [site.id, site.slug].includes(id) ? structuredClone(site) : null; };
 const update = (id: string, input: any) => { canonical(id); writes++; assert.equal(input.settings.frontendDesign, undefined, 'Ordinary configuration writes never replace managed frontend design'); site = { ...site, ...input, settings: { ...site.settings, ...input.settings } }; return structuredClone(site); };
 const repositories = { sites: { getById: async (id: string) => id === site.id ? find(id) : null, getBySlug: async (id: string) => find(id), update: async (id: string, input: any) => ({ item: update(id, input) }) }, pages: { list: async (input: any) => page(pages, input) }, posts: { list: async (input: any) => page(posts, input) }, collections: { list: async (input: any) => page(collections, input), listRecords: async (input: any) => { assert(collections.some(c => c.id === input.collectionId)); return page(records, input); } } };
 const store = { getSiteByIdOrSlug: find, updateAdminSite: update, getPageSummary: (scope: string) => { canonical(scope); return pages; }, getBlogPosts: (scope: string) => { canonical(scope); return { posts }; }, listCollections: (scope: string) => { canonical(scope); return collections; }, listCollectionRecords: (scope: string) => { canonical(scope); return { records }; } };
 const mocks = { '@/lib/backyStore': store, '@/lib/navigation': navigation, '@/lib/collectionExportPagination': pagination, '@/lib/collectionRoutes': routes, '@/lib/redirectRules': redirectRules,
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
  '@/lib/adminAccess': { requireAdminAccess: async (_r: any, requestId: string, options: any) => { permissions.push(options.permission); return deny ? NextResponse.json({ success: false, requestId, error: { code: 'DENIED', message: 'Denied' } }, { status: deny }) : { session: { user: { id: 'fixture-operator' } } }; } },
  '@/lib/adminAudit': { recordAdminAudit: async (input: any) => { audits.push(input); } }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({ status: 'recorded' }) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({ status: 'skipped' }) },
 };
 const handlers = Object.fromEntries(['navigation', 'seo', 'redirects'].map(name => [name, load('../src/app/api/admin/sites/[siteId]/' + name + '/route.ts', mocks)]));
 async function call(path: string, method: string, status: number, body?: any, scope = site.slug) {
  const op = operations.get(path)[method.toLowerCase()]; assert(op); const expected = path === 'seo' ? method === 'GET' ? 'pages.view' : 'pages.edit' : method === 'GET' ? 'sites.view' : 'sites.configure';
  assert.equal(op['x-backy-permission'], expected); assert.deepEqual(JSON.parse(JSON.stringify(op.security)), [{ BackyAdminSession: [] }, { BackyAdminKey: [] }]);
  if (body !== undefined && status < 400) validate(op.requestBody.content['application/json'].schema.$ref, body);
  const response = await handlers[path][method](new NextRequest('http://fixture.invalid/api/admin/sites/' + scope + '/' + path, { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId: scope }) });
  assert.equal(response.status, status, `${demo} ${path} ${method}`); const result = await response.json(); validate(op.responses[String(status)].content['application/json'].schema.$ref, result); assert.equal(permissions.at(-1), expected); return result;
 }
 return { call, audits, pages, get site() { return site; }, get reads() { return reads; }, get writes() { return writes; }, deny: (status: number) => { deny = status; }, incomplete: (flag: boolean) => { incomplete = flag; } };
}
for (const demo of [true, false]) {
 const f = fixture(demo);
 for (const status of [401, 403]) {
  f.deny(status); const reads = f.reads;
  for (const [path, methods] of operations) for (const method of Object.keys(methods)) await f.call(path, method.toUpperCase(), status, method === 'get' ? undefined : {});
  assert.equal(f.reads, reads); assert.equal(f.writes, 0);
 }
 f.deny(0);
 for (const path of operations.keys()) await f.call(path, 'GET', 404, undefined, 'missing-site');
 const initial = (await f.call('navigation', 'GET', 200)).data; assert.equal(initial.navigation.resolved.primary.length, 204); assert(initial.navigation.resolved.primary.some((item: any) => item.pageId === 'page-204'));
 const nav = { navigation: { primary: [{ id: 'tail', type: 'page', pageId: 'page-204', label: 'Last page', children: [{ type: 'page', pageId: 'page-1', label: 'Draft child' }] }], footer: [{ type: 'route', label: 'Terms', path: 'terms/' }], layout: { header: { variant: 'centered', ctaLabel: 'Contact', ctaHref: '/contact' }, footer: { showNewsletter: true } } } };
 const saved = (await f.call('navigation', 'PATCH', 200, nav)).data; assert.equal(saved.navigation.settings.primary[0].children.length, 1); assert.equal(saved.navigation.resolved.primary[0].children.length, 0); assert.equal(saved.navigation.resolved.primary[0].path, '/page-204');
 await f.call('navigation', 'PATCH', 200, { layout: { header: { showSearch: true } } }); assert.equal(f.site.settings.navigation.layout.header.variant, 'centered'); assert.equal(f.site.settings.navigation.layout.footer.showNewsletter, true);
 for (const body of [{ primary: [{ type: 'page', label: 'Missing' }] }, { primary: [{ type: 'route', label: 'Parent', path: '/parent', children: [{ type: 'page', pageId: 'foreign', label: 'Child' }] }] }]) { const writes = f.writes; await f.call('navigation', 'PATCH', 400, body); assert.equal(f.writes, writes); }
 const seo = (await f.call('seo', 'PATCH', 200, { seo: { titleTemplate: '%s | {siteName}', defaultDescription: 'Fallback description', jsonLd: [{ '@type': 'WebSite', extension: { retain: [0, false] } }], sitemap: { defaultPriority: '2', defaultChangeFrequency: 'daily' }, robots: { extraRules: 'Sitemap: /sitemap.xml' }, routeOverrides: [{ match: '/collection-0/*', keywords: 'first, second', priority: -2, jsonLd: [{ '@type': 'Article' }] }] } })).data;
 assert.equal(seo.preview.routes.length, 12); assert.equal(seo.seo.sitemap.defaultPriority, 1); assert.equal(seo.seo.routeOverrides[0].priority, 0); assert.deepEqual(seo.seo.routeOverrides[0].keywords, ['first', 'second']); assert.equal(seo.preview.routes[0].title, 'Collection 0 | Config fixture');
 await f.call('seo', 'PATCH', 200, { defaultDescription: null, robots: { index: false } }); assert.equal(f.site.settings.seo.defaultDescription, ''); assert.equal(f.site.settings.seo.robots.extraRules, 'Sitemap: /sitemap.xml'); assert.equal(f.site.settings.seo.titleTemplate, '%s | {siteName}');
 for (const body of [{ titleTemplate: 'Missing variable' }, { jsonLd: ['invalid'] }, { sitemap: { defaultChangeFrequency: 'hourly' } }, { routeOverrides: [{ match: '/invalid', jsonLd: [true] }] }]) { const writes = f.writes; await f.call('seo', 'PATCH', 400, body); assert.equal(f.writes, writes); }
 const rules = [{ from: '/page-204', to: '/missing-target', permanent: true }, { from: '/gone', statusCode: 410 }, { from: '/external', destination: 'https://public.fixture.invalid/destination', statusCode: '307' }];
 const writes = f.writes, audits = f.audits.length;
 const preview = (await f.call('redirects', 'POST', 200, { rules })).data; assert.equal(preview.redirects.persisted, false); assert.equal(preview.redirects.conflicts.length, 2); assert.equal(preview.redirects.rules[0].statusCode, 301); assert.equal(f.writes, writes); assert.equal(f.audits.length, audits);
 const redirects = (await f.call('redirects', 'PATCH', 200, { redirects: { rules } })).data; assert.equal(redirects.redirects.persisted, true); assert.equal(redirects.redirects.conflicts.length, 2); assert.equal(f.site.settings.unrelated.preserve, true); assert.equal(f.site.settings.frontendDesign.templates[0].id, 'owned-template');
 await f.call('redirects', 'GET', 200);
 for (const body of [{ rules: [{ from: '/same', to: '/same' }] }, { rules: [{ from: '/dup', to: '/a' }, { from: 'dup/', to: '/b' }] }, { rules: [{ from: '/missing' }] }, {}]) { const writes = f.writes; await f.call('redirects', 'PATCH', 400, body); assert.equal(f.writes, writes); }
 await f.call('redirects', 'PATCH', 200, { redirectRules: [] }); assert.equal(f.site.settings.redirectRules.length, 0);
 if (!demo) {
  f.incomplete(true); const writes = f.writes, audits = f.audits.length;
  for (const [path, methods] of [['navigation', ['GET', 'PATCH']], ['redirects', ['GET', 'POST', 'PATCH']]] as const) for (const method of methods) {
   const failure = await f.call(path, method, 503, method === 'GET' ? undefined : path === 'navigation' ? nav : { rules }); assert.equal(failure.error.code, path === 'navigation' ? 'NAVIGATION_INVENTORY_INCOMPLETE' : 'REDIRECT_INVENTORY_INCOMPLETE');
  }
  assert.equal(f.writes, writes); assert.equal(f.audits.length, audits);
 }
}
validate('#/components/schemas/AdminRedirectRulesRequest', {}, false);
validate('#/components/schemas/AdminRedirectRulesRequest', { rules: [{ from: '/missing' }] }, false);
// Public discovery failure is documented against the actual handler's sanitized no-store envelope.
const collector = load('../src/lib/repositoryNavigationPages.ts', { './collectionExportPagination': pagination });
const publicTransport = load('../src/lib/publicContractResponse.ts');
const publicSite = { id: 'public-config-site', slug: 'public-config-slug', name: 'Public config', isPublished: true, settings: structuredClone(core.DEFAULT_SITE_SETTINGS) };
const publicNavigation = load('../src/app/api/sites/[siteId]/navigation/route.ts', {
 '@/lib/backyStore': {}, '@/lib/publicContractResponse': publicTransport, '@/lib/repositoryNavigationPages': collector, '@/lib/collectionExportPagination': pagination, '@/lib/navigation': navigation,
 '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => ({ sites: { getById: async () => publicSite, getBySlug: async () => null }, pages: { list: async (input: any) => { assert.equal(input.siteId, publicSite.id); assert.equal(input.includeUnpublished, false); assert.equal(input.status, 'published'); throw Error('private provider fixture detail'); } }, cacheInvalidations: { latestRevision: async () => undefined } }) },
});
const publicFailure = await publicNavigation.GET(new NextRequest('http://fixture.invalid/api/sites/public-config-site/navigation'), { params: Promise.resolve({ siteId: publicSite.id }) });
assert.equal(publicFailure.status, 503); const publicError = await publicFailure.json();
assert.equal(publicError.error.code, 'NAVIGATION_INVENTORY_INCOMPLETE'); assert.equal(JSON.stringify(publicError).includes('private provider fixture detail'), false);
for (const name of ['navigation', 'render']) {
 const response = publicOperations.get(name).get.responses['503'];
 assert.equal(response.headers['Cache-Control'].schema.const, publicFailure.headers.get('cache-control'));
 validate(response.content['application/json'].schema.$ref, publicError);
}
assert.equal(networkCalls, 0);
console.log(`Admin site configuration actual-handler/schema checks passed: ${checks}; seven operations, demo/repository adapters, auth-denial, nested navigation/tail205, SEO merges/sample/validation, redirect preview/replace and incomplete inventory no-write503. Public navigation actual503/no-store envelope matches public navigation/render error contracts; full render execution separate. No provider or production store.`);
