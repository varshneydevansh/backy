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
import { verifyModeratorReplies } from '../../../apps/public/scripts/moderator-reply-handler-fixture.mts';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-comments-postgres-');
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
  assert(/^\/tmp\/backy-comments-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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

 const sqlA=connection('comments-writer-a'),sqlB=connection('comments-writer-b'),owner=connection('comments-owner'),monitor=connection('comments-monitor');
 const a=bundle(sqlA),b=bundle(sqlB);
 const team=(await a.teams.create({name:'Disposable comment team',slug:'comments-team',ownerId:null})).item;
 const site=(await a.sites.create({teamId:team.id,name:'Comment proof',slug:'comment-proof',status:'draft'})).item;
 const other=(await a.sites.create({teamId:team.id,name:'Other proof',slug:'other-comment-proof',status:'draft'})).item;
 let deny=false,auditFail=false,audits=0,handlerRepository:any=a;
 const mocks:any={'@/lib/backyStore':{},'@/lib/adminAccess':{requireAdminAccess:async()=>deny?NextResponse.json({success:false},{status:403}):{session:{user:{id:'synthetic-operator'}}}},'@/lib/commentPrivacy':{},'@/lib/commentDelivery':{},'@/lib/commentRepositorySupport':{resolveRepositorySite:async(repositories:any,id:string)=>(await repositories.sites.getById(id))||(await repositories.sites.getBySlug(id))},'@/lib/adminAudit':{recordAdminAudit:async()=>{audits++;if(auditFail)throw Error('private audit destination');}},'@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{}),'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>handlerRepository}};
 const route=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts',mocks);
 const call=(id:string,siteSlug=site.slug)=>route.DELETE(new NextRequest(`http://fixture.invalid/api/sites/${siteSlug}/comments/${id}`,{method:'DELETE'}),{params:Promise.resolve({siteId:siteSlug,commentId:id})});
 const create=async(repository:any,parentId:string|null=null,targetId='page-one',siteId=site.id)=> (await repository.comments.create({siteId,targetType:'page',targetId,parentId,content:'Nested preserved content',authorName:'Private author',authorEmail:'private@example.invalid',authorWebsite:'https://fixture.invalid',status:'pending',requestId:'retained-request',ipHash:'retained-hash'})).item;
 const rows=async()=>await owner`SELECT * FROM comments ORDER BY id`;
 let checks=0;
 // Complete direct and deeper replies beyond the old first100/direct-only behavior.
 let root=await create(a);const nested=await create(a,root.id);const deep=await create(a,nested.id);for(let i=0;i<205;i++)await create(a,root.id);
 const neighbor=await create(a);const foreign=await create(a,null,'page-one',other.id);
 let result=await call(root.id);assert.equal(result.status,200);let body=await result.json();assert.equal(body.data.deletedCount,208);assert.equal(body.data.deleted[0].id,root.id);assert.ok(body.data.deleted.some((c:any)=>c.id===deep.id&&c.authorEmail==='private@example.invalid'));assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(body.data.concurrencyBoundary,'database-site-row-lock');assert.ok(await a.comments.getById(site.id,neighbor.id));assert.ok(await a.comments.getById(other.id,foreign.id));checks++;
 root=await create(a);const reply=await create(a,root.id);await create(a,reply.id);const sibling=await create(a,root.id);result=await call(reply.id);assert.equal((await result.json()).data.deletedCount,2);assert.ok(await a.comments.getById(site.id,root.id));assert.ok(await a.comments.getById(site.id,sibling.id));checks++;
 async function waitForBlocked(name:string){const until=Date.now()+5000;while(Date.now()<until){const [r]=await monitor`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=${name} AND wait_event_type='Lock'`;if(r.count)return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Expected independent comment writer to reach admission lock');}
 // Delete holds site admission; another worker's already-read parent cannot be reused.
 root=await create(a);await create(a,root.id);
 await owner`CREATE FUNCTION pause_comment_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(783219); RETURN OLD; END; $$`;
 await owner`CREATE TRIGGER comment_delete_pause BEFORE DELETE ON comments FOR EACH ROW EXECUTE FUNCTION pause_comment_delete()`;
 await owner`SELECT pg_advisory_lock(783219)`;
 const deleting=call(root.id);await waitForBlocked('comments-writer-a');
 const late=create(b,root.id).then(()=>({ok:true}),error=>({error}));await waitForBlocked('comments-writer-b');
 await owner`SELECT pg_advisory_unlock(783219)`;assert.equal((await deleting).status,200);assert.equal((await late).error.code,'COMMENT_PARENT_CONFLICT');assert.equal(await a.comments.getById(site.id,root.id),null);checks++;
 // A moved reply cannot point at the subtree after deletion finishes.
 root=await create(a);const outsider=await create(a,neighbor.id);await owner`SELECT pg_advisory_lock(783219)`;
 const deleteForMove=call(root.id);await waitForBlocked('comments-writer-a');const move=b.comments.update(site.id,outsider.id,{parentId:root.id}).then(()=>({ok:true}),error=>({error}));await waitForBlocked('comments-writer-b');await owner`SELECT pg_advisory_unlock(783219)`;assert.equal((await deleteForMove).status,200);assert.equal((await move).error.code,'COMMENT_PARENT_CONFLICT');assert.equal((await a.comments.getById(site.id,outsider.id)).parentId,neighbor.id);checks++;
 await owner`DROP TRIGGER comment_delete_pause ON comments`;await owner`DROP FUNCTION pause_comment_delete()`;
 // Reply already admitted in another worker commits first and belongs to the deletion.
 root=await create(a);let entered!:()=>void,release!:()=>void;const acquired=new Promise<void>(resolve=>entered=resolve),hold=new Promise<void>(resolve=>release=resolve);let admittedReply:any;
 const first=drizzle(sqlB,{schema}).transaction(async tx=>{await tx.select().from(schema.sites).where((await import('drizzle-orm')).eq(schema.sites.id,site.id)).for('update');admittedReply=await create(createDatabaseRepositories({adapter:{type:'postgres',db:tx as any,isConnected:async()=>true,close:async()=>{}}}),root.id);entered();await hold;}).then(()=>({ok:true}),error=>({error}));
 await Promise.race([acquired,first.then(outcome=>{if(outcome.error)throw outcome.error;})]);const afterAdmission=call(root.id);await waitForBlocked('comments-writer-a');release();await first;assert.equal((await (await afterAdmission).json()).data.deletedCount,2);assert.equal(await a.comments.getById(site.id,admittedReply.id),null);checks++;
 // Real statement failure on a later row rolls back the entire selected subtree.
 root=await create(a);const doomed=await create(a,root.id);await create(a,doomed.id);const before=await rows();const beforeAudit=audits;
 await owner.unsafe(`CREATE FUNCTION reject_selected_comment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${doomed.id}'::uuid THEN RAISE EXCEPTION 'owned rollback fixture'; END IF; RETURN OLD; END; $$`);
 await owner`CREATE TRIGGER reject_comment_delete BEFORE DELETE ON comments FOR EACH ROW EXECUTE FUNCTION reject_selected_comment()`;
 result=await call(root.id);assert.equal(result.status,500);assert.deepEqual(await rows(),before);assert.equal(audits,beforeAudit);assert.ok(!JSON.stringify(await result.json()).includes('owned rollback fixture'));checks++;
 await owner`DROP TRIGGER reject_comment_delete ON comments`;await owner`DROP FUNCTION reject_selected_comment()`;
 // Legacy cross-target and cyclic descendants fail closed without leaking identities.
 await owner`UPDATE comments SET target_id='another-page' WHERE id=${doomed.id}`;result=await call(root.id);assert.equal(result.status,409);assert.equal((await result.json()).error.code,'COMMENT_TREE_INVALID');assert.ok(await a.comments.getById(site.id,root.id));await owner`UPDATE comments SET target_id='page-one' WHERE id=${doomed.id}`;checks++;
 await owner`UPDATE comments SET parent_id=${doomed.id} WHERE id=${root.id}`;result=await call(root.id);assert.equal(result.status,409);assert.equal((await result.json()).error.code,'COMMENT_TREE_INVALID');await owner`UPDATE comments SET parent_id=NULL WHERE id=${root.id}`;checks++;
 result=await call(foreign.id);assert.equal(result.status,404);assert.ok(await a.comments.getById(other.id,foreign.id));deny=true;assert.equal((await call(root.id)).status,403);deny=false;checks++;
 auditFail=true;result=await call(root.id);assert.equal(result.status,200);body=await result.json();assert.deepEqual(body.data.completionWarnings,['COMMENT_AUDIT_PENDING']);assert.equal(await a.comments.getById(site.id,root.id),null);auditFail=false;checks++;
 await assert.rejects(createCommentRepository(drizzle(sqlA,{schema}),'sqlite').deleteSubtree(site.id,neighbor.id),(e:any)=>e.code==='COMMENT_LIFECYCLE_UNAVAILABLE');checks++;
 const beforeMissing=await rows();handlerRepository={...a,comments:{...a.comments,deleteSubtree:undefined}};result=await call(neighbor.id);assert.equal(result.status,503);assert.equal((await result.json()).error.code,'COMMENT_LIFECYCLE_UNAVAILABLE');assert.deepEqual(await rows(),beforeMissing);handlerRepository=a;checks++;
 const threaded=await create(a);await a.comments.update(site.id,threaded.id,{commentThreadId:'current-thread'});
 await assert.rejects(b.comments.create({siteId:site.id,targetType:'page',targetId:'page-one',parentId:threaded.id,commentThreadId:'stale-thread',content:'Stale thread'}),(e:any)=>e.code==='COMMENT_PARENT_CONFLICT');
 assert.equal((await create(b,threaded.id)).commentThreadId,'current-thread');checks++;
 // Actual helper reports must increment from admitted state, never a caller's pre-read snapshot.
 const reportSite=(await a.sites.create({teamId:team.id,name:'Report proof',slug:'atomic-report-proof',status:'published'})).item;
 const reportPage=(await a.pages.create({siteId:reportSite.id,title:'Report target',slug:'report-target',status:'published',content:{schemaVersion:'backy.content.v1',id:'target',kind:'page',elements:[],editableMap:{}} as any})).item;
 const helperMocks:any={'@/lib/backyStore':{getCommentReportReasons:()=>['spam','harassment','abuse','other']}};
 const reportHelper=loadMediaFixture('../src/lib/commentRepositorySupport.ts',helperMocks);
 const makeReported=async()=> (await a.comments.create({siteId:reportSite.id,targetType:'page',targetId:reportPage.id,content:'Report concurrency text',authorName:'Author',authorEmail:'private@example.invalid',status:'approved',requestId:'original-request'})).item;
 const reported=await makeReported(),snapshotA=await a.comments.getById(reportSite.id,reported.id),snapshotB=await b.comments.getById(reportSite.id,reported.id);
 await Promise.all([reportHelper.reportRepositoryComment(a,reportSite.id,snapshotA,{reason:'spam',actor:'reporter-a'}),reportHelper.reportRepositoryComment(b,reportSite.id,snapshotB,{reason:'harassment',actor:'reporter-b'})]);
 const concurrent=await a.comments.getById(reportSite.id,reported.id);
 const moderated=await makeReported(),stale=await a.comments.getById(reportSite.id,moderated.id);
 await b.comments.update(reportSite.id,moderated.id,{status:'rejected',content:'New moderator content',reviewedBy:'current-moderator',rejectionReason:'Current moderation'});
 const staleOutcome=await reportHelper.reportRepositoryComment(a,reportSite.id,stale,{reason:'abuse',actor:'stale-reporter'}).then(()=>({ok:true}),error=>({error}));
 const afterModerator=await a.comments.getById(reportSite.id,moderated.id);
 console.log(JSON.stringify({actualReportReproduction:{concurrentCount:concurrent.reportCount,reasons:concurrent.reportReasons,statusAfterStaleReport:afterModerator.status,staleError:staleOutcome.error?.code||null}}));
 assert.equal(concurrent.reportCount,2,'Two independent actual helper reports retain both increments');
 assert.deepEqual([...concurrent.reportReasons].sort(),['harassment','spam']);checks++;
 assert.equal(staleOutcome.error?.code,'COMMENT_REPORT_CONFLICT','Changed moderation is rejected at report admission');assert.equal(afterModerator.status,'rejected');assert.equal(afterModerator.content,'New moderator content');assert.equal(afterModerator.reviewedBy,'current-moderator');checks++;
 // Prove a queued independent report shares the same site admission as
 // moderation/deletion, not merely a lock local to one JS repository instance.
 for(const action of ['moderate','delete']){
   const waiting=await makeReported();let unlock!:()=>void,locked!:()=>void;
   const released=new Promise<void>(resolve=>unlock=resolve),entered=new Promise<void>(resolve=>locked=resolve);
   const mutator=owner.begin(async tx=>{
     await tx`SELECT id FROM sites WHERE id=${reportSite.id} FOR UPDATE`;locked();await released;
     if(action==='moderate')await tx`UPDATE comments SET status='rejected',content='Admitted newer moderation',reviewed_by='actual-moderator' WHERE id=${waiting.id}`;
     else await tx`DELETE FROM comments WHERE id=${waiting.id}`;
   });
   await entered;
   const queued=reportHelper.reportRepositoryComment(b,reportSite.id,waiting,{reason:'spam'}).then(()=>({ok:true}),error=>({error}));
   try{await waitForBlocked('comments-writer-b');}finally{unlock();}
   await mutator;const outcome=await queued;assert.equal(outcome.error?.code,'COMMENT_REPORT_CONFLICT');
   const retained=await a.comments.getById(reportSite.id,waiting.id);
   if(action==='delete')assert.equal(retained,null);else{assert.equal(retained.status,'rejected');assert.equal(retained.content,'Admitted newer moderation');assert.equal(retained.reportCount,0);}checks++;
 }
 // A report cannot act as a moderator or replay an unrelated stale field.
 const edited=await makeReported(),beforeEdit=await a.comments.getById(reportSite.id,edited.id);
 await b.comments.update(reportSite.id,edited.id,{content:'Current author content',reviewedBy:'actual-moderator',reviewedAt:'2026-01-01T00:00:00Z',commentThreadId:'current-thread'});
 const currentEdit=await a.comments.getById(reportSite.id,edited.id);
 await reportHelper.reportRepositoryComment(a,reportSite.id,beforeEdit,{reason:'other',actor:'untrusted-reporter'});
 const afterEdit=await a.comments.getById(reportSite.id,edited.id);
 for(const key of Object.keys(currentEdit).filter(key=>!['reportCount','reportReasons','updatedAt'].includes(key)))assert.deepEqual(afterEdit[key],currentEdit[key],key);
 assert.equal(afterEdit.reportCount,1);checks++;
 await reportHelper.reportRepositoryComment(a,reportSite.id,snapshotA,{reason:'other'});
 assert.equal((await a.comments.getById(reportSite.id,reported.id)).status,'spam');
 await assert.rejects(reportHelper.reportRepositoryComment(b,reportSite.id,snapshotB,{reason:'abuse'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');
 assert.equal((await a.comments.getById(reportSite.id,reported.id)).reportCount,3);checks++;
 const deletedReport=await makeReported();await b.comments.deleteSubtree(reportSite.id,deletedReport.id);
 await assert.rejects(reportHelper.reportRepositoryComment(a,reportSite.id,deletedReport,{reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');checks++;
 await assert.rejects(a.comments.report(other.id,edited.id,{reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');
 await assert.rejects(createCommentRepository(drizzle(sqlA,{schema}),'sqlite').report(reportSite.id,edited.id,{reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_UNAVAILABLE');checks++;
 const visibility=await makeReported(),visibilitySnapshot=await a.comments.getById(reportSite.id,visibility.id);
 await b.pages.update(reportSite.id,reportPage.id,{status:'draft'});
 await assert.rejects(reportHelper.reportRepositoryComment(a,reportSite.id,visibilitySnapshot,{reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');
 assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reportCount,0);await b.pages.update(reportSite.id,reportPage.id,{status:'published'});checks++;
 await b.sites.update(reportSite.id,{settings:{commentPolicy:{enableReports:false}}});
 await assert.rejects(reportHelper.reportRepositoryComment(a,reportSite.id,visibilitySnapshot,{reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');
 assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reportCount,0);await b.sites.update(reportSite.id,{settings:{commentPolicy:{enableReports:true}}});checks++;
 await b.sites.update(reportSite.id,{status:'draft'});
 await assert.rejects(reportHelper.reportRepositoryComment(a,reportSite.id,visibilitySnapshot,{reason:'spam'}),(e:any)=>e.code==='COMMENT_REPORT_CONFLICT');
 await b.sites.update(reportSite.id,{status:'published'});checks++;
 // Exercise the actual public route and real SQL admission, including a mutation
 // after public visibility preflight but before the locked report operation.
 let reportRepository:any=a,preReport:()=>Promise<void>=async()=>{},deliveryFail=false;
 const reportMocks:any={...helperMocks,'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>reportRepository},'@/lib/commentRepositorySupport':reportHelper,'@/lib/commentPolicy':loadMediaFixture('../src/lib/commentPolicy.ts',{}),'@/lib/commentDelivery':{notifyCommentDelivery:async()=>({failedChannels:deliveryFail?1:0})},'@/lib/publicContractResponse':loadMediaFixture('../src/lib/publicContractResponse.ts',{}),'@/lib/visitor-auth/routes':{},'@/lib/visitor-auth/session':{}};
 const actualPrivacy=loadMediaFixture('../src/lib/commentPrivacy.ts',reportMocks);
 reportMocks['@/lib/commentPrivacy']={...actualPrivacy,isCommentPubliclyVisible:async(...args:any[])=>{const visible=await actualPrivacy.isCommentPubliclyVisible(...args);await preReport();return visible;}};
 const reportRoute=loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts',reportMocks);
 const reportCall=(id:string,payload:any={reason:'spam'},siteSlug=reportSite.slug)=>reportRoute.POST(new NextRequest('http://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),{params:Promise.resolve({siteId:siteSlug,commentId:id})});
 const raced=await makeReported();preReport=async()=>{await b.comments.update(reportSite.id,raced.id,{status:'blocked',blockReason:'Current decision',blockedBy:'current-moderator'});};
 result=await reportCall(raced.id);body=await result.json();assert.equal(result.status,409,JSON.stringify(body));assert.equal(body.error.code,'COMMENT_REPORT_CONFLICT');assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await a.comments.getById(reportSite.id,raced.id)).reportCount,0);assert.equal((await a.comments.getById(reportSite.id,raced.id)).status,'blocked');checks++;
 preReport=async()=>{};reportRepository={...a,comments:{...a.comments,report:undefined}};result=await reportCall(visibility.id);assert.equal(result.status,503);assert.equal((await result.json()).error.code,'COMMENT_REPORT_UNAVAILABLE');assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reportCount,0);checks++;
 reportRepository={...a,auditLogs:{...a.auditLogs,record:async()=>{throw Error('private activity credential');}}};deliveryFail=true;
 result=await reportCall(visibility.id,{reason:'spam',actor:'arbitrary-reporter'});body=await result.json();assert.equal(result.status,201,JSON.stringify(body));assert.deepEqual(body.data.completionWarnings,['COMMENT_ACTIVITY_PENDING','COMMENT_DELIVERY_PENDING']);assert.equal(body.data.comment.authorEmail,undefined);assert.equal(body.data.comment.reportReasons,undefined);assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reportCount,1);assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reviewedBy,null);assert(!JSON.stringify(body).includes('credential'));checks++;
 reportRepository=a;deliveryFail=false;result=await reportCall(visibility.id,{reason:'unsupported'});assert.equal(result.status,400);assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reportCount,1);result=await reportCall(visibility.id,{reason:'spam'},other.slug);assert.equal(result.status,404);checks++;
 // A late SQL report update failure rolls back before activity or delivery.
 await owner.unsafe(`CREATE FUNCTION fail_report_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${visibility.id}'::uuid AND NEW.report_count > OLD.report_count THEN RAISE EXCEPTION 'private report storage failure'; END IF; RETURN NEW; END $$`);
 await owner`CREATE TRIGGER fail_report_update BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION fail_report_update()`;
 result=await reportCall(visibility.id);body=await result.json();assert.equal(result.status,500);assert.equal((await a.comments.getById(reportSite.id,visibility.id)).reportCount,1);assert(!JSON.stringify(body).includes('storage'));await owner`DROP TRIGGER fail_report_update ON comments`;await owner`DROP FUNCTION fail_report_update()`;checks++;
 // Atomic moderation must include all requested comments and identity blocks.
 const blockedFailure=(await a.comments.create({siteId:reportSite.id,targetType:'page',targetId:reportPage.id,content:'Block transaction',authorEmail:'block-atomic@example.invalid',ipHash:'atomic-block-ip',status:'approved'})).item;
 await owner.unsafe(`CREATE FUNCTION fail_moderation_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${blockedFailure.id}'::uuid THEN RAISE EXCEPTION 'private moderation failure'; END IF; RETURN NEW; END $$`);
 await owner`CREATE TRIGGER fail_moderation_update BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION fail_moderation_update()`;
 const blockBefore=(await a.comments.listBlocklist({siteId:reportSite.id,limit:100})).pagination.total;
 await assert.rejects(reportHelper.updateRepositoryCommentStatus(a,reportSite.id,blockedFailure,{status:'blocked',completionWarnings:[]}));
 const blockAfter=(await a.comments.listBlocklist({siteId:reportSite.id,limit:100})).pagination.total;
 await owner`DROP TRIGGER fail_moderation_update ON comments`;await owner`DROP FUNCTION fail_moderation_update()`;
 const bulkFirst=await makeReported(),bulkSecond=await makeReported();await a.comments.update(reportSite.id,bulkFirst.id,{status:'pending'});await a.comments.update(reportSite.id,bulkSecond.id,{status:'pending'});
 const moderationMocks:any={...reportMocks,'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-operator'}}})},'@/lib/adminAudit':{recordAdminAudit:async()=>{}}};
 const bulkRoute=loadMediaFixture('../src/app/api/sites/[siteId]/comments/route.ts',moderationMocks);
 await owner.unsafe(`CREATE FUNCTION fail_moderation_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${bulkSecond.id}'::uuid THEN RAISE EXCEPTION 'private later moderation failure'; END IF; RETURN NEW; END $$`);
 await owner`CREATE TRIGGER fail_moderation_update BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION fail_moderation_update()`;
 result=await bulkRoute.PATCH(new NextRequest('http://fixture.invalid',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({commentIds:[bulkFirst.id,bulkSecond.id],status:'approved'})}),{params:Promise.resolve({siteId:reportSite.slug})});
 const bulkResponseStatus=result.status,bulkAfterFirst=await a.comments.getById(reportSite.id,bulkFirst.id),bulkAfterSecond=await a.comments.getById(reportSite.id,bulkSecond.id);
 await owner`DROP TRIGGER fail_moderation_update ON comments`;await owner`DROP FUNCTION fail_moderation_update()`;
 const staleFlags=await makeReported();await a.comments.update(reportSite.id,staleFlags.id,{status:'blocked',blockReason:'old-reason',blockedBy:'old-moderator'});const staleFlagsSnapshot=await a.comments.getById(reportSite.id,staleFlags.id);await b.comments.update(reportSite.id,staleFlags.id,{status:'blocked',blockReason:'current-reason',blockedBy:'current-moderator'});
 await reportHelper.updateRepositoryCommentStatus(a,reportSite.id,staleFlagsSnapshot,{status:'rejected',completionWarnings:[]});const flagsAfter=await a.comments.getById(reportSite.id,staleFlags.id);
 console.log(JSON.stringify({moderationReproduction:{blockBefore,blockAfter,bulkResponseStatus,first:bulkAfterFirst.status,second:bulkAfterSecond.status,staleReplayedBlockReason:flagsAfter.blockReason}}));
 assert.equal(blockAfter,blockBefore,'Failed blocked status does not commit identity blocks');checks++;
 assert.equal(bulkResponseStatus,500);assert.equal(bulkAfterFirst.status,'pending','A later selected update failure rolls back the first selected update');assert.equal(bulkAfterSecond.status,'pending');checks++;
 assert.equal(flagsAfter.blockReason,'current-reason','Status intent never replays caller snapshot block metadata');checks++;
 // Successful atomic batches retain explicit missing scoped IDs and ordering.
 const missingId=randomUUID(),foreignSelection=await create(a,null,'page-one',other.id);
 const batch=await reportHelper.moderateRepositoryComments(a,reportSite.id,{commentIds:[bulkFirst.id,bulkSecond.id,bulkFirst.id,missingId,foreignSelection.id],status:'blocked',actor:'actual-moderator',blockReason:'custom operator reason',completionWarnings:[]});
 assert.deepEqual(batch.updated.map((c:any)=>c.id),[bulkFirst.id,bulkSecond.id]);assert.deepEqual(batch.missingIds,[missingId,foreignSelection.id]);assert(batch.updated.every((c:any)=>c.status==='blocked'&&c.blockReason==='custom operator reason'));assert.equal((await a.comments.getById(other.id,foreignSelection.id)).status,'pending');checks++;
 await assert.rejects(createCommentRepository(drizzle(sqlA,{schema}),'sqlite').moderateBatch(reportSite.id,{commentIds:[bulkFirst.id],status:'approved'}),(e:any)=>e.code==='COMMENT_MODERATION_UNAVAILABLE');checks++;
 reportRepository={...a,comments:{...a.comments,moderateBatch:undefined}};
 result=await bulkRoute.PATCH(new NextRequest('http://fixture.invalid',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({commentIds:[bulkFirst.id],status:'approved'})}),{params:Promise.resolve({siteId:reportSite.slug})});assert.equal(result.status,503);assert.equal((await result.json()).error.code,'COMMENT_MODERATION_UNAVAILABLE');assert.equal((await a.comments.getById(reportSite.id,bulkFirst.id)).status,'blocked');reportRepository=a;checks++;
 // A direct two-identity upsert rolls back its first write on a later failure.
 await owner`CREATE FUNCTION fail_blocklist_ip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value='isolated-identity-ip' THEN RAISE EXCEPTION 'private identity failure'; END IF; RETURN NEW; END $$`;
 await owner`CREATE TRIGGER fail_blocklist_ip BEFORE INSERT OR UPDATE ON comment_blocklist FOR EACH ROW EXECUTE FUNCTION fail_blocklist_ip()`;
 const identityBefore=await owner`SELECT * FROM comment_blocklist ORDER BY id`;
 await assert.rejects(a.comments.blockIdentity({siteId:reportSite.id,reason:'atomic identity',email:'isolated-identity@example.invalid',ipHash:'isolated-identity-ip'}));assert.deepEqual(await owner`SELECT * FROM comment_blocklist ORDER BY id`,identityBefore);
 await owner`DROP TRIGGER fail_blocklist_ip ON comment_blocklist`;await owner`DROP FUNCTION fail_blocklist_ip()`;checks++;
 const unblock=await a.comments.blockIdentity({siteId:reportSite.id,reason:'Blocklist delete proof',email:'delete-identity@example.invalid',ipHash:'delete-identity-ip'}),otherBlocks=await a.comments.blockIdentity({siteId:other.id,reason:'Foreign proof',email:'foreign@example.invalid'});
 await owner.unsafe(`CREATE FUNCTION fail_blocklist_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${unblock[1].id.replace(/'/g,"''")}' THEN RAISE EXCEPTION 'private late delete failure'; END IF; RETURN OLD; END $$`);
 await owner`CREATE TRIGGER fail_blocklist_delete BEFORE DELETE ON comment_blocklist FOR EACH ROW EXECUTE FUNCTION fail_blocklist_delete()`;
 const deleteBefore=await owner`SELECT * FROM comment_blocklist ORDER BY id`;await assert.rejects(a.comments.deleteBlocklistEntries(reportSite.id,unblock.map((e:any)=>e.id)));assert.deepEqual(await owner`SELECT * FROM comment_blocklist ORDER BY id`,deleteBefore);await owner`DROP TRIGGER fail_blocklist_delete ON comment_blocklist`;await owner`DROP FUNCTION fail_blocklist_delete()`;checks++;
 let blockAuditFail=true;moderationMocks['@/lib/adminAudit']={recordAdminAudit:async()=>{if(blockAuditFail)throw Error('private postcommit audit credential');}};
 const unblockRoute=loadMediaFixture('../src/app/api/sites/[siteId]/comments/blocklist/route.ts',moderationMocks);
 const unblockCall=()=>unblockRoute.DELETE(new NextRequest('http://fixture.invalid',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({ids:[...unblock.map((e:any)=>e.id),otherBlocks[0].id,'missing-block']})}),{params:Promise.resolve({siteId:reportSite.slug})});
 result=await unblockCall();body=await result.json();assert.equal(result.status,200,JSON.stringify(body));assert.deepEqual(body.data.completionWarnings,['COMMENT_AUDIT_PENDING']);assert.equal(body.data.concurrencyBoundary,'database-site-row-lock');assert.equal(body.data.deletedCount,2);assert.deepEqual(body.data.missingIds,[otherBlocks[0].id,'missing-block']);assert.equal(result.headers.get('cache-control'),'no-store');assert((await a.comments.listBlocklist({siteId:other.id})).items.some((e:any)=>e.id===otherBlocks[0].id));assert(!JSON.stringify(body).includes('credential'));checks++;
 blockAuditFail=false;result=await unblockCall();assert.deepEqual((await result.json()).data.completionWarnings,[]);checks++;
 // Persisted identity admission: actual classifier + both HTTP handlers + SQL.
 // Baseline returned201 and created a row despite this database identity block.
 {
   const fixtureProcess={...process,cwd:()=>clusterRoot},storeMocks:any={'@/lib/backyStore':{}};
   for(const name of ['collectionDefinitionVersion','formDefinitionVersion','demoFormDeliveryJournal','demoCommentDeliveryJournal','demoSiteDuplicationPersistence','collectionRoutes','navigation','redirectRules','templateInstanceProvenance','adminCollectionFields','adminFormFieldPolicy','frontendDesignContract','mediaScope','siteLocalization','demoSiteBackupPersistence'])storeMocks['@/lib/'+name]=loadMediaFixture('../src/lib/'+name+'.ts',storeMocks,fixtureProcess);
   const actualStore=loadMediaFixture('../src/lib/backyStore.ts',storeMocks,fixtureProcess);Object.assign(storeMocks['@/lib/backyStore'],actualStore);
   const moderatorTargets:any[]=[];
   for(const type of ['page','post'] as const)for(const status of ['draft','archived','published'] as const){
     const target=(await (type==='page'?a.pages:a.posts).create({siteId:reportSite.id,title:'Moderator '+type+' '+status,slug:'moderator-'+type+'-'+status,status,content:{schemaVersion:'backy.content.v1',id:'moderator',kind:type==='page'?'page':'blogPost',elements:[],editableMap:{}} as any})).item;
     moderatorTargets.push({...target,type});
   }
   const moderatorChecks=await verifyModeratorReplies({repositories:a,secondaryRepositories:b,unsupportedRepositories:{...a,comments:createCommentRepository(drizzle(sqlA,{schema}),'sqlite')},store:actualStore,demo:false,site:reportSite,other,targets:moderatorTargets});
   checks+=moderatorChecks;
   console.log('Moderator private reply actual PostgreSQL handler/admission PASS '+moderatorChecks+' checks; draft/archived/published pages+posts, pending/approved visibility, denied/missing/foreign/forged no-write, persisted parent revalidation and saved activity/audit/delivery warnings.');

   let submissionRepository:any=a,submissionCredentials=false,submissionDenied=false,submissionDeliveryFail=false;
   const submissionMocks:any={...reportMocks,'@/lib/backyStore':actualStore,'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>submissionRepository},'@/lib/adminAccess':{requireAdminAccess:async()=>submissionDenied?NextResponse.json({success:false},{status:403}):{session:{user:{id:'synthetic-operator'}}}},'@/lib/commentCaptcha':{verifyCommentCaptcha:async()=>null},'@/lib/commentDelivery':{notifyCommentDelivery:async()=>({failedChannels:submissionDeliveryFail?1:0})},'@/lib/commentPrivacy':{...actualPrivacy,hasCommentCredentials:()=>submissionCredentials,resolveCommentVisitor:async()=>null}};
   const submitPage=loadMediaFixture('../src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts',submissionMocks),submitBlog=loadMediaFixture('../src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts',submissionMocks);
   const post=(await a.posts.create({siteId:reportSite.id,title:'Submission blog target',slug:'submission-blog-target',status:'published',content:{schemaVersion:'backy.content.v1',id:'blog',kind:'blogPost',elements:[],editableMap:{}} as any})).item;
   let sequence=0;
   const submit=(family:'page'|'post',email:string,extras:any={},ip?:string)=>{
     const unique=++sequence,headers:any={'content-type':'application/json','x-forwarded-for':ip||'submission-fixture-ip-'+unique};
     const target=family==='page'?reportPage.id:post.id,route=family==='page'?submitPage:submitBlog;
     return route.POST(new NextRequest('http://fixture.invalid',{method:'POST',headers,body:JSON.stringify({content:'Fresh public authored comment '+unique,authorName:'Fixture guest',authorEmail:email,...extras})}),{params:Promise.resolve({siteId:reportSite.slug,...(family==='page'?{pageId:target}:{postId:target})})});
   };
   const count=async()=> (await owner`SELECT count(*)::int AS total FROM comments WHERE site_id=${reportSite.id}`)[0].total;
   const blockedEmail='persisted-block@example.invalid';await a.comments.blockIdentity({siteId:reportSite.id,reason:'private operator reason',email:blockedEmail});
   for(const family of ['page','post'] as const){
     const before=await count(),response=await submit(family,'  PERSISTED-BLOCK@EXAMPLE.INVALID  '),payload=await response.json();
     assert.equal(response.status,422,JSON.stringify(payload));assert.equal(payload.error.code,'COMMENT_IDENTITY_BLOCKED');assert.equal(await count(),before);assert.equal(response.headers.get('cache-control'),'no-store');assert(!JSON.stringify(payload).includes('private operator reason'));checks++;
   }
   const blockedIp='Persisted-Fixture-IP';await a.comments.blockIdentity({siteId:reportSite.id,reason:'ip proof',ipHash:blockedIp});
   const beforeIp=await count(),ipResponse=await submit('page','not-email-blocked@example.invalid',{},'PERSISTED-FIXTURE-IP, second-proxy');assert.equal(ipResponse.status,422);assert.equal((await ipResponse.json()).error.code,'COMMENT_IDENTITY_BLOCKED');assert.equal(await count(),beforeIp);checks++;
   // A foreign site's same identity must not deny this site. Legacy row IDs are
   // not authority: the exact scoped type/value is checked rather than ID format.
   const foreignEmail='foreign-only-block@example.invalid';await a.comments.blockIdentity({siteId:other.id,reason:'foreign block',email:foreignEmail});
   let response=await submit('post',foreignEmail),payload=await response.json();assert.equal(response.status,201,JSON.stringify(payload));assert.equal(payload.data.comment.status,'pending');assert.deepEqual(payload.data.completionWarnings,[]);checks++;
   await owner`INSERT INTO comment_blocklist(id,site_id,type,value,reason) VALUES('legacy-identity-key',${reportSite.id},'email','legacy-block@example.invalid','private legacy reason')`;
   const beforeLegacy=await count();response=await submit('post','legacy-block@example.invalid');assert.equal(response.status,422);assert.equal(await count(),beforeLegacy);checks++;
   // Explicit operator publication cannot bypass the identity block or rewrite
   // guest attribution. Authorization still precedes admission when requested.
   submissionCredentials=true;const beforeOfficial=await count();response=await submit('page',blockedEmail,{moderationMode:'auto-approve'});assert.equal(response.status,422);assert.equal(await count(),beforeOfficial);checks++;
   submissionDenied=true;response=await submit('post','denied-author@example.invalid',{moderationMode:'auto-approve'});assert.equal(response.status,403);assert.equal(await count(),beforeOfficial);submissionDenied=false;submissionCredentials=false;checks++;
   // A queued public writer observes a concurrently admitted block transaction.
   await owner`CREATE FUNCTION pause_identity_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value='concurrent-block@example.invalid' THEN PERFORM pg_advisory_xact_lock(783220); END IF; RETURN NEW; END; $$`;
   await owner`CREATE TRIGGER pause_identity_insert BEFORE INSERT ON comment_blocklist FOR EACH ROW EXECUTE FUNCTION pause_identity_insert()`;
   await owner`SELECT pg_advisory_lock(783220)`;
   const blocking=a.comments.blockIdentity({siteId:reportSite.id,reason:'concurrent block',email:'concurrent-block@example.invalid'});await waitForBlocked('comments-writer-a');
   submissionRepository=b;const beforeBlock=await count(),queuedBlocked=submit('page','concurrent-block@example.invalid');await waitForBlocked('comments-writer-b');await owner`SELECT pg_advisory_unlock(783220)`;await blocking;response=await queuedBlocked;assert.equal(response.status,422);assert.equal(await count(),beforeBlock);checks++;
   await owner`DROP TRIGGER pause_identity_insert ON comment_blocklist`;await owner`DROP FUNCTION pause_identity_insert()`;
   // A queued writer after unblock observes removal and may commit normally.
   const unblockingEntries=await a.comments.blockIdentity({siteId:reportSite.id,reason:'unblock proof',email:'concurrent-unblock@example.invalid'});
   await owner`CREATE FUNCTION pause_identity_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.value='concurrent-unblock@example.invalid' THEN PERFORM pg_advisory_xact_lock(783221); END IF; RETURN OLD; END; $$`;
   await owner`CREATE TRIGGER pause_identity_delete BEFORE DELETE ON comment_blocklist FOR EACH ROW EXECUTE FUNCTION pause_identity_delete()`;
   await owner`SELECT pg_advisory_lock(783221)`;
   const unblocking=a.comments.deleteBlocklistEntries(reportSite.id,unblockingEntries.map((e:any)=>e.id));await waitForBlocked('comments-writer-a');
   const beforeUnblock=await count(),queuedUnblocked=submit('post','concurrent-unblock@example.invalid');await waitForBlocked('comments-writer-b');await owner`SELECT pg_advisory_unlock(783221)`;await unblocking;response=await queuedUnblocked;payload=await response.json();assert.equal(response.status,201,JSON.stringify(payload));assert.equal(await count(),beforeUnblock+1);assert.equal(payload.data.comment.status,'pending');checks++;
   await owner`DROP TRIGGER pause_identity_delete ON comment_blocklist`;await owner`DROP FUNCTION pause_identity_delete()`;
   // Creation admitted first may finish; the later block controls subsequent
   // submissions, without deleting the prior admitted authored comment.
   await owner`CREATE FUNCTION pause_submission_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.author_email='prior-admission@example.invalid' THEN PERFORM pg_advisory_xact_lock(783222); END IF; RETURN NEW; END; $$`;
   await owner`CREATE TRIGGER pause_submission_insert BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION pause_submission_insert()`;
   await owner`SELECT pg_advisory_lock(783222)`;submissionRepository=a;
   const admittedFirst=submit('page','prior-admission@example.invalid');await waitForBlocked('comments-writer-a');const laterBlock=b.comments.blockIdentity({siteId:reportSite.id,reason:'later block',email:'prior-admission@example.invalid'});await waitForBlocked('comments-writer-b');await owner`SELECT pg_advisory_unlock(783222)`;response=await admittedFirst;payload=await response.json();assert.equal(response.status,201,JSON.stringify(payload));const admittedId=payload.data.comment.id;await laterBlock;response=await submit('page','prior-admission@example.invalid');assert.equal(response.status,422);assert.equal((await a.comments.getById(reportSite.id,admittedId)).status,'pending');checks++;
   await owner`DROP TRIGGER pause_submission_insert ON comments`;await owner`DROP FUNCTION pause_submission_insert()`;
   // Unsupported adapters cannot create without authoritative admission.
   submissionRepository={...a,comments:createCommentRepository(drizzle(sqlA,{schema}),'sqlite')};const beforeUnsupported=await count();response=await submit('post','unsupported@example.invalid');payload=await response.json();assert.equal(response.status,503);assert.equal(payload.error.code,'COMMENT_SUBMISSION_UNAVAILABLE');assert.equal(await count(),beforeUnsupported);assert.equal(response.headers.get('cache-control'),'no-store');checks++;
   submissionRepository=a;response=await submit('page','honeypot@example.invalid',{honeypot:'filled'});payload=await response.json();assert.equal(response.status,422);assert.equal(payload.error.code,'VALIDATION_ERROR');assert.deepEqual(payload.spamFlags,['honeypot']);assert.equal(await count(),beforeUnsupported);checks++;
   // Allowed admission retains saved-warning behavior and private projection.
   submissionDeliveryFail=true;response=await submit('post','allowed-warnings@example.invalid');payload=await response.json();assert.equal(response.status,201,JSON.stringify(payload));assert.deepEqual(payload.data.completionWarnings,['COMMENT_DELIVERY_PENDING']);assert.equal(payload.data.comment.authorEmail,undefined);assert.equal((await a.comments.getById(reportSite.id,payload.data.comment.id)).authorEmail,'allowed-warnings@example.invalid');checks++;
   // Demo classification keeps identity lookup by default; the trusted SQL
   // classifier option bypasses only that lookup, leaving honeypot intact.
   actualStore.blockCommentIdentity({siteId:'site-demo',reason:'demo reason',email:'demo-block@example.invalid'});
   const classify={siteId:'site-demo',targetType:'page',targetId:'page-home',content:'Separate demo identity classification',authorEmail:'demo-block@example.invalid',moderationMode:'manual'};
   assert.equal(actualStore.validateAndClassifyComment(classify).status,'blocked');assert.equal(actualStore.validateAndClassifyComment({...classify,checkBlockedIdentity:false}).ok,true);assert.deepEqual(Array.from(actualStore.validateAndClassifyComment({...classify,checkBlockedIdentity:false,honeypot:'filled'}).spamFlags),['honeypot']);checks++;
 }
 // Complete inventory cap is explicit and refuses writes (never first100 success).
 await owner`INSERT INTO comments(site_id,target_type,target_id,content) SELECT ${site.id}::uuid,'page','inventory-tail','Tail' FROM generate_series(1,100001)`;
 const countBefore=(await owner`SELECT count(*)::int AS total FROM comments WHERE site_id=${site.id}`)[0].total;result=await call(neighbor.id);assert.equal(result.status,503);assert.equal((await result.json()).error.code,'COMMENT_INVENTORY_INCOMPLETE');assert.equal((await owner`SELECT count(*)::int AS total FROM comments WHERE site_id=${site.id}`)[0].total,countBefore);checks++;
 console.log(`Comment lifecycle isolated PostgreSQL PASS: ${checks} actual handler/repository checks; complete208 nested subtree, selected-reply descendants, independent waiting reply/move denial, prior admitted reply included, late SQL rollback, invalid legacy relationships, tenant/privacy/auth, postcommit audit warning, unsupported adapter, current-parent thread, atomic independent reports, stale moderation/visibility/deletion denial, threshold and attribution preservation, real route409/503/no-store, report rollback/followup warnings, atomic bulk/status/identity rollback and current metadata, explicit missing/tenant results, blocklist rollback/audit warnings, persisted identity public intake422/no-row, concurrent block/unblock order and100000 cap; ${migrations.length} migrations. Synthetic operator; no configured database/provider.`);
} catch(error){console.error(error);process.exitCode=1;}
finally{await cleanup();console.log('Owned socket-only cluster stopped and removed; no configured database was used.');}
