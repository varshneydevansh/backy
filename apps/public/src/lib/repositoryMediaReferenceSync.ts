import type { BackyCollectionField, BackyMediaRepository, MediaItem } from '@backy-cms/core';
import { readCompleteMediaInventory } from './mediaInventory';

const MEDIA_REFERENCE_ID_KEYS = new Set([
  'assetId',
  'mediaIds',
  'mediaId',
  'fileIds',
  'fileId',
  'fileMediaIds',
  'fileMediaId',
  'downloadMediaIds',
  'downloadMediaId',
  'imageIds',
  'imageId',
  'videoIds',
  'videoId',
  'audioIds',
  'audioId',
  'fontIds',
  'fontId',
  'documentIds',
  'documentId',
  'iconIds',
  'iconId',
  'fontMediaIds',
  'fontMediaId',
  'fallbackImageMediaIds',
  'fallbackImageMediaId',
  'backgroundMediaIds',
  'backgroundMediaId',
  'posterMediaIds',
  'posterMediaId',
]);

const MEDIA_REFERENCE_ASSET_COLLECTION_KEYS = new Set([
  'media',
  'fonts',
  'images',
  'videos',
  'audio',
  'documents',
  'icons',
  'files',
]);

type RepositoryMediaBindingRecord = Record<string, unknown> & {
  id?: string;
  mediaId?: string;
  scope?: string;
  targetId?: string;
  collectionId?: string;
  usageType?: string;
  attachedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const sanitizeString = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'boolean') {
    return value ? 'on' : '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeString(item))
      .filter(Boolean)
      .join(',');
  }

  return '';
};

const uniqueStringList = (values: unknown[]): string[] => (
  Array.from(new Set(values.map(sanitizeString).filter(Boolean)))
);

/** Same authored identity grammar for reference indexing and pre-write admission. */
export const collectRepositoryMediaReferences = (value: unknown): Array<{ mediaId: string; path: string }> => {
  const references: Array<{ mediaId: string; path: string }> = [];
  const pointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
  const add = (entry: unknown, path: string) => { const mediaId = sanitizeString(entry); if (mediaId) references.push({ mediaId, path }); };
  const visit = (entry: unknown, path: string, key?: string, parentKey?: string) => {
    if (!entry) return;
    if (key && MEDIA_REFERENCE_ID_KEYS.has(key)) {
      if (Array.isArray(entry)) entry.forEach((item, index) => add(item, `${path}/${index}`));
      else add(entry, path);
      return;
    }
    if (Array.isArray(entry)) {
      if (key === 'assetIds') entry.forEach((item, index) => add(item, `${path}/${index}`));
      else entry.forEach((item, index) => visit(item, `${path}/${index}`, undefined, key));
      return;
    }
    if (!isRecord(entry)) return;
    if (parentKey && MEDIA_REFERENCE_ASSET_COLLECTION_KEYS.has(parentKey)) add(entry.id, `${path}/id`);
    Object.entries(entry).forEach(([entryKey, entryValue]) => visit(entryValue, `${path}/${pointer(entryKey)}`, entryKey, key));
  };
  visit(value, '');
  return references;
};
export const collectRepositoryMediaReferenceIds = (value: unknown): Set<string> => (
  new Set(collectRepositoryMediaReferences(value).map(reference => reference.mediaId))
);

