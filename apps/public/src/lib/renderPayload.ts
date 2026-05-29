import {
  buildBackyThemeTokens,
  canvasContentPayloadToBackyContentDocument,
  canvasElementsToBackyContentDocument,
  type BackyContentKind,
  type BackyContentStatus,
} from '@backy-cms/core';

import {
  getCanonicalPathForPage,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getMediaById,
  getMediaList,
  listCollectionRecords,
  listFormsBySite,
  getSiteNavigation,
  type StoreBlogPost,
  type StoreCollection,
  type StoreCollectionRecord,
  type StorePage,
  type StoreSite,
} from './backyStore';
import { buildCollectionItemPath, buildCollectionListPath } from './collectionRoutes';
import { PRODUCT_COLLECTION_SLUG, productDesignReadinessFromValues } from './commerceCatalog';
import {
  buildFrontendDesignEditableMapRecord,
  frontendDesignProvenanceFromMetadata,
} from './frontendDesignContract';
import { buildPublicFontManifest } from './fontManifest';
import { publicMediaFilePath } from './mediaResponsive';

type JsonObject = Record<string, unknown>;
type JsonArrayOrObject = unknown[] | JsonObject;
const CURRENT_RECORD_ID_QUERY_VALUE = '$currentRecord.id';
const LEGACY_CURRENT_RECORD_ID_QUERY_VALUE = '$record.id';

interface RenderPayloadOptions {
  requestId: string;
  path: string;
  locale?: string;
  canonicalPath?: string;
  dataSource?: RenderDataSource;
}

interface RenderElement extends JsonObject {
  id: string;
  type: string;
  children: RenderElement[];
  props: JsonObject;
  componentKey?: string;
  version?: string;
  controls?: JsonObject[];
  fallback?: JsonObject | string;
  renderCapabilities?: JsonObject;
  styles?: JsonObject;
  animation?: JsonObject;
  assetIds?: string[];
  actions?: JsonObject[];
  dataBindings?: JsonObject[];
  bindingSlots?: JsonObject[];
}

interface DatasetManifest extends JsonObject {
  id: string;
  collectionId: string;
  query?: JsonObject;
  pagination?: JsonObject;
}

type CollectionRecordListOptions = Parameters<typeof listCollectionRecords>[2];
type MediaListOptions = Parameters<typeof getMediaList>[1];
type MediaListResult = ReturnType<typeof getMediaList>;
type SiteNavigationResult = ReturnType<typeof getSiteNavigation>;

export interface RenderDataSource {
  getCollectionByIdOrSlug?: (siteId: string, collectionIdOrSlug: string) => StoreCollection | undefined;
  getCollectionRecordByIdOrSlug?: (
    siteId: string,
    collectionId: string,
    recordIdOrSlug: string,
  ) => StoreCollectionRecord | undefined;
  listCollectionRecords?: (
    siteId: string,
    collectionId: string,
    options?: CollectionRecordListOptions,
  ) => { records: StoreCollectionRecord[] };
  getMediaById?: (siteId: string, mediaId: string) => ReturnType<typeof getMediaById>;
  getMediaList?: (siteId: string, options?: MediaListOptions) => MediaListResult;
  getSiteNavigation?: (siteId: string) => SiteNavigationResult;
}

interface RenderPayloadContext {
  dataSource?: RenderDataSource;
}

const defaultRenderDataSource: Required<RenderDataSource> = {
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  listCollectionRecords,
  getMediaById,
  getMediaList,
  getSiteNavigation,
};

const renderDataSource = (context?: RenderPayloadContext): Required<RenderDataSource> => ({
  ...defaultRenderDataSource,
  ...context?.dataSource,
});

type CollectionTemplateRenderKind = 'list' | 'item';

interface CanonicalContentPayloadInput {
  id: string;
  kind: BackyContentKind;
  title: string;
  status?: BackyContentStatus;
  locale: string;
  version: string;
  elements: RenderElement[];
  includeContentDocument?: boolean;
  canvasSize?: unknown;
  customCSS?: string;
  customJS?: string;
  themeTokenRefs?: Record<string, string>;
  assets?: JsonArrayOrObject;
  animations?: JsonArrayOrObject;
  interactions?: JsonArrayOrObject;
  seo?: JsonObject;
  dataBindings?: JsonObject;
  editableMap?: JsonObject;
  metadata?: JsonObject;
  contentDocument?: JsonObject;
}

const buildRenderFrontendDesign = (site: StoreSite, contentMetadata?: unknown) => ({
  site: site.settings?.frontendDesign || null,
  content: frontendDesignProvenanceFromMetadata(contentMetadata) || null,
});

const isRecord = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
);

const publicMediaUrl = (siteId: string, media: { id?: string } | null | undefined) => (
  typeof media?.id === 'string' && media.id.length > 0 ? publicMediaFilePath(siteId, media.id) : ''
);

const getSiteJsonLd = (site: StoreSite): Array<Record<string, unknown>> => (
  Array.isArray(site.settings?.seo?.jsonLd)
    ? site.settings.seo.jsonLd.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : []
);

const getMetaJsonLd = (meta: { jsonLd?: unknown } | undefined): Array<Record<string, unknown>> => (
  Array.isArray(meta?.jsonLd)
    ? meta.jsonLd.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : []
);

const normalizeElement = (raw: unknown): RenderElement | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
  const type = typeof raw.type === 'string' && raw.type.length > 0 ? raw.type : null;

  if (!id || !type) {
    return null;
  }

  const children = Array.isArray(raw.children)
    ? raw.children.map(normalizeElement).filter((child): child is RenderElement => !!child)
    : [];

  return {
    ...raw,
    id,
    type,
    children,
    props: isRecord(raw.props) ? raw.props : {},
    styles: isRecord(raw.styles) ? raw.styles : {},
    actions: Array.isArray(raw.actions) ? raw.actions.filter(isRecord) : [],
    dataBindings: Array.isArray(raw.dataBindings) ? raw.dataBindings.filter(isRecord) : [],
    bindingSlots: Array.isArray(raw.bindingSlots) ? raw.bindingSlots.filter(isRecord) : [],
  };
};

const cloneJsonObject = (value: unknown): JsonObject | null => {
  if (!isRecord(value)) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as JsonObject;
  } catch {
    return { ...value };
  }
};

const metadataTemplateId = (metadata: unknown): string => (
  isRecord(metadata) && typeof metadata.frontendDesignTemplateId === 'string'
    ? metadata.frontendDesignTemplateId
    : ''
);

const collectionFrontendDesignTemplate = (site: StoreSite, collection: StoreCollection) => {
  const templateId = metadataTemplateId(collection.metadata);
  const templates = site.settings?.frontendDesign?.templates || [];

  if (templateId) {
    const exact = templates.find((template) => template.type === 'collection' && template.id === templateId);
    if (exact) {
      return exact;
    }
  }

  return templates.find((template) => (
    template.type === 'collection'
    && typeof template.routePattern === 'string'
    && template.routePattern === collection.routePattern
  ));
};

type CollectionTemplateCanvas = {
  canvasSize?: { width: number; height: number };
  customCSS?: string;
  customJS?: string;
  themeTokenRefs?: Record<string, string>;
  assets?: JsonArrayOrObject;
  animations?: JsonArrayOrObject;
  interactions?: JsonArrayOrObject;
  seo?: JsonObject;
  dataBindings?: JsonObject;
  editableMap?: JsonObject;
  metadata?: JsonObject;
  contentDocument?: JsonObject;
  elements: unknown[];
};

type CollectionRenderableContent = Omit<CollectionTemplateCanvas, 'canvasSize' | 'elements'> & {
  canvasSize: { width: number; height: number };
  elements: RenderElement[];
};

const cloneJsonArray = <T = unknown>(value: unknown): T[] | undefined => (
  Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as T[] : undefined
);

const stringRecordValue = (...values: unknown[]): Record<string, string> | undefined => {
  for (const value of values) {
    if (!isRecord(value)) continue;
    const entries = Object.entries(value).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string' && entry[1].trim().length > 0
    ));
    if (entries.length > 0) return Object.fromEntries(entries);
  }
  return undefined;
};

const jsonRecordValue = (...values: unknown[]): JsonObject | undefined => {
  for (const value of values) {
    const record = cloneJsonObject(value);
    if (record && Object.keys(record).length > 0) return record;
  }
  return undefined;
};

const jsonArrayValue = (...values: unknown[]): unknown[] | undefined => {
  for (const value of values) {
    const array = cloneJsonArray(value);
    if (array && array.length > 0) return array;
  }
  return undefined;
};

const jsonArrayOrRecordValue = (...values: unknown[]): JsonArrayOrObject | undefined => {
  for (const value of values) {
    const array = cloneJsonArray(value);
    if (array && array.length > 0) return array;
    const record = cloneJsonObject(value);
    if (record && Object.keys(record).length > 0) return record;
  }
  return undefined;
};

const templateContentCanvas = (
  value: unknown,
): CollectionTemplateCanvas | null => {
  const content = isRecord(value) ? value : null;
  const contentDocument = isRecord(content?.contentDocument)
    ? content.contentDocument
    : isRecord(content) && Array.isArray(content.elements) && isRecord(content.metadata)
      ? content
      : null;
  const elements = Array.isArray(content?.elements)
    ? content.elements
    : Array.isArray(contentDocument?.elements)
      ? contentDocument.elements
      : null;

  if (!content || !elements) {
    return null;
  }

  const metadata = isRecord(content.metadata)
    ? content.metadata
    : isRecord(contentDocument?.metadata)
      ? contentDocument.metadata
      : null;
  const rawCanvasSize = isRecord(content.canvasSize)
    ? content.canvasSize
    : isRecord(metadata?.canvasSize)
      ? metadata.canvasSize
      : null;
  const width = typeof rawCanvasSize?.width === 'number' ? rawCanvasSize.width : undefined;
  const height = typeof rawCanvasSize?.height === 'number' ? rawCanvasSize.height : undefined;
  const customCSS = typeof content.customCSS === 'string' && content.customCSS.trim().length > 0
    ? content.customCSS
    : typeof metadata?.customCSS === 'string' && metadata.customCSS.trim().length > 0
      ? metadata.customCSS
      : '';
  const customJS = typeof content.customJS === 'string' && content.customJS.trim().length > 0
    ? content.customJS
    : typeof metadata?.customJS === 'string' && metadata.customJS.trim().length > 0
      ? metadata.customJS
      : '';

  return {
    ...(width && height ? { canvasSize: { width, height } } : {}),
    ...(customCSS ? { customCSS } : {}),
    ...(customJS ? { customJS } : {}),
    ...(stringRecordValue(content.themeTokenRefs, contentDocument?.themeTokenRefs, metadata?.themeTokenRefs)
      ? { themeTokenRefs: stringRecordValue(content.themeTokenRefs, contentDocument?.themeTokenRefs, metadata?.themeTokenRefs) }
      : {}),
    ...(jsonArrayOrRecordValue(content.assets, contentDocument?.assets, metadata?.assets)
      ? { assets: jsonArrayOrRecordValue(content.assets, contentDocument?.assets, metadata?.assets) }
      : {}),
    ...(jsonArrayOrRecordValue(content.animations, contentDocument?.animations, metadata?.animations)
      ? { animations: jsonArrayOrRecordValue(content.animations, contentDocument?.animations, metadata?.animations) }
      : {}),
    ...(jsonArrayOrRecordValue(content.interactions, contentDocument?.interactions, metadata?.interactions)
      ? { interactions: jsonArrayOrRecordValue(content.interactions, contentDocument?.interactions, metadata?.interactions) }
      : {}),
    ...(jsonRecordValue(content.seo, contentDocument?.seo, metadata?.seo)
      ? { seo: jsonRecordValue(content.seo, contentDocument?.seo, metadata?.seo) }
      : {}),
    ...(jsonRecordValue(content.dataBindings, contentDocument?.dataBindings, metadata?.dataBindings)
      ? { dataBindings: jsonRecordValue(content.dataBindings, contentDocument?.dataBindings, metadata?.dataBindings) }
      : {}),
    ...(jsonRecordValue(content.editableMap, contentDocument?.editableMap, metadata?.editableMap)
      ? { editableMap: jsonRecordValue(content.editableMap, contentDocument?.editableMap, metadata?.editableMap) }
      : {}),
    ...(jsonRecordValue(metadata) ? { metadata: jsonRecordValue(metadata) } : {}),
    ...(cloneJsonObject(contentDocument) ? { contentDocument: cloneJsonObject(contentDocument) as JsonObject } : {}),
    elements,
  };
};

