import assert from 'node:assert/strict';
import {createBackyClient} from '../dist/index.js';
const calls=[],choices={comments:'redact',submissions:'retain',exclusiveContacts:'delete'};
const client=createBackyClient({baseUrl:'https://admin.example',siteId:'site/a',credentials:'omit',defaultHeaders:{authorization:'Bearer operator-token','x-backy-admin-key':'service-key',cookie:'do-not-forward'},fetch:async(url,init)=>{calls.push({url,init});return Response.json({success:true,requestId:'fixture',data:{schema:'safe-fixture'}});}});
await client.previewAdminVisitorErasure('member/a',choices,{requestId:'preview-request'});
await client.confirmAdminVisitorErasure('member/a',{previewId:'preview-id',confirmLocalErasure:true},{requestId:'confirm-request'});
assert.equal(calls.length,2);assert.equal(new URL(calls[0].url).pathname,'/api/admin/sites/site%2Fa/visitors/members/member%2Fa/privacy-erasure/preview');assert.deepEqual(JSON.parse(calls[0].init.body),{choices});assert.deepEqual(JSON.parse(calls[1].init.body),{previewId:'preview-id',confirmLocalErasure:true});
for(const {init} of calls){assert.equal(init.method,'POST');assert.equal(init.credentials,'include');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');for(const key of ['authorization','x-backy-admin-key','cookie'])assert.equal(init.headers.get(key),null);}
console.log('SDK local erasure preview/confirm: encoded exact scope, explicit choices/acknowledgement, isolated Owner-cookie transport and no inherited service credentials.');
