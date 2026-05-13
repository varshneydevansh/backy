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

export const withCollectionRecordFrontendDesign = <TRecord extends CollectionRecordLike>(record: TRecord) => ({
  ...record,
  frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
});
