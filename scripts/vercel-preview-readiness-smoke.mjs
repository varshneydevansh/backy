#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const failures = [];
const warnings = [];
const checks = [];

const strictCli = process.env.BACKY_VERCEL_REQUIRE_CLI === '1';
const strictLinks = process.env.BACKY_VERCEL_REQUIRE_PROJECT_LINKS === '1';
const strictRemoteProjects = process.env.BACKY_VERCEL_REQUIRE_REMOTE_PROJECTS === '1';
const skipCli = process.env.BACKY_VERCEL_SKIP_CLI === '1';

const rel = (file) => path.join(repoRoot, file);
const read = (file) => fs.readFileSync(rel(file), 'utf8');
const readJson = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(rel(file));

const pass = (message) => checks.push(message);
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const assert = (condition, message) => {
  if (condition) pass(message);
  else fail(message);
};

const includesAll = (text, snippets, label) => {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  assert(missing.length === 0, `${label}${missing.length ? ` missing: ${missing.join(', ')}` : ''}`);
};

const hasCron = (config) => (
  Array.isArray(config.crons) &&
  config.crons.some((entry) => (
    entry?.path === '/api/admin/commerce/reconcile?limit=100' &&
    entry?.schedule === '0 3 * * *'
  ))
);

const rootPackage = readJson('package.json');
const rootVercel = readJson('vercel.json');
const publicVercel = readJson('apps/public/vercel.json');
const adminVercel = readJson('apps/admin/vercel.json');
const readme = read('README.md');
const agents = read('AGENTS.md');
const gitignore = read('.gitignore');
const handoff = read('packages/core/src/custom-frontend-agent-handoff.ts');
const manifestSchema = read('specs/ai-frontend-contract/frontend-manifest.schema.json');
const openApiRoute = read('apps/public/src/app/api/sites/[siteId]/openapi/route.ts');

assert(hasCron(rootVercel), 'Root vercel.json keeps the commerce reconciliation cron');
assert(hasCron(publicVercel), 'apps/public/vercel.json keeps the commerce reconciliation cron');
assert(
  Array.isArray(adminVercel.rewrites) &&
    adminVercel.rewrites.some((rewrite) => rewrite.destination === '/index.html'),
  'apps/admin/vercel.json keeps SPA route rewrites',
);
assert(
  JSON.stringify(adminVercel).includes('X-Content-Type-Options') &&
    JSON.stringify(adminVercel).includes('strict-origin-when-cross-origin'),
  'apps/admin/vercel.json keeps baseline security headers',
);

includesAll(
  rootPackage.scripts?.['test:partial-gate-preflights'] || '',
  ['npm run test:vercel-release-config', 'npm run test:vercel-preview-readiness'],
  'Root Partial gate aggregate includes Vercel readiness checks',
);
assert(
  rootPackage.scripts?.['test:vercel-preview-readiness'] === 'node scripts/vercel-preview-readiness-smoke.mjs',
  'Root package exposes test:vercel-preview-readiness',
);
assert(gitignore.includes('.vercel/'), 'Git ignore keeps local Vercel project links out of commits');

includesAll(
  readme,
  [
    '## Vercel release runbook',
    'backy-public',
    'Root Directory: `apps/public`',
    'backy-admin',
    'Root Directory: `apps/admin`',
    'VITE_BACKY_PUBLIC_API_BASE_URL',
    'VITE_BACKY_ADMIN_API_BASE_URL',
    'BACKY_DATA_MODE=database',
    'BACKY_DATABASE_URL',
    'BACKY_ADMIN_API_KEY',
    'BACKY_ADMIN_SECRET_KEY',
    'CRON_SECRET',
    'NEXT_PUBLIC_BACKY_ADMIN_APP_URL',
    'BACKY_CORS_ALLOWED_ORIGINS',
    'BACKY_PUBLIC_API_BASE_URL',
    'BACKY_SITE_ID',
    'BACKY_SITE_PUBLIC_HOST',
    'Vercel Deployment Protection',
    'Vercel Agent',
    'Project Settings -> AI',
    'npm run test:vercel-preview-readiness',
  ],
  'README Vercel runbook',
);

const vercelRunbookStart = readme.indexOf('## Vercel release runbook');
const vercelRunbookEnd = readme.indexOf('---', vercelRunbookStart);
const vercelRunbook = readme.slice(
  vercelRunbookStart,
  vercelRunbookEnd === -1 ? undefined : vercelRunbookEnd,
);
assert(
  vercelRunbookStart !== -1 && !vercelRunbook.includes('VITE_BACKY_ADMIN_API_KEY'),
  'README Vercel runbook does not expose legacy VITE_BACKY_ADMIN_API_KEY',
);

includesAll(
  agents,
  [
    'deploymentTopology',
    'backy-admin',
    'backy-public',
    'VITE_BACKY_PUBLIC_API_BASE_URL',
    'VITE_BACKY_ADMIN_API_BASE_URL',
    'BACKY_PUBLIC_API_BASE_URL',
    'BACKY_SITE_ID',
    'npm run test:vercel-preview-readiness',
  ],
  'AGENTS deployment topology guidance',
);

