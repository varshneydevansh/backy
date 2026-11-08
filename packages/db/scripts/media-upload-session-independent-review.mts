// Independent final-review extension of actual resumable-upload handlers. Own socket-only cluster; native pg.
// Auth and final storage admission are synthetic fixtures; handler/staging/lock are actual source.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { NextRequest, NextResponse } from 'next/server';
import { withVisitorProfilePostgres } from './visitor-profile-postgres-isolated.mts';
import { createMediaUploadSessionRepository } from '../src/repositories/media-upload-sessions.ts';
import { createMediaRepository } from '../src/repositories/media.ts';
const require=createRequire(import.meta.url);
function load(relative:string,mocks:Record<string,any>={}){
 const filename=fileURLToPath(new URL(relative,import.meta.url)),module={exports:{} as any};
 vm.runInNewContext(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:(id:string)=>id in mocks?mocks[id]:require(id),process,Buffer,TextDecoder,URL,Headers,File,FormData,Date,Promise,setTimeout,clearTimeout,console},{filename});return module.exports;
}
if(process.argv.length>2)throw new Error('No database target arguments allowed.');
await withVisitorProfilePostgres(async({client,sites})=>{
 const [config]=await client`SELECT current_setting('unix_socket_directories') host,current_setting('port') port,current_user username`;
 const pool=new Pool({host:config.host,port:Number(config.port),user:config.username,database:'postgres',max:8});
 try {
 const db=drizzle(pool),repo=createMediaUploadSessionRepository(db as any,'postgres'),media=createMediaRepository(db as any,'postgres');
 const actor=randomUUID(),otherActor=randomUUID(),[a,b]=sites,source=Buffer.from([0,255,128,65,66,0,254]),hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 const create=async(bytes=source,site=a)=>repo.create({id:randomUUID(),siteId:site.id,actorId:actor,filename:'binary.bin',mimeType:'application/octet-stream',sizeBytes:bytes.length,sha256:hash(bytes),fields:{visibility:'private'},expiresAt:new Date(Date.now()+3600000).toISOString()});
 const upload=await create();assert.equal(await repo.get(a.id,otherActor,upload.id),null);assert.equal(await repo.get(b.id,actor,upload.id),null);assert.equal(await repo.claim(a.id,actor,upload.id),null);
 const appends=await Promise.allSettled([repo.append(a.id,actor,upload.id,0,source),repo.append(a.id,actor,upload.id,0,source)]);assert.equal(appends.filter(r=>r.status==='fulfilled').length,1);assert.equal((appends.find(r=>r.status==='rejected') as any).reason.code,'MEDIA_UPLOAD_OFFSET_CONFLICT');
 const claims=await Promise.all([repo.claim(a.id,actor,upload.id),repo.claim(a.id,actor,upload.id)]);assert.equal(claims.filter(Boolean).length,1);assert.deepEqual(Buffer.concat(await repo.readChunks(a.id,actor,upload.id)),source);assert.equal(await repo.cancel(a.id,actor,upload.id),false);assert.equal(await repo.reservedBytes(a.id),source.length);assert.equal(await repo.reservedBytes(a.id,upload.id),0);
 await repo.settle(a.id,actor,upload.id,randomUUID());assert.equal((await repo.get(a.id,actor,upload.id))!.state,'complete');assert.equal((await client`SELECT count(*)::int n FROM media_upload_chunks WHERE upload_id=${upload.id}`)[0].n,0);assert.equal(await repo.reservedBytes(a.id),0);
 const expires=await create();await client`UPDATE media_upload_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${expires.id}`;await assert.rejects(repo.append(a.id,actor,expires.id,0,source));assert.equal(await repo.claim(a.id,actor,expires.id),null);await repo.pruneExpired(a.id);assert.equal(await repo.get(a.id,actor,expires.id),null);
 for(const role of ['anon','authenticated'])await client.begin(async(tx:any)=>{await tx.unsafe(`SET LOCAL ROLE ${role}`);for(const table of ['media_upload_sessions','media_upload_chunks'])await assert.rejects(tx.savepoint((save:any)=>save.unsafe(`SELECT * FROM ${table}`)),/permission denied/);});
 // Actual handler with native pg repository and durable shared site lock.
 const context=load('../../../apps/public/src/lib/mediaUploadReservationContext.ts'),storageLock=load('../../../apps/public/src/lib/mediaStorageMutation.ts');
 let currentActor=actor,admissionCalls=0,quota=10000000,admitStatus=200,admitCommitted=false,storeRealMedia=false,pauseAdmission:Promise<void>|null=null;let createdJournal:any=null;const findings:string[]=[];const inventory:any[]=[];
 const repositories:any={mediaUploadSessions:repo,media,settings:{get:async()=>({})},sites:{getById:async(id:string)=>sites.find((site:any)=>site.id===id),getBySlug:async(slug:string)=>sites.find((site:any)=>site.slug===slug)}};
 const handler=load('../../../apps/public/src/lib/adminMediaUploadSessions.ts',{
  './adminAccess':{requireAdminAccess:async()=>({type:'session',session:{user:{id:currentActor}}})},
  './repositoryRuntime':{getRequiredDatabaseRepositories:async()=>repositories},
  './mediaUploadPolicy':{resolveMediaUploadPolicy:()=>({maxUploadBytes:52428800,quotaBytes:quota}),isUploadAllowedByFileType:()=>true,readMediaBillingLimit:()=>({blocked:false})},
  './mediaStorageRecovery':{mediaStorageUsageWithPending:async(siteId:string)=>inventory.filter(row=>row.siteId===siteId).reduce((n,row)=>n+row.size,0)+await repo.reservedBytes(siteId,context.currentCompletingMediaUpload())},
  './mediaStorageMutation':storageLock,'./mediaUploadReservationContext':context,
  './mediaInventory':{readCompleteMediaInventory:async(siteId:string)=>inventory.filter(row=>row.siteId===siteId)},
  '../app/api/admin/sites/[siteId]/media/route':{POST:async(request:NextRequest)=>{
   admissionCalls++;if(pauseAdmission)await pauseAdmission;const form=await request.formData(),file=form.get('file') as File,metadata=JSON.parse(form.get('metadata') as string);assert.equal(metadata.resumableUploadId,context.currentCompletingMediaUpload());
   const session=await repo.get(a.id,actor,metadata.resumableUploadId);assert.equal(hash(Buffer.from(await file.arrayBuffer())),session!.sha256);assert.equal(await repo.reservedBytes(a.id,context.currentCompletingMediaUpload()),await repo.reservedBytes(a.id)-session!.sizeBytes);
   const item={id:randomUUID(),siteId:a.id,size:file.size,sizeBytes:file.size,metadata:{...metadata,binaryFingerprint:{value:session!.sha256}}};if(admitCommitted||admitStatus===200){inventory.push(item);if(storeRealMedia)await client`INSERT INTO media(id,site_id,filename,original_name,mime_type,size_bytes,type,url,metadata) VALUES (${item.id},${a.id},'fixture.bin','fixture.bin','application/octet-stream',${file.size},'other','https://bytes.fixture.invalid/fixture',${JSON.stringify(item.metadata)}::jsonb)`;}return NextResponse.json({success:admitStatus===200,data:{media:item}},{status:admitStatus});
  }},
 });
 async function send(method:string,body:any={},id?:string,site=a,offset?:number){const request=new NextRequest(`https://backy.example/api/admin/sites/${site.id}/media/uploads${id?'/'+id:''}`,{method,headers:{'content-type':method==='PATCH'?'application/offset+octet-stream':'application/json',...(offset===undefined?{}:{'upload-offset':String(offset)})},...(['GET','DELETE'].includes(method)?{}:{body:method==='PATCH'?body:JSON.stringify(body)})});return handler.handleAdminMediaUploadSessions(request,site.id,id);}
 const start=async(bytes=source)=>{const response=await send('POST',{filename:'binary.bin',mimeType:'application/octet-stream',sizeBytes:bytes.length,sha256:hash(bytes),fields:{visibility:'private'}});assert.equal(response.status,201);assert.match(response.headers.get('cache-control')!,/no-store/);const payload=await response.json();assert.doesNotMatch(JSON.stringify(payload),/actorId|bytes\":\[/);return payload.data.upload.id;};
 quota=10;const contenders=await Promise.all([send('POST',{filename:'a.bin',mimeType:'application/octet-stream',sizeBytes:7,sha256:hash(source),fields:{}}),send('POST',{filename:'b.bin',mimeType:'application/octet-stream',sizeBytes:7,sha256:hash(source),fields:{}})]);assert.equal(contenders.filter(r=>r.status===201).length,1);assert.equal(await repo.reservedBytes(a.id),7);for(const response of contenders)if(response.status===201)await send('DELETE',{},(await response.json()).data.upload.id);quota=10000000;
 const id=await start();currentActor=otherActor;assert.equal((await send('GET',{},id)).status,404);currentActor=actor;assert.equal((await send('GET',{},id,b)).status,404);assert.equal((await send('PATCH',source,id,a,1)).status,409);assert.equal((await send('PATCH',Buffer.alloc(1048577),id,a,0)).status,413);assert.equal((await send('PATCH',source,id,a,0)).status,200);assert.equal((await send('POST',{action:'complete'},id)).status,200);assert.equal(admissionCalls,1);assert.equal((await send('POST',{action:'complete'},id)).status,200);assert.equal(admissionCalls,1);
 inventory.length=0;
 const damaged=await start();await send('PATCH',source,damaged,a,0);await client`UPDATE media_upload_chunks SET bytes=${Buffer.alloc(source.length,1)} WHERE upload_id=${damaged}`;assert.equal((await send('POST',{action:'complete'},damaged)).status,409);assert.equal((await repo.get(a.id,actor,damaged))!.state,'failed');assert.equal(admissionCalls,1);
 const uncertain=await start();await send('PATCH',source,uncertain,a,0);admitStatus=503;assert.equal((await send('POST',{action:'complete'},uncertain)).status,503);assert.equal((await repo.get(a.id,actor,uncertain))!.state,'completing');const before=admissionCalls;assert.equal((await send('POST',{action:'complete'},uncertain)).status,409);assert.equal(admissionCalls,before);
 // A confirmed committed marker recovers an interrupted settlement without uploading twice.
 inventory.push({id:randomUUID(),siteId:a.id,size:source.length,sizeBytes:source.length,metadata:{resumableUploadId:uncertain,binaryFingerprint:{value:hash(source)}}});assert.equal((await send('POST',{action:'complete'},uncertain)).status,200);assert.equal(admissionCalls,before);assert.equal((await repo.get(a.id,actor,uncertain))!.state,'complete');

 const discard=await start();await send('PATCH',source,discard,a,0);assert.equal((await send('POST',{action:'complete'},discard)).status,503);assert.equal((await send('DELETE',{},discard)).status,200);assert.equal(await repo.get(a.id,actor,discard),null);
 const expiredUpload=await start();await client`UPDATE media_upload_sessions SET expires_at=now()-interval '1 second' WHERE id=${expiredUpload}`;assert.equal((await send('GET',{},expiredUpload)).status,410);assert(await repo.get(a.id,actor,expiredUpload));const pruneTrigger=await start();assert.equal(await repo.get(a.id,actor,expiredUpload),null);await send('DELETE',{},pruneTrigger);

 // Actual finalizer's durable site guard must reject concurrent discard while admission is held.
 const active=await start();await send('PATCH',source,active,a,0);
 createdJournal=await media.storageJobs!.create({siteId:a.id,mediaId:null,operation:'upload',provider:'local',storageIdentity:'a'.repeat(64),files:[{path:`sites/${a.id}/fixture/${active}.bin`,bytes:source.length,purpose:'write'}],requestId:'synthetic-journal'});
 let release!:()=>void;pauseAdmission=new Promise<void>(resolve=>{release=resolve;});const beforeActive=admissionCalls;admitStatus=503;admitCommitted=false;
 const completing=send('POST',{action:'complete'},active);while(admissionCalls===beforeActive)await new Promise(resolve=>setTimeout(resolve,0));
 const during=await send('DELETE',{},active);assert.equal(during.status,503);assert.equal((await repo.get(a.id,actor,active))!.state,'completing');assert(await media.storageJobs!.get(a.id,createdJournal.id));
 release();pauseAdmission=null;assert.equal((await completing).status,503);const deleteUncertain=await send('DELETE',{},active);assert.equal(deleteUncertain.status,200);assert.equal(await repo.get(a.id,actor,active),null);const retainedJournal=await media.storageJobs!.get(a.id,createdJournal.id);assert.equal(retainedJournal!.state,'pending');assert.deepEqual(retainedJournal!.remainingPaths,createdJournal.remainingPaths);
 // A real persisted media marker prevents staging discard from pretending to erase committed bytes.
 storeRealMedia=true;admitCommitted=true;const committed=await start();await send('PATCH',source,committed,a,0);const commitReply=await send('POST',{action:'complete'},committed);assert.equal(commitReply.status,503);
 const committedId=inventory.find(row=>row.metadata.resumableUploadId===committed)!.id;assert(await media.getById(a.id,committedId),"actual media persisted "+JSON.stringify(await client`SELECT id,site_id FROM media`));const blockedDelete=await send('DELETE',{},committed);assert.equal(blockedDelete.status,409);assert.equal((await blockedDelete.json()).error.code,'UPLOAD_MEDIA_COMMITTED');assert(await repo.get(a.id,actor,committed));assert(await media.getById(a.id,committedId),"actual media persisted "+JSON.stringify(await client`SELECT id,site_id FROM media`));assert(await media.storageJobs!.get(a.id,createdJournal.id));storeRealMedia=false;admitCommitted=false;
 // API's explicit maximum is exactly50MiB; no oversized body allocation is necessary.
 quota=100*1024*1024;let boundary=await send('POST',{filename:'bound.bin',mimeType:'application/octet-stream',sizeBytes:50*1024*1024,sha256:'a'.repeat(64),fields:{}});assert.equal(boundary.status,201);await send('DELETE',{},(await boundary.json()).data.upload.id);
 boundary=await send('POST',{filename:'bound.bin',mimeType:'application/octet-stream',sizeBytes:50*1024*1024+1,sha256:'a'.repeat(64),fields:{}});assert(boundary.status>=400);
 // A lost successful response must not turn expiry into automatic duplicate admission.
 admitStatus=200;const expiredComplete=await start();await send('PATCH',source,expiredComplete,a,0);await send('POST',{action:'complete'},expiredComplete);assert.equal((await repo.get(a.id,actor,expiredComplete))!.state,'complete');
 await client`UPDATE media_upload_sessions SET expires_at=now()-interval '1 second' WHERE id=${expiredComplete}`;
 const pruneCompleteTrigger=await start();await send('DELETE',{},pruneCompleteTrigger);const expiredResult=await send('GET',{},expiredComplete);assert.equal(expiredResult.status,200);const beforeReceipt=admissionCalls;assert.equal((await send('POST',{action:'complete'},expiredComplete)).status,200);assert.equal(admissionCalls,beforeReceipt);assert(await repo.get(a.id,actor,expiredComplete));
 console.log(JSON.stringify({ok:true,mode:'owned-socket-only-native-pg',boundary:'actual staging/handler/durable-lock; synthetic authorization and final storage admission',checks:['binary-bytea-exact','site-actor-scope','chunk-offset-concurrency','claim-concurrency','chunk-limit','expiry','RLS','reservation-quota-concurrency','internal-ALS-exclusion','server-form-bytes','checksum-corruption','completion-idempotency','uncertainty-no-duplicate','committed-marker-recovery','discard-vs-active-finalizer','uncertain-discard-preserves-journal','real-committed-media-discard-preserved','50MiB-boundary','complete-receipt-survives-prune'],findings,configuredTargetUsed:false}));
 } finally {await pool.end();}
});
