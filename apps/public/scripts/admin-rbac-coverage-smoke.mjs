#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const adminApiRoot = path.join(appRoot, 'src', 'app', 'api', 'admin');
const exportedMethodPattern = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
const mutatingMethodPattern = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/g;
const adminAccessPattern = /\brequireAdminAccess\s*\(/;
const adminPermissionPattern = /\bpermission\s*:/;

const authLifecycleRoutePattern = /[/\\]auth[/\\]/;
const allowedRoleOnlyAccessChecks = [
  {
    path: 'src/app/api/admin/users/[userId]/permissions/route.ts',
    callSnippet: "roles: ['owner', 'admin', 'editor', 'viewer']",
    reason: 'Current-session users can read their own permission matrix before the route performs users.view for other users.',
  },
];

const dynamicPermissionAccessChecks = [
  {
    path: 'src/app/api/admin/sites/[siteId]/commerce/reconcile/route.ts',
    callSnippet: 'requireAdminAccess(request, requestId, accessRequirement)',
    sourceSnippets: [
      "accessRequirement: { permission: 'commerce.configure' } = { permission: 'commerce.configure' }",
    ],
    reason: 'Shared reconcile handler receives a typed commerce.configure requirement with a secure default.',
  },
];

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
const checkedAdminRoutes = [];
const checked = [];
const skippedAuth = [];
const readFailures = [];
const failures = [];
const permissionFailures = [];
const allowedRoleOnlyAccess = [];
const dynamicPermissionAccess = [];
const contractFailures = [];

const lineNumberForIndex = (source, index) => source.slice(0, index).split(/\r?\n/).length;

const extractRequireAdminAccessCalls = (source) => {
  const calls = [];
  const callPattern = /\brequireAdminAccess\s*\(/g;
  let match;
  while ((match = callPattern.exec(source)) !== null) {
    const functionIndex = match.index;
    const openIndex = source.indexOf('(', functionIndex);
    if (openIndex < 0) {
      break;
    }

    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = openIndex; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }

      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        continue;
      }

      if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push({
            index: functionIndex,
            line: lineNumberForIndex(source, functionIndex),
            text: source.slice(functionIndex, index + 1),
          });
          callPattern.lastIndex = index + 1;
          break;
        }
      }
    }
  }

  return calls;
};

const allowedRoleOnlyCheck = (relativePath, callText) => (
  allowedRoleOnlyAccessChecks.find((check) => (
    check.path === relativePath && callText.includes(check.callSnippet)
  )) || null
);

const dynamicPermissionCheck = (relativePath, source, callText) => (
  dynamicPermissionAccessChecks.find((check) => (
    check.path === relativePath
    && callText.includes(check.callSnippet)
    && check.sourceSnippets.every((snippet) => source.includes(snippet))
  )) || null
);

for (const routeFile of routeFiles) {
  const source = fs.readFileSync(routeFile, 'utf8');
  const exportedMethods = [...source.matchAll(exportedMethodPattern)].map((match) => match[1]);
  const mutatingMethods = [...source.matchAll(mutatingMethodPattern)].map((match) => match[1]);
  if (exportedMethods.length === 0) {
    continue;
  }

  const relativePath = path.relative(appRoot, routeFile);
  if (authLifecycleRoutePattern.test(routeFile)) {
    skippedAuth.push({ path: relativePath, methods: exportedMethods });
    continue;
  }

  checkedAdminRoutes.push({ path: relativePath, methods: exportedMethods });
  const hasAdminAccess = adminAccessPattern.test(source);
  if (!hasAdminAccess) {
    readFailures.push({ path: relativePath, methods: exportedMethods });
  }

  if (mutatingMethods.length > 0) {
    checked.push({ path: relativePath, methods: mutatingMethods });
  }
  if (mutatingMethods.length > 0 && !hasAdminAccess) {
    failures.push({ path: relativePath, methods: mutatingMethods });
  }

  const calls = extractRequireAdminAccessCalls(source);
  const unscopedCalls = [];
  for (const call of calls) {
    if (adminPermissionPattern.test(call.text)) {
      continue;
    }

    const roleOnlyAccess = allowedRoleOnlyCheck(relativePath, call.text);
    if (roleOnlyAccess) {
      allowedRoleOnlyAccess.push({
        path: relativePath,
        line: call.line,
        reason: roleOnlyAccess.reason,
      });
      continue;
    }

    const dynamicAccess = dynamicPermissionCheck(relativePath, source, call.text);
    if (dynamicAccess) {
      dynamicPermissionAccess.push({
        path: relativePath,
        line: call.line,
        reason: dynamicAccess.reason,
      });
      continue;
    }

    unscopedCalls.push({
      line: call.line,
      call: call.text.replace(/\s+/g, ' ').slice(0, 220),
    });
  }

  if (unscopedCalls.length > 0) {
    permissionFailures.push({
      path: relativePath,
      calls: unscopedCalls,
    });
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

if (readFailures.length > 0) {
  console.error('Admin API routes missing requireAdminAccess:');
  for (const failure of readFailures) {
    console.error(`- ${failure.path}: ${failure.methods.join(', ')}`);
  }
  process.exit(1);
}

if (failures.length > 0) {
  console.error('Admin API mutating routes missing requireAdminAccess:');
  for (const failure of failures) {
    console.error(`- ${failure.path}: ${failure.methods.join(', ')}`);
  }
  process.exit(1);
}

if (permissionFailures.length > 0) {
  console.error('Admin API routes with requireAdminAccess calls missing explicit permission scope:');
  for (const failure of permissionFailures) {
    console.error(`- ${failure.path}`);
    for (const call of failure.calls) {
      console.error(`  line ${call.line}: ${call.call}`);
    }
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
  checkedAdminRoutes: checkedAdminRoutes.length,
  checkedAdminMethods: checkedAdminRoutes.reduce((total, route) => total + route.methods.length, 0),
  checkedMutatingAdminRoutes: checked.length,
  checkedMutatingMethods: checked.reduce((total, route) => total + route.methods.length, 0),
  permissionScopedAdminAccessCalls: checkedAdminRoutes.reduce((total, route) => {
    const routeFile = path.join(appRoot, route.path);
    return total + extractRequireAdminAccessCalls(fs.readFileSync(routeFile, 'utf8'))
      .filter((call) => adminPermissionPattern.test(call.text)).length;
  }, 0),
  allowedRoleOnlyAdminAccessCalls: allowedRoleOnlyAccess.length,
  dynamicPermissionAdminAccessCalls: dynamicPermissionAccess.length,
  skippedAuthLifecycleRoutes: skippedAuth.length,
  skippedAuthLifecycleMethods: skippedAuth.reduce((total, route) => total + route.methods.length, 0),
  routeSpecificContracts: routeContractChecks.length,
}, null, 2));
