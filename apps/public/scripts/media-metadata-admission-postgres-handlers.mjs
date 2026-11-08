/** Actual metadata PATCH/document/delete handlers in an owned socket-only PostgreSQL fixture. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './collection-import-postgres-handlers.mjs';
import {editorMediaRuntimeFixture} from './editor-media-runtime-fixture.mjs';
const require=createRequire(import.meta.url),core=require('@backy-cms/core'),{NextRequest,NextResponse}=require('next/server');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const canvas=id=>({elements:[{id:'existing-image',type:'image',props:{assetId:id,src:'/fixture-existing.png'},unknown:{keep:[false,0,null]}}],canvasSize:{width:1200,height:800}});
export async function verifyMediaMetadataAdmissionPostgres({repositories,competing,site,assertMediaBody}) {
 let checks=0;const effects={audit:0,cache:0,webhook:0,provider:0,repositoryAccess:0};
 const control={deny:0,faults:new Set(),webhookOutcome:[],verifyReleased:false};
 const own=(await repositories.sites.create({teamId:site.teamId,name:'Media metadata admission proof',slug:'media-metadata-proof',status:'draft'})).item;
 const targets={};for(const kind of ['page','post'])targets[kind]=(await repositories[kind==='page'?'pages':'posts'].create({siteId:own.id,title:kind,slug:kind,status:'draft',content:core.createBackyContentDocument({kind,elements:[]})})).item;
 const sourceOwner=(await repositories.posts.create({siteId:own.id,title:'Original post owner',slug:'source-owner',status:'draft',content:core.createBackyContentDocument({kind:'post',elements:[]})})).item;
 const asset=async slug=>(await repositories.media.create({siteId:own.id,filename:slug+'.png',originalName:slug+'.png',mimeType:'image/png',type:'image',size:128,url:'/fixture-existing.png',metadata:{scope:'post',scopeTargetId:sourceOwner.id,postIds:[sourceOwner.id],pageIds:[],authorExtension:{keep:[false,0,null]}}})).item;
 const makeRoutes=repo=>{
  const storage={getMediaStoragePathFromMedia:()=>null,getMediaStorageAdapter:async()=>{effects.provider++;throw Error('Provider access forbidden');}};
  const mocks={'next/server':{NextRequest,NextResponse},'@/lib/backyStore':{},'./backyStore':{},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>{effects.repositoryAccess++;return repo;}},
  '@/lib/adminAccess':{requireAdminAccess:async(_request,_id,options)=>{assert(['media.edit','media.delete','pages.edit','blog.edit'].includes(options.permission),'Unexpected actual permission '+options.permission);return control.deny?NextResponse.json({success:false,requestId:_id,error:{code:'FIXTURE_DENIED',message:'Fixture access denied'}},{status:control.deny}):{session:{user:{id:'synthetic-owner'}}};}},'@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;if(control.verifyReleased)await competing.media.withStorageMutationLock(own.id,async()=>{checks++;});if(control.faults.has('audit'))throw Error('Private journal error');return{};}},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{effects.cache++;if(control.faults.has('cache'))throw Error('Private cache error');return{};}},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>{effects.webhook++;if(control.faults.has('webhook'))throw Error('Private webhook error');return control.webhookOutcome;}},
  '@/lib/routeConflicts':{findPageRouteConflict:()=>null},'@/lib/siteReadiness':{buildRepositoryPageReadiness:()=>({checks:[]})},'@/lib/mediaStorage':storage,'./mediaStorage':storage,'./demoSiteBackupPersistence':{pendingDemoSiteBackupBytes:()=>0}};
  return{media:load('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts',mocks),page:load('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts',mocks),post:load('../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts',mocks)};
 };
 const call=async(routes,kind,id,method,body)=>{const family=kind==='page'?'pages':kind==='post'?'blog':'media',response=await routes[kind][method](new NextRequest(`http://fixture.invalid/api/admin/sites/${own.id}/${family}/${id}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId:own.id,pageId:id,postId:id,mediaId:id})});const result={status:response.status,headers:response.headers,body:await response.json()};if(kind==='media')assertMediaBody?.('/{mediaId}',method,result.status,result.body);return result;};
 // PATCH computes its scope delta from its old row; a document save commits while PATCH is paused at native update.
 for(const kind of ['page','post']){
  const current=await asset('race-'+kind),paused=deferred(),release=deferred();
  const patchRepositories={...repositories,media:{...repositories.media,update:async(...args)=>{paused.resolve();await release.promise;return repositories.media.update(...args);}}};
  const patch=call(makeRoutes(patchRepositories),'media',current.id,'PATCH',{caption:'Owner caption '+kind,metadata:{ownerNote:'Preserve new references'}});await paused.promise;
  const prior=await repositories[kind==='page'?'pages':'posts'].getById(own.id,targets[kind].id);
  let saved;try{saved=await call(makeRoutes(editorMediaRuntimeFixture(competing)),kind,targets[kind].id,'PATCH',{content:canvas(current.id)});}finally{release.resolve();}
  const patched=await patch;assert.equal(patched.status,200,JSON.stringify(patched.body));assert.equal(saved.status,503,JSON.stringify(saved.body));assert.equal(saved.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');assert.equal(saved.headers.get('retry-after'),'1');checks+=4;
  assert.deepEqual(await repositories[kind==='page'?'pages':'posts'].getById(own.id,targets[kind].id),prior);checks++;
  const retried=await call(makeRoutes(editorMediaRuntimeFixture(competing)),kind,targets[kind].id,'PATCH',{content:canvas(current.id)});assert.equal(retried.status,200,JSON.stringify(retried.body));checks++;
  const reread=await repositories.media.getById(own.id,current.id),key=kind==='page'?'pageIds':'postIds';
  assert(reread[key].includes(targets[kind].id));assert(reread.postIds.includes(sourceOwner.id));assert.equal(reread.scope,'post');assert.equal(reread.scopeTargetId,sourceOwner.id);assert.deepEqual(reread.metadata.authorExtension,{keep:[false,0,null]});assert.equal(reread.caption,'Owner caption '+kind);checks+=6;
  // A full stale metadata round trip still must derive untouched association fields from the fresh row.
  const roundtrip=await call(makeRoutes(repositories),'media',current.id,'PATCH',{metadata:{...current.metadata,ownerNote:'Fresh followup'}});assert.equal(roundtrip.status,200);const final=await repositories.media.getById(own.id,current.id);assert(final[key].includes(targets[kind].id));assert(final.postIds.includes(sourceOwner.id));checks+=3;
 }
 const unused=async name=>(await repositories.media.create({siteId:own.id,filename:name+'.txt',originalName:name+'.txt',mimeType:'text/plain',type:'document',size:32,url:'/fixture.txt',metadata:{scope:'global',pageIds:[],postIds:[],unknown:{keep:[false,0]}}})).item;
 // Actual DELETE and concurrent metadata edits respect the same lock.
 const deletionAsset=await unused('delete-contention'),paused=deferred(),release=deferred();
 const held={...repositories,media:{...repositories.media,update:async(...args)=>{paused.resolve();await release.promise;return repositories.media.update(...args);}}};
 const pending=call(makeRoutes(held),'media',deletionAsset.id,'PATCH',{caption:'Committed before deletion'});await paused.promise;
 try{
  const blocked=await call(makeRoutes(competing),'media',deletionAsset.id,'DELETE');assert.equal(blocked.status,503);assert.equal(blocked.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');assert.equal(blocked.headers.get('retry-after'),'1');checks+=3;
  const priorEffects=structuredClone(effects),blockedEdit=await call(makeRoutes(competing),'media',deletionAsset.id,'PATCH',{caption:'Unadmitted overwrite'});assert.equal(blockedEdit.status,503);assert.equal(blockedEdit.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');assert.equal(effects.audit,priorEffects.audit);assert.equal(effects.cache,priorEffects.cache);assert.equal(effects.webhook,priorEffects.webhook);checks+=5;
 }finally{release.resolve();}
 assert.equal((await pending).status,200);assert.equal((await repositories.media.getById(own.id,deletionAsset.id)).caption,'Committed before deletion');assert.equal((await call(makeRoutes(competing),'media',deletionAsset.id,'DELETE')).status,200);checks+=3;
 // Deletion before lock acquisition is re-read as missing, rather than attempting an update on the old snapshot.
 const deletedFirst=await unused('deleted-first');let once=true;
 const late={...repositories,media:{...repositories.media,withStorageMutationLock:async(siteId,operation)=>{if(once){once=false;assert.equal((await call(makeRoutes(competing),'media',deletedFirst.id,'DELETE')).status,200);checks++;}return repositories.media.withStorageMutationLock(siteId,operation);}}};
 const beforeDeletedEffects=structuredClone(effects),notFound=await call(makeRoutes(late),'media',deletedFirst.id,'PATCH',{caption:'Never saved'});assert.equal(notFound.status,404);assert.equal(notFound.body.error.code,'MEDIA_NOT_FOUND');assert.equal(effects.audit,beforeDeletedEffects.audit+1,'Only deletion followup may run');assert.equal(effects.cache,beforeDeletedEffects.cache+1);assert.equal(effects.webhook,beforeDeletedEffects.webhook+1);checks+=5;
 // Reserved binary/storage metadata validation must read the row inside the acquired lock.
 const changed=await unused('authority-fresh'),raw={...changed.metadata,storagePath:'sites/fixture/old'};await repositories.media.update(own.id,changed.id,{metadata:raw});let fresh=true;
 const authority={...repositories,media:{...repositories.media,withStorageMutationLock:async(siteId,operation)=>{if(fresh){fresh=false;await competing.media.withStorageMutationLock(siteId,()=>competing.media.update(siteId,changed.id,{metadata:{storagePath:'sites/fixture/current'}}));}return repositories.media.withStorageMutationLock(siteId,operation);}}};
 const priorAuthorityEffects=structuredClone(effects),staleAuthority=await call(makeRoutes(authority),'media',changed.id,'PATCH',{metadata:raw});assert.equal(staleAuthority.status,400);assert.equal(staleAuthority.body.error.code,'INVALID_MEDIA_METADATA');assert.equal((await repositories.media.getById(own.id,changed.id)).metadata.storagePath,'sites/fixture/current');assert.equal(effects.audit,priorAuthorityEffects.audit);checks+=4;
 // Permission denials happen before repository/lock access; foreign identity cannot be edited in the requested site.
 for(const status of [401,403]){control.deny=status;const before=structuredClone(effects),response=await call(makeRoutes(repositories),'media',changed.id,'PATCH',{caption:'Denied'});assert.equal(response.status,status);assert.deepEqual(effects,before);checks+=2;}control.deny=0;
 const foreignSite=(await repositories.sites.create({teamId:site.teamId,name:'Foreign metadata fixture',slug:'foreign-metadata-fixture',status:'draft'})).item;
 const foreign=(await repositories.media.create({siteId:foreignSite.id,filename:'foreign.txt',originalName:'foreign.txt',mimeType:'text/plain',type:'document',size:32,url:'/foreign.txt'})).item;
 const priorForeignEffects=structuredClone(effects),wrongSite=await call(makeRoutes(repositories),'media',foreign.id,'PATCH',{caption:'Wrong site'});assert.equal(wrongSite.status,404);assert.deepEqual(await repositories.media.getById(foreignSite.id,foreign.id),foreign);assert.equal(effects.audit,priorForeignEffects.audit);checks+=3;
 const unsupported=await call(makeRoutes({...repositories,media:{...repositories.media,withStorageMutationLock:undefined}}),'media',changed.id,'PATCH',{caption:'Unsupported'});assert.equal(unsupported.status,503);assert.equal(unsupported.body.error.code,'MEDIA_STORAGE_LOCK_UNAVAILABLE');assert.equal(unsupported.headers.get('cache-control'),'no-store');checks+=3;
 // Every postcommit task is independent; a refused notification result is not necessarily a thrown error.
 const followAsset=await unused('followups');
 for(const failure of ['audit','cache','webhook','organization','returned-webhook','all','clean']){
  control.faults=new Set(failure==='all'?['audit','cache','webhook']:['audit','cache','webhook'].includes(failure)?[failure]:[]);control.webhookOutcome=failure==='returned-webhook'?[{status:'failed',error:'Private provider detail'}]:failure==='clean'?[{status:'succeeded'}]:[];
  const failedOrganization=failure==='organization'||failure==='all';
  const followRepo={...repositories,media:{...repositories.media,listFolders:async siteId=>{if(failedOrganization)throw Error('Private folder read failure');return repositories.media.listFolders(siteId);}}};
  control.verifyReleased=failure==='clean';
  const previousEffects=structuredClone(effects),response=await call(makeRoutes(followRepo),'media',followAsset.id,'PATCH',{caption:'saved-'+failure});
  const expected=failure==='all'?['MEDIA_AUDIT_PENDING','MEDIA_CACHE_INVALIDATION_PENDING','MEDIA_WEBHOOK_DELIVERY_PENDING','MEDIA_ORGANIZATION_PENDING']:failure==='clean'?[]:[{audit:'MEDIA_AUDIT_PENDING',cache:'MEDIA_CACHE_INVALIDATION_PENDING',webhook:'MEDIA_WEBHOOK_DELIVERY_PENDING',organization:'MEDIA_ORGANIZATION_PENDING','returned-webhook':'MEDIA_WEBHOOK_DELIVERY_PENDING'}[failure]];
  assert.equal(response.status,200,JSON.stringify(response.body));assert.deepEqual(response.body.data.completionWarnings,expected);assert.equal((await repositories.media.getById(own.id,followAsset.id)).caption,'saved-'+failure);assert.equal(response.body.data.media.caption,'saved-'+failure);assert(response.body.data.media.organization);assert(!JSON.stringify(response.body).includes('Private'));assert.equal(effects.audit,previousEffects.audit+1);assert.equal(effects.cache,previousEffects.cache+1);assert.equal(effects.webhook,previousEffects.webhook+1);assert.deepEqual((await repositories.media.getById(own.id,followAsset.id)).metadata.unknown,{keep:[false,0]});checks+=10;
 }
 control.faults.clear();control.webhookOutcome=[];control.verifyReleased=false;
 // Followups execute after admission release, allowing another guarded operation instead of retaining the lock.
 await repositories.media.withStorageMutationLock(own.id,async()=>{checks++;});

 assert.equal(effects.provider,0);checks++;
 console.log(`Media metadata admission native ${checks} checks: actual PATCH/page/blog/DELETE interleavings, fresh authority validation, explicit busy retries, tenant denial, independent postcommit warnings; synthetic auth/followups, zero providers.`);
 return checks;
}
