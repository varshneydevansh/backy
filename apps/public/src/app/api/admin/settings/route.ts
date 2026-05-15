/**
 * Admin platform settings endpoint.
 *
 * GET   /api/admin/settings
 * PATCH /api/admin/settings
 * POST  /api/admin/settings with { action: "regenerate-api-keys" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { listAdminSessionPermissionOverrides } from '@/lib/admin-auth/sessionStore';
import { requireAdminAccess, type AdminAccessContext } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { buildUserPermissionMatrix } from '@/lib/adminPermissions';
import { getAdminSettings, listAdminUserPermissionOverrides, regenerateAdminApiKeys, updateAdminSettings } from '@/lib/backyStore';
import { getMediaStorageAdapter, getMediaStorageConfigSummary, resolveMediaStorageConfig } from '@/lib/mediaStorage';
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

const canExposeAdminApiKey = (access: AdminAccessContext) => {
  if (access.type !== 'session' || !access.session) return false;

  const sessionOverrides = listAdminSessionPermissionOverrides(access.session.token, access.session.user.id);
  const overrides = sessionOverrides !== null
    ? sessionOverrides
    : listAdminUserPermissionOverrides(access.session.user.id);
  const matrix = buildUserPermissionMatrix(access.session.user, overrides);
  return Boolean(matrix.groups
    .flatMap((group) => group.permissions)
    .find((permission) => permission.key === 'settings.manageKeys')?.allowed);
};

type AdminSettingsSource = BackySettings | ReturnType<typeof getAdminSettings>;

const settingsApiKeys = (settings: AdminSettingsSource) => {
  const apiKeys = settings.apiKeys as {
    publicKey?: string;
    publicApiKey?: string;
    secretKeyId?: string;
    adminApiKey?: string;
  };

  return {
    publicApiKey: apiKeys.publicKey || apiKeys.publicApiKey || '',
    adminApiKey: apiKeys.secretKeyId || apiKeys.adminApiKey || '',
  };
};

const keyFingerprint = (value: string | undefined): string | null => (
  value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null
);

const keyHash = (value: string): string => createHash('sha256').update(value).digest('hex');

const createAdminServiceApiKey = (): string => (
  `sk_srv_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 16)}`
);

const normalizeServiceKeyGrants = (value: unknown): BackyJsonObject[] => (
  Array.isArray(value)
    ? value
      .filter((entry): entry is BackyJsonObject => (
        entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
      .map((entry) => {
        const revokedAt = stringValue(entry.revokedAt) || null;
        return {
          id: stringValue(entry.id) || `key_service_${randomUUID().slice(0, 8)}`,
          label: stringValue(entry.label) || 'Server API key',
          keyPrefix: stringValue(entry.keyPrefix) || 'sk_srv_',
          keyFingerprint: stringValue(entry.keyFingerprint) || null,
          keyHash: stringValue(entry.keyHash) || null,
          permissionScope: stringValue(entry.permissionScope) || 'non-owner-admin',
          createdAt: stringValue(entry.createdAt) || new Date().toISOString(),
          createdBy: stringValue(entry.createdBy) || null,
          requestId: stringValue(entry.requestId) || null,
          lastUsedAt: stringValue(entry.lastUsedAt) || null,
          revokedAt,
          revokedBy: stringValue(entry.revokedBy) || null,
          revokedRequestId: stringValue(entry.revokedRequestId) || null,
          status: revokedAt || entry.status === 'revoked' ? 'revoked' : 'active',
        };
      })
      .slice(0, 50)
    : []
);

const sanitizeServiceKeyGrant = (entry: BackyJsonObject): BackyJsonObject => {
  const {
    keyHash: _keyHash,
    ...safeEntry
  } = entry;
  return safeEntry;
};

const sanitizeAuthForResponse = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }

  const {
    passwordResetTokens: _passwordResetTokens,
    inviteTokens: _inviteTokens,
    ...auth
  } = input;

  if (!auth) {
    return undefined;
  }

  return {
    ...auth,
    apiKeyServiceKeys: normalizeServiceKeyGrants(auth.apiKeyServiceKeys).map(sanitizeServiceKeyGrant),
  };
};

const normalizeRotationHistory = (value: unknown): BackyJsonObject[] => (
  Array.isArray(value)
    ? value
      .filter((entry): entry is BackyJsonObject => (
        entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
      .map((entry) => ({
        id: stringValue(entry.id) || `key_rotation_${randomUUID().slice(0, 8)}`,
        scope: entry.scope === 'public' || entry.scope === 'admin' ? entry.scope : 'all',
        rotatedAt: stringValue(entry.rotatedAt) || new Date().toISOString(),
        actorId: stringValue(entry.actorId) || null,
        requestId: stringValue(entry.requestId) || null,
        publicKeyChanged: entry.publicKeyChanged === true,
        adminKeyChanged: entry.adminKeyChanged === true,
        previousPublicKeyFingerprint: stringValue(entry.previousPublicKeyFingerprint) || null,
        newPublicKeyFingerprint: stringValue(entry.newPublicKeyFingerprint) || null,
        previousAdminKeyFingerprint: stringValue(entry.previousAdminKeyFingerprint) || null,
        newAdminKeyFingerprint: stringValue(entry.newAdminKeyFingerprint) || null,
      }))
      .slice(0, 20)
    : []
);

const appendRotationHistory = (
  auth: BackyJsonObject | undefined,
  entry: BackyJsonObject,
): BackyJsonObject => ({
  ...(auth || {}),
  apiKeyRotationHistory: [
    entry,
    ...normalizeRotationHistory(auth?.apiKeyRotationHistory),
  ].slice(0, 20),
});

const normalizeRevocationHistory = (value: unknown): BackyJsonObject[] => (
  Array.isArray(value)
    ? value
      .filter((entry): entry is BackyJsonObject => (
        entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
      .map((entry) => ({
        id: stringValue(entry.id) || `key_revocation_${randomUUID().slice(0, 8)}`,
        scope: entry.scope === 'public' || entry.scope === 'admin' ? entry.scope : 'all',
        keyType: entry.keyType === 'admin' ? 'admin' : 'public',
        revokedAt: stringValue(entry.revokedAt) || new Date().toISOString(),
        actorId: stringValue(entry.actorId) || null,
        requestId: stringValue(entry.requestId) || null,
        reason: entry.reason === 'manual' || entry.reason === 'replaced' ? entry.reason : 'rotated',
        revokedKeyFingerprint: stringValue(entry.revokedKeyFingerprint) || null,
        replacementKeyFingerprint: stringValue(entry.replacementKeyFingerprint) || null,
      }))
      .slice(0, 40)
    : []
);

const appendRevocationHistory = (
  auth: BackyJsonObject | undefined,
  entries: BackyJsonObject[],
): BackyJsonObject => ({
  ...(auth || {}),
  apiKeyRevocationHistory: [
    ...entries,
    ...normalizeRevocationHistory(auth?.apiKeyRevocationHistory),
  ].slice(0, 40),
});

const buildRotationHistoryEntry = ({
  scope,
  beforeSettings,
  afterSettings,
  access,
  requestId,
}: {
  scope: 'all' | 'public' | 'admin';
  beforeSettings: AdminSettingsSource;
  afterSettings: AdminSettingsSource;
  access: AdminAccessContext;
  requestId: string;
}): BackyJsonObject => {
  const before = settingsApiKeys(beforeSettings);
  const after = settingsApiKeys(afterSettings);

  return {
    id: `key_rotation_${randomUUID().slice(0, 8)}`,
    scope,
    rotatedAt: new Date().toISOString(),
    actorId: access.session?.user.id || null,
    requestId,
    publicKeyChanged: before.publicApiKey !== after.publicApiKey,
    adminKeyChanged: before.adminApiKey !== after.adminApiKey,
    previousPublicKeyFingerprint: keyFingerprint(before.publicApiKey),
    newPublicKeyFingerprint: keyFingerprint(after.publicApiKey),
    previousAdminKeyFingerprint: keyFingerprint(before.adminApiKey),
    newAdminKeyFingerprint: keyFingerprint(after.adminApiKey),
  };
};

const buildRevocationHistoryEntries = ({
  scope,
  beforeSettings,
  afterSettings,
  access,
  requestId,
}: {
  scope: 'all' | 'public' | 'admin';
  beforeSettings: AdminSettingsSource;
  afterSettings: AdminSettingsSource;
  access: AdminAccessContext;
  requestId: string;
}): BackyJsonObject[] => {
  const before = settingsApiKeys(beforeSettings);
  const after = settingsApiKeys(afterSettings);
  const revokedAt = new Date().toISOString();
  const actorId = access.session?.user.id || null;
  const entries: BackyJsonObject[] = [];

  if (before.publicApiKey !== after.publicApiKey) {
    entries.push({
      id: `key_revocation_${randomUUID().slice(0, 8)}`,
      scope,
      keyType: 'public',
      revokedAt,
      actorId,
      requestId,
      reason: 'rotated',
      revokedKeyFingerprint: keyFingerprint(before.publicApiKey),
      replacementKeyFingerprint: keyFingerprint(after.publicApiKey),
    });
  }

  if (before.adminApiKey !== after.adminApiKey) {
    entries.push({
      id: `key_revocation_${randomUUID().slice(0, 8)}`,
      scope,
      keyType: 'admin',
      revokedAt,
      actorId,
      requestId,
      reason: 'rotated',
      revokedKeyFingerprint: keyFingerprint(before.adminApiKey),
      replacementKeyFingerprint: keyFingerprint(after.adminApiKey),
    });
  }

  return entries;
};

const toAdminSettings = (settings: AdminSettingsSource, options: { includeAdminApiKey?: boolean } = {}) => {
  const apiKeys = settingsApiKeys(settings);

  return {
    deliveryMode: settings.deliveryMode === 'custom-frontend' ? 'custom-frontend' : 'managed-hosting',
    apiKeys: {
      publicApiKey: apiKeys.publicApiKey,
      adminApiKey: options.includeAdminApiKey ? apiKeys.adminApiKey : '',
    },
    storage: 'storage' in settings ? settings.storage || {} : {},
    runtimeStorage: getMediaStorageConfigSummary(),
    auth: sanitizeAuthForResponse(settings.auth) || {},
    integrations: settings.integrations || {},
    runtimeDatabase: getDatabaseRuntimeSummary(),
    runtimeSupabase: getSupabaseRuntimeSummary(),
    runtimeMediaScanner: getMediaScannerRuntimeSummary(),
    runtimeVercel: getVercelRuntimeSummary(),
    updatedAt: settings.updatedAt,
  };
};

const parseJsonObject = (value: unknown): BackyJsonObject | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as BackyJsonObject : undefined
);

const normalizeAdminAuthSettings = (value: unknown): BackyJsonObject | undefined => {
  const input = parseJsonObject(value);
  if (!input) {
    return undefined;
  }
  const {
    passwordResetTokens: _passwordResetTokens,
    inviteTokens: _inviteTokens,
    apiKeyServiceKeys: _apiKeyServiceKeys,
    ...safeInput
  } = input;

  return {
    ...safeInput,
    requireTwoFactor: false,
  };
};

const normalizeNotificationIntegrations = (value: unknown): BackyJsonObject | undefined => {
  const notifications = parseJsonObject(value);
  if (!notifications) {
    return undefined;
  }

  const email = parseJsonObject(notifications.email) || {};
  const inApp = parseJsonObject(notifications.inApp) || {};

  return {
    ...notifications,
    email: {
      ...email,
      newUser: false,
      pagePublished: false,
      systemUpdates: false,
    },
    inApp: {
      ...inApp,
      mentions: false,
    },
    digestFrequency: notifications.digestFrequency === 'off' ? 'off' : 'instant',
  };
};

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
  const notifications = normalizeNotificationIntegrations(input.notifications);

  return {
    ...input,
    ...(notifications ? { notifications } : {}),
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
      maxFileSizeMb: Math.min(Math.max(numberValue(storage.maxFileSizeMb, 25), 1), 2048),
      workspaceStorageLimitGb: Math.min(Math.max(numberValue(storage.workspaceStorageLimitGb, 10), 1), 102400),
      warningThresholdPercent: Math.min(Math.max(numberValue(storage.warningThresholdPercent, 80), 50), 100),
      allowedFileTypes: stringValue(storage.allowedFileTypes),
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
  if (
    bodyKeys.length === 0 ||
    !bodyKeys.includes('integrations') ||
    bodyKeys.some((key) => key !== 'integrations' && key !== 'deliveryMode')
  ) {
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

interface StorageProvisioningAutomation {
  provider: string;
  action: 'create-or-verify-container';
  status: StorageProvisioningStatus;
  created: boolean;
  checked: boolean;
  target: string;
  detail: string;
}

const optionalRuntimeImport = async <TModule,>(specifier: string): Promise<TModule> => {
  const runtimeImport = new Function('specifier', 'return import(specifier)') as (value: string) => Promise<TModule>;
  return runtimeImport(specifier);
};

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

const runStorageContainerAutomation = async (): Promise<StorageProvisioningAutomation> => {
  const resolved = resolveMediaStorageConfig();
  const { config, summary } = resolved;
  const provider = summary.provider;
  const target = provider === 'local'
    ? summary.basePath || 'local uploads directory'
    : summary.bucket || 'storage bucket';

  if (!config) {
    return {
      provider,
      action: 'create-or-verify-container',
      status: 'blocked',
      created: false,
      checked: false,
      target,
      detail: summary.error || `Missing ${summary.missing.join(', ') || 'storage configuration'}.`,
    };
  }

  if (config.provider === 'local') {
    await mkdir(config.basePath, { recursive: true });
    return {
      provider,
      action: 'create-or-verify-container',
      status: 'ready',
      created: true,
      checked: true,
      target: config.basePath,
      detail: 'Local media storage directory is present and ready for file writes.',
    };
  }

  if (config.provider === 'supabase') {
    try {
      const { createClient } = await optionalRuntimeImport<{
        createClient: typeof import('@supabase/supabase-js').createClient;
      }>('@supabase/supabase-js');
      const supabase = createClient(config.url, config.key);
      const existing = await supabase.storage.getBucket(config.bucket);
      if (!existing.error) {
        return {
          provider,
          action: 'create-or-verify-container',
          status: 'ready',
          created: false,
          checked: true,
          target: config.bucket,
          detail: `Supabase Storage bucket "${config.bucket}" already exists.`,
        };
      }

      const created = await supabase.storage.createBucket(config.bucket, {
        public: false,
        fileSizeLimit: undefined,
      });
      if (created.error) {
        return {
          provider,
          action: 'create-or-verify-container',
          status: 'blocked',
          created: false,
          checked: true,
          target: config.bucket,
          detail: `Supabase bucket automation failed: ${created.error.message}`,
        };
      }

      return {
        provider,
        action: 'create-or-verify-container',
        status: 'ready',
        created: true,
        checked: true,
        target: config.bucket,
        detail: `Supabase Storage bucket "${config.bucket}" was created.`,
      };
    } catch (error) {
      return {
        provider,
        action: 'create-or-verify-container',
        status: 'blocked',
        created: false,
        checked: false,
        target: config.bucket,
        detail: error instanceof Error ? error.message : 'Supabase bucket automation failed.',
      };
    }
  }

  try {
    const s3Module = await optionalRuntimeImport<{
      S3Client: new (input: Record<string, unknown>) => { send: (command: unknown) => Promise<unknown> };
      CreateBucketCommand: new (input: Record<string, unknown>) => unknown;
      HeadBucketCommand: new (input: Record<string, unknown>) => unknown;
    }>('@aws-sdk/client-s3');
    const { S3Client, CreateBucketCommand, HeadBucketCommand } = s3Module;
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });

    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return {
        provider,
        action: 'create-or-verify-container',
        status: 'ready',
        created: false,
        checked: true,
        target: config.bucket,
        detail: `S3-compatible bucket "${config.bucket}" already exists and is accessible.`,
      };
    } catch {
      await client.send(new CreateBucketCommand({
        Bucket: config.bucket,
        ...(config.region && config.region !== 'us-east-1'
          ? { CreateBucketConfiguration: { LocationConstraint: config.region } }
          : {}),
      }));
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return {
        provider,
        action: 'create-or-verify-container',
        status: 'ready',
        created: true,
        checked: true,
        target: config.bucket,
        detail: `S3-compatible bucket "${config.bucket}" was created and verified.`,
      };
    }
  } catch (error) {
    return {
      provider,
      action: 'create-or-verify-container',
      status: 'blocked',
      created: false,
      checked: false,
      target: config.bucket,
      detail: error instanceof Error ? error.message : 'S3 bucket automation failed.',
    };
  }
};

const runMediaStorageProvisioningProbe = async (requestId: string) => {
  const summary = getMediaStorageConfigSummary();
  const automation = await runStorageContainerAutomation();
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
      automation,
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
    status: blocked || automation.status === 'blocked' ? 'blocked' as StorageProvisioningStatus : 'ready' as StorageProvisioningStatus,
    summary: blocked
      ? 'Storage provisioning probe found an operation that needs attention.'
      : automation.status === 'blocked'
        ? 'Storage container automation needs attention before accepting production uploads.'
        : 'Storage container is provisioned and the bucket/path accepts upload, readback, metadata, listing, and cleanup operations.',
    runtimeStorage: summary,
    probePath,
    automation,
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
    auth: sanitizeAuthForResponse(snapshot.auth) || {},
  };
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'settings.view' });
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
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        settings: {
          ...toAdminSettings(getAdminSettings(), { includeAdminApiKey: canExposeAdminApiKey(access) }),
          runtimeStorage: getMediaStorageConfigSummary(),
          runtimeDatabase: getDatabaseRuntimeSummary(),
          runtimeMediaScanner: getMediaScannerRuntimeSummary(),
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
  const access = await requireAdminAccess(request, requestId, {
    permission: mediaStoragePatch ? 'media.configure' : 'settings.configure',
  });
  if (access instanceof NextResponse) {
    return access;
  }
  if (body.apiKeys !== undefined) {
    const keyAccess = await requireAdminAccess(request, requestId, {
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
      const auth = normalizeAdminAuthSettings(body.auth);
      const mergedAuth = auth
        ? {
            ...(beforeSettings.auth || {}),
            ...auth,
          }
        : undefined;
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
        ...(mergedAuth ? { auth: mergedAuth } : {}),
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
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const auth = normalizeAdminAuthSettings(body.auth);
    const sanitizedBody = {
      ...body,
      ...(body.auth !== undefined && auth ? { auth } : {}),
    };
    if (body.auth !== undefined && !auth) {
      delete sanitizedBody.auth;
    }
    const integrations = mediaStoragePatch
      ? mergeMediaStorageIntegrations(beforeSettings.integrations, body.integrations)
      : normalizeInfrastructureIntegrations(body.integrations);
    const settings = updateAdminSettings({
      ...sanitizedBody,
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
          ...toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
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
    const keyManagementAction = body.action === 'regenerate-api-keys' ||
      body.action === 'issue-admin-api-key' ||
      body.action === 'revoke-admin-api-key';
    const access = await requireAdminAccess(request, requestId, {
      permission: mediaStorageCheck || mediaStorageProvisioningProbe
        ? 'media.configure'
        : keyManagementAction
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

    if (body.action === 'issue-admin-api-key') {
      const label = stringValue(body.label).trim();
      if (!label || label.length > 80) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Service key label is required and must be 80 characters or less.', requestId);
      }

      const issuedKey = createAdminServiceApiKey();
      const now = new Date().toISOString();
      const grant: BackyJsonObject = {
        id: `key_service_${randomUUID().slice(0, 8)}`,
        label,
        keyPrefix: `${issuedKey.slice(0, 10)}...`,
        keyFingerprint: keyFingerprint(issuedKey),
        keyHash: keyHash(issuedKey),
        permissionScope: 'non-owner-admin',
        createdAt: now,
        createdBy: access.session?.user.id || null,
        requestId,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        revokedRequestId: null,
        status: 'active',
      };

      if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const beforeSettings = await repositories.settings.get();
        const settings = (await repositories.settings.update({
          auth: {
            ...(beforeSettings.auth || {}),
            apiKeyServiceKeys: [
              grant,
              ...normalizeServiceKeyGrants(beforeSettings.auth?.apiKeyServiceKeys),
            ].slice(0, 50),
          },
        })).item;
        await recordAdminAudit({
          repositories,
          entity: 'settings',
          entityId: 'platform',
          action: 'settings.api_keys.issue',
          before: sanitizeSettingsAuditSnapshot(beforeSettings),
          after: sanitizeSettingsAuditSnapshot(settings),
          metadata: {
            keyId: grant.id,
            label,
            keyFingerprint: grant.keyFingerprint,
          },
          requestId,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
            issuedKey: {
              id: grant.id,
              label,
              adminApiKey: issuedKey,
              keyFingerprint: grant.keyFingerprint,
              keyPrefix: grant.keyPrefix,
            },
          },
        });
      }

      const beforeSettings = getAdminSettings();
      const settings = updateAdminSettings({
        auth: {
          ...(beforeSettings.auth || {}),
          apiKeyServiceKeys: [
            grant,
            ...normalizeServiceKeyGrants(beforeSettings.auth?.apiKeyServiceKeys),
          ].slice(0, 50),
        },
      });
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.api_keys.issue',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          keyId: grant.id,
          label,
          keyFingerprint: grant.keyFingerprint,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          issuedKey: {
            id: grant.id,
            label,
            adminApiKey: issuedKey,
            keyFingerprint: grant.keyFingerprint,
            keyPrefix: grant.keyPrefix,
          },
        },
      });
    }

    if (body.action === 'revoke-admin-api-key') {
      const keyId = stringValue(body.keyId).trim();
      if (!keyId) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Service key id is required.', requestId);
      }

      const revokeGrant = async (currentSettings: AdminSettingsSource) => {
        const grants = normalizeServiceKeyGrants(currentSettings.auth?.apiKeyServiceKeys);
        const target = grants.find((grant) => grant.id === keyId);
        if (!target) {
          return { error: errorResponse(404, 'API_KEY_NOT_FOUND', 'Service key was not found.', requestId) };
        }
        if (target.revokedAt || target.status === 'revoked') {
          return { error: errorResponse(409, 'API_KEY_ALREADY_REVOKED', 'Service key is already revoked.', requestId) };
        }

        const now = new Date().toISOString();
        const nextGrants = grants.map((grant) => (
          grant.id === keyId
            ? {
                ...grant,
                revokedAt: now,
                revokedBy: access.session?.user.id || null,
                revokedRequestId: requestId,
                status: 'revoked',
              }
            : grant
        ));
        const revocationEntry: BackyJsonObject = {
          id: `key_revocation_${randomUUID().slice(0, 8)}`,
          scope: 'admin',
          keyType: 'admin',
          revokedAt: now,
          actorId: access.session?.user.id || null,
          requestId,
          reason: 'manual',
          revokedKeyFingerprint: stringValue(target.keyFingerprint) || null,
          replacementKeyFingerprint: null,
        };
        return {
          target,
          auth: appendRevocationHistory(
            {
              ...(currentSettings.auth || {}),
              apiKeyServiceKeys: nextGrants,
            },
            [revocationEntry],
          ),
        };
      };

      if (!shouldUseDemoStoreFallback()) {
        const repositories = await getRequiredDatabaseRepositories();
        const beforeSettings = await repositories.settings.get();
        const result = await revokeGrant(beforeSettings);
        if (result.error) return result.error;
        const settings = (await repositories.settings.update({ auth: result.auth })).item;
        await recordAdminAudit({
          repositories,
          entity: 'settings',
          entityId: 'platform',
          action: 'settings.api_keys.revoke',
          before: sanitizeSettingsAuditSnapshot(beforeSettings),
          after: sanitizeSettingsAuditSnapshot(settings),
          metadata: {
            keyId,
            label: result.target?.label,
            keyFingerprint: result.target?.keyFingerprint,
          },
          requestId,
        });

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
          },
        });
      }

      const beforeSettings = getAdminSettings();
      const result = await revokeGrant(beforeSettings);
      if (result.error) return result.error;
      const settings = updateAdminSettings({ auth: result.auth });
      await recordAdminAudit({
        entity: 'settings',
        entityId: 'platform',
        action: 'settings.api_keys.revoke',
        before: sanitizeSettingsAuditSnapshot(beforeSettings),
        after: sanitizeSettingsAuditSnapshot(settings),
        metadata: {
          keyId,
          label: result.target?.label,
          keyFingerprint: result.target?.keyFingerprint,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    if (body.action === 'validate-infrastructure') {
      const currentSettings = !shouldUseDemoStoreFallback()
        ? toAdminSettings(await (await getRequiredDatabaseRepositories()).settings.get(), { includeAdminApiKey: canExposeAdminApiKey(access) })
        : {
          ...toAdminSettings(getAdminSettings(), { includeAdminApiKey: canExposeAdminApiKey(access) }),
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
      const rotatedSettings = (await repositories.settings.update({
        rotatePublicKey: keyScope === 'all' || keyScope === 'public',
        rotateSecretKey: keyScope === 'all' || keyScope === 'admin',
      })).item;
      const rotationEntry = buildRotationHistoryEntry({
        scope: keyScope,
        beforeSettings,
        afterSettings: rotatedSettings,
        access,
        requestId,
      });
      const revocationEntries = buildRevocationHistoryEntries({
        scope: keyScope,
        beforeSettings,
        afterSettings: rotatedSettings,
        access,
        requestId,
      });
      const authWithRotation = appendRotationHistory(rotatedSettings.auth, rotationEntry);
      const settings = (await repositories.settings.update({
        auth: appendRevocationHistory(authWithRotation, revocationEntries),
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
          settings: toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
        },
      });
    }

    const beforeSettings = getAdminSettings();
    const settings = regenerateAdminApiKeys(keyScope, {
      actorId: access.session?.user.id || null,
      requestId,
    });
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
          ...toAdminSettings(settings, { includeAdminApiKey: canExposeAdminApiKey(access) }),
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
