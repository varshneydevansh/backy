/**
 * ============================================================================
 * BACKY CMS - CANVAS COMPONENT
 * ============================================================================
 *
 * The main canvas component for the page builder. Provides a WYSIWYG
 * editing surface where users can drag and drop elements with absolute
 * positioning (Wix-like freedom).
 *
 * @module Canvas
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { CanvasElement, CanvasSize, ComponentLibraryItem } from '@/types/editor';
import {
  createCanvasElementFromLibraryItem,
  createCanvasElementsFromReusableContent,
} from '@/components/editor/editorCatalog';
import { RichTextBlock } from './blocks/RichTextBlock';
import { ACTIVE_EDITOR_CONTENT_SYNC_EVENT, useActiveEditor } from './ActiveEditorContext';
import {
  extractListItemEntriesFromSlate,
  extractListItemsFromSlate,
  getListTypeFromSlate,
  normalizeListContent,
} from './listUtils';

const SELECTED_LAYER_EDIT_Z_INDEX = 10001;
const ACTIVE_SELECTED_LAYER_EDIT_Z_INDEX = 10002;

const toCssLength = (value: unknown): string | number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return undefined;
};

const toNonNegativeCssLength = (value: unknown, fallback = 0): string => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseFloat(value)
      : fallback;

  return `${Math.max(0, Number.isFinite(parsed) ? parsed : fallback)}px`;
};

const toOpacity = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toNumericAttribute = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const sanitizeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const normalizeLinkTargetValue = (value: unknown): '_self' | '_blank' | '_parent' | '_top' => {
  const target = sanitizeText(value);
  return target === '_blank' || target === '_parent' || target === '_top' ? target : '_self';
};

const normalizeLinkRelValue = (target: unknown, value: unknown): string | undefined => {
  const tokens = sanitizeText(value).split(/\s+/).filter(Boolean);

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
};

const normalizeInputType = (value: unknown): string => {
  const inputType = sanitizeText(value).toLowerCase();

  if (
    inputType === 'email' ||
    inputType === 'number' ||
    inputType === 'date' ||
    inputType === 'tel' ||
    inputType === 'url' ||
    inputType === 'password' ||
    inputType === 'search' ||
    inputType === 'file'
  ) {
    return inputType;
  }

  return 'text';
};

const normalizeTextareaResize = (value: unknown): CSSProperties['resize'] => {
  const resize = sanitizeText(value);
  return ['none', 'both', 'horizontal', 'vertical', 'block', 'inline'].includes(resize)
    ? resize as CSSProperties['resize']
    : 'vertical';
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const resolveMediaSource = (value: unknown): string => {
  const direct = sanitizeText(value);
  if (direct) {
    return direct;
  }

  if (!isRecord(value)) {
    return '';
  }

  return sanitizeText(value.url)
    || sanitizeText(value.src)
    || sanitizeText(value.publicUrl)
    || sanitizeText(value.path);
};

const resolveElementMediaSource = (props: Record<string, unknown>, key: string): string => (
  resolveMediaSource(props[key])
    || resolveMediaSource(props[`${key}Url`])
    || resolveMediaSource(props.media)
);

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

const DEFAULT_GRID_SIZE = 10;
const SMART_GUIDE_THRESHOLD = 6;

const normalizeGridSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_GRID_SIZE;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
};

const snapToGrid = (value: number, gridSize: number, enabled = true): number => {
  const safeValue = Math.max(0, value);
  if (!enabled) {
    return safeValue;
  }

  const safeGridSize = normalizeGridSize(gridSize);
  return Math.round(safeValue / safeGridSize) * safeGridSize;
};

const clampToCanvas = (
  value: number,
  dimension: number,
  canvasDimension: number,
): number => (
  Math.max(0, Math.min(value, Math.max(0, canvasDimension - dimension)))
);

interface TreeUpdateResult {
  elements: CanvasElement[];
  updated: boolean;
}

interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

interface SnapCandidate {
  value: number;
  offset: number;
}

interface DragSnapshot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  parentId: string | null;
  boundsWidth: number;
  boundsHeight: number;
}

interface DragBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  boundsWidth: number;
  boundsHeight: number;
}

type ResizeHandlePosition = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

const getDragSnapCandidates = (
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  vertical: [
    { value: x, offset: 0 },
    { value: x + width / 2, offset: width / 2 },
    { value: x + width, offset: width },
  ],
  horizontal: [
    { value: y, offset: 0 },
    { value: y + height / 2, offset: height / 2 },
    { value: y + height, offset: height },
  ],
});

const collectSmartGuideTargets = (
  elements: CanvasElement[],
  activeElementIds: string | string[],
  size: CanvasSize,
) => {
  const activeIds = new Set(Array.isArray(activeElementIds) ? activeElementIds : [activeElementIds]);
  const vertical = [0, size.width / 2, size.width];
  const horizontal = [0, size.height / 2, size.height];

  const collect = (nodes: CanvasElement[], origin = { x: 0, y: 0 }) => {
    for (const element of nodes) {
      if (activeIds.has(element.id) || element.visible === false) {
        continue;
      }

      const x = origin.x + element.x;
      const y = origin.y + element.y;
      vertical.push(x, x + element.width / 2, x + element.width);
      horizontal.push(y, y + element.height / 2, y + element.height);

      if (element.children?.length) {
        collect(element.children, { x, y });
      }
    }
  };

  collect(elements);

  return { vertical, horizontal };
};

const findClosestSnap = (
  candidates: SnapCandidate[],
  targets: number[],
): { delta: number; position: number } | null => {
  let closest: { delta: number; distance: number; position: number } | null = null;

  for (const candidate of candidates) {
    for (const target of targets) {
      const delta = target - candidate.value;
      const distance = Math.abs(delta);
      if (distance > SMART_GUIDE_THRESHOLD) {
        continue;
      }

      if (!closest || distance < closest.distance) {
        closest = {
          delta,
          distance,
          position: target,
        };
      }
    }
  }

  return closest ? { delta: closest.delta, position: closest.position } : null;
};

const resolveSmartDragSnap = (
  elements: CanvasElement[],
  activeElementIds: string | string[],
  size: CanvasSize,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const targets = collectSmartGuideTargets(elements, activeElementIds, size);
  const candidates = getDragSnapCandidates(x, y, width, height);
  const verticalSnap = findClosestSnap(candidates.vertical, targets.vertical);
  const horizontalSnap = findClosestSnap(candidates.horizontal, targets.horizontal);

  return {
    x: verticalSnap ? x + verticalSnap.delta : x,
    y: horizontalSnap ? y + horizontalSnap.delta : y,
    guides: [
      ...(verticalSnap ? [{ orientation: 'vertical' as const, position: verticalSnap.position }] : []),
      ...(horizontalSnap ? [{ orientation: 'horizontal' as const, position: horizontalSnap.position }] : []),
    ],
  };
};

const resizeBoundsFromHandle = (
  bounds: DragBounds,
  handle: ResizeHandlePosition,
  deltaX: number,
  deltaY: number,
  gridSize: number,
  snapEnabled: boolean,
  options: {
    preserveAspectRatio?: boolean;
    resizeFromCenter?: boolean;
  } = {},
) => {
  const affectsLeft = handle.includes('w');
  const affectsRight = handle.includes('e');
  const affectsTop = handle.includes('n');
  const affectsBottom = handle.includes('s');
  const affectsWidth = affectsLeft || affectsRight;
  const affectsHeight = affectsTop || affectsBottom;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  let nextX = bounds.x;
  let nextY = bounds.y;
  let nextWidth = bounds.width;
  let nextHeight = bounds.height;
  const minWidth = 50;
  const minHeight = 30;
  const aspectRatio = bounds.width / Math.max(1, bounds.height);
  const widthDelta = affectsRight ? deltaX : affectsLeft ? -deltaX : 0;
  const heightDelta = affectsBottom ? deltaY : affectsTop ? -deltaY : 0;
  const multiplier = options.resizeFromCenter ? 2 : 1;

  if (affectsWidth) {
    nextWidth = Math.max(minWidth, bounds.width + widthDelta * multiplier);
  }

  if (affectsHeight) {
    nextHeight = Math.max(minHeight, bounds.height + heightDelta * multiplier);
  }

  if (options.preserveAspectRatio && affectsWidth && affectsHeight) {
    const widthChange = Math.abs(nextWidth - bounds.width) / Math.max(1, bounds.width);
    const heightChange = Math.abs(nextHeight - bounds.height) / Math.max(1, bounds.height);
    if (widthChange >= heightChange) {
      nextHeight = Math.max(minHeight, nextWidth / aspectRatio);
    } else {
      nextWidth = Math.max(minWidth, nextHeight * aspectRatio);
    }
  } else if (options.preserveAspectRatio && affectsWidth) {
    nextHeight = Math.max(minHeight, nextWidth / aspectRatio);
  } else if (options.preserveAspectRatio && affectsHeight) {
    nextWidth = Math.max(minWidth, nextHeight * aspectRatio);
  }

  if (options.resizeFromCenter) {
    nextX = centerX - nextWidth / 2;
    nextY = centerY - nextHeight / 2;
  } else {
    if (affectsLeft) {
      nextX = bounds.x + bounds.width - nextWidth;
    } else if (options.preserveAspectRatio && !affectsLeft && !affectsRight && affectsHeight) {
      nextX = centerX - nextWidth / 2;
    }

    if (affectsTop) {
      nextY = bounds.y + bounds.height - nextHeight;
    } else if (options.preserveAspectRatio && !affectsTop && !affectsBottom && affectsWidth) {
      nextY = centerY - nextHeight / 2;
    }
  }

  nextWidth = Math.min(nextWidth, bounds.boundsWidth);
  nextHeight = Math.min(nextHeight, bounds.boundsHeight);
  nextX = clampToCanvas(nextX, nextWidth, bounds.boundsWidth);
  nextY = clampToCanvas(nextY, nextHeight, bounds.boundsHeight);

  return {
    x: snapToGrid(nextX, gridSize, snapEnabled),
    y: snapToGrid(nextY, gridSize, snapEnabled),
    width: Math.max(minWidth, snapToGrid(nextWidth, gridSize, snapEnabled)),
    height: Math.max(minHeight, snapToGrid(nextHeight, gridSize, snapEnabled)),
    boundsWidth: bounds.boundsWidth,
    boundsHeight: bounds.boundsHeight,
  };
};

const findElementById = (elements: CanvasElement[], targetId: string): CanvasElement | null => {
  for (const element of elements) {
    if (element.id === targetId) {
      return element;
    }

    if (element.children?.length) {
      const found = findElementById(element.children, targetId);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

const findElementEntry = (
  elements: CanvasElement[],
  targetId: string,
  parentId: string | null = null,
): { element: CanvasElement; parentId: string | null } | null => {
  for (const element of elements) {
    if (element.id === targetId) {
      return { element, parentId };
    }

    if (element.children?.length) {
      const found = findElementEntry(element.children, targetId, element.id);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

const getDragBoundsForParent = (
  elements: CanvasElement[],
  parentId: string | null,
  canvasBounds: { width: number; height: number },
) => {
  if (!parentId) {
    return canvasBounds;
  }

  const parent = findElementById(elements, parentId);
  return parent
    ? { width: parent.width, height: parent.height }
    : canvasBounds;
};

const getSiblingScopeForParent = (
  elements: CanvasElement[],
  parentId: string | null,
): CanvasElement[] => {
  if (!parentId) {
    return elements;
  }

  return findElementById(elements, parentId)?.children || [];
};

const createDragSnapshot = (
  elements: CanvasElement[],
  targetId: string,
  canvasBounds: { width: number; height: number },
): DragSnapshot | null => {
  const entry = findElementEntry(elements, targetId);
  if (!entry) {
    return null;
  }

  const bounds = getDragBoundsForParent(elements, entry.parentId, canvasBounds);

  return {
    id: entry.element.id,
    x: entry.element.x,
    y: entry.element.y,
    width: entry.element.width,
    height: entry.element.height,
    zIndex: entry.element.zIndex || 1,
    parentId: entry.parentId,
    boundsWidth: bounds.width,
    boundsHeight: bounds.height,
  };
};

const collectDragSnapshots = (
  elements: CanvasElement[],
  selectedIds: Set<string>,
  bounds: { width: number; height: number },
  parentId: string | null = null,
  ancestorSelected = false,
): DragSnapshot[] => {
  const snapshots: DragSnapshot[] = [];

  for (const element of elements) {
    const isSelected = selectedIds.has(element.id);
    if (isSelected && !ancestorSelected) {
      snapshots.push({
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex || 1,
        parentId,
        boundsWidth: bounds.width,
        boundsHeight: bounds.height,
      });
    }

    if (element.children?.length) {
      snapshots.push(
        ...collectDragSnapshots(
          element.children,
          selectedIds,
          { width: element.width, height: element.height },
          element.id,
          ancestorSelected || isSelected,
        ),
      );
    }
  }

  return snapshots;
};

const getDragBounds = (snapshots: DragSnapshot[]): DragBounds => {
  const minX = Math.min(...snapshots.map((snapshot) => snapshot.x));
  const minY = Math.min(...snapshots.map((snapshot) => snapshot.y));
  const maxX = Math.max(...snapshots.map((snapshot) => snapshot.x + snapshot.width));
  const maxY = Math.max(...snapshots.map((snapshot) => snapshot.y + snapshot.height));
  const first = snapshots[0];

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    boundsWidth: first.boundsWidth,
    boundsHeight: first.boundsHeight,
  };
};

const updateElementById = (
  elements: CanvasElement[],
  targetId: string,
  update: (element: CanvasElement) => CanvasElement,
): TreeUpdateResult => {
  let updated = false;

  const next = elements.map((element) => {
    if (element.id === targetId) {
      updated = true;
      return update(element);
    }

    if (!element.children?.length) {
      return element;
    }

    const nextChildren = updateElementById(element.children, targetId, update);
    if (!nextChildren.updated) {
      return element;
    }

    updated = true;
    return {
      ...element,
      children: nextChildren.elements,
    };
  });

  return { elements: next, updated };
};

const insertElementAsChild = (
  elements: CanvasElement[],
  parentId: string,
  child: CanvasElement,
): TreeUpdateResult => {
  let inserted = false;

  const next = elements.map((element) => {
    if (element.id === parentId) {
      inserted = true;
      return {
        ...element,
        children: [...(element.children || []), { ...child, parentId }],
      };
    }

    if (!element.children?.length) {
      return element;
    }

    const nested = insertElementAsChild(element.children, parentId, child);
    if (!nested.updated) {
      return element;
    }

    inserted = true;
    return {
      ...element,
      children: nested.elements,
    };
  });

  return { elements: next, updated: inserted };
};

const getMaxZIndex = (elements: CanvasElement[]): number => (
  elements.reduce((max, element) => Math.max(
    max,
    element.zIndex || 0,
    element.children?.length ? getMaxZIndex(element.children) : 0,
  ), 0)
);

const canAcceptNestedDrop = (elementType: CanvasElement['type']): boolean => {
  const normalizedType = normalizeCanvasElementType(elementType);

  return normalizedType === 'form' ||
    normalizedType === 'box' ||
    normalizedType === 'container' ||
    normalizedType === 'section' ||
    normalizedType === 'header' ||
    normalizedType === 'footer' ||
    normalizedType === 'nav' ||
    normalizedType === 'columns';
};

const isTextEditableElement = (type: CanvasElement['type']): boolean => {
  return type === 'text' || type === 'heading' || type === 'paragraph' || type === 'quote' || type === 'list';
};
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
    // Allow pasting of YouTube ID only
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

const parseFormOptions = (value: unknown): string[] => {
  if (!Array.isArray(value) && typeof value !== 'string') {
    return [];
  }

  const values = Array.isArray(value)
    ? value
    : value.split(/\r?\n/);

  return values
    .map((option) => {
      if (typeof option === 'string') {
        return option.trim();
      }

      if (option && typeof option === 'object' && 'value' in option) {
        const optionValue = (option as { value?: unknown }).value;
        if (typeof optionValue === 'string') {
          return optionValue.trim();
        }

        if (typeof optionValue === 'number' && Number.isFinite(optionValue)) {
          return `${optionValue}`.trim();
        }
      }

      if (option && typeof option === 'object' && 'label' in option) {
        const label = (option as { label?: unknown }).label;
        if (typeof label === 'string') {
          return label.trim();
        }

        if (typeof label === 'number' && Number.isFinite(label)) {
          return `${label}`.trim();
        }
      }

      return '';
    })
    .filter((option): option is string => typeof option === 'string')
    .map((option) => option.trim())
    .filter(Boolean);
};

const parseFormInputValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [entry]))
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }

        if (typeof entry === 'number' && Number.isFinite(entry)) {
          return `${entry}`;
        }

        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          return sanitizeText(record.value) || sanitizeText(record.label);
        }

        return '';
      })
      .filter(Boolean);
  }

  const rawText = sanitizeText(value);
  return rawText
    ? rawText.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
};

const buildSharedElementStyle = (element: CanvasElement): CSSProperties => {
  const p = element.props as Record<string, any>;
  const savedStyles = element.styles || {};
  const visualStyles = { ...savedStyles };
  delete visualStyles.position;
  delete visualStyles.left;
  delete visualStyles.top;
  delete visualStyles.right;
  delete visualStyles.bottom;
  delete visualStyles.width;
  delete visualStyles.height;
  delete visualStyles.minWidth;
  delete visualStyles.minHeight;
  delete visualStyles.maxWidth;
  delete visualStyles.maxHeight;
  delete visualStyles.zIndex;
  delete visualStyles.transform;
  delete visualStyles.translate;
  delete visualStyles.rotate;
  delete visualStyles.scale;
  delete visualStyles.pointerEvents;

  const borderWidth = toCssLength(p.borderWidth ?? visualStyles.borderWidth);
  const borderColor = p.borderColor ?? visualStyles.borderColor;
  const borderStyle = p.borderStyle ?? visualStyles.borderStyle ?? 'solid';
  const border = p.border ?? visualStyles.border ?? (borderWidth || borderColor
    ? `${borderWidth || '1px'} ${borderStyle} ${borderColor || '#000000'}`
    : undefined);

  return {
    ...visualStyles,
    backgroundColor: p.backgroundColor ?? visualStyles.backgroundColor,
    color: p.color ?? visualStyles.color,
    border,
    borderColor,
    borderStyle,
    borderWidth,
    borderRadius: toCssLength(p.borderRadius ?? visualStyles.borderRadius),
    padding: toCssLength(p.padding ?? visualStyles.padding),
    fontFamily: p.fontFamily ?? visualStyles.fontFamily,
    fontSize: p.fontSize ?? visualStyles.fontSize,
    fontWeight: p.fontWeight ?? visualStyles.fontWeight,
    lineHeight: p.lineHeight ?? visualStyles.lineHeight,
    textTransform: p.textTransform ?? visualStyles.textTransform,
    letterSpacing: toCssLength(p.letterSpacing ?? visualStyles.letterSpacing),
    wordSpacing: toCssLength(p.wordSpacing ?? visualStyles.wordSpacing),
    textShadow: p.textShadow ?? visualStyles.textShadow,
    textIndent: toCssLength(p.textIndent ?? visualStyles.textIndent),
    fontStyle: ((p as Record<string, unknown>).fontStyle ?? (visualStyles as Record<string, unknown>).fontStyle) as CSSProperties['fontStyle'],
    textAlign: p.textAlign ?? visualStyles.textAlign,
    textDecoration: p.textDecoration ?? visualStyles.textDecoration,
    margin: toCssLength(p.margin ?? visualStyles.margin),
    opacity: toOpacity(p.opacity ?? visualStyles.opacity),
    boxShadow: p.boxShadow ?? visualStyles.boxShadow,
  };
};

const getCommentModeLabel = (value: unknown): 'manual' | 'auto-approve' => {
  return value === 'auto-approve' ? 'auto-approve' : 'manual';
};

const getCommentModeColor = (mode: unknown): string => {
  return getCommentModeLabel(mode) === 'auto-approve' ? '#0f766e' : '#374151';
};

const parseBooleanSetting = (value: unknown, fallback: boolean): boolean => {
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

const getBoolean = (value: unknown): boolean => parseBooleanSetting(value, false);

const getBooleanWithFallback = (value: unknown, fallback: boolean): boolean => (
  value === undefined || value === null ? fallback : parseBooleanSetting(value, fallback)
);

const formatFieldLabel = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const formatHelpText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const formatFormPreviewText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }

  return '';
};

const getFormPreviewValue = (props: Record<string, any>): string => {
  if (props.value !== undefined && props.value !== null) {
    return formatFormPreviewText(props.value);
  }

  return formatFormPreviewText(props.defaultValue);
};

const getFormOwnerId = (props: Record<string, any>): string | undefined => {
  const rawValue = props.formOwnerId ?? props.formId;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return `${rawValue}`;
  }

  return undefined;
};

const normalizeCaptchaProvider = (value: unknown): 'turnstile' | 'hcaptcha' | 'recaptcha' | 'mock' => {
  const provider = sanitizeText(value).toLowerCase();
  if (provider === 'hcaptcha' || provider === 'recaptcha' || provider === 'mock') {
    return provider;
  }

  return 'turnstile';
};

const getFormFieldGap = (props: Record<string, any>, fallback: number): string | number => (
  toCssLength(props.fieldGap) ?? fallback
);

const getFormLabelStyle = (
  props: Record<string, any>,
  sharedStyle: CSSProperties,
): CSSProperties => ({
  color: sanitizeText(props.labelColor) || sanitizeText(props.color) || sharedStyle.color || '#374151',
  fontWeight: sanitizeText(props.labelFontWeight) || 500,
  fontSize: toCssLength(props.labelFontSize) ?? 14,
});

const getFormHelpStyle = (props: Record<string, any>): CSSProperties => ({
  margin: 0,
  fontSize: toCssLength(props.helpTextFontSize) ?? 12,
  lineHeight: 1.4,
  color: sanitizeText(props.helpTextColor) || '#6b7280',
});

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

interface FormSchemaValidationRule {
  type: string;
  value?: string | number;
  message?: string;
}

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
  validation?: FormSchemaValidationRule[];
}

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

const normalizeFormSchemaFieldType = (value: unknown): FormSchemaFieldType => {
  const normalized = sanitizeText(value).toLowerCase();
  return FORM_SCHEMA_FIELD_TYPES.includes(normalized as FormSchemaFieldType)
    ? normalized as FormSchemaFieldType
    : 'text';
};

const normalizeFormSchemaFields = (value: unknown): FormSchemaField[] => {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.entries(value).map(([key, field]) => (
        isRecord(field) ? { key, ...field } : { key, label: key, type: field }
      ))
      : [];

  const usedKeys = new Set<string>();

  return entries
    .map((field, index): FormSchemaField | null => {
      if (!isRecord(field)) {
        return null;
      }

      const requestedKey = sanitizeText(field.key)
        || sanitizeText(field.name)
        || sanitizeText(field.id)
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

      const validation = Array.isArray(field.validation)
        ? field.validation.filter(isRecord).map((rule) => ({
          type: sanitizeText(rule.type),
          value: typeof rule.value === 'number' || typeof rule.value === 'string' ? rule.value : undefined,
          message: sanitizeText(rule.message),
        })).filter((rule) => rule.type)
        : [];

      return {
        key,
        label: sanitizeText(field.label) || key,
        type: normalizeFormSchemaFieldType(field.type || field.inputType),
        placeholder: sanitizeText(field.placeholder),
        helpText: sanitizeText(field.helpText),
        defaultValue: formatFormPreviewText(field.defaultValue ?? field.value),
        options: field.options,
        required: getBoolean(field.required) || validation.some((rule) => rule.type === 'required'),
        disabled: getBoolean(field.disabled),
        validation,
      };
    })
    .filter((field): field is FormSchemaField => Boolean(field));
};

const getFormSchemaValidationValue = (
  field: FormSchemaField,
  type: string,
): string | number | undefined => {
  const rule = field.validation?.find((item) => item.type === type);
  return rule?.value;
};

const normalizeCanvasElementType = (value: string): CanvasElement['type'] => {
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

  if (
    normalized === 'radio'
    || normalized === 'radiobutton'
    || normalized === 'radiobuttons'
    || normalized === 'radioinput'
    || normalized === 'radioinputs'
  ) {
    return 'radio';
  }

  if (
    normalized === 'checkbox'
    || normalized === 'checkboxes'
    || normalized === 'checkboxinput'
    || normalized === 'checkboxinputs'
    || normalized === 'checkinput'
  ) {
    return 'checkbox';
  }

  if (normalized.includes('dropdown') || normalized.includes('select')) {
    return 'select';
  }

  if (normalized.includes('textinput') || normalized.includes('textfield')) {
    return 'input';
  }

  return normalized as CanvasElement['type'] || 'text';
};

// ============================================
// TYPES
// ============================================

interface CanvasProps {
  /** Canvas elements to render */
  elements: CanvasElement[];
  /** Callback when elements change */
  onElementsChange: (
    elements: CanvasElement[],
    options?: { transient?: boolean; commit?: boolean; selectedId?: string | null },
  ) => void;
  /** Currently selected element ID */
  selectedId: string | null;
  /** Currently selected element IDs for multi-select editing */
  selectedIds?: string[];
  /** Callback when element is selected */
  onSelect: (id: string | null) => void;
  /** Callback when an element is toggled into or out of multi-selection */
  onToggleSelect?: (id: string) => void;
  /** Canvas size configuration */
  size: CanvasSize;
  /** Callback when canvas size changes */
  onSizeChange?: (newSize: CanvasSize) => void;
  /** Whether canvas is in preview mode */
  isPreview?: boolean;
  /** Whether editing interactions are disabled by the editor shell */
  disabled?: boolean;
  /** Visual viewport scale applied by the editor shell */
  viewportScale?: number;
  /** Whether drag/drop/resize coordinates snap to grid and alignment guides */
  snapEnabled?: boolean;
  /** Canvas grid spacing in CSS pixels */
  gridSize?: number;
  /** Whether the visual canvas grid is rendered */
  showGrid?: boolean;
}

