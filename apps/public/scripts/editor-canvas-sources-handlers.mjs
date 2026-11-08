import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './collection-import-postgres-handlers.mjs';
const require=createRequire(import.meta.url),{NextRequest,NextResponse}=require('next/server');
export async function verifyEditorCanvasSources({repositories,owner,siteId,pageId,queries}) {
 let denied=0,reads=0,heavy=0,missing=false,corrupt=null,checks=0;
 const forbidden=()=>{heavy++;throw Error('Heavy owner read forbidden');};
 const runtime={shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>{
  reads++;return {sites:{...repositories.sites,getById:forbidden,getBySlug:forbidden,...(missing?{getAccessScopeByIdOrSlug:undefined}:{})},pages:{...repositories.pages,list:forbidden,listSummaries:forbidden,getById:forbidden,getBySlug:forbidden,listCanvasSourceMetadata:async input=>{const data=await repositories.pages.listCanvasSourceMetadata(input);return corrupt?corrupt(data):data;}}};
 }};
 const route=load('../src/app/api/admin/sites/[siteId]/editor/canvas-sources/route.ts',{'@/lib/adminAccess':{requireAdminAccess:async(_r,_id,options)=>{assert.equal(options.permission,'pages.view');return denied?NextResponse.json({success:false},{status:denied}):{type:'synthetic-owner'};}},'@/lib/repositoryRuntime':runtime,'@/lib/backyStore':{getPageSummary:forbidden,getSiteByIdOrSlug:forbidden}});
 async function call(query='limit=2',identifier=siteId){const response=await route.GET(new NextRequest(`http://fixture.invalid/api/admin/sites/${identifier}/editor/canvas-sources?${query}`),{params:Promise.resolve({siteId:identifier})});const raw=await response.text();return{response,body:JSON.parse(raw),bytes:Buffer.byteLength(raw)};}
 const first=await call();assert.equal(first.response.status,200);assert.equal(first.response.headers.get('cache-control'),'private, no-store');assert.equal(first.response.headers.get('x-backy-canvas-sources'),'metadata.v1');assert(first.bytes<1500);assert.equal(first.body.data.pages.length,2);assert(first.body.data.pagination.total>100);assert.deepEqual(Object.keys(first.body.data.pages[0]).sort(),['id','siteId','slug','status','title']);assert(!JSON.stringify(first.body).includes('PRIVATE_OWNER'));checks+=8;
 const page2=await call('limit=2&offset=2');assert.equal(page2.body.data.pagination.offset,2);assert(!page2.body.data.pages.some(page=>first.body.data.pages.some(other=>other.id===page.id)));checks+=2;
 const matching=await call('q=100%25_');assert.equal(matching.response.status,200);assert.equal(matching.body.data.pagination.total,1);assert.equal(matching.body.data.pages[0].id,pageId);checks+=3;
 await owner.query('update pages set status=\'archived\' where id=$1',[pageId]);assert.equal((await call('q=100%25_')).body.data.pagination.total,0);await owner.query('update pages set status=\'draft\' where id=$1',[pageId]);assert.equal((await call('q=100%25_')).body.data.pages[0].status,'draft');checks+=2;
 for(const status of [401,403]){denied=status;const before=reads;assert.equal((await call()).response.status,status);assert.equal(reads,before);checks+=2;}denied=0;
 for(const query of ['q=a&q=b','previewToken=private','limit=101','offset=-1','offset=1000001','includeContent=true','q='+encodeURIComponent('x'.repeat(201))]){const before=reads;const r=await call(query);assert.equal(r.response.status,400);assert.equal(reads,before);checks+=2;}
 assert.equal((await call('','missing-site')).response.status,404);checks++;
 missing=true;assert.equal((await call()).response.status,503);missing=false;checks++;
 for(const mutate of [r=>({...r,pagination:{...r.pagination,total:-1}}),r=>({...r,pagination:{...r.pagination,limit:1}}),r=>({...r,items:[]}),r=>({...r,items:[{...r.items[0],siteId:'foreign'},r.items[1]]}),r=>({...r,items:[{...r.items[0],status:'archived'},r.items[1]]}),r=>({...r,items:[r.items[0],r.items[0]]}),r=>({...r,items:[{...r.items[0],title:null},r.items[1]]})]){corrupt=mutate;const r=await call();assert.equal(r.response.status,503);assert(!JSON.stringify(r.body).includes('PRIVATE_OWNER'));checks+=2;}corrupt=null;
 assert.equal(heavy,0);checks++;
 return {passed:true,checks,firstWindowBytes:first.bytes,heavyFallbackReads:heavy,actualHandler:true,actualSqlRepositories:true,admissionFixture:true,hostedRequests:0};
}
