/**
 * ActiveEditorContext
 * 
 * Provides a way to share the active Plate editor instance and selection
 * between the Canvas and the PropertyPanel.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { PlateEditor } from '@udecode/plate/react';
import { Editor, Transforms, Element as SlateElement, Range, BaseSelection, Node, Text } from 'slate';
import { ReactEditor } from 'slate-react';

interface ActiveEditorContextType {
  /** The currently active Plate editor */
  activeEditor: PlateEditor | null;
  /** The currently active editor owner element id, if known */
  activeEditorElementId: string | null;
  /** Current active editor accessor for async-safe callers */
  getActiveEditor: () => PlateEditor | null;
  /** Current active editor owner element id accessor for async-safe callers */
  getActiveEditorElementId: () => string | null;
  /** Revision token that increments when selection state changes */
  selectionRevision: number;
  /** Register an editor as active */
  setActiveEditor: (editor: PlateEditor | null, elementId?: string | null) => void;
  /** Clear the active editor */
  clearActiveEditor: (editor?: PlateEditor | null) => void;
  /** Apply a mark to selection (restores selection if needed) */
  applyMark: (format: string, value?: any) => void;
  /** Toggle a mark on selection */
  toggleMark: (format: string) => void;
  /** Remove a mark from selection */
  removeMark: (format: string) => void;
  /** Set text alignment */
  setAlign: (align: string) => void;
  /** Toggle list */
  toggleList: (format: 'ul' | 'ol') => void;
  /** Increase list indent for selected list item(s) */
  indentList: () => void;
  /** Decrease list indent for selected list item(s) */
  outdentList: () => void;
  /** Insert plain text at current selection */
  insertText: (text: string) => void;
  /** Insert a link node at current selection */
  insertLink: (url: string) => void;
  /** Insert an image node at current selection */
  insertImage: (url: string) => void;
  /** Check if mark is active */
  isMarkActive: (format: string) => boolean;
  /** Whether a range selection is currently available for formatting */
  hasRangeSelection: () => boolean;
  /** Whether any selection (collapsed or not) is available */
  hasSelection: () => boolean;
  /** Restore a known selection (or full selection) into editor */
  restoreSelection: (options?: {
    /** Require a non-collapsed selection for commands that apply to selected text */
    requireTextSelection?: boolean;
  }) => boolean;
  /** Store current selection */
  storeSelection: () => void;
}

const ActiveEditorContext = createContext<ActiveEditorContextType>({
  activeEditor: null,
  activeEditorElementId: null,
  getActiveEditor: () => null,
  getActiveEditorElementId: () => null,
  selectionRevision: 0,
  setActiveEditor: () => { },
  clearActiveEditor: () => { },
  applyMark: () => { },
  toggleMark: () => { },
  removeMark: () => { },
  setAlign: () => { },
  toggleList: () => { },
  indentList: () => { },
  outdentList: () => { },
  insertText: () => { },
  insertLink: () => { },
  insertImage: () => { },
  isMarkActive: () => false,
  hasRangeSelection: () => false,
  hasSelection: () => false,
  restoreSelection: () => false,
  storeSelection: () => { },
});

interface RestoreSelectionOptions {
  requireTextSelection?: boolean;
}

