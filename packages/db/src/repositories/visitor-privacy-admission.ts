import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import { postgresResultRows } from '../adapters/postgres-result';
export type VisitorPrivacyFollowupScope = { submissionId: string; formId?: string } | { contactId: string } | { commentId: string };
const active = new WeakMap<object, number>();
export async function withVisitorPrivacyTransaction<T>(db: DatabaseInstance, operation: (transaction: NodePgDatabase) => Promise<T>): Promise<T> {
  const count=active.get(db)||0;if(count>=2)throw Object.assign(new Error('Privacy admission is busy. Retry after the current follow-up.'),{code:'VISITOR_PRIVACY_BUSY',status:503});
  active.set(db,count+1);
  try{return await (db as unknown as NodePgDatabase).transaction(operation);}
  finally{const remaining=(active.get(db)||1)-1;if(remaining)active.set(db,remaining);else active.delete(db);}
}
const context = new AsyncLocalStorage<{ database: DatabaseInstance; siteId: string; transaction: NodePgDatabase }>();
export const visitorPrivacyFenced = () => Object.assign(new Error('This source has been fenced by a visitor privacy action. No follow-up was performed.'), { code: 'VISITOR_PRIVACY_FENCED', status: 409 });
export async function lockVisitorPrivacySite(database: NodePgDatabase, siteId: string) {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext('backy:visitor-privacy'),hashtext(${siteId}))`);
}
async function check(database: NodePgDatabase, siteId: string, scope: VisitorPrivacyFollowupScope) {
  const result = 'submissionId' in scope ? await database.execute(sql`SELECT 1 FROM form_submissions s WHERE s.site_id=${siteId}::uuid AND s.id=${scope.submissionId}::uuid ${scope.formId ? sql`AND s.form_id=${scope.formId}::uuid` : sql``} AND s.privacy_erased_at IS NULL AND NOT EXISTS (SELECT 1 FROM visitor_privacy_fences f WHERE f.site_id=s.site_id AND f.member_id=s.visitor_member_id)`)
    : 'commentId' in scope ? await database.execute(sql`SELECT 1 FROM comments c WHERE c.site_id=${siteId}::uuid AND c.id=${scope.commentId}::uuid AND c.privacy_erased_at IS NULL AND NOT EXISTS (SELECT 1 FROM visitor_privacy_fences f WHERE f.site_id=c.site_id AND f.member_id=c.visitor_member_id)`)
    : await database.execute(sql`SELECT 1 FROM form_contacts c WHERE c.site_id=${siteId}::uuid AND c.id=${scope.contactId}::uuid AND NOT EXISTS (SELECT 1 FROM form_contact_contributors p JOIN visitor_privacy_fences f ON f.site_id=p.site_id AND f.member_id=p.member_id WHERE p.site_id=c.site_id AND p.contact_id=c.id) AND NOT EXISTS (SELECT 1 FROM form_submissions s JOIN visitor_privacy_fences f ON f.site_id=s.site_id AND f.member_id=s.visitor_member_id WHERE s.site_id=c.site_id AND s.form_id=c.form_id AND s.id=c.source_submission_id)`);
  if (!postgresResultRows(result).length) throw visitorPrivacyFenced();
}
/** The site lock spans provider execution. Erasure cannot commit between admission and a delayed send/copy. */
export async function withVisitorPrivacyFollowup<T>(db: DatabaseInstance, siteId: string, scope: VisitorPrivacyFollowupScope, action: () => Promise<T>): Promise<T> {
  const inherited = context.getStore();
  if (inherited?.database === db && inherited.siteId === siteId) { await check(inherited.transaction, siteId, scope); return action(); }
  return withVisitorPrivacyTransaction(db, async transaction => {
    await lockVisitorPrivacySite(transaction, siteId);
    await check(transaction, siteId, scope);
    return context.run({ database: db, siteId, transaction }, action);
  });
}
