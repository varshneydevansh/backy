/**
 * ==========================================================================
 * Backy CMS - Page Renderer
 * ==========================================================================
 *
 * Client-side page rendering with GSAP support.
 * Renders canvas elements from the page builder into HTML.
 *
 * @module @backy/public
 */

'use client';

import type { BackyContentDocument } from '@backy-cms/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// TYPES (matching page builder editor types)
// ============================================================================

/** Element types from the page builder */
export type ElementType = string;
export type KnownElementType =
  | 'text'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'video'
  | 'button'
  | 'link'
  | 'container'
  | 'header'
  | 'footer'
  | 'nav'
  | 'section'
  | 'columns'
  | 'spacer'
  | 'divider'
  | 'icon'
  | 'form'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'list'
  | 'repeater'
  | 'table'
  | 'embed'
  | 'html'
  | 'map'
  | 'box'
  | 'quote'
  | 'comment';

/** Canvas element structure */
export interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  props: Record<string, unknown>;
  styles?: React.CSSProperties;
  responsive?: Partial<Record<RenderBreakpoint, ResponsiveElementOverride>>;
  children?: CanvasElement[];
  animation?: AnimationConfig;
}

type RenderBreakpoint = 'desktop' | 'tablet' | 'mobile';

interface ResponsiveElementOverride {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  props?: Record<string, unknown>;
  styles?: React.CSSProperties;
}

/** Animation configuration for GSAP */
export interface AnimationConfig {
  type: string;
  duration: number;
  delay?: number;
  easing?: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  trigger?: 'load' | 'scroll' | 'hover';
  scrollTrigger?: {
    start?: string;
    end?: string;
    scrub?: boolean;
  };
}

/** Page content structure */
export interface PageContent {
  elements: CanvasElement[];
  canvasSize: { width: number; height: number };
  customCSS?: string;
  customJS?: string;
  contentDocument?: BackyContentDocument;
}

/** Theme configuration */
export interface ThemeConfig {
  colors?: Record<string, string>;
  fonts?: {
    heading?: string;
    body?: string;
  };
  spacing?: Record<string, string | number>;
  customCSS?: string;
}

interface FontAsset {
  id: string;
  family: string;
  source: 'system' | 'google' | 'uploaded' | 'external';
  url?: string;
  weights?: Array<string | number>;
  styles?: Array<'normal' | 'italic' | 'oblique'>;
  fallbackStack?: string;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional' | string;
  cssFamily?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const animationFromMetadata = (element: CanvasElement): AnimationConfig | undefined => {
  const elementRecord = element as unknown as Record<string, unknown>;
  const metadata = isRecord(elementRecord.metadata)
    ? elementRecord.metadata
    : null;
  const animation = metadata && isRecord(metadata.animation)
    ? metadata.animation
    : null;

  if (!animation) {
    return undefined;
  }

  const type = typeof animation?.type === 'string' ? animation.type : null;
  const duration = typeof animation?.duration === 'number' ? animation.duration : null;

  if (!type || duration === null) {
    return undefined;
  }

  return {
    type,
    duration,
    delay: typeof animation.delay === 'number' ? animation.delay : undefined,
    easing: typeof animation.easing === 'string' ? animation.easing : undefined,
    direction: animation.direction === 'left' || animation.direction === 'right' || animation.direction === 'up' || animation.direction === 'down'
      ? animation.direction
      : undefined,
    trigger: animation.trigger === 'load' || animation.trigger === 'scroll' || animation.trigger === 'hover'
      ? animation.trigger
      : undefined,
  };
};

const toRenderableElements = (elements: CanvasElement[]): CanvasElement[] => (
  elements.map((element) => ({
    ...element,
    animation: element.animation || animationFromMetadata(element),
    children: element.children ? toRenderableElements(element.children) : undefined,
  }))
);

const resolveBreakpoint = (width: number): RenderBreakpoint => {
  if (width <= 639) {
    return 'mobile';
  }
  if (width <= 1023) {
    return 'tablet';
  }
  return 'desktop';
};

const RESPONSIVE_LAYOUT_FIELDS = ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'visible', 'locked'] as const;

const applyResponsiveOverride = (
  element: CanvasElement,
  breakpoint: RenderBreakpoint,
): CanvasElement => {
  const children = element.children?.map((child) => applyResponsiveOverride(child, breakpoint));

  if (breakpoint === 'desktop') {
    return children ? { ...element, children } : element;
  }

  const override = element.responsive?.[breakpoint];
  if (!override) {
    return children ? { ...element, children } : element;
  }

  return {
    ...element,
    ...RESPONSIVE_LAYOUT_FIELDS.reduce<Partial<CanvasElement>>((acc, key) => {
      if (override[key] !== undefined) {
        (acc as Record<string, unknown>)[key] = override[key];
      }
      return acc;
    }, {}),
    props: override.props ? { ...element.props, ...override.props } : element.props,
    styles: override.styles ? { ...(element.styles || {}), ...override.styles } : element.styles,
    ...(children ? { children } : {}),
  };
};

const applyResponsiveOverrides = (
  elements: CanvasElement[],
  breakpoint: RenderBreakpoint,
): CanvasElement[] => elements.map((element) => applyResponsiveOverride(element, breakpoint));

interface CommentItem {
  id: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';
  authorName: string | null;
  authorEmail: string | null;
  authorWebsite: string | null;
  parentId: string | null;
  createdAt: string;
  requestId?: string | null;
  reportCount?: number;
  reportReasons?: string[];
}

interface CommentFormPayload {
  moderationMode: 'manual' | 'auto-approve';
  requireName: boolean;
  requireEmail: boolean;
  allowGuests: boolean;
  allowReplies: boolean;
  sort: 'newest' | 'oldest';
}

interface CommentIdentity {
  userId?: string;
  name?: string;
  email?: string;
  website?: string;
}

function readCommentIdentityFromBackyAuthStorage(): CommentIdentity | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem('backy-auth-storage');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        user?: {
          id?: unknown;
          email?: unknown;
          fullName?: unknown;
          name?: unknown;
          userId?: unknown;
        };
      };
      user?: {
        id?: unknown;
        email?: unknown;
        fullName?: unknown;
        name?: unknown;
        userId?: unknown;
      };
    };

    const user = parsed?.state?.user || parsed?.user;
    if (!user || typeof user !== 'object') {
      return null;
    }

    const userId = parseStringValue((user as { id?: unknown }).id || (user as { userId?: unknown }).userId);
    const email = parseStringValue((user as { email?: unknown }).email);
    const fullName = parseStringValue((user as { fullName?: unknown }).fullName);
    const name = parseStringValue((user as { name?: unknown }).name);

    if (!userId && !email && !name && !fullName) {
      return null;
    }

    return {
      userId: userId || undefined,
      name: fullName || name || undefined,
      email: email || undefined,
    };
  } catch {
    return null;
  }
}

function extractApiErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const raw = payload as {
    error?: unknown;
    message?: unknown;
    details?: unknown;
  };

  if (typeof raw.error === 'string' && raw.error.length > 0 && raw.error !== 'Validation failed') {
    return raw.error;
  }

  const details = raw.details;
  if (details && typeof details === 'object') {
    const candidates = Object.values(details).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  if (typeof raw.message === 'string' && raw.message.length > 0) {
    return raw.message;
  }

  if (typeof raw.error === 'string' && raw.error.length > 0) {
    return raw.error;
  }

  return fallback;
}

function parseStringValue(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function readCommentIdentityFromStorage(): CommentIdentity | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem('backy-comment-identity');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      userId?: unknown;
      id?: unknown;
      name?: unknown;
      email?: unknown;
      website?: unknown;
    };

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const userId = parseStringValue(parsed.userId) || parseStringValue(parsed.id);
    const name = parseStringValue(parsed.name);
    const email = parseStringValue(parsed.email);
    const website = parseStringValue(parsed.website);

    if (!userId && !name && !email && !website) {
      return null;
    }

    return {
      userId: userId || undefined,
      name: name || undefined,
      email: email || undefined,
      website: website || undefined,
    };
  } catch {
    return null;
  }
}

function readCommentIdentityFromQuery(): CommentIdentity | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const userId = parseStringValue(searchParams.get('backyCommentUserId') || searchParams.get('commentUserId'));
  const name = parseStringValue(searchParams.get('backyCommentUserName') || searchParams.get('name'));
  const email = parseStringValue(searchParams.get('backyCommentUserEmail') || searchParams.get('email'));
  const website = parseStringValue(
    searchParams.get('backyCommentUserWebsite') || searchParams.get('website'),
  );

  if (!userId && !name && !email && !website) {
    return null;
  }

  return {
    userId: userId || undefined,
    name: name || undefined,
    email: email || undefined,
    website: website || undefined,
  };
}