const EDITOR_ACTIVATION_EVENT = 'backy-open-text-editor';

type DragInteraction = {
  elementId: string;
  elementIds: string[];
  snapshots: DragSnapshot[];
  bounds: DragBounds;
  inputType: 'pointer' | 'mouse';
  pointerId?: number;
  startX: number;
  startY: number;
  raisedZIndex: number;
  zIndexOffset: number;
};

type ResizeInteraction = {
  elementId: string;
  elementIds: string[];
  snapshots: DragSnapshot[];
  bounds: DragBounds;
  handle: ResizeHandlePosition;
  inputType: 'pointer' | 'mouse';
  pointerId?: number;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
};

const getPointerDetails = (event: React.PointerEvent | React.MouseEvent) => {
  if ('pointerId' in event && event.pointerId !== undefined) {
    if (event.pointerType === 'mouse') {
      return {
        inputType: 'mouse' as const,
        pointerId: undefined,
      };
    }

    return {
      inputType: 'pointer' as const,
      pointerId: event.pointerId,
    };
  }

  return {
    inputType: 'mouse' as const,
    pointerId: undefined,
  };
};

const matchesInteractionInput = (
  event: MouseEvent | PointerEvent,
  interaction: Pick<DragInteraction | ResizeInteraction, 'inputType' | 'pointerId'>,
) => {
  if (interaction.inputType === 'mouse') {
    return !('pointerId' in event) || (event instanceof PointerEvent && event.pointerType === 'mouse');
  }

  if (!('pointerId' in event)) {
    return true;
  }

  return interaction.pointerId === undefined || event.pointerId === interaction.pointerId;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Canvas Component
 *
 * Provides a visual editing surface with:
 * - Absolute positioning for elements
 * - Drag and drop functionality
 * - Selection handling
 * - Grid snap (optional)
 * - Responsive breakpoints
 * - Canvas resizing
 */
export function Canvas({
  elements,
  onElementsChange,
  selectedId,
  selectedIds = selectedId ? [selectedId] : [],
  onSelect,
  onToggleSelect,
  size,
  onSizeChange,
  isPreview = false,
  disabled = false,
  viewportScale = 1,
  snapEnabled = true,
  gridSize = DEFAULT_GRID_SIZE,
  showGrid = true,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const { clearActiveEditor } = useActiveEditor();
  const elementsRef = useRef(elements);
  const dragStateRef = useRef<DragInteraction | null>(null);
  const resizeStateRef = useRef<ResizeInteraction | null>(null);
  const debugTextInteraction = useCallback((..._args: unknown[]) => {
  }, []);
  const safeViewportScale = Number.isFinite(viewportScale) && viewportScale > 0
    ? viewportScale
    : 1;
  const safeGridSize = normalizeGridSize(gridSize);
  const toCanvasDelta = useCallback((value: number) => value / safeViewportScale, [safeViewportScale]);

  const getTargetElement = useCallback((target: EventTarget | null) => {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target instanceof Text) {
      return target.parentElement;
    }
    return null;
  }, []);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    if (isPreview || disabled) {
      setEditingId(null);
      clearActiveEditor();
      return;
    }

    if (!selectedId) {
      setEditingId(null);
      clearActiveEditor();
    }
  }, [clearActiveEditor, disabled, isPreview, selectedId]);

  const isInteractiveHandle = useCallback((target: EventTarget | null) => {
    const element = getTargetElement(target);
    if (!element) return false;
    return !!element.closest('[data-role="canvas-resize-handle"]');
  }, [getTargetElement]);

  const isInteractiveHandleAtPoint = useCallback((x: number, y: number) => {
    if (typeof document === 'undefined') {
      return false;
    }

    return isInteractiveHandle(document.elementFromPoint(x, y));
  }, [isInteractiveHandle]);

  const isTextEditorInteraction = useCallback((target: EventTarget | null) => {
    const element = getTargetElement(target);
    if (!element) return false;

    if (element.closest('[data-role="canvas-move-handle"]')) {
      return false;
    }

    const editorHost = element.closest('[data-backy-text-editor]');
    if (!editorHost) {
      return false;
    }

    return editorHost.getAttribute('data-backy-text-editor-editable') === 'true';
  }, [getTargetElement]);

  const isInspectorInteraction = useCallback((target: EventTarget | null) => {
    const element = getTargetElement(target);
    return !!element?.closest?.('[data-testid="editor-inspector"]');
  }, [getTargetElement]);

  const exitTextEditingForTransform = useCallback(() => {
    setEditingId(null);
    clearActiveEditor();

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && canvasRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, [clearActiveEditor]);

  const requestEditForElement = useCallback((elementId: string | null) => {
    if (!elementId || isPreview || disabled) {
      debugTextInteraction('requestEditForElement blocked', {
        elementId,
        reason: !elementId ? 'missing-element-id' : isPreview ? 'preview-mode' : 'disabled',
      });
      return;
    }

    const element = findElementById(elements, elementId);
    if (!element) {
      debugTextInteraction('requestEditForElement element-missing', { elementId });
      return;
    }

    if (!isTextEditableElement(element.type)) {
      debugTextInteraction('requestEditForElement blocked', {
        elementId,
        elementType: element.type,
        reason: 'not-a-text-element',
      });
      return;
    }

    debugTextInteraction('requestEditForElement activating', {
      elementId,
      elementType: element.type,
      previousEditingId: editingId,
    });

    onSelect(elementId);
    setEditingId((current) => (current === elementId ? current : elementId));

    let attempts = 0;
    const maxAttempts = 18;
    const focusEditable = () => {
      const host = canvasRef.current?.querySelector<HTMLElement>(
        `[data-element-id="${elementId}"] [data-backy-text-editor][data-backy-text-editor-editable="true"]`
      );

      const editableHost = host?.querySelector<HTMLElement>('[contenteditable="true"]')
        || host?.querySelector<HTMLElement>('[role="textbox"][contenteditable="true"]')
        || host?.querySelector<HTMLElement>('[role="textbox"]')
        || host?.querySelector<HTMLElement>('[contenteditable]');
      const focusTarget = editableHost || host;

      if (!focusTarget) {
        debugTextInteraction('requestEditForElement missing-focus-target', { elementId, attempts });
      }

      if (focusTarget && 'focus' in focusTarget) {
        debugTextInteraction('requestEditForElement focus', { elementId, attempts });
        focusTarget.focus();
        return;
      }

      if (attempts >= maxAttempts) {
        const fallbackHost = canvasRef.current?.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);
        if (fallbackHost) {
          debugTextInteraction('requestEditForElement fallback-focus', { elementId, attempts });
          fallbackHost.focus();
        }
        return;
      }

      attempts += 1;
      window.requestAnimationFrame(focusEditable);
    };

    focusEditable();
  }, [debugTextInteraction, disabled, elements, editingId, isPreview, onSelect]);

  const handleExternalEditRequest = useCallback((event: Event) => {
    const elementId = (event as CustomEvent<{ elementId?: string }>)?.detail?.elementId;
    debugTextInteraction('handleExternalEditRequest', { eventType: event.type, elementId });
    requestEditForElement(elementId || null);
  }, [requestEditForElement]);

  // Drag state for moving elements
  const [dragState, setDragState] = useState<DragInteraction | null>(null);

  // Resize state for resizing elements
  const [resizeState, setResizeState] = useState<ResizeInteraction | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  // Resize state for canvas itself
  const [canvasResizeState, setCanvasResizeState] = useState<{
    startY: number;
    initialHeight: number;
  } | null>(null);

  /**
   * Start moving an element from pointer or mouse input.
   */
  const handleElementDragStart = useCallback(
    (e: React.PointerEvent | React.MouseEvent, elementId: string) => {
      if (isPreview || disabled) return;
      if ('button' in e && e.button !== 0) return;
      if (dragStateRef.current || resizeStateRef.current) return;
      if (isInteractiveHandle(e.target) || isInteractiveHandleAtPoint(e.clientX, e.clientY)) return;

      const eventTarget = getTargetElement(e.target);
      const hitElementId = eventTarget?.closest?.('[data-element-id]')?.getAttribute('data-element-id');

      if (hitElementId && hitElementId !== elementId) {
        debugTextInteraction('handleMouseDown hit-child mismatch', { elementId, hitElementId });
        return;
      }

      const clickedElement = findElementById(elements, elementId);
      if (!clickedElement) return;

      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect?.(elementId);
        exitTextEditingForTransform();
        return;
      }

      if (clickedElement.locked) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(elementId);
        clearActiveEditor();
        return;
      }

      if (isTextEditorInteraction(e.target)) {
        debugTextInteraction('handleMouseDown ignored for text editor interaction', {
          elementId,
          target: (e.target as Element | null)?.tagName,
        });
        return;
      }

      debugTextInteraction('handleMouseDown started drag', { elementId, x: e.clientX, y: e.clientY });

      e.preventDefault();
      e.stopPropagation();
      if ('pointerId' in e && e.pointerId !== undefined) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }

      const selectedSet = new Set(selectedIds);
      const allSelectedSnapshots = selectedSet.has(elementId) && selectedIds.length > 1
        ? collectDragSnapshots(elementsRef.current, selectedSet, { width: size.width, height: size.height })
        : [];
      const activeSnapshot = allSelectedSnapshots.find((snapshot) => snapshot.id === elementId);
      const candidateDragSnapshots = activeSnapshot
        ? allSelectedSnapshots.filter((snapshot) => (
            snapshot.parentId === activeSnapshot.parentId
            && snapshot.boundsWidth === activeSnapshot.boundsWidth
            && snapshot.boundsHeight === activeSnapshot.boundsHeight
          ))
        : [createDragSnapshot(elementsRef.current, elementId, { width: size.width, height: size.height })]
            .filter((snapshot): snapshot is DragSnapshot => !!snapshot);
      const dragSnapshots = candidateDragSnapshots.filter((snapshot) => {
        const snapshotElement = findElementById(elementsRef.current, snapshot.id);
        return snapshotElement?.locked !== true;
      });
      if (!dragSnapshots.length) {
        return;
      }
      const isMultiDrag = dragSnapshots.length > 1;
      const minSelectedZIndex = Math.min(...dragSnapshots.map((snapshot) => snapshot.zIndex));
      const zIndexOffset = Math.max(0, getMaxZIndex(elementsRef.current) - minSelectedZIndex + 1);

      if (!isMultiDrag) {
        onSelect(elementId);
      }

      exitTextEditingForTransform();

      const nextDragState: DragInteraction = {
        elementId,
        elementIds: dragSnapshots.map((snapshot) => snapshot.id),
        snapshots: dragSnapshots,
        bounds: getDragBounds(dragSnapshots),
        ...getPointerDetails(e),
        startX: e.clientX,
        startY: e.clientY,
        raisedZIndex: Math.max(clickedElement.zIndex || 1, getMaxZIndex(elementsRef.current) + 1),
        zIndexOffset,
      };

      dragStateRef.current = nextDragState;
      resizeStateRef.current = null;
      setDragState(nextDragState);
      setResizeState(null);
    },
    [disabled, elements, exitTextEditingForTransform, isInteractiveHandle, isInteractiveHandleAtPoint, isTextEditorInteraction, isPreview, onSelect, onToggleSelect, selectedIds, size.height, size.width]
  );

  /**
   * Handle resize start from resize handles
   */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.PointerEvent, elementId: string, handle: ResizeHandlePosition) => {
      if (isPreview || disabled) return;
      if ('button' in e && e.button !== 0) return;

      e.stopPropagation();
      e.preventDefault();
      if (resizeStateRef.current) return;
      if (dragStateRef.current) {
        dragStateRef.current = null;
        setDragState(null);
      }

      const element = findElementById(elements, elementId);
      if (!element || element.locked) return;

      const selectedSet = new Set(selectedIds);
      const allSelectedSnapshots = selectedSet.has(elementId) && selectedIds.length > 1
        ? collectDragSnapshots(elementsRef.current, selectedSet, { width: size.width, height: size.height })
        : [];
      const activeSnapshot = allSelectedSnapshots.find((snapshot) => snapshot.id === elementId);
      const resizeSnapshots = activeSnapshot
        ? allSelectedSnapshots.filter((snapshot) => {
            const snapshotElement = findElementById(elementsRef.current, snapshot.id);
            return (
              snapshotElement &&
              !snapshotElement.locked &&
              snapshot.parentId === activeSnapshot.parentId &&
              snapshot.boundsWidth === activeSnapshot.boundsWidth &&
              snapshot.boundsHeight === activeSnapshot.boundsHeight
            );
          })
        : [createDragSnapshot(elementsRef.current, elementId, { width: size.width, height: size.height })]
            .filter((snapshot): snapshot is DragSnapshot => !!snapshot);
      if (!resizeSnapshots.length) {
        return;
      }

      const nextResizeState: ResizeInteraction = {
        elementId,
        elementIds: resizeSnapshots.map((snapshot) => snapshot.id),
        snapshots: resizeSnapshots,
        bounds: getDragBounds(resizeSnapshots),
        handle,
        ...getPointerDetails(e),
        startX: e.clientX,
        startY: e.clientY,
        initialX: element.x,
        initialY: element.y,
        initialWidth: element.width,
        initialHeight: element.height,
      };

      resizeStateRef.current = nextResizeState;
      dragStateRef.current = null;
      setResizeState(nextResizeState);
      setDragState(null);
      exitTextEditingForTransform();

      if ('pointerId' in e && e.pointerId !== undefined) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    },
    [disabled, elements, exitTextEditingForTransform, isPreview, selectedIds, size.height, size.width]
  );

  const handleGlobalElementMove = useCallback((event: MouseEvent | PointerEvent) => {
    if (isPreview || disabled) {
      return;
    }

    const activeResizeState = resizeStateRef.current;
    const activeDragState = dragStateRef.current;

    if (activeResizeState) {
      if (!matchesInteractionInput(event, activeResizeState)) {
        return;
      }

      setAlignmentGuides([]);
      const deltaX = toCanvasDelta(event.clientX - activeResizeState.startX);
      const deltaY = toCanvasDelta(event.clientY - activeResizeState.startY);

      let nextElements = elementsRef.current;
      if (activeResizeState.snapshots.length > 1) {
        const nextBounds = resizeBoundsFromHandle(
          activeResizeState.bounds,
          activeResizeState.handle,
          deltaX,
          deltaY,
          safeGridSize,
          snapEnabled,
          {
            preserveAspectRatio: event.shiftKey,
            resizeFromCenter: event.altKey,
          },
        );
        const scaleX = nextBounds.width / Math.max(1, activeResizeState.bounds.width);
        const scaleY = nextBounds.height / Math.max(1, activeResizeState.bounds.height);

        for (const snapshot of activeResizeState.snapshots) {
          const relativeX = snapshot.x - activeResizeState.bounds.x;
          const relativeY = snapshot.y - activeResizeState.bounds.y;
          const nextWidth = Math.max(20, snapToGrid(snapshot.width * scaleX, safeGridSize, snapEnabled));
          const nextHeight = Math.max(20, snapToGrid(snapshot.height * scaleY, safeGridSize, snapEnabled));
          const nextX = snapToGrid(nextBounds.x + relativeX * scaleX, safeGridSize, snapEnabled);
          const nextY = snapToGrid(nextBounds.y + relativeY * scaleY, safeGridSize, snapEnabled);

          const result = updateElementById(nextElements, snapshot.id, (element) => ({
            ...element,
            x: clampToCanvas(nextX, nextWidth, snapshot.boundsWidth),
            y: clampToCanvas(nextY, nextHeight, snapshot.boundsHeight),
            width: nextWidth,
            height: nextHeight,
          }));

          nextElements = result.elements;
        }
      } else {
        const nextBounds = resizeBoundsFromHandle(
          {
            x: activeResizeState.bounds.x,
            y: activeResizeState.bounds.y,
            width: activeResizeState.bounds.width,
            height: activeResizeState.bounds.height,
            boundsWidth: activeResizeState.bounds.boundsWidth,
            boundsHeight: activeResizeState.bounds.boundsHeight,
          },
          activeResizeState.handle,
          deltaX,
          deltaY,
          safeGridSize,
          snapEnabled,
          {
            preserveAspectRatio: event.shiftKey,
            resizeFromCenter: event.altKey,
          },
        );

        const result = updateElementById(nextElements, activeResizeState.elementId, (element) => ({
          ...element,
          x: nextBounds.x,
          y: nextBounds.y,
          width: nextBounds.width,
          height: nextBounds.height,
        }));

        nextElements = result.elements;
      }

      elementsRef.current = nextElements;
      onElementsChange(
        nextElements,
        { transient: true, selectedId: activeResizeState.elementId },
      );
      return;
    }

    if (!activeDragState) {
      return;
    }

    if (!matchesInteractionInput(event, activeDragState)) {
      return;
    }

    const deltaX = toCanvasDelta(event.clientX - activeDragState.startX);
    const deltaY = toCanvasDelta(event.clientY - activeDragState.startY);
    const newX = activeDragState.bounds.x + deltaX;
    const newY = activeDragState.bounds.y + deltaY;
    let nextGuides: AlignmentGuide[] = [];

    const snappedX = snapToGrid(clampToCanvas(newX, activeDragState.bounds.width, activeDragState.bounds.boundsWidth), safeGridSize, snapEnabled);
    const snappedY = snapToGrid(clampToCanvas(newY, activeDragState.bounds.height, activeDragState.bounds.boundsHeight), safeGridSize, snapEnabled);
    const activeParentId = activeDragState.snapshots[0]?.parentId ?? null;
    const guideScope = getSiblingScopeForParent(elementsRef.current, activeParentId);
    const smartSnap = snapEnabled
      ? resolveSmartDragSnap(
        guideScope,
        activeDragState.elementIds,
        {
          width: activeDragState.bounds.boundsWidth,
          height: activeDragState.bounds.boundsHeight,
        },
        snappedX,
        snappedY,
        activeDragState.bounds.width,
        activeDragState.bounds.height,
      )
      : {
        x: snappedX,
        y: snappedY,
        guides: [],
      };
    nextGuides = smartSnap.guides;

    const moveDeltaX = clampToCanvas(smartSnap.x, activeDragState.bounds.width, activeDragState.bounds.boundsWidth) - activeDragState.bounds.x;
    const moveDeltaY = clampToCanvas(smartSnap.y, activeDragState.bounds.height, activeDragState.bounds.boundsHeight) - activeDragState.bounds.y;
    const snapshotById = new Map(activeDragState.snapshots.map((snapshot) => [snapshot.id, snapshot]));
    let nextElements = elementsRef.current;

    for (const elementId of activeDragState.elementIds) {
      const snapshot = snapshotById.get(elementId);
      if (!snapshot) {
        continue;
      }

      const result = updateElementById(nextElements, elementId, (element) => ({
        ...element,
        x: clampToCanvas(snapshot.x + moveDeltaX, snapshot.width, snapshot.boundsWidth),
        y: clampToCanvas(snapshot.y + moveDeltaY, snapshot.height, snapshot.boundsHeight),
        zIndex: activeDragState.elementIds.length > 1
          ? snapshot.zIndex + activeDragState.zIndexOffset
          : activeDragState.raisedZIndex,
      }));

      nextElements = result.elements;
    }

    setAlignmentGuides(nextGuides);
    elementsRef.current = nextElements;
    onElementsChange(nextElements, { transient: true, selectedId: activeDragState.elementId });
  }, [disabled, isPreview, onElementsChange, safeGridSize, size.height, size.width, snapEnabled, toCanvasDelta]);

  const handleGlobalElementUp = useCallback((event?: MouseEvent | PointerEvent) => {
    const activeDragState = dragStateRef.current;
    const activeResizeState = resizeStateRef.current;
    const activeInteraction = activeDragState || activeResizeState;

    if (event && activeInteraction && !matchesInteractionInput(event, activeInteraction)) {
      return;
    }

    const activeElementId = activeDragState?.elementId || activeResizeState?.elementId || selectedId;
    const hadActiveTransform = Boolean(activeInteraction);
    dragStateRef.current = null;
    resizeStateRef.current = null;
    setDragState(null);
    setResizeState(null);
    setAlignmentGuides([]);
    if (hadActiveTransform) {
      exitTextEditingForTransform();
      onElementsChange(elementsRef.current, { commit: true, selectedId: activeElementId });
    }
  }, [exitTextEditingForTransform, onElementsChange, selectedId]);

  useEffect(() => {
    if (isPreview || disabled) {
      return;
    }

    window.addEventListener('pointermove', handleGlobalElementMove);
    window.addEventListener('pointerup', handleGlobalElementUp);
    window.addEventListener('pointercancel', handleGlobalElementUp);
    window.addEventListener('mousemove', handleGlobalElementMove);
    window.addEventListener('mouseup', handleGlobalElementUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalElementMove);
      window.removeEventListener('pointerup', handleGlobalElementUp);
      window.removeEventListener('pointercancel', handleGlobalElementUp);
      window.removeEventListener('mousemove', handleGlobalElementMove);
      window.removeEventListener('mouseup', handleGlobalElementUp);
    };
  }, [disabled, handleGlobalElementMove, handleGlobalElementUp, isPreview]);

  const handleCanvasElementDrop = useCallback(
    (event: React.DragEvent, forcedParentId?: string) => {
      if (disabled || isPreview) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      try {
        const rawData = event.dataTransfer.getData('application/json');
        const item = JSON.parse(rawData) as ComponentLibraryItem;
        const normalizedType = normalizeCanvasElementType(item.type);

        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (!canvasRect) {
          return;
        }

        const parsedX = snapToGrid(toCanvasDelta(event.clientX - canvasRect.left), safeGridSize, snapEnabled);
        const parsedY = snapToGrid(toCanvasDelta(event.clientY - canvasRect.top), safeGridSize, snapEnabled);

        if (forcedParentId) {
          const parent = findElementById(elements, forcedParentId);
          const isDropTarget = parent && !parent.locked && canAcceptNestedDrop(parent.type);

          const dropHost = canvasRef.current?.querySelector<HTMLElement>(
            `[data-element-id="${forcedParentId}"]`
          );

          if (isDropTarget && dropHost) {
            const hostRect = dropHost.getBoundingClientRect();
            const childX = snapToGrid(toCanvasDelta(event.clientX - hostRect.left), safeGridSize, snapEnabled);
            const childY = snapToGrid(toCanvasDelta(event.clientY - hostRect.top), safeGridSize, snapEnabled);

            if (item.reusableContent?.elements?.length) {
              const reusableChildren = createCanvasElementsFromReusableContent(
                item.reusableContent,
                childX,
                childY,
                getMaxZIndex(parent.children || []) + 1,
              );
              let nextElements = elements;
              let inserted = false;
              for (const child of reusableChildren) {
                const next = insertElementAsChild(nextElements, forcedParentId, child);
                nextElements = next.elements;
                inserted = inserted || next.updated;
              }

              if (inserted) {
                onElementsChange(nextElements);
                onSelect(reusableChildren[0]?.id || forcedParentId);
              }

              return;
            }

            const child = createCanvasElementFromLibraryItem(
              { ...item, type: normalizedType as CanvasElement['type'] },
              childX,
              childY,
            );
            const withChild = insertElementAsChild(elements, forcedParentId, child);

            if (withChild.updated) {
              onElementsChange(withChild.elements);
              onSelect(child.id);
            }

            return;
          }
        }

        if (item.reusableContent?.elements?.length) {
          const reusableElements = createCanvasElementsFromReusableContent(
            item.reusableContent,
            parsedX,
            parsedY,
            getMaxZIndex(elements) + 1,
          );

          if (reusableElements.length) {
            onElementsChange([...elements, ...reusableElements]);
            onSelect(reusableElements[0].id);
          }

          return;
        }

        const rootElement = createCanvasElementFromLibraryItem(
          { ...item, type: normalizedType as CanvasElement['type'] },
          parsedX,
          parsedY
        );

        onElementsChange([...elements, rootElement]);
        onSelect(rootElement.id);
      } catch (error) {
        console.error('Failed to drop element:', error);
      }
    },
    [disabled, elements, isPreview, onElementsChange, onSelect, safeGridSize, snapEnabled, toCanvasDelta]
  );

  const handleElementPropsUpdate = useCallback(
    (elementId: string, updates: { [key: string]: unknown }) => {
      if (disabled || isPreview) {
        return;
      }

      const next = updateElementById(elementsRef.current, elementId, (element) => ({
        ...element,
        props: { ...element.props, ...updates },
      }));

      if (next.updated) {
        onElementsChange(next.elements);
      }
    },
    [disabled, isPreview, onElementsChange]
  );

  useEffect(() => {
    if (disabled || isPreview || typeof window === 'undefined') {
      return;
    }

    const handleActiveEditorContentSync = (event: Event) => {
      const detail = (event as CustomEvent<{ elementId?: unknown; content?: unknown }>).detail;
      const elementId = typeof detail?.elementId === 'string' ? detail.elementId : null;
      const content = Array.isArray(detail?.content) ? detail.content : null;
      if (!elementId || !content) {
        return;
      }

      handleElementPropsUpdate(elementId, { content });
    };

    window.addEventListener(ACTIVE_EDITOR_CONTENT_SYNC_EVENT, handleActiveEditorContentSync);
    return () => {
      window.removeEventListener(ACTIVE_EDITOR_CONTENT_SYNC_EVENT, handleActiveEditorContentSync);
    };
  }, [disabled, handleElementPropsUpdate, isPreview]);

  /**
   * Handle canvas resize start
   */
  const handleCanvasResizeStart = useCallback((e: React.MouseEvent) => {
    if (isPreview || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setCanvasResizeState({
      startY: e.clientY,
      initialHeight: size.height,
    });
  }, [disabled, isPreview, size.height]);

  /**
   * Global mouse move for canvas resize (attached to window/doc usually but we'll use local + capture for now)
   * actually local onMouseMove is fine if we are big enough, but typically we want window listener.
   * For this "visual editing surface", we'll simple check in the main handleMouseMove
   */

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (disabled || isPreview) {
      return;
    }

    if (canvasResizeState && onSizeChange) {
      const deltaY = toCanvasDelta(e.clientY - canvasResizeState.startY);
      const newHeight = Math.max(size.minHeight || 600, canvasResizeState.initialHeight + deltaY);
      // Snap to 10
      const snappedHeight = Math.round(newHeight / 10) * 10;
      onSizeChange({ ...size, height: snappedHeight });
    }
  }, [canvasResizeState, disabled, isPreview, onSizeChange, size, toCanvasDelta]);

  const handleGlobalMouseUp = useCallback(() => {
    if (canvasResizeState) {
      setCanvasResizeState(null);
    }
  }, [canvasResizeState]);

  useEffect(() => {
    if (canvasResizeState) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      }
    }
  }, [canvasResizeState, handleGlobalMouseMove, handleGlobalMouseUp]);

  /**
   * Handle mouse up to end dragging/resizing
   */
  const handleMouseUp = useCallback((event: React.MouseEvent) => {
    handleGlobalElementUp(event.nativeEvent);
  }, [handleGlobalElementUp]);

  /**
   * Handle canvas click to deselect
   */
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    const eventTarget = getTargetElement(event.target);
    const clickedElementId = eventTarget?.closest?.('[data-element-id]')?.getAttribute('data-element-id');
    if (clickedElementId) {
      return;
    }

    if (isTextEditorInteraction(eventTarget) || isInspectorInteraction(eventTarget)) {
      debugTextInteraction('handleCanvasClick skipped in text editor', {
        targetTag: (eventTarget as Element | null)?.tagName,
      });
      return;
    }

    if (!isPreview) {
      onSelect(null);
      setEditingId(null);
      clearActiveEditor();
    }
  }, [clearActiveEditor, isInspectorInteraction, isPreview, isTextEditorInteraction, onSelect]);

  const handleCanvasDoubleClick = useCallback((event: React.MouseEvent) => {
    if (disabled) {
      return;
    }

    const eventTarget = getTargetElement(event.target);
    if (!eventTarget) {
      return;
    }

    const clickedId = eventTarget.closest?.('[data-element-id]')?.getAttribute('data-element-id');
    debugTextInteraction('handleCanvasDoubleClick', { clickedId });
    requestEditForElement(clickedId || null);
  }, [disabled, getTargetElement, requestEditForElement]);

  const handleDoubleClick = useCallback((elementId: string) => {
    if (isPreview || disabled) {
      return;
    }

    requestEditForElement(elementId);
  }, [disabled, isPreview, requestEditForElement]);

  const handleCanvasKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setEditingId(null);
      clearActiveEditor();
    }
  }, [clearActiveEditor]);

  useEffect(() => {
    window.addEventListener(EDITOR_ACTIVATION_EVENT, handleExternalEditRequest);
    return () => {
      window.removeEventListener(EDITOR_ACTIVATION_EVENT, handleExternalEditRequest);
    };
  }, [handleExternalEditRequest]);

  useEffect(() => {
    if (isPreview) {
      return;
    }

    window.addEventListener('keydown', handleCanvasKeyDown);
    return () => {
      window.removeEventListener('keydown', handleCanvasKeyDown);
    };
  }, [handleCanvasKeyDown, isPreview]);

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative bg-white shadow-[0_18px_55px_rgba(15,23,42,0.16)] transition-shadow',
        isPreview ? 'overflow-hidden' : 'overflow-visible',
        !isPreview && (disabled ? 'cursor-not-allowed ring-1 ring-slate-200' : 'cursor-default ring-1 ring-slate-200'),
        isDropActive && !isPreview && !disabled && 'ring-2 ring-sky-500 shadow-[0_22px_70px_rgba(14,165,233,0.24)]'
      )}
      style={{
        width: size.width,
        height: size.height,
        minWidth: size.width,
        minHeight: size.height,
      }}
      onMouseUp={handleMouseUp}
      onPointerMove={(event) => handleGlobalElementMove(event.nativeEvent)}
      onPointerUp={(event) => handleGlobalElementUp(event.nativeEvent)}
      onPointerCancel={(event) => handleGlobalElementUp(event.nativeEvent)}
      onMouseMove={(event) => handleGlobalElementMove(event.nativeEvent)}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onDragOver={(event) => {
        if (!isPreview && !disabled) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragEnter={(event) => {
        if (!isPreview && !disabled) {
          event.preventDefault();
          setIsDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (!isPreview && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDropActive(false);
        }
      }}
      onDrop={(event) => {
        setIsDropActive(false);
        handleCanvasElementDrop(event);
      }}
      data-testid="editor-canvas"
    >
      {/* Grid Background */}
      {!isPreview && showGrid && (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          data-testid="editor-canvas-grid"
          data-grid-size={safeGridSize}
          style={{
            backgroundImage: `
              linear-gradient(to right, #cbd5e1 1px, transparent 1px),
              linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)
            `,
            backgroundSize: `${safeGridSize}px ${safeGridSize}px`,
          }}
        />
      )}

      {!isPreview && elements.length === 0 && (
        <div className="pointer-events-none absolute inset-10 flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 text-sm font-medium text-slate-500">
          Drop components onto the canvas
        </div>
      )}

      {!isPreview && alignmentGuides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${guide.position}-${index}`}
          className="pointer-events-none absolute z-[60] bg-fuchsia-500/80 shadow-[0_0_0_1px_rgba(217,70,239,0.22)]"
          data-testid="editor-alignment-guide"
          data-guide-orientation={guide.orientation}
          data-guide-position={guide.position}
          style={guide.orientation === 'vertical'
            ? {
                left: guide.position,
                top: 0,
                width: 1,
                height: size.height,
              }
            : {
                left: 0,
                top: guide.position,
                width: size.width,
                height: 1,
              }}
        />
      ))}

      {/* Canvas Elements */}
      {elements.map((element) => (
          <CanvasElementComponent
            key={element.id}
            element={element}
            isSelected={element.id === selectedId || selectedIds.includes(element.id)}
            selectedId={selectedId}
            selectedIds={selectedIds}
            draggingId={dragState?.elementId ?? resizeState?.elementId ?? null}
            isPreview={isPreview}
            disabled={disabled}
            onDragStart={handleElementDragStart}
            onResizeStart={handleResizeStart}
            onClick={(e) => {
              e.stopPropagation();
              debugTextInteraction('element onClick', {
                elementId: element.id,
                elementType: element.type,
              });
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                onToggleSelect?.(element.id);
                return;
              }
              onSelect(element.id);
            }}
            onSelectElement={onSelect}
            onToggleSelectElement={onToggleSelect}
            onUpdate={(updates) => handleElementPropsUpdate(element.id, updates)}
            onUpdateElement={handleElementPropsUpdate}
            onDrop={(event) => handleCanvasElementDrop(event, element.id)}
            isEditing={editingId === element.id}
            onStopEditing={() => setEditingId(null)}
            onDoubleClick={() => handleDoubleClick(element.id)}
        />
      ))}

      {/* Selection Info */}
      {!isPreview && selectedId && (
        <SelectionInfo elements={elements} selectedId={selectedId} />
      )}

      {/* Canvas Resize Handle (Bottom) */}
      {!isPreview && (
        <div
          className="absolute bottom-0 left-0 z-0 flex h-4 w-full cursor-ns-resize items-end justify-center bg-transparent pb-1 transition-all hover:h-6 hover:bg-primary/5 group"
          onMouseDown={handleCanvasResizeStart}
          title="Drag to resize canvas height"
        >
          <div className="w-16 h-1 bg-muted-foreground/20 group-hover:bg-primary/50 rounded-full transition-colors" />
        </div>
      )}
    </div>
  );
}

// ============================================
// CANVAS ELEMENT COMPONENT
// ============================================

interface CanvasElementComponentProps {
  element: CanvasElement;
  isSelected: boolean;
  selectedId: string | null;
  selectedIds: string[];
  draggingId: string | null;
  isPreview: boolean;
  disabled?: boolean;
  onDragStart: (e: React.PointerEvent | React.MouseEvent, elementId: string) => void;
  onResizeStart: (e: React.MouseEvent | React.PointerEvent, elementId: string, handle: ResizeHandlePosition) => void;
  onClick: (e: React.MouseEvent) => void;
  onSelectElement: (elementId: string) => void;
  onToggleSelectElement?: (elementId: string) => void;
  onUpdate: (updates: { [key: string]: unknown }) => void;
  onUpdateElement: (elementId: string, updates: { [key: string]: unknown }) => void;
  onDrop?: (e: React.DragEvent, forcedParentId?: string) => void;
  isEditing: boolean;
  onDoubleClick: (elementId?: string) => void;
  onStopEditing?: () => void;
}

function CanvasElementComponent({
  element,
  isSelected,
  selectedId,
  selectedIds,
  draggingId,
  isPreview,
  disabled = false,
  onDragStart,
  onResizeStart,
  onClick,
  onSelectElement,
  onToggleSelectElement,
  onUpdate,
  onUpdateElement,
  onDrop,
  isEditing,
  onDoubleClick,
  onStopEditing,
  }: CanvasElementComponentProps) {
  const p = element.props as Record<string, any>;
  const sharedStyle = buildSharedElementStyle(element);
  const childElements = element.children || [];
  const resolvedSelectedId = selectedId ?? null;
  const isHidden = element.visible === false;
  const isLocked = element.locked === true;
  const isEditingEnabled = isEditing && !isPreview && !disabled;
  const canReceiveNestedDrop = !disabled && !isLocked && canAcceptNestedDrop(element.type);

  if (isPreview && isHidden) {
    return null;
  }

  const renderChildren = () => (
    <>
      {childElements.map((child) => (
        <CanvasElementComponent
          key={child.id}
          element={child}
          isSelected={child.id === resolvedSelectedId || selectedIds.includes(child.id)}
          selectedId={resolvedSelectedId}
          selectedIds={selectedIds}
          draggingId={draggingId}
          isPreview={isPreview}
          disabled={disabled}
          onDragStart={onDragStart}
          onResizeStart={onResizeStart}
          onClick={(event) => {
            event.stopPropagation();
            if (event.shiftKey || event.metaKey || event.ctrlKey) {
              onToggleSelectElement?.(child.id);
              return;
            }
            onSelectElement(child.id);
          }}
          onSelectElement={onSelectElement}
          onToggleSelectElement={onToggleSelectElement}
          onUpdate={(updates) => onUpdateElement(child.id, updates)}
          onUpdateElement={onUpdateElement}
          onDrop={(event, forcedParentId) => onDrop?.(event, forcedParentId)}
          isEditing={false}
          onDoubleClick={() => onDoubleClick(child.id)}
          onStopEditing={onStopEditing}
        />
      ))}
    </>
  );

  const containerDropHandlers = isPreview || disabled
    ? {}
    : {
        onDragOver: (event: React.DragEvent) => {
          if (canReceiveNestedDrop) {
            event.preventDefault();
          }
        },
        onDrop: (event: React.DragEvent) => {
          if (onDrop && canReceiveNestedDrop) {
            onDrop(event, element.id);
          }
        },
      };

  const renderContent = () => {
    const resolvedType = normalizeCanvasElementType(element.type);

    switch (resolvedType) {
      case 'text':
        return (
          <div
            style={{ ...sharedStyle, width: '100%', height: '100%' }}
            onDoubleClick={() => onDoubleClick()}
            onMouseDown={(e) => {
              if (isEditing) e.stopPropagation();
            }}
          >
            <RichTextBlock
              key={`text-${element.id}`}
              elementId={element.id}
              content={p.content}
              onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditingEnabled}
              className="w-full h-full"
              placeholder="Type '/' for commands..."
              style={{
                ...sharedStyle,
                fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
                fontSize: p.fontSize ?? sharedStyle.fontSize ?? 16,
                fontWeight: p.fontWeight || sharedStyle.fontWeight || 'normal',
                color: p.color || sharedStyle.color || '#000000',
                textAlign: p.textAlign || sharedStyle.textAlign || 'left',
                lineHeight: p.lineHeight ?? sharedStyle.lineHeight,
              }}
            />
          </div>
        );

      case 'heading':
      return (
        <div
          style={{ ...sharedStyle, width: '100%', height: '100%' }}
          onDoubleClick={() => onDoubleClick()}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation();
          }}
        >
            <RichTextBlock
            key={`heading-${element.id}`}
            elementId={element.id}
            content={p.content}
            onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditingEnabled}
              className="w-full h-full"
              defaultType={p.level || 'h2'}
              style={{
                ...sharedStyle,
                fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
                fontSize: p.fontSize ?? sharedStyle.fontSize ?? 24,
                fontWeight: p.fontWeight || sharedStyle.fontWeight || 'bold',
                color: p.color || sharedStyle.color || '#000000',
                textAlign: p.textAlign || sharedStyle.textAlign || 'left',
                lineHeight: p.lineHeight ?? sharedStyle.lineHeight,
              }}
              placeholder="Heading..."
            />
          </div>
        );

      case 'image': {
        const imageSrc = resolveElementMediaSource(p as Record<string, unknown>, 'src')
          || 'https://via.placeholder.com/300x200?text=Add+Image';

        return (
          <img
            src={imageSrc}
            alt={p.alt ?? ''}
            title={sanitizeText(p.title) || undefined}
            loading={normalizeIframeLoading(p.loading)}
            decoding={normalizeImageDecoding(p.decoding)}
            referrerPolicy={normalizeIframeReferrerPolicy(p.referrerPolicy)}
            draggable={false}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              objectFit: p.objectFit ?? 'cover',
              objectPosition: sanitizeText(p.objectPosition) || 'center center',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
              pointerEvents: 'none', // Prevents image from capturing mouse events
              userSelect: 'none',
            }}
          />
        );
      }

      case 'button': {
        const target = normalizeLinkTargetValue(p.target);
        const rel = normalizeLinkRelValue(target, p.rel);
        const commonInteractiveProps = {
          title: typeof p.title === 'string' && p.title.trim() ? p.title : undefined,
          'aria-label': typeof p.ariaLabel === 'string' && p.ariaLabel.trim() ? p.ariaLabel : undefined,
        };
        const buttonStyle: CSSProperties = {
          ...sharedStyle,
          width: '100%',
          height: '100%',
          backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#3b82f6',
          color: p.color ?? sharedStyle.color ?? '#ffffff',
          border: sharedStyle.border ?? 'none',
          borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
          fontSize: p.fontSize ?? sharedStyle.fontSize ?? 16,
          fontWeight: p.fontWeight || sharedStyle.fontWeight || '500',
          cursor: isPreview ? 'pointer' : 'default',
          pointerEvents: isPreview ? 'auto' : 'none',
          userSelect: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
        };

        if (isPreview && typeof p.href === 'string' && p.href.trim()) {
          return (
            <a
              href={p.href}
              target={target}
              rel={rel}
              download={p.download === true ? '' : undefined}
              style={buttonStyle}
              {...commonInteractiveProps}
            >
              {p.label ?? 'Button'}
            </a>
          );
        }

        return (
          <button
            type={p.type === 'submit' || p.type === 'reset' ? p.type : 'button'}
            style={buttonStyle}
            {...commonInteractiveProps}
          >
            {p.label ?? 'Button'}
          </button>
        );
      }

      case 'nav': {
        const navItems = Array.isArray(p.navItems)
          ? p.navItems
            .map((item, index) => {
              if (typeof item === 'string') {
                return { label: item, href: `#${item.toLowerCase().replace(/[^a-z0-9]+/g, '-') || index}` };
              }

              if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                const label = String(record.label || record.title || record.name || `Item ${index + 1}`);
                return { label, href: String(record.href || record.url || '#') };
              }

              return null;
            })
            .filter(Boolean) as Array<{ label: string; href: string }>
          : [];
        const isVertical = p.navDirection === 'vertical';

        return (
          <nav
            {...containerDropHandlers}
            aria-label={typeof p.ariaLabel === 'string' ? p.ariaLabel : 'Page navigation'}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? 'transparent',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
              border: sharedStyle.border ?? 'none',
              position: 'relative',
              display: 'flex',
              alignItems: isVertical ? 'stretch' : (p.alignItems as string) || 'center',
              justifyContent: (p.justifyContent as string) || (isVertical ? 'flex-start' : 'center'),
              flexDirection: isVertical ? 'column' : 'row',
              gap: toCssLength(p.gap ?? 18),
              padding: toCssLength(p.padding ?? 0),
            }}
          >
            {childElements.length > 0 ? renderChildren() : (
              navItems.length > 0 ? navItems.map((item) => (
                <a
                  key={`${item.label}-${item.href}`}
                  href={isPreview ? item.href : undefined}
                  onClick={(event) => {
                    if (!isPreview) event.preventDefault();
                  }}
                  style={{
                    color: p.color ?? sharedStyle.color ?? '#111827',
                    fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
                    fontWeight: p.fontWeight || sharedStyle.fontWeight || '600',
                    textDecoration: 'none',
                    lineHeight: 1.2,
                    pointerEvents: isPreview ? 'auto' : 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </a>
              )) : (
                !isPreview && (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    border: sharedStyle.border ?? '1px dashed #d1d5db',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: 12,
                  }}>
                    Add navigation items
                  </div>
                )
              )
            )}
          </nav>
        );
      }

      case 'box':
      case 'container':
      case 'section':
      case 'header':
      case 'footer':
        return (
          <div
            {...containerDropHandlers}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#f3f4f6',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
              border: sharedStyle.border ?? 'none',
              position: 'relative',
            }}
          >
            {renderChildren()}
            {!isPreview && !childElements.length && (
              <div style={{
                width: '100%',
                height: '100%',
                border: sharedStyle.border ?? '1px dashed #d1d5db',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: 12,
              }}>
                Drop components here
              </div>
            )}
          </div>
        );

      case 'video': {
        const videoSrc = resolveElementMediaSource(p as Record<string, unknown>, 'src');
        const posterSrc = resolveMediaSource(p.poster);

        if (!videoSrc) {
          return (
            <div
              style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#1f2937',
                borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
                borderColor: p.borderColor ?? '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: 14,
              }}
            >
              🎬 Set video URL in properties
            </div>
          );
        }
      return (
        <video
          src={videoSrc}
          poster={posterSrc || undefined}
          controls={isPreview ? getBooleanWithFallback(p.controls, true) : false}
          autoPlay={isPreview ? getBooleanWithFallback(p.autoplay ?? p.autoPlay, false) : false}
          loop={getBoolean(p.loop)}
          muted={getBoolean(p.muted)}
          playsInline={getBooleanWithFallback(p.playsInline, true)}
          style={{
            ...sharedStyle,
            width: '100%',
            height: '100%',
            objectFit: p.objectFit ?? 'cover',
            pointerEvents: isPreview ? 'auto' : 'none',
          }}
        />
      );
      }

      case 'embed':
        const embedSrc = normalizeEmbedUrl(p.src || p.url, p.allowedHosts ?? p.embedAllowedHosts);
        if (!embedSrc) {
          return (
            <div
              style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#f3f4f6',
                border: sharedStyle.border ?? '1px solid #e5e7eb',
                borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                fontSize: 14,
              }}
            >
              📦 Set an allowed embed URL in properties
            </div>
          );
        }
        return (
          <iframe
            title={sanitizeText(p.title) || 'Embedded content'}
            src={embedSrc}
            allow={normalizeIframeAllow(p.allow)}
            allowFullScreen={parseBooleanSetting(p.allowFullScreen, true)}
            loading={normalizeIframeLoading(p.loading)}
            referrerPolicy={normalizeIframeReferrerPolicy(p.referrerPolicy)}
            sandbox={normalizeIframeSandbox(p.sandbox)}
            data-backy-embed-allowed-hosts={parseEmbedAllowedHosts(p.allowedHosts ?? p.embedAllowedHosts).join(',')}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              border: sharedStyle.border ?? 'none',
              pointerEvents: isPreview ? 'auto' : 'none',
            }}
          />
        );

      case 'html':
      case 'table': {
        const htmlMarkup = sanitizeText(p.html) || sanitizeText(p.content);
        if (!htmlMarkup) {
          return (
            <div
              style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#f8fafc',
                border: sharedStyle.border ?? '1px dashed #cbd5e1',
                borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 6),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                fontSize: 13,
                padding: 12,
                textAlign: 'center',
              }}
            >
              Add HTML markup in properties
            </div>
          );
        }

        return (
          <iframe
            title={sanitizeText(p.title) || `${resolvedType} preview`}
            sandbox=""
            srcDoc={htmlMarkup}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              border: sharedStyle.border ?? 'none',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
              pointerEvents: isPreview ? 'auto' : 'none',
            }}
          />
        );
      }

      case 'divider':
        const dividerThickness = toCssLength(p.thickness ?? '1px') ?? '1px';
        const dividerColor = p.borderColor || p.color || '#e5e7eb';
        const dividerStyle = p.borderStyle || 'solid';
        return (
          <hr
            style={{
              ...sharedStyle,
              width: '100%',
              height: 0,
              boxSizing: 'border-box',
              border: 'none',
              borderTop: `${dividerThickness} ${dividerStyle} ${dividerColor}`,
              color: dividerColor,
            }}
          />
        );

      case 'input':
        {
          const fieldLabel = formatFieldLabel(p.label);
          const helpText = formatHelpText(p.helpText);
          const required = getBoolean(p.required);
          const disabled = getBoolean(p.disabled);
          const minLength = toNumericAttribute(p.minLength);
          const maxLength = toNumericAttribute(p.maxLength);
          const inputType = normalizeInputType(p.inputType ?? p.type);
          const placeholder = sanitizeText(p.placeholder);
          const inputValue = getFormPreviewValue(p);
          const formOwnerId = getFormOwnerId(p);
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: getFormFieldGap(p, 6),
              width: '100%',
              height: '100%',
            }}
            data-backy-form-owner-id={formOwnerId}
            >
              {fieldLabel ? (
                <label
                  style={getFormLabelStyle(p, sharedStyle)}
                >
                  {fieldLabel}
                  {required ? ' *' : ''}
                </label>
              ) : null}
              <input
                type={inputType}
                placeholder={placeholder || 'Enter text...'}
                {...(inputType === 'file'
                  ? {}
                  : isPreview
                    ? { defaultValue: inputValue }
                    : { value: inputValue, readOnly: true })}
                disabled={!isPreview || disabled}
                required={required}
                name={typeof p.name === 'string' ? p.name : undefined}
                form={formOwnerId}
                pattern={typeof p.pattern === 'string' && p.pattern.trim() ? p.pattern : undefined}
                min={sanitizeText(p.min) || undefined}
                max={sanitizeText(p.max) || undefined}
                step={sanitizeText(p.step) || undefined}
                minLength={minLength}
                maxLength={maxLength}
                style={{
                  ...sharedStyle,
                  width: '100%',
                  height: '100%',
                  padding: sharedStyle.padding ?? '8px 12px',
                  fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
                  border: sharedStyle.border ?? `1px solid ${p.borderColor ?? '#d1d5db'}`,
                  borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 4),
                  backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
                  pointerEvents: isPreview ? 'auto' : 'none',
                }}
              />
              {helpText ? (
                <p style={getFormHelpStyle(p)}>
                  {helpText}
                </p>
              ) : null}
            </div>
          );
        }

      case 'textarea':
        {
          const fieldLabel = formatFieldLabel(p.label);
          const helpText = formatHelpText(p.helpText);
          const required = getBoolean(p.required);
          const disabled = getBoolean(p.disabled);
          const rows = toNumericAttribute(p.rows);
          const minLength = toNumericAttribute(p.minLength);
          const maxLength = toNumericAttribute(p.maxLength);
          const placeholder = sanitizeText(p.placeholder);
          const textareaValue = getFormPreviewValue(p);
          const formOwnerId = getFormOwnerId(p);
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: getFormFieldGap(p, 6),
              width: '100%',
              height: '100%',
            }}
            data-backy-form-owner-id={formOwnerId}
            >
              {fieldLabel ? (
                <label
                  style={getFormLabelStyle(p, sharedStyle)}
                >
                  {fieldLabel}
                  {required ? ' *' : ''}
                </label>
              ) : null}
              <textarea
                rows={rows || 4}
                placeholder={placeholder || 'Enter text...'}
                {...(isPreview
                  ? { defaultValue: textareaValue }
                  : { value: textareaValue, readOnly: true })}
                disabled={!isPreview || disabled}
                required={required}
                name={typeof p.name === 'string' ? p.name : undefined}
                form={formOwnerId}
                minLength={minLength}
                maxLength={maxLength}
                style={{
                  ...sharedStyle,
                  width: '100%',
                  height: '100%',
                  padding: sharedStyle.padding ?? '8px 12px',
                  fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
                  border: sharedStyle.border ?? `1px solid ${p.borderColor ?? '#d1d5db'}`,
                  borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 4),
                  backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
                  pointerEvents: isPreview ? 'auto' : 'none',
                  resize: normalizeTextareaResize(p.resize),
                }}
              />
              {helpText ? (
                <p style={getFormHelpStyle(p)}>
                  {helpText}
                </p>
              ) : null}
            </div>
          );
        }

      case 'select':
        const selectOptions = parseFormOptions(p.options);
        {
          const fieldLabel = formatFieldLabel(p.label);
          const helpText = formatHelpText(p.helpText);
          const required = getBoolean(p.required);
          const disabled = getBoolean(p.disabled);
          const placeholder = sanitizeText(p.placeholder);
          const selectedValue = p.value ?? p.defaultValue ?? (placeholder ? '' : selectOptions[0] ?? '');
          const formOwnerId = getFormOwnerId(p);
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: getFormFieldGap(p, 6),
              width: '100%',
              height: '100%',
            }}
            data-backy-form-owner-id={formOwnerId}
            >
              {fieldLabel ? (
                <label
                  style={getFormLabelStyle(p, sharedStyle)}
                >
                  {fieldLabel}
                  {required ? ' *' : ''}
                </label>
              ) : null}
              <select
                {...(isPreview
                  ? { defaultValue: selectedValue }
                  : { value: selectedValue })}
                disabled={!isPreview || disabled}
                required={required}
                name={typeof p.name === 'string' ? p.name : undefined}
                form={formOwnerId}
                style={{
                  ...sharedStyle,
                  width: '100%',
                  height: '100%',
                  padding: sharedStyle.padding ?? '8px 12px',
                  fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
                  color: p.color ?? sharedStyle.color ?? '#374151',
                  backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
                  border: sharedStyle.border ?? `1px solid ${p.borderColor ?? '#d1d5db'}`,
                  borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 4),
                  pointerEvents: isPreview ? 'auto' : 'none',
                }}
              >
                {placeholder || selectOptions.length === 0 ? (
                  <option value="" disabled={selectOptions.length > 0}>
                    {placeholder || 'Select'}
                  </option>
                ) : null}
                {selectOptions.length ? (
                  selectOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))
                ) : null}
              </select>
              {helpText ? (
                <p style={getFormHelpStyle(p)}>
                  {helpText}
                </p>
              ) : null}
            </div>
          );
        }

      case 'checkbox':
      case 'radio':
        {
          const choiceType = resolvedType === 'checkbox' ? 'checkbox' : 'radio';
          const fieldLabel = formatFieldLabel(p.label);
          const helpText = formatHelpText(p.helpText);
          const optionItems = parseFormOptions(p.options);
          const required = getBoolean(p.required);
          const disabled = getBoolean(p.disabled);
          const selectedValues = parseFormInputValues(
            p.defaultValue !== undefined ? p.defaultValue : p.value
          );
          const selectedSet = new Set(selectedValues);
          const fallbackOptionValue = choiceType === 'radio'
            ? selectedValues[0] || sanitizeText(p.value) || 'on'
            : sanitizeText(p.value) || 'on';
          const choiceItems = optionItems.length > 0 ? optionItems : [fallbackOptionValue];
          const formOwnerId = getFormOwnerId(p);
          return (
            <div
              style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: getFormFieldGap(p, 8),
                boxSizing: 'border-box',
              }}
              data-backy-form-owner-id={formOwnerId}
            >
              {fieldLabel ? (
                <label
                  style={getFormLabelStyle(p, sharedStyle)}
                >
                  {fieldLabel}
                  {required ? ' *' : ''}
                </label>
              ) : null}
              <div style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                padding: sharedStyle.padding ?? '8px 12px',
                color: p.color ?? sharedStyle.color ?? '#374151',
                backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
                border: sharedStyle.border ?? `1px solid ${p.borderColor ?? '#d1d5db'}`,
                borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 4),
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxSizing: 'border-box',
              }}
              >
                {choiceItems.map((option, optionIndex) => {
                  const isChecked = choiceType === 'radio'
                    ? selectedValues[0] === option
                    : selectedSet.has(option);
                  const optionLabel = optionItems.length > 0 ? option : fieldLabel || 'Option';

                  return (
                    <label
                      key={`${element.id}-${option}-${optionIndex}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: p.fontSize ?? 14 }}
                    >
                      <input
                        type={choiceType}
                        name={typeof p.name === 'string' ? p.name : choiceType === 'radio' ? `${element.id}-group` : undefined}
                        form={formOwnerId}
                        value={option}
                        required={choiceType === 'checkbox' ? optionIndex === 0 && required : required}
                        disabled={!isPreview || disabled}
                        {...(isPreview
                          ? { defaultChecked: Boolean(isChecked) }
                          : { checked: Boolean(isChecked), readOnly: true })}
                        style={{
                          pointerEvents: isPreview ? 'auto' : 'none',
                        }}
                      />
                      <span>{optionLabel}</span>
                    </label>
                  );
                })}
                {helpText ? (
                  <p style={{
                    ...getFormHelpStyle(p),
                    marginTop: 6,
                  }}
                  >
                    {helpText}
                  </p>
                ) : null}
              </div>
            </div>
          );
        }

      case 'link':
        {
          const target = normalizeLinkTargetValue(p.target);
          const rel = normalizeLinkRelValue(target, p.rel);
        return (
          <a
            href={isPreview ? (p.href ?? '#') : undefined}
            target={target}
            rel={rel}
            title={typeof p.title === 'string' && p.title.trim() ? p.title : undefined}
            aria-label={typeof p.ariaLabel === 'string' && p.ariaLabel.trim() ? p.ariaLabel : undefined}
            style={{
              ...sharedStyle,
              color: p.color ?? sharedStyle.color ?? '#3b82f6',
              fontSize: p.fontSize ?? sharedStyle.fontSize ?? 16,
              textDecoration: p.underline || sharedStyle.textDecoration === 'underline' ? 'underline' : 'none',
              cursor: isPreview ? 'pointer' : 'default',
              pointerEvents: isPreview ? 'auto' : 'none',
              userSelect: 'none',
            }}
          >
            {p.content ?? 'Link Text'}
          </a>
        );
        }

      case 'spacer':
        return (
          <div
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? (isPreview ? 'transparent' : 'rgba(0,0,0,0.05)'),
              border: isPreview ? 'none' : sharedStyle.border ?? '1px dashed #d1d5db',
            }}
            aria-hidden="true"
          />
        );

      case 'list':
        const listValue = normalizeListContent({
          content: p.content,
          items: p.items,
          listType: p.listType,
        });
        const listTypeFromSelection = getListTypeFromSlate(listValue);
        const listTypeFromProps =
          p.listType === 'number'
            ? 'number'
            : p.listType === 'ordered' || p.listType === 'decimal'
              ? 'number'
              : undefined;
        const listType = listTypeFromProps || listTypeFromSelection;
        const listStyleType = p.listMarker ?? (listType === 'number' ? 'decimal' : 'disc');
        const listItems = extractListItemEntriesFromSlate(listValue);
        const listIndent = toNonNegativeCssLength(p.listIndent ?? p.padding ?? 0);
        if (!isEditingEnabled) {
          return React.createElement(
            listType === 'number' ? 'ol' : 'ul',
            {
              style: {
                ...sharedStyle,
                fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
                fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
                textTransform: p.textTransform || sharedStyle.textTransform || 'none',
                color: p.color ?? sharedStyle.color ?? '#000000',
                textAlign: p.textAlign || sharedStyle.textAlign || 'left',
                lineHeight: p.lineHeight ?? sharedStyle.lineHeight,
                listStyleType,
                listStylePosition: 'inside',
                margin: 0,
                marginLeft: listIndent,
                paddingLeft: toCssLength(p.padding ?? sharedStyle.padding ?? 0),
                width: '100%',
                height: '100%',
              },
            },
            ...(listItems.length > 0
              ? listItems.map((item, index) => (
                <li
                  key={`${element.id}-item-${index}`}
                  style={item.indent ? { marginLeft: `${item.indent * 24}px` } : undefined}
                >
                  {item.text}
                </li>
              ))
              : [<li key={`${element.id}-item-empty`}>List item</li>]),
          );
        }
        return (
          <div
            style={{ ...sharedStyle, width: '100%', height: '100%' }}
            onDoubleClick={() => onDoubleClick()}
            onMouseDown={(e) => {
              if (isEditing) e.stopPropagation();
            }}
          >
            <RichTextBlock
              key={`list-${element.id}`}
              elementId={element.id}
              content={listValue}
              onChange={(val) =>
                onUpdate({
                  content: val,
                  items: extractListItemsFromSlate(val),
                  listType: listType || getListTypeFromSlate(val),
                })
              }
              isEditable={isEditingEnabled}
              className="w-full h-full"
              defaultType={listType === 'number' ? 'ol' : 'ul'}
              style={{
                ...sharedStyle,
                fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
                fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
                textTransform: p.textTransform || sharedStyle.textTransform || 'none',
                color: p.color ?? sharedStyle.color ?? '#000000',
                textAlign: p.textAlign || sharedStyle.textAlign || 'left',
                lineHeight: p.lineHeight ?? sharedStyle.lineHeight,
                listStyleType,
                listStylePosition: 'inside',
                marginLeft: listIndent,
                paddingLeft: toCssLength(p.padding ?? sharedStyle.padding ?? 0),
                width: '100%',
                height: '100%',
              }}
              placeholder="List item..."
            />
          </div>
        );

      case 'quote':
        return (
        <div
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              borderLeft: `${toCssLength(p.quoteBorderWidth ?? 4)} solid ${p.quoteBorderColor ?? '#cbd5e1'}`,
              paddingLeft: toCssLength(p.quotePaddingLeft ?? 16),
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 6,
            }}
            onDoubleClick={() => onDoubleClick()}
            onMouseDown={(e) => {
              if (isEditing) e.stopPropagation();
            }}
          >
            <RichTextBlock
              key={`quote-${element.id}`}
              elementId={element.id}
              content={p.content}
              onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditingEnabled}
              className="w-full h-full"
              defaultType="blockquote"
              style={{
                ...sharedStyle,
                fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
                fontSize: p.fontSize ?? sharedStyle.fontSize ?? 16,
                color: p.color ?? sharedStyle.color ?? '#374151',
                lineHeight: p.lineHeight ?? sharedStyle.lineHeight,
                textAlign: p.textAlign || sharedStyle.textAlign || 'left',
                // Apply blockquote visual style to container if needed, or let Plate handle it
                // But Plate blockquote usually has its own border.
                // We'll pass the container styles that mimic the previous look if possible,
                // but Plate's blockquote plugin will likely render its own border.
                // Let's rely on Plate's internal styling for consistency, 
                // but pass font/color.
              }}
              placeholder="Quote..."
            />
            {typeof p.citation === 'string' && p.citation.trim() ? (
              <cite
                style={{
                  color: p.citationColor ?? sharedStyle.color ?? '#64748b',
                  fontSize: p.citationFontSize ?? 13,
                  fontStyle: 'normal',
                }}
              >
                {p.citation}
              </cite>
            ) : null}
          </div>
        );

      case 'form': {
        const formTitle = sanitizeText(p.formTitle) || 'Form Container';
        const formId = sanitizeText(p.formId) || element.id;
        const formActive = getBooleanWithFallback(p.formActive, true);
        const rawAudience = sanitizeText(p.formAudience);
        const formAudience = rawAudience === 'authenticated'
          ? 'Authenticated'
          : rawAudience === 'adminOnly'
            ? 'Admin only'
            : 'Public';
        const enableHoneypot = getBoolean(p.enableHoneypot);
        const enableCaptcha = getBoolean(p.enableCaptcha);
        const captchaProvider = normalizeCaptchaProvider(p.captchaProvider);
        const captchaSiteKey = sanitizeText(p.captchaSiteKey);
        const method = (sanitizeText(p.method) || 'POST').toUpperCase();
        const actionUrl = sanitizeText(p.actionUrl) || sanitizeText(p.action);
        const schemaFields = normalizeFormSchemaFields(p.fields ?? p.formFields ?? p.schema);
        const submitLabel = sanitizeText(p.submitLabel) || 'Submit';
        const formBadges = [
          formActive ? 'Active' : 'Paused',
          formAudience,
          method,
          ...(enableHoneypot ? ['Honeypot'] : []),
          ...(enableCaptcha ? [`Captcha: ${captchaProvider}`] : []),
          ...(actionUrl ? ['Action set'] : []),
        ];
        const fieldLabelStyle = getFormLabelStyle(p, sharedStyle);
        const fieldHelpStyle = getFormHelpStyle(p);
        const fieldControlStyle: CSSProperties = {
          width: '100%',
          minHeight: 40,
          padding: '8px 12px',
          fontSize: p.fontSize ?? sharedStyle.fontSize ?? 14,
          color: p.color ?? sharedStyle.color ?? '#374151',
          backgroundColor: p.fieldBackgroundColor ?? '#ffffff',
          border: `1px solid ${p.fieldBorderColor ?? '#d1d5db'}`,
          borderRadius: toCssLength(p.fieldBorderRadius ?? 6),
          boxSizing: 'border-box',
          pointerEvents: isPreview ? 'auto' : 'none',
        };
        const renderSchemaField = (field: FormSchemaField, fieldIndex: number) => {
          const fieldId = `${element.id}-${field.key}`;
          const fieldOptions = parseFormOptions(field.options);
          const minLength = toNumericAttribute(getFormSchemaValidationValue(field, 'minLength'));
          const maxLength = toNumericAttribute(getFormSchemaValidationValue(field, 'maxLength'));
          const min = getFormSchemaValidationValue(field, 'min');
          const max = getFormSchemaValidationValue(field, 'max');
          const pattern = getFormSchemaValidationValue(field, 'pattern');
          const disabled = !isPreview || field.disabled;
          const fieldWrapperStyle: CSSProperties = {
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          };

          const labelNode = field.label ? (
            <label htmlFor={fieldId} style={fieldLabelStyle}>
              {field.label}
              {field.required ? ' *' : ''}
            </label>
          ) : null;
          const helpNode = field.helpText ? (
            <p style={fieldHelpStyle}>{field.helpText}</p>
          ) : null;

          let control: React.ReactNode;
          if (field.type === 'textarea') {
            control = (
              <textarea
                id={fieldId}
                name={field.key}
                placeholder={field.placeholder}
                defaultValue={field.defaultValue}
                required={field.required}
                disabled={disabled}
                minLength={minLength}
                maxLength={maxLength}
                rows={4}
                data-testid={`editor-form-schema-field-${field.key}`}
                style={{
                  ...fieldControlStyle,
                  minHeight: 92,
                  resize: 'vertical',
                }}
              />
            );
          } else if (field.type === 'select') {
            control = (
              <select
                id={fieldId}
                name={field.key}
                defaultValue={field.defaultValue || ''}
                required={field.required}
                disabled={disabled}
                data-testid={`editor-form-schema-field-${field.key}`}
                style={fieldControlStyle}
              >
                {field.placeholder || fieldOptions.length === 0 ? (
                  <option value="" disabled={fieldOptions.length > 0}>
                    {field.placeholder || 'Select'}
                  </option>
                ) : null}
                {fieldOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            );
          } else if (field.type === 'checkbox' || field.type === 'radio') {
            const choiceType = field.type;
            const choices = fieldOptions.length > 0 ? fieldOptions : [field.defaultValue || 'on'];
            const selectedValues = parseFormInputValues(field.defaultValue);
            const selectedSet = new Set(selectedValues);
            control = (
              <div
                data-testid={`editor-form-schema-field-${field.key}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '8px 10px',
                  border: fieldControlStyle.border,
                  borderRadius: fieldControlStyle.borderRadius,
                  backgroundColor: fieldControlStyle.backgroundColor,
                }}
              >
                {choices.map((option, optionIndex) => (
                  <label
                    key={`${field.key}-${option}-${optionIndex}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: p.fontSize ?? 14 }}
                  >
                    <input
                      type={choiceType}
                      name={field.key}
                      value={option}
                      required={choiceType === 'checkbox' ? optionIndex === 0 && field.required : field.required}
                      disabled={disabled}
                      defaultChecked={choiceType === 'radio' ? selectedValues[0] === option : selectedSet.has(option)}
                      style={{ pointerEvents: isPreview ? 'auto' : 'none' }}
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
                defaultValue={field.type === 'file' ? undefined : field.defaultValue}
                required={field.required}
                disabled={disabled}
                minLength={minLength}
                maxLength={maxLength}
                min={min === undefined ? undefined : String(min)}
                max={max === undefined ? undefined : String(max)}
                pattern={typeof pattern === 'string' ? pattern : undefined}
                data-testid={`editor-form-schema-field-${field.key}`}
                style={fieldControlStyle}
              />
            );
          }

          return (
            <div
              key={`${field.key}-${fieldIndex}`}
              data-testid="editor-form-schema-field"
              data-field-key={field.key}
              data-field-type={field.type}
              style={fieldWrapperStyle}
            >
              {labelNode}
              {control}
              {helpNode}
            </div>
          );
        };

        return (
          <div
            onDragOver={(e) => {
              if (!isPreview && onDrop && canReceiveNestedDrop) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              if (!isPreview && onDrop && canReceiveNestedDrop) {
                onDrop(e, element.id);
              }
            }}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
              border: sharedStyle.border ?? `1px solid ${p.borderColor ?? '#e5e7eb'}`,
              position: 'relative',
              padding: sharedStyle.padding ?? 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{
              ...sharedStyle,
              fontSize: p.fontSize || 14,
              fontWeight: p.fontWeight || 500,
            }}>
              {formTitle}
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              fontSize: 11,
              color: sharedStyle.color ?? '#374151',
            }}>
              {formBadges.map((badge) => (
                <span
                  key={badge}
                  style={{
                    border: `1px solid ${p.borderColor ?? '#d1d5db'}`,
                    borderRadius: 999,
                    padding: '2px 7px',
                    background: badge === 'Paused' ? '#fef2f2' : '#f9fafb',
                    color: badge === 'Paused' ? '#991b1b' : 'inherit',
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
            <div style={{ ...sharedStyle, fontSize: 12, color: sharedStyle.color ?? '#6b7280' }}>
              Drag form elements here (inputs, buttons)
            </div>
            <form
              id={formId}
              action={actionUrl || undefined}
              method={method}
              data-testid="editor-form-schema"
              data-form-id={formId}
              data-form-active={formActive ? 'true' : 'false'}
              data-form-field-count={schemaFields.length}
              onSubmit={(event) => event.preventDefault()}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: toCssLength(p.gap ?? 12),
                minHeight: 0,
                flex: 1,
              }}
            >
              {enableHoneypot ? (
                <input
                  type="text"
                  name="honeypot"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-testid="editor-form-schema-honeypot"
                  style={{ display: 'none' }}
                  disabled={!isPreview}
                />
              ) : null}
              {enableCaptcha ? (
                <>
                  <div
                    data-testid="editor-form-captcha-widget"
                    data-backy-captcha-widget=""
                    data-backy-captcha-provider={captchaProvider}
                    data-sitekey={captchaSiteKey || undefined}
                    style={{
                      minHeight: 58,
                      border: `1px dashed ${p.fieldBorderColor ?? '#cbd5e1'}`,
                      borderRadius: toCssLength(p.fieldBorderRadius ?? 6),
                      background: '#f8fafc',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 12px',
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  >
                    <span>Captcha challenge</span>
                    <span style={{ fontFamily: 'monospace' }}>{captchaProvider}</span>
                  </div>
                  <input
                    type="hidden"
                    name="captchaToken"
                    data-testid="editor-form-schema-captcha-token"
                    value=""
                    readOnly
                  />
                </>
              ) : null}
              {schemaFields.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr)',
                    gap: 12,
                  }}
                >
                  {schemaFields.map(renderSchemaField)}
                  <button
                    type="submit"
                    data-testid="editor-form-schema-submit"
                    disabled={!isPreview || !formActive}
                    style={{
                      width: 'fit-content',
                      minHeight: 40,
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: toCssLength(p.submitBorderRadius ?? p.borderRadius ?? 8),
                      backgroundColor: p.submitBackgroundColor ?? '#111827',
                      color: p.submitColor ?? '#ffffff',
                      fontSize: p.fontSize ?? 14,
                      fontWeight: 600,
                      cursor: isPreview && formActive ? 'pointer' : 'default',
                      pointerEvents: isPreview ? 'auto' : 'none',
                    }}
                  >
                    {submitLabel}
                  </button>
                </div>
              ) : null}
              <div style={{ width: '100%', minHeight: 0, flex: 1, position: 'relative' }}>
                {renderChildren()}
              </div>
            </form>

            {schemaFields.length === 0 && childElements.length === 0 && !isPreview ? (
              <div style={{
                flex: 1,
                border: sharedStyle.border ?? '2px dashed #d1d5db',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: 12
              }}>
                Drop Zone
              </div>
            ) : null}
          </div>
        );
      }

      case 'comment': {
        const commentRequireName = parseBooleanSetting(p.commentRequireName, true);
        const commentRequireEmail = parseBooleanSetting(p.commentRequireEmail, false);
        const commentAllowGuests = parseBooleanSetting(p.commentAllowGuests, true);
        const commentAllowReplies = parseBooleanSetting(p.commentAllowReplies, true);
        const commentModerationMode = getCommentModeLabel(p.commentModerationMode);
        const commentSortOrder = String(p.commentSortOrder || 'newest').toLowerCase() === 'oldest'
          ? 'Oldest first'
          : 'Newest first';
        const guestCommentingEnabled = commentAllowGuests;

        return (
          <div
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#ffffff',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
              border: sharedStyle.border ?? `1px dashed ${p.borderColor ?? '#d1d5db'}`,
              padding: sharedStyle.padding ?? 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              overflow: 'auto',
            }}
          >
            <h4 style={{
              margin: 0,
              color: getCommentModeColor(commentModerationMode),
              fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
              fontSize: p.fontSize || 18,
              fontWeight: p.fontWeight || 600,
            }}>
              {p.commentTitle || 'Comments'}
            </h4>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              color: '#6b7280',
              fontSize: 12,
            }}>
              <span>
                Moderation: {commentModerationMode}
              </span>
              <span>•</span>
              <span>Replies: {commentAllowReplies ? 'on' : 'off'}</span>
              <span>•</span>
              <span>Guests: {commentAllowGuests ? 'on' : 'off'}</span>
              <span>•</span>
              <span>Name required: {commentRequireName ? 'on' : 'off'}</span>
              <span>•</span>
              <span>Email required: {commentRequireEmail ? 'on' : 'off'}</span>
              <span>•</span>
              <span>Sort: {commentSortOrder}</span>
            </div>

            {!guestCommentingEnabled ? (
              <p style={{
                margin: 0,
                border: '1px dashed #fde68a',
                borderRadius: 6,
                background: '#fffbeb',
                color: '#92400e',
                padding: '8px 10px',
                fontSize: 12,
              }}>
                Guest posting is disabled. Enable Allow guests in this comment block to test public submissions.
              </p>
            ) : null}

            <form
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
              onSubmit={(event) => event.preventDefault()}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#374151' }}>
                  {commentRequireName ? 'Name *' : 'Name'}
                </label>
                <input
                  type="text"
                  placeholder={commentRequireName ? 'Your name' : 'Your name (optional)'}
                  readOnly
                  disabled={!guestCommentingEnabled}
                  style={{
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    padding: '8px 10px',
                    fontSize: 13,
                    background: guestCommentingEnabled ? '#ffffff' : '#f9fafb',
                    color: '#111827',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#374151' }}>
                  {commentRequireEmail ? 'Email *' : 'Email'}
                </label>
                <input
                  type="email"
                  placeholder={commentRequireEmail ? 'name@example.com' : 'name@example.com (optional)'}
                  readOnly
                  disabled={!guestCommentingEnabled}
                  style={{
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    padding: '8px 10px',
                    fontSize: 13,
                    background: guestCommentingEnabled ? '#ffffff' : '#f9fafb',
                    color: '#111827',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#374151' }}>Website</label>
                <input
                  type="text"
                  placeholder="https://your-website.com (optional)"
                  readOnly
                  disabled={!guestCommentingEnabled}
                  style={{
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    padding: '8px 10px',
                    fontSize: 13,
                    background: guestCommentingEnabled ? '#ffffff' : '#f9fafb',
                    color: '#111827',
                  }}
                />
              </div>
              <label style={{ fontSize: 12, color: '#374151' }}>
                Comment *
              </label>
              <textarea
                placeholder="Write a comment..."
                readOnly
                value=""
                rows={4}
                disabled={!guestCommentingEnabled}
                style={{
                  minHeight: 72,
                  resize: 'none',
                  width: '100%',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  padding: 8,
                  fontSize: 13,
                  background: guestCommentingEnabled ? '#ffffff' : '#f9fafb',
                  color: '#111827',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  style={{
                    alignSelf: 'flex-start',
                    border: `1px solid ${p.borderColor || '#d1d5db'}`,
                    borderRadius: 6,
                    padding: '6px 12px',
                    background: guestCommentingEnabled ? (p.backgroundColor || '#f3f4f6') : '#f3f4f6',
                    color: guestCommentingEnabled ? (p.color || '#374151') : '#9ca3af',
                    cursor: guestCommentingEnabled ? 'pointer' : 'not-allowed',
                    fontSize: 12,
                  }}
                  disabled={!guestCommentingEnabled}
                >
                  Post comment
                </button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Sort: {commentSortOrder}
                </span>
              </div>
            </form>

            <div
              style={{
                marginTop: 8,
                borderTop: '1px solid #e5e7eb',
                paddingTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Preview thread
              </p>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                color: '#1f2937',
              }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Alex</p>
                  <p style={{ margin: '4px 0', fontSize: 12 }}>
                    Great layout. Clean and very usable right away.
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>2h ago</p>
                  <button
                    type="button"
                    style={{ marginTop: 6, fontSize: 11, border: 'none', color: '#2563eb', background: 'transparent' }}
                    disabled={!commentAllowReplies}
                  >
                    Reply
                  </button>
                </div>

                {commentAllowReplies ? (
                  <div style={{
                    marginLeft: 16,
                    paddingLeft: 12,
                    borderLeft: '2px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Taylor</p>
                    <p style={{ margin: '4px 0', fontSize: 12 }}>
                      Thanks! I agree, this feels like a real CMS comment thread.
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>1h ago</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      }

      case 'paragraph':
      return (
        <div
          style={{ ...sharedStyle, width: '100%', height: '100%' }}
          onDoubleClick={() => onDoubleClick()}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation();
          }}
        >
            <RichTextBlock
              key={`paragraph-${element.id}`}
              elementId={element.id}
              content={p.content}
              onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditingEnabled}
              className="w-full h-full"
              defaultType="p"
              style={{
                ...sharedStyle,
                fontFamily: p.fontFamily || sharedStyle.fontFamily || 'inherit',
                fontSize: p.fontSize ?? sharedStyle.fontSize ?? 16,
                fontWeight: p.fontWeight ?? sharedStyle.fontWeight ?? 'normal',
                color: p.color ?? sharedStyle.color ?? '#374151',
                lineHeight: p.lineHeight ?? sharedStyle.lineHeight ?? 1.6,
                textAlign: p.textAlign || sharedStyle.textAlign || 'left',
              }}
              placeholder="Paragraph..."
            />
          </div>
        );

      case 'icon':
        return (
          <div
            title={typeof p.title === 'string' ? p.title : undefined}
            role={typeof p.ariaLabel === 'string' && p.ariaLabel.trim() ? 'img' : undefined}
            aria-label={typeof p.ariaLabel === 'string' && p.ariaLabel.trim() ? p.ariaLabel : undefined}
            aria-hidden={typeof p.ariaLabel === 'string' && p.ariaLabel.trim() ? undefined : true}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: p.size ?? 24,
              color: p.color ?? sharedStyle.color ?? '#374151',
            }}
          >
            {p.icon ?? '★'}
          </div>
        );

      case 'columns':
        const columnCount = p.columns ?? 2;
        const safeColumnCount = Math.max(1, Math.floor(Number(columnCount) || 1));
        return (
          <div
            {...containerDropHandlers}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: `repeat(${safeColumnCount}, 1fr)`,
              gap: toCssLength(p.gap ?? 16),
            }}
          >
            {Array.from({ length: safeColumnCount }).map((_, i) => (
              <div
                key={i}
                style={{
                  ...sharedStyle,
                  backgroundColor: isPreview ? 'transparent' : 'rgba(0,0,0,0.02)',
                  border: isPreview ? 'none' : '1px dashed #d1d5db',
                  borderRadius: 4,
                  minHeight: 50,
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                }}
              />
            ))}
            {renderChildren()}
          </div>
        );

      case 'repeater': {
        const repeaterColumns = Math.max(1, Math.min(6, Math.floor(Number(p.columns) || 3)));
        const repeaterLimit = Math.max(1, Math.min(12, Math.floor(Number(p.limit) || repeaterColumns * 2)));
        const previewCards = Array.from({ length: Math.min(repeaterLimit, repeaterColumns * 2) });
        const collectionLabel = typeof p.collectionId === 'string' && p.collectionId
          ? `Collection: ${p.collectionId}`
          : 'Select a collection in Data';

        return (
          <div
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              display: 'grid',
              gridTemplateColumns: `repeat(${repeaterColumns}, minmax(0, 1fr))`,
              gap: toCssLength(p.gap ?? 16),
              padding: toCssLength(p.padding ?? 12),
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#f8fafc',
              border: sharedStyle.border ?? '1px dashed #94a3b8',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
              color: sharedStyle.color ?? '#334155',
              overflow: 'hidden',
              alignContent: 'start',
            }}
            data-backy-editor-repeater={element.id}
          >
            {previewCards.map((_, index) => (
              <div
                key={`${element.id}-repeater-preview-${index}`}
                style={{
                  minWidth: 0,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  background: '#ffffff',
                  padding: 12,
                  boxShadow: '0 8px 18px rgba(15,23,42,0.06)',
                }}
              >
                <div style={{ height: 10, width: '70%', borderRadius: 999, background: '#0f172a', opacity: 0.18 }} />
                <div style={{ height: 8, width: '92%', borderRadius: 999, background: '#64748b', opacity: 0.16, marginTop: 10 }} />
                <div style={{ height: 8, width: '58%', borderRadius: 999, background: '#64748b', opacity: 0.14, marginTop: 6 }} />
              </div>
            ))}
            <div
              style={{
                gridColumn: `1 / span ${repeaterColumns}`,
                fontSize: 12,
                color: '#64748b',
                paddingTop: 2,
              }}
            >
              {collectionLabel}
            </div>
          </div>
        );
      }

      case 'map':
        const mapSrc = normalizeMapUrl(getMapSource(p), p.zoom);
        if (!mapSrc) {
          return (
            <div
              style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#e5e7eb',
                borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: sharedStyle.color ?? '#6b7280',
                fontSize: 14,
              }}
            >
              🗺️ Map: {p.address ?? 'Set address in properties'}
            </div>
          );
        }
        return (
          <iframe
            title={sanitizeText(p.title) || 'Map'}
            src={mapSrc}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              border: sharedStyle.border ?? 'none',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
              pointerEvents: isPreview ? 'auto' : 'none',
            }}
            allowFullScreen={parseBooleanSetting(p.allowFullScreen, true)}
            loading={normalizeIframeLoading(p.loading)}
            referrerPolicy={normalizeIframeReferrerPolicy(p.referrerPolicy) || 'no-referrer'}
            data-backy-map-address={sanitizeText(p.address) || undefined}
            data-backy-map-marker-label={sanitizeText(p.markerLabel) || undefined}
            data-backy-map-marker-latitude={normalizeMapCoordinate(p.markerLatitude)}
            data-backy-map-marker-longitude={normalizeMapCoordinate(p.markerLongitude)}
          />
        );

      default:
        return (
          <div
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: p.backgroundColor ?? sharedStyle.backgroundColor ?? '#fef2f2',
              border: sharedStyle.border ?? '1px solid #fecaca',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 4),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626',
              fontSize: 12,
            }}
          >
            Unknown: {element.type}
          </div>
        );
    }
  };

  const isTextElement = isTextEditableElement(normalizeCanvasElementType(element.type) as CanvasElement['type']);
  const isBeingMoved = draggingId === element.id;
  const shouldShowTransformControls = isSelected && (
    selectedIds.length <= 1 || element.id === selectedId
  );
  const editorZIndex = !isPreview && !disabled && isSelected
    ? element.id === selectedId
      ? ACTIVE_SELECTED_LAYER_EDIT_Z_INDEX
      : SELECTED_LAYER_EDIT_Z_INDEX
    : element.zIndex || 1;

  return (
      <div
      className={cn(
        'absolute touch-none',
        !isPreview && !disabled && !isEditing && 'cursor-move select-none',
        !isPreview && !disabled && !isSelected && 'hover:ring-1 hover:ring-sky-300 hover:ring-offset-1 hover:ring-offset-white',
        isSelected && !isPreview && !disabled && 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white',
        isBeingMoved && !isPreview && 'opacity-95 shadow-[0_16px_40px_rgba(14,165,233,0.22)]',
        isHidden && !isPreview && 'opacity-25',
        (isLocked || disabled) && !isPreview && 'cursor-default'
      )}
      data-element-id={element.id}
      data-selected-ids={isSelected ? selectedIds.join(',') : undefined}
      data-backy-text-editor={isTextElement ? 'true' : undefined}
      data-backy-text-editor-editable={String(isTextElement && isEditingEnabled)}
      style={{
        ...sharedStyle,
        boxSizing: 'border-box',
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: editorZIndex,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        opacity: isHidden && !isPreview ? 0.25 : sharedStyle.opacity ?? 1,
        pointerEvents: isHidden && !isSelected ? 'none' : undefined,
        userSelect: !isPreview && !isEditingEnabled ? 'none' : sharedStyle.userSelect,
      }}
      onPointerDownCapture={(event) => {
        if (isEditing && isTextElement) {
          return;
        }
        onDragStart(event, element.id);
      }}
      onMouseDownCapture={(event) => {
        if (isEditing && isTextElement) {
          return;
        }
        onDragStart(event, element.id);
      }}
      onClick={onClick}
      onDoubleClick={() => onDoubleClick()}
    >
      {renderContent()}

      {/* Resize Handles (only when selected and not in preview) */}
      {shouldShowTransformControls && !isPreview && !disabled && (
        <>
          <div
            className="pointer-events-auto absolute -top-8 left-0 z-[90] flex cursor-move touch-none select-none items-center gap-2 rounded bg-sky-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm"
            data-role="canvas-move-handle"
            title="Drag selected element"
            onPointerDown={(event) => onDragStart(event, element.id)}
            onMouseDown={(event) => onDragStart(event, element.id)}
          >
            <span className="grid h-3 w-2 grid-cols-2 gap-[2px]" aria-hidden="true">
              <span className="rounded-full bg-white/80" />
              <span className="rounded-full bg-white/80" />
              <span className="rounded-full bg-white/80" />
              <span className="rounded-full bg-white/80" />
            </span>
            <span className="uppercase tracking-wide">{normalizeCanvasElementType(element.type)}</span>
            {isLocked && <span className="rounded bg-white/20 px-1 uppercase">locked</span>}
            {isHidden && <span className="rounded bg-white/20 px-1 uppercase">hidden</span>}
            <span className="h-3 w-px bg-white/40" />
            <span>{element.x}, {element.y}</span>
          </div>
          {!isLocked && (
            <>
              <ResizeHandle position="nw" onResizeStart={(e) => onResizeStart(e, element.id, 'nw')} />
              <ResizeHandle position="n" onResizeStart={(e) => onResizeStart(e, element.id, 'n')} />
              <ResizeHandle position="ne" onResizeStart={(e) => onResizeStart(e, element.id, 'ne')} />
              <ResizeHandle position="e" onResizeStart={(e) => onResizeStart(e, element.id, 'e')} />
              <ResizeHandle position="w" onResizeStart={(e) => onResizeStart(e, element.id, 'w')} />
              <ResizeHandle position="sw" onResizeStart={(e) => onResizeStart(e, element.id, 'sw')} />
              <ResizeHandle position="s" onResizeStart={(e) => onResizeStart(e, element.id, 's')} />
              <ResizeHandle position="se" onResizeStart={(e) => onResizeStart(e, element.id, 'se')} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// RESIZE HANDLE COMPONENT
// ============================================

interface ResizeHandleProps {
  position: ResizeHandlePosition;
  onResizeStart: (e: React.MouseEvent | React.PointerEvent) => void;
}

function ResizeHandle({ position, onResizeStart }: ResizeHandleProps) {
  const positionStyles: Record<string, React.CSSProperties> = {
    nw: { top: -4, left: -4, cursor: 'nw-resize' },
    n: { top: -4, left: '50%', marginLeft: -16, cursor: 'n-resize' },
    ne: { top: -4, right: -4, cursor: 'ne-resize' },
    e: { top: '50%', right: -4, marginTop: -16, cursor: 'e-resize' },
    w: { top: '50%', left: -4, marginTop: -16, cursor: 'w-resize' },
    sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
    s: { bottom: -4, left: '50%', marginLeft: -16, cursor: 's-resize' },
    se: { bottom: -4, right: -4, cursor: 'se-resize' },
  };
  const isHorizontalEdge = position === 'n' || position === 's';
  const isVerticalEdge = position === 'e' || position === 'w';

  return (
    <div
      className={cn(
        'absolute z-[80] border border-sky-600 bg-white shadow-sm transition-transform hover:scale-110',
        isHorizontalEdge && 'h-2 w-8 rounded-full',
        isVerticalEdge && 'h-8 w-2 rounded-full',
        !isHorizontalEdge && !isVerticalEdge && 'h-3 w-3 rounded-[3px]',
      )}
      style={positionStyles[position]}
      data-role="canvas-resize-handle"
      data-resize-handle={position}
      onPointerDown={onResizeStart}
      onMouseDown={onResizeStart}
    />
  );
}

// ============================================
// SELECTION INFO COMPONENT
// ============================================

interface SelectionInfoProps {
  elements: CanvasElement[];
  selectedId: string;
}

function SelectionInfo({ elements, selectedId }: SelectionInfoProps) {
  const element = findElementById(elements, selectedId);
  if (!element) return null;

  return (
    <div className="absolute bottom-4 left-4 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="rounded bg-sky-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-sky-700">{element.type}</span>
        <span className="text-slate-500">X</span>
        <span className="font-medium text-slate-800">{element.x}</span>
        <span className="text-slate-500">Y</span>
        <span className="font-medium text-slate-800">{element.y}</span>
        <span className="h-4 w-px bg-slate-200" />
        <span className="text-slate-500">W</span>
        <span className="font-medium text-slate-800">{element.width}</span>
        <span className="text-slate-500">H</span>
        <span className="font-medium text-slate-800">{element.height}</span>
      </div>
    </div>
  );
}

export default Canvas;
