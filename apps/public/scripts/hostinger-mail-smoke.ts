import assert from 'node:assert/strict';
import {
  getHostingerMailConfig,
  getHostingerMailConfigurationSummary,
  getHostingerMailMessage,
  HostingerMailError,
  listHostingerMailFolders,
  listHostingerMailMessages,
  probeHostingerMailConnection,
  sendHostingerMailMessage,
} from '../src/lib/hostingerMail';
import { EmailDeliveryError, isExternalEmailDeliveryConfigured, sendEmailMessage } from '../src/lib/formEmailDelivery';

const config = { apiToken: 'mock-token-never-live', from: 'Example <hello@example.test>', mailboxId: 'mailbox/fixture' };
const message = { from: config.from, to: 'reader@example.test', subject: 'Fixture notification', text: 'Private fixture content' };
const account = { data: { orderResourceId: 'order-fixture', mailboxes: [{ resourceId: config.mailboxId, address: 'hello@example.test' }] } };
const pagination = { page: 1, perPage: 20, total: 1, totalPages: 1 };
const inboxMessage = { uid: 8, path: 'INBOX', date: '2026-10-03T00:00:00Z', flags: [], unseen: true, size: 30, subject: 'Fixture', from: { name: 'Reader', address: message.to }, to: [{ name: '', address: 'hello@example.test' }], html: '<script>untrusted</script>', token: config.apiToken };
type Call = { url: string; init?: RequestInit };
const fixture = (...responses: Response[]) => {
  const calls: Call[] = [];
  const fetchMail: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    assert(response, 'Unexpected request; test cannot call the live network.');
    return response;
  };
  return { calls, fetchMail };
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const fails = async (run: () => Promise<unknown>, reason: string) => {
  await assert.rejects(run, (error: unknown) => error instanceof HostingerMailError && error.reason === reason);
};

