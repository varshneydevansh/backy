/**
 * Rich Text Formatting Panel Container
 * 
 * This component provides the portal container where the PortalToolbar
 * (from inside the Plate context) will render its controls.
 * 
 * The actual toolbar is rendered by BackyEditor's PortalToolbar component
 * using React createPortal into this container.
 */

import { useActiveEditor } from './ActiveEditorContext';
import { useStore } from '@/stores/mockStore';
import { cn } from '@/lib/utils';
import { getFontFamilyOptions, toFontFamilyStyle } from './fontCatalog';
import { EmojiPickerModal } from './EmojiPickerModal';
import {
  applyListIndentToNodes,
  applyListIndentToSelectedListItemNodes,
  applyListTypeToSelectedListItemNodes,
  applyListTypeToNodes,
  moveSelectedListItemNodes,
  RICH_TEXT_LIST_MAX_INDENT,
  type RichTextListType,
} from './richTextListTransforms';
import { Editor, Node, Range as SlateRange, Text, Transforms } from 'slate';
import type { PlateEditor } from '@udecode/plate/react';
import {
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Underline,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Palette,
  Highlighter,
  Type,
  Eraser,
  Link,
  Image,
  Plus,
  X,
  Quote,
  Table,
  Rows3,
  Columns3,
  Rows2,
  Columns2,
  TableProperties,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
} from 'lucide-react';
import { ColorPicker } from '@backy-cms/editor';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

interface RichTextFormattingProps {
  onOpenMediaLibrary?: () => void;
  onOpenLinkModal?: () => void;
  elementId?: string;
  elementContent?: unknown;
  onElementContentChange?: (content: unknown[]) => void;
}

const MARK_ABSENT = Symbol('richtext-mark-absent');
const MARK_MIXED = Symbol('richtext-mark-mixed');

type MarkStateValue = string | number | boolean | null | undefined | symbol;
type InsertDialogMode = 'link' | 'image';

const normalizeTextFallbackContent = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    return [{
      type: 'p',
      children: [{ text: raw }],
    }];
  }

  return [{
    type: 'p',
    children: [{ text: '' }],
  }];
};

