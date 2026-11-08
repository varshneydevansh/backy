import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';

const calls = [];
let status = 201, body = { success: true, requestId: 'reply', data: { comment: { id: 'saved', status: 'pending', extension: { retained: [false, 0, null] } }, message: 'Saved for moderation', completionWarnings: ['COMMENT_ACTIVITY_PENDING'] } };
const client = createBackyClient({ baseUrl: 'https://fixture.invalid', siteId: 'default/site', fetch: async (url, init) => { calls.push({ url: new URL(url), init }); return Response.json(body, { status }); } });
let checks = 0;
for (const moderationMode of ['manual', 'auto-approve']) {
  const result = await client.createAdminCommentReply('parent/id', { content: 'Saved reply', moderationMode, requestId: 'body-request' }, { siteId: 'selected/site', adminSession: 'synthetic-session', credentials: 'include', requestId: 'transport-request' });
  const call = calls.at(-1), payload = JSON.parse(call.init.body);
  assert.equal(call.url.pathname, '/api/admin/sites/selected%2Fsite/comments/parent%2Fid/replies');
  assert.equal(call.init.method, 'POST'); assert.equal(call.init.credentials, 'include');
  assert.equal(call.init.headers.get('x-backy-admin-session'), 'synthetic-session'); assert.equal(call.init.headers.get('x-request-id'), 'transport-request');
  assert.equal(payload.moderationMode, moderationMode); assert(!Object.hasOwn(payload, 'requestId')); assert(!Object.hasOwn(payload, 'adminSession'));
  assert.deepEqual(result.data.completionWarnings, ['COMMENT_ACTIVITY_PENDING']); assert.deepEqual(result.data.comment.extension.retained, [false, 0, null]); checks += 10;
}
await client.createAdminCommentReply('parent', { content: 'Default approved semantics are server-owned', requestId: 'body-request' });
assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/default%2Fsite/comments/parent/replies');
assert.equal(calls.at(-1).init.headers.get('x-request-id'), 'body-request'); assert(!Object.hasOwn(JSON.parse(calls.at(-1).init.body), 'moderationMode')); checks += 3;
for (const [code, http] of [['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['COMMENT_NOT_FOUND', 404], ['COMMENT_PARENT_CONFLICT', 409], ['COMMENT_IDENTITY_BLOCKED', 422], ['COMMENT_SUBMISSION_UNAVAILABLE', 503]]) {
  status = http; body = { success: false, requestId: 'reply', error: { code, message: 'Refused' } };
  const before = calls.length;
  await assert.rejects(client.createAdminCommentReply('parent', { content: 'Refused' }), error => error instanceof BackyApiError && error.status === http && error.code === code);
  assert.equal(calls.length, before + 1); checks += 2;
}
console.log(`Moderator reply SDK transport PASS ${checks} checks; private encoded path, selected-site session credentials, request IDs, saved warnings and refusal without replay. Mock transport; actual admission checked separately.`);
