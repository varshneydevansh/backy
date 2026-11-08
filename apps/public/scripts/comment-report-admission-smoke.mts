// Actual demo store + actual report HTTP handler, always in owned scratch data.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
const previousCwd=process.cwd(),scratch=mkdtempSync('/tmp/backy-report-admission-');
process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';
try {
 const imported=await import('../src/lib/backyStore.ts'),store:any=(imported as any).default||imported;
 const routeImport=await import('../src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts'),route:any=(routeImport as any).default||routeImport;
 store.updateAdminSite('site-demo',{isPublished:true});store.updateAdminPage('site-demo','page-home',{status:'published'});
 const make=()=>store.createComment({siteId:'site-demo',targetType:'page',targetId:'page-home',content:'Actual demo authored content',authorName:'Synthetic author',authorEmail:'private@example.invalid',ipHash:'private-network',status:'approved',requestId:'retained-request'});
 let checks=0;
 const current=make();store.updateCommentStatus(current.id,{status:'approved',reviewedBy:'real-moderator'});
 const before=store.getCommentById(current.id);
 store.reportComment({siteId:'site-demo',commentId:current.id,reason:'spam',actor:'arbitrary-reporter'});
 store.reportComment({siteId:'site-demo',commentId:current.id,reason:'harassment',actor:'another-reporter'});
 const after=store.getCommentById(current.id);
 assert.equal(after.reportCount,2);assert.deepEqual([...after.reportReasons].sort(),['harassment','spam']);
 for(const key of Object.keys(before).filter(key=>!['reportCount','reportReasons','updatedAt'].includes(key)))assert.deepEqual(after[key],before[key],key);
 checks++;
 store.reportComment({siteId:'site-demo',commentId:current.id,reason:'other'});assert.equal(store.getCommentById(current.id).status,'spam');
 assert.throws(()=>store.reportComment({siteId:'site-demo',commentId:current.id,reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');assert.equal(store.getCommentById(current.id).reportCount,3);checks++;
 const path=join(scratch,'data/backy/interactions.json');
 async function call(id:string,preReadChange:()=>void=()=>{},payload:any={reason:'spam'}){
   const request=new NextRequest('http://fixture.invalid/api/sites/site-demo/comments/'+id+'/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   // json() is awaited only after visibility preflight. Mutate authoritative
   // actual store at this boundary to reproduce pre-read → admission races.
   request.json=async()=>{preReadChange();return payload;};
   return route.POST(request,{params:Promise.resolve({siteId:'site-demo',commentId:id})});
 }
 for(const kind of ['moderated','deleted','target-withdrawn','site-withdrawn','reports-disabled']){
   const row=make();let afterMutation='';
   const response=await call(row.id,()=>{
     if(kind==='moderated')store.updateCommentStatus(row.id,{status:'rejected',reviewedBy:'current-moderator',rejectionReason:'Current decision'});
     if(kind==='deleted')store.deleteCommentSubtree('site-demo',row.id);
     if(kind==='target-withdrawn')store.updateAdminPage('site-demo','page-home',{status:'draft'});
     if(kind==='site-withdrawn')store.updateAdminSite('site-demo',{isPublished:false});
     if(kind==='reports-disabled'){const site=store.getSiteByIdOrSlug('site-demo');store.updateAdminSite('site-demo',{settings:{commentPolicy:{...site.settings.commentPolicy,enableReports:false}}});}
     afterMutation=readFileSync(path,'utf8');
   });
   const body=await response.json();assert.equal(response.status,409,kind+': '+JSON.stringify(body));assert.equal(body.error.code,'COMMENT_REPORT_CONFLICT');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(readFileSync(path,'utf8'),afterMutation,'No report persistence after '+kind);assert(!JSON.stringify(body).includes('private'));checks++;
   store.updateAdminSite('site-demo',{isPublished:true});store.updateAdminPage('site-demo','page-home',{status:'published'});
   const site=store.getSiteByIdOrSlug('site-demo');store.updateAdminSite('site-demo',{settings:{commentPolicy:{...site.settings.commentPolicy,enableReports:true}}});
 }
 const row=make();const response=await call(row.id,()=>{}, {reason:'privacy',actor:'untrusted-reporter'}),body=await response.json();assert.equal(response.status,201,JSON.stringify(body));assert.deepEqual(body.data.completionWarnings,[]);assert.equal(body.data.comment.content,row.content);for(const key of ['authorEmail','ipHash','reviewedBy','reportCount','reportReasons','requestId'])assert.equal(body.data.comment[key],undefined,key);assert.equal(store.getCommentById(row.id).reportCount,1);checks++;
 const foreign=make();assert.throws(()=>store.reportComment({siteId:'foreign-site',commentId:foreign.id,reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');assert.equal(store.getCommentById(foreign.id).reportCount,0);checks++;
 console.log(`Comment report actual demo admission PASS ${checks} cases: increments/reason union, threshold, moderation attribution, actual HTTP pre-read races for changed status/deletion/target/site/policy, no writes/private fields, clean201 warnings and foreign denial. Synchronous single-process only; no cross-process claim.`);
} finally {process.chdir(previousCwd);rmSync(scratch,{recursive:true,force:true});}
