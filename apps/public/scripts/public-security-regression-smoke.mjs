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
assert(
  occurrenceCount(publicFormSubmissionRoute, "requirePublicFormAudienceAccess(request, responseRequestId, form, 'submit')") >= 2,
  'public form submission route must enforce audience in repository and demo branches',
);

const adminPasswordPolicy = read('apps/public/src/lib/admin-auth/passwordPolicy.ts');
assertIncludes(adminPasswordPolicy, 'getAdminSettings()', 'admin password policy must read persisted settings');
assertIncludes(adminPasswordPolicy, 'minPasswordLength', 'admin password policy must expose minimum length');
assertIncludes(adminPasswordPolicy, 'MIN_PASSWORD_LENGTH = 8', 'admin password policy must preserve lower UI bound');
assertIncludes(adminPasswordPolicy, 'MAX_PASSWORD_LENGTH = 128', 'admin password policy must preserve upper UI bound');
const resetPasswordRoute = read('apps/public/src/app/api/admin/auth/reset-password/route.ts');
assertIncludes(resetPasswordRoute, '@/lib/admin-auth/passwordPolicy', 'reset password route must import password policy');
assertIncludes(resetPasswordRoute, 'validateAdminPasswordPolicy(password)', 'reset password route must enforce persisted password policy');
assertExcludes(resetPasswordRoute, 'password.length < 8', 'reset password route');

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

console.log('Public security regression smoke passed');
