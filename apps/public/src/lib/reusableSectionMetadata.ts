import type { BackyJsonObject } from '@backy-cms/core';

export type ReusableSectionLibraryMetadata = BackyJsonObject;

const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 40;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const cloneJsonObject = (value: Record<string, unknown>): BackyJsonObject => (
  JSON.parse(JSON.stringify(value)) as BackyJsonObject
);

const toObject = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? { ...value } : {}
);

const normalizeText = (value: unknown, maxLength: number): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const normalizeLabels = (value: unknown): string[] | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const label = candidate.trim().slice(0, MAX_LABEL_LENGTH);
    if (!label) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= MAX_LABELS) break;
  }

  return labels;
};

const assignNullable = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): boolean => {
  if (value === undefined) return false;
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    const changed = target[key] !== undefined;
    delete target[key];
    return changed;
  }

  const changed = JSON.stringify(target[key] ?? null) !== JSON.stringify(value);
  target[key] = value;
  return changed;
};

const extractPatch = (input: Record<string, unknown>): Record<string, unknown> => {
  const metadata = toObject(input.metadata);
  const reusableSection = toObject(metadata.reusableSection);
  const nestedLibrary = toObject(reusableSection.library);
  const directLibrary = toObject(metadata.library);

  if (Object.keys(nestedLibrary).length > 0) return nestedLibrary;
  if (Object.keys(directLibrary).length > 0) return directLibrary;
  if (Object.keys(metadata).length > 0) return metadata;

  return input;
};

export const reusableSectionLibraryMetadata = (metadata: unknown): ReusableSectionLibraryMetadata => {
  const reusableSection = toObject(toObject(metadata).reusableSection);
  return cloneJsonObject(toObject(reusableSection.library));
};

export const buildReusableSectionMetadataPatch = (
  currentMetadata: unknown,
  input: Record<string, unknown>,
): {
  changedKeys: string[];
  errors: string[];
  library: ReusableSectionLibraryMetadata;
  metadata: BackyJsonObject;
} => {
  const base = toObject(currentMetadata);
  const reusableSection = toObject(base.reusableSection);
  const library = toObject(reusableSection.library);
  const patch = extractPatch(input);
  const changedKeys: string[] = [];
  const errors: string[] = [];

  const textFields: Array<[string, number]> = [
    ['displayName', 120],
    ['summary', 500],
    ['usageNotes', 1000],
    ['thumbnailMediaId', 120],
    ['frontendDesignTemplateId', 120],
  ];

  for (const [key, maxLength] of textFields) {
    const value = normalizeText(patch[key], maxLength);
    if (assignNullable(library, key, value)) changedKeys.push(key);
  }

  if (patch.previewPath !== undefined) {
    const previewPath = normalizeText(patch.previewPath, 240);
    if (previewPath && !previewPath.startsWith('/')) {
      errors.push('previewPath must start with /');
    } else if (assignNullable(library, 'previewPath', previewPath)) {
      changedKeys.push('previewPath');
    }
  }

  const labels = normalizeLabels(patch.labels);
  if (assignNullable(library, 'labels', labels)) changedKeys.push('labels');

  for (const key of ['owner', 'designSystem']) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) {
      if (assignNullable(library, key, null)) changedKeys.push(key);
      continue;
    }
    if (!isRecord(patch[key])) {
      errors.push(`${key} must be an object`);
      continue;
    }
    if (assignNullable(library, key, cloneJsonObject(patch[key]))) changedKeys.push(key);
  }

  const nextMetadata = {
    ...base,
    reusableSection: {
      ...reusableSection,
      library: cloneJsonObject(library),
    },
  } as BackyJsonObject;

  return {
    changedKeys,
    errors,
    library: cloneJsonObject(library),
    metadata: nextMetadata,
  };
};
