import type { BackySiteRepository, Site } from '@backy-cms/core';

/** Request-time publication check; legacy adapters retain their existing reads. */
export async function getRepositorySitePublication(
  repository: BackySiteRepository,
  identifier: string,
): Promise<Pick<Site, 'id' | 'slug' | 'isPublished'> | null> {
  if (repository.getPublicationByIdOrSlug) return repository.getPublicationByIdOrSlug(identifier);
  return await repository.getById(identifier) || await repository.getBySlug(identifier);
}
