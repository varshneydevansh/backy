// Real loopback TCP/TLS servers and the normal delivery API; disposable certificates only.
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EmailDeliveryMessage } from '../src/lib/formEmailDelivery';
const deliveryModule = await import('../src/lib/formEmailDelivery');
const { EmailDeliveryError, sendEmailMessage } = (deliveryModule as any).default || deliveryModule;

const message: EmailDeliveryMessage = { from: 'sender@example.test', to: 'recipient@example.test', subject: 'Synthetic SMTP transport', text: 'Private synthetic body\n.dot-stuffed', siteId: 'synthetic-site', requestId: 'synthetic-request', status: 'pending', headers: {'List-Unsubscribe':'<https://newsletter.fixture.invalid/unsubscribe?token=synthetic>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'} };
const user = 'synthetic-user', password = 'synthetic-password';
type Scenario = { implicit?: boolean; offer?: boolean; rejectUpgrade?: boolean; cert?: string; closeAt?: string; stallAt?: string; malformed?: boolean; oversized?: boolean; replyFlood?: boolean; fragmented?: boolean; anonymous?: boolean; rejectAuth?: boolean; injectedUpgradeReply?: boolean };

async function runChild(directory: string) {
  const credentials = (name: string) => ({ key: readFileSync(join(directory, name + '.key')), cert: readFileSync(join(directory, name + '.pem')) });
  let checks = 0;
  async function test(label: string, scenario: Scenario, succeeds: boolean) {
    const transcript: { line: string; encrypted: boolean }[] = [], connections = new Set<net.Socket>();
    const options = credentials(scenario.cert || 'trusted');
    function track(socket: net.Socket) { connections.add(socket); socket.on('error', () => {}); socket.once('close', () => connections.delete(socket)); }
    function protocol(socket: net.Socket, encrypted: boolean, greeting = true) {
      track(socket);
      let buffer = '', body = false;
      function reply(response: string) {
        if (scenario.fragmented) { socket.write(response.slice(0, 2)); setTimeout(() => { if (!socket.destroyed) socket.write(response.slice(2, -1)); }, 5); setTimeout(() => { if (!socket.destroyed) socket.write(response.slice(-1)); }, 10); }
        else socket.write(response);
      }
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let boundary: number;
        while ((boundary = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          transcript.push({ line, encrypted });
          if (scenario.closeAt === line.split(' ')[0]) { socket.destroy(); return; }
          if (scenario.stallAt === line.split(' ')[0]) return;
          if (body) { if (line === '.') { body = false; reply('250 Accepted synthetic fixture\r\n'); } continue; }
          if (line.startsWith('EHLO ')) {
            if (scenario.replyFlood) {
              // Well below the per-response byte cap: only the completed-reply queue limit stops this.
              reply('250-loopback fixture\r\n250 STARTTLS\r\n' + '250 Unsolicited reply\r\n'.repeat(30));
            }
            else if (scenario.oversized) reply('250-' + 'x'.repeat(65537));
            else if (scenario.malformed) reply('malformed response\r\n');
            else reply(!encrypted && scenario.offer !== false ? '250-loopback fixture\r\n250-STARTTLS\r\n250 AUTH PLAIN\r\n' : '250-loopback fixture\r\n250 AUTH PLAIN\r\n');
          } else if (line === 'STARTTLS') {
            if (scenario.rejectUpgrade) { reply('454 TLS unavailable\r\n'); continue; }
            socket.off('data', onData);
            socket.write(scenario.injectedUpgradeReply ? '220 Upgrade\r\n250 Injected plaintext reply\r\n' : '220 Upgrade\r\n', () => {
              if (!socket.destroyed) {
                const upgraded = new tls.TLSSocket(socket, { isServer: true, secureContext: tls.createSecureContext(options) });
                protocol(upgraded, true, false);
              }
            });
            return;
          } else if (line.startsWith('AUTH ')) reply(scenario.rejectAuth ? `535 Rejected ${line}\r\n` : '235 Authenticated\r\n');
          else if (line.startsWith('MAIL ') || line.startsWith('RCPT ')) reply('250 Okay\r\n');
          else if (line === 'DATA') { body = true; reply('354 Body follows\r\n'); }
          else if (line === 'QUIT') socket.end('221 Goodbye\r\n');
          else reply('500 Unexpected command\r\n');
        }
      };
      socket.on('data', onData);
      if (greeting) { if (scenario.closeAt === 'greeting') socket.destroy(); else reply('220 Synthetic loopback\r\n'); }
    }
    const server = scenario.implicit ? tls.createServer(options, socket => protocol(socket, true)) : net.createServer(socket => protocol(socket, false));
    server.on('tlsClientError', () => {});
    server.on('connection', track);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert(address && typeof address !== 'string');
    const config = { provider: 'smtp' as const, from: message.from, smtp: { host: '127.0.0.1', port: address.port, secure: Boolean(scenario.implicit), ...(scenario.anonymous ? {} : { user, password }) } };
    let outcome: unknown, failure: unknown;
    try {
      const delivery = sendEmailMessage(config, message);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { outcome = await Promise.race([delivery, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('SMTP test failed to settle within 18 seconds')), 18000); })]); }
      catch (error) { failure = error; }
      finally { clearTimeout(timer); }
      // Allow server observers to consume the final encrypted DATA/QUIT writes.
      await new Promise(resolve => setTimeout(resolve, 20));
      if (succeeds) {
        assert.equal(failure, undefined, label);
        assert.deepEqual(outcome, { statusCode: 250 });
        const hello = transcript.filter(item => item.line.startsWith('EHLO '));
        assert.deepEqual(hello.map(item => item.encrypted), scenario.implicit ? [true] : [false, true]);
        assert(transcript.some(item => item.line === 'DATA' && item.encrypted));
        assert(transcript.some(item => item.line === '..dot-stuffed' && item.encrypted));
        assert(transcript.some(item => item.line === 'List-Unsubscribe: '+message.headers!['List-Unsubscribe'] && item.encrypted));
        assert(transcript.some(item => item.line === 'List-Unsubscribe-Post: List-Unsubscribe=One-Click' && item.encrypted));
        if (!scenario.anonymous) assert(transcript.some(item => item.line === 'AUTH PLAIN ' + Buffer.from(`\0${user}\0${password}`).toString('base64') && item.encrypted));
      } else {
        assert(failure instanceof EmailDeliveryError, label + ': expected bounded delivery error');
        assert(!failure.message.includes(password));
        assert(!failure.message.includes(Buffer.from(`\0${user}\0${password}`).toString('base64')));
        assert(!failure.message.includes(message.text));
        if (scenario.replyFlood) assert.equal(failure.message, 'SMTP returned unsolicited responses.');
        if (!scenario.rejectAuth && !['DATA', '.'].includes(scenario.closeAt || '')) assert(!transcript.some(item => /^(AUTH |MAIL |RCPT |DATA$)/.test(item.line)), label + ': authentication/envelope must never follow unsafe negotiation');
      }
      assert(!transcript.some(item => !item.encrypted && (/^(AUTH |MAIL |RCPT |DATA$)/.test(item.line) || item.line.includes('Private synthetic body'))), label + ': secrets/content must never be plaintext');
      checks++;
      console.log('PASS SMTP ' + label);
    } finally {
      for (const socket of connections) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
  await test('missing STARTTLS fails before AUTH/envelope/body', { offer: false }, false);
  await test('rejected STARTTLS fails before AUTH/envelope/body', { rejectUpgrade: true }, false);
  await test('STARTTLS verified encrypted success and repeated EHLO', { fragmented: true }, true);
  await test('implicit TLS verified encrypted success', { implicit: true, fragmented: true }, true);
  await test('anonymous delivery still requires STARTTLS', { anonymous: true }, true);
  await test('anonymous downgrade denied', { anonymous: true, offer: false }, false);
  await test('untrusted STARTTLS certificate denied', { cert: 'untrusted' }, false);
  await test('untrusted implicit TLS certificate denied', { implicit: true, cert: 'untrusted' }, false);
  await test('STARTTLS certificate identity mismatch denied', { cert: 'mismatch' }, false);
  await test('implicit TLS certificate identity mismatch denied', { implicit: true, cert: 'mismatch' }, false);
  await test('greeting disconnect settles', { closeAt: 'greeting' }, false);
  await test('EHLO disconnect settles', { closeAt: 'EHLO' }, false);
  await test('DATA disconnect remains unsuccessful', { closeAt: 'DATA' }, false);
  await test('disconnect after message body remains unsuccessful', { closeAt: '.' }, false);
  await test('malformed SMTP reply denied', { malformed: true }, false);
  await test('oversized SMTP reply denied', { oversized: true }, false);
  await test('unsolicited complete reply flood denied before AUTH', { replyFlood: true }, false);
  await test('plaintext reply injection before TLS denied', { injectedUpgradeReply: true }, false);
  await test('AUTH rejection does not expose echoed credentials', { rejectAuth: true }, false);
  await test('stalled SMTP server reaches delivery deadline', { stallAt: 'EHLO' }, false);
  console.log(`SMTP transport: ${checks} real loopback transport scenarios passed; synthetic mail only, no provider certification.`);
}

