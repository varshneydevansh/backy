/** Atomic site/settings/page-only duplication; resource scope returned explicitly. */
import {NextRequest,NextResponse} from 'next/server';import {SiteCreationAdmissionError,siteCreationAdmissionErrorDetails} from '@backy-cms/core';
import {requireAdminAccess} from '@/lib/adminAccess';import {recordAdminAudit} from '@/lib/adminAudit';import {duplicateAdminSiteAtomically} from '@/lib/backyStore';import {getRequiredDatabaseRepositories,shouldUseDemoStoreFallback} from '@/lib/repositoryRuntime';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}});
export async function POST(request:NextRequest,{params}:{params:Promise<{siteId:string}>}){
 const requestId=request.headers.get('x-request-id')||`req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
 const access=await requireAdminAccess(request,requestId,{permission:'sites.create'});if(access instanceof NextResponse)return access;
 try{const {siteId}=await params;let body:Record<string,unknown>={};try{const value=await request.json();if(value&&typeof value==='object'&&!Array.isArray(value))body=value;}catch{}
  const input={sourceSiteId:siteId,...(typeof body.name==='string'?{name:body.name}:{}),...(typeof body.slug==='string'?{slug:body.slug}:{})},repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories();
  if(repositories&&!repositories.siteDuplication)throw new SiteCreationAdmissionError('SITE_CREATION_UNAVAILABLE',503,'Atomic site duplication is unavailable for this repository.');
  const result=repositories?await repositories.siteDuplication!.duplicate(input):duplicateAdminSiteAtomically(input);
  // All logical content is committed. Follow-up audit failure must retain creation.
  try{await recordAdminAudit({repositories,siteId:result.site.id,teamId:result.site.teamId,actorId:access.session?.user.id,entity:'site',entityId:result.site.id,action:'site.duplicated',after:result.site as any,metadata:{sourceSiteId:siteId,slug:result.site.slug,pagesCopied:result.pagesCopied,source:'admin-site-duplicate'},requestId});}catch{result.completionWarnings.push('SITE_DUPLICATION_AUDIT_PENDING');}
  return json({success:true,requestId,data:{...result,site:{...result.site,status:'draft'}}},201);
 }catch(error){const admission=siteCreationAdmissionErrorDetails(error);if(admission)return json({success:false,requestId,error:{code:admission.code,message:admission.message}},admission.status);return json({success:false,requestId,error:{code:'SITE_DUPLICATION_UNAVAILABLE',message:'Site duplication could not confirm completion. Reload sites before retrying; inspect its database or private store.'}},503);}
}
