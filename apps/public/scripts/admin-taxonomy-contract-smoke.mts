import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { NextRequest, NextResponse } from 'next/server';
const require=createRequire(import.meta.url), previous=process.cwd(), temporary=mkdtempSync(join(tmpdir(),'backy-taxonomy-contract-'));
const source=ts.createSourceFile('openapi.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const schemas=new Map<string,ts.Expression>(),paths=new Map<string,any>();
function visit(n:ts.Node){if(ts.isPropertyAssignment(n)){
 if(n.name.getText(source)==='schemas'&&ts.isObjectLiteralExpression(n.initializer))for(const p of n.initializer.properties)if(ts.isPropertyAssignment(p)&&(ts.isStringLiteral(p.name)||ts.isIdentifier(p.name)))schemas.set(p.name.text,p.initializer);
 if(ts.isComputedPropertyName(n.name)&&ts.isObjectLiteralExpression(n.initializer)){const key=n.name.expression.getText(source);if(/^`\/api\/admin\/sites\/\$\{site.id\}\/blog\/(authors|categories|tags)/.test(key))paths.set(key.slice(1,-1).replace('${site.id}','{siteId}'),vm.runInNewContext('('+n.initializer.getText(source)+')'));}
}ts.forEachChild(n,visit);}visit(source);
const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false}),loaded=new Set<string>();
function schema(name:string){if(loaded.has(name))return;loaded.add(name);const expression=schemas.get(name);assert(expression,name);const value=vm.runInNewContext('('+expression.getText(source)+')');for(const ref of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g))schema(ref[1]);ajv.addSchema(value,'#/components/schemas/'+name);}
function validate(ref:string,payload:any){schema(ref.split('/').at(-1)!);const check=ajv.getSchema(ref)!;assert(check(payload),ajv.errorsText(check.errors));}
function load(relative:string,mocks:Record<string,any>){const file=fileURLToPath(new URL(relative,import.meta.url));const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{} as any};vm.runInNewContext(compiled,{module,exports:module.exports,Request,Response,Headers,URL,URLSearchParams,process,console,require:(id:string)=>id in mocks?mocks[id]:require(id)},{filename:file});return module.exports;}
let checks=0;process.chdir(temporary);
try{
 const imported=await import('../src/lib/backyStore');const store:any=imported.default||imported;
 assert.equal([...paths.values()].reduce((n,ops)=>n+Object.keys(ops).length,0),11);
 for(const demo of [true,false]){
  const site=store.createAdminSite({id:'taxonomy-'+demo,slug:'taxonomy-'+demo,name:'Taxonomy proof',isPublished:true});let denial=0;const permissions:string[]=[];
  const taxonomy={listCategories:async(id:string)=>store.listBlogCategories(id),getCategoryByIdOrSlug:async(id:string,key:string)=>store.getBlogCategoryByIdOrSlug(id,key),createCategory:async(input:any)=>({item:store.createAdminBlogCategory(input.siteId,input)}),updateCategory:async(id:string,key:string,input:any)=>({item:store.updateAdminBlogCategory(id,key,input)}),deleteCategory:async(id:string,key:string)=>store.deleteAdminBlogCategory(id,key),listTags:async(id:string)=>store.listBlogTags(id),getTagByIdOrSlug:async(id:string,key:string)=>store.getBlogTagByIdOrSlug(id,key),createTag:async(input:any)=>({item:store.createAdminBlogTag(input.siteId,input)}),updateTag:async(id:string,key:string,input:any)=>({item:store.updateAdminBlogTag(id,key,input)}),deleteTag:async(id:string,key:string)=>store.deleteAdminBlogTag(id,key),listAuthors:async(id:string)=>store.listBlogAuthors(id)};
  const mocks={'@/lib/backyStore':store,'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>({blogTaxonomy:taxonomy})},'@/lib/repositoryContentWorkflow':{resolveRepositorySite:async(_r:any,id:string)=>store.getSiteByIdOrSlug(id)},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({scope:'content',status:'recorded'})},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>({status:'skipped'})},'@/lib/adminAccess':{requireAdminAccess:async(_r:any,requestId:string,p:any)=>{permissions.push(p.permission);return denial?NextResponse.json({success:false,requestId,error:{code:'FIXTURE_DENIAL',message:'Denied'}},{status:denial}):{session:{user:{id:'fixture-operator'}}};}}};
  async function call(plural:string,method:string,status:number,body?:any,id?:string,siteId=site.id){const singular=plural==='categories'?'category':'tag';const suffix=id?'/{'+singular+'Id}':'';const key='/api/admin/sites/{siteId}/blog/'+plural+suffix,op=paths.get(key)?.[method.toLowerCase()];assert(op,key+method);assert.equal(op['x-backy-permission'],method==='GET'?'pages.view':method==='DELETE'?'pages.delete':'pages.edit');if(body&&status<400)validate(op.requestBody.content['application/json'].schema.$ref,body);const route=load('../src/app/api/admin/sites/[siteId]/blog/'+plural+(id?'/['+singular+'Id]':'')+'/route.ts',mocks);const response=await route[method](new NextRequest('http://fixture.invalid/api/admin/sites/'+siteId+'/blog/'+plural+(id?'/'+id:''),{method,...(body!==undefined?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId,[singular+'Id']:id})});assert.equal(response.status,status,`${demo} ${method} ${key}`);const result=await response.json();validate(op.responses[String(status)].content['application/json'].schema.$ref,result);checks++;return result;}
  for(const [plural,singular] of [['categories','category'],['tags','tag']]){
   const input={name:'Research notes',description:'Authored',...(plural==='categories'?{color:'#146a62',sortOrder:3}:{})};const created=(await call(plural,'POST',201,input)).data[singular];assert.equal(created.slug,'research-notes');
   await call(plural,'GET',200);await call(plural,'GET',200,undefined,created.slug);await call(plural,'POST',409,input);await call(plural,'POST',400,{name:' '});await call(plural,'PATCH',400,{slug:'!!!'},created.id);
   const updated=(await call(plural,'PATCH',200,{name:'Updated',description:null,slug:'Updated Slug'},created.id)).data[singular];assert.equal(updated.slug,'updated-slug');assert.equal(updated.description,null);
   await call(plural,'GET',404,undefined,created.id,'site-missing');denial=401;await call(plural,'GET',401);denial=403;await call(plural,'PATCH',403,{name:'No'},created.id);denial=0;
   const deleted=await call(plural,'DELETE',200,undefined,created.id);assert.equal(deleted.data.deleted,true);assert.equal(deleted.data[singular+'Id'],created.id);await call(plural,'GET',404,undefined,created.id);
  }
  await call('authors','GET',200);await call('authors','GET',404,undefined,undefined,'site-missing');denial=403;await call('authors','GET',403);
  assert(permissions.includes('pages.delete'));assert(permissions.includes('pages.edit'));checks++;
 }
 console.log('Admin taxonomy actual-handler/schema checks passed: '+checks+'; demo and repository adapters, IDs/slugs, normalization, conflicts, null clears, auth-denial envelopes. PostgreSQL/live browser separate.');
}finally{process.chdir(previous);rmSync(temporary,{recursive:true,force:true});}
