import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),{NextResponse}=require('next/server');
function load(relative,mocks,cache=new Map()){
 const filename=fileURLToPath(new URL(relative,import.meta.url));if(cache.has(filename))return cache.get(filename);const module={exports:{}};cache.set(filename,module.exports);
 vm.runInNewContext(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Request,Response,Headers,URL,Buffer,process,fetch,AbortController,setTimeout,clearTimeout,console:{error(){}},require:id=>id in mocks?mocks[id]:id.startsWith('@/lib/')?load('../src/lib/'+id.slice(6)+'.ts',mocks,cache):id.startsWith('.')?load(new URL(id+'.ts',new URL(relative,import.meta.url)).href,mocks,cache):require(id)},{filename});cache.set(filename,module.exports);return module.exports;
}
export function siteDeletionRoute({demo=false,site,repository,remove,audit,interaction,deny=()=>0,blocked=()=>false}){
 return load('../src/app/api/admin/sites/[siteId]/route.ts',{
 '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repository},
 '@/lib/adminAccess':{requireAdminAccess:async(_r,requestId,input)=>{assert.equal(input.permission,'sites.delete');const status=deny();return status?NextResponse.json({success:false,requestId,error:{code:'DENIED',message:'Denied'}},{status}):{};},requireAdminTeamScopeAccess:async()=>null},
 '@/lib/backyStore':{getSiteByIdOrSlug:id=>site(id),deleteAdminSite:remove,trackWebhookEvent:interaction},
 '@/lib/adminAudit':{recordAdminAudit:audit,toAuditJsonObject:value=>value},
 '@/lib/commentRepositorySupport':{recordRepositoryInteractionEvent:async(_repo,event)=>interaction(event)},
 '@/lib/mediaStorageMutation':{withMediaStorageMutation:async(_r,_s,_id,run)=>run()},
 '@/lib/mediaStorageRecovery':{assertSiteMediaStorageJobsSettled:async()=>{},mediaStorageRecoveryErrorResponse:()=>null},
 '@/lib/siteBackup':{assertSiteBackupJobsSettled:async()=>{}},
 '@/lib/formAttachmentLifecycle':{assertSiteFormAttachmentsDeleted:async()=>{}},
 '@/lib/siteCommentDeliveryLifecycle':{siteCommentDeliveryDeletionResponse:async(_site,_repo,requestId)=>blocked()?NextResponse.json({success:false,requestId,error:{code:'SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS',message:'Evidence retained'}},{status:409}):null,siteCommentDeliveryDeletionErrorResponse:()=>null},
 '@/lib/siteFormDeliveryLifecycle':{siteFormDeliveryDeletionResponse:async()=>null,siteFormDeliveryDeletionErrorResponse:()=>null},
 });
}
export async function callSiteDeletion(route,id){const response=await route.DELETE(new Request('http://fixture.invalid/api/admin/sites/'+id,{method:'DELETE'}),{params:Promise.resolve({siteId:id})});return{status:response.status,body:await response.json()};}
async function main(){
 const baseline=process.argv.includes('--expect-known-before-delete');let calls=0,responseStatus=200,checks=0;const evidence=[];
 const server=createServer((_request,response)=>{calls++;response.writeHead(responseStatus);response.end('owned');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/notification`;
 try{for(const demo of [false,true])for(const failure of (baseline?['delete','audit','journal','none']:['delete','audit','journal','provider','missing','none'])){
  let present=true,deny=0,blocked=false;const events=[],audits=[];const initial={id:'owned-site',name:'Owned',slug:'owned',status:'draft',isPublished:false,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',settings:{webhooks:{enabled:true,endpoints:[{id:'fixture',name:'Fixture',url,eventKinds:['site-deleted']}]}}};
  responseStatus=failure==='provider'?503:200;
  const remove=()=>{if(failure==='missing')return false;if(failure==='delete')throw Error('PRIVATE_DELETE');present=false;return true;};
  const audit=async input=>{audits.push({present,input});if(failure==='audit')throw Error('PRIVATE_AUDIT');return {};};
  const interaction=event=>{events.push({present,event});if(failure==='journal')throw Error('PRIVATE_JOURNAL');};
  const repository={visitorAccounts:{privacyErasure:{withDeletionPreflight:async(_site,_form,operation)=>operation()}},sites:{getById:async()=>present?initial:null,getBySlug:async()=>present?initial:null,delete:async()=>remove()},auditLogs:{record:async event=>interaction(event)}};
  const route=siteDeletionRoute({demo,site:()=>present?initial:null,repository,remove,audit,interaction,deny:()=>deny,blocked:()=>blocked});const before=calls;
  const result=await callSiteDeletion(route,initial.id);assert(!JSON.stringify(result.body).includes('PRIVATE_'));checks++;
  if(baseline){assert.equal(result.status,['delete','audit','journal'].includes(failure)?500:200);if(failure==='delete'){assert.equal(calls,before+1);assert(present);assert(events.every(event=>event.present));}checks++;}
  else{assert.equal(result.status,failure==='delete'?500:failure==='missing'?404:200);if(failure==='delete'||failure==='missing'){assert.equal(calls,before);assert.equal(events.length,0);assert.equal(audits.length,0);assert(present);}else{assert(!present);assert(events.every(event=>!event.present));assert(audits.every(event=>!event.present));const expected=failure==='audit'?['SITE_DELETION_AUDIT_PENDING']:['journal','provider'].includes(failure)?['SITE_DELETION_WEBHOOK_PENDING']:[];assert.deepEqual(Array.from(result.body.data.completionWarnings),expected);}checks+=4;}
  evidence.push({mode:demo?'demo-adapter':'repository-adapter',failure,status:result.status,present,providerCalls:calls-before,events:events.map(event=>({present:event.present,status:event.event.status}))});
  if(failure==='none'){const previous=calls;const again=await callSiteDeletion(route,initial.id);assert.equal(again.status,404);assert.equal(calls,previous);checks+=2;}
 }
 for(const code of[403,409]){let effects=0;const route=siteDeletionRoute({site:()=>({id:'site',settings:{}}),repository:{visitorAccounts:{privacyErasure:{withDeletionPreflight:async(_site,_form,operation)=>operation()}},sites:{getById:async()=>({id:'site',settings:{}})}},remove:()=>{effects++;return true;},audit:async()=>{effects++;},interaction:async()=>{effects++;},deny:()=>code===403?403:0,blocked:()=>code===409});assert.equal((await callSiteDeletion(route,'site')).status,code);assert.equal(effects,0);checks+=2;}
 if(baseline)writeFileSync('/tmp/backy-site-deletion-before-notification-baseline.json',JSON.stringify({boundary:'Actual DELETE + actual webhook helper; synthetic storage/auth/journal, owned HTTP endpoint, no provider',checks,evidence},null,2));
 console.log(`Site deletion outcomes ${baseline?'before-delete defect reproduced':'PASS'} ${checks}; actual DELETE/helper, isolated adapters and owned HTTP, no real provider.`);
 }finally{await new Promise(resolve=>server.close(resolve));}
}

export async function runSiteDeletionPostgresProof({sql,repository,uuid}){
 let calls=0,checks=0;const server=createServer((_request,response)=>{calls++;response.writeHead(200);response.end('owned');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const url=`http://127.0.0.1:${server.address().port}/post-delete`,siteId=uuid();
 await sql`INSERT INTO sites(id,name,slug,settings) VALUES (${siteId},'Deletion fixture',${'deletion-'+siteId},${sql.json({webhooks:{enabled:true,endpoints:[{id:'fixture',name:'Owned',url,eventKinds:['site-deleted']}]}})})`;
 const audit=async input=>{assert.equal(await repository.sites.getById(siteId),null);assert.equal(input.siteId,null);return repository.auditLogs.record(input);};
 const route=siteDeletionRoute({repository,audit,interaction:()=>{throw Error('Wrong journal path');}});
 await sql.unsafe(`CREATE FUNCTION reject_site_delete_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${siteId}' THEN RAISE EXCEPTION 'PRIVATE_DELETE_FAILURE'; END IF; RETURN OLD; END $$; CREATE TRIGGER reject_site_delete_fixture BEFORE DELETE ON sites FOR EACH ROW EXECUTE FUNCTION reject_site_delete_fixture()`);
 const failed=await callSiteDeletion(route,siteId);assert.equal(failed.status,500);assert.equal(calls,0);assert(await repository.sites.getById(siteId));assert.equal((await sql`SELECT count(*)::int AS n FROM activity_logs WHERE entity_id=${siteId}`)[0].n,0);checks+=4;
 await sql.unsafe('DROP TRIGGER reject_site_delete_fixture ON sites; DROP FUNCTION reject_site_delete_fixture()');
 const saved=await callSiteDeletion(route,siteId);assert.equal(saved.status,200);assert.deepEqual(Array.from(saved.body.data.completionWarnings),[]);assert.equal(calls,1);assert.equal(await repository.sites.getById(siteId),null);checks+=4;
 const events=await sql`SELECT site_id,action,details FROM activity_logs WHERE entity_id=${siteId}`;assert.equal(events.length,3);assert(events.every(event=>event.site_id===null&&event.details.deletedSiteId===siteId));assert(events.some(event=>event.action==='site.deleted'));assert(events.some(event=>event.details.status==='succeeded'));checks+=4;
 assert.equal(await repository.sites.delete(siteId),false);assert.equal((await callSiteDeletion(route,siteId)).status,404);assert.equal(calls,1);checks+=3;
 const concurrentSiteId=uuid();await sql`INSERT INTO sites(id,name,slug,settings) VALUES (${concurrentSiteId},'Concurrent deletion fixture',${'deletion-'+concurrentSiteId},${sql.json({webhooks:{enabled:true,endpoints:[{id:'fixture',name:'Owned',url,eventKinds:['site-deleted']}]}})})`;
 let readers=0,release;const gate=new Promise(resolve=>{release=resolve;});const concurrentRepository={...repository,sites:{...repository.sites,getById:async id=>{const current=await repository.sites.getById(id);if(current&&id===concurrentSiteId){readers++;if(readers===2)release();await gate;}return current;}}};
 const concurrentRoute=siteDeletionRoute({repository:concurrentRepository,audit:input=>repository.auditLogs.record(input),interaction:()=>{throw Error('Wrong journal path');}});
 const outcomes=await Promise.all([callSiteDeletion(concurrentRoute,concurrentSiteId),callSiteDeletion(concurrentRoute,concurrentSiteId)]);assert.deepEqual(outcomes.map(outcome=>outcome.status).sort(),[200,404]);assert.equal(calls,2);assert.equal((await sql`SELECT count(*)::int AS n FROM activity_logs WHERE entity_id=${concurrentSiteId} AND action='site.deleted'`)[0].n,1);checks+=3;
 console.log(`Site deletion actual PostgreSQL/handler PASS ${checks}; late-trigger rollback, post-delete FK-safe audit/journal, confirmed return and no replay. Auth/storage admission isolated fixtures; no provider.`);return checks;
 }finally{await new Promise(resolve=>server.close(resolve));}
}

if(process.argv[1]===fileURLToPath(import.meta.url))await main();
