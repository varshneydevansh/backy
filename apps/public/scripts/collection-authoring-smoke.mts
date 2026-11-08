import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';
import { mkdtempSync, rmSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Actual handlers and validation helpers; persistence/session/provider boundaries are fixtures.
const site = { id: 'collection-authoring-a', slug: 'fixture-a', name: 'Fixture', settings: {} };
const collection = { id: 'collection-a', siteId: site.id, name: 'Entries', slug: 'entries', status: 'draft', fields: [{ id: 'title', key: 'title', label: 'Title', type: 'text' }], metadata: {} };
const row = (i: number) => ({ id: `row-${i}`, siteId: site.id, collectionId: collection.id, slug: `row-${i}`, status: 'draft', values: { title: `Title ${i}`, extension: { retained: i } } });
const page = (rows: any[], input: any) => { const limit = Math.min(input.limit, 100); return { items: rows.slice(input.offset, input.offset + limit), pagination: { total: rows.length, limit, offset: input.offset, hasMore: input.offset + limit < rows.length } }; };
const helper = (name: string, mocks: any = {}) => load(`../src/lib/${name}.ts`, mocks);
function fixture({ demo = false, denied = 0, rows = Array.from({ length: 1205 }, (_, i) => row(i)), fault, pageFault, pages = [], presets = [], isPublished = true, unique = false, media = false }: any = {}) {
  const effects = { writes: 0, reads: [] as any[], permissions: [] as string[] };
  let current = { ...site, isPublished, settings: { editor: { collectionBindingPresets: presets, retained: 'keep' } } };
  const schemas = Array.from({ length: 205 }, (_, i) => ({ ...collection, id: `schema-${i}`, status:'published', permissions:{publicRead:i !== 204}, metadata:{publicWriteToken:'fixture-private-token',authored:{keep:true}} }));
  const selectedCollection={...collection,fields:[...collection.fields.map(field=>({...field,unique})),...(media?[{id:"asset",key:"asset",label:"Asset",type:"file"}]:[])]};
  const readRows = (input: any) => { effects.reads.push(input); const value = page(rows, input); return fault ? fault(value, input) : value; };
  const repositories: any = {
    sites: { getById: async (id: string) => id === site.id ? current : null, getBySlug: async (id: string) => id === site.slug ? current : null,
      update: async (_id: string, input: any) => { effects.writes++; current = { ...current, settings: { ...current.settings, ...input.settings } }; return { item: current }; } },
    pages: { list: async (input: any) => { effects.reads.push(input); const value=page(pages,input);return pageFault?pageFault(value,input):value; } },
    cacheInvalidations: { latestRevision: async()=> 'fixture-revision' },
    media: { getById:async(sid:string,id:string)=>{effects.reads.push({siteId:sid,mediaId:id});return null;} },
    collections: { withRecordWriteLock:async(_sid:string,_cid:string,run:any)=>run(repositories.collections,selectedCollection,{media:repositories.media,settings:repositories.settings,sites:repositories.sites}), list: async (input: any) => page(schemas, input), getById: async (sid: string, id: string) => sid === site.id && id === collection.id ? selectedCollection : null,
      getBySlug: async () => null, getRecordBySlug:async()=>null, listRecords: async (input: any) => readRows(input), createRecord:async(input:any)=>{effects.writes++;return{item:{...row(0),...input}};},create: async () => { effects.writes++; throw new Error('Unexpected create'); }, update: async () => { effects.writes++; throw new Error('Unexpected update'); } },
  };
  const mocks: any = {
    'next/server': { NextResponse },
    '@/lib/collectionDefinitionVersion':helper('collectionDefinitionVersion'),
    '@/lib/collectionRecordVersion': helper('collectionRecordVersion'),
    '@/lib/collectionRecordAdmission': helper('collectionRecordAdmission'),
    '@/lib/adminAccess': { requireAdminAccess: async (_r: any, _id: any, options: any) => { effects.permissions.push(options.permission); return denied ? NextResponse.json({ success: false }, { status: denied }) : { session: { user: { id: 'fixture-owner' } } }; } },
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
    '@/lib/backyStore': { getSiteByIdOrSlug: (id: string) => id === site.id || id === site.slug ? current : null, listCollections: () => schemas,
      getCollectionByIdOrSlug: (sid: string, id: string) => sid === site.id && id === collection.id ? collection : null,
      listCollectionRecords: (_sid: string, _cid: string, input: any) => { const value = readRows(input); return { records: value.items, pagination: value.pagination }; },
      updateAdminSite: (_id: string, input: any) => { effects.writes++; current = { ...current, settings: { ...current.settings, ...input.settings } }; return current; } },
    '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionAccess: async () => null, requireCommerceCollectionSlugAccess: async () => null },
    '@/lib/frontendDesignContract': { seedCollectionInputFromFrontendDesignTemplate: ({ body }: any) => ({ ok: true, body }),seedCollectionRecordInputFromFrontendDesignTemplate:({body}:any)=>({ok:true,body}),normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope:(body:any)=>body },
    '@/lib/adminAudit': { recordAdminAudit: async () => ({}) },
    '@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({})},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>({})},'@/lib/repositoryMediaReferenceSync':{syncRepositoryCollectionRecordMediaReferences:async()=>({})},
    '@/lib/collectionRoutes': helper('collectionRoutes'),
    '@/lib/adminCollectionFields': helper('adminCollectionFields'),
    '@/lib/routeConflicts': helper('routeConflicts', { './collectionRoutes': helper('collectionRoutes') }),
    '@/lib/collectionExportPagination': helper('collectionExportPagination'),
    '@/lib/collectionInventory': helper('collectionInventory', { './collectionExportPagination': helper('collectionExportPagination') }),
    '@/lib/publicCollectionResources': helper('publicCollectionResources', { './frontendDesignContract': { frontendDesignProvenanceFromMetadata: ()=> null } }),
    '@/lib/publicContractResponse': { publicContractJson: (body:any,options:any) => NextResponse.json(body,{status:options.status || 200}) },
  };
  mocks['@/lib/collectionRecordValidation']=helper('collectionRecordValidation',{'@/lib/backyStore':{validateCollectionRecordValues:()=>[],normalizeCollectionRecordValues:(_c:any,values:any)=>values},'@/lib/collectionInventory':mocks['@/lib/collectionInventory']});
  mocks['@/lib/collectionImportPreparation']=helper('collectionImportPreparation',{'@/lib/backyStore':{validateCollectionRecordValueTypes:()=>[],normalizeCollectionRecordValues:(_c:any,values:any)=>values},'@/lib/collectionRecordValidation':mocks['@/lib/collectionRecordValidation'],'@/lib/collectionInventory':mocks['@/lib/collectionInventory'],'@/lib/routeConflicts':mocks['@/lib/routeConflicts']});
  const routes: any = {};
  return { effects, repositories, selectedCollection, current: () => current, async call(path: string, method = 'GET', body?: any, query = '', targetSite = site.slug) {
    const routePath = path.startsWith('public') ? `../src/app/api/sites/[siteId]/collections${path === 'public' ? '' : '/[collectionId]' + (path === 'publicrecords' ? '/records' : path === 'publicrecord' ? '/records/[recordId]' : '')}/route.ts` : path === 'presets' ? '../src/app/api/admin/sites/[siteId]/editor/collection-binding-presets/route.ts' : `../src/app/api/admin/sites/[siteId]/collections${path === 'list' ? '' : path === 'import' ? '/import' : '/[collectionId]' + (path === 'csvimport' ? '/records/import' : path === 'records' ? '/records' : '')}/route.ts`;
    const route = routes[path] ||= load(routePath, mocks);
    const response = await route[method](new NextRequest(`http://fixture.invalid/api/admin/sites/${targetSite}/${path === 'presets' ? 'editor/collection-binding-presets' : 'collections' + (path === 'list' ? '' : path === 'import' ? '/import' : `/${collection.id}` + (path === 'csvimport' ? '/records/import' : path === 'records' ? '/records' : ''))}${query}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': typeof body === 'string' ? 'text/csv' : 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) }), { params: Promise.resolve({ siteId: targetSite, collectionId: collection.id }) });
    const csv = response.headers.get('content-type')?.startsWith('text/csv');
    return { status: response.status, body: csv ? await response.text() : await response.json() };
  } };
}
let passed = 0;
const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) { try { await run(); passed++; } catch (error) { failures.push(`${name}: ${String(error)}`); } }
for (const demo of [false, true]) {
  await check(`public full catalog hides private entries ${demo}`, async () => { const f=fixture({demo}); const result=await f.call('public'); assert.equal(result.status,200); assert.equal(result.body.data.collections.length,204); assert.equal(result.body.data.pagination.total,204); assert.equal(result.body.data.pagination.hasMore,false); assert(result.body.data.collections.every((item:any)=>!item.metadata.publicWriteToken)); });
  await check(`public unpublished site hidden ${demo}`,async()=>{const f=fixture({demo,isPublished:false});assert.equal((await f.call('public')).status,404);});
  for(const path of ['publicdetail','publicrecords','publicrecord']) await check(`public unpublished site detail hidden ${demo}/${path}`,async()=>{const f=fixture({demo,isPublished:false});assert.equal((await f.call(path,path==='publicrecord'?'PATCH':'GET',path==='publicrecord'?{}:undefined)).status,404);});
  for(const preset of [{collectionId:'foreign',fieldKey:'title'},{collectionId:collection.id,fieldKey:'missing'},{collectionId:collection.id,fieldKey:'title',targetPath:'props.__proto__.value'}]) await check(`invalid scoped preset rejected ${demo}`,async()=>{const f=fixture({demo});assert.equal((await f.call('presets','PATCH',{presets:[preset]})).status,400);assert.equal(f.effects.writes,0);});
  await check(`preset safe unknown metadata and server provenance retained ${demo}`,async()=>{const f=fixture({demo});const result=await f.call('presets','PATCH',{presets:[{id:'safe',name:'Safe',collectionId:collection.id,fieldKey:'title',targetPath:'props.registered.nested',extension:{nested:[false,0,{keep:true}]},createdBy:'spoofed',createdAt:'1900-01-01'}]});assert.equal(result.status,200);assert.deepEqual(result.body.data.presets[0].extension,{nested:[false,0,{keep:true}]});assert.equal(result.body.data.presets[0].createdBy,'fixture-owner');assert.notEqual(result.body.data.presets[0].createdAt,'1900-01-01');assert.equal(result.body.data.presets[0].updatedBy,'fixture-owner');assert.equal((await f.call('presets')).body.data.presets[0].updatedBy,'fixture-owner');});
  await check(`default catalog page ${demo}`, async () => { const f = fixture({ demo }); const result = await f.call('list'); assert.equal(result.body.data.collections.length, 100); assert.equal(result.body.data.pagination.total, 205); });
  await check(`complete CSV ${demo}`, async () => { const f = fixture({ demo }); const result = await f.call('records', 'GET', undefined, '?format=csv'); assert.equal(result.status, 200); assert(result.body.includes('Title 1204')); assert.equal(result.body.split('\n').length, 1206); assert.equal(f.effects.permissions[0], 'collections.export'); assert(f.effects.reads.every(input => input.siteId === undefined || input.siteId === site.id)); });
  await check(`numeric query normalization ${demo}`, async () => { const f = fixture({ demo }); const result = await f.call('records', 'GET', undefined, '?limit=bad&offset=bad'); assert.equal(result.status, 200); assert.equal(result.body.data.records.length, 50); assert.equal(result.body.data.pagination.offset, 0); });
  await check(`preset overflow denied without writes ${demo}`, async () => { const f = fixture({ demo }); const result = await f.call('presets', 'PATCH', { presets: Array.from({ length: 49 }, (_, i) => ({ id: `p${i}`, collectionId: collection.id, fieldKey: 'title' })) }); assert.equal(result.status, 400); assert.equal(f.effects.writes, 0); });
  for (const bad of [[null], [{ id: 'duplicate', collectionId: collection.id, fieldKey: 'title' }, { id: 'duplicate', collectionId: collection.id, fieldKey: 'title' }]]) await check(`preset malformed/duplicate denied ${demo}`, async () => { const f = fixture({ demo }); assert.equal((await f.call('presets', 'PATCH', { presets: bad })).status, 400); assert.equal(f.effects.writes, 0); });
  await check(`existing presets read without truncation ${demo}`, async () => { const f = fixture({ demo, presets: Array.from({ length: 49 }, (_, i) => ({ id: `p${i}`, collectionId: collection.id, fieldKey: 'title' })) }); assert.equal((await f.call('presets')).body.data.presets.length, 49); });
  for (const denied of [401, 403]) await check(`denial precedes reads/writes ${demo}/${denied}`, async () => { const f = fixture({ demo, denied }); for (const [path, method] of [['list','GET'], ['records','GET'], ['detail','PATCH'], ['import','POST'], ['presets','PATCH']]) assert.equal((await f.call(path, method, method === 'GET' ? undefined : {})).status, denied); assert.equal(f.effects.reads.length, 0); assert.equal(f.effects.writes, 0); });
  await check(`unknown site denied ${demo}`, async () => { const f = fixture({ demo }); assert.equal((await f.call('records','GET',undefined,'','other-site')).status,404); assert.equal(f.effects.reads.length,0); });
}
for (const [path, method] of [['list', 'POST'], ['detail', 'PATCH'], ['import', 'POST']]) await check(`route collision beyond first page ${path}`, async () => {
  const f = fixture({ pages: Array.from({ length: 205 }, (_, i) => ({ id: `page-${i}`, siteId: site.id, slug: i === 204 ? 'entries' : `page-${i}` })) });
  const payload = { name: 'Entries', slug: 'entries', fields: collection.fields };
  const result = await f.call(path, method, path === 'import' ? { collections: [payload] } : payload);
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'ROUTE_CONFLICT'); assert.equal(f.effects.writes, 0);
});
for (const [path,method] of [['list','POST'],['detail','PATCH'],['import','POST']]) for (const fail of ['stalled','foreign','changed-total','duplicate']) await check(`route inventory ${path}/${fail} fails before write`,async()=>{
  const pages=Array.from({length:205},(_,i)=>({id:`page-${i}`,siteId:site.id,slug:`page-${i}`}));
  const f=fixture({pages,pageFault:(result:any,input:any)=>fail==='stalled'?{...result,items:[]} : fail==='foreign'?{...result,items:result.items.map((item:any)=>({...item,siteId:'foreign'}))}:fail==='changed-total'&&input.offset?{...result,pagination:{...result.pagination,total:206}}:fail==='duplicate'&&input.offset?{...result,items:result.items.map((item:any,index:number)=>index===0?pages[0]:item)}:result});
  const payload={name:'Entries',slug:'entries',fields:collection.fields};const result=await f.call(path,method,path==='import'?{collections:[payload]}:payload);assert.equal(result.status,503);assert.equal(result.body.error.code,'COLLECTION_INVENTORY_INCOMPLETE');assert.equal(f.effects.writes,0);
});
await check('record create refuses incomplete uniqueness inventory before mutation',async()=>{const f=fixture({unique:true,fault:(result:any)=>({...result,items:[],pagination:{...result.pagination,hasMore:true}})});const result=await f.call('records','POST',{slug:'fresh',values:{title:'Fresh'}});assert.equal(result.status,503);assert.equal(result.body.error.code,'COLLECTION_INVENTORY_INCOMPLETE');assert.equal(f.effects.writes,0);});
for (const demo of [false,true]) await check(`incomplete CSV fails closed ${demo}`, async () => { const f = fixture({ demo, fault: (result: any) => ({ ...result, items: [], pagination: { ...result.pagination, hasMore: true } }) }); const result = await f.call('records','GET',undefined,'?format=csv'); assert.equal(result.status,409); });
for (const records of [[null], [{ slug: 'kept', values: {} }, {}], [{ slug: 'bad-status', status: 'unknown', values: {} }], [{ slug: 'bad-values', values: [] }]]) await check('schema import rejects lossy record input before write', async () => { const f = fixture(); const result = await f.call('import','POST',{ collections: [{ name: 'Entries',slug:'entries',fields:collection.fields,records }] }); assert.equal(result.status,400); assert.equal(f.effects.writes,0); });
await check('CSV importer verifies scoped media instead of admitting missing asset',async()=>{const f=fixture({media:true});const result=await f.call('csvimport','POST','slug,title,asset\nfresh,Fresh,foreign-asset');assert.equal(result.status,200);assert.equal(result.body.data.import.skipped,1);assert.equal(f.effects.writes,0);assert(f.effects.reads.some(input=>input.siteId===site.id&&input.mediaId==='foreign-asset'));});
await check('CSV uniqueness inventory completes before any row write',async()=>{const f=fixture({unique:true,fault:(result:any)=>({...result,items:[],pagination:{...result.pagination,hasMore:true}})});const result=await f.call('csvimport','POST','slug,title\nfresh,Fresh');assert.equal(result.status,503);assert.equal(result.body.error.code,'COLLECTION_INVENTORY_INCOMPLETE');assert.equal(f.effects.writes,0);});
const storageUniqueFailure = () => Object.assign(new Error('Private storage message must not leak'), {code:'COLLECTION_RECORD_VALIDATION',details:[{field:'title',code:'unique',message:'Title must be unique.',privateExtension:'must-not-leak'}]});
await check('CSV post-preflight storage unique collision is a skipped row, preserving row partial success',async()=>{const f=fixture();let calls=0;const create=f.repositories.collections.createRecord;f.repositories.collections.createRecord=async(input:any)=>{if(calls++===0)throw storageUniqueFailure();return create(input);};const result=await f.call('csvimport','POST','slug,title\ncollision,Collision\nkept,Kept');assert.equal(result.status,200);assert.equal(result.body.data.import.skipped,1);assert.equal(result.body.data.import.created,1);assert.equal(result.body.data.import.errors[0].details[0].code,'unique');assert.equal(f.effects.writes,1);assert(!JSON.stringify(result.body).includes('Private storage'));assert(!JSON.stringify(result.body).includes('privateExtension'));});
await check('schema import typed late validation returns safe400 details object',async()=>{const f=fixture();f.repositories.collections.applyImport=async()=>{throw storageUniqueFailure();};const result=await f.call('import','POST',{collections:[{name:'Entries',slug:'entries',fields:collection.fields,records:[{slug:'fresh',values:{title:'Fresh'}}]}]});assert.equal(result.status,400);assert.equal(result.body.error.code,'VALIDATION_ERROR');assert.equal(result.body.error.details.issues[0].code,'unique');assert.equal(f.effects.writes,0);assert(!JSON.stringify(result.body).includes('Private storage'));});
await check('public create typed storage collision returns safe400 without content write',async()=>{const f=fixture();Object.assign(f.selectedCollection,{status:'published',permissions:{publicRead:true,publicCreate:true}});f.repositories.collections.createRecord=async()=>{throw storageUniqueFailure();};const result=await f.call('publicrecords','POST',{slug:'fresh',values:{title:'Fresh'}});assert.equal(result.status,400);assert.equal(result.body.error.code,'VALIDATION_ERROR');assert.equal(result.body.error.details[0].code,'unique');assert.equal(f.effects.writes,0);assert(!JSON.stringify(result.body).includes('Private storage'));});
const validation = helper('collectionRecordValidation', { '@/lib/backyStore': { validateCollectionRecordValues: () => [], normalizeCollectionRecordValues: (_c:any,values:any) => values }, '@/lib/collectionInventory': helper('collectionInventory', { './collectionExportPagination': helper('collectionExportPagination') }) });
await check('unique inventory detects later record', async () => { const rows = Array.from({length:205},(_,i) => row(i)); const issues = await validation.validateRepositoryCollectionRecordValues({ siteId: site.id, collection: {...collection,fields:[{...collection.fields[0],unique:true}]},values:{title:'Title 204'},repository:{listRecords:async(input:any)=>page(rows,input)} }); assert.equal(issues[0]?.code,'unique'); });
await check('unique inventory refuses stalled evidence', async () => { await assert.rejects(validation.validateRepositoryCollectionRecordValues({ siteId:site.id,collection:{...collection,fields:[{...collection.fields[0],unique:true}]},values:{title:'New'},repository:{listRecords:async()=>({items:[],pagination:{total:205,limit:100,offset:0,hasMore:true}})} })); });
await check('actual demo create/edit/export/import retains editable values and canonical scopes', async () => {
  const cwd=process.cwd(), directory=mkdtempSync(join(tmpdir(),'backy-collection-authoring-'));
  process.chdir(directory);
  try {
    const storeModule=await import('../src/lib/backyStore.ts'),store=storeModule.default || storeModule;
    const designModule=await import('../src/lib/frontendDesignContract.ts'),design=designModule.default || designModule;
    const a=store.createAdminSite({id:'collection-roundtrip-a',slug:'collection-roundtrip-a',name:'A'});
    const b=store.createAdminSite({id:'collection-roundtrip-b',slug:'collection-roundtrip-b',name:'B'});
    const schema=store.createAdminCollection(a.id,{slug:'editable-entries',name:'Entries',fields:collection.fields,metadata:{extension:{nested:['keep',false,0]}}});
    const inventory=helper('collectionInventory',{'./collectionExportPagination':helper('collectionExportPagination')});
    const mocks:any={
      'next/server':{NextResponse},'@/lib/collectionDefinitionVersion':helper('collectionDefinitionVersion'),
    '@/lib/collectionRecordVersion':helper('collectionRecordVersion'),'@/lib/collectionRecordAdmission':helper('collectionRecordAdmission'),'@/lib/backyStore':store,'@/lib/frontendDesignContract':design,
      '@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'fixture-owner'}}})},
      '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>true},
      '@/lib/adminCommerceCollectionAccess':{requireCommerceCollectionAccess:async()=>null,requireCommerceCollectionSlugAccess:async()=>null},
      '@/lib/adminAudit':{recordAdminAudit:async()=>({})},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({})},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>({})},
      '@/lib/collectionExportPagination':helper('collectionExportPagination'),'@/lib/collectionInventory':inventory,
      '@/lib/collectionRecordValidation':helper('collectionRecordValidation',{'@/lib/backyStore':store,'@/lib/collectionInventory':inventory}),
      '@/lib/adminCollectionFields':helper('adminCollectionFields'),'@/lib/collectionRoutes':helper('collectionRoutes'),
      '@/lib/orderInventoryRestore':helper('orderInventoryRestore',{'@/lib/backyStore':store}),
      '@/lib/routeConflicts':helper('routeConflicts',{'./collectionRoutes':helper('collectionRoutes')}),
    };
    mocks['@/lib/collectionImportPreparation']=helper('collectionImportPreparation',{'@/lib/backyStore':store,'@/lib/collectionRecordValidation':mocks['@/lib/collectionRecordValidation'],'@/lib/collectionInventory':inventory,'@/lib/routeConflicts':mocks['@/lib/routeConflicts']});
    async function call(relative:string,method:string,params:any,body?:any,query=''){
      const handler=load(`../src/app/api/admin/sites/[siteId]/collections${relative}/route.ts`,mocks);
      const response=await handler[method](new NextRequest(`http://fixture.invalid/api/admin/sites/${params.siteId}/collections${query}`,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})}),{params:Promise.resolve(params)});
      return{status:response.status,body:await response.json()};
    }
    const values={title:'Editable',design:{elements:[{id:'section',type:'section',x:10,y:20,width:1200,height:600,responsive:{mobile:{x:3,width:375}},children:[{id:'figure',type:'codeComponent',componentKey:'fixture.chart',version:'2.1.0',props:{count:4},controls:[{key:'count',type:'number'}]}]}],canvasSize:{width:1200,height:600,layout:'fluid'},assets:{fonts:[{id:'font-fixture'}]},animations:{entry:{type:'fade'}},dataBindings:[{collectionId:schema.id,fieldKey:'title'}],editableMap:[{elementId:'figure',field:'props.count'}]},frontendDesignTokens:{fonts:{body:'Fixture Serif'},colors:{paper:'#fafafa'}},extension:{nested:[null,false,0,{keep:true}]}};
    const created=await call('/[collectionId]/records','POST',{siteId:a.slug,collectionId:schema.id},{slug:'editable',values});
    assert.equal(created.status,201);const record=created.body.data.record;
    const saved=await call('/[collectionId]/records/[recordId]','PATCH',{siteId:a.id,collectionId:schema.id,recordId:record.id},{values:{title:'Retitled'}});
    assert.equal(saved.status,200,'saved '+JSON.stringify(saved.body.error));assert.deepEqual(saved.body.data.record.values.design,values.design);assert.deepEqual(saved.body.data.record.values.extension,values.extension);
    const wrongSite=await call('/[collectionId]/records/[recordId]','GET',{siteId:b.id,collectionId:schema.id,recordId:record.id});assert.equal(wrongSite.status,404);
    const exported=await call('/export','GET',{siteId:a.id},undefined,`?ids=${schema.id}`);assert.equal(exported.status,200,'exported '+JSON.stringify(exported.body.error));
    const cloned=await call('/import','POST',{siteId:b.slug},exported.body);assert.equal(cloned.status,200,'cloned '+JSON.stringify(cloned.body.error));
    const schemaB=store.getCollectionByIdOrSlug(b.id,schema.slug,{includeUnpublished:true});assert(schemaB);assert.deepEqual(schemaB.metadata,schema.metadata);
    const reopened=store.getCollectionRecordByIdOrSlug(b.id,schemaB.id,'editable',{includeUnpublished:true});assert(reopened);assert.equal(reopened.siteId,b.id);assert.equal(reopened.collectionId,schemaB.id);assert.deepEqual(reopened.values.design,values.design);assert.deepEqual(reopened.values.frontendDesignTokens,values.frontendDesignTokens);assert.deepEqual(reopened.values.extension,values.extension);
    const invalid=await call('/import','POST',{siteId:b.id},{collections:[{name:'Invalid batch',slug:'invalid-batch',fields:[{...collection.fields[0],required:true}],records:[{slug:'valid',values:{title:'First'}},{slug:'invalid',values:{}}]}]});
    assert.equal(invalid.status,400);assert.equal(store.getCollectionByIdOrSlug(b.id,'invalid-batch',{includeUnpublished:true}),undefined,'late validation must not retain a partial imported collection');
    const expectation=()=>({input:{name:schemaB.name,slug:schemaB.slug,fields:schemaB.fields},expectedCollection:store.getCollectionByIdOrSlug(b.id,schemaB.id,{includeUnpublished:true}),expectedRecords:store.listCollectionRecords(b.id,schemaB.id,{includeUnpublished:true,limit:100}).records,records:[{input:{slug:reopened.slug,status:reopened.status,values:{...reopened.values,title:'Import update'}},expectedRecord:store.getCollectionRecordByIdOrSlug(b.id,schemaB.id,reopened.id,{includeUnpublished:true})}]});
    const stale=expectation();store.updateAdminCollectionRecord(b.id,schemaB.id,reopened.id,{values:{title:'Author wins'}});
    assert.throws(()=>store.applyAdminCollectionImport(b.id,[stale] as never),(error:any)=>error.code==='COLLECTION_IMPORT_CONFLICT','stale demo import must throw');assert.equal(store.getCollectionRecordByIdOrSlug(b.id,schemaB.id,reopened.id,{includeUnpublished:true})!.values.title,'Author wins');
    const fresh=expectation(),snapshot=readFileSync(join(directory,'data/backy/admin-content.json'),'utf8');
    const contentDirectory=join(directory,'data/backy');chmodSync(contentDirectory,0o500);
    try{assert.throws(()=>store.applyAdminCollectionImport(b.id,[fresh] as never),/EACCES|EPERM/,'strict disk failure must throw');}finally{chmodSync(contentDirectory,0o700);}
    assert.equal(readFileSync(join(directory,'data/backy/admin-content.json'),'utf8'),snapshot);assert.equal(store.getCollectionRecordByIdOrSlug(b.id,schemaB.id,reopened.id,{includeUnpublished:true})!.values.title,'Author wins');
  } finally { process.chdir(cwd);rmSync(directory,{recursive:true,force:true}); }
});
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
console.log(`Collection authoring handlers: ${passed} passed, ${failures.length} failed (fixture repositories + actual temporary demo store; no providers)`);
