import type { BackyCollection, BackyCollectionRecord, BackyJsonValue, BackyListResult, MediaItem } from '@backy-cms/core';
import { validateCollectionRecordValues, type StoreCollection } from '@/lib/backyStore';

export interface CollectionRecordValidationDetail {
  field: string;
  code: string;
  message: string;
  label?: string;
}

type CollectionRecordRepository = {
  listRecords: (input: {
    siteId: string;
    collectionId: string;
    includeUnpublished?: boolean;
    limit?: number;
    offset?: number;
  }) => Promise<BackyListResult<BackyCollectionRecord>>;
};

type CollectionMediaRepository = {
  getById: (siteId: string, mediaId: string) => Promise<MediaItem | null>;
};

type CollectionField = BackyCollection['fields'][number];

const normalizeUniqueValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim().toLowerCase();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value).trim().toLowerCase();
  }
};

const isEmptyValue = (value: unknown): boolean => (
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim().length === 0) ||
  (Array.isArray(value) && value.length === 0)
);

const hasValidationIssue = (
  issues: CollectionRecordValidationDetail[],
  field: string,
  code: string,
): boolean => issues.some((issue) => issue.field === field && issue.code === code);

const hasRepositoryDuplicateValue = async (
  repository: CollectionRecordRepository,
  input: {
    siteId: string;
    collectionId: string;
    fieldKey: string;
    targetValue: string;
    excludeRecordId?: string;
  },
): Promise<boolean> => {
  let offset = 0;
  const limit = 100;

  for (;;) {
    const page = await repository.listRecords({
      siteId: input.siteId,
      collectionId: input.collectionId,
      includeUnpublished: true,
      limit,
      offset,
    });

    if (page.items.some((record) => (
      record.id !== input.excludeRecordId &&
      normalizeUniqueValue(record.values[input.fieldKey]) === input.targetValue
    ))) {
      return true;
    }

    if (!page.pagination.hasMore || page.items.length === 0) {
      return false;
    }

    offset += page.pagination.limit || limit;
  }
};

const fieldValidationRecord = (field: CollectionField): Record<string, unknown> => (
  field.validation && typeof field.validation === 'object' && !Array.isArray(field.validation)
    ? field.validation
    : {}
);

const isMultiFileField = (field: CollectionField): boolean => {
  if (field.type !== 'file') return false;
  const validation = fieldValidationRecord(field);
  return validation.multiple === true || Number.isFinite(Number(validation.maxItems));
};

const fileMaxItems = (field: CollectionField): number | null => {
  const maxItems = Number(fieldValidationRecord(field).maxItems);
  return Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : null;
};

const normalizeListValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text ? text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) : [];
  }
  return [];
};

const mediaReferenceLooksExternal = (value: string): boolean => (
  /^(https?:)?\/\//i.test(value) ||
  value.startsWith('/') ||
  value.startsWith('data:')
);

const isMediaField = (field: CollectionField): boolean => (
  field.type === 'image' || field.type === 'video' || field.type === 'file'
);

export const normalizeCollectionRecordMediaValues = (
  collection: BackyCollection,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized = { ...values };

  collection.fields.forEach((field) => {
    if (!isMultiFileField(field) || values[field.key] === undefined) {
      return;
    }
    normalized[field.key] = normalizeListValue(values[field.key]);
  });

  return normalized;
};

const validateMediaFieldValue = async (
  input: {
    repository?: CollectionMediaRepository;
    siteId: string;
    field: CollectionField;
    value: unknown;
  },
): Promise<CollectionRecordValidationDetail[]> => {
  const { field, value } = input;
  if (!isMediaField(field) || isEmptyValue(value)) {
    return [];
  }

  if (isMultiFileField(field)) {
    const references = normalizeListValue(value);
    const maxItems = fileMaxItems(field);
    const issues: CollectionRecordValidationDetail[] = [];
    if (maxItems && references.length > maxItems) {
      issues.push({
        field: field.key,
        code: 'max_items',
        message: `${field.label} allows at most ${maxItems} file${maxItems === 1 ? '' : 's'}.`,
        label: field.label,
      });
    }
    return issues.concat(await validateMediaReferences({ ...input, references }));
  }

  if (Array.isArray(value)) {
    return [{
      field: field.key,
      code: 'invalid_media_shape',
      message: `${field.label} accepts one media ID or URL. Use a file field with multiple media enabled for galleries.`,
      label: field.label,
    }];
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return [{
      field: field.key,
      code: 'invalid_media_shape',
      message: `${field.label} must be a media ID or URL.`,
      label: field.label,
    }];
  }

  return validateMediaReferences({ ...input, references: [String(value).trim()].filter(Boolean) });
};

const validateMediaReferences = async (
  input: {
    repository?: CollectionMediaRepository;
    siteId: string;
    field: CollectionField;
    references: string[];
  },
): Promise<CollectionRecordValidationDetail[]> => {
  if (!input.repository) {
    return [];
  }

  const issues: CollectionRecordValidationDetail[] = [];
  for (const reference of input.references) {
    if (mediaReferenceLooksExternal(reference)) {
      continue;
    }
    const media = await input.repository.getById(input.siteId, reference);
    if (!media) {
      issues.push({
        field: input.field.key,
        code: 'media_not_found',
        message: `${input.field.label} references a media asset that does not exist: ${reference}`,
        label: input.field.label,
      });
      continue;
    }
    if ((input.field.type === 'image' || input.field.type === 'video') && media.type !== input.field.type) {
      issues.push({
        field: input.field.key,
        code: 'media_type_mismatch',
        message: `${input.field.label} expects ${input.field.type} media, but ${reference} is ${media.type}.`,
        label: input.field.label,
      });
    }
  }

  return issues;
};

export const validateRepositoryCollectionRecordValues = async (
  input: {
    repository: CollectionRecordRepository;
    mediaRepository?: CollectionMediaRepository;
    siteId: string;
    collection: BackyCollection;
    values: Record<string, unknown>;
    existingValues?: Record<string, unknown>;
    excludeRecordId?: string;
  },
): Promise<CollectionRecordValidationDetail[]> => {
  const values = normalizeCollectionRecordMediaValues(input.collection, input.values);
  const issues = validateCollectionRecordValues(
    input.collection as unknown as StoreCollection,
    values,
    {
      existingValues: input.existingValues,
      excludeRecordId: input.excludeRecordId,
    },
  ) as CollectionRecordValidationDetail[];
  const uniqueFields = input.collection.fields.filter((field) => field.unique);

  for (const field of uniqueFields) {
    const value = values[field.key];
    if (isEmptyValue(value)) {
      continue;
    }

    const hasDuplicate = await hasRepositoryDuplicateValue(input.repository, {
      siteId: input.siteId,
      collectionId: input.collection.id,
      fieldKey: field.key,
      targetValue: normalizeUniqueValue(value as BackyJsonValue),
      excludeRecordId: input.excludeRecordId,
    });

    if (hasDuplicate && !hasValidationIssue(issues, field.key, 'unique')) {
      issues.push({
        field: field.key,
        code: 'unique',
        message: `${field.label} must be unique.`,
        label: field.label,
      });
    }
  }

  for (const field of input.collection.fields.filter(isMediaField)) {
    const mediaIssues = await validateMediaFieldValue({
      repository: input.mediaRepository,
      siteId: input.siteId,
      field,
      value: values[field.key],
    });
    for (const issue of mediaIssues) {
      if (!hasValidationIssue(issues, issue.field, issue.code)) {
        issues.push(issue);
      }
    }
  }

  return issues;
};
