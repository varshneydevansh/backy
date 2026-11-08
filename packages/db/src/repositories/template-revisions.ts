import { createHash } from 'node:crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { changedTemplateRevisionSnapshots, serializeTemplateRevisionValue, type BackyTemplateRevision, type BackyTemplateRevisionRepository } from '@backy-cms/core';
import * as schema from '../schema';
import { sites, templateRevisions } from '../schema';
import { createDatabaseRepositories } from './factory';
import { withSiteMediaMutationTransaction } from './media-mutation-admission';
import { createSiteRepository } from './site-page-post';
import type { DatabaseAdapter, DatabaseInstance } from '../adapters';

const fingerprint = (value: unknown) => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
const conflict = () => Object.assign(new Error('The site design changed. Reload template history before restoring or saving.'), { code: 'TEMPLATE_HISTORY_CONFLICT' });
const toRevision = (row: typeof templateRevisions.$inferSelect): BackyTemplateRevision => ({
  schemaVersion: 'backy.template-revision.v1', id: row.id, siteId: row.siteId, templateId: row.templateId,
  fingerprint: row.fingerprint, snapshot: JSON.parse(JSON.stringify(row.snapshot)), source: row.source,
  operation: row.operation as BackyTemplateRevision['operation'], restoredFromRevisionId: row.restoredFromRevisionId,
  actorId: row.actorId, requestId: row.requestId, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
});

export function createTemplateRevisionRepository(db: DatabaseInstance, adapterType: DatabaseAdapter['type'] = 'postgres'): BackyTemplateRevisionRepository {
  // Backy's persisted schema is PostgreSQL; require its transaction/row-lock boundary for immutable history.
  const database = db as NodePgDatabase<typeof schema>;
  return {
    async withCompositionImportLock(siteId, operation) {
      return withSiteMediaMutationTransaction(db, adapterType, siteId, async transaction => {
        const tx = transaction as unknown as NodePgDatabase<typeof schema>;
        const [locked] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for('update');
        if (!locked) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
        return operation(createDatabaseRepositories({ adapter: { type: adapterType, db: tx as unknown as DatabaseInstance, isConnected: async () => true, close: async () => {} } }));
      }, { isolationLevel: 'serializable' });
    },
    async list({ siteId, templateId, limit = 25, offset = 0 }) {
      const where = and(eq(templateRevisions.siteId, siteId), templateId ? eq(templateRevisions.templateId, templateId) : undefined);
      const pageLimit = Math.max(1, Math.min(100, Math.floor(limit))), pageOffset = Math.max(0, Math.floor(offset));
      const [totals] = await database.select({ total: count() }).from(templateRevisions).where(where);
      const rows = await database.select().from(templateRevisions).where(where).orderBy(desc(templateRevisions.createdAt), desc(templateRevisions.id)).limit(pageLimit).offset(pageOffset);
      const total = Number(totals.total);
      return { items: rows.map(toRevision), pagination: { total, limit: pageLimit, offset: pageOffset, hasMore: pageOffset + rows.length < total } };
    },
    async get(siteId, templateId, revisionId) {
      const [row] = await database.select().from(templateRevisions).where(and(eq(templateRevisions.siteId, siteId), eq(templateRevisions.templateId, templateId), eq(templateRevisions.id, revisionId)));
      return row ? toRevision(row) : null;
    },
    async commitDesign(input) {
      return database.transaction(async (tx) => {
        const [locked] = await tx.select().from(sites).where(eq(sites.id, input.siteId)).for('update');
        if (!locked) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
        const siteRepository = createSiteRepository(tx as unknown as DatabaseInstance);
        const site = await siteRepository.getById(input.siteId);
        if (!site || fingerprint(site.settings.frontendDesign ?? null) !== input.expectedDesignFingerprint) throw conflict();
        const snapshots = changedTemplateRevisionSnapshots(site.settings.frontendDesign?.templates || [], input.frontendDesign.templates);
        for (const change of snapshots) {
          const hash = fingerprint(change.snapshot);
          if (change.operation === 'baseline') {
            const [existing] = await tx.select().from(templateRevisions).where(and(eq(templateRevisions.siteId, input.siteId), eq(templateRevisions.templateId, change.snapshot.id), eq(templateRevisions.fingerprint, hash))).limit(1);
            if (existing) continue;
          }
          await tx.insert(templateRevisions).values({ siteId: input.siteId, templateId: change.snapshot.id, fingerprint: hash, snapshot: change.snapshot,
            source: input.source, operation: change.operation === 'save' && input.restoredFromRevisionId ? 'restore' : change.operation,
            restoredFromRevisionId: change.operation === 'save' ? input.restoredFromRevisionId : null,
            actorId: input.actorId, requestId: input.requestId });
        }
        // Preserve settings refreshed under this transaction's lock; never overwrite newer unrelated configuration.
        await tx.update(sites).set({ settings: { ...site.settings, frontendDesign: input.frontendDesign }, updatedAt: new Date() }).where(eq(sites.id, input.siteId)).returning();
        const updated = await siteRepository.getById(input.siteId);
        if (!updated) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
        return updated;
      });
    },
  };
}
