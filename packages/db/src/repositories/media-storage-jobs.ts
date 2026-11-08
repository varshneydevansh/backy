import { assertMediaStorageJobManifest, type BackyMediaStorageJob, type BackyMediaStorageJobRepository } from '@backy-cms/core';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';
import { mediaStorageJobs } from '../schema';

const unavailable = () => Object.assign(new Error('Durable media storage journaling requires the PostgreSQL adapter.'), { code: 'MEDIA_STORAGE_JOURNAL_UNAVAILABLE' });
function toJob(row: typeof mediaStorageJobs.$inferSelect): BackyMediaStorageJob {
  const job = { ...row, files: row.files, remainingPaths: row.remainingPaths, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } as BackyMediaStorageJob;
  assertMediaStorageJobManifest(job);
  if (!['pending','settled'].includes(job.state) || !Array.isArray(job.remainingPaths) || new Set(job.remainingPaths).size !== job.remainingPaths.length || job.remainingPaths.some(path => !job.files.some(file => file.path === path)) || (job.state === 'settled') !== (job.remainingPaths.length === 0)) throw Object.assign(new Error('The stored media journal is invalid.'), { code: 'MEDIA_STORAGE_JOURNAL_INVALID' });
  return job;
}
export function createMediaStorageJobRepository(db: DatabaseInstance, adapterType: string): BackyMediaStorageJobRepository {
  const database = db as NodePgDatabase<typeof schema>;
  const ensure = () => { if (adapterType !== 'postgres') throw unavailable(); };
  return {
    async create(input) {
      ensure(); assertMediaStorageJobManifest(input);
      const [row] = await database.insert(mediaStorageJobs).values({ ...input, files: input.files, remainingPaths: input.files.map(file => file.path) }).returning();
      if (!row) throw unavailable();
      return toJob(row);
    },
    async get(siteId, jobId) { ensure(); const [row] = await database.select().from(mediaStorageJobs).where(and(eq(mediaStorageJobs.siteId, siteId), eq(mediaStorageJobs.id, jobId))); return row ? toJob(row) : null; },
    async list({ siteId, pendingOnly, limit, offset }) {
      ensure(); const pageLimit = Math.max(1, Math.min(100, Math.floor(limit))), pageOffset = Math.max(0, Math.floor(offset));
      return database.transaction(async tx => {
        const where = and(eq(mediaStorageJobs.siteId, siteId), pendingOnly ? eq(mediaStorageJobs.state, 'pending') : undefined);
        const [totals] = await tx.select({ total: count() }).from(mediaStorageJobs).where(where);
        const rows = await tx.select().from(mediaStorageJobs).where(where).orderBy(asc(mediaStorageJobs.createdAt), asc(mediaStorageJobs.id)).limit(pageLimit).offset(pageOffset);
        const total = Number(totals.total);
        return { items: rows.map(toJob), pagination: { total, limit: pageLimit, offset: pageOffset, hasMore: pageOffset + rows.length < total } };
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    async recordRecovery(siteId, jobId, input) {
      ensure(); return database.transaction(async tx => {
        const [row] = await tx.select().from(mediaStorageJobs).where(and(eq(mediaStorageJobs.siteId, siteId), eq(mediaStorageJobs.id, jobId))).for('update');
        if (!row) throw Object.assign(new Error('Storage recovery job not found.'), { code: 'MEDIA_STORAGE_JOB_NOT_FOUND' });
        const before = toJob(row);
        if (!Array.isArray(input.remainingPaths) || new Set(input.remainingPaths).size !== input.remainingPaths.length || input.remainingPaths.some(path => !before.remainingPaths.includes(path))) throw Object.assign(new Error('Invalid server recovery outcome.'), { code: 'MEDIA_STORAGE_JOURNAL_INVALID' });
        const [updated] = await tx.update(mediaStorageJobs).set({ remainingPaths: input.remainingPaths, state: input.remainingPaths.length ? 'pending' : 'settled', lastErrorCode: input.lastErrorCode, ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}), attempts: sql`${mediaStorageJobs.attempts} + 1`, updatedAt: new Date() }).where(and(eq(mediaStorageJobs.siteId, siteId), eq(mediaStorageJobs.id, jobId))).returning();
        return toJob(updated);
      });
    },
    async deleteSettled(siteId) { ensure(); await database.delete(mediaStorageJobs).where(and(eq(mediaStorageJobs.siteId, siteId), eq(mediaStorageJobs.state, 'settled'))); },
  };
}
