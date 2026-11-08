// Actual demo store + actual handlers. Isolated scratch, mocked postcommit audit/delivery.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';
const previousCwd=process.cwd(),scratch=mkdtempSync('/tmp/backy-moderation-admission-');
process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';
try {
 const imported=await import('../src/lib/backyStore.ts'),store:any=(imported as any).default||imported;
 let deny=false,auditFail=false,checks=0;
 const mocks:any={'@/lib/backyStore':store,'@/lib/adminAccess':{requireAdminAccess:async()=>deny?NextResponse.json({success:false,error:{code:'DENIED',message:'Denied'}},{status:403}):{session:{user:{id:'synthetic-operator'}}}},'@/lib/adminAudit':{recordAdminAudit:async()=>{if(auditFail)throw Error('private audit credential');}},'@/lib/commentPrivacy':{hasCommentCredentials:()=>true,serializeComment:(value:any)=>value},'@/lib/commentRepositorySupport':{},'@/lib/commentDelivery':{notifyCommentDelivery:async()=>({failedChannels:0})},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>true},'@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{})};
 const bulk=loadMediaFixture('../src/app/api/sites/[siteId]/comments/route.ts',mocks),unblock=loadMediaFixture('../src/app/api/sites/[siteId]/comments/blocklist/route.ts',mocks),detail=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts',mocks);
 let sequence=0;const make=(siteId='site-demo')=>store.createComment({siteId,targetType:'page',targetId:'page-home',content:'Preserved authored content',authorEmail:`moderation-${++sequence}@example.invalid`,ipHash:'fixture-ip-'+sequence,status:'pending',requestId:'current-request'});
 const request=(method:string,payload:any)=>new NextRequest('http://fixture.invalid',{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 const call=(payload:any)=>bulk.PATCH(request('PATCH',payload),{params:Promise.resolve({siteId:'site-demo'})});
 const path=join(scratch,'data/backy/interactions.json'),first=make(),second=make(),foreign=make('foreign-site');
 let snapshot=JSON.parse(readFileSync(path,'utf8'));snapshot.extension={unknown:{retain:true}};snapshot.comments.find((c:any)=>c.id===first.id).unknown={nested:['preserved']};writeFileSync(path,JSON.stringify(snapshot));
 const beforeRows=snapshot.comments.map((c:any)=>structuredClone(c));
 let response=await call({commentIds:[first.id,second.id,first.id,foreign.id,'missing'],status:'blocked',blockReason:'custom reason'}),body=await response.json();
 assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.updatedCount,2);assert.deepEqual(body.data.missingIds,[foreign.id,'missing']);assert.equal(body.data.concurrencyBoundary,'demo-single-process');assert.deepEqual(body.data.completionWarnings,[]);assert.equal(response.headers.get('cache-control'),'no-store');
 snapshot=JSON.parse(readFileSync(path,'utf8'));assert.deepEqual(snapshot.extension,{unknown:{retain:true}});assert.deepEqual(snapshot.comments.find((c:any)=>c.id===first.id).unknown,{nested:['preserved']});assert.deepEqual(snapshot.comments.find((c:any)=>c.id===foreign.id),beforeRows.find((c:any)=>c.id===foreign.id));assert.equal(snapshot.commentBlocklist.filter((e:any)=>e.siteId==='site-demo').length,4);assert(body.data.updated.every((c:any)=>c.blockReason==='custom reason'));checks++;
 response=await call({commentIds:[first.id,second.id],clearReports:true});body=await response.json();assert.equal(response.status,200);assert(body.data.updated.every((c:any)=>c.status==='blocked'&&c.blockReason==='custom reason'&&c.reportCount===0));checks++;
 const retained=readFileSync(path,'utf8');deny=true;response=await call({commentIds:[first.id],status:'approved'});assert.equal(response.status,403);assert.equal(readFileSync(path,'utf8'),retained);deny=false;checks++;
 // Unblock postcommit audit failure retains200 and safe warning. Foreign identity
 // is included in selection only to verify no cross-tenant private data leaks.
 store.blockCommentIdentity({siteId:'site-demo',reason:'standalone',email:'standalone@example.invalid',ipHash:'standalone-ip'});
 const ids=store.listCommentBlocklist('site-demo',{limit:100}).blocklist.map((e:any)=>e.id);auditFail=true;
 response=await unblock.DELETE(request('DELETE',{ids:[...ids,'foreign-site:email:private@example.invalid']}),{params:Promise.resolve({siteId:'site-demo'})});body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body.data.completionWarnings,['COMMENT_AUDIT_PENDING']);assert.equal(body.data.concurrencyBoundary,'demo-single-process');assert.equal(body.data.deletedCount,6);assert.equal(store.listCommentBlocklist('site-demo',{limit:100}).count,0);assert(!JSON.stringify(body).includes('credential'));auditFail=false;checks++;
 // Strict writer failure leaves both current memory and the original file intact.
 const pending=make(),fileBefore=readFileSync(path,'utf8'),memoryBefore=store.getCommentById(pending.id),directory=join(scratch,'data/backy'),backup=join(scratch,'data/backy-backup');
 renameSync(directory,backup);writeFileSync(directory,'owned persistence blocker');
 response=await call({commentIds:[pending.id],status:'blocked'});body=await response.json();assert.equal(response.status,503,JSON.stringify(body));assert.equal(body.error.code,'COMMENT_MODERATION_UNAVAILABLE');assert.deepEqual(store.getCommentById(pending.id),memoryBefore);
 unlinkSync(directory);renameSync(backup,directory);assert.equal(readFileSync(path,'utf8'),fileBefore);assert.equal(store.listCommentBlocklist('site-demo',{limit:100}).count,0);checks++;
 writeFileSync(path,'{corrupt');response=await call({commentIds:[pending.id],status:'approved'});body=await response.json();assert.equal(response.status,503);assert.equal(body.error.code,'COMMENT_INVENTORY_INCOMPLETE');assert.equal(readFileSync(path,'utf8'),'{corrupt');writeFileSync(path,fileBefore);checks++;
 // A deleted comment between actual detail preflight and its JSON await does not
 // manufacture identity blocks from the earlier snapshot.
 const deleted=make(),req=request('PATCH',{status:'blocked'});req.json=async()=>{store.deleteCommentSubtree('site-demo',deleted.id);return{status:'blocked'};};response=await detail.PATCH(req,{params:Promise.resolve({siteId:'site-demo',commentId:deleted.id})});body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(store.getCommentById(deleted.id),undefined);assert.equal(store.listCommentBlocklist('site-demo',{limit:100}).count,0);checks++;
 console.log(`Comment moderation actual demo admission PASS ${checks} cases: atomic selected status/identity snapshot, explicit missing/tenant outcomes, extensions preserved, clear reports retains current status, early denial, standalone identity and unblock warnings, persistence/corruption failures with no writes and deleted preflight race. Single-process only; no provider/configuredDB.`);
} finally {process.chdir(previousCwd);rmSync(scratch,{recursive:true,force:true});}
