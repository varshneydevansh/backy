import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { BackyEditor, PlateEditor } from '@backy-cms/editor';
import { useActiveEditor } from '../ActiveEditorContext';

const makeContentFingerprint = (value: unknown): string => {
  if (value === undefined) {
    return 'u';
  }

  if (value === null) {
    return 'n';
  }

  if (typeof value === 'string') {
    return `s:${value}`;
  }

  if (Array.isArray(value)) {
    try {
      return `a:${JSON.stringify(value)}`;
    } catch {
      return 'a:[unserializable]';
    }
  }

  try {
    return `o:${JSON.stringify(value)}`;
  } catch {
    return `o:${typeof value}`;
  }
};

interface RichTextBlockProps {
    content: any; // JSON or HTML
    onChange: (content: any) => void;
    isEditable?: boolean;
    className?: string;
    placeholder?: string;
    onBlur?: () => void;
    defaultType?: string;
    style?: React.CSSProperties;
    elementId?: string;
}

export function RichTextBlock({
    content,
    onChange,
    isEditable = false,
    className,
    placeholder = "Type '/' for commands...",
    defaultType = 'p',
    onBlur,
    elementId,
    style,
}: RichTextBlockProps) {
    const { setActiveEditor, clearActiveEditor, storeSelection, registerContentSync } = useActiveEditor();
    const editorRef = useRef<PlateEditor | null>(null);
    const editorHostRef = useRef<HTMLDivElement>(null);
    const unregisterContentSyncRef = useRef<(() => void) | null>(null);
    const editableBaselineFingerprintRef = useRef<string | null>(null);
    const resolveElementId = useCallback(() => {
        if (elementId) {
            return elementId;
        }

        if (editorHostRef.current) {
            const directElementId = editorHostRef.current.getAttribute('data-element-id');
            if (directElementId) {
                return directElementId;
            }

            return editorHostRef.current.closest?.('[data-element-id]')?.getAttribute('data-element-id') || null;
        }

        return null;
    }, [elementId]);

    const log = useCallback((..._args: unknown[]) => {
    }, []);

    const unregisterContentSync = useCallback(() => {
        unregisterContentSyncRef.current?.();
        unregisterContentSyncRef.current = null;
    }, []);

    // Ensure content is valid Slate JSON
    const initialValue = useMemo(() => {
        if (Array.isArray(content) && content.length > 0) {
            return content;
        }
        // Fallback for string content or empty
        return [{ type: defaultType, children: [{ text: typeof content === 'string' ? content : '' }] }];
    }, [content, defaultType]);

    const initialValueFingerprint = useMemo(() => makeContentFingerprint(initialValue), [initialValue]);
    const contentFingerprint = useMemo(() => makeContentFingerprint(content), [content]);

    useEffect(() => {
        if (!isEditable) {
            editableBaselineFingerprintRef.current = null;
        }
    }, [isEditable]);

    const captureEditableBaseline = useCallback((editor: PlateEditor | null) => {
        const children = (editor as unknown as { children?: unknown } | null)?.children;
        if (!isEditable || !Array.isArray(children)) {
            return;
        }

        editableBaselineFingerprintRef.current = makeContentFingerprint(JSON.parse(JSON.stringify(children)));
    }, [isEditable]);

    const shouldIgnoreUnchangedEditorContent = useCallback((nextContent: unknown) => {
        const nextFingerprint = makeContentFingerprint(nextContent);
        return nextFingerprint === initialValueFingerprint || (
            editableBaselineFingerprintRef.current !== null &&
            nextFingerprint === editableBaselineFingerprintRef.current
        );
    }, [initialValueFingerprint]);

    const syncContentFromEditor = useCallback((editor: PlateEditor) => {
        const children = (editor as unknown as { children?: unknown }).children;
        if (!Array.isArray(children)) {
            return;
        }

        const nextContent = JSON.parse(JSON.stringify(children));
        if (shouldIgnoreUnchangedEditorContent(nextContent)) {
            return;
        }

        onChange(nextContent);
    }, [onChange, shouldIgnoreUnchangedEditorContent]);

    const handleContentChange = useCallback((value: any) => {
        const children = (editorRef.current as unknown as { children?: unknown } | null)?.children;
        const nextContent = isEditable && Array.isArray(children)
            ? JSON.parse(JSON.stringify(children))
            : value;

        if (shouldIgnoreUnchangedEditorContent(nextContent)) {
            return;
        }

        onChange(nextContent);
    }, [isEditable, onChange, shouldIgnoreUnchangedEditorContent]);

    const registerCurrentContentSync = useCallback((editor: PlateEditor | null) => {
        unregisterContentSync();
        if (!isEditable || !editor) {
            return;
        }

        const activeElementId = resolveElementId();
        unregisterContentSyncRef.current = registerContentSync(activeElementId, editor, syncContentFromEditor);
    }, [
        isEditable,
        registerContentSync,
        resolveElementId,
        syncContentFromEditor,
        unregisterContentSync,
    ]);

    const storeSelectionAsync = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.requestAnimationFrame(() => {
            storeSelection();
        });
    }, [storeSelection]);

    const lastPointerTargetRef = useRef<EventTarget | null>(null);

    useEffect(() => {
        if (!isEditable || typeof document === 'undefined') {
            lastPointerTargetRef.current = null;
            return;
        }

        const handlePointerStart = (event: Event) => {
            lastPointerTargetRef.current = event.target;
            window.setTimeout(() => {
                if (lastPointerTargetRef.current === event.target) {
                    lastPointerTargetRef.current = null;
                }
            }, 500);
        };

        document.addEventListener('mousedown', handlePointerStart, true);
        document.addEventListener('pointerdown', handlePointerStart, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerStart, true);
            document.removeEventListener('pointerdown', handlePointerStart, true);
        };
    }, [isEditable]);

    const shouldKeepEditingForTarget = useCallback((target: EventTarget | null | undefined) => {
        if (!(target instanceof Element)) {
            return false;
        }

        if (editorHostRef.current?.contains(target)) {
            return true;
        }

        return !!target.closest('[data-testid="editor-inspector"], .ignore-click-outside\\/toolbar');
    }, []);

    const handleBlur = useCallback((event?: React.FocusEvent) => {
        if (!isEditable) {
            return;
        }

        storeSelection();
        if (shouldKeepEditingForTarget(event?.relatedTarget) || shouldKeepEditingForTarget(lastPointerTargetRef.current)) {
            return;
        }

        if (typeof window === 'undefined') {
            onBlur?.();
            return;
        }

        window.requestAnimationFrame(() => {
            if (shouldKeepEditingForTarget(document.activeElement)) {
                return;
            }
            onBlur?.();
        });
    }, [isEditable, onBlur, shouldKeepEditingForTarget, storeSelection]);

    const editorReadMode = isEditable ? 'editable' : 'readonly';
    const editorRevision = isEditable ? elementId || 'text' : `${contentFingerprint}:${content?.length || 0}`;

    // Handle editor registration/unregistration
    const handleEditorReady = useCallback((editor: PlateEditor) => {
        editorRef.current = editor;
        const activeElementId = resolveElementId();

        if (isEditable) {
            log('editor-ready editable', {
                elementId: activeElementId,
                hasSelection: !!editor.selection,
                selectionRange: editor.selection && 'anchor' in editor.selection ? {
                    anchor: editor.selection.anchor,
                    focus: editor.selection.focus,
                } : null,
            });
            captureEditableBaseline(editor);
            registerCurrentContentSync(editor);
            setActiveEditor(editor, isEditable ? activeElementId : null);
            return;
        }

        log('editor-ready readOnly', {});
        unregisterContentSync();
        clearActiveEditor(editor);
    }, [
        isEditable,
        setActiveEditor,
        clearActiveEditor,
        resolveElementId,
        registerCurrentContentSync,
        captureEditableBaseline,
        unregisterContentSync,
    ]);

    const handleFocus = useCallback(() => {
        if (!isEditable) {
            return;
        }

        const editor = editorRef.current;
        if (!editor) return;
        const activeElementId = resolveElementId();

        log('focus', {
          elementId: activeElementId,
          selection: editor.selection && 'anchor' in editor.selection ? {
            anchor: editor.selection.anchor,
            focus: editor.selection.focus,
          } : null,
        });
        if (editableBaselineFingerprintRef.current === null) {
            captureEditableBaseline(editor);
        }
        registerCurrentContentSync(editor);
        setActiveEditor(editor, activeElementId);
    }, [captureEditableBaseline, isEditable, registerCurrentContentSync, resolveElementId, setActiveEditor]);

    const handleMouseUp = useCallback(() => {
        if (!isEditable) {
            return;
        }

        log('mouse-up', {
          elementId: resolveElementId(),
          hasSelection: !!editorRef.current?.selection,
        });
        storeSelectionAsync();
    }, [isEditable, storeSelectionAsync, resolveElementId]);

    const handleKeyUp = useCallback(() => {
        if (!isEditable) {
            return;
        }

        log('key-up', {
          elementId: resolveElementId(),
          hasSelection: !!editorRef.current?.selection,
        });
        storeSelectionAsync();
    }, [isEditable, storeSelectionAsync, resolveElementId]);

    const handleEditorMouseDown = useCallback(() => {
        if (!isEditable) {
            return;
        }

        const editor = editorRef.current;
        if (!editor) return;
        const activeElementId = resolveElementId();

        log('mouse-down', {
          elementId: activeElementId,
          hasSelection: !!editor.selection,
        });
        if (editableBaselineFingerprintRef.current === null) {
            captureEditableBaseline(editor);
        }
        registerCurrentContentSync(editor);
        setActiveEditor(editor, activeElementId);
    }, [captureEditableBaseline, isEditable, registerCurrentContentSync, resolveElementId, setActiveEditor]);

    useEffect(() => {
        if (isEditable) {
            return;
        }

        const editor = editorRef.current;
        if (editor) {
            log('unregister-when-readOnly', {});
            unregisterContentSync();
            clearActiveEditor(editor);
        }
    }, [isEditable, clearActiveEditor, unregisterContentSync]);

    useEffect(() => {
        return () => {
            const editor = editorRef.current;
            if (editor) {
                log('unmount-cleanup', {});
                unregisterContentSync();
                clearActiveEditor(editor);
            }
        };
    }, [clearActiveEditor, unregisterContentSync]);

  return (
    <div
      ref={editorHostRef}
      data-element-id={elementId || undefined}
      className={cn("h-full w-full", className)}
      style={style}
      data-backy-text-editor="true"
            data-backy-text-editor-editable={String(!!isEditable)}
            onDoubleClick={() => {
                // Allow bubbling to parent to trigger "Edit Mode"
            }}
        >
            <BackyEditor
                key={`${editorReadMode}-${elementId || 'text'}-${editorRevision}`}
                value={initialValue}
                onChange={handleContentChange}
                readOnly={!isEditable}
                placeholder={placeholder}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onMouseUp={handleMouseUp}
                onKeyUp={handleKeyUp}
                onEditorReady={handleEditorReady}
                onMouseDown={handleEditorMouseDown}
                showPortalToolbar={false}
                className={cn(
                    // Critical: pointer-events-none when NOT editable to allow Dragging from parent
                    !isEditable && "pointer-events-none"
                )}
            />
        </div>
    );
}
