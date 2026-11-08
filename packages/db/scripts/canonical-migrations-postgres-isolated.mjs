#!/usr/bin/env node
// Own fresh socket-only cluster. Never opens a configured database or copies env files.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import postgres from 'postgres';
import { loadCanonicalMigrations, canonicalDirectory, runCanonicalMigrations, MIGRATION_LOCK, topLevelStatements, validateMigrationURL } from './canonical-migrations.mjs';

if (process.argv.length > 2) throw Error('This isolated test accepts no database target arguments.');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl', 'psql']) assert(existsSync(join(bin, name)));
// Keep Unix socket paths below macOS sockaddr_un's length limit.
const directory = mkdtempSync('/tmp/backy-canonical-migrations-');
const data = join(directory, 'cluster'), socket = join(directory, 'socket'), port = randomInt(20000, 60000), username = 'backy_fixture';
const environment = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', NODE_ENV: 'test' };
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || /^(?:BACKY_DATABASE_URL|DATABASE_URL|POSTGRES_)/.test(key)) delete process.env[key];
const clients = [], checks = []; let cleaned;
const execute = (name, args) => execFileSync(join(bin, name), args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
async function cleanup() {
  if (cleaned) return cleaned;
  return cleaned = (async () => {
    await Promise.allSettled(clients.map(client => client.end({ timeout: 2 })));
    if (existsSync(join(data, 'postmaster.pid'))) execute('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop']);
    assert(!existsSync(join(data, 'postmaster.pid'))); rmSync(directory, { recursive: true, force: true });
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connect = database => {
  const sql = postgres({ host: socket, port, username, database, max: 2, connect_timeout: 5, onnotice() {} }); clients.push(sql); return sql;
};
const bootstrap = async sql => sql.unsafe(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`, [], { simple: true });
const rejects = async (run, code) => assert.rejects(run, error => error.code === code, code);
async function check(name, run) { await run(); checks.push(name); }
const ledger = sql => sql`SELECT version,name,checksum,provenance,evidence,applied_at FROM backy_migrations.migrations ORDER BY version`;
const hasLedger = async sql => (await sql`SELECT to_regclass('backy_migrations.migrations') IS NOT NULL AS present`)[0].present;
try {
  execute('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject']);
  mkdirSync(socket, { mode: 0o700 });
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 20\n`);
  execute('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-w', '-t', '15', 'start']);
  const admin = connect('postgres');
  await admin.unsafe('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;', [], { simple: true });
  const database = async (name, auth = true) => { await admin.unsafe(`CREATE DATABASE ${name}`); const sql = connect(name); if (auth) await bootstrap(sql); return sql; };
  const sql = await database('runner_fresh');
  const canonical = loadCanonicalMigrations();
  await check('canonical001–027 ordered SHA256 source and top-level transaction guard', async () => {
    assert.equal(canonical.length, 27); assert.equal(canonical[22].name, '023_browser_role_table_privilege_hardening.sql'); assert.equal(canonical[23].name, '024_delivery_owner_investigations.sql'); assert.equal(canonical[24].name, '025_product_design_revisions.sql'); assert.equal(canonical[25].name, '026_form_design_revisions.sql'); assert.equal(canonical[26].name,'027_collection_design_revisions.sql');
    assert(canonical.every(migration => /^[a-f0-9]{64}$/.test(migration.checksum)));
    assert.deepEqual(topLevelStatements("-- COMMIT;\nDO $$ BEGIN RAISE NOTICE 'COMMIT;'; END $$; /* nested /* COMMIT */ comment */ SELECT 'ROLLBACK;';"), ["DO $$ BEGIN RAISE NOTICE 'COMMIT;'; END $$", "SELECT 'ROLLBACK;'"]);
    const source = join(directory, 'transaction-source'); mkdirSync(source); writeFileSync(join(source, '001_bad.sql'), 'SELECT 1; COMMIT;');
    assert.throws(() => loadCanonicalMigrations(source), error => error.code === 'MIGRATION_TRANSACTION_UNSUPPORTED');
  });
  await check('default connected plan is read-only with no ledger/schema creation', async () => {
    const plan = await runCanonicalMigrations(sql); assert.equal(plan.mode, 'plan'); assert.equal(plan.pending.length, canonical.length); assert.equal(plan.tracked, 0);
    assert.equal(await hasLedger(sql), false);
    assert.equal((await sql`SELECT to_regclass('public.sites') IS NULL AS absent`)[0].absent, true);
  });
  await check('explicit apply executes all actual canonical SQL and writes matching executed ledger', async () => {
    const result = await runCanonicalMigrations(sql, { apply: true }); assert.equal(result.applied.length, canonical.length);
    const rows = await ledger(sql); assert.equal(rows.length, canonical.length);
    for (const [index, row] of rows.entries()) assert.deepEqual({ version: row.version, name: row.name, checksum: row.checksum, provenance: row.provenance },
      { version: canonical[index].version, name: canonical[index].name, checksum: canonical[index].checksum, provenance: 'executed' });
    const [tables] = await sql`SELECT to_regclass('public.form_delivery_attempts') IS NOT NULL AS forms, to_regclass('public.comment_delivery_attempts') IS NOT NULL AS comments, to_regclass('public.site_visitors') IS NOT NULL AS visitors`;
    assert(Object.values(tables).every(Boolean));
    const [{ absent }] = await sql`SELECT NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created') AS absent`; assert(absent);
  });
  await check('reapply and subsequent plan are exact no-ops including ledger timestamps', async () => {
    const before = await ledger(sql); const result = await runCanonicalMigrations(sql, { apply: true }); assert.deepEqual(result.applied, []);
    assert.deepEqual((await runCanonicalMigrations(sql)).pending, []); assert.deepEqual(await ledger(sql), before);
  });
  await check('applied source checksum drift rejects plan and apply without ledger/schema mutation', async () => {
    const copy = join(directory, 'drift'); cpSync(canonicalDirectory, copy, { recursive: true });
    const first = join(copy, canonical[0].name); writeFileSync(first, readFileSync(first, 'utf8') + '\n-- Drift fixture\n');
    const migrations = loadCanonicalMigrations(copy), before = await ledger(sql);
    await rejects(() => runCanonicalMigrations(sql, { migrations }), 'MIGRATION_LEDGER_DRIFT');
    await rejects(() => runCanonicalMigrations(sql, { migrations, apply: true }), 'MIGRATION_LEDGER_DRIFT'); assert.deepEqual(await ledger(sql), before);
  });
  await check('failed later SQL rolls back its DDL and ledger; fixed missing migration applies once', async () => {
    const copy = join(directory, 'failure'); cpSync(canonicalDirectory, copy, { recursive: true });
    const next = join(copy, '028_failure_fixture.sql'); writeFileSync(next, 'CREATE TABLE public.runner_failure_probe(id integer); SELECT 1/0;');
    const before = await ledger(sql);
    await rejects(() => runCanonicalMigrations(sql, { migrations: loadCanonicalMigrations(copy), apply: true }), 'MIGRATION_FAILED');
    assert.deepEqual(await ledger(sql), before); assert.equal((await sql`SELECT to_regclass('public.runner_failure_probe') IS NULL AS absent`)[0].absent, true);
    writeFileSync(next, 'CREATE TABLE public.runner_failure_probe(id integer);');
    const migrations = loadCanonicalMigrations(copy);
    assert.deepEqual((await runCanonicalMigrations(sql, { migrations, apply: true })).applied, ['028_failure_fixture.sql']);
    assert.deepEqual((await runCanonicalMigrations(sql, { migrations, apply: true })).applied, []);
  });
  await check('failed first migration also rolls back initial ledger schema and all Backy objects', async () => {
    const firstFailure = await database('runner_first_failure');
    const copy = join(directory, 'first-failure'); cpSync(canonicalDirectory, copy, { recursive: true });
    const first = join(copy, canonical[0].name); writeFileSync(first, readFileSync(first, 'utf8') + '\nSELECT 1/0;');
    await rejects(() => runCanonicalMigrations(firstFailure, { migrations: loadCanonicalMigrations(copy), apply: true }), 'MIGRATION_FAILED');
    assert.equal(await hasLedger(firstFailure), false); assert.equal((await firstFailure`SELECT to_regclass('public.sites') IS NULL AS absent`)[0].absent, true);
    assert.equal((await firstFailure`SELECT to_regnamespace('backy_migrations') IS NULL AS absent`)[0].absent, true);
    assert.equal((await runCanonicalMigrations(firstFailure)).pending.length, canonical.length);
  });
  await check('ledger insertion failure rolls back otherwise successful migration DDL', async () => {
    const copy = join(directory, 'ledger-failure'); cpSync(canonicalDirectory, copy, { recursive: true });
    writeFileSync(join(copy, '028_failure_fixture.sql'), 'CREATE TABLE public.runner_failure_probe(id integer);');
    writeFileSync(join(copy, '029_ledger_failure_fixture.sql'), 'CREATE TABLE public.runner_ledger_failure_probe(id integer);');
    await sql.unsafe(`CREATE FUNCTION backy_migrations.fail_fixture_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=29 THEN RAISE EXCEPTION 'Owned ledger failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_ledger_failure BEFORE INSERT ON backy_migrations.migrations FOR EACH ROW EXECUTE FUNCTION backy_migrations.fail_fixture_ledger();`, [], { simple: true });
    const before = await ledger(sql);
    await rejects(() => runCanonicalMigrations(sql, { migrations: loadCanonicalMigrations(copy), apply: true }), 'MIGRATION_FAILED');
    assert.deepEqual(await ledger(sql), before); assert.equal((await sql`SELECT to_regclass('public.runner_ledger_failure_probe') IS NULL AS absent`)[0].absent, true);
    await sql.unsafe('DROP TRIGGER fixture_ledger_failure ON backy_migrations.migrations; DROP FUNCTION backy_migrations.fail_fixture_ledger();', [], { simple: true });
  });
  await check('untracked preexisting Backy table and enum refuse plan/apply rather than infer history', async () => {
    for (const [name, statement] of [['runner_existing_table', 'CREATE TABLE public.sites(id integer)'], ['runner_existing_enum', "CREATE TYPE public.user_role AS ENUM('custom')"]]) {
      const existing = await database(name); await existing.unsafe(statement);
      await rejects(() => runCanonicalMigrations(existing), 'MIGRATION_BASELINE_REQUIRED');
      await rejects(() => runCanonicalMigrations(existing, { apply: true }), 'MIGRATION_BASELINE_REQUIRED'); assert.equal(await hasLedger(existing), false);
      assert.equal((await existing`SELECT to_regclass('public.form_definitions') IS NULL AS absent`)[0].absent, true);
    }
  });
  await check('missing identity infrastructure fails before ledger creation; runner never bootstraps provider', async () => {
    const missing = await database('runner_no_auth', false);
    assert.equal((await runCanonicalMigrations(missing)).pending.length, canonical.length);
    await rejects(() => runCanonicalMigrations(missing, { apply: true }), 'MIGRATION_PREREQUISITES_REQUIRED'); assert.equal(await hasLedger(missing), false);
  });
  await check('competing session cannot plan or apply under held migration lock; lock is released on failure', async () => {
    const target = await database('runner_lock'); const holder = await target.reserve();
    await holder`SELECT pg_advisory_lock(${MIGRATION_LOCK[0]},${MIGRATION_LOCK[1]})`;
    try {
      const contender = connect('runner_lock');
      await rejects(() => runCanonicalMigrations(contender), 'MIGRATION_BUSY');
      await rejects(() => runCanonicalMigrations(contender, { apply: true }), 'MIGRATION_BUSY'); assert.equal(await hasLedger(contender), false);
    } finally { await holder`SELECT pg_advisory_unlock(${MIGRATION_LOCK[0]},${MIGRATION_LOCK[1]})`; holder.release(); }
    assert.equal((await runCanonicalMigrations(target)).pending.length, canonical.length);
  });
  await check('ledger has no browser role privileges and ordered history gaps fail closed', async () => {
    await assert.rejects(() => sql.begin(async transaction => { await transaction.unsafe('SET LOCAL ROLE anon'); await transaction.unsafe('SELECT * FROM backy_migrations.migrations'); }), error => error.code === '42501');
    const before = await ledger(sql); await sql`DELETE FROM backy_migrations.migrations WHERE version=2`;
    await rejects(() => runCanonicalMigrations(sql, { migrations: [...canonical, { ...canonical[23], version: 25, name: '028_failure_fixture.sql' }] }), 'MIGRATION_LEDGER_DRIFT');
    assert.equal((await ledger(sql)).length, before.length - 1);
  });
  await check('CLI offline plan never connects, explicit apply needs reviewed URL, unsupported flags fail before connection', async () => {
    const script = resolve(import.meta.dirname, 'canonical-migrations.mjs');
    const result = JSON.parse(execFileSync(process.execPath, [script], { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(result.connected, false); assert.equal(result.appliedStateKnown, false); assert.equal(result.migrations.length, canonical.length);
    for (const [args, code] of [[['--apply'], 'MIGRATION_CONNECTION_REQUIRED'], [['--apply', '--offline'], 'MIGRATION_ARGUMENT_INVALID'], [['--url=secret'], 'MIGRATION_ARGUMENT_INVALID']]) {
      let output; try { execFileSync(process.execPath, [script, ...args], { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); assert.fail('CLI should refuse'); }
      catch (error) { output = JSON.parse(error.stderr); assert.equal(error.status, 1); } assert.equal(output.code, code);
    }
    const offline = JSON.parse(execFileSync(process.execPath, [script, '--offline'], { env: { ...environment, BACKY_DATABASE_URL: 'postgres://unreachable.invalid/never' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(offline.connected, false);
    for (const url of ['postgres:///never', 'postgres://unreachable.invalid/']) {
      try { execFileSync(process.execPath, [script, '--apply'], { env: { ...environment, BACKY_DATABASE_URL: url }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); assert.fail('Implicit target should refuse'); }
      catch (error) { assert.equal(JSON.parse(error.stderr).code, 'MIGRATION_CONNECTION_INVALID'); }
    }
  });
  await check('known transaction-pooler and explicit pgbouncer admissions refuse before any connection', async () => {
    const script = resolve(import.meta.dirname, 'canonical-migrations.mjs');
    for (const url of ['postgres://synthetic:never-print@aws-0-fixture.pooler.supabase.com:6543/postgres',
      'postgres://synthetic@AWS-0-FIXTURE.POOLER.SUPABASE.COM.:6543/postgres',
      'postgres://unreachable.invalid/backy?pgbouncer=true', 'postgres://unreachable.invalid/backy?PgBouncer=1',
      'postgres://unreachable.invalid/backy?pgbouncer=%20true%20']) {
      assert.throws(() => validateMigrationURL(url), error => error.code === 'MIGRATION_TRANSACTION_POOLING_UNSUPPORTED');
      try { execFileSync(process.execPath, [script, '--apply'], { env: { ...environment, BACKY_DATABASE_URL: url }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); assert.fail('Pooler should refuse'); }
      catch (error) { assert.equal(JSON.parse(error.stderr).code, 'MIGRATION_TRANSACTION_POOLING_UNSUPPORTED'); assert(!error.stderr.includes('never-print')); assert(!error.stderr.includes('unreachable.invalid')); }
    }
    assert.equal(validateMigrationURL('postgres://session.fixture.invalid:5432/backy').port, '5432');
    assert.equal(validateMigrationURL('postgres://aws-0-fixture.pooler.supabase.com:5432/postgres').port, '5432');
    // Allowing an unknown URL is not proof of custom pooler session affinity.
  });
  await check('actual CLI connected default is read-only and root/workspace scripts use canonical runner', async () => {
    const target = await database('runner_cli');
    const script = resolve(import.meta.dirname, 'canonical-migrations.mjs');
    // Driver accepts a URL database plus explicit owned Unix-socket PG defaults.
    // These values are constructed here, never inherited from operator configuration.
    const plan = JSON.parse(execFileSync(process.execPath, [script], { env: { ...environment, BACKY_DATABASE_URL: 'postgres:///runner_cli', PGHOST: socket, PGPORT: String(port), PGUSER: username }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(plan.mode, 'plan'); assert.equal(plan.connected, true); assert.equal(plan.pending.length, canonical.length); assert.equal(await hasLedger(target), false);
    const repository = resolve(import.meta.dirname, '../../..');
    assert.equal(JSON.parse(readFileSync(join(repository, 'package.json'))).scripts['db:migrate'], 'node packages/db/scripts/canonical-migrations.mjs');
    assert.equal(JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'))).scripts.migrate, 'node scripts/canonical-migrations.mjs');
    const rootOutput = execFileSync('npm', ['run', 'db:migrate', '--', '--offline'], { cwd: repository, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(JSON.parse(rootOutput.trim().split('\n').at(-1)).connected, false);
  });
  await check('direct provider URL wins over pooled URLs while explicit overrides remain authoritative', async () => {
    const target = await database('runner_direct_selection');
    const script = resolve(import.meta.dirname, 'canonical-migrations.mjs');
    const directEnv = { ...environment, POSTGRES_URL_NON_POOLING: 'postgres:///runner_direct_selection',
      POSTGRES_URL: 'postgres://unreachable.invalid/backy?pgbouncer=true',
      POSTGRES_PRISMA_URL: 'postgres://unreachable.invalid/backy?pgbouncer=true',
      PGHOST: socket, PGPORT: String(port), PGUSER: username };
    const plan = JSON.parse(execFileSync(process.execPath, [script], { env: directEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(plan.connected, true); assert.equal(plan.pending.length, canonical.length); assert.equal(await hasLedger(target), false);
    for (const key of ['BACKY_DATABASE_URL', 'DATABASE_URL']) {
      try {
        execFileSync(process.execPath, [script], { env: { ...directEnv, [key]: directEnv.POSTGRES_URL }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        assert.fail('An explicit pooled override must refuse instead of silently choosing another target');
      } catch (error) { assert.equal(JSON.parse(error.stderr).code, 'MIGRATION_TRANSACTION_POOLING_UNSUPPORTED'); }
    }
    assert.equal(await hasLedger(target), false);
  });
  console.log(JSON.stringify({ ok: true, checks, migrations: canonical.length, boundary: 'Actual canonical SQL, real PostgreSQL transactions/locks/ledger and CLI admission on a newly owned socket-only cluster. No configured database, production credentials, providers or deployment.' }));
} finally { await cleanup(); }
assert(!existsSync(directory));
