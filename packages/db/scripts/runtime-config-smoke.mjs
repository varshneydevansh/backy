#!/usr/bin/env node

import {
  createDemoAdapter,
  isBackyDemoModeEnabled,
  resolveBackyDataRuntimeConfig,
} from '../dist/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const databaseConfig = resolveBackyDataRuntimeConfig({
  BACKY_DATA_MODE: 'database',
  BACKY_DATABASE_TYPE: 'postgres',
  BACKY_DATABASE_URL: 'postgres://user:pass@localhost:5432/backy',
});
assert(databaseConfig.mode === 'database', 'Expected explicit database mode');
assert(databaseConfig.database?.type === 'postgres', 'Expected postgres database type');
assert(databaseConfig.database?.url === 'postgres://user:pass@localhost:5432/backy', 'Expected database URL');

const sqliteConfig = resolveBackyDataRuntimeConfig({
  BACKY_DATA_MODE: 'database',
  BACKY_DATABASE_TYPE: 'sqlite',
  BACKY_DATABASE_PATH: './backy.db',
});
assert(sqliteConfig.database?.type === 'sqlite', 'Expected sqlite database type');
assert(sqliteConfig.database?.path === './backy.db', 'Expected sqlite database path');

const vercelPostgresConfig = resolveBackyDataRuntimeConfig({
  BACKY_DATA_MODE: 'database',
  POSTGRES_URL: 'postgres://user:pass@vercel-marketplace.example:5432/backy',
});
assert(vercelPostgresConfig.mode === 'database', 'Expected Vercel Marketplace Postgres alias database mode');
assert(vercelPostgresConfig.database?.type === 'postgres', 'Expected Vercel Marketplace Postgres alias type');
assert(
  vercelPostgresConfig.database?.url === 'postgres://user:pass@vercel-marketplace.example:5432/backy',
  'Expected Vercel Marketplace Postgres alias URL',
);

const demoConfig = resolveBackyDataRuntimeConfig({
  BACKY_DATA_MODE: 'demo',
});
assert(demoConfig.mode === 'demo', 'Expected explicit demo mode');
assert(isBackyDemoModeEnabled({ BACKY_DEMO_MODE: 'true' }), 'Expected legacy demo flag support');

const demoAdapter = createDemoAdapter({ enabled: true, reason: 'smoke' });
assert(demoAdapter.type === 'demo' && demoAdapter.isEnabled(), 'Expected demo adapter marker');

let blockedDemo = false;
try {
  createDemoAdapter({ enabled: false });
} catch {
  blockedDemo = true;
}
assert(blockedDemo, 'Expected disabled demo adapter creation to fail');

let missingDatabaseUrl = false;
try {
  resolveBackyDataRuntimeConfig({
    BACKY_DATA_MODE: 'database',
    BACKY_DATABASE_TYPE: 'postgres',
  });
} catch {
  missingDatabaseUrl = true;
}
assert(missingDatabaseUrl, 'Expected database mode without URL to fail');

let invalidMode = false;
try {
  resolveBackyDataRuntimeConfig({
    BACKY_DATA_MODE: 'mock',
  });
} catch {
  invalidMode = true;
}
assert(invalidMode, 'Expected invalid data mode to fail');

console.log('Backy runtime config smoke passed');
