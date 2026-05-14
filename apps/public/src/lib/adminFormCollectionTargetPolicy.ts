import type { BackyCollection, BackyRepositories, FormDefinition } from '@backy-cms/core';
import { getCollectionByIdOrSlug } from '@/lib/backyStore';

type CollectionTarget = NonNullable<FormDefinition['collectionTarget']>;
type CollectionReader = Pick<BackyRepositories['collections'], 'getById' | 'getBySlug'>;

type ValidationSuccess = {
  ok: true;
  collectionTarget?: FormDefinition['collectionTarget'];
};

type ValidationFailure = {
  ok: false;
  status: 400;
  code: string;
  message: string;
};

export type AdminFormCollectionTargetValidationResult = ValidationSuccess | ValidationFailure;

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeStringMap = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [sourceKey, targetKey]) => {
    const normalizedSource = textValue(sourceKey);
    const normalizedTarget = textValue(targetKey);
    if (normalizedSource && normalizedTarget) {
      acc[normalizedSource] = normalizedTarget;
    }
    return acc;
  }, {});
};

const disabledCollectionTarget = (target: CollectionTarget): FormDefinition['collectionTarget'] => ({
  enabled: false,
  collectionId: textValue(target.collectionId),
  fieldMap: normalizeStringMap(target.fieldMap),
  ...(textValue(target.slugField) ? { slugField: textValue(target.slugField) } : {}),
});

const resolveCollection = async (
  siteId: string,
  identifier: string,
  repositories?: { collections: CollectionReader } | null,
): Promise<BackyCollection | ReturnType<typeof getCollectionByIdOrSlug> | null | undefined> => {
  if (repositories) {
    return (await repositories.collections.getById(siteId, identifier))
      || (await repositories.collections.getBySlug(siteId, identifier));
  }

  return getCollectionByIdOrSlug(siteId, identifier, { includeUnpublished: true });
};

export const validateAdminFormCollectionTarget = async (input: {
  siteId: string;
  collectionTarget?: FormDefinition['collectionTarget'];
  formFields: FormDefinition['fields'];
  repositories?: { collections: CollectionReader } | null;
}): Promise<AdminFormCollectionTargetValidationResult> => {
  const target = input.collectionTarget;
  if (!target) {
    return { ok: true };
  }

  if (target.enabled !== true) {
    return { ok: true, collectionTarget: disabledCollectionTarget(target) };
  }

  const collectionIdentifier = textValue(target.collectionId);
  if (!collectionIdentifier) {
    return {
      ok: false,
      status: 400,
      code: 'FORM_COLLECTION_TARGET_REQUIRED',
      message: 'Collection-backed forms require a target collection.',
    };
  }

  const collection = await resolveCollection(input.siteId, collectionIdentifier, input.repositories);
  if (!collection) {
    return {
      ok: false,
      status: 400,
      code: 'FORM_COLLECTION_TARGET_NOT_FOUND',
      message: 'Target collection does not exist for this site.',
    };
  }

  if (collection.status !== 'published' || !collection.permissions.publicCreate) {
    return {
      ok: false,
      status: 400,
      code: 'FORM_COLLECTION_TARGET_NOT_WRITABLE',
      message: 'Target collection must be published and allow public creation before a form can write to it.',
    };
  }

  const formFieldKeys = new Set(input.formFields.map((field) => field.key).filter(Boolean));
  const collectionFieldKeys = new Set(collection.fields.map((field) => field.key).filter(Boolean));
  const fieldMap = normalizeStringMap(target.fieldMap);

  for (const [sourceField, targetField] of Object.entries(fieldMap)) {
    if (!formFieldKeys.has(sourceField)) {
      return {
        ok: false,
        status: 400,
        code: 'FORM_COLLECTION_TARGET_SOURCE_FIELD_NOT_FOUND',
        message: `Form field "${sourceField}" cannot be mapped because it does not exist on this form.`,
      };
    }

    if (!collectionFieldKeys.has(targetField)) {
      return {
        ok: false,
        status: 400,
        code: 'FORM_COLLECTION_TARGET_FIELD_NOT_FOUND',
        message: `Collection field "${targetField}" cannot be mapped because it does not exist on the target collection.`,
      };
    }
  }

  const slugField = textValue(target.slugField);
  if (slugField && !formFieldKeys.has(slugField)) {
    return {
      ok: false,
      status: 400,
      code: 'FORM_COLLECTION_TARGET_SLUG_FIELD_NOT_FOUND',
      message: `Slug source field "${slugField}" does not exist on this form.`,
    };
  }

  return {
    ok: true,
    collectionTarget: {
      enabled: true,
      collectionId: collection.id,
      ...(Object.keys(fieldMap).length > 0 ? { fieldMap } : {}),
      ...(slugField ? { slugField } : {}),
    },
  };
};
