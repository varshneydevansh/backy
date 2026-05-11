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
    file: 'apps/public/src/app/api/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts',
    gates: ["permission: 'forms.view'", "permission: 'forms.manage'"],
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
    required: ['collection.permissions.publicCreate', "status: 'draft'", 'validateCollectionRecordValues('],
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
const createOrderIndex = checkoutRoute.indexOf('collections.createRecord(');
const updateInventoryIndex = checkoutRoute.indexOf('collections.updateRecord(');
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
]) {
  assertIncludes(mediaSafety, needle, 'mediaSafety');
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
