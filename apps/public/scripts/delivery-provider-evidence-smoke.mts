// Actual delivery helpers and demo disk journals. Synthetic provider results only; no external I/O.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {loadMediaFixture} from './media-storage-recovery-fixture.mts';
import {sanitizeDeliveryProviderEvidence} from '../../../packages/core/dist/index.mjs';
const previous=process.cwd(),scratch=mkdtempSync('/tmp/backy-provider-evidence-');process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';
try{
 const imported=await import('../src/lib/backyStore.ts'),store:any=(imported as any).default||imported;
 const comment=store.createComment({siteId:'site-demo',targetType:'page',targetId:'page-home',content:'Owned synthetic comment',status:'approved'});
 const form=store.createAdminForm({siteId:'site-demo',name:'Owned synthetic form',fields:[],notificationEmail:'fixture@example.invalid'});
 const submission=store.createFormSubmission({siteId:'site-demo',formId:form.id,values:{retained:'private fixture'},status:'pending'});
 let checks=0,sends=0,provider='resend',throws=false,failSettle=false,webhookCode=202;
 const mocks:any={'@/lib/backyStore':store,'@/lib/commentRepositorySupport':{recordRepositoryInteractionEvent:async()=>{}},'@/lib/formEmailDelivery':{EmailDeliveryError:class extends Error{},getEmailDeliveryConfig:()=>({provider}),buildCommentNotificationEmail:()=>({}),buildFormNotificationEmail:()=>({}),sendEmailMessage:async()=>{sends++;if(throws)throw Error('NEVER-EXPOSE-TRANSPORT-SECRET');return {statusCode:202,metadata:{providerMessageId:'synthetic-message-123',outboxOnly:true,token:'NEVER-PERSIST-TOKEN',body:{private:'NEVER-PERSIST-PAYLOAD'}}};}}};
 for(const name of ['demoCommentDeliveryJournal','demoFormDeliveryJournal','commentDeliveryHistory','formDeliveryHistory'])mocks['@/lib/'+name]=loadMediaFixture('../src/lib/'+name+'.ts',mocks);
 const commentJournal=mocks['@/lib/demoCommentDeliveryJournal'].demoCommentDeliveryJournal,formJournal=mocks['@/lib/demoFormDeliveryJournal'].demoFormDeliveryJournal;
 const journal=(original:any)=>({...original,settle:async(...args:any[])=>{if(failSettle)throw Error('NEVER-EXPOSE-JOURNAL-SECRET');return original.settle(...args);}});
 const repository:any={commentDeliveries:journal(commentJournal),formDeliveries:journal(formJournal),settings:{get:async()=>({integrations:{notifications:{digestFrequency:'immediate',email:{comments:true,recipient:'fixture@example.invalid'}}}})}};
 const globals={fetch:async()=>{sends++;if(throws)throw Error('NEVER-EXPOSE-WEBHOOK-SECRET');return new Response('',{status:webhookCode});}};
 const commentHelper=loadMediaFixture('../src/lib/commentDelivery.ts',mocks,process,globals),formHelper=loadMediaFixture('../src/lib/formSubmissionDelivery.ts',mocks,process,globals);
 const deliver=async(kind:'comment'|'form',channel:'email'|'webhook'='email')=>{
  if(kind==='comment'){
   if(channel==='webhook')repository.settings.get=async()=>({integrations:{notifications:{digestFrequency:'immediate',webhookUrl:'https://provider.invalid/owned',email:{comments:false,commentModeration:false}}}});
   else repository.settings.get=async()=>({integrations:{notifications:{digestFrequency:'immediate',email:{comments:true,recipient:'fixture@example.invalid'}}}});
   return commentHelper.notifyCommentDelivery({repositories:repository,siteId:'site-demo',comment,kind:'comment-submitted',requestId:'owned-provider-proof'});
  }
  return formHelper.deliverFormSubmission({repositories:repository,siteId:'site-demo',form,submission,channel,target:channel==='email'?'mailto:fixture@example.invalid':'https://provider.invalid/owned',requestId:'owned-provider-proof'});
 };
 const latest=async(kind:'comment'|'form')=>(await (kind==='comment'?commentJournal:formJournal).list({siteId:'site-demo',limit:1,offset:0})).items[0];
 for(const kind of ['comment','form'] as const){
  provider='resend';throws=false;await deliver(kind);let row=await latest(kind);assert.equal(row.state,'succeeded');assert.equal(row.providerEvidence.provider,'resend');assert.equal(row.providerEvidence.providerMessageId,'synthetic-message-123');assert.equal(row.providerEvidence.statusCode,202);assert.equal(row.providerEvidence.outboxOnly,undefined);assert(!JSON.stringify(row).includes('NEVER-PERSIST'));checks+=6;
  provider='local-outbox';await deliver(kind);row=await latest(kind);assert.equal(row.state,'succeeded');assert.equal(row.providerEvidence.provider,'local-outbox');assert.equal(row.providerEvidence.outboxOnly,true);checks+=3;
  provider='smtp';throws=true;await deliver(kind);row=await latest(kind);assert.equal(row.state,'uncertain');assert.equal(row.providerEvidence.provider,'smtp');assert.equal(row.providerEvidence.providerMessageId,undefined);assert(!JSON.stringify(row).includes('NEVER-EXPOSE'));checks+=4;
  await deliver(kind,'webhook');row=await latest(kind);assert.equal(row.state,'uncertain');assert.equal(row.providerEvidence.provider,'webhook');checks+=2;
  throws=false;webhookCode=503;await deliver(kind,'webhook');row=await latest(kind);assert.equal(row.state,'failed');assert.equal(row.providerEvidence.provider,'webhook');assert.equal(row.providerEvidence.statusCode,503);checks+=3;
  provider='resend';failSettle=true;const observed=await deliver(kind);failSettle=false;row=await latest(kind);assert.equal(row.state,'pending');assert.equal(row.providerEvidence,null);assert(observed.completionWarnings.includes(kind==='comment'?'COMMENT_DELIVERY_OUTCOME_PENDING':'FORM_DELIVERY_OUTCOME_PENDING'));checks+=3;
 }
 const stamp=new Date().toISOString();
 assert.equal(sanitizeDeliveryProviderEvidence({provider:'unsupported',observedAt:stamp}),null);
 assert.equal(sanitizeDeliveryProviderEvidence({provider:'resend',observedAt:'invalid'}),null);
 for(const ref of ['Bearer PRIVATE','https://private.invalid/token','user:password','X'.repeat(201)])assert.equal(sanitizeDeliveryProviderEvidence({provider:'resend',observedAt:stamp,providerMessageId:ref})?.providerMessageId,undefined);
 const safe=sanitizeDeliveryProviderEvidence({provider:'resend',observedAt:stamp,providerMessageId:'known-id',token:'PRIVATE',outboxOnly:true,statusCode:200});assert.deepEqual(safe,{provider:'resend',observedAt:stamp,providerMessageId:'known-id',statusCode:200});checks+=7;
 assert.equal(sends,12);checks++;
 console.log(`Delivery provider evidence PASS ${checks}: actual comment/form helper + demo disk, Resend reference allowlist, local outbox distinction, transport uncertainty, explicit webhook rejection, failed settlement retains pending without invented durable receipt. Synthetic results/no external I/O.`);
}finally{process.chdir(previous);rmSync(scratch,{recursive:true,force:true});}
