// Actual routes, central permission gates, binding parser and provider adapter; all identity/network/persistence inputs are fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fixture } from './admin-access-test-fixtures.mts';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';
import { assertSiteMailboxContractBody } from './site-mailbox-contract.mts';

const token = 'synthetic-mail-api-token-never-live';
const bindings = [
  { id: 'primary', siteId: 'site-fixture', mailboxId: 'mailbox/primary', address: 'primary@example.test' },
  { id: 'support', siteId: 'site-fixture', mailboxId: 'mailbox/support', address: 'support@example.test' },
  { id: 'other', siteId: 'other-site', mailboxId: 'mailbox/other', address: 'other@example.test' },
];
const account = { data: { mailboxes: bindings.map(binding => ({ resourceId: binding.mailboxId, address: binding.address })).concat([{ resourceId: 'global-private', address: 'global@example.test' }]) } };
const pagination = { page: 1, perPage: 20, total: 1, totalPages: 1 };
const folder = { path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: null, messageCount: 1, unreadCount: 1, token };
const message = { uid: 8, path: 'INBOX', date: '2026-10-11T12:00:00Z', flags: [], unseen: true, size: 100, subject: 'Synthetic subject', from: { name: 'Reader', address: 'reader@example.test' }, to: [{ name: 'Site', address: 'primary@example.test' }], html: 'PRIVATE_HTML_MUST_NOT_LEAK', token, attachments: [{ token }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let checks = 0;
for (const demo of [false, true]) {
  const env: Record<string, string | undefined> = { BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_HOSTINGER_MAILBOX_BINDINGS: JSON.stringify(bindings), BACKY_EMAIL_FROM: 'global@example.test', BACKY_HOSTINGER_MAILBOX_ID: 'global-private', BACKY_EMAIL_SITE_SENDERS: JSON.stringify({ 'site-fixture': 'global@example.test' }) };
  const f = fixture({ demo, actorRole: 'owner', env });
  const calls: { url: string; init?: RequestInit }[] = [];
  let responses: Array<Response | Error> = [];
  const fetchMail: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    assert(String(input).startsWith('https://api.mail.hostinger.com/api/v1/'), 'No live network is allowed');
    const response = responses.shift();
    assert(response, 'Unexpected synthetic provider request');
    if (response instanceof Error) throw response;
    return response;
  };
  const globals = { fetch: fetchMail, setTimeout, clearTimeout, AbortSignal, TextDecoder };
  const hostinger = loadMediaFixture('../src/lib/hostingerMail.ts', {}, { env }, globals);
  const policy = loadMediaFixture('../src/lib/emailSenderPolicy.ts', {}, { env });
  const mocks = { ...f.mocks, '@/lib/hostingerMail': hostinger, '@/lib/emailSenderPolicy': policy };
  const helper = loadMediaFixture('../src/lib/siteMailboxes.ts', mocks, { env }, globals);
  mocks['@/lib/siteMailboxes'] = helper;
  const paths = {
    bindings: '../src/app/api/admin/sites/[siteId]/settings/mailboxes/route.ts',
    folders: '../src/app/api/admin/sites/[siteId]/settings/mailboxes/[bindingId]/folders/route.ts',
    messages: '../src/app/api/admin/sites/[siteId]/settings/mailboxes/[bindingId]/messages/route.ts',
    read: '../src/app/api/admin/sites/[siteId]/settings/mailboxes/[bindingId]/messages/[uid]/read/route.ts',
  };
  const routes = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, loadMediaFixture(path, mocks, { env }, globals)]));
  async function call(operation = 'bindings', options: { siteId?: string; bindingId?: string; uid?: string; query?: string; body?: unknown; headers?: Record<string, string>; method?: string; rawBody?: string | Uint8Array } = {}) {
    const siteId = options.siteId || f.site.id, bindingId = options.bindingId || 'primary', uid = options.uid || '8';
    const method = options.method || (operation === 'read' ? 'POST' : 'GET');
    const suffix = operation === 'bindings' ? '' : `/${bindingId}/${operation === 'read' ? `messages/${uid}/read` : operation}`;
    const request = new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/settings/mailboxes${suffix}${options.query || ''}`, {
      method, headers: { 'x-request-id': 'synthetic-mailbox', 'content-type': 'application/json', cookie: 'backy_admin_session=synthetic-cookie', origin: 'http://fixture.invalid', ...options.headers },
      ...(method === 'POST' ? { body: options.rawBody ?? JSON.stringify(options.body ?? { folder: 'INBOX' }) } : {}),
    });
    const context = { params: Promise.resolve({ siteId, bindingId, uid }) };
    const response: NextResponse = method === (operation === 'read' ? 'POST' : 'GET') ? await routes[operation][method](request, context) : await helper.siteMailboxRoute(request, context, operation);
    assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
    const body = await response.json();
    if (response.status !== 405) assertSiteMailboxContractBody(operation === 'bindings' ? '' : operation === 'folders' ? '/{bindingId}/folders' : operation === 'messages' ? '/{bindingId}/messages' : '/{bindingId}/messages/{uid}/read', method, response.status, body);
    assert(!JSON.stringify(body).includes(token), 'API token must never enter route responses');
    assert(!JSON.stringify(body).includes('global-private'), 'Global mailbox resource must never enter route responses');
    assert(!JSON.stringify(body).includes('PRIVATE_HTML_MUST_NOT_LEAK'));
    return { response, body };
  }
  async function denial(operation: string, status: number, options: Parameters<typeof call>[1] = {}, code?: string) {
    const before = calls.length, writes = f.effects.writes;
    const result = await call(operation, options);
    assert.equal(result.response.status, status, JSON.stringify(result.body));
    if (code) assert.equal(result.body.error.code, code);
    assert.equal(calls.length, before, 'Denied requests must not call the provider');
    assert.equal(f.effects.writes, writes, 'Denied requests must not touch service usage or settings');
    checks++;
    return result;
  }
  let result = await call();
  assert.equal(result.response.status, 200); assert.equal(result.body.data.siteId, f.site.id);
  assert.deepEqual(result.body.data.mailboxes, [{ id: 'primary', address: 'primary@example.test' }, { id: 'support', address: 'support@example.test' }]);
  assert.equal(result.body.data.configured, true); assert.equal(result.body.data.capabilities.compose, true);
  assert.equal(calls.length, 0); checks++;
  result = await call('bindings', { siteId: 'fixture' }); assert.equal(result.body.data.siteId, f.site.id); checks++;
  result = await call('bindings', { siteId: 'other-site' }); assert.deepEqual(result.body.data.mailboxes, [{ id: 'other', address: 'other@example.test' }]); checks++;
  for (const operation of ['folders', 'messages', 'read']) {
    await denial(operation, 404, { bindingId: 'other', ...(operation === 'messages' ? { query: '?folder=INBOX' } : {}) }, 'MAILBOX_BINDING_NOT_FOUND');
    await denial(operation, 404, { bindingId: 'unknown', ...(operation === 'messages' ? { query: '?folder=INBOX' } : {}) }, 'MAILBOX_BINDING_NOT_FOUND');
  }
  await denial('bindings', 404, { siteId: 'absent' }, 'SITE_NOT_FOUND');
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    f.actor.role = role;
    for (const operation of ['bindings', 'folders', 'messages', 'read']) await denial(operation, 403, { ...(operation === 'messages' ? { query: '?folder=INBOX' } : {}) });
  }
  f.actor.role = 'owner';
  const sessionStore = f.mocks['@/lib/admin-auth/sessionStore'], originalSession = sessionStore.getAdminSessionWithPersistence;
  sessionStore.getAdminSessionWithPersistence = async () => null;
  await denial('bindings', 401); sessionStore.getAdminSessionWithPersistence = originalSession;
  await denial('bindings', 401, { headers: { cookie: '' } });
  f.actor.status = 'suspended'; await denial('bindings', 403); f.actor.status = 'active';
  for (const denied of ['sites.view', 'settings.view']) {
    // Use the real override writer shape rather than a fake authorization gate.
    f.mocks['@/lib/backyStore'].updateAdminUserPermissionOverrides(f.actor.id, { [denied]: 'deny' });
    await denial('bindings', 403);
    f.settings().auth.userPermissionOverrides = [];
  }
  const serviceKey = 'synthetic-issued-mail-key';
  f.settings().auth.apiKeyServiceKeys = [{ id: 'mail-service', keyHash: createHash('sha256').update(serviceKey).digest('hex'), scope: { version: 1, mode: 'workspace', siteIds: [], permissions: [], expiresAt: null, revision: 1 } }];
  for (const operation of ['bindings', 'folders', 'messages', 'read']) await denial(operation, 403, { headers: { 'x-backy-admin-key': serviceKey }, ...(operation === 'messages' ? { query: '?folder=INBOX' } : {}) }, 'OWNER_SESSION_REQUIRED');
  assert.equal(f.settings().auth.apiKeyServiceKeys[0].lastUsedAt, undefined); checks++;
  for (const credentials of [{ authorization: 'Bearer synthetic-owner-session' }, { 'x-backy-admin-session': 'synthetic-owner-session' }, { 'x-api-key': serviceKey }]) {
    for (const cookie of ['', 'backy_admin_session=synthetic-cookie']) await denial('read', 403, { headers: { ...credentials, cookie } }, 'OWNER_SESSION_REQUIRED');
  }
  // Restricted operator policies and keys cannot inherit workspace inbox access.
  f.actor.role = 'admin';
  f.settings().auth.userSiteGrants = [{ userId: f.actor.id, scope: { version: 1, revision: 1, mode: 'selected-sites', expiresAt: null, grants: [{ siteId: f.site.id, permissions: ['sites.view'] }] } }];
  await denial('bindings', 403); f.actor.role = 'owner'; f.settings().auth.userSiteGrants = [];
  for (const headers of [ { cookie: 'backy_admin_session=synthetic-cookie', origin: 'https://foreign.example.test' }, { cookie: 'backy_admin_session=synthetic-cookie', origin: '' } ]) await denial('read', 403, { headers }, 'ADMIN_COOKIE_ORIGIN_DENIED');
  for (const options of [{ query: '?page=0' }, { query: '?page=9007199254740992' }, { query: '?perPage=101' }, { query: '?page=1&page=2' }, { query: '?mailboxId=global-private' }]) await denial('folders', 400, options, 'MAILBOX_REQUEST_INVALID');
  await denial('messages', 400, {}, 'MAILBOX_REQUEST_INVALID');
  await denial('messages', 400, { query: '?folder=..' }, 'MAILBOX_REQUEST_INVALID');
  for (const options of [{ uid: '-1' }, { uid: '1x' }, { uid: '9007199254740992' }, { body: { folder: 'INBOX', mailboxId: 'global-private' } }, { body: { folder: '..' } }, { rawBody: 'malformed' }, { rawBody: 'x'.repeat(8193) }, { rawBody: '{"folder":"INBOX","folder":"Archive"}' }, { rawBody: '{"folder":"INBOX","fo\\u006cder":"Archive"}' }, { rawBody: new Uint8Array([123,34,102,111,108,100,101,114,34,58,34,255,34,125]) }, { headers: { 'content-type': 'application/jsonp' } }]) await denial('read', 400, options, 'MAILBOX_REQUEST_INVALID');
  await denial('read', 405, { method: 'GET' }, 'MAILBOX_METHOD_NOT_ALLOWED'); assert.equal(routes.read.GET, undefined); checks++;
  const originalBindings = env.BACKY_HOSTINGER_MAILBOX_BINDINGS;
  for (const value of ['malformed', '{}', JSON.stringify([{ ...bindings[0], siteId: 'site invalid' }]), JSON.stringify([...bindings, { ...bindings[0], id: 'duplicate-mailbox' }]), JSON.stringify([...bindings, { ...bindings[0], mailboxId: 'different', address: 'different@example.test' }]), JSON.stringify([{ ...bindings[0], address: 'Name <primary@example.test>' }])]) {
    env.BACKY_HOSTINGER_MAILBOX_BINDINGS = value; await denial('bindings', 503, {}, 'MAILBOX_CONFIGURATION_INVALID');
  }
  env.BACKY_HOSTINGER_MAILBOX_BINDINGS = '';
  result = await call(); assert.equal(result.body.data.configured, false); assert.deepEqual(result.body.data.mailboxes, []); checks++;
  await denial('folders', 404, {}, 'MAILBOX_BINDING_NOT_FOUND');
  env.BACKY_HOSTINGER_MAILBOX_BINDINGS = originalBindings; env.BACKY_HOSTINGER_MAIL_API_TOKEN = '';
  result = await call(); assert.equal(result.body.data.configured, false); checks++;
  await denial('folders', 503, {}, 'MAILBOX_PROVIDER_NOT_CONFIGURED'); env.BACKY_HOSTINGER_MAIL_API_TOKEN = token;

  const providerRun = (...fixtures: Array<Response | Error>) => { responses = fixtures; const start = calls.length; return () => calls.slice(start); };
  let observed = providerRun(json(account), json({ data: [folder], pagination }));
  result = await call('folders'); assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.data.folders, [{ path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: null, messageCount: 1, unreadCount: 1 }]);
  assert.equal(observed()[1].url, 'https://api.mail.hostinger.com/api/v1/mailboxes/mailbox%2Fprimary/folders?page=1&perPage=20'); checks++;
  observed = providerRun(json(account), json({ data: [message], pagination }));
  result = await call('messages', { bindingId: 'support', query: '?folder=INBOX' }); assert.equal(result.response.status, 200); assert.equal(result.body.data.bindingId, 'support');
  assert(observed()[1].url.includes('/mailbox%2Fsupport/')); assert.equal(result.body.data.messages[0].uid, 8); assert(!JSON.stringify(result.body).includes('attachments')); checks++;
  const encodedFolder = 'INBOX/Archive?x=1';
  observed = providerRun(json(account), json({ data: [{ ...message, path: encodedFolder }], pagination }));
  result = await call('messages', { query: '?folder=' + encodeURIComponent(encodedFolder) }); assert.equal(result.response.status, 200); assert(observed()[1].url.includes('/folders/INBOX%2FArchive%3Fx%3D1/messages')); checks++;
  observed = providerRun(json(account), json({ data: { text: 'Only synthetic plain text', html: 'PRIVATE_HTML_MUST_NOT_LEAK', token, unrelated: true } }));
  result = await call('read', { headers: { cookie: 'backy_admin_session=synthetic-cookie', origin: 'http://fixture.invalid' } });
  assert.equal(result.response.status, 200); assert.deepEqual(result.body.data, { schema: 'backy.mailbox-read.v1', siteId: f.site.id, bindingId: 'primary', folder: 'INBOX', uid: 8, text: 'Only synthetic plain text', readMarksSeen: true });
  assert.equal(observed()[1].url, 'https://api.mail.hostinger.com/api/v1/mailboxes/mailbox%2Fprimary/folders/INBOX/messages/8/text');
  for (const call of observed()) { assert.equal(call.init?.method, 'GET'); assert.equal(call.init?.redirect, 'error'); assert.equal(call.init?.cache, 'no-store'); assert(call.init?.signal); assert.equal(new Headers(call.init?.headers).get('Authorization'), 'Bearer ' + token); } checks++;
  for (const value of [[], [{ resourceId: bindings[0].mailboxId, address: 'different@example.test' }], [{ resourceId: 'different', address: bindings[0].address }], [account.data.mailboxes[0], account.data.mailboxes[0]]]) {
    providerRun(json({ data: { mailboxes: value } })); result = await call('folders'); assert.equal(result.response.status, 502); assert.equal(responses.length, 0); checks++;
  }
  for (const payload of [{ data: [message], pagination: { ...pagination, page: 2 } }, { data: [{ ...message, path: 'foreign-folder' }], pagination }, { data: [{}], pagination }, { data: Array.from({ length: 21 }, () => message), pagination: { ...pagination, total: 21, totalPages: 2 } }]) {
    providerRun(json(account), json(payload)); result = await call('messages', { query: '?folder=INBOX' }); assert.equal(result.response.status, 502); checks++;
  }
  for (const status of [401, 403, 429, 500]) {
    providerRun(json({ privateError: token }, status)); result = await call('folders'); assert.equal(result.response.status, status === 429 ? 429 : 502); checks++;
  }
  providerRun(Error('Private network error: ' + token)); result = await call('folders'); assert.equal(result.response.status, 502); checks++;
  providerRun(json(account), json({ data: [folder], pagination: { ...pagination, perPage: 101 } }));
  await assert.rejects(() => hostinger.listHostingerMailFolders({ apiToken: token, from: bindings[0].address, mailboxId: bindings[0].mailboxId }), (error: any) => error instanceof hostinger.HostingerMailError && error.reason === 'invalid-response'); checks++;
  for (const payload of [{ data: { text: 2, html: 'PRIVATE_HTML_MUST_NOT_LEAK' } }, { data: { html: 'PRIVATE_HTML_MUST_NOT_LEAK' } }, { data: { text: 'x'.repeat(262145) } }]) {
    providerRun(json(account), json(payload)); result = await call('read'); assert.equal(result.response.status, 502); checks++;
  }
  let cancelled = false;
  const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(800_000)); controller.enqueue(new Uint8Array(300_000)); }, cancel() { cancelled = true; } }));
  providerRun(json(account), oversized); result = await call('folders'); assert.equal(result.response.status, 502); assert.equal(cancelled, true); checks++;
  providerRun(json(account), new Response('{}', { headers: { 'content-length': '1048577' } })); result = await call('folders'); assert.equal(result.response.status, 502); checks++;
  providerRun(json(account), new Response(new Uint8Array([123,34,100,97,116,97,34,58,123,34,116,101,120,116,34,58,34,255,34,125,125])));
  result = await call('read'); assert.equal(result.response.status, 502); checks++;
  if (demo) {
    let stalledCancelled = false;
    providerRun(json(account), new Response(new ReadableStream({ start() {}, cancel() { stalledCancelled = true; } })));
    const before = Date.now(); result = await call('read');
    assert.equal(result.response.status, 502); assert.equal(stalledCancelled, true); assert(Date.now() - before < 12000); checks++;
  }
  assert.equal(responses.length, 0);
}
console.log(`Site mailboxes: ${checks} actual handler/access/binding/provider behavior scenarios passed in demo and repository modes; synthetic mail only, no provider certification.`);
