import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [];
const client = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site/a', headers: { 'content-type': 'application/json' }, fetch: async (input, init) => {
  const url = new URL(input); calls.push({ url, init });
  if (url.pathname.includes('/attachments/')) return url.pathname.endsWith('/denied')
    ? Response.json({ success: false, requestId: 'fixture', error: { code: 'FORBIDDEN', message: 'Denied' } }, { status: 403 })
    : new Response(new Uint8Array([0, 1, 255]), { headers: { 'content-type': 'application/octet-stream' } });
  if (url.pathname.endsWith('/restore') && JSON.parse(init.body).expectedDesignFingerprint === 'stale') return Response.json({ success: false, requestId: 'fixture', error: { code: 'TEMPLATE_HISTORY_CONFLICT', message: 'Reload history' } }, { status: 409 });
  return Response.json({ success: true, requestId: 'fixture', data: { revisions: [], submission: { values: {} } } });
} });
await client.adminTemplateHistory('article/a', { offset: 100, limit: 100, adminSession: 'fixture', credentials: 'include' });
assert.equal(calls[0].url.pathname, '/api/admin/sites/site%2Fa/templates/article%2Fa/revisions');
assert.equal(calls[0].url.searchParams.get('offset'), '100'); assert.equal(calls[0].init.credentials, 'include');
assert.ok(calls[0].init.headers.get('authorization')?.includes('fixture') || calls[0].init.headers.get('x-backy-admin-session') === 'fixture');
await client.adminTemplateHistory(undefined, { siteId: 'other' }); assert.equal(calls[1].url.pathname, '/api/admin/sites/other/templates/revisions');
await client.restoreAdminTemplateRevision('article/a', 'revision/a', 'a'.repeat(64));
assert.equal(calls[2].url.pathname, '/api/admin/sites/site%2Fa/templates/article%2Fa/revisions/revision%2Fa/restore');
assert.deepEqual(JSON.parse(calls[2].init.body), { expectedDesignFingerprint: 'a'.repeat(64) });
await assert.rejects(client.restoreAdminTemplateRevision('article', 'r', 'stale'), e => e instanceof BackyApiError && e.status === 409);
const file = new File([new Uint8Array([0,1,255])], 'sample.bin', { type: 'application/octet-stream' });
await client.submitFormFiles('upload/a', { values: { note: 'Sample' }, requestId: 'request' }, { documents: [file] });
const upload = calls.at(-1);
assert.equal(upload.url.pathname, '/api/sites/site%2Fa/forms/upload%2Fa/submissions');
assert.equal(upload.init.headers.get('content-type'), null); assert.equal(upload.init.headers.get('x-request-id'), 'request');
assert.ok(upload.init.body instanceof FormData); assert.deepEqual(JSON.parse(upload.init.body.get('payload')), { values: { note: 'Sample' }, requestId: 'request' });
assert.equal(upload.init.body.get('documents').name, 'sample.bin'); assert.deepEqual(new Uint8Array(await upload.init.body.get('documents').arrayBuffer()), new Uint8Array([0,1,255]));
const before = calls.length;
assert.throws(() => client.submitFormFiles('upload', { values: {} }, { documents: Array(6).fill(file) }));
assert.throws(() => client.submitFormFiles('upload', { values: {} }, { documents: new File([new Uint8Array(4194305)], 'big.bin') }));
assert.throws(() => client.submitFormFiles('upload', { values: {} }, { payload: file })); assert.equal(calls.length, before);
const bytes = await client.downloadAdminFormAttachment('f/a','s/a','file/a', { adminSession: 'fixture', credentials: 'include' });
assert.deepEqual(new Uint8Array(await bytes.arrayBuffer()), new Uint8Array([0,1,255]));
assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/site%2Fa/forms/f%2Fa/submissions/s%2Fa/attachments/file%2Fa');
await assert.rejects(client.downloadAdminFormAttachment('f','s','denied'), e => e instanceof BackyApiError && e.status === 403);
console.log('SDK template/file workflows passed: scoped history, fingerprint restore409, real multipart bytes, limits, automatic boundary headers and authorized binary download.');
