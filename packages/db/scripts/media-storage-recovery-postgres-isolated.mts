#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import { runMediaStorageMetadataRaceProof } from '../../../apps/public/scripts/media-storage-metadata-race-proof.mts';
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
import { runMediaStorageRecoveryProof } from '../../../apps/public/scripts/media-storage-recovery-smoke.mts';
import { loadMediaFixture } from '../../../apps/public/scripts/media-storage-recovery-fixture.mts';
import { createLocalAdapter } from '@backy/storage';
import * as inventoryImport from '../../../apps/public/src/lib/mediaInventory';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-media-recovery-postgres-');
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
  assert(/^\/tmp\/backy-media-recovery-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 5, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
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

 const client = connection('media-recovery-proof');
 const repositories = bundle(client);
 const team = (await repositories.teams.create({ name: 'Disposable media recovery team', slug: 'media-recovery-team', ownerId: null })).item;
 const site = (await repositories.sites.create({ teamId: team.id, name: 'Recovery A', slug: 'recovery-a', status: 'draft' })).item;
 const other = (await repositories.sites.create({ teamId: team.id, name: 'Recovery B', slug: 'recovery-b', status: 'draft' })).item;
 const checks = await runMediaStorageRecoveryProof(repositories, [site, other]);
 const races = await runMediaStorageMetadataRaceProof(repositories, bundle(connection('media-recovery-race-b')), site);
 const storageRoot = join(clusterRoot, 'private-fixture-storage');
 const adapter = createLocalAdapter({ provider: 'local', basePath: storageRoot, publicUrl: '/uploads' });
 const helpers = loadMediaFixture('../src/lib/mediaStorage.ts', {});
 const mocks = { '@/lib/backyStore': {}, '@/lib/mediaStorage': { ...helpers, resolveMediaStorageConfig: () => ({ config: { provider: 'local', basePath: storageRoot } }), getMediaStorageAdapter: async () => adapter }, '@/lib/mediaInventory': inventoryImport.default || inventoryImport };
 const recovery = loadMediaFixture('../src/lib/mediaStorageRecovery.ts', mocks);
 const path = `sites/${site.id}/journal-proof/database-restart.txt`, bytes = Buffer.from('Durable pending bytes across actual PostgreSQL restart');
 const job = await repositories.media.storageJobs.create({ siteId: site.id, mediaId: null, operation: 'upload', provider: 'local', storageIdentity: recovery.currentMediaStorageIdentity().identity, requestId: 'restart-fixture', files: [{ path, bytes: bytes.length, purpose: 'write' }] });
 await adapter.upload(bytes, { path });
 assert.equal(await recovery.mediaStorageUsageWithPending(site.id, repositories), bytes.length);
 await assert.rejects(client`DELETE FROM sites WHERE id = ${site.id}`, error => error.code === '23503');
 await client.end({ timeout: 2 });
 run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Restarting owned cluster after durable journal commit');
 run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '15', 'start'], 'Restarting owned cluster');
 const restartedClient = connection('media-recovery-after-restart'), restarted = bundle(restartedClient);
 assert.equal((await restarted.media.storageJobs.get(site.id, job.id)).state, 'pending');
 assert.equal(await restarted.media.storageJobs.get(other.id, job.id), null);
 assert.equal(await recovery.mediaStorageUsageWithPending(site.id, restarted), bytes.length);
 const result = await restarted.media.withStorageMutationLock(site.id, () => recovery.reconcileMediaStorageJob(site.id, job.id, restarted));
 assert.equal(result.status, 'settled'); assert.equal(result.deletedFiles, 1); assert.equal(await adapter.stat(path), null);
 assert.equal(await recovery.mediaStorageUsageWithPending(site.id, restarted), 0);
 const [rls] = await restartedClient`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.media_storage_jobs'::regclass`; assert.equal(rls.relrowsecurity, true);
 for (const role of ['anon', 'authenticated']) {
  await assert.rejects(restartedClient.begin(async tx => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx`SELECT * FROM media_storage_jobs`; }), error => error.code === '42501');
 }
 await restartedClient.begin(async tx => { await tx`SET LOCAL ROLE service_role`; assert.equal((await tx`SELECT count(*)::int AS total FROM media_storage_jobs`)[0].total, 1); });
 await restarted.media.storageJobs.deleteSettled(site.id); await restarted.sites.delete(site.id);
 console.log(`Media recovery isolated PostgreSQL PASS: ${checks} shared helper/operator/local-byte scenarios + ${races} actual-handler/independent-PG transform/ordinary-PATCH/binding/replacement-history/restore race checks plus committed journal across actual cluster restart, pending quota, site FK denial, other-site denial, guarded retry cleanup, RLS/anon/authenticated denial and explicit service-role access; ${migrations.length} actual migrations. No configured database/provider used.`);
} catch(error){console.error(error);process.exitCode=1;}
finally{await cleanup();console.log('Owned socket-only cluster stopped and removed; no configured database was used.');}
