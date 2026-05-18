#!/usr/bin/env node

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const loadTsModule = async (relativePath) => {
  const helperPath = path.resolve(relativePath);
  const source = fs.readFileSync(helperPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: helperPath,
  });
  const helper = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  return { helperPath, helper };
};

const { helperPath, helper } = await loadTsModule('src/components/editor/richTextListTransforms.ts');
const { helper: listUtils } = await loadTsModule('src/components/editor/listUtils.ts');

const paragraphNodes = [
  { type: 'p', children: [{ text: 'Discovery' }] },
  { type: 'p', children: [{ text: '' }] },
  { type: 'p', children: [{ text: 'Launch' }] },
];

const listItems = helper.toListItemNodes(paragraphNodes);
assert.equal(listItems.length, 3);
assert.equal(listItems[1].type, 'li');
assert.deepEqual(listItems[1].children, [{ text: '' }]);

const mixedNodes = [
  { type: 'p', children: [{ text: 'Intro' }] },
  {
    type: 'ol',
    children: [
      { type: 'li', children: [{ text: 'First' }] },
      { type: 'li', children: [{ text: '' }] },
    ],
  },
  { type: 'p', children: [{ text: 'Outro' }] },
];
const mixedList = helper.applyListTypeToNodes(mixedNodes, 'ul');
assert.equal(mixedList.changed, true);
assert.equal(mixedList.nodes.length, 1);
assert.equal(mixedList.nodes[0].type, 'ul');
assert.equal(mixedList.nodes[0].children.length, 4);
assert.deepEqual(mixedList.nodes[0].children[2].children, [{ text: '' }]);

const existingOrdered = [{
  type: 'ol',
  children: [
    { type: 'li', indent: 1, children: [{ text: 'First' }] },
    { type: 'li', children: [{ text: 'Second' }] },
  ],
}];
const changedType = helper.applyListTypeToNodes(existingOrdered, 'ul');
assert.equal(changedType.changed, true);
assert.equal(changedType.nodes[0].type, 'ul');
assert.equal(changedType.nodes[0].children[0].indent, 1);
assert.equal(helper.applyListTypeToNodes(changedType.nodes, 'ul').changed, false);

const selectedTypeChange = helper.applyListTypeToSelectedListItemNodes([{
  type: 'ul',
  children: [
    { type: 'li', indent: 8, children: [{ text: 'Nested item' }] },
    { type: 'li', children: [{ text: 'Sibling item' }] },
  ],
}], 'ol', 'Nested item');
assert.equal(selectedTypeChange.changed, true);
assert.equal(selectedTypeChange.nodes.length, 2);
assert.equal(selectedTypeChange.nodes[0].type, 'ol');
assert.equal(selectedTypeChange.nodes[0].children[0].indent, 8);
assert.equal(selectedTypeChange.nodes[1].type, 'ul');
assert.equal(selectedTypeChange.nodes[1].children[0].indent, undefined);

const selectedMoveDown = helper.moveSelectedListItemNodes(selectedTypeChange.nodes, 'Nested item', 1);
assert.equal(selectedMoveDown.changed, true);
assert.equal(selectedMoveDown.nodes[0].type, 'ul');
assert.equal(selectedMoveDown.nodes[1].type, 'ol');
assert.equal(selectedMoveDown.nodes[1].children[0].indent, 8);

const selectedMoveUp = helper.moveSelectedListItemNodes(selectedMoveDown.nodes, 'Nested item', -1);
assert.equal(selectedMoveUp.changed, true);
assert.equal(selectedMoveUp.nodes[0].type, 'ol');
assert.equal(selectedMoveUp.nodes[0].children[0].indent, 8);
assert.equal(selectedMoveUp.nodes[1].type, 'ul');

const nestedSelectionSource = [{
  type: 'ul',
  children: [
    {
      type: 'li',
      children: [
        { text: 'Parent item' },
        {
          type: 'ul',
          children: [
            { type: 'li', indent: 2, children: [{ text: 'Child target' }] },
            { type: 'li', children: [{ text: 'Child sibling' }] },
          ],
        },
      ],
    },
    { type: 'li', children: [{ text: 'Outer sibling' }] },
  ],
}];
const nestedSelectedTypeChange = helper.applyListTypeToSelectedListItemNodes(nestedSelectionSource, 'ol', 'Child target');
assert.equal(nestedSelectedTypeChange.changed, true);
assert.equal(nestedSelectedTypeChange.nodes[0].type, 'ul');
assert.equal(nestedSelectedTypeChange.nodes[0].children[0].children[0].text, 'Parent item');
assert.equal(nestedSelectedTypeChange.nodes[0].children[0].children[1].type, 'ol');
assert.equal(nestedSelectedTypeChange.nodes[0].children[0].children[1].children[0].indent, 2);
assert.equal(nestedSelectedTypeChange.nodes[0].children[0].children[2].type, 'ul');
assert.equal(nestedSelectedTypeChange.nodes[0].children[1].children[0].text, 'Outer sibling');

