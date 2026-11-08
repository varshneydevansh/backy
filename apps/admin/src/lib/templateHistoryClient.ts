import type { BackyTemplateRevision } from '@backy-cms/core';
import { adminFetch, getAdminApiBase } from './adminContentApi';
export type TemplateRevisionSummary = Omit<BackyTemplateRevision, 'snapshot'> & { name: string; type: string; version?: string | number; status?: string };
export interface TemplateHistoryResponse {
 siteId: string;
 revisions: Array<BackyTemplateRevision | TemplateRevisionSummary>;
 currentDesignFingerprint: string;
 currentTemplateFingerprint: string;
 pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export async function loadTemplateHistory(siteId: string, templateId: string | undefined, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<TemplateHistoryResponse> {
 const path = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/templates/${templateId ? `${encodeURIComponent(templateId)}/` : ''}revisions`;
 let total: number | undefined, fingerprint: string | undefined;
 const revisions: TemplateHistoryResponse['revisions'] = [], ids = new Set<string>();
 let first: TemplateHistoryResponse | undefined;
 while (true) {
  signal.throwIfAborted();
  const response = await request(`${path}?limit=100&offset=${revisions.length}`, { method: 'GET', credentials: 'include', signal });
  const payload: unknown = await response.json(); signal.throwIfAborted();
  if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) throw new Error(object(payload) && object(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Template history could not load. Try again.');
  const data = payload.data;
  if (data.siteId !== siteId || !Array.isArray(data.revisions) || typeof data.currentDesignFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.currentDesignFingerprint)
   || typeof data.currentTemplateFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.currentTemplateFingerprint) || !object(data.pagination)) throw new Error('Template history returned an invalid response.');
  const pagination = data.pagination;
  if (!Number.isSafeInteger(pagination.total) || Number(pagination.total) < 0 || !Number.isSafeInteger(pagination.limit) || Number(pagination.limit) < 1 || Number(pagination.limit) > 100
   || data.revisions.length > Number(pagination.limit) || pagination.offset !== revisions.length || typeof pagination.hasMore !== 'boolean'
   || total !== undefined && total !== pagination.total || fingerprint !== undefined && fingerprint !== data.currentDesignFingerprint) throw new Error('Template history changed while loading. Reload before restoring.');
  total = Number(pagination.total); fingerprint = data.currentDesignFingerprint;
  first ||= data as unknown as TemplateHistoryResponse;
  for (const revision of data.revisions) {
   if (!object(revision) || typeof revision.id !== 'string' || revision.siteId !== siteId || typeof revision.templateId !== 'string' || ids.has(revision.id)
    || templateId && (revision.templateId !== templateId || !object(revision.snapshot) || revision.snapshot.id !== templateId || typeof revision.snapshot.name !== 'string')
    || !templateId && (typeof revision.name !== 'string' || typeof revision.type !== 'string')) throw new Error('Template history returned inconsistent revisions.');
   ids.add(revision.id); revisions.push(revision as unknown as BackyTemplateRevision);
  }
  if (revisions.length > total || pagination.hasMore !== (revisions.length < total) || pagination.hasMore && data.revisions.length === 0) throw new Error('Template history returned invalid pagination.');
  if (!pagination.hasMore) return { ...first, revisions, pagination: { total, limit: total, offset: 0, hasMore: false } };
 }
}
export async function restoreTemplateRevision(siteId: string, templateId: string, revisionId: string, expectedDesignFingerprint: string, signal: AbortSignal, request: typeof fetch = adminFetch) {
 signal.throwIfAborted();
 const response = await request(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/templates/${encodeURIComponent(templateId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
  { method: 'POST', credentials: 'include', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedDesignFingerprint }) });
 const payload = await response.json(); signal.throwIfAborted();
 if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) throw new Error(object(payload) && object(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Template revision could not restore. Reload history and try again.');
 return payload.data;
}
