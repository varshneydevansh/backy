#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import { serializeTemplateRevisionValue, unrelatedSiteSettingsPatch } from '../../core/dist/index.mjs';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-composition-postgres-');
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
  assert(/^\/tmp\/backy-composition-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const fingerprint = value => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 1, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
 clients.push(client); return client;
};
const bundle = client => createDatabaseRepositories({ adapter: { type: 'postgres', db: drizzle(client, { schema }), isConnected: async () => true, close: async () => {} } });
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

 const owner = connection('backy-history-lock-holder'), monitor = connection('backy-history-monitor'), sqlA = connection('backy-history-writer-a'), sqlB = connection('backy-history-writer-b');
 await Promise.all([owner`SELECT 1`, monitor`SELECT 1`, sqlA`SELECT 1`, sqlB`SELECT 1`]);
 const [identity] = await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(identity.current_user, username); assert.equal(identity.current_database, 'postgres'); assert.equal(identity.listeners, ''); assert.equal(identity.directory, data);
 const a = bundle(sqlA), b = bundle(sqlB);

 const {load}=await import('../../../apps/public/scripts/collection-import-postgres-handlers.mjs');
 const helper=load('../src/lib/frontendCompositionImport.ts',{'./backyStore':{}});
 const [team]=await owner`INSERT INTO public.teams(name,slug) VALUES ('Disposable composition team','composition-proof') RETURNING id`;
 const site=(await a.sites.create({teamId:team.id,name:'Composition proof',slug:'composition-proof',status:'draft',settings:{}})).item;
 const content={elements:[{id:'parent',type:'section',x:0,y:0,width:1200,height:300,props:{layoutMode:'flow'},children:[{id:'copy',type:'text',props:{content:'Editable imported text',extension:{keep:[false,0]}},responsive:{mobile:{width:320}},children:[]}]}],canvasSize:{width:1200,height:600},editableMap:{copy:{elementId:'copy',path:'props.content',type:'text'}},frontendRevision:{nested:{keep:true}}};
 const body={action:'review',composition:{schemaVersion:'backy.frontend-composition-import.v1',siteId:site.id,frontendDesign:{schemaVersion:'backy.frontend-design.v1',status:'imported',source:{type:'manual'},tokens:{},chrome:{},templates:[{id:'composition-template',name:'Concrete template',type:'page',content,extension:{keep:true}}]},routes:[{id:'parent',type:'page',path:'/proof',title:'Proof',content},{id:'child',type:'page',path:'/proof/child',title:'Child',content},{id:'article',type:'blogPost',path:'/blog/proof-post',title:'Article',content}]},selection:['design','template:composition-template','route:parent','route:child','route:article'],acknowledgeUnverified:false};
 const parsed=helper.parseFrontendCompositionRequest(body),context={actorId:null,requestId:'isolated-composition-proof'};
 const read=async()=>helper.readCompositionInventory(await a.sites.getById(site.id),a);
 let checks=0;
 const initial=await read(),review=helper.reviewFrontendComposition(parsed.request,initial);assert.equal(review.canApply,true,JSON.stringify(review.issues));assert.equal((await a.pages.list({siteId:site.id,includeUnpublished:true})).pagination.total,0);checks+=2;
 const apply={...parsed.request,action:'apply',reviewVersion:review.reviewVersion};
 // Late storage failure rolls back earlier template snapshots and page inserts in the same outer transaction.
 await owner.unsafe(`CREATE FUNCTION composition_reject_child() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.slug='child' THEN RAISE EXCEPTION 'Synthetic private failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER composition_reject_child BEFORE INSERT ON pages FOR EACH ROW EXECUTE FUNCTION composition_reject_child()`);
 await assert.rejects(helper.applyRepositoryFrontendComposition(apply,site.id,a,context));assert.equal((await a.pages.list({siteId:site.id,includeUnpublished:true})).pagination.total,0);assert.equal((await a.posts.list({siteId:site.id,includeUnpublished:true})).pagination.total,0);assert.equal((await a.templateRevisions.list({siteId:site.id})).pagination.total,0);assert.deepEqual((await a.sites.getById(site.id)).settings.frontendDesign,initial.site.settings.frontendDesign);checks+=5;
 await owner.unsafe('DROP TRIGGER composition_reject_child ON pages; DROP FUNCTION composition_reject_child()');
 // A concurrent author winner changes the full semantic inventory even without relying on a clock change.
 await b.pages.create({siteId:site.id,title:'Concurrent author',slug:'concurrent',status:'draft',content:{schemaVersion:'backy.content.v1',id:randomUUID(),kind:'page',version:'1',elements:[],editableMap:{}}});
 await assert.rejects(helper.applyRepositoryFrontendComposition(apply,site.id,a,context),error=>error.code==='COMPOSITION_REVIEW_STALE');assert.equal((await a.templateRevisions.list({siteId:site.id})).pagination.total,0);checks+=2;
 const fresh=helper.reviewFrontendComposition(parsed.request,await read());const success=await helper.applyRepositoryFrontendComposition({...apply,reviewVersion:fresh.reviewVersion},site.id,a,context);assert.equal(success.drafts.length,3);assert.equal(success.publication,'draft-only');checks+=2;
 const parent=await a.pages.getById(site.id,success.drafts[0].id),child=await a.pages.getById(site.id,success.drafts[1].id),post=await a.posts.getById(site.id,success.drafts[2].id);
 assert.equal(child.parentId,parent.id);assert.equal(parent.content.id,parent.id);assert.equal(post.content.id,post.id);assert.equal(parent.status,'draft');assert.equal(post.status,'draft');assert.deepEqual(parent.content.frontendRevision,content.frontendRevision);assert.deepEqual(parent.content.elements[0].children[0].props.extension,{keep:[false,0]});assert.equal((await a.templateRevisions.list({siteId:site.id})).pagination.total,1);checks+=8;
 await assert.rejects(helper.applyRepositoryFrontendComposition({...apply,reviewVersion:fresh.reviewVersion},site.id,b,context),error=>error.code==='COMPOSITION_REVIEW_STALE');checks++;
 const other=(await a.sites.create({teamId:team.id,name:'Other',slug:'composition-other',status:'draft',settings:{}})).item;
 const foreign=helper.reviewFrontendComposition(parsed.request,await helper.readCompositionInventory(other,a));assert.equal(foreign.canApply,false);checks++;
 // Actual complete-reader request traverses more than the repository's default cap.
 for(let i=0;i<205;i++)await owner`INSERT INTO pages(site_id,title,slug,status,content) VALUES (${other.id},${'Row '+i},${'row-'+i},'draft',${owner.json({elements:[]})})`;
 const completeInventory=await helper.readCompositionInventory(await a.sites.getById(other.id),a);assert.equal(completeInventory.pages.length,205);checks++;
 const bad={...a,pages:{...a.pages,list:async input=>{const page=await a.pages.list(input);return{...page,pagination:{...page.pagination,hasMore:false}};}}};await assert.rejects(helper.readCompositionInventory(await a.sites.getById(other.id),bad),error=>error.code==='COMPOSITION_INVENTORY_INCOMPLETE'&&error.status===503);checks++;
 const racePackage={...parsed.request,composition:{...parsed.request.composition,frontendDesign:undefined,routes:[{id:'race',type:'page',path:'/race-proof',title:'Race proof',content}]},selection:['route:race']};const raceReview=helper.reviewFrontendComposition(racePackage,await read());const raceApply={...racePackage,action:'apply',reviewVersion:raceReview.reviewVersion};const outcomes=await Promise.allSettled([helper.applyRepositoryFrontendComposition(raceApply,site.id,a,context),helper.applyRepositoryFrontendComposition(raceApply,site.id,b,context)]);assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);assert.equal((await a.pages.list({siteId:site.id,includeUnpublished:true,limit:100})).items.filter(page=>page.slug==='race-proof').length,1);checks+=3;
 console.log(`Isolated PostgreSQL composition import passed ${checks} checks: actual complete catalogs, transaction rollback of design/history/drafts, stale winner preservation, canonical nested IDs, fresh commit and replay refusal. No configured database/provider touched.`);
} finally {await cleanup();}
