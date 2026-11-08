import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { BackyVisitorPrivacyImpactRepository } from '@backy-cms/core';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';

const uuid = (value: string) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const unavailable = () => Object.assign(new Error('Visitor privacy impact review is unavailable'), {code:'VISITOR_PRIVACY_IMPACT_UNAVAILABLE'});
const countValue = (value: unknown): number => {
  if (typeof value !== 'string' && typeof value !== 'number') throw unavailable();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw unavailable();
  return parsed;
};

export function createVisitorPrivacyImpactRepository(db: DatabaseInstance, adapterType='postgres'): BackyVisitorPrivacyImpactRepository {
  const database = db as NodePgDatabase<typeof schema>;
  return {
    async review(siteId, memberId) {
      if (adapterType !== 'postgres') throw unavailable();
      if (!uuid(siteId) || !uuid(memberId)) return null;
      siteId = siteId.toLowerCase();
      memberId = memberId.toLowerCase();
      // One SELECT uses one MVCC statement snapshot for membership and counts.
      // Payload, email/name, provider identity, legacy audit JSON and delivery
      // target/evidence columns are deliberately absent from this projection.
      const result: any = await database.execute(sql`
        WITH selected_member AS (
          SELECT m.site_id, m.id AS member_id, m.status
          FROM site_visitors m JOIN sites s ON s.id = m.site_id
          WHERE m.site_id = ${siteId}::uuid AND m.id = ${memberId}::uuid
        ), linked_comments AS (
          SELECT c.id, c.site_id FROM comments c JOIN selected_member m
            ON c.site_id = m.site_id AND c.visitor_member_id = m.member_id
        ), linked_submissions AS (
          SELECT f.id, f.site_id, f.form_id FROM form_submissions f JOIN selected_member m
            ON f.site_id = m.site_id AND f.visitor_member_id = m.member_id
        ), comment_attempts AS (
          SELECT d.state FROM comment_delivery_attempts d JOIN linked_comments c
            ON d.site_id = c.site_id AND d.comment_id = c.id
        ), form_attempts AS (
          SELECT d.state FROM form_delivery_attempts d JOIN linked_submissions f
            ON d.site_id = f.site_id AND d.form_id = f.form_id AND d.submission_id = f.id
        )
        SELECT m.site_id, m.member_id, m.status, statement_timestamp() AS observed_at,
          (SELECT count(*) FROM linked_comments)::text AS comments,
          (SELECT count(*) FROM linked_submissions)::text AS submissions,
          (SELECT count(*) FROM form_contacts c JOIN linked_submissions f
            ON c.site_id = f.site_id AND c.form_id = f.form_id AND c.source_submission_id = f.id)::text AS contacts,
          (SELECT count(*) FROM comment_attempts)::text AS comment_total,
          (SELECT count(*) FROM comment_attempts WHERE state = 'pending')::text AS comment_pending,
          (SELECT count(*) FROM comment_attempts WHERE state = 'uncertain')::text AS comment_unknown,
          (SELECT count(*) FROM form_attempts)::text AS form_total,
          (SELECT count(*) FROM form_attempts WHERE state = 'pending')::text AS form_pending,
          (SELECT count(*) FROM form_attempts WHERE state = 'uncertain')::text AS form_unknown
        FROM selected_member m
      `);
      const row = (Array.isArray(result) ? result : result.rows)?.[0];
      if (!row) return null;
      if (row.site_id !== siteId || row.member_id !== memberId || !['active','suspended','removed'].includes(row.status)) throw unavailable();
      const observedAt = new Date(row.observed_at).toISOString();
      return {
        schema:'backy.visitor-privacy-impact.v1', siteId, memberId, memberStatus:row.status, observedAt, reviewMode:'read-only-point-in-time',
        counts:{comments:countValue(row.comments),formSubmissions:countValue(row.submissions),linkedContacts:countValue(row.contacts),
          commentDeliveryAttempts:{total:countValue(row.comment_total),pending:countValue(row.comment_pending),unknownOutcome:countValue(row.comment_unknown)},
          formDeliveryAttempts:{total:countValue(row.form_total),pending:countValue(row.form_pending),unknownOutcome:countValue(row.form_unknown)}},
        retainedCategories:['membership-identity','comments-and-moderation','submission-values-files-and-admin-metadata','source-submission-contact-copies','delivery-evidence'],
        boundaries:{contactOwnership:'ambiguous-source-submission-link',downstreamProvenance:'unknown',emailMatchedOwnership:false,contentInspected:false,erasurePerformed:false,providerChanged:false},
      };
    },
  };
}
