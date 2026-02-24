/**
 * ============================================================================
 * BACKY CMS - RICH TEXT EDITOR
 * ============================================================================
 *
 * A simple rich text editor component for editing text elements.
 * Supports basic formatting: bold, italic, underline, links, lists.
 *
 * @module RichTextEditor
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bold,
    Italic,
    Underline,
    Link,
    List,
    ListOrdered,
    AlignLeft,
    AlignCenter,
    AlignRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
    className?: string;
    minHeight?: number;
}

interface ToolbarButtonProps {
    icon: React.ElementType;
    command: string;
    value?: string;
    isActive?: boolean;
    onClick?: () => void;
    title: string;
}

// ============================================
// TOOLBAR BUTTON
// ============================================

function ToolbarButton({
    icon: Icon,
    command,
    value,
    isActive,
    onClick,
    title,
}: ToolbarButtonProps) {
    const handleClick = useCallback(() => {
        if (onClick) {
            onClick();
        } else {
            document.execCommand(command, false, value);
        }
    }, [command, value, onClick]);

    return (
        <button
            type="button"
            onClick={handleClick}
            title={title}
            className={cn(
                'p-1.5 rounded hover:bg-accent transition-colors',
                isActive && 'bg-primary text-primary-foreground'
            )}
        >
            <Icon className="w-4 h-4" />
        </button>
    );
}

// ============================================
// LINK DIALOG
// ============================================

interface LinkDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (url: string, text: string) => void;
    initialText?: string;
}

function LinkDialog({ isOpen, onClose, onSubmit, initialText }: LinkDialogProps) {
    const [url, setUrl] = useState('');
    const [text, setText] = useState(initialText || '');

    useEffect(() => {
        setText(initialText || '');
    }, [initialText]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card rounded-lg p-4 w-80 shadow-xl border">
                <h3 className="font-semibold mb-3">Insert Link</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-sm text-muted-foreground">Text</label>
                        <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Link text"
                            className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-muted-foreground">URL</label>
                        <div className="flex flex-col gap-2">
                            <select
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                                onChange={(e) => {
                                    if (e.target.value) setUrl(e.target.value);
                                }}
                            >
                                <option value="">Select a page...</option>
                                <option value="/">Home</option>
                                <option value="/about">About Us</option>
                                <option value="/services">Services</option>
                                <option value="/contact">Contact</option>
                                <option value="/blog">Blog</option>
                            </select>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://... or /page-slug"
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onSubmit(url, text);
                                setUrl('');
                                setText('');
                                onClose();
                            }}
                            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
                        >
                            Insert
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// RICH TEXT EDITOR
// ============================================

export function RichTextEditor({
    content,
    onChange,
    placeholder = 'Type your text here...',
    className,
    minHeight = 100,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [selectedText, setSelectedText] = useState('');

    // Initialize content
    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== content) {
            editorRef.current.innerHTML = content;
        }
    }, []);

    const handleInput = useCallback(() => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    }, [onChange]);

    const handleLinkClick = useCallback(() => {
        const selection = window.getSelection();
        if (selection && selection.toString()) {
            setSelectedText(selection.toString());
        }
        setShowLinkDialog(true);
    }, []);

    const insertLink = useCallback((url: string, text: string) => {
        if (!url) return;
        const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">${text || url}</a>`;
        document.execCommand('insertHTML', false, linkHtml);
        handleInput();
    }, [handleInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Ctrl/Cmd + B for bold
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            document.execCommand('bold', false);
        }
        // Ctrl/Cmd + I for italic
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            document.execCommand('italic', false);
        }
        // Ctrl/Cmd + U for underline
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            document.execCommand('underline', false);
        }
        // Ctrl/Cmd + K for link
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            handleLinkClick();
        }

        // Markdown Shortcuts (Space trigger)
        if (e.key === ' ') {
            const selection = window.getSelection();
            if (!selection?.anchorNode) return;

            const anchorNode = selection.anchorNode;
            // Ensure we are in a text node
            if (anchorNode.nodeType !== Node.TEXT_NODE) return;

            const text = anchorNode.textContent || '';
            const offset = selection.anchorOffset;
            const textBefore = text.slice(0, offset);

            if (textBefore === '#') {
                e.preventDefault();
                const range = document.createRange();
                range.setStart(anchorNode, 0);
                range.setEnd(anchorNode, 1);
                range.deleteContents();
                document.execCommand('formatBlock', false, 'h1');
            } else if (textBefore === '##') {
                e.preventDefault();
                const range = document.createRange();
                range.setStart(anchorNode, 0);
                range.setEnd(anchorNode, 2);
                range.deleteContents();
                document.execCommand('formatBlock', false, 'h2');
            } else if (textBefore === '###') {
                e.preventDefault();
                const range = document.createRange();
                range.setStart(anchorNode, 0);
                range.setEnd(anchorNode, 3);
                range.deleteContents();
                document.execCommand('formatBlock', false, 'h3');
            } else if (textBefore === '*' || textBefore === '-') {
                e.preventDefault();
                const range = document.createRange();
                range.setStart(anchorNode, 0);
                range.setEnd(anchorNode, 1);
                range.deleteContents();
                document.execCommand('insertUnorderedList');
            } else if (textBefore === '1.') {
                e.preventDefault();
                const range = document.createRange();
                range.setStart(anchorNode, 0);
                range.setEnd(anchorNode, 2);
                range.deleteContents();
                document.execCommand('insertOrderedList');
            }
        }
    }, [handleLinkClick]);

    return (
        <div className={cn('border rounded-md bg-background', className)}>
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 p-1 border-b bg-muted/30 flex-wrap">
                <ToolbarButton icon={Bold} command="bold" title="Bold (Ctrl+B)" />
                <ToolbarButton icon={Italic} command="italic" title="Italic (Ctrl+I)" />
                <ToolbarButton icon={Underline} command="underline" title="Underline (Ctrl+U)" />

                <div className="w-px h-4 bg-border mx-1" />

                <ToolbarButton icon={Link} command="" onClick={handleLinkClick} title="Insert Link (Ctrl+K)" />

                <div className="w-px h-4 bg-border mx-1" />

                <ToolbarButton icon={List} command="insertUnorderedList" title="Bullet List" />
                <ToolbarButton icon={ListOrdered} command="insertOrderedList" title="Numbered List" />

                <div className="w-px h-4 bg-border mx-1" />

                <ToolbarButton icon={AlignLeft} command="justifyLeft" title="Align Left" />
                <ToolbarButton icon={AlignCenter} command="justifyCenter" title="Align Center" />
                <ToolbarButton icon={AlignRight} command="justifyRight" title="Align Right" />
            </div>

            {/* Editor Area */}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => editorRef.current?.focus()}
                onBlur={() => handleInput()}
                data-placeholder={placeholder}
                className={cn(
                    'p-3 focus:outline-none prose prose-sm max-w-none',
                    'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground',
                    '[&_a]:text-blue-500 [&_a]:underline'
                )}
                style={{ minHeight }}
            />

            {/* Link Dialog */}
            <LinkDialog
                isOpen={showLinkDialog}
                onClose={() => setShowLinkDialog(false)}
                onSubmit={insertLink}
                initialText={selectedText}
            />
        </div>
    );
}

export default RichTextEditor;
