import React, { useRef, useState } from 'react';
import { useEditorRef } from '@udecode/plate/react';
import {
    Bold, Italic, Underline, Strikethrough, Code,
    Quote, Link, List, ListOrdered, Image,
    Undo, Redo, Type, AlignLeft, AlignCenter, AlignRight,
    Palette, Highlighter
} from 'lucide-react';
import { cn } from '../utils';
import { Editor, Transforms, Element as SlateElement } from 'slate';
import { ColorPicker } from './ColorPicker';

type InsertMode = 'link' | 'image';

const ToolbarButton = ({
    onClick,
    children,
    isActive,
    tooltip
}: {
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    isActive?: boolean;
    tooltip?: string;
}) => (
    <button
        type="button"
        onMouseDown={e => {
            e.preventDefault();
            onClick(e);
        }}
        className={cn(
            "p-1 rounded hover:bg-muted transition-colors",
            isActive && "bg-muted text-foreground font-medium",
            "text-muted-foreground"
        )}
        title={tooltip}
        aria-label={tooltip}
    >
        {children}
    </button>
);

const isMarkActive = (editor: any, format: string) => {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    return marks ? marks[format] === true : false;
};

const toggleMark = (editor: any, format: string) => {
    const isActive = isMarkActive(editor, format);
    if (isActive) {
        Editor.removeMark(editor, format);
    } else {
        Editor.addMark(editor, format, true);
    }
};

const markValue = (editor: any, format: string): string | undefined => {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    const value = marks?.[format];
    return typeof value === 'string' ? value : undefined;
};

const setMarkValue = (editor: any, format: string, value: string) => {
    const nextValue = value.trim();
    if (!nextValue) {
        Editor.removeMark(editor, format);
        return;
    }

    Editor.addMark(editor, format, nextValue);
};

const isBlockActive = (editor: any, format: string) => {
    const { selection } = editor;
    if (!selection) return false;

    const [match] = Array.from(
        Editor.nodes(editor, {
            at: Editor.unhangRange(editor, selection),
            match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === format,
        })
    );

    return !!match;
};

const toggleBlock = (editor: any, format: string) => {
    const isActive = isBlockActive(editor, format);
    const isList = ['ul', 'ol'].includes(format);

    Transforms.unwrapNodes(editor, {
        match: n =>
            !Editor.isEditor(n) &&
            SlateElement.isElement(n) &&
            ['ul', 'ol'].includes((n as any).type),
        split: true,
    });

    const newProperties: Record<string, unknown> = {
        type: isActive ? 'p' : isList ? 'li' : (format as any),
    };

    Transforms.setNodes(editor, newProperties as any);

    if (!isActive && isList) {
        const block = { type: format, children: [] };
        Transforms.wrapNodes(editor, block as any);
    }
};

const normalizeUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^(#|\/|mailto:|tel:)/i.test(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed}`;
};

const insertToolbarLink = (editor: any, url: string) => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return false;
    if (isBlockActive(editor, 'link')) {
        Transforms.unwrapNodes(editor, { match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'link' });
    }
    const link = { type: 'link', url: normalizedUrl, children: [] };
    Transforms.wrapNodes(editor, link as any, { split: true });
    Transforms.collapse(editor, { edge: 'end' });
    return true;
};

const insertToolbarImage = (editor: any, url: string) => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return false;
    const image = { type: 'img', url: normalizedUrl, children: [{ text: '' }] };
    Transforms.insertNodes(editor, image as any);
    return true;
};

