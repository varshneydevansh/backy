import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv';
import * as imported from '../src/lib/formTemplatePackOpenApi.ts';
const { formTemplatePackSchemas } = (imported as any).default || imported;
const ast = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas: Record<string, any> = { ...formTemplatePackSchemas };
const nodes = new Map<string, ts.Expression>();
function walk(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) {
    for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) nodes.set(p.name.text, p.initializer);
  }
  ts.forEachChild(node, walk);
}
walk(ast);
function resolve(name: string) {
  if (!schemas[name]) { const node = nodes.get(name); assert(node, name); schemas[name] = vm.runInNewContext(`(${node.getText(ast)})`); }
  for (const match of JSON.stringify(schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g)) if (!schemas[match[1]]) resolve(match[1]);
}
resolve('FormTemplatePackApplyEnvelope');
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema({ components: { schemas } }, 'form-pack-contract');
const review = ajv.compile({ $ref: 'form-pack-contract#/components/schemas/FormTemplatePackReviewEnvelope' });
const apply = ajv.compile({ $ref: 'form-pack-contract#/components/schemas/FormTemplatePackApplyEnvelope' });
export function validateFormTemplatePackResponse(status: number, value: unknown) {
  if (status !== 200 && status !== 201) return;
  const validator = status === 200 ? review : apply;
  assert(validator(value), ajv.errorsText(validator.errors));
}
