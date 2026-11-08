import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';

const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const nodes = new Map<string, ts.Expression>();
export const collectionDesignOperations: Record<string, any> = {};
const paths = new Map([
 ['`/api/admin/sites/${site.id}/collections/{collectionId}/design-versions`', 'history'],
 ['`/api/admin/sites/${site.id}/collections/{collectionId}/design-versions/{revisionId}/restore`', 'restore'],
 ['`/api/admin/sites/${site.id}/templates/{templateId}/instances`', 'instances'],
]);
function visit(node: ts.Node) {
 if (ts.isPropertyAssignment(node)) {
  if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) {
   for (const item of node.initializer.properties) if (ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name))) nodes.set(item.name.text, item.initializer);
  }
  if (ts.isComputedPropertyName(node.name)) {
   const key = paths.get(node.name.expression.getText(source));
   if (key) collectionDesignOperations[key] = vm.runInNewContext(`(${node.initializer.getText(source)})`);
  }
 }
 ts.forEachChild(node, visit);
}
visit(source);
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const loaded = new Set<string>();
function register(name: string) {
 if (loaded.has(name)) return;
 loaded.add(name);
 const node = nodes.get(name); assert(node, name);
 const schema = vm.runInNewContext(`(${node.getText(source)})`);
 for (const match of JSON.stringify(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/g)) register(match[1]);
 ajv.addSchema(schema, '#/components/schemas/' + name);
}
export function collectionContractValidator(name: string) {
 register(name);
 return ajv.getSchema('#/components/schemas/' + name)!;
}
export function assertCollectionDesignContract(status: number | 'request', body: unknown, restore = false) {
 const operation = collectionDesignOperations[restore ? 'restore' : 'history'][restore ? 'post' : 'get'];
 const schema = status === 'request' ? operation.requestBody.content['application/json'].schema : operation.responses[String(status)]?.content['application/json'].schema;
 assert(schema, `${restore ? 'restore' : 'history'} collection design contract ${status}`);
 const validate = collectionContractValidator(schema.$ref.split('/').at(-1));
 assert(validate(body), `${status} collection design contract: ${ajv.errorsText(validate.errors)}`);
}
