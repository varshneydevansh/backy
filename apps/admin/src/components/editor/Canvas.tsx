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

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import { createCanvasElement } from '@/components/editor/editorCatalog';
import { RichTextBlock } from './blocks/RichTextBlock';
import {
  extractListItemsFromSlate,
  getListTypeFromSlate,
  normalizeListContent,
} from './listUtils';

const toCssLength = (value: unknown): string | number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return undefined;
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

const sanitizeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

interface TreeUpdateResult {
  elements: CanvasElement[];
  updated: boolean;
}

interface TreeResultWithParent {
  elements: CanvasElement[];
  updated: boolean;
  removedParentId?: string | null;
}

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
        children: [...(element.children || []), child],
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

const removeElementById = (
  elements: CanvasElement[],
  targetId: string,
): TreeResultWithParent => {
  let removedParentId: string | null | undefined;

  const walk = (nodes: CanvasElement[], parentId: string | null): TreeUpdateResult => {
    let updated = false;

    const nextNodes = nodes.reduce<CanvasElement[]>((acc, element) => {
      if (element.id === targetId) {
        removedParentId = parentId;
        updated = true;
        return acc;
      }

      if (!element.children?.length) {
        acc.push(element);
        return acc;
      }

      const nextChildren = walk(element.children, element.id);
      if (!nextChildren.updated) {
        acc.push(element);
        return acc;
      }

      updated = true;
      acc.push({
        ...element,
        children: nextChildren.elements,
      });
      return acc;
    }, []);

    return {
      elements: nextNodes,
      updated,
    };
  };

  const result = walk(elements, null);
  return {
    ...result,
    removedParentId,
  };
};

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
    // Allow pasting of YouTube ID only
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

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
};

