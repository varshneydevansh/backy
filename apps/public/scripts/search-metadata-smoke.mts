import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';
import * as coreModule from '@backy-cms/core';
import { writeFileSync } from 'node:fs';
const core = coreModule.default || coreModule;

// Saved handler, saved pagination/SEO/header helpers; persistence is synthetic.
// These fixtures perform no owner writes and contact no providers.
const transport = load('../src/lib/publicContractResponse.ts');
const collectionRoutes = load('../src/lib/collectionRoutes.ts');
const pagination = load('../src/lib/collectionExportPagination.ts');
const search = load('../src/lib/searchMetadata.ts', { './collectionExportPagination': pagination, './repositoryPages': load('../src/lib/repositoryPages.ts', { './collectionExportPagination': pagination, './pageHierarchy': load('../src/lib/pageHierarchy.ts') }) });
let checks = 0;
const photoSnapshots: Record<string, unknown> = {};
const equal = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
for (const demo of [false, true]) {
  const site: any = { id: 'search-site', slug: 'search-site', name: 'Search fixture', isPublished: true, settings: { seo: { titleTemplate: '%s | Fixture', sitemap: { includeDynamicRoutes: false }, routeOverrides: [{ match: '/public-items/item-0', title: 'Owner subject', description: 'Owner deck', keywords: ['owner topic'] }] } } };
  const item = (id: string, status = 'published') => ({ id, siteId: site.id, slug: id, title: id, description: 'Public deck', excerpt: 'Public excerpt', status, scheduledAt: new Date(Date.now() - 1000).toISOString(), updatedAt: '2026-01-01', meta: { keywords: ['subject'], jsonLd: [{ secret: 'private-jsonld' }], ogImage: 'https://private.invalid/media' }, content: { elements: [{ body: 'private-body' }], editableMap: { private: true } } });
  const pages = Array.from({ length: 205 }, (_, i) => item(`page-${i}`));
  pages.push(item('due-page', 'scheduled'), { ...item('future-page', 'scheduled'), scheduledAt: new Date(Date.now() + 86400000).toISOString() }, item('draft-page', 'draft'), item('archive-page', 'archived'), { ...item('noindex'), meta: { noIndex: true } });
  const posts = [item('post'), item('due-post', 'scheduled'), item('draft-post', 'draft'), { ...item('future-post', 'scheduled'), scheduledAt: new Date(Date.now() + 86400000).toISOString() }];
  const policy = { schemaVersion: 'backy.collection-search.v1', enabled: true, descriptionField: 'caption', keywordFields: ['tags', 'place_label', 'category'] };
  const collection = { id: 'public-collection', siteId: site.id, slug: 'public-items', name: 'Public items', status: 'published', permissions: { publicRead: true }, metadata: { publicSearch: policy, privateProvider: 'private-provider' } };
  const collections = [collection, { ...collection, id: 'private-collection', slug: 'private-items', permissions: { publicRead: false } }, { ...collection, id: 'draft-collection', status: 'draft' }];
  const records = Array.from({ length: 1205 }, (_, i) => ({ ...item(`item-${i}`), collectionId: collection.id, values: { title: `Item ${i}`, summary: 'Record deck', privateBody: 'private-record' } }));
  records.push({ ...records[0], id: 'due-record', slug: 'due-record', status: 'scheduled' }, { ...records[0], id: 'future-record', slug: 'future-record', status: 'scheduled', scheduledAt: new Date(Date.now() + 86400000).toISOString() }, { ...records[0], id: 'draft-record', status: 'draft' });
  Object.assign(records[1].values, { caption: [{ type: 'paragraph', children: [{ text: 'A railway platform beneath a glass roof.' }] }], tags: ['railway', 'architecture'], place_label: 'Berlin', category: 'transport', annotation_proposals: { tags: ['private-suggested-city'] }, source_details: { gps: 'private-coordinates' } });
  let revision = 'revision-1', malformed = false, tooLarge = false, race = false, withdraw = false, sitePolicyRace = false, siteReadFailure = false;
  const readable = (value: any) => value.status === 'published' || value.status === 'scheduled' && Date.parse(value.scheduledAt || '') <= Date.now();
  const pageOf = (items: any[], input: any) => {
    const limit = Math.min(input.limit, 37), offset = input.offset || 0;
    return { items: items.slice(offset, offset + limit), pagination: { total: items.length, limit, offset, hasMore: offset + limit < items.length } };
  };
  const list = (items: any[], input: any) => pageOf(items.filter(value => !input.status || value.status === input.status), input);
  let generalBodyReads = 0, fullSiteReads = 0, narrowSiteReads = 0;
  const projected = (item: any) => ({
    id: item.id, siteId: item.siteId, title: item.title, slug: item.slug, description: item.description,
    excerpt: item.excerpt, status: item.status, scheduledAt: item.scheduledAt, updatedAt: item.updatedAt, isHomepage: item.isHomepage, parentId: item.parentId,
    meta: Object.fromEntries(['canonical', 'title', 'description', 'noIndex', 'noFollow', 'keywords'].filter(key => item.meta?.[key] !== undefined).map(key => [key, item.meta[key]])),
  });
  const repositories = {
    sites: {
      getById: async () => { fullSiteReads++; return site; }, getBySlug: async () => { fullSiteReads++; return site; },
      getSearchMetadataByIdOrSlug: async () => {
        narrowSiteReads++;
        if (siteReadFailure) throw Error('private-adapter-diagnostic');
        const seo = site.settings.seo;
        return structuredClone({ id: site.id, slug: site.slug, name: site.name, isPublished: site.isPublished, updatedAt: site.updatedAt,
          settings: { seo: { titleTemplate: seo.titleTemplate, defaultDescription: seo.defaultDescription, robots: seo.robots,
            routeOverrides: seo.routeOverrides.map((override: any) => Object.fromEntries(['id', 'match', 'enabled', 'title', 'description', 'canonical', 'keywords', 'robots'].filter(key => override[key] !== undefined).map(key => [key, override[key]]))) } } });
      },
    },
    pages: { listRouteMetadata: async (input: any) => pageOf(pages.filter(value => value.siteId === input.siteId).map(({ id, siteId, slug, status, scheduledAt, isHomepage, parentId }: any) => ({ id, siteId, slug, status, scheduledAt, isHomepage, parentId })), input), list: async (input: any) => { generalBodyReads++; return list(pages, input); }, listSearchMetadata: async (input: any) => {
      const result = list(pages, input);
      if (tooLarge) result.pagination.total = 10001;
      if (malformed && input.offset > 0) result.items[0] = pages[0];
      return { ...result, items: result.items.map(projected) };
    } },
    posts: { list: async (input: any) => { generalBodyReads++; return list(posts, input); }, listSearchMetadata: async (input: any) => { const result = list(posts, input); return { ...result, items: result.items.map(projected) }; } },
    collections: {
      list: async (input: any) => { generalBodyReads++; return list(collections, input); },
      listSearchMetadata: async (input: any) => pageOf(collections.filter(value => value.siteId === input.siteId && value.status === 'published' && value.permissions.publicRead), input),
      listRecords: async (input: any) => {
        generalBodyReads++;
        assert.equal(input.collectionId, collection.id);
        if (race) revision = 'revision-raced';
        if (withdraw) site.isPublished = false;
        return list(records, input);
      },
      listRecordSearchMetadata: async (input: any) => {
        assert.equal(input.collectionId, collection.id);
        assert(!input.valueKeys.includes('annotation_proposals'));
        if (race) revision = 'revision-raced';
        if (withdraw) site.isPublished = false;
        if (sitePolicyRace) site.settings.seo.titleTemplate += ' changed during collection read';
        const result = list(records, input);
        return { ...result, items: result.items.map(record => ({ ...record, values: core.projectBackyCollectionSearchValues(record.values, input.valueKeys) })) };
      },
    },
    cacheInvalidations: { latestRevision: async () => revision },
  };
  const store = {
    getSiteByIdOrSlug: () => site,
    getPageSummary: (_siteId: string, options?: any) => options?.includeUnpublished ? pages : pages.filter(readable),
    getBlogPosts: (_siteId: string, input: any) => { const result = pageOf(posts.filter(readable), input); return { posts: result.items, pagination: result.pagination }; },
    listCollections: () => collections.filter(value => value.status === 'published' && value.permissions.publicRead),
    listCollectionRecords: (_siteId: string, collectionId: string, input: any) => { assert.equal(collectionId, collection.id); const result = pageOf(records.filter(readable), input); return { records: result.items, pagination: result.pagination }; },
  };
  const seo = load('../src/lib/seoDiscovery.ts', { './canonicalRouteUrl': load('../src/lib/canonicalRouteUrl.ts'), './pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/backyStore': store, '@/lib/collectionRoutes': collectionRoutes, '@/lib/frontendDesignContract': { frontendDesignProvenanceFromMetadata: () => ({ private: 'private-design' }) } });
  const route = load('../src/app/api/sites/[siteId]/seo/route.ts', {
    './pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/pageHierarchy': load('../src/lib/pageHierarchy.ts'), '@/lib/backyStore': store, '@/lib/seoDiscovery': seo,
    '@/lib/collectionRoutes': collectionRoutes,
    '@/lib/frontendDesignContract': { frontendDesignProvenanceFromMetadata: () => ({ private: 'private-design' }) },
    '@/lib/publicDiscoveryRead': load('../src/lib/publicDiscoveryRead.ts', { './publicContractResponse': load('../src/lib/publicContractResponse.ts'), './seoDiscovery': seo, './canonicalRouteUrl': load('../src/lib/canonicalRouteUrl.ts'), './redirectRules': load('../src/lib/redirectRules.ts') }), '@/lib/searchMetadata': search, '@/lib/publicContractResponse': transport,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
  });
  const read = (etag?: string, format = 'search', headers = {}) => route.GET(new NextRequest(`http://fixture.invalid/api/sites/${site.id}/seo?format=${format}`, { headers: { ...headers, ...(etag ? { 'if-none-match': etag } : {}) } }), { params: Promise.resolve({ siteId: site.id }) });
  const initial = await read();
  equal(initial.status, 200);
  equal(initial.headers.get('cache-control'), 'public, no-cache, must-revalidate');
  equal(initial.headers.get('x-backy-cache-scope'), 'render');
  assert.ok(initial.headers.get('x-backy-cache-revision')); checks++;
  const body = await initial.json();
  if (!demo) { equal(fullSiteReads, 0); equal(narrowSiteReads, 3); }
  equal(Object.keys(body.data).sort(), ['routes', 'site']);
  equal(Object.keys(body.data.site).sort(), ['id', 'name', 'slug']);
  equal(body.data.routes.length, 1415);
  equal(body.data.routes.find((value: any) => value.id === 'item-0').title, 'Owner subject | Fixture');
  equal(body.data.routes.find((value: any) => value.id === 'item-0').description, 'Owner deck');
  equal(body.data.routes.find((value: any) => value.id === 'item-0').keywords, ['owner topic']);
  equal(body.data.routes.find((value: any) => value.id === 'item-1').keywords, ['railway', 'architecture', 'Berlin', 'transport']);
  equal(body.data.routes.find((value: any) => value.id === 'item-1').description, 'A railway platform beneath a glass roof.');
  equal(body.data.routes.find((value: any) => value.id === 'item-2').keywords, []);
  for (const id of ['due-page', 'due-post', 'due-record']) equal(body.data.routes.find((value: any) => value.id === id).status, 'published');
  equal(body.data.routes.some((value: any) => /draft|future|archive|private|noindex/.test(value.id)), false);
  equal(JSON.stringify(body).includes('private-'), false);
  equal(Object.keys(body.data.routes[0]).sort(), ['canonical', 'description', 'id', 'keywords', 'path', 'robots', 'status', 'title', 'type']);
  const etag = initial.headers.get('etag')!;
  equal((await read(etag)).status, 304);
  const snapshot = (data: any) => ({ ...data, routes: data.routes.filter((value: any) => value.id === 'item-1') });
  if (!demo) photoSnapshots.initial = snapshot(body.data);
  Object.assign(records[1].values, { caption: 'Buffalo beside a riverside path.', tags: ['buffalo', 'river'], place_label: 'Mathura', category: 'animals' });
  const photoEdited = await read(etag);
  equal(photoEdited.status, 200);
  const photoData = (await photoEdited.json()).data;
  equal(photoData.routes.find((value: any) => value.id === 'item-1').description, 'Buffalo beside a riverside path.');
  equal(photoData.routes.find((value: any) => value.id === 'item-1').keywords, ['buffalo', 'river', 'Mathura', 'animals']);
  if (!demo) photoSnapshots.edited = snapshot(photoData);
  records[1].status = 'draft';
  const photoWithdrawn = await read(photoEdited.headers.get('etag')!);
  equal(photoWithdrawn.status, 200);
  const withdrawnPhotoData = (await photoWithdrawn.json()).data;
  equal(withdrawnPhotoData.routes.some((value: any) => value.id === 'item-1'), false);
  if (!demo) photoSnapshots.withdrawn = snapshot(withdrawnPhotoData);
  records[1].status = 'published';
  collection.metadata.publicSearch.enabled = false;
  const disabledPhotoData = (await (await read()).json()).data;
  equal(disabledPhotoData.routes.find((value: any) => value.id === 'item-1').keywords, []);
  equal(disabledPhotoData.routes.find((value: any) => value.id === 'item-1').description, 'Record deck');
  if (!demo) photoSnapshots.disabled = snapshot(disabledPhotoData);
  collection.metadata.publicSearch.enabled = true;
  const validPolicy = collection.metadata.publicSearch;
  (collection.metadata as any).publicSearch = { ...validPolicy, schemaVersion: 'unknown' };
  const invalidPolicy = await read();
  equal(invalidPolicy.status, 503); equal(invalidPolicy.headers.get('cache-control'), 'no-store');
  equal((await invalidPolicy.json()).error.code, 'SEARCH_METADATA_INCOMPLETE');
  collection.metadata.publicSearch = validPolicy;
  pages[0].title = 'Current title';
  const edited = await read(etag);
  equal(edited.status, 200);
  equal((await edited.json()).data.routes.find((value: any) => value.id === pages[0].id).title, 'Current title | Fixture');
  pages[0].status = 'draft';
  const withdrawn = await read(edited.headers.get('etag')!);
  equal(withdrawn.status, 200);
  equal((await withdrawn.json()).data.routes.some((value: any) => value.id === pages[0].id), false);
  site.settings.seo.robots = { index: false };
  equal((await (await read()).json()).data.routes, []);
  delete site.settings.seo.robots;
  if (!demo) {
    equal(generalBodyReads, 0);
    equal(fullSiteReads, 0);
    const projectedSiteRead = repositories.sites.getSearchMetadataByIdOrSlug;
    delete (repositories.sites as any).getSearchMetadataByIdOrSlug;
    equal((await read()).status, 503); equal(fullSiteReads, 0);
    repositories.sites.getSearchMetadataByIdOrSlug = projectedSiteRead;
    siteReadFailure = true;
    const failedSiteRead = await read(); equal(failedSiteRead.status, 503); equal(fullSiteReads, 0);
    equal(JSON.stringify(await failedSiteRead.json()).includes('private-adapter-diagnostic'), false);
    siteReadFailure = false;
    const projectedRead = repositories.pages.listSearchMetadata;
    delete (repositories.pages as any).listSearchMetadata;
    equal((await read()).status, 503); equal(generalBodyReads, 0);
    repositories.pages.listSearchMetadata = projectedRead;
    for (const key of ['listSearchMetadata', 'listRecordSearchMetadata'] as const) {
      const method = repositories.collections[key];
      delete (repositories.collections as any)[key];
      equal((await read()).status, 503); equal(generalBodyReads, 0);
      repositories.collections[key] = method;
    }
    for (const mode of ['tooLarge', 'malformed', 'race']) {
      tooLarge = mode === 'tooLarge'; malformed = mode === 'malformed'; race = mode === 'race'; revision = 'revision-1';
      const response = await read(etag);
      equal(response.status, 503); equal(response.headers.get('cache-control'), 'no-store'); equal(response.headers.has('etag'), false);
      equal((await response.json()).error.code, 'SEARCH_METADATA_INCOMPLETE');
    }
    tooLarge = malformed = race = false;
    const previousTitleTemplate = site.settings.seo.titleTemplate;
    const policyRaceRevision = revision;
    sitePolicyRace = true;
    equal((await read(etag)).status, 503);
    equal(revision, policyRaceRevision);
    sitePolicyRace = false; site.settings.seo.titleTemplate = previousTitleTemplate;
    withdraw = true; equal((await read(etag)).status, 404); withdraw = false; site.isPublished = true;
  }
  site.isPublished = false;
  equal((await read(etag)).status, 404);
  site.isPublished = true;
  // Retained private ancestors shape paths without disclosing their editorial fields.
  pages.push({ ...item('private-parent', 'draft'), title: 'PRIVATE_PARENT_TITLE' },
    { ...item('nested-leaf'), parentId: 'private-parent' },
    { ...item('orphan-leaf'), parentId: 'missing-parent' });
  const nestedResponse = await read(); equal(nestedResponse.status, 200);
  const nestedBody = await nestedResponse.json();
  equal(nestedBody.data.routes.find((entry: any) => entry.id === 'nested-leaf')?.path, '/private-parent/nested-leaf');
  equal(nestedBody.data.routes.some((entry: any) => entry.id === 'private-parent' || entry.id === 'orphan-leaf'), false);
  equal(JSON.stringify(nestedBody).includes('PRIVATE_PARENT_TITLE'), false);
  pages.splice(pages.length - 3, 3);
  // Other formats retain the deployed fresh render cache and payload behavior.
  // Repository mode exercises unchanged legacy converters with public stubs.
  if (!demo) {
    for (const [format, contentType] of [['json', 'application/json'], ['sitemap', 'application/xml'], ['robots', 'text/plain']]) {
      const response = await read(undefined, format);
      equal(response.status, 200); equal(response.headers.get('x-backy-cache-scope'), 'render');
      assert.ok(response.headers.get('content-type')?.includes(contentType)); checks++;
    }
    equal((await read(undefined, 'search', { 'x-backy-seo-format': 'robots' })).headers.get('x-backy-cache-scope'), 'render');
  }
}
// Verify the entry budget is shared across kinds and pagination inconsistencies
// reject instead of silently stopping at a first page.
const collect = search.createSearchMetadataCollector(3);
const readOne = async () => ({ items: [{ id: 'a' }, { id: 'b' }], pagination: { total: 2, limit: 100, offset: 0, hasMore: false } });
await collect(readOne, () => true);
await assert.rejects(() => collect(readOne, () => true), search.SearchMetadataIncompleteError); checks++;
if (process.env.BACKY_SEARCH_METADATA_TEST_OUTPUT) writeFileSync(process.env.BACKY_SEARCH_METADATA_TEST_OUTPUT, JSON.stringify({ synthetic: true, snapshots: photoSnapshots }, null, 2) + '\n');
console.log(`Search metadata passed ${checks} checks: actual GET, demo/repository pagination, publication, metadata privacy, revision races, bounded failure, ETag freshness and legacy formats. Deployment remains separate.`);
