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
const strictRemoteEnv = process.env.BACKY_VERCEL_REQUIRE_REMOTE_ENV === '1';
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

const parseSemver = (value) => {
  const match = String(value || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map((part) => Number(part)) : null;
};

const semverAtLeast = (actual, minimum) => {
  const actualParts = parseSemver(actual);
  const minimumParts = parseSemver(minimum);
  if (!actualParts || !minimumParts) return false;

  for (let index = 0; index < minimumParts.length; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const outputContainsEnvName = (output, name) => (
  new RegExp(`(^|[^A-Z0-9_])${escapeRegExp(name)}([^A-Z0-9_]|$)`, 'u').test(output)
);

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
const rootVercelIgnore = read('.vercelignore');
const publicVercelIgnore = read('apps/public/.vercelignore');
const adminVercelIgnore = read('apps/admin/.vercelignore');
const envExample = read('.env.example');
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
  [
    'npm run test:vercel-release-config',
    'npm run test:vercel-preview-readiness',
    'npm run test:vercel-public-production-env-guard',
    'npm run test:vercel-production-readiness',
    'npm run test:repo-public-hygiene',
  ],
  'Root Partial gate aggregate includes Vercel readiness checks',
);
assert(
  rootPackage.scripts?.['test:vercel-preview-readiness'] === 'node scripts/vercel-preview-readiness-smoke.mjs',
  'Root package exposes test:vercel-preview-readiness',
);
assert(
  rootPackage.scripts?.['test:vercel-production-readiness'] === 'node scripts/vercel-production-readiness-smoke.mjs',
  'Root package exposes test:vercel-production-readiness',
);
assert(
  rootPackage.scripts?.['test:repo-public-hygiene'] === 'node scripts/repo-public-hygiene-smoke.mjs',
  'Root package exposes test:repo-public-hygiene',
);
assert(
  rootPackage.scripts?.['test:vercel-public-production-env-guard'] ===
    'node scripts/vercel-public-production-env-guard-smoke.mjs',
  'Root package exposes test:vercel-public-production-env-guard',
);
assert(
  rootPackage.scripts?.['build:vercel:public'] ===
    'node scripts/vercel-public-production-env-guard.mjs && npm run build --workspace @backy-cms/core && npm run build --workspace @backy/db && npm run build --workspace @backy/storage && npm run build --workspace @backy/public',
  'Root package exposes a Vercel public build that guards production env and compiles workspace packages before Next',
);
assert(
  rootPackage.scripts?.['build:vercel:admin'] ===
    'npm run build --workspace @backy-cms/core && npm run build --workspace @backy/db && npm run build --workspace @backy-cms/admin',
  'Root package exposes a Vercel admin build that compiles workspace packages before Vite',
);
assert(gitignore.includes('.vercel/'), 'Git ignore keeps local Vercel project links out of commits');
includesAll(
  rootVercelIgnore,
  [
    '.vercel/',
    'node_modules/',
    'apps/*/node_modules/',
    'apps/admin/dist/',
    'apps/public/.next/',
    'apps/public/.next-sdk-smoke/',
    'packages/*/dist/',
  ],
  'Root .vercelignore keeps local monorepo build/cache artifacts out of root source uploads',
);
includesAll(
  publicVercelIgnore,
  ['.next/', '.next-sdk-smoke/', '.turbo/', '.vercel/', 'node_modules/', 'tsconfig.tsbuildinfo'],
  'apps/public/.vercelignore keeps local Next/Vercel/cache artifacts out of CLI source uploads',
);
includesAll(
  adminVercelIgnore,
  ['dist/', '.turbo/', '.vercel/', 'node_modules/', 'tsconfig.tsbuildinfo'],
  'apps/admin/.vercelignore keeps local Vite/Vercel/cache artifacts out of CLI source uploads',
);

includesAll(
  envExample,
  [
    'Vercel project env: backy-public',
    'BACKY_DATA_MODE=database',
    'BACKY_DATABASE_URL=postgres://...',
    'BACKY_ADMIN_API_KEY=<server-only-admin-api-key>',
    'BACKY_ADMIN_SECRET_KEY=<server-only-admin-session-secret>',
    'CRON_SECRET=<same-server-only-admin-or-cron-secret>',
    'NEXT_PUBLIC_BACKY_ADMIN_APP_URL=https://admin.example.com',
    'BACKY_CORS_ALLOWED_ORIGINS=https://www.example.com,https://blog.example.com',
    'Vercel project env: backy-admin',
    'VITE_BACKY_PUBLIC_API_BASE_URL=https://content.example.com/api',
    'VITE_BACKY_ADMIN_API_BASE_URL=https://content.example.com/api/admin',
    'Forbidden here: BACKY_DATABASE_URL, DATABASE_URL, CRON_SECRET',
    'and any production VITE_BACKY_ADMIN_API_KEY',
    'Vercel project env: custom website frontend',
    'BACKY_PUBLIC_API_BASE_URL=https://content.example.com/api',
    'BACKY_SITE_ID=site-demo',
    'BACKY_SITE_PUBLIC_HOST=www.example.com',
  ],
  '.env.example Vercel project env boundaries',
);

includesAll(
  readme,
  [
    '## Vercel release runbook',
    'backy-public',
    'Root Directory: `apps/public`',
    'Build Command: `npm --prefix=../.. run build:vercel:public`',
    'backy-admin',
    'Root Directory: `apps/admin`',
    'Build Command: `npm --prefix=../.. run build:vercel:admin`',
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
    'BACKY_VERCEL_REQUIRE_REMOTE_ENV=1',
    'test:vercel-public-production-env-guard',
    'Vercel production builds run a public env guard before Next.js builds',
    'npm run test:vercel-production-readiness',
    'npm run test:repo-public-hygiene',
    'BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1',
    'Do not use the current prebuilt standalone output as release proof for `backy-public`',
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
    'npm run test:vercel-production-readiness',
    'npm run test:repo-public-hygiene',
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
    "productionReadinessSmoke: 'npm run test:vercel-production-readiness'",
    "promotionRule: 'Never promote demo-mode previews or production aliases.'",
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
    '"productionReadinessSmoke": { "const": "npm run test:vercel-production-readiness" }',
    '"promotionRule": { "const": "Never promote demo-mode previews or production aliases." }',
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
    'productionReadinessSmoke: {',
    'const: "npm run test:vercel-production-readiness"',
    'promotionRule: {',
    'const: "Never promote demo-mode previews or production aliases."',
  ],
  'OpenAPI deployment topology schema',
);

const projectLinks = [
  {
    app: 'backy-public',
    root: 'apps/public',
    file: 'apps/public/.vercel/project.json',
    expected: {
      buildCommand: 'npm --prefix=../.. run build:vercel:public',
      devCommand: 'npm run dev',
      framework: 'nextjs',
      outputDirectory: null,
      rootDirectory: 'apps/public',
    },
    env: {
      requiredGroups: [
        ['BACKY_DATA_MODE'],
        ['BACKY_DATABASE_URL', 'DATABASE_URL'],
        ['BACKY_ADMIN_API_KEY'],
        ['BACKY_ADMIN_SECRET_KEY'],
        ['CRON_SECRET'],
        ['NEXT_PUBLIC_BACKY_ADMIN_APP_URL'],
        ['BACKY_CORS_ALLOWED_ORIGINS'],
      ],
      requiredLabel: 'production public runtime env',
      forbidden: ['VITE_BACKY_ADMIN_API_KEY'],
    },
  },
  {
    app: 'backy-admin',
    root: 'apps/admin',
    file: 'apps/admin/.vercel/project.json',
    expected: {
      buildCommand: 'npm --prefix=../.. run build:vercel:admin',
      devCommand: 'npm run dev',
      framework: 'vite',
      outputDirectory: 'dist',
      rootDirectory: 'apps/admin',
    },
    env: {
      requiredGroups: [
        ['VITE_BACKY_PUBLIC_API_BASE_URL'],
        ['VITE_BACKY_ADMIN_API_BASE_URL'],
      ],
      requiredLabel: 'admin shell API URL env',
      forbidden: [
        'BACKY_DATABASE_URL',
        'DATABASE_URL',
        'CRON_SECRET',
        'BACKY_ADMIN_API_KEY',
        'BACKY_ADMIN_SECRET_KEY',
        'BACKY_SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'BACKY_S3_SECRET_ACCESS_KEY',
        'AWS_SECRET_ACCESS_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'VITE_BACKY_ADMIN_API_KEY',
      ],
    },
  },
];

const linkedProjects = [];

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

  if (hasProjectId && hasOrgId) linkedProjects.push({ ...link, projectJson });
}

if (exists('.vercel/project.json')) {
  warn('Root .vercel/project.json exists. Source deploys should run from the repo root, but re-link the root to the intended project before each deploy.');
}

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: options.timeout || 15000,
  env: { ...process.env, FORCE_COLOR: '0' },
});