const collectionAuthoredTemplateCanvas = (
  collection: StoreCollection,
  kind: CollectionTemplateRenderKind,
): CollectionTemplateCanvas | null => {
  const metadata = isRecord(collection.metadata) ? collection.metadata : {};
  const dynamicTemplates = isRecord(metadata.dynamicTemplates) ? metadata.dynamicTemplates : {};
  const section = isRecord(dynamicTemplates[kind]) ? dynamicTemplates[kind] as JsonObject : {};
  return templateContentCanvas(section.authoredCanvas);
};

const collectionTemplateCanvas = (
  site: StoreSite,
  collection: StoreCollection,
  kind: CollectionTemplateRenderKind,
): CollectionTemplateCanvas | null => {
  const authoredCanvas = collectionAuthoredTemplateCanvas(collection, kind);
  if (authoredCanvas) {
    return authoredCanvas;
  }

  const template = collectionFrontendDesignTemplate(site, collection);
  const content = cloneJsonObject(template?.content);
  if (!template || !content) {
    return null;
  }

  const candidateKeys = kind === 'list'
    ? ['listTemplate', 'collectionListTemplate', 'dynamicList', 'listContent', 'list']
    : ['itemTemplate', 'recordTemplate', 'detailTemplate', 'dynamicItem', 'itemContent', 'item'];

  for (const key of candidateKeys) {
    const candidate = templateContentCanvas(content[key]);
    if (candidate) {
      return candidate;
    }
  }

  const rootCanvas = templateContentCanvas(content);
  if (rootCanvas) {
    return rootCanvas;
  }

  return null;
};

const buildCanonicalContentPayload = (input: CanonicalContentPayloadInput) => {
  const rawContent = {
    elements: input.elements,
    ...(input.canvasSize ? { canvasSize: input.canvasSize } : {}),
    ...(input.customCSS !== undefined ? { customCSS: input.customCSS } : {}),
    ...(input.customJS !== undefined ? { customJS: input.customJS } : {}),
    ...(input.themeTokenRefs ? { themeTokenRefs: input.themeTokenRefs } : {}),
    ...(input.assets ? { assets: input.assets } : {}),
    ...(input.animations ? { animations: input.animations } : {}),
    ...(input.interactions ? { interactions: input.interactions } : {}),
    ...(input.seo ? { seo: input.seo } : {}),
    ...(input.dataBindings ? { dataBindings: input.dataBindings } : {}),
    ...(input.editableMap ? { editableMap: input.editableMap } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.contentDocument ? { contentDocument: input.contentDocument } : {}),
  };
  const document = (
    input.includeContentDocument
      ? canvasContentPayloadToBackyContentDocument({
          id: input.id,
          kind: input.kind,
          title: input.title,
          status: input.status,
          locale: input.locale,
          version: input.version,
          rawContent,
        })
      : canvasElementsToBackyContentDocument({
          id: input.id,
          kind: input.kind,
          title: input.title,
          status: input.status,
          locale: input.locale,
          version: input.version,
          elements: input.elements,
        })
  );
  const metadata = isRecord(document.metadata) ? document.metadata : {};
  const customCSS = typeof metadata.customCSS === 'string' && metadata.customCSS.trim().length > 0
    ? metadata.customCSS
    : undefined;
  const customJS = typeof metadata.customJS === 'string' && metadata.customJS.trim().length > 0
    ? metadata.customJS
    : undefined;
  const contentEditableMap = input.editableMap && Object.keys(input.editableMap).length > 0
    ? input.editableMap
    : document.editableMap;

  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    kind: document.kind,
    title: document.title,
    locale: document.locale,
    version: typeof document.version === 'string' ? document.version : input.version,
    elements: document.elements,
    ...(input.includeContentDocument && customCSS ? { customCSS } : {}),
    ...(input.includeContentDocument && customJS ? { customJS } : {}),
    ...(input.includeContentDocument && document.themeTokenRefs ? { themeTokenRefs: document.themeTokenRefs } : {}),
    ...(input.includeContentDocument && document.assets ? { assets: document.assets } : {}),
    ...(input.includeContentDocument && input.animations ? { animations: input.animations } : {}),
    ...(input.includeContentDocument && document.interactions ? { interactions: document.interactions } : {}),
    ...(input.includeContentDocument && document.seo ? { seo: document.seo } : {}),
    ...(input.includeContentDocument && document.dataBindings ? { dataBindings: document.dataBindings } : {}),
    editableMap: contentEditableMap,
    ...(input.includeContentDocument && document.metadata ? { metadata: document.metadata } : {}),
    ...(input.includeContentDocument ? { contentDocument: document } : {}),
  };
};

const walkElements = (elements: RenderElement[], visit: (element: RenderElement) => void) => {
  for (const element of elements) {
    visit(element);
    walkElements(element.children, visit);
  }
};

const collectElementActions = (elements: RenderElement[]): JsonObject[] => {
  const actions: JsonObject[] = [];
  walkElements(elements, (element) => {
    if (Array.isArray(element.actions)) {
      actions.push(...element.actions);
    }

    const props = element.props;
    const href = typeof props.href === 'string' ? props.href : null;
    const actionUrl = typeof props.actionUrl === 'string' ? props.actionUrl : null;
    const formId = typeof props.formId === 'string' ? props.formId : null;

    if (href) {
      actions.push({
        id: `action_${element.id}_link`,
        type: href.startsWith('/') ? 'route' : 'link',
        label: typeof props.label === 'string' ? props.label : undefined,
        target: href,
        href,
      });
    }

    if (formId || actionUrl) {
      actions.push({
        id: `action_${element.id}_submit`,
        type: 'submitForm',
        formId: formId || undefined,
        method: 'POST',
        target: actionUrl || undefined,
      });
    }
  });

  return actions;
};

const DATA_BINDING_MODES = ['text', 'html', 'image', 'video', 'audio', 'url', 'boolean', 'number', 'json'];
const DATA_BINDING_SOURCE_KINDS = ['collection', 'page', 'post', 'site', 'route', 'query', 'auth', 'static'];

const bindingModeForField = (field: string): string => {
  const normalized = field.toLowerCase();
  if (normalized.includes('image') || normalized.includes('photo') || normalized.includes('avatar')) {
    return 'image';
  }
  if (normalized.includes('video')) {
    return 'video';
  }
  if (normalized.includes('audio')) {
    return 'audio';
  }
  if (normalized.includes('url') || normalized.includes('href') || normalized.includes('link')) {
    return 'url';
  }
  if (normalized.includes('count') || normalized.includes('total') || normalized.includes('rank') || normalized.includes('number')) {
    return 'number';
  }
  return normalized.includes('html') || normalized.includes('rich') ? 'html' : 'text';
};

const normalizeBindingMode = (mode: unknown, field: string): string => (
  typeof mode === 'string' && DATA_BINDING_MODES.includes(mode) ? mode : bindingModeForField(field)
);

const normalizeBindingSource = (value: unknown): JsonObject | null => {
  if (!isRecord(value) || typeof value.kind !== 'string' || !DATA_BINDING_SOURCE_KINDS.includes(value.kind)) {
    return null;
  }

  const source: JsonObject = {
    kind: value.kind,
  };

  if (typeof value.collectionId === 'string') {
    source.collectionId = value.collectionId;
  }
  if (typeof value.field === 'string') {
    source.field = value.field;
  }
  if (typeof value.recordId === 'string') {
    source.recordId = value.recordId;
  }
  if (typeof value.path === 'string') {
    source.path = value.path;
  }

  return source;
};

const normalizeBindingWriteBack = (value: unknown): JsonObject | null => {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    return null;
  }

  const writeBack: JsonObject = {
    enabled: value.enabled,
  };
  if (typeof value.permission === 'string') {
    writeBack.permission = value.permission;
  }
  if (typeof value.endpoint === 'string') {
    writeBack.endpoint = value.endpoint;
  }

  return writeBack;
};

const normalizeBindingPagination = (value: unknown): JsonObject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const pagination: JsonObject = {};
  if (typeof value.limit === 'number' && Number.isInteger(value.limit) && value.limit > 0) {
    pagination.limit = value.limit;
  }
  if (typeof value.offset === 'number' && Number.isInteger(value.offset) && value.offset >= 0) {
    pagination.offset = value.offset;
  }
  if (typeof value.cursor === 'string') {
    pagination.cursor = value.cursor;
  }

  return Object.keys(pagination).length > 0 ? pagination : null;
};

const normalizeBindingQuery = (value: unknown): JsonObject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const query: JsonObject = {};
  for (const key of ['recordId', 'slug', 'status', 'q', 'search', 'fieldKey', 'sortBy']) {
    if (typeof value[key] === 'string' && value[key].length > 0) {
      query[key] = value[key];
    }
  }
  if ('fieldValue' in value && value.fieldValue !== undefined && value.fieldValue !== null && !isRecord(value.fieldValue) && !Array.isArray(value.fieldValue)) {
    query.fieldValue = value.fieldValue;
  }
  if (value.sortDirection === 'asc' || value.sortDirection === 'desc') {
    query.sortDirection = value.sortDirection;
  }
  if (typeof value.limit === 'number' && Number.isInteger(value.limit) && value.limit > 0) {
    query.limit = Math.min(value.limit, 100);
  }
  if (typeof value.offset === 'number' && Number.isInteger(value.offset) && value.offset >= 0) {
    query.offset = value.offset;
  }

  return Object.keys(query).length > 0 ? query : null;
};

const normalizeCollectionRecordStatus = (value: unknown): StoreCollectionRecord['status'] | null => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived'
    ? value
    : null
);

const resolveCollectionTemplateQuery = (
  query: unknown,
  record?: StoreCollectionRecord,
): JsonObject => {
  const nextQuery = isRecord(query) ? { ...query } : {};
  if (
    record
    && (nextQuery.fieldValue === CURRENT_RECORD_ID_QUERY_VALUE || nextQuery.fieldValue === LEGACY_CURRENT_RECORD_ID_QUERY_VALUE)
  ) {
    nextQuery.fieldValue = record.id;
  }
  return nextQuery;
};

const normalizeSchemaBinding = (binding: JsonObject, element: RenderElement, index: number): JsonObject | null => {
  const source = normalizeBindingSource(binding.source);
  if (!source) {
    return null;
  }

  const sourceField = typeof source.field === 'string' && source.field.length > 0 ? source.field : null;
  const targetPath = typeof binding.targetPath === 'string' && binding.targetPath.length > 0 ? binding.targetPath : 'props.content';
  const normalized: JsonObject = {
    id: typeof binding.id === 'string' && binding.id.length > 0
      ? binding.id
      : `binding_${element.id}_${sourceField || index}`,
    elementId: typeof binding.elementId === 'string' && binding.elementId.length > 0 ? binding.elementId : element.id,
    targetPath,
    source,
    mode: normalizeBindingMode(binding.mode, sourceField || targetPath),
  };

  if ('fallback' in binding) {
    normalized.fallback = binding.fallback;
  }
  if (isRecord(binding.format)) {
    normalized.format = binding.format;
  }

  const writeBack = normalizeBindingWriteBack(binding.writeBack);
  if (writeBack) {
    normalized.writeBack = writeBack;
  }

  return normalized;
};

