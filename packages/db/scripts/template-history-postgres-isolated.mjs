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
import { serializeTemplateRevisionValue, unrelatedSiteSettingsPatch } from '../../core/dist/index.mjs';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-template-postgres-');
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
  assert(/^\/tmp\/backy-template-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const fingerprint = value => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
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

 const owner = connection('backy-history-lock-holder'), monitor = connection('backy-history-monitor'), sqlA = connection('backy-history-writer-a'), sqlB = connection('backy-history-writer-b');
 await Promise.all([owner`SELECT 1`, monitor`SELECT 1`, sqlA`SELECT 1`, sqlB`SELECT 1`]);
 const [identity] = await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(identity.current_user, username); assert.equal(identity.current_database, 'postgres'); assert.equal(identity.listeners, ''); assert.equal(identity.directory, data);
 const a = bundle(sqlA), b = bundle(sqlB);
 const providerId = randomUUID();
 await owner`INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES (${providerId}, 'provider-visitor@fixture.invalid', ${owner.json({ role: 'owner', status: 'active', full_name: 'Untrusted provider metadata' })})`;
 assert.equal((await owner`SELECT id FROM public.profiles WHERE id = ${providerId}`).length, 0, 'Provider signup never provisions an operator, even with role metadata');
 await owner.unsafe('CREATE TRIGGER fixture_legacy_profile_hook AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()');
 const legacyId = randomUUID();
 await owner`INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES (${legacyId}, 'legacy-hook-visitor@fixture.invalid', ${owner.json({ role: 'owner' })})`;
 assert.equal((await owner`SELECT id FROM public.profiles WHERE id = ${legacyId}`).length, 0, 'Legacy function references also cannot provision an operator');
 await owner.unsafe('DROP TRIGGER fixture_legacy_profile_hook ON auth.users');
 const operator = (await a.users.create({ email: 'explicit-operator@fixture.invalid', fullName: 'Explicit operator', role: 'viewer', status: 'invited' })).item;
 assert.equal(operator.role, 'viewer'); assert.equal(operator.status, 'invited');
 assert.equal((await owner`SELECT id FROM auth.users WHERE id = ${operator.id}`).length, 1);
 assert.equal((await owner`SELECT id FROM public.profiles WHERE id = ${operator.id}`).length, 1, 'Authorized repository provisioning remains functional without the auth trigger');
 const [team] = await owner`INSERT INTO public.teams(name, slug) VALUES ('Disposable history team', 'disposable-history') RETURNING id`;
 const initialDesign = { schemaVersion: 'backy.frontend-design.v1', status: 'captured', source: { type: 'manual' }, tokens: { colors: { primary: 'teal' } }, chrome: {}, editableMap: [], templates: [{ id: 'article', type: 'blogPost', name: 'Article', version: 1, extension: { preserve: true }, content: { elements: [{ id: 'copy', type: 'text', width: 640, height: 110, props: { content: 'Original' }, animation: { type: 'fadeIn' } }], customCSS: '.copy{color:teal}', assets: [{ mediaId: 'fixture-media' }], dataBindings: [{ targetPath: 'props.rows', source: { collectionId: 'fixture-collection' } }] } }] };
 const site = (await a.sites.create({ teamId: team.id, name: 'Disposable site', slug: 'disposable-history-site', settings: { frontendDesign: initialDesign, seo: { title: 'Initial title' }, fixtureProviderMetadata: { retain: true } }, status: 'draft' })).item;
 const state = () => a.sites.getById(site.id);
 const commit = (repositories, design, expected) => repositories.templateRevisions.commitDesign({ siteId: site.id, expectedDesignFingerprint: expected, frontendDesign: design, source: 'isolated-postgres-proof', actorId: 'fixture-author', requestId: 'fixture-request' });
 async function waitForBlocked(name) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
   const [row] = await monitor`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = ${name} AND wait_event_type = 'Lock'`;
   if (row.count > 0) return;
   await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error('Expected production repository writer to wait on the held site row lock');
 }
 const settled = action => Promise.resolve().then(action).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
 async function queued(first, second) {
  let one, two;
  await owner.begin(async transaction => {
   await transaction`SELECT id FROM public.sites WHERE id = ${site.id} FOR UPDATE`;
   one = settled(first); await waitForBlocked('backy-history-writer-a');
   two = settled(second); await waitForBlocked('backy-history-writer-b');
  });
  return Promise.all([one, two]);
 }
 let loaded = await state(), expected = fingerprint(loaded.settings.frontendDesign), changed = structuredClone(loaded.settings.frontendDesign); changed.templates[0].version = 2;
 const staleGeneric = unrelatedSiteSettingsPatch({ ...structuredClone(loaded.settings), seo: { ...loaded.settings.seo, title: 'Generic title' } });
 let results = await queued(() => commit(a, changed, expected), () => b.sites.update(site.id, { settings: staleGeneric }));
 assert(results.every(result => result.status === 'fulfilled'));
 loaded = await state(); assert.equal(loaded.settings.frontendDesign.templates[0].version, 2); assert.equal(loaded.settings.seo.title, 'Generic title'); assert.deepEqual(loaded.settings.fixtureProviderMetadata, { retain: true });
 const revisions = await a.templateRevisions.list({ siteId: site.id, templateId: 'article', limit: 100 }); assert.equal(revisions.items.length, 2);
 const baseline = revisions.items.find(revision => revision.snapshot.version === 1); assert(baseline); assert.deepEqual(baseline.snapshot.content.dataBindings, initialDesign.templates[0].content.dataBindings); assert.deepEqual(baseline.snapshot.extension, { preserve: true });
 assert.equal(baseline.fingerprint, fingerprint(baseline.snapshot), 'JSONB key reordering retains canonical integrity');
 assert(!JSON.stringify(revisions.items).includes('fixtureProviderMetadata'));
 expected = fingerprint(loaded.settings.frontendDesign); changed = structuredClone(loaded.settings.frontendDesign); changed.templates[0].version = 3;
 results = await queued(() => a.sites.update(site.id, { settings: { seo: { description: 'New description' } } }), () => commit(b, changed, expected));
 assert(results.every(result => result.status === 'fulfilled')); loaded = await state();
 assert.equal(loaded.settings.frontendDesign.templates[0].version, 3); assert.equal(loaded.settings.seo.title, 'Generic title'); assert.equal(loaded.settings.seo.description, 'New description');
 const winner = structuredClone(loaded.settings.frontendDesign), stale = structuredClone(loaded.settings.frontendDesign); winner.templates[0].version = 4; stale.templates[0].version = 5; expected = fingerprint(loaded.settings.frontendDesign);
 results = await queued(() => commit(a, winner, expected), () => commit(b, stale, expected));
 assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(results[1].reason.code, 'TEMPLATE_HISTORY_CONFLICT'); assert.equal((await state()).settings.frontendDesign.templates[0].version, 4);
 await assert.rejects(a.sites.update(site.id, { settings: { frontendDesign: initialDesign } }), error => error.code === 'FRONTEND_DESIGN_HISTORY_REQUIRED');

 const [table] = await owner`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.template_revisions'::regclass`; assert.equal(table.relrowsecurity, true);
 const policies = await owner`SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'template_revisions'`; assert.equal(policies.length, 0);
 for (const role of ['anon', 'authenticated']) {
  const [privilege] = await owner`SELECT has_table_privilege(${role}, 'public.template_revisions', 'SELECT') AS can_read, has_table_privilege(${role}, 'public.template_revisions', 'INSERT') AS can_write`; assert.equal(privilege.can_read, false); assert.equal(privilege.can_write, false);
  await assert.rejects(owner.begin(async transaction => { await transaction.unsafe(`SET LOCAL ROLE ${role}`); await transaction`SELECT * FROM public.template_revisions`; }), error => error.code === '42501');
  // Prove RLS independently of the revoked browser grants, only inside this disposable cluster.
  await owner.unsafe(`GRANT SELECT ON public.template_revisions TO ${role}`);
  await owner.begin(async transaction => { await transaction.unsafe(`SET LOCAL ROLE ${role}`); assert.equal((await transaction`SELECT * FROM public.template_revisions`).length, 0); });
  await owner.unsafe(`REVOKE ALL ON public.template_revisions FROM ${role}`);
 }
 await assert.rejects(owner`UPDATE public.template_revisions SET source = 'forbidden-change' WHERE id = ${baseline.id}`, error => error.code === 'P0001' && /immutable/.test(error.message));
 assert.equal((await a.templateRevisions.get(site.id, 'article', baseline.id)).source, baseline.source);
 const beforeFailure = await state(), invalid = structuredClone(beforeFailure.settings.frontendDesign); invalid.templates[0].version = 6;
 await owner.unsafe(`CREATE FUNCTION public.fixture_reject_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture snapshot failure'; END $$; CREATE TRIGGER fixture_reject_snapshot BEFORE INSERT ON public.template_revisions FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_snapshot();`);
 await assert.rejects(commit(a, invalid, fingerprint(beforeFailure.settings.frontendDesign)), error => error.cause?.code === 'P0001' && /fixture snapshot failure/.test(error.cause.message));
 assert.deepEqual((await state()).settings.frontendDesign, beforeFailure.settings.frontendDesign, 'Real PostgreSQL snapshot failure rolls back design mutation');
 await owner.unsafe('DROP TRIGGER fixture_reject_snapshot ON public.template_revisions; DROP FUNCTION public.fixture_reject_snapshot();');
 const countBeforeFailedSave = (await a.templateRevisions.list({ siteId: site.id, templateId: 'article' })).pagination.total;
 await owner.unsafe(`CREATE FUNCTION public.fixture_reject_design() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture design write failure'; END $$; CREATE TRIGGER fixture_reject_design BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_design();`);
 await assert.rejects(commit(a, invalid, fingerprint(beforeFailure.settings.frontendDesign)), error => error.cause?.code === 'P0001' && /fixture design write failure/.test(error.cause.message));
 assert.deepEqual((await state()).settings.frontendDesign, beforeFailure.settings.frontendDesign);
 assert.equal((await a.templateRevisions.list({ siteId: site.id, templateId: 'article' })).pagination.total, countBeforeFailedSave, 'Failed design writes roll back snapshots already appended within the real transaction');
 await owner.unsafe('DROP TRIGGER fixture_reject_design ON public.sites; DROP FUNCTION public.fixture_reject_design();');
 await owner`INSERT INTO public.template_revisions(site_id, template_id, fingerprint, snapshot, source, operation) SELECT ${site.id}, 'article', ${baseline.fingerprint}, ${owner.json(baseline.snapshot)}, 'fixture-history-page', 'save' FROM generate_series(1,205)`;
 const pages = await Promise.all([0, 100, 200].map(offset => a.templateRevisions.list({ siteId: site.id, templateId: 'article', limit: 100, offset })));
 assert(pages[0].pagination.total > 205); assert.equal(pages.reduce((total, page) => total + page.items.length, 0), pages[0].pagination.total);
 assert.equal(new Set(pages.flatMap(page => page.items.map(revision => revision.id))).size, pages[0].pagination.total); assert.equal(pages[2].pagination.hasMore, false);
 assert.equal(await a.templateRevisions.get(site.id, 'wrong-template', baseline.id), null);
 await a.sites.delete(site.id); const [remaining] = await owner`SELECT count(*)::int AS count FROM public.template_revisions WHERE site_id = ${site.id}`; assert.equal(remaining.count, 0);
 console.log(JSON.stringify({ ok: true, database: 'disposable PostgreSQL', actualMigrationsApplied: migrations.length, socketOnly: true, checks: ['provider signup cannot provision CMS profiles', 'legacy profile hooks remain harmless', 'explicit operator repository provisioning', 'real row-lock interleavings in both orders', 'stale competing template conflict', 'JSONB snapshot integrity and full metadata', 'browser grant denial and independent RLS denial', 'immutable update trigger', 'real failed-snapshot transaction rollback', '205+ SQL pagination and exact scoped lookup', 'site cascade cleanup'] }));
} catch (error) {
 console.error(`Disposable PostgreSQL proof failed: ${String(error.cause?.message || error.message).split('\n')[0]}`);
 process.exitCode = 1;
} finally {
 await cleanup();
 console.log('Owned disposable PostgreSQL cluster stopped and removed. Existing database configuration was not used.');
}
