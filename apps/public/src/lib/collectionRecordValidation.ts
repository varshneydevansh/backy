import type { BackyCollection, BackyCollectionRecord, BackyJsonValue, BackyListResult } from '@backy-cms/core';
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

export const validateRepositoryCollectionRecordValues = async (
  input: {
    repository: CollectionRecordRepository;
    siteId: string;
    collection: BackyCollection;
    values: Record<string, unknown>;
    existingValues?: Record<string, unknown>;
    excludeRecordId?: string;
  },
): Promise<CollectionRecordValidationDetail[]> => {
  const issues = validateCollectionRecordValues(
    input.collection as unknown as StoreCollection,
    input.values,
    {
      existingValues: input.existingValues,
      excludeRecordId: input.excludeRecordId,
    },
  ) as CollectionRecordValidationDetail[];
  const uniqueFields = input.collection.fields.filter((field) => field.unique);

  for (const field of uniqueFields) {
    const value = input.values[field.key];
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

  return issues;
};