const normalizeCollectionBinding = (binding: JsonObject, element: RenderElement, index: number): JsonObject | null => {
  const source = isRecord(binding.source) ? binding.source : {};
  const collectionId = typeof source.collectionId === 'string' && source.collectionId.length > 0
    ? source.collectionId
    : typeof binding.collectionId === 'string' && binding.collectionId.length > 0
      ? binding.collectionId
      : null;
  const field = typeof source.field === 'string' && source.field.length > 0
    ? source.field
    : typeof binding.field === 'string' && binding.field.length > 0
      ? binding.field
      : null;

  if (!collectionId || !field) {
    return null;
  }

  const normalizedSource: JsonObject = {
    kind: 'collection',
    collectionId,
    field,
  };
  if (typeof source.recordId === 'string' && source.recordId.length > 0) {
    normalizedSource.recordId = source.recordId;
  }
  if (typeof source.path === 'string' && source.path.length > 0) {
    normalizedSource.path = source.path;
  }

  const normalized: JsonObject = {
    id: typeof binding.id === 'string' && binding.id.length > 0
      ? binding.id
      : `binding_${element.id}_${field}_${index}`,
    elementId: typeof binding.elementId === 'string' && binding.elementId.length > 0 ? binding.elementId : element.id,
    targetPath: typeof binding.targetPath === 'string' && binding.targetPath.length > 0 ? binding.targetPath : 'props.content',
    source: normalizedSource,
    mode: normalizeBindingMode(binding.mode, field),
  };

  if ('fallback' in binding) {
    normalized.fallback = binding.fallback;
  }
  if (isRecord(binding.format)) {
    normalized.format = binding.format;
  }

  const writeBack = normalizeBindingWriteBack(binding.writeBack);
  if (writeBack) {
    normalized.writeBack = writeBack;
  }

  return normalized;
};

const normalizeElementForPayload = (element: RenderElement): RenderElement => ({
  ...element,
  children: element.children.map(normalizeElementForPayload),
  dataBindings: element.dataBindings
    ?.map((binding, index) => normalizeCollectionBinding(binding, element, index) || normalizeSchemaBinding(binding, element, index))
    .filter((binding): binding is JsonObject => !!binding) ?? [],
});

const getBoundCollectionRecord = (
  siteId: string,
  collectionId: string,
  binding: JsonObject,
  context?: RenderPayloadContext,
): StoreCollectionRecord | undefined => {
  const sourceData = renderDataSource(context);
  const source = isRecord(binding.source) ? binding.source : {};
  const query = isRecord(binding.query)
    ? binding.query
    : isRecord(source.query)
      ? source.query
      : {};
  const recordId = typeof source.recordId === 'string' && source.recordId.length > 0
    ? source.recordId
    : typeof query.recordId === 'string' && query.recordId.length > 0
      ? query.recordId
      : null;
  const slug = typeof query.slug === 'string' && query.slug.length > 0 ? query.slug : null;
  const search = typeof query.q === 'string' && query.q.length > 0
    ? query.q
    : typeof query.search === 'string' && query.search.length > 0
      ? query.search
      : null;
  const fieldKey = typeof query.fieldKey === 'string' && query.fieldKey.length > 0 ? query.fieldKey : null;
  const fieldValue = query.fieldValue;
  const status = normalizeCollectionRecordStatus(query.status);
  const sortBy = typeof query.sortBy === 'string' && query.sortBy.length > 0 ? query.sortBy : null;
  const sortDirection = query.sortDirection === 'desc' ? 'desc' : 'asc';

  if (recordId) {
    return sourceData.getCollectionRecordByIdOrSlug(siteId, collectionId, recordId);
  }

  if (fieldKey?.includes('.') || sortBy?.includes('.')) {
    const collection = sourceData.getCollectionByIdOrSlug(siteId, collectionId);
    if (!collection) {
      return undefined;
    }
    const records = sourceData.listCollectionRecords(siteId, collectionId, {
      slug: slug || undefined,
      status: status || undefined,
      search: search || undefined,
      limit: 1000,
      offset: 0,
    }).records;
    return sortCollectionRecordsByFieldPath(
      siteId,
      collection,
      filterCollectionRecordsByFieldPath(siteId, collection, records, fieldKey, fieldValue),
      sortBy,
      sortDirection,
    )[0];
  }

  return sourceData.listCollectionRecords(siteId, collectionId, {
    slug: slug || undefined,
    status: status || undefined,
    search: search || undefined,
    fieldKey: fieldKey || undefined,
    fieldValue,
    sortBy: sortBy || undefined,
    sortDirection,
    limit: 1,
  }).records[0];
};

const MAX_COLLECTION_REFERENCE_DEPTH = 5;

const joinedReferenceValue = (values: unknown[]): string => values
  .filter((value) => value !== undefined && value !== null)
  .map((value) => (Array.isArray(value) ? value.join(', ') : String(value)))
  .filter((value) => value.length > 0)
  .join(', ');

const resolveCollectionRecordFieldPath = (
  siteId: string,
  collection: StoreCollection,
  record: StoreCollectionRecord,
  pathParts: string[],
  context?: RenderPayloadContext,
  depth = 0,
): unknown => {
  if (depth > MAX_COLLECTION_REFERENCE_DEPTH || pathParts.length === 0) {
    return undefined;
  }

  const [fieldKey, ...remainingPath] = pathParts;
  if (!fieldKey) {
    return undefined;
  }

  const value = record.values[fieldKey];
  if (remainingPath.length === 0) {
    return value;
  }

  const field = collection.fields.find((candidate) => candidate.key === fieldKey);
  const referenceCollectionId = typeof field?.referenceCollectionId === 'string'
    ? field.referenceCollectionId
    : '';
  if (!referenceCollectionId) {
    return undefined;
  }

  const sourceData = renderDataSource(context);
  const referenceCollection = sourceData.getCollectionByIdOrSlug(siteId, referenceCollectionId);
  if (!referenceCollection) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return joinedReferenceValue(
      value.map((entry) => {
        if (typeof entry !== 'string' || entry.length === 0) {
          return undefined;
        }
        const referenceRecord = sourceData.getCollectionRecordByIdOrSlug(siteId, referenceCollection.id, entry);
        return referenceRecord
          ? resolveCollectionRecordFieldPath(siteId, referenceCollection, referenceRecord, remainingPath, context, depth + 1)
          : undefined;
      }),
    );
  }

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  const referenceRecord = sourceData.getCollectionRecordByIdOrSlug(siteId, referenceCollection.id, value);
  return referenceRecord
    ? resolveCollectionRecordFieldPath(siteId, referenceCollection, referenceRecord, remainingPath, context, depth + 1)
    : undefined;
};

const collectionRecordQueryValue = (
  siteId: string,
  collection: StoreCollection,
  record: StoreCollectionRecord,
  fieldKey: string,
  context?: RenderPayloadContext,
): unknown => {
  if (fieldKey === 'slug' || fieldKey === 'status' || fieldKey === 'createdAt' || fieldKey === 'updatedAt') {
    return record[fieldKey];
  }
  return fieldKey.includes('.')
    ? resolveCollectionRecordFieldPath(siteId, collection, record, fieldKey.split('.'), context)
    : record.values[fieldKey];
};

const normalizeQueryComparable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeQueryComparable(entry)).filter(Boolean).join(' ');
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim().toLowerCase();
};

const filterCollectionRecordsByFieldPath = (
  siteId: string,
  collection: StoreCollection,
  records: StoreCollectionRecord[],
  fieldKey: string | null,
  fieldValue: unknown,
  context?: RenderPayloadContext,
) => {
  if (!fieldKey || fieldValue === undefined || fieldValue === null || normalizeQueryComparable(fieldValue).length === 0) {
    return records;
  }
  const normalizedFieldValue = normalizeQueryComparable(fieldValue);
  return records.filter((record) => (
    normalizeQueryComparable(collectionRecordQueryValue(siteId, collection, record, fieldKey, context)).includes(normalizedFieldValue)
  ));
};

const sortCollectionRecordsByFieldPath = (
  siteId: string,
  collection: StoreCollection,
  records: StoreCollectionRecord[],
  sortBy: string | null,
  sortDirection: 'asc' | 'desc',
  context?: RenderPayloadContext,
) => {
  if (!sortBy) {
    return records;
  }
  const direction = sortDirection === 'desc' ? -1 : 1;
  return [...records].sort((left, right) => {
    const leftValue = collectionRecordQueryValue(siteId, collection, left, sortBy, context);
    const rightValue = collectionRecordQueryValue(siteId, collection, right, sortBy, context);
    const leftNumber = typeof leftValue === 'number' ? leftValue : Number.NaN;
    const rightNumber = typeof rightValue === 'number' ? rightValue : Number.NaN;

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return (leftNumber - rightNumber) * direction;
    }

    return normalizeQueryComparable(leftValue).localeCompare(normalizeQueryComparable(rightValue)) * direction;
  });
};

const valueForBinding = (
  siteId: string,
  binding: JsonObject,
  context?: RenderPayloadContext,
): unknown => {
  const sourceData = renderDataSource(context);
  const normalized = normalizeCollectionBinding(binding, {
    id: 'binding-target',
    type: 'binding',
    children: [],
    props: {},
    dataBindings: [],
  }, 0);
  const source = isRecord(normalized?.source) ? normalized.source : null;
  const collectionId = typeof source?.collectionId === 'string' ? source.collectionId : null;
  const field = typeof source?.field === 'string' ? source.field : null;
  const targetPath = typeof normalized?.targetPath === 'string' ? normalized.targetPath : '';

  if (!source || !collectionId || !field) {
    return undefined;
  }

  const collection = sourceData.getCollectionByIdOrSlug(siteId, collectionId);
  if (!collection) {
    return undefined;
  }

  const record = getBoundCollectionRecord(siteId, collection.id, binding, context);
  if (!record) {
    return undefined;
  }

  if (field === 'id') {
    return record.id;
  }
  if (field === 'slug') {
    return targetPath.toLowerCase().includes('href') || targetPath.toLowerCase().includes('url')
      ? buildCollectionItemPath(collection, record.slug)
      : record.slug;
  }
  if (field === 'status') {
    return record.status;
  }
  if (field === 'createdAt') {
    return record.createdAt;
  }
  if (field === 'updatedAt') {
    return record.updatedAt;
  }

  const sourcePath = typeof source.path === 'string' ? source.path : '';
  if (sourcePath.startsWith(`${field}.`)) {
    const joinedValue = resolveCollectionRecordFieldPath(siteId, collection, record, sourcePath.split('.'), context);
    return joinedValue === undefined ? record.values[field] : joinedValue;
  }

  return record.values[field];
};

const valueForTargetPath = (
  siteId: string,
  targetPath: string,
  value: unknown,
  context?: RenderPayloadContext,
) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    targetPath === 'props.src'
    || targetPath === 'props.assetId'
    || targetPath === 'props.mediaId'
  ) {
    if (typeof value === 'string') {
      const media = renderDataSource(context).getMediaById(siteId, value);
      return {
        value,
        media,
      };
    }
  }

  return { value };
};

