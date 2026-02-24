/**
 * ActiveEditorContext
 * 
 * Provides a way to share the active Plate editor instance and selection
 * between the Canvas and the PropertyPanel.
 * 
 * Key features:
 * - Stores editor instance when text element enters edit mode
 * - Stores last known selection so PropertyPanel can apply formatting
 * - Provides helper methods to apply formatting that restore selection first
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { PlateEditor } from '@udecode/plate/react';
import { Editor, Transforms, Element as SlateElement, Range, BaseSelection } from 'slate';
import { ReactEditor } from 'slate-react';

interface ActiveEditorContextType {
    /** The currently active Plate editor */
    activeEditor: PlateEditor | null;
    /** Register an editor as active */
    setActiveEditor: (editor: PlateEditor | null) => void;
    /** Clear the active editor */
    clearActiveEditor: (editor?: PlateEditor | null) => void;
    /** Apply a mark to selection (restores selection if needed) */
    applyMark: (format: string, value?: any) => void;
    /** Toggle a mark on selection */
    toggleMark: (format: string) => void;
    /** Remove a mark from selection */
    removeMark: (format: string) => void;
    /** Set text alignment */
    setAlign: (align: string) => void;
    /** Toggle list */
    toggleList: (format: 'ul' | 'ol') => void;
    /** Increase list indent for selected list item(s) */
    indentList: () => void;
    /** Decrease list indent for selected list item(s) */
    outdentList: () => void;
    /** Insert plain text at current selection */
    insertText: (text: string) => void;
    /** Insert a link node at current selection */
    insertLink: (url: string) => void;
    /** Insert an image node at current selection */
    insertImage: (url: string) => void;
    /** Check if mark is active */
    isMarkActive: (format: string) => boolean;
    /** Store current selection */
    storeSelection: () => void;
}

const ActiveEditorContext = createContext<ActiveEditorContextType>({
    activeEditor: null,
    setActiveEditor: () => { },
    clearActiveEditor: () => { },
    applyMark: () => { },
    toggleMark: () => { },
    removeMark: () => { },
    setAlign: () => { },
    toggleList: () => { },
    indentList: () => { },
    outdentList: () => { },
    insertText: () => { },
    insertLink: () => { },
    insertImage: () => { },
    isMarkActive: () => false,
    storeSelection: () => { },
});

