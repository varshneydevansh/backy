#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

const failures = [];
const checks = [];

const pass = (message) => checks.push(message);
const fail = (message) => failures.push(message);

const run = (command, args) => spawnSync(command, args, {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 15000,
});

const gitLsFiles = run('git', ['ls-files', '-z']);
if (gitLsFiles.status !== 0) {
  throw new Error(`Could not list tracked files: ${(gitLsFiles.stderr || gitLsFiles.stdout || '').trim()}`);
}

const trackedFiles = gitLsFiles.stdout.split('\0').filter(Boolean);

const optionalPrivateMarkers = [
  ...(process.env.BACKY_REPO_HYGIENE_PRIVATE_MARKERS || '')
    .split(',')
    .map((marker) => marker.trim())
    .filter(Boolean),
];

const localMarkerFile = path.join(repoRoot, '.backy-public-hygiene.local.json');
if (fs.existsSync(localMarkerFile)) {
  const payload = JSON.parse(fs.readFileSync(localMarkerFile, 'utf8'));
  if (Array.isArray(payload?.markers)) {
    optionalPrivateMarkers.push(...payload.markers.map((marker) => String(marker).trim()).filter(Boolean));
  }
}

const literalRegex = (value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

const forbiddenPatterns = [
  {
    label: 'local absolute user path',
    regex: /(?:^|[\s"'`(])\/Users\/[A-Za-z0-9._-]+\//u,
  },
  {
    label: 'consumer email address',
    regex: /[A-Za-z0-9._%+-]+@(gmail|outlook|icloud|yahoo|hotmail)\.[A-Za-z]{2,}/iu,
  },
  {
    label: 'actual Vercel deployment URL',
    regex: /\bbacky-(public|admin)-[a-z0-9]{6,}-[a-z0-9-]+\.vercel\.app\b/iu,
  },
  {
    label: 'actual Vercel deployment id',
    regex: /\bdpl_[A-Za-z0-9]{12,}\b/u,
  },
  {
    label: 'actual Vercel project id',
    regex: /\bprj_(?!x{8,}\b)[A-Za-z0-9]{12,}\b/u,
  },
  {
    label: 'actual Vercel team id',
    regex: /\bteam_(?!x{8,}\b)[A-Za-z0-9]{12,}\b/u,
  },
  {
    label: 'hard-coded personal GitHub Backy URL',
    regex: /github\.com\/(?!backy-cms\/)[A-Za-z0-9-]+\/backy\b/iu,
  },
  ...optionalPrivateMarkers.map((marker) => ({
    label: 'private local marker',
    regex: literalRegex(marker),
  })),
];

for (const file of trackedFiles) {
  const absolutePath = path.join(repoRoot, file);
  if (!fs.existsSync(absolutePath)) continue;
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.includes(0)) continue;

  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/u);

  for (const [lineIndex, line] of lines.entries()) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(line)) {
        fail(`${file}:${lineIndex + 1} contains ${pattern.label}`);
      }
    }
  }
}

if (optionalPrivateMarkers.length > 0) {
  pass('Optional private marker scan completed');
}
pass(`Scanned ${trackedFiles.length} tracked files for public-repo hygiene`);

if (failures.length > 0) {
  console.error('Backy public repo hygiene failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Backy public repo hygiene passed: ${checks.length}`);
