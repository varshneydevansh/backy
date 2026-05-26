import type { SiteSettings } from '@backy-cms/core';

type FrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type FrontendDesignTemplate = FrontendDesignContract['templates'][number];
type FrontendDesignTemplateType = FrontendDesignTemplate['type'];
type FrontendDesignEditableMapEntry = FrontendDesignContract['editableMap'][number];
type ContentTemplateResourceType = Extract<FrontendDesignTemplateType, 'page' | 'blogPost' | 'form' | 'product' | 'collection' | 'section'>;

const SCHEMA_VERSION = 'backy.frontend-design.v1';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const stringValue = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
);

const stringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const motionTokenRecord = (
  value: unknown,
): FrontendDesignContract['tokens']['motion'] | undefined => {
  const input = objectRecord(value);
  if (!input) return undefined;

  const output: FrontendDesignContract['tokens']['motion'] = { ...input };
  const duration = stringRecord(input.duration);
  const easing = stringRecord(input.easing);
  const preset = stringValue(input.preset);

  if (duration) {
    output.duration = duration;
  } else {
    delete output.duration;
  }

  if (easing) {
    output.easing = easing;
  } else {
    delete output.easing;
  }

  if (preset) {
    output.preset = preset;
  } else {
    delete output.preset;
  }

  return Object.keys(output).length > 0 ? output : undefined;
};

const objectRecord = (value: unknown): Record<string, unknown> | undefined => (
  isRecord(value) ? { ...value } : undefined
);

const booleanValue = (value: unknown): boolean | undefined => (
  typeof value === 'boolean' ? value : undefined
);

const stringArrayValue = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const values = value.map(stringValue).filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values : undefined;
};

const cloneRecord = (value: unknown): Record<string, unknown> | undefined => (
  isRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : undefined
);

const cloneArray = <T>(value: T[]): T[] => (
  JSON.parse(JSON.stringify(value)) as T[]
);

const cloneArrayOrRecord = (value: unknown): unknown[] | Record<string, unknown> | undefined => (
  Array.isArray(value)
    ? cloneArray(value)
    : cloneRecord(value)
);

const cloneProvenanceArray = (value: unknown): unknown[] | undefined => {
  if (Array.isArray(value)) {
    const items = cloneArray(value);
    return items.length > 0 ? items : undefined;
  }

  const record = cloneRecord(value);
  return record && Object.keys(record).length > 0 ? [record] : undefined;
};

const cloneJsonValue = <T>(value: T): T => (
  JSON.parse(JSON.stringify(value)) as T
);

