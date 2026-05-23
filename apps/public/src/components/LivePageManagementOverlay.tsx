'use client';

import { useEffect, useMemo, useState } from 'react';

type ManagedPageStatus = 'draft' | 'published' | 'scheduled' | 'archived';
type LiveManagedResourceType = 'page' | 'post';

interface ManagedPage {
  id: string;
  resourceType: LiveManagedResourceType;
  title?: string;
  slug?: string;
  status?: ManagedPageStatus;
  isHomepage?: boolean;
  updatedAt?: string;
  content?: Record<string, unknown>;
}

interface ManagedElementTarget {
  id: string;
  type: string;
  label: string;
  source: 'rendered' | 'content';
  visible: boolean;
}

interface LivePageManagementOverlayProps {
  enabled: boolean;
  siteId?: string;
  pageId?: string;
  postId?: string;
  resourceType?: LiveManagedResourceType;
  adminAppUrl?: string;
}

const STATUS_OPTIONS: ManagedPageStatus[] = ['draft', 'published', 'scheduled', 'archived'];
const INLINE_TEXT_ELEMENT_TYPES = new Set(['text', 'heading', 'paragraph', 'quote', 'button', 'link']);
const INLINE_LINK_ELEMENT_TYPES = new Set(['button', 'link']);
const INLINE_IMAGE_ELEMENT_TYPES = new Set(['image']);
const INLINE_MEDIA_ELEMENT_TYPES = new Set(['video', 'embed', 'map']);
const INLINE_FORM_ELEMENT_TYPES = new Set(['form', 'input', 'textarea', 'select', 'checkbox', 'radio']);
const IMAGE_OBJECT_FIT_OPTIONS = ['cover', 'contain', 'fill', 'none', 'scale-down'] as const;
const IFRAME_LOADING_OPTIONS = ['', 'lazy', 'eager'] as const;
const FORM_INPUT_TYPE_OPTIONS = ['', 'text', 'email', 'tel', 'url', 'number', 'date', 'datetime-local', 'time', 'month', 'search', 'password'] as const;
const BORDER_STYLE_OPTIONS = ['', 'solid', 'dashed', 'dotted', 'double', 'none'] as const;
const TEXT_ALIGN_OPTIONS = ['', 'left', 'center', 'right', 'justify'] as const;
const TEXT_TRANSFORM_OPTIONS = ['', 'none', 'uppercase', 'lowercase', 'capitalize'] as const;
const TEXT_DECORATION_OPTIONS = ['', 'none', 'underline', 'line-through', 'overline'] as const;
const ANIMATION_TYPE_OPTIONS = ['', 'fadeIn', 'slideIn', 'scaleIn', 'bounce', 'rotate', 'custom'] as const;
const ANIMATION_TRIGGER_OPTIONS = ['', 'load', 'scroll', 'hover'] as const;
const ANIMATION_DIRECTION_OPTIONS = ['', 'left', 'right', 'up', 'down'] as const;
type ImageObjectFit = typeof IMAGE_OBJECT_FIT_OPTIONS[number];
type IframeLoadingOption = typeof IFRAME_LOADING_OPTIONS[number];
type FormInputTypeOption = typeof FORM_INPUT_TYPE_OPTIONS[number];
type BorderStyleOption = typeof BORDER_STYLE_OPTIONS[number];
type TextAlignOption = typeof TEXT_ALIGN_OPTIONS[number];
type TextTransformOption = typeof TEXT_TRANSFORM_OPTIONS[number];
type TextDecorationOption = typeof TEXT_DECORATION_OPTIONS[number];
type AnimationTypeOption = typeof ANIMATION_TYPE_OPTIONS[number];
type AnimationTriggerOption = typeof ANIMATION_TRIGGER_OPTIONS[number];
type AnimationDirectionOption = typeof ANIMATION_DIRECTION_OPTIONS[number];
type InlineMediaFields = {
  src: string;
  mediaId: string;
  poster: string;
  posterMediaId: string;
  title: string;
  address: string;
  markerLabel: string;
  zoom: string;
  allowedHosts: string;
  loading: IframeLoadingOption;
  controls: boolean;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  playsInline: boolean;
  allowFullScreen: boolean;
};
type InlineFormFields = {
  formId: string;
  formTitle: string;
  submitLabel: string;
  action: string;
  successMessage: string;
  formActive: boolean;
  label: string;
  name: string;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  value: string;
  options: string;
  inputType: FormInputTypeOption;
  rows: string;
  required: boolean;
  disabled: boolean;
};
type InlineAppearanceFields = {
  color: string;
  backgroundColor: string;
  borderColor: string;
  borderStyle: BorderStyleOption;
  borderWidth: string;
  borderRadius: string;
  padding: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: TextAlignOption;
  textTransform: TextTransformOption;
  textDecoration: TextDecorationOption;
  letterSpacing: string;
  margin: string;
  boxShadow: string;
  opacity: string;
};
type InlineLayoutFields = {
  name: string;
  x: string;
  y: string;
  width: string;
  height: string;
  zIndex: string;
  rotation: string;
  visible: boolean;
  locked: boolean;
};
type InlineAnimationFields = {
  type: AnimationTypeOption;
  trigger: AnimationTriggerOption;
  direction: AnimationDirectionOption;
  duration: string;
  delay: string;
  easing: string;
  scrollStart: string;
  scrollEnd: string;
  scrollScrub: boolean;
  from: string;
  to: string;
  durationToken: string;
  easingToken: string;
};
type InlineActionsBindingsFields = {
  actions: string;
  dataBindings: string;
  bindingSlots: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const managedPageFromResponse = (payload: unknown): ManagedPage | null => {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const resourceType: LiveManagedResourceType = isRecord(payload.data.post) ? 'post' : 'page';
  const resource = resourceType === 'post' ? payload.data.post : payload.data.page;
  if (!isRecord(resource)) {
    return null;
  }

  const status = resource.status;

  return {
    id: typeof resource.id === 'string' ? resource.id : '',
    resourceType,
    title: typeof resource.title === 'string' ? resource.title : '',
    slug: typeof resource.slug === 'string' ? resource.slug : '',
    status: STATUS_OPTIONS.includes(status as ManagedPageStatus) ? status as ManagedPageStatus : 'draft',
    isHomepage: resource.isHomepage === true,
    updatedAt: typeof resource.updatedAt === 'string' ? resource.updatedAt : '',
    content: isRecord(resource.content) ? { ...resource.content } : undefined,
  };
};

const errorMessageFromResponse = (payload: unknown, fallback: string) => {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }

  return fallback;
};

const joinedAdminUrl = (adminAppUrl: string | undefined, path: string) => {
  const base = (adminAppUrl || '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
};

const elementLabel = (element: HTMLElement): string => {
  const id = element.dataset.backyElementId || element.dataset.elementId || '';
  const type = element.dataset.backyElementType || element.dataset.elementType || 'element';
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
  const textPreview = text.length > 0 ? ` - ${text.slice(0, 32)}${text.length > 32 ? '...' : ''}` : '';
  return `${type}${textPreview || ` - ${id.slice(0, 10)}`}`;
};

const contentElementLabel = (element: Record<string, unknown>): string => {
  const id = typeof element.id === 'string' ? element.id : '';
  const type = typeof element.type === 'string' ? element.type : 'element';
  if (typeof element.name === 'string' && element.name.trim().length > 0) {
    return element.name.trim();
  }
  const props = isRecord(element.props) ? element.props : {};
  const value = props.content ?? props.label ?? props.text ?? props.alt ?? props.title ?? props.src;
  const text = stripMarkup(slatePlainText(value)).replace(/\s+/g, ' ').trim();
  const textPreview = text.length > 0 ? ` - ${text.slice(0, 32)}${text.length > 32 ? '...' : ''}` : '';
  return `${type}${textPreview || ` - ${id.slice(0, 10)}`}`;
};

const contentElementTargets = (content: Record<string, unknown> | undefined): ManagedElementTarget[] => {
  const roots = [
    ...(Array.isArray(content?.elements) ? content?.elements || [] : []),
    ...(isRecord(content?.contentDocument) && Array.isArray(content.contentDocument.elements)
      ? content.contentDocument.elements
      : []),
  ];
  const seen = new Set<string>();
  const targets: ManagedElementTarget[] = [];

  const visit = (items: unknown[]) => {
    items.forEach((item) => {
      if (!isRecord(item)) return;
      if (typeof item.id === 'string' && !seen.has(item.id)) {
        seen.add(item.id);
        targets.push({
          id: item.id,
          type: typeof item.type === 'string' ? item.type : 'element',
          label: contentElementLabel(item),
          source: 'content',
          visible: booleanValue(item.visible, true),
        });
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  };

  visit(roots);
  return targets;
};

const findRenderedElement = (elementId: string): HTMLElement | null => (
  Array.from(document.querySelectorAll<HTMLElement>('[data-backy-element-id], [data-element-id]'))
    .find((element) => (element.dataset.backyElementId || element.dataset.elementId || '') === elementId) || null
);

const slatePlainText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(slatePlainText).join('\n').trim();
  }

  if (!isRecord(value)) {
    return '';
  }

  if (typeof value.text === 'string') {
    return value.text;
  }

  return Array.isArray(value.children) ? value.children.map(slatePlainText).join('') : '';
};

const stripMarkup = (value: string): string => (
  value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
);

const elementFromContent = (content: Record<string, unknown> | undefined, elementId: string): Record<string, unknown> | null => {
  const roots = [
    ...(Array.isArray(content?.elements) ? content?.elements || [] : []),
    ...(isRecord(content?.contentDocument) && Array.isArray(content.contentDocument.elements)
      ? content.contentDocument.elements
      : []),
  ];

  const visit = (items: unknown[]): Record<string, unknown> | null => {
    for (const item of items) {
      if (!isRecord(item)) continue;
      if (item.id === elementId) return item;
      if (Array.isArray(item.children)) {
        const found = visit(item.children);
        if (found) return found;
      }
    }

    return null;
  };

  return visit(roots);
};

const inlineTextFromElement = (element: Record<string, unknown> | null): string => {
  if (!element || !INLINE_TEXT_ELEMENT_TYPES.has(String(element.type || ''))) {
    return '';
  }

  const props = isRecord(element.props) ? element.props : {};
  const value = props.content ?? props.label ?? props.text;
  return stripMarkup(slatePlainText(value));
};

const elementProps = (element: Record<string, unknown> | null): Record<string, unknown> => (
  isRecord(element?.props) ? element.props : {}
);

const inlineHrefFromElement = (element: Record<string, unknown> | null): string => {
  const props = elementProps(element);
  return typeof props.href === 'string' ? props.href : '';
};

const inlineDownloadFromElement = (element: Record<string, unknown> | null): boolean => {
  const props = elementProps(element);
  return booleanProp(props, 'download');
};

const inlineDownloadMediaIdFromElement = (element: Record<string, unknown> | null): string => {
  const props = elementProps(element);
  return stringProp(props, 'fileMediaId')
    || stringProp(props, 'fileId')
    || stringProp(props, 'downloadMediaId')
    || firstStringFromListProp(props, 'fileIds')
    || firstStringFromListProp(props, 'fileMediaIds')
    || firstStringFromListProp(props, 'downloadMediaIds')
    || mediaIdFromUrl(inlineHrefFromElement(element));
};

const inlineTargetBlankFromElement = (element: Record<string, unknown> | null): boolean => {
  const props = elementProps(element);
  return props.target === '_blank';
};

const stringProp = (props: Record<string, unknown>, key: string): string => (
  typeof props[key] === 'string' ? props[key] : ''
);

const firstStringFromListProp = (props: Record<string, unknown>, key: string): string => {
  const value = props[key];
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === 'string' && item.trim().length > 0)?.trim() || '';
  }
  return typeof value === 'string' ? value.trim() : '';
};

const mediaIdFromUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/api\/(?:admin\/)?sites\/[^/?#]+\/media\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
};

const publicMediaFileUrl = (siteId: string | undefined, mediaId: string, disposition?: 'attachment'): string => {
  const trimmedSiteId = siteId?.trim();
  const trimmedMediaId = mediaId.trim();
  return trimmedSiteId && trimmedMediaId
    ? `/api/sites/${encodeURIComponent(trimmedSiteId)}/media/${encodeURIComponent(trimmedMediaId)}/file${disposition ? '?disposition=attachment' : ''}`
    : '';
};