const nestedSelectedMoveDown = helper.moveSelectedListItemNodes(nestedSelectionSource, 'Child target', 1);
assert.equal(nestedSelectedMoveDown.changed, true);
const movedNestedChildren = nestedSelectedMoveDown.nodes[0].children[0].children[1].children;
assert.equal(movedNestedChildren[0].children[0].text, 'Child sibling');
assert.equal(movedNestedChildren[1].children[0].text, 'Child target');
assert.equal(movedNestedChildren[1].indent, 2);
assert.equal(nestedSelectedMoveDown.nodes[0].children[0].children[0].text, 'Parent item');
assert.equal(nestedSelectedMoveDown.nodes[0].children[1].children[0].text, 'Outer sibling');

const nestedSelectedIndent = helper.applyListIndentToSelectedListItemNodes(nestedSelectionSource, 'Child target', 1);
assert.equal(nestedSelectedIndent.changed, true);
assert.equal(nestedSelectedIndent.nodes[0].children[0].indent, undefined);
assert.equal(nestedSelectedIndent.nodes[0].children[0].children[1].children[0].indent, 3);
assert.equal(nestedSelectedIndent.nodes[0].children[0].children[1].children[1].indent, undefined);
assert.equal(nestedSelectedIndent.nodes[0].children[1].indent, undefined);

const nestedSelectedOutdent = helper.applyListIndentToSelectedListItemNodes(nestedSelectionSource, 'Child target', -1);
assert.equal(nestedSelectedOutdent.changed, true);
assert.equal(nestedSelectedOutdent.nodes[0].children[0].indent, undefined);
assert.equal(nestedSelectedOutdent.nodes[0].children[0].children[1].children[0].indent, 1);
assert.equal(nestedSelectedOutdent.nodes[0].children[0].children[1].children[1].indent, undefined);

const parentSelectedIndent = helper.applyListIndentToSelectedListItemNodes(nestedSelectionSource, 'Parent item', 1);
assert.equal(parentSelectedIndent.changed, true);
assert.equal(parentSelectedIndent.nodes[0].children[0].indent, 1);
assert.equal(parentSelectedIndent.nodes[0].children[0].children[1].children[0].indent, 2);
assert.equal(parentSelectedIndent.nodes[0].children[1].indent, undefined);

const outdented = helper.applyListIndentToNodes(existingOrdered, -2);
assert.equal(outdented[0].children[0].indent, undefined);
assert.equal(outdented[0].children[1].indent, undefined);

const indented = helper.applyListIndentToNodes(existingOrdered, 1);
assert.equal(indented[0].children[0].indent, 2);
assert.equal(indented[0].children[1].indent, 1);

const nestedSlateList = [{
  type: 'ul',
  children: [
    {
      type: 'li',
      children: [
        { text: 'Parent' },
        {
          type: 'ul',
          children: [
            { type: 'li', children: [{ text: 'Child' }] },
          ],
        },
      ],
    },
    { type: 'li', indent: 2, children: [{ text: 'Explicit' }] },
  ],
}];
const nestedEntries = listUtils.extractListItemEntriesFromSlate(nestedSlateList);
assert.deepEqual(nestedEntries, [
  { text: 'Parent' },
  { text: 'Child', indent: 1 },
  { text: 'Explicit', indent: 2 },
]);
assert.deepEqual(listUtils.extractListItemsFromSlate(nestedSlateList), ['Parent', 'Child', 'Explicit']);

const normalizedNestedSlateList = helper.normalizeNestedRichTextLists(nestedSlateList);
assert.equal(normalizedNestedSlateList[0].type, 'ul');
assert.deepEqual(
  normalizedNestedSlateList[0].children.map((item) => ({
    text: item.children.map((child) => child.text || '').join(''),
    indent: item.indent,
  })),
  [
    { text: 'Parent', indent: undefined },
    { text: 'Child', indent: 1 },
    { text: 'Explicit', indent: 2 },
  ],
);
const normalizedExplicitRootIndent = helper.normalizeNestedRichTextLists([{
  type: 'ol',
  children: [
    { type: 'li', indent: 8, children: [{ text: 'Root explicit' }] },
    { type: 'li', children: [{ text: 'Root plain' }] },
  ],
}]);
assert.equal(normalizedExplicitRootIndent[0].children[0].indent, 8);
assert.equal(normalizedExplicitRootIndent[0].children[1].indent, undefined);

