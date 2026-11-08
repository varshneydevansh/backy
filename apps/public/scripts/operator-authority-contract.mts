import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
const source=ts.createSourceFile('openapi.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declarations=new Map<string,ts.Expression>();
let operation:any;
function visit(node:ts.Node){if(ts.isPropertyAssignment(node)&&(ts.isStringLiteral(node.name)||ts.isIdentifier(node.name))){declarations.set(node.name.text,node.initializer);if(node.name.text==='/api/admin/users/bulk')operation=vm.runInNewContext(`(${node.initializer.getText(source)})`);}ts.forEachChild(node,visit);}visit(source);
assert(operation?.post);assert.equal(operation.post.operationId,'bulkAdminUsers');
const ajv=new Ajv2020({strict:false,allErrors:true,validateFormats:false}),loaded=new Set<string>();
function register(name:string){if(loaded.has(name))return;loaded.add(name);const value=declarations.get(name);assert(value,`actual schema ${name}`);const schema=vm.runInNewContext(`(${value.getText(source)})`);for(const ref of JSON.stringify(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/gu))register(ref[1]);ajv.addSchema(schema,'#/components/schemas/'+name);}
export function assertBulkOperatorBody(status:number,payload:unknown){const schema=operation.post.responses[String(status)]?.content['application/json'].schema;assert(schema,`bulk documented${status}`);register(schema.$ref.split('/')[3]);const validate=ajv.getSchema(schema.$ref)!;assert(validate(payload),ajv.errorsText(validate.errors));}