const emptyDownloadFileMetadata = () => ({
  fileMediaName: '',
  fileMediaType: '',
  fileMediaVisibility: '',
  fileName: '',
  fileSignedUrlRequired: false,
  fileSignedUrlEndpoint: '',
});

const downloadFileMetadataFromElement = (
  element: Record<string, unknown> | null,
  mediaId: string,
) => {
  const props = elementProps(element);
  const existingMediaId = inlineDownloadMediaIdFromElement(element);
  if (!mediaId || existingMediaId !== mediaId) {
    return emptyDownloadFileMetadata();
  }

  const fileMediaVisibility = stringProp(props, 'fileMediaVisibility');
  return {
    fileMediaName: stringProp(props, 'fileMediaName'),
    fileMediaType: stringProp(props, 'fileMediaType'),
    fileMediaVisibility,
    fileName: stringProp(props, 'fileName'),
    fileSignedUrlRequired: booleanProp(props, 'fileSignedUrlRequired') || fileMediaVisibility === 'private',
    fileSignedUrlEndpoint: stringProp(props, 'fileSignedUrlEndpoint'),
  };
};

const mediaAssetIds = (...values: string[]): string[] => (
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
);

const mediaIdsFromProps = (props: Record<string, unknown>, keys: string[]): string[] => (
  mediaAssetIds(...keys.flatMap((key) => {
    const value = props[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
  }))
);

const removeUndefined = (patch: Record<string, unknown>): Record<string, unknown> => (
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
);

const lengthProp = (props: Record<string, unknown>, key: string): string => {
  const value = props[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }
  return typeof value === 'string' ? value : '';
};

const numberField = (element: Record<string, unknown> | null, key: string): string => {
  const value = element?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }
  return typeof value === 'string' ? value : '';
};

const hexColorInputValue = (value: string): string => (
  /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#000000'
);

const imageFieldsFromElement = (element: Record<string, unknown> | null) => {
  const props = elementProps(element);
  const objectFit = stringProp(props, 'objectFit');
  const src = stringProp(props, 'src');
  return {
    src,
    mediaId: stringProp(props, 'mediaId') || firstStringFromListProp(props, 'mediaIds') || mediaIdFromUrl(src),
    alt: stringProp(props, 'alt'),
    title: stringProp(props, 'title'),
    objectFit: IMAGE_OBJECT_FIT_OPTIONS.includes(objectFit as ImageObjectFit)
      ? objectFit as ImageObjectFit
      : 'cover' as ImageObjectFit,
  };
};

const stringOrListProp = (props: Record<string, unknown>, key: string): string => {
  const value = props[key];
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0).join(', ');
  }
  return typeof value === 'string' ? value : '';
};

const booleanValue = (value: unknown, fallback = false): boolean => {
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

  return fallback;
};

const booleanProp = (props: Record<string, unknown>, key: string, fallback = false): boolean => (
  booleanValue(props[key], fallback)
);

const mediaFieldsFromElement = (element: Record<string, unknown> | null): InlineMediaFields => {
  const props = elementProps(element);
  const loading = stringProp(props, 'loading');
  const src = stringProp(props, 'src') || stringProp(props, 'url');
  const poster = stringProp(props, 'poster');
  return {
    src,
    mediaId: stringProp(props, 'mediaId') || firstStringFromListProp(props, 'mediaIds') || mediaIdFromUrl(src),
    poster,
    posterMediaId: stringProp(props, 'posterMediaId') || firstStringFromListProp(props, 'posterMediaIds') || mediaIdFromUrl(poster),
    title: stringProp(props, 'title'),
    address: stringProp(props, 'address'),
    markerLabel: stringProp(props, 'markerLabel'),
    zoom: lengthProp(props, 'zoom'),
    allowedHosts: stringOrListProp(props, 'allowedHosts') || stringOrListProp(props, 'embedAllowedHosts'),
    loading: IFRAME_LOADING_OPTIONS.includes(loading as IframeLoadingOption)
      ? loading as IframeLoadingOption
      : '',
    controls: booleanProp(props, 'controls', true),
    autoplay: booleanProp(props, 'autoplay', booleanProp(props, 'autoPlay')),
    loop: booleanProp(props, 'loop'),
    muted: booleanProp(props, 'muted'),
    playsInline: booleanProp(props, 'playsInline'),
    allowFullScreen: booleanProp(props, 'allowFullScreen', true),
  };
};

const listProp = (props: Record<string, unknown>, key: string): string => {
  const value = props[key];
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0).join('\n');
  }
  return typeof value === 'string' ? value : '';
};

const formFieldsFromElement = (element: Record<string, unknown> | null): InlineFormFields => {
  const props = elementProps(element);
  const inputType = stringProp(props, 'inputType') || stringProp(props, 'type');
  return {
    formId: stringProp(props, 'formId'),
    formTitle: stringProp(props, 'formTitle'),
    submitLabel: stringProp(props, 'submitLabel'),
    action: stringProp(props, 'action') || stringProp(props, 'actionUrl'),
    successMessage: stringProp(props, 'successMessage'),
    formActive: props.formActive !== false && stringProp(props, 'formActive').toLowerCase() !== 'false',
    label: stringProp(props, 'label'),
    name: stringProp(props, 'name'),
    placeholder: stringProp(props, 'placeholder'),
    helpText: stringProp(props, 'helpText'),
    defaultValue: stringOrListProp(props, 'defaultValue'),
    value: stringProp(props, 'value'),
    options: listProp(props, 'options'),
    inputType: FORM_INPUT_TYPE_OPTIONS.includes(inputType as FormInputTypeOption)
      ? inputType as FormInputTypeOption
      : 'text',
    rows: lengthProp(props, 'rows'),
    required: booleanProp(props, 'required'),
    disabled: booleanProp(props, 'disabled'),
  };
};

const appearanceFieldsFromElement = (element: Record<string, unknown> | null): InlineAppearanceFields => {
  const props = elementProps(element);
  const borderStyle = stringProp(props, 'borderStyle');
  const textAlign = stringProp(props, 'textAlign');
  const textTransform = stringProp(props, 'textTransform');
  const textDecoration = stringProp(props, 'textDecoration');
  return {
    color: stringProp(props, 'color'),
    backgroundColor: stringProp(props, 'backgroundColor'),
    borderColor: stringProp(props, 'borderColor'),
    borderStyle: BORDER_STYLE_OPTIONS.includes(borderStyle as BorderStyleOption)
      ? borderStyle as BorderStyleOption
      : '',
    borderWidth: lengthProp(props, 'borderWidth'),
    borderRadius: lengthProp(props, 'borderRadius'),
    padding: lengthProp(props, 'padding'),
    fontSize: lengthProp(props, 'fontSize'),
    fontFamily: stringProp(props, 'fontFamily'),
    fontWeight: stringProp(props, 'fontWeight'),
    lineHeight: lengthProp(props, 'lineHeight'),
    textAlign: TEXT_ALIGN_OPTIONS.includes(textAlign as TextAlignOption)
      ? textAlign as TextAlignOption
      : '',
    textTransform: TEXT_TRANSFORM_OPTIONS.includes(textTransform as TextTransformOption)
      ? textTransform as TextTransformOption
      : '',
    textDecoration: TEXT_DECORATION_OPTIONS.includes(textDecoration as TextDecorationOption)
      ? textDecoration as TextDecorationOption
      : '',
    letterSpacing: lengthProp(props, 'letterSpacing'),
    margin: lengthProp(props, 'margin'),
    boxShadow: stringProp(props, 'boxShadow'),
    opacity: lengthProp(props, 'opacity'),
  };
};

const layoutFieldsFromElement = (element: Record<string, unknown> | null): InlineLayoutFields => ({
  name: typeof element?.name === 'string' ? element.name : '',
  x: numberField(element, 'x'),
  y: numberField(element, 'y'),
  width: numberField(element, 'width'),
  height: numberField(element, 'height'),
  zIndex: numberField(element, 'zIndex'),
  rotation: numberField(element, 'rotation'),
  visible: booleanValue(element?.visible, true),
  locked: booleanValue(element?.locked),
});

const animationRecordFromElement = (element: Record<string, unknown> | null): Record<string, unknown> => (
  isRecord(element?.animation) ? element.animation : {}
);

