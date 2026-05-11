import { frontendDesignProvenanceFromMetadata } from './frontendDesignContract';

type CollectionLike = {
  metadata?: unknown;
};

type CollectionRecordLike = {
  values?: unknown;
};

export const withCollectionFrontendDesign = <TCollection extends CollectionLike>(collection: TCollection) => ({
  ...collection,
  frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
});

export const withCollectionRecordFrontendDesign = <TRecord extends CollectionRecordLike>(record: TRecord) => ({
  ...record,
  frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
});
