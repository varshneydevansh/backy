#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
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

const readRepo = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
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
  rootPackageJson: readRepo('package.json'),
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
  generator: readRepo('scripts/generate-custom-frontend-starter-template.mjs'),
  materializer: readRepo('scripts/materialize-custom-frontend-starter.mjs'),
  scaffold: readRepo('scripts/scaffold-custom-frontend-starter.mjs'),
  ensureSite: readRepo('scripts/ensure-custom-frontend-site.mjs'),
  generatedTemplate: readRepo('apps/public/src/lib/customFrontendStarterProjectTemplate.ts'),
};

const rootPackageJson = JSON.parse(files.rootPackageJson || '{}');
if (rootPackageJson.scripts?.['custom-frontend:ensure-site'] === 'node scripts/ensure-custom-frontend-site.mjs') {
  pass('Root package exposes custom-frontend:ensure-site');
} else {
  fail('Root package must expose custom-frontend:ensure-site');
}

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
if (packageJson.overrides?.postcss) {
  pass('Starter pins PostCSS override for the Next.js dependency graph');
} else {
  fail('Starter must override PostCSS so new scaffolds do not inherit known vulnerable transitive ranges');
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
assertIncludes(files.connection, 'backy.custom-frontend-control-plane.v1', 'Connection probe exposes the custom frontend control-plane schema');
assertIncludes(files.connection, 'agentHandoff: siteEndpoint("/agent-handoff")', 'Connection probe exposes the site-scoped agent handoff endpoint');
assertIncludes(files.connection, 'openapi: siteEndpoint("/openapi")', 'Connection probe exposes the site-scoped OpenAPI endpoint');
assertIncludes(files.connection, 'renderHome: renderEndpoint("/")', 'Connection probe exposes the host-aware home render endpoint');
assertIncludes(files.connection, 'componentTypeContracts: "agent-handoff.componentApiContract.componentTypeContracts"', 'Connection probe exposes the component contract pointer');
assertIncludes(files.connection, 'propertyMap: "agent-handoff.componentApiContract.propertyMap"', 'Connection probe exposes the property map pointer');
assertIncludes(files.connection, 'renderElements: "render.data.content.elements[]"', 'Connection probe exposes the render element pointer');
assertIncludes(files.connection, 'editableMap: "render.data.editableMap"', 'Connection probe exposes the editable-map pointer');
assertIncludes(files.connection, 'frontendDesign: "manifest.data.site.frontendDesign"', 'Connection probe exposes the frontend design pointer');
assertIncludes(files.connection, 'renderReachable: true', 'Connection probe verifies Backy render reachability');
assertIncludes(files.connection, 'hasEditableMap: hasEditableMap(render.data)', 'Connection probe reports editable-map reachability without exposing values');
assertIncludes(files.connection, 'data-backy-component-contract-pointer', 'Connection probe documents component contract DOM attributes');
assertIncludes(files.connection, 'data-backy-editable-map-pointer', 'Connection probe documents editable-map DOM attributes');
assertIncludes(files.connection, 'backy.manifest()', 'Connection probe verifies Backy manifest reachability');
assertIncludes(files.connection, 'backy.render("/")', 'Connection probe verifies Backy render reachability');
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
assertIncludes(files.readme, 'backy.custom-frontend-control-plane.v1', 'Starter README documents the deployed frontend control-plane probe');
assertIncludes(files.generator, 'CUSTOM_FRONTEND_STARTER_TEMPLATE_FILES', 'Starter bundle generator writes the public template file list');
assertIncludes(files.generator, 'examples/custom-frontend-next', 'Starter bundle generator reads the checked starter project');
assertIncludes(files.materializer, 'backy.custom-frontend-starter-project.v1', 'Starter materializer validates the project schema');
assertIncludes(files.materializer, 'Target directory is not empty', 'Starter materializer refuses non-empty targets by default');
assertIncludes(files.materializer, "startsWith('../')", 'Starter materializer rejects parent-path traversal');
assertIncludes(files.materializer, 'pathSafety', 'Starter materializer reports path-safety metadata');
assertIncludes(files.scaffold, 'backy.custom-frontend-starter-export.v1', 'Starter scaffold emits the protected starter export schema');
assertIncludes(files.scaffold, 'custom-frontend:materialize', 'Starter scaffold delegates to the materializer command');
assertIncludes(files.scaffold, 'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST', 'Starter scaffold writes browser-safe public host env');
assertIncludes(files.scaffold, 'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1', 'Starter scaffold writes strict deployed-frontend verification command');
assertIncludes(files.scaffold, 'forbiddenPrivateEnv', 'Starter scaffold carries forbidden private env boundaries');
assertIncludes(files.scaffold, '/sites?identifier=', 'Starter scaffold verifies public site discovery before writing');
assertIncludes(files.scaffold, '/render?path=/', 'Starter scaffold verifies the home render payload before writing');
assertIncludes(files.scaffold, '--skip-site-verify', 'Starter scaffold keeps an explicit offline escape hatch for fixture manifests');
assertIncludes(files.scaffold, 'publicSiteVerification', 'Starter scaffold records public site verification metadata');
assertIncludes(files.ensureSite, 'backy.custom-frontend-site-readiness.v1', 'Ensure-site command emits a custom frontend site readiness schema');
assertIncludes(files.ensureSite, 'Refusing --admin-key', 'Ensure-site command refuses admin keys in command-line history');
assertIncludes(files.ensureSite, 'Refusing --service-role-key', 'Ensure-site command refuses service-role keys in command-line history');
assertIncludes(files.ensureSite, 'BACKY_CUSTOM_FRONTEND_ADMIN_KEY', 'Ensure-site command reads server-side admin keys from environment');
assertIncludes(files.ensureSite, 'SUPABASE_SERVICE_ROLE_KEY', 'Ensure-site command can use server-side Supabase REST fallback');
assertIncludes(files.ensureSite, '/rest/v1/', 'Ensure-site command keeps Supabase fallback behind server-side REST');
assertIncludes(files.ensureSite, '/pages?includeUnpublished=true', 'Ensure-site command checks homepage readiness before handoff');
assertIncludes(files.ensureSite, '/render?path=/', 'Ensure-site command verifies public home render before scaffold handoff');
assertIncludes(files.generatedTemplate, 'backy.custom-frontend-connection.v1', 'Generated starter bundle includes the connection probe');
assertIncludes(files.generatedTemplate, 'backy.custom-frontend-control-plane.v1', 'Generated starter bundle includes the connection control-plane probe');
assertIncludes(files.generatedTemplate, 'src/app/[[...path]]/page.tsx', 'Generated starter bundle includes the catch-all page renderer');
assertIncludes(files.generatedTemplate, 'src/lib/backy-client.ts', 'Generated starter bundle includes the vendored Backy public client');
assertIncludes(files.generatedTemplate, 'data-backy-element-id', 'Generated starter bundle preserves element API id attributes');
assertIncludes(files.generatedTemplate, 'data-backy-component-contract-pointer', 'Generated starter bundle preserves component contract pointers');
assertIncludes(files.generatedTemplate, 'subscribeNewsletter', 'Generated starter bundle includes newsletter signup support');
assertIncludes(files.generatedTemplate, 'submitForm', 'Generated starter bundle includes public form submission support');
if (!files.generatedTemplate.includes('"path": ".next')) {
  pass('Generated starter bundle excludes local Next build artifacts');
} else {
  fail('Generated starter bundle must not include local Next build artifacts');
}

const allStarterText = Object.entries(files)
  .filter(([name]) => !['readme', 'rootPackageJson', 'ensureSite'].includes(name))
  .map(([, value]) => value)
  .join('\n');
for (const forbidden of ['adminSites(', 'createAdmin', '/api/admin/', 'VITE_BACKY_ADMIN_API_KEY']) {
  if (allStarterText.includes(forbidden)) fail(`Starter source must not call or configure admin boundary: ${forbidden}`);
}
if (allStarterText.includes('from "@backy/sdk-js"') || allStarterText.includes("from '@backy/sdk-js'")) {
  fail('Starter source must be self-contained until @backy/sdk-js is published');
}

const materializerTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backy-starter-materialize-'));
const materializerManifestPath = path.join(materializerTempRoot, 'starter.json');
const materializerOutputPath = path.join(materializerTempRoot, 'frontend');
const materializerManifest = {
  success: true,
  data: {
    schemaVersion: 'backy.custom-frontend-starter-export.v1',
    site: { id: 'site-smoke', primaryPublicHost: 'smoke.example.com' },
    starterProject: {
      schemaVersion: 'backy.custom-frontend-starter-project.v1',
      exportFormat: 'file-list',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
      devCommand: 'npm run dev',
    },
    files: [
      { path: '.env.example', role: 'site-specific-env', content: 'NEXT_PUBLIC_BACKY_SITE_ID=site-smoke\n' },
      { path: 'src/app/page.tsx', role: 'page', content: 'export default function Page() { return null; }\n' },
    ],
  },
};
fs.writeFileSync(materializerManifestPath, JSON.stringify(materializerManifest, null, 2));
const materializerRun = spawnSync(
  'node',
  ['scripts/materialize-custom-frontend-starter.mjs', '--manifest', materializerManifestPath, '--out', materializerOutputPath],
  { cwd: repoRoot, encoding: 'utf8', timeout: 30000 },
);
if (
  materializerRun.status === 0 &&
  fs.existsSync(path.join(materializerOutputPath, '.env.example')) &&
  fs.existsSync(path.join(materializerOutputPath, 'src/app/page.tsx')) &&
  materializerRun.stdout.includes('"fileCount": 2')
) {
  pass('Starter materializer writes a valid file-list export into a target frontend directory');
} else {
  fail(`Starter materializer failed:\n${materializerRun.stdout}\n${materializerRun.stderr}`);
}

const scaffoldTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backy-starter-scaffold-'));
const scaffoldManifestPath = path.join(scaffoldTempRoot, 'starter.json');
const scaffoldOutputPath = path.join(scaffoldTempRoot, 'frontend');
const scaffoldRun = spawnSync(
  'node',
  [
    'scripts/scaffold-custom-frontend-starter.mjs',
    '--site-id',
    'site-smoke',
    '--public-host',
    'smoke.example.com',
    '--api-base',
    'https://backy-public.example.com/api',
    '--skip-site-verify',
    '--manifest',
    scaffoldManifestPath,
    '--out',
    scaffoldOutputPath,
  ],
  { cwd: repoRoot, encoding: 'utf8', timeout: 30000 },
);
if (
  scaffoldRun.status === 0 &&
  fs.existsSync(scaffoldManifestPath) &&
  fs.existsSync(path.join(scaffoldOutputPath, 'BACKY_FRONTEND_STARTER.md')) &&
  fs.existsSync(path.join(scaffoldOutputPath, 'src/app/api/backy-connection/route.ts')) &&
  fs.readFileSync(path.join(scaffoldOutputPath, '.env.example'), 'utf8').includes('NEXT_PUBLIC_BACKY_SITE_ID=site-smoke') &&
  scaffoldRun.stdout.includes('"schemaVersion": "backy.custom-frontend-scaffold.v1"')
) {
  pass('Starter scaffold creates a manifest and materialized separate frontend project from safe public inputs');
} else {
  fail(`Starter scaffold failed:\n${scaffoldRun.stdout}\n${scaffoldRun.stderr}`);
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
