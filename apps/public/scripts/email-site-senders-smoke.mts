import assert from 'node:assert/strict';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';

const forbidNetwork = () => { throw new Error('A sender-policy fixture attempted network access.'); };
const base = { BACKY_EMAIL_PROVIDER: 'local-outbox', BACKY_EMAIL_FROM: 'default@example.test', BACKY_EMAIL_SITE_SENDERS: JSON.stringify({ 'site-a': 'hello@example.test', 'site-b': 'support@example.test' }) };
function fixture(env: Record<string, string>) {
  const fixtureProcess = { env };
  const globals = { fetch: forbidNetwork, AbortSignal };
  const policy = loadMediaFixture('../src/lib/emailSenderPolicy.ts', {}, fixtureProcess, globals);
  const hostinger = loadMediaFixture('../src/lib/hostingerMail.ts', {}, fixtureProcess, globals);
  const delivery = loadMediaFixture('../src/lib/formEmailDelivery.ts', { '@/lib/emailSenderPolicy': policy, '@/lib/hostingerMail': hostinger, 'node:net': { createConnection: forbidNetwork }, 'node:tls': { connect: forbidNetwork } }, fixtureProcess, globals);
  return { policy, hostinger, delivery, fixtureProcess, globals };
}
const current = fixture(base), mail = current.delivery;
assert.equal(mail.getEmailDeliveryConfig('site-a').from, 'hello@example.test');
assert.equal(mail.getEmailDeliveryConfig('site-b').from, 'support@example.test');
assert.equal(mail.getEmailDeliveryConfig('site-unknown').from, 'default@example.test');
assert.equal(mail.getEmailDeliveryConfig('constructor').from, 'default@example.test', 'Prototype properties are never sender mappings.');
assert.equal(mail.getEmailDeliveryConfig().from, 'default@example.test', 'Unscoped lifecycle mail retains the default sender.');
assert.equal(fixture({ ...base, BACKY_EMAIL_SITE_SENDERS: '' }).delivery.getEmailDeliveryConfig('site-a').from, 'default@example.test');
const scoped = mail.getEmailDeliveryConfig('site-a');
const message = { from: scoped.from, to: 'reader@example.test', subject: 'Fixture', text: 'Synthetic content', siteId: 'site-a', status: 'accepted', requestId: 'fixture' };
assert.equal((await mail.sendEmailMessage(scoped, message)).metadata.outboxOnly, true);
await assert.rejects(() => mail.sendEmailMessage(scoped, { ...message, from: 'unapproved@example.test' }), (error: any) => error.statusCode === 403);
await assert.rejects(() => mail.sendEmailMessage(scoped, { ...message, siteId: 'site-b' }), (error: any) => error.statusCode === 403);
for (const invalid of ['{', '[]', '{"site-a":3}', '{"site-a":"bad\\r\\nBcc:other@example.test"}', '{"site-a":"Name <hello@example.test>"}', '{"bad site":"hello@example.test"}', '{"__proto__":"hello@example.test"}', JSON.stringify({ 'site-a': 'x'.repeat(65) + '@example.test' }), JSON.stringify({ 'site-a': 'ok@' + 'a'.repeat(64) + '.test' }), JSON.stringify({ 'site-a': 'hello@example.test\u007f' })]) {
  const broken = fixture({ ...base, BACKY_EMAIL_SITE_SENDERS: invalid });
  assert.throws(() => broken.delivery.getEmailDeliveryConfig('site-unknown'), (error: any) => error.statusCode === 503, 'A malformed configured map never falls back.');
  assert.throws(() => broken.delivery.getEmailDeliveryConfig(), (error: any) => error.statusCode === 503);
  const summary = broken.delivery.getEmailDeliveryCapabilitySummary('site-a');
  assert.equal(summary.configured, false); assert.equal(summary.senderPolicy.configurationValid, false);
  assert.equal(summary.senderPolicy.error, 'BACKY_EMAIL_SITE_SENDERS must map canonical site IDs to plain sender mailbox addresses.');
  assert(!JSON.stringify(summary).includes('other@example.test'));
}
assert.throws(() => mail.getEmailDeliveryConfig('site-a\r\nInjected'), (error: any) => error.statusCode === 503);
const credentialEnv = { ...base, BACKY_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_API_TOKEN: 'synthetic-private-token', BACKY_HOSTINGER_MAILBOX_ID: 'synthetic-default-box' };
const hostinger = fixture(credentialEnv);
assert.equal(hostinger.delivery.getEmailDeliveryConfig('site-a').hostinger.mailboxId, undefined, 'A different sender cannot reuse the default mailbox ID.');
assert.equal(hostinger.delivery.getEmailDeliveryConfig('site-unknown').hostinger.mailboxId, credentialEnv.BACKY_HOSTINGER_MAILBOX_ID);
const permittedBox = { resourceId: 'synthetic-site-a-box', address: 'hello@example.test' };
const providerCalls: string[] = [];
const mockProvider: typeof fetch = async (input) => { const url = String(input); providerCalls.push(url); return url.endsWith('/me') ? Response.json({ data: { mailboxes: [permittedBox] } }) : new Response(null, { status: 204 }); };
const chosen = hostinger.delivery.getEmailDeliveryConfig('site-a');
await hostinger.hostinger.sendHostingerMailMessage(chosen.hostinger, { ...message, from: chosen.from }, mockProvider);
assert(providerCalls[0].endsWith('/me')); assert(providerCalls[1].includes('/mailboxes/synthetic-site-a-box/send'));
let rejectedCalls = 0;
await assert.rejects(() => hostinger.hostinger.sendHostingerMailMessage(hostinger.delivery.getEmailDeliveryConfig('site-b').hostinger, { ...message, from: 'support@example.test' }, async () => { rejectedCalls++; return Response.json({ data: { mailboxes: [permittedBox] } }); }), (error: any) => error.reason === 'mailbox-unavailable');
assert.equal(rejectedCalls, 1, 'An inaccessible sender is rejected after account lookup, before sending.');
const summary = hostinger.delivery.getEmailDeliveryCapabilitySummary('site-a');
const serialized = JSON.stringify(summary);
for (const privateValue of [credentialEnv.BACKY_HOSTINGER_MAIL_API_TOKEN, credentialEnv.BACKY_HOSTINGER_MAILBOX_ID, 'hello@example.test', 'support@example.test', 'default@example.test']) assert(!serialized.includes(privateValue));
assert.equal(summary.senderPolicy.siteSpecificSenderConfigured, true);
assert.equal(summary.senderPolicy.authenticationVerified, false);
assert.equal(summary.senderPolicy.outboundDeliveryVerified, false);
assert.equal(summary.senderPolicy.capabilities.inbox, false);
assert.equal(summary.senderPolicy.capabilities.mailboxProvisioning, false);
assert.equal(summary.senderPolicy.capabilities.campaigns, false);

