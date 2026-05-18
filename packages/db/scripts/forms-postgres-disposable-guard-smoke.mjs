#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const smokePath = fileURLToPath(new URL('./forms-postgres-smoke.mjs', import.meta.url));
const baseEnv = {
  ...process.env,
  BACKY_FORMS_POSTGRES_SMOKE_SELF_TEST: '1',
  BACKY_DATABASE_URL: 'postgresql://user:pass@example.test:5432/backy_disposable_guard',
  DATABASE_URL: '',
  BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST: '',
  BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE: '',
};

const withoutConfirmation = spawnSync(process.execPath, [smokePath], {
  env: {
    ...baseEnv,
    BACKY_DATABASE_DISPOSABLE_CONFIRMED: '',
  },
  encoding: 'utf8',
});

if (withoutConfirmation.status === 0) {
  throw new Error('Forms Postgres smoke must fail when BACKY_DATABASE_DISPOSABLE_CONFIRMED is missing.');
}

const missingConfirmationOutput = `${withoutConfirmation.stdout}\n${withoutConfirmation.stderr}`;
if (!missingConfirmationOutput.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true is required')) {
  throw new Error(`Forms Postgres smoke missing confirmation failure message: ${missingConfirmationOutput}`);
}

const withConfirmation = spawnSync(process.execPath, [smokePath], {
  env: {
    ...baseEnv,
    BACKY_DATABASE_DISPOSABLE_CONFIRMED: 'true',
  },
  encoding: 'utf8',
});

if (withConfirmation.status !== 0) {
  throw new Error(`Forms Postgres smoke self-test should pass with disposable confirmation: ${withConfirmation.stdout}\n${withConfirmation.stderr}`);
}

if (!withConfirmation.stdout.includes('"mode":"forms-postgres-smoke-self-test"')) {
  throw new Error(`Forms Postgres smoke self-test did not exit before schema work: ${withConfirmation.stdout}`);
}

console.log(JSON.stringify({
  ok: true,
  guard: 'forms-postgres-disposable-confirmation',
}));
