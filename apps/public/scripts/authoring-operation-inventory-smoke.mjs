import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAuthoringOperations } from './authoring-openapi-operations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceRoot = path.join(root, 'apps/public/src');
const route = fs.readFileSync(path.join(sourceRoot, 'app/api/sites/[siteId]/openapi/route.ts'), 'utf8');
const read = file => fs.readFileSync(file, 'utf8');
const full = collectAuthoringOperations(route, sourceRoot, read);
const required = [
  'GET /api/admin/sites/{siteId}/backup',
  'GET /api/admin/sites/{siteId}/backup/restore-jobs',
  'POST /api/admin/sites/{siteId}/backup/restore',
  'POST /api/admin/sites/{siteId}/backup/restore-jobs/{jobId}/retry',
  'POST /api/admin/sites/{siteId}/frontend-design/composition-import',
  'POST /api/admin/sites/{siteId}/forms/template-pack/import',
  'GET /api/admin/sites/{siteId}/settings/mailboxes',
  'GET /api/admin/sites/{siteId}/settings/mailboxes/{bindingId}/folders',
  'GET /api/admin/sites/{siteId}/settings/mailboxes/{bindingId}/messages',
  'POST /api/admin/sites/{siteId}/settings/mailboxes/{bindingId}/messages/{uid}/read',
  'GET /api/admin/sites/{siteId}/settings/mailboxes/{bindingId}/messages/{uid}/attachments',
  'POST /api/admin/sites/{siteId}/settings/mailboxes/{bindingId}/messages/{uid}/attachments/{attachmentId}/download',
];
for (const key of required) assert(full.documented.has(key), key);
assert.deepEqual([...full.modules].sort(), ['@/lib/frontendCompositionOpenApi', '@/lib/siteBackupOpenApi', '@/lib/formTemplatePackOpenApi', '@/lib/siteMailboxOpenApi', '@/lib/newsletterCampaignOpenApi', '@/lib/mediaUploadSessionsOpenApi', '@/lib/visitorErasureOpenApi', '@/lib/commerceEntitlementsOpenApi', '@/lib/siteMailboxManagementOpenApi'].sort());
// Removing the actual spread must expose missing operations despite its import.
const detached = collectAuthoringOperations(route.replace('...siteBackupPaths(site.id),', ''), sourceRoot, read);
for (const key of required.slice(0, 4)) assert(!detached.documented.has(key), key);
assert(detached.documented.has(required[4]));
const detachedMailboxes = collectAuthoringOperations(route.replace('...siteMailboxPaths(site.id),', ''), sourceRoot, read);
for (const key of required.slice(6)) assert(!detachedMailboxes.documented.has(key), key);
assert(detachedMailboxes.documented.has(required[4]));
// An empty declaration cannot silently pass because a module is named correctly.
const empty = collectAuthoringOperations(route, sourceRoot, file => file.endsWith('siteBackupOpenApi.ts') ? 'export function siteBackupPaths() { return {}; }' : read(file));
assert(!empty.documented.has(required[0]));
assert.throws(() => collectAuthoringOperations(route, sourceRoot, () => { throw new Error('Missing module'); }), /Missing module/);
assert.throws(() => collectAuthoringOperations(route.replace('...siteBackupPaths(site.id),', '...unknownPaths(site.id),'), sourceRoot, read), /Unresolved paths module/);
assert.throws(() => collectAuthoringOperations(route.replace('...siteBackupPaths(site.id),', '...siteBackupPaths(other.id),'), sourceRoot, read), /Unsupported OpenAPI paths spread/);
assert.throws(() => collectAuthoringOperations(route, sourceRoot, file => file.endsWith('siteBackupOpenApi.ts') ? 'export function siteBackupPaths() { return require("node:fs"); }' : read(file)), /require is not defined/);
console.log('PASS actual twelve modular operations, detached backup/mailbox and empty declaration negatives, missing/unknown/unsupported module refusal, no require access');

for(const [producer,operation] of [['mediaUploadSessionPaths','GET /api/admin/sites/{siteId}/media/uploads'],['newsletterCampaignPaths','POST /api/admin/sites/{siteId}/newsletter/campaigns'],['visitorErasureOpenApiPaths','POST /api/admin/sites/{siteId}/visitors/members/{memberId}/privacy-erasure/preview'],['commerceEntitlementPaths','GET /api/admin/sites/{siteId}/commerce/orders/{orderId}/entitlements'],['siteMailboxManagementPaths','GET /api/admin/sites/{siteId}/settings/mailbox-management']]) { assert(full.documented.has(operation),operation); const detached=collectAuthoringOperations(route.replace('...'+producer+'(site.id),',''),sourceRoot,read);assert(!detached.documented.has(operation),producer+' detached producer remains missing'); }
