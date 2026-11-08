#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminOriginProjectEnvPolicy, outputContainsEnvName } from './vercel-admin-origin-policy.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const guard = path.join(repoRoot, 'scripts/vercel-public-production-env-guard.mjs');

const runGuard = (env) => spawnSync(process.execPath, [guard], {
  cwd: repoRoot,
  env,
  encoding: 'utf8',
});

let checks = 0;
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
  checks += 1;
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
  missing.stderr.includes('BACKY_DATABASE_URL, DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL must be configured'),
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
  BACKY_ADMIN_TRUSTED_ORIGINS: 'https://admin.example.com',
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
  BACKY_ADMIN_TRUSTED_ORIGINS: 'https://admin.example.com',
});
assert(passing.status === 0, `Expected configured production env to pass, got ${passing.status}: ${passing.stderr}`);
assert(passing.stdout.includes('Backy public production env guard passed.'), 'Expected pass message');
assert(
  !passing.stderr.includes('postgres://guard-secret') &&
    !passing.stdout.includes('postgres://guard-secret'),
  'Guard pass output must not print configured secret values',
);

const passingWithVercelPostgresAlias = runGuard({
  ...baseEnv,
  VERCEL: '1',
  VERCEL_ENV: 'production',
  BACKY_DATA_MODE: 'database',
  POSTGRES_URL: 'postgres://guard-secret@db.example/backy',
  BACKY_ADMIN_API_KEY: 'guard-admin-api-key',
  BACKY_ADMIN_SECRET_KEY: 'guard-admin-secret-key',
  CRON_SECRET: 'guard-cron-secret',
  NEXT_PUBLIC_BACKY_ADMIN_APP_URL: 'https://admin.example.com',
  BACKY_CORS_ALLOWED_ORIGINS: 'https://admin.example.com',
  BACKY_ADMIN_TRUSTED_ORIGINS: 'https://admin.example.com',
});
assert(
  passingWithVercelPostgresAlias.status === 0,
  `Expected Vercel Marketplace Postgres alias to pass, got ${passingWithVercelPostgresAlias.status}: ${passingWithVercelPostgresAlias.stderr}`,
);
assert(
  !passingWithVercelPostgresAlias.stderr.includes('postgres://guard-secret') &&
    !passingWithVercelPostgresAlias.stdout.includes('postgres://guard-secret'),
  'Guard pass output must not print configured Vercel Marketplace Postgres alias values',
);

