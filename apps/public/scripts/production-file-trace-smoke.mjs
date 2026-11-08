import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const config = require('../next.config.js');
const picomatch = require('next/dist/compiled/picomatch');
// Use the installed Next matcher, including its bare proxy/server entry names.
for (const entry of ['/api/admin/sites/owned-fixture/backup', 'middleware', 'next-server']) {
  const excludes = Object.entries(config.outputFileTracingExcludes || {})
    .filter(([key]) => picomatch(key, entry === 'next-server' ? {} : { dot: true, contains: true })(entry))
    .flatMap(([, patterns]) => patterns.map((pattern) => resolve(projectRoot, pattern)));
  const matches = picomatch(excludes, { dot: true, contains: true });
  for (const path of ['data/backy/admin-content.json', '.backy-private/form-attachments/owned', 'public/uploads/sites/owned/font.woff2']) {
    assert(matches(resolve(projectRoot, path)), 'Mutable runtime files must be excluded for every route/proxy/server entry.');
  }
  for (const path of ['public/backy-logo.svg', 'node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2']) {
    assert(!matches(resolve(projectRoot, path)), 'Legitimate static assets and bundled font dependencies must remain eligible.');
  }
}
const dist = process.argv[2] || process.env.BACKY_NEXT_DIST_DIR || '.next';
const buildRoot = isAbsolute(dist) ? dist : resolve(projectRoot, dist);
assert(existsSync(resolve(buildRoot, 'BUILD_ID')), 'Build Next.js first: a completed production BUILD_ID is required.');
const manifests = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'dev' && directory === buildRoot) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name.endsWith('.nft.json')) manifests.push(path);
  }
};
visit(buildRoot);
assert(manifests.length > 0, 'A production build must emit nonempty file trace manifests.');
const files = new Set();
const directories = new Set();
for (const manifest of manifests) {
  const trace = JSON.parse(readFileSync(manifest, 'utf8'));
  assert(Array.isArray(trace.files) && trace.files.length > 0, 'Empty or malformed file trace manifest.');
  for (const file of trace.files) {
    assert.equal(typeof file, 'string');
    const path = resolve(dirname(manifest), file);
    assert(existsSync(path), 'A traced runtime input must actually exist.');
    const stat = statSync(path);
    if (stat.isFile()) files.add(path);
    else {
      // Next.js may retain a package directory entry alongside its files (sharp).
      assert(stat.isDirectory() && path.split(sep).includes('node_modules'), 'Unexpected traced runtime directory.');
      directories.add(path);
    }
  }
}
const counts = { compiled: 0, dependencies: 0, mutable: 0, source: 0, scripts: 0, other: 0 };
let bytes = 0;
for (const path of files) {
  const fromProject = relative(projectRoot, path).split(sep).join('/');
  const fromBuild = relative(buildRoot, path);
  const category = fromProject.startsWith('data/') || fromProject.startsWith('.backy-private/') || fromProject.startsWith('public/uploads/')
    ? 'mutable'
    : fromProject.startsWith('src/') ? 'source'
    : fromProject.startsWith('scripts/') ? 'scripts'
    : path.split(sep).includes('node_modules') ? 'dependencies'
    : !fromBuild.startsWith(`..${sep}`) && fromBuild !== '..' && !isAbsolute(fromBuild) ? 'compiled'
    : 'other';
  counts[category]++;
  bytes += statSync(path).size;
}
assert(counts.compiled > 0 && counts.dependencies > 0, 'Trace must retain compiled server files and runtime dependencies.');
assert.equal(counts.mutable, 0, 'Private mutable snapshots/journals and runtime-managed uploads must not be copied into release functions.');
assert.equal(counts.source, 0, 'Uncompiled application source must not be copied through dynamic filesystem tracing.');
assert.equal(counts.scripts, 0, 'Development/test scripts must not be copied through dynamic filesystem tracing.');
console.log(JSON.stringify({ boundary: 'Actual completed local production traces; no deployment or provider claim', manifests: manifests.length, uniqueFiles: files.size, dependencyDirectories: directories.size, bytes, counts }));
