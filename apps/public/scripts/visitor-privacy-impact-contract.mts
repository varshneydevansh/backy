/** Compile the saved producer schemas and operation; validate actual handler envelopes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
const source=ts.createSourceFile('openapi.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const schemas=new Map<string,ts.Expression>();let operation:any;
function visit(node:ts.Node){if(ts.isPropertyAssignment(node)){if(node.name.getText(source)==='schemas'&&ts.isObjectLiteralExpression(node.initializer))for(const property of node.initializer.properties)if(ts.isPropertyAssignment(property)&&(ts.isStringLiteral(property.name)||ts.isIdentifier(property.name)))schemas.set(property.name.text,property.initializer);if(ts.isComputedPropertyName(node.name)&&node.name.expression.getText(source)==='`/api/admin/sites/${site.id}/visitors/members/{memberId}/privacy-impact`')operation=vm.runInNewContext('('+node.initializer.getText(source)+')').get;}ts.forEachChild(node,visit);}visit(source);
assert.equal(operation?.operationId,'getAdminVisitorPrivacyImpact');assert.deepEqual(JSON.parse(JSON.stringify(operation.security)),[{BackyAdminSession:[]}]);assert.equal(operation['x-backy-auth-boundary'],'owner-cookie-only');assert.equal(operation['x-backy-permission'],'users.view');assert.equal(operation.requestBody,undefined);assert.equal(operation.parameters.some((p:any)=>p.in==='query'),false);
const ajv=new Ajv2020({strict:false,validateFormats:false,allErrors:true}),loaded=new Set<string>();
function register(name:string){if(loaded.has(name))return;loaded.add(name);assert(schemas.has(name),'Missing actual producer '+name);const value=vm.runInNewContext('('+schemas.get(name)!.getText(source)+')');for(const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g))register(ref[1]);ajv.addSchema(value,'#/components/schemas/'+name);}
export function assertVisitorPrivacyImpactContract(status:number,payload:unknown){const schema=operation.responses[String(status)]?.content['application/json'].schema;assert(schema,'Documented privacy status '+status);register(schema.$ref.split('/').at(-1));const validate=ajv.getSchema(schema.$ref)!;assert(validate(payload),ajv.errorsText(validate.errors));}
