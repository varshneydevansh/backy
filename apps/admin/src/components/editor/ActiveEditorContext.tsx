/**
 * ActiveEditorContext
 * 
 * Provides a way to share the active Plate editor instance and selection
 * between the Canvas and the PropertyPanel.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
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
  /** Toggle blockquote for selected block(s) */
  toggleBlockquote: () => void;
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
  /** Insert a basic table at current selection */
  insertTable: () => boolean;
  /** Insert a table row below the current table row */
  addTableRow: () => boolean;
  /** Insert a table column to the right of the current table cell */
  addTableColumn: () => boolean;
  /** Remove the current table row when the table has more than one row */
  removeTableRow: () => boolean;
  /** Remove the current table column when rows have more than one column */
  removeTableColumn: () => boolean;
  /** Toggle the current table row between body cells and header cells */
  toggleTableHeaderRow: () => boolean;
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
  /** Register a content sync callback for an editor-owned canvas element */
  registerContentSync: (
    elementId: string | null,
    editor: PlateEditor | null,
    sync: (editor: PlateEditor) => void
  ) => () => void;
  /** Flush the active editor's current Slate tree into its owning element */
  syncActiveEditorContent: () => void;
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
  toggleBlockquote: () => { },
  toggleList: () => { },
  indentList: () => { },
  outdentList: () => { },
  insertText: () => { },
  insertLink: () => { },
  insertImage: () => { },
  insertTable: () => false,
  addTableRow: () => false,
  addTableColumn: () => false,
  removeTableRow: () => false,
  removeTableColumn: () => false,
  toggleTableHeaderRow: () => false,
  isMarkActive: () => false,
  hasRangeSelection: () => false,
  hasSelection: () => false,
  restoreSelection: () => false,
  storeSelection: () => { },
  registerContentSync: () => () => { },
  syncActiveEditorContent: () => { },
});