const normalizeMapUrl = (addressOrUrl: unknown): string => {
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
    return `https://www.google.com/maps?q=${encodeURIComponent(source)}&output=embed`;
  }

  const host = parsed.host.toLowerCase();
  if (host.includes('google.com') && host.includes('maps')) {
    if (parsed.searchParams.has('output')) {
      return source;
    }
    if (parsed.searchParams.has('q')) {
      return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}&output=embed`;
    }
    if (parsed.searchParams.has('ll') || parsed.searchParams.has('pb')) {
      return `${parsed.toString()}&output=embed`;
    }
  }

  return `https://www.google.com/maps?q=${encodeURIComponent(source)}&output=embed`;
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

const buildSharedElementStyle = (element: CanvasElement): CSSProperties => {
  const p = element.props as Record<string, any>;
  const savedStyles = element.styles || {};

  const borderWidth = toCssLength(p.borderWidth ?? savedStyles.borderWidth);
  const borderColor = p.borderColor ?? savedStyles.borderColor;
  const borderStyle = p.borderStyle ?? savedStyles.borderStyle ?? 'solid';
  const border = p.border ?? savedStyles.border ?? (borderWidth || borderColor
    ? `${borderWidth || '1px'} ${borderStyle} ${borderColor || '#000000'}`
    : undefined);

  return {
    ...savedStyles,
    backgroundColor: p.backgroundColor ?? savedStyles.backgroundColor,
    color: p.color ?? savedStyles.color,
    border,
    borderColor,
    borderStyle,
    borderWidth,
    borderRadius: toCssLength(p.borderRadius ?? savedStyles.borderRadius),
    padding: toCssLength(p.padding ?? savedStyles.padding),
    fontFamily: p.fontFamily ?? savedStyles.fontFamily,
    fontSize: p.fontSize ?? savedStyles.fontSize,
    fontWeight: p.fontWeight ?? savedStyles.fontWeight,
    lineHeight: p.lineHeight ?? savedStyles.lineHeight,
    textTransform: p.textTransform ?? savedStyles.textTransform,
    letterSpacing: toCssLength(p.letterSpacing ?? savedStyles.letterSpacing),
    wordSpacing: toCssLength(p.wordSpacing ?? savedStyles.wordSpacing),
    textShadow: p.textShadow ?? savedStyles.textShadow,
    textIndent: toCssLength(p.textIndent ?? savedStyles.textIndent),
    fontStyle: (p as Record<string, unknown>).fontStyle ?? (savedStyles as Record<string, unknown>).fontStyle,
    textAlign: p.textAlign ?? savedStyles.textAlign,
    textDecoration: p.textDecoration ?? savedStyles.textDecoration,
    margin: toCssLength(p.margin ?? savedStyles.margin),
    opacity: toOpacity(p.opacity ?? savedStyles.opacity),
    boxShadow: p.boxShadow ?? savedStyles.boxShadow,
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

const formatFieldLabel = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const formatHelpText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
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

  if (normalized === 'radio' || normalized === 'radiobutton' || normalized === 'radiobuttons' || normalized === 'radioinput') {
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

  return normalized as CanvasElement['type'] || 'text';
};

// ============================================
// TYPES
// ============================================

interface CanvasProps {
  /** Canvas elements to render */
  elements: CanvasElement[];
  /** Callback when elements change */
  onElementsChange: (elements: CanvasElement[]) => void;
  /** Currently selected element ID */
  selectedId: string | null;
  /** Callback when element is selected */
  onSelect: (id: string | null) => void;
  /** Canvas size configuration */
  size: CanvasSize;
  /** Callback when canvas size changes */
  onSizeChange?: (newSize: CanvasSize) => void;
  /** Whether canvas is in preview mode */
  isPreview?: boolean;
}

const EDITOR_ACTIVATION_EVENT = 'backy-open-text-editor';

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
  onSelect,
  size,
  onSizeChange,
  isPreview = false,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const debugTextInteraction = useCallback((..._args: unknown[]) => {
  }, []);

  const getTargetElement = useCallback((target: EventTarget | null) => {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target instanceof Text) {
      return target.parentElement;
    }
    return null;
  }, []);

  useEffect(() => {
    if (isPreview) {
      setEditingId(null);
      return;
    }

    if (!selectedId) {
      setEditingId(null);
    }
  }, [isPreview, selectedId]);

  const isInteractiveHandle = useCallback((target: EventTarget | null) => {
    const element = getTargetElement(target);
    if (!element) return false;
    return !!element.closest('[data-role="canvas-resize-handle"]');
  }, [getTargetElement]);

  const isTextEditorInteraction = useCallback((target: EventTarget | null) => {
    const element = getTargetElement(target);
    if (!element) return false;

    const editorHost = element.closest('[data-backy-text-editor]');
    if (!editorHost) {
      return false;
    }

    return editorHost.getAttribute('data-backy-text-editor-editable') === 'true';
  }, [getTargetElement]);

  const requestEditForElement = useCallback((elementId: string | null) => {
    if (!elementId || isPreview) {
      debugTextInteraction('requestEditForElement blocked', {
        elementId,
        reason: !elementId ? 'missing-element-id' : 'preview-mode',
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
  }, [debugTextInteraction, elements, editingId, isPreview, onSelect]);

  const handleExternalEditRequest = useCallback((event: Event) => {
    const elementId = (event as CustomEvent<{ elementId?: string }>)?.detail?.elementId;
    debugTextInteraction('handleExternalEditRequest', { eventType: event.type, elementId });
    requestEditForElement(elementId || null);
  }, [requestEditForElement]);

  // Drag state for moving elements
  const [dragState, setDragState] = useState<{
    elementId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Resize state for resizing elements
  const [resizeState, setResizeState] = useState<{
    elementId: string;
    handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
  } | null>(null);

  // Resize state for canvas itself
  const [canvasResizeState, setCanvasResizeState] = useState<{
    startY: number;
    initialHeight: number;
  } | null>(null);

  /**
   * Handle mouse down on an element
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.PointerEvent, elementId: string) => {
      if (isPreview) return;
      if ('button' in e && e.button !== 0) return;

      if (isTextEditorInteraction(e.target)) {
        debugTextInteraction('handleMouseDown ignored for text editor interaction', {
          elementId,
          target: (e.target as Element | null)?.tagName,
        });
        return;
      }

      const eventTarget = getTargetElement(e.target);
      const hitElementId = eventTarget?.closest?.('[data-element-id]')?.getAttribute('data-element-id');

      if (hitElementId && hitElementId !== elementId) {
        debugTextInteraction('handleMouseDown hit-child mismatch', { elementId, hitElementId });
        return;
      }

      const clickedElement = findElementById(elements, elementId);
      if (!clickedElement) return;

      if (isInteractiveHandle(e.target)) return;
      debugTextInteraction('handleMouseDown started drag', { elementId, x: e.clientX, y: e.clientY });

      onSelect(elementId);

      if (editingId) {
        setEditingId(null);
      }

      setDragState({
        elementId,
        startX: e.clientX,
        startY: e.clientY,
        initialX: clickedElement.x,
        initialY: clickedElement.y,
      });
    },
    [elements, editingId, isInteractiveHandle, isTextEditorInteraction, isPreview, onSelect]
  );

  /**
   * Handle resize start from resize handles
   */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, elementId: string, handle: 'nw' | 'ne' | 'sw' | 'se') => {
      if (isPreview) return;

      e.stopPropagation();
      e.preventDefault();

      const element = findElementById(elements, elementId);
      if (!element) return;

      setResizeState({
        elementId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        initialX: element.x,
        initialY: element.y,
        initialWidth: element.width,
        initialHeight: element.height,
      });
    },
    [elements, isPreview]
  );

  /**
   * Handle mouse move for dragging and resizing
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPreview) return;

      // Handle resize
      if (resizeState) {
        const deltaX = e.clientX - resizeState.startX;
        const deltaY = e.clientY - resizeState.startY;

        let newX = resizeState.initialX;
        let newY = resizeState.initialY;
        let newWidth = resizeState.initialWidth;
        let newHeight = resizeState.initialHeight;

        // Calculate new dimensions based on resize handle
        switch (resizeState.handle) {
          case 'se':
            newWidth = Math.max(50, resizeState.initialWidth + deltaX);
            newHeight = Math.max(30, resizeState.initialHeight + deltaY);
            break;
          case 'sw':
            newX = resizeState.initialX + deltaX;
            newWidth = Math.max(50, resizeState.initialWidth - deltaX);
            newHeight = Math.max(30, resizeState.initialHeight + deltaY);
            break;
          case 'ne':
            newWidth = Math.max(50, resizeState.initialWidth + deltaX);
            newY = resizeState.initialY + deltaY;
            newHeight = Math.max(30, resizeState.initialHeight - deltaY);
            break;
          case 'nw':
            newX = resizeState.initialX + deltaX;
            newY = resizeState.initialY + deltaY;
            newWidth = Math.max(50, resizeState.initialWidth - deltaX);
            newHeight = Math.max(30, resizeState.initialHeight - deltaY);
            break;
        }

        // Snap to grid
        newX = Math.round(newX / 10) * 10;
        newY = Math.round(newY / 10) * 10;
        newWidth = Math.round(newWidth / 10) * 10;
        newHeight = Math.round(newHeight / 10) * 10;

        onElementsChange(
          updateElementById(elements, resizeState.elementId, (element) => ({
            ...element,
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
          })).elements
        );
        return;
      }

      // Handle drag
      if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;

        const newX = dragState.initialX + deltaX;
        const newY = dragState.initialY + deltaY;

        // Snap to grid (10px)
        const snappedX = Math.round(newX / 10) * 10;
        const snappedY = Math.round(newY / 10) * 10;

        onElementsChange(
          updateElementById(elements, dragState.elementId, (element) => ({
            ...element,
            x: snappedX,
            y: snappedY,
          })).elements
        );
      }
    },
    [dragState, resizeState, elements, isPreview, onElementsChange]
  );

  const handleCanvasElementDrop = useCallback(
    (event: React.DragEvent, forcedParentId?: string) => {
      event.preventDefault();

      try {
        const rawData = event.dataTransfer.getData('application/json');
        const item = JSON.parse(rawData) as { type: string };
        const normalizedType = normalizeCanvasElementType(item.type);

        const parsedX = event.clientX - (canvasRef.current?.getBoundingClientRect().left || 0);
        const parsedY = event.clientY - (canvasRef.current?.getBoundingClientRect().top || 0);
        const toNumber = (value: number) => Math.round(Math.max(0, value / 10) * 10);

        if (forcedParentId) {
          const parent = findElementById(elements, forcedParentId);
          const isDropTarget = parent && canAcceptNestedDrop(parent.type);

          const dropHost = canvasRef.current?.querySelector<HTMLElement>(
            `[data-element-id="${forcedParentId}"]`
          );

          if (isDropTarget && dropHost) {
            const hostRect = dropHost.getBoundingClientRect();
            const child = createCanvasElement(
              normalizedType as CanvasElement['type'],
              toNumber(event.clientX - hostRect.left),
              toNumber(event.clientY - hostRect.top),
            );
            const withChild = insertElementAsChild(elements, forcedParentId, child);

            if (withChild.updated) {
              onElementsChange(withChild.elements);
              onSelect(child.id);
            }

            return;
          }
        }

        const rootElement = createCanvasElement(
          normalizedType as CanvasElement['type'],
          toNumber(parsedX),
          toNumber(parsedY)
        );

        onElementsChange([...elements, rootElement]);
        onSelect(rootElement.id);
      } catch (error) {
        console.error('Failed to drop element:', error);
      }
    },
    [elements, onElementsChange, onSelect]
  );

  const handleElementPropsUpdate = useCallback(
    (elementId: string, updates: { [key: string]: unknown }) => {
      const next = updateElementById(elements, elementId, (element) => ({
        ...element,
        props: { ...element.props, ...updates },
      }));

      if (next.updated) {
        onElementsChange(next.elements);
      }
    },
    [elements, onElementsChange]
  );

  /**
   * Handle canvas resize start
   */
  const handleCanvasResizeStart = useCallback((e: React.MouseEvent) => {
    if (isPreview) return;
    e.preventDefault();
    e.stopPropagation();
    setCanvasResizeState({
      startY: e.clientY,
      initialHeight: size.height,
    });
  }, [isPreview, size.height]);

  /**
   * Global mouse move for canvas resize (attached to window/doc usually but we'll use local + capture for now)
   * actually local onMouseMove is fine if we are big enough, but typically we want window listener.
   * For this "visual editing surface", we'll simple check in the main handleMouseMove
   */

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (canvasResizeState && onSizeChange) {
      const deltaY = e.clientY - canvasResizeState.startY;
      const newHeight = Math.max(size.minHeight || 600, canvasResizeState.initialHeight + deltaY);
      // Snap to 10
      const snappedHeight = Math.round(newHeight / 10) * 10;
      onSizeChange({ ...size, height: snappedHeight });
    }
  }, [canvasResizeState, onSizeChange, size]);

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
  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setResizeState(null);
  }, []);

  /**
   * Handle canvas click to deselect
   */
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    const eventTarget = getTargetElement(event.target);
    if (isTextEditorInteraction(eventTarget)) {
      debugTextInteraction('handleCanvasClick skipped in text editor', {
        targetTag: (eventTarget as Element | null)?.tagName,
      });
      return;
    }

    if (!isPreview) {
      onSelect(null);
      setEditingId(null);
    }
  }, [isPreview, isTextEditorInteraction, onSelect]);

  const handleCanvasDoubleClick = useCallback((event: React.MouseEvent) => {
    const eventTarget = getTargetElement(event.target);
    if (!eventTarget) {
      return;
    }

    const clickedId = eventTarget.closest?.('[data-element-id]')?.getAttribute('data-element-id');
    debugTextInteraction('handleCanvasDoubleClick', { clickedId });
    requestEditForElement(clickedId || null);
  }, [getTargetElement, requestEditForElement]);

  const handleDoubleClick = useCallback((elementId: string) => {
    if (isPreview) {
      return;
    }

    requestEditForElement(elementId);
  }, [isPreview, requestEditForElement]);

  const handleCanvasKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setEditingId((current) => (current ? null : current));
    }
  }, []);

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
        'relative bg-white overflow-hidden',
        !isPreview && 'cursor-default'
      )}
      style={{
        width: size.width,
        height: size.height,
        minWidth: size.width,
        minHeight: size.height,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
    >
      {/* Grid Background */}
      {!isPreview && (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, #e5e7eb 1px, transparent 1px),
              linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
            `,
            backgroundSize: '10px 10px',
          }}
        />
      )}

      {/* Canvas Elements */}
      {elements.map((element) => (
          <CanvasElementComponent
            key={element.id}
            element={element}
            isSelected={element.id === selectedId}
            selectedId={selectedId}
            isPreview={isPreview}
            onPointerDown={(e) => handleMouseDown(e, element.id)}
            onResizeStart={(e, handle) => handleResizeStart(e, element.id, handle)}
            onClick={(e) => {
              e.stopPropagation();
              debugTextInteraction('element onClick', {
                elementId: element.id,
                elementType: element.type,
              });
              onSelect(element.id);
            }}
            onSelectElement={onSelect}
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
          className="absolute bottom-0 left-0 w-full h-4 hover:h-6 transition-all bg-transparent hover:bg-primary/5 cursor-ns-resize flex justify-center items-end pb-1 group z-50"
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
  isPreview: boolean;
  onPointerDown: (e: React.PointerEvent, elementId?: string) => void;
  onResizeStart: (e: React.MouseEvent, handle: 'nw' | 'ne' | 'sw' | 'se') => void;
  onClick: (e: React.MouseEvent) => void;
  onSelectElement: (elementId: string) => void;
  onUpdate: (updates: { [key: string]: unknown }) => void;
  onUpdateElement: (elementId: string, updates: { [key: string]: unknown }) => void;
  onDrop?: (e: React.DragEvent, forcedParentId?: string) => void;
  isEditing: boolean;
  onDoubleClick: () => void;
  onStopEditing?: () => void;
}

function CanvasElementComponent({
  element,
  isSelected,
  selectedId,
  isPreview,
  onPointerDown,
  onResizeStart,
  onClick,
  onSelectElement,
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

  const renderChildren = () => (
    <>
      {childElements.map((child) => (
        <CanvasElementComponent
          key={child.id}
          element={child}
          isSelected={child.id === resolvedSelectedId}
          selectedId={resolvedSelectedId}
          isPreview={isPreview}
          onPointerDown={(event) => onPointerDown(event, child.id)}
          onResizeStart={(event, handle) => onResizeStart(event, child.id, handle)}
          onClick={(event) => {
            event.stopPropagation();
            onSelectElement(child.id);
          }}
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

  const containerDropHandlers = isPreview
    ? {}
    : {
        onDragOver: (event: React.DragEvent) => {
          if (canAcceptNestedDrop(element.type)) {
            event.preventDefault();
          }
        },
        onDrop: (event: React.DragEvent) => {
          if (onDrop) {
            onDrop(event, element.id);
          }
        },
      };

  const renderContent = () => {
    const resolvedType = normalizeCanvasElementType(element.type);

    switch (resolvedType) {
      case 'text':
        // V2 Hybrid: If editing, show Tiptap. Else show Preview.
        // We use Tiptap for both states to ensure WYSIWYG consistency if possible,
        // but for performance "Preview" might just be a read-only Tiptap.

      return (
        <div
          style={{ ...sharedStyle, width: '100%', height: '100%' }}
          onDoubleClick={onDoubleClick}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation();
          }}
        >
            <RichTextBlock
              key={`text-${element.id}`}
              elementId={element.id}
              content={p.content}
              onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditing && !isPreview}
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
          onDoubleClick={onDoubleClick}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation();
          }}
        >
            <RichTextBlock
            key={`heading-${element.id}`}
            elementId={element.id}
            content={p.content}
            onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditing && !isPreview}
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

      case 'image':
        return (
          <img
            src={p.src ?? 'https://via.placeholder.com/300x200?text=Add+Image'}
            alt={p.alt ?? ''}
            draggable={false}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              objectFit: p.objectFit ?? 'cover',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 0),
              pointerEvents: 'none', // Prevents image from capturing mouse events
              userSelect: 'none',
            }}
          />
        );

      case 'button':
        return (
          <button
            style={{
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
            }}
          >
            {p.label ?? 'Button'}
          </button>
        );

      case 'box':
      case 'container':
      case 'section':
      case 'header':
      case 'footer':
      case 'nav':
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

      case 'video':
        if (!p.src) {
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
          src={p.src}
          controls={isPreview ? (p.controls ?? true) : false}
          style={{
            ...sharedStyle,
            width: '100%',
            height: '100%',
            objectFit: p.objectFit ?? 'cover',
            pointerEvents: isPreview ? 'auto' : 'none',
          }}
        />
      );

      case 'embed':
        const embedSrc = normalizeEmbedUrl(p.src || p.url);
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
              📦 Set embed URL in properties
            </div>
          );
        }
        return (
          <iframe
            src={embedSrc}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              border: sharedStyle.border ?? 'none',
              pointerEvents: isPreview ? 'auto' : 'none',
            }}
            allowFullScreen
          />
        );

      case 'divider':
        const dividerThickness = p.thickness ?? '1px';
        const dividerColor = p.borderColor || p.color || '#e5e7eb';
        const dividerStyle = p.borderStyle || 'solid';
        return (
          <hr
            style={{
              ...sharedStyle,
              width: '100%',
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
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              width: '100%',
              height: '100%',
            }}
            >
              {fieldLabel ? (
                <label
                  style={{
                    color: p.color ?? sharedStyle.color ?? '#374151',
                    fontWeight: 500,
                  }}
                >
                  {fieldLabel}
                  {p.required ? ' *' : ''}
                </label>
              ) : null}
              <input
                type={p.inputType ?? 'text'}
                placeholder={p.placeholder ?? 'Enter text...'}
                value={p.value ?? ''}
                disabled={!isPreview}
                required={Boolean(p.required)}
                name={typeof p.name === 'string' ? p.name : undefined}
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
                readOnly
              />
              {helpText ? (
                <p style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: p.color ? `${p.color}cc` : '#6b7280',
                }}
                >
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
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              width: '100%',
              height: '100%',
            }}
            >
              {fieldLabel ? (
                <label
                  style={{
                    color: p.color ?? sharedStyle.color ?? '#374151',
                    fontWeight: 500,
                  }}
                >
                  {fieldLabel}
                  {p.required ? ' *' : ''}
                </label>
              ) : null}
              <textarea
                rows={Number(p.rows) || 4}
                placeholder={p.placeholder ?? 'Enter text...'}
                value={p.value ?? ''}
                disabled={!isPreview}
                required={Boolean(p.required)}
                name={typeof p.name === 'string' ? p.name : undefined}
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
                  resize: 'none',
                }}
                readOnly
              />
              {helpText ? (
                <p style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: p.color ? `${p.color}cc` : '#6b7280',
                }}
                >
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
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              width: '100%',
              height: '100%',
            }}
            >
              {fieldLabel ? (
                <label
                  style={{
                    color: p.color ?? sharedStyle.color ?? '#374151',
                    fontWeight: 500,
                  }}
                >
                  {fieldLabel}
                  {p.required ? ' *' : ''}
                </label>
              ) : null}
              <select
                value={p.value ?? p.defaultValue ?? selectOptions[0] ?? ''}
                disabled={!isPreview}
                required={Boolean(p.required)}
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
                {selectOptions.length ? (
                  selectOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))
                ) : (
                  <option value="">No options</option>
                )}
              </select>
              {helpText ? (
                <p style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: p.color ? `${p.color}cc` : '#6b7280',
                }}
                >
                  {helpText}
                </p>
              ) : null}
            </div>
          );
        }

      case 'checkbox':
      case 'radio':
        {
          const fieldLabel = formatFieldLabel(p.label);
          const helpText = formatHelpText(p.helpText);
          const optionItems = parseFormOptions(p.options);
          return (
            <div
              style={{
                ...sharedStyle,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxSizing: 'border-box',
              }}
            >
              {fieldLabel ? (
                <label style={{
                  color: p.color ?? sharedStyle.color ?? '#374151',
                  fontWeight: 500,
                }}
                >
                  {fieldLabel}
                  {p.required ? ' *' : ''}
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
                flexDirection: 'column',
                gap: 8,
                boxSizing: 'border-box',
              }}
              >
                {(optionItems.length ? optionItems : ['Option A']).map((option, optionIndex) => {
                  const isChecked = element.type === 'radio'
                    ? p.value === option
                    : Array.isArray(p.value)
                      ? p.value.includes(option)
                      : p.value === option;

                  return (
                    <label
                      key={`${element.id}-${option}-${optionIndex}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: p.fontSize ?? 14 }}
                    >
                      <input
                        type={element.type}
                        name={element.type === 'radio' ? `${element.id}-group` : undefined}
                        value={option}
                        checked={Boolean(isChecked)}
                        readOnly
                        onChange={() => {}}
                        style={{
                          pointerEvents: isPreview ? 'auto' : 'none',
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
                {helpText ? (
                  <p style={{
                    margin: 0,
                    marginTop: 6,
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: p.color ? `${p.color}cc` : '#6b7280',
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
        return (
          <a
            href={isPreview ? (p.href ?? '#') : undefined}
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

      case 'spacer':
        return (
          <div
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              backgroundColor: isPreview
                ? 'transparent'
                : p.backgroundColor ?? sharedStyle.backgroundColor ?? 'rgba(0,0,0,0.05)',
              border: isPreview ? 'none' : sharedStyle.border ?? '1px dashed #d1d5db',
            }}
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
        return (
          <div
            style={{ ...sharedStyle, width: '100%', height: '100%' }}
            onDoubleClick={onDoubleClick}
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
              isEditable={isEditing && !isPreview}
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
                marginLeft: toCssLength(p.listIndent ?? p.padding ?? 0),
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
            style={{ ...sharedStyle, width: '100%', height: '100%' }}
            onDoubleClick={onDoubleClick}
            onMouseDown={(e) => {
              if (isEditing) e.stopPropagation();
            }}
          >
            <RichTextBlock
              key={`quote-${element.id}`}
              elementId={element.id}
              content={p.content}
              onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditing && !isPreview}
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
          </div>
        );

      case 'form':
        return (
          <div
            onDragOver={(e) => {
              if (!isPreview && onDrop && canAcceptNestedDrop(element.type)) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              if (!isPreview && onDrop) {
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
              {p.formTitle ?? 'Form Container'}
            </div>
            <div style={{ ...sharedStyle, fontSize: 12, color: sharedStyle.color ?? '#6b7280' }}>
              Drag form elements here (inputs, buttons)
            </div>
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {renderChildren()}
            </div>

            {!isPreview && (
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
            )}
          </div>
        );

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
          onDoubleClick={onDoubleClick}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation();
          }}
        >
            <RichTextBlock
              key={`paragraph-${element.id}`}
              elementId={element.id}
              content={p.content}
              onChange={(val) => onUpdate({ content: val })}
              isEditable={isEditing && !isPreview}
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

      case 'map':
        const mapSrc = normalizeMapUrl(p.src || p.address);
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
            title={p.title || 'Map'}
            src={mapSrc}
            style={{
              ...sharedStyle,
              width: '100%',
              height: '100%',
              border: sharedStyle.border ?? 'none',
              borderRadius: sharedStyle.borderRadius ?? toCssLength(p.borderRadius ?? 8),
              pointerEvents: isPreview ? 'auto' : 'none',
            }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer"
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

  return (
      <div
      className={cn(
        'absolute',
        !isPreview && !isEditing && 'cursor-move select-none',
        isSelected && !isPreview && 'ring-2 ring-primary ring-offset-2'
      )}
      data-element-id={element.id}
      data-backy-text-editor={isTextElement ? 'true' : undefined}
      data-backy-text-editor-editable={String(isTextElement && isEditing && !isPreview)}
      style={{
        boxSizing: 'border-box',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex || 1,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        ...sharedStyle,
        opacity: sharedStyle.opacity ?? 1,
      }}
      onPointerDownCapture={(event) => {
        if (isEditing && isTextElement) {
          return;
        }
        onPointerDown(event, element.id);
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {renderContent()}

      {/* Resize Handles (only when selected and not in preview) */}
      {isSelected && !isPreview && (
        <>
          <ResizeHandle position="nw" onMouseDown={(e) => onResizeStart(e, 'nw')} />
          <ResizeHandle position="ne" onMouseDown={(e) => onResizeStart(e, 'ne')} />
          <ResizeHandle position="sw" onMouseDown={(e) => onResizeStart(e, 'sw')} />
          <ResizeHandle position="se" onMouseDown={(e) => onResizeStart(e, 'se')} />
        </>
      )}
    </div>
  );
}

// ============================================
// RESIZE HANDLE COMPONENT
// ============================================

interface ResizeHandleProps {
  position: 'nw' | 'ne' | 'sw' | 'se';
  onMouseDown: (e: React.MouseEvent) => void;
}

function ResizeHandle({ position, onMouseDown }: ResizeHandleProps) {
  const positionStyles: Record<string, React.CSSProperties> = {
    nw: { top: -4, left: -4, cursor: 'nw-resize' },
    ne: { top: -4, right: -4, cursor: 'ne-resize' },
    sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
    se: { bottom: -4, right: -4, cursor: 'se-resize' },
  };

  return (
    <div
      className="absolute w-3 h-3 bg-primary rounded-full hover:bg-primary/80 active:scale-110 transition-transform"
      style={positionStyles[position]}
      data-role="canvas-resize-handle"
      onMouseDown={onMouseDown}
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
    <div className="absolute bottom-4 left-4 bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">{element.type}</span>
        <span>X: {element.x}px</span>
        <span>Y: {element.y}px</span>
        <span>W: {element.width}px</span>
        <span>H: {element.height}px</span>
      </div>
    </div>
  );
}

export default Canvas;
