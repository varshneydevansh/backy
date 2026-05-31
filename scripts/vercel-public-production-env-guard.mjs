#!/usr/bin/env node

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const valueFor = (key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
};

const truthyEnv = (key) => TRUE_VALUES.has(valueFor(key).toLowerCase());

const isVercelProduction =
  valueFor('VERCEL') === '1' &&
  valueFor('VERCEL_ENV') === 'production';

if (!isVercelProduction && !truthyEnv('BACKY_REQUIRE_PUBLIC_PRODUCTION_ENV')) {
  console.log('Backy public production env guard skipped outside Vercel production.');
  process.exit(0);
}

const failures = [];

if (valueFor('BACKY_DATA_MODE') !== 'database') {
  failures.push('BACKY_DATA_MODE must be set to database');
}

if (!valueFor('BACKY_DATABASE_URL') && !valueFor('DATABASE_URL')) {
  failures.push('BACKY_DATABASE_URL or DATABASE_URL must be configured');
}

for (const key of [
  'BACKY_ADMIN_API_KEY',
  'BACKY_ADMIN_SECRET_KEY',
  'CRON_SECRET',
  'NEXT_PUBLIC_BACKY_ADMIN_APP_URL',
  'BACKY_CORS_ALLOWED_ORIGINS',
]) {
  if (!valueFor(key)) {
    failures.push(`${key} must be configured`);
  }
}

for (const key of [
  'BACKY_ALLOW_PRODUCTION_DEMO_MODE',
  'BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH',
]) {
  if (truthyEnv(key)) {
    failures.push(`${key} must not be enabled for production release builds`);
  }
}

if (failures.length > 0) {
  console.error('Backy public production env guard failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('');
  console.error('Configure these as server-side Vercel Production env on backy-public before deploying production.');
  console.error('Do not put database/admin/cron/provider secrets on backy-admin or in any VITE_* variable.');
  process.exit(1);
}

console.log('Backy public production env guard passed.');
