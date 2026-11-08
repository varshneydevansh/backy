import type { BackyListResult, BackyRepositories } from '@backy-cms/core';
import { backyCollectionSearchValueKeys } from '@backy-cms/core';
import type { SeoRoute } from './seoDiscovery';
import { type PageHierarchyNode } from './pageHierarchy';
import { listRepositoryPageSummaries } from './repositoryPages';
import { collectCompleteExportPages } from './collectionExportPagination';

// Bound every candidate read, including scheduled entries that are not due yet.
// Exceeding the budget rejects the entire index rather than returning partial hits.
export const SEARCH_METADATA_ENTRY_BUDGET = 10_000;
export class SearchMetadataIncompleteError extends Error {
  constructor() { super('The complete search metadata could not be verified. Retry after content changes finish.'); }
}

/** Public editorial fields only; never stringify source/proposal/variant metadata. */
export function collectionRecordSearchMetadata(values: Record<string, unknown>): { description: string; keywords: string[] } {
  const clean = (value: string, max: number): string => {
    const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/gu, '').replace(/\s+/gu, ' ').trim();
    if (text.length > max) throw new SearchMetadataIncompleteError();
    return text;
  };
  let visited = 0;
  const captionText = (value: unknown, depth = 0): string => {
    if (++visited > 256 || depth > 12) throw new SearchMetadataIncompleteError();
    if (typeof value === 'string') return clean(value, 4000);
    if (Array.isArray(value)) return clean(value.map(item => captionText(item, depth + 1)).filter(Boolean).join(' '), 4000);
    if (!value || typeof value !== 'object') return '';
    const node = value as Record<string, unknown>;
    return typeof node.text === 'string' ? clean(node.text, 4000) : captionText(node.children || [], depth + 1);
  };
  const explicit = values.description || values.summary || values.excerpt;
  const description = typeof explicit === 'string' && explicit.trim() ? clean(explicit, 4000) : captionText(values.caption);
  const keywords: string[] = [];
  if (Array.isArray(values.tags)) {
    if (values.tags.length > 100) throw new SearchMetadataIncompleteError();
    for (const value of values.tags) {
      if (typeof value !== 'string') continue;
      const keyword = clean(value, 200);
      if (keyword && !keywords.includes(keyword)) keywords.push(keyword);
    }
  }
  return { description, keywords };
}

export function createSearchMetadataCollector(budget = SEARCH_METADATA_ENTRY_BUDGET) {
  let remaining = budget;
  return async function collect<T extends { id: string }>(
    read: (input: { limit: number; offset: number }) => Promise<BackyListResult<T>>,
    accepts: (item: T) => boolean,
  ): Promise<T[]> {
    let reserved = false;
    try {
      return await collectCompleteExportPages(async input => {
        const page = await read(input);
        if (!reserved) {
          if (!Number.isSafeInteger(page?.pagination?.total) || page.pagination.total < 0
            || page.pagination.total > remaining) throw new SearchMetadataIncompleteError();
          remaining -= page.pagination.total;
          reserved = true;
        }
        return page;
      }, accepts);
    } catch { throw new SearchMetadataIncompleteError(); }
  };
}

export type SearchMetadataRoute = Pick<SeoRoute,
  'type' | 'id' | 'title' | 'description' | 'path' | 'canonical' | 'robots' | 'keywords'
> & { status: 'published' };

// Explicit allowlist: no canvas, body, media, JSON-LD or editable metadata.
export const projectSearchMetadataRoutes = (routes: SeoRoute[]): SearchMetadataRoute[] => routes
  .filter(route => route.robots.index)
  .map(route => ({
    type: route.type, id: route.id, title: route.title, description: route.description,
    path: route.path, canonical: route.canonical, status: 'published',
    robots: { index: route.robots.index, follow: route.robots.follow },
    keywords: route.keywords.filter(term => typeof term === 'string' && term.trim().length > 0),
  }));

export type SearchMetadataRepositories = Pick<BackyRepositories, 'pages' | 'posts' | 'collections'>;

