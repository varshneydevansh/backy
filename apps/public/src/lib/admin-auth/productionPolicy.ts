const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const truthyEnv = (value: string | undefined): boolean => (
  TRUE_VALUES.has((value || '').trim().toLowerCase())
);

export const PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_CODE = 'ADMIN_AUTH_SESSION_BACKEND_NOT_CONFIGURED';

export const PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE = 'Production local admin auth is disabled. Configure a persistent session backend or set BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH=true for an intentional local-auth deployment.';

export const isProductionAdminLocalAuthAllowed = (
  env: Record<string, string | undefined> = process.env,
): boolean => (
  env.NODE_ENV !== 'production' || truthyEnv(env.BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH)
);

export function assertProductionAdminLocalAuthAllowed(
  env: Record<string, string | undefined> = process.env,
): void {
  if (!isProductionAdminLocalAuthAllowed(env)) {
    throw new Error(PRODUCTION_ADMIN_LOCAL_AUTH_ERROR_MESSAGE);
  }
}
