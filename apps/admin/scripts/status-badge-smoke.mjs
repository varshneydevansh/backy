#!/usr/bin/env node

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const helperPath = path.resolve('src/components/ui/statusBadgeUtils.ts');
const source = fs.readFileSync(helperPath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: helperPath,
});
const helper = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

assert.equal(helper.normalizeStatus(null), 'unknown');
assert.equal(helper.normalizeStatus(undefined), 'unknown');
assert.equal(helper.normalizeStatus(''), 'unknown');
assert.equal(helper.normalizeStatus('   '), 'unknown');
assert.equal(helper.normalizeStatus('null'), 'unknown');
assert.equal(helper.normalizeStatus('undefined'), 'unknown');
assert.equal(helper.normalizeStatus('N/A'), 'unknown');
assert.equal(helper.normalizeStatus('needs review'), 'needs-review');
assert.equal(helper.normalizeStatus('needs_review'), 'needs-review');

assert.equal(helper.getStatusLabel(null), 'Unknown');
assert.equal(helper.getStatusLabel(''), 'Unknown');
assert.equal(helper.getStatusLabel('needs_review'), 'Needs Review');
assert.equal(helper.getStatusLabel('not-scanned'), 'Not Scanned');

assert.equal(helper.getStatusType(null), 'neutral');
assert.equal(helper.getStatusType('published'), 'success');
assert.equal(helper.getStatusType('public'), 'success');
assert.equal(helper.getStatusType('private'), 'neutral');
assert.equal(helper.getStatusType('not scanned'), 'warning');
assert.equal(helper.getStatusType('quarantined'), 'error');
assert.equal(helper.getStatusType('custom-review'), 'neutral');
assert.equal(helper.getStatusType('custom-review', 'info'), 'info');

console.log(JSON.stringify({
  ok: true,
  cases: 21,
  helper: path.relative(process.cwd(), helperPath),
}));
