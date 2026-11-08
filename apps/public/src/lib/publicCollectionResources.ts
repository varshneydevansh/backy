import { frontendDesignProvenanceFromMetadata } from './frontendDesignContract';

type CollectionLike = {
  metadata?: unknown;
};

type CollectionRecordLike = {
  values?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const publicSafeCollectionMetadata = (metadata: unknown) => {
  if (!isRecord(metadata)) return metadata;
  const sanitized = { ...metadata };
  delete sanitized.publicWriteToken;
  // Baselines and private recovery/control payloads are authenticated authoring state.
  for(const key of ['frontendTemplateInstance','frontendTemplateHistory','frontendTemplateRevisions','frontendDesignRevisions','beforeUpdateCollectionDesignRevision','beforeUpdateProductDesignRevision','expectedCollection','expectedRecord','expectedVersion'])delete sanitized[key];

  if (isRecord(sanitized.visitorWritePolicy)) {
    const {
      publicWriteToken,
      updateToken,
      deleteToken,
      ...visitorWritePolicy
    } = sanitized.visitorWritePolicy;

    void publicWriteToken;
    void updateToken;
    void deleteToken;
    sanitized.visitorWritePolicy = visitorWritePolicy;
  }

  return sanitized;
};

export const withCollectionFrontendDesign = <TCollection extends CollectionLike>(collection: TCollection) => ({
  ...collection,
  metadata: publicSafeCollectionMetadata(collection.metadata),
  frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
});

const publicSafeCollectionRecordValues = (values:unknown) => {
  if(!isRecord(values))return values;
  const sanitized={...values};
  // Entry schemas own their other keys, including ordinary version/expectation names.
  for(const key of ['frontendTemplateInstance','frontendTemplateHistory','frontendTemplateRevisions','frontendDesignRevisions'])delete sanitized[key];
  return sanitized;
};

export const withCollectionRecordFrontendDesign = <TRecord extends CollectionRecordLike>(record: TRecord) => ({
  ...record,
  values: publicSafeCollectionRecordValues(record.values),
  frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
});
