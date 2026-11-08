import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import { load } from './admin-access-test-fixtures.mts';
const { ADMIN_SITE_SERVICE_PERMISSIONS } = load('../src/lib/adminServiceKeyScope.ts');

// Evaluate the literal declarations used by the served OpenAPI, rather than a
// second schema fixture or an assertion about source spelling.
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const properties = new Map<string, ts.Expression>();
let schemas: ts.ObjectLiteralExpression | undefined;
let operations: any;
let headerScheme: any;
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node)) {
    const name = ts.isStringLiteral(node.name) || ts.isIdentifier(node.name) ? node.name.text : '';
    if (name === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) schemas = node.initializer;
    if (name === '/api/admin/users/{userId}/site-grants') operations = vm.runInNewContext(`(${node.initializer.getText(source)})`);
    if (name === 'BackyAdminSessionHeader') headerScheme = vm.runInNewContext(`(${node.initializer.getText(source)})`);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(schemas); assert.ok(operations);
for (const property of schemas.properties) if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))) properties.set(property.name.text, property.initializer);
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const loaded = new Set<string>();
function register(name: string) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const expression = properties.get(name); assert.ok(expression, `Actual schema ${name}`);
  const schema = vm.runInNewContext(`(${expression.getText(source)})`);
  for (const match of JSON.stringify(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/gu)) register(match[1]);
  ajv.addSchema(schema, '#/components/schemas/' + name);
}
export function assertOperatorGrantBody(method: 'get' | 'patch', status: number | 'request', body: unknown) {
  const operation = operations[method];
  const schema = status === 'request' ? operation.requestBody.content['application/json'].schema : operation.responses[String(status)]?.content['application/json'].schema;
  assert.ok(schema, `Standard OpenAPI ${method} ${status}`);
  register(schema.$ref.split('/').at(-1));
  const validate = ajv.getSchema(schema.$ref)!;
  assert.ok(validate(body), `${method} ${status} matches standard contract: ${ajv.errorsText(validate.errors)}`);
}
for (const [method, operation] of Object.entries<any>(operations)) {
  assert.equal(operation.operationId, method === 'get' ? 'getBackyAdminUserSiteGrants' : 'updateBackyAdminUserSiteGrants');
  assert.equal(JSON.stringify(operation.security), JSON.stringify([{ BackyAdminSession: [] }, { BackyAdminSessionHeader: [] }]));
  assert.equal(operation['x-backy-owner-session-required'], true);
  assert.equal(operation['x-backy-permission'], 'users.manage');
  assert.equal(operation.parameters[0].name, 'userId');
  assert.equal(operation.parameters[0].required, true);
  for (const status of ['400', '401', '403', '404', '409', '500', '503']) assert.equal(operation.responses[status].content['application/json'].schema.$ref, '#/components/schemas/ErrorEnvelope');
}
assert.equal(headerScheme.name, 'x-backy-admin-session'); assert.equal(headerScheme.in, 'header');
const scopeSchema: any = vm.runInNewContext(`(${properties.get('AdminOperatorSiteScope')!.getText(source)})`);
assert.deepEqual(Array.from(scopeSchema.properties.grants.items.properties.permissions.items.enum), Array.from(ADMIN_SITE_SERVICE_PERMISSIONS), 'Contract uses the exact authoritative finite permission catalog');
const scope = { version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: 'site-example', permissions: ['sites.view', 'pages.edit'] }], expiresAt: null };
assertOperatorGrantBody('patch', 'request', { expectedRevision: 0, scope });
for (const bad of [{ scope }, { expectedRevision: 0, scope: { ...scope, revision: 0 } }, { expectedRevision: 0, scope: { ...scope, grants: [{ siteId: 'site-example', permissions: ['users.manage'] }] } }, { expectedRevision: 0, scope: { ...scope, grants: Array(51).fill(scope.grants[0]) } }, { expectedRevision: -1, scope }]) assert.throws(() => assertOperatorGrantBody('patch', 'request', bad));
