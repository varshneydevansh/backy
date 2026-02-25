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
}

const MARK_ABSENT = Symbol('richtext-mark-absent');
const MARK_MIXED = Symbol('richtext-mark-mixed');

type MarkStateValue = string | number | boolean | null | undefined | symbol;

export function RichTextFormatting({
  onOpenMediaLibrary,
  onOpenLinkModal,
  elementId,
}: RichTextFormattingProps) {
  const media = useStore((state) => state.media);
  const fontFamilies = useMemo(() => getFontFamilyOptions(media), [media]);
  const {
    getActiveEditor,
    getActiveEditorElementId,
    setAlign,
    toggleList,
    isMarkActive,
    restoreSelection,
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
  const canInteract = canInteractWithEditor();
  const canStyleSelection = hasSelection() || canInteract;
  const canApplySelection = canStyleSelection;
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

    const hostElement = document.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);
    logTextAction('activateTextEditor.host-query', {
      hasHost: !!hostElement,
      selector: `[data-element-id="${elementId}"]`,
    });
    if (hostElement) {
      logTextAction('activateTextEditor.dispatch-dblclick');
      hostElement.dispatchEvent(
        new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          detail: 2,
          view: window,
        })
      );
    }

    dispatchExternalEditRequest();
    return true;
  }, [elementId, logTextAction]);

  const runOrActivateTextEditor = useCallback((actionName: string, action: () => void) => {
    activePropertyActionRef.current = actionName;
    const currentActiveEditorId = getCurrentActiveEditorId();
    const activeEditorMatchesElement = !elementId || (!!currentActiveEditorId && currentActiveEditorId === elementId);
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
        if (canInteract) {
          logTextAction('runOrActivateTextEditor.poll-fallback-execute', {
            actionName,
            activeEditorId: getCurrentActiveEditorId(),
          });
          action();
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
      hasSelectionNow: hasSelection(),
      shouldActivateEditor,
    });
    if (!shouldActivateEditor) {
      action();
      return;
    }
    runOrActivateTextEditor(actionName, () => {
      storeSelection();
      action();
    });
  }, [canInteractWithEditor, hasSelection, logTextAction, runOrActivateTextEditor, storeSelection]);

  const runForRangeSelection = useCallback((fn: () => void, options?: {
    requireTextSelection?: boolean;
    fallbackToWholeElement?: boolean;
  }) => {
    const editor = getActiveEditor();
    if (!editor) {
      logTextAction('runForRangeSelection.aborted.no-editor', { options });
      return;
    }

    const currentSelection = editor.selection;
    const hasActiveRange = currentSelection && SlateRange.isRange(currentSelection);
    const hasValidSelection = hasActiveRange
      && Node.has(editor as any, currentSelection.anchor.path)
      && Node.has(editor as any, currentSelection.focus.path);
    logTextAction('runForRangeSelection.state', {
      requireTextSelection: options?.requireTextSelection,
      fallbackToWholeElement: options?.fallbackToWholeElement,
      hasActiveRange,
      hasValidSelection,
    });

    const shouldRequireTextSelection = options?.requireTextSelection ?? false;
    if (!hasActiveRange || !hasValidSelection) {
      if (shouldRequireTextSelection) {
        logTextAction('runForRangeSelection.restore-failed', {
          requireTextSelection: shouldRequireTextSelection,
        });
        return;
      }

      try {
        const start = Editor.start(editor as any, []);
        const end = Editor.end(editor as any, []);
        Transforms.select(editor as any, { anchor: start, focus: end });
        logTextAction('runForRangeSelection.restore-fallback-whole-document');
      } catch (error) {
        logTextAction('runForRangeSelection.restore-failed', {
          requireTextSelection: shouldRequireTextSelection,
          reason: 'restore-fallback-failed',
          restoreError: (error as Error)?.message || String(error),
        });
        return;
      }
    }

    storeSelection();

    const selectionSnapshot = SlateRange.isRange(editor.selection)
      ? {
        anchor: {
          path: [...editor.selection.anchor.path],
          offset: editor.selection.anchor.offset,
        },
        focus: {
          path: [...editor.selection.focus.path],
          offset: editor.selection.focus.offset,
        },
      }
      : null;

    if (
      options?.fallbackToWholeElement &&
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

    try {
      logTextAction('runForRangeSelection.execute', { actionName: activePropertyActionRef.current });
      fn();
    } finally {
      if (selectionSnapshot) {
        try {
          Transforms.select(editor as any, selectionSnapshot);
        } catch {
        }
      }
      logTextAction('runForRangeSelection.restore-cursor');
      storeSelection();
    }
  }, [activePropertyActionRef, getActiveEditor, logTextAction, storeSelection]);

  const runForTextSelectionOrCaret = useCallback((fn: () => void, preferSelectionOnly = false) => {
    runForRangeSelection(fn, {
      requireTextSelection: preferSelectionOnly,
      fallbackToWholeElement: !preferSelectionOnly,
    });
  }, [runForRangeSelection]);

  const runForCaretPosition = useCallback((fn: () => void) => {
    const editor = getActiveEditor();
    if (!editor) {
      logTextAction('runForCaretPosition.aborted.no-editor');
      return;
    }

    const currentSelection = editor.selection;
    const hasActiveRange = currentSelection && SlateRange.isRange(currentSelection);
    const hasValidSelection = hasActiveRange
      && Node.has(editor as any, currentSelection.anchor.path)
      && Node.has(editor as any, currentSelection.focus.path);

    const hasRestored = hasActiveRange && hasValidSelection
      ? true
      : restoreSelection({ requireTextSelection: false });
    if (!hasRestored) {
      logTextAction('runForCaretPosition.restore-failed');
      return;
    }

    storeSelection();

    const selectionSnapshot = SlateRange.isRange(editor.selection)
      ? {
        anchor: {
          path: [...editor.selection.anchor.path],
          offset: editor.selection.anchor.offset,
        },
        focus: {
          path: [...editor.selection.focus.path],
          offset: editor.selection.focus.offset,
        },
      }
      : null;

    try {
      logTextAction('runForCaretPosition.execute', { actionName: activePropertyActionRef.current });
      fn();
    } finally {
      if (selectionSnapshot) {
        try {
          Transforms.select(editor, selectionSnapshot);
        } catch {
        }
      }
      logTextAction('runForCaretPosition.restore-cursor');
      storeSelection();
    }
  }, [activePropertyActionRef, getActiveEditor, logTextAction, restoreSelection, storeSelection]);

  const stopBubble = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  const runMark = useCallback((format: string, value?: any) => {
    runForTextSelectionOrCaret(() => {
      const editor = getActiveEditor();
      if (!editor) {
        return;
      }

      if (value === undefined || value === '') {
        Editor.removeMark(editor as any, format);
        return;
      }

      Editor.addMark(editor as any, format, value);
    });
  }, [getActiveEditor, runForTextSelectionOrCaret]);

  const toggleTextMark = useCallback((format: string) => {
    runForTextSelectionOrCaret(() => {
      const editor = getActiveEditor();
      if (!editor) {
        return;
      }

      if (isMarkActive(format)) {
        Editor.removeMark(editor as any, format);
      } else {
        Editor.addMark(editor as any, format, true);
      }
    });
  }, [getActiveEditor, isMarkActive, runForTextSelectionOrCaret]);

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
    runForTextSelectionOrCaret(() => {
      const editor = getActiveEditor();
      if (!editor) {
        return;
      }

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

      marks.forEach((mark) => {
        Editor.removeMark(editor as any, mark);
      });
    });
  }, [getActiveEditor, runForTextSelectionOrCaret]);

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

  const readActiveTextMark = useCallback((format: string): MarkStateValue => {
    const editor = getActiveEditor();
    if (!editor) {
      return MARK_ABSENT;
    }

    try {
      const selection = editor.selection;
      if (!selection || !SlateRange.isRange(selection)) {
        return MARK_ABSENT;
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
        if (!marks || !(format in marks)) {
          return MARK_ABSENT;
        }

        return marks[format] as MarkStateValue;
      }

      let initialized = false;
      let firstValue: unknown;
      for (const node of textNodes) {
        const hasProperty = Object.prototype.hasOwnProperty.call(node, format);
        const value = hasProperty ? node[format] : undefined;

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
        return MARK_ABSENT;
      }

      return firstValue as MarkStateValue;
    } catch {
      return MARK_ABSENT;
    }
  }, [getActiveEditor, MARK_ABSENT, MARK_MIXED]);

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
    });
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
    });
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
  }, [elementId, fontFamilies, getActiveEditor, readActiveTextMark, selectionRevision]);

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
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isMarkActive('bold') && canApplySelection ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title={canInteract ? 'Bold' : 'Enable text edit on canvas to use'}
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
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isMarkActive('italic') && canApplySelection ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title={canInteract ? 'Italic' : 'Enable text edit on canvas to use'}
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
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isMarkActive('underline') && canApplySelection ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title={canInteract ? 'Underline' : 'Enable text edit on canvas to use'}
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
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isMarkActive('strikethrough') && canApplySelection ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title={canInteract ? 'Strikethrough' : 'Enable text edit on canvas to use'}
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
              });
            }}
          className={cn(
            "w-8 h-8 rounded border border-border grid place-items-center",
            isMarkActive('code') && canApplySelection ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          )}
          title={canInteract ? 'Inline code' : 'Enable text edit on canvas to use'}
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
            runContentProperty('align-left', () => setAlign('left'));
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Align left' : 'Enable text edit on canvas to use'}
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('align-center', () => setAlign('center'));
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Align center' : 'Enable text edit on canvas to use'}
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('align-right', () => setAlign('right'));
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Align right' : 'Enable text edit on canvas to use'}
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
            runContentProperty('list-bulleted', () => toggleList('ul'));
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Bulleted list' : 'Enable text edit on canvas to use'}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('list-numbered', () => toggleList('ol'));
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Numbered list' : 'Enable text edit on canvas to use'}
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('list-outdent', () => outdentList());
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Outdent list' : 'Enable text edit on canvas to use'}
        >
          <span className="text-[10px]">◀</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runContentProperty('list-indent', () => indentList());
          }}
          className="w-8 h-8 rounded border border-border grid place-items-center hover:bg-accent"
          title={canInteract ? 'Indent list' : 'Enable text edit on canvas to use'}
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
            className={cn(
              "w-full min-w-0 px-2 py-1.5 text-sm rounded-md border bg-background",
              canInteract ? "hover:bg-accent" : "opacity-50 cursor-not-allowed"
            )}
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
              runForTextSelectionOrCaret(() => clearRichTextFormatting());
            });
          }}
          className="w-full py-1.5 rounded border border-border hover:bg-accent text-[11px] text-muted-foreground"
          title={canInteract ? 'Clear selected text formatting' : 'Enable text edit on canvas to use'}
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
                  runForTextSelectionOrCaret(() => runMark('color', c));
                });
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
                  runForTextSelectionOrCaret(() => runMark('backgroundColor', c));
                });
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
                canInteract ? "hover:bg-accent" : "opacity-50 cursor-not-allowed"
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
