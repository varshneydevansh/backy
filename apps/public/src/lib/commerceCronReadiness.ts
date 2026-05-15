import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const COMMERCE_RECONCILIATION_CRON_PATH = '/api/admin/commerce/reconcile?limit=100';
export const COMMERCE_RECONCILIATION_CRON_SCHEDULE = '0 3 * * *';
export const COMMERCE_CRON_READINESS_SCHEMA_VERSION = 'backy.commerce-cron-readiness.v1';

export interface CommerceCronReadiness {
  schemaVersion: typeof COMMERCE_CRON_READINESS_SCHEMA_VERSION;
  ready: boolean;
  entrypoint: string;
  schedule: string;
  authorizationMode: 'vercel-cron-bearer-admin-key';
  vercelCronConfigured: boolean;
  cronSecretConfigured: boolean;
  environmentAdminKeyConfigured: boolean;
  cronSecretMatchesAdminKey: boolean;
  missing: string[];
  checkedAt: string;
}

const readVercelJson = (): Record<string, unknown> | null => {
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, 'vercel.json');
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      } catch {
        return null;
      }
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
};

const hasCommerceCronEntry = (vercelConfig: Record<string, unknown> | null): boolean => {
  const crons = Array.isArray(vercelConfig?.crons) ? vercelConfig.crons : [];
  return crons.some((entry) => (
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    (entry as { path?: unknown }).path === COMMERCE_RECONCILIATION_CRON_PATH &&
    (entry as { schedule?: unknown }).schedule === COMMERCE_RECONCILIATION_CRON_SCHEDULE
  ));
};

export const getCommerceCronReadiness = (): CommerceCronReadiness => {
  const cronSecret = process.env.CRON_SECRET?.trim() || '';
  const environmentAdminKeys = [
    process.env.BACKY_ADMIN_API_KEY?.trim() || '',
    process.env.BACKY_ADMIN_SECRET_KEY?.trim() || '',
  ].filter(Boolean);
  const vercelCronConfigured = hasCommerceCronEntry(readVercelJson());
  const cronSecretConfigured = Boolean(cronSecret);
  const environmentAdminKeyConfigured = environmentAdminKeys.length > 0;
  const cronSecretMatchesAdminKey = cronSecretConfigured && environmentAdminKeys.includes(cronSecret);
  const missing = [
    ...(vercelCronConfigured ? [] : ['vercel.json commerce reconciliation cron']),
    ...(cronSecretConfigured ? [] : ['CRON_SECRET']),
    ...(environmentAdminKeyConfigured ? [] : ['BACKY_ADMIN_API_KEY or BACKY_ADMIN_SECRET_KEY']),
    ...(cronSecretConfigured && environmentAdminKeyConfigured && !cronSecretMatchesAdminKey
      ? ['CRON_SECRET must match BACKY_ADMIN_API_KEY or BACKY_ADMIN_SECRET_KEY']
      : []),
  ];

  return {
    schemaVersion: COMMERCE_CRON_READINESS_SCHEMA_VERSION,
    ready: missing.length === 0,
    entrypoint: COMMERCE_RECONCILIATION_CRON_PATH,
    schedule: COMMERCE_RECONCILIATION_CRON_SCHEDULE,
    authorizationMode: 'vercel-cron-bearer-admin-key',
    vercelCronConfigured,
    cronSecretConfigured,
    environmentAdminKeyConfigured,
    cronSecretMatchesAdminKey,
    missing,
    checkedAt: new Date().toISOString(),
  };
};
