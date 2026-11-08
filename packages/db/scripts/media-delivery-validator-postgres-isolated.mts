/** Real media repository, updated_at trigger, analytics and file route in an owned socket-only cluster. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { NextRequest } from 'next/server';
import { withVisitorProfilePostgres } from './visitor-profile-postgres-isolated.mts';
import { createMediaRepository } from '../src/repositories/media.ts';
import { createSiteRepository } from '../src/repositories/site-page-post.ts';
import { loadMediaFixture } from '../../../apps/public/scripts/media-storage-recovery-fixture.mts';
if(process.argv.length>2)throw Error('External database targets are not accepted.');
await withVisitorProfilePostgres(async({client,sites})=>{
 const [connection]=await client`SELECT current_setting('unix_socket_directories') host,current_setting('port') port,current_user username`;
 const pool=new Pool({host:connection.host,port:Number(connection.port),user:connection.username,database:'postgres',max:4});
 try{
  const repository=createMediaRepository(drizzle(pool) as any,'postgres'),site=sites[0],bytes=Buffer.alloc(6*1024*1024,37),fingerprint=(value:Buffer)=>createHash('sha256').update(value).digest('hex');let currentBytes=bytes,storageReads=0,checks=0;
  const created=await repository.create({siteId:site.id,filename:'owned-validator.bin',originalName:'owned-validator.bin',mimeType:'application/octet-stream',size:bytes.length,type:'other',url:'https://bytes.fixture.invalid/owned-validator',visibility:'public',metadata:{storagePath:`sites/${site.id}/owned-validator.bin`,storageProvider:'local',binaryFingerprint:{value:fingerprint(bytes)}}});
  const mediaId=created.item.id,cache=loadMediaFixture('../src/lib/mediaDeliveryCache.ts',{}),signing=loadMediaFixture('../src/lib/mediaSigning.ts',{}, {env:{NODE_ENV:'production',BACKY_MEDIA_SIGNING_SECRET:'owned-validator-fixture'}});
  const nativeSites=createSiteRepository(drizzle(pool) as any,'postgres');
  const mocks:any={
   '@/lib/repositorySitePublication':loadMediaFixture('../src/lib/repositorySitePublication.ts',{}),
   '@/lib/backyStore':{getSiteByIdOrSlug:()=>null,getMediaById:()=>null,updateMediaItem:()=>{throw Error('Demo mutation is forbidden in native proof');}},
   '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>({sites:{getPublicationByIdOrSlug:(id:string)=>nativeSites.getPublicationByIdOrSlug!(id),getById:()=>{throw Error('Full site read forbidden in native media delivery proof');},getBySlug:()=>{throw Error('Full site read forbidden in native media delivery proof');}},media:repository})},
   '@/lib/mediaDeliveryCache':cache,'@/lib/mediaByteDelivery':loadMediaFixture('../src/lib/mediaByteDelivery.ts',{},process,{ReadableStream}),
   '@/lib/mediaSafety':loadMediaFixture('../src/lib/mediaSafety.ts',{}),'@/lib/mediaSigning':signing,
   '@/lib/mediaStorage':{...loadMediaFixture('../src/lib/mediaStorage.ts',{}),getMediaStorageAdapter:async()=>({stat:async(path:string)=>({path,size:currentBytes.length,lastModified:new Date()}),read:async()=>{storageReads++;return currentBytes;}})},
   '@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{}),
  };
  mocks['@/lib/mediaDeliveryAnalytics']=loadMediaFixture('../src/lib/mediaDeliveryAnalytics.ts',mocks);
  const file=loadMediaFixture('../src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts',mocks);
  const request=(headers:Record<string,string>={},query='')=>file.GET(new NextRequest(`https://fixture.invalid/api/sites/${site.id}/media/${mediaId}/file${query?'?'+query:''}`,{headers}),{params:Promise.resolve({siteId:site.id,mediaId})});
  const before=await repository.getById(site.id,mediaId),initial=await request();assert.equal(initial.status,200);assert.deepEqual(Buffer.from(await initial.arrayBuffer()),bytes);checks++;
  const initialEtag=initial.headers.get('etag')!,after=await repository.getById(site.id,mediaId);assert.notEqual(after!.updatedAt,before!.updatedAt);assert.equal((after!.metadata.mediaDelivery as any).fileRequests,1);assert.equal((after!.metadata.mediaDelivery as any).bytesServed,bytes.length);checks++;
  const beforeHeadReads=storageReads,beforeHeadCounters=(await repository.getById(site.id,mediaId))!.metadata.mediaDelivery;
  const head=await file.HEAD(new NextRequest(`http://fixture.invalid/api/sites/${site.id}/media/${mediaId}/file`,{method:'HEAD'}),{params:Promise.resolve({siteId:site.id,mediaId})});assert.equal(head.status,200);assert.equal(head.body,null);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal(storageReads,beforeHeadReads);assert.deepEqual((await repository.getById(site.id,mediaId))!.metadata.mediaDelivery,beforeHeadCounters);checks++;
  const range=await request({range:'bytes=17-123','if-range':initialEtag}),afterRange=await repository.getById(site.id,mediaId);
  if(process.env.BACKY_MEDIA_ETAG_EXPECT_DRIFT==='1'){
   assert.equal(range.status,200);assert.notEqual(range.headers.get('etag'),initialEtag);await range.body!.cancel();const conditional=await request({'if-none-match':initialEtag});assert.equal(conditional.status,200);await conditional.body!.cancel();
   console.log(JSON.stringify({ok:true,reproduced:true,cause:'Actual recordMediaDelivery -> native media.update and updated_at trigger changes validator seed',rangeStatus:range.status,conditionalStatus:conditional.status,updatedAtBefore:before!.updatedAt,updatedAtAfter:after!.updatedAt,configuredTargetUsed:false}));return;
  }
  assert.equal(range.status,206);assert.equal(range.headers.get('etag'),initialEtag);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(17,124));assert.equal((afterRange!.metadata.mediaDelivery as any).fileRequests,2);assert.equal((afterRange!.metadata.mediaDelivery as any).bytesServed,bytes.length+107);checks++;
  for(let index=0;index<3;index++){const response=await request({range:'bytes=-13','if-range':initialEtag});assert.equal(response.status,206);assert.equal(response.headers.get('etag'),initialEtag);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(bytes.length-13));checks++;}
  const beforeConditional=storageReads,accounting=(await repository.getById(site.id,mediaId))!.metadata.mediaDelivery;
  for(let index=0;index<2;index++){const response=await request({'if-none-match':initialEtag});assert.equal(response.status,304);assert.equal(response.headers.get('etag'),initialEtag);assert.equal(storageReads,beforeConditional);checks++;}
  assert.deepEqual((await repository.getById(site.id,mediaId))!.metadata.mediaDelivery,accounting);checks++;
  // Replacement at identical size/path must invalidate using the persisted fingerprint.
  currentBytes=Buffer.alloc(bytes.length,91);await repository.update(site.id,mediaId,{metadata:{binaryFingerprint:{value:fingerprint(currentBytes)}}});
  const replacement=await request({range:'bytes=17-123','if-range':initialEtag});assert.equal(replacement.status,200);assert.notEqual(replacement.headers.get('etag'),initialEtag);assert.deepEqual(Buffer.from(await replacement.arrayBuffer()),currentBytes);checks++;
  const replacementEtag=replacement.headers.get('etag')!,freshRange=await request({range:'bytes=17-123','if-range':replacementEtag});assert.equal(freshRange.status,206);assert.equal(freshRange.headers.get('etag'),replacementEtag);assert.deepEqual(Buffer.from(await freshRange.arrayBuffer()),currentBytes.subarray(17,124));checks++;
  await repository.update(site.id,mediaId,{visibility:'private'});const beforePrivate=storageReads,privateDenied=await request({'if-none-match':'*',range:'bytes=0-7'});assert.equal(privateDenied.status,403);assert.equal(storageReads,beforePrivate);checks++;
  const signed=signing.createSignedMediaAccess({siteId:site.id,mediaId}),query=new URLSearchParams({token:signed.token,expiresAt:String(signed.expiresAt),disposition:signed.disposition}).toString();
  const privateAllowed=await request({'if-none-match':replacementEtag,range:'bytes=0-7'},query);assert.equal(privateAllowed.status,206);assert.notEqual(privateAllowed.headers.get('etag'),replacementEtag);await privateAllowed.body!.cancel();checks++;
  const privateEtag=privateAllowed.headers.get('etag')!;await repository.update(site.id,mediaId,{metadata:{mediaSecurity:{status:'quarantined'}}});const beforeQuarantine=storageReads,quarantined=await request({'if-none-match':privateEtag,range:'bytes=0-7','if-range':privateEtag},query);assert.equal(quarantined.status,423);assert.equal(storageReads,beforeQuarantine);checks++;
  assert.notEqual(cache.mediaDeliveryCacheMetadata(new Request('https://fixture.invalid'),site.id,(await repository.getById(site.id,mediaId))!,{delivery:'file',disposition:'inline'}).etag,privateEtag);checks++;
  // Preserve a conservative timestamp validator for older objects without a binary fingerprint.
  const legacy:any={...created.item,metadata:{storagePath:created.item.metadata.storagePath},updatedAt:'2026-01-01T00:00:00Z'};const legacyEtag=cache.mediaDeliveryCacheMetadata(new Request('https://fixture.invalid'),site.id,legacy).etag;legacy.updatedAt='2026-01-02T00:00:00Z';assert.notEqual(cache.mediaDeliveryCacheMetadata(new Request('https://fixture.invalid'),site.id,legacy).etag,legacyEtag);checks++;
  console.log(JSON.stringify({ok:true,checks,mode:'owned-socket-only-native-pg',sourceBytes:bytes.length,realAnalyticsMutation:true,configuredTargetUsed:false,boundary:'Actual file route, native media repository and updated_at trigger, actual analytics/signature/cache helpers; owned PostgreSQL and synthetic storage bytes only.'}));
 }finally{await pool.end();}
});
