import type { BackyCollection, BackyCollectionRepository, BackyCollectionRecordAdmissionContext } from '@backy-cms/core';
export class CollectionRecordAdmissionUnavailableError extends Error {
  readonly code = 'COLLECTION_WRITE_UNAVAILABLE';
  constructor() { super('The collection storage cannot provide atomic record admission. Retry after the storage adapter is available.'); }
}
export function withRepositoryCollectionRecordAdmission<T>(repository: BackyCollectionRepository, siteId: string, collectionId: string, operation: (repository: BackyCollectionRepository, collection: BackyCollection, context: BackyCollectionRecordAdmissionContext) => Promise<T>): Promise<T> {
  if (typeof repository.withRecordWriteLock !== 'function') throw new CollectionRecordAdmissionUnavailableError();
  return repository.withRecordWriteLock(siteId, collectionId, operation);
}
