const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

/** Read provenance without rewriting saved author data. Explicit meta wins. */
export const resolveFrontendTemplateProvenance = (
  meta: unknown,
  contentMetadata?: unknown,
  documentMetadata?: unknown,
) => {
  const sources = [meta, contentMetadata, documentMetadata].filter(isRecord);
  const string = (key: string): string => {
    const value = sources.map(source => source[key]).find(value => typeof value === 'string');
    return typeof value === 'string' ? value : '';
  };
  const record = (key: string): Record<string, unknown> | null => (
    sources.map(source => source[key]).find(isRecord) || null
  );
  const array = (key: string): unknown[] => (
    sources.map(source => source[key]).find(Array.isArray) || []
  );
  return {
    id: string('frontendDesignTemplateId'),
    name: string('frontendDesignTemplateName'),
    routePattern: string('frontendDesignRoutePattern'),
    source: record('frontendDesignSource'),
    chrome: record('frontendDesignChrome'),
    tokens: record('frontendDesignTokens'),
    customCss: string('frontendDesignCustomCss'),
    bindingHints: array('frontendDesignBindingHints'),
  };
};
