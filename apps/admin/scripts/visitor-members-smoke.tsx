import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisitorMembersPanel } from '../src/components/sites/VisitorMembersPanel';
import { listVisitorMembers, changeVisitorMember } from '../src/lib/visitorMembersClient';
async function main() {
 const siteId='site/a',id='member/a',signal=new AbortController().signal;
 const member={id,siteId,email:'visitor@example.test',displayName:'Visitor',status:'active',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
 const retention={explanation:'Identity and content retained. Provider identity unchanged.',erasure:false},data={siteId,members:[member],pagination:{limit:50,offset:0,hasMore:true},retention,policy:{enabled:false,registrationEnabled:false},permission:'sites.configure'};
 const calls:Array<{url:string;init?:RequestInit}>=[];
 const response=(payload:unknown)=>Response.json({success:true,data:payload});
 const loaded=await listVisitorMembers(siteId,{limit:50,offset:0,search:'visitor'},signal,async(url,init)=>{calls.push({url:String(url),init});return response(data);});
 assert.equal(loaded.members[0].id,id);assert.equal(loaded.pagination.hasMore,true);assert(calls[0].url.includes('/sites/site%2Fa/visitors?'));assert.equal(calls[0].init?.credentials,'include');assert.equal(calls[0].init?.cache,'no-store');assert.equal(calls[0].init?.signal,signal);
 for(const mutate of [(value:any)=>value.siteId='foreign',(value:any)=>value.members[0].siteId='foreign',(value:any)=>value.retention.erasure=true,(value:any)=>value.pagination.offset=50,(value:any)=>value.permission='users.manage']){const invalid=structuredClone(data);mutate(invalid);await assert.rejects(listVisitorMembers(siteId,{limit:50,offset:0},signal,async()=>response(invalid)));}
 let forbidden=0;await assert.rejects(changeVisitorMember(siteId,id,'remove',{},signal,async()=>{forbidden++;return response({});}),/Review retained/);assert.equal(forbidden,0);
 for(const action of ['profile','suspend','activate','revoke','remove'] as const){
  const changed={siteId,member:{...member,status:action==='remove'?'removed':action==='suspend'?'suspended':'active'},retention,revokedSessions:2,revokedRecoveryChallenges:1};
  await changeVisitorMember(siteId,id,action,{displayName:'Changed',confirmRetention:true},signal,async(url,init)=>{calls.push({url:String(url),init});return response(changed);});
  const call=calls.at(-1)!;assert(call.url.includes('/sites/site%2Fa/visitors/member%2Fa'));assert.equal(call.init?.method,action==='remove'?'DELETE':action==='revoke'?'POST':'PATCH');
  if(action==='remove')assert.deepEqual(JSON.parse(String(call.init?.body)),{confirmRetention:true});if(action==='profile')assert.deepEqual(JSON.parse(String(call.init?.body)),{displayName:'Changed'});if(action==='revoke')assert(call.url.endsWith('/revoke-sessions'));
 }
 await assert.rejects(changeVisitorMember(siteId,id,'suspend',{},signal,async()=>response({siteId,member,retention,revokedSessions:0,revokedRecoveryChallenges:0})),/inconsistent/);
 await assert.rejects(listVisitorMembers(siteId,{limit:50,offset:0},signal,async()=>Response.json({success:false,error:{code:'VISITOR_MANAGEMENT_DATABASE_REQUIRED',message:'Persisted database required.'}},{status:503})),/Persisted database required/);
 const controller=new AbortController();controller.abort();await assert.rejects(listVisitorMembers(siteId,{limit:50,offset:0},controller.signal,async()=>{throw new Error('must not fetch');}));
 const denied=renderToStaticMarkup(<VisitorMembersPanel siteId={siteId} canConfigure={false}/>);assert(denied.includes('Site configuration permission'));assert(!denied.includes('Email or display name'));
 const allowed=renderToStaticMarkup(<VisitorMembersPanel siteId={siteId} canConfigure={true}/>);for(const text of ['Website visitors','Persisted database','exact approved origin','Access removed','Search members','Reload members'])assert(allowed.includes(text));assert(!allowed.includes('Delete provider'));
 console.log('Visitor management admin proof passed: scoped authenticated transport, five exact lifecycle actions, retention confirmation, foreign/inconsistent denial, unavailable persistence, cancellation and production permission/configuration SSR. Browser actions remain separate.');
}
void main();
