#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const adminApiRoot = path.join(appRoot, 'src', 'app', 'api', 'admin');
const mutatingMethodPattern = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/g;
const adminAccessPattern = /\brequireAdminAccess\s*\(/;

const authLifecycleRoutePattern = /[/\\]auth[/\\]/;

const walkRouteFiles = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRouteFiles(resolved));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(resolved);
    }
  }
  return files;
};

const routeFiles = walkRouteFiles(adminApiRoot);
const checked = [];
const skippedAuth = [];
const failures = [];

for (const routeFile of routeFiles) {
  const source = fs.readFileSync(routeFile, 'utf8');
  const mutatingMethods = [...source.matchAll(mutatingMethodPattern)].map((match) => match[1]);
  if (mutatingMethods.length === 0) {
    continue;
  }

  const relativePath = path.relative(appRoot, routeFile);
  if (authLifecycleRoutePattern.test(routeFile)) {
    skippedAuth.push({ path: relativePath, methods: mutatingMethods });
    continue;
  }

  checked.push({ path: relativePath, methods: mutatingMethods });
  if (!adminAccessPattern.test(source)) {
    failures.push({ path: relativePath, methods: mutatingMethods });
  }
}

if (failures.length > 0) {
  console.error('Admin API mutating routes missing requireAdminAccess:');
  for (const failure of failures) {
    console.error(`- ${failure.path}: ${failure.methods.join(', ')}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedMutatingAdminRoutes: checked.length,
  checkedMutatingMethods: checked.reduce((total, route) => total + route.methods.length, 0),
  skippedAuthLifecycleRoutes: skippedAuth.length,
  skippedAuthLifecycleMethods: skippedAuth.reduce((total, route) => total + route.methods.length, 0),
}, null, 2));
