import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const input={targetRevisionId:'revision/a'},options={adminSession:'synthetic',credentials:'include'};
const collectionCalls=[];let collectionStatus=200;
const collectionVersion='collection-v1:'+'e'.repeat(64),collectionReviewVersion='template-collection-instances-v1:'+'f'.repeat(64);
const collectionClient=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{
  collectionCalls.push({url:new URL(url),init});
  const pathname=new URL(url).pathname;
  const data=pathname.endsWith('/instances')
    ?{action:JSON.parse(init.body).action,reviewVersion:collectionReviewVersion,scanned:{pages:0,posts:0,collections:1},targets:[{type:'collection',id:'collection/a',state:'blocked',conflicts:[{path:'/fields/email/type',code:'SCHEMA_INCOMPATIBLE'}]}],completionWarnings:[]}
    :init.method==='POST'
      ?{siteId:'site/a',collectionId:'collection/a',restoredFromRevisionId:'revision/a',collection:{id:'collection/a',version:collectionVersion},completionWarnings:['COLLECTION_DESIGN_RESTORE_CACHE_PENDING']}
      :{siteId:'site/a',collectionId:'collection/a',currentVersion:collectionVersion,pagination:{offset:100,limit:100,hasMore:true,nextOffset:200},revisions:[{id:'revision/a',operation:'template-upgrade',templateId:'template/a',targetRevisionId:null,hasPinnedBaseline:true}]};
  return Response.json(collectionStatus===200?{success:true,requestId:'fixture',data}:{success:false,requestId:'fixture',error:{code:pathname.endsWith('/instances')?'TEMPLATE_INSTANCE_REVIEW_STALE':'COLLECTION_DEFINITION_CONFLICT',message:'Reload and review again'}},{status:collectionStatus});
}});
const collectionInput={targetType:'collection',targetRevisionId:input.targetRevisionId,selection:[{type:'collection',id:'collection/a'}]};
const collectionReview=await collectionClient.reviewAdminTemplateInstances('template/a',collectionInput,options);
assert.equal(collectionReview.data.reviewVersion,collectionReviewVersion);assert.equal(collectionReview.data.scanned.collections,1);assert.equal(collectionReview.data.targets[0].conflicts[0].code,'SCHEMA_INCOMPATIBLE');
await collectionClient.applyAdminTemplateInstances('template/a',{...collectionInput,reviewVersion:collectionReviewVersion},options);
assert.deepEqual(JSON.parse(collectionCalls[0].init.body),{...collectionInput,action:'review'});assert.deepEqual(JSON.parse(collectionCalls[1].init.body),{...collectionInput,reviewVersion:collectionReviewVersion,action:'apply'});
const collectionHistory=await collectionClient.listAdminCollectionDesignVersions('collection/a',{offset:100,limit:100},options);
assert.equal(collectionHistory.data.pagination.nextOffset,200);assert.equal(collectionCalls[2].url.pathname,'/api/admin/sites/site%2Fa/collections/collection%2Fa/design-versions');
assert.equal(collectionCalls[2].url.searchParams.get('offset'),'100');assert.equal(collectionCalls[2].url.searchParams.get('limit'),'100');
const collectionRestore=await collectionClient.restoreAdminCollectionDesignVersion('collection/a','revision/a',{expectedVersion:collectionHistory.data.currentVersion},options);
assert.equal(collectionRestore.data.collection.version,collectionVersion);assert.deepEqual(collectionRestore.data.completionWarnings,['COLLECTION_DESIGN_RESTORE_CACHE_PENDING']);
assert.equal(collectionCalls[3].url.pathname,'/api/admin/sites/site%2Fa/collections/collection%2Fa/design-versions/revision%2Fa/restore');
assert.deepEqual(JSON.parse(collectionCalls[3].init.body),{expectedVersion:collectionVersion});
await collectionClient.updateAdminCollection('collection/a',{name:'Edited',expectedVersion:collectionVersion},options);
assert.deepEqual(JSON.parse(collectionCalls.at(-1).init.body),{name:'Edited',expectedVersion:collectionVersion});
collectionStatus=409;await assert.rejects(collectionClient.restoreAdminCollectionDesignVersion('collection/a','revision/a',{expectedVersion:collectionVersion},options),e=>e instanceof BackyApiError&&e.code==='COLLECTION_DEFINITION_CONFLICT');
await assert.rejects(collectionClient.applyAdminTemplateInstances('template/a',{...collectionInput,reviewVersion:collectionReviewVersion},options),e=>e instanceof BackyApiError&&e.code==='TEMPLATE_INSTANCE_REVIEW_STALE');
assert.equal(collectionCalls.length,7,'No automatic collection restore/apply replay');
for(const call of collectionCalls){assert.equal(call.init.headers.get('x-backy-admin-session'),'synthetic');assert.equal(call.init.credentials,'include');}
console.log('Collection template SDK PASS: explicit collection selections/review namespace/schema conflicts, bounded history continuation, encoded restore route/collection-v1/warnings and stale409 without replay; synthetic transport only.');
