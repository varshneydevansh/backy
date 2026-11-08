import { createHash } from 'node:crypto';
import { serializeBackyCollectionVersion, type BackyCollection } from '@backy-cms/core';
export const collectionDefinitionVersion = (collection: BackyCollection): string => `collection-v1:${createHash('sha256').update(serializeBackyCollectionVersion(collection)).digest('hex')}`;
export const collectionDefinitionWithVersion = <T extends BackyCollection>(collection: T): T & { version: string } => ({ ...collection, version: collectionDefinitionVersion(collection) });
export function assertBackyCollectionExpectation(collection: BackyCollection, input: { expectedVersion?: string; expectedCollection?: BackyCollection }) {
  if ((input.expectedVersion !== undefined && collectionDefinitionVersion(collection) !== input.expectedVersion)
    || (input.expectedCollection !== undefined && collectionDefinitionVersion(collection) !== collectionDefinitionVersion(input.expectedCollection)))
    throw Object.assign(Error('The collection changed. Reload before saving.'), { code: 'COLLECTION_DEFINITION_CONFLICT' });
}
