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

import {
  BACKY_CODE_HIGHLIGHT_THEMES,
  buildBackyThemeCssVariables,
  buildBackyThemeTokenReferences,
  buildBackyThemeTokenRefStyle,
  buildBackyThemeTokens,
  normalizeBackyCodeHighlightTheme,
  normalizeBackyCodeLanguage,
  tokenizeBackyCodeLine,
  type BackyContentDocument,
} from '@backy-cms/core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  | 'comment'
  | 'interactiveFigure'
  | 'codeBlock'
  | 'codeComponent';

interface InteractiveFallback {
  title?: string;
  text?: string;
  html?: string;
  imageUrl?: string;
  alt?: string;
  ariaLabel?: string;
}

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
  componentKey?: string;
  version?: string;
  controls?: Array<Record<string, unknown>>;
  fallback?: string | InteractiveFallback;
  renderCapabilities?: Record<string, unknown>;
  dataBindings?: Array<Record<string, unknown>>;
  styles?: React.CSSProperties;
  responsive?: Partial<Record<RenderBreakpoint, ResponsiveElementOverride>>;
  tokenRefs?: Record<string, string>;
  children?: CanvasElement[];
  animation?: AnimationConfig;
  metadata?: Record<string, unknown>;
}

type RenderBreakpoint = 'desktop' | 'tablet' | 'mobile';

const RENDER_BREAKPOINT_CANVAS_SIZE: Record<RenderBreakpoint, { width: number; height: number }> = {
  desktop: { width: 1200, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

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
  tokenRefs?: Record<string, string>;
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
  tokenRefs?: Record<string, string>;
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
    mono?: string;
    custom?: Array<{
      name: string;
      url: string;
    }>;
  };
  spacing?: Record<string, string | number>;
  motion?: {
    duration?: Record<string, string>;
    easing?: Record<string, string>;
  };
  customCSS?: string;
}

export interface FontAsset {
  id: string;
  mediaId?: string;
  family: string;
  source: 'system' | 'google' | 'uploaded' | 'external';
  url?: string;
  weights?: Array<string | number>;
  styles?: Array<'normal' | 'italic' | 'oblique'>;
  fallbackStack?: string;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional' | string;
  cssFamily?: string;
  assetIds?: string[];
  variants?: FontAssetVariant[];
}

export interface FontAssetVariant {
  id: string;
  mediaId?: string;
  family?: string;
  weight?: string | number;
  style?: 'normal' | 'italic' | 'oblique' | string;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional' | string;
  url: string;
  mimeType?: string;
  originalName?: string;
  folderId?: string | null;
  tags?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const cssString = (value: string) => value.replace(/["\\]/g, '');

const cssUrl = (value: string) => value.replace(/["\\()\n\r]/g, '');

const FONT_WEIGHT_KEYWORDS = new Set(['normal', 'bold', 'lighter', 'bolder']);
const FONT_STYLE_VALUES = new Set(['normal', 'italic', 'oblique']);
const FONT_DISPLAY_VALUES = new Set(['auto', 'block', 'swap', 'fallback', 'optional']);

const cssFontWeight = (value: string | number | undefined, fallback: string | number = '400') => {
  const raw = value ?? fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (FONT_WEIGHT_KEYWORDS.has(normalized)) {
    return normalized;
  }
  if (/^\d{1,4}$/.test(normalized)) {
    const numeric = Number(normalized);
    if (numeric >= 1 && numeric <= 1000) {
      return String(numeric);
    }
  }
  return '400';
};

const cssFontStyle = (value: string | undefined, fallback = 'normal') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return FONT_STYLE_VALUES.has(normalized) ? normalized : 'normal';
};

const cssFontDisplay = (value: string | undefined, fallback = 'swap') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return FONT_DISPLAY_VALUES.has(normalized) ? normalized : 'swap';
};

const spacingTokenValue = (value: string | number) => (
  typeof value === 'number' ? `${value}px` : value
);

const themeSpacingNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const themeForTokenCompiler = (theme: ThemeConfig | undefined) => {
  const spacing: { unit?: number; scale?: number } = {};
  const unit = themeSpacingNumber(theme?.spacing?.unit);
  const scale = themeSpacingNumber(theme?.spacing?.scale);
  if (unit !== undefined) spacing.unit = unit;
  if (scale !== undefined) spacing.scale = scale;

  return {
    colors: theme?.colors,
    fonts: theme?.fonts,
    motion: theme?.motion,
    ...(Object.keys(spacing).length > 0 ? { spacing } : {}),
    customCSS: theme?.customCSS || '',
  };
};

const DEFAULT_RENDERER_ANIMATION_DURATION_SECONDS = 0.6;

const stringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const finiteAnimationNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
);

const animationFromRecord = (animation: unknown): AnimationConfig | undefined => {
  if (!isRecord(animation)) {
    return undefined;
  }

  const type = typeof animation.type === 'string' && animation.type.trim()
    ? animation.type.trim()
    : '';
  if (!type) {
    return undefined;
  }

  const tokenRefs = stringRecord(animation.tokenRefs);
  const duration = finiteAnimationNumber(animation.duration)
    ?? (tokenRefs?.duration || tokenRefs?.['animation.duration']
      ? DEFAULT_RENDERER_ANIMATION_DURATION_SECONDS
      : undefined);

  return {
    type,
    duration: duration ?? DEFAULT_RENDERER_ANIMATION_DURATION_SECONDS,
    delay: finiteAnimationNumber(animation.delay),
    easing: typeof animation.easing === 'string' ? animation.easing : undefined,
    direction: animation.direction === 'left' || animation.direction === 'right' || animation.direction === 'up' || animation.direction === 'down'
      ? animation.direction
      : undefined,
    trigger: animation.trigger === 'load' || animation.trigger === 'scroll' || animation.trigger === 'hover'
      ? animation.trigger
      : undefined,
    from: isRecord(animation.from) ? animation.from : undefined,
    to: isRecord(animation.to) ? animation.to : undefined,
    scrollTrigger: isRecord(animation.scrollTrigger)
      ? {
          start: typeof animation.scrollTrigger.start === 'string' ? animation.scrollTrigger.start : undefined,
          end: typeof animation.scrollTrigger.end === 'string' ? animation.scrollTrigger.end : undefined,
          scrub: typeof animation.scrollTrigger.scrub === 'boolean' ? animation.scrollTrigger.scrub : undefined,
        }
      : undefined,
    tokenRefs,
  };
};

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

  return animationFromRecord(animation);
};

const toRenderableElements = (elements: CanvasElement[]): CanvasElement[] => (
  elements.map((element) => ({
    ...element,
    animation: animationFromRecord(element.animation) || animationFromMetadata(element),
    children: element.children ? toRenderableElements(element.children) : undefined,
  }))
);

export const resolveRendererBreakpoint = (width: number): RenderBreakpoint => {
  if (width <= 639) {
    return 'mobile';
  }
  if (width <= 1023) {
    return 'tablet';
  }
  return 'desktop';
};

const RESPONSIVE_LAYOUT_FIELDS = ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'visible', 'locked'] as const;

const resolveThemeTokenReferenceValue = (
  tokenReference: string | undefined,
  tokenReferences: Record<string, string>,
  cssVariables: Record<string, string>,
): string | undefined => {
  if (!tokenReference) {
    return undefined;
  }

  const resolved = tokenReferences[tokenReference] || tokenReference;
  const cssVariableMatch = resolved.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (!cssVariableMatch) {
    return resolved;
  }

  const [, variableName, fallback] = cssVariableMatch;
  return cssVariables[variableName] || fallback?.trim() || resolved;
};

const cssDurationToSeconds = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (trimmed.endsWith('ms')) {
    return parsed / 1000;
  }

  if (trimmed.endsWith('s')) {
    return parsed;
  }

  return parsed;
};

export const resolveRendererAnimationTokenRefs = (
  animation: AnimationConfig | undefined,
  tokenReferences: Record<string, string>,
  cssVariables: Record<string, string>,
): AnimationConfig | undefined => {
  if (!animation?.tokenRefs) {
    return animation;
  }

  const durationValue = resolveThemeTokenReferenceValue(
    animation.tokenRefs.duration || animation.tokenRefs['animation.duration'],
    tokenReferences,
    cssVariables,
  );
  const easingValue = resolveThemeTokenReferenceValue(
    animation.tokenRefs.easing || animation.tokenRefs['animation.easing'],
    tokenReferences,
    cssVariables,
  );
  const duration = cssDurationToSeconds(durationValue);

  return {
    ...animation,
    ...(duration !== undefined ? { duration } : {}),
    ...(easingValue ? { easing: easingValue } : {}),
  };
};

export const applyResponsiveOverride = (
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
    tokenRefs: override.tokenRefs ? { ...(element.tokenRefs || {}), ...override.tokenRefs } : element.tokenRefs,
    ...(children ? { children } : {}),
  };
};

export const applyResponsiveOverrides = (
  elements: CanvasElement[],
  breakpoint: RenderBreakpoint,
): CanvasElement[] => elements.map((element) => applyResponsiveOverride(element, breakpoint));

const collectPublicRenderedContentBounds = (
  elements: CanvasElement[],
  offsetX = 0,
  offsetY = 0,
): { maxX: number; maxY: number } => (
  elements.reduce((bounds, element) => {
    if (!getBooleanWithFallback(element.visible, true) || getBooleanWithFallback(element.props?.hidden, false)) {
      return bounds;
    }

    const x = Number.isFinite(element.x) ? element.x : 0;
    const y = Number.isFinite(element.y) ? element.y : 0;
    const width = Number.isFinite(element.width) ? element.width : 0;
    const height = Number.isFinite(element.height) ? element.height : 0;
    const elementOffsetX = offsetX + x;
    const elementOffsetY = offsetY + y;
    const childBounds = element.children?.length
      ? collectPublicRenderedContentBounds(element.children, elementOffsetX, elementOffsetY)
      : { maxX: 0, maxY: 0 };

    return {
      maxX: Math.max(bounds.maxX, elementOffsetX + width, childBounds.maxX),
      maxY: Math.max(bounds.maxY, elementOffsetY + height, childBounds.maxY),
    };
  }, { maxX: 0, maxY: 0 })
);

const applyThemeTokenRefsToElement = (
  element: CanvasElement,
  tokenReferences: Record<string, string>,
  cssVariables: Record<string, string>,
): CanvasElement => {
  const tokenStyle = buildBackyThemeTokenRefStyle(element.tokenRefs, tokenReferences) as React.CSSProperties;
  const animation = resolveRendererAnimationTokenRefs(element.animation, tokenReferences, cssVariables);
  const children = element.children?.map((child) => applyThemeTokenRefsToElement(child, tokenReferences, cssVariables));
  const animationChanged = animation !== element.animation;

  if (Object.keys(tokenStyle).length === 0 && !animationChanged) {
    return children ? { ...element, children } : element;
  }

  return {
    ...element,
    props: {
      ...element.props,
      ...tokenStyle,
    },
    styles: {
      ...(element.styles || {}),
      ...tokenStyle,
    },
    ...(animationChanged ? { animation } : {}),
    ...(children ? { children } : {}),
  };
};

