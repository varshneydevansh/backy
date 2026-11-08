import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [];
let response = Response.json({ success: true, requestId: 'synthetic', data: {} });
const client = createBackyClient({ baseUrl: 'https://admin.fixture.invalid/api', siteId: 'site/a', defaultHeaders: { authorization: 'Bearer sentinel', 'x-backy-admin-key': 'sentinel', cookie: 'sentinel' }, fetch: async (url, init) => { calls.push({ url: new URL(url), init }); return response.clone(); } });
const message = { idempotencyKey: 'synthetic-send-key', to: ['reader@example.test'], cc: ['cc@example.test'], bcc: ['bcc@example.test'], subject: 'Fixture', text: 'Text', attachments: [{ filename: 'report.txt', content: 'YQ==', contentType: 'text/plain' }], inReplyTo: { folder: 'INBOX/2026', uid: 8 } };
await client.sendAdminSiteMailboxMessage('binding/a', message);
assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/site%2Fa/settings/mailboxes/binding%2Fa/send');
assert.equal(calls.at(-1).init.method, 'POST'); assert.deepEqual(JSON.parse(calls.at(-1).init.body), message);
await client.adminSiteMailboxSendAttempts('binding/a', { page: 2, perPage: 7 }); assert.equal(calls.at(-1).url.search, '?page=2&perPage=7');
await client.adminSiteMailboxThread('binding/a', 8, { folder: 'INBOX/2026', page: 2, perPage: 7 }); assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/site%2Fa/settings/mailboxes/binding%2Fa/messages/8/thread'); assert.equal(calls.at(-1).url.searchParams.get('folder'), 'INBOX/2026');
for (const { init } of calls) { assert.equal(init.credentials, 'include'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); for (const key of ['authorization', 'cookie', 'x-backy-admin-key']) assert(!init.headers.has(key)); }
const before = calls.length;
response = Response.json({ success: false, requestId: 'synthetic', error: { code: 'MAILBOX_SEND_IDEMPOTENCY_CONFLICT', message: 'Conflict' } }, { status: 409 });
await assert.rejects(client.sendAdminSiteMailboxMessage('primary', message), error => error instanceof BackyApiError && error.status === 409); assert.equal(calls.length, before + 1);
console.log('Mailbox outgoing SDK transport PASS: compose/reply/attachment payload, encoded site/binding/folder, thread/history queries, isolated cookie headers, explicit failure and no retry. Synthetic transport only.');
