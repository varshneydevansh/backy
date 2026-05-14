import React, { useCallback, useEffect, useState } from 'react';
import { useEditorRef } from '@udecode/plate/react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Code, Italic, Link, RemoveFormatting, Strikethrough, Underline } from 'lucide-react';
import { Editor, Element as SlateElement, Range, Transforms } from 'slate';
import { ReactEditor, useFocused } from 'slate-react';
import { cn } from '../utils';

type FloatingToolbarPosition = {
    left: number;
    top: number;
};

type ToolbarButtonProps = {
    active?: boolean;
    label: string;
    onMouseDown: () => void;
    children: React.ReactNode;
};

const isMarkActive = (editor: Editor, format: string) => {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    return marks ? Boolean(marks[format]) : false;
};

const toggleMark = (editor: Editor, format: string) => {
    if (isMarkActive(editor, format)) {
        Editor.removeMark(editor, format);
        return;
    }
    Editor.addMark(editor, format, true);
};

const clearSelectedMarks = (editor: Editor) => {
    ['bold', 'italic', 'underline', 'strikethrough', 'code', 'color', 'backgroundColor', 'fontSize', 'fontFamily'].forEach((mark) => {
        Editor.removeMark(editor, mark);
    });
};

const setSelectedAlignment = (editor: Editor, align: 'left' | 'center' | 'right') => {
    Transforms.setNodes(
        editor,
        { align } as Partial<SlateElement>,
        {
            match: (node) => SlateElement.isElement(node) && Editor.isBlock(editor, node),
        },
    );
};

const normalizeLinkUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^(#|\/|mailto:|tel:)/i.test(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed}`;
};

const wrapSelectionWithLink = (editor: Editor) => {
    const selection = editor.selection ? { ...editor.selection } : null;
    const url = normalizeLinkUrl(window.prompt('Link URL:', 'https://') || '');
    if (!url || !selection) return;

    Transforms.select(editor, selection);
    Transforms.unwrapNodes(editor, {
        match: (node) => (
            !Editor.isEditor(node) &&
            SlateElement.isElement(node) &&
            ((node as { type?: string }).type === 'a' || (node as { type?: string }).type === 'link')
        ),
        split: true,
    });
    Transforms.wrapNodes(editor, { type: 'a', url, children: [] } as SlateElement, { split: true });
    Transforms.collapse(editor, { edge: 'end' });
};

const ToolbarButton = ({ active, label, onMouseDown, children }: ToolbarButtonProps) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onMouseDown={(event) => {
            event.preventDefault();
            onMouseDown();
        }}
        className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
            active && 'bg-primary/10 text-primary',
        )}
    >
        {children}
    </button>
);

export const FloatingToolbar = () => {
    const editor = useEditorRef() as unknown as Editor & ReactEditor;
    const focused = useFocused();
    const [position, setPosition] = useState<FloatingToolbarPosition | null>(null);

    const updatePosition = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const selection = editor.selection;
        if (!focused || !selection || Range.isCollapsed(selection)) {
            setPosition(null);
            return;
        }

        try {
            const domRange = ReactEditor.toDOMRange(editor, selection);
            const rect = domRange.getBoundingClientRect();
            if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
                setPosition(null);
                return;
            }

            setPosition({
                left: rect.left + rect.width / 2,
                top: Math.max(8, rect.top - 8),
            });
        } catch {
            setPosition(null);
        }
    }, [editor, focused]);

    useEffect(() => {
        updatePosition();
    }, [updatePosition, editor.selection]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return undefined;
        }

        const scheduleUpdate = () => window.requestAnimationFrame(updatePosition);
        document.addEventListener('selectionchange', scheduleUpdate);
        window.addEventListener('mouseup', scheduleUpdate);
        window.addEventListener('keyup', scheduleUpdate);
        window.addEventListener('resize', scheduleUpdate);
        window.addEventListener('scroll', scheduleUpdate, true);

        return () => {
            document.removeEventListener('selectionchange', scheduleUpdate);
            window.removeEventListener('mouseup', scheduleUpdate);
            window.removeEventListener('keyup', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
            window.removeEventListener('scroll', scheduleUpdate, true);
        };
    }, [updatePosition]);

    if (!position) {
        return null;
    }

    return (
        <div
            role="toolbar"
            aria-label="Text selection formatting"
            className="fixed z-[1000] flex items-center gap-0.5 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
            style={{
                left: position.left,
                top: position.top,
                transform: 'translate(-50%, -100%)',
            }}
        >
            <ToolbarButton active={isMarkActive(editor, 'bold')} label="Bold" onMouseDown={() => toggleMark(editor, 'bold')}>
                <Bold className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton active={isMarkActive(editor, 'italic')} label="Italic" onMouseDown={() => toggleMark(editor, 'italic')}>
                <Italic className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton active={isMarkActive(editor, 'underline')} label="Underline" onMouseDown={() => toggleMark(editor, 'underline')}>
                <Underline className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton active={isMarkActive(editor, 'strikethrough')} label="Strikethrough" onMouseDown={() => toggleMark(editor, 'strikethrough')}>
                <Strikethrough className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton active={isMarkActive(editor, 'code')} label="Code" onMouseDown={() => toggleMark(editor, 'code')}>
                <Code className="h-3.5 w-3.5" />
            </ToolbarButton>
            <div className="mx-1 h-5 w-px bg-border" />
            <ToolbarButton label="Align left" onMouseDown={() => setSelectedAlignment(editor, 'left')}>
                <AlignLeft className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton label="Align center" onMouseDown={() => setSelectedAlignment(editor, 'center')}>
                <AlignCenter className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton label="Align right" onMouseDown={() => setSelectedAlignment(editor, 'right')}>
                <AlignRight className="h-3.5 w-3.5" />
            </ToolbarButton>
            <div className="mx-1 h-5 w-px bg-border" />
            <ToolbarButton label="Add link" onMouseDown={() => wrapSelectionWithLink(editor)}>
                <Link className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton label="Clear formatting" onMouseDown={() => clearSelectedMarks(editor)}>
                <RemoveFormatting className="h-3.5 w-3.5" />
            </ToolbarButton>
        </div>
    );
};
