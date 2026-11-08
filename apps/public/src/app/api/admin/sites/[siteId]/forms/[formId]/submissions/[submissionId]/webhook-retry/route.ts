import { NextRequest, NextResponse } from 'next/server';
import { formDeliveryErrorDetails } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getFormById, getSiteByIdOrSlug, getSubmissionById } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { retryFormSubmissionDelivery } from '@/lib/formSubmissionDelivery';
export const runtime='nodejs';
interface RouteParams {params:Promise<{siteId:string;formId:string;submissionId:string}>}
const errorResponse=(status:number,code:string,message:string,requestId:string)=>NextResponse.json({success:false,requestId,error:{code,message},errorMessage:message},{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:NextRequest,{params}:RouteParams){
 const body=await request.json().catch(()=>null);
 const requestId=request.headers.get('x-request-id')||(typeof body?.requestId==='string'?body.requestId:'')||'form-retry-'+Date.now().toString(36);
 const access=await requireAdminAccess(request,requestId,{permission:'forms.manage'});if(access instanceof NextResponse)return access;
 if(!body||typeof body!=='object'||Array.isArray(body)||(body.eventId!==undefined&&(typeof body.eventId!=='string'||!body.eventId.trim()||body.eventId.length>200))||requestId.length>200)return errorResponse(400,'INVALID_FORM_DELIVERY_RETRY','Provide an optional delivery eventId of at most 200 characters and valid requestId.',requestId);
 try{
  const {siteId,formId,submissionId}=await params,repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories();
  const site=repositories?await repositories.sites.getById(siteId)||await repositories.sites.getBySlug(siteId):getSiteByIdOrSlug(siteId);
  if(!site)return errorResponse(404,'SITE_NOT_FOUND','Site not found',requestId);
  const form=repositories?await repositories.forms.getById(site.id,formId):getFormById(site.id,formId);
  if(!form)return errorResponse(404,'FORM_NOT_FOUND','Form not found',requestId);
  const submission=repositories?await repositories.forms.getSubmissionById(site.id,form.id,submissionId):getSubmissionById(submissionId);
  if(!submission||submission.siteId!==site.id||submission.formId!==form.id)return errorResponse(404,'SUBMISSION_NOT_FOUND','Submission not found',requestId);
  const delivery=await retryFormSubmissionDelivery({repositories,siteId:site.id,form,submission,requestId,channel:'webhook',eventId:body.eventId?.trim(),actor:access.session?.user.id||null});
  return NextResponse.json({success:true,requestId,data:{delivery,submission,completionWarnings:delivery.completionWarnings},delivery,submission},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const details=formDeliveryErrorDetails(error);return details?errorResponse(details.status,details.code,details.message,requestId):errorResponse(503,'DELIVERY_JOURNAL_UNAVAILABLE','Durable delivery admission is unavailable. Reload history and verify provider outcomes before retrying.',requestId);}
}
