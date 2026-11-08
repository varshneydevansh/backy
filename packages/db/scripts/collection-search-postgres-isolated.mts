/** Real repositories in an owned socket-only database; no configured database URL. */
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
const { createCollectionRepository } = require('../src/repositories/collections.ts');
const { backyCollectionSearchValueKeys, backyCollectionSearchFields, readBackyCollectionPublicSearch } = require('../../core/src/collection-search.ts');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl', 'postgres']) assert(existsSync(join(bin, name)));
const root = mkdtempSync('/tmp/backy-collection-search-'), data = join(root, 'cluster'), socket = join(root, 'socket');
const port = randomInt(20000, 60000), clients: pg.Pool[] = [], queries: string[] = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
const run = (name: string, args: string[]) => execFileSync(join(bin, name), args, { env: environment, encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
const pool = (user: string) => {
  const value = new pg.Pool({ host: socket, port, user, password: 'local-fixture', database: 'postgres', ssl: false, max: 1 });
  clients.push(value); return value;
};
const site = '00000000-0000-4000-8000-000000000001', foreign = '00000000-0000-4000-8000-000000000002';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const policy = { schemaVersion: 'backy.collection-search.v1', enabled: true, descriptionField: 'caption', keywordFields: ['tags', 'place_label', 'category'] };
let checks = 0, projectedBytes = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
try {
  mkdirSync(socket);
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'search_fixture', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off`, '-w', 'start']);
  const owner = pool('search_fixture');
  await owner.query('create table content_collections (id uuid primary key, site_id uuid, name text, slug text, description text, status text, route_pattern text, list_route_pattern text, permissions jsonb, metadata jsonb, fields jsonb, updated_at timestamptz)');
  await owner.query('create table content_collection_records (id uuid primary key, site_id uuid, collection_id uuid, slug text, status text, scheduled_at timestamptz, updated_at timestamptz, values jsonb)');
  for (const [n, rowSite, status, publicRead] of [[1, site, 'published', true], [2, site, 'published', false], [3, site, 'draft', true], [4, foreign, 'published', true], [5, site, 'published', true], [6, site, 'published', undefined]] as const) {
    await owner.query('insert into content_collections values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id(n), rowSite, 'Photographs', `photos-${n}`, 'An original collection', status, `/photos-${n}/:recordSlug`, `/photos-${n}`, JSON.stringify({ publicRead }), JSON.stringify({ ...(n === 1 ? { publicSearch: policy } : {}), privateCanvas: 'x'.repeat(2000000) }), JSON.stringify({ privateFieldOptions: 'x'.repeat(2000000) }), '2026-01-01']);
  }
  for (const [n, rowSite, collection, status, scheduled] of [[11, site, 1, 'published', null], [12, site, 1, 'published', null], [13, site, 1, 'scheduled', '2020-01-01'], [14, site, 1, 'scheduled', '2030-01-01'], [15, site, 1, 'draft', null], [16, foreign, 1, 'published', null], [17, site, 2, 'published', null], [18, site, 3, 'published', null]] as const) {
    const values = { title: `Photograph ${n}`, caption: [{ children: [{ text: 'A railway beneath a glass roof.' }] }], tags: ['railway', 'Architecture'], place_label: 'Berlin', category: 'transport', annotation_proposals: 'x'.repeat(2000000), variant_refs: 'x'.repeat(2000000), source_details: { gps: 'private-coordinates' }, description: n === 12 ? '界'.repeat(12000) : '' };
    await owner.query('insert into content_collection_records values ($1,$2,$3,$4,$5,$6,$7,$8)', [id(n), rowSite, id(collection), `photo-${n}`, status, scheduled, '2026-01-01', JSON.stringify(values)]);
  }
  await owner.query('create role search_reader login');
  await owner.query('grant select (id,site_id,name,slug,description,status,route_pattern,list_route_pattern,permissions,metadata,updated_at) on content_collections to search_reader');
  await owner.query('grant select on content_collection_records to search_reader');
  const reader = pool('search_reader'), db = drizzle(reader, { logger: { logQuery(query: string) { queries.push(query); } } });
  const repository = createCollectionRepository(db, { adapterType: 'postgres' });
  await assert.rejects(() => reader.query('select fields from content_collections'), (error: any) => error.code === '42501'); checks++;
  const first = await repository.listSearchMetadata({ siteId: site, limit: 1 });
  equal(first.pagination.total, 3); equal(first.pagination.hasMore, true); equal(first.items[0].id, id(1)); equal(first.items[0].metadata, { publicSearch: policy });
  equal('fields' in first.items[0], false); assert(!JSON.stringify(first).includes('privateCanvas')); checks++;
  projectedBytes += Buffer.byteLength(JSON.stringify(first));
  const second = await repository.listSearchMetadata({ siteId: site, limit: 1, offset: 1 });
  equal(second.items[0].id, id(5)); equal(second.items[0].metadata, {}); equal(second.pagination.hasMore, true);
  const legacy = await repository.listSearchMetadata({ siteId: site, limit: 1, offset: 2 });
  equal(legacy.items[0].id, id(6)); equal(legacy.items[0].permissions.publicRead, true); equal(legacy.pagination.hasMore, false);
  const keys = backyCollectionSearchValueKeys(first.items[0].metadata);
  const input = { siteId: site, collectionId: id(1), status: 'published', valueKeys: keys, limit: 1 };
  const records = await repository.listRecordSearchMetadata(input);
  equal(records.pagination.total, 2); equal(records.items[0].id, id(11)); equal(records.pagination.hasMore, true);
  equal(Object.keys(records.items[0].values).sort(), ['caption', 'category', 'description', 'place_label', 'tags', 'title']);
  equal(backyCollectionSearchFields(records.items[0].values, first.items[0].metadata), { description: 'A railway beneath a glass roof.', keywords: ['railway', 'Architecture', 'Berlin', 'transport'] });
  projectedBytes += Buffer.byteLength(JSON.stringify(records));
  assert(projectedBytes < 2500); checks++;
  const next = await repository.listRecordSearchMetadata({ ...input, offset: 1 });
  equal(next.items[0].id, id(12)); equal(Object.hasOwn(next.items[0].values, 'description'), false); equal(next.pagination.hasMore, false);
  const scheduled = await repository.listRecordSearchMetadata({ ...input, status: 'scheduled', limit: 100 });
  equal(scheduled.items.length, 2); assert(scheduled.items.every((row: any) => row.scheduledAt)); checks++;
  for (const collectionId of [id(2), id(3), id(4)]) equal((await repository.listRecordSearchMetadata({ ...input, collectionId })).pagination.total, 0);
  const before = queries.length;
  for (const patch of [{ status: 'draft' }, { valueKeys: ["caption') from other"] }, { valueKeys: ['__proto__'] }, { valueKeys: ['title', 'title'] }, { valueKeys: Array(17).fill('title') }]) {
    await assert.rejects(() => repository.listRecordSearchMetadata({ ...input, ...patch })); checks++;
  }
  equal(queries.length, before);
  await owner.query("update content_collections set permissions = '{\"publicRead\":false}' where id=$1", [id(1)]);
  equal((await repository.listRecordSearchMetadata(input)).pagination.total, 0);
  equal((await repository.listSearchMetadata({ siteId: site })).pagination.total, 2);
  await owner.query('update content_collections set permissions=$1,metadata=$2 where id=$3', [JSON.stringify({ publicRead: true }), JSON.stringify({ publicSearch: { ...policy, oversized: 'x'.repeat(40000) } }), id(1)]);
  const invalid = await repository.listSearchMetadata({ siteId: site, limit: 1 });
  assert.throws(() => readBackyCollectionPublicSearch(invalid.items[0].metadata)); checks++;
  for (const query of queries) {
    assert(!/select\s+\*|"fields"|"(?:metadata|values)"\s*,/i.test(query));
    assert(/where .*"site_id"/i.test(query)); checks += 2;
    if (!/count\(\*\)/i.test(query)) { assert(/limit /i.test(query)); checks++; }
  }
  assert(queries.some(query => /offset /i.test(query))); checks++;
  console.log(JSON.stringify({ passed: true, checks, queries: queries.length, actualPostgres: true, projectedFirstPagesBytes: projectedBytes, excludedLargeBytesPerFixture: 4000000, noFieldsColumnPermission: true, sqlStatusAndPermissionAdmission: true, sqlPagination: true, oversizedValueOmitted: true, oversizedPolicyRefused: true, hostedRequests: 0, boundary: 'Owned local PostgreSQL, actual repositories and JSON subfield projections; result sizes are not provider billing measurements.' }));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  assert(/^\/tmp\/backy-collection-search-[A-Za-z0-9]+$/.test(root));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
}
