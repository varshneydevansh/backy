import type { BackyDeliveryProviderEvidence, BackyDeliveryReconciliation, BackyDeliveryReconciliationInput } from './delivery-reconciliation';
/** Private server journal. Provider completion is not inferred from a queued audit event. */
export type BackyFormDeliveryState = 'pending' | 'succeeded' | 'failed' | 'uncertain';
export interface BackyFormDeliveryAttempt {
  id: string; siteId: string; formId: string; submissionId: string;
  kind: 'form-submission';
  channel: 'webhook' | 'email'; target: string;
  sourceEventId: string | null; requestId: string; reason: string | null; actor: string | null;
  retryAttemptId?: string;
  state: BackyFormDeliveryState; statusCode: number | null; errorCode: string | null;
  createdAt: string; updatedAt: string;
  providerEvidence?: BackyDeliveryProviderEvidence | null;
  reconciliationVersion: number; reconciliations: BackyDeliveryReconciliation[];
}
export type BackyFormDeliveryAdmission = Pick<BackyFormDeliveryAttempt,'siteId'|'formId'|'submissionId'|'kind'|'channel'|'target'|'requestId'|'reason'|'actor'> & {sourceEventId?: string | null};
export class BackyFormDeliveryError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); this.name='BackyFormDeliveryError'; }
}
export function assertFormDeliverySource(input: BackyFormDeliveryAdmission, source: {siteId?: string|null;formId?:string|null;submissionId?: string|null;kind:string;channel:string;target:string;state:string}|null) {
  if(!source || source.siteId!==input.siteId || source.formId!==input.formId || source.submissionId!==input.submissionId) throw new BackyFormDeliveryError('DELIVERY_EVENT_NOT_FOUND',404,'Delivery event not found for this submission.');
  if(source.state!=='failed') throw new BackyFormDeliveryError('DELIVERY_EVENT_NOT_FAILED',409,'Pending, uncertain and successful deliveries cannot be replayed. Verify the provider outcome.');
  if(source.kind!==input.kind || source.channel!==input.channel || source.target!==input.target) throw new BackyFormDeliveryError('DELIVERY_EVENT_CONFLICT',409,'Delivery identity changed. Reload the delivery history.');
}
export interface BackyFormDeliveryRepository {
  /** Unique source admission is durable across workers; a used failed event can never be sent again. */
  admit(input: BackyFormDeliveryAdmission): Promise<BackyFormDeliveryAttempt>;
  get(siteId:string,formId:string,submissionId:string,id:string): Promise<BackyFormDeliveryAttempt|null>;
  list(input:{siteId:string;formId?:string;submissionId?:string;channel?:'email'|'webhook';target?:string;limit:number;offset:number}): Promise<import('./repositories').BackyListResult<BackyFormDeliveryAttempt>>;
  /** Append an owner investigation against an exact snapshot, without changing state or resending. */
  recordReconciliation(input: {siteId:string;formId:string;submissionId:string;attemptId:string} & BackyDeliveryReconciliationInput): Promise<BackyFormDeliveryAttempt>;
  /** Only pending → terminal; failed persistence must leave pending, never invent failure. */
  settle(siteId:string,id:string,input:{state:Exclude<BackyFormDeliveryState,'pending'>;statusCode?:number|null;errorCode?:string|null;providerEvidence?:BackyDeliveryProviderEvidence|null}): Promise<BackyFormDeliveryAttempt>;
}

/** Adapters may bundle core separately; map only known codes, never forward adapter/provider messages. */
export function formDeliveryErrorDetails(error:unknown):{status:number;code:string;message:string}|null {
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 const errors:Record<string,[number,string]>={
  VISITOR_PRIVACY_FENCED:[409,'This source was fenced by local visitor erasure. No provider request was made.'],
  VISITOR_PRIVACY_FENCE_UNAVAILABLE:[503,'Persisted privacy fencing is unavailable. No provider request was made.'],
  VISITOR_PRIVACY_BUSY:[503,'Privacy admission is busy. Wait for the current follow-up before retrying.'],
  DELIVERY_EVENT_NOT_FOUND:[404,'Delivery event not found for this submission.'],
  FORM_SUBMISSION_NOT_FOUND:[404,'Form submission not found.'],
  FORM_SUBMISSION_NOT_DELIVERABLE:[409,'Spam or rejected submissions cannot be delivered.'],
  DELIVERY_EVENT_NOT_FAILED:[409,'Pending, uncertain and successful deliveries cannot be replayed. Verify the provider outcome.'],
  DELIVERY_EVENT_CONFLICT:[409,'Delivery identity changed. Reload the delivery history.'],
  DELIVERY_RETRY_ALREADY_ADMITTED:[409,'This event already has a delivery attempt. Reload history; pending or uncertain attempts must not be replayed.'],
  DELIVERY_RECONCILIATION_INVALID:[400,'Use a current pending or uncertain attempt snapshot and a supported investigation disposition.'],
  DELIVERY_RECONCILIATION_CONFLICT:[409,'The delivery attempt or investigation history changed. Reload before reviewing.'],
  DELIVERY_OUTCOME_CONFLICT:[409,'The durable delivery outcome cannot be replaced.'],
  DELIVERY_JOURNAL_UNAVAILABLE:[503,'Durable delivery admission is unavailable. No provider request was made.'],
 };
 const entry=Object.prototype.hasOwnProperty.call(errors,code)?errors[code]:null;return entry?{status:entry[0],code,message:entry[1]}:null;
}

export function assertFormDeliveryAdmission(input:BackyFormDeliveryAdmission):void {
 const invalid=()=>{throw new BackyFormDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Delivery identity cannot be verified. No provider request was made.');};
 for(const value of [input.siteId,input.formId,input.submissionId,input.requestId])if(typeof value!=='string'||!value||value.length>200)invalid();
 if(!['form-submission'].includes(input.kind)||!['email','webhook'].includes(input.channel)||typeof input.target!=='string'||!input.target||input.target.length>2048)invalid();
 for(const value of [input.reason,input.actor,input.sourceEventId])if(value!=null&&(typeof value!=='string'||value.length>500))invalid();
 if(input.channel==='email'){if(!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.target))invalid();}
 else {try{const url=new URL(input.target);if(!['http:','https:'].includes(url.protocol))invalid();}catch{invalid();}}
}

export function legacyFormDeliveryState(status:unknown,statusCode:unknown):string {
 if(status!=='failed')return typeof status==='string'?status:'unverified';
 return typeof statusCode==='number'&&Number.isInteger(statusCode)&&statusCode>=400&&statusCode<=599?'failed':'uncertain';
}
