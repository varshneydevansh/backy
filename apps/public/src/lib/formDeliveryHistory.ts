import { sanitizeDeliveryProviderEvidence, legacyFormDeliveryState, BackyFormDeliveryError, type BackyFormDeliveryAttempt } from '@backy-cms/core';
import { demoFormDeliveryJournal, getDemoFormDeliveryEvent } from '@/lib/demoFormDeliveryJournal';
import type { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';
type Repositories=Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
export function formDeliveryAttemptEvent(row:BackyFormDeliveryAttempt){return {id:row.id,siteId:row.siteId,formId:row.formId,kind:row.kind,submissionId:row.submissionId,target:row.target,
 status:row.state,statusCode:row.statusCode??undefined,requestId:row.requestId,reason:row.reason,actor:row.actor,
 metadata:{channel:row.channel,attemptId:row.id,retryOf:row.sourceEventId,deliveryState:row.state,retryAdmitted:Boolean(row.retryAttemptId),retryAttemptId:row.retryAttemptId||null,retry:Boolean(row.sourceEventId)},
 ...(row.state==='pending'||row.state==='uncertain'?{error:'Provider completion is unverified. Do not replay this attempt.'}:{}),createdAt:row.createdAt,updatedAt:row.updatedAt,providerEvidence:sanitizeDeliveryProviderEvidence(row.providerEvidence),reconciliationVersion:row.reconciliationVersion??0,reconciliations:row.reconciliations??[]};}
export function formDeliveryJournal(repositories?:Repositories|null){const journal=repositories?repositories.formDeliveries:demoFormDeliveryJournal;if(!journal)throw new BackyFormDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Durable delivery history is unavailable.');return journal;}
export async function getFormDeliveryEvent(siteId:string,formId:string,submissionId:string,eventId:string,repositories?:Repositories|null){
 const journal=formDeliveryJournal(repositories);
 if(eventId.startsWith('form-delivery-')){const row=await journal.get(siteId,formId,submissionId,eventId);return row?formDeliveryAttemptEvent(row):null;}
 if(!repositories){const event=getDemoFormDeliveryEvent(siteId,formId,submissionId,eventId);if(!event)return null;const id=event.metadata?.attemptId;
  if(typeof id==='string'){const row=await journal.get(siteId,formId,submissionId,id);return row?formDeliveryAttemptEvent(row):null;}return {...event,status:legacyFormDeliveryState(event.status,event.statusCode)};}
 if(!repositories.auditLogs.getById)throw new BackyFormDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Scoped delivery lookup is unavailable.');
 const event=await repositories.auditLogs.getById(siteId,eventId);
 if(!event||event.entity!=='formSubmission'||event.entityId!==submissionId||event.metadata?.formId!==formId)return null;
 const meta=event.metadata||{},id=meta.attemptId;
 if(typeof id==='string'){const row=await journal.get(siteId,formId,submissionId,id);return row?formDeliveryAttemptEvent(row):null;}
 return {id:event.id,siteId:event.siteId,formId,kind:event.action,submissionId:event.entityId,target:typeof meta.target==='string'?meta.target:'',
 status:legacyFormDeliveryState(meta.status,meta.statusCode),requestId:event.requestId,reason:typeof meta.reason==='string'?meta.reason:null,
 actor:event.actorId,metadata:meta};
}
