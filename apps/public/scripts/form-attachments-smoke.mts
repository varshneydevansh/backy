import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, unknown>) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, FormData, Buffer, URL, Uint8Array, process, crypto: { randomUUID }, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : require(id) }, { filename });
  return module.exports;
}
const transportModule = load('../src/lib/formSubmissionTransport.ts', {});
const { buildFormSubmissionTransport } = transportModule;
const pagination = load('../src/lib/collectionExportPagination.ts', {});
const site = { id: 'site-form-bytes', isPublished: true, settings: {} };
const form = { id: 'form-bytes', siteId: site.id, isActive: true, audience: 'public', fields: [{ key: 'message', type: 'text' }, { key: 'attachment', type: 'file' }], moderationMode: 'manual', settings: {}, notificationWebhook: null };
const page = (rows: any[], input: any) => { const limit = Math.min(input.limit, 100); return { items: rows.slice(input.offset, input.offset + limit), pagination: { total: rows.length, limit, offset: input.offset, hasMore: input.offset + limit < rows.length } }; };
class MediaSafetyError extends Error {}
class FormAttachmentStorageError extends Error {}
async function fixture(options: any = {}) {
  const objects = new Map<string, Buffer>();
  const scanned: Buffer[] = []; const removed: string[] = []; const submissions: any[] = [];
  let uploads = 0, downloads = 0;
  const storage = { provider: 'local', upload: async (bytes: Buffer, input: any) => {
    uploads++; objects.set(input.path, Buffer.from(bytes));
    if (options.storageFailureAt === uploads) throw new Error('private provider failure');
    return { path: input.path, size: bytes.length, url: 'never-public-provider-url' };
  }, delete: async (path: string) => { removed.push(path); objects.delete(path); }, read: async (path: string) => { downloads++; const bytes = objects.get(path); if (!bytes) throw new Error('missing'); return Buffer.from(bytes); } };
  const privateStorage = { FormAttachmentStorageError, getFormAttachmentStorage: async () => {
    if (options.storageUnconfigured) throw new FormAttachmentStorageError('Private storage is not configured.');
    return storage;
  } };
  const helpers = load('../src/lib/formAttachments.ts', {
    './mediaSafety': { scanMediaUploadWithProviders: async (input: any) => { scanned.push(Buffer.from(input.buffer)); if (options.scanFailure || options.scanFailureAt === scanned.length) throw new MediaSafetyError('unsafe'); } },
    './mediaUploadPolicy': { resolveMediaUploadPolicy: () => ({ maxUploadBytes: options.filePolicyLimit || 20 * 1024 * 1024, quotaBytes: options.quota || 500 * 1024 * 1024 }), isUploadAllowedByFileType: () => options.fileTypeAllowed !== false, readMediaBillingLimit: () => ({ blocked: !!options.billingBlocked }) },
    './formAttachmentStorage': privateStorage,
    './formSubmissionTransport': transportModule,
  });
  const settings = { integrations: { notifications: { email: { formSubmission: false } } } };
  const storedRows = options.existingSubmissions || [];
  const media = options.media || [];
  const repository = {
    sites: { getById: async () => options.unpublished ? { ...site, isPublished: false } : site },
    forms: { getById: async () => uploads && options.recheckGone ? null : uploads && options.recheckInactive ? { ...form, isActive: false } : uploads && options.recheckAudience ? { ...form, audience: 'members' } : uploads && options.recheckSite ? { ...form, siteId: 'other-site' } : options.inactive ? { ...form, isActive: false } : form, listSubmissions: async (input: any) => options.inventoryFailure ? { ...page(storedRows, input), items: [] } : page(storedRows, input), getSubmissionById: async () => options.wrongSubmission || submissions[0], createSubmission: async (input: any) => {
      if (options.persistenceFailure) throw new Error('private database failure');
      const item = { ...input, id: 'submission-stored', submittedAt: new Date().toISOString() }; submissions.push(item); return { item };
    } }, media: { list: async (input: any) => page(media, input) }, settings: { get: async () => settings },
  };
  const mocks = {
    'next/server': { NextResponse }, '@/lib/formAttachments': helpers, '@/lib/formAttachmentStorage': privateStorage, '@/lib/mediaSafety': { MediaSafetyError }, '@/lib/collectionExportPagination': pagination,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => !!options.demo, getRequiredDatabaseRepositories: async () => repository },
    '@/lib/adminAccess': { requireAdminAccess: async (_request: any, _requestId: any, input: any) => { assert.equal(input.permission, 'forms.view'); return options.denied ? NextResponse.json({ success: false }, { status: 403 }) : { session: { user: { id: 'owner' } } }; } },
    '@/lib/visitor-auth/routes': { VisitorAccessError: class extends Error {} },
    '@/lib/publicFormAudienceAccess': { requirePublicFormAudienceAccess: async () => options.audienceDenied ? NextResponse.json({ success: false }, { status: 401 }) : null },
    '@/lib/formCaptcha': { verifyFormCaptcha: async () => ({ ok: !options.captchaFailure, errorCode: 'CAPTCHA_FAILED' }) },
    '@/lib/frontendDesignContract': { frontendFormFieldKeyMapFromMetadata: () => ({ upload_alias: 'attachment' }) },
    '@/lib/publicContractResponse': { publicContractJson: (body: any, input: any) => NextResponse.json(body, { status: input.status || 200 }) },
    '@/lib/backyStore': { getSiteByIdOrSlug: () => site, getFormById: () => uploads && options.recheckGone ? null : uploads && options.recheckInactive ? { ...form, isActive: false } : uploads && options.recheckAudience ? { ...form, audience: 'members' } : uploads && options.recheckSite ? { ...form, siteId: 'other-site' } : options.captchaFailure ? { ...form, enableCaptcha: true } : form, normalizeFormSubmissionValues: (_form: any, values: any) => values,
      validateAndClassifyFormSubmission: () => ({ ok: !options.spam, status: options.spam ? 'spam' : 'pending', validation: [], spamFlags: [] }), getAdminSettings: () => settings,
      listFormsBySite: () => [form], listFormSubmissions: (_id: any, input: any) => { const result = page(storedRows, input); return { data: result.items, pagination: result.pagination }; }, getMediaList: (_id: any, input: any) => { const result = page(media, input); return { media: result.items, pagination: result.pagination }; },
      createFormSubmission: (input: any) => { if (options.persistenceFailure) throw new Error('private database failure'); const item = { ...input, id: 'submission-stored', submittedAt: new Date().toISOString() }; submissions.push(item); return item; }, getSubmissionById: () => options.wrongSubmission || submissions[0] },
  };
  if (options.captchaFailure) repository.forms.getById = async () => ({ ...form, enableCaptcha: true });
  const endpoint = load('../src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts', mocks);
  const download = load('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/attachments/[attachmentId]/route.ts', mocks);
  return { objects, scanned, removed, submissions, helpers, uploads: () => uploads, downloads: () => downloads,
    post: async (request: Request) => { const response = await endpoint.POST(request, { params: Promise.resolve({ siteId: site.id, formId: form.id }) }); return { response, status: response.status, body: await response.json() }; },
    download: async (attachmentId: string, extra: any = {}) => download.GET(new Request('http://fixture.invalid/api/admin/sites/site-form-bytes/forms/form-bytes/submissions/submission-stored/attachments/file', { headers: { 'x-request-id': 'download-check' } }), { params: Promise.resolve({ siteId: site.id, formId: form.id, submissionId: 'submission-stored', attachmentId, ...extra }) }),
  };
}
function multipart(files: { key?: string; bytes?: Uint8Array | string; name?: string }[] = [{ bytes: 'actual visitor bytes' }], payload: any = { values: { message: 'Hello' }, startedAt: 0 }) {
  const data = new FormData(); data.set('payload', JSON.stringify(payload));
  for (const file of files) data.append(file.key || 'attachment', new Blob([file.bytes || 'file bytes'], { type: 'text/plain' }), file.name || 'note.txt');
  return new Request('http://fixture.invalid/api/sites/site-form-bytes/forms/form-bytes/submissions', { method: 'POST', body: data });
}
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) { try { await run(); passed++; } catch (error) { failures.push(`${name}: ${String(error)}`); } }
for (const demo of [false, true]) for (const change of ['recheckGone','recheckInactive','recheckAudience','recheckSite']) await check(`final form admission ${demo}/${change}`, async () => {
  const f = await fixture({ demo, [change]: true }); const result = await f.post(multipart());
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'FORM_ATTACHMENT_FORM_UNAVAILABLE');
  assert.equal(f.submissions.length, 0); assert.equal(f.objects.size, 0); assert.equal(f.removed.length, 1);
});
for (const demo of [false, true]) await check(`actual multipart bytes survive ${demo ? 'demo' : 'repository'} submission and authorized download`, async () => {
  const test = await fixture({ demo }); const result = await test.post(multipart()); assert.equal(result.status, 201); assert.equal(test.scanned[0].toString(), 'actual visitor bytes'); assert.equal([...test.objects.values()][0].toString(), 'actual visitor bytes');
  const attachment = result.body.submission.values.attachment[0]; assert.equal(attachment.kind, 'backy.form.attachment.v1'); assert.equal(attachment.filename, 'note.txt'); assert.equal(attachment.sizeBytes, 20);
  assert(!JSON.stringify(result.body).includes('never-public')); assert(!JSON.stringify(result.body).includes('form-attachments/sites/')); assert(!JSON.stringify(result.body).includes('[object File]'));
  const downloaded = await test.download(attachment.attachmentId); assert.equal(downloaded.status, 200); assert.equal(await downloaded.text(), 'actual visitor bytes'); assert.equal(downloaded.headers.get('content-type'), 'application/octet-stream'); assert.equal(downloaded.headers.get('cache-control'), 'private, no-store'); assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff'); assert(downloaded.headers.get('content-disposition')?.startsWith('attachment;'));
});
await check('text-only JSON submissions are preserved', async () => { const test = await fixture(); const result = await test.post(new Request('http://fixture.invalid/form', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: { message: ['a', 'b'] } }) })); assert.equal(result.status, 201); assert.deepEqual(result.body.submission.values.message, ['a', 'b']); assert.equal(test.uploads(), 0); });
await check('multiple uploaded bytes and frontend aliases are supported', async () => { const test = await fixture(); const result = await test.post(multipart([{ key: 'upload_alias', bytes: 'one' }, { bytes: 'two' }])); assert.equal(result.status, 201); assert.equal(result.body.submission.values.attachment.length, 2); assert.deepEqual(test.scanned.map((buffer) => buffer.toString()), ['one', 'two']); });
await check('native multipart text and files work without a JSON payload envelope', async () => { const data = new FormData(); data.set('message', 'Native form text'); data.append('attachment', new Blob(['native file bytes'], { type: 'text/plain' }), 'native.txt'); const test = await fixture(); const result = await test.post(new Request('http://fixture.invalid/form', { method: 'POST', body: data })); assert.equal(result.status, 201); assert.equal(result.body.submission.values.message, 'Native form text'); assert.equal(test.scanned[0].toString(), 'native file bytes'); });
await check('failure scanning a later file cannot persist an earlier clean file', async () => { const test = await fixture({ scanFailureAt: 2 }); const result = await test.post(multipart([{ bytes: 'clean' }, { bytes: 'unsafe' }])); assert.equal(result.status, 415); assert.equal(test.scanned.length, 2); assert.equal(test.uploads(), 0); assert.equal(test.submissions.length, 0); });
for (const options of [{ scanFailure: true }, { spam: true }, { captchaFailure: true }, { audienceDenied: true }, { inactive: true }, { unpublished: true }, { fileTypeAllowed: false }, { filePolicyLimit: 2 }, { billingBlocked: true }]) await check('validation, access, site, scanner and upload policy gates prevent storage', async () => { const test = await fixture(options); const result = await test.post(multipart()); assert(result.status >= 400); assert.equal(test.uploads(), 0); assert.equal(test.submissions.length, 0); });
for (const options of [{ storageFailureAt: 2 }, { persistenceFailure: true }]) await check('partial storage or submission failure cleans every attachment', async () => { const test = await fixture(options); const result = await test.post(multipart([{ bytes: 'one' }, { bytes: 'two' }])); assert(result.status >= 400); assert.equal(test.submissions.length, 0); assert.equal(test.objects.size, 0); assert.equal(test.removed.length, 2); });
await check('unconfigured private storage fails closed', async () => { const test = await fixture({ storageUnconfigured: true }); const result = await test.post(multipart()); assert.equal(result.status, 503); assert.equal(result.body.error.code, 'FORM_ATTACHMENT_STORAGE_NOT_CONFIGURED'); assert.equal(test.submissions.length, 0); });
await check('undeclared file fields are rejected', async () => { const test = await fixture(); const result = await test.post(multipart([{ key: 'message' }])); assert.equal(result.status, 400); assert.equal(test.uploads(), 0); });
await check('file count and per-file byte caps precede scans and persistence', async () => { for (const files of [Array.from({ length: 6 }, () => ({ bytes: 'x' })), [{ bytes: new Uint8Array(10 * 1024 * 1024 + 1) }]]) { const test = await fixture(); const result = await test.post(multipart(files)); assert.equal(result.status, 413); assert.equal(test.scanned.length, 0); assert.equal(test.submissions.length, 0); } });
await check('empty uploaded files cannot create placeholder attachments', async () => { const test = await fixture(); const result = await test.post(multipart([{ bytes: new Uint8Array(0), name: 'empty.txt' }])); assert.equal(result.status, 400); assert.equal(test.uploads(), 0); assert.equal(test.submissions.length, 0); });
await check('aggregate bytes are capped even when each file fits the per-file limit', async () => { const test = await fixture(); const result = await test.post(multipart(Array.from({ length: 3 }, () => ({ bytes: new Uint8Array(1.5 * 1024 * 1024) })))); assert.equal(result.status, 413); assert.equal(test.scanned.length, 0); });
await check('oversized multipart text cannot bypass the JSON text limit', async () => { const test = await fixture(); const data = new FormData(); data.set('message', 'x'.repeat(256 * 1024 + 1)); const result = await test.post(new Request('http://fixture.invalid/form', { method: 'POST', body: data })); assert.equal(result.status, 413); assert.equal(test.submissions.length, 0); });
await check('stream byte cap applies when content-length is absent', async () => { const test = await fixture(); const request = new Request('http://fixture.invalid/form', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: new Uint8Array(21 * 1024 * 1024) }); const result = await test.post(request); assert.equal(result.status, 413); assert.equal(test.uploads(), 0); });
await check('JSON and multipart forged attachment refs are rejected', async () => { const forged = { kind: 'backy.form.attachment.v1', id: randomUUID(), attachmentId: randomUUID(), filename: 'other-file', sizeBytes: 1 }; for (const request of [new Request('http://fixture.invalid/form', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: { attachment: [forged] } }) }), multipart([], { values: { attachment: forged } })]) { const test = await fixture(); const result = await test.post(request); assert.equal(result.status, 400); assert.equal(result.body.error.code, 'FORGED_FORM_ATTACHMENT'); assert.equal(test.submissions.length, 0); } });
await check('quota uses complete capped site media inventory', async () => { const test = await fixture({ quota: 1100, media: Array.from({ length: 205 }, (_, index) => ({ id: `media-${index}`, siteId: site.id, sizeBytes: 10 })) }); const result = await test.post(multipart()); assert.equal(result.status, 413); assert.equal(test.scanned.length, 0); });
await check('existing private form attachments count against site quota', async () => { const id = randomUUID(); const test = await fixture({ quota: 30, existingSubmissions: [{ id: 'older', siteId: site.id, formId: form.id, submittedAt: '2020-01-01', values: { attachment: [{ kind: 'backy.form.attachment.v1', id, attachmentId: id, filename: 'old.txt', mimeType: 'text/plain', sizeBytes: 20 }] } }] }); const result = await test.post(multipart()); assert.equal(result.status, 413); assert.equal(test.uploads(), 0); });
await check('incomplete quota inventory fails closed', async () => { const test = await fixture({ inventoryFailure: true, existingSubmissions: [{ id: 'unread', siteId: site.id }] }); const result = await test.post(multipart()); assert.equal(result.status, 503); assert.equal(result.body.error.code, 'FORM_ATTACHMENT_QUOTA_UNAVAILABLE'); assert.equal(test.uploads(), 0); });
await check('attachment attempts are rate limited before additional storage', async () => { const test = await fixture({ scanFailure: true }); for (let index = 0; index < 5; index++) assert.equal((await test.post(multipart())).status, 415); const result = await test.post(multipart()); assert.equal(result.status, 429); assert.equal(test.scanned.length, 5); assert.equal(test.uploads(), 0); });
await check('persisted attachment submissions enforce the rate limit across process windows', async () => { const id = randomUUID(); const test = await fixture({ existingSubmissions: Array.from({ length: 5 }, (_, index) => ({ id: `recent-${index}`, siteId: site.id, formId: form.id, ipHash: null, submittedAt: new Date().toISOString(), values: { attachment: [{ kind: 'backy.form.attachment.v1', id, attachmentId: id, filename: 'recent.txt', mimeType: 'text/plain', sizeBytes: 1 }] } })) }); const result = await test.post(multipart()); assert.equal(result.status, 429); assert.equal(test.scanned.length, 0); assert.equal(test.uploads(), 0); });
for (const wrongSubmission of [{ id: 'submission-stored', siteId: 'private-other-site', formId: form.id, values: {} }, { id: 'submission-stored', siteId: site.id, formId: 'other-form', values: {} }, { id: 'other-submission', siteId: site.id, formId: form.id, values: {} }]) await check('download rejects mismatched submission scope', async () => { const test = await fixture({ wrongSubmission }); const response = await test.download(randomUUID()); assert.equal(response.status, 404); assert.equal(test.downloads(), 0); });
await check('unavailable attachment and unauthorized download do not read storage', async () => { const test = await fixture(); await test.post(multipart()); assert.equal((await test.download(randomUUID())).status, 404); assert.equal(test.downloads(), 0); const denied = await fixture({ denied: true }); assert.equal((await denied.download(randomUUID())).status, 403); assert.equal(denied.downloads(), 0); });
await check('Canvas transport preserves file bytes and repeated text values', async () => { const data = new FormData(); data.append('message', 'one'); data.append('message', 'two'); data.append('attachment', new Blob(['client bytes'], { type: 'text/plain' }), 'client.txt'); const transport = buildFormSubmissionTransport(data, { startedAt: 123 }); assert.equal(transport.headers, undefined); assert(transport.body instanceof FormData); const file = transport.body.get('attachment'); assert(file && typeof file !== 'string'); assert.equal(await file.text(), 'client bytes'); assert.deepEqual(JSON.parse(String(transport.body.get('payload'))).values.message, ['one', 'two']); const text = new FormData(); text.set('message', 'text only'); assert.equal(buildFormSubmissionTransport(text, {}).headers?.['Content-Type'], 'application/json'); });
await check('Canvas rejects oversized files with the shared hosting-safe limit before fetch', async () => { const data = new FormData(); data.append('attachment', new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]), 'large.txt'); assert.throws(() => buildFormSubmissionTransport(data, {}), transportModule.FormSubmissionTransportError); });
await check('private local adapter stores actual bytes outside public and rejects public-directory configuration', async () => {
  const storageRuntime = await import('@backy/storage');
  const privateRoot = mkdtempSync(join(tmpdir(), 'backy-form-private-'));
  const previous = process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR;
  const storage = load('../src/lib/formAttachmentStorage.ts', { '@backy/storage': storageRuntime, './mediaStorage': { resolveMediaStorageConfig: () => ({ config: { provider: 'local', basePath: join(process.cwd(), 'public', 'uploads'), publicUrl: '/uploads' } }) } });
  try {
    process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR = privateRoot;
    const adapter = await storage.getFormAttachmentStorage();
    await adapter.upload(Buffer.from('private real bytes'), { path: 'test-attachment', filename: 'file.txt' });
    assert.equal(readFileSync(join(privateRoot, 'test-attachment'), 'utf8'), 'private real bytes');
    assert(!existsSync(join(process.cwd(), 'public', 'uploads', 'test-attachment')));
    process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR = join(process.cwd(), 'public', 'forbidden-private');
    await assert.rejects(storage.getFormAttachmentStorage(), storage.FormAttachmentStorageError);
  } finally { if (previous === undefined) delete process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR; else process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR = previous; rmSync(privateRoot, { recursive: true, force: true }); }
});
await check('remote storage cannot silently reuse a public media bucket', async () => {
  const previous = process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET;
  const storage = load('../src/lib/formAttachmentStorage.ts', { '@backy/storage': {}, './mediaStorage': { resolveMediaStorageConfig: () => ({ config: { provider: 's3', bucket: 'public-media' } }) } });
  try {
    delete process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET;
    await assert.rejects(storage.getFormAttachmentStorage(), storage.FormAttachmentStorageError);
    process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET = 'public-media';
    await assert.rejects(storage.getFormAttachmentStorage(), storage.FormAttachmentStorageError);
  } finally { if (previous === undefined) delete process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET; else process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET = previous; }
});
if (failures.length) { console.error(failures.join('\n')); throw new Error(`${failures.length} of ${passed + failures.length} form attachment checks failed`); }
console.log(`Form attachment bytes/access boundary checks passed: ${passed}.`);
