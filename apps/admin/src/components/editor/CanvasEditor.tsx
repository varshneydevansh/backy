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
  ArrowLeft,
  Save,
  Eye,
  Scissors,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  Undo,
  Redo,
  Settings,
} from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import { Canvas } from '@/components/editor/Canvas';
import { ComponentLibrary } from '@/components/editor/ComponentLibrary';
import { PropertyPanel } from '@/components/editor/PropertyPanel';
import { PageSettingsModal, type PageSettings } from '@/components/editor/PageSettingsModal';
import { ActiveEditorProvider } from '@/components/editor/ActiveEditorContext';
import type { MediaContext } from '@/components/editor/MediaLibraryModal';
import {
  BREAKPOINT_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
  createCanvasElement,
} from '@/components/editor/editorCatalog';
import { buildCustomFontFaces, buildGoogleFontImportUrl, getFontFamilyOptions } from '@/components/editor/fontCatalog';
import type {
  CanvasElement,
  CanvasSize,
  ComponentLibraryItem,
} from '@/types/editor';
import { useStore } from '@/stores/mockStore';

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
}: CanvasEditorProps) {
  const media = useStore((state) => state.media);
  const fontOptions = useMemo(() => getFontFamilyOptions(media), [media]);

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
  const [size, setSize] = useState<CanvasSize>(initialSize || DEFAULT_CANVAS_SIZE);
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isPreview, setIsPreview] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeSequenceRef = useRef(0);

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
  const canvasViewportRef = useRef<HTMLDivElement>(null);

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

  const markChanges = useCallback(() => {
    changeSequenceRef.current += 1;
    setHasUnsavedChanges(true);
  }, []);

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
    if (!selectedId) {
      return;
    }

    if (!findElementById(elements, selectedId)) {
      setSelectedId(null);
    }
  }, [elements, selectedId, findElementById]);

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

  // Get selected element
  const selectedElement = selectedId ? findElementById(elements, selectedId) : null;

  /**
   * Handle element selection
   */
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  /**
   * Handle elements change
   */
  const handleElementsChange = useCallback((newElements: CanvasElement[]) => {
    updateElementsWithHistory(newElements);
  }, [updateElementsWithHistory]);

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

  /**
   * Handle drag start from component library
   */
  const handleDragStart = useCallback((item: ComponentLibraryItem) => {
    // Placeholder for drag analytics/hooks.
  }, []);

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

        // Calculate drop position relative to canvas
        const canvas = e.currentTarget as HTMLDivElement;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Create new element
        const newElement = createCanvasElement(normalizedType, x, y);
        const selectedElement = selectedId ? findElementById(elements, selectedId) : null;
        const isNested = selectedElement && canAcceptNestedDrop(selectedElement.type);
        const normalized = normalizePastedElement(newElement);
        const result = isNested
          ? insertElementAsChild(elements, selectedElement.id, normalized)
          : { elements: [...elements, normalized], updated: false };

        const newElements = result.updated || !isNested
          ? result.elements
          : [...elements, normalized];

        updateElementsWithHistory(newElements, normalized.id);
      } catch (err) {
        console.error('Failed to drop element:', err);
      }
    },
    [elements, selectedId, updateElementsWithHistory]
  );

  /**
   * Delete selected element
   */
  const deleteElement = useCallback(() => {
    if (!selectedId) return;
    const result = removeElementById(elements, selectedId);
    if (!result.updated) return;

    updateElementsWithHistory(result.elements, result.removedParentId || null);
  }, [selectedId, elements, updateElementsWithHistory]);

  const handleCut = useCallback(() => {
    if (!selectedId) return;

    const selectedElement = findElementById(elements, selectedId);
    if (!selectedElement) return;

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
      return;
    }

    const saveSequence = changeSequenceRef.current;
    setIsSaving(true);
    try {
      const nextSettings = settingsOverride ?? pageSettings;
      await Promise.resolve(onSave(elements, nextSettings, size));
      if (changeSequenceRef.current === saveSequence) {
        setHasUnsavedChanges(false);
      }
    } catch {
      setHasUnsavedChanges(true);
      if (!silent) {
        alert('Unable to save page. Please try again.');
      } else {
        console.error('Auto-save failed');
      }
    } finally {
      setIsSaving(false);
    }
  }, [elements, isSaving, onSave, pageSettings, size]);

  const handleTogglePublish = useCallback(async () => {
    const nextSettings: PageSettings = {
      ...pageSettings,
      status: pageSettings.status === 'published' ? 'draft' : 'published',
    };
    setPageSettings(nextSettings);
    markChanges();
    await handleSaveWrapper(nextSettings, true);
  }, [handleSaveWrapper, pageSettings, markChanges]);

  const handleReload = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (hasUnsavedChanges) {
      const shouldReload = window.confirm(
        'You have unsaved changes. Reload will discard your current edits. Continue?'
      );
      if (!shouldReload) {
        return;
      }
    }

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
    if (onChange) {
      onChange(nextElements, nextSettings, initialSize || DEFAULT_CANVAS_SIZE);
    }
  }, [getInitialElements, getInitialSettings, hasUnsavedChanges, initialSize, isSaving, onChange]);

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
    isPreview,
    isSaving,
  ]);



  /**
   * Handle breakpoint change
   */
  const handleBreakpointChange = useCallback(
    (bp: 'desktop' | 'tablet' | 'mobile') => {
      setBreakpoint(bp);
      const nextSize = BREAKPOINT_CANVAS_SIZE[bp];
      setSize(nextSize);
      markChanges();
      if (onChange) {
        onChange(elements, pageSettings, nextSize);
      }
    },
    [elements, pageSettings, onChange, markChanges]
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

  return (
    <ActiveEditorProvider>
      <div className={cn("flex flex-col bg-background", className || "fixed inset-0")}>
        {/* Header */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
          {/* Left */}
          {!hideNavigation ? (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-lg hover:bg-accent"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div>
                <h1 className="font-semibold">{mode === 'blog' ? 'Edit Post' : 'Edit Page'}</h1>
                <p className="text-xs text-muted-foreground">{pageSettings.title || 'Untitled'}</p>
              </div>

              {hasUnsavedChanges && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                  Unsaved changes
                </span>
              )}
            </div>
          ) : <div className="w-4" />}

          {/* Center - Breakpoint Toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleBreakpointChange('desktop')}
              className={cn(
                'p-2 rounded-md transition-colors',
                breakpoint === 'desktop'
                  ? 'bg-card shadow-sm'
                  : 'hover:bg-muted/80'
              )}
              title="Desktop"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleBreakpointChange('tablet')}
              className={cn(
                'p-2 rounded-md transition-colors',
                breakpoint === 'tablet'
                  ? 'bg-card shadow-sm'
                  : 'hover:bg-muted/80'
              )}
              title="Tablet"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleBreakpointChange('mobile')}
              className={cn(
                'p-2 rounded-md transition-colors',
                breakpoint === 'mobile'
                  ? 'bg-card shadow-sm'
                  : 'hover:bg-muted/80'
              )}
              title="Mobile"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {/* Undo/Redo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo className="w-4 h-4 inline-block mr-1" />
              Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo className="w-4 h-4 inline-block mr-1" />
              Redo
            </button>

            {/* Clipboard actions */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!selectedId}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy (Ctrl+C)"
              aria-label="Copy"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={handleCut}
              disabled={!selectedId}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cut (Ctrl+X)"
              aria-label="Cut"
            >
              <Scissors className="w-4 h-4 inline-block mr-1" />
              Cut
            </button>
            <button
              type="button"
              onClick={handlePaste}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent"
              title="Paste (Ctrl+V)"
              aria-label="Paste"
            >
              Paste
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={!selectedId}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Duplicate (Ctrl+D)"
              aria-label="Duplicate"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={deleteElement}
              disabled={!selectedId}
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete (Delete)"
              aria-label="Delete"
            >
              Delete
            </button>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Preview Toggle */}
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                isPreview
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
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
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent"
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
              className="px-2 py-1.5 rounded-lg text-sm font-medium hover:bg-accent"
              title="Reload page from last saved state"
              aria-label="Reload page"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="ml-1">Reload</span>
            </button>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Save */}
            {!hideSave && (
              <>
                {mode === 'page' && (
                  <button
                    type="button"
                    onClick={handleTogglePublish}
                    disabled={isSaving}
                    className={cn(
                      'px-2 py-1.5 rounded-lg text-sm font-medium',
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
                  onClick={handleSaveWrapper}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70 disabled:cursor-not-allowed"
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
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Component Library */}
          {!isPreview && <ComponentLibrary onDragStart={handleDragStart} />}

          {/* Center - Canvas */}
          <div
            ref={canvasViewportRef}
            className="flex-1 bg-muted overflow-auto p-8"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
          >
            <div className="flex justify-center min-h-full">
              <div
                style={{
                  transform: isPreview ? `scale(${canvasScale})` : undefined,
                  transformOrigin: 'top center',
                  width: isPreview ? size.width : undefined,
                  height: isPreview ? size.height : undefined,
                }}
              >
                <Canvas
                  elements={elements}
                  onElementsChange={handleElementsChange}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  size={size}
                  onSizeChange={(newSize) => {
                    setSize(newSize);
                    markChanges();
                    if (onChange) {
                      onChange(elements, pageSettings, newSize);
                    }
                  }}
                  isPreview={isPreview}
                />
              </div>
            </div>
          </div>

          {/* Right Sidebar - Property Panel */}
          {!isPreview && (
            <PropertyPanel
              element={selectedElement}
              onChange={handleElementUpdate}
              onDelete={deleteElement}
              mediaContext={mediaContext}
            />
          )}
        </div>

        <PageSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={pageSettings}
          onSave={(newSettings) => {
            setPageSettings(newSettings);
            markChanges();
          }}
        />
      </div>
    </ActiveEditorProvider>
  );
}
