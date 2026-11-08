// Real composition helper and runtime writer on an owned socket-only PostgreSQL cluster.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,writeFileSync,readFileSync,existsSync,rmSync,chmodSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {load} from '../../../apps/public/scripts/collection-import-postgres-handlers.mjs';
import {editorMediaRuntimeFixture} from '../../../apps/public/scripts/editor-media-runtime-fixture.mjs';
const require=createRequire(import.meta.url),schema=require('../src/schema/index.ts'),{createDatabaseRepositories}=require('../src/repositories/factory.ts'),core=require('@backy-cms/core');
const dsql=require('drizzle-orm').sql;
const {NextRequest,NextResponse}=require('next/server');
const isolationEvidence:any[]=[];
let checks=0;
function equal(actual:any,expected:any,label=''){assert.deepEqual(actual,expected,label);checks++;}
// Factory provider plumbing must refuse unsupported adapters before opening SQL.
for (const type of ['mysql', 'sqlite'] as const) {
 let transactions = 0, callbacks = 0;
 const unsupported = createDatabaseRepositories({ adapter: { type, db: { transaction: async () => { transactions++; throw Error('Unsupported database must not be queried'); } }, isConnected: async () => true, close: async () => {} } });
 await assert.rejects(unsupported.templateRevisions.withCompositionImportLock('synthetic-site', async () => { callbacks++; }), (error:any) => error.code === 'MEDIA_STORAGE_LOCK_UNAVAILABLE'); checks++;
 equal(transactions, 0); equal(callbacks, 0);
}
if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-composition-media-reference-postgres-');
const data = join(clusterRoot, 'cluster'), socket = join(clusterRoot, 'socket'), log = join(clusterRoot, 'postgres.log');
const port = randomInt(20000, 60000), username = 'backy_fixture', clients = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
// Postgres.js also reads PG* defaults directly. Clear them inside this test process only.
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || ['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)) delete process.env[key];
let cleanupPromise;
function run(binary, args, label) {
 try { return execFileSync(join(binaryDirectory, binary), args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); }
 catch (error) { throw new Error(`${label}: ${String(error.stderr || error.message).trim().split('\n').slice(-3).join(' ')}`); }
}
function cleanup() {
 return cleanupPromise ||= (async () => {
  await Promise.allSettled(clients.map(client => client.end({ timeout: 2 })));
  // The only directory we may stop/remove was created by this invocation.
  assert(/^\/tmp\/backy-composition-media-reference-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 5, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
 clients.push(client); return client;
};

try {
 run('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject'], 'Initializing owned temporary cluster');
 mkdirSync(socket, { mode: 0o700 });
 writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 20\n`);
 run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '15', 'start'], 'Starting owned socket-only cluster');
 const psql = ['-X', '--no-password', '-h', socket, '-p', String(port), '-U', username, '-d', 'postgres', '--set', 'ON_ERROR_STOP=1'];
 run('psql', [...psql, '-c', `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`], 'Bootstrapping isolated Supabase role/auth fixtures');
 const migrations = readdirSync(join(repositoryRoot, 'supabase/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
 for (const migration of migrations) run('psql', [...psql, '-f', join(repositoryRoot, 'supabase/migrations', migration)], `Applying actual ${migration}`);
 assert(migrations.includes('015_template_revision_history.sql'));
 assert(migrations.includes('016_explicit_operator_profile_provisioning.sql'));

 const sql=connection('composition-media-proof'),guardSql=connection('composition-media-guard');
 const bundle=(client:any)=>{
  const database=drizzle(client,{schema});
  const traced=new Proxy(database,{get(target,key,receiver){
   if(key==='transaction')return (operation:any,config:any)=>target.transaction(async(tx:any)=>{
    const observed=await tx.execute(dsql`select current_setting('transaction_isolation') as isolation`);
    isolationEvidence.push({configured:config?.isolationLevel||null,actual:observed[0].isolation});
    return operation(tx);
   },config);
   const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;
  }});
  return createDatabaseRepositories({adapter:{type:'postgres',db:traced,isConnected:async()=>true,close:async()=>{}}});
 };
 const raw=bundle(sql),guardRaw=bundle(guardSql),runtime=editorMediaRuntimeFixture(raw);
 const team=(await raw.teams.create({name:'Disposable composition media proof',slug:'composition-media-proof',ownerId:null})).item;
 const site=(await raw.sites.create({teamId:team.id,name:'Composition media proof',slug:'composition-media-proof',status:'draft',settings:{}})).item;
 const other=(await raw.sites.create({teamId:team.id,name:'Independent site',slug:'composition-media-other',status:'draft',settings:{}})).item;
 const third=(await raw.sites.create({teamId:team.id,name:'Capacity site',slug:'composition-media-third',status:'draft',settings:{}})).item;
 const asset=async(siteId:string,name:string)=>(await raw.media.create({siteId,filename:name+'.png',originalName:name+'.png',type:'image',mimeType:'image/png',size:128,url:'/fixture/'+name+'.png',metadata:{scope:'global',visibility:'public',authored:{keep:[false,0,null]}}})).item;
 const media=await asset(site.id,'existing'),foreign=await asset(other.id,'foreign');
 const content=(mediaId:string)=>({elements:[{id:'owned-image',type:'image',x:0,y:0,width:320,height:200,props:{assetId:mediaId,src:'/fixture/existing.png'},unknown:{keep:[false,0,null]},responsive:{mobile:{width:280}}}],canvasSize:{width:1200,height:800}});
 const helper=load('../src/lib/frontendCompositionImport.ts',{'./backyStore':{}});
 function requestFor(slug:string,mediaId=media.id,kind='page',design=false){
  const canvas=content(mediaId),frontendDesign=design?{schemaVersion:'backy.frontend-design.v1',status:'imported',source:{type:'manual'},tokens:{},chrome:{},templates:[{id:'composition-'+slug,name:'Concrete template',type:'page',content:canvas}]}:undefined;
  return helper.parseFrontendCompositionRequest({action:'review',composition:{schemaVersion:'backy.frontend-composition-import.v1',siteId:site.id,...(frontendDesign?{frontendDesign}:{}),routes:[{id:slug,type:kind==='page'?'page':'blogPost',path:(kind==='page'?'/':'/blog/')+slug,title:'Imported managed image',content:canvas}]},selection:[...(design?['design','template:composition-'+slug]:[]),'route:'+slug],acknowledgeUnverified:false}).request;
 }
 const review=async(request:any)=>helper.reviewFrontendComposition(request,await helper.readCompositionInventory(await runtime.sites.getById(site.id),runtime));
 const reviewed=async(request:any)=>{const result=await review(request);equal(result.canApply,true,JSON.stringify(result.issues));return {...request,action:'apply',reviewVersion:result.reviewVersion};};
 const apply=(request:any,id='composition-media-proof')=>helper.applyRepositoryFrontendComposition(request,site.id,runtime,{actorId:null,requestId:id});
 const snapshot=async()=>createHash('sha256').update(JSON.stringify(await sql`SELECT (SELECT jsonb_agg(s ORDER BY id) FROM sites s) AS sites,(SELECT jsonb_agg(p ORDER BY id) FROM pages p) AS pages,(SELECT jsonb_agg(b ORDER BY id) FROM blog_posts b) AS posts,(SELECT jsonb_agg(m ORDER BY id) FROM media m) AS media,(SELECT jsonb_agg(r ORDER BY id) FROM template_revisions r) AS templates,(SELECT jsonb_agg(r ORDER BY id) FROM content_revisions r) AS revisions,(SELECT jsonb_agg(a ORDER BY id) FROM activity_logs a) AS audit`)).digest('hex');
 // Late native index failures roll back design/history/content/index/audit together.
 await sql.unsafe(`CREATE FUNCTION fixture_reject_media_reference() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->'pageIds' IS DISTINCT FROM OLD.metadata->'pageIds' OR NEW.metadata->'postIds' IS DISTINCT FROM OLD.metadata->'postIds' THEN RAISE EXCEPTION 'Synthetic native media index rejection'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_media_reference BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_reject_media_reference()`);
 for(const kind of ['page','post']){
  const request=await reviewed(requestFor('index-rollback-'+kind,media.id,kind,true)),before=await snapshot();
  await assert.rejects(apply(request));checks++;equal(await snapshot(),before,'all persisted design/history/draft/index/audit remain unchanged on '+kind+' indexing failure');
  const ordinaryBefore=await snapshot();await assert.rejects(runtime[kind==='page'?'pages':'posts'].create({siteId:site.id,title:'Ordinary rejection',slug:'ordinary-rejection-'+kind,status:'draft',content:core.createBackyContentDocument({kind,title:'Ordinary rejection',elements:content(media.id).elements})}));checks++;equal(await snapshot(),ordinaryBefore,'ordinary admission unchanged');
 }
 await sql.unsafe('DROP TRIGGER fixture_reject_media_reference ON media; DROP FUNCTION fixture_reject_media_reference()');
 // Missing/foreign media remains blocked by actual composition review/apply, and
 // the admitted callback independently validates even if a caller skips review.
 for(const missing of [randomUUID(),foreign.id])for(const kind of ['page','post']){
  const request=requestFor('invalid-'+kind+'-'+missing.slice(0,8),missing,kind),r=await review(request),before=await snapshot();equal(r.canApply,false);assert(r.issues.some((i:any)=>i.code==='media.unresolved'));checks++;
  await assert.rejects(apply({...request,action:'apply',reviewVersion:r.reviewVersion}),(e:any)=>e.code==='COMPOSITION_REVIEW_BLOCKED');checks++;equal(await snapshot(),before);
  await assert.rejects(runtime.templateRevisions.withCompositionImportLock(site.id,(scoped:any)=>scoped[kind==='page'?'pages':'posts'].create({siteId:site.id,title:'Direct invalid',slug:'direct-invalid-'+kind,status:'draft',content:core.createBackyContentDocument({kind,title:'Direct invalid',elements:content(missing).elements})})),(e:any)=>e.code==='INVALID_EDITOR_MEDIA_REFERENCE');checks++;equal(await snapshot(),before);
 }
 // Wrong-site scoped writes refuse before SQL, including after an earlier legal
 // draft/index write; the earlier work rolls back with the enclosing transaction.
 for(const family of ['pages','posts','collections','templateRevisions']){
  const before=await snapshot();await assert.rejects(runtime.templateRevisions.withCompositionImportLock(site.id,async(scoped:any)=>{
   await scoped.pages.create({siteId:site.id,title:'Early rollback',slug:'early-scope-rollback',status:'draft',content:core.createBackyContentDocument({kind:'page',title:'Early rollback',elements:content(media.id).elements})});
   if(family==='templateRevisions')return scoped.templateRevisions.withCompositionImportLock(other.id,async()=>null);
   if(family==='collections')return scoped.collections.createRecord({siteId:other.id,collectionId:randomUUID(),values:{}});
   return scoped[family].create({siteId:other.id,title:'Wrong site',slug:'wrong-site',status:'draft',content:core.createBackyContentDocument({kind:family==='pages'?'page':'post',title:'Wrong site',elements:[]})});
  }),(e:any)=>e.code==='MEDIA_REFERENCE_SCOPE_MISMATCH');checks++;equal(await snapshot(),before);
 }
 // Native storage admission prevents composition writes; zero persisted drift.
 const blocked=await reviewed(requestFor('blocked-import')),beforeBusy=await snapshot();let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
 const holding=guardRaw.media.withStorageMutationLock(site.id,async()=>{entered();await hold;});await ready;
 try{await assert.rejects(apply(blocked),(e:any)=>e.code==='MEDIA_STORAGE_MUTATION_BUSY');checks++;equal(await snapshot(),beforeBusy);}finally{release();await holding;}
 // The same base-adapter bound is shared with storage: two held guards refuse a
 // third different-site composition before opening another transaction.
 const releases:Array<()=>void>=[],readySignals:Array<Promise<void>>=[];
 const reservations=[site.id,other.id].map((siteId,index)=>{let enter!:()=>void,finish!:()=>void;readySignals.push(new Promise<void>(r=>enter=r));const wait=new Promise<void>(r=>finish=r);releases.push(finish);return index===0?runtime.templateRevisions.withCompositionImportLock(siteId,async()=>{enter();await wait;}):raw.media.withStorageMutationLock(siteId,async()=>{enter();await wait;});});
 await Promise.all(readySignals);const beforeCapacity=await snapshot();try{await assert.rejects(runtime.templateRevisions.withCompositionImportLock(third.id,async()=>null),(e:any)=>e.code==='MEDIA_STORAGE_MUTATION_BUSY');checks++;equal(await snapshot(),beforeCapacity);}finally{releases.forEach(r=>r());await Promise.all(reservations);}
 // Successful page + blog imports retain exact authored data and their native indices.
 const draftIds:any={};for(const kind of ['page','post']){
  const result=await apply(await reviewed(requestFor('successful-'+kind,media.id,kind,true)),'successful-'+kind);equal(result.drafts.length,1);equal(result.publication,'draft-only');const item=await raw[kind==='page'?'pages':'posts'].getById(site.id,result.drafts[0].id);draftIds[kind]=item.id;
  equal(item.content.id,item.id);equal(item.status,'draft');equal(item.content.elements[0].props.assetId,media.id);equal(item.content.elements[0].unknown,{keep:[false,0,null]});equal(item.content.elements[0].responsive.mobile.width,280);
  equal((await raw.media.getById(site.id,media.id))[kind==='page'?'pageIds':'postIds'].includes(item.id),true);
 }
 equal((await raw.media.getById(site.id,media.id)).metadata.authored,{keep:[false,0,null]});
 const effects={provider:0,audit:0};const deletion=load('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts',{'next/server':{NextRequest,NextResponse},'@/lib/backyStore':{},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>runtime},'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-owner'}}})},'@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;}},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>[]},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{}},'@/lib/mediaStorage':{getMediaStoragePathFromMedia:()=>null,getMediaStorageAdapter:async()=>{effects.provider++;throw Error('Provider access forbidden');}}});
 const remove=async()=>{const response=await deletion.DELETE(new NextRequest('http://fixture.invalid/api/admin/sites/'+site.id+'/media/'+media.id,{method:'DELETE'}),{params:Promise.resolve({siteId:site.id,mediaId:media.id})});return{status:response.status,body:await response.json()};};
 let result=await remove();equal(result.status,409);equal(result.body.error.code,'MEDIA_IN_USE');equal(effects,{provider:0,audit:0});
 let acquired!:()=>void,finish!:()=>void;const started=new Promise<void>(r=>acquired=r),waiting=new Promise<void>(r=>finish=r);const importHolding=runtime.templateRevisions.withCompositionImportLock(site.id,async()=>{acquired();await waiting;});await started;
 try{result=await remove();equal(result.status,503);equal(result.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');equal(effects,{provider:0,audit:0});}finally{finish();await importHolding;}
 const serializable=isolationEvidence.filter(e=>e.configured==='serializable'),ordinary=isolationEvidence.filter(e=>e.configured===null);assert(serializable.length>0);checks++;equal(serializable.every(e=>e.actual==='serializable'),true,'actual current_setting proves top-level SERIALIZABLE preserved');assert(ordinary.length>0);checks++;equal(ordinary.every(e=>e.actual==='read committed'),true,'ordinary admission default unchanged');
 // Fresh review stale after unrelated author winner must refuse without overwriting it.
 const stale=await reviewed(requestFor('stale-import'));await raw.pages.create({siteId:site.id,title:'Author winner',slug:'author-winner',status:'draft',content:core.createBackyContentDocument({kind:'page',title:'Author winner',elements:[]})});const beforeStale=await snapshot();await assert.rejects(apply(stale),(e:any)=>e.code==='COMPOSITION_REVIEW_STALE');checks++;equal(await snapshot(),beforeStale);
 const proof={schema:'backy.composition-media-reference-source-proof.v1',checks,configuredDatabaseUsed:false,providerCalls:effects.provider,productionWrites:0,draftIds,isolationEvidence,sources:['apps/public/src/lib/repositoryRuntime.ts','packages/db/src/repositories/template-revisions.ts','packages/db/src/repositories/media-mutation-admission.ts'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(repositoryRoot,path))).digest('hex')}))};const path='/tmp/backy-composition-media-reference-source-proof.json';writeFileSync(path,JSON.stringify(proof,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);
 console.log(`Composition media reference native PASS ${checks}; actual helper/runtime/source factory, same transaction SERIALIZABLE current_setting, page/blog indices, missing/foreign/scoped refusal, full design/history/draft/index/audit rollback, shared capacity/storage/delete contention, stale review, exact authored retention. ${path}; disposable socket PostgreSQL only.`);
}finally{await cleanup()}
