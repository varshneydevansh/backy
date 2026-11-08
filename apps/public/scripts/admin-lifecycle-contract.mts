import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const properties = new Map<string, ts.Expression>();
let schemaProperties: ts.ObjectLiteralExpression | undefined;
const paths = new Map<string, any>();
// Taxonomy and revision contracts have independent gates. Keep this inventory
// tied to the exact lifecycle handlers it executes, rather than every blog URL.
const ownedMethods = new Map([
  ['pages', ['get', 'post']], ['pages/{pageId}', ['get', 'patch', 'delete']],
  ['pages/{pageId}/preview', ['post']], ['pages/{pageId}/publish', ['post']],
  ['pages/{pageId}/archive', ['post']], ['pages/{pageId}/readiness', ['get']],
  ['blog', ['get', 'post']], ['blog/{postId}', ['get', 'patch', 'delete']],
  ['blog/{postId}/preview', ['post']], ['blog/{postId}/publish', ['post']],
  ['blog/{postId}/archive', ['post']], ['blog/{postId}/readiness', ['get']],
]);
function visit(n: ts.Node) {
  if (ts.isPropertyAssignment(n)) {
    if (n.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(n.initializer)) schemaProperties = n.initializer;
    if (ts.isComputedPropertyName(n.name) && n.name.expression.getText(source).startsWith('`/api/admin/sites/${site.id}/') && ts.isObjectLiteralExpression(n.initializer)) {
      const path = n.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
      if (ownedMethods.has(path.replace('/api/admin/sites/{siteId}/', ''))) paths.set(path, vm.runInNewContext(`(${n.initializer.getText(source)})`));
    }
  }
  ts.forEachChild(n, visit);
}
visit(source);
for (const p of schemaProperties!.properties) if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) properties.set(p.name.text, p.initializer);
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const loaded = new Set<string>();
function register(name: string) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const expression = properties.get(name); assert.ok(expression, `Actual schema declaration ${name}`);
  const schema = vm.runInNewContext(`(${expression.getText(source)})`, {
    envelopeSchema: (data: any) => ({ type: 'object', required: ['success', 'requestId', 'data'], properties: { success: { type: 'boolean' }, requestId: { type: 'string' }, data, error: { $ref: '#/components/schemas/ErrorEnvelope/properties/error' } } }),
  });
  for (const ref of JSON.stringify(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/gu)) register(ref[1]);
  ajv.addSchema(schema, '#/components/schemas/' + name);
}
export function operation(path: string, method: string) {
  const op = paths.get('/api/admin/sites/{siteId}/' + path)?.[method.toLowerCase()];
  assert.ok(op, `Standard OpenAPI operation ${method} ${path}`); return op;
}
export function assertLifecycleBody(path: string, method: string, status: number | 'request', body: unknown) {
  const op = operation(path, method);
  const schema = status === 'request' ? op.requestBody.content['application/json'].schema : op.responses[String(status)]?.content['application/json'].schema;
  assert.ok(schema, `Documented ${method} ${path} ${status}`);
  register(schema.$ref.split('/').at(-1)); const validate = ajv.getSchema(schema.$ref)!;
  assert.ok(validate(body), `${method} ${path} ${status} matches schema: ${ajv.errorsText(validate.errors)}`);
}
let total = 0;
assert.deepEqual([...paths.keys()].sort(), [...ownedMethods.keys()].map(path => '/api/admin/sites/{siteId}/' + path).sort(), 'Every owned lifecycle route is present');
for (const [path, methods] of ownedMethods) assert.deepEqual(Object.keys(paths.get('/api/admin/sites/{siteId}/' + path)).sort(), [...methods].sort(), `Exact lifecycle methods for ${path}`);
for (const [path, ops] of paths) for (const [method, op] of Object.entries<any>(ops)) {
  total++; assert.ok(op.operationId); assert.equal(JSON.stringify(op.security), JSON.stringify([{ BackyAdminSession: [] }, { BackyAdminKey: [] }]));
  const expected = method === 'delete' ? 'pages.delete' : path.endsWith('/preview') || path.endsWith('/publish') ? 'pages.publish' : method === 'get' ? 'pages.view' : 'pages.edit';
  assert.equal(op['x-backy-permission'], expected);
  for (const status of ['401', '403', '404', '500']) assert.equal(op.responses[status].content['application/json'].schema.$ref, '#/components/schemas/ErrorEnvelope');
  if (path.endsWith('/preview')) for (const r of Object.values<any>(op.responses)) assert.equal(r.headers['Cache-Control'].schema.const, 'private, no-store');
}
assert.equal(total, 18, 'Exactly the 18 granted lifecycle methods');
assert.equal(operation('pages', 'GET').parameters.find((p: any) => p.name === 'limit').schema.maximum, 200);
assert.equal(operation('blog', 'GET').parameters.find((p: any) => p.name === 'limit').schema.maximum, 100);
assert.ok(operation('pages', 'POST').responses['402']);
assert.throws(() => assertLifecycleBody('pages', 'POST', 'request', { title: 'Page', content: 'legacy' }));
assertLifecycleBody('blog', 'POST', 'request', { title: 'Blog', content: 'legacy' });
assert.throws(() => assertLifecycleBody('pages', 'POST', 'request', { title: '   ' }));
assert.throws(() => assertLifecycleBody('blog', 'POST', 'request', { title: 'Blog', status: 'invented' }));

assert.throws(() => assertLifecycleBody('pages', 'POST', 'request', { title: 'Page', content: { elements: [{ id: 'legacy', type: 'paragraph', unknownRootExtension: true }] } }));
