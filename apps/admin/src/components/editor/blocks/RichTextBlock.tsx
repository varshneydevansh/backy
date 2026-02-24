import React, { useMemo, useEffect, useRef, useCallback } from 'react';
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
}

export function RichTextBlock({
    content,
    onChange,
    isEditable = false,
    className,
    placeholder = "Type '/' for commands...",
    defaultType = 'p',
    onBlur,
    style,
}: RichTextBlockProps) {
    const { setActiveEditor, clearActiveEditor, storeSelection } = useActiveEditor();
    const editorRef = useRef<PlateEditor | null>(null);
    const handleBlur = useCallback(() => {
        storeSelection();
        onBlur?.();
    }, [storeSelection, onBlur]);

    // Ensure content is valid Slate JSON
    const initialValue = useMemo(() => {
        if (Array.isArray(content) && content.length > 0) {
            return content;
        }
        // Fallback for string content or empty
        return [{ type: defaultType, children: [{ text: typeof content === 'string' ? content : '' }] }];
    }, [content, defaultType]);

    // Handle editor registration/unregistration
    const handleEditorReady = (editor: PlateEditor) => {
        editorRef.current = editor;
        if (isEditable) {
            setActiveEditor(editor);
        }
    };

    const handleFocus = useCallback(() => {
        if (!editorRef.current) return;
        setActiveEditor(editorRef.current);
    }, [setActiveEditor]);

    const handleTextBlockMouseDown = useCallback(() => {
        if (!isEditable || !editorRef.current) return;
        setActiveEditor(editorRef.current);
        storeSelection();
    }, [isEditable, setActiveEditor, storeSelection]);

    // Keep active editor in context only while this editor is editable
    useEffect(() => {
        if (!isEditable || !editorRef.current) {
            return;
        }

        const editor = editorRef.current;
        setActiveEditor(editor);

        return () => {
            clearActiveEditor(editor);
        };
    }, [isEditable, setActiveEditor, clearActiveEditor]);

    return (
        <div
            className={cn("h-full w-full", className)}
            style={style}
            onMouseDown={handleTextBlockMouseDown}
            onDoubleClick={() => {
                // Allow bubbling to parent to trigger "Edit Mode"
            }}
        >
            <BackyEditor
            value={initialValue}
            onChange={onChange}
            readOnly={!isEditable}
            placeholder={placeholder}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onEditorReady={handleEditorReady}
            showPortalToolbar={false}
            className={cn(
                // Critical: pointer-events-none when NOT editable to allow Dragging from parent
                !isEditable && "pointer-events-none"
            )}
            />
        </div>
    );
}