const animationJsonField = (value: unknown): string => {
  if (!isRecord(value)) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const jsonArrayFieldFromElement = (element: Record<string, unknown> | null, key: string): string => {
  const value = element?.[key];
  if (!Array.isArray(value)) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const animationFieldsFromElement = (element: Record<string, unknown> | null): InlineAnimationFields => {
  const animation = animationRecordFromElement(element);
  const type = typeof animation.type === 'string' && ANIMATION_TYPE_OPTIONS.includes(animation.type as AnimationTypeOption)
    ? animation.type as AnimationTypeOption
    : '';
  const trigger = typeof animation.trigger === 'string' && ANIMATION_TRIGGER_OPTIONS.includes(animation.trigger as AnimationTriggerOption)
    ? animation.trigger as AnimationTriggerOption
    : '';
  const direction = typeof animation.direction === 'string' && ANIMATION_DIRECTION_OPTIONS.includes(animation.direction as AnimationDirectionOption)
    ? animation.direction as AnimationDirectionOption
    : '';
  const scrollTrigger = isRecord(animation.scrollTrigger) ? animation.scrollTrigger : {};
  const tokenRefs = isRecord(animation.tokenRefs) ? animation.tokenRefs : {};

  return {
    type,
    trigger,
    direction,
    duration: typeof animation.duration === 'number' && Number.isFinite(animation.duration) ? `${animation.duration}` : '',
    delay: typeof animation.delay === 'number' && Number.isFinite(animation.delay) ? `${animation.delay}` : '',
    easing: typeof animation.easing === 'string' ? animation.easing : '',
    scrollStart: typeof scrollTrigger.start === 'string' ? scrollTrigger.start : '',
    scrollEnd: typeof scrollTrigger.end === 'string' ? scrollTrigger.end : '',
    scrollScrub: scrollTrigger.scrub === true,
    from: animationJsonField(animation.from),
    to: animationJsonField(animation.to),
    durationToken: typeof tokenRefs.duration === 'string' ? tokenRefs.duration : '',
    easingToken: typeof tokenRefs.easing === 'string' ? tokenRefs.easing : '',
  };
};

const actionsBindingsFieldsFromElement = (element: Record<string, unknown> | null): InlineActionsBindingsFields => ({
  actions: jsonArrayFieldFromElement(element, 'actions'),
  dataBindings: jsonArrayFieldFromElement(element, 'dataBindings'),
  bindingSlots: jsonArrayFieldFromElement(element, 'bindingSlots'),
});

const updateElementProps = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> | null => {
  if (!content) {
    return null;
  }

  const nextContent = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  let changed = false;

  const visit = (items: unknown[]) => {
    items.forEach((item) => {
      if (!isRecord(item)) return;
      if (item.id === elementId) {
        item.props = {
          ...(isRecord(item.props) ? item.props : {}),
          ...patch,
        };
        changed = true;
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  };

  if (Array.isArray(nextContent.elements)) {
    visit(nextContent.elements);
  }
  if (isRecord(nextContent.contentDocument) && Array.isArray(nextContent.contentDocument.elements)) {
    visit(nextContent.contentDocument.elements);
  }

  return changed ? nextContent : null;
};

const updateElementPropsWithAssetIds = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  patch: Record<string, unknown>,
  assetIds: string[],
  stalePropKeys: string[],
): Record<string, unknown> | null => {
  if (!content) {
    return null;
  }

  const nextContent = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  let changed = false;
  const mergedAssetIds = mediaAssetIds(...assetIds);

  const visit = (items: unknown[]) => {
    items.forEach((item) => {
      if (!isRecord(item)) return;
      if (item.id === elementId) {
        const oldProps = isRecord(item.props) ? item.props : {};
        const staleMediaIds = new Set(mediaIdsFromProps(oldProps, stalePropKeys));
        item.props = {
          ...oldProps,
          ...removeUndefined(patch),
        };
        const existingAssetIds = Array.isArray(item.assetIds)
          ? item.assetIds.filter((assetId) => typeof assetId === 'string' && assetId.trim().length > 0 && !staleMediaIds.has(assetId.trim()))
          : [];
        item.assetIds = mediaAssetIds(...existingAssetIds, ...mergedAssetIds);
        changed = true;
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  };

  if (Array.isArray(nextContent.elements)) {
    visit(nextContent.elements);
  }
  if (isRecord(nextContent.contentDocument) && Array.isArray(nextContent.contentDocument.elements)) {
    visit(nextContent.contentDocument.elements);
  }

  return changed ? nextContent : null;
};

const updateElementFields = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> | null => {
  if (!content) {
    return null;
  }

  const nextContent = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  let changed = false;

  const visit = (items: unknown[]) => {
    items.forEach((item) => {
      if (!isRecord(item)) return;
      if (item.id === elementId) {
        Object.entries(patch).forEach(([key, value]) => {
          item[key] = value;
        });
        changed = true;
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  };

  if (Array.isArray(nextContent.elements)) {
    visit(nextContent.elements);
  }
  if (isRecord(nextContent.contentDocument) && Array.isArray(nextContent.contentDocument.elements)) {
    visit(nextContent.contentDocument.elements);
  }

  return changed ? nextContent : null;
};

const numericPatchValue = (value: string, label: string, required = false): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new Error(`${label} is required.`);
    }
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
};

const updateElementText = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  nextText: string,
): Record<string, unknown> | null => updateElementProps(content, elementId, { content: nextText });

const updateElementLink = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  siteId: string | undefined,
  href: string,
  targetBlank: boolean,
  download: boolean,
  downloadMediaId: string,
): Record<string, unknown> | null => {
  const mediaId = downloadMediaId.trim() || mediaIdFromUrl(href);
  const downloadHref = download && mediaId ? publicMediaFileUrl(siteId, mediaId, 'attachment') : '';
  const nextHref = href.trim() || downloadHref;
  const downloadFileMetadata = download
    ? downloadFileMetadataFromElement(elementFromContent(content, elementId), mediaId)
    : emptyDownloadFileMetadata();
  const signedUrlEndpoint = siteId && mediaId
    ? downloadFileMetadata.fileSignedUrlEndpoint || `/api/admin/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/signed-url`
    : '';

  return updateElementPropsWithAssetIds(content, elementId, {
    href: nextHref,
    target: targetBlank ? '_blank' : '_self',
    rel: targetBlank ? 'noopener noreferrer' : '',
    download,
    fileId: download && mediaId ? mediaId : '',
    fileIds: download && mediaId ? [mediaId] : [],
    fileMediaId: download && mediaId ? mediaId : '',
    fileMediaIds: download && mediaId ? [mediaId] : [],
    downloadMediaId: download && mediaId ? mediaId : '',
    downloadMediaIds: download && mediaId ? [mediaId] : [],
    fileMediaUrl: download && nextHref ? nextHref : '',
    fileUrl: download && nextHref ? nextHref : '',
    fileMediaName: download ? downloadFileMetadata.fileMediaName : '',
    fileMediaType: download ? downloadFileMetadata.fileMediaType : '',
    fileMediaVisibility: download ? downloadFileMetadata.fileMediaVisibility : '',
    fileDownloadDisposition: download ? 'attachment' : '',
    fileSignedUrlRequired: download && mediaId ? downloadFileMetadata.fileSignedUrlRequired : false,
    fileSignedUrlEndpoint: download && signedUrlEndpoint ? signedUrlEndpoint : '',
    fileName: download ? downloadFileMetadata.fileName : '',
  }, download && mediaId ? [mediaId] : [], ['fileId', 'fileIds', 'fileMediaId', 'fileMediaIds', 'downloadMediaId', 'downloadMediaIds']);
};

const updateElementImage = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  siteId: string | undefined,
  input: {
    src: string;
    mediaId: string;
    alt: string;
    title: string;
    objectFit: ImageObjectFit;
  },
): Record<string, unknown> | null => {
  const mediaId = input.mediaId.trim() || mediaIdFromUrl(input.src);
  const src = input.src.trim() || publicMediaFileUrl(siteId, mediaId);
  return updateElementPropsWithAssetIds(content, elementId, {
    src,
    mediaId: mediaId || '',
    mediaIds: mediaId ? [mediaId] : [],
    alt: input.alt,
    title: input.title,
    objectFit: input.objectFit,
  }, mediaId ? [mediaId] : [], ['mediaId', 'mediaIds']);
};

const updateElementMedia = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  elementType: string,
  siteId: string | undefined,
  input: InlineMediaFields,
): Record<string, unknown> | null => {
  const mediaId = input.mediaId.trim() || mediaIdFromUrl(input.src);
  const posterMediaId = input.posterMediaId.trim() || mediaIdFromUrl(input.poster);
  const src = input.src.trim() || publicMediaFileUrl(siteId, mediaId);
  const poster = input.poster.trim() || publicMediaFileUrl(siteId, posterMediaId);
  const title = input.title.trim();
  const loading = input.loading || undefined;

  if (elementType === 'video') {
    return updateElementPropsWithAssetIds(content, elementId, {
      src,
      mediaId: mediaId || '',
      mediaIds: mediaId ? [mediaId] : [],
      poster,
      posterMediaId: posterMediaId || '',
      posterMediaIds: posterMediaId ? [posterMediaId] : [],
      title,
      controls: input.controls,
      autoplay: input.autoplay,
      muted: input.muted,
      loop: input.loop,
      playsInline: input.playsInline,
    }, mediaAssetIds(mediaId, posterMediaId), ['mediaId', 'mediaIds', 'posterMediaId', 'posterMediaIds']);
  }

  if (elementType === 'embed') {
    return updateElementProps(content, elementId, {
      src,
      url: src,
      title,
      allowedHosts: input.allowedHosts.trim(),
      loading,
      allowFullScreen: input.allowFullScreen,
    });
  }

  if (elementType === 'map') {
    return updateElementProps(content, elementId, {
      address: input.address.trim(),
      src,
      title,
      markerLabel: input.markerLabel.trim(),
      zoom: input.zoom.trim(),
      loading,
      allowFullScreen: input.allowFullScreen,
    });
  }

  return null;
};

const formOptionLines = (value: string): string[] => (
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const updateElementForm = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  elementType: string,
  input: InlineFormFields,
): Record<string, unknown> | null => {
  if (elementType === 'form') {
    return updateElementProps(content, elementId, {
      formId: input.formId.trim(),
      formTitle: input.formTitle.trim(),
      submitLabel: input.submitLabel.trim(),
      action: input.action.trim(),
      successMessage: input.successMessage.trim(),
      formActive: input.formActive,
    });
  }

  const basePatch: Record<string, unknown> = {
    label: input.label.trim(),
    name: input.name.trim(),
    helpText: input.helpText.trim(),
    required: input.required,
    disabled: input.disabled,
  };

  if (elementType === 'input') {
    return updateElementProps(content, elementId, {
      ...basePatch,
      placeholder: input.placeholder.trim(),
      defaultValue: input.defaultValue.trim(),
      inputType: input.inputType || 'text',
    });
  }

  if (elementType === 'textarea') {
    return updateElementProps(content, elementId, {
      ...basePatch,
      placeholder: input.placeholder.trim(),
      defaultValue: input.defaultValue.trim(),
      rows: input.rows.trim(),
    });
  }

  if (elementType === 'select') {
    return updateElementProps(content, elementId, {
      ...basePatch,
      placeholder: input.placeholder.trim(),
      defaultValue: input.defaultValue.trim(),
      options: formOptionLines(input.options),
    });
  }

  if (elementType === 'checkbox' || elementType === 'radio') {
    const options = formOptionLines(input.options);
    return updateElementProps(content, elementId, {
      ...basePatch,
      value: input.value.trim(),
      defaultValue: formOptionLines(input.defaultValue),
      options,
    });
  }

  return null;
};

const updateElementAppearance = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  input: InlineAppearanceFields,
): Record<string, unknown> | null => updateElementProps(content, elementId, {
  color: input.color.trim(),
  backgroundColor: input.backgroundColor.trim(),
  borderColor: input.borderColor.trim(),
  borderStyle: input.borderStyle,
  borderWidth: input.borderWidth.trim(),
  borderRadius: input.borderRadius.trim(),
  padding: input.padding.trim(),
  fontSize: input.fontSize.trim(),
  fontFamily: input.fontFamily.trim(),
  fontWeight: input.fontWeight.trim(),
  lineHeight: input.lineHeight.trim(),
  textAlign: input.textAlign,
  textTransform: input.textTransform,
  textDecoration: input.textDecoration,
  letterSpacing: input.letterSpacing.trim(),
  margin: input.margin.trim(),
  boxShadow: input.boxShadow.trim(),
  opacity: input.opacity.trim(),
});

const updateElementLayout = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  input: InlineLayoutFields,
): Record<string, unknown> | null => {
  const width = numericPatchValue(input.width, 'Width', true);
  const height = numericPatchValue(input.height, 'Height', true);
  if (width !== undefined && width <= 0) {
    throw new Error('Width must be greater than 0.');
  }
  if (height !== undefined && height <= 0) {
    throw new Error('Height must be greater than 0.');
  }

  const patch: Record<string, unknown> = {
    name: input.name.trim(),
    x: numericPatchValue(input.x, 'X', true),
    y: numericPatchValue(input.y, 'Y', true),
    width,
    height,
    visible: input.visible,
    locked: input.locked,
  };
  const zIndex = numericPatchValue(input.zIndex, 'Layer');
  const rotation = numericPatchValue(input.rotation, 'Rotation');
  if (zIndex !== undefined) {
    patch.zIndex = zIndex;
  }
  if (rotation !== undefined) {
    patch.rotation = rotation;
  }

  return updateElementFields(content, elementId, patch);
};

const optionalJsonObjectField = (value: string, label: string): Record<string, unknown> | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (!isRecord(parsed)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('must be a JSON object.')) {
      throw error;
    }
    throw new Error(`${label} must be valid JSON.`);
  }
};

const optionalJsonArrayField = (value: string, label: string): unknown[] | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON array.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('must be a JSON array.')) {
      throw error;
    }
    throw new Error(`${label} must be valid JSON.`);
  }
};

const updateElementAnimation = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  input: InlineAnimationFields,
): Record<string, unknown> | null => {
  const type = input.type || 'fadeIn';
  const duration = numericPatchValue(input.duration || '0.6', 'Duration', true);
  if (duration !== undefined && duration < 0) {
    throw new Error('Duration must be zero or greater.');
  }
  const delay = numericPatchValue(input.delay, 'Delay');
  if (delay !== undefined && delay < 0) {
    throw new Error('Delay must be zero or greater.');
  }

  const animation: Record<string, unknown> = {
    type,
    duration,
  };
  if (delay !== undefined) animation.delay = delay;
  if (input.easing.trim()) animation.easing = input.easing.trim();
  if (input.trigger) animation.trigger = input.trigger;
  if (input.direction) animation.direction = input.direction;

  const from = optionalJsonObjectField(input.from, 'Animation from');
  const to = optionalJsonObjectField(input.to, 'Animation to');
  if (from) animation.from = from;
  if (to) animation.to = to;

  if (input.scrollStart.trim() || input.scrollEnd.trim() || input.scrollScrub) {
    animation.scrollTrigger = {
      ...(input.scrollStart.trim() ? { start: input.scrollStart.trim() } : {}),
      ...(input.scrollEnd.trim() ? { end: input.scrollEnd.trim() } : {}),
      ...(input.scrollScrub ? { scrub: true } : {}),
    };
  }
  if (input.durationToken.trim() || input.easingToken.trim()) {
    animation.tokenRefs = {
      ...(input.durationToken.trim() ? { duration: input.durationToken.trim() } : {}),
      ...(input.easingToken.trim() ? { easing: input.easingToken.trim() } : {}),
    };
  }

  return updateElementFields(content, elementId, { animation });
};

const updateElementActionsBindings = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  input: InlineActionsBindingsFields,
): Record<string, unknown> | null => updateElementFields(content, elementId, {
  actions: optionalJsonArrayField(input.actions, 'Actions'),
  dataBindings: optionalJsonArrayField(input.dataBindings, 'Data bindings'),
  bindingSlots: optionalJsonArrayField(input.bindingSlots, 'Binding slots'),
});

