import { createVisitorErasureRepository } from './visitor-erasure';
import { and, asc, desc, eq, gt, ilike, inArray, lt, ne, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { BackySiteVisitor, BackyVisitorAccountRepository, BackyVisitorMemberManagementContext } from '@backy-cms/core';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';
import { siteVisitors, visitorSessions, visitorAuthRateLimits, visitorRecoveryChallenges, visitorPkceFlows, profiles, activityLogs, sites } from '../schema';
import { createVisitorPrivacyImpactRepository } from './visitor-privacy';
const toMember = (row: typeof siteVisitors.$inferSelect): BackySiteVisitor => ({
  id: row.id, siteId: row.siteId, email: row.email, displayName: row.displayName, status: row.status as BackySiteVisitor['status'],
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
const emailValue = (value: unknown): string | null => typeof value === 'string' && value.length <= 254 && !/\p{Cc}/u.test(value)
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const verifiedIdentity = (value: unknown): value is { issuer: string; subject: string; email: string } => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 3 && ['issuer', 'subject', 'email'].every(key => Object.hasOwn(value, key))
  && typeof (value as any).issuer === 'string' && (value as any).issuer.length > 0 && (value as any).issuer.length <= 2048 && !/\p{Cc}/u.test((value as any).issuer)
  && typeof (value as any).subject === 'string' && (value as any).subject.length > 0 && (value as any).subject.length <= 200 && !/\p{Cc}/u.test((value as any).subject) && emailValue((value as any).email));
const uuidValue = (value: string) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const emailConflict = () => Object.assign(new Error('Visitor email change conflicts with an existing membership'), { code: 'VISITOR_EMAIL_CHANGE_CONFLICT' });
const uniqueFailure = (error: unknown): boolean => {
  for (let depth = 0; error && typeof error === 'object' && depth < 4; depth++, error = (error as any).cause) if ((error as any).code === '23505') return true;
  return false;
};
export function createVisitorAccountRepository(db: DatabaseInstance): BackyVisitorAccountRepository {
  const database = db as NodePgDatabase<typeof schema>;
  const byIdentity = (siteId: string, identity: { issuer: string; subject: string }) => and(eq(siteVisitors.siteId, siteId), eq(siteVisitors.providerIssuer, identity.issuer), eq(siteVisitors.providerSubject, identity.subject));
  // Enrollment shares this transaction lock: a new membership cannot appear
  // halfway through subject-wide email reconciliation or session revocation.
  const identityLock = (tx: any, identity: { issuer: string; subject: string }) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${identity.issuer}), hashtext(${identity.subject}))`);
  // Enrollment of a different subject also shares the target-email lock, so
  // a new conflicting row cannot slip between collision checks and commit.
  const emailLock = (tx: any, email: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('backy:visitor-email'), hashtext(${email}))`);
  const subjectScope = (identity: { issuer: string; subject: string }) => and(eq(siteVisitors.providerIssuer, identity.issuer), eq(siteVisitors.providerSubject, identity.subject));
  const emailChange = async (siteId: string, identity: { issuer: string; subject: string; email: string }, admission?: { memberId: string; tokenHash: string; targetEmail: string }) => {
    if (!uuidValue(siteId) || !verifiedIdentity(identity) || admission && (!uuidValue(admission.memberId) || !/^[a-f0-9]{64}$/.test(admission.tokenHash) || !emailValue(admission.targetEmail))) return null;
    const currentEmail = emailValue(identity.email)!, targetEmail = admission ? emailValue(admission.targetEmail)! : currentEmail;
    try {
      return await database.transaction(async tx => {
        // Match comment admission's site-before-member order. Policy cannot be
        // unpublished/disabled during this transaction's selected-site write.
        const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.isPublished, true), sql`${sites.settings}->'visitorAccounts'->>'enabled' = 'true'`)).for('share');
        if (!site) return null;
        await identityLock(tx, identity);
        await emailLock(tx, targetEmail);
        const members = await tx.select().from(siteVisitors).where(subjectScope(identity)).orderBy(asc(siteVisitors.siteId), asc(siteVisitors.id)).for('update');
        const selected = members.find(member => member.siteId === siteId && (!admission || member.id === admission.memberId));
        if (!selected || selected.status !== 'active' || admission && selected.email !== currentEmail) return null;
        const mutable = members.filter(member => member.status === 'active' || member.status === 'suspended');
        const emails = [...new Set([...members.map(member => member.email), currentEmail, targetEmail])];
        const [operator] = await tx.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${identity.subject}`, sql`lower(trim(${profiles.email})) IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(emails)}::jsonb))`)).limit(1);
        if (operator) return null;
        if (admission) {
          const [session] = await tx.select({ tokenHash: visitorSessions.tokenHash }).from(visitorSessions).where(and(eq(visitorSessions.siteId, siteId), eq(visitorSessions.memberId, selected.id), eq(visitorSessions.tokenHash, admission.tokenHash))).for('update');
          if (!session) return null;
          // Expiry is checked after all potentially waiting locks, using wall
          // time rather than the transaction's earlier now() snapshot.
          const [live] = await tx.select({ tokenHash: visitorSessions.tokenHash }).from(visitorSessions).where(and(eq(visitorSessions.tokenHash, admission.tokenHash), sql`${visitorSessions.expiresAt} > clock_timestamp()`));
          if (!live) return null;
        }
        const [collision] = await tx.select({ id: siteVisitors.id }).from(siteVisitors).where(and(inArray(siteVisitors.siteId, mutable.map(member => member.siteId)), eq(siteVisitors.email, targetEmail), or(ne(siteVisitors.providerIssuer, identity.issuer), ne(siteVisitors.providerSubject, identity.subject)))).limit(1);
        if (collision) throw emailConflict();
        const ids = members.map(member => member.id);
        await tx.delete(visitorPkceFlows).where(or(inArray(visitorPkceFlows.memberId, ids), inArray(visitorPkceFlows.expectedEmail, emails)));
        const sessions = await tx.delete(visitorSessions).where(inArray(visitorSessions.memberId, ids)).returning({ tokenHash: visitorSessions.tokenHash });
        const challenges = await tx.delete(visitorRecoveryChallenges).where(inArray(visitorRecoveryChallenges.memberId, ids)).returning({ tokenHash: visitorRecoveryChallenges.tokenHash });
        let member = selected;
        let synchronizedMemberships = 0;
        if (!admission) {
          const updated = await tx.update(siteVisitors).set({ email: targetEmail, updatedAt: new Date() }).where(and(subjectScope(identity), inArray(siteVisitors.status, ['active', 'suspended']), ne(siteVisitors.email, targetEmail))).returning();
          synchronizedMemberships = updated.length;
          member = updated.find(row => row.id === selected.id) || selected;
        }
        return { member: toMember(member), revokedSessions: sessions.length, revokedRecoveryChallenges: challenges.length, synchronizedMemberships };
      });
    } catch (error) { if (uniqueFailure(error)) throw emailConflict(); throw error; }
  };
  const manage = async (siteId: string, memberId: string, operation: 'update' | 'revoke' | 'remove', input: { displayName?: string; status?: 'active' | 'suspended' } = {}, context: BackyVisitorMemberManagementContext = {}) => database.transaction(async tx => {
    const scope = and(eq(siteVisitors.siteId, siteId), eq(siteVisitors.id, memberId));
    const [before] = await tx.select().from(siteVisitors).where(scope).for('update');
    if (!before) return null;
    if (before.status === 'removed' && operation === 'update') throw Object.assign(new Error('Removed membership cannot be edited or reactivated.'), { code: 'VISITOR_MEMBER_REMOVED' });
    if (input.status === 'active') {
      const [operator] = await tx.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${before.providerSubject}`, sql`lower(trim(${profiles.email})) = ${before.email}`)).limit(1);
      if (operator) throw Object.assign(new Error('CMS operators cannot hold active visitor admission.'), { code: 'VISITOR_OPERATOR_IDENTITY_DENIED' });
    }
    const revoke = operation !== 'update' || input.status === 'suspended';
    if (revoke) await tx.delete(visitorPkceFlows).where(and(eq(visitorPkceFlows.siteId, siteId), or(eq(visitorPkceFlows.memberId, memberId), eq(visitorPkceFlows.expectedEmail, before.email))));
    const sessions = revoke ? await tx.delete(visitorSessions).where(and(eq(visitorSessions.siteId, siteId), eq(visitorSessions.memberId, memberId))).returning({ tokenHash: visitorSessions.tokenHash }) : [];
    const challenges = revoke ? await tx.delete(visitorRecoveryChallenges).where(and(eq(visitorRecoveryChallenges.siteId, siteId), eq(visitorRecoveryChallenges.memberId, memberId))).returning({ tokenHash: visitorRecoveryChallenges.tokenHash }) : [];
    const changes = operation === 'remove' ? { status: 'removed' } : operation === 'update' ? input : {};
    const [member] = Object.keys(changes).length ? await tx.update(siteVisitors).set({ ...changes, updatedAt: new Date() }).where(scope).returning() : [before];
    await tx.insert(activityLogs).values({ siteId, userId: context.actorId || null, entityType: 'site', entityId: siteId, action: `visitor.member.${operation}`, details: { visitorMemberId: memberId, beforeStatus: before.status, afterStatus: member.status, displayNameChanged: before.displayName !== member.displayName, revokedSessions: sessions.length, revokedRecoveryChallenges: challenges.length, requestId: context.requestId || null, retainedAttribution: true, providerChanged: false } });
    return { member: toMember(member), revokedSessions: sessions.length, revokedRecoveryChallenges: challenges.length };
  });
  return {
    privacyErasure: createVisitorErasureRepository(db),
    pkce: {
      async create(flow) {
        if (!uuidValue(flow.siteId) || !/^[a-f0-9]{64}$/.test(flow.stateHash) || !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier) || !emailValue(flow.expectedEmail) || flow.displayName.length > 120 || /\p{Cc}/u.test(flow.displayName) || !['signup','recovery'].includes(flow.purpose) || (flow.purpose === 'signup' ? flow.memberId !== null : !flow.memberId || !uuidValue(flow.memberId))) throw new Error('Invalid visitor PKCE flow');
        const expiresAt = new Date(flow.expiresAt);
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 16 * 60 * 1000 || new URL(flow.returnUrl).origin !== flow.origin) throw new Error('Invalid visitor PKCE scope');
        await database.transaction(async tx => {
          const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, flow.siteId), eq(sites.isPublished, true), sql`${sites.settings}->'visitorAccounts'->>'enabled' = 'true'`, sql`${sites.settings}->'visitorAccounts'->'allowedOrigins' ? ${flow.origin}`, sql`${sites.settings}->'visitorAccounts'->'returnUrls' ? ${flow.returnUrl}`)).for('share');
          if (!site) throw new Error('Visitor PKCE policy unavailable');
          if (flow.memberId) {
            const [member] = await tx.select().from(siteVisitors).where(and(eq(siteVisitors.siteId, flow.siteId), eq(siteVisitors.id, flow.memberId))).for('update');
            if (!member || member.status !== 'active' || member.email !== flow.expectedEmail) throw new Error('Visitor PKCE admission unavailable');
            const [operator] = await tx.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${member.providerSubject}`, sql`lower(trim(${profiles.email})) = ${member.email}`)).limit(1);
            if (operator) throw new Error('Visitor PKCE admission unavailable');
          }
          await tx.delete(visitorPkceFlows).where(and(eq(visitorPkceFlows.siteId, flow.siteId), sql`${visitorPkceFlows.expiresAt} <= clock_timestamp()`));
          await tx.insert(visitorPkceFlows).values({ ...flow, expiresAt });
        });
      },
      async consume(siteId, stateHash, origin, returnUrl, purpose) {
        if (!uuidValue(siteId) || !/^[a-f0-9]{64}$/.test(stateHash)) return null;
        const [flow] = await database.delete(visitorPkceFlows).where(and(eq(visitorPkceFlows.siteId, siteId), eq(visitorPkceFlows.stateHash, stateHash), eq(visitorPkceFlows.origin, origin), eq(visitorPkceFlows.returnUrl, returnUrl), eq(visitorPkceFlows.purpose, purpose), sql`${visitorPkceFlows.expiresAt} > clock_timestamp()`,
          sql`EXISTS (SELECT 1 FROM ${sites} WHERE ${sites.id} = ${siteId} AND ${sites.isPublished} = true AND ${sites.settings}->'visitorAccounts'->>'enabled' = 'true' AND ${sites.settings}->'visitorAccounts'->'allowedOrigins' ? ${origin} AND ${sites.settings}->'visitorAccounts'->'returnUrls' ? ${returnUrl})`,
          sql`(${visitorPkceFlows.purpose} = 'signup' OR EXISTS (SELECT 1 FROM ${siteVisitors} WHERE ${siteVisitors.id} = ${visitorPkceFlows.memberId} AND ${siteVisitors.siteId} = ${siteId} AND ${siteVisitors.status} = 'active' AND ${siteVisitors.email} = ${visitorPkceFlows.expectedEmail} AND NOT EXISTS (SELECT 1 FROM ${profiles} WHERE ${profiles.id}::text = ${siteVisitors.providerSubject} OR lower(trim(${profiles.email})) = ${siteVisitors.email})))`,
        )).returning();
        return flow ? { ...flow, purpose: flow.purpose as 'signup' | 'recovery', expiresAt: flow.expiresAt.toISOString() } : null;
      },
    },
    privacyImpact: createVisitorPrivacyImpactRepository(db),
    emailChange: {
      admit: (siteId, memberId, tokenHash, identity, targetEmail) => emailChange(siteId, identity, { memberId, tokenHash, targetEmail }),
      reconcile: (siteId, identity) => emailChange(siteId, identity),
    },
    management: {
      async list(siteId, input) {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100 || !Number.isSafeInteger(input.offset) || input.offset < 0) throw new Error('Invalid visitor pagination');
        const query = input.search?.trim();
        const escaped = query?.replace(/[\\%_]/g, value => '\\'+value);
        const scope = and(eq(siteVisitors.siteId, siteId), input.status ? eq(siteVisitors.status, input.status) : undefined, query ? or(ilike(siteVisitors.email, '%'+escaped+'%'), ilike(siteVisitors.displayName, '%'+escaped+'%')) : undefined);
        const rows = await database.select().from(siteVisitors).where(scope).orderBy(desc(siteVisitors.createdAt), desc(siteVisitors.id)).limit(input.limit+1).offset(input.offset);
        return { members: rows.slice(0,input.limit).map(toMember), limit: input.limit, offset: input.offset, hasMore: rows.length > input.limit };
      },
      async getById(siteId, memberId) { const [row] = await database.select().from(siteVisitors).where(and(eq(siteVisitors.siteId, siteId), eq(siteVisitors.id, memberId))); return row ? toMember(row) : null; },
      update: (siteId, memberId, input, context) => manage(siteId, memberId, 'update', input, context),
      revokeSessions: (siteId, memberId, context) => manage(siteId, memberId, 'revoke', {}, context),
      removeAccess: (siteId, memberId, context) => manage(siteId, memberId, 'remove', {}, context),
    },
    async updateProfile(siteId, memberId, tokenHash, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'displayName') || typeof input.displayName !== 'string'
        || /\p{Cc}/u.test(input.displayName) || input.displayName.trim().length > 120 || !/^[a-f0-9]{64}$/.test(tokenHash)) return null;
      return database.transaction(async tx => {
        const memberScope = and(eq(siteVisitors.siteId, siteId), eq(siteVisitors.id, memberId));
        // Match management/createSession ordering: member first, then its session.
        // Suspension/removal serializes here; logout/recovery revoke serializes on
        // the session row and cannot slip between the last check and this write.
        const [before] = await tx.select().from(siteVisitors).where(memberScope).for('update');
        if (!before || before.status !== 'active') return null;
        const sessionScope = and(eq(visitorSessions.siteId, siteId), eq(visitorSessions.memberId, memberId), eq(visitorSessions.tokenHash, tokenHash));
        const [session] = await tx.select({ tokenHash: visitorSessions.tokenHash }).from(visitorSessions).where(sessionScope).for('update');
        if (!session) return null;
        const [updated] = await tx.update(siteVisitors).set({ displayName: input.displayName.trim(), updatedAt: new Date() }).where(and(
          memberScope, eq(siteVisitors.status, 'active'),
          sql`EXISTS (SELECT 1 FROM ${visitorSessions} WHERE ${visitorSessions.siteId} = ${siteId} AND ${visitorSessions.memberId} = ${memberId} AND ${visitorSessions.tokenHash} = ${tokenHash} AND ${visitorSessions.expiresAt} > clock_timestamp())`,
          sql`EXISTS (SELECT 1 FROM ${sites} WHERE ${sites.id} = ${siteId} AND ${sites.isPublished} = true AND ${sites.settings}->'visitorAccounts'->>'enabled' = 'true')`,
          sql`NOT EXISTS (SELECT 1 FROM ${profiles} WHERE ${profiles.id}::text = ${siteVisitors.providerSubject} OR lower(trim(${profiles.email})) = ${siteVisitors.email})`,
        )).returning();
        return updated ? toMember(updated) : null;
      });
    },
    async isOperatorIdentity(identity) {
      const [row] = await database.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${identity.subject}`, sql`lower(trim(${profiles.email})) = ${identity.email.trim().toLowerCase()}`)).limit(1); return Boolean(row);
    },
    async enroll(siteId, identity, displayName) {
      return database.transaction(async tx => {
      await identityLock(tx, identity);
      await emailLock(tx, identity.email.trim().toLowerCase());
      const [operator] = await tx.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${identity.subject}`, sql`lower(trim(${profiles.email})) = ${identity.email.trim().toLowerCase()}`)).limit(1);
      if (operator) throw Object.assign(new Error('Visitor enrollment unavailable'), { code: 'VISITOR_OPERATOR_IDENTITY_DENIED' });
      // Conflict does not reactivate suspended members or merge a same-email different provider identity.
      await tx.insert(siteVisitors).values({ siteId, providerIssuer: identity.issuer, providerSubject: identity.subject, email: identity.email.trim().toLowerCase(), displayName }).onConflictDoNothing();
      const [row] = await tx.select().from(siteVisitors).where(byIdentity(siteId, identity));
      if (!row || row.email !== identity.email.trim().toLowerCase()) throw Object.assign(new Error('Visitor enrollment unavailable'), { code: 'VISITOR_ENROLLMENT_CONFLICT' });
      return toMember(row);
      });
    },
    async getByIdentity(siteId, identity) { const [row] = await database.select().from(siteVisitors).where(byIdentity(siteId, identity)); return row && row.email === identity.email.trim().toLowerCase() ? toMember(row) : null; },
    async getByEmail(siteId, email) { const [row] = await database.select().from(siteVisitors).where(and(eq(siteVisitors.siteId, siteId), eq(siteVisitors.email, email.trim().toLowerCase()))); return row ? toMember(row) : null; },
    async createSession(input) {
      return database.transaction(async tx => {
        const [member] = await tx.select().from(siteVisitors).where(and(eq(siteVisitors.siteId, input.siteId), eq(siteVisitors.id, input.memberId))).for('update');
        if (!member || member.status !== 'active' || input.expectedEmail !== undefined && emailValue(input.expectedEmail) !== member.email) return false;
        const [operator] = await tx.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${member.providerSubject}`, sql`lower(trim(${profiles.email})) = ${member.email}`)).limit(1);
        if (operator) return false;
        await tx.delete(visitorSessions).where(and(eq(visitorSessions.siteId, input.siteId), lt(visitorSessions.expiresAt, new Date())));
        const { expectedEmail, ...persisted } = input;
        await tx.insert(visitorSessions).values({ ...persisted, createdAt: new Date(input.createdAt), expiresAt: new Date(input.expiresAt) }); return true;
      });
    },
    async resolveSession(siteId, tokenHash, now) {
      const [row] = await database.select({ member: siteVisitors }).from(visitorSessions).innerJoin(siteVisitors, and(eq(siteVisitors.id, visitorSessions.memberId), eq(siteVisitors.siteId, visitorSessions.siteId))).where(and(eq(visitorSessions.siteId, siteId), eq(visitorSessions.tokenHash, tokenHash), gt(visitorSessions.expiresAt, new Date(now)), eq(siteVisitors.status, 'active'), sql`NOT EXISTS (SELECT 1 FROM ${profiles} WHERE ${profiles.id}::text = ${siteVisitors.providerSubject} OR lower(trim(${profiles.email})) = ${siteVisitors.email})`));
      return row ? toMember(row.member) : null;
    },
    async revokeSession(siteId, tokenHash) { await database.delete(visitorSessions).where(and(eq(visitorSessions.siteId, siteId), eq(visitorSessions.tokenHash, tokenHash))); },
    async revokeMemberSessions(siteId, memberId) { await database.delete(visitorSessions).where(and(eq(visitorSessions.siteId, siteId), eq(visitorSessions.memberId, memberId))); },
    async createRecoveryChallenge(input) {
      await database.transaction(async tx => {
        const [member] = await tx.select().from(siteVisitors).where(and(eq(siteVisitors.siteId, input.siteId), eq(siteVisitors.id, input.memberId))).for('update');
        if (!member || member.status !== 'active' || input.expectedEmail !== undefined && emailValue(input.expectedEmail) !== member.email) throw Object.assign(new Error('Current visitor membership required'), { code: 'VISITOR_MEMBERSHIP_REQUIRED' });
        await tx.delete(visitorRecoveryChallenges).where(and(eq(visitorRecoveryChallenges.siteId, input.siteId), lt(visitorRecoveryChallenges.expiresAt, new Date())));
        const { expectedEmail, ...persisted } = input;
        await tx.insert(visitorRecoveryChallenges).values({ ...persisted, expiresAt: new Date(input.expiresAt) });
      });
    },
    async consumeRecoveryChallenge(siteId, memberId, tokenHash, now) {
      const rows = await database.delete(visitorRecoveryChallenges).where(and(eq(visitorRecoveryChallenges.siteId, siteId), eq(visitorRecoveryChallenges.memberId, memberId), eq(visitorRecoveryChallenges.tokenHash, tokenHash), gt(visitorRecoveryChallenges.expiresAt, new Date(now)))).returning({ tokenHash: visitorRecoveryChallenges.tokenHash }); return rows.length === 1;
    },
    async revokeIdentitySessions(identity) {
      const members = database.select({ id: siteVisitors.id }).from(siteVisitors).where(and(eq(siteVisitors.providerIssuer, identity.issuer), eq(siteVisitors.providerSubject, identity.subject)));
      await database.transaction(async tx => {
        await tx.delete(visitorSessions).where(inArray(visitorSessions.memberId, members));
        await tx.delete(visitorRecoveryChallenges).where(inArray(visitorRecoveryChallenges.memberId, members));
        const emails = database.select({ email: siteVisitors.email }).from(siteVisitors).where(subjectScope(identity));
        await tx.delete(visitorPkceFlows).where(or(inArray(visitorPkceFlows.memberId, members), inArray(visitorPkceFlows.expectedEmail, emails)));
      });
    },
    async consumeRateLimit(siteId, keyHash, limit, windowSeconds) {
      await database.delete(visitorAuthRateLimits).where(and(eq(visitorAuthRateLimits.siteId, siteId), lt(visitorAuthRateLimits.resetAt, new Date(Date.now() - 86400000))));
      const [row] = await database.insert(visitorAuthRateLimits).values({ siteId, keyHash, count: 1, resetAt: new Date(Date.now() + windowSeconds * 1000) }).onConflictDoUpdate({ target: [visitorAuthRateLimits.siteId, visitorAuthRateLimits.keyHash], set: {
        count: sql`CASE WHEN ${visitorAuthRateLimits.resetAt} <= now() THEN 1 ELSE ${visitorAuthRateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${visitorAuthRateLimits.resetAt} <= now() THEN now() + (${windowSeconds} * interval '1 second') ELSE ${visitorAuthRateLimits.resetAt} END`,
      } }).returning({ count: visitorAuthRateLimits.count }); return row.count <= limit;
    },
  };
}

/** Recheck persisted member admission while serializing with suspension/deletion updates. Guest writes retain their existing path. */
export async function withActiveVisitorAdmission<T>(db: DatabaseInstance, siteId: string, memberId: string | null | undefined, action: (database: DatabaseInstance) => Promise<T>): Promise<T> {
  if (!memberId) return action(db);
  const database = db as NodePgDatabase<typeof schema>;
  return database.transaction(async tx => {
    const [member] = await tx.select().from(siteVisitors).where(and(eq(siteVisitors.siteId, siteId), eq(siteVisitors.id, memberId))).for('update');
    if (!member || member.status !== 'active') throw Object.assign(new Error('Current visitor membership required'), { code: 'VISITOR_MEMBERSHIP_REQUIRED' });
    const [operator] = await tx.select({ id: profiles.id }).from(profiles).where(or(sql`${profiles.id}::text = ${member.providerSubject}`, sql`lower(trim(${profiles.email})) = ${member.email}`)).limit(1);
    if (operator) throw Object.assign(new Error('Current visitor membership required'), { code: 'VISITOR_MEMBERSHIP_REQUIRED' });
    return action(tx as unknown as DatabaseInstance);
  });
}