export function ActiveEditorProvider({ children }: { children: React.ReactNode }) {
  const [activeEditor, setActiveEditorState] = useState<PlateEditor | null>(null);
  const [activeEditorElementId, setActiveEditorElementId] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const activeEditorRef = useRef<PlateEditor | null>(null);
  const activeEditorElementIdRef = useRef<string | null>(null);
  const storedSelection = useRef<BaseSelection | null>(null);
  const debug = useCallback((..._args: unknown[]) => {
  }, []);
  const describeSelection = useCallback((selection: BaseSelection | null) => {
    if (!selection || !Range.isRange(selection)) {
      return null;
    }

    return {
      anchor: { path: selection.anchor.path, offset: selection.anchor.offset },
      focus: { path: selection.focus.path, offset: selection.focus.offset },
      isCollapsed: Range.isCollapsed(selection),
    };
  }, []);

  const getActiveEditor = useCallback(() => {
    return activeEditorRef.current || activeEditor;
  }, [activeEditor]);

  const getActiveEditorElementId = useCallback(() => {
    return activeEditorElementIdRef.current;
  }, []);

  const setStoredSelection = useCallback((selection: BaseSelection | null) => {
    storedSelection.current = selection;
    setSelectionRevision((value) => value + 1);
  }, []);

  const setActiveEditor = useCallback((editor: PlateEditor | null, elementId: string | null = null) => {
    const normalizedElementId = editor ? elementId || null : null;
    debug('setActiveEditor', {
      hasEditor: !!editor,
      editorElementId: normalizedElementId,
      hasSelection: !!editor?.selection,
      activeEditorElementId: activeEditorElementIdRef.current,
      selection: describeSelection(editor?.selection || null),
    });
    activeEditorRef.current = editor;
    setActiveEditorState(editor);
    activeEditorElementIdRef.current = normalizedElementId;
    setActiveEditorElementId(normalizedElementId);
    setStoredSelection(editor?.selection || null);
  }, [setStoredSelection, debug, describeSelection]);

  const clearActiveEditor = useCallback((editor?: PlateEditor | null) => {
    if (editor && activeEditorRef.current && editor !== activeEditorRef.current) {
      debug('clearActiveEditor ignored (mismatch)', { hasCurrent: !!activeEditorRef.current });
      return;
    }

    debug('clearActiveEditor', {
      hasActiveEditorRef: !!activeEditorRef.current,
      activeEditorElementId: activeEditorElementIdRef.current,
      hasActiveState: !!activeEditor,
    });
    activeEditorElementIdRef.current = null;
    setActiveEditorElementId(null);
    activeEditorRef.current = null;
    setActiveEditorState(null);
    setStoredSelection(null);
  }, [setStoredSelection, activeEditor, debug]);

  // Store current selection
  const storeSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    const selection = editor.selection;
    if (!selection || !Range.isRange(selection)) {
      return;
    }

    debug('storeSelection', {
      selection: describeSelection(editor.selection),
    });
    setStoredSelection(selection);
  }, [debug, describeSelection, getActiveEditor, setStoredSelection]);

  const focusAndRestore = useCallback((options: RestoreSelectionOptions = {}) => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    const requireTextSelection = options.requireTextSelection === true;

    debug('focusAndRestore.start', {
      options,
      hadStoredSelection: !!storedSelection.current,
      storedSelection: describeSelection(storedSelection.current),
      hadLiveSelection: !!editor.selection,
    });

    try {
      let didRestoreStoredSelection = false;
      const restored = storedSelection.current;
      if (restored && Range.isRange(restored)
        && Node.has(editor as any, restored.anchor.path)
        && Node.has(editor as any, restored.focus.path)
      ) {
        try {
          Transforms.select(editor as any, restored);
          didRestoreStoredSelection = true;
        } catch (restoreError) {
          debug('focusAndRestore.select-restored-failed', {
            restoreError: (restoreError as Error)?.message || String(restoreError),
          });
          setStoredSelection(null);
        }
      }

      if (!didRestoreStoredSelection) {
        try {
          const start = Editor.start(editor as any, []);
          const end = Editor.end(editor as any, []);
          Transforms.select(editor as any, { anchor: start, focus: end });
        } catch (fallbackError) {
          debug('focusAndRestore.select-fallback-failed', {
            fallbackError: (fallbackError as Error)?.message || String(fallbackError),
          });
          return false;
        }
      }

      if (!didRestoreStoredSelection) {
        if (restored) {
          setStoredSelection(null);
        }
      }

      try {
        ReactEditor.focus(editor as any);
      } catch (focusError) {
        debug('focusAndRestore.focus-failed', {
          focusError: (focusError as Error)?.message || String(focusError),
        });
      }

      if (!editor.selection || !Range.isRange(editor.selection)) {
        return false;
      }

      if (requireTextSelection && Range.isCollapsed(editor.selection)) {
        debug('focusAndRestore.failed-collapsed', {
          selection: describeSelection(editor.selection),
        });
        return false;
      }

      debug('focusAndRestore.success', {
        selection: describeSelection(editor.selection),
        restoredFromStored: didRestoreStoredSelection,
      });
      setStoredSelection(editor.selection);
      return true;
    } catch (e) {
      console.warn("focusAndRestore selection-error:", e);
      return false;
    }
  }, [getActiveEditor, setStoredSelection, debug, describeSelection]);

  const restoreSelection = useCallback((options: RestoreSelectionOptions = {}) => {
    debug('restoreSelection', { ...options });
    return focusAndRestore(options);
  }, [focusAndRestore]);

  const getIsListNode = useCallback((node: unknown): node is SlateElement & { type: 'ul' | 'ol' } => {
    return (
      !Editor.isEditor(node) &&
      SlateElement.isElement(node) &&
      ['ul', 'ol'].includes((node as SlateElement & { type?: string }).type)
    );
  }, []);

  const getIsListItemNode = useCallback((node: unknown): node is SlateElement & { type: 'li' } => {
    return (
      !Editor.isEditor(node) &&
      SlateElement.isElement(node) &&
      (node as SlateElement & { type?: string }).type === 'li'
    );
  }, []);

  const getNonListBlockTypeForSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor || !editor.selection || !Range.isRange(editor.selection)) {
      return 'p';
    }

    const matching = Array.from(
      Editor.nodes(editor, {
        at: editor.selection,
        match: (node) =>
          SlateElement.isElement(node) &&
          !getIsListNode(node) &&
          !getIsListItemNode(node) &&
          Editor.isBlock(editor as any, node),
        mode: 'lowest',
      })
    );

    if (matching.length === 0) {
      return 'p';
    }

    const firstNode = matching[0][0] as SlateElement & { type?: string };
    const type = firstNode?.type;
    return (type === 'h1' || type === 'h2' || type === 'h3' || type === 'h4' || type === 'h5' || type === 'h6')
      ? type
      : 'p';
  }, [getActiveEditor, getIsListItemNode, getIsListNode]);

  const normalizeListTypeForSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor || !editor.selection || !Range.isRange(editor.selection)) {
      return null;
    }

    const listTypes = Array.from(
      Editor.nodes(editor, {
        at: editor.selection,
        match: (node) => getIsListNode(node),
        mode: 'lowest',
      })
    ).map(([node]) => {
      return getIsListNode(node) ? node.type : null;
    });

    return listTypes.length ? (listTypes[0] as 'ul' | 'ol' | null) : null;
  }, [getActiveEditor, getIsListNode]);

  const applyListIndent = useCallback((step: number) => {
    const editor = getActiveEditor();
    if (!editor) return;
    try {
      debug('applyListIndent.start', {
        step,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      if (!editor.selection || !Range.isRange(editor.selection)) return;

      const listItems = Array.from(
        Editor.nodes(editor, {
          at: editor.selection,
          match: (node) => getIsListItemNode(node),
          mode: 'lowest',
        })
      );

      if (listItems.length === 0) return;

      for (const [node, path] of listItems) {
        const next = Math.max(
          0,
          Number((node as any).indent || 0) + step
        );
        Transforms.setNodes(editor as any, { indent: next } as any, { at: path });
      }

      debug('applyListIndent.success', {
        step,
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('applyListIndent failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, getIsListItemNode, restoreSelection, setStoredSelection]);

  const isMarkActive = useCallback((format: string): boolean => {
    const editor = getActiveEditor();
    if (!editor) return false;
    try {
      const selection = editor.selection;
      if (!selection || !Range.isRange(selection)) {
        return false;
      }

      if (Range.isCollapsed(selection)) {
        const marks = Editor.marks(editor as any) as Record<string, any> | null;
        return marks ? !!marks[format] : false;
      }

      const textNodes = Array.from(
        Editor.nodes(editor, {
          at: selection,
          match: (node) => Text.isText(node),
          mode: 'all',
        })
      );

      if (!textNodes.length) {
        const marks = Editor.marks(editor as any) as Record<string, any> | null;
        return marks ? !!marks[format] : false;
      }

      for (const [node] of textNodes) {
        if (!(node as any)[format]) {
          return false;
        }
      }

      return true;
    } catch (e) {
      console.error('isMarkActive failed:', e);
      return false;
    }
  }, [getActiveEditor]);

  const hasRangeSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    const selection = editor.selection;
    return !!(selection && Range.isRange(selection) && !Range.isCollapsed(selection));
  }, [getActiveEditor]);

  const hasSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    const selection = editor.selection;
    return !!selection && Range.isRange(selection);
  }, [getActiveEditor]);

  const insertText = useCallback((text: string) => {
    const editor = getActiveEditor();
    if (!editor || !text) {
      return;
    }

    try {
      debug('insertText.start', {
        textLength: text.length,
        hasSelection: !!editor.selection,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      Transforms.insertText(editor as any, text);
      debug('insertText.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('insertText failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection]);

  const insertImage = useCallback((url: string) => {
    const editor = getActiveEditor();
    if (!editor || !url) {
      return;
    }

    try {
      debug('insertImage.start', {
        url,
        hasSelection: !!editor.selection,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      Transforms.insertNodes(
        editor as any,
        {
          type: 'img',
          url,
          children: [{ text: '' }],
        } as any
      );
      debug('insertImage.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('insertImage failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection]);

  const insertLink = useCallback((url: string) => {
    const editor = getActiveEditor();
    if (!editor || !url) {
      return;
    }

    try {
      debug('insertLink.start', {
        url,
        hasSelection: !!editor.selection,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      if (!editor.selection || !Range.isRange(editor.selection)) return;

      Transforms.wrapNodes(
        editor as any,
        { type: 'a', url, children: [] } as any,
        {
          split: true,
        }
      );
      debug('insertLink.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('insertLink failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection]);

  const applyMark = useCallback((format: string, value: any = true) => {
    const editor = getActiveEditor();
    if (!editor) return;
    try {
      debug('applyMark.start', {
        format,
        value,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) {
        return;
      }

      Editor.addMark(editor as any, format, value);
      debug('applyMark.success', {
        format,
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('applyMark failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection]);

  const toggleMark = useCallback((format: string) => {
    const editor = getActiveEditor();
    if (!editor) return;
    try {
      debug('toggleMark.start', {
        format,
        wasActive: isMarkActive(format),
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) {
        return;
      }

      if (isMarkActive(format)) {
        Editor.removeMark(editor as any, format);
      } else {
        Editor.addMark(editor as any, format, true);
      }
      debug('toggleMark.success', {
        format,
        nowActive: isMarkActive(format),
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('toggleMark failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, isMarkActive, setStoredSelection]);

  const removeMark = useCallback((format: string) => {
    const editor = getActiveEditor();
    if (!editor) return;
    try {
      debug('removeMark.start', {
        format,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) {
        return;
      }

      Editor.removeMark(editor as any, format);
      debug('removeMark.success', {
        format,
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('removeMark failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection]);

  const setAlign = useCallback((align: string) => {
    const editor = getActiveEditor();
    if (!editor) return;
    try {
      debug('setAlign.start', {
        align,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      Transforms.setNodes(editor as any, { align } as any, {
        match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor as any, n),
      });
      debug('setAlign.success', {
        align,
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('setAlign failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection]);

  const toggleList = useCallback((format: 'ul' | 'ol') => {
    const editor = getActiveEditor();
    if (!editor) return;
    try {
      debug('toggleList.start', {
        format,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      if (!editor.selection || !Range.isRange(editor.selection)) return;

      const currentListType = normalizeListTypeForSelection();
      if (currentListType === format) {
        const baseType = getNonListBlockTypeForSelection();
        Transforms.unwrapNodes(editor as any, {
          match: (n) => getIsListNode(n),
          split: true,
        });
        Transforms.setNodes(editor as any, { type: 'p' } as any, {
          match: (n) => getIsListItemNode(n),
        });
        if (baseType && baseType !== 'p') {
          Transforms.setNodes(editor as any, { type: baseType } as any, {
            match: (n) => getIsListItemNode(n),
          });
        }
        debug('toggleList.success', {
          format,
          action: 'unwrap',
          selection: describeSelection(editor.selection || null),
        });
        setStoredSelection(editor.selection || null);
        return;
      }

      Transforms.unwrapNodes(editor as any, {
        match: (n) => getIsListNode(n),
        split: true,
      });
      Transforms.setNodes(editor as any, { indent: 0 } as any, {
        match: (n) => getIsListItemNode(n),
      });
      Transforms.setNodes(editor as any, { type: 'li' } as any, {
        match: (n) => SlateElement.isElement(n),
      });
      Transforms.wrapNodes(editor as any, { type: format, children: [] } as any);
      debug('toggleList.success', {
        format,
        action: 'apply',
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
    } catch (e) {
      console.warn('toggleList failed:', e);
    }
  }, [
    getActiveEditor,
    getIsListNode,
    getIsListItemNode,
    getNonListBlockTypeForSelection,
    normalizeListTypeForSelection,
    restoreSelection,
    setStoredSelection,
    debug,
    describeSelection,
  ]);

  const indentList = useCallback(() => {
    applyListIndent(1);
  }, [applyListIndent]);

  const outdentList = useCallback(() => {
    applyListIndent(-1);
  }, [applyListIndent]);

  return (
    <ActiveEditorContext.Provider value={{
      activeEditor,
      getActiveEditor,
      getActiveEditorElementId,
      activeEditorElementId,
      selectionRevision,
      setActiveEditor,
      clearActiveEditor,
      applyMark,
      toggleMark,
      removeMark,
      setAlign,
      toggleList,
      indentList,
      outdentList,
      insertText,
      insertLink,
      insertImage,
      isMarkActive,
      hasRangeSelection,
      hasSelection,
      storeSelection,
      restoreSelection,
    }}>
      {children}
    </ActiveEditorContext.Provider>
  );
}

export function useActiveEditor() {
  return useContext(ActiveEditorContext);
}

export default ActiveEditorContext;
