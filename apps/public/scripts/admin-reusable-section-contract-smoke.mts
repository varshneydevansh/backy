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
 vm.runInNewContext(compiled, { module, exports: module.exports, URL, URLSearchParams, Request, Response, Headers, Error, Buffer, process, console: { error(...args: any[]) { if (process.env.BACKY_CONTRACT_TEST_DEBUG === "1") console.error(...args); } }, fetch: () => { networkCalls++; throw Error('Unexpected network call'); }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing mock ' + id); })() : require(id) }, { filename });
 return module.exports;
}
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas = new Map<string, ts.Expression>(), operations = new Map<string, any>();
function visit(node: ts.Node) {
 if (ts.isPropertyAssignment(node)) {
  if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) schemas.set(p.name.text, p.initializer);
  if (ts.isComputedPropertyName(node.name) && ts.isObjectLiteralExpression(node.initializer)) {
   const path = node.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
   if (path.startsWith('/api/admin/sites/{siteId}/reusable-sections')) operations.set(path.replace('/api/admin/sites/{siteId}/reusable-sections', ''), vm.runInNewContext('(' + node.initializer.getText(source) + ')'));
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
assert.equal([...operations.values()].reduce((total, op) => total + Object.keys(op).length, 0), 13);
const pagination = load('../src/lib/collectionExportPagination.ts'), inventory = load('../src/lib/reusableSectionInventory.ts', { './collectionExportPagination': pagination });
const propagation = load('../src/lib/reusableSectionPropagation.ts'), core = require('@backy-cms/core');
const versions = load('../src/lib/reusableSectionVersions.ts'), library = load('../src/lib/reusableSectionMetadata.ts'), instances = load('../src/lib/reusableSectionInstances.ts'), design = load('../src/lib/frontendDesignContract.ts');
const content = { elements: [{ id: 'source-root', type: 'container', width: '100%', layoutMode: 'flex', children: [{ id: 'source-child', type: 'codeComponent', registeredComponent: { componentKey: 'fixture.widget', version: '2.0.0' }, extension: { keep: [0, false] }, animation: { type: 'custom', from: { x: 0 }, to: { x: 55 } }, responsive: { mobile: { width: '100%' } }, props: { source: '<Static />' } }] }], customJS: '/* inert saved code */', unknownRoot: { retain: [0, false] }, dataBindings: [{ id: 'binding' }] };
function fixture(demo: boolean) {
 const site: any = { id: 'section-site', slug: 'section-slug', name: 'Sections', settings: { frontendDesign: design.normalizeFrontendDesignContract({ templates: [{ id: 'section-template', type: 'section', name: 'Template', content }] }) } };
 let reads = 0, writes = 0, deny = 0, productDeny = false, incomplete = false, commitRace = false, unavailable = false, followupFailure = false;
 const permissions: string[] = [], audits: any[] = [], sections: any[] = [];
 const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++writes)).toISOString();
 const canonical = (scope: string) => { assert.equal(scope, site.id); reads++; };
 const findSite = (scope: string) => { reads++; return [site.id, site.slug].includes(scope) ? site : null; };
 const find = (scope: string, id: string) => { canonical(scope); return sections.find(s => s.id === id || s.slug === id) || null; };
 const list = (scope: string, input: any = {}) => { canonical(scope); return sections.filter(s => (!input.status || input.status === 'all' || s.status === input.status) && (!input.category || s.category === input.category) && (!input.tag || s.tags.includes(input.tag)) && (!input.search || s.name.toLowerCase().includes(input.search.toLowerCase()))); };
 const create = (scope: string, input: any) => { canonical(scope); const now = stamp(); const value = { id: 'section-' + writes, siteId: scope, name: input.name, slug: input.slug, description: input.description || null, category: input.category || 'general', tags: typeof input.tags === 'string' ? input.tags.split(',').map((x: string) => x.trim()) : input.tags || [], status: input.status === 'archived' ? 'archived' : 'active', content: structuredClone(input.content), metadata: structuredClone(input.metadata || {}), sourceElementId: input.sourceElementId || null, createdBy: input.createdBy || 'admin', updatedBy: input.updatedBy || 'admin', createdAt: now, updatedAt: now }; sections.push(value); return value; };
 const update = (scope: string, id: string, input: any) => { canonical(scope); const old = find(scope, id); if (!old) return null; if (input.expectedSection !== undefined) assert.deepEqual(JSON.parse(JSON.stringify(input.expectedSection)), JSON.parse(JSON.stringify(old))); const { expectedSection: _expectation, ...authored } = input; const next = { ...old, ...structuredClone(authored), updatedAt: stamp() }; if (typeof next.tags === 'string') next.tags = next.tags.split(',').map((x: string) => x.trim()); sections[sections.indexOf(old)] = next; return next; };
 const applyBatch = (scope: string, operations: any[]) => {
  canonical(scope); const snapshot = structuredClone(sections), previousWrites = writes;
  try { return operations.map(op => op.type === 'create' ? create(scope, op.input) : update(scope, op.sectionId, op.input)); }
  catch (error) { sections.splice(0, sections.length, ...snapshot); writes = previousWrites; throw error; }
 };
 const remove = (scope: string, id: string) => { canonical(scope); const value = find(scope, id); if (!value) return false; sections.splice(sections.indexOf(value), 1); stamp(); return true; };
 const synced = () => ({ id: 'instance-root', type: 'container', x: 71, y: 83, zIndex: 9, props: { reusableSection: { mode: 'synced', sectionId: sections[0]?.id, sourceUpdatedAt: '2020-01-01T00:00:00Z' } }, children: [] });
 const pages: any[] = [], posts: any[] = [], records: any[] = [];
 const page = (items: any[], input: any) => { canonical(input.siteId); if (incomplete) throw Error("private inventory fixture failure"); const offset = input.offset || 0, limit = Math.min(input.limit || 100, 100); return { items: structuredClone(items.slice(offset, offset + limit)), pagination: { total: items.length, limit, offset, hasMore: offset + limit < items.length } }; };
 const saveTarget = (items: any[], scope: string, id: string, input: any) => { canonical(scope); const old = items.find(x => x.id === id); assert(old); Object.assign(old, structuredClone(input)); stamp(); return { item: old }; };
 const collections = { getBySlug: async (scope: string, slug: string) => { canonical(scope); return slug === 'products' ? { id: 'products', siteId: site.id, slug } : null; }, listRecords: async (input: any) => page(records, input), updateRecord: async (scope: string, _collection: string, id: string, input: any) => saveTarget(records, scope, id, input) };
 const applyPropagation = (scope: string, input: any) => {
  canonical(scope);
  if (commitRace && pages[0]) pages[0].content.elements[0].props = { authorWinner: true };
  try { core.assertBackyReusableSectionExpectation({ expectedSection: input.source }, find(scope, input.source.id)); } catch { throw new core.BackyReusableSectionPropagationConflictError(); }
  const current = [
   ...pages.map(t => ({ type: 'page', id: t.id, updatedAt: t.updatedAt, content: t.content })),
   ...posts.map(t => ({ type: 'post', id: t.id, updatedAt: t.updatedAt, content: t.content })),
   ...(input.scope.includeProducts ? records.map(t => ({ type: 'product', id: t.id, collectionId: t.collectionId, updatedAt: t.updatedAt, values: t.values })) : []),
  ].filter(t => (input.scope.targetType === 'all' || t.type === input.scope.targetType) && (!input.scope.targetId || t.id === input.scope.targetId || [...pages, ...posts, ...records].find(x => x.id === t.id)?.slug === input.scope.targetId));
  core.assertBackyReusableSectionPropagationInventory(input.inventory, current);
  const pending = input.mutations.map((mutation: any) => { const items = mutation.expected.type === 'page' ? pages : mutation.expected.type === 'post' ? posts : records; const old = items.find(t => t.id === mutation.expected.id); assert(old); return { items, old, next: { ...old, ...(mutation.expected.type === 'product' ? { values: structuredClone(mutation.values) } : { content: structuredClone(mutation.content) }) } }; });
  for (const plan of pending) { plan.next.updatedAt = stamp(); plan.items[plan.items.indexOf(plan.old)] = plan.next; }
  return [];
 };
 const repos = { sites: { getById: async (scope: string) => findSite(scope), getBySlug: async (scope: string) => findSite(scope) }, reusableSections: { applyPropagation: async (scope: string, input: any) => { if (unavailable) throw Object.assign(Error('Unsupported'), { code: 'REUSABLE_SECTION_PROPAGATION_UNAVAILABLE' }); return applyPropagation(scope, input); }, applyBatch: async (scope: string, operations: any[]) => applyBatch(scope, operations), list: async (input: any) => page(list(input.siteId, input), input), getById: async (scope: string, id: string) => structuredClone(find(scope, id)), getBySlug: async (scope: string, slug: string) => structuredClone(find(scope, slug)), create: async (input: any) => ({ item: create(input.siteId, input) }), update: async (scope: string, id: string, input: any) => ({ item: update(scope, id, input) }), delete: async (scope: string, id: string) => remove(scope, id) }, pages: { list: async (input: any) => page(pages, input), update: async (scope: string, id: string, input: any) => saveTarget(pages, scope, id, input) }, posts: { list: async (input: any) => page(posts, input), update: async (scope: string, id: string, input: any) => saveTarget(posts, scope, id, input) }, collections };
 const store = { applyReusableSectionBatch: applyBatch, getSiteByIdOrSlug: findSite, getReusableSectionByIdOrSlug: (scope: string, id: string) => structuredClone(find(scope, id)), applyReusableSectionPropagation: applyPropagation, listReusableSections: list, createReusableSection: create, updateReusableSection: update, deleteReusableSection: remove, getPageSummary: (scope: string) => { canonical(scope); return pages; }, getAdminPageById: (scope: string, id: string) => { canonical(scope); return structuredClone(pages.find(x => x.id === id) || null); }, getBlogPosts: (scope: string, input: any) => { const result = page(posts, { ...input, siteId: scope }); return { posts: result.items, pagination: result.pagination }; }, updateAdminPage: (scope: string, id: string, input: any) => saveTarget(pages, scope, id, input).item, updateAdminBlogPost: (scope: string, id: string, input: any) => saveTarget(posts, scope, id, input).item, getCollectionByIdOrSlug: (scope: string) => { canonical(scope); return { id: 'products', slug: 'products' }; }, listCollectionRecords: (scope: string, _collection: string, input: any) => { const result = page(records, { ...input, siteId: scope }); return { records: result.items, pagination: result.pagination }; }, updateAdminCollectionRecord: (scope: string, _collection: string, id: string, input: any) => saveTarget(records, scope, id, input).item };
 const mocks = { '@/lib/reusableSectionInventory': inventory, '@/lib/reusableSectionPropagation': propagation, '@/lib/backyStore': store, '@/lib/frontendDesignContract': design, '@/lib/reusableSectionVersions': versions, '@/lib/reusableSectionMetadata': library, '@/lib/reusableSectionInstances': instances, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repos }, '@/lib/adminAccess': { requireAdminAccess: async (_r: any, requestId: string, input: any) => { permissions.push(input.permission); const status = deny || (productDeny && /^(collections|commerce)\./.test(input.permission) ? 403 : 0); return status ? NextResponse.json({ success: false, requestId, error: { code: 'DENIED', message: 'Denied' } }, { status }) : { session: { user: { id: 'fixture' } } }; } }, '@/lib/adminAudit': { recordAdminAudit: async (input: any) => { if (followupFailure) throw Error('private audit detail'); audits.push(input); } }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { if (followupFailure) throw Error('private cache detail'); return { status: 'recorded' }; } }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { if (followupFailure) throw Error('private webhook detail'); return { status: 'skipped' }; } }, '@/lib/repositoryMediaReferenceSync': { syncRepositoryCollectionRecordMediaReferences: async () => undefined } };
 const handlers = new Map([...operations.keys()].map(path => [path, load('../src/app/api/admin/sites/[siteId]/reusable-sections' + path.replace('{sectionId}', '[sectionId]').replace('{version}', '[version]') + '/route.ts', mocks)]));
 async function call(path: string, method: string, status: number, body?: any, id?: string, query = '', version = '1', scope = site.slug) {
  const operation = operations.get(path)[method.toLowerCase()]; assert(operation); const expected = method === 'GET' ? 'pages.view' : method === 'DELETE' ? 'pages.delete' : 'pages.edit';
  assert.equal(operation['x-backy-permission'], expected); assert.deepEqual(JSON.parse(JSON.stringify(operation.security)), [{ BackyAdminSession: [] }, { BackyAdminKey: [] }]);
  if (body !== undefined && status < 400) validate(operation.requestBody.content['application/json'].schema.$ref, body);
  const before = permissions.length, response = await handlers.get(path)[method](new NextRequest('http://fixture.invalid/api/admin/sites/' + scope + '/reusable-sections' + path.replace('{sectionId}', id || 'missing').replace('{version}', version) + query, { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId: scope, sectionId: id || 'missing', version }) });
  assert.equal(response.status, status, `${demo} ${path} ${method}`); assert.equal(permissions[before], expected); const result = await response.json(); validate(operation.responses[String(status)].content['application/json'].schema.$ref, result); return { result, response };
 }
 function seedTargets() { for (const [items, type] of [[pages, 'page'], [posts, 'post']] as const) items.push({ id: type + '-local', siteId: site.id, title: type, slug: type, status: 'draft', updatedAt: '2025-01-01T00:00:00Z', content: { elements: [{ id: 'outer', type: 'container', children: [synced(), { id: 'detached', type: 'container', props: { reusableSection: { mode: 'detached', sectionId: sections[0].id } } }] }], extension: { retain: true } } }); records.push({ id: 'product-local', siteId: site.id, collectionId: 'products', slug: 'product', status: 'draft', updatedAt: '2025-01-01T00:00:00Z', values: { title: 'Product', frontendDesignElements: [synced()], unrelated: 'retained' } }); }
 return { call, sections, pages, posts, records, audits, seedTargets, commitRace: (flag: boolean) => { commitRace = flag; }, unavailable: (flag: boolean) => { unavailable = flag; }, followupFailure: (flag: boolean) => { followupFailure = flag; }, incomplete: (flag: boolean) => { incomplete = flag; }, deny: (status: number) => { deny = status; }, productDeny: (value: boolean) => { productDeny = value; }, get reads() { return reads; }, get writes() { return writes; } };
}
for (const demo of [true, false]) {
 const f = fixture(demo);
 for (const status of [401, 403]) { f.deny(status); const reads = f.reads; for (const [path, operation] of operations) for (const method of Object.keys(operation)) await f.call(path, method.toUpperCase(), status, method === 'get' || method === 'delete' ? undefined : {}); assert.equal(f.reads, reads); assert.equal(f.writes, 0); }
 f.deny(0); await f.call('', 'GET', 404, undefined, undefined, '', '1', 'missing-site');
 for (const body of [{}, { name: 'Missing content' }, { name: 'Empty', content: { elements: [] } }]) { await f.call('', 'POST', 400, body); assert.equal(f.writes, 0); }
 const created = (await f.call('', 'POST', 201, { name: 'Nested Hero', slug: 'Nested HERO', content, tags: 'hero, repeat', metadata: { extension: { keep: true } } })).result.data.section;
 assert.equal(created.slug, 'nested-hero'); assert.deepEqual(created.content, content); const id = created.id;
 await f.call('', 'POST', 409, { name: 'Duplicate', slug: created.slug, content });
 await f.call('/{sectionId}', 'GET', 200, undefined, created.slug); await f.call('/{sectionId}', 'GET', 404, undefined, 'foreign');
 await f.call('', 'GET', 200, undefined, undefined, '?status=all&tag=hero&search=Nested');
 const changed = (await f.call('/{sectionId}', 'PATCH', 200, { name: 'Changed', expectedVersion: '1', content: { ...content, changed: true } }, id)).result.data.section; assert.equal(versions.reusableSectionVersionFromMetadata(changed.metadata), 2);
 const writes = f.writes; await f.call('/{sectionId}', 'PATCH', 409, { expectedVersion: 1 }, id); await f.call('/{sectionId}', 'PATCH', 409, { expectedUpdatedAt: 'stale' }, id); await f.call('/{sectionId}', 'PATCH', 400, { content: { elements: [] } }, id); assert.equal(f.writes, writes);
 const history = (await f.call('/{sectionId}/versions', 'GET', 200, undefined, id)).result.data; assert.equal(history.versions[1].name, created.name); assert.deepEqual(history.versions[1].content, content);
 const meta = (await f.call('/{sectionId}/metadata', 'PATCH', 200, { metadata: { reusableSection: { library: { displayName: ' Hero ', labels: ['One', 'one', 'Two'], owner: { team: 'Author' }, previewPath: '/preview' } } }, expectedVersion: 2 }, id)).result.data; assert.deepEqual(meta.library.labels, ['One', 'Two']); assert.equal(meta.library.displayName, 'Hero'); assert.equal(meta.metadata.extension.keep, true);
 await f.call('/{sectionId}/metadata', 'GET', 200, undefined, id); await f.call('/{sectionId}/metadata', 'PATCH', 400, { previewPath: 'https://external.invalid', owner: true }, id); await f.call('/{sectionId}/metadata', 'PATCH', 409, { expectedVersion: 1 }, id);
 const restored = (await f.call('/{sectionId}/versions/{version}/restore', 'POST', 200, { expectedVersion: 3 }, id)).result.data; assert.deepEqual(restored.section.content, content); assert.equal(restored.section.metadata.reusableSection.library.displayName, 'Hero'); assert.equal(restored.version, 4);
 await f.call('/{sectionId}/versions/{version}/restore', 'POST', 400, {}, id, '', 'invalid'); await f.call('/{sectionId}/versions/{version}/restore', 'POST', 404, {}, id, '', '99'); await f.call('/{sectionId}/versions/{version}/restore', 'POST', 409, { expectedVersion: 1 }, id);
 f.sections[0].metadata.reusableSection.history.push({ version: 99, content: {} }); const beforeMalformedRestore = f.writes; await f.call('/{sectionId}/versions', 'GET', 200, undefined, id); await f.call('/{sectionId}/versions/{version}/restore', 'POST', 400, {}, id, '', '99'); assert.equal(f.writes, beforeMalformedRestore);
 const exported = await f.call('/export', 'GET', 200, undefined, undefined, '?ids=nested-hero'); assert.equal(exported.result.data.export.sectionCount, 1); assert.deepEqual(exported.result.data.sections[0].content, content); assert.match(exported.response.headers.get('content-disposition')!, /attachment/);
 const imported = await f.call('/import', 'POST', 200, { data: { sections: [{ name: 'Imported', slug: 'imported', content }] } }); assert.equal(imported.result.data.import.created, 1);
 await f.call('/import', 'POST', 409, { section: { name: 'Imported', slug: 'imported', content } }); await f.call('/import', 'POST', 200, { section: { name: 'Imported updated', slug: 'imported', content } }, undefined, '?upsert=true');
 const beforeImportConflict = f.writes, beforeImportAudit = f.audits.length; await f.call('/import', 'POST', 409, { sections: [{ name: 'New before conflict', slug: 'new-before-conflict', content }, { name: 'Existing last', slug: 'imported', content }] }); assert.equal(f.writes, beforeImportConflict); assert.equal(f.audits.length, beforeImportAudit); assert.equal(f.sections.some((section: any) => section.slug === 'new-before-conflict'), false);
 const invalidImportWrites = f.writes; await f.call('/import', 'POST', 400, { sections: [{ name: 'Valid first', slug: 'invalid-batch-first', content }, { name: 'Invalid last', content: {} }] }); assert.equal(f.writes, invalidImportWrites); assert.equal(f.sections.some((section: any) => section.slug === 'invalid-batch-first'), false);
 await f.call('/import', 'POST', 400, { sections: [{ name: 'Invalid', content: {} }] }); await f.call('/import', 'POST', 400, { sections: [{ name: 'Dup', content }, { name: 'Dup', content }] });
 f.seedTargets(); f.productDeny(true);
 const registry = (await f.call('/{sectionId}/instances', 'GET', 200, undefined, id, '?targetType=all')).result.data; assert.equal(registry.totals.instances, 2); assert.equal(registry.totals.stale, 2); assert.equal(registry.targets.some((t: any) => t.type === 'product'), false);
 await f.call('/{sectionId}/instances', 'GET', 403, undefined, id, '?targetType=product'); await f.call('/{sectionId}/instances', 'POST', 403, { targetType: 'product' }, id);
 const before = f.writes, audits = f.audits.length; const dry = (await f.call('/{sectionId}/instances', 'POST', 200, { dryRun: true, targetType: 'page' }, id)).result.data; assert.equal(dry.totals.instances, 1); assert.equal(f.writes, before); assert.equal(f.audits.length, audits);
 const pagePreview = (await f.call('/{sectionId}/instances', 'POST', 200, { dryRun: true, targetType: 'page', targetId: 'page-local' }, id)).result.data.reviewedPreview;
 await f.call('/{sectionId}/instances', 'POST', 400, { targetType: 'page', targetId: 'page-local' }, id); await f.call('/{sectionId}/instances', 'POST', 400, { targetType: 'page', reviewedPreview: { schemaVersion: 'wrong' } }, id);
 await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', targetId: 'page-local', reviewedPreview: pagePreview }, id); const instance = f.pages[0].content.elements[0].children[0]; assert.equal(instance.x, 71); assert.equal(instance.y, 83); assert.equal(instance.zIndex, 9); assert.equal(instance.id, 'instance-root'); assert.equal(instance.children[0].registeredComponent.version, '2.0.0'); assert.equal(f.pages[0].content.elements[0].children[1].id, 'detached'); assert.equal(f.pages[0].content.extension.retain, true);
 const brokenTarget = structuredClone(f.pages[0]); brokenTarget.id = 'page-broken'; brokenTarget.slug = 'page-broken'; brokenTarget.content.elements[0].children[0].props.reusableSection.sourceElementId = 'absent-root'; f.pages.push(brokenTarget); const beforeMissingRoot = f.writes, missingRootAudits = f.audits.length; const missingRoot = (await f.call('/{sectionId}/instances', 'POST', 409, { targetType: 'page' }, id)).result; assert.equal(missingRoot.error.code, 'REUSABLE_SECTION_SOURCE_ROOT_MISSING'); assert.equal(f.writes, beforeMissingRoot); assert.equal(f.audits.length, missingRootAudits); f.pages.pop();
 f.productDeny(false); const productPreview = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'product', dryRun: true }, id)).result.data.reviewedPreview; await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'product', reviewedPreview: productPreview }, id); assert.equal(f.records[0].values.unrelated, 'retained'); assert.equal(f.records[0].values.frontendDesignElements[0].children[0].registeredComponent.version, '2.0.0');
 const snapshotWrites = f.writes;
 const reviewed = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', dryRun: true }, id)).result.data.reviewedPreview;
 await f.call('/{sectionId}/instances', 'POST', 409, { targetType: 'page', targetId: 'page-local', reviewedPreview: reviewed }, id);
 const beforeSource = structuredClone(f.sections[0]); f.sections[0].metadata.concurrentAuthor = true; await f.call('/{sectionId}/instances', 'POST', 409, { targetType: 'page', reviewedPreview: reviewed }, id); assert.equal(f.writes, snapshotWrites); f.sections[0] = beforeSource;
 assert.equal(reviewed.schemaVersion, 'backy.reusable-section-propagation-preview.v1'); assert.equal(reviewed.siteId, 'section-site');
 f.pages.push({ id: 'no-instance', siteId: 'section-site', title: 'No instance', slug: 'no-instance', status: 'draft', updatedAt: '2025-01-01T00:00:00Z', content: { elements: [] } });
 const drift = (await f.call('/{sectionId}/instances', 'POST', 409, { targetType: 'page', reviewedPreview: reviewed }, id)).result; assert.equal(drift.error.code, 'REUSABLE_SECTION_PREVIEW_CONFLICT'); assert.equal(f.writes, snapshotWrites);
 const includingNoInstance = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', dryRun: true }, id)).result.data.reviewedPreview; assert.equal(includingNoInstance.targets.length, 2);
 f.pages[0].content.authorChanged = true;
 await f.call('/{sectionId}/instances', 'POST', 409, { targetType: 'page', reviewedPreview: includingNoInstance }, id); assert.equal(f.writes, snapshotWrites);
 const beforeRace = structuredClone(f.pages[0]); const racePreview = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', dryRun: true }, id)).result.data.reviewedPreview;
 f.commitRace(true); const conflict = (await f.call('/{sectionId}/instances', 'POST', 409, { targetType: 'page', reviewedPreview: racePreview }, id)).result; assert.equal(conflict.error.code, 'REUSABLE_SECTION_PROPAGATION_CONFLICT'); assert.equal(f.writes, snapshotWrites); assert.equal(f.pages[0].content.elements[0].props.authorWinner, true); f.commitRace(false); f.pages[0] = beforeRace;
 if (!demo) { const latest = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', dryRun: true }, id)).result.data.reviewedPreview; f.unavailable(true); await f.call('/{sectionId}/instances', 'POST', 503, { targetType: 'page', reviewedPreview: latest }, id); assert.equal(f.writes, snapshotWrites); f.unavailable(false); }
 const finalPreview = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', dryRun: true }, id)).result.data.reviewedPreview;
 f.followupFailure(true); const warned = (await f.call('/{sectionId}/instances', 'POST', 200, { targetType: 'page', reviewedPreview: finalPreview }, id)).result.data; assert.equal(warned.outcome, 'partial'); assert(warned.completionWarnings.length >= 2); assert.equal(JSON.stringify(warned).includes('private audit detail'), false); f.followupFailure(false);
 for (let index = 0; index < 205; index++) f.sections.push({ ...structuredClone(f.sections[0]), id: 'tail-section-' + index, slug: 'tail-section-' + index });
 const paged = (await f.call('', 'GET', 200, undefined, undefined, '?status=all&limit=10&offset=100')).result.data; assert.equal(paged.sections.length, 10); assert.equal(paged.pagination.offset, 100); assert.equal(paged.pagination.total, 207);
 const tailExport = (await f.call('/export', 'GET', 200, undefined, undefined, '?sectionIds=tail-section-204')).result.data; assert.equal(tailExport.sections.length, 1); assert.equal(tailExport.sections[0].sourceSectionId, 'tail-section-204');
 f.incomplete(true); const inventoryWrites = f.writes, inventoryAudits = f.audits.length;
 if (!demo) await f.call('/export', 'GET', 503);
 await f.call('/{sectionId}/instances', 'GET', 503, undefined, id, '?targetType=product'); await f.call('/{sectionId}/instances', 'POST', 503, { targetType: 'product' }, id);
 assert.equal(f.writes, inventoryWrites); assert.equal(f.audits.length, inventoryAudits); f.incomplete(false);
 const templateCreated = (await f.call('', 'POST', 201, { frontendDesignTemplateId: 'section-template', slug: 'template-copy' })).result.data.section; assert.equal(templateCreated.name, 'Template'); assert.equal(templateCreated.content.elements[0].children[0].registeredComponent.version, '2.0.0');
 await f.call('/{sectionId}', 'DELETE', 200, undefined, id); await f.call('/{sectionId}', 'GET', 404, undefined, id);
}
validate('#/components/schemas/AdminReusableSectionRefreshRequest', {}, false);
validate('#/components/schemas/AdminReusableSectionRefreshRequest', { dryRun: false }, false);
validate('#/components/schemas/AdminReusableSectionRefreshRequest', { reviewedPreview: { schemaVersion: 'wrong' } }, false);
validate('#/components/schemas/AdminReusableSectionImportRequest', {}, false);
validate('#/components/schemas/AdminReusableSectionImportRequest', { sections: [] }, false);
validate('#/components/schemas/AdminReusableSectionImportRequest', { section: { frontendDesignTemplateId: 'template' } }, false);
assert.equal(networkCalls, 0);
console.log(`Reusable section actual-handler/schema checks passed: ${checks}; all 13 methods, demo/repository adapters, early auth denial, canonical scope, nested JSON/version/metadata/restore/export/import, product gates, mandatory reviewed source/scope/full inventory, dry-run no-write, pre-apply and commit conflicts, synced refresh preservation and sanitized partial follow-up outcomes. No live PostgreSQL/browser/atomicity certification.`);