function readCommentIdentity(): CommentIdentity | null {
  const queryIdentity = readCommentIdentityFromQuery();
  if (queryIdentity) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('backy-comment-identity', JSON.stringify(queryIdentity));
    }
    return queryIdentity;
  }

  const storedIdentity = readCommentIdentityFromStorage();
  const authIdentity = readCommentIdentityFromBackyAuthStorage();

  if (!storedIdentity && !authIdentity) {
    return null;
  }

  if (!storedIdentity) {
    return authIdentity;
  }

  const mergedIdentity: CommentIdentity = {
    userId: storedIdentity.userId || authIdentity?.userId,
    name: storedIdentity.name || authIdentity?.name,
    email: storedIdentity.email || authIdentity?.email,
    website: storedIdentity.website || authIdentity?.website,
  };

  if (typeof window !== 'undefined' && (mergedIdentity.userId || mergedIdentity.name || mergedIdentity.email || mergedIdentity.website)) {
    window.localStorage.setItem('backy-comment-identity', JSON.stringify(mergedIdentity));
  }

  return mergedIdentity;
}

const normalizeRendererType = (value: string): KnownElementType => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') : '';

  if (!normalized) {
    return 'text';
  }

  if (
    normalized === 'textinput'
    || normalized === 'textinputfield'
    || normalized === 'textfield'
    || normalized === 'textfield'
    || normalized === 'inputfield'
  ) {
    return 'input';
  }

  if (
    normalized === 'multiline'
    || normalized === 'multilinetext'
    || normalized === 'multilinetextinput'
    || normalized === 'textarea'
    || normalized === 'textareafield'
  ) {
    return 'textarea';
  }

  if (normalized === 'radio' || normalized === 'radiobutton' || normalized === 'radioinput' || normalized === 'radioinputs') {
    return 'radio';
  }

  if (
    normalized === 'checkbox'
    || normalized === 'checkboxes'
    || normalized === 'checkboxinput'
    || normalized === 'checkboxinputs'
  ) {
    return 'checkbox';
  }

  if (normalized.includes('dropdown') || normalized.includes('select')) {
    return 'select';
  }

  if (normalized.includes('textinput') || normalized.includes('textfield')) {
    return 'input';
  }

  const knownTypes: KnownElementType[] = [
    'text',
    'heading',
    'paragraph',
    'image',
    'video',
    'button',
    'link',
    'container',
    'header',
    'footer',
    'nav',
    'section',
    'columns',
    'spacer',
    'divider',
    'icon',
    'form',
    'input',
    'textarea',
    'select',
    'checkbox',
    'radio',
    'list',
    'repeater',
    'table',
    'embed',
    'html',
    'map',
    'box',
    'quote',
    'comment',
  ];

  return knownTypes.includes(normalized as KnownElementType)
    ? (normalized as KnownElementType)
    : 'text';
};

const normalizeInputType = (value: unknown): string => {
  const inputType = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (inputType === 'email' || inputType === 'number' || inputType === 'date' || inputType === 'tel') {
    return inputType;
  }
  if (inputType === 'url') {
    return 'url';
  }
  if (inputType === 'file') {
    return 'file';
  }
  if (inputType === 'hidden' || inputType === 'password' || inputType === 'search') {
    return 'text';
  }
  if (inputType === 'text') {
    return 'text';
  }

  return 'text';
};

interface FormValidationDetail {
  field: string;
  message: string;
}

interface ElementRendererContext {
  isPreview?: boolean;
  siteId?: string;
  pageId?: string;
  postId?: string;
}

interface ElementRendererProps extends ElementRendererContext {
  element: CanvasElement;
}

interface SlateNode {
  type?: string;
  text?: string;
  children?: unknown[];
}

function getLength(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) {
    return fallback;
  }

  return typeof value === 'number' ? `${value}px` : `${value}`;
}

function getBoolean(value: unknown): boolean {
  return Boolean(value);
}

function getBooleanWithFallback(value: unknown, fallback: boolean): boolean {
  return value === undefined || value === null ? fallback : parseBooleanSetting(value, fallback);
}

function parseBooleanSetting(value: unknown, fallback: boolean): boolean {
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
}

function parseCommentPayload(props: Record<string, unknown>): CommentFormPayload {
  const moderationValue = getNameClass(props.commentModerationMode);

  return {
    moderationMode: moderationValue === 'auto-approve' ? 'auto-approve' : 'manual',
    requireName: parseBooleanSetting(props.commentRequireName, true),
    requireEmail: parseBooleanSetting(props.commentRequireEmail, false),
    allowGuests: parseBooleanSetting(props.commentAllowGuests, true),
    allowReplies: parseBooleanSetting(props.commentAllowReplies, true),
    sort: getNameClass(props.commentSortOrder) === 'oldest' ? 'oldest' : 'newest',
  };
}

function getCommentApiPath(siteId?: string, pageId?: string, postId?: string): string {
  if (!siteId) {
    return '';
  }

  if (pageId) {
    return `/api/sites/${siteId}/pages/${pageId}/comments`;
  }

  if (postId) {
    return `/api/sites/${siteId}/blog/${postId}/comments`;
  }

  return '';
}

function getSafeTag(value: unknown): keyof JSX.IntrinsicElements {
  const candidate = typeof value === 'string' ? value.trim() : 'span';
  const allowedTags = ['span', 'p', 'div', 'label', 'strong', 'em', 'small'];
  return (allowedTags.includes(candidate) ? candidate : 'span') as keyof JSX.IntrinsicElements;
}

function getSafeResize(value: unknown): React.CSSProperties['resize'] {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return ['none', 'both', 'horizontal', 'vertical', 'block', 'inline'].includes(candidate)
    ? candidate as React.CSSProperties['resize']
    : 'vertical';
}

function getTypographyStyle(props: Record<string, unknown>): React.CSSProperties {
  return {
    fontFamily: getNameClass(props.fontFamily),
    fontSize: getLength(props.fontSize),
    fontWeight: getNameClass(props.fontWeight),
    color: getNameClass(props.color),
    textAlign: props.textAlign as React.CSSProperties['textAlign'] || 'left',
    lineHeight: getLength(props.lineHeight, 'normal'),
    textTransform: getNameClass(props.textTransform),
    letterSpacing: getLength(props.letterSpacing),
    wordSpacing: getLength(props.wordSpacing),
    textShadow: getNameClass(props.textShadow),
    textIndent: getLength(props.textIndent),
    textDecoration: getNameClass(props.textDecoration),
    fontStyle: getNameClass(props.fontStyle),
  };
}

function parseOptionValues(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
  const parsed = values
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      if (item && typeof item === 'object' && 'value' in item) {
        const value = (item as { value?: unknown }).value;
        return typeof value === 'string' ? value.trim() : getNameClass(value);
      }

      if (item && typeof item === 'object' && 'label' in item) {
        const label = (item as { label?: unknown }).label;
        return typeof label === 'string' ? label.trim() : getNameClass(label);
      }

      return getNameClass(item);
    })
    .filter((item) => item.length > 0)
    .map((item) => item.trim());

  return Array.from(new Set(parsed.filter((item) => item.length > 0)));
}

function parseFormValidationDetails(raw: unknown): FormValidationDetail[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const detail = item as { field?: unknown; message?: unknown; code?: unknown };
      const field = parseAttributeString(detail.field);
      const message = parseAttributeString(detail.message);

      if (!field || !message) {
        return null;
      }

      return { field, message };
    })
    .filter((detail): detail is FormValidationDetail => Boolean(detail));
}

function parseAttributeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }

  return undefined;
}

function parseNumericAttribute(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const raw = parseAttributeString(value);
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFormInputValueList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [getNameClass(entry)]))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  const rawText = parseAttributeString(raw);
  if (!rawText) {
    return [];
  }

  return rawText
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseNavigationItems(raw: unknown): Array<{ label: string; href: string }> {
  const entries = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];

  return entries
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const [labelPart, ...hrefParts] = entry.split(':');
        const label = labelPart.trim();
        const href = hrefParts.join(':').trim() || `#${label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || index}`;
        return label ? { label, href } : null;
      }

      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const label = parseAttributeString(record.label)
          || parseAttributeString(record.title)
          || parseAttributeString(record.name)
          || `Item ${index + 1}`;
        const href = parseAttributeString(record.href)
          || parseAttributeString(record.url)
          || parseAttributeString(record.path)
          || '#';
        return { label, href };
      }

      return null;
    })
    .filter((item): item is { label: string; href: string } => Boolean(item));
}

function getNameClass(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

const getSlateText = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typed = node as SlateNode;
  if (typeof typed.text === 'string') {
    return typed.text;
  }

  if (!Array.isArray(typed.children)) {
    return '';
  }

  return typed.children.map(getSlateText).join('');
};

const extractListItemsFromSlate = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typed = node as SlateNode;
    if ((typed.type === 'li' || typed.type === 'item')) {
      const text = getSlateText(node).trim();
      items.push(text);
      return;
    }

    if (typed.type === 'ul' || typed.type === 'ol') {
      if (Array.isArray(typed.children)) {
        typed.children.forEach(walk);
      }
      return;
    }

    if (Array.isArray(typed.children)) {
      typed.children.forEach(walk);
    }
  };

  value.forEach(walk);
  return items;
};

const sanitizeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const DEFAULT_IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
const IFRAME_LOADING_VALUES = ['lazy', 'eager'] as const;
const IMAGE_DECODING_VALUES = ['async', 'sync', 'auto'] as const;
const IFRAME_REFERRER_POLICIES = [
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
] as const;

