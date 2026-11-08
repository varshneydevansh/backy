import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, readdirSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// Real completed production server, real HTTP handlers/login/session admission.
// The explicit demo/local-auth allowances apply only to this disposable child.
// No provider env, source handler imports, auth mocks, builds, or user-store writes.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(project, '../..');
const build = resolve(project, '.next');
assert(existsSync(resolve(build, 'BUILD_ID')), 'Run the default production build first.');
const buildId = readFileSync(resolve(build, 'BUILD_ID'), 'utf8').trim();
const snapshots = ['admin-content.json', 'interactions.json', 'media-library.json'];
const fingerprint = () => snapshots.map(name => {
  const path = resolve(project, 'data/backy', name);
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
});
const before = fingerprint();
const directory = mkdtempSync(resolve(tmpdir(), 'backy-production-media-'));
const checks = [];
const transport = [];

let child;
let serverError;
let proof;
let base;
const adminOrigin = 'https://admin.fixture.invalid';
const publicOnlyOrigin = 'http://127.0.0.1:5173';
const password = randomUUID();
const editorPassword = randomUUID();
const snapshotPath = resolve(directory, 'data/backy/admin-content.json');
const delay = ms => new Promise(done => setTimeout(done, ms));
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(done => child.once('exit', done));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await stopped;
  clearTimeout(timer);
}
async function start() {
  const listener = createServer();
  await new Promise((done, fail) => { listener.once('error', fail); listener.listen(0, '127.0.0.1', done); });
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  base = `http://127.0.0.1:${port}`;
  // Deliberately construct, rather than spread, env: .env files and credentials
  // from the canonical checkout must never reach the disposable Next process.
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    BACKY_DATA_MODE: 'demo', BACKY_ALLOW_PRODUCTION_DEMO_MODE: 'true',
    BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH: 'true',
    BACKY_ADMIN_DEMO_PASSWORD: password, BACKY_EDITOR_DEMO_PASSWORD: editorPassword, BACKY_CORS_ALLOWED_ORIGINS: base, BACKY_ADMIN_TRUSTED_ORIGINS: adminOrigin,
  };
  child = spawn(process.execPath, [resolve(repository, 'node_modules/next/dist/bin/next'), 'start', directory, '-H', '127.0.0.1', '-p', String(port)], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  child.stderr.resume();
  serverError = undefined;
  child.once('error', error => { serverError = error; });
  for (let attempt = 0; attempt < 150; attempt++) {
    assert(!serverError && child.exitCode === null && child.signalCode === null, 'Owned production server exited before becoming ready.');
    try { const response = await fetch(`${base}/api/sites/site-demo/agent-handoff`); if (response.status === 200) return; } catch {}
    await delay(100);
  }
  throw Error('Owned production server did not become ready.');
}
async function request(path, { method = 'GET', body, multipart, token, cookie, origin = adminOrigin, status = 200 } = {}) {
  assert(!(token && cookie), 'Acceptance must not combine bearer and cookie admission.');
  const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) };
  const response = await fetch(new URL(path, base), {
    method, headers, ...(multipart ? { body: multipart } : body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  transport.push({ method, path: new URL(path, base).pathname, status: response.status, cookiePresent: Boolean(headers.cookie),
    authorizationPresent: Boolean(headers.authorization), sameOrigin: origin === base });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch {}
  // Never print bodies, cookies, sessions or preview tokens, including failures.
  if (status !== null) assert.equal(response.status, status, `HTTP ${method} ${path.split('?')[0]}: expected ${status}; code ${json?.error?.code || 'non-json'}`);
  return { response, json, text };
}
async function check(name, run) { await run(); checks.push(name); }
async function login(email = 'admin@backy.io', secret = password) {
  const result = await request('/api/admin/auth/login', { method: 'POST', body: { email, password: secret } });
  assert(result.json?.success && result.json.data.session.authMode === 'local-demo');
  assert(result.response.headers.get('set-cookie')?.includes('HttpOnly'));
  assert(result.response.headers.get('set-cookie')?.includes('Secure'));
  const setCookies = result.response.headers.getSetCookie();
  const sessionCookie = setCookies.find(value => value.startsWith('backy_admin_session='));
  assert(sessionCookie && /SameSite=Lax/i.test(sessionCookie), 'Actual session cookie must retain SameSite=Lax.');
  return sessionCookie.split(';', 1)[0];
}

// A complete 1x1 PNG: real zlib pixel data and valid PNG chunk CRCs.
function png() {
  const crc = bytes => { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const type = Buffer.from(name); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([type, data]))); return Buffer.concat([size, type, data, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0,255,255,255,255]))), chunk('IEND', Buffer.alloc(0))]);
}
const image = png();
const mediaPath = '/api/admin/sites/site-demo/media';
const blogPath = '/api/admin/sites/site-demo/blog';
function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const file = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [{ path: relative(directory, file), size: readFileSync(file).length, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
const storageState = () => [...filesUnder(resolve(directory, 'public/uploads')), ...filesUnder(resolve(directory, '.private')), ...filesUnder(resolve(directory, 'data/backy/private-media-jobs'))];
const catalogState = () => { const path = resolve(directory, 'data/backy/media-library.json'); return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null; };
// These three built-in demo rows use module-start timestamps and are not mutable
// catalog records. Across restart compare every field except those seed dates.
function restartMediaState(data) {
  return { ...data, media: data.media.map(item => {
    if (!['media-demo-hero', 'media-demo-logo', 'media-contact-bg'].includes(item.id)) return item;
    const { createdAt, updatedAt, ...rest } = item; return rest;
  }) };
}
function multipart(postId) {
  const data = new FormData();
  data.set('file', new Blob([image], { type: 'image/png' }), 'owned-valid-pixel.png');
  data.set('scope', 'post'); data.set('scopeTargetId', postId); data.set('visibility', 'public');
  data.set('altText', 'Owned harmless upload refusal probe');
  return data;
}
let ownerCookie;
let editorCookie;
let postId;
let beforeMedia;
let beforeAudit;
let beforePost;
let beforeBytes;
let beforeCatalog;
let scannerFailure;
const savedPost = async () => (await request(`${blogPath}/${postId}`, { cookie: ownerCookie })).json.data.post;
const mediaState = async () => {
  const data = (await request(`${mediaPath}?limit=100`, { cookie: ownerCookie })).json.data;
  assert.equal(data.pagination.hasMore, false, 'Fixture inventory must be complete.');
  return data;
};
function assertScopedUploadReadiness(data) {
  const readiness = data.uploadReadiness;
  assert(readiness, 'Current compiled media GET must expose scoped uploadReadiness; no legacy fallback.');
  assert.deepEqual(Object.keys(readiness).sort(), ['blockingReasons', 'evidence', 'schemaVersion', 'state']);
  assert.equal(readiness.schemaVersion, 'backy.media-upload-readiness.v1');
  assert.equal(readiness.state, 'blocked'); assert.equal(readiness.evidence, 'configuration-only');
  assert.equal(readiness.blockingReasons.length, 1);
  const reason = readiness.blockingReasons[0];
  assert.deepEqual(Object.keys(reason).sort(), ['code', 'message']);
  assert.equal(reason.code, 'MEDIA_SCANNER_REQUIRED');
  assert.match(reason.message, /HTTP or ClamAV/); assert.match(reason.message, /existing media/i);
  // Exact allowlisted fields plus absence of local paths/credentials keep this
  // per-site diagnostic safe for an author without workspace Settings access.
  const serialized = JSON.stringify(readiness);
  for (const value of [directory, repository, password, editorPassword, ownerCookie, editorCookie]) {
    if (value) assert(!serialized.includes(value), 'Scoped readiness must not disclose private fixture values.');
  }
  return readiness;
}
const mediaAudit = async () => (await request('/api/admin/audit-logs?siteId=site-demo&entity=media&limit=100', { cookie: ownerCookie })).json.data;
try {
  copyFileSync(resolve(project, 'next.config.js'), resolve(directory, 'next.config.js'));
  copyFileSync(resolve(project, 'package.json'), resolve(directory, 'package.json'));
  cpSync(build, resolve(directory, '.next'), { recursive: true, filter: path => ![resolve(build, 'dev'), resolve(build, 'cache')].includes(path) });
  symlinkSync(resolve(repository, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
  mkdirSync(dirname(snapshotPath), { recursive: true });
  // Supported role/site policy only. Actual login creates the sessions.
  writeFileSync(snapshotPath, JSON.stringify({ settings: { auth: { userSiteGrants: [{ userId: 'user-editor', scope: {
    version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: 'site-demo', permissions: ['sites.view', 'pages.view', 'media.view', 'media.create'] }], expiresAt: null,
  } }] } } }), { mode: 0o600 });
  assert(!existsSync(resolve(directory, '.env')));
  await start();
  ownerCookie = await login(); editorCookie = await login('jane@backy.io', editorPassword);
  const created = await request(blogPath, { cookie: ownerCookie, method: 'POST', body: {
    title: 'Owned media acceptance draft', slug: `owned-media-${randomUUID().slice(0,8)}`, status: 'draft',
    content: { elements: [{ id: 'owned-media-body', type: 'text', x: 20, y: 20, width: 300, height: 90, props: { content: 'Upload refusal must preserve this draft.' } }], canvasSize: { width: 375, height: 200 } },
  }, status: 201 });
  postId = created.json.data.post.id;
  beforeMedia = await mediaState(); beforeAudit = await mediaAudit(); beforePost = await savedPost(); beforeBytes = storageState(); beforeCatalog = catalogState();
  assert.equal(beforeBytes.length, 0, 'Disposable storage starts without managed upload bytes.');
  await check('owner and scoped media GET expose safe configuration-only blocked readiness without workspace Settings access', async () => {
    const settings = (await request('/api/admin/settings', { cookie: ownerCookie })).json.data.settings;
    assert.equal(settings.runtimeStorage.configured, true);
    assert.equal(settings.runtimeMediaScanner.configured, false);
    assert.match(settings.runtimeMediaScanner.error, /Production media scanner provider is not configured/);
    await request('/api/admin/settings', { cookie: editorCookie, status: 403 });
    const ownerReadiness = assertScopedUploadReadiness((await request(mediaPath, { cookie: ownerCookie })).json.data);
    const scopedReadiness = assertScopedUploadReadiness((await request(mediaPath, { cookie: editorCookie })).json.data);
    assert.deepEqual(scopedReadiness, ownerReadiness);
  });
  await check('anonymous upload and scoped foreign-site upload denied before scanner/storage', async () => {
    const anonymous = await request(mediaPath, { method: 'POST', multipart: multipart(postId), status: 401 });
    assert.equal(anonymous.json.error.code, 'UNAUTHORIZED');
    const foreign = await request('/api/admin/sites/site-cook/media', { cookie: editorCookie, method: 'POST', multipart: multipart(postId), status: 403 });
    assert.equal(foreign.json.error.code, 'FORBIDDEN_SITE_SCOPE');
    assert.deepEqual(storageState(), beforeBytes); assert.equal(catalogState(), beforeCatalog);
    assert.deepEqual(await mediaState(), beforeMedia); assert.deepEqual(await mediaAudit(), beforeAudit); assert.deepEqual(await savedPost(), beforePost);
  });
  await check('actual valid PNG multipart refused by missing production scanner before any durable media effects', async () => {
    const denied = await request(mediaPath, { cookie: editorCookie, method: 'POST', multipart: multipart(postId), status: 415 });
    assert.equal(denied.json.error.code, 'MEDIA_SAFETY_SCAN_FAILED');
    assert.equal(denied.json.error.details.reason, 'production-media-scanner-required');
    assert.equal(denied.json.error.message, 'Production media scanner provider is not configured.');
    scannerFailure = { status: denied.response.status, code: denied.json.error.code, reason: denied.json.error.details.reason };
    assert.deepEqual(storageState(), beforeBytes); assert.equal(catalogState(), beforeCatalog);
    assert.deepEqual(await mediaState(), beforeMedia); assert.deepEqual(await mediaAudit(), beforeAudit); assert.deepEqual(await savedPost(), beforePost);
  });
  await stop(); await start(); ownerCookie = await login();
  await check('full server restart/reopen retains media inventory/quota/audit and draft references without uploaded bytes', async () => {
    assert.deepEqual(storageState(), beforeBytes); assert.equal(catalogState(), beforeCatalog);
    assert.deepEqual(restartMediaState(await mediaState()), restartMediaState(beforeMedia)); assert.deepEqual(await mediaAudit(), beforeAudit); assert.deepEqual(await savedPost(), beforePost);
  });
  assert(transport.every(event => !event.authorizationPresent), 'All authenticated requests are cookie-only.');
  proof = { ok: true, buildId, uploadReadinessContract: 'backy.media-upload-readiness.v1', readinessEvidence: 'configuration-only', pngBytes: image.length, scannerFailure, checks, transport,
    boundary: 'Actual completed production Next HTTP multipart/login/scanner policy, copied build, disposable demo storage; no scanner provider configured or mocked. Fail-closed/no-side-effects proof only; no successful upload, provider, deployment or browser proof.' };
} finally {
  try { await stop(); assert.deepEqual(fingerprint(), before, 'Canonical snapshots must stay byte-identical.'); assert.equal(readFileSync(resolve(build, 'BUILD_ID'), 'utf8').trim(), buildId); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
assert(!existsSync(directory));
checks.push('owned server and scratch cleaned; canonical snapshots/build identity unchanged');
console.log(JSON.stringify(proof));
