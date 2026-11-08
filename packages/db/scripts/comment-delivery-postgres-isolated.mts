#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { createCommentRepository } from '../dist/repositories/index.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import { loadMediaFixture } from '../../../apps/public/scripts/media-storage-recovery-fixture.mts';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-comment-delivery-postgres-');
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
  assert(/^\/tmp\/backy-comment-delivery-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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


 const sqlA=connection('delivery-a'),sqlB=connection('delivery-b'),owner=connection('delivery-owner');const a=bundle(sqlA),b=bundle(sqlB);
 const team=(await a.teams.create({name:'Delivery team',slug:'delivery-team',ownerId:null})).item;
 const site=(await a.sites.create({teamId:team.id,name:'Delivery site',slug:'delivery-site',status:'draft'})).item;
 const other=(await a.sites.create({teamId:team.id,name:'Other',slug:'delivery-other',status:'draft'})).item;
 const comment=(await a.comments.create({siteId:site.id,targetType:'page',targetId:'synthetic-target',content:'Synthetic authored comment',status:'approved'})).item;
 let checks=0,sourceCount=0,sends=0,deny=0,auditFail=false,providerThrows=false,providerStatus=200,repository:any=a,pause:Promise<void>|null=null;
 const source=async(status='failed',sid=site.id,cid=comment.id)=> (await a.auditLogs.record({siteId:sid,entity:'comment',entityId:cid,action:'comment-status',metadata:{status,statusCode:status==='failed'?503:null,channel:'webhook',target:'https://provider.invalid/synthetic'},requestId:'source-'+ ++sourceCount})).id;
 const mocks:any={'@/lib/backyStore':{},'@/lib/demoCommentDeliveryJournal':{},'@/lib/adminAccess':{requireAdminAccess:async()=>deny?NextResponse.json({success:false},{status:deny}):{session:{user:{id:'synthetic-operator'}}}},'@/lib/adminAudit':{recordAdminAudit:async()=>{if(auditFail)throw Error('Private audit credential');}},'@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{}),'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repository},'@/lib/formEmailDelivery':{EmailDeliveryError:class extends Error{}}};
 for(const name of ['commentRepositorySupport','commentDeliveryHistory'])mocks['@/lib/'+name]=loadMediaFixture('../src/lib/'+name+'.ts',mocks);
 mocks['@/lib/commentDelivery']=loadMediaFixture('../src/lib/commentDelivery.ts',mocks,process,{fetch:async()=>{sends++;if(pause)await pause;if(providerThrows)throw Error('Private transport credential');return new Response('',{status:providerStatus});}});
 const route=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/delivery-retry/route.ts',mocks),history=loadMediaFixture('../src/app/api/sites/[siteId]/comments/delivery-attempts/route.ts',mocks);
 const call=(id:string,sid=site.slug,cid=comment.id)=>route.POST(new NextRequest('http://fixture.invalid/api/sites/'+sid+'/comments/'+cid+'/delivery-retry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventId:id})}),{params:Promise.resolve({siteId:sid,commentId:cid})});
 let old=await source();for(let i=0;i<205;i++)await source('succeeded');assert.equal((await a.auditLogs.list({siteId:site.id,entity:'comment',entityId:comment.id,limit:200})).items.length,100);assert.equal((await a.auditLogs.getById(site.id,old)).id,old);assert.equal(await a.auditLogs.getById(other.id,old),null);checks+=3;
 let response=await call(old),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.delivery.durableState,'succeeded');assert.equal(sends,1);assert.equal((await call(old)).status,409);checks+=4;
 // Hold the actual first provider call after admission, then another independent worker tries its source.
 old=await source();let release!:()=>void;pause=new Promise<void>(resolve=>release=resolve);const first=call(old);while(sends<2)await new Promise(resolve=>setTimeout(resolve,5));repository=b;const second=await call(old);assert.equal(second.status,409);assert.equal((await second.json()).error.code,'DELIVERY_RETRY_ALREADY_ADMITTED');release();pause=null;assert.equal((await first).status,200);assert.equal(sends,2);repository=a;checks+=4;
 old=await source();const input={siteId:site.id,commentId:comment.id,kind:'comment-status',channel:'webhook',target:'https://provider.invalid/synthetic',sourceEventId:old,requestId:'queued-crash',reason:null,actor:null};const queued=await a.commentDeliveries.admit(input);assert.equal((await call(old)).status,409);assert.equal((await call(queued.id)).status,409);assert.equal((await b.commentDeliveries.get(site.id,comment.id,queued.id)).state,'pending');checks+=3;
 old=await source();providerThrows=true;response=await call(old);body=await response.json();assert.equal(body.data.delivery.status,'uncertain');assert.equal(body.data.delivery.durableState,'uncertain');assert.equal((await call(body.data.delivery.attemptId)).status,409);assert(!JSON.stringify(body).includes('credential'));providerThrows=false;checks+=4;
 old=await source();providerStatus=503;response=await call(old);body=await response.json();const failed=body.data.delivery.attemptId;assert.equal(body.data.delivery.durableState,'failed');providerStatus=200;assert.equal((await call(failed)).status,200);assert.equal((await call(failed)).status,409);const listed=await a.commentDeliveries.list({siteId:site.id,limit:100,offset:0});assert(listed.items.find(row=>row.id===failed).retryAttemptId);checks+=4;

 const projected=await a.auditLogs.record({siteId:site.id,entity:'comment',entityId:comment.id,action:'comment-status',metadata:{status:'failed',statusCode:503,channel:'webhook',target:input.target,attemptId:failed}});
 await assert.rejects(a.commentDeliveries.admit({...input,sourceEventId:projected.id}),e=>e.code==='DELIVERY_RETRY_ALREADY_ADMITTED');assert.equal((await call(projected.id)).status,409);checks+=2;
 const unknown=await a.auditLogs.record({siteId:site.id,entity:'comment',entityId:comment.id,action:'comment-status',metadata:{status:'failed',channel:'webhook',target:input.target}});const beforeUnknown=sends;assert.equal((await call(unknown.id)).status,409);assert.equal(sends,beforeUnknown);checks+=2;
 // A secondary audit write failure cannot disguise committed provider/journal success.
 old=await source();auditFail=true;response=await call(old);body=await response.json();assert.equal(response.status,200);assert.equal(body.data.delivery.durableState,'succeeded');assert.deepEqual(body.data.completionWarnings,['COMMENT_AUDIT_PENDING']);assert.equal((await call(old)).status,409);auditFail=false;checks+=4;
 // Actual SQL outcome persistence rejection retains admitted pending and observed success.
 old=await source();await owner`CREATE FUNCTION reject_delivery_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic journal outage'; END; $$`;await owner`CREATE TRIGGER reject_delivery_settle BEFORE UPDATE ON comment_delivery_attempts FOR EACH ROW EXECUTE FUNCTION reject_delivery_settle()`;
 response=await call(old);body=await response.json();assert.equal(response.status,200);assert.equal(body.data.delivery.status,'succeeded');assert.equal(body.data.delivery.durableState,'pending');assert(body.data.delivery.completionWarnings.includes('COMMENT_DELIVERY_OUTCOME_PENDING'));assert.equal((await call(old)).status,409);await owner`DROP TRIGGER reject_delivery_settle ON comment_delivery_attempts`;checks+=5;
 const before=sends;for(const id of [await source('queued'),await source('succeeded')])assert.equal((await call(id)).status,409);assert.equal((await call(await source('failed',other.id))).status,404);assert.equal((await call(await source(),'delivery-other')).status,404);assert.equal(sends,before);checks+=5;
 for(deny of [401,403]){assert.equal((await call(await source())).status,deny);assert.equal(sends,before);}deny=0;checks+=4;
 assert.equal(await a.commentDeliveries.get(other.id,comment.id,queued.id),null);assert.equal(await a.commentDeliveries.get(site.id,randomUUID(),queued.id),null);checks+=2;
 response=await history.GET(new NextRequest('http://fixture.invalid/api/sites/'+site.slug+'/comments/delivery-attempts?limit=2'),{params:Promise.resolve({siteId:site.slug})});body=await response.json();assert.equal(response.status,200);assert.equal(body.data.events.length,2);assert(body.data.pagination.hasMore);assert(body.data.count>2);assert.equal(response.headers.get('cache-control'),'no-store');checks+=5;
 await assert.rejects(a.commentDeliveries.settle(site.id,failed,{state:'succeeded'}),e=>e.code==='DELIVERY_OUTCOME_CONFLICT');checks++;
 for(const role of ['anon','authenticated']){const result=await owner`SELECT has_table_privilege(${role},'public.comment_delivery_attempts','SELECT') AS select,has_table_privilege(${role},'public.comment_delivery_attempts','INSERT') AS insert`;assert.equal(result[0].select,false);assert.equal(result[0].insert,false);checks+=2;}
 console.log(`Comment delivery PostgreSQL PASS ${checks}: actual migration021/repositories/handlers, independent concurrent admission, scoped source beyondcap100, queued crash, transport ambiguity, SQL outcome outage retains pending, sanitized audit warning, retry lineage/private pagination/RLS. Synthetic provider/auth; no configured DB or provider.`);
}finally{await cleanup();}
