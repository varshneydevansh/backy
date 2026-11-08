import assert from 'node:assert/strict';
import {createBackyClient,BackyApiError} from '../dist/index.js';
const calls=[];let status=200;
const client=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{
 calls.push({url:new URL(url),init});
 if(status!==200)return Response.json({success:false,requestId:'fixture',error:{code:'DELIVERY_RETRY_ALREADY_ADMITTED',message:'Already admitted'}},{status});
 return Response.json({success:true,requestId:'fixture',data:init.method==='POST'?{delivery:{attempted:true,channel:'webhook',target:'https://provider.invalid',status:'succeeded',attemptId:'attempt',durableState:'pending',completionWarnings:['FORM_DELIVERY_OUTCOME_PENDING']},submission:{id:'submission'},completionWarnings:['FORM_DELIVERY_OUTCOME_PENDING']}:{siteId:'override',formId:'form/a',events:[{id:'attempt',status:'uncertain',metadata:{retryAdmitted:false}}],count:205,pagination:{total:205,limit:100,offset:100,hasMore:true}}});
}});
const history=await client.listFormDeliveryAttempts('form/a',{limit:100,offset:100,submissionId:'submission/a'},{siteId:'override',adminSession:'synthetic',credentials:'include'});
assert.equal(history.data.count,205);assert.equal(calls[0].url.pathname,'/api/admin/sites/override/forms/form%2Fa/delivery-attempts');assert.equal(calls[0].url.searchParams.get('submissionId'),'submission/a');assert.equal(calls[0].init.credentials,'include');
for(const name of ['retryFormSubmissionWebhook','retryFormSubmissionEmail']){
 const result=await client[name]('form/a','submission/a',{eventId:'source',requestId:'proof'},{adminSession:'synthetic'});
 assert.equal(result.data.delivery.status,'succeeded');assert.equal(result.data.delivery.durableState,'pending');assert.deepEqual(result.data.completionWarnings,['FORM_DELIVERY_OUTCOME_PENDING']);assert.deepEqual(JSON.parse(calls.at(-1).init.body),{eventId:'source'});assert.equal(calls.at(-1).init.headers.get('x-request-id'),'proof');
}
status=409;await assert.rejects(client.retryFormSubmissionWebhook('form/a','submission/a',{eventId:'source'}),e=>e instanceof BackyApiError&&e.status===409&&e.code==='DELIVERY_RETRY_ALREADY_ADMITTED');assert.equal(calls.length,4,'No automatic retry');
console.log('Forms delivery SDK PASS: scoped full-count pagination, optional exact source, observed/durable outcome distinction, warning preservation and consumed409 without replay; synthetic transport.');
