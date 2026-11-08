import { createHash,randomUUID } from 'node:crypto';
import { closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,writeFileSync,unlinkSync } from 'node:fs';
import { dirname,join,relative,resolve } from 'node:path';
import {assertNoPendingDemoSiteBackupJobs} from './demoSiteBackupPersistence';
import { assertSiteBackupGraph,prepareSiteBackupDraft,remapSiteBackupValue,scrubSiteBackupCredentials,SITE_BACKUP_EXCLUSIONS,SITE_BACKUP_LIMITS,SITE_BACKUP_RESETS,SITE_BACKUP_TABLES,SiteBackupError,serializeTemplateRevisionValue,type BackyRepositories,type BackySiteBackupRepository,type SiteBackupGraph,type SiteBackupPackage,type SiteBackupFile,type SiteBackupRestoreJob,type SiteBackupRow } from '@backy-cms/core';
import { captureDemoSiteBackup,commitDemoSiteBackup,getSiteByIdOrSlug,getAdminSettings,getSites } from './backyStore';
import { formAttachmentPath,isFormAttachment } from './formAttachments';
import { getFormAttachmentStorage } from './formAttachmentStorage';
import { getMediaStorageAdapter,getMediaStoragePathFromMedia } from './mediaStorage';
import { currentMediaStorageIdentity,mediaStorageUsageWithPending } from './mediaStorageRecovery';
import { isCanonicalMediaStorageJobPath } from '@backy-cms/core';
import { resolveMediaScannerConfig,scanMediaUploadWithProviders } from './mediaSafety';
import { isUploadAllowedByFileType,readMediaBillingLimit,resolveMediaUploadPolicy } from './mediaUploadPolicy';
import {remapRestoredCollectionTemplatePin,remapRestoredCollectionTemplateRevisionFingerprint} from './collectionTemplateBackup';
import { remapRestoredFormTemplatePin,remapRestoredFormTemplateRevisionFingerprint } from './formTemplateBackup';

