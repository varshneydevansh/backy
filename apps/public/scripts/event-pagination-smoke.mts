import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {NextRequest,NextResponse} from 'next/server';
import {loadMediaFixture} from './media-storage-recovery-fixture.mts';
const cwd=process.cwd(),scratch=mkdtempSync('/tmp/backy-event-pagination-');process.chdir(scratch);
let checks=0;
try{
 const imported:any=await import('../src/lib/backyStore.ts'),store=imported.default||imported;
 const site=store.createAdminSite({id:'events-a',slug:'events-slug-a',name:'Events'}),foreign=store.createAdminSite({id:'events-b',slug:'events-slug-b',name:'Foreign'});
 const rows:any[]=[];for(let index=0;index<135;index++){
  const item={siteId:site.id,kind:'form-submission',formId:index<30?'selected-form':'unrelated-form',submissionId:'submission-'+index,target:'https://fixture.invalid/hook',status:'failed',statusCode:503,requestId:'request-'+(index%2),metadata:{channel:'webhook'}};
  store.trackWebhookEvent(item);rows.unshift({id:'audit-'+index,siteId:item.siteId,action:item.kind,entity:'formSubmission',entityId:item.submissionId,requestId:item.requestId,metadata:{...item.metadata,formId:item.formId,target:item.target,status:item.status,statusCode:item.statusCode},createdAt:'2026-10-06T00:00:00Z'});
 }
 store.trackWebhookEvent({siteId:foreign.id,kind:'form-submission',formId:'selected-form',target:'foreign-private-target',status:'failed'});
 rows.unshift({id:'foreign-private',siteId:foreign.id,action:'form-submission',entity:'formSubmission',entityId:'foreign',metadata:{formId:'selected-form',target:'foreign-private-target'},createdAt:'2026-10-06T00:00:00Z'});
 let denied=0,reads=0;const permissions:string[]=[];
 for(const demo of [true,false]){
  const repositories={auditLogs:{list:async(input:any)=>{reads++;assert.equal(input.siteId,site.id);let filtered=rows.filter(row=>row.siteId===input.siteId&&(!input.action||row.action===input.action)&&(!input.requestId||row.requestId===input.requestId)&&(!input.formId||row.metadata.formId===input.formId));const limit=Math.min(input.limit,100),offset=input.offset;return {items:filtered.slice(offset,offset+limit),pagination:{total:filtered.length,limit,offset,hasMore:offset+limit<filtered.length}}}}};
  const mocks:any={'@/lib/backyStore':{...store,getSiteByIdOrSlug:(id:string)=>{reads++;return store.getSiteByIdOrSlug(id)}},'@/lib/adminAccess':{requireAdminAccess:async(_r:any,id:string,options:any)=>{permissions.push(options.permission);return denied?NextResponse.json({success:false,error:{code:'DENIED'}},{status:denied}):{session:{user:{id:'synthetic-owner'}}}}},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/commentRepositorySupport':{resolveRepositorySite:async(_r:any,id:string)=>{reads++;return store.getSiteByIdOrSlug(id)}}};
  mocks['@/lib/publicContractResponse']=loadMediaFixture('../src/lib/publicContractResponse.ts',{});
  const route=loadMediaFixture('../src/app/api/sites/[siteId]/events/route.ts',mocks);
  const call=(query:string)=>route.GET(new NextRequest('http://fixture.invalid/api/sites/'+site.slug+'/events?'+query),{params:Promise.resolve({siteId:site.slug})});
  let response=await call('kind=form-submission&formId=selected-form&limit=10&offset=10'),body=await response.json();
  if(process.argv.includes('--expect-known-failure')&&!demo){assert.equal(body.data.events.length,0);assert.equal(body.data.pagination.total,0);console.log('Reproduced DB post-page filter:30 selected events behind105 unrelated; middle requested page empty/total0. Demo already correctly filters before pagination.');continue;}
  assert.equal(response.status,200);assert.equal(body.data.siteId,site.id);assert.equal(body.data.events.length,10);assert.equal(body.data.count,30);assert.deepEqual(body.data.pagination,{total:30,limit:10,offset:10,hasMore:true});assert(body.data.events.every((event:any)=>event.formId==='selected-form'&&event.siteId===site.id));assert.deepEqual(body.events,body.data.events);assert.equal(response.headers.get('cache-control'),'no-store');assert(!JSON.stringify(body).includes('foreign-private-target'));checks+=9;
  body=await(await call('kind=form-submission&formId=selected-form&limit=10&offset=20')).json();assert.equal(body.data.events.length,10);assert.equal(body.data.pagination.hasMore,false);assert.equal(body.data.pagination.total,30);checks+=3;
  body=await(await call('kind=form-submission&formId=selected-form&requestId=request-1&limit=100')).json();assert.equal(body.data.events.length,15);assert.equal(body.data.count,15);checks+=2;
  body=await(await call('kind=form-submission&formId=missing&limit=100')).json();assert.equal(body.data.count,0);assert.equal(body.data.pagination.hasMore,false);checks+=2;
  body=await(await call('kind=form-submission&limit=10')).json();assert.equal(body.data.count,135);assert.equal(body.data.events.length,10);checks+=2;
  for(denied of [401,403]){const before=reads;response=await call('kind=form-submission&formId=selected-form');assert.equal(response.status,denied);assert.equal(reads,before);checks+=2;}denied=0;
  assert(permissions.every(value=>value==='forms.view'));checks++;
 }
 console.log('Event pagination PASS '+checks+': actual demo handler/store and scoped repository handler fixture; SQL verified separately. No provider/deployment claim.');
}finally{process.chdir(cwd);rmSync(scratch,{recursive:true,force:true})}
