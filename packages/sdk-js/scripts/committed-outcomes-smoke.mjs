import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = []; let status = 200;
const client = createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(url,init)=>{
 calls.push({url:new URL(url),init});
 if(status!==200) return Response.json({success:false,requestId:'fixture',error:{code:'LAST_ADMIN_AUTHORITY',message:'Retain administrator'}},{status});
 const path=new URL(url).pathname;
 const data=path==='/api/admin/sites/site%2Fa'?{deleted:true,siteId:'site/a',completionWarnings:['SITE_DELETION_WEBHOOK_PENDING']}:path.endsWith('/bulk')?{action:'delete',updated:0,deleted:1,userIds:['one'],users:[],outcome:'partial',completionWarnings:['OPERATOR_BULK_APPLY_INCOMPLETE'],failedTargets:[{userId:'two',code:'LAST_ADMIN_AUTHORITY'},{userId:'three',code:'OPERATOR_NOT_ATTEMPTED'}],reloadRequired:true}:path.includes('/pages/')?{page:{id:'page'},completionWarnings:['CONTENT_AUDIT_PENDING','CONTENT_CACHE_INVALIDATION_PENDING']}:{post:{id:'post'},completionWarnings:['CONTENT_WEBHOOK_DELIVERY_PENDING']};
 return Response.json({success:true,requestId:'fixture',data});
}});
const options={adminSession:'synthetic',credentials:'include',requestId:'proof'};
const page=await client.updateAdminPage('page/a',{title:'Saved'},options);
assert.deepEqual(page.data.completionWarnings,['CONTENT_AUDIT_PENDING','CONTENT_CACHE_INVALIDATION_PENDING']);
const post=await client.updateAdminBlogPost('post/a',{title:'Saved'},options);
assert.deepEqual(post.data.completionWarnings,['CONTENT_WEBHOOK_DELIVERY_PENDING']);
const bulk=await client.bulkAdminUsers({action:'delete',userIds:['one','two','three']},options);
assert.equal(bulk.data.deleted,1);assert.deepEqual(bulk.data.userIds,['one']);assert.equal(bulk.data.outcome,'partial');assert.equal(bulk.data.failedTargets[1].code,'OPERATOR_NOT_ATTEMPTED');assert.equal(bulk.data.reloadRequired,true);
const deleted=await client.deleteAdminSite('site/a',options);assert.equal(deleted.data.deleted,true);assert.deepEqual(deleted.data.completionWarnings,['SITE_DELETION_WEBHOOK_PENDING']);
for(const c of calls){assert.equal(c.init.headers.get('x-backy-admin-session'),'synthetic');assert.equal(c.init.credentials,'include');}
assert.equal(calls[0].url.pathname,'/api/admin/sites/site%2Fa/pages/page%2Fa');assert.equal(calls[1].url.pathname,'/api/admin/sites/site%2Fa/blog/post%2Fa');
status=409;await assert.rejects(client.bulkAdminUsers({action:'delete',userIds:['two']},options),e=>e instanceof BackyApiError&&e.code==='LAST_ADMIN_AUTHORITY');assert.equal(calls.length,5,'No automatic replay of committed or rejected operations');
console.log('Committed outcome SDK PASS: saved page/blog warnings and confirmed partial bulk results preserved, session/site encoding, last-authority conflict without replay; synthetic transport.');
