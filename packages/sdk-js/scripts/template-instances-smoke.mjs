import assert from 'node:assert/strict';
import {createBackyClient,BackyApiError} from '../dist/index.js';
const calls=[];let status=200;
const client=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{calls.push({url:new URL(url),init});const body=JSON.parse(init.body);return Response.json(status===200?{success:true,requestId:'fixture',data:{action:body.action,siteId:'site/a',templateId:'template/a',targetRevisionId:body.targetRevisionId,reviewVersion:body.reviewVersion||'template-instances-v1:'+ 'a'.repeat(64),targets:[{id:'page',state:'blocked',conflicts:[{path:'/elements/@hero/style/color',code:'VALUE_CONFLICT'}]}],appliedTargets:[{type:'page',id:'saved'}],failedTargets:[{type:'post',id:'late',code:'CONTENT_CONFLICT'}],completionWarnings:['TEMPLATE_INSTANCE_AUDIT_PENDING'],outcome:'partial'}}:{success:false,requestId:'fixture',error:{code:'TEMPLATE_INSTANCE_REVIEW_STALE',message:'Review again'}},{status});}});
const input={targetRevisionId:'template_revision_12345678-1234-1234-1234-123456789abc',selection:[{type:'page',id:'page'}]},options={adminSession:'synthetic',credentials:'include'};
const review=await client.reviewAdminTemplateInstances('template/a',input,options);assert.equal(review.data.targets[0].conflicts[0].path,'/elements/@hero/style/color');
const apply=await client.applyAdminTemplateInstances('template/a',{...input,reviewVersion:review.data.reviewVersion},options);assert.equal(apply.data.outcome,'partial');assert.equal(apply.data.failedTargets[0].code,'CONTENT_CONFLICT');assert.deepEqual(apply.data.completionWarnings,['TEMPLATE_INSTANCE_AUDIT_PENDING']);
assert.deepEqual(JSON.parse(calls[0].init.body),{...input,action:'review'});assert.deepEqual(JSON.parse(calls[1].init.body),{...input,reviewVersion:review.data.reviewVersion,action:'apply'});
for(const call of calls){assert.equal(call.url.pathname,'/api/admin/sites/site%2Fa/templates/template%2Fa/instances');assert.equal(call.init.headers.get('x-backy-admin-session'),'synthetic');assert.equal(call.init.credentials,'include');}
await client.reviewAdminTemplateInstances('template/a',{...input,selection:[{type:'section',id:'section/a'}]},options);assert.deepEqual(JSON.parse(calls.at(-1).init.body).selection,[{type:'section',id:'section/a'}]);
const productInput={targetType:'product',targetRevisionId:input.targetRevisionId,selection:[{type:'product',id:'product/a',collectionId:'catalog/a'}]};
await client.reviewAdminTemplateInstances('template/a',productInput,options);assert.deepEqual(JSON.parse(calls.at(-1).init.body),{...productInput,action:'review'});
await client.applyAdminTemplateInstances('template/a',{...productInput,reviewVersion:review.data.reviewVersion},options);assert.deepEqual(JSON.parse(calls.at(-1).init.body),{...productInput,reviewVersion:review.data.reviewVersion,action:'apply'});
status=409;await assert.rejects(client.applyAdminTemplateInstances('template/a',{...productInput,reviewVersion:review.data.reviewVersion},options),e=>e instanceof BackyApiError&&e.code==='TEMPLATE_INSTANCE_REVIEW_STALE');assert.equal(calls.length,6,'No automatic apply replay');
console.log('Template instance SDK PASS: exact selection/revision review/apply, conflict paths and partial warnings, encoded private route and stale409 without replay; synthetic transport.');
const recoveryCalls=[];
const recovery=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{
  recoveryCalls.push({url:new URL(url),init});
  return Response.json({success:true,requestId:'fixture',data:init.method==='POST'?{restoredFromRevisionId:'revision/a',completionWarnings:['PRODUCT_DESIGN_RESTORE_AUDIT_PENDING']}:{currentVersion:'record-v1:'+'c'.repeat(64),pagination:{offset:100,limit:100,hasMore:false,nextOffset:null},revisions:[]}});
}});
const versions=await recovery.listAdminProductDesignVersions('product/a',{offset:100,limit:100},options);
assert.equal(versions.data.pagination.offset,100);
assert.equal(recoveryCalls[0].url.pathname,'/api/admin/sites/site%2Fa/commerce/products/product%2Fa/design-versions');
assert.equal(recoveryCalls[0].url.searchParams.get('offset'),'100');assert.equal(recoveryCalls[0].url.searchParams.get('limit'),'100');
const recovered=await recovery.restoreAdminProductDesignVersion('product/a','revision/a',{expectedVersion:versions.data.currentVersion},options);
assert.deepEqual(recovered.data.completionWarnings,['PRODUCT_DESIGN_RESTORE_AUDIT_PENDING']);
assert.equal(recoveryCalls[1].url.pathname,'/api/admin/sites/site%2Fa/commerce/products/product%2Fa/design-versions/revision%2Fa/restore');
assert.deepEqual(JSON.parse(recoveryCalls[1].init.body),{expectedVersion:versions.data.currentVersion});
assert.equal(recoveryCalls[1].init.credentials,'include');assert.equal(recoveryCalls[1].init.headers.get('x-backy-admin-session'),'synthetic');
assert.equal(recoveryCalls.length,2);

