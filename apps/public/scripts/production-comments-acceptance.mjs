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
const directory = mkdtempSync(resolve(tmpdir(), 'backy-production-comments-'));
const checks = [];
const transport = [];

let child;
let serverError;
let proof;
let base;
const adminOrigin = 'https://admin.fixture.invalid';
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
    authorizationPresent: Boolean(headers.authorization), sameOrigin: origin === base,
    originKind: origin === adminOrigin ? 'trusted-admin' : origin === base ? 'request-origin' : origin ? 'foreign-explicit' : 'absent' });
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

const blogPath = '/api/admin/sites/site-demo/blog';
const commentPath = '/api/sites/site-demo/comments';
const sitePath = '/api/admin/sites/site-demo';
const commentPolicy = {
  enabled: true, moderationMode: 'manual', allowGuests: true, requireName: true,
  requireEmail: false, allowReplies: true, enableReports: true, enableCaptcha: false, blockedTerms: [],
};
let ownerCookie;
let editorCookie;
let postId;
let rootId;
let autoId;
let replyId;
const targetCommentsPath = () => `/api/sites/site-demo/blog/${postId}/comments`;
const privateCommentList = async (cookie = ownerCookie) => {
  const data = (await request(`${commentPath}?status=all&targetType=post&targetId=${postId}&limit=100`, { cookie })).json.data;
  assert.equal(data.pagination.hasMore, false, 'Owned target inventory must be complete.');
  return data.comments;
};
const publicComments = async () => (await request(targetCommentsPath(), { origin: base })).json.data.comments;
const detail = async (id, cookie = ownerCookie) => (await request(`${commentPath}/${id}`, { cookie })).json.data.comment;
const policy = async (patch) => request(sitePath, { cookie: ownerCookie, method: 'PATCH', body: { settings: { commentPolicy: { ...commentPolicy, ...patch } } } });
const visitorBody = (content, extra = {}) => ({ content, authorName: 'Owned synthetic visitor', authorEmail: 'owned-comment-author@example.invalid', startedAt: Date.now() - 3000, ...extra });
function assertPublicProjection(comment) {
  const allowed = ['id', 'siteId', 'targetType', 'targetId', 'commentThreadId', 'authorName', 'authorWebsite', 'content', 'status', 'parentId', 'createdAt', 'updatedAt'];
  assert(Object.keys(comment).every(key => allowed.includes(key)), 'Public comment must use its field allowlist.');
  assert.equal(comment.status, 'approved');
  assert(!JSON.stringify(comment).includes('owned-comment-author@example.invalid'));
  for (const key of ['authorEmail', 'ipHash', 'requestId', 'userId', 'reviewedBy', 'rejectionReason', 'blockReason', 'reportCount', 'reports', 'spamFlags']) assert(!Object.hasOwn(comment, key), `Public projection must omit ${key}.`);
}
async function assertNoDeliveryAttempts() {
  const data = (await request(`${commentPath}/delivery-attempts?limit=100`, { cookie: ownerCookie })).json.data;
  assert.equal(data.count, 0); assert.deepEqual(data.events, []);
  assert(!existsSync(resolve(directory, 'data/backy/private-comment-delivery/attempts.json')), 'No private delivery attempt journal should have been created.');
}

