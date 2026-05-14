import type { BackyCollectionField, BackyCollectionFieldType, BackyJsonObject, BackyJsonValue } from '@backy-cms/core';

export type AdminCollectionFieldParseResult =
  | { ok: true; fields: BackyCollectionField[] | undefined }
  | { ok: false; message: string };

const COLLECTION_FIELD_TYPES: readonly BackyCollectionFieldType[] = [
  'text',
  'richText',
  'number',
  'boolean',
  'date',
  'datetime',
  'image',
  'video',
  'file',
  'reference',
  'multiReference',
  'select',
  'tags',
  'url',
  'email',
  'phone',
  'slug',
  'json',
];

const OPTION_FIELD_TYPES = new Set<BackyCollectionFieldType>(['select', 'tags']);

const normalizeSlug = (value: string): string => (
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
);

const normalizeFieldKey = (value: string): string => normalizeSlug(value).replace(/-/g, '_');

const normalizeFieldId = (field: Record<string, unknown>, index: number, key: string): string => {
  const existingId = typeof field.id === 'string' ? field.id.trim() : '';
  return existingId || `field_${key || index + 1}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isCollectionFieldType = (value: unknown): value is BackyCollectionFieldType => (
  typeof value === 'string' && COLLECTION_FIELD_TYPES.includes(value as BackyCollectionFieldType)
);

const toBoolean = (value: unknown): boolean | undefined => (
  typeof value === 'boolean' ? value : undefined
);

const toStringOrUndefined = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
);

const toValidation = (value: unknown): BackyJsonObject | undefined => (
  isRecord(value) ? value as BackyJsonObject : undefined
);

const isJsonValue = (value: unknown): value is BackyJsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

export const parseAdminCollectionFields = (
  value: unknown,
  options: { allowUndefined?: boolean } = {},
): AdminCollectionFieldParseResult => {
  if (value === undefined) {
    return { ok: true, fields: options.allowUndefined ? undefined : [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: 'Collection fields must be an array.' };
  }

  const usedKeys = new Set<string>();
  const fields: BackyCollectionField[] = [];

  for (const [index, rawField] of value.entries()) {
    if (!isRecord(rawField)) {
      return { ok: false, message: `Collection field ${index + 1} must be an object.` };
    }

    const label = toStringOrUndefined(rawField.label) || toStringOrUndefined(rawField.name);
    const keySource = toStringOrUndefined(rawField.key) || toStringOrUndefined(rawField.slug) || label;
    const key = keySource ? normalizeFieldKey(keySource) : '';
    if (!key) {
      return { ok: false, message: `Collection field ${index + 1} requires a key or label.` };
    }
    if (usedKeys.has(key)) {
      return { ok: false, message: `Collection field key "${key}" is duplicated.` };
    }
    usedKeys.add(key);

    const type = rawField.type === undefined ? 'text' : rawField.type;
    if (!isCollectionFieldType(type)) {
      return { ok: false, message: `Collection field "${key}" has an unsupported type.` };
    }

    const optionsValue = rawField.options;
    let fieldOptions: string[] | undefined;
    if (optionsValue !== undefined) {
      if (!Array.isArray(optionsValue)) {
        return { ok: false, message: `Collection field "${key}" options must be an array.` };
      }
      fieldOptions = optionsValue
        .map((option) => toStringOrUndefined(option))
        .filter((option): option is string => Boolean(option));
      if (fieldOptions.length !== optionsValue.length) {
        return { ok: false, message: `Collection field "${key}" options must be non-empty strings.` };
      }
    }

    if (fieldOptions?.length && !OPTION_FIELD_TYPES.has(type)) {
      return { ok: false, message: `Collection field "${key}" options are only supported on select or tags fields.` };
    }

    if (rawField.defaultValue !== undefined && !isJsonValue(rawField.defaultValue)) {
      return { ok: false, message: `Collection field "${key}" default value must be JSON-compatible.` };
    }

    fields.push({
      id: normalizeFieldId(rawField, index, key),
      key,
      label: label || key,
      type,
      ...(toBoolean(rawField.required) === undefined ? {} : { required: toBoolean(rawField.required) }),
      ...(toBoolean(rawField.unique) === undefined ? {} : { unique: toBoolean(rawField.unique) }),
      ...(fieldOptions?.length ? { options: fieldOptions } : {}),
      ...(toStringOrUndefined(rawField.referenceCollectionId) ? { referenceCollectionId: toStringOrUndefined(rawField.referenceCollectionId) } : {}),
      ...(toStringOrUndefined(rawField.helpText) ? { helpText: toStringOrUndefined(rawField.helpText) } : {}),
      ...(rawField.defaultValue === undefined ? {} : { defaultValue: rawField.defaultValue }),
      ...(toValidation(rawField.validation) ? { validation: toValidation(rawField.validation) } : {}),
    });
  }

  return { ok: true, fields };
};
