/**
 * ============================================================================
 * BACKY CMS - PAGE EDITOR
 * ============================================================================
 *
 * The full page editor with canvas, component library, and property panel.
 * This is where users build their pages with drag-and-drop.
 *
 * @module PageEditor
 * @author Backy CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalDistributeCenter,
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  CheckSquare,
  ClipboardPaste,
  Copy,
  Save,
  Eye,
  EyeOff,
  Group,
  Hand,
  Layers,
  Lock,
  Magnet,
  SlidersHorizontal,
  Scissors,
  Monitor,
  PanelLeft,
  PanelRight,
  Tablet,
  Smartphone,
  RefreshCw,
  SendToBack,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Undo,
  Redo,
  Ruler,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Ungroup,
  Unlock,
  X,
} from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import { Canvas } from '@/components/editor/Canvas';
import { ComponentLibrary } from '@/components/editor/ComponentLibrary';
import { LayersPanel } from '@/components/editor/LayersPanel';
import { PropertyPanel } from '@/components/editor/PropertyPanel';
import { PageSettingsModal, type PageSettings } from '@/components/editor/PageSettingsModal';
import { ActiveEditorProvider } from '@/components/editor/ActiveEditorContext';
import type { MediaContext } from '@/components/editor/MediaLibraryModal';
import {
  BREAKPOINT_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
  createCanvasElementFromLibraryItem,
  createCanvasElementsFromReusableContent,
} from '@/components/editor/editorCatalog';
import { buildCustomFontFaces, buildGoogleFontImportUrl, getFontFamilyOptions } from '@/components/editor/fontCatalog';
import type {
  CanvasElement,
  CanvasSize,
  ComponentLibraryItem,
  EditorBreakpoint,
  ResponsiveElementOverride,
} from '@/types/editor';
import { useStore } from '@/stores/mockStore';
import { listMedia } from '@/lib/mediaApi';
import {
  createReusableSection,
  deleteReusableSection,
  getInteractiveComponentRegistry,
  listReusableSections,
  type InteractiveComponentRegistryEntry,
  type ReusableSection,
  updateReusableSection,
} from '@/lib/adminContentApi';

const KNOWN_CANVAS_ELEMENT_TYPES: CanvasElement['type'][] = [
  'text',
  'heading',
  'paragraph',
  'image',
  'button',
  'container',
  'section',
  'header',
  'footer',
  'nav',
  'divider',
  'video',
  'icon',
  'form',
  'input',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'spacer',
  'columns',
  'map',
  'box',
  'embed',
  'html',
  'table',
  'list',
  'link',
  'quote',
  'repeater',
  'comment',
  'interactiveFigure',
  'codeComponent',
];

type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type CanvasDistribution = 'horizontal' | 'vertical';
type CanvasZOrderAction = 'front' | 'forward' | 'backward' | 'back';
type EditorSaveStatus = 'saved' | 'dirty' | 'saving' | 'autosaving' | 'error';
type EditorSaveMode = 'manual' | 'autosave';
type EditorSavePersistence = 'editor' | 'parent';
type ReusableSectionInstanceMeta = {
  mode: 'synced' | 'detached';
  sectionId: string;
  slug?: string;
  name?: string;
  sourceUpdatedAt?: string;
  rootIndex?: number;
  sourceElementId?: string;
};
type EditorHistoryEntry = {
  elements: CanvasElement[];
  selectedId: string | null;
  selectedIds: string[];
};
type CloneElementTreeOptions = {
  renameRoot?: boolean;
  siblingNames?: string[];
  usedElementIds: Set<string>;
  rootZIndex: number;
};

const getUniqueDuplicateLayerName = (name: string, siblingNames: string[]): string => {
  const rootName = name.trim();
  if (!rootName) {
    return rootName;
  }

  const stem = rootName.replace(/\s+Copy(?:\s+\d+)?$/, '');
  const usedNames = new Set(siblingNames);
  let candidate = `${stem} Copy`;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${stem} Copy ${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const normalizeCloneIdSeed = (sourceId: string): string => {
  const normalized = sourceId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'element';
};

const collectCanvasElementIds = (
  nodes: CanvasElement[],
  ids: Set<string> = new Set<string>(),
): Set<string> => {
  nodes.forEach((node) => {
    ids.add(node.id);
    if (node.children?.length) {
      collectCanvasElementIds(node.children, ids);
    }
  });

  return ids;
};

const getNextDeterministicCloneId = (sourceId: string, usedElementIds: Set<string>): string => {
  const base = `${normalizeCloneIdSeed(sourceId)}-copy`;
  let candidate = base;
  let suffix = 2;

  while (usedElementIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedElementIds.add(candidate);
  return candidate;
};

const RULER_SIZE = 28;
const RULER_MAJOR_STEP = 100;
const RULER_MINOR_STEP = 50;
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const MIN_CANVAS_DIMENSION = 320;
const MAX_CANVAS_DIMENSION = 3840;
const EDITOR_SHORTCUT_BLOCK_SELECTOR = [
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[data-editor-shortcuts="disabled"]',
].join(', ');

const shouldIgnoreEditorShortcut = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  ) {
    return true;
  }

  return target.isContentEditable || Boolean(target.closest(EDITOR_SHORTCUT_BLOCK_SELECTOR));
};

const formatSavedTime = (value: Date | null) => {
  if (!value) {
    return 'Not saved this session';
  }

  return value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatAutosaveTime = (value: Date | null) => (
  value
    ? value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''
);

const normalizeSiblingZIndexes = (siblings: CanvasElement[]): CanvasElement[] => (
  siblings.map((element, index) => ({
    ...element,
    zIndex: index + 1,
  }))
);

const haveSameLayerOrder = (left: CanvasElement[], right: CanvasElement[]): boolean => (
  left.length === right.length && left.every((element, index) => element.id === right[index]?.id)
);

const reorderSelectedSiblingStack = (
  siblings: CanvasElement[],
  selectedLayerIds: Set<string>,
  action: CanvasZOrderAction,
): { siblings: CanvasElement[]; moved: boolean } => {
  if (selectedLayerIds.size === 0 || siblings.length < 2) {
    return { siblings, moved: false };
  }

  let next = [...siblings];
  if (action === 'front') {
    next = [
      ...siblings.filter((element) => !selectedLayerIds.has(element.id)),
      ...siblings.filter((element) => selectedLayerIds.has(element.id)),
    ];
  } else if (action === 'back') {
    next = [
      ...siblings.filter((element) => selectedLayerIds.has(element.id)),
      ...siblings.filter((element) => !selectedLayerIds.has(element.id)),
    ];
  } else if (action === 'forward') {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selectedLayerIds.has(next[index].id) && !selectedLayerIds.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (selectedLayerIds.has(next[index].id) && !selectedLayerIds.has(next[index - 1].id)) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      }
    }
  }

  if (haveSameLayerOrder(next, siblings)) {
    return { siblings, moved: false };
  }

  return {
    siblings: normalizeSiblingZIndexes(next),
    moved: true,
  };
};

const formatChangeCount = (count: number) => `${count} unsaved ${count === 1 ? 'change' : 'changes'}`;

const normalizeEditorGridSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 10;
  }

  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(value)));
};

const EDITOR_AUTOSAVE_DELAY_MS = 5000;
const EDITOR_RESPONSIVE_BREAKPOINTS = ['tablet', 'mobile'] as const satisfies readonly EditorBreakpoint[];
const RESPONSIVE_GEOMETRY_FIELDS = ['x', 'y', 'width', 'height', 'zIndex', 'rotation'] as const;
const RESPONSIVE_LAYER_STATE_FIELDS = ['visible', 'locked'] as const;
const RESPONSIVE_LAYOUT_FIELDS = [...RESPONSIVE_GEOMETRY_FIELDS, ...RESPONSIVE_LAYER_STATE_FIELDS] as const;
type BreakpointOverrideGroup = 'layout' | 'layer' | 'content' | 'style';

const BREAKPOINT_OVERRIDE_GROUPS: Array<{
  id: BreakpointOverrideGroup;
  label: string;
  description: string;
}> = [
  { id: 'layout', label: 'Layout', description: 'Position and size' },
  { id: 'layer', label: 'Layer', description: 'Visibility and lock' },
  { id: 'content', label: 'Content', description: 'Element props' },
  { id: 'style', label: 'Style', description: 'Visual styling' },
];

const isResponsiveLayoutField = (key: string): key is typeof RESPONSIVE_LAYOUT_FIELDS[number] => (
  (RESPONSIVE_LAYOUT_FIELDS as readonly string[]).includes(key)
);

const normalizeResponsiveFieldValue = (
  key: typeof RESPONSIVE_LAYOUT_FIELDS[number],
  value: unknown,
) => {
  if (key === 'visible') {
    return value === false ? false : true;
  }

  if (key === 'locked') {
    return value === true;
  }

  return value;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const INTERACTIVE_ELEMENT_TYPES = new Set<CanvasElement['type']>(['interactiveFigure', 'codeComponent']);

const getNonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const hasInteractiveFallback = (props: Record<string, unknown>): boolean => {
  if (getNonEmptyString(props.fallbackText)) {
    return true;
  }

  const fallback = props.fallback;
  if (getNonEmptyString(fallback)) {
    return true;
  }

  if (!isPlainRecord(fallback)) {
    return false;
  }

  return Boolean(
    getNonEmptyString(fallback.title) ||
    getNonEmptyString(fallback.text) ||
    getNonEmptyString(fallback.html) ||
    getNonEmptyString(fallback.imageUrl) ||
    getNonEmptyString(fallback.src),
  );
};

const getInteractiveHydrationMode = (props: Record<string, unknown>): string | null => {
  const renderCapabilities = isPlainRecord(props.renderCapabilities) ? props.renderCapabilities : null;
  return getNonEmptyString(renderCapabilities?.hydrationMode) || getNonEmptyString(props.hydrationMode);
};

const getInteractiveSandboxUrl = (props: Record<string, unknown>): string | null => (
  getNonEmptyString(props.sandboxUrl) ||
  getNonEmptyString(props.iframeUrl) ||
  getNonEmptyString(props.url) ||
  getNonEmptyString(props.src)
);

const decodeSandboxPathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isPublishSafeSandboxUrl = (value: string, componentKey: string | null, version: string | null): boolean => {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed || lower.startsWith('//')) {
    return false;
  }

  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:')
  ) {
    return false;
  }

  const match = trimmed.match(/^\/api\/sites\/[^/?#]+\/interactive-components\/([^/?#]+)\/([^/?#]+)\/sandbox(?:[?#].*)?$/);
  if (!match) {
    return false;
  }

  const [, routeComponentKey, routeVersion] = match.map(decodeSandboxPathSegment);
  return (!componentKey || routeComponentKey === componentKey) && (!version || routeVersion === version);
};

export const collectInteractiveReadinessIssues = (elements: CanvasElement[]): string[] => {
  const issues: string[] = [];

  const walk = (items: CanvasElement[]) => {
    items.forEach((element) => {
      if (INTERACTIVE_ELEMENT_TYPES.has(element.type)) {
        const label = element.name || element.id || element.type;
        const props = isPlainRecord(element.props) ? element.props : {};
        const componentKey = getNonEmptyString(props.componentKey);
        const version = getNonEmptyString(props.version);
        const hydrationMode = getInteractiveHydrationMode(props);

        if (!componentKey) {
          issues.push(`${label}: choose a registry component key.`);
        }

        if (!version) {
          issues.push(`${label}: pin the interactive component version before publishing.`);
        }

        if (!hydrationMode) {
          issues.push(`${label}: choose a hydration mode.`);
        }

        if (!hasInteractiveFallback(props)) {
          issues.push(`${label}: add crawlable fallback text, HTML, or an image.`);
        }

        if (element.type === 'codeComponent') {
          const sandboxUrl = getInteractiveSandboxUrl(props);
          if (!sandboxUrl) {
            issues.push(`${label}: choose a sandbox runtime URL from the component registry.`);
          } else if (!isPublishSafeSandboxUrl(sandboxUrl, componentKey, version)) {
            issues.push(`${label}: use the Backy /api/sites/:siteId/interactive-components/:componentKey/:version/sandbox URL that matches this component key and version.`);
          }
        }
      }

      if (element.children?.length) {
        walk(element.children);
      }
    });
  };

  walk(elements);
  return issues;
};

const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const stableComparableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableComparableValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const nextValue = stableComparableValue(value[key]);
      if (nextValue !== undefined) {
        acc[key] = nextValue;
      }
      return acc;
    }, {});
};

const normalizeRichTextContentForHistory = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeRichTextContentForHistory);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .filter((key) => key !== 'id')
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const nextValue = normalizeRichTextContentForHistory(value[key]);
      if (nextValue !== undefined) {
        acc[key] = nextValue;
      }
      return acc;
    }, {});
};

const normalizeHistoryProps = (props: Record<string, unknown>): Record<string, unknown> => (
  Object.keys(props)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      if (key === 'content') {
        acc[key] = normalizeRichTextContentForHistory(props[key]);
        return acc;
      }

      const value = stableComparableValue(props[key]);
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {})
);

const normalizeHistoryElement = (element: CanvasElement): Record<string, unknown> => {
  const next: Record<string, unknown> = {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
  };

  if (element.rotation !== undefined) next.rotation = element.rotation;
  if (element.visible === false) next.visible = false;
  if (element.locked === true) next.locked = true;
  if (element.parentId) next.parentId = element.parentId;

  const props = normalizeHistoryProps(element.props || {});
  if (Object.keys(props).length > 0) {
    next.props = props;
  }

  const styles = stableComparableValue(element.styles || {});
  if (isPlainRecord(styles) && Object.keys(styles).length > 0) {
    next.styles = styles;
  }

  const responsive = stableComparableValue(element.responsive || {});
  if (isPlainRecord(responsive) && Object.keys(responsive).length > 0) {
    next.responsive = responsive;
  }

  if (element.animation !== undefined && element.animation !== null) {
    next.animation = stableComparableValue(element.animation);
  }

  if (element.dataBindings?.length) {
    next.dataBindings = stableComparableValue(element.dataBindings);
  }

  if (element.bindingSlots?.length) {
    next.bindingSlots = stableComparableValue(element.bindingSlots);
  }

  if (element.children?.length) {
    next.children = element.children.map(normalizeHistoryElement);
  }

  return next;
};

const historyElementsEqual = (a: CanvasElement[], b: CanvasElement[]) => (
  jsonEqual(a.map(normalizeHistoryElement), b.map(normalizeHistoryElement))
);

const getReusableSectionInstanceMeta = (value: unknown): ReusableSectionInstanceMeta | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const sectionId = typeof value.sectionId === 'string' ? value.sectionId : '';
  if (!sectionId) {
    return null;
  }

  return {
    mode: value.mode === 'detached' ? 'detached' : 'synced',
    sectionId,
    slug: typeof value.slug === 'string' ? value.slug : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    sourceUpdatedAt: typeof value.sourceUpdatedAt === 'string' ? value.sourceUpdatedAt : undefined,
    rootIndex: typeof value.rootIndex === 'number' && Number.isInteger(value.rootIndex) && value.rootIndex >= 0
      ? value.rootIndex
      : undefined,
    sourceElementId: typeof value.sourceElementId === 'string' ? value.sourceElementId : undefined,
  };
};

const hasResponsiveOverrideGroup = (
  override: ResponsiveElementOverride | undefined,
  group: BreakpointOverrideGroup,
  baseElement?: CanvasElement | null,
) => {
  if (!override) {
    return false;
  }

  if (group === 'layout') {
    return RESPONSIVE_GEOMETRY_FIELDS.some((key) => (
      override[key] !== undefined
      && (!baseElement || override[key] !== baseElement[key])
    ));
  }

  if (group === 'layer') {
    return RESPONSIVE_LAYER_STATE_FIELDS.some((key) => (
      override[key] !== undefined
      && (
        !baseElement
        || normalizeResponsiveFieldValue(key, override[key]) !== normalizeResponsiveFieldValue(key, baseElement[key])
      )
    ));
  }

  if (group === 'content') {
    return Boolean(
      override.props &&
      Object.keys(override.props).length > 0 &&
      (!baseElement || !jsonEqual(override.props, baseElement.props)),
    );
  }

  return Boolean(
    override.styles &&
    Object.keys(override.styles).length > 0 &&
    (!baseElement || !jsonEqual(override.styles, baseElement.styles || {})),
  );
};

const getResponsiveOverrideGroups = (
  override: ResponsiveElementOverride | undefined,
  baseElement?: CanvasElement | null,
): BreakpointOverrideGroup[] => (
  BREAKPOINT_OVERRIDE_GROUPS
    .filter((group) => hasResponsiveOverrideGroup(override, group.id, baseElement))
    .map((group) => group.id)
);

const clearResponsiveOverrideGroup = (
  override: ResponsiveElementOverride,
  group: BreakpointOverrideGroup,
): ResponsiveElementOverride => {
  const nextOverride: ResponsiveElementOverride = { ...override };

  if (group === 'layout') {
    RESPONSIVE_GEOMETRY_FIELDS.forEach((key) => {
      delete (nextOverride as Record<string, unknown>)[key];
    });
  } else if (group === 'layer') {
    RESPONSIVE_LAYER_STATE_FIELDS.forEach((key) => {
      delete (nextOverride as Record<string, unknown>)[key];
    });
  } else if (group === 'content') {
    delete nextOverride.props;
  } else {
    delete nextOverride.styles;
  }

  return nextOverride;
};

const pruneResponsiveOverrides = (
  responsive: CanvasElement['responsive'] | undefined,
): CanvasElement['responsive'] | undefined => {
  if (!responsive) {
    return undefined;
  }

  const pruned = (Object.entries(responsive) as Array<[EditorBreakpoint, ResponsiveElementOverride]>)
    .reduce<Partial<Record<EditorBreakpoint, ResponsiveElementOverride>>>((acc, [breakpoint, override]) => {
      if (!override || Object.keys(override).length === 0) {
        return acc;
      }

      acc[breakpoint] = override;
      return acc;
    }, {});

  return pruned && Object.keys(pruned).length > 0 ? pruned : undefined;
};

const setResponsiveOverride = (
  element: CanvasElement,
  breakpoint: EditorBreakpoint,
  override: ResponsiveElementOverride,
): CanvasElement => {
  const responsive = {
    ...(element.responsive || {}),
    [breakpoint]: override,
  };
  const nextResponsive = pruneResponsiveOverrides(responsive);
  const nextElement: CanvasElement = {
    ...element,
    responsive: nextResponsive,
  };

  if (!nextResponsive) {
    delete nextElement.responsive;
  }

  return nextElement;
};

const applyResponsiveOverrideToElement = (
  element: CanvasElement,
  breakpoint: EditorBreakpoint,
): CanvasElement => {
  const children = element.children?.map((child) => applyResponsiveOverrideToElement(child, breakpoint));

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

const applyResponsiveOverridesToElements = (
  elements: CanvasElement[],
  breakpoint: EditorBreakpoint,
): CanvasElement[] => elements.map((element) => applyResponsiveOverrideToElement(element, breakpoint));

const mapElementsById = (elements: CanvasElement[], map = new Map<string, CanvasElement>()) => {
  elements.forEach((element) => {
    map.set(element.id, element);
    if (element.children?.length) {
      mapElementsById(element.children, map);
    }
  });
  return map;
};

const mergeDisplayedElementsIntoBreakpoint = (
  baseElements: CanvasElement[],
  displayedElements: CanvasElement[],
  breakpoint: EditorBreakpoint,
): CanvasElement[] => {
  if (breakpoint === 'desktop') {
    return displayedElements;
  }

  const baseById = mapElementsById(baseElements);

  const mergeNode = (displayed: CanvasElement): CanvasElement => {
    const base = baseById.get(displayed.id);
    if (!base) {
      return displayed;
    }

    const nextOverride: ResponsiveElementOverride = { ...(base.responsive?.[breakpoint] || {}) };

    RESPONSIVE_LAYOUT_FIELDS.forEach((key) => {
      if (normalizeResponsiveFieldValue(key, displayed[key]) !== normalizeResponsiveFieldValue(key, base[key])) {
        (nextOverride as Record<string, unknown>)[key] = displayed[key];
      } else {
        delete (nextOverride as Record<string, unknown>)[key];
      }
    });

    if (!jsonEqual(displayed.props, base.props)) {
      nextOverride.props = displayed.props;
    } else {
      delete nextOverride.props;
    }

    if (!jsonEqual(displayed.styles || {}, base.styles || {})) {
      nextOverride.styles = displayed.styles;
    } else {
      delete nextOverride.styles;
    }

    const nextChildren = displayed.children?.map(mergeNode);
    return setResponsiveOverride(
      {
        ...base,
        ...(nextChildren ? { children: nextChildren } : { children: undefined }),
      },
      breakpoint,
      nextOverride,
    );
  };

  return displayedElements.map(mergeNode);
};

const applyUpdatesForBreakpoint = (
  element: CanvasElement,
  updates: { [key: string]: unknown },
  breakpoint: EditorBreakpoint,
): CanvasElement => {
  if (breakpoint === 'desktop') {
    return {
      ...element,
      ...updates,
    };
  }

  const baseUpdates: { [key: string]: unknown } = {};
  const override: ResponsiveElementOverride = { ...(element.responsive?.[breakpoint] || {}) };

  Object.entries(updates).forEach(([key, value]) => {
    if (isResponsiveLayoutField(key)) {
      if (normalizeResponsiveFieldValue(key, value) === normalizeResponsiveFieldValue(key, element[key])) {
        delete (override as Record<string, unknown>)[key];
      } else {
        (override as Record<string, unknown>)[key] = value;
      }
      return;
    }

    if (key === 'props' && isPlainRecord(value)) {
      override.props = value;
      return;
    }

    if (key === 'styles' && isPlainRecord(value)) {
      override.styles = value as ResponsiveElementOverride['styles'];
      return;
    }

    baseUpdates[key] = value;
  });

  return setResponsiveOverride(
    {
      ...element,
      ...baseUpdates,
    },
    breakpoint,
    override,
  );
};

const finiteNumberOrFallback = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const normalizeDistributedPosition = (value: number): number => (
  Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
);

const responsiveGeometryForElement = (
  element: CanvasElement,
  breakpoint: Exclude<EditorBreakpoint, 'desktop'>,
) => {
  const override = element.responsive?.[breakpoint];

  return {
    x: finiteNumberOrFallback(override?.x, element.x),
    y: finiteNumberOrFallback(override?.y, element.y),
    width: Math.max(1, finiteNumberOrFallback(override?.width, element.width)),
    height: Math.max(1, finiteNumberOrFallback(override?.height, element.height)),
    zIndex: finiteNumberOrFallback(override?.zIndex, element.zIndex || 1),
  };
};

const buildResponsiveGroupChildren = (
  selectedSiblings: CanvasElement[],
  groupId: string,
  groupBase: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height' | 'zIndex'>,
): {
  children: CanvasElement[];
  responsive?: CanvasElement['responsive'];
} => {
  const breakpointBounds = EDITOR_RESPONSIVE_BREAKPOINTS.reduce<Partial<Record<Exclude<EditorBreakpoint, 'desktop'>, {
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    hasGroupGeometryOverride: boolean;
    hasAnyChildGeometryOverride: boolean;
  }>>>((acc, breakpoint) => {
    const hasAnyChildGeometryOverride = selectedSiblings.some((item) => (
      hasResponsiveOverrideGroup(item.responsive?.[breakpoint], 'layout', item)
    ));
    if (!hasAnyChildGeometryOverride) {
      return acc;
    }

    const geometries = selectedSiblings.map((item) => responsiveGeometryForElement(item, breakpoint));
    const minX = Math.min(...geometries.map((item) => item.x));
    const minY = Math.min(...geometries.map((item) => item.y));
    const maxX = Math.max(...geometries.map((item) => item.x + item.width));
    const maxY = Math.max(...geometries.map((item) => item.y + item.height));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zIndex = Math.max(...geometries.map((item) => item.zIndex));

    acc[breakpoint] = {
      x: minX,
      y: minY,
      width,
      height,
      zIndex,
      hasGroupGeometryOverride:
        minX !== groupBase.x ||
        minY !== groupBase.y ||
        width !== groupBase.width ||
        height !== groupBase.height ||
        zIndex !== groupBase.zIndex,
      hasAnyChildGeometryOverride,
    };
    return acc;
  }, {});

  const groupResponsive = EDITOR_RESPONSIVE_BREAKPOINTS.reduce<CanvasElement['responsive']>((acc, breakpoint) => {
    const bounds = breakpointBounds[breakpoint];
    if (!bounds?.hasGroupGeometryOverride) {
      return acc;
    }

    const override: ResponsiveElementOverride = {};
    if (bounds.x !== groupBase.x) override.x = bounds.x;
    if (bounds.y !== groupBase.y) override.y = bounds.y;
    if (bounds.width !== groupBase.width) override.width = bounds.width;
    if (bounds.height !== groupBase.height) override.height = bounds.height;
    if (bounds.zIndex !== groupBase.zIndex) override.zIndex = bounds.zIndex;

    return setResponsiveOverride({ responsive: acc } as CanvasElement, breakpoint, override).responsive;
  }, undefined);

  return {
    children: selectedSiblings.map((item, index) => {
      const baseChild: CanvasElement = {
        ...item,
        parentId: groupId,
        x: item.x - groupBase.x,
        y: item.y - groupBase.y,
        zIndex: index + 1,
      };
      const nextResponsive = EDITOR_RESPONSIVE_BREAKPOINTS.reduce<CanvasElement['responsive']>((acc, breakpoint) => {
        const bounds = breakpointBounds[breakpoint];
        const existing = item.responsive?.[breakpoint];
        if (!bounds?.hasAnyChildGeometryOverride && !existing) {
          return acc;
        }

        const geometry = responsiveGeometryForElement(item, breakpoint);
        const override: ResponsiveElementOverride = { ...(existing || {}) };
        if (bounds?.hasGroupGeometryOverride || existing?.x !== undefined) {
          override.x = geometry.x - (bounds?.x ?? groupBase.x);
        }
        if (bounds?.hasGroupGeometryOverride || existing?.y !== undefined) {
          override.y = geometry.y - (bounds?.y ?? groupBase.y);
        }
        if (existing?.width !== undefined || geometry.width !== item.width) {
          override.width = geometry.width;
        }
        if (existing?.height !== undefined || geometry.height !== item.height) {
          override.height = geometry.height;
        }
        if (existing?.zIndex !== undefined) {
          override.zIndex = existing.zIndex;
        }
        if (existing?.rotation !== undefined) {
          override.rotation = existing.rotation;
        }

        return setResponsiveOverride({ responsive: acc } as CanvasElement, breakpoint, override).responsive;
      }, undefined);

      const nextChild: CanvasElement = {
        ...baseChild,
        responsive: pruneResponsiveOverrides(nextResponsive),
      };
      if (!nextChild.responsive) {
        delete nextChild.responsive;
      }

      return nextChild;
    }),
    responsive: pruneResponsiveOverrides(groupResponsive),
  };
};

const restoreUngroupedChildResponsive = (
  group: CanvasElement,
  child: CanvasElement,
  ungroupedChild: CanvasElement,
): CanvasElement['responsive'] | undefined => (
  EDITOR_RESPONSIVE_BREAKPOINTS.reduce<CanvasElement['responsive']>((acc, breakpoint) => {
    const groupOverride = group.responsive?.[breakpoint];
    const childOverride = child.responsive?.[breakpoint];
    if (!groupOverride && !childOverride) {
      return acc;
    }

    const groupGeometry = responsiveGeometryForElement(group, breakpoint);
    const childGeometry = responsiveGeometryForElement(child, breakpoint);
    const override: ResponsiveElementOverride = { ...(childOverride || {}) };
    const absoluteX = groupGeometry.x + childGeometry.x;
    const absoluteY = groupGeometry.y + childGeometry.y;
    const absoluteZIndex = groupGeometry.zIndex + Math.max(0, childGeometry.zIndex - 1);
    const groupHasLayoutOverride = hasResponsiveOverrideGroup(groupOverride, 'layout', group);

    if (groupHasLayoutOverride || childOverride?.x !== undefined || absoluteX !== ungroupedChild.x) {
      override.x = absoluteX;
    } else {
      delete override.x;
    }

    if (groupHasLayoutOverride || childOverride?.y !== undefined || absoluteY !== ungroupedChild.y) {
      override.y = absoluteY;
    } else {
      delete override.y;
    }

    if (childOverride?.width !== undefined || childGeometry.width !== ungroupedChild.width) {
      override.width = childGeometry.width;
    } else {
      delete override.width;
    }

    if (childOverride?.height !== undefined || childGeometry.height !== ungroupedChild.height) {
      override.height = childGeometry.height;
    } else {
      delete override.height;
    }

    if (groupOverride?.zIndex !== undefined || childOverride?.zIndex !== undefined || absoluteZIndex !== (ungroupedChild.zIndex || 1)) {
      override.zIndex = absoluteZIndex;
    } else {
      delete override.zIndex;
    }

    if (groupOverride?.visible !== undefined && childOverride?.visible === undefined) {
      override.visible = groupOverride.visible;
    }
    if (groupOverride?.locked !== undefined && childOverride?.locked === undefined) {
      override.locked = groupOverride.locked;
    }

    return setResponsiveOverride({ responsive: acc } as CanvasElement, breakpoint, override).responsive;
  }, undefined)
);

const CANVAS_SIZE_PRESETS = [
  { id: 'desktop', label: 'Desktop', width: 1200, height: 800, breakpoint: 'desktop' as const },
  { id: 'wide', label: 'Wide page', width: 1440, height: 1200 },
  { id: 'landing', label: 'Landing', width: 1440, height: 1800 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024, breakpoint: 'tablet' as const },
  { id: 'mobile', label: 'Mobile', width: 375, height: 812, breakpoint: 'mobile' as const },
  { id: 'square', label: 'Square', width: 1080, height: 1080 },
  { id: 'story', label: 'Story', width: 1080, height: 1920 },
] as const;

const clampCanvasDimension = (value: number) => (
  Math.min(MAX_CANVAS_DIMENSION, Math.max(MIN_CANVAS_DIMENSION, Math.round(value)))
);

const buildRulerTicks = (length: number, scale: number) => {
  const safeLength = Math.max(0, Math.ceil(length));
  const ticks: Array<{ value: number; position: number; major: boolean }> = [];

  for (let value = 0; value <= safeLength; value += RULER_MINOR_STEP) {
    ticks.push({
      value,
      position: Math.round(value * scale),
      major: value % RULER_MAJOR_STEP === 0,
    });
  }

  return ticks;
};

export interface CanvasEditorProps {
  initialElements: CanvasElement[];
  initialSettings: PageSettings;
  mode?: 'page' | 'blog' | 'section';
  onSave: (
    elements: CanvasElement[],
    settings: PageSettings,
    size?: CanvasSize
  ) => Promise<void> | void;
  onBack?: () => void;
  className?: string;
  hideNavigation?: boolean;
  hideSettings?: boolean;
  hideSave?: boolean;
  savePersistence?: EditorSavePersistence;
  saveOwnerLabel?: string;
  saveOwnerVersion?: string | number | null;
  initialSize?: CanvasSize;
  initialSelectedElementId?: string;
  mediaContext?: MediaContext;
  onChange?: (
    elements: CanvasElement[],
    settings: PageSettings,
    size?: CanvasSize
  ) => void;
  validateSettings?: (settings: PageSettings) => string | null;
  canView?: boolean;
  canEdit?: boolean;
  canPublish?: boolean;
  canViewMedia?: boolean;
  canCreateMedia?: boolean;
  canViewCollections?: boolean;
  canDeleteReusableSections?: boolean;
  editDisabledReason?: string;
  publishDisabled?: boolean;
  publishDisabledReason?: string;
  mediaViewDisabledReason?: string;
  mediaCreateDisabledReason?: string;
  collectionsViewDisabledReason?: string;
  reusableDeleteDisabledReason?: string;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onInteractiveReadinessIssuesChange?: (issues: string[]) => void;
}

const normalizeTypeToken = (value: string): string => {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
};

const normalizeElementType = (value: string): CanvasElement['type'] => {
  const normalized = normalizeTypeToken(value);

  if (!normalized) {
    return 'text';
  }

  if (
    normalized === 'textinput'
    || normalized === 'textinputfield'
    || normalized === 'textfield'
    || normalized === 'textinputfield'
    || normalized === 'textfields'
    || normalized === 'inputfield'
    || normalized === 'textinputfield'
    || normalized === 'textinput'
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
    normalized === 'dropdown'
    || normalized === 'select'
    || normalized === 'dropdownselector'
    || normalized === 'dropdowninputs'
    || normalized === 'dropdownselector'
  ) {
    return 'select';
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

  if (normalized.includes('dropdown')) {
    return 'select';
  }

  if (normalized.includes('select')) {
    return 'select';
  }

  if (normalized.includes('textinput') || normalized.includes('textfield')) {
    return 'input';
  }

  if (normalized.includes('checkbox')) {
    return 'checkbox';
  }

  return KNOWN_CANVAS_ELEMENT_TYPES.includes(normalized as CanvasElement['type'])
    ? (normalized as CanvasElement['type'])
    : 'text';
};

const isEditorGroupElement = (element: CanvasElement | null | undefined): boolean => (
  element?.props?.editorGroup === true
);

const collectEditorCompositionMetrics = (nodes: CanvasElement[]) => {
  const typeCounts: Record<string, number> = {};
  const metrics = {
    totalLayers: 0,
    rootLayers: nodes.length,
    groupLayers: 0,
    nestedLayers: 0,
    childContainerLayers: 0,
    responsiveOverrideLayers: 0,
    hiddenLayers: 0,
    lockedLayers: 0,
    maxDepth: 0,
    typeCounts,
  };

  const walk = (items: CanvasElement[], depth: number) => {
    metrics.maxDepth = Math.max(metrics.maxDepth, depth);
    items.forEach((item) => {
      const type = normalizeElementType(item.type);
      metrics.totalLayers += 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      if (depth > 0) metrics.nestedLayers += 1;
      if (isEditorGroupElement(item)) metrics.groupLayers += 1;
      if (item.children?.length) metrics.childContainerLayers += 1;
      if (item.responsive && Object.keys(item.responsive).length > 0) metrics.responsiveOverrideLayers += 1;
      if (item.visible === false) metrics.hiddenLayers += 1;
      if (item.locked === true) metrics.lockedLayers += 1;

      if (item.children?.length) {
        walk(item.children, depth + 1);
      }
    });
  };

  walk(nodes, 0);
  return metrics;
};

// ============================================
// COMPONENT
// ============================================

export function CanvasEditor({
  initialElements,
  initialSettings,
  mode = 'page',
  onSave,
  onBack,
  className,
  hideNavigation,
  hideSettings,
  hideSave,
  savePersistence = 'editor',
  saveOwnerLabel,
  saveOwnerVersion,
  initialSize,
  initialSelectedElementId,
  mediaContext,
  onChange,
  validateSettings,
  canView = true,
  canEdit = true,
  canPublish = true,
  canViewMedia = true,
  canCreateMedia = true,
  canViewCollections = true,
  canDeleteReusableSections = true,
  editDisabledReason = 'You do not have permission to edit this page.',
  publishDisabled = false,
  publishDisabledReason,
  mediaViewDisabledReason,
  mediaCreateDisabledReason,
  collectionsViewDisabledReason,
  reusableDeleteDisabledReason,
  onUnsavedChangesChange,
  onInteractiveReadinessIssuesChange,
}: CanvasEditorProps) {
  const media = useStore((state) => state.media);
  const setMedia = useStore((state) => state.setMedia);
  const fontOptions = useMemo(() => getFontFamilyOptions(media), [media]);
  const activeSiteId = mediaContext?.siteId;
  const [reusableSections, setReusableSections] = useState<ReusableSection[]>([]);
  const [reusableSectionsLoading, setReusableSectionsLoading] = useState(false);
  const [reusableSectionsError, setReusableSectionsError] = useState<string | null>(null);
  const [interactiveComponents, setInteractiveComponents] = useState<InteractiveComponentRegistryEntry[]>([]);
  const [interactiveComponentsLoading, setInteractiveComponentsLoading] = useState(false);
  const [interactiveComponentsError, setInteractiveComponentsError] = useState<string | null>(null);
  const [isSavingReusableSection, setIsSavingReusableSection] = useState(false);
  const [pendingDeleteReusableSection, setPendingDeleteReusableSection] = useState<ReusableSection | null>(null);
  const [reusableSectionDraft, setReusableSectionDraft] = useState<{
    mode: 'save' | 'rename';
    name: string;
    sourceElementId?: string;
    sectionId?: string;
  } | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [libraryDragItem, setLibraryDragItem] = useState<ComponentLibraryItem | null>(null);

  useEffect(() => {
    const siteId = activeSiteId;
    if (!siteId || !canViewMedia) {
      return;
    }

    let cancelled = false;

    const loadSiteMedia = async () => {
      try {
        const backendMedia = await listMedia({ siteId, scope: 'all', limit: 250 });
        if (!cancelled) {
          setMedia(backendMedia);
        }
      } catch {
        // Keep the current local media store when the backend is unavailable.
      }
    };

    void loadSiteMedia();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, canViewMedia, setMedia]);

  // Load fonts
  useEffect(() => {
    const googleFontsUrl = buildGoogleFontImportUrl(fontOptions);
    const link = document.getElementById('backy-editor-fonts') as HTMLLinkElement | null;

    if (googleFontsUrl) {
      if (!link) {
        const newLink = document.createElement('link');
        newLink.id = 'backy-editor-fonts';
        newLink.rel = 'stylesheet';
        newLink.href = googleFontsUrl;
        document.head.appendChild(newLink);
      } else if (link.href !== googleFontsUrl) {
        link.href = googleFontsUrl;
      }
    } else if (link) {
      link.remove();
    }

    const customFontStyleId = 'backy-editor-custom-fonts';
    const existingStyle = document.getElementById(customFontStyleId) as HTMLStyleElement | null;
    const styleEl = existingStyle || document.createElement('style');
    styleEl.id = customFontStyleId;
    styleEl.dataset.generatedBy = 'backy-cms';
    styleEl.textContent = buildCustomFontFaces(fontOptions);

    if (!existingStyle) {
      document.head.appendChild(styleEl);
    }
  }, [fontOptions]);

  // Canvas state
  const [elements, setElements] = useState<CanvasElement[]>(initialElements);
  const elementsRef = useRef<CanvasElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const [size, setSize] = useState<CanvasSize>(initialSize || DEFAULT_CANVAS_SIZE);
  const [breakpoint, setBreakpoint] = useState<EditorBreakpoint>('desktop');
  const [rightPanel, setRightPanel] = useState<'properties' | 'layers'>('properties');
  const [isPreview, setIsPreview] = useState(false);
  const [showComponentPanel, setShowComponentPanel] = useState(true);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);
  const [isCanvasFocusMode, setIsCanvasFocusMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSaveMode, setLastSaveMode] = useState<EditorSaveMode | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [pendingChangeCount, setPendingChangeCount] = useState(0);
  const [autosaveDueAt, setAutosaveDueAt] = useState<Date | null>(null);
  const isParentPersistence = savePersistence === 'parent';
  const normalizedSaveOwnerLabel = saveOwnerLabel || (
    mode === 'blog' ? 'post form' : mode === 'section' ? 'section editor' : 'parent form'
  );
  const editorEntityLabel = mode === 'blog' ? 'Post' : mode === 'section' ? 'Section' : 'Page';
  const saveOwnerVersionRef = useRef<string | number | null | undefined>(saveOwnerVersion);
  const isCanvasMutationDisabled = isSaving || isPreview || !canEdit;
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const changeSequenceRef = useRef(0);
  const pendingTransformRef = useRef<{
    elements: CanvasElement[];
    previousElements: CanvasElement[];
    selectedId: string | null;
    selectedIds: string[];
  } | null>(null);

  // Undo/Redo State
  const [history, setHistory] = useState<EditorHistoryEntry[]>([
    { elements: initialElements, selectedId: null, selectedIds: [] },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<EditorHistoryEntry[]>([
    { elements: initialElements, selectedId: null, selectedIds: [] },
  ]);
  const historyIndexRef = useRef(0);
  const isApplyingHistoryRef = useRef(false);
  const coalesceNextHistoryRef = useRef<{
    selectedIds: string[];
    elementCount: number;
  } | null>(null);

  useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedIdsRef.current = selectedIds;
  }, [selectedId, selectedIds]);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>(initialSettings);
  const interactiveReadinessIssues = useMemo(
    () => collectInteractiveReadinessIssues(elements),
    [elements],
  );
  const interactivePublishDisabledReason = interactiveReadinessIssues.length > 0
    ? `Resolve interactive block readiness before publishing: ${interactiveReadinessIssues[0]}`
    : null;
  const effectivePublishDisabled = publishDisabled || interactiveReadinessIssues.length > 0;
  const effectivePublishDisabledReason = publishDisabledReason || interactivePublishDisabledReason;

  // Clipboard State
  const [clipboardElements, setClipboardElements] = useState<CanvasElement[]>([]);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [isCanvasAutoFit, setIsCanvasAutoFit] = useState(true);
  const [isCanvasPanMode, setIsCanvasPanMode] = useState(false);
  const [isCanvasSpacePanning, setIsCanvasSpacePanning] = useState(false);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const safeEditorGridSize = normalizeEditorGridSize(gridSize);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasPanRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const activeCanvasScale = isPreview ? canvasScale : canvasZoom;
  const isCanvasPanActive = !isPreview && (isCanvasPanMode || isCanvasSpacePanning);
  const scaledCanvasWidth = Math.max(1, Math.round(size.width * activeCanvasScale));
  const scaledCanvasHeight = Math.max(1, Math.round(size.height * activeCanvasScale));
  const zoomPercent = Math.round(activeCanvasScale * 100);
  const horizontalRulerTicks = useMemo(
    () => buildRulerTicks(size.width, activeCanvasScale),
    [activeCanvasScale, size.width],
  );
  const verticalRulerTicks = useMemo(
    () => buildRulerTicks(size.height, activeCanvasScale),
    [activeCanvasScale, size.height],
  );
  const displayedElements = useMemo(
    () => applyResponsiveOverridesToElements(elements, breakpoint),
    [breakpoint, elements],
  );
  const saveStatusMeta = useMemo(() => {
    const pendingLabel = formatChangeCount(pendingChangeCount);

    if (isParentPersistence) {
      if (hasUnsavedChanges || saveStatus === 'dirty') {
        return {
          label: 'Unsaved',
          detail: `Use the ${normalizedSaveOwnerLabel} save action to persist ${pendingLabel}.`,
          className: 'border-amber-200 bg-amber-50 text-amber-700',
        };
      }

      return {
        label: mode === 'blog' ? 'Post save' : mode === 'section' ? 'Section save' : 'Parent save',
        detail: `Canvas persistence is handled by the ${normalizedSaveOwnerLabel}.`,
        className: 'border-slate-200 bg-slate-50 text-slate-700',
      };
    }

    if (isSaving && saveStatus !== 'autosaving') {
      return {
        label: 'Saving',
        detail: pendingChangeCount > 0
          ? `Manual save writing ${pendingLabel} to backend`
          : 'Manual save writing latest canvas state to backend',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
      };
    }

    if (saveStatus === 'autosaving') {
      return {
        label: 'Autosaving',
        detail: pendingChangeCount > 0
          ? `Autosave writing ${pendingLabel} to backend`
          : 'Autosave writing latest canvas state to backend',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
      };
    }

    if (saveStatus === 'error') {
      return {
        label: 'Save failed',
        detail: `${lastSaveError || 'Retry from the toolbar'}${pendingChangeCount > 0 ? ` • ${pendingLabel}` : ''}`,
        className: 'border-red-200 bg-red-50 text-red-700',
      };
    }

    if (hasUnsavedChanges || saveStatus === 'dirty') {
      const queuedFor = formatAutosaveTime(autosaveDueAt);
      return {
        label: 'Unsaved',
        detail: `Autosave queued${queuedFor ? ` for ${queuedFor}` : ''} • ${pendingLabel}`,
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    }

    const savedTime = formatSavedTime(lastSavedAt);
    const modeLabel = lastSaveMode === 'autosave'
      ? 'via autosave'
      : lastSaveMode === 'manual'
        ? 'via manual save'
        : '';

    return {
      label: 'Saved',
      detail: `${savedTime}${modeLabel ? ` • ${modeLabel}` : ''}`,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }, [autosaveDueAt, hasUnsavedChanges, isParentPersistence, isSaving, lastSaveError, lastSaveMode, lastSavedAt, mode, normalizedSaveOwnerLabel, pendingChangeCount, saveStatus]);

  const clampCanvasZoom = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(2, Math.max(0.25, value));
  }, []);

  const handleZoomIn = useCallback(() => {
    setIsCanvasAutoFit(false);
    setCanvasZoom((current) => clampCanvasZoom(Number((current + 0.1).toFixed(2))));
  }, [clampCanvasZoom]);

  const handleZoomOut = useCallback(() => {
    setIsCanvasAutoFit(false);
    setCanvasZoom((current) => clampCanvasZoom(Number((current - 0.1).toFixed(2))));
  }, [clampCanvasZoom]);

  const handleToggleSnap = useCallback(() => {
    setSnapEnabled((current) => !current);
  }, []);

  const handleToggleGridVisibility = useCallback(() => {
    setShowGrid((current) => !current);
  }, []);

  const handleToggleCanvasPanMode = useCallback(() => {
    setIsCanvasPanMode((current) => !current);
  }, []);

  const handleGridSizeChange = useCallback((value: string) => {
    setGridSize(normalizeEditorGridSize(Number(value)));
  }, []);

  const snapEditorValue = useCallback((value: number) => {
    const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
    if (!snapEnabled) {
      return Math.round(safeValue);
    }

    return Math.round(safeValue / safeEditorGridSize) * safeEditorGridSize;
  }, [safeEditorGridSize, snapEnabled]);

  const getNestedInsertionPoint = useCallback(() => {
    const offset = snapEnabled ? safeEditorGridSize : 20;
    return {
      x: offset,
      y: offset,
    };
  }, [safeEditorGridSize, snapEnabled]);

  const handleCanvasViewportMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isCanvasPanActive || event.button !== 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('button, input, select, textarea, [contenteditable="true"], [role="button"], [role="textbox"], [data-editor-shortcuts="disabled"]')
    ) {
      return;
    }

    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    canvasPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsCanvasPanning(true);
  }, [isCanvasPanActive]);

  const markChanges = useCallback(() => {
    changeSequenceRef.current += 1;
    setPendingChangeCount((current) => current + 1);
    setHasUnsavedChanges(true);
    setLastSaveError(null);
    setSaveStatus('dirty');
  }, []);

  const applyFitCanvas = useCallback(() => {
    const container = canvasViewportRef.current;
    if (!container) {
      setCanvasZoom(1);
      return;
    }

    const availableWidth = Math.max(container.clientWidth - 96, 1);
    const availableHeight = Math.max(container.clientHeight - 120, 1);
    const nextScale = Math.min(1.5, availableWidth / size.width, availableHeight / size.height);
    setCanvasZoom(clampCanvasZoom(Number(nextScale.toFixed(2))));
  }, [clampCanvasZoom, size.height, size.width]);

  const handleFitCanvas = useCallback(() => {
    setIsCanvasAutoFit(true);
    applyFitCanvas();
  }, [applyFitCanvas]);

  const handleToggleCanvasFocus = useCallback(() => {
    setIsCanvasFocusMode((current) => !current);
    window.requestAnimationFrame(() => {
      handleFitCanvas();
    });
  }, [handleFitCanvas]);

  const handleToggleComponentPanel = useCallback(() => {
    setIsCanvasFocusMode(false);
    setShowComponentPanel((current) => (isCanvasFocusMode ? true : !current));
  }, [isCanvasFocusMode]);

  const handleToggleInspectorPanel = useCallback(() => {
    setIsCanvasFocusMode(false);
    setShowInspectorPanel((current) => (isCanvasFocusMode ? true : !current));
  }, [isCanvasFocusMode]);

  const handleToggleLayersPanel = useCallback(() => {
    setIsCanvasFocusMode(false);
    setShowInspectorPanel(true);
    setRightPanel((current) => (
      current === 'layers' && showInspectorPanel && !isCanvasFocusMode ? 'properties' : 'layers'
    ));
  }, [isCanvasFocusMode, showInspectorPanel]);

  const applyCanvasSize = useCallback((nextSize: CanvasSize, nextBreakpoint = breakpoint) => {
    if (isCanvasMutationDisabled) {
      setEditorNotice(editDisabledReason);
      return;
    }
    const normalizedSize = {
      ...nextSize,
      width: clampCanvasDimension(nextSize.width),
      height: clampCanvasDimension(nextSize.height),
    };
    setBreakpoint(nextBreakpoint);
    setSize(normalizedSize);
    markChanges();
    if (onChange) {
      onChange(elements, pageSettings, normalizedSize);
    }
  }, [breakpoint, editDisabledReason, elements, isCanvasMutationDisabled, markChanges, onChange, pageSettings]);

  const activeCanvasPresetId = useMemo(() => (
    CANVAS_SIZE_PRESETS.find((preset) => preset.width === size.width && preset.height === size.height)?.id || 'custom'
  ), [size.height, size.width]);

  const handleCanvasPresetChange = useCallback((presetId: string) => {
    const preset = CANVAS_SIZE_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    applyCanvasSize(
      {
        ...size,
        width: preset.width,
        height: preset.height,
      },
      'breakpoint' in preset ? preset.breakpoint : breakpoint,
    );
  }, [applyCanvasSize, breakpoint, size]);

  const handleCanvasDimensionInput = useCallback((axis: 'width' | 'height', value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }

    applyCanvasSize({
      ...size,
      [axis]: parsed,
    });
  }, [applyCanvasSize, size]);

  const canAcceptNestedDrop = (elementType: CanvasElement['type']): boolean => {
    const normalizedType = normalizeElementType(elementType);

    return normalizedType === 'form' ||
      normalizedType === 'box' ||
      normalizedType === 'container' ||
      normalizedType === 'section' ||
      normalizedType === 'header' ||
      normalizedType === 'footer' ||
      normalizedType === 'nav' ||
      normalizedType === 'columns';
  };

  const cloneElements = useCallback((nodes: CanvasElement[]) => (
    JSON.parse(JSON.stringify(nodes)) as CanvasElement[]
  ), []);

  const getInitialElements = useCallback(() => cloneElements(initialElements), [cloneElements, initialElements]);

  const getInitialSettings = useCallback(() => (
    JSON.parse(JSON.stringify(initialSettings)) as PageSettings
  ), [initialSettings]);

  const walkTreeMaxZ = (nodes: CanvasElement[]): number =>
    nodes.reduce((max, item) => {
      const self = item.zIndex || 0;
      const childrenMax = item.children?.length ? walkTreeMaxZ(item.children) : 0;
      return Math.max(max, self, childrenMax);
    }, 0);

  const findElementById = useCallback((items: CanvasElement[], targetId: string): CanvasElement | null => {
    for (const item of items) {
      if (item.id === targetId) {
        return item;
      }

      if (item.children?.length) {
        const found = findElementById(item.children, targetId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }, []);

  const findElementEntry = useCallback((
    items: CanvasElement[],
    targetId: string,
    parentId: string | null = null,
  ): { element: CanvasElement; parentId: string | null } | null => {
    for (const item of items) {
      if (item.id === targetId) {
        return { element: item, parentId };
      }

      if (item.children?.length) {
        const found = findElementEntry(item.children, targetId, item.id);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }, []);

  useEffect(() => {
    if (!initialSelectedElementId) {
      return;
    }

    if (!findElementById(elementsRef.current, initialSelectedElementId)) {
      return;
    }

    setSelectedId(initialSelectedElementId);
    setSelectedIds([initialSelectedElementId]);
    setRightPanel('properties');
  }, [findElementById, initialSelectedElementId]);

  const collectCyclableElementIds = useCallback((items: CanvasElement[]): string[] => {
    const ids: string[] = [];
    const walk = (nodes: CanvasElement[], parentVisible = true) => {
      nodes.forEach((element) => {
        const isVisible = parentVisible && element.visible !== false;
        if (!isVisible) {
          return;
        }

        ids.push(element.id);
        if (element.children?.length) {
          walk(element.children, isVisible);
        }
      });
    };

    walk(items);
    return ids;
  }, []);

  const getElementAbsoluteOffset = useCallback((
    items: CanvasElement[],
    targetId: string,
    origin = { x: 0, y: 0 },
  ): { x: number; y: number } | null => {
    for (const item of items) {
      const nextOrigin = {
        x: origin.x + (Number(item.x) || 0),
        y: origin.y + (Number(item.y) || 0),
      };

      if (item.id === targetId) {
        return nextOrigin;
      }

      if (item.children?.length) {
        const found = getElementAbsoluteOffset(item.children, targetId, nextOrigin);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }, []);

  const elementContainsId = useCallback((element: CanvasElement, targetId: string): boolean => (
    Boolean(element.children?.some((child) => (
      child.id === targetId || elementContainsId(child, targetId)
    )))
  ), []);

  const cloneReusableSectionInstanceTree = useCallback((
    sourceElement: CanvasElement,
    section: ReusableSection,
    options: {
      rootId: string;
      parentId: string | null;
      x: number;
      y: number;
      zIndex: number;
      rootIndex?: number;
      sourceElementId?: string;
    },
  ): CanvasElement => {
    const cloneNode = (node: CanvasElement, nextParentId: string | null, isRoot = false): CanvasElement => {
      const clone = JSON.parse(JSON.stringify(node)) as CanvasElement;
      const nextId = isRoot ? options.rootId : generateId();
      const nextProps = { ...(clone.props || {}) };

      if (isRoot) {
        nextProps.reusableSection = {
          mode: 'synced',
          sectionId: section.id,
          slug: section.slug,
          name: section.name,
          sourceUpdatedAt: section.updatedAt,
          rootIndex: options.rootIndex,
          sourceElementId: options.sourceElementId,
        };
      }

      const nextNode: CanvasElement = {
        ...clone,
        id: nextId,
        type: normalizeElementType(clone.type),
        x: isRoot ? options.x : clone.x,
        y: isRoot ? options.y : clone.y,
        zIndex: isRoot ? options.zIndex : clone.zIndex,
        props: nextProps,
        children: clone.children?.map((child) => cloneNode(child, nextId)),
      };

      if (nextParentId) {
        nextNode.parentId = nextParentId;
      } else {
        delete nextNode.parentId;
      }

      return nextNode;
    };

    return cloneNode(sourceElement, options.parentId, true);
  }, []);

  const toReusableTemplateElement = useCallback((
    element: CanvasElement,
    isRoot = true,
  ): CanvasElement => {
    const templateElement: CanvasElement = JSON.parse(JSON.stringify(element)) as CanvasElement;
    delete templateElement.parentId;
    if (isRoot) {
      templateElement.x = 0;
      templateElement.y = 0;
    }
    templateElement.children = templateElement.children?.map((child) => toReusableTemplateElement(child, false));
    return templateElement;
  }, []);

  const loadReusableSections = useCallback(async () => {
    if (!activeSiteId || !canView) {
      setReusableSections([]);
      setReusableSectionsError(null);
      return;
    }

    setReusableSectionsLoading(true);
    setReusableSectionsError(null);
    try {
      const sections = await listReusableSections(activeSiteId, { status: 'active' });
      setReusableSections(sections);
    } catch (error) {
      setReusableSectionsError(error instanceof Error ? error.message : 'Unable to load reusable sections');
    } finally {
      setReusableSectionsLoading(false);
    }
  }, [activeSiteId, canView]);

  useEffect(() => {
    void loadReusableSections();
  }, [loadReusableSections]);

  const loadInteractiveComponents = useCallback(async () => {
    if (!activeSiteId || !canView) {
      setInteractiveComponents([]);
      setInteractiveComponentsError(null);
      return;
    }

    setInteractiveComponentsLoading(true);
    setInteractiveComponentsError(null);
    try {
      const registry = await getInteractiveComponentRegistry(activeSiteId);
      setInteractiveComponents(registry.components);
    } catch (error) {
      setInteractiveComponentsError(error instanceof Error ? error.message : 'Unable to load interactive components');
    } finally {
      setInteractiveComponentsLoading(false);
    }
  }, [activeSiteId, canView]);

  useEffect(() => {
    void loadInteractiveComponents();
  }, [loadInteractiveComponents]);

  const updateElementById = (
    items: CanvasElement[],
    targetId: string,
    update: (node: CanvasElement) => CanvasElement,
  ): { elements: CanvasElement[]; updated: boolean } => {
    let updated = false;

    const next = items.map((item) => {
      if (item.id === targetId) {
        updated = true;
        return update(item);
      }

      if (!item.children?.length) {
        return item;
      }

      const childResult = updateElementById(item.children, targetId, update);
      if (!childResult.updated) {
        return item;
      }

      updated = true;
      return {
        ...item,
        children: childResult.elements,
      };
    });

    return { elements: next, updated };
  };

  const insertElementAsChild = (
    items: CanvasElement[],
    parentId: string,
    child: CanvasElement,
  ): { elements: CanvasElement[]; updated: boolean } => {
    let updated = false;

    const next = items.map((item) => {
      if (item.id === parentId) {
        updated = true;
        const nextChildren = [...(item.children || []), { ...child, parentId }]
          .map((nextChild, index) => ({
            ...nextChild,
            zIndex: index + 1,
          }));
        return {
          ...item,
          children: nextChildren,
        };
      }

      if (!item.children?.length) {
        return item;
      }

      const childResult = insertElementAsChild(item.children, parentId, child);
      if (!childResult.updated) {
        return item;
      }

      updated = true;
      return {
        ...item,
        children: childResult.elements,
      };
    });

    return { elements: next, updated };
  };

  const insertElementAfterTarget = (
    items: CanvasElement[],
    targetId: string,
    sibling: CanvasElement,
  ): { elements: CanvasElement[]; updated: boolean } => {
    const walk = (nodes: CanvasElement[], parentId: string | null): { elements: CanvasElement[]; updated: boolean } => {
      let updated = false;

      const next = nodes.reduce<CanvasElement[]>((acc, item) => {
        acc.push(item);

        if (item.id === targetId) {
          const nextSibling: CanvasElement = {
            ...sibling,
            ...(parentId ? { parentId } : {}),
          };

          if (!parentId) {
            delete nextSibling.parentId;
          }

          updated = true;
          acc.push(nextSibling);
          return acc;
        }

        if (!item.children?.length) {
          return acc;
        }

        const childResult = walk(item.children, item.id);
        if (!childResult.updated) {
          return acc;
        }

        updated = true;
        acc[acc.length - 1] = {
          ...item,
          children: childResult.elements,
        };
        return acc;
      }, []);

      if (!updated) {
        return { elements: next, updated };
      }

      return {
        updated,
        elements: next.map((element, index) => ({
          ...element,
          zIndex: index + 1,
        })),
      };
    };

    return walk(items, null);
  };

  const insertElementAsSibling = (
    items: CanvasElement[],
    targetId: string,
    sibling: CanvasElement,
  ): { elements: CanvasElement[]; updated: boolean } => {
    const walk = (nodes: CanvasElement[], parentId: string | null): { elements: CanvasElement[]; updated: boolean } => {
      let updated = false;

      const next = nodes.reduce<CanvasElement[]>((acc, item) => {
        if (item.id === targetId) {
          const nextSibling: CanvasElement = {
            ...sibling,
            ...(parentId ? { parentId } : {}),
          };

          if (!parentId) {
            delete nextSibling.parentId;
          }

          updated = true;
          acc.push(item, nextSibling);
          return acc;
        }

        if (!item.children?.length) {
          acc.push(item);
          return acc;
        }

        const childResult = walk(item.children, item.id);
        if (!childResult.updated) {
          acc.push(item);
          return acc;
        }

        updated = true;
        acc.push({
          ...item,
          children: childResult.elements,
        });
        return acc;
      }, []);

      return { elements: next, updated };
    };

    return walk(items, null);
  };

  const removeElementById = (
    items: CanvasElement[],
    targetId: string,
  ): { elements: CanvasElement[]; updated: boolean; removedParentId?: string | null } => {
    const walk = (nodes: CanvasElement[], parentId: string | null): {
      elements: CanvasElement[];
      updated: boolean;
      removedParentId?: string | null;
    } => {
      let updated = false;
      let removedParentId: string | null | undefined;

      const next = nodes.reduce<CanvasElement[]>((acc, item) => {
        if (item.id === targetId) {
          updated = true;
          removedParentId = parentId;
          return acc;
        }

        if (!item.children?.length) {
          acc.push(item);
          return acc;
        }

        const childResult = walk(item.children, item.id);
        if (!childResult.updated) {
          acc.push(item);
          return acc;
        }

        updated = true;
        removedParentId = childResult.removedParentId ?? parentId;
        acc.push({
          ...item,
          children: childResult.elements,
        });
        return acc;
      }, []);

      return { elements: next, updated, removedParentId };
    };

    const removed = walk(items, null);
    if (!removed.updated) {
      return { ...removed, removedParentId: undefined };
    }

    return {
      ...removed,
      removedParentId: removed.removedParentId === null ? null : removed.removedParentId,
    };
  };

  // Sync changes to parent
  useEffect(() => {
    if (onChange) {
      onChange(elements, pageSettings, size);
    }
  }, [elements, pageSettings, onChange, size]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  useEffect(() => {
    onInteractiveReadinessIssuesChange?.(interactiveReadinessIssues);
  }, [interactiveReadinessIssues, onInteractiveReadinessIssuesChange]);

  useEffect(() => {
    if (!isParentPersistence || saveOwnerVersionRef.current === saveOwnerVersion) {
      return;
    }

    saveOwnerVersionRef.current = saveOwnerVersion;
    setHasUnsavedChanges(false);
    setSaveStatus('saved');
    setLastSavedAt(null);
    setLastSaveMode(null);
    setLastSaveError(null);
    setPendingChangeCount(0);
    setAutosaveDueAt(null);
  }, [isParentPersistence, saveOwnerVersion]);

  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      return;
    }

    const validSelectedIds = selectedIds.filter((id) => !!findElementById(elements, id));
    setSelectedIds((current) => {
      const next = current.filter((id) => !!findElementById(elements, id));
      return next.length === current.length && next.every((id, index) => id === current[index])
        ? current
        : next;
    });

    if (!selectedId) {
      return;
    }

    if (!findElementById(elements, selectedId)) {
      setSelectedId(validSelectedIds[0] ?? null);
    }
  }, [elements, selectedId, selectedIds, findElementById]);

  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      return;
    }

    setSelectedIds((current) => {
      if (!selectedId) {
        return current.length ? [] : current;
      }

      return current.includes(selectedId) ? current : [selectedId];
    });
  }, [selectedId]);

  /**
   * Add current state to history
   */
  const resolveSelectionSnapshot = useCallback((
    targetElements: CanvasElement[],
    selectedSnapshot: string | null,
    selectedIdsSnapshot: string[],
  ) => {
    const validIds = Array.from(new Set(selectedIdsSnapshot))
      .filter((id) => !!findElementById(targetElements, id));
    const validSelectedId = selectedSnapshot && findElementById(targetElements, selectedSnapshot)
      ? selectedSnapshot
      : validIds[0] ?? null;
    const nextSelectedIds = validSelectedId && !validIds.includes(validSelectedId)
      ? [validSelectedId, ...validIds]
      : validIds;

    return {
      selectedId: validSelectedId,
      selectedIds: nextSelectedIds,
    };
  }, [findElementById]);

  const applyHistoryEntry = useCallback((targetState: EditorHistoryEntry) => {
    const nextSelection = resolveSelectionSnapshot(
      targetState.elements,
      targetState.selectedId,
      targetState.selectedIds,
    );

    isApplyingHistoryRef.current = true;
    elementsRef.current = targetState.elements;
    setElements(targetState.elements);
    setSelectedIds(nextSelection.selectedIds);
    setSelectedId(nextSelection.selectedId);
    window.setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  }, [resolveSelectionSnapshot]);

  const addToHistory = useCallback((
    newElements: CanvasElement[],
    selectedSnapshot: string | null = selectedId,
    selectedIdsSnapshot: string[] = selectedIds,
    previousElements?: CanvasElement[],
  ) => {
    const nextSelection = resolveSelectionSnapshot(newElements, selectedSnapshot, selectedIdsSnapshot);
    const baseIndex = Math.max(0, Math.min(historyIndexRef.current, historyRef.current.length - 1));
    const nextHistory = historyRef.current.slice(0, baseIndex + 1);
    const historyTail = nextHistory[nextHistory.length - 1];
    const pendingCoalesce = coalesceNextHistoryRef.current;
    const shouldCoalesceTail = Boolean(
      pendingCoalesce &&
        previousElements &&
        historyTail &&
        historyTail.elements.length === pendingCoalesce.elementCount &&
        newElements.length === pendingCoalesce.elementCount &&
        historyElementsEqual(historyTail.elements, previousElements) &&
        pendingCoalesce.selectedIds.length === nextSelection.selectedIds.length &&
        pendingCoalesce.selectedIds.every((id, index) => id === nextSelection.selectedIds[index]),
    );
    const pushHistoryEntry = (entry: EditorHistoryEntry) => {
      const tail = nextHistory[nextHistory.length - 1];
      if (tail && historyElementsEqual(tail.elements, entry.elements)) {
        nextHistory[nextHistory.length - 1] = entry;
        return;
      }

      nextHistory.push(entry);
    };

    if (shouldCoalesceTail) {
      nextHistory[nextHistory.length - 1] = {
        elements: newElements,
        selectedId: nextSelection.selectedId,
        selectedIds: nextSelection.selectedIds,
      };
      coalesceNextHistoryRef.current = null;
    } else {
      coalesceNextHistoryRef.current = null;

      if (previousElements && historyTail) {
        const previousSelection = resolveSelectionSnapshot(
          previousElements,
          selectedIdRef.current,
          selectedIdsRef.current,
        );
        pushHistoryEntry({
          elements: previousElements,
          selectedId: previousSelection.selectedId,
          selectedIds: previousSelection.selectedIds,
        });
      }

      pushHistoryEntry({
        elements: newElements,
        selectedId: nextSelection.selectedId,
        selectedIds: nextSelection.selectedIds,
      });
    }

    // Limit history size to 50
    if (nextHistory.length > 50) {
      nextHistory.splice(0, nextHistory.length - 50);
    }

    const nextIndex = nextHistory.length - 1;
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
  }, [resolveSelectionSnapshot, selectedId, selectedIds]);

  /**
   * Undo
   */
  const handleUndo = useCallback(() => {
    const currentHistory = historyRef.current;
    const currentIndex = Math.max(0, Math.min(historyIndexRef.current, currentHistory.length - 1));

    if (currentIndex <= 0) {
      return;
    }

    let newIndex = currentIndex - 1;
    while (
      newIndex > 0 &&
      historyElementsEqual(currentHistory[newIndex].elements, currentHistory[currentIndex].elements)
    ) {
      newIndex -= 1;
    }
    const targetState = currentHistory[newIndex];
    historyIndexRef.current = newIndex;
    applyHistoryEntry(targetState);
    markChanges();
    setHistoryIndex(newIndex);
  }, [applyHistoryEntry, markChanges]);

  /**
   * Redo
   */
  const handleRedo = useCallback(() => {
    const currentHistory = historyRef.current;
    const currentIndex = Math.max(0, Math.min(historyIndexRef.current, currentHistory.length - 1));

    if (currentIndex >= currentHistory.length - 1) {
      return;
    }

    let newIndex = currentIndex + 1;
    while (
      newIndex < currentHistory.length - 1 &&
      historyElementsEqual(currentHistory[newIndex].elements, currentHistory[currentIndex].elements)
    ) {
      newIndex += 1;
    }
    const targetState = currentHistory[newIndex];
    historyIndexRef.current = newIndex;
    applyHistoryEntry(targetState);
    markChanges();
    setHistoryIndex(newIndex);
  }, [applyHistoryEntry, markChanges]);

  /**
   * Wrapper for updating elements with history
   */
  const updateElementsWithHistory = useCallback((
    nextElementsOrFn:
      | CanvasElement[]
      | ((current: CanvasElement[]) => CanvasElement[]),
    selectedSnapshot: string | null = selectedId,
    selectedIdsSnapshot: string[] = selectedIds,
  ) => {
    if (isCanvasMutationDisabled) {
      return;
    }

    if (isApplyingHistoryRef.current) {
      return;
    }

    const currentElements = elementsRef.current;
    const nextElements = typeof nextElementsOrFn === 'function'
      ? nextElementsOrFn(currentElements)
      : nextElementsOrFn;

    if (nextElements !== currentElements && !historyElementsEqual(nextElements, currentElements)) {
      elementsRef.current = nextElements;
      setElements(nextElements);
      addToHistory(nextElements, selectedSnapshot, selectedIdsSnapshot, currentElements);
      markChanges();
    }
  }, [addToHistory, isCanvasMutationDisabled, markChanges, selectedId, selectedIds]);

  /**
   * Copy
   */
  const getSelectedSiblingEntries = useCallback((
    currentElements: CanvasElement[],
    options: { requireUnlocked?: boolean } = {},
  ) => {
    if (!selectedId) {
      return [];
    }

    const primaryEntry = findElementEntry(currentElements, selectedId);
    if (!primaryEntry) {
      return [];
    }

    const candidateIds = selectedIds.length > 1 ? selectedIds : [selectedId];
    return candidateIds
      .map((id) => findElementEntry(currentElements, id))
      .filter((entry): entry is { element: CanvasElement; parentId: string | null } => (
        !!entry &&
        entry.parentId === primaryEntry.parentId &&
        (!options.requireUnlocked || !entry.element.locked)
      ));
  }, [findElementEntry, selectedId, selectedIds]);

  const handleCopy = useCallback(() => {
    const entries = getSelectedSiblingEntries(elementsRef.current);
    if (entries.length > 0) {
      setClipboardElements(entries.map((entry) => JSON.parse(JSON.stringify(entry.element)) as CanvasElement));
    }
  }, [getSelectedSiblingEntries]);

  const cloneElementTreeWithDeterministicIds = useCallback(
    (
      sourceElement: CanvasElement,
      x = 20,
      y = 20,
      parentId: string | null = null,
      options: CloneElementTreeOptions,
    ): CanvasElement => {
      const cloneNode = (node: CanvasElement, nextParentId: string | null, isRoot = false): CanvasElement => {
        const clone = JSON.parse(JSON.stringify(node)) as CanvasElement;
        const nextId = getNextDeterministicCloneId(clone.id, options.usedElementIds);
        const rootCopyName = isRoot && options.renameRoot && clone.name
          ? getUniqueDuplicateLayerName(clone.name, options.siblingNames || [])
          : clone.name;
        const nextNode: CanvasElement = {
          ...clone,
          id: nextId,
          type: normalizeElementType(clone.type),
          name: rootCopyName,
          ...(nextParentId ? { parentId: nextParentId } : {}),
          children: clone.children?.map((child) => cloneNode(child, nextId)),
        };

        if (!nextParentId) {
          delete nextNode.parentId;
        }

        if (isRoot) {
          nextNode.x = sourceElement.x + x;
          nextNode.y = sourceElement.y + y;
          nextNode.zIndex = options.rootZIndex;
        }

        return nextNode;
      };

      return cloneNode(sourceElement, parentId, true);
    },
    []
  );

  /**
   * Paste
   */
  const handlePaste = useCallback(() => {
    if (clipboardElements.length > 0) {
      if (isCanvasMutationDisabled) {
        return;
      }

      const previousElements = elementsRef.current;
      const selectedElement = selectedId ? findElementById(previousElements, selectedId) : null;
      const canNest = selectedElement && !selectedElement.locked && canAcceptNestedDrop(selectedElement.type);
      const parentId = canNest ? selectedElement.id : null;
      const usedElementIds = collectCanvasElementIds(previousElements);
      const rootZIndex = Math.max(walkTreeMaxZ(previousElements), 0) + 1;
      const pastedElements = clipboardElements.map((clipboardElement, index) => (
        cloneElementTreeWithDeterministicIds(clipboardElement, 20, 20, parentId, {
          usedElementIds,
          rootZIndex: rootZIndex + index,
        })
      ));
      let nextElements = previousElements;
      let inserted = false;

      if (canNest) {
        for (const pastedElement of pastedElements) {
          const insertResult = insertElementAsChild(nextElements, selectedElement.id, pastedElement);
          nextElements = insertResult.elements;
          inserted = inserted || insertResult.updated;
        }
      } else {
        nextElements = [...previousElements, ...pastedElements];
        inserted = pastedElements.length > 0;
      }

      if (!inserted) {
        return;
      }

      const firstPastedId = pastedElements[0]?.id ?? null;
      const pastedIds = pastedElements.map((element) => element.id);
      setSelectedIds(pastedIds);
      setSelectedId(firstPastedId);
      elementsRef.current = nextElements;
      setElements(nextElements);
      addToHistory(nextElements, firstPastedId, pastedIds, previousElements);
      const coalesceMarker = {
        selectedIds: pastedIds,
        elementCount: nextElements.length,
      };
      coalesceNextHistoryRef.current = coalesceMarker;
      window.setTimeout(() => {
        if (coalesceNextHistoryRef.current === coalesceMarker) {
          coalesceNextHistoryRef.current = null;
        }
      }, 1000);
      markChanges();
    }
  }, [
    addToHistory,
    clipboardElements,
    cloneElementTreeWithDeterministicIds,
    findElementById,
    isCanvasMutationDisabled,
    markChanges,
    selectedId,
  ]);

  const handleDuplicate = useCallback(() => {
    if (isCanvasMutationDisabled) return;

    const currentElements = elementsRef.current;
    const entries = getSelectedSiblingEntries(currentElements, { requireUnlocked: true });
    if (entries.length === 0) return;

    let nextElements = currentElements;
    const duplicatedIds: string[] = [];
    const usedElementIds = collectCanvasElementIds(currentElements);
    const rootZIndex = Math.max(walkTreeMaxZ(currentElements), 0) + 1;
    for (const entry of entries) {
      const siblingNames = (entry.parentId
        ? findElementEntry(nextElements, entry.parentId)?.element.children || []
        : nextElements
      )
        .map((element) => element.name)
        .filter((name): name is string => typeof name === 'string');
      const duplicate = cloneElementTreeWithDeterministicIds(entry.element, 20, 20, entry.parentId, {
        renameRoot: true,
        siblingNames,
        usedElementIds,
        rootZIndex: rootZIndex + duplicatedIds.length,
      });
      const duplicated = insertElementAsSibling(nextElements, entry.element.id, duplicate);
      if (!duplicated.updated) continue;

      nextElements = duplicated.elements;
      duplicatedIds.push(duplicate.id);
    }

    if (duplicatedIds.length === 0) return;

    setSelectedIds(duplicatedIds);
    setSelectedId(duplicatedIds[0] ?? null);
    updateElementsWithHistory(nextElements, duplicatedIds[0] ?? null, duplicatedIds);
  }, [cloneElementTreeWithDeterministicIds, findElementEntry, getSelectedSiblingEntries, isCanvasMutationDisabled, updateElementsWithHistory]);

  const handleZOrderChange = useCallback((action: CanvasZOrderAction) => {
    if (isCanvasMutationDisabled) return;

    const currentElements = elementsRef.current;
    const entries = getSelectedSiblingEntries(currentElements, { requireUnlocked: true });
    if (entries.length === 0) {
      return;
    }

    const parentId = entries[0].parentId;
    const selectedLayerIds = new Set(entries.map((entry) => entry.element.id));
    const selectedSnapshot = entries.map((entry) => entry.element.id);
    const nextSelectedId = selectedSnapshot[0] ?? selectedId;

    const reorderSiblings = (siblings: CanvasElement[]) => (
      reorderSelectedSiblingStack(siblings, selectedLayerIds, action)
    );

    let moved = false;
    let nextElements = currentElements;
    if (parentId === null) {
      const result = reorderSiblings(currentElements);
      moved = result.moved;
      nextElements = result.siblings;
    } else {
      const updateParentChildren = (nodes: CanvasElement[]): CanvasElement[] => (
        nodes.map((element) => {
          if (element.id === parentId) {
            const result = reorderSiblings(element.children || []);
            moved = result.moved;
            return result.moved
              ? { ...element, children: result.siblings }
              : element;
          }

          if (!element.children?.length) {
            return element;
          }

          const nextChildren = updateParentChildren(element.children);
          return nextChildren === element.children ? element : { ...element, children: nextChildren };
        })
      );

      nextElements = updateParentChildren(currentElements);
    }

    if (!moved) {
      return;
    }

    setSelectedId(nextSelectedId);
    setSelectedIds(selectedSnapshot);
    updateElementsWithHistory(nextElements, nextSelectedId, selectedSnapshot);
  }, [getSelectedSiblingEntries, isCanvasMutationDisabled, selectedId, updateElementsWithHistory]);

  const handleLayerSelect = useCallback((ids: string[]) => {
    const nextIds = ids.filter((id) => !!findElementById(elements, id));
    setSelectedIds(nextIds);
    setSelectedId(nextIds[0] ?? null);
    if (nextIds.length > 1) {
      setRightPanel('layers');
    }
  }, [elements, findElementById]);

  const handleLayerReorder = useCallback((fromId: string, toId: string) => {
    updateElementsWithHistory((currentElements) => {
      const fromEntry = findElementEntry(currentElements, fromId);
      const toEntry = findElementEntry(currentElements, toId);

      if (
        !fromEntry ||
        !toEntry ||
        fromId === toId ||
        fromEntry.parentId !== toEntry.parentId ||
        fromEntry.element.locked ||
        toEntry.element.locked
      ) {
        return currentElements;
      }

      const reorderSiblings = (siblings: CanvasElement[]): CanvasElement[] => {
        const fromIndex = siblings.findIndex((element) => element.id === fromId);
        const toIndex = siblings.findIndex((element) => element.id === toId);

        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return siblings;
        }

        const next = [...siblings];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);

        return next.map((element, index) => ({
          ...element,
          zIndex: index + 1,
        }));
      };

      if (fromEntry.parentId === null) {
        return reorderSiblings(currentElements);
      }

      const updateParentChildren = (nodes: CanvasElement[]): CanvasElement[] => (
        nodes.map((element) => {
          if (element.id === fromEntry.parentId) {
            return {
              ...element,
              children: reorderSiblings(element.children || []),
            };
          }

          if (!element.children?.length) {
            return element;
          }

          return {
            ...element,
            children: updateParentChildren(element.children),
          };
        })
      );

      return updateParentChildren(currentElements);
    }, selectedId);
  }, [findElementEntry, selectedId, updateElementsWithHistory]);

  const handleLayerMove = useCallback((elementId: string, action: 'up' | 'down' | 'outdent') => {
    if (isCanvasMutationDisabled) {
      return;
    }

    const entry = findElementEntry(elements, elementId);
    if (!entry || entry.element.locked) {
      return;
    }

    if (action === 'outdent') {
      if (!entry.parentId) {
        return;
      }

      const parentEntry = findElementEntry(elements, entry.parentId);
      if (!parentEntry) {
        return;
      }

      const elementOffset = getElementAbsoluteOffset(elements, elementId);
      const nextParentOffset = parentEntry.parentId
        ? getElementAbsoluteOffset(elements, parentEntry.parentId)
        : { x: 0, y: 0 };

      if (!elementOffset || !nextParentOffset) {
        return;
      }

      const promotedElement: CanvasElement = {
        ...(JSON.parse(JSON.stringify(entry.element)) as CanvasElement),
        x: elementOffset.x - nextParentOffset.x,
        y: elementOffset.y - nextParentOffset.y,
      };

      if (parentEntry.parentId) {
        promotedElement.parentId = parentEntry.parentId;
      } else {
        delete promotedElement.parentId;
      }

      const removed = removeElementById(elements, elementId);
      if (!removed.updated) {
        return;
      }

      const inserted = insertElementAfterTarget(removed.elements, entry.parentId, promotedElement);
      if (!inserted.updated) {
        return;
      }

      setSelectedId(elementId);
      setSelectedIds([elementId]);
      updateElementsWithHistory(inserted.elements, elementId, [elementId]);
      return;
    }

    const moveSiblings = (siblings: CanvasElement[]): { siblings: CanvasElement[]; moved: boolean } => {
      const fromIndex = siblings.findIndex((element) => element.id === elementId);
      if (fromIndex < 0) {
        return { siblings, moved: false };
      }

      const toIndex = action === 'up' ? fromIndex + 1 : fromIndex - 1;
      if (toIndex < 0 || toIndex >= siblings.length) {
        return { siblings, moved: false };
      }

      const next = [...siblings];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return {
        moved: true,
        siblings: next.map((element, index) => ({
          ...element,
          zIndex: index + 1,
        })),
      };
    };

    const updateParentChildren = (nodes: CanvasElement[]): { nodes: CanvasElement[]; moved: boolean } => {
      if (entry.parentId === null) {
        const result = moveSiblings(nodes);
        return { nodes: result.siblings, moved: result.moved };
      }

      let moved = false;
      const nextNodes = nodes.map((node) => {
        if (node.id === entry.parentId) {
          const result = moveSiblings(node.children || []);
          moved = result.moved;
          return result.moved
            ? { ...node, children: result.siblings }
            : node;
        }

        if (!node.children?.length) {
          return node;
        }

        const childResult = updateParentChildren(node.children);
        if (!childResult.moved) {
          return node;
        }

        moved = true;
        return {
          ...node,
          children: childResult.nodes,
        };
      });

      return { nodes: nextNodes, moved };
    };

    const result = updateParentChildren(elements);
    if (!result.moved) {
      return;
    }

    setSelectedId(elementId);
    setSelectedIds([elementId]);
    updateElementsWithHistory(result.nodes, elementId, [elementId]);
  }, [
    elements,
    findElementEntry,
    getElementAbsoluteOffset,
    isCanvasMutationDisabled,
    updateElementsWithHistory,
  ]);

  const handleNestSelectionIntoLayer = useCallback((parentId: string) => {
    if (isCanvasMutationDisabled) {
      return;
    }

    const parentEntry = findElementEntry(elements, parentId);
    if (!parentEntry || parentEntry.element.locked || !canAcceptNestedDrop(parentEntry.element.type)) {
      return;
    }

    const parentOffset = getElementAbsoluteOffset(elements, parentId);
    if (!parentOffset) {
      return;
    }

    const candidateIds = (selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
      .filter((id) => id !== parentId);
    const movedElements: CanvasElement[] = [];
    let nextElements = elements;

    candidateIds.forEach((candidateId) => {
      const entryForMove = findElementEntry(elements, candidateId);
      const candidateOffset = getElementAbsoluteOffset(elements, candidateId);

      if (
        !entryForMove ||
        !candidateOffset ||
        entryForMove.parentId === parentId ||
        entryForMove.element.locked ||
        elementContainsId(entryForMove.element, parentId)
      ) {
        return;
      }

      const nestedElement: CanvasElement = {
        ...(JSON.parse(JSON.stringify(entryForMove.element)) as CanvasElement),
        parentId,
        x: candidateOffset.x - parentOffset.x,
        y: candidateOffset.y - parentOffset.y,
      };

      const removed = removeElementById(nextElements, candidateId);
      if (!removed.updated) {
        return;
      }

      nextElements = removed.elements;
      movedElements.push(nestedElement);
    });

    if (!movedElements.length) {
      return;
    }

    movedElements.forEach((nestedElement) => {
      const inserted = insertElementAsChild(nextElements, parentId, nestedElement);
      if (inserted.updated) {
        nextElements = inserted.elements;
      }
    });

    const movedIds = movedElements.map((element) => element.id);
    setSelectedId(movedIds[0] ?? null);
    setSelectedIds(movedIds);
    updateElementsWithHistory(nextElements, movedIds[0] ?? null, movedIds);
  }, [
    elements,
    elementContainsId,
    findElementEntry,
    getElementAbsoluteOffset,
    isCanvasMutationDisabled,
    selectedId,
    selectedIds,
    updateElementsWithHistory,
  ]);

  const handleLayerVisibilityToggle = useCallback((elementId: string) => {
    const activeElement = findElementById(displayedElements, elementId) || findElementById(elements, elementId);
    const nextVisible = activeElement?.visible === false;

    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, elementId, (element) => (
        applyUpdatesForBreakpoint(element, { visible: nextVisible }, breakpoint)
      ));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [breakpoint, displayedElements, elements, findElementById, selectedId, updateElementsWithHistory]);

  const handleLayerLockToggle = useCallback((elementId: string) => {
    const activeElement = findElementById(displayedElements, elementId) || findElementById(elements, elementId);
    const nextLocked = !activeElement?.locked;

    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, elementId, (element) => (
        applyUpdatesForBreakpoint(element, { locked: nextLocked }, breakpoint)
      ));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [breakpoint, displayedElements, elements, findElementById, selectedId, updateElementsWithHistory]);

  const handleLayerRename = useCallback((elementId: string, name: string) => {
    const nextName = name.trim();

    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, elementId, (element) => {
        if (element.locked) {
          return element;
        }

        const nextElement: CanvasElement = { ...element };
        if (nextName) {
          nextElement.name = nextName;
        } else {
          delete nextElement.name;
        }

        return nextElement;
      });

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [selectedId, updateElementsWithHistory]);

  const handleLayerDelete = useCallback((elementId: string) => {
    if (isCanvasMutationDisabled) {
      return;
    }

    const currentElements = elementsRef.current;
    const selectedLayerEntries = selectedIds.includes(elementId) && selectedIds.length > 1
      ? getSelectedSiblingEntries(currentElements, { requireUnlocked: true })
      : [];
    const selectedLayerAction = selectedLayerEntries.some((entry) => entry.element.id === elementId);
    if (selectedLayerAction) {
      const entries = selectedLayerEntries;
      if (entries.length === 0) {
        return;
      }

      let nextElements = currentElements;
      let parentSelection: string | null = entries[0]?.parentId ?? null;
      let removed = false;
      for (const entry of entries) {
        const result = removeElementById(nextElements, entry.element.id);
        if (!result.updated) continue;

        nextElements = result.elements;
        parentSelection = result.removedParentId || parentSelection;
        removed = true;
      }

      if (!removed) {
        return;
      }

      setSelectedId(parentSelection);
      setSelectedIds(parentSelection ? [parentSelection] : []);
      updateElementsWithHistory(nextElements, parentSelection, parentSelection ? [parentSelection] : []);
      return;
    }

    const entry = findElementEntry(currentElements, elementId);
    if (!entry || entry.element.locked) {
      return;
    }

    const result = removeElementById(currentElements, elementId);
    if (!result.updated) return;

    const parentSelection = result.removedParentId || null;
    const remainingSelectedIds = selectedIds.filter((id) => (
      id !== elementId && !!findElementById(result.elements, id)
    ));
    const nextSelectedId = selectedId === elementId
      ? remainingSelectedIds[0] ?? parentSelection
      : selectedId && findElementById(result.elements, selectedId)
        ? selectedId
        : remainingSelectedIds[0] ?? parentSelection;
    const nextSelectedIds = nextSelectedId
      ? Array.from(new Set([nextSelectedId, ...remainingSelectedIds]))
      : [];

    setSelectedId(nextSelectedId);
    setSelectedIds(nextSelectedIds);
    updateElementsWithHistory(result.elements, nextSelectedId, nextSelectedIds);
  }, [findElementById, findElementEntry, getSelectedSiblingEntries, isCanvasMutationDisabled, selectedId, selectedIds, updateElementsWithHistory]);

  const handleLayerDuplicate = useCallback((elementId: string) => {
    if (isCanvasMutationDisabled) {
      return;
    }

    const currentElements = elementsRef.current;
    const selectedEntry = findElementEntry(currentElements, elementId);
    if (!selectedEntry || selectedEntry.element.locked) return;

    const selectedLayerAction = selectedIds.includes(elementId) && selectedIds.length > 1;
    const selectedLayerEntries = selectedLayerAction
      ? getSelectedSiblingEntries(currentElements, { requireUnlocked: true })
      : [];
    const entries = selectedLayerEntries.some((entry) => entry.element.id === elementId)
      ? selectedLayerEntries
      : [selectedEntry];
    if (entries.length === 0) return;

    let nextElements = currentElements;
    const duplicatedIds: string[] = [];
    const usedElementIds = collectCanvasElementIds(currentElements);
    const rootZIndex = Math.max(walkTreeMaxZ(currentElements), 0) + 1;
    for (const entry of entries) {
      const siblingNames = (entry.parentId
        ? findElementEntry(nextElements, entry.parentId)?.element.children || []
        : nextElements
      )
        .map((element) => element.name)
        .filter((name): name is string => typeof name === 'string');
      const duplicate = cloneElementTreeWithDeterministicIds(entry.element, 20, 20, entry.parentId, {
        renameRoot: true,
        siblingNames,
        usedElementIds,
        rootZIndex: rootZIndex + duplicatedIds.length,
      });
      const duplicated = insertElementAsSibling(nextElements, entry.element.id, duplicate);
      if (!duplicated.updated) continue;

      nextElements = duplicated.elements;
      duplicatedIds.push(duplicate.id);
    }

    if (duplicatedIds.length === 0) return;

    setSelectedId(duplicatedIds[0] ?? null);
    setSelectedIds(duplicatedIds);
    updateElementsWithHistory(nextElements, duplicatedIds[0] ?? null, duplicatedIds);
  }, [
    cloneElementTreeWithDeterministicIds,
    findElementEntry,
    getSelectedSiblingEntries,
    isCanvasMutationDisabled,
    selectedIds,
    updateElementsWithHistory,
  ]);

  const handleGroupSelected = useCallback(() => {
    if (isCanvasMutationDisabled) {
      setEditorNotice(editDisabledReason);
      return;
    }

    const activeSelectedIds = selectedIdsRef.current.length
      ? selectedIdsRef.current
      : selectedIdRef.current
        ? [selectedIdRef.current]
        : [];
    const selectedSet = new Set(activeSelectedIds);
    const currentElements = elementsRef.current;
    const entries = activeSelectedIds
      .map((id) => findElementEntry(currentElements, id))
      .filter((entry): entry is { element: CanvasElement; parentId: string | null } => !!entry);

    if (entries.length < 2) {
      return;
    }

    const parentId = entries[0].parentId;
    if (!entries.every((entry) => entry.parentId === parentId && !entry.element.locked)) {
      return;
    }

    const groupId = generateId();
    const makeGroupedSiblings = (siblings: CanvasElement[]): CanvasElement[] => {
      const selectedSiblings = siblings.filter((item) => selectedSet.has(item.id));
      if (selectedSiblings.length !== entries.length) {
        return siblings;
      }

      const minX = Math.min(...selectedSiblings.map((item) => item.x));
      const minY = Math.min(...selectedSiblings.map((item) => item.y));
      const maxX = Math.max(...selectedSiblings.map((item) => item.x + item.width));
      const maxY = Math.max(...selectedSiblings.map((item) => item.y + item.height));
      const groupBase = {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        zIndex: Math.max(...selectedSiblings.map((item) => item.zIndex || 1)),
      };
      const responsiveGroup = buildResponsiveGroupChildren(selectedSiblings, groupId, groupBase);
      const group: CanvasElement = {
        id: groupId,
        type: 'box',
        name: 'Group',
        ...(parentId ? { parentId } : {}),
        ...groupBase,
        visible: true,
        props: {
          backgroundColor: 'transparent',
          borderRadius: 0,
          borderWidth: 0,
          editorGroup: true,
          padding: 0,
        },
        ...(responsiveGroup.responsive ? { responsive: responsiveGroup.responsive } : {}),
        children: responsiveGroup.children,
      };

      let inserted = false;
      return siblings.reduce<CanvasElement[]>((next, item) => {
        if (!selectedSet.has(item.id)) {
          next.push(item);
          return next;
        }

        if (!inserted) {
          next.push(group);
          inserted = true;
        }

        return next;
      }, []);
    };

    const updateParentChildren = (nodes: CanvasElement[]): CanvasElement[] => {
      if (parentId === null) {
        return makeGroupedSiblings(nodes);
      }

      return nodes.map((item) => {
        if (item.id === parentId) {
          return {
            ...item,
            children: makeGroupedSiblings(item.children || []),
          };
        }

        if (!item.children?.length) {
          return item;
        }

        return {
          ...item,
          children: updateParentChildren(item.children),
        };
      });
    };

    const nextElements = updateParentChildren(currentElements);
    updateElementsWithHistory(nextElements, groupId, [groupId]);
    const coalesceMarker = {
      selectedIds: [groupId],
      elementCount: nextElements.length,
    };
    coalesceNextHistoryRef.current = coalesceMarker;
    window.setTimeout(() => {
      if (coalesceNextHistoryRef.current === coalesceMarker) {
        coalesceNextHistoryRef.current = null;
      }
    }, 1000);
    setSelectedIds([groupId]);
    setSelectedId(groupId);
    setRightPanel('properties');
  }, [editDisabledReason, findElementEntry, isCanvasMutationDisabled, updateElementsWithHistory]);

  const handleUngroupSelected = useCallback(() => {
    if (isCanvasMutationDisabled) {
      setEditorNotice(editDisabledReason);
      return;
    }

    const selectedGroupCandidateIds = selectedIdsRef.current.length
      ? selectedIdsRef.current
      : selectedIdRef.current
        ? [selectedIdRef.current]
        : [];
    if (selectedGroupCandidateIds.length === 0) {
      return;
    }

    const currentElements = elementsRef.current;
    const entries = selectedGroupCandidateIds
      .map((id) => findElementEntry(currentElements, id))
      .filter((entry): entry is { element: CanvasElement; parentId: string | null } => !!entry);
    const parentId = entries[0]?.parentId ?? null;
    const groupEntries = entries.filter((entry) => (
      entry.parentId === parentId &&
      !entry.element.locked &&
      isEditorGroupElement(entry.element) &&
      Boolean(entry.element.children?.length)
    ));

    if (entries.length === 0 || groupEntries.length !== entries.length) {
      return;
    }

    const selectedGroupIds = new Set(groupEntries.map((entry) => entry.element.id));
    const expandedIds: string[] = [];
    const expandSiblings = (siblings: CanvasElement[]): CanvasElement[] => (
      siblings.flatMap((item) => {
        if (!selectedGroupIds.has(item.id)) {
          return [item];
        }

        return (item.children || []).map((child, index) => {
          const nextChild: CanvasElement = {
            ...child,
            x: item.x + child.x,
            y: item.y + child.y,
            zIndex: (item.zIndex || 1) + Math.max(0, (child.zIndex || index + 1) - 1),
          };
          const nextResponsive = restoreUngroupedChildResponsive(item, child, nextChild);

          if (parentId) {
            nextChild.parentId = parentId;
          } else {
            delete nextChild.parentId;
          }

          if (nextResponsive) {
            nextChild.responsive = nextResponsive;
          } else {
            delete nextChild.responsive;
          }

          expandedIds.push(nextChild.id);
          return nextChild;
        });
      })
    );

    const updateParentChildren = (nodes: CanvasElement[]): CanvasElement[] => {
      if (parentId === null) {
        return expandSiblings(nodes);
      }

      return nodes.map((item) => {
        if (item.id === parentId) {
          return {
            ...item,
            children: expandSiblings(item.children || []),
          };
        }

        if (!item.children?.length) {
          return item;
        }

        return {
          ...item,
          children: updateParentChildren(item.children),
        };
      });
    };

    const nextElements = updateParentChildren(currentElements);
    const nextSelectedId = expandedIds[0] ?? null;
    updateElementsWithHistory(nextElements, nextSelectedId, expandedIds);
    const coalesceMarker = {
      selectedIds: expandedIds,
      elementCount: nextElements.length,
    };
    coalesceNextHistoryRef.current = coalesceMarker;
    window.setTimeout(() => {
      if (coalesceNextHistoryRef.current === coalesceMarker) {
        coalesceNextHistoryRef.current = null;
      }
    }, 1000);
    setSelectedIds(expandedIds);
    setSelectedId(nextSelectedId);
    setRightPanel('layers');
  }, [editDisabledReason, findElementEntry, isCanvasMutationDisabled, updateElementsWithHistory]);

  // Get selected element
  const baseSelectedElement = selectedId ? findElementById(elements, selectedId) : null;
  const selectedElement = selectedId ? findElementById(displayedElements, selectedId) : null;
  const selectedBreakpointOverride = breakpoint !== 'desktop'
    ? baseSelectedElement?.responsive?.[breakpoint]
    : undefined;
  const selectedReusableSectionMeta = getReusableSectionInstanceMeta(baseSelectedElement?.props?.reusableSection);
  const selectedReusableSectionSource = selectedReusableSectionMeta
    ? reusableSections.find((section) => section.id === selectedReusableSectionMeta.sectionId)
    : undefined;
  const selectedBreakpointOverrideGroups = getResponsiveOverrideGroups(selectedBreakpointOverride, baseSelectedElement);
  const selectedElementHasBreakpointOverride = Boolean(
    selectedBreakpointOverrideGroups.length > 0,
  );
  const selectedEntries = useMemo(
    () => selectedIds
      .map((id) => findElementEntry(elements, id))
      .filter((entry): entry is { element: CanvasElement; parentId: string | null } => !!entry),
    [elements, findElementEntry, selectedIds],
  );
  const selectedActiveElements = useMemo(
    () => selectedIds
      .map((id) => findElementById(displayedElements, id) || findElementById(elements, id))
      .filter((element): element is CanvasElement => Boolean(element)),
    [displayedElements, elements, findElementById, selectedIds],
  );
  const selectedParentId = selectedEntries[0]?.parentId ?? null;
  const selectedEntriesShareParent = selectedEntries.length > 0
    && selectedEntries.every((entry) => entry.parentId === selectedParentId);
  const selectableSiblingIds = useMemo(() => {
    const selectedEntry = selectedId ? findElementEntry(elements, selectedId) : null;
    const parentId = selectedEntry?.parentId ?? null;
    const siblings = parentId
      ? findElementEntry(elements, parentId)?.element.children || []
      : elements;

    return siblings
      .filter((item) => item.visible !== false && !item.locked)
      .map((item) => item.id);
  }, [elements, findElementEntry, selectedId]);
  const selectedSiblingLayerCount = useMemo(() => {
    const selectedEntry = selectedId ? findElementEntry(elements, selectedId) : null;
    const parentId = selectedEntry?.parentId ?? null;
    const siblings = parentId
      ? findElementEntry(elements, parentId)?.element.children || []
      : elements;

    return siblings.length;
  }, [elements, findElementEntry, selectedId]);
  const canGroupSelected = selectedEntries.length > 1
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => !entry.element.locked);
  const canUngroupSelected = selectedEntries.length > 0
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => (
      !entry.element.locked &&
      isEditorGroupElement(entry.element) &&
      Boolean(entry.element.children?.length)
    ));
  const canAlignSelected = selectedEntries.length > 0
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => (
      !entry.element.locked &&
      entry.element.visible !== false
    ));
  const canZOrderSelected = selectedEntries.length > 0
    && selectedEntriesShareParent
    && selectedSiblingLayerCount > selectedEntries.length
    && selectedEntries.every((entry) => !entry.element.locked);
  const canDistributeSelected = selectedEntries.length >= 3
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => (
      !entry.element.locked &&
      entry.element.visible !== false
    ));
  const canCopySelected = selectedEntries.length > 0 && selectedEntriesShareParent;
  const canCutSelected = selectedEntriesShareParent && selectedEntries.some((entry) => !entry.element.locked);
  const canDuplicateSelected = canCutSelected;
  const canDeleteSelected = canCutSelected;
  const canToggleSelectedVisibility = selectedActiveElements.length > 0
    && selectedActiveElements.every((element) => !element.locked);
  const selectedLayersAreHidden = selectedActiveElements.length > 0
    && selectedActiveElements.every((element) => element.visible === false);
  const selectedLayersAreLocked = selectedActiveElements.length > 0
    && selectedActiveElements.every((element) => element.locked === true);
  const selectedLayerActionLabel = selectedIds.length > 1 ? 'selected layers' : 'selected layer';
  const selectedElementTypeLabel = selectedElement
    ? normalizeElementType(selectedElement.type)
    : null;
  const selectedElementLabel = selectedElement
    ? selectedElement.name || selectedElementTypeLabel
    : null;
  const selectedElementDetail = selectedElement
    ? selectedElement.name
      ? `${selectedElementTypeLabel} - ${selectedElement.id}`
      : selectedElement.id
    : null;
  const clipboardLayerLabel = clipboardElements.length === 1 ? 'layer' : 'layers';
  const canPasteIntoSelectedContainer = Boolean(
    selectedElement && !selectedElement.locked && canAcceptNestedDrop(selectedElement.type),
  );
  const pasteTargetMode = canPasteIntoSelectedContainer ? 'selected-container' : 'canvas-root';
  const pasteTargetLabel = canPasteIntoSelectedContainer && selectedElementLabel
    ? `Paste ${clipboardLayerLabel} into ${selectedElementLabel}`
    : `Paste ${clipboardLayerLabel} on canvas`;
  const selectableChildLayer = selectedElement?.children?.find((child) => (
    child.visible !== false && !child.locked
  )) ?? null;
  const selectableChildLayerIds = useMemo(() => (
    selectedElement?.children
      ?.filter((child) => child.visible !== false && !child.locked)
      .map((child) => child.id) || []
  ), [selectedElement]);
  const canSelectParentLayer = selectedEntriesShareParent && Boolean(selectedParentId);
  const canSelectChildLayer = Boolean(selectableChildLayer);
  const canSelectChildLayerScope = selectableChildLayerIds.length > 0;
  const editorCompositionReadiness = useMemo(() => {
    const metrics = collectEditorCompositionMetrics(elements);
    const topTypes = Object.entries(metrics.typeCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([type, count]) => ({ type, count }));
    const selectionCanCompose = selectedIds.length < 2 || canGroupSelected || canUngroupSelected;
    const checks = [
      {
        label: 'Layer tree',
        detail: metrics.totalLayers > 0
          ? `${metrics.totalLayers} layers across ${metrics.rootLayers} root layers.`
          : 'Add at least one canvas layer.',
        ready: metrics.totalLayers > 0,
      },
      {
        label: 'Nested composition',
        detail: metrics.groupLayers > 0 || metrics.nestedLayers > 0
          ? `${metrics.groupLayers} editor groups and ${metrics.nestedLayers} nested child layers.`
          : 'Group sibling layers or nest them into containers for reusable components.',
        ready: metrics.groupLayers > 0 || metrics.nestedLayers > 0,
      },
      {
        label: 'Selection scope',
        detail: selectionCanCompose
          ? selectedIds.length > 1
            ? 'Selected layers share a valid compose/ungroup scope.'
            : 'No multi-layer composition issue in the current selection.'
          : 'Select unlocked sibling layers before grouping, aligning, duplicating, or deleting together.',
        ready: selectionCanCompose,
      },
      {
        label: 'Responsive handoff',
        detail: metrics.responsiveOverrideLayers > 0
          ? `${metrics.responsiveOverrideLayers} layers carry breakpoint overrides.`
          : 'Desktop geometry is the current source of truth.',
        ready: true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;
    const steps = [
      ...(metrics.totalLayers === 0 ? ['Add canvas layers before exporting a composition handoff.'] : []),
      ...(metrics.groupLayers === 0 && metrics.nestedLayers === 0 ? ['Use Cmd/Ctrl+G or nested containers to turn flat layers into reusable components.'] : []),
      ...(!selectionCanCompose ? ['Move selected layers into the same parent scope and unlock them before grouping or bulk editing.'] : []),
    ];

    return {
      schemaVersion: 'backy.editor-composition-readiness.v1',
      ready: readyCount === checks.length,
      readyCount,
      checkCount: checks.length,
      metrics: {
        ...metrics,
        topTypes,
      },
      selection: {
        selectedIds,
        selectedLayerCount: selectedIds.length,
        parentId: selectedParentId,
        shareParent: selectedEntriesShareParent,
        canGroup: canGroupSelected,
        canUngroup: canUngroupSelected,
        canSelectChildren: canSelectChildLayerScope,
      },
      shortcuts: {
        group: 'Cmd/Ctrl+G',
        ungroup: 'Shift+Cmd/Ctrl+G',
        selectSiblings: 'Cmd/Ctrl+A',
        selectChildren: 'Shift+Cmd/Ctrl+A',
        selectChild: 'Enter',
        selectParent: 'Shift+Enter',
      },
      checks,
      actionPlan: {
        schemaVersion: 'backy.editor-composition-action-plan.v1',
        status: readyCount === checks.length ? 'ready' : 'needs-composition-review',
        recommendedNextAction: readyCount === checks.length
          ? 'Reuse this grouped canvas tree in pages, posts, reusable sections, or custom frontend renderers.'
          : 'Resolve the listed composition steps before treating this canvas tree as a reusable component.',
        metrics: {
          totalLayers: metrics.totalLayers,
          rootLayers: metrics.rootLayers,
          groupLayers: metrics.groupLayers,
          nestedLayers: metrics.nestedLayers,
          childContainerLayers: metrics.childContainerLayers,
          responsiveOverrideLayers: metrics.responsiveOverrideLayers,
          hiddenLayers: metrics.hiddenLayers,
          lockedLayers: metrics.lockedLayers,
          maxDepth: metrics.maxDepth,
          topTypes,
        },
        selection: {
          selectedIds,
          selectedLayerCount: selectedIds.length,
          parentId: selectedParentId,
          shareParent: selectedEntriesShareParent,
          canGroup: canGroupSelected,
          canUngroup: canUngroupSelected,
          canSelectChildren: canSelectChildLayerScope,
        },
        shortcuts: {
          group: 'Cmd/Ctrl+G',
          ungroup: 'Shift+Cmd/Ctrl+G',
          selectSiblings: 'Cmd/Ctrl+A',
          selectChildren: 'Shift+Cmd/Ctrl+A',
          selectChild: 'Enter',
          selectParent: 'Shift+Enter',
        },
        steps,
      },
    };
  }, [
    canGroupSelected,
    canSelectChildLayerScope,
    canUngroupSelected,
    elements,
    selectedEntriesShareParent,
    selectedIds,
    selectedParentId,
  ]);
  const copyEditorCompositionPlan = useCallback(async () => {
    const plan = JSON.stringify(editorCompositionReadiness.actionPlan, null, 2);
    try {
      await navigator.clipboard.writeText(plan);
      setEditorNotice('Editor composition action plan copied.');
    } catch {
      setEditorNotice('Unable to copy the editor composition action plan.');
    }
  }, [editorCompositionReadiness.actionPlan]);

  const handleSelectedVisibilityToggle = useCallback(() => {
    if (!canToggleSelectedVisibility || selectedActiveElements.length === 0) return;
    const nextVisible = selectedActiveElements.every((element) => element.visible === false);

    updateElementsWithHistory((currentElements) => {
      let nextElements = currentElements;
      let changed = false;
      for (const id of selectedIds) {
        const result = updateElementById(nextElements, id, (element) => (
          element.locked ? element : applyUpdatesForBreakpoint(element, { visible: nextVisible }, breakpoint)
        ));
        if (result.updated) {
          nextElements = result.elements;
          changed = true;
        }
      }
      return changed ? nextElements : currentElements;
    }, selectedId, selectedIds);
  }, [breakpoint, canToggleSelectedVisibility, selectedActiveElements, selectedId, selectedIds, updateElementsWithHistory]);

  const handleSelectedLockToggle = useCallback(() => {
    if (selectedActiveElements.length === 0) return;
    const nextLocked = !selectedActiveElements.every((element) => element.locked === true);

    updateElementsWithHistory((currentElements) => {
      let nextElements = currentElements;
      let changed = false;
      for (const id of selectedIds) {
        const result = updateElementById(nextElements, id, (element) => (
          applyUpdatesForBreakpoint(element, { locked: nextLocked }, breakpoint)
        ));
        if (result.updated) {
          nextElements = result.elements;
          changed = true;
        }
      }
      return changed ? nextElements : currentElements;
    }, selectedId, selectedIds);
  }, [breakpoint, selectedActiveElements, selectedId, selectedIds, updateElementsWithHistory]);

  const handleSelectParentLayer = useCallback(() => {
    if (!selectedParentId) return;
    setSelectedId(selectedParentId);
    setSelectedIds([selectedParentId]);
  }, [selectedParentId]);

  const handleSelectFirstChildLayer = useCallback(() => {
    if (!selectableChildLayer) return;
    setSelectedId(selectableChildLayer.id);
    setSelectedIds([selectableChildLayer.id]);
  }, [selectableChildLayer]);

  const handleSelectChildLayerScope = useCallback(() => {
    if (selectableChildLayerIds.length === 0) {
      return;
    }

    setSelectedIds(selectableChildLayerIds);
    setSelectedId(selectableChildLayerIds[0] || null);
    setRightPanel(selectableChildLayerIds.length > 1 ? 'layers' : 'properties');
  }, [selectableChildLayerIds]);

  /**
   * Handle element selection
   */
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  const handleCanvasToggleSelect = useCallback((id: string) => {
    if (!findElementById(elements, id)) {
      return;
    }

    setSelectedIds((current) => {
      const nextIds = current.includes(id)
        ? current.filter((selected) => selected !== id)
        : [...current, id];

      setSelectedId(nextIds[0] ?? null);
      if (nextIds.length === 1) {
        setRightPanel('properties');
      } else if (nextIds.length > 1) {
        setRightPanel('layers');
      }

      return nextIds;
    });
  }, [elements, findElementById]);

  const handleCanvasSelectMany = useCallback((ids: string[]) => {
    const nextIds = Array.from(new Set(ids))
      .filter((id) => !!findElementById(elements, id));

    setSelectedId(nextIds[0] ?? null);
    setSelectedIds(nextIds);

    if (nextIds.length === 1) {
      setRightPanel('properties');
    } else if (nextIds.length > 1) {
      setRightPanel('layers');
    }
  }, [elements, findElementById]);

  const handleRefreshSelectedReusableSection = useCallback(() => {
    if (
      isCanvasMutationDisabled ||
      !selectedId ||
      !baseSelectedElement ||
      !selectedReusableSectionSource ||
      !selectedReusableSectionSource.content.elements.length
    ) {
      return;
    }

    const sectionRoots = selectedReusableSectionSource.content.elements;
    const sourceRoot = selectedReusableSectionMeta?.rootIndex !== undefined
      ? sectionRoots[selectedReusableSectionMeta.rootIndex]
      : selectedReusableSectionMeta?.sourceElementId
        ? sectionRoots.find((element) => element.id === selectedReusableSectionMeta.sourceElementId)
        : undefined;
    const sourceRootIndex = sourceRoot
      ? sectionRoots.findIndex((element) => element === sourceRoot)
      : 0;
    const refreshSourceElement = sourceRoot || sectionRoots[0];
    if (!refreshSourceElement) {
      return;
    }

    const selectedEntry = findElementEntry(elements, selectedId);
    if (!selectedEntry || selectedEntry.element.locked) {
      return;
    }

    const nextElement = cloneReusableSectionInstanceTree(
      refreshSourceElement,
      selectedReusableSectionSource,
      {
        rootId: selectedEntry.element.id,
        parentId: selectedEntry.parentId,
        x: selectedEntry.element.x,
        y: selectedEntry.element.y,
        zIndex: selectedEntry.element.zIndex || 1,
        rootIndex: sourceRootIndex >= 0 ? sourceRootIndex : undefined,
        sourceElementId: refreshSourceElement.id,
      },
    );

    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, selectedEntry.element.id, () => nextElement);
      return result.updated ? result.elements : currentElements;
    }, selectedEntry.element.id, [selectedEntry.element.id]);
    setSelectedId(selectedEntry.element.id);
    setSelectedIds([selectedEntry.element.id]);
    setEditorNotice(`Synced ${selectedReusableSectionSource.name} from the saved section source.`);
  }, [
    baseSelectedElement,
    cloneReusableSectionInstanceTree,
    elements,
    findElementEntry,
    isCanvasMutationDisabled,
    selectedId,
    selectedReusableSectionMeta,
    selectedReusableSectionSource,
    updateElementsWithHistory,
  ]);

  const handleDetachSelectedReusableSection = useCallback(() => {
    if (isCanvasMutationDisabled || !selectedId || !selectedReusableSectionMeta) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, selectedId, (element) => {
        const nextProps = { ...(element.props || {}) };
        delete nextProps.reusableSection;
        return {
          ...element,
          props: nextProps,
        };
      });
      return result.updated ? result.elements : currentElements;
    }, selectedId, [selectedId]);
    setSelectedId(selectedId);
    setSelectedIds([selectedId]);
    setEditorNotice('Reusable section instance detached. This copy can now be edited independently.');
  }, [isCanvasMutationDisabled, selectedId, selectedReusableSectionMeta, updateElementsWithHistory]);

  const handleSelectSiblingScope = useCallback(() => {
    if (selectableSiblingIds.length === 0) {
      return;
    }

    setSelectedIds(selectableSiblingIds);
    setSelectedId(selectableSiblingIds[0] || null);
    setRightPanel('layers');
  }, [selectableSiblingIds]);

  const cycleElementSelection = useCallback((direction: 1 | -1) => {
    const selectableIds = collectCyclableElementIds(displayedElements);
    if (selectableIds.length === 0) {
      setSelectedId(null);
      setSelectedIds([]);
      return;
    }

    const currentIndex = selectedId ? selectableIds.indexOf(selectedId) : -1;
    const nextIndex = currentIndex === -1
      ? direction === 1 ? 0 : selectableIds.length - 1
      : (currentIndex + direction + selectableIds.length) % selectableIds.length;
    const nextId = selectableIds[nextIndex] || null;

    setSelectedId(nextId);
    setSelectedIds(nextId ? [nextId] : []);
    if (nextId) {
      setRightPanel('properties');
    }
  }, [collectCyclableElementIds, displayedElements, selectedId]);

  /**
   * Handle elements change
   */
  const handleElementsChange = useCallback((
    newElements: CanvasElement[],
    options?: { transient?: boolean; commit?: boolean; selectedId?: string | null },
  ) => {
    if (isCanvasMutationDisabled) {
      pendingTransformRef.current = null;
      return;
    }

    if (isApplyingHistoryRef.current) {
      pendingTransformRef.current = null;
      return;
    }

    const nextBaseElements = mergeDisplayedElementsIntoBreakpoint(elementsRef.current, newElements, breakpoint);

    if (options?.transient) {
      pendingTransformRef.current = {
        elements: nextBaseElements,
        previousElements: pendingTransformRef.current?.previousElements || elementsRef.current,
        selectedId: options.selectedId ?? selectedId,
        selectedIds,
      };
      elementsRef.current = nextBaseElements;
      setElements(nextBaseElements);
      markChanges();
      return;
    }

    if (options?.commit) {
      const pendingTransform = pendingTransformRef.current;
      pendingTransformRef.current = null;
      if (!pendingTransform) {
        return;
      }

      const selectedSnapshot = pendingTransform.selectedId;
      const selectedIdsSnapshot = pendingTransform.selectedIds;
      elementsRef.current = pendingTransform.elements;
      setElements(pendingTransform.elements);
      addToHistory(pendingTransform.elements, selectedSnapshot, selectedIdsSnapshot, pendingTransform.previousElements);
      markChanges();
      return;
    }

    pendingTransformRef.current = null;
    updateElementsWithHistory(nextBaseElements);
  }, [addToHistory, breakpoint, isCanvasMutationDisabled, markChanges, selectedId, selectedIds, updateElementsWithHistory]);

  /**
   * Handle element update from property panel
   */
  const handleElementUpdate = useCallback(
    (updates: { [key: string]: unknown }) => {
      if (!selectedId) return;
      const selectedElementId = selectedId;
      updateElementsWithHistory((currentElements) => {
        const result = updateElementById(currentElements, selectedElementId, (element) => (
          element.locked ? element : applyUpdatesForBreakpoint(element, updates, breakpoint)
        ));

        if (!result.updated) {
          return currentElements;
        }

        return result.elements;
      }, selectedElementId);
    },
    [breakpoint, selectedId, updateElementsWithHistory]
  );

  const handleClearSelectedBreakpointOverride = useCallback(() => {
    if (!selectedId || breakpoint === 'desktop') {
      return;
    }

    const selectedElementId = selectedId;
    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, selectedElementId, (element) => {
        if (!element.responsive?.[breakpoint]) {
          return element;
        }

        const responsive = { ...element.responsive };
        delete responsive[breakpoint];
        const nextResponsive = pruneResponsiveOverrides(responsive);
        const nextElement: CanvasElement = {
          ...element,
          responsive: nextResponsive,
        };

        if (!nextResponsive) {
          delete nextElement.responsive;
        }

        return nextElement;
      });

      return result.updated ? result.elements : currentElements;
    }, selectedElementId);
  }, [breakpoint, selectedId, updateElementsWithHistory]);

  const handleClearSelectedBreakpointOverrideGroup = useCallback((group: BreakpointOverrideGroup) => {
    if (!selectedId || breakpoint === 'desktop') {
      return;
    }

    const selectedElementId = selectedId;
    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, selectedElementId, (element) => {
        const override = element.responsive?.[breakpoint];
        if (!override || !hasResponsiveOverrideGroup(override, group, element)) {
          return element;
        }

        return setResponsiveOverride(
          element,
          breakpoint,
          clearResponsiveOverrideGroup(override, group),
        );
      });

      return result.updated ? result.elements : currentElements;
    }, selectedElementId);
  }, [breakpoint, selectedId, updateElementsWithHistory]);

  const nudgeSelectedElement = useCallback((deltaX: number, deltaY: number) => {
    if (!selectedId) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const primaryEntry = findElementEntry(currentElements, selectedId);
      if (!primaryEntry || primaryEntry.element.locked) {
        return currentElements;
      }

      const nudgeEntries = (selectedIds.length > 1
        ? selectedIds
            .map((id) => findElementEntry(currentElements, id))
            .filter((entry): entry is { element: CanvasElement; parentId: string | null } => (
              !!entry &&
              entry.parentId === primaryEntry.parentId &&
              !entry.element.locked &&
              entry.element.visible !== false
            ))
        : [primaryEntry]
      );

      if (nudgeEntries.length === 0) {
        return currentElements;
      }

      const parentBounds = primaryEntry.parentId
        ? findElementEntry(currentElements, primaryEntry.parentId)?.element
        : null;
      const boundsWidth = parentBounds?.width ?? size.width;
      const boundsHeight = parentBounds?.height ?? size.height;
      const minX = Math.min(...nudgeEntries.map((entry) => entry.element.x));
      const minY = Math.min(...nudgeEntries.map((entry) => entry.element.y));
      const maxX = Math.max(...nudgeEntries.map((entry) => entry.element.x + entry.element.width));
      const maxY = Math.max(...nudgeEntries.map((entry) => entry.element.y + entry.element.height));
      const targetMinX = deltaX === 0 ? minX : snapEditorValue(minX + deltaX);
      const targetMinY = deltaY === 0 ? minY : snapEditorValue(minY + deltaY);
      const clampedDeltaX = Math.max(0, Math.min(targetMinX, Math.max(0, boundsWidth - (maxX - minX)))) - minX;
      const clampedDeltaY = Math.max(0, Math.min(targetMinY, Math.max(0, boundsHeight - (maxY - minY)))) - minY;

      if (clampedDeltaX === 0 && clampedDeltaY === 0) {
        return currentElements;
      }

      let nextElements = currentElements;
      for (const entry of nudgeEntries) {
        const result = updateElementById(nextElements, entry.element.id, (element) => ({
          ...element,
          x: element.x + clampedDeltaX,
          y: element.y + clampedDeltaY,
        }));

        nextElements = result.updated ? result.elements : nextElements;
      }

      return nextElements;
    }, selectedId);
  }, [findElementEntry, selectedId, selectedIds, size.height, size.width, snapEditorValue, updateElementsWithHistory]);

  const alignSelectedElement = useCallback((alignment: CanvasAlignment) => {
    if (!selectedId) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const primaryEntry = findElementEntry(currentElements, selectedId);
      if (!primaryEntry || primaryEntry.element.locked) {
        return currentElements;
      }

      const alignEntries = (selectedIds.length > 1
        ? selectedIds
            .map((id) => findElementEntry(currentElements, id))
            .filter((entry): entry is { element: CanvasElement; parentId: string | null } => (
              !!entry &&
              entry.parentId === primaryEntry.parentId &&
              !entry.element.locked &&
              entry.element.visible !== false
            ))
        : [primaryEntry]
      );

      if (alignEntries.length === 0) {
        return currentElements;
      }

      const parentBounds = primaryEntry.parentId
        ? findElementEntry(currentElements, primaryEntry.parentId)?.element
        : null;
      const boundsWidth = parentBounds?.width ?? size.width;
      const boundsHeight = parentBounds?.height ?? size.height;
      const minX = Math.min(...alignEntries.map((entry) => entry.element.x));
      const minY = Math.min(...alignEntries.map((entry) => entry.element.y));
      const maxX = Math.max(...alignEntries.map((entry) => entry.element.x + entry.element.width));
      const maxY = Math.max(...alignEntries.map((entry) => entry.element.y + entry.element.height));
      const groupWidth = maxX - minX;
      const groupHeight = maxY - minY;
      let groupDeltaX = 0;
      let groupDeltaY = 0;

      if (alignEntries.length === 1) {
        const selected = alignEntries[0].element;
        const nextX = alignment === 'left'
          ? 0
          : alignment === 'center'
            ? snapEditorValue((boundsWidth - selected.width) / 2)
            : alignment === 'right'
              ? Math.max(0, boundsWidth - selected.width)
              : selected.x;
        const nextY = alignment === 'top'
          ? 0
          : alignment === 'middle'
            ? snapEditorValue((boundsHeight - selected.height) / 2)
            : alignment === 'bottom'
              ? Math.max(0, boundsHeight - selected.height)
              : selected.y;
        groupDeltaX = nextX - selected.x;
        groupDeltaY = nextY - selected.y;
      } else {
        const centerX = minX + groupWidth / 2;
        const centerY = minY + groupHeight / 2;
        let didAlign = false;
        let nextElements = currentElements;

        for (const entry of alignEntries) {
          const nextX = alignment === 'left'
            ? minX
            : alignment === 'center'
              ? centerX - entry.element.width / 2
              : alignment === 'right'
                ? maxX - entry.element.width
                : entry.element.x;
          const nextY = alignment === 'top'
            ? minY
            : alignment === 'middle'
              ? centerY - entry.element.height / 2
              : alignment === 'bottom'
                ? maxY - entry.element.height
                : entry.element.y;

          if (Math.abs(nextX - entry.element.x) <= 0.5 && Math.abs(nextY - entry.element.y) <= 0.5) {
            continue;
          }

          didAlign = true;
          const result = updateElementById(nextElements, entry.element.id, (element) => ({
            ...element,
            x: nextX,
            y: nextY,
          }));
          nextElements = result.updated ? result.elements : nextElements;
        }

        return didAlign ? nextElements : currentElements;
      }

      if (groupDeltaX === 0 && groupDeltaY === 0) {
        return currentElements;
      }

      let nextElements = currentElements;
      for (const entry of alignEntries) {
        const result = updateElementById(nextElements, entry.element.id, (element) => ({
          ...element,
          x: element.x + groupDeltaX,
          y: element.y + groupDeltaY,
        }));

        nextElements = result.updated ? result.elements : nextElements;
      }

      return nextElements;
    }, selectedId);
  }, [findElementEntry, selectedId, selectedIds, size.height, size.width, snapEditorValue, updateElementsWithHistory]);

  const distributeSelectedElements = useCallback((axis: CanvasDistribution) => {
    if (!selectedId) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const primaryEntry = findElementEntry(currentElements, selectedId);
      if (!primaryEntry) {
        return currentElements;
      }

      const distributeEntries = selectedIds
        .map((id) => findElementEntry(currentElements, id))
        .filter((entry): entry is { element: CanvasElement; parentId: string | null } => (
          !!entry &&
          entry.parentId === primaryEntry.parentId &&
          !entry.element.locked &&
          entry.element.visible !== false
        ));

      if (distributeEntries.length < 3) {
        return currentElements;
      }

      const sortedEntries = [...distributeEntries].sort((left, right) => (
        axis === 'horizontal'
          ? (left.element.x + left.element.width / 2) - (right.element.x + right.element.width / 2)
          : (left.element.y + left.element.height / 2) - (right.element.y + right.element.height / 2)
      ));
      const first = sortedEntries[0].element;
      const last = sortedEntries[sortedEntries.length - 1].element;
      const startCenter = axis === 'horizontal'
        ? first.x + first.width / 2
        : first.y + first.height / 2;
      const endCenter = axis === 'horizontal'
        ? last.x + last.width / 2
        : last.y + last.height / 2;
      const centerStep = (endCenter - startCenter) / (sortedEntries.length - 1);

      if (!Number.isFinite(centerStep)) {
        return currentElements;
      }

      let didMove = false;
      let nextElements = currentElements;

      sortedEntries.forEach((entry, index) => {
        const sizeForAxis = axis === 'horizontal' ? entry.element.width : entry.element.height;
        const nextCenter = startCenter + centerStep * index;
        const nextPosition = normalizeDistributedPosition(nextCenter - sizeForAxis / 2);

        const currentPosition = axis === 'horizontal' ? entry.element.x : entry.element.y;
        if (Math.abs(nextPosition - currentPosition) <= 0.5) {
          return;
        }

        didMove = true;
        const result = updateElementById(nextElements, entry.element.id, (element) => (
          axis === 'horizontal'
            ? { ...element, x: nextPosition }
            : { ...element, y: nextPosition }
        ));
        nextElements = result.updated ? result.elements : nextElements;
      });

      return didMove ? nextElements : currentElements;
    }, selectedId, selectedIds);
  }, [findElementEntry, selectedId, selectedIds, updateElementsWithHistory]);

  /**
   * Handle drag start from component library
   */
  const handleDragStart = useCallback((item: ComponentLibraryItem) => {
    setLibraryDragItem(item);
  }, []);

  const handleLibraryDragEnd = useCallback(() => {
    setLibraryDragItem(null);
  }, []);

  const getViewportInsertionPoint = useCallback(() => {
    const canvas = canvasViewportRef.current?.querySelector<HTMLElement>('[data-testid="editor-canvas"]');
    const viewport = canvasViewportRef.current;
    if (!canvas || !viewport) {
      return { x: 80, y: 80 };
    }

    const canvasRect = canvas.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const visibleLeft = Math.max(canvasRect.left, viewportRect.left);
    const visibleRight = Math.min(canvasRect.right, viewportRect.right);
    const visibleTop = Math.max(canvasRect.top, viewportRect.top);
    const visibleBottom = Math.min(canvasRect.bottom, viewportRect.bottom);
    const midpointX = visibleLeft < visibleRight ? (visibleLeft + visibleRight) / 2 : canvasRect.left + 120;
    const midpointY = visibleTop < visibleBottom ? (visibleTop + visibleBottom) / 2 : canvasRect.top + 120;

    return {
      x: snapEditorValue((midpointX - canvasRect.left) / activeCanvasScale),
      y: snapEditorValue((midpointY - canvasRect.top) / activeCanvasScale),
    };
  }, [activeCanvasScale, snapEditorValue]);

  const addLibraryItemToCanvas = useCallback((item: ComponentLibraryItem, x: number, y: number) => {
    if (isCanvasMutationDisabled) {
      return;
    }

    const normalizedType = normalizeElementType(item.type);
    const highestZ = Math.max(walkTreeMaxZ(elements), 0);
    const selectedElement = selectedId ? findElementById(elements, selectedId) : null;
    const canNestInSelection = selectedElement && !selectedElement.locked && canAcceptNestedDrop(selectedElement.type);
    const nestedInsertionPoint = getNestedInsertionPoint();

    if (item.reusableContent?.elements?.length) {
      const newElements = createCanvasElementsFromReusableContent(
        item.reusableContent,
        canNestInSelection ? nestedInsertionPoint.x : x,
        canNestInSelection ? nestedInsertionPoint.y : y,
        highestZ + 1,
      );
      if (!newElements.length) {
        return;
      }

      if (canNestInSelection) {
        let nextElements = elements;
        let inserted = false;
        for (const child of newElements) {
          const result = insertElementAsChild(nextElements, selectedElement.id, child);
          nextElements = result.elements;
          inserted = inserted || result.updated;
        }

        if (inserted) {
          updateElementsWithHistory(nextElements, newElements[0].id);
          setSelectedId(newElements[0].id);
          setSelectedIds([newElements[0].id]);
          setRightPanel('properties');
        }
        return;
      }

      updateElementsWithHistory([...elements, ...newElements], newElements[0].id);
      setSelectedId(newElements[0].id);
      setSelectedIds([newElements[0].id]);
      setRightPanel('properties');
      return;
    }

    const newElement = {
      ...createCanvasElementFromLibraryItem(
        { ...item, type: normalizedType },
        canNestInSelection ? nestedInsertionPoint.x : x,
        canNestInSelection ? nestedInsertionPoint.y : y,
      ),
      zIndex: highestZ + 1,
    };

    if (canNestInSelection) {
      const result = insertElementAsChild(elements, selectedElement.id, newElement);
      if (result.updated) {
        updateElementsWithHistory(result.elements, newElement.id);
        setSelectedId(newElement.id);
        setSelectedIds([newElement.id]);
        setRightPanel('properties');
      }
      return;
    }

    updateElementsWithHistory([...elements, newElement], newElement.id);
    setSelectedId(newElement.id);
    setSelectedIds([newElement.id]);
    setRightPanel('properties');
  }, [elements, findElementById, getNestedInsertionPoint, isCanvasMutationDisabled, selectedId, updateElementsWithHistory]);

  const handleAddLibraryItem = useCallback((item: ComponentLibraryItem) => {
    if (isCanvasMutationDisabled) {
      return;
    }

    const point = getViewportInsertionPoint();
    addLibraryItemToCanvas(item, point.x, point.y);
  }, [addLibraryItemToCanvas, getViewportInsertionPoint, isCanvasMutationDisabled]);

  const handleSaveSelectionAsReusableSection = useCallback(() => {
    if (!canEdit) {
      setEditorNotice(editDisabledReason);
      return;
    }
    if (!activeSiteId || !selectedId || isSavingReusableSection) {
      return;
    }

    const selectedElement = findElementById(elements, selectedId);
    if (!selectedElement) {
      return;
    }

    const fallbackName = selectedElement.name || `${selectedElement.type} section`;
    setReusableSectionDraft({
      mode: 'save',
      name: fallbackName,
      sourceElementId: selectedElement.id,
    });
  }, [
    activeSiteId,
    canEdit,
    editDisabledReason,
    elements,
    findElementById,
    isSavingReusableSection,
    selectedId,
  ]);

  const confirmReusableSectionDraft = useCallback(async () => {
    if (!canEdit) {
      setEditorNotice(editDisabledReason);
      return;
    }
    if (!activeSiteId || !reusableSectionDraft || isSavingReusableSection) {
      return;
    }

    const name = reusableSectionDraft.name.trim();
    if (!name) {
      return;
    }

    setIsSavingReusableSection(true);
    setEditorNotice(null);

    try {
      if (reusableSectionDraft.mode === 'save') {
        const selectedElement = reusableSectionDraft.sourceElementId
          ? findElementById(elements, reusableSectionDraft.sourceElementId)
          : null;

        if (!selectedElement) {
          setEditorNotice('Select an element before saving it as a reusable section.');
          return;
        }

        const root = toReusableTemplateElement(selectedElement);
        const section = await createReusableSection(activeSiteId, {
          name,
          category: selectedElement.type === 'section' ? 'layout' : 'saved',
          tags: [mode, selectedElement.type],
          sourceElementId: selectedElement.id,
          content: {
            canvasSize: {
              width: root.width,
              height: root.height,
            },
            elements: [root],
          },
          createdBy: 'admin',
          updatedBy: 'admin',
        });
        setReusableSections((current) => [section, ...current.filter((item) => item.id !== section.id)]);
      } else if (reusableSectionDraft.sectionId) {
        const section = reusableSections.find((item) => item.id === reusableSectionDraft.sectionId);
        if (!section || section.name === name) {
          setReusableSectionDraft(null);
          return;
        }

        const updated = await updateReusableSection(activeSiteId, reusableSectionDraft.sectionId, {
          name,
          updatedBy: 'admin',
        });
        setReusableSections((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }

      setReusableSectionDraft(null);
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to save reusable section');
    } finally {
      setIsSavingReusableSection(false);
    }
  }, [
    activeSiteId,
    canEdit,
    editDisabledReason,
    elements,
    findElementById,
    isSavingReusableSection,
    mode,
    reusableSectionDraft,
    reusableSections,
    toReusableTemplateElement,
  ]);

  const handleRenameReusableSection = useCallback((sectionId: string) => {
    if (!canEdit) {
      setEditorNotice(editDisabledReason);
      return;
    }
    if (!activeSiteId) {
      return;
    }

    const section = reusableSections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }

    setReusableSectionDraft({
      mode: 'rename',
      name: section.name,
      sectionId,
    });
  }, [activeSiteId, canEdit, editDisabledReason, reusableSections]);

  const confirmDeleteReusableSection = useCallback(async (sectionId: string) => {
    if (!canDeleteReusableSections) {
      setEditorNotice(reusableDeleteDisabledReason || 'You do not have permission to delete reusable sections.');
      return;
    }
    if (!activeSiteId) {
      return;
    }

    const section = reusableSections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }

    try {
      await deleteReusableSection(activeSiteId, sectionId);
      setReusableSections((current) => current.filter((item) => item.id !== sectionId));
      setPendingDeleteReusableSection(null);
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to delete reusable section');
    }
  }, [activeSiteId, canDeleteReusableSections, reusableDeleteDisabledReason, reusableSections]);

  const handleDeleteReusableSection = useCallback((sectionId: string) => {
    if (!canDeleteReusableSections) {
      setEditorNotice(reusableDeleteDisabledReason || 'You do not have permission to delete reusable sections.');
      return;
    }
    const section = reusableSections.find((item) => item.id === sectionId);
    if (section) {
      setPendingDeleteReusableSection(section);
    }
  }, [canDeleteReusableSections, reusableDeleteDisabledReason, reusableSections]);

  /**
   * Handle canvas drop
   */
  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setLibraryDragItem(null);
      if (isCanvasMutationDisabled) {
        return;
      }

      try {
        const data = e.dataTransfer.getData('application/json');
        const item: ComponentLibraryItem = JSON.parse(data);
        const normalizedType = normalizeElementType(item.type);

        const canvas = canvasViewportRef.current?.querySelector<HTMLElement>('[data-testid="editor-canvas"]');
        if (!canvas) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const isInsideCanvas =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        if (!isInsideCanvas) {
          return;
        }

        const x = snapEditorValue((e.clientX - rect.left) / activeCanvasScale);
        const y = snapEditorValue((e.clientY - rect.top) / activeCanvasScale);

        if (item.reusableContent?.elements?.length) {
          addLibraryItemToCanvas(item, x, y);
          return;
        }

        addLibraryItemToCanvas({ ...item, type: normalizedType }, x, y);
      } catch (err) {
        console.error('Failed to drop element:', err);
      }
    },
    [activeCanvasScale, addLibraryItemToCanvas, isCanvasMutationDisabled, snapEditorValue]
  );

  /**
   * Delete selected element
   */
  const deleteElement = useCallback(() => {
    if (isCanvasMutationDisabled) return;

    const currentElements = elementsRef.current;
    const entries = getSelectedSiblingEntries(currentElements, { requireUnlocked: true });
    if (entries.length === 0) return;

    let nextElements = currentElements;
    let parentSelection: string | null = entries[0]?.parentId ?? null;
    let removed = false;
    for (const entry of entries) {
      const result = removeElementById(nextElements, entry.element.id);
      if (!result.updated) continue;

      nextElements = result.elements;
      parentSelection = result.removedParentId || parentSelection;
      removed = true;
    }

    if (!removed) return;

    setSelectedIds(parentSelection ? [parentSelection] : []);
    setSelectedId(parentSelection);
    updateElementsWithHistory(nextElements, parentSelection, parentSelection ? [parentSelection] : []);
  }, [getSelectedSiblingEntries, isCanvasMutationDisabled, updateElementsWithHistory]);

  const handleCut = useCallback(() => {
    if (isCanvasMutationDisabled) return;

    const entries = getSelectedSiblingEntries(elements, { requireUnlocked: true });
    if (entries.length === 0) return;

    setClipboardElements(entries.map((entry) => JSON.parse(JSON.stringify(entry.element)) as CanvasElement));

    let nextElements = elements;
    let parentSelection: string | null = entries[0]?.parentId ?? null;
    let removed = false;
    for (const entry of entries) {
      const result = removeElementById(nextElements, entry.element.id);
      if (!result.updated) continue;

      nextElements = result.elements;
      parentSelection = result.removedParentId || parentSelection;
      removed = true;
    }

    if (!removed) return;

    setSelectedIds(parentSelection ? [parentSelection] : []);
    setSelectedId(parentSelection);
    updateElementsWithHistory(nextElements, parentSelection, parentSelection ? [parentSelection] : []);
  }, [elements, getSelectedSiblingEntries, isCanvasMutationDisabled, updateElementsWithHistory]);

  /**
   * Handle save
   */
  const handleSaveWrapper = useCallback(async (settingsOverride?: PageSettings, silent = false) => {
    if (isSaving) {
      return false;
    }
    if (isParentPersistence) {
      setAutosaveDueAt(null);
      setSaveStatus(hasUnsavedChanges ? 'dirty' : 'saved');
      if (!silent) {
        setEditorNotice(`Use the ${normalizedSaveOwnerLabel} save action to persist canvas changes.`);
      }
      return false;
    }
    if (!canEdit) {
      setSaveStatus('error');
      setLastSaveError(editDisabledReason);
      setAutosaveDueAt(null);
      if (!silent) {
        setEditorNotice(editDisabledReason);
      }
      return false;
    }

    const saveSequence = changeSequenceRef.current;
    const nextSettings = settingsOverride ?? pageSettings;
    const validationMessage = validateSettings?.(nextSettings) || null;
    if (validationMessage) {
      setHasUnsavedChanges(true);
      setSaveStatus('error');
      setLastSaveError(validationMessage);
      setAutosaveDueAt(null);
      if (!silent) {
        setEditorNotice(validationMessage);
      }
      return false;
    }

    if (!silent && autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
      setAutosaveDueAt(null);
    }

    setIsSaving(true);
    setSaveStatus(silent ? 'autosaving' : 'saving');
    try {
      await Promise.resolve(onSave(elementsRef.current, nextSettings, size));
      if (changeSequenceRef.current === saveSequence) {
        setHasUnsavedChanges(false);
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        setLastSaveMode(silent ? 'autosave' : 'manual');
        setPendingChangeCount(0);
        setAutosaveDueAt(null);
        setLastSaveError(null);
      } else {
        setSaveStatus('dirty');
        setAutosaveDueAt(new Date(Date.now() + 2000));
      }
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Unable to save page. Please try again.';
      setHasUnsavedChanges(true);
      setSaveStatus('error');
      setLastSaveError(message);
      setAutosaveDueAt(null);
      if (!silent) {
        setEditorNotice(message);
      } else {
        console.error('Auto-save failed');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, editDisabledReason, hasUnsavedChanges, isParentPersistence, isSaving, normalizedSaveOwnerLabel, onSave, pageSettings, size, validateSettings]);

  const handleSettingsSave = useCallback(async (newSettings: PageSettings) => {
    if (!canEdit) {
      setEditorNotice(editDisabledReason);
      throw new Error(editDisabledReason);
    }
    const publicationStateChanging = pageSettings.status !== newSettings.status
      && (
        pageSettings.status === 'published' ||
        pageSettings.status === 'scheduled' ||
        newSettings.status === 'published' ||
        newSettings.status === 'scheduled'
      );
    if (publicationStateChanging && !canPublish) {
      const message = publishDisabledReason || 'You do not have permission to change this page publication status.';
      setEditorNotice(message);
      throw new Error(message);
    }
    if ((newSettings.status === 'published' || newSettings.status === 'scheduled') && interactivePublishDisabledReason) {
      setEditorNotice(interactivePublishDisabledReason);
      throw new Error(interactivePublishDisabledReason);
    }

    const previousChangeSequence = changeSequenceRef.current;
    const previousPendingChangeCount = pendingChangeCount;
    const wasDirty = hasUnsavedChanges;
    markChanges();

    const saved = await handleSaveWrapper(newSettings, false);
    if (!saved) {
      if (changeSequenceRef.current === previousChangeSequence + 1) {
        changeSequenceRef.current = previousChangeSequence;
        setPendingChangeCount(previousPendingChangeCount);
        setHasUnsavedChanges(wasDirty);
      }
      throw new Error('Unable to save page settings. Changes were not persisted.');
    }

    setPageSettings(newSettings);
  }, [
    canEdit,
    canPublish,
    editDisabledReason,
    handleSaveWrapper,
    hasUnsavedChanges,
    interactivePublishDisabledReason,
    markChanges,
    pageSettings.status,
    pendingChangeCount,
    publishDisabledReason,
  ]);

  const handleTogglePublish = useCallback(async () => {
    if (!canEdit) {
      setEditorNotice(editDisabledReason);
      return;
    }
    const previousSettings = pageSettings;
    const wasDirty = hasUnsavedChanges;
    const nextStatus = pageSettings.status === 'published' ? 'draft' : 'published';
    if (!canPublish) {
      setEditorNotice(publishDisabledReason || 'You do not have permission to change this page publication status.');
      return;
    }
    if (nextStatus === 'published' && effectivePublishDisabled) {
      setEditorNotice(effectivePublishDisabledReason || 'Resolve page readiness issues before publishing.');
      return;
    }

    const nextSettings: PageSettings = {
      ...pageSettings,
      status: nextStatus,
    };
    setPageSettings(nextSettings);
    markChanges();
    const saved = await handleSaveWrapper(nextSettings, false);
    if (!saved) {
      setPageSettings(previousSettings);
      setHasUnsavedChanges(wasDirty);
    }
  }, [canEdit, canPublish, editDisabledReason, effectivePublishDisabled, effectivePublishDisabledReason, handleSaveWrapper, hasUnsavedChanges, pageSettings, markChanges]);

  const performReload = useCallback(() => {
    const nextElements = getInitialElements();
    const nextSettings = getInitialSettings();

    elementsRef.current = nextElements;
    setElements(nextElements);
    setPageSettings(nextSettings);
    setSize(initialSize || DEFAULT_CANVAS_SIZE);
    setBreakpoint('desktop');
    setSelectedId(null);
    setClipboardElements([]);
    const nextHistory = [{ elements: nextElements, selectedId: null, selectedIds: [] }];
    historyRef.current = nextHistory;
    historyIndexRef.current = 0;
    setHistory(nextHistory);
    setHistoryIndex(0);
    setHasUnsavedChanges(false);
    setSaveStatus('saved');
    setPendingChangeCount(0);
    setAutosaveDueAt(null);
    setLastSaveError(null);
    changeSequenceRef.current += 1;
    setShowReloadConfirm(false);
    if (onChange) {
      onChange(nextElements, nextSettings, initialSize || DEFAULT_CANVAS_SIZE);
    }
  }, [getInitialElements, getInitialSettings, initialSize, onChange]);

  const handleReload = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (hasUnsavedChanges) {
      setShowReloadConfirm(true);
      return;
    }

    performReload();
  }, [hasUnsavedChanges, isSaving, performReload]);

  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSaving && ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) {
        e.preventDefault();
        return;
      }

      const key = e.key.toLowerCase();
      if (shouldIgnoreEditorShortcut(e.target)) {
        return;
      }

      if (isSaving) {
        return;
      }

      if (isPreview) {
        if ((e.ctrlKey || e.metaKey) && key === 's') {
          e.preventDefault();
          if (!canEdit) {
            setEditorNotice(editDisabledReason);
            return;
          }
          void handleSaveWrapper();
        }
        return;
      }

      const isZoomInShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && (
        key === '+' ||
        key === '=' ||
        e.code === 'Equal' ||
        e.code === 'NumpadAdd'
      );
      const isZoomOutShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && (
        key === '-' ||
        e.code === 'Minus' ||
        e.code === 'NumpadSubtract'
      );
      const isFitCanvasShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && (
        key === '0' ||
        e.code === 'Digit0' ||
        e.code === 'Numpad0'
      );
      if (isZoomInShortcut || isZoomOutShortcut || isFitCanvasShortcut) {
        e.preventDefault();
        if (isZoomOutShortcut) {
          handleZoomOut();
          return;
        }
        if (isFitCanvasShortcut) {
          handleFitCanvas();
          return;
        }
        handleZoomIn();
        return;
      }

      if (key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleCanvasPanMode();
        return;
      }

      if (key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleGridVisibility();
        return;
      }

      if (key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleSnap();
        return;
      }

      if (key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleComponentPanel();
        return;
      }

      if (key === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleInspectorPanel();
        return;
      }

      if (key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleLayersPanel();
        return;
      }

      if (key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleCanvasFocus();
        return;
      }

      const isLayerOrderShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && (
        e.code === 'BracketLeft' ||
        e.code === 'BracketRight' ||
        key === '[' ||
        key === ']'
      );
      const isMutationShortcut =
        e.key.startsWith('Arrow') ||
        e.key === 'Delete' ||
        e.key === 'Backspace' ||
        isLayerOrderShortcut ||
        ((e.ctrlKey || e.metaKey) && ['x', 'v', 'd', 'g', 'y', 'z'].includes(key));
      if (!canEdit && isMutationShortcut) {
        e.preventDefault();
        setEditorNotice(editDisabledReason);
        return;
      }

      // Tab / Shift+Tab (Cycle canvas element selection)
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        cycleElementSelection(e.shiftKey ? -1 : 1);
        return;
      }

      // Escape (Deselect canvas elements)
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
        setSelectedIds([]);
        return;
      }

      // Enter / Shift+Enter (Drill into a child layer / select parent layer)
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.shiftKey) {
          if (canSelectParentLayer) {
            e.preventDefault();
            handleSelectParentLayer();
          }
          return;
        }

        if (canSelectChildLayer) {
          e.preventDefault();
          handleSelectFirstChildLayer();
        }
        return;
      }

      // Ctrl+A / Cmd+A (Select all unlocked siblings in the active canvas scope)
      // Shift+Ctrl+A / Shift+Cmd+A (Select direct child layers of the selected container/group)
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        if (e.shiftKey && canSelectChildLayerScope) {
          handleSelectChildLayerScope();
          return;
        }

        handleSelectSiblingScope();
        return;
      }

      if (e.key.startsWith('Arrow')) {
        const step = snapEnabled ? safeEditorGridSize : e.shiftKey ? 10 : 1;
        const deltaByKey: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const delta = deltaByKey[e.key];
        if (delta) {
          e.preventDefault();
          nudgeSelectedElement(delta[0], delta[1]);
        }
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteElement();
        return;
      }

      // Ctrl+S / Cmd+S (Save)
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        if (!canEdit) {
          setEditorNotice(editDisabledReason);
          return;
        }
        void handleSaveWrapper();
        return;
      }

      // Cmd/Ctrl+[ and Cmd/Ctrl+] (Layer order), Shift sends to back/front.
      if (isLayerOrderShortcut) {
        e.preventDefault();
        const isBackward = e.code === 'BracketLeft' || key === '[';
        handleZOrderChange(isBackward
          ? e.shiftKey ? 'back' : 'backward'
          : e.shiftKey ? 'front' : 'forward');
        return;
      }

      // Ctrl+Y / Cmd+Y or Shift+Ctrl+Z / Shift+Cmd+Z (Redo)
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl+Z / Cmd+Z (Undo)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+C / Cmd+C (Copy)
      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Ctrl+X / Cmd+X (Cut)
      if ((e.ctrlKey || e.metaKey) && key === 'x') {
        e.preventDefault();
        handleCut();
        return;
      }

      // Ctrl+V / Cmd+V (Paste)
      if ((e.ctrlKey || e.metaKey) && key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Ctrl+D / Cmd+D (Duplicate)
      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // Ctrl+G / Cmd+G (Group), Shift+Ctrl+G / Shift+Cmd+G (Ungroup)
      if ((e.ctrlKey || e.metaKey) && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          handleUngroupSelected();
        } else {
          handleGroupSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);

  }, [
    deleteElement,
    handleSaveWrapper,
    handleUndo,
    handleRedo,
    handleCopy,
    handleCut,
    handlePaste,
    handleDuplicate,
    handleFitCanvas,
    handleZOrderChange,
    handleGroupSelected,
    handleUngroupSelected,
    handleToggleCanvasFocus,
    handleToggleCanvasPanMode,
    handleToggleComponentPanel,
    handleToggleGridVisibility,
    handleToggleInspectorPanel,
    handleToggleLayersPanel,
    handleToggleSnap,
    handleZoomIn,
    handleZoomOut,
    handleSelectFirstChildLayer,
    handleSelectChildLayerScope,
    handleSelectParentLayer,
    handleSelectSiblingScope,
    cycleElementSelection,
    nudgeSelectedElement,
    canSelectChildLayer,
    canSelectChildLayerScope,
    canSelectParentLayer,
    canEdit,
    editDisabledReason,
    isPreview,
    isSaving,
    safeEditorGridSize,
    snapEnabled,
  ]);



  /**
   * Handle breakpoint change
   */
  const handleBreakpointChange = useCallback(
    (bp: EditorBreakpoint) => {
      applyCanvasSize(BREAKPOINT_CANVAS_SIZE[bp], bp);
    },
    [applyCanvasSize]
  );

  useEffect(() => {
    if (!hasUnsavedChanges || isSaving || isParentPersistence) {
      setAutosaveDueAt(null);
      return;
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    const dueAt = new Date(Date.now() + EDITOR_AUTOSAVE_DELAY_MS);
    setAutosaveDueAt(dueAt);

    autosaveTimeoutRef.current = window.setTimeout(() => {
      void handleSaveWrapper(undefined, true);
    }, EDITOR_AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [handleSaveWrapper, hasUnsavedChanges, isParentPersistence, isSaving]);

  useEffect(() => () => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const container = canvasViewportRef.current;
    if (!container) return;

    const updateScale = () => {
      if (!isPreview) {
        setCanvasScale(1);
        return;
      }

      const availableWidth = Math.max(container.clientWidth - 64, 0);
      const availableHeight = Math.max(container.clientHeight - 64, 0);

      const widthScale = availableWidth / size.width;
      const heightScale = availableHeight / size.height;
      const nextScale = Math.min(1, widthScale, heightScale);

      setCanvasScale(Number.isFinite(nextScale) ? Math.max(0.25, nextScale) : 1);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isPreview, size.width, size.height]);

  useEffect(() => {
    if (!isCanvasAutoFit || isPreview) {
      return;
    }

    const container = canvasViewportRef.current;
    if (!container) {
      return;
    }

    let frame = window.requestAnimationFrame(() => {
      applyFitCanvas();
    });

    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        applyFitCanvas();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);
    window.addEventListener('resize', scheduleFit);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleFit);
    };
  }, [
    applyFitCanvas,
    isCanvasAutoFit,
    isCanvasFocusMode,
    isPreview,
    showComponentPanel,
    showInspectorPanel,
  ]);

  useEffect(() => {
    if (!isCanvasFocusMode) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      handleFitCanvas();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [handleFitCanvas, isCanvasFocusMode, showComponentPanel, showInspectorPanel]);

  useEffect(() => {
    if (isPreview) {
      setIsCanvasPanMode(false);
      setIsCanvasSpacePanning(false);
      setIsCanvasPanning(false);
      canvasPanRef.current = null;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || shouldIgnoreEditorShortcut(event.target)) {
        return;
      }

      event.preventDefault();
      setIsCanvasSpacePanning(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') {
        return;
      }

      event.preventDefault();
      setIsCanvasSpacePanning(false);
      setIsCanvasPanning(false);
      canvasPanRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPreview]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const panState = canvasPanRef.current;
      const viewport = canvasViewportRef.current;
      if (!panState || !viewport) {
        return;
      }

      event.preventDefault();
      viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
      viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
    };

    const stopPanning = () => {
      if (!canvasPanRef.current) {
        return;
      }

      canvasPanRef.current = null;
      setIsCanvasPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopPanning);
    window.addEventListener('blur', stopPanning);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopPanning);
      window.removeEventListener('blur', stopPanning);
    };
  }, []);

  return (
    <ActiveEditorProvider>
      <div className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-950", className || "fixed inset-0")}>
        {/* Header */}
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          {/* Left */}
          {!hideNavigation ? (
            <div className="flex shrink-0 items-center gap-4">
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-md hover:bg-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div>
                <h1 className="font-semibold">Edit {editorEntityLabel}</h1>
                <p className="text-xs text-slate-500">{pageSettings.title || 'Untitled'}</p>
              </div>

              {hasUnsavedChanges && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                  Unsaved changes
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold',
                  saveStatusMeta.className,
                )}
                data-testid="editor-save-status"
                data-save-state={saveStatus}
                data-save-mode={lastSaveMode || ''}
                data-save-persistence={savePersistence}
                data-pending-changes={pendingChangeCount}
                data-last-saved-at={lastSavedAt?.toISOString() || ''}
                data-last-error={lastSaveError || ''}
                title={saveStatusMeta.detail}
              >
                <span className={cn('size-1.5 rounded-full bg-current', (isSaving || saveStatus === 'autosaving') && 'animate-pulse')} aria-hidden="true" />
                {saveStatusMeta.label}
              </span>
            </div>
          ) : (
            <div
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm',
                saveStatusMeta.className,
              )}
              data-testid="editor-save-status"
              data-save-state={saveStatus}
              data-save-mode={lastSaveMode || ''}
              data-save-persistence={savePersistence}
              data-pending-changes={pendingChangeCount}
              data-last-saved-at={lastSavedAt?.toISOString() || ''}
              data-last-error={lastSaveError || ''}
              title={saveStatusMeta.detail}
            >
              <span className={cn('size-2 rounded-full bg-current', (isSaving || saveStatus === 'autosaving') && 'animate-pulse')} aria-hidden="true" />
              <span>{saveStatusMeta.label}</span>
              <span className="hidden font-medium opacity-75 xl:inline">{saveStatusMeta.detail}</span>
            </div>
          )}

          {/* Center - Canvas controls */}
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => handleBreakpointChange('desktop')}
                disabled={isCanvasMutationDisabled}
                className={cn(
                  'p-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  breakpoint === 'desktop'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70'
                )}
                title={canEdit ? 'Desktop' : editDisabledReason}
                aria-label="Desktop canvas"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleBreakpointChange('tablet')}
                disabled={isCanvasMutationDisabled}
                className={cn(
                  'p-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  breakpoint === 'tablet'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70'
                )}
                title={canEdit ? 'Tablet' : editDisabledReason}
                aria-label="Tablet canvas"
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleBreakpointChange('mobile')}
                disabled={isCanvasMutationDisabled}
                className={cn(
                  'p-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  breakpoint === 'mobile'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70'
                )}
                title={canEdit ? 'Mobile' : editDisabledReason}
                aria-label="Mobile canvas"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
            <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-sm xl:flex">
              <select
                value={activeCanvasPresetId}
                onChange={(event) => handleCanvasPresetChange(event.target.value)}
                disabled={isCanvasMutationDisabled}
                title={canEdit ? undefined : editDisabledReason}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Canvas size preset"
              >
                <option value="custom">Custom</option>
                {CANVAS_SIZE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={MIN_CANVAS_DIMENSION}
                max={MAX_CANVAS_DIMENSION}
                step={10}
                value={size.width}
                onChange={(event) => handleCanvasDimensionInput('width', event.target.value)}
                disabled={isCanvasMutationDisabled}
                title={canEdit ? undefined : editDisabledReason}
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Canvas width"
              />
              <span className="text-slate-400">x</span>
              <input
                type="number"
                min={MIN_CANVAS_DIMENSION}
                max={MAX_CANVAS_DIMENSION}
                step={10}
                value={size.height}
                onChange={(event) => handleCanvasDimensionInput('height', event.target.value)}
                disabled={isCanvasMutationDisabled}
                title={canEdit ? undefined : editDisabledReason}
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Canvas height"
              />
            </div>
          </div>

          {/* Right */}
          <div className="flex min-w-max shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {/* Undo/Redo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={isCanvasMutationDisabled || historyIndex <= 0}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Undo (Cmd/Ctrl+Z)"
              aria-label="Undo"
              aria-keyshortcuts="Control+Z Meta+Z"
              data-testid="editor-undo"
            >
              <Undo className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={isCanvasMutationDisabled || historyIndex >= history.length - 1}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Redo (Cmd/Ctrl+Y or Shift+Cmd/Ctrl+Z)"
              aria-label="Redo"
              aria-keyshortcuts="Control+Y Meta+Y Shift+Control+Z Shift+Meta+Z"
              data-testid="editor-redo"
            >
              <Redo className="h-4 w-4" />
            </button>

            {/* Clipboard actions */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={isCanvasMutationDisabled || !canCopySelected}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Copy ${selectedLayerActionLabel} (Cmd/Ctrl+C)`}
              aria-label={`Copy ${selectedLayerActionLabel}`}
              aria-keyshortcuts="Control+C Meta+C"
              data-testid="editor-copy-selection"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCut}
              disabled={isCanvasMutationDisabled || !canCutSelected}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Cut ${selectedLayerActionLabel} (Cmd/Ctrl+X)`}
              aria-label={`Cut ${selectedLayerActionLabel}`}
              aria-keyshortcuts="Control+X Meta+X"
              data-testid="editor-cut-selection"
            >
              <Scissors className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handlePaste}
              disabled={isCanvasMutationDisabled || clipboardElements.length === 0}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={`${pasteTargetLabel} (Cmd/Ctrl+V)`}
              aria-label={pasteTargetLabel}
              aria-keyshortcuts="Control+V Meta+V"
              data-paste-target={pasteTargetMode}
              data-paste-target-id={canPasteIntoSelectedContainer ? selectedElement?.id : undefined}
              data-clipboard-count={clipboardElements.length}
              data-testid="editor-paste-selection"
            >
              <ClipboardPaste className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={isCanvasMutationDisabled || !canDuplicateSelected}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Duplicate ${selectedLayerActionLabel} (Cmd/Ctrl+D)`}
              aria-label={`Duplicate ${selectedLayerActionLabel}`}
              aria-keyshortcuts="Control+D Meta+D"
              data-testid="editor-duplicate-selection"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSelectSiblingScope}
              disabled={isCanvasMutationDisabled || selectableSiblingIds.length < 2}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Select all sibling layers (Cmd/Ctrl+A)"
              aria-label="Select all sibling layers"
              aria-keyshortcuts="Control+A Meta+A"
              data-testid="editor-select-sibling-layers"
            >
              <CheckSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSelectChildLayerScope}
              disabled={isCanvasMutationDisabled || !canSelectChildLayerScope}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Select child layers (Shift+Cmd/Ctrl+A)"
              aria-label="Select child layers"
              aria-keyshortcuts="Shift+Control+A Shift+Meta+A"
              data-testid="editor-select-child-layers"
            >
              <Layers className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleGroupSelected}
              disabled={isCanvasMutationDisabled || !canGroupSelected}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Group selected layers (Cmd/Ctrl+G)"
              aria-label="Group selected layers"
              aria-keyshortcuts="Control+G Meta+G"
              data-testid="editor-group-selection"
            >
              <Group className="h-4 w-4" />
              <span className="hidden 2xl:inline">Group</span>
            </button>
            <button
              type="button"
              onClick={handleUngroupSelected}
              disabled={isCanvasMutationDisabled || !canUngroupSelected}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Ungroup selected element (Shift+Cmd/Ctrl+G)"
              aria-label="Ungroup selected element"
              aria-keyshortcuts="Shift+Control+G Shift+Meta+G"
              data-testid="editor-ungroup-selection"
            >
              <Ungroup className="h-4 w-4" />
              <span className="hidden 2xl:inline">Ungroup</span>
            </button>
            <button
              type="button"
              onClick={handleSelectedVisibilityToggle}
              disabled={isCanvasMutationDisabled || !canToggleSelectedVisibility}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={selectedLayersAreHidden ? `Show ${selectedLayerActionLabel}` : `Hide ${selectedLayerActionLabel}`}
              aria-label={selectedLayersAreHidden ? `Show ${selectedLayerActionLabel}` : `Hide ${selectedLayerActionLabel}`}
              aria-pressed={selectedLayersAreHidden}
              data-testid="editor-toggle-selection-visibility"
            >
              {selectedLayersAreHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleSelectedLockToggle}
              disabled={isCanvasMutationDisabled || selectedActiveElements.length === 0}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={selectedLayersAreLocked ? `Unlock ${selectedLayerActionLabel}` : `Lock ${selectedLayerActionLabel}`}
              aria-label={selectedLayersAreLocked ? `Unlock ${selectedLayerActionLabel}` : `Lock ${selectedLayerActionLabel}`}
              aria-pressed={selectedLayersAreLocked}
              data-testid="editor-toggle-selection-lock"
            >
              {selectedLayersAreLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <div className="flex items-center gap-0.5" aria-label="Layer order controls">
              <button
                type="button"
                onClick={() => handleZOrderChange('back')}
                disabled={isCanvasMutationDisabled || !canZOrderSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                title="Send to back (Shift+Cmd/Ctrl+[)"
                aria-label="Send to back"
                aria-keyshortcuts="Shift+Control+[ Shift+Meta+["
                data-testid="editor-send-to-back"
              >
                <SendToBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleZOrderChange('backward')}
                disabled={isCanvasMutationDisabled || !canZOrderSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                title="Send backward (Cmd/Ctrl+[)"
                aria-label="Send backward"
                aria-keyshortcuts="Control+[ Meta+["
                data-testid="editor-send-backward"
              >
                <ArrowDownToLine className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleZOrderChange('forward')}
                disabled={isCanvasMutationDisabled || !canZOrderSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                title="Bring forward (Cmd/Ctrl+])"
                aria-label="Bring forward"
                aria-keyshortcuts="Control+] Meta+]"
                data-testid="editor-bring-forward"
              >
                <ArrowUpToLine className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleZOrderChange('front')}
                disabled={isCanvasMutationDisabled || !canZOrderSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                title="Bring to front (Shift+Cmd/Ctrl+])"
                aria-label="Bring to front"
                aria-keyshortcuts="Shift+Control+] Shift+Meta+]"
                data-testid="editor-bring-to-front"
              >
                <BringToFront className="h-4 w-4" />
              </button>
            </div>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <div className="flex items-center gap-0.5" aria-label="Alignment controls">
              <button
                type="button"
                onClick={() => alignSelectedElement('left')}
                disabled={isCanvasMutationDisabled || !canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align left"
                aria-label="Align left"
                data-testid="editor-align-left"
              >
                <AlignHorizontalJustifyStart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('center')}
                disabled={isCanvasMutationDisabled || !canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align horizontal center"
                aria-label="Align horizontal center"
                data-testid="editor-align-center"
              >
                <AlignHorizontalJustifyCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('right')}
                disabled={isCanvasMutationDisabled || !canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align right"
                aria-label="Align right"
                data-testid="editor-align-right"
              >
                <AlignHorizontalJustifyEnd className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('top')}
                disabled={isCanvasMutationDisabled || !canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align top"
                aria-label="Align top"
                data-testid="editor-align-top"
              >
                <AlignVerticalJustifyStart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('middle')}
                disabled={isCanvasMutationDisabled || !canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align vertical center"
                aria-label="Align vertical center"
                data-testid="editor-align-middle"
              >
                <AlignVerticalJustifyCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('bottom')}
                disabled={isCanvasMutationDisabled || !canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align bottom"
                aria-label="Align bottom"
                data-testid="editor-align-bottom"
              >
                <AlignVerticalJustifyEnd className="h-4 w-4" />
              </button>
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              <button
                type="button"
                onClick={() => distributeSelectedElements('horizontal')}
                disabled={isCanvasMutationDisabled || !canDistributeSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                title="Distribute horizontal spacing"
                aria-label="Distribute horizontal spacing"
                data-testid="editor-distribute-horizontal"
              >
                <AlignHorizontalDistributeCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => distributeSelectedElements('vertical')}
                disabled={isCanvasMutationDisabled || !canDistributeSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                title="Distribute vertical spacing"
                aria-label="Distribute vertical spacing"
                data-testid="editor-distribute-vertical"
              >
                <AlignVerticalDistributeCenter className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={deleteElement}
              disabled={isCanvasMutationDisabled || !canDeleteSelected}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Delete ${selectedLayerActionLabel} (Delete/Backspace)`}
              aria-label={`Delete ${selectedLayerActionLabel}`}
              aria-keyshortcuts="Delete Backspace"
              data-testid="editor-delete-selection"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={handleToggleComponentPanel}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                showComponentPanel && !isCanvasFocusMode
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'hover:bg-slate-100'
              )}
              title={showComponentPanel && !isCanvasFocusMode ? 'Hide components panel (B)' : 'Show components panel (B)'}
              aria-label={showComponentPanel && !isCanvasFocusMode ? 'Hide components panel' : 'Show components panel'}
              aria-pressed={showComponentPanel && !isCanvasFocusMode}
              aria-keyshortcuts="B"
              data-testid="editor-toggle-component-panel"
              data-panel-visible={showComponentPanel && !isCanvasFocusMode ? 'true' : 'false'}
            >
              <PanelLeft className="w-4 h-4" />
              Components
            </button>

            <button
              type="button"
              onClick={handleToggleLayersPanel}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                rightPanel === 'layers' && showInspectorPanel && !isCanvasFocusMode
                  ? 'bg-slate-950 text-white'
                  : 'hover:bg-slate-100'
              )}
              title={rightPanel === 'layers' && showInspectorPanel && !isCanvasFocusMode ? 'Show properties panel (L)' : 'Show layers panel (L)'}
              aria-label={rightPanel === 'layers' && showInspectorPanel && !isCanvasFocusMode ? 'Show properties panel' : 'Show layers panel'}
              aria-pressed={rightPanel === 'layers' && showInspectorPanel && !isCanvasFocusMode}
              aria-keyshortcuts="L"
              data-testid="editor-toggle-layers-panel"
              data-right-panel={rightPanel}
              data-inspector-visible={showInspectorPanel && !isCanvasFocusMode ? 'true' : 'false'}
            >
              <Layers className="w-4 h-4" />
              Layers
            </button>

            <button
              type="button"
              onClick={handleToggleInspectorPanel}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                showInspectorPanel && !isCanvasFocusMode
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'hover:bg-slate-100'
              )}
              title={showInspectorPanel && !isCanvasFocusMode ? 'Hide inspector panel (I)' : 'Show inspector panel (I)'}
              aria-label={showInspectorPanel && !isCanvasFocusMode ? 'Hide inspector panel' : 'Show inspector panel'}
              aria-pressed={showInspectorPanel && !isCanvasFocusMode}
              aria-keyshortcuts="I"
              data-testid="editor-toggle-inspector-panel"
              data-panel-visible={showInspectorPanel && !isCanvasFocusMode ? 'true' : 'false'}
            >
              <PanelRight className="w-4 h-4" />
              Inspector
            </button>

            <button
              type="button"
              onClick={handleToggleCanvasFocus}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                isCanvasFocusMode
                  ? 'bg-slate-950 text-white'
                  : 'hover:bg-slate-100'
              )}
              title={isCanvasFocusMode ? 'Exit wide canvas focus (F)' : 'Enter wide canvas focus (F)'}
              aria-label={isCanvasFocusMode ? 'Exit wide canvas focus' : 'Enter wide canvas focus'}
              aria-pressed={isCanvasFocusMode}
              aria-keyshortcuts="F"
              data-testid="editor-toggle-focus-mode"
              data-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
            >
              <Maximize2 className="w-4 h-4" />
              Focus
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            {/* Preview Toggle */}
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              disabled={isSaving}
              data-testid="editor-preview-toggle"
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:opacity-60',
                isPreview
                  ? 'bg-slate-950 text-white'
                  : 'hover:bg-slate-100'
              )}
            >
              <Eye className="w-4 h-4" />
              {isPreview ? 'Edit' : 'Preview'}
            </button>

            {/* Settings */}
            {!hideSettings && (
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              disabled={isSaving}
              className="px-2 py-1.5 rounded-md text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              title="Page settings"
                aria-label="Page settings"
              >
                <Settings className="w-4 h-4" />
                <span className="ml-1">Settings</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReload}
              disabled={isSaving}
              className="px-2 py-1.5 rounded-md text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              title="Reload page from last saved state"
              aria-label="Reload page"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="ml-1">Reload</span>
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            {/* Save */}
            {!hideSave && (
              <>
                {mode === 'page' && (
                  <button
                    type="button"
                    onClick={handleTogglePublish}
                    disabled={isSaving || !canEdit || !canPublish || (pageSettings.status !== 'published' && effectivePublishDisabled)}
                    className={cn(
                      'px-2 py-1.5 rounded-md text-sm font-medium',
                      pageSettings.status === 'published'
                        ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                        : 'bg-emerald-600 text-white hover:bg-emerald-600/90',
                      isSaving || !canEdit || !canPublish || (pageSettings.status !== 'published' && effectivePublishDisabled)
                        ? 'opacity-70 cursor-not-allowed'
                        : '',
                    )}
                    title={
                      !canEdit
                        ? editDisabledReason
                        : !canPublish
                          ? publishDisabledReason || 'You do not have permission to change this page publication status'
                          : pageSettings.status === 'published'
                            ? 'Set page back to draft'
                            : effectivePublishDisabled
                              ? effectivePublishDisabledReason || 'Resolve page readiness issues before publishing'
                              : 'Publish page'
                    }
                    aria-label={
                      !canPublish
                        ? publishDisabledReason || 'Publication status disabled'
                        : pageSettings.status === 'published'
                          ? 'Unpublish page'
                          : effectivePublishDisabled
                            ? effectivePublishDisabledReason || 'Publish disabled'
                            : 'Publish page'
                    }
                  >
                    {pageSettings.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleSaveWrapper()}
                  disabled={isSaving || !canEdit}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-70 disabled:cursor-not-allowed"
                  title={canEdit ? `Save ${editorEntityLabel} (Ctrl+S)` : editDisabledReason}
                  aria-label={`Save ${editorEntityLabel.toLowerCase()}`}
                  data-testid="editor-save-page"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}

          </div>
        </header>

        {/* Main Content */}
        <div
          className="flex min-h-0 flex-1 overflow-hidden"
          data-testid="editor-shell-layout"
          data-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
          data-component-panel-visible={!isPreview && !isCanvasFocusMode && showComponentPanel ? 'true' : 'false'}
          data-inspector-panel-visible={!isPreview && !isCanvasFocusMode && showInspectorPanel ? 'true' : 'false'}
          data-right-panel={rightPanel}
          data-selected-id={selectedId || ''}
          data-selected-ids={selectedIds.join(',')}
          data-shell-keyshortcuts="components:B;inspector:I;layers:L;focus:F"
        >
          {/* Left Sidebar - Component Library */}
          {!isPreview && !isCanvasFocusMode && showComponentPanel && (
            <ComponentLibrary
              onDragStart={handleDragStart}
              onDragEnd={handleLibraryDragEnd}
              onAddItem={handleAddLibraryItem}
              reusableSections={reusableSections}
              reusableSectionsLoading={reusableSectionsLoading}
              reusableSectionsError={reusableSectionsError}
              canSaveSelection={Boolean(activeSiteId && selectedId)}
              canDeleteReusableSections={canDeleteReusableSections}
              isSavingReusableSection={isSavingReusableSection}
              disabled={isCanvasMutationDisabled}
              disabledReason={editDisabledReason}
              deleteDisabledReason={reusableDeleteDisabledReason}
              onRefreshReusableSections={loadReusableSections}
              onSaveSelectionAsReusableSection={handleSaveSelectionAsReusableSection}
              onRenameReusableSection={handleRenameReusableSection}
              onDeleteReusableSection={handleDeleteReusableSection}
            />
          )}

          {/* Center - Canvas */}
          <div
            ref={canvasViewportRef}
            className={cn(
              'relative flex-1 overflow-auto overscroll-contain pb-20',
              isCanvasFocusMode ? 'p-6 lg:p-10 2xl:p-12' : 'p-4 lg:p-6 2xl:p-8',
              isCanvasPanActive && (isCanvasPanning ? 'cursor-grabbing select-none' : 'cursor-grab')
            )}
            data-testid="editor-canvas-viewport"
            data-pan-mode={isCanvasPanMode ? 'true' : 'false'}
            data-pan-active={isCanvasPanActive ? 'true' : 'false'}
            data-space-pan-active={isCanvasSpacePanning ? 'true' : 'false'}
            data-panning={isCanvasPanning ? 'true' : 'false'}
            data-library-drag-active={libraryDragItem ? 'true' : 'false'}
            data-library-drag-type={libraryDragItem?.type ?? undefined}
            data-library-drag-name={libraryDragItem?.name ?? undefined}
            style={{
              backgroundColor: '#eef2f7',
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(71,85,105,0.18) 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }}
            onMouseDown={handleCanvasViewportMouseDown}
            onDragOver={(e) => {
              if (!isCanvasMutationDisabled) {
                e.preventDefault();
              }
            }}
            onDrop={handleCanvasDrop}
          >
            {libraryDragItem && !isPreview && !isCanvasMutationDisabled && (
              <div
                className="pointer-events-none absolute left-1/2 top-4 z-20 max-w-[min(360px,calc(100%-2rem))] -translate-x-1/2 rounded-full border border-primary/30 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-lg"
                role="status"
                aria-live="polite"
                data-testid="editor-library-drag-status"
              >
                Drop {libraryDragItem.name} on the canvas
              </div>
            )}
            <div className="flex min-h-full min-w-max justify-center">
              <div
                className="relative mx-auto"
                style={{
                  width: scaledCanvasWidth + (isPreview ? 0 : RULER_SIZE),
                  minHeight: scaledCanvasHeight + (isPreview ? 0 : RULER_SIZE + 48),
                }}
              >
                {!isPreview && (
                  <div className="mb-3 flex items-center justify-between gap-4 text-xs font-medium text-slate-600">
                    <span className="rounded bg-white/85 px-2 py-1 shadow-sm ring-1 ring-slate-200">
                      {breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1)} canvas
                    </span>
                    <span className="rounded bg-white/85 px-2 py-1 tabular-nums shadow-sm ring-1 ring-slate-200">
                      {size.width} x {size.height}px
                    </span>
                  </div>
                )}
                {isPreview ? (
                  <div
                    className="overflow-hidden shadow-[0_28px_70px_rgba(15,23,42,0.18)]"
                    data-testid="editor-canvas-scale-surface"
                    data-canvas-scale={activeCanvasScale}
                    style={{
                      width: size.width,
                      height: size.height,
                      transform: `scale(${activeCanvasScale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <Canvas
                      elements={displayedElements}
                      onElementsChange={handleElementsChange}
                      selectedId={selectedId}
                      selectedIds={selectedIds}
                      onSelect={handleSelect}
                      onSelectMany={handleCanvasSelectMany}
                      onToggleSelect={handleCanvasToggleSelect}
                      size={size}
                      onSizeChange={(newSize) => {
                        if (isCanvasMutationDisabled) {
                          return;
                        }

                        setSize(newSize);
                        markChanges();
                        if (onChange) {
                          onChange(elements, pageSettings, newSize);
                        }
                      }}
                      isPreview={isPreview}
                      disabled={isCanvasMutationDisabled}
                      viewportScale={activeCanvasScale}
                      snapEnabled={snapEnabled}
                      gridSize={gridSize}
                      showGrid={showGrid}
                    />
                  </div>
                ) : (
                  <div
                    className="grid rounded-md border border-slate-300 bg-slate-100 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
                    style={{
                      gridTemplateColumns: `${RULER_SIZE}px ${scaledCanvasWidth}px`,
                      gridTemplateRows: `${RULER_SIZE}px ${scaledCanvasHeight}px`,
                    }}
                  >
                    <div className="border-b border-r border-slate-300 bg-slate-200" data-testid="editor-canvas-ruler-corner" />
                    <div
                      className="relative overflow-hidden border-b border-slate-300 bg-slate-50"
                      data-testid="editor-canvas-ruler-horizontal"
                    >
                      {horizontalRulerTicks.map((tick) => (
                        <div
                          key={`x-${tick.value}`}
                          className="absolute top-0 h-full border-l border-slate-300"
                          data-ruler-tick="horizontal"
                          data-ruler-tick-major={tick.major ? 'true' : 'false'}
                          data-ruler-tick-value={tick.value}
                          style={{ left: tick.position }}
                        >
                          {tick.major && (
                            <span className="absolute left-1 top-1 text-[10px] font-medium tabular-nums text-slate-500">
                              {tick.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div
                      className="relative overflow-hidden border-r border-slate-300 bg-slate-50"
                      data-testid="editor-canvas-ruler-vertical"
                    >
                      {verticalRulerTicks.map((tick) => (
                        <div
                          key={`y-${tick.value}`}
                          className="absolute left-0 w-full border-t border-slate-300"
                          data-ruler-tick="vertical"
                          data-ruler-tick-major={tick.major ? 'true' : 'false'}
                          data-ruler-tick-value={tick.value}
                          style={{ top: tick.position }}
                        >
                          {tick.major && tick.value > 0 && (
                            <span className="absolute left-1 top-1 origin-top-left rotate-[-90deg] text-[10px] font-medium tabular-nums text-slate-500">
                              {tick.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="relative overflow-visible bg-white">
                      <div
                        data-testid="editor-canvas-scale-surface"
                        data-canvas-scale={activeCanvasScale}
                        style={{
                          width: size.width,
                          height: size.height,
                          transform: `scale(${activeCanvasScale})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        <Canvas
                          elements={displayedElements}
                          onElementsChange={handleElementsChange}
                          selectedId={selectedId}
                          selectedIds={selectedIds}
                          onSelect={handleSelect}
                          onSelectMany={handleCanvasSelectMany}
                          onToggleSelect={handleCanvasToggleSelect}
                          size={size}
                          onSizeChange={(newSize) => {
                            if (isCanvasMutationDisabled) {
                              return;
                            }

                            setSize(newSize);
                            markChanges();
                            if (onChange) {
                              onChange(elements, pageSettings, newSize);
                            }
                          }}
                          isPreview={isPreview}
                          disabled={isCanvasMutationDisabled}
                          viewportScale={activeCanvasScale}
                          snapEnabled={snapEnabled}
                          gridSize={gridSize}
                          showGrid={showGrid}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isPreview && (
              <div
                className="absolute bottom-4 left-4 z-30 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur"
                data-testid="editor-grid-snap-controls"
                data-snap-enabled={snapEnabled ? 'true' : 'false'}
                data-grid-visible={showGrid ? 'true' : 'false'}
                data-grid-size={gridSize}
                data-grid-keyshortcuts="toggle:G"
                data-snap-keyshortcuts="toggle:S"
              >
                <button
                  type="button"
                  onClick={handleToggleGridVisibility}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
                    showGrid
                      ? 'bg-slate-100 text-slate-800 ring-1 ring-slate-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
                  )}
                  title={showGrid ? 'Hide grid (G)' : 'Show grid (G)'}
                  aria-label={showGrid ? 'Hide grid' : 'Show grid'}
                  aria-pressed={showGrid}
                  aria-keyshortcuts="G"
                  data-testid="editor-grid-visibility-toggle"
                >
                  {showGrid ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSnap}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
                    snapEnabled
                      ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
                  )}
                  title={snapEnabled ? 'Disable snapping (S)' : 'Enable snapping (S)'}
                  aria-label={snapEnabled ? 'Disable snapping' : 'Enable snapping'}
                  aria-pressed={snapEnabled}
                  aria-keyshortcuts="S"
                  data-testid="editor-snap-toggle"
                >
                  <Magnet className="h-4 w-4" />
                  {snapEnabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                </button>
                <label className="flex items-center gap-1.5" title="Grid size">
                  <Ruler className="h-4 w-4 text-slate-500" />
                  <input
                    type="number"
                    min={MIN_GRID_SIZE}
                    max={MAX_GRID_SIZE}
                    step={1}
                    value={gridSize}
                    onChange={(event) => handleGridSizeChange(event.target.value)}
                    className="h-7 w-14 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    aria-label="Grid size"
                    data-testid="editor-grid-size"
                  />
                </label>
              </div>
            )}

            {!isPreview && (
              <div
                className="absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur"
                data-testid="editor-zoom-controls"
                data-auto-fit={isCanvasAutoFit ? 'true' : 'false'}
                data-canvas-scale={activeCanvasScale}
                data-zoom-percent={zoomPercent}
                data-pan-mode={isCanvasPanMode ? 'true' : 'false'}
                data-pan-active={isCanvasPanActive ? 'true' : 'false'}
                data-pan-keyshortcuts="toggle:H;temporary:Space"
                data-zoom-keyshortcuts="zoom-in:Cmd/Ctrl+=;zoom-out:Cmd/Ctrl+-;fit:Cmd/Ctrl+0"
              >
                <button
                  type="button"
                  onClick={handleToggleCanvasPanMode}
                  className={cn(
                    'rounded-md p-1.5 transition-colors',
                    isCanvasPanMode
                      ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                  )}
                  title={isCanvasPanMode ? 'Disable pan navigation (H, hold Space)' : 'Enable pan navigation (H, hold Space)'}
                  aria-label={isCanvasPanMode ? 'Disable pan navigation' : 'Enable pan navigation'}
                  aria-pressed={isCanvasPanMode}
                  aria-keyshortcuts="H Space"
                  data-testid="editor-pan-toggle"
                >
                  <Hand className="h-4 w-4" />
                </button>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Zoom out (Cmd/Ctrl+-)"
                  aria-label="Zoom out"
                  aria-keyshortcuts="Control+- Meta+-"
                  data-testid="editor-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center tabular-nums" data-testid="editor-zoom-percent">{zoomPercent}%</span>
                {isCanvasAutoFit && (
                  <span
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                    data-testid="editor-zoom-autofit"
                  >
                    Auto
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Zoom in (Cmd/Ctrl+=)"
                  aria-label="Zoom in"
                  aria-keyshortcuts="Control+= Meta+="
                  data-testid="editor-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={handleFitCanvas}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Fit canvas (Cmd/Ctrl+0)"
                  aria-label="Fit canvas"
                  aria-keyshortcuts="Control+0 Meta+0"
                  data-testid="editor-zoom-fit"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Right Sidebar - Inspector */}
          {!isPreview && !isCanvasFocusMode && showInspectorPanel && (
            <aside
              className="flex h-full min-h-0 w-[clamp(18rem,20vw,24rem)] min-w-[18rem] max-w-[24rem] shrink-0 flex-col border-l border-slate-200 bg-white"
              data-testid="editor-inspector"
            >
              <div className="border-b border-slate-200 p-3">
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setRightPanel('properties')}
                    data-testid="editor-tab-properties"
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md px-3 py-1.5 transition-colors',
                      rightPanel === 'properties'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-950',
                    )}
                    aria-pressed={rightPanel === 'properties'}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Properties
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanel('layers')}
                    data-testid="editor-tab-layers"
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md px-3 py-1.5 transition-colors',
                      rightPanel === 'layers'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-950',
                    )}
                    aria-pressed={rightPanel === 'layers'}
                  >
                    <Layers className="h-4 w-4" />
                    Layers
                  </button>
                </div>

                <div
                  className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2.5 text-xs"
                  data-testid="editor-composition-readiness"
                  data-composition-schema={editorCompositionReadiness.schemaVersion}
                  data-action-plan-schema={editorCompositionReadiness.actionPlan.schemaVersion}
                  data-total-layers={editorCompositionReadiness.metrics.totalLayers}
                  data-group-layers={editorCompositionReadiness.metrics.groupLayers}
                  data-nested-layers={editorCompositionReadiness.metrics.nestedLayers}
                  data-selected-layers={editorCompositionReadiness.selection.selectedLayerCount}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
                        <Group className="h-3.5 w-3.5" />
                        Composition
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-indigo-900/75">
                        {editorCompositionReadiness.readyCount}/{editorCompositionReadiness.checkCount} ready
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyEditorCompositionPlan()}
                      title="Copy editor composition action plan"
                      aria-label="Copy editor composition action plan"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100"
                      data-testid="editor-copy-composition-plan"
                    >
                      <Copy className="h-3 w-3" />
                      Copy plan
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="editor-composition-metrics">
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="font-semibold text-indigo-950">{editorCompositionReadiness.metrics.totalLayers}</div>
                      <div className="text-[10px] uppercase tracking-wide text-indigo-700">Layers</div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="font-semibold text-indigo-950">{editorCompositionReadiness.metrics.groupLayers}</div>
                      <div className="text-[10px] uppercase tracking-wide text-indigo-700">Groups</div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="font-semibold text-indigo-950">{editorCompositionReadiness.metrics.nestedLayers}</div>
                      <div className="text-[10px] uppercase tracking-wide text-indigo-700">Nested</div>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1">
                      <div className="font-semibold text-indigo-950">{editorCompositionReadiness.metrics.responsiveOverrideLayers}</div>
                      <div className="text-[10px] uppercase tracking-wide text-indigo-700">Breakpoints</div>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  data-testid={selectedIds.length > 1 ? 'editor-inspector-multi-selection' : selectedElement ? 'editor-inspector-selection' : 'editor-inspector-empty'}
                >
                  {selectedIds.length > 1 ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">
                            {selectedIds.length} layers selected
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            Unlocked sibling selection
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={handleSelectSiblingScope}
                            disabled={isCanvasMutationDisabled || selectableSiblingIds.length < 2}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Select all sibling layers (Cmd/Ctrl+A)"
                            aria-label="Select all sibling layers"
                            aria-keyshortcuts="Control+A Meta+A"
                            data-testid="editor-inspector-select-sibling-layers"
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                            Siblings
                          </button>
                          <button
                            type="button"
                            onClick={handleSelectParentLayer}
                            disabled={!canSelectParentLayer}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Select parent layer (Shift+Enter)"
                            aria-label="Select parent layer"
                            aria-keyshortcuts="Shift+Enter"
                            data-testid="editor-inspector-select-parent-layer"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Parent
                          </button>
                          <button
                            type="button"
                            onClick={handleGroupSelected}
                            disabled={isCanvasMutationDisabled || !canGroupSelected}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                            title="Group selected layers (Cmd/Ctrl+G)"
                            aria-label="Group selected layers"
                            aria-keyshortcuts="Control+G Meta+G"
                            data-testid="editor-inspector-group-selection"
                          >
                            <Group className="h-3.5 w-3.5" />
                            Group
                          </button>
                          <button
                            type="button"
                            onClick={handleUngroupSelected}
                            disabled={isCanvasMutationDisabled || !canUngroupSelected}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Ungroup selected layers (Shift+Cmd/Ctrl+G)"
                            aria-label="Ungroup selected layers"
                            aria-keyshortcuts="Shift+Control+G Shift+Meta+G"
                            data-testid="editor-inspector-ungroup-selection"
                          >
                            <Ungroup className="h-3.5 w-3.5" />
                            Ungroup
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-5 gap-1.5" data-testid="editor-inspector-selection-actions">
                        <button
                          type="button"
                          onClick={handleCopy}
                          disabled={isCanvasMutationDisabled || !canCopySelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Copy ${selectedLayerActionLabel}`}
                          aria-label={`Copy ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Control+C Meta+C"
                          data-testid="editor-inspector-copy-selection"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleDuplicate}
                          disabled={isCanvasMutationDisabled || !canDuplicateSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Duplicate ${selectedLayerActionLabel}`}
                          aria-label={`Duplicate ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Control+D Meta+D"
                          data-testid="editor-inspector-duplicate-selection"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCut}
                          disabled={isCanvasMutationDisabled || !canCutSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Cut ${selectedLayerActionLabel}`}
                          aria-label={`Cut ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Control+X Meta+X"
                          data-testid="editor-inspector-cut-selection"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handlePaste}
                          disabled={isCanvasMutationDisabled || clipboardElements.length === 0}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={pasteTargetLabel}
                          aria-label={pasteTargetLabel}
                          aria-keyshortcuts="Control+V Meta+V"
                          data-paste-target={pasteTargetMode}
                          data-paste-target-id={canPasteIntoSelectedContainer ? selectedElement?.id : undefined}
                          data-clipboard-count={clipboardElements.length}
                          data-testid="editor-inspector-paste-selection"
                        >
                          <ClipboardPaste className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={deleteElement}
                          disabled={isCanvasMutationDisabled || !canDeleteSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Delete ${selectedLayerActionLabel}`}
                          aria-label={`Delete ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Delete Backspace"
                          data-testid="editor-inspector-delete-selection"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2" data-testid="editor-inspector-selection-state-actions">
                        <button
                          type="button"
                          onClick={handleSelectedVisibilityToggle}
                          disabled={isCanvasMutationDisabled || !canToggleSelectedVisibility}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={selectedLayersAreHidden ? `Show ${selectedLayerActionLabel}` : `Hide ${selectedLayerActionLabel}`}
                          aria-label={selectedLayersAreHidden ? `Show ${selectedLayerActionLabel}` : `Hide ${selectedLayerActionLabel}`}
                          aria-pressed={selectedLayersAreHidden}
                          data-testid="editor-inspector-toggle-selection-visibility"
                        >
                          {selectedLayersAreHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {selectedLayersAreHidden ? 'Show' : 'Hide'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectedLockToggle}
                          disabled={isCanvasMutationDisabled || selectedActiveElements.length === 0}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={selectedLayersAreLocked ? `Unlock ${selectedLayerActionLabel}` : `Lock ${selectedLayerActionLabel}`}
                          aria-label={selectedLayersAreLocked ? `Unlock ${selectedLayerActionLabel}` : `Lock ${selectedLayerActionLabel}`}
                          aria-pressed={selectedLayersAreLocked}
                          data-testid="editor-inspector-toggle-selection-lock"
                        >
                          {selectedLayersAreLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                          {selectedLayersAreLocked ? 'Unlock' : 'Lock'}
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="editor-inspector-layer-order-controls">
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('back')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Send ${selectedLayerActionLabel} to back (Shift+Cmd/Ctrl+[)`}
                          aria-label={`Send ${selectedLayerActionLabel} to back`}
                          aria-keyshortcuts="Shift+Control+[ Shift+Meta+["
                          data-testid="editor-inspector-send-to-back"
                        >
                          <SendToBack className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('backward')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Send ${selectedLayerActionLabel} backward (Cmd/Ctrl+[)`}
                          aria-label={`Send ${selectedLayerActionLabel} backward`}
                          aria-keyshortcuts="Control+[ Meta+["
                          data-testid="editor-inspector-send-backward"
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('forward')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Bring ${selectedLayerActionLabel} forward (Cmd/Ctrl+])`}
                          aria-label={`Bring ${selectedLayerActionLabel} forward`}
                          aria-keyshortcuts="Control+] Meta+]"
                          data-testid="editor-inspector-bring-forward"
                        >
                          <ArrowUpToLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('front')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Bring ${selectedLayerActionLabel} to front (Shift+Cmd/Ctrl+])`}
                          aria-label={`Bring ${selectedLayerActionLabel} to front`}
                          aria-keyshortcuts="Shift+Control+] Shift+Meta+]"
                          data-testid="editor-inspector-bring-to-front"
                        >
                          <BringToFront className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-6 gap-1.5" data-testid="editor-inspector-align-controls">
                        <button
                          type="button"
                          onClick={() => alignSelectedElement('left')}
                          disabled={isCanvasMutationDisabled || !canAlignSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Align selected layers left"
                          aria-label="Align selected layers left"
                          data-testid="editor-inspector-align-left"
                        >
                          <AlignHorizontalJustifyStart className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alignSelectedElement('center')}
                          disabled={isCanvasMutationDisabled || !canAlignSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Align selected layers center"
                          aria-label="Align selected layers center"
                          data-testid="editor-inspector-align-center"
                        >
                          <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alignSelectedElement('right')}
                          disabled={isCanvasMutationDisabled || !canAlignSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Align selected layers right"
                          aria-label="Align selected layers right"
                          data-testid="editor-inspector-align-right"
                        >
                          <AlignHorizontalJustifyEnd className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alignSelectedElement('top')}
                          disabled={isCanvasMutationDisabled || !canAlignSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Align selected layers top"
                          aria-label="Align selected layers top"
                          data-testid="editor-inspector-align-top"
                        >
                          <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alignSelectedElement('middle')}
                          disabled={isCanvasMutationDisabled || !canAlignSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Align selected layers middle"
                          aria-label="Align selected layers middle"
                          data-testid="editor-inspector-align-middle"
                        >
                          <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alignSelectedElement('bottom')}
                          disabled={isCanvasMutationDisabled || !canAlignSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Align selected layers bottom"
                          aria-label="Align selected layers bottom"
                          data-testid="editor-inspector-align-bottom"
                        >
                          <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => distributeSelectedElements('horizontal')}
                          disabled={isCanvasMutationDisabled || !canDistributeSelected}
                          className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Distribute selected layers horizontally"
                          aria-label="Distribute selected layers horizontally"
                          data-testid="editor-inspector-distribute-horizontal"
                        >
                          <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
                          Space H
                        </button>
                        <button
                          type="button"
                          onClick={() => distributeSelectedElements('vertical')}
                          disabled={isCanvasMutationDisabled || !canDistributeSelected}
                          className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Distribute selected layers vertically"
                          aria-label="Distribute selected layers vertically"
                          data-testid="editor-inspector-distribute-vertical"
                        >
                          <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
                          Space V
                        </button>
                      </div>
                      {!canGroupSelected && (
                        <div className="mt-2 text-[11px] font-medium text-amber-700">
                          Select unlocked sibling layers to create a group.
                        </div>
                      )}
                    </>
                  ) : selectedElement ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950" data-testid="editor-inspector-selection-label">
                            {selectedElementLabel}
                          </div>
                          <div className="truncate text-xs text-slate-500" data-testid="editor-inspector-selection-detail">{selectedElementDetail}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {selectedElement.locked && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                              Locked
                            </span>
                          )}
                          {selectedElement.visible === false && (
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                              Hidden
                            </span>
                          )}
                        </div>
                      </div>
                      <label className="mt-2 block space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Layer name</span>
                        <input
                          type="text"
                          value={selectedElement.name || ''}
                          onChange={(event) => handleLayerRename(selectedElement.id, event.target.value)}
                          disabled={isCanvasMutationDisabled || selectedElement.locked}
                          placeholder={selectedElementTypeLabel || 'Layer'}
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          data-testid="editor-inspector-layer-name"
                          aria-label="Layer name"
                        />
                      </label>
                      <div className="mt-3 grid grid-cols-5 gap-1.5" data-testid="editor-inspector-single-selection-actions">
                        <button
                          type="button"
                          onClick={handleCopy}
                          disabled={isCanvasMutationDisabled || !canCopySelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Copy ${selectedLayerActionLabel}`}
                          aria-label={`Copy ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Control+C Meta+C"
                          data-testid="editor-inspector-single-copy-selection"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleDuplicate}
                          disabled={isCanvasMutationDisabled || !canDuplicateSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Duplicate ${selectedLayerActionLabel}`}
                          aria-label={`Duplicate ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Control+D Meta+D"
                          data-testid="editor-inspector-single-duplicate-selection"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCut}
                          disabled={isCanvasMutationDisabled || !canCutSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Cut ${selectedLayerActionLabel}`}
                          aria-label={`Cut ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Control+X Meta+X"
                          data-testid="editor-inspector-single-cut-selection"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handlePaste}
                          disabled={isCanvasMutationDisabled || clipboardElements.length === 0}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={pasteTargetLabel}
                          aria-label={pasteTargetLabel}
                          aria-keyshortcuts="Control+V Meta+V"
                          data-paste-target={pasteTargetMode}
                          data-paste-target-id={canPasteIntoSelectedContainer ? selectedElement.id : undefined}
                          data-clipboard-count={clipboardElements.length}
                          data-testid="editor-inspector-single-paste-selection"
                        >
                          <ClipboardPaste className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={deleteElement}
                          disabled={isCanvasMutationDisabled || !canDeleteSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Delete ${selectedLayerActionLabel}`}
                          aria-label={`Delete ${selectedLayerActionLabel}`}
                          aria-keyshortcuts="Delete Backspace"
                          data-testid="editor-inspector-single-delete-selection"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2" data-testid="editor-inspector-single-selection-state-actions">
                        <button
                          type="button"
                          onClick={handleSelectedVisibilityToggle}
                          disabled={isCanvasMutationDisabled || !canToggleSelectedVisibility}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={selectedLayersAreHidden ? `Show ${selectedLayerActionLabel}` : `Hide ${selectedLayerActionLabel}`}
                          aria-label={selectedLayersAreHidden ? `Show ${selectedLayerActionLabel}` : `Hide ${selectedLayerActionLabel}`}
                          aria-pressed={selectedLayersAreHidden}
                          data-testid="editor-inspector-single-toggle-selection-visibility"
                        >
                          {selectedLayersAreHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {selectedLayersAreHidden ? 'Show' : 'Hide'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectedLockToggle}
                          disabled={isCanvasMutationDisabled || selectedActiveElements.length === 0}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={selectedLayersAreLocked ? `Unlock ${selectedLayerActionLabel}` : `Lock ${selectedLayerActionLabel}`}
                          aria-label={selectedLayersAreLocked ? `Unlock ${selectedLayerActionLabel}` : `Lock ${selectedLayerActionLabel}`}
                          aria-pressed={selectedLayersAreLocked}
                          data-testid="editor-inspector-single-toggle-selection-lock"
                        >
                          {selectedLayersAreLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                          {selectedLayersAreLocked ? 'Unlock' : 'Lock'}
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="editor-inspector-single-layer-order-controls">
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('back')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Send ${selectedLayerActionLabel} to back (Shift+Cmd/Ctrl+[)`}
                          aria-label={`Send ${selectedLayerActionLabel} to back`}
                          aria-keyshortcuts="Shift+Control+[ Shift+Meta+["
                          data-testid="editor-inspector-single-send-to-back"
                        >
                          <SendToBack className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('backward')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Send ${selectedLayerActionLabel} backward (Cmd/Ctrl+[)`}
                          aria-label={`Send ${selectedLayerActionLabel} backward`}
                          aria-keyshortcuts="Control+[ Meta+["
                          data-testid="editor-inspector-single-send-backward"
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('forward')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Bring ${selectedLayerActionLabel} forward (Cmd/Ctrl+])`}
                          aria-label={`Bring ${selectedLayerActionLabel} forward`}
                          aria-keyshortcuts="Control+] Meta+]"
                          data-testid="editor-inspector-single-bring-forward"
                        >
                          <ArrowUpToLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleZOrderChange('front')}
                          disabled={isCanvasMutationDisabled || !canZOrderSelected}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Bring ${selectedLayerActionLabel} to front (Shift+Cmd/Ctrl+])`}
                          aria-label={`Bring ${selectedLayerActionLabel} to front`}
                          aria-keyshortcuts="Shift+Control+] Shift+Meta+]"
                          data-testid="editor-inspector-single-bring-to-front"
                        >
                          <BringToFront className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {canSelectParentLayer && (
                        <button
                          type="button"
                          onClick={handleSelectParentLayer}
                          className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Select parent layer (Shift+Enter)"
                          aria-label="Select parent layer"
                          aria-keyshortcuts="Shift+Enter"
                          data-testid="editor-select-parent-layer"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          Select parent
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSelectSiblingScope}
                        disabled={isCanvasMutationDisabled || selectableSiblingIds.length < 2}
                        className="mt-2 ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Select all sibling layers (Cmd/Ctrl+A)"
                        aria-label="Select all sibling layers"
                        aria-keyshortcuts="Control+A Meta+A"
                        data-testid="editor-inspector-single-select-sibling-layers"
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                        Select siblings
                      </button>
                      {canSelectChildLayer && (
                        <button
                          type="button"
                          onClick={handleSelectFirstChildLayer}
                          className="mt-2 ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Select child layer (Enter)"
                          aria-label="Select child layer"
                          aria-keyshortcuts="Enter"
                          data-testid="editor-select-child-layer"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Select child
                        </button>
                      )}
                      {canSelectChildLayerScope && (
                        <button
                          type="button"
                          onClick={handleSelectChildLayerScope}
                          className="mt-2 ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Select child layers (Shift+Cmd/Ctrl+A)"
                          aria-label="Select child layers"
                          aria-keyshortcuts="Shift+Control+A Shift+Meta+A"
                          data-testid="editor-select-child-layer-scope"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Select children
                        </button>
                      )}
                      {canUngroupSelected && (
                        <button
                          type="button"
                          onClick={handleUngroupSelected}
                          disabled={isCanvasMutationDisabled}
                          className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          title="Ungroup selected layer (Shift+Cmd/Ctrl+G)"
                          aria-label="Ungroup selected layer"
                          aria-keyshortcuts="Shift+Control+G Shift+Meta+G"
                          data-testid="editor-inspector-single-ungroup-selection"
                        >
                          <Ungroup className="h-3.5 w-3.5" />
                          Ungroup
                        </button>
                      )}
                      {selectedReusableSectionMeta && (
                        <div
                          className="mt-2 rounded-md border border-violet-100 bg-violet-50 px-2.5 py-2 text-[11px] leading-4 text-violet-800"
                          data-testid="editor-reusable-instance"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold">
                                Synced section
                              </div>
                              <div className="truncate text-violet-700">
                                {selectedReusableSectionSource?.name || selectedReusableSectionMeta.name || selectedReusableSectionMeta.sectionId}
                              </div>
                            </div>
                            <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 font-semibold uppercase text-violet-700">
                              {selectedReusableSectionSource ? 'linked' : 'missing'}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={handleRefreshSelectedReusableSection}
                              disabled={isCanvasMutationDisabled || !selectedReusableSectionSource || selectedElement.locked}
                              className="inline-flex items-center justify-center gap-1 rounded border border-violet-200 bg-white px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="editor-refresh-reusable-instance"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Refresh
                            </button>
                            <button
                              type="button"
                              onClick={handleDetachSelectedReusableSection}
                              disabled={isCanvasMutationDisabled || selectedElement.locked}
                              className="inline-flex items-center justify-center gap-1 rounded border border-violet-200 bg-white px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="editor-detach-reusable-instance"
                            >
                              <X className="h-3 w-3" />
                              Detach
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] font-medium text-slate-500">
                        <span className="rounded bg-white px-2 py-1 tabular-nums">X {Math.round(selectedElement.x)}</span>
                        <span className="rounded bg-white px-2 py-1 tabular-nums">Y {Math.round(selectedElement.y)}</span>
                        <span className="rounded bg-white px-2 py-1 tabular-nums">W {Math.round(selectedElement.width)}</span>
                        <span className="rounded bg-white px-2 py-1 tabular-nums">H {Math.round(selectedElement.height)}</span>
                      </div>
                      {breakpoint !== 'desktop' && (
                        <div
                          className="mt-2 rounded-md border border-sky-100 bg-sky-50 px-2.5 py-2 text-[11px] leading-4 text-sky-800"
                          data-testid="editor-breakpoint-override"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold capitalize">{breakpoint} override</span>
                            <button
                              type="button"
                              onClick={handleClearSelectedBreakpointOverride}
                              disabled={isCanvasMutationDisabled || !selectedElementHasBreakpointOverride}
                              className="rounded border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reset all
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1" data-testid="editor-breakpoint-override-groups">
                            {BREAKPOINT_OVERRIDE_GROUPS.map((group) => {
                              const isActive = selectedBreakpointOverrideGroups.includes(group.id);
                              return (
                                <button
                                  key={group.id}
                                  type="button"
                                  onClick={() => handleClearSelectedBreakpointOverrideGroup(group.id)}
                                  disabled={isCanvasMutationDisabled || !isActive}
                                  data-testid={`editor-breakpoint-reset-${group.id}`}
                                  title={isActive ? `Reset ${group.description.toLowerCase()} override` : `${group.description} inherits desktop`}
                                  className={cn(
                                    'rounded border px-2 py-1 font-semibold transition-colors disabled:cursor-not-allowed',
                                    isActive
                                      ? 'border-sky-200 bg-white text-sky-700 hover:bg-sky-100'
                                      : 'border-transparent bg-sky-100 text-sky-400 opacity-70',
                                  )}
                                >
                                  {group.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-sky-700">
                            Active groups stay local to this breakpoint; inactive groups inherit desktop.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">No selection</span>
                      <span className="text-xs font-medium text-slate-500">{elements.length} elements</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {rightPanel === 'layers' ? (
                  <LayersPanel
                    elements={displayedElements}
                    selectedIds={selectedIds}
                    onSelect={handleLayerSelect}
                    onReorder={handleLayerReorder}
                    onMove={handleLayerMove}
                    onNestSelection={handleNestSelectionIntoLayer}
                    onVisibilityToggle={handleLayerVisibilityToggle}
                    onLockToggle={handleLayerLockToggle}
                    onRename={handleLayerRename}
                    onDelete={handleLayerDelete}
                    onDuplicate={handleLayerDuplicate}
                    disabled={isCanvasMutationDisabled}
                    embedded
                    hideHeader
                  />
                ) : (
                  <PropertyPanel
                    element={selectedElement}
                    onChange={handleElementUpdate}
                    onDelete={deleteElement}
                    mediaContext={mediaContext}
                    disabled={isCanvasMutationDisabled}
                    canViewMedia={canViewMedia}
                    canCreateMedia={canCreateMedia}
                    canViewCollections={canViewCollections}
                    mediaViewDisabledReason={mediaViewDisabledReason}
                    mediaCreateDisabledReason={mediaCreateDisabledReason}
                    collectionsViewDisabledReason={collectionsViewDisabledReason}
                    interactiveComponents={interactiveComponents}
                    interactiveComponentsLoading={interactiveComponentsLoading}
                    interactiveComponentsError={interactiveComponentsError}
                    embedded
                    hideHeader
                  />
                )}
              </div>
            </aside>
          )}
        </div>

        {editorNotice && (
          <div className="fixed left-1/2 top-4 z-[95] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <span>{editorNotice}</span>
              <button
                type="button"
                onClick={() => setEditorNotice(null)}
                className="rounded p-1 text-amber-800 hover:bg-amber-100"
                aria-label="Dismiss editor notice"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {reusableSectionDraft && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reusable-section-dialog-title"
          >
            <form
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmReusableSectionDraft();
              }}
            >
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                  <Layers className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="reusable-section-dialog-title" className="text-lg font-semibold text-slate-950">
                    {reusableSectionDraft.mode === 'save' ? 'Save reusable section' : 'Rename reusable section'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {reusableSectionDraft.mode === 'save'
                      ? 'Name this saved block so it can be reused from the component library.'
                      : 'Update the name shown in the reusable sections list.'}
                  </p>
                </div>
              </div>
              <label className="mt-5 block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Section name</span>
                <input
                  type="text"
                  value={reusableSectionDraft.name}
                  onChange={(event) => setReusableSectionDraft((current) => current ? {
                    ...current,
                    name: event.target.value,
                  } : current)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-sky-400"
                  autoFocus
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReusableSectionDraft(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingReusableSection || reusableSectionDraft.name.trim().length === 0}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSavingReusableSection
                    ? 'Saving...'
                    : reusableSectionDraft.mode === 'save' ? 'Save section' : 'Rename section'}
                </button>
              </div>
            </form>
          </div>
        )}

        {pendingDeleteReusableSection && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-reusable-section-dialog-title"
          >
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-red-50 p-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="delete-reusable-section-dialog-title" className="text-lg font-semibold text-slate-950">Delete {pendingDeleteReusableSection.name}?</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    This removes the saved section from the component library. Existing canvas layers will stay where they are.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteReusableSection(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDeleteReusableSection(pendingDeleteReusableSection.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Delete section
                </button>
              </div>
            </div>
          </div>
        )}

        {showReloadConfirm && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reload-editor-dialog-title"
          >
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <RefreshCw className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="reload-editor-dialog-title" className="text-lg font-semibold text-slate-950">Reload editor?</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Reloading will discard your current unsaved edits and reset the canvas to the last loaded version.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReloadConfirm(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performReload}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Reload editor
                </button>
              </div>
            </div>
          </div>
        )}

        <PageSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={pageSettings}
          validateSettings={validateSettings}
          mediaContext={mediaContext}
          onSave={handleSettingsSave}
          canEdit={canEdit}
          canPublish={canPublish}
          canViewMedia={canViewMedia}
          canCreateMedia={canCreateMedia}
          editDisabledReason={editDisabledReason}
          publishDisabledReason={effectivePublishDisabledReason || undefined}
          mediaViewDisabledReason={mediaViewDisabledReason}
          mediaCreateDisabledReason={mediaCreateDisabledReason}
        />
      </div>
    </ActiveEditorProvider>
  );
}
