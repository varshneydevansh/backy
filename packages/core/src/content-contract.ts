/**
 * Canonical Backy content contract.
 *
 * This is the shared document model for editor-authored pages, blog posts,
 * reusable templates, and dynamic collection-backed routes. Public APIs,
 * generated frontends, SDKs, renderers, and future persistence adapters should
 * converge on this shape instead of redefining canvas content locally.
 */

export const BACKY_CONTENT_SCHEMA_VERSION = 'backy.content.v1' as const;
export const BACKY_THEME_SCHEMA_VERSION = 'backy.theme.v1' as const;
export const BACKY_ACTIONS_SCHEMA_VERSION = 'backy.actions.v1' as const;

export type BackyContentSchemaVersion = typeof BACKY_CONTENT_SCHEMA_VERSION;
export type BackyThemeSchemaVersion = typeof BACKY_THEME_SCHEMA_VERSION;
export type BackyActionsSchemaVersion = typeof BACKY_ACTIONS_SCHEMA_VERSION;

export type BackyContentKind = 'page' | 'post' | 'template' | 'dynamicItem' | 'dynamicList';
export type BackyContentStatus = 'draft' | 'published' | 'scheduled' | 'archived';
export type BackyBreakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide' | (string & {});
export type BackyJsonPrimitive = string | number | boolean | null;
export type BackyJsonValue = BackyJsonPrimitive | BackyJsonObject | BackyJsonValue[];
export interface BackyJsonObject {
  [key: string]: BackyJsonValue;
}

export type BackyElementActionType =
  | 'link'
  | 'route'
  | 'submitForm'
  | 'openModal'
  | 'closeModal'
  | 'toggle'
  | 'playMedia'
  | 'pauseMedia'
  | 'download'
  | 'customEvent';

export type BackyDataBindingMode =
  | 'text'
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'url'
  | 'boolean'
  | 'number'
  | 'json';

export type BackyDataBindingSourceKind =
  | 'collection'
  | 'page'
  | 'post'
  | 'site'
  | 'route'
  | 'query'
  | 'auth'
  | 'static';

export interface BackyElementLayout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  rotation?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface BackyResponsiveElementOverride extends BackyElementLayout {
  props?: Record<string, BackyJsonValue>;
  styles?: Record<string, BackyJsonValue>;
  tokenRefs?: Record<string, string>;
}

export interface BackyElementAction {
  id: string;
  type: BackyElementActionType;
  label?: string;
  target?: string;
  href?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  formId?: string;
  mediaId?: string;
  openIn?: 'self' | 'new-tab' | 'modal' | 'download';
  requiresAuth?: boolean;
  analyticsEvent?: string;
  payload?: Record<string, BackyJsonValue>;
  conditions?: Record<string, BackyJsonValue>[];
}

export interface BackyDataBindingSource {
  kind: BackyDataBindingSourceKind;
  collectionId?: string;
  field?: string;
  recordId?: string;
  path?: string;
}

export interface BackyDataBinding {
  id: string;
  elementId: string;
  targetPath: string;
  source: BackyDataBindingSource;
  mode: BackyDataBindingMode;
  fallback?: BackyJsonValue;
  format?: Record<string, BackyJsonValue>;
  writeBack?: {
    enabled: boolean;
    permission?: string;
    endpoint?: string;
  };
}

export type BackyComponentBindingSourceKind =
  | BackyDataBindingSourceKind
  | 'blog'
  | 'taxonomy'
  | 'commerce'
  | (string & {});

export interface BackyComponentBindingSlot {
  id: string;
  label: string;
  sourceKind?: BackyComponentBindingSourceKind;
  fieldKey?: string;
  targetPath: string;
  mode?: BackyDataBindingMode | (string & {});
  required?: boolean;
  description?: string;
}

export interface BackyElementAccessibility {
  label?: string;
  alt?: string;
  role?: string;
  aria?: Record<string, string | number | boolean>;
}

export type BackyInteractiveElementType = 'interactiveFigure' | 'codeComponent';
export type BackyInteractiveHydrationMode = 'trusted-component' | 'sandbox-iframe' | 'static-fallback';

