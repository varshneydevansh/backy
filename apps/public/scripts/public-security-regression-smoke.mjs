#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname, '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function assertExcludes(source, needle, label) {
  assert(!source.includes(needle), `${label} unexpectedly includes ${needle}`);
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

const sdkClientSource = read('packages/sdk-js/src/index.ts');
assertIncludes(sdkClientSource, 'export const BACKY_MAX_LIST_LIMIT = 100', 'JS SDK must expose the public list limit cap');
assertIncludes(sdkClientSource, 'function normalizeListLimit', 'JS SDK must normalize public list limits');
assertIncludes(sdkClientSource, 'function normalizeListQuery', 'JS SDK must normalize public list query objects');
assert(
  occurrenceCount(sdkClientSource, 'normalizeListQuery(queryOptions') >= 15,
  'JS SDK public list methods must clamp limit/offset query options before requests',
);
assertIncludes(
  sdkClientSource,
  'query: { limit: normalizeListLimit(options.limit) }',
  'JS SDK RSS fetch helper must clamp limit before request',
);

function functionSource(source, functionName, label) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert(start !== -1, `${label} missing ${functionName} handler`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

const protectedRoutes = [
  {
    file: 'apps/public/src/app/api/sites/[siteId]/comments/route.ts',
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/comments/[commentId]/route.ts',
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/comments/blocklist/route.ts',
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/[commentId]/route.ts',
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/[commentId]/route.ts',
    gates: ["permission: 'comments.view'", "permission: 'comments.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts',
    gates: ["permission: 'forms.view'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts',
    gates: ["permission: 'forms.view'", "permission: 'forms.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/route.ts',
    gates: ["permission: 'forms.view'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts',
    gates: ["permission: 'forms.view'", "permission: 'forms.manage'"],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/events/route.ts',
    gates: ["permission: permissionForKind(kind)", "'forms.view'", "'comments.view'", "'commerce.view'", "'activity.export'"],
  },
  {
    file: 'apps/public/src/app/api/admin/teams/route.ts',
    gates: ["permission: 'users.view'", "permission: 'users.manage'"],
  },
  {
    file: 'apps/public/src/app/api/admin/teams/[teamId]/route.ts',
    gates: ["permission: 'users.view'", "permission: 'users.manage'"],
  },
  {
    file: 'apps/public/src/app/api/admin/teams/[teamId]/members/route.ts',
    gates: ["permission: 'users.view'", "permission: 'users.manage'"],
  },
  {
    file: 'apps/public/src/app/api/admin/teams/[teamId]/members/[memberId]/route.ts',
    gates: ["permission: 'users.manage'"],
  },
];

for (const route of protectedRoutes) {
  const source = read(route.file);
  assertIncludes(source, "from '@/lib/adminAccess'", route.file);
  assertIncludes(source, 'requireAdminAccess(', route.file);
  for (const gate of route.gates) {
    assertIncludes(source, gate, route.file);
  }
}

const publicIntakeRoutes = [
  {
    file: 'apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts',
    required: ['validateAndClassifyFormSubmission(', 'captchaErrorResponseIfNeeded(', 'form.isActive'],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts',
    required: ['resolveCommentSubmissionPolicy(', 'validateAndClassifyComment(', 'honeypot'],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts',
    required: ['resolveCommentSubmissionPolicy(', 'validateAndClassifyComment(', 'honeypot'],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts',
    required: ['enableReports', 'reportRepositoryComment(', 'reportComment('],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts',
    required: ['collection.permissions.publicCreate', "status: 'draft'", 'validateCollectionRecordValues(', 'applyVisitorCreateFieldPolicy('],
  },
  {
    file: 'apps/public/src/app/api/sites/[siteId]/commerce/orders/route.ts',
    required: ['ORDER_QUEUE_NOT_PRIVATE', 'hasPublicOrderCollectionAccess(ordersCollection.permissions)', 'collections.createRecord(', 'collections.updateRecord('],
  },
];

for (const route of publicIntakeRoutes) {
  const source = read(route.file);
  for (const needle of route.required) {
    assertIncludes(source, needle, route.file);
  }
}

const adminSitesRoute = read('apps/public/src/app/api/admin/sites/route.ts');
for (const needle of [
  'resolveSiteCreateTeamId',
  'BACKY_DEFAULT_TEAM_ID',
  'BACKY_TEAM_ID',
  'existingSites.pagination.hasMore',
  "'TEAM_REQUIRED'",
]) {
  assertIncludes(adminSitesRoute, needle, 'admin sites route must infer or clearly require a database team id');
}
assertExcludes(adminSitesRoute, "'Team ID is required in database mode'", 'admin sites route must not hard-fail when UI omits teamId');

const adminTeamsRoute = read('apps/public/src/app/api/admin/teams/route.ts');
assertIncludes(adminTeamsRoute, 'repositories.teams.list', 'admin teams route must list database-backed teams');
assertIncludes(adminTeamsRoute, 'repositories.teams.create', 'admin teams route must create database-backed teams');
assertIncludes(adminTeamsRoute, 'repositories.teams.addMember', 'admin teams route must add the owner membership on create');
const adminTeamRoute = read('apps/public/src/app/api/admin/teams/[teamId]/route.ts');
assertIncludes(adminTeamRoute, 'repositories.teams.update', 'admin team detail route must update database-backed teams');
assertIncludes(adminTeamRoute, 'repositories.teams.delete', 'admin team detail route must delete database-backed teams');
assertIncludes(adminTeamRoute, 'TEAM_HAS_SITES', 'admin team delete must block teams that still own sites');
const adminTeamMembersRoute = read('apps/public/src/app/api/admin/teams/[teamId]/members/route.ts');
assertIncludes(adminTeamMembersRoute, 'repositories.teams.addMember', 'admin team members route must add database-backed team members');
assertIncludes(adminTeamMembersRoute, 'repositories.users.create', 'admin team member invite must create invited users when needed');
const adminTeamMemberRoute = read('apps/public/src/app/api/admin/teams/[teamId]/members/[memberId]/route.ts');
assertIncludes(adminTeamMemberRoute, 'repositories.teams.updateMember', 'admin team member route must update roles');
assertIncludes(adminTeamMemberRoute, 'repositories.teams.removeMember', 'admin team member route must remove members');

const commerceCollectionAdminRoutes = [
  {
    file: 'apps/public/src/app/api/admin/sites/[siteId]/collections/route.ts',
    handlers: [
      { name: 'POST', collectionPermission: "'collections.edit'", commerceOperations: ["'configure'"] },
    ],
  },
  {
    file: 'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/route.ts',
    handlers: [
      { name: 'GET', collectionPermission: "'collections.view'", commerceOperations: ["'view'"] },
      { name: 'PATCH', collectionPermission: "'collections.edit'", commerceOperations: ["'configure'"] },
      { name: 'DELETE', collectionPermission: "'collections.delete'", commerceOperations: ["'delete'"] },
    ],
  },
  {
    file: 'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts',
    handlers: [
      { name: 'GET', collectionPermission: "'collections.view'", commerceOperations: ["'view'"] },
      { name: 'POST', collectionPermission: "'collections.edit'", commerceOperations: ["'edit'"] },
    ],
  },
  {
    file: 'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts',
    handlers: [
      { name: 'GET', collectionPermission: "'collections.view'", commerceOperations: ["'view'"] },
      { name: 'PATCH', collectionPermission: "'collections.edit'", commerceOperations: ["'edit'"] },
      { name: 'DELETE', collectionPermission: "'collections.delete'", commerceOperations: ["'delete'"] },
    ],
  },
  {
    file: 'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/bulk/route.ts',
    handlers: [
      { name: 'POST', collectionPermission: "'collections.", commerceOperations: ["'edit'", "'delete'"] },
    ],
  },
  {
    file: 'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/import/route.ts',
    handlers: [
      { name: 'POST', collectionPermission: "'collections.edit'", commerceOperations: ["'edit'"] },
    ],
  },
];

const commerceCollectionAccess = read('apps/public/src/lib/adminCommerceCollectionAccess.ts');
for (const needle of [
  "'products'",
  "'orders'",
  "view: 'commerce.view'",
  "edit: 'commerce.edit'",
  "delete: 'commerce.delete'",
  "configure: 'commerce.configure'",
  'requireAdminAccess(',
]) {
  assertIncludes(commerceCollectionAccess, needle, 'commerce collection access helper');
}

for (const route of commerceCollectionAdminRoutes) {
  const source = read(route.file);
  assertIncludes(source, "from '@/lib/adminAccess'", route.file);
  assertIncludes(source, 'requireAdminAccess(', route.file);
  assertIncludes(source, '@/lib/adminCommerceCollectionAccess', route.file);
  if (
    route.file === 'apps/public/src/app/api/admin/sites/[siteId]/collections/route.ts' ||
    route.file === 'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/route.ts'
  ) {
    assertIncludes(source, 'parseAdminCollectionFields(', route.file);
  }
  for (const handler of route.handlers) {
    const handlerSource = functionSource(source, handler.name, route.file);
    assertIncludes(handlerSource, handler.collectionPermission, `${route.file} ${handler.name}`);
    assert(
      /requireCommerceCollection(?:Slug)?Access\(/.test(handlerSource),
      `${route.file} ${handler.name} must call commerce collection access after resolving products/orders`,
    );
    for (const operation of handler.commerceOperations) {
      assert(
        handlerSource.includes(operation),
        `${route.file} ${handler.name} must require commerce ${operation} for products/orders in addition to ${handler.collectionPermission}`,
      );
    }
  }
}

const commerceOrderRecordDetailRoute = read('apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts');
for (const needle of [
  'applyRepositoryOrderInventoryRestore',
  'applyDemoOrderInventoryRestore',
  'inventoryrestoredat',
  'shouldRestoreOrderInventory',
]) {
  assertIncludes(commerceOrderRecordDetailRoute, needle, 'admin order workflow must restore reserved inventory once on cancel/refund');
}

const adminCollectionFields = read('apps/public/src/lib/adminCollectionFields.ts');
for (const needle of [
  'COLLECTION_FIELD_TYPES',
  'isCollectionFieldType',
  'Collection fields must be an array.',
  'has an unsupported type.',
  'is duplicated.',
  'default value must be JSON-compatible.',
]) {
  assertIncludes(adminCollectionFields, needle, 'admin collection field validator');
}

const adminCollectionImportRoute = read('apps/public/src/app/api/admin/sites/[siteId]/collections/import/route.ts');
for (const needle of [
  "import { parseAdminCollectionFields } from '@/lib/adminCollectionFields';",
  'const parsedFields = parseAdminCollectionFields(value.fields);',
  "return errorResponse(400, 'VALIDATION_ERROR', parsed.message, requestId, parsed.details);",
]) {
  assertIncludes(adminCollectionImportRoute, needle, 'admin collection backup import field validation');
}
assertExcludes(adminCollectionImportRoute, 'const parseFields =', 'admin collection backup import field validation');

const repositoryCollectionRecordWriteRoutes = [
  'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/import/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/collections/import/route.ts',
  'apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts',
  'apps/public/src/app/api/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts',
  'apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts',
];

for (const route of repositoryCollectionRecordWriteRoutes) {
  const source = read(route);
  assertIncludes(
    source,
    "import { validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';",
    `${route} repository-backed collection record validation`,
  );
  assertIncludes(
    source,
    'validateRepositoryCollectionRecordValues({',
    `${route} repository-backed collection record validation`,
  );
}

const commerceReconcileRoute = read('apps/public/src/app/api/admin/sites/[siteId]/commerce/reconcile/route.ts');
const commerceReconcilePost = functionSource(commerceReconcileRoute, 'POST', 'commerce reconcile route');
assertIncludes(
  commerceReconcilePost,
  "permission: 'commerce.configure'",
  'commerce reconcile route must match configure-only admin UI policy',
);

const publicFormAudienceAccess = read('apps/public/src/lib/publicFormAudienceAccess.ts');
for (const needle of [
  'isPublicFormAudience',
  'filterPublicAudienceForms',
  'requirePublicFormAudienceAccess',
  "permission = action === 'submit' && audience === 'adminOnly' ? 'forms.manage' : 'forms.view'",
  'FORM_AUTHENTICATION_REQUIRED',
  'FORM_ADMIN_ONLY',
]) {
  assertIncludes(publicFormAudienceAccess, needle, 'public form audience access helper');
}

const publicFormsListRoute = read('apps/public/src/app/api/sites/[siteId]/forms/route.ts');
assertIncludes(publicFormsListRoute, 'filterPublicAudienceForms(payload.items)', 'public forms list must hide non-public repository forms');
assertIncludes(publicFormsListRoute, 'filterPublicAudienceForms(listFormsBySite', 'public forms list must hide non-public demo forms');

const publicFormDefinitionRoute = read('apps/public/src/app/api/sites/[siteId]/forms/[formId]/definition/route.ts');
assertIncludes(publicFormDefinitionRoute, '@/lib/publicFormAudienceAccess', 'public form definition route must import audience guard');
assertIncludes(functionSource(publicFormDefinitionRoute, 'GET', 'public form definition route'), "requirePublicFormAudienceAccess(request, requestId, form, 'definition')", 'public form definition route must enforce audience before disclosure');
assertIncludes(publicFormDefinitionRoute, "cache: form.audience === 'public' ? 'discovery' : 'private'", 'restricted form definitions must not use public discovery cache');
assert(
  occurrenceCount(publicFormDefinitionRoute, "requirePublicFormAudienceAccess(request, requestId, form, 'definition')") >= 2,
  'public form definition route must enforce audience in repository and demo branches',
);

const publicFormDetailRoute = read('apps/public/src/app/api/sites/[siteId]/forms/[formId]/route.ts');
assertIncludes(publicFormDetailRoute, '@/lib/publicFormAudienceAccess', 'public form detail route must import audience guard');
assertIncludes(functionSource(publicFormDetailRoute, 'GET', 'public form detail route'), "requirePublicFormAudienceAccess(_request, requestId, form, 'definition')", 'public form detail route must enforce audience before disclosure');
assert(
  occurrenceCount(publicFormDetailRoute, "requirePublicFormAudienceAccess(_request, requestId, form, 'definition')") >= 2,
  'public form detail route must enforce audience in repository and demo branches',
);

const publicFormSubmissionRoute = read('apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts');
assertIncludes(publicFormSubmissionRoute, '@/lib/publicFormAudienceAccess', 'public form submission route must import audience guard');
assertIncludes(functionSource(publicFormSubmissionRoute, 'POST', 'public form submission route'), "requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit')", 'public form submission route must enforce audience before parsing submissions');
assertIncludes(publicFormSubmissionRoute, 'normalizeFormSubmissionValues(form, parsed.values)', 'public form submission route must strip undeclared submission keys before storage and routing');
assertIncludes(publicFormSubmissionRoute, 'enabled: formShareEnabled && contactShareOverride?.enabled !== false', 'public form submission route must not let public overrides enable disabled contact sharing');
assertExcludes(publicFormSubmissionRoute, "classification.status === 'approved' || classification.status === 'pending'", 'public form submission route must not route pending submissions into contacts or collections');
assert(
  occurrenceCount(publicFormSubmissionRoute, "requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit')") >= 2,
  'public form submission route must enforce audience in repository and demo branches',
);
assert(
  occurrenceCount(publicFormSubmissionRoute, 'const submissionValues = normalizeFormSubmissionValues(form, parsed.values);') >= 2,
  'public form submission route must normalize declared submission fields in repository and demo branches',
);
assert(
  occurrenceCount(publicFormSubmissionRoute, 'values: submissionValues') >= 4,
  'public form submission route must persist and notify with normalized submission values',
);
assertIncludes(
  publicFormSubmissionRoute,
  'resolveFormSubmissionEmailRecipient(params.form, notifications)',
  'public form submission route must use the global settings recipient as an email fallback',
);
assertIncludes(
  publicFormSubmissionRoute,
  "recipientSource: recipient.source",
  'public form submission route must disclose whether email delivery used form or settings recipient',
);
assert(
  occurrenceCount(publicFormSubmissionRoute, 'parsed.values') === occurrenceCount(publicFormSubmissionRoute, 'normalizeFormSubmissionValues(form, parsed.values)'),
  'public form submission route must not pass raw parsed submission values beyond normalization',
);

const backyStoreSource = read('apps/public/src/lib/backyStore.ts');
for (const needle of [
  'invalid_number',
  'invalid_date',
  'invalid_tel',
  'invalid_file',
  'normalizeFormSubmissionValues',
]) {
  assertIncludes(backyStoreSource, needle, 'form submission validation must enforce intrinsic field types and declared keys');
}

const adminFormSubmissionReviewRoute = read('apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts');
assertIncludes(adminFormSubmissionReviewRoute, 'createRepositoryCollectionRecordFromSubmission', 'admin submission review must route approved repository submissions into collection records');
assertIncludes(adminFormSubmissionReviewRoute, 'createCollectionRecordFromFormSubmission(', 'admin submission review must route approved demo submissions into collection records');
assertIncludes(adminFormSubmissionReviewRoute, "updated.status === 'approved' && form.collectionTarget?.enabled && !updated.collectionRecord", 'admin submission review must create missing collection records only on approval');

const adminPasswordPolicy = read('apps/public/src/lib/admin-auth/passwordPolicy.ts');
assertIncludes(adminPasswordPolicy, 'getAdminAuthPolicySettings', 'admin password policy must read persisted auth settings');
assertIncludes(adminPasswordPolicy, 'minPasswordLength', 'admin password policy must expose minimum length');
assertIncludes(adminPasswordPolicy, 'MIN_PASSWORD_LENGTH = 8', 'admin password policy must preserve lower UI bound');
assertIncludes(adminPasswordPolicy, 'MAX_PASSWORD_LENGTH = 128', 'admin password policy must preserve upper UI bound');
const adminAuthPolicyHelper = read('apps/public/src/lib/admin-auth/emailPolicy.ts');
assertIncludes(adminAuthPolicyHelper, 'await repositories.settings.get()', 'admin auth policy helper must read database settings when repositories are configured');
assertIncludes(adminAuthPolicyHelper, 'getAdminSettings()', 'admin auth policy helper must read demo settings during local fallback');
const resetPasswordRoute = read('apps/public/src/app/api/admin/auth/reset-password/route.ts');
assertIncludes(resetPasswordRoute, '@/lib/admin-auth/passwordPolicy', 'reset password route must import password policy');
assertIncludes(resetPasswordRoute, 'validateAdminPasswordPolicy(password, authSettings)', 'reset password route must enforce persisted password policy');
assertIncludes(resetPasswordRoute, 'getRequiredDatabaseRepositories', 'reset password route must support database-backed users');
assertIncludes(resetPasswordRoute, 'await resetAdminPasswordToken(token, password, repositories', 'reset password route must await repository-aware invite-only reset policy checks');
assertIncludes(resetPasswordRoute, 'repositories.users.setPasswordCredential(userId, credential)', 'reset password route must persist database-backed password credentials');
assertIncludes(resetPasswordRoute, "credentialMode: repositories ? 'database' : 'local-demo'", 'reset password route audit must disclose credential persistence mode');
assertIncludes(resetPasswordRoute, "'INVITE_ONLY_REQUIRED'", 'reset password route must return stable invite-only policy code');
assertExcludes(resetPasswordRoute, 'password.length < 8', 'reset password route');

const passwordRecoveryRoute = read('apps/public/src/app/api/admin/auth/password-recovery/route.ts');
for (const needle of [
  'createAdminPasswordResetToken',
  'getEmailDeliveryConfig',
  'sendEmailMessage',
  'validateAdminInviteOnlyActivationPolicy',
  'getRequiredDatabaseRepositories',
  'BACKY_EXPOSE_LOCAL_RECOVERY_TOKEN',
]) {
  assertIncludes(passwordRecoveryRoute, needle, 'password recovery route must create and deliver reset tokens without account enumeration');
}

const adminEmailPolicy = read('apps/public/src/lib/admin-auth/emailPolicy.ts');
assertIncludes(adminEmailPolicy, 'getAdminSettings()', 'admin email policy must read persisted settings');
assertIncludes(adminEmailPolicy, 'getRequiredDatabaseRepositories()', 'admin email policy must read database-backed settings');
assertIncludes(adminEmailPolicy, 'allowedEmailDomains', 'admin email policy must enforce configured domains');
assertIncludes(adminEmailPolicy, 'validateAdminEmailDomainPolicy', 'admin email policy must expose validator');
assertIncludes(adminEmailPolicy, 'validateAdminInviteOnlyCreatePolicy', 'admin email policy must expose invite-only create validator');
assertIncludes(adminEmailPolicy, 'validateAdminInviteOnlyActivationPolicy', 'admin email policy must expose invite-only activation validator');
for (const route of [
  'apps/public/src/app/api/admin/users/route.ts',
  'apps/public/src/app/api/admin/users/[userId]/route.ts',
  'apps/public/src/app/api/admin/users/import/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/promote/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, '@/lib/admin-auth/emailPolicy', `${route} must import email domain policy`);
  assertIncludes(source, 'validateAdminEmailDomainPolicy(', `${route} must enforce email domain policy`);
  assertIncludes(source, 'EMAIL_DOMAIN_NOT_ALLOWED', `${route} must use a stable email-domain error code`);
  assertIncludes(source, 'INVITE_ONLY_REQUIRED', `${route} must use a stable invite-only error code`);
}
const adminLoginRoute = read('apps/public/src/app/api/admin/auth/login/route.ts');
assertExcludes(adminLoginRoute, '@/lib/admin-auth/emailPolicy', 'login route must not lock out existing admins when domains change');
assertIncludes(adminLoginRoute, 'authenticateAdminCredentialsWithPersistence', 'login route must use repository-backed user lookup outside demo mode');
assertIncludes(adminLoginRoute, 'repositories.users.getByEmail', 'login route must resolve database users by email outside demo mode');
assertIncludes(adminLoginRoute, 'repositories.users.getPasswordCredentialByEmail', 'login route must verify database-backed password credentials outside demo mode');

const adminUsersRoute = read('apps/public/src/app/api/admin/users/route.ts');
assertIncludes(adminUsersRoute, 'createAdminInviteToken', 'admin user create route must create invite tokens for invited users');
assertIncludes(adminUsersRoute, 'const shouldCreateInvite = status ===', 'admin user create route must gate invite token creation by invited status');
assertIncludes(adminUsersRoute, 'inviteTokenId', 'admin user create route must audit generated invite token ids');
assertIncludes(adminUsersRoute, 'invite,', 'admin user create route must return generated invite token data');

const adminPasswordResetTokenRoute = read('apps/public/src/app/api/admin/users/[userId]/password-reset/route.ts');
assertIncludes(adminPasswordResetTokenRoute, '@/lib/admin-auth/emailPolicy', 'admin reset-token route must import invite-only policy');
assertIncludes(adminPasswordResetTokenRoute, 'validateAdminInviteOnlyActivationPolicy(user.status,', 'admin reset-token route must block invite-only activation bypass');
assertIncludes(adminPasswordResetTokenRoute, "'INVITE_ONLY_REQUIRED'", 'admin reset-token route must return stable invite-only policy code');

const adminSessionStore = read('apps/public/src/lib/admin-auth/sessionStore.ts');
assertIncludes(adminSessionStore, '@/lib/admin-auth/emailPolicy', 'admin session store must import invite-only policy');
assertIncludes(adminSessionStore, 'await validateAdminInviteOnlyActivationPolicy(currentUser.status,', 'admin password reset accept must enforce invite-only policy before activation');
assertIncludes(adminSessionStore, "reason: 'invite-only'", 'admin password reset accept must expose invite-only failure');
assertIncludes(adminSessionStore, 'authenticateAdminCredentialsWithPersistence', 'admin session store must support repository-backed credential lookup');
assertIncludes(adminSessionStore, 'getAdminSessionWithPersistence', 'admin session store must refresh sessions from repository-backed users');
assertIncludes(adminSessionStore, 'persistence.getUserByEmail', 'admin session store must support repository-backed login user lookup');
assertIncludes(adminSessionStore, 'persistence.getPasswordCredentialByEmail', 'admin session store must support repository-backed password verification');
assertIncludes(adminSessionStore, 'persistence.setPasswordCredential', 'admin session store must persist reset passwords through repository-backed credentials');
assertIncludes(adminSessionStore, 'persistence.getUserById', 'admin session store must support repository-backed invite/reset user lookup');
assertIncludes(adminSessionStore, 'persistence.updateUser', 'admin session store must support repository-backed invite/reset user updates');

const acceptInviteRoute = read('apps/public/src/app/api/admin/auth/accept-invite/route.ts');
assertIncludes(acceptInviteRoute, 'getRequiredDatabaseRepositories', 'accept invite route must support database-backed users');
assertIncludes(acceptInviteRoute, 'await acceptAdminInviteToken(token, repositories', 'accept invite route must pass repository callbacks into invite acceptance');

const contactEmailPolicy = read('apps/public/src/lib/contactEmailPolicy.ts');
assertIncludes(contactEmailPolicy, 'CONTACT_EMAIL_PATTERN', 'contact email policy must define a validation pattern');
assertIncludes(contactEmailPolicy, 'validateOptionalContactEmail', 'contact email policy must expose optional email validator');
for (const route of [
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/import/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, '@/lib/contactEmailPolicy', `${route} must import contact email policy`);
  assertIncludes(source, 'validateOptionalContactEmail(', `${route} must validate contact emails`);
  assertIncludes(source, 'INVALID_CONTACT_EMAIL', `${route} must use a stable invalid-contact-email error code`);
}

const adminFormFieldPolicy = read('apps/public/src/lib/adminFormFieldPolicy.ts');
assertIncludes(adminFormFieldPolicy, 'uniqueFieldKey', 'admin form field policy must enforce unique field keys');
assertIncludes(adminFormFieldPolicy, 'parseValidationRules', 'admin form field policy must sanitize validation rules');
assertIncludes(adminFormFieldPolicy, 'FIELD_TYPES', 'admin form field policy must enforce known field types');
for (const route of [
  'apps/public/src/app/api/admin/sites/[siteId]/forms/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, '@/lib/adminFormFieldPolicy', `${route} must import shared form field policy`);
  assertIncludes(source, 'parseFormFields(', `${route} must sanitize form fields`);
  assertExcludes(source, 'value as FormFieldDefinition[]', `${route} must not cast raw fields directly`);
}

const adminFormCollectionTargetPolicy = read('apps/public/src/lib/adminFormCollectionTargetPolicy.ts');
for (const needle of [
  'validateAdminFormCollectionTarget',
  'FORM_COLLECTION_TARGET_NOT_FOUND',
  'FORM_COLLECTION_TARGET_NOT_WRITABLE',
  'collection.status !==',
  '!collection.permissions.publicCreate',
  'FORM_COLLECTION_TARGET_FIELD_NOT_FOUND',
  'FORM_COLLECTION_TARGET_SLUG_FIELD_NOT_FOUND',
]) {
  assertIncludes(adminFormCollectionTargetPolicy, needle, 'admin form collection target policy');
}
for (const route of [
  'apps/public/src/app/api/admin/sites/[siteId]/forms/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, '@/lib/adminFormCollectionTargetPolicy', `${route} must import collection target policy`);
  assertIncludes(source, 'validateAdminFormCollectionTarget({', `${route} must validate collection targets before persistence`);
}

const backyStore = read('apps/public/src/lib/backyStore.ts');
assertIncludes(backyStore, 'enabled: formShareEnabled && contactShareOverride?.enabled !== false', 'demo contact share helper must not let public overrides enable disabled contact sharing');
const submissionValidationStart = backyStore.indexOf('function validateSubmissionValues(');
const submissionValidationEnd = backyStore.indexOf('\nfunction makeSubmissionSignature', submissionValidationStart);
assert(submissionValidationStart !== -1 && submissionValidationEnd !== -1, 'backyStore missing submission validation function');
const submissionValidationSource = backyStore.slice(submissionValidationStart, submissionValidationEnd);
assertIncludes(backyStore, 'function validateIntrinsicSubmissionField(', 'backyStore must have intrinsic form field validation');
assertIncludes(submissionValidationSource, 'const intrinsicViolation = validateIntrinsicSubmissionField(field, fieldLabel, fieldValue);', 'submission validation must call intrinsic email/url validation');
assert(
  submissionValidationSource.indexOf('validateIntrinsicSubmissionField(field, fieldLabel, fieldValue)') <
    submissionValidationSource.indexOf('if (!field.validation || field.validation.length === 0)'),
  'submission validation must enforce intrinsic email/url checks even when custom validation rules are present',
);

const adminContentStatusPolicy = read('apps/public/src/lib/adminContentStatusPolicy.ts');
for (const needle of [
  'statusRequiresPublishPermission',
  "status === 'published' || status === 'scheduled'",
  'validateScheduledContentStatus',
  'SCHEDULED_AT_REQUIRED',
  'SCHEDULED_AT_INVALID',
  'SCHEDULED_AT_NOT_FUTURE',
  'scheduledAtMs <= Date.now()',
  'scheduledAt must be in the future when status is scheduled.',
]) {
  assertIncludes(adminContentStatusPolicy, needle, 'admin content status policy');
}
for (const route of [
  'apps/public/src/app/api/admin/sites/[siteId]/pages/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/blog/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, '@/lib/adminContentStatusPolicy', `${route} must import content status policy`);
  assertIncludes(source, "permission: 'pages.publish'", `${route} must require publish permission for published/scheduled status`);
  assertIncludes(source, 'statusRequiresPublishPermission(', `${route} must check publish-status permission`);
  assertIncludes(source, 'validateScheduledContentStatus(', `${route} must validate scheduled status`);
}
for (const route of [
  'apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts',
]) {
  assertIncludes(read(route), 'Array.isArray(rawContent.elements)', `${route} PATCH content normalization must extract elements arrays`);
}

for (const file of [
  'apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts',
  'apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts',
  'apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts',
  'apps/public/src/app/api/sites/[siteId]/openapi/route.ts',
  'packages/sdk-js/src/index.ts',
]) {
  assertExcludes(read(file), 'rateLimitBypass', file);
}

for (const route of [
  'apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts',
  'apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts',
  'apps/public/src/app/api/sites/[siteId]/comments/blocklist/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, 'parseBoundedInteger', `${route} must parse bounded pagination parameters`);
  assertIncludes(source, "parseBoundedInteger(searchParams.get('limit')", `${route} must clamp requested limits`);
  assertIncludes(source, 'Number.MAX_SAFE_INTEGER', `${route} must normalize non-negative offsets`);
  assertExcludes(source, 'Number.isFinite(limit) ? limit', `${route} must not pass through unbounded finite limits`);
}

for (const route of [
  'apps/public/src/app/api/sites/[siteId]/events/route.ts',
  'apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/route.ts',
  'apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts',
  'apps/public/src/app/api/sites/[siteId]/blog/rss/route.ts',
]) {
  const source = read(route);
  assert(
    source.includes('Math.min(100') || source.includes('Math.min(parsed, 100)'),
    `${route} must cap caller-provided list limits at 100`,
  );
  assertExcludes(source, 'Number.isFinite(parsed) && parsed > 0 ? parsed', `${route} must not return unbounded positive limits`);
}
const publicOpenApiRoute = read('apps/public/src/app/api/sites/[siteId]/openapi/route.ts');
assertIncludes(publicOpenApiRoute, 'maximum: 100', 'public OpenAPI route must document capped list limits');
assertExcludes(publicOpenApiRoute, "queryParameter('limit', { type: 'integer', minimum: 1 })", 'public OpenAPI route must not advertise unbounded list limits');
assertExcludes(publicOpenApiRoute, "schema: { type: 'integer', minimum: 1 }", 'public OpenAPI route must not advertise direct unbounded limit parameters');

for (const route of [
  'apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts',
  'apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, '@/lib/adminAccess', `${route} must import admin access checks`);
  assertIncludes(source, "status !== 'approved'", `${route} must distinguish public approved comments from moderation statuses`);
  assertIncludes(source, "permission: 'comments.view'", `${route} must require comments.view for non-approved comment lists`);
  assertIncludes(source, 'access instanceof NextResponse', `${route} must return the admin access denial response`);
}

const checkoutRoute = read('apps/public/src/app/api/sites/[siteId]/commerce/orders/route.ts');
const checkoutGet = functionSource(checkoutRoute, 'GET', 'checkout route');
for (const needle of [
  'PRODUCT_CATALOG_NOT_FOUND',
  'ORDER_QUEUE_NOT_FOUND',
  'ORDER_QUEUE_NOT_PRIVATE',
  'privateOrderQueue: true',
]) {
  assertIncludes(checkoutGet, needle, 'checkout GET must report only real order-intake readiness');
}
assertIncludes(checkoutRoute, 'GUEST_CHECKOUT_DISABLED', 'checkout POST must reject public order intake when guest checkout is disabled');
assertIncludes(checkoutRoute, '!commerce.checkout.guestCheckout', 'checkout POST must read the guest checkout setting before creating orders');
const guestCheckoutGuards = checkoutRoute.match(/requireGuestCheckoutAllowed\(commerce, requestId\)/g) || [];
assert(guestCheckoutGuards.length >= 2, 'checkout POST must enforce guest checkout policy in both repository and demo-store paths');
const orderCreateAnchor = 'let order: Awaited<ReturnType<typeof repositories.collections.createRecord>>[\'item\'];';
const orderCreateAnchorIndex = checkoutRoute.indexOf(orderCreateAnchor);
const applyRepositoryReservationsIndex = checkoutRoute.indexOf('const rollbackInventoryReservations = await applyRepositoryInventoryReservations({');
const createOrderIndex = checkoutRoute.indexOf('repositories.collections.createRecord({', orderCreateAnchorIndex);
const rollbackOnOrderFailureIndex = checkoutRoute.indexOf('await rollbackInventoryReservations();', createOrderIndex);
const applyRepositoryRollbackIndex = checkoutRoute.indexOf('repositories.collections.updateRecord(siteId, productsCollectionId, reservation.record.id, {');
const originalValuesRollbackIndex = checkoutRoute.indexOf('values: toJsonRecord(reservation.originalValues)', applyRepositoryRollbackIndex);
assert(orderCreateAnchorIndex !== -1, 'checkout route missing public order create anchor');
assert(applyRepositoryReservationsIndex !== -1, 'checkout route missing repository inventory reservation application');
assert(createOrderIndex !== -1, 'checkout route missing order create');
assert(rollbackOnOrderFailureIndex !== -1, 'checkout route must roll back inventory reservations when order creation fails');
assert(applyRepositoryRollbackIndex !== -1, 'checkout route missing repository inventory rollback update');
assert(originalValuesRollbackIndex !== -1, 'checkout route must restore original inventory values on rollback');
assert(applyRepositoryReservationsIndex < createOrderIndex, 'checkout route must reserve inventory before creating the private order');
assert(createOrderIndex < rollbackOnOrderFailureIndex, 'checkout route must roll back after failed order creation');

const settingsRoute = read('apps/admin/src/routes/settings.tsx');
assertIncludes(settingsRoute, 'env:STRIPE_WEBHOOK_SECRET', 'settings UI must show env-reference webhook secret guidance');
assertIncludes(settingsRoute, 'Store the provider signing secret in the runtime environment', 'settings UI must explain webhook secret references');
assertExcludes(settingsRoute, 'placeholder="stripe_whsec_live"', 'settings UI must not encourage storing raw webhook secrets');

const adminContractSmoke = read('apps/public/scripts/admin-contract-smoke.mjs');
assertIncludes(adminContractSmoke, 'providerWebhookSecretId: `env:', 'admin contract smoke must use webhook secret references');
assertExcludes(adminContractSmoke, 'providerWebhookSecretId: `stripe_whsec_', 'admin contract smoke must not persist raw webhook secrets');

const productsAdminRoute = read('apps/admin/src/routes/products.tsx');
assertIncludes(productsAdminRoute, 'listCollectionRecords', 'products admin route must use paged collection record loads');
assertIncludes(productsAdminRoute, 'PRODUCT_RECORD_PAGE_SIZE', 'products admin route must use an explicit product page size');
assertIncludes(productsAdminRoute, 'loadMoreProducts', 'products admin route must expose incremental catalog loading');
assertExcludes(productsAdminRoute, 'listAllCollectionRecords', 'products admin route must not walk every product record on page load');

const ordersAdminRoute = read('apps/admin/src/routes/orders.tsx');
assertIncludes(ordersAdminRoute, 'listCollectionRecords', 'orders admin route must use paged collection record loads');
assertIncludes(ordersAdminRoute, 'ORDER_RECORD_PAGE_SIZE', 'orders admin route must use an explicit order page size');
assertIncludes(ordersAdminRoute, 'loadMoreOrders', 'orders admin route must expose incremental queue loading');
assertExcludes(ordersAdminRoute, 'listAllCollectionRecords', 'orders admin route must not walk every order record on page load');

const catalogRoute = read('apps/public/src/app/api/sites/[siteId]/commerce/catalog/route.ts');
for (const needle of [
  'CATALOG_RECORD_PAGE_SIZE',
  'listAllRepositoryCatalogRecords',
  'listAllDemoCatalogRecords',
  'page.pagination.hasMore',
]) {
  assertIncludes(catalogRoute, needle, 'commerce catalog route must page through all records before filtering/faceting');
}
assertExcludes(catalogRoute, 'limit: 100,', 'commerce catalog route must not cap catalog reads before filtering');

for (const route of [
  'apps/admin/src/routes/pages.$pageId.edit.tsx',
  'apps/admin/src/routes/blog.$postId.tsx',
]) {
  const source = read(route);
  assertIncludes(source, "rollbackMethod: 'POST'", `${route} editor handoff must document rollback method`);
  assertIncludes(source, "rollbackBody: { revisionId: '{revisionId}' }", `${route} editor handoff must document rollback body`);
  assertExcludes(source, '/rollback/{revisionId}', `${route} editor handoff must not advertise path-based rollback ids`);
}

const adminContentApi = read('apps/admin/src/lib/adminContentApi.ts');
for (const needle of [
  'exportReusableSections(',
  'importReusableSections(',
  'listReusableSectionVersions(',
  'restoreReusableSectionVersion(',
  'getReusableSectionInstances(',
  'refreshReusableSectionInstances(',
  'getReusableSectionMetadata(',
  'updateReusableSectionMetadata(',
  '/reusable-sections/export',
  '/reusable-sections/import',
  '/versions/${version}/restore',
  '/instances',
  '/metadata',
]) {
  assertIncludes(adminContentApi, needle, 'admin reusable section workflow API client');
}

const mediaSafety = read('apps/public/src/lib/mediaSafety.ts');
for (const needle of [
  'deliveryPolicy',
  'attachment-only',
  'ACTIVE_WEB_CONTENT_EXTENSIONS',
  "'text/html'",
  "'application/javascript'",
  "'image/svg+xml'",
  'requiresAttachmentDelivery',
  'scanMediaUploadWithProviders',
  'BACKY_MEDIA_SCAN_ENDPOINT',
  'provider-http-scan',
]) {
  assertIncludes(mediaSafety, needle, 'mediaSafety');
}

const adminSettingsRoute = read('apps/public/src/app/api/admin/settings/route.ts');
for (const needle of [
  'runtimeMediaScanner',
  'getMediaScannerRuntimeSummary',
  'BACKY_MEDIA_SCAN_PROVIDER',
  'BACKY_MEDIA_SCAN_ENDPOINT',
]) {
  assertIncludes(adminSettingsRoute, needle, 'admin settings route');
}
const mediaStorageSettingsPatchStart = adminSettingsRoute.indexOf('const isMediaStorageSettingsPatch');
const mediaStorageSettingsPatchEnd = adminSettingsRoute.indexOf('const isMediaStorageInfrastructureCheck');
assert(mediaStorageSettingsPatchStart !== -1 && mediaStorageSettingsPatchEnd !== -1, 'admin settings route missing media storage patch classifier');
const mediaStorageSettingsPatchSource = adminSettingsRoute.slice(mediaStorageSettingsPatchStart, mediaStorageSettingsPatchEnd);
assertIncludes(mediaStorageSettingsPatchSource, "key !== 'integrations'", 'media.configure settings patch must be scoped to storage integrations only');
assertExcludes(mediaStorageSettingsPatchSource, "key !== 'deliveryMode' && key !== 'integrations'", 'media.configure settings patch must not include deliveryMode');

const mediaFileRoute = read('apps/public/src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts');
for (const needle of [
  'requiresAttachmentDelivery(media)',
  "const disposition = requiresAttachment ? 'attachment' : requestedDisposition",
  'disposition: requestedDisposition',
  "'x-content-type-options': 'nosniff'",
  "'x-backy-media-delivery-policy': 'attachment-only'",
]) {
  assertIncludes(mediaFileRoute, needle, 'media file delivery route');
}

const mediaResponsive = read('apps/public/src/lib/mediaResponsive.ts');
for (const needle of [
  'publicMediaFilePath',
  'deliveryUrl',
  'downloadUrl',
  'url: deliveryUrl',
  'src: publicMediaFilePath(siteId, media.id)',
]) {
  assertIncludes(mediaResponsive, needle, 'media responsive public contract');
}

const mediaTransformRoute = read('apps/public/src/app/api/sites/[siteId]/media/[mediaId]/transform/route.ts');
for (const needle of [
  'publicMediaFilePath',
  "transformUrl.searchParams.set('url', publicMediaFilePath(site.id, media.id))",
]) {
  assertIncludes(mediaTransformRoute, needle, 'media transform route');
}

const adminMediaDetailRoute = read('apps/public/src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts');
const adminMediaDelete = functionSource(adminMediaDetailRoute, 'DELETE', 'admin media detail route');
for (const needle of [
  'collectRetainedVersionStoragePaths',
  'generatedTransformStoragePaths(media.metadata)',
  'addScopedStoragePath(siteId, storagePaths, version.storagePath)',
  'storagePath.startsWith(`sites/${siteId}/`)',
]) {
  assertIncludes(adminMediaDetailRoute, needle, 'admin media delete storage cleanup');
}
for (const needle of [
  'repositories.media.listVersions({',
  'const retainedVersionStoragePaths = collectRetainedVersionStoragePaths(',
  'await repositories.media.delete(site.id, mediaId)',
  'await deleteUploadedFile(site.id, media, retainedVersionStoragePaths)',
]) {
  assertIncludes(adminMediaDelete, needle, 'admin media delete storage cleanup');
}
assert(
  adminMediaDelete.indexOf('repositories.media.listVersions({') <
    adminMediaDelete.indexOf('await repositories.media.delete(site.id, mediaId)'),
  'admin media delete must capture retained version storage paths before deleting version rows',
);
assert(
  adminMediaDelete.indexOf('await repositories.media.delete(site.id, mediaId)') <
    adminMediaDelete.indexOf('await deleteUploadedFile(site.id, media, retainedVersionStoragePaths)'),
  'admin media delete must clean up storage with retained version paths after catalog delete',
);

console.log('Public security regression smoke passed');