const applyBindingValue = (
  siteId: string,
  element: RenderElement,
  targetPath: string,
  rawValue: unknown,
  context?: RenderPayloadContext,
): RenderElement => {
  if (!targetPath.startsWith('props.')) {
    return element;
  }

  const propName = targetPath.slice('props.'.length);
  if (!propName) {
    return element;
  }

  const resolved = valueForTargetPath(siteId, targetPath, rawValue, context);
  if (!isRecord(resolved)) {
    return element;
  }

  const nextProps: JsonObject = {
    ...element.props,
    [propName]: resolved.value,
  };

  if ((propName === 'assetId' || propName === 'mediaId') && isRecord(resolved.media)) {
    nextProps.assetId = typeof resolved.media.id === 'string' ? resolved.media.id : resolved.value;
    nextProps.mediaId = typeof resolved.media.id === 'string' ? resolved.media.id : resolved.value;
    const deliveryUrl = publicMediaUrl(siteId, resolved.media);
    if (deliveryUrl) {
      nextProps.src = deliveryUrl;
    }
  }

  if (propName === 'src' && isRecord(resolved.media)) {
    nextProps.assetId = typeof resolved.media.id === 'string' ? resolved.media.id : resolved.value;
    nextProps.mediaId = typeof resolved.media.id === 'string' ? resolved.media.id : resolved.value;
    const deliveryUrl = publicMediaUrl(siteId, resolved.media);
    if (deliveryUrl) {
      nextProps.src = deliveryUrl;
    }
  }

  return {
    ...element,
    props: nextProps,
  };
};

export const resolveElementDataBindings = (
  siteId: string,
  rawElements: unknown[],
  context?: RenderPayloadContext,
): RenderElement[] => (
  rawElements
    .map(normalizeElement)
    .filter((element): element is RenderElement => !!element)
    .map((element) => {
      const children = resolveElementDataBindings(siteId, element.children, context);
      const withChildren: RenderElement = {
        ...element,
        children,
      };
      const withRepeaterData = hydrateRepeaterElement(siteId, withChildren, context);

      return (element.dataBindings || []).reduce<RenderElement>((currentElement, binding, index) => {
        const normalized = normalizeCollectionBinding(binding, currentElement, index);
        const targetPath = typeof normalized?.targetPath === 'string' ? normalized.targetPath : null;
        if (!normalized || !targetPath) {
          return currentElement;
        }

        const nextValue = valueForBinding(siteId, binding, context);
        if (nextValue === undefined) {
          return currentElement;
        }

        return applyBindingValue(siteId, currentElement, targetPath, nextValue, context);
      }, withRepeaterData);
    })
);

const normalizeResolvedCollectionFields = (fields: unknown): JsonObject[] => (
  Array.isArray(fields)
    ? fields.filter(isRecord).map((field) => {
        const normalizedField: JsonObject = {
          key: typeof field.key === 'string' ? field.key : '',
          label: typeof field.label === 'string' ? field.label : typeof field.key === 'string' ? field.key : 'Field',
          type: typeof field.type === 'string' ? field.type : 'text',
          required: field.required === true,
          unique: field.unique === true,
        };
        const options = toStringArray(field.options);
        const referenceCollectionId = typeof field.referenceCollectionId === 'string' && field.referenceCollectionId.length > 0
          ? field.referenceCollectionId
          : null;

        if (options.length > 0) {
          normalizedField.options = options;
        }

        if (referenceCollectionId) {
          normalizedField.referenceCollectionId = referenceCollectionId;
        }

        return normalizedField;
      }).filter((field) => typeof field.key === 'string' && field.key.length > 0)
    : []
);

const normalizeResolvedCollectionRecords = (records: unknown): JsonObject[] => (
  Array.isArray(records)
    ? records.filter(isRecord).map((record) => ({
        id: typeof record.id === 'string' ? record.id : '',
        slug: typeof record.slug === 'string' ? record.slug : '',
        status: typeof record.status === 'string' ? record.status : 'published',
        values: isRecord(record.values) ? record.values : {},
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      })).filter((record) => record.id.length > 0 && record.updatedAt.length > 0)
    : []
);

const collectionRecordsForQuery = (
  siteId: string,
  collectionId: string,
  query: JsonObject = {},
  pagination: JsonObject | null = null,
  context?: RenderPayloadContext,
): StoreCollectionRecord[] => {
  const sourceData = renderDataSource(context);
  const recordId = typeof query.recordId === 'string' && query.recordId.length > 0 ? query.recordId : null;
  const slug = typeof query.slug === 'string' && query.slug.length > 0 ? query.slug : null;
  const search = typeof query.q === 'string' && query.q.length > 0
    ? query.q
    : typeof query.search === 'string' && query.search.length > 0
      ? query.search
      : null;
  const fieldKey = typeof query.fieldKey === 'string' && query.fieldKey.length > 0 ? query.fieldKey : null;
  const fieldValue = query.fieldValue;
  const status = normalizeCollectionRecordStatus(query.status);
  const sortBy = typeof query.sortBy === 'string' && query.sortBy.length > 0 ? query.sortBy : null;
  const sortDirection = query.sortDirection === 'desc' ? 'desc' : 'asc';
  const limit = isRecord(pagination) && typeof pagination.limit === 'number'
    ? pagination.limit
    : typeof query.limit === 'number'
      ? query.limit
      : 50;
  const offset = isRecord(pagination) && typeof pagination.offset === 'number'
    ? pagination.offset
    : typeof query.offset === 'number'
      ? query.offset
      : 0;

  if (recordId) {
    return [sourceData.getCollectionRecordByIdOrSlug(siteId, collectionId, recordId)].filter((record): record is StoreCollectionRecord => !!record);
  }

  if (fieldKey?.includes('.') || sortBy?.includes('.')) {
    const collection = sourceData.getCollectionByIdOrSlug(siteId, collectionId);
    if (!collection) {
      return [];
    }
    const records = sourceData.listCollectionRecords(siteId, collectionId, {
      slug: slug || undefined,
      status: status || undefined,
      search: search || undefined,
      limit: 1000,
      offset: 0,
    }).records;
    const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
    return sortCollectionRecordsByFieldPath(
      siteId,
      collection,
      filterCollectionRecordsByFieldPath(siteId, collection, records, fieldKey, fieldValue, context),
      sortBy,
      sortDirection,
      context,
    ).slice(safeOffset, safeOffset + safeLimit);
  }

  return sourceData.listCollectionRecords(siteId, collectionId, {
    slug: slug || undefined,
    status: status || undefined,
    search: search || undefined,
    fieldKey: fieldKey || undefined,
    fieldValue,
    sortBy: sortBy || undefined,
    sortDirection,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  }).records;
};

const hydrateDatasetRecords = (
  siteId: string,
  dataset: DatasetManifest,
  context?: RenderPayloadContext,
): DatasetManifest => {
  const collection = renderDataSource(context).getCollectionByIdOrSlug(siteId, dataset.collectionId);
  if (!collection) {
    return dataset;
  }

  const query = isRecord(dataset.query) ? dataset.query : {};
  const pagination = isRecord(dataset.pagination) ? dataset.pagination : null;
  const joinedFieldPaths = ['fieldKey', 'sortBy']
    .map((key) => query[key])
    .filter((value): value is string => typeof value === 'string' && value.includes('.'));
  const records = collectionRecordsForQuery(siteId, collection.id, query, pagination, context)
    .map((record) => hydrateRepeaterJoinedRecordValues(siteId, collection, record, joinedFieldPaths, context));

  return {
    ...dataset,
    collectionId: collection.id,
    fields: normalizeResolvedCollectionFields(collection.fields),
    records: normalizeResolvedCollectionRecords(records),
  };
};

const repeaterDatasetForElement = (element: RenderElement): DatasetManifest | null => {
  const repeater = isRecord(element.props.repeater) ? element.props.repeater : element.props;
  const collectionId = typeof repeater.collectionId === 'string' && repeater.collectionId.length > 0
    ? repeater.collectionId
    : null;

  if (!collectionId) {
    return null;
  }

  const datasetId = typeof repeater.datasetId === 'string' && repeater.datasetId.length > 0
    ? repeater.datasetId
    : `dataset_${collectionId}_${element.id}`;
  const query = isRecord(repeater.query) ? { ...repeater.query } : {};
  const pagination = normalizeBindingPagination(repeater.pagination);
  if (typeof repeater.limit === 'number' && !('limit' in query)) {
    query.limit = repeater.limit;
  }
  if (typeof repeater.offset === 'number' && !('offset' in query)) {
    query.offset = repeater.offset;
  }
  if (typeof repeater.sortBy === 'string' && !('sortBy' in query)) {
    query.sortBy = repeater.sortBy;
  }
  if (repeater.sortDirection === 'asc' || repeater.sortDirection === 'desc') {
    query.sortDirection = repeater.sortDirection;
  }

  return {
    id: datasetId,
    collectionId,
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(pagination ? { pagination } : {}),
  };
};

const repeaterRecordValueForFieldPath = (
  siteId: string,
  collection: StoreCollection,
  record: StoreCollectionRecord,
  fieldPath: unknown,
  context?: RenderPayloadContext,
): unknown => {
  const path = typeof fieldPath === 'string' ? fieldPath : '';
  if (!path.includes('.')) {
    return undefined;
  }
  return resolveCollectionRecordFieldPath(siteId, collection, record, path.split('.'), context);
};

const hydrateRepeaterJoinedRecordValues = (
  siteId: string,
  collection: StoreCollection,
  record: StoreCollectionRecord,
  fieldPaths: unknown[],
  context?: RenderPayloadContext,
): StoreCollectionRecord => {
  const joinedValues = fieldPaths.reduce<Record<string, unknown>>((acc, fieldPath) => {
    if (typeof fieldPath !== 'string' || !fieldPath.includes('.')) {
      return acc;
    }
    const value = repeaterRecordValueForFieldPath(siteId, collection, record, fieldPath, context);
    if (value !== undefined) {
      acc[fieldPath] = value;
    }
    return acc;
  }, {});

  if (Object.keys(joinedValues).length === 0) {
    return record;
  }

  return {
    ...record,
    values: {
      ...record.values,
      ...joinedValues,
    },
  };
};

const hydrateRepeaterElement = (
  siteId: string,
  element: RenderElement,
  context?: RenderPayloadContext,
): RenderElement => {
  if (element.type !== 'repeater') {
    return element;
  }

  const dataset = repeaterDatasetForElement(element);
  if (!dataset) {
    return element;
  }

  const collection = renderDataSource(context).getCollectionByIdOrSlug(siteId, dataset.collectionId);
  if (!collection) {
    return element;
  }

  const query = isRecord(dataset.query) ? dataset.query : {};
  const pagination = isRecord(dataset.pagination) ? dataset.pagination : null;
  const titleField = typeof element.props.titleField === 'string'
    ? element.props.titleField
    : typeof element.props.repeaterTitleField === 'string'
      ? element.props.repeaterTitleField
      : 'title';
  const descriptionField = typeof element.props.descriptionField === 'string'
    ? element.props.descriptionField
    : typeof element.props.repeaterDescriptionField === 'string'
      ? element.props.repeaterDescriptionField
      : 'summary';
  const imageField = typeof element.props.imageField === 'string'
    ? element.props.imageField
    : typeof element.props.repeaterImageField === 'string'
      ? element.props.repeaterImageField
      : 'image';
  const metaField = typeof element.props.metaField === 'string'
    ? element.props.metaField
    : typeof element.props.repeaterMetaField === 'string'
      ? element.props.repeaterMetaField
      : '';
  const records = collectionRecordsForQuery(siteId, collection.id, query, pagination, context)
    .map((record) => hydrateRepeaterJoinedRecordValues(siteId, collection, record, [titleField, descriptionField, imageField, metaField], context));

  return {
    ...element,
    props: {
      ...element.props,
      schemaVersion: 'backy.repeater.v1',
      datasetId: dataset.id,
      collectionId: collection.id,
      collectionSlug: collection.slug,
      collectionName: collection.name,
      fields: normalizeResolvedCollectionFields(collection.fields),
      records: normalizeResolvedCollectionRecords(records).map((record) => ({
        ...record,
        href: typeof record.slug === 'string' && record.slug.length > 0
          ? buildCollectionItemPath(collection, record.slug)
          : undefined,
      })),
      titleField,
      descriptionField,
      imageField,
      metaField,
    },
  };
};

