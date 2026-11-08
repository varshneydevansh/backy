/** Actual Supabase SDK and adapter; every HTTP request is intercepted in memory. */
import assert from 'node:assert/strict';
import { createSupabaseAdapter } from '../dist/index.js';
const originalFetch=globalThis.fetch;const requests=[];let checks=0;
const objectPath='album/photo.webp';let expectedPath=objectPath,status=200,networkError=false;
const original={id:'owned-fixture',name:'photo.webp',bucket_id:'owned-fixture-bucket',size:123,updated_at:'2026-10-20T00:00:00Z',content_type:'image/webp',etag:'owned-etag',metadata:{size:123,mimetype:'image/webp'}};
let payload=structuredClone(original);
globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url);assert.equal(url.origin,'https://storage-fixture.invalid');requests.push({method:request.method,path:url.pathname});assert.equal(request.method,'GET');assert.equal(url.pathname,'/storage/v1/object/info/owned-fixture-bucket/'+expectedPath.split('/').map(encodeURIComponent).join('/'));assert.equal(url.search,'');assert.equal(url.hash,'');if(networkError)throw Error('Synthetic transport failure');return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});};
const reset=()=>{expectedPath=objectPath;status=200;networkError=false;payload=structuredClone(original);};
try{
 const adapter=await createSupabaseAdapter({provider:'supabase',url:'https://storage-fixture.invalid',key:'owned-disposable-fixture-key',bucket:'owned-fixture-bucket'});
 const once=async(run)=>{const before=requests.length;try{return await run();}finally{assert.equal(requests.length,before+1);checks++;}};
 const item=await once(()=>adapter.stat(objectPath));assert.equal(item.size,123);assert.equal(item.path,objectPath);assert.equal(item.mimeType,'image/webp');assert.equal(item.etag,'owned-etag');assert.equal(item.lastModified.getTime(),new Date(original.updated_at).getTime());
 for(const size of [0,57,50*1024*1024]){reset();payload.size=size;const row=await once(()=>adapter.stat(objectPath));assert.equal(row.size,size);}
 reset();delete payload.size;payload.metadata.size=79;assert.equal((await once(()=>adapter.stat(objectPath))).size,79);
 for(const size of [-1,0.5,Number.MAX_SAFE_INTEGER+1,'123',null,undefined]){reset();payload.size=size;delete payload.metadata.size;await once(()=>assert.rejects(adapter.stat(objectPath),/size is unavailable or invalid/));}
 reset();payload=null;await once(()=>assert.rejects(adapter.stat(objectPath),/metadata is unavailable/));
 for(const httpStatus of [400,404]){reset();status=httpStatus;payload={statusCode:'404',code:'NoSuchKey',message:'Object not found'};assert.equal(await once(()=>adapter.stat(objectPath)),null);}
 for(const httpStatus of [400,401,403,429,500]){reset();status=httpStatus;payload={statusCode:String(httpStatus),message:'Fixture provider error'};await once(()=>assert.rejects(adapter.stat(objectPath),/Stat failed/));}
 reset();networkError=true;await once(()=>assert.rejects(adapter.stat(objectPath),/Stat failed/));
 reset();assert.equal(await once(()=>adapter.exists(objectPath)),true);
 reset();status=404;payload={statusCode:'404',message:'Missing object'};assert.equal(await once(()=>adapter.exists(objectPath)),false);
 reset();status=403;payload={statusCode:'403',message:'Denied'};await once(()=>assert.rejects(adapter.exists(objectPath),/Stat failed/));
 for(const unusual of ['album/photo #1?.webp','album/फ़ोटो %.webp']){reset();expectedPath=unusual;assert.equal((await once(()=>adapter.stat(unusual))).path,unusual);}
 console.log(JSON.stringify({ok:true,checks,metadataRequests:requests.length,externalRequests:0,folderListings:0,binaryDownloads:0,boundary:'Actual installed SDK and adapter against intercepted metadata responses, not live Supabase certification'}));
}finally{globalThis.fetch=originalFetch;}
