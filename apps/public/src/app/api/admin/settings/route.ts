/**
 * Admin platform settings endpoint.
 *
 * GET   /api/admin/settings
 * PATCH /api/admin/settings
 * POST  /api/admin/settings with { action: "regenerate-api-keys" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminSettings, regenerateAdminApiKeys, updateAdminSettings } from '@/lib/backyStore';
import { getMediaStorageAdapter, getMediaStorageConfigSummary } from '@/lib/mediaStorage';
import { resolveMediaScannerConfig } from '@/lib/mediaSafety';
import {
  getRequiredDatabaseRepositories,
  resolvePublicRepositoryRuntimeConfig,
  shouldUseDemoStoreFallback,
} from '@/lib/repositoryRuntime';
import type { BackyJsonObject, BackySettings } from '@backy-cms/core';

export const runtime = 'nodejs';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeDeliveryMode = (value: unknown): 'managed-hosting' | 'custom-frontend' | null => (
  value === 'managed-hosting' || value === 'custom-frontend' ? value : null
);

const envValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const boolValue = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const stringValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const numberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const inferSupabaseProjectRef = (url: string): string => {
  try {
    const host = new URL(url).host;
    return host.endsWith('.supabase.co') ? host.replace('.supabase.co', '') : '';
  } catch {
    return '';
  }
};

const getDatabaseRuntimeSummary = () => {
  if (shouldUseDemoStoreFallback()) {
    return {
      mode: 'demo',
      provider: 'local-json',
      configured: true,
      missing: [] as string[],
      note: 'Backy is using local JSON persistence in this environment.',
    };
  }

  try {
    const config = resolvePublicRepositoryRuntimeConfig();
    const database = config.database;
    const url = database?.url;
    const host = url ? new URL(url).host : undefined;

    return {
      mode: config.mode,
      provider: database?.type || 'unknown',
      configured: config.mode === 'database' && Boolean(database?.path || database?.url),
      host,
      database: database?.name,
      path: database?.type === 'sqlite' ? database.path : undefined,
      logging: Boolean(database?.logging),
      missing: config.mode === 'database' && !database?.path && !database?.url
        ? ['BACKY_DATABASE_URL or DATABASE_URL']
        : [] as string[],
    };
  } catch (error) {
    return {
      mode: 'database',
      provider: 'unknown',
      configured: false,
      missing: ['BACKY_DATABASE_TYPE', 'BACKY_DATABASE_URL or DATABASE_URL'],
      error: error instanceof Error ? error.message : 'Unable to resolve database runtime.',
    };
  }
};

const getSupabaseRuntimeSummary = () => {
  const url = envValue(['BACKY_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const anonKey = envValue(['BACKY_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  const serviceKey = envValue(['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  const bucket = envValue(['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET']);
  const databaseUrl = envValue(['BACKY_DATABASE_URL', 'DATABASE_URL']);
  const missing = [
    !url ? 'BACKY_SUPABASE_URL or SUPABASE_URL' : '',
    !anonKey && !serviceKey ? 'Supabase API key' : '',
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    projectUrl: url,
    projectRef: inferSupabaseProjectRef(url),
    anonKeyConfigured: Boolean(anonKey),
    serviceRoleConfigured: Boolean(serviceKey),
    databaseUrlConfigured: Boolean(databaseUrl),
    storageBucket: bucket,
    missing,
  };
};

const getVercelRuntimeSummary = () => {
  const projectId = envValue(['VERCEL_PROJECT_ID', 'BACKY_VERCEL_PROJECT_ID']);
  const teamId = envValue(['VERCEL_TEAM_ID', 'BACKY_VERCEL_TEAM_ID']);
  const url = envValue(['VERCEL_URL', 'BACKY_PUBLIC_APP_URL']);
  const env = envValue(['VERCEL_ENV']);
  const token = envValue(['VERCEL_TOKEN', 'BACKY_VERCEL_TOKEN']);
  const onVercel = process.env.VERCEL === '1' || Boolean(url);

  return {
    configured: onVercel || Boolean(projectId),
    onVercel,
    projectId,
    teamId,
    url,
    environment: env,
    tokenConfigured: Boolean(token),
    missing: onVercel || projectId ? [] : ['VERCEL_PROJECT_ID or VERCEL runtime'],
  };
};

const getMediaScannerRuntimeSummary = () => {
  try {
    const config = resolveMediaScannerConfig();
    const endpointConfigured = Boolean(config.endpoint);
    const missing = config.provider === 'http' && !endpointConfigured
      ? ['BACKY_MEDIA_SCAN_ENDPOINT or BACKY_MEDIA_SCANNER_ENDPOINT']
      : [];

    return {
      provider: config.provider,
      enabled: config.provider !== 'none',
      configured: config.provider === 'none' || missing.length === 0,
      endpointConfigured,
      host: config.host,
      port: config.port,
      apiKeyConfigured: Boolean(config.apiKey),
      timeoutMs: config.timeoutMs,
      failOpen: config.failOpen,
      missing,
    };
  } catch (error) {
    const provider = envValue(['BACKY_MEDIA_SCAN_PROVIDER', 'BACKY_MEDIA_SCANNER_PROVIDER']) || 'unknown';
    return {
      provider,
      enabled: provider !== 'none' && provider !== 'off' && provider !== 'disabled',
      configured: false,
      endpointConfigured: Boolean(envValue(['BACKY_MEDIA_SCAN_ENDPOINT', 'BACKY_MEDIA_SCANNER_ENDPOINT'])),
      host: envValue(['BACKY_MEDIA_SCAN_HOST', 'BACKY_MEDIA_SCANNER_HOST', 'BACKY_CLAMAV_HOST', 'CLAMD_HOST']),
      port: numberValue(envValue(['BACKY_MEDIA_SCAN_PORT', 'BACKY_MEDIA_SCANNER_PORT', 'BACKY_CLAMAV_PORT', 'CLAMD_PORT']), 3310),
      apiKeyConfigured: Boolean(envValue(['BACKY_MEDIA_SCAN_API_KEY', 'BACKY_MEDIA_SCANNER_API_KEY'])),
      timeoutMs: numberValue(envValue(['BACKY_MEDIA_SCAN_TIMEOUT_MS', 'BACKY_MEDIA_SCANNER_TIMEOUT_MS']), 5000),
      failOpen: ['1', 'true', 'yes', 'on'].includes(envValue(['BACKY_MEDIA_SCAN_FAIL_OPEN', 'BACKY_MEDIA_SCANNER_FAIL_OPEN']).toLowerCase()),
      missing: ['BACKY_MEDIA_SCAN_PROVIDER=http or none'],
      error: error instanceof Error ? error.message : 'Unable to resolve media scanner runtime.',
    };
  }
};

const toAdminSettings = (settings: BackySettings) => ({
  deliveryMode: settings.deliveryMode === 'custom-frontend' ? 'custom-frontend' : 'managed-hosting',
  apiKeys: {
    publicApiKey: settings.apiKeys.publicKey || '',
    adminApiKey: settings.apiKeys.secretKeyId || '',
  },
  storage: settings.storage || {},
  runtimeStorage: getMediaStorageConfigSummary(),
  auth: settings.auth || {},
  integrations: settings.integrations || {},
  runtimeDatabase: getDatabaseRuntimeSummary(),
  runtimeSupabase: getSupabaseRuntimeSummary(),
  runtimeMediaScanner: getMediaScannerRuntimeSummary(),
  runtimeVercel: getVercelRuntimeSummary(),
  updatedAt: settings.updatedAt,
});

const parseJsonObject = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : undefined
);

const normalizeInfrastructureIntegrations = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }

  const supabase = parseJsonObject(input.supabase) || {};
  const storage = parseJsonObject(input.storage) || {};
  const vercel = parseJsonObject(input.vercel) || {};
  const commerce = parseJsonObject(input.commerce) || {};
  const commerceMode = stringValue(commerce.mode);
  const paymentProvider = stringValue(commerce.paymentProvider);
  const providerMode = stringValue(commerce.providerMode);
  const reconciliationMode = stringValue(commerce.reconciliationMode);

  return {
    ...input,
    supabase: {
      projectUrl: stringValue(supabase.projectUrl),
      projectRef: stringValue(supabase.projectRef) || inferSupabaseProjectRef(stringValue(supabase.projectUrl)),
      databaseEnabled: boolValue(supabase.databaseEnabled),
      storageEnabled: boolValue(supabase.storageEnabled),
      authEnabled: boolValue(supabase.authEnabled),
    },
    storage: {
      provider: stringValue(storage.provider),
      bucket: stringValue(storage.bucket),
      publicBaseUrl: stringValue(storage.publicBaseUrl),
      pathPrefix: stringValue(storage.pathPrefix),
      privateFilesEnabled: boolValue(storage.privateFilesEnabled),
      imageTransformsEnabled: boolValue(storage.imageTransformsEnabled, true),
    },
    vercel: {
      projectId: stringValue(vercel.projectId),
      teamSlug: stringValue(vercel.teamSlug),
      productionDomain: stringValue(vercel.productionDomain),
      autoDeploy: boolValue(vercel.autoDeploy),
      previewDeployments: boolValue(vercel.previewDeployments, true),
    },
    commerce: {
      mode: ['catalog-only', 'manual-orders', 'checkout-provider'].includes(commerceMode)
        ? commerceMode
        : 'catalog-only',
      currency: stringValue(commerce.currency).toUpperCase().slice(0, 3),
      paymentProvider: ['none', 'stripe', 'manual'].includes(paymentProvider)
        ? paymentProvider
        : 'none',
      providerMode: providerMode === 'live' ? 'live' : 'test',
      providerAccountId: stringValue(commerce.providerAccountId),
      providerWebhookUrl: stringValue(commerce.providerWebhookUrl),
      providerWebhookSecretId: stringValue(commerce.providerWebhookSecretId),
      providerWebhookEvents: stringValue(commerce.providerWebhookEvents),
      reconciliationMode: ['manual', 'webhook', 'scheduled'].includes(reconciliationMode)
        ? reconciliationMode
        : 'manual',
      reconciliationWindowHours: Math.max(1, Math.min(720, Math.round(numberValue(commerce.reconciliationWindowHours, 24)))),
      checkoutSuccessPath: stringValue(commerce.checkoutSuccessPath),
      checkoutCancelPath: stringValue(commerce.checkoutCancelPath),
      guestCheckout: boolValue(commerce.guestCheckout, true),
      taxEnabled: boolValue(commerce.taxEnabled),
      shippingEnabled: boolValue(commerce.shippingEnabled),
      discountsEnabled: boolValue(commerce.discountsEnabled),
      taxRatePercent: Math.max(0, Math.min(100, numberValue(commerce.taxRatePercent, 8.25))),
      digitalTaxRatePercent: Math.max(0, Math.min(100, numberValue(commerce.digitalTaxRatePercent, 6))),
      shippingBaseAmount: Math.max(0, numberValue(commerce.shippingBaseAmount, 8)),
      shippingWeightRate: Math.max(0, numberValue(commerce.shippingWeightRate, 1.25)),
      discountPercent: Math.max(0, Math.min(100, numberValue(commerce.discountPercent, 10))),
      inventoryReservations: boolValue(commerce.inventoryReservations, true),
      reservationMinutes: Math.max(1, Math.min(1440, Math.round(numberValue(commerce.reservationMinutes, 15)))),
      webhookEventsEnabled: boolValue(commerce.webhookEventsEnabled),
    },
  };
};

const isMediaStorageSettingsPatch = (body: Record<string, unknown>): boolean => {
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length === 0 || bodyKeys.some((key) => key !== 'deliveryMode' && key !== 'integrations')) {
    return false;
  }

  const integrations = parseJsonObject(body.integrations);
  if (!integrations) {
    return false;
  }

  const integrationKeys = Object.keys(integrations);
  return integrationKeys.length > 0 && integrationKeys.every((key) => key === 'storage' || key === 'supabase');
};

const isMediaStorageInfrastructureCheck = (body: Record<string, unknown>): boolean => {
  if (body.action !== 'validate-infrastructure') {
    return false;
  }

  const bodyKeys = Object.keys(body);
  if (bodyKeys.some((key) => key !== 'action' && key !== 'deliveryMode' && key !== 'integrations')) {
    return false;
  }

  return isMediaStorageSettingsPatch({
    ...(body.deliveryMode !== undefined ? { deliveryMode: body.deliveryMode } : {}),
    integrations: body.integrations,
  });
};

const mergeMediaStorageIntegrations = (
  current: unknown,
  patch: unknown,
): BackyJsonObject | undefined => {
  const currentIntegrations = parseJsonObject(current) || {};
  const patchIntegrations = parseJsonObject(patch);
  if (!patchIntegrations) {
    return undefined;
  }

  const normalized = normalizeInfrastructureIntegrations({
    ...currentIntegrations,
    ...patchIntegrations,
  });
  if (!normalized) {
    return undefined;
  }

  return {
    ...currentIntegrations,
    ...(parseJsonObject(normalized.storage) ? { storage: normalized.storage } : {}),
    ...(parseJsonObject(normalized.supabase) ? { supabase: normalized.supabase } : {}),
  };
};

type InfrastructureDiagnosticStatus = 'ready' | 'warning' | 'blocked';

interface InfrastructureCheckInput {
  deliveryMode: 'managed-hosting' | 'custom-frontend';
  integrations: BackyJsonObject;
  runtimeDatabase: ReturnType<typeof getDatabaseRuntimeSummary>;
  runtimeStorage: ReturnType<typeof getMediaStorageConfigSummary>;
  runtimeSupabase: ReturnType<typeof getSupabaseRuntimeSummary>;
  runtimeVercel: ReturnType<typeof getVercelRuntimeSummary>;
}

type StorageProvisioningStatus = 'ready' | 'blocked';

interface StorageProvisioningCheck {
  label: string;
  ready: boolean;
  detail: string;
}

const makeInfrastructureDiagnostic = (
  area: 'database' | 'storage' | 'supabase' | 'vercel',
  label: string,
  checks: Array<{ label: string; ready: boolean; required: boolean; detail: string }>,
) => {
  const requiredFailures = checks.filter((check) => check.required && !check.ready);
  const optionalFailures = checks.filter((check) => !check.required && !check.ready);
  const status: InfrastructureDiagnosticStatus = requiredFailures.length > 0
    ? 'blocked'
    : optionalFailures.length > 0
      ? 'warning'
      : 'ready';

  return {
    area,
    label,
    status,
    summary: status === 'ready'
      ? `${label} is ready for the selected Backy settings.`
      : status === 'blocked'
        ? `${label} is missing required configuration.`
        : `${label} is usable, but optional production wiring is incomplete.`,
    missing: checks.filter((check) => !check.ready).map((check) => check.label),
    checks,
  };
};

const buildInfrastructureDiagnostics = ({
  deliveryMode,
  integrations,
  runtimeDatabase,
  runtimeStorage,
  runtimeSupabase,
  runtimeVercel,
}: InfrastructureCheckInput) => {
  const storage = parseJsonObject(integrations.storage) || {};
  const supabase = parseJsonObject(integrations.supabase) || {};
  const vercel = parseJsonObject(integrations.vercel) || {};
  const storageProvider = stringValue(storage.provider) || runtimeStorage.provider;
  const storageBucket = stringValue(storage.bucket) || runtimeStorage.bucket || runtimeSupabase.storageBucket;
  const storagePublicBaseUrl = stringValue(storage.publicBaseUrl) || runtimeStorage.publicUrl || '';
  const supabaseProjectUrl = stringValue(supabase.projectUrl) || runtimeSupabase.projectUrl || '';
  const supabaseProjectRef = stringValue(supabase.projectRef) || runtimeSupabase.projectRef || inferSupabaseProjectRef(supabaseProjectUrl);
  const supabaseEnabled = boolValue(supabase.databaseEnabled)
    || boolValue(supabase.storageEnabled)
    || boolValue(supabase.authEnabled)
    || storageProvider === 'supabase';
  const vercelProjectId = stringValue(vercel.projectId) || runtimeVercel.projectId || '';
  const vercelProductionDomain = stringValue(vercel.productionDomain) || runtimeVercel.url || '';

  return [
    makeInfrastructureDiagnostic('database', 'Database runtime', [
      {
        label: 'Persistence runtime',
        ready: Boolean(runtimeDatabase.configured),
        required: true,
        detail: runtimeDatabase.configured
          ? `${runtimeDatabase.provider} persistence is available.`
          : `Missing ${runtimeDatabase.missing.join(', ') || 'database configuration'}.`,
      },
      {
        label: 'Supabase database intent',
        ready: !boolValue(supabase.databaseEnabled) || Boolean(runtimeSupabase.databaseUrlConfigured || runtimeDatabase.configured),
        required: boolValue(supabase.databaseEnabled),
        detail: boolValue(supabase.databaseEnabled)
          ? 'Supabase database is enabled and needs a repository/database runtime.'
          : 'Supabase database is not enabled for this workspace.',
      },
    ]),
    makeInfrastructureDiagnostic('storage', 'Media storage', [
      {
        label: 'Storage provider',
        ready: Boolean(storageProvider),
        required: true,
        detail: storageProvider ? `${storageProvider} is selected.` : 'Choose local, Supabase Storage, or S3-compatible storage.',
      },
      {
        label: 'Storage bucket',
        ready: storageProvider === 'local' || Boolean(storageBucket),
        required: storageProvider !== 'local',
        detail: storageProvider === 'local'
          ? 'Local storage does not require a bucket.'
          : storageBucket
            ? `${storageBucket} will store uploaded files.`
            : 'Set a bucket for Supabase/S3 media uploads.',
      },
      {
        label: 'Public asset URL',
        ready: deliveryMode !== 'custom-frontend' || storageProvider === 'local' || Boolean(storagePublicBaseUrl),
        required: deliveryMode === 'custom-frontend' && storageProvider !== 'local',
        detail: storagePublicBaseUrl
          ? 'Public file URL is configured for custom frontends.'
          : 'Custom frontends need a public base URL for media delivery.',
      },
    ]),
    makeInfrastructureDiagnostic('supabase', 'Supabase connection', [
      {
        label: 'Project URL or ref',
        ready: !supabaseEnabled || Boolean(supabaseProjectUrl || supabaseProjectRef),
        required: supabaseEnabled,
        detail: supabaseProjectUrl || supabaseProjectRef
          ? 'Supabase project metadata is present.'
          : 'Set a Supabase project URL or project ref.',
      },
      {
        label: 'Supabase API key env',
        ready: !supabaseEnabled || Boolean(runtimeSupabase.anonKeyConfigured || runtimeSupabase.serviceRoleConfigured),
        required: supabaseEnabled,
        detail: runtimeSupabase.anonKeyConfigured || runtimeSupabase.serviceRoleConfigured
          ? 'Supabase API key environment is detected.'
          : 'Set BACKY_SUPABASE_ANON_KEY or BACKY_SUPABASE_SERVICE_ROLE_KEY.',
      },
      {
        label: 'Service role for privileged work',
        ready: !boolValue(supabase.databaseEnabled) && !boolValue(supabase.storageEnabled) || Boolean(runtimeSupabase.serviceRoleConfigured),
        required: boolValue(supabase.databaseEnabled) || boolValue(supabase.storageEnabled),
        detail: runtimeSupabase.serviceRoleConfigured
          ? 'Service role key is available server-side.'
          : 'Database/storage writes need a server-only Supabase service role key.',
      },
    ]),
    makeInfrastructureDiagnostic('vercel', 'Vercel deployment', [
      {
        label: 'Project metadata',
        ready: Boolean(vercelProjectId || runtimeVercel.onVercel),
        required: boolValue(vercel.autoDeploy),
        detail: vercelProjectId || runtimeVercel.onVercel
          ? 'Vercel project/runtime metadata is present.'
          : 'Set Vercel project metadata before enabling deploy orchestration.',
      },
      {
        label: 'Production domain',
        ready: deliveryMode !== 'custom-frontend' || Boolean(vercelProductionDomain),
        required: deliveryMode === 'custom-frontend',
        detail: vercelProductionDomain
          ? 'Production domain is configured.'
          : 'Custom frontend mode should expose the production domain.',
      },
      {
        label: 'Deploy token env',
        ready: !boolValue(vercel.autoDeploy) || Boolean(runtimeVercel.tokenConfigured),
        required: boolValue(vercel.autoDeploy),
        detail: runtimeVercel.tokenConfigured
          ? 'Vercel deploy token is detected server-side.'
          : 'Auto deploy needs VERCEL_TOKEN or BACKY_VERCEL_TOKEN.',
      },
    ]),
  ];
};

const storageRotationFields = (provider: string) => {
  if (provider === 's3') {
    return [
      { name: 'BACKY_S3_ACCESS_KEY_ID', secret: true, required: true, detected: Boolean(envValue(['BACKY_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'])) },
      { name: 'BACKY_S3_SECRET_ACCESS_KEY', secret: true, required: true, detected: Boolean(envValue(['BACKY_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'])) },
      { name: 'BACKY_S3_BUCKET', secret: false, required: true, detected: Boolean(envValue(['BACKY_S3_BUCKET', 'BACKY_STORAGE_BUCKET'])) },
      { name: 'BACKY_S3_REGION', secret: false, required: true, detected: Boolean(envValue(['BACKY_S3_REGION', 'AWS_REGION'])) },
      { name: 'BACKY_S3_ENDPOINT', secret: false, required: false, detected: Boolean(envValue(['BACKY_S3_ENDPOINT', 'BACKY_STORAGE_ENDPOINT'])) },
    ];
  }

  if (provider === 'supabase') {
    return [
      { name: 'BACKY_SUPABASE_SERVICE_ROLE_KEY', secret: true, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])) },
      { name: 'BACKY_SUPABASE_ANON_KEY', secret: true, required: false, detected: Boolean(envValue(['BACKY_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'])) },
      { name: 'BACKY_SUPABASE_URL', secret: false, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_URL', 'SUPABASE_URL'])) },
      { name: 'BACKY_SUPABASE_STORAGE_BUCKET', secret: false, required: true, detected: Boolean(envValue(['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET'])) },
    ];
  }

  return [
    { name: 'BACKY_LOCAL_UPLOADS_DIR', secret: false, required: false, detected: Boolean(envValue(['BACKY_LOCAL_UPLOADS_DIR', 'BACKY_STORAGE_LOCAL_PATH'])) },
    { name: 'BACKY_LOCAL_PUBLIC_URL', secret: false, required: false, detected: Boolean(envValue(['BACKY_LOCAL_PUBLIC_URL', 'BACKY_MEDIA_PUBLIC_URL'])) },
  ];
};

const runMediaStorageProvisioningProbe = async (requestId: string) => {
  const summary = getMediaStorageConfigSummary();
  const checks: StorageProvisioningCheck[] = [
    {
      label: 'Runtime configuration',
      ready: summary.configured,
      detail: summary.configured
        ? `${summary.provider} storage runtime is configured.`
        : summary.error || `Missing ${summary.missing.join(', ') || 'storage configuration'}.`,
    },
  ];
  const probePath = `sites/_backy/provisioning/${requestId}.txt`;
  const probeBody = Buffer.from(`backy media storage probe ${requestId}\n`, 'utf8');

  if (!summary.configured) {
    return {
      provider: summary.provider,
      status: 'blocked' as StorageProvisioningStatus,
      summary: 'Storage runtime is not configured enough to run a provisioning probe.',
      runtimeStorage: summary,
      probePath,
      checks,
      rotation: {
        fields: storageRotationFields(summary.provider),
        nextSteps: [
          'Set the missing server environment variables.',
          'Redeploy or restart the Backy runtime.',
          'Run the provisioning probe again before accepting uploads.',
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const adapter = await getMediaStorageAdapter();
    const upload = await adapter.upload(probeBody, {
      path: probePath,
      filename: `${requestId}.txt`,
      mimeType: 'text/plain',
      metadata: {
        source: 'backy-media-storage-provisioning-probe',
        requestId,
      },
    });
    checks.push({
      label: 'Probe upload',
      ready: upload.path === probePath,
      detail: upload.path === probePath
        ? `Probe object uploaded to ${probePath}.`
        : `Probe uploaded to ${upload.path}.`,
    });

    const readBuffer = await adapter.read(probePath);
    checks.push({
      label: 'Readback',
      ready: readBuffer.equals(probeBody),
      detail: readBuffer.equals(probeBody)
        ? 'Probe object was read back with matching bytes.'
        : 'Probe readback bytes did not match the uploaded content.',
    });

    const stat = await adapter.stat(probePath);
    checks.push({
      label: 'Object metadata',
      ready: Boolean(stat && stat.size === probeBody.length),
      detail: stat
        ? `Provider returned object metadata (${stat.size} bytes).`
        : 'Provider did not return object metadata for the probe.',
    });

    const prefix = probePath.split('/').slice(0, -1).join('/');
    const listed = await adapter.list(prefix);
    checks.push({
      label: 'Bucket listing',
      ready: listed.some((item) => item.path === probePath),
      detail: listed.some((item) => item.path === probePath)
        ? 'Provider list operation can see the probe object.'
        : 'Provider list operation did not include the probe object.',
    });

    await adapter.delete(probePath);
    const existsAfterDelete = await adapter.exists(probePath);
    checks.push({
      label: 'Probe cleanup',
      ready: !existsAfterDelete,
      detail: existsAfterDelete
        ? 'Probe object still exists after delete.'
        : 'Probe object cleaned up successfully.',
    });
  } catch (error) {
    checks.push({
      label: 'Provider operation',
      ready: false,
      detail: error instanceof Error ? error.message : 'Storage provider operation failed.',
    });
  }

  const blocked = checks.some((check) => !check.ready);
  return {
    provider: summary.provider,
    status: blocked ? 'blocked' as StorageProvisioningStatus : 'ready' as StorageProvisioningStatus,
    summary: blocked
      ? 'Storage provisioning probe found an operation that needs attention.'
      : 'Storage bucket/path accepts upload, readback, metadata, listing, and cleanup operations.',
    runtimeStorage: summary,
    probePath,
    checks,
    rotation: {
      fields: storageRotationFields(summary.provider),
      nextSteps: [
        'Create the replacement provider credential with bucket read/write/delete scope.',
        'Update server environment variables with the replacement credential.',
        'Redeploy or restart Backy so the runtime picks up the new credential.',
        'Run this provisioning probe, then revoke the old provider credential.',
      ],
    },
    generatedAt: new Date().toISOString(),
  };
};

const sanitizeSettingsAuditSnapshot = (settings: unknown): BackyJsonObject | undefined => {
  const snapshot = parseJsonObject(settings);
  if (!snapshot) {
    return undefined;
  }

  const apiKeys = parseJsonObject(snapshot.apiKeys);
  return {
    ...snapshot,
    apiKeys: {
      publicConfigured: Boolean(apiKeys?.publicKey || apiKeys?.publicApiKey),
      adminConfigured: Boolean(apiKeys?.secretKeyId || apiKeys?.adminApiKey),
      redacted: true,
    },
  };
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'settings.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const settings = await repositories.settings.get();

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings),
        },
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...getAdminSettings(),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const body = await parseJsonBody(request);
  const mediaStoragePatch = isMediaStorageSettingsPatch(body);
  const access = requireAdminAccess(request, requestId, {
    permission: mediaStoragePatch ? 'media.configure' : 'settings.configure',
  });
  if (access instanceof NextResponse) {
    return access;
  }
  if (body.apiKeys !== undefined) {
    const keyAccess = requireAdminAccess(request, requestId, {
      permission: 'settings.manageKeys',
    });
    if (keyAccess instanceof NextResponse) {
      return keyAccess;
    }
  }

  try {
    const deliveryMode = body.deliveryMode === undefined
      ? undefined
      : normalizeDeliveryMode(body.deliveryMode);

    if (body.deliveryMode !== undefined && !deliveryMode) {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'Delivery mode must be managed-hosting or custom-frontend',
        requestId,
      );
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const beforeSettings = await repositories.settings.get();
      const apiKeysInput = body.apiKeys && typeof body.apiKeys === 'object' && !Array.isArray(body.apiKeys)
        ? body.apiKeys as Record<string, unknown>
        : {};
      const storage = parseJsonObject(body.storage);
      const auth = parseJsonObject(body.auth);
      const integrations = mediaStoragePatch
        ? mergeMediaStorageIntegrations(beforeSettings.integrations, body.integrations)
        : normalizeInfrastructureIntegrations(body.integrations) || parseJsonObject(body.integrations);
      const settings = (await repositories.settings.update({
        ...(deliveryMode ? { deliveryMode } : {}),
        apiKeys: {
          ...(typeof apiKeysInput.publicApiKey === 'string' ? { publicKey: apiKeysInput.publicApiKey.trim() } : {}),
          ...(typeof apiKeysInput.adminApiKey === 'string' ? { secretKeyId: apiKeysInput.adminApiKey.trim() } : {}),
        },
        ...(storage ? { storage } : {}),
        ...(auth ? { auth } : {}),
        ...(integrations ? { integrations } : {}),
      })).item;
      await recordAdminAudit({
        repositories,
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.update',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          changedKeys: Object.keys(body).filter((key) => key !== 'apiKeys'),
          apiKeysChanged: Boolean(body.apiKeys),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const integrations = mediaStoragePatch
      ? mergeMediaStorageIntegrations(beforeSettings.integrations, body.integrations)
      : normalizeInfrastructureIntegrations(body.integrations);
    const settings = updateAdminSettings({
      ...body,
      ...(deliveryMode ? { deliveryMode } : {}),
      ...(integrations ? { integrations } : {}),
    });
    await recordAdminAudit({
      entity: 'settings',
      entityId: 'platform',
      action: 'settings.update',
      before: sanitizeSettingsAuditSnapshot(beforeSettings),
      after: sanitizeSettingsAuditSnapshot(settings),
      metadata: {
        changedKeys: Object.keys(body).filter((key) => key !== 'apiKeys'),
        apiKeysChanged: Boolean(body.apiKeys),
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...settings,
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  try {
    const body = await parseJsonBody(request);
    const mediaStorageCheck = isMediaStorageInfrastructureCheck(body);
    const mediaStorageProvisioningProbe = body.action === 'media-storage-provisioning-probe';
    const keyRegeneration = body.action === 'regenerate-api-keys';
    const access = requireAdminAccess(request, requestId, {
      permission: mediaStorageCheck || mediaStorageProvisioningProbe
        ? 'media.configure'
        : keyRegeneration
          ? 'settings.manageKeys'
          : 'settings.configure',
    });
    if (access instanceof NextResponse) {
      return access;
    }

    if (mediaStorageProvisioningProbe) {
      const result = await runMediaStorageProvisioningProbe(requestId);
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'media-storage',
        action: 'settings.media_storage.provisioning_probe',
        metadata: {
          provider: result.provider,
          status: result.status,
          probePath: result.probePath,
          failedChecks: result.checks.filter((check) => !check.ready).map((check) => check.label),
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: result,
      });
    }

    if (body.action === 'validate-infrastructure') {
      const currentSettings = !shouldUseDemoStoreFallback()
        ? toAdminSettings(await (await getRequiredDatabaseRepositories()).settings.get())
        : {
          ...getAdminSettings(),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        };
      const normalizedIntegrations = mediaStorageCheck
        ? mergeMediaStorageIntegrations(currentSettings.integrations, body.integrations)
        : normalizeInfrastructureIntegrations(body.integrations);
      const integrations = normalizedIntegrations || parseJsonObject(body.integrations) || currentSettings.integrations || {};
      const deliveryMode = body.deliveryMode === undefined
        ? normalizeDeliveryMode(currentSettings.deliveryMode)
        : normalizeDeliveryMode(body.deliveryMode);

      if (!deliveryMode) {
        return errorResponse(
          400,
          'VALIDATION_ERROR',
          'Delivery mode must be managed-hosting or custom-frontend',
          requestId,
        );
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          diagnostics: buildInfrastructureDiagnostics({
            deliveryMode,
            integrations,
            runtimeDatabase: currentSettings.runtimeDatabase,
            runtimeStorage: currentSettings.runtimeStorage,
            runtimeSupabase: currentSettings.runtimeSupabase,
            runtimeVercel: currentSettings.runtimeVercel,
          }),
          generatedAt: new Date().toISOString(),
        },
      });
    }

    if (body.action !== 'regenerate-api-keys') {
      return errorResponse(400, 'VALIDATION_ERROR', 'Unsupported settings action', requestId);
    }

    const keyScope = body.scope === 'public' || body.scope === 'admin' ? body.scope : 'all';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const beforeSettings = await repositories.settings.get();
      const settings = (await repositories.settings.update({
        rotatePublicKey: keyScope === 'all' || keyScope === 'public',
        rotateSecretKey: keyScope === 'all' || keyScope === 'admin',
      })).item;
      await recordAdminAudit({
        repositories,
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.api_keys.regenerate',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          scope: keyScope,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const settings = regenerateAdminApiKeys(keyScope);
    await recordAdminAudit({
      entity: 'settings',
      entityId: 'platform',
      action: 'settings.api_keys.regenerate',
      before: sanitizeSettingsAuditSnapshot(beforeSettings),
      after: sanitizeSettingsAuditSnapshot(settings),
      metadata: {
        scope: keyScope,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...settings,
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeSupabase: getSupabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
          runtimeVercel: getVercelRuntimeSummary(),
        },
      },
    });
  } catch (error) {
    console.error('Admin settings action API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
