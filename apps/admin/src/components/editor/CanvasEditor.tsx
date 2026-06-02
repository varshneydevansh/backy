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

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  buildBackyThemeCssVariables,
  buildBackyThemeTokens,
  buildCustomFrontendAgentHandoff,
  CUSTOM_FRONTEND_AGENT_HANDOFF_DOC,
  type ThemeConfig,
} from '@backy-cms/core';
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
  PencilLine,
  Plus,
  Tablet,
  Smartphone,
  RefreshCw,
  Search,
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
  CANVAS_COMPONENT_LIBRARY,
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
import { useStore, type MediaAsset } from '@/stores/mockStore';
import { getPublicMediaFileUrl, listMedia, uploadMedia } from '@/lib/mediaApi';
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
  'audio',
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
  'codeBlock',
  'codeComponent',
];

type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type CanvasDistribution = 'horizontal' | 'vertical';
type CanvasZOrderAction = 'front' | 'forward' | 'backward' | 'back';
type EditorCommandCategory =
  | 'history'
  | 'selection'
  | 'clipboard'
  | 'composition'
  | 'layer-state'
  | 'layer-order'
  | 'layout'
  | 'view'
  | 'shell'
  | 'workflow';
type EditorCommandTargetScope =
  | 'canvas'
  | 'selected-layer'
  | 'selected-layers'
  | 'selected-sibling-scope'
  | 'selected-child-scope'
  | 'selected-container'
  | 'viewport'
  | 'shell'
  | 'document';
type EditorCommandState = 'ready' | 'disabled' | 'hidden';
type EditorCommandRegistryItem = {
  id: string;
  label: string;
  category: EditorCommandCategory;
  targetScope: EditorCommandTargetScope;
  shortcut?: string;
  ariaKeyshortcuts?: string;
  testId?: string;
  enabled: boolean;
  state: EditorCommandState;
  reason: string;
};
type CanvasWheelZoomEvent = WheelEvent & {
  detail?: number;
  wheelDelta?: number;
  wheelDeltaY?: number;
};

const CANVAS_CONTEXT_QUICK_ADD_KEYS = ['heading', 'text', 'image', 'audio', 'button', 'section', 'form'] as const;

const getComponentLibraryItemKey = (item: ComponentLibraryItem): string => item.id ?? item.type;

const CANVAS_CONTEXT_QUICK_ADD_ITEMS: Array<{ key: string; item: ComponentLibraryItem }> =
  CANVAS_CONTEXT_QUICK_ADD_KEYS.flatMap((key) => {
    const item = CANVAS_COMPONENT_LIBRARY.find((libraryItem) => (
      getComponentLibraryItemKey(libraryItem) === key || libraryItem.type === key
    ));
    return item ? [{ key, item }] : [];
  });

const CANVAS_CONTEXT_QUICK_ADD_TYPES = CANVAS_CONTEXT_QUICK_ADD_ITEMS
  .map(({ key }) => key)
  .join(',');
const INSPECTOR_EMPTY_QUICK_ADD_KEYS = ['heading', 'text', 'section'] as const;
const INSPECTOR_EMPTY_QUICK_ADD_ITEMS = CANVAS_CONTEXT_QUICK_ADD_ITEMS.filter(({ key }) => (
  (INSPECTOR_EMPTY_QUICK_ADD_KEYS as readonly string[]).includes(key)
));
const INSPECTOR_EMPTY_QUICK_ADD_TYPES = INSPECTOR_EMPTY_QUICK_ADD_ITEMS
  .map(({ key }) => key)
  .join(',');
const INSPECTOR_PANEL_PURPOSE = 'selected-layer properties, layer tree, and quick actions';
const INSPECTOR_PANEL_PURPOSE_KEY = 'selected-layer-properties-layer-tree-actions';

const CANVAS_TEXT_EDIT_EVENT = 'backy-open-text-editor';
const CANVAS_TEXT_EDITABLE_TYPES = new Set<CanvasElement['type']>(['text', 'heading', 'paragraph', 'quote', 'list']);

type EditorCommandRegistry = {
  schemaVersion: 'backy.editor-command-registry.v1';
  generatedFrom: 'page-editor';
  summary: {
    totalCommandCount: number;
    readyCommandCount: number;
    disabledCommandCount: number;
    hiddenCommandCount: number;
    selectedLayerCount: number;
    categories: Array<{
      category: EditorCommandCategory;
      total: number;
      ready: number;
      disabled: number;
      hidden: number;
    }>;
  };
  commands: EditorCommandRegistryItem[];
};
type EditorResponsiveNextActionState = 'ready' | 'blocked' | 'selected';
type EditorResponsiveNextActionTarget =
  | 'desktop-source'
  | 'breakpoint-viewport'
  | 'layer-selection'
  | 'selected-layer';
type EditorResponsiveNextActionSurface =
  | 'viewport-toolbar'
  | 'layers-panel'
  | 'inspector-breakpoint-override';
type EditorResponsiveNextAction = {
  schemaVersion: 'backy.editor-responsive-next-action.v1';
  generatedFrom: 'page-editor';
  id: string;
  label: string;
  detail: string;
  breakpoint: EditorBreakpoint;
  breakpointLabel: string;
  target: EditorResponsiveNextActionTarget;
  actionSurface: EditorResponsiveNextActionSurface;
  actionState: EditorResponsiveNextActionState;
  inheritanceState: 'desktop-source' | 'inherits-desktop' | 'local-overrides';
  selectedLayerId: string | null;
  selectedLayerType: CanvasElement['type'] | null;
  selectedLayerLabel: string | null;
  overrideGroups: string[];
  overrideGroupLabels: string[];
  activeOverrideLayerCount: number;
  totalOverrideLayerCount: number;
  canvas: CanvasSize;
  pointers: {
    layerMap: 'editor-layers-panel';
    inspector: 'editor-breakpoint-override';
    renderPayload: 'render.data.content.elements[]';
    selectedComponentApi: 'backy.editor-selected-component-api-contract.v1';
  };
};

const buildEditorAgentHandoff = (siteId?: string) => {
  const sitePath = siteId || ':siteId';
  const canonicalHandoff = buildCustomFrontendAgentHandoff(sitePath);

  return {
    ...canonicalHandoff,
    siteId: siteId || null,
    editorSurface: {
      schemaVersion: 'backy.editor-canvas-agent-surface.v1',
      source: 'Backy canvas editor composition readiness panel',
      agentReadStart: canonicalHandoff.endpoints.agentHandoff,
      manifestReadStart: 'manifest.data.contract.customFrontendAgentHandoff',
      openApiReadStart: 'x-backy-custom-frontend-agent-handoff',
      copyablePayload: 'editorCompositionReadiness.agentHandoff',
      canvasFirst: canonicalHandoff.contentCreation.canvasFirst,
      adminEntryPoints: canonicalHandoff.contentCreation.adminEntryPoints,
      designState: canonicalHandoff.designState,
      zoom: {
        scope: 'canvas',
        wheelModifier: 'meta-or-control',
        keyboardShortcuts: ['Cmd/Ctrl+=', 'Cmd/Ctrl+-', 'Cmd/Ctrl+0'],
        browserZoomGuard: true,
      },
    },
  };
};

const editorCommandActionState = (command?: EditorCommandRegistryItem) => (
  command?.state === 'ready' ? 'ready' : 'blocked'
);

const editorCommandDisabledReason = (command?: EditorCommandRegistryItem) => (
  command && command.state !== 'ready' ? command.reason : undefined
);

const editorCommandStatusText = (command?: EditorCommandRegistryItem) => {
  if (!command) return 'Command unavailable: Command registry metadata is missing.';
  return `${command.label} ${command.state === 'ready' ? 'available' : `unavailable: ${command.reason}`}`.replace(/[.?!]+$/, '');
};

const formatEditorCommandCategory = (category: EditorCommandCategory) => (
  category
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
);
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
type EditorClipboardItem = {
  element: CanvasElement;
  sourceParentId: string | null;
  sourceAbsoluteOffset: { x: number; y: number } | null;
};
type CloneElementTreeOptions = {
  renameRoot?: boolean;
  siblingNames?: string[];
  rootX?: number;
  rootY?: number;
  usedElementIds: Set<string>;
  rootZIndex: number;
};

type NavigatorWithUserActivation = Navigator & {
  userActivation?: {
    hasBeenActive?: boolean;
  };
};

