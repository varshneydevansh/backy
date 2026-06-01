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
const adminEmail = process.env.BACKY_VERCEL_ADMIN_EMAIL || '';
const adminPassword = process.env.BACKY_VERCEL_ADMIN_PASSWORD || '';
const adminMfaCode =
  process.env.BACKY_VERCEL_ADMIN_MFA_CODE ||
  process.env.BACKY_VERCEL_ADMIN_TWO_FACTOR_CODE ||
  '';
const requireLiveAdminAuth = process.env.BACKY_VERCEL_REQUIRE_LIVE_ADMIN_AUTH === '1';

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
const productionReadinessSource = read('scripts/vercel-production-readiness-smoke.mjs');
const handoff = read('packages/core/src/custom-frontend-agent-handoff.ts');
const manifestSchema = read('specs/ai-frontend-contract/frontend-manifest.schema.json');
const openApiRoute = read('apps/public/src/app/api/sites/[siteId]/openapi/route.ts');
const productionEnvGuard = read('scripts/vercel-public-production-env-guard.mjs');
const publicNextConfig = read('apps/public/next.config.js');
const publicRepositoryRuntime = read('apps/public/src/lib/repositoryRuntime.ts');
const adminSessionStore = read('apps/public/src/lib/admin-auth/sessionStore.ts');
const adminLoginRoute = read('apps/public/src/app/api/admin/auth/login/route.ts');
const adminSessionRoute = read('apps/public/src/app/api/admin/auth/session/route.ts');
const adminLogoutRoute = read('apps/public/src/app/api/admin/auth/logout/route.ts');
const adminAccess = read('apps/public/src/lib/adminAccess.ts');

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
    'BACKY_VERCEL_ADMIN_EMAIL',
    'BACKY_VERCEL_REQUIRE_LIVE_ADMIN_AUTH=1',
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
    'BACKY_VERCEL_REQUIRE_LIVE_ADMIN_AUTH=1',
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
    'Optional live admin proof must login, restore session, and logout through backy-public without exposing credentials or session tokens.',
  ],
  'Custom frontend deployment topology production source',
);

includesAll(
  manifestSchema,
  [
    '"productionReadinessSmoke": { "const": "npm run test:vercel-production-readiness" }',
    '"promotionRule": { "const": "Never promote demo-mode previews or production aliases." }',
    '"liveProof": { "type": "string", "minLength": 1 }',
    '"adminAuthProof": { "type": "string", "minLength": 1 }',
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
    'adminAuthProof: {',
    'name: "domain"',
    'name: "host"',
    'name: "x-forwarded-host"',
  ],
  'OpenAPI deployment topology production schema',
);

includesAll(
  productionReadinessSource,
  [
    'BACKY_VERCEL_ADMIN_EMAIL',
    'BACKY_VERCEL_ADMIN_PASSWORD',
    'BACKY_VERCEL_ADMIN_MFA_CODE',
    'BACKY_VERCEL_REQUIRE_LIVE_ADMIN_AUTH',
    'checkLiveAdminAuth',
    'MFA_REQUIRED',
    '/api/admin/auth/login',
    '/api/admin/auth/session',
    '/api/admin/auth/logout',
  ],
  'Production readiness smoke supports optional live admin auth proof',
);

includesAll(
  productionEnvGuard,
  [
    "valueFor('VERCEL_ENV') === 'production'",
    "BACKY_DATA_MODE') !== 'database'",
    "BACKY_DATABASE_URL')",
    "DATABASE_URL')",
    "POSTGRES_URL')",
    "POSTGRES_PRISMA_URL')",
    'BACKY_ALLOW_PRODUCTION_DEMO_MODE',
    'BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH',
    'must not be enabled for production release builds',
  ],
  'Public production env guard source',
);

includesAll(
  publicNextConfig,
  [
    "transpilePackages: ['@backy-cms/core', '@backy/db', '@backy/storage']",
  ],
  'Public production Next config bundles Backy workspace packages into Vercel functions',
);
assert(
  !publicNextConfig.includes("serverExternalPackages: ['@backy/storage', '@backy/db']"),
  'Public production Next config does not externalize Backy workspace packages from Vercel functions',
);
includesAll(
  publicRepositoryRuntime,
  [
    "import('@backy/db/adapters')",
    "import('@backy/db/repositories')",
  ],
  'Public production repository runtime uses Vercel-traceable Backy database imports',
);
assert(
  !publicRepositoryRuntime.includes("new Function('specifier', 'return import(specifier)')"),
  'Public production repository runtime does not hide Backy database imports from Vercel tracing',
);

