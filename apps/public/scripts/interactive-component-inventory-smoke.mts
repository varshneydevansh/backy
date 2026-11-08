import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as inventoryModule from '../src/lib/interactiveComponentInventory';
import * as propsModule from '../src/lib/componentMigrationProps';
const propsAdmission = propsModule.default || propsModule;
const { readInteractiveComponentInventory, InteractiveComponentInventoryError } = (inventoryModule.default || inventoryModule) as typeof inventoryModule;
import { assertComponentBody } from './admin-component-contract.mjs';
const require = createRequire(import.meta.url), cwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-component-inventory-'));
process.chdir(directory); let checks = 0;
function load(relative: string, mocks: Record<string, any>) {
  const filename = fileURLToPath(new URL(relative, import.meta.url)), compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, process, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename }); return module.exports;
}
try {
  const imported = await import('../src/lib/backyStore'); const store: any = imported.default || imported;
  const site = store.createAdminSite({ id: 'inventory-fixture', slug: 'inventory-slug', name: 'Inventory fixture' });
  const component = store.createInteractiveComponent(site.id, { componentKey: 'fixture.widget', version: '2.0.0', displayName: 'Target', status: 'active', reviewStatus: 'approved', type: 'interactiveFigure', source: 'registry', renderMode: 'trusted-component' });
  const widget = { componentKey: 'fixture.widget', version: '1.0.0', type: 'interactive_component', props: { nested: { values: [1, 2] } }, fallback: { text: 'Retained fallback' }, children: [{ text: '' }] };
  const original = store.createAdminBlogPost(site.id, { title: 'Inventory article', slug: 'inventory-article', content: { elements: [{ id: 'rich', type: 'paragraph', props: { content: [widget] } }] } });
  // Bulk seed ONLY the newly-created disposable file; reads below use the actual demo loader.
  const filename = join(directory, 'data/backy/admin-content.json'), saved = JSON.parse(readFileSync(filename, 'utf8'));
  saved.blogPosts = Array.from({ length: 1005 }, (_, i) => ({ ...original, id: `demo-post-${i}`, slug: `demo-post-${i}` })); writeFileSync(filename, JSON.stringify(saved));
  let demo = true, broken = '', writes = 0;
  const rows = Array.from({ length: 10005 }, (_, i) => ({ id: `page-${i}`, siteId: site.id, title: 'Inventory page', slug: `page-${i}`, status: 'draft', updatedAt: '2026-10-04T00:00:00Z', content: { elements: i === 10004 ? [{ ...widget }] : [] } }));
  const calls: number[] = [];
  const repositories: any = { sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async (slug: string) => slug === site.slug ? site : null }, interactiveComponents: { getByKeyVersion: async (s: string, key: string, version: string) => { assert.equal(s, site.id); return key === component.componentKey && version === component.version ? component : null; } }, pages: {
    list: async (p: any) => { assert.equal(p.siteId, site.id); calls.push(p.offset); if (broken === 'unavailable') throw Error('Private fixture provider detail'); const items = rows.slice(p.offset, p.offset + p.limit), pagination: any = { total: rows.length, limit: p.limit, offset: p.offset, hasMore: p.offset + p.limit < rows.length };
      if (broken === 'premature') pagination.hasMore = false;
      if (broken === 'stalled' && p.offset) return { items: [], pagination };
      if (broken === 'duplicate' && p.offset) items[0] = rows[0];
      if (broken === 'changed-total' && p.offset) pagination.total++;
      if (broken === 'offset' && p.offset) pagination.offset = 0;
      if (broken === 'foreign') items[0] = { ...items[0], siteId: 'foreign-site' };
      return { items, pagination: broken === 'missing-pagination' ? undefined : pagination };
    }, update: async (s: string, id: string, p: any) => { assert.equal(s, site.id); assert.equal(id, 'page-10004'); writes++; return { item: { ...rows[10004], ...p } }; },
  }, posts: { list: async () => ({ items: [], pagination: { total: 0, limit: 200, offset: 0, hasMore: false } }) }, auditLogs: { record: async () => ({}) }, cacheInvalidations: { record: async () => ({}) } };
  const mocks: any = { '@/lib/backyStore': store, '@/lib/componentMigrationProps': propsAdmission, '@/lib/interactiveComponentInventory': { readInteractiveComponentInventory, InteractiveComponentInventoryError }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'fixture-actor' } } }) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] } };
  async function call(suffix: string, expected = 200, dryRun = true) {
    const route = load(`../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/${suffix}/route.ts`, mocks), method = suffix === 'usage' ? 'GET' : 'POST';
    const response = await route[method](new Request(`http://fixture.invalid/api/admin/sites/${site.slug}/interactive-components/fixture.widget/1.0.0/${suffix}`, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ targetVersion: '2.0.0', dryRun }) } : {}) }), { params: Promise.resolve({ siteId: site.slug, componentKey: 'fixture.widget', version: '1.0.0' }) });
    const body = await response.json(); assert.equal(response.status, expected, `${demo} ${suffix} ${broken}`); assertComponentBody('/{componentKey}/{version}/' + suffix, method, expected, body); checks++; return body;
  }
  assert.equal(store.getBlogPosts(site.id, { includeUnpublished: true, limit: 200, offset: 1000 }).posts.length, 5);
  const demoUsage = await call('usage'); assert.equal(demoUsage.data.summary.scanned.posts, 1005); assert.equal(demoUsage.data.summary.total, 1005); assert.ok(demoUsage.data.usage.some((u: any) => u.targetId === 'demo-post-1004'));
  const demoPlan = await call('migrate'); assert.equal(demoPlan.data.summary.scanned.posts, 1005); assert.equal(demoPlan.data.migratedTargets.length, 1005); assert.equal(store.getAdminBlogPostById(site.id, 'demo-post-1004').content.elements[0].props.content[0].version, '1.0.0');
  demo = false;
  const repositoryUsage = await call('usage'); assert.equal(repositoryUsage.data.summary.scanned.pages, 10005); assert.equal(repositoryUsage.data.summary.total, 1); assert.equal(repositoryUsage.data.usage[0].targetId, 'page-10004'); assert.ok(calls.includes(10000));
  const plan = await call('migrate'); assert.equal(plan.data.summary.scanned.pages, 10005); assert.equal(plan.data.migratedTargets[0].targetId, 'page-10004'); assert.equal(writes, 0);
  await call('migrate', 200, false); assert.equal(writes, 1);
  for (const failure of ['premature', 'stalled', 'duplicate', 'changed-total', 'offset', 'foreign', 'missing-pagination', 'unavailable']) {
    broken = failure; const before = writes;
    for (const suffix of ['usage', 'migrate']) { const error = await call(suffix, 503, false); assert.equal(error.error.code, 'INTERACTIVE_COMPONENT_INVENTORY_INCOMPLETE'); assert.equal(JSON.stringify(error).includes('Private fixture provider detail'), false); assert.equal(writes, before, 'Incomplete inventories fail before every migration write'); }
  }
  // Complete page inventory followed by incomplete post inventory must also refuse every write.
  broken = ''; repositories.posts.list = async () => ({ items: [], pagination: { total: 1, limit: 200, offset: 0, hasMore: true } }); const before = writes; await call('migrate', 503, false); assert.equal(writes, before);
  // Explicit resource budget fails closed rather than silently yielding 100000 rows.
  await assert.rejects(readInteractiveComponentInventory(site.id, async () => ({ items: [], pagination: { total: 100001, limit: 200, offset: 0, hasMore: true } })), InteractiveComponentInventoryError); checks++;
  console.log(`Complete component inventory checks passed: ${checks}; real demo1005 articles, repository10005 pages, eight incomplete/stale failures refused before writes.`);
} finally { process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); }
