import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const output = buildSync({ entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel: 'silent' }).outputFiles[0].text;
const module = { exports: {} };
let calls = 0, status = 201, last;
vm.runInNewContext(output, { module, exports: module.exports, console, URL, Headers, Request, Response,
  fetch: async (url, init) => {
    calls++; last = { url, init, body: JSON.parse(init.body) };
    return status === 201 ? Response.json({ success: true, data: { comment: { id: 'saved-reply', extension: { retained: [false, 0, null] } }, completionWarnings: ['COMMENT_ACTIVITY_PENDING', 'COMMENT_AUDIT_PENDING'] } }, { status })
      : Response.json({ success: false, error: { message: 'Parent changed. Reload the discussion.' } }, { status });
  },
});
let checks = 0;
for (const targetType of ['page', 'post']) {
  const result = await module.exports.createCommentWithOutcome('selected/site', { targetType, targetId: 'target/id', parentId: 'parent/id', content: 'Queued archived discussion reply', commentThreadId: 'legacy-root', moderationMode: 'manual', requestId: 'reply-request' });
  assert.equal(new URL(last.url).pathname, '/api/admin/sites/selected%2Fsite/comments/parent%2Fid/replies');
  assert.equal(last.init.method, 'POST'); assert.equal(last.body.targetType, targetType); assert.equal(last.body.targetId, 'target/id');
  assert.equal(last.body.moderationMode, 'manual'); assert.equal(last.body.commentThreadId, 'legacy-root');
  for (const key of ['parentId', 'userId', 'rateLimitBypass', 'skipActivity', 'honeypot', 'startedAt']) assert(!Object.hasOwn(last.body, key));
  assert.deepEqual(result.completionWarnings, ['COMMENT_ACTIVITY_PENDING', 'COMMENT_AUDIT_PENDING']);
  assert.deepEqual(result.comment.extension.retained, [false, 0, null]); checks += 14;
}
for (status of [401, 403, 404, 409, 422, 503]) {
  const before = calls;
  await assert.rejects(module.exports.createCommentWithOutcome('site', { targetType: 'post', targetId: 'target', parentId: 'parent', content: 'Denied reply' }), /Parent changed/);
  assert.equal(calls, before + 1); checks += 2;
}
status = 201;
await module.exports.createCommentWithOutcome('site', { targetType: 'page', targetId: 'page', content: 'Legacy top-level submission' });
assert.equal(new URL(last.url).pathname, '/api/sites/site/pages/page/comments'); assert(!Object.hasOwn(last.body, 'rateLimitBypass')); checks += 2;
console.log(`Moderator reply actual bundled admin adapter PASS ${checks} checks; encoded private parent path, queued mode/thread assertions, warning/unknown-value preservation, failures without replay, unchanged top-level endpoint. Synthetic fetch; served UI separate.`);
