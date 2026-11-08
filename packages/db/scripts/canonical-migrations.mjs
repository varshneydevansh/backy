#!/usr/bin/env node
// Canonical SQL only; no .env loading, credential flags, Drizzle generation or implicit apply.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

export const canonicalDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
export const MIGRATION_LOCK = [1111573337, 1296648018];
export class MigrationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new MigrationError(code, message); };

// Split only outside SQL strings/identifiers, dollar bodies and nested comments.
// This prevents a future top-level COMMIT from escaping the runner's transaction.
export function topLevelStatements(sql) {
  const statements = []; let statement = '', index = 0;
  while (index < sql.length) {
    if (sql.startsWith('--', index)) { const end = sql.indexOf('\n', index); index = end < 0 ? sql.length : end + 1; statement += ' '; continue; }
    if (sql.startsWith('/*', index)) {
      let depth = 1; index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith('/*', index)) { depth++; index += 2; }
        else if (sql.startsWith('*/', index)) { depth--; index += 2; }
        else index++;
      }
      if (depth) fail('MIGRATION_SQL_INVALID', 'Unterminated SQL comment.'); statement += ' '; continue;
    }
    const quote = sql[index];
    if (quote === "'" || quote === '"') {
      const start = index++; let closed = false;
      const escapedString = quote === "'" && /(?:^|\W)[eE]$/.test(sql.slice(0, start));
      while (index < sql.length) {
        if (escapedString && sql[index] === '\\') { index += 2; continue; }
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) { index += 2; continue; }
          index++; closed = true; break;
        }
        index++;
      }
      if (!closed) fail('MIGRATION_SQL_INVALID', 'Unterminated SQL string or identifier.');
      statement += sql.slice(start, index); continue;
    }
    const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (tag) {
      const end = sql.indexOf(tag, index + tag.length);
      if (end < 0) fail('MIGRATION_SQL_INVALID', 'Unterminated SQL dollar body.');
      statement += sql.slice(index, end + tag.length); index = end + tag.length; continue;
    }
    if (sql[index] === ';') { if (statement.trim()) statements.push(statement.trim()); statement = ''; index++; }
    else statement += sql[index++];
  }
  if (statement.trim()) statements.push(statement.trim()); return statements;
}
export function loadCanonicalMigrations(directory = canonicalDirectory) {
  const names = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  if (!names.length) fail('MIGRATION_SOURCE_INVALID', 'No canonical SQL migrations found.');
  const migrations = names.map((name, index) => {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match || Number(match[1]) !== index + 1) fail('MIGRATION_SOURCE_INVALID', 'Canonical SQL versions must be a contiguous sequence starting at001.');
    const bytes = readFileSync(resolve(directory, name)), sql = bytes.toString('utf8');
    if (!Buffer.from(sql).equals(bytes)) fail('MIGRATION_SOURCE_INVALID', 'Canonical SQL must use valid UTF-8.');
    const statements = topLevelStatements(sql);
    if (statements.some(value => /^(?:BEGIN|COMMIT|ROLLBACK|END|ABORT|SAVEPOINT|RELEASE|START\s+TRANSACTION|PREPARE\s+TRANSACTION|VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE)\b/i.test(value)
      || /^(?:CREATE|DROP)\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(value)))
      fail('MIGRATION_TRANSACTION_UNSUPPORTED', 'Canonical migrations must support a single runner-owned transaction per file.');
    return { version: index + 1, name, checksum: createHash('sha256').update(bytes).digest('hex'), sql, statements };
  });
  return migrations;
}
export const ledgerDDL = `CREATE SCHEMA backy_migrations;
REVOKE ALL ON SCHEMA backy_migrations FROM PUBLIC;
CREATE TABLE backy_migrations.migrations (
 version integer PRIMARY KEY CHECK(version > 0), name text NOT NULL UNIQUE,
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 provenance text NOT NULL CHECK(provenance IN ('executed','reconciled')),
 evidence text, applied_at timestamptz NOT NULL DEFAULT now(),
 CHECK(provenance <> 'reconciled' OR length(trim(evidence)) > 0)
);
ALTER TABLE backy_migrations.migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON backy_migrations.migrations FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON SCHEMA backy_migrations FROM anon;
  REVOKE ALL ON backy_migrations.migrations FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON SCHEMA backy_migrations FROM authenticated;
  REVOKE ALL ON backy_migrations.migrations FROM authenticated;
 END IF;
END $$;`;

