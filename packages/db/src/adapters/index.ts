/**
 * ==========================================================================
 * @backy/db - Database Adapters
 * ==========================================================================
 *
 * Abstract database adapter interface and implementations for PostgreSQL,
 * MySQL, and SQLite using Drizzle ORM.
 *
 * @module @backy/db/adapters
 * @author Backy Team
 * @license MIT
 */

/// <reference path="./third-party-shims.d.ts" />

import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { postgresSslConfiguration } from './postgres-ssl';

const importOptionalDatabaseProvider = async <TModule>(
    specifier: string
): Promise<TModule> => {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        value: string
    ) => Promise<TModule>;
    return dynamicImport(specifier);
};

// ==========================================================================
// TYPES
// ==========================================================================

/** Supported database types */
export type DatabaseType = 'postgres' | 'mysql' | 'sqlite';

/** Generic database instance type */
export type DatabaseInstance =
    | NodePgDatabase<typeof schema>
    | MySql2Database<typeof schema>
    | BetterSQLite3Database<typeof schema>;

/** Database connection configuration */
export interface DatabaseConfig {
    /** Database type */
    type: DatabaseType;

    /** Connection URL (for Postgres/MySQL) */
    url?: string;

    /** Server-only PostgreSQL CA PEM; TLS and hostname verification remain required. */
    sslCaPem?: string;

    /** File path (for SQLite) */
    path?: string;

    /** Database name (optional, for display) */
    name?: string;

    /** Enable query logging */
    logging?: boolean;
}

// ==========================================================================
// ADAPTERS
// ==========================================================================

/**
 * Database adapter interface
 *
 * All database operations go through this interface for portability.
 */
export interface DatabaseAdapter {
    /** Database type */
    readonly type: DatabaseType;

    /** Drizzle database instance */
    readonly db: DatabaseInstance;

    /** Check if database is connected */
    isConnected(): Promise<boolean>;

    /** Close database connection */
    close(): Promise<void>;
}

/**
 * Create a PostgreSQL database adapter
 *
 * @param config - Database configuration
 * @returns PostgreSQL adapter
 *
 * @example
 * ```ts
 * const adapter = await createPostgresAdapter({
 *   type: 'postgres',
 *   url: 'postgres://user:pass@localhost:5432/backy',
 * });
 * ```
 */
export async function createPostgresAdapter(
    config: DatabaseConfig
): Promise<DatabaseAdapter> {
    if (!config.url) {
        throw new Error('PostgreSQL requires a connection URL');
    }

    // Four existing media/backup admission leases can coexist; their callbacks
    // retain independent commits through the remaining connection. Queries are
    // sequential and unnamed, including on transaction-mode server poolers.
    const pool = new Pool({ ...postgresSslConfiguration(config.url, config.sslCaPem), max: 5, pipeline: false });
    // pg removes a failed idle client before emitting this notification. An
    // idle socket failure must not crash the process; active queries still reject.
    pool.on('error', () => {});
    const db = drizzle(pool, { schema, logger: config.logging });
    db.transaction = async (callback, transactionConfig) => {
        const client = await pool.connect();
        let discard = false;
        const onClientError = () => { discard = true; };
        client.on('error', onClientError);
        // Keep Drizzle's transaction/savepoint implementation, while owning the
        // checkout even when BEGIN fails before Drizzle enters its finally block.
        const transactionClient = new Proxy(client, {
            get(target, key, receiver) {
                if (key !== 'query') return Reflect.get(target, key, receiver);
                return (...args: unknown[]) => {
                    const text = typeof args[0] === 'string' ? args[0]
                        : (args[0] as { text?: string } | undefined)?.text;
                    const commit = typeof text === 'string' && /^\s*commit\s*;?\s*$/i.test(text);
                    if (commit && target.getTransactionStatus() === 'I') {
                        throw new Error('PostgreSQL transaction ended before commit confirmation.');
                    }
                    const result = Reflect.apply(target.query, target, args);
                    if (!commit && text?.trim().toLowerCase() !== 'rollback') return result;
                    return Promise.resolve(result).then(result => {
                        // COMMIT of an aborted transaction returns ROLLBACK
                        // without a server error. Never admit it as a successful save.
                        if (commit && result.command !== 'COMMIT') {
                            throw new Error('PostgreSQL transaction did not confirm COMMIT.');
                        }
                        return result;
                    }, error => {
                        if (!commit) discard = true;
                        throw error;
                    });
                };
            },
        });
        try {
            return await drizzle(transactionClient, { schema, logger: config.logging })
                .transaction(callback, transactionConfig);
        } finally {
            client.release(discard || client.getTransactionStatus() !== 'I');
            client.off('error', onClientError);
        }
    };

    return {
        type: 'postgres',
        db: db as DatabaseInstance,

        async isConnected(): Promise<boolean> {
            try {
                await pool.query('SELECT 1');
                return true;
            } catch {
                return false;
            }
        },

        async close(): Promise<void> {
            await pool.end();
        },
    };
}