async function main() {
  let checks = 0;
  const resolvedConfig = getHostingerMailConfig({ BACKY_HOSTINGER_MAIL_API_TOKEN: config.apiToken, BACKY_HOSTINGER_MAIL_FROM: config.from });
  assert.deepEqual(resolvedConfig, { apiToken: config.apiToken, from: config.from, mailboxId: undefined });
  const summary = getHostingerMailConfigurationSummary(resolvedConfig);
  assert(summary.configured && !summary.authenticationVerified && !summary.outboundDeliveryVerified && !summary.inboxIntegrated);
  assert(!JSON.stringify(summary).includes(config.apiToken));
  checks++;

  const missing = fixture();
  assert.equal((await probeHostingerMailConnection({ apiToken: '', from: '' }, missing.fetchMail)).status, 'not-configured');
  assert.equal(missing.calls.length, 0);
  assert.equal(isExternalEmailDeliveryConfigured({ provider: 'hostinger', from: '' }), false);
  assert.equal(isExternalEmailDeliveryConfigured({ provider: 'hostinger', from: config.from, hostinger: config }), true);
  checks++;

  const probe = fixture(json({ data: { ...account.data, mailboxes: [{ ...account.data.mailboxes[0], token: config.apiToken }] } }));
  const probeResult = await probeHostingerMailConnection(config, probe.fetchMail);
  assert.equal(probeResult.status, 'connected');
  assert.equal(probeResult.authenticationVerified, true);
  assert.equal(probeResult.outboundDeliveryVerified, false);
  assert(!JSON.stringify(probeResult).includes(config.apiToken));
  assert.deepEqual(probe.calls.map((call) => [call.url, call.init?.method]), [['https://api.mail.hostinger.com/api/v1/me', 'GET']]);
  checks++;

  const send = fixture(json(account), new Response(null, { status: 204 }));
  assert.deepEqual(await sendHostingerMailMessage(config, message, send.fetchMail), { statusCode: 204, metadata: { providerAccepted: true, deliveryVerified: false } });
  assert.equal(send.calls[1].url, 'https://api.mail.hostinger.com/api/v1/mailboxes/mailbox%2Ffixture/send');
  assert.deepEqual(JSON.parse(send.calls[1].init?.body as string), { to: [message.to], displayName: 'Example', subject: message.subject, text: message.text });
  assert(!JSON.stringify(JSON.parse(send.calls[1].init?.body as string)).includes(config.apiToken));
  for (const call of send.calls) {
    assert.equal(new Headers(call.init?.headers).get('Authorization'), `Bearer ${config.apiToken}`);
    assert.equal(call.init?.redirect, 'error');
    assert.equal(call.init?.cache, 'no-store');
    assert(call.init?.signal);
  }
  checks++;

  const discover = fixture(json(account), new Response(null, { status: 204 }));
  await sendHostingerMailMessage({ ...config, mailboxId: undefined }, message, discover.fetchMail);
  assert.equal(discover.calls.length, 2);
  checks++;

  for (const status of [401, 403, 429, 422, 500]) {
    const fail = fixture(json({ error: `${config.apiToken} ${message.text}` }, status));
    const result = await probeHostingerMailConnection(config, fail.fetchMail);
    assert.equal(result.status, 'failed');
    assert(!JSON.stringify(result).includes(config.apiToken));
    assert(!JSON.stringify(result).includes(message.text));
    assert.equal(fail.calls.length, 1);
    checks++;
  }

  const wrongMailbox = fixture(json(account));
  await fails(() => sendHostingerMailMessage({ ...config, mailboxId: 'inaccessible' }, message, wrongMailbox.fetchMail), 'mailbox-unavailable');
  assert.equal(wrongMailbox.calls.length, 1);
  const wrongSender = fixture(json(account));
  await fails(() => sendHostingerMailMessage({ ...config, from: 'other@example.test' }, { ...message, from: 'other@example.test' }, wrongSender.fetchMail), 'sender-mismatch');
  assert.equal(wrongSender.calls.length, 1);
  checks++;

  for (const input of [{ ...message, from: 'other@example.test' }, { ...message, to: 'a@example.test,b@example.test' }, { ...message, subject: 'Injected\r\nBCC: x@example.test' }]) {
    const invalid = fixture();
    await assert.rejects(() => sendHostingerMailMessage(config, input, invalid.fetchMail), HostingerMailError);
    assert.equal(invalid.calls.length, 0);
  }
  checks++;

  const malformed = fixture(json({ data: { mailboxes: [{ resourceId: '..', address: 'hello@example.test' }] } }));
  await fails(() => sendHostingerMailMessage(config, message, malformed.fetchMail), 'invalid-response');
  const uncertain = fixture(json(account), json({ accepted: true }, 202));
  await fails(() => sendHostingerMailMessage(config, message, uncertain.fetchMail), 'invalid-response');
  const network: typeof fetch = async () => { throw new Error(config.apiToken); };
  assert(!JSON.stringify(await probeHostingerMailConnection(config, network)).includes(config.apiToken));
  checks++;

  const folders = fixture(json(account), json({ data: [{ path: 'INBOX', name: 'INBOX', delimiter: '.', specialUse: null, messageCount: 1, unreadCount: 1 }], pagination }));
  assert.equal((await listHostingerMailFolders(config, {}, folders.fetchMail)).data[0].path, 'INBOX');
  assert(folders.calls.every((call) => call.init?.method === 'GET'));
  checks++;

  const messages = fixture(json(account), json({ data: [inboxMessage], pagination }));
  const list = await listHostingerMailMessages(config, { folder: 'INBOX/Archive?x=1' }, messages.fetchMail);
  assert.equal(list.data[0].uid, 8);
  assert(!JSON.stringify(list).includes('<script>'));
  assert(!JSON.stringify(list).includes(config.apiToken));
  assert(messages.calls[1].url.includes('/folders/INBOX%2FArchive%3Fx%3D1/messages?page=1&perPage=20'));
  const detail = fixture(json(account), json({ data: inboxMessage }));
  assert.equal((await getHostingerMailMessage(config, { folder: 'INBOX', uid: 8 }, detail.fetchMail)).data.uid, 8);
  const invalidPage = fixture();
  await fails(() => listHostingerMailMessages(config, { folder: 'INBOX', perPage: 101 }, invalidPage.fetchMail), 'invalid-request');
  await fails(() => getHostingerMailMessage(config, { folder: '..', uid: 8 }, invalidPage.fetchMail), 'invalid-request');
  assert.equal(invalidPage.calls.length, 0);
  const malformedList = fixture(json(account), json({ data: [{}], pagination }));
  await fails(() => listHostingerMailMessages(config, { folder: 'INBOX' }, malformedList.fetchMail), 'invalid-response');
  checks++;

  const originalFetch = globalThis.fetch;
  try {
    const delivery = fixture(json(account), new Response(null, { status: 204 }));
    globalThis.fetch = delivery.fetchMail;
    const result = await sendEmailMessage({ provider: 'hostinger', from: config.from, hostinger: config }, { ...message, siteId: 'site-fixture', requestId: 'fixture', status: 'pending' });
    assert.equal(result.statusCode, 204);
    const deliveryFailure = fixture(json({ error: config.apiToken }, 403));
    globalThis.fetch = deliveryFailure.fetchMail;
    await assert.rejects(() => sendEmailMessage({ provider: 'hostinger', from: config.from, hostinger: config }, { ...message, siteId: 'site-fixture', requestId: 'fixture', status: 'pending' }), (error: unknown) => error instanceof EmailDeliveryError && error.metadata?.reason === 'scope-denied' && !error.message.includes(config.apiToken));
    assert.deepEqual(await sendEmailMessage({ provider: 'local-outbox', from: config.from }, { ...message, siteId: 'site-fixture', requestId: 'fixture', status: 'pending' }), { statusCode: 202, metadata: { outboxOnly: true } });
    checks++;
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`Hostinger Mail: ${checks} mocked behavior checks passed; no live provider calls or email sends.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
