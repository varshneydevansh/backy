#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const starterRoot = path.join(repoRoot, 'examples/custom-frontend-next');
const failures = [];
const checks = [];

const pass = (message) => checks.push(message);
const fail = (message) => failures.push(message);

const read = (relativePath) => {
  const absolutePath = path.join(starterRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
};

const assertIncludes = (text, needle, message) => {
  if (text.includes(needle)) pass(message);
  else fail(message);
};

const files = {
  packageJson: read('package.json'),
  env: read('.env.example'),
  readme: read('README.md'),
  backy: read('src/lib/backy.ts'),
  render: read('src/lib/render.tsx'),
  page: read('src/app/[[...path]]/page.tsx'),
  newsletter: read('src/app/api/newsletter/route.ts'),
  form: read('src/app/api/backy-form/route.ts'),
  connection: read('src/app/api/backy-connection/route.ts'),
  client: read('src/lib/backy-client.ts'),
};

const packageJson = JSON.parse(files.packageJson || '{}');
if (!packageJson.dependencies?.['@backy/sdk-js']) {
  pass('Starter does not require unpublished @backy/sdk-js package');
} else {
  fail('Starter must not require unpublished @backy/sdk-js package for separate frontend install');
}
if (packageJson.dependencies?.next && packageJson.dependencies?.react && packageJson.dependencies?.['react-dom']) {
  pass('Starter declares Next/React runtime dependencies');
} else {
  fail('Starter must declare Next/React runtime dependencies');
}

assertIncludes(files.env, 'NEXT_PUBLIC_BACKY_API_BASE_URL=', 'Starter env exposes browser-safe Backy API base');
assertIncludes(files.env, 'NEXT_PUBLIC_BACKY_SITE_ID=', 'Starter env exposes browser-safe site id');
assertIncludes(files.env, 'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=', 'Starter env exposes browser-safe public host');
assertIncludes(files.env, 'BACKY_PUBLIC_API_BASE_URL=', 'Starter env documents optional server-loader API base');
assertIncludes(files.env, 'BACKY_SITE_ID=', 'Starter env documents optional server-loader site id');
assertIncludes(files.env, 'BACKY_SITE_PUBLIC_HOST=', 'Starter env documents optional server-loader public host');

const forbiddenEnvNames = [
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'BACKY_DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'BACKY_ADMIN_API_KEY',
  'BACKY_ADMIN_SECRET_KEY',
  'BACKY_BOOTSTRAP_TOKEN',
  'CRON_SECRET',
  'SMTP_PASSWORD',
  'STRIPE_SECRET_KEY',
];
for (const forbidden of forbiddenEnvNames) {
  if (files.env.includes(forbidden)) fail(`Starter env must not mention private env ${forbidden}`);
}
if (!files.env.includes('admin') && !files.env.includes('secret')) {
  pass('Starter env does not carry admin/secret wording');
}

assertIncludes(files.backy, 'resolveBackyCustomFrontendConfig', 'Starter resolves safe Backy custom frontend config');
assertIncludes(files.backy, 'createBackyCustomFrontendClient', 'Starter creates Backy custom frontend client');
assertIncludes(files.client, 'BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV', 'Starter local client carries forbidden env boundary');
assertIncludes(files.client, 'normalizeBackyBaseUrl', 'Starter local client normalizes /api public base URLs');
assertIncludes(files.client, 'domain:', 'Starter local client passes host context as domain');
assertIncludes(files.page, 'backy.render<BackyRenderPayload>', 'Catch-all route renders Backy payloads through the public client');
assertIncludes(files.page, 'sitePublicHost', 'Catch-all route passes custom host context');
assertIncludes(files.connection, 'backy.custom-frontend-connection.v1', 'Starter exposes a public custom frontend connection probe');
assertIncludes(files.connection, 'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1', 'Connection probe documents the strict probe smoke flag');
assertIncludes(files.connection, 'forbiddenEnvPresent', 'Connection probe reports forbidden env presence without values');
assertIncludes(files.connection, 'includesSecretValues: false', 'Connection probe declares that it does not include secret values');
assertIncludes(files.connection, 'data-backy-component-contract-pointer', 'Connection probe documents component contract DOM attributes');
assertIncludes(files.connection, 'data-backy-editable-map-pointer', 'Connection probe documents editable-map DOM attributes');
assertIncludes(files.connection, 'backy.manifest()', 'Connection probe verifies Backy manifest reachability');
assertIncludes(files.render, 'data-backy-element-id', 'Renderer preserves element API id attributes');
assertIncludes(files.render, 'data-backy-element-type', 'Renderer preserves element API type attributes');
assertIncludes(files.render, 'data-backy-component-contract-pointer', 'Renderer exposes component contract pointers');
assertIncludes(files.render, 'data-backy-property-map-pointer', 'Renderer exposes the global property-map pointer');
assertIncludes(files.render, 'data-backy-prop-keys', 'Renderer exposes element prop key metadata');
assertIncludes(files.render, 'data-backy-style-keys', 'Renderer exposes element style key metadata');
assertIncludes(files.render, 'data-backy-responsive-breakpoints', 'Renderer exposes responsive breakpoint metadata');
assertIncludes(files.render, 'data-backy-token-ref-keys', 'Renderer exposes token reference metadata');
assertIncludes(files.render, 'data-backy-asset-ids', 'Renderer exposes media asset id metadata');
assertIncludes(files.render, 'data-backy-action-count', 'Renderer exposes action count metadata');
assertIncludes(files.render, 'data-backy-binding-count', 'Renderer exposes data binding count metadata');
assertIncludes(files.render, 'data-backy-animation-type', 'Renderer exposes animation metadata');
assertIncludes(files.render, 'data-backy-editable-map-pointer', 'Renderer exposes editable-map pointer metadata');
assertIncludes(files.render, 'payload.navigation.primary', 'Renderer consumes Backy navigation payload');
assertIncludes(files.render, 'extractBackyElements', 'Renderer has a reusable element extraction boundary');
assertIncludes(files.newsletter, 'subscribeNewsletter', 'Starter exposes public newsletter signup bridge');
assertIncludes(files.form, 'buildBackyFormSubmissionInput', 'Starter normalizes Backy form submissions');
assertIncludes(files.form, 'submitForm', 'Starter submits public Backy form submissions');
assertIncludes(files.readme, 'GET /api/sites/:siteId/agent-handoff', 'Starter README begins with agent handoff read path');
assertIncludes(files.readme, 'separate custom frontend', 'Starter README documents separate frontend topology');
assertIncludes(files.readme, '/api/backy-connection', 'Starter README documents the deployed frontend connection probe');

const allStarterText = Object.entries(files)
  .filter(([name]) => name !== 'readme')
  .map(([, value]) => value)
  .join('\n');
for (const forbidden of ['adminSites(', 'createAdmin', '/api/admin/', 'VITE_BACKY_ADMIN_API_KEY']) {
  if (allStarterText.includes(forbidden)) fail(`Starter source must not call or configure admin boundary: ${forbidden}`);
}
if (allStarterText.includes('from "@backy/sdk-js"') || allStarterText.includes("from '@backy/sdk-js'")) {
  fail('Starter source must be self-contained until @backy/sdk-js is published');
}

if (process.env.BACKY_CUSTOM_FRONTEND_STARTER_TYPECHECK === '1') {
  const typecheck = spawnSync('npx', ['tsc', '--noEmit', '-p', 'examples/custom-frontend-next/tsconfig.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (typecheck.status === 0) {
    pass('Starter TypeScript typecheck passed');
  } else {
    fail(`Starter TypeScript typecheck failed:\n${typecheck.stdout}\n${typecheck.stderr}`);
  }
}

if (failures.length > 0) {
  console.error('Backy custom frontend starter smoke failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Backy custom frontend starter smoke passed: ${checks.length}`);
