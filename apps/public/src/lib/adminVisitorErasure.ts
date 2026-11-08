import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { BackyVisitorErasurePreview, BackyVisitorErasureReceipt, BackyVisitorErasureChoices } from '@backy-cms/core';
import { adminAccessError, isOwnerAdminSession, requireAdminAccess } from './adminAccess';
import { getRequiredDatabaseRepositories } from './repositoryRuntime';
const headers={'cache-control':'private, no-store',pragma:'no-cache',vary:'Cookie, Authorization','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const retained=['provider-subject-tombstone','other-websites','private-attachment-bytes-and-references','ambiguous-or-retained-contacts','collection-copies','historical-audit-and-delivery-evidence','newsletter-consent-and-delivery-snapshots','downstream-provider-copies'];
const boundary={profileIdentifiers:'redact',admission:'remove-and-fence',providerChanged:false,emailMatchedOwnership:false,downstreamErasure:'unverified',ambiguousContacts:'retain-and-fence'};
const choices=(value:unknown):value is BackyVisitorErasureChoices=>{const row=record(value);return Object.keys(row).length===3&&['redact','retain'].includes(row.comments)&&['redact','retain'].includes(row.submissions)&&['delete','retain'].includes(row.exclusiveContacts);};
export function projectVisitorErasure(raw:unknown,siteId:string,memberId:string,operation:'preview'|'confirm'):BackyVisitorErasurePreview|BackyVisitorErasureReceipt {
 const value=record(raw),count=record(value.counts),keys=['comments','submissions','exclusiveContacts','ambiguousContacts','retainedAttachments','commentDeliveryAttempts','formDeliveryAttempts','newsletterSnapshots'];
 const receipt=operation==='confirm',date=value[receipt?'completedAt':'expiresAt'],id=value[receipt?'receiptId':'previewId'];
 if(value.schema!==(receipt?'backy.visitor-erasure-receipt.v1':'backy.visitor-erasure-preview.v1')||value.siteId!==siteId||value.memberId!==memberId||!uuid(id)||typeof date!=='string'||!Number.isFinite(Date.parse(date))||!choices(value.choices)||keys.some(key=>!Number.isSafeInteger(count[key])||count[key]<0)||JSON.stringify(value.retainedCategories)!==JSON.stringify(retained)||JSON.stringify(value.boundaries)!==JSON.stringify(boundary)||receipt&&value.localErasurePerformed!==true)throw new Error('Invalid local erasure projection');
 return {schema:value.schema,siteId,memberId,[receipt?'receiptId':'previewId']:id,[receipt?'completedAt':'expiresAt']:date,choices:{comments:value.choices.comments,submissions:value.choices.submissions,exclusiveContacts:value.choices.exclusiveContacts},counts:Object.fromEntries(keys.map(key=>[key,count[key]])),retainedCategories:[...retained],boundaries:{...boundary},...(receipt?{localErasurePerformed:true}:{})} as unknown as BackyVisitorErasurePreview|BackyVisitorErasureReceipt;
}
async function readBody(request:NextRequest){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new Error('Invalid JSON');const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new Error('Body too large');}chunks.push(value);}
 const body:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid body');return body as Record<string,unknown>;
}
export async function handleAdminVisitorErasure(request:NextRequest,siteKey:string,memberId:string,operation:'preview'|'confirm'){
 const requestId=`req_${randomUUID()}`,error=(status:number,code:string,message:string)=>json({success:false,requestId,error:{code,message}},status);
 try{
  if(['authorization','x-backy-admin-session','x-backy-admin-key','x-api-key'].some(header=>request.headers.has(header)))return adminAccessError(403,'OWNER_SESSION_REQUIRED','Local erasure requires an owner cookie session without explicit credential headers.',requestId);
  if(!request.cookies.get('backy_admin_session')?.value?.trim())return adminAccessError(401,'UNAUTHORIZED','A current owner cookie session is required.',requestId);
  const access=await requireAdminAccess(request,requestId,{permission:'users.delete',recordUsage:false});if(access instanceof NextResponse){for(const[key,value]of Object.entries(headers))access.headers.set(key,value);return access;}
  if(!isOwnerAdminSession(access))return adminAccessError(403,'OWNER_SESSION_REQUIRED','Local erasure requires an active owner cookie session.',requestId);
  if(request.method!=='POST'||new URL(request.url).search)return error(400,'VISITOR_ERASURE_INVALID_REQUEST','Use POST without query parameters.');
  if(!uuid(memberId))return error(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');memberId=memberId.toLowerCase();
  let body:Record<string,unknown>;try{body=await readBody(request);}catch{return error(400,'VISITOR_ERASURE_INVALID_REQUEST','Use the exact bounded JSON erasure request.');}
  if(operation==='preview'?(Object.keys(body).length!==1||!choices(body.choices)):(Object.keys(body).length!==2||!uuid(body.previewId)||body.confirmLocalErasure!==true))return error(400,'VISITOR_ERASURE_INVALID_REQUEST','Choose retention options for preview, or explicitly confirm its preview ID.');
  const repositories=await getRequiredDatabaseRepositories(),site=await repositories.sites.getById(siteKey)||await repositories.sites.getBySlug(siteKey);if(!site)return error(404,'SITE_NOT_FOUND','Site not found.');
  const repository=repositories.visitorAccounts?.privacyErasure;if(!repository)return error(503,'VISITOR_ERASURE_UNAVAILABLE','Local erasure requires persisted provenance, fencing and migration032.');
  const result=operation==='preview'?await repository.preview(site.id,memberId,access.session!.user.id,body.choices as BackyVisitorErasureChoices):await repository.confirm(site.id,memberId,access.session!.user.id,String(body.previewId),requestId);
  if(!result)return error(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');return json({success:true,requestId,data:projectVisitorErasure(result,site.id,memberId,operation)});
 }catch(cause){if((cause as any)?.code==='VISITOR_ERASURE_ALREADY_COMPLETED')return error(409,'VISITOR_ERASURE_ALREADY_COMPLETED','This member’s local erasure already completed. Its retained categories and removed provider-subject tombstone remain.');if((cause as any)?.code==='VISITOR_ERASURE_PREVIEW_CONFLICT')return error(409,'VISITOR_ERASURE_PREVIEW_CONFLICT','The preview expired or retained data changed. Preview again before confirming.');return error(503,'VISITOR_ERASURE_UNAVAILABLE','Local erasure could not be verified. Reload and preview current state before retrying. Provider copies are outside this action.');}
}
