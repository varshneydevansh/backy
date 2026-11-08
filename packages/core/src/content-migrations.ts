import { normalizeBackyAnimationSequence } from './animation-sequence';
import {
  BACKY_CONTENT_SCHEMA_VERSION,
  createBackyContentDocument,
  synchronizeBackyElementParentScopes,
  isBackyContentDocument,
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
  type BackyElementAnimation,
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

const ELEMENT_ANIMATION_TYPES = new Set([
  'fadeIn',
  'slideIn',
  'scaleIn',
  'bounce',
  'rotate',
  'custom',
]);

const ELEMENT_ANIMATION_TRIGGERS = new Set(['load', 'scroll', 'hover']);
const ELEMENT_ANIMATION_DIRECTIONS = new Set(['left', 'right', 'up', 'down']);

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

const UNSAFE_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const ownEnumerableDataFields = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null;
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.enumerable && 'value' in descriptor && !UNSAFE_JSON_KEYS.has(key)) result[key] = descriptor.value;
  }
  return result;
};

const isPlainJsonObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null || prototype === Object.prototype) return true;
  // Native plain objects from another realm are still JSON objects. Custom
  // class/prototype instances are not; inspect descriptors without getters.
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
  return Object.getPrototypeOf(prototype) === null && typeof constructor === 'function'
    && Object.getOwnPropertyDescriptor(constructor, 'prototype')?.value === prototype
    && Function.prototype.toString.call(constructor) === 'function Object() { [native code] }';
};

/** Copy JSON extensions without executing getters/toJSON or adopting prototypes.
 * Unsupported array entries become null so later JSON entries keep their index.
 * Iterative traversal preserves deep valid JSON without a silent depth cutoff.
 */
const normalizeJsonExtension = (input: unknown): BackyJsonValue | undefined => {
  type Ancestor = { value: object; parent: Ancestor | null };
  type Work = { value: unknown; parent: BackyJsonObject | BackyJsonValue[] | null; key: string | number; ancestors: Ancestor | null };
  const pending: Work[] = [{ value: input, parent: null, key: '', ancestors: null }];
  let result: BackyJsonValue | undefined;
  while (pending.length) {
    const work = pending.pop()!;
    const { value, parent, key, ancestors } = work;
    const assign = (next: BackyJsonValue) => {
      if (parent === null) result = next;
      else if (Array.isArray(parent)) parent[Number(key)] = next;
      else parent[String(key)] = next;
    };
    if (value === null || typeof value === 'string' || typeof value === 'boolean') { assign(value); continue; }
    if (typeof value === 'number') { if (Number.isFinite(value)) assign(value); continue; }
    if (!value || typeof value !== 'object') continue;
    let cyclic = false;
    for (let ancestor = ancestors; ancestor; ancestor = ancestor.parent) if (ancestor.value === value) { cyclic = true; break; }
    if (cyclic) continue;
    const array = Array.isArray(value);
    if (!array && !isPlainJsonObject(value)) continue;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const nextAncestors: Ancestor = { value, parent: ancestors };
    if (array) {
      const output: BackyJsonValue[] = new Array(descriptors.length.value).fill(null);
      assign(output);
      for (let index = output.length - 1; index >= 0; index--) {
        const descriptor = descriptors[String(index)];
        if (descriptor && 'value' in descriptor) pending.push({ value: descriptor.value, parent: output, key: index, ancestors: nextAncestors });
      }
    } else {
      const output: BackyJsonObject = {};
      assign(output);
      for (const [entryKey, descriptor] of Object.entries(descriptors).reverse()) {
        if (descriptor.enumerable && 'value' in descriptor && !UNSAFE_JSON_KEYS.has(entryKey)) pending.push({ value: descriptor.value, parent: output, key: entryKey, ancestors: nextAncestors });
      }
    }
  }
  return result;
};

const rootJsonExtensions = (input: Record<string, unknown>, reserved: Set<string>): BackyJsonObject => {
  const result: BackyJsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (reserved.has(key) || UNSAFE_JSON_KEYS.has(key)) continue;
    const normalized = normalizeJsonExtension(value);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
};

const RESERVED_DOCUMENT_FIELDS = new Set([
  'schemaVersion', 'id', 'kind', 'title', 'slug', 'locale', 'status', 'version', 'elements',
  'themeTokenRefs', 'assets', 'interactions', 'seo', 'dataBindings', 'editableMap', 'metadata',
]);
const RESERVED_CANVAS_PAYLOAD_FIELDS = new Set([
  ...RESERVED_DOCUMENT_FIELDS, 'contentDocument', 'canvasSize', 'customCSS', 'customJS', 'themeSchemaVersion', 'animations',
]);

