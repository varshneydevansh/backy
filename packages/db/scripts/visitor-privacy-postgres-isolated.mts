// Counts-only review on an owned socket-only cluster; no configured target.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../src/schema/index.ts';
import { createVisitorPrivacyImpactRepository } from '../src/repositories/visitor-privacy.ts';
import { withVisitorProfilePostgres } from './visitor-profile-postgres-isolated.mts';
import { verifyVisitorPrivacyImpactHttp } from '../../../apps/public/scripts/visitor-privacy-impact-smoke.mts';

export async function runVisitorPrivacyRepositoryProof({client,repo,sites,repositories}:any) {
  let checks=0;
  const review=repo.privacyImpact?.review;
  assert(review,'Persisted visitor repository must expose the optional privacy review');
  const identity={issuer:'privacy-isolated',subject:randomUUID(),email:'private-'+randomUUID()+'@example.test'};
  const member=await repo.enroll(sites[0].id,identity,'PRIVATE MEMBER NAME');
  const foreign=await repo.enroll(sites[1].id,identity,'PRIVATE FOREIGN NAME');
  const unrelated=await repo.enroll(sites[0].id,{...identity,subject:randomUUID(),email:randomUUID()+'@example.test'},'PRIVATE UNRELATED NAME');
  const form=async(siteId:string)=> (await client`INSERT INTO form_definitions(site_id,name) VALUES(${siteId},'Private form') RETURNING id`)[0];
  const a=await form(sites[0].id),aOther=await form(sites[0].id),b=await form(sites[1].id);
  const comment=async(siteId:string,memberId:string|null)=> (await client`INSERT INTO comments(site_id,target_type,target_id,visitor_member_id,author_name,author_email,content,report_reasons) VALUES(${siteId},'page','private-target',${memberId},'PRIVATE COMMENT AUTHOR',${identity.email},'PRIVATE COMMENT CONTENT',${JSON.stringify(['PRIVATE MODERATION EVIDENCE'])}::jsonb) RETURNING id`)[0];
  const submission=async(siteId:string,formId:string,memberId:string|null)=> (await client`INSERT INTO form_submissions(site_id,form_id,visitor_member_id,values,admin_notes,user_agent) VALUES(${siteId},${formId},${memberId},${JSON.stringify({email:identity.email,private:'PRIVATE SUBMISSION CONTENT',file:{kind:'backy.form.attachment.v1',filename:'PRIVATE FILE NAME'}})}::jsonb,'PRIVATE ADMIN NOTES','PRIVATE USER AGENT') RETURNING id`)[0];
  const contact=async(siteId:string,formId:string,submissionId:string|null)=> (await client`INSERT INTO form_contacts(site_id,form_id,source_submission_id,name,email,notes,source_values) VALUES(${siteId},${formId},${submissionId},'PRIVATE CONTACT NAME',${identity.email},'PRIVATE MERGED NOTES',${JSON.stringify({private:'PRIVATE COPIED CONTENT'})}::jsonb) RETURNING id`)[0];
  const c1=await comment(sites[0].id,member.id);await comment(sites[0].id,member.id);
  const otherComment=await comment(sites[0].id,unrelated.id);await comment(sites[0].id,null);await comment(sites[1].id,foreign.id);
  const s1=await submission(sites[0].id,a.id,member.id),s2=await submission(sites[0].id,a.id,member.id);
  const otherSubmission=await submission(sites[0].id,a.id,unrelated.id);await submission(sites[0].id,a.id,null);await submission(sites[1].id,b.id,foreign.id);
  await contact(sites[0].id,a.id,s1.id);await contact(sites[0].id,a.id,s2.id);
  await contact(sites[0].id,a.id,otherSubmission.id);await contact(sites[0].id,a.id,null);
  // These historically possible loose-FK links must not expand selected scope.
  await contact(sites[1].id,b.id,s1.id);await contact(sites[0].id,aOther.id,s1.id);
  const commentAttempt=async(siteId:string,commentId:string,state:string)=>client`INSERT INTO comment_delivery_attempts(site_id,comment_id,kind,channel,target,request_id,state,reason) VALUES(${siteId},${commentId},'comment-submitted','email','PRIVATE DELIVERY TARGET','private-request',${state},'PRIVATE REASON')`;
  const formAttempt=async(siteId:string,formId:string,submissionId:string,state:string)=>client`INSERT INTO form_delivery_attempts(site_id,form_id,submission_id,kind,channel,target,request_id,state) VALUES(${siteId},${formId},${submissionId},'form-submission','webhook','PRIVATE WEBHOOK TARGET','private-request',${state})`;
  for(const state of ['pending','uncertain','succeeded','failed']){await commentAttempt(sites[0].id,c1.id,state);await formAttempt(sites[0].id,a.id,s1.id,state);}
  await commentAttempt(sites[1].id,c1.id,'pending');await commentAttempt(sites[0].id,otherComment.id,'uncertain');await commentAttempt(sites[0].id,randomUUID(),'pending');
  await formAttempt(sites[1].id,b.id,s1.id,'uncertain');await formAttempt(sites[0].id,aOther.id,s1.id,'pending');await formAttempt(sites[0].id,a.id,otherSubmission.id,'pending');await formAttempt(sites[0].id,a.id,randomUUID(),'uncertain');
  await client`INSERT INTO activity_logs(site_id,entity_type,entity_id,action,details) VALUES(${sites[0].id},'comment',${c1.id},'comment-notification',${JSON.stringify({private:'PRIVATE LEGACY DELIVERY PAYLOAD',status:'pending'})}::jsonb)`;
  const expected={comments:2,formSubmissions:2,linkedContacts:2,commentDeliveryAttempts:{total:4,pending:1,unknownOutcome:1},formDeliveryAttempts:{total:4,pending:1,unknownOutcome:1}};
  const first=await review(member.siteId,member.id);assert.deepEqual(first.counts,expected);checks++;
  const upper=await review(member.siteId.toUpperCase(),member.id.toUpperCase());assert.equal(upper.siteId,member.siteId);assert.equal(upper.memberId,member.id);assert.deepEqual(upper.counts,expected);checks++;
  assert.deepEqual(Object.keys(first).sort(),['schema','siteId','memberId','memberStatus','observedAt','reviewMode','counts','retainedCategories','boundaries'].sort());
  assert.equal(first.schema,'backy.visitor-privacy-impact.v1');assert.equal(first.memberStatus,'active');assert.equal(first.reviewMode,'read-only-point-in-time');assert(Number.isFinite(Date.parse(first.observedAt)));checks++;
  assert.deepEqual(first.boundaries,{contactOwnership:'ambiguous-source-submission-link',downstreamProvenance:'unknown',emailMatchedOwnership:false,contentInspected:false,erasurePerformed:false,providerChanged:false});
  assert.deepEqual(first.retainedCategories,['membership-identity','comments-and-moderation','submission-values-files-and-admin-metadata','source-submission-contact-copies','delivery-evidence']);checks++;
  assert(!JSON.stringify(first).includes('PRIVATE'));assert(!JSON.stringify(first).includes(identity.email));assert(!JSON.stringify(first).includes(identity.subject));checks++;
  for(const ids of [[sites[1].id,member.id],[randomUUID(),member.id],[member.siteId,randomUUID()],['site-slug',member.id],[member.siteId,'invalid-member']]){assert.equal(await review(...ids),null);checks++;}
  const foreignReview=await review(foreign.siteId,foreign.id);assert.equal(foreignReview.counts.comments,1);assert.equal(foreignReview.counts.formSubmissions,1);assert.equal(foreignReview.counts.linkedContacts,0);assert.equal(foreignReview.counts.commentDeliveryAttempts.total,0);checks++;
  for(const status of ['suspended','removed']){await client`UPDATE site_visitors SET status=${status} WHERE id=${member.id}`;const result=await review(member.siteId,member.id);assert.equal(result.memberStatus,status);assert.deepEqual(result.counts,expected);checks++;}
  await client`UPDATE sites SET is_published=false,settings=jsonb_set(settings,'{visitorAccounts,enabled}','false') WHERE id=${member.siteId}`;
  assert.deepEqual((await review(member.siteId,member.id)).counts,expected);checks++;
  await client`UPDATE sites SET is_published=true,settings=jsonb_set(settings,'{visitorAccounts,enabled}','true') WHERE id=${member.siteId}`;
  // Reading aggregates succeeds with column permissions that cannot select
  // any private identity, payload, target, evidence or arbitrary audit JSON.
  await client.unsafe(`CREATE ROLE privacy_columns_only NOLOGIN BYPASSRLS; GRANT USAGE ON SCHEMA public TO privacy_columns_only;
    GRANT SELECT(id) ON sites TO privacy_columns_only;
    GRANT SELECT(site_id,id,status) ON site_visitors TO privacy_columns_only;
    GRANT SELECT(id,site_id,visitor_member_id) ON comments TO privacy_columns_only;
    GRANT SELECT(id,site_id,form_id,visitor_member_id) ON form_submissions TO privacy_columns_only;
    GRANT SELECT(site_id,form_id,source_submission_id) ON form_contacts TO privacy_columns_only;
    GRANT SELECT(site_id,comment_id,state) ON comment_delivery_attempts TO privacy_columns_only;
    GRANT SELECT(site_id,form_id,submission_id,state) ON form_delivery_attempts TO privacy_columns_only;`);
  for(const [table,column] of [['site_visitors','email'],['site_visitors','display_name'],['site_visitors','provider_subject'],['comments','content'],['comments','author_email'],['form_submissions','values'],['form_contacts','source_values'],['comment_delivery_attempts','target'],['form_delivery_attempts','provider_evidence'],['activity_logs','details']]){assert.equal((await client`SELECT has_column_privilege('privacy_columns_only',${table},${column},'SELECT') AS allowed`)[0].allowed,false);checks++;}
  await drizzle(client,{schema}).transaction(async(tx)=>{await tx.execute(sql`SET LOCAL ROLE privacy_columns_only`);await tx.execute(sql`SET TRANSACTION READ ONLY`);const restricted=createVisitorPrivacyImpactRepository(tx as any);assert.deepEqual((await restricted.review(member.siteId,member.id))!.counts,expected);});checks++;
  // No count-only read changes stored records or issues new grants/audit rows.
  const stored=async()=>({member:await client`SELECT * FROM site_visitors WHERE id=${member.id}`,comments:await client`SELECT * FROM comments WHERE site_id=${member.siteId}`,submissions:await client`SELECT * FROM form_submissions WHERE site_id=${member.siteId}`,contacts:await client`SELECT * FROM form_contacts WHERE site_id=${member.siteId}`,audit:await client`SELECT * FROM activity_logs ORDER BY id`});
  const before=await stored();for(let i=0;i<3;i++)await review(member.siteId,member.id);assert.deepEqual(await stored(),before);checks++;
  await assert.rejects(()=>createVisitorPrivacyImpactRepository({} as any,'demo').review(member.siteId,member.id),(error:any)=>error.code==='VISITOR_PRIVACY_IMPACT_UNAVAILABLE');checks++;
  await client`UPDATE site_visitors SET status='active' WHERE id=${member.id}`;
  const httpBefore=await stored();
  const http=await verifyVisitorPrivacyImpactHttp({repositories,sites,memberId:member.id,otherMemberId:foreign.id,expected:first});
  assert.deepEqual(await stored(),httpBefore,'Real HTTP review and denial paths leave persisted records unchanged');checks++;
  console.log(JSON.stringify({ok:true,mode:'owned-socket-only-postgresql',visitorPrivacyRepositoryChecks:checks,visitorPrivacyHttpChecks:http.checks,countsOnly:true,privateColumnsAccessible:false,readOnlyTransaction:true,configuredTargetUsed:false,providerCalls:0}));
  return {checks,httpChecks:http.checks};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.length>2)throw new Error('No configured target arguments allowed');
  await withVisitorProfilePostgres(runVisitorPrivacyRepositoryProof);
}
