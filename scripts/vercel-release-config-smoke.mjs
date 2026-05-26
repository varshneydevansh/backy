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
]) {
  assert(readme.includes(snippet), `README release runbook is missing: ${snippet}`);
}

assert(
  rootPackage.scripts?.['test:vercel-release-config'] === 'node scripts/vercel-release-config-smoke.mjs',
  'Root package.json must expose test:vercel-release-config.',
);

assert(
  publicNextConfig.includes('(?<domain>.*[A-Za-z].*)'),
  'apps/public subdomain rewrite must not treat IPv4 localhost hosts as tenant subdomains.',
);

console.log('Vercel release config smoke passed.');
