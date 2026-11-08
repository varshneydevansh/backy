import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
const source=ts.createSourceFile('openapi.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const schemas=new Map<string,ts.Expression>(),operations=new Map<string,any>();
function visit(node:ts.Node){if(ts.isPropertyAssignment(node)){
 if(node.name.getText(source)==='schemas' && ts.isObjectLiteralExpression(node.initializer))for(const property of node.initializer.properties)if(ts.isPropertyAssignment(property)&&(ts.isStringLiteral(property.name)||ts.isIdentifier(property.name)))schemas.set(property.name.text,property.initializer);
 if(ts.isComputedPropertyName(node.name)&&node.name.expression.getText(source).startsWith('`/api/admin/sites/${site.id}/visitors')&&ts.isObjectLiteralExpression(node.initializer))for(const operation of Object.values(vm.runInNewContext('('+node.initializer.getText(source)+')')) as any[])operations.set(operation.operationId,operation);
}ts.forEachChild(node,visit);}visit(source);
const ajv=new Ajv2020({strict:false,validateFormats:false,allErrors:true}),loaded=new Set<string>();
function register(name:string){if(loaded.has(name))return;loaded.add(name);const expression=schemas.get(name);assert(expression,'Standard schema '+name);const value=vm.runInNewContext('('+expression.getText(source)+')');for(const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g))register(ref[1]);ajv.addSchema(value,'#/components/schemas/'+name);}
export function assertVisitorManagementContract(operationId:string,status:number|'request',payload:unknown){const operation=operations.get(operationId);assert(operation,'Documented management operation '+operationId);const schema=status==='request'?operation.requestBody?.content['application/json'].schema:operation.responses[String(status)]?.content['application/json'].schema;assert(schema,'Documented management response '+operationId+' '+status);register(schema.$ref.split('/').at(-1));const validate=ajv.getSchema(schema.$ref)!;assert(validate(payload),operationId+' '+status+' actual payload: '+ajv.errorsText(validate.errors));}
assert.equal(operations.size,5);for(const operation of operations.values()){assert.equal(operation['x-backy-permission'],'sites.configure');assert.equal(operation['x-backy-retention-boundary'],'retained-access-removal-not-erasure');assert.doesNotMatch(JSON.stringify(operation.security),/Visitor/);}
assertVisitorManagementContract('updateAdminVisitorMember','request',{displayName:'Reader',status:'suspended'});assertVisitorManagementContract('removeAdminVisitorMemberAccess','request',{confirmRetention:true});
assert.throws(()=>assertVisitorManagementContract('updateAdminVisitorMember','request',{email:'owner@example.test'}));assert.throws(()=>assertVisitorManagementContract('updateAdminVisitorMember','request',{status:'removed'}));assert.throws(()=>assertVisitorManagementContract('removeAdminVisitorMemberAccess','request',{confirmRetention:false}));
