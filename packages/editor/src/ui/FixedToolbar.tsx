import React from 'react';
import { useEditorRef } from '@udecode/plate/react';
import {
    Bold, Italic, Underline, Strikethrough, Code,
    Quote, Link, List, ListOrdered, Image,
    Undo, Redo, Type, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';
import { cn } from '../utils';
import { Editor, Transforms, Text, Element as SlateElement } from 'slate';
import { useFocused } from 'slate-react';

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
    >
        {children}
    </button>
);

const isMarkActive = (editor: any, format: string) => {
    const marks = Editor.marks(editor) as Record<string, boolean> | null;
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

    const newProperties: Partial<SlateElement> = {
        type: isActive ? 'p' : isList ? 'li' : (format as any),
    };

    Transforms.setNodes<SlateElement>(editor, newProperties);

    if (!isActive && isList) {
        const block = { type: format, children: [] };
        Transforms.wrapNodes(editor, block as any);
    }
};

export const FixedToolbar = ({ className }: { className?: string }) => {
    const editor = useEditorRef();
    const focused = useFocused();

    if (!editor) return null;

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
                    onClick={() => {
                        const url = window.prompt('Enter link URL:');
                        if (url) {
                            if (isBlockActive(editor, 'link')) {
                                Transforms.unwrapNodes(editor, { match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === 'link' });
                            }
                            const link = { type: 'link', url, children: [] };
                            Transforms.wrapNodes(editor, link as any, { split: true });
                            Transforms.collapse(editor, { edge: 'end' });
                        }
                    }}
                    tooltip="Link"
                >
                    <Link className="w-3 h-3" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => {
                        const url = window.prompt('Enter image URL:');
                        if (url) {
                            const image = { type: 'img', url, children: [{ text: '' }] };
                            Transforms.insertNodes(editor, image as any);
                        }
                    }}
                    tooltip="Image"
                >
                    <Image className="w-3 h-3" />
                </ToolbarButton>
            </div>
        </div>
    );
};
