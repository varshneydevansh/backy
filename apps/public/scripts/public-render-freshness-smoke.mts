import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';

// Execute the saved GET and response policy, with mutable repository/demo
// fixtures. No provider, production content, or browser cache is changed.
const transport = load('../src/lib/publicContractResponse.ts');
const site = { id: 'fresh-site', slug: 'fresh-site', name: 'Fresh', isPublished: true, theme: {}, settings: {} };
const content = { elements: [{ id: 'heading', type: 'heading', props: { content: 'Before edit' } }], metadata: {} };
const page = { id: 'page', siteId: site.id, title: 'Page', slug: 'page', status: 'published', content, meta: {} };
const post = { ...page, id: 'post', slug: 'post' };
const readable = (item: any) => item.status === 'published' || (item.status === 'scheduled' && Date.parse(item.scheduledAt || '') <= Date.now());
const payload = (_site: any, item: any, options: any) => ({ success: true, requestId: options.requestId, data: { content: item.content, route: { id: item.id, status: item.status } } });
let checks = 0;
for (const demo of [false, true]) {
  const repositories = {
    sites: { getById: async () => site },
    posts: { getBySlug: async () => post },
    pages: { list: async () => ({ items: [] }) },
    collections: { list: async () => ({ items: [] }) },
    media: { list: async () => ({ items: [] }) },
    cacheInvalidations: { latestRevision: async () => 'fixture-revision' },
    contentWorkflows: { validatePreviewToken: async () => true },
  };
  const mocks = {
    '@/lib/publicContractResponse': transport,
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
    '@/lib/repositoryPages': { getRepositoryPageByPublicPath: async () => page },
    '@/lib/repositoryNavigationPages': { collectPublishedNavigationPages: async () => [] },
    '@/lib/navigation': { buildSiteNavigation: () => ({ primary: [], footer: [] }) },
    '@/lib/routeResolver': { normalizeRoutePath: (path: string) => path },
    '@/lib/siteLocalization': { resolveLocalizedRoutePath: (_settings: any, path: string) => ({ path, originalPath: path, locale: { code: 'en' } }) },
    '@/lib/collectionRoutes': { matchCollectionListRoute: () => null, matchCollectionItemRoute: () => null },
    '@/lib/publicDataFigureHydration': { withPublicDataFigureDatasets: async (_site: any, _content: any, _repo: any, data: any) => data },
    '@/lib/previewTokenAudit': { recordPreviewTokenUse: async () => {} },
    '@/lib/renderPayload': { buildPublicRenderPayload: payload, buildPublicBlogPostRenderPayload: payload },
    '@/lib/backyStore': {
      getSiteByIdOrSlug: () => site,
      getPageByPath: (_site: any, _path: any, options: any) => readable(page) || options?.includeUnpublished ? page : undefined,
      getBlogPosts: (_site: any, options: any) => ({ posts: readable(post) || options?.includeUnpublished ? [post] : [] }),
      listCollections: () => [], validatePreviewToken: () => true,
    },
  };
  const route = load('../src/app/api/sites/[siteId]/render/route.ts', mocks);
  const repositoryResolver = load('../src/lib/repositoryRouteResolver.ts', {
    './commerceCatalog': {},
    './frontendDesignContract': {},
    './collectionRoutes': mocks['@/lib/collectionRoutes'],
    './repositoryPages': mocks['@/lib/repositoryPages'],
    './routeResolver': { withLocalizedResolvedRoute: (value: any) => value },
    './redirectRules': { resolveRedirectRoute: () => null },
    './siteLocalization': mocks['@/lib/siteLocalization'],
  });
  const resolved = load('../src/app/api/sites/[siteId]/resolve/route.ts', {
    ...mocks,
    '@/lib/publicRouteHost': { normalizePublicRouteHost: () => null },
    '@/lib/repositoryRouteResolver': repositoryResolver,
    '@/lib/routeResolver': {
      normalizeRoutePath: (path: string) => path,
      // Demo storage selection is a fixture; repository resolution below runs
      // the actual saved resolver, including publication/preview admission.
      resolveSiteRoute: (value: any, path: string, options: any) => repositoryResolver.resolveRepositorySiteRoute(repositories, value, path, options),
    },
    // The demo resolver is synchronous, so its adapter fixture supplies the
    // same current route without moving async repository work into the GET.
    ...(demo ? { '@/lib/routeResolver': {
      normalizeRoutePath: (path: string) => path,
      resolveSiteRoute: (_site: any, path: string, options: any) => {
        const item = path.startsWith('/blog/') ? post : page;
        return site.isPublished && (readable(item) || options.previewToken) ? { type: path.startsWith('/blog/') ? 'post' : 'page', path, status: item.status, resource: { id: item.id, slug: item.slug } } : null;
      },
    } } : {}),
    '@/lib/backyStore': { ...mocks['@/lib/backyStore'], getSiteNavigation: () => ({ primary: [] }) },
  });
  for (const [path, item] of [['/page', page], ['/blog/post', post]] as const) {
    const url = `http://fixture.invalid/api/sites/${site.id}/render?path=${encodeURIComponent(path)}`;
    const read = (etag?: string, preview = false) => route.GET(new NextRequest(url + (preview ? '&previewToken=fixture' : ''), { headers: etag ? { 'if-none-match': etag } : {} }), { params: Promise.resolve({ siteId: site.id }) });
    site.isPublished = true;
    item.status = 'published';
    const published = await read();
    assert.equal(published.status, 200); checks++;
    assert.equal(published.headers.get('cache-control'), 'public, no-cache, must-revalidate'); checks++;
    const etag = published.headers.get('etag')!;
    assert.ok(etag); checks++;
    assert.equal((await read(etag)).status, 304); checks++;
    content.elements[0].props.content += ' updated';
    const updated = await read(etag);
    assert.equal(updated.status, 200); checks++;
    assert.notEqual(updated.headers.get('etag'), etag); checks++;
    const currentEtag = updated.headers.get('etag')!;
    for (const status of ['draft', 'archived', 'scheduled']) {
      item.status = status;
      Object.assign(item, { scheduledAt: new Date(Date.now() + 86400000).toISOString() });
      // An old validator must never retain withdrawn content, even on the
      // identical URL. Test both ordinary and conditional reads.
      for (const validator of [undefined, currentEtag]) {
        const withdrawn = await read(validator);
        assert.equal(withdrawn.status, 404); checks++;
        assert.equal(withdrawn.headers.get('cache-control'), 'no-store'); checks++;
        assert.equal(withdrawn.headers.has('etag'), false); checks++;
      }
    }
    item.status = 'draft';
    const preview = await read(currentEtag, true);
    assert.equal(preview.status, 200); checks++;
    assert.equal(preview.headers.get('cache-control'), 'no-store'); checks++;
    assert.equal(preview.headers.has('etag'), false); checks++;
    item.status = 'published'; site.isPublished = false;
    assert.equal((await read(currentEtag)).status, 404); checks++;
    site.isPublished = true;
  }
  for (const [path, item] of [['/page', page], ['/blog/post', post]] as const) {
    const url = `http://fixture.invalid/api/sites/${site.id}/resolve?path=${encodeURIComponent(path)}`;
    const read = (etag?: string, preview = false) => resolved.GET(new NextRequest(url + (preview ? '&previewToken=fixture' : ''), { headers: etag ? { 'if-none-match': etag } : {} }), { params: Promise.resolve({ siteId: site.id }) });
    item.status = 'published';
    const visible = await read(), etag = visible.headers.get('etag')!;
    assert.equal(visible.status, 200); assert.equal(visible.headers.get('cache-control'), 'public, no-cache, must-revalidate');
    assert.ok(etag); assert.equal((await read(etag)).status, 304); checks += 4;
    item.status = 'draft';
    const withdrawn = await read(etag);
    assert.equal(withdrawn.status, 404); assert.equal(withdrawn.headers.get('cache-control'), 'no-store'); assert.equal(withdrawn.headers.has('etag'), false); checks += 3;
    const preview = await read(etag, true);
    assert.equal(preview.status, 200); assert.equal(preview.headers.get('cache-control'), 'no-store'); checks += 2;
    item.status = 'published';
  }
}
console.log(`Public render freshness passed ${checks}: saved page/blog GET, demo/repository adapters, same-URL edits/304/withdrawal/preview/site admission. Hosted cache acceptance remains separate.`);
