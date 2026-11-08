/** Count-only privacy review. This does not export, erase, or inspect content. */
import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import type {BackyVisitorPrivacyImpact} from '@backy-cms/core';
import {adminAccessError,isOwnerAdminSession,requireAdminAccess} from './adminAccess';
import {getRequiredDatabaseRepositories} from './repositoryRuntime';

const categories=['membership-identity','comments-and-moderation','submission-values-files-and-admin-metadata','source-submission-contact-copies','delivery-evidence'] as const;
const headers={'cache-control':'private, no-store',pragma:'no-cache',vary:'Cookie, Authorization','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function count(value:unknown):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid review count');return value;}
function attempts(value:unknown){const data=record(value),total=count(data.total),pending=count(data.pending),unknownOutcome=count(data.unknownOutcome);if(pending+unknownOutcome>total)throw new Error('Inconsistent review count');return{total,pending,unknownOutcome};}
/** Project explicit primitives so malformed adapters cannot return sensitive payloads. */
export function projectVisitorPrivacyImpact(raw:unknown,siteId:string,memberId:string):BackyVisitorPrivacyImpact {
 const value=record(raw),counts=record(value.counts),boundaries=record(value.boundaries);
 if(value.schema!=='backy.visitor-privacy-impact.v1'||value.siteId!==siteId||value.memberId!==memberId||!['active','suspended','removed'].includes(String(value.memberStatus))||value.reviewMode!=='read-only-point-in-time'||typeof value.observedAt!=='string'||value.observedAt.length>40||!Number.isFinite(Date.parse(value.observedAt)))throw new Error('Invalid review scope');
 if(boundaries.contactOwnership!=='ambiguous-source-submission-link'||boundaries.downstreamProvenance!=='unknown'||['emailMatchedOwnership','contentInspected','erasurePerformed','providerChanged'].some(key=>boundaries[key]!==false)||JSON.stringify(value.retainedCategories)!==JSON.stringify(categories))throw new Error('Invalid review boundaries');
 return {schema:'backy.visitor-privacy-impact.v1',siteId,memberId,memberStatus:value.memberStatus as BackyVisitorPrivacyImpact['memberStatus'],observedAt:value.observedAt,reviewMode:'read-only-point-in-time',counts:{comments:count(counts.comments),formSubmissions:count(counts.formSubmissions),linkedContacts:count(counts.linkedContacts),commentDeliveryAttempts:attempts(counts.commentDeliveryAttempts),formDeliveryAttempts:attempts(counts.formDeliveryAttempts)},boundaries:{contactOwnership:'ambiguous-source-submission-link',downstreamProvenance:'unknown',emailMatchedOwnership:false,contentInspected:false,erasurePerformed:false,providerChanged:false},retainedCategories:[...categories]};
}
export async function handleAdminVisitorPrivacyImpact(request:NextRequest,siteKey:string,memberId:string){
 const requestId=`req_${randomUUID()}`;
 const error=(status:number,code:string,message:string)=>json({success:false,requestId,error:{code,message}},status);
 try {
  if(['authorization','x-backy-admin-session','x-backy-admin-key','x-api-key'].some(header=>request.headers.has(header)))return adminAccessError(403,'OWNER_SESSION_REQUIRED','Privacy impact review requires an owner cookie session without explicit credential headers.',requestId);
  if(!request.cookies.get('backy_admin_session')?.value?.trim())return adminAccessError(401,'UNAUTHORIZED','A current owner cookie session is required for privacy impact review.',requestId);
  const access=await requireAdminAccess(request,requestId,{permission:'users.view',recordUsage:false});
  if(access instanceof NextResponse){for(const[key,value]of Object.entries(headers))access.headers.set(key,value);return access;}
  if(!isOwnerAdminSession(access))return adminAccessError(403,'OWNER_SESSION_REQUIRED','Privacy impact review requires an active owner admin session.',requestId);
  if(request.method!=='GET')return error(405,'VISITOR_PRIVACY_REVIEW_METHOD_DENIED','Use GET for read-only privacy impact review.');
  if(new URL(request.url).search||request.body||request.headers.has('transfer-encoding')||request.headers.has('content-length')&&request.headers.get('content-length')!=='0')return error(400,'VISITOR_PRIVACY_REVIEW_INVALID_REQUEST','Privacy impact review accepts no query parameters or request body.');
  if(!uuid(memberId))return error(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');
  memberId=memberId.toLowerCase();
  const repositories=await getRequiredDatabaseRepositories();
  const site=await repositories.sites.getById(siteKey)||await repositories.sites.getBySlug(siteKey);
  if(!site)return error(404,'SITE_NOT_FOUND','Site not found.');
  const repository=repositories.visitorAccounts?.privacyImpact;
  if(!repository)return error(503,'VISITOR_PRIVACY_REVIEW_UNAVAILABLE','Privacy impact review requires the persisted database and current migrations.');
  const reviewed=await repository.review(site.id,memberId);
  if(!reviewed)return error(404,'VISITOR_MEMBER_NOT_FOUND','Member not found in this website.');
  return json({success:true,requestId,data:projectVisitorPrivacyImpact(reviewed,site.id,memberId)});
 }catch{return error(503,'VISITOR_PRIVACY_REVIEW_UNAVAILABLE','Privacy impact review is unavailable. No erasure or provider action was performed.');}
}