type IframeLoading = (typeof IFRAME_LOADING_VALUES)[number];
type IframeReferrerPolicy = (typeof IFRAME_REFERRER_POLICIES)[number];
type ImageDecoding = (typeof IMAGE_DECODING_VALUES)[number];

const normalizeIframeAllow = (value: unknown): string => sanitizeText(value) || DEFAULT_IFRAME_ALLOW;

const normalizeIframeSandbox = (value: unknown): string | undefined => sanitizeText(value) || undefined;

const normalizeIframeLoading = (value: unknown): IframeLoading => {
  const normalized = sanitizeText(value).toLowerCase();
  return IFRAME_LOADING_VALUES.includes(normalized as IframeLoading)
    ? normalized as IframeLoading
    : 'lazy';
};

const normalizeImageDecoding = (value: unknown): ImageDecoding => {
  const normalized = sanitizeText(value).toLowerCase();
  return IMAGE_DECODING_VALUES.includes(normalized as ImageDecoding)
    ? normalized as ImageDecoding
    : 'auto';
};

const normalizeIframeReferrerPolicy = (value: unknown): IframeReferrerPolicy | undefined => {
  const normalized = sanitizeText(value).toLowerCase();
  return IFRAME_REFERRER_POLICIES.includes(normalized as IframeReferrerPolicy)
    ? normalized as IframeReferrerPolicy
    : undefined;
};

const buildContactShareOverride = (props: Record<string, unknown>) => {
  const hasAnySetting =
    typeof props.contactShareEnabled === 'boolean' ||
    typeof props.contactShareNameField === 'string' ||
    typeof props.contactShareEmailField === 'string' ||
    typeof props.contactSharePhoneField === 'string' ||
    typeof props.contactShareNotesField === 'string' ||
    props.contactShareDedupeByEmail !== undefined;

  if (!hasAnySetting) {
    return undefined;
  }

  return {
    enabled:
      typeof props.contactShareEnabled === 'boolean' ? props.contactShareEnabled : undefined,
    nameField:
      typeof props.contactShareNameField === 'string' ? props.contactShareNameField : undefined,
    emailField:
      typeof props.contactShareEmailField === 'string' ? props.contactShareEmailField : undefined,
    phoneField:
      typeof props.contactSharePhoneField === 'string' ? props.contactSharePhoneField : undefined,
    notesField:
      typeof props.contactShareNotesField === 'string' ? props.contactShareNotesField : undefined,
    dedupeByEmail:
      typeof props.contactShareDedupeByEmail === 'boolean' ? props.contactShareDedupeByEmail : undefined,
  };
};

const buildCommentThreads = (comments: CommentItem[]) => {
  const map = new Map<string, CommentItem & { replies?: CommentItem[] }>();
  const roots: (CommentItem & { replies?: CommentItem[] })[] = [];

  comments.forEach((comment) => {
    map.set(comment.id, { ...comment, replies: [] });
  });

  map.forEach((comment) => {
    if (!comment.parentId) {
      roots.push(comment);
      return;
    }

    const parent = map.get(comment.parentId);
    if (!parent) {
      roots.push(comment);
      return;
    }

    parent.replies = [...(parent.replies || []), comment];
  });

  return roots;
};

const DEFAULT_COMMENT_REPORT_REASONS = [
  'spam',
  'harassment',
  'abuse',
  'hate-speech',
  'off-topic',
  'copyright',
  'privacy',
  'other',
];

const normalizeEmbedUrl = (raw: unknown): string => {
  const source = sanitizeText(raw);
  if (!source) {
    return '';
  }

  const iframeMatch = source.match(/<iframe[^>]*src=(\"|')([^\"']+)\1/i);
  const src = iframeMatch ? iframeMatch[2] : source;

  const parsed = (() => {
    try {
      return new URL(src);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(src)) {
      return `https://www.youtube.com/embed/${src}`;
    }

    return src.startsWith('//') ? `https:${src}` : src;
  }

  const host = parsed.host.toLowerCase();

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    const videoId = parsed.searchParams.get('v')
      || (parsed.pathname.split('/').pop() || '')
      || parsed.searchParams.get('feature');

    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
  }

  if (host.includes('vimeo.com')) {
    const videoId = parsed.pathname.replace(/\//g, '').split('?')[0];
    if (videoId) {
      return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  if (host.includes('google.com') && host.includes('maps')) {
    if (parsed.searchParams.has('output')) {
      return source;
    }
    if (parsed.searchParams.has('q') || parsed.searchParams.has('ll') || parsed.searchParams.has('pb')) {
      return `${source}${source.includes('?') ? '&' : '?'}output=embed`;
    }
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
};

const normalizeMapZoom = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? parseInt(value, 10)
      : NaN;

  return Number.isFinite(parsed) ? Math.max(1, Math.min(20, parsed)) : undefined;
};

const appendMapZoom = (url: string, zoom: unknown): string => {
  const normalizedZoom = normalizeMapZoom(zoom);
  if (!normalizedZoom) {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('z', String(normalizedZoom));
    return parsed.toString();
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}z=${normalizedZoom}`;
  }
};

const normalizeMapUrl = (addressOrUrl: unknown, zoom?: unknown): string => {
  const source = sanitizeText(addressOrUrl);
  if (!source) {
    return '';
  }

  const parsed = (() => {
    try {
      return new URL(source);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    return appendMapZoom(`https://www.google.com/maps?q=${encodeURIComponent(source)}&output=embed`, zoom);
  }

  const host = parsed.host.toLowerCase();
  if (host.includes('google.com') && host.includes('maps')) {
    if (parsed.searchParams.has('output')) {
      return appendMapZoom(source, zoom);
    }
    if (parsed.searchParams.has('q')) {
      return appendMapZoom(`${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}&output=embed`, zoom);
    }
    if (parsed.searchParams.has('ll') || parsed.searchParams.has('pb')) {
      return appendMapZoom(`${parsed.toString()}&output=embed`, zoom);
    }
  }

  return appendMapZoom(`https://www.google.com/maps?q=${encodeURIComponent(source)}&output=embed`, zoom);
};

/**
 * Render a text element
 */
function TextElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return React.createElement(
    getSafeTag(props.tag),
    {
      style: {
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      },
      dangerouslySetInnerHTML: { __html: (props.content as string) || '' },
    },
  );
}

/**
 * Render an icon/symbol element
 */
function IconElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const label = getNameClass(props.ariaLabel);
  const title = getNameClass(props.title);

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      title={title || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: getLength(props.size, '24px'),
        lineHeight: 1,
        color: getNameClass(props.color) || '#374151',
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {getNameClass(props.icon) || '*'}
    </span>
  );
}

/**
 * Render a heading element
 */
function HeadingElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const level =
    (typeof props.level === 'string' && /^h[1-6]$/i.test(props.level)
      ? props.level
      : `h${Number(props.level || 1) || 1}`) || 'h1';
  const Tag = level as keyof JSX.IntrinsicElements;

  return (
    <Tag
      style={{
        margin: 0,
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {props.content as string}
    </Tag>
  );
}

/**
 * Render an image element
 */
function ImageElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src as string}
      alt={getNameClass(props.alt) || ''}
      title={getNameClass(props.title) || undefined}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        objectFit: (props.objectFit as React.CSSProperties['objectFit']) || 'cover',
        objectPosition: getNameClass(props.objectPosition) || 'center center',
        borderRadius: getNameClass(props.borderRadius),
        ...styles,
      }}
      loading={normalizeIframeLoading(props.loading)}
      decoding={normalizeImageDecoding(props.decoding)}
      referrerPolicy={normalizeIframeReferrerPolicy(props.referrerPolicy)}
    />
  );
}

/**
 * Render a video element
 */
function VideoElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;
  const autoPlay = getBooleanWithFallback(props.autoplay ?? props.autoPlay, false);
  const muted = getBooleanWithFallback(props.muted, autoPlay);

  return (
    <video
      src={props.src as string}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      poster={getNameClass(props.poster) || undefined}
      autoPlay={autoPlay}
      loop={getBooleanWithFallback(props.loop, false)}
      muted={muted}
      controls={getBooleanWithFallback(props.controls, true)}
      style={{
        objectFit: (props.objectFit as React.CSSProperties['objectFit']) || 'cover',
        ...styles,
      }}
      playsInline={getBooleanWithFallback(props.playsInline, true)}
    />
  );
}

/**
 * Render a button element
 */
function ButtonElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const buttonType = props.type === 'submit' || props.type === 'reset' ? props.type : 'button';
  const isSubmit = buttonType === 'submit';
  const target = getNameClass(props.target) || undefined;
  const rel = getNameClass(props.rel) || (target === '_blank' ? 'noopener noreferrer' : undefined);
  const title = getNameClass(props.title) || undefined;
  const ariaLabel = getNameClass(props.ariaLabel) || undefined;
  const buttonStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: getLength(props.padding, '12px 24px'),
    backgroundColor: getNameClass(props.backgroundColor) || '#3b82f6',
    color: getNameClass(props.color) || '#ffffff',
    border: getNameClass(props.border) || 'none',
    borderRadius: getLength(props.borderRadius, '8px'),
    fontSize: getLength(props.fontSize, '16px'),
    fontWeight: getNameClass(props.fontWeight) || '500',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    ...styles,
    ...getTypographyStyle(props as Record<string, unknown>),
  };

  const buttonText = getNameClass(props.content) || getNameClass(props.label) || 'Button';

  if (props.href && !isSubmit) {
    return (
      <a
        href={(props.href as string) || '#'}
        target={target}
        rel={rel}
        title={title}
        aria-label={ariaLabel}
        style={buttonStyles}
      >
        {buttonText}
      </a>
    );
  }

  return (
    <button
      type={buttonType as 'submit' | 'reset' | 'button'}
      title={title}
      aria-label={ariaLabel}
      style={buttonStyles}
    >
      {buttonText}
    </button>
  );
}

/**
 * Render a container/section element
 */
function ContainerElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;

  return (
    <div
      style={{
        display: (props.display as React.CSSProperties['display']) || 'flex',
        flexDirection: (props.flexDirection as React.CSSProperties['flexDirection']) || 'column',
        alignItems: props.alignItems as React.CSSProperties['alignItems'],
        justifyContent: props.justifyContent as React.CSSProperties['justifyContent'],
        gap: getLength(props.gap),
        padding: getLength(props.padding),
        backgroundColor: getNameClass(props.backgroundColor),
        backgroundImage: props.backgroundImage ? `url(${props.backgroundImage as string})` : undefined,
        backgroundSize: (props.backgroundSize as string) || 'cover',
        backgroundPosition: (props.backgroundPosition as string) || 'center',
        borderRadius: getLength(props.borderRadius),
        ...styles,
      }}
      aria-label={getNameClass(props.ariaLabel)}
    >
      {children?.map((child) => (
        <ElementRenderer
          key={child.id}
          element={child}
          isPreview={isPreview}
          siteId={siteId}
          pageId={pageId}
          postId={postId}
        />
      ))}
    </div>
  );
}

/**
 * Render a navigation element
 */
function NavElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;
  const items = parseNavigationItems(props.navItems);
  const isVertical = props.navDirection === 'vertical';

  return (
    <nav
      aria-label={getNameClass(props.ariaLabel) || 'Page navigation'}
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: props.alignItems as React.CSSProperties['alignItems'] || (isVertical ? 'stretch' : 'center'),
        justifyContent: props.justifyContent as React.CSSProperties['justifyContent'] || (isVertical ? 'flex-start' : 'center'),
        gap: getLength(props.gap, '18px'),
        padding: getLength(props.padding),
        backgroundColor: getNameClass(props.backgroundColor),
        color: getNameClass(props.color) || '#111827',
        borderRadius: getLength(props.borderRadius),
        ...styles,
      }}
    >
      {children && children.length > 0 ? children.map((child) => (
        <ElementRenderer
          key={child.id}
          element={child}
          isPreview={isPreview}
          siteId={siteId}
          pageId={pageId}
          postId={postId}
        />
      )) : items.map((item) => (
        <a
          key={`${item.label}-${item.href}`}
          href={item.href || '#'}
          style={{
            color: 'inherit',
            fontSize: getLength(props.fontSize, '14px'),
            fontWeight: getNameClass(props.fontWeight) || '600',
            lineHeight: getLength(props.lineHeight, '1.2'),
            textDecoration: getNameClass(props.textDecoration) || 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * Render a column layout element
 */
function ColumnsElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;
  const columnCount = Math.max(1, Math.min(6, Number(props.columns) || 2));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        gap: getLength(props.gap, '16px'),
        width: '100%',
        height: '100%',
        alignItems: props.alignItems as React.CSSProperties['alignItems'],
        justifyContent: props.justifyContent as React.CSSProperties['justifyContent'],
        padding: getLength(props.padding),
        backgroundColor: getNameClass(props.backgroundColor),
        borderRadius: getLength(props.borderRadius),
        ...styles,
      }}
      aria-label={getNameClass(props.ariaLabel)}
    >
      {children?.map((child) => (
        <ElementRenderer
          key={child.id}
          element={child}
          isPreview={isPreview}
          siteId={siteId}
          pageId={pageId}
          postId={postId}
        />
      ))}
    </div>
  );
}

/**
 * Render a spacer element
 */
function SpacerElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: getNameClass(props.backgroundColor),
        borderRadius: getLength(props.borderRadius),
        ...styles,
      }}
    />
  );
}

/**
 * Render a divider element
 */
function DividerElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return (
    <hr
      style={{
        width: '100%',
        height: getLength(props.thickness, '1px'),
        border: 'none',
        borderTop: `${getLength(props.thickness, '1px')} ${getNameClass(props.borderStyle) || 'solid'} ${getNameClass(props.borderColor) || getNameClass(props.color) || '#e5e7eb'}`,
        margin: `${getLength(props.margin, '16px')} 0`,
        backgroundColor: 'transparent',
        ...styles,
      }}
    />
  );
}

/**
 * Render an embed/iframe element
 */
function EmbedElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;
  const src = normalizeEmbedUrl(getNameClass(props.src) || getNameClass(props.url));

  if (!src) {
    return <p>Missing embed source</p>;
  }

  return (
    <iframe
      title={getNameClass(props.title) || 'Embedded content'}
      src={src}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        border: 'none',
        width: '100%',
        ...styles,
      }}
      allow={normalizeIframeAllow(props.allow)}
      allowFullScreen={getBooleanWithFallback(props.allowFullScreen, true)}
      loading={normalizeIframeLoading(props.loading)}
      referrerPolicy={normalizeIframeReferrerPolicy(props.referrerPolicy)}
      sandbox={normalizeIframeSandbox(props.sandbox)}
    />
  );
}

/**
 * Render raw HTML element
 */
function HtmlElement({ element }: ElementRendererProps) {
  const { props } = element;

  return <div dangerouslySetInnerHTML={{ __html: (props.html as string) || '' }} />;
}

/**
 * Render a list element
 */
function ListElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const options = (parseOptionValues(props.items).length > 0
    ? parseOptionValues(props.items)
    : extractListItemsFromSlate(props.content));
  const listTypeFromType = getNameClass(props.listType);
  const listType = listTypeFromType === 'number' || listTypeFromType === 'ordered' ? 'ol' : 'ul';
  const listIndent = getLength(props.listIndent, '0');
  const listMarker = getNameClass(props.listMarker) || (listType === 'ol' ? 'decimal' : 'disc');

  return React.createElement(
    listType,
    {
      style: {
        margin: 0,
        marginLeft: listIndent,
        paddingLeft: '20px',
        listStyleType: listMarker,
        listStylePosition: 'inside',
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      },
    },
    ...(options.length > 0
      ? options.map((item, index) => <li key={`${element.id}-${item}-${index}`}>{item}</li>)
      : [<li key={`${element.id}-empty`}>List item</li>]),
  );
}

const repeaterRecordValue = (
  record: Record<string, unknown>,
  field: unknown,
  fallbackFields: string[],
): string => {
  const values = isRecord(record.values) ? record.values : {};
  const fieldKey = typeof field === 'string' && field.length > 0
    ? field
    : fallbackFields.find((key) => values[key] !== undefined);
  const value = fieldKey ? values[fieldKey] : undefined;

  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => repeaterRecordValue({ values: { value: item } }, 'value', [])).filter(Boolean).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

/**
 * Render a collection-backed repeater/list element.
 */
function RepeaterElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const records = Array.isArray(props.records)
    ? props.records.filter(isRecord)
    : [];
  const columns = Math.max(1, Math.min(6, typeof props.columns === 'number' ? props.columns : 3));
  const gap = getLength(props.gap, '16px');
  const titleField = typeof props.titleField === 'string' ? props.titleField : 'title';
  const descriptionField = typeof props.descriptionField === 'string' ? props.descriptionField : 'summary';
  const emptyMessage = getNameClass(props.emptyMessage) || 'No records yet.';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        width: '100%',
        height: '100%',
        alignContent: 'start',
        ...styles,
      }}
      data-backy-repeater={getNameClass(props.datasetId) || element.id}
    >
      {records.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 16 }}>{emptyMessage}</div>
      ) : records.map((record) => {
        const recordId = typeof record.id === 'string' ? record.id : `${element.id}-record`;
        const title = repeaterRecordValue(record, titleField, ['title', 'name', 'label', 'slug']);
        const description = repeaterRecordValue(record, descriptionField, ['summary', 'description', 'excerpt', 'body']);
        const href = typeof record.href === 'string' ? record.href : '#';

        return (
          <a
            key={`${element.id}-${recordId}`}
            href={href}
            style={{
              display: 'block',
              minWidth: 0,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 18,
              textDecoration: 'none',
              color: 'inherit',
              background: '#fff',
              boxShadow: '0 12px 28px rgba(15,23,42,0.08)',
            }}
          >
            <div style={{ fontSize: 18, lineHeight: 1.25, fontWeight: 700, color: '#0f172a' }}>
              {title || getNameClass(record.slug) || 'Untitled'}
            </div>
            {description ? (
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.45, color: '#475569' }}>
                {description}
              </div>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}

/**
 * Render a quote element
 */
function QuoteElement({ element }: ElementRendererProps) {
  const { props, styles } = element;

  return (
    <blockquote
      style={{
        margin: 0,
        paddingLeft: '1rem',
        borderLeft: '4px solid rgba(0,0,0,0.2)',
        color: getNameClass(props.color) || '#334155',
        fontStyle: 'italic',
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {getNameClass(props.content) || getNameClass(props.text) || ''}
    </blockquote>
  );
}

/**
 * Render a link-like element
 */
function LinkElement({ element, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles } = element;
  const linkText = getNameClass(props.content) || getNameClass(props.label) || 'Link';
  const target = getNameClass(props.target) || undefined;
  const rel = getNameClass(props.rel) || (target === '_blank' ? 'noopener noreferrer' : undefined);
  const title = getNameClass(props.title) || undefined;
  const ariaLabel = getNameClass(props.ariaLabel) || undefined;

  return (
    <a
      href={getNameClass(props.href) || '#'}
      target={target}
      rel={rel}
      title={title}
      aria-label={ariaLabel}
      style={{
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
        display: 'inline-block',
      }}
    >
      {linkText}
    </a>
  );
}

/**
 * Render a form element
 */
function FormElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitValidation, setSubmitValidation] = useState<FormValidationDetail[]>([]);
  const [submitMeta, setSubmitMeta] = useState<{
    status: string;
    submissionId?: string;
  } | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const formId = typeof props.formId === 'string' ? props.formId : undefined;
  const fallbackFormId = getNameClass(formId || element.id).trim();
  const resolvedFormId = fallbackFormId.length > 0 ? fallbackFormId : `form-${Math.random().toString(36).slice(2, 8)}`;
  const configuredAction =
    (typeof props.action as string) ||
    (typeof props.actionUrl as string) ||
    (siteId && resolvedFormId ? `/api/sites/${siteId}/forms/${resolvedFormId}/submissions` : undefined);

  const isBackyAction = Boolean(siteId && configuredAction?.startsWith('/api/'));
  const method = ((props.method as string) || 'POST').toUpperCase();
  const enableHoneypot = Boolean(props.enableHoneypot);
  const successRedirectUrl = getNameClass(props.successRedirectUrl || props.redirectUrl);
  const successMessage =
    getNameClass((props as { successMessage?: unknown }).successMessage) ||
    'Thanks. Your message was sent.';
  const contactShareOverride = buildContactShareOverride(props as Record<string, unknown>);
  const requestId = useRef<string>(`f-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (isPreview) {
      event.preventDefault();
      return;
    }

    if (!configuredAction || method !== 'POST') {
      return;
    }

    if (!isBackyAction) {
      return;
    }

    event.preventDefault();
    setSubmitState('submitting');
    setSubmitMessage('');
    setSubmitValidation([]);

    const formData = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    const startedAt = startedAtRef.current;

    formData.forEach((value, key) => {
      const normalized = key;
      const valueAsText = value.toString();
      const existing = values[normalized];

      if (existing === undefined) {
        values[normalized] = valueAsText;
        return;
      }

      if (Array.isArray(existing)) {
        existing.push(valueAsText);
        return;
      }

      values[normalized] = [existing as string, valueAsText];
    });

    const body = {
      values,
      ...(enableHoneypot ? { honeypot: getNameClass(values.honeypot) } : {}),
      ...(contactShareOverride ? { contactShareOverride } : {}),
      startedAt,
      requestId: requestId.current,
      ...(pageId ? { pageId } : {}),
      ...(postId ? { postId } : {}),
    };

    if (enableHoneypot && typeof body.honeypot === 'string' && body.honeypot.length > 0) {
      setSubmitState('error');
      setSubmitMessage('Spam protection triggered.');
      return;
    }

    try {
      const response = await fetch(configuredAction, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      let responseBody = null;
      const rawResponse = await response.text();
      if (rawResponse.length > 0) {
        try {
          responseBody = JSON.parse(rawResponse);
        } catch {
          responseBody = { message: rawResponse };
        }
      }

      if (!response.ok) {
        setSubmitState('error');
        setSubmitValidation(parseFormValidationDetails(responseBody?.validation));
        setSubmitMessage(
          typeof responseBody?.message === 'string'
            ? responseBody.message
            : 'Something went wrong while sending the form.',
        );
        return;
      }

      setSubmitState('success');
      setSubmitValidation([]);
      const status = getNameClass(responseBody?.status) || 'approved';
      const serverMessage = getNameClass(responseBody?.message);
      setSubmitMeta({
        status,
        submissionId: getNameClass(responseBody?.submission?.id) || getNameClass(responseBody?.submissionId),
      });

      setSubmitMessage(
        serverMessage
          || (status === 'approved'
            ? successMessage
            : status === 'pending'
              ? 'Submission received. It is pending review.'
              : 'Submission accepted.'),
      );

      if (status === 'pending' && !successRedirectUrl) {
        return;
      }

      if (status === 'approved' && successRedirectUrl) {
        window.location.assign(successRedirectUrl);
      }
      event.currentTarget.reset();
    } catch {
      setSubmitState('error');
      setSubmitMessage('Could not connect to the submission endpoint.');
    }
  };

  return (
    <>
      <form
        action={configuredAction}
        method={method}
        encType="multipart/form-data"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: getLength(props.gap, '16px'),
          ...styles,
        }}
        onSubmit={handleSubmit}
      >
        {props.formTitle ? <h3>{getNameClass(props.formTitle)}</h3> : null}

        {isBackyAction && pageId ? (
          <input type="hidden" name="pageId" value={pageId} />
        ) : null}

        {isBackyAction && postId ? (
          <input type="hidden" name="postId" value={postId} />
        ) : null}

        {enableHoneypot ? (
          <input
            type="text"
            name="honeypot"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            style={{ display: 'none' }}
          />
        ) : null}

        {children?.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            isPreview={isPreview}
            siteId={siteId}
            pageId={pageId}
            postId={postId}
          />
        ))}
      </form>
      {submitMessage ? <p style={{ marginTop: '8px' }}>{submitMessage}</p> : null}
      {submitValidation.length > 0 ? (
        <ul style={{ marginTop: '8px', marginBottom: '0', paddingLeft: '20px', color: '#b91c1c' }}>
          {submitValidation.map((detail, idx) => (
            <li key={`${detail.field}-${idx}`}>
              {detail.field}: {detail.message}
            </li>
          ))}
        </ul>
      ) : null}
      {submitMeta?.submissionId ? (
        <p style={{ marginTop: '4px', fontSize: '12px', color: '#475569' }}>
          Submission ID: {submitMeta.submissionId}
        </p>
      ) : null}
      {submitState === 'submitting' ? <p style={{ marginTop: '8px' }}>Submitting…</p> : null}
    </>
  );
}

/**
 * Render a comment thread block
 */
function CommentThreadElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles } = element;
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorWebsite, setAuthorWebsite] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportReasons, setReportReasons] = useState<string[]>([...DEFAULT_COMMENT_REPORT_REASONS]);
  const [reportReasonByCommentId, setReportReasonByCommentId] = useState<Record<string, string>>({});
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [commenterIdentity, setCommenterIdentity] = useState<CommentIdentity | null>(readCommentIdentity());
  const requestIdRef = useRef<string>(`c-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);
  const startedAtRef = useRef<number>(Date.now());

  const commentApiPath = getCommentApiPath(siteId, pageId, postId);
  const policy = parseCommentPayload(props as Record<string, unknown>);
  const canSubmitAsSignedIn = Boolean(commenterIdentity?.userId);
  const canSubmitComments = policy.allowGuests || canSubmitAsSignedIn;
  const canSubmitReplies = policy.allowReplies && canSubmitComments;

  useEffect(() => {
    requestIdRef.current = `c-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    startedAtRef.current = Date.now();

    const syncIdentity = () => {
      const identity = readCommentIdentity();
      setCommenterIdentity(identity);

      if (identity?.name) {
        setAuthorName((current) => current || identity.name || '');
      }
      if (identity?.email) {
        setAuthorEmail((current) => current || identity.email || '');
      }
      if (identity?.website) {
        setAuthorWebsite((current) => current || identity.website || '');
      }
    };

    syncIdentity();
    window.addEventListener('storage', syncIdentity);
    window.addEventListener('popstate', syncIdentity);

    return () => {
      window.removeEventListener('storage', syncIdentity);
      window.removeEventListener('popstate', syncIdentity);
    };
  }, [siteId, pageId, postId]);

  const fetchComments = async () => {
    if (!commentApiPath || isPreview) {
      return;
    }

    try {
      setLoading(true);
      setLoadError('');

      const query = new URLSearchParams({
        status: 'approved',
        sort: policy.sort,
        commentThreadId: element.id,
      });

      const response = await fetch(`${commentApiPath}?${query.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-backy-preview': isPreview ? '1' : '0',
        },
      });
      const payload = (await response.json().catch(() => null)) as {
        comments?: CommentItem[];
        error?: string;
        details?: Record<string, string>;
        message?: string;
      } | null;
      if (!response.ok) {
        setLoadError(extractApiErrorMessage(payload, 'Unable to load comments.'));
        return;
      }

      const nextComments = Array.isArray(payload?.comments) ? payload.comments : [];
      const sorted = [...nextComments].sort((a, b) =>
        policy.sort === 'oldest'
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setComments(sorted);
    } catch {
      setLoadError('Unable to load comments.');
    } finally {
      setLoading(false);
    }
  };

  const loadReportReasons = async () => {
    if (!siteId) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${siteId}/comments/report-reasons`);
      const payload = (await response.json().catch(() => null)) as { reasons?: string[] } | null;
      if (!response.ok) {
        return;
      }

      if (Array.isArray(payload?.reasons)) {
        const nextReasons = payload.reasons
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0);
        if (nextReasons.length > 0) {
          setReportReasons(nextReasons);
        }
      }
    } catch {
      // fallback to defaults
    }
  };

  const reportComment = async (commentId: string) => {
    if (!commentId || isPreview || !siteId) {
      return;
    }

    const availableReasons = reportReasons.length > 0 ? reportReasons : [...DEFAULT_COMMENT_REPORT_REASONS];
    const reason = reportReasonByCommentId[commentId] || availableReasons[0];
    if (!reason) {
      setSubmitMessage('Please choose a reason before reporting.');
      return;
    }

    setSubmitMessage('');
    setStatusMessage('');
    setReportingCommentId(commentId);

    try {
      const response = await fetch(`/api/sites/${siteId}/comments/${commentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          actor: 'public',
          requestId: requestIdRef.current,
        }),
      });

      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setSubmitMessage(extractApiErrorMessage(payload, 'Unable to report comment.'));
        return;
      }

      setStatusMessage('Report submitted.');
      await fetchComments();
    } catch {
      setSubmitMessage('Unable to report comment right now.');
    } finally {
      setReportingCommentId(null);
    }
  };

  const postComment = async (payload: {
    content: string;
    authorName?: string;
    authorEmail?: string;
    authorWebsite?: string;
    parentId?: string | null;
  }) => {
    if (!commentApiPath || isPreview) {
      return;
    }

    setSubmitMessage('');
    setStatusMessage('');

    if (!payload.content.trim()) {
      setSubmitMessage('Comment content is required.');
      return;
    }

    const resolvedAuthorName = payload.authorName?.trim() || commenterIdentity?.name || '';
    const resolvedAuthorEmail = payload.authorEmail?.trim() || commenterIdentity?.email || '';
    const resolvedAuthorWebsite = payload.authorWebsite?.trim() || commenterIdentity?.website || '';

    if (!canSubmitComments) {
      setSubmitMessage('Guest posting is disabled for this comment thread. Sign in is required for this form.');
      return;
    }

    if (policy.requireName && !resolvedAuthorName) {
      setSubmitMessage('Name is required.');
      return;
    }

    if (policy.requireEmail && !resolvedAuthorEmail) {
      setSubmitMessage('Email is required.');
      return;
    }

    if (payload.parentId && !policy.allowReplies) {
      setSubmitMessage('Replies are disabled for this thread.');
      return;
    }

    if (payload.parentId && !canSubmitComments) {
      setSubmitMessage('You need to sign in to reply in this thread.');
      return;
    }

    startedAtRef.current = Date.now();
    requestIdRef.current = `c-${Math.random().toString(36).slice(2, 10)}-${startedAtRef.current}`;

    const requestBody = {
      ...payload,
      commentThreadId: element.id,
      requestId: requestIdRef.current,
      startedAt: startedAtRef.current,
      honeypot: '',
      moderationMode: policy.moderationMode,
      commentModerationMode: policy.moderationMode,
      commentRequireName: policy.requireName,
      commentRequireEmail: policy.requireEmail,
      commentAllowGuests: policy.allowGuests,
      commentAllowReplies: policy.allowReplies,
      userId: commenterIdentity?.userId,
      authorName: resolvedAuthorName,
      authorEmail: resolvedAuthorEmail,
      authorWebsite: resolvedAuthorWebsite,
    };

    try {
      setIsSubmitting(true);
      const response = await fetch(commentApiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const payloadResponse = await response.json().catch(() => null);
      if (!response.ok) {
        setSubmitMessage(extractApiErrorMessage(payloadResponse, 'Unable to submit comment.'));
        return;
      }

      setStatusMessage(
        (payloadResponse as { message?: string })?.message || (policy.moderationMode === 'auto-approve'
          ? 'Comment posted.'
          : 'Comment submitted for review.'),
      );

      if (payload.parentId) {
        setReplyContent((previous) => ({ ...previous, [payload.parentId as string]: '' }));
        setReplyToId(null);
      } else {
        setContent('');
        setAuthorName('');
        setAuthorEmail('');
        setAuthorWebsite('');
      }

      await fetchComments();
    } catch {
      setSubmitMessage('Failed to submit comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitTopLevel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void postComment({
      content,
      authorName,
      authorEmail,
      authorWebsite,
      parentId: null,
    });
  };

  const submitReply = (parentId: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = replyContent[parentId] || '';
    if (!value.trim()) {
      setSubmitMessage('Reply content is required.');
      return;
    }
    void postComment({
      content: value,
      parentId,
      authorName,
      authorEmail,
      authorWebsite,
    });
  };

  useEffect(() => {
    void loadReportReasons();
    void fetchComments();
  }, [commentApiPath, policy.sort, isPreview, siteId]);

  const renderCommentTree = (nodes: (CommentItem & { replies?: CommentItem[] })[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {nodes.map((comment) => {
        const hasReplies = comment.replies && comment.replies.length > 0;
        const replyTargetContent = replyContent[comment.id] || '';
        const showReplyForm = replyToId === comment.id;
        const reasons = reportReasons.length > 0 ? reportReasons : [...DEFAULT_COMMENT_REPORT_REASONS];
        const selectedReason = reportReasonByCommentId[comment.id] || reasons[0];
        const currentReportCount = comment.reportCount || 0;
        const reasonsText = comment.reportReasons?.length ? `(${comment.reportReasons.join(', ')})` : '';

        return (
          <div key={comment.id} style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: '12px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>
              {comment.authorName || 'Anonymous'}
            </p>
            <p style={{ marginTop: '4px', marginBottom: '4px' }}>{comment.content}</p>
            <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>
              {comment.requestId || 'No requestId'} • reports: {currentReportCount} {reasonsText}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              {new Date(comment.createdAt).toLocaleString()}
            </p>
            {policy.allowReplies && canSubmitReplies ? (
              <button
                type="button"
                onClick={() => setReplyToId(showReplyForm ? null : comment.id)}
                style={{ marginTop: '4px', fontSize: '12px', border: 'none', color: '#2563eb', background: 'transparent' }}
                disabled={isSubmitting || !canSubmitComments}
              >
                {showReplyForm ? 'Cancel reply' : 'Reply'}
              </button>
            ) : null}
            {showReplyForm ? (
              <form onSubmit={(event) => submitReply(comment.id, event)} style={{ marginTop: '8px' }}>
                <textarea
                  name={`reply-${comment.id}`}
                  value={replyTargetContent}
                  onChange={(event) =>
                    setReplyContent((previous) => ({ ...previous, [comment.id]: event.target.value }))
                  }
                  rows={3}
                  style={{ width: '100%', marginBottom: '6px' }}
                  placeholder="Write a reply"
                  disabled={isSubmitting || !canSubmitComments}
                />
                <button
                  type="submit"
                  style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#3b82f6', color: '#fff' }}
                  disabled={isSubmitting || !canSubmitComments}
                >
                  {isSubmitting ? 'Submitting…' : 'Post reply'}
                </button>
              </form>
            ) : null}
            {hasReplies ? (
              <div style={{ marginTop: '8px' }}>
                {renderCommentTree(comment.replies || [])}
              </div>
            ) : null}
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
                <span>Report</span>
                <select
                  value={selectedReason}
                  onChange={(event) =>
                    setReportReasonByCommentId((previous) => ({
                      ...previous,
                      [comment.id]: event.target.value,
                    }))
                  }
                  disabled={isSubmitting}
                  style={{ padding: '4px 6px' }}
                >
                  {reasons.map((reason) => (
                    <option key={`${comment.id}-${reason}`} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void reportComment(comment.id)}
                style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#dc2626', color: '#fff' }}
                disabled={isSubmitting || reportingCommentId === comment.id}
              >
                {reportingCommentId === comment.id ? 'Reporting…' : 'Report'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const roots = buildCommentThreads(comments);

  return (
    <section style={{ ...styles }}>
      <h4 style={{ margin: '0 0 12px' }}>{String(props.commentTitle || 'Comments')}</h4>
      {isPreview ? (
        <p style={{ color: '#64748b', fontSize: '12px' }}>
          Preview mode: comment thread data is not refreshed.
        </p>
      ) : null}
      {loading ? <p>Loading comments…</p> : null}
      {loadError ? <p style={{ color: '#b91c1c' }}>{loadError}</p> : null}
      {submitMessage ? <p style={{ color: '#b91c1c' }}>{submitMessage}</p> : null}
      {statusMessage ? <p style={{ color: '#166534' }}>{statusMessage}</p> : null}

      <div>
        {renderCommentTree(roots as (CommentItem & { replies?: CommentItem[] })[])}
      </div>

      <form onSubmit={submitTopLevel} style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!canSubmitComments ? (
              <p style={{ margin: 0, color: '#b91c1c' }}>
                Guest posting is disabled for this comment thread. Sign in is required for this form.
              </p>
            ) : null}
        <textarea
          placeholder="Write a comment"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={4}
          disabled={isPreview || isSubmitting || !canSubmitComments}
          style={{ width: '100%' }}
        />
        {policy.requireName ? (
          <input
            type="text"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Your name"
            disabled={isPreview || isSubmitting || !canSubmitComments}
            style={{ width: '100%' }}
          />
        ) : (
          <input
            type="text"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Your name (optional)"
            disabled={isPreview || isSubmitting || !canSubmitComments}
            style={{ width: '100%' }}
          />
        )}
        {policy.requireEmail ? (
          <input
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.target.value)}
            placeholder="Email"
            disabled={isPreview || isSubmitting || !canSubmitComments}
            style={{ width: '100%' }}
          />
        ) : (
          <input
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.target.value)}
            placeholder="Email (optional)"
            disabled={isPreview || isSubmitting || !canSubmitComments}
            style={{ width: '100%' }}
          />
        )}
        <input
          type="text"
          value={authorWebsite}
          onChange={(event) => setAuthorWebsite(event.target.value)}
          placeholder="Website (optional)"
          disabled={isPreview || isSubmitting || !canSubmitComments}
          style={{ width: '100%' }}
        />
        <button
          type="submit"
          style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            background: '#3b82f6',
            color: '#fff',
          }}
          disabled={isPreview || isSubmitting || !canSubmitComments}
        >
          {isSubmitting ? 'Submitting…' : 'Post comment'}
        </button>
      </form>
    </section>
  );
}

/**
 * Render an input element
 */
function InputElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const inputType =
    normalizeInputType(getNameClass(props.inputType) || getNameClass(props.type));
  const fieldName = getNameClass(props.name) || `field-${element.id}`;
  const minLength = parseNumericAttribute(props.minLength);
  const maxLength = parseNumericAttribute(props.maxLength);
  const label = getNameClass(props.label);
  const helpText = getNameClass(props.helpText);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: getLength(props.fieldGap, '6px'),
        width: '100%',
        height: '100%',
      }}
    >
      {label ? (
        <label
          htmlFor={`field-${element.id}`}
          style={{
            color: getNameClass(props.labelColor) || getNameClass(props.color) || '#374151',
            fontWeight: getNameClass(props.labelFontWeight) || 500,
            fontSize: getLength(props.labelFontSize, '14px'),
          }}
        >
          {label}
          {getBoolean(props.required) ? ' *' : ''}
        </label>
      ) : null}
      <input
        id={`field-${element.id}`}
        type={inputType || 'text'}
        name={fieldName}
        placeholder={getNameClass(props.placeholder)}
        required={getBoolean(props.required)}
        min={getNameClass(props.min)}
        max={getNameClass(props.max)}
        step={getNameClass(props.step)}
        pattern={getNameClass(props.pattern)}
        disabled={getBoolean(props.disabled)}
        minLength={Number.isFinite(minLength) ? minLength : undefined}
        maxLength={maxLength}
        defaultValue={getNameClass(props.defaultValue)}
        style={{
          padding: '12px 16px',
          border: getNameClass(props.border) || '1px solid #d1d5db',
          borderRadius: getLength(props.borderRadius, '8px'),
          fontSize: getLength(props.fontSize, '16px'),
          width: '100%',
          minHeight: getLength(props.inputHeight, '40px'),
          ...styles,
        }}
      />
      {helpText ? (
        <p
          style={{
            margin: 0,
            color: getNameClass(props.helpTextColor) || '#6b7280',
            fontSize: getLength(props.helpTextFontSize, '12px'),
            lineHeight: 1.4,
          }}
        >
          {helpText}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Render a textarea element
 */
function TextareaElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const rows = typeof props.rows === 'number' && Number.isFinite(props.rows)
    ? props.rows
    : parseNumericAttribute(props.rows) ?? 5;
  const minLength = parseNumericAttribute(props.minLength);
  const maxLength = parseNumericAttribute(props.maxLength);
  const fieldName = getNameClass(props.name) || `field-${element.id}`;
  const label = getNameClass(props.label);
  const helpText = getNameClass(props.helpText);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: getLength(props.fieldGap, '6px'),
        width: '100%',
        height: '100%',
      }}
    >
      {label ? (
        <label
          htmlFor={`field-${element.id}`}
          style={{
            color: getNameClass(props.labelColor) || getNameClass(props.color) || '#374151',
            fontWeight: getNameClass(props.labelFontWeight) || 500,
            fontSize: getLength(props.labelFontSize, '14px'),
          }}
        >
          {label}
          {getBoolean(props.required) ? ' *' : ''}
        </label>
      ) : null}
      <textarea
        id={`field-${element.id}`}
        name={fieldName}
        placeholder={getNameClass(props.placeholder)}
        required={getBoolean(props.required)}
        rows={Number.isFinite(rows) ? rows : 5}
        defaultValue={getNameClass(props.defaultValue)}
        disabled={getBoolean(props.disabled)}
        minLength={Number.isFinite(minLength) ? minLength : undefined}
        maxLength={maxLength}
        style={{
          padding: '12px 16px',
          border: getNameClass(props.border) || '1px solid #d1d5db',
          borderRadius: getLength(props.borderRadius, '8px'),
          fontSize: getLength(props.fontSize, '16px'),
          width: '100%',
          resize: getSafeResize(props.resize),
          ...styles,
        }}
      />
      {helpText ? (
        <p
          style={{
            margin: 0,
            color: getNameClass(props.helpTextColor) || '#6b7280',
            fontSize: getLength(props.helpTextFontSize, '12px'),
            lineHeight: 1.4,
          }}
        >
          {helpText}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Render a select element
 */
function SelectElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const options = parseOptionValues(props.options);
  const name = getNameClass(props.name) || `field-${element.id}`;
  const defaultValue = parseAttributeString(props.defaultValue);
  const label = getNameClass(props.label);
  const helpText = getNameClass(props.helpText);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: getLength(props.fieldGap, '6px'),
        width: '100%',
        height: '100%',
      }}
    >
      {label ? (
        <label
          htmlFor={`field-${element.id}`}
          style={{
            color: getNameClass(props.labelColor) || getNameClass(props.color) || '#374151',
            fontWeight: getNameClass(props.labelFontWeight) || 500,
            fontSize: getLength(props.labelFontSize, '14px'),
          }}
        >
          {label}
          {getBoolean(props.required) ? ' *' : ''}
        </label>
      ) : null}
      <select
        id={`field-${element.id}`}
        name={name}
        required={getBoolean(props.required)}
        disabled={getBoolean(props.disabled)}
        defaultValue={defaultValue || ''}
        style={{
          padding: '12px 16px',
          border: getNameClass(props.border) || '1px solid #d1d5db',
          borderRadius: getLength(props.borderRadius, '8px'),
          fontSize: getLength(props.fontSize, '16px'),
          width: '100%',
          ...styles,
        }}
      >
        {options.length === 0 ? <option value="">Select</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {helpText ? (
        <p
          style={{
            margin: 0,
            color: getNameClass(props.helpTextColor) || '#6b7280',
            fontSize: getLength(props.helpTextFontSize, '12px'),
            lineHeight: 1.4,
          }}
        >
          {helpText}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Render checkbox list and single checkbox/radio inputs
 */
function CheckboxOrRadioElement({ element, isPreview }: ElementRendererProps) {
  const { props, styles, children } = element;
  const inputType = element.type === 'checkbox' ? 'checkbox' : 'radio';
  const name = getNameClass(props.name) || `field-${element.id}`;
  const options = parseOptionValues(props.options);
  const defaultValues = toFormInputValueList(
    props.defaultValue !== undefined ? props.defaultValue : props.value
  );
  const defaultSet = new Set(defaultValues);
  const required = getBoolean(props.required);
  const label = getNameClass(props.label);
  const helpText = getNameClass(props.helpText);
  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: getLength(props.fieldGap, '8px'),
    ...styles,
  };
  const legendStyle: React.CSSProperties = {
    color: getNameClass(props.labelColor) || getNameClass(props.color) || '#374151',
    fontWeight: getNameClass(props.labelFontWeight) || 500,
    fontSize: getLength(props.labelFontSize, '14px'),
  };
  const helpStyle: React.CSSProperties = {
    margin: 0,
    color: getNameClass(props.helpTextColor) || '#6b7280',
    fontSize: getLength(props.helpTextFontSize, '12px'),
    lineHeight: 1.4,
  };

  if (inputType === 'radio') {
    const defaultValue = defaultValues[0] || getNameClass(props.value) || '';
    return (
      <div style={wrapperStyle}>
        {label ? (
          <div style={legendStyle}>
            {label}
            {required ? ' *' : ''}
          </div>
        ) : null}
        {options.length === 0 ? (
          <label style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="radio"
              name={name}
              value={defaultValue || 'on'}
              required={required}
              defaultChecked={defaultSet.has(defaultValue)}
            />
            {getNameClass(props.label) || 'Option'}
          </label>
        ) : (
          options.map((option) => (
            <label
              key={`${element.id}-${option}`}
              style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}
            >
              <input
                type="radio"
                name={name}
                value={option}
                required={required}
                defaultChecked={defaultSet.has(option)}
              />
              <span>{option}</span>
            </label>
          ))
        )}
        {helpText ? <p style={helpStyle}>{helpText}</p> : null}
        {children?.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            isPreview={Boolean(isPreview)}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
        {label ? (
          <div style={legendStyle}>
            {label}
            {required ? ' *' : ''}
          </div>
        ) : null}
        {options.length === 0 ? (
          <label style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="checkbox"
              name={name}
              value={getNameClass(props.value) || 'on'}
              required={required}
              defaultChecked={defaultSet.has(getNameClass(props.value) || 'on')}
            />
            {getNameClass(props.label) || 'Option'}
          </label>
        ) : (
          options.map((option) => (
            <label
              key={`${element.id}-${option}`}
              style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}
            >
              <input
                type="checkbox"
                name={name}
                value={option}
                defaultChecked={defaultSet.has(option)}
                required={option === options[0] && required}
              />
              <span>{option}</span>
            </label>
          ))
        )}
        {helpText ? <p style={helpStyle}>{helpText}</p> : null}
        {children?.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            isPreview={Boolean(isPreview)}
          />
        ))}
      </div>
    );
  }