/** Canonical input keeps declared semantics; only unknown root extensions are cloned. */
const canonicalDocumentWithSafeExtensions = (value: unknown): BackyContentDocument | null => {
  const fields = ownEnumerableDataFields(value);
  if (!fields || fields.schemaVersion !== BACKY_CONTENT_SCHEMA_VERSION || !Array.isArray(fields.elements)) return null;
  const sanitizeElement = (input: unknown, ancestors: Set<object>): BackyContentElement | null => {
    if (!input || typeof input !== 'object' || ancestors.has(input)) return null;
    const elementFields = ownEnumerableDataFields(input);
    if (!elementFields) return null;
    const nextAncestors = new Set([...ancestors, input]);
    const children = Array.isArray(elementFields.children) ? elementFields.children
      .map(child => sanitizeElement(child, nextAncestors)).filter((child): child is BackyContentElement => child !== null) : elementFields.children;
    return {
      ...rootJsonExtensions(elementFields, RESERVED_ELEMENT_FIELDS),
      ...Object.fromEntries(Object.entries(elementFields).filter(([key]) => RESERVED_ELEMENT_FIELDS.has(key))),
      children,
    } as BackyContentElement;
  };
  const document = {
    ...rootJsonExtensions(fields, RESERVED_DOCUMENT_FIELDS),
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => RESERVED_DOCUMENT_FIELDS.has(key))),
    elements: fields.elements.map(element => sanitizeElement(element, new Set())).filter((element): element is BackyContentElement => element !== null),
  } as unknown as BackyContentDocument;
  return isBackyContentDocument(document) ? document : null;
};

