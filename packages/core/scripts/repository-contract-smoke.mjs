#!/usr/bin/env node

const core = await import('../dist/index.mjs');
const repositories = await import('../dist/repositories.mjs');

const requiredExports = [
  'BACKY_CONTENT_SCHEMA_VERSION',
];

for (const exportName of requiredExports) {
  if (!(exportName in core)) {
    throw new Error(`Missing core export ${exportName}`);
  }
}

if (Object.keys(repositories).length !== 0) {
  throw new Error('Repository contract module should emit type declarations only at runtime.');
}

console.log('Backy repository contract smoke passed');
