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
    indentList,
    outdentList,
    insertLink,
    insertImage,
    storeSelection,
  } = useActiveEditor();

  const pendingActionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePropertyActionRef = useRef<string>('unknown');

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

  const getRootListTypeFromContent = useCallback(() => {
    if (!normalizedElementContent.length) {
      return null;
    }

    const firstNode = normalizedElementContent[0];
    if (!firstNode || typeof firstNode !== 'object') {
      return null;
    }

    const type = (firstNode as { type?: unknown }).type;
    if (type === 'ul' || type === 'ol') {
      return type;
    }

    return null;
  }, [normalizedElementContent]);

  const toListItemNodes = useCallback((nodes: unknown[]): unknown[] => {
    const listItems = nodes.flatMap((node) => {
      if (!node || typeof node !== 'object') {
        return [{
          type: 'li',
          children: [{ text: String(node ?? '') }],
        }] as Record<string, unknown>;
      }

      const typed = node as Record<string, unknown>;
      if (typed.type === 'li') {
        return [typed];
      }

      const children = Array.isArray((typed as { children?: unknown }).children)
        ? (typed as { children: unknown[] }).children
        : null;

      if (!children) {
        return [{
          type: 'li',
          children: [{ text: String(typed.text || '') }],
        }] as Record<string, unknown>;
      }

      return [{
        type: 'li',
        children,
      }] as Record<string, unknown>;
    });

    return listItems.length
      ? listItems
      : [{ type: 'li', children: [{ text: '' }] }];
  }, []);

  const applyListTypeToElementContent = useCallback((format: 'ul' | 'ol'): boolean => {
    if (!canWriteElementContent()) {
      return false;
    }

    const currentType = getRootListTypeFromContent();
    if (currentType === format) {
      return false;
    }

    let nextContent: unknown[];
    if (currentType === 'ul' || currentType === 'ol') {
      nextContent = normalizedElementContent.map((node) => {
        if (!node || typeof node !== 'object') {
          return node;
        }

        const typed = { ...node } as Record<string, unknown>;
        if (typed.type === 'ul' || typed.type === 'ol') {
          typed.type = format;
        }

        return typed;
      });
    } else {
      const listItems = toListItemNodes(normalizedElementContent);
      nextContent = [{
        type: format,
        children: listItems,
      }];
    }

    onElementContentChange?.(nextContent as unknown[]);
    return true;
  }, [canWriteElementContent, getRootListTypeFromContent, normalizedElementContent, onElementContentChange, toListItemNodes]);

  const applyListIndentToElementContent = useCallback((step: number): boolean => {
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

      if (nextNode.type === 'li') {
        const currentIndent = Number((nextNode.indent as number) || 0);
        if (Number.isFinite(currentIndent)) {
          const nextIndent = Math.max(0, currentIndent + step);
          if (nextIndent === 0) {
            delete nextNode.indent;
          } else {
            nextNode.indent = nextIndent;
          }
        }
      }

      return nextNode;
    };

    const nextContent = normalizedElementContent.map((node) => patchNode(node));
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
      ).map(([node]) => node as Record<string, unknown>);

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

    if (!isTargetEditorInEditableMode() || !hasTargetRangeSelection()) {
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
            const value = (anchorNode as Record<string, unknown>)[format];
            if (value !== undefined) {
              return value as MarkStateValue;
            }
          }
        }
      }

      const textNodes = Array.from(
        Editor.nodes(editor, {
          at: selection,
          match: (node) => Text.isText(node),
          mode: 'all',
        })
      ).map(([node]) => node as Record<string, unknown>);

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
    isTargetEditorActive,
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

    const hasExistingRange = SlateRange.isRange(editor.selection)
      && Node.has(editor as any, editor.selection.anchor.path)
      && Node.has(editor as any, editor.selection.focus.path);

    let hasRestored = hasExistingRange
      ? true
      : restoreSelection({
          requireTextSelection: shouldRequireTextSelection,
        });

    if (!hasRestored && shouldRequireTextSelection) {
      logTextAction('runForRangeSelection.restore-failed', {
        requireTextSelection: true,
      });
      return false;
    }

    const currentSelection = editor.selection;
    let hasActiveRange = currentSelection && SlateRange.isRange(currentSelection);
    let hasValidSelection = hasActiveRange
      && Node.has(editor as any, currentSelection.anchor.path)
      && Node.has(editor as any, currentSelection.focus.path);

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

    if (shouldRequireTextSelection && SlateRange.isCollapsed(editor.selection)) {
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
        return true;
      }

      if (shouldRemove) {
        Editor.removeMark(editor as any, format);
      } else {
        Editor.addMark(editor as any, format, value);
      }

      return true;
    } catch (error) {
      logTextAction('applyTextMarkToActiveEditor.failed', {
        format,
        shouldRemove,
        error: (error as Error)?.message || String(error),
      });
      return false;
    }
  }, [getActiveEditor, logTextAction]);

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

      return true;
    } catch (error) {
      logTextAction('clearActiveTextMarks.failed', {
        error: (error as Error)?.message || String(error),
      });
      return false;
    }
  }, [getActiveEditor, logTextAction]);

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

  const toggleElementListType = useCallback((format: 'ul' | 'ol') => {
    if (!isTargetEditorUsable()) {
      applyListTypeToElementContent(format);
      return;
    }

    const didApply = runForTextSelectionOrCaret(() => {
      toggleList(format);
    }, false);

    if (!didApply) {
      applyListTypeToElementContent(format);
    }
  }, [applyListTypeToElementContent, isTargetEditorUsable, runForTextSelectionOrCaret, toggleList]);

  const adjustElementListIndent = useCallback((step: number) => {
    if (!isTargetEditorUsable()) {
      applyListIndentToElementContent(step);
      return;
    }

    const didApply = step > 0
      ? runForTextSelectionOrCaret(() => {
          indentList();
        }, false)
      : runForTextSelectionOrCaret(() => {
          outdentList();
        }, false);

    if (!didApply) {
      applyListIndentToElementContent(step);
    }
  }, [applyListIndentToElementContent, isTargetEditorUsable, outdentList, indentList, runForTextSelectionOrCaret]);

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
    if (!canUseActiveTextFormatting()) {
      if (canTargetEditorControlContent()) {
        const didApply = runForTextSelectionOrCaret(() => {
          applyTextMarkToActiveEditor(format, value);
        });

        if (didApply) {
          return;
        }
      }

      applyTextMarkToElementContent(format, value);
      return;
    }

    const didApply = runForTextSelectionOrCaretNoFallback(() => {
      applyTextMarkToActiveEditor(format, value);
    });

    if (!didApply) {
      applyTextMarkToElementContent(format, value);
    }
  }, [
    applyTextMarkToActiveEditor,
    applyTextMarkToElementContent,
    canUseActiveTextFormatting,
    canTargetEditorControlContent,
    runForTextSelectionOrCaret,
    runForTextSelectionOrCaretNoFallback,
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
    });
  }, [getActiveEditor, runForTextSelectionOrCaret]);

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
    runContentProperty('fontFamily', () => {
      runMark('fontFamily', value === 'inherit' ? '' : value);
    }, { requireActiveEditor: false });
  }, [runMark, runContentProperty]);

  const onFontSizeChange = useCallback((value: string) => {
    const normalizedValue = value.trim();

    runContentProperty('fontSize', () => {
      if (!normalizedValue) {
        runMark('fontSize', '');
        setSelectedFontSizeValue('');
        return;
      }

      const size = parseFloat(normalizedValue);
      if (Number.isFinite(size) && size > 0) {
        const clamped = Math.max(8, Math.min(120, Math.round(size)));
        setSelectedFontSizeValue(`${clamped}`);
        runMark('fontSize', `${clamped}px`);
      }
    }, { requireActiveEditor: false });
  }, [runMark, runContentProperty]);

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

    const url = window.prompt('Insert link URL for selected text:');
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    logTextAction('applyOrOpenLinkAction', { mode: 'prompt', url: trimmed });
    runOrActivateTextEditor('insert-link', () => runForCaretPosition(() => insertLink(trimmed)));
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

    const url = window.prompt('Insert image URL:');
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    logTextAction('applyOrOpenMediaAction', { mode: 'prompt', url: trimmed });
    runOrActivateTextEditor('insert-image', () => runForCaretPosition(() => insertImage(trimmed)));
  };

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
              runContentProperty('bold', () => {
                toggleTextMark('bold');
              }, { requireActiveEditor: false });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('bold') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('italic', () => {
                toggleTextMark('italic');
              }, { requireActiveEditor: false });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('italic') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('underline', () => {
                toggleTextMark('underline');
              }, { requireActiveEditor: false });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('underline') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title="Underline"
        >
          <Underline className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('strikethrough', () => {
                toggleTextMark('strikethrough');
              }, { requireActiveEditor: false });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('strikethrough') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

            <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runContentProperty('code', () => {
                toggleTextMark('code');
              }, { requireActiveEditor: false });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isTargetMarkActive('code') ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
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
          title="Align right"
        >
          <AlignRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleElementListType('ul');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title="Bulleted list"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleElementListType('ol');
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            adjustElementListIndent(-1);
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title="Outdent list"
        >
          <span className="text-[10px]">◀</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            adjustElementListIndent(1);
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title="Indent list"
        >
          <span className="text-[10px]">▶</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Palette className="w-3 h-3" />
          <span className="text-muted-foreground whitespace-nowrap">Selected Font</span>
          <select
            onChange={(event) => onFontFamilyChange(event.target.value)}
            value={selectedFontValue}
            onMouseDown={(event) => event.stopPropagation()}
              className={cn("w-full min-w-0 px-2 py-1.5 text-sm rounded-md border bg-background", "hover:bg-accent")}
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
          title="Clear selected text formatting"
        >
          <Eraser className="w-4 h-4 mr-2 inline" />
          Clear Selection Style
        </button>

        <label className="flex items-center gap-2 text-xs">
          <Palette className="w-3 h-3" />
          <span className="text-muted-foreground whitespace-nowrap">Text Color</span>
          <span className="ml-auto inline-flex" ref={textColorTriggerRef}>
            <ColorPicker
              value={selectedFontColorValue}
              triggerRef={textColorTriggerRef}
              onChange={(c) => {
                setSelectedFontColorValue(c);
                runContentProperty('textColor', () => {
                  runMark('color', c);
                }, { requireActiveEditor: false });
              }}
            />
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Highlighter className="w-3 h-3" />
          <span className="text-muted-foreground whitespace-nowrap">Highlight</span>
          <span className="ml-auto inline-flex" ref={highlightColorTriggerRef}>
            <ColorPicker
              value={selectedHighlightColorValue}
              triggerRef={highlightColorTriggerRef}
              onChange={(c) => {
                setSelectedHighlightColorValue(c);
                runContentProperty('highlight', () => {
                  runMark('backgroundColor', c);
                }, { requireActiveEditor: false });
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
        <div className="flex items-center justify-end gap-1">
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
              runContentProperty('insert-link', () => applyOrOpenLinkAction(), { requireActiveEditor: false });
            }}
            className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
            title="Insert link"
          >
            <Link className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
}

export default RichTextFormatting;
