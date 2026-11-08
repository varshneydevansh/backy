import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const output = buildSync({
  entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  define: { 'import.meta.env': '{}' }, logLevel: 'silent',
}).outputFiles[0].text;
const module = { exports: {} };
const deleted = [{ id: 'root', siteId: 'site', content: 'Root', extension: { nested: [false, 0] } }, { id: 'child', parentId: 'root' }];
let calls = 0, legacy = false, unavailable = false;
vm.runInNewContext(output, {
  module, exports: module.exports, console, URL, Headers, Request, Response,
  fetch: async (url, init) => {
    calls++;
    if (init.method === 'POST') {
      assert.match(url, /api\/admin\/sites\/site\/comments\/parent\/replies$/);
      const body = JSON.parse(init.body);
      assert.equal(body.targetType, 'page'); assert.equal(body.targetId, 'page');
      assert(!Object.hasOwn(body, 'parentId')); assert(!Object.hasOwn(body, 'rateLimitBypass'));
      if (unavailable) return Response.json({ success: false, error: { message: 'Parent changed.' } }, { status: 409 });
      return Response.json({ success: true, data: { comment: deleted[0], ...(legacy ? {} : { completionWarnings: ['COMMENT_DELIVERY_PENDING'] }) } }, { status: 201 });
    }
    if (init.method === 'PATCH') {
      assert.match(url, /sites\/site\/comments(?:\/root)?$/);
      if (unavailable) return Response.json({ success: false, error: { message: 'Reload the thread.' } }, { status: 409 });
      const data = url.endsWith('/root') ? { comment: deleted[0] } : { updated: deleted, updatedCount: 2, missingIds: [] };
      return Response.json({ success: true, data: { ...data, ...(legacy ? {} : { completionWarnings: ['COMMENT_ACTIVITY_PENDING', 'COMMENT_DELIVERY_PENDING', 'COMMENT_AUDIT_PENDING'] }) } });
    }
    if (url.endsWith('/comments/blocklist')) {
      assert.equal(init.method, 'DELETE');
      if (unavailable) return Response.json({success:false,error:{message:'Atomic moderation unavailable.'}},{status:503});
      return Response.json({success:true,data:{siteId:'site',deleted:[{id:'block-a'}],deletedCount:1,missingIds:[],...(legacy?{}:{completionWarnings:['COMMENT_AUDIT_PENDING'],concurrencyBoundary:'database-site-row-lock'})}});
    }
    assert.match(url, /sites\/site\/comments\/root$/);
    assert.equal(init.method, 'DELETE');
    if (unavailable) return Response.json({ success: false, error: { code: 'COMMENT_LIFECYCLE_UNAVAILABLE', message: 'Atomic deletion unavailable.' } }, { status: 503 });
    return Response.json(legacy ? { success: true, deleted, deletedCount: 2 } : {
      success: true, data: { deleted, deletedCount: 2, completionWarnings: ['COMMENT_AUDIT_PENDING'], concurrencyBoundary: 'database-site-row-lock' }
    });
  },
});
const api = module.exports;
const result = await api.deleteComment('site', 'root');
assert.deepEqual(result.completionWarnings, ['COMMENT_AUDIT_PENDING']);
assert.equal(result.concurrencyBoundary, 'database-site-row-lock');
assert.deepEqual(result.deleted, deleted); assert.equal(result.deletedCount, 2);
legacy = true;
const old = await api.deleteComment('site', 'root');
assert.equal(old.completionWarnings.length, 0); assert.equal(old.concurrencyBoundary, undefined);
assert.deepEqual(old.deleted, deleted);
unavailable = true;
await assert.rejects(api.deleteComment('site', 'root'), /Atomic deletion unavailable/);
assert.equal(calls, 3, 'No automatic retry after committed deletion or unavailable repository');
console.log('Actual bundled admin comment adapter retains deleted descendants, unknown data, postcommit warnings and concurrency boundary; legacy success and503 no-retry PASS. Fetch synthetic; served UI separate.');

unavailable = false; legacy = false;
const expectedWarnings = ['COMMENT_ACTIVITY_PENDING', 'COMMENT_DELIVERY_PENDING', 'COMMENT_AUDIT_PENDING'];
const moderated = await api.updateComments('site', { commentIds: ['root', 'child'], status: 'approved' });
assert.deepEqual(moderated.completionWarnings, expectedWarnings); assert.equal(moderated.updatedCount, 2);
const moved = await api.updateCommentThreadWithOutcome('site', 'root', { parentId: 'parent' });
assert.deepEqual(moved.completionWarnings, expectedWarnings); assert.deepEqual(moved.comment, deleted[0]);
assert.deepEqual(await api.updateCommentThread('site', 'root', { parentId: 'parent' }), deleted[0]);
legacy = true;
assert.equal((await api.updateComments('site', { commentIds: ['root'], status: 'approved' })).completionWarnings.length, 0);
assert.equal((await api.updateCommentThreadWithOutcome('site', 'root', { parentId: 'parent' })).completionWarnings.length, 0);
unavailable = true;
await assert.rejects(api.updateCommentThreadWithOutcome('site', 'root', { parentId: 'parent' }), /Reload the thread/);
assert.equal(calls, 9, 'Each operation sends one request, including conflict');
console.log('Actual moderation/thread adapters preserve activity/delivery/audit warnings, saved data and backward-compatible comment-only helper; legacy and409 no-retry PASS.');

unavailable = false; legacy = false;
const input = { targetType: 'page', targetId: 'page', parentId: 'parent', content: 'Reply' };
const created = await api.createCommentWithOutcome('site', input);
assert.deepEqual(created.comment, deleted[0]); assert.deepEqual(created.completionWarnings, ['COMMENT_DELIVERY_PENDING']);
assert.deepEqual(await api.createComment('site', input), deleted[0]);
legacy = true; assert.equal((await api.createCommentWithOutcome('site', input)).completionWarnings.length, 0);
unavailable = true; await assert.rejects(api.createCommentWithOutcome('site', input), /Parent changed/);
assert.equal(calls, 13, 'Creation never automatically retries saved or conflicting replies');
console.log('Actual reply creation adapter preserves201 delivery warning, saved reply and compatibility helper; legacy and409 no-retry PASS.');

unavailable=false;legacy=false;const unblock=await api.deleteCommentBlocklistEntries('site',['block-a']);assert.deepEqual(unblock.completionWarnings,['COMMENT_AUDIT_PENDING']);assert.equal(unblock.concurrencyBoundary,'database-site-row-lock');assert.equal(unblock.deletedCount,1);
legacy=true;const oldUnblock=await api.deleteCommentBlocklistEntries('site',['block-a']);assert.equal(oldUnblock.completionWarnings.length,0);assert.equal(oldUnblock.concurrencyBoundary,undefined);
unavailable=true;await assert.rejects(api.deleteCommentBlocklistEntries('site',['block-a']),/Atomic moderation unavailable/);assert.equal(calls,16,'Unblock never automatically retries');
console.log('Actual bundled blocklist adapter preserves committed audit warning/boundary and legacy response;503 no-retry PASS.');
