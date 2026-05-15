import type { BackyPage, BackyRepositories } from '@backy-cms/core';

type RepositoryPageReader = {
  pages: Pick<BackyRepositories['pages'], 'getBySlug' | 'list'>;
};

export const normalizePageRouteSlug = (value: string | null | undefined): string => (
  (value || 'index').trim().replace(/^\/+|\/+$/g, '') || 'index'
);

export const isHomepageRouteSlug = (slug: string): boolean => (
  slug === 'index' || slug === 'home' || slug === ''
);

export const repositoryPagePublicSlug = (page: Pick<BackyPage, 'isHomepage' | 'slug'>): string => (
  page.isHomepage || page.slug === 'index' ? 'index' : normalizePageRouteSlug(page.slug)
);

export const repositoryPagePublicPath = (page: Pick<BackyPage, 'isHomepage' | 'slug'>): string => {
  const slug = repositoryPagePublicSlug(page);
  return slug === 'index' ? '/' : `/${slug}`;
};

export async function getRepositoryPageByPublicPath(
  repositories: RepositoryPageReader,
  siteId: string,
  rawPath: string | null | undefined,
): Promise<BackyPage | null> {
  const slug = normalizePageRouteSlug(rawPath);
  if (!isHomepageRouteSlug(slug)) {
    return repositories.pages.getBySlug(siteId, slug);
  }

  const pages = await repositories.pages.list({
    siteId,
    includeUnpublished: true,
    status: 'all',
    limit: 1000,
    offset: 0,
  });
  const homepage = pages.items.find((page) => page.isHomepage);
  if (homepage) {
    return homepage;
  }

  return (
    await repositories.pages.getBySlug(siteId, 'index')
    || await repositories.pages.getBySlug(siteId, 'home')
  );
}