const productionFixture = {
  ...baseEnv, VERCEL: '1', VERCEL_ENV: 'production', BACKY_DATA_MODE: 'database',
  BACKY_DATABASE_URL: 'postgres://guard-secret@db.example/backy',
  BACKY_ADMIN_API_KEY: 'guard-admin-api-key', BACKY_ADMIN_SECRET_KEY: 'guard-admin-secret-key',
  CRON_SECRET: 'guard-cron-secret', NEXT_PUBLIC_BACKY_ADMIN_APP_URL: 'https://admin.example.com/editor',
  BACKY_CORS_ALLOWED_ORIGINS: 'https://www.example.com',
  BACKY_ADMIN_TRUSTED_ORIGINS: 'https://admin.example.com',
};
for (const value of [
  undefined, '', ' ', '*', 'https://*.example.com', 'null', 'https://admin.example.com/',
  'https://admin.example.com/path', 'https://admin.example.com?', 'https://admin.example.com#',
  'https://user:password@admin.example.com', 'https://admin.example.com\\evil',
  'https://admin.example.com,', ',https://admin.example.com',
  'https://admin.example.com,not-an-origin', 'https://admin.example.com other',
  'https://www.example.com', 'https://content.example.com',
]) {
  const result = runGuard({ ...productionFixture, BACKY_ADMIN_TRUSTED_ORIGINS: value });
  assert(result.status === 1, 'Missing, invalid or mismatched admin trust must reject production');
  assert(result.stderr.includes('BACKY_ADMIN_TRUSTED_ORIGINS'), 'Failure identifies the server key');
  assert(!result.stderr.includes('guard-secret') && !result.stderr.includes('user:password'), 'Failure must not print configured values');
}
for (const value of ['https://admin.example.com', ' https://ADMIN.example.com:443 , https://studio.example.com ']) {
  const result = runGuard({ ...productionFixture, BACKY_ADMIN_TRUSTED_ORIGINS: value });
  assert(result.status === 0, 'Strict configured admin origin must pass, independent of public CORS');
  assert(result.stdout.includes('still requires runtime proof'), 'Local config pass retains runtime proof boundary');
}
for (const key of ['NEXT_PUBLIC_BACKY_ADMIN_TRUSTED_ORIGINS', 'VITE_BACKY_ADMIN_TRUSTED_ORIGINS']) {
  for (const value of ['', 'https://admin.example.com']) {
    const result = runGuard({ ...productionFixture, [key]: value });
    assert(result.status === 1 && result.stderr.includes(`${key} must not be configured`), 'Exposed trust aliases must reject production even when empty');
  }
  const aliasOnly = { ...productionFixture, [key]: 'https://admin.example.com' };
  delete aliasOnly.BACKY_ADMIN_TRUSTED_ORIGINS;
  const result = runGuard(aliasOnly);
  assert(result.status === 1 && result.stderr.includes('BACKY_ADMIN_TRUSTED_ORIGINS must be configured'), 'Exposed alias cannot satisfy the server key requirement');
}
for (const value of ['not-a-url', 'https://user:password@admin.example.com', 'https://admin.example.com\\evil', 'javascript:alert(1)']) {
  const result = runGuard({ ...productionFixture, NEXT_PUBLIC_BACKY_ADMIN_APP_URL: value });
  assert(result.status === 1 && result.stderr.includes('NEXT_PUBLIC_BACKY_ADMIN_APP_URL must be a valid'), 'Malformed declared admin URL must reject production');
  assert(!result.stderr.includes(value), 'Malformed admin URL is not printed');
}
const sameOriginBackend = runGuard({ ...productionFixture, NEXT_PUBLIC_BACKY_ADMIN_APP_URL: 'https://content.example.com/editor', BACKY_ADMIN_TRUSTED_ORIGINS: 'https://content.example.com' });
assert(sameOriginBackend.status === 0, 'Declared same-origin backend/admin deployment can pass with explicit matching origin');

// These are the exact policies used by preview readiness. Metadata does not
// parse values or imply runtime trust: even an invalid value has a name.
const backendPolicy = adminOriginProjectEnvPolicy('backy-public');
assert(backendPolicy.required.includes('BACKY_ADMIN_TRUSTED_ORIGINS'), 'Backend metadata requires the server key');
assert(outputContainsEnvName('BACKY_ADMIN_TRUSTED_ORIGINS Encrypted Production', backendPolicy.required[0]), 'Vercel name metadata finds the required key');
assert(outputContainsEnvName('BACKY_ADMIN_TRUSTED_ORIGINS invalid-value Preview', backendPolicy.required[0]), 'Metadata presence explicitly does not validate values or target assignment');
for (const app of ['backy-public', 'backy-admin', 'custom-frontend']) {
  const policy = adminOriginProjectEnvPolicy(app);
  for (const name of ['NEXT_PUBLIC_BACKY_ADMIN_TRUSTED_ORIGINS', 'VITE_BACKY_ADMIN_TRUSTED_ORIGINS']) {
    assert(policy.forbidden.includes(name), 'Every project rejects exposed authority aliases');
    assert(outputContainsEnvName(`${name} Encrypted Production`, name), 'Forbidden metadata name is detectable');
    assert(!outputContainsEnvName(`${name}_OTHER Encrypted Production`, name), 'Unrelated metadata suffix does not match');
    assert(!outputContainsEnvName(`OTHER_${name} Encrypted Production`, name), 'Unrelated metadata prefix does not match');
  }
  if (app !== 'backy-public') assert(policy.forbidden.includes('BACKY_ADMIN_TRUSTED_ORIGINS') && policy.required.length === 0, 'Admin/custom frontend cannot own server origin authority');
}

console.log(`Backy public production env guard smoke passed: ${checks} checks (synthetic local config only).`);
