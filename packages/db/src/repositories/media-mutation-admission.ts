import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import { postgresResultRows } from '../adapters/postgres-result';

// Share the two-guard bound across storage and document/reference admissions.
// Existing storage callbacks may still use another pool connection; document
// callbacks receive this transaction and require no additional connection.
const activeGuards = new WeakMap<object, number>();
export async function withSiteMediaMutationTransaction<T>(
  db: DatabaseInstance,
  provider: string,
  siteId: string,
  operation: (transaction: DatabaseInstance) => Promise<T>,
  options?: { isolationLevel: 'serializable' },
): Promise<T> {
  if (provider !== 'postgres') throw Object.assign(new Error('Media mutation protection is unavailable.'), { code: 'MEDIA_STORAGE_LOCK_UNAVAILABLE' });
  const active = activeGuards.get(db) || 0;
  if (active >= 2) throw Object.assign(new Error('Media mutation admission is busy.'), { code: 'MEDIA_STORAGE_MUTATION_BUSY' });
  activeGuards.set(db, active + 1);
  try {
    return await (db as unknown as NodePgDatabase).transaction(async transaction => {
      const result = await transaction.execute(sql`select pg_try_advisory_xact_lock(hashtext('backy:site-media'), hashtext(${siteId})) as acquired`);
      if (!postgresResultRows<{ acquired: boolean }>(result)[0]?.acquired) throw Object.assign(new Error('Another media mutation is in progress for this site.'), { code: 'MEDIA_STORAGE_MUTATION_BUSY' });
      return operation(transaction as unknown as DatabaseInstance);
    }, options);
  } finally {
    const remaining = (activeGuards.get(db) || 1) - 1;
    if (remaining) activeGuards.set(db, remaining);
    else activeGuards.delete(db);
  }
}
