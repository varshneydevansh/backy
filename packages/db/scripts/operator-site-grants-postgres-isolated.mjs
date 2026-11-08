#!/usr/bin/env node
// Own socket-only PostgreSQL cluster; configured database URLs are never read.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../dist/schema/index.js';
import { createSettingsRepository } from '../dist/repositories/index.js';

if (process.argv.length > 2) throw new Error('No database target arguments allowed.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), binaries = '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql']) assert(existsSync(join(binaries, binary)), `Missing local PostgreSQL binary: ${binary}`);
const scratch = mkdtempSync('/tmp/backy-operator-grants-postgres-'), data = join(scratch, 'cluster'), socket = join(scratch, 'socket');
const port = randomInt(20000, 60000), user = 'backy_operator_grant_fixture';
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || ['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)) delete process.env[key];
const run = (binary, args) => execFileSync(join(binaries, binary), args, { env: environment, timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const clients = [];
const connection = name => { const client = postgres({ host: socket, port, database: 'postgres', username: user, max: 1, connection: { application_name: name } }); clients.push(client); return client; };
const repository = client => createSettingsRepository(drizzle(client, { schema }));
let cleanupPromise;
const cleanup = () => cleanupPromise ||= (async () => {
  await Promise.allSettled(clients.map(client => client.end({ timeout: 3 })));
  assert(/^\/tmp\/backy-operator-grants-postgres-[A-Za-z0-9]+$/.test(scratch));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop']);
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; retain directory.');
  rmSync(scratch, { recursive: true, force: true });
})();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
let checks = 0;
try {
  run('initdb', ['-D', data, '--username', user, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject']);
  mkdirSync(socket, { mode: 0o700 });
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 12\n`);
  run('pg_ctl', ['-D', data, '-l', join(scratch, 'log'), '-w', '-t', '15', 'start']);
  // Apply the actual schema declaration, not a fixture approximation. This
  // repository has no profile/site foreign keys and needs no provider identities.
  const migration = readFileSync(join(root, 'supabase/migrations/003_schema_parity_and_rls_hardening.sql'), 'utf8');
  const declaration = migration.match(/CREATE TABLE IF NOT EXISTS public\.platform_settings \([\s\S]*?\n\);/)?.[0];
  assert(declaration, 'Actual platform_settings migration declaration missing.');
  run('psql', ['-X', '--no-password', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '--set', 'ON_ERROR_STOP=1', '-c', declaration]);
  const lock = connection('operator-grant-lock-holder'), monitor = connection('operator-grant-monitor'), sqlA = connection('operator-grant-writer-a'), sqlB = connection('operator-grant-writer-b');
  const a = repository(sqlA), b = repository(sqlB);
  const [identity] = await lock`SELECT current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
  assert.equal(identity.listeners, ''); assert.equal(identity.directory, data); checks += 2;
  await Promise.all([a.get(), b.get()]);
  assert.equal((await lock`SELECT count(*)::int AS count FROM platform_settings`)[0].count, 1); checks++;
  const initialAuth = { requireTwoFactor: true, apiKeyServiceKeys: [{ id: 'synthetic-service', keyHash: 'synthetic-hash' }], adminSessions: [{ tokenHash: 'synthetic-session-hash' }], userPermissionOverrides: [{ userId: 'retained-user', permissionKey: 'pages.edit', value: 'deny' }] };
  await a.update({ auth: initialAuth, storage: { untouched: 'storage' }, integrations: { untouched: 'integration' } });
  const makeRecord = (userId, revision, permission = 'pages.view') => ({ userId, scope: { version: 1, revision, mode: 'selected-sites', grants: [{ siteId: 'site-fixture', permissions: [permission] }], expiresAt: null }, updatedAt: new Date().toISOString(), updatedById: 'fixture-owner' });
  const recordsFor = (auth, userId) => (auth.userSiteGrants || []).filter(record => record.userId === userId);
  await a.commitOperatorSiteGrant({ userId: 'operator-a', expectedRecords: [], record: makeRecord('operator-a', 1) });
  await a.commitOperatorSiteGrant({ userId: 'operator-b', expectedRecords: [], record: makeRecord('operator-b', 1) });
  const base = await a.get(), expected = recordsFor(base.auth, 'operator-a');
  async function blocked(name) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [result] = await monitor`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = ${name} AND wait_event_type = 'Lock'`;
      if (result.count > 0) return;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error(`${name} did not wait for the settings row lock`);
  }
  let first, second;
  await lock.begin(async tx => {
    const [current] = await tx`SELECT auth FROM platform_settings WHERE id = 'default' FOR UPDATE`;
    first = a.commitOperatorSiteGrant({ userId: 'operator-a', expectedRecords: expected, record: makeRecord('operator-a', 2, 'pages.edit') }).then(value => ({ value }), error => ({ error }));
    await blocked('operator-grant-writer-a');
    second = b.commitOperatorSiteGrant({ userId: 'operator-a', expectedRecords: expected, record: makeRecord('operator-a', 2, 'pages.delete') }).then(value => ({ value }), error => ({ error }));
    await blocked('operator-grant-writer-b');
    // Auth changes committed while both owner requests await the lock must survive.
    await tx`UPDATE platform_settings SET auth = ${tx.json({ ...current.auth, retainedDuringWait: 'committed', apiKeyServiceKeys: [{ id: 'synthetic-service', keyHash: 'newer-synthetic-hash' }] })} WHERE id = 'default'`;
  });
  const outcomes = await Promise.all([first, second]);
  assert(outcomes[0].value); assert.equal(outcomes[1].error?.code, 'OPERATOR_SITE_SCOPE_CONFLICT'); checks += 2;
  const winner = await a.get();
  assert.equal(recordsFor(winner.auth, 'operator-a')[0].scope.revision, 2);
  assert.deepEqual(recordsFor(winner.auth, 'operator-a')[0].scope.grants[0].permissions, ['pages.edit']);
  assert.equal(recordsFor(winner.auth, 'operator-b')[0].scope.revision, 1);
  assert.equal(winner.auth.retainedDuringWait, 'committed');
  assert.equal(winner.auth.apiKeyServiceKeys[0].keyHash, 'newer-synthetic-hash');
  assert.deepEqual(winner.auth.adminSessions, initialAuth.adminSessions);
  assert.deepEqual(winner.auth.userPermissionOverrides, initialAuth.userPermissionOverrides);
  assert.deepEqual(winner.storage, base.storage); assert.deepEqual(winner.integrations, base.integrations); checks += 9;
  // Independent users are merged from current auth rather than replacing inventory.
  const different = await Promise.all([
    a.commitOperatorSiteGrant({ userId: 'operator-c', expectedRecords: [], record: makeRecord('operator-c', 1) }),
    b.commitOperatorSiteGrant({ userId: 'operator-d', expectedRecords: [], record: makeRecord('operator-d', 1) }),
  ]);
  assert.equal(different.length, 2); assert.equal((await a.get()).auth.userSiteGrants.length, 4); checks += 2;
  // A stale full auth snapshot cannot roll back operator policies; a non-auth
  // settings writer also merges current auth under the same row lock.
  await b.update({ auth: { ...base.auth, inviteOnly: true }, storage: { changed: 'ordinary-save' } });
  const preserved = await a.get();
  assert.equal(recordsFor(preserved.auth, 'operator-a')[0].scope.revision, 2); assert.equal(preserved.auth.userSiteGrants.length, 4); assert.equal(preserved.auth.inviteOnly, true); checks += 3;
  let generic;
  await lock.begin(async tx => {
    await tx`SELECT id FROM platform_settings WHERE id = 'default' FOR UPDATE`;
    generic = b.update({ storage: { changed: 'after-lock' } }); await blocked('operator-grant-writer-b');
    const auth = (await tx`SELECT auth FROM platform_settings WHERE id = 'default'`)[0].auth;
    await tx`UPDATE platform_settings SET auth = ${tx.json({ ...auth, committedAheadOfGeneric: true })} WHERE id = 'default'`;
  });
  await generic;
  assert.equal((await a.get()).auth.committedAheadOfGeneric, true); checks++;
  const beforeReject = JSON.stringify((await a.get()).auth);
  await assert.rejects(b.commitOperatorSiteGrant({ userId: 'operator-a', expectedRecords: expected, record: makeRecord('operator-a', 3) }), error => error.code === 'OPERATOR_SITE_SCOPE_CONFLICT');
  assert.equal(JSON.stringify((await a.get()).auth), beforeReject); checks++;
  console.log(JSON.stringify({ ok: true, mode: 'owned-socket-only-postgresql', checks, proof: ['concurrent-first-initialize', 'same-user-one-winner-one-conflict', 'row-lock-wait', 'current-credential-session-and-other-user-preservation', 'different-user-merge', 'stale-generic-auth-cannot-roll-back-grants', 'non-auth-writer-preserves-current-auth', 'conflict-rolls-back'] }));
} finally { await cleanup(); }
