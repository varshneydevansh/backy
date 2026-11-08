import { frontendDesignProvenanceFromMetadata } from './frontendDesignContract';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Current reusable content is public; recovery snapshots and write authority are not. */
export function publicReusableSection<T extends { metadata?: Record<string, unknown>; createdBy?: unknown; updatedBy?: unknown }>(section: T) {
  const { createdBy: _creator, updatedBy: _editor, metadata, ...current } = section;
  let publicMetadata: Record<string, unknown> | undefined;
  if (record(metadata)) {
    const { frontendTemplateInstance: _pin, ...rest } = metadata;
    publicMetadata = rest;
    if (record(rest.reusableSection)) {
      const { history: _history, createdBy: _createdBy, updatedBy: _updatedBy, requestId: _requestId, ...library } = rest.reusableSection;
      publicMetadata = { ...rest, reusableSection: library };
    }
  }
  return {
    ...current,
    ...(publicMetadata ? { metadata: publicMetadata } : {}),
    frontendDesign: frontendDesignProvenanceFromMetadata(publicMetadata),
  };
}
