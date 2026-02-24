declare module 'postgres' {
    const postgres: {
        default: (connectionString: string, options?: unknown) => unknown;
        (connectionString: string, options?: unknown): unknown;
    };

    export default postgres;
}

declare module 'mysql2/promise' {
    interface Pool {
        getConnection(): Promise<{
            release(): void;
        }>;
        end(): Promise<void>;
    }

    interface PoolConnection {
        release(): void;
    }

    export function createPool(
        config: string | Record<string, unknown>,
        options?: Record<string, unknown>
    ): Pool;

    const mysql2Promise: {
        createPool: typeof createPool;
    };

    export default mysql2Promise;
}

declare module 'better-sqlite3' {
    class Database {
        constructor(filename?: string, options?: unknown);
        prepare(sql: string): { get: () => unknown };
        close(): void;
    }

    export default Database;
}
