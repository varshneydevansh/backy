import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import Ajv2020 from "ajv/dist/2020.js";
const source = ts.createSourceFile(
  "openapi.ts",
  readFileSync(
    new URL("../src/app/api/sites/[siteId]/openapi/route.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declarations = new Map<string, ts.Expression>();
let schemas: ts.ObjectLiteralExpression | undefined, operation: any;
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node)) {
    if (
      node.name.getText(source) === "schemas" &&
      ts.isObjectLiteralExpression(node.initializer)
    )
      schemas = node.initializer;
    if (
      ts.isComputedPropertyName(node.name) &&
      node.name.expression.getText(source) ===
        "`/api/admin/sites/${site.id}/templates/{templateId}/instances`"
    )
      operation = vm.runInNewContext(
        `(${node.initializer.getText(source)})`,
      ).post;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(schemas);
assert.ok(operation);
for (const property of schemas.properties)
  if (
    ts.isPropertyAssignment(property) &&
    (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
  )
    declarations.set(property.name.text, property.initializer);
const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateFormats: false,
  }),
  loaded = new Set<string>();
function register(name: string) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const expression = declarations.get(name);
  assert.ok(expression);
  const schema = vm.runInNewContext(`(${expression.getText(source)})`);
  for (const match of JSON.stringify(schema).matchAll(
    /#\/components\/schemas\/([A-Za-z0-9]+)/gu,
  ))
    register(match[1]);
  ajv.addSchema(schema, "#/components/schemas/" + name);
}
export function assertTemplateInstanceContract(
  status: number | "request",
  body: unknown,
) {
  const schema =
    status === "request"
      ? operation.requestBody.content["application/json"].schema
      : operation.responses[String(status)]?.content["application/json"].schema;
  assert.ok(schema, `Template instance contract ${status}`);
  register(schema.$ref.split("/").at(-1));
  const validate = ajv.getSchema(schema.$ref)!;
  assert.ok(
    validate(body),
    `${status} template instance contract: ${ajv.errorsText(validate.errors)}`,
  );
}
assert.equal(operation["x-backy-permission"], "pages.view");
assert.equal(
  operation.responses["409"].content["application/json"].schema.$ref,
  "#/components/schemas/ErrorEnvelope",
);
