// Disposable socket-only PostgreSQL. Never reads or accepts a configured target.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,readdirSync,writeFileSync,existsSync,rmSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt,randomUUID,createHash } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/schema/index.ts';
import { createVisitorAccountRepository } from '../src/repositories/visitor-accounts.ts';
import { runVisitorProfileProof } from '../../../apps/public/scripts/visitor-profile-smoke.mts';

/** Test-only owned cluster; no configured connection is read. Cleanup runs after the callback. */
export async function withVisitorProfilePostgres<T>(action: (fixture: { client: any; repo: ReturnType<typeof createVisitorAccountRepository>; sites: any[]; repositories: any }) => Promise<T>): Promise<T> {
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),binaries='/opt/homebrew/bin';
for(const binary of ['initdb','pg_ctl','psql'])assert(existsSync(join(binaries,binary)));
const scratch=mkdtempSync('/tmp/backy-visitor-profile-postgres-'),data=join(scratch,'cluster'),socket=join(scratch,'socket'),port=randomInt(20000,60000),user='backy_visitor_profile_fixture';
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&!['DATABASE_URL','BACKY_DATABASE_URL'].includes(key)));
for(const key of Object.keys(process.env))if(key.startsWith('PG')||['DATABASE_URL','BACKY_DATABASE_URL'].includes(key))delete process.env[key];
const run=(binary:string,args:string[])=>execFileSync(join(binaries,binary),args,{env,timeout:30000,encoding:'utf8',stdio:['ignore','pipe','pipe']});
let client:any;
try{
 run('initdb',['-D',data,'--username',user,'--encoding','UTF8','--no-locale','--auth-local','trust','--auth-host','reject']);mkdirSync(socket,{mode:0o700});writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\n`);run('pg_ctl',['-D',data,'-l',join(scratch,'log'),'-w','-t','15','start']);
 const args=['-X','--no-password','-h',socket,'-p',String(port),'-U',user,'-d','postgres','--set','ON_ERROR_STOP=1'];
 run('psql',[...args,'-c',`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`]);
 for(const migration of readdirSync(join(root,'supabase/migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort())run('psql',[...args,'-f',join(root,'supabase/migrations',migration)]);
 client=postgres({host:socket,port,database:'postgres',username:user,max:8});const [database]=await client`SELECT current_setting('listen_addresses') AS listeners,current_setting('data_directory') AS directory`;assert.equal(database.listeners,'');assert.equal(database.directory,data);
 const [team]=await client`INSERT INTO teams(name,slug) VALUES('Disposable profile team','profile-fixture') RETURNING id`;
 const sites:any[]=[];
 for(const name of ['a','b']){const policy={visitorAccounts:{enabled:true,registrationEnabled:true,allowedOrigins:[`https://site-${name}.example.com`],returnUrls:[`https://site-${name}.example.com/account`]}};const [row]=await client`INSERT INTO sites(team_id,name,slug,is_published,settings) VALUES(${team.id},${'Visitor '+name},${'visitor-profile-'+name},true,${client.json(policy)}) RETURNING id,slug`;sites.push({...row,isPublished:true,settings:policy});}
 const repo=createVisitorAccountRepository(drizzle(client,{schema}) as any);
 const readSite=async(key:string,bySlug=false)=>{if(!bySlug&&!/^[a-f0-9-]{36}$/.test(key))return null;const rows=bySlug?await client`SELECT id,slug,is_published,settings FROM sites WHERE slug=${key}`:await client`SELECT id,slug,is_published,settings FROM sites WHERE id=${key}`;const row=rows[0];return row?{...row,isPublished:row.is_published}:null;};
 const repositories={visitorAccounts:repo,sites:{getById:(id:string)=>readSite(id),getBySlug:(slug:string)=>readSite(slug,true)}};
 return await action({client,repo,sites,repositories});
}finally{if(client)await client.end({timeout:3});try{if(existsSync(join(data,'postmaster.pid')))run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}finally{rmSync(scratch,{recursive:true,force:true});}}

}

