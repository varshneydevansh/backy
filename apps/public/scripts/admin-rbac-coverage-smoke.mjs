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

const routeContractChecks = [
  {
    path: 'src/app/api/admin/settings/route.ts',
    label: 'workspace settings permission split',
    snippets: [
      "permission: 'settings.view'",
      "permission: mediaStoragePatch ? 'media.configure' : 'settings.configure'",
      "permission: 'settings.manageKeys'",
      "body.action === 'issue-admin-api-key'",
      "body.action === 'revoke-admin-api-key'",
      'settings.api_keys.issue',
      'settings.api_keys.revoke',
      'sanitizeServiceKeyGrant',
    ],
  },
  {
    path: 'src/app/api/admin/sites/[siteId]/settings/route.ts',
    label: 'site-scoped settings permission and audit contract',
    snippets: [
      'permission: "sites.view"',
      'permission: "sites.configure"',
      'NO_SITE_SETTINGS_CHANGES',
      'UNSUPPORTED_SITE_SETTINGS_KEYS',
      'site.settings.updated',
      'SITE_SETTINGS_SCOPE_SCHEMA',
    ],
  },
];

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
const contractFailures = [];

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

for (const contract of routeContractChecks) {
  const routeFile = path.join(appRoot, contract.path);
  if (!fs.existsSync(routeFile)) {
    contractFailures.push({
      path: contract.path,
      label: contract.label,
      missing: ['route file exists'],
    });
    continue;
  }

  const source = fs.readFileSync(routeFile, 'utf8');
  const missing = contract.snippets.filter((snippet) => !source.includes(snippet));
  if (missing.length > 0) {
    contractFailures.push({
      path: contract.path,
      label: contract.label,
      missing,
    });
  }
}

if (failures.length > 0) {
  console.error('Admin API mutating routes missing requireAdminAccess:');
  for (const failure of failures) {
    console.error(`- ${failure.path}: ${failure.methods.join(', ')}`);
  }
  process.exit(1);
}

if (contractFailures.length > 0) {
  console.error('Admin API route-specific RBAC contract checks failed:');
  for (const failure of contractFailures) {
    console.error(`- ${failure.path} (${failure.label})`);
    for (const missing of failure.missing) {
      console.error(`  missing: ${missing}`);
    }
  }
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedMutatingAdminRoutes: checked.length,
  checkedMutatingMethods: checked.reduce((total, route) => total + route.methods.length, 0),
  skippedAuthLifecycleRoutes: skippedAuth.length,
  skippedAuthLifecycleMethods: skippedAuth.reduce((total, route) => total + route.methods.length, 0),
  routeSpecificContracts: routeContractChecks.length,
}, null, 2));