const ASSET_ID_FIELDS = new Set([
  'assetId',
  'mediaIds',
  'mediaId',
  'fileIds',
  'fileId',
  'fileMediaIds',
  'fileMediaId',
  'downloadMediaIds',
  'downloadMediaId',
  'imageIds',
  'imageId',
  'videoIds',
  'videoId',
  'audioIds',
  'audioId',
  'fontIds',
  'fontId',
  'documentIds',
  'documentId',
  'iconIds',
  'iconId',
  'fontMediaIds',
  'fontMediaId',
  'fallbackImageMediaIds',
  'fallbackImageMediaId',
  'backgroundMediaIds',
  'backgroundMediaId',
  'posterMediaIds',
  'posterMediaId',
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

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false;
    }
  }

  return undefined;
};

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
  const fields = ownEnumerableDataFields(value);
  if (!fields) {
    return {};
  }

  return Object.entries(fields).reduce<BackyJsonObject>((normalized, [key, rawValue]) => {
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

const normalizeBackyElementAnimation = (value: unknown): BackyElementAnimation | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = toString(value.type);
  if (!type || !ELEMENT_ANIMATION_TYPES.has(type)) {
    return undefined;
  }

  const duration = toNumber(value.duration);
  if (duration === undefined || duration < 0) {
    return undefined;
  }

  const sequence = value.sequence === undefined ? undefined : normalizeBackyAnimationSequence(value.sequence);
  if (value.sequence !== undefined && !sequence) return undefined;
  const delay = toNumber(value.delay);
  const easing = toString(value.easing);
  const direction = toString(value.direction);
  const trigger = toString(value.trigger);
  const from = normalizeBackyJsonObject(value.from);
  const to = normalizeBackyJsonObject(value.to);
  const tokenRefs = normalizeTokenRefs(value.tokenRefs);
  const animation: BackyElementAnimation = {
    type: type as BackyElementAnimation['type'],
    duration,
  };

  if (sequence) animation.sequence = sequence;
  if (delay !== undefined && delay >= 0) animation.delay = delay;
  if (easing) animation.easing = easing;
  if (direction && ELEMENT_ANIMATION_DIRECTIONS.has(direction)) {
    animation.direction = direction as BackyElementAnimation['direction'];
  }
  if (trigger && ELEMENT_ANIMATION_TRIGGERS.has(trigger)) {
    animation.trigger = trigger as BackyElementAnimation['trigger'];
  }
  if (isRecord(value.scrollTrigger)) {
    const scrollStart = toString(value.scrollTrigger.start);
    const scrollEnd = toString(value.scrollTrigger.end);
    const scrub = toBoolean(value.scrollTrigger.scrub);
    const scrollTrigger: NonNullable<BackyElementAnimation['scrollTrigger']> = {};
    if (scrollStart) scrollTrigger.start = scrollStart;
    if (scrollEnd) scrollTrigger.end = scrollEnd;
    if (scrub !== undefined) scrollTrigger.scrub = scrub;
    if (Object.keys(scrollTrigger).length > 0) {
      animation.scrollTrigger = scrollTrigger;
    }
  }
  if (Object.keys(from).length > 0) animation.from = from;
  if (Object.keys(to).length > 0) animation.to = to;
  if (tokenRefs) animation.tokenRefs = tokenRefs;

  return animation;
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
  const tokenRefs = normalizeTokenRefs(value.tokenRefs ?? value.themeTokenRefs);

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
  const pending = [{ value, key }];
  const seen = new Set<object>();
  while (pending.length) {
    const item = pending.pop()!;
    if (item.key && ASSET_ID_FIELDS.has(item.key)) {
      if (isNonEmptyString(item.value)) assetIds.add(item.value.trim());
      else if (Array.isArray(item.value)) {
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(item.value))) {
          if (descriptor.enumerable && 'value' in descriptor && isNonEmptyString(descriptor.value)) assetIds.add(descriptor.value.trim());
        }
      }
      continue;
    }
    if (!item.value || typeof item.value !== 'object' || seen.has(item.value)) continue;
    seen.add(item.value);
    const array = Array.isArray(item.value);
    const entries = Object.entries(Object.getOwnPropertyDescriptors(item.value)).reverse();
    for (const [entryKey, descriptor] of entries) {
      if (descriptor.enumerable && 'value' in descriptor && !UNSAFE_JSON_KEYS.has(entryKey)) pending.push({ value: descriptor.value, key: array ? null : entryKey });
    }
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
  parentId?: string,
): BackyJsonObject | undefined => {
  const metadata = normalizeBackyJsonObject(rawElement.metadata);

  const parentIdValue = parentId
    ? parentId
    : rawElement.parentId !== undefined
      ? normalizeJsonValue(rawElement.parentId)
      : undefined;
  if (parentIdValue !== undefined) {
    metadata.parentId = parentIdValue;
  }

  if (rawElement.animation !== undefined) {
    const animation = normalizeJsonValue(rawElement.animation);
    if (animation !== undefined) {
      metadata.animation = animation;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

interface NormalizeElementContext {
  path: string;
  usedIds: Set<string>;
  parentId?: string;
}

export function normalizeBackyContentElement(
  value: unknown,
  context: Partial<NormalizeElementContext> = {},
): BackyContentElement | null {
  const fields = ownEnumerableDataFields(value);
  if (!fields) {
    return null;
  }
  const extensions = rootJsonExtensions(fields, RESERVED_ELEMENT_FIELDS);
  const rawElement = { ...extensions, ...Object.fromEntries(Object.entries(fields).filter(([key]) => RESERVED_ELEMENT_FIELDS.has(key))) };

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
  const rawMetadata = isRecord(rawElement.metadata) ? rawElement.metadata : {};
  const parentId = context.parentId || toString(rawElement.parentId) || toString(rawMetadata.parentId);

  const element: BackyContentElement = {
    ...extensions,
    id,
    type,
    children: rawChildren
      .map((child, index) => normalizeBackyContentElement(child, {
        path: `${path}_children_${index}`,
        usedIds,
        parentId: id,
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
  const tokenRefs = normalizeTokenRefs(rawElement.tokenRefs ?? rawElement.themeTokenRefs);
  const animation = normalizeBackyElementAnimation(rawElement.animation ?? rawMetadata.animation);
  const actions = normalizeActions(rawElement.actions, id);
  const dataBindings = normalizeDataBindings(rawElement.dataBindings, id);
  const bindingSlots = normalizeBindingSlots(rawElement.bindingSlots, id);
  const accessibility = normalizeAccessibility(rawElement.accessibility, props);
  const assetIds = normalizeAssetIds(rawElement, props);
  const permissions = normalizePermissions(rawElement.permissions);
  const metadata = normalizeElementMetadata(rawElement, parentId);

  if (name) element.name = name;
  if (parentId) element.parentId = parentId;
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
  if (animation) element.animation = animation;
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
  customJS?: string;
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

export interface BackyCanvasContentPayloadDocumentInput {
  id: string;
  kind: BackyContentKind;
  rawContent: unknown;
  fallbackDocument?: BackyContentDocument | null;
  title?: string;
  slug?: string;
  locale?: string;
  status?: BackyContentStatus;
  version?: string | BackyContentVersion;
}

const documentFromCanvasPayload = (
  rawContent: unknown,
  fallbackDocument?: BackyContentDocument | null,
): BackyContentDocument | null => {
  const fields = ownEnumerableDataFields(rawContent);
  const document = canonicalDocumentWithSafeExtensions(fields);
  if (document) {
    return document;
  }

  const embedded = canonicalDocumentWithSafeExtensions(fields?.contentDocument);
  if (embedded) {
    return embedded;
  }

  return fallbackDocument || null;
};

const payloadString = (
  value: unknown,
  fallback: string | undefined,
): string | undefined => (
  typeof value === 'string' ? value : fallback
);

const hasPayloadKey = (
  value: Record<string, unknown>,
  key: string,
): boolean => Object.prototype.hasOwnProperty.call(value, key);

const payloadJsonObject = <TValue>(
  source: Record<string, unknown>,
  key: string,
  fallback: TValue | undefined,
): TValue | undefined => {
  if (!hasPayloadKey(source, key)) {
    return fallback;
  }

  return normalizeBackyJsonObject(source[key]) as TValue;
};

const payloadStringRecord = (
  source: Record<string, unknown>,
  key: string,
  fallback: Record<string, string> | undefined,
): Record<string, string> | undefined => {
  if (!hasPayloadKey(source, key)) {
    return fallback;
  }

  return normalizeStringRecord(source[key]) || {};
};

const firstNonEmptyJsonObject = <TValue>(
  ...candidates: Array<unknown>
): TValue | undefined => {
  for (const candidate of candidates) {
    const normalized = normalizeBackyJsonObject(candidate);
    if (Object.keys(normalized).length > 0) {
      return normalized as TValue;
    }
  }

  return undefined;
};

const mergeDocumentMetadata = (
  primary?: BackyContentDocument | null,
  fallback?: BackyContentDocument | null,
): BackyContentDocument['metadata'] | undefined => {
  const merged = {
    ...normalizeBackyJsonObject(fallback?.metadata),
    ...normalizeBackyJsonObject(primary?.metadata),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const isEditorGroupElement = (element: BackyContentElement): boolean => (
  element.props?.editorGroup === true
);

const hasNonEmptyArray = (value: unknown): boolean => (
  Array.isArray(value) && value.length > 0
);

const hasNonEmptyRecord = (value: unknown): boolean => (
  isRecord(value) && Object.keys(value).length > 0
);

const isInteractiveBackyElement = (element: BackyContentElement): boolean => (
  element.type === 'interactiveFigure' ||
  element.type === 'codeComponent' ||
  isNonEmptyString(element.componentKey) ||
  hasNonEmptyArray(element.controls) ||
  Boolean(element.renderCapabilities)
);

const ACTION_PROP_KEYS = [
  'href',
  'url',
  'action',
  'actionUrl',
  'formId',
  'successRedirectUrl',
  'redirectUrl',
] as const;

const hasBackyElementActionWiring = (element: BackyContentElement): boolean => (
  hasNonEmptyArray(element.actions) ||
  ACTION_PROP_KEYS.some((key) => isNonEmptyString(element.props?.[key]))
);

export function buildBackyEditorCompositionSummary(
  elements: BackyContentElement[],
): BackyJsonObject {
  const typeCounts: Record<string, number> = {};
  const groupIds: string[] = [];
  const nestedElementIds: string[] = [];
  const containerIds: string[] = [];
  const animatedElementIds: string[] = [];
  const actionElementIds: string[] = [];
  const dataBoundElementIds: string[] = [];
  const tokenRefElementIds: string[] = [];
  const assetBoundElementIds: string[] = [];
  const interactiveElementIds: string[] = [];
  const metrics = {
    totalLayers: 0,
    rootLayers: elements.length,
    groupLayers: 0,
    nestedLayers: 0,
    childContainerLayers: 0,
    responsiveOverrideLayers: 0,
    animatedLayers: 0,
    actionLayers: 0,
    dataBoundLayers: 0,
    tokenRefLayers: 0,
    assetBoundLayers: 0,
    interactiveLayers: 0,
    hiddenLayers: 0,
    lockedLayers: 0,
    maxDepth: 0,
  };

  const walk = (items: BackyContentElement[], depth: number) => {
    metrics.maxDepth = Math.max(metrics.maxDepth, depth);
    items.forEach((item) => {
      const type = item.type || 'unknown';
      metrics.totalLayers += 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      if (depth > 0) {
        metrics.nestedLayers += 1;
        nestedElementIds.push(item.id);
      }
      if (isEditorGroupElement(item)) {
        metrics.groupLayers += 1;
        groupIds.push(item.id);
      }
      if (item.children.length > 0) {
        metrics.childContainerLayers += 1;
        containerIds.push(item.id);
      }
      if (item.responsive && Object.keys(item.responsive).length > 0) {
        metrics.responsiveOverrideLayers += 1;
      }
      if (item.animation && Object.keys(item.animation).length > 0) {
        metrics.animatedLayers += 1;
        animatedElementIds.push(item.id);
      }
      if (hasBackyElementActionWiring(item)) {
        metrics.actionLayers += 1;
        actionElementIds.push(item.id);
      }
      if (hasNonEmptyArray(item.dataBindings) || hasNonEmptyArray(item.bindingSlots)) {
        metrics.dataBoundLayers += 1;
        dataBoundElementIds.push(item.id);
      }
      if (hasNonEmptyRecord(item.tokenRefs) || hasNonEmptyRecord(item.animation?.tokenRefs)) {
        metrics.tokenRefLayers += 1;
        tokenRefElementIds.push(item.id);
      }
      if (hasNonEmptyArray(item.assetIds)) {
        metrics.assetBoundLayers += 1;
        assetBoundElementIds.push(item.id);
      }
      if (isInteractiveBackyElement(item)) {
        metrics.interactiveLayers += 1;
        interactiveElementIds.push(item.id);
      }
      if (toBoolean(item.visible) === false) {
        metrics.hiddenLayers += 1;
      }
      if (toBoolean(item.locked) === true) {
        metrics.lockedLayers += 1;
      }

      if (item.children.length > 0) {
        walk(item.children, depth + 1);
      }
    });
  };

  walk(elements, 0);

  const topTypes = Object.entries(typeCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }));

  return {
    schemaVersion: 'backy.editor-composition-summary.v1',
    ready: metrics.totalLayers > 0,
    hasGroups: metrics.groupLayers > 0,
    hasNestedLayers: metrics.nestedLayers > 0,
    hasAnimations: metrics.animatedLayers > 0,
    hasActions: metrics.actionLayers > 0,
    hasDataBindings: metrics.dataBoundLayers > 0,
    hasTokenRefs: metrics.tokenRefLayers > 0,
    hasAssetRefs: metrics.assetBoundLayers > 0,
    hasInteractiveComponents: metrics.interactiveLayers > 0,
    metrics: {
      ...metrics,
      topTypes,
    },
    groupIds,
    nestedElementIds,
    containerIds,
    animatedElementIds,
    actionElementIds,
    dataBoundElementIds,
    tokenRefElementIds,
    assetBoundElementIds,
    interactiveElementIds,
    shortcuts: {
      group: 'Cmd/Ctrl+G',
      ungroup: 'Shift+Cmd/Ctrl+G',
      selectSiblings: 'Cmd/Ctrl+A',
      selectChildren: 'Shift+Cmd/Ctrl+A',
      selectChild: 'Enter',
      selectParent: 'Shift+Enter',
    },
    invariants: {
      sameParentRequired: true,
      lockedLayersBlocked: true,
      editorGroupMarker: 'props.editorGroup',
      childrenPersistedInline: true,
      parentIdsStoredAsElementMetadata: true,
      responsiveBreakpoints: ['tablet', 'mobile'],
    },
  };
}

export function canvasContentPayloadToBackyContentDocument(
  input: BackyCanvasContentPayloadDocumentInput,
): BackyContentDocument {
  const canonical = canonicalDocumentWithSafeExtensions(input.rawContent);
  if (canonical) {
    return { ...canonical, elements: synchronizeBackyElementParentScopes(canonical.elements, { completeTree: true }) };
  }

  const rawRecord = ownEnumerableDataFields(input.rawContent) || {};
  const payloadDocument = canonicalDocumentWithSafeExtensions(rawRecord.contentDocument);
  const fallbackDocument = input.fallbackDocument || null;
  const existingDocument = documentFromCanvasPayload(input.rawContent, fallbackDocument);
  const rawElements = Array.isArray(input.rawContent)
    ? input.rawContent
    : Array.isArray(rawRecord.elements)
      ? rawRecord.elements
      : existingDocument?.elements || [];
  const metadata = payloadJsonObject<NonNullable<BackyContentDocument['metadata']>>(
    rawRecord,
    'metadata',
    mergeDocumentMetadata(existingDocument, payloadDocument ? fallbackDocument : null),
  ) || {};
  if (hasPayloadKey(rawRecord, 'animations')) {
    const animations = normalizeJsonValue(rawRecord.animations);
    if (Array.isArray(animations)) {
      metadata.animations = animations;
    }
  }
  const themeSchemaVersion = typeof rawRecord.themeSchemaVersion === 'string'
    ? rawRecord.themeSchemaVersion as BackyThemeSchemaVersion
    : typeof existingDocument?.metadata?.themeSchemaVersion === 'string'
      ? existingDocument.metadata.themeSchemaVersion as BackyThemeSchemaVersion
      : typeof fallbackDocument?.metadata?.themeSchemaVersion === 'string'
        ? fallbackDocument.metadata.themeSchemaVersion as BackyThemeSchemaVersion
      : undefined;

  const document = canvasElementsToBackyContentDocument({
    id: input.id,
    kind: input.kind,
    title: input.title,
    slug: input.slug,
    locale: input.locale || existingDocument?.locale,
    status: input.status,
    version: input.version || existingDocument?.version,
    elements: rawElements,
    canvasSize: rawRecord.canvasSize ?? existingDocument?.metadata?.canvasSize,
    customCSS: payloadString(
      rawRecord.customCSS,
      (existingDocument?.metadata?.customCSS as string | undefined)
        || (fallbackDocument?.metadata?.customCSS as string | undefined),
    ),
    customJS: payloadString(
      rawRecord.customJS,
      (existingDocument?.metadata?.customJS as string | undefined)
        || (fallbackDocument?.metadata?.customJS as string | undefined),
    ),
    themeTokenRefs: payloadStringRecord(
      rawRecord,
      'themeTokenRefs',
      normalizeStringRecord(existingDocument?.themeTokenRefs)
        || normalizeStringRecord(fallbackDocument?.themeTokenRefs),
    ),
    assets: payloadJsonObject<BackyContentDocument['assets']>(
      rawRecord,
      'assets',
      firstNonEmptyJsonObject<BackyContentDocument['assets']>(
        existingDocument?.assets,
        fallbackDocument?.assets,
      ),
    ),
    interactions: payloadJsonObject<BackyContentDocument['interactions']>(
      rawRecord,
      'interactions',
      firstNonEmptyJsonObject<BackyContentDocument['interactions']>(
        existingDocument?.interactions,
        fallbackDocument?.interactions,
      ),
    ),
    seo: payloadJsonObject<BackyContentDocument['seo']>(
      rawRecord,
      'seo',
      firstNonEmptyJsonObject<BackyContentDocument['seo']>(
        existingDocument?.seo,
        fallbackDocument?.seo,
      ),
    ),
    dataBindings: payloadJsonObject<BackyContentDocument['dataBindings']>(
      rawRecord,
      'dataBindings',
      firstNonEmptyJsonObject<BackyContentDocument['dataBindings']>(
        existingDocument?.dataBindings,
        fallbackDocument?.dataBindings,
      ),
    ),
    editableMap: payloadJsonObject<BackyContentDocument['editableMap']>(
      rawRecord,
      'editableMap',
      firstNonEmptyJsonObject<BackyContentDocument['editableMap']>(
        existingDocument?.editableMap,
        fallbackDocument?.editableMap,
      ),
    ),
    metadata,
    themeSchemaVersion,
  });
  return {
    ...rootJsonExtensions(ownEnumerableDataFields(fallbackDocument) || {}, RESERVED_DOCUMENT_FIELDS),
    ...rootJsonExtensions(ownEnumerableDataFields(existingDocument) || {}, RESERVED_DOCUMENT_FIELDS),
    ...rootJsonExtensions(rawRecord, RESERVED_CANVAS_PAYLOAD_FIELDS),
    ...document,
  };
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
  if (input.customCSS !== undefined) {
    metadata.customCSS = input.customCSS;
  }
  if (input.customJS !== undefined) {
    metadata.customJS = input.customJS;
  }
  if (input.themeSchemaVersion) {
    metadata.themeSchemaVersion = input.themeSchemaVersion;
  }
  const normalizedElements = synchronizeBackyElementParentScopes(normalizeBackyContentElements(input.elements), { completeTree: true });
  metadata.editorComposition = buildBackyEditorCompositionSummary(normalizedElements);

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
    elements: normalizedElements,
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
