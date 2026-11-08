import type { NextResponse } from 'next/server';
import type { BackyBlogArchiveTerm, BackyPostArchiveMetadata } from '@backy-cms/core';
import { getBlogPosts, getSiteByIdOrSlug, listBlogCategories, listBlogTags } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { publicContractJson } from './publicContractResponse';

export const BLOG_ARCHIVE_PROFILE = 'archive.v1';
const PROFILE_SCHEMA = 'backy.blog-archive-profile.v1';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const identity = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 200 && !/\p{Cc}/u.test(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const keys = new Set(['profile', 'q', 'search', 'categorySlug', 'tagSlug', 'limit', 'offset']);
function query(params: URLSearchParams) {
  for (const key of params.keys()) if (!keys.has(key) || params.getAll(key).length !== 1) throw Error('Invalid archive query');
  if (params.get('profile') !== 'archive' || params.has('q') && params.has('search')) throw Error('Invalid archive profile');
  const field = (key: string) => { const value = (params.get(key) || '').trim(); if (value.length > 200 || /\p{Cc}/u.test(value)) throw Error('Invalid archive filter'); return value; };
  const integer = (key: string, fallback: number, minimum: number, maximum: number) => {
    const value = params.get(key); if (value === null) return fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) throw Error('Invalid archive pagination');
    return Number(value);
  };
  return { search: field(params.has('q') ? 'q' : 'search'), categorySlug: field('categorySlug'), tagSlug: field('tagSlug'), limit: integer('limit', 12, 1, 100), offset: integer('offset', 0, 0, 10_000_000) };
}
function terms(input: unknown, siteId: string): BackyBlogArchiveTerm[] {
  if (!Array.isArray(input) || input.length > 10000) throw Error('Invalid archive terms');
  const ids = new Set<string>(), slugs = new Set<string>();
  return input.map(value => {
    const term = object(value);
    if (term.siteId !== siteId || !identity(term.id) || !identity(term.slug) || !text(term.name, 500) || !term.name.trim() || ids.has(term.id) || slugs.has(term.slug)) throw Error('Invalid archive term');
    ids.add(term.id); slugs.add(term.slug);
    return { id: term.id, siteId, slug: term.slug, name: term.name };
  });
}
function projectPost(value: unknown, siteId: string, now: number): BackyPostArchiveMetadata {
  const post = object(value), meta = object(post.meta);
  const date = (value: unknown): value is string | null | undefined => value == null || typeof value === 'string' && Number.isFinite(Date.parse(value));
  const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 1000 && value.every(identity);
  const due = post.status === 'scheduled' && typeof post.scheduledAt === 'string' && Number.isFinite(Date.parse(post.scheduledAt)) && Date.parse(post.scheduledAt) <= now;
  if (post.siteId !== siteId || !identity(post.id) || !identity(post.slug) || !text(post.title, 2000) || !post.title.trim()
    || post.excerpt != null && !text(post.excerpt, 20000) || !(post.status === 'published' || due)
    || !date(post.publishedAt) || !date(post.scheduledAt) || !ids(post.categoryIds) || !ids(post.tagIds)) throw Error('Invalid archive post');
  return { id: post.id, siteId, slug: post.slug, title: post.title, excerpt: (post.excerpt ?? null) as string | null,
    status: post.status as BackyPostArchiveMetadata['status'], publishedAt: (post.publishedAt ?? null) as string | null,
    scheduledAt: (post.scheduledAt ?? null) as string | null, categoryIds: post.categoryIds, tagIds: post.tagIds,
    meta: typeof meta.originalPublishedAt === 'string' && meta.originalPublishedAt.length <= 64 ? { originalPublishedAt: meta.originalPublishedAt } : {},
  };
}

/** Explicit summary profile; absent narrow capabilities must never trigger full reads. */
export async function publicBlogArchive(request: Request, siteIdentifier: string, requestId: string): Promise<NextResponse> {
  const error = (status: number, code: string, message: string) => publicContractJson({ success: false, requestId, error: { code, message } }, { status, requestId, cache: 'error' });
  let filters: ReturnType<typeof query>;
  try { filters = query(new URL(request.url).searchParams); } catch { return error(400, 'INVALID_BLOG_ARCHIVE_QUERY', 'Choose one valid archive search, category, topic and page.'); }
  try {
    const now = Date.now(), asOf = new Date(now).toISOString();
    const demo = shouldUseDemoStoreFallback(), repositories = demo ? null : await getRequiredDatabaseRepositories();
    if (repositories && (!repositories.sites.getPublicationByIdOrSlug || !repositories.posts.listPublicArchiveMetadata || !repositories.blogTaxonomy.listArchiveTerms)) throw Error('Narrow archive capabilities unavailable');
    const site = repositories ? await repositories.sites.getPublicationByIdOrSlug!(siteIdentifier) : getSiteByIdOrSlug(siteIdentifier);
    if (!site || site.isPublished !== true) return error(404, 'SITE_NOT_FOUND', 'Site not found.');
    const source = repositories ? await repositories.blogTaxonomy.listArchiveTerms!(site.id) : { categories: listBlogCategories(site.id), tags: listBlogTags(site.id) };
    const facets = { categories: terms(source.categories, site.id), tags: terms(source.tags, site.id) };
    const category = facets.categories.find(term => term.slug === filters.categorySlug), tag = facets.tags.find(term => term.slug === filters.tagSlug);
    const missing = Boolean(filters.categorySlug && !category || filters.tagSlug && !tag);
    const input = { siteId: site.id, asOf, search: filters.search || undefined, categoryId: category?.id, tagId: tag?.id, limit: filters.limit, offset: filters.offset };
    const result = missing ? { items: [], pagination: { total: 0, limit: filters.limit, offset: filters.offset, hasMore: false } } : repositories
      ? await repositories.posts.listPublicArchiveMetadata!(input)
      : (() => { const data = getBlogPosts(site.id, input); return { items: data.posts, pagination: data.pagination }; })();
    const p = result.pagination;
    if (!p || !Number.isSafeInteger(p.total) || p.total < 0 || p.limit !== filters.limit || p.offset !== filters.offset
      || p.hasMore !== (filters.offset + filters.limit < p.total)
      || result.items.length !== Math.min(filters.limit, Math.max(0, p.total - filters.offset))) throw Error('Invalid archive pagination');
    const posts = result.items.map(post => projectPost(post, site.id, now));
    if (new Set(posts.map(post => post.id)).size !== posts.length || new Set(posts.map(post => post.slug)).size !== posts.length
      || posts.some(post => category && !post.categoryIds.includes(category.id) || tag && !post.tagIds.includes(tag.id))) throw Error('Invalid archive inventory');
    const data = { posts, facets, pagination: p,
      filters: { q: filters.search || null, categorySlug: filters.categorySlug || null, tagSlug: filters.tagSlug || null, categoryId: category?.id || null, tagId: tag?.id || null },
      responseProfile: { schemaVersion: PROFILE_SCHEMA, name: 'archive' },
    };
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 4_000_000) throw Error('Archive result too large');
    return publicContractJson({ success: true, requestId, data }, { requestId, request, cache: 'render', siteId: site.id, headers: { 'x-backy-blog-profile': BLOG_ARCHIVE_PROFILE } });
  } catch { return error(503, 'BLOG_ARCHIVE_UNAVAILABLE', 'The lightweight writing archive is unavailable. Please try again later.'); }
}