export const FixedToolbar = ({ className }: { className?: string }) => {
    const editor = useEditorRef() as any;
    const [insertMode, setInsertMode] = useState<InsertMode | null>(null);
    const [insertUrl, setInsertUrl] = useState('');
    const savedSelectionRef = useRef<any>(null);

    if (!editor) return null;

    const openInsertForm = (mode: InsertMode) => {
        savedSelectionRef.current = editor.selection ? { ...editor.selection } : null;
        setInsertMode(mode);
        setInsertUrl(mode === 'link' ? 'https://' : '');
    };

    const closeInsertForm = () => {
        setInsertMode(null);
        setInsertUrl('');
        savedSelectionRef.current = null;
    };

    const submitInsertForm = () => {
        if (savedSelectionRef.current) {
            try {
                Transforms.select(editor, savedSelectionRef.current);
            } catch {
                // Best effort when the document changed while the URL field was focused.
            }
        }

        const inserted = insertMode === 'link'
            ? insertToolbarLink(editor, insertUrl)
            : insertMode === 'image'
                ? insertToolbarImage(editor, insertUrl)
                : false;
        if (inserted) {
            closeInsertForm();
        }
    };

    return (
        <div className={cn(
            "flex items-center gap-0.5 p-1 border-b bg-background sticky top-0 z-50 flex-wrap",
            className
        )}>
            {/* History */}
            <div className="flex items-center gap-0.5 pr-1 border-r">
                <ToolbarButton onClick={() => editor.undo()} tooltip="Undo">
                    <Undo className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor.redo()} tooltip="Redo">
                    <Redo className="w-3 h-3" />
                </ToolbarButton>
            </div>

            {/* Basic Marks */}
            <div className="flex items-center gap-0.5 px-1 border-r">
                <ToolbarButton
                    isActive={isMarkActive(editor, 'bold')}
                    onClick={() => toggleMark(editor, 'bold')}
                    tooltip="Bold"
                >
                    <Bold className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isMarkActive(editor, 'italic')}
                    onClick={() => toggleMark(editor, 'italic')}
                    tooltip="Italic"
                >
                    <Italic className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isMarkActive(editor, 'underline')}
                    onClick={() => toggleMark(editor, 'underline')}
                    tooltip="Underline"
                >
                    <Underline className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isMarkActive(editor, 'strikethrough')}
                    onClick={() => toggleMark(editor, 'strikethrough')}
                    tooltip="Strikethrough"
                >
                    <Strikethrough className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isMarkActive(editor, 'code')}
                    onClick={() => toggleMark(editor, 'code')}
                    tooltip="Code"
                >
                    <Code className="w-3 h-3" />
                </ToolbarButton>
            </div>

            {/* Colors */}
            <div className="flex items-center gap-0.5 px-1 border-r">
                <ColorPicker
                    value={markValue(editor, 'color')}
                    onChange={(color) => setMarkValue(editor, 'color', color)}
                    icon={<Palette className="w-3 h-3" />}
                    tooltip="Text Color"
                    testId="backy-editor-fixed-text-color"
                />
                <ColorPicker
                    value={markValue(editor, 'backgroundColor')}
                    onChange={(color) => setMarkValue(editor, 'backgroundColor', color)}
                    icon={<Highlighter className="w-3 h-3" />}
                    tooltip="Highlight"
                    testId="backy-editor-fixed-highlight-color"
                />
            </div>

            {/* Headings / Blocks */}
            <div className="flex items-center gap-0.5 px-1 border-r">
                <ToolbarButton
                    isActive={isBlockActive(editor, 'h1')}
                    onClick={() => toggleBlock(editor, 'h1')}
                    tooltip="Heading 1"
                >
                    <Type className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isBlockActive(editor, 'h2')}
                    onClick={() => toggleBlock(editor, 'h2')}
                    tooltip="Heading 2"
                >
                    <Type className="w-2.5 h-2.5" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isBlockActive(editor, 'blockquote')}
                    onClick={() => toggleBlock(editor, 'blockquote')}
                    tooltip="Quote"
                >
                    <Quote className="w-3 h-3" />
                </ToolbarButton>
            </div>

            {/* Lists */}
            <div className="flex items-center gap-0.5 px-1 border-r">
                <ToolbarButton
                    isActive={isBlockActive(editor, 'ul')}
                    onClick={() => toggleBlock(editor, 'ul')}
                    tooltip="Bulleted List"
                >
                    <List className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    isActive={isBlockActive(editor, 'ol')}
                    onClick={() => toggleBlock(editor, 'ol')}
                    tooltip="Ordered List"
                >
                    <ListOrdered className="w-3 h-3" />
                </ToolbarButton>
            </div>

            {/* Insert */}
            <div className="flex items-center gap-0.5 px-1">
                <ToolbarButton
                    onClick={() => openInsertForm('link')}
                    tooltip="Link"
                >
                    <Link className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => openInsertForm('image')}
                    tooltip="Image"
                >
                    <Image className="w-3 h-3" />
                </ToolbarButton>
                {insertMode ? (
                    <form
                        className="ml-1 flex min-w-[220px] items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5"
                        data-testid={`backy-editor-fixed-${insertMode}-form`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitInsertForm();
                        }}
                    >
                        <input
                            type="url"
                            value={insertUrl}
                            onChange={(event) => setInsertUrl(event.target.value)}
                            placeholder={insertMode === 'link' ? 'https://example.com' : 'Image URL'}
                            className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                            data-testid={`backy-editor-fixed-${insertMode}-input`}
                        />
                        <button
                            type="submit"
                            className="h-6 rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            data-testid={`backy-editor-fixed-${insertMode}-insert`}
                        >
                            Insert
                        </button>
                        <button
                            type="button"
                            className="h-6 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted"
                            data-testid={`backy-editor-fixed-${insertMode}-cancel`}
                            onClick={closeInsertForm}
                        >
                            ×
                        </button>
                    </form>
                ) : null}
            </div>
        </div>
    );
};
