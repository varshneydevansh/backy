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
import { runSiteDeletionPostgresProof } from '../../../apps/public/scripts/site-deletion-outcomes.mjs';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';

const baseline=process.argv.includes('--expect-known-race');
if(process.argv.slice(2).some(value=>value!=='--expect-known-race'))throw Error('No database target arguments allowed');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-operator-authority-postgres-');
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
  assert(/^\/tmp\/backy-operator-authority-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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

 const owner = connection('backy-operator-authority-lock-holder'), monitor = connection('backy-operator-authority-monitor'), sqlA = connection('backy-operator-authority-writer-a'), sqlB = connection('backy-operator-authority-writer-b');
 await Promise.all([owner`SELECT 1`, monitor`SELECT 1`, sqlA`SELECT 1`, sqlB`SELECT 1`]);
 const [identity] = await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(identity.current_user, username); assert.equal(identity.current_database, 'postgres'); assert.equal(identity.listeners, ''); assert.equal(identity.directory, data);
 const a = bundle(sqlA), b = bundle(sqlB);
 let checks=0;
 const ids=[randomUUID(),randomUUID()];
 for(const [index,id] of ids.entries()){await owner`INSERT INTO auth.users(id,email) VALUES (${id},${'authority-'+index+'@fixture.test'})`;await owner`INSERT INTO profiles(id,email,full_name,role,status,is_active) VALUES (${id},${'authority-'+index+'@fixture.test'},${'Authority '+index},'owner','active',true)`;}
 const count=async()=>Number((await owner`SELECT count(*)::int AS count FROM profiles WHERE role IN ('owner','admin') AND status='active'`)[0].count);
 const outcomes=await Promise.allSettled([a.users.update(ids[0],{role:'viewer'}),b.users.update(ids[1],{role:'viewer'})]);
 if(baseline){assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,2);assert.equal(await count(),0);checks+=2;}
 else{assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'LAST_ADMIN_AUTHORITY');assert.equal(await count(),1);checks+=3;}
 await owner`UPDATE profiles SET role='owner',status='active',is_active=true WHERE id IN (${ids[0]},${ids[1]})`;
 const deleted=await Promise.allSettled([a.users.delete(ids[0]),b.users.delete(ids[1])]);
 if(baseline){assert.equal(deleted.filter(item=>item.status==='fulfilled').length,2);assert.equal(await count(),0);checks+=2;}
 else{assert.equal(deleted.filter(item=>item.status==='fulfilled').length,1);assert.equal(deleted.find(item=>item.status==='rejected').reason.code,'LAST_ADMIN_AUTHORITY');assert.equal(await count(),1);checks+=3;}
 if(!baseline){
  const [remaining]=await owner`SELECT id FROM profiles WHERE role='owner' AND status='active'`;
  // Authority beyond >100 newer viewers is counted from the complete SQL table.
  for(let i=0;i<205;i++){const id=randomUUID();await owner`INSERT INTO auth.users(id,email) VALUES (${id},${'viewer-'+i+'@fixture.test'})`;await owner`INSERT INTO profiles(id,email,role,status,is_active,updated_at) VALUES (${id},${'viewer-'+i+'@fixture.test'},'viewer','active',true,now()+interval '1 day')`;}
  assert.equal((await a.users.list({limit:100,offset:0})).items.some(user=>user.id===remaining.id),false);checks++;
  const extra=randomUUID();await owner`INSERT INTO auth.users(id,email) VALUES (${extra},'extra@fixture.test')`;await owner`INSERT INTO profiles(id,email,role,status,is_active) VALUES (${extra},'extra@fixture.test','admin','active',true)`;
  await a.users.update(remaining.id,{status:'suspended'});assert.equal(await count(),1);checks++;
  await assert.rejects(b.users.update(extra,{status:'inactive'}),error=>error.code==='LAST_ADMIN_AUTHORITY');assert.equal(await count(),1);checks+=2;
  await assert.rejects(b.users.delete(extra),error=>error.code==='LAST_ADMIN_AUTHORITY');assert.equal(await count(),1);checks+=2;
  const unsupported=createDatabaseRepositories({adapter:{type:'sqlite',db:drizzle(sqlB,{schema}),isConnected:async()=>true,close:async()=>{}}});
  await assert.rejects(unsupported.users.update(extra,{role:'viewer'}),error=>error.code==='OPERATOR_AUTHORITY_UNAVAILABLE');await assert.rejects(unsupported.users.delete(extra),error=>error.code==='OPERATOR_AUTHORITY_UNAVAILABLE');checks+=2;
  // Real lock timeout crosses Drizzle's wrapped error boundary as a safe503.
  let acquired,release;const entered=new Promise(resolve=>{acquired=resolve;});const gate=new Promise(resolve=>{release=resolve;});
  const held=owner.begin(async tx=>{await tx`LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE`;acquired();await gate;});await entered;
  try{await assert.rejects(a.users.update(extra,{status:'active'}),error=>error.code==='OPERATOR_AUTHORITY_BUSY'&&error.status===503);checks++;}finally{release();await held;}
  // Activity detachment and profile deletion roll back together if deletion fails.
  const victim=(await owner`SELECT id FROM profiles WHERE role='viewer' LIMIT 1`)[0].id;
  const activity=randomUUID();await owner`INSERT INTO activity_logs(id,user_id,entity_type,entity_id,action,details) VALUES (${activity},${victim},'user',${victim},'fixture', '{}'::jsonb)`;
  await owner.unsafe(`CREATE FUNCTION reject_authority_fixture_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${victim}' THEN RAISE EXCEPTION 'PRIVATE_ROLLBACK_DETAIL'; END IF; RETURN OLD; END $$; CREATE TRIGGER reject_authority_fixture_delete BEFORE DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION reject_authority_fixture_delete()`);
  await assert.rejects(a.users.delete(victim));assert.equal((await owner`SELECT user_id FROM activity_logs WHERE id=${activity}`)[0].user_id,victim);assert(await a.users.getById(victim));checks+=3;
  await owner.unsafe('DROP TRIGGER reject_authority_fixture_delete ON profiles; DROP FUNCTION reject_authority_fixture_delete()');
 }
 if(!baseline) await runSiteDeletionPostgresProof({sql:owner,repository:a,uuid:randomUUID});
 console.log(`Operator authority independent PostgreSQL ${baseline?'known race reproduced':'checks PASS'}: ${checks}; real emitted repositories/two independent clients. No configured database or providers.`);
} catch(error){console.error(String(error.cause?.message||error.stack||error));process.exitCode=1;} finally{await cleanup();console.log('Owned PostgreSQL stopped/removed.');}
