import {NextResponse} from 'next/server';
import type {BackyRepositories} from '@backy-cms/core';
import {demoCommentDeliveryJournal} from './demoCommentDeliveryJournal';

const respond=(requestId:string,status:number,code:string,message:string)=>NextResponse.json({success:false,requestId,error:{code,message}},{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}});
export function siteCommentDeliveryDeletionErrorResponse(error:unknown,requestId:string):NextResponse|null {
 if(!error||typeof error!=='object')return null;
 const item=error as {code?:unknown;cause?:{code?:unknown;constraint_name?:unknown;constraint?:unknown}};
 const cause=item.cause||item as {code?:unknown;constraint_name?:unknown;constraint?:unknown};
 if(item.code==='SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS'||(cause.code==='23503'&&(cause.constraint_name||cause.constraint)==='comment_delivery_attempts_site_id_fkey'))return respond(requestId,409,'SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS','This site retains private comment delivery attempts and retry evidence. Site deletion is unavailable while that evidence remains. No evidence purge workflow is implemented.');
 if(item.code==='SITE_COMMENT_DELIVERY_INVENTORY_UNAVAILABLE')return respond(requestId,503,'SITE_COMMENT_DELIVERY_INVENTORY_UNAVAILABLE','Private comment delivery evidence could not be verified. The site was not deleted. Check its journal repository or private storage before retrying.');
 return null;
}

/** Delivery evidence has no purge workflow. Do not orphan it through site deletion. */
export async function siteCommentDeliveryDeletionResponse(siteId:string,repositories:BackyRepositories|null,requestId:string):Promise<NextResponse|null> {
 const refusal=(status:number,code:string,message:string)=>respond(requestId,status,code,message);
 try {
  const journal=repositories?repositories.commentDeliveries:demoCommentDeliveryJournal;
  if(!journal)throw Error('Unavailable journal');
  const result=await journal.list({siteId,limit:1,offset:0}),page=result.pagination;
  if(!Array.isArray(result.items)||result.items.length>1||!page||!Number.isSafeInteger(page.total)||page.total<0||page.limit!==1||page.offset!==0||result.items.length!==Math.min(1,page.total)||page.hasMore!==(page.total>1)||result.items.some(row=>row.siteId!==siteId))throw Error('Incomplete scoped journal');
  if(page.total)return refusal(409,'SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS','This site retains private comment delivery attempts and retry evidence. Site deletion is unavailable while that evidence remains. No evidence purge workflow is implemented; verify pending or uncertain provider outcomes before any administrative retention decision.');
  return null;
 }catch{return refusal(503,'SITE_COMMENT_DELIVERY_INVENTORY_UNAVAILABLE','Private comment delivery evidence could not be verified. The site was not deleted. Check its journal repository or private storage before retrying.');}
}
