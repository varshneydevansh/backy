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
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeft,
  CheckSquare,
  ClipboardPaste,
  Copy,
  Save,
  Eye,
  Group,
  Layers,
  SlidersHorizontal,
  Scissors,
  Monitor,
  PanelLeft,
  PanelRight,
  Tablet,
  Smartphone,
  RefreshCw,
  Trash2,
  Undo,
  Redo,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Ungroup,
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
} from '@/types/editor';
import { useStore } from '@/stores/mockStore';
import { listMedia } from '@/lib/mediaApi';
import {
  createReusableSection,
  deleteReusableSection,
  listReusableSections,
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
  'list',
  'link',
  'quote',
  'comment',
];

type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

const RULER_SIZE = 28;
const RULER_MAJOR_STEP = 100;
const RULER_MINOR_STEP = 50;
const MIN_CANVAS_DIMENSION = 320;
const MAX_CANVAS_DIMENSION = 3840;

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
  mode?: 'page' | 'blog';
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
  initialSize?: CanvasSize;
  mediaContext?: MediaContext;
  onChange?: (
    elements: CanvasElement[],
    settings: PageSettings,
    size?: CanvasSize
  ) => void;
  validateSettings?: (settings: PageSettings) => string | null;
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
  initialSize,
  mediaContext,
  onChange,
  validateSettings,
}: CanvasEditorProps) {
  const media = useStore((state) => state.media);
  const setMedia = useStore((state) => state.setMedia);
  const fontOptions = useMemo(() => getFontFamilyOptions(media), [media]);
  const activeSiteId = mediaContext?.siteId;
  const [reusableSections, setReusableSections] = useState<ReusableSection[]>([]);
  const [reusableSectionsLoading, setReusableSectionsLoading] = useState(false);
  const [reusableSectionsError, setReusableSectionsError] = useState<string | null>(null);
  const [isSavingReusableSection, setIsSavingReusableSection] = useState(false);
  const [pendingDeleteReusableSection, setPendingDeleteReusableSection] = useState<ReusableSection | null>(null);
  const [reusableSectionDraft, setReusableSectionDraft] = useState<{
    mode: 'save' | 'rename';
    name: string;
    sourceElementId?: string;
    sectionId?: string;
  } | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  useEffect(() => {
    const siteId = activeSiteId;
    if (!siteId) {
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
  }, [activeSiteId, setMedia]);

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [size, setSize] = useState<CanvasSize>(initialSize || DEFAULT_CANVAS_SIZE);
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [rightPanel, setRightPanel] = useState<'properties' | 'layers'>('properties');
  const [isPreview, setIsPreview] = useState(false);
  const [showComponentPanel, setShowComponentPanel] = useState(true);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);
  const [isCanvasFocusMode, setIsCanvasFocusMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const changeSequenceRef = useRef(0);
  const pendingTransformRef = useRef<{
    elements: CanvasElement[];
    selectedId: string | null;
  } | null>(null);

  // Undo/Redo State
  const [history, setHistory] = useState<Array<{ elements: CanvasElement[]; selectedId: string | null }>>([
    { elements: initialElements, selectedId: null },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>(initialSettings);

  // Clipboard State
  const [clipboardElement, setClipboardElement] = useState<CanvasElement | null>(
    null
  );
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [isCanvasAutoFit, setIsCanvasAutoFit] = useState(true);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const activeCanvasScale = isPreview ? canvasScale : canvasZoom;
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

  const markChanges = useCallback(() => {
    changeSequenceRef.current += 1;
    setHasUnsavedChanges(true);
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

  const applyCanvasSize = useCallback((nextSize: CanvasSize, nextBreakpoint = breakpoint) => {
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
  }, [breakpoint, elements, markChanges, onChange, pageSettings]);

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
    if (!activeSiteId) {
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
  }, [activeSiteId]);

  useEffect(() => {
    void loadReusableSections();
  }, [loadReusableSections]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

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
        return {
          ...item,
          children: [...(item.children || []), child],
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
    setSelectedIds((current) => current.filter((id) => !!findElementById(elements, id)));

    if (!selectedId) {
      return;
    }

    if (!findElementById(elements, selectedId)) {
      setSelectedId(null);
    }
  }, [elements, selectedId, findElementById]);

  useEffect(() => {
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
  const addToHistory = useCallback((newElements: CanvasElement[], selectedSnapshot: string | null = selectedId) => {
    setHistory((prevHistory) => {
      const baseIndex = Math.max(0, Math.min(historyIndexRef.current, prevHistory.length - 1));
      const nextHistory = prevHistory.slice(0, baseIndex + 1);
      nextHistory.push({
        elements: newElements,
        selectedId: selectedSnapshot,
      });

      // Limit history size to 50
      if (nextHistory.length > 50) {
        nextHistory.shift();
      }

      const nextIndex = nextHistory.length - 1;
      setHistoryIndex(nextIndex);
      historyIndexRef.current = nextIndex;
      return nextHistory;
    });
  }, [selectedId]);

  /**
   * Undo
   */
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const targetState = history[newIndex];
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      setElements(targetState.elements);
      setSelectedId(
        targetState.selectedId && findElementById(targetState.elements, targetState.selectedId)
          ? targetState.selectedId
          : null
      );
      markChanges();
    }
  }, [findElementById, history, historyIndex, markChanges]);

  /**
   * Redo
   */
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const targetState = history[newIndex];
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      setElements(targetState.elements);
      setSelectedId(
        targetState.selectedId && findElementById(targetState.elements, targetState.selectedId)
          ? targetState.selectedId
          : null
      );
      markChanges();
    }
  }, [findElementById, history, historyIndex, markChanges]);

  /**
   * Wrapper for updating elements with history
   */
  const updateElementsWithHistory = useCallback((
    nextElementsOrFn:
      | CanvasElement[]
      | ((current: CanvasElement[]) => CanvasElement[]),
    selectedSnapshot: string | null = selectedId,
  ) => {
    let didUpdate = false;

    setElements((currentElements) => {
      const nextElements = typeof nextElementsOrFn === 'function'
        ? nextElementsOrFn(currentElements)
        : nextElementsOrFn;

      if (nextElements === currentElements) {
        return currentElements;
      }

      didUpdate = true;
      addToHistory(nextElements, selectedSnapshot);
      return nextElements;
    });

    if (didUpdate) {
      markChanges();
    }
  }, [addToHistory, markChanges, selectedId]);

  /**
   * Copy
   */
  const handleCopy = useCallback(() => {
    if (selectedId) {
      const el = findElementById(elements, selectedId);
      if (el) {
        setClipboardElement(el);
        // Optional: Show toast or feedback
      }
    }
  }, [selectedId, elements]);

  const normalizePastedElement = useCallback(
    (sourceElement: CanvasElement, x = 20, y = 20): CanvasElement => {
      const clone = JSON.parse(JSON.stringify(sourceElement)) as CanvasElement;
      const highestZ = Math.max(walkTreeMaxZ(elements), 0);

      return {
        ...clone,
        id: generateId(),
        type: normalizeElementType(clone.type),
        x: sourceElement.x + x,
        y: sourceElement.y + y,
        zIndex: highestZ + 1,
      };
    },
    [elements]
  );

  /**
   * Paste
   */
  const handlePaste = useCallback(() => {
    if (clipboardElement) {
      const newElement = normalizePastedElement(clipboardElement);
      const selectedElement = selectedId ? findElementById(elements, selectedId) : null;
      const canNest = selectedElement && canAcceptNestedDrop(selectedElement.type);
      const newElements = canNest
        ? insertElementAsChild(elements, selectedElement.id, newElement)
        : { elements: [...elements, newElement], updated: false };

      const nextElements = canNest && newElements.updated ? newElements.elements : newElements.elements;

      updateElementsWithHistory(nextElements, newElement.id);
    }
  }, [clipboardElement, elements, normalizePastedElement, selectedId, updateElementsWithHistory]);

  const handleDuplicate = useCallback(() => {
    if (!selectedId) return;
    const selectedElement = findElementById(elements, selectedId);
    if (!selectedElement) return;

    const duplicate = normalizePastedElement(selectedElement);
    const canNest = canAcceptNestedDrop(selectedElement.type);
    const duplicated = canNest
      ? insertElementAsChild(elements, selectedElement.id, duplicate)
      : { elements: [...elements, duplicate], updated: false };
    const nextElements = duplicated.updated || !canNest
      ? duplicated.elements
      : [...elements, duplicate];

    updateElementsWithHistory(nextElements, duplicate.id);
  }, [elements, normalizePastedElement, selectedId, updateElementsWithHistory]);

  const handleLayerSelect = useCallback((ids: string[]) => {
    const nextIds = ids.filter((id) => !!findElementById(elements, id));
    setSelectedIds(nextIds);
    setSelectedId(nextIds[0] ?? null);
    if (nextIds.length > 1) {
      setRightPanel('layers');
    }
  }, [elements, findElementById]);

  const handleLayerReorder = useCallback((fromIndex: number, toIndex: number) => {
    updateElementsWithHistory((currentElements) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentElements.length ||
        toIndex >= currentElements.length
      ) {
        return currentElements;
      }

      const next = [...currentElements];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return next.map((element, index) => ({
        ...element,
        zIndex: index + 1,
      }));
    }, selectedId);
  }, [selectedId, updateElementsWithHistory]);

  const handleLayerVisibilityToggle = useCallback((elementId: string) => {
    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, elementId, (element) => ({
        ...element,
        visible: element.visible === false,
      }));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [selectedId, updateElementsWithHistory]);

  const handleLayerLockToggle = useCallback((elementId: string) => {
    updateElementsWithHistory((currentElements) => {
      const result = updateElementById(currentElements, elementId, (element) => ({
        ...element,
        locked: !element.locked,
      }));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [selectedId, updateElementsWithHistory]);

  const handleLayerDelete = useCallback((elementId: string) => {
    const element = findElementById(elements, elementId);
    if (element?.locked) {
      return;
    }

    const result = removeElementById(elements, elementId);
    if (!result.updated) return;

    const parentSelection = result.removedParentId || null;
    setSelectedId((current) => (current === elementId ? parentSelection : current));
    updateElementsWithHistory(result.elements, parentSelection);
  }, [elements, findElementById, updateElementsWithHistory]);

  const handleLayerDuplicate = useCallback((elementId: string) => {
    const selectedElement = findElementById(elements, elementId);
    if (!selectedElement) return;

    const duplicate = normalizePastedElement(selectedElement);
    updateElementsWithHistory([...elements, duplicate], duplicate.id);
  }, [elements, findElementById, normalizePastedElement, updateElementsWithHistory]);

  const handleGroupSelected = useCallback(() => {
    const selectedSet = new Set(selectedIds);
    const entries = selectedIds
      .map((id) => findElementEntry(elements, id))
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
      const group: CanvasElement = {
        id: groupId,
        type: 'box',
        name: 'Group',
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        zIndex: Math.max(...selectedSiblings.map((item) => item.zIndex || 1)),
        visible: true,
        props: {
          backgroundColor: 'transparent',
          borderRadius: 0,
          borderWidth: 0,
          padding: 0,
        },
        children: selectedSiblings.map((item, index) => ({
          ...item,
          parentId: groupId,
          x: item.x - minX,
          y: item.y - minY,
          zIndex: index + 1,
        })),
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

    updateElementsWithHistory((currentElements) => updateParentChildren(currentElements), groupId);
    setSelectedIds([groupId]);
    setSelectedId(groupId);
    setRightPanel('properties');
  }, [elements, findElementEntry, selectedIds, updateElementsWithHistory]);

  const handleUngroupSelected = useCallback(() => {
    if (!selectedId) {
      return;
    }

    const entry = findElementEntry(elements, selectedId);
    if (!entry?.element.children?.length || entry.element.locked) {
      return;
    }

    const parentId = entry.parentId;
    const children = entry.element.children;
    const expandedIds = children.map((child) => child.id);
    const expandSiblings = (siblings: CanvasElement[]): CanvasElement[] => (
      siblings.flatMap((item) => {
        if (item.id !== selectedId) {
          return [item];
        }

        return children.map((child, index) => {
          const nextChild: CanvasElement = {
            ...child,
            x: item.x + child.x,
            y: item.y + child.y,
            zIndex: (item.zIndex || 1) + index,
          };

          if (parentId) {
            nextChild.parentId = parentId;
          } else {
            delete nextChild.parentId;
          }

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

    const nextSelectedId = expandedIds[0] ?? null;
    updateElementsWithHistory((currentElements) => updateParentChildren(currentElements), nextSelectedId);
    setSelectedIds(nextSelectedId ? [nextSelectedId] : []);
    setSelectedId(nextSelectedId);
    setRightPanel('layers');
  }, [elements, findElementEntry, selectedId, updateElementsWithHistory]);

  // Get selected element
  const selectedElement = selectedId ? findElementById(elements, selectedId) : null;
  const selectedEntries = useMemo(
    () => selectedIds
      .map((id) => findElementEntry(elements, id))
      .filter((entry): entry is { element: CanvasElement; parentId: string | null } => !!entry),
    [elements, findElementEntry, selectedIds],
  );
  const selectedParentId = selectedEntries[0]?.parentId ?? null;
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
  const canGroupSelected = selectedEntries.length > 1
    && selectedEntries.every((entry) => entry.parentId === selectedParentId && !entry.element.locked);
  const canUngroupSelected = selectedEntries.length === 1
    && !selectedEntries[0].element.locked
    && canAcceptNestedDrop(selectedEntries[0].element.type)
    && Boolean(selectedEntries[0].element.children?.length);
  const canAlignSelected = !!selectedElement && !selectedElement.locked;
  const selectedElementLabel = selectedElement
    ? normalizeElementType(selectedElement.type)
    : null;

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

  const handleSelectSiblingScope = useCallback(() => {
    if (selectableSiblingIds.length === 0) {
      return;
    }

    setSelectedIds(selectableSiblingIds);
    setSelectedId(selectableSiblingIds[0] || null);
    setRightPanel('layers');
  }, [selectableSiblingIds]);

  /**
   * Handle elements change
   */
  const handleElementsChange = useCallback((
    newElements: CanvasElement[],
    options?: { transient?: boolean; commit?: boolean; selectedId?: string | null },
  ) => {
    if (options?.transient) {
      pendingTransformRef.current = {
        elements: newElements,
        selectedId: options.selectedId ?? selectedId,
      };
      setElements(newElements);
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
      setElements(pendingTransform.elements);
      addToHistory(pendingTransform.elements, selectedSnapshot);
      markChanges();
      return;
    }

    pendingTransformRef.current = null;
    updateElementsWithHistory(newElements);
  }, [addToHistory, markChanges, selectedId, updateElementsWithHistory]);

  /**
   * Handle element update from property panel
   */
  const handleElementUpdate = useCallback(
    (updates: { [key: string]: unknown }) => {
      if (!selectedId) return;
      const selectedElementId = selectedId;
      updateElementsWithHistory((currentElements) => {
        const result = updateElementById(currentElements, selectedElementId, (element) => ({
          ...element,
          ...updates,
        }));

        if (!result.updated) {
          return currentElements;
        }

        return result.elements;
      }, selectedElementId);
    },
    [selectedId, updateElementsWithHistory]
  );

  const nudgeSelectedElement = useCallback((deltaX: number, deltaY: number) => {
    if (!selectedId) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const selectedElement = findElementById(currentElements, selectedId);
      if (!selectedElement || selectedElement.locked) {
        return currentElements;
      }

      const result = updateElementById(currentElements, selectedId, (element) => ({
        ...element,
        x: Math.max(0, Math.min(element.x + deltaX, Math.max(0, size.width - element.width))),
        y: Math.max(0, Math.min(element.y + deltaY, Math.max(0, size.height - element.height))),
      }));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [findElementById, selectedId, size.height, size.width, updateElementsWithHistory]);

  const alignSelectedElement = useCallback((alignment: CanvasAlignment) => {
    if (!selectedId) {
      return;
    }

    updateElementsWithHistory((currentElements) => {
      const selected = findElementById(currentElements, selectedId);
      if (!selected || selected.locked) {
        return currentElements;
      }

      const nextX = alignment === 'left'
        ? 0
        : alignment === 'center'
          ? Math.max(0, Math.round((size.width - selected.width) / 2))
          : alignment === 'right'
            ? Math.max(0, size.width - selected.width)
            : selected.x;
      const nextY = alignment === 'top'
        ? 0
        : alignment === 'middle'
          ? Math.max(0, Math.round((size.height - selected.height) / 2))
          : alignment === 'bottom'
            ? Math.max(0, size.height - selected.height)
            : selected.y;

      const result = updateElementById(currentElements, selectedId, (element) => ({
        ...element,
        x: nextX,
        y: nextY,
      }));

      return result.updated ? result.elements : currentElements;
    }, selectedId);
  }, [findElementById, selectedId, size.height, size.width, updateElementsWithHistory]);

  /**
   * Handle drag start from component library
   */
  const handleDragStart = useCallback((_item: ComponentLibraryItem) => {
    // Placeholder for drag analytics/hooks.
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
      x: Math.round(Math.max(0, (midpointX - canvasRect.left) / activeCanvasScale) / 10) * 10,
      y: Math.round(Math.max(0, (midpointY - canvasRect.top) / activeCanvasScale) / 10) * 10,
    };
  }, [activeCanvasScale]);

  const addLibraryItemToCanvas = useCallback((item: ComponentLibraryItem, x: number, y: number) => {
    const normalizedType = normalizeElementType(item.type);
    const highestZ = Math.max(walkTreeMaxZ(elements), 0);
    const selectedElement = selectedId ? findElementById(elements, selectedId) : null;
    const canNestInSelection = selectedElement && canAcceptNestedDrop(selectedElement.type);

    if (item.reusableContent?.elements?.length) {
      const newElements = createCanvasElementsFromReusableContent(
        item.reusableContent,
        canNestInSelection ? 20 : x,
        canNestInSelection ? 20 : y,
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
        canNestInSelection ? 20 : x,
        canNestInSelection ? 20 : y,
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
  }, [elements, findElementById, selectedId, updateElementsWithHistory]);

  const handleAddLibraryItem = useCallback((item: ComponentLibraryItem) => {
    const point = getViewportInsertionPoint();
    addLibraryItemToCanvas(item, point.x, point.y);
  }, [addLibraryItemToCanvas, getViewportInsertionPoint]);

  const handleSaveSelectionAsReusableSection = useCallback(() => {
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
    elements,
    findElementById,
    isSavingReusableSection,
    selectedId,
  ]);

  const confirmReusableSectionDraft = useCallback(async () => {
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
    elements,
    findElementById,
    isSavingReusableSection,
    mode,
    reusableSectionDraft,
    reusableSections,
    toReusableTemplateElement,
  ]);

  const handleRenameReusableSection = useCallback((sectionId: string) => {
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
  }, [activeSiteId, reusableSections]);

  const confirmDeleteReusableSection = useCallback(async (sectionId: string) => {
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
  }, [activeSiteId, reusableSections]);

  const handleDeleteReusableSection = useCallback((sectionId: string) => {
    const section = reusableSections.find((item) => item.id === sectionId);
    if (section) {
      setPendingDeleteReusableSection(section);
    }
  }, [reusableSections]);

  /**
   * Handle canvas drop
   */
  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

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

        const x = Math.round(Math.max(0, (e.clientX - rect.left) / activeCanvasScale) / 10) * 10;
        const y = Math.round(Math.max(0, (e.clientY - rect.top) / activeCanvasScale) / 10) * 10;

        if (item.reusableContent?.elements?.length) {
          addLibraryItemToCanvas(item, x, y);
          return;
        }

        addLibraryItemToCanvas({ ...item, type: normalizedType }, x, y);
      } catch (err) {
        console.error('Failed to drop element:', err);
      }
    },
    [activeCanvasScale, addLibraryItemToCanvas]
  );

  /**
   * Delete selected element
   */
  const deleteElement = useCallback(() => {
    if (!selectedId) return;
    const selectedElement = findElementById(elements, selectedId);
    if (selectedElement?.locked) return;

    const result = removeElementById(elements, selectedId);
    if (!result.updated) return;

    updateElementsWithHistory(result.elements, result.removedParentId || null);
  }, [selectedId, elements, findElementById, updateElementsWithHistory]);

  const handleCut = useCallback(() => {
    if (!selectedId) return;

    const selectedElement = findElementById(elements, selectedId);
    if (!selectedElement) return;
    if (selectedElement.locked) return;

    setClipboardElement(selectedElement);

    const result = removeElementById(elements, selectedId);
    if (!result.updated) {
      return;
    }

    const parentSelection = result.removedParentId || null;
    setSelectedId(parentSelection);
    updateElementsWithHistory(result.elements, parentSelection);
  }, [elements, findElementById, selectedId, updateElementsWithHistory]);

  /**
   * Handle save
   */
  const handleSaveWrapper = useCallback(async (settingsOverride?: PageSettings, silent = false) => {
    if (isSaving) {
      return false;
    }

    const saveSequence = changeSequenceRef.current;
    const nextSettings = settingsOverride ?? pageSettings;
    const validationMessage = validateSettings?.(nextSettings) || null;
    if (validationMessage) {
      setHasUnsavedChanges(true);
      if (!silent) {
        setEditorNotice(validationMessage);
      }
      return false;
    }

    setIsSaving(true);
    try {
      await Promise.resolve(onSave(elements, nextSettings, size));
      if (changeSequenceRef.current === saveSequence) {
        setHasUnsavedChanges(false);
      }
      return true;
    } catch {
      setHasUnsavedChanges(true);
      if (!silent) {
        setEditorNotice('Unable to save page. Please try again.');
      } else {
        console.error('Auto-save failed');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [elements, isSaving, onSave, pageSettings, size, validateSettings]);

  const handleSettingsSave = useCallback(async (newSettings: PageSettings) => {
    setPageSettings(newSettings);
    markChanges();

    const saved = await handleSaveWrapper(newSettings, false);
    if (!saved) {
      throw new Error('Unable to save page settings. Changes were not persisted.');
    }
  }, [handleSaveWrapper, markChanges]);

  const handleTogglePublish = useCallback(async () => {
    const nextSettings: PageSettings = {
      ...pageSettings,
      status: pageSettings.status === 'published' ? 'draft' : 'published',
    };
    setPageSettings(nextSettings);
    markChanges();
    await handleSaveWrapper(nextSettings, true);
  }, [handleSaveWrapper, pageSettings, markChanges]);

  const performReload = useCallback(() => {
    const nextElements = getInitialElements();
    const nextSettings = getInitialSettings();

    setElements(nextElements);
    setPageSettings(nextSettings);
    setSize(initialSize || DEFAULT_CANVAS_SIZE);
    setBreakpoint('desktop');
    setSelectedId(null);
    setClipboardElement(null);
    setHistory([{ elements: nextElements, selectedId: null }]);
    setHistoryIndex(0);
    setHasUnsavedChanges(false);
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
      // Ignore if typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (isPreview) {
        if ((e.ctrlKey || e.metaKey) && key === 's') {
          e.preventDefault();
          handleSaveWrapper();
        }
        return;
      }

      // Ctrl+A / Cmd+A (Select all unlocked siblings in the active canvas scope)
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        handleSelectSiblingScope();
        return;
      }

      if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1;
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
        handleSaveWrapper();
        return;
      }

      // Ctrl+Z / Cmd+Z (Undo)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
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
    handleGroupSelected,
    handleUngroupSelected,
    handleSelectSiblingScope,
    nudgeSelectedElement,
    isPreview,
    isSaving,
  ]);



  /**
   * Handle breakpoint change
   */
  const handleBreakpointChange = useCallback(
    (bp: 'desktop' | 'tablet' | 'mobile') => {
      applyCanvasSize(BREAKPOINT_CANVAS_SIZE[bp], bp);
    },
    [applyCanvasSize]
  );

  useEffect(() => {
    if (!hasUnsavedChanges || isSaving) {
      return;
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      void handleSaveWrapper(undefined, true);
    }, 2000);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [handleSaveWrapper, hasUnsavedChanges, isSaving]);

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
                <h1 className="font-semibold">{mode === 'blog' ? 'Edit Post' : 'Edit Page'}</h1>
                <p className="text-xs text-slate-500">{pageSettings.title || 'Untitled'}</p>
              </div>

              {hasUnsavedChanges && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                  Unsaved changes
                </span>
              )}
            </div>
          ) : <div className="w-4 shrink-0" />}

          {/* Center - Canvas controls */}
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => handleBreakpointChange('desktop')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  breakpoint === 'desktop'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70'
                )}
                title="Desktop"
                aria-label="Desktop canvas"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleBreakpointChange('tablet')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  breakpoint === 'tablet'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70'
                )}
                title="Tablet"
                aria-label="Tablet canvas"
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleBreakpointChange('mobile')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  breakpoint === 'mobile'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70'
                )}
                title="Mobile"
                aria-label="Mobile canvas"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
            <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-sm xl:flex">
              <select
                value={activeCanvasPresetId}
                onChange={(event) => handleCanvasPresetChange(event.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-sky-400"
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
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 outline-none focus:border-sky-400"
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
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right tabular-nums text-slate-700 outline-none focus:border-sky-400"
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
              disabled={historyIndex <= 0}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Undo (Cmd/Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo className="h-4 w-4" />
            </button>

            {/* Clipboard actions */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!selectedId}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Copy selected layer (Cmd/Ctrl+C)"
              aria-label="Copy"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCut}
              disabled={!selectedId}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Cut selected layer (Cmd/Ctrl+X)"
              aria-label="Cut"
            >
              <Scissors className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handlePaste}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100"
              title="Paste layer (Cmd/Ctrl+V)"
              aria-label="Paste"
            >
              <ClipboardPaste className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={!selectedId}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Duplicate selected layer (Cmd/Ctrl+D)"
              aria-label="Duplicate"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSelectSiblingScope}
              disabled={selectableSiblingIds.length < 2}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Select all sibling layers (Cmd/Ctrl+A)"
              aria-label="Select all sibling layers"
              data-testid="editor-select-sibling-layers"
            >
              <CheckSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleGroupSelected}
              disabled={!canGroupSelected}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Group selected layers (Cmd/Ctrl+G)"
              aria-label="Group selected layers"
              data-testid="editor-group-selection"
            >
              <Group className="h-4 w-4" />
              <span className="hidden 2xl:inline">Group</span>
            </button>
            <button
              type="button"
              onClick={handleUngroupSelected}
              disabled={!canUngroupSelected}
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Ungroup selected element (Shift+Cmd/Ctrl+G)"
              aria-label="Ungroup selected element"
              data-testid="editor-ungroup-selection"
            >
              <Ungroup className="h-4 w-4" />
              <span className="hidden 2xl:inline">Ungroup</span>
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <div className="flex items-center gap-0.5" aria-label="Alignment controls">
              <button
                type="button"
                onClick={() => alignSelectedElement('left')}
                disabled={!canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align left"
                aria-label="Align left"
              >
                <AlignHorizontalJustifyStart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('center')}
                disabled={!canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align horizontal center"
                aria-label="Align horizontal center"
              >
                <AlignHorizontalJustifyCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('right')}
                disabled={!canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align right"
                aria-label="Align right"
              >
                <AlignHorizontalJustifyEnd className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('top')}
                disabled={!canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align top"
                aria-label="Align top"
              >
                <AlignVerticalJustifyStart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('middle')}
                disabled={!canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align vertical center"
                aria-label="Align vertical center"
              >
                <AlignVerticalJustifyCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => alignSelectedElement('bottom')}
                disabled={!canAlignSelected}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Align bottom"
                aria-label="Align bottom"
              >
                <AlignVerticalJustifyEnd className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={deleteElement}
              disabled={!selectedId}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Delete (Delete)"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={() => setShowComponentPanel((current) => !current)}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                showComponentPanel
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'hover:bg-slate-100'
              )}
              title={showComponentPanel ? 'Hide components panel' : 'Show components panel'}
              aria-label={showComponentPanel ? 'Hide components panel' : 'Show components panel'}
              aria-pressed={showComponentPanel}
            >
              <PanelLeft className="w-4 h-4" />
              Components
            </button>

            <button
              type="button"
              onClick={() => setRightPanel(rightPanel === 'layers' ? 'properties' : 'layers')}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                rightPanel === 'layers'
                  ? 'bg-slate-950 text-white'
                  : 'hover:bg-slate-100'
              )}
              title="Toggle layers panel"
              aria-label="Toggle layers panel"
            >
              <Layers className="w-4 h-4" />
              Layers
            </button>

            <button
              type="button"
              onClick={() => setShowInspectorPanel((current) => !current)}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium',
                showInspectorPanel
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'hover:bg-slate-100'
              )}
              title={showInspectorPanel ? 'Hide inspector panel' : 'Show inspector panel'}
              aria-label={showInspectorPanel ? 'Hide inspector panel' : 'Show inspector panel'}
              aria-pressed={showInspectorPanel}
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
              title={isCanvasFocusMode ? 'Exit wide canvas focus' : 'Enter wide canvas focus'}
              aria-label={isCanvasFocusMode ? 'Exit wide canvas focus' : 'Enter wide canvas focus'}
              aria-pressed={isCanvasFocusMode}
            >
              <Maximize2 className="w-4 h-4" />
              Focus
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            {/* Preview Toggle */}
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
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
              className="px-2 py-1.5 rounded-md text-sm font-medium hover:bg-slate-100"
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
              className="px-2 py-1.5 rounded-md text-sm font-medium hover:bg-slate-100"
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
                    disabled={isSaving}
                    className={cn(
                      'px-2 py-1.5 rounded-md text-sm font-medium',
                      pageSettings.status === 'published'
                        ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                        : 'bg-emerald-600 text-white hover:bg-emerald-600/90',
                      isSaving ? 'opacity-70 cursor-not-allowed' : '',
                    )}
                    title={
                      pageSettings.status === 'published'
                        ? 'Set page back to draft'
                        : 'Publish page'
                    }
                    aria-label={
                      pageSettings.status === 'published'
                        ? 'Unpublish page'
                        : 'Publish page'
                    }
                  >
                    {pageSettings.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleSaveWrapper()}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-70 disabled:cursor-not-allowed"
                  title="Save Page (Ctrl+S)"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}

          </div>
        </header>

        {/* Main Content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Sidebar - Component Library */}
          {!isPreview && !isCanvasFocusMode && showComponentPanel && (
            <ComponentLibrary
              onDragStart={handleDragStart}
              onAddItem={handleAddLibraryItem}
              reusableSections={reusableSections}
              reusableSectionsLoading={reusableSectionsLoading}
              reusableSectionsError={reusableSectionsError}
              canSaveSelection={Boolean(activeSiteId && selectedId)}
              isSavingReusableSection={isSavingReusableSection}
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
              isCanvasFocusMode ? 'p-6 lg:p-10 2xl:p-12' : 'p-4 lg:p-6 2xl:p-8'
            )}
            style={{
              backgroundColor: '#eef2f7',
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(71,85,105,0.18) 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
          >
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
                    style={{
                      width: size.width,
                      height: size.height,
                      transform: `scale(${activeCanvasScale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <Canvas
                      elements={elements}
                      onElementsChange={handleElementsChange}
                      selectedId={selectedId}
                      selectedIds={selectedIds}
                      onSelect={handleSelect}
                      onToggleSelect={handleCanvasToggleSelect}
                      size={size}
                      onSizeChange={(newSize) => {
                        setSize(newSize);
                        markChanges();
                        if (onChange) {
                          onChange(elements, pageSettings, newSize);
                        }
                      }}
                      isPreview={isPreview}
                      viewportScale={activeCanvasScale}
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
                    <div className="border-b border-r border-slate-300 bg-slate-200" />
                    <div className="relative overflow-hidden border-b border-slate-300 bg-slate-50">
                      {horizontalRulerTicks.map((tick) => (
                        <div
                          key={`x-${tick.value}`}
                          className="absolute top-0 h-full border-l border-slate-300"
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
                    <div className="relative overflow-hidden border-r border-slate-300 bg-slate-50">
                      {verticalRulerTicks.map((tick) => (
                        <div
                          key={`y-${tick.value}`}
                          className="absolute left-0 w-full border-t border-slate-300"
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
                        style={{
                          width: size.width,
                          height: size.height,
                          transform: `scale(${activeCanvasScale})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        <Canvas
                          elements={elements}
                          onElementsChange={handleElementsChange}
                          selectedId={selectedId}
                          selectedIds={selectedIds}
                          onSelect={handleSelect}
                          onToggleSelect={handleCanvasToggleSelect}
                          size={size}
                          onSizeChange={(newSize) => {
                            setSize(newSize);
                            markChanges();
                            if (onChange) {
                              onChange(elements, pageSettings, newSize);
                            }
                          }}
                          isPreview={isPreview}
                          viewportScale={activeCanvasScale}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isPreview && (
              <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center tabular-nums">{zoomPercent}%</span>
                {isCanvasAutoFit && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Auto
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={handleFitCanvas}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  title="Fit canvas"
                  aria-label="Fit canvas"
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
                        <button
                          type="button"
                          onClick={handleGroupSelected}
                          disabled={!canGroupSelected}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <Group className="h-3.5 w-3.5" />
                          Group
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
                          <div className="truncate text-sm font-semibold capitalize text-slate-950">
                            {selectedElementLabel}
                          </div>
                          <div className="truncate text-xs text-slate-500">{selectedElement.id}</div>
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
                      {canUngroupSelected && (
                        <button
                          type="button"
                          onClick={handleUngroupSelected}
                          className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Ungroup className="h-3.5 w-3.5" />
                          Ungroup
                        </button>
                      )}
                      <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] font-medium text-slate-500">
                        <span className="rounded bg-white px-2 py-1 tabular-nums">X {Math.round(selectedElement.x)}</span>
                        <span className="rounded bg-white px-2 py-1 tabular-nums">Y {Math.round(selectedElement.y)}</span>
                        <span className="rounded bg-white px-2 py-1 tabular-nums">W {Math.round(selectedElement.width)}</span>
                        <span className="rounded bg-white px-2 py-1 tabular-nums">H {Math.round(selectedElement.height)}</span>
                      </div>
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
                    elements={elements}
                    selectedIds={selectedIds}
                    onSelect={handleLayerSelect}
                    onReorder={handleLayerReorder}
                    onVisibilityToggle={handleLayerVisibilityToggle}
                    onLockToggle={handleLayerLockToggle}
                    onDelete={handleLayerDelete}
                    onDuplicate={handleLayerDuplicate}
                    embedded
                    hideHeader
                  />
                ) : (
                  <PropertyPanel
                    element={selectedElement}
                    onChange={handleElementUpdate}
                    onDelete={deleteElement}
                    mediaContext={mediaContext}
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
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
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
                  <h2 className="text-lg font-semibold text-slate-950">
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
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-red-50 p-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Delete {pendingDeleteReusableSection.name}?</h2>
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
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <RefreshCw className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Reload editor?</h2>
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
        />
      </div>
    </ActiveEditorProvider>
  );
}