const collectDataBindingManifest = (
  siteId: string,
  elements: RenderElement[],
  context?: RenderPayloadContext,
) => {
  const bindings: JsonObject[] = [];
  const datasets = new Map<string, DatasetManifest>();

  walkElements(elements, (element) => {
    const repeaterDataset = repeaterDatasetForElement(element);
    if (repeaterDataset) {
      datasets.set(repeaterDataset.id, repeaterDataset);
    }

    element.dataBindings?.forEach((binding, index) => {
      const source = isRecord(binding.source) ? binding.source : {};
      const collectionId = typeof source.collectionId === 'string' && source.collectionId.length > 0
        ? source.collectionId
        : typeof binding.collectionId === 'string' && binding.collectionId.length > 0
          ? binding.collectionId
          : null;
      const normalizedBinding = normalizeCollectionBinding(binding, element, index);

      if (!collectionId || !normalizedBinding) {
        const schemaBinding = normalizeSchemaBinding(binding, element, index);
        if (schemaBinding) {
          bindings.push(schemaBinding);
        }
        return;
      }

      const datasetId = typeof binding.datasetId === 'string' && binding.datasetId.length > 0
        ? binding.datasetId
        : `dataset_${collectionId}`;
      const query = isRecord(binding.query)
        ? { ...binding.query }
        : isRecord(source.query)
          ? { ...source.query }
          : {};
      const pagination = normalizeBindingPagination(binding.pagination);
      const sourceRecordId = isRecord(normalizedBinding.source) && typeof normalizedBinding.source.recordId === 'string'
        ? normalizedBinding.source.recordId
        : null;

      if (sourceRecordId && !('recordId' in query)) {
        query.recordId = sourceRecordId;
      }

      datasets.set(datasetId, {
        id: datasetId,
        collectionId,
        ...(Object.keys(query).length > 0 ? { query } : {}),
        ...(pagination ? { pagination } : {}),
      });
      bindings.push(normalizedBinding);
    });
  });

  return {
    schemaVersion: 'backy.bindings.v1',
    datasets: [...datasets.values()].map((dataset) => hydrateDatasetRecords(siteId, dataset, context)),
    bindings,
  };
};

const pageDefaultWidth = 1200;

const normalizeEditableMapRecord = (value: unknown): Record<string, JsonObject> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonObject] => isRecord(entry[1])),
  );
};

const buildEditableMap = (
  elements: RenderElement[],
  explicitEditableMap?: unknown,
): Record<string, JsonObject> => {
  const editableMap: Record<string, JsonObject> = normalizeEditableMapRecord(
    buildFrontendDesignEditableMapRecord(elements, explicitEditableMap),
  );

  walkElements(elements, (element) => {
    const props = element.props;
    if ('content' in props && !editableMap[`element.${element.id}.content`]) {
      editableMap[`element.${element.id}.content`] = {
        elementId: element.id,
        field: 'props.content',
        editable: true,
        label: `${element.type} content`,
        valueType: Array.isArray(props.content) ? 'richText' : 'string',
        scope: 'element',
      };
    }

    if (
      ('src' in props || 'mediaId' in props || 'assetId' in props)
      && !editableMap[`element.${element.id}.asset`]
    ) {
      editableMap[`element.${element.id}.asset`] = {
        elementId: element.id,
        field: 'props.assetId',
        editable: true,
        label: `${element.type} asset`,
        valueType: element.type === 'video' ? 'video' : 'image',
        scope: 'element',
      };
    }

    element.dataBindings?.forEach((binding, index) => {
      const normalizedBinding = normalizeCollectionBinding(binding, element, index);
      const source = isRecord(normalizedBinding?.source) ? normalizedBinding.source : null;
      const field = typeof source?.field === 'string' ? source.field : null;

      if (!normalizedBinding || !source || !field) {
        return;
      }

      const collectionBindingKey = `collection.${source.collectionId}.${element.id}.${field}`;
      editableMap[collectionBindingKey] = {
        elementId: element.id,
        field: normalizedBinding.targetPath,
        editable: true,
        label: `${element.type} ${field}`,
        valueType: normalizedBinding.mode === 'image' ? 'image' : normalizedBinding.mode === 'html' ? 'richText' : 'string',
        scope: 'collectionRecord',
        collectionId: source.collectionId,
        recordId: source.recordId,
        sourceField: field,
      };
    });
  });

  return editableMap;
};

