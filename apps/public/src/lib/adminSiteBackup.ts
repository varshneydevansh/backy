import { randomUUID } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { SiteBackupError,SITE_BACKUP_LIMITS } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { recordAdminAudit } from './adminAudit';
import { withMediaStorageMutation } from './mediaStorageMutation';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories,shouldUseDemoStoreFallback } from './repositoryRuntime';
import { recognizedSiteBackupError,applySiteBackup,demoSiteBackupRepository,exportSiteBackup,previewSiteBackup,retrySiteBackupJob,siteBackupFingerprint,validateSiteBackup } from './siteBackup';
const json=(payload:unknown,status=200)=>NextResponse.json(payload,{status,headers:{'Cache-Control':'private, no-store',Pragma:'no-cache',Vary:'Cookie, Authorization','X-Content-Type-Options':'nosniff'}});
async function body(request:NextRequest):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new SiteBackupError('SITE_BACKUP_JSON_REQUIRED',415,'Use a private JSON backup package.');
 const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;if(reader)try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>SITE_BACKUP_LIMITS.maxArchiveBytes+65536){await reader.cancel();throw new SiteBackupError('SITE_BACKUP_LIMIT_EXCEEDED',413,'The restore request exceeds its bounded package limit.');}chunks.push(next.value);}}finally{reader.releaseLock();}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new SiteBackupError('SITE_BACKUP_INVALID',400,'Use a JSON object containing the backup package.');}
}
export async function handleAdminSiteBackup(request:NextRequest,siteKey:string,operation:'export'|'restore'|'jobs'|'retry',jobId?:string){
 const requestId=`req_${randomUUID()}`;
 try{
  // Backup includes private submissions and files. It requires a management
  // role and exact selected-site scope, never a public/read-only token.
  const access=await requireAdminAccess(request,requestId,{roles:['owner','admin'],permission:'sites.configure'});
  if(access instanceof NextResponse){access.headers.set('Cache-Control','private, no-store');return access;}
  const repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories(),site=repositories?await repositories.sites.getById(siteKey)||await repositories.sites.getBySlug(siteKey):getSiteByIdOrSlug(siteKey);
  if(!site)throw new SiteBackupError('SITE_NOT_FOUND',404,'Site not found.');
  const repository=repositories?.siteBackups||(!repositories?demoSiteBackupRepository():null);if(!repository)throw new SiteBackupError('SITE_BACKUP_UNAVAILABLE',503,'The whole-site recovery repository is unavailable.');
  if(operation==='export'&&request.method==='GET'){const archive=await exportSiteBackup(repository,site.id);return json({success:true,requestId,data:{siteId:site.id,archive,limits:SITE_BACKUP_LIMITS,private:true}});}
  if(operation==='jobs'&&request.method==='GET'){const jobs=await repository.listJobs(site.id);return json({success:true,requestId,data:{siteId:site.id,jobs:jobs.map(job=>({id:job.id,targetSiteId:job.targetSiteId,state:job.state,remainingFiles:job.remaining,files:job.files.length,bytes:job.files.reduce((sum,file)=>sum+file.bytes,0),createdAt:job.createdAt}))}});}
  if(operation==='retry'&&request.method==='POST'&&jobId){const input=await body(request);if(Object.keys(input).length)throw new SiteBackupError('SITE_BACKUP_INVALID',400,'Recovery accepts an empty JSON object; stored paths are server controlled.');const result=await retrySiteBackupJob(repository,site.id,jobId);return json({success:true,requestId,data:{siteId:site.id,...result}});}
  if(operation!=='restore'||request.method!=='POST')throw new SiteBackupError('SITE_BACKUP_METHOD_DENIED',405,'Unsupported backup operation.');
  const createAccess=await requireAdminAccess(request,requestId,{roles:['owner','admin'],permission:'sites.create'});if(createAccess instanceof NextResponse)return createAccess;
  const input=await body(request);if(!['preview','apply'].includes(String(input.action)))throw new SiteBackupError('SITE_BACKUP_INVALID',400,'Choose preview or apply.');
  const archive=validateSiteBackup(input.archive,site.id),review=await previewSiteBackup(archive,{name:typeof input.name==='string'?input.name.trim():'',slug:typeof input.slug==='string'?input.slug.trim():'',teamId:site.teamId||''},repositories);
  if(input.action==='preview')return json({success:true,requestId,data:{siteId:site.id,dryRun:true,reviewedPreview:review}});
  if(input.confirmPrivateData!==true||input.confirmSafetyResets!==true||siteBackupFingerprint(input.reviewedPreview)!==siteBackupFingerprint(review))throw new SiteBackupError('SITE_BACKUP_REVIEW_REQUIRED',409,'Review this exact private package, draft identity, exclusions and safety resets before applying.');
  return await withMediaStorageMutation(repositories?.media||null,site.id,requestId,async()=>{
  const actor=access.session?.user.id||null,result=await applySiteBackup(repository,archive,review,actor&&/^[a-f0-9-]{36}$/.test(actor)?actor:null,repositories);
  try{await recordAdminAudit({repositories,actorId:access.session?.user.id,requestId,action:'site.backup.restore',siteId:site.id,entity:'site',entityId:result.siteId,metadata:{jobId:result.jobId,counts:result.counts}});}catch{result.completionWarnings.push('SITE_BACKUP_AUDIT_PENDING');}
  return json({success:true,requestId,data:{sourceSiteId:site.id,...result}},201);
  });
 }catch(error){
  const typed=recognizedSiteBackupError(error);if(typed)return json({success:false,requestId,error:{code:typed.code,message:typed.message,...(error&&typeof error==='object'&&'jobId'in error&&typeof error.jobId==='string'&&/^[a-f0-9-]{36}$/.test(error.jobId)?{jobId:error.jobId}: {})}},typed.status);
  return json({success:false,requestId,error:{code:'SITE_BACKUP_UNAVAILABLE',message:'Recovery could not confirm completion. Check its database/private storage and staging jobs before retrying.'}},503);
 }
}
