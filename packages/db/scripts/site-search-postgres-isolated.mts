/** Owned socket-only PostgreSQL proof. No configured database URL is accepted. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { load } from '../../../apps/public/scripts/admin-access-test-fixtures.mts';

if (process.argv.length > 2) throw Error('This test accepts no database target.');
const require = createRequire(import.meta.url), { NextRequest } = require('next/server');
const { createSiteRepository } = require('../src/repositories/site-page-post.ts');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl', 'postgres']) assert(existsSync(join(bin, name)));
const root = mkdtempSync('/tmp/backy-site-search-'), data = join(root, 'cluster'), socket = join(root, 'socket');
const port = randomInt(20000, 60000), clients: pg.Pool[] = [], queries: string[] = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
const run = (name: string, args: string[]) => execFileSync(join(bin, name), args, { env: environment, encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
const pool = (user: string) => {
  const value = new pg.Pool({ host: socket, port, user, password: 'local-fixture', database: 'postgres', ssl: false, max: 1 });
  clients.push(value); return value;
};
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0, siteBytes = 0, fullSiteReads = 0, narrowSiteReads = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))); checks++; };
const collectionRoutes = load('../src/lib/collectionRoutes.ts');
const seo = load('../src/lib/seoDiscovery.ts', { './canonicalRouteUrl': load('../src/lib/canonicalRouteUrl.ts'), './pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/backyStore': {}, '@/lib/collectionRoutes': collectionRoutes, '@/lib/frontendDesignContract': { frontendDesignProvenanceFromMetadata: () => undefined } });
const pagination = load('../src/lib/collectionExportPagination.ts');
const metadata = load('../src/lib/searchMetadata.ts', { './collectionExportPagination': pagination, './repositoryPages': load('../src/lib/repositoryPages.ts', { './collectionExportPagination': pagination, './pageHierarchy': load('../src/lib/pageHierarchy.ts') }) });
const baseRoute = { type: 'page', id: 'page-a', title: 'Base title', description: '', path: '/a', canonical: '/a', status: 'published', priority: 0.8, changeFrequency: 'weekly', robots: { index: true, follow: true }, openGraph: { title: 'Base title', description: '' }, keywords: [], jsonLd: [] };
const routesFor = (site: any) => metadata.projectSearchMetadataRoutes(seo.applySeoRouteOverrides([structuredClone(baseRoute)], site).map((route: any) => ({ ...seo.applySeoDefaults(route, site), robots: { index: route.robots.index && site.settings.seo.robots?.index !== false, follow: route.robots.follow && site.settings.seo.robots?.follow !== false } })));
try {
  mkdirSync(socket);
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'search_fixture', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off`, '-w', 'start']);
  const owner = pool('search_fixture');
  await owner.query('create table sites (id uuid primary key, team_id uuid, name text, slug text, description text, custom_domain text, domain_status text, ssl_enabled boolean, is_published boolean, published_at timestamptz, created_at timestamptz default now(), updated_at timestamptz, settings jsonb, theme jsonb)');
  const override = { id: 'override-first', match: '/a', title: 'First override', description: 'An authored public deck', canonical: '/renamed-a', keywords: ['public-topic'], robots: { index: true, follow: false }, label: 'PRIVATE_LABEL', ogImage: 'PRIVATE_IMAGE', jsonLd: [{ privateBody: 'x'.repeat(2000000) }] };
  const settings = { frontendDesign: { PRIVATE_TEMPLATES: 'x'.repeat(2000000) }, analytics: { privateScript: 'PRIVATE_SCRIPT' }, seo: { titleTemplate: '%s | {siteName}', defaultDescription: 'Default public deck', robots: { index: true, follow: true, extraRules: 'PRIVATE_ROBOTS_RULES' }, defaultOgImage: 'PRIVATE_DEFAULT_IMAGE', jsonLd: [{ PRIVATE_JSONLD: 'x'.repeat(1000000) }], routeOverrides: [{ ...override, id: 'disabled', enabled: false }, override, { ...override, id: 'later', title: 'Must not override the earlier match' }] } };
  const fixtures = [
    [1, 'public-site', true, settings],
    [2, 'empty-settings', true, {}],
    [3, 'null-seo-fields', true, { seo: { titleTemplate: null, defaultDescription: null, robots: null, routeOverrides: null } }],
    [4, id(1), true, {}], [5, id(99), true, {}],
    [6, 'private-site', false, { seo: { routeOverrides: { malformed: true } } }],
    [7, 'bad-policy', true, { seo: { routeOverrides: { malformed: true } } }],
    [8, 'noindex-site', true, { seo: { robots: { index: false, follow: false } } }],
  ] as const;
  for (const [n, slug, published, raw] of fixtures) await owner.query('insert into sites (id,name,slug,is_published,updated_at,settings,theme) values ($1,$2,$3,$4,$5,$6,$7)', [id(n), `Site ${n}`, slug, published, '2026-01-01', JSON.stringify(raw), JSON.stringify({ PRIVATE_THEME: 'x'.repeat(n === 1 ? 1000000 : 10) })]);
  await owner.query('create role search_reader login');
  await owner.query('grant select (id,name,slug,is_published,updated_at,settings) on sites to search_reader');
  const reader = pool('search_reader'), db = drizzle(reader, { logger: { logQuery(query: string) { queries.push(query); } } });
  const repository = createSiteRepository(db), legacyRepository = createSiteRepository(drizzle(owner));
  await assert.rejects(() => reader.query('select theme from sites'), (error: any) => error.code === '42501'); checks++;
  for (const n of [1, 2, 3, 8]) {
    const narrow = await repository.getSearchMetadataByIdOrSlug(id(n)), full = await legacyRepository.getById(id(n));
    equal(narrow.id, full.id); equal(narrow.isPublished, full.isPublished); equal(routesFor(narrow), routesFor(full));
    assert(!JSON.stringify(narrow).includes('PRIVATE')); checks++;
    equal(Object.keys(narrow).sort(), ['id', 'isPublished', 'name', 'settings', 'slug', 'updatedAt']);
    equal(Object.keys(narrow.settings.seo).sort(), ['defaultDescription', 'robots', 'routeOverrides', 'titleTemplate']);
    if (n === 1) { siteBytes = Buffer.byteLength(JSON.stringify(narrow)); assert(siteBytes < 2500); checks++; equal(narrow.settings.seo.routeOverrides.map((entry: any) => entry.id), ['disabled', 'override-first', 'later']); equal(routesFor(narrow)[0].title, 'First override | Site 1'); equal(routesFor(narrow)[0].canonical, '/renamed-a'); }
  }
  equal((await repository.getSearchMetadataByIdOrSlug('public-site')).id, id(1));
  equal((await repository.getSearchMetadataByIdOrSlug(id(1))).id, id(1));
  equal((await repository.getSearchMetadataByIdOrSlug(id(99))).id, id(5));
  equal(await repository.getSearchMetadataByIdOrSlug('missing-site'), null);
  equal((await repository.getSearchMetadataByIdOrSlug('private-site')).isPublished, false);
  await assert.rejects(() => repository.getSearchMetadataByIdOrSlug('bad-policy')); checks++;
  const beforeUnsupported = queries.length;
  await assert.rejects(() => createSiteRepository(db, 'sqlite').getSearchMetadataByIdOrSlug(id(1))); checks++;
  equal(queries.length, beforeUnsupported);

  let interleave = '';
  const list = (items: any[], input: any) => ({ items, pagination: { total: items.length, limit: input.limit, offset: input.offset, hasMore: false } });
  const repositories = {
    sites: { ...repository,
      getById: async () => { fullSiteReads++; throw Error('Full site reads are forbidden in search'); },
      getBySlug: async () => { fullSiteReads++; throw Error('Full site reads are forbidden in search'); },
      getSearchMetadataByIdOrSlug: async (identifier: string) => { narrowSiteReads++; return repository.getSearchMetadataByIdOrSlug(identifier); },
    },
    pages: { listRouteMetadata: async (input: any) => list([{ id: 'page-a', siteId: id(1), slug: 'a', status: 'published', parentId: null, isHomepage: false }], input), listSearchMetadata: async (input: any) => {
      if (interleave === 'policy') await owner.query("update sites set settings=jsonb_set(settings,'{seo,titleTemplate}',to_jsonb('Changed policy'::text)) where id=$1", [id(1)]);
      if (interleave === 'withdraw') await owner.query('update sites set is_published=false where id=$1', [id(1)]);
      return list(input.status === 'published' ? [{ id: 'page-a', siteId: id(1), title: 'Base title', slug: 'a', description: '', status: 'published', updatedAt: '2026-01-01', meta: {} }] : [], input);
    } },
    posts: { listSearchMetadata: async (input: any) => list([], input) },
    collections: { listSearchMetadata: async (input: any) => list([], input), listRecordSearchMetadata: async (input: any) => list([], input) },
    cacheInvalidations: { latestRevision: async () => 'unchanged-fixture-revision' },
  };
  const route = load('../src/app/api/sites/[siteId]/seo/route.ts', { './pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/backyStore': {}, '@/lib/seoDiscovery': seo, '@/lib/collectionRoutes': collectionRoutes, '@/lib/frontendDesignContract': { frontendDesignProvenanceFromMetadata: () => undefined }, '@/lib/publicDiscoveryRead': load('../src/lib/publicDiscoveryRead.ts', { './publicContractResponse': load('../src/lib/publicContractResponse.ts'), './seoDiscovery': seo, './canonicalRouteUrl': load('../src/lib/canonicalRouteUrl.ts'), './redirectRules': load('../src/lib/redirectRules.ts') }), '@/lib/searchMetadata': metadata, '@/lib/publicContractResponse': load('../src/lib/publicContractResponse.ts'), '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories } });
  const read = (identifier = id(1)) => route.GET(new NextRequest('http://fixture.invalid/api/sites/' + identifier + '/seo?format=search'), { params: Promise.resolve({ siteId: identifier }) });
  const first = await read(); equal(first.status, 200); equal(narrowSiteReads, 3); equal(fullSiteReads, 0);
  const body = await first.json(); equal(body.data.routes, routesFor(await legacyRepository.getById(id(1))));
  assert(!JSON.stringify(body).includes('PRIVATE')); checks++;
  interleave = 'policy'; equal((await read()).status, 503); equal(fullSiteReads, 0);
  await owner.query('update sites set settings=$1 where id=$2', [JSON.stringify(settings), id(1)]);
  interleave = 'withdraw'; equal((await read()).status, 404); equal(fullSiteReads, 0);
  equal((await read('private-site')).status, 404);
  equal((await read('bad-policy')).status, 503);
  for (const query of queries) {
    assert(!/select\s+\*|"theme"|"settings"\s*,/i.test(query));
    assert(/where .*"sites"\."(?:id|slug)".*limit /i.test(query)); checks += 2;
  }
  const proof = { passed: true, checks, actualPostgres: true, actualSeoEndpoint: true, queries: queries.length, projectedSiteJsonBytes: siteBytes, sourceExcludedBytes: 10000000, fullSiteReads, siteBeforeAndAfterAdmission: true, unchangedRevisionPolicyRaceRefused: true, orderedOverrideAndDefaultParity: true, uuidIdPrecedence: true, themeColumnPermissionDenied: true, hostedRequests: 0, boundary: 'Actual PostgreSQL site repository and endpoint; page/post/collection/session data are synthetic. JSON result sizes are not provider billing measurements.' };
  if (process.env.BACKY_SITE_SEARCH_TEST_OUTPUT) writeFileSync(process.env.BACKY_SITE_SEARCH_TEST_OUTPUT, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  assert(/^\/tmp\/backy-site-search-[A-Za-z0-9]+$/.test(root));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
}
