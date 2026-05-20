import {
  BACKY_CONTENT_SCHEMA_VERSION,
  createBackyContentDocument,
  validateBackyContentDocument,
  type BackyBreakpoint,
  type BackyComponentBindingSlot,
  type BackyContentAssetRef,
  type BackyContentDocument,
  type BackyContentElement,
  type BackyContentKind,
  type BackyContentStatus,
  type BackyContentVersion,
  type BackyDataBinding,
  type BackyDataBindingMode,
  type BackyDataBindingSourceKind,
  type BackyEditableMapEntry,
  type BackyElementAccessibility,
  type BackyElementAction,
  type BackyElementActionType,
  type BackyInteractiveControl,
  type BackyInteractiveFallback,
  type BackyInteractiveRenderCapabilities,
  type BackyInteractionManifest,
  type BackyJsonObject,
  type BackyJsonValue,
  type BackyResponsiveElementOverride,
  type BackySeoManifest,
  type BackyThemeSchemaVersion,
} from './content-contract';

const ACTION_TYPES = new Set<BackyElementActionType>([
  'link',
  'route',
  'submitForm',
  'openModal',
  'closeModal',
  'toggle',
  'playMedia',
  'pauseMedia',
  'download',
  'customEvent',
]);

const BINDING_MODES = new Set<BackyDataBindingMode>([
  'text',
  'html',
  'image',
  'video',
  'audio',
  'url',
  'boolean',
  'number',
  'json',
]);

const BINDING_SOURCE_KINDS = new Set<BackyDataBindingSourceKind>([
  'collection',
  'page',
  'post',
  'site',
  'route',
  'query',
  'auth',
  'static',
]);

const BINDING_SLOT_SOURCE_KINDS = new Set<string>([
  ...Array.from(BINDING_SOURCE_KINDS),
  'blog',
  'taxonomy',
  'commerce',
]);

const RESERVED_ELEMENT_FIELDS = new Set([
  'id',
  'type',
  'name',
  'x',
  'y',
  'width',
  'height',
  'zIndex',
  'rotation',
  'visible',
  'locked',
  'props',
  'componentKey',
  'version',
  'controls',
  'fallback',
  'renderCapabilities',
  'styles',
  'children',
  'parentId',
  'responsive',
  'tokenRefs',
  'actions',
  'dataBindings',
  'bindingSlots',
  'accessibility',
  'assetIds',
  'permissions',
  'metadata',
  'animation',
]);

const ASSET_ID_FIELDS = new Set([
  'assetId',
  'mediaId',
  'fileId',
  'imageId',
  'videoId',
  'audioId',
  'fontId',
  'documentId',
  'iconId',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toBoolean = (value: unknown): boolean | undefined => (
  typeof value === 'boolean' ? value : undefined
);

const toString = (value: unknown): string | undefined => (
  isNonEmptyString(value) ? value.trim() : undefined
);

const inferBindingMode = (targetPath: string, sourceField?: string): BackyDataBindingMode => {
  const lowerTarget = targetPath.toLowerCase();
  const lowerField = (sourceField || '').toLowerCase();

  if (lowerTarget.includes('assetid') || lowerTarget.includes('mediaid') || lowerTarget.includes('src')) {
    return 'image';
  }
  if (lowerTarget.includes('href') || lowerTarget.includes('url') || lowerField.includes('url')) {
    return 'url';
  }
  return 'text';
};

const uniqueId = (baseId: string, usedIds: Set<string>) => {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let index = 2;
  let nextId = `${baseId}_${index}`;
  while (usedIds.has(nextId)) {
    index += 1;
    nextId = `${baseId}_${index}`;
  }
  usedIds.add(nextId);
  return nextId;
};

const normalizeJsonValue = (value: unknown): BackyJsonValue | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value
      .map(normalizeJsonValue)
      .filter((item): item is BackyJsonValue => item !== undefined);
  }
  if (isRecord(value)) {
    return normalizeBackyJsonObject(value);
  }
  return undefined;
};

export function normalizeBackyJsonObject(value: unknown): BackyJsonObject {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<BackyJsonObject>((normalized, [key, rawValue]) => {
    const nextValue = normalizeJsonValue(rawValue);
    if (nextValue !== undefined) {
      normalized[key] = nextValue;
    }
    return normalized;
  }, {});
}

const normalizeStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = Object.entries(value).reduce<Record<string, string>>((result, [key, rawValue]) => {
    if (typeof rawValue === 'string') {
      result[key] = rawValue;
    } else if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      result[key] = String(rawValue);
    }
    return result;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeTokenRefs = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = Object.entries(value).reduce<Record<string, string>>((result, [key, rawValue]) => {
    if (isNonEmptyString(rawValue)) {
      result[key] = rawValue.trim();
    }
    return result;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizePermissions = (value: unknown): Record<string, boolean> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = Object.entries(value).reduce<Record<string, boolean>>((result, [key, rawValue]) => {
    if (typeof rawValue === 'boolean') {
      result[key] = rawValue;
    }
    return result;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeResponsiveOverride = (value: unknown): BackyResponsiveElementOverride | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const override: BackyResponsiveElementOverride = {};
  const x = toNumber(value.x);
  const y = toNumber(value.y);
  const width = toNumber(value.width);
  const height = toNumber(value.height);
  const zIndex = toNumber(value.zIndex);
  const rotation = toNumber(value.rotation);
  const visible = toBoolean(value.visible);
  const locked = toBoolean(value.locked);
  const tokenRefs = normalizeTokenRefs(value.tokenRefs);

  if (x !== undefined) override.x = x;
  if (y !== undefined) override.y = y;
  if (width !== undefined) override.width = width;
  if (height !== undefined) override.height = height;
  if (zIndex !== undefined) override.zIndex = zIndex;
  if (rotation !== undefined) override.rotation = rotation;
  if (visible !== undefined) override.visible = visible;
  if (locked !== undefined) override.locked = locked;
  if (tokenRefs) override.tokenRefs = tokenRefs;

  const props = normalizeBackyJsonObject(value.props);
  if (Object.keys(props).length > 0) {
    override.props = props;
  }

  const styles = normalizeBackyJsonObject(value.styles);
  if (Object.keys(styles).length > 0) {
    override.styles = styles;
  }

  return Object.keys(override).length > 0 ? override : undefined;
};

const normalizeResponsive = (value: unknown): Partial<Record<BackyBreakpoint, BackyResponsiveElementOverride>> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized = Object.entries(value).reduce<Partial<Record<BackyBreakpoint, BackyResponsiveElementOverride>>>(
    (result, [breakpoint, rawOverride]) => {
      const override = normalizeResponsiveOverride(rawOverride);
      if (override) {
        result[breakpoint as BackyBreakpoint] = override;
      }
      return result;
    },
    {},
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeAction = (
  value: unknown,
  elementId: string,
  index: number,
): BackyElementAction | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rawType = toString(value.type);
  const inferredType = toString(value.href) ? 'link' : undefined;
  const type = rawType && ACTION_TYPES.has(rawType as BackyElementActionType)
    ? rawType as BackyElementActionType
    : inferredType;

  if (!type) {
    return null;
  }

  const action: BackyElementAction = {
    id: toString(value.id) || `action_${elementId}_${index}`,
    type,
  };

  const label = toString(value.label);
  const target = toString(value.target);
  const href = toString(value.href);
  const formId = toString(value.formId);
  const mediaId = toString(value.mediaId);
  const openIn = toString(value.openIn);
  const analyticsEvent = toString(value.analyticsEvent);
  const requiresAuth = toBoolean(value.requiresAuth);

  if (label) action.label = label;
  if (target) action.target = target;
  if (href) action.href = href;
  if (formId) action.formId = formId;
  if (mediaId) action.mediaId = mediaId;
  if (analyticsEvent) action.analyticsEvent = analyticsEvent;
  if (requiresAuth !== undefined) action.requiresAuth = requiresAuth;
  if (openIn === 'self' || openIn === 'new-tab' || openIn === 'modal' || openIn === 'download') {
    action.openIn = openIn;
  }
  if (
    value.method === 'GET'
    || value.method === 'POST'
    || value.method === 'PUT'
    || value.method === 'PATCH'
    || value.method === 'DELETE'
  ) {
    action.method = value.method;
  }

  const payload = normalizeBackyJsonObject(value.payload);
  if (Object.keys(payload).length > 0) {
    action.payload = payload;
  }

  if (Array.isArray(value.conditions)) {
    const conditions = value.conditions
      .map(normalizeBackyJsonObject)
      .filter((condition) => Object.keys(condition).length > 0);
    if (conditions.length > 0) {
      action.conditions = conditions;
    }
  }

  return action;
};

const normalizeActions = (
  value: unknown,
  elementId: string,
): BackyElementAction[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = value
    .map((rawAction, index) => normalizeAction(rawAction, elementId, index))
    .filter((action): action is BackyElementAction => action !== null);

  return actions.length > 0 ? actions : undefined;
};

const normalizeBinding = (
  value: unknown,
  elementId: string,
  index: number,
): BackyDataBinding | null => {
  if (!isRecord(value)) {
    return null;
  }

  const source = isRecord(value.source) ? value.source : {};
  const targetPath = toString(value.targetPath) || toString(value.field) || 'props.content';
  const sourceField = toString(source.field) || toString(value.sourceField) || toString(value.collectionField) || toString(value.field);
  const collectionId = toString(source.collectionId) || toString(value.collectionId);
  const rawKind = toString(source.kind) || (collectionId ? 'collection' : 'static');
  const kind = BINDING_SOURCE_KINDS.has(rawKind as BackyDataBindingSourceKind)
    ? rawKind as BackyDataBindingSourceKind
    : 'static';
  const rawMode = toString(value.mode);
  const mode = rawMode && BINDING_MODES.has(rawMode as BackyDataBindingMode)
    ? rawMode as BackyDataBindingMode
    : inferBindingMode(targetPath, sourceField);
  const binding: BackyDataBinding = {
    id: toString(value.id) || `binding_${elementId}_${index}`,
    elementId: toString(value.elementId) || elementId,
    targetPath,
    source: {
      kind,
    },
    mode,
  };

  if (collectionId) binding.source.collectionId = collectionId;
  if (sourceField) binding.source.field = sourceField;

  const recordId = toString(source.recordId) || toString(value.recordId);
  const path = toString(source.path) || toString(value.path);
  if (recordId) binding.source.recordId = recordId;
  if (path) binding.source.path = path;

  const fallback = normalizeJsonValue(value.fallback);
  if (fallback !== undefined) {
    binding.fallback = fallback;
  }

  const format = normalizeBackyJsonObject(value.format);
  if (Object.keys(format).length > 0) {
    binding.format = format;
  }

  if (isRecord(value.writeBack)) {
    const enabled = toBoolean(value.writeBack.enabled);
    if (enabled !== undefined) {
      binding.writeBack = {
        enabled,
      };
      const permission = toString(value.writeBack.permission);
      const endpoint = toString(value.writeBack.endpoint);
      if (permission) binding.writeBack.permission = permission;
      if (endpoint) binding.writeBack.endpoint = endpoint;
    }
  }

  return binding;
};

const normalizeDataBindings = (
  value: unknown,
  elementId: string,
): BackyDataBinding[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const bindings = value
    .map((rawBinding, index) => normalizeBinding(rawBinding, elementId, index))
    .filter((binding): binding is BackyDataBinding => binding !== null);

  return bindings.length > 0 ? bindings : undefined;
};

const normalizeBindingSlots = (
  value: unknown,
  elementId: string,
): BackyComponentBindingSlot[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const slots = value
    .filter((slot): slot is Record<string, unknown> => isRecord(slot))
    .map((slot, index): BackyComponentBindingSlot | null => {
      const targetPath = toString(slot.targetPath);
      if (!targetPath) {
        return null;
      }

      const fieldKey = toString(slot.fieldKey);
      const rawMode = toString(slot.mode);
      const rawSourceKind = toString(slot.sourceKind);
      const required = toBoolean(slot.required);
      const bindingSlot: BackyComponentBindingSlot = {
        id: toString(slot.id) || `binding_slot_${elementId}_${index}`,
        label: toString(slot.label) || fieldKey || targetPath,
        targetPath,
      };

      if (rawSourceKind && BINDING_SLOT_SOURCE_KINDS.has(rawSourceKind)) {
        bindingSlot.sourceKind = rawSourceKind;
      }
      if (fieldKey) {
        bindingSlot.fieldKey = fieldKey;
      }
      if (rawMode && BINDING_MODES.has(rawMode as BackyDataBindingMode)) {
        bindingSlot.mode = rawMode as BackyDataBindingMode;
      }
      if (required !== undefined) {
        bindingSlot.required = required;
      }
      const description = toString(slot.description);
      if (description) {
        bindingSlot.description = description;
      }

      return bindingSlot;
    })
    .filter((slot): slot is BackyComponentBindingSlot => slot !== null);

  return slots.length > 0 ? slots : undefined;
};

const normalizeAccessibility = (
  value: unknown,
  props: BackyJsonObject,
): BackyElementAccessibility | undefined => {
  const source = isRecord(value) ? value : {};
  const accessibility: BackyElementAccessibility = {};
  const label = toString(source.label) || toString(props.ariaLabel) || toString(props.label);
  const alt = toString(source.alt) || toString(props.alt);
  const role = toString(source.role) || toString(props.role);
  const aria = normalizeStringRecord(source.aria);

  if (label) accessibility.label = label;
  if (alt) accessibility.alt = alt;
  if (role) accessibility.role = role;
  if (aria) accessibility.aria = aria;

  return Object.keys(accessibility).length > 0 ? accessibility : undefined;
};

const normalizeInteractiveControls = (value: unknown): BackyInteractiveControl[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const controls = value
    .filter(isRecord)
    .map((control, index): BackyInteractiveControl | null => {
      const key = toString(control.key) || toString(control.id) || `control_${index}`;
      const type = toString(control.type) || 'text';
      const next: BackyInteractiveControl = { key, type };
      const label = toString(control.label);
      const value = normalizeJsonValue(control.value);
      const defaultValue = normalizeJsonValue(control.defaultValue);
      const min = toNumber(control.min);
      const max = toNumber(control.max);
      const step = toNumber(control.step);
      const required = toBoolean(control.required);
      if (label) next.label = label;
      if (value !== undefined) next.value = value;
      if (defaultValue !== undefined) next.defaultValue = defaultValue;
      if (Array.isArray(control.options)) {
        next.options = control.options
          .map(normalizeJsonValue)
          .filter((item): item is BackyJsonValue => item !== undefined);
      }
      if (min !== undefined) next.min = min;
      if (max !== undefined) next.max = max;
      if (step !== undefined) next.step = step;
      if (required !== undefined) next.required = required;
      return next;
    })
    .filter((control): control is BackyInteractiveControl => control !== null);
  return controls.length > 0 ? controls : undefined;
};

const normalizeInteractiveFallback = (value: unknown): BackyInteractiveFallback | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return { text: value.trim() };
  }
  if (!isRecord(value)) return undefined;
  const fallback: BackyInteractiveFallback = {};
  const title = toString(value.title);
  const text = toString(value.text) || toString(value.content);
  const html = toString(value.html);
  const imageUrl = toString(value.imageUrl) || toString(value.image);
  const alt = toString(value.alt);
  const ariaLabel = toString(value.ariaLabel) || toString(value.label);
  if (title) fallback.title = title;
  if (text) fallback.text = text;
  if (html) fallback.html = html;
  if (imageUrl) fallback.imageUrl = imageUrl;
  if (alt) fallback.alt = alt;
  if (ariaLabel) fallback.ariaLabel = ariaLabel;
  return Object.keys(fallback).length > 0 ? fallback : undefined;
};

const normalizeRenderCapabilities = (value: unknown): BackyInteractiveRenderCapabilities | undefined => {
  if (!isRecord(value)) return undefined;
  const hydrationMode = toString(value.hydrationMode) || toString(value.mode) || 'static-fallback';
  const capabilities: BackyInteractiveRenderCapabilities = { hydrationMode };
  const requiresSandbox = toBoolean(value.requiresSandbox);
  const requiresSignedBundle = toBoolean(value.requiresSignedBundle);
  const fallbackRequired = toBoolean(value.fallbackRequired);
  const postMessageProtocol = toString(value.postMessageProtocol);
  if (requiresSandbox !== undefined) capabilities.requiresSandbox = requiresSandbox;
  if (requiresSignedBundle !== undefined) capabilities.requiresSignedBundle = requiresSignedBundle;
  if (fallbackRequired !== undefined) capabilities.fallbackRequired = fallbackRequired;
  if (Array.isArray(value.allowedPermissions)) capabilities.allowedPermissions = value.allowedPermissions.filter(isNonEmptyString);
  if (Array.isArray(value.allowedConnectSrc)) capabilities.allowedConnectSrc = value.allowedConnectSrc.filter(isNonEmptyString);
  if (postMessageProtocol) capabilities.postMessageProtocol = postMessageProtocol;
  return capabilities;
};

const collectAssetIdsFromValue = (value: unknown, key: string | null, assetIds: Set<string>) => {
  if (key && ASSET_ID_FIELDS.has(key) && isNonEmptyString(value)) {
    assetIds.add(value.trim());
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetIdsFromValue(item, null, assetIds));
    return;
  }

  if (isRecord(value)) {
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      collectAssetIdsFromValue(entryValue, entryKey, assetIds);
    });
  }
};

