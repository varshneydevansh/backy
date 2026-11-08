import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const directory = mkdtempSync(resolve(tmpdir(), 'backy-production-runtime-'));
const checks = [];
const transport = [];
let crossOriginWrite;
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
async function request(path, { method = 'GET', body, token, cookie, origin = adminOrigin, status = 200 } = {}) {
  assert(!(token && cookie), 'Acceptance must not combine bearer and cookie admission.');
  const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) };
  const response = await fetch(new URL(path, base), {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(15000),
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
const prefix = '/api/admin/sites/site-demo/blog';
const slug = `owned-production-${randomUUID().slice(0, 8)}`;
const content = {
  canvasSize: { width: 760, height: 460, layoutMode: 'fluid', extension: { preserve: true } },
  elements: [{ id: 'owned-production-body', type: 'text', x: 20, y: 20, width: 720, height: 120,
    props: { content: 'Owned production draft body', fontFamily: 'Georgia, serif', fontWeight: '700', fontStyle: 'italic' },
    styles: { fontFamily: 'Georgia, serif', fontWeight: '700', fontStyle: 'italic', fontSize: 24 },
    responsive: { mobile: { x: 20, width: 335 } }, frontendExtension: { preserve: true } }],
  metadata: { ownedRuntimeAcceptance: true },
};
let cookie;
let id;
try {
  copyFileSync(resolve(project, 'next.config.js'), resolve(directory, 'next.config.js'));
  copyFileSync(resolve(project, 'package.json'), resolve(directory, 'package.json'));
  // Only copied compiled output is served; runtime caches stay disposable.
  cpSync(build, resolve(directory, '.next'), { recursive: true, filter: path => ![resolve(build, 'dev'), resolve(build, 'cache')].includes(path) });
  symlinkSync(resolve(repository, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
  mkdirSync(dirname(snapshotPath), { recursive: true });
  // Only a supported operator policy fixture; actual login creates its own session.
  writeFileSync(snapshotPath, JSON.stringify({ settings: { auth: { userSiteGrants: [{ userId: 'user-editor', scope: {
    version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: 'site-demo', permissions: ['sites.view', 'pages.view'] }], expiresAt: null,
  } }] } } }), { mode: 0o600 });
  assert(!existsSync(resolve(directory, '.env')));
  await start();
  await check('handoff, manifest, OpenAPI and homepage render through completed production HTTP', async () => {
    for (const endpoint of ['agent-handoff', 'manifest', 'openapi', 'render?path=%2F']) {
      const result = await request(`/api/sites/site-demo/${endpoint}`);
      assert(result.json && (result.json.success === true || result.json.openapi));
    }
  });
  await check('unauthenticated authoring and invalid password denied by actual handlers', async () => {
    await request(prefix, { method: 'POST', body: { title: 'Denied', slug: 'denied' }, status: 401 });
    await request('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@backy.io', password: randomUUID() }, status: 401 });
  });
  await check('actual local login and cookie-only secure HttpOnly session/read plus scoped site denial', async () => {
    cookie = await login();
    assert((await request('/api/admin/auth/session', { cookie })).json.success);
    const restricted = await login('jane@backy.io', editorPassword);
    await request(prefix, { cookie: restricted });
    const denied = await request('/api/admin/sites/site-cook/blog', { cookie: restricted, status: 403 });
    assert.equal(denied.json.error.code, 'FORBIDDEN_SITE_SCOPE');
    await request(prefix, { method: 'POST', body: { title: 'Denied', slug: 'denied' }, cookie: restricted, status: 403 });
  });
  await check('cookie-only authenticated draft creation persists canvas/style/responsive extensions', async () => {
    const result = await request(prefix, { method: 'POST', cookie, status: 201, body: { title: 'Owned production acceptance', slug, status: 'draft', content } });
    id = result.json.data.post.id;
    const reopened = (await request(`${prefix}/${id}`, { cookie })).json.data.post;
    assert.deepEqual(reopened.content.elements, content.elements);
    assert.deepEqual(reopened.content.canvasSize, content.canvasSize);
    assert.equal(reopened.content.metadata.ownedRuntimeAcceptance, true);
    assert(JSON.parse(readFileSync(snapshotPath, 'utf8')).blogPosts.some(post => post.id === id));
    await request(`/api/sites/site-demo/render?path=${encodeURIComponent(`/blog/${slug}`)}`, { status: 404 });
  });
  await check('server restart and new real cookie-only login reopen the durable draft exactly', async () => {
    await stop(); await start(); cookie = await login();
    const reopened = (await request(`${prefix}/${id}`, { cookie })).json.data.post;
    assert.deepEqual(reopened.content.elements, content.elements);
    assert.deepEqual(reopened.content.canvasSize, content.canvasSize);
  });
  await check('draft preview renders through API and actual hosted HTML without public exposure', async () => {
    const result = await request(`${prefix}/${id}/preview`, { cookie, method: 'POST', body: {} });
    const preview = result.json.data;
    assert(preview.previewToken);
    const previewUrl = new URL(preview.hostedUrl);
    assert(['127.0.0.1', 'localhost'].includes(previewUrl.hostname));
    assert.equal(previewUrl.port, new URL(base).port);
    const rendered = await request(`/api/sites/site-demo/render?path=${encodeURIComponent(`/blog/${slug}`)}&previewToken=${encodeURIComponent(preview.previewToken)}`);
    assert.equal(rendered.response.headers.get('cache-control'), 'no-store');
    assert.equal(rendered.response.headers.get('x-backy-cache-scope'), 'private');
    const html = await request(preview.hostedUrl);
    assert(html.text.includes('Owned production draft body'));
    assert(html.text.includes('data-backy-element-id="owned-production-body"'));
    assert(html.text.includes('font-family:Georgia, serif') && html.text.includes('font-style:italic'));
    await request(`/api/sites/site-demo/render?path=${encodeURIComponent(`/blog/${slug}`)}`, { status: 404 });
  });
  await check('publish exposes render/archive and hosted HTML immediately', async () => {
    await request(`${prefix}/${id}/publish`, { cookie, method: 'POST', body: {} });
    const rendered = await request(`/api/sites/site-demo/render?path=${encodeURIComponent(`/blog/${slug}`)}`);
    assert(rendered.text.includes('Owned production draft body'));
    assert((await request(`/api/sites/site-demo/blog?slug=${slug}`)).text.includes(slug));
    assert((await request(`/sites/demo/blog/${slug}`)).text.includes('Owned production draft body'));
  });
  await check('authenticated update preserves design and public render/HTML freshness', async () => {
    const reopened = (await request(`${prefix}/${id}`, { cookie })).json.data.post;
    const updated = structuredClone(reopened.content);
    updated.elements[0].props.content = 'Owned production updated body';
    await request(`${prefix}/${id}`, { cookie, method: 'PATCH', body: { content: updated, expectedUpdatedAt: reopened.updatedAt } });
    const saved = (await request(`${prefix}/${id}`, { cookie })).json.data.post;
    assert.deepEqual(saved.content.canvasSize, content.canvasSize);
    assert.deepEqual(saved.content.elements[0].responsive, content.elements[0].responsive);
    assert.deepEqual(saved.content.elements[0].frontendExtension, content.elements[0].frontendExtension);
    assert((await request(`/api/sites/site-demo/render?path=${encodeURIComponent(`/blog/${slug}`)}`)).text.includes('Owned production updated body'));
    assert((await request(`/sites/demo/blog/${slug}`)).text.includes('Owned production updated body'));
  });
  await check('withdrawal hides public render/archive/hosted HTML and retains authenticated editable content', async () => {
    await request(`${prefix}/${id}`, { cookie, method: 'PATCH', body: { status: 'draft' } });
    await request(`/api/sites/site-demo/render?path=${encodeURIComponent(`/blog/${slug}`)}`, { status: 404 });
    await request(`/sites/demo/blog/${slug}`, { status: 404 });
    await request(`/api/sites/site-demo/blog?slug=${slug}`, { status: 404 });
    assert(!(await request('/api/sites/site-demo/blog')).text.includes(id));
    assert.equal((await request(`${prefix}/${id}`, { cookie })).json.data.post.content.elements[0].props.content, 'Owned production updated body');
  });
  await check('cookie-only unsafe foreign-Origin write probe measures status and persisted post mutation', async () => {
    const beforePost = (await request(`${prefix}/${id}`, { cookie })).json.data.post;
    const result = await request(`${prefix}/${id}`, { cookie, method: 'PATCH', origin: 'http://untrusted.example.invalid', status: null,
      body: { title: 'Owned cross-origin denial probe', expectedUpdatedAt: beforePost.updatedAt } });
    const afterPost = (await request(`${prefix}/${id}`, { cookie })).json.data.post;
    const postUnchanged = JSON.stringify(afterPost) === JSON.stringify(beforePost);
    crossOriginWrite = { status: result.response.status, errorCode: result.json?.error?.code || null, postUnchanged,
      deniedAndUnchanged: result.response.status === 403 && result.json?.error?.code === 'ADMIN_COOKIE_ORIGIN_DENIED' && postUnchanged };
  });
  await check('public-only CORS origin cannot read private session responses; public CORS preserved', async () => {
    const privateSession = await request('/api/admin/auth/session', { cookie, origin: publicOnlyOrigin });
    assert.equal(privateSession.response.headers.get('access-control-allow-origin'), null);
    assert.equal(privateSession.response.headers.get('access-control-allow-credentials'), null);
    const publicManifest = await request('/api/sites/site-demo/manifest', { origin: publicOnlyOrigin });
    assert.equal(publicManifest.response.headers.get('access-control-allow-origin'), publicOnlyOrigin);
    const trustedSession = await request('/api/admin/auth/session', { cookie });
    assert.equal(trustedSession.response.headers.get('access-control-allow-origin'), adminOrigin);
  });
  await check('foreign-Origin cookie logout denied without revoking the current session', async () => {
    const result = await request('/api/admin/auth/logout', { cookie, method: 'POST', body: {}, origin: 'http://untrusted.example.invalid', status: 403 });
    assert.equal(result.json?.error?.code, 'ADMIN_COOKIE_ORIGIN_DENIED');
    assert(!result.response.headers.getSetCookie().some(value => /Max-Age=0/i.test(value)));
    await request('/api/admin/auth/session', { cookie });
  });
  await check('cookie-only logout expires cookie and revokes session/read/write admission', async () => {
    const result = await request('/api/admin/auth/logout', { cookie, method: 'POST', body: {} });
    assert(result.response.headers.getSetCookie().some(value => value.startsWith('backy_admin_session=') && /Max-Age=0/i.test(value)));
    await request('/api/admin/auth/session', { cookie, status: 401 });
    await request(`${prefix}/${id}`, { cookie, status: 401 });
    await request(`${prefix}/${id}`, { cookie, method: 'PATCH', body: { title: 'Revoked cookie must not write' }, status: 401 });
  });
  assert(transport.filter(event => event.cookiePresent).length > 0);
  assert(transport.every(event => !event.authorizationPresent), 'Every authenticated acceptance request must be cookie-only.');
  proof = { ok: crossOriginWrite.deniedAndUnchanged, buildId, checks, crossOriginWrite, transport, boundary: 'Completed Webpack next start, real HTTP/session handlers, disposable demo storage and supported synthetic local login with cookie-only admission. Foreign-Origin result is measured server behavior; no browser CSRF exploit or provider-auth claim. No admin UI, database, provider, deployment, or DNS proof.' };
} finally {
  try {
    await stop();
    assert.deepEqual(fingerprint(), before, 'Canonical user snapshots must remain byte-identical.');
    assert.equal(readFileSync(resolve(build, 'BUILD_ID'), 'utf8').trim(), buildId, 'Acceptance must not rebuild production output.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
assert(!existsSync(directory), 'Disposable runtime must be cleaned.');
checks.push('owned server/storage cleaned; canonical snapshots unchanged; production build unchanged');
console.log(JSON.stringify(proof));
assert(crossOriginWrite.deniedAndUnchanged, 'Compiled cookie-only foreign-Origin write must be denied without mutating content; see sanitized probe result.');
