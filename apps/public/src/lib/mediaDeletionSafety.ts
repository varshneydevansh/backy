import { createHash } from 'node:crypto';
import type { BackyListResult, MediaItem } from '@backy-cms/core';
import { collectCompleteExportPages } from './collectionExportPagination';
import { collectRepositoryMediaReferenceIds } from './repositoryMediaReferenceSync';

export type MediaDeletionReference = {
  scope: 'page' | 'post' | 'collectionRecord';
  targetId: string;
  collectionId?: string;
}
export interface MediaDeletionImpact {
  mediaId: string;
  referenceCount: number;
  references: MediaDeletionReference[];
  referenceFingerprint: string;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
type ContentTarget = { id: string; siteId: string; content?: unknown; meta?: unknown; featuredImageId?: string | null };
type ReferenceReadInput = { siteId: string; status: 'all'; includeUnpublished: boolean; limit: number; offset: number };
type ReferenceSource = {
  pages: { list: (input: ReferenceReadInput) => Promise<BackyListResult<ContentTarget>> };
  posts: { list: (input: ReferenceReadInput) => Promise<BackyListResult<ContentTarget>> };
  collections: {
    list: (input: ReferenceReadInput) => Promise<BackyListResult<{ id: string; siteId: string }>>;
    listRecords: (input: ReferenceReadInput & { collectionId: string }) => Promise<BackyListResult<{ id: string; siteId: string; collectionId: string; values: unknown }>>;
  };
};
/** Resolve content as well as bindings: historical reference indexes can be incomplete. */
export async function repositoryMediaDeletionReferences(repositories: ReferenceSource, media: MediaItem): Promise<MediaDeletionReference[]> {
  const siteId = media.siteId;
  const references: MediaDeletionReference[] = [];
  const [pages, posts, collections] = await Promise.all([
    collectCompleteExportPages((pagination) => repositories.pages.list({ siteId, status: 'all', includeUnpublished: true, ...pagination }), (page) => page.siteId === siteId),
    collectCompleteExportPages((pagination) => repositories.posts.list({ siteId, status: 'all', includeUnpublished: true, ...pagination }), (post) => post.siteId === siteId),
    collectCompleteExportPages((pagination) => repositories.collections.list({ siteId, status: 'all', includeUnpublished: true, ...pagination }), (collection) => collection.siteId === siteId),
  ]);
  for (const page of pages) if (collectRepositoryMediaReferenceIds({ content: page.content, meta: page.meta }).has(media.id)) references.push({ scope: 'page', targetId: page.id });
  for (const post of posts) if (post.featuredImageId === media.id || collectRepositoryMediaReferenceIds({ content: post.content, meta: post.meta }).has(media.id)) references.push({ scope: 'post', targetId: post.id });
  for (const collection of collections) {
    const records = await collectCompleteExportPages((pagination) => repositories.collections.listRecords({ siteId, collectionId: collection.id, status: 'all', includeUnpublished: true, ...pagination }), (record) => record.siteId === siteId && record.collectionId === collection.id);
    for (const record of records) if (collectRepositoryMediaReferenceIds(record.values).has(media.id)) references.push({ scope: 'collectionRecord', targetId: record.id, collectionId: collection.id });
  }
  return references;
}
export function mediaDeletionImpact(media: MediaItem, contentReferences: MediaDeletionReference[] = []): MediaDeletionImpact {
  const refs = new Map<string, MediaDeletionReference>();
  const add = (scope: MediaDeletionReference['scope'], target: unknown, collection?: unknown) => {
    const targetId = string(target), collectionId = string(collection);
    if (!targetId) return;
    const reference = { scope, targetId, ...(scope === 'collectionRecord' && collectionId ? { collectionId } : {}) };
    refs.set(JSON.stringify([scope, scope === 'collectionRecord' ? collectionId : '', targetId]), reference);
  };
  for (const [scope, key] of [['page', 'pageIds'], ['post', 'postIds']] as const) {
    const values = [media[key], media.metadata?.[key]];
    for (const value of values) if (Array.isArray(value)) for (const target of value) add(scope, target);
  }
  if ((media.scope === 'page' || media.scope === 'post') && media.scopeTargetId) add(media.scope, media.scopeTargetId);
  const bindings = media.metadata?.bindings;
  if (Array.isArray(bindings)) for (const binding of bindings) {
    if (object(binding) && ['page', 'post', 'collectionRecord'].includes(string(binding.scope))) add(binding.scope as MediaDeletionReference['scope'], binding.targetId, binding.collectionId);
  }
  for (const reference of contentReferences) add(reference.scope, reference.targetId, reference.collectionId);
  const references = [...refs.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { mediaId: media.id, referenceCount: references.length, references,
    referenceFingerprint: createHash('sha256').update(JSON.stringify([media.siteId, media.id, references])).digest('hex') };
}
export class MediaDeletionSafetyError extends Error {
  constructor(public status: number, public code: string, message: string, public impact: MediaDeletionImpact) { super(message); }
}
export function authorizeMediaDeletion(media: MediaItem, body: unknown, contentReferences: MediaDeletionReference[] = []) {
  const impact = mediaDeletionImpact(media, contentReferences);
  const input = object(body) ? body : {};
  if (input.allowReferencedDelete !== undefined && typeof input.allowReferencedDelete !== 'boolean') {
    throw new MediaDeletionSafetyError(400, 'INVALID_MEDIA_DELETE_OVERRIDE', 'allowReferencedDelete must be a boolean.', impact);
  }
  if (!impact.referenceCount) return { impact, override: null };
  if (input.allowReferencedDelete !== true) {
    throw new MediaDeletionSafetyError(409, 'MEDIA_IN_USE', 'This file is referenced by content. Remove or replace its references, or review an explicit deletion override.', impact);
  }
  const reason = string(input.reason);
  if (reason.length < 8 || reason.length > 500) throw new MediaDeletionSafetyError(400, 'INVALID_MEDIA_DELETE_OVERRIDE', 'A deletion override needs a reason between 8 and 500 characters.', impact);
  if (input.referenceFingerprint !== impact.referenceFingerprint) {
    throw new MediaDeletionSafetyError(409, 'MEDIA_REFERENCES_CHANGED', 'Review the current references before overriding this deletion.', impact);
  }
  return { impact, override: { reason, referenceFingerprint: impact.referenceFingerprint } };
}
