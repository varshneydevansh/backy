import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SiteBackupError } from '@backy-cms/core';

// Fixed server-owned mutable runtime files, never deployment inputs or archive-supplied paths. Single-process demo only.
const paths = () => ['admin-content.json','media-library.json','interactions.json'].map(name => join(process.cwd(),'data/backy',name));
const journal = () => join(process.cwd(),'data/backy/private-site-restore','commit.json');
const hash = (data:string) => createHash('sha256').update(data).digest('hex');
function atomic(path:string,data:string) {
 mkdirSync(dirname(path),{recursive:true,mode:0o700}); const temp=`${path}.${randomUUID()}.tmp`;
 try { const fd=openSync(temp,'wx',0o600); try{writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);} renameSync(temp,path); const dir=openSync(dirname(path),'r');try{fsyncSync(dir);}finally{closeSync(dir);} }finally{try{unlinkSync(temp);}catch{}}
}
type Manifest = { version:1; state:'prepared'|'committed'; files:{path:string;before:string|null;after:string;sha256:string}[] };
/** Called again inside the synchronous delete mutation to close its demo gap. */
export function assertNoPendingDemoSiteBackupJobs(siteId:string){
 const directory=join(process.cwd(),'data/backy/private-site-restore/jobs');if(!existsSync(directory))return;
 for(const filename of readdirSync(directory).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name))){const path=join(directory,filename),job=JSON.parse(readFileSync(path,'utf8'));if(job.id!==filename.slice(0,-5)||!['pending','committed','settled'].includes(job.state))throw new SiteBackupError('SITE_BACKUP_JOB_INVALID',503,'Restore staging cannot be verified.');if(job.sourceSiteId===siteId){if(job.state!=='settled')throw new SiteBackupError('SITE_BACKUP_STAGING_PENDING',409,'Restore staging is pending. Retry its jobs in Whole-site recovery before deleting this source site.');unlinkSync(path);}}
}
export function pendingDemoSiteBackupBytes(siteId:string,targetExists:(id:string)=>boolean):number{
 const directory=join(process.cwd(),'data/backy/private-site-restore/jobs');if(!existsSync(directory))return 0;let bytes=0;
 for(const filename of readdirSync(directory).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name))){const job=JSON.parse(readFileSync(join(directory,filename),'utf8'));if(job.sourceSiteId!==siteId||job.state==='settled'||targetExists(job.targetSiteId))continue;if(!Array.isArray(job.files))throw new SiteBackupError('SITE_BACKUP_JOB_INVALID',503,'Restore staging bytes cannot be verified.');for(const file of job.files){if(!Number.isSafeInteger(file.bytes)||file.bytes<=0)throw new SiteBackupError('SITE_BACKUP_JOB_INVALID',503,'Restore staging bytes cannot be verified.');bytes+=file.bytes;}}
 return bytes;
}
export function recoverDemoSiteBackupCommit() {
 if(!existsSync(journal()))return;
 const manifest=JSON.parse(readFileSync(journal(),'utf8')) as Manifest;
 if(manifest.version!==1||!['prepared','committed'].includes(manifest.state)||!Array.isArray(manifest.files)||manifest.files.length!==3||manifest.files.some((file,index)=>resolve(/* turbopackIgnore: true */ file.path)!==resolve(/* turbopackIgnore: true */ paths()[index])||typeof file.after!=='string'||file.before!==null&&typeof file.before!=='string'||hash(file.after)!==file.sha256))throw new Error('The private demo restore journal is invalid. No content was changed.');
 if(manifest.state==='prepared')for(const file of manifest.files){if(file.before===null){try{unlinkSync(file.path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}else atomic(file.path,file.before);}
 // Committed means all three replacements were verified and durable. Never
 // replay over subsequent writes; removing the journal finishes recovery.
 unlinkSync(journal());
}
export function commitDemoSiteBackupFiles(after:string[]) {
 recoverDemoSiteBackupCommit();if(after.length!==3)throw new Error('Invalid demo restore snapshot.');
 const manifest:Manifest={version:1,state:'prepared',files:paths().map((path,index)=>({path,before:existsSync(/* turbopackIgnore: true */ path)?readFileSync(/* turbopackIgnore: true */ path,'utf8'):null,after:after[index],sha256:hash(after[index])}))};
 atomic(journal(),JSON.stringify(manifest));
 try {for(const file of manifest.files){atomic(file.path,file.after);if(hash(readFileSync(file.path,'utf8'))!==file.sha256)throw new Error('The demo restore write was incomplete.');}atomic(journal(),JSON.stringify({...manifest,state:'committed'}));unlinkSync(journal());}
 catch(error){recoverDemoSiteBackupCommit();throw error;}
}
