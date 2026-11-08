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
    if (ts.isComputedPropertyName(n.name) && n.name.expression.getText(source).startsWith('`/api/admin/sites/${site.id}/interactive-components') && ts.isObjectLiteralExpression(n.initializer)) {
      const path = n.name.expression.getText(source).slice(1, -1).replace('${site.id}', '{siteId}');
      if (!path.endsWith('/discovery')) paths.set(path, vm.runInNewContext(`(${n.initializer.getText(source)})`));
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
  const schema = vm.runInNewContext(`(${expression.getText(source)})`);
  for (const ref of JSON.stringify(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/gu)) register(ref[1]);
  ajv.addSchema(schema, '#/components/schemas/' + name);
}
export function operation(path: string, method: string) {
  const op = paths.get('/api/admin/sites/{siteId}/interactive-components' + path)?.[method.toLowerCase()];
  assert.ok(op, `Standard component operation ${method} ${path}`); return op;
}
export function assertComponentBody(path: string, method: string, status: number | 'request', body: unknown) {
  const op = operation(path, method), schema = status === 'request' ? op.requestBody?.content['application/json'].schema : op.responses[String(status)]?.content['application/json'].schema;
  assert.ok(schema, `Documented ${method} ${path} ${status}`); register(schema.$ref.split('/').at(-1));
  const validate = ajv.getSchema(schema.$ref)!;
  assert.ok(validate(body), `${method} ${path} ${status} matches actual schema: ${ajv.errorsText(validate.errors)}`);
}
let total = 0;
for (const [path, ops] of paths) for (const [method, op] of Object.entries<any>(ops)) {
  total++; assert.ok(op.operationId);
  assert.equal(JSON.stringify(op.security), JSON.stringify([{ BackyAdminSession: [] }, { BackyAdminKey: [] }]));
  assert.equal(op['x-backy-permission'], method === 'delete' ? 'pages.delete' : method === 'get' ? 'pages.view' : 'pages.edit');
  for (const status of ['400', '401', '403', '404', '500']) assert.equal(op.responses[status].content['application/json'].schema.$ref, '#/components/schemas/ErrorEnvelope');
  if (path.includes('{version}')) assert.equal(op.parameters.filter((p: any) => p.in === 'path').length, 2);
}
assert.equal(total, 11);
assert.equal(operation('', 'GET').parameters.find((p: any) => p.name === 'limit').schema.maximum, 100);
assert.ok(operation('/{componentKey}/{version}/bundle', 'POST').responses['413']);
assert.ok(operation('/{componentKey}/{version}/migrate', 'POST').responses['503']);
assert.throws(() => assertComponentBody('', 'POST', 'request', { componentKey: 'fixture.key' }));
assert.throws(() => assertComponentBody('/{componentKey}/{version}', 'PATCH', 'request', { version: '2.0.0' }));
assert.throws(() => assertComponentBody('', 'POST', 'request', { componentKey: 'fixture.key', displayName: 'Figure', defaultProps: { ignored: true } }));
assert.throws(() => assertComponentBody('/{componentKey}/{version}/review', 'POST', 'request', { action: 'invented' }));
