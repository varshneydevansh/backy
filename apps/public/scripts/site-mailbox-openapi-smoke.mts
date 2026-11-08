import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectAuthoringOperations } from './authoring-openapi-operations.mjs';
import { assertSiteMailboxContractBody, siteMailboxOperations } from './site-mailbox-contract.mts';
import type { HostingerMailFolder, HostingerMailMessage, HostingerMailPagination } from '../src/lib/hostingerMail';
let checks = 0;
const data = (value: any) => ({ success: true, requestId: 'mailbox-contract', data: value });
const folder: HostingerMailFolder = { path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: null, messageCount: 0, unreadCount: 0 };
const message: HostingerMailMessage = { uid: 1, path: 'INBOX', date: '2026-10-11T00:00:00Z', flags: [], unseen: true, size: 0, subject: null, from: null, to: [] };
const pagination: HostingerMailPagination = { page: 1, perPage: 20, total: 0, totalPages: 0 };
const cases = [
  ['', 'get', data({ schema: 'backy.site-mailboxes.v1', siteId: 'site-owned', provider: 'hostinger', configured: true, mailboxes: [{ id: 'inbox', address: 'owned@example.invalid' }], capabilities: { folders: true, messageInventory: true, messageText: true, readMarksSeen: true, compose: false, reply: false, attachments: false, provisioning: false } })],
  ['/{bindingId}/folders', 'get', data({ schema: 'backy.mailbox-folders.v1', siteId: 'site-owned', bindingId: 'inbox', folders: [folder], pagination })],
  ['/{bindingId}/messages', 'get', data({ schema: 'backy.mailbox-messages.v1', siteId: 'site-owned', bindingId: 'inbox', folder: 'INBOX', messages: [message], pagination })],
  ['/{bindingId}/messages/{uid}/read', 'post', data({ schema: 'backy.mailbox-read.v1', siteId: 'site-owned', bindingId: 'inbox', folder: 'INBOX', uid: 1, text: 'Plain text only', readMarksSeen: true })],
] as const;
for (const [path, method, body] of cases) {
  assertSiteMailboxContractBody(path, method, 200, body); checks++;
  const operation = (siteMailboxOperations as any)[`/api/admin/sites/{siteId}/settings/mailboxes${path}`][method];
  assert.deepEqual(operation.security, [{ BackyAdminSession: [] }]);
  assert.deepEqual(operation['x-backy-permissions'], ['sites.view', 'settings.view']);
  assert.equal(operation['x-backy-owner-only'], true); checks += 3;
  for (const status of [400, 401, 403, 404, 429, 502, 503]) { assertSiteMailboxContractBody(path, method, status, { success: false, requestId: 'refused', error: { code: 'REFUSED', message: 'Safe error' } }); checks++; }
  for (const key of ['token', 'resourceId', 'mailboxId', 'mappings', 'providerResponse']) {
    const leaked = structuredClone(body); (leaked.data as any)[key] = 'synthetic-private-sentinel';
    assert.throws(() => assertSiteMailboxContractBody(path, method, 200, leaked)); checks++;
  }
}
const root = '/api/admin/sites/{siteId}/settings/mailboxes';
const tooManyBindings = structuredClone(cases[0][2]);
tooManyBindings.data.mailboxes = Array.from({ length: 201 }, () => ({ id: 'box', address: 'owned@example.invalid' }));
assert.throws(() => assertSiteMailboxContractBody('', 'get', 200, tooManyBindings)); checks++;
const messageOperation = (siteMailboxOperations as any)[root + '/{bindingId}/messages'].get;
const folderQuery = messageOperation.parameters.find((parameter: any) => parameter.name === 'folder');
assert.equal(folderQuery.required, true); assert(!('default' in folderQuery.schema)); checks += 2;
const readOperation = (siteMailboxOperations as any)[root + '/{bindingId}/messages/{uid}/read'].post;
assert.equal(readOperation['x-backy-provider-side-effect'], 'marks-message-seen'); checks++;
assertSiteMailboxContractBody('/{bindingId}/messages/{uid}/read', 'post', 'request', { folder: 'Reports/2026' }); checks++;
for (const value of [{}, { folder: '' }, { folder: '.' }, { folder: '..' }, { folder: 'bad\r\nfolder' }, { folder: 'bad\0folder' }, { folder: 'a'.repeat(1025) }, { folder: 'INBOX', uid: 1 }, { folder: 'INBOX', token: 'private' }]) { assert.throws(() => assertSiteMailboxContractBody('/{bindingId}/messages/{uid}/read', 'post', 'request', value)); checks++; }
for (const [key, value] of [['uid', 0], ['uid', Number.MAX_SAFE_INTEGER + 1], ['readMarksSeen', false], ['html', '<b>hidden</b>'], ['attachments', []], ['text', '😀'.repeat(65537)]] as const) { const body = structuredClone(cases[3][2]); (body.data as any)[key] = value; assert.throws(() => assertSiteMailboxContractBody(cases[3][0], 'post', 200, body)); checks++; }
for (const value of [0, 101]) { const body = structuredClone(cases[1][2]); (body.data.pagination as any).perPage = value; assert.throws(() => assertSiteMailboxContractBody(cases[1][0], 'get', 200, body)); checks++; }
const source = readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8');
const inventory = collectAuthoringOperations(source, fileURLToPath(new URL('../src/', import.meta.url)), file => readFileSync(file, 'utf8'));
for (const [path, methods] of Object.entries(siteMailboxOperations)) for (const method of Object.keys(methods as any)) { assert(inventory.documented.has(`${method.toUpperCase()} ${path}`), 'Actual public producer includes mailbox operation'); checks++; }
console.log(`Mailbox OpenAPI contract PASS ${checks} checks; field-only discovery, cookie Owner/all permissions, provider type shapes, closed request/privacy projections, limits and explicit Seen mutation. Synthetic envelopes; actual route admission/provider checks are separate.`);
