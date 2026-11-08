import { adminFetch, getAdminApiBase, type FormDefinition } from './adminContentApi';

export interface FormDesignRevisionSummary {
  id: string;
  createdAt: string;
  operation: 'template-upgrade' | 'restore';
  templateId: string | null;
  targetRevisionId: string | null;
  hasPinnedBaseline: boolean;
}
export interface FormDesignVersions {
  siteId: string;
  formId: string;
  currentVersion: string;
  revisions: FormDesignRevisionSummary[];
  pagination: { offset: number; limit: number; hasMore: boolean; nextOffset: number | null };
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): value is string => typeof value === 'string' && /^form-v1:[a-f0-9]{64}$/.test(value);
const base = (siteId: string, formId: string) => `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/forms/${encodeURIComponent(formId)}/design-versions`;
async function result(response: Response, signal: AbortSignal): Promise<Record<string, any>> {
  const payload: unknown = await response.json(); signal.throwIfAborted();
  if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) {
    throw Error(object(payload) && object(payload.error) && typeof payload.error.message === 'string'
      ? payload.error.message : 'Form design history could not load. Reload before retrying.');
  }
  return payload.data;
}
export async function loadFormDesignVersions(siteId: string, formId: string, signal: AbortSignal, request: typeof fetch = adminFetch, options: { offset?: number; limit?: number } = {}): Promise<FormDesignVersions> {
  signal.throwIfAborted();
  const offset = options.offset ?? 0, limit = options.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('Choose a valid design history page.');
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const data = await result(await request(`${base(siteId, formId)}?${query}`, { method: 'GET', credentials: 'include', signal }), signal);
  if (data.siteId !== siteId || data.formId !== formId || !version(data.currentVersion) || !Array.isArray(data.revisions)) throw Error('Form design history is incompatible. Reload the form.');
  if (!object(data.pagination) || data.pagination.offset !== offset || data.pagination.limit !== limit || data.revisions.length > limit
    || typeof data.pagination.hasMore !== 'boolean' || (data.pagination.hasMore ? data.revisions.length !== limit || data.pagination.nextOffset !== offset + limit : data.pagination.nextOffset !== null)) throw Error('Form design history pagination is incompatible. Reload the form.');
  const ids = new Set<string>();
  for (const row of data.revisions) {
    if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
      || !['template-upgrade', 'restore'].includes(row.operation) || typeof row.hasPinnedBaseline !== 'boolean'
      || !(row.templateId === null || typeof row.templateId === 'string') || !(row.targetRevisionId === null || typeof row.targetRevisionId === 'string')) throw Error('Form design history contains incompatible revisions. Reload the form.');
    ids.add(row.id);
  }
  return data as unknown as FormDesignVersions;
}
export async function restoreFormDesignVersion(siteId: string, formId: string, revisionId: string, expectedVersion: string, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<{ form: FormDefinition; completionWarnings: string[] }> {
  signal.throwIfAborted();
  if (!version(expectedVersion)) throw Error('Reload the current form before restoring its design.');
  const data = await result(await request(`${base(siteId, formId)}/${encodeURIComponent(revisionId)}/restore`, {
    method: 'POST', credentials: 'include', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion }),
  }), signal);
  if (data.siteId !== siteId || data.formId !== formId || data.restoredFromRevisionId !== revisionId
    || !object(data.form) || data.form.id !== formId || data.form.siteId !== siteId
    || !version(data.form.version) || !Array.isArray(data.form.fields) || !Array.isArray(data.completionWarnings) || data.completionWarnings.some((warning: unknown) => typeof warning !== 'string')) throw Error('Form design restore response is incompatible. Reload the form before continuing.');
  return { form: data.form as FormDefinition, completionWarnings: data.completionWarnings };
}
