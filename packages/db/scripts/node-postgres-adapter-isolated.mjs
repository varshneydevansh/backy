#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, createHash } from 'node:crypto';
import postgres from 'postgres';
import { is, Table, getTableColumns, getTableName, sql } from 'drizzle-orm';
import { createDatabaseAdapter } from '../dist/adapters/index.js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import { createBackyContentDocument, BackyContentConflictError, serializeBackyCollectionRecordVersion } from '../../core/dist/index.mjs';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-node-pg-postgres-');
const data = join(clusterRoot, 'cluster'), socket = join(clusterRoot, 'socket'), log = join(clusterRoot, 'postgres.log');
const port = randomInt(20000, 60000), username = 'backy_fixture', clients = [];
const environment = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
// Postgres.js also reads PG* defaults directly. Clear them inside this test process only.
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || ['DATABASE_URL', 'BACKY_DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'].includes(key)) delete process.env[key];
let cleanupPromise;
function run(binary, args, label) {
 try { return execFileSync(join(binaryDirectory, binary), args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); }
 catch (error) { throw new Error(`${label}: ${String(error.stderr || error.message).trim().split('\n').slice(-3).join(' ')}`); }
}
function cleanup() {
 return cleanupPromise ||= (async () => {
  await Promise.allSettled(clients.map(client => client.end({ timeout: 2 })));
  // The only directory we may stop/remove was created by this invocation.
  assert(/^\/tmp\/backy-node-pg-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 1, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
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



 const observer=connection('backy-node-pg-independent-observer');
 process.env.PGHOST=socket;process.env.PGPORT=String(port);process.env.PGUSER=username;
 const adapter=await createDatabaseAdapter({type:'postgres',url:'postgres:///postgres?options=-c%20timezone%3DUTC'});
 clients.push({end:()=>adapter.close()});
 const {rows:[identity]}=await adapter.db.execute(sql`SELECT current_user, current_database(), current_setting('data_directory') AS directory, current_setting('listen_addresses') AS listeners`);
 assert.equal(identity.current_user,username);assert.equal(identity.current_database,'postgres');assert.equal(identity.directory,data);assert.equal(identity.listeners,'');
 const db=adapter.db,pool=db.$client;assert.equal(pool.options.pipeline,false);assert.equal(pool.options.max,5);
 const evidence=[];
 const record=(name,detail={})=>{evidence.push({name,...detail});console.log('PASS '+name);};
 const code=error=>error.code||error.cause?.code;
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
 const bounded=(work,label)=>{let timer;return Promise.race([work,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' timed out')),5000))]).finally(()=>clearTimeout(timer));};
 const idle=()=>assert.equal(pool.idleCount,pool.totalCount,'Every checkout is released or discarded');
 await observer`CREATE TABLE public.node_pg_fixture(id integer PRIMARY KEY,value integer NOT NULL)`;
 await observer`INSERT INTO public.node_pg_fixture VALUES(1,10),(2,20)`;
 const read=async id=>(await observer`SELECT value FROM public.node_pg_fixture WHERE id=${id}`)[0].value;
 // Actual server BEGIN syntax failure occurs before Drizzle's own release try/finally.
 await assert.rejects(db.transaction(async()=>assert.fail('Invalid BEGIN ran callback'),{isolationLevel:'invalid'}),error=>code(error)==='42601');
 idle();assert.equal((await db.execute(sql`SELECT 1 AS ok`)).rows[0].ok,1);record('failed BEGIN releases its client');
 const marker=Error('Owned callback failure');
 await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`UPDATE public.node_pg_fixture SET value=30 WHERE id=1`);throw marker;}),error=>error===marker);
 assert.equal(await read(1),10);idle();record('callback failure rolls back before rejecting');
 await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`UPDATE public.node_pg_fixture SET value=31 WHERE id=1`);tx.rollback();}));
 assert.equal(await read(1),10);idle();record('native rollback signal preserves stored bytes');
 await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`UPDATE public.node_pg_fixture SET value=32 WHERE id=1`);try{await tx.execute(sql`SELECT 1/0`);}catch{}return 'must not report success';}),error=>/did not confirm COMMIT/.test(error.cause?.message||error.message));
 assert.equal(await read(1),10);idle();record('caught SQL abort COMMIT ROLLBACK tag is rejected');
 await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`UPDATE public.node_pg_fixture SET value=33 WHERE id=1`);await tx.execute(sql`ROLLBACK`);return 'must not report success';}),error=>/ended before commit/.test(error.cause?.message||error.message));
 assert.equal(await read(1),10);idle();record('ended transaction cannot return save success');
 await observer`CREATE TABLE public.node_pg_deferred(id integer PRIMARY KEY,link integer REFERENCES public.node_pg_fixture(id) DEFERRABLE INITIALLY DEFERRED)`;
 await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`UPDATE public.node_pg_fixture SET value=34 WHERE id=1`);await tx.execute(sql`INSERT INTO public.node_pg_deferred VALUES(1,999)`);return 34;}),error=>code(error)==='23503');
 assert.equal(await read(1),10);idle();record('deferred COMMIT failure rejects and releases');
 await db.transaction(async tx=>{await tx.execute(sql`UPDATE public.node_pg_fixture SET value=40 WHERE id=1`);await assert.rejects(tx.transaction(async nested=>{await nested.execute(sql`UPDATE public.node_pg_fixture SET value=999 WHERE id=1`);await nested.execute(sql`SELECT 1/0`);}));const {rows:[row]}=await tx.execute(sql`SELECT value FROM public.node_pg_fixture WHERE id=1`);assert.equal(row.value,40);});
 assert.equal(await read(1),40);idle();record('nested savepoint rollback permits outer commit');
 const acquired=deferred(),release=deferred();let transactionPid;
 const held=db.transaction(async tx=>{transactionPid=(await tx.execute(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid;await tx.execute(sql`UPDATE public.node_pg_fixture SET value=50 WHERE id=1`);acquired.resolve();await release.promise;});
 await acquired.promise;
 try{const {rows:[outside]}=await bounded(db.execute(sql`SELECT pg_backend_pid() AS pid,value FROM public.node_pg_fixture WHERE id=1`),'Root read');assert.notEqual(outside.pid,transactionPid);assert.equal(outside.value,40);await bounded(db.execute(sql`UPDATE public.node_pg_fixture SET value=25 WHERE id=2`),'Independent root write');assert.equal(await read(2),25);}finally{release.resolve();await held;}
 assert.equal(await read(1),50);idle();record('root reader/writer is excluded from another checked-out transaction');
 // Terminate only an owned backend; failed rollback must discard it and permit subsequent work.
 await assert.rejects(db.transaction(async tx=>{const {rows:[row]}=await tx.execute(sql`SELECT pg_backend_pid() AS pid`);await observer`SELECT pg_terminate_backend(${row.pid})`;await new Promise(r=>setTimeout(r,20));await tx.execute(sql`SELECT 1`);}));
 assert.equal((await db.execute(sql`SELECT 1 AS ok`)).rows[0].ok,1);idle();record('broken connection and rollback failure are discarded');
 const repos=createDatabaseRepositories({adapter});
 const team=(await repos.teams.create({name:'Disposable node-pg proof',slug:'node-pg-team',ownerId:null})).item;
 const site=(await repos.sites.create({teamId:team.id,name:'Disposable node-pg proof',slug:'node-pg-site',status:'draft'})).item;
 const content=kind=>createBackyContentDocument({id:'fixture-document',kind,title:'Owned node-pg proof',slug:'node-pg-proof',status:'draft',elements:[{id:'heading',type:'text',props:{content:'Preserve authored identity'},x:72,y:48,width:640,height:80,responsive:{mobile:{width:304}},children:[]}]});
 for(const kind of ['page','post']){
  const repo=kind==='page'?repos.pages:repos.posts,table=kind==='page'?'public.pages':'public.blog_posts';
  const created=(await repo.create({siteId:site.id,title:'Owned proof',slug:'owned-'+kind,content:content(kind)})).item;
  const before=await repo.getById(site.id,created.id), next=structuredClone(before.content);next.elements[0].props.content='Saved through native node-pg';
  const saved=(await repo.update(site.id,created.id,{content:next,expectedContent:before.content,expectedUpdatedAt:before.updatedAt,beforeUpdateRevision:{snapshot:structuredClone(before),operation:'update',note:'Owned native adapter baseline',createdBy:'fixture'}})).item;
  const raw=(await observer.unsafe(`SELECT updated_at,content FROM ${table} WHERE id=$1`,[saved.id]))[0];assert.equal(saved.updatedAt,new Date(raw.updated_at).toISOString());assert.equal(raw.content.contentDocument.elements[0].props.content,'Saved through native node-pg');assert.equal((await repo.getById(site.id,saved.id)).updatedAt,saved.updatedAt);
  await assert.rejects(repo.update(site.id,saved.id,{title:'Stale overwrite',expectedUpdatedAt:before.updatedAt,expectedContent:before.content,beforeUpdateRevision:{snapshot:structuredClone(before),operation:'update',note:'Stale baseline',createdBy:'fixture'}}),BackyContentConflictError);
  const [{count}]=await observer`SELECT count(*)::int AS count FROM public.content_revisions WHERE target_id=${saved.id}`;assert.equal(count,1);record(kind+' guarded update and revision commit atomically',{token:saved.updatedAt,revisions:count});
 }
 const collection=(await repos.collections.create({siteId:site.id,name:'Owned product fixture',slug:'owned-products',fields:[{id:'title',key:'title',type:'text',label:'Title'},{id:'price',key:'price',type:'number',label:'Price'}],status:'draft'})).item;
 const item=(await repos.collections.createRecord({siteId:site.id,collectionId:collection.id,slug:'owned',values:{title:'Owned product',price:33},status:'draft'})).item;
 const expectedVersion='record-v1:'+createHash('sha256').update(serializeBackyCollectionRecordVersion(item)).digest('hex');
 const saved=(await repos.collections.updateRecord(site.id,collection.id,item.id,{values:{...item.values,price:34},expectedVersion})).item;
 assert.equal((await repos.collections.getRecordById(site.id,collection.id,item.id)).values.price,34);
 const [rawRecord]=await observer`SELECT values,updated_at FROM public.content_collection_records WHERE id=${item.id}`;assert.equal(rawRecord.values.price,34);assert.equal(saved.updatedAt,new Date(rawRecord.updated_at).toISOString());
 await assert.rejects(repos.collections.updateRecord(site.id,collection.id,item.id,{values:{...item.values,price:35},expectedVersion}),error=>error.code==='COLLECTION_RECORD_CONFLICT');record('collection CAS winner persists; stale author rejected');
 // Both families retain their own cap and independent callback commits. Four
 // held admission clients still leave a fifth for the existing base repositories.
 const allEntered=deferred(),releaseGuards=deferred();let entrants=0;
 const hold=async()=>{if(++entrants===4)allEntered.resolve();await releaseGuards.promise;return 'released';};
 const guards=[repos.media.withStorageMutationLock('owned-media-a',hold),repos.media.withStorageMutationLock('owned-media-b',hold),repos.siteBackups.withJobLock(site.id,'owned-backup-a',hold),repos.siteBackups.withJobLock(site.id,'owned-backup-b',hold)];
 try{
  await bounded(allEntered.promise,'Combined admission');
  await assert.rejects(repos.media.withStorageMutationLock('owned-media-c',async()=>assert.fail('Over-cap media callback ran')),error=>error.code==='MEDIA_STORAGE_MUTATION_BUSY');
  await assert.rejects(repos.siteBackups.withJobLock(site.id,'owned-backup-c',async()=>assert.fail('Over-cap backup callback ran')),error=>error.code==='SITE_BACKUP_BUSY');
  assert(pool.totalCount>=4 && pool.totalCount<=5);
  assert.equal((await bounded(repos.pages.list({siteId:site.id,includeUnpublished:true}),'Base repo read')).items.length,1);assert.equal(pool.totalCount,5);
  const made=await bounded(repos.pages.create({siteId:site.id,title:'Owned spare writer',slug:'owned-spare',content:content('page')}),'Base repo write');assert(made.item.id);assert((await observer`SELECT id FROM public.pages WHERE id=${made.item.id}`).length===1);
  const {rows:[quota]}=await bounded(db.execute(sql`SELECT count(*)::int AS count FROM public.sites`),'Raw quota read');assert.equal(quota.count,1);
 }finally{releaseGuards.resolve();await Promise.all(guards);}
 idle();record('two media and two backup guards retain spare base read/write capacity');
 // Native query configs have no names: nothing was cached as a named prepare.
 const leased=await Promise.all(Array.from({length:pool.totalCount},()=>pool.connect()));
 try{for(const client of leased){assert.equal(client.pipeline,false);assert.deepEqual(Object.keys(client.connection.parsedStatements),[]);assert.equal(client.getTransactionStatus(),'I');}}finally{leased.forEach(client=>client.release());}
 record('all released native clients are idle, non-pipelined and unnamed');
 console.log(JSON.stringify({ok:true,boundary:'owned socket-only migrated PostgreSQL, actual compiled NodePg adapter/repositories, independent raw SQL observer; no configured DB/HTTP/Supavisor/provider proof',driver:'pg8.23.1',poolLimit:5,checks:evidence.length,evidence}));
} catch (error) {
 console.error(`Disposable PostgreSQL node-pg proof failed: ${String(error.cause?.message || error.message).split('\n')[0]}`); process.exitCode = 1;
} finally { await cleanup(); console.log('Owned disposable PostgreSQL cluster stopped and removed. Existing database configuration was not used.'); }
