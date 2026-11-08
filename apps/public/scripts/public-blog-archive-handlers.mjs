import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './collection-import-postgres-handlers.mjs';
const require = createRequire(import.meta.url), { NextRequest } = require('next/server');

export async function verifyPublicBlogArchiveHandlers({ repositories, owner, siteId, categoryId, tagId, queries }) {
  let fullReads = 0, repositoryReads = 0, missing = false, checks = 0;
  const forbidden = () => { fullReads++; throw Error('Full-content fallback forbidden'); };
  const storage = { getBlogPosts: forbidden, getSiteByIdOrSlug: forbidden, listBlogCategories: forbidden, listBlogTags: forbidden, validatePreviewToken: forbidden };
  const runtime = { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => {
    repositoryReads++;
    return { ...repositories,
      sites: { ...repositories.sites, getById: forbidden, getBySlug: forbidden },
      posts: { ...repositories.posts, list: forbidden, ...(missing ? { listPublicArchiveMetadata: undefined } : {}) },
      blogTaxonomy: { ...repositories.blogTaxonomy, listCategories: forbidden, listTags: forbidden },
    };
  } };
  const route = load('../src/app/api/sites/[siteId]/blog/route.ts', {
    '@/lib/backyStore': storage, './backyStore': storage,
    '@/lib/repositoryRuntime': runtime, './repositoryRuntime': runtime,
    '@/lib/frontendDesignContract': { frontendDesignProvenanceFromMetadata: forbidden },
    '@/lib/previewTokenAudit': { recordPreviewTokenUse: forbidden },
  });
  async function call(query = 'profile=archive&limit=2', headers) {
    const response = await route.GET(new NextRequest(`http://fixture.invalid/api/sites/${siteId}/blog?${query}`, { headers }), { params: Promise.resolve({ siteId }) });
    const raw = await response.text();
    return { response, body: raw ? JSON.parse(raw) : null, bytes: Buffer.byteLength(raw) };
  }
  const first = await call();
  assert.equal(first.response.status, 200); assert.equal(first.response.headers.get('x-backy-blog-profile'), 'archive.v1'); assert.equal(first.response.headers.get('x-backy-site-id'), siteId); assert.equal(first.response.headers.get('cache-control'), 'public, no-cache, must-revalidate'); checks += 4;
  assert.equal(first.body.data.posts.length, 2); assert.equal(first.body.data.pagination.total, 14); checks += 2;
  assert.deepEqual(Object.keys(first.body.data.facets.tags[0]).sort(), ['id', 'name', 'siteId', 'slug']); assert(!JSON.stringify(first.body).includes('PRIVATE_OWNER')); assert(!JSON.stringify(first.body).includes('postCount')); checks += 3;
  const filter = await call('profile=archive&categorySlug=notes&tagSlug=cpp&limit=2'); assert.equal(filter.response.status, 200); assert.equal(filter.body.data.filters.categoryId, categoryId); assert.equal(filter.body.data.filters.tagId, tagId); assert(filter.body.data.posts.every(post => post.categoryIds.includes(categoryId) && post.tagIds.includes(tagId))); checks += 4;
  const before = queries.length, unknown = await call('profile=archive&tagSlug=missing'); assert.equal(unknown.response.status, 200); assert.equal(unknown.body.data.pagination.total, 0); assert.equal(unknown.body.data.posts.length, 0); assert(queries.slice(before).every(query => !query.includes('from "blog_posts"'))); checks += 4;
  for (const q of ['profile=other', 'profile=archive&slug=hidden', 'profile=archive&previewToken=secret', 'profile=archive&status=draft', 'profile=archive&limit=101', 'profile=archive&tagSlug=a&tagSlug=b', 'profile=archive&q=a&search=b']) {
    const before = repositoryReads, invalid = await call(q); assert.equal(invalid.response.status, 400); assert.equal(repositoryReads, before); checks += 2;
  }
  const unchanged = await call('profile=archive&limit=2', { 'if-none-match': first.response.headers.get('etag') }); assert.equal(unchanged.response.status, 304); checks++;
  await owner.query('update sites set is_published=false where id=$1', [siteId]); const withdrawn = await call(); assert.equal(withdrawn.response.status, 404); assert.equal(withdrawn.response.headers.get('cache-control'), 'no-store'); checks += 2;
  await owner.query('update sites set is_published=true where id=$1', [siteId]);
  missing = true; const unsupported = await call(); assert.equal(unsupported.response.status, 503); assert.equal(unsupported.body.error.code, 'BLOG_ARCHIVE_UNAVAILABLE'); checks += 2;
  assert.equal(fullReads, 0); checks++;
  return { passed: true, checks, firstResponseBytes: first.bytes, fullReadFallbacks: fullReads, actualRoute: true, actualDatabaseRepositories: true, boundary: 'Actual public route/profile and local SQL repositories. Network and provider billing are not tested.' };
}
