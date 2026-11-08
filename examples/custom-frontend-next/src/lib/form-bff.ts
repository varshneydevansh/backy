import { NextRequest } from 'next/server';
import { buildBackyFormSubmissionInput, type BackyFormDefinition } from './backy-client';
import { boundedContentBytes, contentFailure, contentId, contentJson, contentRecord, fetchWebsiteContent, parseContentJson, requireContentPayload, websiteContentContext, WebsiteContentError } from './content-bff';
const limits = { maxFiles: 5, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024, maxRequestBytes: 4 * 1024 * 1024 + 256 * 1024 };
function rejectReferences(input: unknown) {
  const stack = [input]; let count = 0;
  while (stack.length) { const value = stack.pop(); if (++count > 5000) throw new WebsiteContentError(413, 'FORM_VALUES_TOO_COMPLEX', 'Form values exceed their traversal limit.'); if (!value || typeof value !== 'object') continue; if (contentRecord(value).kind === 'backy.form.attachment.v1') throw new WebsiteContentError(400, 'FORGED_FORM_ATTACHMENT', 'Upload actual file bytes; do not submit saved attachment references.'); stack.push(...Object.values(value)); }
}
export function publicFormDefinition(raw: unknown) {
  const form = contentRecord(raw), settings = contentRecord(form.settings);
  return { id: form.id, name: form.name, audience: form.audience, isActive: form.isActive, fields: Array.isArray(form.fields) ? form.fields : [], enableHoneypot: form.enableHoneypot === true, enableCaptcha: form.enableCaptcha === true, frontendFieldKeyMap: contentRecord(form.frontendFieldKeyMap), settings: { frontendFieldKeyMap: contentRecord(settings.frontendFieldKeyMap) }, successMessage: typeof form.successMessage === 'string' ? form.successMessage : '' };
}
export async function websiteFormDefinition(request: NextRequest) {
  try {
    const context = await websiteContentContext(request), id = contentId(new URL(request.url).searchParams.get('formId'));
    const payload = await requireContentPayload(await fetchWebsiteContent(context, `/forms/${encodeURIComponent(id)}/definition`));
    return contentJson({ success: true, data: { form: publicFormDefinition(contentRecord(payload.data).form), fileLimits: limits } });
  } catch (error) { return contentFailure(error); }
}
export async function websiteFormSubmission(request: NextRequest) {
  try {
    const context = await websiteContentContext(request), contentType = request.headers.get('content-type') || '', multipart = contentType.toLowerCase().startsWith('multipart/form-data');
    const bytes = await boundedContentBytes(request, multipart ? limits.maxRequestBytes : 256 * 1024);
    let source: Record<string, any>, parts: FormData | undefined;
    if (multipart || contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      try { parts = await new Request(request.url, { method: 'POST', headers: { 'content-type': contentType }, body: new Uint8Array(bytes) }).formData(); } catch { throw new WebsiteContentError(400, 'INVALID_FORM_MULTIPART', 'Unable to read form parts.'); }
      if (parts.has('payload')) { const payload = parts.get('payload'); if (typeof payload !== 'string' || Buffer.byteLength(payload) > 256 * 1024) throw new WebsiteContentError(400, 'INVALID_FORM_MULTIPART', 'Use a JSON text payload part.'); source = parseContentJson(Buffer.from(payload)); }
      else { source = Object.create(null); let textBytes = 0; for (const [key,value] of parts) if (typeof value === 'string') { textBytes += Buffer.byteLength(key) + Buffer.byteLength(value); if (textBytes > 256*1024) throw new WebsiteContentError(413, 'FORM_TEXT_LIMIT_EXCEEDED', 'Form text must fit within 256 KiB.'); source[key] = source[key] === undefined ? value : [...(Array.isArray(source[key]) ? source[key] : [source[key]]), value]; } }
      if (parts.has('payload')) for (const [key,value] of parts) if (key !== 'payload' && typeof value === 'string') throw new WebsiteContentError(400, 'INVALID_FORM_MULTIPART', 'Put text fields inside the JSON payload.');
    } else if (contentType.toLowerCase().startsWith('application/json')) source = parseContentJson(bytes);
    else throw new WebsiteContentError(415, 'FORM_TRANSPORT_REQUIRED', 'Use JSON or a multipart form.');
    rejectReferences(source);
    const formId = contentId(source.formId);
    const definition = await requireContentPayload(await fetchWebsiteContent(context, `/forms/${encodeURIComponent(formId)}/definition`)), form = contentRecord(contentRecord(definition.data).form);
    if (form.audience === 'adminOnly') throw new WebsiteContentError(403, 'FORM_OPERATOR_ONLY', 'This form is reserved for Backy operators.');
    if (form.isActive === false) throw new WebsiteContentError(403, 'FORM_INACTIVE', 'This form is not accepting submissions.');
    const valuesSource = source.values && typeof source.values === 'object' && !Array.isArray(source.values) ? source.values : source;
    for (const field of Array.isArray(form.fields) ? form.fields : []) if (field.type === 'file' && valuesSource[field.key] !== undefined && valuesSource[field.key] !== null && valuesSource[field.key] !== '') throw new WebsiteContentError(400, 'FORM_FILE_BYTES_REQUIRED', 'Upload actual bytes for file fields.');
    const input = buildBackyFormSubmissionInput(form as BackyFormDefinition, valuesSource, { includeUnmappedValues: false, startedAt: typeof source.startedAt === 'string' || typeof source.startedAt === 'number' ? source.startedAt : undefined });
    const payload: Record<string, unknown> = { values: input.values, ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}) };
    for (const key of ['honeypot','captchaToken','pageId','postId','requestId']) if (typeof source[key] === 'string') payload[key] = source[key];
    let outgoing: FormData | undefined, total = 0, count = 0;
    const fields = Array.isArray(form.fields) ? form.fields : [], aliases = { ...contentRecord(contentRecord(form.settings).frontendFieldKeyMap), ...contentRecord(form.frontendFieldKeyMap) };
    if (parts) for (const [key,value] of parts) {
      if (typeof value === 'string' || !value.size && !value.name) continue;
      const field = fields.find((candidate: any) => candidate.key === key || candidate.key === aliases[key]);
      if (!field || field.type !== 'file') throw new WebsiteContentError(400, 'UNDECLARED_FORM_FILE', 'Use a declared file field.');
      if (value.size <= 0) throw new WebsiteContentError(400, 'EMPTY_FORM_FILE', 'Uploaded files must not be empty.');
      total += value.size; count++; if (count > limits.maxFiles || value.size > limits.maxFileBytes || total > limits.maxTotalBytes) throw new WebsiteContentError(413, 'FORM_FILE_LIMIT_EXCEEDED', 'Use at most five files and 4 MiB in total.');
      outgoing ||= new FormData(); outgoing.append(field.key, value, value.name);
    }
    if (outgoing) { for (const field of fields.filter((candidate: any) => candidate.type === 'file')) delete input.values[field.key]; outgoing.set('payload', JSON.stringify(payload)); }
    const submitted = await requireContentPayload(await fetchWebsiteContent(context, `/forms/${encodeURIComponent(formId)}/submissions`, { method: 'POST', body: outgoing || JSON.stringify(payload) }));
    const data = contentRecord(submitted.data), submission = contentRecord(data.submission || submitted.submission);
    return contentJson({ success: true, data: { submissionId: submission.id, status: data.status || submitted.status, message: typeof data.message === 'string' ? data.message : typeof submitted.message === 'string' ? submitted.message : 'Submission received.' } });
  } catch (error) { return contentFailure(error); }
}
