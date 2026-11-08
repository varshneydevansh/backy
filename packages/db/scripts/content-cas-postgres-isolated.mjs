#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import { verifyAdminContentSaveCas } from '../../../apps/public/scripts/admin-content-save-cas.mjs';
import { createBackyContentDocument, BackyContentConflictError } from '../../core/dist/index.mjs';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-content-cas-postgres-');
const data = join(clusterRoot, 'cluster'), socket = join(clusterRoot, 'socket'), log = join(clusterRoot, 'postgres.log');
const port = randomInt(20000, 60000), username = 'backy_fixture', clients = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
// Postgres.js also reads PG* defaults directly. Clear them inside this test process only.
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || ['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)) delete process.env[key];
let cleanupPromise;
function run(binary, args, label) {
 try { return execFileSync(join(binaryDirectory, binary), args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); }
 catch (error) { throw new Error(`${label}: ${String(error.stderr || error.message).trim().split('\n').slice(-3).join(' ')}`); }
}
function cleanup() {
 return cleanupPromise ||= (async () => {
  await Promise.allSettled(clients.map(client => client.end({ timeout: 2 })));
  // The only directory we may stop/remove was created by this invocation.
  assert(/^\/tmp\/backy-content-cas-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 1, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
 clients.push(client); return client;
};
const bundle = client => createDatabaseRepositories({ adapter: { type: 'postgres', db: drizzle(client, { schema }), isConnected: async () => true, close: async () => {} } });
try {
 run('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject'], 'Initializing owned temporary cluster');
 mkdirSync(socket, { mode: 0o700 });
 writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 20\n`);
 run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '15', 'start'], 'Starting owned socket-only cluster');
 const psql = ['-X', '--no-password', '-h', socket, '-p', String(port), '-U', username, '-d', 'postgres', '--set', 'ON_ERROR_STOP=1'];
 run('psql', [...psql, '-c', `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`], 'Bootstrapping isolated Supabase role/auth fixtures');
 const migrations = readdirSync(join(repositoryRoot, 'supabase/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
 for (const migration of migrations) run('psql', [...psql, '-f', join(repositoryRoot, 'supabase/migrations', migration)], `Applying actual ${migration}`);
 assert(migrations.includes('015_template_revision_history.sql'));
 assert(migrations.includes('016_explicit_operator_profile_provisioning.sql'));

 const owner = connection('backy-content-cas-lock-holder'), monitor = connection('backy-content-cas-monitor'), sqlA = connection('backy-content-cas-writer-a'), sqlB = connection('backy-content-cas-writer-b');
 await Promise.all([owner`SELECT 1`, monitor`SELECT 1`, sqlA`SELECT 1`, sqlB`SELECT 1`]);
 const [identity] = await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(identity.current_user, username); assert.equal(identity.current_database, 'postgres'); assert.equal(identity.listeners, ''); assert.equal(identity.directory, data);
 const a = bundle(sqlA), b = bundle(sqlB);
 let checks = 0;
 const team = (await a.teams.create({ name: 'Disposable CAS team', slug: 'cas-team', ownerId: null })).item;
 const site = (await a.sites.create({ teamId: team.id, name: 'Disposable CAS site', slug: 'cas-site', status: 'draft' })).item;
 const doc = kind => createBackyContentDocument({ id: 'fixture-doc', kind, title: 'CAS fixture', slug: 'cas-fixture', status: 'draft', elements: [{ id: 'rich', type: 'paragraph', props: { content: [{ type: 'interactive_component', componentKey: 'fixture.widget', version: '1.0.0', props: { nested: { b: 2, a: 1 } }, fallback: { text: 'Keep fallback' }, children: [{ text: '' }] }] }, children: [] }] });
 const change = (content, version) => { const copy = structuredClone(content); copy.elements[0].props.content[0].version = version; return copy; };
 async function waitForBlocked(name) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
   const [row] = await monitor`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = ${name} AND wait_event_type = 'Lock'`;
   if (row.count > 0) return;
   await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Expected guarded writer to wait for the actual database row lock');
 }
 for (const kind of ['page', 'post']) {
  const repo = kind === 'page' ? a.pages : a.posts, competing = kind === 'page' ? b.pages : b.posts;
  const table = kind === 'page' ? 'public.pages' : 'public.blog_posts';
  const item = (await repo.create({ siteId: site.id, title: 'CAS ' + kind, slug: 'cas-' + kind, content: doc(kind) })).item;
  const original = await repo.getById(site.id, item.id), next = change(original.content, '2.0.0');
  const input = { content: next, expectedContent: original.content, expectedUpdatedAt: original.updatedAt };
  // Hold the row, queue migration, commit an author change, then release. CAS must see the committed winner.
  let release, acquired;
  const locked = new Promise(resolve => { acquired = resolve; });
  const hold = owner.begin(async tx => {
   await tx.unsafe(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [item.id]); acquired();
   await new Promise(resolve => { release = resolve; });
   const authorContent = { contentDocument: change(original.content, 'author-new'), elements: change(original.content, 'author-new').elements };
   // Deliberately keep updated_at unchanged: content comparison must independently reject.
   await tx.unsafe(`UPDATE ${table} SET content = $1::jsonb WHERE id = $2`, [JSON.stringify(authorContent), item.id]);
  });
  await locked;
  const loser = repo.update(site.id, item.id, input).then(() => ({ ok: true }), error => ({ error }));
  await waitForBlocked('backy-content-cas-writer-a'); release(); await hold;
  const outcome = await loser; assert(outcome.error instanceof BackyContentConflictError);
  assert.equal((await repo.getById(site.id, item.id)).content.elements[0].props.content[0].version, 'author-new'); checks++;
  // Two simultaneous migrations based on one current snapshot: one winner, one conflict.
  const snapshot = await repo.getById(site.id, item.id);
  const pair = await Promise.allSettled([repo.update(site.id, item.id, { content: change(snapshot.content, 'winner-a'), expectedContent: snapshot.content, expectedUpdatedAt: snapshot.updatedAt }), competing.update(site.id, item.id, { content: change(snapshot.content, 'winner-b'), expectedContent: snapshot.content, expectedUpdatedAt: snapshot.updatedAt })]);
  assert.equal(pair.filter(result => result.status === 'fulfilled').length, 1); assert(pair.find(result => result.status === 'rejected').reason instanceof BackyContentConflictError); checks++;
  // Actual legacy storage wrapper + microsecond DB timestamp is compared in canonical semantics.
  await owner.unsafe(`UPDATE ${table} SET content = $1::jsonb, updated_at = '2026-10-04 00:00:00.123456+00' WHERE id = $2`, [JSON.stringify({ elements: doc(kind).elements, canvas: { width: 1100, height: 600 }, metadata: { retained: true } }), item.id]);
  const legacy = await repo.getById(site.id, item.id);
  const reordered = JSON.parse(JSON.stringify(legacy.content, (key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
  const saved = (await repo.update(site.id, item.id, { content: change(legacy.content, 'legacy-migrated'), expectedContent: reordered, expectedUpdatedAt: legacy.updatedAt })).item;
  assert.equal(saved.content.elements[0].props.content[0].version, 'legacy-migrated'); assert.deepEqual(saved.content.elements[0].props.content[0].fallback, { text: 'Keep fallback' }); checks++;
  await assert.rejects(repo.update(site.id, item.id, { content: next, expectedContent: legacy.content, expectedUpdatedAt: legacy.updatedAt }), BackyContentConflictError); checks++;
  await assert.rejects(repo.update(site.id, item.id, { content: next, expectedContent: saved.content }), BackyContentConflictError); checks++;
  await assert.rejects(repo.update(randomUUID(), item.id, { content: next, expectedContent: saved.content, expectedUpdatedAt: saved.updatedAt }), BackyContentConflictError); checks++;
  // Preserve existing native timestamp-only optimistic edits; guarded post metadata reads stay on the transaction connection.
  const native = (await repo.update(site.id, item.id, { meta: { nativeOptimisticEdit: true }, expectedUpdatedAt: saved.updatedAt })).item;
  assert.equal(native.meta.nativeOptimisticEdit, true); const { version: beforeVersion, ...beforeContent } = saved.content, { version: afterVersion, ...afterContent } = native.content; assert.deepEqual(afterContent, beforeContent); checks++;
  await assert.rejects(repo.update(site.id, item.id, { title: 'Stale native edit', expectedUpdatedAt: legacy.updatedAt }), BackyContentConflictError); checks++;
  // A timestamp-only metadata change is also a conflict even when content is identical.
  await owner.unsafe(`UPDATE ${table} SET updated_at = updated_at + interval '1 second' WHERE id = $1`, [item.id]);
  await assert.rejects(repo.update(site.id, item.id, { content: next, expectedContent: native.content, expectedUpdatedAt: native.updatedAt }), BackyContentConflictError); checks++;
 }
 await verifyAdminContentSaveCas({ repositories: a, competing: b, sql: owner, site, createDocument: doc });
 console.log(`Atomic content CAS PostgreSQL checks passed: ${checks}; actual production repositories, two independent SQL connections, queued row locks, same-timestamp edits, legacy wrappers and scoped conflicts.`);
} catch (error) {
 console.error(`Disposable PostgreSQL CAS proof failed: ${String(error.cause?.message || error.message).split('\n')[0]}`); process.exitCode = 1;
} finally { await cleanup(); console.log('Owned disposable PostgreSQL cluster stopped and removed. Existing database configuration was not used.'); }