const parseCliJson = (output) => {
  const text = String(output || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

if (skipCli) {
  warn('Skipped Vercel CLI checks because BACKY_VERCEL_SKIP_CLI=1.');
} else {
  const version = run('vercel', ['--version'], { timeout: 10000 });
  if (version.status !== 0) {
    const message = `Vercel CLI is not available or not executable: ${(version.stderr || version.stdout || '').trim()}`;
    if (strictCli) fail(message);
    else warn(message);
  } else {
    const versionText = (version.stdout || '').trim().split('\n').pop();
    pass(`Vercel CLI available (${versionText})`);
    if (!semverAtLeast(versionText, '47.2.2')) {
      const message = `Vercel CLI ${versionText || 'unknown'} is too old for current source-upload endpoints; use \`npx vercel@latest\` or upgrade to 47.2.2+.`;
      if (strictCli) fail(message);
      else warn(message);
    } else {
      pass('Vercel CLI is new enough for current source-upload endpoints');
    }

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

    for (const linkedProject of linkedProjects) {
      const project = run('vercel', ['api', `/v10/projects/${linkedProject.projectJson.projectId}`, '--raw'], {
        timeout: 20000,
      });
      if (project.status !== 0) {
        const message = `Could not inspect remote Vercel settings for ${linkedProject.app}.`;
        if (strictRemoteProjects) fail(message);
        else warn(message);
        continue;
      }

      const parsedProject = parseCliJson(`${project.stdout}\n${project.stderr}`);
      if (!parsedProject) {
        const message = `Could not parse remote Vercel settings for ${linkedProject.app}.`;
        if (strictRemoteProjects) fail(message);
        else warn(message);
        continue;
      }

      for (const [key, expected] of Object.entries(linkedProject.expected)) {
        const actual = parsedProject[key] ?? null;
        const matches = actual === expected;
        const message = `${linkedProject.app} remote ${key} is ${JSON.stringify(expected)}`;
        if (matches) pass(message);
        else if (strictRemoteProjects) {
          fail(`${message}; actual ${JSON.stringify(actual)}`);
        } else {
          warn(`${message}; actual ${JSON.stringify(actual)}`);
        }
      }

      if (parsedProject.sourceFilesOutsideRootDirectory === true) {
        pass(`${linkedProject.app} includes source files outside its root directory for workspace packages`);
      } else if (strictRemoteProjects) {
        fail(`${linkedProject.app} must include source files outside its root directory for workspace packages`);
      } else {
        warn(`${linkedProject.app} should include source files outside its root directory for workspace packages`);
      }

      if (parsedProject.link?.type === 'github' && parsedProject.link?.repo === 'backy') {
        pass(`${linkedProject.app} is connected to the GitHub backy repository`);
      } else {
        const message = `${linkedProject.app} is not connected to the GitHub backy repository`;
        if (strictRemoteProjects) fail(message);
        else warn(message);
      }

      const envList = run('vercel', ['env', 'ls', '--cwd', linkedProject.root, '--no-color'], {
        timeout: 20000,
      });
      if (envList.status !== 0) {
        const message = `Could not list Vercel env vars for ${linkedProject.app}: ${(envList.stderr || envList.stdout || '').trim()}`;
        if (strictRemoteEnv) fail(message);
        else warn(message);
        continue;
      }

      const envOutput = `${envList.stdout}\n${envList.stderr}`;
      for (const forbiddenName of linkedProject.env.forbidden) {
        if (outputContainsEnvName(envOutput, forbiddenName)) {
          fail(`${linkedProject.app} must not configure forbidden env var ${forbiddenName}`);
        } else {
          pass(`${linkedProject.app} does not configure forbidden env var ${forbiddenName}`);
        }
      }

      for (const group of linkedProject.env.requiredGroups) {
        const hasGroup = group.some((envName) => outputContainsEnvName(envOutput, envName));
        const label = group.join(' or ');
        const message = `${linkedProject.app} has ${linkedProject.env.requiredLabel}: ${label}`;
        if (hasGroup) pass(message);
        else if (strictRemoteEnv) fail(message);
        else warn(`${message} is not configured yet`);
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
    ? '\nBacky is source-ready for Vercel preview, but operator/project/env warnings remain.'
    : '\nBacky Vercel preview readiness smoke passed without warnings.',
);
