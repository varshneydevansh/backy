import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { File } from 'node:buffer';
import { createLocalAdapter } from '@backy/storage';
import { loadMediaFixture, installActualMediaRecovery } from './media-storage-recovery-fixture.mts';
import * as inventoryImport from '../src/lib/mediaInventory';
import * as deletionImport from '../src/lib/mediaDeletionSafety';
import * as paginationImport from '../src/lib/collectionExportPagination';

/** Actual handlers + actual independent PostgreSQL repositories. Synthetic operator/scanner only. */
export async function runMediaStorageMetadataRaceProof(a: any, b: any, site: any) {
 const scratch=mkdtempSync('/tmp/backy-media-metadata-race-'),require=createRequire(import.meta.url),sharp=require('sharp');
 const png=await sharp({create:{width:64,height:32,channels:4,background:'#0e7777'}}).png().toBuffer();
 const adapter=createLocalAdapter({provider:'local',basePath:scratch+'/uploads',publicUrl:'/uploads'});
 const original=`sites/${site.id}/images/race.png`;await adapter.upload(png,{path:original});
 const asset=(await a.media.create({siteId:site.id,filename:'race.png',originalName:'race.png',mimeType:'image/png',type:'image',size:png.length,url:'/uploads/'+original,metadata:{storagePath:original,storageProvider:'local',authoredExtension:{preserve:true}}})).item;
 const scope=loadMediaFixture('../src/lib/mediaScope.ts',{}),responsive=loadMediaFixture('../src/lib/mediaResponsive.ts',{}),policy=loadMediaFixture('../src/lib/mediaUploadPolicy.ts',{}),organization=loadMediaFixture('../src/lib/publicMediaResource.ts',{'@/lib/mediaScope':scope,'@/lib/mediaResponsive':responsive});
 const inventory:any=(inventoryImport as any).default||inventoryImport,deletion:any=(deletionImport as any).default||deletionImport,pagination:any=(paginationImport as any).default||paginationImport;
 const baseMocks:any={'@/lib/backyStore':{},'@/lib/mediaStorage':{getMediaStorageAdapter:async()=>adapter},'@/lib/mediaStorageMutation':loadMediaFixture('../src/lib/mediaStorageMutation.ts',{}),'@/lib/mediaInventory':inventory,'@/lib/mediaDeletionSafety':deletion,'@/lib/collectionExportPagination':pagination,'@/lib/mediaUploadPolicy':policy,'@/lib/mediaScope':scope,'@/lib/mediaResponsive':responsive,'@/lib/publicMediaResource':organization,'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-operator'}}})},'@/lib/adminAudit':{recordAdminAudit:async()=>({})},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({})},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>[]},'@/lib/mediaSafety':{...loadMediaFixture('../src/lib/mediaSafety.ts',{}),scanMediaUploadWithProviders:async({buffer}:any)=>{await sharp(buffer).metadata();return{status:'clean',provider:'synthetic-byte-scanner'};}}};
 let held=false,release!:()=>void,entered!:()=>void,hold:Promise<void>,entry:Promise<void>;
 const mediaFacade:any={...a.media,getById:async(...args:any[])=>{const current=await a.media.getById(...args);if(held){held=false;entered();await hold;}return current;},update:async(...args:any[])=>{held=true;return a.media.update.call(mediaFacade,...args);}};
 const facade={...a,media:mediaFacade};
 const forRepository=(repository:any)=>{const mocks={...baseMocks,'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repository}};installActualMediaRecovery(mocks,repository,scratch);mocks['@/lib/mediaTransformGeneration']=loadMediaFixture('../src/lib/mediaTransformGeneration.ts',mocks);return mocks;};
 let storageHeld=false,storageEntered!:()=>void,storageRelease!:()=>void,storageHold:Promise<void>;
 const storageFacade={...b,media:{...b.media,update:async(...args:any[])=>{if(storageHeld){storageHeld=false;storageEntered();await storageHold;}return b.media.update(...args);}}};
 const mocksA=forRepository(facade),mocksB=forRepository(storageFacade),mocksC=forRepository(a);
 const detailC=loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts',mocksC);
 const detailA=loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts',mocksA),detailB=loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts',mocksB),transforms=loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/transforms/route.ts',mocksB),bind=loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/bind/route.ts',mocksA),version=loadMediaFixture('../src/app/api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId]/route.ts',mocksB);
 const url=`http://fixture.invalid/api/admin/sites/${site.id}/media/${asset.id}`,params={params:Promise.resolve({siteId:site.id,mediaId:asset.id})};
 const json=(path:string,method:string,body:any)=>new NextRequest(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const pause=()=>{hold=new Promise(resolve=>release=resolve);entry=new Promise(resolve=>entered=resolve);};
 const awaitPaused=async(response:Promise<Response>)=>{await Promise.race([entry,response.then(async value=>{throw new Error('Handler returned before guarded repository read: '+value.status+' '+await value.text());})]);};
 const prepare=async()=>{const response=await transforms.POST(json(url+'/transforms','POST',{widths:[16]}),params);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.storageRecovery.status,'settled');return body.data.media;};
 let checks=0;
 try{
  await prepare();
  pause();const ordinary=detailA.PATCH(json(url,'PATCH',{metadata:{authoredNote:'after-transform'}}),params);await awaitPaused(ordinary);
  const transformed=await prepare();const path=transformed.metadata.generatedTransforms.variants[0].storagePath;release();assert.equal((await ordinary).status,200);const after=await a.media.getById(site.id,asset.id);assert.equal(after.metadata.generatedTransforms.variants[0].storagePath,path);assert.equal(after.metadata.authoredNote,'after-transform');assert.ok(await adapter.stat(path));checks++;
  const page=(await a.pages.create({siteId:site.id,title:'Disposable binding page',slug:'media-race-target',status:'draft',content:{elements:[]}})).item;
  pause();const binding=bind.POST(json(url+'/bind','POST',{targetType:'page',targetId:page.id}),params);await awaitPaused(binding);
  const transformedAgain=await prepare();release();assert.equal((await binding).status,200);const afterBinding=await a.media.getById(site.id,asset.id);assert.equal(afterBinding.metadata.generatedTransforms.variants[0].storagePath,transformedAgain.metadata.generatedTransforms.variants[0].storagePath);assert.ok(afterBinding.pageIds.includes(page.id));checks++;
  pause();const propertyEdit=detailA.PATCH(json(url,'PATCH',{metadata:{propertyExtension:'keep-new-history'}}),params);await awaitPaused(propertyEdit);
  const replacement=new FormData();replacement.set('file',new File([png],'replacement.png',{type:'image/png'}));const replaced=await detailB.POST(new NextRequest(url,{method:'POST',body:replacement}),params);const replacedBody=await replaced.json();assert.equal(replaced.status,200,JSON.stringify(replacedBody));assert.equal(replacedBody.data.media.metadata.generatedTransforms,null);release();assert.equal((await propertyEdit).status,200);const afterReplacement=await a.media.getById(site.id,asset.id);assert.equal(afterReplacement.metadata.storagePath,replacedBody.data.media.metadata.storagePath);assert.equal(afterReplacement.metadata.replacementVersions[0].storagePath,original);assert.equal(afterReplacement.metadata.generatedTransforms,null);assert.equal(afterReplacement.metadata.propertyExtension,'keep-new-history');assert.deepEqual(afterReplacement.metadata.authoredExtension,{preserve:true});assert.ok(await adapter.stat(original));checks++;
  const retained=(await b.media.listVersions({siteId:site.id,mediaId:asset.id,limit:100,offset:0})).items[0];const restored=await version.POST(json(url+'/versions/'+retained.id,'POST',{reason:'Actual PG restore'}),{params:Promise.resolve({siteId:site.id,mediaId:asset.id,versionId:retained.id})});const restoredBody=await restored.json();assert.equal(restored.status,200,JSON.stringify(restoredBody));assert.equal((await a.media.getById(site.id,asset.id)).metadata.generatedTransforms,null);assert.equal((await a.media.getById(site.id,asset.id)).metadata.storagePath,original);assert.equal(restoredBody.data.storageRecovery.status,'settled');checks++;
  const storageEntry=new Promise<void>(resolve=>storageEntered=resolve);storageHold=new Promise<void>(resolve=>storageRelease=resolve);storageHeld=true;const changing=prepare();await Promise.race([storageEntry,changing.then(()=>{throw Error('Transform returned without reaching storage update');})]);
  const edited=await detailC.PATCH(json(url,'PATCH',{metadata:{authoredExtension:{preserve:'concurrent-property-edit'}}}),params);assert.equal(edited.status,200);storageRelease();await changing;assert.deepEqual((await a.media.getById(site.id,asset.id)).metadata.authoredExtension,{preserve:'concurrent-property-edit'});checks++;
  await a.media.delete(site.id,asset.id);await a.pages.delete(site.id,page.id);await a.media.storageJobs.deleteSettled(site.id);
  return checks;
 }finally{release?.();storageRelease?.();rmSync(scratch,{recursive:true,force:true});}
}