/**
 * Map element renderer
 */
function MapElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;

  const src = normalizeMapUrl(getNameClass(props.src) || getNameClass(props.address) || '', props.zoom);

  if (!src) {
    return <div style={{ ...styles }}>Add a map URL or address</div>;
  }

  return (
    <iframe
      title={getNameClass(props.title) || 'Map embed'}
      src={src}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        border: 'none',
        borderRadius: getLength(props.borderRadius, '8px'),
        ...styles,
      }}
      loading={normalizeIframeLoading(props.loading)}
      allowFullScreen={getBooleanWithFallback(props.allowFullScreen, true)}
      referrerPolicy={normalizeIframeReferrerPolicy(props.referrerPolicy) || 'no-referrer'}
    />
  );
}

/**
 * Map element types to their renderer components
 */
const ELEMENT_RENDERERS: Record<
  KnownElementType,
  React.ComponentType<ElementRendererProps>
> = {
  text: TextElement,
  heading: HeadingElement,
  paragraph: TextElement,
  image: ImageElement,
  video: VideoElement,
  button: ButtonElement,
  link: LinkElement,
  container: ContainerElement,
  header: ContainerElement,
  footer: ContainerElement,
  nav: NavElement,
  section: ContainerElement,
  columns: ColumnsElement,
  spacer: SpacerElement,
  divider: DividerElement,
  icon: IconElement,
  form: FormElement,
  input: InputElement,
  textarea: TextareaElement,
  select: SelectElement,
  checkbox: CheckboxOrRadioElement,
  radio: CheckboxOrRadioElement,
  list: ListElement,
  repeater: RepeaterElement,
  table: HtmlElement,
  embed: EmbedElement,
  html: HtmlElement,
  map: MapElement,
  box: ContainerElement,
  quote: QuoteElement,
  comment: CommentThreadElement,
};