if (process.argv[2] === '--child') {
  await runChild(process.argv[3]);
} else {
  const directory = mkdtempSync(join(tmpdir(), 'backy-smtp-transport-'));
  try {
    const openssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' });
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=Backy disposable fixture CA', '-keyout', join(directory, 'ca.key'), '-out', join(directory, 'ca.pem'));
    for (const name of ['trusted', 'mismatch']) {
      openssl('req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=Backy synthetic SMTP', '-keyout', join(directory, name + '.key'), '-out', join(directory, name + '.csr'));
      writeFileSync(join(directory, name + '.ext'), 'subjectAltName=' + (name === 'trusted' ? 'IP:127.0.0.1' : 'DNS:wrong.example.test') + '\nextendedKeyUsage=serverAuth\n');
      openssl('x509', '-req', '-in', join(directory, name + '.csr'), '-CA', join(directory, 'ca.pem'), '-CAkey', join(directory, 'ca.key'), '-CAcreateserial', '-days', '2', '-extfile', join(directory, name + '.ext'), '-out', join(directory, name + '.pem'));
    }
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=Untrusted synthetic SMTP', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(directory, 'untrusted.key'), '-out', join(directory, 'untrusted.pem'));
    // Node reads additional trust only at startup. Isolate it from the developer process and all production configuration.
    const env = { ...process.env, NODE_EXTRA_CA_CERTS: join(directory, 'ca.pem') };
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    const code = await new Promise<number>(resolve => {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', directory], { env, stdio: 'inherit' });
      child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1));
    });
    if (code) process.exitCode = code;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
