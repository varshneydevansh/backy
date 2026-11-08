const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Public reads retain authored metadata; only the managed immutable template baseline is private. */
export function publicDocumentMetadata(value: unknown): unknown {
  if (!record(value)) return value;
  const { frontendTemplateInstance: _baseline, ...current } = value;
  return current;
}
