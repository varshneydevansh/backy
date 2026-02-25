/**
 * PortalToolbar - Renders the toolbar inside the PropertyPanel using React Portal
 * 
 * This component must be rendered INSIDE the <Plate> context to have access
 * to the editor. It uses createPortal to render into a container in PropertyPanel.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { useEditorRef } from '@udecode/plate/react';
import { Editor, Transforms, Element as SlateElement, Range } from 'slate';
import { useState } from 'react';
import {
    Bold, Italic, Underline, Strikethrough, Code,
    Link, List, ListOrdered, Image,
    AlignLeft, AlignCenter, AlignRight,
    Table, Palette, Highlighter, Smile,
} from 'lucide-react';
import { cn } from '../utils';

// --- Helpers ---
const isMarkActive = (editor: any, format: string) => {
    try {
        const marks = Editor.marks(editor) as Record<string, any> | null;
        return marks ? !!marks[format] : false;
    } catch {
        return false;
    }
};

const toggleMark = (editor: any, format: string) => {
    if (isMarkActive(editor, format)) {
        Editor.removeMark(editor, format);
    } else {
        Editor.addMark(editor, format, true);
    }
};

const setAlign = (editor: any, align: string) => {
    Transforms.setNodes(editor, { align } as any, {
        match: n => SlateElement.isElement(n),
    });
};

const toggleList = (editor: any, format: 'ul' | 'ol') => {
    Transforms.unwrapNodes(editor, {
        match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && ['ul', 'ol'].includes((n as any).type),
        split: true,
    });
    Transforms.setNodes(editor, { type: 'li' } as any);
    Transforms.wrapNodes(editor, { type: format, children: [] } as any);
};

const runWithSelection = (editor: any, action: () => void) => {
    if (!editor || !editor.selection || !Editor.isEditor(editor) || !('selection' in editor)) {
        return;
    }
    if (!Range.isRange(editor.selection)) {
        return;
    }

    action();
};

// --- Button ---
const Btn = ({
    onClick,
    children,
    active,
    title,
    className,
}: {
    onClick?: () => void;
    children: React.ReactNode;
    active?: boolean;
    title?: string;
    className?: string;
}) => (
    <button
        type="button"
        onMouseDown={e => { e.preventDefault(); onClick?.(); }}
        className={cn(
            "p-1.5 rounded hover:bg-muted/80 flex items-center justify-center w-7 h-7 transition-colors",
            active && "bg-primary/20 text-primary",
            className
        )}
        title={title}
    >
        {children}
    </button>
);

// --- Color Picker ---
const ColorPicker = ({
    isOpen,
    onClose,
    onSelect,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (color: string) => void;
}) => {
    if (!isOpen) return null;

    const colors = [
        '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
        '#ff0000', '#ff6600', '#ffcc00', '#33cc33', '#0066ff', '#9900ff',
        '#ff99cc', '#ffcc99', '#ffff99', '#ccffcc', '#99ccff', '#cc99ff',
    ];

    return (
        <>
            <div className="fixed inset-0 z-40" onMouseDown={(e) => { e.preventDefault(); onClose(); }} />
            <div className="absolute left-0 bottom-full mb-1 bg-popover rounded-lg shadow-xl border z-50 p-2 w-[140px]">
                <div className="grid grid-cols-6 gap-1">
                    {colors.map(color => (
                        <button
                            key={color}
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onSelect(color);
                                onClose();
                            }}
                            className="w-5 h-5 rounded border border-border/50 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            </div>
        </>
    );
};

// ID for the portal container in PropertyPanel
export const PORTAL_TOOLBAR_CONTAINER_ID = 'rich-text-toolbar-portal';

// --- Main Portal Toolbar ---
export const PortalToolbar = () => {
    const editor = useEditorRef();
    const [showTextColor, setShowTextColor] = useState(false);
    const [showHighlight, setShowHighlight] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    const insertEmoji = (emoji: string) => {
        runWithSelection(editor, () => {
            Transforms.insertText(editor, emoji);
        });
    };

    // Find the portal container
    const container = typeof document !== 'undefined'
        ? document.getElementById(PORTAL_TOOLBAR_CONTAINER_ID)
        : null;

    if (!editor || !container) return null;

const quickEmojis = ['😀', '😁', '😍', '🎉', '🔥', '👍', '❤️', '🚀', '🧠', '✅', '📝', '💡'];

const toolbar = (
        <div className="space-y-3">
            {/* Marks */}
            <div className="flex items-center gap-0.5 p-1 bg-muted/30 rounded-md border flex-wrap">
                <Btn active={isMarkActive(editor, 'bold')} onClick={() => runWithSelection(editor, () => toggleMark(editor, 'bold'))} title="Bold">
                    <Bold className="w-3.5 h-3.5" />
                </Btn>
                <Btn active={isMarkActive(editor, 'italic')} onClick={() => runWithSelection(editor, () => toggleMark(editor, 'italic'))} title="Italic">
                    <Italic className="w-3.5 h-3.5" />
                </Btn>
                <Btn active={isMarkActive(editor, 'underline')} onClick={() => runWithSelection(editor, () => toggleMark(editor, 'underline'))} title="Underline">
                    <Underline className="w-3.5 h-3.5" />
                </Btn>
                <Btn active={isMarkActive(editor, 'strikethrough')} onClick={() => runWithSelection(editor, () => toggleMark(editor, 'strikethrough'))} title="Strikethrough">
                    <Strikethrough className="w-3.5 h-3.5" />
                </Btn>
                <Btn active={isMarkActive(editor, 'code')} onClick={() => runWithSelection(editor, () => toggleMark(editor, 'code'))} title="Code">
                    <Code className="w-3.5 h-3.5" />
                </Btn>

                <div className="w-px h-5 bg-border/50 mx-1" />

                <div className="relative">
                    <Btn onClick={() => setShowTextColor(!showTextColor)} title="Text Color">
                        <Palette className="w-3.5 h-3.5" />
                    </Btn>
                    <ColorPicker
                        isOpen={showTextColor}
                        onClose={() => setShowTextColor(false)}
                        onSelect={(c) => runWithSelection(editor, () => Editor.addMark(editor as any, 'color', c))}
                    />
                </div>

                <div className="relative">
                    <Btn onClick={() => setShowHighlight(!showHighlight)} title="Highlight">
                        <Highlighter className="w-3.5 h-3.5" />
                    </Btn>
                    <ColorPicker
                        isOpen={showHighlight}
                        onClose={() => setShowHighlight(false)}
                        onSelect={(c) => runWithSelection(editor, () => Editor.addMark(editor as any, 'backgroundColor', c))}
                    />
                </div>
            </div>

            {/* Font */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Font</label>
                    <select
                        className="w-full px-2 py-1.5 text-xs rounded-md border bg-background"
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => runWithSelection(editor, () => {
                            if (e.target.value) {
                                Editor.addMark(editor as any, 'fontFamily', e.target.value);
                            } else {
                                Editor.removeMark(editor as any, 'fontFamily');
                            }
                        })}
                    >
                        <option value="">Select</option>
                        <option value="Inter">Inter</option>
                        <option value="Arial">Arial</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Courier New">Mono</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                    <select
                        className="w-full px-2 py-1.5 text-xs rounded-md border bg-background"
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => runWithSelection(editor, () => {
                            if (e.target.value) {
                                Editor.addMark(editor as any, 'fontSize', e.target.value);
                            } else {
                                Editor.removeMark(editor as any, 'fontSize');
                            }
                        })}
                    >
                        <option value="">Select</option>
                        <option value="12px">12</option>
                        <option value="14px">14</option>
                        <option value="16px">16</option>
                        <option value="18px">18</option>
                        <option value="24px">24</option>
                        <option value="32px">32</option>
                    </select>
                </div>
            </div>

            {/* Alignment */}
            <div>
                <label className="text-xs text-muted-foreground mb-1 block">Alignment</label>
                <div className="flex gap-1">
                    <Btn className="flex-1" onClick={() => runWithSelection(editor, () => setAlign(editor, 'left'))} title="Left">
                        <AlignLeft className="w-3.5 h-3.5" />
                    </Btn>
                    <Btn className="flex-1" onClick={() => runWithSelection(editor, () => setAlign(editor, 'center'))} title="Center">
                        <AlignCenter className="w-3.5 h-3.5" />
                    </Btn>
                    <Btn className="flex-1" onClick={() => runWithSelection(editor, () => setAlign(editor, 'right'))} title="Right">
                        <AlignRight className="w-3.5 h-3.5" />
                    </Btn>
                </div>
            </div>

            {/* Lists */}
            <div>
                <label className="text-xs text-muted-foreground mb-1 block">Lists</label>
                <div className="flex gap-1">
                    <Btn className="flex-1" onClick={() => runWithSelection(editor, () => toggleList(editor, 'ul'))} title="Bullet">
                        <List className="w-3.5 h-3.5" />
                    </Btn>
                    <Btn className="flex-1" onClick={() => runWithSelection(editor, () => toggleList(editor, 'ol'))} title="Numbered">
                        <ListOrdered className="w-3.5 h-3.5" />
                    </Btn>
                </div>
            </div>

            {/* Insert */}
            <div>
                <label className="text-xs text-muted-foreground mb-1 block">Insert</label>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const url = prompt('Link URL:');
                            if (url) {
                                runWithSelection(editor, () => {
                                    Transforms.wrapNodes(editor as any, { type: 'a', url, children: [] } as any, { split: true });
                                });
                            }
                        }}
                        className="flex-1 px-2 py-1.5 text-xs rounded-md border bg-background hover:bg-accent flex items-center justify-center gap-1"
                    >
                        <Link className="w-3 h-3" /> Link
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const url = prompt('Image URL:');
                            if (url) {
                                runWithSelection(editor, () => {
                                    Transforms.insertNodes(editor as any, { type: 'img', url, children: [{ text: '' }] } as any);
                                });
                            }
                        }}
                        className="flex-1 px-2 py-1.5 text-xs rounded-md border bg-background hover:bg-accent flex items-center justify-center gap-1"
                    >
                        <Image className="w-3 h-3" /> Image
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const table = {
                                type: 'table',
                                children: [
                                    { type: 'tr', children: [{ type: 'td', children: [{ text: '' }] }, { type: 'td', children: [{ text: '' }] }] },
                                    { type: 'tr', children: [{ type: 'td', children: [{ text: '' }] }, { type: 'td', children: [{ text: '' }] }] },
                                ]
                            };
                            runWithSelection(editor, () => {
                                Transforms.insertNodes(editor as any, table as any);
                            });
                        }}
                        className="flex-1 px-2 py-1.5 text-xs rounded-md border bg-background hover:bg-accent flex items-center justify-center gap-1"
                    >
                        <Table className="w-3 h-3" /> Table
                    </button>
                    <div className="relative">
                        <Btn
                            onClick={() => setShowEmojiPicker((prev) => !prev)}
                            title="Insert emoji"
                        >
                            <Smile className="w-3.5 h-3.5" />
                        </Btn>
                        {showEmojiPicker ? (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onMouseDown={() => setShowEmojiPicker(false)}
                                />
                                <div className="absolute right-0 bottom-full mb-1 bg-popover rounded-lg shadow-xl border z-50 p-2 w-[182px]">
                                    <div className="grid grid-cols-6 gap-1">
                                        {quickEmojis.map((emoji) => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    insertEmoji(emoji);
                                                    setShowEmojiPicker(false);
                                                }}
                                                className="w-7 h-7 rounded border border-border/50 hover:bg-accent"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(toolbar, container);
};