/**
 * Create a MySQL database adapter
 *
 * @param config - Database configuration
 * @returns MySQL adapter
 */
export async function createMySQLAdapter(
    config: DatabaseConfig
): Promise<DatabaseAdapter> {
    if (!config.url) {
        throw new Error('MySQL requires a connection URL');
    }

    const { drizzle } = await importOptionalDatabaseProvider<
        typeof import('drizzle-orm/mysql2')
    >('drizzle-orm/mysql2');

    const mysqlModule = (await importOptionalDatabaseProvider<{
        createPool?: (
            config: string | Record<string, unknown>,
            options?: Record<string, unknown>
        ) => {
            getConnection: () => Promise<{ release: () => void }>;
            end: () => Promise<void>;
        };
        default?: {
            createPool?: (
                config: string | Record<string, unknown>,
                options?: Record<string, unknown>
            ) => {
                getConnection: () => Promise<{ release: () => void }>;
                end: () => Promise<void>;
            };
        };
    }>('mysql2/promise').catch((_error) => {
        throw new Error(
            'mysql2/promise package is not installed. Install "mysql2" to enable MySQL adapter functionality.'
        );
    }));

    const createPool = mysqlModule.createPool || mysqlModule.default?.createPool;
    if (!createPool) {
        throw new Error(
            'mysql2/promise package does not expose a createPool function. Install a compatible mysql2 version.'
        );
    }

    const pool = createPool(config.url);
    const db = drizzle(pool, { schema, mode: 'default' });

    return {
        type: 'mysql',
        db: db as DatabaseInstance,

        async isConnected(): Promise<boolean> {
            try {
                const conn = await pool.getConnection();
                conn.release();
                return true;
            } catch {
                return false;
            }
        },

        async close(): Promise<void> {
            await pool.end();
        },
    };
}

/**
 * Create a SQLite database adapter
 *
 * @param config - Database configuration
 * @returns SQLite adapter
 */
export async function createSQLiteAdapter(
    config: DatabaseConfig
): Promise<DatabaseAdapter> {
    const dbPath = config.path || ':memory:';

    const { drizzle } = await importOptionalDatabaseProvider<
        typeof import('drizzle-orm/better-sqlite3')
    >('drizzle-orm/better-sqlite3');
    const Database = (await importOptionalDatabaseProvider<{
        default: new (filename?: string, options?: unknown) => {
            prepare: (sql: string) => { get: () => unknown };
            close: () => void;
        };
    }>('better-sqlite3').catch((_error) => {
        throw new Error(
            'better-sqlite3 package is not installed. Install "better-sqlite3" to enable SQLite adapter functionality.'
        );
    })).default;

    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    return {
        type: 'sqlite',
        db: db as DatabaseInstance,

        async isConnected(): Promise<boolean> {
            try {
                sqlite.prepare('SELECT 1').get();
                return true;
            } catch {
                return false;
            }
        },

        async close(): Promise<void> {
            sqlite.close();
        },
    };
}

// ==========================================================================
// FACTORY
// ==========================================================================

/**
 * Create a database adapter based on configuration
 *
 * This is the main entry point for creating database connections.
 *
 * @param config - Database configuration
 * @returns Database adapter for the specified type
 *
 * @example
 * ```ts
 * // PostgreSQL
 * const db = await createDatabaseAdapter({
 *   type: 'postgres',
 *   url: process.env.DATABASE_URL,
 * });
 *
 * // SQLite (for development/testing)
 * const db = await createDatabaseAdapter({
 *   type: 'sqlite',
 *   path: './data.db',
 * });
 * ```
 */
export async function createDatabaseAdapter(
    config: DatabaseConfig
): Promise<DatabaseAdapter> {
    switch (config.type) {
        case 'postgres':
            return createPostgresAdapter(config);
        case 'mysql':
            return createMySQLAdapter(config);
        case 'sqlite':
            return createSQLiteAdapter(config);
        default:
            throw new Error(`Unsupported database type: ${config.type}`);
    }
}

// ==========================================================================
// SINGLETON (Optional - for apps that need a single instance)
// ========================================================================== 

let globalAdapter: DatabaseAdapter | null = null;

/**
 * Get or create the global database adapter
 *
 * Useful for applications that need a single database instance.
 */
export async function getDatabase(
    config?: DatabaseConfig
): Promise<DatabaseAdapter> {
    if (globalAdapter) {
        return globalAdapter;
    }

    if (!config) {
        throw new Error(
            'Database not initialized. Call getDatabase(config) with configuration first.'
        );
    }

    globalAdapter = await createDatabaseAdapter(config);
    return globalAdapter;
}

/**
 * Close the global database connection
 */
export async function closeDatabase(): Promise<void> {
    if (globalAdapter) {
        await globalAdapter.close();
        globalAdapter = null;
    }
}
