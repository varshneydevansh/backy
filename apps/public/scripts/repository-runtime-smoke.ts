import assert from 'node:assert/strict';
import {
  assertProductionDemoModeAllowed,
  shouldUseDemoStoreFallback,
} from '../src/lib/repositoryRuntimePolicy';

assert.equal(
  shouldUseDemoStoreFallback({ NODE_ENV: 'development' }),
  true,
  'Development without database config should use demo fallback',
);

assert.equal(
  shouldUseDemoStoreFallback({ NODE_ENV: 'production' }),
  false,
  'Production without database config should fail closed instead of using demo fallback',
);

assert.equal(
  shouldUseDemoStoreFallback({ NODE_ENV: 'production', BACKY_DATA_MODE: 'demo' }),
  false,
  'Production explicit demo mode should require an allow flag',
);

assert.equal(
  shouldUseDemoStoreFallback({
    NODE_ENV: 'production',
    BACKY_DATA_MODE: 'demo',
    BACKY_ALLOW_PRODUCTION_DEMO_MODE: 'true',
  }),
  true,
  'Production demo mode should work only with an explicit allow flag',
);

assert.equal(
  shouldUseDemoStoreFallback({ NODE_ENV: 'production', BACKY_DEMO_MODE: 'yes' }),
  false,
  'Legacy demo mode should also fail closed in production',
);

assert.equal(
  shouldUseDemoStoreFallback({
    NODE_ENV: 'production',
    BACKY_DEMO_MODE: 'yes',
    BACKY_ALLOW_PRODUCTION_DEMO_MODE: '1',
  }),
  true,
  'Legacy demo mode should honor the production allow flag',
);

assert.equal(
  shouldUseDemoStoreFallback({
    NODE_ENV: 'production',
    BACKY_DATABASE_URL: 'postgres://user:pass@localhost:5432/backy',
  }),
  false,
  'Production database config should use repositories',
);

assert.throws(
  () => assertProductionDemoModeAllowed('demo', { NODE_ENV: 'production', BACKY_DATA_MODE: 'demo' }),
  /BACKY_ALLOW_PRODUCTION_DEMO_MODE=true/,
  'Runtime policy should reject production demo mode without the allow flag',
);

assert.doesNotThrow(
  () => assertProductionDemoModeAllowed('demo', {
    NODE_ENV: 'production',
    BACKY_DATA_MODE: 'demo',
    BACKY_ALLOW_PRODUCTION_DEMO_MODE: 'true',
  }),
  'Runtime policy should allow intentional production demo deployments',
);

console.log('Public repository runtime smoke passed');
