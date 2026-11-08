import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { fixture, permissions, rule, managedAuthFields, networkCalls } from './admin-access-test-fixtures.mts';
type Role = 'owner' | 'admin' | 'editor' | 'viewer';
const ownerKeys = ['settings.manageKeys', 'settings.billing', 'sites.delete'];
let passed = 0;
const failures: string[] = [];
async function check(name: string, run: () => Promise<void> | void) {
  try { await run(); passed++; } catch (error) { failures.push(name + ': ' + String(error)); }
}
for (const role of ['admin', 'editor', 'viewer'] as Role[]) for (const key of ownerKeys) await check(`matrix ${role} cannot override ${key}`, () => {
  const matrix = permissions.buildUserPermissionMatrix({ id: 'target', role, status: 'active' }, [{ userId: 'target', permissionKey: key, value: 'allow' }]);
  assert.equal(rule(matrix, key).allowed, false);
});
await check('owner default capabilities stay available; ordinary override still works', () => {
  const owner = permissions.buildUserPermissionMatrix({ id: 'owner', role: 'owner', status: 'active' });
  for (const key of ownerKeys) assert.equal(rule(owner, key).allowed, true);
  assert.equal(rule(permissions.buildUserPermissionMatrix({ id: 'target', role: 'viewer', status: 'active' }, [{ permissionKey: 'pages.edit', value: 'allow' }]), 'pages.edit').allowed, true);
  assert.equal(rule(permissions.buildUserPermissionMatrix({ id: 'owner', role: 'owner', status: 'suspended' }), 'settings.manageKeys').allowed, false);
});
for (const demo of [false, true]) {
  for (const service of [false, true]) {
    const label = `${demo ? 'demo' : 'database'} ${service ? 'API key' : 'admin session'}`;
    for (const body of [{ overrides: { 'settings.manageKeys': 'allow' } }, { overrides: { 'settings.billing': 'allow' } }, { overrides: { 'sites.delete': 'allow' } }]) await check(`${label} rejects owner-only permission assignment`, async () => {
      const f = fixture({ demo, service, targetRole: 'admin' }); const r = await f.call('permissions', 'PATCH', body);
      assert.equal(r.status, 403); assert.equal(f.effects.writes, 0); assert.equal(f.effects.audits, 0);
    });
    for (const [path, body] of [['permissions', { overrides: { 'settings.manageKeys': 'allow' } }], ['user', { role: 'owner' }]] as const) await check(`${label} rejects direct self escalation ${path}`, async () => {
      const f = fixture({ demo, service }); const r = await f.call(path, 'PATCH', body, '', 'actor');
      assert.equal(r.status, 403); assert.equal(f.effects.writes, 0); assert.equal(f.users.get('actor').role, 'admin');
    });
    for (const [path, method, body, targetStatus] of [
      ['users', 'POST', { fullName: 'New owner', email: 'new@example.test', role: 'owner', status: 'active', createInvite: false }, 'active'],
      ['user', 'PATCH', { role: 'owner' }, 'active'], ['user', 'PATCH', { fullName: 'Owner edited' }, 'active'],
      ['user', 'DELETE', undefined, 'active'], ['invite-link', 'POST', {}, 'invited'], ['password-reset', 'POST', {}, 'active'],
      ['mfa', 'PATCH', { enabled: false }, 'active'], ['permissions', 'PATCH', { overrides: { 'pages.edit': 'deny' } }, 'active'],
      ['contact-promotion', 'POST', { createInvite: true }, 'invited'],
      ['users/bulk', 'POST', { action: 'delete', userIds: ['target'] }, 'active'],
      ['users/bulk', 'POST', { action: 'updateStatus', status: 'suspended', userIds: ['target'] }, 'active'],
    ] as const) await check(`${label} denies owner management ${path}/${method}/${JSON.stringify(body)}`, async () => {
      const f = fixture({ demo, service, targetRole: 'owner', targetStatus }); const r = await f.call(path, method, body);
      assert.equal(r.status, 403); assert.equal(f.effects.writes, 0); assert.equal(f.effects.credentials, 0); assert.equal(f.effects.deliveries, 0);
    });
    for (const [csv, query, targetRole] of [
      ['fullName,email,role,status\nNew owner,new@example.test,owner,active', '', 'viewer'],
      ['fullName,email,role,status\nOwner demoted,target@example.test,viewer,active', '?mode=upsert', 'owner'],
      ['fullName,email,role,status\nOwner promoted,target@example.test,owner,active', '?mode=upsert', 'viewer'],
    ] as const) await check(`${label} CSV import reports owner row denial without account writes`, async () => {
      const f = fixture({ demo, service, targetRole }); const r = await f.call('users/import', 'POST', csv, query);
      assert.equal(r.status, 200); assert.equal(r.body.data.import.created, 0); assert.equal(r.body.data.import.updated, 0);
      assert.equal(r.body.data.import.errors[0].code, 'OWNER_SESSION_REQUIRED'); assert.equal(f.effects.writes, 0);
    });
    for (const [targetRole, snapshotRole, kind] of [['owner', 'owner', 'created'], ['viewer', 'owner', 'updated'], ['owner', 'viewer', 'updated']] as const) await check(`${label} rollback protects current and historical owner roles`, async () => {
      const snapshot = { id: 'target', role: snapshotRole, status: 'active', email: 'target@example.test', fullName: 'Original target', avatarUrl: null };
      const log = { id: 'import-log', action: 'user.import.upsert', requestId: 'import-request', metadata: { rollbackAvailable: true }, after: { createdUsers: kind === 'created' ? [snapshot] : [] }, before: { updatedUsers: kind === 'updated' ? [snapshot] : [] } };
      const f = fixture({ demo, service, targetRole, auditLogs: [log] }); const r = await f.call('users/import/rollback', 'POST', { requestId: 'import-request' });
      assert.equal(r.status, 200); assert.equal(r.body.data.rollback.deleted, 0); assert.equal(r.body.data.rollback.restored, 0); assert.match(r.body.data.rollback.skipped[0].reason, /owner/); assert.equal(f.effects.writes, 0);
    });
  }
  await check(`${demo ? 'demo' : 'database'} access helper ignores stored owner override even for own session`, async () => {
    const f = fixture({ demo, initialOverrides: [{ userId: 'actor', permissionKey: 'settings.manageKeys', value: 'allow' }] });
    const result = await f.access.requireAdminAccess(new NextRequest('http://fixture.invalid/api/admin/settings'), 'request', { permission: 'settings.manageKeys' });
    assert(result instanceof NextResponse); assert.equal(result.status, 403);
  });
  await check(`${demo ? 'demo' : 'database'} ordinary admin override saves and refreshes session matrix`, async () => {
    const f = fixture({ demo }); const r = await f.call('permissions', 'PATCH', { overrides: { 'pages.edit': 'allow' } });
    assert.equal(r.status, 200); assert.equal(rule(r.body.data.permissions, 'pages.edit').allowed, true); assert.equal(f.effects.sessionUpdates, 1); assert.equal(f.settings().auth.retainedPolicy, 'preserve'); assert(f.effects.persistence.includes(demo ? 'demo' : 'database'));
  });
  await check(`${demo ? 'demo' : 'database'} owner may manage owners but cannot delegate owner-only capability to viewer`, async () => {
    const f = fixture({ demo, actorRole: 'owner' }); const r = await f.call('permissions', 'PATCH', { overrides: { 'settings.manageKeys': 'allow' } }); assert.equal(r.status, 403); assert.equal(f.effects.writes, 0);
    const allowed = fixture({ demo, actorRole: 'owner', targetRole: 'owner' }); assert.equal((await allowed.call('permissions', 'PATCH', { overrides: { 'settings.manageKeys': 'allow' } })).status, 200);
  });
  for (const body of [{ role: 'editor' }, { fullName: 'Updated viewer' }]) await check(`${demo ? 'demo' : 'database'} ordinary admin user edit remains available`, async () => {
    const f = fixture({ demo }); assert.equal((await f.call('user', 'PATCH', body)).status, 200); assert.equal(f.effects.writes, 1);
  });
  await check(`${demo ? 'demo' : 'database'} deliberate owner creation remains available`, async () => {
    const f = fixture({ demo, actorRole: 'owner' }); assert.equal((await f.call('users', 'POST', { fullName: 'New owner', email: 'new@example.test', role: 'owner', status: 'active', createInvite: false })).status, 201);
  });
  await check(`${demo ? 'demo' : 'database'} owner promotion and owner recovery remain available`, async () => {
    const f = fixture({ demo, actorRole: 'owner' }); assert.equal((await f.call('user', 'PATCH', { role: 'owner' })).status, 200);
    assert.equal((await f.call('password-reset', 'POST', {})).status, 200); assert.equal(f.effects.credentials, 1);
  });
  await check(`${demo ? 'demo' : 'database'} ordinary contact promotion remains available`, async () => {
    const f = fixture({ demo, targetStatus: 'invited' }); assert.equal((await f.call('contact-promotion', 'POST', { createInvite: true })).status, 200); assert.equal(f.effects.credentials, 1);
  });
  await check(`${demo ? 'demo' : 'database'} owner may deliberately issue existing owner contact invite`, async () => {
    const f = fixture({ demo, actorRole: 'owner', targetRole: 'owner', targetStatus: 'invited' }); assert.equal((await f.call('contact-promotion', 'POST', { createInvite: true })).status, 200); assert.equal(f.effects.credentials, 1);
  });
  for (const issuer of [{ service: false, actorRole: 'admin' as Role }, { service: true, actorRole: 'admin' as Role }, { service: false, actorRole: 'owner' as Role }]) for (const field of managedAuthFields) await check(`${demo ? 'demo' : 'database'} ${issuer.service ? 'API key' : issuer.actorRole} settings PATCH rejects reserved ${field}`, async () => {
    const f = fixture({ demo, ...issuer }); const r = await f.call('settings', 'PATCH', { auth: { [field]: [{ userId: 'actor', permissionKey: 'settings.manageKeys', value: 'allow', tokenHash: 'forged' }] } }); assert.equal(r.status, 400); assert.equal(f.effects.writes, 0);
  });
  await check(`${demo ? 'demo' : 'database'} auth normalizer cannot inject access records and preserves policy`, () => {
    const f = fixture({ demo }); const value = f.normalizeSettingsAuth({ requireTwoFactor: true, sessionTimeoutMinutes: 90, ...Object.fromEntries(managedAuthFields.map(field => [field, ['forged']])) });
    assert.equal(value.requireTwoFactor, true); assert.equal(value.sessionTimeoutMinutes, 90);
    for (const field of managedAuthFields) assert.equal(Object.hasOwn(value, field), false);
  });
  await check(`${demo ? 'demo' : 'database'} ordinary auth PATCH preserves existing managed records`, async () => {
    const f = fixture({ demo });
    const retained = Object.fromEntries(managedAuthFields.map(field => [field, field === 'userMfaEnrollments' ? { target: { enabled: true, recoveryCodeHashes: ['retained-hash'] } } : field === 'authRateLimits' ? { principal: { count: 2, resetAt: 9999999999999 } } : [{ id: 'retained-record', userId: 'target', tokenHash: 'retained-hash', permissionKey: 'pages.edit', value: 'deny' }]]));
    Object.assign(f.settings().auth, retained);
    const r = await f.call('settings', 'PATCH', { auth: { sessionTimeoutMinutes: 90, requireTwoFactor: true, inviteOnly: true, minPasswordLength: 14, allowedEmailDomains: 'example.test' } });
    assert.equal(r.status, 200); assert.equal(f.effects.writes, 1); assert.equal(f.settings().auth.requireTwoFactor, true); assert.equal(f.settings().auth.sessionTimeoutMinutes, 90); assert.equal(f.settings().auth.retainedPolicy, 'preserve');
    for (const field of managedAuthFields) assert.deepEqual(f.settings().auth[field], retained[field]);
  });
  await check(`${demo ? 'demo' : 'database'} partial auth policy PATCH cannot implicitly turn off two factor`, async () => {
    const f = fixture({ demo }); f.settings().auth.requireTwoFactor = true;
    assert.equal((await f.call('settings', 'PATCH', { auth: { sessionTimeoutMinutes: 90 } })).status, 200);
    assert.equal(f.settings().auth.requireTwoFactor, true);
  });
}
assert.equal(networkCalls, 0);
if (failures.length) { console.error(failures.join('\n')); throw new Error(`${failures.length} of ${passed + failures.length} owner-boundary checks failed`); }
console.log(`Admin owner boundary actual-handler checks passed: ${passed}. Session/persistence/provider boundaries are fixtures; no live credentials or users were modified.`);
