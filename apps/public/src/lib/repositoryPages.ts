import type { BackyPage, BackyPageSummary, BackyPageRouteMetadata, BackyPageListInput, BackyListResult, BackyRepositories } from '@backy-cms/core';
import { collectCompleteExportPages } from './collectionExportPagination';
import { findPageByHierarchyPath, normalizeHierarchyPath, pageHierarchyPaths, PAGE_HIERARCHY_MAX_DEPTH } from './pageHierarchy';

type RepositoryPageReader = {
  pages: Pick<BackyRepositories['pages'], 'getBySlug' | 'getById' | 'list' | 'getSummaryBySlug' | 'getSummaryById' | 'listSummaries'>;
};

export const normalizePageRouteSlug = (value: string | null | undefined): string => (
  (value || 'index').trim().replace(/^\/+|\/+$/g, '') || 'index'
);

export const isHomepageRouteSlug = (slug: string): boolean => (
  slug === 'index' || slug === 'home' || slug === ''
);

type PublicPathPage = Pick<BackyPage, 'id' | 'siteId' | 'isHomepage' | 'slug' | 'parentId'>;

/** Child paths require verified retained ancestry; a missing parent is never a leaf shortcut. */
export const repositoryPagePublicPath = (page: PublicPathPage, inventory: readonly PublicPathPage[] = [page]): string | null => (
  pageHierarchyPaths(inventory, page.siteId).get(page.id) || null
);

export const repositoryPagePublicSlug = (page: PublicPathPage, inventory: readonly PublicPathPage[] = [page]): string | null => {
  const path = repositoryPagePublicPath(page, inventory);
  return path === null ? null : path === '/' ? 'index' : path.slice(1);
};

type HierarchyPageReader<T extends PublicPathPage> = {
  getById(siteId: string, pageId: string): Promise<T | null>;
  getBySlug(siteId: string, slug: string): Promise<T | null>;
  list(input: BackyPageListInput): Promise<BackyListResult<T>>;
};

async function readRepositoryPageByPublicPath<T extends PublicPathPage>(
  reader: HierarchyPageReader<T>, siteId: string, rawPath: string | null | undefined,
): Promise<T | null> {
  const slug = normalizePageRouteSlug(rawPath);
  if (!normalizeHierarchyPath(slug)) return null;
  if (!isHomepageRouteSlug(slug)) {
    // Leaf slugs remain site-unique in the repository. Retain legacy root pages
    // whose slug already includes slashes, but reject a competing real hierarchy.
    const slugs = [...new Set([slug, slug.split('/').at(-1)!])];
    const candidates = (await Promise.all(slugs.map(value => reader.getBySlug(siteId, value))) as Array<T | null>)
      .filter((page): page is T => Boolean(page && page.siteId === siteId));
    const uniqueCandidates = [...new Map(candidates.map(page => [page.id, page])).values()];
    const inventory = new Map(uniqueCandidates.map(page => [page.id, page]));
    for (const page of uniqueCandidates) {
      let current = page;
      const seen = new Set<string>();
      for (let depth = 0; current.parentId && depth < PAGE_HIERARCHY_MAX_DEPTH; depth++) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        const parentId = current.parentId;
        let parent = inventory.get(parentId);
        if (!parent) {
          const loaded = await reader.getById(siteId, parentId);
          if (!loaded || loaded.id !== parentId || loaded.siteId !== siteId) break;
          parent = loaded;
          inventory.set(parent.id, parent);
        }
        current = parent;
      }
    }
    return findPageByHierarchyPath(uniqueCandidates, siteId, slug, [...inventory.values()]);
  }

  const pages = await collectCompleteExportPages(
    async ({ limit, offset }) => {
      const result = await reader.list({ siteId, includeUnpublished: true, status: 'all', limit, offset });
      if (result.pagination.total > 10_000) throw new Error('Page hierarchy inventory exceeds its read budget');
      return result;
    },
    page => page.siteId === siteId,
  );
  const homepages = pages.filter(page => page.isHomepage);
  if (homepages.length) return homepages.length === 1 ? homepages[0] : null;

  return findPageByHierarchyPath(pages.filter(page => page.slug === 'index'), siteId, '/', pages)
    || findPageByHierarchyPath(pages, siteId, '/home');
}

/** Select Home without loading every canvas; fetch only its authoritative body. */
export async function getRepositoryPageByPublicPath(repositories: RepositoryPageReader, siteId: string, rawPath: string | null | undefined): Promise<BackyPage | null> {
  const pages = repositories.pages;
  if (!isHomepageRouteSlug(normalizePageRouteSlug(rawPath)) || !pages.listSummaries) {
    return readRepositoryPageByPublicPath(pages, siteId, rawPath);
  }
  const selected = await readRepositoryPageByPublicPath({
    getById: (sid, id) => pages.getById(sid, id),
    getBySlug: (sid, slug) => pages.getBySlug(sid, slug),
    list: input => pages.listSummaries!(input),
  }, siteId, rawPath);
  if (!selected) return null;
  const page = await pages.getById(siteId, selected.id);
  // A move, withdrawal or replacement between reads must not serve stale routing.
  if (!page || page.siteId !== siteId || page.id !== selected.id
    || page.slug !== selected.slug || page.parentId !== selected.parentId
    || page.isHomepage !== selected.isHomepage || page.status !== selected.status
    || page.updatedAt !== selected.updatedAt) return null;
  return page;
}

export function listRepositoryPageSummaries(pages: Pick<BackyRepositories['pages'], 'list' | 'listSummaries'>, input: BackyPageListInput): Promise<BackyListResult<BackyPageSummary>> {
  return pages.listSummaries ? pages.listSummaries(input) : pages.list(input);
}

/** Same hierarchy/ambiguity checks without loading candidate or ancestor canvases. */
export function getRepositoryPageSummaryByPublicPath(repositories: RepositoryPageReader, siteId: string, rawPath: string | null | undefined): Promise<BackyPageSummary | null> {
  const pages = repositories.pages;
  if (!pages.getSummaryById || !pages.getSummaryBySlug || !pages.listSummaries) return getRepositoryPageByPublicPath(repositories, siteId, rawPath);
  return readRepositoryPageByPublicPath({
    getById: (sid, id) => pages.getSummaryById!(sid, id),
    getBySlug: (sid, slug) => pages.getSummaryBySlug!(sid, slug),
    list: input => pages.listSummaries!(input),
  }, siteId, rawPath);
}

/** Strict admission uses the same retained ancestry and ambiguity rules, without owner metadata. */
export function getRepositoryPageRouteMetadataByPublicPath(
  pages: Pick<BackyRepositories['pages'], 'getRouteMetadataById' | 'getRouteMetadataBySlug' | 'listRouteMetadata'>,
  siteId: string, rawPath: string,
): Promise<BackyPageRouteMetadata | null> {
  if (!pages.getRouteMetadataById || !pages.getRouteMetadataBySlug || !pages.listRouteMetadata) throw Error('Page admission capabilities unavailable');
  return readRepositoryPageByPublicPath({
    getById: (sid, id) => pages.getRouteMetadataById!(sid, id),
    getBySlug: (sid, slug) => pages.getRouteMetadataBySlug!(sid, slug),
    list: input => pages.listRouteMetadata!(input),
  }, siteId, rawPath);
}
