import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { BackyVisitorErasureChoices, BackyVisitorErasureCounts, BackyVisitorErasureRepository } from '@backy-cms/core';
import type { DatabaseInstance } from '../adapters';
import { postgresResultRows } from '../adapters/postgres-result';
import { lockVisitorPrivacySite, withVisitorPrivacyTransaction } from './visitor-privacy-admission';
const retained=['provider-subject-tombstone','other-websites','private-attachment-bytes-and-references','ambiguous-or-retained-contacts','collection-copies','historical-audit-and-delivery-evidence','newsletter-consent-and-delivery-snapshots','downstream-provider-copies'] as const;
const boundaries={profileIdentifiers:'redact',admission:'remove-and-fence',providerChanged:false,emailMatchedOwnership:false,downstreamErasure:'unverified',ambiguousContacts:'retain-and-fence'} as const;
const uuid=(value:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const invalid=()=>Object.assign(new Error('A fresh exact-scope privacy preview is required.'),{code:'VISITOR_ERASURE_PREVIEW_CONFLICT',status:409});
export function visitorErasureChoices(value:unknown):value is BackyVisitorErasureChoices {return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===3&&['redact','retain'].includes((value as any).comments)&&['redact','retain'].includes((value as any).submissions)&&['delete','retain'].includes((value as any).exclusiveContacts);}
async function inventory(tx:NodePgDatabase,siteId:string,memberId:string) {
 const result=await tx.execute(sql`
 WITH member AS (SELECT * FROM site_visitors WHERE site_id=${siteId}::uuid AND id=${memberId}::uuid),
 c AS (SELECT * FROM comments WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid AND privacy_erased_at IS NULL),
 s AS (SELECT * FROM form_submissions WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid AND privacy_erased_at IS NULL),
 contacts AS (SELECT f.*, NOT f.provenance_ambiguous AND EXISTS (SELECT 1 FROM form_contact_contributors p WHERE p.contact_id=f.id AND p.site_id=f.site_id AND p.member_id=${memberId}::uuid) AND NOT EXISTS (SELECT 1 FROM form_contact_contributors p WHERE p.contact_id=f.id AND (p.member_id IS NULL OR p.member_id<>${memberId}::uuid OR p.site_id<>${siteId}::uuid)) AS exclusive FROM form_contacts f WHERE f.site_id=${siteId}::uuid AND EXISTS (SELECT 1 FROM form_contact_contributors p WHERE p.site_id=f.site_id AND p.contact_id=f.id AND p.member_id=${memberId}::uuid) OR (f.site_id=${siteId}::uuid AND EXISTS (SELECT 1 FROM form_submissions s WHERE s.site_id=f.site_id AND s.form_id=f.form_id AND s.id=f.source_submission_id AND s.visitor_member_id=${memberId}::uuid))),
 ca AS (SELECT d.* FROM comment_delivery_attempts d WHERE d.site_id=${siteId}::uuid AND d.comment_id IN (SELECT id FROM comments WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid)),
 fa AS (SELECT d.* FROM form_delivery_attempts d WHERE d.site_id=${siteId}::uuid AND d.submission_id IN (SELECT id FROM form_submissions WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid)),
 nd AS (SELECT d.* FROM newsletter_deliveries d WHERE d.site_id=${siteId}::uuid AND d.contact_id IN (SELECT id FROM contacts))
 SELECT (SELECT id FROM member) member_id,
 jsonb_build_object('member',(SELECT md5(to_jsonb(member)::text) FROM member),'comments',(SELECT jsonb_agg(md5(to_jsonb(c)::text) ORDER BY id) FROM c),'submissions',(SELECT jsonb_agg(md5(to_jsonb(s)::text) ORDER BY id) FROM s),'contacts',(SELECT jsonb_agg(md5(to_jsonb(contacts)::text) ORDER BY id) FROM contacts),'contributors',(SELECT jsonb_agg(md5(to_jsonb(p)::text) ORDER BY p.contact_id,p.submission_id) FROM form_contact_contributors p WHERE p.contact_id IN (SELECT id FROM contacts)),'commentAttempts',(SELECT jsonb_agg(md5(to_jsonb(ca)::text) ORDER BY id) FROM ca),'formAttempts',(SELECT jsonb_agg(md5(to_jsonb(fa)::text) ORDER BY id) FROM fa),'newsletter',(SELECT jsonb_agg(md5(to_jsonb(nd)::text) ORDER BY id) FROM nd)) snapshot,
 (SELECT count(*) FROM c)::int comments,(SELECT count(*) FROM s)::int submissions,
 (SELECT count(*) FROM contacts WHERE exclusive)::int exclusive_contacts,(SELECT count(*) FROM contacts WHERE NOT exclusive)::int ambiguous_contacts,
 (SELECT count(*) FROM s CROSS JOIN LATERAL jsonb_each(s.values) v CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.value)='array' THEN v.value ELSE jsonb_build_array(v.value) END) a WHERE a->>'kind'='backy.form.attachment.v1')::int attachments,
 (SELECT count(*) FROM ca)::int comment_attempts,(SELECT count(*) FROM fa)::int form_attempts,(SELECT count(*) FROM nd)::int newsletter_snapshots`);
 const row=postgresResultRows<any>(result)[0];if(!row?.member_id)return null;
 const counts:BackyVisitorErasureCounts={comments:row.comments,submissions:row.submissions,exclusiveContacts:row.exclusive_contacts,ambiguousContacts:row.ambiguous_contacts,retainedAttachments:row.attachments,commentDeliveryAttempts:row.comment_attempts,formDeliveryAttempts:row.form_attempts,newsletterSnapshots:row.newsletter_snapshots};
 return {counts,fingerprint:createHash('sha256').update(JSON.stringify(row.snapshot)).digest('hex')};
}
export function createVisitorErasureRepository(db:DatabaseInstance):BackyVisitorErasureRepository {
 return {
  async withDeletionPreflight(siteId,formId,operation){
   if(!uuid(siteId)||formId!==null&&!uuid(formId))throw Object.assign(new Error('Invalid privacy teardown scope'),{code:'VISITOR_PRIVACY_TEARDOWN_UNAVAILABLE',status:503});
   return withVisitorPrivacyTransaction(db,async tx=>{
    await lockVisitorPrivacySite(tx,siteId);
    const result=await tx.execute(sql`SELECT
     (SELECT count(*) FROM form_contact_contributors p WHERE p.site_id=${siteId}::uuid ${formId===null?sql``:sql`AND (EXISTS(SELECT 1 FROM form_submissions s WHERE s.site_id=p.site_id AND s.id=p.submission_id AND s.form_id=${formId}::uuid) OR EXISTS(SELECT 1 FROM form_contacts c WHERE c.site_id=p.site_id AND c.id=p.contact_id AND c.form_id=${formId}::uuid))`})::int contributors,
     (SELECT count(*) FROM visitor_privacy_fences WHERE site_id=${siteId}::uuid AND ${formId===null})::int fences,
     (SELECT count(*) FROM visitor_erasure_receipts WHERE site_id=${siteId}::uuid AND ${formId===null})::int receipts`);
    const counts=postgresResultRows<any>(result)[0];
    if(!counts||[counts.contributors,counts.fences,counts.receipts].some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Privacy teardown inventory unavailable');
    if(counts.contributors+counts.fences+counts.receipts>0)throw Object.assign(new Error('Retained visitor privacy evidence prevents teardown'),{code:'VISITOR_PRIVACY_EVIDENCE_REMAINS',status:409});
    return operation();
   });
  },
  async preview(siteId,memberId,actorId,choices){
   if(![siteId,memberId,actorId].every(uuid)||!visitorErasureChoices(choices))throw invalid();
   return withVisitorPrivacyTransaction(db,async tx=>{await lockVisitorPrivacySite(tx,siteId);if(postgresResultRows(await tx.execute(sql`SELECT 1 FROM visitor_privacy_fences WHERE site_id=${siteId}::uuid AND member_id=${memberId}::uuid`)).length)throw Object.assign(new Error('Local erasure already completed'),{code:'VISITOR_ERASURE_ALREADY_COMPLETED',status:409});const current=await inventory(tx,siteId,memberId);if(!current)return null;
    await tx.execute(sql`DELETE FROM visitor_erasure_previews WHERE site_id=${siteId}::uuid AND expires_at<=clock_timestamp()`);
    const result=await tx.execute(sql`INSERT INTO visitor_erasure_previews(site_id,member_id,actor_id,choices,fingerprint,expires_at) VALUES(${siteId}::uuid,${memberId}::uuid,${actorId}::uuid,${JSON.stringify(choices)}::jsonb,${current.fingerprint},clock_timestamp()+interval '5 minutes') RETURNING id,expires_at`);const row=postgresResultRows<any>(result)[0];
    return {schema:'backy.visitor-erasure-preview.v1',previewId:row.id,siteId,memberId,expiresAt:new Date(row.expires_at).toISOString(),choices:{...choices},counts:current.counts,retainedCategories:[...retained],boundaries};
   });
  },
  async confirm(siteId,memberId,actorId,previewId,requestId){
   if(![siteId,memberId,actorId,previewId].every(uuid)||typeof requestId!=='string'||requestId.length>200)throw invalid();
   return withVisitorPrivacyTransaction(db,async tx=>{
    await lockVisitorPrivacySite(tx,siteId);
    const member=postgresResultRows<any>(await tx.execute(sql`SELECT id FROM site_visitors WHERE site_id=${siteId}::uuid AND id=${memberId}::uuid FOR UPDATE`))[0];if(!member)return null;
    const completed=postgresResultRows<any>(await tx.execute(sql`SELECT * FROM visitor_erasure_receipts WHERE site_id=${siteId}::uuid AND member_id=${memberId}::uuid AND actor_id=${actorId}::uuid AND preview_id=${previewId}::uuid`))[0];
    if(completed)return {schema:'backy.visitor-erasure-receipt.v1',receiptId:completed.id,siteId,memberId,completedAt:new Date(completed.created_at).toISOString(),choices:completed.choices,counts:completed.counts,retainedCategories:[...retained],boundaries,localErasurePerformed:true};
    const preview=postgresResultRows<any>(await tx.execute(sql`SELECT * FROM visitor_erasure_previews WHERE id=${previewId}::uuid AND site_id=${siteId}::uuid AND member_id=${memberId}::uuid AND actor_id=${actorId}::uuid AND expires_at>clock_timestamp() FOR UPDATE`))[0];if(!preview||!visitorErasureChoices(preview.choices))throw invalid();
    // Row locks also serialize with ordinary moderation/contact edits before snapshot validation.
    await tx.execute(sql`SELECT id FROM comments WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid ORDER BY id FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM form_submissions WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid ORDER BY id FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM form_contacts WHERE site_id=${siteId}::uuid AND (id IN (SELECT contact_id FROM form_contact_contributors WHERE site_id=${siteId}::uuid AND member_id=${memberId}::uuid) OR source_submission_id IN (SELECT id FROM form_submissions WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid)) ORDER BY id FOR UPDATE`);
    const current=await inventory(tx,siteId,memberId);if(!current||current.fingerprint!==preview.fingerprint)throw invalid();
    const choices=preview.choices as BackyVisitorErasureChoices;
    await tx.execute(sql`DELETE FROM visitor_sessions WHERE site_id=${siteId}::uuid AND member_id=${memberId}::uuid`);
    await tx.execute(sql`DELETE FROM visitor_recovery_challenges WHERE site_id=${siteId}::uuid AND member_id=${memberId}::uuid`);
    await tx.execute(sql`DELETE FROM visitor_pkce_flows WHERE site_id=${siteId}::uuid AND (member_id=${memberId}::uuid OR expected_email IN (SELECT email FROM site_visitors WHERE site_id=${siteId}::uuid AND id=${memberId}::uuid))`);
    let changedComments=0,changedSubmissions=0,deletedContacts=0;
    if(choices.comments==='redact')changedComments=postgresResultRows(await tx.execute(sql`UPDATE comments SET content='',author_name='Removed visitor',author_email=NULL,author_website=NULL,user_id=NULL,status='rejected',reviewed_by=NULL,reviewed_at=NULL,rejection_reason=NULL,block_reason=NULL,blocked_by=NULL,blocked_at=NULL,report_count=0,report_reasons='[]'::jsonb,request_id=NULL,ip_hash=NULL,privacy_erased_at=clock_timestamp(),updated_at=clock_timestamp() WHERE site_id=${siteId}::uuid AND visitor_member_id=${memberId}::uuid AND privacy_erased_at IS NULL RETURNING id`)).length;
    if(choices.submissions==='redact')changedSubmissions=postgresResultRows(await tx.execute(sql`UPDATE form_submissions s SET values=(SELECT jsonb_build_object('_retainedAttachments',COALESCE(jsonb_agg(jsonb_build_object('kind',a->'kind','id',a->'id','attachmentId',a->'attachmentId','filename','Retained attachment','mimeType',a->'mimeType','sizeBytes',a->'sizeBytes')),'[]'::jsonb)) FROM jsonb_each(s.values) v CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.value)='array' THEN v.value ELSE jsonb_build_array(v.value) END) a WHERE a->>'kind'='backy.form.attachment.v1'),ip_hash=NULL,user_agent=NULL,request_id=NULL,status='rejected',reviewed_by=NULL,reviewed_at=NULL,admin_notes=NULL,collection_record=NULL,collection_record_errors='[]'::jsonb,privacy_erased_at=clock_timestamp(),updated_at=clock_timestamp() WHERE s.site_id=${siteId}::uuid AND s.visitor_member_id=${memberId}::uuid AND s.privacy_erased_at IS NULL RETURNING id`)).length;
    if(choices.exclusiveContacts==='delete')deletedContacts=postgresResultRows(await tx.execute(sql`DELETE FROM form_contacts c WHERE c.site_id=${siteId}::uuid AND NOT c.provenance_ambiguous AND EXISTS(SELECT 1 FROM form_contact_contributors p WHERE p.site_id=c.site_id AND p.contact_id=c.id AND p.member_id=${memberId}::uuid) AND NOT EXISTS(SELECT 1 FROM form_contact_contributors p WHERE p.contact_id=c.id AND (p.member_id IS NULL OR p.member_id<>${memberId}::uuid OR p.site_id<>${siteId}::uuid)) RETURNING id`)).length;
    await tx.execute(sql`INSERT INTO visitor_privacy_fences(site_id,member_id) VALUES(${siteId}::uuid,${memberId}::uuid) ON CONFLICT DO NOTHING`);
    await tx.execute(sql`UPDATE site_visitors SET email='erased-'||id::text||'@visitor.invalid',display_name='',status='removed',updated_at=clock_timestamp() WHERE site_id=${siteId}::uuid AND id=${memberId}::uuid`);
    const counts={...current.counts,comments:changedComments,submissions:changedSubmissions,exclusiveContacts:deletedContacts};
    const receipt=postgresResultRows<any>(await tx.execute(sql`INSERT INTO visitor_erasure_receipts(site_id,member_id,actor_id,preview_id,choices,counts,request_id) VALUES(${siteId}::uuid,${memberId}::uuid,${actorId}::uuid,${previewId}::uuid,${JSON.stringify(choices)}::jsonb,${JSON.stringify(counts)}::jsonb,${requestId}) RETURNING id,created_at`))[0];
    await tx.execute(sql`DELETE FROM visitor_erasure_previews WHERE site_id=${siteId}::uuid AND member_id=${memberId}::uuid`);
    return {schema:'backy.visitor-erasure-receipt.v1',receiptId:receipt.id,siteId,memberId,completedAt:new Date(receipt.created_at).toISOString(),choices:{...choices},counts,retainedCategories:[...retained],boundaries,localErasurePerformed:true};
   });
  },
 };
}
