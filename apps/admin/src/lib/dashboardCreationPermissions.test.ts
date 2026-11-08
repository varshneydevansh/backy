import assert from 'node:assert/strict';
import type { AdminUserPermissionMatrix } from './adminContentApi';
import { adminPermissionRule } from './adminPermissionUi';
import { getDashboardCreationPermissions } from './dashboardCreationPermissions';

const none = { canCreateSites: false, canEditPages: false, canCreateForms: false, canEditCommerce: false };
const matrix: AdminUserPermissionMatrix = {
  userId: 'scoped-editor', role: 'editor', status: 'active', canSignIn: true,
  summary: { allowed: 4, total: 4, blockedByStatus: false },
  groups: [{ key: 'create', label: 'Create', description: '', permissions: ['sites.create', 'pages.edit', 'forms.create', 'commerce.edit'].map(key => ({
    key, label: key, capability: 'create', allowed: true, source: 'role', override: null, reason: 'Role allows this capability.',
  })) }],
  siteAccess: { status: 'selected-sites', scope: { version: 1, revision: 1, mode: 'selected-sites', expiresAt: null,
    grants: [{ siteId: 'site-a', permissions: ['sites.view', 'pages.view'] }],
  } },
};
const check = (input: AdminUserPermissionMatrix | null, siteId = 'site-a', userId = 'scoped-editor') => getDashboardCreationPermissions(input, userId, siteId);
assert.deepEqual(check(matrix), none, 'Workspace role permissions must not expose create links for a read-only site grant.');
assert.deepEqual(check(null), none, 'Create links remain unavailable while matrix loads or fails.');
assert.deepEqual(check(matrix, 'site-a', 'different-user'), none, 'A previous signed-in user matrix must not expose create links.');
const editable = structuredClone(matrix);
editable.siteAccess!.scope!.grants = [
  { siteId: 'site-a', permissions: ['pages.edit'] },
  { siteId: 'site-b', permissions: ['commerce.edit', 'forms.create'] },
];
assert.deepEqual(check(editable), { ...none, canEditPages: true }, 'A different site grant must not leak product/form creation into the selected site.');
assert.deepEqual(check(editable, 'site-b'), { ...none, canEditCommerce: true, canCreateForms: true });
assert.deepEqual(check(editable, 'ungranted-site'), none);
assert.equal(adminPermissionRule(editable, 'commerce.edit')?.allowed, true, 'Existing unscoped helper callers retain their any-granted-site behavior.');
const expired = structuredClone(editable);
expired.siteAccess!.scope!.expiresAt = '2000-01-01T00:00:00Z';
assert.deepEqual(check(expired), none);
const invalid = structuredClone(editable);
invalid.siteAccess = { status: 'invalid', scope: null };
assert.deepEqual(check(invalid), none);
const workspace = structuredClone(matrix);
workspace.siteAccess = { status: 'workspace', scope: { version: 1, revision: 1, mode: 'workspace', grants: [], expiresAt: null } };
assert.deepEqual(check(workspace), { canCreateSites: true, canEditPages: true, canCreateForms: true, canEditCommerce: true }, 'Workspace operators retain loaded allowed creation capabilities.');
workspace.groups[0].permissions.find(rule => rule.key === 'forms.create')!.allowed = false;
assert.equal(check(workspace).canCreateForms, false, 'Workspace deny overrides remain authoritative.');
const owner = structuredClone(matrix); owner.role = 'owner';
assert.deepEqual(check(owner), { canCreateSites: true, canEditPages: true, canCreateForms: true, canEditCommerce: true }, 'Owner authority remains workspace-wide.');
console.log('Dashboard current-user/current-site creation permissions PASS: read-only grants, pending/stale matrices, per-site edits, expired/invalid scopes, workspace overrides, owner authority, compatible shared callers.');
