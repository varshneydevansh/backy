/** Actual central admission + new route/helper; synthetic Owner and erasure adapter only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { fixture, load, networkCalls } from './admin-access-test-fixtures.mts';
import { loadVisitorErasureTestSource } from './visitor-erasure-route-smoke.mts';
const f=fixture({actorRole:'owner'}),memberId=randomUUID(),previewId=randomUUID(),origin='https://admin.example';let calls=0;
const choices={comments:'retain',submissions:'retain',exclusiveContacts:'retain'},retained=['provider-subject-tombstone','other-websites','private-attachment-bytes-and-references','ambiguous-or-retained-contacts','collection-copies','historical-audit-and-delivery-evidence','newsletter-consent-and-delivery-snapshots','downstream-provider-copies'];
const repositories={...f.repositories,visitorAccounts:{privacyErasure:{preview:async(siteId:string,id:string,actorId:string,policy:any)=>{calls++;assert.equal(siteId,f.site.id);assert.equal(id,memberId);assert.equal(actorId,f.actor.id);assert.equal(JSON.stringify(policy),JSON.stringify(choices));return{schema:'backy.visitor-erasure-preview.v1',previewId,siteId,memberId,expiresAt:new Date(Date.now()+300000).toISOString(),choices,counts:{comments:1,submissions:1,exclusiveContacts:0,ambiguousContacts:1,retainedAttachments:0,commentDeliveryAttempts:0,formDeliveryAttempts:0,newsletterSnapshots:0},retainedCategories:retained,boundaries:{profileIdentifiers:'redact',admission:'remove-and-fence',providerChanged:false,emailMatchedOwnership:false,downstreamErasure:'unverified',ambiguousContacts:'retain-and-fence'}};}}}};
const runtime={shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repositories},mocks={...f.mocks,'@/lib/repositoryRuntime':runtime,'@/lib/admin-auth/sessionCookie':load('../src/lib/admin-auth/sessionCookie.ts')};
const access=load('../src/lib/adminAccess.ts',mocks),helper=loadVisitorErasureTestSource('../src/lib/adminVisitorErasure.ts',{'./adminAccess':access,'./repositoryRuntime':runtime});
const send=(headers:any={})=>helper.handleAdminVisitorErasure(new NextRequest(`${origin}/api/admin/sites/${f.site.id}/visitors/members/${memberId}/privacy-erasure/preview`,{method:'POST',headers:{origin,'content-type':'application/json',cookie:'backy_admin_session=fixture-session',...headers},body:JSON.stringify({choices})}),f.site.id,memberId,'preview');
assert.equal((await send()).status,200);assert.equal(calls,1);
for(const [header,value] of [['origin','https://foreign.example'],['cookie',''],['authorization','Bearer fixture-session'],['x-backy-admin-key','fixture-service']]){const before=calls;const response=await send({[header]:value});assert([401,403].includes(response.status));assert.equal(calls,before);}
for(const role of ['admin','editor','viewer']){f.actor.role=role as any;const before=calls;assert.equal((await send()).status,403);assert.equal(calls,before);}f.actor.role='owner';
f.actor.status='suspended';assert.equal((await send()).status,403);f.actor.status='active';
f.settings().auth.userPermissionOverrides=[{userId:f.actor.id,permissionKey:'users.delete',value:'deny',updatedAt:new Date().toISOString()}];assert.equal((await send()).status,403);f.settings().auth.userPermissionOverrides=[];
assert.equal((await send()).status,200);assert.equal(networkCalls,0);assert.equal(f.effects.writes,0);assert.equal(f.effects.credentials,0);assert.equal(f.effects.deliveries,0);
console.log('Visitor erasure actual central auth PASS: Owner cookie, users.delete override, active identity, Origin, explicit credential rejection and denial before erasure adapter; no provider/session/profile mutation.');
