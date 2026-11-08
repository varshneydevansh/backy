import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as coreNamespace from '@backy-cms/core';
const { DEFAULT_SITE_SETTINGS } = (coreNamespace as any).default || coreNamespace;
const require=createRequire(import.meta.url);
function load(relative:string,mocks:Record<string,any>){const filename=fileURLToPath(new URL(relative,import.meta.url));const compiled=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{} as any};vm.runInNewContext(compiled,{module,exports:module.exports,Request,Response,Headers,URL,process,console:{error(){}},require:(id:string)=>id in mocks?mocks[id]:require(id)},{filename});return module.exports;}
const complete=load('../src/lib/collectionExportPagination.ts',{}),collector=load('../src/lib/repositoryNavigationPages.ts',{'./collectionExportPagination':complete}),navigation=load('../src/lib/navigation.ts',{}),transport=load('../src/lib/publicContractResponse.ts',{});
const pages=Array.from({length:205},(_,i)=>({id:'page-'+i,siteId:'site-proof',title:'Page '+i,slug:'page-'+i,status:'published',isHomepage:false}));
const site:any={id:'site-proof',slug:'proof',name:'Proof',isPublished:true,settings:{...structuredClone(DEFAULT_SITE_SETTINGS),navigation:{primary:[{id:'tail',type:'page',pageId:'page-204',label:'Tail',children:[]}],footer:[]}}};
let mode='valid',published=true;const offsets:number[]=[];
const repository={list:async(input:any)=>{assert.equal(input.siteId,site.id);assert.equal(input.includeUnpublished,false);assert.equal(input.status,'published');offsets.push(input.offset);if(mode==='throw'&&input.offset>0)throw Error('private provider detail');const items=pages.slice(input.offset,input.offset+100);if(mode==='foreign'&&input.offset===100)items[0]={...items[0],siteId:'foreign'};return{items,pagination:{total:mode==='drift'&&input.offset>0?206:205,limit:100,offset:input.offset,hasMore:input.offset+items.length<205}};}};
const route=load('../src/app/api/sites/[siteId]/navigation/route.ts',{'@/lib/backyStore':{},'@/lib/publicContractResponse':transport,'@/lib/repositoryNavigationPages':collector,'@/lib/collectionExportPagination':complete,'@/lib/navigation':navigation,'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>({sites:{getById:async()=>published?site:{...site,isPublished:false},getBySlug:async()=>null},pages:repository,cacheInvalidations:{latestRevision:async()=>undefined}})}});
let checks=0;async function read(expected:number){const response=await route.GET(new NextRequest('http://fixture.invalid/api/sites/site-proof/navigation'),{params:Promise.resolve({siteId:'site-proof'})});assert.equal(response.status,expected);const result=await response.json();checks++;return{response,result};}
const valid=await read(200);assert.deepEqual(offsets,[0,100,200]);assert.equal(valid.result.data.navigation.primary[0].path,'/page-204');assert.match(valid.response.headers.get('cache-control')!,/public/);
for(mode of ['throw','drift','foreign']){const {response,result}=await read(503);assert.equal(result.error.code,'NAVIGATION_INVENTORY_INCOMPLETE');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(result).includes('private provider detail'),false);}
mode='valid';published=false;await read(404);published=true;
// Execute the real render route's navigation function with the same real collector.
const renderSource=ts.createSourceFile('render.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/render/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declaration=renderSource.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='repositoryNavigation'))!;
const code=ts.transpileModule(declaration.getText(renderSource),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const renderNavigation=vm.runInNewContext(code+';repositoryNavigation',{collectPublishedNavigationPages:collector.collectPublishedNavigationPages,buildSiteNavigation:navigation.buildSiteNavigation,isPubliclyReadable:(page:any)=>page.status==='published'});
offsets.length=0;const rendered=await renderNavigation({pages:repository},site);assert.equal(rendered.primary[0].path,'/page-204');assert.deepEqual(offsets,[0,100,200]);checks++;
mode='throw';await assert.rejects(()=>renderNavigation({pages:repository},site),complete.CollectionExportIncompleteError);checks++;
console.log('Public navigation complete inventory checks passed: '+checks+'; actual navigation handler/cache, render-navigation function, published-only205page tail and sanitized incomplete errors. Full render/browser/database proof separate.');
