#!/usr/bin/env node
// Creates an owned socket-only cluster using the real native pg adapter. No configured database/provider.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt,randomUUID} from 'node:crypto';
import {createDatabaseAdapter} from '../dist/adapters/index.js';
import {createDatabaseRepositories} from '../dist/repositories/index.js';
import {sql} from 'drizzle-orm';
if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-mailbox-send-postgres-');
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
  assert(/^\/tmp\/backy-mailbox-send-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
try {
 run('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject'], 'Initializing owned temporary cluster');
 mkdirSync(socket, { mode: 0o700 });
 writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 20\n`);
 run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '15', 'start'], 'Starting owned socket-only cluster');
 const psql = ['-X', '--no-password', '-h', socket, '-p', String(port), '-U', username, '-d', 'postgres', '--set', 'ON_ERROR_STOP=1'];
 run('psql', [...psql, '-c', `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`], 'Bootstrapping isolated Supabase role/auth fixtures');
 const migrations = readdirSync(join(repositoryRoot, 'supabase/migrations')).filter(name => /^\d+.*\.sql$/.test(name) && Number(name.split('_')[0]) <= 29).sort();
 for (const migration of migrations) run('psql', [...psql, '-f', join(repositoryRoot, 'supabase/migrations', migration)], `Applying actual ${migration}`);
 assert(migrations.includes('015_template_revision_history.sql'));
 assert(migrations.includes('016_explicit_operator_profile_provisioning.sql'));
 process.env.PGHOST=socket;process.env.PGPORT=String(port);process.env.PGUSER=username;
 const adapters=await Promise.all([createDatabaseAdapter({type:'postgres',url:'postgres:///postgres?options=-c%20timezone%3DUTC'}),createDatabaseAdapter({type:'postgres',url:'postgres:///postgres?options=-c%20timezone%3DUTC'})]);
 for(const adapter of adapters)clients.push({end:()=>adapter.close()});
 const [adapterA,adapterB]=adapters,a=createDatabaseRepositories({adapter:adapterA}),b=createDatabaseRepositories({adapter:adapterB});
 const identity=(await adapterA.db.execute(sql`SELECT current_setting('data_directory') directory,current_setting('listen_addresses') listeners`)).rows[0];assert.equal(identity.directory,data);assert.equal(identity.listeners,'');
 const team=(await a.teams.create({name:'Investigation fixture',slug:'investigation',ownerId:null})).item;
 const site=(await a.sites.create({teamId:team.id,name:'Investigated site',slug:'investigated',status:'draft'})).item;
 const other=(await a.sites.create({teamId:team.id,name:'Isolated site',slug:'isolated',status:'draft'})).item;
 let checks = 0;
 const journal = a.mailboxSends!, concurrent = b.mailboxSends!, admission = { siteId: site.id, bindingId: 'primary', idempotencyKey: 'synthetic-concurrent-key', fingerprint: 'a'.repeat(64) };
 const results = await Promise.all([journal.admit(admission), concurrent.admit(admission)]);
 assert.equal(results.filter(row => row.admitted).length, 1); assert.equal(results[0].attempt.id, results[1].attempt.id); checks += 2;
 const id = results[0].attempt.id;
 await assert.rejects(journal.admit({ ...admission, fingerprint: 'b'.repeat(64) }), (error: any) => error.code === 'MAILBOX_SEND_IDEMPOTENCY_CONFLICT'); checks++;
 const foreign = await journal.admit({ ...admission, siteId: other.id }); assert(foreign.admitted); const otherBinding = await journal.admit({ ...admission, bindingId: 'support' }); assert(otherBinding.admitted); checks += 2;
 await assert.rejects(journal.settle(other.id, 'primary', id, { state: 'accepted', statusCode: 204 })); await assert.rejects(journal.settle(site.id, 'support', id, { state: 'accepted', statusCode: 204 })); checks += 2;
 const settlements = await Promise.allSettled([journal.settle(site.id, 'primary', id, { state: 'accepted', statusCode: 204 }), concurrent.settle(site.id, 'primary', id, { state: 'uncertain' })]); assert.equal(settlements.filter(row => row.status === 'fulfilled').length, 1); checks++;
 const replay = await journal.admit(admission); assert.equal(replay.admitted, false); assert(['accepted', 'uncertain'].includes(replay.attempt.state)); checks += 2;
 await assert.rejects(adapterA.db.execute(sql`UPDATE mailbox_send_attempts SET fingerprint=${'c'.repeat(64)} WHERE id=${id}::uuid`), (error: any) => (error.cause?.code || error.code) === '23514');
 await assert.rejects(adapterA.db.execute(sql`DELETE FROM mailbox_send_attempts WHERE id=${id}::uuid`), (error: any) => (error.cause?.code || error.code) === '23514'); checks += 2;
 const primary = await journal.list({ siteId: site.id, bindingId: 'primary', limit: 20, offset: 0 }); assert.equal(primary.total, 1); assert.equal(primary.items[0].id, id); const all = await journal.list({ siteId: site.id, limit: 20, offset: 0 }); assert.equal(all.total, 2); checks += 3;
 const acl = (await adapterA.db.execute(sql`SELECT has_table_privilege('anon','mailbox_send_attempts','SELECT') anonymous,has_table_privilege('authenticated','mailbox_send_attempts','SELECT') authenticated,has_table_privilege('service_role','mailbox_send_attempts','TRUNCATE') truncatable`)).rows[0]; assert.equal(acl.anonymous, false); assert.equal(acl.authenticated, false); assert.equal(acl.truncatable, false); checks += 3;
 await assert.rejects(adapterA.db.execute(sql`DELETE FROM sites WHERE id=${site.id}::uuid`), (error: any) => (error.cause?.code || error.code) === '23503'); checks++;
 console.log(JSON.stringify({ ok: true, checks, boundary: 'Actual PostgreSQL repository, canonical migration029, concurrent independent connections and scoped immutable duplicate journal. Owned socket-only database; no configured database or provider.' }));
} finally { await cleanup(); }
