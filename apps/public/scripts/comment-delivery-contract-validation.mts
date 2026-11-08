import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv';
const ast=ts.createSourceFile('openapi.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const nodes=new Map<string,ts.Expression>(),schemas:Record<string,unknown>={};
function walk(node:ts.Node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='schemas'&&ts.isObjectLiteralExpression(node.initializer))for(const p of node.initializer.properties)if(ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)))nodes.set(p.name.text,p.initializer);ts.forEachChild(node,walk);}walk(ast);
function resolve(name:string){if(schemas[name])return;const node=nodes.get(name);assert(node,name);const value=vm.runInNewContext(`(${node.getText(ast)})`,{envelopeSchema:(data:unknown)=>({type:'object',required:['success','requestId','data'],properties:{success:{const:true},requestId:{type:'string'},data}})});schemas[name]=value;for(const match of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g))resolve(match[1]);}
resolve('CommentDeliveryRetryEnvelope');resolve('CommentDeliveryAttemptsEnvelope');
const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false});ajv.addSchema({components:{schemas}},'delivery-contract');
const retry=ajv.compile({$ref:'delivery-contract#/components/schemas/CommentDeliveryRetryEnvelope'}),history=ajv.compile({$ref:'delivery-contract#/components/schemas/CommentDeliveryAttemptsEnvelope'});
export function validateCommentDeliveryResponse(kind:'retry'|'history',status:number,value:unknown){if(status!==200)return;const validate=kind==='retry'?retry:history;assert(validate(value),ajv.errorsText(validate.errors));}
