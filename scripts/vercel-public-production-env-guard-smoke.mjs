#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const guard = path.join(repoRoot, 'scripts/vercel-public-production-env-guard.mjs');

const runGuard = (env) => spawnSync(process.execPath, [guard], {
  cwd: repoRoot,
  env,
  encoding: 'utf8',
});

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
};

const skipped = runGuard(baseEnv);
assert(skipped.status === 0, `Expected non-Vercel run to pass, got ${skipped.status}: ${skipped.stderr}`);
assert(
  skipped.stdout.includes('skipped outside Vercel production'),
  'Expected non-Vercel run to explain that the guard was skipped',
);

const missing = runGuard({
  ...baseEnv,
  VERCEL: '1',
  VERCEL_ENV: 'production',
});
assert(missing.status === 1, `Expected missing production env to fail, got ${missing.status}`);
assert(missing.stderr.includes('BACKY_DATA_MODE must be set to database'), 'Expected BACKY_DATA_MODE failure');
assert(
  missing.stderr.includes('BACKY_DATABASE_URL or DATABASE_URL must be configured'),
  'Expected database URL failure',
);
assert(missing.stderr.includes('BACKY_ADMIN_API_KEY must be configured'), 'Expected admin API key failure');

const demoFlag = runGuard({
  ...baseEnv,
  VERCEL: '1',
  VERCEL_ENV: 'production',
  BACKY_DATA_MODE: 'database',
  BACKY_DATABASE_URL: 'postgres://guard-secret@db.example/backy',
  BACKY_ADMIN_API_KEY: 'guard-admin-api-key',
  BACKY_ADMIN_SECRET_KEY: 'guard-admin-secret-key',
  CRON_SECRET: 'guard-cron-secret',
  NEXT_PUBLIC_BACKY_ADMIN_APP_URL: 'https://admin.example.com',
  BACKY_CORS_ALLOWED_ORIGINS: 'https://admin.example.com',
  BACKY_ALLOW_PRODUCTION_DEMO_MODE: 'true',
});
assert(demoFlag.status === 1, `Expected production demo allow flag to fail, got ${demoFlag.status}`);
assert(
  demoFlag.stderr.includes('BACKY_ALLOW_PRODUCTION_DEMO_MODE must not be enabled'),
  'Expected production demo allow flag failure',
);
assert(
  !demoFlag.stderr.includes('postgres://guard-secret') &&
    !demoFlag.stdout.includes('postgres://guard-secret'),
  'Guard output must not print configured secret values',
);

const passing = runGuard({
  ...baseEnv,
  VERCEL: '1',
  VERCEL_ENV: 'production',
  BACKY_DATA_MODE: 'database',
  BACKY_DATABASE_URL: 'postgres://guard-secret@db.example/backy',
  BACKY_ADMIN_API_KEY: 'guard-admin-api-key',
  BACKY_ADMIN_SECRET_KEY: 'guard-admin-secret-key',
  CRON_SECRET: 'guard-cron-secret',
  NEXT_PUBLIC_BACKY_ADMIN_APP_URL: 'https://admin.example.com',
  BACKY_CORS_ALLOWED_ORIGINS: 'https://admin.example.com',
});
assert(passing.status === 0, `Expected configured production env to pass, got ${passing.status}: ${passing.stderr}`);
assert(passing.stdout.includes('Backy public production env guard passed.'), 'Expected pass message');
assert(
  !passing.stderr.includes('postgres://guard-secret') &&
    !passing.stdout.includes('postgres://guard-secret'),
  'Guard pass output must not print configured secret values',
);

console.log('Backy public production env guard smoke passed.');
