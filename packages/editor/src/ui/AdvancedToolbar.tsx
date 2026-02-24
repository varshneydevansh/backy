import React, { useState } from 'react';
import { useEditorRef } from '@udecode/plate/react';
import {
    Bold, Italic, Underline, Strikethrough, Code,
    Link, List, ListOrdered, Image,
    Undo, Redo, AlignLeft, AlignCenter, AlignRight,
    Table, ChevronDown, Palette, Type, Highlighter
} from 'lucide-react';
import { cn } from '../utils';
import { Editor, Transforms, Element as SlateElement } from 'slate';

// --- Compact ToolbarButton ---
const Btn = ({
    onClick,
    children,
    active,
    title,
}: {
    onClick?: () => void;
    children: React.ReactNode;
    active?: boolean;
    title?: string;
}) => (
    <button
        type="button"
        onMouseDown={e => { e.preventDefault(); onClick?.(); }}
        className={cn(
            "p-1 rounded hover:bg-muted/80 flex items-center justify-center w-6 h-6",
            active && "bg-muted text-foreground"
        )}
        title={title}
    >
        {children}
    </button>
);

// --- Mini Dropdown ---
const MiniDropdown = ({
    label,
    options,
    onSelect,
}: {
    label: string;
    options: { label: string; value: string }[];
    onSelect: (val: string) => void;
}) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setOpen(!open); }}
                className="flex items-center gap-0.5 px-1 h-6 text-[10px] font-medium rounded hover:bg-muted/80 border border-border/40"
            >
                <span className="truncate max-w-[50px]">{label}</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-50" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
                    <div className="absolute left-0 top-full mt-0.5 w-24 bg-popover rounded shadow-lg border z-50 py-0.5 max-h-48 overflow-auto text-[10px]">
                        {options.map(opt => (
                            <div
                                key={opt.value}
                                className="px-2 py-1 hover:bg-accent cursor-pointer"
                                onMouseDown={(e) => { e.preventDefault(); onSelect(opt.value); setOpen(false); }}
                            >
                                {opt.label}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// --- Helpers ---
const isMarkActive = (editor: any, format: string) => {
    const marks = Editor.marks(editor) as Record<string, any> | null;
    return marks ? !!marks[format] : false;
};

const toggleMark = (editor: any, format: string) => {
    if (isMarkActive(editor, format)) {
        Editor.removeMark(editor, format);
    } else {
        Editor.addMark(editor, format, true);
    }
};

const toggleBlock = (editor: any, format: string) => {
    const isList = ['ul', 'ol'].includes(format);
    Transforms.unwrapNodes(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && ['ul', 'ol'].includes((n as any).type),
        split: true,
    });
    Transforms.setNodes(editor, { type: isList ? 'li' : format } as any);
    if (isList) {
        Transforms.wrapNodes(editor, { type: format, children: [] } as any);
    }
};

// --- Main Compact Toolbar ---
export const AdvancedToolbar = ({ className }: { className?: string }) => {
    const editor = useEditorRef();
    if (!editor) return null;

    return (
        <div className={cn(
            "flex items-center gap-0.5 px-1 py-0.5 border-b bg-background/95 text-muted-foreground flex-nowrap overflow-x-auto",
            className
        )}>
            {/* History */}
            <Btn onClick={() => editor.undo()} title="Undo"><Undo className="w-3.5 h-3.5" /></Btn>
            <Btn onClick={() => editor.redo()} title="Redo"><Redo className="w-3.5 h-3.5" /></Btn>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Block Type */}
            <MiniDropdown
                label="¶"
                options={[
                    { label: 'Paragraph', value: 'p' },
                    { label: 'H1', value: 'h1' },
                    { label: 'H2', value: 'h2' },
                    { label: 'H3', value: 'h3' },
                    { label: 'Quote', value: 'blockquote' },
                ]}
                onSelect={(v) => toggleBlock(editor, v)}
            />

            {/* Font */}
            <MiniDropdown
                label="Font"
                options={[
                    { label: 'Inter', value: 'Inter' },
                    { label: 'Arial', value: 'Arial' },
                    { label: 'Georgia', value: 'Georgia' },
                    { label: 'Roboto', value: 'Roboto' },
                    { label: 'Mono', value: 'Courier New' },
                ]}
                onSelect={(v) => Editor.addMark(editor, 'fontFamily', v)}
            />

            {/* Size */}
            <MiniDropdown
                label="16"
                options={[
                    { label: '12', value: '12px' },
                    { label: '14', value: '14px' },
                    { label: '16', value: '16px' },
                    { label: '18', value: '18px' },
                    { label: '24', value: '24px' },
                    { label: '32', value: '32px' },
                ]}
                onSelect={(v) => Editor.addMark(editor, 'fontSize', v)}
            />

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Marks */}
            <Btn active={isMarkActive(editor, 'bold')} onClick={() => toggleMark(editor, 'bold')} title="Bold">
                <Bold className="w-3.5 h-3.5" />
            </Btn>
            <Btn active={isMarkActive(editor, 'italic')} onClick={() => toggleMark(editor, 'italic')} title="Italic">
                <Italic className="w-3.5 h-3.5" />
            </Btn>
            <Btn active={isMarkActive(editor, 'underline')} onClick={() => toggleMark(editor, 'underline')} title="Underline">
                <Underline className="w-3.5 h-3.5" />
            </Btn>
            <Btn active={isMarkActive(editor, 'strikethrough')} onClick={() => toggleMark(editor, 'strikethrough')} title="Strike">
                <Strikethrough className="w-3.5 h-3.5" />
            </Btn>
            <Btn active={isMarkActive(editor, 'code')} onClick={() => toggleMark(editor, 'code')} title="Code">
                <Code className="w-3.5 h-3.5" />
            </Btn>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Colors */}
            <Btn onClick={() => {
                const c = window.prompt('Text color:', '#000000');
                if (c) Editor.addMark(editor, 'color', c);
            }} title="Text Color">
                <Palette className="w-3.5 h-3.5" />
            </Btn>
            <Btn onClick={() => {
                const c = window.prompt('Highlight:', '#ffff00');
                if (c) Editor.addMark(editor, 'backgroundColor', c);
            }} title="Highlight">
                <Highlighter className="w-3.5 h-3.5" />
            </Btn>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Align */}
            <Btn onClick={() => Transforms.setNodes(editor, { align: 'left' } as any)} title="Left">
                <AlignLeft className="w-3.5 h-3.5" />
            </Btn>
            <Btn onClick={() => Transforms.setNodes(editor, { align: 'center' } as any)} title="Center">
                <AlignCenter className="w-3.5 h-3.5" />
            </Btn>
            <Btn onClick={() => Transforms.setNodes(editor, { align: 'right' } as any)} title="Right">
                <AlignRight className="w-3.5 h-3.5" />
            </Btn>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Lists */}
            <Btn onClick={() => toggleBlock(editor, 'ul')} title="Bullet List">
                <List className="w-3.5 h-3.5" />
            </Btn>
            <Btn onClick={() => toggleBlock(editor, 'ol')} title="Numbered List">
                <ListOrdered className="w-3.5 h-3.5" />
            </Btn>

            <div className="w-px h-4 bg-border/50 mx-0.5" />

            {/* Insert */}
            <Btn onClick={() => {
                const table = {
                    type: 'table',
                    children: [
                        { type: 'tr', children: [{ type: 'td', children: [{ text: '' }] }, { type: 'td', children: [{ text: '' }] }] },
                        { type: 'tr', children: [{ type: 'td', children: [{ text: '' }] }, { type: 'td', children: [{ text: '' }] }] },
                    ]
                };
                Transforms.insertNodes(editor, table as any);
            }} title="Table">
                <Table className="w-3.5 h-3.5" />
            </Btn>
            <Btn onClick={() => {
                const url = window.prompt('Link URL:');
                if (url) {
                    Transforms.wrapNodes(editor, { type: 'link', url, children: [] } as any, { split: true });
                }
            }} title="Link">
                <Link className="w-3.5 h-3.5" />
            </Btn>
            <Btn onClick={() => {
                const url = window.prompt('Image URL:');
                if (url) Transforms.insertNodes(editor, { type: 'img', url, children: [{ text: '' }] } as any);
            }} title="Image">
                <Image className="w-3.5 h-3.5" />
            </Btn>
        </div>
    );
};

export default AdvancedToolbar;
