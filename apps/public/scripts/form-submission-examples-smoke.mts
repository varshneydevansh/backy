import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const core = require('@backy-cms/core');
function compile(source: string, globals: Record<string, unknown> = {}) {
  const module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require, Request, Buffer, URL, Date, ...globals });
  return module.exports;
}
const adminSource = readFileSync(fileURLToPath(new URL('../../admin/src/routes/forms.tsx', import.meta.url)), 'utf8');
const names = new Set(['FORM_FIELD_TYPES','normalizeFieldKey','formFieldKeySet','normalizeFormCollectionFieldMap','normalizeFormCollectionTarget','normalizeContactShareFieldReference','normalizeFormContactShare','normalizeFormFieldType','normalizeFormFieldOptions','findMatchingFormFieldOption','isValidFormFieldDateDefault','isValidFormFieldTelDefault','normalizeFormFieldDefaultValue','buildSampleContactShareOverride','buildSampleSubmissionPayload','sampleFormFieldValue','buildTemplateManifest']);
const ast = ts.createSourceFile('forms.tsx', adminSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) ? names.has(node.name?.text || '') : ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && names.has(declaration.name.text)));
const admin = compile(declarations.map((node) => node.getText(ast)).join('\n') + '\nmodule.exports={buildSampleSubmissionPayload,buildTemplateManifest};', { buildFormSubmissionExample: core.buildFormSubmissionExample });
const form = { id: 'form-documents', pageId: 'page-work', fields: [{ key: 'email', label: 'Email', type: 'email', required: true }, { key: 'documents', label: 'Documents', type: 'file', required: true, defaultValue: 'old-media-id' }], contactShare: { enabled: true, emailField: 'email', dedupeByEmail: true } };
let passed = 0;
const check = (name: string, action: () => void) => { try { action(); passed++; } catch (error) { throw new Error(`${name}: ${error}`); } };
let sample = admin.buildSampleSubmissionPayload(form);
check('selected-form sample excludes file default references and preserves routing/contacts', () => {
  assert.equal(Object.hasOwn(sample.values, 'documents'), false); assert.equal(sample.values.email, 'ada@example.com'); assert.equal(sample.pageId, form.pageId); assert.equal(sample.contactShareOverride.emailField, 'email');
});
check('template handoff advertises real multipart bytes', () => {
  const manifest = admin.buildTemplateManifest({ ...form, title: 'Documents', pageTemplate: 'contact' });
  assert.equal(manifest.submissionTransport.contentType, 'multipart/form-data'); assert.equal(manifest.submissionTransport.payloadField, 'payload'); assert.equal(manifest.submissionTransport.fileFields[0].key, 'documents'); assert.equal(manifest.submissionTransport.fileFields[0].multiple, true); assert.equal(Object.hasOwn(manifest.samplePayload.values, 'documents'), false);
});
check('plain forms keep JSON handoff', () => {
  const plain = { ...form, fields: form.fields.filter((field) => field.type !== 'file') };
  const example = core.buildFormSubmissionExample({ fields: plain.fields, payload: admin.buildSampleSubmissionPayload(plain), submitUrl: 'https://example.com/forms/text' });
  assert.equal(example.submissionTransport.contentType, 'application/json'); assert.match(example.curl, /content-type: application\/json/); assert.match(example.curl, /--data /); assert.doesNotMatch(example.curl, /--form/);
});
check('UI/handoff share multipart example instead of stale media-ID placeholder', () => {
  assert.doesNotMatch(adminSource, /media_asset_id_or_signed_upload_reference/); assert.match(adminSource, /selectedFormSubmissionExample\?\.submissionTransport/); assert.match(adminSource, /Multipart payload part \(JSON text fields\)/);
});
const transportSource = readFileSync(fileURLToPath(new URL('../src/lib/formSubmissionTransport.ts', import.meta.url)), 'utf8');
const transport = compile(transportSource);
check('handoff limits are the actual transport limits', () => { assert.deepEqual(JSON.parse(JSON.stringify(transport.FORM_SUBMISSION_FILE_LIMITS)), core.BACKY_FORM_SUBMISSION_FILE_LIMITS); });
const attachmentsSource = readFileSync(fileURLToPath(new URL('../src/lib/formAttachments.ts', import.meta.url)), 'utf8');
const attachmentParser = compile(attachmentsSource, { require: (id: string) => id === './formSubmissionTransport' ? transport : id.startsWith('./') ? {} : require(id) });
const scratch = mkdtempSync(join(tmpdir(), 'backy-form-example-'));
const pdfPath = join(scratch, "visitor's file.pdf");
const fileBytes = Buffer.from('%PDF-1.4\nactual example file bytes\n'); writeFileSync(pdfPath, fileBytes);
const captures: any[] = [];
const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = new Request('http://127.0.0.1/example', { method: 'POST', headers: { 'content-type': String(request.headers['content-type']) }, body: new Uint8Array(Buffer.concat(chunks)) });
    const parsed = await attachmentParser.readFormSubmissionRequest(raw, form);
    captures.push({ contentType: request.headers['content-type'], parsed }); response.end('{}');
  } catch (error) { response.statusCode = 400; response.end(String(error)); }
});
try {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  const submitUrl = `http://127.0.0.1:${address.port}/submissions`;
  sample = { ...sample, values: { ...sample.values, message: "quote's $(printf unsafe) `literal`\nsecond line", documents: 'forged-old-url' } };
  const multipart = core.buildFormSubmissionExample({ fields: form.fields, payload: sample, submitUrl, filePaths: { documents: pdfPath } });
  assert.doesNotMatch(multipart.curl, /-H .*content-type/); assert.match(multipart.curl, /--form-string/); assert.match(multipart.curl, /--form /); assert.doesNotMatch(multipart.curl, /forged-old-url/);
  await promisify(execFile)('/bin/sh', ['-c', multipart.curl], { timeout: 5000 });
  assert.equal(captures.length, 1); assert.match(captures[0].contentType, /^multipart\/form-data; boundary=/); assert.equal(captures[0].parsed.raw.values.message, sample.values.message);
  assert.equal(captures[0].parsed.pending[0].fieldKey, 'documents'); assert.equal(captures[0].parsed.pending[0].reference.filename, "visitor's file.pdf"); assert.deepEqual(Buffer.from(await captures[0].parsed.pending[0].file.arrayBuffer()), fileBytes); passed++;
  const plain = core.buildFormSubmissionExample({ fields: form.fields.filter((field) => field.type !== 'file'), payload: { values: { email: 'ada@example.com' }, requestId: 'text-example' }, submitUrl });
  await promisify(execFile)('/bin/sh', ['-c', plain.curl], { timeout: 5000 });
  assert.equal(captures[1].contentType, 'application/json'); assert.equal(captures[1].parsed.pending.length, 0); assert.equal(captures[1].parsed.raw.requestId, 'text-example'); passed++;
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); rmSync(scratch, { recursive: true, force: true }); }
console.log(`Form submission handoff/sample checks passed: ${passed} (including actual cURL multipart bytes and JSON).`);
