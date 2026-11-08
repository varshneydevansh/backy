import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const sourceRoot=fileURLToPath(new URL('../src/',import.meta.url));
const require=createRequire(import.meta.url);
const {NextRequest,NextResponse}=require('next/server');
const core=require('@backy-cms/core');
let writes=0, reads=0, denied=0, fault="read";
const site={id:'duplicate-source',slug:'source',teamId:'fixture-team',name:'Source',settings:core.DEFAULT_SITE_SETTINGS,theme:{},isPublished:false};
const repos={sites:{getById:async()=>{reads++;return site},checkSlug:async()=>({available:true}),list:async()=>({items:[site],pagination:{total:1,limit:1,offset:0,hasMore:false}}),create:async()=>{writes++;return{item:{...site,id:'partial-destination'}}}},settings:{get:async()=>({})},pages:{list:async(input:any)=>{
 if(fault==='read')throw Error('synthetic private inventory read failed');
 const items=Array.from({length:205},(_,i)=>({id:'page-'+i,siteId:site.id}));
 const offset=input.offset||0,limit=100;
 const page:any={items:items.slice(offset,offset+limit),pagination:{total:205,limit,offset,hasMore:offset+limit<205}};
 if(fault==='foreign')page.items[0].siteId='foreign-site';
 if(fault==='duplicate'&&offset)page.items[0].id='page-0';
 if(fault==='empty'&&offset)page.items=[];
 if(fault==='drift'&&offset)page.pagination.total=206;
 if(fault==='offset')page.pagination.offset=1;
 if(fault==='hasMore')page.pagination.hasMore=false;
 if(fault==='limit')page.pagination.limit=1000;
 if(fault==='missing')delete page.pagination;
 return page;
}}};
const mocks={'next/server':{NextResponse},'@backy-cms/core':core,'@/lib/adminAccess':{requireAdminAccess:async(_r:any,rid:string,input:any)=>{assert.equal(input.permission,'sites.create');return denied?NextResponse.json({success:false,requestId:rid,error:{code:'DENIED',message:'Denied'}},{status:denied}):{session:{user:{id:'fixture'}}}}},'@/lib/adminAudit':{recordAdminAudit:async()=>{}},'@/lib/backyStore':{},'@/lib/repositoryRuntime':{getRequiredDatabaseRepositories:async()=>repos,shouldUseDemoStoreFallback:()=>false}};
function load(path:string):any{const m={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,console:{error:()=>{}},process:{env:{}},Date,Math,require:(id:string)=>id in mocks?mocks[id]:id.startsWith('@/lib/')?load(sourceRoot+'lib/'+id.slice(6)+'.ts'):require(id)});return m.exports}
const route=load(sourceRoot+'app/api/admin/sites/[siteId]/duplicate/route.ts');
let checks=0;
for(fault of ['read','foreign','duplicate','empty','drift','offset','hasMore','limit','missing']) {
 writes=0;
 const response=await route.POST(new NextRequest('http://fixture.invalid/',{method:'POST',body:'{}'}),{params:Promise.resolve({siteId:site.id})});
 const body=await response.json();
 assert.equal(response.status,503,fault);assert.equal(writes,0,fault);
 assert.equal(body.error.code,'SITE_DUPLICATION_INVENTORY_INCOMPLETE');
 assert.match(response.headers.get('cache-control')||'',/private, no-store/);
 assert(!JSON.stringify(body).includes('synthetic private'));checks+=5;
}
for(denied of[401,403]){const before=reads;const r=await route.POST(new NextRequest('http://fixture.invalid/',{method:'POST',body:'{}'}),{params:Promise.resolve({siteId:site.id})});assert.equal(r.status,denied);assert.equal(reads,before);assert.equal(writes,0);checks+=3}
console.log('Actual duplicate preflight PASS '+checks+' checks: nine inventory faults plus early authorization refuse before any destination write; repository adapter, no SQL/browser proof');