export function validateMigrationURL(url) {
  let parsed;
  try { parsed = new URL(url); if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw Error(); }
  catch { fail('MIGRATION_CONNECTION_INVALID', 'Migration target must be a PostgreSQL URL.'); }
  const transactionFlag = [...parsed.searchParams].some(([key, value]) => key.toLowerCase() === 'pgbouncer' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()));
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const supabaseTransactionPooler = (hostname === 'pooler.supabase.com' || hostname.endsWith('.pooler.supabase.com')) && parsed.port === '6543';
  if (transactionFlag || supabaseTransactionPooler)
    fail('MIGRATION_TRANSACTION_POOLING_UNSUPPORTED', 'Migration session locks require direct PostgreSQL or verified session pooling. Known Supabase transaction pooler and explicit pgbouncer transaction flags are refused before connection; custom pooler mode must be independently verified.');
  return parsed;
}

function canonicalObjects(migrations) {
  const objects = new Map();
  for (const migration of migrations) for (const statement of migration.statements) {
    const match = /^CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|TYPE|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b/i.exec(statement);
    if (match) objects.set(match[2], match[1].toLowerCase());
  }
  return objects;
}
async function state(sql, migrations) {
  const [{ schema_present, ledger_present }] = await sql`SELECT to_regnamespace('backy_migrations') IS NOT NULL AS schema_present, to_regclass('backy_migrations.migrations') IS NOT NULL AS ledger_present`;
  if (schema_present && !ledger_present) fail('MIGRATION_LEDGER_INVALID', 'Migration schema exists without its ledger. Review independently before reconciliation.');
  let rows = [];
  if (ledger_present) {
    try { rows = await sql`SELECT version,name,checksum,provenance,evidence FROM backy_migrations.migrations ORDER BY version`; }
    catch { fail('MIGRATION_LEDGER_INVALID', 'Migration ledger cannot be read in its supported shape.'); }
  }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], migration = migrations[index];
    if (!migration || row.version !== migration.version || row.name !== migration.name || row.checksum !== migration.checksum
      || !['executed', 'reconciled'].includes(row.provenance) || (row.provenance === 'reconciled' && !row.evidence?.trim()))
      fail('MIGRATION_LEDGER_DRIFT', 'Migration identity/checksum/order or reviewed provenance differs. Refusing to replay or rewrite history.');
  }
  if (!rows.length) {
    const names = [...canonicalObjects(migrations).keys()];
    const existing = await sql`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${sql.array(names)})
      UNION SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=ANY(${sql.array(names)})
      UNION SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(${sql.array(names)})`;
    if (existing.length) fail('MIGRATION_BASELINE_REQUIRED', 'Preexisting Backy objects have no tracked history. Follow docs/database-migrations.md: independently reconcile schema/history and review an explicit baseline; never blindly replay SQL.');
  }
  return { ledgerPresent: ledger_present, rows, pending: migrations.slice(rows.length) };
}
async function transaction(sql, run, readOnly = false) {
  await sql.unsafe(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
  let result;
  try { result = await run(); }
  catch (error) { await sql.unsafe('ROLLBACK').catch(() => {}); throw error; }
  try { await sql.unsafe('COMMIT'); return result; }
  catch { fail('MIGRATION_COMMIT_UNCERTAIN', 'Commit acknowledgment unavailable. Outcome may be committed; close the connection and rerun the read-only plan before any retry. Do not assume rollback.'); }
}
export async function runCanonicalMigrations(client, { apply = false, migrations = loadCanonicalMigrations() } = {}) {
  const sql = await client.reserve(); let locked = false;
  try {
    const [result] = await sql`SELECT pg_try_advisory_lock(${MIGRATION_LOCK[0]},${MIGRATION_LOCK[1]}) AS acquired`;
    if (!result.acquired) fail('MIGRATION_BUSY', 'Another canonical migration session holds the database lock. Retry after it finishes.');
    locked = true;
    const initial = await transaction(sql, () => state(sql, migrations), true);
    const applied = [];
    if (apply && initial.pending.length) {
      const [prerequisites] = await sql`SELECT to_regclass('auth.users') IS NOT NULL AS users_present, to_regprocedure('auth.uid()') IS NOT NULL AS uid_present,
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') AS anon_present, EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') AS authenticated_present`;
      if (Object.values(prerequisites).some(value => value !== true)) fail('MIGRATION_PREREQUISITES_REQUIRED', 'Canonical SQL requires provisioned Supabase-compatible auth.users, auth.uid(), anon and authenticated roles. The runner does not manufacture identity infrastructure.');
      for (const migration of initial.pending) {
        try {
          await transaction(sql, async () => {
            if (!initial.ledgerPresent && !applied.length) await sql.unsafe(ledgerDDL, [], { simple: true });
            await sql.unsafe("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL search_path=public,pg_catalog", [], { simple: true });
            await sql.unsafe(migration.sql, [], { simple: true });
            await sql`INSERT INTO backy_migrations.migrations(version,name,checksum,provenance) VALUES(${migration.version},${migration.name},${migration.checksum},'executed')`;
          });
          applied.push(migration.name);
        } catch (error) {
          if (error instanceof MigrationError && error.code === 'MIGRATION_COMMIT_UNCERTAIN')
            fail(error.code, `Migration ${migration.name}: ${error.message}`);
          fail('MIGRATION_FAILED', `Migration ${migration.name} rolled back with its ledger entry. Previously committed migrations remain applied; rerun plan before retry. SQLSTATE ${/^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'unavailable'}.`);
        }
      }
    }
    return { mode: apply ? 'apply' : 'plan', connected: true, ledgerEvidence: 'identity-and-checksum-only',
      tracked: initial.rows.length, applied, pending: apply ? [] : initial.pending.map(({ name, checksum }) => ({ name, checksum })),
      transactionBoundary: 'one-file-and-ledger-entry; earlier-files-remain-committed', schemaCompatibilityCertified: false };
  } finally {
    if (locked) await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK[0]},${MIGRATION_LOCK[1]})`.catch(() => {});
    sql.release();
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const supported = new Set(['--plan', '--apply', '--offline', '--help']);
  if (args.some(value => !supported.has(value)) || new Set(args).size !== args.length || (args.includes('--apply') && (args.includes('--plan') || args.includes('--offline'))))
    fail('MIGRATION_ARGUMENT_INVALID', 'Use --plan (default), --offline, or explicit --apply. Credentials belong in server-side environment only.');
  if (args.includes('--help')) { console.log('Canonical Backy SQL: npm run db:migrate [-- --plan|--offline|--apply]. Default is read-only; no implicit apply or .env loading. See docs/database-migrations.md.'); return; }
  const migrations = loadCanonicalMigrations();
  const source = ['BACKY_DATABASE_URL', 'DATABASE_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'].find(key => env[key]?.trim());
  if (args.includes('--offline') || !source) {
    if (args.includes('--apply')) fail('MIGRATION_CONNECTION_REQUIRED', 'Explicit apply requires a PostgreSQL URL through a supported server-side environment variable. No localhost fallback is used.');
    console.log(JSON.stringify({ mode: 'offline-plan', connected: false, migrations: migrations.map(({ name, checksum }) => ({ name, checksum })), appliedStateKnown: false,
      next: 'Supply reviewed server-side database credentials to run the read-only connected plan; --apply alone authorizes writes.' })); return;
  }
  const url = env[source].trim();
  const parsed = validateMigrationURL(url);
  if ((!parsed.hostname && !env.PGHOST?.trim()) || (!parsed.pathname.slice(1) && !env.PGDATABASE?.trim()))
    fail('MIGRATION_CONNECTION_INVALID', 'An explicit database host and database name are required in the URL or reviewed PGHOST/PGDATABASE environment. No implicit localhost or username database target is allowed.');
  const client = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 10, onnotice() {}, connection: { application_name: 'backy-canonical-migrations' } });
  try { console.log(JSON.stringify(await runCanonicalMigrations(client, { apply: args.includes('--apply'), migrations }))); }
  catch (error) { if (error instanceof MigrationError) throw error; fail('MIGRATION_CONNECTION_FAILED', 'Database connection/admission failed. No credential, host, SQL detail or raw server error is printed.'); }
  finally { await client.end({ timeout: 2 }); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(JSON.stringify({ ok: false, code: error instanceof MigrationError ? error.code : 'MIGRATION_RUNNER_FAILED', message: error instanceof MigrationError ? error.message : 'Migration runner failed without exposing raw diagnostics.' })); process.exitCode = 1; });
}