export function ActiveEditorProvider({ children }: { children: React.ReactNode }) {
    const [activeEditor, setActiveEditorState] = useState<PlateEditor | null>(null);
    const activeEditorRef = useRef<PlateEditor | null>(null);
    const storedSelection = useRef<BaseSelection>(null);

    const setActiveEditor = useCallback((editor: PlateEditor | null) => {
        activeEditorRef.current = editor;
        setActiveEditorState(editor);
        if (editor) {
            // Store initial selection
            storedSelection.current = editor.selection;
        }
    }, []);

    const clearActiveEditor = useCallback((editor?: PlateEditor | null) => {
        if (editor && activeEditorRef.current && editor !== activeEditorRef.current) {
            return;
        }

        activeEditorRef.current = null;
        setActiveEditorState(null);
        storedSelection.current = null;
    }, []);

    // Store current selection before clicking outside
    const storeSelection = useCallback(() => {
        if (activeEditor?.selection) {
            storedSelection.current = activeEditor.selection;
        }
    }, [activeEditor]);

    // Focus editor and restore/select all
    const focusAndRestore = useCallback(() => {
        if (!activeEditor) return false;

        try {
            // Focus the editor
            ReactEditor.focus(activeEditor as any);

            // Restore selection or select all
            if (storedSelection.current && Range.isRange(storedSelection.current)) {
                Transforms.select(activeEditor as any, storedSelection.current);
            } else {
                // Select all content if no selection
                Transforms.select(activeEditor as any, {
                    anchor: Editor.start(activeEditor as any, []),
                    focus: Editor.end(activeEditor as any, []),
                });
            }
            return true;
        } catch (e) {
            console.warn('focusAndRestore failed:', e);
            return false;
        }
    }, [activeEditor]);

    const insertText = useCallback((text: string) => {
        if (!activeEditor || !text) {
            return;
        }

        try {
            if (!focusAndRestore()) return;
            Transforms.insertText(activeEditor as any, text);
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('insertText failed:', e);
        }
    }, [activeEditor, focusAndRestore]);

    const insertImage = useCallback((url: string) => {
        if (!activeEditor || !url) {
            return;
        }

        try {
            if (!focusAndRestore()) return;
            Transforms.insertNodes(
                activeEditor as any,
                {
                    type: 'img',
                    url,
                    children: [{ text: '' }],
                } as any
            );
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('insertImage failed:', e);
        }
    }, [activeEditor, focusAndRestore]);

    const insertLink = useCallback((url: string) => {
        if (!activeEditor || !url) {
            return;
        }

        try {
            if (!focusAndRestore()) return;
            if (!activeEditor.selection || !Range.isRange(activeEditor.selection)) return;

            Transforms.wrapNodes(
                activeEditor as any,
                { type: 'a', url, children: [] } as any,
                {
                    split: true,
                }
            );
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('insertLink failed:', e);
        }
    }, [activeEditor, focusAndRestore]);

    const getIsListNode = useCallback((node: unknown): node is SlateElement & { type: 'ul' | 'ol' } => {
        return (
            !Editor.isEditor(node) &&
            SlateElement.isElement(node) &&
            ['ul', 'ol'].includes((node as SlateElement & { type?: string }).type)
        );
    }, []);

    const getIsListItemNode = useCallback((node: unknown): node is SlateElement & { type: 'li' } => {
        return (
            !Editor.isEditor(node) &&
            SlateElement.isElement(node) &&
            (node as SlateElement & { type?: string }).type === 'li'
        );
    }, []);

    const getNonListBlockTypeForSelection = useCallback(() => {
        if (!activeEditor?.selection || !Range.isRange(activeEditor.selection)) {
            return 'p';
        }

        const matching = Array.from(
            Editor.nodes(activeEditor, {
                at: activeEditor.selection,
                match: (node) =>
                    SlateElement.isElement(node) &&
                    !getIsListNode(node) &&
                    !getIsListItemNode(node) &&
                    Editor.isBlock(activeEditor as any, node),
                mode: 'lowest',
            })
        );

        if (matching.length === 0) {
            return 'p';
        }

        const firstNode = matching[0][0] as SlateElement & { type?: string };
        const type = firstNode?.type;
        return (type === 'h1' || type === 'h2' || type === 'h3' || type === 'h4' || type === 'h5' || type === 'h6')
            ? type
            : 'p';
    }, [getIsListItemNode, getIsListNode, activeEditor]);

    const normalizeListTypeForSelection = useCallback(() => {
        if (!activeEditor?.selection || !Range.isRange(activeEditor.selection)) {
            return null;
        }

        const listTypes = Array.from(
            Editor.nodes(activeEditor, {
                at: activeEditor.selection,
                match: (node) => getIsListNode(node),
                mode: 'lowest',
            })
        ).map(([node]) => {
            return getIsListNode(node) ? node.type : null;
        });

        return listTypes.length ? (listTypes[0] as 'ul' | 'ol' | null) : null;
    }, [getIsListNode, activeEditor]);

    const applyListIndent = useCallback((step: number) => {
        if (!activeEditor) return;
        try {
            if (!focusAndRestore()) return;
            if (!activeEditor.selection || !Range.isRange(activeEditor.selection)) return;

            const listItems = Array.from(
                Editor.nodes(activeEditor, {
                    at: activeEditor.selection,
                    match: (node) => getIsListItemNode(node),
                    mode: 'lowest',
                })
            );

            if (listItems.length === 0) return;

            for (const [node, path] of listItems) {
                const next = Math.max(
                    0,
                    Number((node as any).indent || 0) + step
                );
                Transforms.setNodes(activeEditor as any, { indent: next } as any, { at: path });
            }

            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('applyListIndent failed:', e);
        }
    }, [activeEditor, focusAndRestore, getIsListItemNode]);

    const isMarkActive = useCallback((format: string): boolean => {
        if (!activeEditor) return false;
        try {
            const marks = Editor.marks(activeEditor as any) as Record<string, any> | null;
            return marks ? !!marks[format] : false;
        } catch {
            return false;
        }
    }, [activeEditor]);

    const applyMark = useCallback((format: string, value: any = true) => {
        if (!activeEditor) return;
        try {
            if (!focusAndRestore()) return;
            Editor.addMark(activeEditor as any, format, value);
            // Store updated selection
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('applyMark failed:', e);
        }
    }, [activeEditor, focusAndRestore]);

    const toggleMark = useCallback((format: string) => {
        if (!activeEditor) return;
        try {
            if (!focusAndRestore()) return;
            if (isMarkActive(format)) {
                Editor.removeMark(activeEditor as any, format);
            } else {
                Editor.addMark(activeEditor as any, format, true);
            }
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('toggleMark failed:', e);
        }
    }, [activeEditor, focusAndRestore, isMarkActive]);

    const removeMark = useCallback((format: string) => {
        if (!activeEditor) return;
        try {
            if (!focusAndRestore()) return;
            Editor.removeMark(activeEditor as any, format);
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('removeMark failed:', e);
        }
    }, [activeEditor, focusAndRestore]);

    const setAlign = useCallback((align: string) => {
        if (!activeEditor) return;
        try {
            if (!focusAndRestore()) return;
            Transforms.setNodes(activeEditor as any, { align } as any, {
                match: (n) => SlateElement.isElement(n) && Editor.isBlock(activeEditor as any, n),
            });
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('setAlign failed:', e);
        }
    }, [activeEditor, focusAndRestore]);

    const toggleList = useCallback((format: 'ul' | 'ol') => {
        if (!activeEditor) return;
        try {
            if (!focusAndRestore()) return;
            if (!activeEditor.selection || !Range.isRange(activeEditor.selection)) return;

            const currentListType = normalizeListTypeForSelection();
            if (currentListType === format) {
                const baseType = getNonListBlockTypeForSelection();
                Transforms.unwrapNodes(activeEditor as any, {
                    match: (n) => getIsListNode(n),
                    split: true,
                });
                Transforms.setNodes(activeEditor as any, { type: 'p' } as any, {
                    match: (n) => getIsListItemNode(n),
                });
                if (baseType && baseType !== 'p') {
                    Transforms.setNodes(activeEditor as any, { type: baseType } as any, {
                        match: (n) => getIsListItemNode(n),
                    });
                }
                storedSelection.current = activeEditor.selection;
                return;
            }

            Transforms.unwrapNodes(activeEditor as any, {
                match: (n) => getIsListNode(n),
                split: true,
            });
            Transforms.setNodes(activeEditor as any, { indent: 0 } as any, {
                match: (n) => getIsListItemNode(n),
            });
            Transforms.setNodes(activeEditor as any, { type: 'li' } as any, {
                match: (n) => SlateElement.isElement(n),
            });
            Transforms.wrapNodes(activeEditor as any, { type: format, children: [] } as any);
            storedSelection.current = activeEditor.selection;
        } catch (e) {
            console.warn('toggleList failed:', e);
        }
    }, [activeEditor, focusAndRestore, normalizeListTypeForSelection, getNonListBlockTypeForSelection, getIsListNode, getIsListItemNode]);

    const indentList = useCallback(() => {
        applyListIndent(1);
    }, [applyListIndent]);

    const outdentList = useCallback(() => {
        applyListIndent(-1);
    }, [applyListIndent]);

    return (
        <ActiveEditorContext.Provider value={{
            activeEditor,
            setActiveEditor,
            clearActiveEditor,
            applyMark,
            toggleMark,
            removeMark,
            setAlign,
            toggleList,
            indentList,
            outdentList,
            insertText,
            insertLink,
            insertImage,
            isMarkActive,
            storeSelection,
        }}>
            {children}
        </ActiveEditorContext.Provider>
    );
}

export function useActiveEditor() {
    return useContext(ActiveEditorContext);
}

export default ActiveEditorContext;
