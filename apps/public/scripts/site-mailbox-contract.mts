import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import * as imported from '../src/lib/siteMailboxOpenApi.ts';
const { siteMailboxSchemas, siteMailboxPaths } = (imported as any).default || imported;
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
let errorSchema: any;
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'ErrorEnvelope') errorSchema = vm.runInNewContext(`(${node.initializer.getText(source)})`);
  ts.forEachChild(node, visit);
}
visit(source); assert(errorSchema, 'Actual public OpenAPI error component required');
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema({ components: { schemas: { ...siteMailboxSchemas, ErrorEnvelope: errorSchema } } }, 'site-mailbox-contract');
export const siteMailboxOperations = siteMailboxPaths('{siteId}');
export function assertSiteMailboxContractBody(path: string, method: string, status: number | 'request', body: unknown) {
  const operation = siteMailboxOperations[`/api/admin/sites/{siteId}/settings/mailboxes${path}`]?.[method.toLowerCase()];
  assert(operation, `Mailbox operation ${method} ${path}`);
  const schema = status === 'request' ? operation.requestBody?.content['application/json'].schema : operation.responses[String(status)]?.content['application/json'].schema;
  assert(schema?.$ref, `Mailbox schema ${method} ${path} ${status}`);
  const validate = ajv.compile({ $ref: `site-mailbox-contract${schema.$ref}` });
  assert(validate(body), ajv.errorsText(validate.errors));
  if (status === 200 && schema.$ref.endsWith('/AdminSiteMailboxReadEnvelope')) assert(Buffer.byteLength((body as any).data.text, 'utf8') <= 262144, 'Mailbox text must respect declared UTF-8 byte bound');
}
