import { sanitizeDeliveryProviderEvidence, legacyCommentDeliveryState, BackyCommentDeliveryError, type BackyCommentDeliveryAttempt } from '@backy-cms/core';
import { demoCommentDeliveryJournal, getDemoCommentDeliveryEvent } from '@/lib/demoCommentDeliveryJournal';
import type { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';
type Repositories=Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
export function deliveryAttemptEvent(row:BackyCommentDeliveryAttempt){return {id:row.id,siteId:row.siteId,kind:row.kind,commentId:row.commentId,target:row.target,
 status:row.state,statusCode:row.statusCode??undefined,requestId:row.requestId,reason:row.reason,actor:row.actor,
 metadata:{channel:row.channel,attemptId:row.id,retryOf:row.sourceEventId,deliveryState:row.state,retryAdmitted:Boolean(row.retryAttemptId),retryAttemptId:row.retryAttemptId||null,retry:Boolean(row.sourceEventId)},
 ...(row.state==='pending'||row.state==='uncertain'?{error:'Provider completion is unverified. Do not replay this attempt.'}:{}),createdAt:row.createdAt,updatedAt:row.updatedAt,providerEvidence:sanitizeDeliveryProviderEvidence(row.providerEvidence),reconciliationVersion:row.reconciliationVersion??0,reconciliations:row.reconciliations??[]};}
export function commentDeliveryJournal(repositories?:Repositories|null){const journal=repositories?repositories.commentDeliveries:demoCommentDeliveryJournal;if(!journal)throw new BackyCommentDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Durable delivery history is unavailable.');return journal;}
export async function getCommentDeliveryEvent(siteId:string,commentId:string,eventId:string,repositories?:Repositories|null){
 const journal=commentDeliveryJournal(repositories);
 if(eventId.startsWith('delivery-')){const row=await journal.get(siteId,commentId,eventId);return row?deliveryAttemptEvent(row):null;}
 if(!repositories){const event=getDemoCommentDeliveryEvent(siteId,commentId,eventId);if(!event)return null;const id=event.metadata?.attemptId;
  if(typeof id==='string'){const row=await journal.get(siteId,commentId,id);return row?deliveryAttemptEvent(row):null;}return {...event,status:legacyCommentDeliveryState(event.status,event.statusCode)};}
 if(!repositories.auditLogs.getById)throw new BackyCommentDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Scoped delivery lookup is unavailable.');
 const event=await repositories.auditLogs.getById(siteId,eventId);
 if(!event||event.entity!=='comment'||event.entityId!==commentId)return null;
 const meta=event.metadata||{},id=meta.attemptId;
 if(typeof id==='string'){const row=await journal.get(siteId,commentId,id);return row?deliveryAttemptEvent(row):null;}
 return {id:event.id,siteId:event.siteId,kind:event.action,commentId:event.entityId,target:typeof meta.target==='string'?meta.target:'',
 status:legacyCommentDeliveryState(meta.status,meta.statusCode),requestId:event.requestId,reason:typeof meta.reason==='string'?meta.reason:null,
 actor:event.actorId,metadata:meta};
}
