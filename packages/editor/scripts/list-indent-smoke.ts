import assert from 'node:assert/strict';
import {
  normalizeNestedRichTextLists,
  normalizeRichTextListIndent,
} from '../src/listNormalization';

assert.equal(normalizeRichTextListIndent({ indent: 2 }), 2);
assert.equal(normalizeRichTextListIndent({ indent: '3' }), 3);
assert.equal(normalizeRichTextListIndent({ indent: 99 }), 8);
assert.equal(normalizeRichTextListIndent({ indent: '42' }), 8);
assert.equal(normalizeRichTextListIndent({ indent: -4 }), undefined);
assert.equal(normalizeRichTextListIndent({ indent: 0 }), undefined);
assert.equal(normalizeRichTextListIndent({ indent: 'nope' }), undefined);
assert.equal(normalizeRichTextListIndent(null), undefined);

const normalized = normalizeNestedRichTextLists([
  {
    type: 'ul',
    children: [
      { type: 'li', indent: '24', children: [{ text: 'Imported deep item' }] },
      {
        type: 'li',
        children: [
          { text: 'Parent item' },
          {
            type: 'ol',
            children: [
              { type: 'li', children: [{ text: 'Nested child' }] },
            ],
          },
        ],
      },
    ],
  },
]) as Array<{ children: Array<{ indent?: number; children: Array<{ text?: string }> }> }>;

assert.equal(normalized[0].children[0].indent, 8);
assert.equal(normalized[0].children[0].children[0].text, 'Imported deep item');
assert.equal(normalized[0].children[1].indent, undefined);
assert.equal(normalized[0].children[2].indent, 1);
assert.equal(normalized[0].children[2].children[0].text, 'Nested child');

console.log(JSON.stringify({ ok: true, cases: 13 }));
