/**
 * ==========================================================================
 * @backy/db - Main Entry Point
 * ==========================================================================
 *
 * Backy CMS database layer with Drizzle ORM.
 * Supports PostgreSQL, MySQL, and SQLite for maximum portability.
 *
 * @module @backy/db
 * @author Backy Team
 * @license MIT
 *
 * @example
 * ```ts
 * import { createDatabaseAdapter, schema } from '@backy/db';
 *
 * const db = await createDatabaseAdapter({
 *   type: 'postgres',
 *   url: process.env.DATABASE_URL,
 * });
 *
 * // Query sites
 * const sites = await db.db.select().from(schema.sites);
 * ```
 */
/// <reference path="./third-party-shims.d.ts" />

// Schema exports
export * from './schema';

// Adapter exports
export {
    createDatabaseAdapter,
    createPostgresAdapter,
    createMySQLAdapter,
    createSQLiteAdapter,
    getDatabase,
    closeDatabase,
    type DatabaseType,
    type DatabaseConfig,
    type DatabaseAdapter,
    type DatabaseInstance,
} from './adapters';

// Re-export useful Drizzle utilities
export { eq, and, or, desc, asc, sql, isNull, isNotNull } from 'drizzle-orm';
