import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './collection-import-postgres-handlers.mjs';
const require=createRequire(import.meta.url),{NextRequest}=require('next/server');

export async function verifyPublicPageAdmissionHandlers({repositories,owner,siteId,pageId,id,queries}){
 let fullReads=0,repositoryReads=0,missing=false,checks=0;
 const forbidden=()=>{fullReads++;throw Error('Heavy route fallback forbidden');};
 const store=new Proxy({}, {get:()=>forbidden});
 const runtime={shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>{
  repositoryReads++;
  return {...repositories,sites:{...repositories.sites,getById:forbidden,getBySlug:forbidden,list:forbidden,...(missing==='site'?{getRouteMetadataByIdOrSlug:undefined}:{})},
   pages:{...repositories.pages,getById:forbidden,getBySlug:forbidden,list:forbidden,getSummaryById:forbidden,getSummaryBySlug:forbidden,listSummaries:forbidden,...(missing==='pages'?{getRouteMetadataById:undefined}:{})},
   posts:{getBySlug:forbidden},collections:{list:forbidden},cacheInvalidations:{latestRevision:forbidden},contentWorkflows:{validatePreviewToken:forbidden}};
 }};
 const route=load('../src/app/api/sites/[siteId]/resolve/route.ts',{'@/lib/backyStore':store,'./backyStore':store,'@/lib/repositoryRuntime':runtime,'./repositoryRuntime':runtime,'@/lib/previewTokenAudit':{recordPreviewTokenUse:forbidden}});
 async function call(path='/writing',query='',headers){
  const response=await route.GET(new NextRequest(`http://fixture.invalid/api/sites/${siteId}/resolve?profile=page-admission&path=${encodeURIComponent(path)}${query}`,{headers}),{params:Promise.resolve({siteId})});
  const raw=await response.text();return {response,body:raw?JSON.parse(raw):null,bytes:Buffer.byteLength(raw)};
 }
 const first=await call();assert.equal(first.response.status,200);assert.equal(first.body.data.route.resourceId,pageId);assert.equal(first.body.data.site.id,siteId);assert.equal(first.response.headers.get('x-backy-page-admission-profile'),'page-admission.v1');assert.equal(first.response.headers.get('cache-control'),'public, no-cache, must-revalidate');assert(first.bytes<1000);checks+=6;
 assert(!/PRIVATE|content|editableMap|navigation|frontendDesign|settings/.test(JSON.stringify(first.body)));checks++;
 const etag=first.response.headers.get('etag');assert.equal((await call('/writing','',{'if-none-match':etag})).response.status,304);checks++;
 for(const [path,status] of [['/due',200],['/later',404],['/missing-child',404],['/loop-a/loop-b',404],['/foreign',404],['/parent/child',404],['/',404],['/blog/writing',404]]){assert.equal((await call(path)).response.status,status,path);checks++;}
 await owner.query('delete from pages where id=$1',[id(12)]);assert.equal((await call('/parent/child')).response.status,200,'Retained draft parent is a path constraint, not an invented publication gate');checks++;
 await owner.query('update pages set parent_id=$1 where id=$2',[id(999),pageId]);assert.equal((await call()).response.status,404);checks++;
 await owner.query('update pages set parent_id=null where id=$1',[pageId]);
 await owner.query('update pages set status=\'published\' where id=$1',[id(7)]);assert.equal((await call('/')).body.data.route.resourceId,id(7));checks++;
 await owner.query('update pages set is_homepage=true where id=$1',[id(8)]);assert.equal((await call('/')).response.status,404,'Ambiguous home never admits the first page');checks++;
 await owner.query('update pages set is_homepage=false where id=$1',[id(8)]);
 for(const status of ['draft','archived']){await owner.query('update pages set status=$1 where id=$2',[status,pageId]);const withdrawn=await call('/writing','',{'if-none-match':etag});assert.equal(withdrawn.response.status,404);assert.equal(withdrawn.response.headers.get('cache-control'),'no-store');checks+=2;}
 await owner.query('update pages set status=\'published\' where id=$1',[pageId]);
 await owner.query('update sites set is_published=false where id=$1',[siteId]);assert.equal((await call('/writing','',{'if-none-match':etag})).response.status,404);checks++;
 await owner.query('update sites set is_published=true where id=$1',[siteId]);
 const settings=async value=>owner.query('update sites set settings=$1 where id=$2',[JSON.stringify(value),siteId]);
 await settings({redirectRules:[{from:'/writing',to:'/new',statusCode:307,private:'SECRET'}]});const redirected=await call();assert.equal(redirected.response.status,200);assert.equal(redirected.body.data.route.type,'redirect');assert(!('resourceId' in redirected.body.data.route));checks+=3;
 await settings({redirectRules:[{from:'/writing',statusCode:410}]});assert.equal((await call()).response.status,410);checks++;
 await settings({redirectRules:[{from:'/writing',to:'/new',statusCode:301,enabled:false}]});assert.equal((await call()).body.data.route.type,'page');checks++;
 await settings({localization:{defaultLocale:'en',localeStrategy:'path-prefix',locales:[{code:'en',default:true},{code:'hi',pathPrefix:'hi'}]},redirectRules:[]});
 const local=await call('/hi/writing');assert.equal(local.response.status,200);assert.equal(local.body.data.route.path,'/hi/writing');assert.equal(local.body.data.route.resourceId,pageId);checks+=3;
 await settings({localization:{defaultLocale:'en',localeStrategy:'domain',locales:[{code:'en',default:true},{code:'hi',domain:'hindi.fixture.invalid'}]},redirectRules:[]});assert.equal((await call('/writing','&host=hindi.fixture.invalid')).response.status,200);checks++;
 // Large routing leaves must fail, not truncate a rule and accidentally admit content.
 await settings({redirectRules:[{from:'/other',to:'x'.repeat(300000)}]});assert.equal((await call()).response.status,503);checks++;
 await settings({localization:{defaultLocale:'en',locales:[{code:'hi',default:'truthy-invalid'}]}});assert.equal((await call()).response.status,503);checks++;
 await settings({localization:{locales:[null]}});assert.equal((await call()).response.status,503);checks++;
 await settings({redirectRules:Array.from({length:10001},()=>({from:'/other',to:'/new'}))});assert.equal((await call()).response.status,503);checks++;
 await settings({});
 for(const query of ['&previewToken=private','&profile=other','&path=/other','&host=a&domain=b','&unknown=x']){const before=repositoryReads;assert.equal((await call('/writing',query)).response.status,400);assert.equal(repositoryReads,before);checks+=2;}
 for(const capability of ['site','pages']){missing=capability;assert.equal((await call()).response.status,503);checks++;}missing=false;
 assert.equal(fullReads,0);assert(queries.some(q=>q.includes('offset ')));checks+=2;
 return {passed:true,checks,firstResponseBytes:first.bytes,fullReadFallbacks:fullReads,actualResolveHandler:true,actualDatabaseRepositories:true,hostedRequests:0};
}