export function RichTextFormatting({
  onOpenMediaLibrary,
  onOpenLinkModal,
  elementId,
  elementContent,
  onElementContentChange,
}: RichTextFormattingProps) {
  const media = useStore((state) => state.media);
  const fontFamilies = useMemo(() => getFontFamilyOptions(media), [media]);
  const {
    getActiveEditor,
    getActiveEditorElementId,
    setAlign,
    toggleList,
    restoreSelection,
    hasRangeSelection,
    hasSelection,
    selectionRevision,
    toggleBlockquote,
    indentList,
    outdentList,
    moveListItemUp,
    moveListItemDown,
    insertLink,
    insertImage,
    insertTable,
    addTableRow,
    addTableColumn,
    duplicateTableRow,
    duplicateTableColumn,
    removeTableRow,
    removeTableColumn,
    moveTableRowUp,
    moveTableRowDown,
    moveTableColumnLeft,
    moveTableColumnRight,
    toggleTableHeaderRow,
    toggleTableHeaderColumn,
    toggleTableHeaderCell,
    mergeTableCellRight,
    mergeTableCellDown,
    splitTableCell,
    setTableCellBackgroundColor,
    setTableCellBorderColor,
    setTableCellVerticalAlign,
    setTableCaption,
    removeTable,
    storeSelection,
    syncActiveEditorContent,
  } = useActiveEditor();

  const pendingActionRef = useRef<number | null>(null);
  const activePropertyActionRef = useRef<string>('unknown');
  const suppressNextListIndentClickRef = useRef(false);
  const syncActiveEditorContentAfterCommand = useCallback(() => {
    syncActiveEditorContent();
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        syncActiveEditorContent();
      });
    }
  }, [syncActiveEditorContent]);

  const canInteractWithEditor = useCallback(() => !!getActiveEditor(), [getActiveEditor]);
  const getCurrentActiveEditorId = useCallback(() => getActiveEditorElementId(), [getActiveEditorElementId]);
  const isTargetEditorActive = useCallback(() => {
    const activeEditor = getActiveEditor();
    if (!activeEditor || !elementId) {
      return false;
    }

    return getCurrentActiveEditorId() === elementId;
  }, [elementId, getActiveEditor, getCurrentActiveEditorId]);

  const isTargetEditorFocused = useCallback(() => {
    if (typeof document === 'undefined' || !elementId) {
      return false;
    }

    const activeElement = document.activeElement;
    if (!activeElement || typeof activeElement.closest !== 'function') {
      return false;
    }

    return !!activeElement.closest(
      `[data-element-id="${elementId}"] [data-backy-text-editor][data-backy-text-editor-editable="true"]`
    );
  }, [elementId]);

  const isTargetEditorInEditableMode = useCallback(() => {
    return isTargetEditorActive() && isTargetEditorFocused();
  }, [isTargetEditorActive, isTargetEditorFocused]);

  const canTargetEditorControlContent = useCallback(() => {
    return canInteractWithEditor() && isTargetEditorActive();
  }, [canInteractWithEditor, isTargetEditorActive]);

  const isTargetEditorUsable = useCallback(() => {
    return isTargetEditorInEditableMode() && canInteractWithEditor();
  }, [canInteractWithEditor, isTargetEditorInEditableMode]);

  const hasTargetSelection = useCallback(() => {
    if (!isTargetEditorUsable()) {
      return false;
    }
    return hasSelection();
  }, [hasSelection, isTargetEditorUsable]);

  const hasTargetRangeSelection = useCallback(() => {
    if (!canTargetEditorControlContent()) {
      return false;
    }

    return hasRangeSelection();
  }, [canTargetEditorControlContent, hasRangeSelection]);

  const canUseActiveTextFormatting = useCallback(() => {
    if (!canTargetEditorControlContent()) {
      return false;
    }

    return hasTargetRangeSelection();
  }, [canTargetEditorControlContent, hasTargetRangeSelection]);

  const canWriteElementContent = useCallback(() => {
    return typeof onElementContentChange === 'function' && elementId ? true : false;
  }, [elementId, onElementContentChange]);

  const normalizedElementContent = useMemo(() => {
    return normalizeTextFallbackContent(elementContent);
  }, [elementContent]);

  const mapContentTextNodes = useCallback((nodes: unknown[], updater: (node: Record<string, unknown>) => Record<string, unknown>): unknown[] => {
    const patchNode = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      const nextNode = node as Record<string, unknown>;
      if (Text.isText(nextNode)) {
        return updater({ ...nextNode });
      }

      const children = Array.isArray((nextNode as { children?: unknown }).children)
        ? (nextNode as { children: unknown[] }).children
        : null;

      if (!children) {
        return nextNode;
      }

      const nextChildren = children.map((child) => patchNode(child));
      return { ...nextNode, children: nextChildren };
    };

    return nodes.map((node) => patchNode(node));
  }, []);

  const applyTextMarksToElementContent = useCallback((updates: Record<string, unknown>): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const nextContent = mapContentTextNodes(normalizedElementContent, (textNode) => {
      const nextNode = { ...textNode };

      Object.entries(updates).forEach(([format, value]) => {
        if (value === undefined || value === null || value === '' || value === false) {
          if (Object.prototype.hasOwnProperty.call(nextNode, format)) {
            delete nextNode[format];
          }
          return;
        }

        nextNode[format] = value;
      });

      return nextNode;
    });

    onElementContentChange?.(nextContent as unknown[]);
    return true;
  }, [canWriteElementContent, mapContentTextNodes, normalizedElementContent, onElementContentChange]);

  const applyTextMarkToElementContent = useCallback((format: string, value: unknown): boolean => {
    return applyTextMarksToElementContent({
      [format]: value === undefined || value === null || value === '' || value === false ? '' : value,
    });
  }, [applyTextMarksToElementContent]);

  const applyBlockPropertiesToElementContent = useCallback((updates: Record<string, unknown>): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const patchNode = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      const nextNode = { ...node } as Record<string, unknown>;
      const children = Array.isArray((nextNode as { children?: unknown }).children)
        ? (nextNode as { children: unknown[] }).children
        : null;

      if (children) {
        nextNode.children = children.map((child) => patchNode(child));
      }

      const canPatch = children || nextNode.type === 'table' || nextNode.type === 'tr';
      if (!canPatch) {
        return nextNode;
      }

      Object.entries(updates).forEach(([format, value]) => {
        if (value === undefined || value === null || value === '' || value === false) {
          if (Object.prototype.hasOwnProperty.call(nextNode, format)) {
            delete nextNode[format];
          }
          return;
        }

        nextNode[format] = value;
      });

      return nextNode;
    };

    const nextContent = normalizedElementContent.map((node) => patchNode(node));
    onElementContentChange?.(nextContent as unknown[]);
    return true;
  }, [canWriteElementContent, normalizedElementContent, onElementContentChange]);

  const applyListTypeToElementContent = useCallback((format: RichTextListType): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const nextContent = applyListTypeToNodes(normalizedElementContent, format);

    if (!nextContent.changed) {
      return false;
    }

    onElementContentChange?.(nextContent.nodes);
    return true;
  }, [canWriteElementContent, normalizedElementContent, onElementContentChange]);

  const applyListIndentToElementContent = useCallback((step: number): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const nextContent = applyListIndentToNodes(normalizedElementContent, step);
    onElementContentChange?.(nextContent);
    return true;
  }, [canWriteElementContent, normalizedElementContent, onElementContentChange]);

  const readDomTextSelectionOffsets = useCallback((): { start: number; end: number } | null => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !elementId) {
      return null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const elementRoot = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.getAttribute('data-element-id') === elementId
    ));
    const editor = elementRoot?.querySelector('[contenteditable="true"], [role="textbox"]');
    if (!(editor instanceof HTMLElement)) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return null;
    }

    const measureOffset = (container: globalThis.Node, offset: number) => {
      const measureRange = document.createRange();
      measureRange.selectNodeContents(editor);
      measureRange.setEnd(container, offset);
      return measureRange.toString().length;
    };

    const start = measureOffset(range.startContainer, range.startOffset);
    const end = measureOffset(range.endContainer, range.endOffset);
    return end > start ? { start, end } : null;
  }, [elementId]);

  const applyListIndentToElementSelection = useCallback((step: number): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const selectionOffsets = readDomTextSelectionOffsets();
    if (!selectionOffsets) {
      return false;
    }

    let didTargetListItem = false;
    let selectedText = '';
    if (typeof window !== 'undefined') {
      selectedText = window.getSelection()?.toString() || '';
    }

    const selectedListIndent = selectedText.trim()
      ? applyListIndentToSelectedListItemNodes(normalizedElementContent, selectedText, step)
      : null;
    if (selectedListIndent?.changed) {
      const clonedContent = JSON.parse(JSON.stringify(selectedListIndent.nodes)) as unknown[];
      onElementContentChange?.(clonedContent);

      const activeEditor = getActiveEditor();
      const activeEditorElementId = getCurrentActiveEditorId();
      if (activeEditor && (!elementId || !activeEditorElementId || activeEditorElementId === elementId)) {
        try {
          (activeEditor as any).children = JSON.parse(JSON.stringify(selectedListIndent.nodes));
          (activeEditor as any).onChange?.();
          syncActiveEditorContentAfterCommand();
        } catch {
        }
      }
      return true;
    }

    const getNodeTextLength = (node: unknown): number => {
      if (!node || typeof node !== 'object') {
        return 0;
      }

      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return record.text.length;
      }

      const children = Array.isArray(record.children) ? record.children : [];
      return children.reduce((length, child) => length + getNodeTextLength(child), 0);
    };

    const patchNode = (node: unknown, startOffset: number): { node: unknown; endOffset: number } => {
      if (!node || typeof node !== 'object') {
        return { node, endOffset: startOffset };
      }

      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return { node, endOffset: startOffset + record.text.length };
      }

      const nodeTextLength = getNodeTextLength(record);
      const nodeEndOffset = startOffset + nodeTextLength;
      const children = Array.isArray(record.children) ? record.children : null;
      let nextOffset = startOffset;
      const nextNode: Record<string, unknown> = { ...record };

      if (children) {
        nextNode.children = children.map((child) => {
          const patched = patchNode(child, nextOffset);
          nextOffset = patched.endOffset;
          return patched.node;
        });
      }

      const intersectsSelection = selectionOffsets.start < nodeEndOffset && selectionOffsets.end > startOffset;
      const listText = children ? children.map((child) => {
        if (!child || typeof child !== 'object') {
          return '';
        }
        const childRecord = child as Record<string, unknown>;
        return typeof childRecord.text === 'string' ? childRecord.text : '';
      }).join('') : '';
      const matchesSelectedText = !!selectedText && listText.includes(selectedText);
      if (nextNode.type === 'li' && (intersectsSelection || matchesSelectedText)) {
        didTargetListItem = true;
        const currentIndent = Number(nextNode.indent || 0);
        if (Number.isFinite(currentIndent)) {
          const nextIndent = Math.max(0, Math.min(RICH_TEXT_LIST_MAX_INDENT, currentIndent + step));
          if (nextIndent === 0) {
            delete nextNode.indent;
          } else {
            nextNode.indent = nextIndent;
          }
        }
      }

      return { node: nextNode, endOffset: nodeEndOffset };
    };

    let offset = 0;
    const nextContent = normalizedElementContent.map((node) => {
      const patched = patchNode(node, offset);
      offset = patched.endOffset;
      return patched.node;
    });

    if (!didTargetListItem) {
      return false;
    }

    const clonedContent = JSON.parse(JSON.stringify(nextContent)) as unknown[];
    onElementContentChange?.(clonedContent);

    const activeEditor = getActiveEditor();
    const activeEditorElementId = getCurrentActiveEditorId();
    if (activeEditor && (!elementId || !activeEditorElementId || activeEditorElementId === elementId)) {
      try {
        (activeEditor as any).children = JSON.parse(JSON.stringify(nextContent));
        (activeEditor as any).onChange?.();
        syncActiveEditorContentAfterCommand();
      } catch {
      }
    }
    return true;
  }, [
    canWriteElementContent,
    elementId,
    getActiveEditor,
    getCurrentActiveEditorId,
    normalizedElementContent,
    onElementContentChange,
    readDomTextSelectionOffsets,
    syncActiveEditorContentAfterCommand,
  ]);

  const moveListItemInElementSelection = useCallback((direction: -1 | 1): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const selectionOffsets = readDomTextSelectionOffsets();
    let selectedText = '';
    if (typeof window !== 'undefined') {
      selectedText = window.getSelection()?.toString() || '';
    }

    if (!selectionOffsets && !selectedText.trim()) {
      return false;
    }

    const getPlainNodeText = (node: unknown): string => {
      if (!node || typeof node !== 'object') {
        return '';
      }

      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return record.text;
      }

      const children = Array.isArray(record.children) ? record.children : [];
      return children.map((child) => getPlainNodeText(child)).join('');
    };

    const getNodeTextLength = (node: unknown): number => getPlainNodeText(node).length;
    let didMoveListItem = false;

    const patchNode = (node: unknown, startOffset: number): { node: unknown; endOffset: number } => {
      if (!node || typeof node !== 'object') {
        return { node, endOffset: startOffset };
      }

      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return { node, endOffset: startOffset + record.text.length };
      }

      const children = Array.isArray(record.children) ? record.children : [];
      const endOffset = startOffset + getNodeTextLength(record);

      if (!didMoveListItem && (record.type === 'ul' || record.type === 'ol')) {
        let childOffset = startOffset;
        const entries = children.map((child) => {
          const childStart = childOffset;
          const childLength = getNodeTextLength(child);
          childOffset += childLength;
          return {
            child,
            start: childStart,
            end: childStart + childLength,
            text: getPlainNodeText(child),
          };
        });

        const selectedIndex = entries.findIndex((entry) => {
          const childRecord = entry.child as Record<string, unknown>;
          if (!childRecord || typeof childRecord !== 'object' || childRecord.type !== 'li') {
            return false;
          }

          const intersectsSelection = selectionOffsets
            ? entry.end > selectionOffsets.start && entry.start < selectionOffsets.end
            : false;
          const selected = selectedText.trim();
          const matchesSelectedText = selected
            ? entry.text.includes(selected) || selected.includes(entry.text.trim())
            : false;
          return intersectsSelection || matchesSelectedText;
        });

        const targetIndex = selectedIndex + direction;
        if (selectedIndex >= 0 && targetIndex >= 0 && targetIndex < entries.length) {
          const reordered = entries.map((entry) => entry.child);
          const [moved] = reordered.splice(selectedIndex, 1);
          reordered.splice(targetIndex, 0, moved);
          didMoveListItem = true;
          return { node: { ...record, children: reordered }, endOffset };
        }
      }

      let childOffset = startOffset;
      const nextChildren = children.map((child) => {
        const patched = patchNode(child, childOffset);
        childOffset = patched.endOffset;
        return patched.node;
      });

      return {
        node: children.length ? { ...record, children: nextChildren } : record,
        endOffset,
      };
    };

    let offset = 0;
    const nextContent = normalizedElementContent.map((node) => {
      const patched = patchNode(node, offset);
      offset = patched.endOffset;
      return patched.node;
    });

    if (!didMoveListItem) {
      return false;
    }

    const clonedContent = JSON.parse(JSON.stringify(nextContent)) as unknown[];
    onElementContentChange?.(clonedContent);

    const activeEditor = getActiveEditor();
    const activeEditorElementId = getCurrentActiveEditorId();
    if (activeEditor && (!elementId || !activeEditorElementId || activeEditorElementId === elementId)) {
      try {
        (activeEditor as any).children = JSON.parse(JSON.stringify(nextContent));
        (activeEditor as any).onChange?.();
        syncActiveEditorContentAfterCommand();
      } catch {
      }
    }
    return true;
  }, [
    canWriteElementContent,
    elementId,
    getActiveEditor,
    getCurrentActiveEditorId,
    normalizedElementContent,
    onElementContentChange,
    readDomTextSelectionOffsets,
    syncActiveEditorContentAfterCommand,
  ]);

  const toggleBlockquoteInElementContent = useCallback((): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const isConvertibleType = (type: unknown) => {
      return typeof type !== 'string'
        || type === 'p'
        || type === 'paragraph'
        || type === 'h1'
        || type === 'h2'
        || type === 'h3'
        || type === 'h4'
        || type === 'h5'
        || type === 'h6'
        || type === 'blockquote';
    };

    const convertibleBlocks = normalizedElementContent.filter((node) => {
      if (!node || typeof node !== 'object') {
        return false;
      }

      const record = node as Record<string, unknown>;
      return Array.isArray(record.children) && isConvertibleType(record.type);
    });

    if (convertibleBlocks.length === 0) {
      return false;
    }

    const shouldApplyBlockquote = convertibleBlocks.some((node) => {
      return (node as Record<string, unknown>).type !== 'blockquote';
    });

    const nextContent = normalizedElementContent.map((node) => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      const record = node as Record<string, unknown>;
      if (!Array.isArray(record.children) || !isConvertibleType(record.type)) {
        return node;
      }

      return {
        ...record,
        type: shouldApplyBlockquote ? 'blockquote' : 'p',
      };
    });

    onElementContentChange?.(nextContent as unknown[]);
    return true;
  }, [canWriteElementContent, normalizedElementContent, onElementContentChange]);

  const readTextMarkState = useCallback((editor: PlateEditor, format: string): MarkStateValue => {
    try {
      const nodes = Array.from(
        Editor.nodes(editor as any, {
          at: [],
          match: (node) => Text.isText(node),
          mode: 'all',
        })
      ).map(([node]) => node as unknown as Record<string, unknown>);

      if (nodes.length === 0) {
        return MARK_ABSENT;
      }

      let initialized = false;
      let firstValue: unknown;

      for (const node of nodes) {
        const value = Object.prototype.hasOwnProperty.call(node, format) ? node[format] : undefined;

        if (!initialized) {
          initialized = true;
          firstValue = value;
          continue;
        }

        if (firstValue !== value) {
          return MARK_MIXED;
        }
      }

      if (!initialized || firstValue === undefined) {
        const marks = Editor.marks(editor as any) as Record<string, unknown> | null;
        if (!marks || !Object.prototype.hasOwnProperty.call(marks, format)) {
          return MARK_ABSENT;
        }

        return marks[format] as MarkStateValue;
      }

      return firstValue as MarkStateValue;
    } catch {
      return MARK_ABSENT;
    }
  }, [MARK_ABSENT, MARK_MIXED]);

  const readActiveTextMark = useCallback((format: string): MarkStateValue => {
    const readContentMark = () => {
      const walk = (nodes: unknown[], targetFormat: string): MarkStateValue => {
        let hasTextNodes = false;
        let initialized = false;
        let firstValue: unknown;

        const stack = [...nodes];
        while (stack.length > 0) {
          const next = stack.pop();
          if (!next || typeof next !== 'object') {
            continue;
          }

          const node = next as Record<string, unknown>;
          const children = Array.isArray((node as { children?: unknown }).children)
            ? (node as { children: unknown[] }).children
            : null;

          if (Text.isText(node)) {
            hasTextNodes = true;
            const value = Object.prototype.hasOwnProperty.call(node, targetFormat)
              ? node[targetFormat]
              : undefined;

            if (!initialized) {
              initialized = true;
              firstValue = value;
            } else if (firstValue !== value) {
              return MARK_MIXED;
            }
          }

          if (children) {
            stack.push(...children);
          }
        }

    if (!hasTextNodes || !initialized || firstValue === undefined) {
      return MARK_ABSENT;
    }

        return firstValue as MarkStateValue;
      };

      return walk(normalizedElementContent, format);
    };

    if (!canTargetEditorControlContent() || !hasTargetRangeSelection()) {
      return readContentMark();
    }

    const editor = getActiveEditor();
    if (!editor) {
      return MARK_ABSENT;
    }

    try {
      const selection = editor.selection;
      const hasActiveRange = SlateRange.isRange(selection);
      const hasValidSelection = hasActiveRange
        && Node.has(editor as any, selection.anchor.path)
        && Node.has(editor as any, selection.focus.path);

      if (!hasValidSelection) {
        return readTextMarkState(editor, format);
      }

      if (SlateRange.isCollapsed(selection)) {
        const anchorNode = Node.has(editor as any, selection.anchor.path)
          ? Node.get(editor as any, selection.anchor.path)
          : null;

        if (anchorNode && Text.isText(anchorNode)) {
          const hasProperty = Object.prototype.hasOwnProperty.call(anchorNode, format);
          if (hasProperty) {
            const value = (anchorNode as unknown as Record<string, unknown>)[format];
            if (value !== undefined) {
              return value as MarkStateValue;
            }
          }
        }
      }

      const textNodes = Array.from(
        Editor.nodes(editor as any, {
          at: selection,
          match: (node) => Text.isText(node),
          mode: 'all',
        })
      ).map(([node]) => node as unknown as Record<string, unknown>);

      if (textNodes.length === 0) {
        const marks = Editor.marks(editor as any) as Record<string, unknown> | null;
        if (!marks || !Object.prototype.hasOwnProperty.call(marks, format)) {
          return MARK_ABSENT;
        }

        return marks[format] as MarkStateValue;
      }

      let initialized = false;
      let firstValue: unknown;
      for (const node of textNodes) {
        const value = Object.prototype.hasOwnProperty.call(node, format)
          ? node[format]
          : undefined;

        if (!initialized) {
          initialized = true;
          firstValue = value;
          continue;
        }

        if (firstValue !== value) {
          return MARK_MIXED;
        }
      }

      if (!initialized || firstValue === undefined) {
        const marks = Editor.marks(editor as any) as Record<string, unknown> | null;
        if (marks && Object.prototype.hasOwnProperty.call(marks, format)) {
          return marks[format] as MarkStateValue;
        }
        return MARK_ABSENT;
      }

      return firstValue as MarkStateValue;
    } catch {
      return MARK_ABSENT;
    }
  }, [
    getActiveEditor,
    canTargetEditorControlContent,
    MARK_ABSENT,
    MARK_MIXED,
    readTextMarkState,
    normalizedElementContent,
  ]);

  const isTargetMarkActive = useCallback((format: string): boolean => {
    const value = readActiveTextMark(format);
    return value !== MARK_ABSENT && value !== MARK_MIXED && !!value;
  }, [MARK_ABSENT, MARK_MIXED, readActiveTextMark]);
  const logTextAction = useCallback((..._args: unknown[]) => {
  }, []);

  const activateTextEditor = useCallback(() => {
    if (!elementId || typeof document === 'undefined') {
      logTextAction('activateTextEditor blocked', {
        reason: !elementId ? 'missing-element-id' : 'no-document',
      });
      return false;
    }
    logTextAction('activateTextEditor.start', { elementId });

    const dispatchExternalEditRequest = () => {
      if (typeof window === 'undefined') {
        return;
      }
      logTextAction('activateTextEditor.dispatch-window-event');

      window.dispatchEvent(
        new CustomEvent('backy-open-text-editor', {
          detail: { elementId },
        })
      );
    };

    dispatchExternalEditRequest();
    return true;
  }, [elementId, logTextAction]);

  const runOrActivateTextEditor = useCallback((actionName: string, action: () => void) => {
    activePropertyActionRef.current = actionName;
    const currentActiveEditorId = getCurrentActiveEditorId();
    const activeEditorMatchesElement = !!elementId && !!currentActiveEditorId && currentActiveEditorId === elementId;
    logTextAction('runOrActivateTextEditor.requested', {
      actionName,
      canInteractInitial: canInteractWithEditor(),
      activeEditorId: getCurrentActiveEditorId(),
      activeEditorMatchesElement,
    });
    if (canInteractWithEditor() && activeEditorMatchesElement) {
      logTextAction('runOrActivateTextEditor.direct-execute', {
        actionName,
        activeEditorId: getCurrentActiveEditorId(),
      });
      action();
      return;
    }

    if (canInteractWithEditor() && !activeEditorMatchesElement) {
      const activeEditorElementId = getCurrentActiveEditorId();
      logTextAction('runOrActivateTextEditor.target-mismatch', {
        actionName,
        expectedElementId: elementId,
        activeEditorElementId,
      });
    }

    const activated = activateTextEditor();
    if (!activated) {
      logTextAction('runOrActivateTextEditor.activate-failed', { actionName });
      return;
    }

    if (pendingActionRef.current) {
      window.clearTimeout(pendingActionRef.current);
    }

      let attempts = 0;
    const maxAttempts = 60;
    const poll = () => {
      attempts += 1;
      const activeEditorElementId = getCurrentActiveEditorId();
      const activeMatches = !elementId || (!!activeEditorElementId && activeEditorElementId === elementId);
      const canInteract = canInteractWithEditor();

      if (canInteract && activeMatches) {
        pendingActionRef.current = null;
        logTextAction('runOrActivateTextEditor.poll-success', {
          actionName,
          attempts,
          activeEditorElementId,
          activeEditorId: getCurrentActiveEditorId(),
        });
        action();
        return;
      }

      if (canInteract && !activeMatches) {
        logTextAction('runOrActivateTextEditor.poll-target-mismatch', {
          actionName,
          attempts,
          activeEditorElementId,
          expectedElementId: elementId,
        });
      }

      if (attempts >= maxAttempts) {
        pendingActionRef.current = null;
        logTextAction('runOrActivateTextEditor.poll-timeout', {
          actionName,
          attempts,
        });
        const hasTargetMatch = !elementId || activeMatches;
        if (canInteract && hasTargetMatch) {
          logTextAction('runOrActivateTextEditor.poll-fallback-execute', {
            actionName,
            activeEditorId: getCurrentActiveEditorId(),
          });
          action();
        } else {
          logTextAction('runOrActivateTextEditor.poll-timeout-aborted', {
            actionName,
            activeEditorId: getCurrentActiveEditorId(),
            activeEditorMatchesElement,
          });
        }
        return;
      }

      pendingActionRef.current = window.setTimeout(poll, 60);
    };

    logTextAction('runOrActivateTextEditor.polling', {
      actionName,
      maxAttempts,
      activeEditorElementId: getCurrentActiveEditorId(),
    });
    pendingActionRef.current = window.setTimeout(poll, 60);
  }, [activateTextEditor, canInteractWithEditor, elementId, getCurrentActiveEditorId, logTextAction]);

  const runContentProperty = useCallback((actionName: string, action: () => void, options?: { requireActiveEditor?: boolean }) => {
    const shouldActivateEditor = options?.requireActiveEditor !== false;
    logTextAction('content-property.click', {
      actionName,
      canInteractNow: canInteractWithEditor(),
      hasSelectionNow: hasTargetSelection(),
      shouldActivateEditor,
    });
    if (!shouldActivateEditor) {
      action();
      return;
    }
    runOrActivateTextEditor(actionName, () => {
      action();
    });
  }, [canInteractWithEditor, hasTargetSelection, logTextAction, runOrActivateTextEditor]);

  const runForRangeSelection = useCallback((fn: () => void, options?: {
    requireTextSelection?: boolean;
    fallbackToWholeElement?: boolean;
  }): boolean => {
    const shouldRequireTextSelection = options?.requireTextSelection ?? false;
    const shouldFallbackToWholeElement = options?.fallbackToWholeElement !== false;

    const editor = getActiveEditor();
    if (!editor) {
      logTextAction('runForRangeSelection.aborted.no-editor', { options });
      return false;
    }

    if (!canTargetEditorControlContent()) {
      logTextAction('runForRangeSelection.abort-target-mismatch', {
        activeEditorId: getCurrentActiveEditorId(),
        targetElementId: elementId,
      });
      return false;
    }

    const liveSelection = editor.selection;
    const hasExistingRange = SlateRange.isRange(liveSelection)
      && Node.has(editor as any, liveSelection.anchor.path)
      && Node.has(editor as any, liveSelection.focus.path);
    const liveSelectionIsCollapsed = hasExistingRange && SlateRange.isCollapsed(liveSelection);
    const shouldRestoreBeforeAction = !hasExistingRange || liveSelectionIsCollapsed;

    let hasRestored = shouldRestoreBeforeAction
      ? restoreSelection({
          requireTextSelection: shouldRequireTextSelection,
        })
      : true;

    if (!hasRestored && shouldRequireTextSelection) {
      logTextAction('runForRangeSelection.restore-failed', {
        requireTextSelection: true,
      });
      return false;
    }

    const currentSelection = editor.selection;
    let hasActiveRange = SlateRange.isRange(currentSelection);
    let hasValidSelection = hasActiveRange && currentSelection
      ? Node.has(editor as any, currentSelection.anchor.path)
        && Node.has(editor as any, currentSelection.focus.path)
      : false;

    if (!hasActiveRange || !hasValidSelection) {
      if (!hasRestored) {
        if (!shouldFallbackToWholeElement) {
          logTextAction('runForRangeSelection.restore-failed', {
            requireTextSelection: shouldRequireTextSelection,
            reason: 'restore-failed',
          });
          return false;
        }

        try {
          const start = Editor.start(editor as any, []);
          const end = Editor.end(editor as any, []);
          Transforms.select(editor as any, { anchor: start, focus: end });
          hasRestored = true;
        } catch (error) {
          logTextAction('runForRangeSelection.restore-failed', {
            requireTextSelection: shouldRequireTextSelection,
            reason: 'restore-fallback-failed',
            restoreError: (error as Error)?.message || String(error),
          });
          return false;
        }
      }

      const restoredSelection = editor.selection;
      if (!restoredSelection || !SlateRange.isRange(restoredSelection)) {
        if (shouldRequireTextSelection) {
          logTextAction('runForRangeSelection.restore-failed', {
            requireTextSelection: shouldRequireTextSelection,
          });
        }
        return false;
      }

      hasActiveRange = true;
      hasValidSelection = Node.has(editor as any, restoredSelection.anchor.path)
        && Node.has(editor as any, restoredSelection.focus.path);
    }

    if (!hasActiveRange || !hasValidSelection) {
      return false;
    }

    const activeSelection = editor.selection;
    if (shouldRequireTextSelection && SlateRange.isRange(activeSelection) && SlateRange.isCollapsed(activeSelection)) {
      logTextAction('runForRangeSelection.restore-failed', {
        requireTextSelection: true,
        reason: 'selection-is-caret-only',
      });
      return false;
    }

    if (
      shouldFallbackToWholeElement &&
      SlateRange.isRange(editor.selection) &&
      SlateRange.isCollapsed(editor.selection)
    ) {
      try {
        const start = Editor.start(editor as any, []);
        const end = Editor.end(editor as any, []);
        Transforms.select(editor as any, { anchor: start, focus: end });
      } catch {
      }
    }

    storeSelection();

    logTextAction('runForRangeSelection.state', {
      requireTextSelection: options?.requireTextSelection,
      fallbackToWholeElement: options?.fallbackToWholeElement,
      hasActiveRange: !!editor.selection && SlateRange.isRange(editor.selection),
    });

    let didExecute = false;
    try {
      logTextAction('runForRangeSelection.execute', { actionName: activePropertyActionRef.current });
      fn();
      didExecute = true;
    } catch (error) {
      logTextAction('runForRangeSelection.execute-failed', {
        actionName: activePropertyActionRef.current,
        error: (error as Error)?.message || String(error),
      });
    } finally {
      logTextAction('runForRangeSelection.restore-cursor');
      storeSelection();
    }

    return didExecute;
  }, [
    activePropertyActionRef,
    getActiveEditor,
    getCurrentActiveEditorId,
    canTargetEditorControlContent,
    logTextAction,
    restoreSelection,
    storeSelection,
  ]);

  const runForTextSelectionOrCaret = useCallback((fn: () => void, preferSelectionOnly = false) => {
    return runForRangeSelection(fn, {
      requireTextSelection: preferSelectionOnly,
      fallbackToWholeElement: !preferSelectionOnly,
    });
  }, [runForRangeSelection]);

  const runForTextSelectionOrCaretNoFallback = useCallback((fn: () => void) => {
    return runForRangeSelection(fn, {
      requireTextSelection: false,
      fallbackToWholeElement: false,
    });
  }, [runForRangeSelection]);

  const applyTextMarkToActiveEditor = useCallback((format: string, value?: any): boolean => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    if (!editor.selection || !SlateRange.isRange(editor.selection)) {
      return false;
    }

    if (
      !Node.has(editor as any, editor.selection.anchor.path) ||
      !Node.has(editor as any, editor.selection.focus.path)
    ) {
      return false;
    }

    const shouldRemove = value === undefined || value === null || value === '' || value === false;

    try {
      if (SlateRange.isCollapsed(editor.selection)) {
        if (shouldRemove) {
          Transforms.unsetNodes(editor as any, [format], {
            at: [],
            match: Text.isText,
          });
        } else {
          Transforms.setNodes(editor as any, { [format]: value }, {
            at: [],
            match: Text.isText,
          });
        }
        syncActiveEditorContentAfterCommand();
        return true;
      }

      const shouldSplitStyleRange = format === 'backgroundColor' || format === 'color' || format === 'fontFamily' || format === 'fontSize';
      if (shouldSplitStyleRange) {
        if (shouldRemove) {
          Transforms.unsetNodes(editor as any, [format], {
            at: editor.selection,
            match: Text.isText,
            split: true,
          });
        } else {
          Transforms.setNodes(editor as any, { [format]: value } as Record<string, unknown>, {
            at: editor.selection,
            match: Text.isText,
            split: true,
          });
        }
      } else if (shouldRemove) {
        Editor.removeMark(editor as any, format);
      } else {
        Editor.addMark(editor as any, format, value);
      }

      syncActiveEditorContentAfterCommand();
      return true;
    } catch (error) {
      logTextAction('applyTextMarkToActiveEditor.failed', {
        format,
        shouldRemove,
        error: (error as Error)?.message || String(error),
      });
      return false;
    }
  }, [getActiveEditor, logTextAction, syncActiveEditorContentAfterCommand]);

  const clearActiveTextMarks = useCallback((formats: string[]) => {
    const editor = getActiveEditor();
    if (!editor) {
      return false;
    }

    if (!editor.selection || !SlateRange.isRange(editor.selection)) {
      return false;
    }

    if (
      !Node.has(editor as any, editor.selection.anchor.path) ||
      !Node.has(editor as any, editor.selection.focus.path)
    ) {
      return false;
    }

    try {
      if (SlateRange.isCollapsed(editor.selection)) {
        formats.forEach((format) => {
          Transforms.unsetNodes(editor as any, [format], {
            at: [],
            match: Text.isText,
          });
        });
      } else {
        formats.forEach((format) => {
          Editor.removeMark(editor as any, format);
        });
      }

      syncActiveEditorContentAfterCommand();
      return true;
    } catch (error) {
      logTextAction('clearActiveTextMarks.failed', {
        error: (error as Error)?.message || String(error),
      });
      return false;
    }
  }, [getActiveEditor, logTextAction, syncActiveEditorContentAfterCommand]);

  const applyAlignmentToElementOrSelection = useCallback((align: string) => {
    if (!isTargetEditorUsable()) {
      return applyBlockPropertiesToElementContent({ align });
    }

    const didApply = runForTextSelectionOrCaret(() => {
      setAlign(align);
    }, false);

    if (!didApply) {
      applyBlockPropertiesToElementContent({ align });
    }
  }, [applyBlockPropertiesToElementContent, isTargetEditorUsable, runForTextSelectionOrCaret, setAlign]);

  const readSelectedListItemIndentSnapshot = useCallback((): { text: string; indent: number } | null => {
    const editor = getActiveEditor();
    if (!editor) {
      return null;
    }

    const isListItemNode = (node: unknown) => (
      !!node &&
      typeof node === 'object' &&
      !Editor.isEditor(node) &&
      (node as { type?: unknown }).type === 'li'
    );
    const readDomIndent = (text: string): number | undefined => {
      if (typeof document === 'undefined' || typeof window === 'undefined' || !elementId) {
        return undefined;
      }

      const host = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
        node.getAttribute('data-element-id') === elementId
      ));
      const item = Array.from(host?.querySelectorAll('li') || []).find((node) => (
        (node.textContent || '').includes(text)
      ));
      if (!(item instanceof HTMLElement)) {
        return undefined;
      }

      const marginLeft = Number.parseFloat(window.getComputedStyle(item).marginLeft || '0');
      if (!Number.isFinite(marginLeft) || marginLeft <= 0) {
        return undefined;
      }

      return Math.max(1, Math.min(RICH_TEXT_LIST_MAX_INDENT, Math.round(marginLeft / 24)));
    };

    const snapshotFromEntry = (entry: [Record<string, unknown>, number[]] | undefined | null) => {
      if (!entry) {
        return null;
      }

      const [node, path] = entry;
      const text = Editor.string(editor as any, path as any).trim();
      if (!text) {
        return null;
      }

      const indent = typeof node.indent === 'number' ? node.indent : readDomIndent(text);
      if (typeof indent !== 'number' || indent <= 0) {
        return null;
      }

      return { text, indent };
    };

    if (editor.selection && SlateRange.isRange(editor.selection)) {
      const listItemEntry = Editor.above(editor as any, {
        at: SlateRange.start(editor.selection).path,
        match: isListItemNode,
      }) as [Record<string, unknown>, number[]] | undefined;
      const snapshot = snapshotFromEntry(listItemEntry);
      if (snapshot) {
        return snapshot;
      }
    }

    const selectedText = typeof window !== 'undefined'
      ? window.getSelection()?.toString()?.trim() || ''
      : '';
    if (!selectedText) {
      return null;
    }

    const listItemEntries = Array.from(
      Editor.nodes(editor as any, {
        at: [],
        match: isListItemNode,
        mode: 'lowest',
      })
    ) as unknown as [Record<string, unknown>, number[]][];
    const matchingEntry = listItemEntries.find(([, path]) => (
      Editor.string(editor as any, path as any).trim().includes(selectedText)
    ));
    const snapshot = snapshotFromEntry(matchingEntry);
    if (snapshot) {
      return snapshot;
    }

    const domIndent = readDomIndent(selectedText);
    if (typeof domIndent === 'number' && domIndent > 0) {
      return { text: selectedText, indent: domIndent };
    }

    return null;
  }, [elementId, getActiveEditor]);

  const restoreSelectedListItemIndentSnapshot = useCallback((snapshot: { text: string; indent: number } | null) => {
    if (!snapshot) {
      return;
    }

    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    const listItemEntries = Array.from(
      Editor.nodes(editor as any, {
        at: [],
        match: (node) => (
          !!node &&
          typeof node === 'object' &&
          !Editor.isEditor(node) &&
          (node as { type?: unknown }).type === 'li'
        ),
        mode: 'lowest',
      })
    ) as unknown as [Record<string, unknown>, number[]][];
    const match = listItemEntries.find(([, path]) => Editor.string(editor as any, path as any).trim() === snapshot.text)
      || listItemEntries.find(([, path]) => Editor.string(editor as any, path as any).includes(snapshot.text));
    if (!match) {
      return;
    }

    const [, path] = match;
    Transforms.setNodes(editor as any, { indent: snapshot.indent } as any, {
      at: path,
      match: (node) => (
        !!node &&
        typeof node === 'object' &&
        !Editor.isEditor(node) &&
        (node as { type?: unknown }).type === 'li'
      ),
    });
    const patchedNode = Node.get(editor as any, path as any) as { indent?: unknown };
    if (patchedNode && typeof patchedNode === 'object') {
      patchedNode.indent = snapshot.indent;
    }
    syncActiveEditorContentAfterCommand();
  }, [getActiveEditor, syncActiveEditorContentAfterCommand]);

  const applyListItemIndentToSnapshotNodes = useCallback((
    nodes: unknown[],
    snapshot: { text: string; indent: number } | null
  ): unknown[] => {
    if (!snapshot?.text || snapshot.indent <= 0) {
      return nodes;
    }

    let didApply = false;
    const patchNode = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      const record = node as Record<string, unknown>;
      const children = Array.isArray(record.children)
        ? record.children.map((child) => patchNode(child))
        : null;
      const nextNode: Record<string, unknown> = children ? { ...record, children } : { ...record };

      if (!didApply && nextNode.type === 'li') {
        const text = Array.isArray(nextNode.children)
          ? nextNode.children.map((child) => {
              if (!child || typeof child !== 'object') {
                return '';
              }
              const childRecord = child as Record<string, unknown>;
              if (typeof childRecord.text === 'string') {
                return childRecord.text;
              }
              return '';
            }).join('')
          : '';

        if (text.trim() === snapshot.text || text.includes(snapshot.text)) {
          nextNode.indent = snapshot.indent;
          didApply = true;
        }
      }

      return nextNode;
    };

    return nodes.map((node) => patchNode(node));
  }, []);

  const toggleElementListType = useCallback((format: 'ul' | 'ol') => {
    const selectedListItemIndentSnapshot = readSelectedListItemIndentSnapshot();
    const editorBeforeListTypeChange = getActiveEditor();
    const selectedTextBeforeListTypeChange = selectedListItemIndentSnapshot?.text || (
      typeof window !== 'undefined' ? window.getSelection()?.toString()?.trim() || '' : ''
    );
    const contentBeforeListTypeChange = Array.isArray((editorBeforeListTypeChange as unknown as { children?: unknown } | null)?.children)
      ? JSON.parse(JSON.stringify((editorBeforeListTypeChange as unknown as { children: unknown[] }).children)) as unknown[]
      : null;
    const selectedListTypeChange = contentBeforeListTypeChange && selectedTextBeforeListTypeChange
      ? applyListTypeToSelectedListItemNodes(contentBeforeListTypeChange, format, selectedTextBeforeListTypeChange)
      : null;
    const applySelectedListTypeSnapshot = () => {
      if (!selectedListTypeChange?.changed) {
        return;
      }

      const editor = getActiveEditor();
      if (!editor) {
        onElementContentChange?.(applyListItemIndentToSnapshotNodes(
          selectedListTypeChange.nodes,
          selectedListItemIndentSnapshot,
        ));
        return;
      }

      const nextNodes = applyListItemIndentToSnapshotNodes(
        selectedListTypeChange.nodes,
        selectedListItemIndentSnapshot,
      );
      (editor as unknown as { children: unknown[] }).children = JSON.parse(JSON.stringify(nextNodes));
      try {
        (editor as { onChange?: () => void }).onChange?.();
      } catch {
      }
      onElementContentChange?.(nextNodes);
      syncActiveEditorContentAfterCommand();
    };

    if (!isTargetEditorUsable()) {
      applyListTypeToElementContent(format);
      applySelectedListTypeSnapshot();
      restoreSelectedListItemIndentSnapshot(selectedListItemIndentSnapshot);
      return;
    }

    const didApply = runForTextSelectionOrCaret(() => {
      toggleList(format);
    }, false);

    if (!didApply) {
      applyListTypeToElementContent(format);
    }
    applySelectedListTypeSnapshot();
    restoreSelectedListItemIndentSnapshot(selectedListItemIndentSnapshot);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        applySelectedListTypeSnapshot();
        restoreSelectedListItemIndentSnapshot(selectedListItemIndentSnapshot);
      });
    }
  }, [
    applyListTypeToElementContent,
    applyListItemIndentToSnapshotNodes,
    getActiveEditor,
    isTargetEditorUsable,
    onElementContentChange,
    readSelectedListItemIndentSnapshot,
    restoreSelectedListItemIndentSnapshot,
    runForTextSelectionOrCaret,
    syncActiveEditorContentAfterCommand,
    toggleList,
  ]);

  const adjustElementListIndent = useCallback((step: number) => {
    const activeEditorElementId = getCurrentActiveEditorId();
    const canUseActiveEditor = canInteractWithEditor()
      && (!elementId || !activeEditorElementId || activeEditorElementId === elementId);

    if (canUseActiveEditor) {
      const didApplyToActiveEditor = step > 0 ? indentList() : outdentList();
      if (didApplyToActiveEditor) {
        return;
      }
    }

    if (!applyListIndentToElementSelection(step)) {
      applyListIndentToElementContent(step);
    }
  }, [
    applyListIndentToElementContent,
    applyListIndentToElementSelection,
    canInteractWithEditor,
    elementId,
    getCurrentActiveEditorId,
    outdentList,
    indentList,
  ]);

  const runListIndentControl = useCallback((step: number) => {
    adjustElementListIndent(step);
  }, [adjustElementListIndent]);

  const moveListItemAtSelection = useCallback((direction: -1 | 1) => {
    const selectedListItemIndentSnapshot = readSelectedListItemIndentSnapshot();
    const editorBeforeMove = getActiveEditor();
    const selectedTextBeforeMove = selectedListItemIndentSnapshot?.text || (
      typeof window !== 'undefined' ? window.getSelection()?.toString()?.trim() || '' : ''
    );
    const contentBeforeMove = Array.isArray((editorBeforeMove as unknown as { children?: unknown } | null)?.children)
      ? JSON.parse(JSON.stringify((editorBeforeMove as unknown as { children: unknown[] }).children)) as unknown[]
      : null;
    const selectedMove = contentBeforeMove && selectedTextBeforeMove
      ? moveSelectedListItemNodes(contentBeforeMove, selectedTextBeforeMove, direction)
      : null;
    const applySelectedMoveSnapshot = () => {
      if (!selectedMove?.changed) {
        return;
      }

      const editor = getActiveEditor();
      if (editor) {
        (editor as unknown as { children: unknown[] }).children = JSON.parse(JSON.stringify(selectedMove.nodes));
        try {
          (editor as { onChange?: () => void }).onChange?.();
        } catch {
        }
      }
      onElementContentChange?.(selectedMove.nodes);
      syncActiveEditorContentAfterCommand();
    };
    const activeEditorElementId = getCurrentActiveEditorId();
    const canUseActiveEditor = canInteractWithEditor()
      && (!elementId || !activeEditorElementId || activeEditorElementId === elementId);
    const restoreMovedItemIndent = () => {
      restoreSelectedListItemIndentSnapshot(selectedListItemIndentSnapshot);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          restoreSelectedListItemIndentSnapshot(selectedListItemIndentSnapshot);
        });
      }
    };

    if (canUseActiveEditor) {
      const didApplyToActiveEditor = direction < 0 ? moveListItemUp() : moveListItemDown();
      if (didApplyToActiveEditor) {
        applySelectedMoveSnapshot();
        restoreMovedItemIndent();
        return;
      }
    }

    if (moveListItemInElementSelection(direction)) {
      applySelectedMoveSnapshot();
      restoreMovedItemIndent();
      return;
    }

    runOrActivateTextEditor(direction < 0 ? 'list-move-item-up' : 'list-move-item-down', () => {
      if (direction < 0) {
        moveListItemUp();
      } else {
        moveListItemDown();
      }
    });
    applySelectedMoveSnapshot();
    restoreMovedItemIndent();
  }, [
    canInteractWithEditor,
    elementId,
    getActiveEditor,
    getCurrentActiveEditorId,
    moveListItemDown,
    moveListItemInElementSelection,
    moveListItemUp,
    onElementContentChange,
    readSelectedListItemIndentSnapshot,
    restoreSelectedListItemIndentSnapshot,
    runOrActivateTextEditor,
    syncActiveEditorContentAfterCommand,
  ]);

  const toggleBlockquoteForElementOrSelection = useCallback(() => {
    if (!isTargetEditorUsable()) {
      toggleBlockquoteInElementContent();
      return;
    }

    const didApply = runForTextSelectionOrCaret(() => {
      toggleBlockquote();
    }, false);

    if (!didApply) {
      toggleBlockquoteInElementContent();
    }
  }, [isTargetEditorUsable, runForTextSelectionOrCaret, toggleBlockquote, toggleBlockquoteInElementContent]);

  const runForCaretPosition = useCallback((fn: () => void) => {
    const editor = getActiveEditor();
    if (!editor) {
      logTextAction('runForCaretPosition.aborted.no-editor');
      return;
    }

    const hasRestored = restoreSelection({ requireTextSelection: false });
    if (!hasRestored) {
      logTextAction('runForCaretPosition.restore-failed');
      return;
    }

    storeSelection();

    try {
      logTextAction('runForCaretPosition.execute', { actionName: activePropertyActionRef.current });
      fn();
    } finally {
      logTextAction('runForCaretPosition.restore-cursor');
      storeSelection();
    }
  }, [activePropertyActionRef, getActiveEditor, logTextAction, restoreSelection, storeSelection]);

  const stopBubble = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  const runMark = useCallback((format: string, value?: any) => {
    if (canTargetEditorControlContent()) {
      let didApplyToActiveEditor = false;
      const didRunSelectionCommand = runForTextSelectionOrCaretNoFallback(() => {
        didApplyToActiveEditor = applyTextMarkToActiveEditor(format, value);
      });

      if (!didRunSelectionCommand || !didApplyToActiveEditor) {
        logTextAction('runMark.active-editor-apply-failed', {
          format,
          actionName: activePropertyActionRef.current,
          didRunSelectionCommand,
          didApplyToActiveEditor,
        });
      }
      return;
    }

    if (!canUseActiveTextFormatting()) {
      applyTextMarkToElementContent(format, value);
      return;
    }

    let didApplyToActiveEditor = false;
    const didRunSelectionCommand = runForTextSelectionOrCaretNoFallback(() => {
      didApplyToActiveEditor = applyTextMarkToActiveEditor(format, value);
    });

    if (!didRunSelectionCommand || !didApplyToActiveEditor) {
      applyTextMarkToElementContent(format, value);
    }
  }, [
    applyTextMarkToActiveEditor,
    applyTextMarkToElementContent,
    canUseActiveTextFormatting,
    canTargetEditorControlContent,
    runForTextSelectionOrCaretNoFallback,
    logTextAction,
  ]);

  const toggleTextMark = useCallback((format: string) => {
    if (!canUseActiveTextFormatting()) {
      const currentValue = readActiveTextMark(format);
      const isEnabled = currentValue !== MARK_ABSENT && currentValue !== MARK_MIXED && !!currentValue;
      const didApply = canTargetEditorControlContent()
        ? runForTextSelectionOrCaret(() => {
          const currentValueFromEditor = readActiveTextMark(format);
          const isEnabledFromEditor = currentValueFromEditor !== MARK_ABSENT && currentValueFromEditor !== MARK_MIXED && !!currentValueFromEditor;
          applyTextMarkToActiveEditor(format, isEnabledFromEditor ? '' : true);
        })
        : false;

      if (!didApply) {
        applyTextMarkToElementContent(format, isEnabled ? '' : true);
      }
      return;
    }

    const didApply = runForTextSelectionOrCaretNoFallback(() => {
      const currentValue = readActiveTextMark(format);
      const isEnabled = currentValue !== MARK_ABSENT && currentValue !== MARK_MIXED && !!currentValue;
      applyTextMarkToActiveEditor(format, isEnabled ? '' : true);
    });

    if (!didApply) {
      const currentValue = readActiveTextMark(format);
      const isEnabled = currentValue !== MARK_ABSENT && currentValue !== MARK_MIXED && !!currentValue;
      applyTextMarkToElementContent(format, isEnabled ? '' : true);
    }
  }, [
    applyTextMarkToActiveEditor,
    applyTextMarkToElementContent,
    canUseActiveTextFormatting,
    canTargetEditorControlContent,
    readActiveTextMark,
    runForTextSelectionOrCaret,
    runForTextSelectionOrCaretNoFallback,
  ]);

  const runSelectedTextCommand = useCallback((actionName: string, action: () => void) => {
    const execute = () => {
      restoreSelection({ requireTextSelection: false });
      action();
    };

    if (canTargetEditorControlContent()) {
      runContentProperty(actionName, execute, { requireActiveEditor: false });
      return;
    }

    runContentProperty(actionName, execute);
  }, [canTargetEditorControlContent, restoreSelection, runContentProperty]);

  const insertTextAtSelection = useCallback((text: string) => {
    if (!text) {
      return;
    }

    runForTextSelectionOrCaret(() => {
      const editor = getActiveEditor();
      if (!editor) {
        return;
      }

      Transforms.insertText(editor as any, text);
      syncActiveEditorContentAfterCommand();
    });
  }, [getActiveEditor, runForTextSelectionOrCaret, syncActiveEditorContentAfterCommand]);

  const clearRichTextFormatting = useCallback(() => {
    const fallbackPayload = {
      bold: '',
      italic: '',
      underline: '',
      strikethrough: '',
      code: '',
      color: '',
      backgroundColor: '',
      fontFamily: '',
      fontSize: '',
      fontStyle: '',
      textDecoration: '',
    };

    if (!canUseActiveTextFormatting()) {
      if (canTargetEditorControlContent()) {
        const didApply = runForTextSelectionOrCaret(() => {
          const marks = [
            'bold',
            'italic',
            'underline',
            'strikethrough',
            'code',
            'color',
            'backgroundColor',
            'fontFamily',
            'fontSize',
            'fontStyle',
            'textDecoration',
          ];

          clearActiveTextMarks(marks);
        });

        if (didApply) {
          return;
        }
      }

      applyTextMarksToElementContent(fallbackPayload);
      return;
    }

    const didApply = runForTextSelectionOrCaretNoFallback(() => {
      const marks = [
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'code',
        'color',
        'backgroundColor',
        'fontFamily',
        'fontSize',
        'fontStyle',
        'textDecoration',
      ];

      clearActiveTextMarks(marks);
    });

    if (!didApply) {
      applyTextMarksToElementContent(fallbackPayload);
    }
  }, [
    applyTextMarksToElementContent,
    canUseActiveTextFormatting,
    canTargetEditorControlContent,
    clearActiveTextMarks,
    runForTextSelectionOrCaret,
    runForTextSelectionOrCaretNoFallback,
  ]);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedFontValue, setSelectedFontValue] = useState('inherit');
  const [selectedFontSizeValue, setSelectedFontSizeValue] = useState('');
  const [selectedFontColorValue, setSelectedFontColorValue] = useState('');
  const [selectedHighlightColorValue, setSelectedHighlightColorValue] = useState('');
  const [selectedTableCellFillValue, setSelectedTableCellFillValue] = useState('');
  const [selectedTableCellBorderValue, setSelectedTableCellBorderValue] = useState('');
  const [selectedTableCellVerticalAlignValue, setSelectedTableCellVerticalAlignValue] = useState<'top' | 'middle' | 'bottom'>('top');
  const [selectedTableCaptionValue, setSelectedTableCaptionValue] = useState('');
  const [insertDialog, setInsertDialog] = useState<{
    mode: InsertDialogMode;
    value: string;
    error?: string;
  } | null>(null);
  const openEmojiPicker = useCallback(() => {
    logTextAction('openEmojiPicker', { currentlyOpen: showEmojiPicker });
    const buttonRect = emojiButtonRef.current?.getBoundingClientRect();
    if (buttonRect) {
      setEmojiPickerPosition({
        x: Math.round(buttonRect.left),
        y: Math.round(buttonRect.bottom + 6),
      });
    } else {
      logTextAction('openEmojiPicker.no-button-rect');
      setEmojiPickerPosition(null);
    }

    setShowEmojiPicker((prev) => {
      const next = !prev;
      logTextAction('openEmojiPicker.toggle', { prev, next });
      return next;
    });
  }, [logTextAction, showEmojiPicker]);

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    const updatePickerPosition = () => {
      const buttonRect = emojiButtonRef.current?.getBoundingClientRect();
      if (!buttonRect) {
        return;
      }

      setEmojiPickerPosition({
        x: Math.round(buttonRect.left),
        y: Math.round(buttonRect.bottom + 6),
      });
    };

    updatePickerPosition();
    window.addEventListener('resize', updatePickerPosition);
    window.addEventListener('scroll', updatePickerPosition, true);

    return () => {
      window.removeEventListener('resize', updatePickerPosition);
      window.removeEventListener('scroll', updatePickerPosition, true);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    return () => {
      if (pendingActionRef.current) {
        window.clearTimeout(pendingActionRef.current);
      }
    };
  }, []);

  const onFontFamilyChange = useCallback((value: string) => {
    logTextAction('content-property.font-family-change', {
      actionName: 'fontFamily',
      value,
    });
    setSelectedFontValue(value);
    const applyFontFamily = () => {
      restoreSelection({ requireTextSelection: false });
      runMark('fontFamily', value === 'inherit' ? '' : value);
    };

    if (canTargetEditorControlContent()) {
      runContentProperty('fontFamily', applyFontFamily, { requireActiveEditor: false });
      return;
    }

    runContentProperty('fontFamily', applyFontFamily);
  }, [canTargetEditorControlContent, restoreSelection, runMark, runContentProperty]);

  const onFontSizeChange = useCallback((value: string) => {
    const normalizedValue = value.trim();

    const applyFontSize = () => {
      if (!normalizedValue) {
        runMark('fontSize', '');
        setSelectedFontSizeValue('');
        return;
      }

      const size = parseFloat(normalizedValue);
      if (Number.isFinite(size) && size > 0) {
        const clamped = Math.max(8, Math.min(120, Math.round(size)));
        setSelectedFontSizeValue(`${clamped}`);
        restoreSelection({ requireTextSelection: false });
        runMark('fontSize', `${clamped}px`);
      }
    };

    if (canTargetEditorControlContent()) {
      runContentProperty('fontSize', applyFontSize, { requireActiveEditor: false });
      return;
    }

    runContentProperty('fontSize', applyFontSize);
  }, [canTargetEditorControlContent, restoreSelection, runMark, runContentProperty]);

  const onFontSizeCommit = useCallback((value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      setSelectedFontSizeValue('');
      onFontSizeChange('');
      return;
    }

    const size = Number.parseFloat(normalizedValue);
    if (!Number.isFinite(size) || size <= 0) {
      onFontSizeChange(value);
      return;
    }

    const clamped = Math.max(8, Math.min(120, Math.round(size)));
    setSelectedFontSizeValue(`${clamped}`);
    onFontSizeChange(`${clamped}`);
  }, [onFontSizeChange]);

  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const textColorTriggerRef = useRef<HTMLSpanElement>(null);
  const highlightColorTriggerRef = useRef<HTMLSpanElement>(null);
  const tableCellFillTriggerRef = useRef<HTMLSpanElement>(null);
  const tableCellBorderTriggerRef = useRef<HTMLSpanElement>(null);
  const quickFontFamilies = useMemo(() => {
    const list = fontFamilies.some((font) => font.value === 'inherit')
      ? fontFamilies
      : [{ value: 'inherit', label: 'Inherit', source: 'system' as const }, ...fontFamilies];

    const seen = new Set<string>();
    return list.filter((font) => {
      const key = font.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [fontFamilies]);

  const insertEmoji = useCallback((emoji: string) => {
    logTextAction('insertEmoji', { emoji, currentlyOpen: showEmojiPicker });
    runContentProperty('emoji', () => insertTextAtSelection(emoji));
    setShowEmojiPicker(false);
  }, [insertTextAtSelection, runContentProperty, showEmojiPicker]);

  const applyOrOpenLinkAction = () => {
    logTextAction('content-property.link-click', {
      actionName: 'insert-link',
    });
    if (onOpenLinkModal) {
      logTextAction('applyOrOpenLinkAction', { mode: 'modal' });
      onOpenLinkModal();
      return;
    }

    storeSelection();
    setInsertDialog({
      mode: 'link',
      value: '',
    });
  };

  const applyOrOpenMediaAction = () => {
    logTextAction('content-property.media-click', {
      actionName: 'insert-image',
    });
    if (onOpenMediaLibrary) {
      logTextAction('applyOrOpenMediaAction', { mode: 'library' });
      onOpenMediaLibrary();
      return;
    }

    storeSelection();
    setInsertDialog({
      mode: 'image',
      value: '',
    });
  };

  const confirmInsertDialog = useCallback(() => {
    if (!insertDialog) {
      return;
    }

    const value = insertDialog.value.trim();
    if (!value) {
      setInsertDialog((current) => current ? {
        ...current,
        error: insertDialog.mode === 'link' ? 'Enter a link URL.' : 'Enter an image URL.',
      } : current);
      return;
    }

    if (insertDialog.mode === 'image' && !/^https?:\/\//i.test(value) && !value.startsWith('/')) {
      setInsertDialog((current) => current ? {
        ...current,
        error: 'Use an absolute URL or a site-relative path.',
      } : current);
      return;
    }

    if (insertDialog.mode === 'link') {
      logTextAction('confirmInsertDialog', { mode: 'link', url: value });
      runOrActivateTextEditor('insert-link', () => runForCaretPosition(() => insertLink(value)));
    } else {
      logTextAction('confirmInsertDialog', { mode: 'image', url: value });
      runOrActivateTextEditor('insert-image', () => runForCaretPosition(() => insertImage(value)));
    }

    setInsertDialog(null);
  }, [
    insertDialog,
    insertImage,
    insertLink,
    logTextAction,
    runForCaretPosition,
    runOrActivateTextEditor,
  ]);

  const insertTableAtSelection = useCallback(() => {
    runOrActivateTextEditor('insert-table', () => {
      insertTable();
    });
  }, [insertTable, runOrActivateTextEditor]);

  const addTableRowAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-add-row', () => {
      addTableRow();
    });
  }, [addTableRow, runOrActivateTextEditor]);

  const addTableColumnAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-add-column', () => {
      addTableColumn();
    });
  }, [addTableColumn, runOrActivateTextEditor]);

  const removeTableRowAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-remove-row', () => {
      removeTableRow();
    });
  }, [removeTableRow, runOrActivateTextEditor]);

  const removeTableColumnAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-remove-column', () => {
      removeTableColumn();
    });
  }, [removeTableColumn, runOrActivateTextEditor]);

  const duplicateTableRowAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-duplicate-row', () => {
      duplicateTableRow();
    });
  }, [duplicateTableRow, runOrActivateTextEditor]);

  const duplicateTableColumnAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-duplicate-column', () => {
      duplicateTableColumn();
    });
  }, [duplicateTableColumn, runOrActivateTextEditor]);

  const moveTableRowUpAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-move-row-up', () => {
      moveTableRowUp();
    });
  }, [moveTableRowUp, runOrActivateTextEditor]);

  const moveTableRowDownAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-move-row-down', () => {
      moveTableRowDown();
    });
  }, [moveTableRowDown, runOrActivateTextEditor]);

  const moveTableColumnLeftAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-move-column-left', () => {
      moveTableColumnLeft();
    });
  }, [moveTableColumnLeft, runOrActivateTextEditor]);

  const moveTableColumnRightAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-move-column-right', () => {
      moveTableColumnRight();
    });
  }, [moveTableColumnRight, runOrActivateTextEditor]);

  const toggleTableHeaderRowAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-toggle-header-row', () => {
      toggleTableHeaderRow();
    });
  }, [runOrActivateTextEditor, toggleTableHeaderRow]);

  const toggleTableHeaderColumnAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-toggle-header-column', () => {
      toggleTableHeaderColumn();
    });
  }, [runOrActivateTextEditor, toggleTableHeaderColumn]);

  const toggleTableHeaderCellAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-toggle-header-cell', () => {
      toggleTableHeaderCell();
    });
  }, [runOrActivateTextEditor, toggleTableHeaderCell]);

  const mergeTableCellRightAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-merge-cell-right', () => {
      mergeTableCellRight();
    });
  }, [mergeTableCellRight, runOrActivateTextEditor]);

  const mergeTableCellDownAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-merge-cell-down', () => {
      mergeTableCellDown();
    });
  }, [mergeTableCellDown, runOrActivateTextEditor]);

  const splitTableCellAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-split-cell', () => {
      splitTableCell();
    });
  }, [runOrActivateTextEditor, splitTableCell]);

  const readSelectedTableCaption = useCallback(() => {
    const editor = getActiveEditor();
    const selection = editor?.selection;
    if (!editor || !selection || !SlateRange.isRange(selection)) {
      return '';
    }

    const tableEntry = Editor.above(editor as any, {
      at: selection,
      match: (node) => (node as { type?: unknown }).type === 'table',
    });
    const tableNode = tableEntry?.[0] as { caption?: unknown } | undefined;
    return typeof tableNode?.caption === 'string' ? tableNode.caption : '';
  }, [getActiveEditor]);

  const readSelectedTableCellFill = useCallback(() => {
    const editor = getActiveEditor();
    const selection = editor?.selection;
    if (!editor || !selection || !SlateRange.isRange(selection)) {
      return '';
    }

    const cellEntry = Editor.above(editor as any, {
      at: selection,
      match: (node) => {
        const type = (node as { type?: unknown }).type;
        return type === 'td' || type === 'th';
      },
    });
    const cellNode = cellEntry?.[0] as { backgroundColor?: unknown } | undefined;
    return typeof cellNode?.backgroundColor === 'string' ? cellNode.backgroundColor : '';
  }, [getActiveEditor]);

  const readSelectedTableCellBorder = useCallback(() => {
    const editor = getActiveEditor();
    const selection = editor?.selection;
    if (!editor || !selection || !SlateRange.isRange(selection)) {
      return '';
    }

    const cellEntry = Editor.above(editor as any, {
      at: selection,
      match: (node) => {
        const type = (node as { type?: unknown }).type;
        return type === 'td' || type === 'th';
      },
    });
    const cellNode = cellEntry?.[0] as { borderColor?: unknown } | undefined;
    return typeof cellNode?.borderColor === 'string' ? cellNode.borderColor : '';
  }, [getActiveEditor]);

  const readSelectedTableCellVerticalAlign = useCallback((): 'top' | 'middle' | 'bottom' => {
    const editor = getActiveEditor();
    const selection = editor?.selection;
    if (!editor || !selection || !SlateRange.isRange(selection)) {
      return 'top';
    }

    const cellEntry = Editor.above(editor as any, {
      at: selection,
      match: (node) => {
        const type = (node as { type?: unknown }).type;
        return type === 'td' || type === 'th';
      },
    });
    const cellNode = cellEntry?.[0] as { verticalAlign?: unknown } | undefined;
    const value = typeof cellNode?.verticalAlign === 'string' ? cellNode.verticalAlign : '';
    return value === 'middle' || value === 'bottom' ? value : 'top';
  }, [getActiveEditor]);

  const updateTableCellFillAtSelection = useCallback((color: string) => {
    setSelectedTableCellFillValue(color);
    if (canTargetEditorControlContent()) {
      setTableCellBackgroundColor(color);
      return;
    }
    runOrActivateTextEditor('table-cell-fill', () => {
      setTableCellBackgroundColor(color);
    });
  }, [canTargetEditorControlContent, runOrActivateTextEditor, setTableCellBackgroundColor]);

  const updateTableCellBorderAtSelection = useCallback((color: string) => {
    setSelectedTableCellBorderValue(color);
    if (canTargetEditorControlContent()) {
      setTableCellBorderColor(color);
      return;
    }
    runOrActivateTextEditor('table-cell-border', () => {
      setTableCellBorderColor(color);
    });
  }, [canTargetEditorControlContent, runOrActivateTextEditor, setTableCellBorderColor]);

  const updateTableCellVerticalAlignAtSelection = useCallback((align: 'top' | 'middle' | 'bottom') => {
    setSelectedTableCellVerticalAlignValue(align);
    if (canTargetEditorControlContent()) {
      setTableCellVerticalAlign(align);
      return;
    }
    runOrActivateTextEditor('table-cell-vertical-align', () => {
      setTableCellVerticalAlign(align);
    });
  }, [canTargetEditorControlContent, runOrActivateTextEditor, setTableCellVerticalAlign]);

  const updateTableCaptionAtSelection = useCallback((caption: string) => {
    setSelectedTableCaptionValue(caption);
    if (canTargetEditorControlContent()) {
      setTableCaption(caption);
      return;
    }
    runOrActivateTextEditor('table-caption', () => {
      setTableCaption(caption);
    });
  }, [canTargetEditorControlContent, runOrActivateTextEditor, setTableCaption]);

  const removeTableAtSelection = useCallback(() => {
    runOrActivateTextEditor('table-remove', () => {
      removeTable();
    });
  }, [removeTable, runOrActivateTextEditor]);

  const onFontSizeBlur = (event: FocusEvent<HTMLInputElement>) => {
    logTextAction('content-property.font-size-blur', {
      actionName: 'font-size-blur',
      value: event.target.value,
    });
    onFontSizeCommit(event.target.value);
  };

  useEffect(() => {
    const activeEditor = getActiveEditor();
    const activeEditorMatches = isTargetEditorInEditableMode();

    if (!activeEditorMatches) {
      const inactiveFontFamily = readActiveTextMark('fontFamily');
      const inactiveFontSize = readActiveTextMark('fontSize');
      const inactiveColor = readActiveTextMark('color');
      const inactiveHighlight = readActiveTextMark('backgroundColor');

      if (inactiveFontFamily !== MARK_MIXED) {
        if (inactiveFontFamily === MARK_ABSENT) {
          setSelectedFontValue('inherit');
        } else if (typeof inactiveFontFamily === 'string' && fontFamilies.some((font) => font.value === inactiveFontFamily)) {
          setSelectedFontValue(inactiveFontFamily);
        }
      }

      if (inactiveFontSize !== MARK_MIXED) {
        if (inactiveFontSize === MARK_ABSENT) {
          setSelectedFontSizeValue('');
        } else if (typeof inactiveFontSize === 'string' && inactiveFontSize) {
          setSelectedFontSizeValue(inactiveFontSize.replace(/px$/i, ''));
        } else if (typeof inactiveFontSize === 'number') {
          setSelectedFontSizeValue(`${inactiveFontSize}`);
        }
      }

      if (inactiveColor !== MARK_MIXED) {
        if (inactiveColor === MARK_ABSENT) {
          setSelectedFontColorValue('');
        } else if (typeof inactiveColor === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(inactiveColor)) {
          setSelectedFontColorValue(inactiveColor);
        }
      }

      if (inactiveHighlight !== MARK_MIXED) {
        if (inactiveHighlight === MARK_ABSENT) {
          setSelectedHighlightColorValue('');
        } else if (typeof inactiveHighlight === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(inactiveHighlight)) {
          setSelectedHighlightColorValue(inactiveHighlight);
        }
      }

      return;
    }

    const fontFamilyValue = readActiveTextMark('fontFamily');
    const fontSizeValue = readActiveTextMark('fontSize');
    const colorValue = readActiveTextMark('color');
    const highlightValue = readActiveTextMark('backgroundColor');

    if (!activeEditor) {
      setSelectedFontSizeValue('');
      setSelectedFontValue('inherit');
      setSelectedFontColorValue('');
      setSelectedHighlightColorValue('');
      return;
    }

    if (fontFamilyValue !== MARK_MIXED) {
      if (fontFamilyValue === MARK_ABSENT) {
        setSelectedFontValue('inherit');
      } else if (typeof fontFamilyValue === 'string' && fontFamilies.some((font) => font.value === fontFamilyValue)) {
        setSelectedFontValue(fontFamilyValue);
      } else {
        setSelectedFontValue('inherit');
      }
    }

    if (fontSizeValue !== MARK_MIXED) {
      if (fontSizeValue === MARK_ABSENT) {
        setSelectedFontSizeValue('');
      } else if (typeof fontSizeValue === 'string' && fontSizeValue) {
        setSelectedFontSizeValue(fontSizeValue.replace(/px$/i, ''));
      } else if (typeof fontSizeValue === 'number') {
        setSelectedFontSizeValue(`${fontSizeValue}`);
      } else {
        setSelectedFontSizeValue('');
      }
    }

    if (colorValue !== MARK_MIXED) {
      if (colorValue === MARK_ABSENT) {
        setSelectedFontColorValue('');
      } else if (typeof colorValue === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(colorValue)) {
        setSelectedFontColorValue(colorValue);
      } else {
        setSelectedFontColorValue('');
      }
    }

    if (highlightValue !== MARK_MIXED) {
      if (highlightValue === MARK_ABSENT) {
        setSelectedHighlightColorValue('');
      } else if (typeof highlightValue === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(highlightValue)) {
        setSelectedHighlightColorValue(highlightValue);
      } else {
        setSelectedHighlightColorValue('');
      }
    }
  }, [elementId, fontFamilies, getActiveEditor, isTargetEditorInEditableMode, readActiveTextMark, selectionRevision]);

  useEffect(() => {
    if (!isTargetEditorInEditableMode()) {
      return;
    }

    setSelectedTableCaptionValue(readSelectedTableCaption());
    setSelectedTableCellFillValue(readSelectedTableCellFill());
    setSelectedTableCellBorderValue(readSelectedTableCellBorder());
    setSelectedTableCellVerticalAlignValue(readSelectedTableCellVerticalAlign());
  }, [isTargetEditorInEditableMode, readSelectedTableCaption, readSelectedTableCellBorder, readSelectedTableCellFill, readSelectedTableCellVerticalAlign, selectionRevision]);

  useEffect(() => {
    if (fontFamilies.length === 0) {
      setSelectedFontValue('inherit');
      return;
    }

    setSelectedFontValue((prev) => {
      const valid = fontFamilies.some((font) => font.value === prev);
      if (valid) {
        return prev;
      }
      return 'inherit';
    });
  }, [fontFamilies]);

  return (
    <div
      className={cn("space-y-3 border border-border rounded-lg p-3 bg-card/40 text-xs")}
      onMouseDown={stopBubble}
      onMouseUp={stopBubble}
      onClick={stopBubble}
    >
      <div className="flex items-center gap-2">
            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runSelectedTextCommand('bold', () => {
                toggleTextMark('bold');
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('bold') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          data-testid="rich-text-bold"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runSelectedTextCommand('italic', () => {
                toggleTextMark('italic');
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('italic') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          data-testid="rich-text-italic"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runSelectedTextCommand('underline', () => {
                toggleTextMark('underline');
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('underline') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          data-testid="rich-text-underline"
          title="Underline"
        >
          <Underline className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runSelectedTextCommand('strikethrough', () => {
                toggleTextMark('strikethrough');
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('strikethrough') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          data-testid="rich-text-strikethrough"
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runSelectedTextCommand('code', () => {
                toggleTextMark('code');
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('code') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          data-testid="rich-text-code"
          title="Inline code"
        >
          <Type className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            applyAlignmentToElementOrSelection('left');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-align-left"
          title="Align left"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            applyAlignmentToElementOrSelection('center');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-align-center"
          title="Align center"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            applyAlignmentToElementOrSelection('right');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-align-right"
          title="Align right"
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleBlockquoteForElementOrSelection();
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-blockquote"
          title="Blockquote"
        >
          <Quote className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            storeSelection();
            toggleElementListType('ul');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-list-ul"
          title="Bulleted list"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            storeSelection();
            toggleElementListType('ol');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-list-ol"
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            suppressNextListIndentClickRef.current = true;
            runListIndentControl(-1);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (suppressNextListIndentClickRef.current) {
              suppressNextListIndentClickRef.current = false;
              return;
            }
            runListIndentControl(-1);
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-list-outdent"
          title="Outdent list"
        >
          <span className="text-[10px]">◀</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            suppressNextListIndentClickRef.current = true;
            runListIndentControl(1);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (suppressNextListIndentClickRef.current) {
              suppressNextListIndentClickRef.current = false;
              return;
            }
            runListIndentControl(1);
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-list-indent"
          title="Indent list"
        >
          <span className="text-[10px]">▶</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            moveListItemAtSelection(-1);
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-list-move-up"
          title="Move list item up"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            moveListItemAtSelection(1);
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-list-move-down"
          title="Move list item down"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Palette className="w-3 h-3" />
          <span className="text-muted-foreground whitespace-nowrap">Selected Font</span>
          <select
            onChange={(event) => onFontFamilyChange(event.target.value)}
            onInput={(event) => onFontFamilyChange((event.target as HTMLSelectElement).value)}
            value={selectedFontValue}
            onMouseDown={(event) => {
              storeSelection();
              const currentFontFamily = readActiveTextMark('fontFamily');
              if (currentFontFamily === MARK_ABSENT) {
                setSelectedFontValue('inherit');
              } else if (typeof currentFontFamily === 'string' && fontFamilies.some((font) => font.value === currentFontFamily)) {
                setSelectedFontValue(currentFontFamily);
              }
              event.stopPropagation();
            }}
              className={cn("w-full min-w-0 px-2 py-1.5 text-sm rounded-md border bg-background", "hover:bg-accent")}
              data-testid="rich-text-font-family"
              title="Selected font family"
            >
            {quickFontFamilies.map((font) => (
              <option
                key={`${font.source}-${font.value}`}
                value={font.value}
                style={{ fontFamily: toFontFamilyStyle(font.value) }}
              >
                {font.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Type className="w-3 h-3" />
          <span className="text-muted-foreground">Font Size</span>
          <input
            type="number"
            min={8}
            max={120}
            step={1}
            value={selectedFontSizeValue}
            placeholder="px"
            onMouseDown={(e) => {
              storeSelection();
              e.stopPropagation();
            }}
            onChange={(event) => onFontSizeChange(event.target.value)}
            onBlur={onFontSizeBlur}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onFontSizeCommit(event.currentTarget.value);
                event.currentTarget.blur();
              }
            }}
            className="w-full px-2 py-1.5 text-sm rounded-md border bg-background"
            data-testid="rich-text-font-size"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('clear-formatting', () => {
              clearRichTextFormatting();
            }, { requireActiveEditor: false });
          }}
          className="w-full py-1.5 rounded border border-border hover:bg-accent text-[11px] text-muted-foreground"
          data-testid="rich-text-clear-formatting"
          title="Clear selected text formatting"
        >
          <Eraser className="w-4 h-4 mr-2 inline" />
          Clear Selection Style
        </button>

        <label className="flex items-center gap-2 text-xs">
          <Palette className="w-3 h-3" />
          <span className="text-muted-foreground whitespace-nowrap">Text Color</span>
          <span
            className="ml-auto inline-flex"
            ref={textColorTriggerRef}
            onMouseDownCapture={() => storeSelection()}
          >
            <ColorPicker
              value={selectedFontColorValue}
              testId="rich-text-text-color"
              triggerRef={textColorTriggerRef}
              onChange={(c) => {
                setSelectedFontColorValue(c);
                const applyTextColor = () => {
                  runMark('color', c);
                };
                runSelectedTextCommand('textColor', applyTextColor);
              }}
            />
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Highlighter className="w-3 h-3" />
          <span className="text-muted-foreground whitespace-nowrap">Highlight</span>
          <span
            className="ml-auto inline-flex"
            ref={highlightColorTriggerRef}
            onMouseDownCapture={() => storeSelection()}
          >
            <ColorPicker
              value={selectedHighlightColorValue}
              testId="rich-text-highlight-color"
              triggerRef={highlightColorTriggerRef}
              onChange={(c) => {
                setSelectedHighlightColorValue(c);
                const applyHighlightColor = () => {
                  runMark('backgroundColor', c);
                };
                runSelectedTextCommand('highlight', applyHighlightColor);
              }}
              className="ml-auto"
            />
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-xs flex-1">
          <Plus className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground whitespace-nowrap">Insert</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <div className="relative">
            <button
              type="button"
              ref={emojiButtonRef}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openEmojiPicker();
              }}
              className={cn(
                "w-8 h-8 rounded border border-border grid place-items-center",
                  "hover:bg-accent"
              )}
              title="Insert emoji"
            >
              <span>😊</span>
            </button>
          </div>
          <EmojiPickerModal
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onSelect={insertEmoji}
            closeOnSelect={false}
            position={emojiPickerPosition || undefined}
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('insert-image', () => applyOrOpenMediaAction(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Insert image"
          >
            <Image className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('insert-table', () => insertTableAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-insert-table"
            title="Insert table"
          >
            <Table className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-add-row', () => addTableRowAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-add-row"
            title="Add table row"
          >
            <Rows3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-add-column', () => addTableColumnAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-add-column"
            title="Add table column"
          >
            <Columns3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-merge-cell-down', () => mergeTableCellDownAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-merge-cell-down"
            title="Merge table cell down"
          >
            <Rows3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-duplicate-row', () => duplicateTableRowAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-duplicate-row"
            title="Duplicate table row"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-duplicate-column', () => duplicateTableColumnAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-duplicate-column"
            title="Duplicate table column"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-remove-row', () => removeTableRowAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-remove-row"
            title="Remove table row"
          >
            <Rows2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-remove-column', () => removeTableColumnAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-remove-column"
            title="Remove table column"
          >
            <Columns2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-move-row-up', () => moveTableRowUpAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-move-row-up"
            title="Move table row up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-move-row-down', () => moveTableRowDownAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-move-row-down"
            title="Move table row down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-move-column-left', () => moveTableColumnLeftAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-move-column-left"
            title="Move table column left"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-move-column-right', () => moveTableColumnRightAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-move-column-right"
            title="Move table column right"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-toggle-header-row', () => toggleTableHeaderRowAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-toggle-header-row"
            title="Toggle table header row"
          >
            <TableProperties className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-toggle-header-column', () => toggleTableHeaderColumnAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-toggle-header-column"
            title="Toggle table header column"
          >
            <Columns3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-toggle-header-cell', () => toggleTableHeaderCellAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-toggle-header-cell"
            title="Toggle table header cell"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-merge-cell-right', () => mergeTableCellRightAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-merge-cell-right"
            title="Merge table cell right"
          >
            <Columns3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-split-cell', () => splitTableCellAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-split-cell"
            title="Split table cell"
          >
            <Columns2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('table-remove', () => removeTableAtSelection(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            data-testid="rich-text-table-remove"
            title="Remove table"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('insert-link', () => applyOrOpenLinkAction(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Insert link"
          >
            <Link className="w-4 h-4" />
          </button>
        </div>
      </div>

      <label className="flex min-w-0 items-center gap-2 text-xs">
        <Palette className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground whitespace-nowrap">Cell Fill</span>
        <span
          className="ml-auto inline-flex"
          ref={tableCellFillTriggerRef}
          onMouseDownCapture={() => storeSelection()}
        >
          <ColorPicker
            value={selectedTableCellFillValue}
            testId="rich-text-table-cell-fill"
            triggerRef={tableCellFillTriggerRef}
            onChange={(color) => {
              runContentProperty('table-cell-fill', () => {
                updateTableCellFillAtSelection(color);
              }, { requireActiveEditor: false });
            }}
          />
        </span>
      </label>

      <label className="flex min-w-0 items-center gap-2 text-xs">
        <Square className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground whitespace-nowrap">Cell Border</span>
        <span
          className="ml-auto inline-flex"
          ref={tableCellBorderTriggerRef}
          onMouseDownCapture={() => storeSelection()}
        >
          <ColorPicker
            value={selectedTableCellBorderValue}
            testId="rich-text-table-cell-border"
            triggerRef={tableCellBorderTriggerRef}
            onChange={(color) => {
              runContentProperty('table-cell-border', () => {
                updateTableCellBorderAtSelection(color);
              }, { requireActiveEditor: false });
            }}
          />
        </span>
      </label>

      <div className="flex min-w-0 items-center gap-2 text-xs">
        <Rows2 className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground whitespace-nowrap">Cell Vertical</span>
        <div className="ml-auto grid grid-cols-3 gap-1">
          {([
            { value: 'top', icon: ArrowUp, title: 'Align cell content to top' },
            { value: 'middle', icon: AlignCenter, title: 'Align cell content to middle' },
            { value: 'bottom', icon: ArrowDown, title: 'Align cell content to bottom' },
          ] as const).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  runContentProperty(`table-cell-vertical-${option.value}`, () => {
                    updateTableCellVerticalAlignAtSelection(option.value);
                  }, { requireActiveEditor: false });
                }}
                className={cn(
                  "w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent",
                  selectedTableCellVerticalAlignValue === option.value && "bg-accent text-accent-foreground"
                )}
                data-testid={`rich-text-table-cell-vertical-${option.value}`}
                title={option.title}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex min-w-0 items-center gap-2 text-xs">
        <TableProperties className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground whitespace-nowrap">Table Caption</span>
        <input
          type="text"
          value={selectedTableCaptionValue}
          placeholder="Add caption"
          onMouseDown={(e) => {
            storeSelection();
            e.stopPropagation();
          }}
          onChange={(event) => {
            const nextCaption = event.target.value;
            runContentProperty('table-caption', () => {
              updateTableCaptionAtSelection(nextCaption);
            }, { requireActiveEditor: false });
          }}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          data-testid="rich-text-table-caption"
          title="Table caption"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('table-caption-clear', () => {
              updateTableCaptionAtSelection('');
            }, { requireActiveEditor: false });
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          data-testid="rich-text-table-caption-clear"
          title="Clear table caption"
        >
          <X className="w-4 h-4" />
        </button>
      </label>

      {insertDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <form
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              confirmInsertDialog();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-muted p-2 text-foreground">
                  {insertDialog.mode === 'link' ? <Link className="h-5 w-5" /> : <Image className="h-5 w-5" />}
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {insertDialog.mode === 'link' ? 'Insert link' : 'Insert image'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {insertDialog.mode === 'link'
                      ? 'Apply a URL to the selected text or current caret position.'
                      : 'Add an image from a URL or site-relative media path.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInsertDialog(null)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close insert dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-5 block space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {insertDialog.mode === 'link' ? 'Link URL' : 'Image URL'}
              </span>
              <input
                type="text"
                value={insertDialog.value}
                onChange={(event) => setInsertDialog((current) => current ? {
                  ...current,
                  value: event.target.value,
                  error: undefined,
                } : current)}
                placeholder={insertDialog.mode === 'link' ? 'https://example.com' : 'https://example.com/image.jpg'}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                autoFocus
              />
            </label>

            {insertDialog.error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {insertDialog.error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInsertDialog(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {insertDialog.mode === 'link' ? 'Insert link' : 'Insert image'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default RichTextFormatting;
