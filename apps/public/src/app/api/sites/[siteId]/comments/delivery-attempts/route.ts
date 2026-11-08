import { NextRequest, NextResponse } from 'next/server';
import { commentDeliveryErrorDetails } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug } from '@/lib/backyStore';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import { commentDeliveryJournal, deliveryAttemptEvent } from '@/lib/commentDeliveryHistory';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { publicContractJson } from '@/lib/publicContractResponse';
export async function GET(request:NextRequest,{params}:{params:Promise<{siteId:string}>}){
 const requestId=request.headers.get('x-request-id')||'delivery-history-'+Date.now();
 const access=await requireAdminAccess(request,requestId,{permission:'comments.view'});if(access instanceof NextResponse)return access;
 try{const {siteId}=await params,repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories(),site=repositories?await resolveRepositorySite(repositories,siteId):getSiteByIdOrSlug(siteId);
  if(!site)return publicContractJson({success:false,error:{code:'SITE_NOT_FOUND',message:'Site not found.'}},{status:404,requestId,cache:'error'});
  const search=new URL(request.url).searchParams,limit=Number(search.get('limit')||100),offset=Number(search.get('offset')||0);
  if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(offset)||offset<0)return publicContractJson({success:false,error:{code:'INVALID_PAYLOAD',message:'Invalid pagination.'}},{status:400,requestId,cache:'error'});
  const result=await commentDeliveryJournal(repositories).list({siteId:site.id,commentId:search.get('commentId')||undefined,limit,offset});
  const data={siteId:site.id,events:result.items.map(deliveryAttemptEvent),count:result.pagination.total,pagination:result.pagination};
  return publicContractJson({success:true,requestId,data},{requestId,cache:'private'});
 }catch(error){const known=commentDeliveryErrorDetails(error);return publicContractJson({success:false,error:{code:known?known.code:'DELIVERY_JOURNAL_UNAVAILABLE',message:known?known.message:'Durable delivery history is unavailable.'}},{status:known?known.status:503,requestId,cache:'error'});}
}