export const ACTIVE_EDITOR_CONTENT_SYNC_EVENT = 'backy-active-editor-content-sync';

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
  const contentSyncCallbacks = useRef(new Map<string, {
    editor: PlateEditor;
    sync: (editor: PlateEditor) => void;
  }>());
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

  const cloneSelection = useCallback((selection: BaseSelection | null) => {
    if (!selection || !Range.isRange(selection)) {
      return null;
    }

    return {
      anchor: {
        path: [...selection.anchor.path],
        offset: selection.anchor.offset,
      },
      focus: {
        path: [...selection.focus.path],
        offset: selection.focus.offset,
      },
    } as BaseSelection;
  }, []);

  const getActiveEditor = useCallback(() => {
    return activeEditorRef.current || activeEditor;
  }, [activeEditor]);

  const getActiveEditorElementId = useCallback(() => {
    return activeEditorElementIdRef.current;
  }, []);

  const setStoredSelection = useCallback((selection: BaseSelection | null) => {
    storedSelection.current = cloneSelection(selection);
    setSelectionRevision((value) => value + 1);
  }, [cloneSelection]);

  const registerContentSync = useCallback((
    elementId: string | null,
    editor: PlateEditor | null,
    sync: (editor: PlateEditor) => void
  ) => {
    if (!elementId || !editor) {
      return () => { };
    }

    const entry = { editor, sync };
    contentSyncCallbacks.current.set(elementId, entry);

    return () => {
      const current = contentSyncCallbacks.current.get(elementId);
      if (current === entry) {
        contentSyncCallbacks.current.delete(elementId);
      }
    };
  }, []);

  const syncActiveEditorContent = useCallback(() => {
    const elementId = activeEditorElementIdRef.current;
    const editor = activeEditorRef.current;
    if (!elementId || !editor) {
      return;
    }

    const entry = contentSyncCallbacks.current.get(elementId);
    if (entry) {
      entry.sync(editor);
    }

    if (typeof window !== 'undefined') {
      const content = JSON.parse(JSON.stringify((editor as any).children || []));
      window.dispatchEvent(new CustomEvent(ACTIVE_EDITOR_CONTENT_SYNC_EVENT, {
        detail: {
          elementId,
          content,
        },
      }));
    }
  }, []);

  const syncActiveEditorContentSoon = useCallback(() => {
    syncActiveEditorContent();
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        syncActiveEditorContent();
      });
    }
  }, [syncActiveEditorContent]);

  const createDefaultTableNode = useCallback(() => {
    const cellTexts = [
      ['Column 1', 'Column 2'],
      ['Value 1', 'Value 2'],
    ];

    return {
      type: 'table',
      children: cellTexts.map((row) => ({
        type: 'tr',
        children: row.map((text) => ({
          type: 'td',
          children: [
            {
              type: 'p',
              children: [{ text }],
            },
          ],
        })),
      })),
    } as any;
  }, []);

  const createEmptyTableCellNode = useCallback(() => {
    return {
      type: 'td',
      children: [
        {
          type: 'p',
          children: [{ text: '' }],
        },
      ],
    } as any;
  }, []);

  const insertDefaultTableNode = useCallback((editor: PlateEditor) => {
    const tableNode = createDefaultTableNode();
    Transforms.insertNodes(editor as any, tableNode, { select: true });

    const tableEntry = Array.from(
      Editor.nodes(editor as any, {
        at: [],
        match: (node) => SlateElement.isElement(node) && (node as any).type === 'table',
      })
    ).at(-1);

    if (tableEntry) {
      const [, tablePath] = tableEntry as [unknown, number[]];
      try {
        Transforms.select(editor as any, Editor.end(editor as any, tablePath));
      } catch {
        // Selection is best-effort after insertion; the table content is already present.
      }
    }

    return !!tableEntry;
  }, [createDefaultTableNode]);

  const getSelectedTableContext = useCallback((editor: PlateEditor) => {
    const selection = (editor as any).selection;
    if (!selection || !Range.isRange(selection)) {
      return null;
    }

    const cellEntry = Editor.above(editor as any, {
      at: selection,
      match: (node) => SlateElement.isElement(node) && ((node as any).type === 'td' || (node as any).type === 'th'),
    });

    if (!cellEntry) {
      return null;
    }

    const [, cellPath] = cellEntry as [unknown, number[]];
    const rowEntry = Editor.above(editor as any, {
      at: cellPath,
      match: (node) => SlateElement.isElement(node) && (node as any).type === 'tr',
    });
    const tableEntry = Editor.above(editor as any, {
      at: cellPath,
      match: (node) => SlateElement.isElement(node) && (node as any).type === 'table',
    });

    if (!rowEntry || !tableEntry) {
      return null;
    }

    const [rowNode, rowPath] = rowEntry as [SlateElement, number[]];
    const [tableNode, tablePath] = tableEntry as [SlateElement, number[]];
    const cellIndex = cellPath[cellPath.length - 1] || 0;
    const rowIndex = rowPath[rowPath.length - 1] || 0;
    const columnCount = Math.max(1, Array.isArray((rowNode as any).children) ? (rowNode as any).children.length : 1);

    return {
      cellPath,
      cellIndex,
      rowNode,
      rowPath,
      rowIndex,
      tableNode,
      tablePath,
      columnCount,
    };
  }, []);

  const insertTableRowBelow = useCallback((editor: PlateEditor) => {
    const context = getSelectedTableContext(editor);
    if (!context) {
      return false;
    }

    const nextRowPath = [
      ...context.rowPath.slice(0, -1),
      context.rowPath[context.rowPath.length - 1] + 1,
    ];
    const rowNode = {
      type: 'tr',
      children: Array.from({ length: context.columnCount }, () => createEmptyTableCellNode()),
    } as any;

    Transforms.insertNodes(editor as any, rowNode, { at: nextRowPath, select: true });
    try {
      Transforms.select(editor as any, Editor.start(editor as any, [...nextRowPath, 0]));
    } catch {
      // Selection is best-effort after row insertion.
    }
    return true;
  }, [createEmptyTableCellNode, getSelectedTableContext]);

  const insertTableColumnRight = useCallback((editor: PlateEditor) => {
    const context = getSelectedTableContext(editor);
    if (!context) {
      return false;
    }

    const insertIndex = context.cellIndex + 1;
    const rowCount = Array.isArray((context.tableNode as any).children) ? (context.tableNode as any).children.length : 0;
    for (let rowIndex = rowCount - 1; rowIndex >= 0; rowIndex -= 1) {
      const rowPath = [...context.tablePath, rowIndex];
      const rowNode = Node.get(editor as any, rowPath) as any;
      const rowChildren = Array.isArray(rowNode?.children) ? rowNode.children : [];
      const boundedInsertIndex = Math.max(0, Math.min(insertIndex, rowChildren.length));
      Transforms.insertNodes(editor as any, createEmptyTableCellNode(), {
        at: [...rowPath, boundedInsertIndex],
      });
    }

    try {
      Transforms.select(editor as any, Editor.start(editor as any, [...context.rowPath, insertIndex]));
    } catch {
      // Selection is best-effort after column insertion.
    }
    return rowCount > 0;
  }, [createEmptyTableCellNode, getSelectedTableContext]);

  const removeSelectedTableRow = useCallback((editor: PlateEditor) => {
    const context = getSelectedTableContext(editor);
    if (!context) {
      return false;
    }

    const rows = Array.isArray((context.tableNode as any).children) ? (context.tableNode as any).children : [];
    if (rows.length <= 1) {
      return false;
    }

    const nextRowIndex = Math.min(context.rowIndex, rows.length - 2);
    const nextColumnIndex = Math.min(context.cellIndex, Math.max(0, context.columnCount - 1));
    Transforms.removeNodes(editor as any, { at: context.rowPath });
    try {
      Transforms.select(editor as any, Editor.start(editor as any, [...context.tablePath, nextRowIndex, nextColumnIndex]));
    } catch {
      // Selection is best-effort after row removal.
    }
    return true;
  }, [getSelectedTableContext]);

  const removeSelectedTableColumn = useCallback((editor: PlateEditor) => {
    const context = getSelectedTableContext(editor);
    if (!context) {
      return false;
    }

    const rows = Array.isArray((context.tableNode as any).children) ? (context.tableNode as any).children : [];
    const canRemoveColumn = rows.some((row: any) => Array.isArray(row?.children) && row.children.length > 1);
    if (!canRemoveColumn || context.columnCount <= 1) {
      return false;
    }

    const removeIndex = context.cellIndex;
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
      const rowPath = [...context.tablePath, rowIndex];
      const rowNode = Node.get(editor as any, rowPath) as any;
      const rowChildren = Array.isArray(rowNode?.children) ? rowNode.children : [];
      if (rowChildren.length <= 1) {
        continue;
      }

      const boundedRemoveIndex = Math.max(0, Math.min(removeIndex, rowChildren.length - 1));
      Transforms.removeNodes(editor as any, { at: [...rowPath, boundedRemoveIndex] });
    }

    try {
      const nextColumnIndex = Math.max(0, Math.min(removeIndex, context.columnCount - 2));
      Transforms.select(editor as any, Editor.start(editor as any, [...context.rowPath, nextColumnIndex]));
    } catch {
      // Selection is best-effort after column removal.
    }
    return true;
  }, [getSelectedTableContext]);

  const toggleSelectedTableHeaderRow = useCallback((editor: PlateEditor) => {
    const context = getSelectedTableContext(editor);
    if (!context) {
      return false;
    }

    const rowChildren = Array.isArray((context.rowNode as any).children) ? (context.rowNode as any).children : [];
    if (rowChildren.length === 0) {
      return false;
    }

    const shouldApplyHeader = rowChildren.some((cell: any) => cell?.type !== 'th');
    rowChildren.forEach((cell: any, index: number) => {
      if (cell?.type === 'td' || cell?.type === 'th') {
        Transforms.setNodes(editor as any, { type: shouldApplyHeader ? 'th' : 'td' } as any, {
          at: [...context.rowPath, index],
        });
      }
    });

    try {
      Transforms.select(editor as any, Editor.start(editor as any, context.cellPath));
    } catch {
      // Selection is best-effort after header-row toggle.
    }
    return true;
  }, [getSelectedTableContext]);

  const readDomSelectionAsSlateRange = useCallback((editor: PlateEditor) => {
    if (typeof window === 'undefined') {
      return null;
    }

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      return null;
    }

    try {
      const domRange = domSelection.getRangeAt(0);
      const slateRange = ReactEditor.toSlateRange(editor as any, domRange, {
        exactMatch: false,
        suppressThrow: true,
      } as any);
      return slateRange && Range.isRange(slateRange) ? slateRange : null;
    } catch (error) {
      debug('readDomSelectionAsSlateRange.failed', {
        error: (error as Error)?.message || String(error),
      });
      return null;
    }
  }, [debug]);

  const setActiveEditor = useCallback((editor: PlateEditor | null, elementId: string | null = null) => {
    const normalizedElementId = editor ? elementId || null : null;
    const previousEditor = activeEditorRef.current;
    const previousElementId = activeEditorElementIdRef.current;
    const incomingSelection = editor?.selection || null;
    const storedRange = storedSelection.current;
    const shouldPreserveStoredRange = !!editor
      && previousEditor === editor
      && previousElementId === normalizedElementId
      && storedRange
      && Range.isRange(storedRange)
      && !Range.isCollapsed(storedRange)
      && Node.has(editor as any, storedRange.anchor.path)
      && Node.has(editor as any, storedRange.focus.path)
      && (!incomingSelection || !Range.isRange(incomingSelection) || Range.isCollapsed(incomingSelection));

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
    if (!shouldPreserveStoredRange) {
      setStoredSelection(incomingSelection);
    }
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

    const domSelection = readDomSelectionAsSlateRange(editor);
    const selection = domSelection || editor.selection;
    if (!selection || !Range.isRange(selection)) {
      return;
    }

    if (
      !Node.has(editor as any, selection.anchor.path) ||
      !Node.has(editor as any, selection.focus.path)
    ) {
      return;
    }

    debug('storeSelection', {
      selection: describeSelection(selection),
      source: domSelection ? 'dom' : 'editor',
    });
    setStoredSelection(selection);
  }, [debug, describeSelection, getActiveEditor, readDomSelectionAsSlateRange, setStoredSelection]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isLocalEditorHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (!isLocalEditorHost) {
      return;
    }

    const targetWindow = window as typeof window & {
      __backySelectActiveEditorText?: (startNeedle: string, endNeedle?: string) => unknown;
      __backyReplaceActiveEditorText?: (text: string) => unknown;
      __backySetActiveEditorContent?: (content: unknown) => unknown;
      __backyCollapseActiveEditorToEnd?: () => unknown;
      __backyInsertActiveEditorTable?: () => unknown;
      __backySelectActiveEditorTableCell?: (needle: string) => unknown;
      __backyReadActiveEditorTableState?: () => unknown;
    };

    targetWindow.__backyCollapseActiveEditorToEnd = () => {
      const editor = getActiveEditor();
      if (!editor) {
        return { ok: false, reason: 'missing-editor' };
      }

      try {
        const end = Editor.end(editor as any, []);
        Transforms.select(editor as any, end);
        setStoredSelection(editor.selection || null);
        return {
          ok: true,
          text: Editor.string(editor as any, []),
          selection: describeSelection(editor.selection || null),
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'collapse-end-failed',
          error: (error as Error)?.message || String(error),
        };
      }
    };

    targetWindow.__backyInsertActiveEditorTable = () => {
      const editor = getActiveEditor();
      if (!editor) {
        return { ok: false, reason: 'missing-editor' };
      }

      try {
        const inserted = insertDefaultTableNode(editor);
        setStoredSelection(editor.selection || null);
        syncActiveEditorContentSoon();

        return {
          ok: inserted,
          text: Editor.string(editor as any, []),
          selection: describeSelection(editor.selection || null),
          childTypes: ((editor as any).children || []).map((node: { type?: string }) => node?.type || ''),
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'insert-table-failed',
          error: (error as Error)?.message || String(error),
          childTypes: ((editor as any).children || []).map((node: { type?: string }) => node?.type || ''),
        };
      }
    };

    targetWindow.__backyReadActiveEditorTableState = () => {
      const editor = getActiveEditor();
      if (!editor) {
        return { ok: false, reason: 'missing-editor' };
      }

      try {
        const types = Array.from(
          Editor.nodes(editor as any, {
            at: [],
            match: (node) => SlateElement.isElement(node),
          })
        ).map(([node, path]) => ({
          type: (node as { type?: string }).type || '',
          path,
          text: Editor.string(editor as any, path as any),
        }));
        return {
          ok: true,
          selection: describeSelection(editor.selection || null),
          types,
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'read-table-state-failed',
          error: (error as Error)?.message || String(error),
        };
      }
    };

    targetWindow.__backySelectActiveEditorTableCell = (needle: string) => {
      const editor = getActiveEditor();
      if (!editor || !needle) {
        return { ok: false, reason: !editor ? 'missing-editor' : 'missing-needle' };
      }

      try {
        const cellEntry = Array.from(
          Editor.nodes(editor as any, {
            at: [],
            match: (node) => SlateElement.isElement(node) && ((node as any).type === 'td' || (node as any).type === 'th'),
          })
        ).find(([, path]) => Editor.string(editor as any, path as any).includes(needle));

        if (!cellEntry) {
          return {
            ok: false,
            reason: 'missing-cell',
            needle,
            text: Editor.string(editor as any, []),
          };
        }

        const [, cellPath] = cellEntry as [unknown, number[]];
        const nextSelection = {
          anchor: Editor.start(editor as any, cellPath),
          focus: Editor.end(editor as any, cellPath),
        };
        Transforms.select(editor as any, nextSelection);
        setStoredSelection(nextSelection);
        return {
          ok: true,
          text: Editor.string(editor as any, nextSelection),
          selection: describeSelection(nextSelection),
          cellPath,
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'select-table-cell-failed',
          error: (error as Error)?.message || String(error),
        };
      }
    };

    targetWindow.__backySetActiveEditorContent = (content: unknown) => {
      const editor = getActiveEditor();
      if (!editor) {
        return { ok: false, reason: 'missing-editor' };
      }

      if (!Array.isArray(content) || content.length === 0) {
        return { ok: false, reason: 'invalid-content' };
      }

      try {
        const nextContent = JSON.parse(JSON.stringify(content));
        while (Array.isArray((editor as any).children) && (editor as any).children.length > 0) {
          Transforms.removeNodes(editor as any, { at: [0] });
        }
        Transforms.insertNodes(editor as any, nextContent as any, { at: [0] });
        Transforms.select(editor as any, {
          anchor: Editor.start(editor as any, []),
          focus: Editor.end(editor as any, []),
        });
        setStoredSelection(editor.selection || null);
        syncActiveEditorContentSoon();
        return {
          ok: true,
          text: Editor.string(editor as any, []),
          selection: describeSelection(editor.selection || null),
          childTypes: ((editor as any).children || []).map((node: { type?: string }) => node?.type || ''),
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'set-content-failed',
          error: (error as Error)?.message || String(error),
        };
      }
    };

    targetWindow.__backyReplaceActiveEditorText = (text: string) => {
      const editor = getActiveEditor();
      if (!editor) {
        return { ok: false, reason: 'missing-editor' };
      }

      try {
        const start = Editor.start(editor as any, []);
        const end = Editor.end(editor as any, []);
        Transforms.select(editor as any, { anchor: start, focus: end });
        Transforms.delete(editor as any);

        for (const mark of [
          'bold',
          'italic',
          'underline',
          'strikethrough',
          'code',
          'fontSize',
          'fontFamily',
          'color',
          'backgroundColor',
        ]) {
          Editor.removeMark(editor as any, mark);
        }

        Transforms.insertText(editor as any, text || '');
        setStoredSelection(editor.selection || null);
        syncActiveEditorContentSoon();
        return {
          ok: true,
          text: Editor.string(editor as any, []),
          selection: describeSelection(editor.selection || null),
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'replace-failed',
          error: (error as Error)?.message || String(error),
          text: Editor.string(editor as any, []),
        };
      }
    };

    targetWindow.__backySelectActiveEditorText = (startNeedle: string, endNeedle?: string) => {
      const editor = getActiveEditor();
      if (!editor || !startNeedle) {
        return { ok: false, reason: !editor ? 'missing-editor' : 'missing-start-needle' };
      }

      const fullText = Editor.string(editor as any, []);
      const startIndex = fullText.indexOf(startNeedle);
      const endText = endNeedle || startNeedle;
      const endIndex = fullText.indexOf(endText, Math.max(0, startIndex));
      if (startIndex < 0 || endIndex < 0) {
        return {
          ok: false,
          reason: 'missing-needle',
          fullText,
          startNeedle,
          endNeedle: endText,
        };
      }

      try {
        const resolvePoint = (targetOffset: number) => {
          let offset = 0;
          const textEntries = Array.from(
            Editor.nodes(editor as any, {
              at: [],
              match: (node) => Text.isText(node),
              mode: 'all',
            })
          );

          for (const [node, path] of textEntries) {
            const text = Text.isText(node) ? node.text : '';
            const nextOffset = offset + text.length;
            if (targetOffset <= nextOffset) {
              return {
                path,
                offset: Math.max(0, Math.min(text.length, targetOffset - offset)),
              };
            }
            offset = nextOffset;
          }

          const lastEntry = textEntries[textEntries.length - 1];
          if (!lastEntry) {
            return Editor.start(editor as any, []);
          }

          const [lastNode, lastPath] = lastEntry;
          return {
            path: lastPath,
            offset: Text.isText(lastNode) ? lastNode.text.length : 0,
          };
        };
        const start = resolvePoint(startIndex);
        const end = resolvePoint(endIndex + endText.length);
        const nextSelection = { anchor: start, focus: end };
        Transforms.select(editor as any, nextSelection);
        setStoredSelection(nextSelection);
        return {
          ok: true,
          fullText,
          selectedText: Editor.string(editor as any, nextSelection),
          selection: describeSelection(nextSelection),
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'select-failed',
          error: (error as Error)?.message || String(error),
          fullText,
        };
      }
    };

    return () => {
      if (targetWindow.__backySelectActiveEditorText) {
        delete targetWindow.__backySelectActiveEditorText;
      }
      if (targetWindow.__backyReplaceActiveEditorText) {
        delete targetWindow.__backyReplaceActiveEditorText;
      }
      if (targetWindow.__backySetActiveEditorContent) {
        delete targetWindow.__backySetActiveEditorContent;
      }
      if (targetWindow.__backyCollapseActiveEditorToEnd) {
        delete targetWindow.__backyCollapseActiveEditorToEnd;
      }
      if (targetWindow.__backyInsertActiveEditorTable) {
        delete targetWindow.__backyInsertActiveEditorTable;
      }
      if (targetWindow.__backySelectActiveEditorTableCell) {
        delete targetWindow.__backySelectActiveEditorTableCell;
      }
      if (targetWindow.__backyReadActiveEditorTableState) {
        delete targetWindow.__backyReadActiveEditorTableState;
      }
    };
  }, [describeSelection, getActiveEditor, insertDefaultTableNode, setStoredSelection, syncActiveEditorContentSoon]);

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
      const domSelectionRange = readDomSelectionAsSlateRange(editor);
      const shouldPreferDomRange = !!domSelectionRange && (
        !restored ||
        !Range.isRange(restored) ||
        Range.isCollapsed(restored) ||
        !Node.has(editor as any, restored.anchor.path) ||
        !Node.has(editor as any, restored.focus.path)
      );

      if (shouldPreferDomRange && domSelectionRange) {
        try {
          Transforms.select(editor as any, domSelectionRange);
          didRestoreStoredSelection = true;
        } catch (restoreDomError) {
          debug('focusAndRestore.select-dom-failed', {
            restoreDomError: (restoreDomError as Error)?.message || String(restoreDomError),
          });
        }
      }

      if (!didRestoreStoredSelection && restored && Range.isRange(restored)
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
    const type = (node as SlateElement & { type?: unknown }).type;
    return (
      !Editor.isEditor(node) &&
      SlateElement.isElement(node) &&
      (type === 'ul' || type === 'ol')
    );
  }, []);

  const getIsListItemNode = useCallback((node: unknown): node is SlateElement & { type: 'li' } => {
    return (
      !Editor.isEditor(node) &&
      SlateElement.isElement(node) &&
      (node as SlateElement & { type?: string }).type === 'li'
    );
  }, []);

  const isValidRange = useCallback((editor: PlateEditor, selection: BaseSelection | null): selection is Range => {
    return !!(
      selection &&
      Range.isRange(selection) &&
      Node.has(editor as any, selection.anchor.path) &&
      Node.has(editor as any, selection.focus.path)
    );
  }, []);

  const getNonListBlockTypeForSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor || !editor.selection || !Range.isRange(editor.selection)) {
      return 'p';
    }

    const matching = Array.from(
      Editor.nodes(editor as any, {
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
      Editor.nodes(editor as any, {
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
        Editor.nodes(editor as any, {
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
        if (next === 0) {
          Transforms.unsetNodes(editor as any, 'indent' as any, { at: path });
        } else {
          Transforms.setNodes(editor as any, { indent: next } as any, { at: path });
        }
      }

      debug('applyListIndent.success', {
        step,
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('applyListIndent failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, getIsListItemNode, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const isMarkActive = useCallback((format: string): boolean => {
    const editor = getActiveEditor();
    if (!editor) return false;
    try {
      const selection = editor.selection;
      if (!isValidRange(editor, selection)) {
        return false;
      }

      if (Range.isCollapsed(selection)) {
        if (Node.has(editor as any, selection.anchor.path)) {
          const node = Node.get(editor as any, selection.anchor.path);
          if (Text.isText(node) && Object.prototype.hasOwnProperty.call(node, format)) {
            return !!(node as Record<string, any>)[format];
          }
        }

        const marks = Editor.marks(editor as any) as Record<string, any> | null;
        return marks ? !!marks[format] : false;
      }

      const textNodes = Array.from(
        Editor.nodes(editor as any, {
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
  }, [getActiveEditor, isValidRange]);

  const hasRangeSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    const selection = editor.selection;
    if (isValidRange(editor, selection) && !Range.isCollapsed(selection)) {
      return true;
    }

    const stored = storedSelection.current;
    return isValidRange(editor, stored) && !Range.isCollapsed(stored);
  }, [getActiveEditor, isValidRange]);

  const hasSelection = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    const selection = editor.selection;
    if (isValidRange(editor, selection)) {
      return true;
    }

    return isValidRange(editor, storedSelection.current);
  }, [getActiveEditor, isValidRange]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('insertText failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('insertImage failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const insertTable = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    try {
      debug('insertTable.start', {
        hasSelection: !!editor.selection,
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return false;
      if (!editor.selection || !Range.isRange(editor.selection)) return false;

      if (!insertDefaultTableNode(editor)) {
        return false;
      }
      debug('insertTable.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
      return true;
    } catch (e) {
      console.warn('insertTable failed:', e);
      return false;
    }
  }, [debug, describeSelection, getActiveEditor, insertDefaultTableNode, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const addTableRow = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    try {
      debug('addTableRow.start', {
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return false;
      if (!insertTableRowBelow(editor)) return false;

      debug('addTableRow.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
      return true;
    } catch (e) {
      console.warn('addTableRow failed:', e);
      return false;
    }
  }, [debug, describeSelection, getActiveEditor, insertTableRowBelow, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const addTableColumn = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    try {
      debug('addTableColumn.start', {
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return false;
      if (!insertTableColumnRight(editor)) return false;

      debug('addTableColumn.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
      return true;
    } catch (e) {
      console.warn('addTableColumn failed:', e);
      return false;
    }
  }, [debug, describeSelection, getActiveEditor, insertTableColumnRight, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const removeTableRow = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    try {
      debug('removeTableRow.start', {
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return false;
      if (!removeSelectedTableRow(editor)) return false;

      debug('removeTableRow.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
      return true;
    } catch (e) {
      console.warn('removeTableRow failed:', e);
      return false;
    }
  }, [debug, describeSelection, getActiveEditor, removeSelectedTableRow, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const removeTableColumn = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    try {
      debug('removeTableColumn.start', {
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return false;
      if (!removeSelectedTableColumn(editor)) return false;

      debug('removeTableColumn.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
      return true;
    } catch (e) {
      console.warn('removeTableColumn failed:', e);
      return false;
    }
  }, [debug, describeSelection, getActiveEditor, removeSelectedTableColumn, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const toggleTableHeaderRow = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    try {
      debug('toggleTableHeaderRow.start', {
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return false;
      if (!toggleSelectedTableHeaderRow(editor)) return false;

      debug('toggleTableHeaderRow.success', {
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
      return true;
    } catch (e) {
      console.warn('toggleTableHeaderRow failed:', e);
      return false;
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon, toggleSelectedTableHeaderRow]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('insertLink failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('applyMark failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('toggleMark failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, isMarkActive, setStoredSelection, syncActiveEditorContentSoon]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('removeMark failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

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
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('setAlign failed:', e);
    }
  }, [debug, describeSelection, getActiveEditor, restoreSelection, setStoredSelection, syncActiveEditorContentSoon]);

  const toggleBlockquote = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) return;

    try {
      debug('toggleBlockquote.start', {
        selection: describeSelection(editor.selection || null),
      });
      if (!restoreSelection({ requireTextSelection: false })) return;
      if (!editor.selection || !Range.isRange(editor.selection)) return;

      const isConvertibleBlock = (node: unknown) => {
        if (!SlateElement.isElement(node) || Editor.isEditor(node)) {
          return false;
        }

        const type = (node as SlateElement & { type?: string }).type || 'p';
        return Editor.isBlock(editor as any, node)
          && !getIsListNode(node)
          && !getIsListItemNode(node)
          && !['table', 'tr', 'td', 'th', 'img', 'image'].includes(type);
      };

      const selectedBlocks = Array.from(
        Editor.nodes(editor as any, {
          at: editor.selection,
          match: isConvertibleBlock,
          mode: 'lowest',
        })
      );

      if (selectedBlocks.length === 0) {
        return;
      }

      const shouldApplyBlockquote = selectedBlocks.some(([node]) => {
        return (node as SlateElement & { type?: string }).type !== 'blockquote';
      });

      Transforms.setNodes(editor as any, { type: shouldApplyBlockquote ? 'blockquote' : 'p' } as any, {
        at: editor.selection,
        match: isConvertibleBlock,
      });

      debug('toggleBlockquote.success', {
        action: shouldApplyBlockquote ? 'apply' : 'remove',
        selection: describeSelection(editor.selection || null),
      });
      setStoredSelection(editor.selection || null);
      syncActiveEditorContentSoon();
    } catch (e) {
      console.warn('toggleBlockquote failed:', e);
    }
  }, [
    debug,
    describeSelection,
    getActiveEditor,
    getIsListItemNode,
    getIsListNode,
    restoreSelection,
    setStoredSelection,
    syncActiveEditorContentSoon,
  ]);

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
        syncActiveEditorContentSoon();
        return;
      }

      Transforms.unwrapNodes(editor as any, {
        match: (n) => getIsListNode(n),
        split: true,
      });
      Transforms.unsetNodes(editor as any, 'indent' as any, {
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
      syncActiveEditorContentSoon();
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
    syncActiveEditorContentSoon,
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
      toggleBlockquote,
      toggleList,
      indentList,
      outdentList,
      insertText,
      insertLink,
      insertImage,
      insertTable,
      addTableRow,
      addTableColumn,
      removeTableRow,
      removeTableColumn,
      toggleTableHeaderRow,
      isMarkActive,
      hasRangeSelection,
      hasSelection,
      storeSelection,
      restoreSelection,
      registerContentSync,
      syncActiveEditorContent,
    }}>
      {children}
    </ActiveEditorContext.Provider>
  );
}

export function useActiveEditor() {
  return useContext(ActiveEditorContext);
}

export default ActiveEditorContext;