const buildNestedList = (depth, maxDepth) => ({
  type: 'li',
  children: [
    { text: `Depth ${depth}` },
    ...(depth < maxDepth
      ? [{
          type: depth % 2 === 0 ? 'ol' : 'ul',
          children: [buildNestedList(depth + 1, maxDepth)],
        }]
      : []),
  ],
});
const deeplyNestedSlateList = [{
  type: 'ul',
  children: [buildNestedList(0, 10)],
}];
const normalizedDeeplyNestedSlateList = helper.normalizeNestedRichTextLists(deeplyNestedSlateList);
const normalizedDeepEntries = normalizedDeeplyNestedSlateList[0].children.map((item) => ({
  text: item.children.map((child) => child.text || '').join(''),
  indent: item.indent,
}));
assert.equal(normalizedDeepEntries.length, 11);
assert.deepEqual(normalizedDeepEntries.map((entry) => entry.text), Array.from({ length: 11 }, (_, index) => `Depth ${index}`));
assert.deepEqual(normalizedDeepEntries.map((entry) => entry.indent), [
  undefined,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  8,
  8,
]);

const objectBackedList = listUtils.buildListContentFromItems([
  { label: 'Parent object' },
  { text: 'Child object', indent: 2 },
  { text: 'Imported deep child', indent: '99' },
], 'number');
assert.equal(objectBackedList[0].type, 'ol');
assert.equal(objectBackedList[0].children[1].indent, 2);
assert.equal(objectBackedList[0].children[2].indent, 8);
assert.deepEqual(listUtils.extractListItemEntriesFromSlate(objectBackedList), [
  { text: 'Parent object' },
  { text: 'Child object', indent: 2 },
  { text: 'Imported deep child', indent: 8 },
]);

const extractedDeepListUtilsEntries = listUtils.extractListItemEntriesFromSlate([{
  type: 'ul',
  children: [
    { type: 'li', children: [{ text: 'Imported parent' }] },
    { type: 'li', indent: '42', children: [{ text: 'Imported child' }] },
  ],
}]);
assert.deepEqual(extractedDeepListUtilsEntries, [
  { text: 'Imported parent' },
  { text: 'Imported child', indent: 8 },
]);

const importedRawIndentList = [{
  type: 'ul',
  children: [
    { type: 'li', indent: '99', children: [{ text: 'Imported too deep' }] },
    { type: 'li', indent: -4, children: [{ text: 'Imported negative' }] },
    { type: 'li', indent: 'nope', children: [{ text: 'Imported invalid' }] },
  ],
}];
const changedImportedRawIndentType = helper.applyListTypeToNodes(importedRawIndentList, 'ol');
assert.equal(changedImportedRawIndentType.changed, true);
assert.equal(changedImportedRawIndentType.nodes[0].type, 'ol');
assert.equal(changedImportedRawIndentType.nodes[0].children[0].indent, 8);
assert.equal(changedImportedRawIndentType.nodes[0].children[1].indent, undefined);
assert.equal(changedImportedRawIndentType.nodes[0].children[2].indent, undefined);

const selectedImportedRawIndentType = helper.applyListTypeToSelectedListItemNodes(
  importedRawIndentList,
  'ol',
  'Imported too deep',
);
assert.equal(selectedImportedRawIndentType.changed, true);
assert.equal(selectedImportedRawIndentType.nodes[0].type, 'ol');
assert.equal(selectedImportedRawIndentType.nodes[0].children[0].indent, 8);
assert.equal(selectedImportedRawIndentType.nodes[1].children[0].indent, undefined);

const movedImportedRawIndent = helper.moveSelectedListItemNodes([{
  type: 'ul',
  children: [
    { type: 'li', children: [{ text: 'Stay lower' }] },
    { type: 'li', indent: '99', children: [{ text: 'Imported too deep' }] },
  ],
}], 'Imported too deep', -1);
assert.equal(movedImportedRawIndent.changed, true);
assert.equal(movedImportedRawIndent.nodes[0].children[0].children[0].text, 'Imported too deep');
assert.equal(movedImportedRawIndent.nodes[0].children[0].indent, 8);

assert.equal(helper.normalizeRichTextListIndent({ indent: '99' }), 8);
assert.equal(helper.normalizeRichTextListIndent({ indent: 'nope' }), undefined);

const outdentedImportedRawIndent = helper.applyListIndentToNodes([{
  type: 'ul',
  children: [
    { type: 'li', indent: '99', children: [{ text: 'Imported too deep' }] },
    { type: 'li', indent: 'nope', children: [{ text: 'Imported invalid' }] },
  ],
}], -1);
assert.equal(outdentedImportedRawIndent[0].children[0].indent, 7);
assert.equal(outdentedImportedRawIndent[0].children[1].indent, undefined);

const selectedOutdentedImportedRawIndent = helper.applyListIndentToSelectedListItemNodes([{
  type: 'ul',
  children: [
    { type: 'li', indent: '99', children: [{ text: 'Imported too deep' }] },
    { type: 'li', indent: 2, children: [{ text: 'Stay nested' }] },
  ],
}], 'Imported too deep', -1);
assert.equal(selectedOutdentedImportedRawIndent.changed, true);
assert.equal(selectedOutdentedImportedRawIndent.nodes[0].children[0].indent, 7);
assert.equal(selectedOutdentedImportedRawIndent.nodes[0].children[1].indent, 2);

console.log(JSON.stringify({
  ok: true,
  helper: path.relative(process.cwd(), helperPath),
  cases: 96,
}));
