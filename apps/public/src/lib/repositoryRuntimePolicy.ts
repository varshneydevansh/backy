type BackyDataMode = 'database' | 'demo';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const truthyEnv = (value: string | undefined): boolean => (
  TRUE_VALUES.has((value || '').trim().toLowerCase())
);

export const productionDemoFallbackAllowed = (env: Record<string, string | undefined>): boolean => (
  env.NODE_ENV !== 'production' || truthyEnv(env.BACKY_ALLOW_PRODUCTION_DEMO_MODE)
);

export function assertProductionDemoModeAllowed(
  mode: BackyDataMode,
  env: Record<string, string | undefined>,
): void {
  if (mode === 'demo' && !productionDemoFallbackAllowed(env)) {
    throw new Error('Production demo mode requires BACKY_ALLOW_PRODUCTION_DEMO_MODE=true.');
  }
}

export function shouldUseDemoStoreFallback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const explicitMode = env.BACKY_DATA_MODE;
  if (explicitMode === 'demo') {
    return productionDemoFallbackAllowed(env);
  }
  if (explicitMode === 'database') {
    return false;
  }
  if (truthyEnv(env.BACKY_DEMO_MODE)) {
    return productionDemoFallbackAllowed(env);
  }
  if (env.BACKY_DATABASE_URL || env.DATABASE_URL || env.BACKY_DATABASE_TYPE) {
    return false;
  }
  return env.NODE_ENV !== 'production';
}
