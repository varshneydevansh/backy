import React, { useEffect, useMemo } from 'react';
import { Element as SlateElement, Editor, Range as SlateRange, Transforms } from 'slate';
import { Plate, PlateContent, ParagraphPlugin, usePlateEditor } from '@udecode/plate/react';
import type { PlateEditor } from '@udecode/plate/react';
import { BaseBoldPlugin, BaseItalicPlugin, BaseUnderlinePlugin, BaseCodePlugin, BaseStrikethroughPlugin } from '@udecode/plate-basic-marks';
import { BaseBlockquotePlugin } from '@udecode/plate-block-quote';
import { BaseCodeBlockPlugin } from '@udecode/plate-code-block';
import { BaseHeadingPlugin } from '@udecode/plate-heading';
import { BaseLinkPlugin } from '@udecode/plate-link';
import { BaseListPlugin } from '@udecode/plate-list';
import { BaseImagePlugin, BaseMediaEmbedPlugin } from '@udecode/plate-media';
import { BaseEquationPlugin } from '@udecode/plate-math';

// New Plugins
import { BaseTablePlugin } from '@udecode/plate-table';
import { BaseTextAlignPlugin } from '@udecode/plate-alignment';
import { BaseFontBackgroundColorPlugin, BaseFontColorPlugin, BaseFontSizePlugin } from '@udecode/plate-font';
import { BaseIndentPlugin } from '@udecode/plate-indent';
import { BaseAutoformatPlugin } from '@udecode/plate-autoformat';

import { FloatingToolbar } from './ui/FloatingToolbar';
import { AdvancedToolbar } from './ui/AdvancedToolbar';
import { PortalToolbar, PORTAL_TOOLBAR_CONTAINER_ID } from './ui/PortalToolbar';

import { cn } from './utils';

// Re-export for use in PropertyPanel
export { AdvancedToolbar } from './ui/AdvancedToolbar';
export { PORTAL_TOOLBAR_CONTAINER_ID } from './ui/PortalToolbar';
export type { PlateEditor } from '@udecode/plate/react';

export type BackyEditorProps = {
    value?: any[];
    onChange?: (value: any[]) => void;
    readOnly?: boolean;
    className?: string;
    placeholder?: string;
    onBlur?: () => void;
    /** Show inline toolbar (default: false for canvas use) */
    showToolbar?: boolean;
    /** Render portal toolbar to PropertyPanel (when editing) */
    showPortalToolbar?: boolean;
    /** Callback when editor is ready - provides access to the plate editor instance */
    onEditorReady?: (editor: PlateEditor) => void;
    /** Callback on editor focus */
    onFocus?: (event: React.FocusEvent) => void;
    /** Optional key handler for editor keyboard shortcuts */
    onKeyDown?: (event: React.KeyboardEvent) => void;
};

const isListContainer = (node: unknown): node is SlateElement & { type: 'ul' | 'ol' } => {
    return (
        !Editor.isEditor(node) &&
        SlateElement.isElement(node) &&
        ((node as { type?: string }).type === 'ul' || (node as { type?: string }).type === 'ol')
    );
};

const isListItem = (node: unknown): node is SlateElement & { type: 'li'; indent?: number } => {
    return (
        !Editor.isEditor(node) &&
        SlateElement.isElement(node) &&
        (node as { type?: string }).type === 'li'
    );
};

