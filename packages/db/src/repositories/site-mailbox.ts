import { assertMailboxSendAdmission, BackyMailboxSendError, type BackyMailboxSendAttempt, type BackyMailboxSendRepository } from '@backy-cms/core';
import { and, count, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';
const attempts = schema.mailboxSendAttempts;
const unavailable = () => new BackyMailboxSendError('MAILBOX_SEND_JOURNAL_UNAVAILABLE', 503, 'Durable mailbox send admission is unavailable.');
const toAttempt = (row: typeof attempts.$inferSelect): BackyMailboxSendAttempt => ({ ...row, state: row.state as BackyMailboxSendAttempt['state'], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
export function createMailboxSendRepository(db: DatabaseInstance, adapterType: string): BackyMailboxSendRepository {
  const database = db as NodePgDatabase<typeof schema>, ensure = () => { if (adapterType !== 'postgres') throw unavailable(); };
  return {
    async admit(input) {
      ensure(); assertMailboxSendAdmission(input);
      const [inserted] = await database.insert(attempts).values(input).onConflictDoNothing({ target: [attempts.siteId, attempts.bindingId, attempts.idempotencyKey] }).returning();
      if (inserted) return { attempt: toAttempt(inserted), admitted: true };
      const [existing] = await database.select().from(attempts).where(and(eq(attempts.siteId, input.siteId), eq(attempts.bindingId, input.bindingId), eq(attempts.idempotencyKey, input.idempotencyKey)));
      if (!existing) throw unavailable();
      if (existing.fingerprint !== input.fingerprint) throw new BackyMailboxSendError('MAILBOX_SEND_IDEMPOTENCY_CONFLICT', 409, 'This send identity already belongs to a different message.');
      return { attempt: toAttempt(existing), admitted: false };
    },
    async settle(siteId, bindingId, id, input) {
      ensure(); if (!['accepted', 'rejected', 'uncertain'].includes(input.state)) throw unavailable();
      const [row] = await database.update(attempts).set({ state: input.state, statusCode: input.statusCode ?? null, updatedAt: new Date() }).where(and(eq(attempts.siteId, siteId), eq(attempts.bindingId, bindingId), eq(attempts.id, id), eq(attempts.state, 'pending'))).returning();
      if (!row) throw unavailable(); return toAttempt(row);
    },
    async list(input) {
      ensure(); const limit = Math.max(1, Math.min(100, Math.floor(input.limit))), offset = Math.max(0, Math.floor(input.offset));
      const where = and(eq(attempts.siteId, input.siteId), input.bindingId ? eq(attempts.bindingId, input.bindingId) : undefined);
      return database.transaction(async tx => { const [total] = await tx.select({ total: count() }).from(attempts).where(where); const rows = await tx.select().from(attempts).where(where).orderBy(desc(attempts.createdAt), desc(attempts.id)).limit(limit).offset(offset); return { items: rows.map(toAttempt), total: Number(total.total) }; }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
  };
}
