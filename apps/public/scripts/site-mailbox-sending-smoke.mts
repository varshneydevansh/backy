import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { fixture } from './admin-access-test-fixtures.mts';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';
import { assertSiteMailboxContractBody } from './site-mailbox-contract.mts';
const token = 'synthetic-mail-send-token', binding = { id: 'primary', siteId: 'site-fixture', mailboxId: 'mailbox/fixture', address: 'from@example.test' };
const account = { data: { mailboxes: [{ resourceId: binding.mailboxId, address: binding.address }] } };
const message = { uid: 8, path: 'INBOX', date: '2026-10-13T00:00:00Z', flags: [], unseen: true, size: 5, subject: 'Fixture message', from: { name: 'Sender', address: 'sender@example.test' }, to: [{ name: '', address: binding.address }], messageId: '<source@example.test>', inReplyTo: null, text: 'PRIVATE_BODY', token };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let checks = 0;
for (const demo of [true, false]) {
 const directory = mkdtempSync(join(tmpdir(), 'backy-mailbox-sends-')), env = { BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_HOSTINGER_MAILBOX_BINDINGS: JSON.stringify([binding, { ...binding, id: 'foreign', siteId: 'other-site', mailboxId: 'other-mailbox', address: 'other@example.test' }]) };
 const f = fixture({ demo, actorRole: 'owner', env }), calls: { url: string; init: RequestInit }[] = [], responses: (Response | Error)[] = [];
 const globals = { setTimeout, clearTimeout, AbortSignal, TextDecoder, fetch: async (input: unknown, init: RequestInit = {}) => { calls.push({ url: String(input), init }); const response = responses.shift(); assert(response, 'Unexpected provider request'); if (response instanceof Error) throw response; return response; } };
 const core = loadMediaFixture('../../../packages/core/src/site-mailbox.ts', {}, { env }, globals);
 const hostinger = loadMediaFixture('../src/lib/hostingerMail.ts', {}, { env }, globals), policy = loadMediaFixture('../src/lib/emailSenderPolicy.ts', {}, { env });
 const mocks: Record<string, any> = { ...f.mocks, '@backy-cms/core': core, '@/lib/hostingerMail': hostinger, '@/lib/emailSenderPolicy': policy };
 mocks['@/lib/siteMailboxes'] = loadMediaFixture('../src/lib/siteMailboxes.ts', mocks, { env }, globals);
 const journal = loadMediaFixture('../src/lib/demoMailboxSendJournal.ts', mocks, { env, cwd: () => directory }, globals);
 mocks['@/lib/demoMailboxSendJournal'] = journal;
 if (!demo) f.repositories.mailboxSends = journal.demoMailboxSendJournal;
 const helper = loadMediaFixture('../src/lib/siteMailboxSending.ts', mocks, { env }, globals); mocks['@/lib/siteMailboxSending'] = helper;
 const route = loadMediaFixture('../src/app/api/admin/sites/[siteId]/settings/mailboxes/[bindingId]/send/route.ts', mocks, { env }, globals);
 let keyCounter = 0;
 const payload = (patch: Record<string, unknown> = {}) => ({ idempotencyKey: `synthetic-key-${String(++keyCounter).padStart(4, '0')}`, to: ['reader@example.test'], subject: 'Fixture subject', text: 'Fixture text', ...patch });
 async function call(operation = 'send', input: unknown = payload(), options: { headers?: Record<string, string>; bindingId?: string; siteId?: string; query?: string; raw?: string; method?: string } = {}) {
  const method = options.method || (operation === 'send' ? 'POST' : 'GET'), bindingId = options.bindingId || binding.id;
  const request = new NextRequest(`http://fixture.invalid/api/admin/sites/site-fixture/settings/mailboxes/${bindingId}/${operation}${options.query || ''}`, { method, headers: { 'content-type': 'application/json', cookie: 'backy_admin_session=fixture-cookie', origin: 'http://fixture.invalid', ...options.headers }, ...(method === 'POST' ? { body: options.raw ?? JSON.stringify(input) } : {}) });
  const context = { params: Promise.resolve({ siteId: options.siteId || f.site.id, bindingId, uid: '8' }) };
  const response = operation === 'send' && method === 'POST' ? await route.POST(request, context) : await helper.siteMailboxSendingRoute(request, context, operation);
  const body = await response.json();
  if (response.status !== 405) assertSiteMailboxContractBody(operation === 'thread' ? '/{bindingId}/messages/{uid}/thread' : `/{bindingId}/${operation}`, method, response.status, body);
  assert(!JSON.stringify(body).includes(token)); assert(!JSON.stringify(body).includes(binding.mailboxId)); assert(!JSON.stringify(body).includes('PRIVATE_BODY'));
  return { response, body };
 }
 async function deny(input: unknown, status: number, options: Parameters<typeof call>[2] = {}) { const before = calls.length; const result = await call('send', input, options); assert.equal(result.response.status, status, JSON.stringify(result.body)); assert.equal(calls.length, before); checks++; }
 try {
  await deny(payload(), 401, { headers: { cookie: '' } }); await deny(payload(), 403, { headers: { authorization: 'Bearer synthetic' } }); await deny(payload(), 403, { headers: { origin: 'https://foreign.invalid' } });
  f.actor.role = 'admin'; await deny(payload(), 403); f.actor.role = 'owner';
  f.mocks['@/lib/backyStore'].updateAdminUserPermissionOverrides(f.actor.id, { 'settings.configure': 'deny' }); await deny(payload(), 403); f.settings().auth.userPermissionOverrides = [];
  await deny(payload(), 404, { bindingId: 'foreign' }); await deny(payload(), 404, { siteId: 'missing-site' });
  for (const input of [payload({ from: 'other@example.test' }), payload({ to: ['bad'] }), payload({ to: ['reader@example.test'], cc: ['READER@example.test'] }), payload({ subject: 'bad\r\nBcc: inject' }), payload({ attachments: [{ filename: '../file', content: 'YQ==', contentType: 'text/plain' }] }), payload({ attachments: [{ filename: 'a.txt', content: 'YR==', contentType: 'text/plain' }] }), payload({ inReplyTo: { folder: 'INBOX', uid: 8, mailboxId: 'bad' } }), payload({ attachments: Array.from({ length: 11 }, () => ({ filename: 'a.txt', content: '', contentType: 'text/plain' })) }), payload({ text: 'a'.repeat(262145) })]) await deny(input, 400);
  await deny({}, 400, { raw: '{"idempotencyKey":"synthetic-duplicate","to":["a@example.test"],"subject":"a","text":"a","te\\u0078t":"b"}' });
  const fullAttachment = Buffer.alloc(2 * 1024 * 1024).toString('base64'); assert.equal(hostinger.normalizeHostingerMailOutgoingMessage({ from: binding.address, to: ['reader@example.test'], subject: '', text: '', attachments: [{ filename: 'full.bin', content: fullAttachment, contentType: 'application/octet-stream' }] }).attachments[0].content.length, fullAttachment.length); checks++;
  await deny(payload({ attachments: [{ filename: 'full.bin', content: fullAttachment, contentType: 'application/octet-stream' }, { filename: 'extra.txt', content: 'YQ==', contentType: 'text/plain' }] }), 400);
  const outgoing = payload({ cc: ['cc@example.test'], bcc: ['bcc@example.test'], attachments: [{ filename: 'report.txt', content: 'YQ==', contentType: 'text/plain' }] });
  responses.push(json(account), new Response(null, { status: 204 })); const sent = await call('send', outgoing); assert.equal(sent.body.data.attempt.state, 'accepted'); assert.equal(sent.body.data.providerAccepted, true); assert.equal(sent.body.data.deliveryVerified, false);
  assert.match(calls.at(-1)!.url, /mailbox%2Ffixture\/send$/); assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string), { to: ['reader@example.test'], cc: ['cc@example.test'], bcc: ['bcc@example.test'], subject: 'Fixture subject', text: 'Fixture text', attachments: [{ filename: 'report.txt', content: 'YQ==', contentType: 'text/plain', encoding: 'base64' }] }); checks++;
  const beforeReplay = calls.length; const replay = await call('send', outgoing); assert.equal(replay.body.data.replayed, true); assert.equal(calls.length, beforeReplay); await deny({ ...outgoing, text: 'different' }, 409); checks++;
  const reply = payload({ inReplyTo: { folder: 'INBOX', uid: 8 } }); responses.push(json(account), json({ data: message }), new Response(null, { status: 204 })); const replied = await call('send', reply); assert.equal(replied.body.data.attempt.state, 'accepted'); assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string).inReplyTo, { folder: 'INBOX', uid: 8 }); checks++;
  const foreignReply = payload({ inReplyTo: { folder: 'INBOX', uid: 8 } }); responses.push(json(account), json({ data: { ...message, path: 'Foreign' } })); const invalidReply = await call('send', foreignReply); assert.equal(invalidReply.body.data.attempt.state, 'uncertain'); assert(!calls.at(-1)!.url.endsWith('/send')); checks++;
  const rejected = payload(); responses.push(json(account), new Response(null, { status: 422 })); const failure = await call('send', rejected); assert.equal(failure.body.data.attempt.state, 'rejected'); assert.equal(failure.body.data.providerAccepted, false); const beforeRejectReplay = calls.length; await call('send', rejected); assert.equal(calls.length, beforeRejectReplay); checks++;
  const uncertain = payload(); responses.push(json(account), Error('private token upstream timeout')); const unknown = await call('send', uncertain); assert.equal(unknown.body.data.attempt.state, 'uncertain'); assert.equal(unknown.body.data.automaticRetry, false); const beforeUnknownReplay = calls.length; await call('send', uncertain); assert.equal(calls.length, beforeUnknownReplay); checks++;
  const failedSettle = payload(), realSettle = journal.demoMailboxSendJournal.settle; journal.demoMailboxSendJournal.settle = async () => { throw Error('synthetic persistence outage'); }; responses.push(json(account), new Response(null, { status: 204 })); const notPersisted = await call('send', failedSettle); assert.equal(notPersisted.body.data.outcomePersisted, false); assert.equal(notPersisted.body.data.attempt.state, 'pending'); journal.demoMailboxSendJournal.settle = realSettle; const beforeFailedSettleReplay = calls.length; await call('send', failedSettle); assert.equal(calls.length, beforeFailedSettleReplay); checks++;
  const serverFailure = payload(); responses.push(json(account), new Response(null, { status: 502 })); const serverUnknown = await call('send', serverFailure); assert.equal(serverUnknown.body.data.attempt.state, 'uncertain'); checks++;
  const pending = payload(); const fingerprint = createHash('sha256').update(JSON.stringify({ mailboxId: binding.mailboxId, from: binding.address, ...hostinger.normalizeHostingerMailOutgoingMessage({ ...pending, from: binding.address }) })).digest('hex'); await journal.demoMailboxSendJournal.admit({ siteId: f.site.id, bindingId: binding.id, idempotencyKey: pending.idempotencyKey, fingerprint }); const pendingResponse = await call('send', pending); assert.equal(pendingResponse.body.data.attempt.state, 'pending'); assert.equal(pendingResponse.body.data.replayed, true); checks++;
  const history = await call('send-attempts'); assert(history.body.data.attempts.length >= 6); assert(!JSON.stringify(history.body).includes('fingerprint')); const persisted = readFileSync(join(directory, 'data/backy/private-mailbox-sends/attempts.json'), 'utf8'); assert(!persisted.includes('Fixture text')); assert(!persisted.includes('reader@example.test')); assert(!persisted.includes('YQ==')); checks++;
  const same = { siteId: f.site.id, bindingId: binding.id, idempotencyKey: 'parallel-synthetic-key', fingerprint: 'a'.repeat(64) }; const concurrent = await Promise.all([journal.demoMailboxSendJournal.admit(same), journal.demoMailboxSendJournal.admit(same)]); assert.equal(concurrent.filter(row => row.admitted).length, 1); assert.equal(concurrent[0].attempt.id, concurrent[1].attempt.id); checks++;
  responses.push(json(account), json({ data: message }), json({ data: [message, { ...message, uid: 9, messageId: '<reply@example.test>', inReplyTo: message.messageId }, { ...message, uid: 10, messageId: '<unrelated@example.test>', inReplyTo: null }], pagination: { page: 1, perPage: 20, total: 3, totalPages: 1 } })); const thread = await call('thread', {}, { query: '?folder=INBOX&page=1&perPage=20' }); assert.deepEqual(thread.body.data.messages.map((row: any) => row.uid), [8, 9]); assert.equal(thread.body.data.textMarksSeen, false); assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string), { text: message.messageId }); assert(!calls.some(row => row.url.endsWith('/text'))); checks++;
  responses.push(json(account), json({ data: { ...message, messageId: null } })); const unthreaded = await call('thread', {}, { query: '?folder=INBOX' }); assert.equal(unthreaded.body.data.sourceHasThreadHeaders, false); assert.equal(unthreaded.body.data.messages.length, 1); checks++;
  assert.equal(responses.length, 0); assert.throws(() => journal.assertNoDemoMailboxSendEvidence(f.site.id), (error: any) => error.code === 'SITE_MAILBOX_SEND_EVIDENCE_REMAINS'); checks++;
 } finally { rmSync(directory, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ ok: true, checks, boundary: 'Actual handler/provider adapter and durable filesystem journal with real authorization fixture. No live provider calls or real messages.' }));
