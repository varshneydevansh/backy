import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Full production admin source is copied before its real Vite build: route
// generation/output stay owned. Only compiled Next handlers serve backend APIs.
const admin = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(admin, '../..');
const publicProject = resolve(repository, 'apps/public');
const build = resolve(publicProject, '.next');
assert(existsSync(resolve(build, 'BUILD_ID')), 'Completed default Webpack build required.');
const buildId = readFileSync(resolve(build, 'BUILD_ID'), 'utf8');
const protectedFiles = [resolve(admin, 'src/routeTree.gen.ts'), ...['admin-content.json', 'interactions.json', 'media-library.json'].map(name => resolve(publicProject, 'data/backy', name))];
const fingerprints = () => protectedFiles.map(path => existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null);
const baseline = fingerprints();
const scratch = realpathSync(mkdtempSync(resolve(tmpdir(), 'backy-production-browser-')));
const adminCopy = resolve(scratch, 'apps/admin');
const backendCopy = resolve(scratch, 'apps/public');
const outDir = resolve(scratch, 'admin-dist');
const password = randomUUID();
const editorPassword = randomUUID();
const commentsFixture = process.env.BACKY_BROWSER_FIXTURE_COMMENTS === '1';
const formsFixture = process.env.BACKY_BROWSER_FIXTURE_FORMS === '1';
const agentFixture = process.env.BACKY_BROWSER_FIXTURE_AGENT === '1';
assert([commentsFixture, formsFixture, agentFixture].filter(Boolean).length <= 1, 'Select one workspace fixture at a time.');
let backend;
let frontend;
let stopping = false;
const delay = ms => new Promise(done => setTimeout(done, ms));
const minimalEnv = { PATH: process.env.PATH || '/usr/bin:/bin', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
function childRun(command, args, options) {
  const child = spawn(command, args, options);
  return new Promise((done, fail) => {
    child.once('error', fail);
    child.once('exit', code => code === 0 ? done() : fail(Error(`Owned admin build failed with exit ${code}.`)));
  });
}
async function freePort() {
  const server = createTcpServer();
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
async function cleanup() {
  if (stopping) return;
  stopping = true;
  try {
    if (frontend) await new Promise(done => { frontend.close(done); frontend.closeAllConnections(); });
    if (backend && backend.exitCode === null && backend.signalCode === null) {
      const exited = new Promise(done => backend.once('exit', done));
      backend.kill('SIGTERM');
      const timer = setTimeout(() => backend.kill('SIGKILL'), 5000);
      await exited; clearTimeout(timer);
    }
    assert.deepEqual(fingerprints(), baseline, 'Canonical snapshots and generated route tree must remain unchanged.');
    assert.equal(readFileSync(resolve(build, 'BUILD_ID'), 'utf8'), buildId, 'No production rebuild allowed.');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  console.log(JSON.stringify({ stopped: true, scratchRemoved: !existsSync(scratch), canonicalFilesUnchanged: true, buildUnchanged: true }));
}
try {
  mkdirSync(adminCopy, { recursive: true });
  mkdirSync(backendCopy, { recursive: true });
  cpSync(resolve(publicProject, 'src'), resolve(backendCopy, 'src'), { recursive: true });
  symlinkSync(resolve(repository, 'node_modules'), resolve(scratch, 'node_modules'), 'dir');
  symlinkSync(resolve(repository, 'packages'), resolve(scratch, 'packages'), 'dir');
  for (const name of ['src', 'public', 'index.html', 'package.json', 'vite.config.ts', 'postcss.config.js', 'tailwind.config.js', 'tsconfig.json', 'tsconfig.node.json']) {
    cpSync(resolve(admin, name), resolve(adminCopy, name), { recursive: true });
  }
  // envDir:false blocks .env loading; the env allowlist blocks private VITE keys.
  const runner = resolve(scratch, 'build-admin.mjs');
  writeFileSync(runner, `import { build } from 'vite'; await build(${JSON.stringify({ root: adminCopy, configFile: resolve(adminCopy, 'vite.config.ts'), envDir: false, logLevel: 'warn', build: { outDir, emptyOutDir: true, sourcemap: false } })});`);
  await childRun(process.execPath, [runner], {
    cwd: adminCopy, env: { ...minimalEnv, VITE_BACKY_ADMIN_API_BASE_URL: '/api/admin', VITE_BACKY_PUBLIC_API_BASE_URL: '/api' }, stdio: ['ignore', 'inherit', 'inherit'],
  });
  assert.deepEqual(fingerprints(), baseline);
  assert(readFileSync(resolve(outDir, 'index.html'), 'utf8').includes('/assets/'));
  for (const name of ['next.config.js', 'package.json']) cpSync(resolve(publicProject, name), resolve(backendCopy, name));
  // Copy completed runtime output, omitting only development/build caches.
  // Next may write runtime caches; those must stay in owned scratch too.
  cpSync(build, resolve(backendCopy, '.next'), { recursive: true, filter: path => ![resolve(build, 'dev'), resolve(build, 'cache')].includes(path) });
  symlinkSync(resolve(repository, 'node_modules'), resolve(backendCopy, 'node_modules'), 'dir');
  mkdirSync(resolve(backendCopy, 'public'), { recursive: true });
  cpSync(resolve(publicProject, 'public/backy-logo.svg'), resolve(backendCopy, 'public/backy-logo.svg'));
  mkdirSync(resolve(backendCopy, 'data/backy'), { recursive: true });
  // The ordinary demo identity is an Admin. Only this new owned acceptance
  // mode needs an Owner profile to exercise the real owner-only key issuer.
  const ownerSeedTime = new Date().toISOString();
  const agentUsers = agentFixture ? { users: [
    { id: 'user-admin', fullName: 'Owned Agent Fixture Owner', email: 'admin@backy.io', role: 'owner', status: 'active', createdAt: ownerSeedTime, updatedAt: ownerSeedTime, lastActiveAt: ownerSeedTime, invitedAt: null },
    { id: 'user-editor', fullName: 'Jane Editor', email: 'jane@backy.io', role: 'editor', status: 'active', createdAt: ownerSeedTime, updatedAt: ownerSeedTime, lastActiveAt: ownerSeedTime, invitedAt: null },
  ] } : {};
  writeFileSync(resolve(backendCopy, 'data/backy/admin-content.json'), JSON.stringify({ ...agentUsers, settings: { ...((commentsFixture || formsFixture || agentFixture) ? { integrations: { notifications: { digestFrequency: 'off', webhookUrl: '', email: { comments: false, commentModeration: false } } } } : {}), auth: { userSiteGrants: [{ userId: 'user-editor', scope: { version: 1, revision: 1, mode: 'selected-sites', grants: formsFixture
    ? [{ siteId: 'site-demo', permissions: ['sites.view', 'forms.view'] }, { siteId: 'site-cook', permissions: ['sites.view', 'forms.view', 'forms.create', 'forms.edit', 'forms.manage'] }]
    : commentsFixture
    ? [{ siteId: 'site-demo', permissions: ['sites.view', 'comments.view'] }, { siteId: 'site-cook', permissions: ['sites.view', 'comments.view', 'comments.manage'] }]
    : [{ siteId: 'site-demo', permissions: ['sites.view', 'pages.view'] }], expiresAt: null } }] } } }), { mode: 0o600 });
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const backendBase = `http://127.0.0.1:${backendPort}`;
  const frontendBase = `http://localhost:${frontendPort}`;
  const backendEnv = {
    ...minimalEnv, BACKY_DATA_MODE: 'demo', BACKY_ALLOW_PRODUCTION_DEMO_MODE: 'true', BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH: 'true',
    BACKY_ADMIN_DEMO_PASSWORD: password, BACKY_EDITOR_DEMO_PASSWORD: editorPassword, BACKY_CORS_ALLOWED_ORIGINS: frontendBase, BACKY_ADMIN_TRUSTED_ORIGINS: frontendBase,
  };
  backend = spawn(process.execPath, [resolve(repository, 'node_modules/next/dist/bin/next'), 'start', backendCopy, '-H', '127.0.0.1', '-p', String(backendPort)], { cwd: backendCopy, env: backendEnv, stdio: ['ignore', 'inherit', 'inherit'] });
  let startupError;
  backend.once('error', error => { startupError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert(!startupError && backend.exitCode === null && backend.signalCode === null, 'Owned Next server exited before readiness.');
    try { if ((await fetch(`${backendBase}/api/sites/site-demo/manifest`)).status === 200) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert(ready, 'Owned Next server readiness timeout.');
  const events = [];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
  frontend = createHttpServer((req, res) => {
    const url = new URL(req.url, frontendBase);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/') || /^\/sites\/[^/]+\/blog(?:\/|$)/.test(url.pathname) || url.pathname.startsWith('/_next/')) {
      // Transparent HTTP transport: preserve cookie and Set-Cookie, method,
      // body and auth responses; never create or substitute an admin session.
      const proxy = httpRequest(`${backendBase}${req.url}`, { method: req.method, headers: { ...req.headers, 'x-forwarded-host': req.headers.host, 'x-forwarded-proto': 'http' } }, upstream => {
        events.push({ method: req.method, path: url.pathname, status: upstream.statusCode, cookiePresent: Boolean(req.headers.cookie), authorizationPresent: Boolean(req.headers.authorization), setCookie: Boolean(upstream.headers['set-cookie']) });
        res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
      });
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Owned backend unavailable.'); });
      req.pipe(proxy); return;
    }
    let path;
    try { path = resolve(outDir, `.${decodeURIComponent(url.pathname)}`); } catch { res.writeHead(400); res.end(); return; }
    if (path !== outDir && !path.startsWith(`${outDir}${sep}`)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(path) || !statSync(path).isFile()) path = resolve(outDir, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(path));
  });
  await new Promise((done, fail) => { frontend.once('error', fail); frontend.listen(frontendPort, '127.0.0.1', done); });
  assert.equal((await fetch(`http://127.0.0.1:${frontendPort}/login`)).status, 200);
  assert((await (await fetch(`http://127.0.0.1:${frontendPort}/sites/site-demo`)).text()).includes('/assets/'));
  assert.equal((await fetch(`http://127.0.0.1:${frontendPort}/api/admin/auth/session`)).status, 401);
  let commentFixtures;
  let formFixtures;
  let agentKey;
  if (commentsFixture || formsFixture || agentFixture) {
    // Actual supported login and HTTP handlers create rows in disposable storage.
    // No synthetic session injection; notification configuration above is off.
    let ownerCookie;
    const fixtureRequest = async (path, method = 'GET', body, expected = 200) => {
      const response = await fetch(`${backendBase}${path}`, { method, headers: {
        origin: frontendBase, ...(ownerCookie ? { cookie: ownerCookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.equal(response.status, expected, `Owned workspace fixture HTTP ${method} ${path} failed.`);
      const json = await response.json();
      assert(json.success, 'Owned workspace fixture handler failed.');
      return { response, data: json.data };
    };
    const login = await fixtureRequest('/api/admin/auth/login', 'POST', { email: 'admin@backy.io', password });
    const sessionCookie = login.response.headers.getSetCookie().find(value => value.startsWith('backy_admin_session='));
    assert(sessionCookie, 'Actual owner session cookie required.');
    ownerCookie = sessionCookie.split(';', 1)[0];
    if (agentFixture) {
      assert.equal(login.data.user.id, 'user-admin');
      assert.equal(login.data.user.role, 'owner', 'Actual supported session must be Owner before key issuance.');
    }
    if (commentsFixture) {
    const post = (await fixtureRequest('/api/admin/sites/site-demo/blog', 'POST', {
      title: 'Owned scoped comments browser fixture', slug: `owned-comments-ui-${randomUUID().slice(0, 8)}`, status: 'published',
      content: { elements: [{ id: 'owned-comments-ui-body', type: 'text', x: 20, y: 20, width: 300, height: 90,
        props: { content: 'Owned comment permissions target.' } }], canvasSize: { width: 375, height: 200 } },
    }, 201)).data.post;
    const cookPost = (await fixtureRequest('/api/admin/sites/site-cook/blog', 'POST', {
      title: 'Owned Cook comments browser fixture', slug: `owned-cook-comments-ui-${randomUUID().slice(0, 8)}`, status: 'published',
      content: { elements: [{ id: 'owned-cook-comments-ui-body', type: 'text', x: 20, y: 20, width: 300, height: 90,
        props: { content: 'Owned Cook comment permissions target.' } }], canvasSize: { width: 375, height: 200 } },
    }, 201)).data.post;
    commentFixtures = [];
    for (const target of [{ siteId: 'site-demo', type: 'blog', id: post.id }, { siteId: 'site-cook', type: 'blog', id: cookPost.id }]) {
      await fixtureRequest(`/api/admin/sites/${target.siteId}`, 'PATCH', { isPublished: true, status: 'published', settings: { commentPolicy: {
        enabled: true, moderationMode: 'manual', allowGuests: true, requireName: true, requireEmail: false,
        allowReplies: true, enableReports: true, enableCaptcha: false, blockedTerms: [],
      } } });
      const result = (await fixtureRequest(`/api/sites/${target.siteId}/${target.type}/${target.id}/comments`, 'POST', {
        content: `Owned pending comment for ${target.siteId} permission proof.`, authorName: 'Owned fixture author',
        authorEmail: 'owned-comment@example.invalid', commentModerationMode: 'manual',
      }, 201)).data;
      assert.equal(result.comment.status, 'pending');
      assert.deepEqual(result.completionWarnings, []);
      const attempts = (await fixtureRequest(`/api/sites/${target.siteId}/comments/delivery-attempts?limit=100`)).data;
      assert.equal(attempts.count, 0, 'Notifications off must create no provider delivery attempts.');
      assert.deepEqual(attempts.events, []);
      commentFixtures.push({ siteId: target.siteId, targetId: target.id, commentId: result.comment.id, status: result.comment.status });
    }
    }
    if (formsFixture || agentFixture) {
      formFixtures = [];
      for (const siteId of ['site-demo', 'site-cook']) {
        const form = (await fixtureRequest(`/api/admin/sites/${siteId}/forms`, 'POST', {
          name: `owned-form-${randomUUID().slice(0, 8)}`, title: `Owned ${siteId} form`, audience: 'public', isActive: true,
          fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
          moderationMode: 'manual', enableCaptcha: false, enableHoneypot: false,
          notificationEmail: null, notificationWebhook: null,
        }, 201)).data.form;
        const submission = (await fixtureRequest(`/api/sites/${siteId}/forms/${form.id}/submissions`, 'POST', {
          values: { name: `Owned ${siteId} submission` },
        }, 201)).data;
        assert.deepEqual(submission.completionWarnings || [], []);
        const events = (await fixtureRequest(`/api/admin/sites/${siteId}/forms/${form.id}/delivery-attempts?limit=100`)).data;
        assert.equal(events.events.length, 0, 'Owned form fixture must not attempt provider delivery.');
        formFixtures.push({ siteId, formId: form.id, title: form.title, submissionId: submission.submission?.id });
      }
    }
    if (agentFixture) {
      // Issue through the supported Owner Settings handler, never by injecting a
      // grant/hash. This short-lived plaintext exists only in owned 0600 control.
      const scope = { version: 1, revision: 1, mode: 'selected-sites', siteIds: ['site-cook'], permissions: ['sites.view', 'forms.view'], expiresAt: new Date(Date.now() + 120_000).toISOString() };
      agentKey = (await fixtureRequest('/api/admin/settings', 'POST', { action: 'issue-admin-api-key', label: 'Owned external agent read acceptance', scope })).data.issuedKey;
      assert.equal(typeof agentKey?.adminApiKey, 'string', 'Actual Settings issuance must return a service key.');
      assert.deepEqual(agentKey.scope, scope, 'Actual issued service scope must match the bounded request.');
      assert(!readFileSync(resolve(backendCopy, 'data/backy/admin-content.json'), 'utf8').includes(agentKey.adminApiKey), 'Persistent settings must not contain the plaintext issued key.');
    }
    await fixtureRequest('/api/admin/auth/logout', 'POST');
  }
  const control = { agentFixture, agentKey, formFixtures, formsFixture, commentFixtures, commentsFixture, pid: process.pid, backendPid: backend.pid, frontendUrl: frontendBase, backendUrl: backendBase, email: 'admin@backy.io', password, editorEmail: 'jane@backy.io', editorPassword, buildId: buildId.trim(), outDir, runtimeCwd: backendCopy, boundary: 'Full production admin bundle, compiled Webpack backend, transparent same-origin HTTP proxy, disposable demo storage. Supported local-demo login only; no provider/deployment proof.' };
  writeFileSync(resolve(scratch, 'control.json'), JSON.stringify(control), { mode: 0o600 });
  const evidence = () => {
    writeFileSync(resolve(scratch, 'transport-evidence.json'), JSON.stringify({ buildId: buildId.trim(), events, canonicalFilesUnchanged: JSON.stringify(fingerprints()) === JSON.stringify(baseline) }), { mode: 0o600 });
  };
  const timer = setInterval(evidence, 1000);
  console.log(JSON.stringify({ ready: true, frontendUrl: frontendBase, backendUrl: backendBase, controlFile: resolve(scratch, 'control.json'), transportEvidence: resolve(scratch, 'transport-evidence.json'), ownedPid: process.pid, backendPid: backend.pid, boundary: control.boundary }));
  await new Promise(done => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, done);
    process.stdin.on('data', data => { if (data.toString().includes('stop')) done(); });
  });
  clearInterval(timer); evidence();
} finally { await cleanup(); }
