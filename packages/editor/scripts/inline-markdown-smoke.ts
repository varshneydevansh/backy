import assert from 'node:assert/strict';
import { createEditor, Editor, Transforms } from 'slate';
import {
  applyInlineMarkdownShortcut,
  applyInlineMarkdownShortcutOnInput,
  matchInlineMarkdownShortcut,
  type InlineMarkdownMark,
} from '../src/inlineMarkdown';

type ExpectedCase = {
  before: string;
  typed: string;
  text: string;
  mark: InlineMarkdownMark;
};

const cases: ExpectedCase[] = [
  { before: '**Bold*', typed: '*', text: 'Bold', mark: 'bold' },
  { before: '__Bold_', typed: '_', text: 'Bold', mark: 'bold' },
  { before: '*Italic', typed: '*', text: 'Italic', mark: 'italic' },
  { before: '_Italic', typed: '_', text: 'Italic', mark: 'italic' },
  { before: '~~Strike~', typed: '~', text: 'Strike', mark: 'strikethrough' },
  { before: '`Code', typed: '`', text: 'Code', mark: 'code' },
];

for (const item of cases) {
  const editor = createEditor();
  editor.children = [
    {
      type: 'p',
      children: [{ text: item.before }],
    },
  ] as any;
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: item.before.length },
    focus: { path: [0, 0], offset: item.before.length },
  });

  const previewMatch = matchInlineMarkdownShortcut(`${item.before}${item.typed}`);
  assert.equal(previewMatch?.mark, item.mark, `Expected ${item.mark} match for ${item.before}${item.typed}`);
  assert.equal(previewMatch?.text, item.text, `Expected inner text for ${item.before}${item.typed}`);

  const applied = applyInlineMarkdownShortcut(editor, item.typed);
  assert.equal(applied, true, `Expected transform to apply for ${item.before}${item.typed}`);

  const renderedText = Editor.string(editor, []);
  assert.equal(renderedText, item.text, `Expected markdown wrappers to be removed for ${item.before}${item.typed}`);

  const [leaf] = Editor.nodes(editor, {
    at: [],
    match: (node) => 'text' in node,
  });
  const textNode = leaf?.[0] as Record<string, unknown> | undefined;
  assert.equal(textNode?.[item.mark], true, `Expected ${item.mark} mark on transformed text`);

  const inputEditor = createEditor();
  inputEditor.children = [
    {
      type: 'p',
      children: [{ text: `${item.before}${item.typed}` }],
    },
  ] as any;
  Transforms.select(inputEditor, {
    anchor: { path: [0, 0], offset: item.before.length + item.typed.length },
    focus: { path: [0, 0], offset: item.before.length + item.typed.length },
  });

  const appliedAfterInput = applyInlineMarkdownShortcutOnInput(inputEditor, item.typed);
  assert.equal(appliedAfterInput, true, `Expected post-input transform to apply for ${item.before}${item.typed}`);
  assert.equal(Editor.string(inputEditor, []), item.text, `Expected post-input wrappers to be removed for ${item.before}${item.typed}`);
}

assert.equal(matchInlineMarkdownShortcut('plain text'), null, 'Plain text should not match');

console.log(JSON.stringify({ ok: true, cases: cases.length }));
