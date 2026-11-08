/** Public RSS: complete bounded reads, current eligibility and original publication dates. */
import { NextRequest } from 'next/server';
import { getBlogPosts, getSiteByIdOrSlug, listBlogAuthors, listBlogCategories, listBlogTags } from '@/lib/backyStore';
import { buildBlogRssXml, normalizeRepositoryPostForRss, sortBlogRssPosts, type BlogRssPost } from '@/lib/blogRss';
import { createPublicCacheRevision, publicContractResponse } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { createSearchMetadataCollector, SearchMetadataIncompleteError } from '@/lib/searchMetadata';
import { admitPublicDiscoveryRoutes, isDiscoveryReadable, withPublicDiscoveryRead, PublicDiscoveryIncompleteError, PublicDiscoveryWithdrawnError, type PublicDiscoverySite } from '@/lib/publicDiscoveryRead';
import type { SeoRoute } from '@/lib/seoDiscovery';

interface RouteParams { params: Promise<{ siteId: string }> }
const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '25', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 25;
};
const textResponse = (body: string, status: number, requestId: string, siteId?: string) => publicContractResponse(body,
  { status, requestId, cache: 'error', siteId }, { headers: { 'content-type': 'text/plain; charset=utf-8' } });

function feedPosts(posts: BlogRssPost[], site: PublicDiscoverySite, origin: string, limit: number) {
  if (new Set(posts.map(post => post.id)).size !== posts.length) throw new PublicDiscoveryIncompleteError();
  const routes: SeoRoute[] = posts.map(post => {
    const meta = post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta) ? post.meta as Record<string, unknown> : {};
    const title = typeof meta.title === 'string' && meta.title ? meta.title : post.title;
    const description = typeof meta.description === 'string' ? meta.description : post.excerpt || '';
    return { type: 'post', id: post.id, title, description, path: `/blog/${post.slug}`,
      canonical: typeof meta.canonical === 'string' && meta.canonical ? meta.canonical : `/blog/${post.slug}`,
      status: 'published', updatedAt: post.updatedAt || undefined, priority: 0.7, changeFrequency: 'weekly',
      robots: { index: meta.noIndex !== true, follow: meta.noFollow !== true },
      openGraph: { title, description }, keywords: [], jsonLd: [] };
  });
  const eligible = new Map(admitPublicDiscoveryRoutes(routes, site, origin).filter(route => route.robots.index).map(route => [route.id, route]));
  const projected = posts.flatMap(post => {
    const route = eligible.get(post.id);
    if (!route) return [];
    const meta = post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta) ? post.meta as Record<string, unknown> : {};
    return [{ ...post, title: route.title, excerpt: route.description || post.excerpt,
      meta: { ...meta, canonical: route.canonicalUrl } }];
  });
  // Eligibility and original-publication ordering precede the requested window.
  return sortBlogRssPosts(projected).slice(0, limit);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  try {
    const { siteId } = await params;
    const origin = new URL(request.url).origin;
    const limit = parseLimit(new URL(request.url).searchParams.get('limit'));
    let xml: string, revision: string, resolvedSiteId: string;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const initial = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!initial?.isPublished) return textResponse('Not found', 404, requestId, initial?.id);
      const snapshot = await withPublicDiscoveryRead(repositories, initial, async site => {
        const collect = createSearchMetadataCollector();
        const posts = [];
        for (const status of ['published', 'scheduled'] as const) {
          posts.push(...await collect(input => repositories.posts.list({ ...input, siteId: site.id, status, includeUnpublished: true }), item => item.siteId === site.id && item.status === status));
        }
        const [categories, tags, authors] = await Promise.all([
          repositories.blogTaxonomy.listCategories(site.id), repositories.blogTaxonomy.listTags(site.id), repositories.blogTaxonomy.listAuthors(site.id),
        ]);
        const selected = feedPosts(posts.filter(post => isDiscoveryReadable(post)).map(normalizeRepositoryPostForRss), site, origin, limit);
        return buildBlogRssXml({ site, posts: selected, categories, tags, authors, origin, feedPath: '/blog/rss.xml' });
      });
      xml = snapshot.value; resolvedSiteId = snapshot.site.id;
      revision = createPublicCacheRevision({ xml, revision: snapshot.revision });
    } else {
      const site = getSiteByIdOrSlug(siteId);
      if (!site?.isPublished) return textResponse('Not found', 404, requestId, site?.id);
      const read = async () => {
        const collect = createSearchMetadataCollector();
        const posts = await collect(async input => {
          const result = getBlogPosts(site.id, { ...input, includeUnpublished: true });
          if (!result.pagination) throw new PublicDiscoveryIncompleteError();
          return { items: result.posts, pagination: result.pagination };
        }, item => item.siteId === site.id);
        const categories = listBlogCategories(site.id), tags = listBlogTags(site.id), authors = listBlogAuthors(site.id);
        return { posts, categories, tags, authors };
      };
      const before = createPublicCacheRevision(site), data = await read();
      const selected = feedPosts(data.posts.filter(post => isDiscoveryReadable(post)), site, origin, limit);
      xml = buildBlogRssXml({ site, posts: selected, categories: data.categories, tags: data.tags, authors: data.authors, origin, feedPath: '/blog/rss.xml' });
      const current = getSiteByIdOrSlug(site.id), rechecked = await read();
      if (!current?.isPublished) return textResponse('Not found', 404, requestId, site.id);
      if (before !== createPublicCacheRevision(current) || createPublicCacheRevision(data) !== createPublicCacheRevision(rechecked)) throw new PublicDiscoveryIncompleteError();
      resolvedSiteId = site.id; revision = createPublicCacheRevision({ site, xml });
    }
    return publicContractResponse(xml, { requestId, request, cache: 'render', schemaVersion: 'rss.2.0', siteId: resolvedSiteId,
      cacheRevision: revision, etagSeed: { xml, revision } }, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
  } catch (error) {
    if (error instanceof PublicDiscoveryWithdrawnError) return textResponse('Not found', 404, requestId);
    if (error instanceof PublicDiscoveryIncompleteError || error instanceof SearchMetadataIncompleteError) return textResponse('Public feed temporarily unavailable', 503, requestId);
    console.error('Blog RSS API error:', error);
    return textResponse('Internal server error', 500, requestId);
  }
}
