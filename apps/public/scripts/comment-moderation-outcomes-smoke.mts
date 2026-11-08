import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';
const site={id:'comment-outcomes',slug:'comment-outcomes'},base={siteId:site.id,targetType:'page',targetId:'page-one',parentId:null,status:'pending',content:'Preserved authored content',authorEmail:'private@example.invalid',reportCount:2,reportReasons:['spam'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
let mode='',rows:any[]=[],notifications=0,audits=0,events=0,writes=0,demo=false;
const update=async(_site:string,id:string,input:any)=>{const index=rows.findIndex(row=>row.id===id);rows[index]={...rows[index],...input};writes++;return{item:structuredClone(rows[index])};};
const repositories:any={sites:{getById:async()=>site,getBySlug:async()=>site},comments:{moderateBatch:async(sid:string,input:any)=>{const ids=[...new Set<string>(input.commentIds)],updated=[];for(const id of ids){if(!rows.some(row=>row.id===id))continue;updated.push((await update(sid,id,{...(input.status?{status:input.status}:{}),...(input.clearReports?{reportCount:0,reportReasons:[]}:{}),reviewedBy:input.actor||input.reviewedBy||input.defaultReviewer||null})).item);}return{updated,missingIds:ids.filter(id=>!rows.some(row=>row.id===id))};},report:async(sid:string,id:string,input:any)=>{const current=rows.find(row=>row.id===id);assert.equal(current.status,'approved');const reportCount=(current.reportCount||0)+1;return update(sid,id,{reportCount,reportReasons:[...new Set([...current.reportReasons,input.reason])],status:reportCount>=3?'spam':current.status});},getById:async(_site:string,id:string)=>structuredClone(rows.find(row=>row.id===id)),update,blockIdentity:async()=>[]},auditLogs:{record:async()=>{events++;if(mode==='event')throw Error('private interaction persistence detail');return{};}}};
const mocks:any={'@/lib/backyStore':{getSiteByIdOrSlug:()=>site,getCommentById:(id:string)=>structuredClone(rows.find(row=>row.id===id)),getCommentReportReasons:()=>['spam','other'],updateCommentStatus:(id:string,input:any)=>{const i=rows.findIndex(row=>row.id===id);rows[i]={...rows[i],...input};writes++;return structuredClone(rows[i]);},bulkUpdateCommentStatus:({commentIds,...input}:any)=>{const updated=rows.filter(row=>commentIds.includes(row.id)).map(row=>mocks['@/lib/backyStore'].updateCommentStatus(row.id,input));return{updated,missingIds:[]};}},'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-operator'}}})},'@/lib/commentPrivacy':{},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/commentDelivery':{notifyCommentDelivery:async()=>{notifications++;if(mode.includes('notification'))throw Error('private provider delivery detail');return{failedChannels:0};}},'@/lib/adminAudit':{recordAdminAudit:async()=>{audits++;if(mode.includes('audit'))throw Error('private audit persistence detail');return{};}},'@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{})};
mocks['@/lib/commentRepositorySupport']=loadMediaFixture('../src/lib/commentRepositorySupport.ts',mocks);
const detail=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts',mocks),bulk=loadMediaFixture('../src/app/api/sites/[siteId]/comments/route.ts',mocks);
const request=(body:any)=>new NextRequest(`http://fixture.invalid/api/sites/${site.id}/comments`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
let reproduced=0,checks=0;
for(const test of [{name:'detail notification',kind:'detail',fault:'notification',warning:'COMMENT_DELIVERY_PENDING'}, {name:'detail audit',kind:'detail',fault:'audit',warning:'COMMENT_AUDIT_PENDING'}, {name:'detail activity',kind:'detail',fault:'event',warning:'COMMENT_ACTIVITY_PENDING'}, {name:'bulk notification',kind:'bulk',fault:'notification',warning:'COMMENT_DELIVERY_PENDING'}, {name:'bulk audit',kind:'bulk',fault:'audit',warning:'COMMENT_AUDIT_PENDING'}, {name:'bulk activity',kind:'bulk',fault:'event',warning:'COMMENT_ACTIVITY_PENDING'}, {name:'thread activity',kind:'thread',fault:'event',warning:'COMMENT_ACTIVITY_PENDING'}, {name:'clear reports activity',kind:'bulk',fault:'event',warning:'COMMENT_ACTIVITY_PENDING',clear:true}, {name:'independent followup failures',kind:'detail',fault:'notification-audit',warning:'COMMENT_DELIVERY_PENDING'}, {name:'demo detail notification',kind:'detail',fault:'notification',warning:'COMMENT_DELIVERY_PENDING',demo:true}, {name:'demo bulk audit',kind:'bulk',fault:'audit',warning:'COMMENT_AUDIT_PENDING',demo:true}]) {
 mode=test.fault;demo=Boolean(test.demo);rows=[{...base,id:'root-a',parentId:test.kind==='thread'?'old-parent':null},{...base,id:'root-b'}];notifications=audits=events=writes=0;
 const response=test.kind!=='bulk'?await detail.PATCH(request(test.kind==='thread'?{parentId:'root-b'}:{status:'approved'}),{params:Promise.resolve({siteId:site.id,commentId:'root-a'})}):await bulk.PATCH(request(test.clear?{clearReports:true,commentIds:['root-a','root-b']}:{status:'approved',commentIds:['root-a','root-b']}),{params:Promise.resolve({siteId:site.id})});
 const body=await response.json();
 if(process.argv.includes('--expect-known-failure')){assert.equal(response.status,500,test.name);assert.equal(rows[0].status,'approved');assert.ok(writes>0);reproduced++;continue;}
 assert.equal(response.status,200,test.name+' '+JSON.stringify(body));assert.ok(body.data.completionWarnings.includes(test.warning));assert.equal(body.success,true);if(test.kind==='thread')assert.equal(rows[0].parentId,'root-b');else if(test.clear){assert.equal(rows[0].reportCount,0);assert.equal(rows[0].reportReasons.length,0);}else assert.equal(rows[0].status,'approved');if(test.fault==='notification-audit')assert.ok(body.data.completionWarnings.includes('COMMENT_AUDIT_PENDING'));assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(body).includes('private provider'));assert.ok(!JSON.stringify(body).includes('private audit'));assert.ok(!JSON.stringify(body).includes('private interaction'));assert.equal(notifications,test.kind==='bulk'?2:1,'Delivery still attempted independently');assert.equal(audits,1,'Audit still attempted independently');if(test.kind==='bulk')assert.equal(body.data.updatedCount,2);checks++;
}
console.log(process.argv.includes('--expect-known-failure')?`Proven comment moderation false500 cases: ${reproduced}; committed writes observed through actual handlers/helpers, isolated adapters.`:`Comment moderation postcommit outcomes PASS: ${checks} actual-handler/helper cases; activity/delivery/audit failures retain200, independent followups, counts/no-store and sanitized warnings. Adapter fixtures; provider/browser/SQL proof separate.`);
// Load the actual notifier and both actual delivery functions. Only the email
// transport is a fixture; the webhook receives a real owned HTTP503 response.
const { createServer } = await import('node:http');
let webhookCalls=0,emailCalls=0,deliveryEvents:any[]=[],notificationSettings:any={};
const attempts=new Map<string,any>();repositories.commentDeliveries={admit:async(input:any)=>{const row={...input,id:'delivery-'+attempts.size,state:'pending'};attempts.set(row.id,row);return row;},settle:async(_site:string,id:string,outcome:any)=>{const row={...attempts.get(id),...outcome};attempts.set(id,row);return row;}};
const webhook=createServer((_req,res)=>{webhookCalls++;res.statusCode=503;res.end('Owned failing delivery endpoint');});
await new Promise<void>(resolve=>webhook.listen(0,'127.0.0.1',resolve));
try {
 const address=webhook.address() as any, target=`http://127.0.0.1:${address.port}/delivery`;
 repositories.settings={get:async()=>({integrations:{notifications:notificationSettings}})};
 repositories.auditLogs.record=async(input:any)=>{deliveryEvents.push(structuredClone(input));return{};};
 const notifier=loadMediaFixture('../src/lib/commentDelivery.ts',{...mocks,'@/lib/demoCommentDeliveryJournal':{},'@/lib/formEmailDelivery':{EmailDeliveryError:class extends Error{},getEmailDeliveryConfig:()=>({provider:'fixture',from:'fixture@example.invalid'}),buildCommentNotificationEmail:()=>({subject:'Synthetic notification'}),sendEmailMessage:async()=>{emailCalls++;throw Error('private synthetic SMTP credential detail');}}},{...process,env:{}},{fetch});
 mocks['@/lib/commentDelivery']=notifier;
 const actualDetail=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts',mocks),actualBulk=loadMediaFixture('../src/app/api/sites/[siteId]/comments/route.ts',mocks);
 mode='';demo=false;
 notificationSettings={webhookUrl:target,email:{recipient:'fixture@example.invalid',comments:true}};
 rows=[{...base,id:'root-a'},{...base,id:'root-b'}];
 let outcome=await notifier.notifyCommentDelivery({repositories,siteId:site.id,comment:rows[0],kind:'comment-status'});
 assert.equal(outcome.attemptedChannels,2);assert.equal(outcome.failedChannels,2);assert.equal(webhookCalls,1);assert.equal(emailCalls,1);
 assert.ok(!JSON.stringify(outcome).includes('private'));assert.ok(!JSON.stringify(outcome).includes(target));
 for(const handler of ['detail','bulk']){
  const response=handler==='detail'?await actualDetail.PATCH(request({status:'approved'}),{params:Promise.resolve({siteId:site.id,commentId:'root-a'})}):await actualBulk.PATCH(request({status:'approved',commentIds:['root-a','root-b']}),{params:Promise.resolve({siteId:site.id})});
  const body=await response.json();assert.equal(response.status,200);assert.ok(body.data.completionWarnings.includes('COMMENT_DELIVERY_PENDING'));assert.ok(!JSON.stringify(body).includes('private synthetic'));checks++;
 }
 assert.ok(deliveryEvents.some(event=>event.metadata.status==='failed'&&event.metadata.statusCode===503),'Actual failed webhook event recorded');
 assert.ok(deliveryEvents.some(event=>event.metadata.channel==='email'&&event.metadata.deliveryState==='uncertain'),'Actual uncertain email event recorded');
 const before=webhookCalls+emailCalls;
 for(const settings of [{digestFrequency:'off',webhookUrl:target,email:{recipient:'fixture@example.invalid'}},{email:{comments:false,commentModeration:false}},{email:{comments:true}}]){
  notificationSettings=settings;outcome=await notifier.notifyCommentDelivery({repositories,siteId:site.id,comment:rows[0],kind:'comment-status'});assert.equal(outcome.attemptedChannels,0);assert.equal(outcome.failedChannels,0);checks++;
 }
 assert.equal(webhookCalls+emailCalls,before,'Disabled/no-recipient cases attempt nothing');
 notificationSettings={webhookUrl:target,email:{comments:false}};
 repositories.auditLogs.record=async()=>{throw Error('private delivery journal failure');};
 outcome=await notifier.notifyCommentDelivery({repositories,siteId:site.id,comment:rows[0],kind:'comment-status'});assert.equal(outcome.failedChannels,1);checks++;
 console.log(`Comment resolved delivery outcome PASS: ${checks} total cases; actual notifier/webhook HTTP503/email failure/journal failure, independently attempted channels and disabled/no-recipient zero attempts.`);
} finally { await new Promise<void>((resolve,reject)=>webhook.close(error=>error?reject(error):resolve())); }
// Real page/blog/report handlers retain successful commits when followups fail.
const publicMocks:any={...mocks,
 '@/lib/commentPolicy':loadMediaFixture('../src/lib/commentPolicy.ts',{}),
 '@/lib/commentCaptcha':{verifyCommentCaptcha:async()=>null},
 '@/lib/commentPrivacy':{isCommentTargetPublished:()=>true,isCommentPubliclyVisible:async()=>true,serializeComment:(comment:any)=>comment,resolveCommentVisitor:async()=>null},
 '@/lib/commentDelivery':{notifyCommentDelivery:async()=>({attemptedChannels:1,failedChannels:1,channels:[{channel:'webhook',status:'failed'}]})},
};
publicMocks['@/lib/backyStore']={...mocks['@/lib/backyStore'],validateAndClassifyComment:()=>({ok:true,status:'pending'})};
repositories.pages={getById:async()=>({id:'page-one',status:'published'})};repositories.posts={getById:async()=>({id:'post-one',status:'published'})};
repositories.comments.create=async(input:any)=>{const item={...input,id:'created-'+writes,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};rows.push(item);writes++;return{item};};
for(const kind of ['pages/[pageId]','blog/[postId]']){
 const handler=loadMediaFixture(`../src/app/api/sites/[siteId]/${kind}/comments/route.ts`,publicMocks);
 rows=[];writes=0;demo=false;repositories.auditLogs.record=async()=>{throw Error('private activity failure');};
 const body={content:'Actual created reply survives notification failure',authorName:'Synthetic author',startedAt:Date.now()-3000};
 const response=await handler.POST(new NextRequest('http://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({siteId:site.id,pageId:'page-one',postId:'post-one'})});
 const payload=await response.json();assert.equal(response.status,201,JSON.stringify(payload));assert.equal(rows.length,1);assert.ok(payload.data.completionWarnings.includes('COMMENT_ACTIVITY_PENDING'));assert.ok(payload.data.completionWarnings.includes('COMMENT_DELIVERY_PENDING'));assert.equal(response.headers.get('cache-control'),'no-store');checks++;
}
rows=[{...base,id:'root-a',status:'approved'}];writes=0;demo=false;
const report=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts',publicMocks);
const response=await report.POST(new NextRequest('http://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:'spam'})}),{params:Promise.resolve({siteId:site.id,commentId:'root-a'})});
const payload=await response.json();assert.equal(response.status,201,JSON.stringify(payload));assert.equal(rows[0].reportCount,3);assert.ok(payload.data.completionWarnings.includes('COMMENT_ACTIVITY_PENDING'));assert.ok(payload.data.completionWarnings.includes('COMMENT_DELIVERY_PENDING'));assert.equal(writes,1);checks++;
console.log(`Comment submission/report postcommit PASS: ${checks} total actual-handler/helper cases; page/blog201 and report201 retain committed data with sanitized independent followup warnings.`);
// Operator publication is separately admitted; visitor body hints cannot weaken
// manual moderation. The auth fixture models allow/deny, not provider identity.
const { NextResponse }=await import('next/server');
for(const kind of ['pages/[pageId]','blog/[postId]']){
 let admissionCalls=0;
 const authorMocks={...publicMocks,'@/lib/adminAccess':{requireAdminAccess:async(req:any,_id:any,options:any)=>{admissionCalls++;assert.equal(options.permission,'comments.manage');return req.headers.get('x-backy-admin-key')==='admitted-operator'?{}:NextResponse.json({success:false,error:{code:'FORBIDDEN_SITE_SCOPE'}},{status:403});}},'@/lib/commentPrivacy':{...publicMocks['@/lib/commentPrivacy'],hasCommentCredentials:(req:any)=>Boolean(req.headers.get('x-backy-admin-key'))},'@/lib/backyStore':{...publicMocks['@/lib/backyStore'],validateAndClassifyComment:(input:any)=>({ok:true,status:input.moderationMode==='auto-approve'?'approved':'pending'})}};
 const handler=loadMediaFixture(`../src/app/api/sites/[siteId]/${kind}/comments/route.ts`,authorMocks);
 for(const [credential,expected] of [[null,'pending'],['admitted-operator','approved'],['wrong-site-operator','denied']] as const){
  rows=[];writes=0;demo=false;
  const response=await handler.POST(new NextRequest('http://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(credential?{'x-backy-admin-key':credential}:{})},body:JSON.stringify({content:'Explicit publish intent',authorName:'Synthetic author',moderationMode:'auto-approve',startedAt:Date.now()-3000})}),{params:Promise.resolve({siteId:site.id,pageId:'page-one',postId:'post-one'})});
  if(expected==='denied'){assert.equal(response.status,403);assert.equal(writes,0);}else{assert.equal(response.status,201);assert.equal((await response.json()).data.comment.status,expected);}checks++;
 }
 assert.equal(admissionCalls,2,'Anonymous body does not request operator admission');
}
console.log(`Comment operator publication PASS: ${checks} total cases; page/blog admitted comments.manage publication, anonymous manual policy retained and denied operator no writes.`);
