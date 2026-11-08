#!/usr/bin/env node
// Fresh owned socket-only cluster; never opens configured database/env files.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import postgres from 'postgres';
import { loadCanonicalMigrations, runCanonicalMigrations } from './canonical-migrations.mjs';

if (process.argv.length > 2) throw Error('Isolated fixture accepts no database target arguments.');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl']) assert(existsSync(join(bin, name)));
const directory = mkdtempSync('/tmp/backy-browser-table-privileges-');
const data = join(directory, 'cluster'), socket = join(directory, 'socket');
const port = randomInt(20000, 60000), username = 'backy_fixture';
const environment = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', NODE_ENV: 'test' };
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || /^(BACKY_DATABASE_URL|DATABASE_URL|POSTGRES_)/.test(key)) delete process.env[key];
const checks = [], clients = []; let cleaned, proof;
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
const connect = () => {
  const sql = postgres({ host: socket, port, username, database: 'postgres', max: 2, connect_timeout: 5, onnotice() {} }); clients.push(sql); return sql;
};
async function check(name, run) { await run(); checks.push(name); }
const canonical = loadCanonicalMigrations(), hardening = canonical.find(m => m.version === 23);
assert.equal(hardening?.name, '023_browser_role_table_privilege_hardening.sql');
const tables = [...new Set(canonical.filter(m => m.version <= 22).flatMap(m => m.statements.map(s => /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)/i.exec(s)?.[1]).filter(Boolean)))].sort();
assert.equal(tables.length, 40);
const ledger = sql => sql`SELECT version,name,checksum,provenance,evidence,applied_at FROM backy_migrations.migrations ORDER BY version`;
const actual = async (sql, names = tables) => sql`SELECT c.relname AS table_name,r.rolname AS role,
 has_table_privilege(r.oid,c.oid,'SELECT') AS sel,has_table_privilege(r.oid,c.oid,'INSERT') AS ins,has_table_privilege(r.oid,c.oid,'UPDATE') AS upd,has_table_privilege(r.oid,c.oid,'DELETE') AS del,
 has_table_privilege(r.oid,c.oid,'TRUNCATE') AS trunc,has_table_privilege(r.oid,c.oid,'REFERENCES') AS refs,has_table_privilege(r.oid,c.oid,'TRIGGER') AS trig
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relname=ANY(${names}) AND r.rolname IN ('anon','authenticated','service_role') ORDER BY c.relname,r.rolname`;
const structural = async sql => ({
  tables: await sql`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${tables}) ORDER BY c.relname`,
  columns: await sql`SELECT c.relname,a.attname,a.atttypid,a.attnotnull,a.attidentity,a.attgenerated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${tables}) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
  policies: await sql`SELECT c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid) AS qual,pg_get_expr(p.polwithcheck,p.polrelid) AS chk FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${tables}) ORDER BY c.relname,p.polname`,
  constraints: await sql`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${tables}) ORDER BY c.relname,k.conname`,
});
try {
  execute('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject']);
  mkdirSync(socket, { mode: 0o700 });
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses=''\nunix_socket_directories='${socket}'\nport=${port}\nmax_connections=10\n`);
  execute('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-w', '-t', '15', 'start']);
  const sql = connect(); const [{ version }] = await sql`SELECT current_setting('server_version_num')::int AS version`;
  const maintainSupported = version >= 170000;
  await sql.unsafe(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE other_acl_owner NOLOGIN;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES FOR ROLE other_acl_owner IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
 CREATE TABLE public.provider_unrelated_probe(id int PRIMARY KEY);`, [], { simple: true });
  await runCanonicalMigrations(sql, { apply: true, migrations: canonical.filter(m => m.version <= 22) });
  // Model existing provider grants, including accidental grants on private tables.
  for (const table of tables) await sql.unsafe(`GRANT ALL ON TABLE public."${table}" TO anon,authenticated,service_role`);
  const before = await actual(sql), structureBefore = await structural(sql), ledgerBefore = await ledger(sql);
  await check('real provider-style effective dangerous grants reproduced on all40 canonical tables', async () => {
    assert.equal(before.length, 120); assert(before.every(r => r.sel && r.ins && r.upd && r.del && r.trunc && r.refs && r.trig));
    if (maintainSupported) {
      const rows = await sql`SELECT has_table_privilege(r.oid,c.oid,'MAINTAIN') AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relname=ANY(${tables}) AND r.rolname IN ('anon','authenticated','service_role')`;
      assert.equal(rows.length, 120); assert(rows.every(r => r.allowed));
    }
  });
  await check('surviving PUBLIC privilege refuses023 and atomically rolls back prior revocations and ledger', async () => {
    await sql.unsafe('GRANT TRUNCATE ON public.admin_user_credentials TO PUBLIC');
    await assert.rejects(() => runCanonicalMigrations(sql, { apply: true }), e => e.code === 'MIGRATION_FAILED');
    assert.deepEqual(await ledger(sql), ledgerBefore); assert.deepEqual(await actual(sql), before);
    await sql.unsafe('REVOKE TRUNCATE ON public.admin_user_credentials FROM PUBLIC');
  });
  await check('inherited dangerous privilege refuses023 and rolls back without changing unrelated provider role', async () => {
    await sql.unsafe('GRANT TRIGGER ON public.admin_user_credentials TO other_acl_owner; GRANT other_acl_owner TO anon');
    await assert.rejects(() => runCanonicalMigrations(sql, { apply: true }), e => e.code === 'MIGRATION_FAILED');
    assert.deepEqual(await ledger(sql), ledgerBefore); assert.deepEqual(await actual(sql), before);
    assert((await sql`SELECT has_table_privilege('other_acl_owner','public.admin_user_credentials','TRIGGER') AS allowed`)[0].allowed);
    await sql.unsafe('REVOKE other_acl_owner FROM anon; REVOKE TRIGGER ON public.admin_user_credentials FROM other_acl_owner');
  });
  await check('current-owner global dangerous defaults refuse023 without widening unrelated schema repair', async () => {
    await sql.unsafe('ALTER DEFAULT PRIVILEGES GRANT TRUNCATE ON TABLES TO anon');
    await assert.rejects(() => runCanonicalMigrations(sql, { apply: true }), e => e.code === 'MIGRATION_FAILED');
    assert.deepEqual(await ledger(sql), ledgerBefore); assert.deepEqual(await actual(sql), before);
    await sql.unsafe('ALTER DEFAULT PRIVILEGES REVOKE TRUNCATE ON TABLES FROM anon');
  });
  await check('actual023 applies once; all40 browser dangerous privileges denied and backend preserved', async () => {
    assert.deepEqual((await runCanonicalMigrations(sql, { apply: true })).applied, [hardening.name]);
    const after = await actual(sql);
    for (const row of after) {
      assert(row.sel && row.ins && row.upd && row.del, `${row.table_name}/${row.role} CRUD changed`);
      assert.equal(row.trunc, row.role === 'service_role'); assert.equal(row.refs, row.role === 'service_role'); assert.equal(row.trig, row.role === 'service_role');
    }
    if (maintainSupported) {
      const rows = await sql`SELECT r.rolname AS role,has_table_privilege(r.oid,c.oid,'MAINTAIN') AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relname=ANY(${tables}) AND r.rolname IN ('anon','authenticated','service_role')`;
      assert.equal(rows.length, 120); assert(rows.every(r => r.allowed === (r.role === 'service_role')));
    }
    assert.deepEqual(await structural(sql), structureBefore);
  });
  await check('browser TRUNCATE and TRIGGER fail on private table; backend actual CRUD persists and reopens', async () => {
    await sql.begin(async tx => {
      await tx.unsafe('SET LOCAL ROLE service_role');
      await tx`INSERT INTO public.platform_settings(id,delivery_mode,integrations) VALUES('fixture','database',${tx.json({ zero: 0, flag: false, nullable: null })})`;
      await tx`UPDATE public.platform_settings SET integrations=${tx.json({ zero: 0, flag: false, nullable: null, changed: true })} WHERE id='fixture'`;
      assert.deepEqual((await tx`SELECT integrations FROM public.platform_settings WHERE id='fixture'`)[0].integrations, { zero: 0, flag: false, nullable: null, changed: true });
    });
    for (const role of ['anon', 'authenticated']) {
      for (const statement of ['TRUNCATE public.platform_settings', 'CREATE TRIGGER browser_probe BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()']) {
        await assert.rejects(() => sql.begin(async tx => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx.unsafe(statement); }), e => e.code === '42501');
      }
    }
    assert.equal((await sql`SELECT count(*)::int AS n FROM public.platform_settings WHERE id='fixture'`)[0].n, 1);
    const reopened = connect(); assert((await reopened`SELECT integrations->>'changed' AS value FROM public.platform_settings WHERE id='fixture'`)[0].value === 'true');
    await reopened.begin(async tx => { await tx.unsafe('SET LOCAL ROLE service_role'); await tx`DELETE FROM public.platform_settings WHERE id='fixture'`; });
  });
  await check('browser REFERENCES denied independently of schemaCREATE privileges', async () => {
    await sql.unsafe('CREATE SCHEMA fixture_access; GRANT USAGE,CREATE ON SCHEMA fixture_access TO anon,authenticated');
    for (const role of ['anon', 'authenticated']) await assert.rejects(() => sql.begin(async tx => {
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      await tx.unsafe('CREATE TABLE fixture_access.browser_reference(id text REFERENCES public.platform_settings(id))');
    }), e => e.code === '42501');
  });
  await check('future current-owner public defaults hardened; CRUD/backend grants retained; other owners/provider objects unchanged', async () => {
    await sql.unsafe('CREATE TABLE public.runner_future_probe(id int);');
    // Create with the other owner's actual default ACL, rather than transfer ACL.
    await sql.unsafe('GRANT USAGE,CREATE ON SCHEMA public TO other_acl_owner');
    await sql.begin(async tx => { await tx.unsafe('SET LOCAL ROLE other_acl_owner'); await tx.unsafe('CREATE TABLE public.other_owner_actual_defaults_probe(id int)'); });
    const future = await actual(sql, ['runner_future_probe', 'provider_unrelated_probe', 'other_owner_actual_defaults_probe']);
    for (const row of future) {
      if (row.table_name === 'other_owner_actual_defaults_probe' && row.role === 'service_role') {
        assert(!row.sel && !row.ins && !row.upd && !row.del && !row.trunc && !row.refs && !row.trig);
        continue;
      }
      assert(row.sel && row.ins && row.upd && row.del);
      if (row.table_name === 'runner_future_probe') assert.equal(row.trunc || row.refs || row.trig, row.role === 'service_role');
      else if (row.role !== 'service_role' || row.table_name === 'provider_unrelated_probe') assert(row.trunc && row.refs && row.trig);
    }
    if (maintainSupported) {
      const rows = await sql`SELECT r.rolname AS role,has_table_privilege(r.oid,'public.runner_future_probe','MAINTAIN') AS allowed FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')`;
      assert(rows.every(r => r.allowed === (r.role === 'service_role')));
    }
  });
  await check('reapply/plan no-op preserves ledger and actual re-execution SQL is idempotent', async () => {
    const beforeLedger = await ledger(sql);
    assert.deepEqual((await runCanonicalMigrations(sql, { apply: true })).applied, []);
    assert.deepEqual((await runCanonicalMigrations(sql)).pending, []);
    assert.deepEqual(await ledger(sql), beforeLedger);
    await sql.begin(async tx => { for (const statement of hardening.statements) await tx.unsafe(statement); });
    assert.deepEqual(await ledger(sql), beforeLedger);
  });
  proof = { ok: true, postgresMajor: Math.floor(version / 10000), canonicalTableCount: 40, browserRoleTablePairs: 80, maintainSupported, maintainApplyVerified: maintainSupported, checks, cleanup: 'Owned cluster stopped and removed; no configured DB used', unresolved: ['Other owners future default ACLs deliberately unchanged', 'No live migration apply or browser/provider SQL exposure proof'] };
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify({ ok: false, checks, code: error.code || 'ASSERTION_FAILED', message: error.message }));
} finally { await cleanup(); }
if (proof) {
  const path = process.env.BACKY_MIGRATION_PRIVILEGES_PROOF_PATH;
  if (path) writeFileSync(path, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(proof, null, 2));
}
