// Own socket-only PostgreSQL cluster; configured targets and CLI target arguments refused.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
const require=createRequire(import.meta.url),schema=require('../src/schema/index.ts'),{createMediaRepository}=require('../src/repositories/media.ts');
let checks=0;
function equal(actual:any,expected:any,label=''){assert.deepEqual(actual,expected,label);checks++;}
if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-media-linked-postgres-');
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
  assert(/^\/tmp\/backy-media-linked-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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

 const client=connection('media-linked-proof'),repo=createMediaRepository(drizzle(client,{schema}) as any);
 const team=randomUUID(),site=randomUUID(),foreign=randomUUID(),page=randomUUID(),post=randomUUID();
 await client`INSERT INTO teams(id,name,slug) VALUES(${team},'Linked fixture','linked-fixture')`;
 await client`INSERT INTO sites(id,team_id,name,slug) VALUES(${site},${team},'Owned site','linked-owned'),(${foreign},${team},'Foreign site','linked-foreign')`;
 const records=[
  {name:'unlinked-global',metadata:{scope:'global'}},
  {name:'array-page',metadata:{pageIds:[page]}},
  {name:'scoped-page',metadata:{scope:'page',scopeTargetId:page}},
  {name:'binding-page',metadata:{bindings:[{scope:'page',targetId:page}]}},
  {name:'wrong-asset-binding',metadata:{bindings:[{scope:'page',targetId:page,mediaId:randomUUID()}]}},
  {name:'array-post',metadata:{postIds:[post]}},
  {name:'scoped-post',metadata:{scope:'post',scopeTargetId:post}},
  {name:'binding-post',metadata:{bindings:[{scope:'post',targetId:post}]}},
  {name:'private-page',metadata:{pageIds:[page],visibility:'private'}},
  {name:'foreign-page',siteId:foreign,metadata:{pageIds:[page]}},
 ];
 for(const [i,record] of records.entries())await client`INSERT INTO media(id,site_id,filename,original_name,mime_type,size_bytes,type,url,metadata,updated_at) VALUES(${randomUUID()},${record.siteId||site},${record.name},${record.name},'image/png',10,'image','/fixture',${JSON.stringify(record.metadata)}::jsonb,${new Date(1700000000000-i*1000).toISOString()}::timestamptz)`;
 const snapshot=async()=>createHash('sha256').update(JSON.stringify(await client`SELECT * FROM media ORDER BY id`)).digest('hex');const before=await snapshot();
 for(const [filter,names] of [[{linkedPageId:page},['array-page','scoped-page','binding-page','private-page']],[{linkedPostId:post},['array-post','scoped-post','binding-post']]] as const){
  const full=await repo.list({siteId:site,...filter,limit:100});equal(full.items.map(i=>i.filename),names);equal(full.pagination.total,names.length);equal(full.items.every(i=>i.siteId===site),true);
  const second=await repo.list({siteId:site,...filter,limit:1,offset:1});equal(second.items.map(i=>i.filename),[names[1]]);equal(second.pagination,{total:names.length,limit:1,offset:1,hasMore:true});
 }
 equal((await repo.list({siteId:site,linkedPageId:page,visibility:'public',limit:100})).items.map(i=>i.filename),['array-page','scoped-page','binding-page']);
 equal((await repo.list({siteId:site,linkedPageId:'missing',limit:100})).pagination.total,0);
 equal((await repo.list({siteId:foreign,linkedPageId:page,limit:100})).items.map(i=>i.filename),['foreign-page']);
 equal(await snapshot(),before,'read-only association matrix leaves full persisted media unchanged');
 await client`DELETE FROM media`;
 await client`INSERT INTO media(id,site_id,filename,original_name,mime_type,size_bytes,type,url,metadata,updated_at) SELECT gen_random_uuid(),${site},'asset-'||i,'asset-'||i,'image/png',10,'image','/fixture', CASE WHEN i>=10000 THEN jsonb_build_object('pageIds',jsonb_build_array(${page}::text)) ELSE '{}'::jsonb END, to_timestamp(1700000000-i) FROM generate_series(0,10004) AS i`;
 const largeBefore=await snapshot();const exact=await repo.list({siteId:site,linkedPageId:page,limit:2,offset:2});equal(exact.items.map(i=>i.filename),['asset-10002','asset-10003']);equal(exact.pagination,{total:5,limit:2,offset:2,hasMore:true});
 const first=await repo.list({siteId:site,limit:10000,offset:0}),tail=await repo.list({siteId:site,limit:10000,offset:10000});equal(first.items.length,10000);equal(first.pagination.total,10005);equal(first.pagination.hasMore,true);equal(tail.items.map(i=>i.filename),['asset-10000','asset-10001','asset-10002','asset-10003','asset-10004']);equal(tail.pagination.hasMore,false);equal(await snapshot(),largeBefore,'all list reads leave full persisted media unchanged');
 console.log(`Native media linked associations PASS ${checks}; actual source repository/Drizzle/PostgreSQL, canonical migrations, page/post matrix, private/foreign/missing isolation, filtering before pagination,10005 tail and full media hashes unchanged. Owned disposable cluster only; no live/provider proof.`);
}finally{await cleanup()}
