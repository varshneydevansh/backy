// Own disposable socket-only PostgreSQL cluster. No configured database target is read or accepted.
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
import { runVisitorManagementProof } from '../../../apps/public/scripts/visitor-management-smoke.mts';
import { runWebsiteBridgeProof } from '../../../apps/public/scripts/visitor-content-bridge-smoke.mts';
import { runProtectedContentProof } from '../../../apps/public/scripts/visitor-protected-content-smoke.mts';
import { runVisitorAuthProof } from '../../../apps/public/scripts/visitor-auth-smoke.mts';
if (process.argv.length > 2) throw new Error('No database target arguments allowed.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaries = '/opt/homebrew/bin';
for (const binary of ['initdb','pg_ctl','psql']) assert(existsSync(join(binaries,binary)), `Missing local PostgreSQL: ${binary}`);
const scratch = mkdtempSync('/tmp/backy-visitor-postgres-'), data = join(scratch,'cluster'), socket = join(scratch,'socket');
const port = randomInt(20000,60000), user = 'backy_visitor_fixture';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL','BACKY_DATABASE_URL'].includes(key)));
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || ['DATABASE_URL','BACKY_DATABASE_URL'].includes(key)) delete process.env[key];
const run = (binary: string, args: string[]) => execFileSync(join(binaries,binary), args, { env, timeout: 30000, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
let client: any;
try {
 run('initdb',['-D',data,'--username',user,'--encoding','UTF8','--no-locale','--auth-local','trust','--auth-host','reject']);
 mkdirSync(socket,{mode:0o700}); writeFileSync(join(data,'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\n`);
 run('pg_ctl',['-D',data,'-l',join(scratch,'log'),'-w','-t','15','start']);
 const args = ['-X','--no-password','-h',socket,'-p',String(port),'-U',user,'-d','postgres','--set','ON_ERROR_STOP=1'];
 run('psql',[...args,'-c',`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`]);
 for (const migration of readdirSync(join(root,'supabase/migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort()) run('psql',[...args,'-f',join(root,'supabase/migrations',migration)]);
 client = postgres({ host: socket, port, database:'postgres', username:user, max:5 });
 const [database] = await client`SELECT current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(database.listeners,''); assert.equal(database.directory,data);
 const repositories = createDatabaseRepositories({ adapter: { type:'postgres', db:drizzle(client,{schema}), close:async()=>{}, isConnected:async()=>true } as any });
 const [team] = await client`INSERT INTO teams(name,slug) VALUES('Disposable visitor team','visitor-fixture') RETURNING id`;
 const sites = [];
 for (const name of ['a','b']) sites.push((await repositories.sites.create({ teamId:team.id,name:`Visitor ${name}`,slug:`visitor-${name}`,isPublished:true,settings:{ visitorAccounts:{ enabled:true,registrationEnabled:true,allowedOrigins:[`https://site-${name}.example.com`],returnUrls:[`https://site-${name}.example.com/account`] } } })).item);
 await client`UPDATE sites SET is_published = true WHERE team_id = ${team.id}`; for (const site of sites) site.isPublished=true;
 // Operator deny-only query fixture; no visitor operation calls users.create.
 const operatorId = randomUUID(); await client`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${operatorId},'operator@example.com','{"role":"owner"}'::jsonb)`;
 await client`INSERT INTO profiles(id,email,full_name,role,status,is_active) VALUES(${operatorId},'operator@example.com','Fixture operator','viewer','invited',false)`;
 const proof = await runVisitorAuthProof(repositories,sites);
 const repo = repositories.visitorAccounts!;
 const [member] = await client`SELECT * FROM site_visitors WHERE site_id = ${sites[0].id}`;
 const storedMember=await repo.getByEmail(member.site_id,member.email);
 let websiteBridgeChecks = 0;
 const protectedProof=await runProtectedContentProof(repositories,sites,storedMember,{ websiteBridge: async context => { websiteBridgeChecks = await runWebsiteBridgeProof(context); } });
 const hash = createHash('sha256').update('fixture-only-session').digest('hex'), future = new Date(Date.now()+3600000).toISOString();
 assert(await repo.createSession({ tokenHash:hash,siteId:member.site_id,memberId:member.id,createdAt:new Date().toISOString(),expiresAt:future }));
 await client`UPDATE site_visitors SET status = 'suspended' WHERE id = ${member.id}`;
 assert.equal(await repo.resolveSession(member.site_id,hash,new Date().toISOString()),null);
 assert.equal(await repo.createSession({ tokenHash:createHash('sha256').update('second').digest('hex'),siteId:member.site_id,memberId:member.id,createdAt:new Date().toISOString(),expiresAt:future }),false);
 const [privateForm] = await client`SELECT id FROM form_definitions WHERE site_id = ${member.site_id} AND name = 'private-visitor-proof'`;
 const submissionInput={siteId:member.site_id,formId:privateForm.id,visitorMemberId:member.id,values:{message:'Membership admission'},status:'pending' as const};
 const commentInput={siteId:member.site_id,targetType:'page' as const,targetId:randomUUID(),visitorMemberId:member.id,content:'Membership admission'};
 await assert.rejects(repositories.forms.createSubmission(submissionInput), /visitor membership/i);
 await assert.rejects(repositories.comments.create(commentInput), /visitor membership/i);
 await client`UPDATE site_visitors SET status = 'active' WHERE id = ${member.id}`;
 // Suspension committed after request admission but before the row lock cannot persist an attributed write.
 let raced:any;
 await client.begin(async(tx:any)=>{
  await tx`SELECT id FROM site_visitors WHERE id = ${member.id} FOR UPDATE`;
  raced=repositories.comments.create(commentInput).then(value=>({value}),error=>({error}));
  const deadline=Date.now()+5000; let blocked=false;
  while(Date.now()<deadline){const [locks]=await client`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%site_visitors%'`;if(locks.count>0){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,15));}
  assert(blocked,'Visitor content writer must wait on concurrent membership mutation');
  await tx`UPDATE site_visitors SET status = 'suspended' WHERE id = ${member.id}`;
 });
 const race=await raced;assert.equal(race.error?.code,'VISITOR_MEMBERSHIP_REQUIRED');
 await client`UPDATE site_visitors SET status = 'active' WHERE id = ${member.id}`;
 await client`UPDATE visitor_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = ${hash}`;
 assert.equal(await repo.resolveSession(member.site_id,hash,new Date().toISOString()),null);
 await assert.rejects(client`INSERT INTO visitor_sessions(token_hash,site_id,member_id,expires_at) VALUES(${createHash('sha256').update('wrong-site').digest('hex')},${sites[1].id},${member.id},now()+interval '1 hour')`, /foreign key/i);
 const identity = {issuer:member.provider_issuer,subject:member.provider_subject,email:member.email};
 await assert.rejects(repo.enroll(member.site_id,{...identity,subject:'different-provider-subject'},'No merge'),/enrollment/i);
 const outcomes = await Promise.all(Array.from({length:12},()=>repo.consumeRateLimit(member.site_id,createHash('sha256').update('concurrent-rate').digest('hex'),5,300)));
 assert.equal(outcomes.filter(Boolean).length,5);
 const challenge = createHash('sha256').update('one-time').digest('hex'); await repo.createRecoveryChallenge({siteId:member.site_id,memberId:member.id,tokenHash:challenge,expiresAt:future});
 const consumption = await Promise.all([repo.consumeRecoveryChallenge(member.site_id,member.id,challenge,new Date().toISOString()),repo.consumeRecoveryChallenge(member.site_id,member.id,challenge,new Date().toISOString())]); assert.equal(consumption.filter(Boolean).length,1);
 const [rows] = await client`SELECT count(*)::int AS count FROM profiles`; assert.equal(rows.count,1,'Visitor registrations must not create CMS profiles');
 const [sessions] = await client`SELECT count(*)::int AS count FROM visitor_sessions WHERE token_hash !~ '^[a-f0-9]{64}$'`; assert.equal(sessions.count,0);
 for (const role of ['anon','authenticated']) {
  await client.begin(async (tx:any)=>{ await tx.unsafe(`SET LOCAL ROLE ${role}`); for (const table of ['site_visitors','visitor_sessions','visitor_auth_rate_limits','visitor_recovery_challenges']) await assert.rejects(tx.savepoint((save:any)=>save.unsafe(`SELECT * FROM ${table}`)),/permission denied/); });
 }
 // Actual management handlers use production repositories with fixture operator sessions/keys.
 let retainedComment: any, retainedSubmission: any;
 const managementProof = await runVisitorManagementProof(repositories,sites,async managed => {
  retainedComment=(await repositories.comments.create({siteId:managed.siteId,targetType:'page',targetId:randomUUID(),visitorMemberId:managed.id,authorName:'Original historical author',content:'Retained visitor attribution'})).item;
  retainedSubmission=(await repositories.forms.createSubmission({...submissionInput,visitorMemberId:managed.id,values:{message:'Retained private form'}})).item;
 });
 assert.equal((await client`SELECT visitor_member_id FROM comments WHERE id = ${retainedComment.id}`)[0].visitor_member_id,managementProof.member.id);
 assert.equal((await client`SELECT visitor_member_id FROM form_submissions WHERE id = ${retainedSubmission.id}`)[0].visitor_member_id,managementProof.member.id);
 assert.equal((await client`SELECT author_name FROM comments WHERE id = ${retainedComment.id}`)[0].author_name,'Original historical author');
 const management=repo.management!;
 const failureIdentity={issuer:'fixture-managed',subject:randomUUID(),email:randomUUID()+'@example.test'}, failureMember=await repo.enroll(sites[0].id,failureIdentity,'Atomic audit failure');
 const failureHash=createHash('sha256').update('management-audit-rollback').digest('hex');
 await repo.createSession({siteId:failureMember.siteId,memberId:failureMember.id,tokenHash:failureHash,createdAt:new Date().toISOString(),expiresAt:future});
 // Audit actor FK rejection must roll back status and physical session revocation together.
 await assert.rejects(management.removeAccess(failureMember.siteId,failureMember.id,{actorId:randomUUID()}),(error:any)=>error.cause?.code==='23503');
 assert.equal((await management.getById(failureMember.siteId,failureMember.id))!.status,'active');
 assert(await repo.resolveSession(failureMember.siteId,failureHash,new Date().toISOString()));
 const recoveryHash=createHash('sha256').update('management-recovery').digest('hex');
 await repo.createRecoveryChallenge({siteId:failureMember.siteId,memberId:failureMember.id,tokenHash:recoveryHash,expiresAt:future});
 const suspended=await management.update(failureMember.siteId,failureMember.id,{status:'suspended'},{requestId:'management-atomic-proof'});
 assert.equal(suspended!.revokedSessions,1);assert.equal(suspended!.revokedRecoveryChallenges,1);
 assert.equal(await repo.consumeRecoveryChallenge(failureMember.siteId,failureMember.id,recoveryHash,new Date().toISOString()),false);
 await assert.rejects(repo.createRecoveryChallenge({siteId:failureMember.siteId,memberId:failureMember.id,tokenHash:recoveryHash,expiresAt:future}),/visitor membership/i);
 assert.equal((await client`SELECT count(*)::int AS count FROM activity_logs WHERE site_id=${sites[0].id} AND action LIKE 'visitor.member.%'`)[0].count>0,true);
 // An existing visitor cannot remain admitted after becoming a CMS operator identity.
 const promotedId = randomUUID(); await client`INSERT INTO auth.users(id,email) VALUES(${promotedId},${member.email})`; await client`INSERT INTO profiles(id,email,role,status,is_active) VALUES(${promotedId},${member.email},'viewer','invited',false)`;
 assert.equal(await repo.isOperatorIdentity(identity),true); assert.equal(await repo.createSession({tokenHash:createHash('sha256').update('promoted').digest('hex'),siteId:member.site_id,memberId:member.id,expiresAt:future,createdAt:new Date().toISOString()}),false);
 console.log(JSON.stringify({ok:true,mode:'owned-socket-only-postgresql',handlerProviderChecks:proof.passed,protectedContentChecks:protectedProof.passed,websiteBridgeChecks,visitorManagementChecks:managementProof.passed,visitorManagementRepositoryChecks:['retained-comment-attribution','retained-submission-attribution','historical-author-preserved','audit-rollback','atomic-session-challenge-revocation','suspended-recovery-denial'],repositoryChecks:['suspension','expiry','composite-site-foreign-key','no-email-identity-merge','atomic-rate-limit','one-time-recovery','no-CMS-provisioning','hash-only-storage','RLS-denial','operator-identity-denial','suspended-content-denial','concurrent-suspension-admission']}));
} finally {
 if(client) await client.end({timeout:3});
 try { if(existsSync(join(data,'postmaster.pid'))) run('pg_ctl',['-D',data,'-m','immediate','-w','stop']); } finally { rmSync(scratch,{recursive:true,force:true}); }
}
