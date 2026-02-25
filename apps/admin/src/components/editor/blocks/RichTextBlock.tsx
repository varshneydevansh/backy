import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { BackyEditor, PlateEditor } from '@backy-cms/editor';
import { useActiveEditor } from '../ActiveEditorContext';

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
    const { setActiveEditor, clearActiveEditor, storeSelection } = useActiveEditor();
    const editorRef = useRef<PlateEditor | null>(null);
    const editorHostRef = useRef<HTMLDivElement>(null);
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

    const storeSelectionAsync = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.requestAnimationFrame(() => {
            storeSelection();
        });
    }, [storeSelection]);

    const handleBlur = useCallback(() => {
        if (!isEditable) {
            return;
        }

        storeSelectionAsync();
        onBlur?.();
    }, [isEditable, onBlur, storeSelectionAsync]);

    // Ensure content is valid Slate JSON
    const initialValue = useMemo(() => {
        if (Array.isArray(content) && content.length > 0) {
            return content;
        }
        // Fallback for string content or empty
        return [{ type: defaultType, children: [{ text: typeof content === 'string' ? content : '' }] }];
    }, [content, defaultType]);

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
            setActiveEditor(editor, isEditable ? activeElementId : null);
            return;
        }

        log('editor-ready readOnly', {});
        clearActiveEditor(editor);
    }, [isEditable, setActiveEditor, clearActiveEditor, resolveElementId]);

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
        setActiveEditor(editor, activeElementId);
    }, [isEditable, resolveElementId, setActiveEditor]);

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
        setActiveEditor(editor, activeElementId);
    }, [isEditable, resolveElementId, setActiveEditor]);

    useEffect(() => {
        if (isEditable) {
            return;
        }

        const editor = editorRef.current;
        if (editor) {
            log('unregister-when-readOnly', {});
            clearActiveEditor(editor);
        }
    }, [isEditable, clearActiveEditor]);

    useEffect(() => {
        return () => {
            const editor = editorRef.current;
            if (editor) {
                log('unmount-cleanup', {});
                clearActiveEditor(editor);
            }
        };
    }, [clearActiveEditor]);

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
                key={isEditable ? 'editable' : 'readonly'}
                value={initialValue}
                onChange={onChange}
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
