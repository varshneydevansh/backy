/** Real handler/decorator and native SQL acceptance. Called only by the owned socket-only runner.
 * No configured database, provider bytes, remote network, grants, or synthetic runtime fallback.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './collection-import-postgres-handlers.mjs';
import { editorMediaRuntimeFixture } from './editor-media-runtime-fixture.mjs';
const require = createRequire(import.meta.url), core = require('@backy-cms/core');
const { NextRequest, NextResponse } = require('next/server');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const canvas = mediaId => ({elements:[{id:'image',type:'image',x:16,y:20,width:300,height:200,props:{assetId:mediaId,src:'/fixture.png'},unknown:{keep:[false,0,null]}}],canvasSize:{width:1200,height:800}});
const document = (kind,mediaId) => core.canvasContentPayloadToBackyContentDocument({id:'fixture-'+kind,kind,rawContent:mediaId?canvas(mediaId):{elements:[],canvasSize:{width:1200,height:800}}});
export async function verifyEditorMediaReferenceRacePostgres({repositories,competing,sql,site}) {
 let checks=0;const effects={provider:0,audit:0,cache:0,webhook:0};
 const own=(await repositories.sites.create({teamId:site.teamId,name:'Atomic media reference fixture',slug:'atomic-media-reference',status:'draft'})).item;
 const other=(await repositories.sites.create({teamId:site.teamId,name:'Independent site',slug:'atomic-media-independent',status:'draft'})).item;
 const media=async(name='asset')=>(await repositories.media.create({siteId:own.id,filename:name+'.png',originalName:name+'.png',mimeType:'image/png',type:'image',size:128,url:'/fixture.png',metadata:{scope:'global',pageIds:[],postIds:[],authored:{keep:[false,0]}}})).item;
 const wrapped=editorMediaRuntimeFixture(repositories);
 function routes(saveRepositories) {
  const store={},storage={getMediaStoragePathFromMedia:()=>null,getMediaStorageAdapter:async()=>{effects.provider++;throw Error('No provider allowed');}};
  const mocks={'next/server':{NextRequest,NextResponse},'@/lib/backyStore':store,'./backyStore':store,
   '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>saveRepositories},
   '@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-owner'}}})},
   '@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;return{};}},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{effects.cache++;return{};}},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>{effects.webhook++;return[];}},
   '@/lib/routeConflicts':{findPageRouteConflict:()=>null},'@/lib/siteReadiness':{buildRepositoryPageReadiness:()=>({checks:[]})},
   '@/lib/mediaStorage':storage,'./mediaStorage':storage,'./demoSiteBackupPersistence':{pendingDemoSiteBackupBytes:()=>0}};
  return {page:load('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts',mocks),post:load('../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts',mocks),media:load('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts',mocks)};
 }
 const request=async(bundle,kind,id,method,body)=>{const family=kind==='page'?'pages':kind==='post'?'blog':'media';const response=await bundle[kind][method](new NextRequest(`http://fixture.invalid/api/admin/sites/${own.id}/${family}/${id}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId:own.id,pageId:id,postId:id,mediaId:id})});return{status:response.status,headers:response.headers,body:await response.json()};};
 const recordMocks={
  'next/server':{NextRequest,NextResponse},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>wrapped},
  '@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-owner'}}})},'@/lib/adminCommerceCollectionAccess':{requireCommerceCollectionAccess:async()=>null},
  // Only a JSON field is used here. Scalar/field normalization has a separate actual-store gate;
  // real handler/admission, native record constraints, media lookup and indexing run unchanged.
  '@/lib/backyStore':{validateCollectionRecordValueTypes:()=>[],validateCollectionRecordValues:()=>[],normalizeCollectionRecordValues:(_collection,values,previous)=>({...previous,...values})},
  '@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;}},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{effects.cache++;}},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>{effects.webhook++;return[];}},
  '@/lib/orderInventoryRestore':{applyRepositoryOrderInventoryRestore:async({after})=>after},
 };
 const recordCreate=load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts',recordMocks),recordDetail=load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts',recordMocks);
 const recordCall=async(collectionId,method,body,recordId='')=>{const route=method==='POST'?recordCreate:recordDetail;const response=await route[method](new NextRequest(`http://fixture.invalid/api/admin/sites/${own.id}/collections/${collectionId}/records/${recordId}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId:own.id,collectionId,recordId})});return{status:response.status,body:await response.json()};};
 const revisions=(kind,id)=>repositories.contentWorkflows.listRevisions({siteId:own.id,targetType:kind,targetId:id,limit:100,offset:0});
 const freshTarget=async(kind,slug)=>(await repositories[kind==='page'?'pages':'posts'].create({siteId:own.id,title:slug,slug,status:'draft',content:document(kind)})).item;
 for(const kind of ['page','post']) {
  const family=kind==='page'?'pages':'posts',target=await freshTarget(kind,'lock-'+kind),asset=await media('lock-'+kind),admitted=deferred(),resume=deferred();
  const pause={...repositories,withMediaReferenceMutation:(siteId,operation)=>repositories.withMediaReferenceMutation(siteId,tx=>operation({...tx,[family]:{...tx[family],update:async(...args)=>{admitted.resolve();await resume.promise;return tx[family].update(...args);}}}))};
  const saving=request(routes(editorMediaRuntimeFixture(pause)),kind,target.id,'PATCH',{content:canvas(asset.id)});await admitted.promise;
  try {
   const denied=await request(routes(editorMediaRuntimeFixture(competing)),'media',asset.id,'DELETE');assert.equal(denied.status,503,JSON.stringify(denied.body));assert.equal(denied.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');assert.equal(denied.headers.get('retry-after'),'1');checks+=3;
   const independent=await editorMediaRuntimeFixture(competing).pages.create({siteId:other.id,title:'Independent '+kind,slug:'independent-'+kind,status:'draft',content:document('page')});assert.equal(independent.item.siteId,other.id);checks++;
  } finally {resume.resolve();}
  const saved=await saving;assert.equal(saved.status,200,JSON.stringify(saved.body));const reopened=await repositories[family].getById(own.id,target.id),indexed=await repositories.media.getById(own.id,asset.id);
  assert.equal(reopened.content.elements[0].props.assetId,asset.id);assert.deepEqual(indexed[kind==='page'?'pageIds':'postIds'],[target.id]);assert.deepEqual(indexed.metadata.authored,{keep:[false,0]});assert.equal((await revisions(kind,target.id)).items.length,1);checks+=5;
  const used=await request(routes(editorMediaRuntimeFixture(competing)),'media',asset.id,'DELETE');assert.equal(used.status,409);assert.equal(used.body.error.code,'MEDIA_IN_USE');checks+=2;
  // Delete wins after HTTP pre-admission but before the transaction starts: no content/revision survives.
  const lost=await media('lost-'+kind),before=await repositories[family].getById(own.id,target.id),beforeRevision=await revisions(kind,target.id),beforeEffects=structuredClone(effects);let once=true;
  const late={...repositories,withMediaReferenceMutation:async(siteId,operation)=>{if(once){once=false;const result=await request(routes(editorMediaRuntimeFixture(competing)),'media',lost.id,'DELETE');assert.equal(result.status,200,JSON.stringify(result.body));checks++;}return repositories.withMediaReferenceMutation(siteId,operation);}};
  const rejected=await request(routes(editorMediaRuntimeFixture(late)),kind,target.id,'PATCH',{content:canvas(lost.id)});assert.equal(rejected.status,400,JSON.stringify(rejected.body));assert.equal(rejected.body.error.code,'INVALID_EDITOR_MEDIA_REFERENCE');assert.equal(rejected.body.error.details.mediaId,lost.id);assert.equal(rejected.body.error.details.path,'/content/elements/0/props/assetId');assert.deepEqual(await repositories[family].getById(own.id,target.id),before);assert.deepEqual(await revisions(kind,target.id),beforeRevision);assert.equal(effects.audit,beforeEffects.audit+1,'Only winning media deletion audit; no failed save audit');checks+=7;
 }
 // Independent page/post writers cannot erase each other's reference field or unknown metadata.
 const shared=await media('shared'),page=await freshTarget('page','shared-page'),post=await freshTarget('post','shared-post');
 const first=deferred(),release=deferred();const held={...repositories,withMediaReferenceMutation:(siteId,operation)=>repositories.withMediaReferenceMutation(siteId,async tx=>{first.resolve();await release.promise;return operation(tx);})};
 const one=editorMediaRuntimeFixture(held).pages.update(own.id,page.id,{content:document('page',shared.id)});await first.promise;
 await assert.rejects(()=>editorMediaRuntimeFixture(competing).posts.update(own.id,post.id,{content:document('post',shared.id)}),error=>error.code==='MEDIA_STORAGE_MUTATION_BUSY');checks++;
 release.resolve();await one;await editorMediaRuntimeFixture(competing).posts.update(own.id,post.id,{content:document('post',shared.id)});
 const both=await repositories.media.getById(own.id,shared.id);assert.deepEqual(both.pageIds,[page.id]);assert.deepEqual(both.postIds,[post.id]);assert.deepEqual(both.metadata.authored,{keep:[false,0]});checks+=3;
 // The index write fails late in SQL: rollback documents and nested baseline history, even no client timestamp.
 const triggerAsset=await media('rollback');
 await sql.unsafe(`CREATE FUNCTION fixture_media_index_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${triggerAsset.id}'::uuid THEN RAISE EXCEPTION 'fixture private SQL reference failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_media_index_failure BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_media_index_failure();`);
 try {
  for(const kind of ['page','post']) {
   const family=kind==='page'?'pages':'posts',target=await freshTarget(kind,'rollback-'+kind),before=await repositories[family].getById(own.id,target.id),history=await revisions(kind,target.id),index=await repositories.media.getById(own.id,triggerAsset.id),beforeEffects=structuredClone(effects);
   const refused=await request(routes(wrapped),kind,target.id,'PATCH',{content:canvas(triggerAsset.id)});assert.equal(refused.status,500,JSON.stringify(refused.body));assert(!JSON.stringify(refused.body).includes('fixture private'));assert.deepEqual(await repositories[family].getById(own.id,target.id),before);assert.deepEqual(await revisions(kind,target.id),history);assert.deepEqual(await repositories.media.getById(own.id,triggerAsset.id),index);assert.deepEqual(effects,beforeEffects);checks+=6;
   await assert.rejects(()=>wrapped[family].create({siteId:own.id,title:'Rollback create',slug:'rollback-create-'+kind,status:'draft',content:document(kind,triggerAsset.id)}));assert.equal(await repositories[family].getBySlug(own.id,'rollback-create-'+kind),null);checks+=2;
   const creation=load(`../src/app/api/admin/sites/[siteId]/${kind==='page'?'pages':'blog'}/route.ts`,{
    'next/server':{NextRequest,NextResponse},'@/lib/backyStore':{},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>wrapped},
    '@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-owner'}}})},'@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;}},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{effects.cache++;}},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>{effects.webhook++;return[];}},'@/lib/routeConflicts':{findPageRouteConflict:()=>null},
   });
   const httpCreated=await creation.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${own.id}/${kind==='page'?'pages':'blog'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'SQL rolled back HTTP create',slug:'http-rollback-'+kind,content:canvas(triggerAsset.id),useDefaultFrontendDesignTemplate:false})}),{params:Promise.resolve({siteId:own.id})});
   assert.equal(httpCreated.status,500);assert.equal(await repositories[family].getBySlug(own.id,'http-rollback-'+kind),null);assert.deepEqual(effects,beforeEffects);checks+=3;
   // Seed old content without an index claim, then every lifecycle must fail atomically if indexing/removal fails.
   await repositories[family].update(own.id,target.id,{content:document(kind,triggerAsset.id)});
   const seeded=await repositories[family].getById(own.id,target.id);
   for(const action of ['publish','archive']){await assert.rejects(()=>wrapped[family][action](own.id,target.id));assert.deepEqual(await repositories[family].getById(own.id,target.id),seeded);checks+=2;}
   // Temporarily establish a claim without firing the reference-write trigger.
   await sql.unsafe('ALTER TABLE media DISABLE TRIGGER fixture_media_index_failure');
   await repositories.media.update(own.id,triggerAsset.id,{metadata:{[kind==='page'?'pageIds':'postIds']:[target.id]}});
   await sql.unsafe('ALTER TABLE media ENABLE TRIGGER fixture_media_index_failure');
   const claim=await repositories.media.getById(own.id,triggerAsset.id);
   await assert.rejects(()=>wrapped[family].delete(own.id,target.id));assert.deepEqual(await repositories[family].getById(own.id,target.id),seeded);assert.deepEqual(await repositories.media.getById(own.id,triggerAsset.id),claim);checks+=3;
  }
  const collection=(await repositories.collections.create({siteId:own.id,name:'Atomic record fixture',slug:'atomic-records',status:'draft',fields:[{id:'asset-field',key:'asset',label:'Asset',type:'json'}],permissions:{publicRead:false,publicCreate:false}})).item;
  const input={siteId:own.id,collectionId:collection.id,slug:'record',status:'draft',values:{asset:{mediaId:triggerAsset.id},unknown:{keep:[false,0]}}};
  for(const callback of [false,true]) {
   const invoke=operation=>callback?wrapped.collections.withRecordWriteLock(own.id,collection.id,writer=>operation(writer)):operation(wrapped.collections);
   await assert.rejects(()=>invoke(writer=>writer.createRecord({...input,slug:'new-'+callback})));assert.equal(await repositories.collections.getRecordBySlug(own.id,collection.id,'new-'+callback),null);checks+=2;
   const record=(await repositories.collections.createRecord({...input,slug:'existing-'+callback,values:{asset:null,unknown:{keep:[false,0]}}})).item;
   await assert.rejects(()=>invoke(writer=>writer.updateRecord(own.id,collection.id,record.id,{values:input.values})));assert.deepEqual(await repositories.collections.getRecordById(own.id,collection.id,record.id),record);checks+=2;
   if(!callback){
    const beforeEffects=structuredClone(effects),failedCreate=await recordCall(collection.id,'POST',{slug:'http-record-rollback',values:input.values});assert.equal(failedCreate.status,500,JSON.stringify(failedCreate.body));assert.equal(await repositories.collections.getRecordBySlug(own.id,collection.id,'http-record-rollback'),null);assert.deepEqual(effects,beforeEffects);checks+=3;
    const failedPatch=await recordCall(collection.id,'PATCH',{values:input.values},record.id);assert.equal(failedPatch.status,500,JSON.stringify(failedPatch.body));assert.deepEqual(await repositories.collections.getRecordById(own.id,collection.id,record.id),record);assert.deepEqual(effects,beforeEffects);checks+=3;
   }
   await sql.unsafe('ALTER TABLE media DISABLE TRIGGER fixture_media_index_failure');
   await wrapped.collections.updateRecord(own.id,collection.id,record.id,{values:input.values});
   await sql.unsafe('ALTER TABLE media ENABLE TRIGGER fixture_media_index_failure');
   const current=await repositories.collections.getRecordById(own.id,collection.id,record.id),indexed=await repositories.media.getById(own.id,triggerAsset.id);
   await assert.rejects(()=>invoke(writer=>writer.deleteRecord(own.id,collection.id,record.id)));assert.deepEqual(await repositories.collections.getRecordById(own.id,collection.id,record.id),current);assert.deepEqual(await repositories.media.getById(own.id,triggerAsset.id),indexed);checks+=3;
   if(!callback){const beforeEffects=structuredClone(effects),failedDelete=await recordCall(collection.id,'DELETE',undefined,record.id);assert.equal(failedDelete.status,500,JSON.stringify(failedDelete.body));assert.deepEqual(await repositories.collections.getRecordById(own.id,collection.id,record.id),current);assert.deepEqual(await repositories.media.getById(own.id,triggerAsset.id),indexed);assert.deepEqual(effects,beforeEffects);checks+=4;}
  }
 } finally {await sql.unsafe('DROP TRIGGER fixture_media_index_failure ON media; DROP FUNCTION fixture_media_index_failure();');}
 // The current HTTP record routes do not call an independent postcommit sync anymore.
 const httpCollection=(await repositories.collections.create({siteId:own.id,name:'HTTP indexed records',slug:'http-indexed-records',status:'draft',fields:[{id:'asset',key:'asset',label:'Asset',type:'json'}],permissions:{publicRead:false,publicCreate:false}})).item;
 const httpA=await media('http-record-a'),httpB=await media('http-record-b');
 const created=await recordCall(httpCollection.id,'POST',{slug:'http-indexed',values:{asset:{mediaId:httpA.id},unknown:{keep:[false,0,null]}}});assert.equal(created.status,201,JSON.stringify(created.body));const httpRecord=created.body.data.record;assert((await repositories.media.getById(own.id,httpA.id)).metadata.bindings.some(binding=>binding.scope==='collectionRecord'&&binding.targetId===httpRecord.id&&binding.collectionId===httpCollection.id));checks+=2;
 const reopened=await recordCall(httpCollection.id,'GET',undefined,httpRecord.id);assert.equal(reopened.status,200);assert.deepEqual(reopened.body.data.record.values.unknown,{keep:[false,0,null]});checks+=2;
 const changed=await recordCall(httpCollection.id,'PATCH',{expectedVersion:httpRecord.version,values:{asset:{mediaId:httpB.id}}},httpRecord.id);assert.equal(changed.status,200,JSON.stringify(changed.body));assert.deepEqual(changed.body.data.record.values.unknown,{keep:[false,0,null]});assert(!(await repositories.media.getById(own.id,httpA.id)).metadata.bindings.some(binding=>binding.scope==='collectionRecord'&&binding.targetId===httpRecord.id&&binding.collectionId===httpCollection.id));assert((await repositories.media.getById(own.id,httpB.id)).metadata.bindings.some(binding=>binding.scope==='collectionRecord'&&binding.targetId===httpRecord.id&&binding.collectionId===httpCollection.id));checks+=4;
 const removed=await recordCall(httpCollection.id,'DELETE',undefined,httpRecord.id);assert.equal(removed.status,200,JSON.stringify(removed.body));assert.equal(await repositories.collections.getRecordById(own.id,httpCollection.id,httpRecord.id),null);assert(!(await repositories.media.getById(own.id,httpB.id)).metadata.bindings.some(binding=>binding.scope==='collectionRecord'&&binding.targetId===httpRecord.id&&binding.collectionId===httpCollection.id));checks+=3;
 // Legacy broken documents may still be withdrawn and deleted; publishing must not make a new claim.
 for(const kind of ['page','post']) {
  const family=kind==='page'?'pages':'posts',missing='00000000-0000-4000-8000-000000000001';
  const legacy=(await repositories[family].create({siteId:own.id,title:'Legacy broken',slug:'legacy-broken-'+kind,status:'published',content:document(kind,missing)})).item;
  const httpWithdraw=await request(routes(wrapped),kind,legacy.id,'PATCH',{status:'draft'});assert.equal(httpWithdraw.status,200,JSON.stringify(httpWithdraw.body));assert.equal((await repositories[family].getById(own.id,legacy.id)).status,'draft');checks+=2;
  const httpArchive=await request(routes(wrapped),kind,legacy.id,'PATCH',{status:'archived'});assert.equal(httpArchive.status,200,JSON.stringify(httpArchive.body));assert.equal((await repositories[family].getById(own.id,legacy.id)).status,'archived');checks+=2;
  const withdrawn=(await wrapped[family].update(own.id,legacy.id,{status:'draft'})).item;assert.equal(withdrawn.status,'draft');
  await assert.rejects(()=>wrapped[family].publish(own.id,legacy.id),error=>error.code==='INVALID_EDITOR_MEDIA_REFERENCE');
  assert.equal((await wrapped[family].archive(own.id,legacy.id)).item.status,'archived');assert.equal(await wrapped[family].delete(own.id,legacy.id),true);checks+=4;
 }
 const firstEntered=deferred(),secondEntered=deferred(),poolRelease=deferred();
 const storageHeld=repositories.media.withStorageMutationLock(own.id,async()=>{firstEntered.resolve();await poolRelease.promise;});await firstEntered.promise;
 const documentHeld=repositories.withMediaReferenceMutation(other.id,async tx=>{assert.equal((await tx.sites.getById(other.id)).id,other.id);secondEntered.resolve();await poolRelease.promise;});await secondEntered.promise;
 try{await assert.rejects(()=>repositories.withMediaReferenceMutation(site.id,async()=>assert.fail('Pool bound exceeded')),error=>error.code==='MEDIA_STORAGE_MUTATION_BUSY');checks+=2;}finally{poolRelease.resolve();await Promise.all([storageHeld,documentHeld]);}
 assert.equal(await repositories.withMediaReferenceMutation(own.id,async()=>7),7);checks++;
 // Unsupported capability is never a read/write fallback. External URL-only content still has no managed claim.
 await assert.rejects(async()=>editorMediaRuntimeFixture({...repositories,withMediaReferenceMutation:undefined}).pages.create({siteId:own.id,title:'Unsupported',slug:'unsupported',content:document('page')}),error=>error.code==='MEDIA_STORAGE_LOCK_UNAVAILABLE');assert.equal(await repositories.pages.getBySlug(own.id,'unsupported'),null);checks+=2;
 const external=(await wrapped.pages.create({siteId:own.id,title:'External URL only',slug:'external-url-only',status:'draft',content:core.createBackyContentDocument({kind:'page',elements:[{id:'external',type:'image',props:{src:'https://example.invalid/image.png'}}]})})).item;assert.equal(external.content.elements[0].props.src,'https://example.invalid/image.png');checks++;
 assert.equal(effects.provider,0);checks++;
 console.log(`Atomic editor media native acceptance ${checks} checks: actual page/blog HTTP omitted-timestamp save/delete admission, both reference fields, SQL late-failure rollback including baseline revisions, create/publish/archive/delete and direct/callback record lifecycle. Independent adapters; explicit busy/no implicit retry; zero provider calls.`);
 return checks;
}
