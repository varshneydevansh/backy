import { Editor, Element as SlateElement, Node, Range, Text, Transforms } from 'slate';

export type BackyMediaSelection = { url: string; mediaId?: string; alt?: string; caption?: string };
export type BackyMediaRequest = (kind: 'image' | 'video') => Promise<BackyMediaSelection | null>;

export const safeToolbarMediaMetadata = (metadata?: Partial<BackyMediaSelection>): Record<string, string> => Object.fromEntries(
  ['mediaId', 'alt', 'caption'].flatMap((key) => typeof metadata?.[key as keyof BackyMediaSelection] === 'string' ? [[key, metadata[key as keyof BackyMediaSelection] as string]] : []),
);

export const captureToolbarSelection = (editor: Editor): Range | null => editor.selection ? {
  anchor: { ...editor.selection.anchor, path: [...editor.selection.anchor.path] },
  focus: { ...editor.selection.focus, path: [...editor.selection.focus.path] },
} : null;

export const restoreToolbarSelection = (editor: Editor, selection: Range | null): boolean => {
  if (!selection || !Range.isRange(selection)) return false;
  for (const point of [selection.anchor, selection.focus]) {
    if (!Node.has(editor, point.path)) return false;
    const node = Node.get(editor, point.path);
    if (!Text.isText(node) || point.offset < 0 || point.offset > node.text.length) return false;
  }
  Transforms.select(editor, selection);
  return true;
};

/** Focus the mounted host after Slate's insertion commit, using that host's DOM bindings. */
export function createToolbarFocusScheduler(frames: { request: (callback: () => void) => number; cancel: (id: number) => void }) {
  let pending: number | undefined;
  const cancel = () => { if (pending !== undefined) frames.cancel(pending); pending = undefined; };
  const schedule = (editor: Editor, focus: () => void) => {
    cancel();
    pending = frames.request(() => {
      pending = undefined;
      const selection = captureToolbarSelection(editor);
      if (!selection || ![selection.anchor, selection.focus].every((point) => Node.has(editor, point.path) && Text.isText(Node.get(editor, point.path)) && point.offset >= 0 && point.offset <= (Node.get(editor, point.path) as { text: string }).text.length)) return;
      focus();
    });
  };
  return { schedule, cancel };
}

export const normalizeToolbarUrl = (value: string, kind: 'link' | 'image'): string => {
  const source = value.trim();
  if (!source || /[\u0000-\u0020\u007f\\]/.test(source) || source.startsWith('//')) return '';
  if (/^\/(?!\/)/.test(source) || (kind === 'link' && source.startsWith('#'))) return source;
  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(source) ? source : `https://${source}`;
  try {
    const url = new URL(normalized);
    const protocols = kind === 'link' ? ['https:', 'http:', 'mailto:', 'tel:'] : ['https:', 'http:'];
    return protocols.includes(url.protocol) ? normalized : '';
  } catch { return ''; }
};

export const insertToolbarLink = (editor: Editor, value: string): boolean => {
  const url = normalizeToolbarUrl(value, 'link');
  if (!url || !editor.selection) return false;
  Transforms.unwrapNodes(editor, { match: (node) => SlateElement.isElement(node) && ['a', 'link'].includes((node as any).type), split: true });
  if (Range.isCollapsed(editor.selection!)) {
    Transforms.insertNodes(editor, { type: 'link', url, children: [{ text: url }] } as any);
  } else {
    Transforms.wrapNodes(editor, { type: 'link', url, children: [] } as any, { split: true });
  }
  Transforms.collapse(editor, { edge: 'end' });
  return true;
};

const insertStructuralBlock = (editor: Editor, node: any) => {
  const at = [editor.selection ? editor.selection.anchor.path[0] + 1 : editor.children.length];
  Transforms.insertNodes(editor, node, { at, select: true });
};

export const insertToolbarImage = (editor: Editor, value: string, metadata?: Partial<BackyMediaSelection>): boolean => {
  const url = normalizeToolbarUrl(value, 'image');
  if (!url) return false;
  insertStructuralBlock(editor, { type: 'img', url, caption: '', ...safeToolbarMediaMetadata(metadata), children: [{ text: '' }] });
  return true;
};

export const insertToolbarTable = (editor: Editor) => insertStructuralBlock(editor, {
  type: 'table', children: Array.from({ length: 2 }, () => ({
    type: 'tr', children: Array.from({ length: 2 }, () => ({ type: 'td', children: [{ type: 'p', children: [{ text: '' }] }] })),
  })),
});
