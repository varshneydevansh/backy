import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';

// Read the actual operation/schema declarations rather than maintaining test copies.
const text = readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('openapi.ts', text, ts.ScriptTarget.Latest, true);
function declaration(name: string, path = false): any {
  const matches: ts.PropertyAssignment[] = [];
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node)) {
      const key = node.name;
      if (path ? ts.isComputedPropertyName(key) && key.expression.getText(source) === '`/api/admin/sites/${site.id}/' + name + '`'
        : (ts.isStringLiteral(key) || ts.isIdentifier(key)) && key.text === name) matches.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(matches.length, 1, `Exactly one standard declaration for ${name}`);
  return vm.runInNewContext(`(${matches[0].initializer.getText(source)})`);
}
const list = declaration('forms/attachment-cleanup', true).get;
const deletion = declaration('forms/{formId}', true).delete;
const schemas = Object.fromEntries(['FormAttachmentCleanupJob', 'FormAttachmentCleanupEnvelope', 'AdminFormDeleteCompletedEnvelope', 'AdminFormDeletePendingEnvelope', 'ErrorEnvelope'].map(name => [name, declaration(name)]));
const ajv = new Ajv2020({ strict: true, allErrors: true });
for (const [name, schema] of Object.entries(schemas)) ajv.addSchema(schema as object, `#/components/schemas/${name}`);
for (const operation of [list, deletion]) {
  assert.equal(operation['x-backy-permission'], 'forms.delete');
  assert.equal(JSON.stringify(operation.security), JSON.stringify([{ BackyAdminSession: [] }, { BackyAdminKey: [] }]));
  for (const status of ['401', '403', '404', '503']) assert.equal(operation.responses[status].content['application/json'].schema.$ref, '#/components/schemas/ErrorEnvelope');
}
assert.equal(list.operationId, 'listAdminFormAttachmentCleanup');
assert.equal(deletion.operationId, 'deleteAdminForm');
assert.equal(list.parameters, undefined, 'The current queue handler has no pagination query');
assert.equal(list.responses['200'].headers['Cache-Control'].schema.const, 'private, no-store');
assert.equal(JSON.stringify(deletion.parameters), JSON.stringify([{ name: 'formId', in: 'path', required: true, schema: { type: 'string' } }]));
assert.match(list.description, /complete.*503/u);
assert.match(deletion.description, /already gone/u);
assert.match(deletion.description, /surviving.*references/u);
assert.match(deletion.description, /no remaining cleanup manifest returns 404/u);
assert.match(deletion.responses['503'].description, /FORM_DELETE_RECOVERY_REQUIRED/u);

export function assertCleanupBody(kind: 'list' | 'delete', status: number, body: unknown) {
  const operation = kind === 'list' ? list : deletion;
  assert.ok(operation.responses[String(status)], `Documented ${kind} status ${status}`);
  const ref = operation.responses[String(status)].content['application/json'].schema.$ref;
  const validate = ajv.getSchema(ref)!;
  assert.ok(validate(body), `${kind} ${status} matches ${ref}: ${ajv.errorsText(validate.errors)}`);
}
export async function assertCleanupResponse(kind: 'list' | 'delete', response: Response) {
  // Auth fixtures deliberately return empty 403 bodies; real auth coverage lives in RBAC/site-scope tests.
  if (response.status !== 403 && response.status !== 401) assertCleanupBody(kind, response.status, await response.clone().json());
  return response;
}
const completed = { success: true, requestId: 'contract', data: { deleted: true, cleanupPending: false }, deleted: true, cleanupPending: false };
const pending = { ...completed, data: { deleted: true, cleanupPending: true, retry: 'Repeat this authorized DELETE to resume private attachment cleanup.' }, cleanupPending: true };
assertCleanupBody('delete', 200, completed);
assertCleanupBody('delete', 202, pending);
assert.throws(() => assertCleanupBody('delete', 200, pending));
assert.throws(() => assertCleanupBody('delete', 202, completed));
assert.throws(() => assertCleanupBody('delete', 202, { ...pending, data: { deleted: true, cleanupPending: true } }));
assert.throws(() => assertCleanupBody('delete', 202, { ...pending, cleanupPending: false }));
const queue = { success: true, requestId: 'contract', data: { siteId: 'site-proof', jobs: [{ formId: 'form-proof', attachmentCount: 2 }] } };
assertCleanupBody('list', 200, queue);
for (const extra of [{ filename: 'private.txt' }, { storagePath: '/private/file' }, { attachmentCount: -1 }, { attachmentCount: 1.5 }]) {
  assert.throws(() => assertCleanupBody('list', 200, { ...queue, data: { ...queue.data, jobs: [{ ...queue.data.jobs[0], ...extra }] } }));
}
console.log('Form cleanup standard OpenAPI operations and response schema boundaries passed.');