const applyThemeTokenRefsToElements = (
  elements: CanvasElement[],
  tokenReferences: Record<string, string>,
  cssVariables: Record<string, string>,
) => elements.map((element) => applyThemeTokenRefsToElement(element, tokenReferences, cssVariables));

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

  if (normalized === 'radiobuttons') {
    return 'radio';
  }

  if (normalized === 'checkinput') {
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
    'interactiveFigure',
    'codeBlock',
    'codeComponent',
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
  if (inputType === 'password') {
    return 'password';
  }
  if (inputType === 'search') {
    return 'search';
  }
  if (inputType === 'file') {
    return 'file';
  }
  if (inputType === 'hidden') {
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

type FormSchemaFieldType =
  | 'text'
  | 'email'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'tel'
  | 'url'
  | 'file';

interface FormSchemaField {
  key: string;
  label: string;
  type: FormSchemaFieldType;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: unknown;
  required?: boolean;
  disabled?: boolean;
  validation?: Array<{
    type: string;
    value?: string | number;
    message?: string;
  }>;
}

const FORM_CAPTCHA_TOKEN_FIELDS = [
  'captchaToken',
  'captchaResponse',
  'turnstileToken',
  'hcaptchaToken',
  'recaptchaToken',
  'g-recaptcha-response',
  'cf-turnstile-response',
];

const FORM_SCHEMA_FIELD_TYPES: FormSchemaFieldType[] = [
  'text',
  'email',
  'number',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'date',
  'tel',
  'url',
  'file',
];

interface ElementRendererContext {
  isPreview?: boolean;
  siteId?: string;
  pageId?: string;
  postId?: string;
  repeaterRecord?: Record<string, unknown>;
}

interface ElementRendererProps extends ElementRendererContext {
  element: CanvasElement;
}

interface SlateNode {
  type?: string;
  text?: string;
  indent?: unknown;
  children?: unknown[];
}

type ListItemEntry = {
  text: string;
  indent?: number;
};

const LIST_MAX_INDENT = 8;

function getLength(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) {
    return fallback;
  }

  return typeof value === 'number' ? `${value}px` : `${value}`;
}

function getNonNegativeLength(value: unknown, fallback = 0): string {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseFloat(value)
      : fallback;

  return `${Math.max(0, Number.isFinite(parsed) ? parsed : fallback)}px`;
}

function getLineHeight(value: unknown, fallback: React.CSSProperties['lineHeight'] = 'normal'): React.CSSProperties['lineHeight'] {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return typeof value === 'number' ? value : `${value}`;
}

function getBoolean(value: unknown): boolean {
  return parseBooleanSetting(value, false);
}

function getBooleanWithFallback(value: unknown, fallback: boolean): boolean {
  return value === undefined || value === null ? fallback : parseBooleanSetting(value, fallback);
}

function normalizeLinkTargetValue(value: unknown): '_self' | '_blank' | '_parent' | '_top' | undefined {
  const target = getNameClass(value).trim();
  return target === '_self' || target === '_blank' || target === '_parent' || target === '_top'
    ? target
    : undefined;
}

function normalizeLinkRelValue(target: unknown, value: unknown): string | undefined {
  const tokens = getNameClass(value).trim().split(/\s+/).filter(Boolean);

  if (target === '_blank') {
    const lowerTokens = new Set(tokens.map((token) => token.toLowerCase()));
    if (!lowerTokens.has('noopener')) {
      tokens.unshift('noopener');
    }
    if (!lowerTokens.has('noreferrer')) {
      const insertAt = tokens[0]?.toLowerCase() === 'noopener' ? 1 : 0;
      tokens.splice(insertAt, 0, 'noreferrer');
    }
  }

  return tokens.length > 0 ? tokens.join(' ') : undefined;
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
    lineHeight: getLineHeight(props.lineHeight),
    textTransform: getNameClass(props.textTransform),
    letterSpacing: getLength(props.letterSpacing),
    wordSpacing: getLength(props.wordSpacing),
    textShadow: getNameClass(props.textShadow),
    textIndent: getLength(props.textIndent),
    textDecoration: getNameClass(props.textDecoration),
    fontStyle: getNameClass(props.fontStyle),
  };
}

function getAppearanceStyle(props: Record<string, unknown>): React.CSSProperties {
  return {
    padding: getLength(props.padding),
    margin: getLength(props.margin),
    backgroundColor: getNameClass(props.backgroundColor),
    borderRadius: getLength(props.borderRadius),
    borderWidth: getLength(props.borderWidth),
    borderStyle: getNameClass(props.borderStyle) || undefined,
    borderColor: getNameClass(props.borderColor) || undefined,
    boxShadow: getNameClass(props.boxShadow) || undefined,
  };
}

function getFieldControlStyle(props: Record<string, unknown>): React.CSSProperties {
  const fieldBorderColor = getNameClass(props.fieldBorderColor) || getNameClass(props.borderColor) || '#d1d5db';

  return {
    padding: getLength(props.padding, '12px 16px'),
    border: getNameClass(props.fieldBorder) || getNameClass(props.border) || `${getLength(props.borderWidth, '1px')} ${getNameClass(props.borderStyle) || 'solid'} ${fieldBorderColor}`,
    borderRadius: getLength(props.fieldBorderRadius ?? props.borderRadius, '8px'),
    fontSize: getLength(props.fontSize, '16px'),
    color: getNameClass(props.color),
    backgroundColor: getNameClass(props.fieldBackgroundColor) || getNameClass(props.backgroundColor) || '#ffffff',
    boxShadow: getNameClass(props.boxShadow) || undefined,
    margin: getLength(props.margin),
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

const toListItemIndent = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = (value as Record<string, unknown>).indent;
  const indent = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(indent) || indent <= 0) {
    return undefined;
  }

  return Math.max(0, Math.min(LIST_MAX_INDENT, Math.floor(indent)));
};

function parseListItemEntries(raw: unknown, content: unknown): ListItemEntry[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => ({
      text: typeof item === 'string'
        ? item.trimEnd()
        : item && typeof item === 'object' && typeof (item as Record<string, unknown>).label === 'string'
          ? ((item as Record<string, string>).label).trimEnd()
          : item && typeof item === 'object' && typeof (item as Record<string, unknown>).value === 'string'
            ? ((item as Record<string, string>).value).trimEnd()
            : item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string'
              ? ((item as Record<string, string>).text).trimEnd()
              : getNameClass(item).trimEnd(),
      indent: toListItemIndent(item),
    }));
  }

  if (typeof raw === 'string') {
    return raw.split(/\r?\n/).map((item) => ({ text: item.trimEnd() }));
  }

  return extractListItemEntriesFromSlate(content).map((item) => ({
    ...item,
    text: item.text.trimEnd(),
  }));
}

function normalizeFormSchemaFieldType(raw: unknown): FormSchemaFieldType {
  const type = getNameClass(raw).toLowerCase();
  return FORM_SCHEMA_FIELD_TYPES.includes(type as FormSchemaFieldType)
    ? type as FormSchemaFieldType
    : 'text';
}

function normalizeFormSchemaFields(raw: unknown): FormSchemaField[] {
  const values = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.entries(raw).map(([key, value]) => (
        isRecord(value) ? { key, ...value } : { key, label: key, type: value }
      ))
      : [];
  const usedKeys = new Set<string>();

  return values
    .map((value, index): FormSchemaField | null => {
      if (!isRecord(value)) {
        return null;
      }

      const requestedKey = getNameClass(value.key)
        || getNameClass(value.name)
        || getNameClass(value.id)
        || `field_${index + 1}`;
      let key = requestedKey.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
      if (!key) {
        key = `field_${index + 1}`;
      }
      const baseKey = key;
      let counter = 2;
      while (usedKeys.has(key)) {
        key = `${baseKey}_${counter}`;
        counter += 1;
      }
      usedKeys.add(key);

      const validation = Array.isArray(value.validation)
        ? value.validation
          .filter(isRecord)
          .map((rule) => ({
            type: getNameClass(rule.type),
            value: typeof rule.value === 'number' || typeof rule.value === 'string' ? rule.value : undefined,
            message: getNameClass(rule.message),
          }))
          .filter((rule) => rule.type.length > 0)
        : [];

      return {
        key,
        label: getNameClass(value.label) || key,
        type: normalizeFormSchemaFieldType(value.type || value.inputType),
        placeholder: getNameClass(value.placeholder),
        helpText: getNameClass(value.helpText),
        defaultValue: getNameClass(value.defaultValue ?? value.value),
        options: value.options,
        required: getBoolean(value.required) || validation.some((rule) => rule.type === 'required'),
        disabled: getBoolean(value.disabled),
        validation,
      };
    })
    .filter((field): field is FormSchemaField => Boolean(field));
}

function getFormSchemaValidationValue(
  field: FormSchemaField,
  type: string,
): string | number | undefined {
  return field.validation?.find((rule) => rule.type === type)?.value;
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

function readFormValue(values: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const found = value.find((item) => typeof item === 'string' && item.trim().length > 0);
      if (typeof found === 'string') {
        return found.trim();
      }
    }
  }

  return '';
}

function serializeFormFieldMap(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([source, target]) => [
      source.trim(),
      typeof target === 'string' ? target.trim() : '',
    ] as const)
    .filter(([source, target]) => source.length > 0 && target.length > 0);

  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : undefined;
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

function resolveFormOwnerId(props: Record<string, unknown>): string | undefined {
  return parseAttributeString(props.formOwnerId) || parseAttributeString(props.formId);
}

function normalizeCaptchaProvider(value: unknown): 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock' {
  const provider = getNameClass(value).toLowerCase();
  if (provider === 'hcaptcha' || provider === 'recaptcha' || provider === 'mock') {
    return provider;
  }

  return 'turnstile';
}

function getCaptchaWidgetClass(provider: 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock'): string | undefined {
  if (provider === 'turnstile') {
    return 'cf-turnstile';
  }
  if (provider === 'hcaptcha') {
    return 'h-captcha';
  }
  if (provider === 'recaptcha') {
    return 'g-recaptcha';
  }

  return undefined;
}

const CAPTCHA_SCRIPT_URLS = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
  recaptcha: 'https://www.google.com/recaptcha/api.js?render=explicit',
} as const;

const captchaScriptLoads = new Map<string, Promise<void>>();

function loadCaptchaScript(provider: 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock'): Promise<void> {
  if (provider === 'mock' || typeof window === 'undefined') {
    return Promise.resolve();
  }

  const src = CAPTCHA_SCRIPT_URLS[provider];
  const existing = captchaScriptLoads.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const currentScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (currentScript?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = currentScript || document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.backyCaptchaScript = provider;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      captchaScriptLoads.delete(src);
      reject(new Error(`Unable to load ${provider} captcha script.`));
    }, { once: true });

    if (!currentScript) {
      document.head.appendChild(script);
    }
  });

  captchaScriptLoads.set(src, promise);
  return promise;
}

function resolveMediaSource(value: unknown): string | undefined {
  const direct = parseAttributeString(value);
  if (direct) {
    return direct;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return parseAttributeString(value.url)
    || parseAttributeString(value.src)
    || parseAttributeString(value.publicUrl)
    || parseAttributeString(value.path);
}

function resolveElementMediaSource(props: Record<string, unknown>, key: string): string | undefined {
  return resolveMediaSource(props[key])
    || resolveMediaSource(props[`${key}Url`])
    || resolveMediaSource(props.media);
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

function getCodeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.replace(/\r\n?/g, '\n');
  }

  return '';
}

const resolveNavigationBindingMetadata = (
  sourceValue: unknown,
  bindingValue: unknown,
  chromeRoleValue: unknown,
) => {
  const rawBinding = getNameClass(bindingValue).trim();
  const rawSource = getNameClass(sourceValue).trim();
  const sourceFromBinding = rawBinding === 'site.navigation.primary'
    ? 'site-primary'
    : rawBinding === 'site.navigation.footer'
      ? 'site-footer'
      : rawBinding === 'manual.navItems'
        ? 'manual'
        : null;
  const navigationSource = sourceFromBinding || (
    rawSource === 'site-primary' || rawSource === 'site-footer' || rawSource === 'manual'
      ? rawSource
      : rawSource === 'site.navigation.primary'
      ? 'site-primary'
      : rawSource === 'site.navigation.footer'
        ? 'site-footer'
        : 'manual'
  );
  const navigationBinding = rawBinding || (
    navigationSource === 'site-primary'
      ? 'site.navigation.primary'
      : navigationSource === 'site-footer'
        ? 'site.navigation.footer'
        : 'manual.navItems'
  );
  const chromeRole = getNameClass(chromeRoleValue) || (
    navigationSource === 'site-primary'
      ? 'site.header.navigation'
      : navigationSource === 'site-footer'
        ? 'site.footer.navigation'
        : 'page.local.navigation'
  );

  return { navigationSource, navigationBinding, chromeRole };
};

function getFirstNameClassFromList(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  for (const item of value) {
    const text = getNameClass(item).trim();
    if (text) {
      return text;
    }
  }

  return '';
}

const fileDownloadDataAttributes = (props: Record<string, unknown>): Record<string, string | undefined> => {
  const fileMediaId = getNameClass(props.fileMediaId)
    || getNameClass(props.fileId)
    || getNameClass(props.downloadMediaId)
    || getFirstNameClassFromList(props.fileIds)
    || getFirstNameClassFromList(props.fileMediaIds)
    || getFirstNameClassFromList(props.downloadMediaIds);
  const fileMediaVisibility = getNameClass(props.fileMediaVisibility);
  const signedUrlRequired = getBooleanWithFallback(props.fileSignedUrlRequired, false) ||
    fileMediaVisibility === 'private';

  return {
    'data-backy-file-id': fileMediaId || undefined,
    'data-backy-file-media-id': fileMediaId || undefined,
    'data-backy-file-media-name': getNameClass(props.fileMediaName) || undefined,
    'data-backy-file-media-type': getNameClass(props.fileMediaType) || undefined,
    'data-backy-file-media-visibility': fileMediaVisibility || undefined,
    'data-backy-file-signed-url-required': signedUrlRequired ? 'true' : undefined,
    'data-backy-file-signed-url-endpoint': getNameClass(props.fileSignedUrlEndpoint) || undefined,
  };
};

