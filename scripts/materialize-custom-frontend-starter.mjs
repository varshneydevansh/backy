#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const usage = () => {
  console.error([
    'Usage:',
    '  npm run custom-frontend:materialize -- --manifest <starter-export.json> --out <target-dir> [--force]',
    '',
    'Creates a separate custom frontend project from a Backy starter export.',
    'The target directory must be empty unless --force is supplied.',
  ].join('\n'));
};

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const hasFlag = (name) => args.includes(name);

const manifestPath = option('--manifest');
const outPath = option('--out');
const force = hasFlag('--force');

if (!manifestPath || !outPath || hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(manifestPath && outPath ? 0 : 1);
}

const readJson = (filePath) => {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw);
};

const isSafeRelativePath = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (/^[a-zA-Z]:[\\/]/u.test(value)) return false;
  const normalized = path.posix.normalize(value.replace(/\\/gu, '/'));
  return normalized !== '.' && !normalized.startsWith('../') && normalized !== '..';
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manifest = readJson(manifestPath);
const data = manifest?.data || manifest;
const files = Array.isArray(data?.files) ? data.files : [];
const targetRoot = path.resolve(process.cwd(), outPath);

assert(
  data?.schemaVersion === 'backy.custom-frontend-starter-export.v1',
  'Manifest must use schemaVersion=backy.custom-frontend-starter-export.v1.',
);
assert(
  data?.starterProject?.schemaVersion === 'backy.custom-frontend-starter-project.v1',
  'Manifest must include starterProject.schemaVersion=backy.custom-frontend-starter-project.v1.',
);
assert(
  data?.starterProject?.exportFormat === 'file-list',
  'Manifest must include starterProject.exportFormat=file-list.',
);
assert(files.length > 0, 'Manifest files[] is empty.');

if (fs.existsSync(targetRoot)) {
  const existing = fs.readdirSync(targetRoot);
  assert(
    force || existing.length === 0,
    `Target directory is not empty: ${path.relative(repoRoot, targetRoot) || targetRoot}. Use --force only when intentional.`,
  );
} else {
  fs.mkdirSync(targetRoot, { recursive: true });
}

const written = [];
for (const file of files) {
  assert(isSafeRelativePath(file.path), `Unsafe starter file path: ${String(file.path)}`);
  assert(typeof file.content === 'string', `Starter file ${file.path} is missing string content.`);

  const relativePath = path.posix.normalize(file.path.replace(/\\/gu, '/'));
  const absolutePath = path.resolve(targetRoot, relativePath);
  assert(
    absolutePath === targetRoot || absolutePath.startsWith(targetRoot + path.sep),
    `Starter file escapes target directory: ${file.path}`,
  );

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, file.content);
  written.push(relativePath);
}

const summary = {
  schemaVersion: data.schemaVersion,
  starterProjectSchema: data.starterProject.schemaVersion,
  siteId: data.site?.id || '',
  publicHost: data.site?.primaryPublicHost || '',
  targetDir: targetRoot,
  fileCount: written.length,
  pathSafety: 'rejects-absolute-parent-and-drive-paths',
  targetDirectoryPolicy: force ? 'force-enabled' : 'empty-directory-required',
  installCommand: data.starterProject.installCommand || data.project?.installCommand || 'npm install',
  buildCommand: data.starterProject.buildCommand || data.project?.buildCommand || 'npm run build',
  devCommand: data.starterProject.devCommand || data.project?.devCommand || 'npm run dev',
};

console.log(JSON.stringify(summary, null, 2));
