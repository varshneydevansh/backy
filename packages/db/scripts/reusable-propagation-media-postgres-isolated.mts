// Atomic reusable propagation media admission acceptance on an owned socket-only PostgreSQL cluster.
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
const {createDatabaseAdapter}=require('../src/adapters/index.ts');
const adapters:any[]=[];
const {NextRequest,NextResponse}=require('next/server');

let checks=0;
function equal(actual:any,expected:any,label=''){assert.deepEqual(actual,expected,label);checks++;}
if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-reusable-propagation-media-postgres-');
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
  await Promise.allSettled([...clients.map(client => client.end({ timeout: 2 })),...adapters.map(adapter=>adapter.close())]);
  // The only directory we may stop/remove was created by this invocation.
  assert(/^\/tmp\/backy-reusable-propagation-media-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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

 const sql=connection('reusable-propagation-media-monitor'),dsql=require('drizzle-orm').sql,isolationEvidence:any[]=[];
 const bundle=async()=>{const adapter=await createDatabaseAdapter({type:'postgres',url:`postgresql://${username}@localhost:${port}/postgres?host=${encodeURIComponent(socket)}`});adapters.push(adapter);const traced=new Proxy(adapter.db,{get(target:any,key,receiver){if(key==='transaction')return(operation:any,config:any)=>target.transaction(async(tx:any)=>{const observed=await tx.execute(dsql`SELECT current_setting('transaction_isolation') AS isolation`);isolationEvidence.push({configured:config?.isolationLevel||null,actual:observed.rows[0].isolation});return operation(tx);},config);const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}});return createDatabaseRepositories({adapter:{...adapter,db:traced}});};
 const raw=await bundle(),guardRaw=await bundle(),runtime=editorMediaRuntimeFixture(raw);
 const team=(await raw.teams.create({name:'Disposable reusable media proof',slug:'reusable-media-proof',ownerId:null})).item;
 const createSite=async(slug:string)=>(await raw.sites.create({teamId:team.id,name:slug,slug,status:'draft',settings:{}})).item;
 const site=await createSite('reusable-media-proof'),other=await createSite('other-media-proof'),capacity=await createSite('capacity-media-proof');
 const media=async(siteId:string,name:string)=>(await raw.media.create({siteId,filename:name+'.png',originalName:name+'.png',type:'image',mimeType:'image/png',size:128,url:'/fixture/'+name+'.png',metadata:{scope:'global',visibility:'public',authored:{keep:[false,0,null]}}})).item;
 const firstMedia=await media(site.id,'first'),secondMedia=await media(site.id,'second'),foreignMedia=await media(other.id,'foreign');
 const sourceContent=(asset:any)=>({elements:[{id:'source-root',type:'image',props:{assetId:asset.id,src:asset.url},unknown:{keep:[false,0,null]}}],extension:{preserve:true}});
 let section=(await raw.reusableSections.create({siteId:site.id,name:'Managed image section',slug:'managed-image-section',content:sourceContent(firstMedia),metadata:{extension:{keep:[false,0,null]}}})).item;
 const content={elements:[{id:'linked-image',type:'image',x:40,y:60,width:300,height:200,props:{src:'/unmanaged/old.png',reusableSection:{sectionId:section.id,mode:'synced',sourceUpdatedAt:'old'}},unknown:{authorKeep:[false,0,null]}}],extension:{keep:[false,0,null]}};
 const page=(await raw.pages.create({siteId:site.id,title:'Linked page',slug:'linked-page',status:'draft',content})).item;
 const post=(await raw.posts.create({siteId:site.id,title:'Linked post',slug:'linked-post',status:'draft',content})).item;
 const products=(await raw.collections.create({siteId:site.id,name:'Products',slug:'products',fields:[]})).item;
 const product=(await raw.collections.createRecord({siteId:site.id,collectionId:products.id,slug:'linked-product',status:'draft',values:{title:'Linked product',price:42,extension:{keep:[false,0,null]},frontendDesignElements:content.elements}})).item;
 let beforeNative:(()=>Promise<void>)|undefined;const exposed={...runtime,reusableSections:{...runtime.reusableSections,applyPropagation:async(...args:any[])=>{const hook=beforeNative;beforeNative=undefined;if(hook)await hook();return runtime.reusableSections.applyPropagation(...args);}}};
 const effects={audit:0,cache:0,webhook:0,postcommitMedia:0};
 const obsolete=async()=>{effects.postcommitMedia++;throw Error('Obsolete postcommit media indexing must not be required');};
 const mocks:any={
  'next/server':{NextResponse},'@/lib/adminAccess':{requireAdminAccess:async(_request:any,_id:any,options:any)=>{assert(['pages.edit','collections.edit','commerce.edit'].includes(options.permission));return{session:{user:{id:'synthetic-owner'}}};}},
  '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>exposed},'@/lib/backyStore':{},
  '@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>{effects.cache++;return{};}},'@/lib/adminAudit':{recordAdminAudit:async()=>{effects.audit++;return{};}},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>{effects.webhook++;return{};}},
  '@/lib/repositoryMediaReferenceSync':{syncRepositoryPageMediaReferences:obsolete,syncRepositoryPostMediaReferences:obsolete,syncRepositoryCollectionRecordMediaReferences:obsolete},
 };
 let route=load('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts',mocks);
 async function call(body:any){const response=await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/reusable-sections/${section.id}/instances`,{method:'POST',headers:{'content-type':'application/json','x-request-id':'reusable-media-native-proof'},body:JSON.stringify(body)}),{params:Promise.resolve({siteId:site.id,sectionId:section.id})});return{status:response.status,body:await response.json()};}
 const preview=async(targetType='all')=>{const result=await call({targetType,dryRun:true});equal(result.status,200,JSON.stringify(result.body));equal(result.body.data.totals.targets,targetType==='all'?3:1);return result.body.data.reviewedPreview;};
 const revisions=async()=>({page:(await raw.contentWorkflows.listRevisions({siteId:site.id,targetType:'page',targetId:page.id})).items,post:(await raw.contentWorkflows.listRevisions({siteId:site.id,targetType:'post',targetId:post.id})).items});
 const docs=async()=>({page:await raw.pages.getById(site.id,page.id),post:await raw.posts.getById(site.id,post.id),product:await raw.collections.getRecordById(site.id,products.id,product.id)});
 const snapshot=async()=>JSON.stringify({docs:await docs(),revisions:await revisions(),first:await raw.media.getById(site.id,firstMedia.id),second:await raw.media.getById(site.id,secondMedia.id)});
 const setSource=async(asset:any)=>section=(await raw.reusableSections.update(site.id,section.id,{content:sourceContent(asset),expectedSection:section})).item;
 const assertIndices=async(asset:any,expected:boolean)=>{const current=await raw.media.getById(site.id,asset.id);equal(current.pageIds.includes(page.id),expected);equal(current.postIds.includes(post.id),expected);equal((current.metadata.bindings||[]).some((binding:any)=>binding.scope==='collectionRecord'&&binding.targetId===product.id&&binding.collectionId===products.id),expected);equal(current.metadata.authored,{keep:[false,0,null]});};
 // Countercontrol: ordinary writer hits native failure and rolls back content+history.
 await sql.unsafe(`CREATE FUNCTION fixture_reject_reusable_media_index() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->'pageIds' IS DISTINCT FROM OLD.metadata->'pageIds' THEN RAISE EXCEPTION 'Synthetic native media index rejection'; END IF; RETURN NEW; END $$;CREATE TRIGGER fixture_reject_reusable_media_index BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_reject_reusable_media_index()`);
 const ordinaryBefore=await snapshot();await assert.rejects(runtime.pages.update(site.id,page.id,{content:sourceContent(firstMedia),expectedContent:page.content,expectedUpdatedAt:page.updatedAt,beforeUpdateRevision:{snapshot:page,operation:'update',note:'Ordinary control'}}));checks++;equal(await snapshot(),ordinaryBefore);
 await sql.unsafe('DROP TRIGGER fixture_reject_reusable_media_index ON media;DROP FUNCTION fixture_reject_reusable_media_index()');
 // Every essential index failure (including a late product binding) must roll
 // back all earlier target writes, source baselines, indexes and revisions.
 for(const target of ['page','post','product']){
  const key=target==='page'?'pageIds':target==='post'?'postIds':'bindings';
  await sql.unsafe(`CREATE FUNCTION fixture_reject_reusable_media_index() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->'${key}' IS DISTINCT FROM OLD.metadata->'${key}' THEN RAISE EXCEPTION 'Synthetic native media index rejection'; END IF; RETURN NEW; END $$;CREATE TRIGGER fixture_reject_reusable_media_index BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_reject_reusable_media_index()`);
  const reviewedPreview=await preview(),before=await snapshot(),priorEffects=JSON.stringify(effects),result=await call({targetType:'all',reviewedPreview});
  equal(result.status,500,JSON.stringify(result.body));equal(await snapshot(),before,`${target} failure full rollback`);equal(JSON.stringify(effects),priorEffects,'No postcommit followups after rollback');equal(JSON.stringify(result.body).includes('Synthetic native'),false);
  await sql.unsafe('DROP TRIGGER fixture_reject_reusable_media_index ON media;DROP FUNCTION fixture_reject_reusable_media_index()');
 }
 await sql.unsafe(`CREATE FUNCTION fixture_require_reusable_serializable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'Propagation lost SERIALIZABLE isolation'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fixture_reusable_serializable_page BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION fixture_require_reusable_serializable();CREATE TRIGGER fixture_reusable_serializable_post BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION fixture_require_reusable_serializable();CREATE TRIGGER fixture_reusable_serializable_product BEFORE UPDATE ON content_collection_records FOR EACH ROW EXECUTE FUNCTION fixture_require_reusable_serializable()`);
 // Missing/foreign identities in each selected target refuse atomically.
 for(const invalid of [foreignMedia,{id:randomUUID(),url:'/fixture/missing.png'}])for(const targetType of ['page','post','product']){
  await setSource(invalid);const reviewedPreview=await preview(targetType),before=await snapshot(),priorEffects=JSON.stringify(effects),result=await call({targetType,reviewedPreview});equal(result.status,400,JSON.stringify(result.body));equal(result.body.error.code,'INVALID_EDITOR_MEDIA_REFERENCE');equal(await snapshot(),before);equal(JSON.stringify(effects),priorEffects);
 }
 await setSource(firstMedia);
 // Held independent deletion guard blocks propagation before content/revisions.
 let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),hold=new Promise<void>(resolve=>release=resolve);
 const holding=guardRaw.media.withStorageMutationLock(site.id,async()=>{entered();await hold;});await ready;
 try{
  const reviewedPreview=await preview(),before=await snapshot(),priorEffects=JSON.stringify(effects);
  await assert.rejects(runtime.pages.update(site.id,page.id,{content:sourceContent(secondMedia)}),(error:any)=>error.code==='MEDIA_STORAGE_MUTATION_BUSY');checks++;
  const result=await call({targetType:'all',reviewedPreview});equal(result.status,503,JSON.stringify(result.body));equal(result.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');equal(await snapshot(),before);equal(JSON.stringify(effects),priorEffects);
  const otherPage=(await runtime.pages.create({siteId:other.id,title:'Independent progress',slug:'independent-progress',status:'draft',content:sourceContent(foreignMedia)})).item;equal(otherPage.siteId,other.id);equal((await raw.media.getById(other.id,foreignMedia.id)).pageIds.includes(otherPage.id),true);
 }finally{release();await holding;}
 // Actual success requires zero obsolete indexing calls, even with throwing stubs.
 let result=await call({targetType:'all',reviewedPreview:await preview()});equal(result.status,200,JSON.stringify(result.body));equal(result.body.data.outcome,'complete');equal(effects.postcommitMedia,0);await assertIndices(firstMedia,true);
 const committed=await docs();for(const node of [committed.page.content.elements[0],committed.post.content.elements[0],committed.product.values.frontendDesignElements[0]]){equal(node.props.assetId,firstMedia.id);equal(node.props.reusableSection.sourceUpdatedAt,section.updatedAt);equal(node.x,40);equal(node.y,60);}
 equal(committed.product.values.price,42);equal(committed.product.values.extension,{keep:[false,0,null]});const history=await revisions();equal(history.page.length,1);equal(history.post.length,1);
 await setSource(secondMedia);result=await call({targetType:'all',reviewedPreview:await preview()});equal(result.status,200);await assertIndices(firstMedia,false);await assertIndices(secondMedia,true);
 // The independent author transactions below intentionally use their ordinary
 // isolation. The triggers above have certified the actual propagation writes;
 // retain transaction tracing while allowing those author preimages to commit.
 await sql.unsafe('DROP TRIGGER fixture_reusable_serializable_page ON pages;DROP TRIGGER fixture_reusable_serializable_post ON blog_posts;DROP TRIGGER fixture_reusable_serializable_product ON content_collection_records;DROP FUNCTION fixture_require_reusable_serializable()');
 // Same-timestamp author edits interleaved after HTTP review still win native CAS.
 for(const change of ['source','page','post','product','inventory']){
  const reviewedPreview=await preview(),before=await snapshot(),priorEffects=JSON.stringify(effects);let afterAuthor:string|undefined;
  beforeNative=async()=>{if(change==='source')await sql`UPDATE reusable_sections SET content=jsonb_set(content,'{extension,authorWinner}','true'::jsonb) WHERE id=${section.id}`;else if(change==='inventory')await raw.pages.create({siteId:site.id,title:'Late inventory',slug:'late-inventory',status:'draft',content:{elements:[]}});else if(change==='product')await sql`UPDATE content_collection_records SET values=jsonb_set(values,'{authorWinner}','true'::jsonb) WHERE id=${product.id}`;else await sql.unsafe(`UPDATE ${change==='page'?'pages':'blog_posts'} SET content=jsonb_set(content,'{extension,authorWinner}','true'::jsonb) WHERE id=$1`,[change==='page'?page.id:post.id]);afterAuthor=await snapshot();};
  result=await call({targetType:'all',reviewedPreview});equal(result.status,409,JSON.stringify(result.body));equal(result.body.error.code,'REUSABLE_SECTION_PROPAGATION_CONFLICT');equal(await snapshot(),afterAuthor,'Concurrent author preimage retained');equal(JSON.stringify(effects),priorEffects);
  if(change==='source')section=await raw.reusableSections.getById(site.id,section.id);
  if(change==='inventory'){const late=await raw.pages.getBySlug(site.id,'late-inventory');await raw.pages.delete(site.id,late.id);}
 }
 // Global two-admission cap remains finite and refuses the third without writes.
 let releaseCapacity!:()=>void;const capacityHold=new Promise<void>(resolve=>releaseCapacity=resolve);let admissions=0,capacityReady!:()=>void;const bothReady=new Promise<void>(resolve=>capacityReady=resolve);
 const occupy=async(siteId:string)=>raw.media.withStorageMutationLock(siteId,async()=>{if(++admissions===2)capacityReady();await capacityHold;});
 const leases=[occupy(other.id),occupy(capacity.id)];await bothReady;
 try{const reviewedPreview=await preview(),before=await snapshot(),priorEffects=JSON.stringify(effects);result=await call({targetType:'all',reviewedPreview});equal(result.status,503);equal(result.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY');equal(await snapshot(),before);equal(JSON.stringify(effects),priorEffects);}finally{releaseCapacity();await Promise.all(leases);}
 equal(isolationEvidence.some(entry=>entry.configured===null&&entry.actual==='read committed'),true,'Ordinary default isolation preserved');equal(isolationEvidence.filter(entry=>entry.configured==='serializable').every(entry=>entry.actual==='serializable'),true,'Top-level configured and actual SERIALIZABLE preserved');equal(isolationEvidence.some(entry=>entry.configured==='serializable'),true);equal(effects.postcommitMedia,0);
 const proof={schema:'backy.reusable-propagation-media-integrity-proof.v1',mode:'owned-socket-postgresql-native-node-pg',checks,isolationEvidence,controls:{pagePostProductIndexFailureFullRollback:true,contentRevisionsRollback:true,missingForeignDenied:true,heldDeleteGuardRefused:true,independentSiteProgress:true,twoAdmissionCapacity:true,validIndexCommit:true,oldIndexRemoval:true,sourceAndInventoryCasPreserved:true,noPostcommitIndexDependency:true},sources:['packages/core/src/repositories.ts','packages/db/src/repositories/reusable-sections.ts','apps/public/src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances/route.ts','apps/public/src/lib/repositoryRuntime.ts','packages/db/src/repositories/media-mutation-admission.ts'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(repositoryRoot,path))).digest('hex')})),configuredDatabaseUsed:false,providerCalls:0,productionWrites:0};
 const proofPath='/tmp/backy-reusable-propagation-media-integrity-proof.json';writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n',{mode:0o600});chmodSync(proofPath,0o600);console.log(`Atomic reusable propagation media native PostgreSQL PASS ${checks} assertions; actual reviewed handler, all3target rollback/validindices/deletionguard/capacity/CAS/SERIALIZABLE. ${proofPath}`);
}finally{await cleanup()}