const buildFontAssets = (site: StoreSite, context?: RenderPayloadContext) => {
  const themeFonts = (site.theme.fonts.custom || []).map((font) => ({
    id: `font_${font.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    family: font.name,
    source: 'uploaded',
    url: font.url,
  }));
  const mediaFonts = renderDataSource(context).getMediaList(site.id, {
    type: 'font',
    visibility: 'public',
    limit: 100,
  }).media;
  const publicFontManifest = buildPublicFontManifest(site.id, mediaFonts);
  const mediaFontAssets = publicFontManifest.families.map((family) => {
    const firstVariant = family.variants[0];
    const uniqueWeights = Array.from(new Set(family.variants.map((variant) => variant.weight).filter(Boolean)));
    const uniqueStyles = Array.from(new Set(family.variants.map((variant) => variant.style).filter(Boolean)));

    return {
      id: firstVariant?.mediaId || `font_${family.family.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      mediaId: firstVariant?.mediaId,
      family: family.family,
      source: 'uploaded',
      url: firstVariant?.url,
      weights: uniqueWeights.length ? uniqueWeights : ['400'],
      styles: uniqueStyles.length ? uniqueStyles : ['normal'],
      fallbackStack: family.fallbackStack,
      display: family.display,
      cssFamily: family.cssFamily,
      assetIds: family.assetIds,
      variants: family.variants,
    };
  });
  const seen = new Set<string>();

  return [...themeFonts, ...mediaFontAssets].filter((font) => {
    const assetIds = 'assetIds' in font && Array.isArray(font.assetIds) ? font.assetIds : [];
    const key = `${font.family}:${font.url || ''}:${assetIds.join(',')}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const normalizePostElements = (post: StoreBlogPost): RenderElement[] => {
  const content = post.content;
  const rawElements = Array.isArray(content.elements) ? content.elements : [];
  const elements = rawElements
    .map(normalizeElement)
    .filter((element): element is RenderElement => !!element);

  if (elements.length) {
    return elements;
  }

  const html = typeof content.html === 'string' ? content.html : '';
  const legacyElement: RenderElement = {
    id: `${post.id}_legacy_content`,
    type: html ? 'html' : 'text',
    children: [],
    props: html
      ? { html }
      : {
          content: post.excerpt || post.title,
          fontSize: 18,
          lineHeight: 1.7,
          color: '#334155',
        },
    styles: {},
    actions: [],
    dataBindings: [],
  };

  return [legacyElement];
};

const safeIdPart = (value: string): string => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
);

const stringifyRecordValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyRecordValue).filter(Boolean).join(', ');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const preferredTitleField = (collection: StoreCollection, record: StoreCollectionRecord) => (
  collection.fields.find((field) => ['title', 'name', 'label'].includes(field.key) && stringifyRecordValue(record.values[field.key]).length > 0)
  || collection.fields.find((field) => stringifyRecordValue(record.values[field.key]).length > 0)
);

const preferredDescriptionField = (collection: StoreCollection, record: StoreCollectionRecord) => (
  collection.fields.find((field) => (
    ['summary', 'description', 'bio', 'content', 'body'].includes(field.key)
    && stringifyRecordValue(record.values[field.key]).length > 0
  ))
);

const preferredImageField = (collection: StoreCollection, record: StoreCollectionRecord) => (
  collection.fields.find((field) => (
    (field.type === 'image' || /image|photo|avatar|thumbnail/i.test(field.key))
    && stringifyRecordValue(record.values[field.key]).length > 0
  ))
);

const getCollectionRecordTitle = (collection: StoreCollection, record: StoreCollectionRecord): string => {
  const titleField = preferredTitleField(collection, record);
  return titleField ? stringifyRecordValue(record.values[titleField.key]) : record.slug;
};

const getCollectionRecordDescription = (collection: StoreCollection, record: StoreCollectionRecord): string => {
  const descriptionField = preferredDescriptionField(collection, record);
  if (descriptionField) {
    return stringifyRecordValue(record.values[descriptionField.key]);
  }

  const titleField = preferredTitleField(collection, record);
  const secondaryField = collection.fields.find((field) => (
    field.key !== titleField?.key
    && field.type !== 'image'
    && stringifyRecordValue(record.values[field.key]).length > 0
  ));

  return secondaryField ? stringifyRecordValue(record.values[secondaryField.key]) : collection.description || '';
};

const collectionBindingForField = (
  collection: StoreCollection,
  record: StoreCollectionRecord,
  fieldKey: string,
  targetPath: string,
): JsonObject[] => {
  const field = collection.fields.find((item) => item.key === fieldKey);
  const mode = field?.type === 'richText'
    ? 'html'
    : field?.type === 'image'
      ? 'image'
      : field?.type === 'number'
        ? 'number'
        : 'text';

  return [
    {
      id: `bind_${safeIdPart(record.id)}_${safeIdPart(fieldKey)}`,
      datasetId: `dataset_${collection.id}_${record.id}`,
      targetPath,
      mode,
      source: {
        kind: 'collection',
        collectionId: collection.id,
        field: fieldKey,
        recordId: record.id,
      },
      query: {
        recordId: record.id,
      },
    },
  ];
};

const collectionFieldForKey = (collection: StoreCollection, fieldKey: string) => (
  collection.fields.find((field) => field.key === fieldKey)
);

const targetPathForElementBinding = (
  element: RenderElement,
  collection: StoreCollection,
  fieldKey: string,
): string => {
  if (typeof element.props.bindingTargetPath === 'string' && element.props.bindingTargetPath.length > 0) {
    return element.props.bindingTargetPath;
  }

  const field = collectionFieldForKey(collection, fieldKey);
  if (field?.type === 'image' || element.type === 'image') {
    return 'props.assetId';
  }
  if (field?.type === 'richText' || element.type === 'html') {
    return 'props.html';
  }

  return 'props.content';
};

const applyTemplateValue = (
  siteId: string,
  element: RenderElement,
  targetPath: string,
  value: unknown,
  context?: RenderPayloadContext,
): RenderElement => (
  targetPath.startsWith('props.')
    ? applyBindingValue(siteId, element, targetPath, value, context)
    : element
);

const collectionTemplateSchemaValue = (
  collection: StoreCollection,
  binding: string,
): unknown => {
  const key = binding.replace(/^collection\./, '');
  if (key === 'name' || key === 'title') return collection.name;
  if (key === 'description') return collection.description || '';
  if (key === 'slug') return collection.slug;
  if (key === 'routePattern') return collection.routePattern || '';
  if (key === 'listRoutePattern') return collection.listRoutePattern || '';
  if (key === 'status') return collection.status;
  return undefined;
};

const recordTemplateFieldKey = (binding: string): string => {
  const normalized = binding.trim();
  for (const prefix of ['record.', 'product.', 'item.']) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }
  return '';
};

const applyCollectionTemplateContext = (
  siteId: string,
  element: RenderElement,
  collection: StoreCollection,
  kind: CollectionTemplateRenderKind,
  record?: StoreCollectionRecord,
  context?: RenderPayloadContext,
): RenderElement => {
  const children = element.children.map((child) => (
    applyCollectionTemplateContext(siteId, child, collection, kind, record, context)
  ));
  let next: RenderElement = {
    ...element,
    children,
    props: { ...element.props },
    dataBindings: [...(element.dataBindings || [])],
  };
  const binding = typeof next.props.binding === 'string' ? next.props.binding.trim() : '';
  const bindsCollectionRecords = /^collections\.[^.]+\.records$/.test(binding) || binding === 'collection.records';

  if (next.type === 'repeater' || bindsCollectionRecords) {
    const repeater = isRecord(next.props.repeater) ? { ...next.props.repeater } : {};
    const rawRepeaterQuery = isRecord(repeater.query)
      ? repeater.query
      : isRecord(next.props.query)
        ? next.props.query
        : { status: 'published' };
    const rawRepeaterPagination = isRecord(repeater.pagination)
      ? repeater.pagination
      : isRecord(next.props.pagination)
        ? next.props.pagination
        : { limit: 24, offset: 0 };
    const explicitCollectionId = typeof repeater.collectionId === 'string' && repeater.collectionId.length > 0
      ? repeater.collectionId
      : typeof next.props.collectionId === 'string' && next.props.collectionId.length > 0
        ? next.props.collectionId
        : '';
    const repeaterCollectionId = explicitCollectionId || collection.id;
    const repeaterDatasetId = typeof repeater.datasetId === 'string' && repeater.datasetId.length > 0
      ? repeater.datasetId
      : typeof next.props.datasetId === 'string' && next.props.datasetId.length > 0
        ? next.props.datasetId
        : `dataset_${repeaterCollectionId}_list`;
    const repeaterQuery = resolveCollectionTemplateQuery(rawRepeaterQuery, kind === 'item' ? record : undefined);
    const titleField = collection.fields.find((field) => ['title', 'name', 'label'].includes(field.key)) || collection.fields[0];
    const descriptionField = collection.fields.find((field) => ['summary', 'description', 'excerpt', 'body'].includes(field.key));
    const imageField = collection.fields.find((field) => field.type === 'image' || /image|photo|avatar|thumbnail/i.test(field.key));
    next.props = {
      ...next.props,
      repeater: {
        ...repeater,
        collectionId: repeaterCollectionId,
        datasetId: repeaterDatasetId,
        query: repeaterQuery,
        pagination: rawRepeaterPagination,
      },
      collectionId: repeaterCollectionId,
      datasetId: repeaterDatasetId,
      query: repeaterQuery,
      pagination: rawRepeaterPagination,
      titleField: typeof next.props.titleField === 'string' ? next.props.titleField : titleField?.key || 'title',
      descriptionField: typeof next.props.descriptionField === 'string' ? next.props.descriptionField : descriptionField?.key || 'summary',
      imageField: typeof next.props.imageField === 'string' ? next.props.imageField : imageField?.key || 'image',
    };
  }

  if (binding.startsWith('collection.')) {
    const value = collectionTemplateSchemaValue(collection, binding);
    if (value !== undefined) {
      next = applyTemplateValue(siteId, next, targetPathForElementBinding(next, collection, ''), value, context);
    }
  }

  if (kind === 'item' && record && binding) {
    const fieldKey = recordTemplateFieldKey(binding);
    if (fieldKey) {
      const value = fieldKey === 'slug'
        ? record.slug
        : fieldKey === 'status'
          ? record.status
          : record.values[fieldKey];
      const targetPath = targetPathForElementBinding(next, collection, fieldKey);
      next = applyTemplateValue(siteId, next, targetPath, value, context);

      if (fieldKey !== 'slug' && fieldKey !== 'status') {
        next.dataBindings = [
          ...(next.dataBindings || []),
          ...collectionBindingForField(collection, record, fieldKey, targetPath),
        ];
      }
    }
  }

  next.dataBindings = (next.dataBindings || []).map((dataBinding) => {
    const source = isRecord(dataBinding.source) ? { ...dataBinding.source } : {};
    const field = typeof source.field === 'string' && source.field.length > 0
      ? source.field
      : typeof dataBinding.field === 'string' && dataBinding.field.length > 0
        ? dataBinding.field
        : '';

    if (!field && !source.collectionId && !dataBinding.collectionId) {
      return dataBinding;
    }

    return {
      ...dataBinding,
      collectionId: collection.id,
      source: {
        ...source,
        kind: 'collection',
        collectionId: collection.id,
        ...(field ? { field } : {}),
        ...(kind === 'item' && record ? { recordId: record.id } : {}),
      },
      ...(kind === 'item' && record
        ? { query: { ...resolveCollectionTemplateQuery(dataBinding.query, record), recordId: record.id } }
        : {}),
    };
  });

  return next;
};

export const buildCollectionTemplateContent = (
  site: StoreSite,
  collection: StoreCollection,
  kind: CollectionTemplateRenderKind,
  record?: StoreCollectionRecord,
  context?: RenderPayloadContext,
): CollectionRenderableContent | null => {
  const canvas = collectionTemplateCanvas(site, collection, kind);
  if (!canvas) {
    return null;
  }

  const elements = resolveElementDataBindings(
    site.id,
    canvas.elements
      .map(normalizeElement)
      .filter((element): element is RenderElement => !!element)
      .map((element) => applyCollectionTemplateContext(site.id, element, collection, kind, record, context)),
    context,
  );

  if (elements.length === 0) {
    return null;
  }

  return {
    canvasSize: {
      width: canvas.canvasSize?.width || pageDefaultWidth,
      height: canvas.canvasSize?.height || Math.max(720, ...elements.map((element) => {
        const y = typeof element.y === 'number' ? element.y : 0;
        const height = typeof element.height === 'number' ? element.height : 0;
        return y + height + 96;
      })),
    },
    ...(canvas.customCSS ? { customCSS: canvas.customCSS } : {}),
    ...(canvas.customJS ? { customJS: canvas.customJS } : {}),
    ...(canvas.themeTokenRefs ? { themeTokenRefs: canvas.themeTokenRefs } : {}),
    ...(canvas.assets ? { assets: canvas.assets } : {}),
    ...(canvas.animations ? { animations: canvas.animations } : {}),
    ...(canvas.interactions ? { interactions: canvas.interactions } : {}),
    ...(canvas.seo ? { seo: canvas.seo } : {}),
    ...(canvas.dataBindings ? { dataBindings: canvas.dataBindings } : {}),
    ...(canvas.editableMap ? { editableMap: canvas.editableMap } : {}),
    ...(canvas.metadata ? { metadata: canvas.metadata } : {}),
    ...(canvas.contentDocument ? { contentDocument: canvas.contentDocument } : {}),
    elements,
  };
};

const buildCollectionListDataset = (
  collection: StoreCollection,
  records: StoreCollectionRecord[],
): DatasetManifest => ({
  id: `dataset_${collection.id}_list`,
  collectionId: collection.id,
  query: {
    status: 'published',
    limit: records.length,
    offset: 0,
  },
  pagination: {
    limit: Math.max(1, records.length || 1),
    offset: 0,
  },
  fields: normalizeResolvedCollectionFields(collection.fields),
  records: normalizeResolvedCollectionRecords(records),
});

const buildCollectionItemDataset = (
  collection: StoreCollection,
  record: StoreCollectionRecord,
): DatasetManifest => ({
  id: `dataset_${collection.id}_${record.id}`,
  collectionId: collection.id,
  query: {
    recordId: record.id,
  },
  pagination: {
    limit: 1,
    offset: 0,
  },
  fields: normalizeResolvedCollectionFields(collection.fields),
  records: normalizeResolvedCollectionRecords([record]),
});

type DynamicCollectionListVariant = 'cards' | 'compact' | 'showcase';
type DynamicCollectionItemVariant = 'split' | 'centered' | 'directory';

const collectionDynamicTemplateRecord = (collection: StoreCollection): JsonObject => {
  const metadata = isRecord(collection.metadata) ? collection.metadata : {};
  return isRecord(metadata.dynamicTemplates) ? metadata.dynamicTemplates : {};
};

const collectionDynamicTemplateSection = (
  collection: StoreCollection,
  section: 'list' | 'item',
): JsonObject => {
  const dynamicTemplates = collectionDynamicTemplateRecord(collection);
  return isRecord(dynamicTemplates[section]) ? dynamicTemplates[section] as JsonObject : {};
};

const stringSetting = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const stringListSetting = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
);

const configuredField = (
  collection: StoreCollection,
  key: unknown,
): StoreCollection['fields'][number] | undefined => {
  const fieldKey = stringSetting(key);
  return fieldKey ? collection.fields.find((field) => field.key === fieldKey) : undefined;
};

const selectedTitleField = (collection: StoreCollection, record: StoreCollectionRecord) => (
  configuredField(collection, collectionDynamicTemplateSection(collection, 'item').titleField)
  || configuredField(collection, collectionDynamicTemplateSection(collection, 'list').titleField)
  || preferredTitleField(collection, record)
);

const selectedDescriptionField = (collection: StoreCollection, record: StoreCollectionRecord) => (
  configuredField(collection, collectionDynamicTemplateSection(collection, 'item').descriptionField)
  || configuredField(collection, collectionDynamicTemplateSection(collection, 'list').descriptionField)
  || preferredDescriptionField(collection, record)
);

const selectedImageField = (collection: StoreCollection, record: StoreCollectionRecord) => (
  configuredField(collection, collectionDynamicTemplateSection(collection, 'item').imageField)
  || configuredField(collection, collectionDynamicTemplateSection(collection, 'list').imageField)
  || preferredImageField(collection, record)
);

const collectionListVariant = (collection: StoreCollection): DynamicCollectionListVariant => {
  const variant = stringSetting(collectionDynamicTemplateSection(collection, 'list').variant);
  return variant === 'compact' || variant === 'showcase' ? variant : 'cards';
};

const collectionItemVariant = (collection: StoreCollection): DynamicCollectionItemVariant => {
  const variant = stringSetting(collectionDynamicTemplateSection(collection, 'item').variant);
  return variant === 'centered' || variant === 'directory' ? variant : 'split';
};

const collectionListLimit = (collection: StoreCollection): number => {
  const limit = Number(collectionDynamicTemplateSection(collection, 'list').limit);
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 48) : 24;
};

const collectionDetailFields = (
  collection: StoreCollection,
  record: StoreCollectionRecord,
  titleField?: StoreCollection['fields'][number],
  descriptionField?: StoreCollection['fields'][number],
  imageField?: StoreCollection['fields'][number],
) => {
  const configured = stringListSetting(collectionDynamicTemplateSection(collection, 'item').detailFields)
    .map((key) => collection.fields.find((field) => field.key === key))
    .filter((field): field is StoreCollection['fields'][number] => Boolean(field));
  const fields = configured.length > 0
    ? configured
    : collection.fields.filter((field) => (
      field.key !== titleField?.key
      && field.key !== descriptionField?.key
      && field.key !== imageField?.key
    ));

  return fields
    .filter((field) => stringifyRecordValue(record.values[field.key]).length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 10);
};

export const buildCollectionListContent = (
  site: StoreSite,
  collection: StoreCollection,
  records: StoreCollectionRecord[],
  context?: RenderPayloadContext,
): CollectionRenderableContent => {
  const safeCollectionId = safeIdPart(collection.id);
  const variant = collectionListVariant(collection);
  const visibleRecords = records.slice(0, collectionListLimit(collection));
  const elements: RenderElement[] = [
    {
      id: `dynamic_list_${safeCollectionId}_eyebrow`,
      type: 'text',
      x: 96,
      y: 76,
      width: 1008,
      height: 28,
      children: [],
      props: {
        content: 'Collection',
        fontSize: 13,
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
      },
      styles: {},
      actions: [],
      dataBindings: [],
    },
    {
      id: `dynamic_list_${safeCollectionId}_title`,
      type: 'heading',
      x: 96,
      y: 112,
      width: 704,
      height: 72,
      children: [],
      props: {
        content: collection.name,
        level: 1,
        fontSize: 48,
        lineHeight: 1.1,
        fontWeight: 800,
        color: '#111827',
      },
      styles: {},
      actions: [],
      dataBindings: [],
    },
    {
      id: `dynamic_list_${safeCollectionId}_summary`,
      type: 'text',
      x: 96,
      y: 198,
      width: 720,
      height: 58,
      children: [],
      props: {
        content: collection.description || `Browse ${collection.name.toLowerCase()}.`,
        fontSize: 18,
        lineHeight: 1.55,
        color: '#475569',
      },
      styles: {},
      actions: [],
      dataBindings: [],
    },
  ];

  visibleRecords.forEach((record, index) => {
    const titleField = selectedTitleField(collection, record);
    const descriptionField = selectedDescriptionField(collection, record);
    const imageField = selectedImageField(collection, record);
    const title = titleField ? stringifyRecordValue(record.values[titleField.key]) : getCollectionRecordTitle(collection, record);
    const description = descriptionField ? stringifyRecordValue(record.values[descriptionField.key]) : getCollectionRecordDescription(collection, record);
    const imageValue = imageField ? stringifyRecordValue(record.values[imageField.key]) : '';
    const media = imageValue ? renderDataSource(context).getMediaById(site.id, imageValue) : undefined;
    const imageSrc = media ? publicMediaFilePath(site.id, media.id) : (/^(https?:)?\/\//.test(imageValue) || imageValue.startsWith('/') ? imageValue : '');
    const href = buildCollectionItemPath(collection, record.slug);
    const cardId = `dynamic_list_${safeCollectionId}_${safeIdPart(record.id)}`;
    const isCompact = variant === 'compact';
    const isShowcase = variant === 'showcase';
    const column = isCompact || isShowcase ? 0 : index % 3;
    const row = isCompact || isShowcase ? index : Math.floor(index / 3);
    const x = isCompact || isShowcase ? 96 : 96 + column * 344;
    const y = isCompact ? 312 + row * 118 : isShowcase ? 312 + row * 238 : 312 + row * 220;
    const width = isCompact || isShowcase ? 1008 : 312;
    const height = isCompact ? 92 : isShowcase ? 202 : 184;
    const hasInlineImage = Boolean(imageSrc && (isCompact || isShowcase));
    const textX = x + (hasInlineImage ? 180 : 24);
    const textWidth = width - (hasInlineImage ? 220 : 48);

    elements.push(
      {
        id: `${cardId}_card`,
        type: 'box',
        x,
        y,
        width,
        height,
        children: [],
        props: {
          href,
          backgroundColor: '#ffffff',
          borderColor: '#e5e7eb',
          borderWidth: 1,
          borderRadius: 8,
        },
        styles: {
          boxShadow: '0 14px 32px rgba(15,23,42,0.08)',
        },
        actions: [
          {
            id: `action_${cardId}_open`,
            type: 'route',
            target: href,
            href,
          },
        ],
        dataBindings: [],
      },
      ...(hasInlineImage
        ? [{
            id: `${cardId}_image`,
            type: 'image',
            x: x + 20,
            y: y + 18,
            width: isShowcase ? 132 : 120,
            height: isShowcase ? 166 : 56,
            children: [],
            props: {
              src: imageSrc,
              mediaId: media?.id || imageValue,
              assetId: media?.id || imageValue,
              alt: title,
              objectFit: 'cover',
              borderRadius: '8px',
            },
            styles: {},
            actions: [],
            dataBindings: imageField ? collectionBindingForField(collection, record, imageField.key, 'props.assetId') : [],
          } as RenderElement]
        : []),
      {
        id: `${cardId}_title`,
        type: 'heading',
        x: textX,
        y: y + 24,
        width: textWidth,
        height: 42,
        children: [],
        props: {
          content: title,
          level: 2,
          fontSize: 22,
          lineHeight: 1.2,
          fontWeight: 750,
          color: '#0f172a',
          href,
        },
        styles: {},
        actions: [
          {
            id: `action_${cardId}_title_open`,
            type: 'route',
            label: title,
            target: href,
            href,
          },
        ],
        dataBindings: titleField ? collectionBindingForField(collection, record, titleField.key, 'props.content') : [],
      },
      {
        id: `${cardId}_description`,
        type: 'text',
        x: textX,
        y: isCompact ? y + 44 : y + 78,
        width: textWidth,
        height: isCompact ? 34 : 72,
        children: [],
        props: {
          content: description,
          fontSize: 15,
          lineHeight: 1.45,
          color: '#475569',
        },
        styles: {},
        actions: [],
        dataBindings: descriptionField ? collectionBindingForField(collection, record, descriptionField.key, 'props.content') : [],
      },
    );
  });

  if (visibleRecords.length === 0) {
    elements.push({
      id: `dynamic_list_${safeCollectionId}_empty`,
      type: 'text',
      x: 96,
      y: 312,
      width: 720,
      height: 48,
      children: [],
      props: {
        content: 'No published records yet.',
        fontSize: 18,
        lineHeight: 1.5,
        color: '#475569',
      },
      styles: {},
      actions: [],
      dataBindings: [],
    });
  }

  return {
    canvasSize: {
      width: pageDefaultWidth,
      height: Math.max(
        720,
        variant === 'compact'
          ? 360 + Math.max(visibleRecords.length, 1) * 118
          : variant === 'showcase'
            ? 360 + Math.max(visibleRecords.length, 1) * 238
            : 360 + Math.ceil(Math.max(visibleRecords.length, 1) / 3) * 220,
      ),
    },
    elements,
  };
};

export const buildCollectionItemContent = (
  site: StoreSite,
  collection: StoreCollection,
  record: StoreCollectionRecord,
  context?: RenderPayloadContext,
): CollectionRenderableContent => {
  const variant = collectionItemVariant(collection);
  const titleField = selectedTitleField(collection, record);
  const descriptionField = selectedDescriptionField(collection, record);
  const imageField = selectedImageField(collection, record);
  const title = titleField ? stringifyRecordValue(record.values[titleField.key]) : getCollectionRecordTitle(collection, record);
  const imageValue = imageField ? stringifyRecordValue(record.values[imageField.key]) : '';
  const media = imageValue ? renderDataSource(context).getMediaById(site.id, imageValue) : undefined;
  const imageSrc = media ? publicMediaFilePath(site.id, media.id) : (/^(https?:)?\/\//.test(imageValue) || imageValue.startsWith('/') ? imageValue : '');
  const contentLeft = variant === 'centered' ? 260 : imageSrc && variant === 'split' ? 536 : 96;
  const contentWidth = variant === 'centered' ? 680 : variant === 'directory' ? 1008 : 568;
  const detailFields = collectionDetailFields(collection, record, titleField, descriptionField, imageField)
    .slice(0, variant === 'directory' ? 10 : 6);
  const elements: RenderElement[] = [
    {
      id: `dynamic_${safeIdPart(collection.id)}_${safeIdPart(record.id)}_eyebrow`,
      type: 'text',
      x: contentLeft,
      y: 96,
      width: contentWidth,
      height: 32,
      children: [],
      props: {
        content: collection.name,
        fontSize: 14,
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
      },
      styles: {},
      actions: [],
      dataBindings: [],
    },
    {
      id: `dynamic_${safeIdPart(collection.id)}_${safeIdPart(record.id)}_title`,
      type: 'heading',
      x: contentLeft,
      y: 136,
      width: contentWidth,
      height: 104,
      children: [],
      props: {
        content: title,
        level: 1,
        fontSize: 48,
        lineHeight: 1.1,
        fontWeight: 800,
        color: '#111827',
      },
      styles: {},
      actions: [],
      dataBindings: titleField
        ? collectionBindingForField(collection, record, titleField.key, 'props.content')
        : [],
    },
  ];

  if (imageSrc && imageField && variant !== 'directory') {
    elements.unshift({
      id: `dynamic_${safeIdPart(collection.id)}_${safeIdPart(record.id)}_${safeIdPart(imageField.key)}`,
      type: 'image',
      x: variant === 'centered' ? 260 : 96,
      y: variant === 'centered' ? 276 : 96,
      width: variant === 'centered' ? 680 : 376,
      height: variant === 'centered' ? 320 : 420,
      children: [],
      props: {
        src: imageSrc,
        mediaId: media?.id || imageValue,
        assetId: media?.id || imageValue,
        alt: title,
        objectFit: 'cover',
        borderRadius: '8px',
      },
      styles: {},
      actions: [],
      dataBindings: collectionBindingForField(collection, record, imageField.key, 'props.assetId'),
    });
  }

  if (descriptionField) {
    const descriptionValue = stringifyRecordValue(record.values[descriptionField.key]);
    elements.push({
      id: `dynamic_${safeIdPart(collection.id)}_${safeIdPart(record.id)}_${safeIdPart(descriptionField.key)}`,
      type: descriptionField.type === 'richText' ? 'html' : 'text',
      x: contentLeft,
      y: variant === 'centered' && imageSrc ? 636 : 264,
      width: contentWidth,
      height: 148,
      children: [],
      props: descriptionField.type === 'richText'
        ? { html: descriptionValue }
        : {
            content: descriptionValue,
            fontSize: 18,
            lineHeight: 1.65,
            color: '#374151',
          },
      styles: {},
      actions: [],
      dataBindings: collectionBindingForField(
        collection,
        record,
        descriptionField.key,
        descriptionField.type === 'richText' ? 'props.html' : 'props.content',
      ),
    });
  }

  detailFields.forEach((field, index) => {
    const gridColumn = variant === 'directory' ? index % 2 : 0;
    const gridRow = variant === 'directory' ? Math.floor(index / 2) : index;
    const y = variant === 'centered' && imageSrc
      ? 820 + index * 64
      : variant === 'directory'
        ? 360 + gridRow * 82
        : 456 + index * 64;
    elements.push({
      id: `dynamic_${safeIdPart(collection.id)}_${safeIdPart(record.id)}_${safeIdPart(field.key)}`,
      type: 'text',
      x: variant === 'directory' ? 96 + gridColumn * 520 : contentLeft,
      y,
      width: variant === 'directory' ? 488 : contentWidth,
      height: variant === 'directory' ? 62 : 48,
      children: [],
      props: {
        content: `${field.label}: ${stringifyRecordValue(record.values[field.key])}`,
        fontSize: 16,
        lineHeight: 1.5,
        color: '#1f2937',
      },
      styles: {},
      actions: [],
      dataBindings: collectionBindingForField(collection, record, field.key, 'props.content'),
    });
  });

  return {
    canvasSize: {
      width: pageDefaultWidth,
      height: Math.max(
        760,
        variant === 'centered' && imageSrc
          ? 900 + detailFields.length * 64
          : variant === 'directory'
            ? 460 + Math.ceil(Math.max(detailFields.length, 1) / 2) * 82
            : 560 + detailFields.length * 64,
      ),
    },
    elements,
  };
};

export function buildPublicRenderPayload(site: StoreSite, page: StorePage, options: RenderPayloadOptions) {
  const context = { dataSource: options.dataSource };
  const sourceData = renderDataSource(context);
  const elements = resolveElementDataBindings(site.id, page.content.elements, context);
  const payloadElements = elements.map(normalizeElementForPayload);
  const mediaPayload = sourceData.getMediaList(site.id, {
    pageId: page.id,
    visibility: 'public',
    limit: 100,
  });
  const forms = listFormsBySite(site.id, { pageId: page.id });
  const locale = options.locale || 'en';
  const canonical = options.canonicalPath || (page.isHomepage ? '/' : page.meta.canonical || getCanonicalPathForPage(page));
  const actions = collectElementActions(elements);
  const dataBindings = collectDataBindingManifest(site.id, elements, context);
  const navigation = sourceData.getSiteNavigation(site.id);
  const collectionDataset = isRecord(page.meta.collectionDataset) ? page.meta.collectionDataset : null;
  const editableMap = buildEditableMap(elements, page.content.editableMap);

  return {
    success: true,
    requestId: options.requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        locale,
        status: site.status,
        assetsBaseUrl: '',
        themeTokens: buildBackyThemeTokens(site.theme),
      },
      navigation,
      frontendDesign: buildRenderFrontendDesign(site, page.meta),
      route: {
        type: 'page',
        path: options.path,
        status: page.status,
        canonical,
        params: { locale },
        dataset: collectionDataset,
      },
      content: buildCanonicalContentPayload({
        id: page.id,
        kind: 'page',
        title: page.title,
        status: page.status,
        locale,
        version: page.updatedAt,
        elements: payloadElements,
        editableMap,
      }),
      assets: {
        media: mediaPayload.media,
        fonts: buildFontAssets(site, context),
      },
      interactions: {
        forms: forms.map((form) => ({
          id: form.id,
          endpoint: `/api/sites/${site.id}/forms/${form.id}/submissions`,
          method: 'POST',
          fields: form.fields,
        })),
        comments: [
          {
            id: `thread_${page.id}`,
            targetType: 'page',
            targetId: page.id,
            endpoint: `/api/sites/${site.id}/pages/${page.id}/comments`,
            moderationMode: 'manual',
            count: 0,
          },
        ],
        actions: {
          schemaVersion: 'backy.actions.v1',
          actions,
        },
      },
      seo: {
        title: page.meta.title || page.title,
        description: page.meta.description || page.description || '',
        canonical,
        keywords: toStringArray(page.meta.keywords),
        robots: {
          index: !page.meta.noIndex,
          follow: !page.meta.noFollow,
        },
        openGraph: {
          title: page.meta.title || page.title,
          description: page.meta.description || page.description || '',
          image: page.meta.ogImage || undefined,
        },
        jsonLd: [...getSiteJsonLd(site), ...getMetaJsonLd(page.meta)],
      },
      dataBindings: {
        ...dataBindings,
        collectionDataset,
      },
      editableMap,
    },
  };
}

export function buildPublicCollectionListRenderPayload(
  site: StoreSite,
  collection: StoreCollection,
  records: StoreCollectionRecord[],
  options: RenderPayloadOptions,
) {
  const context = { dataSource: options.dataSource };
  const sourceData = renderDataSource(context);
  const content = buildCollectionTemplateContent(site, collection, 'list', undefined, context)
    || buildCollectionListContent(site, collection, records, context);
  const elements = content.elements;
  const payloadElements = elements.map(normalizeElementForPayload);
  const mediaPayload = sourceData.getMediaList(site.id, {
    visibility: 'public',
    limit: 100,
  });
  const locale = options.locale || 'en';
  const canonical = options.canonicalPath || buildCollectionListPath(collection);
  const actions = collectElementActions(elements);
  const dataBindings = collectDataBindingManifest(site.id, elements, context);
  const navigation = sourceData.getSiteNavigation(site.id);
  const dataset = buildCollectionListDataset(collection, records);
  const description = collection.description || `${collection.name} collection records.`;
  const editableMap = buildEditableMap(elements, content.editableMap);

  return {
    success: true,
    requestId: options.requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        locale,
        status: site.status,
        assetsBaseUrl: '',
        themeTokens: buildBackyThemeTokens(site.theme),
      },
      navigation,
      frontendDesign: buildRenderFrontendDesign(site, collection.metadata),
      route: {
        type: 'dynamicList',
        path: options.path,
        status: collection.status,
        canonical,
        params: {
          collectionSlug: collection.slug,
          locale,
        },
        resource: {
          id: collection.id,
          kind: 'dynamicList',
          title: collection.name,
          slug: collection.slug,
          collectionId: collection.id,
          collectionSlug: collection.slug,
          collectionName: collection.name,
          recordsUrl: `/api/sites/${site.id}/collections/${collection.id}/records`,
          renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(canonical)}`,
          hostedPath: canonical,
          recordCount: records.length,
          frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
        },
      },
      content: buildCanonicalContentPayload({
        id: collection.id,
        kind: 'dynamicList',
        title: collection.name,
        status: collection.status === 'archived' ? 'archived' : collection.status,
        locale,
        version: collection.updatedAt,
        elements: payloadElements,
        includeContentDocument: true,
        canvasSize: content.canvasSize,
        customCSS: content.customCSS,
        customJS: content.customJS,
        themeTokenRefs: content.themeTokenRefs,
        assets: content.assets,
        animations: content.animations,
        interactions: content.interactions,
        seo: content.seo,
        dataBindings: content.dataBindings,
        editableMap,
        metadata: content.metadata,
        contentDocument: content.contentDocument,
      }),
      assets: {
        media: mediaPayload.media,
        fonts: buildFontAssets(site, context),
      },
      interactions: {
        forms: [],
        comments: [],
        actions: {
          schemaVersion: 'backy.actions.v1',
          actions,
        },
      },
      seo: {
        title: collection.name,
        description,
        canonical,
        keywords: [collection.slug],
        robots: {
          index: true,
          follow: true,
        },
        openGraph: {
          title: collection.name,
          description,
        },
        jsonLd: [
          ...getSiteJsonLd(site),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: collection.name,
            description,
            url: canonical,
          },
        ],
      },
      dataBindings: {
        ...dataBindings,
        datasets: [
          dataset,
          ...dataBindings.datasets.filter((item) => item.id !== dataset.id),
        ],
      },
      editableMap,
    },
  };
}

