#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAiRenderPayload } from './validate-ai-render-payload.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(scriptDir, '../../../specs/ai-frontend-contract/examples');

const exampleFiles = [
  'page.json',
  'blog-post.json',
  'dynamic-item-page.json',
  'form-page.json',
];

for (const filename of exampleFiles) {
  const payload = JSON.parse(readFileSync(resolve(examplesDir, filename), 'utf8'));
  validateAiRenderPayload(payload, filename);
}

console.log(`AI frontend contract examples validated: ${exampleFiles.join(', ')}`);