/**
 * Main element renderer - routes to specific element renderers
 */
export function ElementRenderer({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const normalizedType = normalizeRendererType(element.type);
  const Renderer = ELEMENT_RENDERERS[normalizedType];

  if (!Renderer) {
    console.warn(`Unknown element type: ${element.type}`);
    return null;
  }

  if ((element.props.hidden as boolean) === true) {
    return null;
  }

  if (element.visible === false) {
    return null;
  }

  // Build position styles for absolute positioning
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.zIndex,
    opacity:
      typeof element.props.opacity === 'number'
        ? element.props.opacity
        : typeof element.props.opacity === 'string'
          ? parseFloat(element.props.opacity as string)
          : 1,
  };

  // Add animation data attributes for GSAP hydration
  const animationAttrs = element.animation
    ? {
        'data-animation': JSON.stringify(element.animation),
        'data-animation-type': element.animation.type,
      }
    : {};

  return (
    <div
      style={positionStyles}
      data-element-id={element.id}
      data-element-type={element.type}
      {...animationAttrs}
    >
      <Renderer
        element={element}
        isPreview={isPreview}
        siteId={siteId}
        pageId={pageId}
        postId={postId}
      />
    </div>
  );
}

// ============================================================================
// PAGE RENDERER
// ============================================================================

