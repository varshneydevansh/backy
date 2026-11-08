// Own socket-only PostgreSQL cluster; never uses a configured database/provider target.
import assert from 'node:assert/strict';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { withVisitorProfilePostgres } from './visitor-profile-postgres-isolated.mts';
import { runVisitorPkceProof } from '../../../apps/public/scripts/visitor-pkce-smoke.mts';

if(process.argv.length>2)throw new Error('No database target arguments allowed.');
await withVisitorProfilePostgres(async({client,repo,sites,repositories})=>{
 await runVisitorPkceProof(repositories,sites);
 const [a,b]=sites, origin=a.settings.visitorAccounts.allowedOrigins[0],returnUrl=a.settings.visitorAccounts.returnUrls[0],capability=repo.pkce!;
 const identity={issuer:'pkce-isolated',subject:randomUUID(),email:randomUUID()+'@example.test'}, member=await repo.enroll(a.id,identity,'Persisted PKCE');
 const make=(purpose='signup',site=a)=>({stateHash:createHash('sha256').update(randomUUID()).digest('hex'),siteId:site.id,purpose,origin:site.settings.visitorAccounts.allowedOrigins[0],returnUrl:site.settings.visitorAccounts.returnUrls[0],verifier:randomBytes(32).toString('base64url'),expectedEmail:identity.email,displayName:'Persisted PKCE',memberId:purpose==='recovery'?member.id:null,expiresAt:new Date(Date.now()+900000).toISOString()});
 const flow=make();await capability.create(flow as any);
 assert.equal(await capability.consume(b.id,flow.stateHash,b.settings.visitorAccounts.allowedOrigins[0],b.settings.visitorAccounts.returnUrls[0],'signup'),null);
 assert.equal(await capability.consume(a.id,flow.stateHash,'https://wrong.example',returnUrl,'signup'),null);
 assert.equal(await capability.consume(a.id,flow.stateHash,origin,returnUrl+'/wrong','signup'),null);
 assert.equal(await capability.consume(a.id,flow.stateHash,origin,returnUrl,'recovery'),null);
 assert.equal((await capability.consume(a.id,flow.stateHash,origin,returnUrl,'signup'))!.verifier,flow.verifier);
 assert.equal(await capability.consume(a.id,flow.stateHash,origin,returnUrl,'signup'),null);
 const concurrent=make();await capability.create(concurrent as any);const results=await Promise.all([capability.consume(a.id,concurrent.stateHash,origin,returnUrl,'signup'),capability.consume(a.id,concurrent.stateHash,origin,returnUrl,'signup')]);assert.equal(results.filter(Boolean).length,1);
 const expired=make();await capability.create(expired as any);await client`UPDATE visitor_pkce_flows SET expires_at=clock_timestamp()-interval '1 second' WHERE state_hash=${expired.stateHash}`;assert.equal(await capability.consume(a.id,expired.stateHash,origin,returnUrl,'signup'),null);
 const disabled=make();await capability.create(disabled as any);await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,enabled}','false') WHERE id=${a.id}`;assert.equal(await capability.consume(a.id,disabled.stateHash,origin,returnUrl,'signup'),null);await assert.rejects(capability.create(make() as any));await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,enabled}','true') WHERE id=${a.id}`;
 const removedOrigin=make();await capability.create(removedOrigin as any);await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,allowedOrigins}','[]') WHERE id=${a.id}`;assert.equal(await capability.consume(a.id,removedOrigin.stateHash,origin,returnUrl,'signup'),null);await client`UPDATE sites SET settings=jsonb_set(settings,'{visitorAccounts,allowedOrigins}',${JSON.stringify([origin])}::jsonb) WHERE id=${a.id}`;
 const recovery=make('recovery');await capability.create(recovery as any);await repo.management!.update(a.id,member.id,{status:'suspended'});assert.equal((await client`SELECT count(*)::int AS n FROM visitor_pkce_flows WHERE member_id=${member.id}`)[0].n,0);assert.equal(await capability.consume(a.id,recovery.stateHash,origin,returnUrl,'recovery'),null);await assert.rejects(capability.create(make('recovery') as any));await repo.management!.update(a.id,member.id,{status:'active'});
 const revoked=make('recovery');await capability.create(revoked as any);await repo.revokeIdentitySessions(identity);assert.equal(await capability.consume(a.id,revoked.stateHash,origin,returnUrl,'recovery'),null);
 const accessRemoved=make('recovery');await capability.create(accessRemoved as any);await repo.management!.removeAccess(a.id,member.id);assert.equal(await capability.consume(a.id,accessRemoved.stateHash,origin,returnUrl,'recovery'),null);
 await assert.rejects(capability.create({...make(),verifier:'short'} as any));await assert.rejects(capability.create({...make(),expiresAt:new Date(Date.now()+3600000).toISOString()} as any));await assert.rejects(capability.create({...make(),returnUrl:'https://other.example/account'} as any));
 for(const role of ['anon','authenticated'])await client.begin(async(tx:any)=>{await tx.unsafe(`SET LOCAL ROLE ${role}`);for(const op of ['SELECT * FROM visitor_pkce_flows','DELETE FROM visitor_pkce_flows'])await assert.rejects(tx.savepoint((save:any)=>save.unsafe(op)),/permission denied/);});
 console.log(JSON.stringify({ok:true,mode:'owned-socket-only-postgresql',pkceChecks:['actual-handler-provider-and-BFF','S256-verifier','site-origin-return-purpose-binding','atomic-concurrent-replay','expiry','disabled-policy','removed-origin','suspension-revocation','identity-revocation','removed-membership','invalid-persistence-input','browser-read-write-denial'],configuredTargetUsed:false}));
});