export function LivePageManagementOverlay({
  enabled,
  siteId,
  pageId,
  postId,
  resourceType,
  adminAppUrl,
}: LivePageManagementOverlayProps) {
  const [page, setPage] = useState<ManagedPage | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<ManagedPageStatus>('draft');
  const [isHomepage, setIsHomepage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [elementTargets, setElementTargets] = useState<ManagedElementTarget[]>([]);
  const [selectedElementId, setSelectedElementId] = useState('');
  const [selectedElementRect, setSelectedElementRect] = useState<DOMRect | null>(null);
  const [inlineText, setInlineText] = useState('');
  const [inlineTextSaving, setInlineTextSaving] = useState(false);
  const [inlineHref, setInlineHref] = useState('');
  const [inlineTargetBlank, setInlineTargetBlank] = useState(false);
  const [inlineDownloadEnabled, setInlineDownloadEnabled] = useState(false);
  const [inlineDownloadMediaId, setInlineDownloadMediaId] = useState('');
  const [inlineLinkSaving, setInlineLinkSaving] = useState(false);
  const [inlineImageSrc, setInlineImageSrc] = useState('');
  const [inlineImageMediaId, setInlineImageMediaId] = useState('');
  const [inlineImageAlt, setInlineImageAlt] = useState('');
  const [inlineImageTitle, setInlineImageTitle] = useState('');
  const [inlineImageObjectFit, setInlineImageObjectFit] = useState<ImageObjectFit>('cover');
  const [inlineImageSaving, setInlineImageSaving] = useState(false);
  const [inlineMediaSrc, setInlineMediaSrc] = useState('');
  const [inlineMediaId, setInlineMediaId] = useState('');
  const [inlineMediaPoster, setInlineMediaPoster] = useState('');
  const [inlineMediaPosterMediaId, setInlineMediaPosterMediaId] = useState('');
  const [inlineMediaTitle, setInlineMediaTitle] = useState('');
  const [inlineMediaAddress, setInlineMediaAddress] = useState('');
  const [inlineMediaMarkerLabel, setInlineMediaMarkerLabel] = useState('');
  const [inlineMediaZoom, setInlineMediaZoom] = useState('');
  const [inlineMediaAllowedHosts, setInlineMediaAllowedHosts] = useState('');
  const [inlineMediaLoading, setInlineMediaLoading] = useState<IframeLoadingOption>('');
  const [inlineMediaControls, setInlineMediaControls] = useState(true);
  const [inlineMediaAutoplay, setInlineMediaAutoplay] = useState(false);
  const [inlineMediaLoop, setInlineMediaLoop] = useState(false);
  const [inlineMediaMuted, setInlineMediaMuted] = useState(false);
  const [inlineMediaPlaysInline, setInlineMediaPlaysInline] = useState(false);
  const [inlineMediaAllowFullScreen, setInlineMediaAllowFullScreen] = useState(true);
  const [inlineMediaSaving, setInlineMediaSaving] = useState(false);
  const [inlineFormId, setInlineFormId] = useState('');
  const [inlineFormTitle, setInlineFormTitle] = useState('');
  const [inlineFormSubmitLabel, setInlineFormSubmitLabel] = useState('');
  const [inlineFormAction, setInlineFormAction] = useState('');
  const [inlineFormSuccessMessage, setInlineFormSuccessMessage] = useState('');
  const [inlineFormActive, setInlineFormActive] = useState(true);
  const [inlineFormLabel, setInlineFormLabel] = useState('');
  const [inlineFormName, setInlineFormName] = useState('');
  const [inlineFormPlaceholder, setInlineFormPlaceholder] = useState('');
  const [inlineFormHelpText, setInlineFormHelpText] = useState('');
  const [inlineFormDefaultValue, setInlineFormDefaultValue] = useState('');
  const [inlineFormValue, setInlineFormValue] = useState('');
  const [inlineFormOptions, setInlineFormOptions] = useState('');
  const [inlineFormInputType, setInlineFormInputType] = useState<FormInputTypeOption>('text');
  const [inlineFormRows, setInlineFormRows] = useState('');
  const [inlineFormRequired, setInlineFormRequired] = useState(false);
  const [inlineFormDisabled, setInlineFormDisabled] = useState(false);
  const [inlineFormSaving, setInlineFormSaving] = useState(false);
  const [inlineAppearanceColor, setInlineAppearanceColor] = useState('');
  const [inlineAppearanceBackgroundColor, setInlineAppearanceBackgroundColor] = useState('');
  const [inlineAppearanceBorderColor, setInlineAppearanceBorderColor] = useState('');
  const [inlineAppearanceBorderStyle, setInlineAppearanceBorderStyle] = useState<BorderStyleOption>('');
  const [inlineAppearanceBorderWidth, setInlineAppearanceBorderWidth] = useState('');
  const [inlineAppearanceBorderRadius, setInlineAppearanceBorderRadius] = useState('');
  const [inlineAppearancePadding, setInlineAppearancePadding] = useState('');
  const [inlineAppearanceFontSize, setInlineAppearanceFontSize] = useState('');
  const [inlineAppearanceFontFamily, setInlineAppearanceFontFamily] = useState('');
  const [inlineAppearanceFontWeight, setInlineAppearanceFontWeight] = useState('');
  const [inlineAppearanceLineHeight, setInlineAppearanceLineHeight] = useState('');
  const [inlineAppearanceTextAlign, setInlineAppearanceTextAlign] = useState<TextAlignOption>('');
  const [inlineAppearanceTextTransform, setInlineAppearanceTextTransform] = useState<TextTransformOption>('');
  const [inlineAppearanceTextDecoration, setInlineAppearanceTextDecoration] = useState<TextDecorationOption>('');
  const [inlineAppearanceLetterSpacing, setInlineAppearanceLetterSpacing] = useState('');
  const [inlineAppearanceMargin, setInlineAppearanceMargin] = useState('');
  const [inlineAppearanceBoxShadow, setInlineAppearanceBoxShadow] = useState('');
  const [inlineAppearanceOpacity, setInlineAppearanceOpacity] = useState('');
  const [inlineAppearanceSaving, setInlineAppearanceSaving] = useState(false);
  const [inlineLayoutName, setInlineLayoutName] = useState('');
  const [inlineLayoutX, setInlineLayoutX] = useState('');
  const [inlineLayoutY, setInlineLayoutY] = useState('');
  const [inlineLayoutWidth, setInlineLayoutWidth] = useState('');
  const [inlineLayoutHeight, setInlineLayoutHeight] = useState('');
  const [inlineLayoutZIndex, setInlineLayoutZIndex] = useState('');
  const [inlineLayoutRotation, setInlineLayoutRotation] = useState('');
  const [inlineLayoutVisible, setInlineLayoutVisible] = useState(true);
  const [inlineLayoutLocked, setInlineLayoutLocked] = useState(false);
  const [inlineLayoutSaving, setInlineLayoutSaving] = useState(false);
  const [inlineAnimationType, setInlineAnimationType] = useState<AnimationTypeOption>('');
  const [inlineAnimationTrigger, setInlineAnimationTrigger] = useState<AnimationTriggerOption>('');
  const [inlineAnimationDirection, setInlineAnimationDirection] = useState<AnimationDirectionOption>('');
  const [inlineAnimationDuration, setInlineAnimationDuration] = useState('');
  const [inlineAnimationDelay, setInlineAnimationDelay] = useState('');
  const [inlineAnimationEasing, setInlineAnimationEasing] = useState('');
  const [inlineAnimationScrollStart, setInlineAnimationScrollStart] = useState('');
  const [inlineAnimationScrollEnd, setInlineAnimationScrollEnd] = useState('');
  const [inlineAnimationScrollScrub, setInlineAnimationScrollScrub] = useState(false);
  const [inlineAnimationFrom, setInlineAnimationFrom] = useState('');
  const [inlineAnimationTo, setInlineAnimationTo] = useState('');
  const [inlineAnimationDurationToken, setInlineAnimationDurationToken] = useState('');
  const [inlineAnimationEasingToken, setInlineAnimationEasingToken] = useState('');
  const [inlineAnimationSaving, setInlineAnimationSaving] = useState(false);
  const [inlineActionsJson, setInlineActionsJson] = useState('');
  const [inlineDataBindingsJson, setInlineDataBindingsJson] = useState('');
  const [inlineBindingSlotsJson, setInlineBindingSlotsJson] = useState('');
  const [inlineActionsBindingsSaving, setInlineActionsBindingsSaving] = useState(false);
  const managedResourceType: LiveManagedResourceType = resourceType || (postId ? 'post' : 'page');
  const managedResourceId = managedResourceType === 'post' ? postId : pageId;
  const managedResourceLabel = managedResourceType === 'post' ? 'Post' : 'Page';

  const manageEndpoint = useMemo(() => {
    if (!siteId || !managedResourceId) return '';
    const resourcePath = managedResourceType === 'post' ? 'blog' : 'pages';
    return `/api/sites/${encodeURIComponent(siteId)}/manage/${resourcePath}/${encodeURIComponent(managedResourceId)}`;
  }, [managedResourceId, managedResourceType, siteId]);

  const editorHref = useMemo(() => {
    if (!siteId || !managedResourceId) return '';
    const selectedElementQuery = selectedElementId ? `&elementId=${encodeURIComponent(selectedElementId)}` : '';
    if (managedResourceType === 'post') {
      return joinedAdminUrl(
        adminAppUrl,
        `/blog/${encodeURIComponent(managedResourceId)}?siteId=${encodeURIComponent(siteId)}&focus=canvas${selectedElementQuery}`,
      );
    }

    return joinedAdminUrl(
      adminAppUrl,
      `/pages/${encodeURIComponent(managedResourceId)}/edit?siteId=${encodeURIComponent(siteId)}&focus=canvas${selectedElementQuery}`,
    );
  }, [adminAppUrl, managedResourceId, managedResourceType, selectedElementId, siteId]);

  useEffect(() => {
    if (!enabled || !manageEndpoint) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetch(manageEndpoint, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(errorMessageFromResponse(payload, 'Unable to load live management.'));
        }

        return managedPageFromResponse(payload);
      })
      .then((nextPage) => {
        if (!nextPage || controller.signal.aborted) return;
        setPage(nextPage);
        setTitle(nextPage.title || '');
        setStatus(nextPage.status || 'draft');
        setIsHomepage(nextPage.isHomepage === true);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load live management.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [enabled, manageEndpoint]);

  useEffect(() => {
    if (!enabled || !page) {
      return;
    }

    const collectTargets = () => {
      const seen = new Set<string>();
      const contentTargetsById = new Map(contentElementTargets(page.content).map((target) => [target.id, target]));
      const renderedTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-backy-element-id], [data-element-id]'))
        .map((element) => {
          const id = element.dataset.backyElementId || element.dataset.elementId || '';
          const type = element.dataset.backyElementType || element.dataset.elementType || 'element';
          const rect = element.getBoundingClientRect();
          if (!id || seen.has(id) || rect.width <= 0 || rect.height <= 0) {
            return null;
          }
          seen.add(id);
          return { id, type, label: contentTargetsById.get(id)?.label || elementLabel(element), source: 'rendered' as const, visible: true };
        })
        .filter((target): target is NonNullable<typeof target> => Boolean(target));
      const contentTargets = Array.from(contentTargetsById.values())
        .filter((target) => !seen.has(target.id));

      setElementTargets([...renderedTargets, ...contentTargets]);
    };

    collectTargets();
    window.setTimeout(collectTargets, 250);
  }, [enabled, page]);

  useEffect(() => {
    if (!selectedElementId) {
      setSelectedElementRect(null);
      setInlineText('');
      setInlineHref('');
      setInlineTargetBlank(false);
      setInlineDownloadEnabled(false);
      setInlineDownloadMediaId('');
      setInlineImageSrc('');
      setInlineImageMediaId('');
      setInlineImageAlt('');
      setInlineImageTitle('');
      setInlineImageObjectFit('cover');
      setInlineMediaSrc('');
      setInlineMediaId('');
      setInlineMediaPoster('');
      setInlineMediaPosterMediaId('');
      setInlineMediaTitle('');
      setInlineMediaAddress('');
      setInlineMediaMarkerLabel('');
      setInlineMediaZoom('');
      setInlineMediaAllowedHosts('');
      setInlineMediaLoading('');
      setInlineMediaControls(true);
      setInlineMediaAutoplay(false);
      setInlineMediaLoop(false);
      setInlineMediaMuted(false);
      setInlineMediaPlaysInline(false);
      setInlineMediaAllowFullScreen(true);
      setInlineFormId('');
      setInlineFormTitle('');
      setInlineFormSubmitLabel('');
      setInlineFormAction('');
      setInlineFormSuccessMessage('');
      setInlineFormActive(true);
      setInlineFormLabel('');
      setInlineFormName('');
      setInlineFormPlaceholder('');
      setInlineFormHelpText('');
      setInlineFormDefaultValue('');
      setInlineFormValue('');
      setInlineFormOptions('');
      setInlineFormInputType('text');
      setInlineFormRows('');
      setInlineFormRequired(false);
      setInlineFormDisabled(false);
      setInlineAppearanceColor('');
      setInlineAppearanceBackgroundColor('');
      setInlineAppearanceBorderColor('');
      setInlineAppearanceBorderStyle('');
      setInlineAppearanceBorderWidth('');
      setInlineAppearanceBorderRadius('');
      setInlineAppearancePadding('');
      setInlineAppearanceFontSize('');
      setInlineAppearanceFontFamily('');
      setInlineAppearanceFontWeight('');
      setInlineAppearanceLineHeight('');
      setInlineAppearanceTextAlign('');
      setInlineAppearanceTextTransform('');
      setInlineAppearanceTextDecoration('');
      setInlineAppearanceLetterSpacing('');
      setInlineAppearanceMargin('');
      setInlineAppearanceBoxShadow('');
      setInlineAppearanceOpacity('');
      setInlineLayoutName('');
      setInlineLayoutX('');
      setInlineLayoutY('');
      setInlineLayoutWidth('');
      setInlineLayoutHeight('');
      setInlineLayoutZIndex('');
      setInlineLayoutRotation('');
      setInlineLayoutVisible(true);
      setInlineLayoutLocked(false);
      setInlineAnimationType('');
      setInlineAnimationTrigger('');
      setInlineAnimationDirection('');
      setInlineAnimationDuration('');
      setInlineAnimationDelay('');
      setInlineAnimationEasing('');
      setInlineAnimationScrollStart('');
      setInlineAnimationScrollEnd('');
      setInlineAnimationScrollScrub(false);
      setInlineAnimationFrom('');
      setInlineAnimationTo('');
      setInlineAnimationDurationToken('');
      setInlineAnimationEasingToken('');
      setInlineActionsJson('');
      setInlineDataBindingsJson('');
      setInlineBindingSlotsJson('');
      return;
    }

    const updateRect = () => {
      const element = findRenderedElement(selectedElementId);
      setSelectedElementRect(element ? element.getBoundingClientRect() : null);
    };

    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [selectedElementId]);

  const selectedContentElement = useMemo(
    () => elementFromContent(page?.content, selectedElementId),
    [page?.content, selectedElementId],
  );
  const selectedElementType = String(selectedContentElement?.type || '');
  const selectedElementLocked = booleanValue(selectedContentElement?.locked);
  const selectedElementSupportsInlineText = INLINE_TEXT_ELEMENT_TYPES.has(selectedElementType);
  const selectedElementSupportsInlineLink = INLINE_LINK_ELEMENT_TYPES.has(selectedElementType);
  const selectedElementSupportsInlineImage = INLINE_IMAGE_ELEMENT_TYPES.has(selectedElementType);
  const selectedElementSupportsInlineMedia = INLINE_MEDIA_ELEMENT_TYPES.has(selectedElementType);
  const selectedElementSupportsInlineForm = INLINE_FORM_ELEMENT_TYPES.has(selectedElementType);
  const selectedElementMediaSaveDisabled = selectedElementLocked
    || inlineMediaSaving
    || (selectedElementType === 'map'
      ? inlineMediaSrc.trim().length === 0 && inlineMediaAddress.trim().length === 0
      : inlineMediaSrc.trim().length === 0 && inlineMediaId.trim().length === 0);

  useEffect(() => {
    setInlineText(inlineTextFromElement(selectedContentElement));
    setInlineHref(inlineHrefFromElement(selectedContentElement));
    setInlineTargetBlank(inlineTargetBlankFromElement(selectedContentElement));
    setInlineDownloadEnabled(inlineDownloadFromElement(selectedContentElement));
    setInlineDownloadMediaId(inlineDownloadMediaIdFromElement(selectedContentElement));
    const imageFields = imageFieldsFromElement(selectedContentElement);
    setInlineImageSrc(imageFields.src);
    setInlineImageMediaId(imageFields.mediaId);
    setInlineImageAlt(imageFields.alt);
    setInlineImageTitle(imageFields.title);
    setInlineImageObjectFit(imageFields.objectFit);
    const mediaFields = mediaFieldsFromElement(selectedContentElement);
    setInlineMediaSrc(mediaFields.src);
    setInlineMediaId(mediaFields.mediaId);
    setInlineMediaPoster(mediaFields.poster);
    setInlineMediaPosterMediaId(mediaFields.posterMediaId);
    setInlineMediaTitle(mediaFields.title);
    setInlineMediaAddress(mediaFields.address);
    setInlineMediaMarkerLabel(mediaFields.markerLabel);
    setInlineMediaZoom(mediaFields.zoom);
    setInlineMediaAllowedHosts(mediaFields.allowedHosts);
    setInlineMediaLoading(mediaFields.loading);
    setInlineMediaControls(mediaFields.controls);
    setInlineMediaAutoplay(mediaFields.autoplay);
    setInlineMediaLoop(mediaFields.loop);
    setInlineMediaMuted(mediaFields.muted);
    setInlineMediaPlaysInline(mediaFields.playsInline);
    setInlineMediaAllowFullScreen(mediaFields.allowFullScreen);
    const formFields = formFieldsFromElement(selectedContentElement);
    setInlineFormId(formFields.formId);
    setInlineFormTitle(formFields.formTitle);
    setInlineFormSubmitLabel(formFields.submitLabel);
    setInlineFormAction(formFields.action);
    setInlineFormSuccessMessage(formFields.successMessage);
    setInlineFormActive(formFields.formActive);
    setInlineFormLabel(formFields.label);
    setInlineFormName(formFields.name);
    setInlineFormPlaceholder(formFields.placeholder);
    setInlineFormHelpText(formFields.helpText);
    setInlineFormDefaultValue(formFields.defaultValue);
    setInlineFormValue(formFields.value);
    setInlineFormOptions(formFields.options);
    setInlineFormInputType(formFields.inputType);
    setInlineFormRows(formFields.rows);
    setInlineFormRequired(formFields.required);
    setInlineFormDisabled(formFields.disabled);
    const appearanceFields = appearanceFieldsFromElement(selectedContentElement);
    setInlineAppearanceColor(appearanceFields.color);
    setInlineAppearanceBackgroundColor(appearanceFields.backgroundColor);
    setInlineAppearanceBorderColor(appearanceFields.borderColor);
    setInlineAppearanceBorderStyle(appearanceFields.borderStyle);
    setInlineAppearanceBorderWidth(appearanceFields.borderWidth);
    setInlineAppearanceBorderRadius(appearanceFields.borderRadius);
    setInlineAppearancePadding(appearanceFields.padding);
    setInlineAppearanceFontSize(appearanceFields.fontSize);
    setInlineAppearanceFontFamily(appearanceFields.fontFamily);
    setInlineAppearanceFontWeight(appearanceFields.fontWeight);
    setInlineAppearanceLineHeight(appearanceFields.lineHeight);
    setInlineAppearanceTextAlign(appearanceFields.textAlign);
    setInlineAppearanceTextTransform(appearanceFields.textTransform);
    setInlineAppearanceTextDecoration(appearanceFields.textDecoration);
    setInlineAppearanceLetterSpacing(appearanceFields.letterSpacing);
    setInlineAppearanceMargin(appearanceFields.margin);
    setInlineAppearanceBoxShadow(appearanceFields.boxShadow);
    setInlineAppearanceOpacity(appearanceFields.opacity);
    const layoutFields = layoutFieldsFromElement(selectedContentElement);
    setInlineLayoutName(layoutFields.name);
    setInlineLayoutX(layoutFields.x);
    setInlineLayoutY(layoutFields.y);
    setInlineLayoutWidth(layoutFields.width);
    setInlineLayoutHeight(layoutFields.height);
    setInlineLayoutZIndex(layoutFields.zIndex);
    setInlineLayoutRotation(layoutFields.rotation);
    setInlineLayoutVisible(layoutFields.visible);
    setInlineLayoutLocked(layoutFields.locked);
    const animationFields = animationFieldsFromElement(selectedContentElement);
    setInlineAnimationType(animationFields.type);
    setInlineAnimationTrigger(animationFields.trigger);
    setInlineAnimationDirection(animationFields.direction);
    setInlineAnimationDuration(animationFields.duration);
    setInlineAnimationDelay(animationFields.delay);
    setInlineAnimationEasing(animationFields.easing);
    setInlineAnimationScrollStart(animationFields.scrollStart);
    setInlineAnimationScrollEnd(animationFields.scrollEnd);
    setInlineAnimationScrollScrub(animationFields.scrollScrub);
    setInlineAnimationFrom(animationFields.from);
    setInlineAnimationTo(animationFields.to);
    setInlineAnimationDurationToken(animationFields.durationToken);
    setInlineAnimationEasingToken(animationFields.easingToken);
    const actionsBindingsFields = actionsBindingsFieldsFromElement(selectedContentElement);
    setInlineActionsJson(actionsBindingsFields.actions);
    setInlineDataBindingsJson(actionsBindingsFields.dataBindings);
    setInlineBindingSlotsJson(actionsBindingsFields.bindingSlots);
  }, [selectedContentElement]);

  const focusElement = (elementId: string) => {
    const element = findRenderedElement(elementId);
    setSelectedElementId(elementId);
    if (element) {
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      setSelectedElementRect(element.getBoundingClientRect());
    }
  };

  const savePage = async () => {
    if (!manageEndpoint || !page) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        status,
        expectedUpdatedAt: page.updatedAt,
      };
      if (managedResourceType === 'page') {
        body.isHomepage = isHomepage;
      }

      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the live changes.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
        setTitle(updatedPage.title || '');
        setStatus(updatedPage.status || 'draft');
        setIsHomepage(updatedPage.isHomepage === true);
      }
      setMessage('Saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the live changes.');
    } finally {
      setSaving(false);
    }
  };

  const saveInlineText = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its content.');
      return;
    }

    const nextContent = updateElementText(page.content, selectedElementId, inlineText.trim());
    if (!nextContent) {
      setError('Unable to update this element from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineTextSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected element.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Element saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected element.');
    } finally {
      setInlineTextSaving(false);
    }
  };

  const saveInlineLink = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its destination.');
      return;
    }

    const nextContent = updateElementLink(
      page.content,
      selectedElementId,
      siteId,
      inlineHref.trim(),
      inlineTargetBlank,
      inlineDownloadEnabled,
      inlineDownloadMediaId,
    );
    if (!nextContent) {
      setError('Unable to update this destination from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineLinkSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected destination.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Destination saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected destination.');
    } finally {
      setInlineLinkSaving(false);
    }
  };

  const saveInlineImage = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its image fields.');
      return;
    }

    const nextContent = updateElementImage(page.content, selectedElementId, siteId, {
      src: inlineImageSrc.trim(),
      mediaId: inlineImageMediaId.trim(),
      alt: inlineImageAlt.trim(),
      title: inlineImageTitle.trim(),
      objectFit: inlineImageObjectFit,
    });
    if (!nextContent) {
      setError('Unable to update this image from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineImageSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected image.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Image saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected image.');
    } finally {
      setInlineImageSaving(false);
    }
  };

  const saveInlineMedia = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its media fields.');
      return;
    }

    const nextContent = updateElementMedia(page.content, selectedElementId, selectedElementType, siteId, {
      src: inlineMediaSrc,
      mediaId: inlineMediaId,
      poster: inlineMediaPoster,
      posterMediaId: inlineMediaPosterMediaId,
      title: inlineMediaTitle,
      address: inlineMediaAddress,
      markerLabel: inlineMediaMarkerLabel,
      zoom: inlineMediaZoom,
      allowedHosts: inlineMediaAllowedHosts,
      loading: inlineMediaLoading,
      controls: inlineMediaControls,
      autoplay: inlineMediaAutoplay,
      loop: inlineMediaLoop,
      muted: inlineMediaMuted,
      playsInline: inlineMediaPlaysInline,
      allowFullScreen: inlineMediaAllowFullScreen,
    });
    if (!nextContent) {
      setError('Unable to update this media element from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineMediaSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected media element.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Media element saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected media element.');
    } finally {
      setInlineMediaSaving(false);
    }
  };

  const saveInlineForm = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its form settings.');
      return;
    }

    const nextContent = updateElementForm(page.content, selectedElementId, selectedElementType, {
      formId: inlineFormId,
      formTitle: inlineFormTitle,
      submitLabel: inlineFormSubmitLabel,
      action: inlineFormAction,
      successMessage: inlineFormSuccessMessage,
      formActive: inlineFormActive,
      label: inlineFormLabel,
      name: inlineFormName,
      placeholder: inlineFormPlaceholder,
      helpText: inlineFormHelpText,
      defaultValue: inlineFormDefaultValue,
      value: inlineFormValue,
      options: inlineFormOptions,
      inputType: inlineFormInputType,
      rows: inlineFormRows,
      required: inlineFormRequired,
      disabled: inlineFormDisabled,
    });
    if (!nextContent) {
      setError('Unable to update this form element from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineFormSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected form element.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Form element saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected form element.');
    } finally {
      setInlineFormSaving(false);
    }
  };

  const saveInlineAppearance = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its appearance.');
      return;
    }

    const nextContent = updateElementAppearance(page.content, selectedElementId, {
      color: inlineAppearanceColor,
      backgroundColor: inlineAppearanceBackgroundColor,
      borderColor: inlineAppearanceBorderColor,
      borderStyle: inlineAppearanceBorderStyle,
      borderWidth: inlineAppearanceBorderWidth,
      borderRadius: inlineAppearanceBorderRadius,
      padding: inlineAppearancePadding,
      fontSize: inlineAppearanceFontSize,
      fontFamily: inlineAppearanceFontFamily,
      fontWeight: inlineAppearanceFontWeight,
      lineHeight: inlineAppearanceLineHeight,
      textAlign: inlineAppearanceTextAlign,
      textTransform: inlineAppearanceTextTransform,
      textDecoration: inlineAppearanceTextDecoration,
      letterSpacing: inlineAppearanceLetterSpacing,
      margin: inlineAppearanceMargin,
      boxShadow: inlineAppearanceBoxShadow,
      opacity: inlineAppearanceOpacity,
    });
    if (!nextContent) {
      setError('Unable to update this appearance from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineAppearanceSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected appearance.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Appearance saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected appearance.');
    } finally {
      setInlineAppearanceSaving(false);
    }
  };

  const saveInlineLayout = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;

    let nextContent: Record<string, unknown> | null = null;
    try {
      nextContent = updateElementLayout(page.content, selectedElementId, {
        name: inlineLayoutName,
        x: inlineLayoutX,
        y: inlineLayoutY,
        width: inlineLayoutWidth,
        height: inlineLayoutHeight,
        zIndex: inlineLayoutZIndex,
        rotation: inlineLayoutRotation,
        visible: inlineLayoutVisible,
        locked: inlineLayoutLocked,
      });
    } catch (layoutError) {
      setError(layoutError instanceof Error ? layoutError.message : 'Unable to update this layout.');
      return;
    }
    if (!nextContent) {
      setError('Unable to update this layout from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineLayoutSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected layout.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Layout saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected layout.');
    } finally {
      setInlineLayoutSaving(false);
    }
  };

  const saveInlineAnimation = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its animation.');
      return;
    }

    let nextContent: Record<string, unknown> | null = null;
    try {
      nextContent = updateElementAnimation(page.content, selectedElementId, {
        type: inlineAnimationType,
        trigger: inlineAnimationTrigger,
        direction: inlineAnimationDirection,
        duration: inlineAnimationDuration,
        delay: inlineAnimationDelay,
        easing: inlineAnimationEasing,
        scrollStart: inlineAnimationScrollStart,
        scrollEnd: inlineAnimationScrollEnd,
        scrollScrub: inlineAnimationScrollScrub,
        from: inlineAnimationFrom,
        to: inlineAnimationTo,
        durationToken: inlineAnimationDurationToken,
        easingToken: inlineAnimationEasingToken,
      });
    } catch (animationError) {
      setError(animationError instanceof Error ? animationError.message : 'Unable to update this animation.');
      return;
    }
    if (!nextContent) {
      setError('Unable to update this animation from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineAnimationSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected animation.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Animation saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected animation.');
    } finally {
      setInlineAnimationSaving(false);
    }
  };

  const saveInlineActionsBindings = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;
    if (selectedElementLocked) {
      setError('Unlock this element before editing its actions or bindings.');
      return;
    }

    let nextContent: Record<string, unknown> | null = null;
    try {
      nextContent = updateElementActionsBindings(page.content, selectedElementId, {
        actions: inlineActionsJson,
        dataBindings: inlineDataBindingsJson,
        bindingSlots: inlineBindingSlotsJson,
      });
    } catch (advancedError) {
      setError(advancedError instanceof Error ? advancedError.message : 'Unable to update these actions or bindings.');
      return;
    }
    if (!nextContent) {
      setError('Unable to update these actions or bindings from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineActionsBindingsSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected actions or bindings.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Actions and bindings saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected actions or bindings.');
    } finally {
      setInlineActionsBindingsSaving(false);
    }
  };

  if (!enabled || !manageEndpoint || (!page && !loading && !error)) {
    return null;
  }

  return (
    <>
      {selectedElementRect ? (
        <div
          aria-hidden="true"
          data-backy-live-element-highlight={selectedElementId}
          style={{
            position: 'fixed',
            left: Math.max(0, selectedElementRect.left - 3),
            top: Math.max(0, selectedElementRect.top - 3),
            width: selectedElementRect.width + 6,
            height: selectedElementRect.height + 6,
            zIndex: 2147482999,
            border: '2px solid #2563eb',
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.08)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <section
        aria-label={`Backy live ${managedResourceType === 'post' ? 'blog post' : 'page'} management`}
        data-backy-live-management-overlay="page"
        data-backy-live-management-resource={managedResourceType}
        data-backy-live-post-management-overlay={managedResourceType === 'post' ? 'post' : undefined}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 2147483000,
          width: expanded ? 360 : 250,
          maxWidth: 'calc(100vw - 32px)',
          border: '1px solid rgba(15, 23, 42, 0.16)',
          borderRadius: 8,
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: expanded ? '1px solid #e2e8f0' : 'none' }}>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          style={{
            flex: '1 1 auto',
            border: 0,
            background: 'transparent',
            color: '#0f172a',
            fontWeight: 700,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          Backy live edit
        </button>
        {page?.status ? (
          <span
            style={{
              flex: '0 0 auto',
              borderRadius: 999,
              background: page.status === 'published' ? '#dcfce7' : '#f1f5f9',
              color: page.status === 'published' ? '#166534' : '#334155',
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {page.status}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div style={{ display: 'grid', gap: 10, padding: 12 }}>
          {loading ? <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>Checking admin access...</p> : null}
          {page ? (
            <>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                {managedResourceLabel} title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 9px', font: 'inherit', fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ManagedPageStatus)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 9px', font: 'inherit', fontSize: 14, background: '#fff' }}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              {managedResourceType === 'page' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={isHomepage}
                    onChange={(event) => setIsHomepage(event.target.checked)}
                  />
                  Set as homepage
                </label>
              ) : null}
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Canvas elements</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{elementTargets.length}</span>
                </div>
                <div
                  data-backy-live-element-list="page"
                  style={{
                    display: 'grid',
                    gap: 4,
                    maxHeight: 150,
                    overflow: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 4,
                  }}
                >
                  {elementTargets.length > 0 ? elementTargets.slice(0, 30).map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => focusElement(target.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        border: '1px solid transparent',
                        borderColor: selectedElementId === target.id ? '#2563eb' : 'transparent',
                        borderRadius: 5,
                        background: selectedElementId === target.id ? '#eff6ff' : '#fff',
                        color: '#0f172a',
                        cursor: 'pointer',
                        padding: '6px 7px',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {target.label}
                      </span>
                      <span style={{ flex: '0 0 auto', fontSize: 11, color: target.visible ? '#64748b' : '#b45309' }}>
                        {target.visible ? (target.source === 'rendered' ? target.type : 'content') : 'hidden'}
                      </span>
                    </button>
                  )) : (
                    <span style={{ color: '#64748b', fontSize: 12, padding: '5px 6px' }}>No editable rendered elements found.</span>
                  )}
                </div>
              </div>
              {selectedElementId ? (
                <div data-backy-live-inline-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Inline element text
                  </span>
                  {selectedElementSupportsInlineText ? (
                    <>
                      <textarea
                        value={inlineText}
                        onChange={(event) => setInlineText(event.target.value)}
                        rows={3}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 13,
                          lineHeight: 1.4,
                          padding: '8px 9px',
                          resize: 'vertical',
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveInlineText}
                        disabled={selectedElementLocked || inlineTextSaving || inlineText.trim().length === 0}
                        style={{
                          justifySelf: 'start',
                          border: 0,
                          borderRadius: 6,
                          background: selectedElementLocked || inlineTextSaving || inlineText.trim().length === 0 ? '#94a3b8' : '#2563eb',
                          color: '#fff',
                          cursor: selectedElementLocked || inlineTextSaving || inlineText.trim().length === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: 700,
                          padding: '7px 10px',
                        }}
                      >
                        {inlineTextSaving ? 'Saving element...' : 'Save element text'}
                      </button>
                    </>
                  ) : (
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                      This element type opens in the full editor for changes.
                    </span>
                  )}
                </div>
              ) : null}
              {selectedElementSupportsInlineLink ? (
                <div data-backy-live-link-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Link destination
                  </span>
                  <input
                    value={inlineHref}
                    onChange={(event) => setInlineHref(event.target.value)}
                    placeholder="/pricing, https://..., mailto:..."
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      font: 'inherit',
                      fontSize: 13,
                      padding: '8px 9px',
                    }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={inlineTargetBlank}
                      onChange={(event) => setInlineTargetBlank(event.target.checked)}
                    />
                    Open in new tab
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={inlineDownloadEnabled}
                      onChange={(event) => setInlineDownloadEnabled(event.target.checked)}
                    />
                    Download uploaded file
                  </label>
                  {inlineDownloadEnabled ? (
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Backy file media ID
                      <input
                        value={inlineDownloadMediaId}
                        onChange={(event) => setInlineDownloadMediaId(event.target.value)}
                        placeholder="Backy file media ID"
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 13,
                          padding: '8px 9px',
                        }}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={saveInlineLink}
                    disabled={selectedElementLocked || inlineLinkSaving}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: selectedElementLocked || inlineLinkSaving ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: selectedElementLocked || inlineLinkSaving ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineLinkSaving ? 'Saving destination...' : 'Save destination'}
                  </button>
                </div>
              ) : null}
              {selectedElementSupportsInlineImage ? (
                <div data-backy-live-image-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Image details
                  </span>
                  <input
                    value={inlineImageSrc}
                    onChange={(event) => setInlineImageSrc(event.target.value)}
                    placeholder="Image URL or Backy media URL"
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      font: 'inherit',
                      fontSize: 13,
                      padding: '8px 9px',
                    }}
                  />
                  <input
                    value={inlineImageMediaId}
                    onChange={(event) => setInlineImageMediaId(event.target.value)}
                    placeholder="Backy media ID"
                    aria-label="Backy image media ID"
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      font: 'inherit',
                      fontSize: 13,
                      padding: '8px 9px',
                    }}
                  />
                  <input
                    value={inlineImageAlt}
                    onChange={(event) => setInlineImageAlt(event.target.value)}
                    placeholder="Alt text"
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      font: 'inherit',
                      fontSize: 13,
                      padding: '8px 9px',
                    }}
                  />
                  <input
                    value={inlineImageTitle}
                    onChange={(event) => setInlineImageTitle(event.target.value)}
                    placeholder="Image title"
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      font: 'inherit',
                      fontSize: 13,
                      padding: '8px 9px',
                    }}
                  />
                  <select
                    value={inlineImageObjectFit}
                    onChange={(event) => setInlineImageObjectFit(event.target.value as ImageObjectFit)}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      font: 'inherit',
                      fontSize: 13,
                      padding: '8px 9px',
                      background: '#fff',
                    }}
                  >
                    {IMAGE_OBJECT_FIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveInlineImage}
                    disabled={selectedElementLocked || inlineImageSaving || (inlineImageSrc.trim().length === 0 && inlineImageMediaId.trim().length === 0)}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: selectedElementLocked || inlineImageSaving || (inlineImageSrc.trim().length === 0 && inlineImageMediaId.trim().length === 0) ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: selectedElementLocked || inlineImageSaving || (inlineImageSrc.trim().length === 0 && inlineImageMediaId.trim().length === 0) ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineImageSaving ? 'Saving image...' : 'Save image'}
                  </button>
                </div>
              ) : null}
              {selectedElementSupportsInlineMedia ? (
                <div data-backy-live-media-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Media / embed
                  </span>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    {selectedElementType === 'map' ? 'Map URL' : 'Source URL'}
                    <input
                      value={inlineMediaSrc}
                      onChange={(event) => setInlineMediaSrc(event.target.value)}
                      placeholder={selectedElementType === 'video' ? 'Video URL or Backy media URL' : 'https://...'}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        font: 'inherit',
                        fontSize: 13,
                        padding: '8px 9px',
                      }}
                    />
                  </label>
                  {selectedElementType === 'video' ? (
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Backy media ID
                      <input
                        value={inlineMediaId}
                        onChange={(event) => setInlineMediaId(event.target.value)}
                        placeholder="Backy video media ID"
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 13,
                          padding: '8px 9px',
                        }}
                      />
                    </label>
                  ) : null}
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Title
                    <input
                      value={inlineMediaTitle}
                      onChange={(event) => setInlineMediaTitle(event.target.value)}
                      placeholder="Accessible title"
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        font: 'inherit',
                        fontSize: 13,
                        padding: '8px 9px',
                      }}
                    />
                  </label>
                  {selectedElementType === 'video' ? (
                    <>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Poster image
                        <input
                          value={inlineMediaPoster}
                          onChange={(event) => setInlineMediaPoster(event.target.value)}
                          placeholder="Poster image URL"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Poster media ID
                        <input
                          value={inlineMediaPosterMediaId}
                          onChange={(event) => setInlineMediaPosterMediaId(event.target.value)}
                          placeholder="Backy poster media ID"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                          <input
                            type="checkbox"
                            checked={inlineMediaControls}
                            onChange={(event) => setInlineMediaControls(event.target.checked)}
                          />
                          Controls
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                          <input
                            type="checkbox"
                            checked={inlineMediaAutoplay}
                            onChange={(event) => setInlineMediaAutoplay(event.target.checked)}
                          />
                          Autoplay
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                          <input
                            type="checkbox"
                            checked={inlineMediaMuted}
                            onChange={(event) => setInlineMediaMuted(event.target.checked)}
                          />
                          Muted
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                          <input
                            type="checkbox"
                            checked={inlineMediaLoop}
                            onChange={(event) => setInlineMediaLoop(event.target.checked)}
                          />
                          Loop
                        </label>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={inlineMediaPlaysInline}
                          onChange={(event) => setInlineMediaPlaysInline(event.target.checked)}
                        />
                        Play inline on mobile
                      </label>
                    </>
                  ) : null}
                  {selectedElementType === 'embed' ? (
                    <>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Allowed hosts
                        <input
                          value={inlineMediaAllowedHosts}
                          onChange={(event) => setInlineMediaAllowedHosts(event.target.value)}
                          placeholder="youtube.com, vimeo.com"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Loading
                          <select
                            value={inlineMediaLoading}
                            onChange={(event) => setInlineMediaLoading(event.target.value as IframeLoadingOption)}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                          >
                            {IFRAME_LOADING_OPTIONS.map((option) => (
                              <option key={option || 'default'} value={option}>{option || 'default'}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', paddingTop: 20 }}>
                          <input
                            type="checkbox"
                            checked={inlineMediaAllowFullScreen}
                            onChange={(event) => setInlineMediaAllowFullScreen(event.target.checked)}
                          />
                          Fullscreen
                        </label>
                      </div>
                    </>
                  ) : null}
                  {selectedElementType === 'map' ? (
                    <>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Address
                        <input
                          value={inlineMediaAddress}
                          onChange={(event) => setInlineMediaAddress(event.target.value)}
                          placeholder="1600 Amphitheatre Pkwy, Mountain View"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Marker label
                          <input
                            value={inlineMediaMarkerLabel}
                            onChange={(event) => setInlineMediaMarkerLabel(event.target.value)}
                            placeholder="HQ"
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Zoom
                          <input
                            value={inlineMediaZoom}
                            onChange={(event) => setInlineMediaZoom(event.target.value)}
                            placeholder="12"
                            inputMode="decimal"
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Loading
                          <select
                            value={inlineMediaLoading}
                            onChange={(event) => setInlineMediaLoading(event.target.value as IframeLoadingOption)}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                          >
                            {IFRAME_LOADING_OPTIONS.map((option) => (
                              <option key={option || 'default'} value={option}>{option || 'default'}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', paddingTop: 20 }}>
                          <input
                            type="checkbox"
                            checked={inlineMediaAllowFullScreen}
                            onChange={(event) => setInlineMediaAllowFullScreen(event.target.checked)}
                          />
                          Fullscreen
                        </label>
                      </div>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={saveInlineMedia}
                    disabled={selectedElementMediaSaveDisabled}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: selectedElementMediaSaveDisabled ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: selectedElementMediaSaveDisabled ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineMediaSaving ? 'Saving media...' : 'Save media'}
                  </button>
                </div>
              ) : null}
              {selectedElementSupportsInlineForm ? (
                <div data-backy-live-form-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Form controls
                  </span>
                  {selectedElementType === 'form' ? (
                    <>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Form id
                        <input
                          value={inlineFormId}
                          onChange={(event) => setInlineFormId(event.target.value)}
                          placeholder="contact-form"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Title
                        <input
                          value={inlineFormTitle}
                          onChange={(event) => setInlineFormTitle(event.target.value)}
                          placeholder="Contact us"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Submit label
                        <input
                          value={inlineFormSubmitLabel}
                          onChange={(event) => setInlineFormSubmitLabel(event.target.value)}
                          placeholder="Submit"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Action URL
                        <input
                          value={inlineFormAction}
                          onChange={(event) => setInlineFormAction(event.target.value)}
                          placeholder="/api/sites/.../forms/.../submissions"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Success message
                        <input
                          value={inlineFormSuccessMessage}
                          onChange={(event) => setInlineFormSuccessMessage(event.target.value)}
                          placeholder="Thanks. Your message was sent."
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={inlineFormActive}
                          onChange={(event) => setInlineFormActive(event.target.checked)}
                        />
                        Accept submissions
                      </label>
                    </>
                  ) : (
                    <>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Label
                        <input
                          value={inlineFormLabel}
                          onChange={(event) => setInlineFormLabel(event.target.value)}
                          placeholder="Email"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Field name
                        <input
                          value={inlineFormName}
                          onChange={(event) => setInlineFormName(event.target.value)}
                          placeholder="email"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      {selectedElementType === 'input' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Input type
                          <select
                            value={inlineFormInputType}
                            onChange={(event) => setInlineFormInputType(event.target.value as FormInputTypeOption)}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                          >
                            {FORM_INPUT_TYPE_OPTIONS.map((option) => (
                              <option key={option || 'default'} value={option}>{option || 'default'}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {selectedElementType === 'input' || selectedElementType === 'textarea' || selectedElementType === 'select' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Placeholder
                          <input
                            value={inlineFormPlaceholder}
                            onChange={(event) => setInlineFormPlaceholder(event.target.value)}
                            placeholder="Placeholder text"
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                          />
                        </label>
                      ) : null}
                      {selectedElementType === 'textarea' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Rows
                          <input
                            value={inlineFormRows}
                            onChange={(event) => setInlineFormRows(event.target.value)}
                            placeholder="5"
                            inputMode="numeric"
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                          />
                        </label>
                      ) : null}
                      {selectedElementType === 'select' || selectedElementType === 'checkbox' || selectedElementType === 'radio' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Options
                          <textarea
                            value={inlineFormOptions}
                            onChange={(event) => setInlineFormOptions(event.target.value)}
                            rows={3}
                            placeholder="One option per line"
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, lineHeight: 1.4, padding: '8px 9px', resize: 'vertical' }}
                          />
                        </label>
                      ) : null}
                      {selectedElementType === 'checkbox' || selectedElementType === 'radio' ? (
                        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                          Value
                          <input
                            value={inlineFormValue}
                            onChange={(event) => setInlineFormValue(event.target.value)}
                            placeholder="on"
                            style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                          />
                        </label>
                      ) : null}
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Default value
                        <input
                          value={inlineFormDefaultValue}
                          onChange={(event) => setInlineFormDefaultValue(event.target.value)}
                          placeholder={selectedElementType === 'checkbox' ? 'Checked value or comma-separated values' : 'Default value'}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Help text
                        <input
                          value={inlineFormHelpText}
                          onChange={(event) => setInlineFormHelpText(event.target.value)}
                          placeholder="Short hint under the field"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                          <input
                            type="checkbox"
                            checked={inlineFormRequired}
                            onChange={(event) => setInlineFormRequired(event.target.checked)}
                          />
                          Required
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                          <input
                            type="checkbox"
                            checked={inlineFormDisabled}
                            onChange={(event) => setInlineFormDisabled(event.target.checked)}
                          />
                          Disabled
                        </label>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={saveInlineForm}
                    disabled={selectedElementLocked || inlineFormSaving}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: selectedElementLocked || inlineFormSaving ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: selectedElementLocked || inlineFormSaving ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineFormSaving ? 'Saving form...' : 'Save form controls'}
                  </button>
                </div>
              ) : null}
              {selectedElementId ? (
                <div data-backy-live-layout-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Layout
                  </span>
                  {selectedElementLocked ? (
                    <span style={{ color: '#b45309', fontSize: 12 }}>
                      Unlock this element to edit content or appearance.
                    </span>
                  ) : null}
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Layer name
                    <input
                      value={inlineLayoutName}
                      onChange={(event) => setInlineLayoutName(event.target.value)}
                      placeholder="Hero headline"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                    />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      X
                      <input
                        value={inlineLayoutX}
                        onChange={(event) => setInlineLayoutX(event.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Y
                      <input
                        value={inlineLayoutY}
                        onChange={(event) => setInlineLayoutY(event.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Width
                      <input
                        value={inlineLayoutWidth}
                        onChange={(event) => setInlineLayoutWidth(event.target.value)}
                        placeholder="320"
                        inputMode="decimal"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Height
                      <input
                        value={inlineLayoutHeight}
                        onChange={(event) => setInlineLayoutHeight(event.target.value)}
                        placeholder="180"
                        inputMode="decimal"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Layer
                      <input
                        value={inlineLayoutZIndex}
                        onChange={(event) => setInlineLayoutZIndex(event.target.value)}
                        placeholder="1"
                        inputMode="numeric"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Rotation
                      <input
                        value={inlineLayoutRotation}
                        onChange={(event) => setInlineLayoutRotation(event.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={inlineLayoutVisible}
                      onChange={(event) => setInlineLayoutVisible(event.target.checked)}
                    />
                    Visible on page
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={inlineLayoutLocked}
                      onChange={(event) => setInlineLayoutLocked(event.target.checked)}
                    />
                    Locked in editor
                  </label>
                  <button
                    type="button"
                    onClick={saveInlineLayout}
                    disabled={inlineLayoutSaving}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: inlineLayoutSaving ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: inlineLayoutSaving ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineLayoutSaving ? 'Saving layout...' : 'Save layout'}
                  </button>
                </div>
              ) : null}
              {selectedElementId ? (
                <div data-backy-live-animation-section="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Animation
                  </span>
                  <div data-backy-live-animation-editor="page" style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Type
                        <select
                          value={inlineAnimationType}
                          onChange={(event) => setInlineAnimationType(event.target.value as AnimationTypeOption)}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                        >
                          {ANIMATION_TYPE_OPTIONS.map((option) => (
                            <option key={option || 'default'} value={option}>{option || 'default'}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Trigger
                        <select
                          value={inlineAnimationTrigger}
                          onChange={(event) => setInlineAnimationTrigger(event.target.value as AnimationTriggerOption)}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                        >
                          {ANIMATION_TRIGGER_OPTIONS.map((option) => (
                            <option key={option || 'default'} value={option}>{option || 'default'}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Duration
                        <input
                          value={inlineAnimationDuration}
                          onChange={(event) => setInlineAnimationDuration(event.target.value)}
                          placeholder="0.6"
                          inputMode="decimal"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Delay
                        <input
                          value={inlineAnimationDelay}
                          onChange={(event) => setInlineAnimationDelay(event.target.value)}
                          placeholder="0"
                          inputMode="decimal"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Direction
                        <select
                          value={inlineAnimationDirection}
                          onChange={(event) => setInlineAnimationDirection(event.target.value as AnimationDirectionOption)}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                        >
                          {ANIMATION_DIRECTION_OPTIONS.map((option) => (
                            <option key={option || 'none'} value={option}>{option || 'none'}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Easing
                        <input
                          value={inlineAnimationEasing}
                          onChange={(event) => setInlineAnimationEasing(event.target.value)}
                          placeholder="ease-out, power2.out"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Duration token
                        <input
                          value={inlineAnimationDurationToken}
                          onChange={(event) => setInlineAnimationDurationToken(event.target.value)}
                          placeholder="motion.duration.fast"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Easing token
                        <input
                          value={inlineAnimationEasingToken}
                          onChange={(event) => setInlineAnimationEasingToken(event.target.value)}
                          placeholder="motion.easing.standard"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Scroll start
                        <input
                          value={inlineAnimationScrollStart}
                          onChange={(event) => setInlineAnimationScrollStart(event.target.value)}
                          placeholder="top 80%"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                        Scroll end
                        <input
                          value={inlineAnimationScrollEnd}
                          onChange={(event) => setInlineAnimationScrollEnd(event.target.value)}
                          placeholder="bottom 20%"
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                        />
                      </label>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={inlineAnimationScrollScrub}
                        onChange={(event) => setInlineAnimationScrollScrub(event.target.checked)}
                      />
                      Scrub with scroll
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      From JSON
                      <textarea
                        value={inlineAnimationFrom}
                        onChange={(event) => setInlineAnimationFrom(event.target.value)}
                        rows={3}
                        placeholder='{"opacity":0,"y":24}'
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 12, lineHeight: 1.4, padding: '8px 9px', resize: 'vertical' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      To JSON
                      <textarea
                        value={inlineAnimationTo}
                        onChange={(event) => setInlineAnimationTo(event.target.value)}
                        rows={3}
                        placeholder='{"opacity":1,"y":0}'
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 12, lineHeight: 1.4, padding: '8px 9px', resize: 'vertical' }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={saveInlineAnimation}
                      disabled={selectedElementLocked || inlineAnimationSaving}
                      style={{
                        justifySelf: 'start',
                        border: 0,
                        borderRadius: 6,
                        background: selectedElementLocked || inlineAnimationSaving ? '#94a3b8' : '#2563eb',
                        color: '#fff',
                        cursor: selectedElementLocked || inlineAnimationSaving ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        padding: '7px 10px',
                      }}
                    >
                      {inlineAnimationSaving ? 'Saving animation...' : 'Save animation'}
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedElementId ? (
                <div data-backy-live-actions-bindings-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Actions and bindings
                  </span>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Actions JSON
                    <textarea
                      value={inlineActionsJson}
                      onChange={(event) => setInlineActionsJson(event.target.value)}
                      rows={3}
                      placeholder='[{"type":"navigate","href":"/pricing"}]'
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 12, lineHeight: 1.4, padding: '8px 9px', resize: 'vertical' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Data bindings JSON
                    <textarea
                      value={inlineDataBindingsJson}
                      onChange={(event) => setInlineDataBindingsJson(event.target.value)}
                      rows={3}
                      placeholder='[{"targetPath":"props.content","source":{"kind":"collection","field":"title"}}]'
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 12, lineHeight: 1.4, padding: '8px 9px', resize: 'vertical' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Binding slots JSON
                    <textarea
                      value={inlineBindingSlotsJson}
                      onChange={(event) => setInlineBindingSlotsJson(event.target.value)}
                      rows={3}
                      placeholder='[{"id":"title","targetPath":"props.content","fieldKey":"title"}]'
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 12, lineHeight: 1.4, padding: '8px 9px', resize: 'vertical' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={saveInlineActionsBindings}
                    disabled={selectedElementLocked || inlineActionsBindingsSaving}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: selectedElementLocked || inlineActionsBindingsSaving ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: selectedElementLocked || inlineActionsBindingsSaving ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineActionsBindingsSaving ? 'Saving actions...' : 'Save actions/bindings'}
                  </button>
                </div>
              ) : null}
              {selectedElementId ? (
                <div data-backy-live-appearance-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Appearance
                  </span>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Text color
                    <span style={{ display: 'grid', gridTemplateColumns: '38px 1fr', gap: 6 }}>
                      <input
                        type="color"
                        value={hexColorInputValue(inlineAppearanceColor)}
                        onChange={(event) => setInlineAppearanceColor(event.target.value)}
                        aria-label="Text color swatch"
                        style={{ width: 38, height: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: 2, background: '#fff' }}
                      />
                      <input
                        value={inlineAppearanceColor}
                        onChange={(event) => setInlineAppearanceColor(event.target.value)}
                        placeholder="#111827 or token"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </span>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Background
                    <span style={{ display: 'grid', gridTemplateColumns: '38px 1fr', gap: 6 }}>
                      <input
                        type="color"
                        value={hexColorInputValue(inlineAppearanceBackgroundColor)}
                        onChange={(event) => setInlineAppearanceBackgroundColor(event.target.value)}
                        aria-label="Background color swatch"
                        style={{ width: 38, height: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: 2, background: '#fff' }}
                      />
                      <input
                        value={inlineAppearanceBackgroundColor}
                        onChange={(event) => setInlineAppearanceBackgroundColor(event.target.value)}
                        placeholder="#ffffff, transparent, or token"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </span>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Border color
                    <span style={{ display: 'grid', gridTemplateColumns: '38px 1fr', gap: 6 }}>
                      <input
                        type="color"
                        value={hexColorInputValue(inlineAppearanceBorderColor)}
                        onChange={(event) => setInlineAppearanceBorderColor(event.target.value)}
                        aria-label="Border color swatch"
                        style={{ width: 38, height: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: 2, background: '#fff' }}
                      />
                      <input
                        value={inlineAppearanceBorderColor}
                        onChange={(event) => setInlineAppearanceBorderColor(event.target.value)}
                        placeholder="#cbd5e1 or token"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Border style
                      <select
                        value={inlineAppearanceBorderStyle}
                        onChange={(event) => setInlineAppearanceBorderStyle(event.target.value as BorderStyleOption)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                      >
                        {BORDER_STYLE_OPTIONS.map((option) => (
                          <option key={option || 'default'} value={option}>{option || 'default'}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Border width
                      <input
                        value={inlineAppearanceBorderWidth}
                        onChange={(event) => setInlineAppearanceBorderWidth(event.target.value)}
                        placeholder="0, 1, 2px"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Radius
                    <input
                      value={inlineAppearanceBorderRadius}
                      onChange={(event) => setInlineAppearanceBorderRadius(event.target.value)}
                      placeholder="0, 8, 999px"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Padding
                    <input
                      value={inlineAppearancePadding}
                      onChange={(event) => setInlineAppearancePadding(event.target.value)}
                      placeholder="0, 12, 12px 16px"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                    />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Font size
                      <input
                        value={inlineAppearanceFontSize}
                        onChange={(event) => setInlineAppearanceFontSize(event.target.value)}
                        placeholder="16, 18px, 1rem"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Line height
                      <input
                        value={inlineAppearanceLineHeight}
                        onChange={(event) => setInlineAppearanceLineHeight(event.target.value)}
                        placeholder="1.4, 24px"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Font family
                    <input
                      value={inlineAppearanceFontFamily}
                      onChange={(event) => setInlineAppearanceFontFamily(event.target.value)}
                      placeholder="Inter, var(--font-heading)"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                    />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Font weight
                      <input
                        value={inlineAppearanceFontWeight}
                        onChange={(event) => setInlineAppearanceFontWeight(event.target.value)}
                        placeholder="400, 600, bold"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Transform
                      <select
                        value={inlineAppearanceTextTransform}
                        onChange={(event) => setInlineAppearanceTextTransform(event.target.value as TextTransformOption)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                      >
                        {TEXT_TRANSFORM_OPTIONS.map((option) => (
                          <option key={option || 'default'} value={option}>{option || 'default'}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Text align
                    <select
                      value={inlineAppearanceTextAlign}
                      onChange={(event) => setInlineAppearanceTextAlign(event.target.value as TextAlignOption)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                    >
                      {TEXT_ALIGN_OPTIONS.map((option) => (
                        <option key={option || 'default'} value={option}>{option || 'default'}</option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Decoration
                      <select
                        value={inlineAppearanceTextDecoration}
                        onChange={(event) => setInlineAppearanceTextDecoration(event.target.value as TextDecorationOption)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px', background: '#fff' }}
                      >
                        {TEXT_DECORATION_OPTIONS.map((option) => (
                          <option key={option || 'default'} value={option}>{option || 'default'}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Letter spacing
                      <input
                        value={inlineAppearanceLetterSpacing}
                        onChange={(event) => setInlineAppearanceLetterSpacing(event.target.value)}
                        placeholder="0, 0.02em, 1px"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Margin
                      <input
                        value={inlineAppearanceMargin}
                        onChange={(event) => setInlineAppearanceMargin(event.target.value)}
                        placeholder="0, 8, 8px 0"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                      Opacity
                      <input
                        value={inlineAppearanceOpacity}
                        onChange={(event) => setInlineAppearanceOpacity(event.target.value)}
                        placeholder="1, 0.85"
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
                    Shadow
                    <input
                      value={inlineAppearanceBoxShadow}
                      onChange={(event) => setInlineAppearanceBoxShadow(event.target.value)}
                      placeholder="0 10px 30px rgba(15,23,42,0.18)"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontSize: 13, padding: '8px 9px' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={saveInlineAppearance}
                    disabled={selectedElementLocked || inlineAppearanceSaving}
                    style={{
                      justifySelf: 'start',
                      border: 0,
                      borderRadius: 6,
                      background: selectedElementLocked || inlineAppearanceSaving ? '#94a3b8' : '#2563eb',
                      color: '#fff',
                      cursor: selectedElementLocked || inlineAppearanceSaving ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      padding: '7px 10px',
                    }}
                  >
                    {inlineAppearanceSaving ? 'Saving appearance...' : 'Save appearance'}
                  </button>
                </div>
              ) : null}
              {error ? <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 12, lineHeight: 1.4 }}>{error}</p> : null}
              {message ? <p style={{ margin: 0, color: '#166534', fontSize: 12, lineHeight: 1.4 }}>{message}</p> : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={savePage}
                  disabled={saving || title.trim().length === 0}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    background: saving || title.trim().length === 0 ? '#94a3b8' : '#0f172a',
                    color: '#fff',
                    cursor: saving || title.trim().length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    padding: '8px 10px',
                  }}
                >
                  {saving ? 'Saving...' : 'Save live'}
                </button>
                <a
                  href={editorHref}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    color: '#0f172a',
                    fontWeight: 700,
                    padding: '7px 10px',
                    textDecoration: 'none',
                  }}
                >
                  Open editor
                </a>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: '#fff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontWeight: 700,
                    padding: '7px 10px',
                  }}
                >
                  Reload
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      </section>
    </>
  );
}

export default LivePageManagementOverlay;