includesAll(
  handoff,
  [
    "CUSTOM_FRONTEND_DEPLOYMENT_TOPOLOGY_SCHEMA = 'backy.deployment-topology.v1'",
    "project: 'backy-admin'",
    "rootDirectory: 'apps/admin'",
    "'VITE_BACKY_PUBLIC_API_BASE_URL'",
    "'VITE_BACKY_ADMIN_API_BASE_URL'",
    "'BACKY_DATABASE_URL'",
    "'DATABASE_URL'",
    "'CRON_SECRET'",
    "'BACKY_ADMIN_API_KEY'",
    "project: 'backy-public'",
    "rootDirectory: 'apps/public'",
    "'BACKY_DATA_MODE=database'",
    "'BACKY_ADMIN_SECRET_KEY'",
    "'NEXT_PUBLIC_BACKY_ADMIN_APP_URL'",
    "'BACKY_CORS_ALLOWED_ORIGINS'",
    "'BACKY_PUBLIC_API_BASE_URL'",
    "'BACKY_SITE_ID'",
    "'BACKY_SITE_PUBLIC_HOST'",
    "previewReadinessSmoke: 'npm run test:vercel-preview-readiness'",
  ],
  'Custom frontend deployment topology source',
);

includesAll(
  manifestSchema,
  [
    '"deploymentTopology"',
    '"backy.deployment-topology.v1"',
    '"releaseConfigSmoke": { "const": "npm run test:vercel-release-config" }',
    '"previewReadinessSmoke": { "const": "npm run test:vercel-preview-readiness" }',
  ],
  'Frontend manifest deployment topology schema',
);

includesAll(
  openApiRoute,
  [
    'CustomFrontendDeploymentTopology',
    'releaseConfigSmoke: {',
    'const: "npm run test:vercel-release-config"',
    'previewReadinessSmoke: {',
    'const: "npm run test:vercel-preview-readiness"',
  ],
  'OpenAPI deployment topology schema',
);

const projectLinks = [
  { app: 'backy-public', root: 'apps/public', file: 'apps/public/.vercel/project.json' },
  { app: 'backy-admin', root: 'apps/admin', file: 'apps/admin/.vercel/project.json' },
];

for (const link of projectLinks) {
  if (!exists(link.file)) {
    const message = `${link.file} is missing; run \`cd ${link.root} && vercel link --project ${link.app}\` before preview deploy.`;
    if (strictLinks) fail(message);
    else warn(message);
    continue;
  }

  const projectJson = readJson(link.file);
  const hasProjectId = typeof projectJson.projectId === 'string' && projectJson.projectId.length > 0;
  const hasOrgId = typeof projectJson.orgId === 'string' && projectJson.orgId.length > 0;
  if (hasProjectId && hasOrgId) pass(`${link.file} contains projectId and orgId`);
  else if (strictLinks) fail(`${link.file} must contain projectId and orgId`);
  else warn(`${link.file} exists but is missing projectId or orgId.`);
}

if (exists('.vercel/project.json')) {
  warn('Root .vercel/project.json exists, but Backy deploys from apps/public and apps/admin project roots. Root linkage is not sufficient.');
}

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: options.timeout || 15000,
  env: { ...process.env, FORCE_COLOR: '0' },
});

if (skipCli) {
  warn('Skipped Vercel CLI checks because BACKY_VERCEL_SKIP_CLI=1.');
} else {
  const version = run('vercel', ['--version'], { timeout: 10000 });
  if (version.status !== 0) {
    const message = `Vercel CLI is not available or not executable: ${(version.stderr || version.stdout || '').trim()}`;
    if (strictCli) fail(message);
    else warn(message);
  } else {
    pass(`Vercel CLI available (${(version.stdout || '').trim().split('\n').pop()})`);

    const whoami = run('vercel', ['whoami'], { timeout: 10000 });
    if (whoami.status !== 0) {
      const message = `Vercel CLI is not authenticated: ${(whoami.stderr || whoami.stdout || '').trim()}`;
      if (strictCli) fail(message);
      else warn(message);
    } else {
      pass(`Vercel CLI authenticated as ${(whoami.stdout || '').trim().split('\n').pop()}`);
    }

    const projects = run('vercel', ['project', 'ls'], { timeout: 20000 });
    if (projects.status !== 0) {
      const message = `Could not list Vercel projects: ${(projects.stderr || projects.stdout || '').trim()}`;
      if (strictRemoteProjects) fail(message);
      else warn(message);
    } else {
      const output = `${projects.stdout}\n${projects.stderr}`;
      for (const expectedProject of ['backy-public', 'backy-admin']) {
        if (output.includes(expectedProject)) pass(`Remote Vercel project exists: ${expectedProject}`);
        else if (strictRemoteProjects) fail(`Remote Vercel project is missing: ${expectedProject}`);
        else warn(`Remote Vercel project not found yet: ${expectedProject}. Create/link it before preview deploy.`);
      }
    }
  }
}

console.log(`Backy Vercel preview readiness source checks passed: ${checks.length}`);

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('\nFailures:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  warnings.length > 0
    ? '\nBacky is source-ready for Vercel preview, but operator/project linkage warnings remain.'
    : '\nBacky Vercel preview readiness smoke passed without warnings.',
);