const formCalls=[];let formStatus=200;
const formVersion='form-v1:'+'e'.repeat(64),formReviewVersion='template-form-instances-v1:'+'f'.repeat(64);
const formClient=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{
  formCalls.push({url:new URL(url),init});
  const pathname=new URL(url).pathname;
  const data=pathname.endsWith('/instances')
    ?{action:JSON.parse(init.body).action,reviewVersion:formReviewVersion,scanned:{pages:0,posts:0,forms:1},targets:[{type:'form',id:'form/a',state:'blocked',conflicts:[{path:'/fields/email/type',code:'SCHEMA_INCOMPATIBLE'}]}],completionWarnings:[]}
    :init.method==='POST'
      ?{siteId:'site/a',formId:'form/a',restoredFromRevisionId:'revision/a',form:{id:'form/a',version:formVersion},completionWarnings:['FORM_DESIGN_RESTORE_CACHE_PENDING']}
      :{siteId:'site/a',formId:'form/a',currentVersion:formVersion,pagination:{offset:100,limit:100,hasMore:true,nextOffset:200},revisions:[{id:'revision/a',operation:'template-upgrade',templateId:'template/a',targetRevisionId:null,hasPinnedBaseline:true}]};
  return Response.json(formStatus===200?{success:true,requestId:'fixture',data}:{success:false,requestId:'fixture',error:{code:pathname.endsWith('/instances')?'TEMPLATE_INSTANCE_REVIEW_STALE':'FORM_DEFINITION_CONFLICT',message:'Reload and review again'}},{status:formStatus});
}});
const formInput={targetType:'form',targetRevisionId:input.targetRevisionId,selection:[{type:'form',id:'form/a'}]};
const formReview=await formClient.reviewAdminTemplateInstances('template/a',formInput,options);
assert.equal(formReview.data.reviewVersion,formReviewVersion);assert.equal(formReview.data.scanned.forms,1);assert.equal(formReview.data.targets[0].conflicts[0].code,'SCHEMA_INCOMPATIBLE');
await formClient.applyAdminTemplateInstances('template/a',{...formInput,reviewVersion:formReviewVersion},options);
assert.deepEqual(JSON.parse(formCalls[0].init.body),{...formInput,action:'review'});assert.deepEqual(JSON.parse(formCalls[1].init.body),{...formInput,reviewVersion:formReviewVersion,action:'apply'});
const formHistory=await formClient.listAdminFormDesignVersions('form/a',{offset:100,limit:100},options);
assert.equal(formHistory.data.pagination.nextOffset,200);assert.equal(formCalls[2].url.pathname,'/api/admin/sites/site%2Fa/forms/form%2Fa/design-versions');
assert.equal(formCalls[2].url.searchParams.get('offset'),'100');assert.equal(formCalls[2].url.searchParams.get('limit'),'100');
const formRestore=await formClient.restoreAdminFormDesignVersion('form/a','revision/a',{expectedVersion:formHistory.data.currentVersion},options);
assert.equal(formRestore.data.form.version,formVersion);assert.deepEqual(formRestore.data.completionWarnings,['FORM_DESIGN_RESTORE_CACHE_PENDING']);
assert.equal(formCalls[3].url.pathname,'/api/admin/sites/site%2Fa/forms/form%2Fa/design-versions/revision%2Fa/restore');
assert.deepEqual(JSON.parse(formCalls[3].init.body),{expectedVersion:formVersion});
formStatus=409;await assert.rejects(formClient.restoreAdminFormDesignVersion('form/a','revision/a',{expectedVersion:formVersion},options),e=>e instanceof BackyApiError&&e.code==='FORM_DEFINITION_CONFLICT');
await assert.rejects(formClient.applyAdminTemplateInstances('template/a',{...formInput,reviewVersion:formReviewVersion},options),e=>e instanceof BackyApiError&&e.code==='TEMPLATE_INSTANCE_REVIEW_STALE');
assert.equal(formCalls.length,6,'No automatic form restore/apply replay');
for(const call of formCalls){assert.equal(call.init.headers.get('x-backy-admin-session'),'synthetic');assert.equal(call.init.credentials,'include');}
console.log('Form template SDK PASS: explicit form selections/review namespace/schema conflicts, bounded history continuation, encoded restore route/form-v1/warnings and stale409 without replay; synthetic transport only.');