const hasBrowserUserActivation = (): boolean => {
  if (typeof navigator === 'undefined') return true;

  const activation = (navigator as NavigatorWithUserActivation).userActivation;
  return typeof activation?.hasBeenActive === 'boolean' ? activation.hasBeenActive : true;
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
const CANVAS_ZOOM_MIN = 0.25;
const CANVAS_ZOOM_MAX = 2;
const CANVAS_ZOOM_STEP = 0.1;
const CANVAS_ZOOM_PERCENT_STEP = 5;
const CANVAS_WHEEL_ZOOM_STEP = 0.08;
const CANVAS_WHEEL_DELTA_LINE_MULTIPLIER = 16;
const CANVAS_WHEEL_DELTA_PAGE_MULTIPLIER = 800;
const EDITOR_COMPACT_SHELL_MEDIA_QUERY = '(max-width: 1023px)';
const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 100;
const MIN_CANVAS_DIMENSION = 320;
const MAX_CANVAS_WIDTH = 3840;
const MAX_CANVAS_HEIGHT = 24000;
const CANVAS_CONTENT_PADDING = 48;
const CANVAS_MEDIA_DROP_GAP = 18;
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
const EDITOR_ASSET_REFERENCE_KEYS = new Set([
  'assetId',
  'assetIds',
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
const EDITOR_ACTION_PROP_KEYS = new Set([
  'href',
  'url',
  'action',
  'actionUrl',
  'formId',
  'successRedirectUrl',
  'redirectUrl',
]);
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

const parseEditorBoolean = (value: unknown, fallback = false): boolean => {
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

const isLayerHidden = (element: Pick<CanvasElement, 'visible'> | null | undefined): boolean => (
  parseEditorBoolean(element?.visible, true) === false
);

const isLayerLocked = (element: Pick<CanvasElement, 'locked'> | null | undefined): boolean => (
  parseEditorBoolean(element?.locked, false)
);

const normalizeResponsiveFieldValue = (
  key: typeof RESPONSIVE_LAYOUT_FIELDS[number],
  value: unknown,
) => {
  if (key === 'visible') {
    return parseEditorBoolean(value, true);
  }

  if (key === 'locked') {
    return parseEditorBoolean(value, false);
  }

  return value;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasNonEmptyArray = (value: unknown): boolean => (
  Array.isArray(value) && value.length > 0
);

const hasNonEmptyRecord = (value: unknown): value is Record<string, unknown> => (
  isPlainRecord(value) && Object.keys(value).length > 0
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
  if (element.name) next.name = element.name;
  if (isLayerHidden(element)) next.visible = false;
  if (isLayerLocked(element)) next.locked = true;
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

  const tokenRefs = stableComparableValue(element.tokenRefs || {});
  if (isPlainRecord(tokenRefs) && Object.keys(tokenRefs).length > 0) {
    next.tokenRefs = tokenRefs;
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
    (
      override.styles &&
      Object.keys(override.styles).length > 0 &&
      (!baseElement || !jsonEqual(override.styles, baseElement.styles || {}))
    ) ||
    (
      override.tokenRefs &&
      Object.keys(override.tokenRefs).length > 0 &&
      (!baseElement || !jsonEqual(override.tokenRefs, baseElement.tokenRefs || {}))
    ),
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

const countResponsiveOverrideLayers = (
  nodes: CanvasElement[],
  targetBreakpoint?: Exclude<EditorBreakpoint, 'desktop'>,
): number => {
  const breakpoints = targetBreakpoint ? [targetBreakpoint] : EDITOR_RESPONSIVE_BREAKPOINTS;
  let count = 0;

  const walk = (items: CanvasElement[]) => {
    items.forEach((item) => {
      if (breakpoints.some((itemBreakpoint) => (
        getResponsiveOverrideGroups(item.responsive?.[itemBreakpoint], item).length > 0
      ))) {
        count += 1;
      }
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return count;
};

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
    delete nextOverride.tokenRefs;
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
    tokenRefs: override.tokenRefs ? { ...(element.tokenRefs || {}), ...override.tokenRefs } : element.tokenRefs,
    ...(children ? { children } : {}),
  };
};

const applyResponsiveOverridesToElements = (
  elements: CanvasElement[],
  breakpoint: EditorBreakpoint,
): CanvasElement[] => elements.map((element) => applyResponsiveOverrideToElement(element, breakpoint));

const collectCanvasContentBounds = (
  elements: CanvasElement[],
  offsetX = 0,
  offsetY = 0,
): { maxX: number; maxY: number } => (
  elements.reduce(
    (bounds, element) => {
      const left = offsetX + element.x;
      const top = offsetY + element.y;
      const right = left + element.width;
      const bottom = top + element.height;
      const childBounds = element.children?.length
        ? collectCanvasContentBounds(element.children, left, top)
        : { maxX: 0, maxY: 0 };

      return {
        maxX: Math.max(bounds.maxX, right, childBounds.maxX),
        maxY: Math.max(bounds.maxY, bottom, childBounds.maxY),
      };
    },
    { maxX: 0, maxY: 0 },
  )
);

const expandCanvasSizeToContent = (
  canvasSize: CanvasSize,
  bounds: { maxX: number; maxY: number },
): CanvasSize => ({
  ...canvasSize,
  width: Math.max(canvasSize.width, Math.ceil(bounds.maxX)),
  height: Math.max(canvasSize.height, Math.ceil(bounds.maxY + CANVAS_CONTENT_PADDING)),
});

const SECTION_FLOW_ELEMENT_TYPES = new Set<CanvasElement['type']>(['section', 'header', 'footer', 'nav']);

const isRootSectionFlowElement = (element: CanvasElement): boolean => (
  SECTION_FLOW_ELEMENT_TYPES.has(element.type)
);

const elementBottom = (element: CanvasElement): number => element.y + element.height;
const roundedCanvasValue = (value: number): number => Math.round(Number.isFinite(value) ? value : 0);
const canvasValuesMatch = (left: number, right: number): boolean => (
  Math.abs(roundedCanvasValue(left) - roundedCanvasValue(right)) <= 1
);

const snapRootSectionInsertionsToFlowBoundary = (
  rootElements: CanvasElement[],
  insertedElements: CanvasElement[],
): CanvasElement[] => {
  const insertedFlowElements = insertedElements.filter(isRootSectionFlowElement);
  if (insertedFlowElements.length === 0) {
    return insertedElements;
  }

  const insertionTop = Math.min(...insertedFlowElements.map((element) => element.y));
  const overlappingFlowElement = rootElements
    .filter(isRootSectionFlowElement)
    .filter((element) => element.y < insertionTop && elementBottom(element) > insertionTop)
    .sort((left, right) => elementBottom(right) - elementBottom(left))[0];

  if (!overlappingFlowElement) {
    return insertedElements;
  }

  const deltaY = Math.max(0, Math.round(elementBottom(overlappingFlowElement) - insertionTop));
  if (deltaY === 0) {
    return insertedElements;
  }

  return insertedElements.map((element) => ({
    ...element,
    y: Math.max(0, Math.round(element.y + deltaY)),
  }));
};

const resolveDerivedRootSectionFlowChange = (
  previousById: Map<string, CanvasElement>,
  changedFlowElements: CanvasElement[],
): {
  changedElement: CanvasElement;
  previousElement: CanvasElement;
  deltaY: number;
  flowBoundary: number;
} | null => {
  const candidates = changedFlowElements
    .map((changedElement) => {
      const previousElement = previousById.get(changedElement.id);
      if (!previousElement) {
        return null;
      }

      const deltaY = roundedCanvasValue(elementBottom(changedElement) - elementBottom(previousElement));
      if (deltaY === 0) {
        return null;
      }

      const flowBoundary = elementBottom(previousElement) - 1;
      const derivedChangesMatch = changedFlowElements.every((flowElement) => {
        if (flowElement.id === changedElement.id) {
          return true;
        }

        const previousFlowElement = previousById.get(flowElement.id);
        if (!previousFlowElement || previousFlowElement.y < flowBoundary) {
          return false;
        }

        return (
          canvasValuesMatch(flowElement.y, previousFlowElement.y + deltaY) &&
          canvasValuesMatch(flowElement.height, previousFlowElement.height)
        );
      });

      return derivedChangesMatch
        ? { changedElement, previousElement, deltaY, flowBoundary }
        : null;
    })
    .filter((candidate): candidate is {
      changedElement: CanvasElement;
      previousElement: CanvasElement;
      deltaY: number;
      flowBoundary: number;
    } => Boolean(candidate));

  return candidates.length === 1 ? candidates[0] : null;
};

const applyRootSectionFlow = (
  previousRootElements: CanvasElement[],
  nextRootElements: CanvasElement[],
): CanvasElement[] => {
  const previousById = new Map(previousRootElements.map((element) => [element.id, element]));
  const changedFlowElements = nextRootElements.filter((nextElement) => {
    if (!isRootSectionFlowElement(nextElement)) {
      return false;
    }

    const previousElement = previousById.get(nextElement.id);
    if (!previousElement) {
      return true;
    }

    return (
      Math.round(previousElement.y) !== Math.round(nextElement.y) ||
      Math.round(previousElement.height) !== Math.round(nextElement.height) ||
      Math.round(elementBottom(previousElement)) !== Math.round(elementBottom(nextElement))
    );
  });

  if (changedFlowElements.length > 1) {
    const insertedElements = nextRootElements.filter((element) => !previousById.has(element.id));
    const insertedFlowElements = insertedElements.filter(isRootSectionFlowElement);

    if (insertedFlowElements.length === changedFlowElements.length) {
      const insertedIds = new Set(insertedElements.map((element) => element.id));
      return applyRootSectionInsertionFlow(
        nextRootElements.filter((element) => !insertedIds.has(element.id)),
        insertedElements,
      );
    }

    const derivedFlowChange = resolveDerivedRootSectionFlowChange(previousById, changedFlowElements);
    if (derivedFlowChange) {
      return nextRootElements.map((element) => {
        if (element.id === derivedFlowChange.changedElement.id) {
          return element;
        }

        const previousElement = previousById.get(element.id);
        const baselineY = previousElement?.y ?? element.y;
        if (baselineY < derivedFlowChange.flowBoundary) {
          return element;
        }

        return {
          ...element,
          y: Math.max(0, roundedCanvasValue(
            (previousElement?.y ?? element.y) + derivedFlowChange.deltaY,
          )),
        };
      });
    }

    return nextRootElements;
  }

  if (changedFlowElements.length === 0) {
    return nextRootElements;
  }

  const changedElement = changedFlowElements[0];
  const previousElement = previousById.get(changedElement.id);
  const previousBottom = previousElement ? elementBottom(previousElement) : changedElement.y;
  const nextBottom = elementBottom(changedElement);
  const deltaY = Math.round(nextBottom - previousBottom);

  if (deltaY === 0) {
    return nextRootElements;
  }

  const flowBoundary = previousElement ? previousBottom - 1 : changedElement.y;

  return nextRootElements.map((element) => {
    if (element.id === changedElement.id || element.y < flowBoundary) {
      return element;
    }

    return {
      ...element,
      y: Math.max(0, Math.round(element.y + deltaY)),
    };
  });
};

function applyRootSectionInsertionFlow(
  rootElements: CanvasElement[],
  insertedElements: CanvasElement[],
): CanvasElement[] {
  const boundarySnappedInsertedElements = snapRootSectionInsertionsToFlowBoundary(rootElements, insertedElements);
  const insertedFlowElements = boundarySnappedInsertedElements
    .filter(isRootSectionFlowElement)
    .sort((left, right) => left.y - right.y);

  if (insertedFlowElements.length === 0) {
    return [...rootElements, ...boundarySnappedInsertedElements];
  }

  const shiftedRootElements = rootElements.map((element) => {
    const deltaY = insertedFlowElements.reduce((delta, insertedElement) => {
      if (element.y < insertedElement.y) {
        return delta;
      }

      return delta + Math.max(0, Math.round(insertedElement.height));
    }, 0);

    if (deltaY === 0) {
      return element;
    }

    return {
      ...element,
      y: Math.max(0, Math.round(element.y + deltaY)),
    };
  });

  return [...shiftedRootElements, ...boundarySnappedInsertedElements];
}

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

    if (!jsonEqual(displayed.tokenRefs || {}, base.tokenRefs || {})) {
      nextOverride.tokenRefs = displayed.tokenRefs;
    } else {
      delete nextOverride.tokenRefs;
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

    if (key === 'tokenRefs') {
      if (isPlainRecord(value) && Object.keys(value).length > 0) {
        override.tokenRefs = value as ResponsiveElementOverride['tokenRefs'];
      } else {
        delete override.tokenRefs;
      }
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
      override.visible = parseEditorBoolean(groupOverride.visible, true);
    }
    if (groupOverride?.locked !== undefined && childOverride?.locked === undefined) {
      override.locked = parseEditorBoolean(groupOverride.locked, false);
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

const formatCanvasBreakpointLabel = (value: EditorBreakpoint) => (
  `${value.charAt(0).toUpperCase()}${value.slice(1)} canvas`
);

const clampCanvasDimension = (value: number, axis: 'width' | 'height') => (
  Math.min(axis === 'height' ? MAX_CANVAS_HEIGHT : MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_DIMENSION, Math.round(value)))
);

const mediaElementTypeForAsset = (mediaType: MediaAsset['type']): CanvasElement['type'] => {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'video') return 'video';
  if (mediaType === 'audio') return 'audio';
  return 'link';
};

const mediaElementSizeForType = (elementType: CanvasElement['type']): Pick<CanvasElement, 'width' | 'height'> => {
  if (elementType === 'image') return { width: 420, height: 280 };
  if (elementType === 'video') return { width: 520, height: 292 };
  if (elementType === 'audio') return { width: 420, height: 104 };
  return { width: 300, height: 48 };
};

const mediaUrlElementType = (kind: 'image' | 'video' | 'audio' | 'url'): CanvasElement['type'] => {
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  return 'link';
};

const readableUrlLabel = (value: string): string => {
  try {
    const parsed = new URL(value);
    const filename = parsed.pathname.split('/').filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : parsed.hostname;
  } catch {
    return value;
  }
};

const mediaIdentityPropsForCanvasDrop = (
  media: MediaAsset,
  mediaContext: MediaContext | undefined,
  source: 'canvas-file-drop' | 'canvas-url-drop',
) => ({
  mediaId: media.id,
  mediaIds: [media.id],
  mediaType: media.type,
  mediaName: media.name,
  mediaUrl: media.url,
  mediaVisibility: media.visibility || 'public',
  mediaScope: media.scope || mediaContext?.scope || 'global',
  mediaScopeTargetId: media.scopeTargetId || mediaContext?.targetId || null,
  mediaInsertedVia: source,
  mediaFolderId: media.folderId || null,
  mediaFolderPath: media.organization?.folderPath || null,
});

const buildCanvasElementForMediaAsset = (
  media: MediaAsset,
  point: { x: number; y: number },
  zIndex: number,
  mediaContext: MediaContext | undefined,
): CanvasElement => {
  const type = mediaElementTypeForAsset(media.type);
  const size = mediaElementSizeForType(type);
  const deliveryUrl = media.url || (mediaContext?.siteId ? getPublicMediaFileUrl(media.id, mediaContext.siteId) : '');
  const identity = mediaIdentityPropsForCanvasDrop(media, mediaContext, 'canvas-file-drop');
  const signedDelivery = media.visibility === 'private';

  if (type === 'link') {
    const downloadHref = mediaContext?.siteId
      ? `${getPublicMediaFileUrl(media.id, mediaContext.siteId)}?disposition=attachment`
      : deliveryUrl;
    return {
      id: generateId(),
      type: 'link',
      name: `Download ${media.name}`,
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      zIndex,
      props: {
        content: media.name,
        href: downloadHref,
        download: true,
        target: '_self',
        ...identity,
        fileId: media.id,
        fileIds: [media.id],
        fileMediaId: media.id,
        fileMediaIds: [media.id],
        downloadMediaId: media.id,
        downloadMediaIds: [media.id],
        fileMediaType: media.type,
        fileMediaName: media.name,
        fileMediaUrl: downloadHref,
        fileMediaVisibility: media.visibility || 'public',
        fileSignedUrlRequired: signedDelivery,
        fileSignedUrlEndpoint: signedDelivery && mediaContext?.siteId
          ? `/api/sites/${mediaContext.siteId}/media/${media.id}/signed-url`
          : '',
      },
      assetIds: [media.id],
      styles: {
        color: '#0f766e',
        fontSize: 16,
        fontWeight: 700,
        textDecoration: 'underline',
      },
    };
  }

  const commonProps = {
    src: deliveryUrl,
    ...identity,
    caption: media.caption || (type === 'audio' ? media.name : ''),
    title: media.caption || media.name,
    fileSignedUrlRequired: signedDelivery,
    fileSignedUrlEndpoint: signedDelivery && mediaContext?.siteId
      ? `/api/sites/${mediaContext.siteId}/media/${media.id}/signed-url`
      : '',
  };

  return {
    id: generateId(),
    type,
    name: media.name,
    x: point.x,
    y: point.y,
    width: size.width,
    height: size.height,
    zIndex,
    props: type === 'image'
      ? {
          ...commonProps,
          alt: media.altText || media.caption || media.name,
          objectFit: 'cover',
        }
      : type === 'video'
        ? {
            ...commonProps,
            controls: true,
            autoplay: false,
            loop: false,
            muted: false,
            playsInline: true,
            objectFit: 'cover',
          }
        : {
            ...commonProps,
            controls: true,
            autoplay: false,
            loop: false,
            transcript: '',
          },
    assetIds: [media.id],
  };
};

const buildCanvasElementForExternalMediaUrl = (
  url: string,
  kind: 'image' | 'video' | 'audio' | 'url',
  point: { x: number; y: number },
  zIndex: number,
): CanvasElement => {
  const type = mediaUrlElementType(kind);
  const size = mediaElementSizeForType(type);
  const label = readableUrlLabel(url);

  if (type === 'link') {
    return {
      id: generateId(),
      type: 'link',
      name: `External link ${label}`,
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      zIndex,
      props: {
        content: label,
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        mediaInsertedVia: 'canvas-url-drop',
        mediaExternalUrl: url,
      },
      styles: {
        color: '#2563eb',
        fontSize: 16,
        fontWeight: 700,
        textDecoration: 'underline',
      },
    };
  }

  return {
    id: generateId(),
    type,
    name: `External ${type} ${label}`,
    x: point.x,
    y: point.y,
    width: size.width,
    height: size.height,
    zIndex,
    props: type === 'image'
      ? {
          src: url,
          alt: label,
          objectFit: 'cover',
          mediaInsertedVia: 'canvas-url-drop',
          mediaExternalUrl: url,
        }
      : type === 'video'
        ? {
            src: url,
            controls: true,
            autoplay: false,
            loop: false,
            muted: false,
            playsInline: true,
            objectFit: 'cover',
            mediaInsertedVia: 'canvas-url-drop',
            mediaExternalUrl: url,
          }
        : {
            src: url,
            controls: true,
            autoplay: false,
            loop: false,
            caption: label,
            transcript: '',
            mediaInsertedVia: 'canvas-url-drop',
            mediaExternalUrl: url,
          },
  };
};

type CanvasMediaDropTargetMetadata = {
  targetParentId?: string | null;
  coordinateSpace?: 'canvas' | 'parent';
  canvasPoint?: { x: number; y: number };
};

const clampElementWithinParent = (
  element: CanvasElement,
  parent: CanvasElement,
): CanvasElement => {
  const maxX = Math.max(0, (Number(parent.width) || 0) - (Number(element.width) || 0));
  const maxY = Math.max(0, (Number(parent.height) || 0) - (Number(element.height) || 0));
  const nextX = Math.max(0, Math.min(Number(element.x) || 0, maxX));
  const nextY = Math.max(0, Math.min(Number(element.y) || 0, maxY));

  if (nextX === element.x && nextY === element.y) {
    return element;
  }

  return {
    ...element,
    x: nextX,
    y: nextY,
  };
};

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
  initialCanvasFocusMode?: boolean;
  initialSize?: CanvasSize;
  initialSelectedElementId?: string;
  theme?: ThemeConfig;
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
    animatedLayers: 0,
    actionLayers: 0,
    dataBoundLayers: 0,
    tokenRefLayers: 0,
    assetBoundLayers: 0,
    interactiveLayers: 0,
    hiddenLayers: 0,
    lockedLayers: 0,
    maxDepth: 0,
    typeCounts,
  };

  const valueHasAssetReference = (value: unknown): boolean => {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some(valueHasAssetReference);
    }
    if (isPlainRecord(value)) {
      return Object.entries(value).some(([key, entry]) => (
        EDITOR_ASSET_REFERENCE_KEYS.has(key) && valueHasAssetReference(entry)
      ));
    }
    return false;
  };

  const recordHasAssetReference = (record: unknown): boolean => (
    isPlainRecord(record) && Object.entries(record).some(([key, value]) => (
      EDITOR_ASSET_REFERENCE_KEYS.has(key) && valueHasAssetReference(value)
    ))
  );

  const responsiveHasTokenRefs = (responsive: CanvasElement['responsive']): boolean => (
    isPlainRecord(responsive) && Object.values(responsive).some((override) => (
      isPlainRecord(override) && hasNonEmptyRecord(override.tokenRefs)
    ))
  );

  const responsiveHasAssetReference = (responsive: CanvasElement['responsive']): boolean => (
    isPlainRecord(responsive) && Object.values(responsive).some((override) => (
      isPlainRecord(override) && (
        recordHasAssetReference(override.props) ||
        recordHasAssetReference(override.styles)
      )
    ))
  );

  const walk = (items: CanvasElement[], depth: number) => {
    metrics.maxDepth = Math.max(metrics.maxDepth, depth);
    items.forEach((item) => {
      const elementRecord = item as CanvasElement & Record<string, unknown>;
      const type = normalizeElementType(item.type);
      metrics.totalLayers += 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      if (depth > 0) metrics.nestedLayers += 1;
      if (isEditorGroupElement(item)) metrics.groupLayers += 1;
      if (item.children?.length) metrics.childContainerLayers += 1;
      if (item.responsive && Object.keys(item.responsive).length > 0) metrics.responsiveOverrideLayers += 1;
      if (item.animation) metrics.animatedLayers += 1;
      if (
        hasNonEmptyArray(elementRecord.actions) ||
        hasNonEmptyArray(item.props.actions) ||
        Array.from(EDITOR_ACTION_PROP_KEYS).some((key) => getNonEmptyString(item.props[key]))
      ) metrics.actionLayers += 1;
      if (hasNonEmptyArray(item.dataBindings) || hasNonEmptyArray(item.bindingSlots)) metrics.dataBoundLayers += 1;
      if (
        hasNonEmptyRecord(item.tokenRefs) ||
        hasNonEmptyRecord(item.animation?.tokenRefs) ||
        responsiveHasTokenRefs(item.responsive)
      ) metrics.tokenRefLayers += 1;
      if (
        hasNonEmptyArray(item.assetIds) ||
        recordHasAssetReference(item.props) ||
        recordHasAssetReference(item.styles) ||
        responsiveHasAssetReference(item.responsive)
      ) metrics.assetBoundLayers += 1;
      if (
        INTERACTIVE_ELEMENT_TYPES.has(item.type) ||
        getNonEmptyString(item.props.componentKey) ||
        hasNonEmptyArray(item.props.controls) ||
        hasNonEmptyRecord(item.props.renderCapabilities)
      ) metrics.interactiveLayers += 1;
      if (isLayerHidden(item)) metrics.hiddenLayers += 1;
      if (isLayerLocked(item)) metrics.lockedLayers += 1;

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
  initialCanvasFocusMode = false,
  initialSize,
  initialSelectedElementId,
  theme,
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
  const editorThemeTokens = useMemo(() => buildBackyThemeTokens(theme || {}), [theme]);
  const editorThemeCssVariables = useMemo(
    () => buildBackyThemeCssVariables(editorThemeTokens) as CSSProperties,
    [editorThemeTokens],
  );
  const [reusableSections, setReusableSections] = useState<ReusableSection[]>([]);
  const [reusableSectionsLoading, setReusableSectionsLoading] = useState(false);
  const [reusableSectionsError, setReusableSectionsError] = useState<string | null>(null);
  const [interactiveComponents, setInteractiveComponents] = useState<InteractiveComponentRegistryEntry[]>([]);
  const [interactiveComponentsLoading, setInteractiveComponentsLoading] = useState(false);
  const [interactiveComponentsError, setInteractiveComponentsError] = useState<string | null>(null);
  const [isSavingReusableSection, setIsSavingReusableSection] = useState(false);
  const [reusableSectionDraftSubmitted, setReusableSectionDraftSubmitted] = useState(false);
  const [pendingDeleteReusableSection, setPendingDeleteReusableSection] = useState<ReusableSection | null>(null);
  const [deletingReusableSectionId, setDeletingReusableSectionId] = useState<string | null>(null);
  const [reusableSectionDraft, setReusableSectionDraft] = useState<{
    mode: 'save' | 'rename';
    name: string;
    sourceElementId?: string;
    sectionId?: string;
  } | null>(null);
  const reusableSectionDraftNameInlineError = reusableSectionDraftSubmitted && reusableSectionDraft?.name.trim().length === 0
    ? 'Enter a section name before saving.'
    : null;
  const reusableSectionDraftActionStatusId = 'editor-reusable-section-action-status';
  const reusableSectionDraftActionStatus = reusableSectionDraft
    ? [
      reusableSectionDraft.mode === 'save'
        ? 'Save selected layer as reusable section.'
        : 'Rename reusable section.',
      reusableSectionDraftNameInlineError
        ? `Name unavailable: ${reusableSectionDraftNameInlineError}`
        : 'Name field ready.',
      isSavingReusableSection ? 'Reusable section save is running.' : 'Submit action available.',
    ].join(' ')
    : '';
  const pendingDeleteReusableSectionStatusId = 'editor-reusable-section-delete-status';
  const isDeletingReusableSection = Boolean(
    pendingDeleteReusableSection && deletingReusableSectionId === pendingDeleteReusableSection.id,
  );
  const pendingDeleteReusableSectionStatus = pendingDeleteReusableSection
    ? [
      `Delete ${pendingDeleteReusableSection.name} from the component library.`,
      isDeletingReusableSection ? 'Delete is running.' : 'Delete action available.',
      'Existing canvas layers will stay where they are.',
    ].join(' ')
    : '';
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [libraryDragItem, setLibraryDragItem] = useState<ComponentLibraryItem | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [activeCommandPaletteIndex, setActiveCommandPaletteIndex] = useState(0);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);

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
  const [compactEditorPanel, setCompactEditorPanel] = useState<'components' | 'inspector' | null>(null);
  const [isCompactEditorShellViewport, setIsCompactEditorShellViewport] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(EDITOR_COMPACT_SHELL_MEDIA_QUERY).matches;
  });
  const [isCanvasFocusMode, setIsCanvasFocusMode] = useState(Boolean(initialCanvasFocusMode));
  const isEditorPanelChromeSuppressed = isPreview || isCanvasFocusMode;
  const isComponentPanelVisible = !isEditorPanelChromeSuppressed &&
    showComponentPanel &&
    (!isCompactEditorShellViewport || compactEditorPanel === 'components');
  const isInspectorPanelVisible = !isEditorPanelChromeSuppressed &&
    showInspectorPanel &&
    (!isCompactEditorShellViewport || compactEditorPanel === 'inspector');
  const isCompactEditorPanelOverlayVisible = isCompactEditorShellViewport &&
    (isComponentPanelVisible || isInspectorPanelVisible);
  const areCompactEditorPanelsAutoCollapsed = isCompactEditorShellViewport &&
    !isEditorPanelChromeSuppressed &&
    !isComponentPanelVisible &&
    !isInspectorPanelVisible;
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
  const isCanvasMutationDisabled = isPreview || !canEdit;
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const activeSaveModeRef = useRef<EditorSaveMode | null>(null);
  const queuedManualSaveRef = useRef(false);
  const manualSaveRequestedRef = useRef(false);
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
  const [clipboardElements, setClipboardElements] = useState<EditorClipboardItem[]>([]);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const canvasScaleRef = useRef(1);
  const canvasZoomRef = useRef(1);
  const [isCanvasAutoFit, setIsCanvasAutoFit] = useState(true);
  const isCanvasAutoFitRef = useRef(true);
  const [isCanvasPanMode, setIsCanvasPanMode] = useState(false);
  const [isCanvasSpacePanning, setIsCanvasSpacePanning] = useState(false);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const safeEditorGridSize = normalizeEditorGridSize(gridSize);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasScaleSurfaceRef = useRef<HTMLDivElement>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const canvasPanRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const canvasGestureScaleRef = useRef(1);
  const isCanvasGestureZoomActiveRef = useRef(false);
  const isEditorShellPointerInsideRef = useRef(false);
  const lastEditorShellPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const activeCanvasScale = isPreview ? canvasScale : canvasZoom;
  const isCanvasPanActive = !isPreview && (isCanvasPanMode || isCanvasSpacePanning);
  const displayedElements = useMemo(
    () => applyResponsiveOverridesToElements(elements, breakpoint),
    [breakpoint, elements],
  );
  const displayedContentBounds = useMemo(
    () => collectCanvasContentBounds(displayedElements),
    [displayedElements],
  );
  const renderedCanvasSize = useMemo<CanvasSize>(
    () => expandCanvasSizeToContent(size, displayedContentBounds),
    [displayedContentBounds, size],
  );
  const scaledCanvasWidth = Math.max(1, Math.round(renderedCanvasSize.width * activeCanvasScale));
  const scaledCanvasHeight = Math.max(1, Math.round(renderedCanvasSize.height * activeCanvasScale));
  const zoomPercent = Math.round(activeCanvasScale * 100);
  const horizontalRulerTicks = useMemo(
    () => buildRulerTicks(renderedCanvasSize.width, activeCanvasScale),
    [activeCanvasScale, renderedCanvasSize.width],
  );
  const verticalRulerTicks = useMemo(
    () => buildRulerTicks(renderedCanvasSize.height, activeCanvasScale),
    [activeCanvasScale, renderedCanvasSize.height],
  );

  useEffect(() => {
    canvasScaleRef.current = canvasScale;
  }, [canvasScale]);

  useEffect(() => {
    canvasZoomRef.current = canvasZoom;
  }, [canvasZoom]);

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
    return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value));
  }, []);

  const setCanvasZoomValue = useCallback((value: number) => {
    const nextZoom = clampCanvasZoom(value);
    canvasZoomRef.current = nextZoom;
    setCanvasZoom(nextZoom);
    return nextZoom;
  }, [clampCanvasZoom]);

  const setCanvasScaleValue = useCallback((value: number) => {
    const nextScale = clampCanvasZoom(value);
    canvasScaleRef.current = nextScale;
    setCanvasScale(nextScale);
    return nextScale;
  }, [clampCanvasZoom]);

  const setCanvasAutoFitValue = useCallback((value: boolean) => {
    isCanvasAutoFitRef.current = value;
    setIsCanvasAutoFit(value);
  }, []);

  const zoomCanvasAtPoint = useCallback((
    computeNextZoom: (currentZoom: number) => number,
    anchor?: { clientX: number; clientY: number },
  ) => {
    const currentZoom = isPreview ? canvasScaleRef.current : canvasZoomRef.current;
    const nextZoom = clampCanvasZoom(Number(computeNextZoom(currentZoom).toFixed(2)));
    const viewport = canvasViewportRef.current;
    const applyActiveCanvasScale = isPreview ? setCanvasScaleValue : setCanvasZoomValue;

    setCanvasAutoFitValue(false);
    if (!viewport || Math.abs(nextZoom - currentZoom) < 0.001) {
      applyActiveCanvasScale(nextZoom);
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const anchorX = Number.isFinite(anchor?.clientX)
      ? Math.max(0, Math.min(viewport.clientWidth, (anchor?.clientX ?? viewportRect.left) - viewportRect.left))
      : viewport.clientWidth / 2;
    const anchorY = Number.isFinite(anchor?.clientY)
      ? Math.max(0, Math.min(viewport.clientHeight, (anchor?.clientY ?? viewportRect.top) - viewportRect.top))
      : viewport.clientHeight / 2;
    const zoomRatio = nextZoom / Math.max(currentZoom, CANVAS_ZOOM_MIN);
    const nextScrollLeft = (viewport.scrollLeft + anchorX) * zoomRatio - anchorX;
    const nextScrollTop = (viewport.scrollTop + anchorY) * zoomRatio - anchorY;

    applyActiveCanvasScale(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, nextScrollLeft);
      viewport.scrollTop = Math.max(0, nextScrollTop);
    });
  }, [clampCanvasZoom, isPreview, setCanvasAutoFitValue, setCanvasScaleValue, setCanvasZoomValue]);

  const preventCanvasBrowserZoom = useCallback((event: Event) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    if ('stopImmediatePropagation' in event) {
      event.stopImmediatePropagation();
    }
  }, []);

  const getCanvasZoomAnchor = useCallback((event?: Event) => {
    const pointerEvent = event as Event & { clientX?: number; clientY?: number } | undefined;
    if (Number.isFinite(pointerEvent?.clientX) && Number.isFinite(pointerEvent?.clientY)) {
      return {
        clientX: Number(pointerEvent?.clientX),
        clientY: Number(pointerEvent?.clientY),
      };
    }

    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const rect = viewport.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }, []);

  const isCanvasViewportEvent = useCallback((event: Event) => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return false;
    }

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(viewport)) {
      return true;
    }

    const pointerEvent = event as Event & { clientX?: number; clientY?: number };
    if (!Number.isFinite(pointerEvent.clientX) || !Number.isFinite(pointerEvent.clientY)) {
      return false;
    }

    const rect = viewport.getBoundingClientRect();
    const clientX = Number(pointerEvent.clientX);
    const clientY = Number(pointerEvent.clientY);

    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

  const rememberEditorShellZoomPointer = useCallback((
    event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>,
  ) => {
    isEditorShellPointerInsideRef.current = true;
    const nativeEvent = event.nativeEvent;
    if (!Number.isFinite(nativeEvent.clientX) || !Number.isFinite(nativeEvent.clientY)) {
      return;
    }

    lastEditorShellPointerRef.current = {
      clientX: Number(nativeEvent.clientX),
      clientY: Number(nativeEvent.clientY),
    };
  }, []);

  const rememberEditorShellZoomFocus = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    const shell = editorShellRef.current;
    if (shell && event.target instanceof HTMLElement && shell.contains(event.target)) {
      isEditorShellPointerInsideRef.current = true;
    }
  }, []);

  const clearEditorShellZoomPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const shell = editorShellRef.current;
    const relatedTarget = event.relatedTarget;
    if (shell && relatedTarget instanceof Node && shell.contains(relatedTarget)) {
      return;
    }

    isEditorShellPointerInsideRef.current = false;
    lastEditorShellPointerRef.current = null;
  }, []);

  const hasRecentEditorShellZoomPointer = useCallback(() => (
    isEditorShellPointerInsideRef.current || Boolean(lastEditorShellPointerRef.current)
  ), []);

  const hasEditorShellZoomFocus = useCallback(() => {
    const shell = editorShellRef.current;
    const activeElement = document.activeElement;

    return Boolean(shell && activeElement instanceof HTMLElement && shell.contains(activeElement));
  }, []);

  const isEditorCanvasZoomEvent = useCallback((event: Event) => {
    if (isCanvasViewportEvent(event)) {
      return true;
    }

    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return false;
    }

    const shell = editorShellRef.current;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (shell && path.includes(shell)) {
      return true;
    }

    const target = event.target;
    const isGlobalTarget =
      target === window ||
      target === document ||
      target === document.documentElement ||
      target === document.body;
    const pointerEvent = event as Event & { clientX?: number; clientY?: number };
    if (Number.isFinite(pointerEvent.clientX) && Number.isFinite(pointerEvent.clientY)) {
      if (!shell) {
        return false;
      }

      const rect = shell.getBoundingClientRect();
      const clientX = Number(pointerEvent.clientX);
      const clientY = Number(pointerEvent.clientY);
      const isInsideEditorShell = (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
      if (isInsideEditorShell) {
        return true;
      }

      const isZeroCoordinateGlobalEvent = isGlobalTarget && clientX === 0 && clientY === 0;
      if (!isZeroCoordinateGlobalEvent) {
        return isGlobalTarget && (hasRecentEditorShellZoomPointer() || hasEditorShellZoomFocus());
      }
    }

    const hasActiveEditorZoomContext = hasRecentEditorShellZoomPointer() || hasEditorShellZoomFocus();
    if (isGlobalTarget && hasActiveEditorZoomContext) {
      return true;
    }

    // macOS browser pinch events can arrive without usable client coordinates.
    return false;
  }, [hasEditorShellZoomFocus, hasRecentEditorShellZoomPointer, isCanvasViewportEvent]);

  const handleZoomIn = useCallback(() => {
    zoomCanvasAtPoint((current) => current + CANVAS_ZOOM_STEP);
  }, [zoomCanvasAtPoint]);

  const handleZoomOut = useCallback(() => {
    zoomCanvasAtPoint((current) => current - CANVAS_ZOOM_STEP);
  }, [zoomCanvasAtPoint]);

  const handleCanvasZoomPercentChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setCanvasAutoFitValue(false);
    setCanvasZoomValue(parsed / 100);
  }, [setCanvasAutoFitValue, setCanvasZoomValue]);

  const readCanvasWheelDeltaY = useCallback((event: Event) => {
    const wheelEvent = event as CanvasWheelZoomEvent;
    if (Number.isFinite(wheelEvent.deltaY)) {
      const deltaModeMultiplier = wheelEvent.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? CANVAS_WHEEL_DELTA_LINE_MULTIPLIER
        : wheelEvent.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? CANVAS_WHEEL_DELTA_PAGE_MULTIPLIER
          : 1;
      return wheelEvent.deltaY * deltaModeMultiplier;
    }

    if (Number.isFinite(wheelEvent.wheelDeltaY)) {
      return -Number(wheelEvent.wheelDeltaY) / 3;
    }

    if (Number.isFinite(wheelEvent.wheelDelta)) {
      return -Number(wheelEvent.wheelDelta) / 3;
    }

    if (Number.isFinite(wheelEvent.detail)) {
      return Number(wheelEvent.detail) * CANVAS_WHEEL_DELTA_LINE_MULTIPLIER;
    }

    return 0;
  }, []);

  const handleCanvasWheelZoom = useCallback((event: Event) => {
    const wheelEvent = event as MouseEvent;
    if (!(wheelEvent.metaKey || wheelEvent.ctrlKey)) {
      return;
    }
    if (!isEditorCanvasZoomEvent(event)) {
      return;
    }

    preventCanvasBrowserZoom(event);
    const normalizedDeltaY = readCanvasWheelDeltaY(event);
    if (Math.abs(normalizedDeltaY) < 0.01) {
      return;
    }

    const direction = normalizedDeltaY > 0 ? -1 : 1;
    const strength = Math.min(3, Math.max(0.35, Math.abs(normalizedDeltaY) / 100));
    zoomCanvasAtPoint(
      (current) => current + direction * CANVAS_WHEEL_ZOOM_STEP * strength,
      getCanvasZoomAnchor(wheelEvent),
    );
  }, [getCanvasZoomAnchor, isEditorCanvasZoomEvent, preventCanvasBrowserZoom, readCanvasWheelDeltaY, zoomCanvasAtPoint]);

  const readGestureScale = useCallback((event: Event) => {
    const scale = Number((event as Event & { scale?: number }).scale);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }, []);

  const handleCanvasGestureStart = useCallback((event: Event) => {
    if (!isEditorCanvasZoomEvent(event)) {
      isCanvasGestureZoomActiveRef.current = false;
      return;
    }

    preventCanvasBrowserZoom(event);
    isCanvasGestureZoomActiveRef.current = true;
    canvasGestureScaleRef.current = readGestureScale(event);
  }, [isEditorCanvasZoomEvent, preventCanvasBrowserZoom, readGestureScale]);

  const handleCanvasGestureChange = useCallback((event: Event) => {
    if (!isCanvasGestureZoomActiveRef.current && !isEditorCanvasZoomEvent(event)) {
      return;
    }

    preventCanvasBrowserZoom(event);
    const nextGestureScale = readGestureScale(event);
    const previousGestureScale = Math.max(0.01, canvasGestureScaleRef.current || 1);
    const gestureRatio = nextGestureScale / previousGestureScale;

    canvasGestureScaleRef.current = nextGestureScale;
    zoomCanvasAtPoint(
      (current) => current * gestureRatio,
      getCanvasZoomAnchor(event),
    );
  }, [getCanvasZoomAnchor, isEditorCanvasZoomEvent, preventCanvasBrowserZoom, readGestureScale, zoomCanvasAtPoint]);

  const handleCanvasGestureEnd = useCallback((event: Event) => {
    if (!isCanvasGestureZoomActiveRef.current && !isEditorCanvasZoomEvent(event)) {
      return;
    }

    preventCanvasBrowserZoom(event);
    canvasGestureScaleRef.current = 1;
    isCanvasGestureZoomActiveRef.current = false;
  }, [isEditorCanvasZoomEvent, preventCanvasBrowserZoom]);

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

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return undefined;
    }
    const shell = editorShellRef.current;
    const surface = canvasScaleSurfaceRef.current;
    const root = document.documentElement;
    const body = document.body;
    const visualViewport = window.visualViewport ?? null;
    const maybeZoomTargets: Array<EventTarget | null> = [window, visualViewport, document, root, body, shell, viewport, surface];
    const zoomTargets = maybeZoomTargets.filter(
      (target): target is EventTarget => target !== null,
    );

    zoomTargets.forEach((target) => {
      target.addEventListener('wheel', handleCanvasWheelZoom, { capture: true, passive: false });
      target.addEventListener('mousewheel', handleCanvasWheelZoom, { capture: true, passive: false });
      target.addEventListener('gesturestart', handleCanvasGestureStart, { capture: true, passive: false });
      target.addEventListener('gesturechange', handleCanvasGestureChange, { capture: true, passive: false });
      target.addEventListener('gestureend', handleCanvasGestureEnd, { capture: true, passive: false });
    });

    return () => {
      zoomTargets.forEach((target) => {
        target.removeEventListener('wheel', handleCanvasWheelZoom, { capture: true });
        target.removeEventListener('mousewheel', handleCanvasWheelZoom, { capture: true });
        target.removeEventListener('gesturestart', handleCanvasGestureStart, { capture: true });
        target.removeEventListener('gesturechange', handleCanvasGestureChange, { capture: true });
        target.removeEventListener('gestureend', handleCanvasGestureEnd, { capture: true });
      });
      isCanvasGestureZoomActiveRef.current = false;
    };
  }, [
    handleCanvasGestureChange,
    handleCanvasGestureEnd,
    handleCanvasGestureStart,
    handleCanvasWheelZoom,
    isPreview,
  ]);

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
      if (isPreview) {
        setCanvasScaleValue(1);
      } else {
        setCanvasZoomValue(1);
      }
      return;
    }

    const availableWidth = Math.max(container.clientWidth - 96, 1);
    const availableHeight = Math.max(container.clientHeight - 120, 1);
    const fitWidth = isPreview ? renderedCanvasSize.width : size.width;
    const fitHeight = isPreview ? renderedCanvasSize.height : size.height;
    const nextScale = isPreview
      ? Math.min(1, availableWidth / fitWidth)
      : Math.min(1.5, availableWidth / fitWidth, availableHeight / fitHeight);
    const normalizedScale = Number(nextScale.toFixed(2));
    if (isPreview) {
      setCanvasScaleValue(normalizedScale);
      return;
    }
    setCanvasZoomValue(normalizedScale);
  }, [
    isPreview,
    renderedCanvasSize.height,
    renderedCanvasSize.width,
    setCanvasScaleValue,
    setCanvasZoomValue,
    size.height,
    size.width,
  ]);

  const handleFitCanvas = useCallback(() => {
    setCanvasAutoFitValue(true);
    applyFitCanvas();
  }, [applyFitCanvas, setCanvasAutoFitValue]);

  const handleToggleCanvasFocus = useCallback(() => {
    setIsCanvasFocusMode((current) => !current);
    window.requestAnimationFrame(() => {
      handleFitCanvas();
    });
  }, [handleFitCanvas]);

  useEffect(() => {
    setIsCanvasFocusMode(Boolean(initialCanvasFocusMode));
  }, [initialCanvasFocusMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(EDITOR_COMPACT_SHELL_MEDIA_QUERY);
    const handleChange = () => {
      setIsCompactEditorShellViewport(mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isCompactEditorShellViewport) {
      setCompactEditorPanel(null);
    }
  }, [isCompactEditorShellViewport]);

  const handleToggleComponentPanel = useCallback(() => {
    setIsCanvasFocusMode(false);
    if (isCompactEditorShellViewport) {
      setShowComponentPanel(true);
      setCompactEditorPanel((current) => (
        current === 'components' && !isCanvasFocusMode ? null : 'components'
      ));
      return;
    }

    setShowComponentPanel((current) => (isCanvasFocusMode ? true : !current));
  }, [isCanvasFocusMode, isCompactEditorShellViewport]);

  const handleToggleInspectorPanel = useCallback(() => {
    setIsCanvasFocusMode(false);
    if (isCompactEditorShellViewport) {
      setShowInspectorPanel(true);
      setCompactEditorPanel((current) => (
        current === 'inspector' && !isCanvasFocusMode ? null : 'inspector'
      ));
      return;
    }

    setShowInspectorPanel((current) => (isCanvasFocusMode ? true : !current));
  }, [isCanvasFocusMode, isCompactEditorShellViewport]);

  const handleToggleLayersPanel = useCallback(() => {
    setIsCanvasFocusMode(false);
    if (isCompactEditorShellViewport) {
      setShowInspectorPanel(true);
      setCompactEditorPanel('inspector');
      setRightPanel((current) => (
        current === 'layers' && compactEditorPanel === 'inspector' && !isCanvasFocusMode
          ? 'properties'
          : 'layers'
      ));
      return;
    }

    setShowInspectorPanel(true);
    setRightPanel((current) => (
      current === 'layers' && isInspectorPanelVisible ? 'properties' : 'layers'
    ));
  }, [compactEditorPanel, isCanvasFocusMode, isCompactEditorShellViewport, isInspectorPanelVisible]);

  const applyCanvasSize = useCallback((nextSize: CanvasSize, nextBreakpoint = breakpoint) => {
    if (isCanvasMutationDisabled) {
      setEditorNotice(editDisabledReason);
      return;
    }
    const normalizedSize = {
      ...nextSize,
      width: clampCanvasDimension(nextSize.width, 'width'),
      height: clampCanvasDimension(nextSize.height, 'height'),
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
  const activeCanvasPresetLabel = CANVAS_SIZE_PRESETS.find((preset) => preset.id === activeCanvasPresetId)?.label || 'Custom';
  const activeBreakpointLabel = formatCanvasBreakpointLabel(breakpoint);
  const totalResponsiveOverrideLayerCount = useMemo(() => countResponsiveOverrideLayers(elements), [elements]);
  const activeBreakpointOverrideLayerCount = useMemo(() => (
    breakpoint === 'desktop' ? 0 : countResponsiveOverrideLayers(elements, breakpoint)
  ), [breakpoint, elements]);
  const responsiveViewportInheritanceState = breakpoint === 'desktop'
    ? 'desktop-source'
    : activeBreakpointOverrideLayerCount > 0
    ? 'overrides'
    : 'inherits-desktop';
  const responsiveViewportSummaryLabel = breakpoint === 'desktop'
    ? `${totalResponsiveOverrideLayerCount} breakpoint override layer${totalResponsiveOverrideLayerCount === 1 ? '' : 's'}`
    : activeBreakpointOverrideLayerCount > 0
    ? `${activeBreakpointOverrideLayerCount} override layer${activeBreakpointOverrideLayerCount === 1 ? '' : 's'}`
    : 'Inherits desktop';
  const responsiveViewportActionStatus = breakpoint === 'desktop'
    ? totalResponsiveOverrideLayerCount > 0
      ? `${totalResponsiveOverrideLayerCount} layer${totalResponsiveOverrideLayerCount === 1 ? '' : 's'} include tablet or mobile overrides for frontend renderers.`
      : 'Desktop is the source of truth; tablet and mobile inherit it until a breakpoint override is authored.'
    : activeBreakpointOverrideLayerCount > 0
    ? `${activeBreakpointLabel} has ${activeBreakpointOverrideLayerCount} layer${activeBreakpointOverrideLayerCount === 1 ? '' : 's'} with local responsive overrides. Other groups inherit desktop.`
    : `${activeBreakpointLabel} currently inherits desktop settings. Edit layer geometry, content, style, or state here to create a ${breakpoint} override.`;
  const canvasViewportActionStatusId = 'editor-viewport-action-status';
  const canvasViewportDisabledReason = isCanvasMutationDisabled
    ? isPreview
      ? 'Exit preview mode before changing the canvas viewport.'
      : editDisabledReason
    : '';
  const canvasViewportActionState = isCanvasMutationDisabled ? 'blocked' : 'ready';
  const canvasViewportActionStatus = isCanvasMutationDisabled
    ? `Viewport controls unavailable: ${canvasViewportDisabledReason}`
    : `${activeBreakpointLabel} active at ${size.width} x ${size.height}px. Canvas preset and dimensions are editable. ${responsiveViewportActionStatus}`;
  const canvasSizeControlActionStatus = isCanvasMutationDisabled
    ? `Canvas size controls unavailable: ${canvasViewportDisabledReason}`
    : `Canvas size editable. Current size ${size.width} x ${size.height}px using ${activeCanvasPresetLabel} preset.`;
  const breakpointControlActionState = (targetBreakpoint: EditorBreakpoint) => (
    isCanvasMutationDisabled ? 'blocked' : breakpoint === targetBreakpoint ? 'selected' : 'ready'
  );
  const breakpointControlActionStatus = (targetBreakpoint: EditorBreakpoint) => {
    const targetLabel = formatCanvasBreakpointLabel(targetBreakpoint);
    if (isCanvasMutationDisabled) {
      return `Switch to ${targetLabel} unavailable: ${canvasViewportDisabledReason}`;
    }
    if (breakpoint === targetBreakpoint) {
      return `${targetLabel} is active at ${size.width} x ${size.height}px.`;
    }
    const preset = CANVAS_SIZE_PRESETS.find((item) => item.id === targetBreakpoint);
    return `Switch to ${targetLabel}${preset ? ` at ${preset.width} x ${preset.height}px` : ''}.`;
  };

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
        const isVisible = parentVisible && !isLayerHidden(element);
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
  const visibleCanvasElementIds = useMemo(
    () => collectCyclableElementIds(displayedElements),
    [collectCyclableElementIds, displayedElements],
  );
  const totalCanvasElementCount = useMemo(
    () => collectCanvasElementIds(displayedElements).size,
    [displayedElements],
  );

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
      if (!hasBrowserUserActivation()) {
        return;
      }

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

  const insertRootCanvasElements = useCallback((newElements: CanvasElement[]) => {
    if (newElements.length === 0 || isCanvasMutationDisabled) {
      return;
    }

    const currentElements = elementsRef.current;
    const nextElements = applyRootSectionInsertionFlow(currentElements, newElements);
    const expandedSize = expandCanvasSizeToContent(size, collectCanvasContentBounds(nextElements));
    const nextSize: CanvasSize = {
      ...size,
      width: clampCanvasDimension(expandedSize.width, 'width'),
      height: clampCanvasDimension(expandedSize.height, 'height'),
    };
    const shouldGrowCanvas = nextSize.width !== size.width || nextSize.height !== size.height;
    const nextSelectedIds = newElements.map((element) => element.id);

    if (shouldGrowCanvas) {
      setSize(nextSize);
    }

    updateElementsWithHistory(nextElements, newElements[0]?.id || null, nextSelectedIds);
    setSelectedId(newElements[0]?.id || null);
    setSelectedIds(nextSelectedIds);
    setRightPanel('properties');
  }, [isCanvasMutationDisabled, size, updateElementsWithHistory]);

  const insertNestedCanvasElements = useCallback((
    parentId: string,
    newElements: CanvasElement[],
  ): boolean => {
    if (newElements.length === 0 || isCanvasMutationDisabled) {
      return false;
    }

    const parentElement = findElementById(elementsRef.current, parentId);
    if (!parentElement || isLayerLocked(parentElement) || !canAcceptNestedDrop(parentElement.type)) {
      return false;
    }

    let nextElements = elementsRef.current;
    let inserted = false;
    const boundedNewElements = newElements.map((element) => clampElementWithinParent(element, parentElement));

    for (const element of boundedNewElements) {
      const insertResult = insertElementAsChild(nextElements, parentId, element);
      if (insertResult.updated) {
        nextElements = insertResult.elements;
        inserted = true;
      }
    }

    if (!inserted) {
      return false;
    }

    const nextSelectedIds = boundedNewElements.map((element) => element.id);
    updateElementsWithHistory(nextElements, boundedNewElements[0]?.id || null, nextSelectedIds);
    setSelectedId(boundedNewElements[0]?.id || null);
    setSelectedIds(nextSelectedIds);
    setRightPanel('properties');
    return true;
  }, [findElementById, isCanvasMutationDisabled, updateElementsWithHistory]);

  const handleCanvasMediaFilesDrop = useCallback(async (
    files: File[],
    point: { x: number; y: number },
    metadata: { source: 'canvas-file-drop' } & CanvasMediaDropTargetMetadata,
  ) => {
    if (isCanvasMutationDisabled) {
      setEditorNotice(editDisabledReason);
      return;
    }

    if (!canCreateMedia) {
      setEditorNotice(mediaCreateDisabledReason || 'You do not have permission to upload media.');
      return;
    }

    if (!activeSiteId) {
      setEditorNotice('Select a site before uploading media into the canvas.');
      return;
    }

    const acceptedFiles = files.filter((file) => file.size >= 0);
    if (acceptedFiles.length === 0) {
      return;
    }

    setEditorNotice(`Uploading ${acceptedFiles.length} media file${acceptedFiles.length === 1 ? '' : 's'} into the canvas...`);

    try {
      const uploadedAssets: MediaAsset[] = [];

      for (const file of acceptedFiles) {
        const uploaded = await uploadMedia(file, {
          siteId: activeSiteId,
          scope: mediaContext?.scope || 'global',
          scopeTargetId: mediaContext?.targetId || null,
          visibility: 'public',
          metadata: {
            schemaVersion: 'backy.canvas-asset-drop.v1',
            source: 'canvas-file-drop',
            editorMode: mode,
            canvasPoint: point,
            canvasRootPoint: metadata.canvasPoint || point,
            coordinateSpace: metadata.coordinateSpace || 'canvas',
            targetParentId: metadata.targetParentId || null,
            originalFileName: file.name,
          },
        });
        uploadedAssets.push(uploaded);
      }

      if (uploadedAssets.length === 0) {
        return;
      }

      const existingById = new Map(media.map((item) => [item.id, item]));
      uploadedAssets.forEach((item) => existingById.set(item.id, item));
      setMedia(Array.from(existingById.values()));

      let cursorY = point.y;
      const startingZIndex = Math.max(walkTreeMaxZ(elementsRef.current), 0) + 1;
      const newElements = uploadedAssets.map((asset, index) => {
        const element = buildCanvasElementForMediaAsset(
          asset,
          { x: point.x, y: cursorY },
          startingZIndex + index,
          mediaContext,
        );
        cursorY += element.height + CANVAS_MEDIA_DROP_GAP;
        return element;
      });

      const insertedIntoParent = metadata.targetParentId
        ? insertNestedCanvasElements(metadata.targetParentId, newElements)
        : false;

      if (!insertedIntoParent) {
        if (metadata.coordinateSpace === 'parent' && metadata.canvasPoint) {
          const rootFallbackElements = newElements.map((element, index) => ({
            ...element,
            x: metadata.canvasPoint!.x,
            y: metadata.canvasPoint!.y + index * (element.height + CANVAS_MEDIA_DROP_GAP),
          }));
          insertRootCanvasElements(rootFallbackElements);
        } else {
          insertRootCanvasElements(newElements);
        }
      }

      setEditorNotice(insertedIntoParent
        ? `Placed ${uploadedAssets.length} uploaded media file${uploadedAssets.length === 1 ? '' : 's'} inside the target layer.`
        : `Placed ${uploadedAssets.length} uploaded media file${uploadedAssets.length === 1 ? '' : 's'} on the canvas.`);
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to upload dropped media files.');
    }
  }, [
    activeSiteId,
    canCreateMedia,
    editDisabledReason,
    insertNestedCanvasElements,
    insertRootCanvasElements,
    isCanvasMutationDisabled,
    media,
    mediaContext,
    mediaCreateDisabledReason,
    mode,
    setMedia,
  ]);

  const handleCanvasExternalMediaUrlDrop = useCallback((
    url: string,
    point: { x: number; y: number },
    metadata: { kind: 'image' | 'video' | 'audio' | 'url' } & CanvasMediaDropTargetMetadata,
  ) => {
    if (isCanvasMutationDisabled) {
      setEditorNotice(editDisabledReason);
      return;
    }

    const element = buildCanvasElementForExternalMediaUrl(
      url,
      metadata.kind,
      point,
      Math.max(walkTreeMaxZ(elementsRef.current), 0) + 1,
    );

    const insertedIntoParent = metadata.targetParentId
      ? insertNestedCanvasElements(metadata.targetParentId, [element])
      : false;

    if (!insertedIntoParent) {
      const rootFallbackElement = metadata.coordinateSpace === 'parent' && metadata.canvasPoint
        ? { ...element, x: metadata.canvasPoint.x, y: metadata.canvasPoint.y }
        : element;
      insertRootCanvasElements([rootFallbackElement]);
    }

    setEditorNotice(metadata.kind === 'url'
      ? insertedIntoParent
        ? 'Placed external link inside the target layer.'
        : 'Placed external link on the canvas.'
      : insertedIntoParent
        ? `Placed external ${metadata.kind} media inside the target layer.`
        : `Placed external ${metadata.kind} media on the canvas.`);
  }, [editDisabledReason, insertNestedCanvasElements, insertRootCanvasElements, isCanvasMutationDisabled]);

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
        (!options.requireUnlocked || !isLayerLocked(entry.element))
      ));
  }, [findElementEntry, selectedId, selectedIds]);

  const handleCopy = useCallback(() => {
    const entries = getSelectedSiblingEntries(elementsRef.current);
    if (entries.length > 0) {
      setClipboardElements(entries.map((entry) => ({
        element: JSON.parse(JSON.stringify(entry.element)) as CanvasElement,
        sourceParentId: entry.parentId,
        sourceAbsoluteOffset: getElementAbsoluteOffset(elementsRef.current, entry.element.id),
      })));
    }
  }, [getElementAbsoluteOffset, getSelectedSiblingEntries]);

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
          nextNode.x = options.rootX ?? sourceElement.x + x;
          nextNode.y = options.rootY ?? sourceElement.y + y;
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
      const canNest = selectedElement && !isLayerLocked(selectedElement) && canAcceptNestedDrop(selectedElement.type);
      const parentId = canNest ? selectedElement.id : null;
      const usedElementIds = collectCanvasElementIds(previousElements);
      const rootZIndex = Math.max(walkTreeMaxZ(previousElements), 0) + 1;
      const pastedElements = clipboardElements.map((clipboardItem, index) => {
        const isCrossParentPaste = clipboardItem.sourceParentId !== parentId;
        const rootPosition = parentId && isCrossParentPaste
          ? { rootX: 20 + index * 20, rootY: 20 + index * 20 }
          : !parentId && clipboardItem.sourceAbsoluteOffset
            ? {
              rootX: clipboardItem.sourceAbsoluteOffset.x + 20,
              rootY: clipboardItem.sourceAbsoluteOffset.y + 20,
            }
            : {};

        return cloneElementTreeWithDeterministicIds(clipboardItem.element, 20, 20, parentId, {
          ...rootPosition,
          usedElementIds,
          rootZIndex: rootZIndex + index,
        });
      });
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
        isLayerLocked(fromEntry.element) ||
        isLayerLocked(toEntry.element)
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
    if (!entry || isLayerLocked(entry.element)) {
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
    if (!parentEntry || isLayerLocked(parentEntry.element) || !canAcceptNestedDrop(parentEntry.element.type)) {
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
        isLayerLocked(entryForMove.element) ||
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
      const boundedNestedElement = clampElementWithinParent(nestedElement, parentEntry.element);

      const removed = removeElementById(nextElements, candidateId);
      if (!removed.updated) {
        return;
      }

      nextElements = removed.elements;
      movedElements.push(boundedNestedElement);
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
    const nextVisible = Boolean(activeElement) && isLayerHidden(activeElement);

    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, elementId, (element) => (
        applyUpdatesForBreakpoint(element, { visible: nextVisible }, breakpoint)
      ));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [breakpoint, displayedElements, elements, findElementById, selectedId, updateElementsWithHistory]);

  const handleLayerLockToggle = useCallback((elementId: string) => {
    const activeElement = findElementById(displayedElements, elementId) || findElementById(elements, elementId);
    const nextLocked = !isLayerLocked(activeElement);

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
        if (isLayerLocked(element)) {
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
    if (!entry || isLayerLocked(entry.element)) {
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
    if (!selectedEntry || isLayerLocked(selectedEntry.element)) return;

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
    if (!entries.every((entry) => entry.parentId === parentId && !isLayerLocked(entry.element))) {
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
      !isLayerLocked(entry.element) &&
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
  const reusableInstanceActionStatusId = 'editor-reusable-instance-action-status';
  const selectedReusableInstanceName = selectedReusableSectionSource?.name
    || selectedReusableSectionMeta?.name
    || selectedReusableSectionMeta?.sectionId
    || 'saved section';
  const isSelectedReusableInstanceLocked = Boolean(selectedElement && isLayerLocked(selectedElement));
  const reusableInstanceRefreshDisabledReason = isCanvasMutationDisabled
    ? editDisabledReason || 'Canvas mutation is disabled.'
    : !selectedReusableSectionSource
    ? 'Saved section source is missing.'
    : isSelectedReusableInstanceLocked
    ? 'Unlock this layer before refreshing the synced section.'
    : '';
  const reusableInstanceDetachDisabledReason = isCanvasMutationDisabled
    ? editDisabledReason || 'Canvas mutation is disabled.'
    : isSelectedReusableInstanceLocked
    ? 'Unlock this layer before detaching the synced section.'
    : '';
  const reusableInstanceActionStatus = selectedReusableSectionMeta
    ? [
      `Synced section ${selectedReusableInstanceName} is ${selectedReusableSectionSource ? 'linked' : 'missing its saved source'}.`,
      reusableInstanceRefreshDisabledReason
        ? `Refresh unavailable: ${reusableInstanceRefreshDisabledReason}`
        : 'Refresh from saved source available.',
      reusableInstanceDetachDisabledReason
        ? `Detach unavailable: ${reusableInstanceDetachDisabledReason}`
        : 'Detach from saved source available.',
    ].join(' ')
    : '';
  const selectedBreakpointOverrideGroups = getResponsiveOverrideGroups(selectedBreakpointOverride, baseSelectedElement);
  const selectedElementHasBreakpointOverride = Boolean(
    selectedBreakpointOverrideGroups.length > 0,
  );
  const breakpointOverrideActionStatusId = 'editor-breakpoint-override-action-status';
  const breakpointOverrideLabel = breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1);
  const breakpointOverrideMutationDisabledReason = isCanvasMutationDisabled
    ? editDisabledReason || 'Canvas mutation is disabled.'
    : '';
  const breakpointOverrideResetAllDisabledReason = breakpointOverrideMutationDisabledReason
    || (!selectedElementHasBreakpointOverride ? `${breakpointOverrideLabel} inherits desktop settings.` : '');
  const selectedBreakpointOverrideGroupLabels = BREAKPOINT_OVERRIDE_GROUPS
    .filter((group) => selectedBreakpointOverrideGroups.includes(group.id))
    .map((group) => group.label);
  const breakpointOverrideActionStatus = breakpoint !== 'desktop'
    ? [
      `${breakpointOverrideLabel} override ${
        selectedBreakpointOverrideGroupLabels.length > 0
          ? `has ${selectedBreakpointOverrideGroupLabels.join(', ')} group${selectedBreakpointOverrideGroupLabels.length === 1 ? '' : 's'} active`
          : 'inherits desktop settings'
      }.`,
      breakpointOverrideResetAllDisabledReason
        ? `Reset all unavailable: ${breakpointOverrideResetAllDisabledReason}`
        : `Reset all ${breakpointOverrideLabel.toLowerCase()} overrides available.`,
    ].join(' ')
    : '';
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
  const selectedGeometrySummary = useMemo(() => {
    if (selectedActiveElements.length === 0) return null;

    const minX = Math.min(...selectedActiveElements.map((element) => Number(element.x) || 0));
    const minY = Math.min(...selectedActiveElements.map((element) => Number(element.y) || 0));
    const maxX = Math.max(...selectedActiveElements.map((element) => (Number(element.x) || 0) + (Number(element.width) || 0)));
    const maxY = Math.max(...selectedActiveElements.map((element) => (Number(element.y) || 0) + (Number(element.height) || 0)));

    return {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(Math.max(1, maxX - minX)),
      height: Math.round(Math.max(1, maxY - minY)),
    };
  }, [selectedActiveElements]);
  const selectedMissingLayerCount = Math.max(0, selectedIds.length - selectedEntries.length);
  const selectedParentId = selectedEntries[0]?.parentId ?? null;
  const selectedEntriesShareParent = selectedEntries.length > 0
    && selectedMissingLayerCount === 0
    && selectedEntries.every((entry) => entry.parentId === selectedParentId);
  const selectedParentScopeCount = useMemo(() => {
    if (selectedEntries.length === 0) return 0;
    return new Set(selectedEntries.map((entry) => entry.parentId ?? 'canvas-root')).size;
  }, [selectedEntries]);
  const selectedParentScopeLabel = useMemo(() => {
    if (!selectedParentId) return 'Canvas root';
    const parent = findElementById(elements, selectedParentId);
    return parent?.name || `${normalizeElementType(parent?.type || 'box')} ${selectedParentId}`;
  }, [elements, findElementById, selectedParentId]);
  const selectedSelectionScopeState = selectedIds.length <= 1
    ? 'single-layer'
    : selectedMissingLayerCount > 0
      ? 'stale-selection'
      : selectedEntriesShareParent
        ? 'sibling-scope'
        : 'mixed-parent-scope';
  const selectedSelectionScopeLabel = selectedSelectionScopeState === 'sibling-scope'
    ? 'Sibling scope ready'
    : selectedSelectionScopeState === 'mixed-parent-scope'
      ? 'Mixed parent scopes'
      : selectedSelectionScopeState === 'stale-selection'
        ? 'Selection needs refresh'
        : selectedParentScopeLabel;
  const selectedLayerScopeVerb = selectedIds.length === 1 ? 'shares' : 'share';
  const selectionScopeReason = selectedEntriesShareParent
    ? `${selectedIds.length} selected layer${selectedIds.length === 1 ? '' : 's'} ${selectedLayerScopeVerb} ${selectedParentScopeLabel}.`
    : selectedMissingLayerCount > 0
      ? `${selectedMissingLayerCount} selected layer${selectedMissingLayerCount === 1 ? '' : 's'} no longer exist on the canvas.`
      : selectedIds.length > 1
        ? `Selection spans ${selectedParentScopeCount} parent scopes; choose sibling layers under one parent for bulk compose actions.`
        : 'Select a layer to see its parent scope.';
  const sameParentSelectionDisabledReason = selectedIds.length > 1 && !selectedEntriesShareParent
    ? selectionScopeReason
    : null;
  const selectableSiblingIds = useMemo(() => {
    const selectedEntry = selectedId ? findElementEntry(elements, selectedId) : null;
    const parentId = selectedEntry?.parentId ?? null;
    const siblings = parentId
      ? findElementEntry(elements, parentId)?.element.children || []
      : elements;

    return siblings
      .filter((item) => !isLayerHidden(item) && !isLayerLocked(item))
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
    && selectedEntries.every((entry) => !isLayerLocked(entry.element));
  const canUngroupSelected = selectedEntries.length > 0
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => (
      !isLayerLocked(entry.element) &&
      isEditorGroupElement(entry.element) &&
      Boolean(entry.element.children?.length)
    ));
  const canAlignSelected = selectedEntries.length > 0
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => (
      !isLayerLocked(entry.element) &&
      !isLayerHidden(entry.element)
    ));
  const canZOrderSelected = selectedEntries.length > 0
    && selectedEntriesShareParent
    && selectedSiblingLayerCount > selectedEntries.length
    && selectedEntries.every((entry) => !isLayerLocked(entry.element));
  const canDistributeSelected = selectedEntries.length >= 3
    && selectedEntriesShareParent
    && selectedEntries.every((entry) => (
      !isLayerLocked(entry.element) &&
      !isLayerHidden(entry.element)
    ));
  const canCopySelected = selectedEntries.length > 0 && selectedEntriesShareParent;
  const canCutSelected = selectedEntriesShareParent && selectedEntries.some((entry) => !isLayerLocked(entry.element));
  const canDuplicateSelected = canCutSelected;
  const canDeleteSelected = canCutSelected;
  const selectedTextEditableElement = selectedActiveElements.length === 1 ? selectedActiveElements[0] : null;
  const selectedTextEditableType = selectedTextEditableElement
    ? normalizeElementType(selectedTextEditableElement.type)
    : null;
  const canEditSelectedText = Boolean(
    selectedId &&
      selectedTextEditableElement &&
      selectedTextEditableType &&
      CANVAS_TEXT_EDITABLE_TYPES.has(selectedTextEditableType) &&
      !isCanvasMutationDisabled &&
      !isLayerLocked(selectedTextEditableElement) &&
      !isLayerHidden(selectedTextEditableElement),
  );
  const canToggleSelectedVisibility = selectedActiveElements.length > 0
    && selectedActiveElements.every((element) => !isLayerLocked(element));
  const selectedLayersAreHidden = selectedActiveElements.length > 0
    && selectedActiveElements.every(isLayerHidden);
  const selectedLayersAreLocked = selectedActiveElements.length > 0
    && selectedActiveElements.every(isLayerLocked);
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
  const editorResponsiveNextAction = useMemo<EditorResponsiveNextAction>(() => {
    const selectedLayerIsBlocked = Boolean(selectedElement && (isLayerLocked(selectedElement) || isLayerHidden(selectedElement)));
    const selectedLayerBlockedReason = selectedElement && isLayerLocked(selectedElement)
      ? 'Unlock this layer before creating or changing breakpoint overrides.'
      : selectedElement && isLayerHidden(selectedElement)
      ? 'Show this layer before creating or changing breakpoint overrides.'
      : '';
    let id = 'review-responsive-source';
    let label = 'Review responsive source';
    let detail = 'Desktop is the source of truth for tablet and mobile until a local breakpoint override is authored.';
    let target: EditorResponsiveNextActionTarget = 'desktop-source';
    let actionSurface: EditorResponsiveNextActionSurface = 'viewport-toolbar';
    let actionState: EditorResponsiveNextActionState = isCanvasMutationDisabled ? 'blocked' : 'ready';

    if (isCanvasMutationDisabled) {
      id = 'responsive-controls-blocked';
      label = 'Responsive controls blocked';
      detail = canvasViewportDisabledReason || editDisabledReason || 'Canvas mutation is disabled.';
      target = breakpoint === 'desktop' ? 'desktop-source' : 'breakpoint-viewport';
      actionSurface = 'viewport-toolbar';
    } else if (breakpoint === 'desktop') {
      if (totalResponsiveOverrideLayerCount > 0) {
        id = 'review-existing-breakpoint-overrides';
        label = 'Review tablet/mobile overrides';
        detail = `${totalResponsiveOverrideLayerCount} layer${totalResponsiveOverrideLayerCount === 1 ? '' : 's'} already carry tablet or mobile overrides. Switch breakpoints or open Layers > Overrides before publishing.`;
      } else {
        id = 'switch-to-tablet-or-mobile';
        label = 'Check tablet and mobile';
        detail = 'Switch to Tablet or Mobile to verify whether this desktop layout can be inherited as-is or needs local overrides.';
      }
    } else if (!selectedElement) {
      id = 'select-layer-for-responsive-override';
      label = `Select a layer for ${breakpointOverrideLabel}`;
      detail = `${breakpointOverrideLabel} is active. Select a layer on the canvas or in Layers before creating local geometry, content, style, or state overrides.`;
      target = 'layer-selection';
      actionSurface = 'layers-panel';
    } else if (selectedLayerIsBlocked) {
      id = 'unlock-or-show-layer-for-responsive-override';
      label = `Prepare ${selectedElementLabel || 'selected layer'}`;
      detail = selectedLayerBlockedReason;
      target = 'selected-layer';
      actionSurface = 'inspector-breakpoint-override';
      actionState = 'blocked';
    } else if (selectedElementHasBreakpointOverride) {
      id = 'continue-or-reset-local-overrides';
      label = `${breakpointOverrideLabel} override is local`;
      detail = `${selectedElementLabel || 'Selected layer'} has ${selectedBreakpointOverrideGroupLabels.join(', ')} override group${selectedBreakpointOverrideGroupLabels.length === 1 ? '' : 's'} active. Continue editing here, or reset groups to inherit desktop again.`;
      target = 'selected-layer';
      actionSurface = 'inspector-breakpoint-override';
      actionState = 'selected';
    } else {
      id = 'edit-selected-layer-for-local-override';
      label = `Create ${breakpointOverrideLabel} override`;
      detail = `Edit ${selectedElementLabel || 'the selected layer'} geometry, content, layout, style, or state while ${breakpointOverrideLabel} is active to create a local override.`;
      target = 'selected-layer';
      actionSurface = 'inspector-breakpoint-override';
    }

    return {
      schemaVersion: 'backy.editor-responsive-next-action.v1',
      generatedFrom: 'page-editor',
      id,
      label,
      detail,
      breakpoint,
      breakpointLabel: activeBreakpointLabel,
      target,
      actionSurface,
      actionState,
      inheritanceState: breakpoint === 'desktop'
        ? 'desktop-source'
        : selectedElementHasBreakpointOverride || activeBreakpointOverrideLayerCount > 0
        ? 'local-overrides'
        : 'inherits-desktop',
      selectedLayerId: selectedElement?.id || null,
      selectedLayerType: selectedElement?.type || null,
      selectedLayerLabel: selectedElementLabel,
      overrideGroups: selectedBreakpointOverrideGroups,
      overrideGroupLabels: selectedBreakpointOverrideGroupLabels,
      activeOverrideLayerCount: activeBreakpointOverrideLayerCount,
      totalOverrideLayerCount: totalResponsiveOverrideLayerCount,
      canvas: size,
      pointers: {
        layerMap: 'editor-layers-panel',
        inspector: 'editor-breakpoint-override',
        renderPayload: 'render.data.content.elements[]',
        selectedComponentApi: 'backy.editor-selected-component-api-contract.v1',
      },
    };
  }, [
    activeBreakpointLabel,
    activeBreakpointOverrideLayerCount,
    breakpoint,
    breakpointOverrideLabel,
    canvasViewportDisabledReason,
    editDisabledReason,
    isCanvasMutationDisabled,
    selectedBreakpointOverrideGroupLabels,
    selectedBreakpointOverrideGroups,
    selectedElement,
    selectedElementHasBreakpointOverride,
    selectedElementLabel,
    size,
    totalResponsiveOverrideLayerCount,
  ]);
  const handleEditSelectedText = useCallback(() => {
    if (!canEditSelectedText || !selectedId) {
      return;
    }

    window.dispatchEvent(new CustomEvent(CANVAS_TEXT_EDIT_EVENT, {
      detail: { elementId: selectedId },
    }));
    setSelectedId(selectedId);
    setSelectedIds([selectedId]);
    setRightPanel('properties');
  }, [canEditSelectedText, selectedId]);
  const clipboardLayerLabel = clipboardElements.length === 1 ? 'layer' : 'layers';
  const canPasteIntoSelectedContainer = Boolean(
    selectedElement && !isLayerLocked(selectedElement) && canAcceptNestedDrop(selectedElement.type),
  );
  const pasteTargetMode = canPasteIntoSelectedContainer ? 'selected-container' : 'canvas-root';
  const pasteTargetLabel = canPasteIntoSelectedContainer && selectedElementLabel
    ? `Paste ${clipboardLayerLabel} into ${selectedElementLabel}`
    : `Paste ${clipboardLayerLabel} on canvas`;
  const selectableChildLayer = selectedElement?.children?.find((child) => (
    !isLayerHidden(child) && !isLayerLocked(child)
  )) ?? null;
  const selectableChildLayerIds = useMemo(() => (
    selectedElement?.children
      ?.filter((child) => !isLayerHidden(child) && !isLayerLocked(child))
      .map((child) => child.id) || []
  ), [selectedElement]);
  const canSelectParentLayer = selectedEntriesShareParent && Boolean(selectedParentId);
  const canSelectChildLayer = Boolean(selectableChildLayer);
  const canSelectChildLayerScope = selectableChildLayerIds.length > 0;
  const editorCommandRegistry = useMemo<EditorCommandRegistry>(() => {
    const mutationDisabledReason = editDisabledReason || 'Canvas mutation is disabled.';
    const command = ({
      enabled,
      visible = true,
      reason,
      disabledReason,
      hiddenReason,
      ...item
    }: Omit<EditorCommandRegistryItem, 'enabled' | 'state' | 'reason'> & {
      enabled: boolean;
      visible?: boolean;
      reason: string;
      disabledReason: string;
      hiddenReason?: string;
    }): EditorCommandRegistryItem => ({
      ...item,
      enabled: visible && enabled,
      state: visible ? enabled ? 'ready' : 'disabled' : 'hidden',
      reason: visible ? enabled ? reason : disabledReason : hiddenReason || 'Command is not visible in the current editor mode.',
    });

    const saveDisabledReason = isSaving
      ? 'Save is already in progress.'
      : !canEdit
        ? editDisabledReason
        : 'Save is disabled in this editor context.';
    const publishVisible = !hideSave && mode === 'page';
    const publishEnabled = publishVisible
      && !isSaving
      && canEdit
      && canPublish
      && (pageSettings.status === 'published' || !effectivePublishDisabled);
    const publishCommandDisabledReason = isSaving
      ? 'Save or publish is already in progress.'
      : !canEdit
        ? editDisabledReason
        : !canPublish
          ? publishDisabledReason || 'Publication status is disabled for this user.'
          : effectivePublishDisabled
            ? effectivePublishDisabledReason || 'Resolve page readiness issues before publishing.'
            : 'Publish is disabled in this editor state.';

    const commands: EditorCommandRegistryItem[] = [
      command({
        id: 'undo',
        label: 'Undo',
        category: 'history',
        targetScope: 'canvas',
        shortcut: 'Cmd/Ctrl+Z',
        ariaKeyshortcuts: 'Control+Z Meta+Z',
        testId: 'editor-undo',
        enabled: !isCanvasMutationDisabled && historyIndex > 0,
        reason: 'The editor history has an earlier state.',
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'No earlier history state is available.',
      }),
      command({
        id: 'redo',
        label: 'Redo',
        category: 'history',
        targetScope: 'canvas',
        shortcut: 'Cmd/Ctrl+Y or Shift+Cmd/Ctrl+Z',
        ariaKeyshortcuts: 'Control+Y Meta+Y Shift+Control+Z Shift+Meta+Z',
        testId: 'editor-redo',
        enabled: !isCanvasMutationDisabled && historyIndex < history.length - 1,
        reason: 'The editor history has a later state.',
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'No later history state is available.',
      }),
      command({
        id: 'copy-selection',
        label: 'Copy selection',
        category: 'clipboard',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        shortcut: 'Cmd/Ctrl+C',
        ariaKeyshortcuts: 'Control+C Meta+C',
        testId: 'editor-copy-selection',
        enabled: !isCanvasMutationDisabled && canCopySelected,
        reason: `Copy ${selectedLayerActionLabel}. ${selectionScopeReason}`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select one or more layers in the same parent scope before copying.',
      }),
      command({
        id: 'cut-selection',
        label: 'Cut selection',
        category: 'clipboard',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        shortcut: 'Cmd/Ctrl+X',
        ariaKeyshortcuts: 'Control+X Meta+X',
        testId: 'editor-cut-selection',
        enabled: !isCanvasMutationDisabled && canCutSelected,
        reason: `Cut ${selectedLayerActionLabel}. ${selectionScopeReason}`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select unlocked layers in the same parent scope before cutting.',
      }),
      command({
        id: 'paste-selection',
        label: pasteTargetLabel,
        category: 'clipboard',
        targetScope: pasteTargetMode === 'selected-container' ? 'selected-container' : 'canvas',
        shortcut: 'Cmd/Ctrl+V',
        ariaKeyshortcuts: 'Control+V Meta+V',
        testId: 'editor-paste-selection',
        enabled: !isCanvasMutationDisabled && clipboardElements.length > 0,
        reason: `${clipboardElements.length} clipboard ${clipboardLayerLabel} can be pasted into ${pasteTargetMode}.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'Copy or cut at least one layer before pasting.',
      }),
      command({
        id: 'duplicate-selection',
        label: 'Duplicate selection',
        category: 'clipboard',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        shortcut: 'Cmd/Ctrl+D',
        ariaKeyshortcuts: 'Control+D Meta+D',
        testId: 'editor-duplicate-selection',
        enabled: !isCanvasMutationDisabled && canDuplicateSelected,
        reason: `Duplicate ${selectedLayerActionLabel}. ${selectionScopeReason}`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select unlocked layers in the same parent scope before duplicating.',
      }),
      command({
        id: 'select-sibling-layers',
        label: 'Select sibling layers',
        category: 'selection',
        targetScope: 'selected-sibling-scope',
        shortcut: 'Cmd/Ctrl+A',
        ariaKeyshortcuts: 'Control+A Meta+A',
        testId: 'editor-select-sibling-layers',
        enabled: !isCanvasMutationDisabled && selectableSiblingIds.length >= 2,
        reason: `${selectableSiblingIds.length} visible unlocked siblings are available.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'Select a layer with at least one visible unlocked sibling.',
      }),
      command({
        id: 'select-child-layers',
        label: 'Select child layers',
        category: 'selection',
        targetScope: 'selected-child-scope',
        shortcut: 'Shift+Cmd/Ctrl+A',
        ariaKeyshortcuts: 'Shift+Control+A Shift+Meta+A',
        testId: 'editor-select-child-layers',
        enabled: !isCanvasMutationDisabled && canSelectChildLayerScope,
        reason: `${selectableChildLayerIds.length} visible unlocked child layers are available.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'Select a container or group with visible unlocked child layers.',
      }),
      command({
        id: 'select-parent-layer',
        label: 'Select parent layer',
        category: 'selection',
        targetScope: 'selected-layer',
        shortcut: 'Shift+Enter',
        ariaKeyshortcuts: 'Shift+Enter',
        testId: 'editor-select-parent-layer',
        enabled: !isCanvasMutationDisabled && canSelectParentLayer,
        reason: `Parent layer ${selectedParentId} can be selected.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'The current selection has no parent layer.',
      }),
      command({
        id: 'select-child-layer',
        label: 'Select first child layer',
        category: 'selection',
        targetScope: 'selected-child-scope',
        shortcut: 'Enter',
        ariaKeyshortcuts: 'Enter',
        testId: 'editor-select-child-layer',
        enabled: !isCanvasMutationDisabled && canSelectChildLayer,
        reason: `Child layer ${selectableChildLayer?.id} can be selected.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'The current layer has no visible unlocked child layer.',
      }),
      command({
        id: 'group-selection',
        label: 'Group selected layers',
        category: 'composition',
        targetScope: 'selected-sibling-scope',
        shortcut: 'Cmd/Ctrl+G',
        ariaKeyshortcuts: 'Control+G Meta+G',
        testId: 'editor-group-selection',
        enabled: !isCanvasMutationDisabled && canGroupSelected,
        reason: `Group ${selectedIds.length} unlocked sibling layers.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select at least two unlocked layers in the same parent scope.',
      }),
      command({
        id: 'ungroup-selection',
        label: 'Ungroup selected groups',
        category: 'composition',
        targetScope: 'selected-sibling-scope',
        shortcut: 'Shift+Cmd/Ctrl+G',
        ariaKeyshortcuts: 'Shift+Control+G Shift+Meta+G',
        testId: 'editor-ungroup-selection',
        enabled: !isCanvasMutationDisabled && canUngroupSelected,
        reason: `Ungroup ${selectedIds.length} selected editor group${selectedIds.length === 1 ? '' : 's'}.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select unlocked editor groups in the same parent scope.',
      }),
      command({
        id: 'toggle-selection-visibility',
        label: selectedLayersAreHidden ? 'Show selected layers' : 'Hide selected layers',
        category: 'layer-state',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        testId: 'editor-toggle-selection-visibility',
        enabled: !isCanvasMutationDisabled && canToggleSelectedVisibility,
        reason: selectedLayersAreHidden ? 'Selected layers can be shown.' : 'Selected layers can be hidden.',
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'Select unlocked layers before toggling visibility.',
      }),
      command({
        id: 'toggle-selection-lock',
        label: selectedLayersAreLocked ? 'Unlock selected layers' : 'Lock selected layers',
        category: 'layer-state',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        testId: 'editor-toggle-selection-lock',
        enabled: !isCanvasMutationDisabled && selectedActiveElements.length > 0,
        reason: selectedLayersAreLocked ? 'Selected layers can be unlocked.' : 'Selected layers can be locked.',
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : 'Select at least one layer before toggling lock state.',
      }),
      command({
        id: 'edit-text',
        label: 'Edit selected text',
        category: 'selection',
        targetScope: 'selected-layer',
        testId: 'editor-context-edit-text',
        enabled: canEditSelectedText,
        reason: 'Selected text layer can be edited directly on the canvas.',
        disabledReason: isCanvasMutationDisabled
          ? mutationDisabledReason
          : 'Select one unlocked visible text, heading, quote, or list layer before editing text.',
      }),
      ...([
        ['send-to-back', 'Send to back', 'Shift+Cmd/Ctrl+[', 'Shift+Control+[ Shift+Meta+[', 'editor-send-to-back'],
        ['send-backward', 'Send backward', 'Cmd/Ctrl+[', 'Control+[ Meta+[', 'editor-send-backward'],
        ['bring-forward', 'Bring forward', 'Cmd/Ctrl+]', 'Control+] Meta+]', 'editor-bring-forward'],
        ['bring-to-front', 'Bring to front', 'Shift+Cmd/Ctrl+]', 'Shift+Control+] Shift+Meta+]', 'editor-bring-to-front'],
      ] as const).map(([id, label, shortcut, ariaKeyshortcuts, testId]) => command({
        id,
        label,
        category: 'layer-order',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        shortcut,
        ariaKeyshortcuts,
        testId,
        enabled: !isCanvasMutationDisabled && canZOrderSelected,
        reason: `Reorder ${selectedLayerActionLabel} inside the current parent scope.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select unlocked layers with neighboring siblings before changing layer order.',
      })),
      ...([
        ['align-left', 'Align left', 'editor-align-left'],
        ['align-center', 'Align horizontal center', 'editor-align-center'],
        ['align-right', 'Align right', 'editor-align-right'],
        ['align-top', 'Align top', 'editor-align-top'],
        ['align-middle', 'Align vertical center', 'editor-align-middle'],
        ['align-bottom', 'Align bottom', 'editor-align-bottom'],
      ] as const).map(([id, label, testId]) => command({
        id,
        label,
        category: 'layout',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        testId,
        enabled: !isCanvasMutationDisabled && canAlignSelected,
        reason: `Align ${selectedLayerActionLabel}. ${selectionScopeReason}`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select visible unlocked layers in the same parent scope before aligning.',
      })),
      command({
        id: 'distribute-horizontal',
        label: 'Distribute horizontal spacing',
        category: 'layout',
        targetScope: 'selected-layers',
        testId: 'editor-distribute-horizontal',
        enabled: !isCanvasMutationDisabled && canDistributeSelected,
        reason: `Distribute ${selectedIds.length} visible unlocked sibling layers horizontally.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select at least three visible unlocked sibling layers before distributing.',
      }),
      command({
        id: 'distribute-vertical',
        label: 'Distribute vertical spacing',
        category: 'layout',
        targetScope: 'selected-layers',
        testId: 'editor-distribute-vertical',
        enabled: !isCanvasMutationDisabled && canDistributeSelected,
        reason: `Distribute ${selectedIds.length} visible unlocked sibling layers vertically.`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select at least three visible unlocked sibling layers before distributing.',
      }),
      command({
        id: 'delete-selection',
        label: 'Delete selection',
        category: 'selection',
        targetScope: selectedIds.length > 1 ? 'selected-layers' : 'selected-layer',
        shortcut: 'Delete/Backspace',
        ariaKeyshortcuts: 'Delete Backspace',
        testId: 'editor-delete-selection',
        enabled: !isCanvasMutationDisabled && canDeleteSelected,
        reason: `Delete ${selectedLayerActionLabel}. ${selectionScopeReason}`,
        disabledReason: isCanvasMutationDisabled ? mutationDisabledReason : sameParentSelectionDisabledReason || 'Select unlocked layers in the same parent scope before deleting.',
      }),
      command({
        id: 'toggle-component-panel',
        label: isComponentPanelVisible ? 'Hide components panel' : 'Show components panel',
        category: 'shell',
        targetScope: 'shell',
        shortcut: 'B',
        ariaKeyshortcuts: 'B',
        testId: 'editor-toggle-component-panel',
        enabled: true,
        reason: isComponentPanelVisible ? 'Components panel is visible.' : 'Components panel can be opened.',
        disabledReason: 'Components panel command is unavailable.',
      }),
      command({
        id: 'toggle-layers-panel',
        label: rightPanel === 'layers' && isInspectorPanelVisible ? 'Show properties panel' : 'Show layers panel',
        category: 'shell',
        targetScope: 'shell',
        shortcut: 'L',
        ariaKeyshortcuts: 'L',
        testId: 'editor-toggle-layers-panel',
        enabled: true,
        reason: rightPanel === 'layers' && isInspectorPanelVisible ? 'Layers panel is active.' : 'Layers panel can be opened.',
        disabledReason: 'Layers panel command is unavailable.',
      }),
      command({
        id: 'toggle-inspector-panel',
        label: isInspectorPanelVisible ? 'Hide inspector panel' : 'Show inspector panel',
        category: 'shell',
        targetScope: 'shell',
        shortcut: 'I',
        ariaKeyshortcuts: 'I',
        testId: 'editor-toggle-inspector-panel',
        enabled: true,
        reason: isInspectorPanelVisible
          ? `Inspector panel is visible for ${INSPECTOR_PANEL_PURPOSE}.`
          : `Inspector panel can be opened for ${INSPECTOR_PANEL_PURPOSE}.`,
        disabledReason: 'Inspector panel command is unavailable.',
      }),
      command({
        id: 'toggle-focus-mode',
        label: isCanvasFocusMode ? 'Exit wide canvas focus' : 'Enter wide canvas focus',
        category: 'shell',
        targetScope: 'shell',
        shortcut: 'F',
        ariaKeyshortcuts: 'F',
        testId: 'editor-toggle-focus-mode',
        enabled: true,
        reason: isCanvasFocusMode ? 'Focus mode is active.' : 'Focus mode can be entered.',
        disabledReason: 'Focus mode command is unavailable.',
      }),
      command({
        id: 'toggle-preview',
        label: isPreview ? 'Return to edit mode' : 'Preview page',
        category: 'view',
        targetScope: 'canvas',
        testId: 'editor-preview-toggle',
        enabled: !isSaving,
        reason: isPreview ? 'Preview mode is active.' : 'Preview mode can be opened.',
        disabledReason: 'Wait for the current save before toggling preview.',
      }),
      command({
        id: 'toggle-grid',
        label: showGrid ? 'Hide grid' : 'Show grid',
        category: 'view',
        targetScope: 'viewport',
        shortcut: 'G',
        ariaKeyshortcuts: 'G',
        testId: 'editor-grid-visibility-toggle',
        enabled: !isPreview,
        visible: !isPreview,
        reason: showGrid ? 'Grid is visible.' : 'Grid can be shown.',
        disabledReason: 'Grid controls are disabled in preview mode.',
      }),
      command({
        id: 'toggle-snap',
        label: snapEnabled ? 'Disable snapping' : 'Enable snapping',
        category: 'view',
        targetScope: 'viewport',
        shortcut: 'S',
        ariaKeyshortcuts: 'S',
        testId: 'editor-snap-toggle',
        enabled: !isPreview,
        visible: !isPreview,
        reason: snapEnabled ? 'Snapping is enabled.' : 'Snapping can be enabled.',
        disabledReason: 'Snap controls are disabled in preview mode.',
      }),
      command({
        id: 'toggle-pan',
        label: isCanvasPanMode ? 'Disable pan navigation' : 'Enable pan navigation',
        category: 'view',
        targetScope: 'viewport',
        shortcut: 'H or Space',
        ariaKeyshortcuts: 'H Space',
        testId: 'editor-pan-toggle',
        enabled: !isPreview,
        visible: !isPreview,
        reason: isCanvasPanMode ? 'Pan navigation is enabled.' : 'Pan navigation can be enabled.',
        disabledReason: 'Pan controls are disabled in preview mode.',
      }),
      command({
        id: 'zoom-out',
        label: 'Zoom out',
        category: 'view',
        targetScope: 'viewport',
        shortcut: 'Cmd/Ctrl+-',
        ariaKeyshortcuts: 'Control+- Meta+-',
        testId: 'editor-zoom-out',
        enabled: !isPreview,
        visible: !isPreview,
        reason: 'Canvas viewport can zoom out.',
        disabledReason: 'Zoom controls are disabled in preview mode.',
      }),
      command({
        id: 'zoom-in',
        label: 'Zoom in',
        category: 'view',
        targetScope: 'viewport',
        shortcut: 'Cmd/Ctrl+=',
        ariaKeyshortcuts: 'Control+= Meta+=',
        testId: 'editor-zoom-in',
        enabled: !isPreview,
        visible: !isPreview,
        reason: 'Canvas viewport can zoom in.',
        disabledReason: 'Zoom controls are disabled in preview mode.',
      }),
      command({
        id: 'zoom-fit',
        label: 'Fit canvas',
        category: 'view',
        targetScope: 'viewport',
        shortcut: 'Cmd/Ctrl+0',
        ariaKeyshortcuts: 'Control+0 Meta+0',
        testId: 'editor-zoom-fit',
        enabled: !isPreview,
        visible: !isPreview,
        reason: 'Canvas viewport can fit the current canvas.',
        disabledReason: 'Zoom controls are disabled in preview mode.',
      }),
      command({
        id: 'open-page-settings',
        label: `${editorEntityLabel} settings`,
        category: 'workflow',
        targetScope: 'document',
        testId: 'editor-page-settings',
        enabled: !isSaving,
        visible: !hideSettings,
        reason: `${editorEntityLabel} settings can be opened.`,
        disabledReason: 'Wait for the current save before opening settings.',
        hiddenReason: `${editorEntityLabel} settings are hidden for this embedded editor.`,
      }),
      command({
        id: 'reload-page',
        label: `Reload ${editorEntityLabel.toLowerCase()}`,
        category: 'workflow',
        targetScope: 'document',
        testId: 'editor-reload-page',
        enabled: !isSaving,
        reason: `${editorEntityLabel} can be reloaded from the last saved state.`,
        disabledReason: 'Wait for the current save before reloading.',
      }),
      command({
        id: 'publish-page',
        label: pageSettings.status === 'published' ? 'Unpublish page' : 'Publish page',
        category: 'workflow',
        targetScope: 'document',
        testId: 'editor-publish-page',
        enabled: publishEnabled,
        visible: publishVisible,
        reason: pageSettings.status === 'published' ? 'Published page can be returned to draft.' : 'Page is ready to publish.',
        disabledReason: publishCommandDisabledReason,
        hiddenReason: 'Publish is only available in page editing mode with save controls visible.',
      }),
      command({
        id: 'save-page',
        label: `Save ${editorEntityLabel.toLowerCase()}`,
        category: 'workflow',
        targetScope: 'document',
        shortcut: 'Ctrl+S',
        testId: 'editor-save-page',
        enabled: !hideSave && !isSaving && canEdit,
        visible: !hideSave,
        reason: `${editorEntityLabel} changes can be saved.`,
        disabledReason: saveDisabledReason,
        hiddenReason: `${editorEntityLabel} save is handled by the parent editor surface.`,
      }),
    ];

    const categories: EditorCommandRegistry['summary']['categories'] = [];
    commands.forEach((registryCommand) => {
      let category = categories.find((item) => item.category === registryCommand.category);
      if (!category) {
        category = {
          category: registryCommand.category,
          total: 0,
          ready: 0,
          disabled: 0,
          hidden: 0,
        };
        categories.push(category);
      }

      category.total += 1;
      category[registryCommand.state] += 1;
    });

    return {
      schemaVersion: 'backy.editor-command-registry.v1',
      generatedFrom: 'page-editor',
      summary: {
        totalCommandCount: commands.length,
        readyCommandCount: commands.filter((item) => item.state === 'ready').length,
        disabledCommandCount: commands.filter((item) => item.state === 'disabled').length,
        hiddenCommandCount: commands.filter((item) => item.state === 'hidden').length,
        selectedLayerCount: selectedIds.length,
        categories,
      },
      commands,
    };
  }, [
    canAlignSelected,
    canCopySelected,
    canCutSelected,
    canDeleteSelected,
    canDistributeSelected,
    canDuplicateSelected,
    canEdit,
    canEditSelectedText,
    canGroupSelected,
    canPublish,
    canSelectChildLayer,
    canSelectChildLayerScope,
    canSelectParentLayer,
    canToggleSelectedVisibility,
    canUngroupSelected,
    canZOrderSelected,
    clipboardElements.length,
    clipboardLayerLabel,
    editDisabledReason,
    editorEntityLabel,
    effectivePublishDisabled,
    effectivePublishDisabledReason,
    hideSave,
    hideSettings,
    history.length,
    historyIndex,
    isComponentPanelVisible,
    isCanvasFocusMode,
    isCanvasMutationDisabled,
    isCanvasPanMode,
    isInspectorPanelVisible,
    isPreview,
    isSaving,
    mode,
    pageSettings.status,
    pasteTargetLabel,
    pasteTargetMode,
    publishDisabledReason,
    rightPanel,
    selectableChildLayer?.id,
    selectableChildLayerIds.length,
    selectableSiblingIds.length,
    sameParentSelectionDisabledReason,
    selectedActiveElements.length,
    selectedEntriesShareParent,
    selectedIds.length,
    selectedLayerActionLabel,
    selectedLayersAreHidden,
    selectedLayersAreLocked,
    selectedParentId,
    selectionScopeReason,
    showComponentPanel,
    showGrid,
    showInspectorPanel,
    snapEnabled,
  ]);
  const editorCompositionReadiness = useMemo(() => {
    const metrics = collectEditorCompositionMetrics(elements);
    const agentHandoff = buildEditorAgentHandoff(activeSiteId);
    const designStateLayerCount = metrics.animatedLayers +
      metrics.actionLayers +
      metrics.dataBoundLayers +
      metrics.tokenRefLayers +
      metrics.assetBoundLayers +
      metrics.interactiveLayers;
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
        detail: selectedIds.length > 1
          ? selectionScopeReason
          : 'No multi-layer composition issue in the current selection.',
        ready: selectionCanCompose,
      },
      {
        label: 'Design wiring',
        detail: designStateLayerCount > 0
          ? `${metrics.animatedLayers} animated, ${metrics.dataBoundLayers} data-bound, ${metrics.assetBoundLayers} asset-bound, and ${metrics.interactiveLayers} interactive layers.`
          : 'No animation, data, media, token, action, or interactive wiring yet.',
        ready: true,
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
      commandRegistrySchemaVersion: editorCommandRegistry.schemaVersion,
      ready: readyCount === checks.length,
      readyCount,
      checkCount: checks.length,
      metrics: {
        ...metrics,
        designStateLayerCount,
        topTypes,
      },
      agentHandoff,
      selection: {
        selectedIds,
        selectedLayerCount: selectedIds.length,
        parentId: selectedParentId,
        parentScopeCount: selectedParentScopeCount,
        scopeState: selectedSelectionScopeState,
        scopeReason: selectionScopeReason,
        shareParent: selectedEntriesShareParent,
        canGroup: canGroupSelected,
        canUngroup: canUngroupSelected,
        canSelectChildren: canSelectChildLayerScope,
      },
      commandRegistry: editorCommandRegistry,
      responsiveNextAction: editorResponsiveNextAction,
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
          animatedLayers: metrics.animatedLayers,
          actionLayers: metrics.actionLayers,
          dataBoundLayers: metrics.dataBoundLayers,
          tokenRefLayers: metrics.tokenRefLayers,
          assetBoundLayers: metrics.assetBoundLayers,
          interactiveLayers: metrics.interactiveLayers,
          designStateLayerCount,
          hiddenLayers: metrics.hiddenLayers,
          lockedLayers: metrics.lockedLayers,
          maxDepth: metrics.maxDepth,
          topTypes,
        },
        selection: {
          selectedIds,
          selectedLayerCount: selectedIds.length,
          parentId: selectedParentId,
          parentScopeCount: selectedParentScopeCount,
          scopeState: selectedSelectionScopeState,
          scopeReason: selectionScopeReason,
          shareParent: selectedEntriesShareParent,
          canGroup: canGroupSelected,
          canUngroup: canUngroupSelected,
          canSelectChildren: canSelectChildLayerScope,
        },
        agentHandoff,
        commandRegistry: editorCommandRegistry,
        responsiveNextAction: editorResponsiveNextAction,
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
    activeSiteId,
    canGroupSelected,
    canSelectChildLayerScope,
    canUngroupSelected,
    editorCommandRegistry,
    editorResponsiveNextAction,
    elements,
    selectedEntriesShareParent,
    selectedIds,
    selectedParentId,
    selectedParentScopeCount,
    selectedSelectionScopeState,
    selectionScopeReason,
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
  const copyEditorAgentHandoff = useCallback(async () => {
    const handoff = JSON.stringify(editorCompositionReadiness.agentHandoff, null, 2);
    try {
      await navigator.clipboard.writeText(handoff);
      setEditorNotice('Custom frontend agent handoff copied.');
    } catch {
      setEditorNotice('Unable to copy the custom frontend agent handoff.');
    }
  }, [editorCompositionReadiness.agentHandoff]);
  const copyEditorCommandRegistry = useCallback(async () => {
    const registry = JSON.stringify(editorCompositionReadiness.commandRegistry, null, 2);
    try {
      await navigator.clipboard.writeText(registry);
      setEditorNotice('Editor command registry copied.');
    } catch {
      setEditorNotice('Unable to copy the editor command registry.');
    }
  }, [editorCompositionReadiness.commandRegistry]);
  const copyEditorResponsiveNextAction = useCallback(async () => {
    const nextAction = JSON.stringify(editorResponsiveNextAction, null, 2);
    try {
      await navigator.clipboard.writeText(nextAction);
      setEditorNotice('Responsive next action copied.');
    } catch {
      setEditorNotice('Unable to copy the responsive next action.');
    }
  }, [editorResponsiveNextAction]);

  const handleSelectedVisibilityToggle = useCallback(() => {
    if (!canToggleSelectedVisibility || selectedActiveElements.length === 0) return;
    const nextVisible = selectedActiveElements.every(isLayerHidden);

    updateElementsWithHistory((currentElements) => {
      let nextElements = currentElements;
      let changed = false;
      for (const id of selectedIds) {
        const result = updateElementById(nextElements, id, (element) => (
          isLayerLocked(element) ? element : applyUpdatesForBreakpoint(element, { visible: nextVisible }, breakpoint)
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
    const nextLocked = !selectedActiveElements.every(isLayerLocked);

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

  const handleSelectFirstVisibleLayer = useCallback(() => {
    const nextId = visibleCanvasElementIds[0] || null;
    if (!nextId) {
      return;
    }

    setSelectedId(nextId);
    setSelectedIds([nextId]);
    setRightPanel('properties');
  }, [visibleCanvasElementIds]);

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

  const handleRefreshSelectedReusableSection = useCallback(async () => {
    if (
      isCanvasMutationDisabled ||
      !selectedId ||
      !baseSelectedElement ||
      !selectedReusableSectionMeta
    ) {
      return;
    }

    let reusableSectionSource = selectedReusableSectionSource;
    if (activeSiteId) {
      try {
        const sections = await listReusableSections(activeSiteId, { status: 'active' });
        setReusableSections(sections);
        reusableSectionSource = sections.find((section) => section.id === selectedReusableSectionMeta.sectionId)
          || reusableSectionSource;
      } catch (error) {
        if (!reusableSectionSource) {
          setEditorNotice(error instanceof Error ? error.message : 'Unable to refresh saved section source.');
          return;
        }
      }
    }

    if (!reusableSectionSource || !reusableSectionSource.content.elements.length) {
      return;
    }

    const sectionRoots = reusableSectionSource.content.elements;
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
    if (!selectedEntry || isLayerLocked(selectedEntry.element)) {
      return;
    }

    const nextElement = cloneReusableSectionInstanceTree(
      refreshSourceElement,
      reusableSectionSource,
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
    setEditorNotice(`Synced ${reusableSectionSource.name} from the saved section source.`);
  }, [
    activeSiteId,
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

    const previousDisplayedElements = applyResponsiveOverridesToElements(elementsRef.current, breakpoint);
    const flowedElements = applyRootSectionFlow(previousDisplayedElements, newElements);
    const nextBaseElements = mergeDisplayedElementsIntoBreakpoint(elementsRef.current, flowedElements, breakpoint);

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
          isLayerLocked(element) ? element : applyUpdatesForBreakpoint(element, updates, breakpoint)
        ));

        if (!result.updated) {
          return currentElements;
        }

        const previousDisplayedElements = applyResponsiveOverridesToElements(currentElements, breakpoint);
        const nextDisplayedElements = applyResponsiveOverridesToElements(result.elements, breakpoint);
        const flowedDisplayedElements = applyRootSectionFlow(previousDisplayedElements, nextDisplayedElements);
        return mergeDisplayedElementsIntoBreakpoint(result.elements, flowedDisplayedElements, breakpoint);
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
      if (!primaryEntry || isLayerLocked(primaryEntry.element)) {
        return currentElements;
      }

      const nudgeEntries = (selectedIds.length > 1
        ? selectedIds
            .map((id) => findElementEntry(currentElements, id))
            .filter((entry): entry is { element: CanvasElement; parentId: string | null } => (
              !!entry &&
              entry.parentId === primaryEntry.parentId &&
              !isLayerLocked(entry.element) &&
              !isLayerHidden(entry.element)
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
      const targetMinX = deltaX === 0 ? minX : Math.round(minX + deltaX);
      const targetMinY = deltaY === 0 ? minY : Math.round(minY + deltaY);
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
  }, [findElementEntry, selectedId, selectedIds, size.height, size.width, updateElementsWithHistory]);

  const alignSelectedElement = useCallback((alignment: CanvasAlignment) => {
    if (!selectedId) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const primaryEntry = findElementEntry(currentElements, selectedId);
      if (!primaryEntry || isLayerLocked(primaryEntry.element)) {
        return currentElements;
      }

      const alignEntries = (selectedIds.length > 1
        ? selectedIds
            .map((id) => findElementEntry(currentElements, id))
            .filter((entry): entry is { element: CanvasElement; parentId: string | null } => (
              !!entry &&
              entry.parentId === primaryEntry.parentId &&
              !isLayerLocked(entry.element) &&
              !isLayerHidden(entry.element)
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
          !isLayerLocked(entry.element) &&
          !isLayerHidden(entry.element)
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
    const canNestInSelection = selectedElement && !isLayerLocked(selectedElement) && canAcceptNestedDrop(selectedElement.type);
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

      updateElementsWithHistory(applyRootSectionInsertionFlow(elements, newElements), newElements[0].id);
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

    updateElementsWithHistory(applyRootSectionInsertionFlow(elements, [newElement]), newElement.id);
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
    setReusableSectionDraftSubmitted(false);
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

    setReusableSectionDraftSubmitted(true);
    const name = reusableSectionDraft.name.trim();
    if (!name) {
      setEditorNotice('Fix required reusable section fields before saving.');
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
          setReusableSectionDraftSubmitted(false);
          setReusableSectionDraft(null);
          return;
        }

        const updated = await updateReusableSection(activeSiteId, reusableSectionDraft.sectionId, {
          name,
          updatedBy: 'admin',
        });
        setReusableSections((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }

      setReusableSectionDraftSubmitted(false);
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

    setReusableSectionDraftSubmitted(false);
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
    if (deletingReusableSectionId) {
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
      setDeletingReusableSectionId(sectionId);
      await deleteReusableSection(activeSiteId, sectionId);
      setReusableSections((current) => current.filter((item) => item.id !== sectionId));
      setPendingDeleteReusableSection(null);
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to delete reusable section');
    } finally {
      setDeletingReusableSectionId(null);
    }
  }, [activeSiteId, canDeleteReusableSections, deletingReusableSectionId, reusableDeleteDisabledReason, reusableSections]);

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

    setClipboardElements(entries.map((entry) => ({
      element: JSON.parse(JSON.stringify(entry.element)) as CanvasElement,
      sourceParentId: entry.parentId,
      sourceAbsoluteOffset: getElementAbsoluteOffset(elements, entry.element.id),
    })));

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
  }, [elements, getElementAbsoluteOffset, getSelectedSiblingEntries, isCanvasMutationDisabled, updateElementsWithHistory]);

  /**
   * Handle save
   */
  const handleSaveWrapper = useCallback(async (settingsOverride?: PageSettings, silent = false) => {
    const requestedSaveMode: EditorSaveMode = silent ? 'autosave' : 'manual';

    if (requestedSaveMode === 'manual') {
      manualSaveRequestedRef.current = true;
    }

    if (saveInFlightRef.current) {
      if (requestedSaveMode === 'manual' && activeSaveModeRef.current === 'autosave') {
        queuedManualSaveRef.current = true;
        setSaveStatus('saving');
        setAutosaveDueAt(null);
      }
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

    saveInFlightRef.current = true;
    activeSaveModeRef.current = requestedSaveMode;
    setIsSaving(true);
    setSaveStatus(requestedSaveMode === 'autosave' ? 'autosaving' : 'saving');

    try {
      await Promise.resolve(onSave(elementsRef.current, nextSettings, size));
      if (changeSequenceRef.current === saveSequence) {
        const completedSaveMode =
          requestedSaveMode === 'autosave' && manualSaveRequestedRef.current
            ? 'manual'
            : requestedSaveMode;
        setHasUnsavedChanges(false);
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        setLastSaveMode(completedSaveMode);
        if (completedSaveMode === 'manual') {
          manualSaveRequestedRef.current = false;
        }
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
        manualSaveRequestedRef.current = false;
        setEditorNotice(message);
      } else {
        console.error('Auto-save failed');
      }
      return false;
    } finally {
      const shouldRunQueuedManualSave =
        requestedSaveMode === 'autosave' && queuedManualSaveRef.current;

      if (shouldRunQueuedManualSave) {
        queuedManualSaveRef.current = false;
      }

      saveInFlightRef.current = false;
      activeSaveModeRef.current = null;
      setIsSaving(false);

      if (shouldRunQueuedManualSave) {
        window.setTimeout(() => {
          void handleSaveWrapper(settingsOverride, false);
        }, 0);
      }
    }
  }, [canEdit, editDisabledReason, hasUnsavedChanges, isParentPersistence, normalizedSaveOwnerLabel, onSave, pageSettings, size, validateSettings]);

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
    const runCanvasZoomShortcut = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
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
        preventCanvasBrowserZoom(e);
        if (isZoomOutShortcut) {
          handleZoomOut();
          return true;
        }
        if (isFitCanvasShortcut) {
          handleFitCanvas();
          return true;
        }
        handleZoomIn();
        return true;
      }

      return false;
    };

    const handleCanvasBrowserZoomKeyDown = (e: KeyboardEvent) => {
      runCanvasZoomShortcut(e);
    };
    const handleCanvasBrowserZoomKeyDownEvent: EventListener = (event) => {
      handleCanvasBrowserZoomKeyDown(event as KeyboardEvent);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSaving && ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) {
        e.preventDefault();
        return;
      }

      const key = e.key.toLowerCase();
      if (runCanvasZoomShortcut(e)) {
        return;
      }

      if (shouldIgnoreEditorShortcut(e.target)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === 'k' && !e.altKey) {
        e.preventDefault();
        setCommandPaletteOpen(true);
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

    const maybeKeyboardZoomTargets: Array<EventTarget | null> = [
      document,
      document.documentElement,
      document.body,
      editorShellRef.current,
      canvasViewportRef.current,
    ];
    const keyboardZoomTargets = maybeKeyboardZoomTargets.filter((target): target is EventTarget => target !== null);

    window.addEventListener('keydown', handleCanvasBrowserZoomKeyDownEvent, { capture: true });
    keyboardZoomTargets.forEach((target) => {
      target.addEventListener('keydown', handleCanvasBrowserZoomKeyDownEvent, { capture: true });
    });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleCanvasBrowserZoomKeyDownEvent, { capture: true });
      keyboardZoomTargets.forEach((target) => {
        target.removeEventListener('keydown', handleCanvasBrowserZoomKeyDownEvent, { capture: true });
      });
      window.removeEventListener('keydown', handleKeyDown);
    };

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
    preventCanvasBrowserZoom,
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
        setCanvasScaleValue(1);
        return;
      }

      const availableWidth = Math.max(container.clientWidth - 64, 0);
      const widthScale = availableWidth / renderedCanvasSize.width;
      const nextScale = Math.min(1, widthScale);

      setCanvasScaleValue(Number.isFinite(nextScale) ? Math.max(0.25, nextScale) : 1);
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
  }, [isPreview, renderedCanvasSize.height, renderedCanvasSize.width, setCanvasScaleValue]);

  useEffect(() => {
    if (!isCanvasAutoFit || isPreview) {
      return;
    }

    const container = canvasViewportRef.current;
    if (!container) {
      return;
    }

    const runFitIfStillActive = () => {
      if (isCanvasAutoFitRef.current) {
        applyFitCanvas();
      }
    };

    let frame = window.requestAnimationFrame(runFitIfStillActive);

    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(runFitIfStillActive);
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
    isComponentPanelVisible,
    isInspectorPanelVisible,
    isPreview,
  ]);

  useEffect(() => {
    if (!isCanvasFocusMode) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      handleFitCanvas();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [handleFitCanvas, isCanvasFocusMode, isComponentPanelVisible, isInspectorPanelVisible]);

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

  const editorCommandsByTestId = useMemo(() => {
    const next = new Map<string, EditorCommandRegistryItem>();
    editorCommandRegistry.commands.forEach((command) => {
      if (command.testId) {
        next.set(command.testId, command);
      }
    });
    return next;
  }, [editorCommandRegistry]);
  const editorCommandsById = useMemo(() => {
    const next = new Map<string, EditorCommandRegistryItem>();
    editorCommandRegistry.commands.forEach((command) => {
      next.set(command.id, command);
    });
    return next;
  }, [editorCommandRegistry]);
  const previewCommand = editorCommandsByTestId.get('editor-preview-toggle');
  const settingsCommand = editorCommandsByTestId.get('editor-page-settings');
  const reloadCommand = editorCommandsByTestId.get('editor-reload-page');
  const publishCommand = editorCommandsByTestId.get('editor-publish-page');
  const saveCommand = editorCommandsByTestId.get('editor-save-page');
  const gridVisibilityCommand = editorCommandsByTestId.get('editor-grid-visibility-toggle');
  const snapCommand = editorCommandsByTestId.get('editor-snap-toggle');
  const panCommand = editorCommandsByTestId.get('editor-pan-toggle');
  const zoomOutCommand = editorCommandsByTestId.get('editor-zoom-out');
  const zoomInCommand = editorCommandsByTestId.get('editor-zoom-in');
  const zoomFitCommand = editorCommandsByTestId.get('editor-zoom-fit');
  const contextEditTextCommand = editorCommandsById.get('edit-text');
  const contextDuplicateCommand = editorCommandsById.get('duplicate-selection');
  const contextSendToBackCommand = editorCommandsById.get('send-to-back');
  const contextBringToFrontCommand = editorCommandsById.get('bring-to-front');
  const contextDeleteCommand = editorCommandsById.get('delete-selection');
  const editorContextActionStatusId = 'editor-context-action-status';
  const contextQuickAddDisabledReason = editDisabledReason || 'Canvas mutation is disabled.';
  const contextQuickAddActionState = isCanvasMutationDisabled ? 'blocked' : 'ready';
  const contextQuickAddActionStatus = isCanvasMutationDisabled
    ? `Add component unavailable: ${contextQuickAddDisabledReason}`
    : `Add component available. ${CANVAS_CONTEXT_QUICK_ADD_ITEMS.length} quick-add shortcuts ready.`;
  const editorContextActionStatus = [
    `${breakpoint} canvas ${size.width} x ${size.height}px at ${zoomPercent}%.`,
    contextQuickAddActionStatus,
    editorCommandStatusText(contextEditTextCommand),
    editorCommandStatusText(contextDuplicateCommand),
    editorCommandStatusText(contextSendToBackCommand),
    editorCommandStatusText(contextBringToFrontCommand),
    editorCommandStatusText(contextDeleteCommand),
  ].join(' ');
  const editorInspectorActionStatusId = 'editor-inspector-action-status';
  const editorInspectorCommandIds = [
    'select-sibling-layers',
    'select-parent-layer',
    'select-child-layer',
    'select-child-layers',
    'group-selection',
    'ungroup-selection',
    'copy-selection',
    'duplicate-selection',
    'cut-selection',
    'paste-selection',
    'toggle-selection-visibility',
    'toggle-selection-lock',
    'send-to-back',
    'send-backward',
    'bring-forward',
    'bring-to-front',
    'align-left',
    'align-center',
    'align-right',
    'align-top',
    'align-middle',
    'align-bottom',
    'distribute-horizontal',
    'distribute-vertical',
    'delete-selection',
  ];
  const editorInspectorCommands = editorInspectorCommandIds
    .map((commandId) => editorCommandsById.get(commandId))
    .filter((command): command is EditorCommandRegistryItem => Boolean(command && command.state !== 'hidden'));
  const editorInspectorReadyCommandCount = editorInspectorCommands
    .filter((command) => command.state === 'ready')
    .length;
  const editorInspectorActionStatus = selectedIds.length > 0
    ? `Inspector actions for ${selectedIds.length} selected layer${selectedIds.length === 1 ? '' : 's'}. ${selectionScopeReason} ${editorInspectorReadyCommandCount} of ${editorInspectorCommands.length} actions ready.`
    : `Inspector empty state ready. ${INSPECTOR_EMPTY_QUICK_ADD_ITEMS.length} quick-add actions available.`;
  const editorInspectorCommandProps = (commandId: string) => {
    const command = editorCommandsById.get(commandId);
    return {
      'aria-describedby': editorInspectorActionStatusId,
      'data-command-id': command?.id,
      'data-action-state': editorCommandActionState(command),
      'data-action-status': editorCommandStatusText(command),
      'data-disabled-reason': editorCommandDisabledReason(command),
    };
  };
  const editorPrimaryActionStatusId = 'editor-primary-actions-status';
  const editorPrimaryActionStatus = [
    previewCommand,
    settingsCommand,
    reloadCommand,
    publishCommand,
    saveCommand,
  ]
    .filter((command): command is EditorCommandRegistryItem => Boolean(command && command.state !== 'hidden'))
    .map(editorCommandStatusText)
    .join('. ');
  const editorGridSnapActionStatusId = 'editor-grid-snap-action-status';
  const gridVisibilityActionState = gridVisibilityCommand?.state !== 'ready'
    ? editorCommandActionState(gridVisibilityCommand)
    : showGrid ? 'selected' : 'ready';
  const snapActionState = snapCommand?.state !== 'ready'
    ? editorCommandActionState(snapCommand)
    : snapEnabled ? 'selected' : 'ready';
  const gridSizeActionStatus = `Grid size control available. Current grid size is ${gridSize}px`;
  const editorGridSnapActionStatus = [
    editorCommandStatusText(gridVisibilityCommand),
    editorCommandStatusText(snapCommand),
    gridSizeActionStatus,
  ].join('. ');
  const editorZoomActionStatusId = 'editor-zoom-action-status';
  const panActionState = panCommand?.state !== 'ready'
    ? editorCommandActionState(panCommand)
    : isCanvasPanMode ? 'selected' : 'ready';
  const zoomSliderActionStatus = `Canvas zoom slider set to ${zoomPercent}%. Range ${CANVAS_ZOOM_MIN * 100}-${CANVAS_ZOOM_MAX * 100}%`;
  const editorZoomActionStatus = [
    isPreview
      ? 'Preview zoom is canvas-scoped and uses the expanded rendered content bounds.'
      : editorCommandStatusText(panCommand),
    editorCommandStatusText(zoomOutCommand),
    zoomSliderActionStatus,
    editorCommandStatusText(zoomInCommand),
    editorCommandStatusText(zoomFitCommand),
  ].join('. ');
  const editorSecondaryToolbarStatusId = 'editor-secondary-toolbar-action-status';
  const editorSecondaryToolbarCommandIds = [
    'undo',
    'redo',
    'copy-selection',
    'cut-selection',
    'paste-selection',
    'duplicate-selection',
    'select-sibling-layers',
    'select-child-layers',
    'group-selection',
    'ungroup-selection',
    'toggle-selection-visibility',
    'toggle-selection-lock',
    'send-to-back',
    'send-backward',
    'bring-forward',
    'bring-to-front',
    'align-left',
    'align-center',
    'align-right',
    'align-top',
    'align-middle',
    'align-bottom',
    'distribute-horizontal',
    'distribute-vertical',
    'delete-selection',
    'toggle-component-panel',
    'toggle-layers-panel',
    'toggle-inspector-panel',
    'toggle-focus-mode',
  ];
  const editorSecondaryToolbarCommands = editorSecondaryToolbarCommandIds
    .map((commandId) => editorCommandsById.get(commandId))
    .filter((command): command is EditorCommandRegistryItem => Boolean(command && command.state !== 'hidden'));
  const editorSecondaryToolbarReadyCount = editorSecondaryToolbarCommands
    .filter((command) => command.state === 'ready')
    .length;
  const editorSecondaryToolbarStatus = `Secondary editor toolbar ready. ${editorSecondaryToolbarReadyCount} of ${editorSecondaryToolbarCommands.length} actions ready for the current selection.`;
  const inspectorPanelToggleActionStatus = isInspectorPanelVisible
    ? `Hide inspector panel available for ${INSPECTOR_PANEL_PURPOSE}.`
    : `Show inspector panel available for ${INSPECTOR_PANEL_PURPOSE}.`;
  const contextInspectorPanelActionStatus = isCanvasFocusMode
    ? `Show inspector and exit focus mode available for ${INSPECTOR_PANEL_PURPOSE}.`
    : `Toggle inspector panel available for ${INSPECTOR_PANEL_PURPOSE}.`;
  const editorSecondaryToolbarCommandProps = (commandId: string) => {
    const command = editorCommandsById.get(commandId);
    return {
      'aria-describedby': editorSecondaryToolbarStatusId,
      'data-command-id': command?.id,
      'data-action-state': editorCommandActionState(command),
      'data-action-status': editorCommandStatusText(command),
      'data-disabled-reason': editorCommandDisabledReason(command),
    };
  };
  const visibleEditorCommands = useMemo(() => (
    editorCommandRegistry.commands.filter((command) => command.state !== 'hidden')
  ), [editorCommandRegistry.commands]);
  const filteredEditorCommands = useMemo(() => {
    const normalizedQuery = commandPaletteQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return visibleEditorCommands;
    }

    return visibleEditorCommands.filter((command) => [
      command.label,
      command.id,
      formatEditorCommandCategory(command.category),
      command.targetScope,
      command.shortcut || '',
      command.reason,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [commandPaletteQuery, visibleEditorCommands]);
  const activeCommandPaletteCommand = filteredEditorCommands[activeCommandPaletteIndex] ?? filteredEditorCommands[0];
  const commandPaletteStatusId = 'editor-command-palette-status';
  const commandPaletteStatus = commandPaletteOpen
    ? `${filteredEditorCommands.length} of ${visibleEditorCommands.length} visible editor commands shown. ${editorCommandRegistry.summary.readyCommandCount} commands are ready.`
    : `Command palette closed. ${visibleEditorCommands.length} visible editor commands available.`;

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    setActiveCommandPaletteIndex(0);
  }, [commandPaletteOpen, commandPaletteQuery]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      commandPaletteInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [commandPaletteOpen]);

  const executeEditorCommand = useCallback((command?: EditorCommandRegistryItem) => {
    if (!command) {
      return;
    }

    if (command.state !== 'ready') {
      setEditorNotice(editorCommandStatusText(command));
      return;
    }

    setCommandPaletteOpen(false);
    setCommandPaletteQuery('');

    switch (command.id) {
      case 'undo':
        handleUndo();
        return;
      case 'redo':
        handleRedo();
        return;
      case 'copy-selection':
        handleCopy();
        return;
      case 'cut-selection':
        handleCut();
        return;
      case 'paste-selection':
        handlePaste();
        return;
      case 'duplicate-selection':
        handleDuplicate();
        return;
      case 'select-sibling-layers':
        handleSelectSiblingScope();
        return;
      case 'select-child-layers':
        handleSelectChildLayerScope();
        return;
      case 'select-parent-layer':
        handleSelectParentLayer();
        return;
      case 'select-child-layer':
        handleSelectFirstChildLayer();
        return;
      case 'group-selection':
        handleGroupSelected();
        return;
      case 'ungroup-selection':
        handleUngroupSelected();
        return;
      case 'toggle-selection-visibility':
        handleSelectedVisibilityToggle();
        return;
      case 'toggle-selection-lock':
        handleSelectedLockToggle();
        return;
      case 'edit-text':
        handleEditSelectedText();
        return;
      case 'send-to-back':
        handleZOrderChange('back');
        return;
      case 'send-backward':
        handleZOrderChange('backward');
        return;
      case 'bring-forward':
        handleZOrderChange('forward');
        return;
      case 'bring-to-front':
        handleZOrderChange('front');
        return;
      case 'align-left':
        alignSelectedElement('left');
        return;
      case 'align-center':
        alignSelectedElement('center');
        return;
      case 'align-right':
        alignSelectedElement('right');
        return;
      case 'align-top':
        alignSelectedElement('top');
        return;
      case 'align-middle':
        alignSelectedElement('middle');
        return;
      case 'align-bottom':
        alignSelectedElement('bottom');
        return;
      case 'distribute-horizontal':
        distributeSelectedElements('horizontal');
        return;
      case 'distribute-vertical':
        distributeSelectedElements('vertical');
        return;
      case 'delete-selection':
        deleteElement();
        return;
      case 'toggle-component-panel':
        handleToggleComponentPanel();
        return;
      case 'toggle-layers-panel':
        handleToggleLayersPanel();
        return;
      case 'toggle-inspector-panel':
        handleToggleInspectorPanel();
        return;
      case 'toggle-focus-mode':
        handleToggleCanvasFocus();
        return;
      case 'toggle-preview':
        setIsPreview((current) => !current);
        return;
      case 'toggle-grid':
        handleToggleGridVisibility();
        return;
      case 'toggle-snap':
        handleToggleSnap();
        return;
      case 'toggle-pan':
        handleToggleCanvasPanMode();
        return;
      case 'zoom-out':
        handleZoomOut();
        return;
      case 'zoom-in':
        handleZoomIn();
        return;
      case 'zoom-fit':
        handleFitCanvas();
        return;
      case 'open-page-settings':
        setIsSettingsOpen(true);
        return;
      case 'reload-page':
        handleReload();
        return;
      case 'publish-page':
        void handleTogglePublish();
        return;
      case 'save-page':
        void handleSaveWrapper();
        return;
      default:
        setEditorNotice(`${command.label} is registered but not wired to the editor surface yet.`);
    }
  }, [
    alignSelectedElement,
    deleteElement,
    distributeSelectedElements,
    handleCopy,
    handleCut,
    handleDuplicate,
    handleEditSelectedText,
    handleFitCanvas,
    handleGroupSelected,
    handlePaste,
    handleRedo,
    handleReload,
    handleSaveWrapper,
    handleSelectChildLayerScope,
    handleSelectFirstChildLayer,
    handleSelectParentLayer,
    handleSelectSiblingScope,
    handleSelectedLockToggle,
    handleSelectedVisibilityToggle,
    handleToggleCanvasFocus,
    handleToggleCanvasPanMode,
    handleToggleComponentPanel,
    handleToggleGridVisibility,
    handleToggleInspectorPanel,
    handleToggleLayersPanel,
    handleTogglePublish,
    handleToggleSnap,
    handleUndo,
    handleUngroupSelected,
    handleZOrderChange,
    handleZoomIn,
    handleZoomOut,
  ]);

  const handleCommandPaletteInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setCommandPaletteOpen(false);
      setCommandPaletteQuery('');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setActiveCommandPaletteIndex((current) => (
        filteredEditorCommands.length ? (current + 1) % filteredEditorCommands.length : 0
      ));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setActiveCommandPaletteIndex((current) => (
        filteredEditorCommands.length ? (current - 1 + filteredEditorCommands.length) % filteredEditorCommands.length : 0
      ));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      executeEditorCommand(activeCommandPaletteCommand);
    }
  }, [activeCommandPaletteCommand, executeEditorCommand, filteredEditorCommands.length]);

  const editorPrimaryActions = (
    <div
      className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1 shadow-sm"
      role="group"
      aria-label="Primary editor actions"
      aria-describedby={editorPrimaryActionStatusId}
      data-testid="editor-primary-actions"
      data-action-status={editorPrimaryActionStatus ? `${editorPrimaryActionStatus}.` : 'No primary editor actions are visible.'}
      data-command-ready-count={editorCommandRegistry.summary.categories.find((category) => category.category === 'workflow')?.ready || 0}
      data-command-schema={editorCommandRegistry.schemaVersion}
    >
      <span
        id={editorPrimaryActionStatusId}
        className="sr-only"
        data-testid="editor-primary-actions-status"
      >
        {editorPrimaryActionStatus ? `${editorPrimaryActionStatus}.` : 'No primary editor actions are visible.'}
      </span>
      <button
        type="button"
        onClick={() => setIsPreview(!isPreview)}
        disabled={isSaving}
        aria-describedby={editorPrimaryActionStatusId}
        data-command-id={previewCommand?.id}
        data-action-state={editorCommandActionState(previewCommand)}
        data-action-status={editorCommandStatusText(previewCommand)}
        data-disabled-reason={editorCommandDisabledReason(previewCommand)}
        data-testid="editor-preview-toggle"
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60',
          isPreview
            ? 'bg-slate-950 text-white'
            : 'hover:bg-slate-100',
        )}
      >
        <Eye className="h-4 w-4" />
        {isPreview ? 'Edit' : 'Preview'}
      </button>

      {!hideSettings && (
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          title={editorCommandDisabledReason(settingsCommand) || settingsCommand?.reason || 'Page settings'}
          aria-label="Page settings"
          aria-describedby={editorPrimaryActionStatusId}
          data-command-id={settingsCommand?.id}
          data-action-state={editorCommandActionState(settingsCommand)}
          data-action-status={editorCommandStatusText(settingsCommand)}
          data-disabled-reason={editorCommandDisabledReason(settingsCommand)}
          data-testid="editor-page-settings"
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      )}

      <button
        type="button"
        onClick={handleReload}
        disabled={isSaving}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        title={editorCommandDisabledReason(reloadCommand) || reloadCommand?.reason || 'Reload page from last saved state'}
        aria-label="Reload page"
        aria-describedby={editorPrimaryActionStatusId}
        data-command-id={reloadCommand?.id}
        data-action-state={editorCommandActionState(reloadCommand)}
        data-action-status={editorCommandStatusText(reloadCommand)}
        data-disabled-reason={editorCommandDisabledReason(reloadCommand)}
        data-testid="editor-reload-page"
      >
        <RefreshCw className="h-4 w-4" />
        <span>Reload</span>
      </button>

      <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

      {!hideSave && (
        <>
          {mode === 'page' && (
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={isSaving || !canEdit || !canPublish || (pageSettings.status !== 'published' && effectivePublishDisabled)}
              className={cn(
                'rounded-md px-2 py-1.5 text-sm font-medium',
                pageSettings.status === 'published'
                  ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                  : 'bg-emerald-600 text-white hover:bg-emerald-600/90',
                isSaving || !canEdit || !canPublish || (pageSettings.status !== 'published' && effectivePublishDisabled)
                  ? 'cursor-not-allowed opacity-70'
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
              aria-describedby={editorPrimaryActionStatusId}
              data-command-id={publishCommand?.id}
              data-action-state={editorCommandActionState(publishCommand)}
              data-action-status={editorCommandStatusText(publishCommand)}
              data-disabled-reason={editorCommandDisabledReason(publishCommand)}
              data-testid="editor-publish-page"
            >
              {pageSettings.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleSaveWrapper()}
            disabled={isSaving || !canEdit}
            className="flex items-center gap-2 rounded-md bg-slate-950 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            title={editorCommandDisabledReason(saveCommand) || saveCommand?.reason || (canEdit ? `Save ${editorEntityLabel} (Ctrl+S)` : editDisabledReason)}
            aria-label={`Save ${editorEntityLabel.toLowerCase()}`}
            aria-describedby={editorPrimaryActionStatusId}
            data-command-id={saveCommand?.id}
            data-action-state={editorCommandActionState(saveCommand)}
            data-action-status={editorCommandStatusText(saveCommand)}
            data-disabled-reason={editorCommandDisabledReason(saveCommand)}
            data-testid="editor-save-page"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </>
      )}
    </div>
  );

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
          <div
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label="Canvas viewport controls"
            aria-describedby={canvasViewportActionStatusId}
            data-testid="editor-viewport-controls"
            data-action-state={canvasViewportActionState}
            data-action-status={canvasViewportActionStatus}
            data-active-breakpoint={breakpoint}
            data-active-breakpoint-label={activeBreakpointLabel}
            data-active-preset={activeCanvasPresetId}
            data-canvas-width={size.width}
            data-canvas-height={size.height}
            data-responsive-inheritance-state={responsiveViewportInheritanceState}
            data-responsive-active-override-layer-count={activeBreakpointOverrideLayerCount}
            data-responsive-total-override-layer-count={totalResponsiveOverrideLayerCount}
            data-responsive-next-action-schema={editorResponsiveNextAction.schemaVersion}
            data-responsive-next-action-id={editorResponsiveNextAction.id}
            data-responsive-next-action-state={editorResponsiveNextAction.actionState}
            data-responsive-next-action-target={editorResponsiveNextAction.target}
            data-responsive-next-action-surface={editorResponsiveNextAction.actionSurface}
            data-disabled-reason={canvasViewportDisabledReason || undefined}
          >
            <span
              id={canvasViewportActionStatusId}
              className="sr-only"
              data-testid="editor-viewport-action-status"
              aria-live="polite"
            >
              {canvasViewportActionStatus}
            </span>
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
                title={canvasViewportDisabledReason || 'Desktop'}
                aria-label="Desktop canvas"
                aria-pressed={breakpoint === 'desktop'}
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-breakpoint-desktop"
                data-breakpoint-option="desktop"
                data-action-state={breakpointControlActionState('desktop')}
                data-action-status={breakpointControlActionStatus('desktop')}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
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
                title={canvasViewportDisabledReason || 'Tablet'}
                aria-label="Tablet canvas"
                aria-pressed={breakpoint === 'tablet'}
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-breakpoint-tablet"
                data-breakpoint-option="tablet"
                data-action-state={breakpointControlActionState('tablet')}
                data-action-status={breakpointControlActionStatus('tablet')}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
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
                title={canvasViewportDisabledReason || 'Mobile'}
                aria-label="Mobile canvas"
                aria-pressed={breakpoint === 'mobile'}
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-breakpoint-mobile"
                data-breakpoint-option="mobile"
                data-action-state={breakpointControlActionState('mobile')}
                data-action-status={breakpointControlActionStatus('mobile')}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
            {breakpoint !== 'desktop' && (
              <div
                className={cn(
                  'hidden max-w-48 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold lg:flex',
                  activeBreakpointOverrideLayerCount > 0
                    ? 'border-sky-200 bg-white text-sky-700'
                    : 'border-slate-200 bg-white text-slate-600',
                )}
                title={responsiveViewportActionStatus}
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-responsive-viewport-summary"
                data-responsive-breakpoint={breakpoint}
                data-responsive-inheritance-state={responsiveViewportInheritanceState}
                data-responsive-override-layer-count={activeBreakpointOverrideLayerCount}
                data-responsive-total-override-layer-count={totalResponsiveOverrideLayerCount}
                data-action-status={responsiveViewportActionStatus}
              >
                <span className="rounded bg-slate-100 px-1.5 py-0.5 tabular-nums text-slate-700">
                  {activeBreakpointOverrideLayerCount}
                </span>
                <span className="truncate">{responsiveViewportSummaryLabel}</span>
              </div>
            )}
            <div
              className={cn(
                'hidden max-w-64 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold 2xl:flex',
                editorResponsiveNextAction.actionState === 'blocked'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : editorResponsiveNextAction.actionState === 'selected'
                  ? 'border-sky-200 bg-sky-50 text-sky-800'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
              title={editorResponsiveNextAction.detail}
              data-testid="editor-responsive-next-action"
              data-responsive-next-action-schema={editorResponsiveNextAction.schemaVersion}
              data-responsive-next-action-id={editorResponsiveNextAction.id}
              data-responsive-next-action-breakpoint={editorResponsiveNextAction.breakpoint}
              data-responsive-next-action-state={editorResponsiveNextAction.actionState}
              data-responsive-next-action-target={editorResponsiveNextAction.target}
              data-responsive-next-action-surface={editorResponsiveNextAction.actionSurface}
              data-responsive-next-action-selected-layer-id={editorResponsiveNextAction.selectedLayerId || ''}
              data-responsive-next-action-override-groups={editorResponsiveNextAction.overrideGroups.join(',')}
            >
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">Next</span>
              <span className="truncate">{editorResponsiveNextAction.label}</span>
              <button
                type="button"
                onClick={() => void copyEditorResponsiveNextAction()}
                className="rounded p-0.5 text-slate-500 hover:bg-white hover:text-slate-900"
                title="Copy responsive next action"
                aria-label="Copy responsive next action"
                data-testid="editor-copy-responsive-next-action"
                data-copy-schema={editorResponsiveNextAction.schemaVersion}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-sm xl:flex">
              <select
                value={activeCanvasPresetId}
                onChange={(event) => handleCanvasPresetChange(event.target.value)}
                disabled={isCanvasMutationDisabled}
                title={canvasViewportDisabledReason || undefined}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Canvas size preset"
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-canvas-preset-select"
                data-action-state={canvasViewportActionState}
                data-action-status={canvasSizeControlActionStatus}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
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
                max={MAX_CANVAS_WIDTH}
                step={10}
                value={size.width}
                onChange={(event) => handleCanvasDimensionInput('width', event.target.value)}
                disabled={isCanvasMutationDisabled}
                title={canvasViewportDisabledReason || undefined}
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Canvas width"
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-canvas-width-input"
                data-action-state={canvasViewportActionState}
                data-action-status={canvasSizeControlActionStatus}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
              />
              <span className="text-slate-400">x</span>
              <input
                type="number"
                min={MIN_CANVAS_DIMENSION}
                max={MAX_CANVAS_HEIGHT}
                step={10}
                value={size.height}
                onChange={(event) => handleCanvasDimensionInput('height', event.target.value)}
                disabled={isCanvasMutationDisabled}
                title={canvasViewportDisabledReason || undefined}
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Canvas height"
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-canvas-height-input"
                data-action-state={canvasViewportActionState}
                data-action-status={canvasSizeControlActionStatus}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
              />
            </div>
            <details
              className="group relative xl:hidden"
              aria-label="Canvas size controls"
              aria-describedby={canvasViewportActionStatusId}
              data-testid="editor-canvas-size-disclosure"
              data-default-collapsed="true"
              data-action-state={canvasViewportActionState}
              data-action-status={canvasSizeControlActionStatus}
              data-active-preset={activeCanvasPresetId}
              data-canvas-width={size.width}
              data-canvas-height={size.height}
              data-disabled-reason={canvasViewportDisabledReason || undefined}
            >
              <summary
                className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 group-open:bg-slate-950 group-open:text-white [&::-webkit-details-marker]:hidden"
                aria-describedby={canvasViewportActionStatusId}
                data-testid="editor-canvas-size-disclosure-summary"
                data-action-state={canvasViewportActionState}
                data-action-status={canvasSizeControlActionStatus}
                data-disabled-reason={canvasViewportDisabledReason || undefined}
              >
                <Ruler className="h-4 w-4" />
                <span>{activeCanvasPresetLabel}</span>
                <span className="tabular-nums text-current/70">{size.width}x{size.height}</span>
              </summary>
              <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                <label className="grid gap-1 font-medium text-slate-600">
                  Preset
                  <select
                    value={activeCanvasPresetId}
                    onChange={(event) => handleCanvasPresetChange(event.target.value)}
                    disabled={isCanvasMutationDisabled}
                    title={canvasViewportDisabledReason || undefined}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Compact canvas size preset"
                    aria-describedby={canvasViewportActionStatusId}
                    data-testid="editor-canvas-compact-preset-select"
                    data-action-state={canvasViewportActionState}
                    data-action-status={canvasSizeControlActionStatus}
                    data-disabled-reason={canvasViewportDisabledReason || undefined}
                  >
                    <option value="custom">Custom</option>
                    {CANVAS_SIZE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <label className="grid gap-1 font-medium text-slate-600">
                    Width
                    <input
                      type="number"
                      min={MIN_CANVAS_DIMENSION}
                      max={MAX_CANVAS_WIDTH}
                      step={10}
                      value={size.width}
                      onChange={(event) => handleCanvasDimensionInput('width', event.target.value)}
                      disabled={isCanvasMutationDisabled}
                      title={canvasViewportDisabledReason || undefined}
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-800 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Compact canvas width"
                      aria-describedby={canvasViewportActionStatusId}
                      data-testid="editor-canvas-compact-width-input"
                      data-action-state={canvasViewportActionState}
                      data-action-status={canvasSizeControlActionStatus}
                      data-disabled-reason={canvasViewportDisabledReason || undefined}
                    />
                  </label>
                  <span className="pb-2 text-slate-400">x</span>
                  <label className="grid gap-1 font-medium text-slate-600">
                    Height
                    <input
                      type="number"
                      min={MIN_CANVAS_DIMENSION}
                      max={MAX_CANVAS_HEIGHT}
                      step={10}
                      value={size.height}
                      onChange={(event) => handleCanvasDimensionInput('height', event.target.value)}
                      disabled={isCanvasMutationDisabled}
                      title={canvasViewportDisabledReason || undefined}
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-800 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Compact canvas height"
                      aria-describedby={canvasViewportActionStatusId}
                      data-testid="editor-canvas-compact-height-input"
                      data-action-state={canvasViewportActionState}
                      data-action-status={canvasSizeControlActionStatus}
                      data-disabled-reason={canvasViewportDisabledReason || undefined}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          {/* Right */}
          <div
            className="flex min-w-max shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label="Secondary editor toolbar actions"
            aria-describedby={editorSecondaryToolbarStatusId}
            data-testid="editor-toolbar-actions"
            data-primary-actions-first="true"
            data-action-status={editorSecondaryToolbarStatus}
            data-command-ready-count={editorSecondaryToolbarReadyCount}
            data-command-count={editorSecondaryToolbarCommands.length}
            data-command-schema={editorCommandRegistry.schemaVersion}
          >
            <span
              id={editorSecondaryToolbarStatusId}
              className="sr-only"
              data-testid="editor-secondary-toolbar-action-status"
              aria-live="polite"
            >
              {editorSecondaryToolbarStatus}
            </span>
            {editorPrimaryActions}

            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="inline-flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              title="Open editor commands (Cmd/Ctrl+K)"
              aria-label="Open editor commands"
              aria-keyshortcuts="Control+K Meta+K"
              aria-describedby={commandPaletteStatusId}
              aria-expanded={commandPaletteOpen}
              aria-controls={commandPaletteOpen ? 'editor-command-palette-dialog' : undefined}
              data-testid="editor-command-palette-trigger"
              data-action-state={commandPaletteOpen ? 'selected' : 'ready'}
              data-action-status={commandPaletteStatus}
              data-command-palette-open={commandPaletteOpen ? 'true' : 'false'}
              data-command-schema={editorCommandRegistry.schemaVersion}
              data-command-count={visibleEditorCommands.length}
              data-command-ready-count={editorCommandRegistry.summary.readyCommandCount}
            >
              <Search className="h-4 w-4" />
              <span>Commands</span>
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                Cmd/Ctrl K
              </span>
            </button>

            <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

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
              {...editorSecondaryToolbarCommandProps('undo')}
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
              {...editorSecondaryToolbarCommandProps('redo')}
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
              {...editorSecondaryToolbarCommandProps('copy-selection')}
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
              {...editorSecondaryToolbarCommandProps('cut-selection')}
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
              {...editorSecondaryToolbarCommandProps('paste-selection')}
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
              {...editorSecondaryToolbarCommandProps('duplicate-selection')}
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
              {...editorSecondaryToolbarCommandProps('select-sibling-layers')}
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
              {...editorSecondaryToolbarCommandProps('select-child-layers')}
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
              {...editorSecondaryToolbarCommandProps('group-selection')}
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
              {...editorSecondaryToolbarCommandProps('ungroup-selection')}
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
              {...editorSecondaryToolbarCommandProps('toggle-selection-visibility')}
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
              {...editorSecondaryToolbarCommandProps('toggle-selection-lock')}
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
                {...editorSecondaryToolbarCommandProps('send-to-back')}
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
                {...editorSecondaryToolbarCommandProps('send-backward')}
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
                {...editorSecondaryToolbarCommandProps('bring-forward')}
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
                {...editorSecondaryToolbarCommandProps('bring-to-front')}
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
                {...editorSecondaryToolbarCommandProps('align-left')}
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
                {...editorSecondaryToolbarCommandProps('align-center')}
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
                {...editorSecondaryToolbarCommandProps('align-right')}
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
                {...editorSecondaryToolbarCommandProps('align-top')}
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
                {...editorSecondaryToolbarCommandProps('align-middle')}
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
                {...editorSecondaryToolbarCommandProps('align-bottom')}
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
                {...editorSecondaryToolbarCommandProps('distribute-horizontal')}
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
                {...editorSecondaryToolbarCommandProps('distribute-vertical')}
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
              {...editorSecondaryToolbarCommandProps('delete-selection')}
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={handleToggleComponentPanel}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                isComponentPanelVisible
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'hover:bg-slate-100'
              )}
              title={isComponentPanelVisible ? 'Hide components panel (B)' : 'Show components panel (B)'}
              aria-label={isComponentPanelVisible ? 'Hide components panel' : 'Show components panel'}
              aria-pressed={isComponentPanelVisible}
              aria-keyshortcuts="B"
              data-testid="editor-toggle-component-panel"
              data-panel-visible={isComponentPanelVisible ? 'true' : 'false'}
              data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
              {...editorSecondaryToolbarCommandProps('toggle-component-panel')}
            >
              <PanelLeft className="w-4 h-4" />
              Components
            </button>

            <button
              type="button"
              onClick={handleToggleLayersPanel}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                rightPanel === 'layers' && isInspectorPanelVisible
                  ? 'bg-slate-950 text-white'
                  : 'hover:bg-slate-100'
              )}
              title={rightPanel === 'layers' && isInspectorPanelVisible ? 'Show properties panel (L)' : 'Show layers panel (L)'}
              aria-label={rightPanel === 'layers' && isInspectorPanelVisible ? 'Show properties panel' : 'Show layers panel'}
              aria-pressed={rightPanel === 'layers' && isInspectorPanelVisible}
              aria-keyshortcuts="L"
              data-testid="editor-toggle-layers-panel"
              data-right-panel={rightPanel}
              data-inspector-visible={isInspectorPanelVisible ? 'true' : 'false'}
              data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
              {...editorSecondaryToolbarCommandProps('toggle-layers-panel')}
            >
              <Layers className="w-4 h-4" />
              Layers
            </button>

            <button
              type="button"
              onClick={handleToggleInspectorPanel}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                isInspectorPanelVisible
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'hover:bg-slate-100'
              )}
              title={isInspectorPanelVisible ? `Hide inspector panel: ${INSPECTOR_PANEL_PURPOSE} (I)` : `Show inspector panel: ${INSPECTOR_PANEL_PURPOSE} (I)`}
              aria-label={isInspectorPanelVisible ? `Hide inspector panel for ${INSPECTOR_PANEL_PURPOSE}` : `Show inspector panel for ${INSPECTOR_PANEL_PURPOSE}`}
              aria-pressed={isInspectorPanelVisible}
              aria-keyshortcuts="I"
              data-testid="editor-toggle-inspector-panel"
              data-panel-visible={isInspectorPanelVisible ? 'true' : 'false'}
              data-panel-purpose={INSPECTOR_PANEL_PURPOSE_KEY}
              data-panel-purpose-label={INSPECTOR_PANEL_PURPOSE}
              data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
              {...editorSecondaryToolbarCommandProps('toggle-inspector-panel')}
              data-action-status={inspectorPanelToggleActionStatus}
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
              {...editorSecondaryToolbarCommandProps('toggle-focus-mode')}
            >
              <Maximize2 className="w-4 h-4" />
              Focus
            </button>

          </div>
        </header>

        <span
          id={commandPaletteStatusId}
          className="sr-only"
          data-testid="editor-command-palette-status"
        >
          {commandPaletteStatus}
        </span>

        {commandPaletteOpen && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center bg-slate-950/35 px-4 py-20 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setCommandPaletteOpen(false);
                setCommandPaletteQuery('');
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="editor-command-palette-title"
              aria-describedby={commandPaletteStatusId}
              className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
              id="editor-command-palette-dialog"
              data-testid="editor-command-palette"
              data-command-schema={editorCommandRegistry.schemaVersion}
              data-command-count={visibleEditorCommands.length}
              data-filtered-command-count={filteredEditorCommands.length}
              data-command-ready-count={editorCommandRegistry.summary.readyCommandCount}
              data-active-command-id={activeCommandPaletteCommand?.id || ''}
            >
              <div className="border-b border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="editor-command-palette-title" className="text-sm font-semibold text-slate-950">
                    Editor commands
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCommandPaletteOpen(false);
                      setCommandPaletteQuery('');
                    }}
                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    aria-label="Close editor commands"
                    data-testid="editor-command-palette-close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    ref={commandPaletteInputRef}
                    type="search"
                    value={commandPaletteQuery}
                    onChange={(event) => setCommandPaletteQuery(event.target.value)}
                    onKeyDown={handleCommandPaletteInputKeyDown}
                    placeholder="Search actions, states, or shortcuts"
                    className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                    aria-label="Search editor commands"
                    aria-describedby={commandPaletteStatusId}
                    aria-controls="editor-command-palette-results"
                    aria-activedescendant={activeCommandPaletteCommand ? `editor-command-palette-option-${activeCommandPaletteCommand.id}` : undefined}
                    data-testid="editor-command-palette-input"
                  />
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    Enter
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500" data-testid="editor-command-palette-status-text">
                  {commandPaletteStatus}
                </p>
              </div>

              <div
                id="editor-command-palette-results"
                role="listbox"
                aria-label="Editor command results"
                className="max-h-[min(60vh,34rem)] overflow-y-auto p-2"
                data-testid="editor-command-palette-results"
              >
                {filteredEditorCommands.length > 0 ? (
                  filteredEditorCommands.map((command, index) => {
                    const isActive = command.id === activeCommandPaletteCommand?.id;
                    const disabledReason = editorCommandDisabledReason(command) || '';

                    return (
                      <button
                        key={command.id}
                        id={`editor-command-palette-option-${command.id}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveCommandPaletteIndex(index)}
                        onClick={() => executeEditorCommand(command)}
                        className={cn(
                          'grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-md px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
                          isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-700 hover:bg-slate-50',
                          command.state !== 'ready' && 'opacity-70',
                        )}
                        data-testid={`editor-command-palette-result-${command.id}`}
                        data-command-id={command.id}
                        data-command-category={command.category}
                        data-command-target-scope={command.targetScope}
                        data-action-state={editorCommandActionState(command)}
                        data-command-state={command.state}
                        data-disabled-reason={disabledReason}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{command.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {formatEditorCommandCategory(command.category)} · {command.reason}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {command.shortcut && (
                            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {command.shortcut}
                            </span>
                          )}
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                              command.state === 'ready'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700',
                            )}
                          >
                            {command.state === 'ready' ? 'Ready' : 'Blocked'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div
                    className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500"
                    data-testid="editor-command-palette-empty"
                  >
                    No commands match this search.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div
          ref={editorShellRef}
          className="relative flex min-h-0 flex-1 overflow-hidden"
          data-testid="editor-shell-layout"
          data-canvas-zoom-pointer-memory="editor-shell-global-events"
          data-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
          data-component-panel-visible={isComponentPanelVisible ? 'true' : 'false'}
          data-inspector-panel-visible={isInspectorPanelVisible ? 'true' : 'false'}
          data-right-panel={rightPanel}
          data-editor-shell-responsive-mode={isCompactEditorShellViewport ? 'compact' : 'desktop'}
          data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
          data-compact-panel={compactEditorPanel || 'none'}
          data-compact-panels-auto-collapsed={areCompactEditorPanelsAutoCollapsed ? 'true' : 'false'}
          data-selected-id={selectedId || ''}
          data-selected-ids={selectedIds.join(',')}
          data-shell-keyshortcuts="components:B;inspector:I;layers:L;focus:F"
          onFocusCapture={rememberEditorShellZoomFocus}
          onMouseMoveCapture={rememberEditorShellZoomPointer}
          onPointerOverCapture={rememberEditorShellZoomPointer}
          onPointerMoveCapture={rememberEditorShellZoomPointer}
          onPointerOutCapture={clearEditorShellZoomPointer}
        >
          {/* Left Sidebar - Component Library */}
          {isCompactEditorPanelOverlayVisible && (
            <button
              type="button"
              className="absolute inset-0 z-30 cursor-default bg-slate-950/20"
              aria-label="Close compact editor panel"
              data-testid="editor-compact-panel-backdrop"
              onClick={() => setCompactEditorPanel(null)}
            />
          )}

          {isComponentPanelVisible && (
            <div
              className={cn(
                'flex h-full min-h-0',
                isCompactEditorShellViewport
                  ? 'absolute inset-y-0 left-0 z-40 w-[min(24rem,calc(100%-1rem))] max-w-full shadow-2xl'
                  : 'contents',
              )}
              data-testid="editor-component-panel-shell"
              data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
            >
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
            </div>
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
            data-canvas-wheel-zoom="enabled"
            data-preview-zoom={isPreview ? 'canvas-scoped' : undefined}
            data-preview-scale-basis={isPreview ? 'expanded-content-bounds' : undefined}
            data-preview-scale-width={isPreview ? renderedCanvasSize.width : undefined}
            data-preview-scale-height={isPreview ? renderedCanvasSize.height : undefined}
            data-preview-scroll-owner={isPreview ? 'editor-canvas-viewport' : undefined}
            data-preview-scale-model={isPreview ? 'fit-width-scroll-y' : undefined}
            data-canvas-zoom-listener-scope="window-visualviewport-document-root-body-shell-viewport-surface-capture"
            data-canvas-zoom-native-phase="layout-effect-capture"
            data-canvas-zoom-hit-test="viewport-shell-or-active-editor"
            data-canvas-zoom-page-guard="editor-active"
            data-canvas-zoom-anchor-fallback="viewport-center"
            data-canvas-zoom-global-fallback="active-editor-zero-coordinate-window-events"
            data-canvas-zoom-recent-pointer-fallback="editor-shell-global-events"
            data-canvas-zoom-legacy-wheel-fallback="mousewheel"
            data-canvas-zoom-outside-shell-guard="non-editor-coordinate-less-events-pass-through"
            data-canvas-touch-action="pan-x pan-y"
            data-wheel-zoom-modifier="meta-or-control"
            data-wheel-zoom-prevents-browser-zoom="true"
            data-canvas-pinch-zoom="enabled"
            data-pinch-zoom-prevents-browser-zoom="true"
            data-zoom-scope="canvas"
            data-keyboard-zoom-capture-targets="window-document-root-body-shell-viewport"
            data-canvas-zoom-min={CANVAS_ZOOM_MIN}
            data-canvas-zoom-max={CANVAS_ZOOM_MAX}
            data-pan-mode={isCanvasPanMode ? 'true' : 'false'}
            data-pan-active={isCanvasPanActive ? 'true' : 'false'}
            data-space-pan-active={isCanvasSpacePanning ? 'true' : 'false'}
            data-panning={isCanvasPanning ? 'true' : 'false'}
            data-library-drag-active={libraryDragItem ? 'true' : 'false'}
            data-library-drag-type={libraryDragItem?.type ?? undefined}
            data-library-drag-name={libraryDragItem?.name ?? undefined}
            style={{
              touchAction: 'pan-x pan-y',
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
            {!isPreview && (
              <div
                className="absolute left-4 top-4 z-30 flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-lg backdrop-blur"
                data-testid="editor-canvas-context-bar"
                data-breakpoint={breakpoint}
                data-canvas-width={size.width}
                data-canvas-height={size.height}
                data-zoom-percent={zoomPercent}
                data-selection-count={selectedIds.length}
                data-selected-id={selectedId || ''}
                data-selected-ids={selectedIds.join(',')}
                data-can-duplicate={canDuplicateSelected ? 'true' : 'false'}
                data-can-delete={canDeleteSelected ? 'true' : 'false'}
                data-can-z-order={canZOrderSelected ? 'true' : 'false'}
                data-can-align={canAlignSelected ? 'true' : 'false'}
                data-can-distribute={canDistributeSelected ? 'true' : 'false'}
                data-can-edit-text={canEditSelectedText ? 'true' : 'false'}
                data-selection-x={selectedGeometrySummary?.x ?? ''}
                data-selection-y={selectedGeometrySummary?.y ?? ''}
                data-selection-width={selectedGeometrySummary?.width ?? ''}
                data-selection-height={selectedGeometrySummary?.height ?? ''}
                data-component-panel-visible={isComponentPanelVisible ? 'true' : 'false'}
                data-inspector-panel-visible={isInspectorPanelVisible ? 'true' : 'false'}
                data-right-panel={rightPanel}
                data-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
                data-quick-add-count={CANVAS_CONTEXT_QUICK_ADD_ITEMS.length}
                data-quick-add-types={CANVAS_CONTEXT_QUICK_ADD_TYPES}
                data-action-status={editorContextActionStatus}
                aria-describedby={editorContextActionStatusId}
              >
                <span id={editorContextActionStatusId} className="sr-only" data-testid="editor-context-action-status">
                  {editorContextActionStatus}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold capitalize text-slate-900">
                    {breakpoint}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {size.width} x {size.height}px
                  </span>
                  <span className="rounded-md border border-slate-200 px-2 py-1 tabular-nums text-slate-600">
                    {zoomPercent}%
                  </span>
                  <span
                    className="max-w-[18rem] truncate rounded-md bg-slate-50 px-2 py-1 font-medium text-slate-700"
                    title={selectedElementLabel || 'No layer selected'}
                  >
                    {selectedIds.length > 1
                      ? `${selectedIds.length} layers selected`
                      : selectedElementLabel || 'No layer selected'}
                  </span>
                  {selectedGeometrySummary && (
                    <span
                      className="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[11px] tabular-nums text-slate-600"
                      data-testid="editor-context-geometry"
                      aria-label={`Selection geometry X ${selectedGeometrySummary.x}, Y ${selectedGeometrySummary.y}, width ${selectedGeometrySummary.width}, height ${selectedGeometrySummary.height}`}
                    >
                      <span>X {selectedGeometrySummary.x}</span>
                      <span>Y {selectedGeometrySummary.y}</span>
                      <span>W {selectedGeometrySummary.width}</span>
                      <span>H {selectedGeometrySummary.height}</span>
                    </span>
                  )}
                </div>

                <details
                  className="group relative"
                  data-testid="editor-context-quick-add-menu"
                  data-quick-add-count={CANVAS_CONTEXT_QUICK_ADD_ITEMS.length}
                  data-quick-add-types={CANVAS_CONTEXT_QUICK_ADD_TYPES}
                  data-disabled={isCanvasMutationDisabled ? 'true' : 'false'}
                  data-action-state={contextQuickAddActionState}
                  data-action-status={contextQuickAddActionStatus}
                  data-disabled-reason={isCanvasMutationDisabled ? contextQuickAddDisabledReason : undefined}
                >
                  <summary
                    className={cn(
                      'inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-ring [&::-webkit-details-marker]:hidden',
                      isCanvasMutationDisabled && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-slate-600',
                    )}
                    title="Add a component to the visible canvas"
                    aria-label="Add a component to the visible canvas"
                    aria-disabled={isCanvasMutationDisabled}
                    aria-describedby={editorContextActionStatusId}
                    data-action-state={contextQuickAddActionState}
                    data-action-status={contextQuickAddActionStatus}
                    data-disabled-reason={isCanvasMutationDisabled ? contextQuickAddDisabledReason : undefined}
                    onClick={(event) => {
                      if (isCanvasMutationDisabled) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add</span>
                  </summary>
                  <div className="absolute left-0 top-9 z-40 grid w-44 gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                    {CANVAS_CONTEXT_QUICK_ADD_ITEMS.map(({ key, item }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          handleAddLibraryItem(item);
                        }}
                        disabled={isCanvasMutationDisabled}
                        className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                        title={`Add ${item.name} to the canvas`}
                        aria-label={`Add ${item.name} to the canvas`}
                        data-testid={`editor-context-quick-add-${key}`}
                        data-quick-add-key={key}
                        data-quick-add-type={item.type}
                        data-quick-add-category={item.category ?? ''}
                        data-action-state={contextQuickAddActionState}
                        data-action-status={isCanvasMutationDisabled ? `Add ${item.name} unavailable: ${contextQuickAddDisabledReason}` : `Add ${item.name} available.`}
                        data-disabled-reason={isCanvasMutationDisabled ? contextQuickAddDisabledReason : undefined}
                        aria-describedby={editorContextActionStatusId}
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="shrink-0 text-[11px] font-normal capitalize text-slate-400">
                          {item.category ?? item.type}
                        </span>
                      </button>
                    ))}
                  </div>
                </details>

                <div
                  className="flex items-center gap-1 border-l border-slate-200 pl-2"
                  aria-label="Selected layer quick actions"
                  aria-describedby={editorContextActionStatusId}
                  data-testid="editor-context-selection-actions"
                  data-has-selection={selectedIds.length > 0 ? 'true' : 'false'}
                  data-action-status={editorContextActionStatus}
                >
                  <button
                    type="button"
                    onClick={handleEditSelectedText}
                    disabled={!canEditSelectedText}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                    title={canEditSelectedText ? `Edit text in ${selectedElementLabel || selectedLayerActionLabel}` : 'Select one unlocked visible text layer to edit text'}
                    aria-label={canEditSelectedText ? `Edit text in ${selectedElementLabel || selectedLayerActionLabel}` : 'Edit selected text'}
                    aria-describedby={editorContextActionStatusId}
                    data-testid="editor-context-edit-text"
                    data-command-id={contextEditTextCommand?.id}
                    data-action-state={editorCommandActionState(contextEditTextCommand)}
                    data-action-status={editorCommandStatusText(contextEditTextCommand)}
                    data-disabled-reason={editorCommandDisabledReason(contextEditTextCommand)}
                    data-action-enabled={canEditSelectedText ? 'true' : 'false'}
                    data-selected-text-type={selectedTextEditableType ?? ''}
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={isCanvasMutationDisabled || !canDuplicateSelected}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                    title={`Duplicate ${selectedLayerActionLabel} (Cmd/Ctrl+D)`}
                    aria-label={`Duplicate ${selectedLayerActionLabel}`}
                    aria-keyshortcuts="Control+D Meta+D"
                    aria-describedby={editorContextActionStatusId}
                    data-testid="editor-context-duplicate"
                    data-command-id={contextDuplicateCommand?.id}
                    data-action-state={editorCommandActionState(contextDuplicateCommand)}
                    data-action-status={editorCommandStatusText(contextDuplicateCommand)}
                    data-disabled-reason={editorCommandDisabledReason(contextDuplicateCommand)}
                    data-action-enabled={canDuplicateSelected ? 'true' : 'false'}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleZOrderChange('back')}
                    disabled={isCanvasMutationDisabled || !canZOrderSelected}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                    title="Send to back (Shift+Cmd/Ctrl+[)"
                    aria-label="Send to back"
                    aria-keyshortcuts="Shift+Control+[ Shift+Meta+["
                    aria-describedby={editorContextActionStatusId}
                    data-testid="editor-context-send-to-back"
                    data-command-id={contextSendToBackCommand?.id}
                    data-action-state={editorCommandActionState(contextSendToBackCommand)}
                    data-action-status={editorCommandStatusText(contextSendToBackCommand)}
                    data-disabled-reason={editorCommandDisabledReason(contextSendToBackCommand)}
                    data-action-enabled={canZOrderSelected ? 'true' : 'false'}
                  >
                    <SendToBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleZOrderChange('front')}
                    disabled={isCanvasMutationDisabled || !canZOrderSelected}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                    title="Bring to front (Shift+Cmd/Ctrl+])"
                    aria-label="Bring to front"
                    aria-keyshortcuts="Shift+Control+] Shift+Meta+]"
                    aria-describedby={editorContextActionStatusId}
                    data-testid="editor-context-bring-to-front"
                    data-command-id={contextBringToFrontCommand?.id}
                    data-action-state={editorCommandActionState(contextBringToFrontCommand)}
                    data-action-status={editorCommandStatusText(contextBringToFrontCommand)}
                    data-disabled-reason={editorCommandDisabledReason(contextBringToFrontCommand)}
                    data-action-enabled={canZOrderSelected ? 'true' : 'false'}
                  >
                    <BringToFront className="h-4 w-4" />
                  </button>
                  <details
                    className="group relative"
                    data-testid="editor-context-align-menu"
                    data-action-enabled={canAlignSelected ? 'true' : 'false'}
                    data-distribute-enabled={canDistributeSelected ? 'true' : 'false'}
                    data-action-status={editorContextActionStatus}
                    aria-describedby={editorContextActionStatusId}
                  >
                    <summary
                      className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-ring [&::-webkit-details-marker]:hidden"
                      title="Align or distribute selected layers"
                      aria-label="Align or distribute selected layers"
                      aria-describedby={editorContextActionStatusId}
                    >
                      <AlignHorizontalJustifyCenter className="h-4 w-4" />
                    </summary>
                    <div className="absolute left-0 top-9 z-40 grid w-40 grid-cols-4 gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                      {([
                        ['left', 'Align left', AlignHorizontalJustifyStart, canAlignSelected],
                        ['center', 'Align horizontal center', AlignHorizontalJustifyCenter, canAlignSelected],
                        ['right', 'Align right', AlignHorizontalJustifyEnd, canAlignSelected],
                        ['horizontal', 'Distribute horizontally', AlignHorizontalDistributeCenter, canDistributeSelected],
                        ['top', 'Align top', AlignVerticalJustifyStart, canAlignSelected],
                        ['middle', 'Align vertical center', AlignVerticalJustifyCenter, canAlignSelected],
                        ['bottom', 'Align bottom', AlignVerticalJustifyEnd, canAlignSelected],
                        ['vertical', 'Distribute vertically', AlignVerticalDistributeCenter, canDistributeSelected],
                      ] as const).map(([action, label, Icon, enabled]) => {
                        const commandId = action === 'horizontal' || action === 'vertical'
                          ? `distribute-${action}`
                          : `align-${action}`;
                        const command = editorCommandsById.get(commandId);

                        return (
                          <button
                            key={action}
                            type="button"
                            onClick={() => {
                              if (action === 'horizontal' || action === 'vertical') {
                                distributeSelectedElements(action);
                                return;
                              }
                              alignSelectedElement(action);
                            }}
                            disabled={isCanvasMutationDisabled || !enabled}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                            title={label}
                            aria-label={label}
                            aria-describedby={editorContextActionStatusId}
                            data-testid={`editor-context-${commandId}`}
                            data-command-id={command?.id}
                            data-action-state={editorCommandActionState(command)}
                            data-action-status={editorCommandStatusText(command)}
                            data-disabled-reason={editorCommandDisabledReason(command)}
                            data-action-enabled={enabled ? 'true' : 'false'}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </details>
                  <button
                    type="button"
                    onClick={deleteElement}
                    disabled={isCanvasMutationDisabled || !canDeleteSelected}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
                    title={`Delete ${selectedLayerActionLabel} (Delete/Backspace)`}
                    aria-label={`Delete ${selectedLayerActionLabel}`}
                    aria-keyshortcuts="Delete Backspace"
                    aria-describedby={editorContextActionStatusId}
                    data-testid="editor-context-delete"
                    data-command-id={contextDeleteCommand?.id}
                    data-action-state={editorCommandActionState(contextDeleteCommand)}
                    data-action-status={editorCommandStatusText(contextDeleteCommand)}
                    data-disabled-reason={editorCommandDisabledReason(contextDeleteCommand)}
                    data-action-enabled={canDeleteSelected ? 'true' : 'false'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleToggleComponentPanel}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium transition-colors',
                      isComponentPanelVisible
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                    )}
                    title={isCanvasFocusMode ? 'Show components and exit focus mode (B)' : 'Toggle components panel (B)'}
                    aria-label={isCanvasFocusMode ? 'Show components and exit focus mode' : 'Toggle components panel'}
                    aria-pressed={isComponentPanelVisible}
                    aria-keyshortcuts="B"
                    data-testid="editor-context-components"
                    data-panel-visible={isComponentPanelVisible ? 'true' : 'false'}
                    data-exits-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
                    data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
                  >
                    <PanelLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Components</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleLayersPanel}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium transition-colors',
                      rightPanel === 'layers' && isInspectorPanelVisible
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                    )}
                    title={isCanvasFocusMode ? 'Show layers and exit focus mode (L)' : 'Toggle layers panel (L)'}
                    aria-label={isCanvasFocusMode ? 'Show layers and exit focus mode' : 'Toggle layers panel'}
                    aria-pressed={rightPanel === 'layers' && isInspectorPanelVisible}
                    aria-keyshortcuts="L"
                    data-testid="editor-context-layers"
                    data-right-panel={rightPanel}
                    data-exits-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
                    data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
                  >
                    <Layers className="h-4 w-4" />
                    <span className="hidden sm:inline">Layers</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleInspectorPanel}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium transition-colors',
                      isInspectorPanelVisible
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                    )}
                    title={isCanvasFocusMode ? `Show inspector and exit focus mode: ${INSPECTOR_PANEL_PURPOSE} (I)` : `Toggle inspector panel: ${INSPECTOR_PANEL_PURPOSE} (I)`}
                    aria-label={isCanvasFocusMode ? `Show inspector and exit focus mode for ${INSPECTOR_PANEL_PURPOSE}` : `Toggle inspector panel for ${INSPECTOR_PANEL_PURPOSE}`}
                    aria-pressed={isInspectorPanelVisible}
                    aria-keyshortcuts="I"
                    data-testid="editor-context-inspector"
                    data-panel-visible={isInspectorPanelVisible ? 'true' : 'false'}
                    data-panel-purpose={INSPECTOR_PANEL_PURPOSE_KEY}
                    data-panel-purpose-label={INSPECTOR_PANEL_PURPOSE}
                    data-action-status={contextInspectorPanelActionStatus}
                    data-exits-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
                    data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
                  >
                    <PanelRight className="h-4 w-4" />
                    <span className="hidden sm:inline">Inspector</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleCanvasFocus}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium transition-colors',
                      isCanvasFocusMode
                        ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                    )}
                    title={isCanvasFocusMode ? 'Exit wide canvas focus (F)' : 'Enter wide canvas focus (F)'}
                    aria-label={isCanvasFocusMode ? 'Exit wide canvas focus' : 'Enter wide canvas focus'}
                    aria-pressed={isCanvasFocusMode}
                    aria-keyshortcuts="F"
                    data-testid="editor-context-focus"
                    data-focus-mode={isCanvasFocusMode ? 'true' : 'false'}
                  >
                    <Maximize2 className="h-4 w-4" />
                    <span className="hidden sm:inline">{isCanvasFocusMode ? 'Exit focus' : 'Focus'}</span>
                  </button>
                </div>
              </div>
            )}

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
                    ref={canvasScaleSurfaceRef}
                    className="overflow-visible shadow-[0_28px_70px_rgba(15,23,42,0.18)]"
                    data-testid="editor-canvas-scale-surface"
                    data-canvas-scale={activeCanvasScale}
                    data-canvas-zoom-surface="true"
                    data-canvas-zoom-surface-listener="native-capture"
                    data-preview-content-bounds="expanded"
                    data-preview-zoom="canvas-scoped"
                    data-preview-scroll-owner="editor-canvas-viewport"
                    data-preview-scale-basis="expanded-content-bounds"
                    data-preview-scale-model="fit-width-scroll-y"
                    data-preview-scale-width={renderedCanvasSize.width}
                    data-preview-scale-height={renderedCanvasSize.height}
                    style={{
                      ...editorThemeCssVariables,
                      width: renderedCanvasSize.width,
                      height: renderedCanvasSize.height,
                      transform: `scale(${activeCanvasScale})`,
                      transformOrigin: 'top left',
                      touchAction: 'pan-x pan-y',
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
                      size={renderedCanvasSize}
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
                      onMediaFilesDrop={handleCanvasMediaFilesDrop}
                      onExternalMediaUrlDrop={handleCanvasExternalMediaUrlDrop}
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
                        ref={canvasScaleSurfaceRef}
                        data-testid="editor-canvas-scale-surface"
                        data-canvas-scale={activeCanvasScale}
                        data-canvas-zoom-surface="true"
                        data-canvas-zoom-surface-listener="native-capture"
                        data-editor-content-bounds="expanded"
                        style={{
                          ...editorThemeCssVariables,
                          width: renderedCanvasSize.width,
                          height: renderedCanvasSize.height,
                          transform: `scale(${activeCanvasScale})`,
                          transformOrigin: 'top left',
                          touchAction: 'pan-x pan-y',
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
                          size={renderedCanvasSize}
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
                          onMediaFilesDrop={handleCanvasMediaFilesDrop}
                          onExternalMediaUrlDrop={handleCanvasExternalMediaUrlDrop}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isPreview && (
              <div
                className="pointer-events-none absolute bottom-4 left-4 z-30 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur"
                data-testid="editor-grid-snap-controls"
                data-overlay-hit-through="true"
                aria-describedby={editorGridSnapActionStatusId}
                data-snap-enabled={snapEnabled ? 'true' : 'false'}
                data-grid-visible={showGrid ? 'true' : 'false'}
                data-grid-size={gridSize}
                data-keyboard-nudge-step={snapEnabled ? safeEditorGridSize : 10}
                data-keyboard-nudge-policy="step-clamped"
                data-grid-keyshortcuts="toggle:G"
                data-snap-keyshortcuts="toggle:S"
                data-action-status={editorGridSnapActionStatus}
              >
                <span id={editorGridSnapActionStatusId} className="sr-only" data-testid="editor-grid-snap-action-status" aria-live="polite">
                  {editorGridSnapActionStatus}
                </span>
                <button
                  type="button"
                  onClick={handleToggleGridVisibility}
                  className={cn(
                    'pointer-events-auto flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
                    showGrid
                      ? 'bg-slate-100 text-slate-800 ring-1 ring-slate-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
                  )}
                  title={showGrid ? 'Hide grid (G)' : 'Show grid (G)'}
                  aria-label={showGrid ? 'Hide grid' : 'Show grid'}
                  aria-pressed={showGrid}
                  aria-keyshortcuts="G"
                  data-testid="editor-grid-visibility-toggle"
                  aria-describedby={editorGridSnapActionStatusId}
                  data-command-id={gridVisibilityCommand?.id}
                  data-action-state={gridVisibilityActionState}
                  data-action-status={editorCommandStatusText(gridVisibilityCommand)}
                  data-disabled-reason={editorCommandDisabledReason(gridVisibilityCommand)}
                >
                  {showGrid ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSnap}
                  className={cn(
                    'pointer-events-auto flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
                    snapEnabled
                      ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
                  )}
                  title={snapEnabled ? 'Disable snapping (S)' : 'Enable snapping (S)'}
                  aria-label={snapEnabled ? 'Disable snapping' : 'Enable snapping'}
                  aria-pressed={snapEnabled}
                  aria-keyshortcuts="S"
                  data-testid="editor-snap-toggle"
                  aria-describedby={editorGridSnapActionStatusId}
                  data-command-id={snapCommand?.id}
                  data-action-state={snapActionState}
                  data-action-status={editorCommandStatusText(snapCommand)}
                  data-disabled-reason={editorCommandDisabledReason(snapCommand)}
                >
                  <Magnet className="h-4 w-4" />
                  {snapEnabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                </button>
                <label
                  className="pointer-events-auto flex items-center gap-1.5"
                  title="Grid size"
                  aria-describedby={editorGridSnapActionStatusId}
                  data-action-state="ready"
                  data-action-status={gridSizeActionStatus}
                >
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
                    aria-describedby={editorGridSnapActionStatusId}
                    data-action-state="ready"
                    data-action-status={gridSizeActionStatus}
                  />
                </label>
              </div>
            )}

            {(
              <div
                className="pointer-events-none absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur"
                data-testid="editor-zoom-controls"
                data-overlay-hit-through="true"
                aria-describedby={editorZoomActionStatusId}
                data-auto-fit={isCanvasAutoFit ? 'true' : 'false'}
                data-canvas-scale={activeCanvasScale}
                data-preview-zoom={isPreview ? 'canvas-scoped' : undefined}
                data-preview-scale-basis={isPreview ? 'expanded-content-bounds' : undefined}
                data-zoom-percent={zoomPercent}
                data-pan-mode={isCanvasPanMode ? 'true' : 'false'}
                data-pan-active={isCanvasPanActive ? 'true' : 'false'}
                data-pan-keyshortcuts="toggle:H;temporary:Space"
                data-keyboard-zoom-scope="editor-window"
                data-keyboard-zoom-capture-targets="window-document-root-body-shell-viewport"
                data-zoom-keyshortcuts="zoom-in:Cmd/Ctrl+=;zoom-out:Cmd/Ctrl+-;fit:Cmd/Ctrl+0"
                data-action-status={editorZoomActionStatus}
              >
                <span id={editorZoomActionStatusId} className="sr-only" data-testid="editor-zoom-action-status" aria-live="polite">
                  {editorZoomActionStatus}
                </span>
                {!isPreview && (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleCanvasPanMode}
                      className={cn(
                        'pointer-events-auto rounded-md p-1.5 transition-colors',
                        isCanvasPanMode
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                      )}
                      title={isCanvasPanMode ? 'Disable pan navigation (H, hold Space)' : 'Enable pan navigation (H, hold Space)'}
                      aria-label={isCanvasPanMode ? 'Disable pan navigation' : 'Enable pan navigation'}
                      aria-pressed={isCanvasPanMode}
                      aria-keyshortcuts="H Space"
                      data-testid="editor-pan-toggle"
                      aria-describedby={editorZoomActionStatusId}
                      data-command-id={panCommand?.id}
                      data-action-state={panActionState}
                      data-action-status={editorCommandStatusText(panCommand)}
                      data-disabled-reason={editorCommandDisabledReason(panCommand)}
                    >
                      <Hand className="h-4 w-4" />
                    </button>
                    <div className="mx-1 h-5 w-px bg-slate-200" />
                  </>
                )}
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="pointer-events-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Zoom out (Cmd/Ctrl+-)"
                  aria-label="Zoom out"
                  aria-keyshortcuts="Control+- Meta+-"
                  data-testid="editor-zoom-out"
                  aria-describedby={editorZoomActionStatusId}
                  data-command-id={zoomOutCommand?.id}
                  data-action-state={editorCommandActionState(zoomOutCommand)}
                  data-action-status={editorCommandStatusText(zoomOutCommand)}
                  data-disabled-reason={editorCommandDisabledReason(zoomOutCommand)}
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
                <label className="pointer-events-auto hidden h-7 items-center sm:flex" title="Canvas zoom">
                  <span className="sr-only">Canvas zoom</span>
                  <input
                    type="range"
                    min={CANVAS_ZOOM_MIN * 100}
                    max={CANVAS_ZOOM_MAX * 100}
                    step={CANVAS_ZOOM_PERCENT_STEP}
                    value={zoomPercent}
                    onChange={(event) => handleCanvasZoomPercentChange(event.target.value)}
                    className="h-7 w-24 accent-sky-600"
                    aria-label="Canvas zoom"
                    data-testid="editor-zoom-slider"
                    data-zoom-min={CANVAS_ZOOM_MIN * 100}
                    data-zoom-max={CANVAS_ZOOM_MAX * 100}
                    data-zoom-step={CANVAS_ZOOM_PERCENT_STEP}
                    aria-describedby={editorZoomActionStatusId}
                    data-action-state="ready"
                    data-action-status={zoomSliderActionStatus}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="pointer-events-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Zoom in (Cmd/Ctrl+=)"
                  aria-label="Zoom in"
                  aria-keyshortcuts="Control+= Meta+="
                  data-testid="editor-zoom-in"
                  aria-describedby={editorZoomActionStatusId}
                  data-command-id={zoomInCommand?.id}
                  data-action-state={editorCommandActionState(zoomInCommand)}
                  data-action-status={editorCommandStatusText(zoomInCommand)}
                  data-disabled-reason={editorCommandDisabledReason(zoomInCommand)}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={handleFitCanvas}
                  className="pointer-events-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Fit canvas (Cmd/Ctrl+0)"
                  aria-label="Fit canvas"
                  aria-keyshortcuts="Control+0 Meta+0"
                  data-testid="editor-zoom-fit"
                  aria-describedby={editorZoomActionStatusId}
                  data-command-id={zoomFitCommand?.id}
                  data-action-state={editorCommandActionState(zoomFitCommand)}
                  data-action-status={editorCommandStatusText(zoomFitCommand)}
                  data-disabled-reason={editorCommandDisabledReason(zoomFitCommand)}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Right Sidebar - Inspector */}
          {isInspectorPanelVisible && (
            <aside
              className={cn(
                'flex h-full min-h-0 flex-col border-l border-slate-200 bg-white',
                isCompactEditorShellViewport
                  ? 'absolute inset-y-0 right-0 z-40 w-[min(24rem,calc(100%-1rem))] min-w-0 max-w-full shrink-0 shadow-2xl'
                  : 'w-[clamp(18rem,20vw,24rem)] min-w-[18rem] max-w-[24rem] shrink-0',
              )}
              data-testid="editor-inspector"
              aria-label={`Inspector panel: ${INSPECTOR_PANEL_PURPOSE}`}
              aria-describedby={editorInspectorActionStatusId}
              data-panel-purpose={INSPECTOR_PANEL_PURPOSE_KEY}
              data-panel-purpose-label={INSPECTOR_PANEL_PURPOSE}
              data-action-status={editorInspectorActionStatus}
              data-responsive-panel-mode={isCompactEditorShellViewport ? 'overlay' : 'docked'}
            >
              <div className="border-b border-slate-200 p-3">
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setRightPanel('properties')}
                    data-testid="editor-tab-properties"
                    title="Properties: edit selected-layer content, layout, style, data, and advanced controls"
                    aria-label="Properties: edit selected-layer content, layout, style, data, and advanced controls"
                    data-panel-purpose="selected-layer-properties"
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
                    title="Layers: select, reorder, hide, lock, and inspect root or nested layers"
                    aria-label="Layers: select, reorder, hide, lock, and inspect root or nested layers"
                    data-panel-purpose="layer-tree-navigation"
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

                <details
                  className="group mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-sm"
                  data-testid="editor-composition-readiness"
                  data-default-collapsed="true"
                  data-composition-schema={editorCompositionReadiness.schemaVersion}
                  data-action-plan-schema={editorCompositionReadiness.actionPlan.schemaVersion}
                  data-agent-handoff-schema={editorCompositionReadiness.agentHandoff.schemaVersion}
                  data-agent-handoff-source={editorCompositionReadiness.agentHandoff.source}
                  data-agent-handoff-doc={CUSTOM_FRONTEND_AGENT_HANDOFF_DOC}
                  data-agent-handoff-direct={editorCompositionReadiness.agentHandoff.endpoints.agentHandoff}
                  data-agent-handoff-manifest={editorCompositionReadiness.agentHandoff.endpoints.manifest}
                  data-agent-handoff-openapi={editorCompositionReadiness.agentHandoff.endpoints.openapi}
                  data-agent-handoff-render={editorCompositionReadiness.agentHandoff.endpoints.render}
                  data-agent-handoff-frontend-design={editorCompositionReadiness.agentHandoff.endpoints.frontendDesign}
                  data-agent-handoff-frontend-design-management={editorCompositionReadiness.agentHandoff.endpoints.frontendDesignManagement}
                  data-agent-handoff-sdk={editorCompositionReadiness.agentHandoff.sdk.package}
                  data-agent-handoff-read-start={editorCompositionReadiness.agentHandoff.editorSurface.agentReadStart}
                  data-agent-handoff-manifest-read-start={editorCompositionReadiness.agentHandoff.editorSurface.manifestReadStart}
                  data-agent-handoff-openapi-read-start={editorCompositionReadiness.agentHandoff.editorSurface.openApiReadStart}
                  data-agent-handoff-editor-surface-schema={editorCompositionReadiness.agentHandoff.editorSurface.schemaVersion}
                  data-agent-handoff-read-order={editorCompositionReadiness.agentHandoff.readOrder.map((step) => step.step).join(',')}
                  data-agent-handoff-route-reveal={editorCompositionReadiness.agentHandoff.contentCreation.canvasFirst.routeRevealGuarantee}
                  data-agent-handoff-canvas-outcome={editorCompositionReadiness.agentHandoff.contentCreation.canvasFirst.editorOutcome}
                  data-agent-handoff-site-style-sources={editorCompositionReadiness.agentHandoff.designState.siteStyleSources.join(',')}
                  data-agent-handoff-round-trip-fields={editorCompositionReadiness.agentHandoff.designState.roundTripFields.join(',')}
                  data-agent-handoff-page-canvas-entry={editorCompositionReadiness.agentHandoff.contentCreation.adminEntryPoints.pageBackyCanvas}
                  data-agent-handoff-page-custom-entry={editorCompositionReadiness.agentHandoff.contentCreation.adminEntryPoints.pageCustomFrontend}
                  data-agent-handoff-blog-canvas-entry={editorCompositionReadiness.agentHandoff.contentCreation.adminEntryPoints.blogBackyCanvas}
                  data-agent-handoff-blog-custom-entry={editorCompositionReadiness.agentHandoff.contentCreation.adminEntryPoints.blogCustomFrontend}
                  data-command-registry-schema={editorCompositionReadiness.commandRegistry.schemaVersion}
                  data-command-count={editorCompositionReadiness.commandRegistry.summary.totalCommandCount}
                  data-command-ready-count={editorCompositionReadiness.commandRegistry.summary.readyCommandCount}
                  data-command-disabled-count={editorCompositionReadiness.commandRegistry.summary.disabledCommandCount}
                  data-command-hidden-count={editorCompositionReadiness.commandRegistry.summary.hiddenCommandCount}
                  data-total-layers={editorCompositionReadiness.metrics.totalLayers}
                  data-group-layers={editorCompositionReadiness.metrics.groupLayers}
                  data-nested-layers={editorCompositionReadiness.metrics.nestedLayers}
                  data-animated-layers={editorCompositionReadiness.metrics.animatedLayers}
                  data-data-bound-layers={editorCompositionReadiness.metrics.dataBoundLayers}
                  data-asset-bound-layers={editorCompositionReadiness.metrics.assetBoundLayers}
                  data-interactive-layers={editorCompositionReadiness.metrics.interactiveLayers}
                  data-design-state-layers={editorCompositionReadiness.metrics.designStateLayerCount}
                  data-selected-layers={editorCompositionReadiness.selection.selectedLayerCount}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-slate-300 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-950">
                        <Group className="h-3.5 w-3.5 text-slate-500" />
                        Composition handoff
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-slate-500">
                        {editorCompositionReadiness.readyCount}/{editorCompositionReadiness.checkCount} ready · {editorCompositionReadiness.commandRegistry.summary.readyCommandCount} commands ready
                      </div>
                    </div>
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 group-open:hidden">
                      Details
                    </span>
                    <span className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 group-open:inline-flex">
                      Hide
                    </span>
                  </summary>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">Advanced export contract</div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-500">
                          Composition metrics, command metadata, and custom frontend agent API handoff.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyEditorCompositionPlan()}
                        title="Copy editor composition action plan"
                        aria-label="Copy editor composition action plan"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        data-testid="editor-copy-composition-plan"
                      >
                        <Copy className="h-3 w-3" />
                        Copy plan
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="editor-composition-metrics">
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.totalLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Layers</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.groupLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Groups</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.nestedLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Nested</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.responsiveOverrideLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Breakpoints</div>
                      </div>
                    </div>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5" data-testid="editor-composition-design-state-metrics">
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.animatedLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Motion</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.dataBoundLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Data</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.assetBoundLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Assets</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <div className="font-semibold text-slate-950">{editorCompositionReadiness.metrics.interactiveLayers}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Interactive</div>
	                    </div>
	                  </div>
                    <div
                      className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"
                      data-testid="editor-agent-handoff-brief"
                      data-agent-handoff-schema={editorCompositionReadiness.agentHandoff.schemaVersion}
                      data-agent-handoff-source={editorCompositionReadiness.agentHandoff.source}
                      data-agent-read-start={editorCompositionReadiness.agentHandoff.editorSurface.agentReadStart}
                      data-agent-api-alignment-schema={editorCompositionReadiness.agentHandoff.apiAlignment.schemaVersion}
                      data-agent-component-contract-schema={editorCompositionReadiness.agentHandoff.componentApiContract.schemaVersion}
                      data-agent-component-contract-pointer="componentApiContract.componentTypeContracts"
                      data-manifest-read-start={editorCompositionReadiness.agentHandoff.editorSurface.manifestReadStart}
                      data-openapi-read-start={editorCompositionReadiness.agentHandoff.editorSurface.openApiReadStart}
                      data-read-order={editorCompositionReadiness.agentHandoff.readOrder.map((step) => step.step).join(',')}
                      data-canvas-first-value={editorCompositionReadiness.agentHandoff.contentCreation.canvasFirst.backyCanvasValue}
                      data-custom-frontend-value={editorCompositionReadiness.agentHandoff.contentCreation.canvasFirst.customFrontendValue}
                      data-agent-preserve-fields={editorCompositionReadiness.agentHandoff.apiAlignment.preserveFields.join(',')}
                      data-agent-no-local-forks={editorCompositionReadiness.agentHandoff.apiAlignment.writeBoundary.noFrontendLocalJsonForks ? 'true' : 'false'}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-950">Agent handoff</div>
                          <div className="mt-1 text-[11px] leading-4 text-slate-500">
                            {editorCompositionReadiness.agentHandoff.readOrder.map((step) => step.step).join(' -> ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyEditorAgentHandoff()}
                          title="Copy custom frontend agent handoff"
                          aria-label="Copy custom frontend agent handoff"
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          data-testid="editor-copy-agent-handoff"
                          data-agent-read-start={editorCompositionReadiness.agentHandoff.editorSurface.agentReadStart}
                          data-api-alignment-schema={editorCompositionReadiness.agentHandoff.apiAlignment.schemaVersion}
                          data-action-state="ready"
                          data-action-status="Copy custom frontend agent handoff available."
                        >
                          <Copy className="h-3 w-3" />
                          Copy handoff
                        </button>
                      </div>
                      <code
                        className="mt-2 block break-all rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] leading-4 text-slate-600"
                        data-testid="editor-agent-handoff-direct-endpoint"
                      >
                        {editorCompositionReadiness.agentHandoff.editorSurface.agentReadStart}
                      </code>
                      <div className="mt-1 text-[11px] leading-4 text-slate-600">
                        {editorCompositionReadiness.agentHandoff.contentCreation.canvasFirst.editorOutcome}
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-slate-600" data-testid="editor-agent-component-contract">
                        Component properties: {editorCompositionReadiness.agentHandoff.componentApiContract.schemaVersion} · componentTypeContracts
                      </div>
                    </div>
	                  <div
	                    className="mt-2 border-t border-slate-200 pt-2"
	                    data-testid="editor-command-registry"
	                    data-command-schema={editorCompositionReadiness.commandRegistry.schemaVersion}
	                    data-command-count={editorCompositionReadiness.commandRegistry.summary.totalCommandCount}
	                    data-ready-count={editorCompositionReadiness.commandRegistry.summary.readyCommandCount}
	                    data-disabled-count={editorCompositionReadiness.commandRegistry.summary.disabledCommandCount}
	                    data-hidden-count={editorCompositionReadiness.commandRegistry.summary.hiddenCommandCount}
	                    data-command-ids={editorCompositionReadiness.commandRegistry.commands.map((command) => command.id).join(' ')}
	                  >
	                    <div className="flex items-start justify-between gap-2">
	                      <div className="min-w-0">
	                        <div className="font-semibold text-slate-950">Command registry</div>
	                        <div className="mt-0.5 text-[11px] leading-4 text-slate-500">
	                          {editorCompositionReadiness.commandRegistry.summary.readyCommandCount}/{editorCompositionReadiness.commandRegistry.summary.totalCommandCount} ready,
	                          {' '}
	                          {editorCompositionReadiness.commandRegistry.summary.hiddenCommandCount} hidden
	                        </div>
	                      </div>
	                      <button
	                        type="button"
	                        onClick={() => void copyEditorCommandRegistry()}
	                        title="Copy editor command registry"
	                        aria-label="Copy editor command registry"
	                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
	                        data-testid="editor-copy-command-registry"
	                      >
	                        <Copy className="h-3 w-3" />
	                        Copy commands
	                      </button>
	                    </div>
	                    <div className="mt-2 flex flex-wrap gap-1" data-testid="editor-command-registry-categories">
	                      {editorCompositionReadiness.commandRegistry.summary.categories.map((category) => (
	                        <span
	                          key={category.category}
	                          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
	                          data-command-category={category.category}
	                          data-command-category-ready={category.ready}
	                          data-command-category-total={category.total}
	                        >
	                          {category.category.replace('-', ' ')} {category.ready}/{category.total}
	                        </span>
	                      ))}
	                    </div>
	                  </div>
                  </div>
                </details>

                <div
                  className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  data-testid={selectedIds.length > 1 ? 'editor-inspector-multi-selection' : selectedElement ? 'editor-inspector-selection' : 'editor-inspector-empty'}
                  data-visible-layer-count={visibleCanvasElementIds.length}
                  data-total-layer-count={totalCanvasElementCount}
                  data-selected-layer-count={selectedIds.length}
                  data-selection-scope-state={selectedSelectionScopeState}
                  data-selection-parent-scope={selectedParentScopeLabel}
                  data-selection-parent-scope-count={selectedParentScopeCount}
                  data-selection-scope-reason={selectionScopeReason}
                  data-action-status={editorInspectorActionStatus}
                  aria-describedby={editorInspectorActionStatusId}
                  data-empty-quick-add-types={!selectedElement && selectedIds.length <= 1 ? INSPECTOR_EMPTY_QUICK_ADD_TYPES : undefined}
                >
                  <span id={editorInspectorActionStatusId} className="sr-only" data-testid="editor-inspector-action-status" aria-live="polite">
                    {editorInspectorActionStatus}
                  </span>
                  {selectedIds.length > 1 ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">
                            {selectedIds.length} layers selected
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {selectedSelectionScopeLabel}
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
                            {...editorInspectorCommandProps('select-sibling-layers')}
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
                            {...editorInspectorCommandProps('select-parent-layer')}
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
                            {...editorInspectorCommandProps('group-selection')}
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
                            {...editorInspectorCommandProps('ungroup-selection')}
                          >
                            <Ungroup className="h-3.5 w-3.5" />
                            Ungroup
                          </button>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'mt-3 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-4',
                          selectedSelectionScopeState === 'sibling-scope'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800',
                        )}
                        data-testid="editor-inspector-selection-scope-status"
                        data-selection-scope-state={selectedSelectionScopeState}
                        data-selection-parent-scope={selectedParentScopeLabel}
                        data-selection-parent-scope-count={selectedParentScopeCount}
                        data-selection-scope-reason={selectionScopeReason}
                      >
                        <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{selectionScopeReason}</span>
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
                          {...editorInspectorCommandProps('copy-selection')}
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
                          {...editorInspectorCommandProps('duplicate-selection')}
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
                          {...editorInspectorCommandProps('cut-selection')}
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
                          {...editorInspectorCommandProps('paste-selection')}
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
                          {...editorInspectorCommandProps('delete-selection')}
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
                          {...editorInspectorCommandProps('toggle-selection-visibility')}
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
                          {...editorInspectorCommandProps('toggle-selection-lock')}
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
                          {...editorInspectorCommandProps('send-to-back')}
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
                          {...editorInspectorCommandProps('send-backward')}
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
                          {...editorInspectorCommandProps('bring-forward')}
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
                          {...editorInspectorCommandProps('bring-to-front')}
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
                          {...editorInspectorCommandProps('align-left')}
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
                          {...editorInspectorCommandProps('align-center')}
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
                          {...editorInspectorCommandProps('align-right')}
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
                          {...editorInspectorCommandProps('align-top')}
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
                          {...editorInspectorCommandProps('align-middle')}
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
                          {...editorInspectorCommandProps('align-bottom')}
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
                          {...editorInspectorCommandProps('distribute-horizontal')}
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
                          {...editorInspectorCommandProps('distribute-vertical')}
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
                          {isLayerLocked(selectedElement) && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                              Locked
                            </span>
                          )}
                          {isLayerHidden(selectedElement) && (
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
                          disabled={isCanvasMutationDisabled || isLayerLocked(selectedElement)}
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
                          {...editorInspectorCommandProps('copy-selection')}
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
                          {...editorInspectorCommandProps('duplicate-selection')}
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
                          {...editorInspectorCommandProps('cut-selection')}
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
                          {...editorInspectorCommandProps('paste-selection')}
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
                          {...editorInspectorCommandProps('delete-selection')}
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
                          {...editorInspectorCommandProps('toggle-selection-visibility')}
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
                          {...editorInspectorCommandProps('toggle-selection-lock')}
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
                          {...editorInspectorCommandProps('send-to-back')}
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
                          {...editorInspectorCommandProps('send-backward')}
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
                          {...editorInspectorCommandProps('bring-forward')}
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
                          {...editorInspectorCommandProps('bring-to-front')}
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
                          {...editorInspectorCommandProps('select-parent-layer')}
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
                        {...editorInspectorCommandProps('select-sibling-layers')}
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
                          {...editorInspectorCommandProps('select-child-layer')}
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
                          {...editorInspectorCommandProps('select-child-layers')}
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
                          {...editorInspectorCommandProps('ungroup-selection')}
                        >
                          <Ungroup className="h-3.5 w-3.5" />
                          Ungroup
                        </button>
                      )}
                      {selectedReusableSectionMeta && (
                        <div
                          className="mt-2 rounded-md border border-violet-100 bg-violet-50 px-2.5 py-2 text-[11px] leading-4 text-violet-800"
                          data-testid="editor-reusable-instance"
                          aria-describedby={reusableInstanceActionStatusId}
                          data-action-state={reusableInstanceRefreshDisabledReason || reusableInstanceDetachDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={reusableInstanceActionStatus}
                          data-reusable-instance-section-id={selectedReusableSectionMeta.sectionId}
                          data-reusable-instance-source-state={selectedReusableSectionSource ? 'linked' : 'missing'}
                        >
                          <span id={reusableInstanceActionStatusId} className="sr-only" data-testid="editor-reusable-instance-action-status" aria-live="polite">
                            {reusableInstanceActionStatus}
                          </span>
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
                              disabled={isCanvasMutationDisabled || !selectedReusableSectionSource || isLayerLocked(selectedElement)}
                              className="inline-flex items-center justify-center gap-1 rounded border border-violet-200 bg-white px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="editor-refresh-reusable-instance"
                              aria-describedby={reusableInstanceActionStatusId}
                              data-action-state={reusableInstanceRefreshDisabledReason ? 'blocked' : 'ready'}
                              data-action-status={reusableInstanceActionStatus}
                              data-disabled-reason={reusableInstanceRefreshDisabledReason || undefined}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Refresh
                            </button>
                            <button
                              type="button"
                              onClick={handleDetachSelectedReusableSection}
                              disabled={isCanvasMutationDisabled || isLayerLocked(selectedElement)}
                              className="inline-flex items-center justify-center gap-1 rounded border border-violet-200 bg-white px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="editor-detach-reusable-instance"
                              aria-describedby={reusableInstanceActionStatusId}
                              data-action-state={reusableInstanceDetachDisabledReason ? 'blocked' : 'ready'}
                              data-action-status={reusableInstanceActionStatus}
                              data-disabled-reason={reusableInstanceDetachDisabledReason || undefined}
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
                          aria-describedby={breakpointOverrideActionStatusId}
                          data-action-state={breakpointOverrideResetAllDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={breakpointOverrideActionStatus}
                          data-breakpoint-override-active-groups={selectedBreakpointOverrideGroups.join(',')}
                        >
                          <span id={breakpointOverrideActionStatusId} className="sr-only" data-testid="editor-breakpoint-override-action-status" aria-live="polite">
                            {breakpointOverrideActionStatus}
                          </span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold capitalize">{breakpoint} override</span>
                            <button
                              type="button"
                              onClick={handleClearSelectedBreakpointOverride}
                              disabled={isCanvasMutationDisabled || !selectedElementHasBreakpointOverride}
                              className="rounded border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="editor-breakpoint-reset-all"
                              aria-describedby={breakpointOverrideActionStatusId}
                              data-action-state={breakpointOverrideResetAllDisabledReason ? 'blocked' : 'ready'}
                              data-action-status={breakpointOverrideActionStatus}
                              data-disabled-reason={breakpointOverrideResetAllDisabledReason || undefined}
                            >
                              Reset all
                            </button>
                          </div>
                          <div
                            className="mt-2 rounded border border-sky-200 bg-white px-2 py-1.5"
                            data-testid="editor-inspector-responsive-next-action"
                            data-responsive-next-action-schema={editorResponsiveNextAction.schemaVersion}
                            data-responsive-next-action-id={editorResponsiveNextAction.id}
                            data-responsive-next-action-breakpoint={editorResponsiveNextAction.breakpoint}
                            data-responsive-next-action-state={editorResponsiveNextAction.actionState}
                            data-responsive-next-action-target={editorResponsiveNextAction.target}
                            data-responsive-next-action-surface={editorResponsiveNextAction.actionSurface}
                            data-responsive-next-action-selected-layer-id={editorResponsiveNextAction.selectedLayerId || ''}
                            data-responsive-next-action-override-groups={editorResponsiveNextAction.overrideGroups.join(',')}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-sky-900">Next: {editorResponsiveNextAction.label}</div>
                                <p className="mt-0.5 text-sky-700">{editorResponsiveNextAction.detail}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void copyEditorResponsiveNextAction()}
                                className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 font-semibold text-sky-700 hover:bg-sky-100"
                                title="Copy responsive next action"
                                aria-label="Copy responsive next action"
                                data-testid="editor-inspector-copy-responsive-next-action"
                                data-copy-schema={editorResponsiveNextAction.schemaVersion}
                              >
                                <Copy className="h-3 w-3" />
                                Copy
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1" data-testid="editor-breakpoint-override-groups">
                            {BREAKPOINT_OVERRIDE_GROUPS.map((group) => {
                              const isActive = selectedBreakpointOverrideGroups.includes(group.id);
                              const groupDisabledReason = breakpointOverrideMutationDisabledReason
                                || (!isActive ? `${group.description} inherits desktop.` : '');
                              const groupActionStatus = groupDisabledReason
                                ? `Reset ${group.label.toLowerCase()} unavailable: ${groupDisabledReason}`
                                : `Reset ${group.label.toLowerCase()} override available.`;
                              return (
                                <button
                                  key={group.id}
                                  type="button"
                                  onClick={() => handleClearSelectedBreakpointOverrideGroup(group.id)}
                                  disabled={isCanvasMutationDisabled || !isActive}
                                  data-testid={`editor-breakpoint-reset-${group.id}`}
                                  aria-describedby={breakpointOverrideActionStatusId}
                                  data-breakpoint-override-group={group.id}
                                  data-breakpoint-override-active={isActive ? 'true' : 'false'}
                                  data-action-state={groupDisabledReason ? 'blocked' : 'ready'}
                                  data-action-status={groupActionStatus}
                                  data-disabled-reason={groupDisabledReason || undefined}
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
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">No layer selected</div>
                          <div className="mt-0.5 text-xs leading-4 text-slate-500">
                            Select a layer, open Layers, or add a starting block from here.
                          </div>
                        </div>
                        <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold tabular-nums text-slate-600">
                          {visibleCanvasElementIds.length}/{totalCanvasElementCount} visible
                        </span>
                      </div>
                      {breakpoint !== 'desktop' && (
                        <div
                          className="rounded-md border border-sky-100 bg-sky-50 px-2.5 py-2 text-[11px] leading-4 text-sky-800"
                          data-testid="editor-empty-responsive-next-action"
                          data-responsive-next-action-schema={editorResponsiveNextAction.schemaVersion}
                          data-responsive-next-action-id={editorResponsiveNextAction.id}
                          data-responsive-next-action-breakpoint={editorResponsiveNextAction.breakpoint}
                          data-responsive-next-action-state={editorResponsiveNextAction.actionState}
                          data-responsive-next-action-target={editorResponsiveNextAction.target}
                          data-responsive-next-action-surface={editorResponsiveNextAction.actionSurface}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-sky-900">Next: {editorResponsiveNextAction.label}</div>
                              <p className="mt-0.5 text-sky-700">{editorResponsiveNextAction.detail}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyEditorResponsiveNextAction()}
                              className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700 hover:bg-sky-100"
                              title="Copy responsive next action"
                              aria-label="Copy responsive next action"
                              data-testid="editor-empty-copy-responsive-next-action"
                              data-copy-schema={editorResponsiveNextAction.schemaVersion}
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                          </div>
                        </div>
                      )}
                      <div
                        className="grid grid-cols-2 gap-1.5"
                        data-testid="editor-inspector-empty-actions"
                        data-empty-quick-add-count={INSPECTOR_EMPTY_QUICK_ADD_ITEMS.length}
                        data-empty-quick-add-types={INSPECTOR_EMPTY_QUICK_ADD_TYPES}
                      >
                        <button
                          type="button"
                          onClick={handleSelectFirstVisibleLayer}
                          disabled={visibleCanvasElementIds.length === 0}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={visibleCanvasElementIds.length > 0 ? 'Select the first visible layer' : 'Add a layer before selecting'}
                          aria-label="Select first visible layer"
                          data-testid="editor-inspector-empty-select-first-layer"
                          data-visible-layer-count={visibleCanvasElementIds.length}
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                          Select first
                        </button>
                        <button
                          type="button"
                          onClick={() => setRightPanel('layers')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                          title="Open the layer tree"
                          aria-label="Open Layers panel"
                          data-testid="editor-inspector-empty-open-layers"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Layers
                        </button>
                        {INSPECTOR_EMPTY_QUICK_ADD_ITEMS.map(({ key, item }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleAddLibraryItem(item)}
                            disabled={isCanvasMutationDisabled}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title={`Add ${item.name} to the canvas`}
                            aria-label={`Add ${item.name} to the canvas`}
                            data-testid={`editor-inspector-empty-add-${key}`}
                            data-empty-add-key={key}
                            data-empty-add-type={item.type}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {rightPanel === 'layers' ? (
                  <LayersPanel
                    elements={displayedElements}
                    selectedIds={selectedIds}
                    currentBreakpoint={breakpoint}
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
                ) : selectedElement ? (
                  <PropertyPanel
                    element={selectedElement}
                    onChange={handleElementUpdate}
                    onDelete={deleteElement}
                    theme={theme}
                    mediaContext={mediaContext}
                    disabled={isCanvasMutationDisabled || isLayerLocked(selectedElement)}
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
                ) : null}
              </div>
            </aside>
          )}
        </div>

        {editorNotice && (
          <div
            className="fixed left-1/2 top-4 z-[95] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-xl"
            data-testid="editor-notice"
          >
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
            aria-describedby={reusableSectionDraftActionStatusId}
            data-testid="editor-reusable-section-dialog"
            data-reusable-section-dialog-mode={reusableSectionDraft.mode}
            data-action-state={isSavingReusableSection ? 'busy' : reusableSectionDraftNameInlineError ? 'blocked' : 'ready'}
            data-action-status={reusableSectionDraftActionStatus}
          >
            <span id={reusableSectionDraftActionStatusId} className="sr-only" data-testid="editor-reusable-section-action-status" aria-live="polite">
              {reusableSectionDraftActionStatus}
            </span>
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
                  id="reusable-section-draft-name-input"
                  data-testid="editor-reusable-section-name-input"
                  type="text"
                  value={reusableSectionDraft.name}
                  onChange={(event) => setReusableSectionDraft((current) => current ? {
                    ...current,
                    name: event.target.value,
                  } : current)}
                  aria-invalid={Boolean(reusableSectionDraftNameInlineError)}
                  aria-describedby={[
                    reusableSectionDraftActionStatusId,
                    reusableSectionDraftNameInlineError ? 'editor-reusable-section-name-error' : '',
                  ].filter(Boolean).join(' ')}
                  data-action-state={reusableSectionDraftNameInlineError ? 'blocked' : 'ready'}
                  data-action-status={reusableSectionDraftActionStatus}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-sky-400"
                  autoFocus
                />
                {reusableSectionDraftNameInlineError && (
                  <p id="editor-reusable-section-name-error" data-testid="editor-reusable-section-name-error" className="text-xs text-red-600" role="alert">
                    {reusableSectionDraftNameInlineError}
                  </p>
                )}
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  data-testid="editor-reusable-section-cancel"
                  aria-describedby={reusableSectionDraftActionStatusId}
                  data-action-state="ready"
                  data-action-status={reusableSectionDraftActionStatus}
                  onClick={() => {
                    setReusableSectionDraftSubmitted(false);
                    setReusableSectionDraft(null);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="editor-reusable-section-save"
                  disabled={isSavingReusableSection}
                  aria-describedby={reusableSectionDraftActionStatusId}
                  data-action-state={isSavingReusableSection ? 'busy' : reusableSectionDraftNameInlineError ? 'blocked' : 'ready'}
                  data-action-status={reusableSectionDraftActionStatus}
                  data-disabled-reason={isSavingReusableSection ? 'Reusable section save is running.' : undefined}
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
            aria-describedby={pendingDeleteReusableSectionStatusId}
            data-testid="editor-reusable-section-delete-dialog"
            data-reusable-section-delete-id={pendingDeleteReusableSection.id}
            data-action-state={isDeletingReusableSection ? 'busy' : 'ready'}
            data-action-status={pendingDeleteReusableSectionStatus}
          >
            <span id={pendingDeleteReusableSectionStatusId} className="sr-only" data-testid="editor-reusable-section-delete-status" aria-live="polite">
              {pendingDeleteReusableSectionStatus}
            </span>
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
                  data-testid="editor-reusable-section-delete-cancel"
                  aria-describedby={pendingDeleteReusableSectionStatusId}
                  data-action-state="ready"
                  data-action-status={pendingDeleteReusableSectionStatus}
                  onClick={() => setPendingDeleteReusableSection(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="editor-reusable-section-delete-confirm"
                  disabled={isDeletingReusableSection}
                  aria-describedby={pendingDeleteReusableSectionStatusId}
                  data-action-state={isDeletingReusableSection ? 'busy' : 'ready'}
                  data-action-status={pendingDeleteReusableSectionStatus}
                  data-disabled-reason={isDeletingReusableSection ? 'Reusable section delete is running.' : undefined}
                  onClick={() => void confirmDeleteReusableSection(pendingDeleteReusableSection.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {isDeletingReusableSection ? 'Deleting...' : 'Delete section'}
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
