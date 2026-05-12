import { Editor, Range as SlateRange, Transforms } from 'slate';

export type InlineMarkdownMark =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code';

export interface InlineMarkdownShortcutMatch {
  raw: string;
  text: string;
  mark: InlineMarkdownMark;
  value: true;
}

const INLINE_MARKDOWN_SHORTCUTS: Array<{
  mark: InlineMarkdownMark;
  pattern: RegExp;
  singleMarker?: '*' | '_';
}> = [
  { mark: 'bold', pattern: /(\*\*([^\n*][\s\S]*?[^\n*]|\S)\*\*)$/ },
  { mark: 'bold', pattern: /(__([^\n_][\s\S]*?[^\n_]|\S)__)$/ },
  { mark: 'strikethrough', pattern: /(~~([^\n~][\s\S]*?[^\n~]|\S)~~)$/ },
  { mark: 'code', pattern: /(`([^`\n]+)`)$/ },
  { mark: 'italic', pattern: /(\*([^\n*][\s\S]*?[^\n*]|\S)\*)$/, singleMarker: '*' },
  { mark: 'italic', pattern: /(_([^\n_][\s\S]*?[^\n_]|\S)_)$/, singleMarker: '_' },
];

export function matchInlineMarkdownShortcut(text: string): InlineMarkdownShortcutMatch | null {
  for (const shortcut of INLINE_MARKDOWN_SHORTCUTS) {
    const match = text.match(shortcut.pattern);
    if (!match) {
      continue;
    }

    const raw = match[1] || '';
    const inner = match[2] || '';
    if (!raw || !inner.trim()) {
      continue;
    }

    const matchStart = text.length - raw.length;
    if (
      shortcut.singleMarker &&
      (text[matchStart - 1] === shortcut.singleMarker || text[matchStart + raw.length] === shortcut.singleMarker)
    ) {
      continue;
    }

    return {
      raw,
      text: inner,
      mark: shortcut.mark,
      value: true,
    };
  }

  return null;
}

export function applyInlineMarkdownShortcut(editor: Editor, typedCharacter: string): boolean {
  if (
    !typedCharacter ||
    !editor.selection ||
    !SlateRange.isRange(editor.selection) ||
    !SlateRange.isCollapsed(editor.selection)
  ) {
    return false;
  }

  const selection = editor.selection;
  const textBefore = Editor.string(editor, {
    anchor: Editor.start(editor, []),
    focus: selection.anchor,
  });
  const match = matchInlineMarkdownShortcut(`${textBefore}${typedCharacter}`);
  if (!match) {
    return false;
  }

  const typedPrefixLength = match.raw.length - typedCharacter.length;
  const start = Editor.before(editor, selection.anchor, {
    distance: typedPrefixLength,
    unit: 'character',
  });

  if (!start) {
    return false;
  }

  Transforms.delete(editor, {
    at: {
      anchor: start,
      focus: selection.anchor,
    },
  });
  Transforms.insertNodes(editor, {
    text: match.text,
    [match.mark]: match.value,
  });

  return true;
}

export function applyInlineMarkdownShortcutOnInput(editor: Editor, typedCharacter: string): boolean {
  if (
    !typedCharacter ||
    !editor.selection ||
    !SlateRange.isRange(editor.selection) ||
    !SlateRange.isCollapsed(editor.selection)
  ) {
    return false;
  }

  const selection = editor.selection;
  const textBefore = Editor.string(editor, {
    anchor: Editor.start(editor, []),
    focus: selection.anchor,
  });
  const match = matchInlineMarkdownShortcut(textBefore);
  if (!match || !match.raw.endsWith(typedCharacter)) {
    return false;
  }

  const start = Editor.before(editor, selection.anchor, {
    distance: match.raw.length,
    unit: 'character',
  });

  if (!start) {
    return false;
  }

  Transforms.delete(editor, {
    at: {
      anchor: start,
      focus: selection.anchor,
    },
  });
  Transforms.insertNodes(editor, {
    text: match.text,
    [match.mark]: match.value,
  });

  return true;
}