export function buildPublicCollectionItemRenderPayload(
  site: StoreSite,
  collection: StoreCollection,
  record: StoreCollectionRecord,
  options: RenderPayloadOptions,
) {
  const context = { dataSource: options.dataSource };
  const sourceData = renderDataSource(context);
  const content = buildCollectionTemplateContent(site, collection, 'item', record, context)
    || buildCollectionItemContent(site, collection, record, context);
  const elements = content.elements;
  const payloadElements = elements.map(normalizeElementForPayload);
  const mediaPayload = sourceData.getMediaList(site.id, {
    visibility: 'public',
    limit: 100,
  });
  const locale = options.locale || 'en';
  const canonical = options.canonicalPath || buildCollectionItemPath(collection, record.slug);
  const actions = collectElementActions(elements);
  const dataBindings = collectDataBindingManifest(site.id, elements, context);
  const navigation = sourceData.getSiteNavigation(site.id);
  const title = getCollectionRecordTitle(collection, record);
  const description = getCollectionRecordDescription(collection, record);
  const dataset = buildCollectionItemDataset(collection, record);
  const frontendDesignMetadata = {
    ...collection.metadata,
    ...record.values,
  };
  const designReadiness = collection.slug === PRODUCT_COLLECTION_SLUG
    ? productDesignReadinessFromValues(record.values)
    : undefined;
  const editableMap = buildEditableMap(elements, content.editableMap);

  return {
    success: true,
    requestId: options.requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        locale,
        status: site.status,
        assetsBaseUrl: '',
        themeTokens: buildBackyThemeTokens(site.theme),
      },
      navigation,
      frontendDesign: buildRenderFrontendDesign(site, frontendDesignMetadata),
      route: {
        type: 'dynamicItem',
        path: options.path,
        status: record.status,
        canonical,
        params: {
          collectionSlug: collection.slug,
          recordSlug: record.slug,
          locale,
        },
        resource: {
          id: record.id,
          kind: 'dynamicItem',
          title,
          slug: record.slug,
          collectionId: collection.id,
          collectionSlug: collection.slug,
          collectionName: collection.name,
          apiUrl: `/api/sites/${site.id}/collections/${collection.id}/records?slug=${encodeURIComponent(record.slug)}`,
          renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(canonical)}`,
          hostedPath: canonical,
          frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
          collectionFrontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
          ...(designReadiness ? { designReadiness } : {}),
        },
      },
      content: buildCanonicalContentPayload({
        id: record.id,
        kind: 'dynamicItem',
        title,
        status: record.status,
        locale,
        version: record.updatedAt,
        elements: payloadElements,
        includeContentDocument: true,
        canvasSize: content.canvasSize,
        customCSS: content.customCSS,
        customJS: content.customJS,
        themeTokenRefs: content.themeTokenRefs,
        assets: content.assets,
        animations: content.animations,
        interactions: content.interactions,
        seo: content.seo,
        dataBindings: content.dataBindings,
        editableMap,
        metadata: content.metadata,
        contentDocument: content.contentDocument,
      }),
      assets: {
        media: mediaPayload.media,
        fonts: buildFontAssets(site, context),
      },
      interactions: {
        forms: [],
        comments: [],
        actions: {
          schemaVersion: 'backy.actions.v1',
          actions,
        },
      },
      seo: {
        title,
        description,
        canonical,
        keywords: [collection.slug, record.slug],
        robots: {
          index: true,
          follow: true,
        },
        openGraph: {
          title,
          description,
        },
        jsonLd: [
          ...getSiteJsonLd(site),
          {
            '@context': 'https://schema.org',
            '@type': 'Thing',
            name: title,
            description,
            url: canonical,
          },
        ],
      },
      dataBindings: {
        ...dataBindings,
        datasets: [
          dataset,
          ...dataBindings.datasets.filter((item) => item.id !== dataset.id),
        ],
      },
      editableMap,
    },
  };
}

export function buildPublicBlogPostRenderPayload(
  site: StoreSite,
  post: StoreBlogPost,
  options: RenderPayloadOptions,
) {
  const context = { dataSource: options.dataSource };
  const sourceData = renderDataSource(context);
  const elements = normalizePostElements(post);
  const resolvedElements = resolveElementDataBindings(site.id, elements, context);
  const payloadElements = resolvedElements.map(normalizeElementForPayload);
  const mediaPayload = sourceData.getMediaList(site.id, {
    postId: post.id,
    visibility: 'public',
    limit: 100,
  });
  const forms = listFormsBySite(site.id, { postId: post.id });
  const locale = options.locale || 'en';
  const canonical = options.canonicalPath || post.meta?.canonical || `/blog/${post.slug}`;
  const actions = collectElementActions(resolvedElements);
  const dataBindings = collectDataBindingManifest(site.id, resolvedElements, context);
  const navigation = sourceData.getSiteNavigation(site.id);
  const postEditableMap = isRecord(post.content.editableMap) ? post.content.editableMap : undefined;
  const editableMap = buildEditableMap(resolvedElements, postEditableMap);

  return {
    success: true,
    requestId: options.requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        locale,
        status: site.status,
        assetsBaseUrl: '',
        themeTokens: buildBackyThemeTokens(site.theme),
      },
      navigation,
      frontendDesign: buildRenderFrontendDesign(site, post.meta),
      route: {
        type: 'post',
        path: options.path,
        status: post.status,
        canonical,
        params: {
          slug: post.slug,
          locale,
        },
      },
      content: buildCanonicalContentPayload({
        id: post.id,
        kind: 'post',
        title: post.title,
        status: post.status,
        locale,
        version: post.updatedAt,
        elements: payloadElements,
        editableMap,
      }),
      assets: {
        media: mediaPayload.media,
        fonts: buildFontAssets(site, context),
      },
      interactions: {
        forms: forms.map((form) => ({
          id: form.id,
          endpoint: `/api/sites/${site.id}/forms/${form.id}/submissions`,
          method: 'POST',
          fields: form.fields,
        })),
        comments: [
          {
            id: `thread_${post.id}`,
            targetType: 'post',
            targetId: post.id,
            endpoint: `/api/sites/${site.id}/blog/${post.id}/comments`,
            moderationMode: 'manual',
            count: 0,
          },
        ],
        actions: {
          schemaVersion: 'backy.actions.v1',
          actions,
        },
      },
      seo: {
        title: post.meta?.title || post.title,
        description: post.meta?.description || post.excerpt || '',
        canonical,
        keywords: toStringArray(post.meta?.keywords),
        robots: {
          index: !post.meta?.noIndex,
          follow: !post.meta?.noFollow,
        },
        openGraph: {
          title: post.meta?.title || post.title,
          description: post.meta?.description || post.excerpt || '',
          image: post.meta?.ogImage || undefined,
        },
        jsonLd: [...getSiteJsonLd(site), ...getMetaJsonLd(post.meta)],
      },
      dataBindings: {
        ...dataBindings,
      },
      editableMap,
    },
  };
}
