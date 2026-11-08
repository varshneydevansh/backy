// Invoked only by the owned socket-only native PostgreSQL runner.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { load } from './collection-import-postgres-handlers.mjs';
import { editorMediaRuntimeFixture } from './editor-media-runtime-fixture.mjs';
const require = createRequire(import.meta.url), { NextRequest, NextResponse } = require('next/server');
export async function verifyCollectionImportMediaPostgres({ repositories, competing, sql, site }) {
  const source = ts.createSourceFile('openapi.ts',readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true), schemas = new Map();
  function visit(node) { if(ts.isPropertyAssignment(node) && node.name.getText(source)==='schemas' && ts.isObjectLiteralExpression(node.initializer)) for(const property of node.initializer.properties) if(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name)||ts.isStringLiteral(property.name))) schemas.set(property.name.text,property.initializer); ts.forEachChild(node,visit); }
  visit(source); const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false}),loaded=new Set();
  function register(name) { if(loaded.has(name))return; loaded.add(name); assert(schemas.has(name),name);const value=vm.runInNewContext('('+schemas.get(name).getText(source)+')'); for(const match of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g))register(match[1]);ajv.addSchema(value,'#/components/schemas/'+name); }
  register('AdminCollectionsImportEnvelope'); const validateEnvelope=ajv.getSchema('#/components/schemas/AdminCollectionsImportEnvelope');
  const runtime = editorMediaRuntimeFixture(repositories);
  const effects = { audit: 0, cache: 0, webhook: 0 };
  let failFollowups = false, prepareRace = null;
  const mocks = target => ({
    'next/server': { NextRequest, NextResponse },
    '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'fixture-owner' } } }) },
    '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionSlugAccess: async () => null },
    '@/lib/backyStore': { validateCollectionRecordValueTypes: () => [], normalizeCollectionRecordValues: (_collection, values, previous) => ({ ...previous, ...values }), validateCollectionRecordValues: () => [] },
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => ({ ...target, collections: { ...target.collections, applyImport: async (...args) => { if (prepareRace) { const race = prepareRace; prepareRace = null; await race(); } return target.collections.applyImport(...args); } } }) },
    '@/lib/adminAudit': { recordAdminAudit: async () => { effects.audit++; if (failFollowups) throw new Error('Private audit failure'); return {}; } },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { effects.cache++; if (failFollowups) throw new Error('Private cache failure'); return {}; } },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { effects.webhook++; return failFollowups ? [{status:'failed', message:'Private webhook failure'}] : []; } },
  });
  const call = async (target, body, query = '') => {
    const route = load('../src/app/api/admin/sites/[siteId]/collections/import/route.ts', mocks(target));
    const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/collections/import${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ siteId: site.id }) });
    const result = {status:response.status,body:await response.json()}; if(response.status===200)assert(validateEnvelope(result.body),JSON.stringify(validateEnvelope.errors));return result;
  };
  const media = async name => (await repositories.media.create({ siteId: site.id, filename: name + '.png', originalName: name + '.png', type: 'image', mimeType: 'image/png', size: 128, url: '/fixture/' + name + '.png', metadata: { scope: 'global', visibility: 'public', custom: [false, 0, null] } })).item;
  const payload = (slug, asset, typed = false) => ({ collections: [{ name: slug, slug, fields: [{ id: 'picture', key: 'picture', label: 'Picture', type: typed ? 'image' : 'json' }], records: [{ slug: 'entry', status: 'published', values: { picture: typed ? asset.id : { mediaId: asset.id }, unknown: [false, 0, null] } }] }] });
  const binding = async asset => (await repositories.media.getById(site.id, asset.id)).metadata.bindings || [];
  const a = await media('import-late-index');
  await sql.unsafe(`CREATE FUNCTION fixture_import_index_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${a.id}'::uuid AND NEW.metadata->'bindings' IS DISTINCT FROM OLD.metadata->'bindings' THEN RAISE EXCEPTION 'Private fixture index rejection'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_import_index_failure BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_import_index_failure()`);
  let checks = 0;
  try {
    const failed = await call(runtime, payload('import-late-index', a));
    assert.equal(failed.status, 500); assert.equal(await repositories.collections.getBySlug(site.id, 'import-late-index'), null); assert.deepEqual(effects, {audit:0, cache:0, webhook:0}); assert.equal((await binding(a)).length, 0); assert(!JSON.stringify(failed.body).includes('Private fixture')); checks += 4;
  } finally { await sql.unsafe('DROP TRIGGER fixture_import_index_failure ON media; DROP FUNCTION fixture_import_index_failure()'); }
  const b = await media('import-typed');
  const typed = await call(runtime, payload('import-typed', b, true));
  assert.equal(typed.status, 200); assert.equal((await binding(b)).length, 1); assert.deepEqual((await repositories.media.getById(site.id, b.id)).metadata.custom, [false,0,null]); checks += 2;
  const c = await media('import-held');
  let entered, release;
  const acquired = new Promise(resolve => { entered = resolve; }), released = new Promise(resolve => { release = resolve; });
  const held = competing.withMediaReferenceMutation(site.id, async () => { entered(); await released; });
  await acquired;
  let contention;
  try { contention = await call(runtime, payload('import-held', c)); }
  finally { release(); await held; }
  assert.equal(contention.status, 503); assert.equal(contention.body.error.code, 'MEDIA_STORAGE_MUTATION_BUSY'); assert.equal(await repositories.collections.getBySlug(site.id, 'import-held'), null);
  const recovered = await call(runtime, payload('import-held', c)); assert.equal(recovered.status, 200); assert.equal((await binding(c)).length,1); checks += 2;
  // Preflight validation occurs before admission; delete the typed asset in that
  // precise gap. Admission must revalidate its ID and leave no imported schema.
  const d = await media('deleted-after-prepare');
  prepareRace = () => competing.media.delete(site.id, d.id);
  const deletedRace = await call(runtime, payload('deleted-after-prepare', d, true));
  assert.equal(deletedRace.status, 400); assert.equal(deletedRace.body.error.code, 'INVALID_EDITOR_MEDIA_REFERENCE'); assert.equal(await repositories.collections.getBySlug(site.id, 'deleted-after-prepare'), null); checks += 3;
  // A failure on the last row rolls back every earlier schema, record and index.
  const e = await media('whole-import-first'), f = await media('whole-import-last');
  await sql.unsafe(`CREATE FUNCTION fixture_import_last_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.id}'::uuid AND NEW.metadata->'bindings' IS DISTINCT FROM OLD.metadata->'bindings' THEN RAISE EXCEPTION 'Private last-row failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_import_last_failure BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_import_last_failure()`);
  try {
    const batch = {collections:[...payload('whole-first',e).collections,...payload('whole-last',f).collections]};
    const beforeEffects = structuredClone(effects), result = await call(runtime,batch);
    assert.equal(result.status,500); assert.equal(await repositories.collections.getBySlug(site.id,'whole-first'),null); assert.equal(await repositories.collections.getBySlug(site.id,'whole-last'),null); assert.equal((await binding(e)).length,0); assert.equal((await binding(f)).length,0); assert.deepEqual(effects,beforeEffects); checks += 6;
  } finally {await sql.unsafe('DROP TRIGGER fixture_import_last_failure ON media; DROP FUNCTION fixture_import_last_failure()');}
  // A bare file list and nested product design both contribute managed bindings;
  // external URLs are retained as authored, without becoming managed file IDs.
  const g = await media('gallery-one'), h = await media('gallery-two'), i = await media('design-image');
  const filesPayload = {collections:[{name:'Multi format',slug:'multi-format',fields:[{id:'files',key:'downloads',label:'Files',type:'file',validation:{multiple:true}}],records:[{slug:'entry',values:{'downloads':[g.id,h.id,'https://example.invalid/external.zip'],design:{elements:[{assetId:i.id}]},unknown:[false,0,null]}}]}]};
  const files = await call(runtime,filesPayload); assert.equal(files.status,200);
  for (const asset of [g,h,i]) assert.equal((await binding(asset)).length,1,`Expected binding for ${asset.filename}; imported fields=${JSON.stringify(files.body.data.collections[0].fields)}`);
  assert.deepEqual(files.body.data.records[0].values['downloads'],filesPayload.collections[0].records[0].values['downloads']); checks += 5;
  const updatedTyped = await call(runtime,payload('import-typed',c,true),'?upsert=true');
  assert.equal(updatedTyped.status,200); assert.equal(updatedTyped.body.data.import.updatedRecords,1); assert.equal((await binding(b)).length,0); assert.equal((await binding(c)).length,2); checks += 4;
  const uniquePayload = {collections:[{name:'Unique swap',slug:'unique-swap',fields:[{id:'label',key:'label',label:'Label',type:'text',unique:true}],records:[{slug:'first',values:{label:'A'}},{slug:'second',values:{label:'B'}}]}]};
  assert.equal((await call(runtime,uniquePayload)).status,200);
  const swap = structuredClone(uniquePayload); swap.collections[0].records[0].values.label='B'; swap.collections[0].records[1].values.label='A';
  const swapped = await call(runtime,swap,'?upsert=true'); assert.equal(swapped.status,200); assert.deepEqual(swapped.body.data.records.map(record=>record.values.label),['B','A']); checks += 3;
  const noPostcommitInventory = {...runtime,media:{...runtime.media,list:async()=>{throw new Error('Obsolete inventory must never run');}}};
  failFollowups = true;
  const warnings = await call(noPostcommitInventory,payload('committed-warnings',g));
  assert.equal(warnings.status,200); assert.equal(warnings.body.data.import.createdRecords,1); assert.deepEqual(warnings.body.data.completionWarnings,['COLLECTION_IMPORT_CACHE_INVALIDATION_PENDING','COLLECTION_IMPORT_AUDIT_PENDING','COLLECTION_IMPORT_WEBHOOK_DELIVERY_PENDING']); assert(!JSON.stringify(warnings.body).includes('Private')); assert.equal((await binding(g)).length,2); checks += 5;
  failFollowups = false;
  // A schema-only upsert preserves authored records while changing the meaning
  // of their media fields. Reconcile their final values without saving them.
  const retainedAsset = await media('retained-schema-image');
  const retainedPayload = {collections:[{name:'Retained schema',slug:'retained-schema',fields:[{id:'picture',key:'picture',label:'Picture',type:'text'}],records:[{slug:'preserved',values:{picture:retainedAsset.id,unknown:[false,0,null]}}]}]};
  const initialRetained = await call(runtime,retainedPayload);
  assert.equal(initialRetained.status,200);
  const retainedBefore = structuredClone(initialRetained.body.data.records[0]);
  const schemaOnly = structuredClone(retainedPayload);
  schemaOnly.collections[0].fields[0].type='image';
  schemaOnly.collections[0].records=[];
  const retainedImport = await call(runtime,schemaOnly,'?upsert=true');
  assert.equal(retainedImport.status,200);
  assert.equal((await binding(retainedAsset)).length,1,'Schema-only upsert must index preserved records');
  assert.equal(retainedImport.body.data.import.updatedRecords,0);
  assert.deepEqual(retainedImport.body.data.records,[]);
  assert.deepEqual(await repositories.collections.getRecordById(site.id,retainedBefore.collectionId,retainedBefore.id),retainedBefore);
  checks += 6;
  const retainedBindings = structuredClone(await binding(retainedAsset));
  const repeatRetained = await call(runtime,schemaOnly,'?upsert=true');
  assert.equal(repeatRetained.status,200);
  assert.deepEqual(await binding(retainedAsset),retainedBindings);
  assert.deepEqual(await repositories.collections.getRecordById(site.id,retainedBefore.collectionId,retainedBefore.id),retainedBefore);
  const removedField = structuredClone(schemaOnly);
  removedField.collections[0].fields=[];
  assert.equal((await call(runtime,removedField,'?upsert=true')).status,200);
  assert.equal((await binding(retainedAsset)).length,0);
  assert.deepEqual(await repositories.collections.getRecordById(site.id,retainedBefore.collectionId,retainedBefore.id),retainedBefore);
  checks += 6;
  // More than one API page of untouched rows, including two rows sharing the
  // same asset, must reconcile without lost bindings or content mutations.
  const sharedAsset = await media('retained-shared-image');
  const sharedPayload = {collections:[{name:'Shared retained',slug:'shared-retained',fields:[{id:'picture',key:'picture',label:'Picture',type:'text'}],records:Array.from({length:105},(_,index)=>({slug:'entry-'+index,values:{picture:sharedAsset.id}}))}]};
  const sharedInitial = await call(runtime,sharedPayload);
  assert.equal(sharedInitial.status,200);
  const sharedCollection = sharedInitial.body.data.collections[0];
  const originalRows = await sql`SELECT * FROM content_collection_records WHERE collection_id=${sharedCollection.id} ORDER BY id`;
  const sharedSchema = structuredClone(sharedPayload);
  sharedSchema.collections[0].fields[0].type='image'; sharedSchema.collections[0].records=[];
  const sharedResult = await call(runtime,sharedSchema,'?upsert=true');
  assert.equal(sharedResult.status,200);
  assert.equal((await binding(sharedAsset)).length,105);
  assert.equal(sharedResult.body.data.import.updatedRecords,0);
  assert.deepEqual(await sql`SELECT * FROM content_collection_records WHERE collection_id=${sharedCollection.id} ORDER BY id`,originalRows);
  checks += 5;
  // A supplied row's index is already patched when a retained-row index fails:
  // schema, supplied row, both reference indices and followups must roll back.
  const suppliedAsset = await media('supplied-before-retained-failure');
  const beforeSharedBindings = structuredClone(await binding(sharedAsset));
  await sql.unsafe(`CREATE FUNCTION fixture_retained_index_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${sharedAsset.id}'::uuid AND NEW.metadata->'bindings' IS DISTINCT FROM OLD.metadata->'bindings' THEN RAISE EXCEPTION 'Private retained index failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_retained_index_failure BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_retained_index_failure()`);
  try {
    const retype = structuredClone(sharedSchema); retype.collections[0].fields[0].type='text'; retype.collections[0].records=[{slug:'new-entry',values:{design:{mediaId:suppliedAsset.id}}}];
    const beforeEffects = structuredClone(effects), failedRetained = await call(runtime,retype,'?upsert=true');
    assert.equal(failedRetained.status,500);
    assert.equal((await repositories.collections.getById(site.id,sharedCollection.id)).fields[0].type,'image');
    assert.equal(await repositories.collections.getRecordBySlug(site.id,sharedCollection.id,'new-entry'),null);
    assert.deepEqual(await binding(sharedAsset),beforeSharedBindings);
    assert.equal((await binding(suppliedAsset)).length,0);
    assert.deepEqual(await sql`SELECT * FROM content_collection_records WHERE collection_id=${sharedCollection.id} ORDER BY id`,originalRows);
    assert.deepEqual(effects,beforeEffects);
    assert(!JSON.stringify(failedRetained.body).includes('Private retained'));
    checks += 8;
  } finally {await sql.unsafe('DROP TRIGGER fixture_retained_index_failure ON media; DROP FUNCTION fixture_retained_index_failure()');}
  // Retained managed references must belong to this site. A supplied correction
  // is evaluated using its final values instead of rejecting its old text ID.
  const foreignSite = (await repositories.sites.create({teamId:site.teamId,name:'Foreign import fixture',slug:'foreign-import-fixture',status:'draft'})).item;
  const foreignAsset = (await repositories.media.create({siteId:foreignSite.id,filename:'foreign.png',originalName:'foreign.png',type:'image',mimeType:'image/png',size:128,url:'/fixture/foreign.png'})).item;
  const invalidPayload = payload('retained-foreign',foreignAsset,true);
  invalidPayload.collections[0].fields[0].type='text'; invalidPayload.collections[0].records.push({slug:'missing',values:{picture:'00000000-0000-4000-8000-000000000001'}});
  const invalidInitial = await call(runtime,invalidPayload); assert.equal(invalidInitial.status,200);
  const invalidCollection = invalidInitial.body.data.collections[0];
  const invalidSchema = structuredClone(invalidPayload); invalidSchema.collections[0].fields[0].type='image'; invalidSchema.collections[0].records=[];
  const invalidEffects = structuredClone(effects), invalidRetained = await call(runtime,invalidSchema,'?upsert=true');
  assert.equal(invalidRetained.status,400); assert.equal(invalidRetained.body.error.code,'INVALID_EDITOR_MEDIA_REFERENCE');
  assert.equal((await repositories.collections.getById(site.id,invalidCollection.id)).fields[0].type,'text');
  assert.deepEqual(effects,invalidEffects);
  assert.equal(((await repositories.media.getById(foreignSite.id,foreignAsset.id)).metadata.bindings||[]).length,0);
  invalidSchema.collections[0].records=invalidPayload.collections[0].records.map(record=>({...record,values:{picture:retainedAsset.id}}));
  assert.equal((await call(runtime,invalidSchema,'?upsert=true')).status,200);
  assert.equal((await binding(retainedAsset)).length,2);
  checks += 8;
  for (const [slug,id] of [['only-missing','00000000-0000-4000-8000-000000000002'],['only-foreign',foreignAsset.id]]) {
    const single = {collections:[{name:slug,slug,fields:[{id:'picture',key:'picture',label:'Picture',type:'text'}],records:[{slug:'entry',values:{picture:id}}]}]};
    assert.equal((await call(runtime,single)).status,200);
    single.collections[0].fields[0].type='image'; single.collections[0].records=[];
    const result = await call(runtime,single,'?upsert=true');
    assert.equal(result.status,400); assert.equal(result.body.error.code,'INVALID_EDITOR_MEDIA_REFERENCE');
    assert.equal((await repositories.collections.getBySlug(site.id,slug)).fields[0].type,'text'); checks += 4;
  }
  const externalSchema = {collections:[{name:'External retained',slug:'external-retained',fields:[{id:'picture',key:'picture',label:'Picture',type:'text'}],records:[{slug:'entry',values:{picture:'https://example.invalid/photo.png',design:{assetId:retainedAsset.id}}}]}]};
  const externalInitial = await call(runtime,externalSchema); assert.equal(externalInitial.status,200);
  const externalBefore = structuredClone(externalInitial.body.data.records[0]);
  const nestedBindings = structuredClone(await binding(retainedAsset));
  externalSchema.collections[0].fields[0].type='image'; externalSchema.collections[0].records=[];
  assert.equal((await call(runtime,externalSchema,'?upsert=true')).status,200);
  assert.deepEqual(await binding(retainedAsset),nestedBindings);
  assert.deepEqual(await repositories.collections.getRecordById(site.id,externalBefore.collectionId,externalBefore.id),externalBefore); checks += 4;
  // The whole-record inventory CAS includes rows absent from the package.
  const staleEffects = structuredClone(effects);
  prepareRace = () => editorMediaRuntimeFixture(competing).collections.updateRecord(site.id,sharedCollection.id,sharedInitial.body.data.records[0].id,{values:{picture:sharedAsset.id,changed:true}});
  const staleRetained = await call(runtime,sharedSchema,'?upsert=true');
  assert.equal(staleRetained.status,409); assert.equal(staleRetained.body.error.code,'COLLECTION_IMPORT_CONFLICT'); assert.deepEqual(effects,staleEffects); checks += 3;
  writeFileSync('/tmp/backy-collection-import-media-acceptance-20261012.json', JSON.stringify({ schema: 'backy.collection-import-media-acceptance.v1', checks, wholeImportIndexRollback:true, typedManagedIdsIndexed:true, heldAdmissionRefused:true, deletedAfterPrepareRefused:true, committedFollowupWarnings:true, retainedSchemaReconciled:true, retainedRecordCount:105, retainedRowsAndCountersUnchanged:true, retainedIndexFailureRollsBackSuppliedWrites:true, missingAndForeignRetainedIdsIndividuallyRefused:true, retainedInventorySnapshotConflict:true, productionWrites:0, providerCalls:0 },null,2)+'\n',{mode:0o600});
  console.log(`Native import media acceptance passed ${checks} assertions. Actual database/handlers, synthetic identity and no provider bytes.`);
  return checks;
}
