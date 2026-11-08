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
import {sanitizeDeliveryProviderEvidence} from '../../core/dist/index.mjs';
if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-delivery-investigation-postgres-');
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
  assert(/^\/tmp\/backy-delivery-investigation-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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
 const migrations = readdirSync(join(repositoryRoot, 'supabase/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
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
 const comment=(await a.comments.create({siteId:site.id,targetType:'page',targetId:'synthetic-page',content:'Retained authored comment',status:'approved'})).item;
 const form=(await a.forms.create({siteId:site.id,name:'Retained form',fields:[],notificationWebhook:'https://provider.invalid/owned',isActive:true})).item;
 const submission=(await a.forms.createSubmission({siteId:site.id,formId:form.id,values:{retained:'private value'},status:'pending'})).item;
 // Reproduce the provider default-ACL baseline on an owned sentinel, then verify024 removes it from review tables.
 await adapterA.db.execute(sql`CREATE TABLE public.owned_default_acl_fixture(id integer PRIMARY KEY)`);
 await adapterA.db.execute(sql`INSERT INTO public.owned_default_acl_fixture VALUES(1)`);
 const baselineACL=(await adapterA.db.execute(sql`SELECT has_table_privilege('service_role','public.owned_default_acl_fixture','TRUNCATE') truncatable`)).rows[0];assert.equal(baselineACL.truncatable,true);
 await adapterA.db.transaction(async tx=>{await tx.execute(sql`SET LOCAL ROLE service_role`);await tx.execute(sql`TRUNCATE public.owned_default_acl_fixture`);});
 assert.equal((await adapterA.db.execute(sql`SELECT count(*)::integer n FROM public.owned_default_acl_fixture`)).rows[0].n,0);await adapterA.db.execute(sql`DROP TABLE public.owned_default_acl_fixture`);
 let checks=4;
 const evidence={provider:'resend',observedAt:new Date().toISOString(),statusCode:202,providerMessageId:'synthetic-message-123',apiKey:'MUST-NOT-PERSIST',payload:{secret:'MUST-NOT-PERSIST'}};
 assert.deepEqual(sanitizeDeliveryProviderEvidence(evidence),{provider:'resend',observedAt:evidence.observedAt,statusCode:202,providerMessageId:'synthetic-message-123'});checks++;
 for(const kind of ['comment','form']){
  const journal=kind==='comment'?a.commentDeliveries:a.formDeliveries,concurrent=kind==='comment'?b.commentDeliveries:b.formDeliveries;
  const scope={siteId:site.id,...(kind==='comment'?{commentId:comment.id}:{formId:form.id,submissionId:submission.id})};
  const admission={...scope,kind:kind==='comment'?'comment-status':'form-submission',channel:'webhook',target:'https://provider.invalid/owned',requestId:'owned-admission',reason:null,actor:null};
  const get=id=>kind==='comment'?journal.get(site.id,comment.id,id):journal.get(site.id,form.id,submission.id,id);
  const review=(row,version=row.reconciliationVersion)=>({...scope,attemptId:row.id,expectedUpdatedAt:row.updatedAt,expectedState:row.state,expectedReviewVersion:version,evidence:'outcome-unavailable',disposition:'retain-without-resend',actorId:'synthetic-owner',requestId:'owned-investigation'});
  const invariant=row=>{const {reconciliations,reconciliationVersion,...unchanged}=row;return unchanged;};
  const pending=await journal.admit(admission),baseline=invariant(pending);
  const results=await Promise.allSettled([journal.recordReconciliation(review(pending)),concurrent.recordReconciliation(review(pending))]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);const denied=results.find(result=>result.status==='rejected');assert.equal(denied.reason.code,'DELIVERY_RECONCILIATION_CONFLICT');checks+=2;
  let stored=await get(pending.id);assert.equal(stored.reconciliationVersion,1);assert.equal(stored.reconciliations.length,1);assert.deepEqual(invariant(stored),baseline);checks+=3;
  await assert.rejects(journal.admit({...admission,sourceEventId:stored.id}),error=>error.code==='DELIVERY_EVENT_NOT_FAILED');checks++;
  stored=await journal.recordReconciliation({...review(stored),evidence:'provider-console-reviewed'});assert.equal(stored.reconciliationVersion,2);assert.equal(stored.reconciliations[0].evidence,'outcome-unavailable');assert.equal(stored.reconciliations[1].evidence,'provider-console-reviewed');assert.deepEqual(invariant(stored),baseline);checks+=4;
  await assert.rejects(journal.recordReconciliation({...review(stored),state:'succeeded'}),error=>error.code==='DELIVERY_RECONCILIATION_INVALID');
  await assert.rejects(journal.recordReconciliation({...review(stored),expectedUpdatedAt:'invalid'}),error=>error.code==='DELIVERY_RECONCILIATION_INVALID');
  await assert.rejects(journal.recordReconciliation({...review(stored),siteId:other.id}),error=>error.code==='DELIVERY_EVENT_NOT_FOUND');
  await assert.rejects(journal.recordReconciliation({...review(stored),...(kind==='comment'?{commentId:randomUUID()}:{submissionId:randomUUID()})}),error=>error.code==='DELIVERY_EVENT_NOT_FOUND');checks+=4;
  // Normal provider settlement may follow a pending review and retains the original investigation snapshot.
  const settled=await journal.settle(site.id,pending.id,{state:'succeeded',statusCode:202,providerEvidence:evidence});assert.equal(settled.state,'succeeded');assert.equal(settled.reconciliationVersion,2);assert.deepEqual(settled.providerEvidence,sanitizeDeliveryProviderEvidence(evidence));assert.equal(settled.reconciliations[0].observedState,'pending');
  await assert.rejects(journal.recordReconciliation(review(stored)),error=>error.code==='DELIVERY_RECONCILIATION_CONFLICT');checks+=5;
  const ambiguous=await journal.admit(admission),uncertain=await journal.settle(site.id,ambiguous.id,{state:'uncertain',errorCode:'PROVIDER_COMPLETION_UNKNOWN',providerEvidence:evidence});
  const reviewed=await journal.recordReconciliation(review(uncertain));assert.deepEqual(invariant(reviewed),invariant(uncertain));await assert.rejects(journal.admit({...admission,sourceEventId:reviewed.id}),error=>error.code==='DELIVERY_EVENT_NOT_FAILED');checks+=2;
  const table=sql.raw('public.'+kind+'_delivery_reconciliations'),attempts=sql.raw('public.'+kind+'_delivery_attempts');
  const reviewId=reviewed.reconciliations[0].id.slice('delivery-review-'.length),rawAttempt=reviewed.id.slice(kind==='comment'?9:14);
  for(const mutation of [sql`UPDATE ${table} SET evidence='recipient-report-reviewed' WHERE id=${reviewId}::uuid`,sql`DELETE FROM ${table} WHERE id=${reviewId}::uuid`])await assert.rejects(adapterA.db.execute(mutation),error=>(error.cause?.code||error.code)==='23514');checks+=2;
  await assert.rejects(adapterA.db.execute(sql`INSERT INTO ${table}(site_id,attempt_id,version,actor_id,request_id,observed_updated_at,observed_state,evidence,disposition) VALUES(${other.id}::uuid,${rawAttempt}::uuid,2,'owner','cross-site',now(),'uncertain','outcome-unavailable','retain-without-resend')`),error=>(error.cause?.code||error.code)==='23503');checks++;
  // An actual SQL INSERT outage rolls back without changing the attempt or creating a review.
  const crash=await journal.admit(admission),trigger=sql.raw('reject_'+kind+'_review');
  await adapterA.db.execute(sql`CREATE OR REPLACE FUNCTION public.reject_review_fixture() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''owned fixture outage''; END;'`);
  await adapterA.db.execute(sql`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.reject_review_fixture()`);
  await assert.rejects(journal.recordReconciliation(review(crash)));await adapterA.db.execute(sql`DROP TRIGGER ${trigger} ON ${table}`);
  assert.deepEqual(await get(crash.id),crash);checks+=2;
  const list=await journal.list({...scope,limit:100,offset:0});assert.equal(list.items.find(row=>row.id===reviewed.id).reconciliationVersion,1);assert.equal(list.items.find(row=>row.id===settled.id).reconciliations.length,2);checks+=2;
  for(const role of ['anon','authenticated']){const result=(await adapterA.db.execute(sql`SELECT has_table_privilege(${role},${'public.'+kind+'_delivery_reconciliations'},'SELECT') readable,has_table_privilege(${role},${'public.'+kind+'_delivery_reconciliations'},'INSERT') writable`)).rows[0];assert.equal(result.readable,false);assert.equal(result.writable,false);checks+=2;}
  const service=(await adapterA.db.execute(sql`SELECT has_table_privilege('service_role',${'public.'+kind+'_delivery_reconciliations'},'UPDATE') editable,has_table_privilege('service_role',${'public.'+kind+'_delivery_reconciliations'},'DELETE') deletable,has_table_privilege('service_role',${'public.'+kind+'_delivery_reconciliations'},'TRUNCATE') truncatable`)).rows[0];assert.equal(service.editable,false);assert.equal(service.deletable,false);assert.equal(service.truncatable,false);checks+=3;
  await assert.rejects(adapterA.db.execute(sql`TRUNCATE ${table}`),error=>(error.cause?.code||error.code)==='23514');
  await assert.rejects(adapterA.db.transaction(async tx=>{await tx.execute(sql`SET LOCAL ROLE service_role`);await tx.execute(sql`TRUNCATE ${table}`);}),error=>(error.cause?.code||error.code)==='42501');assert.equal((await get(reviewed.id)).reconciliations.length,1);checks+=3;
 }
 await assert.rejects(a.sites.delete(site.id),error=>(error.cause?.code||error.code)==='23503');assert(await a.sites.getById(site.id));checks+=2;
 console.log(`Delivery investigation PostgreSQL PASS ${checks}: migration024, actual native pg adapter, independent CAS/append-only history, original provider evidence/state retention, provider settlement race, scoped FK and rollback, RLS/deletion guard. No provider or configured DB.`);
}finally{await cleanup();}
