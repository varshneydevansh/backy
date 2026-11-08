import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls=[];
let status=200;
const client=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{
 calls.push({url:new URL(url),init});
 return Response.json(status===200?{success:true,requestId:'fixture',data:{media:[],pagination:{total:0,limit:2,offset:3,hasMore:false}}}:{success:false,requestId:'fixture',error:{code:'INVALID_MEDIA_LINK_FILTER',message:'Use one selector.'}},{status});
}});
let checks=0;
for(const method of ['media','mediaCached','adminMedia']) for(const selector of ['linkedPageId','linkedPostId']) {
 const options={siteId:'owned/site',limit:2,offset:3,[selector]:'target/+id',...(method==='adminMedia'?{adminSession:'synthetic-session',credentials:'include'}:{})};
 await client[method](options);
 const {url,init}=calls.at(-1);
 assert.equal(url.pathname,`/api/${method==='adminMedia'?'admin/':''}sites/owned%2Fsite/media`);
 assert.equal(url.searchParams.get(selector),'target/+id');
 assert.equal(url.searchParams.has(selector==='linkedPageId'?'linkedPostId':'linkedPageId'),false);
 assert.equal(url.searchParams.get('limit'),'2');assert.equal(url.searchParams.get('offset'),'3');
 assert.equal(init.method,'GET');
 assert.equal(init.headers.get('x-backy-admin-session'),method==='adminMedia'?'synthetic-session':null);
 checks+=7;
}
await client.media({pageId:'page/context',postId:'post/context'});
assert.equal(calls.at(-1).url.searchParams.get('pageId'),'page/context');assert.equal(calls.at(-1).url.searchParams.get('postId'),'post/context');checks+=2;
status=400;
const before=calls.length;
await assert.rejects(client.media({linkedPageId:'page',linkedPostId:'post'}),e=>e instanceof BackyApiError&&e.code==='INVALID_MEDIA_LINK_FILTER'&&e.status===400);
assert.equal(calls.length,before+1,'server refusal is propagated without retries');checks+=2;
console.log(`SDK linked media PASS ${checks} checks; three methods/two exact selectors, encoded site/query/pagination, private/public auth isolation, context compatibility,400 no retry. Mocked transport.`);