const normalizeAssetIds = (rawElement: Record<string, unknown>, props: BackyJsonObject): string[] | undefined => {
  const assetIds = new Set<string>();

  if (Array.isArray(rawElement.assetIds)) {
    rawElement.assetIds.forEach((assetId) => {
      if (isNonEmptyString(assetId)) {
        assetIds.add(assetId.trim());
      }
    });
  }

  collectAssetIdsFromValue(rawElement, null, assetIds);
  collectAssetIdsFromValue(props, null, assetIds);

  return assetIds.size > 0 ? [...assetIds] : undefined;
};

const normalizeElementMetadata = (
  rawElement: Record<string, unknown>,
): BackyJsonObject | undefined => {
  const metadata = normalizeBackyJsonObject(rawElement.metadata);

  if (rawElement.parentId !== undefined) {
    const parentId = normalizeJsonValue(rawElement.parentId);
    if (parentId !== undefined) {
      metadata.parentId = parentId;
    }
  }

  if (rawElement.animation !== undefined) {
    const animation = normalizeJsonValue(rawElement.animation);
    if (animation !== undefined) {
      metadata.animation = animation;
    }
  }

  const extra = Object.entries(rawElement).reduce<BackyJsonObject>((result, [key, value]) => {
    if (!RESERVED_ELEMENT_FIELDS.has(key)) {
      const normalized = normalizeJsonValue(value);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    }
    return result;
  }, {});

  if (Object.keys(extra).length > 0) {
    metadata.legacy = extra;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

interface NormalizeElementContext {
  path: string;
  usedIds: Set<string>;
}

export function normalizeBackyContentElement(
  rawElement: unknown,
  context: Partial<NormalizeElementContext> = {},
): BackyContentElement | null {
  if (!isRecord(rawElement)) {
    return null;
  }

  const type = toString(rawElement.type);
  if (!type) {
    return null;
  }

  const path = context.path || 'element';
  const usedIds = context.usedIds || new Set<string>();
  const baseId = toString(rawElement.id) || `migrated_${path.replace(/[^a-zA-Z0-9_]+/g, '_')}`;
  const id = uniqueId(baseId, usedIds);
  const rawProps = isRecord(rawElement.props) ? rawElement.props : {};
  const props = normalizeBackyJsonObject(rawElement.props);
  const styles = normalizeBackyJsonObject(rawElement.styles);
  const rawChildren = Array.isArray(rawElement.children) ? rawElement.children : [];

  const element: BackyContentElement = {
    id,
    type,
    children: rawChildren
      .map((child, index) => normalizeBackyContentElement(child, {
        path: `${path}_children_${index}`,
        usedIds,
      }))
      .filter((child): child is BackyContentElement => child !== null),
    props,
  };

  const name = toString(rawElement.name);
  const componentKey = toString(rawElement.componentKey) || toString(rawProps.componentKey);
  const version = toString(rawElement.version) || toString(rawProps.version);
  const controls = normalizeInteractiveControls(rawElement.controls ?? rawProps.controls);
  const fallback = normalizeInteractiveFallback(rawElement.fallback ?? rawProps.fallback);
  const renderCapabilities = normalizeRenderCapabilities(rawElement.renderCapabilities ?? rawProps.renderCapabilities);
  const x = toNumber(rawElement.x);
  const y = toNumber(rawElement.y);
  const width = toNumber(rawElement.width);
  const height = toNumber(rawElement.height);
  const zIndex = toNumber(rawElement.zIndex);
  const rotation = toNumber(rawElement.rotation);
  const visible = toBoolean(rawElement.visible);
  const locked = toBoolean(rawElement.locked);
  const responsive = normalizeResponsive(rawElement.responsive);
  const tokenRefs = normalizeTokenRefs(rawElement.tokenRefs);
  const actions = normalizeActions(rawElement.actions, id);
  const dataBindings = normalizeDataBindings(rawElement.dataBindings, id);
  const bindingSlots = normalizeBindingSlots(rawElement.bindingSlots, id);
  const accessibility = normalizeAccessibility(rawElement.accessibility, props);
  const assetIds = normalizeAssetIds(rawElement, props);
  const permissions = normalizePermissions(rawElement.permissions);
  const metadata = normalizeElementMetadata(rawElement);

  if (name) element.name = name;
  if (componentKey) element.componentKey = componentKey;
  if (version) element.version = version;
  if (controls) element.controls = controls;
  if (fallback) element.fallback = fallback;
  if (renderCapabilities) element.renderCapabilities = renderCapabilities;
  if (x !== undefined) element.x = x;
  if (y !== undefined) element.y = y;
  if (width !== undefined) element.width = width;
  if (height !== undefined) element.height = height;
  if (zIndex !== undefined) element.zIndex = zIndex;
  if (rotation !== undefined) element.rotation = rotation;
  if (visible !== undefined) element.visible = visible;
  if (locked !== undefined) element.locked = locked;
  if (Object.keys(styles).length > 0) element.styles = styles;
  if (responsive) element.responsive = responsive;
  if (tokenRefs) element.tokenRefs = tokenRefs;
  if (actions) element.actions = actions;
  if (dataBindings) element.dataBindings = dataBindings;
  if (bindingSlots) element.bindingSlots = bindingSlots;
  if (accessibility) element.accessibility = accessibility;
  if (assetIds) element.assetIds = assetIds;
  if (permissions) element.permissions = permissions;
  if (metadata) element.metadata = metadata;

  return element;
}

export function normalizeBackyContentElements(rawElements: unknown): BackyContentElement[] {
  const sourceElements = Array.isArray(rawElements)
    ? rawElements
    : isRecord(rawElements) && Array.isArray(rawElements.elements)
      ? rawElements.elements
      : [];
  const usedIds = new Set<string>();

  return sourceElements
    .map((rawElement, index) => normalizeBackyContentElement(rawElement, {
      path: `elements_${index}`,
      usedIds,
    }))
    .filter((element): element is BackyContentElement => element !== null);
}

export interface BackyCanvasContentDocumentInput {
  id: string;
  kind: BackyContentKind;
  elements: unknown;
  title?: string;
  slug?: string;
  locale?: string;
  status?: BackyContentStatus;
  version?: string | BackyContentVersion;
  canvasSize?: unknown;
  customCSS?: string;
  themeTokenRefs?: Record<string, string>;
  assets?: {
    media?: BackyContentAssetRef[];
    fonts?: BackyContentAssetRef[];
  };
  interactions?: BackyInteractionManifest;
  seo?: BackySeoManifest;
  dataBindings?: BackyContentDocument['dataBindings'];
  editableMap?: Record<string, BackyEditableMapEntry>;
  metadata?: Record<string, BackyJsonValue>;
  themeSchemaVersion?: BackyThemeSchemaVersion;
}

export function canvasElementsToBackyContentDocument(
  input: BackyCanvasContentDocumentInput,
): BackyContentDocument {
  const metadata: BackyJsonObject = {
    ...(input.metadata || {}),
    migratedFrom: 'backy.canvas.elements',
    schemaVersion: BACKY_CONTENT_SCHEMA_VERSION,
  };
  const canvasSize = normalizeBackyJsonObject(input.canvasSize);
  if (Object.keys(canvasSize).length > 0) {
    metadata.canvasSize = canvasSize;
  }
  if (input.customCSS) {
    metadata.customCSS = input.customCSS;
  }
  if (input.themeSchemaVersion) {
    metadata.themeSchemaVersion = input.themeSchemaVersion;
  }

  const document = createBackyContentDocument({
    id: input.id,
    kind: input.kind,
    title: input.title,
    slug: input.slug,
    locale: input.locale,
    status: input.status,
    version: input.version || {
      source: 'migration',
    },
    elements: normalizeBackyContentElements(input.elements),
    themeTokenRefs: input.themeTokenRefs,
    assets: input.assets,
    interactions: input.interactions,
    seo: input.seo,
    dataBindings: input.dataBindings,
    editableMap: input.editableMap,
    metadata,
  });
  const validation = validateBackyContentDocument(document);

  if (!validation.valid) {
    const issueSummary = validation.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new Error(`Migrated Backy content document is invalid: ${issueSummary}`);
  }

  return document;
}
