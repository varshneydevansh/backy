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

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Eye,
  Monitor,
  Tablet,
  Smartphone,
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
import type {
  CanvasElement,
  CanvasSize,
  ComponentLibraryItem,
} from '@/types/editor';

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
  // Load fonts
  useEffect(() => {
    const fonts = [
      'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins',
      'Montserrat', 'Playfair Display', 'Merriweather',
      'Georgia', 'Fira Code', 'Arial', 'Helvetica'
    ];

    // Check if fonts are already loaded
    if (document.getElementById('backy-editor-fonts')) return;

    const link = document.createElement('link');
    link.id = 'backy-editor-fonts';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${fonts.map(f => `family=${f.replace(' ', '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&`).join('')}display=swap`;
    document.head.appendChild(link);

    return () => {
      // Optional: cleanup
    };
  }, []);

  // Canvas state
  const [elements, setElements] = useState<CanvasElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [size, setSize] = useState<CanvasSize>(initialSize || DEFAULT_CANVAS_SIZE);
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isPreview, setIsPreview] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Undo/Redo State
  const [history, setHistory] = useState<CanvasElement[][]>([initialElements]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>(initialSettings);

  // Clipboard State
  const [clipboardElement, setClipboardElement] = useState<CanvasElement | null>(
    null
  );
  const [canvasScale, setCanvasScale] = useState(1);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

  // Sync changes to parent
  useEffect(() => {
    if (onChange) {
      onChange(elements, pageSettings, size);
    }
  }, [elements, pageSettings, onChange, size]);

  /**
   * Add current state to history
   */
  const addToHistory = useCallback((newElements: CanvasElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);

    // Limit history size to 50
    if (newHistory.length > 50) {
      newHistory.shift();
    }

    setHistory(newHistory);
    // Since we just sliced and pushed, the index is the last one
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  /**
   * Undo
   */
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
    }
  }, [historyIndex, history]);

  /**
   * Redo
   */
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
    }
  }, [historyIndex, history]);

  /**
   * Wrapper for updating elements with history
   */
  const updateElementsWithHistory = useCallback((newElements: CanvasElement[]) => {
    setElements(newElements);
    addToHistory(newElements);
    setHasUnsavedChanges(true);
  }, [addToHistory]);

  /**
   * Copy
   */
  const handleCopy = useCallback(() => {
    if (selectedId) {
      const el = elements.find((e) => e.id === selectedId);
      if (el) {
        setClipboardElement(el);
        // Optional: Show toast or feedback
      }
    }
  }, [selectedId, elements]);

  const normalizePastedElement = useCallback(
    (sourceElement: CanvasElement, x = 20, y = 20): CanvasElement => {
      const clone = JSON.parse(JSON.stringify(sourceElement)) as CanvasElement;
      const highestZ = elements.reduce((max, item) => Math.max(max, item.zIndex || 1), 1);

      return {
        ...clone,
        id: generateId(),
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
      const newElements = [...elements, newElement];
      updateElementsWithHistory(newElements);
      setSelectedId(newElement.id);
    }
  }, [clipboardElement, elements, normalizePastedElement, updateElementsWithHistory]);

  const handleDuplicate = useCallback(() => {
    if (!selectedId) return;
    const selectedElement = elements.find((element) => element.id === selectedId);
    if (!selectedElement) return;

    const duplicate = normalizePastedElement(selectedElement);
    const newElements = [...elements, duplicate];
    updateElementsWithHistory(newElements);
    setSelectedId(duplicate.id);
  }, [elements, normalizePastedElement, selectedId, updateElementsWithHistory]);

  // Get selected element
  const selectedElement = elements.find((el) => el.id === selectedId) || null;

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
    (updates: Partial<CanvasElement>) => {
      if (!selectedId) return;

      const updatedElements = elements.map((el) =>
        el.id === selectedId ? { ...el, ...updates } : el
      );
      updateElementsWithHistory(updatedElements);
    },
    [selectedId, elements, updateElementsWithHistory]
  );

  /**
   * Handle drag start from component library
   */
  const handleDragStart = useCallback((item: ComponentLibraryItem) => {
    // Store the item type for drop handling
    // This would be used with a proper drag-and-drop library
    console.log('Dragging:', item.type);
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

        // Calculate drop position relative to canvas
        const canvas = e.currentTarget as HTMLDivElement;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Create new element
        const newElement = createCanvasElement(item.type, x, y);
        const newElements = [...elements, newElement];

        updateElementsWithHistory(newElements);
        setSelectedId(newElement.id);
      } catch (err) {
        console.error('Failed to drop element:', err);
      }
    },
    [elements, updateElementsWithHistory]
  );

  /**
   * Delete selected element
   */
  const deleteElement = useCallback(() => {
    if (!selectedId) return;
    const newElements = elements.filter((el) => el.id !== selectedId);
    updateElementsWithHistory(newElements);
    setSelectedId(null);
  }, [selectedId, elements, updateElementsWithHistory]);

  /**
   * Handle save
   */
  /**
   * Handle save
   */
  const handleSaveWrapper = useCallback(() => {
    onSave(elements, pageSettings, size);
    setHasUnsavedChanges(false);
  }, [elements, pageSettings, onSave, size]);

  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  }, [deleteElement, handleSaveWrapper, handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, isPreview]);



  /**
   * Handle breakpoint change
   */
  const handleBreakpointChange = useCallback(
    (bp: 'desktop' | 'tablet' | 'mobile') => {
      setBreakpoint(bp);
      setSize(BREAKPOINT_CANVAS_SIZE[bp]);
    },
    []
  );

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
            {/* Undo/Redo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo className="w-4 h-4" />
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
                className="p-2 rounded-lg hover:bg-accent"
                title="Page settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            <div className="w-px h-6 bg-border mx-1" />

            {/* Save */}
            {/* Save */}
            {!hideSave && (
              <button
                type="button"
                onClick={handleSaveWrapper}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                title="Save Page (Ctrl+S)"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
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
            setHasUnsavedChanges(true);
          }}
        />
      </div>
    </ActiveEditorProvider>
  );
}
