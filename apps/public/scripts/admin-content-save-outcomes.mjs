import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), { NextResponse } = require('next/server');
function load(relative, mocks, cache = new Map()) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 if (cache.has(filename)) return cache.get(filename);
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module = { exports: {} };
 cache.set(filename, module.exports);
 vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, process, fetch, AbortController, setTimeout, clearTimeout, console: { error() {} }, require: id => id in mocks ? mocks[id] : id.startsWith('@/lib/') ? load('../src/lib/' + id.slice('@/lib/'.length) + '.ts', mocks, cache) : id.startsWith('./') ? load(pathToFileURL(resolve(dirname(filename), id + '.ts')), mocks, cache) : require(id) }, { filename });
 cache.set(filename, module.exports); return module.exports;
}
let calls = 0, checks = 0;
const server = createServer((_request, response) => { calls++; response.writeHead(503); response.end('PRIVATE_PROVIDER_RESPONSE'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/fixture`;
const baseline = process.argv.includes('--expect-known-failure'), grantBaseline = process.argv.includes('--expect-known-grant-failure'), evidence = [];
try {
if(!grantBaseline) for (const demo of [false, true]) for (const kind of ['page','post']) for (const failure of ['cache','audit','webhook','provider','all','none']) {
 if (demo && failure === 'cache') continue;
 const path = kind === 'page' ? 'pages/[pageId]' : 'blog/[postId]', name = kind === 'page' ? 'pages' : 'posts';
 const content = { version: '1.0.0', elements: [], metadata: { canvasSize: { width: 1200, height: 900 }, retained: { zero: 0, false: false } } };
 let saved = { id: 'owned-content', siteId: 'owned-site', title: 'Before', slug: 'fixture', status:'draft', updatedAt:'2026-01-01T00:00:00.000Z', content, meta:{kept:true}, isHomepage:false }, committed = 0, denial = 0;
 const effects = { cache:0, audit:0, webhook:0, history:0 };
 const site = {id:'owned-site',slug:'owned',name:'Fixture',settings:{webhooks:{enabled:failure !== 'none',endpoints:[{id:'owned-endpoint',name:'Synthetic',url,eventKinds:['site-updated'],enabled:true}]}}};
 const update = async (_site,id,input) => { assert.equal(id,saved.id); assert.equal(input.expectedUpdatedAt,saved.updatedAt); assert.deepEqual(input.expectedContent,saved.content); assert.equal(input.beforeUpdateRevision.snapshot.id,saved.id); committed++; saved={...saved,title:input.title,updatedAt:'2026-01-01T00:00:00.001Z'}; return {item:saved}; };
 const repositories = { sites:{getById:async id=>id===site.id?site:null,getBySlug:async slug=>slug===site.slug?site:null}, [name]:{getById:async (s,id)=>s===site.id&&id===saved.id?saved:null,update}, collections:{list:async()=>({items:[]})}, contentWorkflows:{createRevision:async()=>{effects.history++;}} };
 const mocks = {
 '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repositories},
 '@/lib/adminAccess':{requireAdminAccess:async (_request,requestId,input)=>{assert.equal(input.permission,'pages.edit');return denial?NextResponse.json({success:false,requestId,error:{code:'FORBIDDEN',message:'Denied'}},{status:denial}):{session:{user:{id:'fixture-operator'}}};}},
 '@/lib/routeConflicts':{findPageRouteConflict:()=>null},
 '@/lib/siteReadiness':{buildRepositoryPageReadiness:()=>({checks:[]}),buildPageReadiness:()=>({checks:[]}),readinessBlockingChecks:()=>[]},
 '@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{effects.cache++;if(['cache','all'].includes(failure))throw Error('PRIVATE_CACHE_ERROR');return {revision:'fixture-revision'};}},
 '@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;if(['audit','all'].includes(failure))throw Error('PRIVATE_AUDIT_ERROR');}},
 '@/lib/commentRepositorySupport':{recordRepositoryInteractionEvent:async()=>{effects.webhook++;if(['webhook','all'].includes(failure))throw Error('PRIVATE_JOURNAL_ERROR');}},
 '@/lib/backyStore':{getSiteByIdOrSlug:()=>site,getAdminPageById:()=>saved,getAdminBlogPostById:()=>saved,listCollections:()=>[],trackWebhookEvent:()=>{effects.webhook++;if(['webhook','all'].includes(failure))throw Error('PRIVATE_JOURNAL_ERROR');},updateAdminPage:(_s,_id,input)=>{assert.equal(input.expectedUpdatedAt,saved.updatedAt);committed++;saved={...saved,title:input.title,updatedAt:'2026-01-01T00:00:00.001Z'};return saved;},updateAdminBlogPost:(_s,_id,input)=>{assert.equal(input.expectedUpdatedAt,saved.updatedAt);committed++;saved={...saved,title:input.title,updatedAt:'2026-01-01T00:00:00.001Z'};return saved;}},
 };
 const route = load('../src/app/api/admin/sites/[siteId]/'+path+'/route.ts',mocks);
 const call = () => route.PATCH(new Request('http://fixture.invalid/api/admin/sites/owned/'+name+'/owned-content',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Committed title',expectedUpdatedAt:'2026-01-01T00:00:00.000Z'})}),{params:Promise.resolve({siteId:'owned',pageId:saved.id,postId:saved.id})});
 const response=await call(), payload=await response.json();
 assert.equal(committed,1);assert.equal(saved.title,'Committed title');assert(!JSON.stringify(payload).includes('PRIVATE_'));checks+=3;
 if(baseline) {
  const thrown = ['cache','audit','webhook','all'].includes(failure);
  assert.equal(response.status,thrown?500:200);checks++;
 } else {
  assert.equal(response.status,200,`${demo?'demo':'database'} ${kind}/${failure}: ${JSON.stringify(payload)}`);
  assert.equal(payload.data[kind].title,'Committed title');
  const expected=[];
  if(!demo&&['cache','all'].includes(failure))expected.push('CONTENT_CACHE_INVALIDATION_PENDING');
  if(['audit','all'].includes(failure))expected.push('CONTENT_AUDIT_PENDING');
  if(failure!=='none')expected.push('CONTENT_WEBHOOK_DELIVERY_PENDING');
  assert.deepEqual(Array.from(payload.data.completionWarnings),expected);
  assert.equal(effects.audit,1);if(!demo)assert.equal(effects.cache,1);checks+=5;
  if(!demo&&failure==='cache')assert.equal(payload.data.cacheInvalidation,null);
 }
 evidence.push({mode:demo?'demo':'repository-adapter',kind,failure,status:response.status,committed,effects,warnings:payload.data?.completionWarnings||null});
 denial=403;const denied=await call();assert.equal(denied.status,403);assert.equal(committed,1);checks+=2;
}
// Operator policy commits have the same observed audit-after-write boundary.
for (const demo of [false,true]) {
 let settings={auth:{userSiteGrants:[]}},writes=0,audits=0;
 const user={id:'operator-target',role:'editor'};
 const commit=input=>{writes++;settings={auth:require('@backy-cms/core').commitBackyOperatorSiteGrantAuth(settings.auth,input)};return settings;};
 const repositories={users:{getById:async()=>user},settings:{get:async()=>settings,commitOperatorSiteGrant:async input=>({item:commit(input)})},sites:{getById:async id=>({id})}};
 const route=load('../src/app/api/admin/users/[userId]/site-grants/route.ts',{
  '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repositories},
  '@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'owner'}}}),isOwnerAdminSession:()=>true,adminAccessError:(status,code,message,requestId)=>NextResponse.json({success:false,requestId,error:{code,message}},{status})},
  '@/lib/adminAudit':{recordAdminAudit:async()=>{audits++;throw Error('PRIVATE_GRANT_AUDIT');}},
  '@/lib/backyStore':{getAdminUserById:()=>user,getAdminSettings:()=>settings,getSiteByIdOrSlug:id=>({id}),commitAdminOperatorSiteGrant:commit},
 });
 const call=()=>route.PATCH(new Request('http://fixture.invalid/api/admin/users/operator-target/site-grants',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:0,scope:{version:1,revision:1,mode:'selected-sites',grants:[{siteId:'owned-site',permissions:['sites.view','pages.edit']}],expiresAt:null}})}),{params:Promise.resolve({userId:user.id})});
 const response=await call(),payload=await response.json();assert.equal(writes,1);assert.equal(settings.auth.userSiteGrants[0].scope.revision,1);assert.equal(audits,1);assert(!JSON.stringify(payload).includes('PRIVATE_'));checks+=4;
 assert.equal(response.status,baseline||grantBaseline?500:200);checks++;
 if(!baseline&&!grantBaseline){assert.equal(payload.data.revision,1);assert.deepEqual(Array.from(payload.data.completionWarnings),['OPERATOR_SITE_GRANT_AUDIT_PENDING']);checks+=2;}
 const retry=await call();assert.equal(retry.status,409);assert.equal(writes,1);assert.equal(audits,1);checks+=3;
 evidence.push({mode:demo?'demo':'repository-adapter',kind:'operator-grant',failure:'audit',status:response.status,committed:writes,warnings:payload.data?.completionWarnings||null});
}
console.log(`Content save outcomes: ${checks} checks PASS; actual page/blog PATCH, demo/repository adapters, actual site webhook helper + owned HTTP503; no provider.`);
if(baseline||grantBaseline)writeFileSync(grantBaseline?'/tmp/backy-operator-grant-postcommit-baseline.json':'/tmp/backy-content-save-postcommit-baseline.json',JSON.stringify({boundary:'Actual handlers; isolated mutation/admission adapters; owned HTTP503, no real provider',checks,calls,evidence},null,2));
} finally { await new Promise(resolve=>server.close(resolve)); }
