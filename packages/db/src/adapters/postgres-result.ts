/** Native pg results and existing Postgres.js repository consumers share rows. */
export function postgresResultRows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
        return result.rows as T[];
    }
    throw new Error('PostgreSQL query did not return a rows result.');
}
