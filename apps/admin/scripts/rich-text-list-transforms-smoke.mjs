#!/usr/bin/env node

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const helperPath = path.resolve('src/components/editor/richTextListTransforms.ts');
const source = fs.readFileSync(helperPath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: helperPath,
});
const helper = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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

const outdented = helper.applyListIndentToNodes(existingOrdered, -2);
assert.equal(outdented[0].children[0].indent, undefined);
assert.equal(outdented[0].children[1].indent, undefined);

const indented = helper.applyListIndentToNodes(existingOrdered, 1);
assert.equal(indented[0].children[0].indent, 2);
assert.equal(indented[0].children[1].indent, 1);

console.log(JSON.stringify({
  ok: true,
  helper: path.relative(process.cwd(), helperPath),
  cases: 14,
}));
