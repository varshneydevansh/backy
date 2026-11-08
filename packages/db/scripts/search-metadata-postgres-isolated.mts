/** Owned socket-only PostgreSQL cluster; never reads a configured database URL. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

if (process.argv.length > 2) throw Error('This test accepts no database target.');
const require = createRequire(import.meta.url);
const { createPageRepository, createPostRepository } = require('../src/repositories/site-page-post.ts');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl', 'postgres']) assert(existsSync(join(bin, name)));
const root = mkdtempSync('/tmp/backy-search-metadata-'), data = join(root, 'cluster'), socket = join(root, 'socket');
const port = randomInt(20000, 60000), clients: pg.Pool[] = [], queries: string[] = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
const run = (name: string, args: string[]) => execFileSync(join(bin, name), args, { env: environment, encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
const pool = (user: string) => {
  const value = new pg.Pool({ host: socket, port, user, password: 'local-fixture', database: 'postgres', ssl: false, max: 1 });
  clients.push(value); return value;
};
const site = '00000000-0000-4000-8000-000000000001', foreign = '00000000-0000-4000-8000-000000000002';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seo = { canonical: '/work/example', title: 'An authored title', description: 'A short description — नमस्ते', noIndex: false, noFollow: true, keywords: ['photography', 'architecture'] };
let checks = 0, bytes = 0;
try {
  mkdirSync(socket);
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'search_fixture', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off`, '-w', 'start']);
  const owner = pool('search_fixture');
  for (const table of ['pages', 'blog_posts']) {
    await owner.query(`create table ${table} (id uuid primary key, site_id uuid, title text, slug text, description text, excerpt text, status text, is_homepage boolean, parent_id uuid, scheduled_at timestamptz, updated_at timestamptz, meta jsonb, content jsonb)`);
    for (const [n, status, rowSite, scheduled] of [[1, 'published', site, null], [2, 'published', site, null], [3, 'scheduled', site, '2020-01-01'], [4, 'scheduled', site, '2030-01-01'], [5, 'draft', site, null], [6, 'archived', site, null], [7, 'published', foreign, null]] as const) {
      const meta = n === 2 ? { ...seo, privateOwnerState: 'x'.repeat(2000000) } : seo;
      await owner.query(`insert into ${table} values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id(n), rowSite, 'Stored title', `entry-${n}`, 'Page description', 'Post excerpt', status, n === 2, null, scheduled, '2026-01-01', JSON.stringify(meta), JSON.stringify({ body: 'x'.repeat(n === 2 ? 2000000 : 20) })]);
    }
  }
  await owner.query('create role search_reader login');
  for (const table of ['pages', 'blog_posts']) await owner.query(`grant select (id,site_id,title,slug,description,excerpt,status,is_homepage,parent_id,scheduled_at,updated_at,meta) on ${table} to search_reader`);
  const reader = pool('search_reader'), db = drizzle(reader, { logger: { logQuery(query: string) { queries.push(query); } } });
  for (const [table, repository] of [['pages', createPageRepository(db)], ['blog_posts', createPostRepository(db)]] as const) {
    await assert.rejects(() => reader.query(`select content from ${table}`), (error: any) => error.code === '42501'); checks++;
    const first = await repository.listSearchMetadata({ siteId: site, status: 'published', limit: 1, offset: 0 });
    assert.equal(first.pagination.total, 2); assert.equal(first.pagination.hasMore, true); assert.equal(first.items[0].id, id(2)); checks += 3;
    assert.deepEqual(first.items[0].meta, seo); assert(!('content' in first.items[0])); assert(!JSON.stringify(first).includes('privateOwnerState')); checks += 3;
    const wireBytes = Buffer.byteLength(JSON.stringify(first)); assert(wireBytes < 2000); bytes += wireBytes; checks++;
    const next = await repository.listSearchMetadata({ siteId: site, status: 'published', limit: 1, offset: 1 });
    assert.equal(next.items[0].id, id(1)); assert.equal(next.pagination.hasMore, false); checks += 2;
    const empty = await repository.listSearchMetadata({ siteId: site, status: 'published', limit: 1, offset: 2 });
    assert.equal(empty.items.length, 0); assert.equal(empty.pagination.total, 2); checks += 2;
    const scheduled = await repository.listSearchMetadata({ siteId: site, status: 'scheduled', limit: 100 });
    assert.equal(scheduled.items.length, 2); assert(scheduled.items.every((item: any) => item.status === 'scheduled' && item.scheduledAt)); checks += 2;
    const before = queries.length;
    await assert.rejects(() => repository.listSearchMetadata({ siteId: site, status: 'draft' }));
    assert.equal(queries.length, before); checks += 2;
  }
  for (const query of queries) {
    assert(!/"content"|select\s+\*/i.test(query)); assert(/where .*"site_id".*"status"/i.test(query));
    if (!/count\(\*\)/i.test(query)) { assert(/limit /i.test(query)); assert.equal((query.match(/"meta"/g) || []).length, 6); }
    checks += 2;
  }
  assert(queries.some(query => /offset /i.test(query))); checks++;
  console.log(JSON.stringify({ passed: true, checks, queries: queries.length, projectedFirstPageBytes: bytes, sourceBodyAndOwnerMetadataBytesPerHeavyRow: 4000000,
    bodyColumnPermissionDenied: true, actualPostgres: true, sqlPagination: true, metadataKeys: Object.keys(seo), hostedRequests: 0,
    boundary: 'Actual source repositories/Drizzle/PostgreSQL; owned local role cannot SELECT content. JSON result bytes are not billing measurements.' }));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  assert(/^\/tmp\/backy-search-metadata-[A-Za-z0-9]+$/.test(root));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
}
