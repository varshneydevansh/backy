import { Editor, Transforms } from 'slate';
import { resolveBackyVideoSource, createBackyDataFigureSample } from '@backy-cms/core';
import type { BackyDataFigureKey } from '@backy-cms/core';
import { safeToolbarMediaMetadata } from './toolbarEditing';
import type { BackyMediaSelection } from './toolbarEditing';
import { createRichInteractiveComponent } from '../interactiveComponent';
import type { BackyInteractiveRegistryEntry } from '../interactiveComponent';

export const insertRichArticleBlock = (editor: Editor, block: any) => {
    // Keep structural nodes out of code_line/text leaves when a toolbar is used there.
    const at = [editor.selection ? editor.selection.anchor.path[0] + 1 : editor.children.length];
    Transforms.insertNodes(editor, block, { at, select: true });
};

export const insertRichCodeBlock = (editor: Editor) => {
    insertRichArticleBlock(editor, { type: 'code_block', lang: 'text', children: [{ type: 'code_line', children: [{ text: '' }] }] });
};

export const insertRichMediaEmbed = (editor: Editor, url: string, metadata?: Partial<BackyMediaSelection>): boolean => {
    const source = resolveBackyVideoSource(url);
    if (source.kind === 'empty' || source.kind === 'invalid') return false;
    insertRichArticleBlock(editor, { type: 'media_embed', url: url.trim(), caption: '', ...safeToolbarMediaMetadata(metadata), children: [{ text: '' }] });
    return true;
};

export const insertRichCollapsible = (editor: Editor) => {
    insertRichArticleBlock(editor, { type: 'collapsible', title: 'Details', defaultOpen: false, children: [{ type: 'p', children: [{ text: '' }] }] });
};

export const insertRichDataFigure = (editor: Editor, componentKey: BackyDataFigureKey) => {
    insertRichArticleBlock(editor, { ...createBackyDataFigureSample(componentKey), type: 'data_figure', children: [{ text: '' }] });
};

export const insertRichInteractiveComponent = (editor: Editor, component: BackyInteractiveRegistryEntry) => {
    insertRichArticleBlock(editor, createRichInteractiveComponent(component));
};
