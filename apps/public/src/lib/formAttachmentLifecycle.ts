import type { StorageAdapter } from '@backy/storage';
import { createHash } from 'node:crypto';
import type { Contact, FormDefinition, FormSubmission } from '@backy-cms/core';
import { getFormAttachmentStorage } from './formAttachmentStorage';
import { formAttachmentPath, isFormAttachment, type FormAttachment } from './formAttachments';
import { collectCompleteExportPages } from './collectionExportPagination';
import { getBlogPosts, getSiteByIdOrSlug, listAdminPages, listCollections, listCollectionRecords, listFormsBySite, listFormContacts, listFormSubmissions, listReusableSections } from './backyStore';
import type { getRequiredDatabaseRepositories } from './repositoryRuntime';

type Repositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
const KIND = 'backy.form.attachment-cleanup.v1';
const MAX_MANIFEST_BYTES = 256 * 1024;
type Manifest = { kind: typeof KIND; siteId: string; formId: string; attachments: FormAttachment[] };
export class FormAttachmentLifecycleError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const siteCleanupPrefix = (siteId: string) => `form-attachments/sites/${createHash('sha256').update(siteId).digest('hex')}/cleanup`;
export const formAttachmentCleanupPath = (siteId: string, formId: string) => `${siteCleanupPrefix(siteId)}/${createHash('sha256').update(formId).digest('hex')}.json`;
/** Includes nested copies, not only the canonical submission's top-level file fields. */
function references(value: unknown, output = new Map<string, FormAttachment>(), depth = 0): Map<string, FormAttachment> {
  if (depth > 100) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_INVENTORY_UNAVAILABLE', 'Attachment references exceed the supported nesting depth.');
  if (isFormAttachment(value)) output.set(value.attachmentId, value);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) references(child, output, depth + 1);
  return output;
}
async function inventory(siteId: string, repositories: Repositories | null) {
  let forms: FormDefinition[], submissions: FormSubmission[], contacts: Contact[];
  const other: unknown[] = [];
  if (repositories) {
    [forms, submissions, contacts] = await Promise.all([
      collectCompleteExportPages((p) => repositories.forms.list({ siteId, ...p }), (f) => f.siteId === siteId),
      collectCompleteExportPages((p) => repositories.forms.listSubmissions({ siteId, status: 'all', ...p }), (s) => s.siteId === siteId),
      collectCompleteExportPages((p) => repositories.forms.listContacts({ siteId, ...p }), (c) => c.siteId === siteId),
    ]);
    const [pages, posts, sections, collections, site] = await Promise.all([
      collectCompleteExportPages((p) => repositories.pages.list({ siteId, status: 'all', includeUnpublished: true, ...p }), (v) => v.siteId === siteId),
      collectCompleteExportPages((p) => repositories.posts.list({ siteId, status: 'all', includeUnpublished: true, ...p }), (v) => v.siteId === siteId),
      collectCompleteExportPages((p) => repositories.reusableSections.list({ siteId, status: 'all', ...p }), (v) => v.siteId === siteId),
      collectCompleteExportPages((p) => repositories.collections.list({ siteId, status: 'all', includeUnpublished: true, ...p }), (v) => v.siteId === siteId),
      repositories.sites.getById(siteId),
    ]);
    other.push(...pages, ...posts, ...sections, site?.settings);
    for (const collection of collections) other.push(...await collectCompleteExportPages((p) => repositories.collections.listRecords({ siteId, collectionId: collection.id, status: 'all', includeUnpublished: true, ...p }), (v) => v.siteId === siteId && v.collectionId === collection.id));
  } else {
    forms = listFormsBySite(siteId); submissions = []; contacts = [];
    for (const form of forms) {
      if (form.siteId !== siteId) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_INVENTORY_UNAVAILABLE', 'Unable to verify attachment references.');
      submissions.push(...await collectCompleteExportPages(async (p) => { const v = listFormSubmissions(form.id, { ...p, siteId }); return { items: v.data, pagination: v.pagination }; }, (v) => v.siteId === siteId && v.formId === form.id));
      contacts.push(...await collectCompleteExportPages(async (p) => { const v = listFormContacts(form.id, { ...p, siteId }); return { items: v.contacts, pagination: v.pagination }; }, (v) => v.siteId === siteId && v.formId === form.id));
    }
    other.push(...listAdminPages(siteId, { includeUnpublished: true }), ...listReusableSections(siteId, { status: 'all' }), getSiteByIdOrSlug(siteId)?.settings);
    other.push(...await collectCompleteExportPages(async (p) => { const v = getBlogPosts(siteId, { includeUnpublished: true, ...p }); if (!v.pagination) throw new Error(); return { items: v.posts, pagination: v.pagination }; }, (v) => v.siteId === siteId));
    for (const collection of listCollections(siteId, { includeUnpublished: true })) other.push(...await collectCompleteExportPages(async (p) => { const v = listCollectionRecords(siteId, collection.id, { includeUnpublished: true, ...p }); return { items: v.records, pagination: v.pagination }; }, (v) => v.siteId === siteId && v.collectionId === collection.id));
  }
  return { forms, submissions, contacts, other };
}
async function readManifest(storage: StorageAdapter, siteId: string, formId: string): Promise<Manifest | null> {
  const path = formAttachmentCleanupPath(siteId, formId);
  const item = await storage.stat(path);
  if (!item) return null;
  if (item.size > MAX_MANIFEST_BYTES) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
  const bytes = await storage.read(path);
  if (bytes.length !== item.size || bytes.length > MAX_MANIFEST_BYTES) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
  const parsed: unknown = JSON.parse(bytes.toString('utf8'));
  const value = parsed as Partial<Manifest> | null;
  if (!value || value.kind !== KIND || value.siteId !== siteId || value.formId !== formId || !Array.isArray(value.attachments)
    || !value.attachments.every(isFormAttachment) || new Set(value.attachments.map((v) => v.attachmentId)).size !== value.attachments.length) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
  return value as Manifest;
}
/** Durable private manifest survives DB cascade, process termination, and partial cleanup. */
export async function prepareFormAttachmentDeletion(siteId: string, formId: string, repositories: Repositories | null) {
  const data = await inventory(siteId, repositories);
  const attachments = references(data.submissions.filter((v) => v.formId === formId));
  references(data.contacts.filter((v) => v.formId === formId), attachments);
  // Forms with no files do not acquire a dependency on attachment provider setup.
  if (!attachments.size) return false;
  const storage = await getFormAttachmentStorage();
  const existing = await readManifest(storage, siteId, formId);
  for (const file of existing?.attachments || []) attachments.set(file.attachmentId, file);
  const manifest: Manifest = { kind: KIND, siteId, formId, attachments: [...attachments.values()] };
  const bytes = Buffer.from(JSON.stringify(manifest));
  if (bytes.length > MAX_MANIFEST_BYTES) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_TOO_LARGE', 'The form attachment cleanup requires a smaller deletion batch.');
  const path = formAttachmentCleanupPath(siteId, formId);
  const uploaded = await storage.upload(bytes, { path, mimeType: 'application/json', cacheControl: 'private, no-store' });
  if (uploaded.path !== path || uploaded.size !== bytes.length) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_UNAVAILABLE', 'Unable to persist attachment cleanup before deleting the form.');
  // Read back exact durable bytes before authorizing logical deletion.
  if (!(await storage.read(path)).equals(bytes)) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_UNAVAILABLE', 'Unable to verify attachment cleanup before deleting the form.');
  return true;
}
export async function finishFormAttachmentDeletion(siteId: string, formId: string, repositories: Repositories | null) {
  const storage = await getFormAttachmentStorage();
  const manifest = await readManifest(storage, siteId, formId);
  if (!manifest) return { found: false, cleanupPending: false, remainingAttachments: 0 };
  const data = await inventory(siteId, repositories);
  // DB failure or process interruption before cascade: live form/files must remain intact.
  if (data.forms.some((form) => form.id === formId)) return { found: true, cleanupPending: true, remainingAttachments: manifest.attachments.length };
  const live = references([data.forms, data.submissions, data.contacts, data.other]);
  let remainingAttachments = 0;
  for (const file of manifest.attachments) {
    if (live.has(file.attachmentId)) { remainingAttachments++; continue; }
    await storage.delete(formAttachmentPath(siteId, formId, file.attachmentId));
  }
  if (!remainingAttachments) await storage.delete(formAttachmentCleanupPath(siteId, formId));
  return { found: true, cleanupPending: remainingAttachments > 0, remainingAttachments };
}

