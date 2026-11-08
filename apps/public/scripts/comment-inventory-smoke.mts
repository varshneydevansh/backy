import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import * as coreModule from '@backy-cms/core';
const { collectBackyCommentSubtree, BackyCommentLifecycleError } = (coreModule as any).default || coreModule;

const require = createRequire(import.meta.url);
const site = { id: 'comment-inventory-site', slug: 'comment-alias' };
const rootComment = { id: 'root', siteId: site.id, targetType: 'page', targetId: 'page', parentId: null, status: 'approved', content: 'Root', createdAt: new Date().toISOString() };
const seed = (count: number, replies = false) => Array.from({ length: count }, (_, i) => ({ ...rootComment, id: `row-${i}`, parentId: replies ? rootComment.id : null }));
let demo = false, deny = false, rows: any[] = [], writes = 0, reads = 0, fault = "none";
function list(input: any) {
  reads++;
  assert.equal(input.siteId, site.id);
  const filtered = rows.filter(row => !input.parentOnly || row.parentId === input.parentId);
  const limit = (demo ? (input.limit || 100) : Math.min(input.limit || 100, 100)), offset = input.offset || 0;
  if (fault === 'read-failure') throw Error('private storage detail');
  const page = { items: structuredClone(filtered.slice(offset, offset + limit)), pagination: { total: filtered.length, limit, offset, hasMore: offset + limit < filtered.length } };
  if (offset > 0) {
    if (fault === 'empty-tail') page.items = [];
    if (fault === 'duplicate') page.items[0] = filtered[0];
    if (fault === 'foreign-site') page.items[0].siteId = 'foreign';
    if (fault === 'wrong-target') page.items[0].targetId = 'foreign';
    if (fault === 'wrong-parent') page.items[0].parentId = 'foreign';
    if (fault === 'drift') page.pagination.total++;
    if (fault === 'invalid-limit') page.pagination.limit = 0;
  }
  return page;
}
const remove = (id: string) => { writes++; const before = rows.length; rows = rows.filter(row => row.id !== id); return rows.length < before; };
const repositories = { comments: { list: async (input: any) => list(input), getById: async (_site: string, id: string) => rows.find(row => row.id === id), delete: async (_site: string, id: string) => remove(id) } };
const mocks: Record<string, any> = {
  'next/server': { NextResponse },
  '@/lib/adminAccess': { requireAdminAccess: async () => deny ? NextResponse.json({ success: false }, { status: 403 }) : ({ session: { user: { id: 'synthetic-owner' } } }) },
  '@/lib/adminAudit': { recordAdminAudit: async () => {} },
  '@/lib/commentRepositorySupport': { resolveRepositorySite: async () => site },
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
  '@/lib/backyStore': {
    getSiteByIdOrSlug: () => site,
    getCommentById: (id: string) => rows.find(row => row.id === id),
    deleteCommentRecord: (id: string) => { const row = rows.find(row => row.id === id); remove(id); return row; },
    listComments: (siteId: string, input: any) => { const result = list({ ...input, siteId }); return { comments: result.items, count: result.pagination.total, pagination: result.pagination }; },
  },
};
function load(relative: string): any {
  const module = { exports: {} as any };
  const filename = new URL(relative, import.meta.url);
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, URL, URLSearchParams, Headers, Request, Response, Date, console, process,
    require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/lib/') ? load('../src/lib/' + id.slice('@/lib/'.length) + '.ts') : require(id),
  });
  return module.exports;
}
// DELETE does not invoke these unrelated policy/delivery functions.
mocks['@/lib/commentPrivacy'] = {};
mocks['@/lib/commentDelivery'] = {};
// Adapter-boundary fixture only. Actual DB atomicity and demo persistence have separate suites.
const complete = load('../src/lib/collectionExportPagination.ts');
const atomicDelete = async (siteId: string, rootId: string) => {
  let inventory: any[];
  try { inventory = await complete.collectCompleteExportPages((pagination: any) => Promise.resolve(list({ siteId, ...pagination })), (item: any) => item.siteId === siteId); }
  catch { throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'Fixture inventory incomplete'); }
  const selected = collectBackyCommentSubtree(siteId, rootId, inventory);
  const ids = new Set(selected.map(item => item.id)); rows = rows.filter(item => !ids.has(item.id)); writes++; return selected;
};
(repositories.comments as any).deleteSubtree = atomicDelete;
mocks['@/lib/backyStore'].deleteCommentSubtree = atomicDelete;
const analytics = load('../src/app/api/sites/[siteId]/comments/analytics/route.ts');
const detail = load('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts');
let checks = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) { try { await fn(); checks++; } catch (error) { failures.push(`${name}: ${String(error)}`); } }
for (const mode of [false, true]) {
  demo = mode;
  rows = seed(10005); reads = writes = 0;
  await check(`complete analytics demo=${mode}`, async () => {
    const response = await analytics.GET(new NextRequest('http://fixture.invalid/'), { params: Promise.resolve({ siteId: site.slug }) });
    assert.equal(response.status, 200);
    const result = (await response.json()).data.analytics;
    assert.equal(result.totals.allTimeComments, 10005);
    assert.equal(result.siteId, site.id);
  });
  rows = [rootComment, ...seed(205, true)]; reads = writes = 0;
  await check(`complete root deletion demo=${mode}`, async () => {
    const response = await detail.DELETE(new NextRequest('http://fixture.invalid/', { method: 'DELETE' }), { params: Promise.resolve({ siteId: site.slug, commentId: rootComment.id }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.deletedCount, 206);
    assert.equal(rows.length, 0);
  });
  for (const injected of ['empty-tail','duplicate','foreign-site','drift','invalid-limit','read-failure']) {
    fault = injected; rows = seed(205); writes = reads = 0;
    await check(`analytics fault ${injected} demo=${mode}`, async () => {
      const response = await analytics.GET(new NextRequest('http://fixture.invalid/'), { params: Promise.resolve({ siteId: site.slug }) });
      assert.equal(response.status,503);assert.equal((await response.json()).error.code,'COMMENT_INVENTORY_INCOMPLETE');
      assert.match(response.headers.get('cache-control') || '',/no-store/);assert.equal(writes,0);
    });
  }
  for (const injected of ['empty-tail','duplicate','foreign-site','wrong-target','drift','invalid-limit','read-failure']) {
    fault = injected; rows = [rootComment,...seed(205,true)]; writes = reads = 0;
    await check(`atomic adapter inventory fault ${injected} demo=${mode}`, async () => {
      const before=structuredClone(rows);
      const response = await detail.DELETE(new NextRequest('http://fixture.invalid/',{method:'DELETE'}), { params: Promise.resolve({ siteId: site.slug,commentId:rootComment.id }) });
      assert.equal(response.status,injected === 'wrong-target' ? 409 : 503);assert.equal((await response.json()).error.code,injected === 'wrong-target' ? 'COMMENT_TREE_INVALID' : 'COMMENT_INVENTORY_INCOMPLETE');
      assert.match(response.headers.get('cache-control') || '',/no-store/);assert.equal(writes,0);assert.deepEqual(rows,before);
    });
  }
  fault='none';deny=true;reads=writes=0;
  await check(`authorization before reads/writes demo=${mode}`,async()=>{
    assert.equal((await analytics.GET(new NextRequest('http://fixture.invalid/'),{params:Promise.resolve({siteId:site.slug})})).status,403);
    assert.equal((await detail.DELETE(new NextRequest('http://fixture.invalid/',{method:'DELETE'}),{params:Promise.resolve({siteId:site.slug,commentId:rootComment.id})})).status,403);
    assert.equal(reads,0);assert.equal(writes,0);
  });deny=false;

}
if (failures.length) {
  console.error(failures.join('\n'));
  if (!process.argv.includes('--expect-known-truncation')) process.exitCode = 1;
  else console.log(`Known comment inventory failures reproduced: ${failures.length}`);
} else console.log(`Comment inventory checks passed: ${checks}; actual handlers with demo/repository adapters, no provider/browser/SQL proof.`);
