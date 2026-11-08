import assert from 'node:assert/strict';
import type { AdminUserPermissionMatrix } from './adminContentApi';
import { adminPermissionRule } from './adminPermissionUi';
import { isCommentPermissionAllowedForSite as allowed } from './commentPermissions';
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

matrix.groups[0].permissions = ['comments.view', 'comments.manage', 'comments.configure', 'activity.export'].map(key => ({ key, label:key, capability:'edit', allowed:true, source:'role', override:null, reason:'Role allows this capability.' }));
matrix.siteAccess!.scope!.grants = [
  { siteId:'site-a', permissions:['comments.view'] },
  { siteId:'site-b', permissions:['comments.view','comments.manage','comments.configure','activity.export'] },
];
const check = (key: 'comments.view' | 'comments.manage' | 'comments.configure' | 'activity.export', site='site-a', input=matrix, user='scoped-editor', loading=false) => allowed(input,user,site,key,loading);
assert.equal(adminPermissionRule(matrix,'comments.manage')?.allowed,true,'Baseline unscoped lookup finds moderation on another site.');
assert.equal(check('comments.view'),true);
for (const key of ['comments.manage','comments.configure','activity.export'] as const) {
  assert.equal(check(key),false,'Foreign-site grant must not enable selected-site action.');
  assert.equal(check(key,'site-b'),true,'Actual selected-site grants remain available.');
}
assert.equal(check('comments.view','ungranted'),false);
assert.equal(check('comments.view','site-a',matrix,'other-user'),false);
assert.equal(check('comments.view','site-a',matrix,'scoped-editor',true),false,'Loading permissions never enables role fallback.');
assert.equal(allowed(null,'scoped-editor','site-a','comments.manage',false),false,'Failed lookup denies controls.');
const expired=structuredClone(matrix); expired.siteAccess!.scope!.expiresAt='2000-01-01T00:00:00Z';
assert.equal(check('comments.manage','site-b',expired),false);
const invalid=structuredClone(matrix); invalid.siteAccess={status:'invalid',scope:null};
assert.equal(check('comments.view','site-a',invalid),false);
const revoked=structuredClone(matrix); revoked.canSignIn=false;
assert.equal(check('comments.view','site-a',revoked),false);
const owner=structuredClone(matrix);owner.role='owner';
assert.equal(check('comments.manage','site-a',owner),true);
owner.groups[0].permissions.find(rule=>rule.key==='comments.manage')!.allowed=false;
assert.equal(check('comments.manage','site-a',owner),false,'Loaded deny remains authoritative even for owner.');
console.log('Comment permissions PASS: exact site/user, pending/failed/revoked matrices, expired/invalid grants, owner and explicit deny.');
