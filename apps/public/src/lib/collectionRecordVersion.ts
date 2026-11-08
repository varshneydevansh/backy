import { createHash } from 'node:crypto';
import { serializeBackyCollectionRecordVersion, type BackyCollectionRecord } from '@backy-cms/core';
/** Opaque authoring token covers identity, status and all nested JSON, not just wall time. */
export function collectionRecordVersion(record: BackyCollectionRecord): string {
  return `record-v1:${createHash('sha256').update(serializeBackyCollectionRecordVersion(record)).digest('hex')}`;
}
export function collectionRecordWithVersion<T extends object>(record: T): T & { version: string } {
  return { ...record, version: collectionRecordVersion(record as unknown as BackyCollectionRecord) };
}
