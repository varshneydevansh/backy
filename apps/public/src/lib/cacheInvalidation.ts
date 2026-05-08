import type {
  BackyCacheInvalidationEvent,
  BackyCacheInvalidationScope,
  BackyRepositories,
  BackyRepositoryEntity,
} from '@backy-cms/core';

export type PublicCacheInvalidation = Pick<BackyCacheInvalidationEvent, 'scope' | 'reason' | 'revision' | 'createdAt'>;

export const publicCacheInvalidationPayload = (
  event: BackyCacheInvalidationEvent,
): PublicCacheInvalidation => ({
  scope: event.scope,
  reason: event.reason,
  revision: event.revision,
  createdAt: event.createdAt,
});

export const recordSiteCacheInvalidation = async (
  repositories: Pick<BackyRepositories, 'cacheInvalidations'>,
  input: {
    siteId: string;
    scope: BackyCacheInvalidationScope;
    entity: BackyRepositoryEntity;
    entityId?: string | null;
    reason: string;
    requestId?: string;
  },
): Promise<PublicCacheInvalidation> => publicCacheInvalidationPayload(
  await repositories.cacheInvalidations.record({
    siteId: input.siteId,
    scope: input.scope,
    entity: input.entity,
    entityId: input.entityId || input.siteId,
    reason: input.reason,
    metadata: {
      ...(input.requestId ? { requestId: input.requestId } : {}),
    },
  }),
);
