import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { loadVisitorErasureTestSource } from './visitor-erasure-route-smoke.mts';

/** Actual DELETE exports + actual native PostgreSQL privacy admission; all side effects are traps. */
export async function runVisitorPrivacyTeardownRouteProof(visitorAccounts: any, site: any, form: any) {
  const effects: string[] = [];
  const trap = (name: string) => async () => { effects.push(name); throw Error('Unexpected ' + name); };
  const repositories: any = {
    visitorAccounts,
    sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async (slug: string) => slug === site.slug ? site : null, delete: trap('site-delete') },
    forms: { getById: async () => form, update: trap('form-update'), delete: trap('form-delete') },
    media: {}, mailboxSends: { list: trap('mailbox-inventory') }, mediaUploadSessions: { pruneExpired: trap('upload-prune') },
  };
  const teardown = loadVisitorErasureTestSource('../src/lib/visitorPrivacyTeardown.ts');
  const mocks: any = {
    '@/lib/visitorPrivacyTeardown': teardown,
    '@/lib/adminAccess': { requireAdminAccess: async () => ({ type: 'session', session: { user: { id: 'fixture-owner', role: 'owner' } } }), requireAdminTeamScopeAccess: async () => null },
    '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories, shouldUseDemoStoreFallback: () => false },
    '@/lib/formAttachmentLifecycle': { prepareFormAttachmentDeletion: trap('attachment-prepare'), finishFormAttachmentDeletion: trap('attachment-finish'), assertSiteFormAttachmentsDeleted: trap('site-attachments'), FormAttachmentLifecycleError: class extends Error {} },
    '@/lib/mediaStorageMutation': { withMediaStorageMutation: trap('storage-mutation') },
    '@/lib/mediaStorageRecovery': { assertSiteMediaStorageJobsSettled: trap('storage-inventory'), mediaStorageRecoveryErrorResponse: () => null },
    '@/lib/siteBackup': { assertSiteBackupJobsSettled: trap('backup-inventory') },
    '@/lib/siteCommentDeliveryLifecycle': { siteCommentDeliveryDeletionResponse: trap('comment-inventory'), siteCommentDeliveryDeletionErrorResponse: () => null },
    '@/lib/siteFormDeliveryLifecycle': { siteFormDeliveryDeletionResponse: trap('delivery-inventory'), siteFormDeliveryDeletionErrorResponse: () => null },
    '@/lib/adminAudit': { recordAdminAudit: trap('audit') }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: trap('provider-webhook') },
    '@/lib/demoMailboxSendJournal': {}, '@/lib/committedMutationFollowUp': {}, '@/lib/cacheInvalidation': {}, '@/lib/backyStore': {}, '@/lib/navigation': {}, '@/lib/redirectRules': {}, '@/lib/frontendDesignContract': {},
    '@/lib/formDefinitionVersion': {}, '@/lib/adminFormFieldPolicy': {}, '@/lib/adminFormCollectionTargetPolicy': {},
  };
  for (const kind of ['site', 'form']) {
    const route = loadVisitorErasureTestSource(kind === 'site' ? '../src/app/api/admin/sites/[siteId]/route.ts' : '../src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts', mocks);
    const invoke = () => route.DELETE(new NextRequest(`https://admin.example/api/admin/sites/${site.slug}${kind === 'form' ? '/forms/' + form.id : ''}`, { method: 'DELETE' }), { params: Promise.resolve({ siteId: site.slug, formId: form.id }) });
    const response = await invoke();
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'VISITOR_PRIVACY_EVIDENCE_REMAINS');
    assert.match(body.error.message, /before storage cleanup/);
    assert.match(body.error.message, /retention and teardown policy/);
    assert.deepEqual(effects, []);
    const capability = repositories.visitorAccounts.privacyErasure;
    repositories.visitorAccounts.privacyErasure = undefined;
    try { const unavailable = await invoke(); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).error.code, 'VISITOR_PRIVACY_TEARDOWN_UNAVAILABLE'); assert.deepEqual(effects, []); }
    finally { repositories.visitorAccounts.privacyErasure = capability; }
    repositories.visitorAccounts.privacyErasure = { withDeletionPreflight: async () => { throw Error('Private database inventory unavailable'); } };
    try { const unavailable = await invoke(); assert.equal(unavailable.status, 503); const failure = await unavailable.json(); assert.equal(failure.error.code, 'VISITOR_PRIVACY_TEARDOWN_UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(failure), /Private database/); assert.deepEqual(effects, []); }
    finally { repositories.visitorAccounts.privacyErasure = capability; }

  }
  console.log('Actual site/form DELETE + native PG evidence preflight PASS: canonical slug scope, retained409, unavailable503, zero deactivation/deletion/storage/provider/audit activity.');
}
