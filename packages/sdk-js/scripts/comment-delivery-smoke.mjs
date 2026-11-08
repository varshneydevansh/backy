import assert from 'node:assert/strict';
import {createBackyClient,BackyApiError} from '../dist/index.js';
const calls=[];
const client=createBackyClient({baseUrl:'https://backy.invalid',siteId:'site/one',fetch:async(url,init)=>{
 const address=new URL(url);calls.push({address,init});
 if(init.method==='POST'){
  const body=JSON.parse(init.body);
  if(body.eventId==='consumed')return Response.json({success:false,requestId:'fixture',error:{code:'DELIVERY_RETRY_ALREADY_ADMITTED',message:'Already admitted'}},{status:409});
  return Response.json({success:true,requestId:'fixture',data:{delivery:{attempted:true,channel:'webhook',target:'https://provider.invalid',status:'succeeded',attemptId:'delivery-one',durableState:'pending',completionWarnings:['COMMENT_DELIVERY_OUTCOME_PENDING']},retryOf:body.eventId,comment:{id:'comment'},completionWarnings:['COMMENT_AUDIT_PENDING']}});
 }
 return Response.json({success:true,requestId:'fixture',data:{siteId:'override',events:[{id:'delivery-one',status:'uncertain',metadata:{retryAdmitted:false}}],count:205,pagination:{total:205,limit:100,offset:100,hasMore:true}}});
}});
const history=await client.listCommentDeliveryAttempts({limit:100,offset:100,commentId:'comment/one'},{siteId:'override',adminSession:'session',credentials:'include'});
assert.equal(calls[0].address.pathname,'/api/sites/override/comments/delivery-attempts');assert.equal(calls[0].address.searchParams.get('offset'),'100');assert.equal(calls[0].address.searchParams.get('commentId'),'comment/one');assert.equal(calls[0].init.credentials,'include');assert.equal(history.data.count,205);assert.equal(history.data.events[0].status,'uncertain');
const sent=await client.retryCommentDelivery('comment/one',{eventId:'source',requestId:'request-proof'},{adminSession:'session'});
assert.equal(calls[1].address.pathname,'/api/sites/site%2Fone/comments/comment%2Fone/delivery-retry');assert.equal(calls[1].init.headers.get('x-request-id'),'request-proof');assert.deepEqual(JSON.parse(calls[1].init.body),{eventId:'source'});
assert.equal(sent.data.delivery.status,'succeeded');assert.equal(sent.data.delivery.durableState,'pending');assert.deepEqual(sent.data.delivery.completionWarnings,['COMMENT_DELIVERY_OUTCOME_PENDING']);assert.deepEqual(sent.data.completionWarnings,['COMMENT_AUDIT_PENDING']);
await assert.rejects(client.retryCommentDelivery('comment/one',{eventId:'consumed'}),error=>error instanceof BackyApiError&&error.status===409&&error.code==='DELIVERY_RETRY_ALREADY_ADMITTED');assert.equal(calls.length,3,'No replay on consumed or pending attempt');
console.log('Comment delivery SDK transport PASS: scoped paginated history, observed-success/durable-pending distinction, audit warnings, consumed409 without replay. Synthetic transport; actual handler/AJV and provider evidence remain separate.');
