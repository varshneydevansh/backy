import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const properties = new Map<string, ts.Expression>(), paths = new Map<string, any>();
let schemas: ts.ObjectLiteralExpression | undefined;
function visit(n: ts.Node) {
  if (ts.isPropertyAssignment(n)) {
    if (n.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(n.initializer)) schemas = n.initializer;
    if (ts.isComputedPropertyName(n.name) && n.name.expression.getText(source).startsWith('`/api/admin/sites/${site.id}/media') && ts.isObjectLiteralExpression(n.initializer)) {
      const path = n.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
      paths.set(path, vm.runInNewContext(`(${n.initializer.getText(source)})`));
    }
  }
  ts.forEachChild(n, visit);
}
visit(source); assert.ok(schemas);
for (const p of schemas.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) properties.set(p.name.text, p.initializer);
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false }), loaded = new Set<string>();
function register(name: string) {
  if (loaded.has(name)) return; loaded.add(name);
  const expression = properties.get(name); assert.ok(expression, `Actual schema ${name}`);
  const schema = vm.runInNewContext(`(${expression.getText(source)})`, { envelopeSchema: (data: any) => ({ type: 'object', required: ['success', 'requestId', 'data'], properties: { success: { type: 'boolean' }, requestId: { type: 'string' }, data } }) });
  for (const ref of JSON.stringify(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/gu)) register(ref[1]);
  ajv.addSchema(schema, '#/components/schemas/' + name);
}
export function operation(path: string, method: string) {
  const op = paths.get('/api/admin/sites/{siteId}/media' + path)?.[method.toLowerCase()];
  assert.ok(op, `Standard media operation ${method} ${path}`); return op;
}
export function assertMediaSchema(name: string, body: unknown) {
  register(name); const validate = ajv.getSchema('#/components/schemas/' + name)!;
  assert.ok(validate(body), `${name} matches actual schema: ${ajv.errorsText(validate.errors)}`);
}
export function assertMediaBody(path: string, method: string, status: number | 'request', body: unknown) {
  const op = operation(path, method), schema = status === 'request' ? (op.requestBody?.content['application/json'] || op.requestBody?.content['multipart/form-data'])?.schema : op.responses[String(status)]?.content['application/json'].schema;
  assert.ok(schema, `Documented ${method} ${path} ${status}`); register(schema.$ref.split('/').at(-1));
  const validate = ajv.getSchema(schema.$ref)!;
  assert.ok(validate(body), `${method} ${path} ${status} matches actual schema: ${ajv.errorsText(validate.errors)}`);
}
let total = 0;
for (const [path, ops] of paths) for (const [method, op] of Object.entries<any>(ops)) {
  total++; assert.ok(op.operationId);
  assert.equal(JSON.stringify(op.security), JSON.stringify([{ BackyAdminSession: [] }, { BackyAdminKey: [] }]));
  const permission = method === 'delete' ? 'media.delete' : method === 'get' || path.endsWith('/signed-url') ? 'media.view' : method === 'post' && (path.endsWith('/media') || path.endsWith('/folders')) ? 'media.create' : 'media.edit';
  assert.equal(op['x-backy-permission'], permission);
  // Recovery intentionally returns503 for unexpected runtime failures, retaining
  // its journal. The original media operations retain their500 contract.
  const runtimeFailureStatus = path.includes('/storage-recovery') ? '503' : '500';
  for (const status of ['401', '403', '404', runtimeFailureStatus]) assert.equal(op.responses[status].content['application/json'].schema.$ref, '#/components/schemas/ErrorEnvelope');
}
assert.equal(total, 18);
assert.ok(operation('/storage-recovery', 'GET').responses['503']);
assert.ok(operation('/storage-recovery/{jobId}', 'POST').responses['503']);
assert.equal(operation('', 'GET').parameters.find((p: any) => p.name === 'limit').schema.maximum, 100);
assert.ok(operation('/{mediaId}', 'DELETE').responses['409']);
assert.ok(operation('/{mediaId}/signed-url', 'POST').responses['503']);
assert.throws(() => assertMediaBody('/{mediaId}', 'PATCH', 'request', { visibility: 'invented' }));
assert.throws(() => assertMediaBody('/{mediaId}/signed-url', 'POST', 'request', { expiresInSeconds: 3601 }));
assert.throws(() => assertMediaBody('/{mediaId}/bind', 'POST', 'request', { targetType: 'collection', targetId: 'foreign' }));

// Exercise the actual generator functions: binary requests become Blob; response schemas stay strings.
const generator = readFileSync(new URL('../../../packages/sdk-js/scripts/generate-contract-types.mjs', import.meta.url), 'utf8');
const functions = generator.slice(generator.indexOf('function schemaToType('), generator.indexOf('const sourceLines ='));
const generate = vm.runInNewContext(functions + '; schemaToType', { propertyKey: (key: string) => key, union: (items: string[]) => [...new Set(items)].join(' | ') });
assert.equal(generate({ type: 'string', format: 'binary' }, 'openapi', 0, true), 'Blob');
assert.equal(generate({ type: 'string', format: 'binary' }, 'openapi', 0, false), 'string');
assert.equal(generate({ type: 'array', items: { type: 'string', format: 'binary' } }, 'openapi', 0, true), 'Array<Blob>');
