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
const adminTeamsUiRoute = read('apps/admin/src/routes/teams.tsx');
assertIncludes(adminTeamsUiRoute, 'getUserPermissions', 'teams admin page must load frontend permissions');
assertIncludes(adminTeamsUiRoute, "'users.manage'", 'teams admin page must gate mutations on users.manage');
assertIncludes(adminTeamsUiRoute, 'canManageTeams={canManageTeams}', 'teams admin page must pass mutation permission to team controls');
assertIncludes(adminTeamsUiRoute, 'getTeamMemberMutationBlockReason', 'teams admin page must guard unsafe member role/remove mutations');
assertIncludes(adminTeamsUiRoute, 'Use another owner/admin account to change your own team membership.', 'teams admin page must protect current admin team membership');
assertIncludes(adminTeamsUiRoute, 'Add another owner before removing the final team owner.', 'teams admin page must protect final owner removal');
assertIncludes(adminTeamsUiRoute, 'latestInviteDelivery', 'admin teams page must persist the latest invite delivery result');
assertIncludes(adminTeamsUiRoute, 'data-testid="team-invite-delivery-panel"', 'admin teams page must render a persistent invite delivery panel');
assertIncludes(adminTeamsUiRoute, 'navigator.clipboard.writeText(latestInviteDelivery.invite.inviteUrl)', 'admin teams invite panel must expose copyable invite URLs');
const teamManagementComponent = read('apps/admin/src/components/teams/TeamManagement.tsx');
assertIncludes(teamManagementComponent, 'busyMemberAction', 'team management controls must track member mutation busy state');
assertIncludes(teamManagementComponent, 'handleUpdateMemberRole', 'team management role changes must catch and show mutation failures');
assertIncludes(teamManagementComponent, 'handleRemoveMember', 'team management removals must catch and show mutation failures');
assertIncludes(teamManagementComponent, 'disabled={mutationsDisabled}', 'team management create/edit/delete/invite controls must disable without permission');
assertIncludes(teamManagementComponent, 'memberMutationBlockReason', 'team management controls must compute per-member safety blocks');
assertIncludes(teamManagementComponent, 'currentAdminId && member.userId === currentAdminId', 'team management controls must identify current admin memberships by id');
assertIncludes(teamManagementComponent, 'removeDisabled', 'team management remove buttons must disable when membership guardrails apply');
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
const orderInventoryRestoreHelper = read('apps/public/src/lib/orderInventoryRestore.ts');
const commerceWebhookRoute = read('apps/public/src/app/api/sites/[siteId]/commerce/webhook/route.ts');
const commerceReconcileSettlementRoute = read('apps/public/src/app/api/admin/sites/[siteId]/commerce/reconcile/route.ts');
for (const needle of ['inventoryrestoredat', 'shouldRestoreOrderInventory']) {
  assertIncludes(orderInventoryRestoreHelper, needle, 'shared order inventory helper must restore reserved inventory once on cancel/refund');
}
for (const [source, label] of [
  [commerceOrderRecordDetailRoute, 'admin order workflow'],
  [commerceWebhookRoute, 'commerce webhook settlement'],
  [commerceReconcileSettlementRoute, 'commerce reconciliation'],
]) {
  assertIncludes(source, 'applyRepositoryOrderInventoryRestore', `${label} must restore repository inventory on terminal order states`);
  assertIncludes(source, 'applyDemoOrderInventoryRestore', `${label} must restore demo inventory on terminal order states`);
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
assertIncludes(publicFormSubmissionRoute, 'enabled: formShareEnabled,', 'public form submission route must only use admin-configured contact sharing');
assertExcludes(publicFormSubmissionRoute, 'parsed.contactShareOverride', 'public form submission route must ignore public contact-share overrides');
assertExcludes(publicFormSubmissionRoute, 'ContactShareOverridePayload', 'public form submission route must not parse public contact-share overrides');
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
const adminAccessSource = read('apps/public/src/lib/adminAccess.ts');
assertIncludes(adminAccessSource, 'export async function requireAdminAccess', 'admin access checks must support repository-backed async API key lookup');
assertIncludes(adminAccessSource, 'const settings = await repositories.settings.get()', 'admin access checks must read DB-mode platform settings');
assertIncludes(adminAccessSource, 'settings.apiKeys?.secretKeyId', 'admin access checks must accept DB-mode regenerated admin keys');
assertIncludes(adminAccessSource, 'const environmentKeys = getEnvironmentAdminKeys()', 'admin access checks must try environment admin keys before DB settings lookup');
assertIncludes(adminAccessSource, 'getAdminSessionWithPersistence', 'admin access checks must refresh sessions through repository-backed users');
assertIncludes(adminAccessSource, 'repositories.users.getById', 'admin access checks must use database users in DB mode');

const adminUsersRoute = read('apps/public/src/app/api/admin/users/route.ts');
assertIncludes(adminUsersRoute, 'createAdminInviteToken', 'admin user create route must create invite tokens for invited users');
assertIncludes(adminUsersRoute, 'const shouldCreateInvite = status ===', 'admin user create route must gate invite token creation by invited status');
assertIncludes(adminUsersRoute, 'inviteTokenId', 'admin user create route must audit generated invite token ids');
assertIncludes(adminUsersRoute, 'invite,', 'admin user create route must return generated invite token data');
const adminUsersUiRoute = read('apps/admin/src/routes/users.tsx');
assertIncludes(adminUsersUiRoute, 'notice: normalizedUsersSearchString(search.notice)', 'admin users list route must accept redirect success notices');
assertIncludes(adminUsersUiRoute, 'const routeNotice = routeSearch.notice ||', 'admin users list route must render one-time redirect notices');
assertIncludes(adminUsersUiRoute, 'const pendingRouteNotice = routeNoticeRef.current', 'admin users list load must not clear redirect success notices');
const adminPermissionUi = read('apps/admin/src/lib/adminPermissionUi.ts');
assertIncludes(adminPermissionUi, 'return false;', 'admin permission helper must fail closed when backend permission rules are unavailable');
assertIncludes(adminPermissionUi, 'Permission matrix unavailable. Reload permissions before using this capability.', 'admin permission helper must explain fail-closed permission matrix state');
assertExcludes(adminPermissionUi, '? `Allowed by ${currentAdmin.role} role defaults.`', 'admin permission helper must not allow actions from role defaults without backend matrix rules');
for (const route of [
  'apps/admin/src/routes/collections.tsx',
  'apps/admin/src/routes/media.tsx',
  'apps/admin/src/routes/sites.tsx',
  'apps/admin/src/routes/sites.new.tsx',
  'apps/admin/src/routes/sites.$siteId.tsx',
  'apps/admin/src/routes/pages.$pageId.edit.tsx',
  'apps/admin/src/routes/index.tsx',
]) {
  const source = read(route);
  assertIncludes(source, 'Permission matrix unavailable. Reload permissions before using this capability.', `${route} must explain fail-closed permission matrix state`);
  assertExcludes(source, '? `Allowed by ${currentAdmin.role} role defaults.`', `${route} must not allow actions from role defaults without backend matrix rules`);
}
const adminUsersNewUiRoute = read('apps/admin/src/routes/users.new.tsx');
assertIncludes(adminUsersNewUiRoute, 'notice: `${created.user.fullName} was created.`', 'admin user create page must carry a success notice back to the users list');
const adminUserDetailUiRoute = read('apps/admin/src/routes/users.$userId.tsx');
assertIncludes(adminUserDetailUiRoute, 'notice: `${saved.fullName} was saved.`', 'admin user edit page must carry a save success notice back to the users list');
assertIncludes(adminUserDetailUiRoute, 'notice: `${user.fullName} was removed.`', 'admin user edit page must carry a delete success notice back to the users list');
assertIncludes(adminUserDetailUiRoute, 'const [isLoadingUser, setIsLoadingUser] = useState(!user)', 'admin user detail must start loading when deep-linked user is not in the local store');
assertIncludes(adminUserDetailUiRoute, 'if (!user && (isLoadingUser || isCurrentAdminPermissionMatrixPending))', 'admin user detail must not render not-found before backend lookup finishes');
assertIncludes(adminUserDetailUiRoute, 'title="Loading user"', 'admin user detail must show a loading state while resolving direct links');

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
const pageRenderer = read('apps/public/src/components/PageRenderer.tsx');
assertExcludes(pageRenderer, 'buildContactShareOverride', 'public page renderer must not send client-controlled contact-share overrides');
assertExcludes(pageRenderer, 'contactShareOverride', 'public page renderer must not submit contact-share overrides');
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
for (const route of [
  'apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/publish/route.ts',
  'apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/archive/route.ts',
]) {
  const source = read(route);
  assertIncludes(source, 'const body = await parseJsonBody(request);', `${route} must parse status mutation bodies`);
  assertIncludes(source, 'expectedUpdatedAt', `${route} must read optimistic concurrency tokens`);
  assertIncludes(source, 'PAGE_VERSION_CONFLICT', `${route} must reject stale page status mutations`);
  assertIncludes(source, 'currentUpdatedAt', `${route} must return current version details on conflicts`);
  assert(
    occurrenceCount(source, 'expectedUpdatedAt && expectedUpdatedAt !== currentPage.updatedAt') >= 2,
    `${route} must enforce optimistic concurrency in repository and demo-store paths`,
  );
}
const canvasEditorSource = read('apps/admin/src/components/editor/CanvasEditor.tsx');
assertIncludes(canvasEditorSource, 'publicationStateChanging', 'canvas editor settings save must guard publication status changes');
assertIncludes(canvasEditorSource, "disabled={isSaving || !canEdit || !canPublish || (pageSettings.status !== 'published' && publishDisabled)}", 'canvas editor publish/unpublish button must require pages.publish in both directions');
const pageSettingsModalSource = read('apps/admin/src/components/editor/PageSettingsModal.tsx');
assertIncludes(pageSettingsModalSource, 'isPublicationStatus(initialSettings.status)', 'page settings modal must guard unpublishing published or scheduled pages');
const canvasSource = read('apps/admin/src/components/editor/Canvas.tsx');
assertIncludes(canvasSource, 'handleFormPreviewSubmit', 'editor form preview must have a submit workflow');
assertIncludes(canvasSource, 'editor-form-preview-feedback', 'editor form preview must render visible submission feedback');
assertIncludes(canvasSource, 'new FormData(form)', 'editor form preview must collect configured field values before submitting');
assertIncludes(canvasSource, 'await fetch(actionUrl', 'editor form preview must call the configured action URL');
assertExcludes(canvasSource, 'data-testid="editor-form-schema"\n              data-form-id={formId}\n              data-form-active={formActive ? \'true\' : \'false\'}\n              data-form-field-count={schemaFields.length}\n              onSubmit={(event) => event.preventDefault()}', 'editor form preview must not silently swallow schema form submissions');
const publicRenderRoute = read('apps/public/src/app/api/sites/[siteId]/render/route.ts');
assertIncludes(publicRenderRoute, 'if (!site || !site.isPublished)', 'public render endpoint must not expose unpublished sites');
const hostedSiteRoute = read('apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx');
assertIncludes(hostedSiteRoute, 'return site?.isPublished ? { mode: \'database\', site, repositories } as HostedSite : null;', 'hosted database site renderer must not render unpublished sites');
assertIncludes(hostedSiteRoute, 'return site?.isPublished ? { mode: \'demo\', site, repositories: null } as HostedSite : null;', 'hosted demo site renderer must not render unpublished sites');
const pageRendererSource = read('apps/public/src/components/PageRenderer.tsx');
assertIncludes(pageRendererSource, 'const getSafeFormRedirectUrl = (value: unknown): string =>', 'public form renderer must sanitize success redirects');
assertIncludes(pageRendererSource, 'parsed.origin !== window.location.origin', 'public form renderer must reject unsafe cross-origin success redirects');
assertIncludes(pageRendererSource, 'window.location.assign(safeSuccessRedirectUrl)', 'public form renderer must only navigate to sanitized success redirects');
const pageCreateRoute = read('apps/admin/src/routes/pages.new.tsx');
assertIncludes(pageCreateRoute, 'page-create-dataset-selector', 'page creation must expose a first-class dataset selector');
assertIncludes(pageCreateRoute, 'page-dataset-collection-select', 'page creation must let users choose a collection without URL params');
assertIncludes(pageCreateRoute, "(['list', 'item'] as PageDatasetMode[]).map", 'page creation must expose list and item dataset modes');
assertIncludes(pageCreateRoute, 'page-dataset-mode-${mode}', 'page creation must test dataset mode controls');
assertExcludes(pageCreateRoute, 'if (!siteId || !formData.collectionId)', 'page creation must load collections for selector use, not only URL-param dataset imports');
assertIncludes(pageCreateRoute, 'findCollectionRouteConflictForPageCreate', 'page creation must preflight collection route conflicts before submit');
assertIncludes(pageCreateRoute, 'routePathMatchesPatternForPageCreate', 'page creation must match dynamic collection item route patterns before submit');
assertIncludes(pageCreateRoute, '&& !collectionRouteCheckError', 'page creation must block submit when collection route verification fails');
assertIncludes(pageCreateRoute, 'checkedCollections: collections.length', 'page creation route handoff must report collection route checks');
assertIncludes(pageCreateRoute, "schemaVersion: 'backy.collection-dataset-page.v1'", 'page creation must save a versioned collection dataset page contract');
assertIncludes(pageCreateRoute, 'collectionDataset: selectedDatasetContract || undefined', 'page creation must persist dataset route contracts in page meta');
assertIncludes(pageCreateRoute, "recordParam: mode === 'item' ? 'recordSlug' : null", 'dataset detail pages must persist their record slug parameter contract');
const publicRenderPayload = read('apps/public/src/lib/renderPayload.ts');
assertIncludes(publicRenderPayload, 'const collectionDataset = isRecord(page.meta.collectionDataset)', 'public render payload must read saved collection dataset contracts');
assertIncludes(publicRenderPayload, 'dataset: collectionDataset', 'public render route metadata must expose collection dataset contracts');
assertIncludes(publicRenderPayload, 'collectionDataset,', 'public render data bindings must expose collection dataset contracts');
const publicRenderRouteSource = read('apps/public/src/app/api/sites/[siteId]/render/route.ts');
assertIncludes(publicRenderRouteSource, 'collectionDataset: page.meta?.collectionDataset', 'database render adapter must preserve collection dataset page meta');

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
assertExcludes(publicOpenApiRoute, 'contactShareOverride', 'public OpenAPI schema must not document public contact-share overrides');

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
const variantAwareProductStockGuards = checkoutRoute.match(/reservationsEnabled && !variant && !product\.inventory\.inStock/g) || [];
assert(variantAwareProductStockGuards.length >= 2, 'checkout POST must not reject variant carts on parent product stock before variant stock validation');
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
assertIncludes(settingsRoute, 'pendingRotateKey', 'settings UI must require confirmation before API key rotation');
assertIncludes(settingsRoute, 'settings-api-key-rotation-confirm-dialog', 'settings UI must render an API key rotation confirmation dialog');
assertIncludes(settingsRoute, 'Existing integrations using', 'settings UI must warn that key rotation breaks existing integrations');
assertIncludes(settingsRoute, 'const statusLabel = !canShowValue', 'settings UI must show redacted admin API keys as hidden, not unconfigured');
assertIncludes(settingsRoute, 'Hidden without settings.manageKeys', 'settings UI must explain hidden admin API key values');
assertIncludes(settingsRoute, 'runSettingsStorageProvisioningProbe', 'settings UI must expose the media storage provisioning probe client action');
assertIncludes(settingsRoute, 'Run storage probe', 'settings UI must render a storage provisioning probe button');
assertIncludes(settingsRoute, 'storageProvisioningResult.rotation.fields.map', 'settings UI must render storage credential rotation guidance from the provisioning probe');

const siteDetailUiRoute = read('apps/admin/src/routes/sites.$siteId.tsx');
assertIncludes(siteDetailUiRoute, 'siteSettingsNotice', 'site settings page must render a save success notice');
assertIncludes(siteDetailUiRoute, 'setSiteSettingsNotice(`${savedSite.name} settings saved.`);', 'site settings save must stay on-page with success context');
assertExcludes(siteDetailUiRoute, "navigate({ to: '/sites' });\n    } catch (error) {", 'site settings save must not immediately redirect away after saving');

const adminSiteDetailRoute = read('apps/public/src/app/api/admin/sites/[siteId]/route.ts');
assertIncludes(adminSiteDetailRoute, 'siteStatus: nextStatus', 'admin site detail route must persist archived site lifecycle state in settings');
assertIncludes(adminSiteDetailRoute, 'persistedSiteStatus(site)', 'admin site detail route must return persisted archived site status');
assertIncludes(adminSiteDetailRoute, "nextStatus === 'draft' || nextStatus === 'archived' ? 'draft'", 'admin site detail route must keep archived sites unpublished in repository mode');
const adminSitesLifecycleRoute = read('apps/public/src/app/api/admin/sites/route.ts');
assertIncludes(adminSitesLifecycleRoute, 'settings: { siteStatus: status }', 'admin sites route must persist site lifecycle status on create');
const siteRepository = read('packages/db/src/repositories/site-page-post.ts');
assertIncludes(siteRepository, 'normalizeSiteStatus(site) === status', 'site repository status filters must distinguish archived from draft');
const auditLogRepository = read('packages/db/src/repositories/audit-logs.ts');
assertIncludes(auditLogRepository, 'if (input.actorId) conditions.push(eq(activityLogs.userId, input.actorId));', 'audit log repository must push actor filters into the database query');
assertIncludes(auditLogRepository, 'if (input.entity) conditions.push(eq(activityLogs.entityType, input.entity));', 'audit log repository must push entity filters into the database query');
assertIncludes(auditLogRepository, 'if (input.action) conditions.push(eq(activityLogs.action, input.action));', 'audit log repository must push action filters into the database query');
assertIncludes(auditLogRepository, "if (input.teamId) conditions.push(sql`${activityLogs.details}->>'teamId' = ${input.teamId}`);", 'audit log repository must push team metadata filters into the database query');
assertIncludes(auditLogRepository, "if (input.requestId) conditions.push(sql`${activityLogs.details}->>'requestId' = ${input.requestId}`);", 'audit log repository must push request metadata filters into the database query');
const pageWorkflowAdminContentApi = read('apps/admin/src/lib/adminContentApi.ts');
assertIncludes(pageWorkflowAdminContentApi, 'export async function unpublishPage', 'admin content API must expose a first-class page unpublish operation');
assertIncludes(pageWorkflowAdminContentApi, "revisionNote: 'Before unpublish'", 'page unpublish operation must record an explicit revision note');
const pagesAdminRoute = read('apps/admin/src/routes/pages.tsx');
assertIncludes(pagesAdminRoute, 'data-testid={`pages-unpublish-${page.id}`}', 'pages list must expose per-page unpublish controls');
assertIncludes(pagesAdminRoute, '<option value="unpublish">Unpublish selected</option>', 'pages list must expose bulk unpublish');
const pageEditorRoute = read('apps/admin/src/routes/pages.$pageId.edit.tsx');
assertIncludes(pageEditorRoute, "applyWorkflow('unpublish')", 'page editor must expose unpublish from the page workflow panel');
assertIncludes(pageEditorRoute, "'Page unpublished.'", 'page editor must show an unpublish success notice');
const adminPageDetailRoute = read('apps/public/src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts');
assertIncludes(adminPageDetailRoute, 'pageStatusMutationRequiresPublishPermission', 'admin page update route must guard unpublish status changes with the publish permission');
assertIncludes(adminPageDetailRoute, "currentStatus === 'published' || currentStatus === 'scheduled'", 'admin page update route must treat public-to-draft transitions as publish-status mutations');

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

const collectionsAdminRoute = read('apps/admin/src/routes/collections.tsx');
const templatePreviewCopyIndex = collectionsAdminRoute.indexOf('collections-template-preview-copy-render');
assert(templatePreviewCopyIndex !== -1, 'collections admin route must expose template preview render URL copy control');
const templatePreviewCopySource = collectionsAdminRoute.slice(Math.max(0, templatePreviewCopyIndex - 800), templatePreviewCopyIndex + 600);
assertIncludes(templatePreviewCopySource, "key: 'collections.export'", 'template preview render URL copy must require collections.export');
assertIncludes(templatePreviewCopySource, '!canExportCollections', 'template preview render URL copy must be disabled without collections.export');
assertIncludes(collectionsAdminRoute, 'MediaLibraryModal', 'collections record editor must use central media picker for media fields');
assertIncludes(collectionsAdminRoute, 'collections-record-media-picker-', 'collections record editor must expose media picker controls per media field');
assertIncludes(collectionsAdminRoute, 'referenceRecordsByCollection', 'collections record editor must preload cross-collection reference records');
assertIncludes(collectionsAdminRoute, 'collections-record-reference-picker-', 'collections record editor must expose record picker controls for relationship fields');
assertIncludes(collectionsAdminRoute, 'Backy media ID from the central library', 'collections media field helper text must describe central media IDs');
assertIncludes(collectionsAdminRoute, "isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view'", 'collections media picker must respect media.view');
assertIncludes(collectionsAdminRoute, 'canView={canViewMedia}', 'collections media picker modal must receive media.view state');
assertIncludes(collectionsAdminRoute, 'canCreate={canCreateMedia}', 'collections media picker modal must receive media.create state');
assertIncludes(collectionsAdminRoute, "setNotice(`Collection record ${selectedRecordId ? 'updated' : 'created'}.`);", 'collections record save must show a success notice');

const mediaAdminRoute = read('apps/admin/src/routes/media.tsx');
assertIncludes(mediaAdminRoute, 'setBulkNotice(`Deleted ${file.name}.`);', 'single media delete must show a success notice');
assertIncludes(mediaAdminRoute, 'setBulkNotice(`${updated.name} details saved.`);', 'media metadata save must show a success notice');
assertIncludes(mediaAdminRoute, 'const deniedExportMessage = `Your account needs activity.export to export media manifests and audit feeds. ${activityPermissionTitle}`;', 'media manifest export must explain activity.export permission failures');
assertIncludes(mediaAdminRoute, 'const copyMediaHandoffManifest = async () => {', 'media manifest copy must use a dedicated permission-checked handler');
assertIncludes(mediaAdminRoute, 'setError(deniedExportMessage);', 'media manifest export handlers must fail closed without activity.export');
assert(
  occurrenceCount(mediaAdminRoute, 'onClick={() => void copyMediaHandoffManifest()}') >= 2,
  'media manifest copy controls must route through the permission-checked handler',
);
assert(
  occurrenceCount(mediaAdminRoute, 'disabled={isMediaLibraryBusy || !canExportMediaActivity}') >= 3,
  'media manifest copy/download controls must be disabled without activity.export',
);

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