// Exercise the actual form/comment/order/low-stock callers with in-memory journals and actual local-outbox dispatch.
const sent: Array<{ from: string; siteId: string; kind: string }> = [];
const capturedMail = { ...mail, sendEmailMessage: async (config: any, email: any) => { sent.push({ from: email.from, siteId: email.siteId, kind: email.entityType }); return mail.sendEmailMessage(config, email); } };
const journal = { admit: async (input: any) => ({ ...input, id: 'fixture-attempt', state: 'pending' }), settle: async (_siteId: string, id: string, input: any) => ({ id, ...input }) };
const repositories = { formDeliveries: journal, commentDeliveries: journal, settings: { get: async () => ({ integrations: { notifications: { email: { recipient: 'operator@example.test', comments: true, orderCreated: true, lowStock: true, productLowStock: true } } } }) } };
const mocks = {
  '@/lib/formEmailDelivery': capturedMail,
  '@/lib/backyStore': { trackWebhookEvent: () => {}, getAdminSettings: () => ({}) },
  '@/lib/commentRepositorySupport': { recordRepositoryInteractionEvent: async () => {} },
  '@/lib/formDeliveryHistory': { formDeliveryJournal: () => journal, getFormDeliveryEvent: async () => null, formDeliveryAttemptEvent: (row: any) => row },
  '@/lib/demoCommentDeliveryJournal': { demoCommentDeliveryJournal: journal },
  '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories },
};
const forms = loadMediaFixture('../src/lib/formSubmissionDelivery.ts', mocks, current.fixtureProcess, current.globals);
const comments = loadMediaFixture('../src/lib/commentDelivery.ts', mocks, current.fixtureProcess, current.globals);
const commerce = loadMediaFixture('../src/lib/commerceOrderDelivery.ts', mocks, current.fixtureProcess, current.globals);
for (const siteId of ['site-a', 'site-b']) {
  const form = { id: 'fixture-form', siteId, title: 'Fixture form' }, submission = { id: 'fixture-submission', siteId, formId: form.id, status: 'accepted', values: {} };
  await forms.deliverFormSubmission({ repositories, siteId, form, submission, requestId: 'fixture', channel: 'email', target: 'mailto:operator@example.test' });
  await comments.notifyCommentDelivery({ repositories, siteId, kind: 'comment-submitted', comment: { id: 'fixture-comment', siteId, status: 'pending', authorName: 'Fixture', content: 'Fixture comment' }, requestId: 'fixture' });
  await commerce.notifyCommerceOrderCreated({ repositories, siteId, order: { id: 'fixture-order', orderNumber: 'FIXTURE', total: 1, currency: 'USD' }, requestId: 'fixture' });
  await commerce.notifyCommerceProductLowStock({ repositories, siteId, product: { id: 'fixture-product', slug: 'fixture', title: 'Fixture', inventory: 1, lowStockThreshold: 2 }, requestId: 'fixture' });
}
assert.equal(sent.length, 8, 'All four real notification callers must dispatch for both sites.');
for (const email of sent) assert.equal(email.from, email.siteId === 'site-a' ? 'hello@example.test' : 'support@example.test');
console.log('Site email senders: two sites/default, strict fail-closed mapping, unapproved sender/cross-site rejection, accessible Hostinger mailbox selection, private-free discovery, and four actual delivery callers passed. Synthetic fixtures only; no provider network.');