includesAll(
  adminSessionStore,
  [
    'upsertAdminSessionAuthRecord',
    'removeAdminSessionAuthRecord',
    'pruneExpiredMemorySessions',
    'options: { authMode?: AdminAuthMode; persist?: boolean }',
    'options.persist !== false',
    'options.persist === false',
    'else if (!hasExternalAuthSettings)',
  ],
  'Admin session store exposes database-safe auth-session record transforms',
);
includesAll(
  adminLoginRoute,
  [
    'upsertAdminSessionAuthRecord',
    "{ persist: !repositories }",
    'persistSuccessfulSession',
    'completeLoginResponse(requestId, session, repositories, authSettings, twoFactorCode, persistSuccessfulSession)',
  ],
  'Production admin login persists sessions through repository auth settings instead of local files',
);
includesAll(
  adminSessionRoute,
  [
    'removeAdminSessionAuthRecord',
    'upsertAdminSessionAuthRecord',
    'authSettings',
    'updateAuthSettings',
    "{ persist: !repositories }",
    'await repositories.settings.update({ auth: nextAuth })',
  ],
  'Production admin session refresh and rotation use repository auth settings',
);
includesAll(
  adminLogoutRoute,
  [
    'removeAdminSessionAuthRecord',
    "{ persist: !repositories }",
    'await repositories.settings.update({ auth: next.auth })',
  ],
  'Production admin logout revokes persisted sessions through repository auth settings',
);
includesAll(
  adminAccess,
  [
    'const authSettings = repositories',
    'authSettings,',
    'updateAuthSettings:',
  ],
  'Production admin access restores sessions from repository auth settings',
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
    const json = JSON.parse(text);
    if (json && typeof json === 'object') {
      Object.defineProperty(json, '__headers', {
        value: response.headers,
        enumerable: false,
      });
    }
    return json;
  } catch (error) {
    fail(`${url} did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const requestJson = async (url, init = {}) => {
  const expectedStatuses = Array.isArray(init.expectedStatuses)
    ? init.expectedStatuses
    : [init.expectedStatus || 200];
  const label = init.label || url;
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    method: init.method || 'GET',
    headers: {
      accept: 'application/json',
      ...(init.headers || {}),
    },
    body: init.body,
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (!expectedStatuses.includes(response.status)) {
    fail(`${label} returned ${response.status}; body starts ${JSON.stringify(text.slice(0, 120))}`);
    return { response, json: null };
  }
  if (!contentType.includes('application/json')) {
    fail(`${label} returned non-JSON content-type ${contentType || '<missing>'}`);
    return { response, json: null };
  }

  try {
    return { response, json: JSON.parse(text) };
  } catch (error) {
    fail(`${label} did not return parseable JSON: ${error instanceof Error ? error.message : String(error)}`);
    return { response, json: null };
  }
};

const getSessionCookieHeader = (response) => {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return cookies
    .map((cookie) => String(cookie).split(';')[0])
    .find((cookie) => cookie.startsWith('backy_admin_session='))
    || '';
};

const findOpenApiOperation = (openapi, requestedPath, suffix) => (
  openapi.paths?.[requestedPath]?.get
  || Object.entries(openapi.paths || {})
    .find(([pathKey]) => pathKey.endsWith(suffix))?.[1]?.get
  || null
);

const checkLiveAdminAuth = async (baseUrl) => {
  if (!adminEmail || !adminPassword) {
    const message = 'BACKY_VERCEL_ADMIN_EMAIL/PASSWORD not set; skipping live admin auth proof.';
    if (requireLiveAdminAuth) fail(message);
    else warn(message);
    return;
  }

  const loginUrl = `${baseUrl}/api/admin/auth/login`;
  const login = (twoFactorCode) => requestJson(loginUrl, {
    method: 'POST',
    label: 'production admin login',
    expectedStatuses: [200, 401],
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let loginResult = await login();
  if (loginResult.json?.error?.code === 'MFA_REQUIRED') {
    if (!adminMfaCode) {
      fail('Production admin login requires MFA; set BACKY_VERCEL_ADMIN_MFA_CODE for the live admin auth proof.');
      return;
    }
    loginResult = await login(adminMfaCode);
  }

  if (loginResult.response?.status !== 200 || loginResult.json?.success !== true) {
    const code = loginResult.json?.error?.code || `HTTP_${loginResult.response?.status || 'UNKNOWN'}`;
    fail(`Production admin login failed with ${code}; credential values were not printed.`);
    return;
  }

  const sessionToken = loginResult.json?.data?.session?.token;
  assert(Boolean(sessionToken), 'Production admin login returns a session token');
  assert(Boolean(loginResult.json?.data?.user?.id), 'Production admin login returns user identity');
  assert(
    loginResult.json?.data?.session?.authMode === 'supabase',
    'Production admin login uses the provider-backed auth mode',
  );

  const sessionCookie = getSessionCookieHeader(loginResult.response);
  const authHeaders = {
    authorization: `Bearer ${sessionToken}`,
    ...(sessionCookie ? { cookie: sessionCookie } : {}),
  };

  const sessionResult = await requestJson(`${baseUrl}/api/admin/auth/session`, {
    label: 'production admin session restore',
    headers: authHeaders,
  });
  assert(sessionResult.json?.success === true, 'Production admin session restore returns success=true');
  assert(
    sessionResult.json?.data?.user?.email?.toLowerCase() === adminEmail.toLowerCase(),
    'Production admin session restore matches the supplied admin identity',
  );

  const logoutResult = await requestJson(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    label: 'production admin logout',
    headers: authHeaders,
  });
  assert(logoutResult.json?.success === true, 'Production admin logout returns success=true');
  assert(
    logoutResult.json?.data && Object.prototype.hasOwnProperty.call(logoutResult.json.data, 'revoked'),
    'Production admin logout returns revocation state',
  );
};

const checkLiveProduction = async () => {
  if (!productionUrl) {
    const message = 'BACKY_VERCEL_PRODUCTION_URL is not set; skipping live production URL proof.';
    if (requireLive || requireLiveAdminAuth) fail(message);
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
    const resolveOperation = findOpenApiOperation(openapi, `/api/sites/${siteId}/resolve`, '/resolve');
    const renderOperation = findOpenApiOperation(openapi, `/api/sites/${siteId}/render`, '/render');
    const resolveParameters = (resolveOperation?.parameters || [])
      .map((parameter) => `${parameter.in}:${parameter.name}`);
    const renderParameters = (renderOperation?.parameters || [])
      .map((parameter) => `${parameter.in}:${parameter.name}`);
    assert(resolveParameters.includes('query:domain'), 'Production OpenAPI resolve documents domain query context');
    assert(resolveParameters.includes('query:host'), 'Production OpenAPI resolve documents host query context');
    assert(resolveParameters.includes('header:x-forwarded-host'), 'Production OpenAPI resolve documents forwarded host context');
    assert(renderParameters.includes('query:domain'), 'Production OpenAPI render documents domain query context');
    assert(renderParameters.includes('query:host'), 'Production OpenAPI render documents host query context');
    assert(renderParameters.includes('header:x-forwarded-host'), 'Production OpenAPI render documents forwarded host context');
  }

  const render = await parseJsonResponse(endpoints.render);
  if (render) {
    assert(render.success === true, 'Production render returns success=true');
    assert(
      render.__headers?.get('x-backy-schema-version') === 'backy.content-payload.v1',
      'Production render exposes the negotiated content payload schema header',
    );
    assert(
      render.__headers?.get('x-backy-supported-schema-versions')?.includes('backy.content-payload.v1'),
      'Production render exposes supported content payload schema versions',
    );
    assert(
      render.data?.content?.contentDocument?.schemaVersion === 'backy.content.v1',
      'Production render includes the Backy content document schema',
    );
    assert(Boolean(render.data?.site?.id), 'Production render includes site identity');
  }

  await checkLiveAdminAuth(baseUrl);
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