/** Keep the site authorization boundary until every private job has completed. */
export async function assertSiteFormAttachmentsDeleted(siteId: string, repositories: Repositories | null) {
  const data = await inventory(siteId, repositories);
  if (references([data.forms, data.submissions, data.contacts, data.other]).size) throw new FormAttachmentLifecycleError(
    'SITE_FORM_ATTACHMENTS_REMAIN', 'Delete forms containing private attachments and remove any surviving contact or content references, then retry site deletion.',
  );
  const jobs = await listPendingFormAttachmentCleanup(siteId);
  if (jobs.length) throw new FormAttachmentLifecycleError('SITE_FORM_ATTACHMENT_CLEANUP_PENDING', `Private attachment cleanup is pending for forms: ${jobs.slice(0, 5).map((job) => job.formId).join(', ')}${jobs.length > 5 ? ' (and additional forms)' : ''}. Repeat their authorized DELETE requests before deleting this site.`);
}

export async function listPendingFormAttachmentCleanup(siteId: string) {
  const storage = await getFormAttachmentStorage();
  const jobs = await storage.list(siteCleanupPrefix(siteId));
  // Existing remote list adapters have one page. A full page cannot certify completeness.
  if (jobs.length >= (storage.provider === 'supabase' ? 100 : 1000)) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_INVENTORY_UNAVAILABLE', 'Unable to verify the complete private attachment cleanup queue.');
  const summaries: { formId: string; attachmentCount: number }[] = [];
  for (const job of jobs) {
    if (job.size > MAX_MANIFEST_BYTES) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
    const bytes = await storage.read(job.path);
    if (bytes.length > MAX_MANIFEST_BYTES) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
    const candidate = JSON.parse(bytes.toString('utf8')) as Partial<Manifest>;
    if (typeof candidate.formId !== 'string' || !candidate.formId || candidate.formId.length > 200 || job.path !== formAttachmentCleanupPath(siteId, candidate.formId)) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
    const manifest = await readManifest(storage, siteId, candidate.formId);
    if (!manifest) throw new FormAttachmentLifecycleError('FORM_ATTACHMENT_CLEANUP_INVALID', 'The pending attachment cleanup cannot be verified.');
    summaries.push({ formId: manifest.formId, attachmentCount: manifest.attachments.length });
  }
  return summaries;
}
