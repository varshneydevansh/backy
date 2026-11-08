import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeHfs } from '@humanfs/node';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const uri = require('fast-uri');

// GHSA-2883-xcg3-v3hh: empty mappings must consume the merge budget.
assert.deepEqual(yaml.load('site: demo\nflags: [true, false]\n'), {
  site: 'demo', flags: [true, false],
});
const emptyMerges = 'arr: &arr [' + Array(40).fill('{}').join(',') + ']\ntarget:\n  - <<: *arr\n';
assert.throws(() => yaml.load(emptyMerges, { maxTotalMergeKeys: 10 }), /merge/i);

// GHSA-hrr3-gc8f-f4qj: DNS-equivalent host spellings must agree.
assert.equal(uri.parse('//%41.com').host, 'a.com');
assert.equal(uri.normalize('//%41.com'), uri.normalize('//a.com'));
assert.equal(uri.equal('//%41.com', '//a.com'), true);
assert.equal(uri.equal('//A.com', '//a.com'), true);
assert.equal(uri.equal('//b.com', '//a.com'), false);
// GHSA-p498-v437-472g: copy links as links rather than materializing outside bytes.
const scratch = await mkdtemp(join(tmpdir(), 'backy-dependency-copy-'));
try {
  const source = join(scratch, 'source'), destination = join(scratch, 'destination');
  const outside = join(scratch, 'outside.txt');
  await mkdir(source);
  await writeFile(outside, 'Synthetic outside-tree sentinel');
  await writeFile(join(source, 'normal.txt'), 'Ordinary authored bytes');
  await symlink(outside, join(source, 'link.txt'));
  const hfs = new NodeHfs();
  await hfs.copyAll(source, destination);
  assert.equal(await readFile(join(destination, 'normal.txt'), 'utf8'), 'Ordinary authored bytes');
  assert.equal((await lstat(join(destination, 'link.txt'))).isSymbolicLink(), true);
  assert.equal(await readlink(join(destination, 'link.txt')), outside);
  await hfs.copy(join(source, 'link.txt'), join(scratch, 'single-link.txt'));
  assert.equal((await lstat(join(scratch, 'single-link.txt'))).isSymbolicLink(), true);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
// GHSA-68fv-2mgg-jv7q: indexed offsets cannot consume an unbounded line loop.
const { SourceMapConsumer, SourceMapGenerator, SourceNode } = require('source-map-js');
const sourceMapFixture = { version: 3, sources: ['input.js'], names: [], mappings: 'AAAA' };
assert.throws(() => new SourceMapConsumer({ version: 3, sections: [{ offset: { line: 1e12, column: 0 }, map: sourceMapFixture }] }), /Section offset/);
const sourceMapGenerator = new SourceMapGenerator({ file: 'output.js' });
sourceMapGenerator.addMapping({ generated: { line: 1, column: 0 }, source: 'input.js', original: { line: 1, column: 0 } });
const sourceMapConsumer = new SourceMapConsumer(sourceMapGenerator.toJSON());
assert.equal(sourceMapConsumer.originalPositionFor({ line: 1, column: 0 }).source, 'input.js');
assert.equal(SourceNode.fromStringWithSourceMap('const answer=42;', sourceMapConsumer).toString(), 'const answer=42;');
console.log('Dependency patch regressions PASS: YAML merge budget, URI host canonicalization, bounded source-map offsets/ordinary roundtrip and ordinary/symlink copy behavior. Links remain links; this is not a symlink-free archive guarantee or complete security certification.');
