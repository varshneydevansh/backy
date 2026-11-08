#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
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
const clusterRoot = mkdtempSync('/tmp/backy-form-delivery-postgres-');
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
  assert(/^\/tmp\/backy-form-delivery-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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


 const sqlA=connection('forms-a'),sqlB=connection('forms-b'),owner=connection('forms-owner'),a=bundle(sqlA),b=bundle(sqlB);
 const team=(await a.teams.create({name:'Synthetic team',slug:'forms-team',ownerId:null})).item;
 const site=(await a.sites.create({teamId:team.id,name:'Forms',slug:'forms-site',status:'draft'})).item,foreign=(await a.sites.create({teamId:team.id,name:'Foreign',slug:'forms-foreign',status:'draft'})).item;
 const form=(await a.forms.create({siteId:site.id,name:'Synthetic',fields:[],notificationWebhook:'https://provider.invalid/owned',notificationEmail:'fixture@example.test',isActive:true})).item;
 const submission=(await a.forms.createSubmission({siteId:site.id,formId:form.id,values:{extension:{keep:[false,0,null]}},status:'pending'})).item;
 let checks=0,sends=0,denied=0,status=200,providerThrows=false,activityFail=false,repository=a,pause:Promise<void>|null=null;
 const mocks:any={'@/lib/backyStore':{},'@/lib/adminAccess':{requireAdminAccess:async()=>denied?NextResponse.json({success:false,error:{code:'DENIED',message:'Denied'}},{status:denied}):{session:{user:{id:'synthetic-owner'}}}},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repository},'@/lib/demoFormDeliveryJournal':{},'@/lib/formEmailDelivery':{EmailDeliveryError:class extends Error{},getEmailDeliveryConfig:()=>({provider:'synthetic'}),buildFormNotificationEmail:()=>({}),sendEmailMessage:async()=>({statusCode:200})},'@/lib/commentRepositorySupport':{recordRepositoryInteractionEvent:async(r:any,event:any)=>{if(activityFail)throw Error('private audit credential');return r.auditLogs.record({siteId:event.siteId,entity:'formSubmission',entityId:event.submissionId,action:event.kind,metadata:{...event.metadata,formId:event.formId,target:event.target,status:event.status,statusCode:event.statusCode}});}}};
 mocks['@/lib/formDeliveryHistory']=loadMediaFixture('../src/lib/formDeliveryHistory.ts',mocks);
 mocks['@/lib/formSubmissionDelivery']=loadMediaFixture('../src/lib/formSubmissionDelivery.ts',mocks,process,{fetch:async()=>{sends++;if(pause)await pause;if(providerThrows)throw Error('private transport credential');return new Response('',{status});}});
 const route=loadMediaFixture('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/webhook-retry/route.ts',mocks),history=loadMediaFixture('../src/app/api/admin/sites/[siteId]/forms/[formId]/delivery-attempts/route.ts',mocks);
 const call=(eventId?:string,sid=site.slug,fid=form.id,subid=submission.id)=>route.POST(new NextRequest('http://fixture.invalid/api/admin/sites/'+sid+'/forms/'+fid+'/submissions/'+subid+'/webhook-retry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(eventId?{eventId}:{})}),{params:Promise.resolve({siteId:sid,formId:fid,submissionId:subid})});
 const source=async(state='failed',code:number|null=503)=>(await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:submission.id,action:'form-submission',metadata:{formId:form.id,status:state,statusCode:code,target:form.notificationWebhook}})).id;
 let old=await source();for(let i=0;i<205;i++)await source('succeeded',200);assert.equal((await a.auditLogs.list({siteId:site.id,action:'form-submission',limit:200})).items.length,100);checks++;
 let response=await call(old),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.delivery.durableState,'succeeded');assert.equal((await call(old)).status,409);checks+=3;
 old=await source();let release!:()=>void;pause=new Promise(resolve=>release=resolve);const first=call(old);while(sends<2)await new Promise(resolve=>setTimeout(resolve,0));repository=b;assert.equal((await call(old)).status,409);release();pause=null;assert.equal((await first).status,200);assert.equal(sends,2);repository=a;checks+=3;
 old=await source();const input={siteId:site.id,formId:form.id,submissionId:submission.id,kind:'form-submission',channel:'webhook',target:form.notificationWebhook,sourceEventId:old,requestId:'crash',reason:null,actor:null};const pending=await a.formDeliveries!.admit(input as any);assert.equal((await call(old)).status,409);assert.equal((await call(pending.id)).status,409);assert.equal((await b.formDeliveries!.get(site.id,form.id,submission.id,pending.id))!.state,'pending');checks+=3;
 old=await source();providerThrows=true;body=await(await call(old)).json();assert.equal(body.data.delivery.status,'uncertain');assert.equal(body.data.delivery.durableState,'uncertain');assert.equal((await call(body.data.delivery.attemptId)).status,409);assert(!JSON.stringify(body).includes('credential'));providerThrows=false;checks+=4;
 old=await source();status=503;body=await(await call(old)).json();assert.equal(body.data.delivery.status,'failed');const failed=body.data.delivery.attemptId;status=200;assert.equal((await call(failed)).status,200);assert.equal((await call(failed)).status,409);checks+=3;
 const alias=(await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:submission.id,action:'form-submission',metadata:{formId:form.id,status:'failed',statusCode:503,target:form.notificationWebhook,attemptId:failed}})).id;await assert.rejects(a.formDeliveries!.admit({...input,sourceEventId:alias} as any),(e:any)=>e.code==='DELIVERY_RETRY_ALREADY_ADMITTED');assert.equal((await call(alias)).status,409);checks+=2;
 old=await source();activityFail=true;body=await(await call(old)).json();assert.equal(body.data.delivery.status,'succeeded');assert.deepEqual(body.data.completionWarnings,['FORM_DELIVERY_ACTIVITY_PENDING']);activityFail=false;checks+=2;
 old=await source();await owner`CREATE FUNCTION reject_form_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic settlement outage'; END; $$`;await owner`CREATE TRIGGER reject_form_settle BEFORE UPDATE ON form_delivery_attempts FOR EACH ROW EXECUTE FUNCTION reject_form_settle()`;response=await call(old);body=await response.json();assert.equal(response.status,200);assert.equal(body.data.delivery.status,'succeeded');assert.equal(body.data.delivery.durableState,'pending');assert(body.data.completionWarnings.includes('FORM_DELIVERY_OUTCOME_PENDING'));assert.equal((await call(old)).status,409);await owner`DROP TRIGGER reject_form_settle ON form_delivery_attempts`;checks+=5;
 const before=sends;for(const sourceId of [await source('queued'),await source('succeeded'),await source('failed',null)])assert.equal((await call(sourceId)).status,409);assert.equal((await call(await source(),foreign.slug)).status,404);assert.equal((await call(await source(),site.slug,randomUUID())).status,404);assert.equal(sends,before);checks+=6;
 for(denied of [401,403]){assert.equal((await call(old)).status,denied);assert.equal(sends,before);}denied=0;checks+=4;
 response=await history.GET(new NextRequest('http://fixture.invalid?limit=2'),{params:Promise.resolve({siteId:site.slug,formId:form.id})});body=await response.json();assert.equal(response.status,200);assert.equal(body.data.events.length,2);assert(body.data.count>2);assert(body.data.pagination.hasMore);assert.match(response.headers.get('cache-control'),/no-store/);assert((await a.formDeliveries!.list({siteId:site.id,formId:form.id,limit:100,offset:0})).items.find(row=>row.id===failed)!.retryAttemptId);checks+=6;
 assert.equal(await a.formDeliveries!.get(foreign.id,form.id,submission.id,pending.id),null);assert.equal(await a.formDeliveries!.get(site.id,randomUUID(),submission.id,pending.id),null);await assert.rejects(a.formDeliveries!.settle(site.id,failed,{state:'succeeded'}),(e:any)=>e.code==='DELIVERY_OUTCOME_CONFLICT');checks+=3;
 // Actual status is rechecked inside admission, not merely by the HTTP route's earlier snapshot.
 await a.forms.updateSubmission(site.id,submission.id,{status:'rejected'});await assert.rejects(a.formDeliveries!.admit({...input,sourceEventId:await source()} as any),(e:any)=>e.code==='FORM_SUBMISSION_NOT_DELIVERABLE');checks++;
 for(const role of ['anon','authenticated']){const result=await owner`SELECT has_table_privilege(${role},'public.form_delivery_attempts','SELECT') AS select,has_table_privilege(${role},'public.form_delivery_attempts','INSERT') AS insert`;assert.equal(result[0].select,false);assert.equal(result[0].insert,false);checks+=2;}

 // General events must filter in SQL before the capped page and preserve true counts.
 const selectedFormId=randomUUID();
 for(let i=0;i<30;i++)await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:randomUUID(),action:'form-submission',requestId:'event-page-'+(i%2),metadata:{formId:selectedFormId,status:'failed',target:'selected-target'}});
 for(let i=0;i<105;i++)await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:randomUUID(),action:'form-submission',metadata:{formId:'unrelated-form',status:'failed'}});
 await a.auditLogs.record({siteId:foreign.id,entity:'formSubmission',entityId:randomUUID(),action:'form-submission',metadata:{formId:selectedFormId,target:'foreign-private-target'}});
 const eventsMocks={...mocks,'@/lib/commentRepositorySupport':{...mocks['@/lib/commentRepositorySupport'],resolveRepositorySite:async(r:any,id:string)=>(await r.sites.getById(id))||(await r.sites.getBySlug(id))},'@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{})};
 const eventsRoute=loadMediaFixture('../src/app/api/sites/[siteId]/events/route.ts',eventsMocks);
 const eventCall=(query:string)=>eventsRoute.GET(new NextRequest('http://fixture.invalid/api/sites/'+site.slug+'/events?'+query),{params:Promise.resolve({siteId:site.slug})});
 response=await eventCall('kind=form-submission&formId='+selectedFormId+'&limit=10&offset=10');body=await response.json();assert.equal(response.status,200);assert.equal(body.data.events.length,10);assert.equal(body.data.count,30);assert.deepEqual(body.data.pagination,{total:30,limit:10,offset:10,hasMore:true});assert(body.data.events.every((event:any)=>event.formId===selectedFormId&&event.siteId===site.id));assert.equal(response.headers.get('cache-control'),'no-store');assert(!JSON.stringify(body).includes('foreign-private-target'));checks+=7;
 const middleIds=body.data.events.map((event:any)=>event.id);assert.deepEqual((await(await eventCall('kind=form-submission&formId='+selectedFormId+'&limit=10&offset=10')).json()).data.events.map((event:any)=>event.id),middleIds);checks++;
 body=await(await eventCall('kind=form-submission&formId='+selectedFormId+'&limit=10&offset=20')).json();assert.equal(body.data.events.length,10);assert.equal(body.data.pagination.hasMore,false);assert.equal(body.data.pagination.total,30);checks+=3;
 body=await(await eventCall('kind=form-submission&formId='+selectedFormId+'&requestId=event-page-1&limit=100')).json();assert.equal(body.data.count,15);assert.equal(body.data.events.length,15);checks+=2;
 body=await(await eventCall('kind=form-submission&formId=missing')).json();assert.equal(body.data.count,0);assert.equal(body.data.pagination.hasMore,false);checks+=2;
 await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:randomUUID(),action:'form-submission',metadata:{formId:7}});assert.equal((await a.auditLogs.list({siteId:site.id,formId:'7'})).pagination.total,0);checks++;
 const selectedContact=randomUUID(),selectedComment=randomUUID();
 await a.auditLogs.record({siteId:site.id,entity:'contact',entityId:selectedContact,action:'contact-sync',metadata:{contactId:'stale-metadata',formId:selectedFormId}});
 await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:randomUUID(),action:'contact-sync',metadata:{contactId:selectedContact,formId:selectedFormId}});
 await a.auditLogs.record({siteId:site.id,entity:'contact',entityId:randomUUID(),action:'contact-sync',metadata:{contactId:selectedContact,formId:selectedFormId}});
 await a.auditLogs.record({siteId:site.id,entity:'comment',entityId:selectedComment,action:'comment-status',metadata:{commentId:'stale-metadata'}});
 await a.auditLogs.record({siteId:site.id,entity:'formSubmission',entityId:randomUUID(),action:'comment-status',metadata:{commentId:selectedComment}});
 await a.auditLogs.record({siteId:site.id,entity:'comment',entityId:randomUUID(),action:'comment-status',metadata:{commentId:selectedComment}});
 body=await(await eventCall('kind=contact-sync&formId='+selectedFormId+'&contactId='+selectedContact+'&limit=1')).json();assert.equal(body.data.count,2);assert.equal(body.data.events.length,1);assert.equal(body.data.events[0].contactId,selectedContact);assert.equal(body.data.pagination.hasMore,true);checks+=4;
 body=await(await eventCall('kind=comment-status&commentId='+selectedComment)).json();assert.equal(body.data.count,2);assert(body.data.events.every((event:any)=>event.commentId===selectedComment));checks+=2;
 const oldList=a.auditLogs.list;let eventReads=0;a.auditLogs.list=async(...args:any[])=>{eventReads++;return oldList.apply(a.auditLogs,args as any)};
 for(denied of [401,403]){response=await eventCall('kind=form-submission&formId='+selectedFormId);assert.equal(response.status,denied);assert.equal(eventReads,0);checks+=2;}denied=0;
 console.log(`Form delivery PostgreSQL PASS ${checks}: actual migration022/repositories/handlers; two workers, scoped oldsource, crash/ambiguity, realSQLsettlementoutage, auditwarning, lineage, counts/RLS, currentrejectioncheck and26 general event SQL filter/count/page/scope checks. Synthetic provider/auth; no configured DB.`);
}finally{await cleanup();}
