/** Preserve file bytes while keeping the existing JSON transport for text-only forms. */
import { BACKY_FORM_SUBMISSION_FILE_LIMITS } from '@backy-cms/core';
export const FORM_SUBMISSION_FILE_LIMITS = BACKY_FORM_SUBMISSION_FILE_LIMITS;
export class FormSubmissionTransportError extends Error {}
export function formSubmissionTextValues(data: FormData) {
  const values: Record<string, unknown> = {};
  data.forEach((value, key) => {
    if (typeof value !== 'string') return;
    const existing = values[key];
    values[key] = existing === undefined ? value : [...(Array.isArray(existing) ? existing : [existing]), value];
  });
  return values;
}
export function buildFormSubmissionTransport(data: FormData, metadata: Record<string, unknown>) {
  const values = formSubmissionTextValues(data);
  const files: { key: string; file: File }[] = [];
  data.forEach((value, key) => { if (typeof value !== 'string' && (value.size || value.name)) files.push({ key, file: value }); });
  if (files.some(({ file }) => file.size <= 0)) throw new FormSubmissionTransportError('Uploaded files must not be empty.');
  if (files.length > FORM_SUBMISSION_FILE_LIMITS.maxFiles || files.some(({ file }) => file.size > FORM_SUBMISSION_FILE_LIMITS.maxFileBytes)
    || files.reduce((total, { file }) => total + file.size, 0) > FORM_SUBMISSION_FILE_LIMITS.maxTotalBytes) throw new FormSubmissionTransportError('Use at most 5 files and 4 MB in total.');
  const body = { values, ...metadata };
  if (!files.length) return { values, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const multipart = new FormData();
  multipart.set('payload', JSON.stringify(body));
  for (const { key, file } of files) multipart.append(key, file, file.name);
  return { values, headers: undefined, body: multipart };
}
