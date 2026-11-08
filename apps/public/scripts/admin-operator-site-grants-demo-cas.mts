import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Imports the actual demo store only after cwd moves into our own empty directory.
// No canonical/user demo snapshot is read, modified, or copied.
const originalCwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-operator-grants-demo-'));
process.chdir(directory);
let checks = 0;
try {
  const module = await import('../src/lib/backyStore.ts');
  const store = module.default || module;
  const record = (userId: string, revision: number) => ({ userId, scope: { version: 1, revision, mode: 'selected-sites', grants: [{ siteId: 'site-demo', permissions: ['sites.view'] }], expiresAt: null }, updatedAt: new Date().toISOString(), updatedById: 'fixture-owner' });
  store.updateAdminSettings({ auth: { retainedPolicy: 'keep', apiKeyServiceKeys: [{ id: 'synthetic-service', keyHash: 'synthetic-only-hash' }], adminSessions: [{ tokenHash: 'synthetic-only-hash' }] } });
  const initial = store.getAdminSettings();
  const first = record('operator-a', 1), second = record('operator-b', 1);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => store.commitAdminOperatorSiteGrant({ userId: 'operator-a', expectedRecords: [], record: first })),
    Promise.resolve().then(() => store.commitAdminOperatorSiteGrant({ userId: 'operator-a', expectedRecords: [], record: { ...first, scope: { ...first.scope, grants: [] } } })),
  ]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.equal((results[1] as PromiseRejectedResult).reason.code, 'OPERATOR_SITE_SCOPE_CONFLICT'); checks += 3;
  store.commitAdminOperatorSiteGrant({ userId: 'operator-b', expectedRecords: [], record: second });
  const stale = store.getAdminSettings();
  store.updateAdminSettings({ auth: { retainedPolicy: 'newer' } });
  const advanced = store.commitAdminOperatorSiteGrant({ userId: 'operator-a', expectedRecords: [first], record: record('operator-a', 2) });
  assert.equal(advanced.auth.retainedPolicy, 'newer'); assert.deepEqual(advanced.auth.apiKeyServiceKeys, initial.auth.apiKeyServiceKeys);
  assert.deepEqual(advanced.auth.adminSessions, initial.auth.adminSessions); assert.equal(advanced.auth.userSiteGrants.length, 2); checks += 4;
  store.updateAdminSettings({ auth: stale.auth });
  assert.equal(store.getAdminSettings().auth.userSiteGrants.find((item: any) => item.userId === 'operator-a').scope.revision, 2); checks++;
  const beforeConflict = JSON.stringify(store.getAdminSettings().auth);
  assert.throws(() => store.commitAdminOperatorSiteGrant({ userId: 'operator-a', expectedRecords: [first], record: record('operator-a', 3) }), (error: any) => error.code === 'OPERATOR_SITE_SCOPE_CONFLICT');
  assert.equal(JSON.stringify(store.getAdminSettings().auth), beforeConflict); checks++;
  const persisted = JSON.parse(readFileSync(join(directory, 'data/backy/admin-content.json'), 'utf8'));
  assert.equal(persisted.settings.auth.userSiteGrants.find((item: any) => item.userId === 'operator-a').scope.revision, 2); checks++;
  advanced.auth.userSiteGrants.length = 0;
  assert.equal(store.getAdminSettings().auth.userSiteGrants.length, 2); checks++;
  console.log(`Actual demo operator grant CAS: ${checks} checks passed; owned scratch snapshot, same-process boundary only.`);
} finally { process.chdir(originalCwd); rmSync(directory, { recursive: true, force: true }); }