export async function readRepositorySearchSite(repository: BackyRepositories['sites'], identifier: string) {
  if (!repository.getSearchMetadataByIdOrSlug) throw new SearchMetadataIncompleteError();
  try { return await repository.getSearchMetadataByIdOrSlug(identifier); }
  catch { throw new SearchMetadataIncompleteError(); }
}

export async function collectRepositorySearchContent(repositories: SearchMetadataRepositories, siteId: string) {
  // Older adapters must fail closed instead of silently fetching every body.
  if (!repositories.pages.listSearchMetadata || !repositories.posts.listSearchMetadata
    || !repositories.collections.listSearchMetadata || !repositories.collections.listRecordSearchMetadata) throw new SearchMetadataIncompleteError();
  const collect = createSearchMetadataCollector();
  if (!repositories.pages.listRouteMetadata) throw new SearchMetadataIncompleteError();
  const pageInventory = await collect(input => repositories.pages.listRouteMetadata!({ ...input, siteId, status: 'all', includeUnpublished: true }), item => item.siteId === siteId);
  const pages = [], posts = [];
  // Explicit status reads include already-due schedules; ordinary public list
  // repository predicates only select status=published.
  for (const status of ['published', 'scheduled'] as const) {
    pages.push(...await collect(input => repositories.pages.listSearchMetadata!({ ...input, siteId, status }), item => item.siteId === siteId && item.status === status));
    posts.push(...await collect(input => repositories.posts.listSearchMetadata!({ ...input, siteId, status }), item => item.siteId === siteId && item.status === status));
  }
  const collections = (await collect(input => repositories.collections.listSearchMetadata!({ ...input, siteId }), item => item.siteId === siteId && item.status === 'published'))
    .filter(collection => collection.permissions.publicRead);
  const dynamicItems = [];
  for (const collection of collections) {
    const valueKeys = backyCollectionSearchValueKeys(collection.metadata);
    for (const status of ['published', 'scheduled'] as const) {
      const records = await collect(input => repositories.collections.listRecordSearchMetadata!({ ...input, siteId, collectionId: collection.id, status, valueKeys }), item => item.siteId === siteId && item.collectionId === collection.id && item.status === status);
      dynamicItems.push(...records.map(record => ({ collection, record })));
    }
  }
  return { pages, pageInventory, posts, collections, dynamicItems };
}

export async function collectRepositoryDiscoveryContent(repositories: SearchMetadataRepositories, siteId: string) {
  const collect = createSearchMetadataCollector();
  // Private ancestors are route containers only. Only minimal route fields
  // leave this function; their title/body/meta never enter public projection.
  const allPages = await collect(input => listRepositoryPageSummaries(repositories.pages, { ...input, siteId, status: 'all', includeUnpublished: true }), item => item.siteId === siteId);
  const pages = allPages.filter(page => page.status === 'published' || page.status === 'scheduled'), posts = [];
  // Explicit status reads include already-due schedules; ordinary public list
  // repository predicates only select status=published.
  for (const status of ['published', 'scheduled'] as const) {
    posts.push(...await collect(input => repositories.posts.list({ ...input, siteId, status, includeUnpublished: true }), item => item.siteId === siteId && item.status === status));
  }
  const collections = (await collect(input => repositories.collections.list({ ...input, siteId, status: 'published', includeUnpublished: false }), item => item.siteId === siteId && item.status === 'published'))
    .filter(collection => collection.permissions.publicRead);
  const dynamicItems = [];
  for (const collection of collections) {
    for (const status of ['published', 'scheduled'] as const) {
      const records = await collect(input => repositories.collections.listRecords({ ...input, siteId, collectionId: collection.id, status, includeUnpublished: true }), item => item.siteId === siteId && item.collectionId === collection.id && item.status === status);
      dynamicItems.push(...records.map(record => ({ collection, record })));
    }
  }
  const pageInventory: PageHierarchyNode[] = allPages.map(page => ({ id: page.id, siteId: page.siteId, slug: page.slug, parentId: page.parentId, isHomepage: page.isHomepage }));
  return { pages, pageInventory, posts, collections, dynamicItems };
}