try {
  copyFileSync(resolve(project, 'next.config.js'), resolve(directory, 'next.config.js'));
  copyFileSync(resolve(project, 'package.json'), resolve(directory, 'package.json'));
  cpSync(build, resolve(directory, '.next'), { recursive: true, filter: path => ![resolve(build, 'dev'), resolve(build, 'cache')].includes(path) });
  symlinkSync(resolve(repository, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
  mkdirSync(dirname(snapshotPath), { recursive: true });
  // Supported policy fixture only. Sessions and content are created via actual HTTP.
  // Explicit off prevents any comment email/webhook attempt, including local outbox.
  writeFileSync(snapshotPath, JSON.stringify({ settings: {
    integrations: { notifications: { digestFrequency: 'off', webhookUrl: '', email: { comments: false, commentModeration: false } } },
    auth: { userSiteGrants: [{ userId: 'user-editor', scope: {
      version: 1, revision: 1, mode: 'selected-sites',
      grants: [{ siteId: 'site-demo', permissions: ['sites.view', 'comments.view', 'comments.manage'] }], expiresAt: null,
    } }] },
  } }), { mode: 0o600 });
  assert(!existsSync(resolve(directory, '.env')));
  await start();
  ownerCookie = await login(); editorCookie = await login('jane@backy.io', editorPassword);
  const created = await request(blogPath, { cookie: ownerCookie, method: 'POST', status: 201, body: {
    title: 'Owned compiled comments acceptance', slug: `owned-comments-${randomUUID().slice(0, 8)}`, status: 'draft',
    content: { elements: [{ id: 'owned-comments-body', type: 'text', x: 20, y: 20, width: 300, height: 90, props: { content: 'Owned comment management target.' } }], canvasSize: { width: 375, height: 200 } },
  } });
  postId = created.json.data.post.id;
  await policy({});

  await check('draft post denies public comments GET and submission without creating a comment', async () => {
    await request(targetCommentsPath(), { origin: base, status: 404 });
    const denied = await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Denied draft submission'), status: 404 });
    assert.equal(denied.json.error.code, 'POST_NOT_FOUND');
    assert.deepEqual(await privateCommentList(), []);
  });
  await request(`${blogPath}/${postId}`, { cookie: ownerCookie, method: 'PATCH', body: { status: 'published' } });
  await check('anonymous published submission stays pending despite client auto-approve hints', async () => {
    const submitted = await request(targetCommentsPath(), { origin: base, method: 'POST', status: 201,
      body: visitorBody('Owned manual moderation root', { moderationMode: 'auto-approve', commentModerationMode: 'auto-approve', status: 'approved' }) });
    const comment = submitted.json.data.comment; rootId = comment.id;
    assert.equal(comment.status, 'pending');
    assert(!Object.hasOwn(comment, 'authorEmail')); assert.deepEqual(submitted.json.data.completionWarnings, []);
    assert.deepEqual(await publicComments(), []);
    const privateComments = await privateCommentList(editorCookie);
    assert.equal(privateComments.length, 1); assert.equal(privateComments[0].id, rootId);
    assert.equal(privateComments[0].authorEmail, 'owned-comment-author@example.invalid');
  });
  await check('management/private reads and moderation require auth and deny a foreign site scope', async () => {
    await request(commentPath, { origin: base, status: 401 });
    await request(`${targetCommentsPath()}?status=pending`, { origin: base, status: 401 });
    await request(`${commentPath}/${rootId}`, { origin: base, status: 401 });
    await request(`${commentPath}/${rootId}`, { origin: base, method: 'PATCH', body: { status: 'approved' }, status: 401 });
    await request(`${commentPath}/${rootId}`, { origin: base, method: 'DELETE', status: 401 });
    for (const [path, method, body] of [
      ['/api/sites/site-cook/comments', 'GET'],
      [`/api/sites/site-cook/comments/${rootId}`, 'PATCH', { status: 'approved' }],
      [`/api/sites/site-cook/comments/${rootId}`, 'DELETE'],
    ]) {
      const denied = await request(path, { cookie: editorCookie, method, body, status: 403 });
      assert.equal(denied.json.error.code, 'FORBIDDEN_SITE_SCOPE');
    }
    assert.equal((await detail(rootId)).status, 'pending');
  });
  await check('legacy public-prefix protected POST/PATCH/DELETE deny foreign Origin with valid cookie and preserve comments', async () => {
    const beforeComments = await privateCommentList();
    const beforeDetail = await detail(rootId);
    for (const [path, method, body] of [
      [targetCommentsPath(), 'POST', visitorBody('Foreign privileged auto approval denied', { moderationMode: 'auto-approve' })],
      [commentPath, 'PATCH', { commentIds: [rootId], status: 'approved' }],
      [`${commentPath}/${rootId}`, 'PATCH', { status: 'approved' }],
      [`${commentPath}/${rootId}`, 'DELETE'],
    ]) {
      const denied = await request(path, { cookie: editorCookie, origin: 'https://foreign.fixture.invalid', method, body, status: 403 });
      assert.equal(denied.json.error.code, 'ADMIN_COOKIE_ORIGIN_DENIED');
      assert.deepEqual(await privateCommentList(), beforeComments);
      assert.deepEqual(await detail(rootId), beforeDetail);
      assert.deepEqual(await publicComments(), []);
    }
    await assertNoDeliveryAttempts();
    // The same privileged POST with the explicitly configured admin origin is
    // admitted. Remove its owned temporary record via trusted DELETE immediately.
    const admitted = await request(targetCommentsPath(), { cookie: editorCookie, origin: adminOrigin,
      method: 'POST', status: 201, body: visitorBody('Trusted privileged approval allowed', { moderationMode: 'auto-approve' }) });
    assert.equal(admitted.json.data.comment.status, 'approved');
    assert.deepEqual(admitted.json.data.completionWarnings, []);
    const id = admitted.json.data.comment.id;
    await request(`${commentPath}/${id}`, { cookie: editorCookie, origin: adminOrigin, method: 'DELETE' });
    assert.deepEqual(await privateCommentList(), beforeComments);
    await assertNoDeliveryAttempts();
  });
  await check('scoped moderator approval is publicly visible through safe target/site/detail projections', async () => {
    const moderated = await request(`${commentPath}/${rootId}`, { cookie: editorCookie, method: 'PATCH', body: { status: 'approved' } });
    assert.equal(moderated.json.data.comment.status, 'approved'); assert.deepEqual(moderated.json.data.completionWarnings, []);
    const visible = await publicComments(); assert.equal(visible.length, 1); assert.equal(visible[0].id, rootId); assertPublicProjection(visible[0]);
    const publicDetail = (await request(`${commentPath}/${rootId}`, { origin: base })).json.data.comment; assertPublicProjection(publicDetail);
    const siteVisible = (await request(`${commentPath}?status=approved&targetType=post&targetId=${postId}`, { origin: base })).json.data.comments;
    assert.equal(siteVisible.length, 1); assertPublicProjection(siteVisible[0]);
  });
  await check('moderator return to pending hides the comment while preserving its admin record', async () => {
    await request(`${commentPath}/${rootId}`, { cookie: editorCookie, method: 'PATCH', body: { status: 'pending' } });
    assert.deepEqual(await publicComments(), []); assert.equal((await detail(rootId, editorCookie)).status, 'pending');
    await request(`${commentPath}/${rootId}`, { origin: base, status: 401 });
    await request(`${commentPath}/${rootId}`, { cookie: editorCookie, method: 'PATCH', body: { status: 'approved' } });
  });
  await check('unpublished site and archived post deny approved-comment reads and new public submissions', async () => {
    await request(sitePath, { cookie: ownerCookie, method: 'PATCH', body: { isPublished: false, status: 'draft' } });
    await request(targetCommentsPath(), { origin: base, status: 404 });
    await request(`${commentPath}/${rootId}`, { origin: base, status: 404 });
    await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Denied unpublished site'), status: 404 });
    assert.equal((await detail(rootId)).status, 'approved');
    await request(sitePath, { cookie: ownerCookie, method: 'PATCH', body: { isPublished: true, status: 'published' } });
    await request(`${blogPath}/${postId}`, { cookie: ownerCookie, method: 'PATCH', body: { status: 'archived' } });
    await request(targetCommentsPath(), { origin: base, status: 404 });
    await request(`${commentPath}/${rootId}`, { origin: base, status: 404 });
    await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Denied archived post'), status: 404 });
    assert.deepEqual((await request(`${commentPath}?status=approved&targetId=${postId}`, { origin: base })).json.data.comments, []);
    assert.equal((await privateCommentList()).length, 1);
    await request(`${blogPath}/${postId}`, { cookie: ownerCookie, method: 'PATCH', body: { status: 'published' } });
  });
  await check('closed/guest/name policy cannot be weakened by visitor hints and does not create comments', async () => {
    await policy({ enabled: false });
    await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Denied closed comments', { enabled: true }), status: 403 });
    await policy({ allowGuests: false });
    await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Denied guest override', { commentAllowGuests: true }), status: 403 });
    await policy({});
    await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Denied missing name', { authorName: '', commentRequireName: false }), status: 422 });
    assert.equal((await privateCommentList()).length, 1);
  });
  await check('site auto-approval admits a second public comment and a reply; author hints can strengthen to manual', async () => {
    await policy({ moderationMode: 'auto-approve' });
    const auto = await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Owned site auto approval'), status: 201 });
    autoId = auto.json.data.comment.id; assert.equal(auto.json.data.comment.status, 'approved');
    const reply = await request(targetCommentsPath(), { origin: base, method: 'POST', body: visitorBody('Owned reply for subtree deletion', { parentId: rootId, commentModerationMode: 'manual' }), status: 201 });
    replyId = reply.json.data.comment.id; assert.equal(reply.json.data.comment.status, 'pending');
    assert.equal(reply.json.data.comment.parentId, rootId);
    await policy({});
    await request(`${commentPath}/${autoId}`, { cookie: editorCookie, method: 'PATCH', body: { status: 'pending' } });
    assert.equal((await publicComments()).length, 1);
  });
  await check('notifications off yields zero durable email/webhook attempts and no completion warnings', assertNoDeliveryAttempts);
  const savedComments = await privateCommentList();
  assert.equal(savedComments.length, 3);
  await stop(); await start(); ownerCookie = await login(); editorCookie = await login('jane@backy.io', editorPassword);
  await check('full production server restart reopens approved/pending/reply records and public projection unchanged', async () => {
    assert.deepEqual(await privateCommentList(editorCookie), savedComments);
    const visible = await publicComments(); assert.equal(visible.length, 1); assert.equal(visible[0].id, rootId); assertPublicProjection(visible[0]);
    await assertNoDeliveryAttempts();
  });
  await check('scoped deletion removes root and pending descendant atomically, then deletes remaining owned comment', async () => {
    const deleted = await request(`${commentPath}/${rootId}`, { cookie: editorCookie, method: 'DELETE' });
    assert.equal(deleted.json.data.deletedCount, 2);
    assert.deepEqual(deleted.json.data.deleted.map(comment => comment.id).sort(), [rootId, replyId].sort());
    assert.deepEqual(deleted.json.data.completionWarnings, []);
    await request(`${commentPath}/${rootId}`, { cookie: ownerCookie, status: 404 });
    await request(`${commentPath}/${replyId}`, { cookie: ownerCookie, status: 404 });
    assert.deepEqual(await publicComments(), []);
    await request(`${commentPath}/${autoId}`, { cookie: editorCookie, method: 'DELETE' });
    assert.deepEqual(await privateCommentList(), []);
  });
  await stop(); await start(); ownerCookie = await login();
  await check('restart after deletion preserves absence with zero delivery attempts', async () => {
    assert.deepEqual(await privateCommentList(), []); assert.deepEqual(await publicComments(), []);
    await request(`${commentPath}/${rootId}`, { cookie: ownerCookie, status: 404 });
    await assertNoDeliveryAttempts();
  });
  assert(transport.every(event => !event.authorizationPresent), 'All authenticated operations are actual cookie-only admission.');
  proof = { ok: true, buildId, checks, transport,
    boundary: 'Actual completed production Next HTTP/auth/policy/moderation/projection/deletion/restart; copied build and disposable persisted demo store. Legacy public-prefix privileged cookie writes explicitly reject foreign Origin and admit configured admin Origin. HTTP cookie delivery is explicit; SameSite/browser exploitability is separate and not inferred. No mocked handlers, email/webhook/provider attempts, SQL/database concurrency, deployment or browser proof. No independent private-post state exists; unpublished-site/draft/archived visibility tested.' };
} finally {
  try { await stop(); assert.deepEqual(fingerprint(), before, 'Canonical snapshots must remain byte-identical.'); assert.equal(readFileSync(resolve(build, 'BUILD_ID'), 'utf8').trim(), buildId); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
assert(!existsSync(directory));
checks.push('owned process/scratch removed; canonical snapshots and completed build identity unchanged');
console.log(JSON.stringify(proof));