const getSlateText = (node: unknown): string => {
  if (Array.isArray(node)) {
    return node.map(getSlateText).filter(Boolean).join('\n');
  }

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

const getListItemOwnText = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typed = node as SlateNode;
  if (!Array.isArray(typed.children)) {
    return typeof typed.text === 'string' ? typed.text : '';
  }

  return typed.children
    .filter((child) => {
      if (!child || typeof child !== 'object') {
        return true;
      }
      const childType = (child as SlateNode).type;
      return childType !== 'ul' && childType !== 'ol';
    })
    .map(getSlateText)
    .join('');
};

const extractListItemEntriesFromSlate = (value: unknown): ListItemEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ListItemEntry[] = [];

  const walk = (node: unknown, inheritedIndent = 0) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typed = node as SlateNode;
    if ((typed.type === 'li' || typed.type === 'item')) {
      const indent = toListItemIndent(typed) ?? inheritedIndent;
      const text = getListItemOwnText(node).trimEnd();
      items.push({
        text,
        ...(indent > 0 ? { indent } : {}),
      });
      if (Array.isArray(typed.children)) {
        typed.children.forEach((child) => {
          if (child && typeof child === 'object') {
            const childType = (child as SlateNode).type;
            if (childType === 'ul' || childType === 'ol') {
              walk(child, indent + 1);
            }
          }
        });
      }
      return;
    }

    if (typed.type === 'ul' || typed.type === 'ol') {
      if (Array.isArray(typed.children)) {
        typed.children.forEach((child) => walk(child, inheritedIndent));
      }
      return;
    }

    if (Array.isArray(typed.children)) {
      typed.children.forEach((child) => walk(child, inheritedIndent));
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

const getSafeFormRedirectUrl = (value: unknown): string => {
  const source = sanitizeText(value);
  if (!source) return '';

  if (source.startsWith('/') && !source.startsWith('//')) {
    return source;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const parsed = new URL(source, window.location.href);
    const isHttpProtocol = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttpProtocol || parsed.origin !== window.location.origin) {
      return '';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
};

const sanitizeHtmlMarkup = (value: unknown): string => {
  const source = sanitizeText(value);
  if (!source) return '';

  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s+(href|src|xlink:href|formaction|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      (match, attribute: string, rawValue: string) => {
        const valueWithoutQuotes = rawValue.replace(/^['"]|['"]$/g, '');
        const normalizedValue = valueWithoutQuotes.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
        const isDangerousUrl =
          normalizedValue.startsWith('javascript:') ||
          normalizedValue.startsWith('vbscript:') ||
          normalizedValue.startsWith('data:text/html') ||
          normalizedValue.startsWith('data:image/svg+xml');

        return isDangerousUrl ? ` ${attribute}="#"` : match;
      },
    )
    .replace(
      /\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      (match, rawValue: string) => {
        const normalizedValue = rawValue.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
        return normalizedValue.includes('javascript:')
          || normalizedValue.includes('expression(')
          || normalizedValue.includes('data:text/html')
          ? ''
          : match;
      },
    );
};

const DEFAULT_IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
const DEFAULT_EMBED_ALLOWED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'docs.google.com',
  'figma.com',
  'www.figma.com',
];
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

const INTERACTIVE_IFRAME_SANDBOX_DEFAULT = 'allow-scripts allow-forms';
const INTERACTIVE_IFRAME_SANDBOX_TOKENS = new Set([
  'allow-downloads',
  'allow-forms',
  'allow-pointer-lock',
  'allow-presentation',
  'allow-scripts',
]);
const INTERACTIVE_IFRAME_PERMISSION_TOKENS = new Set([
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'midi',
  'payment',
  'picture-in-picture',
  'screen-wake-lock',
  'serial',
  'usb',
  'web-share',
  'xr-spatial-tracking',
]);

const parseTokenList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseTokenList(item));
  }

  return sanitizeText(value)
    .split(/[\s,;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeInteractiveIframeSandbox = (value: unknown): string => {
  const tokens = parseTokenList(value)
    .filter((token) => INTERACTIVE_IFRAME_SANDBOX_TOKENS.has(token));

  if (tokens.length === 0) {
    return INTERACTIVE_IFRAME_SANDBOX_DEFAULT;
  }

  return Array.from(new Set(tokens)).join(' ');
};

const interactiveIframeUsesOpaqueOrigin = (sandbox: string): boolean => (
  !sandbox.split(/\s+/).includes('allow-same-origin')
);

const normalizeInteractiveIframeAllow = (value: unknown): string | undefined => {
  const tokens = parseTokenList(value)
    .filter((token) => INTERACTIVE_IFRAME_PERMISSION_TOKENS.has(token));

  return tokens.length > 0
    ? Array.from(new Set(tokens)).join('; ')
    : undefined;
};

const normalizeInteractiveSandboxUrl = (value: unknown): string => {
  const raw = sanitizeText(value);
  if (!raw) {
    return '';
  }

  if (/^(javascript|data|blob|file|vbscript):/i.test(raw)) {
    return '';
  }

  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? '' : raw;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.origin === window.location.origin && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      ? parsed.href
      : '';
  } catch {
    return '';
  }
};

const normalizeEmbedHost = (value: string): string => {
  const raw = value.trim().toLowerCase();
  if (!raw) {
    return '';
  }

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').split('/')[0];
  }
};

const parseEmbedAllowedHosts = (value: unknown): string[] => {
  const customHosts = typeof value === 'string'
    ? value.split(/[\n,;]/).map(normalizeEmbedHost).filter(Boolean)
    : [];

  return Array.from(new Set([
    ...DEFAULT_EMBED_ALLOWED_HOSTS.map(normalizeEmbedHost),
    ...customHosts,
  ]));
};

const isEmbedHostAllowed = (host: string, allowedHosts: string[]): boolean => {
  const normalizedHost = normalizeEmbedHost(host);
  return allowedHosts.some((allowedHost) => (
    normalizedHost === allowedHost || normalizedHost.endsWith(`.${allowedHost}`)
  ));
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

const normalizeEmbedUrl = (raw: unknown, allowedHostsInput?: unknown): string => {
  const source = sanitizeText(raw);
  if (!source) {
    return '';
  }

  const iframeMatch = source.match(/<iframe[^>]*src=(\"|')([^\"']+)\1/i);
  const src = iframeMatch ? iframeMatch[2] : source;
  const normalizedSrc = src.startsWith('//') ? `https:${src}` : src;

  if (normalizedSrc.startsWith('/uploads/') || normalizedSrc.startsWith('/api/sites/')) {
    return normalizedSrc;
  }

  const parsed = (() => {
    try {
      return new URL(normalizedSrc);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(src)) {
      return `https://www.youtube.com/embed/${src}`;
    }

    return '';
  }

  const host = parsed.host.toLowerCase();
  const allowedHosts = parseEmbedAllowedHosts(allowedHostsInput);
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !isEmbedHostAllowed(host, allowedHosts)) {
    return '';
  }

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

const normalizeMapCoordinate = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseFloat(value)
      : NaN;

  return Number.isFinite(parsed) ? parsed : undefined;
};

const getMapSource = (props: Record<string, unknown>): string => {
  const customSource = sanitizeText(props.src);
  if (customSource) {
    return customSource;
  }

  const latitude = normalizeMapCoordinate(props.markerLatitude);
  const longitude = normalizeMapCoordinate(props.markerLongitude);
  if (latitude !== undefined && longitude !== undefined) {
    return `${latitude},${longitude}`;
  }

  return sanitizeText(props.address);
};

/**
 * Render a text element
 */
function TextElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const htmlContent = sanitizeHtmlMarkup(props.content);
  const textContent = getSlateText(props.content) || getNameClass(props.text);

  const tagProps = {
    style: {
      ...styles,
      ...getTypographyStyle(props as Record<string, unknown>),
    },
  };

  if (htmlContent) {
    return React.createElement(
      getSafeTag(props.tag),
      {
        ...tagProps,
        dangerouslySetInnerHTML: { __html: htmlContent },
      },
    );
  }

  return React.createElement(
    getSafeTag(props.tag),
    tagProps,
    textContent,
  );
}

/**
 * Render an icon/symbol element
 */
function IconElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const label = getNameClass(props.ariaLabel);
  const title = getNameClass(props.title);
  const icon = getNameClass(props.icon) || getNameClass(props.symbol) || '★';

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      title={title || undefined}
      style={{
        ...getTypographyStyle(props as Record<string, unknown>),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: getLength(props.size, '24px'),
        lineHeight: 1,
        color: getNameClass(props.color) || '#374151',
        ...getAppearanceStyle(props as Record<string, unknown>),
        ...styles,
      }}
    >
      {icon}
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
  const headingText = getNameClass(props.content) || getSlateText(props.content) || getNameClass(props.text);

  return (
    <Tag
      style={{
        margin: 0,
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {headingText}
    </Tag>
  );
}

/**
 * Render an image element
 */
function ImageElement({ element }: ElementRendererProps) {
  const { props, styles, width, height } = element;
  const src = resolveElementMediaSource(props as Record<string, unknown>, 'src');

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={getNameClass(props.alt) || ''}
      title={getNameClass(props.title) || undefined}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      style={{
        objectFit: (props.objectFit as React.CSSProperties['objectFit']) || 'cover',
        objectPosition: getNameClass(props.objectPosition) || 'center center',
        ...getAppearanceStyle(props as Record<string, unknown>),
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
  const src = resolveElementMediaSource(props as Record<string, unknown>, 'src');
  const poster = resolveMediaSource(props.poster);

  return (
    <video
      src={src}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      title={getNameClass(props.title) || undefined}
      poster={poster}
      autoPlay={autoPlay}
      loop={getBooleanWithFallback(props.loop, false)}
      muted={muted}
      controls={getBooleanWithFallback(props.controls, true)}
      style={{
        objectFit: (props.objectFit as React.CSSProperties['objectFit']) || 'cover',
        ...getAppearanceStyle(props as Record<string, unknown>),
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
  const target = normalizeLinkTargetValue(props.target);
  const rel = normalizeLinkRelValue(target, props.rel);
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
    boxShadow: getNameClass(props.boxShadow) || undefined,
    margin: getLength(props.margin),
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    ...getAppearanceStyle(props as Record<string, unknown>),
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
        download={getBooleanWithFallback(props.download, false) ? '' : undefined}
        title={title}
        aria-label={ariaLabel}
        {...fileDownloadDataAttributes(props)}
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
function ContainerElement({ element, isPreview, siteId, pageId, postId, repeaterRecord }: ElementRendererProps) {
  const { props, styles, children } = element;

  return (
    <div
      style={{
        position: 'relative',
        display: (props.display as React.CSSProperties['display']) || 'block',
        flexDirection: (props.flexDirection as React.CSSProperties['flexDirection']) || 'column',
        alignItems: props.alignItems as React.CSSProperties['alignItems'],
        justifyContent: props.justifyContent as React.CSSProperties['justifyContent'],
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        overflow: props.overflow as React.CSSProperties['overflow'] || 'visible',
        gap: getLength(props.gap),
        padding: getLength(props.padding),
        backgroundColor: getNameClass(props.backgroundColor),
        backgroundImage: props.backgroundImage ? `url(${props.backgroundImage as string})` : undefined,
        backgroundSize: (props.backgroundSize as string) || 'cover',
        backgroundPosition: (props.backgroundPosition as string) || 'center',
        borderRadius: getLength(props.borderRadius),
        borderWidth: getLength(props.borderWidth),
        borderStyle: getNameClass(props.borderStyle) || undefined,
        borderColor: getNameClass(props.borderColor) || undefined,
        boxShadow: getNameClass(props.boxShadow) || undefined,
        margin: getLength(props.margin),
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
          repeaterRecord={repeaterRecord}
        />
      ))}
    </div>
  );
}

/**
 * Render a navigation element
 */
function NavElement({ element, isPreview, siteId, pageId, postId, repeaterRecord }: ElementRendererProps) {
  const { props, styles, children } = element;
  const items = parseNavigationItems(props.navItems);
  const isVertical = props.navDirection === 'vertical';
  const { navigationSource, navigationBinding, chromeRole } = resolveNavigationBindingMetadata(
    props.navigationSource,
    props.navigationBinding,
    props.chromeRole,
  );

  return (
    <nav
      aria-label={getNameClass(props.ariaLabel) || 'Page navigation'}
      data-backy-navigation-source={navigationSource}
      data-backy-navigation-binding={navigationBinding}
      data-backy-chrome-role={chromeRole}
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
        ...getAppearanceStyle(props as Record<string, unknown>),
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
          repeaterRecord={repeaterRecord}
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
function ColumnsElement({ element, isPreview, siteId, pageId, postId, repeaterRecord }: ElementRendererProps) {
  const { props, styles, children } = element;
  const columnCount = Math.max(1, Math.min(6, Number(props.columns) || 2));
  const columns = Array.from({ length: columnCount }, () => [] as CanvasElement[]);
  (children || []).forEach((child, index) => {
    const explicitColumn = Number(
      child.props?.columnIndex
        ?? child.props?.column
        ?? (child as CanvasElement & { columnIndex?: unknown; column?: unknown }).columnIndex
        ?? (child as CanvasElement & { columnIndex?: unknown; column?: unknown }).column,
    );
    const columnIndex = Number.isFinite(explicitColumn)
      ? Math.max(0, Math.min(columnCount - 1, Math.floor(explicitColumn) - (explicitColumn >= 1 ? 1 : 0)))
      : index % columnCount;
    columns[columnIndex].push(child);
  });

  return (
    <div
      data-backy-columns={columnCount}
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
        ...getAppearanceStyle(props as Record<string, unknown>),
        ...styles,
      }}
      aria-label={getNameClass(props.ariaLabel)}
    >
      {columns.map((columnChildren, columnIndex) => (
        <div
          key={`${element.id}-column-${columnIndex}`}
          data-backy-column-index={columnIndex}
          style={{
            position: 'relative',
            minWidth: 0,
            minHeight: '100%',
          }}
        >
          {columnChildren.map((child) => (
            <ElementRenderer
              key={child.id}
              element={child}
              isPreview={isPreview}
              siteId={siteId}
              pageId={pageId}
              postId={postId}
              repeaterRecord={repeaterRecord}
            />
          ))}
        </div>
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
        ...getAppearanceStyle(props as Record<string, unknown>),
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
        height: 0,
        boxSizing: 'border-box',
        border: 'none',
        borderTop: `${getLength(props.thickness, '1px')} ${getNameClass(props.borderStyle) || 'solid'} ${getNameClass(props.borderColor) || getNameClass(props.color) || '#e5e7eb'}`,
        margin: `${getLength(props.margin, '0px')} 0`,
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
  const src = normalizeEmbedUrl(getNameClass(props.src) || getNameClass(props.url), props.allowedHosts ?? props.embedAllowedHosts);

  if (!src) {
    return <p>Missing or blocked embed source</p>;
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
        ...getAppearanceStyle(props as Record<string, unknown>),
        ...styles,
      }}
      allow={normalizeIframeAllow(props.allow)}
      allowFullScreen={getBooleanWithFallback(props.allowFullScreen, true)}
      loading={normalizeIframeLoading(props.loading)}
      referrerPolicy={normalizeIframeReferrerPolicy(props.referrerPolicy)}
      sandbox={normalizeIframeSandbox(props.sandbox)}
      data-backy-embed-allowed-hosts={parseEmbedAllowedHosts(props.allowedHosts ?? props.embedAllowedHosts).join(',')}
    />
  );
}

/**
 * Render raw HTML element
 */
function HtmlElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const htmlContent = sanitizeHtmlMarkup(props.html) || sanitizeHtmlMarkup(props.content);

  return <div style={styles} dangerouslySetInnerHTML={{ __html: htmlContent }} />;
}

function CodeBlockElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const code = getCodeText(props.code) || getCodeText(props.content) || '';
  const language = normalizeBackyCodeLanguage(props.language || 'text');
  const highlightTheme = normalizeBackyCodeHighlightTheme(props.highlightTheme);
  const tokenTheme = BACKY_CODE_HIGHLIGHT_THEMES[highlightTheme];
  const filename = getNameClass(props.filename).trim();
  const caption = getNameClass(props.caption).trim();
  const showLineNumbers = getBooleanWithFallback(props.showLineNumbers, true);
  const wrapLines = getBooleanWithFallback(props.wrapLines, false);
  const copyEnabled = getBooleanWithFallback(props.copyEnabled, true);
  const lines = code.replace(/\n$/, '').split('\n');
  const backgroundColor = getNameClass(props.backgroundColor) || '#0f172a';
  const color = getNameClass(props.color) || '#e2e8f0';
  const renderHighlightedCodeLine = (line: string, lineIndex: number) => {
    const tokens = tokenizeBackyCodeLine(line, language);
    if (tokens.length === 0 || (tokens.length === 1 && tokens[0]?.text === '')) {
      return ' ';
    }

    return tokens.map((token, tokenIndex) => (
      <span
        key={`${element.id}-code-token-${lineIndex}-${tokenIndex}`}
        data-backy-code-token={token.type}
        style={token.type === 'plain' ? undefined : { color: tokenTheme[token.type] }}
      >
        {token.text}
      </span>
    ));
  };

  return (
    <figure
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        width: '100%',
        height: '100%',
        minHeight: '100%',
        margin: 0,
        overflow: 'hidden',
        backgroundColor,
        color,
        border: `${getLength(props.borderWidth, '1px')} ${getNameClass(props.borderStyle) || 'solid'} ${getNameClass(props.borderColor) || '#1e293b'}`,
        borderRadius: getLength(props.borderRadius, '8px'),
        fontFamily: getNameClass(props.fontFamily) || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        ...styles,
      }}
      data-backy-code-block="true"
      data-backy-code-language={language}
      data-backy-code-filename={filename || undefined}
      data-backy-code-line-numbers={showLineNumbers ? 'true' : 'false'}
      data-backy-code-wrap={wrapLines ? 'true' : 'false'}
      data-backy-code-copy={copyEnabled ? 'enabled' : 'disabled'}
      data-backy-code-highlight-theme={highlightTheme}
    >
      <div style={{
        minHeight: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.24)',
        background: 'rgba(15, 23, 42, 0.55)',
      }}>
        <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 8 }}>
          {filename && (
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }}>
              {filename}
            </span>
          )}
          <span style={{ borderRadius: 999, background: 'rgba(226, 232, 240, 0.12)', padding: '2px 7px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(226, 232, 240, 0.72)' }}>
            {language}
          </span>
        </div>
        {copyEnabled && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(code).catch(() => undefined)}
            style={{
              border: '1px solid rgba(226, 232, 240, 0.18)',
              borderRadius: 6,
              background: 'rgba(226, 232, 240, 0.08)',
              color: 'inherit',
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'copy',
            }}
            data-backy-code-copy-button="true"
          >
            Copy
          </button>
        )}
      </div>
      <pre
        style={{
          margin: 0,
          minHeight: 0,
          overflow: 'auto',
          padding: showLineNumbers ? '12px 0' : '12px',
          fontSize: getLength(props.fontSize, '13px'),
          lineHeight: getLineHeight(props.lineHeight, 1.65),
          whiteSpace: wrapLines ? 'pre-wrap' : 'pre',
          tabSize: 2,
        }}
      >
        {showLineNumbers ? (
          <code>
            {lines.map((line, index) => (
              <span
                key={`${element.id}-code-line-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3.25rem minmax(0, 1fr)',
                  gap: 12,
                  padding: '0 12px 0 0',
                }}
              >
                <span style={{ userSelect: 'none', textAlign: 'right', color: 'rgba(148, 163, 184, 0.72)' }}>{index + 1}</span>
                <span>{renderHighlightedCodeLine(line, index)}</span>
              </span>
            ))}
          </code>
        ) : (
          <code>
            {lines.map((line, index) => (
              <React.Fragment key={`${element.id}-code-line-fragment-${index}`}>
                {renderHighlightedCodeLine(line, index)}
                {index < lines.length - 1 ? '\n' : null}
              </React.Fragment>
            ))}
          </code>
        )}
      </pre>
      {caption && (
        <figcaption style={{ padding: '8px 12px', borderTop: '1px solid rgba(148, 163, 184, 0.24)', color: 'rgba(226, 232, 240, 0.72)', fontSize: 12 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const clampInteractiveNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseFloat(value)
      : fallback;

  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
};

const interactiveControlValue = (
  controls: Array<Record<string, unknown>> | undefined,
  key: string,
): unknown => (
  controls?.find((control) => getNameClass(control.key) === key)?.value
    ?? controls?.find((control) => getNameClass(control.key) === key)?.defaultValue
);

function CommunicationRoundsFigure({
  element,
  fallback,
  componentKey,
  version,
}: {
  element: CanvasElement;
  fallback: InteractiveFallback;
  componentKey: string;
  version: string;
}) {
  const { props, styles } = element;
  const controls = Array.isArray(element.controls)
    ? element.controls
    : Array.isArray(props.controls)
      ? props.controls as Array<Record<string, unknown>>
      : undefined;
  const roundCount = clampInteractiveNumber(
    props.rounds ?? interactiveControlValue(controls, 'rounds'),
    4,
    1,
    12,
  );
  const speed = getNameClass(props.speed ?? interactiveControlValue(controls, 'speed')) || 'normal';
  const intervalMs = speed === 'fast' ? 1100 : speed === 'slow' ? 2600 : 1700;
  const [activeRound, setActiveRound] = useState(1);

  useEffect(() => {
    setActiveRound((current) => Math.min(current, roundCount));
  }, [roundCount]);

  useEffect(() => {
    if (speed === 'paused') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveRound((current) => (current >= roundCount ? 1 : current + 1));
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [intervalMs, roundCount, speed]);

  const title = getNameClass(fallback.title) || getNameClass(props.title) || 'Self-correction at work';
  const text = getNameClass(fallback.text) || getNameClass(props.fallbackText) || 'Outputs improve as feedback is exchanged across communication rounds.';
  const rounds = Array.from({ length: roundCount }, (_, index) => {
    const round = index + 1;
    const progress = round / roundCount;
    return {
      round,
      label: `Round ${round}`,
      quality: Math.round(42 + progress * 52),
      active: round === activeRound,
      completed: round <= activeRound,
    };
  });

  return (
    <figure
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 14,
        minHeight: '100%',
        margin: 0,
        padding: 18,
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        background: '#f8fafc',
        color: '#111827',
        overflow: 'hidden',
        ...styles,
      }}
      role="group"
      aria-label={getNameClass(fallback.ariaLabel) || title}
      data-backy-interactive-component={componentKey}
      data-backy-interactive-version={version}
      data-backy-hydration-mode="trusted-component"
    >
      <figcaption style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 18, lineHeight: 1.2 }}>{title}</strong>
        <span style={{ fontSize: 13, lineHeight: 1.45, color: '#475569' }}>{text}</span>
      </figcaption>

      <div
        style={{
          display: 'grid',
          alignItems: 'center',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${roundCount}, minmax(0, 1fr))`,
            gap: 8,
            alignItems: 'end',
          }}
          aria-label="Communication round progression"
        >
          {rounds.map((round) => (
            <button
              key={round.round}
              type="button"
              onClick={() => setActiveRound(round.round)}
              style={{
                minWidth: 0,
                height: Math.max(42, 54 + round.quality * 0.9),
                border: `1px solid ${round.active ? '#0f766e' : '#cbd5e1'}`,
                borderRadius: 6,
                background: round.completed ? '#ccfbf1' : '#ffffff',
                color: '#0f172a',
                padding: '8px 4px',
                display: 'grid',
                alignContent: 'end',
                gap: 6,
                cursor: 'pointer',
                transition: 'height 220ms ease, background 220ms ease, border-color 220ms ease, transform 220ms ease',
                transform: round.active ? 'translateY(-4px)' : 'translateY(0)',
              }}
              aria-pressed={round.active}
              aria-label={`${round.label}, quality ${round.quality} percent`}
            >
              <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                R{round.round}
              </span>
              <span style={{ fontSize: 11, color: '#0f766e' }}>{round.quality}%</span>
            </button>
          ))}
        </div>

        <div
          style={{
            minHeight: 72,
            borderRadius: 8,
            border: '1px solid #dbeafe',
            background: '#eff6ff',
            padding: 12,
            display: 'grid',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
            Active round {activeRound}
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.45, color: '#1e293b' }}>
            {activeRound === 1
              ? 'The first response establishes a baseline.'
              : activeRound === roundCount
                ? 'The final response integrates the accumulated corrections.'
                : 'Feedback is incorporated and the next response becomes more aligned.'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{componentKey} {version}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setActiveRound((current) => Math.max(1, current - 1))} style={{ border: '1px solid #cbd5e1', borderRadius: 6, background: '#ffffff', padding: '4px 8px', fontSize: 12 }}>
            Previous
          </button>
          <button type="button" onClick={() => setActiveRound((current) => (current >= roundCount ? 1 : current + 1))} style={{ border: '1px solid #0f766e', borderRadius: 6, background: '#0f766e', color: '#ffffff', padding: '4px 8px', fontSize: 12 }}>
            Next
          </button>
        </div>
      </div>
    </figure>
  );
}

const buildInteractiveSandboxPayload = (
  element: CanvasElement,
  componentKey: string,
  version: string,
  fallback: InteractiveFallback,
): Record<string, unknown> => {
  const props = JSON.parse(JSON.stringify(element.props || {})) as Record<string, unknown>;
  delete props.sandboxUrl;
  delete props.iframeUrl;
  delete props.url;
  delete props.src;
  delete props.fallback;
  delete props.renderCapabilities;

  return {
    type: 'backy.interactive-component.init',
    protocol: 'backy.interactive-component.v1',
    componentKey,
    version,
    props,
    controls: Array.isArray(element.controls) ? element.controls : props.controls,
    fallback,
  };
};

function SandboxedCodeComponentFrame({
  element,
  fallback,
  componentKey,
  version,
  src,
  renderCapabilities,
  siteId,
  pageId,
  postId,
}: {
  element: CanvasElement;
  fallback: InteractiveFallback;
  componentKey: string;
  version: string;
  src: string;
  renderCapabilities: Record<string, unknown>;
  siteId?: string;
  pageId?: string;
  postId?: string;
}) {
  const { props, styles } = element;
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const title = getNameClass(fallback.title) || getNameClass(props.title) || 'Sandboxed component';
  const iframeSandbox = normalizeInteractiveIframeSandbox(props.sandbox ?? renderCapabilities.sandbox);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const [runtimeError, setRuntimeError] = useState('');
  const payload = useMemo(
    () => buildInteractiveSandboxPayload(element, componentKey, version, fallback),
    [componentKey, element, fallback, version],
  );
  const reportRuntimeError = useCallback((message: string, messageType: string) => {
    if (!siteId || typeof window === 'undefined') {
      return;
    }

    const body = {
      type: messageType,
      componentKey,
      version,
      elementId: element.id,
      pageId,
      postId,
      message,
    };

    window.fetch(`/api/sites/${encodeURIComponent(siteId)}/interactive-components/runtime-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // Runtime telemetry is diagnostic only; rendering should not depend on it.
    });
  }, [componentKey, element.id, pageId, postId, siteId, version]);
  const postInitPayload = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const frame = frameRef.current;
    if (!frame?.contentWindow) {
      return;
    }

    const targetOrigin = interactiveIframeUsesOpaqueOrigin(iframeSandbox)
      ? '*'
      : new URL(src, window.location.origin).origin;
    frame.contentWindow.postMessage(payload, targetOrigin);
  }, [iframeSandbox, payload, src]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeout = window.setTimeout(postInitPayload, 0);

    return () => window.clearTimeout(timeout);
  }, [postInitPayload]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !isRecord(event.data)) {
        return;
      }

      const protocol = getNameClass(event.data.protocol);
      if (protocol !== 'backy.interactive-component.v1') {
        return;
      }

      const messageComponentKey = getNameClass(event.data.componentKey);
      const messageVersion = getNameClass(event.data.version);
      if (messageComponentKey && messageComponentKey !== componentKey) {
        return;
      }
      if (messageVersion && messageVersion !== version) {
        return;
      }

      const messageType = getNameClass(event.data.type);
      if (messageType === 'backy.interactive-component.ready') {
        setRuntimeError('');
        postInitPayload();
      }

      if (messageType === 'backy.interactive-component.resize') {
        const nextHeight = typeof event.data.height === 'number'
          ? event.data.height
          : typeof event.data.height === 'string'
            ? Number.parseFloat(event.data.height)
            : null;

        if (nextHeight !== null && Number.isFinite(nextHeight)) {
          setFrameHeight(Math.max(120, Math.min(2400, Math.round(nextHeight))));
        }
      }

      if (messageType === 'backy.interactive-component.error') {
        const message = getNameClass(event.data.message) || 'Interactive component failed to load.';
        setRuntimeError(message);
        reportRuntimeError(message, messageType);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [componentKey, postInitPayload, reportRuntimeError, version]);

  return (
    <div
      style={{
        display: 'grid',
        gap: runtimeError ? 8 : 0,
        width: '100%',
        height: '100%',
        minHeight: '100%',
      }}
      data-backy-interactive-component={componentKey}
      data-backy-interactive-version={version}
      data-backy-hydration-mode="sandbox-iframe"
      data-backy-sandboxed-code-component="true"
      data-backy-sandbox-runtime-error={runtimeError || undefined}
    >
      <iframe
        ref={frameRef}
        title={title}
        src={src}
        sandbox={iframeSandbox}
        allow={normalizeInteractiveIframeAllow(props.allow ?? renderCapabilities.allowedPermissions)}
        loading={normalizeIframeLoading(props.loading)}
        referrerPolicy="no-referrer"
        onLoad={postInitPayload}
        style={{
          width: '100%',
          height: frameHeight ? `${frameHeight}px` : '100%',
          minHeight: '100%',
          border: '1px solid #374151',
          borderRadius: 8,
          background: '#111827',
          color: '#f9fafb',
          ...styles,
        }}
        aria-label={getNameClass(fallback.ariaLabel) || title}
      />
      {runtimeError && (
        <p style={{ margin: 0, color: '#b91c1c', fontSize: 13, lineHeight: 1.4 }}>
          {runtimeError}
        </p>
      )}
    </div>
  );
}

/**
 * Render trusted built-in interactive components, otherwise keep a static
 * fallback until a registry bundle or sandbox runtime is mounted.
 */
function InteractiveComponentElement({ element, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles } = element;
  const rawFallback = element.fallback ?? props.fallback;
  const fallback = typeof rawFallback === 'string'
    ? { text: rawFallback }
    : isRecord(rawFallback)
      ? rawFallback as InteractiveFallback
      : {};
  const title = getNameClass(fallback.title) || getNameClass(props.title) || getNameClass(props.componentKey) || element.componentKey || 'Interactive component';
  const text = getNameClass(fallback.text) || getNameClass(props.fallbackText) || 'Interactive content is available in supported frontends.';
  const html = sanitizeHtmlMarkup(fallback.html);
  const imageUrl = getNameClass(fallback.imageUrl);
  const alt = getNameClass(fallback.alt) || title;
  const componentKey = element.componentKey || getNameClass(props.componentKey);
  const version = element.version || getNameClass(props.version);
  const renderCapabilities = isRecord(element.renderCapabilities)
    ? element.renderCapabilities
    : isRecord(props.renderCapabilities)
      ? props.renderCapabilities
      : {};
  const hydrationMode = getNameClass(renderCapabilities.hydrationMode);

  if (element.type === 'interactiveFigure' && componentKey === 'backy.figure.rounds') {
    return (
      <CommunicationRoundsFigure
        element={element}
        fallback={fallback}
        componentKey={componentKey}
        version={version || '1.0.0'}
      />
    );
  }

  const sandboxSrc = normalizeInteractiveSandboxUrl(props.sandboxUrl ?? props.iframeUrl ?? props.url ?? props.src);
  if (element.type === 'codeComponent' && hydrationMode === 'sandbox-iframe' && sandboxSrc) {
    return (
      <SandboxedCodeComponentFrame
        element={element}
        fallback={fallback}
        componentKey={componentKey || 'backy.custom.sandboxed'}
        version={version || '1.0.0'}
        src={sandboxSrc}
        renderCapabilities={renderCapabilities}
        siteId={siteId}
        pageId={pageId}
        postId={postId}
      />
    );
  }

  return (
    <figure
      style={{
        display: 'grid',
        alignContent: 'center',
        minHeight: '100%',
        margin: 0,
        padding: '16px',
        border: '1px solid #d1d5db',
        background: '#f9fafb',
        color: '#111827',
        ...styles,
      }}
      role="group"
      aria-label={getNameClass(fallback.ariaLabel) || title}
      data-backy-interactive-component={componentKey || undefined}
      data-backy-interactive-version={version || undefined}
      data-backy-hydration-mode="static-fallback"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={alt}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          loading="lazy"
        />
      )}
      <figcaption>
        <strong>{title}</strong>
        {html ? (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span>{text}</span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Render a list element
 */
function ListElement({ element }: ElementRendererProps) {
  const { props, styles } = element;
  const options = parseListItemEntries(props.items, props.content);
  const listTypeFromType = getNameClass(props.listType);
  const listType = listTypeFromType === 'number' || listTypeFromType === 'ordered' ? 'ol' : 'ul';
  const listIndent = getNonNegativeLength(props.listIndent, 0);
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
      ? options.map((item, index) => (
        <li
          key={`${element.id}-${item.text}-${index}`}
          style={item.indent ? { marginLeft: `${item.indent * 24}px` } : undefined}
        >
          {item.text}
        </li>
      ))
      : [<li key={`${element.id}-empty`}>List item</li>]),
  );
}

const repeaterRecordRawValue = (
  record: Record<string, unknown>,
  field: unknown,
  fallbackFields: string[],
): unknown => {
  const values = isRecord(record.values) ? record.values : {};
  const fieldKey = typeof field === 'string' && field.length > 0
    ? field
    : fallbackFields.find((key) => values[key] !== undefined);
  return fieldKey ? values[fieldKey] : undefined;
};

const repeaterRecordValue = (
  record: Record<string, unknown>,
  field: unknown,
  fallbackFields: string[],
): string => {
  const value = repeaterRecordRawValue(record, field, fallbackFields);

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

const repeaterRecordImageValue = (
  record: Record<string, unknown>,
  field: unknown,
  fallbackFields: string[],
): string => {
  const value = repeaterRecordRawValue(record, field, fallbackFields);

  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    return (
      getNameClass(value.url) ||
      getNameClass(value.src) ||
      getNameClass(value.publicUrl) ||
      getNameClass(value.path)
    );
  }

  return '';
};

const repeaterRecordPathValue = (
  record: Record<string, unknown>,
  path: string,
): unknown => {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return undefined;
  }

  const values = isRecord(record.values) ? record.values : {};
  if (Object.prototype.hasOwnProperty.call(values, normalizedPath)) {
    return values[normalizedPath];
  }
  if (Object.prototype.hasOwnProperty.call(record, normalizedPath)) {
    return record[normalizedPath];
  }

  const parts = normalizedPath.split('.').filter(Boolean);
  const readPath = (root: unknown): unknown => {
    let current = root;
    for (const part of parts) {
      if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  };

  const nestedValue = readPath(values);
  return nestedValue === undefined ? readPath(record) : nestedValue;
};

const repeaterRecordVirtualValue = (
  record: Record<string, unknown>,
  field: string,
  targetPath: string,
): unknown => {
  const urlTarget = /(?:^|\.)href$|url$/i.test(targetPath);
  if (field === 'id') return record.id;
  if (field === 'slug') {
    if (urlTarget) {
      return getNameClass(record.href) || getNameClass(record.url) || getNameClass(record.slug);
    }
    return record.slug;
  }
  if (field === 'href' || field === 'url') {
    return getNameClass(record.href) || getNameClass(record.url) || getNameClass(record.slug);
  }
  if (field === 'status') return record.status;
  if (field === 'createdAt') return record.createdAt;
  if (field === 'updatedAt') return record.updatedAt;
  return undefined;
};

const repeaterRecordBindingRawValue = (
  record: Record<string, unknown>,
  binding: Record<string, unknown>,
  targetPath: string,
): unknown => {
  const source = isRecord(binding.source) ? binding.source : binding;
  const sourceKind = getNameClass(source.kind);
  if (sourceKind && sourceKind !== 'collection') {
    return undefined;
  }

  const field = getNameClass(source.field || binding.field);
  const path = getNameClass(source.path || binding.path);
  const virtualValue = field ? repeaterRecordVirtualValue(record, field, targetPath) : undefined;
  if (virtualValue !== undefined) {
    return virtualValue;
  }

  if (path) {
    const pathValue = repeaterRecordPathValue(record, path);
    if (pathValue !== undefined) {
      return pathValue;
    }
  }

  return field ? repeaterRecordPathValue(record, field) : undefined;
};

const repeaterRecordDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(repeaterRecordDisplayValue).filter(Boolean).join(', ');
  if (isRecord(value)) {
    return (
      getNameClass(value.label)
      || getNameClass(value.title)
      || getNameClass(value.name)
      || getNameClass(value.value)
      || getNameClass(value.text)
      || getNameClass(value.slug)
      || parseAttributeString(value.url)
      || parseAttributeString(value.href)
      || parseAttributeString(value.src)
      || ''
    );
  }

  return '';
};

const repeaterRecordPropValue = (targetPath: string, rawValue: unknown): unknown => {
  const propName = targetPath.slice('props.'.length);
  const normalizedProp = propName.toLowerCase();

  if (normalizedProp === 'src' || normalizedProp.endsWith('url') || normalizedProp === 'href') {
    return parseAttributeString(rawValue) || repeaterRecordDisplayValue(rawValue);
  }

  if (normalizedProp === 'assetid' || normalizedProp === 'mediaid') {
    return isRecord(rawValue)
      ? getNameClass(rawValue.id) || parseAttributeString(rawValue)
      : rawValue;
  }

  if (
    normalizedProp === 'content'
    || normalizedProp === 'text'
    || normalizedProp === 'label'
    || normalizedProp === 'title'
    || normalizedProp === 'alt'
    || normalizedProp === 'placeholder'
    || normalizedProp === 'arialabel'
    || normalizedProp === 'description'
    || normalizedProp === 'summary'
  ) {
    return repeaterRecordDisplayValue(rawValue);
  }

  return isRecord(rawValue) || Array.isArray(rawValue)
    ? repeaterRecordDisplayValue(rawValue)
    : rawValue;
};

const applyRepeaterRecordBindings = (
  element: CanvasElement,
  record: Record<string, unknown>,
): CanvasElement => {
  const bindings = Array.isArray(element.dataBindings)
    ? element.dataBindings.filter(isRecord)
    : [];

  if (bindings.length === 0) {
    return element;
  }

  let nextProps = element.props;
  let changed = false;
  for (const binding of bindings) {
    const targetPath = getNameClass(binding.targetPath) || 'props.content';
    if (!targetPath.startsWith('props.')) {
      continue;
    }

    const propName = targetPath.slice('props.'.length);
    if (!propName) {
      continue;
    }

    const rawValue = repeaterRecordBindingRawValue(record, binding, targetPath);
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    nextProps = {
      ...nextProps,
      [propName]: repeaterRecordPropValue(targetPath, rawValue),
    };
    changed = true;
  }

  return changed ? { ...element, props: nextProps } : element;
};

const repeaterTemplateHeight = (element: CanvasElement): string => {
  const explicitHeight = getLength(element.props.itemHeight);
  if (explicitHeight) {
    return explicitHeight;
  }

  const childExtent = (element.children || []).reduce((height, child) => {
    const childTop = typeof child.y === 'number' && Number.isFinite(child.y) ? child.y : 0;
    const childHeight = typeof child.height === 'number' && Number.isFinite(child.height) ? child.height : 0;
    return Math.max(height, childTop + childHeight);
  }, 0);

  return `${Math.max(160, childExtent)}px`;
};

/**
 * Render a collection-backed repeater/list element.
 */
function RepeaterElement({ element, isPreview, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles, children } = element;
  const records = Array.isArray(props.records)
    ? props.records.filter(isRecord)
    : [];
  const columns = Math.max(1, Math.min(6, typeof props.columns === 'number' ? props.columns : 3));
  const gap = getLength(props.gap, '16px');
  const titleField = typeof props.titleField === 'string' ? props.titleField : 'title';
  const descriptionField = typeof props.descriptionField === 'string' ? props.descriptionField : 'summary';
  const imageField = typeof props.imageField === 'string' ? props.imageField : '';
  const metaField = typeof props.metaField === 'string' ? props.metaField : '';
  const emptyMessage = getNameClass(props.emptyMessage) || 'No records yet.';
  const templateChildren = children || [];
  const templateHeight = repeaterTemplateHeight(element);

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
      ) : records.map((record, recordIndex) => {
        const recordId = typeof record.id === 'string' ? record.id : `${element.id}-record-${recordIndex}`;
        if (templateChildren.length > 0) {
          return (
            <div
              key={`${element.id}-${recordId}`}
              data-backy-repeater-record={recordId}
              style={{
                position: 'relative',
                minWidth: 0,
                width: '100%',
                minHeight: templateHeight,
                height: templateHeight,
                overflow: 'visible',
              }}
            >
              {templateChildren.map((child) => (
                <ElementRenderer
                  key={`${recordId}-${child.id}`}
                  element={child}
                  isPreview={isPreview}
                  siteId={siteId}
                  pageId={pageId}
                  postId={postId}
                  repeaterRecord={record}
                />
              ))}
            </div>
          );
        }

        const title = repeaterRecordValue(record, titleField, ['title', 'name', 'label', 'slug']);
        const description = repeaterRecordValue(record, descriptionField, ['summary', 'description', 'excerpt', 'body']);
        const imageSrc = repeaterRecordImageValue(record, imageField, ['image', 'thumbnail', 'photo', 'avatar', 'cover_image']);
        const meta = repeaterRecordValue(record, metaField, ['category', 'categories', 'topic', 'type', 'status']);
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
            {imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt={title || getNameClass(record.slug) || ''}
                style={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  objectFit: 'cover',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
                loading="lazy"
              />
            ) : null}
            {meta ? (
              <div style={{ marginBottom: 8, fontSize: 12, lineHeight: 1.2, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0 }}>
                {meta}
              </div>
            ) : null}
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
  const quoteText = getNameClass(props.content) || getSlateText(props.content) || getNameClass(props.text);
  const citation = getNameClass(props.citation);

  return (
    <blockquote
      style={{
        ...getAppearanceStyle(props as Record<string, unknown>),
        margin: 0,
        paddingLeft: getLength(props.quotePaddingLeft, '1rem'),
        borderLeft: `${getLength(props.quoteBorderWidth, '4px')} solid ${getNameClass(props.quoteBorderColor) || 'rgba(0,0,0,0.2)'}`,
        color: getNameClass(props.color) || '#334155',
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
      }}
    >
      {quoteText}
      {citation ? (
        <cite
          style={{
            display: 'block',
            marginTop: '0.5rem',
            color: getNameClass(props.citationColor) || '#64748b',
            fontSize: getLength(props.citationFontSize, '0.875em'),
            fontStyle: 'normal',
          }}
        >
          {citation}
        </cite>
      ) : null}
    </blockquote>
  );
}

/**
 * Render a link-like element
 */
function LinkElement({ element, siteId, pageId, postId }: ElementRendererProps) {
  const { props, styles } = element;
  const linkText = getNameClass(props.content) || getNameClass(props.label) || 'Link';
  const target = normalizeLinkTargetValue(props.target);
  const rel = normalizeLinkRelValue(target, props.rel);
  const title = getNameClass(props.title) || undefined;
  const ariaLabel = getNameClass(props.ariaLabel) || undefined;

  return (
    <a
      href={getNameClass(props.href) || '#'}
      target={target}
      rel={rel}
      download={getBooleanWithFallback(props.download, false) ? '' : undefined}
      title={title}
      aria-label={ariaLabel}
      {...fileDownloadDataAttributes(props)}
      style={{
        ...styles,
        ...getTypographyStyle(props as Record<string, unknown>),
        display: 'inline-block',
        textDecoration: props.underline === false
          ? 'none'
          : props.underline === true
            ? 'underline'
            : getNameClass(props.textDecoration) || undefined,
      }}
    >
      {linkText}
    </a>
  );
}

function FormSchemaFieldElement({
  field,
  index,
  formProps,
}: {
  field: FormSchemaField;
  index: number;
  formProps: Record<string, unknown>;
}) {
  const fieldId = `schema-field-${field.key}-${index}`;
  const options = parseOptionValues(field.options);
  const minLength = parseNumericAttribute(getFormSchemaValidationValue(field, 'minLength'));
  const maxLength = parseNumericAttribute(getFormSchemaValidationValue(field, 'maxLength'));
  const min = parseAttributeString(getFormSchemaValidationValue(field, 'min'));
  const max = parseAttributeString(getFormSchemaValidationValue(field, 'max'));
  const pattern = parseAttributeString(getFormSchemaValidationValue(field, 'pattern'));
  const controlStyle = {
    ...getFieldControlStyle(formProps),
    width: '100%',
    minHeight: getLength(formProps.inputHeight, '40px'),
  };
  const labelStyle: React.CSSProperties = {
    color: getNameClass(formProps.labelColor) || getNameClass(formProps.color) || '#374151',
    fontWeight: getNameClass(formProps.labelFontWeight) || 500,
    fontSize: getLength(formProps.labelFontSize, '14px'),
  };
  const helpStyle: React.CSSProperties = {
    margin: 0,
    color: getNameClass(formProps.helpTextColor) || '#6b7280',
    fontSize: getLength(formProps.helpTextFontSize, '12px'),
    lineHeight: 1.4,
  };

  let control: React.ReactNode;
  if (field.type === 'textarea') {
    control = (
      <textarea
        id={fieldId}
        name={field.key}
        placeholder={field.placeholder}
        required={field.required}
        disabled={field.disabled}
        minLength={minLength}
        maxLength={maxLength}
        defaultValue={field.defaultValue}
        rows={5}
        style={{
          ...controlStyle,
          resize: getSafeResize(formProps.resize),
        }}
      />
    );
  } else if (field.type === 'select') {
    control = (
      <select
        id={fieldId}
        name={field.key}
        required={field.required}
        disabled={field.disabled}
        defaultValue={field.defaultValue || ''}
        style={controlStyle}
      >
        {field.placeholder || options.length === 0 ? (
          <option value="" disabled={options.length > 0}>
            {field.placeholder || 'Select'}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  } else if (field.type === 'checkbox' || field.type === 'radio') {
    const inputType = field.type;
    const defaultValues = toFormInputValueList(field.defaultValue);
    const defaultSet = new Set(defaultValues);
    const choices = options.length > 0 ? options : [field.defaultValue || 'on'];

    control = (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px 10px',
          border: controlStyle.border,
          borderRadius: controlStyle.borderRadius,
          backgroundColor: controlStyle.backgroundColor,
        }}
      >
        {choices.map((option, optionIndex) => (
          <label
            key={`${field.key}-${option}-${optionIndex}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <input
              type={inputType}
              name={field.key}
              value={option}
              required={inputType === 'checkbox' ? optionIndex === 0 && field.required : field.required}
              disabled={field.disabled}
              defaultChecked={inputType === 'radio' ? defaultValues[0] === option : defaultSet.has(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  } else {
    control = (
      <input
        id={fieldId}
        type={normalizeInputType(field.type)}
        name={field.key}
        placeholder={field.placeholder}
        required={field.required}
        disabled={field.disabled}
        min={min}
        max={max}
        pattern={pattern}
        minLength={minLength}
        maxLength={maxLength}
        defaultValue={field.type === 'file' ? undefined : field.defaultValue}
        style={controlStyle}
      />
    );
  }

  return (
    <div
      data-backy-form-schema-field={field.key}
      data-backy-form-schema-field-type={field.type}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: getLength(formProps.fieldGap, '6px'),
      }}
    >
      {field.label ? (
        <label htmlFor={fieldId} style={labelStyle}>
          {field.label}
          {field.required ? ' *' : ''}
        </label>
      ) : null}
      {control}
      {field.helpText ? <p style={helpStyle}>{field.helpText}</p> : null}
    </div>
  );
}

/**
 * Render a form element
 */
function FormElement({ element, isPreview, siteId, pageId, postId, repeaterRecord }: ElementRendererProps) {
  const { props, styles, children } = element;
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitValidation, setSubmitValidation] = useState<FormValidationDetail[]>([]);
  const [submitMeta, setSubmitMeta] = useState<{
    status: string;
    submissionId?: string;
  } | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaStatus, setCaptchaStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const startedAtRef = useRef<number>(Date.now());
  const captchaWidgetRef = useRef<HTMLDivElement | null>(null);

  const formId = typeof props.formId === 'string' ? props.formId : undefined;
  const fallbackFormId = getNameClass(formId || element.id).trim();
  const resolvedFormId = fallbackFormId.length > 0 ? fallbackFormId : `form-${Math.random().toString(36).slice(2, 8)}`;
  const backyAction = siteId && resolvedFormId
    ? `/api/sites/${siteId}/forms/${resolvedFormId}/submissions`
    : undefined;
  const configuredAction =
    getNameClass(props.action) ||
    getNameClass(props.actionUrl) ||
    backyAction;

  const isBackyAction = Boolean(backyAction && configuredAction === backyAction);
  const method = (getNameClass(props.method) || 'POST').toUpperCase();
  const formActive = props.formActive !== false && getNameClass(props.formActive).toLowerCase() !== 'false';
  const rawAudience = getNameClass(props.formAudience);
  const formAudience = rawAudience === 'authenticated' || rawAudience === 'adminOnly' ? rawAudience : 'public';
  const enableHoneypot = parseBooleanSetting(props.enableHoneypot, false);
  const enableCaptcha = parseBooleanSetting(props.enableCaptcha, false);
  const captchaProvider = normalizeCaptchaProvider(props.captchaProvider);
  const captchaSiteKey = getNameClass(props.captchaSiteKey);
  const captchaWidgetClass = getCaptchaWidgetClass(captchaProvider);
  const contactShareEnabled = parseBooleanSetting(props.contactShareEnabled, false);
  const contactShareNameField = getNameClass(props.contactShareNameField);
  const contactShareEmailField = getNameClass(props.contactShareEmailField);
  const contactSharePhoneField = getNameClass(props.contactSharePhoneField);
  const contactShareNotesField = getNameClass(props.contactShareNotesField);
  const contactShareDedupeByEmail = props.contactShareDedupeByEmail === undefined
    ? undefined
    : parseBooleanSetting(props.contactShareDedupeByEmail, true);
  const collectionWriteEnabled = parseBooleanSetting(props.collectionWriteEnabled, false);
  const collectionWriteCollectionId = getNameClass(props.collectionWriteCollectionId || props.collectionId);
  const collectionWriteSlugField = getNameClass(props.collectionWriteSlugField);
  const collectionWriteFieldMap = serializeFormFieldMap(props.collectionWriteFieldMap);
  const successRedirectUrl = getNameClass(props.successRedirectUrl || props.redirectUrl);
  const safeSuccessRedirectUrl = getSafeFormRedirectUrl(successRedirectUrl);
  const successMessage =
    getNameClass((props as { successMessage?: unknown }).successMessage) ||
    'Thanks. Your message was sent.';
  const formTitle = getNameClass(props.formTitle);
  const schemaFields = normalizeFormSchemaFields(props.fields || props.formFields || props.schema);
  const submitLabel = getNameClass(props.submitLabel) || 'Submit';
  const requestId = useRef<string>(`f-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);

  useEffect(() => {
    if (!enableCaptcha) {
      setCaptchaToken('');
      setCaptchaStatus('idle');
      return;
    }

    if (isPreview) {
      setCaptchaStatus('idle');
      return;
    }

    if (captchaProvider === 'mock') {
      const mockToken = getNameClass(props.captchaMockToken || props.mockCaptchaToken);
      setCaptchaToken(mockToken);
      setCaptchaStatus(mockToken ? 'ready' : 'idle');
      return;
    }

    if (!captchaSiteKey || !captchaWidgetRef.current) {
      setCaptchaStatus('idle');
      return;
    }

    let isCancelled = false;
    let widgetId: string | number | undefined;
    setCaptchaStatus('loading');
    setCaptchaToken('');

    const resolveToken = (token: string) => {
      if (!isCancelled) {
        setCaptchaToken(token);
        setCaptchaStatus('ready');
      }
    };
    const clearToken = () => {
      if (!isCancelled) {
        setCaptchaToken('');
        setCaptchaStatus('idle');
      }
    };

    loadCaptchaScript(captchaProvider)
      .then(() => {
        if (isCancelled || !captchaWidgetRef.current) {
          return;
        }

        captchaWidgetRef.current.innerHTML = '';
        const captchaWindow = window as unknown as {
          turnstile?: {
            render: (container: HTMLElement, options: Record<string, unknown>) => string;
            remove?: (id: string) => void;
          };
          hcaptcha?: {
            render: (container: HTMLElement, options: Record<string, unknown>) => string | number;
            remove?: (id: string | number) => void;
            reset?: (id: string | number) => void;
          };
          grecaptcha?: {
            render: (container: HTMLElement, options: Record<string, unknown>) => number;
            reset?: (id: number) => void;
          };
        };

        if (captchaProvider === 'turnstile' && captchaWindow.turnstile?.render) {
          widgetId = captchaWindow.turnstile.render(captchaWidgetRef.current, {
            sitekey: captchaSiteKey,
            callback: resolveToken,
            'expired-callback': clearToken,
            'error-callback': () => {
              clearToken();
              setCaptchaStatus('error');
            },
          });
          return;
        }

        if (captchaProvider === 'hcaptcha' && captchaWindow.hcaptcha?.render) {
          widgetId = captchaWindow.hcaptcha.render(captchaWidgetRef.current, {
            sitekey: captchaSiteKey,
            callback: resolveToken,
            'expired-callback': clearToken,
            'error-callback': () => {
              clearToken();
              setCaptchaStatus('error');
            },
          });
          return;
        }

        if (captchaProvider === 'recaptcha' && captchaWindow.grecaptcha?.render) {
          widgetId = captchaWindow.grecaptcha.render(captchaWidgetRef.current, {
            sitekey: captchaSiteKey,
            callback: resolveToken,
            'expired-callback': clearToken,
            'error-callback': () => {
              clearToken();
              setCaptchaStatus('error');
            },
          });
          return;
        }

        setCaptchaStatus('error');
      })
      .catch(() => {
        if (!isCancelled) {
          setCaptchaStatus('error');
          setCaptchaToken('');
        }
      });

    return () => {
      isCancelled = true;
      const captchaWindow = window as unknown as {
        turnstile?: { remove?: (id: string) => void };
        hcaptcha?: { remove?: (id: string | number) => void; reset?: (id: string | number) => void };
        grecaptcha?: { reset?: (id: number) => void };
      };
      if (captchaProvider === 'turnstile' && typeof widgetId === 'string') {
        captchaWindow.turnstile?.remove?.(widgetId);
      } else if (captchaProvider === 'hcaptcha' && widgetId !== undefined) {
        captchaWindow.hcaptcha?.remove?.(widgetId);
      } else if (captchaProvider === 'recaptcha' && typeof widgetId === 'number') {
        captchaWindow.grecaptcha?.reset?.(widgetId);
      }
    };
  }, [captchaProvider, captchaSiteKey, enableCaptcha, isPreview, props.captchaMockToken, props.mockCaptchaToken]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (isPreview) {
      event.preventDefault();
      return;
    }

    if (!formActive) {
      event.preventDefault();
      setSubmitState('error');
      setSubmitMessage('This form is not accepting submissions.');
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
    const captchaToken = readFormValue(values, FORM_CAPTCHA_TOKEN_FIELDS);

    const body = {
      values,
      ...(enableHoneypot ? { honeypot: getNameClass(values.honeypot) } : {}),
      ...(enableCaptcha && captchaToken ? { captchaToken } : {}),
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

      if (status === 'pending' && !safeSuccessRedirectUrl) {
        return;
      }

      if (status === 'approved' && safeSuccessRedirectUrl) {
        window.location.assign(safeSuccessRedirectUrl);
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
        id={resolvedFormId}
        action={configuredAction}
        method={method}
        encType="multipart/form-data"
        aria-disabled={!formActive || undefined}
        data-backy-form-id={resolvedFormId}
        data-backy-form-active={formActive ? 'true' : 'false'}
        data-backy-form-audience={formAudience}
        data-backy-captcha-required={enableCaptcha ? 'true' : 'false'}
        data-backy-contact-share={contactShareEnabled ? 'true' : 'false'}
        data-backy-contact-name-field={contactShareEnabled && contactShareNameField ? contactShareNameField : undefined}
        data-backy-contact-email-field={contactShareEnabled && contactShareEmailField ? contactShareEmailField : undefined}
        data-backy-contact-phone-field={contactShareEnabled && contactSharePhoneField ? contactSharePhoneField : undefined}
        data-backy-contact-notes-field={contactShareEnabled && contactShareNotesField ? contactShareNotesField : undefined}
        data-backy-contact-dedupe-by-email={contactShareEnabled && contactShareDedupeByEmail !== undefined ? String(contactShareDedupeByEmail) : undefined}
        data-backy-collection-write={collectionWriteEnabled ? 'true' : 'false'}
        data-backy-collection-id={collectionWriteEnabled && collectionWriteCollectionId ? collectionWriteCollectionId : undefined}
        data-backy-collection-slug-field={collectionWriteEnabled && collectionWriteSlugField ? collectionWriteSlugField : undefined}
        data-backy-collection-field-map={collectionWriteEnabled ? collectionWriteFieldMap : undefined}
        data-backy-form-schema-count={schemaFields.length}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: getLength(props.gap, '16px'),
          ...getAppearanceStyle(props as Record<string, unknown>),
          ...styles,
        }}
        onSubmit={handleSubmit}
      >
        {formTitle ? <h3>{formTitle}</h3> : null}

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

        {enableCaptcha ? (
          <>
            <div
              ref={captchaWidgetRef}
              className={captchaWidgetClass}
              data-backy-captcha-widget=""
              data-backy-captcha-provider={captchaProvider}
              data-backy-captcha-status={captchaStatus}
              data-sitekey={captchaSiteKey || undefined}
              data-callback="backyFormCaptchaResolved"
              data-expired-callback="backyFormCaptchaExpired"
              aria-label="Captcha challenge"
            />
            <input
              type="hidden"
              name="captchaToken"
              data-backy-captcha-token=""
              data-backy-captcha-provider={captchaProvider}
              value={captchaToken}
              readOnly
            />
          </>
        ) : null}

        {schemaFields.map((field, index) => (
          <FormSchemaFieldElement
            key={`${field.key}-${index}`}
            field={field}
            index={index}
            formProps={props as Record<string, unknown>}
          />
        ))}

        {schemaFields.length > 0 ? (
          <button
            type="submit"
            data-backy-form-schema-submit=""
            disabled={!formActive}
            style={{
              width: 'fit-content',
              minHeight: getLength(props.submitHeight, '40px'),
              padding: getLength(props.submitPadding, '8px 16px'),
              border: getNameClass(props.submitBorder) || 'none',
              borderRadius: getLength(props.submitBorderRadius || props.borderRadius, '8px'),
              backgroundColor: getNameClass(props.submitBackgroundColor) || '#111827',
              color: getNameClass(props.submitColor) || '#ffffff',
              fontSize: getLength(props.submitFontSize || props.fontSize, '14px'),
              fontWeight: getNameClass(props.submitFontWeight) || '600',
              cursor: formActive ? 'pointer' : 'default',
            }}
          >
            {submitLabel}
          </button>
        ) : null}

        {children?.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            isPreview={isPreview}
            siteId={siteId}
            pageId={pageId}
            postId={postId}
            repeaterRecord={repeaterRecord}
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
  const formOwnerId = resolveFormOwnerId(props as Record<string, unknown>);
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
      data-backy-form-owner-id={formOwnerId}
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
        form={formOwnerId}
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
          ...getFieldControlStyle(props as Record<string, unknown>),
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
  const formOwnerId = resolveFormOwnerId(props as Record<string, unknown>);
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
      data-backy-form-owner-id={formOwnerId}
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
        form={formOwnerId}
        placeholder={getNameClass(props.placeholder)}
        required={getBoolean(props.required)}
        rows={Number.isFinite(rows) ? rows : 5}
        defaultValue={getNameClass(props.defaultValue)}
        disabled={getBoolean(props.disabled)}
        minLength={Number.isFinite(minLength) ? minLength : undefined}
        maxLength={maxLength}
        style={{
          ...getFieldControlStyle(props as Record<string, unknown>),
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
  const formOwnerId = resolveFormOwnerId(props as Record<string, unknown>);
  const defaultValue = parseAttributeString(props.defaultValue);
  const placeholder = getNameClass(props.placeholder);
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
      data-backy-form-owner-id={formOwnerId}
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
        form={formOwnerId}
        required={getBoolean(props.required)}
        disabled={getBoolean(props.disabled)}
        defaultValue={defaultValue || ''}
        style={{
          ...getFieldControlStyle(props as Record<string, unknown>),
          width: '100%',
          ...styles,
        }}
      >
        {placeholder || options.length === 0 ? (
          <option value="" disabled={options.length > 0}>
            {placeholder || 'Select'}
          </option>
        ) : null}
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
function CheckboxOrRadioElement({ element, isPreview, siteId, pageId, postId, repeaterRecord }: ElementRendererProps) {
  const { props, styles, children } = element;
  const inputType = normalizeRendererType(element.type) === 'checkbox' ? 'checkbox' : 'radio';
  const name = getNameClass(props.name) || `field-${element.id}`;
  const formOwnerId = resolveFormOwnerId(props as Record<string, unknown>);
  const options = parseOptionValues(props.options);
  const defaultValues = toFormInputValueList(
    props.defaultValue !== undefined ? props.defaultValue : props.value
  );
  const defaultSet = new Set(defaultValues);
  const required = getBoolean(props.required);
  const disabled = getBoolean(props.disabled);
  const label = getNameClass(props.label);
  const helpText = getNameClass(props.helpText);
  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: getLength(props.fieldGap, '8px'),
    ...getAppearanceStyle(props as Record<string, unknown>),
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
      <div style={wrapperStyle} data-backy-form-owner-id={formOwnerId}>
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
              form={formOwnerId}
              value={defaultValue || 'on'}
              required={required}
              disabled={disabled}
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
                form={formOwnerId}
                value={option}
                required={required}
                disabled={disabled}
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
            siteId={siteId}
            pageId={pageId}
            postId={postId}
            repeaterRecord={repeaterRecord}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={wrapperStyle} data-backy-form-owner-id={formOwnerId}>
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
              form={formOwnerId}
              value={getNameClass(props.value) || 'on'}
              required={required}
              disabled={disabled}
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
                form={formOwnerId}
                value={option}
                defaultChecked={defaultSet.has(option)}
                required={option === options[0] && required}
                disabled={disabled}
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
            siteId={siteId}
            pageId={pageId}
            postId={postId}
            repeaterRecord={repeaterRecord}
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

  const src = normalizeMapUrl(getMapSource(props), props.zoom);

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
        ...getAppearanceStyle(props as Record<string, unknown>),
        ...styles,
      }}
      loading={normalizeIframeLoading(props.loading)}
      allowFullScreen={getBooleanWithFallback(props.allowFullScreen, true)}
      referrerPolicy={normalizeIframeReferrerPolicy(props.referrerPolicy) || 'no-referrer'}
      data-backy-map-address={getNameClass(props.address) || undefined}
      data-backy-map-marker-label={getNameClass(props.markerLabel) || undefined}
      data-backy-map-marker-latitude={normalizeMapCoordinate(props.markerLatitude)}
      data-backy-map-marker-longitude={normalizeMapCoordinate(props.markerLongitude)}
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
  interactiveFigure: InteractiveComponentElement,
  codeBlock: CodeBlockElement,
  codeComponent: InteractiveComponentElement,
};

/**
 * Main element renderer - routes to specific element renderers
 */
export function ElementRenderer({ element, isPreview, siteId, pageId, postId, repeaterRecord }: ElementRendererProps) {
  const boundElement = repeaterRecord ? applyRepeaterRecordBindings(element, repeaterRecord) : element;
  const normalizedType = normalizeRendererType(boundElement.type);
  const Renderer = ELEMENT_RENDERERS[normalizedType];

  if (!Renderer) {
    console.warn(`Unknown element type: ${boundElement.type}`);
    return null;
  }

  if (getBooleanWithFallback(boundElement.props.hidden, false)) {
    return null;
  }

  if (!getBooleanWithFallback(boundElement.visible, true)) {
    return null;
  }

  // Build position styles for absolute positioning
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    left: boundElement.x,
    top: boundElement.y,
    width: boundElement.width,
    height: boundElement.height,
    transform: boundElement.rotation ? `rotate(${boundElement.rotation}deg)` : undefined,
    zIndex: boundElement.zIndex,
    opacity:
      typeof boundElement.props.opacity === 'number'
        ? boundElement.props.opacity
        : typeof boundElement.props.opacity === 'string'
          ? parseFloat(boundElement.props.opacity as string)
          : 1,
  };

  // Add animation data attributes for GSAP hydration
  const animationAttrs = boundElement.animation
    ? {
        'data-animation': JSON.stringify(boundElement.animation),
        'data-animation-type': boundElement.animation.type,
      }
    : {};

  return (
    <div
      style={positionStyles}
      data-backy-element-id={boundElement.id}
      data-backy-element-type={boundElement.type}
      data-element-id={boundElement.id}
      data-element-type={boundElement.type}
      {...animationAttrs}
    >
      <Renderer
        element={boundElement}
        isPreview={isPreview}
        siteId={siteId}
        pageId={pageId}
        postId={postId}
        repeaterRecord={repeaterRecord}
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
  const themeTokenContract = useMemo(() => buildBackyThemeTokens(themeForTokenCompiler(theme)), [theme]);
  const backyThemeVars = useMemo(
    () => buildBackyThemeCssVariables(themeTokenContract),
    [themeTokenContract],
  );
  const themeTokenReferences = useMemo(
    () => buildBackyThemeTokenReferences(themeTokenContract),
    [themeTokenContract],
  );
  const themedElements = useMemo(
    () => applyThemeTokenRefsToElements(elements, themeTokenReferences, backyThemeVars),
    [backyThemeVars, elements, themeTokenReferences],
  );
  const activeCanvasSize = activeBreakpoint === 'desktop'
    ? canvasSize
    : RENDER_BREAKPOINT_CANVAS_SIZE[activeBreakpoint];
  const contentBounds = useMemo(
    () => collectPublicRenderedContentBounds(elements),
    [elements],
  );
  const renderCanvasSize = useMemo(
    () => ({
      width: activeCanvasSize.width,
      height: Math.max(activeCanvasSize.height, Math.ceil(contentBounds.maxY + 48)),
    }),
    [activeCanvasSize.height, activeCanvasSize.width, contentBounds.maxY],
  );

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) {
      return;
    }

    const calculateScale = () => {
      const visualViewportWidth = window.visualViewport?.width || Number.POSITIVE_INFINITY;
      const windowViewportWidth = window.innerWidth || Number.POSITIVE_INFINITY;
      const viewportWidth = Math.floor(Math.min(visualViewportWidth, windowViewportWidth, container.clientWidth));
      const availableWidth = Math.max(320, Math.min(container.clientWidth, viewportWidth) - 24);
      const nextBreakpoint = resolveRendererBreakpoint(availableWidth);
      const nextCanvasSize = nextBreakpoint === 'desktop'
        ? canvasSize
        : RENDER_BREAKPOINT_CANVAS_SIZE[nextBreakpoint];
      setActiveBreakpoint(nextBreakpoint);
      const ratio = availableWidth / Math.max(nextCanvasSize.width, 1);
      const nextScale = Math.max(0.32, Math.min(1, ratio));
      setScale(nextScale);
    };

    calculateScale();
    const observer = new ResizeObserver(() => {
      calculateScale();
    });

    observer.observe(container);
    window.visualViewport?.addEventListener('resize', calculateScale);
    window.addEventListener('resize', calculateScale);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', calculateScale);
      window.removeEventListener('resize', calculateScale);
    };
  }, [canvasSize.width]);

  const styleHeight = Math.round(renderCanvasSize.height * scale);

  const viewportStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '12px',
    minHeight: styleHeight,
  };

  const canvasFrameStyle: React.CSSProperties = {
    position: 'relative',
    width: Math.round(renderCanvasSize.width * scale),
    height: Math.round(renderCanvasSize.height * scale),
    minHeight: Math.round(renderCanvasSize.height * scale),
    flex: '0 0 auto',
  };

  const canvasStyle: React.CSSProperties = {
    position: 'relative',
    width: renderCanvasSize.width,
    height: renderCanvasSize.height,
    minHeight: renderCanvasSize.height,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    transition: 'transform 140ms ease',
    willChange: 'transform',
  };

  const legacyThemeVars: React.CSSProperties = {};
  if (theme?.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      (legacyThemeVars as Record<string, string>)[`--color-${key}`] = value;
    });
  }

  if (theme?.fonts) {
    if (theme.fonts.heading) {
      (legacyThemeVars as Record<string, string>)['--font-heading'] = theme.fonts.heading;
    }
    if (theme.fonts.body) {
      (legacyThemeVars as Record<string, string>)['--font-body'] = theme.fonts.body;
    }
    if (theme.fonts.mono) {
      (legacyThemeVars as Record<string, string>)['--font-mono'] = theme.fonts.mono;
    }
  }

  if (theme?.spacing) {
    Object.entries(theme.spacing).forEach(([key, value]) => {
      (legacyThemeVars as Record<string, string>)[`--spacing-${key}`] = spacingTokenValue(value);
    });
  }

  const themeVars: React.CSSProperties = {
    ...legacyThemeVars,
    ...backyThemeVars,
  };

  const themeFontAssets: FontAsset[] = (theme?.fonts?.custom || [])
    .filter((font) => typeof font.name === 'string' && font.name.trim() && typeof font.url === 'string' && font.url.trim())
    .map((font, index) => ({
      id: `theme-font-${index}-${font.name}`,
      family: font.name,
      source: 'external' as const,
      url: font.url,
      weights: ['400'],
      styles: ['normal' as const],
      display: 'swap',
      cssFamily: `"${cssString(font.name)}", ${theme?.fonts?.body || 'system-ui, sans-serif'}`,
    }));

  const fontCssRules = [...themeFontAssets, ...fontAssets]
    .filter((font) => font.family && (font.url || font.variants?.some((variant) => variant.url)))
    .reduce<{ imports: string[]; faces: string[] }>((rules, font) => {
      const variants = font.variants?.length
        ? font.variants
        : [{
            id: font.id,
            mediaId: font.mediaId,
            family: font.family,
            weight: font.weights?.[0] || '400',
            style: font.styles?.[0] || 'normal',
            display: font.display || 'swap',
            url: font.url || '',
          }];

      variants.forEach((variant) => {
        const family = cssString(variant.family || font.family);
        const weight = cssFontWeight(variant.weight, font.weights?.[0] || '400');
        const style = cssFontStyle(variant.style, font.styles?.[0] || 'normal');
        const display = cssFontDisplay(variant.display, font.display || 'swap');
        const url = cssUrl(variant.url || font.url || '');

        if (!url) {
          return;
        }

        if (font.source === 'google' || /\.css($|\?)/i.test(url)) {
          rules.imports.push(`@import url("${url}");`);
          return;
        }

        rules.faces.push(`@font-face {
        font-family: "${family}";
        src: url("${url}");
        font-style: ${style};
        font-weight: ${weight};
        font-display: ${display};
      }`);
      });
      return rules;
    }, { imports: [], faces: [] });
  const fontFaceCss = [...fontCssRules.imports, ...fontCssRules.faces].join('\n');

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
            .backy-render-root {
              ${Object.entries(themeVars)
                .map(([k, v]) => `${k}: ${v};`)
                .join('\n')}
              font-family: var(--font-body, system-ui, sans-serif);
              color: var(--color-text, #1e293b);
              background: var(--color-background, transparent);
            }
            .backy-render-root .backy-canvas {
              font-family: inherit;
              color: inherit;
              background: var(--color-background, transparent);
            }
            .backy-render-root .backy-canvas h1,
            .backy-render-root .backy-canvas h2,
            .backy-render-root .backy-canvas h3,
            .backy-render-root .backy-canvas h4,
            .backy-render-root .backy-canvas h5,
            .backy-render-root .backy-canvas h6 {
              font-family: var(--font-heading, var(--font-body, system-ui, sans-serif));
            }
            ${theme?.customCSS || ''}
            ${customCSS || ''}
          `,
        }}
      />

      <div
        ref={viewportRef}
        className="backy-render-root"
        style={{ ...viewportStyle, ...themeVars }}
        data-backy-render-breakpoint={activeBreakpoint}
        data-backy-render-scale={scale.toFixed(3)}
        data-backy-render-content-bounds="expanded"
      >
        <div
          className="backy-canvas-frame"
          style={canvasFrameStyle}
          data-backy-canvas-scale={scale.toFixed(3)}
          data-backy-render-width={renderCanvasSize.width}
          data-backy-render-height={renderCanvasSize.height}
        >
          <div className="backy-canvas" style={canvasStyle} data-backy-active-breakpoint={activeBreakpoint}>
            {themedElements.map((element) => (
              !getBooleanWithFallback(element.visible, true) ? null : (
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
      </div>
    </>
  );
}

export default PageRenderer;