export const BackyEditor = ({
    value,
    onChange,
    readOnly,
    className,
    placeholder,
    onBlur,
        showToolbar = false,
    showPortalToolbar = false,
    onEditorReady,
    onFocus,
    onKeyDown,
}: BackyEditorProps) => {

    const plugins = useMemo(() => [
        ParagraphPlugin,
        BaseBoldPlugin,
        BaseItalicPlugin,
        BaseUnderlinePlugin,
        BaseStrikethroughPlugin,
        BaseCodePlugin,
        BaseBlockquotePlugin,
        BaseCodeBlockPlugin,
        BaseHeadingPlugin,
        BaseLinkPlugin,
        BaseListPlugin,
        BaseImagePlugin,
        BaseMediaEmbedPlugin,
        BaseEquationPlugin,

        // Advanced
        BaseTablePlugin,
        BaseTextAlignPlugin,
        BaseFontColorPlugin,
        BaseFontBackgroundColorPlugin,
        BaseFontSizePlugin,
        BaseIndentPlugin,
        BaseAutoformatPlugin,
    ], []);

    const editor = usePlateEditor({ plugins, value });

    // Expose editor instance when ready
    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady(editor);
        }
    }, [editor, onEditorReady]);

    const handleListIndentShortcut = (event: React.KeyboardEvent, step: number): boolean => {
        if (!step || readOnly) {
            return false;
        }

        const slateEditor = editor as any;
        if (!slateEditor || !SlateRange.isRange(slateEditor.selection)) {
            return false;
        }

        const selectedListItems = Array.from(
            Editor.nodes(slateEditor, {
                at: slateEditor.selection,
                match: isListItem,
                mode: 'lowest',
            })
        );

        if (selectedListItems.length === 0) {
            return false;
        }

        event.preventDefault();

        const hasSelectedListNodes = selectedListItems.length > 0;
        if (!hasSelectedListNodes) {
            return false;
        }

        for (const [node, path] of selectedListItems) {
            const currentIndent = Number((node as any).indent || 0);
            const nextIndent = Math.max(0, Math.min(8, currentIndent + step));
            Transforms.setNodes(slateEditor, { indent: nextIndent } as any, { at: path });
        }

        return true;
    };

    const handleListEnterShortcut = (event: React.KeyboardEvent): boolean => {
        if (readOnly || event.shiftKey) {
            return false;
        }

        const slateEditor = editor as any;
        if (!slateEditor || !slateEditor.selection || !SlateRange.isRange(slateEditor.selection) || !SlateRange.isCollapsed(slateEditor.selection)) {
            return false;
        }

        const selectedListItems = Array.from(
            Editor.nodes(slateEditor, {
                at: slateEditor.selection,
                match: isListItem,
                mode: 'lowest',
            })
        );
        if (selectedListItems.length === 0) {
            return false;
        }

        const [, path] = selectedListItems[0];
        const currentText = Editor.string(slateEditor, path);
        if (typeof currentText === 'string' && currentText.trim() !== '') {
            return false;
        }

        const currentIndent = Number((selectedListItems[0][0] as any).indent || 0);

        event.preventDefault();

        if (currentIndent > 0) {
            Transforms.setNodes(
                slateEditor,
                { indent: Math.max(0, currentIndent - 1) } as any,
                { at: path, match: isListItem }
            );
            return true;
        }

        Transforms.setNodes(slateEditor, { type: 'p' } as any, {
            at: path,
            match: isListItem,
        });
        Transforms.unwrapNodes(slateEditor, {
            at: path,
            match: isListContainer,
            split: true,
        });
        Transforms.select(slateEditor, SlateRange.isRange(slateEditor.selection) ? slateEditor.selection : {
            anchor: Editor.start(slateEditor, path),
            focus: Editor.start(slateEditor, path),
        });
        return true;
    };

    const handleMarkdownLikeShortcuts = (event: React.KeyboardEvent) => {
        const slateEditor = editor as any;
        if (!slateEditor || event.defaultPrevented || readOnly) {
            return false;
        }

        if (event.key !== ' ' || !slateEditor.selection || !SlateRange.isRange(slateEditor.selection) || !SlateRange.isCollapsed(slateEditor.selection)) {
            return false;
        }

        const selection = slateEditor.selection as SlateRange;

        const [currentBlock] = Array.from(
            Editor.nodes(slateEditor, {
                at: selection,
                match: (node) => SlateElement.isElement(node) && Editor.isBlock(slateEditor, node),
                mode: 'lowest',
            })
        );

        if (!currentBlock) {
            return false;
        }

        const [, blockPath] = currentBlock;
        const blockStart = Editor.start(slateEditor, blockPath);
        const rawBefore = Editor.string(slateEditor, {
            anchor: selection.anchor,
            focus: blockStart,
        });

        const textBefore = rawBefore.trim();
        const isHeading = textBefore.match(/^(#{1,3})$/);
        const isUnorderedList = textBefore === '-' || textBefore === '*' || textBefore === '+';
        const orderedMatch = textBefore.match(/^\d+[.)]$/);

        if (!isHeading && !isUnorderedList && !orderedMatch) {
            return false;
        }

        event.preventDefault();

        const rangeToClear: SlateRange = {
            anchor: selection.anchor,
            focus: blockStart,
        };
        Transforms.delete(slateEditor, { at: rangeToClear });

        const clearRangeSelection = slateEditor.selection as SlateRange | null;
        if (!clearRangeSelection) {
            return true;
        }

        if (isHeading) {
            Transforms.setNodes(slateEditor, { type: `h${isHeading[1].length}` } as any, {
                at: blockPath,
                match: (node) => SlateElement.isElement(node),
            });
            return true;
        }

        if (isUnorderedList) {
            Transforms.unwrapNodes(slateEditor, {
                at: clearRangeSelection,
                match: (node) =>
                    !Editor.isEditor(node) &&
                    SlateElement.isElement(node) &&
                    ((node as any).type === 'ul' || (node as any).type === 'ol'),
                split: true,
            });
            Transforms.setNodes(slateEditor, { type: 'li' } as any, {
                at: clearRangeSelection,
                match: (node) => SlateElement.isElement(node),
            });
            Transforms.wrapNodes(slateEditor, { type: 'ul', children: [] } as { type: string; children: any[] }, {
                at: clearRangeSelection,
                split: true,
            });
            return true;
        }

        if (orderedMatch) {
            Transforms.unwrapNodes(slateEditor, {
                at: clearRangeSelection,
                match: (node) =>
                    !Editor.isEditor(node) &&
                    SlateElement.isElement(node) &&
                    ((node as any).type === 'ul' || (node as any).type === 'ol'),
                split: true,
            });
            Transforms.setNodes(slateEditor, { type: 'li' } as any, {
                at: clearRangeSelection,
                match: (node) => SlateElement.isElement(node),
            });
            Transforms.wrapNodes(slateEditor, { type: 'ol', children: [] } as { type: string; children: any[] }, {
                at: clearRangeSelection,
                split: true,
            });
            return true;
        }

        return false;
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Tab' && handleListIndentShortcut(event, event.shiftKey ? -1 : 1)) {
            return;
        }

        if (event.key === 'Enter' && handleListEnterShortcut(event)) {
            return;
        }

        if (handleMarkdownLikeShortcuts(event)) {
            return;
        }
        onKeyDown?.(event);
    };

    const renderLeaf = (props: any) => {
        const { attributes, children, leaf } = props;
        const style: React.CSSProperties = {
            ...props.style,
        };

        const textDecorationValues = new Set<string>();

        if (leaf.bold) style.fontWeight = 'bold';
        if (leaf.italic) style.fontStyle = 'italic';
        if (leaf.fontStyle && leaf.fontStyle !== 'normal') {
            style.fontStyle = leaf.fontStyle;
        }

        if (leaf.textDecoration) {
            leaf.textDecoration
                .toString()
                .split(' ')
                .map((token: string) => token.trim())
                .filter(Boolean)
                .forEach((token: string) => textDecorationValues.add(token));
        }

        if (leaf.underline) textDecorationValues.add('underline');
        if (leaf.strikethrough) textDecorationValues.add('line-through');

        if (textDecorationValues.size > 0) {
            style.textDecoration = Array.from(textDecorationValues).join(' ');
        }

        if (leaf.code) style.fontFamily = 'monospace';
        if (leaf.fontFamily) style.fontFamily = leaf.fontFamily;
        if (leaf.fontSize) style.fontSize = leaf.fontSize;
        if (leaf.color) style.color = leaf.color;
        if (leaf.backgroundColor) style.backgroundColor = leaf.backgroundColor;

        if (leaf.align) style.textAlign = leaf.align;

        return (
            <span {...attributes} style={style}>
                {children}
            </span>
        );
    };

    const renderElement = (props: any) => {
        const { attributes, children, element } = props;
        const type = (element?.type as string | undefined) || 'p';
        const elementStyle = (props.style || {}) as React.CSSProperties;

        if (type === 'ul' || type === 'ol') {
            return React.createElement(
                type,
                {
                    ...attributes,
                    style: {
                        ...elementStyle,
                        marginLeft: 0,
                        marginRight: 0,
                        marginBottom: 0,
                        marginTop: 0,
                        paddingLeft: '1.25em',
                        listStyleType: type === 'ol' ? 'decimal' : 'disc',
                        listStylePosition: 'outside',
                    },
                },
                children
            );
        }

        if (type === 'li') {
            const indent = Number((element as any)?.indent || 0);
            return (
                <li
                    {...attributes}
                    style={{
                        ...elementStyle,
                        marginLeft: indent > 0 ? `${indent * 24}px` : undefined,
                    }}
                >
                    {children}
                </li>
            );
        }

        if (type === 'blockquote') {
            return (
                <blockquote
                    {...attributes}
                    style={{
                        ...elementStyle,
                        borderLeft: '3px solid #e5e7eb',
                        paddingLeft: '0.75rem',
                        color: elementStyle.color || undefined,
                    }}
                >
                    {children}
                </blockquote>
            );
        }

        if (type === 'img' || type === 'image') {
            const src = (element as any)?.url || (element as any)?.src || '';
            return (
                <img
                    {...attributes}
                    src={src}
                    alt={(element as any)?.alt || ''}
                    style={elementStyle}
                />
            );
        }

        if (type === 'a' || type === 'link') {
            return (
                <a
                    {...attributes}
                    href={(element as any)?.url || '#'}
                    style={elementStyle}
                >
                    {children}
                </a>
            );
        }

        const fallbackTag =
            ([
                'p',
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6',
                'pre',
                'code',
                'table',
                'tr',
                'td',
                'th',
                'a',
                'img',
            ] as const).includes(type as any)
                ? (type as
                    | 'p'
                    | 'h1'
                    | 'h2'
                    | 'h3'
                    | 'h4'
                    | 'h5'
                    | 'h6'
                    | 'pre'
                    | 'code'
                    | 'table'
                    | 'tr'
                    | 'td'
                    | 'th'
                    | 'a')
                : 'div';

        return React.createElement(
            fallbackTag,
            {
                ...attributes,
                style: elementStyle,
            },
            children
        );
    };

    return (
        <div className={cn("relative h-full flex flex-col", className)}>
            <Plate
                editor={editor}
                onChange={({ value }) => onChange?.(value)}
                readOnly={readOnly}
            >
                {showToolbar && !readOnly && <AdvancedToolbar className="sticky top-0 z-10" />}
                {showPortalToolbar && !readOnly && <PortalToolbar />}
                <FloatingToolbar />

                <div className="flex-1 overflow-y-auto p-1">
                <PlateContent
                    placeholder={placeholder ?? "Type..."}
                    onBlur={onBlur}
                    onFocus={onFocus}
                    onKeyDown={handleKeyDown}
                    renderLeaf={renderLeaf}
                    renderElement={renderElement}
                />
            </div>
        </Plate>
        </div>
    );
};
