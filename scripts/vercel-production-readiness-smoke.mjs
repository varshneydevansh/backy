#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const failures = [];
const warnings = [];
const checks = [];

const productionUrl =
  process.env.BACKY_VERCEL_PRODUCTION_URL ||
  process.env.BACKY_PUBLIC_PRODUCTION_URL ||
  '';
const siteId = process.env.BACKY_VERCEL_PRODUCTION_SITE_ID || 'site-demo';
const requireLive = process.env.BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION === '1';

const rel = (file) => path.join(repoRoot, file);
const read = (file) => fs.readFileSync(rel(file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

const pass = (message) => checks.push(message);
const warn = (message) => warnings.push(message);
const fail = (message) => failures.push(message);

const assert = (condition, message) => {
  if (condition) pass(message);
  else fail(message);
};

const includesAll = (text, snippets, label) => {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  assert(missing.length === 0, `${label}${missing.length ? ` missing: ${missing.join(', ')}` : ''}`);
};

const rootPackage = readJson('package.json');
const readme = read('README.md');
const agents = read('AGENTS.md');
const handoff = read('packages/core/src/custom-frontend-agent-handoff.ts');
const manifestSchema = read('specs/ai-frontend-contract/frontend-manifest.schema.json');
const openApiRoute = read('apps/public/src/app/api/sites/[siteId]/openapi/route.ts');
const productionEnvGuard = read('scripts/vercel-public-production-env-guard.mjs');

assert(
  rootPackage.scripts?.['test:vercel-production-readiness'] === 'node scripts/vercel-production-readiness-smoke.mjs',
  'Root package exposes test:vercel-production-readiness',
);
assert(
  rootPackage.scripts?.['test:vercel-public-production-env-guard'] ===
    'node scripts/vercel-public-production-env-guard-smoke.mjs',
  'Root package exposes test:vercel-public-production-env-guard',
);
assert(
  rootPackage.scripts?.['build:vercel:public']?.startsWith('node scripts/vercel-public-production-env-guard.mjs && '),
  'Public Vercel production builds run the env guard before Next.js build',
);
includesAll(
  rootPackage.scripts?.['test:partial-gate-preflights'] || '',
  [
    'npm run test:vercel-public-production-env-guard',
    'npm run test:vercel-production-readiness',
    'npm run test:repo-public-hygiene',
  ],
  'Root Partial gate aggregate includes production env guard, production readiness, and public hygiene',
);

includesAll(
  readme,
  [
    '### Production promotion gate',
    'Never promote a preview or production alias while `BACKY_DATA_MODE=demo`',
    'BACKY_VERCEL_PRODUCTION_URL',
    'BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1',
    'Vercel production builds run a public env guard before Next.js builds',
    'npm run test:vercel-production-readiness',
    '/api/sites/site-demo/agent-handoff',
    '/api/sites/site-demo/manifest',
    '/api/sites/site-demo/openapi',
    '/api/sites/site-demo/render?path=/',
  ],
  'README production promotion gate',
);

includesAll(
  agents,
  [
    'Before production promotion',
    'npm run test:vercel-production-readiness',
    'BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1',
    'BACKY_DATA_MODE=database',
  ],
  'AGENTS production promotion guidance',
);

includesAll(
  handoff,
  [
    "productionReadinessSmoke: 'npm run test:vercel-production-readiness'",
    'Never promote demo-mode previews or production aliases.',
    'Live production proof must fetch agent-handoff, manifest, OpenAPI, and render JSON from the final public domain.',
  ],
  'Custom frontend deployment topology production source',
);

includesAll(
  manifestSchema,
  [
    '"productionReadinessSmoke": { "const": "npm run test:vercel-production-readiness" }',
    '"promotionRule": { "const": "Never promote demo-mode previews or production aliases." }',
    '"liveProof": { "type": "string", "minLength": 1 }',
  ],
  'Frontend manifest deployment topology production schema',
);

includesAll(
  openApiRoute,
  [
    'productionReadinessSmoke: {',
    'const: "npm run test:vercel-production-readiness"',
    'promotionRule: {',
    'const: "Never promote demo-mode previews or production aliases."',
    'liveProof: {',
  ],
  'OpenAPI deployment topology production schema',
);

includesAll(
  productionEnvGuard,
  [
    "valueFor('VERCEL_ENV') === 'production'",
    "BACKY_DATA_MODE') !== 'database'",
    "BACKY_DATABASE_URL') && !valueFor('DATABASE_URL')",
    'BACKY_ALLOW_PRODUCTION_DEMO_MODE',
    'BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH',
    'must not be enabled for production release builds',
  ],
  'Public production env guard source',
);

const normalizeProductionUrl = (value) => {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/u, '');
};

const parseJsonResponse = async (url) => {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: 'application/json',
    },
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (response.status !== 200) {
    fail(`${url} returned ${response.status}; body starts ${JSON.stringify(text.slice(0, 120))}`);
    return null;
  }
  if (!contentType.includes('application/json')) {
    fail(`${url} returned non-JSON content-type ${contentType || '<missing>'}`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${url} did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const checkLiveProduction = async () => {
  if (!productionUrl) {
    const message = 'BACKY_VERCEL_PRODUCTION_URL is not set; skipping live production URL proof.';
    if (requireLive) fail(message);
    else warn(message);
    return;
  }

  let baseUrl = '';
  try {
    baseUrl = normalizeProductionUrl(productionUrl);
  } catch {
    fail(`BACKY_VERCEL_PRODUCTION_URL is not a valid URL: ${productionUrl}`);
    return;
  }

  const endpoints = {
    agentHandoff: `${baseUrl}/api/sites/${encodeURIComponent(siteId)}/agent-handoff`,
    manifest: `${baseUrl}/api/sites/${encodeURIComponent(siteId)}/manifest`,
    openapi: `${baseUrl}/api/sites/${encodeURIComponent(siteId)}/openapi`,
    render: `${baseUrl}/api/sites/${encodeURIComponent(siteId)}/render?path=/`,
  };

  const agentHandoff = await parseJsonResponse(endpoints.agentHandoff);
  if (agentHandoff) {
    assert(agentHandoff.success === true, 'Production agent-handoff returns success=true');
    assert(
      agentHandoff.data?.schemaVersion === 'backy.custom-frontend-agent-handoff-response.v1',
      'Production agent-handoff exposes the handoff response schema',
    );
    assert(
      agentHandoff.data?.deploymentTopology?.verification?.productionReadinessSmoke ===
        'npm run test:vercel-production-readiness',
      'Production agent-handoff exposes the production readiness command',
    );
  }

  const manifest = await parseJsonResponse(endpoints.manifest);
  if (manifest) {
    assert(manifest.success === true, 'Production manifest returns success=true');
    assert(
      manifest.data?.schemaVersion === 'backy.frontend-manifest.v1',
      'Production manifest exposes the frontend manifest schema',
    );
    assert(
      manifest.data?.contract?.customFrontendAgentHandoff?.deploymentTopology?.verification
        ?.productionReadinessSmoke === 'npm run test:vercel-production-readiness',
      'Production manifest mirrors production readiness topology',
    );
  }

  const openapi = await parseJsonResponse(endpoints.openapi);
  if (openapi) {
    assert(openapi.openapi === '3.1.0', 'Production OpenAPI returns openapi=3.1.0');
    assert(Boolean(openapi['x-backy-completion-status']), 'Production OpenAPI exposes completion status');
    assert(
      openapi['x-backy-custom-frontend-agent-handoff']?.deploymentTopology?.verification
        ?.productionReadinessSmoke === 'npm run test:vercel-production-readiness',
      'Production OpenAPI mirrors production readiness topology',
    );
  }

  const render = await parseJsonResponse(endpoints.render);
  if (render) {
    assert(render.success === true, 'Production render returns success=true');
    assert(
      render.data?.schemaVersion === 'backy.render-payload.v1',
      'Production render exposes the render payload schema',
    );
    assert(Boolean(render.data?.site?.id), 'Production render includes site identity');
  }
};

await checkLiveProduction();

console.log(`Backy Vercel production readiness source checks passed: ${checks.length}`);

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('\nFailures:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
