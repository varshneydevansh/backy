import React, { useEffect, useMemo, useRef } from 'react';
import { Element as SlateElement, Editor, Node, Range as SlateRange, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
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

import { BaseTextAlignPlugin } from '@udecode/plate-alignment';
import { BaseFontBackgroundColorPlugin, BaseFontColorPlugin, BaseFontSizePlugin } from '@udecode/plate-font';
import { BaseIndentPlugin } from '@udecode/plate-indent';
import { BaseAutoformatPlugin } from '@udecode/plate-autoformat';

import { FloatingToolbar } from './ui/FloatingToolbar';
import { AdvancedToolbar } from './ui/AdvancedToolbar';
import { PortalToolbar } from './ui/PortalToolbar';
import { applyInlineMarkdownShortcut, applyInlineMarkdownShortcutOnInput } from './inlineMarkdown';

import { cn } from './utils';

// Re-export for use in PropertyPanel
export { AdvancedToolbar } from './ui/AdvancedToolbar';
export { PORTAL_TOOLBAR_CONTAINER_ID } from './ui/PortalToolbar';
export { ColorPicker } from './ui/ColorPicker';
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
    /** Optional mouse-down handler inside editor content */
    onMouseDown?: (event: React.MouseEvent) => void;
    /** Optional mouse-up handler inside editor content */
    onMouseUp?: (event: React.MouseEvent) => void;
    /** Optional key-up handler inside editor content */
    onKeyUp?: (event: React.KeyboardEvent) => void;
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
    onMouseUp,
    onKeyUp,
    onMouseDown,
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
        BaseTextAlignPlugin,
        BaseFontColorPlugin,
        BaseFontBackgroundColorPlugin,
        BaseFontSizePlugin,
        BaseIndentPlugin,
        BaseAutoformatPlugin,
    ], []);

    const editor = usePlateEditor({
        plugins,
        value,
    });
    const rootRef = useRef<HTMLDivElement | null>(null);
    const draggedListItemPathRef = useRef<number[] | null>(null);
    const draggedListItemIndentRef = useRef<number | undefined>(undefined);

    const findListItemPathFromDom = (listItem: HTMLElement) => {
        const listContainer = listItem.closest('ul, ol');
        const root = rootRef.current;
        if (!(listContainer instanceof HTMLElement) || !root?.contains(listContainer)) {
            return null;
        }

        const renderedLists = Array.from(root.querySelectorAll<HTMLElement>('ul, ol'));
        const listIndex = renderedLists.indexOf(listContainer);
        const listItems = Array.from(listContainer.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement && child.matches('[data-backy-rich-list-item="true"]')
        );
        const itemIndex = listItems.indexOf(listItem);
        if (listIndex < 0 || itemIndex < 0) {
            return null;
        }

        const slateLists = Array.from(
            Editor.nodes(editor as any, {
                at: [],
                match: isListContainer,
            })
        );
        const [, listPath] = slateLists[listIndex] || [];
        return Array.isArray(listPath) ? [...listPath, itemIndex] : null;
    };

    const findListItemPathAtPoint = (clientX: number, clientY: number, options: { handlesOnly?: boolean } = {}) => {
        if (typeof document === 'undefined') {
            return null;
        }

        const candidates = Array.from(
            document.querySelectorAll<HTMLElement>(
                options.handlesOnly
                    ? '[data-backy-rich-list-drag-handle="true"]'
                    : '[data-backy-rich-list-drag-handle="true"], [data-backy-rich-list-item="true"]'
            )
        );
        const target = candidates.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        });
        const listItem = target?.closest?.('[data-backy-rich-list-item="true"]') || null;

        try {
            if (!(listItem instanceof HTMLElement)) {
                return null;
            }

            return findListItemPathFromDom(listItem);
        } catch {
            return null;
        }
    };

    const moveListItemByDrag = (sourcePath: number[], targetPath: number[], sourceIndent?: number) => {
        const slateEditor = editor as any;
        if (readOnly || !sourcePath.length || !targetPath.length) {
            return false;
        }

        const sourceParentPath = sourcePath.slice(0, -1);
        const targetParentPath = targetPath.slice(0, -1);
        if (sourceParentPath.join('.') !== targetParentPath.join('.')) {
            return false;
        }

        const sourceIndex = sourcePath[sourcePath.length - 1] ?? -1;
        const targetIndex = targetPath[targetPath.length - 1] ?? -1;
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
            return false;
        }

        try {
            const currentListItemNode = Node.get(slateEditor, sourcePath) as unknown as Record<string, unknown>;
            const currentIndent = typeof currentListItemNode.indent === 'number'
                ? currentListItemNode.indent
                : typeof sourceIndent === 'number'
                  ? sourceIndent
                  : undefined;
            const nextChildren = JSON.parse(JSON.stringify(slateEditor.children || []));
            let parentChildren: unknown[] | null = Array.isArray(nextChildren) ? nextChildren : null;
            for (const index of sourceParentPath) {
                const nextParent = parentChildren?.[index] as { children?: unknown[] } | undefined;
                parentChildren = Array.isArray(nextParent?.children) ? nextParent.children : null;
            }

            if (!parentChildren || targetIndex > parentChildren.length - 1) {
                return false;
            }

            const [movedNode] = parentChildren.splice(sourceIndex, 1) as [Record<string, unknown> | undefined];
            if (!movedNode) {
                return false;
            }
            if (typeof currentIndent === 'number' && currentIndent > 0) {
                movedNode.indent = currentIndent;
            }
            const nextPath = [...sourceParentPath, targetIndex];
            parentChildren.splice(targetIndex, 0, movedNode);
            slateEditor.children = nextChildren;
            try {
                Transforms.select(slateEditor, Editor.start(slateEditor, nextPath));
            } catch {
                // Selection is best-effort after list item drag reorder.
            }
            slateEditor.onChange?.();
            if (Array.isArray(slateEditor.children)) {
                onChange?.(JSON.parse(JSON.stringify(slateEditor.children)));
            }
            return true;
        } catch {
            return false;
        }
    };

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
            if (nextIndent === 0) {
                Transforms.unsetNodes(slateEditor, 'indent' as any, { at: path });
            } else {
                Transforms.setNodes(slateEditor, { indent: nextIndent } as any, { at: path });
            }
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
            const nextIndent = Math.max(0, currentIndent - 1);
            if (nextIndent === 0) {
                Transforms.unsetNodes(slateEditor, 'indent' as any, { at: path, match: isListItem });
            } else {
                Transforms.setNodes(
                    slateEditor,
                    { indent: nextIndent } as any,
                    { at: path, match: isListItem }
                );
            }
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

    const handleBlockMarkdownShortcuts = (event: React.KeyboardEvent) => {
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
        const isBlockquote = textBefore === '>';
        const isUnorderedList = textBefore === '-' || textBefore === '*' || textBefore === '+';
        const orderedMatch = textBefore.match(/^\d+[.)]$/);

        if (!isHeading && !isBlockquote && !isUnorderedList && !orderedMatch) {
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

        if (isBlockquote) {
            Transforms.setNodes(slateEditor, { type: 'blockquote' } as any, {
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

    const handleInlineMarkdownShortcuts = () => {
        const slateEditor = editor as any;
        if (!slateEditor || readOnly) {
            return false;
        }

        const textBefore = slateEditor.selection && SlateRange.isRange(slateEditor.selection)
            ? Editor.string(slateEditor, {
                anchor: Editor.start(slateEditor, []),
                focus: slateEditor.selection.anchor,
            })
            : '';
        const typedCharacter = textBefore.slice(-1);

        if (!['*', '_', '~', '`'].includes(typedCharacter)) {
            return false;
        }

        return applyInlineMarkdownShortcutOnInput(slateEditor, typedCharacter);
    };

    const handleInlineMarkdownKeyDown = (event: React.KeyboardEvent) => {
        const slateEditor = editor as any;
        if (!slateEditor || event.defaultPrevented || readOnly || !['*', '_', '~', '`'].includes(event.key)) {
            return false;
        }

        const transformed = applyInlineMarkdownShortcut(slateEditor, event.key);
        if (!transformed) {
            return false;
        }

        event.preventDefault();
        return true;
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Tab' && handleListIndentShortcut(event, event.shiftKey ? -1 : 1)) {
            return;
        }

        if (event.key === 'Enter' && handleListEnterShortcut(event)) {
            return;
        }

        if (handleBlockMarkdownShortcuts(event)) {
            return;
        }

        if (handleInlineMarkdownKeyDown(event)) {
            return;
        }

        onKeyDown?.(event);
    };

    const handleInput = () => {
        handleInlineMarkdownShortcuts();
    };

    const renderLeaf = (props: any) => {
        const { attributes, children, leaf } = props;
        const formatFontFamily = (value?: string) => {
            const raw = (value || '').trim();
            if (!raw) return raw;
            if (raw === 'inherit') return raw;
            if (raw.includes(',')) return raw;
            if (raw.includes(' ')) return `"${raw}"`;
            return raw;
        };
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
        if (leaf.fontFamily) style.fontFamily = formatFontFamily(leaf.fontFamily);
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
        const tableNodeType = type === 'table'
            ? 'table'
            : type === 'tr'
              ? 'tr'
              : type === 'td' || type === 'th'
                ? type
                : undefined;

        if (tableNodeType === 'table') {
            const caption = typeof element?.caption === 'string' ? element.caption.trim() : '';
            return (
                <table
                    {...attributes}
                    data-backy-rich-table="true"
                    style={{
                        ...elementStyle,
                        width: '100%',
                        borderCollapse: 'collapse',
                        tableLayout: 'fixed',
                    }}
                >
                    {caption ? (
                        <caption
                            contentEditable={false}
                            data-backy-rich-table-caption="true"
                            suppressContentEditableWarning
                            style={{
                                captionSide: 'top',
                                padding: '0 0 0.375rem',
                                textAlign: 'left',
                                color: '#475569',
                                fontSize: '0.875em',
                            }}
                        >
                            {caption}
                        </caption>
                    ) : null}
                    <tbody>{children}</tbody>
                </table>
            );
        }

        if (tableNodeType === 'tr') {
            return (
                <tr {...attributes} data-backy-rich-table-row="true" style={elementStyle}>
                    {children}
                </tr>
            );
        }

        if (tableNodeType === 'td' || tableNodeType === 'th') {
            const Tag = tableNodeType as 'td' | 'th';
            const backgroundColor = typeof element?.backgroundColor === 'string'
                ? element.backgroundColor.trim()
                : '';
            const borderColor = typeof element?.borderColor === 'string'
                ? element.borderColor.trim()
                : '';
            return (
                <Tag
                    {...attributes}
                    data-backy-rich-table-cell="true"
                    style={{
                        ...elementStyle,
                        border: `1px solid ${borderColor || '#e5e7eb'}`,
                        padding: '0.375rem 0.5rem',
                        verticalAlign: 'top',
                        ...(backgroundColor ? { backgroundColor } : {}),
                    }}
                >
                    {children}
                </Tag>
            );
        }

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
            const getListItemPath = () => ReactEditor.findPath(editor as any, element);
            const getListItemPathFromHandle = (event: MouseEvent) => {
                const target = event.currentTarget instanceof Element
                    ? event.currentTarget
                    : event.target instanceof Element
                      ? event.target
                      : null;
                const listItem = target?.closest?.('[data-backy-rich-list-item="true"]');
                if (listItem instanceof HTMLElement) {
                    return findListItemPathFromDom(listItem);
                }
                return getListItemPath();
            };
            const getListItemIndentFromDom = (target: EventTarget | null) => {
                if (typeof window === 'undefined') {
                    return indent > 0 ? indent : undefined;
                }

                const targetElement = target instanceof Element ? target : null;
                const listItem = targetElement?.closest?.('[data-backy-rich-list-item="true"]');
                if (listItem instanceof HTMLElement) {
                    const marginLeft = Number.parseFloat(window.getComputedStyle(listItem).marginLeft || '0');
                    if (Number.isFinite(marginLeft) && marginLeft > 0) {
                        return Math.max(1, Math.round(marginLeft / 24));
                    }
                }

                return indent > 0 ? indent : undefined;
            };
            const handleDragStart = (event: React.DragEvent<HTMLLIElement> | DragEvent) => {
                if (readOnly) {
                    return;
                }

                try {
                    const path = getListItemPath();
                    draggedListItemPathRef.current = path;
                    draggedListItemIndentRef.current = getListItemIndentFromDom(event.currentTarget);
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', path.join('.'));
                    }
                } catch {
                    draggedListItemPathRef.current = null;
                    draggedListItemIndentRef.current = undefined;
                }
            };
            const handleDragOver = (event: React.DragEvent<HTMLLIElement> | DragEvent) => {
                if (readOnly || !draggedListItemPathRef.current) {
                    return;
                }

                try {
                    const targetPath = getListItemPath();
                    const sourceParent = draggedListItemPathRef.current.slice(0, -1).join('.');
                    const targetParent = targetPath.slice(0, -1).join('.');
                    if (sourceParent === targetParent && draggedListItemPathRef.current.join('.') !== targetPath.join('.')) {
                        event.preventDefault();
                        if (event.dataTransfer) {
                            event.dataTransfer.dropEffect = 'move';
                        }
                    }
                } catch {
                }
            };
            const handleDrop = (event: React.DragEvent<HTMLLIElement> | DragEvent) => {
                if (readOnly || !draggedListItemPathRef.current) {
                    return;
                }

                event.preventDefault();
                try {
                    const targetPath = getListItemPath();
                    moveListItemByDrag(draggedListItemPathRef.current, targetPath, draggedListItemIndentRef.current);
                } finally {
                    draggedListItemPathRef.current = null;
                    draggedListItemIndentRef.current = undefined;
                }
            };
            const handleDragEnd = () => {
                draggedListItemPathRef.current = null;
                draggedListItemIndentRef.current = undefined;
            };
            const handlePointerReorderStart = (event: MouseEvent) => {
                if (readOnly || event.button !== 0) {
                    return;
                }

                let sourcePath: number[] | null = null;
                try {
                    sourcePath = getListItemPathFromHandle(event);
                } catch {
                    sourcePath = null;
                }
                if (!sourcePath) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                draggedListItemPathRef.current = sourcePath;
                const sourceIndent = getListItemIndentFromDom(event.currentTarget);
                draggedListItemIndentRef.current = sourceIndent;
                const startX = event.clientX;
                const startY = event.clientY;

                const handlePointerReorderEnd = (mouseEvent: MouseEvent) => {
                    try {
                        const targetPath = findListItemPathAtPoint(mouseEvent.clientX, mouseEvent.clientY);
                        const movedDistance = Math.hypot(mouseEvent.clientX - startX, mouseEvent.clientY - startY);
                        if (targetPath && movedDistance >= 4) {
                            moveListItemByDrag(sourcePath, targetPath, sourceIndent);
                            mouseEvent.preventDefault();
                            mouseEvent.stopPropagation();
                        }
                    } finally {
                        draggedListItemPathRef.current = null;
                        draggedListItemIndentRef.current = undefined;
                        document.removeEventListener('mouseup', handlePointerReorderEnd, true);
                    }
                };

                document.addEventListener('mouseup', handlePointerReorderEnd, true);
            };
            const setListItemHandleRef = (node: HTMLSpanElement | null) => {
                if (!node) {
                    return;
                }

                (node as any).__backyRichListHandleCleanup?.();
                node.addEventListener('mousedown', handlePointerReorderStart);
                (node as any).__backyRichListHandleCleanup = () => {
                    node.removeEventListener('mousedown', handlePointerReorderStart);
                };
            };
            const setListItemRef = (node: HTMLLIElement | null) => {
                const slateRef = (attributes as any).ref;
                if (typeof slateRef === 'function') {
                    slateRef(node);
                } else if (slateRef && typeof slateRef === 'object') {
                    slateRef.current = node;
                }

                if (!node) {
                    return;
                }

                (node as any).__backyRichListDragCleanup?.();
                node.addEventListener('dragstart', handleDragStart as EventListener);
                node.addEventListener('dragover', handleDragOver as EventListener);
                node.addEventListener('drop', handleDrop as EventListener);
                node.addEventListener('dragend', handleDragEnd as EventListener);
                (node as any).__backyRichListDragCleanup = () => {
                    node.removeEventListener('dragstart', handleDragStart as EventListener);
                    node.removeEventListener('dragover', handleDragOver as EventListener);
                    node.removeEventListener('drop', handleDrop as EventListener);
                    node.removeEventListener('dragend', handleDragEnd as EventListener);
                };
            };
            return (
                <li
                    {...attributes}
                    ref={setListItemRef}
                    draggable={!readOnly}
                    data-backy-rich-list-item="true"
                    style={{
                        ...elementStyle,
                        marginLeft: indent > 0 ? `${indent * 24}px` : undefined,
                    }}
                >
                    {!readOnly && (
                        <span
                            contentEditable={false}
                            ref={setListItemHandleRef}
                            data-backy-rich-list-drag-handle="true"
                            aria-hidden="true"
                            style={{
                                display: 'inline-flex',
                                width: '0.875em',
                                height: '0.875em',
                                marginLeft: 0,
                                marginRight: '0.2em',
                                cursor: 'grab',
                                fontSize: '0.65em',
                                lineHeight: 1,
                                position: 'relative',
                                zIndex: 1,
                                pointerEvents: 'auto',
                                userSelect: 'none',
                                verticalAlign: 'middle',
                                backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1.5px)',
                                backgroundSize: '4px 4px',
                                backgroundPosition: 'center',
                            }}
                        />
                    )}
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
        <div ref={rootRef} className={cn("relative h-full flex flex-col", className)}>
            <Plate
                editor={editor}
                onChange={({ value }) => onChange?.(value)}
                readOnly={readOnly}
            >
                {showToolbar && !readOnly && <AdvancedToolbar className="sticky top-0 z-10" />}
                {showPortalToolbar && !readOnly && <PortalToolbar />}
                {showToolbar && !readOnly && <FloatingToolbar />}

                <div className="flex-1 overflow-y-auto p-1">
                    <PlateContent
                        placeholder={placeholder ?? "Type..."}
                        onBlur={onBlur}
                        onFocus={onFocus}
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        onMouseUp={onMouseUp}
                        onMouseDown={onMouseDown}
                        onKeyUp={onKeyUp}
                        renderLeaf={renderLeaf}
                        renderElement={renderElement}
                    />
                </div>
            </Plate>
        </div>
    );
};