/** Collection schemas also identify managed IDs under arbitrary author-defined keys. */
export const collectRepositoryCollectionRecordMediaReferences = (
  values: unknown,
  fields: BackyCollectionField[] = [],
): Array<{ mediaId: string; path: string }> => {
  const references = collectRepositoryMediaReferences(values);
  if (!isRecord(values)) return references;
  for (const field of fields) {
    if (!['image', 'video', 'file'].includes(field.type)) continue;
    const value = values[field.key];
    const validation = isRecord(field.validation) ? field.validation : {};
    const multiple = field.type === 'file' && (validation.multiple === true || Number.isFinite(Number(validation.maxItems)));
    const entries = Array.isArray(value) ? value : multiple && typeof value === 'string' ? value.split(/[\n,]/) : [value];
    entries.forEach((entry, index) => {
      if (typeof entry !== 'string' && typeof entry !== 'number') return;
      const mediaId = String(entry).trim();
      if (!mediaId || /^(https?:)?\/\//i.test(mediaId) || mediaId.startsWith('/') || mediaId.startsWith('data:')) return;
      const path = '/' + field.key.replace(/~/g, '~0').replace(/\//g, '~1');
      references.push({ mediaId, path: Array.isArray(value) || multiple ? `${path}/${index}` : path });
    });
  }
  return references;
};

const completeMedia = (repository: BackyMediaRepository, siteId: string) => readCompleteMediaInventory(siteId, pagination => repository.list({ siteId, type: 'all', visibility: 'all', ...pagination }));

const bindingRecordsFromMetadata = (media: MediaItem): RepositoryMediaBindingRecord[] => {
  const bindings = media.metadata?.bindings;
  return Array.isArray(bindings) ? bindings.filter(isRecord) : [];
};

const isTargetCollectionRecordBinding = (
  binding: RepositoryMediaBindingRecord,
  collectionId: string,
  recordId: string,
): boolean => (
  binding.scope === 'collectionRecord' &&
  sanitizeString(binding.targetId) === recordId &&
  (!sanitizeString(binding.collectionId) || sanitizeString(binding.collectionId) === collectionId)
);

const isCurrentCollectionRecordBinding = (
  binding: RepositoryMediaBindingRecord | undefined,
  mediaId: string,
  collectionId: string,
  recordId: string,
): boolean => Boolean(
  binding &&
  binding.scope === 'collectionRecord' &&
  sanitizeString(binding.mediaId) === mediaId &&
  sanitizeString(binding.targetId) === recordId &&
  sanitizeString(binding.collectionId) === collectionId &&
  sanitizeString(binding.usageType) === 'collection-record',
);

const nextCollectionRecordBinding = (
  media: MediaItem,
  collectionId: string,
  recordId: string,
  existing?: RepositoryMediaBindingRecord,
): RepositoryMediaBindingRecord => {
  const now = new Date().toISOString();

  return {
    ...(existing || {}),
    id: sanitizeString(existing?.id) || `binding_${media.id}_${collectionId}_${recordId}`,
    mediaId: media.id,
    scope: 'collectionRecord',
    targetId: recordId,
    collectionId,
    usageType: 'collection-record',
    attachedBy: sanitizeString(existing?.attachedBy) || 'repository-sync',
    createdAt: sanitizeString(existing?.createdAt) || now,
    updatedAt: sanitizeString(existing?.updatedAt) || now,
  };
};

const syncCollectionRecordBindings = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    collectionId: string;
    recordId: string;
    referenceIds: Set<string>;
  },
): Promise<void> => {
  const mediaItems = await completeMedia(input.mediaRepository, input.siteId);

  await Promise.all(mediaItems.map(async (media) => {
    const currentBindings = bindingRecordsFromMetadata(media);
    const existingBinding = currentBindings.find((binding) =>
      isTargetCollectionRecordBinding(binding, input.collectionId, input.recordId),
    );
    const shouldReference = input.referenceIds.has(media.id);

    if (shouldReference && isCurrentCollectionRecordBinding(
      existingBinding,
      media.id,
      input.collectionId,
      input.recordId,
    )) {
      return;
    }

    if (!shouldReference && !existingBinding) {
      return;
    }

    const nextBindings = currentBindings.filter(
      (binding) => !isTargetCollectionRecordBinding(binding, input.collectionId, input.recordId),
    );

    if (shouldReference) {
      nextBindings.push(nextCollectionRecordBinding(
        media,
        input.collectionId,
        input.recordId,
        existingBinding,
      ));
    }

    await input.mediaRepository.update(input.siteId, media.id, {
      metadata: { bindings: nextBindings },
    });
  }));
};

