#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import postgres from 'postgres';
import { is, Table, getTableColumns, getTableName, sql } from 'drizzle-orm';
import { createDatabaseAdapter } from '../dist/adapters/index.js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import { createBackyContentDocument, BackyContentConflictError } from '../../core/dist/index.mjs';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-timestamp-postgres-');
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
  assert(/^\/tmp\/backy-timestamp-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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


 const observer = connection('backy-timestamp-independent-observer');
 const catalog = await observer`SELECT c.relname AS table_name, a.attname AS column_name, t.typname AS data_type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p') AND t.typname IN ('timestamp','timestamptz')`;
 const inventory=[];
 for(const table of Object.values(schema)){
  if(!is(table,Table))continue;
  for(const column of Object.values(getTableColumns(table))){
   if(!column.getSQLType().startsWith('timestamp'))continue;
   const canonical=catalog.find(row=>row.table_name===getTableName(table)&&row.column_name===column.name);
   assert(canonical,`Missing canonical timestamp ${getTableName(table)}.${column.name}`);
   inventory.push({table:getTableName(table),column:column.name,canonical:canonical.data_type,withTimezone:column.withTimezone});
  }
 }
 assert(inventory.length>50,'Inventory must include the completed canonical schema');
 const evidence=[];
 // The real URL adapter has no inherited connection target: URL hostname is
 // empty and these fixture-only PG values identify the owned Unix socket.
 process.env.PGHOST=socket;process.env.PGPORT=String(port);process.env.PGUSER=username;
 for(const timezone of ['UTC','Asia/Kolkata']){
  const adapter=await createDatabaseAdapter({type:'postgres',url:`postgres:///postgres?options=${encodeURIComponent("-c timezone="+timezone)}`});
  clients.push({end:()=>adapter.close()});assert.equal(await adapter.isConnected(),true);
  const {rows:[identity]}=await adapter.db.execute(sql`SELECT current_user, current_database(), current_setting('data_directory') AS directory, current_setting('listen_addresses') AS listeners, current_setting('timezone') AS timezone`);
  assert.equal(identity.current_user,username);assert.equal(identity.current_database,'postgres');assert.equal(identity.directory,data);assert.equal(identity.listeners,'');assert.equal(identity.timezone,timezone);
  const repos=createDatabaseRepositories({adapter}),suffix=timezone.replace(/[^a-z]/gi,'').toLowerCase();
  const team=(await repos.teams.create({name:'Disposable timestamp proof',slug:'timestamp-team-'+suffix,ownerId:null})).item;
  const site=(await repos.sites.create({teamId:team.id,name:'Disposable timestamp proof',slug:'timestamp-site-'+suffix,status:'draft'})).item;
  const scheduled='2030-06-01T12:34:56.789Z';
  for(const kind of ['page','post']){
   const repo=kind==='page'?repos.pages:repos.posts,table=kind==='page'?'public.pages':'public.blog_posts';
   const content=createBackyContentDocument({id:'fixture-document',kind,title:'Timestamp proof',slug:'timestamp-proof',status:'draft',elements:[{id:'heading',type:'text',props:{content:'Keep authored content'},x:72,y:48,width:640,height:80,responsive:{mobile:{x:16,width:304}},children:[]}]});
   const created=(await repo.create({siteId:site.id,title:'Timestamp proof',slug:'timestamp-'+kind,status:'published',scheduledAt:scheduled,content})).item;
   const independent=async()=> (await observer.unsafe(`SELECT created_at,updated_at,published_at,scheduled_at,xmin::text AS xmin FROM ${table} WHERE id=$1`,[created.id]))[0];
   const iso=value=>new Date(value).toISOString();
   let raw=await independent();
   assert.equal(created.updatedAt,iso(raw.updated_at),`${timezone} ${kind} CREATE RETURNING matches independent SQL`);
   assert.equal(created.createdAt,iso(raw.created_at));assert.equal(created.publishedAt,iso(raw.published_at));assert.equal(created.scheduledAt,scheduled);assert.equal(created.scheduledAt,iso(raw.scheduled_at));
   for(let attempt=0;attempt<3;attempt++){
    const before=await repo.getById(site.id,created.id);
    const saved=(await repo.update(site.id,created.id,{content:before.content,meta:before.meta,expectedContent:before.content,expectedUpdatedAt:before.updatedAt,beforeUpdateRevision:{snapshot:JSON.parse(JSON.stringify(before)),operation:'update',note:'Before unchanged timezone proof',createdBy:'fixture'}})).item;
    const read=await repo.getById(site.id,created.id);raw=await independent();
    assert.equal(saved.updatedAt,iso(raw.updated_at),`${timezone} ${kind} UPDATE RETURNING matches independent SQL`);
    assert.equal(read.updatedAt,saved.updatedAt);assert.equal(read.content.version,read.updatedAt);assert.equal(saved.content.version,saved.updatedAt);
    assert.equal(read.content.elements[0].props.content,'Keep authored content');assert.equal(read.scheduledAt,scheduled);
    assert.notEqual(saved.updatedAt,before.updatedAt,'Unchanged guarded save advances its token');
    await assert.rejects(repo.update(site.id,created.id,{title:'Stale must not persist',expectedUpdatedAt:before.updatedAt,expectedContent:before.content}),BackyContentConflictError);
    assert.equal((await repo.getById(site.id,created.id)).updatedAt,saved.updatedAt);
    const [revisions]=await observer`SELECT count(*)::int AS count FROM public.content_revisions WHERE target_id=${created.id}`;
    assert.equal(revisions.count,attempt+1,'Revision and document commit together; stale save writes neither');
    evidence.push({timezone,kind,attempt,returned:saved.updatedAt,read:read.updatedAt,independent:iso(raw.updated_at),documentVersion:read.content.version,revisions:revisions.count,xmin:raw.xmin});
   }
  }
 }
 for(const row of inventory)assert.equal(row.withTimezone,row.canonical==='timestamptz',`Canonical type alignment ${row.table}.${row.column}`);
 const genuine=inventory.filter(row=>row.canonical==='timestamp');assert.deepEqual(genuine.map(row=>`${row.table}.${row.column}`),['template_revisions.created_at']);
 console.log(JSON.stringify({ok:true,boundary:'owned socket-only PostgreSQL; actual current adapter/repositories and all canonical migrations; no configured database/HTTP/provider proof',timestampColumns:inventory.length,timestamptz:inventory.filter(row=>row.canonical==='timestamptz').length,genuineTimestamp:genuine,checks:evidence.length,evidence}));
} catch (error) {
 console.error(`Disposable PostgreSQL timestamp proof failed: ${String(error.cause?.message || error.message).split('\n')[0]}`); process.exitCode = 1;
} finally { await cleanup(); console.log('Owned disposable PostgreSQL cluster stopped and removed. Existing database configuration was not used.'); }
