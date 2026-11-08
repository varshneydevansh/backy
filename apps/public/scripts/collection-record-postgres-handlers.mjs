// Invoked only inside the disposable PostgreSQL runner.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './collection-import-postgres-handlers.mjs';
const { NextRequest, NextResponse } = createRequire(import.meta.url)('next/server');
export async function verifyCollectionRecordHandlers({ repositories, competing, site, sql }) {
 const actual = repositories.collections;
 const { item: collection } = await actual.create({ siteId:site.id,name:'Save conflicts',slug:'save-conflicts',fields:[{id:'title',key:'title',label:'Title',type:'text'}] });
 const extension={elements:[{id:'root',responsive:{mobile:{width:320}}}],nested:[false,0,null]};
 const { item: record }=await actual.createRecord({siteId:site.id,collectionId:collection.id,slug:'editable',values:{title:'Original',extension}});
 let deny=0, interleave=false, checks=0, writes=0;
 const mocks={
  'next/server':{NextResponse},'@/lib/adminAccess':{requireAdminAccess:async(_r,_id,options)=>{assert.equal(options.permission,'collections.edit');return deny?NextResponse.json({success:false},{status:deny}):{session:{user:{id:'synthetic-owner'}}};}},
  '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>({...repositories,collections:{...actual,withRecordWriteLock:async(sid,cid,run)=>actual.withRecordWriteLock(sid,cid,async(writer,collection,context)=>run({...writer,updateRecord:async(sid,cid,id,input)=>{
   if(interleave){interleave=false; const current=await competing.collections.getRecordById(sid,cid,id);await sql.begin(async tx=>{await tx`SET LOCAL session_replication_role='replica'`;await tx`UPDATE content_collection_records SET values=${tx.json({...current.values,author:{winner:true}})} WHERE id=${id}`;});}
   writes++;return writer.updateRecord(sid,cid,id,input);
  }},collection,context))}})},
  '@/lib/frontendDesignContract':{normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope:body=>body},
  '@/lib/backyStore':{normalizeCollectionRecordValues:(_collection,values,previous)=>({...previous,...values}),validateCollectionRecordValues:()=>[]},
  '@/lib/adminCommerceCollectionAccess':{requireCommerceCollectionAccess:async()=>null},
  '@/lib/adminAudit':{recordAdminAudit:async()=>({})},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({})},
  '@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>({})},'@/lib/repositoryMediaReferenceSync':{syncRepositoryCollectionRecordMediaReferences:async()=>({})},
  '@/lib/orderInventoryRestore':{applyRepositoryOrderInventoryRestore:async({after})=>after},
 };
 const route=load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts',mocks);
 async function call(body,target=site.slug,id=record.id){const response=await route.PATCH(new NextRequest(`http://fixture.invalid/api/admin/sites/${target}/collections/${collection.id}/records/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({siteId:target,collectionId:collection.id,recordId:id})});return{status:response.status,body:await response.json()};}
 const fresh=await call({expectedUpdatedAt:record.updatedAt,values:{title:'Fresh'}});assert.equal(fresh.status,200,JSON.stringify(fresh.body.error));assert.equal(fresh.body.data.record.siteId,site.id);assert.deepEqual(fresh.body.data.record.values.extension,extension);checks+=3;
 const before=writes;const stale=await call({expectedUpdatedAt:record.updatedAt,values:{title:'Stale'}});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'COLLECTION_RECORD_CONFLICT');assert.equal(stale.body.error.details.reloadRequired,true);assert.equal(writes,before);checks+=4;
 const versionHelper=load('../src/lib/collectionRecordVersion.ts',{});
 assert.match(fresh.body.data.record.version,/^record-v1:[a-f0-9]{64}$/);checks++;
 // A long-open client read occurs BEFORE a competing status+content edit that keeps wall time unchanged.
 const opened=await actual.getRecordById(site.id,collection.id,record.id),openedVersion=fresh.body.data.record.version;
 await sql.begin(async tx=>{await tx`SET LOCAL session_replication_role='replica'`;await tx`UPDATE content_collection_records SET status='archived', values=${tx.json({...opened.values,longOpen:{authorWinner:true}})} WHERE id=${record.id}`;});
 const longOpenWinner=await actual.getRecordById(site.id,collection.id,record.id);assert.equal(longOpenWinner.updatedAt,opened.updatedAt);checks++;
 const longOpen=await call({expectedUpdatedAt:opened.updatedAt,expectedVersion:openedVersion,values:{title:'Long-open loser'}});
 assert.equal(longOpen.status,409);assert.equal(longOpen.body.error.code,'COLLECTION_RECORD_CONFLICT');assert.equal((await actual.getRecordById(site.id,collection.id,record.id)).status,'archived');checks+=3;
 await assert.rejects(actual.updateRecord(site.id,collection.id,record.id,{expectedVersion:openedVersion,values:{title:'Direct stale writer'}}),error=>error.code==='COLLECTION_RECORD_CONFLICT');checks++;
 const refreshed=versionHelper.collectionRecordVersion(longOpenWinner);
 assert.equal(refreshed,versionHelper.collectionRecordVersion({...longOpenWinner,values:Object.fromEntries(Object.entries(longOpenWinner.values).reverse())}));checks++;
 const versionRetry=await call({expectedVersion:refreshed,values:{title:'Fresh'}});assert.equal(versionRetry.status,200);checks++;
 const current=await actual.getRecordById(site.id,collection.id,record.id);interleave=true;const raced=await call({expectedUpdatedAt:current.updatedAt,values:{title:'Overwriter'}});assert.equal(raced.status,409);assert.equal(raced.body.error.code,'COLLECTION_RECORD_CONFLICT');checks+=2;
 const winner=await actual.getRecordById(site.id,collection.id,record.id);assert.equal(winner.updatedAt,current.updatedAt);assert.deepEqual(winner.values.author,{winner:true});assert.equal(winner.values.title,'Fresh');assert.deepEqual(winner.values.extension,extension);checks+=4;
 const retry=await call({expectedUpdatedAt:winner.updatedAt,values:{title:'Reviewed retry'}});assert.equal(retry.status,200);assert.deepEqual(retry.body.data.record.values.author,{winner:true});checks+=2;
 const baseline=await actual.getRecordById(site.id,collection.id,record.id);
 const pair=await Promise.all([call({expectedUpdatedAt:baseline.updatedAt,expectedVersion:versionHelper.collectionRecordVersion(baseline),values:{title:'A'}}),call({expectedUpdatedAt:baseline.updatedAt,expectedVersion:versionHelper.collectionRecordVersion(baseline),values:{title:'B'}})]);
 assert.deepEqual(pair.map(result=>result.status).sort(),[200,409]);checks++;
 for(const status of [401,403]){deny=status;const before=writes;assert.equal((await call({values:{title:'Denied'}})).status,status);assert.equal(writes,before);checks+=2;}deny=0;
 assert.equal((await call({values:{title:'Foreign'}},'unknown-site')).status,404);checks++;
 const after=await actual.getRecordById(site.id,collection.id,record.id);
 await assert.rejects(actual.updateRecord(site.id,collection.id,record.id,{expectedRecord:{...after,id:'foreign'},values:{title:'Bad identity'}}),error=>error.code==='COLLECTION_RECORD_CONFLICT');checks++;
 const reordered={...after,values:Object.fromEntries(Object.entries(after.values).reverse())};
 const accepted=await actual.updateRecord(site.id,collection.id,record.id,{expectedRecord:reordered,values:after.values});assert.deepEqual(accepted.item.values,after.values);checks++;
 console.log(`Collection record actual PostgreSQL HTTP/repository passed ${checks} checks: winner/409, semantic same-timestamp protection, full unknown JSON, exact identity, concurrent stale writes, refreshed retry and denied sessions. Scalar/session/side-effect boundaries are fixtures.`);
}

export async function verifyCollectionUniqueAdmission({ repositories, competing, site, sql }) {
 const actual=repositories.collections;
 const {item:collection}=await actual.create({siteId:site.id,name:'Unique admission',slug:'unique-admission',fields:[{id:'title',key:'title',label:'Title',type:'text',unique:true}]});
 const expectedRace=process.env.BACKY_COLLECTION_EXPECT_UNIQUE_RACE==='1';
 let arrivals=0,release;const barrier=new Promise(resolve=>{release=resolve});
 let requests=0;const writerIdentities=new Set();
 const mocks={
  'next/server':{NextResponse},'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-owner'}}})},
  '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>{const identity=requests++%2;const source=identity?competing:repositories;writerIdentities.add(identity);return {...source,collections:{...source.collections,createRecord:async input=>{if(expectedRace){arrivals++;if(arrivals===2)release();await barrier;}return source.collections.createRecord(input);}}};}},
  '@/lib/frontendDesignContract':{seedCollectionRecordInputFromFrontendDesignTemplate:({body})=>({ok:true,body}),normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope:body=>body},
  '@/lib/backyStore':{normalizeCollectionRecordValues:(_collection,values,previous)=>({...previous,...values}),validateCollectionRecordValues:()=>[]},
  '@/lib/adminCommerceCollectionAccess':{requireCommerceCollectionAccess:async()=>null},
  '@/lib/adminAudit':{recordAdminAudit:async()=>({})},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({})},
  '@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>({})},'@/lib/repositoryMediaReferenceSync':{syncRepositoryCollectionRecordMediaReferences:async()=>({})},
 };
 const route=load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts',mocks);
 const call=async slug=>{const response=await route.POST(new NextRequest('http://fixture.invalid/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug,values:{title:'Concurrent same value',extension:{exact:slug}}})}),{params:Promise.resolve({siteId:site.slug,collectionId:collection.id})});return{status:response.status,body:await response.json()};};
 const pair=await Promise.all([call('first'),call('second')]);
 const stored=await actual.listRecords({siteId:site.id,collectionId:collection.id,includeUnpublished:true,limit:100});
 if(expectedRace){assert.deepEqual(pair.map(result=>result.status),[201,201]);assert.equal(stored.pagination.total,2);console.log('CONFIRMED actual PostgreSQL normal POST uniqueness race: two concurrent identical unique values both stored.');}
 else{
  assert.deepEqual(pair.map(result=>result.status).sort(),[201,400]);assert.equal(stored.pagination.total,1);assert(pair.find(result=>result.status===400).body.error.details.some(issue=>issue.code==='unique'));
  assert.equal(writerIdentities.size,2,'Concurrent HTTP requests must use independent PostgreSQL connections');
  const winning=stored.items[0];assert.deepEqual(winning.values.extension,{exact:winning.slug});
  await sql`INSERT INTO content_collection_records(site_id,collection_id,slug,status,values) SELECT ${site.id}::uuid,${collection.id}::uuid,'large-'||n,'draft',jsonb_build_object('title','Unique '||n,'extension',jsonb_build_object('retained',n)) FROM generate_series(0,1204) n`;
  await assert.rejects(actual.createRecord({siteId:site.id,collectionId:collection.id,slug:'far-collision',values:{title:' unique 1204 '}}),error=>error.code==='COLLECTION_RECORD_VALIDATION'&&error.details[0].code==='unique');
  await assert.rejects(actual.updateRecord(site.id,collection.id,winning.id,{values:{...winning.values,title:'UNIQUE 1204'}}),error=>error.code==='COLLECTION_RECORD_VALIDATION');
  assert.equal((await actual.listRecords({siteId:site.id,collectionId:collection.id,includeUnpublished:true,limit:100})).pagination.total,1206);
  assert.deepEqual((await actual.getRecordById(site.id,collection.id,winning.id)).values,winning.values);
  const left=(await actual.createRecord({siteId:site.id,collectionId:collection.id,slug:'swap-left',values:{title:'Swap A',extension:{kept:'a'}}})).item;
  const right=(await actual.createRecord({siteId:site.id,collectionId:collection.id,slug:'swap-right',values:{title:'Swap B',extension:{kept:'b'}}})).item;
  const schema=await actual.getById(site.id,collection.id),all=[];
  for(let offset=0;;offset+=100){const page=await actual.listRecords({siteId:site.id,collectionId:collection.id,includeUnpublished:true,limit:100,offset});all.push(...page.items);if(!page.pagination.hasMore)break;}
  assert.equal(all.length,1208);assert.equal(new Set(all.map(record=>record.id)).size,1208);
  const operation={input:{name:schema.name,slug:schema.slug,fields:schema.fields},expectedCollection:schema,expectedRecords:all,records:[{input:{slug:left.slug,values:{...left.values,title:'Swap B'}},expectedRecord:left},{input:{slug:right.slug,values:{...right.values,title:'Swap A'}},expectedRecord:right}]};
  await actual.applyImport(site.id,[operation]);assert.equal((await actual.getRecordById(site.id,collection.id,left.id)).values.title,'Swap B');assert.equal((await actual.getRecordById(site.id,collection.id,right.id)).values.title,'Swap A');
  const freshSchema=await actual.getById(site.id,collection.id),freshRows=[];
  for(let offset=0;;offset+=100){const page=await actual.listRecords({siteId:site.id,collectionId:collection.id,includeUnpublished:true,limit:100,offset});freshRows.push(...page.items);if(!page.pagination.hasMore)break;}
  const currentLeft=await actual.getRecordById(site.id,collection.id,left.id);
  await assert.rejects(actual.applyImport(site.id,[{...operation,expectedCollection:freshSchema,expectedRecords:freshRows,records:[{input:{slug:left.slug,values:{title:'Swap A'}},expectedRecord:currentLeft}]}]),error=>error.code==='COLLECTION_RECORD_VALIDATION');
  assert.deepEqual((await actual.getRecordById(site.id,collection.id,left.id)).values,currentLeft.values);
  console.log('Collection unique admission actual PostgreSQL handlers/repository PASS: simultaneous winner+400, uncapped1206 inventory, far collision/no overwrite, complete final import unique swap and invalid batch rollback.');
 }
}
