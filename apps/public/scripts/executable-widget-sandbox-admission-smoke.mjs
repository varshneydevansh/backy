/** Actual sandbox handler + verified bundle bytes; synthetic scoped repository/storage only. */
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {NextResponse} from 'next/server.js';
import {load} from './collection-import-postgres-handlers.mjs';
const site={id:'sandbox-exact-site',slug:'sandbox-exact-site',isPublished:true};
const key='fixture.position101',version='1.0.0',secret='synthetic-local-exact-admission-key';
process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY=secret;process.env.BACKY_CUSTOM_CODE_COMPONENTS_ENABLED='1';process.env.NODE_ENV='test';
const bytes=Buffer.from('export function mount({root}){root.textContent="Exact101 reviewed module"}');
const sha256=createHash('sha256').update(bytes).digest('hex');
const target={siteId:site.id,componentKey:key,version,displayName:'Exact version beyond first100',type:'codeComponent',status:'active',reviewStatus:'approved',source:'registry',renderMode:'sandbox-iframe',integrity:{signed:true,signatureRequiredForCustomCode:true,algorithm:'sha256',sha256,signature:'sha256='+createHmac('sha256',secret).update(sha256).digest('hex'),storagePath:`sites/${site.id}/interactive-components/${key}/${version}/fixture.mjs`,storageProvider:'local',contentType:'application/javascript',sizeBytes:bytes.length}};
const rows=[...Array.from({length:100},(_,index)=>({...target,componentKey:'fixture.prefix'+index})),target];let row=target,storedBuiltinOverride=true,reads=0,listReads=0,exactReads=0,checks=0;
const repositories={sites:{getById:async id=>id===site.id?site:null,getBySlug:async()=>null},interactiveComponents:{list:async options=>{listReads++;return{items:rows.slice(options.offset,options.offset+options.limit),total:101}},getByKeyVersion:async (id,k,v)=>{exactReads++;return id===site.id&&k==='backy.custom.sandboxed'&&v===version?storedBuiltinOverride?{...target,componentKey:k,status:'disabled',reviewStatus:'draft'}:null:id===site.id&&k===key&&v===version?row:null}}};
const mocks={'next/server':{NextResponse},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/mediaStorage':{getMediaStorageAdapter:async()=>({provider:'local',read:async path=>{reads++;assert.equal(path,target.integrity.storagePath);return bytes}})}};
mocks['./mediaStorage']=mocks['@/lib/mediaStorage'];
const handler=load('../src/app/api/sites/[siteId]/interactive-components/[componentKey]/[version]/sandbox/route.ts',mocks);
async function get({siteId=site.id,componentKey=key,version:v=version,etag}={}){return handler.GET(new Request(`http://fixture.invalid/api/sites/${siteId}/interactive-components/${componentKey}/${v}/sandbox`,{headers:etag?{'if-none-match':etag}:{}}),{params:Promise.resolve({siteId,componentKey,version:v})})}
const response=await get();assert.equal(response.status,200,'Reviewed exact module at position101 must not depend on the first100 registry entries');assert((await response.text()).includes(bytes.toString('base64')));assert.equal(listReads,0,'Executable admission must resolve exactly, never page a catalog');assert.equal(exactReads,1);assert.equal(reads,1);checks+=5;
function assertNoCacheMetadata(response, scope) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-backy-cache-scope'), scope);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('x-backy-cache-revision'), null);
  checks += 4;
}
function assertSecurityHeaders(response, executable = false) {
  const csp = response.headers.get('content-security-policy');
  for (const directive of ["default-src 'none'", "frame-ancestors 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert(csp?.includes(directive), `Sandbox response must retain ${directive}`);
    checks++;
  }
  assert(!csp.includes('allow-same-origin'));
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert(response.headers.get('permissions-policy')?.includes('camera=()'));
  assert(response.headers.get('permissions-policy')?.includes('microphone=()'));
  assert.equal(response.headers.get('x-backy-schema-version'), 'backy.interactive-component-sandbox.v1');
  if (executable) assert(csp.includes("script-src 'unsafe-inline' blob:"));
  checks += 6 + Number(executable);
}
assertNoCacheMetadata(response, 'private');
assertSecurityHeaders(response, true);
for(const patch of [{status:'disabled'},{reviewStatus:'draft'},{siteId:'foreign-site'},{componentKey:'foreign.widget'},{version:'2.0.0'}]){row={...target,...patch};const before=reads;const denied=await get({etag:'"previous-shell"'});assert.equal(denied.status,404);assertNoCacheMetadata(denied,'error');assertSecurityHeaders(denied);assert.equal(reads,before);checks+=2;}
row=target;assert.equal((await get({componentKey:'backy.custom.sandboxed'})).status,404,'Disabled stored override must not restore the enabled builtin');assert.equal((await get({componentKey:'../unregistered'})).status,404,'An invalid/unregistered namespace cannot select another catalog component');checks+=2;const before=reads;assert.equal((await get({version:'9.9.9'})).status,404);assert.equal((await get({siteId:'foreign-site'})).status,404);assert.equal(reads,before);checks+=3;
row={...target,integrity:{...target.integrity,signature:'sha256='+ '0'.repeat(64)}};const unsigned=await get();assert.equal(unsigned.status,403);assertNoCacheMetadata(unsigned,'error');assertSecurityHeaders(unsigned);assert.equal(reads,before);checks+=2;
// A metadata-only builtin has no stored executable bundle. It may revalidate;
// an executable response must never borrow its cache validators or become 304.
row = target;
storedBuiltinOverride = false;
const metadata = await get({componentKey:'backy.custom.sandboxed'});
assert.equal(metadata.status, 200);
assert.equal(metadata.headers.get('x-backy-cache-scope'), 'discovery');
assert.equal(metadata.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
const etag = metadata.headers.get('etag');
assert(etag);
assert(metadata.headers.get('x-backy-cache-revision'));
assert(!(await metadata.text()).includes(bytes.toString('base64')));
assertSecurityHeaders(metadata);
checks += 6;
const unchanged = await get({componentKey:'backy.custom.sandboxed',etag});
assert.equal(unchanged.status, 304);
assert.equal(unchanged.headers.get('etag'), etag);
assert.equal(unchanged.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
assert.equal(unchanged.headers.get('x-backy-cache-scope'), 'discovery');
assert.equal(await unchanged.text(), '');
assertSecurityHeaders(unchanged);
checks += 5;
const conditionalBundle = await get({etag});
assert.equal(conditionalBundle.status, 200);
assertNoCacheMetadata(conditionalBundle, 'private');
assert((await conditionalBundle.text()).includes(bytes.toString('base64')));
checks += 2;
// An old valid metadata validator cannot bypass current site/component admission.
storedBuiltinOverride = true;
const disabled = await get({componentKey:'backy.custom.sandboxed',etag});
assert.equal(disabled.status, 404);
assertNoCacheMetadata(disabled, 'error');
assertSecurityHeaders(disabled);
site.isPublished = false;
const unpublished = await get({etag});
assert.equal(unpublished.status, 404);
assertNoCacheMetadata(unpublished, 'error');
assertSecurityHeaders(unpublished);
checks += 2;
console.log(`Sandbox executable exact-version admission passed ${checks} actual-handler assertions: index101, no list reads, verified bytes, disabled/unreviewed/foreign/version/signature denial, private executable responses, discovery metadata ETag/304, CSP and admission before validators.`);