export interface BackyInteractiveControl {
  key: string;
  label?: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'color' | 'range' | 'json' | string;
  value?: BackyJsonValue;
  defaultValue?: BackyJsonValue;
  options?: BackyJsonValue[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}

export interface BackyInteractiveFallback {
  title?: string;
  text?: string;
  html?: string;
  imageUrl?: string;
  alt?: string;
  ariaLabel?: string;
}

export interface BackyInteractiveRenderCapabilities {
  hydrationMode: BackyInteractiveHydrationMode | string;
  requiresSandbox?: boolean;
  requiresSignedBundle?: boolean;
  fallbackRequired?: boolean;
  allowedPermissions?: string[];
  allowedConnectSrc?: string[];
  postMessageProtocol?: string;
}

export interface BackyContentElement extends BackyElementLayout {
  id: string;
  type: string;
  name?: string;
  children: BackyContentElement[];
  props: Record<string, BackyJsonValue>;
  componentKey?: string;
  version?: string;
  controls?: BackyInteractiveControl[];
  fallback?: BackyInteractiveFallback;
  renderCapabilities?: BackyInteractiveRenderCapabilities;
  styles?: Record<string, BackyJsonValue>;
  responsive?: Partial<Record<BackyBreakpoint, BackyResponsiveElementOverride>>;
  tokenRefs?: Record<string, string>;
  actions?: BackyElementAction[];
  dataBindings?: BackyDataBinding[];
  bindingSlots?: BackyComponentBindingSlot[];
  accessibility?: BackyElementAccessibility;
  assetIds?: string[];
  permissions?: Record<string, boolean>;
  metadata?: Record<string, BackyJsonValue>;
}

export interface BackyThemeTokens {
  schemaVersion: BackyThemeSchemaVersion;
  colors?: Record<string, string>;
  typography?: {
    families?: Record<string, string>;
    scale?: Record<string, string>;
    lineHeights?: Record<string, string | number>;
    weights?: Record<string, string | number>;
  };
  spacing?: Record<string, string>;
  radii?: Record<string, string>;
  shadows?: Record<string, string>;
  motion?: {
    duration?: Record<string, string>;
    easing?: Record<string, string>;
  };
  breakpoints?: Record<BackyBreakpoint, number>;
  customCss?: string;
}

export interface BackyContentAssetRef {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'font' | 'icon' | 'file' | (string & {});
  url?: string;
  alt?: string;
  title?: string;
  caption?: string;
  visibility?: 'public' | 'private' | 'unlisted' | (string & {});
  metadata?: Record<string, BackyJsonValue>;
}

export interface BackyInteractionManifest {
  forms?: BackyJsonObject[];
  comments?: BackyJsonObject[];
  actions?: {
    schemaVersion: BackyActionsSchemaVersion;
    actions: BackyElementAction[];
  };
  search?: BackyJsonObject[];
  filters?: BackyJsonObject[];
}

export interface BackySeoManifest {
  title?: string;
  description?: string;
  canonical?: string;
  keywords?: string[];
  robots?: {
    index?: boolean;
    follow?: boolean;
  };
  openGraph?: Record<string, BackyJsonValue>;
  twitter?: Record<string, BackyJsonValue>;
  jsonLd?: BackyJsonObject[];
}

export interface BackyEditableMapEntry {
  elementId: string;
  field: string;
  token?: string;
  editable: boolean;
  permission?: string;
  label?: string;
  valueType: 'string' | 'richText' | 'number' | 'boolean' | 'color' | 'image' | 'video' | 'audio' | 'file' | 'url' | 'json';
  scope?: 'site' | 'page' | 'post' | 'template' | 'element' | 'collectionRecord';
  collectionId?: string;
  recordId?: string;
  sourceField?: string;
}

export interface BackyContentVersion {
  id?: string;
  number?: number;
  parentId?: string;
  createdAt?: string;
  createdBy?: string;
  publishedAt?: string;
  source?: 'editor' | 'api' | 'migration' | 'import' | (string & {});
}

export interface BackyContentDocument {
  schemaVersion: BackyContentSchemaVersion;
  id: string;
  kind: BackyContentKind;
  title?: string;
  slug?: string;
  locale?: string;
  status?: BackyContentStatus;
  version: string | BackyContentVersion;
  elements: BackyContentElement[];
  themeTokenRefs?: Record<string, string>;
  assets?: {
    media?: BackyContentAssetRef[];
    fonts?: BackyContentAssetRef[];
  };
  interactions?: BackyInteractionManifest;
  seo?: BackySeoManifest;
  dataBindings?: {
    datasets?: BackyJsonObject[];
    bindings?: BackyDataBinding[];
  };
  editableMap: Record<string, BackyEditableMapEntry>;
  metadata?: Record<string, BackyJsonValue>;
}

export interface BackyElementIndex {
  byId: Record<string, BackyContentElement>;
  order: string[];
}

export interface BackyContentValidationIssue {
  path: string;
  message: string;
}

export interface BackyContentValidationResult {
  valid: boolean;
  issues: BackyContentValidationIssue[];
}

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const validateElement = (
  element: BackyContentElement,
  path: string,
  seenIds: Set<string>,
  issues: BackyContentValidationIssue[],
) => {
  if (!element.id) {
    issues.push({ path, message: 'Element id is required.' });
  } else if (seenIds.has(element.id)) {
    issues.push({ path: `${path}.id`, message: `Duplicate element id "${element.id}".` });
  } else {
    seenIds.add(element.id);
  }

  if (!element.type) {
    issues.push({ path: `${path}.type`, message: 'Element type is required.' });
  }

  if (!Array.isArray(element.children)) {
    issues.push({ path: `${path}.children`, message: 'Element children must be an array.' });
    return;
  }

  element.children.forEach((child, index) => {
    validateElement(child, `${path}.children[${index}]`, seenIds, issues);
  });
};

export function buildBackyElementIndex(elements: BackyContentElement[]): BackyElementIndex {
  const byId: Record<string, BackyContentElement> = {};
  const order: string[] = [];

  const walk = (items: BackyContentElement[]) => {
    items.forEach((element) => {
      byId[element.id] = element;
      order.push(element.id);
      walk(element.children);
    });
  };

  walk(elements);
  return { byId, order };
}

export function findBackyElementById(
  elements: BackyContentElement[],
  elementId: string,
): BackyContentElement | null {
  return buildBackyElementIndex(elements).byId[elementId] || null;
}

export function validateBackyContentDocument(document: BackyContentDocument): BackyContentValidationResult {
  const issues: BackyContentValidationIssue[] = [];

  if (document.schemaVersion !== BACKY_CONTENT_SCHEMA_VERSION) {
    issues.push({ path: 'schemaVersion', message: `Expected ${BACKY_CONTENT_SCHEMA_VERSION}.` });
  }

  if (!document.id) {
    issues.push({ path: 'id', message: 'Document id is required.' });
  }

  if (!document.kind) {
    issues.push({ path: 'kind', message: 'Document kind is required.' });
  }

  if (!Array.isArray(document.elements)) {
    issues.push({ path: 'elements', message: 'Document elements must be an array.' });
  } else {
    const seenIds = new Set<string>();
    document.elements.forEach((element, index) => {
      validateElement(element, `elements[${index}]`, seenIds, issues);
    });
  }

  if (!isObject(document.editableMap)) {
    issues.push({ path: 'editableMap', message: 'Editable map is required.' });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function isBackyContentDocument(value: unknown): value is BackyContentDocument {
  if (!isObject(value)) {
    return false;
  }

  return validateBackyContentDocument(value as unknown as BackyContentDocument).valid;
}

export function createBackyContentDocument(
  input: Omit<BackyContentDocument, 'schemaVersion' | 'editableMap' | 'version'> & {
    schemaVersion?: BackyContentSchemaVersion;
    editableMap?: Record<string, BackyEditableMapEntry>;
    version?: string | BackyContentVersion;
  },
): BackyContentDocument {
  return {
    ...input,
    schemaVersion: input.schemaVersion || BACKY_CONTENT_SCHEMA_VERSION,
    version: input.version || 'draft',
    editableMap: input.editableMap || {},
  };
}
