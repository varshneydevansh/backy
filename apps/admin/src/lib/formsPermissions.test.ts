import assert from 'node:assert/strict';
import type { AdminUserPermissionMatrix } from './adminContentApi';
import { adminPermissionRule } from './adminPermissionUi';
import { isFormsPermissionAllowedForSite as allowed, type FormsPermissionKey } from './formsPermissions';

const keys: FormsPermissionKey[] = ['forms.view', 'forms.create', 'forms.edit', 'forms.manage', 'forms.export', 'forms.delete', 'collections.view', 'activity.export'];
const matrix: AdminUserPermissionMatrix = {
  userId: 'scoped-editor', role: 'editor', status: 'active', canSignIn: true,
  summary: { allowed: keys.length, total: keys.length, blockedByStatus: false },
  groups: [{ key: 'forms', label: 'Forms', description: '', permissions: keys.map(key => ({
    key, label: key, capability: 'edit', allowed: true, source: 'role', override: null, reason: 'Role permits this capability.',
  })) }],
  siteAccess: { status: 'selected-sites', scope: {
    version: 1, revision: 1, mode: 'selected-sites', expiresAt: null,
    grants: [{ siteId: 'site-a', permissions: ['sites.view', 'forms.view'] },
      { siteId: 'site-b', permissions: ['sites.view', 'forms.view', 'forms.create', 'forms.edit', 'forms.manage', 'forms.export', 'forms.delete', 'collections.view'] }],
  } },
};
assert.equal(adminPermissionRule(matrix, 'forms.manage')?.allowed, true, 'Unscoped lookup can find a foreign-site grant.');
assert.equal(allowed(matrix, 'scoped-editor', 'site-a', 'forms.view', false), true);
for (const key of keys.filter(key => key !== 'forms.view')) {
  assert.equal(allowed(matrix, 'scoped-editor', 'site-a', key, false), false, `Read-only site A cannot use ${key}.`);
}
for (const key of keys.filter(key => key !== 'activity.export')) {
  assert.equal(allowed(matrix, 'scoped-editor', 'site-b', key, false), true, `Site B keeps its actual ${key} grant.`);
}
assert.equal(allowed(matrix, 'scoped-editor', 'site-b', 'activity.export', false), false, 'Workspace activity capability is not implicitly a site grant.');
for (const key of keys) {
  assert.equal(allowed(matrix, 'scoped-editor', 'site-b', key, true), false, 'Pending permissions never use role fallback.');
  assert.equal(allowed(null, 'scoped-editor', 'site-b', key, false), false, 'Failed lookup denies controls.');
  assert.equal(allowed(matrix, 'different-user', 'site-b', key, false), false, 'Previous-user matrix has no authority.');
  assert.equal(allowed(matrix, undefined, 'site-b', key, false), false);
  assert.equal(allowed(matrix, 'scoped-editor', 'unknown-site', key, false), false);
}
assert.equal(allowed({ ...matrix, canSignIn: false }, 'scoped-editor', 'site-b', 'forms.manage', false), false);
for (const status of ['invalid', 'expired'] as const) {
  assert.equal(allowed({ ...matrix, siteAccess: { ...matrix.siteAccess!, status } }, 'scoped-editor', 'site-b', 'forms.manage', false), false);
}
const revoked = structuredClone(matrix);
revoked.siteAccess!.status = 'revoked';
revoked.siteAccess!.scope!.grants = [];
assert.equal(allowed(revoked, 'scoped-editor', 'site-b', 'forms.manage', false), false);
const expired = structuredClone(matrix);
expired.siteAccess!.scope!.expiresAt = '2000-01-01T00:00:00Z';
assert.equal(allowed(expired, 'scoped-editor', 'site-b', 'forms.manage', false), false);
const denied = structuredClone(matrix);
denied.groups[0].permissions.find(rule => rule.key === 'forms.manage')!.allowed = false;
assert.equal(allowed(denied, 'scoped-editor', 'site-b', 'forms.manage', false), false, 'Site grant does not override an explicit capability denial.');
const owner = { ...matrix, role: 'owner' as const };
assert.equal(allowed(owner, 'scoped-editor', 'any-site', 'forms.manage', false), true, 'Loaded owner authority retains workspace access.');
assert.equal(allowed(owner, 'scoped-editor', 'any-site', 'forms.manage', true), false);
console.log('Forms current-user/site permissions: PASS.');
