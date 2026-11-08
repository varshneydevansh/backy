// Uses only an owned socket-only cluster. No provider or configured DB target.
import assert from 'node:assert/strict';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { withVisitorProfilePostgres } from './visitor-profile-postgres-isolated.mts';
import { runVisitorEmailChangeProof } from '../../../apps/public/scripts/visitor-email-change-smoke.mts';

export async function runVisitorEmailChangeRepositoryProof({client,repo,sites}: any) {
  const capability = repo.emailChange;
  assert(capability, 'Persisted repository must provide email change admission/reconciliation');
  let checks = 0;
  const races: string[] = [];
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const identity = () => ({issuer:'email-change-isolated',subject:randomUUID(),email:randomUUID()+'@example.test'});
  const seed = async (site = sites[0], providerIdentity = identity()) => {
    const member = await repo.enroll(site.id, providerIdentity, 'Retained display name'), tokenHash = hash(randomUUID());
    assert(await repo.createSession({siteId:site.id,memberId:member.id,tokenHash,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}));
    await repo.createRecoveryChallenge({siteId:site.id,memberId:member.id,tokenHash:hash(randomUUID()),expiresAt:new Date(Date.now()+3600000).toISOString()});
    return {member,identity:providerIdentity,tokenHash};
  };
  const snapshot = async (f: any) => ({
    members:await client`SELECT * FROM site_visitors WHERE provider_issuer=${f.identity.issuer} AND provider_subject=${f.identity.subject} ORDER BY site_id,id`,
    sessions:await client`SELECT * FROM visitor_sessions WHERE member_id IN (SELECT id FROM site_visitors WHERE provider_issuer=${f.identity.issuer} AND provider_subject=${f.identity.subject}) ORDER BY token_hash`,
    challenges:await client`SELECT * FROM visitor_recovery_challenges WHERE member_id IN (SELECT id FROM site_visitors WHERE provider_issuer=${f.identity.issuer} AND provider_subject=${f.identity.subject}) ORDER BY token_hash`,
  });
  const admit = (f: any, email=randomUUID()+'@example.test') => capability.admit(f.member.siteId,f.member.id,f.tokenHash,f.identity,email);
  const deny = async (f: any, run: () => Promise<any>, conflict=false) => {
    const before = await snapshot(f);
    if (conflict) await assert.rejects(run, (error: any) => error.code==='VISITOR_EMAIL_CHANGE_CONFLICT');
    else assert.equal(await run(),null);
    assert.deepEqual(await snapshot(f),before,'Denial must preserve subject membership/session/challenge records');
    checks++;
  };
  const operator = async (email: string, id=randomUUID()) => {
    await client`INSERT INTO auth.users(id,email) VALUES(${id},${email})`;
    await client`INSERT INTO profiles(id,email,role,status,is_active) VALUES(${id},${email},'viewer','invited',false)`;
  };
  const waitLock = async (table: string, minimum=1) => {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){const [row]=await client`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE ${'%'+table+'%'}`;if(row.count>=minimum)return;await new Promise(resolve=>setTimeout(resolve,10));}
    throw new Error('Expected blocked '+table+' operation');
  };
  const f=await seed(), other=await seed(sites[1]);
  for(const input of [null,{}, {...f.identity,email:'invalid'}, {...f.identity,role:'owner'}, {...f.identity,subject:''}, {...f.identity,email:'a\n@example.test'}]) await deny(f,()=>capability.admit(f.member.siteId,f.member.id,f.tokenHash,input,'next@example.test'));
  for(const email of ['', 'invalid', 'a\n@example.test', 'a'.repeat(255)+'@example.test']) await deny(f,()=>admit(f,email));
  for(const args of [
    [randomUUID(),f.member.id,f.tokenHash,f.identity], [sites[1].id,f.member.id,f.tokenHash,f.identity],
    [f.member.siteId,other.member.id,f.tokenHash,f.identity], [f.member.siteId,f.member.id,other.tokenHash,f.identity],
    [f.member.siteId,f.member.id,'bad-hash',f.identity], [f.member.siteId,f.member.id,f.tokenHash,{...f.identity,subject:randomUUID()}],
    [f.member.siteId,f.member.id,f.tokenHash,{...f.identity,issuer:'foreign-issuer'}], [f.member.siteId,f.member.id,f.tokenHash,{...f.identity,email:'other@example.test'}],
  ]) await deny(f,()=>capability.admit(...args,'next@example.test'));
  for(const status of ['suspended','removed']){const s=await seed();await client`UPDATE site_visitors SET status=${status} WHERE id=${s.member.id}`;await deny(s,()=>admit(s));await deny(s,()=>capability.reconcile(s.member.siteId,{...s.identity,email:'confirmed@example.test'}));}
  for(const state of ['revoked','expired']){const s=await seed();if(state==='revoked')await repo.revokeSession(s.member.siteId,s.tokenHash);else await client`UPDATE visitor_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=${s.tokenHash}`;await deny(s,()=>admit(s));}
  for(const policy of ['unpublished','disabled']){
    if(policy==='unpublished')await client`UPDATE sites SET is_published=false WHERE id=${f.member.siteId}`;
    else await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,enabled}','false') WHERE id=${f.member.siteId}`;
    await deny(f,()=>admit(f));await deny(f,()=>capability.reconcile(f.member.siteId,{...f.identity,email:'confirmed@example.test'}));
    await client`UPDATE sites SET is_published=true,settings=jsonb_set(settings,'{visitorAccounts,enabled}','true') WHERE id=${f.member.siteId}`;
  }
  await deny(f,()=>capability.reconcile(randomUUID(),{...f.identity,email:'confirmed@example.test'}));
  await deny(f,()=>capability.reconcile(f.member.siteId,identity()));
  for(const type of ['current-email','subject','target-email']){
    const s=await seed(),target=randomUUID()+'@example.test';await operator(type==='current-email'?s.identity.email:target,type==='subject'?s.identity.subject:randomUUID());
    await deny(s,()=>admit(s,target));await deny(s,()=>capability.reconcile(s.member.siteId,{...s.identity,email:target}));
  }
  for(const status of ['active','suspended','removed']){
    const s=await seed(),collision=await seed(sites[0]);await client`UPDATE site_visitors SET status=${status} WHERE id=${collision.member.id}`;
    await deny(s,()=>admit(s,collision.identity.email),true);await deny(s,()=>capability.reconcile(s.member.siteId,{...s.identity,email:collision.identity.email}),true);
  }
  // Shared provider subject may own multiple sites, including disabled sites.
  const sharedIdentity=identity(),a=await seed(sites[0],sharedIdentity),b=await seed(sites[1],sharedIdentity);
  const [siteC]=await client`INSERT INTO sites(team_id,name,slug,is_published,settings) SELECT team_id,'Removed email fixture',${randomUUID()},true,settings FROM sites WHERE id=${sites[0].id} RETURNING id`;
  const removed=await seed(siteC,sharedIdentity);await client`UPDATE site_visitors SET status='removed' WHERE id=${removed.member.id}`;
  await client`UPDATE site_visitors SET status='suspended' WHERE id=${b.member.id}`;
  const [form]=await client`INSERT INTO form_definitions(site_id,name) VALUES(${a.member.siteId},'Retained history') RETURNING id`;
  const [submission]=await client`INSERT INTO form_submissions(site_id,form_id,visitor_member_id,values) VALUES(${a.member.siteId},${form.id},${a.member.id},${JSON.stringify({email:sharedIdentity.email,freeText:'Original submission'})}::jsonb) RETURNING id`;
  await client`INSERT INTO form_contacts(site_id,form_id,source_submission_id,email,source_values) VALUES(${a.member.siteId},${form.id},${submission.id},${sharedIdentity.email},${JSON.stringify({email:sharedIdentity.email})}::jsonb)`;
  await client`INSERT INTO comments(site_id,target_type,target_id,visitor_member_id,author_name,author_email,content) VALUES(${a.member.siteId},'page','fixture',${a.member.id},'Historical name',${sharedIdentity.email},'Original comment')`;
  const historical=async()=>({comments:await client`SELECT * FROM comments WHERE visitor_member_id=${a.member.id}`,submissions:await client`SELECT * FROM form_submissions WHERE visitor_member_id=${a.member.id}`,contacts:await client`SELECT * FROM form_contacts WHERE source_submission_id=${submission.id}`});
  const beforeHistory=await historical(),unrelatedBefore=await snapshot(other),membersBefore=(await snapshot(a)).members;
  const target=randomUUID()+'@example.test',admission=await admit(a,target);
  assert.equal(admission.member.email,sharedIdentity.email);assert.equal(admission.revokedSessions,3);assert.equal(admission.revokedRecoveryChallenges,3);
  assert.equal((await snapshot(a)).sessions.length,0);assert.equal((await snapshot(a)).challenges.length,0);assert.deepEqual((await snapshot(a)).members,membersBefore);checks++;
  const confirmed={...sharedIdentity,email:target};const result=await capability.reconcile(a.member.siteId,confirmed);
  assert.equal(result.member.id,a.member.id);assert.equal(result.member.email,target);assert.equal(result.synchronizedMemberships,2);
  const afterMembers=(await snapshot(a)).members;
  for(const member of afterMembers){const before=membersBefore.find((row: any)=>row.id===member.id);assert.deepEqual({...member,email:before.email,updated_at:before.updated_at},before);assert.equal(member.email,member.status==='removed'?sharedIdentity.email:target);}
  assert.deepEqual(await historical(),beforeHistory);assert.deepEqual(await snapshot(other),unrelatedBefore);checks++;
  const retry=await capability.reconcile(a.member.siteId,confirmed);assert.equal(retry.member.email,target);assert.equal(retry.synchronizedMemberships,0);checks++;
  // A collision on another existing website denies the whole shared operation.
  const multiIdentity=identity(),mA=await seed(sites[0],multiIdentity),mB=await seed(sites[1],multiIdentity),collision=await seed(sites[1]);
  await client`UPDATE site_visitors SET status='suspended' WHERE id=${mB.member.id}`;
  await deny(mA,()=>admit(mA,collision.identity.email),true);await deny(mA,()=>capability.reconcile(mA.member.siteId,{...multiIdentity,email:collision.identity.email}),true);
  // Force a persisted failure after revocations but during synchronization:
  // every membership/session/challenge preimage must roll back, then retry.
  const rollbackIdentity=identity(),rA=await seed(sites[0],rollbackIdentity);await seed(sites[1],rollbackIdentity);
  const rollbackTarget=randomUUID()+'@example.test',rollbackBefore=await snapshot(rA);
  await client.unsafe(`CREATE FUNCTION email_fixture_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email='${rollbackTarget}' THEN RAISE EXCEPTION 'synthetic database failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER email_fixture_rollback BEFORE UPDATE ON site_visitors FOR EACH ROW EXECUTE FUNCTION email_fixture_rollback();`);
  await assert.rejects(()=>capability.reconcile(rA.member.siteId,{...rollbackIdentity,email:rollbackTarget}));assert.deepEqual(await snapshot(rA),rollbackBefore);
  await client.unsafe('DROP TRIGGER email_fixture_rollback ON site_visitors; DROP FUNCTION email_fixture_rollback();');
  assert.equal((await capability.reconcile(rA.member.siteId,{...rollbackIdentity,email:rollbackTarget})).synchronizedMemberships,2);checks++;
  // Late removal/suspension/session revocation/expiry/operator/collision is
  // observed after the operation waits on the member's persisted row lock.
  for(const change of ['suspended','removed','revoke','expiry','operator','collision']){
    const s=await seed(),newEmail=randomUUID()+'@example.test';let pending:any;
    await client.begin(async(tx:any)=>{
      await tx`SELECT id FROM site_visitors WHERE id=${s.member.id} FOR UPDATE`;
      pending=admit(s,newEmail);void pending.catch(()=>{});await waitLock('site_visitors');
      if(change==='revoke')await repo.revokeSession(s.member.siteId,s.tokenHash);
      else if(change==='expiry')await tx`UPDATE visitor_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=${s.tokenHash}`;
      else if(change==='operator')await operator(newEmail);
      else if(change==='collision')await client`INSERT INTO site_visitors(site_id,provider_issuer,provider_subject,email,display_name) VALUES(${s.member.siteId},'isolated-late-collision',${randomUUID()},${newEmail},'Unrelated collision')`;
      else await tx`UPDATE site_visitors SET status=${change} WHERE id=${s.member.id}`;
    });
    const before=await snapshot(s);
    if(change==='collision')await assert.rejects(()=>pending,(error:any)=>error.code==='VISITOR_EMAIL_CHANGE_CONFLICT');else assert.equal(await pending,null);
    assert.deepEqual(await snapshot(s),before);checks++;races.push('admission-'+change);
  }
  for(const change of ['suspended','removed']){
    const s=await seed();let pending:any;
    await client.begin(async(tx:any)=>{await tx`SELECT id FROM site_visitors WHERE id=${s.member.id} FOR UPDATE`;pending=capability.reconcile(s.member.siteId,{...s.identity,email:randomUUID()+'@example.test'});await waitLock('site_visitors');await tx`UPDATE site_visitors SET status=${change} WHERE id=${s.member.id}`;});
    const before=await snapshot(s);assert.equal(await pending,null);assert.deepEqual(await snapshot(s),before);checks++;races.push('confirmation-'+change);
  }
  // Opposite selected sites serialize on the subject before any member lock.
  const concurrentIdentity=identity(),cA=await seed(sites[0],concurrentIdentity),cB=await seed(sites[1],concurrentIdentity);
  const outcomes=await Promise.all([admit(cA),admit(cB)]);assert.equal(outcomes.filter(Boolean).length,1);assert.equal((await snapshot(cA)).sessions.length,0);checks++;races.push('opposite-site-initiation');
  const destination=randomUUID()+'@example.test';const confirmations=await Promise.all([capability.reconcile(cA.member.siteId,{...concurrentIdentity,email:destination}),capability.reconcile(cB.member.siteId,{...concurrentIdentity,email:destination})]);
  assert(confirmations.every((value:any)=>value?.member.email===destination));assert.equal(confirmations.reduce((sum:number,value:any)=>sum+value.synchronizedMemberships,0),2);checks++;races.push('opposite-site-confirmation');
  // Enrollment cannot introduce a phantom membership while reconciliation
  // owns the subject lock. Afterwards stale old-email enrollment still fails.
  const enrollmentIdentity=identity(),e=await seed(sites[0],enrollmentIdentity),enrollmentTarget=randomUUID()+'@example.test',pause=randomInt(100000,900000);
  await client.unsafe(`CREATE FUNCTION email_fixture_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email='${enrollmentTarget}' THEN PERFORM pg_advisory_xact_lock(${pause}); END IF; RETURN NEW; END $$; CREATE TRIGGER email_fixture_pause BEFORE UPDATE ON site_visitors FOR EACH ROW EXECUTE FUNCTION email_fixture_pause();`);
  let reconciling:any,enrolling:any;
  await client.begin(async(tx:any)=>{await tx`SELECT pg_advisory_xact_lock(${pause})`;reconciling=capability.reconcile(e.member.siteId,{...enrollmentIdentity,email:enrollmentTarget});await waitLock('site_visitors');enrolling=repo.enroll(e.member.siteId,enrollmentIdentity,'Must not replace name').then(()=>null,(error:any)=>error);await waitLock('pg_advisory_xact_lock');});
  assert.equal((await reconciling).member.email,enrollmentTarget);assert.equal((await enrolling).code,'VISITOR_ENROLLMENT_CONFLICT');checks++;races.push('enrollment-serialization');
  await client.unsafe('DROP TRIGGER email_fixture_pause ON site_visitors; DROP FUNCTION email_fixture_pause();');
  // A raw concurrent DB writer bypassing advisory enrollment admission is
  // still stopped by the unique index; reconciliation restores all preimages.
  const unique=await seed(),uniqueTarget=randomUUID()+'@example.test',uniquePause=randomInt(100000,900000),uniqueBefore=await snapshot(unique);
  await client.unsafe(`CREATE FUNCTION email_fixture_unique_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email='${uniqueTarget}' THEN PERFORM pg_advisory_xact_lock(${uniquePause}); END IF; RETURN NEW; END $$; CREATE TRIGGER email_fixture_unique_pause BEFORE UPDATE ON site_visitors FOR EACH ROW EXECUTE FUNCTION email_fixture_unique_pause();`);
  let uniqueWriting:any;
  await client.begin(async(tx:any)=>{
    await tx`SELECT pg_advisory_xact_lock(${uniquePause})`;
    uniqueWriting=capability.reconcile(unique.member.siteId,{...unique.identity,email:uniqueTarget});void uniqueWriting.catch(()=>{});await waitLock('site_visitors');
    await client`INSERT INTO site_visitors(site_id,provider_issuer,provider_subject,email,display_name) VALUES(${unique.member.siteId},'isolated-concurrent-writer',${randomUUID()},${uniqueTarget},'Unrelated collision')`;
  });
  await assert.rejects(()=>uniqueWriting,(error:any)=>error.code==='VISITOR_EMAIL_CHANGE_CONFLICT');assert.deepEqual(await snapshot(unique),uniqueBefore);checks++;races.push('post-check-unique-collision-rollback');
  await client.unsafe('DROP TRIGGER email_fixture_unique_pause ON site_visitors; DROP FUNCTION email_fixture_unique_pause();');
  // Supplied expectedEmail is a locked preimage, not a persisted token claim.
  const preimage=await seed();
  const grant=(s:any, expectedEmail:any=s.identity.email)=>({siteId:s.member.siteId,memberId:s.member.id,tokenHash:hash(randomUUID()),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),expectedEmail});
  for(const email of ['invalid','other@example.test',null]){
    const before=await snapshot(preimage);
    assert.equal(await repo.createSession(grant(preimage,email)),false);
    await assert.rejects(()=>repo.createRecoveryChallenge(grant(preimage,email)),(error:any)=>error.code==='VISITOR_MEMBERSHIP_REQUIRED');
    assert.deepEqual(await snapshot(preimage),before);checks++;
  }
  assert(await repo.createSession(grant(preimage,' '+preimage.identity.email.toUpperCase()+' ')));checks++;
  // Queued old-email session and recovery writers must not recreate grants
  // after confirmed reconciliation has deleted the earlier grants.
  const stale=await seed(),freshEmail=randomUUID()+'@example.test',grantPause=randomInt(100000,900000);
  await client.unsafe(`CREATE FUNCTION email_fixture_grant_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email='${freshEmail}' THEN PERFORM pg_advisory_xact_lock(${grantPause}); END IF; RETURN NEW; END $$; CREATE TRIGGER email_fixture_grant_pause BEFORE UPDATE ON site_visitors FOR EACH ROW EXECUTE FUNCTION email_fixture_grant_pause();`);
  let synchronizing:any,staleSession:any,staleChallenge:any;
  await client.begin(async(tx:any)=>{
    await tx`SELECT pg_advisory_xact_lock(${grantPause})`;
    synchronizing=capability.reconcile(stale.member.siteId,{...stale.identity,email:freshEmail});await waitLock('site_visitors');
    staleSession=repo.createSession(grant(stale));staleChallenge=repo.createRecoveryChallenge(grant(stale)).then(()=>null,(error:any)=>error);
    await waitLock('site_visitors',3);
  });
  assert.equal((await synchronizing).member.email,freshEmail);assert.equal(await staleSession,false);assert.equal((await staleChallenge).code,'VISITOR_MEMBERSHIP_REQUIRED');
  assert.equal((await snapshot(stale)).sessions.length,0);assert.equal((await snapshot(stale)).challenges.length,0);checks++;races.push('queued-old-email-grants-denied');
  await client.unsafe('DROP TRIGGER email_fixture_grant_pause ON site_visitors; DROP FUNCTION email_fixture_grant_pause();');
  assert(await repo.createSession(grant(stale,freshEmail)));await repo.createRecoveryChallenge(grant(stale,freshEmail));checks++;
  // Conversely writers admitted before reconciliation are revoked by it.
  const prior=await seed();let priorSession:any,priorChallenge:any,laterReconcile:any;
  await client.begin(async(tx:any)=>{
    await tx`SELECT id FROM site_visitors WHERE id=${prior.member.id} FOR UPDATE`;
    priorSession=repo.createSession(grant(prior));await waitLock('site_visitors');
    priorChallenge=repo.createRecoveryChallenge(grant(prior));await waitLock('site_visitors',2);
    laterReconcile=capability.reconcile(prior.member.siteId,{...prior.identity,email:randomUUID()+'@example.test'});await waitLock('site_visitors',3);
  });
  assert.equal(await priorSession,true);await priorChallenge;const afterPrior=await laterReconcile;
  assert.equal(afterPrior.revokedSessions,2);assert.equal(afterPrior.revokedRecoveryChallenges,2);assert.equal((await snapshot(prior)).sessions.length,0);assert.equal((await snapshot(prior)).challenges.length,0);checks++;races.push('prior-admitted-grants-revoked');
  assert.equal((await client`SELECT count(*)::int AS count FROM activity_logs`)[0].count,0,'Self-service email writes must not invent an operator audit actor');checks++;
  console.log(JSON.stringify({ok:true,mode:'owned-socket-only-postgresql',visitorEmailChangeRepositoryChecks:checks,races,configuredTargetUsed:false,providerCalls:0}));
  return {checks,races};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv.length>2)throw new Error('No configured target arguments allowed');
  await withVisitorProfilePostgres(async fixture => {
    await runVisitorEmailChangeRepositoryProof(fixture);
    const handlerProof=await runVisitorEmailChangeProof(fixture.repositories,fixture.sites);
    console.log(JSON.stringify({ok:true,mode:'actual-http-handlers-with-owned-postgresql-and-local-provider',...handlerProof,configuredTargetUsed:false}));
  });
}
