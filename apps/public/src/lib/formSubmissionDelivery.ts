import { sanitizeDeliveryProviderEvidence, BackyFormDeliveryError, formDeliveryErrorDetails, type BackyFormDeliveryAttempt, type FormDefinition, type FormSubmission } from '@backy-cms/core';
import { formDeliveryJournal, getFormDeliveryEvent, formDeliveryAttemptEvent } from './formDeliveryHistory';
import { recordRepositoryInteractionEvent } from './commentRepositorySupport';
import { trackWebhookEvent } from './backyStore';
import { buildFormNotificationEmail, EmailDeliveryError, getEmailDeliveryConfig, sendEmailMessage } from './formEmailDelivery';
import type { getRequiredDatabaseRepositories } from './repositoryRuntime';
type Repositories=Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type Params={repositories?:Repositories|null;siteId:string;form:FormDefinition;submission:FormSubmission;requestId:string;channel:'webhook'|'email';target:string;retryOf?:string;actor?:string|null};
/** Admit before sending. Provider execution and journal settlement are deliberately separate. */
export async function deliverFormSubmission(params:Params){
 if(params.repositories && (params.repositories.forms.withSubmissionFollowup || params.submission.visitorMemberId)){
  if(!params.repositories.forms.withSubmissionFollowup)throw new BackyFormDeliveryError('VISITOR_PRIVACY_FENCE_UNAVAILABLE',503,'Persisted submission privacy fencing is unavailable. No provider request was made.');
  return params.repositories.forms.withSubmissionFollowup(params.siteId,params.form.id,params.submission.id,()=>deliverFormSubmissionAdmitted(params));
 }
 return deliverFormSubmissionAdmitted(params);
}
async function deliverFormSubmissionAdmitted(params:Params){
 const journal=formDeliveryJournal(params.repositories);let attempt:BackyFormDeliveryAttempt;
 try{attempt=await journal.admit({siteId:params.siteId,formId:params.form.id,submissionId:params.submission.id,kind:'form-submission',channel:params.channel,target:params.target,sourceEventId:params.retryOf||null,requestId:params.requestId,reason:params.submission.status,actor:params.actor||null});}
 catch(error){const details=formDeliveryErrorDetails(error);throw details?new BackyFormDeliveryError(details.code,details.status,details.message):new BackyFormDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Durable delivery admission is unavailable. No provider request was made.');}
 const completionWarnings:string[]=[];
 const project=async(state:string,statusCode?:number)=>{
  const event={kind:'form-submission' as const,siteId:params.siteId,formId:params.form.id,submissionId:params.submission.id,target:params.target,status:state==='uncertain'?'queued' as const:state==='pending'?'queued' as const:state==='succeeded'?'succeeded' as const:'failed' as const,requestId:params.requestId,statusCode,metadata:{channel:params.channel,attemptId:attempt.id,deliveryState:state,retry:Boolean(params.retryOf),retryOf:params.retryOf||null,submissionStatus:params.submission.status}};
  try{if(params.repositories)await recordRepositoryInteractionEvent(params.repositories,event);else trackWebhookEvent(event);}catch{if(!completionWarnings.includes('FORM_DELIVERY_ACTIVITY_PENDING'))completionWarnings.push('FORM_DELIVERY_ACTIVITY_PENDING');}
 };
 await project('pending');
 let providerHint:string|undefined=params.channel==='webhook'?'webhook':undefined;
 let result:{status:'succeeded'|'failed'|'uncertain';statusCode?:number;provider?:string;providerMessageId?:unknown;outboxOnly?:unknown};
 try{
  if(params.channel==='webhook'){
   const response=await fetch(params.target,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error',headers:{'Content-Type':'application/json','x-backy-site-id':params.siteId,'x-backy-form-id':params.form.id,'x-backy-submission-id':params.submission.id,'x-backy-delivery-attempt-id':attempt.id,...(params.retryOf?{'x-backy-webhook-retry':'true'}:{})},body:JSON.stringify({...(params.retryOf?{retry:true}:{}),formId:params.form.id,siteId:params.siteId,values:params.submission.values,submissionId:params.submission.id,status:params.submission.status,pageId:params.submission.pageId,postId:params.submission.postId})});
   result={status:response.ok?'succeeded':'failed',statusCode:response.status};
  }else{
   const config=getEmailDeliveryConfig(params.siteId);providerHint=config.provider;const message=buildFormNotificationEmail({config,siteId:params.siteId,form:params.form,submission:params.submission,values:params.submission.values||{},requestId:params.requestId,to:params.target.slice(7)});
   try{const response=await sendEmailMessage(config,message);result={status:'succeeded',statusCode:response.statusCode,provider:config.provider,providerMessageId:response.metadata?.providerMessageId,outboxOnly:response.metadata?.outboxOnly};}
   catch(error){if(error instanceof EmailDeliveryError&&error.statusCode&&error.statusCode>=400&&error.statusCode<=599)result={status:'failed',statusCode:error.statusCode,provider:config.provider};else throw error;}
  }
 }catch{result={status:'uncertain',provider:providerHint};}
 const providerEvidence=sanitizeDeliveryProviderEvidence({provider:result.provider||providerHint,observedAt:new Date().toISOString(),statusCode:result.statusCode,providerMessageId:result.providerMessageId,outboxOnly:result.outboxOnly});
 let persisted=attempt;
 try{persisted=await journal.settle(params.siteId,attempt.id,{state:result.status,statusCode:result.statusCode,providerEvidence,errorCode:result.status==='failed'?'PROVIDER_REJECTED':result.status==='uncertain'?'PROVIDER_COMPLETION_UNKNOWN':null});}catch{completionWarnings.push('FORM_DELIVERY_OUTCOME_PENDING');}
 await project(result.status,result.statusCode);
 const {providerMessageId:_providerMessageId,outboxOnly:_outboxOnly,...observed}=result;
 return {attempted:true as const,channel:params.channel,target:params.target,...observed,providerEvidence,attemptId:attempt.id,durableState:persisted.state,completionWarnings,...(result.status==='failed'?{error:'Provider rejected the delivery.'}:result.status==='uncertain'?{error:'Provider completion is unknown. Pending and uncertain attempts cannot be replayed.'}:{})};
}

export async function retryFormSubmissionDelivery(params:Omit<Params,'target'|'retryOf'>&{eventId?:string}){
 if(['spam','rejected'].includes(params.submission.status))throw new BackyFormDeliveryError('FORM_SUBMISSION_NOT_DELIVERABLE',409,'Spam or rejected submissions cannot be delivered.');
 const configured=params.channel==='email'?params.form.notificationEmail:params.form.notificationWebhook;
 const target=typeof configured==='string'&&configured.trim()?params.channel==='email'?'mailto:'+configured.trim():configured.trim():'';
 if(!target)throw new BackyFormDeliveryError('FORM_SUBMISSION_NOT_DELIVERABLE',409,'This form has no notification destination for the selected channel.');
 const journal=formDeliveryJournal(params.repositories);
 let source=params.eventId?await getFormDeliveryEvent(params.siteId,params.form.id,params.submission.id,params.eventId,params.repositories):null;
 if(!params.eventId){const latest=await journal.list({siteId:params.siteId,formId:params.form.id,submissionId:params.submission.id,channel:params.channel,target,limit:1,offset:0});if(!Array.isArray(latest.items)||!latest.pagination||latest.items.length>1||latest.items.some(row=>row.siteId!==params.siteId||row.formId!==params.form.id||row.submissionId!==params.submission.id||row.channel!==params.channel||row.target!==target))throw new BackyFormDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Scoped delivery history is unavailable.');source=latest.items[0]?formDeliveryAttemptEvent(latest.items[0]):null;}
 if(!source)throw new BackyFormDeliveryError(params.eventId?'DELIVERY_EVENT_NOT_FOUND':'DELIVERY_EVENT_NOT_FAILED',params.eventId?404:409,'A verified failed source is required. Reload history and select a failed delivery.');
 const channel=source.metadata?.channel==='email'?'email':'webhook';
 if(source.status!=='failed')throw new BackyFormDeliveryError('DELIVERY_EVENT_NOT_FAILED',409,'Pending, uncertain and successful deliveries cannot be replayed.');
 if(source.kind!=='form-submission'||channel!==params.channel||source.target!==target)throw new BackyFormDeliveryError('DELIVERY_EVENT_CONFLICT',409,'Notification identity changed. Reload the form and delivery history.');
 return deliverFormSubmission({...params,target,retryOf:source.id});
}
