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
import { verifyCollectionRecordHandlers, verifyCollectionUniqueAdmission } from '../../../apps/public/scripts/collection-record-postgres-handlers.mjs';
import { verifyCollectionImportHandlers } from '../../../apps/public/scripts/collection-import-postgres-handlers.mjs';


if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-collection-import-postgres-');
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
  assert(/^\/tmp\/backy-collection-import-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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

 const owner = connection('backy-collection-import-lock-holder'), monitor = connection('backy-collection-import-monitor'), sqlA = connection('backy-collection-import-writer-a'), sqlB = connection('backy-collection-import-writer-b');
 await Promise.all([owner`SELECT 1`, monitor`SELECT 1`, sqlA`SELECT 1`, sqlB`SELECT 1`]);
 const [identity] = await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(identity.current_user, username); assert.equal(identity.current_database, 'postgres'); assert.equal(identity.listeners, ''); assert.equal(identity.directory, data);
 const a = bundle(sqlA), b = bundle(sqlB);
 let checks = 0;
 const team = (await a.teams.create({ name: 'Disposable CAS team', slug: 'cas-team', ownerId: null })).item;
 const site = (await a.sites.create({ teamId: team.id, name: 'Disposable CAS site', slug: 'cas-site', status: 'draft' })).item;

 const siteB = (await a.sites.create({teamId:team.id,name:'Other site',slug:'other-site',status:'draft'})).item;
 const fields=[{id:'title',key:'title',label:'Title',type:'text'},{id:'design',key:'design',label:'Design',type:'json'}];
 const values={title:'Original',design:{elements:[{id:'section',type:'section',x:10,y:20,width:1200,height:600,responsive:{mobile:{width:375}},children:[{id:'widget',type:'codeComponent',version:'2.1.0',componentKey:'fixture.widget',controls:[{key:'count',type:'number'}],props:{count:4}}]}],assets:{fonts:[{id:'fixture-font'}]},animations:{entry:{type:'fade'}},dataBindings:[{field:'title'}]},extension:{nested:[null,false,0,{keep:true}]}};
 const operation={input:{name:'Editable',slug:'editable',status:'draft',fields,metadata:{extension:{nested:['keep',false,0]}}},expectedCollection:null,expectedRecords:[],records:[{input:{slug:'original',status:'draft',values},expectedRecord:null}]};
 const imported=await a.collections.applyImport(site.id,[operation]);assert.equal(imported.createdCollections,1);assert.equal(imported.createdRecords,1);checks+=2;
 const item=imported.collections[0],record=imported.records[0];
 assert.deepEqual(record.values,values);assert.deepEqual(item.metadata,operation.input.metadata);checks+=2;
 assert.equal(await a.collections.getRecordById(siteB.id,item.id,record.id),null);checks++;
 const before = await a.collections.getById(site.id,item.id);
 const beforeRecords=(await a.collections.listRecords({siteId:site.id,collectionId:item.id,includeUnpublished:true,limit:100})).items;
 const update={input:{...operation.input,name:'Updated'},expectedCollection:before,expectedRecords:beforeRecords,records:[{input:{slug:record.slug,status:'draft',values:{...values,title:'Updated'}},expectedRecord:record}]};
 // A failing later schema proves the earlier schema and record writes roll back.
 await assert.rejects(a.collections.applyImport(site.id,[update,{...operation,input:{...operation.input,name:null,slug:'failing-late'},records:[]} ]));
 assert.equal((await a.collections.getById(site.id,item.id)).name,'Editable');assert.deepEqual((await a.collections.getRecordById(site.id,item.id,record.id)).values,values);assert.equal(await a.collections.getBySlug(site.id,'failing-late'),null);checks+=4;
 // Stable content JSON is accepted regardless of property insertion order.
 const reordered=JSON.parse(JSON.stringify(update));reordered.expectedRecords[0].values={extension:values.extension,design:values.design,title:values.title};reordered.records[0].expectedRecord.values=reordered.expectedRecords[0].values;
 const pair=await Promise.allSettled([a.collections.applyImport(site.id,[reordered]),b.collections.applyImport(site.id,[reordered])]);
 assert.equal(pair.filter(result=>result.status==='fulfilled').length,1);
 const refusal = pair.find(result=>result.status==='rejected').reason.code;
 assert(['MEDIA_STORAGE_MUTATION_BUSY','COLLECTION_IMPORT_CONFLICT'].includes(refusal));
 // A racing import may be refused before its stale comparison. Once the winning
 // admission releases, that same snapshot must still fail the original CAS.
 await assert.rejects(a.collections.applyImport(site.id,[reordered]), error=>error.code==='COLLECTION_IMPORT_CONFLICT');checks+=3;
 const freshCollection=await a.collections.getById(site.id,item.id),freshRecord=await a.collections.getRecordById(site.id,item.id,record.id);
 const freshOperation={...update,expectedCollection:freshCollection,expectedRecords:[freshRecord],records:[{input:{slug:record.slug,status:'draft',values:{...values,title:'Stale overwriter'}},expectedRecord:freshRecord}]};
 let locked,release;const acquired=new Promise(resolve=>{locked=resolve}),released=new Promise(resolve=>{release=resolve});
 const authorValues={...freshRecord.values,extension:{authorWinner:true}};
 const holding=owner.begin(async tx=>{await tx`SET LOCAL session_replication_role='replica'`;await tx`SELECT id FROM content_collection_records WHERE id=${record.id} FOR UPDATE`;locked();await released;await tx`UPDATE content_collection_records SET values=${tx.json(authorValues)} WHERE id=${record.id}`;});
 await acquired;
 const stale=a.collections.applyImport(site.id,[freshOperation]).then(()=>({ok:true}),error=>({error}));
 const deadline=Date.now()+5000;let blocked=false;
 while(Date.now()<deadline){const [activity]=await monitor`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='backy-collection-import-writer-a' AND wait_event_type='Lock'`;if(activity.count){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
 release();await holding;assert(blocked,'Importer reached actual record row lock');const result=await stale;assert.equal(result.error.code,'COLLECTION_IMPORT_CONFLICT');checks+=2;
 const author=await a.collections.getRecordById(site.id,item.id,record.id);assert.equal(author.updatedAt,freshRecord.updatedAt);assert.deepEqual(author.values,authorValues);assert.equal((await a.collections.getById(site.id,item.id)).name,freshCollection.name);checks+=3;
 await assert.rejects(a.collections.applyImport(siteB.id,[freshOperation]),error=>error.code==='COLLECTION_IMPORT_CONFLICT');checks++;
 await verifyCollectionImportHandlers({ repositories:a,competing:b,site,sql:owner });
 await verifyCollectionRecordHandlers({ repositories:a,competing:b,site,sql:owner });
 await verifyCollectionUniqueAdmission({ repositories:a,competing:b,site,sql:owner });
 console.log(`Collection import isolated PostgreSQL passed ${checks} checks: actual migrations/repository, full late-failure rollback, two independent writer winner/conflict, unchanged-timestamp author preservation, JSON semantics and canonical site scopes. No configured database/provider touched.`);
} finally { await cleanup(); }
