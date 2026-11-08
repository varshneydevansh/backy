import { createHash } from 'node:crypto';
import { serializeTemplateRevisionValue, type Site, type BackyTemplateRevision, type BackyTemplateRevisionCommitInput } from '@backy-cms/core';
import { commitDemoFrontendDesign, getTemplateRevision, listTemplateRevisions } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';

export const templateRevisionFingerprint = (value: unknown) => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
export const templateHistoryError = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });
export async function persistFrontendDesignWithHistory(site: Pick<Site, 'id' | 'settings'>, frontendDesign: NonNullable<Site['settings']['frontendDesign']>,
  context: Pick<BackyTemplateRevisionCommitInput, 'source' | 'actorId' | 'requestId' | 'restoredFromRevisionId'>) {
  const input = { siteId: site.id, expectedDesignFingerprint: templateRevisionFingerprint(site.settings?.frontendDesign ?? null), frontendDesign, ...context };
  return shouldUseDemoStoreFallback() ? commitDemoFrontendDesign(input) as unknown as Site : (await getRequiredDatabaseRepositories()).templateRevisions.commitDesign(input);
}
export async function listRetainedTemplateRevisions(siteId: string, templateId: string | undefined, options: { limit?: number; offset?: number }) {
  return shouldUseDemoStoreFallback() ? listTemplateRevisions(siteId, templateId, options) : (await getRequiredDatabaseRepositories()).templateRevisions.list({ siteId, templateId, ...options });
}
export async function getRetainedTemplateRevision(siteId: string, templateId: string, revisionId: string): Promise<BackyTemplateRevision | null> {
  return shouldUseDemoStoreFallback() ? getTemplateRevision(siteId, templateId, revisionId) : (await getRequiredDatabaseRepositories()).templateRevisions.get(siteId, templateId, revisionId);
}
/** Restore exactly one stored template, leaving unrelated current design and templates intact. */
export function restoredTemplateDesign(site: Pick<Site, 'id' | 'settings'>, revision: BackyTemplateRevision, expectedDesignFingerprint: string, updatedAt: string) {
  const current = site.settings.frontendDesign;
  if (!current || templateRevisionFingerprint(current) !== expectedDesignFingerprint) throw templateHistoryError(409, 'TEMPLATE_HISTORY_CONFLICT', 'The site design changed. Reload template history before restoring.');
  if (revision.siteId !== site.id || revision.templateId !== revision.snapshot.id || revision.fingerprint !== templateRevisionFingerprint(revision.snapshot)) throw templateHistoryError(500, 'INVALID_TEMPLATE_REVISION', 'Stored template revision failed its integrity check.');
  const snapshot = JSON.parse(JSON.stringify(revision.snapshot)) as typeof revision.snapshot;
  if (snapshot.isDefault && current.templates.some(template => template.id !== snapshot.id && template.type === snapshot.type && template.isDefault)) throw templateHistoryError(409, 'TEMPLATE_DEFAULT_CONFLICT', 'Another template is now the default for this content type. Change that default before restoring this revision.');
  const metadata = snapshot.content?.metadata && typeof snapshot.content.metadata === 'object' && !Array.isArray(snapshot.content.metadata) ? snapshot.content.metadata : {};
  snapshot.updatedAt = updatedAt;
  snapshot.content = { ...snapshot.content, metadata: { ...metadata, frontendDesignTemplateRestoredFromRevisionId: revision.id, frontendDesignTemplateRestoredAt: updatedAt } };
  const templates = current.templates.some(template => template.id === snapshot.id)
    ? current.templates.map(template => template.id === snapshot.id ? snapshot : template) : [...current.templates, snapshot];
  return { ...current, templates, updatedAt };
}
