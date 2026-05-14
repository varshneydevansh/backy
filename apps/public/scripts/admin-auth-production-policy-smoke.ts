import assert from 'node:assert/strict';
import {
  assertProductionAdminLocalAuthAllowed,
  isProductionAdminLocalAuthAllowed,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
} from '../src/lib/admin-auth/productionPolicy';

assert.equal(
  isProductionAdminLocalAuthAllowed({ NODE_ENV: 'development' }),
  true,
  'Development should allow local admin auth',
);

assert.equal(
  isProductionAdminLocalAuthAllowed({ NODE_ENV: 'production' }),
  false,
  'Production should block local admin auth by default',
);

assert.equal(
  isProductionAdminLocalAuthAllowed({
    NODE_ENV: 'production',
    BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH: 'true',
  }),
  true,
  'Production local admin auth should require an explicit allow flag',
);

assert.throws(
  () => assertProductionAdminLocalAuthAllowed({ NODE_ENV: 'production' }),
  (error: unknown) => error instanceof Error
    && error.message === PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE,
  'Production local admin auth assertion should fail closed',
);

assert.doesNotThrow(
  () => assertProductionAdminLocalAuthAllowed({
    NODE_ENV: 'production',
    BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH: '1',
  }),
  'Production local admin auth assertion should honor the allow flag',
);

assert.equal(
  PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE,
  'ADMIN_AUTH_SESSION_BACKEND_NOT_CONFIGURED',
  'Production local admin auth failures should expose a stable API error code',
);

console.log(JSON.stringify({
  ok: true,
  cases: 6,
}));
