import { X509Certificate } from 'node:crypto';
import type { PoolConfig } from 'pg';

/** An explicit CA must retain TLS and hostname verification without URL overrides. */
export function postgresSslConfiguration(connectionString: string, caPem?: string): Pick<PoolConfig, 'connectionString' | 'ssl'> {
    if (caPem === undefined) return { connectionString };
    const certificates = caPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    try {
        if (caPem.length > 65536 || !certificates?.length
            || caPem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) {
            throw new Error();
        }
        for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
        throw new Error('Database SSL CA must contain a valid bounded PEM certificate bundle.');
    }
    let url: URL;
    try { url = new URL(connectionString); }
    catch { throw new Error('Database SSL CA requires a valid PostgreSQL connection URL.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('Database SSL CA requires a PostgreSQL connection URL.');
    }
    if (['sslcert', 'sslkey', 'sslrootcert'].some(key => url.searchParams.has(key))) {
        throw new Error('Database SSL CA conflicts with existing URL certificate settings.');
    }
    if (url.searchParams.getAll('sslmode').some(mode => !['require', 'verify-ca', 'verify-full'].includes(mode))
        || url.searchParams.getAll('ssl').some(value => value !== 'true' && value !== '1')) {
        throw new Error('Database SSL CA requires a verified encrypted connection.');
    }
    // pg's URI parser otherwise overwrites an explicit ssl object. Other URI
    // parameters and configured client authentication remain untouched.
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    return { connectionString: url.toString(), ssl: { ca: caPem, rejectUnauthorized: true } };
}
