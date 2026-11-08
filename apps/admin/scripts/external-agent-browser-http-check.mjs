import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';

// Start BACKY_BROWSER_FIXTURE_AGENT=1 production-browser-fixture.mjs, then pass
// its owned control path and a proof path outside scratch. No cookies are used
// for these requests: only the actual Settings-issued selected-site key.
const [controlPath, proofPath] = process.argv.slice(2);
assert(controlPath && proofPath, 'Pass owned control path and private proof path.');
const owned = dirname(realpathSync(controlPath));
assert(owned.startsWith(`${realpathSync(tmpdir())}${sep}backy-production-browser-`), 'Owned disposable fixture required.');
assert(!resolve(proofPath).startsWith(`${owned}${sep}`), 'Proof must survive owned scratch cleanup.');
assert.equal(statSync(controlPath).mode & 0o777, 0o600, 'Control must remain private.');
const control = JSON.parse(readFileSync(controlPath, 'utf8'));
assert(control.agentFixture && !control.commentsFixture && !control.formsFixture);
assert.equal(realpathSync(control.runtimeCwd), resolve(owned, 'apps/public'));
const base = new URL(control.frontendUrl);
assert.equal(base.protocol, 'http:');
assert.equal(base.hostname, 'localhost');
assert(base.port, 'Owned local port required.');
const { adminApiKey: key, id: keyId, scope } = control.agentKey;
assert(typeof key === 'string' && key.length > 16, 'Actual issued key required.');
const expiry = Date.parse(scope.expiresAt);
assert(Number.isFinite(expiry) && expiry > Date.now() && expiry - Date.now() <= 120_000, 'Run promptly after READY; restart fixture if key expired.');
assert.deepEqual(scope, { version: 1, revision: 1, mode: 'selected-sites', siteIds: ['site-cook'], permissions: ['sites.view', 'forms.view'], expiresAt: scope.expiresAt });
const cook = control.formFixtures.find(item => item.siteId === 'site-cook');
const demo = control.formFixtures.find(item => item.siteId === 'site-demo');
assert(cook?.submissionId && demo?.submissionId);
const dataDirectory = resolve(control.runtimeCwd, 'data/backy');
const sha256 = value => createHash('sha256').update(value).digest('hex');
function snapshot() {
  const files = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      assert(!entry.isSymbolicLink(), 'Owned persistence must not escape through a symlink.');
      if (entry.isDirectory()) visit(path);
      else { assert(entry.isFile()); const bytes = readFileSync(path); files.push({ name: relative(dataDirectory, path), bytes, sha256: sha256(bytes) }); }
    }
  };
  visit(dataDirectory);
  return files;
}
const summary = files => files.map(({ name, sha256: digest }) => ({ name, sha256: digest }));
const jsonFile = (files, name) => JSON.parse(files.find(file => file.name === name).bytes);
function unchanged(before, after) {
  assert.deepEqual(summary(after), summary(before));
  before.forEach((file, index) => assert.deepEqual(after[index].bytes, file.bytes));
}
const proof = { boundary: 'Disposable full compiled admin/Next backend. Supported Owner login and actual Settings key issuance during fixture setup; checker uses only that key, no ambient cookie. Natural wall-clock expiry, no runtime/store tampering. No production/provider/account/grant changes.', buildId: control.buildId, createdAt: new Date().toISOString(), key: { id: keyId, scope }, checks: [], requests: [], deniedStoreProofs: [], passed: false };
const save = () => { writeFileSync(proofPath, JSON.stringify(proof, null, 2), { mode: 0o600 }); chmodSync(proofPath, 0o600); };
let stage = 'issuance';
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base.origin}${path}`, { method, signal: AbortSignal.timeout(10_000), headers: { 'x-backy-admin-key': key, origin: base.origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  assert(!JSON.stringify(json).includes(key), 'Reply must not echo the key.');
  proof.requests.push({ method, path, status: response.status, code: json.error?.code ?? null, cookieSent: false, keyHeaderSent: true, cacheControl: response.headers.get('cache-control') });
  return { status: response.status, json };
}
async function denied(path, method, body, code) {
  stage = `${method} ${path}`;
  const before = snapshot();
  const result = await request(path, method, body);
  assert.equal(result.status, 403);
  assert.equal(result.json.error?.code, code);
  const after = snapshot(); unchanged(before, after);
  proof.deniedStoreProofs.push({ method, path, code, before: summary(before), after: summary(after), entireOwnedPersistenceByteEqual: true });
  proof.checks.push(`${method} ${path}:403 ${code}, entire persisted directory unchanged`);
  save();
}
try {
  const initial = snapshot();
  const initialSettings = jsonFile(initial, 'admin-content.json');
  const grant = initialSettings.settings.auth.apiKeyServiceKeys.find(item => item.id === keyId);
  assert(grant && grant.createdBy === 'user-admin' && !grant.revokedAt);
  assert.equal(grant.keyHash, sha256(key));
  assert.deepEqual(grant.scope, scope);
  initial.forEach(file => assert(!file.bytes.toString().includes(key), 'Plaintext key must not be persisted.'));
  proof.checks.push('Actual Owner-issued key has exact scoped hash, expiry and actor; plaintext absent from persistence');
  stage = 'authorized reads';
  const forms = await request(`/api/admin/sites/${cook.siteId}/forms`);
  assert.equal(forms.status, 200);
  assert(forms.json.data.forms.some(form => form.id === cook.formId));
  assert(forms.json.data.forms.every(form => form.siteId === cook.siteId));
  const detail = await request(`/api/admin/sites/${cook.siteId}/forms/${cook.formId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.data.form.id, cook.formId);
  assert.equal(detail.json.data.form.siteId, cook.siteId);
  assert(detail.json.data.form.version.startsWith('form-v1:'));
  const history = await request(`/api/admin/sites/${cook.siteId}/forms/${cook.formId}/design-versions?offset=0&limit=1`);
  assert.equal(history.status, 200);
  assert.equal(history.json.data.siteId, cook.siteId);
  assert.equal(history.json.data.formId, cook.formId);
  assert.equal(history.json.data.currentVersion, detail.json.data.form.version);
  assert.equal(history.json.data.pagination.limit, 1);
  assert(Array.isArray(history.json.data.revisions));
  proof.history = { revisionCount: history.json.data.revisions.length, pagination: history.json.data.pagination, currentVersion: history.json.data.currentVersion };
  const sites = await request('/api/admin/sites?includeUnpublished=true');
  assert.equal(sites.status, 200);
  assert.deepEqual(sites.json.data.sites.map(site => site.id), [cook.siteId]);
  const afterReads = snapshot();
  const afterSettings = jsonFile(afterReads, 'admin-content.json');
  const touched = afterSettings.settings.auth.apiKeyServiceKeys.find(item => item.id === keyId);
  assert(touched.lastUsedAt && Date.parse(touched.lastUsedAt) >= Date.parse(grant.createdAt));
  // Successful authentication records its usage timestamp through the canonical
  // Settings updater, which also advances settings.updatedAt. No content writes.
  const beforeComparable = structuredClone(initialSettings), afterComparable = structuredClone(afterSettings);
  assert(Date.parse(afterSettings.settings.updatedAt) >= Date.parse(initialSettings.settings.updatedAt));
  for (const store of [beforeComparable, afterComparable]) {
    delete store.settings.auth.apiKeyServiceKeys.find(item => item.id === keyId).lastUsedAt;
    delete store.settings.updatedAt;
  }
  assert.deepEqual(afterComparable, beforeComparable);
  const otherFiles = files => files.filter(file => file.name !== 'admin-content.json');
  unchanged(otherFiles(initial), otherFiles(afterReads));
  proof.checks.push('Key-only Cook forms list/detail/history200 and site list200 scoped to Cook; only canonical key.lastUsedAt/settings.updatedAt changed');
  await denied(`/api/admin/sites/${demo.siteId}/forms/${demo.formId}`, 'GET', undefined, 'FORBIDDEN_SITE_SCOPE');
  await denied(`/api/admin/sites/${cook.siteId}/forms/${cook.formId}`, 'PATCH', { description: 'Owned external agent denied edit' }, 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  await denied(`/api/admin/sites/${cook.siteId}/forms/${cook.formId}/submissions/${cook.submissionId}`, 'PATCH', { status: 'approved', adminNotes: 'Owned external agent denied management' }, 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  await denied(`/api/admin/sites/${cook.siteId}/forms/${cook.formId}/design-versions/not-a-real-revision/restore`, 'POST', { expectedVersion: detail.json.data.form.version }, 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  await denied('/api/admin/users', 'GET', undefined, 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  await denied('/api/admin/settings', 'GET', undefined, 'FORBIDDEN_SERVICE_KEY_PERMISSION');
  stage = 'natural expiration';
  console.log(JSON.stringify({ waitingForNaturalExpiry: true, expiresAt: scope.expiresAt, proofPath, checks: proof.checks.length }));
  const beforeWait = snapshot();
  while (Date.now() <= expiry + 100) await new Promise(done => setTimeout(done, Math.min(15_000, expiry + 101 - Date.now())));
  unchanged(beforeWait, snapshot());
  await denied(`/api/admin/sites/${cook.siteId}/forms/${cook.formId}`, 'GET', undefined, 'SERVICE_KEY_SCOPE_INVALID');
  proof.checks.push('Previously admitted exact same key refused after real clock expiry without grant/runtime edits');
  proof.passed = true; proof.completedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ passed: true, checks: proof.checks.length, requests: proof.requests.length, proofPath }));
} catch (error) {
  // Assertions can contain private store diffs: retain only a bounded stage and
  // error class, never stringify request credentials or complete settings.
  proof.failure = { stage, errorClass: error.name }; save();
  console.error(JSON.stringify({ passed: false, stage, errorClass: error.name, proofPath }));
  process.exitCode = 1;
}
