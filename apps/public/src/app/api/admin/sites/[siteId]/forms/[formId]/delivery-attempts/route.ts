import {NextRequest,NextResponse} from 'next/server';
import {requireAdminAccess} from '@/lib/adminAccess';
import {getFormById,getSiteByIdOrSlug} from '@/lib/backyStore';
import {getRequiredDatabaseRepositories,shouldUseDemoStoreFallback} from '@/lib/repositoryRuntime';
import {formDeliveryJournal,formDeliveryAttemptEvent} from '@/lib/formDeliveryHistory';
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest,{params}:{params:Promise<{siteId:string;formId:string}>}){
 const requestId=request.headers.get('x-request-id')||'form-history-'+Date.now().toString(36);const access=await requireAdminAccess(request,requestId,{permission:'forms.view'});if(access instanceof NextResponse)return access;
 const error=(status:number,code:string,message:string)=>respond({success:false,requestId,error:{code,message}},status);
 const query=new URL(request.url).searchParams,limit=Number(query.get('limit')||100),offset=Number(query.get('offset')||0),submissionId=query.get('submissionId')||undefined;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||(submissionId&&submissionId.length>200))return error(400,'INVALID_DELIVERY_PAGINATION','Use limit1–100 and a nonnegative integer offset.');
 try{
  const {siteId,formId}=await params,repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories();const site=repositories?await repositories.sites.getById(siteId)||await repositories.sites.getBySlug(siteId):getSiteByIdOrSlug(siteId);if(!site)return error(404,'SITE_NOT_FOUND','Site not found.');
  const form=repositories?await repositories.forms.getById(site.id,formId):getFormById(site.id,formId);if(!form)return error(404,'FORM_NOT_FOUND','Form not found.');
  const result=await formDeliveryJournal(repositories).list({siteId:site.id,formId:form.id,submissionId,limit,offset});
  return respond({success:true,requestId,data:{siteId:site.id,formId:form.id,events:result.items.map(formDeliveryAttemptEvent),count:result.pagination.total,pagination:result.pagination}});
 }catch{return error(503,'DELIVERY_JOURNAL_UNAVAILABLE','Durable form delivery history is unavailable.');}
}
