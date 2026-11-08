import { isDeliveryReconciliationInput, sanitizeDeliveryProviderEvidence, type BackyDeliveryReconciliation, legacyCommentDeliveryState, assertCommentDeliverySource, assertCommentDeliveryAdmission, BackyCommentDeliveryError, type BackyCommentDeliveryAttempt, type BackyCommentDeliveryRepository } from '@backy-cms/core';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';
const {commentDeliveryReconciliations:reviews,commentDeliveryAttempts:attempts,sites,comments,activityLogs}=schema;
const uuid=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const rowId=(id:string)=>id.startsWith('delivery-')?id.slice(9):'';
function toAttempt(row:typeof attempts.$inferSelect,reconciliations:BackyDeliveryReconciliation[]=[]):BackyCommentDeliveryAttempt {return {...row,providerEvidence:sanitizeDeliveryProviderEvidence(row.providerEvidence),reconciliations,reconciliationVersion:reconciliations.at(-1)?.version||0,id:'delivery-'+row.id,kind:row.kind as BackyCommentDeliveryAttempt['kind'],channel:row.channel as BackyCommentDeliveryAttempt['channel'],state:row.state as BackyCommentDeliveryAttempt['state'],createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};}
function toReview(row:typeof reviews.$inferSelect):BackyDeliveryReconciliation {return {id:'delivery-review-'+row.id,version:row.version,actorId:row.actorId,requestId:row.requestId,createdAt:row.createdAt.toISOString(),observedUpdatedAt:row.observedUpdatedAt.toISOString(),observedState:row.observedState as BackyDeliveryReconciliation['observedState'],evidence:row.evidence as BackyDeliveryReconciliation['evidence'],disposition:'retain-without-resend'};}
const unavailable=()=>new BackyCommentDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Durable delivery admission is unavailable. No provider request was made.');
export function createCommentDeliveryRepository(db:DatabaseInstance,adapterType:string):BackyCommentDeliveryRepository {
 const database=db as NodePgDatabase<typeof schema>;const ensure=()=>{if(adapterType!=='postgres')throw unavailable();};
 return {
  async get(siteId,commentId,id){ensure();if(!uuid(rowId(id)))return null;return database.transaction(async tx=>{const [row]=await tx.select().from(attempts).where(and(eq(attempts.siteId,siteId),eq(attempts.commentId,commentId),eq(attempts.id,rowId(id))));if(!row)return null;const history=await tx.select().from(reviews).where(and(eq(reviews.siteId,siteId),eq(reviews.attemptId,row.id))).orderBy(reviews.version);return toAttempt(row,history.map(toReview));},{isolationLevel:'repeatable read',accessMode:'read only'});},
  async admit(input){ensure();assertCommentDeliveryAdmission(input);input={...input};return database.transaction(async tx=>{
   const [site]=await tx.select({id:sites.id}).from(sites).where(eq(sites.id,input.siteId)).for('update');
   const [comment]=site?await tx.select({id:comments.id}).from(comments).where(and(eq(comments.siteId,input.siteId),eq(comments.id,input.commentId))).for('update'):[];
   if(!comment)throw new BackyCommentDeliveryError('COMMENT_NOT_FOUND',404,'Comment not found.');
   if(input.sourceEventId){
    let source:any=null;
    if(uuid(rowId(input.sourceEventId))){const [row]=await tx.select().from(attempts).where(and(eq(attempts.siteId,input.siteId),eq(attempts.commentId,input.commentId),eq(attempts.id,rowId(input.sourceEventId)))).for('update');source=row;}
    else if(uuid(input.sourceEventId)){const [row]=await tx.select().from(activityLogs).where(and(eq(activityLogs.id,input.sourceEventId),eq(activityLogs.siteId,input.siteId),eq(activityLogs.entityType,'comment'),eq(activityLogs.entityId,input.commentId))).for('update');if(row){const details=row.details as Record<string,unknown>|null;source={siteId:row.siteId,commentId:row.entityId,kind:row.action,channel:details?.channel,target:details?.target,state:legacyCommentDeliveryState(details?.status,details?.statusCode)};if(typeof details?.attemptId==='string'&&uuid(rowId(details.attemptId))){const [authority]=await tx.select().from(attempts).where(and(eq(attempts.siteId,input.siteId),eq(attempts.commentId,input.commentId),eq(attempts.id,rowId(details.attemptId)))).for('update');source=authority||null;input.sourceEventId=details.attemptId;}}}
    assertCommentDeliverySource(input,source);
    const [used]=await tx.select({id:attempts.id}).from(attempts).where(and(eq(attempts.siteId,input.siteId),eq(attempts.sourceEventId,input.sourceEventId)));
    if(used)throw new BackyCommentDeliveryError('DELIVERY_RETRY_ALREADY_ADMITTED',409,'This event already has a delivery attempt. Reload history; pending or uncertain attempts must not be replayed.');
   }
   const [row]=await tx.insert(attempts).values({...input,sourceEventId:input.sourceEventId||null}).returning();return toAttempt(row);
  });},
  async recordReconciliation(input){ensure();const {siteId,attemptId,commentId,...reviewInput}=input;
   if(!isDeliveryReconciliationInput(reviewInput))throw new BackyCommentDeliveryError('DELIVERY_RECONCILIATION_INVALID',400,'Invalid delivery investigation.');
   if(!uuid(rowId(attemptId)))throw new BackyCommentDeliveryError('DELIVERY_EVENT_NOT_FOUND',404,'Delivery attempt not found.');
   return database.transaction(async tx=>{
    const [before]=await tx.select().from(attempts).where(and(eq(attempts.siteId,siteId),eq(attempts.id,rowId(attemptId)),eq(attempts.commentId,input.commentId))).for('update');
    if(!before)throw new BackyCommentDeliveryError('DELIVERY_EVENT_NOT_FOUND',404,'Delivery attempt not found.');
    const history=await tx.select().from(reviews).where(and(eq(reviews.siteId,siteId),eq(reviews.attemptId,before.id))).orderBy(reviews.version);
    const version=history.at(-1)?.version||0;
    if(before.state!==input.expectedState||before.updatedAt.toISOString()!==input.expectedUpdatedAt||version!==input.expectedReviewVersion)throw new BackyCommentDeliveryError('DELIVERY_RECONCILIATION_CONFLICT',409,'The delivery attempt or investigation history changed. Reload before reviewing.');
    const [saved]=await tx.insert(reviews).values({siteId,attemptId:before.id,version:version+1,actorId:input.actorId,requestId:input.requestId,observedUpdatedAt:before.updatedAt,observedState:before.state,evidence:input.evidence,disposition:input.disposition}).returning();
    return toAttempt(before,[...history,saved].map(toReview));
   });
  },
  async settle(siteId,id,input){ensure();if(!['succeeded','failed','uncertain'].includes(input.state))throw unavailable();if(!uuid(rowId(id)))throw unavailable();return database.transaction(async tx=>{
   const [before]=await tx.select().from(attempts).where(and(eq(attempts.siteId,siteId),eq(attempts.id,rowId(id)))).for('update');
   if(!before||before.state!=='pending')throw new BackyCommentDeliveryError('DELIVERY_OUTCOME_CONFLICT',409,'The durable delivery outcome cannot be replaced.');
   const [row]=await tx.update(attempts).set({state:input.state,statusCode:input.statusCode??null,errorCode:input.errorCode??null,providerEvidence:sanitizeDeliveryProviderEvidence(input.providerEvidence),updatedAt:new Date()}).where(eq(attempts.id,before.id)).returning();const history=await tx.select().from(reviews).where(and(eq(reviews.siteId,siteId),eq(reviews.attemptId,row.id))).orderBy(reviews.version);return toAttempt(row,history.map(toReview));
  });},
  async list(input){ensure();return database.transaction(async tx=>{const where=and(eq(attempts.siteId,input.siteId),input.commentId?eq(attempts.commentId,input.commentId):undefined),limit=Math.max(1,Math.min(100,Math.floor(input.limit))),offset=Math.max(0,Math.floor(input.offset));const [total]=await tx.select({total:count()}).from(attempts).where(where);const rows=await tx.select().from(attempts).where(where).orderBy(desc(attempts.createdAt),desc(attempts.id)).limit(limit).offset(offset);const admitted=rows.length?await tx.select({id:attempts.id,sourceEventId:attempts.sourceEventId}).from(attempts).where(and(eq(attempts.siteId,input.siteId),inArray(attempts.sourceEventId,rows.map(row=>'delivery-'+row.id)))):[];const history=rows.length?await tx.select().from(reviews).where(and(eq(reviews.siteId,input.siteId),inArray(reviews.attemptId,rows.map(row=>row.id)))).orderBy(reviews.version):[];return {items:rows.map(row=>({...toAttempt(row,history.filter(review=>review.attemptId===row.id).map(toReview)),...(admitted.find(a=>a.sourceEventId==='delivery-'+row.id)?{retryAttemptId:'delivery-'+admitted.find(a=>a.sourceEventId==='delivery-'+row.id)!.id}:{})})),pagination:{total:Number(total.total),limit,offset,hasMore:offset+rows.length<Number(total.total)}};},{isolationLevel:'repeatable read',accessMode:'read only'});},
 };
}
