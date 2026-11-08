import assert from 'node:assert/strict';
import {createBackyClient,BackyApiError} from '../dist/index.js';
const calls=[];let status=200,warnings=[],legacy=false;
const client=createBackyClient({baseUrl:'https://backy.example',siteId:'site/a',fetch:async(url,init)=>{calls.push({url:new URL(url),init});return Response.json(status===200?{success:true,requestId:'fixture',data:{media:{id:'asset/a',caption:'Committed'},...(!legacy?{completionWarnings:warnings}: {})}}:{success:false,requestId:'fixture',error:{code:'MEDIA_STORAGE_MUTATION_BUSY',message:'Retry shortly'}},{status,headers:status===503?{'retry-after':'1','cache-control':'no-store'}:{}});}});
const options={adminSession:'local-synthetic-session',credentials:'include',requestId:'request'};
for(warnings of [[],['MEDIA_AUDIT_PENDING'],['MEDIA_CACHE_INVALIDATION_PENDING','MEDIA_WEBHOOK_DELIVERY_PENDING','MEDIA_ORGANIZATION_PENDING']]){
 const previous=calls.length,result=await client.updateAdminMedia('asset/a',{caption:'Owner edit',metadata:{extension:{keep:[false,0,null]}}},options);assert.deepEqual(result.data.completionWarnings,warnings);assert.equal(result.data.media.caption,'Committed');assert.equal(calls.length,previous+1,'Committed outcomes must not replay PATCH');
}
legacy=true;assert.equal((await client.updateAdminMedia('asset/a',{},options)).data.completionWarnings,undefined);
status=503;const prior=calls.length;await assert.rejects(()=>client.updateAdminMedia('asset/a',{caption:'Never admitted'},options),error=>error instanceof BackyApiError&&error.status===503&&error.code==='MEDIA_STORAGE_MUTATION_BUSY');assert.equal(calls.length,prior+1,'Busy response must not implicitly retry the mutation');
for(const {url,init}of calls){assert.equal(url.pathname,'/api/admin/sites/site%2Fa/media/asset%2Fa');assert.equal(init.method,'PATCH');assert.equal(init.headers.get('x-backy-admin-session'),options.adminSession);assert.equal(init.headers.get('x-request-id'),'request');assert.equal(init.credentials,'include');assert.equal(init.cache,'no-store');}
assert.deepEqual(JSON.parse(calls[0].init.body),{caption:'Owner edit',metadata:{extension:{keep:[false,0,null]}}});
console.log('Media metadata SDK transport PASS: committed warnings preserved, legacy optional response, exact encoded/authenticated PATCH and503 denial, no implicit mutation replay. Mock transport only.');
