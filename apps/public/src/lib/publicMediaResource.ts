import type { MediaItem } from '@backy-cms/core';
import { withResponsiveMediaManifest, type MediaWithResponsiveManifest } from '@/lib/mediaResponsive';
import { normalizeMediaScope } from '@/lib/mediaScope';

type PublicMediaBindingRecord = {
  id: string;
  mediaId: string;
  scope: 'page' | 'post';
  targetId: string;
  usageType: string;
  attachedBy: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicMediaReferenceTarget = {
  id: string;
  usageTypes: string[];
  bindings: PublicMediaBindingRecord[];
};

export type PublicMediaReferences = {
  schemaVersion: 'backy.media.references.v1';
  global: boolean;
  scoped: boolean;
  scopes: Array<'global' | 'page' | 'post'>;
  pageIds: string[];
  postIds: string[];
  pages: PublicMediaReferenceTarget[];
  posts: PublicMediaReferenceTarget[];
  usageTypes: string[];
  totalBindings: number;
};

export type PublicMediaEditableMetadata = {
  schemaVersion: 'backy.media.editable-metadata.v1';
  title: string | null;
  altText: string | null;
  caption: string | null;
  tags: string[];
  folderId: string | null;
  scope: 'global' | 'page' | 'post';
  scopeTargetId: string | null;
  visibility: string;
  metadata: MediaItem['metadata'];
};

export type PublicMediaAsset = MediaWithResponsiveManifest & {
  references: PublicMediaReferences;
  referenceSummary: {
    pageCount: number;
    postCount: number;
    usageTypes: string[];
    global: boolean;
    scoped: boolean;
  };
  editableMetadata: PublicMediaEditableMetadata;
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const uniqueStrings = (values: unknown[]): string[] => (
  Array.from(new Set(values
    .flatMap((value) => (typeof value === 'string' ? value.split(/[,\n]/g) : []))
    .map((value) => value.trim())
    .filter(Boolean)))
);

const bindingRecordsFromMetadata = (media: MediaItem): PublicMediaBindingRecord[] => {
  const bindings = media.metadata?.bindings;
  if (!Array.isArray(bindings)) {
    return [];
  }

  return bindings
    .filter((binding): binding is Record<string, unknown> => (
      !!binding && typeof binding === 'object' && !Array.isArray(binding)
    ))
    .map((binding): PublicMediaBindingRecord | null => {
      const scope = binding.scope === 'page' || binding.scope === 'post' ? binding.scope : null;
      const targetId = stringValue(binding.targetId);
      if (!scope || !targetId) {
        return null;
      }

      return {
        id: stringValue(binding.id) || `${media.id}_${scope}_${targetId}`,
        mediaId: stringValue(binding.mediaId) || media.id,
        scope,
        targetId,
        usageType: stringValue(binding.usageType) || 'content',
        attachedBy: stringValue(binding.attachedBy),
        ...(stringValue(binding.createdAt) ? { createdAt: stringValue(binding.createdAt) || undefined } : {}),
        ...(stringValue(binding.updatedAt) ? { updatedAt: stringValue(binding.updatedAt) || undefined } : {}),
      };
    })
    .filter((binding): binding is PublicMediaBindingRecord => !!binding);
};

const referenceTargets = (
  ids: string[],
  bindings: PublicMediaBindingRecord[],
): PublicMediaReferenceTarget[] => ids.map((id) => {
  const targetBindings = bindings.filter((binding) => binding.targetId === id);
  return {
    id,
    usageTypes: uniqueStrings(targetBindings.map((binding) => binding.usageType)),
    bindings: targetBindings,
  };
});

export const buildPublicMediaReferences = (media: MediaItem): PublicMediaReferences => {
  const bindings = bindingRecordsFromMetadata(media);
  const pageBindings = bindings.filter((binding) => binding.scope === 'page');
  const postBindings = bindings.filter((binding) => binding.scope === 'post');
  const pageIds = uniqueStrings([...(media.pageIds || []), ...pageBindings.map((binding) => binding.targetId)]);
  const postIds = uniqueStrings([...(media.postIds || []), ...postBindings.map((binding) => binding.targetId)]);
  const scope = normalizeMediaScope(media.scope, 'global');
  const scopes = uniqueStrings([
    scope,
    ...bindings.map((binding) => binding.scope),
    pageIds.length > 0 ? 'page' : '',
    postIds.length > 0 ? 'post' : '',
  ]) as Array<'global' | 'page' | 'post'>;

  if (scopes.length === 0) {
    scopes.push('global');
  }

  const usageTypes = uniqueStrings(bindings.map((binding) => binding.usageType));
  const global = scope === 'global';
  const scoped = pageIds.length > 0 || postIds.length > 0 || scope !== 'global';

  return {
    schemaVersion: 'backy.media.references.v1',
    global,
    scoped,
    scopes,
    pageIds,
    postIds,
    pages: referenceTargets(pageIds, pageBindings),
    posts: referenceTargets(postIds, postBindings),
    usageTypes,
    totalBindings: bindings.length,
  };
};

export const buildPublicMediaEditableMetadata = (media: MediaItem): PublicMediaEditableMetadata => ({
  schemaVersion: 'backy.media.editable-metadata.v1',
  title: stringValue(media.metadata?.title) || stringValue(media.metadata?.displayName) || media.originalName || media.filename || null,
  altText: media.altText || stringValue(media.metadata?.altText),
  caption: media.caption || stringValue(media.metadata?.caption),
  tags: [...(media.tags || [])],
  folderId: media.folderId || null,
  scope: normalizeMediaScope(media.scope, 'global'),
  scopeTargetId: media.scopeTargetId || null,
  visibility: media.visibility || 'public',
  metadata: media.metadata || {},
});

export const toPublicMediaAsset = (siteId: string, media: MediaItem): PublicMediaAsset => {
  const publicMedia = withResponsiveMediaManifest(siteId, media);
  const references = buildPublicMediaReferences(media);

  return {
    ...publicMedia,
    references,
    referenceSummary: {
      pageCount: references.pageIds.length,
      postCount: references.postIds.length,
      usageTypes: references.usageTypes,
      global: references.global,
      scoped: references.scoped,
    },
    editableMetadata: buildPublicMediaEditableMetadata(media),
  };
};