const currentTargetRefs = (
  media: MediaItem,
  key: 'pageIds' | 'postIds',
): string[] => uniqueStringList([
  ...(Array.isArray(media[key]) ? media[key] : []),
  ...(Array.isArray(media.metadata?.[key]) ? media.metadata[key] as unknown[] : []),
]);

const syncTargetMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    targetId: string;
    targetType: 'page' | 'post';
    content: unknown;
    meta?: unknown;
    additionalMediaIds?: unknown[];
  },
): Promise<void> => {
  const key = input.targetType === 'page' ? 'pageIds' : 'postIds';
  const referenceIds = collectRepositoryMediaReferenceIds({
    content: input.content,
    meta: input.meta,
  });

  (input.additionalMediaIds || [])
    .map(sanitizeString)
    .filter(Boolean)
    .forEach((id) => referenceIds.add(id));

  const mediaItems = await completeMedia(input.mediaRepository, input.siteId);

  await Promise.all(mediaItems.map(async (media) => {
    const currentRefs = currentTargetRefs(media, key);
    const shouldReference = referenceIds.has(media.id);
    const hasReference = currentRefs.includes(input.targetId);

    if (shouldReference === hasReference) {
      return;
    }

    const nextRefs = shouldReference
      ? uniqueStringList([...currentRefs, input.targetId])
      : currentRefs.filter((id) => id !== input.targetId);

    await input.mediaRepository.update(input.siteId, media.id, {
      metadata: { [key]: nextRefs },
    });
  }));
};

const removeTargetMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    targetId: string;
    targetType: 'page' | 'post';
  },
): Promise<void> => {
  const key = input.targetType === 'page' ? 'pageIds' : 'postIds';
  const mediaItems = await completeMedia(input.mediaRepository, input.siteId);

  await Promise.all(mediaItems.map(async (media) => {
    const currentRefs = currentTargetRefs(media, key);
    if (!currentRefs.includes(input.targetId)) {
      return;
    }

    await input.mediaRepository.update(input.siteId, media.id, {
      metadata: { [key]: currentRefs.filter((id) => id !== input.targetId) },
    });
  }));
};

export const syncRepositoryCollectionRecordMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    collectionId: string;
    recordId: string;
    values: unknown;
    fields?: BackyCollectionField[];
  },
): Promise<void> => {
  await syncCollectionRecordBindings({
    ...input,
    referenceIds: new Set(collectRepositoryCollectionRecordMediaReferences(input.values, input.fields).map(reference => reference.mediaId)),
  });
};

export const removeRepositoryCollectionRecordMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    collectionId: string;
    recordId: string;
  },
): Promise<void> => {
  await syncCollectionRecordBindings({
    ...input,
    referenceIds: new Set<string>(),
  });
};

export const syncRepositoryPageMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    pageId: string;
    content: unknown;
    meta?: unknown;
  },
): Promise<void> => {
  await syncTargetMediaReferences({
    mediaRepository: input.mediaRepository,
    siteId: input.siteId,
    targetId: input.pageId,
    targetType: 'page',
    content: input.content,
    meta: input.meta,
  });
};

export const removeRepositoryPageMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    pageId: string;
  },
): Promise<void> => {
  await removeTargetMediaReferences({
    mediaRepository: input.mediaRepository,
    siteId: input.siteId,
    targetId: input.pageId,
    targetType: 'page',
  });
};

export const syncRepositoryPostMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    postId: string;
    content: unknown;
    meta?: unknown;
    featuredImageId?: unknown;
  },
): Promise<void> => {
  await syncTargetMediaReferences({
    mediaRepository: input.mediaRepository,
    siteId: input.siteId,
    targetId: input.postId,
    targetType: 'post',
    content: input.content,
    meta: input.meta,
    additionalMediaIds: [input.featuredImageId],
  });
};

export const removeRepositoryPostMediaReferences = async (
  input: {
    mediaRepository: BackyMediaRepository;
    siteId: string;
    postId: string;
  },
): Promise<void> => {
  await removeTargetMediaReferences({
    mediaRepository: input.mediaRepository,
    siteId: input.siteId,
    targetId: input.postId,
    targetType: 'post',
  });
};
