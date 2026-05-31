#!/usr/bin/env node

import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const hasCron = (config) => (
  Array.isArray(config.crons) &&
  config.crons.some((entry) => (
    entry?.path === '/api/admin/commerce/reconcile?limit=100' &&
    entry?.schedule === '0 3 * * *'
  ))
);

const rootVercel = readJson('../vercel.json');
const publicVercel = readJson('../apps/public/vercel.json');
const adminVercel = readJson('../apps/admin/vercel.json');
const rootPackage = readJson('../package.json');
const publicHome = read('../apps/public/src/app/page.tsx');
const publicNextConfig = read('../apps/public/next.config.js');
const readme = read('../README.md');
const vercelRunbookStart = readme.indexOf('## Vercel release runbook');
const vercelRunbookEnd = readme.indexOf('---', vercelRunbookStart);
const vercelReleaseRunbook = readme.slice(
  vercelRunbookStart,
  vercelRunbookEnd === -1 ? undefined : vercelRunbookEnd,
);

assert(hasCron(rootVercel), 'Root vercel.json must keep the commerce reconciliation cron for root-directory deployments.');
assert(hasCron(publicVercel), 'apps/public/vercel.json must keep the commerce reconciliation cron for apps/public Vercel project roots.');

assert(
  Array.isArray(adminVercel.rewrites) &&
    adminVercel.rewrites.some((rewrite) => rewrite.destination === '/index.html'),
  'apps/admin/vercel.json must rewrite deep SPA routes to index.html.',
);

assert(
  JSON.stringify(adminVercel).includes('X-Content-Type-Options') &&
    JSON.stringify(adminVercel).includes('strict-origin-when-cross-origin'),
  'apps/admin/vercel.json must include baseline security headers.',
);

for (const snippet of [
  'NEXT_PUBLIC_BACKY_ADMIN_APP_URL',
  'You are viewing backy-public: the public API and render runtime.',
  'This page is not the private editor.',
  'Production admin setup stays private by construction.',
  'Use Supabase Auth or another provider-backed login',
  '/api/sites/site-demo/manifest',
  '/api/sites/site-demo/openapi',
  'backy-public',
  'backy-admin',
]) {
  assert(publicHome.includes(snippet), `Public website homepage is missing release-facing snippet: ${snippet}`);
}

for (const snippet of [
  '## Vercel release runbook',
  'Root Directory: `apps/public`',
  'Root Directory: `apps/admin`',
  'NEXT_PUBLIC_BACKY_ADMIN_APP_URL',
  'VITE_BACKY_ADMIN_API_BASE_URL',
  'CRON_SECRET',
  'same server-only value as `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY`',
  '### Protected topology',
  'BACKY_PUBLIC_API_BASE_URL',
  'BACKY_SITE_ID',
  'BACKY_SITE_PUBLIC_HOST',
  'GET /api/sites/:siteId/agent-handoff',
  '### Secure admin account setup',
  'Production admin access should not depend on committed emails, passwords, or client-visible keys.',
  'BACKY_ADMIN_MFA_TOTP_SECRET',
  'Do not enable `BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH`',
  'studio.example.com',
  'Vercel Deployment Protection',
  'Vercel Agent',
  'httpOnly `backy_admin_session` cookie',
  'Forbidden env',
  'npm run test:vercel-preview-readiness',
  'BACKY_VERCEL_REQUIRE_REMOTE_ENV=1',
  'test:vercel-public-production-env-guard',
  'Vercel production builds run a public env guard before Next.js builds',
  'npm run test:vercel-production-readiness',
  'npm run test:repo-public-hygiene',
  '### Production promotion gate',
  'BACKY_VERCEL_REQUIRE_LIVE_PRODUCTION=1',
]) {
  assert(readme.includes(snippet), `README release runbook is missing: ${snippet}`);
}

assert(
  vercelRunbookStart !== -1 && !vercelReleaseRunbook.includes('VITE_BACKY_ADMIN_API_KEY'),
  'README production Vercel runbook must not instruct operators to configure a client-exposed VITE_BACKY_ADMIN_API_KEY.',
);

assert(
  rootPackage.scripts?.['test:vercel-release-config'] === 'node scripts/vercel-release-config-smoke.mjs',
  'Root package.json must expose test:vercel-release-config.',
);

assert(
  rootPackage.scripts?.['test:vercel-preview-readiness'] === 'node scripts/vercel-preview-readiness-smoke.mjs',
  'Root package.json must expose test:vercel-preview-readiness.',
);

assert(
  rootPackage.scripts?.['test:vercel-production-readiness'] === 'node scripts/vercel-production-readiness-smoke.mjs',
  'Root package.json must expose test:vercel-production-readiness.',
);

assert(
  rootPackage.scripts?.['test:repo-public-hygiene'] === 'node scripts/repo-public-hygiene-smoke.mjs',
  'Root package.json must expose test:repo-public-hygiene.',
);
assert(
  rootPackage.scripts?.['test:vercel-public-production-env-guard'] ===
    'node scripts/vercel-public-production-env-guard-smoke.mjs',
  'Root package.json must expose test:vercel-public-production-env-guard.',
);

assert(
  rootPackage.scripts?.['build:vercel:public']?.startsWith('node scripts/vercel-public-production-env-guard.mjs && '),
  'Root package public Vercel build must run the production env guard before a release build.',
);

assert(
  publicNextConfig.includes('(?<domain>.*[A-Za-z].*)'),
  'apps/public subdomain rewrite must not treat IPv4 localhost hosts as tenant subdomains.',
);

console.log('Vercel release config smoke passed.');