interface PageRendererProps {
  content: PageContent;
  theme?: ThemeConfig;
  fontAssets?: FontAsset[];
  isPreview?: boolean;
  siteId?: string;
  pageId?: string;
  postId?: string;
  pageSlug?: string;
}

/**
 * Full page renderer component
 *
 * Renders all canvas elements with proper positioning and styling.
 */
export function PageRenderer({
  content,
  theme,
  fontAssets = [],
  isPreview,
  siteId,
  pageId,
  postId,
}: PageRendererProps) {
  const documentCanvasSize = isRecord(content.contentDocument?.metadata?.canvasSize)
    ? content.contentDocument.metadata.canvasSize
    : null;
  const sourceElements = useMemo(
    () => toRenderableElements(
      content.elements.length > 0
        ? content.elements
        : content.contentDocument
          ? content.contentDocument.elements as unknown as CanvasElement[]
          : [],
    ),
    [content.contentDocument, content.elements],
  );
  const canvasSize = {
    width: content.canvasSize?.width || Number(documentCanvasSize?.width) || 1200,
    height: content.canvasSize?.height || Number(documentCanvasSize?.height) || 800,
  };
  const customCSS = content.customCSS || (
    typeof content.contentDocument?.metadata?.customCSS === 'string'
      ? content.contentDocument.metadata.customCSS
      : undefined
  );
  const [scale, setScale] = useState(1);
  const [activeBreakpoint, setActiveBreakpoint] = useState<RenderBreakpoint>('desktop');
  const viewportRef = useRef<HTMLDivElement>(null);
  const elements = useMemo(
    () => applyResponsiveOverrides(sourceElements, activeBreakpoint),
    [activeBreakpoint, sourceElements],
  );

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) {
      return;
    }

    const calculateScale = () => {
      const availableWidth = Math.max(320, container.clientWidth - 24);
      setActiveBreakpoint(resolveBreakpoint(availableWidth));
      const ratio = availableWidth / Math.max(canvasSize.width, 1);
      const nextScale = Math.max(0.32, Math.min(1, ratio));
      setScale(nextScale);
    };

    calculateScale();
    const observer = new ResizeObserver(() => {
      calculateScale();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasSize.width]);

  const styleHeight = Math.round(canvasSize.height * scale);

  const viewportStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '12px',
    minHeight: styleHeight,
  };

  const canvasStyle: React.CSSProperties = {
    position: 'relative',
    width: canvasSize.width,
    minHeight: canvasSize.height,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    transition: 'transform 140ms ease',
    willChange: 'transform',
  };

  const themeVars: React.CSSProperties = {};
  if (theme?.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      (themeVars as Record<string, string>)[`--color-${key}`] = value;
    });
  }

  if (theme?.fonts) {
    if (theme.fonts.heading) {
      (themeVars as Record<string, string>)['--font-heading'] = theme.fonts.heading;
    }
    if (theme.fonts.body) {
      (themeVars as Record<string, string>)['--font-body'] = theme.fonts.body;
    }
  }

  if (theme?.spacing) {
    Object.entries(theme.spacing).forEach(([key, value]) => {
      (themeVars as Record<string, string>)[`--spacing-${key}`] = `${value}`;
    });
  }

  const fontFaceCss = fontAssets
    .filter((font) => font.source === 'uploaded' && font.family && font.url)
    .map((font) => {
      const family = font.family.replace(/["\\]/g, '');
      const weight = font.weights?.[0] || '400';
      const style = font.styles?.[0] || 'normal';
      const display = font.display || 'swap';

      return `@font-face {
        font-family: "${family}";
        src: url("${font.url}");
        font-style: ${style};
        font-weight: ${weight};
        font-display: ${display};
      }`;
    })
    .join('\n');

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            ${fontFaceCss}
            :root {
              ${Object.entries(themeVars)
                .map(([k, v]) => `${k}: ${v};`)
                .join('\n')}
            }
            ${theme?.customCSS || ''}
            ${customCSS || ''}
          `,
        }}
      />

      <div ref={viewportRef} style={viewportStyle}>
        <div className="backy-canvas" style={canvasStyle}>
          {elements.map((element) => (
            element.visible === false ? null : (
              <ElementRenderer
                key={element.id}
                element={element}
                isPreview={isPreview}
                siteId={siteId}
                pageId={pageId}
                postId={postId}
              />
            )
          ))}
        </div>
      </div>
    </>
  );
}

export default PageRenderer;