/** Keep reviewed repository failures typed across independently bundled CJS/ESM core. */
export function recognizedSiteBackupError(value:unknown):SiteBackupError|null {
 if(value instanceof SiteBackupError)return value;
 if(!value||typeof value!=='object')return null;
 const error=value as {code?:unknown;status?:unknown};
 const known:Record<string,[number,string]>={
  BILLING_SITE_LIMIT:[402,'The configured billing site limit has been reached. Review Settings before restoring another site.'],
  SITE_NOT_FOUND:[404,'Site not found.'],
  SITE_BACKUP_SCOPE_CHANGED:[409,'The site ownership changed. Review the restore again.'],
  SITE_BACKUP_SLUG_CONFLICT:[409,'The requested draft site slug is already in use.'],
  SITE_BACKUP_JOB_INVALID:[409,'The restore job is unavailable or already applied.'],
  SITE_BACKUP_BUSY:[503,'Restore admission is busy. Retry later.'],
  SITE_BACKUP_UNAVAILABLE:[503,'Recovery requires its PostgreSQL repository and migration.'],
  SITE_BACKUP_LIMIT_EXCEEDED:[413,'The site exceeds the bounded backup limit.'],
 };
 if(typeof error.code!=='string')return null;const entry=Object.prototype.hasOwnProperty.call(known,error.code)?known[error.code]:null;
 return entry&&error.status===entry[0]?new SiteBackupError(error.code,entry[0],entry[1]):null;
}
const object=(v:unknown):v is SiteBackupRow=>!!v&&typeof v==='object'&&!Array.isArray(v);
const digest=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
export const siteBackupFingerprint=(v:unknown)=>digest(serializeTemplateRevisionValue(v));
const invalid=()=>new SiteBackupError('SITE_BACKUP_INVALID',400,'The package or its managed file inventory is invalid.');
type FileReference=Omit<SiteBackupFile,'id'|'base64'|'sha256'>;
/** Only canonical managed paths are read. Arbitrary saved URLs never cause fetches. */
export function siteBackupFileReferences(graph:SiteBackupGraph):{files:FileReference[];externalLinks:string[];attachmentForms:Map<string,string>;mediaUrls:Map<string,Set<string>>} {
 const siteId=String(graph.site.id),files=new Map<string,FileReference>(),externalLinks=new Set<string>(),attachmentForms=new Map<string,string>(),mediaUrls=new Map<string,Set<string>>();
 const add=(file:FileReference)=>{const key=`${file.namespace}:${file.path}`,old=files.get(key);if(old&&old.bytes!==file.bytes)throw invalid();if(!old)files.set(key,file);};
 const media=(row:SiteBackupRow,fallback?:SiteBackupRow)=>{
  const path=typeof row.storagePath==='string'?row.storagePath:getMediaStoragePathFromMedia(siteId,row as any);
  const filename=String(row.filename||row.originalName||path?.split('/').pop()||fallback?.filename||'file'),mimeType=String(row.mimeType||fallback?.mimeType||'application/octet-stream'),bytes=Number(row.sizeBytes??row.bytes);
  if(path){if(!isCanonicalMediaStorageJobPath(siteId,path)||!Number.isSafeInteger(bytes)||bytes<=0)throw invalid();if(typeof row.url==='string'){const urls=mediaUrls.get(path)||new Set<string>();urls.add(row.url);mediaUrls.set(path,urls);}add({namespace:'media',path,url:typeof row.url==='string'?row.url:null,filename,mimeType,bytes});}
  else if(typeof row.url==='string'){if(row.url.startsWith('/')||!/^https?:\/\//i.test(row.url))throw new SiteBackupError('SITE_BACKUP_UNRESOLVED_MEDIA',503,'A managed media path cannot be resolved. Repair its storage mapping before export.');externalLinks.add(row.url);}
 };
 for(const row of graph.tables.media){media(row);const metadata=object(row.metadata)?row.metadata:{};if(metadata.storagePath!==undefined&&!isCanonicalMediaStorageJobPath(siteId,String(metadata.storagePath)))throw invalid();const transforms=object(metadata.generatedTransforms)?metadata.generatedTransforms:{};for(const variant of Array.isArray(transforms.variants)?transforms.variants:[]){if(!object(variant))throw invalid();media({...variant,mimeType:variant.mimeType||({'webp':'image/webp','avif':'image/avif','jpeg':'image/jpeg','png':'image/png'} as Record<string,string>)[String(variant.format)]},row);}for(const version of Array.isArray(metadata.replacementVersions)?metadata.replacementVersions:[]){if(!object(version))throw invalid();media(version,row);}}
 for(const row of graph.tables.mediaVersions)media(row,graph.tables.media.find(media=>media.id===row.mediaId));
 const walk=(v:unknown,formId?:string,depth=0)=>{if(depth>SITE_BACKUP_LIMITS.maxDepth)throw invalid();if(object(v)&&v.kind==='backy.form.attachment.v1'&&!isFormAttachment(v))throw invalid();if(isFormAttachment(v)){if(!formId)throw invalid();const previous=attachmentForms.get(v.attachmentId);if(previous&&previous!==formId)throw invalid();attachmentForms.set(v.attachmentId,formId);add({namespace:'attachment',path:formAttachmentPath(siteId,formId,v.attachmentId),url:null,filename:v.filename,mimeType:v.mimeType,bytes:v.sizeBytes});}else if(Array.isArray(v))v.forEach(child=>walk(child,formId,depth+1));else if(object(v))Object.values(v).forEach(child=>walk(child,formId,depth+1));};
 for(const row of graph.tables.formSubmissions)walk(row.values,String(row.formId));
 // Contact/collection attachments must correspond to a scoped submission. This
 // prevents an archive from forging private references to another namespace.
 const verify=(v:unknown,depth=0)=>{if(depth>SITE_BACKUP_LIMITS.maxDepth)throw invalid();if(object(v)&&v.kind==='backy.form.attachment.v1'&&!isFormAttachment(v))throw invalid();if(isFormAttachment(v)){const form=attachmentForms.get(v.attachmentId);if(!form)throw invalid();const file=files.get(`attachment:${formAttachmentPath(siteId,form,v.attachmentId)}`);if(!file||file.bytes!==v.sizeBytes||file.filename!==v.filename||file.mimeType!==v.mimeType)throw invalid();}else if(Array.isArray(v))v.forEach(child=>verify(child,depth+1));else if(object(v))Object.values(v).forEach(child=>verify(child,depth+1));};
 verify(graph);
 if(files.size>SITE_BACKUP_LIMITS.maxFiles||[...files.values()].reduce((sum,file)=>sum+file.bytes,0)>SITE_BACKUP_LIMITS.maxBinaryBytes)throw new SiteBackupError('SITE_BACKUP_LIMIT_EXCEEDED',413,'Managed files exceed the bounded backup limit (32 MiB / 10,000 files). No partial backup was returned.');
 return {files:[...files.values()],externalLinks:[...externalLinks],attachmentForms,mediaUrls};
}
const timed=async<T>(operation:Promise<T>)=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new SiteBackupError('SITE_BACKUP_STORAGE_TIMEOUT',503,'The bounded storage read timed out. Retry after checking storage.')),15000);})]);}finally{if(timer)clearTimeout(timer);}};
export async function exportSiteBackup(repository:BackySiteBackupRepository,siteId:string):Promise<SiteBackupPackage>{
 return repository.snapshot(siteId,async raw=>{
  const graph=structuredClone(raw);
  graph.site.settings=scrubSiteBackupCredentials(graph.site.settings);
  // Stored submission/collection/editor values are private authored data and
  // remain complete. Credential stripping is confined to configuration.
  for(const component of graph.tables.interactiveComponents){component.runtime=scrubSiteBackupCredentials(component.runtime);component.security=scrubSiteBackupCredentials(component.security);}
  for(const row of graph.tables.siteVisitors){row.providerIssuer='backy:archived-attribution';row.providerSubject=String(row.id);row.status='removed';}
  const refs=siteBackupFileReferences(graph),media=refs.files.some(f=>f.namespace==='media')?await getMediaStorageAdapter():null,attachments=refs.files.some(f=>f.namespace==='attachment')?await getFormAttachmentStorage():null;
  const files:SiteBackupFile[]=[];const started=Date.now();
  for(const file of refs.files){if(Date.now()-started>20000)throw new SiteBackupError('SITE_BACKUP_STORAGE_TIMEOUT',503,'The export exceeded its bounded storage window. No partial package was returned.');const bytes=await timed((file.namespace==='media'?media!:attachments!).read(file.path));if(bytes.length!==file.bytes)throw new SiteBackupError('SITE_BACKUP_BYTES_INCOMPLETE',503,'A managed file is missing or has changed size. No partial package was returned.');files.push({...file,id:randomUUID(),sha256:digest(bytes),base64:bytes.toString('base64')});}
  const archive:SiteBackupPackage={contract:'backy.site-backup.v1',exportedAt:new Date().toISOString(),sourceSiteId:siteId,graph,files,externalLinks:refs.externalLinks,exclusions:SITE_BACKUP_EXCLUSIONS};
  if(Buffer.byteLength(JSON.stringify(archive))>SITE_BACKUP_LIMITS.maxArchiveBytes)throw new SiteBackupError('SITE_BACKUP_LIMIT_EXCEEDED',413,'The private package exceeds 64 MiB. No partial package was returned.');return archive;
 });
}
export function validateSiteBackup(value:unknown,siteId:string):SiteBackupPackage {
 if(!object(value)||value.contract!=='backy.site-backup.v1'||value.sourceSiteId!==siteId||!Array.isArray(value.files))throw invalid();assertSiteBackupGraph(value.graph,siteId);
 const expected=siteBackupFileReferences(value.graph),seen=new Set<string>();
 if(value.files.length!==expected.files.length)throw invalid();
 for(const file of value.files){if(!object(file)||!['media','attachment'].includes(String(file.namespace))||typeof file.path!=='string'||typeof file.base64!=='string'||typeof file.sha256!=='string')throw invalid();const key=`${file.namespace}:${file.path}`,ref=expected.files.find(ref=>`${ref.namespace}:${ref.path}`===key);if(!ref||seen.has(key)||file.bytes!==ref.bytes||file.filename!==ref.filename||file.mimeType!==ref.mimeType||file.url!==ref.url)throw invalid();seen.add(key);const bytes=Buffer.from(file.base64,'base64');if(bytes.toString('base64')!==file.base64||bytes.length!==ref.bytes||digest(bytes)!==file.sha256)throw invalid();}
 if(Buffer.byteLength(JSON.stringify(value))>SITE_BACKUP_LIMITS.maxArchiveBytes)throw new SiteBackupError('SITE_BACKUP_LIMIT_EXCEEDED',413,'The package exceeds 64 MiB.');
 return {...value,externalLinks:expected.externalLinks,exclusions:SITE_BACKUP_EXCLUSIONS} as SiteBackupPackage;
}
// Runtime private storage is verified here, not copied into deployment traces.
const privateStorageDirectory=()=>{const path=resolve(/* turbopackIgnore: true */ process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR||join(process.cwd(),'.backy-private/form-attachments'));let ancestor=path;while(!existsSync(/* turbopackIgnore: true */ ancestor)&&dirname(ancestor)!==ancestor)ancestor=dirname(ancestor);return resolve(realpathSync(/* turbopackIgnore: true */ ancestor),relative(ancestor,path));};
const storageIdentity=()=>digest(JSON.stringify({media:currentMediaStorageIdentity().identity,privateBucket:process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_BUCKET||null,privateDirectory:privateStorageDirectory()}));
const jobDirectory=()=>join(process.cwd(),'data/backy/private-site-restore/jobs');
function writeJob(job:SiteBackupRestoreJob){mkdirSync(jobDirectory(),{recursive:true,mode:0o700});const path=join(jobDirectory(),`${job.id}.json`),temp=`${path}.${randomUUID()}.tmp`,text=JSON.stringify(job);const fd=openSync(temp,'wx',0o600);try{writeFileSync(fd,text);fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);const directory=openSync(jobDirectory(),'r');try{fsyncSync(directory);}finally{closeSync(directory);}if(readFileSync(path,'utf8')!==text)throw new SiteBackupError('SITE_BACKUP_JOB_UNAVAILABLE',503,'Restore staging could not be persisted.');}
const activeDemoJobs=new Set<string>();
export function demoSiteBackupRepository():BackySiteBackupRepository {
 const get=(siteId:string,id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw invalid();const path=join(jobDirectory(),`${id}.json`);if(!existsSync(path))return null;const job=JSON.parse(readFileSync(path,'utf8')) as SiteBackupRestoreJob;if(job.sourceSiteId!==siteId)return null;return job;};
 return {async withJobLock(siteId,id,run){const key=siteId+':'+id;if(activeDemoJobs.has(key))throw new SiteBackupError('SITE_BACKUP_BUSY',503,'This restore is already active. Retry later.');activeDemoJobs.add(key);try{return await run();}finally{activeDemoJobs.delete(key);}},async snapshot(siteId,read){const graph=captureDemoSiteBackup(siteId),fingerprint=siteBackupFingerprint(graph),result=await read(graph);if(fingerprint!==siteBackupFingerprint(captureDemoSiteBackup(siteId)))throw new SiteBackupError('SITE_BACKUP_SOURCE_CHANGED',409,'Site content changed during export. Retry for a coherent package.');return result;},async createJob(input){captureDemoSiteBackup(input.sourceSiteId);const job:SiteBackupRestoreJob={...input,id:randomUUID(),state:'pending',remaining:input.files.length,createdAt:new Date().toISOString()};writeJob(job);return job;},async getJob(siteId,id){return get(siteId,id);},async recordFileState(siteId,id,index,state){const job=get(siteId,id);if(!job||job.state!=='pending'||!job.files[index]||job.files[index].writeState!==(state==='writing'?'planned':'writing'))throw invalid();job.files[index].writeState=state;writeJob(job);},async listJobs(siteId){const {readdirSync}=await import('node:fs');if(!existsSync(jobDirectory()))return[];const paths=readdirSync(jobDirectory()).filter(path=>/^[a-f0-9-]{36}\.json$/.test(path));if(paths.length>100)throw new SiteBackupError('SITE_BACKUP_JOB_INVENTORY_INCOMPLETE',503,'Resolve earlier restore staging before creating more.');return paths.map(path=>get(siteId,path.slice(0,-5))).filter((job):job is SiteBackupRestoreJob=>!!job);},async commit(id,siteId,graph){const job=get(siteId,id);if(!job||job.targetSiteId!==graph.site.id||job.state!=='pending')throw invalid();commitDemoSiteBackup(graph,siteId);writeJob({...job,state:'committed'});},async settle(siteId,id,remaining){const job=get(siteId,id);if(!job)throw invalid();writeJob({...job,remaining,state:remaining?'pending':'settled'});},async pruneSettled(siteId){const {readdirSync}=await import('node:fs');if(!existsSync(jobDirectory()))return;for(const path of readdirSync(jobDirectory()).filter(path=>/^[a-f0-9-]{36}\.json$/.test(path))){const job=get(siteId,path.slice(0,-5));if(job?.state==='settled')unlinkSync(join(jobDirectory(),path));}}};
}
export type SiteBackupPreview={contract:'backy.site-backup-preview.v1';sourceSiteId:string;teamId:string;name:string;slug:string;packageFingerprint:string;counts:Record<string,number>;files:number;bytes:number;externalLinks:number;exclusions:string[];safetyResets:string[];concurrencyBoundary:'postgres-table-locks'|'demo-single-process'};
export async function previewSiteBackup(archive:SiteBackupPackage,input:{name:string;slug:string;teamId:string},repositories:BackyRepositories|null):Promise<SiteBackupPreview>{
 if(!input.name.trim()||input.name.length>120||!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(input.slug))throw new SiteBackupError('SITE_BACKUP_DRAFT_IDENTITY_REQUIRED',400,'Choose a name up to 120 characters and a lowercase draft slug of 3–80 characters.');
 const conflict=repositories?await repositories.sites.getBySlug(input.slug):getSiteByIdOrSlug(input.slug);if(conflict)throw new SiteBackupError('SITE_BACKUP_SLUG_CONFLICT',409,'The requested draft site slug is already in use.');
 const settings=repositories?await repositories.settings.get():getAdminSettings(),commerce=object(settings.integrations)&&object(settings.integrations.commerce)?settings.integrations.commerce:{};
 const count=repositories?(await repositories.sites.list({status:'all',limit:1,offset:0})).pagination.total:getSites({includeUnpublished:true}).length;
 if(commerce.overageMode==='block'&&count>=(Number(commerce.siteLimit)||3))throw new SiteBackupError('BILLING_SITE_LIMIT',402,'The workspace site limit cannot accept another draft site.');
 const policy=resolveMediaUploadPolicy(settings),bytes=archive.files.reduce((sum,file)=>sum+file.bytes,0);
 if(bytes>policy.quotaBytes||readMediaBillingLimit({},settings,bytes).blocked||archive.files.some(file=>!isUploadAllowedByFileType(policy,{filename:file.filename,mimeType:file.mimeType})))throw new SiteBackupError('SITE_BACKUP_UPLOAD_POLICY_DENIED',413,'The package cannot fit the current storage/type policy.');
 return {contract:'backy.site-backup-preview.v1',sourceSiteId:archive.sourceSiteId,...input,packageFingerprint:siteBackupFingerprint(archive),counts:Object.fromEntries(SITE_BACKUP_TABLES.map(name=>[name,archive.graph.tables[name].length])),files:archive.files.length,bytes,externalLinks:archive.externalLinks.length,exclusions:SITE_BACKUP_EXCLUSIONS,safetyResets:SITE_BACKUP_RESETS,concurrencyBoundary:repositories?'postgres-table-locks':'demo-single-process'};
}
export async function applySiteBackup(repository:BackySiteBackupRepository,archive:SiteBackupPackage,preview:SiteBackupPreview,actorId:string|null,repositories:BackyRepositories|null){
 const settings=repositories?await repositories.settings.get():getAdminSettings(),reservedBytes=await mediaStorageUsageWithPending(archive.sourceSiteId,repositories),nextBytes=reservedBytes+preview.bytes;
 if(nextBytes>resolveMediaUploadPolicy(settings).quotaBytes||readMediaBillingLimit(archive.graph.site.settings,settings,nextBytes).blocked)throw new SiteBackupError('SITE_BACKUP_UPLOAD_POLICY_DENIED',413,'Source-site storage quota must retain staged restore bytes until commit or verified cleanup.');
 const targetSiteId=randomUUID(),map=new Map<string,string>([[archive.sourceSiteId,targetSiteId]]);for(const name of SITE_BACKUP_TABLES)for(const row of archive.graph.tables[name])map.set(String(row.id),!repositories&&name==='media'?`media_${randomUUID()}`:!repositories&&name==='mediaFolders'?`folder_${randomUUID()}`:randomUUID());
 const refs=siteBackupFileReferences(archive.graph);for(const id of refs.attachmentForms.keys())map.set(id,randomUUID());
 const files=archive.files.map(file=>{const form=file.namespace==='attachment'?[...refs.attachmentForms].find(([id,form])=>formAttachmentPath(archive.sourceSiteId,form,id)===file.path):undefined;const path=form?formAttachmentPath(targetSiteId,map.get(form[1])!,map.get(form[0])!):`sites/${targetSiteId}/backup/${randomUUID()}/${file.filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'file'}`;map.set(file.path,path);return {...file,path};});
 await repository.pruneSettled(archive.sourceSiteId);if((await repository.listJobs(archive.sourceSiteId)).length>=100)throw new SiteBackupError('SITE_BACKUP_JOB_INVENTORY_INCOMPLETE',503,'Resolve pending restore staging before applying another package.');
 const planned=files.map(({id:_id,base64:_bytes,url:_url,...file})=>({...file,writeState:'planned' as const})),job=await repository.createJob({sourceSiteId:archive.sourceSiteId,targetSiteId,files:planned,storageIdentity:storageIdentity()});
 return repository.withJobLock(archive.sourceSiteId,job.id,async()=>{ try {
  if(repositories&&files.length){const config=resolveMediaScannerConfig();if(config.provider==='none'||config.failOpen)throw new SiteBackupError('SITE_BACKUP_SCANNER_REQUIRED',503,'A configured fail-closed scanner is required for database restore.');}
  const scans=new Map<string,unknown>(),media=files.some(file=>file.namespace==='media')?await getMediaStorageAdapter():null,privateFiles=files.some(file=>file.namespace==='attachment')?await getFormAttachmentStorage():null;
  for(let index=0;index<files.length;index++){const file=files[index],bytes=Buffer.from(file.base64,'base64');const scan=await scanMediaUploadWithProviders({buffer:bytes,originalName:file.filename,mimeType:file.mimeType,mediaType:file.mimeType.startsWith('image/')?'image':file.mimeType.startsWith('video/')?'video':file.mimeType.startsWith('audio/')?'audio':'document'});scans.set(file.path,scan);await repository.recordFileState(archive.sourceSiteId,job.id,index,'writing');const storage=file.namespace==='media'?media!:privateFiles!,uploaded=await storage.upload(bytes,{path:file.path,filename:file.filename,mimeType:file.mimeType,cacheControl:file.namespace==='attachment'?'private, no-store':'public, max-age=31536000, immutable',contentDisposition:file.namespace==='attachment'?'attachment':undefined});if(uploaded.path!==file.path||uploaded.size!==file.bytes||digest(await timed(storage.read(file.path)))!==file.sha256)throw new SiteBackupError('SITE_BACKUP_BYTES_INCOMPLETE',503,'A staged file could not be verified.');await repository.recordFileState(archive.sourceSiteId,job.id,index,'stored');const old=archive.files[index];if(file.namespace==='media')for(const url of refs.mediaUrls.get(old.path)||[])map.set(url,uploaded.url);}
  const graph=prepareSiteBackupDraft(archive.graph,map,{...preview,actorId,remapCollectionTemplatePin:remapRestoredCollectionTemplatePin,remapCollectionTemplateRevisionFingerprint:remapRestoredCollectionTemplateRevisionFingerprint,remapFormTemplatePin:remapRestoredFormTemplatePin,remapFormTemplateRevisionFingerprint:remapRestoredFormTemplateRevisionFingerprint});
  const provider=currentMediaStorageIdentity().provider;for(const row of graph.tables.media){if(object(row.metadata)){if(typeof row.metadata.storagePath==='string'){row.metadata.storageProvider=provider;row.metadata.safetyScan=scans.get(row.metadata.storagePath);}if(Array.isArray(row.metadata.replacementVersions))for(const version of row.metadata.replacementVersions)if(object(version)&&typeof version.storagePath==='string')version.storageProvider=provider;}}for(const version of graph.tables.mediaVersions)if(typeof version.storagePath==='string')version.storageProvider=provider;
  for(const revision of graph.tables.templateRevisions)revision.fingerprint=digest(serializeTemplateRevisionValue(revision.snapshot));
  await repository.commit(job.id,archive.sourceSiteId,graph);
  let cleanupPending=false;try{await repository.settle(archive.sourceSiteId,job.id,0);}catch{cleanupPending=true;}
  return {siteId:targetSiteId,jobId:job.id,state:'draft' as const,cleanupPending,completionWarnings:cleanupPending?['SITE_BACKUP_STAGING_FINALIZATION_PENDING']:[],counts:preview.counts,concurrencyBoundary:preview.concurrencyBoundary};
 }catch(error){throw Object.assign(recognizedSiteBackupError(error)||new SiteBackupError('SITE_BACKUP_RESTORE_FAILED',503,'The restore did not confirm a commit. Retry staging recovery before applying again.'),{jobId:job.id});}
 });
}
/** Unknown commit outcomes inspect a complete graph before deleting any bytes. */
export async function retrySiteBackupJob(repository:BackySiteBackupRepository,siteId:string,id:string){
 return repository.withJobLock(siteId,id,async()=>{
 const job=await repository.getJob(siteId,id);if(!job)throw new SiteBackupError('SITE_BACKUP_JOB_NOT_FOUND',404,'Restore staging not found in this site.');
 if(job.storageIdentity!==storageIdentity()||!Array.isArray(job.files)||job.files.length>SITE_BACKUP_LIMITS.maxFiles)throw new SiteBackupError('SITE_BACKUP_JOB_INVALID',503,'The private staging destination cannot be verified. No files were removed.');
 for(const file of job.files){const valid=file.namespace==='media'?isCanonicalMediaStorageJobPath(job.targetSiteId,file.path):file.namespace==='attachment'&&file.path.startsWith(`form-attachments/sites/${digest(job.targetSiteId)}/forms/`)&&/^form-attachments\/sites\/[a-f0-9]{64}\/forms\/[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(file.path);if(!valid||!['planned','writing','stored'].includes(file.writeState))throw invalid();}
 let targetExists=false,live=new Set<string>();try{await repository.snapshot(job.targetSiteId,async graph=>{targetExists=true;live=new Set(siteBackupFileReferences(graph).files.map(file=>`${file.namespace}:${file.path}`));});}catch(error){if(recognizedSiteBackupError(error)?.code!=='SITE_NOT_FOUND')throw error;}
 let remaining=0,deletedFiles=0,protectedFiles=0;const media=job.files.some(file=>file.namespace==='media')?await getMediaStorageAdapter():null,privateFiles=job.files.some(file=>file.namespace==='attachment')?await getFormAttachmentStorage():null;
 for(const file of job.files){if(targetExists||live.has(`${file.namespace}:${file.path}`)){protectedFiles++;continue;}if(file.writeState==='planned')continue;try{const storage=file.namespace==='media'?media!:privateFiles!;if(file.writeState==='writing'){const bytes=await timed(storage.read(file.path));if(bytes.length!==file.bytes||digest(bytes)!==file.sha256){remaining++;continue;}}await storage.delete(file.path);deletedFiles++;}catch{remaining++;}}
 await repository.settle(siteId,id,remaining);return {jobId:id,status:remaining?'pending':'settled',remainingFiles:remaining,deletedFiles,protectedFiles};
 });
}

export async function assertSiteBackupJobsSettled(siteId:string,repositories:BackyRepositories|null){
 if(!repositories){assertNoPendingDemoSiteBackupJobs(siteId);return;}
 const repository=repositories.siteBackups;if(!repository)throw new SiteBackupError('SITE_BACKUP_UNAVAILABLE',503,'Restore staging must be verified before deleting the site.');
 const jobs=await repository.listJobs(siteId);if(jobs.some(job=>job.state!=='settled'))throw new SiteBackupError('SITE_BACKUP_STAGING_PENDING',409,'Restore staging is pending. Retry its jobs in Whole-site recovery before deleting this source site.');
 await repository.pruneSettled(siteId);
}