async function runDatabaseProfileProof({client,repo,sites,repositories}:any) {
 let repositoryChecks=0;
 const proof=await runVisitorProfileProof(repositories,sites);
 assert.equal((await client`SELECT count(*)::int AS count FROM activity_logs`)[0].count,0,'Self-service does not invent an operator audit actor');repositoryChecks++;
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 const seed=async(site=sites[0])=>{const identity={issuer:'profile-repository',subject:randomUUID(),email:randomUUID()+'@example.test'},member=await repo.enroll(site.id,identity,'Retained name'),tokenHash=hash(randomUUID());assert(await repo.createSession({siteId:site.id,memberId:member.id,tokenHash,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}));return{member,identity,tokenHash};};
 const denyUpdate=async(fixture:any,siteId=fixture.member.siteId,memberId=fixture.member.id,tokenHash=fixture.tokenHash,input:any={displayName:'Denied persisted name'})=>{const before=(await client`SELECT * FROM site_visitors WHERE id=${fixture.member.id}`)[0];assert.equal(await repo.updateProfile!(siteId,memberId,tokenHash,input),null);const after=(await client`SELECT * FROM site_visitors WHERE id=${fixture.member.id}`)[0];assert.deepEqual(after,before,'Denied profile write must preserve all stored member fields');repositoryChecks++;};
 const original=await seed(),other=await seed(sites[1]);
 for(const input of [Object.assign(Object.create({displayName:'inherited'}),{email:'spoof'}),[],{displayName:'invalid',email:'spoof'},{},{displayName:42},{displayName:'a'.repeat(121)},{displayName:'😀'.repeat(61)},{displayName:'name\ncontrol'}])await denyUpdate(original,undefined,undefined,undefined,input);
 await denyUpdate(original,undefined,undefined,'invalid-hash');await denyUpdate(original,sites[1].id);await denyUpdate(original,undefined,other.member.id);await denyUpdate(original,undefined,undefined,other.tokenHash);
 const [beforeIdentity]=await client`SELECT provider_issuer,provider_subject,email,created_at,status FROM site_visitors WHERE id=${original.member.id}`;
 assert.equal((await repo.updateProfile!(original.member.siteId,original.member.id,original.tokenHash,{displayName:'  Persisted name  '}))!.displayName,'Persisted name');assert.deepEqual((await client`SELECT provider_issuer,provider_subject,email,created_at,status FROM site_visitors WHERE id=${original.member.id}`)[0],beforeIdentity);repositoryChecks++;
 for(const status of ['suspended','removed']){const f=await seed();await client`UPDATE site_visitors SET status=${status} WHERE id=${f.member.id}`;await denyUpdate(f);}
 const revoked=await seed();await repo.revokeSession(revoked.member.siteId,revoked.tokenHash);await denyUpdate(revoked);
 const expired=await seed();await client`UPDATE visitor_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${expired.tokenHash}`;await denyUpdate(expired);
 for(const match of ['email','subject']){const f=await seed(),id=match==='subject'?f.identity.subject:randomUUID(),email=match==='email'?f.identity.email:randomUUID()+'@example.test';await client`INSERT INTO auth.users(id,email) VALUES(${id},${email})`;await client`INSERT INTO profiles(id,email,role,status,is_active) VALUES(${id},${email},'viewer','invited',false)`;await denyUpdate(f);}
 await client`UPDATE sites SET is_published=false WHERE id=${original.member.siteId}`;await denyUpdate(original);await client`UPDATE sites SET is_published=true WHERE id=${original.member.siteId}`;
 await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,enabled}','false'::jsonb) WHERE id=${original.member.siteId}`;await denyUpdate(original);await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,enabled}','true'::jsonb) WHERE id=${original.member.siteId}`;
 const waitForLock=async(table:string)=>{const deadline=Date.now()+5000;while(Date.now()<deadline){const [rows]=await client`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE ${'%'+table+'%'}`;if(rows.count>0)return;await new Promise(resolve=>setTimeout(resolve,15));}throw new Error('Writer did not wait on '+table);};
 // Suspension, removal, revocation and expiry commit after route-style admission
 // but before the profile writer obtains the member lock.
 for(const change of ['suspended','removed','revoke','expiry']){const f=await seed();assert(await repo.resolveSession(f.member.siteId,f.tokenHash,new Date().toISOString()));let pending:any;await client.begin(async(tx:any)=>{await tx`SELECT id FROM site_visitors WHERE id=${f.member.id} FOR UPDATE`;pending=repo.updateProfile!(f.member.siteId,f.member.id,f.tokenHash,{displayName:'Raced persisted name'});await waitForLock('site_visitors');if(change==='revoke')await repo.revokeSession(f.member.siteId,f.tokenHash);else if(change==='expiry')await tx`UPDATE visitor_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${f.tokenHash}`;else await tx`UPDATE site_visitors SET status=${change} WHERE id=${f.member.id}`;});assert.equal(await pending,null);assert.equal((await repo.getByIdentity(f.member.siteId,f.identity))!.displayName,'Retained name');repositoryChecks++;}
 // A revoker arriving after the writer locks the exact session waits for that
 // admitted write, then revokes it. No member/session reverse-order deadlock.
 const current=await seed(),lock=randomInt(100000,900000);await client.unsafe(`CREATE FUNCTION profile_fixture_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.display_name='Admitted profile write' THEN PERFORM pg_advisory_xact_lock(${lock}); END IF; RETURN NEW; END $$; CREATE TRIGGER profile_fixture_pause BEFORE UPDATE ON site_visitors FOR EACH ROW EXECUTE FUNCTION profile_fixture_pause();`);
 let writing:any,revoking:any;
 await client.begin(async(tx:any)=>{await tx`SELECT pg_advisory_xact_lock(${lock})`;writing=repo.updateProfile!(current.member.siteId,current.member.id,current.tokenHash,{displayName:'Admitted profile write'});await waitForLock('site_visitors');revoking=repo.revokeSession(current.member.siteId,current.tokenHash);await waitForLock('visitor_sessions');});
 assert.equal((await writing)!.displayName,'Admitted profile write');await revoking;assert.equal(await repo.resolveSession(current.member.siteId,current.tokenHash,new Date().toISOString()),null);repositoryChecks++;
 console.log(JSON.stringify({ok:true,mode:'owned-socket-only-postgresql',visitorProfileHandlerChecks:proof.checks,visitorProfileRepositoryChecks:repositoryChecks,races:['suspension','removal','revocation','expiry','admitted-write-before-later-revocation'],configuredTargetUsed:false}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length>2)throw new Error('No database target arguments allowed.');
 await withVisitorProfilePostgres(runDatabaseProfileProof);
}
