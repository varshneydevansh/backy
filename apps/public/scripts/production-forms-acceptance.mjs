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
const directory = mkdtempSync(resolve(tmpdir(), 'backy-production-forms-'));
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

const formsPath = '/api/admin/sites/site-demo/forms';
let ownerCookie, editorCookie, formId, pendingId, contactId;
const formPath = () => `${formsPath}/${formId}`;
const publicPath = () => `/api/sites/site-demo/forms/${formId}`;
const submissionsPath = () => `${formPath()}/submissions`;
const contactsPath = () => `${formPath()}/contacts`;
const formDetail = async () => (await request(formPath(), { cookie: ownerCookie })).json.data.form;
const submissionDetail = async (id = pendingId) => (await request(`${submissionsPath()}/${id}`, { cookie: ownerCookie })).json.data.submission;
const submissions = async () => {
  const result = (await request(`${submissionsPath()}?status=all&limit=100`, { cookie: ownerCookie })).json.data.submissions;
  assert.equal(result.pagination.hasMore, false); return result.data;
};
const contacts = async () => {
  const result = (await request(`${contactsPath()}?status=all&limit=100`, { cookie: ownerCookie })).json.data;
  assert.equal(result.pagination.hasMore, false); return result.contacts;
};
const visitorValues = { name: 'Owned forms visitor', email: 'owned-forms@example.invalid', message: 'Owned private submission text', consent: true };
const visitorBody = (extra = {}) => ({ values: visitorValues, startedAt: Date.now() - 3000, ...extra });
async function patchForm(patch) { return request(formPath(), { cookie: ownerCookie, method: 'PATCH', body: patch }); }
async function noDelivery() {
  const result = (await request(`${formPath()}/delivery-attempts?limit=100`, { cookie: ownerCookie })).json.data;
  assert.equal(result.count, 0); assert.deepEqual(result.events, []);
  assert(!existsSync(resolve(directory, 'data/backy/private-form-delivery/attempts.json')));
  const path = resolve(directory, 'data/backy/interactions.json');
  if (existsSync(path)) {
    const store = JSON.parse(readFileSync(path, 'utf8'));
    assert(!(store.webhookEvents || []).some(event => event.siteId === 'site-demo' && event.formId === formId));
  }
}
async function unchanged(beforeForm, beforeSubmissions, beforeContacts) {
  assert.deepEqual(await formDetail(), beforeForm);
  assert.deepEqual(await submissions(), beforeSubmissions);
  assert.deepEqual(await contacts(), beforeContacts);
}
try {
  copyFileSync(resolve(project, 'next.config.js'), resolve(directory, 'next.config.js'));
  copyFileSync(resolve(project, 'package.json'), resolve(directory, 'package.json'));
  cpSync(build, resolve(directory, '.next'), { recursive: true, filter: path => ![resolve(build, 'dev'), resolve(build, 'cache')].includes(path) });
  symlinkSync(resolve(repository, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
  mkdirSync(dirname(snapshotPath), { recursive: true });
  // Supported policy seed only. Actual HTTP creates forms/submissions/contacts and sessions.
  writeFileSync(snapshotPath, JSON.stringify({ settings: {
    integrations: { notifications: { digestFrequency: 'off', webhookUrl: '', email: { formSubmission: false } } },
    auth: { userSiteGrants: [{ userId: 'user-editor', scope: {
      version: 1, revision: 1, mode: 'selected-sites',
      grants: [{ siteId: 'site-demo', permissions: ['sites.view', 'forms.view', 'forms.create', 'forms.edit', 'forms.manage', 'forms.delete'] }], expiresAt: null,
    } }] },
  } }), { mode: 0o600 });
  assert(!existsSync(resolve(directory, '.env')));
  await start(); ownerCookie = await login(); editorCookie = await login('jane@backy.io', editorPassword);
  await check('create inactive text form through real cookie admin admission with notifications and webhooks off', async () => {
    const result = await request(formsPath, { cookie: ownerCookie, method: 'POST', status: 201, body: {
      name: 'Owned compiled Forms acceptance', title: 'Owned compiled Forms acceptance', audience: 'public', isActive: false,
      moderationMode: 'manual', enableHoneypot: true, enableCaptcha: false, notificationEmail: null, notificationWebhook: null,
      fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'message', label: 'Message', type: 'textarea', required: true }, { key: 'consent', label: 'Consent', type: 'checkbox' }],
      contactShare: { enabled: true, nameField: 'name', emailField: 'email', notesField: 'message', dedupeByEmail: true },
      settings: { fixtureMetadata: { preserveFalse: false, preserveZero: 0, preserveNull: null, ordered: ['b', 'a'] } },
    } });
    formId = result.json.data.form.id;
    assert.equal(result.json.data.form.isActive, false); assert.equal(result.json.data.form.notificationWebhook, null);
  });
  await check('inactive definition and public intake denied without creating submissions or contacts', async () => {
    await request(publicPath(), { origin: base, status: 404 });
    await request(`${publicPath()}/definition`, { origin: base, status: 404 });
    const result = await request(`${publicPath()}/submissions`, { origin: base, method: 'POST', body: visitorBody(), status: 400 });
    assert.equal(result.json.error.code, 'FORM_INACTIVE');
    assert.deepEqual(await submissions(), []); assert.deepEqual(await contacts(), []);
  });
  await patchForm({ isActive: true });
  await check('active public definition exposes declared fields and private inventory remains protected', async () => {
    const result = await request(`${publicPath()}/definition`, { origin: base });
    assert.equal(result.json.data.form.id, formId); assert.equal(result.json.data.schemaVersion, 'backy.form-definition.v1');
    assert.deepEqual(result.json.data.form.fields.map(field => field.key), ['name', 'email', 'message', 'consent']);
    assert.equal(result.json.data.submitUrl, `${publicPath()}/submissions`);
    assert(!Object.hasOwn(result.json.data, 'submissions')); assert(!Object.hasOwn(result.json.data, 'contacts'));
    for (const path of [submissionsPath(), contactsPath(), `${publicPath()}/submissions`, `${publicPath()}/contacts`])
      await request(path, { origin: base, status: 401 });
  });
  await check('public client approval/contact hints cannot weaken manual moderation or redirect contact mapping', async () => {
    const result = await request(`${publicPath()}/submissions`, { origin: base, method: 'POST', status: 201, body: visitorBody({
      status: 'approved', moderationMode: 'auto-approve', contactShareOverride: { enabled: true, emailField: 'message' }, reviewedBy: 'forged-admin', adminNotes: 'forged-note',
    }) });
    assert.equal(result.json.data.status, 'pending'); assert.deepEqual(result.json.data.completionWarnings, []);
    pendingId = result.json.data.submission.id;
    assert.equal(result.json.data.contact, null);
    const saved = await submissionDetail(); assert.equal(saved.status, 'pending'); assert.deepEqual(saved.values, visitorValues);
    assert(!saved.reviewedBy); assert(!saved.adminNotes);
    assert.deepEqual(await contacts(), []);
    const list = await submissions(); assert.equal(list.length, 1); assert.equal(list[0].id, pendingId);
    assert(!result.response.headers.get('cache-control')?.includes('public'));
  });
  await check('anonymous detail/moderation and selected-site foreign scope denied without private data', async () => {
    for (const path of [`${submissionsPath()}/${pendingId}`, `${publicPath()}/submissions/${pendingId}`]) {
      await request(path, { origin: base, status: 401 });
      await request(path, { origin: base, method: 'PATCH', body: { status: 'approved' }, status: 401 });
    }
    for (const [suffix, method, body] of [
      ['', 'GET'], ['', 'PATCH', { isActive: false }], ['/submissions', 'GET'],
      [`/submissions/${pendingId}`, 'PATCH', { status: 'approved' }], ['/contacts', 'GET'],
    ]) {
      const path = `/api/admin/sites/site-cook/forms/${formId}${suffix}`;
      const result = await request(path, { cookie: editorCookie, method, body, status: 403 });
      assert.equal(result.json.error.code, 'FORBIDDEN_SITE_SCOPE'); assert(!result.text.includes(visitorValues.email));
    }
  });
  await check('foreign Origin valid-cookie form create/edit/delete and both moderation paths reject with exact unchanged records', async () => {
    const beforeForm = await formDetail(), beforeSubmissions = await submissions(), beforeContacts = await contacts();
    for (const [path, method, body] of [
      [formsPath, 'POST', { name: 'Denied form', title: 'Denied form', fields: beforeForm.fields }],
      [formPath(), 'PATCH', { title: 'Denied form title', isActive: false }], [formPath(), 'DELETE'],
      [`${submissionsPath()}/${pendingId}`, 'PATCH', { status: 'approved' }],
      [`${publicPath()}/submissions/${pendingId}`, 'PATCH', { status: 'approved' }],
    ]) {
      const result = await request(path, { cookie: ownerCookie, origin: 'https://foreign.fixture.invalid', method, body, status: 403 });
      assert.equal(result.json.error.code, 'ADMIN_COOKIE_ORIGIN_DENIED'); await unchanged(beforeForm, beforeSubmissions, beforeContacts);
    }
  });
  await check('trusted scoped approval persists review note and creates correctly associated contact once', async () => {
    const result = await request(`${submissionsPath()}/${pendingId}`, { cookie: editorCookie, method: 'PATCH', body: {
      status: 'approved', reviewedBy: 'Owned synthetic reviewer', adminNotes: 'Owned private review note',
    } });
    assert.equal(result.json.data.submission.status, 'approved'); assert.equal(result.json.data.submission.adminNotes, 'Owned private review note');
    const records = await contacts(); assert.equal(records.length, 1); const contact = records[0]; contactId = contact.id;
    assert.equal(contact.sourceSubmissionId, pendingId); assert.equal(contact.email, visitorValues.email); assert.equal(contact.name, visitorValues.name);
    assert.equal(contact.siteId, 'site-demo'); assert.equal(contact.formId, formId); assert.deepEqual(contact.sourceValues, visitorValues);
    const foreign = await request(`${contactsPath()}/${contactId}`, { cookie: ownerCookie, origin: 'https://foreign.fixture.invalid', method: 'PATCH', body: { status: 'archived' }, status: 403 });
    assert.equal(foreign.json.error.code, 'ADMIN_COOKIE_ORIGIN_DENIED'); assert.deepEqual(await contacts(), records);
    await request(`${contactsPath()}/${contactId}`, { cookie: editorCookie, method: 'PATCH', body: { status: 'contacted', notes: 'Owned follow-up note' } });
    assert.equal((await contacts())[0].status, 'contacted');
    await request(`${contactsPath()}/${contactId}`, { origin: base, method: 'PATCH', body: { status: 'archived' }, status: 401 });
  });
  await check('restricted adminOnly and member policies deny visitor bypass and leave intake unchanged', async () => {
    const beforeSubmissions = await submissions();
    await patchForm({ audience: 'adminOnly' });
    for (const [suffix, method, body] of [['/definition', 'GET'], ['/submissions', 'POST', visitorBody()]]) {
      const result = await request(`${publicPath()}${suffix}`, { origin: base, method, body, status: 401 });
      assert.equal(result.json.error.code, 'FORM_ADMIN_ONLY');
    }
    await request(`${publicPath()}/definition`, { cookie: ownerCookie });
    const foreign = await request(`${publicPath()}/submissions`, { cookie: ownerCookie, origin: 'https://foreign.fixture.invalid', method: 'POST', body: visitorBody(), status: 403 });
    assert.equal(foreign.json.error.code, 'FORM_ADMIN_ONLY'); assert.deepEqual(await submissions(), beforeSubmissions);
    await patchForm({ audience: 'authenticated' });
    for (const cookie of [undefined, ownerCookie]) for (const [suffix, method, body] of [['/definition', 'GET'], ['/submissions', 'POST', visitorBody({ memberId: 'forged-member', authenticated: true })]]) {
      const denied = await request(`${publicPath()}${suffix}`, { origin: base, cookie, method, body, status: 503 });
      assert.equal(denied.json.error.code, 'VISITOR_AUTH_UNAVAILABLE');
    }
    assert.deepEqual(await submissions(), beforeSubmissions);
    await patchForm({ audience: 'public' });
  });
  await check('honeypot and required text validation reject intake without a persisted submission', async () => {
    const beforeSubmissions = await submissions();
    await request(`${publicPath()}/submissions`, { origin: base, method: 'POST', body: visitorBody({ honeypot: 'robot' }), status: 422 });
    await request(`${publicPath()}/submissions`, { origin: base, method: 'POST', body: visitorBody({ values: { ...visitorValues, email: '' } }), status: 422 });
    assert.deepEqual(await submissions(), beforeSubmissions);
  });
  await check('saved form metadata, submission review and contact follow-up reopen exactly after full process restart', async () => {
    const savedForm = await formDetail(), savedSubmissions = await submissions(), savedContacts = await contacts();
    assert.deepEqual(savedForm.settings.fixtureMetadata, { preserveFalse: false, preserveZero: 0, preserveNull: null, ordered: ['b', 'a'] });
    await noDelivery(); await stop(); await start(); ownerCookie = await login(); editorCookie = await login('jane@backy.io', editorPassword);
    await unchanged(savedForm, savedSubmissions, savedContacts); await noDelivery();
    const publicDefinition = (await request(`${publicPath()}/definition`, { origin: base })).json.data;
    assert(!JSON.stringify(publicDefinition).includes('Owned private review note')); assert(!JSON.stringify(publicDefinition).includes(visitorValues.email));
    await request(`${submissionsPath()}/${pendingId}`, { origin: base, status: 401 });
  });
  await check('closing form denies definition and further intake while preserving private management and zero delivery attempts', async () => {
    const savedSubmissions = await submissions(), savedContacts = await contacts();
    await patchForm({ isActive: false });
    await request(`${publicPath()}/definition`, { origin: base, status: 404 });
    const denied = await request(`${publicPath()}/submissions`, { origin: base, method: 'POST', body: visitorBody(), status: 400 });
    assert.equal(denied.json.error.code, 'FORM_INACTIVE'); assert.deepEqual(await submissions(), savedSubmissions); assert.deepEqual(await contacts(), savedContacts);
    const closed = await formDetail(); await stop(); await start(); ownerCookie = await login();
    await unchanged(closed, savedSubmissions, savedContacts); await noDelivery();
    await request(`${publicPath()}/definition`, { origin: base, status: 404 });
  });
  assert(transport.every(event => !event.authorizationPresent));
  proof = { ok: true, buildId, checks, transport, boundary: 'Actual completed Next production HTTP handlers, supported cookie-only local auth, disposable persisted demo store, form lifecycle/moderation/contact association/exact restart and explicit foreign-Origin denial. No mocked handlers, provider requests, successful file uploads, payments, SQL concurrency, deployed runtime or browser proof. Authenticated visitor denial is configuration unavailable in demo; a real member identity/provider journey is not certified. Explicit HTTP cookie delivery does not establish browser SameSite/exploitability.' };
} finally {
  try { await stop(); assert.deepEqual(fingerprint(), before, 'Canonical snapshots must remain byte-identical.'); assert.equal(readFileSync(resolve(build, 'BUILD_ID'), 'utf8').trim(), buildId); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
assert(!existsSync(directory));
checks.push('owned process/scratch removed; canonical snapshots and completed build identity unchanged');
console.log(JSON.stringify(proof));
