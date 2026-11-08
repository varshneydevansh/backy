/** Actual shared-parent handlers + actual demo store, isolated from every configured DB/provider. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NextRequest, NextResponse } from 'next/server';
import { editorMediaRuntimeFixture } from './editor-media-runtime-fixture.mjs';
import { load } from './collection-import-postgres-handlers.mjs';
const require = createRequire(import.meta.url), original = process.cwd(), scratch = mkdtempSync('/tmp/backy-existing-editor-media-');
if (process.argv.length > 2) throw new Error('This fixture accepts no target/configuration arguments.');
let checks = 0;
process.chdir(scratch);
try {
 const imported = await import('../src/lib/backyStore.ts'), store: any = imported.default || imported;
 const site = store.createAdminSite({ id: 'site-editor-media', slug: 'editor-media', name: 'Disposable editor media' });
 const other = store.createAdminSite({ id: 'site-editor-media-foreign', slug: 'editor-media-foreign', name: 'Disposable foreign media' });
 const post = store.createAdminBlogPost(site.id, { title: 'Original asset owner', slug: 'owner', content: { elements: [], canvasSize: { width: 1200, height: 800 } } });
 const page = store.createAdminPage(site.id, { title: 'Borrowing page', slug: 'reuse', content: { elements: [], canvasSize: { width: 1200, height: 800 } } });
 const assetInput = { filename: 'owned.png', originalName: 'owned.png', mimeType: 'image/png', type: 'image', sizeBytes: 128, url: '/synthetic-existing.png', scope: 'post', scopeTargetId: post.id, postIds: [post.id], metadata: { authored: { retained: true }, bindings: [{ id: 'source-post-link', mediaId: 'placeholder', scope: 'post', targetId: post.id, usageType: 'upload' }] } };
 const asset = store.createMediaItem(site.id, assetInput), foreign = store.createMediaItem(other.id, { ...assetInput, postIds: [], scope: 'global', scopeTargetId: null });
 const content = (id: string) => ({ elements: [{ id: 'existing-image', type: 'image', x: 16, y: 20, width: 300, height: 200, props: { assetId: id, src: id === foreign.id ? foreign.url : asset.url }, unknownExtension: { keep: [0, false] } }], canvasSize: { width: 1200, height: 800 } });
 let denied = false; const effects = { audit: 0, webhook: 0 }; 
 const mocks: any = {
  'next/server': { NextRequest, NextResponse }, '@/lib/backyStore': store,
  '@/lib/adminAccess': { requireAdminAccess: async () => denied ? NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 }) : { session: { user: { id: 'synthetic-owner' } } } },
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => true },
  '@/lib/adminAudit': { recordAdminAudit: async () => { effects.audit++; return {}; } }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { effects.webhook++; return []; } },
  '@/lib/routeConflicts': { findPageRouteConflict: () => null }, '@/lib/siteReadiness': { buildPageReadiness: () => ({ checks: [] }) },
 };
 const routes = { page: load('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts', mocks), post: load('../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts', mocks) };
 async function call(kind: 'page'|'post', method: string, body?: any) {
  const id = kind === 'page' ? page.id : post.id, family = kind === 'page' ? 'pages' : 'blog';
  const response = await routes[kind][method](new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/${family}/${id}`, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ siteId: site.id, pageId: id, postId: id }) });
  return { status: response.status, body: await response.json() };
 }
 for (const kind of ['post','page'] as const) {
  assert.equal((await call(kind, 'PATCH', { content: content(asset.id) })).status, 200); checks++;
  const reopened = await call(kind, 'GET'); assert.equal(reopened.status, 200); assert.equal(reopened.body.data[kind].content.elements[0].props.assetId, asset.id); assert.deepEqual(reopened.body.data[kind].content.elements[0].unknownExtension, { keep: [0,false] }); checks += 3;
 }
 const reused = store.getMediaById(site.id, asset.id);
 for (const key of ['id','siteId','scope','scopeTargetId','url','filename','createdAt','metadata'] as const) { assert.deepEqual(reused[key], asset[key], `Asset ${key} must retain original ownership and author data`); checks++; }
 assert.deepEqual(reused.pageIds, [page.id]); assert.deepEqual(reused.postIds, [post.id]); checks += 2;
 const safety = load('../src/lib/mediaDeletionSafety.ts', {}), source = {
  pages: { list: async () => ({ items: [store.getAdminPageById(site.id,page.id)], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } }) },
  posts: { list: async () => ({ items: [store.getAdminBlogPostById(site.id,post.id)], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } }) },
  collections: { list: async () => ({ items: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } }) },
 };
 const refs = await safety.repositoryMediaDeletionReferences(source, reused); assert(refs.some((ref: any) => ref.scope === 'page' && ref.targetId === page.id)); assert(refs.some((ref: any) => ref.scope === 'post' && ref.targetId === post.id)); assert.throws(() => safety.authorizeMediaDeletion(reused, {}, refs), (error: any) => error.code === 'MEDIA_IN_USE'); checks += 3;
 const sync = load('../src/lib/repositoryMediaReferenceSync.ts', {});
 const inventory = Array.from({ length: 10005 }, (_, i) => ({ ...structuredClone(asset), id: `repository-media-${i}`, pageIds: [], metadata: { ...structuredClone(asset.metadata), postIds: [post.id] } }));
 const tail = inventory[10004], repository = {
  list: async (input: any) => { const limit = Math.min(input.limit,10000); return { items: inventory.slice(input.offset,input.offset+limit), pagination: { total: inventory.length, offset: input.offset, limit, hasMore: input.offset+limit<inventory.length } }; },
  update: async (s: string,id: string,input: any) => { assert.equal(s,site.id); const media = inventory.find(row=>row.id===id)!; Object.assign(media,{...input,metadata:{...media.metadata,...input.metadata}}); return { item: media }; },
 };
 await sync.syncRepositoryPageMediaReferences({ mediaRepository: repository, siteId: site.id, pageId: page.id, content: content(tail.id) });
 { assert.deepEqual(JSON.parse(JSON.stringify(tail.metadata.pageIds)),[page.id]); assert.deepEqual(tail.metadata.postIds,[post.id]); assert.equal(tail.scope,'post'); checks += 3; }
 for(const fault of ['foreign','duplicate','missing-pagination','read-failure','drift']) {
  let referenceWrites=0;
  const bad={...repository,update:async()=>{referenceWrites++;throw Error('Invalid inventory must never reach writes');},list:async(input:any)=>{
   if(fault==='read-failure')throw Error('Private synthetic provider failure');
   const result=await repository.list(input);
   if(fault==='foreign')return {...result,items:[{...result.items[0],siteId:other.id},...result.items.slice(1)]};
   if(fault==='duplicate'&&input.offset)return {...result,items:[inventory[0],...result.items.slice(1)]};
   if(fault==='missing-pagination')return {...result,pagination:undefined};
   if(fault==='drift'&&input.offset)return {...result,pagination:{...result.pagination,total:result.pagination.total+1}};
   return result;
  }};
  await assert.rejects(()=>sync.syncRepositoryPageMediaReferences({mediaRepository:bad,siteId:site.id,pageId:page.id,content:content(tail.id)}),(error:any)=>error.code==='MEDIA_INVENTORY_INCOMPLETE');assert.equal(referenceWrites,0);checks+=2;
 }
 const before = store.getAdminPageById(site.id,page.id), foreignBefore = store.getMediaById(other.id,foreign.id);
 const result = await call('page','PATCH',{ content: content(foreign.id) });
 assert.equal(result.status,400,'Foreign-site existing asset must be rejected before save'); assert.equal(result.body.error.code,'INVALID_EDITOR_MEDIA_REFERENCE'); assert.equal(result.body.error.details.path,'/content/elements/0/props/assetId'); assert.equal(result.body.error.details.mediaId,foreign.id); assert.deepEqual(store.getAdminPageById(site.id,page.id),before); checks += 4;
 assert.deepEqual(store.getMediaById(other.id,foreign.id),foreignBefore); checks++;
 for (const kind of ['page','post'] as const) {
  const current = kind === 'page' ? store.getAdminPageById(site.id,page.id) : store.getAdminBlogPostById(site.id,post.id), priorAsset = store.getMediaById(site.id,asset.id), priorEffects = structuredClone(effects);
  const refusal = await call(kind,'PATCH',{content:content(foreign.id)}); assert.equal(refusal.status,400); assert.deepEqual(kind==='page'?store.getAdminPageById(site.id,page.id):store.getAdminBlogPostById(site.id,post.id),current); assert.deepEqual(store.getMediaById(site.id,asset.id),priorAsset); assert.deepEqual(effects,priorEffects); checks += 4;
 }
 const createRoutes = { page: load('../src/app/api/admin/sites/[siteId]/pages/route.ts',mocks), post: load('../src/app/api/admin/sites/[siteId]/blog/route.ts',mocks) };
 async function create(kind: 'page'|'post', body: any, targetSite=site.id) { const response = await createRoutes[kind].POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${targetSite}/${kind==='page'?'pages':'blog'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({siteId:targetSite})}); return {status:response.status,body:await response.json()}; }
 for (const kind of ['page','post'] as const) {
  const rowsBefore = kind==='page'?store.listAdminPages(site.id):store.getBlogPosts(site.id,{includeUnpublished:true,limit:1000,offset:0});
  const priorAsset=store.getMediaById(site.id,asset.id),priorEffects=structuredClone(effects);
  const refusal=await create(kind,{title:'Foreign refused',slug:'foreign-refused-'+kind,content:content(foreign.id)});
  assert.equal(refusal.status,400); assert.equal(refusal.body.error.code,'INVALID_EDITOR_MEDIA_REFERENCE'); assert.equal(refusal.body.error.details.path,'/content/elements/0/props/assetId'); assert.deepEqual(kind==='page'?store.listAdminPages(site.id):store.getBlogPosts(site.id,{includeUnpublished:true,limit:1000,offset:0}),rowsBefore); assert.deepEqual(store.getMediaById(site.id,asset.id),priorAsset); assert.deepEqual(effects,priorEffects); checks += 6;
  const external=await create(kind,{title:'External retained',slug:'external-'+kind,content:{elements:[{id:'external',type:'image',width:300,height:200,props:{src:'https://example.invalid/external.png',fontToken:'font-label-only'}}],canvasSize:{width:1200,height:800}}}); assert.equal(external.status,201); assert.equal(external.body.data[kind].content.elements[0].props.src,'https://example.invalid/external.png'); checks += 2;
  const missing=await create(kind,{title:'Missing refused',slug:'missing-'+kind,content:content('media_missing_known_identity')}); assert.equal(missing.status,400); assert.equal(missing.body.error.details.mediaId,'media_missing_known_identity'); checks += 2;
  const featured=await create(kind,{title:'Featured',slug:'featured-'+kind,...(kind==='post'?{featuredImageId:foreign.id}:{meta:{imageId:foreign.id}})}); assert.equal(featured.status,400); assert.equal(featured.body.error.details.path,kind==='post'?'/featuredImageId':'/meta/imageId'); checks += 2;
 }
 const builtin=await create('page',{title:'Builtin catalog',slug:'builtin-catalog',content:content('media-demo-hero')},'site-demo'); assert.equal(builtin.status,201); checks++;
 const design = load('../src/lib/frontendDesignContract.ts',mocks);
 store.commitDemoFrontendDesign({siteId:site.id,expectedDesignFingerprint:load('../src/lib/templateInstanceProvenance.ts',mocks).templateInstanceFingerprint(site.settings.frontendDesign??null),source:'synthetic-acceptance',frontendDesign:design.normalizeFrontendDesignContract({status:'captured',source:{type:'manual'},templates:[{id:'reuse-page-template',type:'page',name:'Same-site media',version:1,content:content(asset.id)},{id:'reuse-blog-template',type:'blogPost',name:'Same-site media',version:1,content:content(asset.id)}]})});
 for(const kind of ['page','post'] as const){ const created=await create(kind,{title:'Captured media',slug:'captured-'+kind,frontendDesignTemplateId:kind==='page'?'reuse-page-template':'reuse-blog-template'});assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.data[kind].content.elements[0].props.assetId,asset.id);assert.equal(created.body.data[kind].meta.frontendTemplateInstance.templateId,kind==='page'?'reuse-page-template':'reuse-blog-template');checks+=3; }
 denied = true; const deniedBefore = store.getAdminBlogPostById(site.id,post.id); assert.equal((await call('post','PATCH',{ content: content(foreign.id) })).status,403); assert.deepEqual(store.getAdminBlogPostById(site.id,post.id),deniedBefore); checks += 2;
 {
  const finalMedia=store.getMediaById(site.id,asset.id);
  const child = `import assert from 'node:assert/strict'; const imported = await import(${JSON.stringify(fileURLToPath(new URL('../src/lib/backyStore.ts',import.meta.url)))}); const store = imported.default || imported; const media = store.getMediaById(${JSON.stringify(site.id)},${JSON.stringify(asset.id)}); assert.equal(media.scope,'post'); assert.equal(media.scopeTargetId,${JSON.stringify(post.id)}); assert.deepEqual(media.pageIds,${JSON.stringify(finalMedia.pageIds)}); assert.deepEqual(media.postIds,${JSON.stringify(finalMedia.postIds)}); for(const [kind,id] of ${JSON.stringify([['page',page.id],['post',post.id]])}) { const row=kind==='page'?store.getAdminPageById(${JSON.stringify(site.id)},id):store.getAdminBlogPostById(${JSON.stringify(site.id)},id); assert.equal(row.content.elements[0].props.assetId,media.id); }`;
  execFileSync(process.execPath,['--import',require.resolve('tsx'),'--input-type=module','-e',child],{cwd:scratch,stdio:'pipe',env:{...process.env,TSX_TSCONFIG_PATH:fileURLToPath(new URL('../tsconfig.json',import.meta.url))}}); checks += 6;
 }
 const sourceAsset=asset,sourceForeign=foreign;
 { const asset = { ...sourceAsset, id:'11111111-1111-4000-8000-111111111111' }; const foreign = { ...sourceForeign, id:'22222222-2222-4000-8000-222222222222' };
 // Execute the actual runtime wrapper body so the handler receives the same reference-sync decorators as DB mode.
 const core=require('@backy-cms/core'), rows={page:new Map<string,any>(),post:new Map<string,any>()}, dbMedia=new Map([[asset.id,structuredClone(asset)],[foreign.id,structuredClone(foreign)]]), writes={content:0,reference:0,revision:0};
 const canonical=(row:any,kind:string)=>({...structuredClone(row),content:core.canvasContentPayloadToBackyContentDocument({id:row.id,kind,title:row.title,slug:row.slug,status:row.status,rawContent:row.content})});
 rows.page.set(page.id,canonical(before,'page')); rows.post.set(post.id,canonical(store.getAdminBlogPostById(site.id,post.id),'post'));
 const resultPage=(items:any[],input:any)=>({items:items.slice(input.offset,input.offset+input.limit),pagination:{total:items.length,offset:input.offset,limit:input.limit,hasMore:input.offset+input.limit<items.length}});
 const writer=(kind:'page'|'post')=>({
  getById:async(s:string,id:string)=>{const row=rows[kind].get(id);return row?.siteId===s?structuredClone(row):null;}, getBySlug:async(s:string,slug:string)=>structuredClone(Array.from(rows[kind].values()).find(row=>row.siteId===s&&row.slug===slug)||null), checkSlug:async()=>({available:true}),
  list:async(input:any)=>resultPage(Array.from(rows[kind].values()).filter(row=>row.siteId===input.siteId),input),
  update:async(s:string,id:string,input:any)=>{const row=rows[kind].get(id);assert.equal(row.siteId,s);core.assertBackyContentUpdateExpectation(input,row);if(input.beforeUpdateRevision)writes.revision++;const next={...row,...Object.fromEntries(Object.entries(input).filter(([key,value])=>value!==undefined&&!key.startsWith('expected')&&key!=='beforeUpdateRevision')),updatedAt:'2026-10-12T00:00:01Z'};rows[kind].set(id,next);writes.content++;return {item:structuredClone(next)};},
  create:async(input:any)=>{const next={...input,id:'repository-'+kind+'-'+writes.content,createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z'};rows[kind].set(next.id,next);writes.content++;return {item:structuredClone(next)};},
 });
 const native:any={sites:{getById:async(id:string)=>id===site.id?store.getSiteByIdOrSlug(id):null,getBySlug:async(slug:string)=>slug===site.slug?store.getSiteByIdOrSlug(site.id):null},pages:writer('page'),posts:writer('post'),collections:{list:async(input:any)=>resultPage([],input)},settings:{get:async()=>store.getAdminSettings()},contentWorkflows:{createRevision:async()=>{writes.revision++;return{};}},media:{getById:async(s:string,id:string)=>{const row=dbMedia.get(id);return row?.siteId===s?structuredClone(row):null;},list:async(input:any)=>resultPage(Array.from(dbMedia.values()).filter(row=>row.siteId===input.siteId),input),update:async(s:string,id:string,input:any)=>{const row=dbMedia.get(id)!;assert.equal(row.siteId,s);Object.assign(row,{...input,metadata:{...row.metadata,...input.metadata}});writes.reference++;return{item:structuredClone(row)};}}};
 native.withMediaReferenceMutation=async(_siteId:string,operation:any)=>{const snapshot={page:structuredClone(rows.page),post:structuredClone(rows.post),media:structuredClone(dbMedia),writes:structuredClone(writes)};try{return await operation(native);}catch(error){rows.page=snapshot.page;rows.post=snapshot.post;dbMedia.clear();for(const [id,item]of snapshot.media)dbMedia.set(id,item);Object.assign(writes,snapshot.writes);throw error;}};
 const db=editorMediaRuntimeFixture(native);
 mocks['@/lib/repositoryRuntime']={shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>db};mocks['@/lib/siteReadiness'].buildRepositoryPageReadiness=()=>({checks:[]});denied=false;
 const dbRoutes={page:load('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts',mocks),post:load('../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts',mocks)};
 for(const kind of ['page','post'] as const){
  const id=kind==='page'?page.id:post.id;
  async function dbCall(method:string,body?:any){const response=await dbRoutes[kind][method](new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/${kind==='page'?'pages':'blog'}/${id}`,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId:site.id,pageId:id,postId:id})});return{status:response.status,body:await response.json()};}
  assert.equal((await dbCall('PATCH',{content:content(asset.id)})).status,200);const reopened=await dbCall('GET');assert.equal(reopened.status,200);assert.equal(reopened.body.data[kind].content.elements[0].props.assetId,asset.id);assert.deepEqual(reopened.body.data[kind].content.elements[0].unknownExtension,{keep:[0,false]});checks+=4;
  const prior=structuredClone(rows[kind].get(id)),priorWrites=structuredClone(writes),priorEffects=structuredClone(effects),priorMedia=structuredClone(Array.from(dbMedia));
  const refusal=await dbCall('PATCH',{content:content(foreign.id)});assert.equal(refusal.status,400);assert.equal(refusal.body.error.details.path,'/content/elements/0/props/assetId');assert.deepEqual(rows[kind].get(id),prior);assert.deepEqual(writes,priorWrites);assert.deepEqual(effects,priorEffects);assert.deepEqual(JSON.parse(JSON.stringify(Array.from(dbMedia))),priorMedia);checks+=6;
  const creation=load(`../src/app/api/admin/sites/[siteId]/${kind==='page'?'pages':'blog'}/route.ts`,mocks);const rejected=await creation.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/new`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Rejected repository create',slug:'rejected-'+kind,content:content(foreign.id)})}),{params:Promise.resolve({siteId:site.id})});assert.equal(rejected.status,400);assert.deepEqual(writes,priorWrites);assert.deepEqual(effects,priorEffects);checks+=3;
 }
 const indexed=dbMedia.get(asset.id)!;assert.deepEqual(JSON.parse(JSON.stringify(indexed.metadata.pageIds)),[page.id]);assert.deepEqual(indexed.postIds,[post.id]);for(const key of ['id','siteId','scope','scopeTargetId','url','filename','createdAt'] as const)assert.deepEqual(indexed[key],asset[key]);assert.deepEqual(indexed.metadata.authored,asset.metadata.authored);assert.deepEqual(indexed.metadata.bindings,asset.metadata.bindings);checks+=11;
 }
 console.log(`Existing editor media persistence: ${checks} checks (actual demo persistence/cold reopen and repository-decorated handlers; deletion authorization helper, synthetic session/side effects, no provider).`);
} finally { process.chdir(original); rmSync(scratch,{recursive:true,force:true}); }