const mergeRecord = (
  base: unknown,
  next: unknown,
): Record<string, unknown> | undefined => {
  const baseRecord = cloneRecord(base) || {};
  const nextRecord = cloneRecord(next) || {};
  const merged = { ...baseRecord, ...nextRecord };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

const mergeDeepRecord = (
  base: unknown,
  next: unknown,
): Record<string, unknown> | undefined => {
  const baseRecord = cloneRecord(base) || {};
  const nextRecord = cloneRecord(next) || {};
  const merged: Record<string, unknown> = { ...baseRecord };

  for (const [key, value] of Object.entries(nextRecord)) {
    if (isRecord(merged[key]) && isRecord(value)) {
      merged[key] = mergeDeepRecord(merged[key], value);
    } else {
      merged[key] = cloneJsonValue(value);
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const mergeNestedRecordGroup = (
  base: unknown,
  next: unknown,
  nestedKeys: string[],
): Record<string, unknown> | undefined => {
  const baseRecord = cloneRecord(base) || {};
  const nextRecord = cloneRecord(next) || {};
  const merged: Record<string, unknown> = {
    ...baseRecord,
    ...nextRecord,
  };

  for (const key of nestedKeys) {
    if (isRecord(baseRecord[key]) && isRecord(nextRecord[key])) {
      merged[key] = mergeDeepRecord(baseRecord[key], nextRecord[key]);
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const mergeTemplateContentInput = (
  fallback: unknown,
  next: unknown,
): Record<string, unknown> | undefined => {
  const fallbackRecord = cloneRecord(fallback) || {};
  const nextRecord = cloneRecord(next) || {};
  const merged: Record<string, unknown> = {
    ...fallbackRecord,
    ...nextRecord,
  };

  for (const key of [
    'canvasSize',
    'contentDocument',
    'themeTokenRefs',
    'assets',
    'animations',
    'interactions',
    'dataBindings',
    'editableMap',
    'seo',
    'metadata',
  ]) {
    if (isRecord(fallbackRecord[key]) && isRecord(nextRecord[key])) {
      merged[key] = mergeDeepRecord(fallbackRecord[key], nextRecord[key]);
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const mergeTemplateInput = (
  template: Record<string, unknown>,
  fallback: FrontendDesignTemplate | undefined,
): Record<string, unknown> => {
  if (!fallback) {
    return cloneRecord(template) || {};
  }

  const merged: Record<string, unknown> = {
    ...(cloneRecord(fallback) || {}),
    ...(cloneRecord(template) || {}),
  };

  if (!hasOwn(template, 'content')) {
    merged.content = fallback.content;
  } else if (isRecord(template.content) && isRecord(fallback.content)) {
    merged.content = mergeTemplateContentInput(fallback.content, template.content);
  }

  if (!hasOwn(template, 'bindingHints')) {
    merged.bindingHints = fallback.bindingHints;
  }

  if (!hasOwn(template, 'canvasSize')) {
    merged.canvasSize = fallback.canvasSize;
  }

  return merged;
};

const mergeFrontendDesignContractInput = (
  value: Record<string, unknown>,
  fallback: FrontendDesignContract | undefined,
): Record<string, unknown> => {
  if (!fallback) {
    return cloneRecord(value) || {};
  }

  const merged: Record<string, unknown> = {
    ...(cloneRecord(fallback) || {}),
    ...(cloneRecord(value) || {}),
  };

  if (!hasOwn(value, 'source')) {
    merged.source = fallback.source;
  } else if (isRecord(value.source)) {
    merged.source = mergeRecord(fallback.source, value.source);
  }

  if (!hasOwn(value, 'tokens')) {
    merged.tokens = fallback.tokens;
  } else if (isRecord(value.tokens)) {
    merged.tokens = mergeNestedRecordGroup(fallback.tokens, value.tokens, [
      'colors',
      'fonts',
      'typography',
      'spacing',
      'radii',
      'shadows',
      'motion',
      'breakpoints',
      'layout',
    ]);
  }

  if (!hasOwn(value, 'chrome')) {
    merged.chrome = fallback.chrome;
  } else if (isRecord(value.chrome)) {
    merged.chrome = mergeNestedRecordGroup(fallback.chrome, value.chrome, [
      'header',
      'navigation',
      'footer',
    ]);
  }

  if (!hasOwn(value, 'templates')) {
    merged.templates = fallback.templates;
  } else if (Array.isArray(value.templates)) {
    const patchTemplates = value.templates.filter(isRecord);
    if (patchTemplates.length === 0) {
      merged.templates = [];
    } else {
      const patchedIds = new Set(
        patchTemplates
          .map((template) => stringValue(template.id))
          .filter((id): id is string => Boolean(id)),
      );
      const preservedTemplates = fallback.templates.filter((template) => !patchedIds.has(template.id));
      merged.templates = [
        ...preservedTemplates,
        ...patchTemplates.map((template) => {
          const templateId = stringValue(template.id);
          return mergeTemplateInput(
            template,
            templateId ? fallback.templates.find((candidate) => candidate.id === templateId) : undefined,
          );
        }),
      ];
    }
  }

  if (!hasOwn(value, 'editableMap')) {
    merged.editableMap = fallback.editableMap;
  }

  return merged;
};

const normalizeStatus = (value: unknown): FrontendDesignContract['status'] => (
  value === 'captured' || value === 'synced' || value === 'stale' || value === 'unconfigured'
    ? value
    : 'captured'
);

const normalizeSourceType = (value: unknown): FrontendDesignContract['source']['type'] => (
  value === 'managed-site' || value === 'custom-frontend' || value === 'manual'
    ? value
    : 'custom-frontend'
);

const normalizeTemplateType = (value: unknown): FrontendDesignContract['templates'][number]['type'] => (
  value === 'blogPost' || value === 'form' || value === 'product' || value === 'collection' || value === 'section'
    ? value
    : 'page'
);

const FRONTEND_DESIGN_LAYER_TARGETS = [
  'x',
  'y',
  'width',
  'height',
  'zIndex',
  'rotation',
] as const;
const FRONTEND_DESIGN_BREAKPOINTS = ['tablet', 'mobile'] as const;
const FRONTEND_DESIGN_RESPONSIVE_LAYER_TARGETS = [
  ...FRONTEND_DESIGN_LAYER_TARGETS,
  'visible',
  'locked',
] as const;
const FRONTEND_DESIGN_COMMON_PROP_TARGETS = [
  'backgroundColor',
  'borderColor',
  'borderRadius',
  'borderWidth',
  'borderStyle',
  'padding',
  'margin',
  'opacity',
  'boxShadow',
] as const;
const FRONTEND_DESIGN_TEXT_PROP_TARGETS = [
  'content',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'textTransform',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textShadow',
  'textDecoration',
  'fontStyle',
] as const;
const FRONTEND_DESIGN_BUTTON_PROP_TARGETS = [
  'label',
  'href',
  'target',
  'rel',
  'ariaLabel',
  'title',
  'type',
  'actionPreset',
  'actionValue',
  'download',
] as const;
const FRONTEND_DESIGN_LINK_PROP_TARGETS = [
  'href',
  'target',
  'rel',
  'ariaLabel',
  'title',
  'download',
  'underline',
] as const;
const FRONTEND_DESIGN_FIELD_PROP_TARGETS = [
  'label',
  'name',
  'placeholder',
  'helpText',
  'defaultValue',
  'value',
  'required',
  'disabled',
] as const;
const FRONTEND_DESIGN_FORM_PROP_TARGETS = [
  'formId',
  'formTitle',
  'submitLabel',
  'action',
  'successMessage',
  'successRedirectUrl',
  'formActive',
] as const;
const FRONTEND_DESIGN_MEDIA_PROP_TARGETS = [
  'src',
  'alt',
  'title',
  'mediaId',
  'mediaIds',
  'objectFit',
  'objectPosition',
  'imageFocalPoint',
] as const;
const FRONTEND_DESIGN_FILE_PROP_TARGETS = [
  'fileId',
  'fileIds',
  'fileMediaId',
  'fileMediaIds',
  'downloadMediaId',
  'downloadMediaIds',
  'fileMediaUrl',
  'fileUrl',
  'fileMediaName',
  'fileMediaType',
  'fileMediaVisibility',
  'fileDownloadDisposition',
  'fileSignedUrlRequired',
  'fileSignedUrlEndpoint',
  'fileName',
] as const;
const FRONTEND_DESIGN_STYLE_TARGETS = [
  'color',
  'backgroundColor',
  'borderColor',
  'fontFamily',
  'fontSize',
  'lineHeight',
  'fontWeight',
  'padding',
  'margin',
  'borderRadius',
  'boxShadow',
] as const;
const FRONTEND_DESIGN_TOKEN_REF_TARGETS = [
  'styles.color',
  'styles.backgroundColor',
  'styles.borderColor',
  'styles.fontFamily',
  'styles.fontSize',
  'styles.lineHeight',
  'styles.fontWeight',
  'styles.padding',
  'styles.margin',
  'styles.borderRadius',
  'styles.boxShadow',
] as const;
const FRONTEND_DESIGN_ANIMATION_TARGETS = [
  'animation.type',
  'animation.duration',
  'animation.delay',
  'animation.easing',
  'animation.direction',
  'animation.trigger',
  'animation.scrollTrigger',
  'animation.scrollTrigger.start',
  'animation.scrollTrigger.end',
  'animation.scrollTrigger.scrub',
  'animation.from',
  'animation.to',
  'animation.tokenRefs.duration',
  'animation.tokenRefs.easing',
] as const;
const FRONTEND_DESIGN_INTERACTION_TARGETS = [
  'actions',
  'dataBindings',
  'bindingSlots',
] as const;
const FRONTEND_DESIGN_NUMERIC_LEAVES = new Set([
  'x',
  'y',
  'width',
  'height',
  'zindex',
  'rotation',
  'borderradius',
  'borderwidth',
  'padding',
  'margin',
  'opacity',
  'fontsize',
  'lineheight',
  'letterspacing',
  'wordspacing',
  'textindent',
  'rows',
  'duration',
  'delay',
]);
const FRONTEND_DESIGN_BOOLEAN_LEAVES = new Set([
  'download',
  'required',
  'disabled',
  'underline',
  'formactive',
  'visible',
  'locked',
  'controls',
  'autoplay',
  'muted',
  'loop',
  'filesignedurlrequired',
  'scrub',
]);
const FRONTEND_DESIGN_STRING_LEAVES = new Set([
  'fontweight',
  'fontfamily',
  'fontstyle',
  'fontdisplay',
  'fontfallback',
  'textalign',
  'texttransform',
  'textdecoration',
  'borderstyle',
  'actionpreset',
  'actionvalue',
  'target',
  'rel',
  'type',
  'inputtype',
  'objectfit',
  'objectposition',
  'boxshadow',
  'filedownloaddisposition',
  'filemedianame',
  'filemediatype',
  'filemediavisibility',
  'filename',
  'easing',
  'direction',
  'trigger',
  'start',
  'end',
]);

const normalizeFrontendDesignEditableMapEntry = (
  entry: Record<string, unknown>,
): FrontendDesignEditableMapEntry => {
  const normalized: Record<string, unknown> = cloneRecord(entry) || {};

  const applyString = (key: string) => {
    const value = stringValue(entry[key]);
    if (value) {
      normalized[key] = value;
    } else {
      delete normalized[key];
    }
  };

  for (const key of [
    'selector',
    'elementId',
    'role',
    'binding',
    'field',
    'targetPath',
    'token',
    'permission',
    'label',
    'valueType',
    'scope',
    'collectionId',
    'recordId',
    'sourceField',
  ]) {
    applyString(key);
  }

  const fields = stringArrayValue(entry.fields);
  if (fields) {
    normalized.fields = fields;
  } else {
    delete normalized.fields;
  }

  const editable = booleanValue(entry.editable);
  if (editable !== undefined) {
    normalized.editable = editable;
  } else {
    delete normalized.editable;
  }

  return normalized as FrontendDesignEditableMapEntry;
};

const frontendDesignElementTypeMatches = (elementType: string, types: readonly string[]): boolean => (
  types.includes(elementType)
);

const inferFrontendDesignEditableValueType = (
  path: string,
  value: unknown,
): FrontendDesignEditableMapEntry['valueType'] => {
  const normalizedPath = path.toLowerCase();
  const leaf = normalizedPath.split('.').pop() || normalizedPath;

  if (normalizedPath.startsWith('tokenrefs.') || normalizedPath.includes('.tokenrefs.')) return 'string';
  if (typeof value === 'boolean' || FRONTEND_DESIGN_BOOLEAN_LEAVES.has(leaf)) return 'boolean';
  if (typeof value === 'number' || FRONTEND_DESIGN_NUMERIC_LEAVES.has(leaf)) return 'number';
  if (normalizedPath.includes('color') || (typeof value === 'string' && /^#(?:[0-9a-f]{3}){1,2}$/i.test(value))) return 'color';
  if (normalizedPath.includes('href') || normalizedPath.includes('url') || normalizedPath.includes('src')) return 'url';
  if (normalizedPath.includes('video')) return 'video';
  if (normalizedPath.includes('audio')) return 'audio';
  if (
    normalizedPath.includes('file') ||
    normalizedPath.includes('download') ||
    normalizedPath.includes('document') ||
    normalizedPath.includes('fontmedia')
  ) {
    return 'file';
  }
  if (
    normalizedPath.includes('image') ||
    normalizedPath.includes('poster') ||
    normalizedPath.includes('backgroundmedia') ||
    normalizedPath.includes('mediaid')
  ) {
    return 'image';
  }
  if (
    normalizedPath === 'actions' ||
    normalizedPath === 'databindings' ||
    normalizedPath === 'bindingslots' ||
    normalizedPath === 'animation.from' ||
    normalizedPath === 'animation.to' ||
    normalizedPath === 'animation.scrolltrigger' ||
    Array.isArray(value) ||
    (isRecord(value) && Object.keys(value).length > 0)
  ) {
    return 'json';
  }
  if (normalizedPath.includes('content') && Array.isArray(value)) return 'richText';
  if (FRONTEND_DESIGN_STRING_LEAVES.has(leaf)) return 'string';
  if (typeof value === 'string') return 'string';
  return 'json';
};

const frontendDesignEditableTargetValue = (
  element: Record<string, unknown>,
  path: string,
): unknown => {
  if (path.startsWith('layout.')) {
    return element[path.replace(/^layout\./, '')];
  }

  if (path === 'visibility.hidden') {
    return booleanValue(element.visible) === false;
  }

  if (path === 'visibility.locked') {
    return booleanValue(element.locked) === true;
  }

  const segments = path.split('.').filter(Boolean);
  let current: unknown = element;
  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
};

const frontendDesignEditableLabel = (
  elementType: string | undefined,
  path: string,
): string => {
  const readablePath = path
    .replace(/^layout\./, '')
    .replace(/^props\./, '')
    .replace(/^styles\./, 'style ')
    .replace(/^tokenRefs\./, 'token ')
    .replace(/^responsive\./, 'responsive ')
    .replace(/^animation\./, 'animation ')
    .replace(/\./g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  const label = readablePath.charAt(0).toUpperCase() + readablePath.slice(1);
  return elementType ? `${elementType} ${label}` : label;
};

const pushFrontendDesignEditableMapEntry = (
  entries: FrontendDesignEditableMapEntry[],
  input: {
    elementId?: string;
    elementType?: string;
    targetPath: string;
    value?: unknown;
    binding?: string;
    fields?: string[];
    sourceField?: string;
  },
) => {
  if (!input.elementId || !input.targetPath) return;

  entries.push(normalizeFrontendDesignEditableMapEntry({
    elementId: input.elementId,
    role: input.elementType || 'element',
    binding: input.binding,
    fields: input.fields,
    field: input.targetPath,
    targetPath: input.targetPath,
    sourceField: input.sourceField,
    editable: true,
    valueType: inferFrontendDesignEditableValueType(input.targetPath, input.value),
    scope: 'element',
    label: frontendDesignEditableLabel(input.elementType, input.targetPath),
  }));
};

const defaultFrontendDesignPropTargetPathsForElement = (
  element: Record<string, unknown>,
): string[] => {
  const elementType = stringValue(element.type) || '';
  const targets = new Set<string>(FRONTEND_DESIGN_COMMON_PROP_TARGETS.map((target) => `props.${target}`));

  if (frontendDesignElementTypeMatches(elementType, ['text', 'heading', 'paragraph', 'quote', 'button', 'link'])) {
    FRONTEND_DESIGN_TEXT_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementType === 'button') {
    FRONTEND_DESIGN_BUTTON_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
    FRONTEND_DESIGN_FILE_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementType === 'link') {
    FRONTEND_DESIGN_LINK_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
    FRONTEND_DESIGN_FILE_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementType === 'form') {
    FRONTEND_DESIGN_FORM_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (frontendDesignElementTypeMatches(elementType, ['input', 'textarea', 'select', 'checkbox', 'radio'])) {
    FRONTEND_DESIGN_FIELD_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
    targets.add('props.formId');
    if (elementType === 'input') targets.add('props.inputType');
    if (elementType === 'textarea') targets.add('props.rows');
    if (frontendDesignElementTypeMatches(elementType, ['select', 'checkbox', 'radio'])) targets.add('props.options');
  }

  if (frontendDesignElementTypeMatches(elementType, ['image', 'video', 'audio', 'file'])) {
    FRONTEND_DESIGN_MEDIA_PROP_TARGETS.forEach((target) => targets.add(`props.${target}`));
    if (elementType === 'video') {
      targets.add('props.posterMediaId');
      targets.add('props.posterMediaIds');
      targets.add('props.controls');
      targets.add('props.autoplay');
      targets.add('props.muted');
      targets.add('props.loop');
    }
  }

  return [...targets];
};

const defaultFrontendDesignEditableTargetPathsForElement = (
  element: Record<string, unknown>,
): string[] => {
  const propPaths = defaultFrontendDesignPropTargetPathsForElement(element);
  const stylePaths = FRONTEND_DESIGN_STYLE_TARGETS.map((target) => `styles.${target}`);
  const tokenRefPaths = FRONTEND_DESIGN_TOKEN_REF_TARGETS.map((target) => `tokenRefs.${target}`);

  return [
    'name',
    'visibility.hidden',
    'visibility.locked',
    ...FRONTEND_DESIGN_LAYER_TARGETS.map((target) => `layout.${target}`),
    ...propPaths,
    ...stylePaths,
    ...tokenRefPaths,
    ...FRONTEND_DESIGN_BREAKPOINTS.flatMap((breakpoint) => (
      FRONTEND_DESIGN_RESPONSIVE_LAYER_TARGETS.map((target) => `responsive.${breakpoint}.${target}`)
    )),
    ...FRONTEND_DESIGN_BREAKPOINTS.flatMap((breakpoint) => (
      propPaths.map((path) => `responsive.${breakpoint}.${path}`)
    )),
    ...FRONTEND_DESIGN_BREAKPOINTS.flatMap((breakpoint) => (
      stylePaths.map((path) => `responsive.${breakpoint}.${path}`)
    )),
    ...FRONTEND_DESIGN_BREAKPOINTS.flatMap((breakpoint) => (
      tokenRefPaths.map((path) => `responsive.${breakpoint}.${path}`)
    )),
    ...FRONTEND_DESIGN_ANIMATION_TARGETS,
    ...FRONTEND_DESIGN_INTERACTION_TARGETS,
  ];
};

const editableMapEntriesFromRecord = (
  editableMap: unknown,
): FrontendDesignEditableMapEntry[] => {
  if (!isRecord(editableMap)) return [];

  return Object.entries(editableMap)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([key, entry]) => normalizeFrontendDesignEditableMapEntry({
      ...entry,
      field: stringValue(entry.field) || key,
      targetPath: stringValue(entry.targetPath) || stringValue(entry.path) || stringValue(entry.field) || key,
      editable: booleanValue(entry.editable) ?? true,
      valueType: stringValue(entry.valueType)
        || inferFrontendDesignEditableValueType(
          stringValue(entry.targetPath) || stringValue(entry.path) || stringValue(entry.field) || key,
          entry.value,
        ),
    }));
};

const editableMapRecordKey = (
  entry: FrontendDesignEditableMapEntry,
): string | undefined => {
  const elementId = stringValue(entry.elementId);
  const field = stringValue(entry.field);
  const targetPath = stringValue(entry.targetPath);
  const binding = stringValue(entry.binding);
  const sourceField = stringValue(entry.sourceField);
  const explicitFieldAlias = field && field !== targetPath && !field.includes('.');

  if (explicitFieldAlias) return field;
  if (sourceField && elementId) return `${elementId}.${sourceField}`;
  if (binding && elementId && binding !== 'element.animation') return `${elementId}.${binding}`;
  if (field && field !== targetPath && !field.startsWith('props.') && !field.startsWith('styles.')) return field;
  if (elementId && targetPath) return `${elementId}.${targetPath}`;
  if (elementId && field) return `${elementId}.${field}`;
  return targetPath || field || binding || stringValue(entry.role);
};

const editableMapRecordFromEntries = (
  entries: FrontendDesignEditableMapEntry[],
): Record<string, unknown> | undefined => {
  const record: Record<string, unknown> = {};

  for (const entry of entries) {
    const baseKey = editableMapRecordKey(entry);
    if (!baseKey) continue;

    let key = baseKey;
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(record, key)) {
      key = `${baseKey}.${suffix}`;
      suffix += 1;
    }
    record[key] = entry;
  }

  return Object.keys(record).length > 0 ? record : undefined;
};

export const emptyFrontendDesignContract = (): FrontendDesignContract => ({
  schemaVersion: SCHEMA_VERSION,
  status: 'unconfigured',
  source: {
    type: 'manual',
    label: 'No custom frontend connected',
  },
  tokens: {},
  chrome: {},
  templates: [],
  editableMap: [],
  notes: 'Connect or import a frontend design contract so Backy can preserve site chrome, tokens, templates, and editable bindings for new content.',
});

export const normalizeFrontendDesignContract = (
  value: unknown,
  options: { updatedAt?: string; fallback?: FrontendDesignContract; mergeFallback?: boolean } = {},
): FrontendDesignContract => {
  if (!isRecord(value)) {
    return options.fallback ? { ...options.fallback } : emptyFrontendDesignContract();
  }

  const input = options.mergeFallback
    ? mergeFrontendDesignContractInput(value, options.fallback)
    : value;
  const sourceInput = isRecord(input.source) ? input.source : {};
  const tokensInput = isRecord(input.tokens) ? input.tokens : {};
  const chromeInput = isRecord(input.chrome) ? input.chrome : {};

  return {
    schemaVersion: stringValue(input.schemaVersion) || SCHEMA_VERSION,
    status: normalizeStatus(input.status),
    source: {
      type: normalizeSourceType(sourceInput.type),
      label: stringValue(sourceInput.label),
      url: stringValue(sourceInput.url),
      repository: stringValue(sourceInput.repository),
      branch: stringValue(sourceInput.branch),
      capturedAt: stringValue(sourceInput.capturedAt) || options.updatedAt,
    },
    tokens: {
      colors: stringRecord(tokensInput.colors),
      fonts: stringRecord(tokensInput.fonts),
      typography: objectRecord(tokensInput.typography),
      spacing: objectRecord(tokensInput.spacing),
      radii: objectRecord(tokensInput.radii),
      shadows: objectRecord(tokensInput.shadows),
      motion: motionTokenRecord(tokensInput.motion),
      breakpoints: objectRecord(tokensInput.breakpoints),
      layout: objectRecord(tokensInput.layout),
      customCss: stringValue(tokensInput.customCss) || stringValue(tokensInput.customCSS),
    },
    chrome: {
      header: objectRecord(chromeInput.header),
      navigation: objectRecord(chromeInput.navigation),
      footer: objectRecord(chromeInput.footer),
    },
    templates: Array.isArray(input.templates)
      ? input.templates
          .filter(isRecord)
          .map((template, index) => {
            const canvasSize = isRecord(template.canvasSize)
              ? {
                  width: Number(template.canvasSize.width) || 1200,
                  height: Number(template.canvasSize.height) || 900,
                }
              : undefined;
            const version = typeof template.version === 'string' || typeof template.version === 'number'
              ? template.version
              : undefined;

            return {
              id: stringValue(template.id) || `template-${index + 1}`,
              type: normalizeTemplateType(template.type),
              name: stringValue(template.name) || `Template ${index + 1}`,
              ...(stringValue(template.status) ? { status: stringValue(template.status) } : {}),
              ...(version !== undefined ? { version } : {}),
              ...(stringValue(template.createdAt) ? { createdAt: stringValue(template.createdAt) } : {}),
              ...(stringValue(template.updatedAt) ? { updatedAt: stringValue(template.updatedAt) } : {}),
              routePattern: stringValue(template.routePattern),
              description: stringValue(template.description),
              canvasSize,
              content: objectRecord(template.content),
              bindingHints: Array.isArray(template.bindingHints)
                ? template.bindingHints.filter(isRecord).map((hint) => ({ ...hint }))
                : undefined,
            };
          })
      : [],
    editableMap: Array.isArray(input.editableMap)
      ? input.editableMap
          .filter(isRecord)
          .map(normalizeFrontendDesignEditableMapEntry)
      : [],
    notes: stringValue(input.notes),
    updatedAt: options.updatedAt || stringValue(input.updatedAt),
  };
};

export const buildSiteDefaultFrontendDesignContract = (input: {
  site: { name: string; slug: string; customDomain?: string | null; theme?: unknown; settings?: SiteSettings };
  pageTemplates?: Array<{ id: string; title: string; slug: string; type?: 'page' | 'blogPost' }>;
  updatedAt?: string;
}): FrontendDesignContract => {
  const updatedAt = input.updatedAt || new Date().toISOString();
  const theme = isRecord(input.site.theme) ? input.site.theme : {};
  const navigation = input.site.settings?.navigation;

  return normalizeFrontendDesignContract({
    schemaVersion: SCHEMA_VERSION,
    status: 'captured',
    source: {
      type: 'managed-site',
      label: `${input.site.name} Backy managed design`,
      url: input.site.customDomain || `/${input.site.slug}`,
      capturedAt: updatedAt,
    },
    tokens: {
      colors: isRecord(theme.colors) ? theme.colors : undefined,
      fonts: isRecord(theme.fonts) ? theme.fonts : undefined,
      typography: isRecord(theme.typography) ? theme.typography : undefined,
      spacing: isRecord(theme.spacing) ? theme.spacing : undefined,
      radii: isRecord(theme.radii) ? theme.radii : undefined,
      shadows: isRecord(theme.shadows) ? theme.shadows : undefined,
      motion: isRecord(theme.motion) ? theme.motion : undefined,
      breakpoints: isRecord(theme.breakpoints) ? theme.breakpoints : undefined,
      layout: isRecord(theme.layout) ? theme.layout : undefined,
      customCss: stringValue(theme.customCSS) || stringValue(theme.customCss),
    },
    chrome: {
      header: {
        ...(navigation?.layout?.header || {}),
        primaryItemCount: navigation?.primary.length || 0,
      },
      navigation: {
        primary: navigation?.primary || [],
        footer: navigation?.footer || [],
      },
      footer: {
        ...(navigation?.layout?.footer || {}),
        footerItemCount: navigation?.footer?.length || 0,
      },
    },
    templates: (input.pageTemplates || []).map((template) => ({
      id: template.id,
      type: template.type || 'page',
      name: template.title,
      routePattern: template.slug === 'home' || template.slug === 'index' ? '/' : `/${template.slug}`,
      description: 'Captured from the current Backy site structure.',
    })),
    editableMap: [
      { role: 'site.header', binding: 'site.navigation.primary', fields: ['label', 'href', 'children'] },
      { role: 'site.footer', binding: 'site.navigation.footer', fields: ['label', 'href', 'children'] },
      { role: 'site.tokens', binding: 'site.theme', fields: ['colors', 'fonts', 'spacing'] },
    ],
    notes: 'Captured from the current Backy site so new pages and posts can inherit the same chrome and design tokens.',
  }, { updatedAt });
};

const contentCanvasSize = (content: unknown): { width: number; height: number } | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const metadata = isRecord(contentRecord.metadata) ? contentRecord.metadata : {};
  const canvasSize = isRecord(contentRecord.canvasSize)
    ? contentRecord.canvasSize
    : isRecord(metadata.canvasSize)
      ? metadata.canvasSize
      : undefined;

  if (!canvasSize) return undefined;

  return {
    width: Number(canvasSize.width) || 1200,
    height: Number(canvasSize.height) || 900,
  };
};

const contentCustomCss = (content: unknown): string | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const metadata = contentMetadata(contentRecord) || {};
  return stringValue(contentRecord.customCSS)
    || stringValue(contentRecord.customCss)
    || stringValue(metadata.customCSS)
    || stringValue(metadata.customCss);
};

const contentMetadata = (content: unknown): Record<string, unknown> | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const contentDocument = isRecord(contentRecord.contentDocument) ? contentRecord.contentDocument : undefined;
  const metadata = {
    ...(cloneRecord(contentRecord.metadata) || {}),
    ...(cloneRecord(contentDocument?.metadata) || {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const contentCustomJs = (content: unknown): string | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const metadata = contentMetadata(contentRecord) || {};
  return stringValue(contentRecord.customJS)
    || stringValue(contentRecord.customJs)
    || stringValue(metadata.customJS)
    || stringValue(metadata.customJs);
};

const designStateRecord = (
  content: unknown,
  key: string,
): Record<string, unknown> | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const contentDocument = isRecord(contentRecord.contentDocument) ? contentRecord.contentDocument : undefined;
  const metadata = contentMetadata(contentRecord) || {};
  return cloneRecord(contentRecord[key]) || cloneRecord(contentDocument?.[key]) || cloneRecord(metadata[key]);
};

const designStateValue = (
  content: unknown,
  key: string,
): Record<string, unknown> | unknown[] | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const contentDocument = isRecord(contentRecord.contentDocument) ? contentRecord.contentDocument : undefined;
  const metadata = contentMetadata(contentRecord) || {};
  const directValue = contentRecord[key];
  if (Array.isArray(directValue)) return cloneArray(directValue);
  if (isRecord(directValue)) return cloneRecord(directValue);

  const documentValue = contentDocument?.[key];
  if (Array.isArray(documentValue)) return cloneArray(documentValue);
  if (isRecord(documentValue)) return cloneRecord(documentValue);

  const metadataValue = metadata[key];
  if (Array.isArray(metadataValue)) return cloneArray(metadataValue);
  if (isRecord(metadataValue)) return cloneRecord(metadataValue);

  return undefined;
};

const contentDesignStatePayload = (content: unknown): Record<string, unknown> => {
  const metadata = contentMetadata(content);
  const customJS = contentCustomJs(content);
  const themeTokenRefs = stringRecord(
    isRecord(content) ? content.themeTokenRefs : undefined,
  ) || stringRecord(metadata?.themeTokenRefs);
  const assets = designStateValue(content, 'assets');
  const animations = designStateValue(content, 'animations');
  const interactions = designStateValue(content, 'interactions');
  const dataBindings = designStateRecord(content, 'dataBindings');
  const editableMap = designStateRecord(content, 'editableMap');
  const seo = designStateRecord(content, 'seo');

  return {
    ...(customJS ? { customJS } : {}),
    ...(themeTokenRefs ? { themeTokenRefs } : {}),
    ...(assets ? { assets } : {}),
    ...(animations ? { animations } : {}),
    ...(interactions ? { interactions } : {}),
    ...(dataBindings ? { dataBindings } : {}),
    ...(editableMap ? { editableMap } : {}),
    ...(seo ? { seo } : {}),
    ...(metadata ? { metadata } : {}),
  };
};

const contentElements = (content: unknown): unknown[] => {
  const contentRecord = isRecord(content) ? content : {};
  if (Array.isArray(contentRecord.elements)) return cloneArray(contentRecord.elements);
  const contentDocument = isRecord(contentRecord.contentDocument) ? contentRecord.contentDocument : undefined;
  if (Array.isArray(contentDocument?.elements)) return cloneArray(contentDocument.elements);
  return [];
};

const contentTemplatePayload = (content: unknown) => {
  const contentRecord = isRecord(content) ? content : {};
  const baseRecord = cloneRecord(contentRecord) || {};
  const contentDocument = isRecord(contentRecord.contentDocument)
    ? cloneRecord(contentRecord.contentDocument)
    : isRecord(contentRecord) && Array.isArray(contentRecord.elements) && isRecord(contentRecord.metadata)
      ? cloneRecord(contentRecord)
      : undefined;
  const canvasSize = contentCanvasSize(content) || { width: 1200, height: 900 };
  const customCSS = contentCustomCss(content);
  const designState = contentDesignStatePayload(content);
  const elements = contentElements(content);
  const editableMap = editableMapRecordFromContentElements(elements, designState.editableMap);
  const designStateWithEditableMap = {
    ...designState,
    ...(editableMap ? { editableMap } : {}),
  };

  if (elements.length === 0 && !contentDocument && Object.keys(baseRecord).length > 0) {
    return {
      ...baseRecord,
      elements,
      canvasSize,
      ...(customCSS ? { customCSS } : {}),
      ...designStateWithEditableMap,
    };
  }

  return {
    elements,
    canvasSize,
    ...(customCSS ? { customCSS } : {}),
    ...designStateWithEditableMap,
    ...(contentDocument ? { contentDocument } : {}),
  };
};

const directDesignEnvelopeFromBody = (
  body: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const candidates = [body.design, body.frontendDesign, body.designEnvelope, body.frontendDesignEnvelope];
  return candidates.find(isRecord);
};

const directDesignContentInput = (
  envelope: Record<string, unknown>,
  explicitContent: unknown,
): Record<string, unknown> => {
  const nestedContent = Array.isArray(envelope.content)
    ? { elements: cloneArray(envelope.content) }
    : cloneRecord(envelope.content) || {};
  const directContent = {
    ...nestedContent,
    ...(cloneRecord(envelope.contentDocument) ? { contentDocument: cloneRecord(envelope.contentDocument) } : {}),
    ...(Array.isArray(envelope.elements) ? { elements: cloneArray(envelope.elements) } : {}),
    ...(cloneRecord(envelope.canvasSize) ? { canvasSize: cloneRecord(envelope.canvasSize) } : {}),
    ...(stringValue(envelope.customCSS) || stringValue(envelope.customCss)
      ? { customCSS: stringValue(envelope.customCSS) || stringValue(envelope.customCss) }
      : {}),
    ...(stringValue(envelope.customJS) || stringValue(envelope.customJs)
      ? { customJS: stringValue(envelope.customJS) || stringValue(envelope.customJs) }
      : {}),
    ...(cloneRecord(envelope.themeTokenRefs) ? { themeTokenRefs: cloneRecord(envelope.themeTokenRefs) } : {}),
    ...(Array.isArray(envelope.assets) ? { assets: cloneArray(envelope.assets) } : cloneRecord(envelope.assets) ? { assets: cloneRecord(envelope.assets) } : {}),
    ...(Array.isArray(envelope.animations)
      ? { animations: cloneArray(envelope.animations) }
      : cloneRecord(envelope.animations)
        ? { animations: cloneRecord(envelope.animations) }
        : {}),
    ...(Array.isArray(envelope.frontendDesignAnimations)
      ? { animations: cloneArray(envelope.frontendDesignAnimations) }
      : cloneRecord(envelope.frontendDesignAnimations)
        ? { animations: cloneRecord(envelope.frontendDesignAnimations) }
        : {}),
    ...(Array.isArray(envelope.interactions) ? { interactions: cloneArray(envelope.interactions) } : cloneRecord(envelope.interactions) ? { interactions: cloneRecord(envelope.interactions) } : {}),
    ...(cloneRecord(envelope.dataBindings) ? { dataBindings: cloneRecord(envelope.dataBindings) } : {}),
    ...(cloneRecord(envelope.frontendDesignEditableMap)
      ? { editableMap: cloneRecord(envelope.frontendDesignEditableMap) }
      : cloneRecord(envelope.editableMap)
        ? { editableMap: cloneRecord(envelope.editableMap) }
        : {}),
    ...(cloneRecord(envelope.seo) ? { seo: cloneRecord(envelope.seo) } : {}),
    ...(cloneRecord(envelope.metadata) ? { metadata: cloneRecord(envelope.metadata) } : {}),
  };

  const explicit = Array.isArray(explicitContent)
    ? { elements: cloneArray(explicitContent) }
    : cloneRecord(explicitContent) || {};
  return {
    ...directContent,
    ...explicit,
  };
};

const directDesignString = (
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
  keys: string[],
): string | undefined => {
  const metadata = contentMetadata(content) || {};
  for (const key of keys) {
    const value = stringValue(envelope[key]) || stringValue(content[key]) || stringValue(metadata[key]);
    if (value) return value;
  }
  return undefined;
};

const templateIdSegment = (value: unknown): string | undefined => {
  const text = stringValue(value);
  if (!text) return undefined;

  const segment = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return segment || undefined;
};

const fallbackTemplateId = (
  prefix: string,
  values: unknown[],
): string => {
  const segment = values.map(templateIdSegment).find(Boolean);
  return segment ? `${prefix}-${segment}` : `${prefix}-direct-design`;
};

const directDesignTemplateId = (
  body: Record<string, unknown>,
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
  prefix: string,
  extraCandidates: unknown[] = [],
): string => {
  const contentDocument = isRecord(content.contentDocument) ? content.contentDocument : {};
  const metadata = contentMetadata(content) || {};
  return stringValue(body.frontendDesignTemplateId)
    || stringValue(body.designTemplateId)
    || directDesignString(envelope, content, ['frontendDesignTemplateId', 'templateId', 'designTemplateId'])
    || fallbackTemplateId(prefix, [
      envelope.id,
      envelope.name,
      envelope.label,
      content.frontendDesignTemplateId,
      content.templateId,
      contentDocument.id,
      contentDocument.title,
      metadata.frontendDesignTemplateId,
      metadata.templateId,
      metadata.title,
      body.slug,
      body.title,
      body.name,
      body.id,
      ...extraCandidates,
    ]);
};

const directDesignRecord = (
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined => {
  const metadata = contentMetadata(content) || {};
  for (const key of keys) {
    const value = cloneRecord(envelope[key]) || cloneRecord(content[key]) || cloneRecord(metadata[key]);
    if (value) return value;
  }
  return undefined;
};

const directDesignEditableMapRecord = (
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
): Record<string, unknown> | undefined => (
  cloneRecord(content.editableMap) ||
  cloneRecord(content.frontendDesignEditableMap) ||
  cloneRecord(envelope.frontendDesignEditableMap) ||
  cloneRecord(envelope.editableMap)
);

const directDesignArray = (
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
  keys: string[],
): unknown[] | undefined => {
  const metadata = contentMetadata(content) || {};
  for (const key of keys) {
    const envelopeValue = envelope[key];
    if (Array.isArray(envelopeValue)) return cloneArray(envelopeValue);
    const contentValue = content[key];
    if (Array.isArray(contentValue)) return cloneArray(contentValue);
    const metadataValue = metadata[key];
    if (Array.isArray(metadataValue)) return cloneArray(metadataValue);
  }
  return undefined;
};

const applyProvenanceField = (
  meta: Record<string, unknown>,
  key: string,
  value: unknown,
) => {
  if (meta[key] !== undefined || value === undefined) return;
  meta[key] = value;
};

const directFrontendDesignMeta = (
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
  existingMeta: unknown,
  fallbackTemplateIdValue?: string,
): Record<string, unknown> | undefined => {
  const meta = cloneRecord(existingMeta) || {};
  applyProvenanceField(
    meta,
    'frontendDesignTemplateId',
    directDesignString(envelope, content, ['frontendDesignTemplateId', 'templateId', 'designTemplateId'])
      || fallbackTemplateIdValue,
  );
  applyProvenanceField(meta, 'frontendDesignTemplateName', directDesignString(envelope, content, ['frontendDesignTemplateName', 'templateName']));
  applyProvenanceField(meta, 'frontendDesignRoutePattern', directDesignString(envelope, content, ['frontendDesignRoutePattern', 'routePattern']));
  applyProvenanceField(meta, 'frontendDesignSource', directDesignRecord(envelope, content, ['frontendDesignSource', 'source']));
  applyProvenanceField(meta, 'frontendDesignTokens', directDesignRecord(envelope, content, ['frontendDesignTokens', 'tokens']));
  applyProvenanceField(meta, 'frontendDesignChrome', directDesignRecord(envelope, content, ['frontendDesignChrome', 'chrome']));
  applyProvenanceField(meta, 'frontendDesignCustomCss', directDesignString(envelope, content, ['frontendDesignCustomCss', 'customCSS', 'customCss']));
  applyProvenanceField(meta, 'frontendDesignCustomJs', directDesignString(envelope, content, ['frontendDesignCustomJs', 'customJS', 'customJs']));
  applyProvenanceField(meta, 'frontendDesignContentDocument', directDesignRecord(envelope, content, ['frontendDesignContentDocument', 'contentDocument']));
  applyProvenanceField(meta, 'frontendDesignElements', directDesignArray(envelope, content, ['frontendDesignElements', 'elements']));
  applyProvenanceField(meta, 'frontendDesignCanvasSize', directDesignRecord(envelope, content, ['frontendDesignCanvasSize', 'canvasSize']));
  applyProvenanceField(meta, 'frontendDesignThemeTokenRefs', directDesignRecord(envelope, content, ['frontendDesignThemeTokenRefs', 'themeTokenRefs']));
  applyProvenanceField(meta, 'frontendDesignAssets', directDesignArray(envelope, content, ['frontendDesignAssets', 'assets']) || directDesignRecord(envelope, content, ['frontendDesignAssets', 'assets']));
  applyProvenanceField(meta, 'frontendDesignAnimations', directDesignArray(envelope, content, ['frontendDesignAnimations', 'animations']) || directDesignRecord(envelope, content, ['frontendDesignAnimations', 'animations']));
  applyProvenanceField(meta, 'frontendDesignInteractions', directDesignArray(envelope, content, ['frontendDesignInteractions', 'interactions']) || directDesignRecord(envelope, content, ['frontendDesignInteractions', 'interactions']));
  applyProvenanceField(meta, 'frontendDesignDataBindings', directDesignRecord(envelope, content, ['frontendDesignDataBindings', 'dataBindings']));
  applyProvenanceField(meta, 'frontendDesignEditableMap', directDesignEditableMapRecord(envelope, content));
  applyProvenanceField(meta, 'frontendDesignSeo', directDesignRecord(envelope, content, ['frontendDesignSeo', 'seo']));
  applyProvenanceField(meta, 'frontendDesignMetadata', directDesignRecord(envelope, content, ['frontendDesignMetadata', 'metadata']));
  applyProvenanceField(meta, 'frontendDesignBindingHints', directDesignArray(envelope, content, ['frontendDesignBindingHints', 'bindingHints']));
  return Object.keys(meta).length > 0 ? meta : undefined;
};

const normalizeInputFromDirectFrontendDesignEnvelopeForMetaKey = (
  body: Record<string, unknown>,
  metaKey: 'meta' | 'metadata',
): Record<string, unknown> => {
  const envelope = directDesignEnvelopeFromBody(body);
  if (!envelope) return body;

  const content = contentTemplatePayload(directDesignContentInput(envelope, body.content));
  const templateId = directDesignTemplateId(
    body,
    envelope,
    content,
    metaKey === 'metadata' ? 'section' : 'content',
  );
  const meta = directFrontendDesignMeta(envelope, content, body[metaKey], templateId);

  return {
    ...body,
    content,
    ...(meta ? { [metaKey]: meta } : {}),
    ...(templateId ? { frontendDesignTemplateId: templateId } : {}),
  };
};

export const normalizeInputFromDirectFrontendDesignEnvelope = (
  body: Record<string, unknown>,
): Record<string, unknown> => normalizeInputFromDirectFrontendDesignEnvelopeForMetaKey(body, 'meta');

export const normalizeReusableSectionInputFromDirectFrontendDesignEnvelope = (
  body: Record<string, unknown>,
): Record<string, unknown> => normalizeInputFromDirectFrontendDesignEnvelopeForMetaKey(body, 'metadata');

const applyCollectionRecordDesignField = (
  design: Record<string, unknown>,
  key: string,
  frontendKey: string,
  value: unknown,
) => {
  if (value === undefined) return;
  design[key] = value;
  design[frontendKey] = value;
};

const collectionRecordDesignEnvelope = (
  envelope: Record<string, unknown>,
  content: Record<string, unknown>,
  existingDesign: unknown,
  fallbackTemplateIdValue?: string,
): Record<string, unknown> | undefined => {
  const design: Record<string, unknown> = {
    ...(cloneRecord(envelope) || {}),
    ...(cloneRecord(existingDesign) || {}),
  };

  applyCollectionRecordDesignField(
    design,
    'templateId',
    'frontendDesignTemplateId',
    directDesignString(envelope, content, ['frontendDesignTemplateId', 'templateId', 'designTemplateId'])
      || fallbackTemplateIdValue,
  );
  applyCollectionRecordDesignField(
    design,
    'templateName',
    'frontendDesignTemplateName',
    directDesignString(envelope, content, ['frontendDesignTemplateName', 'templateName']),
  );
  applyCollectionRecordDesignField(
    design,
    'routePattern',
    'frontendDesignRoutePattern',
    directDesignString(envelope, content, ['frontendDesignRoutePattern', 'routePattern']),
  );
  applyCollectionRecordDesignField(
    design,
    'source',
    'frontendDesignSource',
    directDesignRecord(envelope, content, ['frontendDesignSource', 'source']),
  );
  applyCollectionRecordDesignField(
    design,
    'tokens',
    'frontendDesignTokens',
    directDesignRecord(envelope, content, ['frontendDesignTokens', 'tokens']),
  );
  applyCollectionRecordDesignField(
    design,
    'chrome',
    'frontendDesignChrome',
    directDesignRecord(envelope, content, ['frontendDesignChrome', 'chrome']),
  );
  applyCollectionRecordDesignField(
    design,
    'customCss',
    'frontendDesignCustomCss',
    directDesignString(envelope, content, ['frontendDesignCustomCss', 'customCSS', 'customCss']),
  );
  applyCollectionRecordDesignField(
    design,
    'customJs',
    'frontendDesignCustomJs',
    directDesignString(envelope, content, ['frontendDesignCustomJs', 'customJS', 'customJs']),
  );
  applyCollectionRecordDesignField(
    design,
    'contentDocument',
    'frontendDesignContentDocument',
    directDesignRecord(envelope, content, ['frontendDesignContentDocument', 'contentDocument']),
  );
  applyCollectionRecordDesignField(
    design,
    'elements',
    'frontendDesignElements',
    directDesignArray(envelope, content, ['frontendDesignElements', 'elements']),
  );
  applyCollectionRecordDesignField(
    design,
    'canvasSize',
    'frontendDesignCanvasSize',
    directDesignRecord(envelope, content, ['frontendDesignCanvasSize', 'canvasSize']),
  );
  applyCollectionRecordDesignField(
    design,
    'themeTokenRefs',
    'frontendDesignThemeTokenRefs',
    directDesignRecord(envelope, content, ['frontendDesignThemeTokenRefs', 'themeTokenRefs']),
  );
  applyCollectionRecordDesignField(
    design,
    'assets',
    'frontendDesignAssets',
    directDesignArray(envelope, content, ['frontendDesignAssets', 'assets'])
      || directDesignRecord(envelope, content, ['frontendDesignAssets', 'assets']),
  );
  applyCollectionRecordDesignField(
    design,
    'animations',
    'frontendDesignAnimations',
    directDesignArray(envelope, content, ['frontendDesignAnimations', 'animations'])
      || directDesignRecord(envelope, content, ['frontendDesignAnimations', 'animations']),
  );
  applyCollectionRecordDesignField(
    design,
    'interactions',
    'frontendDesignInteractions',
    directDesignArray(envelope, content, ['frontendDesignInteractions', 'interactions'])
      || directDesignRecord(envelope, content, ['frontendDesignInteractions', 'interactions']),
  );
  applyCollectionRecordDesignField(
    design,
    'dataBindings',
    'frontendDesignDataBindings',
    directDesignRecord(envelope, content, ['frontendDesignDataBindings', 'dataBindings']),
  );
  applyCollectionRecordDesignField(
    design,
    'editableMap',
    'frontendDesignEditableMap',
    directDesignEditableMapRecord(envelope, content),
  );
  applyCollectionRecordDesignField(
    design,
    'seo',
    'frontendDesignSeo',
    directDesignRecord(envelope, content, ['frontendDesignSeo', 'seo']),
  );
  applyCollectionRecordDesignField(
    design,
    'metadata',
    'frontendDesignMetadata',
    directDesignRecord(envelope, content, ['frontendDesignMetadata', 'metadata']),
  );
  applyCollectionRecordDesignField(
    design,
    'bindingHints',
    'frontendDesignBindingHints',
    directDesignArray(envelope, content, ['frontendDesignBindingHints', 'bindingHints']),
  );

  return Object.keys(design).length > 0 ? design : undefined;
};

export const normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope = (
  body: Record<string, unknown>,
): Record<string, unknown> => {
  const envelope = directDesignEnvelopeFromBody(body);
  if (!envelope) return body;

  const currentValues = cloneRecord(body.values) || {};
  const content = contentTemplatePayload(
    directDesignContentInput(envelope, currentValues.design),
  );
  const templateId = directDesignTemplateId(
    body,
    envelope,
    content,
    'record',
    [
      currentValues.slug,
      currentValues.title,
      currentValues.name,
      currentValues.sku,
      currentValues.id,
    ],
  );
  const design = collectionRecordDesignEnvelope(envelope, content, currentValues.design, templateId);
  const values = directFrontendDesignMeta(envelope, content, currentValues, templateId) || currentValues;

  return {
    ...body,
    values: {
      ...currentValues,
      ...values,
      ...(design ? { design } : {}),
    },
    ...(templateId ? { frontendDesignTemplateId: templateId } : {}),
  };
};

const inferEditableMapFromElements = (
  elements: unknown[],
  entries: FrontendDesignEditableMapEntry[] = [],
) => {
  for (const element of elements) {
    if (!isRecord(element)) continue;

    const elementId = stringValue(element.id);
    const elementType = stringValue(element.type);
    const props = isRecord(element.props) ? element.props : {};
    const binding = stringValue(props.binding);
    if (binding) {
      entries.push(normalizeFrontendDesignEditableMapEntry({
        elementId,
        role: elementType,
        binding,
        fields: [binding.split('.').filter(Boolean).at(-1)].filter((field): field is string => Boolean(field)),
        field: binding,
        targetPath: 'props.content',
        editable: true,
        valueType: 'string',
        scope: 'element',
        label: frontendDesignEditableLabel(elementType, 'props.content'),
      }));
    }

    defaultFrontendDesignEditableTargetPathsForElement(element).forEach((targetPath) => {
      pushFrontendDesignEditableMapEntry(entries, {
        elementId,
        elementType,
        targetPath,
        value: frontendDesignEditableTargetValue(element, targetPath),
      });
    });

    if (Array.isArray(element.dataBindings)) {
      for (const bindingEntry of element.dataBindings) {
        if (!isRecord(bindingEntry)) continue;
        const sourceRecord = isRecord(bindingEntry.source) ? bindingEntry.source : {};
        const source = stringValue(bindingEntry.source)
          || stringValue(sourceRecord.field)
          || stringValue(sourceRecord.kind);
        const targetPath = stringValue(bindingEntry.targetPath) || 'props.content';
        const fields = stringArrayValue(bindingEntry.fields)
          || [stringValue(sourceRecord.field), stringValue(bindingEntry.field)].filter((field): field is string => Boolean(field));
        pushFrontendDesignEditableMapEntry(entries, {
          elementId,
          elementType,
          targetPath,
          value: frontendDesignEditableTargetValue(element, targetPath),
          binding: source,
          fields,
          sourceField: stringValue(sourceRecord.field) || stringValue(bindingEntry.field),
        });
      }
    }

    const metadata = isRecord(element.metadata) ? element.metadata : {};
    const animation = isRecord(element.animation)
      ? element.animation
      : isRecord(metadata.animation)
        ? metadata.animation
        : undefined;
    if (animation && Object.keys(animation).length > 0) {
      Object.keys(animation).forEach((field) => {
        const targetPath = `animation.${field}`;
        pushFrontendDesignEditableMapEntry(entries, {
          elementId,
          elementType: `${elementType || 'element'}.animation`,
          targetPath,
          value: frontendDesignEditableTargetValue(element, targetPath),
          binding: 'element.animation',
          fields: [field],
          sourceField: field,
        });
      });
    }

    if (Array.isArray(element.children)) {
      inferEditableMapFromElements(element.children, entries);
    }
  }

  return entries;
};

const dedupeEditableMap = (entries: FrontendDesignEditableMapEntry[]) => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = [
      entry.selector || '',
      entry.elementId || '',
      entry.role || '',
      entry.binding || '',
      entry.field || '',
      entry.targetPath || '',
      entry.sourceField || '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(entry.selector || entry.elementId || entry.binding || entry.role || entry.field || entry.targetPath);
  });
};

const editableMapRecordFromContentElements = (
  elements: unknown[],
  editableMap: unknown,
): Record<string, unknown> | undefined => {
  const explicitEditableMap = editableMapEntriesFromRecord(editableMap);
  const inferredEditableMap = inferEditableMapFromElements(elements);
  return editableMapRecordFromEntries(
    dedupeEditableMap([
      ...explicitEditableMap,
      ...inferredEditableMap,
    ]),
  );
};

export const buildFrontendDesignContractFromContentTemplate = (input: {
  frontendDesign?: SiteSettings['frontendDesign'];
  resource: {
    id: string;
    type: ContentTemplateResourceType;
    title: string;
    slug: string;
    description?: string | null;
    content: unknown;
    meta?: Record<string, unknown>;
  };
  templateId?: string;
  templateName?: string;
  routePattern?: string;
  source?: Record<string, unknown>;
  bindingHints?: Array<Record<string, unknown>>;
  editableMap?: Array<Record<string, unknown>>;
  updatedAt?: string;
}): FrontendDesignContract => {
  const updatedAt = input.updatedAt || new Date().toISOString();
  const current = normalizeFrontendDesignContract(input.frontendDesign || emptyFrontendDesignContract(), { updatedAt });
  const meta = input.resource.meta || {};
  const content = contentTemplatePayload(input.resource.content);
  const templateId = input.templateId
    || stringValue(meta.frontendDesignTemplateId)
    || `${input.resource.type}-${input.resource.id}`;
  const defaultRoutePattern = input.resource.type === 'blogPost'
    ? `/blog/${input.resource.slug}`
    : input.resource.type === 'form'
      ? `/forms/${input.resource.slug}`
      : input.resource.type === 'product'
        ? `/products/${input.resource.slug}`
        : input.resource.type === 'section'
          ? `/sections/${input.resource.slug}`
          : input.resource.type === 'collection'
            ? `/${input.resource.slug}/:recordSlug`
            : `/${input.resource.slug}`;
  const routePattern = input.routePattern
    || stringValue(meta.frontendDesignRoutePattern)
    || defaultRoutePattern;
  const sourceInput = mergeRecord(current.source, meta.frontendDesignSource);
  const normalizedSource = normalizeFrontendDesignContract({
    source: mergeRecord(sourceInput, input.source) || {
      type: 'custom-frontend',
      label: 'Captured content template',
    },
  }, { updatedAt }).source;
  const customCss = content.customCSS || stringValue(meta.frontendDesignCustomCss) || current.tokens.customCss;
  const tokens = {
    ...current.tokens,
    ...(isRecord(meta.frontendDesignTokens) ? cloneRecord(meta.frontendDesignTokens) : {}),
    ...(customCss ? { customCss } : {}),
  };
  const chrome = {
    ...current.chrome,
    ...(isRecord(meta.frontendDesignChrome) ? cloneRecord(meta.frontendDesignChrome) : {}),
  };
  const contentRecord = content as Record<string, unknown>;
  const inferredEditableMap = inferEditableMapFromElements(content.elements);
  const contentEditableMap = editableMapEntriesFromRecord(contentRecord.editableMap);
  const explicitEditableMap = Array.isArray(input.editableMap)
    ? input.editableMap.filter(isRecord).map(normalizeFrontendDesignEditableMapEntry)
    : [];
  const capturedEditableMap = dedupeEditableMap([
    ...contentEditableMap,
    ...inferredEditableMap,
    ...explicitEditableMap,
  ]);
  const capturedEditableMapRecord = editableMapRecordFromEntries(capturedEditableMap);
  const templateContentWithEditableMap = {
    ...contentRecord,
    ...(capturedEditableMapRecord ? { editableMap: capturedEditableMapRecord } : {}),
  };
  const bindingHints = Array.isArray(input.bindingHints)
    ? input.bindingHints.filter(isRecord).map((hint) => ({ ...hint }))
    : Array.isArray(meta.frontendDesignBindingHints)
      ? meta.frontendDesignBindingHints.filter(isRecord).map((hint) => ({ ...hint }))
      : inferredEditableMap
          .filter((entry) => entry.binding)
          .map((entry) => ({
            elementId: entry.elementId,
            role: entry.role,
            binding: entry.binding,
            fields: entry.fields,
          }));
  const template: FrontendDesignTemplate = {
    id: templateId,
    type: input.resource.type,
    name: input.templateName || stringValue(meta.frontendDesignTemplateName) || input.resource.title,
    routePattern,
    description: input.resource.description || `Captured from ${input.resource.title}.`,
    canvasSize: content.canvasSize,
    content: templateContentWithEditableMap,
    bindingHints: bindingHints.length > 0 ? bindingHints : undefined,
  };

  return {
    ...current,
    status: 'captured',
    source: normalizedSource,
    tokens,
    chrome,
    templates: [
      ...current.templates.filter((candidate) => candidate.id !== template.id),
      template,
    ],
    editableMap: dedupeEditableMap([
      ...current.editableMap,
      ...capturedEditableMap,
    ]),
    notes: current.notes || 'Captured from content so new pages, posts, forms, products, collections, and sections can retain frontend design details.',
    updatedAt,
  };
};

export const frontendDesignProvenanceFromMetadata = (metadataInput: unknown) => {
  const metadata = isRecord(metadataInput) ? metadataInput : {};
  const contentDocument = isRecord(metadata.frontendDesignContentDocument)
    ? metadata.frontendDesignContentDocument
    : {};
  const source = isRecord(metadata.frontendDesignSource) ? metadata.frontendDesignSource : {};
  const hasFrontendDesignProvenance = Object.keys(metadata).some((key) => (
    key === 'frontendFieldKeyMap' || key.startsWith('frontendDesign')
  ));
  const templateId = stringValue(metadata.frontendDesignTemplateId)
    || (
      hasFrontendDesignProvenance
        ? fallbackTemplateId('content', [
            contentDocument.id,
            contentDocument.title,
            metadata.frontendDesignTemplateName,
            metadata.frontendDesignRoutePattern,
            source.label,
            source.url,
          ])
        : undefined
    );

  if (!templateId) {
    return undefined;
  }

  const arrayValue = (value: unknown): unknown[] | undefined => (
    Array.isArray(value) ? cloneArray(value) : undefined
  );
  const arrayOrRecordValue = (value: unknown): unknown[] | Record<string, unknown> | undefined => (
    cloneArrayOrRecord(value)
  );

  return {
    templateId,
    templateName: stringValue(metadata.frontendDesignTemplateName),
    routePattern: stringValue(metadata.frontendDesignRoutePattern),
    source: cloneRecord(metadata.frontendDesignSource),
    chrome: cloneRecord(metadata.frontendDesignChrome),
    tokens: cloneRecord(metadata.frontendDesignTokens),
    customCss: stringValue(metadata.frontendDesignCustomCss),
    customJs: stringValue(metadata.frontendDesignCustomJs),
    contentDocument: cloneRecord(metadata.frontendDesignContentDocument),
    elements: arrayValue(metadata.frontendDesignElements),
    canvasSize: cloneRecord(metadata.frontendDesignCanvasSize),
    themeTokenRefs: cloneRecord(metadata.frontendDesignThemeTokenRefs),
    assets: arrayOrRecordValue(metadata.frontendDesignAssets),
    animations: arrayOrRecordValue(metadata.frontendDesignAnimations),
    interactions: arrayOrRecordValue(metadata.frontendDesignInteractions),
    dataBindings: cloneRecord(metadata.frontendDesignDataBindings),
    editableMap: cloneRecord(metadata.frontendDesignEditableMap),
    seo: cloneRecord(metadata.frontendDesignSeo),
    metadata: cloneRecord(metadata.frontendDesignMetadata),
    fieldKeyMap: stringRecord(metadata.frontendFieldKeyMap),
    bindingHints: Array.isArray(metadata.frontendDesignBindingHints)
      ? cloneArray(metadata.frontendDesignBindingHints.filter(isRecord))
      : [],
  };
};

export const frontendFormFieldKeyMapFromMetadata = (metadataInput: unknown): Record<string, string> | undefined => {
  const metadata = isRecord(metadataInput) ? metadataInput : {};
  return stringRecord(metadata.frontendFieldKeyMap);
};

const templateRequestId = (input: Record<string, unknown>): string | undefined => {
  const meta = isRecord(input.meta) ? input.meta : {};
  return stringValue(input.frontendDesignTemplateId)
    || stringValue(input.designTemplateId)
    || stringValue(meta.frontendDesignTemplateId);
};

export const findFrontendDesignTemplate = (
  frontendDesign: SiteSettings['frontendDesign'] | undefined,
  type: FrontendDesignTemplateType,
  templateId: string,
): FrontendDesignTemplate | undefined => (
  frontendDesign?.templates?.find((template) => template.type === type && template.id === templateId)
);

const templateContentRecord = (template: FrontendDesignTemplate): Record<string, unknown> => (
  cloneRecord(template.content) || {}
);

const buildFrontendDesignProvenanceFields = (
  frontendDesign: FrontendDesignContract,
  template: FrontendDesignTemplate,
  existing: unknown,
): Record<string, unknown> => {
  const current = cloneRecord(existing) || {};
  const content = templateContentRecord(template);
  const metadata = contentMetadata(content) || {};
  const contentDocument = cloneRecord(current.frontendDesignContentDocument)
    || cloneRecord(content.contentDocument);
  const elements = Array.isArray(current.frontendDesignElements)
    ? cloneArray(current.frontendDesignElements)
    : Array.isArray(content.elements)
      ? cloneArray(content.elements)
      : undefined;
  const canvasSize = cloneRecord(current.frontendDesignCanvasSize)
    || cloneRecord(content.canvasSize)
    || cloneRecord(metadata.canvasSize);
  const themeTokenRefs = cloneRecord(current.frontendDesignThemeTokenRefs)
    || cloneRecord(content.themeTokenRefs)
    || cloneRecord(metadata.themeTokenRefs);
  const assets = cloneProvenanceArray(current.frontendDesignAssets)
    || cloneProvenanceArray(content.assets)
    || cloneProvenanceArray(metadata.assets);
  const interactions = cloneProvenanceArray(current.frontendDesignInteractions)
    || cloneProvenanceArray(content.interactions)
    || cloneProvenanceArray(metadata.interactions);
  const animations = cloneArrayOrRecord(current.frontendDesignAnimations)
    || cloneArrayOrRecord(content.animations)
    || cloneArrayOrRecord(metadata.animations);
  const dataBindings = cloneRecord(current.frontendDesignDataBindings)
    || cloneRecord(content.dataBindings)
    || cloneRecord(metadata.dataBindings);
  const editableMap = cloneRecord(current.frontendDesignEditableMap)
    || cloneRecord(content.editableMap)
    || cloneRecord(metadata.editableMap);
  const seo = cloneRecord(current.frontendDesignSeo)
    || cloneRecord(content.seo)
    || cloneRecord(metadata.seo);
  const designMetadata = cloneRecord(current.frontendDesignMetadata)
    || metadata;
  const customCss = stringValue(current.frontendDesignCustomCss)
    || contentCustomCss(content)
    || frontendDesign.tokens.customCss;
  const customJs = stringValue(current.frontendDesignCustomJs)
    || contentCustomJs(content);

  return {
    ...current,
    frontendDesignTemplateId: stringValue(current.frontendDesignTemplateId) || template.id,
    frontendDesignTemplateName: stringValue(current.frontendDesignTemplateName) || template.name,
    frontendDesignRoutePattern: stringValue(current.frontendDesignRoutePattern) || template.routePattern,
    frontendDesignSource: cloneRecord(current.frontendDesignSource) || cloneRecord(frontendDesign.source),
    frontendDesignTokens: cloneRecord(current.frontendDesignTokens) || cloneRecord(frontendDesign.tokens),
    frontendDesignChrome: cloneRecord(current.frontendDesignChrome) || cloneRecord(frontendDesign.chrome),
    frontendDesignCustomCss: customCss,
    ...(customJs ? { frontendDesignCustomJs: customJs } : {}),
    ...(contentDocument ? { frontendDesignContentDocument: contentDocument } : {}),
    ...(elements ? { frontendDesignElements: elements } : {}),
    ...(canvasSize ? { frontendDesignCanvasSize: canvasSize } : {}),
    ...(themeTokenRefs ? { frontendDesignThemeTokenRefs: themeTokenRefs } : {}),
    ...(assets ? { frontendDesignAssets: assets } : {}),
    ...(animations ? { frontendDesignAnimations: animations } : {}),
    ...(interactions ? { frontendDesignInteractions: interactions } : {}),
    ...(dataBindings ? { frontendDesignDataBindings: dataBindings } : {}),
    ...(editableMap ? { frontendDesignEditableMap: editableMap } : {}),
    ...(seo ? { frontendDesignSeo: seo } : {}),
    ...(Object.keys(designMetadata).length > 0 ? { frontendDesignMetadata: designMetadata } : {}),
    frontendDesignBindingHints: Array.isArray(current.frontendDesignBindingHints)
      ? cloneArray(current.frontendDesignBindingHints)
      : template.bindingHints ? cloneArray(template.bindingHints) : undefined,
  };
};

const templateContent = (
  frontendDesign: FrontendDesignContract,
  template: FrontendDesignTemplate,
  input: {
    kind: 'page' | 'post';
    title: string;
    description?: string | null;
    excerpt?: string | null;
  },
) => {
  const content = cloneRecord(template.content) || {};
  const contentDocument = cloneRecord(content.contentDocument);
  const metadata = contentMetadata(content) || {};
  const contentCanvasSize = cloneRecord(content.canvasSize);
  const metadataCanvasSize = cloneRecord(metadata?.canvasSize);
  const canvasSize = contentCanvasSize
    || metadataCanvasSize
    || (template.canvasSize ? { ...template.canvasSize } : undefined)
    || { width: 1200, height: 900 };
  const designState = contentDesignStatePayload(content);
  const customCSS = stringValue(content.customCSS)
    || stringValue(content.customCss)
    || stringValue(metadata?.customCSS)
    || frontendDesign.tokens.customCss;

  if (Array.isArray(content.elements)) {
    return {
      elements: cloneArray(content.elements),
      canvasSize,
      customCSS,
      ...designState,
      contentDocument,
    };
  }

  if (contentDocument && Array.isArray(contentDocument.elements)) {
    return {
      elements: cloneArray(contentDocument.elements),
      canvasSize,
      customCSS,
      ...designState,
      contentDocument,
    };
  }

  const isPost = input.kind === 'post';
  const titleBinding = isPost ? 'post.title' : 'page.title';
  const bodyBinding = isPost ? 'post.content' : 'page.content';
  const summaryBinding = isPost ? 'post.excerpt' : 'page.description';
  const summary = stringValue(input.excerpt)
    || stringValue(input.description)
    || template.description
    || (isPost
      ? 'This article was seeded from the connected frontend design contract.'
      : 'This page was seeded from the connected frontend design contract.');

  return {
    elements: [
      {
        id: `frontend-template-${template.id}`,
        type: 'section',
        x: 0,
        y: 0,
        width: Number(canvasSize.width) || 1200,
        height: Math.max(620, Number(canvasSize.height) || 900),
        props: {
          backgroundColor: '#ffffff',
          borderRadius: 0,
          padding: 0,
          frontendTemplateId: template.id,
          frontendTemplateName: template.name,
          routePattern: template.routePattern,
        },
        dataBindings: [
          {
            source: isPost ? 'blog' : 'page',
            mode: 'current',
            fields: isPost
              ? ['title', 'excerpt', 'author', 'publishedAt', 'coverImage', 'content']
              : ['title', 'description', 'content'],
          },
        ],
        children: [
          {
            id: `frontend-template-${template.id}-title`,
            type: 'heading',
            x: 72,
            y: 96,
            width: Math.min(760, (Number(canvasSize.width) || 1200) - 144),
            height: 112,
            props: {
              content: input.title || template.name,
              level: 'h1',
              fontSize: 52,
              fontWeight: '800',
              lineHeight: 1.08,
              color: frontendDesign.tokens.colors?.text || '#111827',
              binding: titleBinding,
            },
          },
          {
            id: `frontend-template-${template.id}-summary`,
            type: 'paragraph',
            x: 76,
            y: 238,
            width: Math.min(680, (Number(canvasSize.width) || 1200) - 152),
            height: 92,
            props: {
              content: summary,
              fontSize: 18,
              lineHeight: 1.6,
              color: '#4b5563',
              binding: summaryBinding,
            },
          },
          {
            id: `frontend-template-${template.id}-body`,
            type: 'box',
            x: 76,
            y: 388,
            width: Math.min(860, (Number(canvasSize.width) || 1200) - 152),
            height: 240,
            props: {
              backgroundColor: '#f8fafc',
              borderColor: '#cbd5e1',
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 8,
              binding: bodyBinding,
              bindingHints: template.bindingHints || [],
            },
            children: [
              {
                id: `frontend-template-${template.id}-body-copy`,
                type: 'paragraph',
                x: 28,
                y: 30,
                width: Math.min(760, (Number(canvasSize.width) || 1200) - 220),
                height: 96,
                props: {
                  content: isPost
                    ? 'Replace this placeholder with article content, embeds, or reusable frontend sections.'
                    : 'Replace this placeholder with editable sections captured from your frontend design.',
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: '#334155',
                },
              },
            ],
          },
        ],
      },
    ],
    canvasSize,
    customCSS,
    ...designState,
  };
};

const mergeTemplateDesignStateIntoContent = (
  frontendDesign: FrontendDesignContract,
  template: FrontendDesignTemplate,
  contentInput: unknown,
): Record<string, unknown> => {
  const existing = cloneRecord(contentInput) || {};
  const templateContentValue = templateContentRecord(template);
  const designState = contentDesignStatePayload(templateContentValue);
  const designMetadata = cloneRecord(designState.metadata);
  const existingMetadata = cloneRecord(existing.metadata);
  const metadata = {
    ...(designMetadata || {}),
    ...(existingMetadata || {}),
  };
  const customCSS = stringValue(existing.customCSS)
    || stringValue(existing.customCss)
    || contentCustomCss(templateContentValue)
    || frontendDesign.tokens.customCss;
  const customJS = stringValue(existing.customJS)
    || stringValue(existing.customJs)
    || stringValue(designState.customJS);

  return {
    ...designState,
    ...existing,
    ...(customCSS ? { customCSS } : {}),
    ...(customJS ? { customJS } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
};

const mergeSectionTemplateDesignStateIntoContent = (
  template: FrontendDesignTemplate,
  contentInput: unknown,
): Record<string, unknown> => {
  const existing = cloneRecord(contentInput) || {};
  const templateContentValue = templateContentRecord(template);
  const designState = contentDesignStatePayload(templateContentValue);
  const contentDocument = cloneRecord(existing.contentDocument)
    || cloneRecord(templateContentValue.contentDocument);
  const designMetadata = cloneRecord(designState.metadata);
  const existingMetadata = cloneRecord(existing.metadata);
  const metadata = {
    ...(designMetadata || {}),
    ...(existingMetadata || {}),
  };
  const customCSS = stringValue(existing.customCSS)
    || stringValue(existing.customCss)
    || contentCustomCss(templateContentValue);
  const customJS = stringValue(existing.customJS)
    || stringValue(existing.customJs)
    || stringValue(designState.customJS);

  return {
    ...designState,
    ...existing,
    ...(customCSS ? { customCSS } : {}),
    ...(customJS ? { customJS } : {}),
    ...(contentDocument ? { contentDocument } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
};

const sectionTemplateContent = (template: FrontendDesignTemplate): Record<string, unknown> => {
  const content = templateContentRecord(template);
  const section = cloneRecord(content.section);
  return section ? mergeSectionTemplateDesignStateIntoContent(template, section) : content;
};

export const seedInputFromFrontendDesignTemplate = (
  input: {
    siteSettings?: SiteSettings;
    body: Record<string, unknown>;
    templateType: FrontendDesignTemplateType;
    kind: 'page' | 'post';
    title: string;
    description?: string | null;
    excerpt?: string | null;
  },
): { ok: true; body: Record<string, unknown>; template?: FrontendDesignTemplate } | { ok: false; code: string; message: string } => {
  const requestedTemplateId = templateRequestId(input.body);
  if (!requestedTemplateId) {
    return { ok: true, body: input.body };
  }

  const frontendDesign = input.siteSettings?.frontendDesign;
  const template = findFrontendDesignTemplate(frontendDesign, input.templateType, requestedTemplateId);
  const explicitRequest = Boolean(
    stringValue(input.body.frontendDesignTemplateId)
    || stringValue(input.body.designTemplateId),
  );

  if (!frontendDesign || !template) {
    if (explicitRequest) {
      return {
        ok: false,
        code: 'FRONTEND_TEMPLATE_NOT_FOUND',
        message: `Frontend design template "${requestedTemplateId}" is not configured for this site.`,
      };
    }

    return { ok: true, body: input.body };
  }

  const existingMeta = isRecord(input.body.meta) ? input.body.meta : {};
  const existingContent = isRecord(input.body.content) ? input.body.content : undefined;
  const shouldSeedContent = !existingContent
    || (!Array.isArray(existingContent.elements) && !isRecord(existingContent.contentDocument));

  return {
    ok: true,
    template,
    body: {
      ...input.body,
      content: shouldSeedContent
        ? templateContent(frontendDesign, template, input)
        : mergeTemplateDesignStateIntoContent(frontendDesign, template, input.body.content),
      meta: buildFrontendDesignProvenanceFields(frontendDesign, template, existingMeta),
    },
  };
};

type FrontendDesignTemplateSeedResult = (
  { ok: true; body: Record<string, unknown>; template?: FrontendDesignTemplate }
  | { ok: false; code: string; message: string }
);

const explicitTemplateRequest = (body: Record<string, unknown>): boolean => (
  Boolean(stringValue(body.frontendDesignTemplateId) || stringValue(body.designTemplateId))
);

const resolveTemplateSeed = (
  siteSettings: SiteSettings | undefined,
  body: Record<string, unknown>,
  templateType: FrontendDesignTemplateType,
): { ok: true; frontendDesign?: FrontendDesignContract; template?: FrontendDesignTemplate } | { ok: false; code: string; message: string } => {
  const requestedTemplateId = templateRequestId(body);
  if (!requestedTemplateId) {
    return { ok: true };
  }

  const frontendDesign = siteSettings?.frontendDesign;
  const template = findFrontendDesignTemplate(frontendDesign, templateType, requestedTemplateId);

  if (!frontendDesign || !template) {
    if (explicitTemplateRequest(body)) {
      return {
        ok: false,
        code: 'FRONTEND_TEMPLATE_NOT_FOUND',
        message: `Frontend design template "${requestedTemplateId}" is not configured for this site.`,
      };
    }

    return { ok: true };
  }

  return { ok: true, frontendDesign, template };
};

const designProvenanceFields = buildFrontendDesignProvenanceFields;

const preferString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return undefined;
};

const preferValue = <T>(...values: Array<T | undefined>): T | undefined => {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
};

const nonEmptyArray = <T = unknown>(value: unknown): T[] | undefined => (
  Array.isArray(value) && value.length > 0 ? cloneArray(value as T[]) : undefined
);

export const seedFormInputFromFrontendDesignTemplate = (
  input: {
    siteSettings?: SiteSettings;
    body: Record<string, unknown>;
  },
): FrontendDesignTemplateSeedResult => {
  const seed = resolveTemplateSeed(input.siteSettings, input.body, 'form');
  if (!seed.ok) return seed;
  if (!seed.frontendDesign || !seed.template) {
    return { ok: true, body: input.body };
  }

  const content = templateContentRecord(seed.template);
  const fields = nonEmptyArray(content.fields);
  const settings = {
    ...(cloneRecord(content.settings) || {}),
    ...(cloneRecord(input.body.settings) || {}),
    ...designProvenanceFields(seed.frontendDesign, seed.template, input.body.settings),
  };

  return {
    ok: true,
    template: seed.template,
    body: {
      ...input.body,
      name: preferString(input.body.name, content.name, content.title, seed.template.name),
      title: preferString(input.body.title, content.title, content.name, seed.template.name),
      description: preferValue(input.body.description, content.description),
      audience: preferValue(input.body.audience, content.audience),
      isActive: preferValue(input.body.isActive as boolean | undefined, content.isActive as boolean | undefined),
      fields: nonEmptyArray(input.body.fields) || fields || [],
      notificationEmail: preferValue(input.body.notificationEmail, content.notificationEmail),
      notificationWebhook: preferValue(input.body.notificationWebhook, content.notificationWebhook),
      successRedirectUrl: preferValue(input.body.successRedirectUrl, content.successRedirectUrl),
      successMessage: preferValue(input.body.successMessage, content.successMessage),
      enableHoneypot: preferValue(input.body.enableHoneypot as boolean | undefined, content.enableHoneypot as boolean | undefined),
      enableCaptcha: preferValue(input.body.enableCaptcha as boolean | undefined, content.enableCaptcha as boolean | undefined),
      moderationMode: preferValue(input.body.moderationMode, content.moderationMode),
      contactShare: cloneRecord(input.body.contactShare) || cloneRecord(content.contactShare),
      collectionTarget: cloneRecord(input.body.collectionTarget) || cloneRecord(content.collectionTarget),
      settings,
    },
  };
};

export const seedSectionInputFromFrontendDesignTemplate = (
  input: {
    siteSettings?: SiteSettings;
    body: Record<string, unknown>;
  },
): FrontendDesignTemplateSeedResult => {
  const seed = resolveTemplateSeed(input.siteSettings, input.body, 'section');
  if (!seed.ok) return seed;
  if (!seed.frontendDesign || !seed.template) {
    return { ok: true, body: input.body };
  }

  const content = templateContentRecord(seed.template);
  const currentContent = cloneRecord(input.body.content);
  const seededContent = currentContent && Array.isArray(currentContent.elements)
    ? mergeSectionTemplateDesignStateIntoContent(seed.template, currentContent)
    : sectionTemplateContent(seed.template);

  return {
    ok: true,
    template: seed.template,
    body: {
      ...input.body,
      name: preferString(input.body.name, content.name, content.title, seed.template.name),
      description: preferValue(input.body.description, content.description),
      category: preferValue(input.body.category, content.category),
      status: preferValue(input.body.status, content.status),
      tags: nonEmptyArray(input.body.tags) || nonEmptyArray(content.tags),
      content: seededContent,
      metadata: designProvenanceFields(seed.frontendDesign, seed.template, input.body.metadata),
    },
  };
};

export const seedCollectionInputFromFrontendDesignTemplate = (
  input: {
    siteSettings?: SiteSettings;
    body: Record<string, unknown>;
  },
): FrontendDesignTemplateSeedResult => {
  const seed = resolveTemplateSeed(input.siteSettings, input.body, 'collection');
  if (!seed.ok) return seed;
  if (!seed.frontendDesign || !seed.template) {
    return { ok: true, body: input.body };
  }

  const content = templateContentRecord(seed.template);

  return {
    ok: true,
    template: seed.template,
    body: {
      ...input.body,
      name: preferString(input.body.name, content.name, content.title, seed.template.name),
      description: preferValue(input.body.description, content.description),
      slug: preferString(input.body.slug, content.slug),
      status: preferValue(input.body.status, content.status),
      routePattern: preferValue(input.body.routePattern, content.routePattern, seed.template.routePattern),
      listRoutePattern: preferValue(input.body.listRoutePattern, content.listRoutePattern),
      fields: nonEmptyArray(input.body.fields) || nonEmptyArray(content.fields) || [],
      permissions: cloneRecord(input.body.permissions) || cloneRecord(content.permissions),
      metadata: {
        ...(cloneRecord(content.metadata) || {}),
        ...designProvenanceFields(seed.frontendDesign, seed.template, input.body.metadata),
      },
    },
  };
};

export const seedCollectionRecordInputFromFrontendDesignTemplate = (
  input: {
    siteSettings?: SiteSettings;
    body: Record<string, unknown>;
    templateType?: 'product' | 'collection';
  },
): FrontendDesignTemplateSeedResult => {
  const seed = resolveTemplateSeed(input.siteSettings, input.body, input.templateType || 'product');
  if (!seed.ok) return seed;
  if (!seed.frontendDesign || !seed.template) {
    return { ok: true, body: input.body };
  }

  const content = templateContentRecord(seed.template);
  const templateValues = cloneRecord(content.values) || {};
  const currentValues = cloneRecord(input.body.values) || {};
  const designValues = designProvenanceFields(seed.frontendDesign, seed.template, currentValues);
  const values = {
    ...templateValues,
    ...currentValues,
    ...designValues,
  };

  return {
    ok: true,
    template: seed.template,
    body: {
      ...input.body,
      slug: preferString(input.body.slug, content.slug, templateValues.slug),
      status: preferValue(input.body.status, content.status),
      scheduledAt: preferValue(input.body.scheduledAt, content.scheduledAt),
      values,
    },
  };
};
