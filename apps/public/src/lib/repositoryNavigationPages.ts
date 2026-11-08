import type { BackyPageRepository } from '@backy-cms/core';
import { collectCompleteExportPages } from './collectionExportPagination';
import { listRepositoryPageSummaries } from './repositoryPages';

/** A navigation link can refer to any published page, not just the first repository page. */
export function collectPublishedNavigationPages(repository: Pick<BackyPageRepository, 'list' | 'listSummaries'>, siteId: string) {
  return collectCompleteExportPages(
    ({ limit, offset }) => listRepositoryPageSummaries(repository, { siteId, includeUnpublished: false, status: 'published', limit, offset }),
    page => page.siteId === siteId,
  );
}
