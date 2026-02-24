import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for migrations
 *
 * To run migrations:
 * - npx drizzle-kit generate  (generate SQL migrations)
 * - npx drizzle-kit migrate   (apply migrations)
 * - npx drizzle-kit studio    (open Drizzle Studio)
 */
export default {
    schema: './src/schema/index.ts',
    out: './drizzle',
    dialect: 'postgresql', // Change for other DBs
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgres://localhost:5432/backy',
    },
} satisfies Config;
