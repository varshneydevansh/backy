import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';
import { collectionContractValidator } from './collection-template-contract-validation.mts';
const site={id:'document-public-site',slug:'document-public',isPublished:true};
const content={elements:[{id:'root',type:'section',children:[{id:'child',type:'heading',x:44,responsive:{mobile:{width:280}},props:{content:'Current authored text'},animation:{type:'fade'},unknown:{retain:[false,0,null]}}]}],themeTokenRefs:{font:'body'},assets:[{mediaId:'asset'}],interactions:{retained:true},dataBindings:{retained:true},editableMap:{retained:true},seo:{retained:true},metadata:{canvasSize:{width:1400,height:800},customCSS:'.current{}',customJS:'current()',animations:{retained:true},extension:{retain:[false,0,null]},frontendTemplateInstance:'ordinary-authored-content-extension'}};
const meta={frontendDesignTemplateId:'template-current',canonical:'/current-page',noIndex:true,jsonLd:[{name:'Current'}],expectedVersion:'ordinary-authored-metadata',expectedRecord:{retain:true},extension:{retain:[false,0,null]},frontendTemplateInstance:{schemaVersion:'backy.template-instance.v1',baselineContent:{old:'private-baseline-canary'},seedContext:{old:'private-baseline-canary'}}};
const page={id:'page-current',siteId:site.id,title:'Current page',slug:'current-page',description:'Current description',status:'published',content,meta};
const post={...page,id:'post-current',title:'Current post',slug:'current-post'};
const original=JSON.stringify({page,post});let checks=0,previewAudits=0;
const frontendDesign={frontendDesignProvenanceFromMetadata:(m:any)=>({templateId:m?.frontendDesignTemplateId})};
const projection=load('../src/lib/publicDocumentMetadata.ts',{});
for(const demo of [false,true]){
 const scopedSite=(id:string)=>[site.id,site.slug].includes(id)?site:null;
 const readable=(item:any)=>item.status==='published'||(item.status==='scheduled'&&Date.parse(item.scheduledAt||'')<=Date.now());
 const scopedPage=(siteId:string,path:string,options:any={})=>siteId===site.id&&path==='current-page'&&(!demo||options.includeUnpublished||readable(page))?page:null;
 const mocks={
  '@/lib/frontendDesignContract':frontendDesign,'@/lib/publicDocumentMetadata':projection,
  '@/lib/publicContractResponse':load('../src/lib/publicContractResponse.ts'),
  '@/lib/seoDiscovery':{getHostedRouteUrl:(origin:string,_slug:string,path:string)=>origin+path},
  '@/lib/repositoryPages':{getRepositoryPageByPublicPath:async(_repositories:any,siteId:string,path:string)=>scopedPage(siteId,path)},
  '@/lib/previewTokenAudit':{recordPreviewTokenUse:async()=>{previewAudits++;}},
  '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>({
   sites:{getById:async(id:string)=>scopedSite(id),getBySlug:async(id:string)=>scopedSite(id)},
   pages:{list:async()=>({items:[page],pagination:{total:1,limit:100,offset:0,hasMore:false}})},
   posts:{getBySlug:async(siteId:string,slug:string)=>siteId===site.id&&slug===post.slug?post:null,list:async()=>({items:[post],pagination:{total:1,limit:100,offset:0,hasMore:false}})},
   contentWorkflows:{validatePreviewToken:async(_site:string,_type:string,_id:string,token:string)=>token==='synthetic-preview'},
   cacheInvalidations:{latestRevision:async()=> 'current-revision'},
  })},
  '@/lib/backyStore':{getSiteByIdOrSlug:scopedSite,getPageByPath:scopedPage,getPageSummary:()=>readable(page)?[page]:[],getBlogPosts:(siteId:string,options:any={})=>({posts:siteId===site.id&&(!options.slug||options.slug===post.slug)&&(options.includeUnpublished||readable(post))?[post]:[],pagination:{total:1,limit:100,offset:0,hasMore:false}}),validatePreviewToken:(_site:string,_type:string,_id:string,token:string)=>token==='synthetic-preview'},
 };
 for(const [kind,routeFile,item,queries] of [
  ['page','../src/app/api/sites/[siteId]/pages/route.ts',page,['','?slug=current-page','?path=current-page','?slug=current-page&previewToken=synthetic-preview']],
  ['post','../src/app/api/sites/[siteId]/blog/route.ts',post,['','?slug=current-post','?slug=current-post&previewToken=synthetic-preview']],
 ] as const){
  const route=load(routeFile,mocks);
  for(const query of queries){
   const response=await route.GET(new NextRequest('http://fixture.invalid/'+query),{params:Promise.resolve({siteId:site.slug})});assert.equal(response.status,200);checks++;
   const body=await response.json();assert.equal(JSON.stringify(body).includes('private-baseline-canary'),false,'Public list/detail/preview and legacy aliases must omit the managed template baseline');checks++;
   const plural=kind==='page'?'pages':'posts',value=query?body.data[kind]:body.data[plural][0];
   const validate=collectionContractValidator('Public'+(kind==='page'?'Page':'BlogPost')+(query?'Envelope':'ListEnvelope'));assert(validate(body),JSON.stringify(validate.errors));
   const {frontendTemplateInstance:_pin,...currentMeta}=item.meta;assert.deepEqual(value.meta,currentMeta);checks++;
   if(demo){assert.deepEqual(value.content,item.content);checks++;}else{assert.deepEqual(value.content.contentDocument,item.content);assert.deepEqual(value.content.elements,item.content.elements);assert.deepEqual(value.content.metadata,item.content.metadata);checks+=3;}
   assert.equal(value.frontendDesign.templateId,'template-current');checks++;
   assert.deepEqual(query?body[kind]:body[plural],query?body.data[kind]:body.data[plural]);checks++;
   if(kind==='page'){assert.equal(value.seo.canonical,'/current-page');assert.equal(value.seo.robots.index,false);checks+=2;}
   if(query.includes('previewToken')){assert.match(response.headers.get('cache-control')||'',/no-store/);checks++;}
   else {assert.equal(response.headers.get('cache-control'),'public, no-cache, must-revalidate');assert.equal(response.headers.get('x-backy-cache-scope'),'render');checks+=2;}
   assert.equal(JSON.stringify({page,post}),original,'Projection must preserve authenticated baseline and authored state');checks++;
  }
  assert.equal((await route.GET(new NextRequest('http://fixture.invalid/'),{params:Promise.resolve({siteId:'foreign-site'})})).status,404);checks++;
  const url='http://fixture.invalid/?slug='+item.slug;
  const read=(etag?:string)=>route.GET(new NextRequest(url,{headers:etag?{'if-none-match':etag}:{}}),{params:Promise.resolve({siteId:site.slug})});
  const current=await read(),etag=current.headers.get('etag')!;
  assert.ok(etag);assert.equal((await read(etag)).status,304);checks+=2;
  const listUrl='http://fixture.invalid/';
  const listRead=(validator?:string)=>route.GET(new NextRequest(listUrl,{headers:validator?{'if-none-match':validator}:{}}),{params:Promise.resolve({siteId:site.slug})});
  const visibleList=await listRead(),listEtag=visibleList.headers.get('etag')!;
  assert.ok(listEtag);assert.equal((await listRead(listEtag)).status,304);checks+=2;
  for(const status of ['draft','archived','scheduled']){
   item.status=status;Object.assign(item,{scheduledAt:new Date(Date.now()+86400000).toISOString()});
   const withdrawn=await read(etag);assert.equal(withdrawn.status,404);assert.equal(withdrawn.headers.get('cache-control'),'no-store');assert.equal(withdrawn.headers.has('etag'),false);checks+=3;
   const listResponse=await listRead(listEtag),listBody=await listResponse.json();
   assert.equal(listResponse.status,200);assert.equal(listResponse.headers.get('cache-control'),'public, no-cache, must-revalidate');
   assert.notEqual(listResponse.headers.get('etag'),listEtag);assert.equal(listBody.data[kind==='page'?'pages':'posts'].length,0);checks+=4;
  }
  item.status='published';delete (item as any).scheduledAt;
 }
}
const privateSnapshot=collectionContractValidator('PageResource');assert(privateSnapshot({id:'page',title:'Private snapshot',slug:'snapshot',meta:{frontendTemplateInstance:meta.frontendTemplateInstance}}),'Authenticated/revision resources retain private provenance');
assert.equal(previewAudits,4);checks++;
console.log(`Public page/blog metadata privacy passed ${checks}: actual demo/repository list, query detail and preview handlers; full current content/metadata retained; no provider/network or deployed proof.`);
