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
    required: ['ORDER_QUEUE_NOT_PRIVATE', 'ordersCollection.permissions.publicRead', 'collections.createRecord(', 'collections.updateRecord('],
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
assertIncludes(adminPasswordPolicy, 'getAdminSettings()', 'admin password policy must read persisted settings');
assertIncludes(adminPasswordPolicy, 'minPasswordLength', 'admin password policy must expose minimum length');
assertIncludes(adminPasswordPolicy, 'MIN_PASSWORD_LENGTH = 8', 'admin password policy must preserve lower UI bound');
assertIncludes(adminPasswordPolicy, 'MAX_PASSWORD_LENGTH = 128', 'admin password policy must preserve upper UI bound');
const resetPasswordRoute = read('apps/public/src/app/api/admin/auth/reset-password/route.ts');
assertIncludes(resetPasswordRoute, '@/lib/admin-auth/passwordPolicy', 'reset password route must import password policy');
assertIncludes(resetPasswordRoute, 'validateAdminPasswordPolicy(password)', 'reset password route must enforce persisted password policy');
assertIncludes(resetPasswordRoute, 'getRequiredDatabaseRepositories', 'reset password route must support database-backed users');
assertIncludes(resetPasswordRoute, 'await resetAdminPasswordToken(token, password, repositories', 'reset password route must await repository-aware invite-only reset policy checks');
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

const checkoutRoute = read('apps/public/src/app/api/sites/[siteId]/commerce/orders/route.ts');
const orderCreateAnchor = 'const order = (await repositories.collections.createRecord({';
const orderCreateAnchorIndex = checkoutRoute.indexOf(orderCreateAnchor);
const createOrderIndex = checkoutRoute.lastIndexOf('collections.createRecord(', orderCreateAnchorIndex);
const updateInventoryIndex = checkoutRoute.indexOf('collections.updateRecord(', orderCreateAnchorIndex);
assert(orderCreateAnchorIndex !== -1, 'checkout route missing public order create anchor');
assert(createOrderIndex !== -1, 'checkout route missing order create');
assert(updateInventoryIndex !== -1, 'checkout route missing inventory update');
assert(createOrderIndex < updateInventoryIndex, 'checkout route must create the order before updating inventory');

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
