import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [];
let status = 200;
let failure;
const pagination = { page: 2, perPage: 7, total: 8, totalPages: 2 };
const client = createBackyClient({ baseUrl: 'https://admin.fixture.invalid/api', siteId: 'default/site', credentials: 'omit', defaultHeaders: { authorization: 'Bearer operator-sentinel', 'x-backy-admin-key': 'key-sentinel', 'x-api-key': 'legacy-key-sentinel', 'x-backy-admin-session': 'session-sentinel', cookie: 'raw-cookie-sentinel', 'x-request-id': 'default-request' }, requestIdFactory: () => 'factory-request', fetch: async (url, init) => {
  url = new URL(url); calls.push({ url, init });
  if (failure !== undefined) return Response.json(failure, { status });
  const siteId = decodeURIComponent(url.pathname.split('/')[4]);
  const root = { siteId, bindingId: 'owned-box' };
  const data = url.pathname.endsWith('/read') ? { ...root, schema: 'backy.mailbox-read.v1', folder: 'Reports/2026', uid: 45, text: 'Plain text 😀', readMarksSeen: true }
    : url.pathname.endsWith('/folders') ? { ...root, schema: 'backy.mailbox-folders.v1', folders: [{ path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: null, messageCount: 0, unreadCount: 0 }], pagination }
    : url.pathname.endsWith('/messages') ? { ...root, schema: 'backy.mailbox-messages.v1', folder: 'Reports/2026', messages: [{ uid: 45, path: 'Reports/2026', date: '2026-10-11T00:00:00Z', flags: [], unseen: false, size: 0, subject: null, from: null, to: [] }], pagination }
    : { schema: 'backy.site-mailboxes.v1', siteId, provider: 'hostinger', configured: true, mailboxes: [{ id: 'owned-box', address: 'owned@example.invalid' }], capabilities: { folders: true, messageInventory: true, messageText: true, readMarksSeen: true, compose: false, reply: false, attachments: false, provisioning: false } };
  return Response.json({ success: true, requestId: 'safe-response', data }, { status });
} });
let checks = 0;
const list = await client.adminSiteMailboxes();
assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/default%2Fsite/settings/mailboxes');
assert.equal(list.data.capabilities.compose, false); assert.equal(list.data.capabilities.readMarksSeen, true); checks += 3;
const options = { siteId: 'selected/site', requestId: 'explicit-request', adminKey: 'ignored-key', adminSession: 'ignored-session', authorization: 'ignored-authorization', headers: { cookie: 'ignored-cookie' }, credentials: 'omit' };
const folders = await client.adminSiteMailboxFolders('owned-box', { page: 2, perPage: 7, token: 'ignored-query-token' }, options);
assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/selected%2Fsite/settings/mailboxes/owned-box/folders');
assert.deepEqual([...calls.at(-1).url.searchParams], [['page', '2'], ['perPage', '7']]);
assert.equal(folders.data.folders[0].specialUse, null); assert.equal(folders.data.folders[0].messageCount, 0); checks += 4;
const messages = await client.adminSiteMailboxMessages('owned-box', { folder: 'Reports/2026', page: 2, perPage: 7 }, options);
assert.equal(calls.at(-1).url.searchParams.get('folder'), 'Reports/2026'); assert.equal(messages.data.messages[0].subject, null); assert.equal(messages.data.messages[0].unseen, false); checks += 3;
const read = await client.readAdminSiteMailboxMessage('owned-box', 45, { folder: 'Reports/2026', adminKey: 'ignored-body-key', requestId: 'ignored-body-request', html: 'ignored' }, options);
assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/selected%2Fsite/settings/mailboxes/owned-box/messages/45/read');
assert.equal(calls.at(-1).init.method, 'POST'); assert.deepEqual(JSON.parse(calls.at(-1).init.body), { folder: 'Reports/2026' });
assert.equal(read.data.text, 'Plain text 😀'); assert.equal(read.data.readMarksSeen, true); checks += 5;
for (const [index, call] of calls.entries()) {
  assert.equal(call.init.credentials, 'include'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.redirect, 'error');
  assert.equal(call.init.headers.get('x-request-id'), index === 0 ? 'factory-request' : 'explicit-request');
  for (const header of ['authorization', 'x-backy-admin-key', 'x-api-key', 'x-backy-admin-session', 'cookie']) assert.equal(call.init.headers.get(header), null);
  if (index < 3) { assert.equal(call.init.method, 'GET'); assert.equal(call.init.body, undefined); }
  checks += index < 3 ? 11 : 9;
}
let before = calls.length;
await assert.rejects(client.adminSiteMailboxes({ requestId: 'bad\r\nrequest' }), TypeError);
assert.equal(calls.length, before); checks += 2;
await client.adminSiteMailboxFolders('safe-binding', {}, { siteId: 'site-owned' });
assert.equal(calls.at(-1).url.search, ''); checks++;
for (const [code, http] of [['MAILBOX_REQUEST_INVALID', 400], ['UNAUTHORIZED', 401], ['OWNER_SESSION_REQUIRED', 403], ['MAILBOX_BINDING_NOT_FOUND', 404], ['HOSTINGER_MAIL_PROVIDER_FAILED', 429], ['HOSTINGER_MAIL_PROVIDER_FAILED', 502], ['MAILBOX_WORKSPACE_UNAVAILABLE', 503]]) {
  status = http; failure = { success: false, requestId: 'refused', error: { code, message: 'Safe refusal' } }; before = calls.length;
  await assert.rejects(client.readAdminSiteMailboxMessage('owned-box', 45, { folder: 'INBOX' }), error => error instanceof BackyApiError && error.status === http && error.code === code && error.requestId === 'refused');
  assert.equal(calls.length, before + 1, 'Provider-seen mutation must never replay automatically'); checks += 2;
}
status = 200; failure = { success: true, requestId: 'invalid' }; before = calls.length;
await assert.rejects(client.adminSiteMailboxes(), /invalid envelope/); assert.equal(calls.length, before + 1); checks += 2;
console.log(`Mailbox SDK transport PASS ${checks} checks; scoped encoded URLs, explicit folder/query/body, Owner-cookie transport isolated from inherited credentials, metadata/null/zero, request-ID validation, errors and no replay. Mock transport; no provider or live-cookie proof.`);
